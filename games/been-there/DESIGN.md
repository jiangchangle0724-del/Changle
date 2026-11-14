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
  passport, the characters, dice, banknotes and cards, the ticket strip across the top of each
  question, the city names on the arrival postcard, the big screen's departure board, the
  touchdown and the finale's stamps.

* **The board** is a round turntable around an air-age route map (a polar projection). Since issue
  #44 the world in the middle is real: NASA's satellite pictures, daylight where the sun is up right now
  and the city lights where it has set (below, "The real world in the middle"). The ring round it stays
  printed, each city's space washed in its region's colour. On the big screen a 3D globe sits in the
  middle, under the board where the flat map is, so the tokens stand on it, wearing the same pictures.
  A team crossing to another region flies there along the great circle, its own token flying it. On a
  phone the player picks how big the board is drawn (below, "The map's size").
* **A board on a table**, as the original Monopoly is: seen from a chair, it leans back at rest, 26
  degrees on a phone or a laptop, at every size of its map, and 30 on the big screen (`boardLean` in
  `ui/Board.tsx`; until 11-12 a phone's board, and a laptop's bigger map, lay flat). A bigger map is
  that table seen closer: the map zooms and drags the board as it shows, leaning (`.board-pan` round
  `.board-view`), and follows a token where it shows (`place`, through `project`). The lean is the
  ride's camera at rest (`rest` in `ui/Ride.tsx`, one CSS transform on `.board-view`); `leanFit` finds
  how much bigger and lower to draw it so the leaned ring fills the box it had flat. A phone's own move
  starts from its map and ends on it: the camera carries the map's zoom and pan over the leaning board
  (`mz`, `mx`, `my`, written before the perspective), so neither end jumps. A new lean eases over 0.6 s
  (`.easing`), with reduced motion at once; a move's camera writes every frame and hands the board back
  at rest at once, even cut short. (Eased back instead, a pushed-in big screen's board ran 512 px off
  the screen for a moment, no longer inside the ride's clipped box: `tests/e2e/tv.spec.ts` caught it on
  WebKit.) The board is a
  thing too (`BoardDefs` in `art/RoundBoard.tsx`): its edge under its face (more of it shows as it
  leans), its soft shadow on the table, a lamp's light from the top left with its pool on the table
  behind, and lacquer on the colour bands. **What stands on it stands up**: the tokens, the buildings
  and the news and world tags are stretched back up by 1/cos(lean) (`standOf`), so they keep their
  height instead of lying down with the board; what is printed on it (codes, signs, owners' marks,
  stamps) lies flat. An owner's mark is a chip with its shadow under it.
