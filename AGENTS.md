# Working in this repository

The code for [changle.ca](https://changle.ca): the site and its party games (`site/`, with the
online rooms server in `site/worker/`), 到此一游 (`games/been-there`) and 随便 (`tools/suibian`).
Start with [HANDOFF.md](HANDOFF.md): what runs where, how a change goes live, how to add a game,
the commands and the settings.

* One chat, one area. Each chat's brief is in `docs/briefs/` (the index is `docs/briefs/README.md`):
  read it before you start, and update it before you finish (what you did, what was decided, what's
  left, what another chat should do).
* Every change on its own branch with a PR. Never push to `main`. CI must be green before merging.
* Once CI is green, merge the PR yourself and tell Steve what went live. Merging into `main` deploys
  (Cloudflare builds each part from GitHub, the rooms server too).
* Ask Steve (the owner) first only for: anything that costs money, deletes data, changes Cloudflare
  or GitHub settings or keys, or makes the repository public or private.
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
  The one exception is 跟一单 (`tools/tuan`), bright since 2026-11-26 (Steve's call): see its README.
* Game cards use their kind's color: `category` in `site/src/games/registry.ts` (drink, brain, body,
  online); tools are amber. Inside a game, the room light is that game's own gel.
* Tap targets are at least 44px, 48 where several sit close together.
* Running text uses `--leading` (Chinese 1.65, English 1.5); pages can be zoomed with two fingers,
  except the big screen's picture (`.tv-fit`, `.watch`): zooming it crashes iPhone Safari (`tv.css`).
* Nothing but a text field can be selected or copied, and a double tap never zooms (`global.css`,
  `@layer page-defaults`). Something people need to copy gets a copy button. Every page and app
  (the Workers too) gives every element `touch-action: manipulation` and listens for clicks on
  `<html>`, as `site/src/main.tsx` does: iPhone Safari checks touch-action only near a listener.
* The master account can long-press any words on changle.ca and change them for everyone
  (`src/shared/copy.ts`; the back office's 改字 lists them). The code keeps the original words, so
  live text can differ from it: never read text back from the page to decide anything.
* A sheet closes on the phone's back button (`useBackCloses`); a page keeps its address.
* Motion uses token durations and easings; with reduced motion, nothing slides or shakes.
* The home page's first download has a CI budget (`site/scripts/budget.ts`); load new parts later.
* Motion on the home page uses the browser's own animations (`site/src/lib/motion.ts`); GSAP
  (`lib/anim.ts`) is for games only, so it stays out of the home page's download.
* CI compares 40 screenshots and runs axe (`site / visual`). If a screen changed on purpose, the PR
  needs new reference screenshots: add the `update-screenshots` label yourself (site/README.md) and
  say in the PR which screens changed.
