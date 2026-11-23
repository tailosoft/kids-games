// Turning what the recogniser heard into "right" or "not yet".
//
// Recognisers are inconsistent: ask for 42 and you get "42", "forty two",
// "quarante-deux" or "٤٢" depending on the engine and the language. So every
// transcript is normalised, then read twice — once as digits, once as words.
import { FILLERS } from './alphabet.js';

const ARABIC_INDIC = /[٠-٩]/g;
const EXT_ARABIC_INDIC = /[۰-۹]/g;
const MARKS = /[\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06ed]/g;

/** Lower case, accent-free, diacritic-free, ASCII digits, single spaces. */
export function normalize(text, lang) {
  let out = String(text == null ? '' : text);
  out = out.replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660));
  out = out.replace(EXT_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06F0));
  out = out.normalize('NFD').replace(MARKS, '');
  out = out.replace(/ـ/g, '');            // tatweel
  out = out.replace(/ة/g, 'ه');      // ة -> ه
  out = out.replace(/ى/g, 'ي');      // ى -> ي
  out = out.toLowerCase();
  out = out.replace(/[^\p{L}\p{N}\s]+/gu, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  if (lang === 'fr') out = out.replace(/quatre\s*vingts?/g, 'quatrevingt');
  if (lang === 'en') out = out.replace(/\ba hundred\b/g, 'one hundred');
  return out;
}

const WORDS = {
  en: {
    zero: 0, oh: 0, nought: 0, naught: 0, nil: 0,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, hundreds: 100,
  },
  fr: {
    zero: 0,
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
    huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
    quinze: 15, seize: 16,
    vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50,
    soixante: 60, quatrevingt: 80,
    cent: 100, cents: 100,
  },
  ar: {
    'صفر': 0,
    'واحد': 1, 'واحده': 1, 'احد': 1, 'اول': 1,
    'اثنان': 2, 'اثنين': 2, 'اثنا': 2, 'اثني': 2, 'تنين': 2,
    'ثلاثه': 3, 'ثلاث': 3,
    'اربعه': 4, 'اربع': 4,
    'خمسه': 5, 'خمس': 5,
    'سته': 6, 'ست': 6,
    'سبعه': 7, 'سبع': 7,
    'ثمانيه': 8, 'ثمان': 8, 'ثمانيا': 8,
    'تسعه': 9, 'تسع': 9,
    'عشره': 10, 'عشر': 10,
    'عشرون': 20, 'عشرين': 20,
    'ثلاثون': 30, 'ثلاثين': 30,
    'اربعون': 40, 'اربعين': 40,
    'خمسون': 50, 'خمسين': 50,
    'ستون': 60, 'ستين': 60,
    'سبعون': 70, 'سبعين': 70,
    'ثمانون': 80, 'ثمانين': 80,
    'تسعون': 90, 'تسعين': 90,
    'مئه': 100, 'مايه': 100, 'ميه': 100, 'مئة': 100,
    'مئتان': 200, 'مئتين': 200, 'مايتان': 200, 'مايتين': 200, 'ميتين': 200,
    'ثلاثمئه': 300, 'ثلاثمايه': 300,
    'اربعمئه': 400, 'اربعمايه': 400,
    'خمسمئه': 500, 'خمسمايه': 500,
    'ستمئه': 600, 'ستمايه': 600,
    'سبعمئه': 700, 'سبعمايه': 700,
    'ثمانمئه': 800, 'ثمانمايه': 800,
    'تسعمئه': 900, 'تسعمايه': 900,
  },
};

// Keys are written in natural spelling above; normalise them once at load so
// they are comparable with normalised transcript tokens.
const TABLES = {};
for (const lang of Object.keys(WORDS)) {
  const table = {};
  for (const key of Object.keys(WORDS[lang])) table[normalize(key, lang)] = WORDS[lang][key];
  TABLES[lang] = table;
}

function wordValue(token, lang) {
  const table = TABLES[lang] || TABLES.en;
  if (token in table) return table[token];
  // Arabic glues the conjunction on: "وعشرون" is "and twenty".
  if (lang === 'ar' && token.length > 1 && token[0] === 'و') {
    const rest = token.slice(1);
    if (rest in table) return table[rest];
  }
  return null;
}

/* ---------------- what the engine heard instead ---------------- */

