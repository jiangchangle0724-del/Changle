/**
 * 总结, at the foot of the 结清 page (Steve, 2026-11-15): what the ledger spent in all, and in how
 * many expenses; the tips and tax its receipts said, and on how many; who paid the most, and whose
 * share came to the most. All in the ledger's currency: a tip or tax paid in another currency comes
 * across at that expense's own rate (its amount, for what was paid in the other one). Only the
 * expenses that count (core/ledger.ts, expensesOf); a transfer is no spending.
 */
import { expensesOf, paidBy, portionsOf, type Expense, type Ledger } from "./core";

/** Who came to the most (more than one, in the roster's order, when they came to the same), and how much. */
export type Most = { who: string[]; amount: number };

export type Summary = {
  /** everything spent (less what came back), and in how many expenses */
  spent: number;
  count: number;
  /** what came back (refunds), and in how many */
  refunds: number;
  refunded: number;
  /** the tips the receipts said, and on how many expenses; the same for tax */
  tips: number;
  tipped: number;
  tax: number;
  taxed: number;
  /** who paid the most; whose share came to the most. None while nothing has been spent */
  paidMost: Most | null;
  spentMost: Most | null;
};

/** A tip or tax in the ledger's currency: as it is, or across at the expense's own rate. */
export const inLedger = (n: number, e: Pick<Expense, "amount" | "paidIn">) => (e.paidIn && e.paidIn.amount > 0 ? Math.round((n * e.amount) / e.paidIn.amount) : n);

function most(sums: Map<string, number>, roster: string[]): Most | null {
  const top = Math.max(0, ...sums.values());
  return top > 0 ? { who: roster.filter((id) => sums.get(id) === top), amount: top } : null;
}

export function summaryOf(l: Ledger): Summary {
  const roster = l.members.map((m) => m.id);
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const s: Summary = { spent: 0, count: 0, refunds: 0, refunded: 0, tips: 0, tipped: 0, tax: 0, taxed: 0, paidMost: null, spentMost: null };
  for (const e of expensesOf(l)) {
    // (a refund the other way round: it comes off what was spent, what whoever got it paid, and each one's share)
    const way = e.refund ? -1 : 1;
    s.spent += way * e.amount;
    if (e.refund) {
      s.refunds += e.amount;
      s.refunded++;
    } else s.count++;
    for (const [id, n] of Object.entries(paidBy(e))) paid.set(id, (paid.get(id) ?? 0) + way * n);
    for (const [id, part] of Object.entries(portionsOf(e, l))) share.set(id, (share.get(id) ?? 0) + way * part);
    if (e.tip) {
      s.tips += inLedger(e.tip, e);
      s.tipped++;
    }
    if (e.tax) {
      s.tax += inLedger(e.tax, e);
      s.taxed++;
    }
  }
  return { ...s, paidMost: most(paid, roster), spentMost: most(share, roster) };
}
