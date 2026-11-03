# 藏在人群里 · Hide in the Crowd: design

How the game looks and moves, where each part of the look lives, where every picture comes from,
and what a design change has to keep. How to run and deploy it is in [README.md](README.md).

## The look

It is one of changle.ca's games, so it wears two looks, one inside the other:

* **The frame is changle.ca's.** Top bar, buttons, chips, switches, sheets, the penalty stamp and
  type are the site's night room (`docs/DESIGN.md` and `site/DESIGN.md` in the repository): night and
  dusk panels with a hairline, Unbounded headings and Figtree text, pill buttons, sheets that rise
  with a handle and close on the phone's back button, a bilingual title with the reader's language
  leading. `src/client/tokens.css` is a copy of the site's `site/src/styles/tokens.css`
  (`tests/design.test.ts` fails if they differ), and the stylesheet uses only its `var(--…)`.
* **The game's gel is #7be55c**, a leaf green: the empty gap in the site's spectrum between
  Limbo's lime and the mint. Its main button on each screen glows in it, your own chip and score
  are lit in it, your marker in the crowd is drawn in it, and it spills down from the top of the
  screen as the room light. The site's registry has the same value (`tests/design.test.ts` checks).
  On the home page its card is in the online kind (aqua), like 到此一游 and 神回复.
* **The arenas and the crowd keep their own art** (below): three bright daytime places and three
  kinds of people, inside the night frame. Their colours are not the site's; they are listed as
  the game's own art colours at the top of `styles.css` (`--arena-*`, `--look-*`), as the design
  rules allow for a game's props.

## Screens

