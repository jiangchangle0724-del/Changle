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
| `src/client/ui/` | The screens: `Game.tsx` (phone), `Screen.tsx` (big screen), `Decision.tsx` (the questions a team answers), `Moments.tsx` (dice, coins, cards), `Touchdown.tsx`, `Finale.tsx`, `Lobby.tsx`, `Home.tsx`, `Settings.tsx`, `common.tsx` (team colours, chips, buttons). |
| `src/client/sound.ts`, `controls.ts` | Sounds; vibration and shake to roll. |
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

## Next: photos and recorded city sounds

The brief asks for a Creative Commons photo of each of the 22 cities and for recorded city sounds.
Neither is in the game yet: the cloud environment that built it couldn't reach the sources. On a
computer with ordinary internet:

* **Where from.** Photos: Wikimedia Commons (commons.wikimedia.org) and Openverse
  (openverse.org). Sounds: Freesound (freesound.org) and Wikimedia Commons.
* **Which licences.** Public domain or CC0, CC BY, or CC BY-SA. Skip NC (non-commercial) and ND
  (no derivatives): NC limits where the game can go, and ND doesn't allow edits such as crops.
* **Read each file's own page**, not the search result, for its licence and author. Leave out
  photos with recognisable people, logos and trademarks. Also leave out recent buildings in
  countries without freedom of panorama: France, Italy and the UAE are among them, and Commons
  marks such files. The posters already leave those buildings out; the Eiffel Tower lit at night
  is a known case.
* **Credit every file.** Add a list to the credits page (`src/client/ui/Credits.tsx`, like the
  fonts' list) with name, author, licence and link, and what was changed (cropped, recoloured,
  shortened). Its texts in `i18n.ts` (`creditsArtText`, `creditsSoundText`) currently say no
  outside images or recordings are used: change them.
* **Keep it light for phones.** Use WebP photos sized for where they show (about 1200 px wide on
  the big screen, 600 px on phones), fetched when a city first comes up rather than at the start.
  Use short sound loops of a few seconds, as MP3 or AAC, which every phone plays.
* **Keep the one-page demo small.** `dist/demo.html` carries everything inside it (about 820 KB
  now), so leave photos and recordings out of it, or use only a few small ones.
* **Sound must still work without the files.** Each city's arrival sound is a sketch made in the
  browser (`CITY_SOUND` in `sound.ts`). A recording should replace its sketch once it has loaded,
  and the sketch should play if it hasn't. Phones (and WeChat) still need a first tap before any
  sound plays.
* **Where photos go** (the arrival card, the touchdown, the credits) is a design call. The posters
  are the game's look from step 5, so photos sit alongside them rather than replacing them. Give
  each photo a short alt text in both languages, and check it against the rules above: the night
  (a bright photo glares on it), the big screen's fit, and the frame rate.

Also still to do: playtests on real phones and with people who haven't seen the game.
