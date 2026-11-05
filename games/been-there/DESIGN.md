# 到此一游 · Been There, Bought That: design

How the game looks and moves, where each part of the look lives, and what a design change has to
keep. For whoever adjusts the design next. How to run and deploy the game is in
[README.md](README.md).

## The look

It is one of changle.ca's games, so it wears two looks, one inside the other:

* **The frame is changle.ca's.** Top bar, buttons, panels, sheets, fields, tabs and type are the
  site's night room (`party-games/DESIGN.md` in the site's code): night and dusk panels with a
  hairline, Unbounded headings and Figtree text, pill buttons, sheets that rise with a handle,
  tabs that float frosted over the bottom of the screen, and a bilingual title (the reader's
  language leads). The game's gel is **#ff8a6b**: its main button on each screen glows in it, it
  rings the question when it's your move, it lights your team in the lobby, and it spills down
  from the top of the screen as the room light. Night only, like the rest of the site.
* **The printed things are the game's own.** Step 5 picked them from three directions (the style
  sheet, `dist/styles.html`, still shows all three): **the golden age of travel**, 1930s posters,
  luggage labels, passport stamps and boarding passes. Navy paper, cream ink and vermilion, type
  like a departures board. They keep it inside the frame: the board, posters, stamps, the
  passport, the characters, dice, coins and cards, the ticket strip across the top of each
  question, the city names on the arrival postcard, the big screen's departure board, the
  touchdown and the finale's stamps.

* **The board** is a round turntable around an air-age route map (a polar projection). On the big
  screen a 3D globe sits in the middle; flights arc between cities, and the side where it is night
  right now is dark, with the cities lit.
* **Six characters**, one per team colour, each with six moods (idle, happy, shock, sad, curious,
  smug): 咔嚓 Click, 呼呼 Snooze, 小旗 Flaggy, 背背 Packy, 箱箱 Trunky, 球球 Globey.
