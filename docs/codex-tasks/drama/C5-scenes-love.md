# drama-C5: a set of its own for each love scene

戏精大赏 (Drama Queens) shows a painted set behind the actors. Today every scene borrows its kind's
picture (`kind-love.webp`...) or its community's (`group-ir.webp`...), so a library returns trolley
and a karaoke birthday both play in front of the same candlelit terrace over a city. Cards C2 to C7
give each of the 131 scenes a set of its own, so the room knows the story the moment the curtain
opens. This card draws the 20 love scenes.

Before you start: the game has to ask for a scene's own picture first (`scene-<id>`, then its
community's, then its kind's), and the picture test has to accept `scene-` names. If `Backdrop` in
`site/src/party/drama/parts.tsx` or that test doesn't yet, stop and say so: that change isn't part
of this card.

## Files

- Add `site/public/drama/scene-<id>.webp` for each of the 20 scenes below (the first column is the
  file name).
- Add each name, `scene-<id>` without `.webp`, to `DRAWN_ART` in `site/src/data/dramaArt.ts`, in the
  table's order (the game only asks for the names listed there, so a picture you haven't drawn yet
  never shows as a broken image).
- Nothing else.

## Every picture

- 1600 × 900, WebP, at most 150 KB (lighter than the first set: there will be 131 of these).
- The same painted look as the first set: open `kind-love.webp`, `kind-family.webp` and `stage.webp`
  first, and the community pictures (`group-*.webp`). Warm theatrical light, rich colour, soft
  painted detail, seen straight on like a stage set.
- An empty set: no people, no faces (none in portraits, photos, mirrors or reflections either), no
  animals as the subject. A scene about a pet or a person shows its place and their things instead:
  an empty cricket cage, a top hat on a magic table. A wedding gown hangs on a hanger, never on a
  dress form.
- The game stands its own figures and their name plaques along the bottom third, so keep that third
  simple and darker (a floor, a carpet, grass, a path) and put the interest in the middle and the top.
- Show the scene's place and the props its setup mentions, so the room recognises the story at a
  glance. Never give away who did it or the twist: paint what the table says and add no clues of
  your own.
- Spicy scenes stay tasteful: romance and scandal show only through objects (a ring box, a lipstick
  mark on a cup, an empty champagne flute). No beds in view.
- No words, letters or numbers anywhere: signs, screens, tickets, letters, tags, receipts, clocks
  and cards stay blank, show plain colour or face away. No logos or brands, no flags, no famous
  landmark you could name, no religious symbol as the focus. A real brand or place in a setup becomes
  a generic one (a warehouse store, a ski village, an elevated train car, a night market): here a
  rainy city with no skyline you could name, and a cabin in a ski village.
- Everyday and warm: the way people from there would recognise a home, a festival or a park of their
  own, not a tourist poster. Nothing that makes fun of anyone.
- Night colours: the site is dark. No big areas of white or pale sky; snow stays blue in shadow, and
  a daytime scene is lit low and warm (late sun, lamps on, rain on the window).
- Each set looks clearly different from the others on this card, from the first set and from the
  community pictures: another place, palette or time of day. Where scenes share a kind of place
  (five weddings, two reunions with a time capsule), the table gives each its own venue, corner or
  light; keep them apart.

## The pictures

