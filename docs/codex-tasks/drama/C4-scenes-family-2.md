# drama-C4: a set of its own for each family scene, part 2

戏精大赏 (Drama Queens) shows a painted set behind the actors. Today every scene borrows its kind's
picture (`kind-family.webp`...) or its community's (`group-sa.webp`...), so a lakeside campsite and a
blacked-out apartment lobby both play in front of the same New Year dining room. Cards C2 to C7 give
each of the 131 scenes a set of its own, so the room knows the story the moment the curtain opens.
This card draws the last 16 of the 33 family scenes (C3 draws the first 17), 13 of them set in one
community's everyday life.

Before you start: the game has to ask for a scene's own picture first (`scene-<id>`, then its
community's, then its kind's), and the picture test has to accept `scene-` names. If `Backdrop` in
`site/src/party/drama/parts.tsx` or that test doesn't yet, stop and say so: that change isn't part
of this card.

## Files

- Add `site/public/drama/scene-<id>.webp` for each of the 16 scenes below (the first column is the
  file name).
- Add each name, `scene-<id>` without `.webp`, to `DRAWN_ART` in `site/src/data/dramaArt.ts`, in the
  table's order (the game only asks for the names listed there, so a picture you haven't drawn yet
  never shows as a broken image).
- Nothing else.

## Every picture

- 1600 × 900, WebP, at most 150 KB (lighter than the first set: there will be 131 of these).
- The same painted look as the first set: open `kind-family.webp`, `kind-love.webp` and `stage.webp`
  first, and the community pictures (`group-*.webp`). Warm theatrical light, rich colour, soft
  painted detail, seen straight on like a stage set.
- An empty set: no people, no faces (none in portraits, photos, mirrors or reflections either), no
  animals as the subject. A scene about a pet or a person shows its place and their things instead:
  an empty cricket cage, a top hat on a magic table.
- The game stands its own figures and their name plaques along the bottom third, so keep that third
  simple and darker (a floor, a carpet, grass, a path) and put the interest in the middle and the top.
- Show the scene's place and the props its setup mentions, so the room recognises the story at a
  glance. Never give away who did it or the twist: paint what the table says and add no clues of
  your own.
- Spicy scenes stay tasteful: romance and scandal show only through objects (a ring box, a lipstick
  mark on a cup, an empty champagne flute).
- No words, letters or numbers anywhere: signs, screens, labels, envelopes, parcels, clocks, cards
  and tiles stay blank, show plain colour or face away. No logos or brands, no flags, no famous
  landmark you could name, no religious symbol as the focus. A real brand or place in a setup becomes
  a generic one (a warehouse store, a ski village, an elevated train car, a night market).
- Everyday and warm: the way people from there would recognise a home, a festival or a park of their
  own, not a tourist poster. Nothing that makes fun of anyone. A community's scene shows another
  room, corner or moment than that community's picture in `group-*.webp`.
- Night colours: the site is dark. No big areas of white or pale sky; snow stays blue in shadow, and
  a daytime scene is lit low and warm (late sun, lamps on, rain on the window).
- Each set looks clearly different from the others on this card, from the first set and from the
  community pictures: another place, palette or time of day. Where scenes share a kind of place
  (four living rooms, three kitchens, two Iranian homes), the table gives each its own corner,
  season or light; keep them apart.

## The pictures

