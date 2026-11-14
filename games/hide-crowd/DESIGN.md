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
| Phone, lobby | The table's code; on an iPhone in Safari, a line about playing full screen (hide Safari's toolbar, or the Home Screen); the arena vote (four rows with a picture of each place); who's here (your chip lit, the host marked); the penalty switch (the host's; a line for everyone else); the big screen (how many watch, or how to open one); Start under the thumb (the host) or "waiting for the host". |
| Phone, a round | Sideways, the only way it's played: the arena fills the screen; a thin bar on top (menu, arena, clock, your score, full screen), the scores down the right, the stick under the left thumb, Punch (big, the gel), Blend in (quiet) and over it Distract (small, its count in a gel dot) under the right. A new round opens on the camera's sweep into the game's view (2.4 s). When the ferry horn, the busker, the gong, the theatre's drill, the night market's firecrackers or its fireworks go, a pill low in the middle says so while the crowd stands still, dances, punches or scatters. In the drill the stage's count comes up big over the back of the crowd (三, 二, 一 in a disc, then 出拳！ in the gel), with a ring round Punch while it counts and a pulse on the call; a word about your own punch takes the count's place. Someone else's distraction turns the camera towards the swing for a moment (1.5 s). Every punch leaves a swoosh, stars circle a stunned head, a tagged player bursts into confetti as they go down, and a run kicks up dust. When the firecrackers land, a ring glows on the floor round each one while its fuse burns (how far its bang knocks people down), and a word says so if one knocks you down. At the night market, a strip low in the middle shows the four snacks: each lights up in its stall's colour once you've tasted it, and a ring fills round the one you're standing at. |
| Phone, held upright | One screen over everything (`ui/Sideways.tsx`): a phone outline turning sideways, "turn your phone sideways", and how to turn off the iPhone's Portrait Orientation Lock (elsewhere: auto-rotate). The room stays connected underneath; turning the phone picks up where it was. A computer's narrow window is left alone (it only applies to touch screens). |
| Phone, the full-screen guide (an iPhone in Safari) | Safari on an iPhone can't make a page full screen (an iPad's can: there the full-screen button does it), so the game shows the two ways round it (`ui/HomeScreen.tsx`): quickest, Safari's page menu (the three lines at the left of the address bar, aA or ··· on older iOS) and Hide Toolbar, which leaves a sliver of address and gives the game the rest; all of the screen, changle.ca on the Home Screen. A little iPhone acts out the four taps to the Home Screen (Share, Add to Home Screen, Open as Web App and Add, the Home Screen with the new icon), two and a half seconds each, and the step it's on lights up beside it; with reduced motion it holds the first scene. It opens by itself once in the first lobby, then from the lobby's line, the menu and the full-screen button. Inside WeChat or another app's browser, a first step says to open the page in Safari. Added from the game, the Home Screen gets changle.ca itself (the site's manifest, icon and name 开席), never the room. |
| Phone, a round in Safari's bars (an iPhone) | When Safari's toolbar and tab bar take part of the screen (held sideways, the page is over 60 points shorter than the screen), a line under the top bar shows the page menu's icon and says to choose Hide Toolbar, with More ways (the guide) and a close button. It goes when the bars do, after 15 s, or for good when closed (Steve, 2026-11-12, from an iPhone in Safari). |
| Phone, joined mid-round | The arena and the scores, and "you're watching this round, you're in the next one". |
| Phone, end of a round | The last blow lands first (1.4 s, in slow motion) and every player's name comes up over the body they were (the winner's in the gel, the winner dancing); when someone won, the camera comes down to them and confetti bursts over them (3.4 s in all), then the penalty stamp (when the host has penalties on; held sideways, the word on the left and the rest beside it), then the result: who won, everyone's tags and how often they were spotted, the round's titles (火眼金睛 Eagle Eye, 隐身大师 Ghost, 误伤专业户 Friendly Fire, 空气拳手 Air Puncher, 人肉沙包 Punching Bag, 夜市吃货 Foodie; yours outlined), the host's Play again and Pick another arena, and Back to the table. Held sideways the titles and the buttons sit beside the table, so Play again is in reach without scrolling. |
| Big screen, lobby | A 1920 x 1080 stage: the title, the four arenas with their vote counts, three lines of how to play, a QR code to the changle.ca table with its code, who's here, the penalty, "waiting for the host", and "click for sound" until someone has clicked (a browser plays nothing before). |
| Big screen, a round | The arena at the screen's own size, and on the stage over it: the arena's name and rule (top left), the clock (top middle, red in the last ten seconds), the scores with a pip per tag (top right), and "nobody is marked" along the bottom (the ferry horn's, the busker's, the gong's, the drill's, the firecrackers' or the fireworks' pill takes its place while it lasts). In the drill, the stage's count big over the back of the crowd; a player's distraction turns the camera towards the swing for a moment. At the night market, "someone tasted all four: +2" for a moment when someone does (not who). |
| Big screen, end of a round | The last blow in slow motion, every player's name over their body and the winner dancing, the camera down to the winner and the confetti, the penalty stamp for seven seconds, then the result card with the round's titles. |
| Phone, the menu (⋯) | Language, sound, music, reduced motion, full screen (on an iPhone: the full-screen guide instead), this device as the big screen, where the art comes from, the way back to the table (in a round too; the host's asks first, since it takes everyone back), and the rules. |
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
  blossom petals, in daylight colours (`--arena-lawn` … `--arena-sea` in the game's block), and the
  night market's parking lot after dark (`--arena-asphalt` … `--stall-3`). It stays
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
  28 x 34 zone where you move faster; the sea beyond the seawall's railing; the warm pools of light
  before the night market's four stalls, each with a painted box round where you can taste
  (`ui/market.ts`). The courtyard's set sits 0.65 further back, so the front of the stage is behind
  the back row, not under it.
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
  every 15 s), at the theatre the drill and the opera gong, taking turns (12 s in, then every 17 s;
  the drill has its own section below). For 2.6 s every passer-by
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
  spotted, the ferry horn, the busker's riff, the gong, the stage's count (three drum beats rising,
  then a deep hit under the whole crowd's swish), ticks in the last five seconds, a whistle to start
  and a little fanfare at the end. A phone plays only its own player's moments (and the horn, the
  busker, the gong, the count, the clock), so a table of phones doesn't become a din; the big screen
  plays the whole room (one whoosh however many punch at once) and a light loop for the place (a
  stroll by the bay, a busy concourse, a woodblock at the theatre), as does a phone in practice. The menu's Sound switch turns it all off (it is remembered, and a phone sent in from a
  table brings the site's own sound setting with it), and its Music switch the loop alone; the game
  plays the same without them. Being spotted also buzzes an Android phone.
* **Titles at the end** (`roundAwards`): each player gets one at most, the first that fits: 火眼金睛
  Eagle Eye (spotted the most), 隐身大师 Ghost (never spotted, never punched a passer-by), 误伤专业户
  Friendly Fire (punched the most passers-by), 空气拳手 Air Puncher (punched the most air, two or
  more), 人肉沙包 Punching Bag (spotted the most, two or more), and at the night market 夜市吃货
  Foodie (tasted the most, three or more; it comes second, after Eagle Eye, whose count leaves out
  the feasts' points). They come only with the result, so nothing during the round tells who did what.
* **Faces.** Every body has two dark eyes now, so the crowd reads where everyone is looking.

## The night market (列治文夜市 Richmond Night Market)

Steve, 2026-11-13: more ways to play, more places, more of the big games' 3D. The fourth arena
borrows the Steam original's side quests (in some of its places, collecting things scores points);
here the collecting gives a player away while they do it:

* **The side quest, 尝遍四样 Taste all four** (`taste` in `src/engine`). Four snack stalls stand behind
  the back row: 烤鱿鱼 grilled squid (red), 咖喱鱼蛋 curry fish balls (teal), 珍珠奶茶 bubble tea
  (purple), 旋风薯塔 tornado potato (amber). A player who stands still (no stick) in front of a stall
  they haven't tasted (4.5 either side of its middle, up to 6 in from the floor's edge: the painted
  box) tastes it after 1.2 s. All four is a feast: 2 points, and the four start over. Every bite lights
  that stall up on every screen (a flash of its colour on its pool of light, sparks off its counter, a
  bell on the big screen), so the others know someone at that stall is a player; only the taster's
  phone knows it was them (`byYou`). A feast also sends up a rocket from the stall.
* **Company at the stalls.** About a third of the passers-by are at a stall at any time (`browse`
  plans: they walk up, stand a few seconds looking it over, and glance about), so a player tasting is
  never alone there. Only a player's bite lights a stall.
* **The crowd's moments: firecrackers and fireworks**, taking turns (the firecrackers first, 10 s in,
  then one or the other every 16 s). The firecrackers have their own section below. For the fireworks
  (2.8 s) five rockets go up from behind the stalls and burst over the back of the crowd, each lighting the whole lot in its colour for a
  moment; every passer-by turns round to watch, a beat after the first, like the horn. With reduced
  motion the bursts open where they are, nothing flies and the light doesn't flicker.
