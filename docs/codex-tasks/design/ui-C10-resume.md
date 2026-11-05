# ui-C10: the other 13 games keep their progress, one game per PR

**When:** after the shell's resume work is on main (`site/src/games/Resume.tsx`, `saved.ts`).
**Files, per PR:** that one game's own files (below), `site/scripts/party_test.py` only if a test clicks
something you changed, and screenshots in `site/local-shots/c10/<slug>/`. Nothing else: not
`site/src/games/GameShell.tsx`, `Resume.tsx`, `saved.ts`, `GameRun.ts`, `GameTally.tsx`, `site/src/router.ts`,
`site/src/lib/`, `site/src/ui/`, `site/src/components/`, the files of other games, or `docs/codex-tasks/README.md`.
**Branch:** `codex/ui-c10-<slug>`, from main, one per game.
**Command:** in `site/`: `npx tsc --noEmit`, every test that `.github/workflows/site.yml` runs, `npm run build`
and `npx tsx scripts/budget.ts`. Then the checks below in `npm run dev` at 390×844, in Chinese and in
English, with no console errors.

A party game on one phone gets reloaded more than you'd think: Safari closes a tab in the background, a
thumb pulls the page down, the phone locks during a long dare. Today that loses the game: the deal, the
scores, who is out. The shell can now keep a game's progress on the phone and, when the game is opened
again, ask 这局还在，回来继续？ Three games already do it. Read them first, they are the pattern:

- `site/src/games/Undercover.tsx` (谁是卧底): a game with an end; keeps the words, who has which, the round.
- `site/src/games/Dice789.tsx` (七八九): a game with no end; keeps the glass and whose roll it is (`useTurnOrder(saved?.turn)`).
- `site/src/games/TruthDare.tsx` (真心话大冒险): keeps the card on the table and the cards still to come (`Deck.keep()` and `Deck.restore()`).

And `site/src/games/Resume.tsx` (what `Resume` and `useKeepProgress` do), and the 游戏壳 rules in `docs/DESIGN.md`.

## What to do in each game

1. **Wrap the export.** `export function X({ onBack })` becomes a wrapper that renders
   `<Resume<Kept> game="<the game's id in registry.ts>" version={1}>{(saved) => <XGame onBack={onBack} saved={saved} />}</Resume>`,
   and the old body moves into `function XGame({ onBack, saved }: { onBack: () => void; saved: Kept | null })`.
2. **Decide what to keep (`type Kept`).** The smallest set of plain data that puts the game back where it
   was: the phase, scores, whose turn, who is out, the cards still to come, the words or answers already
   written. Plain data only (it goes through JSON): ids and strings and numbers, not functions, refs or
   class objects. Not timers in flight, animations, an open lid, sounds.
3. **Start from it.** Every `useState` whose value is in `Kept` starts from `saved?.x ?? <the old default>`.
   A turn order: `useTurnOrder(saved?.turn ?? 0)` and keep `turn.index`. A deck: build it, then
   `deck.restore(saved.cards)`; keep `deck.keep()`. A heat or level change that rebuilds the decks must not
   throw the kept ones away on the first render (see TruthDare's `decksHeat`).
4. **Keep it while the game is on.** `useKeepProgress<Kept>({ ... }, going)`, with `going` true from the
   game's first move to its end: false at the setup and at the final result (then nothing is offered).
   A game with no end: a flag that turns true on the first move (`rolled`, `played`) and stays.
5. **A moment that can't come back as it was** (a countdown running, a phone on a forehead, a sensor
   reading, a song playing): keep it as the step just before it (the 准备好了 screen, the pass-the-phone
   curtain), so the game picks up there. Say which in the PR.
6. **Nothing else changes:** rules, words, timings, sounds, penalties. The penalty dots, the tally, 再来一局
   and 换个游戏 are the shell's: they already work with what you keep.

## Check, in each PR

1. Start a game, play two or three moves, reload: 这局还在，回来继续？ shows. 继续这局: the same moment,
   the same people, the same scores or cards, and the penalty dots as they were.
2. Reload again, 重新开始: the game's setup. Reload: nothing is offered.
3. Play a move, ‹, 换个游戏, open the game again: nothing is offered.
4. Play to the end: open the game again, nothing is offered.
5. Change tonight's people (add or remove one), open the game: nothing is offered.
6. All of it in Chinese and English, 390×844 and 844×390. Screenshots of the question and of the moment
   it brought back, before and after the reload.

## The 13 games

Suggested order, simplest first. Each is one PR.

| Game | Slug | Files | Notes |
| --- | --- | --- | --- |
| 命运转盘 | `wheel-of-fate` | `src/games/WheelOfFate.tsx` | no end; turn; the slices fired so far if the game tracks them |
| 流氓十三张 | `rogue-thirteen` | `src/games/Rogue13.tsx` | no end; the deck (`keep`/`restore`) and the turn |
| 我从来没有 | `never-have-i-ever` | `src/games/PromptDecks.tsx` | no end; the deck chosen and the cards still to come |
| 国王游戏 | `kings-game` | `src/games/KingsGame.tsx` | the round, the king, the numbers dealt |
| 你画我猜 | `draw-and-guess` | `src/games/DrawGuess.tsx` | scores and the drawer; a drawing half done comes back as the start of that turn |
| 最佳称号 | `superlatives` | `src/party/superlatives/` | the awards given and the votes so far |
| 额头便利贴 | `post-it` | `src/party/postit/` | while a phone is on a forehead: back to the curtain before it |
| 木头人蹦迪 | `freeze-dance` | `src/party/freeze/` | rounds and who is caught; mid-song: back before the music |
| 林波舞 | `limbo` | `src/party/limbo/` | level, who is out, the bar's mode; mid-countdown or mid-sensor: back to 准备好了 |
| 尤克牌 | `euchre` | `src/party/euchre/` | the score, the dealer, the hands; mid-trick: the start of that trick if the hand can't be kept |
| 戏精大赏 | `drama-queens` | `src/party/drama/` | the act, the actor, the votes |
| 猜歌名 | `name-that-tune` | `src/party/tune/` | scores and the song number; mid-song: back before it plays |
| 神回复 | `punchline` | `src/party/punchline/` | the answers written so far are the precious part: keep them; the biggest, do it last |

If a game needs something the shell doesn't have, don't build it: do what fits, and list what's missing in the PR.
