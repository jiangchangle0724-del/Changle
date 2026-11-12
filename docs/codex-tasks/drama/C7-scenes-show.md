# drama-C7: a set of its own for each show scene

戏精大赏 (Drama Queens) shows a painted set behind the actors. Today every scene borrows its kind's
picture (`kind-show.webp`...) or its community's (`group-sa.webp`...), so a magic show and a karaoke
birthday both play in front of the same TV talk-show studio. Cards C2 to C7 give each of the 131
scenes a set of its own, so the room knows the story the moment the curtain opens. This card draws
the 22 show scenes.

Before you start: the game has to ask for a scene's own picture first (`scene-<id>`, then its
community's, then its kind's), and the picture test has to accept `scene-` names. If `Backdrop` in
`site/src/party/drama/parts.tsx` or that test doesn't yet, stop and say so: that change isn't part
of this card.

## Files

- Add `site/public/drama/scene-<id>.webp` for each of the 22 scenes below (the first column is the
  file name).
- Add each name, `scene-<id>` without `.webp`, to `DRAWN_ART` in `site/src/data/dramaArt.ts`, in the
  table's order (the game only asks for the names listed there, so a picture you haven't drawn yet
  never shows as a broken image).
- Nothing else.

## Every picture

- 1600 × 900, WebP, at most 150 KB (lighter than the first set: there will be 131 of these).
- The same painted look as the first set: open `kind-show.webp`, `stage.webp` and `kind-love.webp`
  first, and the community pictures (`group-*.webp`). Warm theatrical light, rich colour, soft
  painted detail, seen straight on like a stage set.
- An empty set: no people, no faces (none in portraits, photos, mirrors or reflections either), no
  animals as the subject. A scene about a pet or a person shows its place and their things instead:
  an empty cricket cage, a top hat on a magic table. Audience seats stay empty.
- The game stands its own figures and their name plaques along the bottom third, so keep that third
  simple and darker (a floor, a carpet, grass, a path) and put the interest in the middle and the top.
- Show the scene's place and the props its setup mentions, so the room recognises the story at a
  glance. Never give away who did it or the twist: paint what the table says and add no clues of
  your own.
- Spicy scenes stay tasteful: romance and scandal show only through objects (a ring box, a lipstick
  mark on a cup, an empty champagne flute).
- No words, letters or numbers anywhere: signs, screens, scoreboards, cue boards, banners,
  envelopes, sheet music and maps stay blank, show plain colour or face away. No logos or brands, no
  flags (not even at a song-contest party), no famous landmark you could name, no religious symbol
  as the focus. A real brand or place in a setup becomes a generic one (a warehouse store, a ski
  village, an elevated train car, a night market).
- Everyday and warm: the way people from there would recognise a home, a festival or a park of their
  own, not a tourist poster. Nothing that makes fun of anyone.
- Night colours: the site is dark. No big areas of white or pale sky; screens glow in deep colour,
  and a daytime scene is lit low and warm (late sun, lamps on, rain on the window).
- Each set looks clearly different from the others on this card, from the first set and from the
  community pictures: another place, palette or time of day. Where scenes share a kind of place
  (six livestreams, five stages, two karaoke nights, two dating shows), the table gives each its own
  room, palette or light; keep them apart.

## The pictures