* **The set** (`market-dressing.glb`, from `tools/blender/generate_arena_dressing.py`): four stalls
  with striped awnings, steel counters, trays, a sign with a big lit snack on top of each, bulbs
  along the awnings, string lights on poles, red paper lanterns, folding tables with umbrellas at
  the sides. The game adds the night (`ui/market.ts`): a dusk-blue sky light, a cool light from the
  front and the stalls' warm light from behind, a glow round every bulb and lantern, the pools of
  light and the fireworks. The lot is asphalt with its parking lines worn almost away.
* **On the phone**, the quest strip (four snacks, a ring filling while you taste) and a word when you
  taste one ("bubble tea! 3 to go") or feast ("tasted all four! +2"). Practice rivals browse the stalls
  like everyone and taste like a player, and grow suspicious of whoever stands at a stall as it lights
  up (the fewer there, the surer). The flat arena draws the four stalls along its top, lit when tasted.
* **Sound:** a crunch and a bell for a bite (each stall its own note), the four bells running up for a
  feast, each rocket's whistle, boom and crackle, each firecracker's throw, landing, fizzing fuse and
  bang, and a bright pentatonic loop for the market.
* **Who was who, at the end** (`Room.view`): once a round is over, every screen gets each player's name
  on the body they were (the next round shuffles the crowd again, so it gives nothing away), and the
  winner's body dances. Everyone stops where they are.

