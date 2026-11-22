// What this child finds hard, and how often to bring it back.
//
// Every card is tagged with keys: the exact item plus the families it belongs
// to ("40s", "300s"). Misses and slow answers raise a key's weight, quick clean
// answers lower it, and cards are drawn with weighted random sampling — so a
// letter they fumbled yesterday shows up several times more often than one they
// already own, without ever disappearing completely.
import * as profiles from './profiles.js';

const MIN_WEIGHT = 0.3;
const MAX_WEIGHT = 8;
const FRESH_WEIGHT = 1.4;      // never seen: worth a look, not an emergency
const SLOW_FLOOR = 2500;       // ms: below this, nothing counts as slow
const SLOW_FALLBACK = 6000;    // ms: before we know this child's pace

function items() {
  return profiles.stats().items;
}

function meta(domain) {
  const all = profiles.stats().meta;
  if (!all[domain]) all[domain] = { ema: 0, count: 0 };
  return all[domain];
}

function entry(key) {
  const store = items();
  if (!store[key]) store[key] = { n: 0, miss: 0, slow: 0, ms: 0 };
  return store[key];
}

/** How long is "too long" for this child, in this game, right now? */
export function slowThreshold(domain) {
  const m = meta(domain);
  if (m.count < 3 || !m.ema) return SLOW_FALLBACK;
  return Math.max(SLOW_FLOOR, m.ema * 1.7);
}

/** Weight of a single key: 1 is neutral, higher means "show this more". */
function keyWeight(key) {
  const stat = items()[key];
  if (!stat || !stat.n) return FRESH_WEIGHT;
  const missRate = stat.miss / stat.n;
  const slowRate = stat.slow / stat.n;
  let weight = 1 + (2.2 * missRate) + (1.2 * slowRate);
  if (stat.miss === 0 && stat.slow === 0) {
    // Clean every time: ease off, faster the more often it has been proven.
    weight *= stat.n >= 4 ? 0.45 : 0.7;
  }
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight));
}

/**
 * Weight of a card. The exact item counts for half, the hardest family it
 * belongs to for the other half, so trouble generalises across a family.
 */
export function weightFor(keys) {
  if (!keys || !keys.length) return 1;
  const exact = keyWeight(keys[0]);
  if (keys.length === 1) return exact;
  let family = 0;
  for (let i = 1; i < keys.length; i += 1) family = Math.max(family, keyWeight(keys[i]));
  return (exact * 0.5) + (family * 0.5);
}

/** Draw one candidate, favouring the ones this child struggles with. */
export function pick(candidates, keysOf) {
  if (!candidates.length) return null;
  const weights = candidates.map((candidate) => weightFor(keysOf(candidate)));
  let total = 0;
  for (const w of weights) total += w;
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** A wrong attempt, logged the moment it happens so a walk-away still counts. */
export function recordMiss(keys) {
  for (const key of keys) entry(key).miss += 1;
  profiles.saveStats();
}

/**
 * The card is finished. `ms` is how long it took from the card appearing.
 * A skipped card counts as a miss; a slow correct answer counts as slow.
 */
export function recordDone(domain, keys, outcome) {
  const ms = Math.max(0, Math.round(outcome.ms || 0));
  const slow = outcome.correct && ms > slowThreshold(domain);

  for (const key of keys) {
    const stat = entry(key);
    stat.n += 1;
    if (!outcome.correct) stat.miss += 1;
    if (slow) stat.slow += 1;
    stat.ms = stat.ms ? Math.round((stat.ms * 0.6) + (ms * 0.4)) : ms;
  }

  if (outcome.correct && !outcome.misses && ms > 0) {
    // Only clean answers shape the pace we compare against.
    const m = meta(domain);
    m.ema = m.ema ? Math.round((m.ema * 0.75) + (ms * 0.25)) : ms;
    m.count += 1;
  }

  profiles.saveStats();
  return { slow };
}

/** The exact items this child should practise, hardest first. */
export function troubleSpots(prefix, count) {
  const prefixes = [].concat(prefix);
  const store = items();
  const rows = [];
  for (const key of Object.keys(store)) {
    const hit = prefixes.find((p) => key.startsWith(p));
    if (!hit) continue;
    const stat = store[key];
    if (!stat.n || (!stat.miss && !stat.slow)) continue;
    rows.push({ key, value: key.slice(hit.length), weight: keyWeight(key), miss: stat.miss, slow: stat.slow });
  }
  rows.sort((a, b) => b.weight - a.weight);
  return rows.slice(0, count || 5);
}
