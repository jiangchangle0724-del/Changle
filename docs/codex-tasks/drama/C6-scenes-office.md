# drama-C6: a set of its own for each office scene

戏精大赏 (Drama Queens) shows a painted set behind the actors. Today every scene borrows its kind's
picture (`kind-office.webp`...) or its community's (`group-jp.webp`...), so a ride on an elevated
train and a hot pot dinner both play in front of the same office party lounge. Cards C2 to C7 give
each of the 131 scenes a set of its own, so the room knows the story the moment the curtain opens.
This card draws the 23 office scenes.

Before you start: the game has to ask for a scene's own picture first (`scene-<id>`, then its
community's, then its kind's), and the picture test has to accept `scene-` names. If `Backdrop` in
`site/src/party/drama/parts.tsx` or that test doesn't yet, stop and say so: that change isn't part
of this card.

## Files

- Add `site/public/drama/scene-<id>.webp` for each of the 23 scenes below (the first column is the
  file name).
- Add each name, `scene-<id>` without `.webp`, to `DRAWN_ART` in `site/src/data/dramaArt.ts`, in the
  table's order (the game only asks for the names listed there, so a picture you haven't drawn yet
  never shows as a broken image).
- Nothing else.

## Every picture

- 1600 × 900, WebP, at most 150 KB (lighter than the first set: there will be 131 of these).
- The same painted look as the first set: open `kind-office.webp`, `kind-family.webp` and
  `stage.webp` first, and the community pictures (`group-*.webp`). Warm theatrical light, rich
  colour, soft painted detail, seen straight on like a stage set.
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
- No words, letters or numbers anywhere: signs, screens, notes, receipts, slips, name plates,
  jerseys, clocks and cards stay blank, show plain colour or face away. No logos or brands, no
  flags, no famous landmark you could name, no religious symbol as the focus. A real brand or place
  in a setup becomes a generic one (a warehouse store, a ski village, an elevated train car, a night
  market).
- Everyday and warm: the way people from there would recognise a home, a festival or a park of their
  own, not a tourist poster. Nothing that makes fun of anyone.
- Night colours: the site is dark. No big areas of white or pale sky; paper and screens stay dim,
  and a daytime scene is lit low and warm (late sun, lamps on, rain on the window).
- Each set looks clearly different from the others on this card, from the first set and from the
  community pictures: another place, palette or time of day. Where scenes share a kind of place
  (four break rooms and pantries, two party stages, several open offices), the table gives each its
  own corner, season or light; keep them apart.

## The pictures

