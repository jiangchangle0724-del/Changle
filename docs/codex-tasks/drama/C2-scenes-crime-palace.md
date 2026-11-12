# drama-C2: a set of its own for each crime and palace scene

戏精大赏 (Drama Queens) shows a painted set behind the actors. Today every scene borrows its kind's
picture (`kind-crime.webp`, `kind-palace.webp`...) or its community's (`group-ca.webp`...), so a
cruise-ship dinner and an escape room both play in front of the same lamp-lit study, and a building
site by a river plays in a throne hall. Cards C2 to C7 give each of the 131 scenes a set of its own,
so the room knows the story the moment the curtain opens. This card draws the 33 crime and palace
scenes.

Before you start: the game has to ask for a scene's own picture first (`scene-<id>`, then its
community's, then its kind's), and the picture test has to accept `scene-` names. If `Backdrop` in
`site/src/party/drama/parts.tsx` or that test doesn't yet, stop and say so: that change isn't part
of this card.

## Files

- Add `site/public/drama/scene-<id>.webp` for each of the 33 scenes below (the first column is the
  file name).
- Add each name, `scene-<id>` without `.webp`, to `DRAWN_ART` in `site/src/data/dramaArt.ts`, in the
  table's order (the game only asks for the names listed there, so a picture you haven't drawn yet
  never shows as a broken image).
- Nothing else.

## Every picture

- 1600 × 900, WebP, at most 150 KB (lighter than the first set: there will be 131 of these).
- The same painted look as the first set: open `kind-crime.webp`, `kind-palace.webp`,
  `kind-family.webp` and `stage.webp` first, and the community pictures (`group-*.webp`). Warm
  theatrical light, rich colour, soft painted detail, seen straight on like a stage set.
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
- No words, letters or numbers anywhere: signs, screens, labels, envelopes, receipts, scrolls,
  clocks, cards and tiles stay blank, show plain colour or face away. No logos or brands, no flags,
  no famous landmark you could name, no religious symbol as the focus. A real brand or place in a
  setup becomes a generic one (a warehouse store, a ski village, an elevated train car, a night
  market). The palace is an imagined one, not a hall you could name.
- Everyday and warm: the way people from there would recognise a home, a festival or a park of their
  own, not a tourist poster. Nothing that makes fun of anyone.
- Night colours: the site is dark. No big areas of white or pale sky; snow stays blue in shadow, and
  a daytime scene is lit low and warm (late sun, lamps on, rain on the window).
- Each set looks clearly different from the others on this card, from the first set and from the
  community pictures: another place, palette or time of day. Where scenes share a kind of place (two
  manors, two museums, many palace rooms), the table gives each its own corner, season or light;
  keep them apart.

## The pictures

