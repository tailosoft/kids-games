import { parseSpokenNumber, matchLetters, formatNumber, normalize } from '../js/match.js';
import { alphabet } from '../js/alphabet.js';

let pass = 0, fail = 0;
const eq = (got, want, label) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  if (!ok) console.log('FAIL', label, '→ got', JSON.stringify(got), 'want', JSON.stringify(want));
};

// numbers: digits straight from the engine
eq(parseSpokenNumber('42', 'en'), 42, 'en digits');
eq(parseSpokenNumber('٤٢', 'ar'), 42, 'ar-indic digits');
eq(parseSpokenNumber('۷', 'fr'), 7, 'persian digit');
// numbers: words
eq(parseSpokenNumber('seven', 'en'), 7, 'en seven');
eq(parseSpokenNumber('forty two', 'en'), 42, 'en forty two');
eq(parseSpokenNumber('three hundred twenty one', 'en'), 321, 'en 321');
eq(parseSpokenNumber('one hundred', 'en'), 100, 'en 100');
eq(parseSpokenNumber('a hundred and five', 'en'), 105, 'en a hundred and five');
eq(parseSpokenNumber('nineteen', 'en'), 19, 'en 19');
eq(parseSpokenNumber('zéro', 'fr'), 0, 'fr zero');
eq(parseSpokenNumber('vingt et un', 'fr'), 21, 'fr 21');
eq(parseSpokenNumber('soixante-dix-sept', 'fr'), 77, 'fr 77');
eq(parseSpokenNumber('quatre-vingts', 'fr'), 80, 'fr 80');
eq(parseSpokenNumber('quatre-vingt-dix-neuf', 'fr'), 99, 'fr 99');
eq(parseSpokenNumber('deux cent trois', 'fr'), 203, 'fr 203');
eq(parseSpokenNumber('trois cents', 'fr'), 300, 'fr 300');
eq(parseSpokenNumber('cent', 'fr'), 100, 'fr cent');
eq(parseSpokenNumber('سبعة', 'ar'), 7, 'ar 7');
eq(parseSpokenNumber('واحد وعشرون', 'ar'), 21, 'ar 21');
eq(parseSpokenNumber('ثلاثة عشر', 'ar'), 13, 'ar 13');
eq(parseSpokenNumber('أحد عشر', 'ar'), 11, 'ar 11');
eq(parseSpokenNumber('مائة', 'ar'), 100, 'ar 100');
eq(parseSpokenNumber('ثلاثمائة وواحد وعشرون', 'ar'), 321, 'ar 321');
eq(parseSpokenNumber('مئتان وخمسون', 'ar'), 250, 'ar 250');
eq(parseSpokenNumber('تسعون', 'ar'), 90, 'ar 90');
eq(parseSpokenNumber('hello', 'en'), null, 'en no number');
eq(parseSpokenNumber('', 'en'), null, 'empty');
// digit-by-digit must NOT pass as the whole number
eq(parseSpokenNumber('four two', 'en') === 42, false, 'en four two is not 42');

