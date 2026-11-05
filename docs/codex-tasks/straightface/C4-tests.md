# C4: tests that the views leak nothing, the edges, the browser run

**Files:** a new `site/tests/straightface-views.test.ts` and `site/tests/straightface-edges.test.ts`
(plain `tsx` tests in the style of `tests/straightface.test.ts`: `ok` lines, exit 1 on a failure),
one line each in `.github/workflows/site.yml` to run them after `tests/straightface.test.ts`, and
`site/scripts/straightface_check.py` where it says below. Never the engine.
**Command:** `npx tsx tests/straightface-views.test.ts && npx tsx tests/straightface-edges.test.ts`,
then `python3 scripts/straightface_check.py` with the site running.

## 1. The views leak nothing

Every phase (peek, explain, bets, accuse, reveal, between) × every role × both modes
(`mode: "pass"` and `"online"`) × a few seeds, as a parametrised loop:

- `JSON.stringify(privateView(state, pid))` of anyone but the honest player never contains the
  card's definition (either language) before the reveal; of anyone but the judge never contains
  `suspectId` with a value; no phone's view has an `honestId` field at all; nobody's view contains
  another player's bet before the reveal.
- `JSON.stringify(publicView(state))` before the reveal contains no `honestId`, no definition, and
  no bet targets (counts only).
- `result.preLines` never contain 老实人, 看穿, 骗过, "honest".
- In pass mode, only `phoneHolderId` has `mayPeekNow` / `mayBetNow` true; in online mode everyone
  still waiting has it.

## 2. The edges

9 players; 3 players (no bets phase); `roundsPerPlayer: 2` (18 rounds for 9); `packs` narrowed to
one pack with too few cards (the round's `level` is the level actually dealt, and cards repeat only
when the pack is used up); `allowAdult` on and off with a deck that has an adult card; `PEEKED`
twice; `BET` out of order in pass mode and in any order online; `NEXT_ROUND` twice; `START_ROUND`
straight from `reveal`; accusing the tagged player; `TAG_SUSPECT` after the last speaker; every
guard's `GameError.code`.

## 3. The browser run

`scripts/straightface_check.py` already plays a whole game at iPhone size in both languages. Add,
without slowing it much: a 3-player game (no bets); a game with the custom penalty set in the
phone's settings (`customPenalty: "做十个深蹲"`), where no line on screen says 喝 or "drink";
a check that nothing private is in the DOM while the curtain is up (`document.body.innerText`
contains neither the definition nor the seeds); and a run at 320 px wide with no sideways scroll.

## When it's done

- All three commands pass locally; CI's `site` workflow green on the PR.
- If a test finds a leak or a wrong score, write the failing test, describe it in the PR and stop:
  Claude Code fixes the engine.
