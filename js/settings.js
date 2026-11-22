// Settings belong to the child, not the device: every profile carries its own
// language, card length and goal. The API is deliberately boring so the games
// never have to know about profiles.
import { LANGS, detectLang } from './i18n.js';
import * as profiles from './profiles.js';
import { formatNumber } from './match.js';

export const DEFAULTS = {
  lang: 'auto',        // 'auto' | 'en' | 'fr' | 'ar'
  digits: 1,           // 1..3
  letters: 1,          // 1..3
  letterMode: 'name',  // 'name' (es) | 'sound' (sss)
  goal: 10,            // cards needed for Youpi
  options: 6,          // answers to choose from in the listening games
  numerals: 'auto',    // 'auto' | 'western' | 'arabic'
  autoHear: false,     // pronounce each new card before answering
  mode: 'voice',       // 'voice' | 'tap'
};

const LIMITS = { digits: [1, 3], letters: [1, 3], goal: [3, 30], options: [2, 9] };

export function clamp(key, value) {
  const range = LIMITS[key];
  const n = Math.round(Number(value));
  if (!range || !Number.isFinite(n)) return value;
  return Math.min(range[1], Math.max(range[0], n));
}

export function limits(key) {
  return LIMITS[key];
}

function sanitise(raw) {
  const merged = Object.assign({}, DEFAULTS, raw || {});
  for (const key of Object.keys(LIMITS)) merged[key] = clamp(key, merged[key]);
  if (!['auto'].concat(LANGS).includes(merged.lang)) merged.lang = DEFAULTS.lang;
  if (!['auto', 'western', 'arabic'].includes(merged.numerals)) merged.numerals = DEFAULTS.numerals;
  if (!['voice', 'tap'].includes(merged.mode)) merged.mode = DEFAULTS.mode;
  if (!['name', 'sound'].includes(merged.letterMode)) merged.letterMode = DEFAULTS.letterMode;
  merged.autoHear = !!merged.autoHear;
  return merged;
}

/** A frozen snapshot — safe to hold for the lifetime of a screen. */
export function get() {
  return sanitise(profiles.settings());
}

export function set(patch) {
  profiles.patchSettings(patch);
  return get();
}

export function reset() {
  profiles.replaceSettings({});
  return get();
}

export function onChange(fn) {
  return profiles.onChange(() => fn(get()));
}

/** The language actually in use right now. */
export function lang() {
  const chosen = get().lang;
  return chosen === 'auto' ? detectLang() : chosen;
}

/** 'western' digits (123) or 'arabic' digits (١٢٣). */
export function numeralSystem() {
  const chosen = get().numerals;
  if (chosen !== 'auto') return chosen;
  return lang() === 'ar' ? 'arabic' : 'western';
}

/** Every number the child sees goes through here, so one setting covers them all. */
export function num(value) {
  return formatNumber(value, numeralSystem());
}
