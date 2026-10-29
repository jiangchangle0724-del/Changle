# 到此一游 · Been There, Bought That

An online city-property party game for [changle.ca](https://changle.ca): 22 real cities, each with
a rule drawn from a real fact. Up to 6 teams of 1–3 people; phones join by QR code or a 4-digit
room code, no sign-up; an optional big screen (TV or laptop) shows the board.

Step 4 made the full game playable online; step 5 gave it its look: the golden age of travel
(1930s posters, luggage labels, passport stamps, boarding passes), a round turntable board around
an air-age route map, and six token characters. Step 6 adds the city content: a quiz for the teams
waiting their turn (one question per city, from the same sourced fact as its rule), the real fact
on the big screen's arrival card, a drink-free set of party forfeits, and a credits page listing
every source and licence. More facts per city and recorded city sounds are still to come.

How the game looks and moves, and what a design change has to keep: [DESIGN.md](DESIGN.md).

## What's where

| Folder | What it is |
| --- | --- |
| `src/engine` | The rules, one copy shared by the simulator, the server and the browser. Recovered from the step-3 bundle; `tests/engine.test.ts` proves it still gives the step-3 report's numbers exactly. |
| `src/room` | One game room: lobby, teams, the running game, live auctions, the Shanghai quiz, the waiting teams' quiz (`trivia.ts`, answers kept on the server), party forfeits (`party.ts`), trades, spectator bets, the computer covering for phones that drop off, saves. No networking inside, so it's easy to test. |
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
npm run dev          # builds, then serves the game at http://localhost:8787
```

Open http://localhost:8787 in two browser windows and start a room. To try it from a phone on the
same Wi-Fi, run `npm run dev -- --ip 0.0.0.0` and open the computer's address on port 8787.

## Check it

```sh
npm run typecheck
npm test             # rules reproduce the step-3 report (17,000 games) + room scenarios
npm run test:e2e     # 4 phones play a whole game; a phone locked 60 s gets its seat back; two simultaneous bids
npm run sim          # print the step-3 report numbers again
npm run fonts        # after adding Chinese text: rebuild the font subsets (a test reminds you)
```

GitHub runs the first three on every push, in Chromium and WebKit (`.github/workflows/been-there.yml`).

## Put it online

Cloudflare builds and publishes the game on every push once the repo is connected:
Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repo, with
**project name** `been-there` (it must match `name` in `wrangler.jsonc`), **root directory**
`games/been-there`, build command `npm run build`, deploy command `npx wrangler deploy`.
Durable Objects with SQLite storage work on the free plan.

From a computer instead: `npx wrangler login`, then `npm run deploy`.

## Numbers you might want to change

* Room timings (auction countdown, vote time, how soon the computer covers a dropped phone):
  `TIMING` in `src/room/protocol.ts`.
* Prices, rents, target lines: `src/engine/config.ts`. After changing them, run `npm run sim`
  to see the effect; `npm test` will then (deliberately) fail until `tests/fixtures/report.json`
  is updated to the new numbers.
