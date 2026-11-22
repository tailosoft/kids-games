// The shared loop behind every game: a card appears, the child says it, the app
// answers, a bulb lights up. A game file supplies the cards and the judging;
// everything on this page — mic, voice, progress, celebration — is here.
//
// A game spec:
//   id         string
//   promptKey(round, lang) -> i18n key for the line above the card
//   makeRound(cfg, lang, previous) -> round object
//   glyph(round, cfg) -> array of strings, one per tile on the card
//   ttsText(round, lang) -> what "Hear it" pronounces
//   check(transcripts, round, lang) -> boolean
//   decoys(round, cfg, lang) -> array of wrong display strings for tap mode
//   domain     string, the bucket this game's timings are averaged in
//   keys(round) -> mastery keys for the card: exact item first, families after
//
// A listening game sets `listen: true`: the app says the card and the child
// picks it from a list, so there is no mic and no voice mode. Such a game
// leaves `glyph()` empty (the card becomes a replay button) and names the right
// answer through `answer()`, with `optionCount(cfg)` buttons to choose from.
import { t } from './i18n.js';
import * as settings from './settings.js';
import { createListener, recognitionSupported, speak, stopSpeaking, hasVoice, voiceHelp } from './speech.js';
import * as sfx from './sound.js';
import { burst } from './confetti.js';
import * as mastery from './mastery.js';
import { h, icon, clear, shuffle } from './dom.js';