## The camera's big moves, and Distract

Steve, 2026-11-13, the second half of "more of the big games' 3D": the camera moves the way a big
game's does at the start and the end of a round, and players get the Steam original's distraction.

* **The opening shot** (`ui/cinema.ts`). A round that has just begun (within 2.5 s of its start:
  a phone that comes in late gets none) opens low across the place, looking at its far side, and
  swings up into the game's view in 2.4 s. The round is already on: the crowd walks and the stick
  works while the camera settles.
* **The winner's shot.** Once a round is over and the last blow has landed in slow motion (1.2 s),
  the camera comes down to the winner, dancing, a little to the side (1.1 s) and drifts slowly round
  them while confetti in the room's colours bursts over their head and flutters down. The names keep
  their size on screen as the camera comes in, the winner's on top. The penalty and the results wait
  for it (`useLanded`: 3.4 s with a winner, 1.4 s without).
* **Distract** (分心, `startDistract` in `src/engine`): twice a round, a player can draw every eye
  elsewhere. A passer-by at least 22 from them throws a punch at nothing (the wind-up, the punch, a
  beat standing), exactly as a player's punch looks, so whoever is watching for punches looks there.
  Only the player who did it hears of it ("someone across the crowd swung at nothing"); no screen
  marks it, and nobody is hit. The phone's button sits over Blend in with its count; on a computer
  it's E, on a gamepad Y. The practice rivals use one a round each and are fooled by a passer-by's
  swing as a person would be.
* With reduced motion the camera doesn't move and no confetti falls.

## The theatre's drill, the glance, and the little effects

Steve, 2026-11-13: the 3D animation and the interaction, compared with the Steam original once more.
What it does that this game didn't, and what this one does now:

* **The drill** (一起出拳, `crowdMoment` and `resolvePunch` in `src/engine`), after the original's
  gym, where the instructor counts and every robot punches. At the courtyard theatre the drill and
  the gong take turns (the drill first, 12 s in, then every 17 s). The stage counts three beats
  (0.6 s apart) and on the fourth, the call, every passer-by throws a punch, nearly together (each up
  to 0.11 s late). A player's punch that lands from a little before the call to a little after it
  (1.35 to 2.45 s into the drill: pressed 0.16 s earlier) is one of the crowd's: it goes through the
  passers-by (no knockdown, no foul, not even a miss) and still tags a rival in reach. So the drill is
  a chance to hit someone while looking like everyone, and whoever doesn't punch stands out.
* **On screen**: the banner says what's coming (台上喊口令：三、二、一，全场一起出拳！), and the count
  comes up big over the back of the crowd, where the stage is: 三, 二, 一 in a disc, then 出拳！ in the
  gel, each beat popping in (a phone counts on its own clock between the room's frames, so the beats
  land on time). Punch gets a ring while the stage counts and pulses from just before the call until a
  press would land too late. On the call the camera takes a small kick, as for a blow.
