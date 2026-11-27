# drama-C9: 新手 scripts for the 23 easy all-ages scenes

戏精大赏 (Drama Queens) has three levels since Nov 26: 新手 (Beginner), 进阶 (Regular), 高手 (Expert).
On 新手 every actor gets a script, the way a 剧本杀 character book or a murder-mystery party kit tells
each guest what to do and say in each round: one thing to keep doing the whole scene, and for each
of the scene's four steps a line to say and one to throw at someone else. During the scene their
phone shows the step's lines like a prompter. Scenes with a script are played first on 新手; the
others fall back to the hints. The scripts live in `site/src/data/dramaScripts.ts`: ten scenes are
done there and are the model to follow. This card writes the scripts for the 23 easy all-ages
scenes below.

## Files

- Add one entry to `SCRIPTS` in `site/src/data/dramaScripts.ts` for each scene below, after the
  existing ones, in the table's order.
- Nothing else.

## Before writing a scene

Read the scene in `site/src/data/drama.ts` (or `dramaCasts.ts`): its setup, each role's `brief` and
`alibi` (the innocent's little secret), `culprit`, `culpritCard`, `twist`, and for a monologue its
three `secrets` (the actor's real one is the first). Then its guide in `site/src/data/dramaGuide.ts`:
the four `beats` and each role's `play` and `first`. Then read all ten finished scripts again.

## Every script

1. One `r(trait, s(say, ask), s(say, ask), s(say, ask), s(say, ask))` per role, in the scene's role
   order. The four steps follow the guide's four beats, in order.
2. `trait`: one catchphrase or one gesture the actor keeps doing the whole scene. Concrete, easy,
   funny. Build it from the role's `play` in the guide.
3. `say`: what this role says at that step, as speech (no quote marks: the game adds them). `ask`:
   a question or a challenge thrown at another role by name, or at the room, so the scene never
   stalls. Stage directions go in brackets, short: （清嗓子） / (clear your throat).
4. Step 1: who you are and your reaction to what just happened. Step 2: the beat's questioning;
   give the role a concrete detail of their own (where they were, what they saw) and a pointed
   question. Step 3: react to the twist, which lands at half time. Step 4: what the fourth beat
   asks for (a last plea, a song, a vote, a toast...).
5. Short and spoken: at most 50 Chinese characters a line (most are 15 to 35), the English at most
   about 150 characters. Simple words. A first-timer reads it off a phone in the middle of a scene.
6. Any role can turn out to be the culprit. No role's lines confess, and none clears or convicts
   anyone for certain. A role may hint at its own little secret (its `alibi`) but never says it.
7. `culprit`: two things for the culprit, the first for step 2 and the second for step 3, written
   to work whoever it turns out to be ("point at whoever's next to you", never a role's name). One
   deflects or blames; one is a tell or a cover-up taken from `culpritCard`. In a monologue: the two
   moves from the culprit card that let the real secret slip, and the cover that hides it.
8. A role past the scene's `min` may not be on stage. A role within `min` never names one past it
   (a test checks the Chinese names). Roles join in order, so a later role may name earlier ones.
9. Written for two audiences, not translated: the English is what an English speaker in Vancouver
   would say (dollars, local places, their own jokes), the Chinese what a Chinese speaker would say.
10. Your own writing: don't copy lines from published scripts, films, shows or 剧本杀 books.

## Scenes (23 scenes, 74 roles)

| id | 剧本 | Roles |
| --- | --- | --- |
| `love-proposal-subtitles` | 求婚字幕跑偏了 | 3 |
| `love-noodle-review` | 爱心便当的一星差评 | 2 |
| `office-party-speech` | 老板致辞变脱口秀 | 3 |
| `office-fridge-label` | 冰箱里的升职通知 | 2 |
| `crime-museum-squeak` | 展柜里的鸭子叫了 | 3 |
| `palace-dragon-robe` | 龙袍缩水三寸 | 2 |
| `palace-lantern-wish` | 许愿灯挂反了 | 3 |
| `show-talent-mute` | 冠军麦克风只会放屁声 | 2 |
| `show-pet-finalist` | 萌宠冠军是一只拖鞋 | 3 |
| `family-banquet-lobster` | 八号桌的龙虾 | 3 |
| `show-magic-rabbit` | 兔子真的变没了 | 3 |
| `love-three-blind-dates` | 相亲来了三个人 | 3 |
| `palace-dowager-cricket` | 太后的蛐蛐跑了 | 3 |
| `solo-best-man-speech` | 伴郎的致辞 | 1 |
| `solo-live-workout` | 早上七点的直播健身课 | 1 |
| `solo-royal-decree` | 宣读圣旨 | 1 |
| `solo-parents-evening` | 家长会上的发言 | 1 |
| `solo-night-guard` | 夜班保安的报告 | 1 |
| `love-wedding-rings` | 婚礼当天的戒指 | 6 (at least 4) |
| `office-potluck-chili` | 百家宴上的那锅汤 | 6 (at least 4) |
| `show-karaoke-skip` | KTV 里被切掉的歌 | 6 (at least 4) |
| `family-building-blackout` | 停电的那一晚 | 8 (at least 5) |
| `show-final-envelope` | 总决赛的信封 | 8 (at least 5) |

## Check

In `site`: `npm ci`, then `npx tsc --noEmit`, `npx tsx tests/engine.test.ts` (its 新手 scripts test
checks every script: one per role, four steps, both languages, the length, the names past `min`)
and `npm run build`. Paste the output into the PR.

## Done when

All 23 scenes have a script, the checks pass, and the PR lists the scenes and the checks' results.

## Send to Codex

```
先把本机的 Changle 仓库更新到最新的 main，再从 main 开分支 codex/drama-c9-scripts。按 docs/codex-tasks/drama/C9-scripts-all-ages.md 做：先读 site/src/data/dramaScripts.ts 里已经写好的 10 个台词本，照同样的写法，给卡上的 23 个剧本写台词本。只改 site/src/data/dramaScripts.ts，跑卡上的检查，通过后开 PR，PR 里用文字写改了哪些剧本和检查结果。不用开浏览器。不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥。
```
