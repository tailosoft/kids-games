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

  let locale = LOCALE[opts.lang] || 'en-US';
  let rec = null;
  let wanted = false;     // the user wants the mic on
  let running = false;    // the engine says it is on
  let fatal = null;       // 'denied' | 'unsupported' | 'network'
  let restartTimer = 0;
  let state = 'idle';
  let silenceStreak = 0;
  let lastPartial = '';      // the hypothesis currently on screen
  let settled = false;       // this utterance has already been handed over
  let flushTimer = 0;
  const SILENCE_LIMIT = 8;   // ~1 minute of nothing: go back to sleep
  const FLUSH_MS = 1400;     // how long to wait for a final after speech stops

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
      lastPartial = '';
      settled = false;
      clearTimeout(flushTimer);
      if (wanted) emit('listening');
    };

    r.onspeechstart = () => {
      if (wanted) emit('hearing');
    };

    r.onspeechend = () => {
      if (wanted) emit('thinking');
      // If the final never comes, judge the hypothesis rather than stall.
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, FLUSH_MS);
    };

    r.onaudioend = () => {
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
        onPartial(partial);
      }
      if (heard.length) {
        clearTimeout(flushTimer);
        settled = true;
        lastPartial = '';
        silenceStreak = 0;
        onFinal(heard);
      }
    };

    r.onerror = (event) => {
      const code = event.error;
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
      flush();            // may stop the mic, so it has to run before restarting
      if (wanted) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(kick, 220);
      } else {
        emit('idle');
      }
    };

    return r;
  }

  function kick() {
    if (!wanted || running || !Recognition) return;
    if (!rec) rec = build();
    try {
      rec.start();
    } catch (_) {
      // start() on an engine that has not finished stopping: try once more.
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
      if (rec && running) {
        try { rec.abort(); } catch (_) { /* already down */ }
      }
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
      if (rec && running) {
        try {
          rec.stop();
        } catch (_) {
          flush();
          try { rec.abort(); } catch (__) { /* gone */ }
        }
      } else {
        flush();
        emit('idle');
      }
    },
    destroy() {
      clearTimeout(flushTimer);
      this.stop();
      if (rec) {
        rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
        rec.onaudioend = rec.onspeechstart = rec.onspeechend = null;
        rec = null;
      }
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
