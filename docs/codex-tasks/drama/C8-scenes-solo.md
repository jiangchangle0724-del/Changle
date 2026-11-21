# drama-C8: a set of its own for each new monologue

戏精大赏 (Drama Queens) shows a painted set behind the actors. Cards C2 to C7 gave each of the 131
scenes a set of its own. On Nov 20 eight new monologues (one actor, the room guessing their secret)
were added, and they borrow their kind's picture for now. This card draws their sets.

## Files

- Add `site/public/drama/scene-<id>.webp` for each of the 8 scenes below (the first column is the
  file name).
- Add each name, `scene-<id>` without `.webp`, to `DRAWN_ART` in `site/src/data/dramaArt.ts`, in the
  table's order (the game only asks for the names listed there).
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
- Each set looks clearly different from the others on this card, from the first set, from the
  community pictures and from the scene pictures already drawn (the `scene-*.webp` in
  `site/public/drama/`): another place, palette or time of day. The two palace sets stay apart from
  `kind-palace.webp` and the sixteen `scene-palace-*.webp` (above all `scene-palace-decree-extra-stroke`,
  another decree); the shampoo livestream stays apart from `scene-show-livestream-sales` (a hot pink
  kitchen set: this one is a teal-tiled bathroom set); the dating show stays apart from the dating
  shows already drawn among the `scene-show-*.webp`; the restaurant stays apart from the ballrooms
  (`scene-solo-best-man-speech`, `scene-family-lipstick-collar`).

## The pictures

A monologue has one actor in the middle of the stage: keep the centre of the bottom third clear.

| File | What it shows |
| --- | --- |
| `scene-solo-royal-decree.webp` | A throne hall at dusk, red lacquer pillars and carved gold dragons: an empty throne on a raised dais behind a folding screen painted with cranes, a rolled yellow silk scroll on a lacquer tray at the front, incense smoke curling through lamp light, rows of empty kneeling cushions. Plain dark stone floor below; a grand, solemn court. |
| `scene-solo-palace-audition.webp` | An inner palace hall at night for the royal selection, a row of round silk lanterns in deep jade and plum: a low platform with a guqin zither and an embroidery frame, a vase of plum blossom, two empty carved chairs for the royals behind a gauze curtain. Plain dark polished floor below; hushed and nervous. |
| `scene-solo-parents-evening.webp` | A primary-school classroom after hours, warm ceiling lights and dusk at the window: small desks in rows with little chairs, a blackboard wiped blank, the teacher's desk with a neat stack of blank report cards and a vase of flowers, children's paintings on the wall as soft patches of colour. Plain dark floor below; proud and slightly too formal. |
| `scene-solo-night-guard.webp` | A shopping mall at night, shutters half down along the corridor: a jewellery shop with an empty glass display case and one cracked pane, a security booth with a wall of small blank monitors glowing blue, a desk with a thermos, a folded blanket and a torch. Plain dark tiled floor below; the morning after something went wrong. |
| `scene-solo-livestream-shampoo.webp` | A bathroom-styled livestream set at night, teal tiles and brass taps under a ring light: rows of unlabelled shampoo bottles on glass shelves, a phone on a tripod with a blank glowing screen, a hairbrush and a towel on the counter, and a big electric fan waiting in the corner. Plain dark floor below; glossy and a little too perfect. |
| `scene-solo-restaurant-proposal.webp` | An elegant restaurant at night, burgundy walls and gold sconces: a candlelit table for two by a tall window of soft city lights (no landmark), a cream tablecloth in low light, two champagne glasses, a single red rose and a small open ring box catching the candle. Plain dark carpet below; romantic and about to be awkward. |
| `scene-solo-dating-show.webp` | A TV dating-show stage in gold and teal light: a curved row of twenty empty contestant podiums, each with a glowing round light (one switched off), a big arch of lights, and a spotlight circle waiting centre stage. Plain dark glossy floor below; bright, loud and judging. |
| `scene-solo-eulogy.webp` | A funeral hall in low amber light: banks of pale yellow chrysanthemums, a dark wooden coffin closed under a wreath, an empty lectern with a microphone, tall candles, and a framed picture draped in black ribbon with its picture turned away. Plain dark carpet below; solemn, with everyone thinking about the will. |

## Checks

From `site/`: `npx tsc --noEmit`, `npx tsx tests/engine.test.ts`, `npm run build`. The engine test
checks that every name in `DRAWN_ART` has its file.

## Done when

The 8 files are in `site/public/drama/`, `DRAWN_ART` lists all 8, the checks pass, and the PR lists the
files and the checks' results.

## Send to Codex

```
按 docs/codex-tasks/drama/C8-scenes-solo.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里用文字写文件和检查结果。不用开浏览器，也不要往 PR 里传图片。
```
