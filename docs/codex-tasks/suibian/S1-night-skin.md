# S1 · The night skin

Branch `codex/suibian-s1-night`, from the latest `origin/main`. Read `README.md` in this folder first:
its "Always" rules apply.

## What

随便 today has its own cream "paper menu" look, with a dark version that follows the phone. After this
card it has changle.ca's night room and nothing else: the site's own tokens, its two fonts, the dark
night colors, and the tools' amber as the light in the room. Every color, type size, gap, corner,
shadow and timing in the stylesheet comes from a token, and a new test keeps it that way.

This card is the skin only. The layout of every screen stays as it is (S2 redraws the screens, S3 adds
the motion), so the browser tests pass without a single change.

`tools/when` (约时间, another changle.ca tool on the same stack: Preact, esbuild, Workers) went
through exactly this, so copy its approach: `tools/when/scripts/build.mjs`,
`tools/when/src/client/fonts/`, the top of `tools/when/src/client/styles.css` and
`tools/when/tests/design.test.ts`.

## Files

Change only these, all in `tools/suibian/`:

- `src/client/styles.css`
- `src/client/tokens.css` (new): a copy of `site/src/styles/tokens.css`, unchanged
- `src/client/fonts/` (new): `figtree.woff2`, `unbounded.woff2` and `licences/` copied from
  `tools/when/src/client/fonts/`, and a `fonts.css` like that one with the addresses under `/eat/fonts/`
- `scripts/build.mjs`
- `src/client/index.html`, `src/client/privacy.html`, `src/client/terms.html`: the `theme-color`
  only
- `tests/design.test.ts` (new)
- `README.md`: a short "How it looks" paragraph (night room, amber light, tokens copied from the site
  and checked by `tests/design.test.ts`, the fonts and their licences)

No new packages. Nothing in `src/client/ui/` or any `.ts`/`.tsx` file changes in this card.

## Steps

1. **Build.** `scripts/build.mjs` writes `dist/client/eat/app.css` as `fonts.css`, `tokens.css` and
   `styles.css` joined in that order and minified with `esbuild.transform` (loader `css`, the same
   `target` as the script). It copies the two fonts to `dist/client/eat/fonts/` and writes
   `dist/client/eat/licences.txt` with both licences, like `tools/when` does. Keep the names
   `/eat/app.css` and `/eat/app.js`: the three pages link them, and the worker and `wrangler.jsonc`
   must not change. In `--watch` mode the stylesheet is rebuilt (not minified) whenever the script
   rebuilds, as in `tools/when`.
2. **Night only.** Delete the light palette at the top of `styles.css` and both dark blocks
   (`prefers-color-scheme: dark` and `[data-theme="dark"]`). Use the tokens' semantic names directly,
   and keep no copies of the old names. `html` gets `color-scheme: dark` and the page background
   `var(--color-bg)`.

   | Old | New |
   | --- | --- |
   | `--bg` | `--color-bg` |
   | `--surface` | `--color-surface` (cards, chips); `--color-sheet` for fields and tracks |
   | `--ink` | `--color-text` |
   | `--muted` | `--color-text-2` (`--color-text-3` only for placeholders and disabled) |
   | `--line` | `--color-line`, or `--color-line-soft` for hairlines inside a card |
   | `--accent`, `--on-accent` | `--gel` (set to `var(--type-tool)`, see 3) and `--color-on-accent` |
   | `--like`, `--like-bg` | `--color-success`; the tint is `color-mix(in oklab, var(--color-success) 16%, var(--color-surface))` |
   | `--ban`, `--ban-bg` | not red: `--color-text-2` on `--color-sheet`. A "no" dims; it isn't an error |
   | `--warn`, `--warn-bg` | `--color-warning`; the tint is `color-mix(in oklab, var(--color-warning) 14%, var(--color-surface))` |
   | `--mine` (your own row) | `color-mix(in oklab, var(--gel) 14%, var(--color-surface))` |
   | `--font` | `--font-text`; the table code, scores and big numbers `--font-display` |
   | `#fff` behind the QR code | `--color-paper` |
   | the photo credit's `rgba(0,0,0,.6)` and `#fff` | `--color-scrim` and `--color-text` |
   | errors and the danger button | `--color-danger`, with `--color-on-danger` on a filled one |