* **Each city** has a poster built around its rule (Venice floods, Tokyo's trains are packed) and a
  passport stamp whose outline is its region's shape.
* **Moments are animated**: dice landing, coins changing hands, cards turning, the first-person
  touchdown in each new city (out of the plane window, through the clouds, the real local time and
  the live weather), and the finale (an exit stamp, teams read out last to first, the winners'
  medal, stamps and falling paper).
* **Everything is drawn in code** (SVG, CSS, a canvas for the paper grain) and the sounds are
  synthesised in the browser: there are no image or sound files to download or license.

## See it while you work

* `npm run build`, then open `dist/demo.html`: the whole game on one page with no server. One phone
  plays every human team; the rest are computer teams.
* `npm run dev`: the online game at http://localhost:8787/trip/. A phone is `/trip/r/<code>`, the
  big screen `/trip/tv/<code>`. To reach the finale quickly, start it with
  `npm run dev -- --var ALLOW_TEST_SETTINGS:1` and make the room by posting
  `{"mode": 60, "test": {"speed": 0.15, "testRounds": 2}}` to `/trip/api/rooms`.
* It is night only, whatever the phone's light or dark setting, as on changle.ca.

## Where each part lives

| File | What |
| --- | --- |
| `src/client/art/art.css` | The printed things' inks (paper, ink, map, dice, coins, weather), their three fonts, and the board, posters and stamps. |
| `src/client/styles.css` | The frame: changle.ca's night tokens (`--night`, `--dusk`, `--gel`...) and the names the screens use (`--bg`, `--surface`, `--accent`...), the fonts, layouts (phone tabs; everything side by side from 960 px; the big screen), buttons, panels and sheets, and the scenes (touchdown, finale). |
| `src/client/art/characters.tsx` | The six characters and their moods. |
| `src/client/art/posters*.tsx`, `stamps.tsx` | The 22 city posters and passport stamps. |
| `src/client/art/RoundBoard.tsx`, `RouteMap.tsx` | The round board and the route map (with the night side). |
| `src/client/art/dice.tsx`, `Passport.tsx`, `LandingCard.tsx`, `icons.tsx`, `texture.ts` | Dice, the passport, the arrival card, small icons, paper grain and stamp speckle. |
| `src/client/globe/` | The big screen's 3D globe (three.js): the night side, city lights, flights. |
| `src/client/ui/` | The screens: `Game.tsx` (phone), `Screen.tsx` (big screen), `Decision.tsx` (the questions a team answers), `Trivia.tsx` (the waiting teams' quiz: the pop-up and the card to read), `TurnClock.tsx` (the turn clock's countdown), `Moments.tsx` (dice, coins, cards), `Ride.tsx` and `ridePlan.ts` (the first-person move), `Touchdown.tsx`, `Finale.tsx`, `Lobby.tsx`, `Home.tsx`, `Settings.tsx`, `Fullscreen.tsx`, `common.tsx` (team colours, chips, buttons). |
| `src/client/sound.ts`, `controls.ts`, `fullscreen.ts` | Sounds; vibration and shake to roll; full screen. |
| `src/client/i18n.ts` | Every word on screen, in Chinese and English. |

## Tokens

* **Colours are tokens**, one set, all on `:root`. The frame's are copied from changle.ca
  (`src/styles/global.css` in the site's code): if the site's night changes, change them here
  too. The printed things' inks are in `art/art.css`; posters, passports, dice and coins keep
  their own colours.
* **Team colours** (`TEAM_COLORS` in `ui/common.tsx`) are the characters' colours
  (`characters.tsx`): change them together.
* **Fonts** (SIL Open Font License, licences in `src/client/fonts/licences`). The frame uses the
  site's two: Unbounded for headings, figures and codes (`--ui`), Figtree for everything else
  (`--font`). Neither has Chinese, which falls back to the phone's own font, as on the site. The
  printed things use their own three: Big Shoulders Display and ZCOOL QingKe HuangYou (`--display`)
  and Space Mono (`--mono`); keep those off the frame. ZCOOL is cut down to the characters the
  game uses: after adding Chinese words, run `npm run fonts` (`npm test` fails until you do).
  Anything players type, such as team names, goes in the text font.

## What a design change has to keep

Each of these was measured or is tested. Check them again after a change.

1. **A phone never scrolls sideways.** The page is never wider than the phone, down to a 320 px
   iPhone SE in English with long team names. The browser tests check this on every tap. City names
   are never cut short: on the ride's departures board one that doesn't fit wraps onto a second line.
2. **Nothing runs off the big screen.** It fits at 1600×900, 1366×768 and 1280×720. The "now"
   column shrinks its cards when they're taller than the room (`FitColumn` in `Screen.tsx`); the
   finale is sized in `vh`.
3. **The night.** The characters are drawn in navy ink: on the night they need the thin paper
   edge (`--face-edge`), or poles and legs disappear.
4. **Reduced motion.** The game's own switch stops every animation. The system's "reduce motion"
   setting must stop any new long or looping animation too (see the finale's block in
   `styles.css`). Animation is decoration only: the numbers, cards and log always say everything.
5. **Smooth on a mid-range Android.** With the CPU slowed 4×, the finale held about 57 frames a
   second (`npm run perf` measures the board). Animate `transform` and `opacity`; avoid big blurs
   and filters, and anything that redraws every frame for long. The falling paper cost the most,
   so phones get 24 flat pieces and the big screen 44 tumbling ones.
6. **Taps land where they're meant.** A new question ignores taps for 350 ms (`.settling`), so a
   tap meant for the last one can't answer it; the quiz's pop-up too. Buttons are 50 px tall, small
   text ones 44 px. Nothing looks tappable that isn't: answers are buttons only where they can be
   given.
7. **The waiting teams' quiz pops up at the top**, in the same place every time, over everything on
   a phone but a party forfeit, the landing scene included (only the forfeit and the speed test's
   readout, which takes no taps, are stacked higher: `tests/trivia.test.ts` holds every layer in
   `styles.css` to that): across the top when the phone is held sideways (the answers side by
   side), top centre on a laptop, at the head of the "now" column on the big screen. All of it shows
   without scrolling: `tests/e2e/quiz.spec.ts` checks 390x844 on the phone's own turn and another's,
   375x667, a phone held sideways, a 320 px iPhone SE in English with the longest question the bank
   allows, and the big screen at 1366x768. Only a phone that can answer gets the pop-up (with
   这题不答 to pass); others read it in their play window.
8. **Never colour alone.** Each region's cities have a shape (on the board, the stamps and the city
   lists) and each team a letter and a character, for colour-blind players.
9. **Our own work.** No photos, fonts or sounds we can't license. Posters leave out modern
   buildings whose designs are still protected, and trademarks. The credits page lists every source
   and licence.

Then run `npm run typecheck`, `npm test` and `npm run test:e2e`. GitHub runs them on every push,
in Chromium and in WebKit (the engine in iPhone Safari and WeChat on iOS). Speed is held in
Chromium only: GitHub's WebKit draws without a GPU on two shared cores, nothing like an iPhone, so
there the tests hold what happens, not how fast (a real iPhone's numbers: the menu's 测速, in the
playtest).

## Photos and recorded city sounds

Every city has a real photo and a few seconds of a real recording made there. All are free to use
(public domain or CC0, CC BY, or CC BY-SA; no NC, no ND). `src/client/media.ts` says where each one
comes from and who made it, and the credits page lists them all.

* **Photos** come from Wikimedia Commons. `src/client/media/photos/<id>.webp` is 1280×720 and
  `<id>-s.webp` 640×360, both cropped to 16:9. They sit alongside the posters rather than replacing
  them. In a city's sheet the photo fades in over the poster once it has loaded, and a switch goes
  back and forth between the two, with the photo's credit beside it. On the big screen's arrival
  card the photo comes in 2.6 s after the poster, with its credit in the corner (not in the narrow
  one-column card, whose poster is small and upright). A photo that can't load leaves the poster.
  Each has an alt text in both languages.
* **Recordings** come from Freesound. `src/client/media/sounds/<id>.mp3` is about 5 s, mono,
  levelled to about -20 LUFS, 64 kbps. A city's recording is fetched when its touchdown starts and
  plays instead of its sketch in the browser (`CITY_SOUND` in `sound.ts`). The sketch plays when the
  recording hasn't loaded, or can't (the demo opened from a file or in an artifact).
* **They ship beside the game**, at `/trip/photos` and `/trip/sounds`, and are fetched only when a
  city comes up, so the first load and the one-page demo stay as small as before.
* **Choosing another.** Read the file's own page for its licence and author, not the search
  result. Leave out photos with recognisable people, logos and trademarks, and recent buildings in
  countries without freedom of panorama (France, Italy and the UAE are among them; the Eiffel Tower
  lit at night is a known case). Leave out recordings with clear speech or music someone else
  wrote. Say what was changed (cropped, cut, levelled) on the credits page.

## Your move, first-person

From the press on the dice to the question after the landing, in beats every screen plays from the
server's moment of the throw (`ui/ridePlan.ts`, the beat sheet's clock):

