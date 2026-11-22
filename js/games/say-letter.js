// Say the letter. One, two or three letters per card, and either the letter's
// name ("es") or the sound it makes in a word ("sss") — both set in Settings.
import { createPromptGame } from '../prompt-game.js';
import { matchLetters } from '../match.js';
import { alphabet } from '../alphabet.js';
import * as mastery from '../mastery.js';
import { shuffle } from '../dom.js';

// Names and sounds are tracked apart: a child can own the name of S and still
// be unsure what noise it makes.
const keyOf = (letter) => ['l:' + letter.char];
const keyFor = (letter, mode) => (mode === 'sound' ? 's:' : 'l:') + letter.char;

// Each slot is drawn on its own, weighted towards the letters this child has
// missed or laboured over — so a shaky G keeps coming back.
function pickLetters(lang, count, previous) {
  const pool = alphabet(lang);
  const chosen = [];
  const used = new Set();
  for (let slot = 0; slot < count; slot += 1) {
    const available = pool.filter((letter) => !used.has(letter.char));
    const letter = mastery.pick(available, keyOf) || available[0];
    used.add(letter.char);
    chosen.push(letter);
  }
  const same = previous && previous.letters.length === chosen.length
    && previous.letters.every((l, i) => l.char === chosen[i].char);
  return same && pool.length > count ? pickLetters(lang, count, null) : chosen;
}

export default createPromptGame({
  id: 'letters',

  domain: 'letters',

  promptKey: (round) => {
    const kind = round.mode === 'sound' ? 'prompt.sound.' : 'prompt.letter.';
    return kind + (round.letters.length > 1 ? 'many' : 'one');
  },

  keys: (round) => round.letters.map((letter) => keyFor(letter, round.mode)),

  makeRound(cfg, lang, previous) {
    return {
      letters: pickLetters(lang, cfg.letters, previous),
      mode: cfg.letterMode,
    };
  },

  glyph(round) {
    return round.letters.map((letter) => letter.char);
  },

  // Commas make the voice pause between letters.
  ttsText(round) {
    const say = (letter) => (round.mode === 'sound' ? letter.soundTts : letter.tts);
    return round.letters.map(say).join(', ');
  },

  check(transcripts, round, lang) {
    return matchLetters(transcripts, round.letters, lang, round.mode);
  },

  decoys(round, cfg, lang) {
    const letters = alphabet(lang);
    const right = round.letters.map((l) => l.char).join(' ');
    const out = [];
    const used = new Set([right]);
    let guard = 0;
    while (out.length < 3 && guard < 80) {
      guard += 1;
      const option = shuffle(letters).slice(0, round.letters.length).map((l) => l.char).join(' ');
      if (used.has(option)) continue;
      used.add(option);
      out.push(option);
    }
    return out;
  },
});
