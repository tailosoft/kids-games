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

/**
 * Read a spoken number out of a transcript. Returns null when there is no
 * number in it. Handles 0–999, which is all the game asks for.
 */
export function parseSpokenNumber(text, lang) {
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
    const value = wordValue(token, lang);
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
