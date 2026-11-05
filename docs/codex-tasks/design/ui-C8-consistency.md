# ui-C8: the site's frame on tokens only, one PR per area

**When:** after the C8 PR that adds check 4 to `site/tests/tokens.test.ts` and `site/tests/raw-values.json`.
**Files, per PR:** the area's files in the table below, `site/tests/raw-values.json` (its entries for
those files go away), and screenshots in `site/local-shots/c8/<area>/`. Nothing else: not
`site/src/styles/tokens.css`, `site/src/ui/`, the games (`src/party/`, `party.css`, `drama.css`, the TV's
`tv*.css`), or other areas' files.
**Branch:** `codex/ui-c8-<area>`, from main, one per area.
**Command:** in `site/`: `npx tsc --noEmit`, every test that `.github/workflows/site.yml` runs, `npm run build`
and `npx tsx scripts/budget.ts`. Then look at every screen the area draws in `npm run dev` at 390×844 and
1280×800, in Chinese and in English, before and after.

The design rules (docs/DESIGN.md) say colors, font sizes, corners, shadows and timings come from
`var(--…)` in `site/src/styles/tokens.css`. The site's frame, everything around the games, still writes
586 of them out by hand. Steve chose on 2026-11-05: the frame goes to zero, the games' own pictures and the
TV keep their art for now, spacing waits. `npx tsx tests/tokens.test.ts` counts them (check 4) and fails
if a file has more than `tests/raw-values.json` allows, so the number only goes down.

## What counts, and what it becomes

Only the five kinds check 4 counts, in the area's files:

| Kind | Written out | Becomes |
| --- | --- | --- |
| Font size | `font-size: 13px`, the px in `font:`, `fontSize: 18` in TSX | the nearest step: `--text-xs` 12, `--text-sm` 14, `--text-md` 16, `--text-lg` 18, `--text-xl` 22, `--text-2xl` 28, `--text-3xl` 40, `--text-4xl` 64. `python3 scripts/ui_inventory.py` (字号映射) shows where each old size goes. |
| Color | `#hex`, `rgb()`, `rgba()`, `hsl()` | the color tokens: `--color-bg`, `--color-sheet`, `--color-surface`, `--color-raised`, `--color-text`, `-2`, `-3`, `--color-line`, `--color-line-soft`, `--color-accent`, `--color-on-accent`, `--color-success`, `--color-warning`, `--color-danger`, `--color-scrim`, a gel (`--gel-*`) for a light, `--color-paper` for QR codes and card stock |
| Shadow | `box-shadow:` with values | `--shadow-flat` (panels at rest), `--shadow-float` (lifted), `--shadow-sheet` (sheets), or `none` |
| Corner | `border-radius:` in px | `--r-small` 10, `--r-field` 14, `--r-panel` 20, `--r-tile` 24, `--r-sheet` 28, `--r-pill`; `50%` stays for circles |
| Time | 600ms or less in `transition` / `animation` | `--dur-exit` 150 (up to 160), `--dur-enter` 200 (180 to 300), `--dur-emphasis` 400 (320 to 600). Longer choreography stays. |

**When nothing fits** (a color that is part of a picture, a glow with no token, a size between two steps
that matters), don't invent a token and don't touch `tokens.css`: leave that value, keep its count in
`raw-values.json`, and list it in the PR with one line on why. Steve and the design chat decide.

Things will move by a pixel or two (13px text becomes 14, a 16px corner becomes 14). That's expected. A
change a player would notice (a heading shrinking a whole step, a color changing) goes in the PR with
before and after screenshots.

## The PRs

| Area | Slug | Files | Raw now |
| --- | --- | --- | --- |
| 首页 | `home` | `src/styles/home.css` | 110 |
| 账号、头像、后台 | `accounts` | `src/styles/account.css`, `avatar.css`, `admin.css` | 172 |
| 联机桌（手机） | `online` | `src/styles/online.css`, `src/online/OnlineSheet.tsx`, `TableSheet.tsx` | 116 |
| 工具 | `tools` | `src/styles/tools.css` | 47 |
| 共用部分 | `shared` | `src/styles/components.css`, `global.css` (not its `:root` block), `landscape.css`, `src/components/PlayersSheet.tsx`, `SettingsSheet.tsx` | 141 |

At the end of each PR: `UPDATE_RAW=1 npx tsx tests/tokens.test.ts` rewrites `tests/raw-values.json`; the
area's files should be gone from it (or keep only the listed exceptions).

## Check, in each PR

1. `npx tsx tests/tokens.test.ts` passes, and the area's count in `raw-values.json` is 0 or only the listed
   exceptions.
2. Every screen of the area, before and after, Chinese and English, 390×844 (and 1280×800 for home):
   `site/local-shots/c8/<area>/<screen>-<lang>-before.png` and `-after.png`.
3. Contrast still passes: the `site / visual` job runs axe on 40 screens.
4. `npx tsx scripts/budget.ts`: CSS should get no bigger.
5. Reduced motion: nothing new moves.
