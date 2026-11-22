// One profile per child: their own settings, and their own record of what they
// find hard. Everything lives in one localStorage blob so a switch is instant.
const KEY = 'say-it:profiles:v1';

export const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐧', '🐙', '🦄', '🐝', '🐳', '🐥'];

function blank(name, avatar) {
  return {
    id: 'p' + Math.random().toString(36).slice(2, 9),
    name: name,
    avatar: avatar,
    settings: {},
    stats: { items: {}, meta: {} },
  };
}

function read() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (_) {
    saved = null;
  }
  if (!saved || !Array.isArray(saved.list) || !saved.list.length) {
    const first = blank('', AVATARS[0]);
    return { activeId: first.id, list: [first] };
  }
  for (const profile of saved.list) {
    if (!profile.settings) profile.settings = {};
    if (!profile.stats || typeof profile.stats !== 'object') profile.stats = { items: {}, meta: {} };
    if (!profile.stats.items) profile.stats.items = {};
    if (!profile.stats.meta) profile.stats.meta = {};
  }
  if (!saved.list.some((p) => p.id === saved.activeId)) saved.activeId = saved.list[0].id;
  return saved;
}

let state = read();
const watchers = new Set();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (_) { /* private mode: in-memory only */ }
  for (const fn of watchers) fn(state);
}

export function onChange(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

export function all() {
  return state.list;
}

export function active() {
  return state.list.find((p) => p.id === state.activeId) || state.list[0];
}

export function setActive(id) {
  if (state.list.some((p) => p.id === id)) {
    state.activeId = id;
    commit();
  }
  return active();
}

export function create(name, avatar) {
  const profile = blank(String(name || '').trim(), avatar || AVATARS[state.list.length % AVATARS.length]);
  state.list.push(profile);
  state.activeId = profile.id;
  commit();
  return profile;
}

export function update(id, patch) {
  const profile = state.list.find((p) => p.id === id);
  if (!profile) return null;
  Object.assign(profile, patch);
  commit();
  return profile;
}

export function remove(id) {
  if (state.list.length <= 1) return false;   // always keep one child
  state.list = state.list.filter((p) => p.id !== id);
  if (!state.list.some((p) => p.id === state.activeId)) state.activeId = state.list[0].id;
  commit();
  return true;
}

/* ---------------- the active profile's data ---------------- */

export function settings() {
  return active().settings;
}

export function patchSettings(patch) {
  const profile = active();
  profile.settings = Object.assign({}, profile.settings, patch);
  commit();
  return profile.settings;
}

export function replaceSettings(next) {
  const profile = active();
  profile.settings = Object.assign({}, next);
  commit();
  return profile.settings;
}

export function stats() {
  return active().stats;
}

export function saveStats() {
  commit();
}
