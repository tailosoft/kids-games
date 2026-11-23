// Speech in and speech out.
//
// Recognition engine: the browser's Web Speech API. On Android Chrome it covers
// en / fr / ar with Google's server-side recogniser, which is far more accurate
// on single digits and letter names than a small on-device WASM model would be,
// and it adds nothing to the install size. The listener below is the only thing
// that touches the engine, so a WASM engine (whisper.cpp, Vosk) can be dropped
// in later as a second implementation of createListener() without the games
// changing. Trade-off to know: this engine needs the network, so the games also
// ship a tap mode that works fully offline.
import { LOCALE, t } from './i18n.js';

const Recognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export function recognitionSupported() {
  return !!Recognition;
}

export function synthesisSupported() {
  return typeof speechSynthesis !== 'undefined';
}

/**
 * A mic session the user can switch on and off.
 *
 * The browser engine stops by itself after every utterance; while the user has
 * the mic switched on we restart it, so "listening" stays true until they tap
 * the mic again or the round is won. State is reported through onState:
 * 'idle' | 'listening' | 'thinking'.
 */
export function createListener(opts) {
  const onPartial = opts.onPartial || (() => {});
  const onFinal = opts.onFinal || (() => {});
  const onError = opts.onError || (() => {});
  const onState = opts.onState || (() => {});
  // Every engine callback, for the mic check screen. Nothing else listens.
  const onEvent = opts.onEvent || (() => {});

  let locale = LOCALE[opts.lang] || 'en-US';
  let rec = null;
  let wanted = false;     // the user wants the mic on
  let running = false;    // the engine says it is on
  let fatal = null;       // 'denied' | 'unsupported' | 'network'
  let restartTimer = 0;
  let startGuard = 0;
  let endGuard = 0;
  let stalls = 0;         // sessions started that the engine never opened
  let state = 'idle';
  let silenceStreak = 0;
  let lastPartial = '';      // the hypothesis currently on screen
  let settled = false;       // this utterance has already been handed over
  let flushTimer = 0;
  const SILENCE_LIMIT = 8;   // ~1 minute of nothing: go back to sleep
  const FLUSH_MS = 1400;     // how long to wait for a final after speech stops
  const QUIET_MS = 1800;     // ...or after a hypothesis stops changing
  const OPEN_MS = 2000;      // start() to onstart: longer than this is a stall
  const END_MS = 2500;       // stop() to onend: longer than this is a wedge
  const STALL_LIMIT = 3;     // ...three in a row and the engine is not coming

  /**
   * The engine does not always finalise what it showed us: it can display a
   * hypothesis and then end the session without ever marking a result final.
   * Anything we put in front of the child has to be judged, so the last
   * hypothesis is handed over as the answer when no final arrives.
   */
  function flush() {
    clearTimeout(flushTimer);
    if (settled) return;
    const text = lastPartial.trim();
    if (!text) return;
    settled = true;
    lastPartial = '';
    silenceStreak = 0;
    // The session may still be open — a quiet answer never trips the engine's
    // endpointer, so it keeps listening. End it, and the restart in onend
    // gives the next answer a clean session instead of one that is already
    // settled and would ignore everything said into it.
    if (running && rec) {
      try { rec.stop(); } catch (_) { /* already on its way down */ }
    }
    onFinal([text]);
  }

  function emit(next) {
    if (next === state) return;
    state = next;
    onState(state);
  }

  function build() {
    const r = new Recognition();
    r.lang = locale;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 6;

    r.onstart = () => {
      running = true;
      stalls = 0;
      clearTimeout(startGuard);
      lastPartial = '';
      settled = false;
      clearTimeout(flushTimer);
      onEvent('start', locale);
      if (wanted) emit('listening');
    };

    r.onaudiostart = () => onEvent('audiostart');

    r.onspeechstart = () => {
      onEvent('speechstart');
      if (wanted) emit('hearing');
    };

    r.onspeechend = () => {
      onEvent('speechend');
      if (wanted) emit('thinking');
      // If the final never comes, judge the hypothesis rather than stall.
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, FLUSH_MS);
    };

    r.onaudioend = () => {
      onEvent('audioend');
      if (wanted && state !== 'idle') emit('thinking');
    };

    r.onresult = (event) => {
      const heard = [];
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          for (let a = 0; a < result.length; a += 1) {
            const text = (result[a].transcript || '').trim();
            if (text) heard.push(text);
          }
        } else if (result[0]) {
          partial = (result[0].transcript || '').trim();
        }
      }
      if (partial) {
        lastPartial = partial;
        onEvent('partial', partial);
        onPartial(partial);
        // Said softly, an answer reaches the recogniser but not the engine's
        // own voice detector: onspeechstart/onspeechend never fire, so nothing
        // else here would ever judge it. A hypothesis that stops changing is
        // the end of the utterance. Each new partial pushes the wait back, so
        // this only fires once the child has actually stopped.
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, QUIET_MS);
      }
      // A final for an utterance already handed over is the engine catching up
      // with a flush, not a second answer.
      if (heard.length) onEvent('final', heard.join(' | '));
      if (heard.length && !settled) {
        clearTimeout(flushTimer);
        settled = true;
        lastPartial = '';
        silenceStreak = 0;
        onFinal(heard);
      }
    };

    r.onerror = (event) => {
      const code = event.error;
      onEvent('error', code);
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        fatal = 'denied';
        wanted = false;
        onError('denied');
      } else if (code === 'audio-capture') {
        fatal = 'unsupported';
        wanted = false;
        onError('unsupported');
      } else if (code === 'network') {
        onError('network');
      } else if (code === 'no-speech') {
        silenceStreak += 1;
        if (silenceStreak >= SILENCE_LIMIT) {
          wanted = false;
          silenceStreak = 0;
          onError('sleep');
        } else {
          onError('silence');
        }
      }
      // 'aborted' is our own stop(): nothing to report.
    };

    r.onend = () => {
      running = false;
      onEvent('end');
      clearTimeout(startGuard);
      clearTimeout(endGuard);
      release(r);
      flush();            // may stop the mic, so it has to run before restarting
      if (wanted) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(kick, 160);
      } else {
        emit('idle');
      }
    };

    return r;
  }

  /** Unhook a spent session so a wedged one cannot talk to us afterwards. */
  function release(r) {
    if (!r) return;
    r.onstart = r.onresult = r.onerror = r.onend = null;
    r.onaudiostart = r.onaudioend = r.onspeechstart = r.onspeechend = null;
    if (rec === r) rec = null;
  }

  function kick() {
    if (!wanted || running || !Recognition) return;
    // A fresh session object every time. Restarting a used one is where the
    // engine wedges: it accepts start(), never opens the mic, and never ends
    // either — the app looks like it is listening to a child who is talking
    // into nothing.
    release(rec);
    rec = build();
    const mine = rec;
    try {
      mine.start();
      onEvent('starting');
      clearTimeout(startGuard);
      startGuard = setTimeout(() => {
        if (!wanted || running || rec !== mine) return;
        // start() was accepted and then nothing happened. Throw the session
        // away and build another; after a few of those, say so out loud
        // rather than leave a child talking to a dead microphone.
        stalls += 1;
        onEvent('stall', String(stalls));
        try { mine.abort(); } catch (_) { /* already gone */ }
        release(mine);
        if (stalls >= STALL_LIMIT) {
          stalls = 0;
          wanted = false;
          emit('idle');
          onError('stalled');
          return;
        }
        clearTimeout(restartTimer);
        restartTimer = setTimeout(kick, 200);
      }, OPEN_MS);
    } catch (_) {
      // start() on an engine that has not finished stopping: try again.
      release(mine);
      clearTimeout(restartTimer);
      restartTimer = setTimeout(kick, 350);
    }
  }

  return {
    get listening() {
      return wanted;
    },
    get state() {
      return state;
    },
    get blocked() {
      return fatal;
    },
    setLang(lang) {
      locale = LOCALE[lang] || 'en-US';
      if (rec) rec.lang = locale;
    },
    start() {
      if (!Recognition) {
        fatal = 'unsupported';
        onError('unsupported');
        return false;
      }
      if (fatal === 'denied' || fatal === 'unsupported') {
        onError(fatal);
        return false;
      }
      wanted = true;
      silenceStreak = 0;
      emit('listening');
      kick();
      return true;
    },
    /** Drop the mic now and throw away anything in flight. */
    stop() {
      wanted = false;
      settled = true;          // discard anything in flight
      lastPartial = '';
      clearTimeout(flushTimer);
      clearTimeout(restartTimer);
      clearTimeout(startGuard);
      clearTimeout(endGuard);
      if (rec && running) {
        try { rec.abort(); } catch (_) { /* already down */ }
      }
      release(rec);            // a wedged session must not talk to us later
      running = false;
      emit('idle');
    },

    /**
     * Stop listening but let the engine finish: the words spoken just before
     * release still arrive through onFinal. This is what hold-to-talk needs.
     */
    finish() {
      wanted = false;
      clearTimeout(restartTimer);
      clearTimeout(startGuard);
      if (rec && running) {
        const mine = rec;
        try {
          mine.stop();
          // stop() asks the engine to finish and hand back what it has. An
          // engine that never answers would leave the mic lit for ever, so
          // after a moment we take the words we have and call it done.
          clearTimeout(endGuard);
          endGuard = setTimeout(() => {
            if (rec !== mine) return;
            onEvent('endstall');
            flush();
            try { mine.abort(); } catch (_) { /* gone */ }
            release(mine);
            running = false;
            emit('idle');
          }, END_MS);
        } catch (_) {
          flush();
          try { mine.abort(); } catch (__) { /* gone */ }
          release(mine);
          running = false;
          emit('idle');
        }
      } else {
        flush();
        emit('idle');
      }
    },
    destroy() {
      clearTimeout(flushTimer);
      clearTimeout(endGuard);
      this.stop();
      release(rec);
    },
  };
}

