# ui-C9: the design rules in AGENTS.md, and DESIGN.md kept true

**When:** now. Nothing else needs to land first.
**Files:** `AGENTS.md` (one new short section), `docs/DESIGN.md`, `site/DESIGN.md`, and this card's row
in `docs/codex-tasks/README.md`. No code, no styles.
**Command:** in `site/`: `npx tsx tests/tokens.test.ts` (it reads tokens.css and global.css, which you don't
change: it must still pass).

Two design documents and AGENTS.md disagree today, and a new chat or a new Codex task reads whichever it
finds first. This card makes them say one thing.

- `docs/DESIGN.md` is the design system the site is moving to: tokens (`site/src/styles/tokens.css`),
  the five kinds and their colors, the scale, motion, the 12 components in `site/src/ui/`.
- `site/DESIGN.md` describes how the live site looks, gel by gel. Parts of it are out of date since
  the UI plan's first gates (C4's line heights and 44px targets, A4's cards colored by kind).

## 1. AGENTS.md: a "Design" section

At most 15 lines, in the style of the file (short bullets, plain words). It points to `docs/DESIGN.md`
for everything else. What it must say:

- Colors, font sizes, spacing, corners, shadows and timings come from `site/src/styles/tokens.css`
  (`var(--…)`), never written out.
- New screens use the shared components in `site/src/ui/` (their interfaces are in `types.ts`);
  `site/ui-preview.html` shows each one.
- Night colors only. Text on any bright color (a gel, a kind's color, success, warning, danger) is
  night-colored.
- Game cards wear their kind's color (`category` in `site/src/games/registry.ts`: drink, brain, body,
  online; tools are amber). Inside a game, the room light is that game's own gel.
- Everything you tap is at least 44px (48 where several sit close together).
- Chinese running text reads at `--leading` (1.65 in Chinese, 1.5 in English); pages can be zoomed.
- A sheet closes on the phone's back button (`useBackCloses`); a page keeps its address.
- Motion: durations and easings from tokens; with reduced motion, nothing slides or shakes.
- The home page's first download has a budget (`site/scripts/budget.ts`, in CI): load new parts later.
- Everything a player reads exists in Chinese and English (already in AGENTS.md: don't repeat it).

## 2. docs/DESIGN.md: true today

Read each section against the code as it is on `main`, and fix what isn't true any more. At least:

- 组件: the 12 components exist (`site/src/ui/`, preview `site/ui-preview.html`); say so instead of
  "C1 照着做".
- 和现在不一样的地方: move what's done (Chinese line heights, 44px, cards by kind, pinch-zoom) out of
  the "different from today" list.
- Keep every rule and number that is still true word for word.

List every change you make in the PR, one line each: the section, what it said, what it says now, and
the file and line in the code that shows it.

## 3. site/DESIGN.md: say what it is

Add one paragraph at the top (both are fine in one document, in Chinese first): this file records the
gels and the look as built; the rules to follow are in `docs/DESIGN.md`, and where the two differ,
`docs/DESIGN.md` wins. Fix only statements that are now wrong (for example, tiles colored one per game:
they are colored by kind since A4). Don't restructure it.

## Done when

- AGENTS.md has the section (15 lines or fewer), `npx tsx tests/tokens.test.ts` passes.
- The PR lists every change to the two DESIGN files with the code that proves it.
- Don't touch `games/`, `tools/`, `site/worker/`, `site/src/`, secrets, or another card's files.
