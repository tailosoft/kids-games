// Mic check — what the device hears, and what the engine makes of it.
//
// "It doesn't hear my child" has three very different causes, and from the
// game screen they look identical: the mic glows, the child talks, nothing
// happens. This screen separates them.
//
//   1. The microphone itself. A live level bar, straight off getUserMedia.
//      If this does not move while the child talks, no recogniser on earth
//      was going to help — it is a permission, a hardware mute, or another
//      app holding the mic.
//   2. The engine. The same listener the games use, with every callback it
//      makes written down. A session that starts and never opens, a stream of
//      `no-speech`, or words that arrive but say something else — each leaves
//      a different trace in the log.
//   3. Neither: it all works, and the answer was simply judged wrong. Then
//      the log shows the words, and they are the words to argue with.
//
// The two tests never run at once: on Android, a getUserMedia stream held open
// can keep the recogniser from opening its own, which would make the engine
// test fail for a reason the screen itself invented.
import { t, LOCALE } from './i18n.js';
import { h, icon, clear } from './dom.js';
import * as settings from './settings.js';
import { createListener, recognitionSupported } from './speech.js';

const LOG_MAX = 40;
const OPEN_MS = 8000;         // getUserMedia that takes longer has hung
const LEVEL_FLOOR = 0.04;     // below this is room noise, not a voice

function label(lang, key, fallback) {
  const text = t(key, lang);
  return text === key ? fallback : text;
}

async function micPermission() {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state;      // granted | denied | prompt
  } catch (_) {
    return 'unknown';         // Firefox and Safari do not expose it
  }
}

function standalone() {
  if (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) return true;
  return !!(typeof navigator !== 'undefined' && navigator.standalone);
}