* **The buildings** (`Buildings` in `art/RoundBoard.tsx`) stand up on a city's space like the tokens,
  upright while the table turns: little models drawn in code, with a front, a side in shade and a roof,
  1.5 times their drawing (`BLD_K`; it was 1.3), with their shadow on the space under them.
  One to four green houses side by side, or a hotel of three floors with lit windows and a sign on its
  roof carrying the city's own picture (the pyramid, the gondola, the die…): the city's landmark at a
  size a phone can still read. **A new one comes up out of the ground**: the ground opens under it, it
  pushes up through it (clipped at the ground until it's out: `#rb-above`), stretched as it rises,
  squashed as it lands, and settles; clods fly, dust puffs out both ways and a ring of dust spreads.
  Houses one after another, a hotel floor by floor with its roof dropping on (0.8 s each, 0.16 s
  apart). On a laptop and the big screen a big one comes up first where it's going to stand, 3.2 times
  its size, lands with a jolt that shakes it and shrinks to its place (`BuildFx`); on a phone, where
  the 我的 sheet covers the board, the city's row in the list has its own ground with the same moment
  at twice the size (`Lot`), and the map looks at the city for 2.6 s once the sheet is down (`look` in
  `ui/mapView.ts`). Sold, a building sinks back into the ground in dust; with a sound for each: a
  rumble, a thunk for each part landing and a chime (a hotel's a chord and a bell), a sinking one, and
  a card turned for a mortgage. What was there when the board first drew stays still.
* **Life between moves.** Every 2.4 s one thing on the board moves for a second: a token that isn't on
  turn looks round or bobs, or a hotel's sign swings and its windows blink (a city's owner mark gives a
  bounce while there's no hotel yet). One at a time, so a phone draws only that small part again; never
  during a move, with the page hidden, or with reduced motion.
* **Life on the map** (`art/MapLife.tsx`): now and then (every 13 to 19 s, 7.6 s a flight) a little
  airliner flies over the map between two cities the teams have been to, in different regions, along
  the great circle as a token flies it, its contrail behind it; and each city with buildings on the
  ring glows on the map, a hotel's brighter and wider. It lies between the satellite map and the board
  (the city dots and the tokens stand over it) and turns with the table. A plane is a small box the
  browser moves by itself, so nothing of the board is drawn again for it; the glows stand still (a
  light that never stops would keep a phone drawing frames all the time). One plane at a time, none
  while a move plays, with the page hidden or with reduced motion; not over the big screen's globe.
* **Six characters**, one per team colour, each with six moods (idle, happy, shock, sad, curious,
  smug): 咔嚓 Click, 呼呼 Snooze, 小旗 Flaggy, 背背 Packy, 箱箱 Trunky, 球球 Globey. On the board they
  stand at 0.88 of their drawing on a phone or a laptop and 0.62 on the big screen (`TOKEN_SCALE` in
  `art/RoundBoard.tsx`; it was 0.57 everywhere, then 0.8 on the flat board: the lean draws the ring a
  little smaller, its far side most). Several on one space stand in pairs, each pair further
  in toward the middle, a little smaller the more there are (`slots`), each whole and wearing its
  team's letter like the owner's mark on a city; the one whose turn it is hops.
* **Each city** has a poster built around its rule (Venice floods, Tokyo's trains are packed) and a
  passport stamp whose outline is its region's shape.
* **Moments are animated**: dice landing, banknotes changing hands, cards coming off their deck, the first-person
  touchdown in each new city (out of the plane window, through the clouds, the real local time and
  the live weather), and the finale (an exit stamp, teams read out last to first, the winners'
  medal, stamps and falling paper).
* **The report card (战报)** follows the finale (`ui/ReportCard.tsx`, `ui/tripReport.ts`), from what the
  room counted for each team over the game (`Tally` in `room/protocol.ts`, sent only once it's over):
  up to five awards in a fixed order (top landlord, priciest night, quiz champ, auction ace, hottest
  dice with three throws or more, doubles king, Immigration regular; nothing for nothing, a tie
  shared), and the dice, a bar for each total of two against a dot for the long run, with the numbers
  in words, so nobody has to wonder whether they were loaded. On a phone it comes in under the
  standings, with 存成图片: a 1080 × 1350 picture drawn on a canvas in the game's fonts and colours
  (`ui/reportPicture.ts`), shown in a sheet to press and hold (a data address, which WeChat saves too),
  share where the phone can, or download (a blob address of plain bytes: a data one downloaded nothing
  on an iPhone). An iPhone that can share gets one button instead, 存到相册或分享: a web page can't put
  a picture in Photos and a download goes to the Files app (from the Home Screen, nowhere), but the
  share sheet's 存储图像 puts it in Photos. The sheet sits beside the card, not in it: the card's
  entrance moves it, and a moving card holds a fixed sheet inside itself. The big screen has no room
  for both, so once the teams are
  in, the standings' column turns between them and the card every 12 s, beside the winners' card,
  sized in `vh` to fit 1280×720 (five awards take a third row, and the chart gives up a little height
  for it). A game started at a table has the way back to it in the big screen's top corner, beside
  the exit stamp, where it takes no height from the results.
* **The printed things are drawn in code** (SVG, CSS, a canvas for the paper grain) and the sounds are
  synthesised in the browser. What's real comes as files, each credited: the cities' photos and
  recordings (below), the songs (streamed from Apple), the satellite pictures of the world, and the
  game's own music (written for it in code, played with sampled instruments: "The music", below).

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
| `src/client/art/art.css` | The printed things' inks (paper, ink, map, dice, coins, banknotes, weather), their three fonts, and the board, posters and stamps. |
| `src/client/styles.css` | The frame: changle.ca's night tokens (`--night`, `--dusk`, `--gel`...) and the names the screens use (`--bg`, `--surface`, `--accent`...), the fonts, layouts (phone tabs; everything side by side from 960 px; the big screen), buttons, panels and sheets, and the scenes (touchdown, finale). |
| `src/client/art/characters.tsx` | The six characters and their moods. |
| `src/client/art/posters*.tsx`, `stamps.tsx` | The 22 city posters and passport stamps. |
| `src/client/art/RoundBoard.tsx`, `RouteMap.tsx` | The round board, and the route map over the world: cities, lamps, flights (and the drawn map that stands in until the pictures are in). |
| `src/client/art/satellite.ts`, `SatMap.ts`, `src/client/media/map/`, `scripts/satellite.mjs` | The real world in the middle: where the sun is, the pictures (made by the script from NASA's), and their painting under the board. |
| `src/client/art/dice.tsx`, `Passport.tsx`, `LandingCard.tsx`, `icons.tsx`, `texture.ts` | Dice, the passport, the arrival card, small icons, paper grain and stamp speckle. |
| `src/client/globe/` | The big screen's 3D globe (three.js): the real world day and night, city lights, flights. |
| `src/client/ui/` | The screens: `Game.tsx` (phone), `Screen.tsx` (big screen), `Board.tsx` and `mapView.ts` (the board, and its size and drag on a phone), `Decision.tsx` (the questions a team answers; `aim.ts` the spaces they're about, lit on the board), `Trivia.tsx` (the waiting teams' quiz: the pop-up and the card to read), `TurnClock.tsx` (the turn clock's countdown), `Moments.tsx` (dice, banknotes, cards; `notes.ts` the bills a sum is paid in), `Ride.tsx` and `ridePlan.ts` (the first-person move), `Touchdown.tsx`, `Finale.tsx`, `Lobby.tsx`, `Home.tsx`, `Settings.tsx`, `Fullscreen.tsx`, `common.tsx` (team colours, chips, buttons). |
| `src/client/sound.ts`, `controls.ts`, `fullscreen.ts`, `keyboard.ts` | Sounds; vibration and shake to roll; full screen; sheets above a phone's keyboard. |
| `src/client/music.ts`, `ui/localSong.ts`, `ui/Local.tsx`, `src/client/local.ts`, `src/client/songs.json` | Being there: the local hit a second visit plays (the player; which song, when, on which device; "Now playing"), the arrival card's local part, prices in local money, and the data (songs, hellos, exchange rates). |
| `src/client/bgm.ts`, `ui/bgmPlan.ts`, `ui/Bgm.tsx`, `src/client/bgm.json`, `src/client/media/music/`, `scripts/music.mjs`, `scripts/music/` | The game's music: the player; what plays, how loud and on which device; the files and their loop points; the score and the script that plays and mixes it. |
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
   **It comes rarely, and with a landing**: once eight minutes have passed since the last question
   (four since the game's start, for its first), the next team to land on a city brings the teams
   waiting a question about that city. It comes up when the move has played and the stamp is down, 4.5 s after the throw, or
   10 s after it on a team's first visit, when the landing scene plays first (on a big screen, for
   everyone). A question that popped up at the start of every turn kept
   covering the play window. While a big screen is on, the question isn't the one its arrival card
   answers (the fact behind the city's rule, printed there).
   **It needs someone there to answer.** With only computer teams waiting (a person playing the
   computer, on their own turn) it waits until that turn is over: the person is asked about the city
   they've just been to, while the computer teams move. On one phone for every team it never comes
   up over a move: between two turns, before the next team throws, or while a computer team moves.
   **It never covers what the landing asks of the table.** It waits for the team to decide whether to
   buy, and for an auction, a vote or Rio's dance and scores; after one the waiting teams took part in,
   it leaves them 4.5 s to see how it came out. One that had to wait doesn't come up over another
   team's move either: 4.5 s after the throw at the soonest.
   **First come.** Once a landing has brought a question, it keeps it until it comes up, even when
   that team moves on (doubles, a card, Immigration) or others land meanwhile: it's about the city
   the team has just been to. Taking it over with each newer landing would start its wait again
   each time, and where teams play fast it never came. Only one waiting for someone to answer it
   gives way to a newer landing.
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
  the night past it. With the play window up over the bottom of the board, the token stands in the
  middle of the part the window leaves, as far as the board's edge lets it (`cover`: measured as the
  window is laid out, and again as it grows or shrinks). The window is no taller than its question
  needs, and never more than about half the screen (54%: a longer question scrolls inside it, its
  answers held at its foot): your roll takes about 225 px of an iPhone 13's 664, the dice with one
  line under them (shaking, and where building is; "your turn" is the banner over the board's). A drag leaves it where the player put it until
  the turn passes or a size is picked. A big rent pushes in on its city for 2.6 s, to 1.6 times at
  least, even at the size that shows the whole board (`look`).
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

## The music

The game's own music, written for it: **"Boarding Call" (登机广播)**, a medium swing in the manner of a
1930s small band, the decade of the posters, and its ending for the results.

* **The tune.** A 32-bar AABA song in F: the A is a riff that climbs to the top of the chord and comes
  back, answered a step higher (I-VI-ii-V, the blue seventh on the way home); the bridge goes round the
  cycle of dominants (A7 D7 G7 C7), a figure two bars long a fifth lower each time. Two choruses, 64 bars
  at 125 a minute, 122.88 s, written to go round: the last bar turns back to the first.
* **The band.** Clarinet (the tune), muted trumpet (the first chorus's bridge, then a second voice under
  the clarinet), piano (sparse comping on the offbeats, three high notes where the tune rests, sixteen
  bars of solo), rhythm guitar (four even strokes a bar, root, seventh and third), upright bass (in two
  for the first sixteen bars, then walking), brushes (a swirl on every beat, a tap or the ride's "ding,
  ding-a ding", the hi-hat on two and four, the bass drum felt more than heard; a fill at the end of each
  eight). The first chorus is the tune; the second has the piano's sixteen, the clarinet's own bridge
  and the shout, both horns together. Swing at 0.64 of the beat, each player a little uneven in their own
  way (the clarinet a hair behind, the bass on top), all of it the same every time it's made.
* **The ending** (11.3 s): the riff by everyone over two bars, three high piano notes alone, the band's
  last chord on four, held, a cymbal swelling, and the final stroke. It starts with the exit stamp, so
  the last chord comes as the paper falls.
* **Made in code, played by samples.** `scripts/music/score.mjs` is the score (notes, voicings, the bass
  line's search for its smoothest walk, the drums, the players' timing); `npm run music`
  (`scripts/music.mjs`) has FluidSynth play each instrument alone with the GeneralUser GS SoundFont (S.
  Christian Collins, its licence lets the music made with it be used freely, commercially too; fetched
  at a fixed version, never committed), and ffmpeg mix them: a little EQ each, the balance measured where
  each one plays, one room they all send to (an impulse response made in the script), levelled to -20
  LUFS, true peak under -1.5 dBTP. The files: `theme.mp3` (stereo, 112 kbps, 1.7 MB) for the big screen,
  `theme-mono.mp3` (64 kbps, 1.0 MB) for a phone, `finale.mp3` (155 KB); `tests/bgm.test.ts` holds their
  sizes.
* **The loop is the music going on.** The theme is played twice round and a bit, and the file is cut from
  the second time round with a second either side; the player loops between those two points
  (`bgm.json`), sample for sample the same music on both sides of the join (the script checks the second
  time round against the third: -139 dB). 125 a minute makes a beat 0.48 s, a whole number of samples
  and of milliseconds, so the join is exact.
* **One device plays it** (`ui/bgmPlan.ts`): the big screen when one is on, otherwise the host's phone,
  otherwise the first phone online; in the one-phone demo, that phone. A phone gets the mono file: about
  24 MB once decoded, half the stereo one's.
* **When.** From the game's start to its end, going round; nothing in the lobby. It fades in over 2.5 s,
  sits at half volume under the game's sounds (each of which ducks it, `sound.ts`) and under the local
  hits, and comes down out of the way: right down for a local hit (it's music too), Seoul's silence, Rio's
  samba from the ready card to the scores, a party forfeit (one of them is humming a song) and a pause;
  to 30% for a first visit's city recording. Then the ending, once.
* **The menu's 背景音乐 / Music** turns it off on this device (`prefs.music`, on unless turned off); with the
  sound off it's off too. Nothing is fetched or played while it's off, and nothing before the game starts.
* **Cheap.** Fetched when it's about to play, never in the first load; scheduled on the audio clock; no
  work on any frame.

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
  phone short of memory or saving data gets the 512 pictures, painted every five minutes. Measured on a
  390x844 page with the CPU slowed 4x (before and after, in turns): the drag holds 60 frames a second;
  the first-person ride went from 51 to 46. An earlier set gave 45 before and 41.5 after; measured
  straight after it, the new page with the picture hidden during the ride gave 47.5, faster than before
  (the drawn land isn't painted any more). So the cost is headless Chromium blending one more layer with
  no graphics chip; a phone blends it on its GPU. Check on a real phone with the menu's 测速.
* **Cities on top, readable.** Each sits at its real latitude and longitude in its region's colour, ringed
  in ink with a dark halo; the equator and the tropics are printed faintly over the world.
* **Flights** (`RouteMap.tsx` `FlightPath`; on the big screen `globe/main.ts`). When a team lands in
  another region, its own token (its character, happy) takes off from the last city once its token is down
  on the ring (nothing tells the landing before the stamp), climbs and comes down on the new city along
  the great circle in 2.6 s, its shadow keeping to the ground, the trail drawn behind it, then steps off
  the map, leaving the route. On the flat map a route that would dip off its southern edge (Sydney to
  Buenos Aires passes Antarctica) goes the other way round the same circle. Every phone takes off at the
  same moment, a quarter of a second after the stamp (the thrower's as its camera pulls back out); with
  reduced motion the route is simply drawn. On the big screen the globe flies the same token, a picture
  of it facing the room, along the arc while the camera leans in, once the move has played.
* **The big screen's globe** wears the same pictures in a shader (day, night, dusk, a little light for
  roundness, the air at its rim): the 4096 ones, or the 2048 ones where a graphics card can't take them,
  on a light device, or where the drawing is done in software with no graphics card. They go on between
  moves, never during one or during a flight (the first time takes the page a moment), and the globe
  comes up once they're on, or after 6 s as painted paper that gives way to them when they are. With
  reduced motion or without WebGL there's no globe, and the board shows the real world flat, as a
  phone's does.
* **The ring's colours.** Each city's space is washed in its region's colour, mixed into the navy as light
  mixes (20%, `tint` in `RoundBoard.tsx`), so the ring reads as the regions' posters round the world; the
  names stay at 4.4:1 or more against it.
* **Each city's name on its space** is in the player's language: its airport code in English, its
  Chinese name in Chinese (`BOARD_ZH` in `art/stamps.tsx`: two characters at 25 board units, three or
  a name on two lines at 18, in ZCOOL QingKe HuangYou with a thin stroke of its own ink so it holds up
  small). Both are outlines made by `scripts/board-type.mjs` (`CODE_PATH`, `ZH_PATH`), simplified to
  the board's sizes so the file stays small. The boarding pass on a question and the quiz card say
  the same (`placeTag`); the departures board on a move keeps the codes on its flaps, as an airport's
  does, with the name beside them in the player's language. Corners, the band of each region and everything else
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
  of the sky. "flat": the same beats on the board as it rests (leaning back as on a table, and no
  further), for reduced motion, the menu's 第一视角走棋 off, or a throw that stays put. "tv": the big screen pushes in 1.4× and pans 55% of the way to the
  token, leaning as its board rests, with its own departures board beside the board
  (`ui/Departures.tsx`). Every other phone walks the token on its board as it rests, in step, and
  stamps the landing with the thrower's.
* **A token walking** on a board at rest hops a space at a time (`HOP` in `art/RoundBoard.tsx`): up
  22 board units, stretched a little in the air while its shadow stays on the board and shrinks
  under it, a quick push off each space on the way and a squash onto its feet as it lands. Its own
  hop on the spot waits while it walks.
* **Each space answers a token**, as a tile does in the phone games (`pressSpace` in
  `art/RoundBoard.tsx`). On a move's walk (`ui/Ride.tsx`) each space the token comes down on lights
  up for 0.4 s and ticks (`sfx.step`; the departures board's flap is for its rows); where the move
  ends the space lights gold, sinks 10% and comes back up, and a ring spreads out from under the
  token. Another team's hops on a phone's board at rest get that landing only: they come often, and
  a space that sinks is drawn again every frame (its city, marks and buildings with it), which cost a
  phone at 4× slowdown 4 to 8 frames a second when every hop did it (`npm run perf`). A space passed
  while the ride skipped ahead, or before this screen heard of the move, doesn't light.
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
  standings and every team's cash with the question. The waiting teams' quiz question about the
  city, when the landing brings one, is held back on the server until the move has played.
* **What it gives way to** (`rideUrgent`). An auction or Shanghai's quiz for this team cuts it short
  and brings the question straight back; a table vote waits for it unless that would leave less
  than 15 s to answer. A shake doesn't throw again while it plays.
* **The page stays still.** The leaning board is drawn bigger than its box, which clips it
  (`.boardwrap.on-ride`): the phone never scrolls sideways.

## The moments, and the phone in your hand

* **Your turn.** The edge of the screen glows gel twice, with the airport chime and a buzz. On the
  big screen the chime is the next team's boarding call, its flight number on the departures board.
* **The dice** are in the air the moment the button is pressed (under 0.1 s), clack twice as they
  land, and their number comes up with a tick. They are cubes (`art/dice.tsx`, CSS 3D) that come to
  rest as dice do on a table seen from a chair: the number on the top face, two sides showing, their
  shadow on the table under them, staying there while they're in the air. Held down, the throw
  button rattles its die in the hand.
* **Doubles** (`ui/Doubles.tsx`): as the dice settle they knock together and light up, and the call
  pops up: 双数！再掷一次 in gold (out of Immigration: 免费出关, no second throw). The third in a row
  is speeding: 连掷三次双数！超速 in red with the police lights, red at the screen's left edge and
  blue at its right taking turns 1.6 times a second for 1.6 s (well under three flashes a second),
  a siren, and then the gate (`JailFx`, 1.5 s on). In a move's ride over the board's far side, clear
  of the departures board; on a phone's throw that doesn't move and the big screen's under the dice.
* **A city bought:** the owner's mark stamps down, its ink spreads out round it and sparks fly out of
  it, in the team's colour and gold; its chip comes down onto the board with its shadow coming in
  under it. **Mortgaged**, the chip turns over like a card and lies face down (ink on paper), and
  turns back when it's paid off.
* **Sold, broke** (`useBoardFx` in `ui/Board.tsx`): a city won at auction is stamped 成交 SOLD on its
  space in the winner's colour for 1.8 s, struck by the auctioneer's gavel as it lands (wound up, down
  at 0.29 s with its knock, `sfx.bid`, a bounce off it, then lifted away: `Gavel`). A team gone broke
  is stamped 破产 BROKE where its token stood, once its move's token is down there (it walks there
  first), and its token wobbles, tips over on its feet, lies there a moment and fades (2.4 s, to four
  notes sliding down, `sfx.broke`). Then its cities go, one after another: to the team it owed, each
  chip turning over to that team's colour and letter as in a deal; to the bank, each chip lifting off
  the board and flying into the middle, shrinking (`chip-off`); the money it had left flies from where
  its token lies. On every screen. Only what happens while the board is up: what was in the log when
  it first drew is old news. With reduced motion the stamp simply stands there for its 1.8 s, the
  chips simply change, and new buildings are simply there, with no dust and no sparks.
* **Rent** (`useRentFx` in `ui/Board.tsx`, `rentSpace` in `art/RoundBoard.tsx`): once the token that
  pays it is down on the city, what stands there bounces on the spot, its door and windows lit and its
  front catching the light (a city with nothing built: its owner's chip bounces). A big one, $500 or
  more (the size the party forfeit calls huge), bounces twice and sends a ring of gold out round the
  city, and a phone's map pushes in on it (unless it's the phone's own move, which its ride shows). On
  the big screen with the till: a bright ring over a coin's chink, a big one ringing twice (`sfx.rent`).
* **A deal** (`ui/Deal.tsx`): 成交！ comes up over the board with the two teams, and what changed
  hands under it, one thing after another: each city turning over from its old owner's colour to its
  new one's (as its chip turns over on the board, 0.16 s apart: `hand` in `art/RoundBoard.tsx`), the
  money with who got it (on the big screen it flies token to token). Two hands clap and two notes go
  up, on the big screen and the phones of the two teams, with a buzz; every phone sees it, over a
  sheet too. A full set the deal made comes after it (`late` in `ui/Sets.tsx`), and so does one a team
  gone broke handed over.
* **Money:** banknotes fly from whoever pays to whoever is paid, once the token is down, as a board
  game's bank pays: in the bills that make the sum (`notesFor` in `ui/notes.ts`: 500, 100, 50, 20,
  10, 5 and 1, each its own pastel on printed paper with its value in an oval, `--note-…` in
  `art/art.css`), a round sum changed into smaller ones so that at least three fly ($200 is a 100
  and two 50s), never more than eight. Each leaves the hand at its own slant 70 ms after the last,
  flutters as paper does over the top of its arc (never above the top of the screen: a phone's
  wallet is right under it), and a riffle plays as they go (`sfx.riffle`). On the big screen, every
  payment, token to token (the bank is the middle of the board).
  **On a phone the cash in the top bar is the team's wallet** (`wallet` and `Cash` in
  `ui/Moments.tsx`): every dollar in or out of its own team, the bank's too, flies into it or out of
  it. In from the token that paid, Departure's corner (the salary), the token's city (a stamp's
  bonus), a space (a building sold, a mortgage); out to the token paid, the city bought (a building:
  its row in 我的 when that's open), the middle of the board (a fine, a tax). An end off the screen
  comes in from its edge. The cash counts as the first notes land in it or leave it, bumping up in
  gold as money comes in and dipping as it goes, the change floating off below it, with the till or
  the pay sound (a city bought or a building has its own). Several payments at once set off 0.28 s
  apart. With reduced motion the cash simply changes, with its sound. Each move's money shows with
  its own token's stamp, even as the computer's teams throw one after another (each waits 0.9 s, a
  move plays for 3 or so): `useHeld` keeps a step for each move, and the wallet's notes come in
  batches the cash counts with, one each (`batchesAt`).
* **A card** (`CardFace` in `ui/Moments.tsx`) comes off its deck: it lies face down on top of the pile
  (the deck's own backs: the journey cards' stripes, the postcards' in the gel), lifts off it at a
  slant, turns over on its way to you and settles, while the pile sinks away under it (1.1 s). On a
  phone, in the play window, as the window comes back up after the team's own move (drawn while it
  was away, it would turn over with nobody watching); on the big screen, in the middle of the board
  once the token is there. With reduced motion it's simply there, face up, and no deck.
* **Where a question would take you** (`ui/aim.ts`, `AimMarks` in `art/RoundBoard.tsx`): while a
  question about a space is up, that space is lit on every screen, once the move that brought the
  question has played: it glows gold under what's on it, with a bright edge and a glow off it, breathing
  three times as the question comes (a ring spreading each breath) and then holding lit. Beijing's
  中轴线 lights the space straight across, with a dashed path to it from the token through the middle
  of the board (the axis), its dashes marching toward an arrow; a car permit, the three spaces it can
  take the token to, as thrown first and brightest, with a path round the ring; an Air Miles card,
  the four routes; an auction, the city up for sale; New York's vote, the city whose rent it's about;
  a card's free house (or a typhoon, a sale) and Mumbai's dabbawalas, the team's own cities it can go
  on or come off. On a phone the map goes to the space (one question, one place: not for a choice
  spread round the board), above the play window, zooming in to the middle size at least so it can
  reach either side of the board (`aim` in `ui/mapView.ts`); on the phone asked, even after a drag.
  With reduced motion it's lit and still.
* **A token sent straight to a space** (`straight` in `art/RoundBoard.tsx`, `straightMoves` in
  `ui/Board.tsx`) flies there over the middle of the board in one long hop (1.1 s), rather than
  walking half the ring: Beijing's jump (along the path the question showed), an Air Miles card's
  route, a tango's partners changing places, a team sent to Immigration (on another team's phone,
  its token walks to where the throw took it with the throw, stands there a moment, then flies on).
  On the phone whose own token flies, the table turns to its new resting place only once it's down.
* **Amounts that would float off one spot** (several teams paying this one at once, their tokens
  off one edge of a phone's map) stand one under another (`stackLabels` in `ui/Moments.tsx`).
* **A full set** (`ui/Sets.tsx`): the moment a team owns a whole group (rent there doubles, and it can
  build), its spaces light up in its colour one after another, 0.18 s apart once the owner's stamp
  is down, then glow together twice and go out by 3.2 s (`.set-lit`, Istanbul with them when it
  stands in for a Europe city). A call comes up over the board, ringed in the group's colour with its
  shape: 集齐北美！ and its cities lighting up in it in the same order (a phone's play window may be
  covering the board), and 租金翻倍，可以盖房了; another team's says whose. A brass call with a bell
  (quieter for another team's on a phone) and a buzz for the phone's own. Only sets made while the
  screen is up.
* **Sent to Immigration:** the gate comes down over the board.
* **Rio's samba** (`ui/Samba.tsx`). A team that says it will dance gets a ready card on its phone,
  under the top bar: stand up, leave room for a step, what comes next, and one big Start. The
  other phones and the big screen say whom they're waiting for. Nothing starts until Start is
  pressed; left alone for 60 s it starts by itself (the card counts its last 15 s; never in the
  one-phone demo). Then every screen counts down 5 4 3 2 1 from the server's moment, a whistle to
  each numeral, and plays the same 40 s lesson (protocol `TIMING` and `DanceView`): eight figures
  of eight beats at 100 a minute (slowly, the step, bounce, to the side, hips, hands up, shoulders,
  all together) and a pose. The teacher is a carnival dancer drawn as a person (hair and feathers,
  a face, a top and skirt in the team's colour, arms with elbows, legs with knees, shoes) and a
  mirror of you: the spot under the foot to move lights up, and the figure's word is on screen and
  spoken a little ahead of the beat. She is a paper puppet: each part is drawn once, on a layer of
  its own, and a frame only moves the layers (a CSS transform each, the compositor's work). Nothing
  is painted again as she dances but the two ribbons while they fly, and the words beside her when
  they change. Full screen on the dancing team's phone, small over the judges' buttons (which light
  up when it's over: their 25 s start then), big over the big screen's board, where the band plays
  (or on the dancer's phone when there's no big screen). A computer team, or one the computer is
  covering, has nobody to get ready or to teach: it dances a short one at once (10 s: two figures
  and the pose). The room's song is hushed from the ready card to the lesson's end.
* **世界大动荡** (world upheaval, `engine/world.ts`, `ui/World.tsx`, the board's part `WorldMoment` in
  `art/RoundBoard.tsx`). Every 20 minutes (once, at 8, in a 15-minute game) something happens to the whole
  world, three bad and three good, each once before any comes round again: a financial crisis, a meteor,
  a terror attack, the AI revolution, a new invention (the supersonic airliner), a travel boom. It comes at
  the start of a turn, once the last throw has played and with no question up, and the table waits for
  its moment (7 s). The board plays it first, for about three seconds, on every screen: the crisis's chart
  falls in vermilion across a darkened map with −15%; a meteor comes in over the rim onto its city, one
  flash, a shock wave, debris; slow blue rings round the city locked down (no explosions, no red, no
  people); the AI's cyan circuits spread from the middle, +$50; the airliner crosses with its contrail and
  a sonic boom; the boom's fireworks, ×1.5. Then the 号外 card comes in, printed like a newspaper's extra
  (paper and navy ink, its masthead vermilion for bad news, green for good, the event's own picture): the
  headline, what happened (the city it struck, the hotel it took and the insurance; on a phone, what the
  crisis took from your team) and what it does for two rounds. On a phone over the top of the board (tap
  to put it away); on the big screen across the foot of its board, bigger, the map above it in sight. With
  its sound: the big screen's, or each phone's when there's none. While it lasts, a banner like the travel
  news says what it does and how many rounds are left (the play window; the big screen's side), and the
  city struck wears a tag, 陨石坑 or 戒严, a meteor's crater where its buildings stood. Nothing in it
  flashes more than once, and the rings come under twice a second. With reduced motion the board plays
  nothing and the card is simply there.
* **Reactions** (表情, `ui/Reactions.tsx`). A team's player taps the round button in the board's top left
  corner (the map's size is in the top right) and picks one of five: its own character in a mood, with
  its word (好耶！ 不会吧！ 呜呜… 嗯？ 嘿嘿). No typing, so there's nothing to watch over. Every screen in
  the room shows it at once for 2.8 s, a pill in the team's colour with the face, the word and the
  team's letter: on a phone under the button (on your turn the play window covers the board's lower
  part), on the big screen rising off the board's bottom left corner, bigger, with a small sound. One a
  player every 1.5 s (the room drops quicker ones), never kept, and drawn on a layer of its own, so one
  arriving mid-move redraws nothing else. Not in the one-phone demo; with reduced motion they fade in
  and out in place.
* **Vibration** (`controls.ts`) works where a page is allowed to vibrate: Android. It buzzes on
  your turn, your press on the dice (or any answer), the landing, money in and out, a city bought, a
  card, Immigration, an auction, a trade offer and going broke. iPhones can't buzz from a page: the
  buttons that matter most (the dice, buying, dancing) are a hidden switch inside a label, which
  Safari answers with its own light tap (`HapticBtn`), and the glow and the sounds carry the rest.
* **Shake to roll** (`controls.ts`, `ShakeToRoll` in `ui/Decision.tsx`): while the dice are up,
  three firm jolts within 0.6 s throw them. Android sends a page motion without asking. An iPhone
  sends none until it has asked the player (运动与方向, Motion & Orientation), and it asks only when
  the page asks straight from a tap: 开启摇一摇 under the dice, or 允许读动作 in the menu, call
  `requestPermission` before anything else in the tap. Safari keeps the answer until it's closed, so
  the page also asks as it opens, without a tap: that brings back a yes or a no it already has (and,
  with none, fails without asking anything). A yes turns shaking on at once. After a no Safari won't
  ask again until it has been closed and opened, so where the button was, 摇一摇没开，怎么开 says how
  (open by itself after a tap that brought no yes, or no question at all).
* **The screen stays on** (`wake.ts`): a phone set down between turns and the big screen keep a
  wake lock, asked for again when the page comes back.
* **Full screen** (`fullscreen.ts`). Android, iPads and computers use the browser's own: the
  corner button in the top bar and the menu. A phone keeps the way it was held when it went full
  screen (one put down flat doesn't flip its board). An iPhone doesn't let a page go full screen,
  so the button there explains how to add changle.ca to the Home Screen; the game page's manifest
  (`app.webmanifest`) starts that web app at changle.ca, the table, not at an old game.
* **Watching on a TV** (menu, 旁观): any device can become the room's big screen in place, keeping
  the sound it was allowed to play; one opened straight on the board asks for a tap to turn sound on.
* **Photosensitivity** (WCAG 2.3.1 and 2.3.3). Measured on films of every screen through a throw
  and a turn call: at most 2 flashes a second over 25% of a 10-degree field (3 with a stricter
  field a quarter of the screen across), no red flashes. Rio's samba, from the countdown to the
  pose, filmed at 30 frames a second of the game's clock on all three screens: over 25% of a
  10-degree field, at most 1 flash a second on the dancing team's phone and on a judge's (2 a
  second reach 23% of one) and 2 on the big screen (3 a second reach 19% of one); with the
  stricter field, 3 on the phones and 2 on the big screen; nothing anywhere flashes 4 times in a
  second, and nothing red. Reduced motion (the phone's setting or the menu's) plays every beat flat
  and still: no leaning into the night, no push, no tumble, no hops, and a teacher who stands still
  while she waits and counts, then holds each beat's pose for the whole beat. (The board keeps its
  lean at rest, which never moves; new buildings are simply there and sold ones simply gone.)

Also still to do: the ten-minute playtest on real phones (the script and record sheet are in the
beat sheet's document), with people who haven't seen the game.
