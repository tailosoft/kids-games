// The app says a letter — its name ("es") or its sound ("sss"), whichever the
// "For letters, say the" setting is on — and the child picks it out of a list.
import { createPromptGame } from '../prompt-game.js';
import { matchLetters } from '../match.js';
import { alphabet } from '../alphabet.js';
import * as mastery from '../mastery.js';
import { shuffle } from '../dom.js';

// Hearing a letter is its own skill, tracked apart from saying one, and apart
// again for names and sounds.
const keyFor = (letter, mode) => (mode === 'sound' ? 'hs:' : 'hl:') + letter.char;

function pickLetter(lang, mode, previous) {
  const pool = alphabet(lang).filter((letter) => !previous || letter.char !== previous.letter.char);
  return mastery.pick(pool, (letter) => [keyFor(letter, mode)]) || pool[0];
}

export default createPromptGame({
  id: 'hear-letter',
  domain: 'hear-letters',
  listen: true,

  promptKey: (round) => (round.mode === 'sound' ? 'prompt.hear.sound' : 'prompt.hear.letter'),

  keys: (round) => [keyFor(round.letter, round.mode)],

  makeRound(cfg, lang, previous) {
    return {
      letter: pickLetter(lang, cfg.letterMode, previous),
      mode: cfg.letterMode,
    };
  },

  glyph: () => [],                       // the card is a replay button
  answer: (round) => round.letter.char,
  ttsText: (round) => (round.mode === 'sound' ? round.letter.soundTts : round.letter.tts),
  optionCount: (cfg) => cfg.options,

  // Unused: a listening game is answered by tapping, never by speaking.
  check(transcripts, round, lang) {
    return matchLetters(transcripts, [round.letter], lang, round.mode);
  },

  decoys(round, cfg, lang) {
    const wanted = Math.max(1, cfg.options - 1);
    return shuffle(alphabet(lang))
      .filter((letter) => letter.char !== round.letter.char)
      .slice(0, wanted)
      .map((letter) => letter.char);
  },
});