| File | What it shows |
| --- | --- |
| `scene-show-livestream-sales.webp` | A livestream shopping studio at night, ring lights on a hot pink and orange set: a cooktop counter with a non-stick pan where a fried egg is stuck and smoking, stacks of product boxes (no print), a phone on a tripod with a blank glowing screen, and spatulas in a jar. Plain dark floor below; a live disaster. |
| `scene-show-talent-mute.webp` | A talent-show stage at the final rehearsal, house lights low and gold: a golden microphone on a stand in a single spotlight, confetti cannons at the wings, a sound desk of sliders at one side, and rows of empty red seats rising at the other. Plain dark stage floor below; about to go viral for the wrong reason. |
| `scene-show-cooking-score.webp` | A TV cooking-competition set, steel cooking stations under warm studio lights: a judges' table where a single glass of water sits on a silver platter under a spotlight, elaborate dishes beside it, a blank scoreboard, and pans hanging above. Plain dark floor below; baffled. |
| `scene-show-pet-finalist.webp` | A pet-show livestream set in deep teal and gold, a little winners' podium under ring lights: a fluffy slipper on a velvet cushion on the top step, a rosette (no writing), a small gold trophy, pet beds and squeaky toys, and a phone on a tripod with a blank screen. Plain dark floor below; adorably absurd. |
| `scene-show-reunion-cue.webp` | A dating-show reunion studio in rose and violet light under a big heart-shaped neon: a curved sofa with four seats, cue boards on stands (blank), an empty chair spotlit apart for the absent ex, and a box of tissues on a side table. Plain dark floor below; melodrama. |
| `scene-show-secret-sponsor.webp` | A bare living-room livestream set at night in grey-blue, one ring light: a single chair facing a phone on a tripod (blank screen), a box of tissues and a glass of water on a stool, and a big sponsor's gift box with a bow (no logo) waiting on a side table. Plain dark floor below; solemn, oddly commercial. |
| `scene-show-awards-envelope.webp` | A gala awards night in a black and gold ballroom: a stage with a lectern and four gold envelopes on a silver tray, a row of gleaming statuettes, a red carpet running up the steps, and round tables in the dark. Plain dark floor below; glamorous and greedy. |
| `scene-show-final-night-texts.webp` | A dating-show villa garden on the last night, a pool lit turquoise with floating candles: a fire pit ringed with lounge chairs, a basket of phones lying face down on a low table, rose petals, and glasses of wine. Plain dark terrace below; tense romance. |
| `scene-show-rehearsal-leak.webp` | A rehearsal room at night, warm work lights and a wall of mirrors that reflect only the empty room: a piano, two microphone stands side by side, a music stand with blank sheets, and a ballet barre. Plain dark wood floor below; a secret duet. |
| `scene-show-charity-stream.webp` | A streamers' room after a charity stream, lit green and purple by gaming LED strips: two gaming chairs and two microphones on arms, a wide monitor glowing blank, a heart-shaped charity jar on the desk, and a pile of plush prizes. Plain dark floor below; the glow fading, suspicion rising. |
| `scene-show-ktv-perfect-score.webp` | A karaoke bar's contest stage in electric blue and silver under a mirror ball: a scoring machine with a blank glowing display, a glittering trophy on a stool, a microphone in a stand under the spotlight, and tables of drinks at the side. Plain dark floor below; a triumph that sounds awful. |
| `scene-show-magic-rabbit.webp` | A small theatre's magic-show stage, plum velvet curtains and one spotlight: a top hat on a draped magic table with a wand beside it, an empty rabbit hutch with its little door open in the wings, a cape on a stand, and a few carrot tops. Plain dark stage floor below; magic gone missing. |
| `scene-show-couple-account-single.webp` | A couple influencers' studio in dusty rose and sage under ring lights: a two-seat sofa with matching cushions and mugs, a camera on a tripod with its red light on, an editing desk with blank screens, and through an open door a rack of outfits. Plain dark floor below; live and in trouble. |
| `scene-solo-weather-report.webp` | A TV news studio in the evening, deep blue: the weather wall glowing with a map of an invented coastline and cloud and sun symbols (no words or numbers), a studio camera on a pedestal, and the empty news desk off to one side. Plain dark floor below; calm, or is it. |
| `scene-solo-live-workout.webp` | A home workout studio at seven in the morning, a big window with a dark blue dawn turning orange: yoga mats rolled out, dumbbells and a kettlebell, a ring light and a phone on a tripod (blank screen), and a water bottle and towel. Plain dark floor below; peppy. |
| `scene-show-karaoke-skip.webp` | A private karaoke room on a birthday night in magenta and gold: a birthday cake on the table, balloons, a song-picking tablet with a blank screen, the big screen glowing blank, and tambourines on the sofa. Plain dark carpet below; a party with a grudge. |
| `scene-show-final-envelope.webp` | The grand-final stage of a TV singing competition, an arena of LED panels in violet and silver and columns of light: a gold envelope on a pedestal at centre stage, the judges' desk with three red buttons, and confetti cannons waiting. Plain dark stage floor below; live-TV shock. |
| `scene-show-wrap-party-leak.webp` | A film's wrap party in a dark-wood restaurant under string lights: a blank clapperboard on a long table, a cake shaped like a film reel, champagne glasses, a director's chair, and the double doors bolted shut. Plain dark floor below; locked-room glamour. |
| `scene-cn-square-dance-speaker.webp` | A neighbourhood plaza at dusk, apartment blocks with lit windows all around and street lamps coming on: a rolling trolley speaker with coloured lights, red silk fans and handkerchiefs laid on a bench, a blank contest banner strung between lamp posts, and potted plants. Plain plaza tiles in shadow below; competitive and cheerful. |
| `scene-sa-sangeet-song.webp` | A sangeet night in a hall draped with marigold strings and coloured fabric canopies, amber and fuchsia: a DJ booth with a laptop (blank screen) and speakers, a dhol drum on a stand, a low stage with cushions and garlands, and fairy lights. Plain dark floor below; joyful chaos. |
| `scene-kr-drama-finale-spoiler.webp` | A friends' living room on a Friday night set for a watch party, warm amber with fairy lights: a TV with a blank glowing screen, a sofa piled with blankets and cushions, boxes of fried chicken and bowls of snacks, a box of tissues, and phones lying face down. Plain dark floor below; betrayal over snacks. |
| `scene-eu-eurovision-scores.webp` | A living room dressed for a big European song-contest party, glitter and a mirror ball throwing rainbow sparkles, bunting in plain colours: a TV glowing blank, scoresheets on clipboards (grids with nothing filled in), bowls of snacks and drinks, and a little homemade trophy. Plain dark floor below; party-competitive. |

## Check

- In `site`: `npx tsx tests/engine.test.ts` (one test checks every name in `DRAWN_ART` is one the game
  uses and has its file), `npx tsc --noEmit`, `npm run build`. If that test turns down a `scene-`
  name, stop and say so in the PR; don't change the test or the game.
- Every file is 1600 × 900 and at most 150 KB, and `DRAWN_ART` gains exactly this card's 22 names.
- No browser and no uploads: don't open the game in a browser and don't attach pictures to the PR.
  The reviewer makes the contact sheet from the branch and plays the scenes. In the PR, list the
  files with their sizes and paste the checks' results, in words.

## Done when

The 22 files are in `site/public/drama/`, `DRAWN_ART` lists all 22, the checks pass, and the PR lists the
files and the checks' results.

## Send to Codex

```
按 docs/codex-tasks/drama/C7-scenes-show.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里用文字写文件和检查结果。不用开浏览器，也不要往 PR 里传图片。
```
