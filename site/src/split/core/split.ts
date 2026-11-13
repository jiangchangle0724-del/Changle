/**
 * How one expense is shared out. Three ways: equally, by shares (a family of three counts 3), or
 * by amounts typed in. Whatever the way, the parts add up to the expense exactly.
 *
 * The odd cents: $100 between three is 33.33 each and one cent over. That cent goes to one person,
 * and whose turn it is moves on with every odd cent handed out (`rot`, kept on the expense), so
 * over a trip nobody is the one who always pays the extra cent.
 */
import type { Split } from "./types";

/** The most shares one member can hold: enough for any family, and the sums stay exact. */
export const MAX_SHARES = 999;

/** A whole number of shares, 1 to MAX_SHARES. */
export const isShares = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_SHARES;

/**
 * `amount` shared out by `weights`, a part for each weight in the same order. Each part is its exact
 * proportion rounded down to a whole smallest unit; the units left over (always fewer than the
 * people sharing) go one each to the people with a weight, in list order, starting `rot` places in
 * and wrapping round. A weight of 0 takes no part and never gets an odd unit.
 *
 * allot(10000, [1, 1, 1], 0) is [3334, 3333, 3333]; with rot 1, [3333, 3334, 3333].
 */
export function allot(amount: number, weights: number[], rot: number): number[] {
  const total = weights.reduce((a, w) => a + w, 0);
  if (total <= 0) return weights.map(() => 0);
  // amount * w is a whole number well inside what a number holds exactly (1e10 * 3e4), so taking
  // its remainder off and dividing is exact: this is floor(amount * w / total) with no rounding
  const parts = weights.map((w) => (amount * w - ((amount * w) % total)) / total);
  const live = weights.flatMap((w, i) => (w > 0 ? [i] : []));
  const over = amount - parts.reduce((a, p) => a + p, 0);
  // (a turn that isn't a whole number, from an entry damaged in storage, starts from the top)
  const turn = Number.isSafeInteger(rot) ? rot : 0;
  const start = ((turn % live.length) + live.length) % live.length;
  for (let j = 0; j < over; j++) parts[live[(start + j) % live.length]] += 1;
  return parts;
}

/** How many odd units allot() hands out for this amount and these weights: the next expense's turn starts that many places on. */
export function oddUnits(amount: number, weights: number[]): number {
  const total = weights.reduce((a, w) => a + w, 0);
  if (total <= 0) return 0;
  return amount - weights.reduce((a, w) => a + (amount * w - ((amount * w) % total)) / total, 0);
}

/**
 * The weight of every member on the roster for this split, in roster order: 1 or 0 for an equal
 * split, the shares for a split by shares. Null for a split by amounts (it has no weights).
 * The roster's order is the order odd units go round in, so it never depends on the order the
 * split happens to list people.
 */
export function weightsOf(split: Split, roster: string[]): number[] | null {
  if (split.how === "equal") return roster.map((id) => (split.among.includes(id) ? 1 : 0));
  if (split.how === "shares") return roster.map((id) => split.shares[id] ?? 0);
  return null;
}

/**
 * What each member bears of an expense of `amount`, by member id; members who take no part are
 * left out. `roster` is every member's id in the ledger's order. Assumes the split is sound
 * (ledger.ts, problem()): for a split by amounts, it is what was typed.
 */
export function portions(amount: number, split: Split, rot: number, roster: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (split.how === "exact") {
    for (const id of roster) if (split.amounts[id] > 0) out[id] = split.amounts[id];
    return out;
  }
  const weights = weightsOf(split, roster) ?? [];
  const parts = allot(amount, weights, rot);
  roster.forEach((id, i) => {
    if (weights[i] > 0) out[id] = parts[i];
  });
  return out;
}
