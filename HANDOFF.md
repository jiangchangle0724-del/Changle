# changle.ca hand-off

For the next engineer or coding assistant working on [changle.ca](https://changle.ca): adding
games, changing the site, or the tools. Written 2026-10-30. Product rules: `site/PRODUCT.md`.
Look and motion: `site/DESIGN.md` (what is live) and `docs/DESIGN.md` (the shared design system it is
moving to: tokens in `site/src/styles/tokens.css`, component interfaces in `site/src/ui/types.ts`).
Content files and local scripts: `site/README.md` (Chinese).

## What changle.ca is made of

| Address | Code | Runs on | Goes live |
| --- | --- | --- | --- |
| changle.ca: the party games (a game's card at `/g/<slug>`, the game at `/g/<slug>/play`), tables at `/t/<CODE>`, tools tab, accounts, big screen at `/tv`, DJ booth at `/dj` (addresses: `site/src/router.ts`) | `site/` (Vite, React, TypeScript) | Cloudflare Pages project `changle` | by itself when a PR touching `site/` is merged into `main` |
| rooms.changle.ca: online tables, accounts, friends, chat, wishlist, avatar drawing, and the mail other changle.ca Workers send (the `Mail` entrypoint, `site/worker/mail.ts`: service bindings only, no public address) | `site/worker/`, plus what it bundles from the site: `site/src/shared/` (game rules, protocol), `site/src/data/` (question banks) and `site/src/i18n.ts` | Cloudflare Worker `changle-rooms` (Durable Objects) | by itself on merge when any of those (or `site/package-lock.json`) change (Workers Builds) |
| changle.ca/trip: 到此一游 | `games/been-there/` | Worker `been-there` | by itself on merge (Cloudflare Workers Builds) |
| changle.ca/hide: 藏在人群里 · Hide in the Crowd | `games/hide-crowd/` | Worker `hide-crowd` (Durable Objects) | by itself on merge when `games/hide-crowd/*` changes, once Steve has connected it (`games/hide-crowd/README.md`) |
| changle.ca/eat: 随便 | `tools/suibian/` | Worker `suibian` | by itself on merge when `tools/suibian/*` changes |
| changle.ca/when: 约时间 · When Works (friends find a time to meet: a gathering's page is changle.ca/when/CODE; its card is the first one in the Tools tab) | `tools/when/` | Worker `when` (Durable Objects: one per gathering, and the daily allowances) | by itself on merge when `tools/when/*` changes (connected 2026-11-12, `tools/when/README.md`) |
| changle.ca/go: 玩什么 · What's On (events, every morning at 06:00) | `tools/events/` | Worker `changle-events` (D1, KV, a daily cron), and a GitHub job at 05:50 for two libraries (`.github/workflows/events-libraries.yml`) | by itself on merge when `tools/events/*` changes (connected 2026-11-01, `tools/events/README.md`) |
| changle.ca/tuan: 跟一单 · Count Me In (group buys: a merchant posts one, buyers order from the link without signing in, the money goes straight from buyer to merchant; only the API so far: its pages answer "not found" until they're built) | `tools/tuan/` | Worker `tuan` (D1; asks the rooms server who a merchant's sign-in belongs to, and has it send the new-order mails, through service bindings; a timer every ten minutes) | by itself on merge when `tools/tuan/*` changes (connected 2026-11-13, `tools/tuan/README.md`) |
| changle.ca/party: 一起跳 · Dance Along: rooms, the speaker page (it opens its room by itself and has nothing to press: one tap to set up its sound, and the phones do the rest; it speaks the host's language; a 3D coach; each practice dance's own tune; songs from YouTube, every one's beat measured in its video, fourteen danced to their own famous dance and taught step by step (the Cha-Cha Slide call by call); the dance waits when the video stops; the TV's delay measured when the host asks; 暂停; a phone mirrored to the TV as the stage, sideways), phones, /party/moves | `games/party-server/`, on the shared base `games/party-base/` and the move library `games/dance/` (pure logic and data, no deploy of their own) | Worker `party` (Durable Objects: the rooms, and the songbook, unused since 12 November) | by itself on merge when `games/party-server`, `games/party-base` or `games/dance` changes (connected 2026-11-01, `games/party-server/README.md`) |
| changle.ca/hang-on: 抓紧了 · Hang On (the host screen; phones at /hang-on/pad, the QR code's link /hang-on/r/CODE) | `games/hang-on/` (physics, the room server, the pages) | Worker `hang-on` (Durable Objects) | by itself on merge when `games/hang-on/*` changes (connected 2026-11-04, `games/hang-on/README.md`) |

There is no root workspace: each folder has its own `package.json` and `package-lock.json` and
installs on its own. Node 22, as in CI.

## How a change reaches changle.ca

1. Branch from `main` (one branch per change), commit, push, open a PR.
2. CI must be green: `.github/workflows/site.yml` (site: tsc, engine, DJ booth, trip, hide, draw,
   cutout, performer and design-token tests, build), `suibian.yml`, `been-there.yml` and
   `hide-crowd.yml` (each with browser tests in Chromium and WebKit), `events.yml` (What's On:
   parsers and a whole run, in the Workers runtime), and `party.yml` (the party base's tests, the
   party server's types, tests and build). They run once per change: on the pull request (a newer
   push stops the older run), and on `main` after each merge, not again for every push to a branch.
   GitHub Actions minutes cost money once the free plan's monthly allowance is used up (it ran out
   on 2026-11-03), so a new workflow follows the same pattern (`branches: [main]` under `push`, and
   the `concurrency` block).
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
npx tsx tests/dj.test.ts        # the DJ booth's player (on a pretend audio thread) and stand-in DJ
npx tsx tests/dj-presets.test.ts # the DJ booth's 12 style presets for Lyria
npx tsx tests/trip.test.ts
npx tsx tests/hide.test.ts      # 藏在人群里's stand-in rules at a table
npx tsx tests/draw.test.ts
npx tsx tests/mail.test.ts      # the Mail entrypoint's checks on a notice and the mail it makes (worker/notice.ts)
npx tsx tests/performer.test.ts # Name That Tune's two dancers, every move frame by frame
npx tsx tests/tokens.test.ts    # design tokens match global.css; src/ui uses tokens only
npx tsx tests/routes.test.ts    # every page's address, and links from before (#/g/..., #/r/...)
npm run build
```

Phones in a browser, with both local servers above running (Python 3 with Playwright:
`pip install playwright && playwright install chromium`):

```sh
python3 scripts/local_check.py     # one phone: every game opens and plays a turn
python3 scripts/net_test.py        # four phones at one table, online
python3 scripts/watch_players_check.py # three players and a seat that just watches: no game counts it
python3 scripts/party_test.py      # the newer games, one phone and online
python3 scripts/tv_test.py         # the big screen
python3 scripts/watch_test.py      # every game's own big-screen view, on two TVs and a phone that only watches
python3 scripts/account_check.py   # sign-in, profile, friends, chat
python3 scripts/mail_door_check.py # the Mail entrypoint end to end (needs scripts/fake_mail.mjs and a stand-in Worker: see its header)
python3 scripts/tune_quiz_check.py # Name That Tune's multiple choice, 20 songs, sound on, memory watched
python3 scripts/dj_check.py        # the DJ booth's speaker in WebKit and Chromium, and a table of phones
```

`dj_check.py` needs WebKit too: `playwright install webkit`.

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
   `GAMES`: its `slug` (its address, changle.ca/g/<slug>: English words joined by `-`, never changed
   once live), name, blurb and how-to in Chinese and English, min and max players, `gel` (its stage
   color; the board runs in spectrum order, so place it by color), a lucide icon, `ready: true`,
   `isNew: true`, and `solo` if one-phone play differs. `npm run build` then writes its page for
   search engines and share cards (`site/scripts/postbuild.ts`).
4. **One-phone screen**: `site/src/games/<Name>.tsx` or `site/src/party/<id>/<Name>.tsx`; lazy-load it
   and add a `case` in `site/src/App.tsx`.
5. **Online screen**: `Net<Name>.tsx` beside it; add a `case` in `site/src/online/games/NetGame.tsx`.
6. **Content**: `site/src/data/<id>.ts`, every line as `{ zh, en }`; buttons and hints in
   `site/src/i18n.ts`.
7. **Tests**: a `test("<id>: ...")` block in `site/tests/engine.test.ts`. The browser scripts find
   tiles by board position, so add the id to `ORDER` in `site/scripts/net_test.py` and
   `site/scripts/party_test.py`.
8. **Docs**: the game lists in `site/README.md` and `site/PRODUCT.md`.

Two hooks for a game that a big screen runs (the DJ booth, `site/src/shared/dj/CONTRACTS.md`):
`GameDef.auto` starts the game when a big screen opens a table for it, and `GameDef.screen` hears
the game actions a big screen sends (`RoomEngine.screenAct`; a screen never acts for a seat). A
game not ready for the board yet gets `hidden: true` in the registry: no tile anywhere (not even
coming soon), only its own address, and a table's lobby shows it only while it is the game up.

House rules for a game (the full set is in `site/PRODUCT.md`): Chinese and English are both
first-class and switch mid-game; one action per screen, big targets, contrast for a dim room;
every round ends in a penalty moment, made with `api.penalty(...)`, which the penalty stamp shows
in the host's chosen penalty (drinking unless changed in settings), and with a custom penalty no
line or button says drink (on the phone `usePenaltyText().isCustom` or `.line(drink, custom)`, on
the rooms server `byPenalty(api, drink, custom)`); reduced motion respected;
playable without sound and without motion sensors; nothing needs a sign-in.

## A bigger game with its own Worker (the 到此一游 pattern)

`games/been-there` is its own Worker at changle.ca/trip (routes in its `wrangler.jsonc`), started
from a site table through a small hand-off: `site/src/party/trip/link.ts`, the stand-in rules in
`site/src/shared/engine/games/trip.ts`, and `NetTrip.tsx` and `TripSolo.tsx`. Use this when a game
needs its own server, art or big-screen show. A new one gets its own folder under `games/`, routes
under changle.ca, a Cloudflare Workers Builds connection with that folder as root, and a workflow
like `.github/workflows/been-there.yml`. Another session has been working on 到此一游: check its
open PRs before changing `games/been-there`.

`games/hide-crowd` (藏在人群里 · Hide in the Crowd, at changle.ca/hide) is made the same way: a
crowd game moved 20 times a second by one Durable Object per room, a 3D arena in three.js, its own
big screen. Its hand-off is `site/src/party/hide/`, its stand-in rules
`site/src/shared/engine/games/hide.ts`, its workflow `.github/workflows/hide-crowd.yml`. To run it
with the site: `npm run build && npx wrangler dev --port 8797 --var STANDALONE:1` in its folder (the
site's `/hide` is proxied there), then `python3 scripts/hide_test.py` in `site`.

## A tool (the 随便 pattern)

`tools/suibian` is its own Worker at changle.ca/eat; its card in the site's Tools tab is
`site/src/tools/Suibian.tsx`. Its state, settings and open items: `tools/suibian/HANDOFF.md`. 约时间
(`tools/when`, changle.ca/when, card `site/src/tools/When.tsx`) is made the same way; its brief is
`docs/briefs/when.md`. 跟一单 (`tools/tuan`, changle.ca/tuan; only its API so far, no card yet) is a Worker with
a D1 database, like 玩什么; its brief is `docs/briefs/tuan.md`. Tools
without a Worker of their own (exchange rates, world clock, unit price) live in `site/src/tools/`;
the rates come from the rooms server's `/api/fx` (`site/worker/index.ts`), with open.er-api.com as
the browser's fallback. Their brief: `docs/briefs/tools.md`.

## Settings (names only, never the values)

| App | Secrets (Cloudflare) | Other variables |
| --- | --- | --- |
| rooms Worker `changle-rooms` (`site/worker`) | `RESEND_API_KEY` (sign-in emails), `GEMINI_API_KEY` (anime avatars, and the DJ booth's Lyria test unless `LYRIA_API_KEY` is set), `LYRIA_API_KEY` (optional: Lyria on a key of its own), `YOUTUBE_API_KEY` (optional: 打碟's song search; links work without it) | `MAIL_FROM`, `ADMIN_EMAILS` (in `site/worker/wrangler.jsonc`; also who may test Lyria); `GEMINI_IMAGE_MODEL`, `LYRIA_MODEL`, `DJ_LYRIA_HOURS` (Lyria hours a month, default 20) (optional); `DEV_SHOW_CODES`, `DEV_FAKE_DRAW`, `DEV_MAIL_URL` (a stand-in Resend, `site/scripts/fake_mail.mjs`), `DEV_LYRIA_URL`, `DEV_LYRIA_ANYONE` (local only) |
| site front end | none | `VITE_ROOMS_URL` (local dev: where the rooms server is) |
| 随便 (`tools/suibian`) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `GOOGLE_PLACES_KEY` | `ALLOW_TEST_SETTINGS` (tests only) |
| 约时间 (`tools/when`) | none | `ALLOW_TEST_SETTINGS` (local and tests only: lifts the daily allowances) |
| 跟一单 (`tools/tuan`) | none | none |
| 到此一游 (`games/been-there`) | none | `ALLOW_TEST_SETTINGS`, `STANDALONE` (local only) |
| 藏在人群里 (`games/hide-crowd`) | none | `ALLOW_TEST_SETTINGS`, `STANDALONE` (local only) |
| 玩什么 (`tools/events`) | `TICKETMASTER_KEY` (Ticketmaster; skipped without it), `EVENTS_HANDOFF_KEY` (optional, never needed live: the libraries' hand-over from a run outside GitHub) | `ALLOW_TEST` (local and tests only) |

GitHub Actions use no secrets. `.github/workflows/events-libraries.yml` (each morning at 05:50 it
hands the Vancouver and Richmond libraries' pages to the What's On Worker) signs in with GitHub's own
OIDC token, which the Worker checks against GitHub's public keys (`tools/events/src/oidc.ts`,
`tools/events/README.md`). Locally, secrets go in a git-ignored `.dev.vars` next to the Worker's
`wrangler.jsonc`.

## Working rules

* Every change on its own branch with a PR. Never push to `main`. CI green before merging.
* Once CI is green, merge the PR yourself and tell the owner (Steve) what went live.
* Ask the owner first only for: anything that costs money, deletes data, changes Cloudflare or GitHub
  settings or keys, or makes the repository public or private.
* No keys, secrets or tokens in code, commits, chat or screenshots: Cloudflare Secrets only.
* Stuck? Stop and say what is needed instead of working around it.

## Open items

* 打碟 · DJ Booth (`docs/dj-booth.md`, `site/src/shared/dj/CONTRACTS.md`): on the home list since
  Nov 1 (its card plays at changle.ca/dj). The stand-in DJ plays 12 styles on two decks; every
  phone is a beginner deck (pads, the fader, the build-up and DROP, picking the next style) and a
  mixer (a three-band EQ, a filter, four effects), all of it on the beat; 🔥 and ❄️ lean the energy
  (读场), the big screen announces songs asked for (报幕) and shows the night's recap at the end.
  Every phone is a DJ controller (turntables, round knobs, 12 pads); the TV has a dancing coach and
  phones held in hand score dancing along on the beat (跟着跳, the plan's easy mode).
  Where every sound comes from: `LICENSES.md` (Apple's preview terms are open for the owner, #113). Lyria RealTime (A2) plays at the owner's own tables only, a private test. Next in
  the plan: the DJ's brain (A4), songs players describe (A5); Codex's cards are in
  `docs/codex-tasks/dj/` (C1 presets is done).

* 一本正经 · In All Seriousness (`docs/straight-face.md`, brief `docs/briefs/straightface.md`): the
  engine (`site/src/shared/straightface/`, a pure reducer with `privateView` / `publicView`), 400
  cards in 21 packs (eleven for Chinese tables, six for English tables, four for any table; a table
  starts with its own language's packs), pictures drawn with ChatGPT (pack icons, the three parts, the
  room) and synthesised sound cues, on the board since 2026-11-05. One phone passed round, or online
  with every phone its own and a big-screen view (A3: the rules on the rooms server in
  `site/src/shared/engine/games/straightface.ts`, the screens `NetStraightFace.tsx` and
  `TvStraightFace.tsx` in `site/src/party/straightface/`). Each card's numbers and the cards players
  flag live in the users' hub (`site/worker/straightface.ts`, three tables, hooked into `hub.ts` with
  one line each); the owner reads and decides them in the back office (`AdminCards.tsx`). The end
  screen gives tonight's titles and a picture to share (`share.tsx`, drawn in the phone by
  `picture.ts`). 自己出题: each player can write a word of their own before the game (`own.tsx`; the
  engine deals them first, never to their writer's round). Online, more than nine at the table or late
  arrivals are the audience: they back the honest one from their phones, on a board of their own.

* 最后一张 · Last Card (brief `docs/briefs/lastcard.md`): a shedding card game under our own name
  and card faces, online only (rules `site/src/shared/engine/games/lastcard.ts`, screens and the
  big screen in `site/src/party/lastcard/`), done 2026-11-05 and hidden from the board:
  `changle.ca/g/last-card/play` opens a table for it until Steve has played a round. Before it goes
  on the board, its card needs an online-only mode (no one-phone button).

* The rooms Worker was connected to Git on 2026-10-31; its first build from Git ran on the merge of
  PR #34 (2026-11-01) and deployed fine.
* 随便: its severe-allergy table is a draft, and its picks file is still empty.
  See `tools/suibian/HANDOFF.md`.
