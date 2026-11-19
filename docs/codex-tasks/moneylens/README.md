# Task cards for Codex: MoneyLens (`tools/moneylens`)

One card, one branch, one PR. Each card names the only files to add or change, what it starts
from, the test, the command and when it's done. The requirements are `docs/moneylens.md` and the
chat's brief is `docs/briefs/moneylens.md`; a card says which parts of them it needs.

MoneyLens is a personal finance organizer: statement files from a bank's own website are read in
the browser, and what is kept is encrypted there before it leaves the device. Nothing is live.

Always:
- Node 22, in `tools/moneylens`: `npm ci`, then the card's command, then `npm run typecheck` and
  `npm test` (everything) before the PR. Paste the output into the PR.
- **No real financial data, anywhere** (SEC-12): not in a fixture, a test, a screenshot, a PR or
  a prompt. Every sample is invented, and says so.
- Don't touch `tools/moneylens/src/vault/` or `tools/moneylens/tests/golden.ts`. The vault's code
  changes only with a recorded review by someone who did not write the change (SEC-9), and the
  stored vault in `golden.ts` is never made again. If a card finds them wrong, say what and why
  in the PR and leave the fix to Claude Code.
- Don't touch `package.json`, the lockfile, `.github/`, or another card's files. No new
  dependency: the vault uses the platform's own cryptography and nothing else.
- Tests never use the network.

| Card | What | Files | When |
| --- | --- | --- | --- |
| [C1](C1-vault-second-opinion.md) | A second opinion on the vault's cryptography, from another vendor's model: a reader for the stored format written from the assessment alone, a test that runs it against the code, then a review | `tests/second/vault.ts` (new), `tests/second.test.ts` (new), `docs/moneylens/reviews/vault-second-opinion.md` (new) | not sent yet |

What to send Codex, one card at a time:

```
按 docs/codex-tasks/moneylens/C1-vault-second-opinion.md 做。先读 docs/codex-tasks/moneylens/README.md。
卡上「先后顺序」那一节是重点：自己的读取器写完并单独提交之前，不要打开 tools/moneylens/src/vault/ 里的任何文件。
只加卡上写的三个文件，跑卡上的命令，PR 描述里贴测试输出。
```
