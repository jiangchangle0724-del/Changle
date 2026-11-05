# 到此一游 · Been There, Bought That

An online city-property party game, one of [changle.ca](https://changle.ca)'s games: 22 real
cities, each with a rule drawn from a real fact. Up to 6 teams of 1 to 3 people; an optional big
screen (TV or laptop) shows the board. It plays at changle.ca/trip and starts from a table there.

Step 4 made the full game playable online; step 5 gave it its look: the golden age of travel
(1930s posters, luggage labels, passport stamps, boarding passes), a round turntable board around
an air-age route map, and six token characters. Step 6 adds the city content: a quiz for the teams
waiting their turn (176 questions, eight a city, each with its source and a 你知道吗 fact; it pops up
at the top of the phone, any phone can skip a question, none comes twice in a game, and a phone
gets ones it hasn't seen first; the host can turn it off in the lobby), the real fact
on the big screen's arrival card, a drink-free set of party forfeits (each one holds the game until
its team taps Done, or the host skips it), and a credits page listing
every source and licence. Each city now also has a real photo (Wikimedia Commons) beside its
poster, and a few seconds of a real recording made there (Freesound) when a team first lands. A
team's own move plays first-person on its phone: the camera follows the token round the board past
every city to where it lands. Phones can go full screen (iPhones from the Home Screen) and, where
they're allowed to, vibrate at the big moments. A team that stays connected but does nothing gets a
turn clock: after 60 seconds on a decision, every screen counts down 15 more, then the computer
makes that one move for it. On a phone the player picks the map's size (small fits the whole board,
medium and large draw it bigger and drag round with a finger, following the team on turn); phones
start at medium. Tokens are bigger, and several on one city stand side by side with their letters;
every screen fits a phone down to 320 px, its buttons 44 px or more, above the keyboard.

How the game looks and moves, and what a design change has to keep: [DESIGN.md](DESIGN.md).

## How it sits inside changle.ca

* **It starts from a table.** On changle.ca the host picks 到此一游 from a table's games. The
  host's phone asks this Worker for a room (`POST /trip/api/rooms` with the table's code, which
  keeps that phone the host for 90 seconds), and every phone at the table and the table's big
  screen go in by themselves: `changle.ca/trip/r/<room>?table=<table>` and
  `changle.ca/trip/tv/<room>?table=<table>`. Names, language and sound come along (same site, same
  storage). Players join with the table's code, as for any other game.
* **It goes back to the table.** The lobby's and the finale's buttons lead back to the table; the
  finale tells the host's phone the game is over, and everyone lands in the table's lobby. The
  big screen goes back on its own a couple of minutes after the finale.
* **One phone:** `changle.ca/trip/demo`, the whole game on one page.
* **Addresses.** The Worker answers `changle.ca/trip` and `changle.ca/trip/*` (the routes in
  `wrangler.jsonc`); the rest of changle.ca is the site. A bare `/trip` leads to the game's card on
  the site and `/trip/tv` to the site's big screen. The old workers.dev address forwards to
  changle.ca/trip.
* **The site's side** (the game's card, opening it from a table, the way back) is in the site's
  code: `src/party/trip/` and `src/shared/engine/games/trip.ts`.
* **The look** follows the site's: its night room around the game's printed things. See
  [DESIGN.md](DESIGN.md).

## What's where

| Folder | What it is |
| --- | --- |
| `src/engine` | The rules, one copy shared by the simulator, the server and the browser. Recovered from the step-3 bundle; `tests/engine.test.ts` proves it still gives the step-3 report's numbers exactly. |
| `src/room` | One game room: lobby, teams, the running game, live auctions, the Shanghai quiz, the waiting teams' quiz (`triviaBank.ts` holds the questions, `trivia.ts` picks the next one; answers kept on the server), party forfeits (`party.ts`), trades, spectator bets, the computer covering for phones that drop off and the turn clock, saves. No networking inside, so it's easy to test. |
| `src/server` | The Cloudflare Worker. Each room is one Durable Object that keeps the game and saves it after every move. |
| `src/client` | The web pages: phone screens, the big screen, Chinese/English. |
| `src/client/art` | The art, all drawn in code (SVG): 22 city posters, passport stamps, characters, the round board, the route map. |
| `src/client/fonts` | Font subsets made by `npm run fonts` (SIL Open Font License; licences alongside). |
| `src/local` | The single-device demo (`dist/demo.html`): the same client with the room running in the page. |
| `scripts` | `build.mjs` builds the pages; `sim.ts` re-runs the step-3 report; `tune.ts` is the step-3 rent tuner; `fonts.mjs` and `gen-world.mjs` remake the fonts and the map. |
| `src/samples` | The step-5 style sheet (three art directions side by side), built to `dist/styles.html`. |
| `tests` | Engine and room tests (Node), and phone-in-a-browser tests (`tests/e2e`, Playwright). |

## Run it on a computer

```sh
npm install
npm run dev          # builds, then serves the game at http://localhost:8787/trip/
```

`npm run dev` runs the game by itself (`STANDALONE=1`), with its own start page: open
http://localhost:8787/trip/ in two browser windows and start a room. To try it from a phone on the
same Wi-Fi, run `npm run dev -- --ip 0.0.0.0` and open the computer's address on port 8787. To try it
from a changle.ca table, run the site's code with its `/trip` proxy (`vite.config.ts` there) and
this game with `npx wrangler dev --port 8799`.

## Check it

```sh
npm run typecheck
npm test             # rules reproduce the step-3 report (17,000 games) + room scenarios
npm run test:e2e     # 4 phones play a whole game; a phone locked 60 s gets its seat back; two simultaneous bids;
                     # the map's size, shared cities and every key screen on 390x844, 375x667 and 320x568
npm run sim          # print the step-3 report numbers again
npm run fonts        # after adding Chinese text: rebuild the font subsets (a test reminds you)
npm run build        # then open dist/demo.html: the whole game on one page
```

GitHub runs the first three on every push, in Chromium and WebKit (`.github/workflows/been-there.yml`).

## Put it online

Cloudflare builds and publishes the game on every push once the repo is connected:
Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repo, with
**project name** `been-there` (it must match `name` in `wrangler.jsonc`), **root directory**
`games/been-there`, build command `npm run build`, deploy command `npx wrangler deploy`.
Durable Objects with SQLite storage work on the free plan.

From a computer instead: `npx wrangler login`, then `npm run deploy`.

## Add quiz questions

The questions are plain data in `src/room/triviaBank.ts`: copy an entry and change it. Each has an
id that is never reused (`cairo-09`: phones remember the ids they've been asked), its city, the
question, three options with the right one first, a one-line fact for after the answer, and the
https page it comes from (the credits page lists it). `npm test` checks every entry
(`tests/trivia.test.ts`): a unique id, a city in the game, three different options, both languages,
no em dashes or curly quotes, and lengths that fit a phone. Only the room imports the bank, so the
answers never reach a phone.

## Numbers you might want to change

* Room timings (auction countdown, vote time, how soon the computer covers a dropped phone, the
  quiz's time to answer, the turn clock's 60 + 15 seconds): `TIMING` in `src/room/protocol.ts`.
* Prices, rents, target lines: `src/engine/config.ts`. After changing them, run `npm run sim`
  to see the effect; `npm test` will then (deliberately) fail until `tests/fixtures/report.json`
  is updated to the new numbers.