export default function renderMicCheck(app) {
  const lang = settings.lang();
  let destroyed = false;

  /* ---------------- the log both tests write to ---------------- */

  const logBox = h('div', { class: 'log' });
  const started = Date.now();

  function log(what, detail) {
    if (destroyed) return;
    const at = ((Date.now() - started) / 1000).toFixed(1) + 's';
    logBox.prepend(h('p', { class: 'log__row', 'data-kind': what }, [
      h('span', { class: 'log__at', text: at }),
      h('span', { class: 'log__what', text: what }),
      detail ? h('span', { class: 'log__detail', text: String(detail) }) : null,
    ]));
    while (logBox.children.length > LOG_MAX) logBox.lastChild.remove();
  }

  /* ---------------- 1. does the device hear anything ---------------- */

  const bar = h('span', { class: 'meter__fill' });
  const meterNote = h('span', { class: 'row__hint', text: label(lang, 'check.level.idle', 'Not listening yet.') });
  let audio = null;        // { stream, context, analyser, data, frame }
  let peak = 0;

  function stopLevels() {
    if (!audio) return;
    cancelAnimationFrame(audio.frame);
    audio.stream.getTracks().forEach((track) => track.stop());
    if (audio.context.state !== 'closed') audio.context.close();
    audio = null;
    bar.style.width = '0%';
    levelBtn.textContent = label(lang, 'check.level.start', 'Start');
  }

  function paintLevel() {
    if (!audio || destroyed) return;
    audio.analyser.getByteTimeDomainData(audio.data);
    let sum = 0;
    for (let i = 0; i < audio.data.length; i += 1) {
      const sample = (audio.data[i] - 128) / 128;
      sum += sample * sample;
    }
    const level = Math.sqrt(sum / audio.data.length);
    if (level > peak) {
      peak = level;
      meterNote.textContent = level > LEVEL_FLOOR
        ? label(lang, 'check.level.yes', 'The microphone is working — keep going.')
        : label(lang, 'check.level.quiet', 'Something, but very quiet. Move closer.');
    }
    bar.style.width = Math.min(100, Math.round(level * 320)) + '%';
    audio.frame = requestAnimationFrame(paintLevel);
  }

  async function startLevels() {
    stopEngine();
    if (audio) {
      stopLevels();
      meterNote.textContent = label(lang, 'check.level.idle', 'Not listening yet.');
      return;
    }
    peak = 0;
    meterNote.textContent = label(lang, 'check.level.open', 'Opening the microphone…');
    try {
      // getUserMedia can hang rather than refuse — another app holding the
      // mic, a permission prompt that never painted. A test that sits on
      // "opening…" for ever tells a parent even less than the game did.
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), OPEN_MS)),
      ]);
      if (destroyed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      audio = { stream, context, analyser, data: new Uint8Array(analyser.fftSize), frame: 0 };
      levelBtn.textContent = label(lang, 'check.level.stop', 'Stop');
      meterNote.textContent = label(lang, 'check.level.say', 'Say something.');
      log('mic open', stream.getAudioTracks().map((track) => track.label).join(', ') || 'default');
      paintLevel();
    } catch (error) {
      const denied = error && error.name === 'NotAllowedError';
      meterNote.textContent = denied
        ? label(lang, 'check.level.denied', 'The microphone is blocked for this app.')
        : label(lang, 'check.level.failed', 'The microphone could not be opened.');
      log('mic failed', (error && (error.name || error.message)) || 'unknown');
    }
  }

  const levelBtn = h('button', {
    class: 'ghost',
    type: 'button',
    text: label(lang, 'check.level.start', 'Start'),
    onClick: startLevels,
  });

  /* ---------------- 2. what the engine makes of it ---------------- */

  const heardBox = h('p', { class: 'check__heard', text: '—' });
  let listener = null;

  function stopEngine() {
    if (!listener) return;
    listener.destroy();
    listener = null;
    engineBtn.textContent = label(lang, 'check.engine.start', 'Listen');
  }

  function startEngine() {
    stopLevels();
    if (listener) {
      stopEngine();
      log('listener stopped');
      return;
    }
    if (!recognitionSupported()) {
      log('unsupported', 'no SpeechRecognition on this browser');
      return;
    }
    heardBox.textContent = '—';
    listener = createListener({
      lang,
      onEvent: (what, detail) => log(what, detail),
      onPartial: (text) => { heardBox.textContent = text; },
      onFinal: (transcripts) => { heardBox.textContent = transcripts.join(' | '); },
      onError: (code) => log('listener error', code),
      onState: (state) => log('state', state),
    });
    listener.start();
    engineBtn.textContent = label(lang, 'check.engine.stop', 'Stop');
  }

  const engineBtn = h('button', {
    class: 'ghost',
    'data-hot': true,
    type: 'button',
    text: label(lang, 'check.engine.start', 'Listen'),
    onClick: startEngine,
  });

  /* ---------------- the facts that need no test ---------------- */

  const factsBox = h('div', { class: 'facts' });

  function fact(name, value) {
    factsBox.append(h('p', { class: 'facts__row' }, [
      h('span', { class: 'facts__name', text: name }),
      h('span', { class: 'facts__value', text: String(value) }),
    ]));
  }

  fact('engine', recognitionSupported() ? 'yes' : 'no');
  fact('language', LOCALE[lang] || lang);
  fact('installed', standalone() ? 'yes (home screen)' : 'no (browser tab)');
  fact('online', navigator.onLine ? 'yes' : 'no');
  fact('secure', window.isSecureContext ? 'yes' : 'no — voice needs https');
  const permissionRow = h('p', { class: 'facts__row' }, [
    h('span', { class: 'facts__name', text: 'permission' }),
    h('span', { class: 'facts__value', text: '…' }),
  ]);
  factsBox.append(permissionRow);
  micPermission().then((state) => {
    if (!destroyed) permissionRow.lastChild.textContent = state;
  });

  /* ---------------- the screen ---------------- */

  const body = h('div', { class: 'sheet__body' }, [
    h('p', { class: 'row__hint', text: label(lang, 'check.intro',
      'Two tests, one after the other. The first shows whether this device hears anything at all; the second shows what the speech engine does with it.') }),

    h('div', { class: 'row' }, [
      h('span', { class: 'row__label', text: label(lang, 'check.level.title', '1 · Can the device hear?') }),
      h('span', { class: 'meter' }, [bar]),
      levelBtn,
      meterNote,
    ]),

    h('div', { class: 'row' }, [
      h('span', { class: 'row__label', text: label(lang, 'check.engine.title', '2 · What does the engine hear?') }),
      heardBox,
      engineBtn,
      h('span', { class: 'row__hint', text: label(lang, 'check.engine.hint',
        'Hold the phone where the child holds it and let them say a number.') }),
    ]),

    h('div', { class: 'row' }, [
      h('span', { class: 'row__label', text: label(lang, 'check.facts', 'This device') }),
      factsBox,
    ]),

    h('div', { class: 'row' }, [
      h('span', { class: 'row__label', text: label(lang, 'check.log', 'What happened') }),
      logBox,
    ]),
  ]);

  const node = h('div', { class: 'sheet' }, [
    h('header', { class: 'sheet__head' }, [
      h('button', {
        class: 'icon-btn',
        'data-flip': true,
        type: 'button',
        'aria-label': t('win.menu', lang),
        onClick: () => { location.hash = '#/settings'; },
      }, [icon('back')]),
      h('h1', { class: 'sheet__title', text: label(lang, 'check.title', 'Mic check') }),
    ]),
    body,
  ]);

  clear(app);
  app.append(node);

  return {
    destroy() {
      destroyed = true;
      stopLevels();
      stopEngine();
    },
  };
}
