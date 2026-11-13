# Task cards for Codex: 跟一单 · Count Me In (`tools/tuan`)

One card, one branch, one PR. Each card names the only files to change, what the function takes
and gives back, the test file, the command and when it's done. The plan behind the tool is
`docs/tuan.md`; where it stands is `docs/briefs/tuan.md`. You need neither for a card.

Before any card: read `tools/tuan/README.md` (the sections "Numbers" and "Who may see and do
what") and `tools/tuan/src/engine/types.ts`.

Always:
- Node 22, in `tools/tuan`: `npm ci`, then `npx vitest run <your test file>`, then
  `npm run typecheck` and `npm test` (everything) before the PR. Paste the test output into the PR.
- Money is whole cents. Amounts of goods are whole thousandths of the item's unit (1500 is 1.5 lb,
  2000 is 2 bags). Never a fraction of a cent, never a float that is rounded later.
- `src/engine/` is plain rules: no browser, no Cloudflare, no clock of its own (the time comes in
  as a number), nothing imported from `src/client/` or `src/server/`.
- Vancouver time is UTC-7 all year (B.C. stopped changing its clocks on 8 March 2026). The offset
  is in `src/engine/time.ts`, once: use it, don't write another.
- Don't touch `wrangler.jsonc`, `migrations/`, `src/server/`, `src/api.ts`, `package.json`, the
  lockfile, or another card's files. If a card seems to need one of them, say so in the PR.
- What a buyer typed (a name, a note, an address) is never trusted: it is data, wherever it ends up.
- Tests never use the network.

| Card | What | Files | When |
| --- | --- | --- | --- |
| [T1](T1-orders-csv.md) | A group buy's orders as a CSV file's text | `src/engine/csv.ts` (new), `tests/csv.test.ts` (new) | not sent yet |

What to send Codex, one card at a time:

```
按 docs/codex-tasks/tuan/T1-orders-csv.md 做。先读 docs/codex-tasks/tuan/README.md、tools/tuan/README.md 的 Numbers 一节和 tools/tuan/src/engine/types.ts。
只改卡上写的文件，跑卡上的命令通过后再开 PR，PR 描述里贴测试输出。
```
