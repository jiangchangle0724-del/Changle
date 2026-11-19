/**
 * Totals: what came in, what was spent, and on what. Whole smallest units throughout, one set of
 * totals per currency, never converted (ACC-6: MoneyLens does not convert).
 *
 * - Moves between the user's own accounts and credit card payments are not spending and not
 *   income (ACC-4): a paired line, or one in a category of kind "transfer", is counted only under
 *   `movedOut` and `movedIn`.
 * - A refund or a reversal lowers the spending of the category it is in (ACC-4): a positive
 *   amount in an expense category is subtracted from it.
 * - A line with no category counts as spending when it left the account and as income when it
 *   arrived, under `unsortedOut` and `unsortedIn`.
 * - A split line counts part by part.
 *
 * These describe the user's own past transactions. Nothing here forecasts or recommends.
 */
import { monthOf, type Day } from "./dates";
import { add } from "./money";
import type { CategoryKind } from "./classify";

/** One transaction as the totals need it: already classified. */
export type Entry = {
  posted: Day;
  amount: number;
  currency: string;
  category: string | null;
  /** The other half of a move between the user's accounts, when it is one. */
  pair?: string;
  splits?: readonly { category: string | null; amount: number }[];
};

export type Totals = {
  /** Money in, in income categories and unsorted, less anything taken back out of them. */
  income: number;
  /** Money out, in expense categories and unsorted, less refunds. */
  spending: number;
  /** income - spending. */
  net: number;
  /** Spending by expense category and income by income category, each as a positive number when money went the usual way. */
  byCategory: Record<string, number>;
  unsortedOut: number;
  unsortedIn: number;
  /** Moves between the user's own accounts: what left and what arrived. */
  movedOut: number;
  movedIn: number;
  /** How many lines went into these totals. */
  count: number;
};

const empty = (): Totals => ({ income: 0, spending: 0, net: 0, byCategory: {}, unsortedOut: 0, unsortedIn: 0, movedOut: 0, movedIn: 0, count: 0 });

function count(into: Totals, amount: number, category: string | null, moved: boolean, kindOf: (id: string) => CategoryKind | undefined): void {
  const kind = category === null ? undefined : kindOf(category);
  if (moved || kind === "transfer") {
    if (amount < 0) into.movedOut = add(into.movedOut, -amount);
    else into.movedIn = add(into.movedIn, amount);
    return;
  }
  if (kind === "expense") {
    into.spending = add(into.spending, -amount);
    into.byCategory[category!] = add(into.byCategory[category!] ?? 0, -amount);
  } else if (kind === "income") {
    into.income = add(into.income, amount);
    into.byCategory[category!] = add(into.byCategory[category!] ?? 0, amount);
  } else if (amount < 0) {
    into.spending = add(into.spending, -amount);
    into.unsortedOut = add(into.unsortedOut, -amount);
  } else {
    into.income = add(into.income, amount);
    into.unsortedIn = add(into.unsortedIn, amount);
  }
}

/** Totals per currency for the entries posted from `from` to `to` (both included; either left out means no limit on that side). */
export function summarize(entries: Iterable<Entry>, kindOf: (id: string) => CategoryKind | undefined, range: { from?: Day; to?: Day } = {}): Record<string, Totals> {
  const out: Record<string, Totals> = {};
  for (const e of entries) {
    if ((range.from && e.posted < range.from) || (range.to && e.posted > range.to)) continue;
    const totals = (out[e.currency] ??= empty());
    totals.count++;
    if (e.splits?.length && !e.pair) for (const part of e.splits) count(totals, part.amount, part.category, false, kindOf);
    else count(totals, e.amount, e.category, e.pair !== undefined, kindOf);
  }
  for (const t of Object.values(out)) t.net = add(t.income, -t.spending);
  return out;
}

/** The same totals month by month: `{ "2026-10": { CAD: … }, … }`. */
export function monthly(entries: Iterable<Entry>, kindOf: (id: string) => CategoryKind | undefined): Record<string, Record<string, Totals>> {
  const months = new Map<string, Entry[]>();
  for (const e of entries) {
    const month = monthOf(e.posted);
    const list = months.get(month);
    if (list) list.push(e);
    else months.set(month, [e]);
  }
  const out: Record<string, Record<string, Totals>> = {};
  for (const month of [...months.keys()].sort()) out[month] = summarize(months.get(month)!, kindOf);
  return out;
}

/** Do a split's parts add up to the line's amount? (They must, before a split is saved.) */
export function splitAddsUp(amount: number, parts: readonly { amount: number }[]): boolean {
  let sum = 0;
  for (const p of parts) sum = add(sum, p.amount);
  return sum === amount;
}
