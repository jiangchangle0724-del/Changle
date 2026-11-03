# ui-C6: screenshots that catch what changed, and accessibility checks, in CI

**When:** after the home page change (A4, PR #120) is merged, so the screenshots start from the new
home page.
**Files:** `site/package.json` and `site/package-lock.json` (two dev dependencies, exact versions:
`@playwright/test` and `@axe-core/playwright`), new `site/playwright.config.ts`, new `site/tests/visual/`
(the specs, the fixtures they share, and the reference screenshots under `__screenshots__/`),
`.github/workflows/site.yml` (one new job), new `.github/workflows/visual-update.yml`, `site/README.md`
(how to run and update), and this card's row in `docs/codex-tasks/README.md`.
**Command:** in `site/`: `npx tsc --noEmit && npm run build`, then `npx playwright test` (it starts its
own `vite preview`). The reference screenshots come from CI, never from your machine (below).

Gate C of the UI plan asks for 40 screenshots that must keep matching, plus automatic accessibility
checks, so a change that moves something by accident fails before it is merged. Today nothing compares
screens: the local scripts (`scripts/routes_check.py`, `type_check.py`...) check behavior, not looks.

## The 40 screens

All at 390×844 (a phone, touch, device scale 2) unless it says desktop (1280×800). Chinese unless it
says English. The page's state comes from localStorage the way `scripts/type_check.py` sets it up
(players, language, sound off), with five players unless it says otherwise.

| # | Screen | Count |
| --- | --- | --- |
| 1–4 | Home, party tab: Chinese, English, desktop Chinese, desktop English | 4 |
| 5–6 | Home with nobody added yet: Chinese, English | 2 |
| 7–8 | Tools tab: Chinese, English | 2 |
| 9 | Wishlist tab | 1 |
| 10–11 | A game's card (`/g/truth-or-dare`): Chinese, English | 2 |
| 12–13 | The players sheet, the settings sheet (`/settings`) | 2 |
| 14 | Sign-in at the code step (`/login`, a fixture answers the email step) | 1 |
| 15–29 | The first screen of 15 games on one phone (`/g/<slug>/play`): every playable game except 到此一游 and 打碟 | 15 |
| 30 | The big screen's start page (`/tv`) | 1 |
| 31–40 | Ten components from `/ui-preview.html` (Button, Tile, Sheet open, Tabs, Pill, RosterChip, OTPInput, EmptyState, GameHeader, PenaltyCard) | 10 |

If a screen can't be made stable (below), replace it with another of the same kind and say why in the PR.

## Stable screenshots

- No network: answer every request that leaves `vite preview` from fixtures, like `type_check.py`
  does (`page.route`). WebSockets never connect to the real rooms server.
- A fixed clock (`page.clock.setFixedTime`), and `Math.random` replaced by a seeded one before the page
  loads (`addInitScript`), so decks, bottles and the 现在玩这个 pick land the same way each run.
- Reduced motion on, animations disabled for the screenshot, the page's fonts loaded
  (`document.fonts.ready`) before it is taken.
- Compare with a small tolerance (`maxDiffPixelRatio` 0.001 at most) and say in the PR what you chose
  and why.

## Fonts and where the reference screenshots come from

Chinese has no web font: each machine draws it with its own system face (docs/DESIGN.md, 字体). A
screenshot taken on Windows will never match one taken on Linux. So:

- The CI job runs on `ubuntu-latest`, installs Chromium with `npx playwright install --with-deps chromium`
  and the Chinese fonts with `sudo apt-get install -y fonts-noto-cjk`, and compares against the
  committed screenshots.
- `visual-update.yml` (run by hand, `workflow_dispatch`, with the branch to update) runs the same
  steps with `--update-snapshots` and commits the new screenshots to that branch, with the default
  `GITHUB_TOKEN` and `contents: write` for that workflow only. That is the only way reference
  screenshots are made, the first time and after a change that moves something on purpose.
- On your machine, run the suite to develop it, but never commit screenshots it took.

## Accessibility (axe)

On each of the 40 screens, run axe (`@axe-core/playwright`, rules for WCAG 2.1 A and AA) and fail on
any serious or critical violation. If one can't be fixed inside this card (it needs a change in
`site/src/`, which this card doesn't touch), list it in `tests/visual/axe-known.ts` with the screen, the
rule and one sentence on why, and report each one in the PR: those become fixes for the chat that owns
that screen.

## CI

A new job `visual` in `.github/workflows/site.yml`, next to `check` (it doesn't slow it down), same
triggers. On a failure it uploads the diff images as an artifact, so the PR shows what moved. It must
finish in under 8 minutes.

## Done when

- `npx playwright test` passes in CI on your PR, with the reference screenshots made by
  `visual-update.yml` on your branch.
- Proof that it catches a change: on a scratch branch, change one token value, show the failed CI run and
  its diff image in the PR, then delete the scratch branch.
- The axe results are clean, or each exception is listed with its reason.
- `site/README.md` says how to run the suite and how to update the screenshots after an intended change.
- Don't touch `games/`, `tools/`, `site/worker/`, `site/src/`, secrets, or another card's files.
