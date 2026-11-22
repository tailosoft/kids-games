// Alphabets in two registers.
//
//   name   what the letter is called:  S -> "es",  B -> "bee",  ب -> "باء"
//   sound  how it is read in a word:   S -> "sss", B -> "buh",  ب -> "بَ"
//
// Each row is:
//   [ char, spoken names, sounds, onsets, name for the voice, sound for the voice ]
//
// `names` and `sounds` are the forms a child says *and* the near-misses a
// recogniser hands back for them. `onsets` are the openings that count for a
// very short utterance in sound mode, because a hissed /s/ often comes back as
// nothing more than "s". All of it is written the way match.js normalises text:
// lower case, no accents, no Arabic diacritics.

const EN = [
  ['A', ['a', 'ay', 'eh', 'hey'], ['ah', 'a', 'uh', 'aah'], ['a'], 'A', 'ah'],
  ['B', ['b', 'be', 'bee', 'bea'], ['buh', 'bu', 'bah', 'b'], ['b'], 'B', 'buh'],
  ['C', ['c', 'see', 'sea', 'si'], ['kuh', 'cuh', 'ku', 'k'], ['k', 'c'], 'C', 'kuh'],
  ['D', ['d', 'dee', 'de'], ['duh', 'du', 'd'], ['d'], 'D', 'duh'],
  ['E', ['e', 'ee', 'eh'], ['eh', 'e', 'ay'], ['e'], 'E', 'eh'],
  ['F', ['f', 'ef', 'eff'], ['ff', 'fff', 'fuh', 'f'], ['f'], 'F', 'fff'],
  ['G', ['g', 'gee', 'jee'], ['guh', 'gu', 'g'], ['g'], 'G', 'guh'],
  ['H', ['h', 'aitch', 'haitch', 'hatch', 'age'], ['huh', 'hh', 'ha', 'h'], ['h'], 'H', 'huh'],
  ['I', ['i', 'eye', 'aye', 'ai'], ['ih', 'i'], ['i'], 'I', 'ih'],
  ['J', ['j', 'jay', 'jai'], ['juh', 'ju', 'j'], ['j'], 'J', 'juh'],
  ['K', ['k', 'kay', 'ka'], ['kuh', 'ku', 'k'], ['k'], 'K', 'kuh'],
  ['L', ['l', 'el', 'ell'], ['ll', 'lll', 'luh', 'l'], ['l'], 'L', 'lll'],
  ['M', ['m', 'em', 'emm'], ['mm', 'mmm', 'muh', 'm'], ['m'], 'M', 'mmm'],
  ['N', ['n', 'en', 'enn'], ['nn', 'nnn', 'nuh', 'n'], ['n'], 'N', 'nnn'],
  ['O', ['o', 'oh', 'owe'], ['oh', 'o', 'aw'], ['o'], 'O', 'oh'],
  ['P', ['p', 'pee', 'pea'], ['puh', 'pu', 'p'], ['p'], 'P', 'puh'],
  ['Q', ['q', 'cue', 'queue', 'kyu'], ['kwuh', 'kw', 'qu', 'kuh'], ['k', 'q'], 'Q', 'kwuh'],
  ['R', ['r', 'ar', 'are', 'arr'], ['rr', 'rrr', 'ruh', 'r'], ['r'], 'R', 'rrr'],
  ['S', ['s', 'es', 'ess'], ['ss', 'sss', 'suh', 's'], ['s'], 'S', 'sss'],
  ['T', ['t', 'tee', 'tea', 'te'], ['tuh', 'tu', 't'], ['t'], 'T', 'tuh'],
  ['U', ['u', 'you', 'yu', 'ewe'], ['uh', 'u', 'oo'], ['u'], 'U', 'uh'],
  ['V', ['v', 'vee', 've'], ['vv', 'vvv', 'vuh', 'v'], ['v'], 'V', 'vvv'],
  ['W', ['w', 'double u', 'double you', 'dub'], ['wuh', 'wu', 'w'], ['w'], 'W', 'wuh'],
  ['X', ['x', 'ex', 'eks'], ['ks', 'kss', 'x'], ['k', 'x'], 'X', 'kss'],
  ['Y', ['y', 'why', 'wye'], ['yuh', 'yu', 'y'], ['y'], 'Y', 'yuh'],
  ['Z', ['z', 'zee', 'zed', 'zi'], ['zz', 'zzz', 'zuh', 'z'], ['z'], 'Z', 'zzz'],
];