export function createPromptGame(spec) {
  return function mount(root) {
    const cfg = settings.get();
    const lang = settings.lang();
    const goal = cfg.goal;

    let mode = cfg.mode;
    let round = null;
    let done = 0;
    let busy = false;      // a card is being celebrated or announced
    let shownAt = 0;       // when the current card went up
    let misses = 0;        // wrong attempts on the current card
    let destroyed = false;
    let micWanted = false;
    let stopConfetti = null;
    const timers = new Set();

    const listen = !!spec.listen;
    if (listen || !recognitionSupported()) mode = 'tap';

    /* ---------- chrome ---------- */

    const marquee = h('div', { class: 'marquee', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal) });
    const modeBtn = h('button', { class: 'icon-btn', onClick: toggleMode });
    const top = h('header', { class: 'stage__top' }, [
      h('button', {
        class: 'icon-btn',
        'data-flip': true,
        'aria-label': t('win.menu', lang),
        onClick: () => { location.hash = '#/'; },
      }, [icon('back')]),
      marquee,
      modeBtn,
    ]);

    const replayBtn = listen ? h('button', {
      class: 'replay',
      type: 'button',
      onClick: () => { sfx.unlock(); hear(); },
    }, [icon('speaker'), h('span', { class: 'replay__label' })]) : null;

    const eyebrow = h('p', { class: 'eyebrow' });
    const cardTiles = h('div', { class: 'card', 'aria-live': 'polite' });
    const verdict = h('p', { class: 'verdict', 'aria-live': 'polite' });
    const cone = h('div', { class: 'lightcone' });
    const field = h('div', { class: 'field' }, [eyebrow, cardTiles, verdict, cone]);

    const noteBox = h('div', { class: 'notes' });
    const consoleRow = h('div', { class: 'console__row' });
    const micLabel = h('p', { class: 'mic__label' });
    const consoleBox = h('footer', { class: 'console' }, [consoleRow, micLabel]);

    const stage = h('div', { class: 'stage' }, [top, field, noteBox, consoleBox]);

    // One button, three gestures:
    //   short press          -> latch the mic on, hands-free until it is pressed again
    //   short press while on -> stop and judge what was just said
    //   press and hold       -> talk while held, judged on release
    // Pointer events cover touch, mouse and pen; the keyboard mirrors them so a
    // desktop gets the same two gestures from Space or Enter.
    const HOLD_MS = 350;
    let pressAt = 0;
    let pressWasOn = false;
    let pressing = false;

    function micDown(event) {
      if (event && event.pointerId != null && micBtn.setPointerCapture) {
        try { micBtn.setPointerCapture(event.pointerId); } catch (_) { /* fine without */ }
      }
      if (event && event.preventDefault) event.preventDefault();
      if (pressing) return;
      sfx.unlock();
      pressing = true;
      pressAt = performance.now();
      pressWasOn = micWanted;
      if (!micWanted) startMic();
    }

    function micUp() {
      if (!pressing) return;
      pressing = false;
      const wasHeld = performance.now() - pressAt >= HOLD_MS;
      // Held: release ends the turn. Short press while already on: stop and judge.
      // Short press while off: stay latched on.
      if (wasHeld || pressWasOn) stopMic({ graceful: true });
    }

    const micBtn = h('button', {
      class: 'mic',
      type: 'button',
      'aria-pressed': 'false',
      onPointerDown: micDown,
      onPointerUp: micUp,
      onPointerCancel: micUp,
      onKeyDown: (event) => {
        if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
        event.preventDefault();
        micDown(null);
      },
      onKeyUp: (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        micUp();
      },
    }, [
      icon('mic'),
      h('span', { class: 'mic__ring' }),
      h('span', { class: 'mic__ring' }),
      h('span', { class: 'mic__ring' }),
    ]);

    const hearBtn = h('button', { class: 'ghost', 'data-hot': true, onClick: hear }, [
      icon('speaker'),
      h('span', { text: t('act.hear', lang) }),
    ]);
    const skipBtn = h('button', { class: 'ghost', 'data-flip': true, onClick: skip }, [
      icon('skip'),
      h('span', { text: t('act.skip', lang) }),
    ]);

    /* ---------- listening ---------- */

    const listener = (!listen && recognitionSupported()) ? createListener({
      lang,
      onPartial: (text) => {
        if (busy || !micWanted) return;
        verdict.removeAttribute('data-tone');
        verdict.textContent = text;
      },
      onFinal: (transcripts) => { clear(noteBox); judge(transcripts); },
      onState: paintMic,
      onError: micTrouble,
    }) : null;

    function startMic() {
      if (!listener || mode !== 'voice') return;
      if (!micWanted) showVerdict(null, '');   // drop any stale hypothesis
      micWanted = true;
      listener.start();
      paintMic();
      if (!cardTiles.dataset.state) cardTiles.dataset.state = 'lit';
    }

    function stopMic(options) {
      micWanted = false;
      pressing = false;
      // Graceful: let the engine hand back the words spoken just before we
      // stopped. Immediate: we are about to play a sound or change the card.
      if (listener) {
        if (options && options.graceful) listener.finish();
        else listener.stop();
      }
      paintMic();
      if (cardTiles.dataset.state === 'lit') cardTiles.dataset.state = '';
    }

    function paintMic() {
      const on = micWanted;
      micBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      micBtn.setAttribute('aria-label', t(on ? 'mic.listening' : 'mic.idle', lang));
      const engine = listener ? listener.state : 'idle';
      let key = 'mic.idle';
      if (on && engine === 'hearing') key = 'mic.hearing';
      else if (on && engine === 'thinking') key = 'mic.thinking';
      else if (on) key = 'mic.listening';
      micLabel.textContent = t(key, lang);
      if (on && engine === 'hearing') micBtn.setAttribute('data-speech', '');
      else micBtn.removeAttribute('data-speech');
      if (on) cone.setAttribute('data-on', ''); else cone.removeAttribute('data-on');
      if (on && !cardTiles.dataset.state) cardTiles.dataset.state = 'lit';
    }

    function micTrouble(code) {
      if (code === 'silence') {
        if (!busy && micWanted) showVerdict(null, t('fb.silence', lang));
        return;
      }
      if (code === 'sleep') {
        // Nobody has said anything for a while: drop the mic rather than
        // listen to an empty room all afternoon.
        stopMic();
        return;
      }
      if (code === 'network') {
        // The speech service is unreachable; retrying in a loop would only
        // burn battery. Say so and hand the mic back to the child.
        note(t('mic.offline', lang));
        stopMic();
        return;
      }
      // denied / unsupported: voice is not coming back this session.
      note(t(code === 'denied' ? 'mic.denied' : 'mic.unsupported', lang));
      stopMic();
      setMode('tap');
    }

    function note(message, fix) {
      clear(noteBox);
      noteBox.append(h('p', { class: 'note', text: message },
        fix ? [h('span', { class: 'note__fix', text: fix })] : null));
    }

    /* ---------- judging ---------- */

    function judge(transcripts) {
      if (busy || destroyed) return;
      let correct = false;
      try {
        correct = spec.check(transcripts, round, lang);
      } catch (_) {
        correct = false;   // a judging slip must not look like "ignored"
      }
      if (correct) advance(true);
      else wrong(transcripts[0]);
    }

    function wrong(heard) {
      misses += 1;
      mastery.recordMiss(spec.keys(round));   // logged now, so walking away still counts
      sfx.wrong();
      cardTiles.dataset.state = 'wrong';
      showVerdict('wrong', t('fb.wrong', lang), heard ? t('fb.heard', lang) + ' “' + heard + '”' : '');
      after(520, () => {
        if (cardTiles.dataset.state === 'wrong') cardTiles.dataset.state = micWanted ? 'lit' : '';
      });
    }

    async function advance(scored) {
      if (busy) return;
      busy = true;
      let won = false;
      const wasListening = micWanted;
      try {
        stopMic();

        mastery.recordDone(spec.domain, spec.keys(round), {
          correct: !!scored,
          misses,
          ms: performance.now() - shownAt,
        });

        if (scored) {
          sfx.right();
          cardTiles.dataset.state = 'right';
          showVerdict('right', t('fb.right', lang));
          done += 1;
          renderProgress();
          await wait(820);
        } else {
          sfx.tick();
        }
        if (destroyed) return;

        if (done >= goal) {
          won = true;
          celebrate();
          return;
        }

        nextRound();
        if (cfg.autoHear || listen) await sayCard();
        if (destroyed) return;

        if (wasListening) startMic();
      } finally {
        // Whatever happened above, the card has to accept answers again —
        // a stuck flag would leave the mic hearing words and judging none.
        if (!won && !destroyed) busy = false;
      }
    }

    function skip() {
      if (busy) return;
      advance(false);
    }

    /** Pronounce the current card. Returns false if no voice could say it. */
    async function sayCard() {
      hearBtn.disabled = true;
      if (replayBtn) replayBtn.disabled = true;
      const spoken = await speak(spec.ttsText(round, lang), lang);
      const missing = !spoken && !hasVoice(lang);
      // A device with no voice for this language will not grow one mid-game, so
      // the button goes quiet instead of pretending. Anything else — a slow
      // engine that simply said nothing this time — leaves it alone.
      hearBtn.disabled = missing;
      if (replayBtn) replayBtn.disabled = missing;
      if (!destroyed && missing) {
        const help = voiceHelp(lang);
        note(help.message, help.fix);
      }
      return spoken;
    }

    async function hear() {
      if (destroyed) return;
      const wasListening = micWanted;
      stopMic();                       // never let the app hear its own voice
      await sayCard();
      if (destroyed || busy) return;
      if (wasListening) startMic();
    }

    /* ---------- cards ---------- */

    function nextRound() {
      round = spec.makeRound(cfg, lang, round);
      shownAt = performance.now();
      misses = 0;
      eyebrow.textContent = t(spec.promptKey(round, lang), lang);
      clear(cardTiles);
      if (listen) {
        cardTiles.append(replayBtn);
      } else {
        for (const glyph of spec.glyph(round, cfg)) {
          cardTiles.append(h('span', { class: 'card__glyph', text: glyph }));
        }
      }
      cardTiles.dataset.state = micWanted ? 'lit' : '';
      showVerdict(null, '');
      if (mode === 'tap') renderChoices();
    }

    function showVerdict(tone, text, detail) {
      clear(verdict);
      if (tone) verdict.setAttribute('data-tone', tone);
      else verdict.removeAttribute('data-tone');
      if (text) verdict.append(h('b', { text }));
      if (detail) verdict.append(h('small', { text: detail }));
    }

    function renderProgress() {
      clear(marquee);
      marquee.setAttribute('aria-valuenow', String(done));
      marquee.setAttribute('aria-label', done + ' / ' + goal);
      if (goal <= 15) {
        for (let i = 0; i < goal; i += 1) {
          marquee.append(h('span', {
            class: 'bulb',
            'data-on': i < done ? '' : false,
            'data-now': i === done ? '' : false,
          }));
        }
      } else {
        marquee.append(
          h('span', { class: 'bar' }, [
            h('span', { class: 'bar__fill', style: 'width:' + Math.round((done / goal) * 100) + '%' }),
          ]),
          h('span', { class: 'bar__count', text: settings.num(done) + '/' + settings.num(goal) }),
        );
      }
    }

    /* ---------- modes ---------- */

    function setMode(next) {
      mode = next;
      if (next === 'voice') clear(noteBox);
      settings.set({ mode: next });
      if (mode !== 'voice') stopMic();
      renderConsole();
      paintMode();
    }

    function toggleMode() {
      sfx.unlock();
      if (mode === 'voice' && !recognitionSupported()) return;
      setMode(mode === 'voice' ? 'tap' : 'voice');
    }

    function paintMode() {
      clear(modeBtn);
      const goingTo = mode === 'voice' ? 'act.tap' : 'act.voice';
      modeBtn.append(icon(mode === 'voice' ? 'hand' : 'mic'));
      modeBtn.setAttribute('aria-label', t(goingTo, lang));
      modeBtn.setAttribute('title', t(goingTo, lang));
    }

    function renderConsole() {
      clear(consoleRow);
      if (mode === 'voice') {
        micLabel.hidden = false;
        consoleRow.removeAttribute('data-tap');
        consoleRow.append(hearBtn, micBtn, skipBtn);
        paintMic();
      } else {
        micLabel.hidden = true;
        const choices = h('div', { class: 'choices' });
        consoleRow.append(choices);
        consoleRow.dataset.tap = '';
        renderChoices(choices);
      }
    }

    function renderChoices(target) {
      const box = target || consoleRow.querySelector('.choices');
      if (!box) return;
      clear(box);
      const count = Math.max(2, spec.optionCount ? spec.optionCount(cfg) : 4);
      box.style.setProperty('--cols', count <= 4 ? 2 : 3);
      const right = spec.answer
        ? spec.answer(round, cfg)
        : spec.glyph(round, cfg).join(' ');
      const wrongOnes = (spec.decoys(round, cfg, lang) || []).slice(0, count - 1);
      for (const option of shuffle([right].concat(wrongOnes))) {
        box.append(h('button', {
          class: 'choice',
          text: option,
          onClick: (event) => {
            if (busy) return;
            sfx.unlock();
            const button = event.currentTarget;
            if (option === right) {
              button.dataset.pick = 'right';
              advance(true);
            } else {
              button.dataset.pick = 'wrong';
              wrong(null);
              after(600, () => button.removeAttribute('data-pick'));
            }
          },
        }));
      }
    }

    /* ---------- celebration ---------- */

    function celebrate() {
      sfx.win();
      const canvas = h('canvas');
      const overlay = h('div', { class: 'win' }, [
        canvas,
        h('h2', { class: 'win__title', text: t('win.title', lang) }),
        h('p', { class: 'win__sub', text: t('win.sub', lang, { n: settings.num(goal) }) }),
        h('div', { class: 'win__acts' }, [
          h('button', {
            class: 'btn',
            text: t('win.again', lang),
            onClick: () => {
              if (stopConfetti) stopConfetti();
              overlay.remove();
              done = 0;
              busy = false;
              renderProgress();
              nextRound();
            },
          }),
          h('button', {
            class: 'btn',
            'data-variant': 'quiet',
            text: t('win.menu', lang),
            onClick: () => { location.hash = '#/'; },
          }),
        ]),
      ]);
      root.append(overlay);
      requestAnimationFrame(() => { stopConfetti = burst(canvas); });
      after(600, () => speak(t('win.title', lang), lang, { rate: 0.95, pitch: 1.2 }));
    }

    /* ---------- helpers ---------- */

    function after(ms, fn) {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
      return id;
    }

    function wait(ms) {
      return new Promise((resolve) => after(ms, resolve));
    }

    /* ---------- go ---------- */

    root.append(stage);
    if (listen) {
      // Keep its space so the progress bulbs stay centred.
      modeBtn.classList.add('is-spacer');
      modeBtn.setAttribute('aria-hidden', 'true');
      modeBtn.tabIndex = -1;
      cardTiles.classList.add('card--listen');
      replayBtn.setAttribute('aria-label', t('act.again', lang));
      replayBtn.querySelector('.replay__label').textContent = t('act.again', lang);
    }
    paintMode();
    renderProgress();
    nextRound();
    renderConsole();
    if (mode === 'tap' && !recognitionSupported()) note(t('mic.unsupported', lang));
    if (cfg.autoHear || listen) after(350, hear);

    return {
      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (stopConfetti) stopConfetti();
        if (listener) listener.destroy();
        stopSpeaking();
      },
    };
  };
}
