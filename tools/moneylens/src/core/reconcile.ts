/**
 * Reconciliation (ACC-2): the balance before the import plus the import's lines equals the
 * balance after it, to the cent. An import that doesn't, or that has no balances to check, can
 * still be saved, but only with the "unreconciled" mark showing. Nothing here rounds or forgives a
 * cent.
 */
import { add, isMinor, total } from "./money";

export type Reconciliation =
  /** opening + lines = closing. */
  | { status: "reconciled"; opening: number; closing: number; sum: number }
  /** It doesn't add up. `difference` is the stated closing balance minus the one worked out: positive when the file is missing money in. */
  | { status: "mismatch"; opening: number; closing: number; sum: number; difference: number }
  /** There was nothing to check against. */
  | { status: "unchecked"; why: "no-opening" | "no-closing" | "no-balances"; sum: number };

/**
 * Checks an import's lines against the balances around them. `opening` is the account's balance
 * just before the first line and `closing` just after the last: from the file when it states them,
 * otherwise the last reconciled balance MoneyLens holds for the account, or what the user reads off
 * the bank's page.
 */
export function reconcile(lines: Iterable<{ amount: number }>, opening?: number, closing?: number): Reconciliation {
  const amounts: number[] = [];
  for (const l of lines) {
    if (!isMinor(l.amount)) throw new RangeError("reconcile: not a whole amount");
    amounts.push(l.amount);
  }
  const sum = total(amounts);
  const has = (n: number | undefined): n is number => n !== undefined && isMinor(n);
  if (!has(opening) && !has(closing)) return { status: "unchecked", why: "no-balances", sum };
  if (!has(opening)) return { status: "unchecked", why: "no-opening", sum };
  if (!has(closing)) return { status: "unchecked", why: "no-closing", sum };
  const difference = closing - add(opening, sum);
  return difference === 0 ? { status: "reconciled", opening, closing, sum } : { status: "mismatch", opening, closing, sum, difference };
}

/** ACC-2's visible mark: everything but a clean reconciliation carries it. */
export const unreconciled = (r: Reconciliation): boolean => r.status !== "reconciled";

/**
 * For a file with a running balance on its lines (oldest first): the balances before its first
 * line and after its last, and the first line whose balance doesn't follow from the one before it
 * (`breaksAt`, absent when every step follows). Lines without a balance are stepped over by their
 * amounts. Null when no line has a balance.
 *
 * A break is only a hint: some banks list one day's lines in another order than they were posted,
 * so the steps inside that day don't chain even though the day adds up. What decides is `reconcile`
 * on the two ends.
 */
export function runningBalances(lines: readonly { amount: number; balance?: number }[]): { opening: number; closing: number; breaksAt?: number } | null {
  const first = lines.findIndex((l) => l.balance !== undefined);
  if (first < 0) return null;
  let last = first;
  for (let i = lines.length - 1; i > first; i--) {
    if (lines[i]!.balance !== undefined) {
      last = i;
      break;
    }
  }
  // back from the first stated balance to before the first line, forward from the last one to after the last line
  let opening = lines[first]!.balance!;
  for (let i = first; i >= 0; i--) opening = add(opening, -lines[i]!.amount);
  let closing = lines[last]!.balance!;
  for (let i = last + 1; i < lines.length; i++) closing = add(closing, lines[i]!.amount);
  let breaksAt: number | undefined;
  let at = lines[first]!.balance!;
  for (let i = first + 1; i < lines.length && breaksAt === undefined; i++) {
    at = add(at, lines[i]!.amount);
    const stated = lines[i]!.balance;
    if (stated === undefined) continue;
    if (stated !== at) breaksAt = i;
    at = stated;
  }
  return { opening, closing, ...(breaksAt === undefined ? {} : { breaksAt }) };
}