const FR = [
  ['A', ['a', 'ah', 'as'], ['a', 'ah', 'aa'], ['a'], 'a', 'a'],
  ['B', ['b', 'be', 'bay', 'bes'], ['be', 'bbb', 'bb', 'b'], ['b'], 'bé', 'be'],
  ['C', ['c', 'ce', 'ces', 'ses', 'se', "c'est", 'sais'], ['ke', 'kkk', 'k', 'que'], ['k', 'c', 'q'], 'cé', 'ke'],
  ['D', ['d', 'de', 'des', 'dez'], ['de', 'ddd', 'd'], ['d'], 'dé', 'de'],
  ['E', ['e', 'eu', 'euh', 'oeuf'], ['eu', 'e', 'euh'], ['e'], 'e', 'e'],
  ['F', ['f', 'ef', 'effe', 'eff'], ['ff', 'fff', 'fe', 'f'], ['f'], 'effe', 'fff'],
  ['G', ['g', 'ge', 'jai', 'jet', 'get'], ['gue', 'gu', 'ggg', 'g'], ['g'], 'gé', 'gue'],
  ['H', ['h', 'ache', 'hache', 'ash'], ['h', 'he', 'muet'], ['h'], 'hache', 'h'],
  ['I', ['i', 'ie', 'y', 'hi'], ['i', 'ii'], ['i'], 'i', 'i'],
  ['J', ['j', 'ji', 'gi', 'jy'], ['je', 'jjj', 'j'], ['j'], 'ji', 'je'],
  ['K', ['k', 'ka', 'ca', 'kha'], ['ke', 'kkk', 'k'], ['k'], 'ka', 'ke'],
  ['L', ['l', 'el', 'elle', 'ailes', 'aile'], ['ll', 'lll', 'le', 'l'], ['l'], 'elle', 'lll'],
  ['M', ['m', 'em', 'aime', 'aim', 'hem'], ['mm', 'mmm', 'me', 'm'], ['m'], 'emme', 'mmm'],
  ['N', ['n', 'en', 'aine', 'haine', 'ene'], ['nn', 'nnn', 'ne', 'n'], ['n'], 'enne', 'nnn'],
  ['O', ['o', 'oh', 'eau', 'au', 'ho'], ['o', 'oh', 'au'], ['o'], 'o', 'o'],
  ['P', ['p', 'pe', 'pet', 'pes'], ['pe', 'ppp', 'p'], ['p'], 'pé', 'pe'],
  ['Q', ['q', 'qu', 'cu', 'queue', 'ku'], ['ke', 'ku', 'q', 'k'], ['k', 'q'], 'qu', 'ke'],
  ['R', ['r', 'air', 'aire', 'erre', 'ere', 'er'], ['rr', 'rrr', 're', 'r'], ['r'], 'erre', 'rrr'],
  ['S', ['s', 'es', 'esse', 'ess'], ['ss', 'sss', 'se', 's'], ['s'], 'esse', 'sss'],
  ['T', ['t', 'te', 'the', 'tes', 'tet'], ['te', 'ttt', 't'], ['t'], 'té', 'te'],
  ['U', ['u', 'eu', 'hu'], ['u', 'uu'], ['u'], 'u', 'u'],
  ['V', ['v', 've', 'vais', 'vez'], ['ve', 'vvv', 'v'], ['v'], 'vé', 've'],
  ['W', ['w', 'double ve', 'double v', 'doubleve', 'double vais'], ['we', 'oue', 'w'], ['w', 'o'], 'double vé', 'we'],
  ['X', ['x', 'ix', 'ixe', 'iks'], ['ks', 'kse', 'x'], ['k', 'x'], 'ixe', 'kse'],
  ['Y', ['y', 'i grec', 'igrec', 'ygrec', 'grec'], ['ye', 'yi', 'y'], ['y'], 'i grec', 'ye'],
  ['Z', ['z', 'zed', 'zede', 'zd'], ['ze', 'zzz', 'z'], ['z'], 'zède', 'ze'],
];

