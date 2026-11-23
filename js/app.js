// Router, menu and settings. Games are separate modules, imported on demand —
// the service worker precaches all of them, so one install brings every game
// and they keep working with the network off.
import { t, LANGS, LANG_LABEL, DIR } from './i18n.js';
import * as settings from './settings.js';
import * as profiles from './profiles.js';
import * as mastery from './mastery.js';
import { h, icon, clear } from './dom.js';
import { alphabet } from './alphabet.js';
import { hasVoice, voiceHelp } from './speech.js';
import { BUILD } from './version.js';
import * as sfx from './sound.js';

const app = document.getElementById('app');

const GAMES = [
  {
    id: 'numbers',
    titleKey: 'menu.numbers',
    subKey: 'menu.numbers.sub',
    accent: 'var(--tangerine)',
    sample: () => settings.num(7),
    hardPrefix: 'n:',
    hardLabel: (value) => settings.num(Number(value)),
    load: () => import('./games/say-number.js'),
  },
  {
    id: 'letters',
    titleKey: 'menu.letters',
    subKey: 'menu.letters.sub',
    accent: 'var(--sky)',
    sample: (lang) => alphabet(lang)[0].char,
    hardPrefix: ['l:', 's:'],
    hardLabel: (value) => value,
    load: () => import('./games/say-letter.js'),
  },
  {
    id: 'hear-number',
    titleKey: 'menu.hearnumbers',
    subKey: 'menu.hearnumbers.sub',
    accent: 'var(--lime)',
    glyphIcon: 'speaker',
    hardPrefix: 'hn:',
    hardLabel: (value) => settings.num(Number(value)),
    load: () => import('./games/hear-number.js'),
  },
  {
    id: 'hear-letter',
    titleKey: 'menu.hearletters',
    subKey: 'menu.hearletters.sub',
    accent: 'var(--berry)',
    glyphIcon: 'speaker',
    hardPrefix: ['hl:', 'hs:'],
    hardLabel: (value) => value,
    load: () => import('./games/hear-letter.js'),
  },
];

let screen = null;      // { destroy } of the live screen
let navToken = 0;
let installPrompt = null;

function applyLang() {
  const lang = settings.lang();
  document.documentElement.lang = lang;
  document.documentElement.dir = DIR[lang] || 'ltr';
  return lang;
}

function mount(node, handle) {
  if (screen && screen.destroy) screen.destroy();
  screen = handle || null;
  clear(app);
  if (node) app.append(node);
}

/* ---------------- menu ---------------- */

function renderMenu() {
  const lang = applyLang();

  const langbar = h('div', { class: 'langbar', role: 'group', 'aria-label': t('set.language', lang) },
    ['auto'].concat(LANGS).map((code) => h('button', {
      type: 'button',
      'aria-pressed': settings.get().lang === code ? 'true' : 'false',
      text: code === 'auto' ? t('set.language.auto', lang) : LANG_LABEL[code],
      onClick: () => {
        sfx.unlock();
        settings.set({ lang: code });
        renderMenu();
      },
    })));

  const tiles = h('div', { class: 'tiles' }, GAMES.map((game) => {
    const hard = mastery.troubleSpots(game.hardPrefix, 4);
    return h('button', {
      class: 'tile',
      type: 'button',
      style: '--tile-accent:' + game.accent,
      onClick: () => { sfx.unlock(); location.hash = '#/' + game.id; },
    }, [
      h('span', { class: 'tile__glyph' }, [
        game.glyphIcon ? icon(game.glyphIcon) : game.sample(lang),
      ]),
      h('span', { class: 'tile__body' }, [
        h('span', { class: 'tile__title', text: t(game.titleKey, lang) }),
        h('span', { class: 'tile__sub', text: t(game.subKey, lang) }),
        hard.length ? h('span', { class: 'tile__hard' }, [
          h('span', { class: 'tile__hard-label', text: t('practice.title', lang) }),
        ].concat(hard.map((row) => h('span', { class: 'hardchip', text: game.hardLabel(row.value) })))) : null,
      ]),
      h('span', { class: 'tile__chev' }, [icon('chevron')]),
    ]);
  }));

  /* Grown-up controls live together in the header, out of the way of the
     tiles: the child's half of the screen is the tiles and nothing else. */
  const acts = h('div', { class: 'menu__acts' }, [
    h('button', {
      class: 'chip',
      type: 'button',
      onClick: () => { location.hash = '#/profiles'; },
    }, [
      h('span', { class: 'chip__avatar', text: profiles.active().avatar }),
      h('span', { class: 'chip__name', text: profiles.active().name || t('profile.unnamed', lang) }),
    ]),
  ]);

  if (installPrompt) {
    acts.append(h('button', {
      class: 'icon-btn',
      'data-hot': true,
      type: 'button',
      'aria-label': t('menu.install', lang),
      title: t('menu.install', lang),
      onClick: async () => {
        const prompt = installPrompt;
        installPrompt = null;
        await prompt.prompt();
        renderMenu();
      },
    }, [icon('plus')]));
  }

  acts.append(h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': t('menu.settings', lang),
    title: t('menu.settings', lang),
    onClick: () => { location.hash = '#/settings'; },
  }, [icon('gear')]));

  mount(h('div', { class: 'menu' }, [
    h('header', { class: 'menu__head' }, [
      h('h1', { class: 'menu__name', text: t('app.name', lang) }),
      acts,
    ]),
    h('p', { class: 'menu__tag', text: t('menu.tagline', lang) }),
    langbar,
    tiles,
  ]));
}

