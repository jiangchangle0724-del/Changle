# Task cards for Codex: 玩什么 · What's On (`tools/events`)

One card, one branch, one PR. Each card names the only files to change, the saved inputs
(fixtures, already in the repo), the output type, the test file, the command and when it's done.

Before any card: read `tools/events/CONTRACTS.md` and `tools/events/src/types.ts`. The plan behind
them is `docs/whats-on-v2.md`; you don't need it for a card.

Always:
- Node 22, in `tools/events`: `npm ci`, then `npx vitest run <your test file>`, then `npm run typecheck`
  and `npm test` (everything) before the PR. Paste the test output into the PR.
- Don't touch `wrangler.jsonc`, secrets, `migrations/`, `src/schema.ts`, `src/run.ts`,
  `src/publish.ts`, or another card's files. If a card seems to need one of them, say so in the PR.
- Tests never use the network. Fixtures are real responses saved on 2026-10-31 (or hand-made and
  marked so); never "fix" a fixture to make a test pass.
- B.C. has kept UTC-7 all year since 8 March 2026: there is no clock change on 1 November 2026.
  Times always come from the time-zone database (`src/time.ts`), never a fixed offset.
- A parser's CPU counts: a step has 10 ms in all on Cloudflare's free plan. Keep each parse of the
  biggest fixture under about 5 ms warm, and say in the PR what you measured.

| Card | What | Files |
| --- | --- | --- |
| [C1](C1-ical-parser.md) | iCal parser: recurrences, overrides, time zones | `src/parsers/ical.ts` |
| [C2](C2-jsonld.md) | Events from a page's JSON-LD (schema.org/Event) | `src/parsers/jsonld.ts` (new) |
| [C3](C3-ticketmaster.md) | Ticketmaster: categories, statuses, prices | `src/parsers/ticketmaster.ts` |
| [C4](C4-dedupe.md) | Titles: normalise, similarity, fingerprint | `src/dedupe.ts` (new) |
| [C5](C5-areas.md) | Which area a place is in | `src/area.ts` |
| [C6](C6-ics.md) | The calendar feed (.ics) | `src/ics.ts` |
| [C9](C9-golden-eval.md) | Score the pipeline against the golden set | `src/eval.ts`, `scripts/eval.ts` (new) |
| [C12](C12-burnaby.md) | Burnaby Public Library's own feed | `src/parsers/bpl.ts` (new) |

What to send Codex, one card at a time:

```
按 docs/codex-tasks/C1-ical-parser.md 做。先读 tools/events/CONTRACTS.md 和 src/types.ts。
只改卡上写的文件和测试，跑卡上的命令通过后再开 PR，PR 描述里贴测试输出。
```