| File | What it shows |
| --- | --- |
| `scene-love-anniversary-gift.webp` | A quiet street outside a little restaurant on a rainy anniversary night, its window glowing on a candlelit table for two: a car at the curb (no badge, a blank plate) with its passenger door open and the dome light shining on a small wrapped perfume box with a gold bow on the seat, and a bouquet of roses in paper on the car's roof. Plain wet street in shadow below; romantic turned suspicious. |
| `scene-love-proposal-subtitles.webp` | A harbour boardwalk at night set for a proposal rehearsal, city lights glittering across the water with no landmark: a big outdoor screen on a truss glowing blank pink, an arch of red roses, rows of candles in glass jars, and a control desk with a tablet on a stand. Plain dark boardwalk planks below; romantic, about to go wrong. |
| `scene-love-rainy-umbrella.webp` | The entrance of an old theatre on a rainy night, a marquee of warm bulbs over a blank sign and glowing glass doors: an open umbrella hooked on a brass railing with four blank tickets fluttering from its folds, puddles reflecting the lights, and a poster case holding a blank poster. Plain wet pavement in shadow below; a cosy date with company. |
| `scene-love-noodle-review.webp` | A small apartment kitchen at a rainy noon, lamps on against the grey: a lovingly packed lunch box of noodles with a heart-shaped egg and little sauce cups on the counter, a courier's insulated delivery bag beside it, a phone with a blank glowing screen, and a pot and ladle on the stove. Plain dark floor below; sweet with a sour note. |
| `scene-love-wedding-plus-one.webp` | A glass conservatory wedding venue at dusk during the rehearsal, palms and fairy lights, still half decorated: rows of gold chairs, a flower arch half dressed, a seating chart on an easel (just boxes and lines), and a laptop glowing blank on a folding table beside a box of blank place cards. Plain dark tiled floor below; organised chaos with a ghost. |
| `scene-love-key-under-pot.webp` | The front door of a new apartment early in the evening before a housewarming, fairy lights and a few balloons on the door: moving boxes stacked in the hall, a potted fern tipped to one side to show a key with a small blank paper tag beneath it, and a bottle of wine with a bow. Plain dark hallway floor below; nobody wants to touch it. |
| `scene-love-honeymoon-refund.webp` | A lavish restaurant's private dining room at night, velvet booths and a chandelier in emerald and gold: a table for four with champagne in an ice bucket, four plated starters, tall candles, and a blank leather bill folder left untouched in the middle. Plain dark carpet below; dressed up and nobody paying. |
| `scene-love-wedding-eve-photo.webp` | A hotel suite's sitting room late at night on the eve of a wedding, cool blue city lights through the window and one warm lamp: a wedding gown in a garment bag hanging on the wardrobe, a veil over a chair, a bouquet in a vase, and a phone lying face down on the writing desk with light leaking from its edges, the door firmly shut. Plain dark carpet below; a secret in a quiet room. |
| `scene-love-whistler-toothbrush.webp` | A pine-walled cabin bathroom in a ski village at night, warm light and steam, a small window onto dark snowy slopes and village lights: a cup on the sink holding three toothbrushes, one with a little heart sticker, two towels on hooks, and ski goggles on the shelf. Plain dark slate floor below; cosy, one too many. |
| `scene-love-library-letter.webp` | A public library late on a Wednesday afternoon, low gold light through a tall window over a cushioned window seat, dark shelves of untitled spines: a returns trolley with a novel lying open and an unsigned envelope peeking out, a stack of returned books, and a reading lamp on the window table. Plain dark floor below; shy and secret. |
| `scene-love-valentine-lunch.webp` | A couple's apartment kitchen on a February evening under a warm pendant light: a laptop with a blank glowing screen and a printed bank statement (lines only) on the table, an open heart-shaped chocolate box, a pot simmering on the stove, a sink of dishes with a sponge, and a single rose in a glass. Plain dark floor below; sweet home, sour bill. |
| `scene-love-secret-santa-letter.webp` | A friends' living room at a Christmas party, a tree heavy with lights and a fire in the grate: torn wrapping paper and ribbon heaped on the sofa, a pile of opened gifts, one small gift box open with a folded letter inside, mugs of cocoa, and stockings on the mantel (no names). Plain dark wood floor below; giddy and blushing. |
| `scene-love-three-blind-dates.webp` | A dim sum restaurant at lunchtime, red lanterns and carved lattice over the windows, steam rising: a small table set for two with a third chair squeezed in, bamboo steamers and a teapot already ordered, a bouquet of flowers lying across one chair, and a dim sum trolley parked beside. Plain dark carpet below; an awkward comedy. |
| `scene-love-ktv-dedication.webp` | A private karaoke room at night in neon pink and violet under a mirror ball: the big screen glowing a blank pink wash with floating hearts, a birthday cake with candles burnt low, two half-finished drinks and a paper party crown left on the empty end of the sofa, and microphones on the table. Plain dark carpet below; glittery and loaded. |
| `scene-love-time-capsule-letter.webp` | A high-school classroom at night for a ten-year reunion, desks pushed together and fairy lights strung over a chalkboard wiped clean: a dented metal time capsule open on the teacher's desk with old trinkets and letters spilling out, one envelope sealed with a red heart on top, and balloons and paper cups. Plain dark floor below; nostalgic and nervous. |
| `scene-solo-best-man-speech.webp` | A grand hotel ballroom at a wedding reception, gold chandeliers and a champagne tower: the head table with flowers and two empty chairs for the couple, a microphone on a stand before it, a tiered wedding cake, and a spotlit dance floor at the back. Plain dark carpet below; all eyes on one person. |
| `scene-solo-ex-wedding-toast.webp` | A rustic barn wedding reception at night, timber beams strung with lights and candles in jars, deep green and amber: long tables with wildflowers, a microphone on a stand by the head table, a tiered cake, and a hay-bale lounge in the corner. Plain dark floorboards below; the whole room holding its breath. |
| `scene-love-wedding-rings.webp` | A bridal dressing room in an old manor an hour before the ceremony, blush and gold with late sun low behind sheer curtains: an open, empty ring box on a vanity under a bulb-framed mirror that reflects only the room, an ivory gown hanging on the wardrobe door, a bouquet, and a velvet couch. Plain dark carpet below; panic in a pretty room. |
| `scene-love-reunion-letter.webp` | A school sports field at dusk for a twenty-year reunion, floodlights coming on and goal posts against a violet sky: a rusty metal time capsule just dug up beside an old tree, a shovel stuck in the earth, an unsigned envelope lying on the open lid, and folding tables with drinks under plain-coloured bunting. Plain dark grass below; bittersweet. |
| `scene-ir-khastegari-tea.webp` | An Iranian family's best guest room in the evening, a crystal chandelier and a Persian carpet hung on the wall: a silver tray of gold-rimmed tea glasses on saucers, a crystal bowl of sugar cubes, a plate of pastries and a pyramid of fruit, and a big bouquet of flowers. Plain dark carpet below; formal and hopeful. |

## Check

- In `site`: `npx tsx tests/engine.test.ts` (one test checks every name in `DRAWN_ART` is one the game
  uses and has its file), `npx tsc --noEmit`, `npm run build`. If that test turns down a `scene-`
  name, stop and say so in the PR; don't change the test or the game.
- Every file is 1600 × 900 and at most 150 KB, and `DRAWN_ART` gains exactly this card's 20 names.
- No browser and no uploads: don't open the game in a browser and don't attach pictures to the PR.
  The reviewer makes the contact sheet from the branch and plays the scenes. In the PR, list the
  files with their sizes and paste the checks' results, in words.

## Done when

The 20 files are in `site/public/drama/`, `DRAWN_ART` lists all 20, the checks pass, and the PR lists the
files and the checks' results.

## Send to Codex

```
按 docs/codex-tasks/drama/C5-scenes-love.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里用文字写文件和检查结果。不用开浏览器，也不要往 PR 里传图片。
```