// A recogniser trained on grown-ups returns the nearest everyday word to the
// noise a four-year-old made: "free" for three, "for" for four, "تلاته" for
// ثلاثة. None of those is a number to the strict reading above, so a child who
// said the right thing was told they were wrong — the single most common way
// this app misjudges a small voice.
//
// Two rules below, both deliberately narrow:
//   * a token one edit away from exactly one number word is that number;
//   * a short list of true homophones, which are further than one edit from
//     the word they sound like ("ate" / eight) and so are out of its reach.
// A token that is one edit from two different numbers is thrown away, not
// guessed: "ine" could be nine or one, and a wrong "right" teaches the wrong
// number. Wrong answers are never snapped towards the card — the leniency
// knows nothing about what is on screen, so it cannot flatter the child.

const HOMOPHONES = {
  en: {
    won: 1, wun: 1,
    to: 2, too: 2, tu: 2, do: 2,
    free: 3, fre: 3, tri: 3,
    sick: 6, sik: 6,
    fore: 4, faw: 4,
    hive: 5,
    heaven: 7,
    ate: 8, ait: 8, hate: 8, eat: 8,
    nain: 9, nan: 9, nein: 9,
    hero: 0,
  },
  fr: {
    toi: 3, twa: 3,
    kat: 4, cat: 4, katr: 4,
    sank: 5, sang: 5, san: 5,
    wit: 8, ouit: 8, oui: 8,
    vin: 20,
  },
  ar: {},
};

// Arabic as a child actually says it: ثلاثة comes out تلاتة across much of the
// Levant and Egypt, and the recogniser writes down what it hears. These are
// regular swaps, so folding them costs nothing in precision — and it stays
// inside the number reading, where ت and ث cannot be two different answers.
// The letters game must keep them apart, so this is not done in normalize().
const AR_FOLD = [[/ث/g, 'ت'], [/ذ/g, 'د'], [/ظ/g, 'ز'], [/ء/g, '']];

function fold(text, lang) {
  if (lang !== 'ar') return text;
  let out = text;
  for (const [from, to] of AR_FOLD) out = out.replace(from, to);
  return out;
}

const FUZZ = 1;        // edits allowed against a short word
const FUZZ_LONG = 2;   // ...and against a long one, where a syllable can slip
const LONG = 6;        // "fifteen" is long; "five" is not
const FUZZ_MIN = 3;    // a token shorter than this is not fuzzed at all

/** Levenshtein distance, abandoned as soon as it passes `cap`. */
function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

/** The number a near-miss token stands for, or null if it is not close enough. */
function nearValue(token, lang) {
  const homophones = HOMOPHONES[lang] || HOMOPHONES.en;
  if (token in homophones) return homophones[token];
  if (token.length < FUZZ_MIN) return null;

  const table = TABLES[lang] || TABLES.en;
  const heard = fold(token, lang);
  let best = null;
  let bestDist = FUZZ_LONG + 1;
  let ambiguous = false;
  for (const key of Object.keys(table)) {
    if (key.length < FUZZ_MIN) continue;        // "un" is one edit from far too much
    // A long word is mangled a syllable at a time — "fiftin" for fifteen — and
    // has room to spare: nothing else in the table is two edits from it.
    const cap = key.length >= LONG && token.length >= FUZZ_MIN + 1 ? FUZZ_LONG : FUZZ;
    const dist = editDistance(heard, fold(key, lang), cap);
    if (dist > cap || dist > bestDist) continue;   // not close enough to this word
    // Ties are only ties at the same distance: ثمانية folds onto تمانية
    // exactly, and must not be talked out of it by ثمانين one edit further.
    if (dist < bestDist) {
      bestDist = dist;
      best = table[key];
      ambiguous = false;
    } else if (table[key] !== best) {
      ambiguous = true;
    }
  }
  return ambiguous ? null : best;
}

/**
 * Read a spoken number out of a transcript. Returns null when there is no
 * number in it. Handles 0–999, which is all the game asks for.
 *
 * `loose` also accepts the near-misses described above. The strict reading is
 * what the tests pin down; the games ask for both.
 */
