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
* **The arenas and the crowd keep their own art** (below): three bright daytime places and a crowd
  of real 3D people in six looks, inside the night frame. Their colours are not the site's; they are
  listed as the game's own art colours (`--arena-*` and `--look-*` at the top of `styles.css`, the
  looks' full outfits in `src/client/people.ts`), as the design rules allow for a game's props.

## Screens

| Screen | What it shows |
| --- | --- |
| Phone, lobby | The table's code; on an iPhone in Safari, a line about adding changle.ca to the Home Screen; the arena vote (three rows with a picture of each place); who's here (your chip lit, the host marked); the penalty switch (the host's; a line for everyone else); the big screen (how many watch, or how to open one); Start under the thumb (the host) or "waiting for the host". |
| Phone, a round | Sideways, the only way it's played: the arena fills the screen; a thin bar on top (menu, arena, clock, your score, full screen), the scores down the right, the stick under the left thumb, Punch (big, the gel) and Blend in (quiet) under the right. When the ferry horn, the busker or the gong sounds, a pill low in the middle says so while the crowd stands still or dances. |
| Phone, held upright | One screen over everything (`ui/Sideways.tsx`): a phone outline turning sideways, "turn your phone sideways", and how to turn off the iPhone's Portrait Orientation Lock (elsewhere: auto-rotate). The room stays connected underneath; turning the phone picks up where it was. A computer's narrow window is left alone (it only applies to touch screens). |
| Phone, the Home Screen guide (an iPhone in Safari) | Safari on an iPhone can't make a page full screen, so the game shows how to put changle.ca on the Home Screen (`ui/HomeScreen.tsx`): once by itself in the first lobby, then from the lobby's line, the menu and the full-screen button. A little iPhone acts out the four taps (Share, Add to Home Screen, Open as Web App and Add, the Home Screen with the new icon), two and a half seconds each, and the step it's on lights up beside it; with reduced motion it holds the first scene. Inside WeChat or another app's browser, a first step says to open the page in Safari. Added from the game, the Home Screen gets changle.ca itself (the site's manifest, icon and name 开席), never the room. |
| Phone, joined mid-round | The arena and the scores, and "you're watching this round, you're in the next one". |
| Phone, end of a round | The last blow lands first (1.4 s, in slow motion) and every player's name comes up over the body they were (the winner's in the gel, the winner dancing), then the penalty stamp (when the host has penalties on; held sideways, the word on the left and the rest beside it), then the result: who won, everyone's tags and how often they were spotted, the round's titles (火眼金睛 Eagle Eye, 隐身大师 Ghost, 误伤专业户 Friendly Fire, 空气拳手 Air Puncher, 人肉沙包 Punching Bag; yours outlined), the host's Play again and Pick another arena, and Back to the table. Held sideways the titles and the buttons sit beside the table, so Play again is in reach without scrolling. |
| Big screen, lobby | A 1920 x 1080 stage: the title, the three arenas with their vote counts, three lines of how to play, a QR code to the changle.ca table with its code, who's here, the penalty, "waiting for the host", and "click for sound" until someone has clicked (a browser plays nothing before). |
| Big screen, a round | The arena at the screen's own size, and on the stage over it: the arena's name and rule (top left), the clock (top middle, red in the last ten seconds), the scores with a pip per tag (top right), and "nobody is marked" along the bottom (the ferry horn's, the busker's or the gong's pill takes its place while it lasts). |
| Big screen, end of a round | The last blow in slow motion, every player's name over their body and the winner dancing, the penalty stamp for seven seconds, then the result card with the round's titles. |
| Phone, the menu (⋯) | Language, sound, music, reduced motion, full screen (on an iPhone: the Home Screen guide instead), this device as the big screen, where the art comes from, the way back to the table (in a round too; the host's asks first, since it takes everyone back), and the rules. |
| Practice (`/hide/practice`) | One phone against three computer rivals hidden in the crowd (`src/client/practice.ts`): the game card's one-phone button. No penalty. |
| Credits (`/hide/credits`, and the menu) | Where every picture and model comes from. |

The big screen is laid out on a 1920 x 1080 stage scaled to the screen (`Stage` in `ui/Tv.tsx`),
so a 720p TV shows exactly the same picture, smaller; its type is half as large again as the
phone's (`html.is-tv`), to read from across a room. The arena underneath is drawn at the screen's
own size, not scaled. `tests/e2e/tv.spec.ts` checks that nothing leaves the screen at 1920 x 1080
and 1280 x 720.

## The arena: floor, camera, the rules' marks

How a round looks in 3D (`ui/Arena3D.tsx`, `camera.ts`). Steve's report of 2026-11-04 (half the
screen empty and out of reach, a blurry background, a double tap that zoomed) was fixed on 2026-11-11:

* **A real floor, always.** The floor is drawn by the game's code on a canvas: the seawall's mown
  lawn, the transit hall's stone tiles with terracotta lines, the courtyard's flagstones with a few
  blossom petals, in daylight colours (`--arena-lawn` … `--arena-sea` in the game's block). It stays
  when the Blender set arrives (the sets have no floor of their own) and reaches past every edge of
  the screen. Until 2026-11-11 the set's arrival removed the stand-in venue floor and all, and the crowd
  walked on the backdrop.
* **No stretched backdrop.** The three AI pictures (1536 x 768) used to be wrapped round the scene as a
  360° panorama: about six times their size on a phone, so blurry, and their painted lawn looked like
  floor that nobody could reach. The arena doesn't draw them any more; the lobby's thumbnails are crops
  of them.
* **The camera frames the floor** (`frameFloor` in `camera.ts`): a fixed tilt (50°) and field of view
  (24°), moved back just as far as it needs so the front row's feet sit on the bottom margin, everyone
  is inside the sides, and the back row's "you" marker is under the top bar; whatever room is left goes
  to the top, where the far side of the place shows (the railing and the sea, the train, the stage).
  The rules' 100 x 58 floor is drawn at the same scale both ways (0.175 a unit), so a step looks as long
  across as it does deep. Phones and big screens have their own margins (the big screen's overlays).
  `tests/camera.test.ts` checks it at phone and TV shapes.
* **The rules' marks are always drawn**, whichever set is up: the transit hall's moving walkways under
  the whole crowd, sliding the way the room carries everyone; the courtyard's spotlight over the rules'
  28 x 34 zone where you move faster; the sea beyond the seawall's railing. The courtyard's set sits
  0.65 further back, so the front of the stage is behind the back row, not under it.
* **Sharp on a phone.** The frame-rate budget starts at up to 2.25 times the screen's pixels (it was
  1.65, which drew the 3D view soft on a phone whose screen has 3), then lowers it if frames run slow.

## The people

Steve's report of 2026-11-04 also said the people moved crudely ("粗糙"): they were a sheet of flat
pictures, four directions and four poses, that swapped as they walked. Since 2026-11-12 they are 3D
bodies on a skeleton (`src/client/people.ts`), moved the way big animated games move theirs:

* **Two bodies, six looks.** A man's and a woman's (Quaternius's CC0 mannequins, rebuilt for the game
  by `tools/blender/build_crowd_people.py`: fingers merged, about 2,600 faces each, 23 bones). Each
  face knows which part of the clothes it is, and each look paints the parts from a 16-colour strip:
  skin, top, sleeves, trousers or shorts, shoes, hair, a bag. Hair (short, a bun, a ponytail, a cap),
  backpacks, satchels and the eyes are simple shapes made in the same script, on the head's and the
  back's bones; the game skins each look's parts into its body when the file loads, so a person is
  one draw (`tests/people.test.ts` checks every part still sits where it did on its bone). A person is drawn 2.15 units tall with a head a fifth bigger than life, so the crowd reads
  from above on a phone; tops are bright enough to tell apart on the darkest floor (the transit
  hall's walkways). The flat arena's `--look-*` colours are the looks' tops (`tests/people.test.ts`
  checks).
* **Clips blended by what the body does.** Standing (three ways: arms down, arms folded, on the
  phone), walking (two ways), a slow jog at a player's top speed, all on one stride clock that
  follows the body's real speed, so planted feet keep still at the crowd's pace (the test walks a
  body and measures it). A body leans into a start and into its turns, and a glancing body (a player
  blending in, a passer-by looking around) turns its head. When the busker plays, anyone standing
  still dances (each a little out of step with the others), and so does the winner at the end.
* **The moments that matter.** A punch's fist is out when the rules land it (the clip is timed to
  the wind-up); a tagged body turns to the blow, is knocked off its feet and is up again by the time
  the rules let go (1.15 s, then they slip into the crowd); a puncher who hit a passer-by recoils
  without falling. Every one-off move crossfades in and out over the legs, never snaps.
* **The same for everyone.** Every body is made and moved the same way whoever steers it: what gives
  a player away is what they do. With reduced motion the bodies still walk (that's how the crowd moves),
  but nobody leans, and the camera doesn't shake.

Until the people's file arrives (it is fetched with the arena's code, while the lobby is up) the
crowd is simple stand-ins in each look's colours, and the flat arena (no WebGL) draws them as before.

## The crowd and the feel (after the Steam original)

Steve, 2026-11-12: polish the details the way the Steam party game this one was modelled on does
them (PR #5 studied its trailer). What makes that game work, and what this one does now:

* **Passers-by who move like people** (`crowdStep` and `nextPlan` in `src/engine`). Each has a plan:
  walk somewhere at its own pace (three kinds of people, from strollers to the ones in a hurry), stand
  a while (looking around, or at whoever is closest, as if chatting), tag along behind someone walking
  by (never a queue), and now and then break into a run as fast as a player. They ease into their
  stops and turn gently. Every plan rolls the passer-by's own dice from the round's seed, so a round
  always plays the same (the tests replay one). The old crowd walked one 6.8 s beat in square turns.
  Because passers-by run too, running alone no longer gives a player away; what does is running at
  the wrong moment, punching, and ignoring the crowd's moments.
* **Moments the whole crowd reacts to** (`crowdMoment`): by the seawall the ferry horn (9 s in, then
  every 15 s), at the theatre the opera gong (12 s in, then every 17 s). For 2.6 s every passer-by
  stops and turns to the sea or the stage, each a beat after the sound (0.1 to 0.6 s: people don't
  all turn at once). Players aren't made to stop: that's the test. A light nudge up turns a player to
  the sea or the stage too. In the transit hall a busker strikes up (8.8 s in, then every 18 s, always
  while the walkways rest) and for 2.7 s everyone standing still dances on the spot: players too, so
  the way to blend in is to stop; whoever walks on stands out. The computer rivals in practice stop
  and turn with the crowd (a beat after the sound, like everyone), and grow suspicious of anyone who doesn't;
  running makes them suspicious only when it goes on longer than a passer-by's run (1.8 s). An
  idle player's practice round lasts about 50 s, as before (`tests/practice.test.ts` plays it out).
* **A knockdown draws looks** (`commotionFor`): anyone knocked down, a player or a passer-by, makes
  the passers-by within 15 units stop and turn to stare for a second or two, each a beat after the
  fall. It's what people do, and a player walking past a fall without a glance is one more thing to
  notice. The rivals in practice stare too.
* **A punch that lands, felt** (`ui/Arena3D.tsx`, `people.ts`): a beat of stillness (a hit-stop, 95 ms
  for a tag), the camera's kick toward the floor, sparks where the blow lands, the body turning to the
  blow and flying off its feet, dust where its back hits the floor, then up again. A passer-by who is
  punched by mistake goes down too, so everyone sees the mistake (the puncher recoils, stunned). The
  round's last blow plays in slow motion before the results cover it. With reduced motion: none of the
  stillness, kicks, sparks, dust or slow motion.
* **Sound** (`src/client/sound.ts`, all made in the page, no files): a whoosh for a punch, a cartoon
  bonk when it lands, a thud on the floor, a sheepish two notes for a foul, a slide when you're
  spotted, the ferry horn, the busker's riff, the gong, ticks in the last five seconds, a whistle to
  start and a little fanfare at the end. A phone plays only its own player's moments (and the horn,
  the busker, the gong, the clock),
  so a table of phones doesn't become a din; the big screen plays the whole room and a light loop for
  the place (a stroll by the bay, a busy concourse, a woodblock at the theatre), as does a phone in
  practice. The menu's Sound switch turns it all off (it is remembered, and a phone sent in from a
  table brings the site's own sound setting with it), and its Music switch the loop alone; the game
  plays the same without them. Being spotted also buzzes an Android phone.
* **Titles at the end** (`roundAwards`): each player gets one at most, the first that fits: 火眼金睛
  Eagle Eye (spotted the most), 隐身大师 Ghost (never spotted, never punched a passer-by), 误伤专业户
  Friendly Fire (punched the most passers-by), 空气拳手 Air Puncher (punched the most air, two or
  more), 人肉沙包 Punching Bag (spotted the most, two or more). They come only with the result, so
  nothing during the round tells who did what.
* **Faces.** Every body has two dark eyes now, so the crowd reads where everyone is looking.
* **Who was who, at the end** (`Room.view`): once a round is over, every screen gets each player's name
  on the body they were (the next round shuffles the crowd again, so it gives nothing away), and the
  winner's body dances. Everyone stops where they are.

## Nobody is marked

The game is about not being found, so nothing a screen is sent may tell a player from a
passer-by (`Room.view` in `src/room/room.ts`, tested in `tests/room.test.ts` and
`tests/e2e/tv.spec.ts`):

* Every body is sent the same fields (position, facing, speed, pose) and nothing else: no ids, no
  names, no "player" or "passer-by", no top speed. Only once the round is over does each player's
  body get a name (and the winner's a mark): the next round shuffles the crowd again.
* The crowd's order is shuffled when a round starts (`createMatch`). Every screen draws by that
  order (each place keeps one of the six looks), so players are spread among the looks and the
  places in the list like everyone else.
* A phone's own body is marked (`me`) on that phone only; the big screen gets no `me` at all.
* What gives a player away is what they do: punching, being knocked down, walking on through the
  ferry horn or the busker's dance, running on and on, walking past a fall without a look. That is
  the game.

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
| `src/client/ui/Arena.tsx`, `Arena3D.tsx`, `landmarks.ts`, `ArenaFallback.tsx` | The arena: loaded when needed, the 3D scene (its floor, the rules' marks, the Blender set), the stand-in venue drawn in code until the set arrives, and the flat arena without WebGL. |
| `src/client/people.ts`, `camera.ts`, `renderQuality.ts` | The people (their looks, their clips and how they blend), the camera's framing (`frameFloor`), the frame-rate budget. |
| `tools/blender/` | The scripts that build the 3D sets and the people's files. |
| `src/client/ui/Sideways.tsx`, `ui/HomeScreen.tsx`, `device.ts` | The turn-sideways screen, the iPhone's Home Screen guide, and what kind of phone this is. |
| `src/client/i18n.ts` | Every word, in Chinese and English (`tests/strings.test.ts` checks both exist, no em dashes, no curly quotes). |

## The art: where it comes from

| File | Size | What | Where it comes from | Licence |
| --- | --- | --- | --- | --- |
| `thumb-*.webp` | 12 to 17 KB each | The lobby's pictures of the three arenas, 320 x 180 | **AI-made**: cropped from three panoramas drawn with ChatGPT's image generation (OpenAI), by Codex for PR #5 (the panoramas themselves were dropped on 2026-11-11: the arena doesn't draw them) | OpenAI's terms assign the output to the user; no third-party art in it |
| `crowd-people.glb` | 201 KB | The crowd's man: his body on a 23-bone skeleton, the hair, caps, bags and eyes, and the eleven clips everyone moves with (three ways of standing, two walks, a jog, a punch, a fall, a get-up, a recoil, a dance) | Quaternius's Universal Animation Library 1 and 2 (the mannequin and the clips), rebuilt by `tools/blender/build_crowd_people.py`; the hair, caps and bags made from scratch in the same script | CC0 1.0 (public domain); the gear ours |
| `crowd-people-f.glb` | 96 KB | The crowd's woman: her body, her hair, caps, bags and eyes | Quaternius's Universal Animation Library 2 (the female mannequin), the same script | CC0 1.0; the gear ours |
| `seawall-dressing.glb` | 390 KB | The seawall's 3D set: cedars, benches, railing, lamps, signs | Made from scratch by `tools/blender/generate_arena_dressing.py` (Blender 5.2), no outside models or textures | ours |
| `transit-dressing.glb` | 262 KB | The transit hall's 3D set: carriage, canopy, platform edge | The same script | ours |
| `courtyard-dressing.glb` | 354 KB | The courtyard's 3D set: stage, pavilion, curtains, lanterns | The same script | ours |
| `fonts/unbounded.woff2`, `fonts/figtree.woff2` | 30 KB, 23 KB | Unbounded and Figtree, Latin subsets | Google Fonts, via `games/been-there` | SIL Open Font License 1.1 |

The floors, the walkways, the spotlight and the sea are drawn by the game's own code. There are no
sound files: every sound is made in the page (`src/client/sound.ts`). The code libraries (Preact, three.js, qrcode-generator, all MIT) are
listed with their licences in `dist/client/hide/licences.txt`, which the build writes and the
credits page links to.

The thumbnails' original files are in PR #5's branch (with the AI-drawn sheet of people the crowd
used until 2026-11-12). `tests/arenaAssets.test.ts` holds every file to a budget and checks that each
one is credited here and on the credits page.

**The 3D sets** are rebuilt with Blender 5.2 or newer from the game's folder:
`blender --background --python tools/blender/generate_arena_dressing.py` (it writes the three GLBs,
mesh groups joined per material, meshopt-compressed, and a preview of each under
`dist/blender-previews/`).

**The people** are rebuilt the same way from Quaternius's two packs (free, CC0; where to get them and
the command are at the top of `tools/blender/build_crowd_people.py`). The script picks and trims the
clips, thins the bodies, paints the parts, makes the gear, and writes both files small: turns as
16-bit numbers, normals as 8-bit (`KHR_mesh_quantization`, which three.js reads). After a rebuild,
`npm test` checks the clips, the walk's feet, the punch, the fall and the recoil.

**Adding art.** Record where it comes from and its licence (here and in `ui/Credits.tsx`), say
plainly when it is AI-made and by what, leave out anything with someone else's character, logo or
trademark, and keep it within the budgets. Look at it in the real crowd on a phone held sideways.

## Speed on a phone

* **The first download is small.** `app.js` (28 KB gzipped) and a shared chunk (19 KB) draw the
  lobby; three.js and the 3D arena (`Arena3D-*.js`, 182 KB gzipped) are a file of their own, fetched
  while the lobby is up with the people's two files (297 KB, 128 KB gzipped), so a round starts at
  once. The stylesheet is 14 KB gzipped.
* **A round fetches about 0.6 MB of art**: the people (once) and one 3D set (only the arena being
  played); the floor is drawn on the phone. The lobby's three pictures are 42 KB.
* **The frame-rate budget** (`renderQuality.ts`) measures every second and lowers the pixel density
  (2.25, 1.6, 1.15) when frames run slow; real-time shadows are off. Each person is one skinned body
  (about 2,600 faces, 23 bones, skinned on the graphics chip) with their hair, bag and eyes in it: one
  draw each, so a whole round is 33 to 47 draws (it was 101 to 115). `?fps=1` on a room's address shows
  the meter on a real phone: frames a second, frame times, the quality, the draws, and how long the
  page itself takes a frame (moving everyone and handing the picture over; the rest is the graphics
  chip's).
* **Without WebGL** (an old phone, a lost GPU context) the flat arena draws the same crowd from
  above with plain elements. `?flat=1` asks for it on purpose (the browser tests use it).
* **The server sends each phone a small frame 20 times a second** (positions rounded to
  hundredths): about 2 KB a frame.

## What a design change has to keep

1. **Nothing marks a player** on the big screen or in any phone's data (above).
2. **It's played sideways** (844 x 390): nothing scrolls sideways, every button is at least 44 px, the
   penalty stamp fits; held upright, the turn screen covers it and the round carries on underneath
   (`tests/e2e/phone.spec.ts`).
3. **Thumbs never zoom.** In a round the arena and the controls are `touch-action: none` and a touch
   on the controls is kept from the browser; a button waiting for its move stays a live target
   (`aria-disabled`, not `disabled`), so a quick second tap lands on it instead of falling through as a
   double tap; Safari's pinch is off during a round.
4. **The floor fills the screen** and stays under the Blender set; the rules' marks are drawn whatever
   set is up (above).
5. **Nothing leaves the big screen** at 1920 x 1080 and 1280 x 720 (`tests/e2e/tv.spec.ts`).
6. **Night colours only**, from the tokens; the gel carries night-coloured text.
7. **Both languages**, switchable in the menu at any time; no em dashes or curly quotes.
8. **Reduced motion**: the phone's setting or the menu's switch stops the stamp's slam and shake,
   the camera shake and the walk's bounce, and holds the turn screen's phone and the guide's little
   iPhone still; the crowd still moves (that is the game).
9. **The penalty follows the table**: the table's own penalty replaces every drink word.
10. **The art stays credited and within budget** (`tests/arenaAssets.test.ts`).

Then run `npm run typecheck`, `npm test` and `npm run test:e2e`. GitHub runs them on every push,
in Chromium and WebKit.
