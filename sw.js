// One install brings every game. The shell and all game modules are precached
// on first load, so the menu, the cards, the voice-out and tap mode keep
// working with the network off. (Voice *recognition* still calls out to the
// browser's speech service — that is the one part the network gates.)
const VERSION = 'say-it-v2';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/i18n.js',
  'js/settings.js',
  'js/version.js',
  'js/profiles.js',
  'js/mastery.js',
  'js/speech.js',
  'js/match.js',
  'js/alphabet.js',
  'js/sound.js',
  'js/confetti.js',
  'js/dom.js',
  'js/prompt-game.js',
  'js/miccheck.js',
  'js/games/say-number.js',
  'js/games/say-letter.js',
  'js/games/hear-number.js',
  'js/games/hear-letter.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Icons and fonts barely change: serve them from the cache.
// Code and markup are network-first, so a reload always picks up a new build
// and only falls back to the cache when the network is unreachable. Cache-first
// code is how an installed app gets stuck on the version it first saw.
const STATIC = /\.(png|svg|jpe?g|webp|woff2?|ttf)$/i;
const NET_TIMEOUT = 3000;

function fromCache(request) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    if (request.mode === 'navigate') {
      return caches.match('index.html').then((shell) => shell || caches.match('./'));
    }
    return undefined;
  });
}

function store(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
}

function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // A slow network must not stall the app: fall back to the cached copy.
    const timer = setTimeout(() => {
      fromCache(request).then((hit) => { if (hit) done(hit); });
    }, NET_TIMEOUT);

    fetch(request)
      .then((response) => { clearTimeout(timer); done(store(request, response)); })
      .catch(() => {
        clearTimeout(timer);
        fromCache(request).then((hit) => done(hit || Response.error()));
      });
  });
}

function cacheFirst(request) {
  return caches.match(request).then((hit) => hit || fetch(request).then((response) => store(request, response)));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(STATIC.test(url.pathname) ? cacheFirst(request) : networkFirst(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
