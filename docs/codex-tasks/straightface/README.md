# Task cards for Codex: 一本正经 · Straight Face (`site/`)

One card, one branch, one PR. Each card names the only files to change, what it starts from, the
test, the command and when it's done.

Before any card: read `docs/straight-face.md` (the plan: short) and
`site/src/shared/straightface/types.ts` (the contract), and the local setup in `site/README.md`.
The game is built inside the site (changle.ca/g/straight-face/play, hidden from the home board
until the owner has played it): its engine is a pure reducer the one-phone screen runs in the
browser and the rooms server will run later (A3).

Always:
- Node 22, in `site/`: `npm ci`, then the card's command, then before the PR every step CI runs
  (`.github/workflows/site.yml`: `npx tsc --noEmit`, each `tests/*.test.ts` it lists, `npm run
  build`). Paste the output into the PR.
- Don't touch: `site/src/shared/straightface/` (the engine, the contract: if a card seems to
  need a change there, say what and why in the PR and leave it to Claude Code), `site/worker/`,
  any wrangler config or secret, `site/src/shared/engine/`, `site/src/shared/protocol.ts`,
  `site/src/games/registry.ts`, `site/src/App.tsx`, `site/src/router.ts`, or another card's files.
- Two iron rules (`docs/straight-face.md`, 屏幕): a phone renders only fields of `privateView`,
  a big screen only fields of `publicView`; a PR that reads `state.current.honestId` anywhere in a
  screen is sent back. Scoring changes start in `site/tests/straightface.test.ts`.
- Everything a player reads exists in Chinese and English: the game's own strings live in
  `site/src/party/straightface/text.ts` as `{ zh, en }`. Short and plain: the site's voice, no
  exclamation marks.
- New screens follow `docs/DESIGN.md` (read it once): colours, font sizes, spacing, corners,
  shadows and timings from `site/src/styles/tokens.css` by their meaning (`--color-*`, `--text-*`,
  `--space-*`, …), never written out. Icons are lucide line icons, not emoji. Anything pressable is
  at least 44 px (`--tap`). The shared pieces in `site/src/party/common.tsx` (PassCurtain,
  Leaderboard, NameFace) and `site/src/ui/` come first; the game's own are in
  `site/src/party/straightface/parts.tsx`.
- Nothing from 《瞎掰王》/ 9UPPER: not a term, not a definition, not a picture. Facts come from a
  source page and are put in our own words (never a copied or lightly reworded Wikipedia sentence).

| Card | What | Files |
| --- | --- | --- |
| [C1](C1-cards.md) | The card bank to 300 | `site/src/data/straightface.ts` |
| [C2](C2-ui-components.md) | The game's components, replacing A2's stand-ins | `site/src/party/straightface/parts.tsx`, `straightface.css`, `preview/` |
| [C4](C4-tests.md) | Tests: the views leak nothing, the edges, the browser run | `site/tests/straightface-*.test.ts`, `site/scripts/straightface_check.py` |

What to send Codex, one card at a time:

```
按 docs/codex-tasks/straightface/C1-cards.md 做。先读 docs/straight-face.md 和 site/src/shared/straightface/types.ts。
只改卡上写的文件和测试，跑卡上的命令通过后再开 PR，PR 描述里贴测试输出。
```
