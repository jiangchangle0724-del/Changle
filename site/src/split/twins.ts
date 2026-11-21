/**
 * One bill, on more than one piece of paper (Steve, 2026-11-19: 你要提示是不是有重复的 receipt; and
 * 11-21: an itemized receipt and its card slip "is supposed to be 1 bill based on the time, amount,
 * name of the place … the only difference is that one of them has tip"). He photographs receipts as
 * he goes and adds them later, several at a time, so one bill can come round twice: the same receipt
 * twice, a receipt and the card slip that adds the tip, or either once more after it was recorded.
 *
 * Two are one bill when, in the same currency and on the same day, what was paid before any tip is the
 * same (Deer Garden's receipt, $40.45; its slip, $45.30 with a $4.85 tip), the business is the same
 * (one name inside the other, as a slip's "DEER GARDEN SIGNATURE" has "Deer Garden"; the shorter at
 * least four letters or digits, or the two the same; read on neither counts as the same, on one only
 * as not, so a typed expense is never taken for a receipt), and, when both say the time, they were
 * printed no more than two hours apart (a bill can be printed when asked for and paid a while after).
 * Saying so is all this does, with putting two together (joinBill); the screens decide what follows.
 */
import { expensesOf, toMinor, type Expense, type Ledger } from "./core";
import type { Draft } from "./draft";
import { decimalsOf } from "./format";
import { spentOn } from "./lines";

/** What a receipt says, to know its bill again: its total and the tip in it, in smallest units. */
export type Said = { total: number; tip: number; currency: string; date: string; merchant: string; time?: string };

/** a business's name, to compare: its letters and digits, in lower case ("McDonald's" is "MCDONALDS") */
const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function sameBusiness(a: string, b: string): boolean {
  const [x, y] = [plain(a), plain(b)];
  if (!x || !y) return !x && !y;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short === long || (short.length >= 4 && long.includes(short));
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const sameBill = (a: Said, b: Said) =>
  a.currency === b.currency &&
  a.date === b.date &&
  a.total - a.tip === b.total - b.tip &&
  sameBusiness(a.merchant, b.merchant) &&
  (!a.time || !b.time || Math.abs(minutes(a.time) - minutes(b.time)) <= 120);

/** What an expense or an amount being typed says, the same way (a day not picked is `today`, a time only when read); nothing without an amount. */
export function saidOf(d: Pick<Draft, "text" | "tip" | "currency" | "date" | "merchant">, today: string, time?: string): Said | null {
  const total = toMinor(d.text, decimalsOf(d.currency));
  if (!total) return null;
  return { total, tip: toMinor(d.tip, decimalsOf(d.currency)) ?? 0, currency: d.currency, date: d.date || today, merchant: d.merchant.trim(), ...(time ? { time } : {}) };
}

/**
 * Two drafts of one bill put together, into the first: the larger total (the one with the tip in it)
 * with its tip, the tax either says, the shorter name (the one the other has in it: "Deer Garden", not
 * the slip's "Deer Garden Signature"), and where and how it was paid from whichever says.
 */
export function joinBill(a: Draft, b: Draft): Draft {
  const total = (d: Draft) => toMinor(d.text, decimalsOf(d.currency)) ?? 0;
  const [big, small] = total(b) > total(a) ? [b, a] : [a, b];
  const names = [a.merchant.trim(), b.merchant.trim()].filter(Boolean).sort((x, y) => x.length - y.length);
  return { ...a, text: big.text, tip: big.tip || small.tip, tax: a.tax || b.tax, merchant: names[0] ?? "", place: a.place || b.place, payment: a.payment || b.payment, date: a.date || b.date };
}

const saidOfExpense = (l: Ledger, e: Expense): Said => ({
  total: e.paidIn ? e.paidIn.amount : e.amount,
  tip: e.tip ?? 0,
  currency: e.paidIn ? e.paidIn.currency : l.currency,
  date: spentOn(e),
  merchant: e.merchant ?? "",
});

/** The expense in the ledger this receipt looks like (the latest, when there are more), leaving out `but` (the one being changed). */
export function twinIn(l: Ledger, s: Said, but?: string): Expense | null {
  return (
    expensesOf(l)
      .filter((e) => e.id !== but && sameBill(saidOfExpense(l, e), s))
      .at(-1) ?? null
  );
}

export type Twin = { ledger: Expense } | { row: number };

/**
 * In a batch read in any order: for each row read, the bill it is part of, if another has it. An expense
 * already recorded first; else a row before it that will be recorded (`kept`: it has an amount), so of
 * two the first stays (and takes the second in: joinBill). Rows not read yet say nothing, and are
 * looked at again once they are.
 */
export function twinsOf(rows: { said?: Said | null; kept: boolean }[], l: Ledger): (Twin | null)[] {
  return rows.map((r, i) => {
    if (!r.said) return null;
    const recorded = twinIn(l, r.said);
    if (recorded) return { ledger: recorded };
    const before = rows.findIndex((o, j) => j < i && o.kept && !!o.said && sameBill(o.said, r.said!));
    return before >= 0 ? { row: before } : null;
  });
}
