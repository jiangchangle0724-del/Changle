# Task cards for Codex: 两清 · All Square (`site/src/split`)

One card, one branch, one PR. Each card names the only files to change, what it starts from, the
test, the command and when it's done. The plan behind them is `docs/split.md` and the chat's brief
is `docs/briefs/split.md`; you don't need either for a card.

两清 splits a group's bills: who paid what, who owes whom, and the fewest transfers to square up.
Its screens live inside the site (changle.ca/split, `site/src/split/`); its arithmetic is
`site/src/split/core/`, plain TypeScript that the phone and (later) the server both run.

Always:
- Node 22, in `site/`: `npm ci`, then the card's command, then before the PR every step CI runs
  (`.github/workflows/site.yml`: `npx tsc --noEmit`, each `tests/*.test.ts` it lists, `npm run
  build`, `npx tsx scripts/budget.ts`). Paste the output into the PR.
- Money is a whole number of the currency's smallest unit (cents; one yen for yen). No fractions,
  no floating-point money, anywhere.
- Don't touch `site/src/split/core/` (the arithmetic: if a card finds it wrong, say what and why in
  the PR and leave the fix to Claude Code), `site/worker/`, any wrangler config or secret, or
  another card's files.
- Everything a person reads exists in Chinese and English. Short and plain: the site's voice, no
  exclamation marks.
- Tests never use the network.

| Card | What | Files |
| --- | --- | --- |
| [C1](C1-second-opinion.md) | A second, independent implementation of the arithmetic, and a test that runs both over the same 10,000 ledgers | `site/tests/split/second.ts` (new), `site/tests/split-second.test.ts` (new) |

The cards for the screens (the other states of each screen, the words in both languages, CSV, the
picture to share, screenshots) are written once the three sample screens are in `main`.

What to send Codex, one card at a time:

```
按 docs/codex-tasks/split/C1-second-opinion.md 做。先读 docs/codex-tasks/split/README.md。
只改卡上写的文件，跑卡上的命令通过后再开 PR，PR 里贴上测试输出。
```
