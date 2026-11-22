// The other way round: the app says a number, the child picks it out of a list.
// Length comes from the same "Number length" setting; how many buttons to
// choose from comes from "Answers to choose from".
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

// Hearing a number and saying one are different skills, so they are tracked
// under their own keys rather than sharing the speaking game's record.
function keysFor(value) {
  const keys = ['hn:' + value];
  if (value >= 10) keys.push('ht:' + Math.floor((value % 100) / 10));
  if (value >= 100) keys.push('hh:' + Math.floor(value / 100));
  return keys;
}

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
  id: 'hear-number',
  domain: 'hear-numbers',
  listen: true,

  promptKey: () => 'prompt.hear.number',

  keys: (round) => keysFor(round.value),

  makeRound(cfg, lang, previous) {
    const [low, high] = range(cfg.digits);
    const pool = shortlist(low, high, previous ? previous.value : null);
    const value = mastery.pick(pool, keysFor);
    return { value: value == null ? randomInt(low, high) : value };
  },

  glyph: () => [],                       // the card is a replay button
  answer: (round) => show(round.value),
  ttsText: (round) => String(round.value),
  optionCount: (cfg) => cfg.options,

  // Unused: a listening game is answered by tapping, never by speaking.
  check(transcripts, round, lang) {
    return matchNumber(transcripts, round.value, lang);
  },

  decoys(round, cfg) {
    const [low, high] = range(cfg.digits);
    const wanted = Math.max(1, cfg.options - 1);
    const out = [];
    const used = new Set([round.value]);
    let guard = 0;
    // Near neighbours first, so the choice is about the number, not the size.
    while (out.length < wanted && guard < 200) {
      guard += 1;
      const drift = randomInt(1, Math.max(2, Math.round((high - low) / 6)));
      const value = Math.random() < 0.5 ? round.value - drift : round.value + drift;
      if (value < low || value > high || used.has(value)) continue;
      used.add(value);
      out.push(show(value));
    }
    guard = 0;
    while (out.length < wanted && guard < 400) {
      guard += 1;
      const value = randomInt(low, high);
      if (used.has(value)) continue;
      used.add(value);
      out.push(show(value));
    }
    return out;
  },
});