/* ---------------- settings ---------------- */

function segment(lang, label, hint, options, value, onPick) {
  return h('div', { class: 'row' }, [
    h('span', { class: 'row__label', text: label }),
    h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map((option) => h('button', {
      type: 'button',
      'aria-pressed': option.value === value ? 'true' : 'false',
      text: option.label,
      onClick: () => { sfx.tick(); onPick(option.value); },
    }))),
    hint ? h('span', { class: 'row__hint', text: hint }) : null,
  ]);
}

function stepper(lang, label, hint, key, value) {
  const [low, high] = settings.limits(key);
  const step = (delta) => () => {
    sfx.tick();
    settings.set({ [key]: value + delta });
    renderSettings();
  };
  return h('div', { class: 'row' }, [
    h('span', { class: 'row__label', text: label }),
    h('div', { class: 'stepper' }, [
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': '-', disabled: value <= low, onClick: step(-1),
      }, [icon('minus')]),
      h('span', { class: 'stepper__val', text: settings.num(value) }),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': '+', disabled: value >= high, onClick: step(1),
      }, [icon('plus')]),
    ]),
    hint ? h('span', { class: 'row__hint', text: hint }) : null,
  ]);
}

function renderSettings() {
  const lang = applyLang();
  const cfg = settings.get();
  const [low, high] = settings.limits('goal');

  const body = h('div', { class: 'sheet__body' });

  // A language with no voice on this device can still be played by ear-free
  // tapping, so it stays pickable — but the row says so, and says where the
  // voices live, right where the language was chosen.
  const voice = hasVoice(lang) ? null : voiceHelp(lang);

  body.append(segment(
    lang,
    t('set.language', lang),
    voice ? voice.message + ' ' + voice.fix : null,
    ['auto'].concat(LANGS).map((code) => ({
      value: code,
      label: code === 'auto' ? t('set.language.auto', lang) : LANG_LABEL[code],
    })),
    cfg.lang,
    (value) => { settings.set({ lang: value }); renderSettings(); },
  ));

  body.append(segment(
    lang,
    t('set.digits', lang),
    t('set.digits.hint', lang),
    [1, 2, 3].map((n) => ({ value: n, label: settings.num(n) })),
    cfg.digits,
    (value) => { settings.set({ digits: value }); renderSettings(); },
  ));

  body.append(segment(
    lang,
    t('set.letters', lang),
    t('set.letters.hint', lang),
    [1, 2, 3].map((n) => ({ value: n, label: settings.num(n) })),
    cfg.letters,
    (value) => { settings.set({ letters: value }); renderSettings(); },
  ));

  body.append(segment(
    lang,
    t('set.lettermode', lang),
    t('set.lettermode.hint', lang),
    [
      { value: 'name', label: t('set.lettermode.name', lang) },
      { value: 'sound', label: t('set.lettermode.sound', lang) },
    ],
    cfg.letterMode,
    (value) => { settings.set({ letterMode: value }); renderSettings(); },
  ));

  body.append(stepper(
    lang,
    t('set.options', lang),
    t('set.options.hint', lang),
    'options',
    cfg.options,
  ));

  const goalValue = h('span', { class: 'stepper__val', text: settings.num(cfg.goal) });
  const step = (delta) => () => {
    sfx.tick();
    settings.set({ goal: cfg.goal + delta });
    renderSettings();
  };
  body.append(h('div', { class: 'row' }, [
    h('span', { class: 'row__label', text: t('set.goal', lang) }),
    h('div', { class: 'stepper' }, [
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': '-', disabled: cfg.goal <= low, onClick: step(-1),
      }, [icon('minus')]),
      goalValue,
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': '+', disabled: cfg.goal >= high, onClick: step(1),
      }, [icon('plus')]),
    ]),
    h('span', { class: 'row__hint', text: t('set.goal.hint', lang) }),
  ]));

  body.append(segment(
    lang,
    t('set.numerals', lang),
    null,
    [
      { value: 'auto', label: t('set.numerals.auto', lang) },
      { value: 'western', label: '123' },
      { value: 'arabic', label: '١٢٣' },
    ],
    cfg.numerals,
    (value) => { settings.set({ numerals: value }); renderSettings(); },
  ));

  body.append(h('div', { class: 'row' }, [
    h('button', {
      class: 'switch',
      type: 'button',
      'aria-pressed': cfg.autoHear ? 'true' : 'false',
      onClick: () => { sfx.tick(); settings.set({ autoHear: !cfg.autoHear }); renderSettings(); },
    }, [
      h('span', { class: 'row__label', text: t('set.autohear', lang) }),
      h('span', { class: 'switch__track' }),
    ]),
    h('span', { class: 'row__hint', text: t('set.autohear.hint', lang) }),
  ]));

  // Put where a parent looks when the app "doesn't hear" the child.
  body.append(h('div', { class: 'row' }, [
    h('span', { class: 'row__label', text: t('set.miccheck', lang) }),
    h('button', {
      class: 'ghost',
      type: 'button',
      onClick: () => { location.hash = '#/miccheck'; },
    }, [icon('mic'), h('span', { text: t('set.miccheck', lang) })]),
    h('span', { class: 'row__hint', text: t('set.miccheck.hint', lang) }),
  ]));

  body.append(h('button', {
    class: 'ghost',
    type: 'button',
    text: t('set.reset', lang),
    onClick: () => { settings.reset(); renderSettings(); },
  }));

  const updateBtn = h('button', {
    class: 'ghost',
    type: 'button',
    text: t('set.update', lang),
    onClick: (event) => {
      if (!navigator.onLine) {
        event.currentTarget.textContent = t('set.update.offline', lang);
        return;
      }
      event.currentTarget.textContent = t('set.update.busy', lang);
      hardRefresh();
    },
  });
  body.append(h('div', { class: 'row' }, [
    h('span', { class: 'row__label', text: t('set.version', lang) }),
    h('span', { class: 'build', text: BUILD }),
    updateBtn,
  ]));

  mount(h('div', { class: 'sheet' }, [
    h('header', { class: 'sheet__head' }, [
      h('button', {
        class: 'icon-btn',
        'data-flip': true,
        type: 'button',
        'aria-label': t('win.menu', lang),
        onClick: () => { location.hash = '#/'; },
      }, [icon('back')]),
      h('h1', { class: 'sheet__title', text: t('set.title', lang) }),
    ]),
    body,
  ]));
}

