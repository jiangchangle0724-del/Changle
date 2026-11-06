# drama-C1: nine backdrops for famous scenes and the community stories

戏精大赏 (Drama Queens) shows a painted set behind the actors. The first set is in
`site/public/drama/` (`kind-family.webp`, `kind-love.webp`, `kind-office.webp`, `kind-crime.webp`,
`kind-palace.webp`, `kind-show.webp`, `pk.webp`, `stage.webp`). Two new parts of the game have no
picture of their own yet and borrow those: 名场面 (famous film and TV scenes) and the scenes set in
one community's everyday life (the host picks Chinese, Canadian, South Asian, Filipino, Korean,
Japanese, Iranian or European stories). This card draws them a set each.

## Files

- Add `site/public/drama/classic.webp` and `site/public/drama/group-cn.webp`, `group-ca.webp`,
  `group-sa.webp`, `group-ph.webp`, `group-kr.webp`, `group-jp.webp`, `group-ir.webp`, `group-eu.webp`.
- Add each name to `DRAWN_ART` in `site/src/data/dramaArt.ts` (the game only asks for the names
  listed there, so a picture you haven't drawn yet never shows as a broken image).
- Nothing else.

## Every picture

- 1600 × 900, WebP, at most 180 KB (the first set is 83 to 167 KB).
- The same painted look as the first set: open `kind-family.webp`, `kind-love.webp` and `stage.webp`
  first. Warm theatrical light, rich colour, soft painted detail, seen straight on like a stage set.
- An empty set: no people, no faces, no animals as the subject. The game stands its own figures and
  their name plaques along the bottom third, so keep that third simple and darker (a floor, a carpet,
  grass) and put the interest in the middle and the top.
- No words, letters or numbers anywhere (signs, screens, packets), no logos or brands, no flags, no
  famous landmark you could name, no religious symbol as the focus.
- Everyday and warm: the way people from there would recognise a home, a festival or a park of
  their own, not a tourist poster. Nothing that makes fun of anyone.
- Night colours: the site is dark. No big areas of white or pale sky.

## The pictures

| File | What it shows |
| --- | --- |
| `classic.webp` | 名场面: a film set at night. A vintage film camera on a dolly, a director's chair, a blank clapperboard, studio lights on stands, a red velvet curtain behind, a soundstage floor. A set in general, not any one film. |
| `group-cn.webp` | A Chinese family's apartment living room in the evening: a round dining table set with dishes, a sofa, a big window with city lights, a few red paper lanterns up for a festival. |
| `group-ca.webp` | Inside a lakeside cottage at dusk: wooden walls, a fireplace, a canoe paddle and a hockey stick by the door, big windows onto a lake with pine trees and the first snow. |
| `group-sa.webp` | A South Asian family home ready for a celebration at night: strings of marigolds, small clay oil lamps (diyas), fairy lights, bright cushions, a low table with sweets. |
| `group-ph.webp` | A Filipino family home at Christmas: a glowing star lantern (parol) in the window, string lights, a long table set for the family dinner. |
| `group-kr.webp` | A Korean family's apartment at Chuseok: a low table with plates of food, floor cushions, a window onto apartment towers and a full moon. |
| `group-jp.webp` | A park in Japan in spring at dusk: cherry trees in bloom, paper lanterns, a picnic tarp on the grass. |
| `group-ir.webp` | An Iranian family's living room at Nowruz: Persian carpets, a low table with a haft-sin spread (sprouted wheat, apples, coins, a goldfish bowl, candles, a mirror), spring blossom outside the window. |
| `group-eu.webp` | A European town square on a winter night: wooden Christmas-market stalls with string lights, cobblestones, old houses with lit windows. |

## Check

- In `site`: `npx tsx tests/engine.test.ts` (one test checks every name in `DRAWN_ART` is one the
  game uses and has its file), `npx tsc --noEmit`, `npm run build`.
- Look at each one in the game: `npm run dev`, play a scene of that group (setup, then 剧本背景) or a
  famous scene (setup, then 名场面), at a phone's width (390) and on the big screen (`/tv/<code>`).
  The figures and their plaques must stay easy to read over the picture.
- In the PR: a contact sheet of the nine, small, and one phone screenshot with each picture behind
  the cast.

## Done when

The nine files are in `site/public/drama/`, `DRAWN_ART` lists all nine, the checks pass, and the
pictures and screenshots are in the PR.
