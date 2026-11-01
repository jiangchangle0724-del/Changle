# changle.ca hand-off

For the next engineer or coding assistant working on [changle.ca](https://changle.ca): adding
games, changing the site, or the tools. Written 2026-10-30. Product rules: `site/PRODUCT.md`.
Look and motion: `site/DESIGN.md`. Content files and local scripts: `site/README.md` (Chinese).

## What changle.ca is made of

| Address | Code | Runs on | Goes live |
| --- | --- | --- | --- |
| changle.ca: the party games, tools tab, accounts, big screen at `/tv` | `site/` (Vite, React, TypeScript) | Cloudflare Pages project `changle` | by itself when a PR touching `site/` is merged into `main` |
| rooms.changle.ca: online tables, accounts, friends, chat, wishlist, avatar drawing | `site/worker/`, plus what it bundles from the site: `site/src/shared/` (game rules, protocol), `site/src/data/` (question banks) and `site/src/i18n.ts` | Cloudflare Worker `changle-rooms` (Durable Objects) | by itself on merge when any of those (or `site/package-lock.json`) change (Workers Builds) |
| changle.ca/trip: 到此一游 | `games/been-there/` | Worker `been-there` | by itself on merge (Cloudflare Workers Builds) |
| changle.ca/eat: 随便 | `tools/suibian/` | Worker `suibian` | by itself on merge when `tools/suibian/*` changes |

There is no root workspace: each folder has its own `package.json` and `package-lock.json` and
installs on its own. Node 22, as in CI.

## How a change reaches changle.ca

1. Branch from `main` (one branch per change), commit, push, open a PR.
2. CI must be green: `.github/workflows/site.yml` (site: tsc, engine, trip and draw tests, build),
   `suibian.yml` and `been-there.yml` (each with browser tests in Chromium and WebKit).
3. The owner (Steve) says yes, then merge. Merging deploys, as in the table above; each Cloudflare
   build shows up as a check on the merge commit ("Cloudflare Pages", "Workers Builds: ...").
4. The rooms Worker's Cloudflare settings: root directory `/site`, no build command, deploy command
   `npx wrangler deploy -c worker/wrangler.jsonc`, build watch paths `site/worker/*`,
   `site/src/shared/*`, `site/src/data/*`, `site/src/i18n.ts`, `site/package-lock.json`. If the
   worker starts bundling another file, add its path there. By hand, if ever needed:
   `cd site && npx wrangler login && npx wrangler deploy -c worker/wrangler.jsonc`, or on the
   owner's Windows PC `site/deploy/pc-deploy.cmd` (installs, builds, deploys the rooms Worker and
   uploads the site).

Access needed: push access to this GitHub repository. A Cloudflare login only to change settings
or deploy by hand. Never the values of any secret.

## Run the site locally

```sh
cd site
npm ci
npx wrangler dev -c worker/wrangler.jsonc --port 8787 --ip 127.0.0.1   # rooms server
VITE_ROOMS_URL=ws://127.0.0.1:8787 npm run dev -- --port 5173           # the site: http://127.0.0.1:5173
```

Sign-in codes without email: `DEV_SHOW_CODES=1` in `site/worker/.dev.vars` (git-ignored). Avatar
drawing without a key: `DEV_FAKE_DRAW=1` there. 到此一游 and 随便 are separate Workers; to reach
them from the site, run `npm run build && npx wrangler dev --port 8799` in `games/been-there` and
`npm run build && npx wrangler dev --port 8798` in `tools/suibian` (the site's `/trip` and `/eat`
are proxied there, see `site/vite.config.ts`).

## Tests

```sh
cd site
npx tsc --noEmit
npx tsx tests/engine.test.ts    # every game's rules, as the rooms server runs them
npx tsx tests/trip.test.ts
npx tsx tests/draw.test.ts
npm run build
```

Phones in a browser, with both local servers above running (Python 3 with Playwright:
`pip install playwright && playwright install chromium`):

```sh
python3 scripts/local_check.py     # one phone: every game opens and plays a turn
python3 scripts/net_test.py        # four phones at one table, online
python3 scripts/party_test.py      # the newer games, one phone and online
python3 scripts/tv_test.py         # the big screen
python3 scripts/account_check.py   # sign-in, profile, friends, chat
```

The other apps: `npm run typecheck`, `npm test`, `npm run test:e2e` in `tools/suibian` or
`games/been-there`.

## Add a party game to the site

Every game plays on one phone passed round and online with every phone. Start by copying the game
closest to yours: `wheel` or `dice` for a small one, `superlatives` or `postit` for one with its own
folder under `site/src/party/`. TypeScript flags most of what's missing.