/* ---------------- profiles ---------------- */

function profileSummary(profile, lang) {
  let tries = 0;
  let hard = 0;
  const items = profile.stats && profile.stats.items ? profile.stats.items : {};
  for (const key of Object.keys(items)) {
    if (key[0] !== 'n' && key[0] !== 'l') continue;   // exact items only, not families
    if (key[1] !== ':') continue;
    const stat = items[key];
    tries += stat.n || 0;
    if (stat.miss || stat.slow) hard += 1;
  }
  return t('profile.progress', lang, {
    tries: settings.num(tries),
    hard: settings.num(hard),
    cards: settings.num(tries),
  });
}

function renderProfiles() {
  const lang = applyLang();
  const current = profiles.active();

  const list = h('div', { class: 'plist' }, profiles.all().map((profile) => {
    const isCurrent = profile.id === current.id;
    return h('div', { class: 'prow', 'data-active': isCurrent ? '' : false }, [
      h('button', {
        class: 'prow__pick',
        type: 'button',
        'aria-pressed': isCurrent ? 'true' : 'false',
        onClick: () => { sfx.tick(); profiles.setActive(profile.id); renderProfiles(); },
      }, [
        h('span', { class: 'prow__avatar', text: profile.avatar }),
        h('span', { class: 'prow__text' }, [
          h('span', { class: 'prow__name', text: profile.name || t('profile.unnamed', lang) }),
          h('span', {
            class: 'prow__meta',
            text: isCurrent ? t('profile.playing', lang) + ' · ' + profileSummary(profile, lang)
              : profileSummary(profile, lang),
          }),
        ]),
      ]),
      profiles.all().length > 1 ? h('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': t('profile.remove', lang),
        onClick: () => { profiles.remove(profile.id); renderProfiles(); },
      }, [icon('minus')]) : null,
    ]);
  }));

  const nameInput = h('input', {
    class: 'input',
    type: 'text',
    value: current.name,
    maxlength: '16',
    autocomplete: 'off',
    placeholder: t('profile.name.ph', lang),
    'aria-label': t('profile.name', lang),
    onInput: (event) => {
      const value = event.target.value;
      profiles.update(current.id, { name: value });
      const label = list.querySelector('.prow[data-active] .prow__name');
      if (label) label.textContent = value || t('profile.unnamed', lang);
    },
  });

  const editor = h('div', { class: 'row' }, [
    h('span', { class: 'row__label', text: t('profile.who', lang) }),
    nameInput,
    h('span', { class: 'row__label', style: 'margin-top:1em', text: t('profile.avatar', lang) }),
    h('div', { class: 'avatars' }, profiles.AVATARS.map((avatar) => h('button', {
      class: 'avatar',
      type: 'button',
      'aria-pressed': avatar === current.avatar ? 'true' : 'false',
      'aria-label': avatar,
      text: avatar,
      onClick: () => { profiles.update(current.id, { avatar }); renderProfiles(); },
    }))),
  ]);

  const body = h('div', { class: 'sheet__body' }, [
    list,
    editor,
    h('button', {
      class: 'btn',
      type: 'button',
      text: t('profile.add', lang),
      onClick: () => { sfx.tick(); profiles.create('', null); renderProfiles(); },
    }),
  ]);

  mount(h('div', { class: 'sheet' }, [
    h('header', { class: 'sheet__head' }, [
      h('button', {
        class: 'icon-btn',
        'data-flip': true,
        type: 'button',
        'aria-label': t('win.menu', lang),
        onClick: () => { location.hash = '#/'; },
      }, [icon('back')]),
      h('h1', { class: 'sheet__title', text: t('profile.title', lang) }),
    ]),
    body,
  ]));
}

