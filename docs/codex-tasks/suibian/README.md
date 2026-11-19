# Task cards for Codex: 随便 · Whatever's Fine (`tools/suibian/`), the night redesign

Steve, 2026-11-18: "规则不变，动画交互以及页面设计进行大型整改". The rules stay exactly as they
are (rounds, votes, ranking, searches, what the server sends); what changes is how every screen
looks, moves and feels. 随便 moves from its own cream "paper menu" look to changle's night room
(`docs/DESIGN.md`, `site/src/styles/tokens.css`), lit amber because it is a tool, with the motion
and tap feedback of a party game.

The look is drawn in five phone screens, `mock/*.dc.html` (390×844, the same files as the design
canvas Steve saw). Read them as HTML and CSS: the inline `style` attributes and the `<style>` in
`<helmet>` are the spec; the `<x-dc>`, `<sc-for>`, `<sc-if>` tags and the `class Component` script
are only how the canvas draws them (a repeated block, a branch, the state behind a tap). The
`<link>` to `/_blob/…` is the canvas's copy of `site/src/styles/tokens.css` and `support.js` is the
canvas itself; neither is in the repository, and neither is needed to read the drawings. The yellow
notes on the canvas are in `mock/NOTES.md`.

The chat that owns this tool (工具 · 随便) says when each card can start, and reviews every PR
with screenshots on its side.

Always:
- Node 22, in `tools/suibian`: `npm ci`, then `npm run typecheck`, `npm test`, `npm run build` and
  `npx playwright test` before the PR. Paste the output into the PR, as text. Playwright starts
  its own browser in the background, which is fine; if it has no browsers yet, run
  `npx playwright install chromium`, and if that can't install, set the environment variable
  PW_CHROME to 1 to use this computer's Chrome. Don't open a browser yourself to click around, and
  don't upload pictures to the PR (on other cards that left Codex waiting for an approval nobody
  was there to give).
- **The rules don't change.** Don't touch `src/engine/`, `src/room/`, `src/server/`,
  `wrangler.jsonc`, the unit tests in `tests/*.test.ts` (S1 adds one new one, `tests/design.test.ts`,
  which later cards may only tighten) or anything outside `tools/suibian/` (read `site/`, `docs/` and
  `tools/when/`, never change them). If a card seems to need one of them, stop and say so in the PR.
- **The browser tests in `tests/e2e/` describe what a person can do; they must keep passing.** They
  find things by visible text, roles and `data-*` attributes (`data-cuisine`, `data-occasion`,
  `data-allergen`) and a few class names (`.place`, `.place h3`, `.intro`, `.about`, `.reason`,
  `.mood`, `.menu`, `.menu h3`, `.diet`, `.diet .btn.primary`, `.demo`, `.google`). Keep those
  names, texts and attributes. If a test has to change because the screen changed on purpose
  (say a heading moved), change only that line and say why in the PR.
- **Tokens only.** Colors, font sizes, spacing, corners, shadows and timings are `var(--…)` from
  `site/src/styles/tokens.css`, by their semantic names (`--color-*`, `--type-tool`, `--text-*`,
  `--space-*`, `--r-*`, `--shadow-*`, `--dur-*`, `--ease-*`). The only colors written out are the
  avatar colors, as `var(--gel-…)` in one named TS array, and the QR code's paper white
  (`--color-paper`). From S1 on, `tests/design.test.ts` fails on any value written out in
  `src/client/styles.css`. `tools/when` (约时间) is a changle.ca tool on the same stack that already
  works this way: read it when a card points to it.
- **Night colors only.** Text on amber, mint or any bright color is night (`--color-on-accent`).
  Amber (`--type-tool`) is 随便's light: the room glow at the top, the one primary button on a
  screen, the rank badges, a place you ticked. Mint (`--color-success`) means "liked". Stop red
  (`--color-danger`) is only for the last ten seconds of a countdown and for errors: a 🚫 or a
  veto is not an error, so they dim instead of turning red. A warning always has an icon and words,
  because the warning color is the same amber.
- **Icons** are lucide line icons (`lucide-preact`, the same set and version line as the site's
  `lucide-react`), 20 or 24 px, `aria-hidden` next to a word, with an `aria-label` on an icon-only
  button. The cuisine emoji on the menu and the cards stay: they're what the food is, not icons.
- **Taps:** everything you can press is a real `<button>` or `<a>`, at least 44 px (`--tap`), 48
  where several sit together (`--tap-crowded`), pill-shaped (`--r-pill`).
- **Everything a person reads exists in Chinese and English** (`src/client/i18n.ts`). New words only
  where a card gives them; keep the words the tool already has.
- **Motion** is CSS (`@keyframes`, transitions) and, where it needs the finger's position, the Web
  Animations API. No GSAP (it is for games only and too big for this page). Slides use
  `translateY(var(--motion-shift))`, which tokens.css makes 0 under reduced motion; anything that
  scales, shakes, spins or bursts gets a `@media (prefers-reduced-motion: reduce)` rule that turns it
  into a fade. Taps that matter vibrate briefly where phones allow it (`navigator.vibrate`, silently
  nothing on iPhones).
- Each card works in its own folder and branch (`git worktree`), one PR per card. Don't merge, don't
  push `main`, don't deploy. No keys, secrets or tokens anywhere.

| Card | What | When |
| --- | --- | --- |
| [S1](S1-night-skin.md) | The night skin: tokens, fonts, the amber room light, every color and size from a token | first |
| [S2](S2-screens.md) | The screens as drawn: top bar, bottom dock, home, lobby, round 1, round 2's cards, the result, rating | after S1 is merged |
| [S3](S3-motion.md) | Motion and feel: presses, stamps, the countdown, cards arriving, ticking, the reveal, the tie wheel | after S2 is merged |

The three cards change the same files, so they run one after another, each from the `main` the
last one was merged into.

What to send Codex: a new conversation for each card (on Steve's computer, in Codex's local mode).
For S1:

```
本机的 Changle 仓库里别的对话正在干活，所以不要在原来的文件夹里切分支或改文件：只运行 git fetch origin，然后用 git worktree add 从 origin/main 开一个新文件夹和新分支 codex/suibian-s1-night，只在新文件夹里做。按 docs/codex-tasks/suibian/S1-night-skin.md 做。先读 docs/codex-tasks/suibian/README.md、docs/DESIGN.md 和 site/src/styles/tokens.css，样子看 docs/codex-tasks/suibian/mock/ 里的五个文件。只改卡上写的文件，跑卡上的命令都通过后再开 PR，PR 描述里用文字贴测试输出。卡上的 npx playwright test 会自己在后台开浏览器，这个可以；没装浏览器就先运行 npx playwright install chromium，装不了就把环境变量 PW_CHROME 设成 1 再跑。除此之外不要自己开浏览器，也不要往 PR 里传图片。不要合并，不要推 main，不要部署；代码和提交里都不能出现任何密钥。
```

For S2 and S3 the same message with their branch (`codex/suibian-s2-screens`,
`codex/suibian-s3-motion`) and card file. Paste it as one paragraph (the computer's Chinese input
method is on, so typing it mangles it), and keep words that start with a dollar sign out of it:
Codex's message box turns them into a reference to something else.
