/**
 * 每人明细 (Steve, 2026-11-26, borrowed from IHateMoney, SplitPro and Cospend, which each show a
 * table of who paid what): for every member, what they paid, what their share came to, what they
 * have paid others back and been paid back, and where that leaves them. These are the ledger's own
 * balances (core/ledger.ts), laid out so anyone can see why a transfer is what it is:
 * where they stand = paid − share + sent − received.
 *
 * And one member's statement: every expense they paid or share in, and every transfer they made or
 * got, each with what it did for them. Only what counts (expensesOf, transfersOf), in the ledger's
 * currency.
 */
import { expensesOf, paidBy, portionsOf, transfersOf, type Expense, type Ledger, type Transfer } from "./core";
import { byDay } from "./lines";

/** One member's sums, in the ledger's currency. `net` above zero: they are owed; below: they owe. */
export type Person = { id: string; paid: number; share: number; sent: number; received: number; net: number };

/** Everyone's sums, in the roster's order. Their nets add up to zero, and are the ledger's balances. */
export function peopleOf(l: Ledger): Person[] {
  const at = new Map(l.members.map((m, i) => [m.id, i]));
  const rows: Person[] = l.members.map((m) => ({ id: m.id, paid: 0, share: 0, sent: 0, received: 0, net: 0 }));
  for (const e of expensesOf(l)) {
    // (a refund the other way round: it comes off what whoever got it paid, and off each one's share)
    const way = e.refund ? -1 : 1;
    for (const [id, n] of Object.entries(paidBy(e))) rows[at.get(id)!].paid += way * n;
    for (const [id, part] of Object.entries(portionsOf(e, l))) rows[at.get(id)!].share += way * part;
  }
  for (const t of transfersOf(l)) {
    rows[at.get(t.from)!].sent += t.amount;
    rows[at.get(t.to)!].received += t.amount;
  }
  for (const r of rows) r.net = r.paid - r.share + r.sent - r.received;
  return rows;
}

/** One line of a member's statement: an expense they paid or share in, with how much of each (a refund's: what they got, and their part of it, both as they are). */
export type Spent = { expense: Expense; paid: number; share: number };

/** A member's statement: their expenses (the day spent, newest first, as the list has them) and their transfers (newest first). */
export function statementOf(l: Ledger, id: string): { expenses: Spent[]; transfers: Transfer[] } {
  const expenses = byDay(expensesOf(l))
    .flatMap(([, day]) => day)
    .map((e) => ({ expense: e, paid: paidBy(e)[id] ?? 0, share: portionsOf(e, l)[id] ?? 0 }))
    .filter((s) => s.paid > 0 || s.share > 0);
  const transfers = transfersOf(l)
    .filter((t) => t.from === id || t.to === id)
    .sort((a, b) => b.at - a.at);
  return { expenses, transfers };
}
