# Say It! — numbers & letters

A small PWA for kids. A card appears, the child says it out loud, the app listens
and tells them whether they got it. English, French and Arabic, on one install.

Four games, in two directions:

| Game | The child | Card |
| --- | --- | --- |
| **Numbers** | says what they see | `7`, `42`, `318` |
| **Letters** | says what they see | `B`, `ب`, `A C F` |
| **Hear a number** | taps what they heard | the app says `42` |
| **Hear a letter** | taps what they heard | the app says "es" — or "sss" |

All four share the same loop: answer → a bulb lights up → fill every bulb →
**Youpi!** The listening games have no mic: the card is a big speaker to replay,
and the answer is one of several buttons (six by default, 2–9 in Settings).

Saying a thing and recognising it when you hear it are different skills, so a
child's record is kept separately for each — and, for letters, separately again
for names and sounds.

## The mic button

One button, three gestures, the same on a phone and on a desktop:

| Gesture | What happens |
| --- | --- |
| **Short press** | The mic latches on. It hears the child start, hears them stop, judges that answer and re-arms itself — wrong, try again; right, chime, next card, still listening. Hands-free for a whole round. |
| **Short press again** | Stops and judges what was just said, rather than throwing it away. |
| **Press and hold** | Talk while held, judged on release. Useful in a noisy room. |

If the engine puts a hypothesis on screen but never marks it final — which it
does, sporadically — that hypothesis is judged anyway after a short wait, rather
than left sitting there unanswered. Anything shown to the child gets an answer.

`Space` or `Enter` do the same two gestures from a keyboard. The button is orange
when idle, pulsing blue while listening, and green the moment it actually hears a
voice. After about a minute of silence it drops the mic by itself rather than
listen to an empty room.

---

## Run it

```bash
npm start            # http://localhost:8080
```

There is no build step. The whole app is plain ES modules, so the folder you edit
is the folder that runs.

The microphone needs a *secure context*: `localhost` counts, a plain
`http://192.168.x.x` does not. To try it on a phone, put the folder on any static
HTTPS host (GitHub Pages, Netlify, Cloudflare Pages — it is all static files),
open it, and use the browser's **Install** / **Add to home screen**. The app also
offers an Install button on the menu when the browser supports it.

## Running the latest version

Open **Settings** — the build id is at the bottom. `dev` means it came straight
off a dev server; anything else is the commit it was deployed from. **Check for
a new version** there throws away the installed copy and fetches it again, which
is the one-tap answer when a phone is showing something stale.

It should rarely be needed:

- `npm start` serves with `no-store` and the app **unregisters any service
  worker on localhost**, so a dev server is always showing your actual files.
- In production the worker is **network-first for code**: a reload picks up a new
  build whenever the network is reachable, and the cache is the fallback, not the
  source of truth.
- When a new build takes over, the open page reloads itself rather than keeping
  the old code running.
- Each deploy stamps a fresh cache name from the commit, so the new worker
  installs and the old cache is deleted.

If a phone is somehow still stale, Android Chrome: ⋮ → Settings → Site settings →
Storage → the site → Clear. iOS: delete the app from the home screen and
re-add it.

## Offline

The service worker precaches the shell and **every game**, so one install brings
all of them and the menu, cards, "Hear it" voice and tap mode keep working with
no network.

The one exception is voice *recognition*: browsers hand that to a speech service
that needs the network. When it is unavailable the game says so and tap mode —
four big answer buttons — takes over. Tap mode works offline, always.

## Children and repetition

Each child gets a profile (menu → the avatar chip): their own language, their own
card lengths, their own goal, their own record.

Every card is scored. A card that was answered wrong, or correctly but slowly,
gets a heavier weight and comes back more often; a card answered cleanly several
times in a row fades to roughly a third of its normal frequency — but never to
zero. "Too long" is measured against that child's own pace (a rolling average of
their clean answers), not a fixed stopwatch, so it adapts to a 3-year-old and a
7-year-old alike.

Trouble spreads to neighbours: a miss on 47 nudges the whole forties, a miss on
318 nudges the three hundreds. The menu tiles show each child's current trouble
spots.

## Settings

| Setting | What it does |
| --- | --- |
| Language | Device, English, French or Arabic. Arabic switches the whole app to RTL. |
| Number length | 1 digit (0–9), 2 (10–99) or 3 (100–999). |
| Letters per card | 1, 2 or 3 letters, said in order. |
| For letters, say the | **Name** — what the letter is called (`S` → "es"). **Sound** — how it is read inside a word (`S` → "sss"). Arabic sounds are the letter with a fatha: `ب` → "بَ". The two are tracked separately, because knowing the name of S is not knowing the noise it makes. |
| Answers to choose from | 2–9 buttons in the listening games. Six by default. |
| Cards to win | 3–30. This is the Youpi goal and the number of bulbs. |
| Number style | `123` or `١٢٣`. Follows the language by default. |
| Say the card for me first | The app pronounces each new card before the child answers. |