export function parseSpokenNumber(text, lang, loose) {
  const norm = normalize(text, lang);
  if (!norm) return null;

  const digits = norm.match(/\d+/g);
  if (digits) {
    // "42" but also "4 2" said as separate digits — join only when the whole
    // transcript is digits, otherwise take the first group.
    const onlyDigits = norm.replace(/[\s]/g, '');
    if (/^\d+$/.test(onlyDigits)) return Number(onlyDigits);
    return Number(digits[0]);
  }

  let total = 0;
  let current = 0;
  let seen = false;
  for (const token of norm.split(' ')) {
    let value = wordValue(token, lang);
    if (value == null && loose) value = nearValue(token, lang);
    if (value == null) continue;
    seen = true;
    if (value === 100) {
      current = (current || 1) * 100;
      total += current;
      current = 0;
    } else if (value >= 200 && value % 100 === 0) {
      total += value;
    } else {
      current += value;
    }
  }
  return seen ? total + current : null;
}

/** Did any of these transcripts say `target`? */
export function matchNumber(transcripts, target, lang) {
  for (const text of transcripts) {
    if (parseSpokenNumber(text, lang) === target) return true;
  }
  // Nothing heard plainly. Read them again, allowing for a recogniser that
  // rounded a small voice off to the nearest word it knew.
  for (const text of transcripts) {
    if (parseSpokenNumber(text, lang, true) === target) return true;
  }
  return false;
}

/* ---------------- letters ---------------- */

const LETTERISH = /[^\p{L}\p{N}]+/gu;

function compact(text) {
  return text.replace(LETTERISH, '');
}

function aliasList(letter, sound) {
  // Longest first, so "double ve" wins over "de" when both could match.
  const spoken = sound ? letter.sounds : letter.aliases;
  const seen = new Set();
  const list = [];
  for (const alias of spoken.concat([letter.char])) {
    const key = compact(normalize(alias, null));
    if (key && !seen.has(key)) {
      seen.add(key);
      list.push(key);
    }
  }
  return list.sort((a, b) => b.length - a.length);
}

function consume(rest, letters, index, sound) {
  if (index === letters.length) return rest.length === 0;
  for (const alias of aliasList(letters[index], sound)) {
    if (rest.startsWith(alias) && consume(rest.slice(alias.length), letters, index + 1, sound)) {
      return true;
    }
  }
  return false;
}

// A child hissing /s/ gives the engine nothing to spell, and it answers with a
// scrap like "s" or "so". For a single-letter sound card, a very short
// utterance that opens with the right sound counts.
const SHORT = 3;

// Saying "bee" or "باء" is the letter's name, however short it is: the onset
// rule must not hand it the sound as well, or the two modes collapse into one.
function saysTheName(norm, letter) {
  return aliasList(letter, false).includes(compact(norm));
}

function onsetMatch(norm, letter, lang) {
  const text = compact(norm);
  if (!text || text.length > SHORT) return false;
  return letter.onsets.some((onset) => {
    const key = compact(normalize(onset, lang));
    return key && text.startsWith(key);
  });
}

/**
 * Did any transcript say this letter sequence, in order?
 * mode 'name'  accepts "B", "bee", "bé", "باء", runs like "a b c" / "abc".
 * mode 'sound' accepts the phonics reading instead: "buh", "sss", "بَ".
 */
export function matchLetters(transcripts, letters, lang, mode) {
  const sound = mode === 'sound';
  const fillers = new Set((FILLERS[lang] || []).map((w) => normalize(w, lang)));
  const wanted = letters.map((l) => compact(normalize(l.char, lang))).join('');

  for (const text of transcripts) {
    const norm = normalize(text, lang);
    if (!norm) continue;

    if (compact(norm) === wanted) return true;

    const tokens = norm.split(' ').filter((tok) => tok && !fillers.has(tok));
    if (tokens.length === letters.length) {
      const everyOne = tokens.every((tok, i) => aliasList(letters[i], sound).includes(compact(tok)));
      if (everyOne) return true;
    }

    if (consume(compact(norm), letters, 0, sound)) return true;

    if (sound && letters.length === 1
        && !saysTheName(norm, letters[0])
        && onsetMatch(norm, letters[0], lang)) return true;
  }
  return false;
}

/* ---------------- display ---------------- */

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Render a number with western (123) or Arabic-Indic (١٢٣) digits. */
export function formatNumber(value, system) {
  const plain = String(value);
  if (system !== 'arabic') return plain;
  return plain.replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}
