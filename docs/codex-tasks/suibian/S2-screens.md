# S2 · The screens, as drawn

Branch `codex/suibian-s2-screens`, from the latest `origin/main` (S1 is in it). Read `README.md` in
this folder first: its "Always" rules apply. The drawings are `mock/*.dc.html`; `mock/NOTES.md`
says where the drawings and the app differ (the app's words and choices win).

## What

S1 gave 随便 the night colors. This card gives every screen the shape it has in the drawings: a top
bar like the site's game header, one lit button per screen docked under the thumb, pill choices,
tiles for the menu, and restaurant cards that are quick to scan. Same rules, same words, same steps:
only how each screen is laid out and drawn changes. No motion beyond what exists (S3 does it), but
leave the classes and hooks S3 will need (named below).

## Files

Change only these, all in `tools/suibian/`:

- `src/client/ui/*.tsx`, `src/client/styles.css`
- `src/client/ui/colors.ts` (new): the avatar colors
- `src/client/i18n.ts`: only the new words listed below, in both languages
- `package.json` and `package-lock.json`: add `lucide-preact` at exactly `0.546.0` (the site's
  `lucide-react` line)
- `README.md`: one line on the icons and the avatar colors
- `tests/design.test.ts`: only to tighten it, never to loosen it

Don't change what the page sends to the server or reads from it: every `send(...)` and `api(...)`
call, its message and its fields stay exactly as they are. `main.tsx`, `store.ts`, `prefs.ts`,
`api.ts` and the server side stay as they are.

## Shared parts

Build these once (in `ui/common.tsx`, or a new `ui/` file each) and use them on every screen:

- **TopBar**, like `site/src/ui/GameHeader.tsx` and `GameHeader.css`: `calc(var(--bar-h) + var(--safe-top))`
  tall, sticky at the top, a back button on the left (lucide `ChevronLeft`, 44px, with an
  `aria-label`), the screen's title in the middle as the page's `<h1>`, and one thing on the right
  (the language switch, or the countdown in a round). The title shows the reader's language, with
  the other language as a small second line (`--text-xs`, `--color-text-2`, its own `lang`
  attribute), exactly as the site's header does. Its background is the night at 80% with
  `--blur-glass`, so text scrolling under it stays readable.
- **Dock**: the screen's main action, fixed at the bottom, `calc(var(--dock-h) + var(--safe-bottom))`,
  over a gradient from `--color-bg` to transparent. It holds the one primary button (full width,
  `calc(var(--tap) + var(--space-3))` high, `--text-lg`, weight 800, `var(--gel)` with
  `var(--color-on-accent)` and `--glow`) and, when a screen has one, one quiet button beside it or a
  short status line above it. Give the page enough bottom padding that nothing is ever hidden under
  the dock, and let taps through its see-through part (`pointer-events: none` on the dock,
  `auto` on what's in it).
- **Buttons** keep the `Btn` component and the `btn`, `primary`, `quiet`, `wide` classes (the tests
  use `.diet .btn.primary`): pills (`--r-pill`), primary lit, quiet `--color-raised`, danger
  `--color-danger` with `--color-on-danger`. Every button gets the class `press` for S3.
- **Choices** (`OccasionPicker`, `RangePicker`, `WhenPicker`, the diet card's choices): pill
  buttons in a wrapping row, `--tap-crowded` high, with `aria-pressed`. Chosen: an inset 2px ring of
  `var(--gel)` on `color-mix(in oklab, var(--gel) 16%, var(--color-surface))`; not chosen:
  `--color-surface` with `--shadow-flat`. Their words, options and behaviour stay.
- **Panels**: `--color-surface`, `--r-panel`, `--shadow-flat`, `--pad-card`, `--gap-section` between
  them. Field labels `--text-sm`, weight 700, `--color-text-2`.
- **Messages**: `.warn` gets lucide `TriangleAlert` before its words, in `--color-warning` on the
  warning tint (a warning is always icon plus words, since its color is the same amber as the
  light); `.error` gets `CircleAlert`, in `--color-danger`; `.demo` is a quiet strip under the top
  bar; toasts float above the dock with `--shadow-float`.
- **Avatars**: a round 44px badge per person with the first character of their shown name
  (`memberName`), night text on a gel. The gels are one named array in `ui/colors.ts`,
  `AVATAR_GELS = ["var(--gel-amber)", "var(--gel-violet)", "var(--gel-mint)", "var(--gel-coral)", "var(--gel-cyan)", "var(--gel-pink)", "var(--gel-lime)", "var(--gel-periwinkle)"]`,
  picked by the person's place in `v.members`, so every phone shows the same color for the same
  person. The host's avatar has a 2px ring of `var(--gel)`.
- **Icons** are lucide (`lucide-preact`), 20px in buttons and 24px alone, `aria-hidden` beside a
  word. Emoji are content, not icons: the cuisine emoji, and the words that already start with one
  (📍 我现在的位置, 🚶 约 12 分钟, 📞 打电话, 🗺️ 地图, 🛵 点外卖, 🕒 …) keep their emoji and get no
  second icon.

## Screens

**Home** (`ui/Home.tsx`, drawn in `Main.dc.html`). TopBar: the back button is a link to `/tools`
(the tools tab of changle.ca, on the same domain) labelled with the new word `toTools`; the title is
随便 / Whatever's Fine (`title`); the language switch on the right. Under it the tagline (`tagline`),
large (`--text-xl`, `--leading-tight`), as in the drawing's hero. The rating nudge, when there is
one, is a panel with its arrow. Then the start form in one panel: 什么场景, 什么时候吃, 从哪里出发 and
多远以内 with their choices as pills (从哪里出发 stays a `<select>`, drawn as a full-width field with
lucide `ChevronDown` at its right end, as in the drawing), then 开一桌 as
the lit button. Under it a quiet wide button 加入一桌 (`join`); tapping it opens the code row in place
(the 4-digit field, focused, and 进去) instead of a second card. Signing in, signing out, deleting
your data and the privacy and terms links keep their words and stay at the bottom, quiet.

**Lobby** (`Lobby` in `ui/Table.tsx`, drawn in `Lobby.dc.html`). TopBar: back to home, the title
`table` (第 {code} 桌), the language switch. The QR code on a `--color-paper` card with `--r-tile`;
under it the table code large in `--font-display` (`--text-3xl`, `--leading-tight`,
`font-variant-numeric: tabular-nums`, a little letter spacing), the scan hint, and the copy button
with lucide `Copy`. The occasion, time and budget lines with their 改场景 / 改时间 / 改预算 buttons
as one panel of rows. Your name field. 在座 (`people`) as a panel with the avatars in a grid: the
name under each, (你) and 房主 as small tags, and a small mint check badge (lucide `Check`, night on
`--color-success`, labelled with `ready`) on the avatar of everyone whose diet card is in, the words for the rest
(还没填饮食卡, 离开了) under their name. Each avatar has the class `member` and a `data-member`
attribute with the person's id, for S3. Dock: 改饮食卡 quiet and 开始！ lit for the host, with
`readyCount` as the status line above them; everyone else sees 等房主开始… in the dock instead. The
"finding" message and 换范围再找 keep working as today.

**Diet card** (`ui/DietCard.tsx`, not drawn). The same parts: a panel per question, pill choices,
the allergy and "don't eat" lists as removable pills, the field with 加上, and its save button as the
lit button at the bottom of the card (it stays `.diet .btn.primary`).

**Round 1** (`Mood` in `ui/Table.tsx`; the tiles are drawn in `Round1.dc.html`, the screen's order
is newer than the drawing). TopBar: back to home, the title `round1`, and the countdown on the right
as a pill (`Countdown`, moved up from the progress line): `--color-surface` with `--shadow-flat`, and
from 10 seconds left `--color-danger` with `--color-on-danger`, with the class `urgent` for S3. The
hint (`round1Hint`) under the bar. Since 2026-11-19 the round has three views, all kept as they work
today (Steve: the menu starts with big groups):
- *The way in*: `pathAsk` and two large buttons (`.choice[data-path=cuisine]`, `[data-path=dish]`),
  each its name and its examples, at least `--dock-h` high, like the drawing's tiles but wide.
- *The groups*: the switch between the two ways (`.seg.path-switch`, two pills with `data-path` and
  `aria-pressed`), then a grid of three columns (two below 360px). A group of one is a plain tile
  (`button.mood[data-cuisine]`); a bigger group is a `div.group` holding its tile
  (`button.mood[data-group]`, its `aria-label` saying how it stands) and, along the tile's foot, the
  `.inside` pill (细分 ›) that opens it. A tile is at least `calc(var(--tap) * 2)` high: the emoji
  large at the top left, the mark at the top right, the name at the bottom (`--text-sm`, weight 700,
  `--leading-tight`). 👍 (`like`): an inset 2px `--color-success` ring on the success tint. 🚫 (`ban`):
  `--color-sheet`, the name struck through in `--color-text-2`, the tile at 60% opacity. Partly picked
  (`some`, a group only): the mark is the counts (👍2 🚫1) at `--text-sm`, and the ring is a dashed
  2px `--color-success` line, so it doesn't read as all yes.
- *Inside a group*: the `.back-all` pill (‹ and the group's name) at the top, then that group's items
  as tiles in the same grid. The phone's back button closes it (`useBackCloses`, already there).

Keep `button.mood` with its `like` / `ban` / `none` / `some` class, `data-cuisine`, `data-group`,
`data-path`, `.group`, `.inside`, `.back-all`, `.path-switch`, `aria-pressed` and the labels. Dock:
the progress (a dot per person at the table, lit `--color-success` when they're done, and
`waitingOthers` beside them), 不等了，下一步 quiet for the host, and 好了 lit.

**Round 2** (`Cards` in `ui/Table.tsx`, `ui/RankedList.tsx` and `ui/PlaceCard.tsx`, drawn in
`Round2.dc.html`). TopBar: back to home, the title `round2`, the countdown pill. The hint, the
planned-for line and the table's limits under the bar. Each restaurant card (`article.place`):
`--color-surface`, `--r-tile`, `--shadow-flat`; the photo, when there is one, across the top with
the corners clipped; the rank as a 32px amber disc with night numerals in `--font-display` (it
keeps `role="img"` and the `rank` label); the name (`.place h3`) at `--text-lg`, weight 800; the
`.intro` line under it in `--color-text-2`; the facts as one row of small items; the reasons
(`.reason`) as pills: a "someone wants this" reason on the success tint, a "fits the occasion"
reason on the gel tint, the rest `--color-raised`. 更多 / 收起 stays a quiet button (lucide
`ChevronDown` / `ChevronUp` instead of ▾ ▴, words unchanged). The vote row: 想去 and 否决 side by
side, `--tap-crowded` high. 想去 ticked is lit (`var(--gel)`, night text, lucide `Check` before the
word instead of ✓). 否决 used on this card shows `vetoed` and the whole card dims to 55% with its name
struck through; it isn't red. On the other cards the used veto still reads 🚫 否决卡已用 and is
disabled, as today. Keep `.approve`, `.veto`, `aria-pressed`, and give the vote row and the card
the classes S3 animates (`.vote`, `.place.vetoed`). Under the list, 共 N 家… and 再看 N 家 as today.
Dock: the progress (as in round 1), and above it a count line: `picked` with the number of places
you ticked, then `vetoLeft` or `vetoUsed`. 好了 lit.

**Tie** (`Spinner`). A centred panel: 打平了！转一下… and the name in large type, ready for S3's wheel
(give the name its own element, class `spinname`, as today).

**Result** (`Result` in `ui/Table.tsx`, drawn in `Result.dc.html`). TopBar: no back button, the
title `pickTitle`. The heading stays as it is (`winner`, or `winnerAt`) and stays a heading with
exactly those words. The winning card with the class `win`: an inset 2px ring of `var(--gel)` and
the glow under it. Over its top right corner the stamp: the new word `stamp`, in `--font-display`,
`--text-2xl`, weight 800, `var(--gel)` text inside a 3px `var(--gel)` border on a translucent night,
`--r-small`, turned `-8deg`, `aria-hidden="true"` (the heading already says it), with the class
`stamp` for S3. The votes line under the card. The 🗺️ 地图 and 📞 打电话 links of the winner as two
quiet pill buttons in a row when the place has them. The warnings (`winnerUnsafe`,
`tellServer`, the table's limits) as messages. The dock: 发到群里 lit with lucide `Share2`. Under the
card: 吃完回来评分 ⭐ as a quiet wide link button (it stays a link with those words), the table's
score line, and 重新来一轮 quiet for the host.

**Rating** (`ui/Rate.tsx`) and the **privacy** and **terms** pages: the same parts, not drawn. The
rating questions are panels with pill answers (the buttons and their words stay as they are), 提交 is
the lit button in the dock. The legal pages keep their markup and links; S1's styles already cover them,
so only fix what looks wrong next to the new screens.

## New words

Add these to `src/client/i18n.ts`, and no others:

| Key | 中文 | English |
| --- | --- | --- |
| `toTools` | 工具 | Tools |
| `pickTitle` | 定了 | The pick |
| `stamp` | 就它了！ | This one! |
| `vetoed` | 已否决 | Vetoed |
| `picked` | 已勾 {n} 家 | {n} ticked |
| `vetoLeft` | 否决还剩 1 次 | 1 veto left |

The back buttons' labels reuse `home` (and `toTools` on the home screen).

## Done when

- At 390px wide each of the five screens looks like its drawing, in Chinese and in English, with the
  app's real words; at 1280px the column is centred at `--page-max`.
- Nothing hides under the top bar or the dock, nothing scrolls sideways, and every control is at
  least 44px (48 in rows and grids).
- No sentence appears twice on one screen (the tests find many by their words).
- `npm run typecheck`, `npm test`, `npm run build` and `npx playwright test` pass. If a browser test
  had to change because a screen changed on purpose, the PR says which line and why.
