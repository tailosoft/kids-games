// Say the number. One, two or three digits, set in Settings.
import { createPromptGame } from '../prompt-game.js';
import { matchNumber } from '../match.js';
import * as settings from '../settings.js';
import * as mastery from '../mastery.js';
import { randomInt } from '../dom.js';

const RANGES = { 1: [0, 9], 2: [10, 99], 3: [100, 999] };

function range(digits) {
  return RANGES[digits] || RANGES[1];
}

function show(value) {
  return settings.num(value);
}

// The exact number, then the families it belongs to: trouble with 47 nudges the
// whole forties, trouble with 312 nudges the three hundreds.
function keysFor(value) {
  const keys = ['n:' + value];
  if (value >= 10) keys.push('t:' + Math.floor((value % 100) / 10));
  if (value >= 100) keys.push('h:' + Math.floor(value / 100));
  return keys;
}

// Small pools are weighed whole; for the three-digit pool a random shortlist is
// enough to surface the weak spots without scoring 900 numbers per card.
function shortlist(low, high, skip) {
  const span = high - low + 1;
  const out = [];
  if (span <= 40) {
    for (let v = low; v <= high; v += 1) if (v !== skip) out.push(v);
    return out;
  }
  const seen = new Set(skip == null ? [] : [skip]);
  let guard = 0;
  while (out.length < 18 && guard < 200) {
    guard += 1;
    const v = randomInt(low, high);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export default createPromptGame({
  id: 'numbers',

  domain: 'numbers',

  promptKey: () => 'prompt.number',

  keys: (round) => keysFor(round.value),

  makeRound(cfg, lang, previous) {
    const [low, high] = range(cfg.digits);
    const pool = shortlist(low, high, previous ? previous.value : null);
    const value = mastery.pick(pool, keysFor);
    return { value: value == null ? randomInt(low, high) : value };
  },

  glyph(round) {
    return [show(round.value)];
  },

  // Western digits read most reliably across voices; the voice says the number
  // in its own language.
  ttsText(round) {
    return String(round.value);
  },

  check(transcripts, round, lang) {
    return matchNumber(transcripts, round.value, lang);
  },

  decoys(round, cfg) {
    const [low, high] = range(cfg.digits);
    const out = [];
    const used = new Set([round.value]);
    let guard = 0;
    while (out.length < 3 && guard < 60) {
      guard += 1;
      // Keep the wrong answers close by, so tapping is a real choice.
      const drift = randomInt(1, Math.max(2, Math.round((high - low) / 6)));
      const value = Math.random() < 0.5 ? round.value - drift : round.value + drift;
      if (value < low || value > high || used.has(value)) continue;
      used.add(value);
      out.push(show(value));
    }
    while (out.length < 3) {
      const value = randomInt(low, high);
      if (used.has(value)) continue;
      used.add(value);
      out.push(show(value));
    }
    return out;
  },
});