/* ---------------- speech out ---------------- */

let voicesWait = null;

const VOICE_POLL = 100;
const VOICE_WAIT = 2000;

function voices() {
  if (!synthesisSupported()) return [];
  return speechSynthesis.getVoices() || [];
}

// getVoices() is empty for a moment after load, and on Linux until the system
// speech service answers. Speaking inside that window leaves utter.voice unset
// and the engine falls back to its own default language — which is how an
// Arabic 7 comes out as "seven". So every speak() waits for the list first.
function waitForVoices() {
  if (!synthesisSupported() || voices().length) return Promise.resolve();
  if (voicesWait) return voicesWait;
  voicesWait = new Promise((resolve) => {
    let waited = 0;
    const done = () => {
      clearInterval(timer);
      voicesWait = null;
      resolve();
    };
    const timer = setInterval(() => {
      waited += VOICE_POLL;
      if (voices().length || waited >= VOICE_WAIT) done();
    }, VOICE_POLL);
  });
  return voicesWait;
}

function pickVoice(lang) {
  const locale = (LOCALE[lang] || 'en-US').toLowerCase();
  const base = locale.split('-')[0];
  const list = voices();
  return list.find((v) => v.lang && v.lang.toLowerCase() === locale)
    || list.find((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(base))
    || null;
}

// Chrome only starts loading its list once something asks for it. Asking at
// import time means the list is usually ready before the first card wants
// reading out; waitForVoices() covers the times it is not.
if (typeof speechSynthesis !== 'undefined') voices();

/**
 * Pronounce text in `lang`. Resolves when the voice has finished, or false if
 * nothing could say it: silence beats a card read in the wrong language.
 */
export async function speak(text, lang, options) {
  const settings = options || {};
  if (!synthesisSupported() || !text) return false;
  await waitForVoices();

  const voice = pickVoice(lang);
  // An English voice reading an Arabic card says "seven" for ٧ and nonsense
  // for a letter. Only skip when the engine really did list its languages:
  // an engine that reports none is unknown, not empty, so it still gets a try.
  if (!voice && voices().some((v) => v.lang)) return false;

  return new Promise((resolve) => {
    try {
      speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(String(text));
      utter.lang = LOCALE[lang] || 'en-US';
      utter.rate = settings.rate != null ? settings.rate : 0.85;
      utter.pitch = settings.pitch != null ? settings.pitch : 1.05;
      if (voice) utter.voice = voice;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve(ok);
      };
      // Some engines never fire onend. That is not a failure to speak, so the
      // guard resolves true: only a real error means nothing was said.
      const guard = setTimeout(() => finish(true), 6000);
      utter.onend = () => finish(true);
      utter.onerror = () => finish(false);
      speechSynthesis.speak(utter);
    } catch (_) {
      resolve(false);
    }
  });
}

// Which settings screen holds the voices, so the app can point at it instead of
// leaving a parent to guess. Chrome OS ships its own voices, so it is not Linux
// here even though its user agent says so.
export function voicePlatform() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touch)) return 'ios';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  if (/CrOS/.test(ua)) return 'other';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'other';
}

/** What happened, and where on this device to fix it. */
export function voiceHelp(lang) {
  return {
    message: t('err.novoice', lang),
    fix: t('err.novoice.' + voicePlatform(), lang),
  };
}

/** Is there a voice installed that can read this language? */
export function hasVoice(lang) {
  if (!synthesisSupported()) return false;
  const list = voices();
  if (!list.length) return true;   // not loaded yet: assume yes, ask again later
  return !!pickVoice(lang);
}

export function stopSpeaking() {
  if (synthesisSupported()) {
    try { speechSynthesis.cancel(); } catch (_) { /* nothing to cancel */ }
  }
}