| Screen | What it shows |
| --- | --- |
| Phone, lobby | The table's code; the arena vote (three rows with a picture of each place); who's here (your chip lit, the host marked); the penalty switch (the host's; a line for everyone else); the big screen (how many watch, or how to open one); Start under the thumb (the host) or "waiting for the host". |
| Phone, a round, sideways | How it's meant to be played: the arena fills the screen; a thin bar on top (menu, arena, clock, your score, full screen), the scores down the right, the stick under the left thumb, Punch (big, the gel) and Blend in (quiet) under the right. |
| Phone, a round, upright | The same, stacked: bar, arena, scores, "turn sideways for a bigger view", controls. |
| Phone, joined mid-round | The arena and the scores, and "you're watching this round, you're in the next one". |
| Phone, end of a round | The penalty stamp first (when the host has penalties on; held sideways, the word on the left and the rest beside it), then the result: who won, everyone's tags and how often they were spotted, the host's Play again and Pick another arena, and Back to the table. |
| Big screen, lobby | A 1920 x 1080 stage: the title, the three arenas with their vote counts, three lines of how to play, a QR code to the changle.ca table with its code, who's here, the penalty, "waiting for the host". |
| Big screen, a round | The arena at the screen's own size, and on the stage over it: the arena's name and rule (top left), the clock (top middle, red in the last ten seconds), the scores with a pip per tag (top right), and "nobody is marked" along the bottom. |
| Big screen, end of a round | The penalty stamp for seven seconds, then the result card. |
| Phone, the menu (⋯) | Language, reduced motion, full screen, this device as the big screen, where the art comes from, the way back to the table (in a round too; the host's asks first, since it takes everyone back), and the rules. |
| Practice (`/hide/practice`) | One phone against three computer rivals hidden in the crowd (`src/client/practice.ts`): the game card's one-phone button. No penalty. |
| Credits (`/hide/credits`, and the menu) | Where every picture and model comes from. |

The big screen is laid out on a 1920 x 1080 stage scaled to the screen (`Stage` in `ui/Tv.tsx`),
so a 720p TV shows exactly the same picture, smaller; its type is half as large again as the
phone's (`html.is-tv`), to read from across a room. The arena underneath is drawn at the screen's
own size, not scaled. `tests/e2e/tv.spec.ts` checks that nothing leaves the screen at 1920 x 1080
and 1280 x 720.

## Nobody is marked

The game is about not being found, so nothing a screen is sent may tell a player from a
passer-by (`Room.view` in `src/room/room.ts`, tested in `tests/room.test.ts` and
`tests/e2e/tv.spec.ts`):

* Every body is sent the same fields (position, facing, speed, pose) and nothing else: no ids, no
  names, no "player" or "passer-by", no top speed.
* The crowd's order is shuffled when a round starts (`createMatch`). Every screen draws by that
  order (each place keeps one of the three looks), so players are spread among the looks and the
  places in the list like everyone else.
* A phone's own body is marked (`me`) on that phone only; the big screen gets no `me` at all.
* What gives a player away is what they do: running, punching, being knocked down. That is the
  game.

**A tagged player slips back into the crowd.** When they get up (after 1.15 s), they swap who
they are with a passer-by at least 24 units from whoever tagged them; every body stays where it
is, so no screen sees anyone jump, and the passer-by gets up where the player fell. Without this a
player could keep hitting the same rival as soon as they stood up. Their own phone says "new body,
find yourself" and moves its marker.

## The penalty

Every round ends in a penalty moment, as on the rest of changle.ca:

* **Whoever was spotted (tagged) the most takes a sip**; a tie, all of them. **If nobody was
  spotted at all, the whole table drinks** (nobody hunted). `roundPenalty` in `src/engine`.
* It is shown the way the site shows every penalty (`site/src/ui/PenaltyCard.tsx`): the names, the
  word slammed down in Stop Red, how much, a glass that drains, the reason (spotted N times, the
  most), Continue. On the big screen it holds for seven seconds and leaves by itself.
* **The table's own penalty** (set by the host on changle.ca) comes with the game: the host's
  phone sends it when it opens the room. Then the stamp shows that penalty instead of the drink,
  without a glass, and no line or button in the game says drink.
* **The host's switch** in the lobby turns the penalty off for the table (as 到此一游's host
  switches its party forfeits). It is on by default: changle.ca is a party site.

## Where each part lives

| File | What |
| --- | --- |
| `src/client/tokens.css` | changle.ca's tokens, copied from the site. Don't edit here: copy the site's file over it. |
| `src/client/styles.css` | The game's own colours (the gel, the arena and the crowd) at the top, then the frame: room light, top bar, buttons, panels, switches, sheets, the lobby, a round on a phone (upright and sideways), the result, the penalty stamp, the big screen, the flat arena. |
| `src/client/fonts/` | The site's two fonts, subsets copied from `games/been-there` (SIL OFL 1.1, licences beside them). |
| `src/client/ui/chrome.tsx` | Top bar, bilingual title, icon buttons and line icons, the switch, the sheet, the rules. |
| `src/client/ui/Lobby.tsx`, `Play.tsx`, `Controls.tsx`, `Result.tsx`, `Penalty.tsx`, `Menu.tsx` | The phone's screens. |
| `src/client/ui/Tv.tsx` | The big screen. |
| `src/client/ui/Arena.tsx`, `Arena3D.tsx`, `landmarks.ts`, `ArenaFallback.tsx` | The arena: loaded when needed, the 3D scene, the stand-in venue drawn in code, and the flat arena without WebGL. |
| `src/client/spriteAtlas.ts`, `camera.ts`, `renderQuality.ts` | Which picture of a person to draw, the camera's framing, the frame-rate budget. |
| `src/client/i18n.ts` | Every word, in Chinese and English (`tests/strings.test.ts` checks both exist, no em dashes, no curly quotes). |

## The art: where it comes from

| File | Size | What | Where it comes from | Licence |
| --- | --- | --- | --- | --- |
| `plaza-seawall.webp` | 159 KB | Vancouver Seawall Park backdrop, 1536 x 768 | **AI-made**: drawn with ChatGPT's image generation (OpenAI), by Codex for PR #5 | OpenAI's terms assign the output to the user; no third-party art in it |
| `metro-station.webp` | 137 KB | Vancouver Transit Hall backdrop, 1536 x 768 | **AI-made**, the same way | the same |
| `gallery-courtyard.webp` | 218 KB | Courtyard Theatre backdrop, 1536 x 768 | **AI-made**, the same way | the same |
| `thumb-*.webp` | 12 to 17 KB each | The lobby's pictures of the three arenas, 320 x 180 | Cropped from the backdrops above (**AI-made**) | the same |
| `crowd-atlas.webp` | 303 KB | The crowd: three people, four directions, four poses (idle, two steps, punch), one 2400 x 800 sheet | **AI-made**: drawn with ChatGPT's image generation (OpenAI), by Codex for PR #5 | the same |
| `seawall-dressing.glb` | 390 KB | The seawall's 3D set: cedars, benches, railing, lamps, signs | Made from scratch by `tools/blender/generate_arena_dressing.py` (Blender 5.2), no outside models or textures | ours |
| `transit-dressing.glb` | 262 KB | The transit hall's 3D set: carriage, canopy, platform edge | The same script | ours |
| `courtyard-dressing.glb` | 354 KB | The courtyard's 3D set: stage, pavilion, curtains, lanterns | The same script | ours |
| `fonts/unbounded.woff2`, `fonts/figtree.woff2` | 30 KB, 23 KB | Unbounded and Figtree, Latin subsets | Google Fonts, via `games/been-there` | SIL Open Font License 1.1 |

There are no sound files. The code libraries (Preact, three.js, qrcode-generator, all MIT) are
listed with their licences in `dist/client/hide/licences.txt`, which the build writes and the
credits page links to.

The pictures' original PNG and JPEG files (3.6 MB together) are in PR #5's branch; here they are
WebP: the backdrops at quality 80 (870 KB to 513 KB), the sheet at quality 85 with lossless
transparency, its faint haze below the renderer's cut-off cleared and the figures' colours bled
outward so the edges stay clean when it is scaled down (1.85 MB to 303 KB). The art is 1.86 MB in
all (it was 3.63 MB); `tests/arenaAssets.test.ts` holds every file to a budget and checks that each
one is credited here and on the credits page.

**The 3D sets** are rebuilt with Blender 5.2 or newer from the game's folder:
`blender --background --python tools/blender/generate_arena_dressing.py` (it writes the three GLBs,
mesh groups joined per material, meshopt-compressed, and a preview of each under
`dist/blender-previews/`).

**Adding art.** Record where it comes from and its licence (here and in `ui/Credits.tsx`), say
plainly when it is AI-made and by what, leave out anything with someone else's character, logo or
trademark, and keep it within the budgets. Look at it in the real crowd on a phone held sideways.

## Speed on a phone

* **The first download is small.** `app.js` (23 KB gzipped) and a shared chunk (16 KB) draw the
  lobby; three.js and the 3D arena (`Arena3D-*.js`, 174 KB gzipped) are a file of their own, fetched
  while the lobby is up, so a round starts at once. The stylesheet is 11 KB gzipped.
* **A round fetches about 0.7 MB of art**: the sheet of people, one backdrop and one 3D set (only
  the arena being played). The lobby's three pictures are 42 KB.
* **The frame-rate budget** (`renderQuality.ts`) measures every second and lowers the pixel density
  (1.65, 1.35, 1.05) when frames run slow; real-time shadows are off; the crowd is drawn in a few
  instanced batches. `?fps=1` on a room's address shows the meter on a real phone.
* **Without WebGL** (an old phone, a lost GPU context) the flat arena draws the same crowd from
  above with plain elements. `?flat=1` asks for it on purpose (the browser tests use it).
* **The server sends each phone a small frame 20 times a second** (positions rounded to
  hundredths): about 2 KB a frame.

## What a design change has to keep

1. **Nothing marks a player** on the big screen or in any phone's data (above).
2. **A phone never scrolls sideways**, upright (390 x 844) or sideways (844 x 390), every
   button is at least 44 px, and the penalty stamp fits either way (`tests/e2e/phone.spec.ts`).
3. **Nothing leaves the big screen** at 1920 x 1080 and 1280 x 720 (`tests/e2e/tv.spec.ts`).
4. **Night colours only**, from the tokens; the gel carries night-coloured text.
5. **Both languages**, switchable in the menu at any time; no em dashes or curly quotes.
6. **Reduced motion**: the phone's setting or the menu's switch stops the stamp's slam and shake,
   the camera shake and the walk's bounce; the crowd still moves (that is the game).
7. **The penalty follows the table**: the table's own penalty replaces every drink word.
8. **The art stays credited and within budget** (`tests/arenaAssets.test.ts`).

Then run `npm run typecheck`, `npm test` and `npm run test:e2e`. GitHub runs them on every push,
in Chromium and WebKit.
