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
  itself names a file there (C2 did, one function). The vault's code changes only with a
  recorded review by someone who did not write the change (SEC-9), and the stored vault in
  `golden.ts` is never made again. If a card finds them wrong, say what and why in the PR and
  leave the fix to Claude Code.
- Don't touch `package.json`, the lockfile, `.github/`, or another card's files. No new
  dependency: the vault uses the platform's own cryptography and nothing else.
- Tests never use the network.

| Card | What | Files | When |
| --- | --- | --- | --- |
| [C1](C1-vault-second-opinion.md) | A second opinion on the vault's cryptography, from another vendor's model: a reader for the stored format written from the assessment alone, a test that runs it against the code, then a review | `tests/second/vault.ts` (new), `tests/second.test.ts` (new), `docs/moneylens/reviews/vault-second-opinion.md` (new) | merged 2026-11-20 (#692). Verdict: approve. One minor finding, which is C2; one wording note, done in the assessment (0.7) |
| [C2](C2-recovery-bytes-cleanup.md) | The fix for C1's finding: a new recovery code's bytes are cleared when wrapping fails. Codex writes it, Claude Code reviews it (SEC-9) | `src/vault/crypto.ts` (`wrapUnder` only), `tests/wrap-cleanup.test.ts` (new) | merged 2026-11-21 (#727), after a line-by-line review recorded in the PR |
| [C3](C3-sync-second-opinion.md) | A second opinion on the storage layer (records in chunks, merging, sync) before it is merged: a merge written from the assessment alone and run against the code, a run of its own against the store, then a review | `tests/second/merge.ts` (new), `tests/second-sync.test.ts` (new), `docs/moneylens/reviews/sync-second-opinion.md` (new) | merged into the branch 2026-11-21 (#736). Verdict: changes needed, seven findings (one major: pages that never end). All seven dealt with; the table is at the end of the review |
| [C4](C4-sync-second-round.md) | The second round: are the seven findings resolved, did the fixes break anything, and the cache in the browser's storage, which was added since | `docs/moneylens/reviews/sync-second-opinion.md` (first line, and a section at the end), `tests/second-sync.test.ts` if tests are added | merged into the branch 2026-11-25 (#775). Verdict: changes needed. Of the first seven, five resolved, 4 partly, 7 not; four new findings (8 to 11, two of them major). All dealt with; the second table at the end of the review |
| [C5](C5-sync-third-round.md) | The third round: are findings 8 to 11 resolved, and did the fixes break anything | `docs/moneylens/reviews/sync-second-opinion.md` (first line, and a section at the end), `tests/second-sync.test.ts` if tests are added | written 2026-11-25 for the branch's head after the second-round fixes; branch `codex/moneylens-c5-sync-third-round`, into `claude/moneylens-vault-records`. Whether it has gone out, and how, is in the brief |

**Since 2026-11-25 the app is different.** After its update, a task in the app's Work tab cannot
write to the old checkout of the repository, and its shell cannot reach the network (no
`git fetch`, no `npm ci`, and a page on localhost is blocked, so `npm run test:page` stops at the
cache check). It can still read GitHub and open a pull request through the app's own GitHub
connection, which is how C4's branch and #775 got there. C4 got going because Steve was at the
computer and ran, in PowerShell, what Codex asked for: a fresh clone of the branch into the task's
own folder (`C:\Users\OWNER\Documents\Codex\2026-11-25\new-chat\Changle-moneylens-c4-isolated`)
and `npm ci` there. For C5 that clone is reused, and the new commits are handed to it as a git
bundle put into the clone's folder (Claude can write there once Steve allows the folder), so
nobody has to type in a terminal. The effort was also set to Light; C4 and C5 were sent at High,
like the three before.

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

C3's message:

```
本机的 Changle 仓库里别的对话正在干活，所以不要在原来的文件夹里切分支或改文件：只运行 git fetch origin，
然后用 git worktree add 从 origin/claude/moneylens-vault-records（注意：不是 origin/main）开一个新文件夹和新分支 codex/moneylens-c3-sync-second-opinion，只在新文件夹里做。
按 docs/codex-tasks/moneylens/C3-sync-second-opinion.md 做（这个文件只在那个分支上有）。先读 docs/codex-tasks/moneylens/README.md。
卡上「先后顺序」那一节是重点：自己的 merge 写完并单独提交之前，不要打开 tools/moneylens/src/vault/ 里的 records.ts、sync.ts、memory.ts，也不要看它们的测试和那个 PR 的改动。
只加卡上写的三个文件，不要改 src。跑卡上的三条命令都通过后开 PR，PR 的目标分支是 claude/moneylens-vault-records，不是 main；PR 描述里用文字贴测试输出。不要自己开浏览器。
不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥，也不能出现任何真实的财务数据。
```

C4's message:

```
本机的 Changle 仓库里别的对话正在干活，所以不要在原来的文件夹里切分支或改文件：只运行 git fetch origin，
然后用 git worktree add 从 origin/claude/moneylens-vault-records（注意：不是 origin/main）开一个新文件夹和新分支 codex/moneylens-c4-sync-second-round，只在新文件夹里做。
按 docs/codex-tasks/moneylens/C4-sync-second-round.md 做（这个文件只在那个分支上有）。这是你上次那份审查（C3，结论 CHANGES NEEDED，七条发现）的第二轮：看七条是不是真的改好了、改动有没有带出新问题，再审一个后来加进来的文件 tools/moneylens/src/web/idbcache.ts。
只改卡上写的两个文件，不要改 src。卡上的命令都通过后开 PR，PR 的目标分支是 claude/moneylens-vault-records，不是 main；PR 描述里用文字贴测试输出。npm run test:page 会不开窗口地启动本机的 Chrome，这个可以跑；除此之外不要自己开浏览器。
不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥，也不能出现任何真实的财务数据。
```

C5's message (it goes into the same task as C4, so that the clone is reused):

```
第三轮。你上一轮（C4）的四条发现 8 到 11 都改了，改动已经在 claude/moneylens-vault-records 上，你的四个 finding 测试原样打开、全过。
你这个 clone 连不了网，所以我（替 Steve 操作的 Claude）把新提交打成了一个 git bundle，放在 clone 的根目录：moneylens-c5.bundle。在 clone 里运行：
git fetch ./moneylens-c5.bundle claude/moneylens-vault-records
git switch -c codex/moneylens-c5-sync-third-round FETCH_HEAD
然后按 docs/codex-tasks/moneylens/C5-sync-third-round.md 做（fetch 之后才有这个文件）。不用再 npm ci（依赖没变）。npm run test:page 里缓存那一步在你的沙箱里连不了本机地址，照卡上写的办：写明没能跑，以 GitHub Actions 对同一个提交的结果为准，不要让 Steve 跑。
只改卡上写的两个文件，不要改 src。做完用你的 GitHub 连接把分支推上去、开 PR，目标分支是 claude/moneylens-vault-records，不是 main；PR 描述里用文字贴测试输出。不要合并，不要推 main，不要部署；不能出现任何密钥或真实的财务数据。
```