| ms from the throw | what happens |
| --- | --- |
| 0 | the dice tumble (on the thrower's phone from the press, before the server answers) |
| 600 | they settle, the number jumps out; the camera pushes in for 300 ms, without turning |
| 900 | the walk: 200 ms a space, a long move runs (1.8 s at most), never under 150 ms a space |
| land | the stamp comes down (80 ms), holds (120 ms), lifts and leaves its ink; Immigration's gate +400 ms |
| land + 350 | the question is back, while the camera pulls out (500 ms, without turning) |

A card that sends the token on pauses 300 ms on its space, then walks 150 ms a space, or fades
(500 ms) when it's more than six spaces. Later turns go quicker (pace 0.85 from a team's 4th turn,
0.7 from its 11th; a second throw after doubles at 0.85 at most), never past 150 ms a space. A tap
on the board skips to the stamp, a second past it. Worst case, from the press to the question: 4.2 s
(`tests/ride-oracle.test.ts`, 10,000 throws), against 1.7 s before the ride existed.

* **One camera move at a time** (motion sickness). Push in without turning, follow by turning only
  (60 degrees a second at most, easing in and out), pull out without turning. On a phone the table
  rests with the team's own token at 9 o'clock, where the camera pushes in, so a turn starts without
  the table moving. Any other turn of the table is capped the same way, and one of more than 60
  degrees is a 0.5 s fade instead (`art/RoundBoard.tsx`).
* **Three ways to play it** (`ui/Ride.tsx`). "fp": the thrower's phone, first-person, the board
  leaning back into the night with the departures board flipping up each city passed in the corner
  of the sky. "flat": the same beats on the flat board, for reduced motion, the menu's 第一视角走棋
  off, or a throw that stays put. "tv": the big screen pushes in 1.4× and pans 55% of the way to the
  token, flat, with its own departures board beside the board (`ui/Departures.tsx`). Every other
  phone walks the token on its flat board in step and stamps the landing with the thrower's.