3. **The light.** `:root` (or `body`) sets `--gel: var(--type-tool)`. The primary button is
   `var(--gel)` with `var(--color-on-accent)` text and `box-shadow: var(--glow)`. Links and focus
   rings use the gel too (`:focus-visible` is a 2px `var(--gel)` outline with a 2px offset). Above the
   page hangs the lamp from the drawings: a `body::before`, fixed, behind everything,
   `pointer-events: none`, a radial gradient of
   `color-mix(in oklab, var(--gel) 26%, transparent)` fading to transparent, about 380px tall at the
   top (see `tools/when/src/client/styles.css`, "the lamp over the table", and the first `<div>` in
   `mock/Lobby.dc.html`).
4. **Type.** `body` is `var(--font-text)` at `var(--text-md)` with `line-height: var(--leading)`
   (it follows `<html lang>`, which `i18n.ts` already sets). Every `font-size` becomes a `--text-*`
   step: the nearest one, rounding up for anything people read at the table (h1 `--text-3xl`, h2
   `--text-xl`, h3 `--text-lg`, small print `--text-sm`, tags `--text-xs`, the table code
   `--text-3xl`, the cuisine emoji on the menu `--text-2xl`). Titles and codes use
   `--leading-tight`. No `font:` shorthand except `font: inherit` on buttons and fields.
5. **Space, corners, depth, time.** Gaps, padding and margins use `--space-*`, `--gutter`,
   `--pad-card` and `--gap-section`, rounded to the nearest step. Corners: buttons and choices
   `--r-pill`, fields `--r-field`, cards and panels `--r-panel`, the menu chips and the restaurant
   cards `--r-tile`, small tags `--r-small`. Shadows: `--shadow-flat` on panels and chips,
   `--shadow-float` on toasts, `--glow` on the lit button, or an inset ring of a token color
   (`inset 0 0 0 2px var(--color-success)`). The page is `max-width: var(--page-max)`, centred, with
   `var(--gutter)` at the sides and room for `--safe-top` / `--safe-bottom`. Transitions that exist
   today use `--dur-enter` / `--dur-exit` and `--ease-out`.
6. **Taps.** Every button and link that looks like one is at least `var(--tap)` high, and
   `var(--tap-crowded)` where several sit in a row (the menu, the choices, the vote buttons).
7. **Page defaults, as on changle.ca.** `body` gets `-webkit-tap-highlight-color: transparent`,
   `-webkit-touch-callout: none`, `user-select: none` and `touch-action: manipulation`; fields
   (`input`, `textarea`, `select`) keep `user-select: text`. The invite link already has a copy
   button. The existing `prefers-reduced-motion` rule stays.
8. **theme-color.** `#0e0c22` (the night) in all three pages. The 🥢 icon stays.
9. **The test.** `tests/design.test.ts`, modelled on `tools/when/tests/design.test.ts`. It reads
   `src/client/styles.css` with comments removed and checks:
   - `src/client/tokens.css` is identical to `site/src/styles/tokens.css` (skipped when the site isn't
     beside the tool), with the message "copy site/src/styles/tokens.css over src/client/tokens.css"
   - no color is written out: no `#…`, `rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `oklab(` (a
     `color-mix` of tokens is fine)
   - every `font-size` is `var(--text-…)`, and `font:` is only ever `inherit`
   - every `box-shadow` is `none`, `var(--shadow-…)`, `var(--glow)` or an inset ring of a token color
   - every `border-radius` is `var(--r-…)` or `0`
   - no duration is written out (no `\d+ms` or `\d+s`)
   - `padding`, `margin` and `gap` (and their `-top`/`-inline`/… forms) contain no length of 3px or
     more and no rem or em length that isn't from a token (1px and 2px hairline nudges are fine)
   - `--gel: var(--type-tool)` is set: this is a tool, and amber is its light

## Done when

- Every screen is night-colored with the amber lamp at the top, in both languages, at 390px and at
  1280px wide, and nothing is cream or white except the QR code's card.
- The screens are laid out as before: same order, same words, same controls.
- `npm run typecheck`, `npm test` (with the new test), `npm run build` and `npx playwright test` all
  pass, with no change to `tests/e2e/`.
- The PR lists which old values had no exact token and which step you rounded them to.
