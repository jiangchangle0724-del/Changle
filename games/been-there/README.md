# 到此一游 · Been There, Bought That

An online city-property party game for [changle.ca](https://changle.ca): 22 real cities, each with
a rule drawn from a real fact. Up to 6 teams of 1–3 people; phones join by QR code or a 4-digit
room code, no sign-up; an optional big screen (TV or laptop) shows the board.

This folder is **step 4, the online graybox**: the full game, playable online, without art.
Art direction is step 5, city content (photos, sounds, quiz questions) step 6.

## What's where

| Folder | What it is |
| --- | --- |
| `src/engine` | The rules, one copy shared by the simulator, the server and the browser. Recovered from the step-3 bundle; `tests/engine.test.ts` proves it still gives the step-3 report's numbers exactly. |
| `src/room` | One game room: lobby, teams, the running game, live auctions, the Shanghai quiz, trades, spectator bets, the computer covering for phones that drop off, saves. No networking inside, so it's easy to test. |
| `src/server` | The Cloudflare Worker. Each room is one Durable Object that keeps the game and saves it after every move. |
| `src/client` | The web pages: phone screens, the big screen, Chinese/English. |
| `src/local` | The single-device demo (`dist/demo.html`): the same client with the room running in the page. |
| `scripts` | `build.mjs` builds the pages; `sim.ts` re-runs the step-3 report; `tune.ts` is the step-3 rent tuner. |
| `tests` | Engine and room tests (Node), and phone-in-a-browser tests (`tests/e2e`, Playwright). |

## Run it on a computer

```sh
npm install
npm run dev          # builds, then serves the game at http://localhost:8787
```

Open http://localhost:8787 in two browser windows (or a phone on the same network) and start a room.

## Check it

```sh
npm run typecheck
npm test             # rules reproduce the step-3 report (17,000 games) + room scenarios
npm run test:e2e     # 4 phones play a whole game; a phone locked 60 s gets its seat back; two simultaneous bids
npm run sim          # print the step-3 report numbers again
```

GitHub runs all of these on every push (`.github/workflows/been-there.yml`).

## Put it online

Cloudflare builds and publishes the game on every push once the repo is connected:
Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repo, with
**root directory** `games/been-there`, build command `npm run build`, deploy command
`npx wrangler deploy`. Durable Objects with SQLite storage work on the free plan.

From a computer instead: `npx wrangler login`, then `npm run deploy`.

## Numbers you might want to change

* Room timings (auction countdown, vote time, how soon the computer covers a dropped phone):
  `TIMING` in `src/room/protocol.ts`.
* Prices, rents, target lines: `src/engine/config.ts`. After changing them, run `npm run sim`
  to see the effect; `npm test` will then (deliberately) fail until `tests/fixtures/report.json`
  is updated to the new numbers.