* **Every screen in step.** Each screen keeps the server's clock from the quickest of its last views
  (`store.ts`), and plays the move from the server's moment of the throw: in tests the planned
  landing agrees to within 3 ms across a phone, another phone and the big screen.
* **Cheap frames.** The camera moves a frame round the drawing (`.board-view`), one CSS transform;
  the board's words are outlines (`art/boardType.ts`, made by `scripts/board-type.mjs`), because
  text in an SVG is laid out again whenever anything above it moves. The stamp is placed once and
  played by the browser's own animation; sizes are read once, never in a frame; the arrival card
  (a poster) is drawn once the stamp is down. `node scripts/ride-perf.mjs` measures it on a Pixel 5
  page at 4× CPU slowdown; the menu's 测速 shows the same numbers on a real phone.
* **What waits for it.** The question, the cash in the top bar and its coins come back with the
  stamp; a first visit's touchdown once the camera is back up (on the big screen, once the plane
  has flown there on the globe, which it does after the move). Nothing tells the landing before
  the stamp, on any screen (`moveInPlay`): the dice under the board show when they settle, the
  log's lines from the throw on and what the table is waiting for when the token lands, the
  standings and every team's cash with the question.
* **What it gives way to** (`rideUrgent`). An auction or Shanghai's quiz for this team cuts it short
  and brings the question straight back; a table vote waits for it unless that would leave less
  than 15 s to answer. A shake doesn't throw again while it plays.
* **The page stays still.** The leaning board is drawn bigger than its box, which clips it
  (`.boardwrap.on-ride`): the phone never scrolls sideways.

## The moments, and the phone in your hand

* **Your turn.** The edge of the screen glows gel twice, with the airport chime and a buzz. On the
  big screen the chime is the next team's boarding call, its flight number on the departures board.
* **The dice** are in the air the moment the button is pressed (under 0.1 s), clack twice as they
  land, and their number comes up with a tick.
* **A city bought:** the owner's mark stamps down and its ink spreads out round it.
* **Money:** coins fly from whoever pays to whoever is paid, once the token is down. On the big
  screen, every payment; on a phone, its own team's.
* **Sent to Immigration:** the gate comes down over the board.
* **Rio's samba** (`ui/Samba.tsx`): a team that says it will dance gets a 10.6 s lesson on every
  screen, from the server's moment (protocol `TIMING.dance`): four beats counted in, twelve of the
  basic step at 100 a minute, a pose. The teacher is a mirror, the foot to move lights up, the word
  is spoken a little ahead of the beat. Full screen on the dancing team's phone, small over the
  judges' buttons (which light up when it's over: their 25 s start then), big over the big screen's
  board, where the band plays (or on the dancer's phone when there's no big screen).
* **Vibration** (`controls.ts`) works where a page is allowed to vibrate: Android. It buzzes on
  your turn, your press on the dice (or any answer), the landing, money in and out, a city bought, a
  card, Immigration, an auction, a trade offer and going broke. iPhones can't buzz from a page: the
  buttons that matter most (the dice, buying, dancing) are a hidden switch inside a label, which
  Safari answers with its own light tap (`HapticBtn`), and the glow and the sounds carry the rest.
* **The screen stays on** (`wake.ts`): a phone set down between turns and the big screen keep a
  wake lock, asked for again when the page comes back.
* **Full screen** (`fullscreen.ts`). Android, iPads and computers use the browser's own: the
  corner button in the top bar and the menu. A phone keeps the way it was held when it went full
  screen (one put down flat doesn't flip its board). An iPhone doesn't let a page go full screen,
  so the button there explains how to add changle.ca to the Home Screen; the game page's manifest
  (`app.webmanifest`) starts that web app at changle.ca, the table, not at an old game.
* **Watching on a TV** (menu, 旁观): any device can become the room's big screen in place, keeping
  the sound it was allowed to play; one opened straight on the board asks for a tap to turn sound on.
* **Photosensitivity** (WCAG 2.3.1 and 2.3.3). Measured on films of every screen through a throw,
  the samba and a turn call: at most 2 flashes a second over 25% of a 10-degree field (3 with a
  stricter field a quarter of the screen across), no red flashes. Reduced motion (the phone's
  setting or the menu's) plays every beat flat and still: no lean, no push, no tumble, a standing
  teacher.

Also still to do: the ten-minute playtest on real phones (the script and record sheet are in the
beat sheet's document), with people who haven't seen the game.