| File | What it shows |
| --- | --- |
| `scene-office-missing-bonus.webp` | An open-plan office an hour before the year-end party, red and gold streamers and balloons half hung and city lights in the windows: a decorated box of red bonus envelopes on a desk with an obvious gap at the front, party hats on the chairs, a tray of champagne flutes, and a clipboard with a blank checklist. Plain dark carpet below; festive turned frosty. |
| `scene-office-party-speech.webp` | A hotel ballroom stage at the year-end party rehearsal, house lights low and one cool blue spotlight: a lectern with a microphone, a teleprompter glass glowing blank in front of it, a control tablet on a stand, and a blank backdrop wall hung with balloon garlands over rows of empty chairs. Plain dark stage floor below; rehearsal nerves. |
| `scene-office-remote-beach.webp` | A meeting room on a rainy afternoon, rain running down the windows over a grey-blue city and the lamps on: the big wall screen glowing a plain sea-turquoise, a conference speaker and three laptops with blank glowing screens, headsets, and a potted palm in the corner. Plain dark carpet below; gloomy with a strange holiday glow. |
| `scene-office-fridge-label.webp` | An office kitchenette after lunch, flat fluorescent light and a warm under-cabinet glow: a fridge with a blank yellow sticky note on its door, an empty food container with its lid off on the counter, a pair of chopsticks, a microwave, and a row of mugs. Plain dark floor below; a petty mystery. |
| `scene-office-promotion-toast.webp` | An office lounge set for a promotion party in the evening, glass walls over city lights: a projector screen glowing a soft blank blue, a tray of champagne flutes, a cake, a bunch of gold balloons, and two identical bouquets on the table. Plain dark floor below; an awkward celebration. |
| `scene-office-secret-reference.webp` | The office's printer corner at night, a big copier glowing green and one desk lamp: a single blank printed letter waiting in the output tray, an open laptop with a blank screen, a pinboard of blank notices, and stacks of paper reams. Plain dark floor below; a cold war by the copier. |
| `scene-office-expense-yacht.webp` | A finance office corner in late afternoon, blinds half down with gold light through them: a desk heaped with blank expense receipts, a glossy yacht brochure (picture only) on top, a desk phone with its line light blinking, and a stack of boxed lunches on the cabinet. Plain dark carpet below; a fancy surprise in dull paperwork. |
| `scene-office-boardroom-earring.webp` | A boardroom early on Monday morning, cool blue light through the blinds and the city waking outside: a long polished table with chairs pushed back, a single sparkling earring beside a blank pink sticky note, two coffee cups left from last night, and a whiteboard wiped clean. Plain dark carpet below; scandal before coffee. |
| `scene-office-money-tree.webp` | An office reception area in the evening, warm lamps and a deep red feature wall: a braided money tree in a big glazed pot, its leaves all gone yellow and drooping, a watering can beside it, a reception desk with a bell, and a key rack by the door. Plain dark floor below; mourning a plant. |
| `scene-office-skytrain-laptop.webp` | Inside an elevated train car at dusk, nearly empty, the city's lights sliding past the windows: blue seats, steel poles and hand straps, an unzipped empty laptop sleeve left on a seat, a folder of blank client papers, and closed doors. Plain dark car floor below; a sinking feeling. |
| `scene-office-recalled-message.webp` | An open-plan office on a grey late afternoon, desk lamps on: rows of desks with monitors glowing blank, a phone face up on the nearest desk with a blank lit screen, the boss's glass office with its blinds half drawn, and a wall screen glowing plain blue. Plain dark carpet below; everyone pretending to work. |
| `scene-office-hot-pot-both-spicy.webp` | A hot pot restaurant's private room at night, steam and red lanterns: a split yin-yang pot where both halves bubble bright red, plates of thin-sliced meat and greens, an empty foil soup-base packet (no print) beside it, a place set for the guest of honour, and glasses of iced water. Plain dark floor below; steaming dread. |
| `scene-office-printer-cats.webp` | An office just after dawn, the lights still off and the windows deep blue: the copier still spitting out pages, hundreds of identical prints tinted blue in the gloom and piled on the copier, desks and chairs, each with the same small cat photo too small to make out from here, an empty paper tray pulled out, and a coffee maker just switched on. Plain dark carpet below with no paper on it; absurd. |
| `scene-office-secret-santa-mugs.webp` | An office break room at the Christmas party, tinsel and a small tree in red and green: a pair of matching mugs printed with red hearts on the table, torn wrapping paper and ribbon, a pile of opened gifts, and an empty cake stand with a cake knife beside it. Plain dark floor below; giggly and scandalised. |
| `scene-office-salary-sheet-leak.webp` | A glass-walled team room late at night, monitors glowing blank and one desk lamp: a spreadsheet printout of neat empty rows on the table, a paper shredder, three desks with blank name plates, and a glossy recruiting folder (no logo) on a chair. Plain dark carpet below; paranoid. |
| `scene-solo-job-interview.webp` | A big company's interview room high in a tower at dusk, glass walls over city lights: a long table with three empty panel chairs, water glasses and a blank résumé laid in front of them, and one chair facing the table alone. Plain dark carpet below; high stakes. |
| `scene-solo-ceo-press.webp` | A press conference room under one hard spotlight: a podium bristling with microphones (no logos) before a plain dark backdrop wall, a glass of water on the podium, cameras on tripods, and rows of empty chairs. Plain dark floor below; cornered. |
| `scene-office-potluck-chili.webp` | An office cafeteria decorated for a potluck at lunchtime, paper garlands and warm lamps: a long table of homemade dishes, a slow cooker of chili with a ladle and three empty water glasses beside it, a small empty hot-sauce bottle (no label) among the dishes, and a box for the best-dish vote. Plain dark floor below; cheerful, with fire. |
| `scene-office-raffle-rigged.webp` | A banquet hall at the office holiday party's finale, gold spotlights and falling confetti: a shiny e-bike with a big red bow on the stage, a clear raffle box full of folded blank slips, an MC's microphone stand, and balloon arches over round tables in the dark. Plain dark floor below; suspense turning to outrage. |
| `scene-ca-hockey-pool.webp` | An office break room on a playoff evening in red and blue light: a TV on the wall glowing blank, a pool sheet pinned to a corkboard (a grid of blank boxes), a hockey stick and a jersey with no numbers or logos on a coat hook, and a box of doughnuts. Plain dark floor below; friendly rivalry. |
| `scene-kr-hoesik-card.webp` | A Korean barbecue restaurant at night, warm orange light and round metal hoods over the tables: a grill sizzling with pork belly, a spread of small side dishes, green glass bottles without labels, metal chopsticks, tongs and scissors, and low stools. Plain dark floor below; jolly and awkward. |
| `scene-jp-hanami-bento.webp` | A riverside path under cherry trees in late afternoon, deep pink blossom thick overhead hiding the sky and lanterns not yet lit: a big blue tarp held down with stones, an empty lacquered bento box with its lid off and chopsticks across it, a thermos and paper cups, and a small dango cart with a plain cloth curtain. Plain dark grass in shadow below; a spring picnic with a mystery. |
| `scene-jp-omiyage-box.webp` | A Japanese office pantry at three on a winter afternoon, dusky outside and warm lamps on: an open box of souvenir sweets with neat rows of empty paper cups, folded wrapping paper with patterns only, a kettle, and a row of tea cups on a wooden tray. Plain dark floor below; polite outrage. |

## Check

- In `site`: `npx tsx tests/engine.test.ts` (one test checks every name in `DRAWN_ART` is one the game
  uses and has its file), `npx tsc --noEmit`, `npm run build`. If that test turns down a `scene-`
  name, stop and say so in the PR; don't change the test or the game.
- Every file is 1600 × 900 and at most 150 KB, and `DRAWN_ART` gains exactly this card's 23 names.
- Look at them in the game: `npm run dev`, choose 演戏猜坏人 and press 换个剧本 until this card's
  scenes come up, at a phone's width (390) and on the big screen (`/tv/<code>`). At least six,
  among them a spicy one (尺度: 微辣) and a community's (日本, 韩国 or 加拿大本地 under 剧本背景).
  The figures and their plaques must stay easy to read over the picture.
- In the PR: a contact sheet of all 23, small, each with its file name under it, and phone
  screenshots of the ones you played.

## Done when

The 23 files are in `site/public/drama/`, `DRAWN_ART` lists all 23, the checks pass, and the contact
sheet and screenshots are in the PR.

## Send to Codex

```
按 docs/codex-tasks/drama/C6-scenes-office.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里贴缩略图。
```
