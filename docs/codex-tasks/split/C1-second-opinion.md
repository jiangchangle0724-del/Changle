# C1: a second opinion on the arithmetic

**Files:** `site/tests/split/second.ts` (new), `site/tests/split-second.test.ts` (new), and one line
in `.github/workflows/site.yml` to run the new test in CI (after `tests/split.test.ts`).
**Command:** `npx tsx tests/split-second.test.ts` (plain tsx, like `tests/split.test.ts`: print
`ok` lines, exit 1 on a failure).

两清 moves people's money around on paper, so its sums are done twice by two authors who haven't
seen each other's work. Claude Code wrote `site/src/split/core/`. You write the same arithmetic
again from the rules on this card, then run both over the same 10,000 made-up ledgers. Where the
two differ, one of them has a bug, and the rules below say which.

## The order of work (this is the point of the card)

1. **Before `second.ts` is written and committed, do not open** `site/src/split/core/money.ts`,
   `split.ts`, `settle.ts`, `ledger.ts`, `index.ts` or `site/tests/split.test.ts`. You may read
   `site/src/split/core/types.ts` (the shapes, no arithmetic) and `site/tests/split/ledgers.ts`
   (the made-up ledgers).
2. Write `site/tests/split/second.ts` from this card alone. Commit it by itself.
3. Only then write `site/tests/split-second.test.ts`, which imports both and compares them.
4. If they differ: work out from the rules below which one is wrong, by hand, on the smallest
   ledger that shows it. If yours is wrong, fix yours and say in the PR what you had misread. If the
   core is wrong, **don't change the core and don't bend yours to match**: leave the test failing on
   that case, and put the seed, the entry and both answers in the PR.

## What a ledger is

`Ledger`, `Member`, `Expense`, `Transfer` and `Split` in `site/src/split/core/types.ts`.

- Every amount is a whole number of the currency's smallest unit. Sums stay below 2^53, so plain
  numbers are exact; never divide into a fraction and round later.
- **The roster** is `ledger.members`, in that order. Wherever a rule says "in roster order", the
  order a split happens to list people in doesn't matter.
- An entry with `gone` set (to any number) counts for nothing. `paidIn` and `note` play no part in
  the sums. The made-up ledgers hold only sound entries: every id is a member's, amounts are whole
  and above zero, a transfer is between two different people, typed amounts add up.

## The rules

**1. What each person bears of one expense** (`amount`, `split`, `rot`):

- `equal`: the people in `among`, taken in roster order, k of them. Each bears
  `floor(amount / k)`. The `amount mod k` units left over go one each to those people, starting
  with the one at position `rot mod k` (counting from 0, in roster order) and wrapping round.
  $100.00 between three with `rot` 0 is 3334, 3333, 3333; with `rot` 1 it is 3333, 3334, 3333;
  $100.01 with `rot` 2 is 3334, 3333, 3334.
- `shares`: the people whose share is above zero, in roster order, k of them, S their shares added
  up. Each bears `floor(amount × share / S)`. The units left over (the amount less those floors
  added up; always fewer than k) go one each to those people, starting at position `rot mod k`
  and wrapping, exactly as above: the size of someone's share plays no part in who gets an odd
  unit. $1.00 by shares 1 and 2 with `rot` 0 is 34 and 66; with `rot` 1 it is 33 and 67.
- `exact`: each bears what `amounts` says. An amount of 0 takes no part.

**2. Where each person stands:** what they paid for expenses, less what they bear of every
expense, plus the transfers they made, less the transfers made to them. Above zero they are owed;
below, they owe. The whole roster always adds up to zero.

**3. The fewest transfers.** Given everyone's standing, the smallest number of transfers (one
person pays another a whole amount above zero) after which everyone stands at zero. Five people
standing at +10850, +4250, +400, −7750, −7750 need 4. Six standing at +100, −100, +250, −250,
+30, −30 need 3.

Find it **by searching over the transfers themselves** (for instance: take the first person not at
zero, try settling them completely with each person on the other side in turn, and recurse; keep
the smallest count). Don't do it by grouping people into sets that cancel out and counting the
groups: that is how the core does it, and two answers from the same idea check nothing. Prune as
you like, as long as the answer stays the true fewest.

## What `second.ts` exports

```ts
import type { Expense, Ledger } from "../../src/split/core/types";

/** What each member bears of this expense, by member id (members who take no part are left out). */
export function parts(expense: Expense, ledger: Ledger): Record<string, number>;

/** Where each member stands, by member id, every member present. */
export function standing(ledger: Ledger): Record<string, number>;

/** The fewest transfers that bring these standings (in roster order, adding up to zero) to zero. */
export function fewest(nets: number[]): number;
```

No imports but that type-only one. No classes, no cleverness: someone checking money by hand
should be able to follow it.

## What `split-second.test.ts` checks

For `randomLedger(seed)`, seeds 1 to 10,000 (`tests/split/ledgers.ts`), with the core imported
from `../src/split/core`:

1. Every expense that counts: `parts(e, l)` equals the core's `portionsOf(e, l)` (same people,
   same amounts).
2. `standing(l)` equals the core's `balances(l)`.
3. Where up to 12 people are not at zero: `fewest(nets)` equals `settle(nets).length`, with
   `nets` the standings in roster order. (Past 12 the search takes too long to run on every
   push; the core's own test covers those.)
4. Every ledger: the core's `settle(nets)` really settles (whole amounts above zero, nobody pays
   themselves, everyone at zero after).

Print one `ok` line per check with the count compared, and the time taken. The whole file runs in
under 60 seconds on a laptop; say what you measured in the PR.

## Done when

- `npx tsx tests/split-second.test.ts` prints all `ok` (or fails only on a case where, by the rules
  above, the core is the one that is wrong: then the PR says so, with the seed).
- `second.ts` was committed before the test that imports the core, and the PR says so.
- `npx tsc --noEmit` passes, and so does every other step in `.github/workflows/site.yml`.
- The PR has the test's output, the time, and for the search in rule 3 two lines on how it prunes.