The mic / hand button in the top corner of a game switches between voice and tap
mode at any time.

## What the app accepts as "right"

Recognisers are inconsistent — ask for 42 and you get `42`, `forty two`,
`quarante-deux` or `٤٢`, depending on engine and language. So every transcript
(and every alternative the engine offers) is normalised — lower case, accents and
Arabic diacritics stripped, Arabic-Indic digits converted — then read twice: once
as digits, once as words. Letters are matched against the names a child actually
says, plus the near-misses engines return for them: `bee`, `bé`, `باء`, `double
you`, `i grec`. Runs like `A B C`, `abc` and `aybeesee` all count.

Saying a multi-digit number digit by digit ("four two" for 42) does **not** count
— the point is to say the number.

## Browser support

| | Voice mode | Tap mode | Install |
| --- | --- | --- | --- |
| Chrome / Edge (Android, desktop) | yes | yes | yes |
| Safari (iOS 14.5+) | yes, with a tap to start each time | yes | yes |
| Firefox | no speech recognition — falls back to tap | yes | no |

Text-to-speech ("Hear it") depends on the voices installed on the device. Arabic
voices are missing on some desktops; Android and iOS ship them. A card is never
handed to a voice in the wrong language — one would read `٧` as "seven" — so
when the device has no voice for the current language, "Hear it" goes quiet and
the app names the settings path that adds one, per platform (Android, iOS,
macOS, Windows, Linux). The same line appears under Language in Settings.

## Layout

```
index.html              shell
manifest.webmanifest    install metadata
sw.js                   precache: shell + every game
css/app.css             one stylesheet
js/
  app.js                router, menu, settings, children
  i18n.js               en / fr / ar strings, locales, direction
  settings.js           per-child settings, with limits
  profiles.js           the children and their stored data
  mastery.js            weights: what to show more often
  speech.js             mic in, voice out
  match.js              normalising and judging what was heard
  alphabet.js           the three alphabets and their spoken names
  prompt-game.js        the shared card loop, mic console, celebration
  sound.js  confetti.js dom.js
  games/
    say-number.js       say the number you see
    say-letter.js       say the letter you see
    hear-number.js      hear a number, tap it
    hear-letter.js      hear a letter, tap it
tools/make-icons.py     regenerates icons/ (npm run icons)
tests/                  see below
```

## Adding a game

A game is one file that describes its cards and how to judge them; everything
else — mic, progress, voice, celebration — comes from `prompt-game.js`.

```js
import { createPromptGame } from '../prompt-game.js';

export default createPromptGame({
  id: 'colours',
  domain: 'colours',                       // bucket for timing averages
  promptKey: () => 'prompt.colour',        // i18n key above the card
  keys: (round) => ['c:' + round.name],    // what mastery tracks
  makeRound(cfg, lang, previous) { … },
  glyph(round, cfg) { return ['🟥']; },    // one string per tile on the card
  ttsText(round, lang) { … },              // what "Hear it" says
  check(transcripts, round, lang) { … },   // true if they said it
  decoys(round, cfg, lang) { … },          // wrong answers for the tap buttons
});
```

A listening game adds `listen: true`: the shell drops the mic, says the card
itself, turns the card into a replay button, and asks `answer(round)` for the
right button and `optionCount(cfg)` for how many to show.

```js
export default createPromptGame({
  id: 'hear-colour',
  listen: true,
  glyph: () => [],                         // the card is a replay button
  answer: (round) => round.swatch,         // the button that is correct
  ttsText: (round) => round.name,          // what the voice says
  optionCount: (cfg) => cfg.options,
  …
});
```

Then: add an entry to `GAMES` in `js/app.js`, add the file to `SHELL` in `sw.js`
so it ships with the install, add its strings to `js/i18n.js`, and bump `VERSION`
in `sw.js`.

## Deploy

`.github/workflows/deploy.yml` runs both test suites and publishes to GitHub
Pages on every push to `main`.

One-time setup: push the repo, then **Settings → Pages → Source → GitHub
Actions**. The site lands at `https://<user>.github.io/<repo>/`; every path in
the app is relative, so a sub-path host needs no configuration.

The deploy copies only what the app needs (`index.html`, `manifest.webmanifest`,
`sw.js`, `css/`, `js/`, `icons/`) and stamps the commit SHA into the service
worker's cache name. That stamp matters: a service worker only takes over when
its own bytes change, and only drops stale files when its cache name changes —
without it, every installed app would stay on the version it first saw.

## Tests

```bash
npm test               # the matcher: numbers and letters in all three languages
npm start              # in another shell
npm run test:browser   # the real game loop, profiles and mastery, in Chrome
```

`npm run test:browser` prints a `PASS n` / `FAIL n` title and the per-check lines.
