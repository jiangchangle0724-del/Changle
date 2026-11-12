# Task cards for Codex: 戏精大赏 · Drama Queens (`site/src/party/drama/`)

One card, one branch, one PR. Each card names the only files to change, what it starts from, how to
check it and when it's done. The game's own notes are in `docs/briefs/drama.md`.

Always:
- Node 22, in `site`: `npm ci`, then the card's checks. `npx tsc --noEmit`, `npx tsx tests/engine.test.ts`
  and `npm run build` pass before the PR. Paste the output into the PR. Don't open a browser or
  attach pictures (on C2 that cost hours): the reviewing chat makes the contact sheet from the branch
  and plays the scenes itself.
- Everything a player reads exists in Chinese and English. No keys, secrets or tokens anywhere.
- Don't touch the rules (`site/src/shared/`), `site/worker/`, other games or another card's files. If
  a card seems to need one of them, say so in the PR.

| Card | What | Files |
| --- | --- | --- |
| [drama-C1](C1-art.md) | Nine backdrops: the film set for famous scenes, and one for each community's stories (done, #271) | `site/public/drama/`, `site/src/data/dramaArt.ts` |
| [drama-C2](C2-scenes-crime-palace.md) | A set of its own for each of the 33 crime and palace scenes (done, #388) | `site/public/drama/scene-*.webp`, `site/src/data/dramaArt.ts` |
| [drama-C3](C3-scenes-family-1.md) | The same for the first 17 family scenes (done, #390) | the same |
| [drama-C4](C4-scenes-family-2.md) | The same for the other 16 family scenes (done, #393) | the same |
| [drama-C5](C5-scenes-love.md) | The same for the 20 love scenes (done, #395) | the same |
| [drama-C6](C6-scenes-office.md) | The same for the 23 office scenes (done, #398) | the same |
| [drama-C7](C7-scenes-show.md) | The same for the 22 show scenes | the same |

C2 to C7 need the game to ask for `scene-<id>` first; it does once the PR that brought these cards is
merged. They all add names to `DRAWN_ART`, so send them one at a time: the next once the last is
merged. Each card ends with what to send.

What to send Codex for C1 (done):

```
按 docs/codex-tasks/drama/C1-art.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。
只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里贴图和截图。
```
