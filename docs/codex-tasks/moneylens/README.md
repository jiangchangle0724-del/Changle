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
- Don't touch `tools/moneylens/src/vault/` or `tools/moneylens/tests/golden.ts`, unless the card
  itself names a file there (C2 does, one function). The vault's code changes only with a
  recorded review by someone who did not write the change (SEC-9), and the stored vault in
  `golden.ts` is never made again. If a card finds them wrong, say what and why in the PR and
  leave the fix to Claude Code.
- Don't touch `package.json`, the lockfile, `.github/`, or another card's files. No new
  dependency: the vault uses the platform's own cryptography and nothing else.
- Tests never use the network.

| Card | What | Files | When |
| --- | --- | --- | --- |
| [C1](C1-vault-second-opinion.md) | A second opinion on the vault's cryptography, from another vendor's model: a reader for the stored format written from the assessment alone, a test that runs it against the code, then a review | `tests/second/vault.ts` (new), `tests/second.test.ts` (new), `docs/moneylens/reviews/vault-second-opinion.md` (new) | merged 2026-11-20 (#692). Verdict: approve. One minor finding, which is C2; one wording note, done in the assessment (0.7) |
| [C2](C2-recovery-bytes-cleanup.md) | The fix for C1's finding: a new recovery code's bytes are cleared when wrapping fails. Codex writes it, Claude Code reviews it (SEC-9) | `src/vault/crypto.ts` (`wrapUnder` only), `tests/wrap-cleanup.test.ts` (new) | sent 2026-11-20, branch `codex/moneylens-c2-recovery-bytes-cleanup` |

What to send Codex, one card at a time (C1's message; for another card change the branch, the card's file and the line about what matters most):

```
本机的 Changle 仓库里别的对话正在干活，所以不要在原来的文件夹里切分支或改文件：只运行 git fetch origin，
然后用 git worktree add 从 origin/main 开一个新文件夹和新分支 codex/moneylens-c1-vault-second-opinion，只在新文件夹里做。
按 docs/codex-tasks/moneylens/C1-vault-second-opinion.md 做。先读 docs/codex-tasks/moneylens/README.md。
卡上「先后顺序」那一节是重点：自己的读取器写完并单独提交之前，不要打开 tools/moneylens/src/vault/ 里的任何文件。
只加卡上写的三个文件，跑卡上的命令都通过后再开 PR，PR 描述里用文字贴测试输出。不要自己开浏览器。
不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥，也不能出现任何真实的财务数据。
```

C2's message:

```
本机的 Changle 仓库里别的对话正在干活，所以不要在原来的文件夹里切分支或改文件：只运行 git fetch origin，
然后用 git worktree add 从 origin/main 开一个新文件夹和新分支 codex/moneylens-c2-recovery-bytes-cleanup，只在新文件夹里做。
按 docs/codex-tasks/moneylens/C2-recovery-bytes-cleanup.md 做。先读 docs/codex-tasks/moneylens/README.md。
这张卡修的是你上一张卡（C1）自己发现的那个问题：只改 tools/moneylens/src/vault/crypto.ts 里的 wrapUnder 一个函数，加一个新测试文件，别的都不动；存下来的格式不能变，tests/golden.ts 不能动。
先在没改的代码上跑新测试，确认卡上第 1 到 3 条会失败，再改，改完全过。卡上的三条命令都通过后再开 PR，PR 描述里用文字贴改前和改后的测试输出。不要自己开浏览器。
不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥，也不能出现任何真实的财务数据。
```
