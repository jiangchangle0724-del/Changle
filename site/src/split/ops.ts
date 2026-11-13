/**
 * What can be done to a ledger, each as "the ledger before, the ledger after": nothing here touches
 * the phone's storage or the screen, so every rule can be tested on its own
 * (tests/split-screens.test.ts). store.ts keeps the result.
 *
 * Nothing is ever really removed: an entry taken out stays with `gone` set, so it can come back and
 * so the odd cents of the entries after it stay where they were (core/ledger.ts, nextRot).
 */
import { MAX_MEMBERS, nextRot, problem, soundTransfer, type Entry, type Expense, type Ledger, type Member, type Transfer } from "./core";

/** The longest a person's name, a ledger's name and a note can be. */
export const NAME_MAX = 20;
export const LEDGER_NAME_MAX = 30;
export const NOTE_MAX = 40;

/**
 * A name as it is kept: no stray spaces, and no longer than `max` (counted the way a text field's
 * own limit counts). A cut that falls in the middle of one character (an emoji is two units long)
 * drops the whole character, not half of it.
 */
export function tidy(s: string, max: number): string {
  const cut = s.replace(/\s+/g, " ").trim().slice(0, max);
  return (/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut).trimEnd();
}

const roster = (l: Ledger) => l.members.map((m) => m.id);

/** Is someone in the ledger already called this (whatever the capitals)? */
export const nameTaken = (l: Pick<Ledger, "members">, name: string, except?: string) =>
  l.members.some((m) => m.id !== except && m.name.toLowerCase() === tidy(name, NAME_MAX).toLowerCase());

/** A new ledger with these people, in this order (the order the odd cents go round in). */
export function startLedger(id: string, name: string, currency: string, members: Member[]): Ledger {
  return { id, name: tidy(name, LEDGER_NAME_MAX), currency, members: members.slice(0, MAX_MEMBERS).map((m) => ({ id: m.id, name: tidy(m.name, NAME_MAX) })), entries: [] };
}

/** What 记一笔 hands over: everything but the turn for the odd cents, which the ledger decides. */
export type NewExpense = Omit<Expense, "kind" | "rot" | "gone">;

/** The ledger with one more expense. An expense that isn't sound changes nothing. */
export function addExpense(l: Ledger, e: NewExpense): Ledger {
  if (problem(e, roster(l)) || l.entries.some((x) => x.id === e.id)) return l;
  const expense: Expense = { ...e, kind: "expense", note: tidy(e.note, NOTE_MAX), rot: nextRot(l) };
  return { ...l, entries: [...l.entries, expense] };
}

/** An expense changed: who paid, how much, the note, how it is shared. Its id, its time and its turn for the odd cents stay. */
export function editExpense(l: Ledger, id: string, to: Pick<Expense, "payer" | "amount" | "note" | "split">): Ledger {
  if (problem(to, roster(l))) return l;
  return {
    ...l,
    entries: l.entries.map((e) => (e.id === id && e.kind === "expense" ? { ...e, payer: to.payer, amount: to.amount, note: tidy(to.note, NOTE_MAX), split: to.split } : e)),
  };
}

/** An entry taken out (an expense deleted, a transfer un-marked): it stays in the ledger, counting for nothing. */
export function takeOut(l: Ledger, id: string, at: number): Ledger {
  return { ...l, entries: l.entries.map((e): Entry => (e.id === id ? { ...e, gone: at } : e)) };
}

/** An entry put back. */
export function putBack(l: Ledger, id: string): Ledger {
  return {
    ...l,
    entries: l.entries.map((e): Entry => {
      if (e.id !== id) return e;
      const { gone: _gone, ...rest } = e;
      return rest;
    }),
  };
}

/** One person has paid another back. A transfer that isn't sound changes nothing. */
export function addTransfer(l: Ledger, t: Omit<Transfer, "kind" | "gone">): Ledger {
  if (!soundTransfer(t, roster(l)) || l.entries.some((x) => x.id === t.id)) return l;
  return { ...l, entries: [...l.entries, { ...t, kind: "transfer" }] };
}

/** One more person, at the end of the roster. Refused when the ledger is full or the name is empty or taken. */
export function addMember(l: Ledger, m: Member): Ledger {
  const name = tidy(m.name, NAME_MAX);
  if (!name || l.members.length >= MAX_MEMBERS || nameTaken(l, name) || l.members.some((x) => x.id === m.id)) return l;
  return { ...l, members: [...l.members, { id: m.id, name }] };
}

/** Someone renamed. Refused when the name is empty or someone else's. */
export function renameMember(l: Ledger, id: string, to: string): Ledger {
  const name = tidy(to, NAME_MAX);
  if (!name || nameTaken(l, name, id)) return l;
  return { ...l, members: l.members.map((m) => (m.id === id ? { ...m, name } : m)) };
}

/** Does any entry, even one taken out, name this person? */
export function inAnyEntry(l: Ledger, id: string): boolean {
  return l.entries.some((e) => {
    if (e.kind === "transfer") return e.from === id || e.to === id;
    if (e.payer === id) return true;
    const s = e.split;
    return s.how === "equal" ? s.among.includes(id) : s.how === "shares" ? id in s.shares : id in s.amounts;
  });
}

/** Someone taken off the roster: only someone no entry names, and never the last two. */
export function removeMember(l: Ledger, id: string): Ledger {
  if (l.members.length <= 2 || inAnyEntry(l, id)) return l;
  return { ...l, members: l.members.filter((m) => m.id !== id) };
}

/** The ledger under a new name. An empty name changes nothing. */
export function renameLedger(l: Ledger, to: string): Ledger {
  const name = tidy(to, LEDGER_NAME_MAX);
  return name ? { ...l, name } : l;
}
