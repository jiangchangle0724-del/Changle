/**
 * 重复的小票 (Steve, 2026-11-19: 你要提示是不是有重复的 receipt). He photographs receipts as he goes and
 * adds them later, several at a time, so one can come round twice: twice in one go, or once more after
 * it was recorded. A receipt is the same as another when its total (in the currency it was paid in, in
 * smallest units), its day and its business are: a business read on neither counts as the same, read on
 * one only as not (a typed expense with no business is not taken for a receipt). Saying so is all this
 * does; the screens decide what follows (几张小票 leaves the second out, 记一笔 says it above the amount).
 */
import { expensesOf, toMinor, type Expense, type Ledger } from "./core";
import type { Draft } from "./draft";
import { decimalsOf } from "./format";
import { spentOn } from "./lines";

/** What a receipt says, to know it again. */
export type Said = { total: number; currency: string; date: string; merchant: string };

/** a business's name, to compare: its letters and digits, in lower case ("McDonald's" is "MCDONALDS") */
const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export const sameSaid = (a: Said, b: Said) => a.total === b.total && a.currency === b.currency && a.date === b.date && plain(a.merchant) === plain(b.merchant);

/** What an expense or an amount being typed says, the same way (a day not picked is `today`); nothing without an amount. */
export function saidOf(d: Pick<Draft, "text" | "currency" | "date" | "merchant">, today: string): Said | null {
  const total = toMinor(d.text, decimalsOf(d.currency));
  return total ? { total, currency: d.currency, date: d.date || today, merchant: d.merchant.trim() } : null;
}

const saidOfExpense = (l: Ledger, e: Expense): Said => ({
  total: e.paidIn ? e.paidIn.amount : e.amount,
  currency: e.paidIn ? e.paidIn.currency : l.currency,
  date: spentOn(e),
  merchant: e.merchant ?? "",
});

/** The expense in the ledger this receipt looks like (the latest, when there are more), leaving out `but` (the one being changed). */
export function twinIn(l: Ledger, s: Said, but?: string): Expense | null {
  return (
    expensesOf(l)
      .filter((e) => e.id !== but && sameSaid(saidOfExpense(l, e), s))
      .at(-1) ?? null
  );
}

export type Twin = { ledger: Expense } | { row: number };

/**
 * In a batch read in any order: for each row read, what it looks like, if anything. An expense already
 * recorded first; else a row before it that will be recorded (`kept`: it has an amount), so of two the
 * first stays. Rows not read yet say nothing, and are looked at again once they are.
 */
export function twinsOf(rows: { said?: Said | null; kept: boolean }[], l: Ledger): (Twin | null)[] {
  return rows.map((r, i) => {
    if (!r.said) return null;
    const recorded = twinIn(l, r.said);
    if (recorded) return { ledger: recorded };
    const before = rows.findIndex((o, j) => j < i && o.kept && !!o.said && sameSaid(o.said, r.said!));
    return before >= 0 ? { row: before } : null;
  });
}
