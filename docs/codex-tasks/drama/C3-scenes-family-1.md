# drama-C3: a set of its own for each family scene, part 1

戏精大赏 (Drama Queens) shows a painted set behind the actors. Today every scene borrows its kind's
picture (`kind-family.webp`...) or its community's (`group-cn.webp`...), so a scratched car in a
garage and a late-night mahjong game both play in front of the same New Year dining room. Cards C2
to C7 give each of the 131 scenes a set of its own, so the room knows the story the moment the
curtain opens. This card draws the first 17 of the 33 family scenes; C4 draws the other 16.

Before you start: the game has to ask for a scene's own picture first (`scene-<id>`, then its
community's, then its kind's), and the picture test has to accept `scene-` names. If `Backdrop` in
`site/src/party/drama/parts.tsx` or that test doesn't yet, stop and say so: that change isn't part
of this card.

## Files

- Add `site/public/drama/scene-<id>.webp` for each of the 17 scenes below (the first column is the
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
- No words, letters or numbers anywhere: signs, screens, labels, envelopes, receipts, notebooks,
  clocks, cards and tiles stay blank, show plain colour or face away. Red envelopes and paper-cuts
  carry patterns, never characters. No logos or brands, no flags, no famous landmark you could name,
  no religious symbol as the focus. A real brand or place in a setup becomes a generic one (a
  warehouse store, a ski village, an elevated train car, a night market).
- Everyday and warm: the way people from there would recognise a home, a festival or a park of their
  own, not a tourist poster. Nothing that makes fun of anyone.
- Night colours: the site is dark. No big areas of white or pale sky; snow stays blue in shadow, and
  a daytime scene is lit low and warm (late sun, lamps on, rain on the window).
- Each set looks clearly different from the others on this card, from the first set and from the
  community pictures: another place, palette or time of day. Where scenes share a kind of place
  (three birthdays, two wedding banquets, three New Year scenes), the table gives each its own room,
  corner or light; keep them apart.

## The pictures

| File | What it shows |
| --- | --- |
| `scene-family-new-year-dumplings.webp` | A family kitchen on Lunar New Year's Eve, steam and warm red light, fireworks bursting in the dark window: a flour-dusted board with neat rows of handmade dumplings and one empty gap in a row, a big pot steaming on the stove, small bowls of dark vinegar, and red paper-cut flowers on the window (patterns only). Plain dark tiled floor below; busy, festive and suspicious. |
| `scene-family-cake-floor.webp` | A high-rise apartment's dining room at night in violet and teal, the window full of the identical tower next door and its rows of lit windows: a table set for a birthday dinner around an empty glass cake stand, a box of birthday candles and a lighter, paper party hats, and a phone with a blank glowing screen. Plain dark floorboards below; a party on hold. |
| `scene-family-heirloom-receipt.webp` | A family home's front room in late afternoon, low amber sun striping through wooden blinds: a big porcelain vase painted with peonies on a carved stand, a small blank slip poking out from under its base, a magnifying glass and cotton gloves beside it, and moving boxes stacked against the wall. Plain dark wood floor below; a reunion full of experts. |
| `scene-family-group-vote.webp` | A home kitchen late at night after a huge family meal, one light over the sink and the window night-blue: a mountain of dirty plates, bowls and woks piled in and around the sink, yellow rubber gloves draped over the tap, a full dish rack, and a phone propped against the tiles with a blank glowing screen. Plain dark tiled floor below; comic dread. |
| `scene-family-downpayment-envelope.webp` | A modern condo dining room on a rainy night, rain on a wall of glass over blurred city lights: a dinner table with half-finished dishes, a folded blank gift letter beside a red envelope and a pen, a little wooden model house with a key ring, and a property brochure showing only a picture of a house. Plain dark floor below; polite smiles, sharp eyes. |
| `scene-family-ex-seating.webp` | A restaurant banquet room on New Year's Eve, big round tables in red and gold under lanterns: in the middle of them a tiny table for two with heart-shaped candles and a single rose, a seating chart on an easel (just boxes and lines), and a box of decorations left open. Plain dark carpet below; awkward romance in a family crowd. |
| `scene-family-will-parking.webp` | A wood-panelled study set up for a family meeting at dusk, a green banker's lamp over a long table: an open folder holding a parking-stall key card and a plan of one parking space (lines only), a laptop on a stand with a blank glowing screen for the relative on video, a teapot and cups, and an empty coat hook by the door. Plain dark rug below; solemn and absurd. |
| `scene-family-lipstick-collar.webp` | A hotel ballroom at a sixtieth-birthday banquet, champagne and gold under crystal chandeliers: a tall birthday cake with a silver cake knife laid before it, a row of champagne flutes with one bearing a bright red lipstick print on its rim, a pyramid of peach-shaped longevity buns, and the hostess's empty chair with a shawl over its back. Plain dark carpet below; glamour with a gasp. |
| `scene-family-surprise-heir.webp` | A traditional restaurant's private banquet room at an eightieth birthday, carved rosewood in deep red and gold around a big round table with a turntable: a pyramid of longevity peach buns, a bowl of long-life noodles, gift boxes tied in red, a folded blank report with a crooked red stamp on the turntable, and the double doors flung open with light spilling in. Plain dark carpet below; shock at the feast. |
| `scene-family-red-envelope-double.webp` | Grandma's living room on Lunar New Year's morning, rose-gold light through half-drawn red curtains: a low tea table with an open notebook of ruled lines (no writing), a fan of plain red envelopes, a lacquered candy tray, a bowl of mandarins, and a pot of narcissus. Plain dark floorboards below; sweet with a sting. |
| `scene-family-mom-phone-locked.webp` | A family living room in the early evening, teal walls and a warm lamp, the kitchen glowing orange through a doorway with steam rising from a wok: a phone lying on the coffee table with a blank glowing screen, a laptop on a stand ready for the video call, a wall clock with plain ticks, and a bowl of fruit. Plain dark floorboards below; ten minutes of panic. |
| `scene-family-new-car-scratch.webp` | A home garage at night under a buzzing tube light and one warm work lamp: a shiny new family car side-on (no badge, a blank plate) with a long scratch down the front door dabbed over with glossy nail polish, a pegboard of tools, two bikes on the wall, and a key rack by the house door. Plain dark concrete floor below; uh-oh. |
| `scene-family-designer-bag.webp` | An elegant walk-in closet in plum and champagne, spotlit glass shelves: a structured handbag (no logo) on a velvet stand at the centre, a jeweller's loupe and cotton gloves beside it, a dust bag and a blank boutique receipt folded in its box, and rows of shoes and scarves. Plain dark carpet below; pride wounded. |
| `scene-family-mahjong-red-dragon.webp` | A family den late at night, a square mahjong table under a hanging lamp: the tiles standing in rows with their green backs to us and a gap in one row, a teapot and cups, a dish of melon seeds, and down the hall a bathroom door ajar with a slice of light. Plain dark tiled floor below; lockdown tension. |
| `scene-family-banquet-lobster.webp` | A wedding banquet hall mid-dinner in pink and gold, round tables with floral centrepieces under canopies of fairy lights: the nearest table set and waiting around an empty turntable, a waiter's trolley by the swinging kitchen doors with silver domes and one empty lobster platter garnished with lettuce, and a stage at the back with a flower arch. Plain dark carpet below; hungry and indignant. |
| `scene-family-envelope-old-flame.webp` | A garden-terrace wedding reception late at night as it winds down, violet and amber, lanterns low and a spotlit dance floor under strings of lights: a gift table with a red-and-gold wishing-well box heaped with red envelopes and one very thick envelope on top, half-cleared tables with empty champagne flutes, and rose petals on the dance floor. Plain dark terrace boards below; romantic with a sting. |
| `scene-solo-birthday-call.webp` | A small office high above the city late at night, one desk lamp on and the city lights blurred by rain on the window: a laptop with a blank glowing screen, towers of folders, a cold takeaway coffee, and a blank birthday card propped against the lamp. Plain dark carpet below; lonely and tender. |

## Check

- In `site`: `npx tsx tests/engine.test.ts` (one test checks every name in `DRAWN_ART` is one the game
  uses and has its file), `npx tsc --noEmit`, `npm run build`. If that test turns down a `scene-`
  name, stop and say so in the PR; don't change the test or the game.
- Every file is 1600 × 900 and at most 150 KB, and `DRAWN_ART` gains exactly this card's 17 names.
- Look at them in the game: `npm run dev`, choose 演戏猜坏人 and press 换个剧本 until this card's
  scenes come up, at a phone's width (390) and on the big screen (`/tv/<code>`). At least six,
  among them a spicy one (尺度: 微辣). The figures and their plaques must stay easy to read over the
  picture.
- In the PR: a contact sheet of all 17, small, each with its file name under it, and phone
  screenshots of the ones you played.

## Done when

The 17 files are in `site/public/drama/`, `DRAWN_ART` lists all 17, the checks pass, and the contact
sheet and screenshots are in the PR.

## Send to Codex

```
按 docs/codex-tasks/drama/C3-scenes-family-1.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里贴缩略图。
```
