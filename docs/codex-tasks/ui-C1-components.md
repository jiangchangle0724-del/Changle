# ui-C1: the 12 shared components

**Files:** new files only.
- `site/src/ui/<Name>.tsx` and `site/src/ui/<Name>.css` for each of the 12.
- `site/src/ui/index.ts` (exports), `site/src/ui/base.css` (imports `../styles/tokens.css`; the focus
  ring and a visually-hidden class), `site/src/ui/labels.ts` (the few words components own).
- Previews: `site/src/ui/preview/<Name>.tsx`, `site/src/ui/preview/main.tsx`, `site/ui-preview.html`.
- `site/scripts/ui_preview_shots.py` and the screenshots it saves in `site/local-shots/ui/`.

**Input:** `site/src/ui/types.ts` (the props: build to them, don't change them), `site/src/styles/tokens.css`,
`docs/DESIGN.md` (the rules), `docs/ui-inventory.md` ("12 个目标组件": what each one replaces).
**Command:** in `site/`: `npx tsc --noEmit && npx tsx tests/tokens.test.ts && npm run build`, then with
`npm run dev` running, `python3 scripts/ui_preview_shots.py`.

Today the look lives in global classes (`.btn`, `.chip`, `.sheet`, `.tile`) that every screen writes
by hand. These 12 components become the only way new screens get a button, a sheet or a card: the
home page (A4), the game shell (A5) and the game migrations (C2) are built from them. Nothing in the
app imports them yet, so this card changes no page.

## Rules for every component

- Props exactly as in `types.ts` (`export function Button(props: ButtonProps)`). If a prop looks
  wrong or missing, build the closest thing and say so in the PR; don't edit `types.ts`.
- Styles use only `var(--…)` from tokens.css, and the semantic names (`--color-*`, `--type-*`,
  `--text-*`, `--space-*`, `--r-*`, `--shadow-*`, `--dur-*`), not palette names like `--dusk-2`.
  No hex, `rgb()`, `hsl()` or font sizes in numbers: `tests/tokens.test.ts` fails on them.
- Class names start with `ui-` (`.ui-button`, `.ui-tile`). The old global classes (`.btn`, `.tile`,
  `.sheet`, `.chip`) stay where they are and must never style these.
- A game's color arrives as `--gel` on a container, set by the caller; a primary button is
  `var(--gel)` with `var(--on-gel)` text and `var(--glow)` under it, as today.
- Motion in CSS, with `--dur-*` and `--ease-out` / `--ease-pop`. Anything that slides uses
  `translateY(var(--motion-shift))`, so reduced motion turns it into a fade with no extra code.
  No GSAP and no `motion` library in `src/ui/`.
- No player-facing text inside a component except the words it owns (close, back, loading, remove,
  away, sound, TV, rules, round, seconds left, soon), each as `{ zh, en }` in `labels.ts`, picked by `lang`.
- Two-language titles (Tile, GameHeader): the reader's language first and larger, the other after it,
  smaller, in `--color-text-2`, each in its own `lang` ("zh-CN" / "en"), like `BiTitle` in
  `src/components/TopBar.tsx`.

## Accessibility (Web Interface Guidelines and docs/DESIGN.md)

- Everything you can press is a real `<button>`, at least 44×44 (`--tap`), with the focus ring
  (`:focus-visible`: 2px `--color-text`, 3px offset). Icon-only buttons are named by `label`;
  decorative icons get `aria-hidden`.
- Sheet: `role="dialog"`, `aria-modal`, named by its title (`aria-labelledby`) or by `label`. Focus
  moves in when it opens and back to whatever opened it when it closes; Esc and the backdrop close it;
  the page behind doesn't scroll; a swipe down on the handle closes it. A native `<dialog>` with
  `showModal()` is fine.
- Tabs: `variant="tabs"` is the WAI-ARIA tabs pattern (`tablist`, `tab` with `aria-selected`, arrow
  keys move along); `variant="segmented"` is a radio group (`radiogroup`, `radio`, `aria-checked`).
- Pill as a toggle: `aria-pressed`.
- OTPInput: one real `<input>` under the boxes, `autocomplete="one-time-code"` and
  `inputmode="numeric"` for digits, `autocapitalize="characters"` for letters; paste fills every box;
  backspace works; on error `aria-invalid` and `aria-describedby` pointing at the message.
- Toast: a live region, `role="status"` (`role="alert"` for danger), one at a time, at the top under
  the safe area so it never covers the bottom actions.
- Skeleton: the area is `aria-busy="true"` with a hidden 加载中 / Loading; the shimmer stops under
  reduced motion.

## Each component

- **Button**: primary, quiet (`--color-raised`), danger (`--color-danger` with `--color-on-danger`
  text: night, for contrast), icon (a 44 circle, `--color-line-soft` on hover). Heights 44 / 50 / 60.
  Pressed: scale 0.965 over `--dur-exit`. A disabled primary goes to `--color-raised` with
  `--color-text-3`, never a faded gel. `busy`: a small spinner (three still dots under reduced
  motion), same width, `aria-busy`.
- **Tile**: a solid block of its `--type-*` color, `--r-tile`, night text, the lucide icon as a large
  watermark (stroke 1.6), players, minutes and a glass mark on the bottom row, the 新 tag as a Pill.
  `soon`: dimmed, with the owned word 即将上线 / Soon. `lit`: a `--color-text` ring, lifted 2px.
  `size="hero"`: full width, about twice as tall, name at `--text-2xl`.
- **Sheet**: `--color-sheet`, `--r-sheet` on the top corners, `--shadow-sheet`, a handle, the title at
  `--text-xl`, a close icon Button, a scrolling body, `footer` pinned to the bottom above
  `--safe-bottom`. Backdrop `--color-scrim` with `--blur-scrim`. In over `--dur-enter`, out over
  `--dur-exit`. With `category`, its primary button takes that type color.
- **Tabs**: `tabs` as today's home tabs (`home/Home.tsx`, `.tabs` in `home.css`); `segmented` as
  today's `.seg` (a `--color-sheet` track; the chosen one solid `--color-text` with `--color-bg` text).
- **Pill**: a tag is 24px tall and can't be pressed; a toggle is 44px. Tones map onto `--color-*` and
  `--type-*`; a selected toggle fills with its tone and takes night text.
- **RosterChip**: a round face (32 / 44 / 56), the name beside or under it. `turn`: larger, ringed in
  `--gel`. `out`: 40% and struck through. Drinks as dots, up to five, then ×N. Away: dimmed with a
  small clock. Host: a small crown. Remove: a small icon Button whose hit area is still 44.
- **OTPInput**: boxes 44 wide and 56 tall, `--r-field`, `--color-sheet`, digits at `--text-2xl` in
  tabular figures; the next empty box ringed in `--light`, as on today's sign-in screen.
- **Toast**: `--color-surface` with `--shadow-float`, an icon for the tone, the action as a small quiet
  Button. 4000 ms, 8000 with an action. `ShowToast` comes from a `ToastProvider` and `useToast()` in
  `Toast.tsx`.
- **EmptyState**: centred; a 48px icon in `--color-text-3`, the title at `--text-lg`, the body in
  `--color-text-2`, the action as a primary Button. `error`: the icon in `--color-danger`.
- **Skeleton**: shapes in `--color-surface` with a slow highlight sweeping across; after `slowAfter`
  ms the `slowText` line appears under it.
- **GameHeader**: 56px plus `--safe-top`, three columns (44px buttons on both sides), the title
  centred. The round as "3 / 10"; the timer in tabular figures, `--color-danger` from `urgentAt` down.
- **PenaltyCard**: `stamp` is today's `components/PenaltyStamp.tsx` moment rebuilt in CSS keyframes:
  the screen flashes, the word (喝 / Drink, or `say`) slams down from 2.6× and −16° to −5° and wobbles,
  the stage shakes, the glass drains. Reuse `components/Glass.tsx` for the glass. The word is
  `--text-poster`; a safe call is mint with no shake; under reduced motion it fades in and doesn't
  shake. It sets `--gel: var(--moon)` on itself, so its Continue button is moonlight with night text,
  as today. `card`: a row-sized card for result lists (names, the penalty, the note). No sound inside:
  when games move onto it (C2), the sound call stays in the game.

## Previews

- `site/ui-preview.html`, a page for development only: Vite serves it at `/ui-preview.html` and the
  production build leaves it out. Don't add it to `vite.config.ts`. It loads the same two
  `@fontsource-variable` stylesheets as `src/main.tsx`, then `src/ui/base.css`, then
  `src/ui/preview/main.tsx`.
- `main.tsx` lists the 12. `#Button` (the hash) shows that preview alone, with a 中 / EN switch.
- Each preview shows every variant and state: every tone and size, disabled, busy, every category,
  with and without each optional prop, long text in both languages (a long English game name,
  a four-line Chinese description), an open Sheet with a long body and a footer, an error under
  OTPInput, a Toast with an action. Game names and icons can come from `src/games/registry.ts`.

## Screenshots

`site/scripts/ui_preview_shots.py`, in the style of `scripts/shots_home.py` (Python Playwright,
Chromium). It opens `http://127.0.0.1:5173/ui-preview.html#<Name>` at 390×844 (device scale 2), in
Chinese, takes a full-page shot to `site/local-shots/ui/<Name>.png`, and for Tile, Sheet, Tabs and
GameHeader also one at 1440 wide (`<Name>-desktop.png`). It prints every console or page error and
exits 1 if there was one. Commit the screenshots: they are how the PR is reviewed.

## Not in this card

Don't import the components anywhere in the app. Don't change `src/styles/*.css`, `types.ts`,
`tokens.css`, `games/`, the routing, `vite.config.ts` or `package.json` (React and lucide-react are
already there).

## Done when

- `npx tsc --noEmit`, `npx tsx tests/tokens.test.ts` (it now checks every file in `src/ui/`) and
  `npm run build` pass, and the built JavaScript and CSS are the same size as on `main` (nothing
  imports the components yet).
- `python3 scripts/ui_preview_shots.py` runs without a console error, and the PR shows the 12
  screenshots plus the 4 desktop ones.
- Every preview works by keyboard alone: Tab, Enter, Space, the arrow keys in Tabs, Esc in Sheet.
- With reduced motion (Playwright `reduced_motion="reduce"`), nothing slides or shakes; things fade.
- The PR lists, for each component, which code it will replace (from docs/ui-inventory.md).
