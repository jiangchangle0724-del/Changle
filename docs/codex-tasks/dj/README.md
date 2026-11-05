# Task cards for Codex: 打碟 · DJ Booth (`site/`)

One card, one branch, one PR. Each card names the only files to change, what it starts from, the
test, the command and when it's done.

Before any card: read `site/src/shared/dj/CONTRACTS.md` and `site/src/shared/dj/types.ts`, and
the local setup in `site/README.md`. The plan behind them is `docs/dj-booth.md`; you don't need it
for a card. The booth is built inside the site (changle.ca/dj): its rules run on the site's rooms
server (`site/worker`), and a merge to `main` deploys everything.

Always:
- Node 22, in `site/`: `npm ci`, then the card's command, then before the PR every step CI runs
  (`.github/workflows/site.yml`: `npx tsc --noEmit`, each `tests/*.test.ts` it lists, `npm run
  build`). Paste the output into the PR.
- Don't touch: `site/worker/`, any wrangler config or secret, `site/src/shared/engine/` (the rules),
  `site/src/shared/protocol.ts`, `site/src/shared/dj/types.ts` and `CONTRACTS.md` (the contract:
  if a card seems to need a change there, say what and why in the PR and leave it to Claude Code),
  `site/src/party/dj/speaker/`, `site/src/party/dj/fake/`, `useBooth.ts`, `parts.tsx`, or another
  card's files.
- Everything a player reads exists in Chinese and English (`zh ? "…" : "…"`, as the booth's files
  do). Short and plain: the site's voice, no exclamation marks.
- New screens follow `docs/DESIGN.md` (read it once): colours, font sizes, spacing, corners,
  shadows and timings from `site/src/styles/tokens.css` by their meaning (`--color-*`, `--text-*`,
  `--space-*`, …), never written out; the booth's own stage lights are game props, kept as local
  variables at the top of `dj.css`, as DESIGN.md allows. Icons are lucide line icons, not emoji;
  the 🔥 and ❄️ floating over the dancers are the one exception, as the 🔥 is today. Anything
  pressable is at least 44 px. Where the shared components in `site/src/ui/` exist (Button, Pill,
  Sheet, Tabs, RosterChip, Toast: UI card ui-C1), use them; where they don't yet, use the site's
  current classes and say so in the PR. The booth's existing styles were written before DESIGN.md:
  leave them unless your card says otherwise (the UI plan migrates them).
- The phones make no sound at all; only the big screen plays music.
- Tests never use the network. A fixture is a saved input: never edit one to make a test pass.
- The room already takes every command (CONTRACTS.md, "Commands"). What the DJ does with the
  knobs, ❄️ and drops (A4) and making the songs (A5) come later from Claude Code: your screens show
  what the room holds; they don't fake what the DJ would do.

| Card | What | Files |
| --- | --- | --- |
| [C1](C1-presets.md) | The 12 style presets (done) | `site/src/shared/dj/presets.ts` (new) |
| [C2](C2-asset-pipeline.md) | (superseded Nov 5: the coach is a CC0 robot) The dancers' 3D files: FBX to GLB, compressed, with a list | `site/scripts/assets/` (new) |
| [C4](C4-phone.md) | (superseded Nov 5: built by Claude Code) The phone: ❄️, drop, style knobs, asking for a song | `site/src/party/dj/phone/` (new), `NetDj.tsx`, `dj-phone.css` |
| [C5](C5-speaker-screen.md) | (superseded Nov 5: built by Claude Code) The big screen: the songs, ❄️ and drops, what the floor wants, readable from 3 m | `site/src/party/dj/screen/` (new), `TvDj.tsx`, `Floor.tsx`, `dj.css` |

Order: C1 and C2 first (at the same time); then C4 and C5 (at the same time; their files don't
overlap). C4 and C5 use C1's style names. (Nov 5: C1 is done; C2, C4 and C5 are superseded, so no
card here is waiting for Codex. New cards for the plan's next steps get written when they start.)

What to send Codex, one card at a time:

```
按 docs/codex-tasks/dj/C1-presets.md 做。先读 site/src/shared/dj/CONTRACTS.md 和 types.ts。
只改卡上写的文件和测试，跑卡上的命令通过后再开 PR，PR 描述里贴测试输出和截图。
```
