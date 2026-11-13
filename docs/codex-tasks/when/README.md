# Task cards for Codex: 约时间 · When Works (`tools/when/`)

One card, one branch, one PR. Each card names the only files to change, what it starts from, the
command and when it's done. The tool's own notes are in `docs/briefs/when.md`; the plan behind them
is `docs/when.md` (you don't need it for a card).

The cards need `tools/when/` to exist: none of them can start before the first A1 PR (the folder,
its `package.json`, `src/engine/types.ts`, `slots.ts` and `time.ts`) is merged into `main`. The
chat that owns this tool (工具 · 约时间) says when, and reviews every PR.

Always:
- Node 22, in `tools/when`: `npm ci`, then the card's command, then `npm run typecheck` and
  `npm test` (everything) before the PR. Paste the output into the PR.
- No browser and no uploads: don't open a browser to try the tool, and don't attach pictures or
  anything else to the PR (on another area's cards that left Codex waiting for hours on an approval
  nobody was there to give). Pictures are files on the branch, where the reviewing chat looks at
  them. In the PR, write results as text. Looking a fact up with Codex's own web search is fine
  (C3 asks for it).
- Each card works in its own folder and on its own branch (`git worktree`), so two cards running
  at once never share a working copy.
- Only the files the card names. Don't touch `wrangler.jsonc`, `package.json`, `src/room/`,
  `src/server/`, `site/`, or another card's files. If a card seems to need one of them, say so in
  the PR instead.
- Everything a person reads exists in Chinese and English. No keys, secrets or tokens anywhere.
- Tests never use the network.
- Vancouver time is UTC-7 all year (B.C. stopped changing its clocks on 8 March 2026, and every
  date in this tool is after that). Take it from `src/engine/time.ts`, never from the device's or
  the runtime's time-zone table: some still say UTC-8 in winter.
- A day is a string, `"2026-11-21"`: a Vancouver calendar day. A part of a day is `"am"`, `"pm"`,
  `"eve"` or `"day"` (the whole day), as in `src/engine/types.ts`.

| Card | What | Files | When |
| --- | --- | --- | --- |
| [C1](C1-art.md) | Four pictures: the home page, the empty state, the backgrounds of the invitation and the result | `tools/when/src/client/art/`, `LICENSES.md` | with A1, once the folder is on `main` |
| [C2](C2-calendar.md) | Add to calendar: an .ics file and a Google Calendar link | `tools/when/src/engine/ics.ts`, its test | with A1, once the folder is on `main` |
| [C3](C3-holidays.md) | B.C. statutory holidays, long weekends and festivals, November 2026 to 2028 | `tools/when/src/engine/holidays.ts`, its test | with A1, once the folder is on `main` |
| [C4](C4-copy.md) | The words people paste into the group chat: invitation, nudge, result; three tones, two languages | `tools/when/src/engine/copy.ts`, its test | ready: checked against the finished A2 on 2026-11-13 |
| [C5](C5-browser-tests.md) | Phones in browsers: two to eight filling in at once, a dropped connection, WeChat, small and large screens | `tools/when/tests/e2e/` | ready: checked against the finished A2 on 2026-11-13 |

What to send Codex: a new conversation for each card (on Steve's computer, in Codex's local mode),
with the card's own file and branch name in it. C1, C2 and C3 change different files and can run
at the same time; so can C4 and C5.

```
本机的 Changle 仓库里别的对话正在干活，所以不要在原来的文件夹里切分支或改文件：只运行 git fetch origin，然后用 git worktree add 从 origin/main 开一个新文件夹和新分支 codex/when-c2-calendar，只在新文件夹里做。
按 docs/codex-tasks/when/C2-calendar.md 做。先读 docs/codex-tasks/when/README.md 和 tools/when/src/engine/types.ts。只改卡上写的文件和测试，跑卡上的命令通过后再开 PR，PR 描述里用文字贴测试输出。不用开浏览器，也不要往 PR 里传图片。
不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥。
```

The branches: `codex/when-c1-art`, `codex/when-c2-calendar`, `codex/when-c3-holidays`,
`codex/when-c4-copy`, `codex/when-c5-browser-tests`. For C1 the middle line is: 按
docs/codex-tasks/when/C1-art.md 做。先读 docs/codex-tasks/when/README.md。只加卡上写的文件，照卡上的检查做完再开
PR，PR 描述里用文字写四个文件的尺寸和大小。不用开浏览器，也不要往 PR 里传图片。 For C3, after
"用文字贴测试输出。": 卡上要查的日期用你自带的联网搜索去官方网页查，不要凭记忆写；不要往 PR 里传图片。