| File | What it shows |
| --- | --- |
| `scene-crime-mansion-wine.webp` | A manor's dining room in midnight blue and gold the moment the chandeliers flicker back on: a long table around a half-eaten birthday cake, an empty antique wine bottle on its side, a potted palm with dark wine pooled in its soil, and an empty key hook by the cellar door. Plain dark parquet below; a gasp held in. |
| `scene-palace-poisoned-soup.webp` | The emperor's private dining chamber late at night, crimson walls and gold lattice in tall candlelight: a porcelain bowl of lotus soup on a lacquered table with its spoon dropped beside it, a silver testing needle on a cloth, the physician's open medicine chest, and a row of covered dishes on a serving stand. Plain dark stone floor below; hushed and dangerous. |
| `scene-crime-open-house-cookie.webp` | A staged show home's open-plan kitchen at dusk, glossy and too perfect under warm pendant lights: an empty little cookie stand under a glass dome on the island, a bowl of shiny fake lemons, a stack of floor plans (lines only) by the front door, and a vase of tulips. Plain dark walnut floor below; spotless and suspicious. |
| `scene-crime-library-last-page.webp` | A private library on a rainy night, rain streaking tall dark windows, green reading lamps and a low fire: four armchairs around a table where an old hardback mystery lies open at its end with a torn stub where the last page was, teacups and a plate of biscuits, and shelves of worn spines with no titles. Plain dark rug below; snug but wary. |
| `scene-crime-museum-squeak.webp` | A small jade gallery during a rehearsal before opening, house lights half up and work lamps on stands throwing cool light on jade-green walls: a lit glass display case with a little green rubber duck sitting on the carving's silk stand, velvet ropes, a ladder, and a cart of blank display cards. Plain dark stone floor below; hushed, trying not to laugh. |
| `scene-crime-auction-empty-frame.webp` | A private auction preview room at night, plum walls and brass picture lights: an ornate empty gilt frame on an easel at the centre with a small blank card tucked in its corner, an auctioneer's lectern and gavel, rows of gilt chairs with blank bidding paddles, and a velvet rope. Plain dark carpet below; elegant and scandalised. |
| `scene-crime-chalet-ransom.webp` | A ski chalet's living room at night, pine walls glowing amber and snow falling past a big window onto dark slopes: a bare spot on the kitchen shelf where a tin stood, a folded blank note under a mug on the table, skis and poles racked by the door, and three mugs of cocoa going cold. Plain dark floorboards below; cosy gone awkward. |
| `scene-crime-manor-recording.webp` | A manor study near midnight, oxblood leather and brass under one desk lamp and moonlight through tall curtains: a vintage reel-to-reel recorder with its reels still turning, a wall safe with a keypad of blank buttons, a small chalkboard beside it wiped into a grey smear, and a grandfather clock with plain ticks and its hands near twelve. Plain dark rug below; eerie and expectant. |
| `scene-palace-dragon-robe.webp` | The palace wardrobe hall in early-morning lamplight, shelves stacked with bolts of silk in jewel colours: a yellow dragon robe on a tall display stand, its hem a little too short and edged with a row of tiny embroidered ducks, a tailor's table with scissors, thread and a measuring cord, and rolls of fabric leaning in baskets. Plain dark floorboards below; comic panic before a big day. |
| `scene-palace-exam-blank-scroll.webp` | The great hall of court on a misty morning, deep blue pillars and a gold ceiling lit by lanterns: three exam scrolls unrolled side by side on a long red-lacquered table, every one blank, their red seals broken beside them, an inkstone and brush rest, and the empty throne on its dais at the back. Plain dark stone floor below; solemn and baffled. |
| `scene-palace-lantern-wish.webp` | A palace courtyard on lantern-festival night, hundreds of red and gold lanterns glowing under the eaves: one huge wish lantern at the centre whose painted panel shows a pillow and a nightcap under a crescent moon where gold coins should be, a ladder leaning on its frame, and pots of paint on a stool. Plain dark flagstones below; festive with a giggle. |
| `scene-palace-jade-betrothal.webp` | A banquet hall dressed in red for an imperial engagement in the early evening, silk swags and paper-cut patterns with no characters: three red betrothal documents laid side by side on a lacquered table, each painted with the same green jade pendant, gift boxes wrapped in red cloth, a seal box, and tall red candles. Plain dark lacquered floor below; lavish and tangled. |
| `scene-palace-cold-palace-menu.webp` | The cold palace's shabby courtyard at teal twilight, cracked walls and bare branches, freshly dressed up as a retreat: a wooden bathtub steaming with herbs, a row of rolled sleeping mats tied with ribbon, a tea table laid for guests, a blank notice pasted by the moon gate, and new lanterns among the peeling paint. Plain worn flagstones below; faded grandeur turned cheeky spa. |
| `scene-palace-vault-echo.webp` | The palace treasury vault by torchlight, stone walls and iron-bound doors in bronze and gold: shelves of locked chests and trays of silver ingots, one lacquered chest standing open and empty at the centre, a ring of four keys on a hook, and a counting table with an abacus and a ledger of blank pages. Plain dark stone floor below; echoing and nervous. |
| `scene-palace-garden-love-letter.webp` | The imperial garden at violet spring dusk, a small pavilion by a lotus pond with plum blossom and a rockery: a folded letter on the pavilion's stone table under a sprig of blossom, a stone bench, a lantern hanging from the eaves, and petals drifting on the dark water. Plain dark grass and a stone path below; romantic and dangerous. |
| `scene-crime-costco-massage-chair.webp` | A small apartment kitchen at night just after a warehouse-store run, one warm ceiling light: the counter buried in giant bulk packs in plain wrapping (a tower of paper towels, a crate of water, a tub of muffins), a very long blank receipt curling off the edge, car keys, and a handful of tiny paper sample cups. Plain dark vinyl floor below; sticker shock. |
| `scene-palace-mooncake-crescent.webp` | A moon-viewing terrace at the Mid-Autumn banquet, a full moon over dark palace roofs and silver-blue light warmed by lanterns: a giant mooncake on a gold platter, stamped with a round pattern (no characters) and missing a neat crescent from its edge, sprays of osmanthus in vases, a tea set, and a covered serving cart. Plain dark stone terrace below; festive with a frown. |
| `scene-crime-porch-package.webp` | The shared front porch of an old two-storey house at a wet autumn dusk, raised a few steps above the walk with the porch light already on: two front doors side by side with two mailboxes (no numbers), a dry rectangle on the damp boards where a parcel sat, potted mums, and fallen leaves. Plain dark front path below; a small street, a big suspicion. |
| `scene-palace-decree-extra-stroke.webp` | A riverside building site outside the palace walls at dusk, a half-built stone arch bridge in bamboo scaffolding and lanterns on poles reflected in the dark water: a yellow silk decree scroll held open on a trestle table but turned away from us, a messenger's lacquered decree tube, baskets of tools, and stacked cut stone. Plain muddy bank in shadow below; dusty and jubilant. |
| `scene-palace-hairpin-guardroom.webp` | A plain palace guardroom at night, rough timber walls, one oil lamp and cold moonlight through a barred window: a gold phoenix hairpin glinting on a small table beside the lamp, a breastplate and helmet hanging on pegs, a rack of spears, and a plain bench. Plain bare boards below; a scandal in a humble room. |
| `scene-crime-halloween-ballot-box.webp` | A living room dressed for a Halloween party in purple and orange light, cobwebs on the shelves and carved pumpkins glowing: a ballot box stuffed so full that blank slips spill over the top, a little gold costume-contest trophy, an empty dog bed with a pumpkin chew toy, and a punch bowl breathing dry-ice fog. Plain dark wood floor below; spooky and silly. |
| `scene-crime-night-market-recipe.webp` | A night-market food stall at its busiest hour, steam glowing under bare bulbs and strings of lights, the neighbouring stalls fading into a warm haze: a big pot of curry fishballs on skewers, a stack of paper bowls, an empty clip on the back wall where a recipe card hung, plastic stools, and a cash tin. Plain dark asphalt below; hungry chaos. |
| `scene-palace-silent-firecrackers.webp` | A palace courtyard on a frosty New Year's Eve, red lanterns glowing under the eaves: long strings of red firecrackers hanging from tall bamboo poles, their fuses burnt out and not one burst, a few split open to show plain rolled paper inside, and a brazier of glowing coals. Plain dark flagstones below; a very quiet celebration. |
| `scene-palace-dowager-cricket.webp` | The empress dowager's sitting room at blue dawn, jade-green silk walls and lattice windows: a carved gourd cricket cage on a lacquered stand with its little lid open and nothing inside, a glazed clay fighting pot set out for tomorrow, a fine grass tickler in a holder, and a tiny porcelain water dish. Plain dark floorboards below; a royal fluster over something very small. |
| `scene-palace-portrait-mole.webp` | The court painter's studio by candlelight on the eve of the selection: the candidates' hanging portraits in a row under silk covers so no face shows, brushes in a pot and an inkstone on the worktable, an open lacquered chest waiting to carry the portraits to the emperor, and a candle burnt low. Plain dark floorboards below; a hushed night of rivalry. |
| `scene-crime-poker-night-ring.webp` | A basement den on poker night, a green felt table under a low hanging lamp: a pile of plain coloured chips in the middle with an open, empty ring box on top, playing cards face down, an empty ice bucket, and a few unlabelled bottles. Plain dark carpet below; tense and guilty. |
| `scene-palace-lantern-masked-dancer.webp` | A lakeside dance terrace at dawn after the Lantern Festival masquerade, the lanterns burnt low and the lake turning from deep blue to rose: a bench where masks were left behind (red, gold and one silver), ribbons and petals on the balustrade, the musicians' empty stools with a pipa leaning on one, and a curtain of lanterns over the water. Plain dark stone terrace below; the hush after a secret. |
| `scene-solo-museum-guide.webp` | A grand museum hall at closing time, the side galleries dimming one by one and a few warm spotlights left: a thousand-year-old celadon vase on a pedestal inside a tall glass case, brass stanchions with velvet rope around it, a wooden bench, and arched doorways into the dark. Plain dark marble floor below; reverent and quiet. |
| `scene-crime-escape-room-key.webp` | An escape room dressed as an old explorer's study, lit red by a warning lamp, a heavy iron door with a big keyhole at the back: an empty hook on the wall where a brass key hung, an hourglass with only a little sand left, padlocked chests, and a wall of puzzle dials marked with symbols (no letters or numbers). Plain dark floorboards below; claustrophobic and frantic. |
| `scene-crime-cruise-necklace.webp` | A cruise ship's grand dining saloon at night as the chandeliers come back on, round portholes showing a dark sea and a moon: the captain's long table in navy and gold with an open, empty velvet necklace case, a toppled champagne flute, and a small stage with a grand piano and a microphone stand for the ship's singer. Plain dark patterned carpet below; glamour with nowhere to run. |
| `scene-palace-banquet-seal.webp` | A palace garden banquet on a cold clear night, moonlight through thin cloud and a long low table under a canopy of red lanterns with the king's carved chair at its head: an empty brocade cushion on a small lacquered stand where the royal seal sat, half-finished dishes and wine cups, an envoy's gift chest, and the tall palace gates shut and barred behind. Plain dark flagstones below; a feast frozen in alarm. |
| `scene-ca-snow-day-driveway.webp` | A suburban street the morning after a big snowfall, still blue before sunrise with porch lights and streetlights on, the snow deep blue in shadow and never bright white: the corner house's driveway buried under a bank higher than the car with only its roof showing, shovels stuck upright in the banks, a kid's red sled, a snowblower parked by a neighbour's cleared drive, and the amber light of a city plow far down the road. Plain trampled snow in shadow below; neighbourly chaos. |
| `scene-eu-christmas-market-cashbox.webp` | Close on one wooden Christmas-market stall at closing time, its hatch half down and its string lights still on, the dark square and a few lit stalls behind: a copper pot of hot chocolate with a ladle, rows of gingerbread hearts iced with patterns only, an open metal cash box with a few coins, and an empty red velvet Santa chair beside the stall. Plain dark cobblestones below; tired, cosy and uneasy. |

## Check

- In `site`: `npx tsx tests/engine.test.ts` (one test checks every name in `DRAWN_ART` is one the game
  uses and has its file), `npx tsc --noEmit`, `npm run build`. If that test turns down a `scene-`
  name, stop and say so in the PR; don't change the test or the game.
- Every file is 1600 × 900 and at most 150 KB, and `DRAWN_ART` gains exactly this card's 33 names.
- Look at them in the game: `npm run dev`, choose 演戏猜坏人 and press 换个剧本 until this card's
  scenes come up, at a phone's width (390) and on the big screen (`/tv/<code>`). At least six,
  among them a spicy one (尺度: 微辣) and a community's (加拿大本地 or 欧洲 under 剧本背景). The
  figures and their plaques must stay easy to read over the picture.
- In the PR: a contact sheet of all 33, small, each with its file name under it, and phone
  screenshots of the ones you played.

## Done when

The 33 files are in `site/public/drama/`, `DRAWN_ART` lists all 33, the checks pass, and the contact
sheet and screenshots are in the PR.

## Send to Codex

```
按 docs/codex-tasks/drama/C2-scenes-crime-palace.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里贴缩略图。
```
