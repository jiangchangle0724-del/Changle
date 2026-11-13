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
| [C4](C4-copy.md) | The words people paste into the group chat: invitation, nudge, result; three tones, two languages | `tools/when/src/engine/copy.ts`, its test | at A3; the card is checked against the finished A2 first |
| [C5](C5-browser-tests.md) | Phones in browsers: two to eight filling in at once, a dropped connection, WeChat, small and large screens | `tools/when/tests/e2e/` | at A3; the card is checked against the finished A2 first |

What to send Codex, one card at a time:

```
按 docs/codex-tasks/when/C2-calendar.md 做。先读 docs/codex-tasks/when/README.md 和 tools/when/src/engine/types.ts。
只改卡上写的文件和测试，跑卡上的命令通过后再开 PR，PR 描述里贴测试输出。
```