const pick = (lang, chars) => chars.split('').map(c => alphabet(lang).find(l => l.char === c));
// letters, single
eq(matchLetters(['B'], pick('en','B'), 'en'), true, 'en B');
eq(matchLetters(['bee'], pick('en','B'), 'en'), true, 'en bee');
eq(matchLetters(['see'], pick('en','C'), 'en'), true, 'en see');
eq(matchLetters(['double you'], pick('en','W'), 'en'), true, 'en double you');
eq(matchLetters(['why'], pick('en','Y'), 'en'), true, 'en why');
eq(matchLetters(['dee'], pick('en','B'), 'en'), false, 'en dee != B');
eq(matchLetters(['bé'], pick('fr','B'), 'fr'), true, 'fr bé');
eq(matchLetters(['c\'est'], pick('fr','C'), 'fr'), true, 'fr c est');
eq(matchLetters(['i grec'], pick('fr','Y'), 'fr'), true, 'fr i grec');
eq(matchLetters(['double vé'], pick('fr','W'), 'fr'), true, 'fr double vé');
eq(matchLetters(['باء'], pick('ar','ب'), 'ar'), true, 'ar baa');
eq(matchLetters(['ب'], pick('ar','ب'), 'ar'), true, 'ar b');
eq(matchLetters(['ألف'], pick('ar','ا'), 'ar'), true, 'ar alif');
eq(matchLetters(['الف'], pick('ar','ا'), 'ar'), true, 'ar alif plain');
eq(matchLetters(['جيم'], pick('ar','ح'), 'ar'), false, 'ar jim != haa');
// letters, sequences
eq(matchLetters(['A B C'], pick('en','ABC'), 'en'), true, 'en A B C');
eq(matchLetters(['abc'], pick('en','ABC'), 'en'), true, 'en abc');
eq(matchLetters(['ay bee see'], pick('en','ABC'), 'en'), true, 'en spelled out');
eq(matchLetters(['a and b'], pick('en','AB'), 'en'), true, 'en a and b');
eq(matchLetters(['A C'], pick('en','AB'), 'en'), false, 'en wrong pair');
eq(matchLetters(['B A'], pick('en','AB'), 'en'), false, 'en wrong order');
eq(matchLetters(['باء تاء'], pick('ar','بت'), 'ar'), true, 'ar seq names');
eq(matchLetters(['ب ت'], pick('ar','بت'), 'ar'), true, 'ar seq chars');
eq(matchLetters(['بت'], pick('ar','بت'), 'ar'), true, 'ar seq glued');
// letter SOUNDS (phonics mode) rather than letter names
eq(matchLetters(['sss'], pick('en','S'), 'en', 'sound'), true, 'en sss is S');
eq(matchLetters(['ss'], pick('en','S'), 'en', 'sound'), true, 'en ss is S');
eq(matchLetters(['s'], pick('en','S'), 'en', 'sound'), true, 'en bare s is S');
eq(matchLetters(['buh'], pick('en','B'), 'en', 'sound'), true, 'en buh is B');
eq(matchLetters(['mmm'], pick('en','M'), 'en', 'sound'), true, 'en mmm is M');
eq(matchLetters(['kuh'], pick('en','C'), 'en', 'sound'), true, 'en kuh is C');
eq(matchLetters(['es'], pick('en','S'), 'en', 'sound'), false, 'en the NAME is not the sound');
eq(matchLetters(['bee'], pick('en','B'), 'en', 'sound'), false, 'en bee is not the B sound');
eq(matchLetters(['mmm'], pick('en','S'), 'en', 'sound'), false, 'en mmm is not S');
eq(matchLetters(['sss'], pick('en','S'), 'en'), false, 'en sound does not pass in name mode');
eq(matchLetters(['sss'], pick('fr','S'), 'fr', 'sound'), true, 'fr sss is S');
eq(matchLetters(['be'], pick('fr','B'), 'fr', 'sound'), true, 'fr be is B');
eq(matchLetters(['esse'], pick('fr','S'), 'fr', 'sound'), false, 'fr the name is not the sound');
eq(matchLetters(['با'], pick('ar','ب'), 'ar', 'sound'), true, 'ar ba is the sound of baa');
eq(matchLetters(['بَ'], pick('ar','ب'), 'ar', 'sound'), true, 'ar fatha form');
eq(matchLetters(['باء'], pick('ar','ب'), 'ar', 'sound'), false, 'ar the name is not the sound');
eq(matchLetters(['buh','duh'], pick('en','B'), 'en', 'sound'), true, 'sound alternatives');
eq(matchLetters(['sss'], pick('en','SB'), 'en', 'sound'), false, 'one sound does not answer a two-letter card');
eq(matchLetters(['buh kuh'], pick('en','BC'), 'en', 'sound'), true, 'en two sounds in order');

// alternatives list: any one matching is enough
eq(matchLetters(['the', 'bee'], pick('en','B'), 'en'), true, 'alternatives');
// display
eq(formatNumber(407, 'arabic'), '٤٠٧', 'arabic numerals');
eq(formatNumber(407, 'western'), '407', 'western numerals');
eq(normalize('  Quarante-Deux!  ', 'fr'), 'quarante deux', 'normalize');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
