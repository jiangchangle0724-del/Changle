# 到此一游 · Been There, Bought That

An online city-property party game, one of [changle.ca](https://changle.ca)'s games: 22 real
cities, each with a rule drawn from a real fact. Up to 6 teams of 1 to 3 people; an optional big
screen (TV or laptop) shows the board. It plays at changle.ca/trip and starts from a table there.

Step 4 made the full game playable online; step 5 gave it its look: the golden age of travel
(1930s posters, luggage labels, passport stamps, boarding passes), a round turntable board around
an air-age route map, and six token characters. Step 6 adds the city content: a quiz for the teams
waiting their turn (about every eight minutes, and four into a game for the first, a team's landing
on a city brings them a question about that city, once what the landing asks of the table (a purchase, an auction, a vote) is settled; 176 questions, eight a city, each with its source and a 你知道吗 fact; it pops up
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

Being there (issue #44, parts 2 and 3): every arrival card shows the city's local time and weather
right now, its hello (how to say it and what it means, in Chinese and English) and its money, and
prices and rents show what they come to in that money too ("$250 ≈ ¥39,000"). A team's first landing
in a city plays the city's recording, as before; landing there again plays a well-known song from that
city's country (3 to 5 a city, Apple's 30-second previews, looked up and streamed from Apple at play
time) until the team's turn ends, with "Now playing" and a link to Apple Music on every screen. One
device plays it: the big screen if there is one, otherwise the landing team's phone.

The real world (issue #44, part 1): the middle of the board is NASA's satellite pictures, the Blue
Marble where the sun is up right now and the Black Marble's city lights where it has set, with a soft
dusk between; the big screen's globe wears the same pictures. A team crossing to another region flies
there along the great circle, its own token flying it once it's down on the ring. The ring round the
world stays printed, each city washed in its region's colour. The pictures are made ready ahead of
time (`npm run satellite`) and ship with the game: 73 KB for a phone, 600 KB for the big screen.

Rio's samba: a team that lands on Rio may dance for the table's scores. Its phone shows a ready
card (stand up, leave room for a step), and nothing starts until it presses Start; left alone for a
minute, it starts by itself. Then every screen counts down five seconds and a carnival dancer teaches
a 40-second lesson to a samba band: eight figures, the words on screen and spoken, the spot under
the foot to move lit up. Full screen on the dancing team's phone, small over the judges' buttons
(which light up when it's over), big on the big screen. A computer team dances a short one straight
away.

The game's music: "Boarding Call", a 1930s swing written for the game (clarinet, muted trumpet,
piano, rhythm guitar, upright bass, brushes), going round from the game's start to its end, and its
ending with the results. One device plays it for the room (the big screen, otherwise the host's
phone), under the game's sounds; it comes down for a local hit, a city's recording, Seoul's silence,
Rio's samba, a forfeit and a pause. The menu's 背景音乐 turns it off on a device. The score is code
(`scripts/music/score.mjs`); `npm run music` plays and mixes it (FluidSynth with the GeneralUser GS
SoundFont, and ffmpeg) into the files in `src/client/media/music`.

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
| `src/room` | One game room: lobby, teams, the running game, live auctions, the Shanghai quiz, the waiting teams' quiz (`triviaBank.ts` holds the questions, `trivia.ts` picks the one a landing brings; answers kept on the server), party forfeits (`party.ts`), trades, spectator bets, the computer covering for phones that drop off and the turn clock, saves. No networking inside, so it's easy to test. |
| `src/server` | The Cloudflare Worker. Each room is one Durable Object that keeps the game and saves it after every move. |
| `src/client` | The web pages: phone screens, the big screen, Chinese/English. |
| `src/client/art` | The art, all drawn in code (SVG): 22 city posters, passport stamps, characters, the round board, the route map. |
| `src/client/fonts` | Font subsets made by `npm run fonts` (SIL Open Font License; licences alongside). |
| `src/local` | The single-device demo (`dist/demo.html`): the same client with the room running in the page. |
| `scripts` | `build.mjs` builds the pages; `sim.ts` re-runs the step-3 report; `tune.ts` is the step-3 rent tuner; `fonts.mjs` and `gen-world.mjs` remake the fonts and the drawn map; `satellite.mjs` remakes the satellite pictures from NASA's (needs ImageMagick with WebP); `music.mjs` makes the music from the score in `music/` (needs FluidSynth 2.3+ and ffmpeg with LAME; it fetches the GeneralUser GS SoundFont from GitHub once). |
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
npm run music        # after changing the score (scripts/music/score.mjs): make the music again
npm run build        # then open dist/demo.html: the whole game on one page
```

GitHub runs the first three on each pull request and on main after each merge
(`.github/workflows/been-there.yml`): the browser tests in Chromium and WebKit, in four parts at
once, each engine in two halves, about 9 minutes. A part that fails can be run again on its own. A
push that only changes Markdown or `docs/` after a passing run doesn't test the phones again, and
Markdown alone in this folder runs nothing.

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

A question comes when a team lands on its city, so each city needs a few of its own. One a city (its
`-01`) is taken from the page the city's rule comes from, and a big screen prints that same fact on
the arrival card: the room leaves that question out while a big screen is on (`onArrivalCard` in
`src/room/trivia.ts` tells by the source). A new question from another page is always askable.

## Change the local hits

Each city's songs are picked in `scripts/songs.mjs` (`PICKS`: artist, title, Apple's track id, and what
a Chinese or English reader sees where Apple's title isn't readable for them). `npm run songs` checks
every one with Apple's Lookup API (the call a phone makes at play time): the right song by the right
artist, not explicit, not live, a remix, karaoke, an instrumental, a re-recording or a cover, with a
30-second preview; a track id that no longer answers is searched for again in the city's storefront.
It writes `src/client/songs.json` (the game's data: id, storefront, title, artist, the preview found
then as the fallback, the Apple Music link) and takes a few minutes (Apple answers about 20 requests a
minute). Nothing is downloaded: previews stream from Apple. `npm test` checks the list
(`tests/local.test.ts`): 3 to 5 a city, every field, both languages readable.

## Numbers you might want to change

* Rio's samba, in `TIMING` (`src/room/protocol.ts`): how long the ready card waits before the lesson
  starts by itself (`danceReady`, 60 s), the countdown (`danceCount`, 5 s), the lesson (`dance`, 40 s:
  64 beats and a pose, so a longer lesson is a slower one) and a computer team's short dance
  (`danceBot`, 10 s). The lesson's figures, their words and the teacher's drawing are in
  `src/client/ui/Samba.tsx`; the band is `samba()` in `src/client/sound.ts`.
* Exchange rates for prices in local money: `RATES` in `src/client/local.ts`, with the date they're
  from (`RATES_DATE`, shown on the credits page). The game's $ counts as US dollars.
* How each city's hello is said and what it means: `HELLO` in `src/client/local.ts`.
* How loud a song plays and how far it dips under the game's sounds: `SONG_VOLUME` in
  `src/client/music.ts`, `DUCK` in `src/client/sound.ts`.
* How wide dusk is on the satellite map (`DUSK` in `src/client/art/satellite.ts`), how long a flight takes
  on the map (`FLY_MS` in `src/client/art/RouteMap.tsx`), how strongly a city's space takes its region's
  colour (`tint` in `src/client/art/RoundBoard.tsx`), and which NASA month the day picture is
  (`SOURCES` in `scripts/satellite.mjs`).

* Room timings (auction countdown, vote time, how soon the computer covers a dropped phone, how long
  the quiz rests between two questions (`triviaEvery`, eight minutes: the lobby's switch says the
  number; `triviaFirst`, four, before a game's first) and its time to answer, the turn clock's 60 + 15 seconds): `TIMING` in `src/room/protocol.ts`.
* Prices, rents, target lines: `src/engine/config.ts`. After changing them, run `npm run sim`
  to see the effect; `npm test` will then (deliberately) fail until `tests/fixtures/report.json`
  is updated to the new numbers.