| File | What it shows |
| --- | --- |
| `scene-family-camp-snacks.webp` | A lakeside campsite at midnight, two tents glowing faintly, pines and a moon over black water: a picnic table with a snack bag zipped shut but slumped half empty, a few torn snack packets (no print) scattered beside it, a cooler, a lantern, and the embers of a campfire. Plain dark forest floor below; spooky and funny. |
| `scene-family-parents-chat.webp` | An elementary classroom after school, lights half on and a dusky blue window: small chairs and a ring of grown-up chairs, the teacher's desk with a printout of a chat covered in black bars over grey lines, a chalkboard wiped clean, children's crayon drawings of suns and houses (no faces), and a box of tissues. Plain dark floor below; tense and polite. |
| `scene-family-building-blackout.webp` | An apartment building's lobby in a blackout, lit only by a green emergency light, a few candles and one flashlight beam: a wall of mailboxes (no numbers) with a candle on top, dark elevator doors, the electrical room door ajar on the main breaker panel, and a stairwell rising into darkness. Plain dark tiled floor below; spooky and neighbourly. |
| `scene-cn-family-chat-photo.webp` | A Chinese family's apartment living room late at night on the eve of Grandpa's eightieth, dressed in red and gold: gold balloons, a boxed birthday cake and gift boxes on the sideboard, a teapot gone cold, the family's phones lying face down on the coffee table, and a window of dark city towers. Plain dark floorboards below; a family holding its breath. |
| `scene-cn-singles-day-parcels.webp` | An apartment's front hall at night under a warm ceiling light: a tower of brown parcels of every size stacked almost to the ceiling by the door, blank shipping labels, a box cutter, slippers lined up by the shoe cabinet, and through an arch the sofa and coffee table ready for a family meeting. Plain dark floor below; a comic avalanche. |
| `scene-ca-cottage-canoe.webp` | A cottage dock at first light on a long weekend, mist on a still dark lake and pines along the far shore, deep blue turning rose, and no canoe anywhere in sight: the end of a rope hanging from a dock post, a paddle and two life jackets on the boards, two wooden lake chairs, and the cottage's lit window behind. Plain dark dock planks below; a quiet morning gone wrong. |
| `scene-sa-diwali-sweets-box.webp` | A family's front doorstep on Diwali night, the door framed with marigold garlands and fairy lights: clay diyas glowing along the steps, a flower-petal rangoli by the door, a big gift-wrapped box of mithai with a small blank card tucked under its ribbon on a bench, and paper lanterns in the windows. Plain dark front path below; festive, about to be awkward. |
| `scene-sa-cricket-final-password.webp` | A packed family living room at night during a cricket final, a big TV glowing blank at the centre: a sofa crowded with cushions and plain-coloured team scarves (no flags), a cricket bat leaning on the wall, plates of samosas and pakoras, cups of chai, and a remote dropped on the cushions. Plain dark rug below; nail-biting. |
| `scene-ph-noche-buena-flan.webp` | A Filipino family kitchen ten minutes before midnight on Christmas Eve, warm and crowded, a capiz-shell parol glowing in the window: an empty oval flan tray streaked with caramel on the counter, a glazed ham, a round red-wax cheese, a pot of spaghetti, and a wall clock with plain ticks near twelve. Plain dark tiled floor below; festive alarm. |
| `scene-ph-balikbayan-box.webp` | A living room turned packing station on a rainy afternoon, lamps on: a giant cardboard box on a low platform, half taped and overflowing with cans, bags of chocolate and folded clothes, a hanging luggage scale, rolls of tape and twine, and more piles waiting on the sofa. Plain dark floor below; everyone's love, ten kilos too much. |
| `scene-ph-debut-eighteen-roses.webp` | A hotel function room at a debut, an eighteenth-birthday ball, in blush pink and gold under a sparkling chandelier and a balloon arch: a silver tray of long-stemmed red roses by the dance floor, an ornate empty chair for the debutante, an emcee's stand with a microphone and a blank list card, and a tiered cake. Plain dark polished floor below; glamorous and puzzled. |
| `scene-kr-chuseok-jeon.webp` | A Korean apartment kitchen early on Chuseok morning, the window still dawn-blue: a big griddle of golden jeon frying, bowls of egg batter and sliced vegetables, a wide platter of jeon with suspicious gaps, oil-spotted paper towels, and through a doorway a low table being set for the holiday. Plain dark floor below; busy, sizzling and mysteriously shrinking. |
| `scene-jp-otoshidama-envelopes.webp` | A Japanese family's tatami room on New Year's Day at dusk, paper sliding doors glowing amber: a low kotatsu table with a bowl of mandarins, a neat row of small identical patterned envelopes (no writing), a lacquered box of New Year food, and a pine-and-plum arrangement in the alcove. Plain tatami in shadow below; polite and festive, one envelope too light. |
| `scene-ir-nowruz-haft-sin.webp` | An Iranian family's dining corner at dawn on Nowruz, blue-violet first light at a window of spring blossom: the haft-sin spread on an embroidered cloth (apples, garlic, coins, sumac, painted eggs, candles and a small mirror reflecting only candlelight) with one empty plate where the sprouted wheat should be, and a bowl of hyacinths. Plain dark carpet below; a morning one thing short. |
| `scene-ir-yalda-watermelon.webp` | An Iranian family's living room on Yalda night, deep red and gold by candlelight, the window black: a korsi (a low table under a heavy quilt) with a whole watermelon sitting upright on a tray, bowls of pomegranate seeds and nuts, persimmons, a knife and plates waiting for midnight, and a wall clock with plain ticks near ten. Plain dark carpet below; the cosiest, longest night. |
| `scene-eu-nonna-sauce.webp` | An Italian family's rustic kitchen at Sunday lunch, warm light through half-closed shutters and copper pans on the wall: a big pot of red sauce on the stove with a wooden spoon, a bowl of pasta and a basket of bread, pots of basil, and a recycling bin by the back door with one empty glass jar (no label) on top. Plain dark terracotta floor below; praise with a catch. |

## Check

- In `site`: `npx tsx tests/engine.test.ts` (one test checks every name in `DRAWN_ART` is one the game
  uses and has its file), `npx tsc --noEmit`, `npm run build`. If that test turns down a `scene-`
  name, stop and say so in the PR; don't change the test or the game.
- Every file is 1600 × 900 and at most 150 KB, and `DRAWN_ART` gains exactly this card's 16 names.
- Look at them in the game: `npm run dev`, choose 演戏猜坏人 and press 换个剧本 until this card's
  scenes come up, at a phone's width (390) and on the big screen (`/tv/<code>`). At least six,
  among them two communities' (pick them under 剧本背景, and their scenes come first). The figures
  and their plaques must stay easy to read over the picture.
- In the PR: a contact sheet of all 16, small, each with its file name under it, and phone
  screenshots of the ones you played.

## Done when

The 16 files are in `site/public/drama/`, `DRAWN_ART` lists all 16, the checks pass, and the contact
sheet and screenshots are in the PR.

## Send to Codex

```
按 docs/codex-tasks/drama/C4-scenes-family-2.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里贴缩略图。
```