// Arabic names are written out; the sound of a letter is the letter carrying a
// fatha — بَ, تَ — which a recogniser usually returns as "با" or just "ب".
const AR_NAMES = [
  ['ا', ['الف', 'ألف', 'ا', 'أ', 'همزه', 'همزة'], 'ألِف'],
  ['ب', ['باء', 'با', 'ب'], 'باء'],
  ['ت', ['تاء', 'تا', 'ت'], 'تاء'],
  ['ث', ['ثاء', 'ثا', 'ث'], 'ثاء'],
  ['ج', ['جيم', 'ج'], 'جيم'],
  ['ح', ['حاء', 'حا', 'ح'], 'حاء'],
  ['خ', ['خاء', 'خا', 'خ'], 'خاء'],
  ['د', ['دال', 'د'], 'دال'],
  ['ذ', ['ذال', 'ذ'], 'ذال'],
  ['ر', ['راء', 'را', 'ر'], 'راء'],
  ['ز', ['زاي', 'زين', 'ز'], 'زاي'],
  ['س', ['سين', 'س'], 'سين'],
  ['ش', ['شين', 'ش'], 'شين'],
  ['ص', ['صاد', 'ص'], 'صاد'],
  ['ض', ['ضاد', 'ض'], 'ضاد'],
  ['ط', ['طاء', 'طا', 'ط'], 'طاء'],
  ['ظ', ['ظاء', 'ظا', 'ظ'], 'ظاء'],
  ['ع', ['عين', 'ع'], 'عين'],
  ['غ', ['غين', 'غ'], 'غين'],
  ['ف', ['فاء', 'فا', 'ف'], 'فاء'],
  ['ق', ['قاف', 'ق'], 'قاف'],
  ['ك', ['كاف', 'ك'], 'كاف'],
  ['ل', ['لام', 'ل'], 'لام'],
  ['م', ['ميم', 'م'], 'ميم'],
  ['ن', ['نون', 'ن'], 'نون'],
  ['ه', ['هاء', 'ها', 'ه'], 'هاء'],
  ['و', ['واو', 'و'], 'واو'],
  ['ي', ['ياء', 'يا', 'ي'], 'ياء'],
];

const FATHA = 'َ';

const AR = AR_NAMES.map((row) => {
  const char = row[0];
  return [char, row[1], [char + 'ا', char, char + 'ه'], [char], row[2], char + FATHA];
});

function build(rows) {
  return rows.map((row) => ({
    char: row[0],
    aliases: row[1],
    sounds: row[2],
    onsets: row[3],
    tts: row[4] || row[0],
    soundTts: row[5] || row[2][0],
  }));
}

export const ALPHABET = {
  en: build(EN),
  fr: build(FR),
  ar: build(AR),
};

export function alphabet(lang) {
  return ALPHABET[lang] || ALPHABET.en;
}

/** Words glued between letters that should not count as a letter. */
export const FILLERS = {
  en: ['and', 'then', 'letter', 'the', 'uh', 'um'],
  fr: ['et', 'puis', 'lettre', 'la', 'le', 'euh'],
  ar: ['و', 'ثم', 'حرف', 'ال'],
};
