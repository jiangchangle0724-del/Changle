# ui-C4: Chinese type, line height, zoom, 44px targets, contrast

**When:** after A3 (the routing change) is merged, so the two don't collide in `index.html` and `main.tsx`.
**Files:** `site/index.html`, `site/src/main.tsx` (one import), `site/src/styles/tokens.css` (the font
stacks only), `site/src/styles/global.css`, and the other `site/src/styles/*.css` files named in
docs/ui-inventory.md under 「小于 44 的点击目标」; `site/src/account/MePage.tsx` (its tabs);
a new `site/scripts/type_check.py`, and its screenshots in `site/local-shots/c4/`.
**Command:** in `site/`: `npx tsc --noEmit && npx tsx tests/tokens.test.ts && npm run build`; then
with `npm run dev` running, `python3 scripts/type_check.py`; and if you can run the rooms server
locally (site/README.md), `python3 scripts/local_check.py` as a regression.

Chinese readers are most of the audience, and Chinese running text is set at the English line
height today. Some things you tap are smaller than a fingertip, and pinch-zoom is switched off.
This card fixes that, on every page, without changing how anything looks otherwise.

## 1. Load the tokens

`src/main.tsx` imports `./styles/tokens.css` on the line before `./styles/global.css`. Names that
both files define carry the same values (the token test checks), so this alone changes nothing.

## 2. Font stacks

Chinese has no web font of its own, on purpose: each device uses its system face (docs/DESIGN.md,
字体). Make the two stacks share one Chinese list: in `tokens.css`,
`--font-display: "Unbounded Variable", "Unbounded", var(--font-zh);` and
`--font-text: "Figtree Variable", "Figtree", -apple-system, var(--font-zh);`, and delete
`--font-display` and `--font-text` from `global.css` (tokens.css owns them now; the test passes
because global.css no longer has them).

## 3. Line height by language

- Running text uses `line-height: var(--leading)`. `--leading` is 1.65 when `<html lang>` is
  Chinese and 1.5 when it's English (tokens.css; `store.tsx` already sets `lang` on the language switch).
- That means `body`, and every rule that sets a reading line height (between 1.3 and 1.7) on running
  text: `.hint`, `.hint-ink`, `.rules-text`, sheet bodies, rule lists, chat bubbles, descriptions.
  Find them with `grep -n "line-height: 1\.[3-7]" src/styles/*.css` and list each one you change.
- Titles, scores, codes, buttons and chips keep their own tight line heights.
- Where the browser supports it, Chinese and Latin get a little space between them:
  `@supports (text-autospace: normal) { html { text-autospace: normal; } }` in global.css.

## 4. Zoom

Take `user-scalable=no` out of the viewport in `index.html`. Pinch-zoom must not break a game, so
the surfaces you draw, spin or drag on get `touch-action: none` (check, and add where missing): the
drawing plate (`components/DrawingPlate.tsx`, `NetDraw`), the wheel (`WheelOfFate`, `NetWheel`), the
truth-or-dare bottle (`TruthDare`, `NetTruth`), the sheet handle. `body` keeps
`touch-action: manipulation` (no double-tap zoom, pinch still works).

## 5. Everything you tap is at least 44×44

- The 27 places in docs/ui-inventory.md, 「小于 44 的点击目标」: `min-height: var(--tap)` (and
  `min-width` for square ones). The language switch (中 / EN, now 32px tall) becomes 44.
- Where the drawing has to stay small (the × in a chip, colour swatches, suit buttons), keep the
  drawing and make the button around it 44: padding, or a negative margin so the layout doesn't move.
- Places with several targets close together use `--tap-crowded` (48).

## 6. Contrast

- `.btn-penalty` text: `var(--color-on-danger)` (night) instead of `#fff`; white on Stop Red is
  3.2:1, night is 6.0:1.
- Information text in `--fog` (or `--cream-faint`) on a panel, sheet or quiet button (counts,
  captions, "3 人") becomes `var(--color-text-2)`. Fog stays only for placeholders and disabled
  labels, and on the page background itself. List each change in the PR.
- `account/MePage.tsx`: its two tabs say `role="tab"` with `aria-pressed`. Make it a real tablist
  (`role="tablist"` on the group, `aria-selected` on each tab, arrow keys between them).

## The check script

`site/scripts/type_check.py`, in the style of `scripts/shots_home.py` (Python Playwright,
Chromium, 390×844, touch). For home, the tools tab, a game's sheet, the players sheet, the settings
sheet, sign-in at the code step, and three game screens (truth or dare, undercover, post-it), in
Chinese and in English:

- measures every `button`, `a`, `[role=button]`, `[role=tab]`, `input`, `select` that is visible and
  reports any smaller than 44×44 (links inside a sentence are allowed: say which);
- reads the computed `line-height ÷ font-size` of the main paragraph on each screen and reports it
  (1.65 in Chinese, 1.5 in English);
- saves a screenshot of each to `site/local-shots/c4/<screen>-<lang>.png`;
- exits 1 on any console error or any undersized target that isn't on its allowed list.

## Done when

- The command passes; `type_check.py` reports no undersized targets and the right line heights.
- Pinch-zoom works on the home page, and drawing, spinning the wheel and the bottle still work with
  touch in the browser.
- Nothing else moved: compare your screenshots with the same screens on `main` (same script, run on
  a checkout of `main`) and put the pairs that changed in the PR, with a sentence on each.
- Then Steve's check: the same screens on his iPhone and on an Android phone, Chinese reads evenly
  spaced on both, and nothing is too small to tap.