1. **Rules**: `site/src/shared/engine/games/<id>.ts` exports a `GameDef` (`init`, `act`, `view`,
   and `timer`, `join`, `leave` when needed; the `Api` it gets is in
   `site/src/shared/engine/api.ts`). Register it in `site/src/shared/engine/games/index.ts`.
   Online, these rules run on the rooms server, which Cloudflare redeploys when they change.
2. **Protocol**: in `site/src/shared/protocol.ts`, add the id to `GameId`, `ONLINE_GAMES` (board
   order) and `ONLINE_MIN`; write its view type (`id: "<id>"`) and add it to `GameView`. `view()`
   builds each phone's own view: whatever must stay secret (words, votes, hands) never goes into
   another player's view.
3. **Card on the board**: `site/src/games/registry.ts`, the same id in its `GameId` and an entry in
   `GAMES`: name, blurb and how-to in Chinese and English, min and max players, `gel` (its stage
   color; the board runs in spectrum order, so place it by color), a lucide icon, `ready: true`,
   `isNew: true`, and `solo` if one-phone play differs.
4. **One-phone screen**: `site/src/games/<Name>.tsx` or `site/src/party/<id>/<Name>.tsx`; lazy-load it
   and add a `case` in `site/src/App.tsx`.
5. **Online screen**: `Net<Name>.tsx` beside it; add a `case` in `site/src/online/games/NetGame.tsx`.
6. **Content**: `site/src/data/<id>.ts`, every line as `{ zh, en }`; buttons and hints in
   `site/src/i18n.ts`.
7. **Tests**: a `test("<id>: ...")` block in `site/tests/engine.test.ts`. The browser scripts find
   tiles by board position, so add the id to `ORDER` in `site/scripts/net_test.py` and
   `site/scripts/party_test.py`.
8. **Docs**: the game lists in `site/README.md` and `site/PRODUCT.md`.

House rules for a game (the full set is in `site/PRODUCT.md`): Chinese and English are both
first-class and switch mid-game; one action per screen, big targets, contrast for a dim room;
every round ends in a penalty moment, made with `api.penalty(...)`, which the penalty stamp shows
in the host's chosen penalty (drinking unless changed in settings); reduced motion respected;
playable without sound and without motion sensors; nothing needs a sign-in.

## A bigger game with its own Worker (the 到此一游 pattern)

`games/been-there` is its own Worker at changle.ca/trip (routes in its `wrangler.jsonc`), started
from a site table through a small hand-off: `site/src/party/trip/link.ts`, the stand-in rules in
`site/src/shared/engine/games/trip.ts`, and `NetTrip.tsx` and `TripSolo.tsx`. Use this when a game
needs its own server, art or big-screen show. A new one gets its own folder under `games/`, routes
under changle.ca, a Cloudflare Workers Builds connection with that folder as root, and a workflow
like `.github/workflows/been-there.yml`. Another session has been working on 到此一游: check its
open PRs before changing `games/been-there`.

## A tool (the 随便 pattern)

`tools/suibian` is its own Worker at changle.ca/eat; its card in the site's Tools tab is
`site/src/tools/Suibian.tsx`. Its state, settings and open items: `tools/suibian/HANDOFF.md`. Tools
that need no server (exchange rates, world clock, unit price) live in `site/src/tools/`.

## Settings (names only, never the values)

| App | Secrets (Cloudflare) | Other variables |
| --- | --- | --- |
| rooms Worker `changle-rooms` (`site/worker`) | `RESEND_API_KEY` (sign-in emails), `GEMINI_API_KEY` (anime avatars) | `MAIL_FROM`, `ADMIN_EMAILS` (in `site/worker/wrangler.jsonc`); `GEMINI_IMAGE_MODEL` (optional); `DEV_SHOW_CODES`, `DEV_FAKE_DRAW` (local only) |
| site front end | none | `VITE_ROOMS_URL` (local dev: where the rooms server is) |
| 随便 (`tools/suibian`) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `GOOGLE_PLACES_KEY` | `ALLOW_TEST_SETTINGS` (tests only) |
| 到此一游 (`games/been-there`) | none | `ALLOW_TEST_SETTINGS`, `STANDALONE` (local only) |

GitHub Actions use no secrets. Locally, secrets go in a git-ignored `.dev.vars` next to the
Worker's `wrangler.jsonc`.

## Working rules

* Every change on its own branch with a PR. Never push to `main`. CI green before merging.
* Ask the owner before merging, deploying, or anything that costs money or goes public.
* No keys, secrets or tokens in code, commits, chat or screenshots: Cloudflare Secrets only.
* Stuck? Stop and say what is needed instead of working around it.

## Open items

* The rooms Worker was connected to Git on 2026-10-31; its first build from Git ran on the merge of
  PR #34 (2026-11-01) and deployed fine.
* 随便: its severe-allergy table is a draft, and two small things showed up once real restaurants
  were on. See `tools/suibian/HANDOFF.md`.
