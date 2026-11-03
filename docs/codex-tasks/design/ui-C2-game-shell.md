# ui-C2: the other 13 games into the game shell, one game per PR

**When:** now. The shell is on main (A5, PR #131).
**Files, per PR:** that one game's own files (below), the scripts in `site/scripts/` that click a
button you moved (search them for the button's text or class), and before/after screenshots in
`site/local-shots/c2/<slug>/`. Nothing else: not `site/src/games/GameShell.tsx`, `GameShell.css`,
`site/src/ui/`, `site/src/components/`, the CSS files of other games, or `docs/codex-tasks/README.md`.
**Branch:** `codex/ui-c2-<slug>`, from main, one per game.
**Command:** in `site/`: `npx tsc --noEmit`, every test that `.github/workflows/site.yml` runs, `npm run build`
and `npx tsx scripts/budget.ts`. Then play one whole round in `npm run dev` at 390×844, in Chinese and
in English, with no console errors.

Every one-phone game already sits in `GameShell` and has the shared top bar. A5 gave the shell two more
parts and moved three games onto them. Read them first, they are the pattern:
`site/src/games/TruthDare.tsx`, `Undercover.tsx`, `KingsGame.tsx`, the props at the top of
`GameShell.tsx`, and the 游戏壳 rules in `docs/DESIGN.md`.

## What to do in each game

1. **Bottom buttons (`actions`).** For each moment of the game, the one or two buttons that move it on
   (start, draw, spin, next, done, pass) go into `actions`: a fragment of `<button className="btn btn-… btn-lg">`,
   at most two, the main one last (it lands on the right). Take them out of the game's body. The double-tap
   guards stay exactly as they are (refs like `dealt`, `confirmed`): call the same handler.
   What stays in the body: choices that are part of the picture or the question (difficulty lists, answer
   options, player pickers, the heat switch, a timer's own start/reset), and anything tapped on the picture
   itself (the bottle, the cloche, the sticks).
2. **Tonight's people (`roster`).** Pass `roster={{ turn, out }}` when the game has a turn (`turn`: the
   player's id) or knocks people out (`out`: ids). Each penalty the game shows adds a dot by itself. Leave
   `roster` off when it would show nothing a player needs, or when the game draws its own seats (尤克牌's
   table), and say why in the PR.
3. **Round (`status`).** Pass `status={{ kind: "round", current, total? }}` if the game counts rounds or
   prizes (最佳称号 already says 第 1 个奖，共 8 个). Only from state the game already keeps: add no new rules.
4. **Landscape.** Check every screen at 844×390. The people row and the buttons must stay clear of the game's
   big picture. If they cover it, stop and say so in the PR rather than changing the shell.
5. **Nothing else changes:** rules, words, timings, sounds, penalties, the top bar's extra button.

If a game needs something the shell doesn't have (a team score, a timer in the bar, a third button), don't
build it: do what fits, and list what's missing in the PR.

## The 13 games

Suggested order, simplest first. Each is one PR.

| Game | Slug | Files | Notes |
| --- | --- | --- | --- |
| 七八九 | `seven-eight-nine` | `src/games/Dice789.tsx` | turn from `useTurnOrder`; 掷骰子 to the bottom |
| 命运转盘 | `wheel-of-fate` | `src/games/WheelOfFate.tsx` | turn; 转一个 to the bottom; the dare's countdown stays in the card |
| 流氓十三张 | `rogue-thirteen` | `src/games/Rogue13.tsx` | turn; the draw/flip button |
| 我从来没有 | `never-have-i-ever` | `src/games/PromptDecks.tsx` | no turn, but penalties: roster without `turn`; 抽一张 to the bottom; the pickers stay |
| 你画我猜 | `draw-and-guess` | `src/games/DrawGuess.tsx` | the drawer is the turn; difficulty list stays; the scores stay at the start of each round |
| 最佳称号 | `superlatives` | `src/party/superlatives/` | prizes as `status` with a total |
| 额头便利贴 | `post-it` | `src/party/postit/` | while the phone is on a forehead, its full-screen tap zones stay as they are |
| 木头人蹦迪 | `freeze-dance` | `src/party/freeze/` | the judge's picker stays |
| 林波舞 | `limbo` | `src/party/limbo/` | big picture: check landscape |
| 尤克牌 | `euchre` | `src/party/euchre/` | the table shows the four seats: no roster; 发牌 to the bottom |
| 戏精大赏 | `drama-queens` | `src/party/drama/` | the actor is the turn; rounds |
| 猜歌名 | `name-that-tune` | `src/party/tune/` | songs as `status` with a total; answer options stay |
| 神回复 | `punchline` | `src/party/punchline/` | the biggest; stop and report if the shell doesn't fit |

## Screenshots, in each PR

Before (main) and after, at 390×844, in Chinese: each moment whose buttons moved. One moment in English.
One landscape (844×390) if the game has a big picture. Save them in `site/local-shots/c2/<slug>/` and show
them in the PR. Once ui-C6 (the screenshot check in CI) is on main, the game's reference screenshot will
change: say so in the PR, and the reviewer adds the `update-screenshots` label.

## Done when, for each PR

- The command passes; paste its output.
- A whole round plays in both languages with no console errors; the buttons that moved are at least 44px
  tall (they are `btn-lg`, 60).
- The PR lists, per moment, which buttons moved to the bottom, what `roster` and `status` show, and anything
  missing from the shell.
- Don't touch `games/`, `tools/`, `site/worker/`, secrets, or another game's files.
