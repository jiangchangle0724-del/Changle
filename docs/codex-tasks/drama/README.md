# Task cards for Codex: 戏精大赏 · Drama Queens (`site/src/party/drama/`)

One card, one branch, one PR. Each card names the only files to change, what it starts from, how to
check it and when it's done. The game's own notes are in `docs/briefs/drama.md`.

Always:
- Node 22, in `site`: `npm ci`, then the card's checks. `npx tsc --noEmit`, `npx tsx tests/engine.test.ts`
  and `npm run build` pass before the PR. Paste the output into the PR, with the pictures and
  screenshots the card asks for.
- Everything a player reads exists in Chinese and English. No keys, secrets or tokens anywhere.
- Don't touch the rules (`site/src/shared/`), `site/worker/`, other games or another card's files. If
  a card seems to need one of them, say so in the PR.

| Card | What | Files |
| --- | --- | --- |
| [drama-C1](C1-art.md) | Nine backdrops: the film set for famous scenes, and one for each community's stories (done, #271) | `site/public/drama/`, `site/src/data/dramaArt.ts` |

What to send Codex:

```
按 docs/codex-tasks/drama/C1-art.md 做。先看 site/public/drama/ 里原来的图，照同样的画风画。
只加卡上写的图片和 site/src/data/dramaArt.ts 里的名字，跑卡上的检查，通过后再开 PR，PR 里贴图和截图。
```
