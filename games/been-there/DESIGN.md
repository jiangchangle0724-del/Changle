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

* **The board** is a round turntable around an air-age route map (a polar projection). Since issue
  #44 the world in the middle is real: NASA's satellite pictures, daylight where the sun is up right now
  and the city lights where it has set (below, "The real world in the middle"). The ring round it stays
  printed, each city's space washed in its region's colour. On the big screen a 3D globe sits in the
  middle, under the board where the flat map is, so the tokens stand on it, wearing the same pictures.
  A team crossing to another region flies there along the great circle, its own token flying it. On a
  phone the player picks how big the board is drawn (below, "The map's size").
* **Six characters**, one per team colour, each with six moods (idle, happy, shock, sad, curious,
  smug): 咔嚓 Click, 呼呼 Snooze, 小旗 Flaggy, 背背 Packy, 箱箱 Trunky, 球球 Globey. On the board they
  stand at 0.8 of their drawing on a phone or a laptop and 0.62 on the big screen (`TOKEN_SCALE` in
  `art/RoundBoard.tsx`; it was 0.57 everywhere). Several on one space stand in pairs, each pair further
  in toward the middle, a little smaller the more there are (`slots`), each whole and wearing its
  team's letter like the owner's mark on a city; the one whose turn it is hops.
* **Each city** has a poster built around its rule (Venice floods, Tokyo's trains are packed) and a
  passport stamp whose outline is its region's shape.
* **Moments are animated**: dice landing, coins changing hands, cards turning, the first-person
  touchdown in each new city (out of the plane window, through the clouds, the real local time and
  the live weather), and the finale (an exit stamp, teams read out last to first, the winners'
  medal, stamps and falling paper).
* **The printed things are drawn in code** (SVG, CSS, a canvas for the paper grain) and the sounds are
  synthesised in the browser. What's real comes as files, each credited: the cities' photos and
  recordings (below), the songs (streamed from Apple) and the satellite pictures of the world.

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
| `src/client/art/RoundBoard.tsx`, `RouteMap.tsx` | The round board, and the route map over the world: cities, lamps, flights (and the drawn map that stands in until the pictures are in). |
| `src/client/art/satellite.ts`, `SatMap.ts`, `src/client/media/map/`, `scripts/satellite.mjs` | The real world in the middle: where the sun is, the pictures (made by the script from NASA's), and their painting under the board. |
| `src/client/art/dice.tsx`, `Passport.tsx`, `LandingCard.tsx`, `icons.tsx`, `texture.ts` | Dice, the passport, the arrival card, small icons, paper grain and stamp speckle. |
| `src/client/globe/` | The big screen's 3D globe (three.js): the real world day and night, city lights, flights. |
| `src/client/ui/` | The screens: `Game.tsx` (phone), `Screen.tsx` (big screen), `Board.tsx` and `mapView.ts` (the board, and its size and drag on a phone), `Decision.tsx` (the questions a team answers), `Trivia.tsx` (the waiting teams' quiz: the pop-up and the card to read), `TurnClock.tsx` (the turn clock's countdown), `Moments.tsx` (dice, coins, cards), `Ride.tsx` and `ridePlan.ts` (the first-person move), `Touchdown.tsx`, `Finale.tsx`, `Lobby.tsx`, `Home.tsx`, `Settings.tsx`, `Fullscreen.tsx`, `common.tsx` (team colours, chips, buttons). |
| `src/client/sound.ts`, `controls.ts`, `fullscreen.ts`, `keyboard.ts` | Sounds; vibration and shake to roll; full screen; sheets above a phone's keyboard. |
| `src/client/music.ts`, `ui/localSong.ts`, `ui/Local.tsx`, `src/client/local.ts`, `src/client/songs.json` | Being there: the local hit a second visit plays (the player; which song, when, on which device; "Now playing"), the arrival card's local part, prices in local money, and the data (songs, hellos, exchange rates). |
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
   A bigger map stays inside its box (`.boardwrap.zoomable` clips it); a trade's two sides stack on a
   phone under 360 px.
2. **Nothing runs off the big screen.** It fits at 1600×900, 1366×768 and 1280×720. The "now"
   column shrinks its cards when they're taller than the room (`FitColumn` in `Screen.tsx`); the
   finale is sized in `vh`. Where the side has room for two columns (16:9 and 16:10), the log runs
   under the standings and fades out at the bottom (the side is the named container `side`: a query
   without a name would measure the table, the log's nearest container, and never show it).
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
   tap meant for the last one can't answer it; the quiz's pop-up too. Buttons are 50 px tall, and
   nothing you tap is under 44 px: small text buttons, the top bar's menu and full-screen buttons,
   the pills (language, map size, poster or photo), a setting's whole row, the lobby's QR toggle, a
   trade's cities (`tests/e2e/phone.spec.ts` checks every key screen at 390x844, 375x667 and 320x568).
   Nothing looks tappable that isn't: answers are buttons only where they can be given. Text a player
   needs (labels, tags, the tab's count) is 12 px or more; only printed things go smaller.
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
   lists) and each team a letter and a character, for colour-blind players (tokens sharing a space
   wear their letter too).
9. **Our own work.** No photos, fonts, sounds or maps we can't license (the satellite pictures are NASA's,
   public domain, credited as NASA asks). Posters leave out modern
   buildings whose designs are still protected, and trademarks. The credits page lists every source
   and licence.
10. **The keyboard never covers what you type.** A phone's keyboard covers the bottom of the screen
   without making the page shorter (iPhones, Chrome on Android): while it's up over a field in a sheet
   or the play window, they sit on top of it and the field scrolls into sight (`keyboard.ts`, from the
   visible part of the screen, `visualViewport`). Fields in the page itself the browser brings up.
   Sheets keep their title and close button at the top while what's in them scrolls.

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

## The map's size

A phone or a laptop draws the board at the size the player picks (`prefs.mapSize`, kept on the
device): in the menu (地图大小: 小, 中, 大), or with the round button in the board's top right corner,
which goes round the three, its marks saying which it is. The big screen always fits the whole board.

* **Small** fits the whole board in its box, as before. **Medium** draws it 1.5 times as big and
  **large** 2.2 times (`ZOOM` in `ui/mapView.ts`); the box shows part of it, which a finger (or the
  mouse) drags round, a flick gliding on. A drag never opens a city; a tap still does.
* **Who starts where.** A phone (under 600 px the short way) starts at medium: the whole board is only
  about 290 to 370 px across there, which puts the airport codes at 7 to 9 px and the tokens at 20 px.
  A tablet or a computer starts at small: its board is 560 to 640 px already.
* **Where it looks.** The view follows the token of the team on turn, in step as it walks (it never
  shows where a token will land before it gets there), and stays on the board's edge rather than show
  the night past it. A drag leaves it where the player put it until the turn passes or a size is picked.
  Moving it is one CSS transform on `.board-pan`, a frame round `.board-view`, written on the animation
  clock and a layer of its own only while it moves (standing still, it's drawn sharp).
* **Your own move.** The ride's camera takes the view over where the map is (`release`): the dice
  tumble over the map as it was, the camera pushes in from there, and pulls back out to the map's size
  over where the token landed (`adopt`). One camera, no jump at either end, and nothing is drawn again
  at the throw. Flat (reduced motion, first-person off) the view goes along with the token as it walks;
  with reduced motion it holds still and is over the landing once the token is there.
* **Where else it shows.** Held sideways, the box is the board's square on the left. Other teams' tokens
  walk and stamp on the bigger map (their stamp is inside the frame that moves). The one-phone demo
  plays the same.

## Being there: the local hit, the arrival's local part, local money

Issue #44's parts 2 and 3 (its part 1, the satellite map: "The real world in the middle", below).

* **The arrival card says where you are, right now**: the city's hello in its own script, how to say
  it (谐音 for a Chinese reader, a respelling with the stressed part in capitals for an English one;
  none where the reader can read it already) and what it means; the local time (`Intl`, the city's
  IANA time zone, `art/places.ts`); the weather now (`weather.ts`); the local money and what $1 comes
  to there; and on a landing that paid rent, the rent in that money. Small and quiet, under the city's
  name. On the big screen the money rides on the hello's line, so the card still fits its column at
  1600x900 without shrinking (at 1366x768 `FitColumn` takes it to 94%).
* **Prices in local money** sit beside the game's: in the buy prompt and the auction (`CityBrief`), and
  in a city's sheet (price, rent now). Smaller, muted, in brackets: "$250 (≈ ¥39,000)", "$250（约 3.9 万日元）".
  Rounded to two figures: it says roughly how much, never more. A fixed rate table with its date
  (`local.ts`); nothing for Las Vegas and New York, where the game's $ is the money already.
* **A first landing plays the city's recording; landing there again plays a local hit** from just
  after the stamp until the team's turn ends (or it moves on: doubles, a card, Immigration), then
  fades out over 2 s. The 30-second preview loops with a 1.5 s crossfade. A city's songs come round in
  turn (each landing there moves them on by one, from a place of each game's own), so the same one
  doesn't play twice running. No song for a team the computer is playing: its turn is over before its
  token is down on the screens.
* **One device plays it**, so a room never hears the same song from several phones a little out of
  step: the big screen when one is on (as with the city recordings and Rio's band), otherwise the
  first online phone of the team that landed, otherwise the host's. Every other screen shows "Now
  playing" and where it plays ("大屏正在播放", "Mia 的手机正在播放"). A phone's is a row across the bottom
  of the arrival card; the big screen's sits under the standings, clear of the arrival card.
* **Under the game's own sounds.** Every sound the game makes ducks the song (to 30%, back over 0.6 s
  after it ends, `sound.ts`), and it's held down altogether through a pause, Seoul's ten seconds of
  silence and Rio's samba lesson. Nothing is fetched or played while the sound is off on the device
  that would play it; its "Now playing" says so, with a button to turn the sound on.
* **Apple's terms for previews**: the song is looked up when it plays (the iTunes Lookup API, in the
  storefront it was found in), streamed from Apple and never stored; "Now playing" names the song and
  its artist and links to it on Apple Music ("在 Apple Music 听完整版"); the credits page lists every
  song. The preview URL found when the list was made is the fallback if the lookup doesn't answer.
* **The record turns** while the song is on, 33⅓ turns a minute; it stands still with reduced motion.

## The real world in the middle

Issue #44's part 1: the world inside the printed ring is real.

* **The pictures.** By day NASA's Blue Marble: Next Generation (July 2004, with the sea floor's relief:
  the greenest month for the north, which fills most of the map); after dark NASA's Black Marble 2016,
  the lights of the cities. Both public domain; the credits page names them with their pages and NASA's
  terms, as NASA asks ("NASA Earth Observatory"), and says that using them doesn't mean NASA endorses
  the game. `npm run satellite` (scripts/satellite.mjs, needs ImageMagick with WebP) fetches NASA's own
  files once and makes them ready; the WebP files it writes are kept in the repo
  (`src/client/media/map`), so nothing comes from NASA while the game runs and no key is needed:

  | file | size | what for |
  | --- | --- | --- |
  | `day-1024.webp`, `night-1024.webp` | 1024 x 1024, 52 + 21 KB | a phone's or a laptop's board: the world from above the North Pole, as `art/geo.ts` `polar` draws it |
  | `day-512.webp`, `night-512.webp` | 512 x 512, 18 + 6 KB | a phone short of memory or saving data |
  | `globe-day-4096.webp`, `globe-night-4096.webp` | 4096 x 2048, 415 + 185 KB | the big screen's globe (the whole world) |
  | `globe-day-2048.webp`, `globe-night-2048.webp` | 2048 x 1024, 132 + 64 KB | a globe whose graphics card can't take 4096 |

  893 KB in all; a phone downloads 73 KB of it, the big screen 600 KB. `tests/satellite.test.ts` holds
  every file to its size and its share of that.
* **Day and night are the real ones right now** (`art/satellite.ts`): where the sun is overhead
  (`globe/sun.ts`), and so how high it stands over each place. Daylight shows the day picture, night the
  lights, and dusk is soft, from the sun 7 degrees under the horizon to 5 over (`DUSK`), the warm edge of
  it on the big screen's globe. Each city glows after dark. It moves on every minute.
* **Never in the way of the first paint.** The board is drawn at once with its old drawn map in the
  middle (sea, land, the night side). The pictures are fetched when the page next has a quiet moment,
  decoded off the page's thread and painted into a canvas under the board (`art/SatMap.ts`): the day
  picture, cut by a small picture of the daylight (160 x 160, stretched smooth: that's the soft dusk),
  the night picture under it, a little shade toward the edge. Then the drawn map fades out over it.
  Pictures that can't load (offline, the one-page demo opened from a file) leave the drawn map.
* **Cheap frames.** The canvas is a layer of its own: the ring over it is drawn again without the world.
  It turns with the table and moves with a move's camera (it's inside `.board-view`), is painted again
  only once a minute, and never while a move plays; the drawn map, faded out, isn't painted at all. A
  phone short of memory or saving data gets the 512 pictures, painted every five minutes.
* **Cities on top, readable.** Each sits at its real latitude and longitude in its region's colour, ringed
  in ink with a dark halo; the equator and the tropics are printed faintly over the world.
* **Flights** (`RouteMap.tsx` `FlightPath`; on the big screen `globe/main.ts`). When a team lands in
  another region, its own token (its character, happy) takes off from the last city once its token is down
  on the ring (nothing tells the landing before the stamp), climbs and comes down on the new city along
  the great circle in 2.6 s, its shadow keeping to the ground, the trail drawn behind it, then steps off
  the map, leaving the route. On the flat map a route that would dip off its southern edge (Sydney to
  Buenos Aires passes Antarctica) goes the other way round the same circle. A phone flies it once its own
  move has played; with reduced motion the route is simply drawn. On the big screen the globe flies the
  same token, a picture of it facing the room, along the arc while the camera leans in.
* **The big screen's globe** wears the same pictures in a shader (day, night, dusk, a little light for
  roundness, the air at its rim); it comes up once they're in, or after 6 s as painted paper that gives
  way to them when they arrive. With reduced motion or without WebGL it stays flat, and the board under it
  shows the real world as a phone's does.
* **The ring's colours.** Each city's space is washed in its region's colour, mixed into the navy as light
  mixes (20%, `tint` in `RoundBoard.tsx`), so the ring reads as the regions' posters round the world; the
  airport codes stay at 4.4:1 or more against it. Corners, the band of each region and everything else
  printed are as they were.

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
