# Working in this repository

The code for [changle.ca](https://changle.ca): the site and its party games (`site/`, with the
online rooms server in `site/worker/`), 到此一游 (`games/been-there`) and 随便 (`tools/suibian`).
Start with [HANDOFF.md](HANDOFF.md): what runs where, how a change goes live, how to add a game,
the commands and the settings.

* One chat, one area. Each chat's brief is in `docs/briefs/` (the index is `docs/briefs/README.md`):
  read it before you start, and update it before you finish (what you did, what was decided, what's
  left, what another chat should do).
* Every change on its own branch with a PR. Never push to `main`. CI must be green before merging.
* Ask the owner (Steve) before merging, deploying, or anything that costs money or goes public.
  Merging into `main` deploys (Cloudflare builds each part from GitHub, the rooms server too).
* No keys, secrets or tokens in code, commits, chat or screenshots. They live only in Cloudflare.
* Everything a player reads exists in Chinese and English.
* Each app installs and tests in its own folder (Node 22); read that folder's README first.
* Stuck? Stop and say what you need instead of working around it.

## Design

* Follow [docs/DESIGN.md](docs/DESIGN.md) for the full rules.
* Colors, font sizes, spacing, corners, shadows and timings use `var(--…)` from
  `site/src/styles/tokens.css`, never written-out values.
* New screens use `site/src/ui/`; interfaces are in `types.ts`, previews in `site/ui-preview.html`.
* Night colors only. Text on bright gels, kind colors, success, warning and danger is night-colored.
* Game cards use their kind's color: `category` in `site/src/games/registry.ts` (drink, brain, body,
  online); tools are amber. Inside a game, the room light is that game's own gel.
* Tap targets are at least 44px, 48 where several sit close together.
* Running text uses `--leading` (Chinese 1.65, English 1.5); pages can be zoomed.
* A sheet closes on the phone's back button (`useBackCloses`); a page keeps its address.
* Motion uses token durations and easings; with reduced motion, nothing slides or shakes.
* The home page's first download has a CI budget (`site/scripts/budget.ts`); load new parts later.
* Motion on the home page uses the browser's own animations (`site/src/lib/motion.ts`); GSAP
  (`lib/anim.ts`) is for games only, so it stays out of the home page's download.
* CI compares 40 screenshots and runs axe (`site / visual`). If a screen changed on purpose, the PR
  needs new reference screenshots: the `update-screenshots` label (site/README.md). Ask Steve first.
