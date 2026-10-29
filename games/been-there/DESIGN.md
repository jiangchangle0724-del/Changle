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
| `src/client/ui/` | The screens: `Game.tsx` (phone), `Screen.tsx` (big screen), `Decision.tsx` (the questions a team answers), `Moments.tsx` (dice, coins, cards), `Ride.tsx` and `ridePlan.ts` (the first-person move), `Touchdown.tsx`, `Finale.tsx`, `Lobby.tsx`, `Home.tsx`, `Settings.tsx`, `Fullscreen.tsx`, `common.tsx` (team colours, chips, buttons). |
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
   iPhone SE in English with long team names. The browser tests check this on every tap.
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
   tap meant for the last one can't answer it. Buttons are 50 px tall, small text ones 44 px.
7. **Never colour alone.** Each region's cities have a shape (on the board, the stamps and the city
   lists) and each team a letter and a character, for colour-blind players.
8. **Our own work.** No photos, fonts or sounds we can't license. Posters leave out modern
   buildings whose designs are still protected, and trademarks. The credits page lists every source
   and licence.

Then run `npm run typecheck`, `npm test` and `npm run test:e2e`. GitHub runs them on every push,
in Chromium and in WebKit (the engine in iPhone Safari and WeChat on iOS).

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

On a phone (and a laptop), the team's own move plays from behind its token. After the dice have
their moment (1.15 s), the board leans back into the night sky and a camera comes down behind the
token. It follows the token round the ring space by space, the cities it passes come up one by one
in the sky as paper tags, and it lands with the city's name in the board's type before the camera
pulls back up to the table. A card that sends the token on is a second, faster stretch after a
pause at the card's space (the hitch-hiking card's second throw too: it comes in the same moment as
the first, so it's the same ride); a card drawn where the token lands gets its sound and buzz once
the token is down; passing Departure shows the salary; the Passport Expired corner brings the
Immigration gate down at the end.

* **Where.** `ui/ridePlan.ts` works the ride out from the feed (which moves follow the throw, which
  way round, how long each part takes). `ui/Ride.tsx` plays it: one loop on the animation clock
  turns the table, moves a camera over it and leans it back (through `rig`, `art/RoundBoard.tsx`),
  and draws the token standing upright where its space shows on screen. Keep the board, the
  camera and the token on that one clock, or they drift apart.
* **Timing.** About 0.3 s a space for a throw (a long move runs: no stretch takes much more than
  2.4 s), 0.9 s on the landing, 0.64 s back up. Five seconds or so for a throw of seven.
* **What waits for it.** The play window steps aside (upright phones) and comes back with whatever
  there is to answer. Money that changes hands shows when the token lands: the cash in the top bar,
  its sound and buzz, the coins. A first visit's touchdown starts once the camera is back up.
* **What it gives way to.** An auction, Shanghai's quiz for this team, or a table vote cuts it short
  (`rideUrgent`). A shake doesn't throw again while it plays.
* **Off.** Reduced motion has no ride; the menu's 第一视角走棋 turns it off on its own. The board
  is then as before: the token walks round the top of the table.
* **The page stays still.** The leaning board is drawn bigger than its box, which clips it
  (`.boardwrap.on-ride`): the phone never scrolls sideways.

## The moments, and the phone in your hand

* **Your turn.** The edge of the screen glows gel twice, with the airport chime and a buzz.
* **The dice** knock the board as they land (0.74 s into their throw), with a clack.
* **A city bought:** the owner's mark stamps down and its ink spreads out round it.
* **Money:** coins fly from whoever pays to whoever is paid. On the big screen, every payment; on a
  phone, its own team's.
* **Sent to Immigration:** the gate comes down over the board.
* **Vibration** (`controls.ts`) works where a page is allowed to vibrate: Android. It buzzes on
  your turn, your throw, each space passed and the landing, money in and out, a city bought, a
  card, Immigration, an auction, a trade offer and going broke. iPhones can't: Safari doesn't let a
  web page vibrate, and iOS 26.5 closed the last way round it (a hidden switch's tick only fires
  for a real tap). There the glow and the sounds carry it; the menu says so.
* **Full screen** (`fullscreen.ts`). Android, iPads and computers use the browser's own: the
  corner button in the top bar and the menu. An iPhone doesn't let a page go full screen, so the
  button there explains how to add changle.ca to the Home Screen. The game page's manifest
  (`app.webmanifest`) starts that web app at changle.ca, the table, not at an old game.

Also still to do: playtests on real phones and with people who haven't seen the game.