* **The glance** (`glance` in the room's view, `cinema.glance`): someone's distraction now does what
  the original's does, it pulls the camera away. Every screen but the distracter's turns part of the
  way towards the passer-by's swing and moves in a little (0.4 s there, a moment's hold, 0.6 s back,
  1.5 s in all), the big screen too. Nothing says whose it was.
* **The little effects** (`ui/effects.ts`, one draw each): every punch leaves a swoosh, a crescent
  ahead of the fist with a bright core and dark edges, so it reads on the theatre's pale stone and
  the night market's asphalt alike, drawn over the bodies for the quarter second it lasts; a
  passer-by's punch leaves the same, so a swoosh gives nobody away. Three stars circle the head of
  anyone stunned (a tagged body, a passer-by knocked down, a puncher who hit one), following the head
  as it falls and gets up. A run (a passer-by's, or a player at full speed) kicks up soft puffs of
  dust behind it.
* **Words go when they should.** A phone's word about its own punch ("missed", "new body, find
  yourself") and the big screen's feast line now leave after their time; before, the next frame
  stopped their timer, so a word stayed until another replaced it.
* **Sound**: the count is three drum beats, each a little higher, then a deep hit with the whole
  crowd's swish, in time with the screen even for a screen that came in late.
* **Practice**: the rivals punch on the call with everyone (at whoever they suspect, if they're in
  reach, the punch going through the passers-by), and grow suspicious of a body that stands through
  the call as of one that punches at the wrong time; a punch during the count still gives a body
  away. Played out on the fake clock, a player who stands through every drill is spotted six times
  in ten rounds, one who punches with the crowd once (`tests/practice.test.ts`).
* With reduced motion: no glance, no kick, no swooshes and no dust (all of them move or fly); the
  count and the cue come up without popping or pulsing, and the stars hold still round the head.

## The night market's firecrackers, and the tag's confetti

Steve, 2026-11-13 (继续, "go on"): the 3D animation and the interaction, after the Steam original once
more. Its arenas throw things at the crowd (bombs that fall among the people and knock down whoever
is near), so a player has to react the way a passer-by would; and a hit player goes out with a burst.
What this game does now:

* **The firecrackers** (鞭炮, `throwCrackers`, `crackerFlight` and `blast` in `src/engine`). At the
  night market they take turns with the fireworks (the firecrackers first, 10 s in, then every 16 s).
  Someone behind the stalls throws five firecrackers into the crowd, one after another (the first
  lands 0.65 s in, the rest 0.23 s apart, each after 0.55 s in the air). Each is aimed at someone, a
  passer-by or a player, where they'll be when it lands, the five at least 14 apart; it fizzes on the
  asphalt for 1.5 s and bangs.
  Everyone on their feet within 6.5 of the bang goes down, thrown away from it and stunned as long as
  a tagged body; the fall stops their punch and their blending in. Where the five land is the round's
  dice, so every screen sees the same five. Knocked down by a firecracker is not a tag (no point to
  anyone).
* **The crowd gets clear.** A passer-by near a fizzing firecracker runs from it a beat after it lands
  (at a run's pace, sliding along a wall rather than into it); one in seven freezes a moment too long,
  so about one passer-by goes down each time. Those a little further off (within 15) stop and stare
  at it; the rest walk on. So a player has
  to get clear too: one who stands at a firecracker is knocked down for all to see, and their phone
  says so ("Knocked over by a firecracker. Everyone saw!"). Only the player knocked down hears of it
  (`onYou` on the room's `blast` event; nobody else's phone, and no screen, says who fell).
* **On screen** (`ui/crackers.ts`): the pill (有人扔鞭炮：快躲开！ Firecrackers! Get clear!); each
  firecracker, a red tube with a gold band, tumbles in on an arc and lands; a ring on the floor the
  size of its bang glows fuller as the fuse burns down, sparks spitting off the fuse; then the bang: a
  flash, a ring of shock going out, sparks, a cloud of smoke, red paper flying up and fluttering down
  to lie on the asphalt a while, and the camera jolts. The flat arena (no WebGL) draws each landed
  firecracker as a ring with a red dot that flashes on its bang.
* **Sound**: for each firecracker a whoosh as it's thrown, a tick as it lands, the fuse's fizz, then
  the bang: a deep thump, a crack and a string of pops. The music ducks under them. A phone plays them
  too (they're the place's, like the horn).
* **Practice**: the rivals grow suspicious of every body a firecracker knocks down, as of one that
  stands through the drill (a passer-by who froze too long looks the same).
* **The tag's confetti** (`cinema.pop`): a tagged player, as they go down, bursts into confetti in
  the room's colours, out and up from the chest, raining round the body as it falls, on every screen.
  It gives nothing away: the scores already say a tag landed, and the player gets up in another body.
* With reduced motion: a firecracker doesn't fly (it is there once it has landed) and its ring holds
  still; no flash, shock, sparks, smoke or jolt; the red paper lies on the floor; no confetti.
* The browser tests now close every phone and screen they open (`tests/e2e/helpers.ts`), so one test
  doesn't slow the next on a busy machine.

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
| `src/client/ui/market.ts`, `src/client/fireworks.ts`, `src/client/ui/crackers.ts`, `src/client/ui/cinema.ts`, `src/client/ui/effects.ts` | The night market's lights, pools and fireworks (with the fireworks' timing, shared with the sound); its firecrackers (the throw, the ring, the fuse, the bang, the red paper); the camera's opening sweep, the glance at a distraction, the winner's shot, the confetti for the winner and for a tag; the punches' swooshes, the dizzy stars, the dust and the bangs' smoke. |
| `src/client/people.ts`, `camera.ts`, `renderQuality.ts` | The people (their looks, their clips and how they blend), the camera's framing (`frameFloor`), the frame-rate budget. |
| `tools/blender/` | The scripts that build the 3D sets and the people's files. |
| `src/client/ui/Sideways.tsx`, `ui/HomeScreen.tsx`, `device.ts` | The turn-sideways screen, the iPhone's full-screen guide and its line in a round, and what kind of phone this is. |
| `src/client/i18n.ts` | Every word, in Chinese and English (`tests/strings.test.ts` checks both exist, no em dashes, no curly quotes). |

## The art: where it comes from

| File | Size | What | Where it comes from | Licence |
| --- | --- | --- | --- | --- |
| `thumb-*.webp` | 12 to 17 KB each | The lobby's pictures of the four arenas, 320 x 180 | The seawall's, the transit hall's and the theatre's are **AI-made**: cropped from three panoramas drawn with ChatGPT's image generation (OpenAI), by Codex for PR #5 (the panoramas themselves were dropped on 2026-11-11: the arena doesn't draw them). The night market's (`thumb-market.webp`) is a picture of the game itself, taken in a browser | OpenAI's terms assign the output to the user; no third-party art in it. The market's is ours |
| `crowd-people.glb` | 201 KB | The crowd's man: his body on a 23-bone skeleton, the hair, caps, bags and eyes, and the eleven clips everyone moves with (three ways of standing, two walks, a jog, a punch, a fall, a get-up, a recoil, a dance) | Quaternius's Universal Animation Library 1 and 2 (the mannequin and the clips), rebuilt by `tools/blender/build_crowd_people.py`; the hair, caps and bags made from scratch in the same script | CC0 1.0 (public domain); the gear ours |
| `crowd-people-f.glb` | 96 KB | The crowd's woman: her body, her hair, caps, bags and eyes | Quaternius's Universal Animation Library 2 (the female mannequin), the same script | CC0 1.0; the gear ours |
| `seawall-dressing.glb` | 390 KB | The seawall's 3D set: cedars, benches, railing, lamps, signs | Made from scratch by `tools/blender/generate_arena_dressing.py` (Blender 5.2), no outside models or textures | ours |
| `transit-dressing.glb` | 262 KB | The transit hall's 3D set: carriage, canopy, platform edge | The same script | ours |
| `courtyard-dressing.glb` | 354 KB | The courtyard's 3D set: stage, pavilion, curtains, lanterns | The same script | ours |
| `market-dressing.glb` | 100 KB | The night market's 3D set: four stalls and their snacks, string lights, lanterns, tables | The same script (as the `bpy` module, which can't compress meshes: glTF-Transform's meshopt does, through npx) | ours |
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
   the camera's shake, kicks, sweeps and glances, the walk's bounce, the swooshes and the dust, the
   firecrackers' flight, flash, smoke and jolt, and the confetti, holds the dizzy stars, the turn screen's phone and the guide's little iPhone still, and brings the
   drill's count up without a pop; the crowd still moves (that is the game).
9. **The penalty follows the table**: the table's own penalty replaces every drink word.
10. **The art stays credited and within budget** (`tests/arenaAssets.test.ts`).

Then run `npm run typecheck`, `npm test` and `npm run test:e2e`. GitHub runs them on every push,
in Chromium and WebKit.