/* ---------------- game ---------------- */

// Games and the mic check are loaded on demand and mount themselves into #app.
async function renderModule(load) {
  const token = ++navToken;
  applyLang();
  const module = await load();
  if (token !== navToken) return;      // navigated away while loading
  if (screen && screen.destroy) screen.destroy();
  screen = null;
  clear(app);
  screen = module.default(app);
}

function renderGame(game) {
  return renderModule(game.load);
}

/* ---------------- routing ---------------- */

function route() {
  const id = (location.hash || '').replace(/^#\/?/, '');
  navToken += 1;
  if (id === 'settings') return renderSettings();
  if (id === 'profiles') return renderProfiles();
  if (id === 'miccheck') return renderModule(() => import('./miccheck.js'));
  const game = GAMES.find((entry) => entry.id === id);
  if (game) return renderGame(game);
  return renderMenu();
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (!location.hash || location.hash === '#/') renderMenu();
});

route();

/* ---------------- staying current ---------------- */

const isDev = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

/** Throw away the installed app and fetch it again. */
export async function hardRefresh() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (window.caches) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch (_) { /* reload anyway: a partial clear still helps */ }
  location.reload();
}

if ('serviceWorker' in navigator) {
  if (isDev) {
    // On a dev server the worker is only ever in the way: it would serve the
    // files you just edited from last week's cache.
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {});
    if (window.caches) caches.keys().then((names) => names.forEach((name) => caches.delete(name))).catch(() => {});
  } else {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A new build has taken over. The page is still running the old code.
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((registration) => registration.update())
        .catch(() => { /* offline support is a bonus, not a blocker */ });
    });
  }
}
