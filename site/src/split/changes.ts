/**
 * A change to a ledger, as something that can be sent (the plan's stage two, 一起记).
 *
 * A phone does something to its ledger (ops.ts), and what it did travels as one of these, with an
 * id of its own. The server takes changes one at a time, in the order they arrive, and every phone
 * ends up with the server's ledger. The rules that make that safe are all in this file, and none
 * of them touch a network, so they are tested on their own (tests/split-changes.test.ts):
 *
 *  - Once only. A change the server has been sent before changes nothing, so a phone that isn't
 *    sure its changes arrived just sends them again.
 *  - The same rules everywhere. A change is applied by the same code on the phone and on the
 *    server (ops.ts, core/), so the two can't disagree about what it does.
 *  - An expense arrives as the phone recorded it, its turn for the odd cents included. Recorded
 *    with no signal and sent a day later, everyone's share is still what that phone showed.
 *  - The later one stands. Two phones change the same expense: the change that arrives second is
 *    what the ledger says. The first is still in the server's log, so it can be brought back.
 *  - Nothing unsound gets in. A change that breaks a rule (core/ledger.ts, ops.ts) changes nothing.
 */
import { MAX_MEMBERS, problem, type Expense, type Ledger, type Member, type Split, type Transfer } from "./core";
import { addMember, addTransfer, editExpense, LEDGER_NAME_MAX, NAME_MAX, NOTE_MAX, putBack, removeMember, renameLedger, renameMember, takeOut, tidy } from "./ops";

/** The most entries (expenses and transfers, taken out or not) one ledger holds. */
export const MAX_ENTRIES = 2000;

/** What can be changed about an expense after it is recorded. */
export type Edit = Pick<Expense, "payer" | "amount" | "note" | "split">;

export type Change =
  /** a new expense, exactly as the phone recorded it */
  | { do: "expense"; expense: Omit<Expense, "gone"> }
  /** an expense changed */
  | { do: "edit"; entry: string; to: Edit }
  /** an entry taken out (an expense deleted, a transfer un-marked), and when */
  | { do: "out"; entry: string; at: number }
  /** an entry put back */
  | { do: "back"; entry: string }
  /** one person has paid another back */
  | { do: "transfer"; transfer: Omit<Transfer, "kind" | "gone"> }
  /** one more person, at the end of the roster */
  | { do: "member"; member: Member }
  /** someone renamed */
  | { do: "rename"; member: string; name: string }
  /** someone no entry names taken off the roster */
  | { do: "remove"; member: string }
  /** the ledger renamed */
  | { do: "title"; name: string };

/** A change as it travels: with an id of its own, so it counts once, and when the phone made it. */
export type Sent = { id: string; at: number; change: Change };

const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isTurn = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/**
 * The ledger with this change made, or null when it changes nothing: it breaks a rule, or there
 * is nothing left for it to do (the entry is already out, the name is already that).
 */
export function applyChange(l: Ledger, c: Change): Ledger | null {
  const roster = l.members.map((m) => m.id);
  const find = (id: string) => l.entries.find((e) => e.id === id);
  const moved = (next: Ledger) => (next === l ? null : next);
  switch (c.do) {
    case "expense": {
      const e = c.expense;
      if (l.entries.length >= MAX_ENTRIES || find(e.id) || !isTurn(e.rot) || !isTime(e.at) || problem(e, roster)) return null;
      const kept: Expense = { kind: "expense", id: e.id, at: e.at, payer: e.payer, amount: e.amount, note: tidy(e.note, NOTE_MAX), split: e.split, rot: e.rot };
      if (e.paidIn) kept.paidIn = { currency: e.paidIn.currency, amount: e.paidIn.amount, rate: e.paidIn.rate };
      return { ...l, entries: [...l.entries, kept] };
    }
    case "edit": {
      const was = find(c.entry);
      if (!was || was.kind !== "expense") return null;
      const next = editExpense(l, c.entry, c.to);
      return next === l || JSON.stringify(next.entries.find((e) => e.id === c.entry)) === JSON.stringify(was) ? null : next;
    }
    case "out": {
      const was = find(c.entry);
      return was && was.gone === undefined && isTime(c.at) ? takeOut(l, c.entry, c.at) : null;
    }
    case "back": {
      const was = find(c.entry);
      return was && was.gone !== undefined ? putBack(l, c.entry) : null;
    }
    case "transfer": {
      const t = c.transfer;
      if (l.entries.length >= MAX_ENTRIES || !isTime(t.at)) return null;
      return moved(addTransfer(l, { id: t.id, at: t.at, from: t.from, to: t.to, amount: t.amount }));
    }
    case "member":
      return moved(addMember(l, { id: c.member.id, name: c.member.name }));
    case "rename": {
      const was = l.members.find((m) => m.id === c.member);
      return was && tidy(c.name, NAME_MAX) !== was.name ? moved(renameMember(l, c.member, c.name)) : null;
    }
    case "remove":
      return l.members.some((m) => m.id === c.member) ? moved(removeMember(l, c.member)) : null;
    case "title":
      return tidy(c.name, LEDGER_NAME_MAX) !== l.name ? moved(renameLedger(l, c.name)) : null;
  }
}

/**
 * What became of a change the server was sent: it counted just now ("new"); it had been sent
 * before, and counted then ("seen"); or it changes nothing ("nothing": against the rules, or
 * nothing left for it to do). A change that changed nothing is "nothing" every time it is sent, so
 * a phone whose first answer was lost still learns that it didn't stick.
 */
export type Took = "new" | "seen" | "nothing";

/**
 * The changes a ledger has been sent, by id: did each one count? A Map is one; the server keeps
 * its own in a table.
 */
export type Seen = { get(id: string): boolean | undefined; set(id: string, counted: boolean): unknown };

/**
 * The server's side: take one change. `seen` holds every change this ledger has been sent,
 * whatever became of it, and this adds to it.
 */
export function accept(l: Ledger, seen: Seen, sent: Sent): { ledger: Ledger; took: Took } {
  const before = seen.get(sent.id);
  if (before !== undefined) return { ledger: l, took: before ? "seen" : "nothing" };
  const next = applyChange(l, sent.change);
  seen.set(sent.id, next !== null);
  return next ? { ledger: next, took: "new" } : { ledger: l, took: "nothing" };
}

/**
 * The phone's side: the server's ledger with the changes still waiting to be sent made on top, in
 * order. One that no longer fits (the server's ledger moved on) is left out; the rest still apply.
 */
export function rebase(server: Ledger, waiting: Sent[]): Ledger {
  return waiting.reduce((l, s) => applyChange(l, s.change) ?? l, server);
}

// ---------- what arrives from the network ----------

/** An id as phones make them (store.ts, newId): letters, digits, - and _. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Text is cut to its own limit when it is kept (ops.ts, tidy); longer than this, it isn't read at all. */
const TEXT_MOST = 400;

const isId = (x: unknown): x is string => typeof x === "string" && ID.test(x);
const isText = (x: unknown): x is string => typeof x === "string" && x.length <= TEXT_MOST;
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function asNumbers(x: unknown): Record<string, number> | null {
  if (!isRecord(x)) return null;
  const pairs = Object.entries(x);
  if (pairs.length > MAX_MEMBERS || !pairs.every(([id, n]) => isId(id) && isTime(n))) return null;
  return Object.fromEntries(pairs) as Record<string, number>;
}

function asSplit(x: unknown): Split | null {
  if (!isRecord(x)) return null;
  if (x.how === "equal") return Array.isArray(x.among) && x.among.length <= MAX_MEMBERS && x.among.every(isId) ? { how: "equal", among: [...x.among] } : null;
  if (x.how === "shares") {
    const shares = asNumbers(x.shares);
    return shares && { how: "shares", shares };
  }
  if (x.how === "exact") {
    const amounts = asNumbers(x.amounts);
    return amounts && { how: "exact", amounts };
  }
  return null;
}

function asEdit(x: unknown): Edit | null {
  if (!isRecord(x) || !isId(x.payer) || !isTime(x.amount) || !isText(x.note)) return null;
  const split = asSplit(x.split);
  return split && { payer: x.payer, amount: x.amount, note: x.note, split };
}

function asExpense(x: unknown): Omit<Expense, "gone"> | null {
  const edit = asEdit(x);
  if (!edit || !isRecord(x) || !isId(x.id) || !isTime(x.at) || !isTurn(x.rot)) return null;
  const expense: Omit<Expense, "gone"> = { kind: "expense", id: x.id, at: x.at, ...edit, rot: x.rot };
  if (x.paidIn === undefined) return expense;
  const p = x.paidIn;
  if (!isRecord(p) || typeof p.currency !== "string" || !/^[A-Z]{3}$/.test(p.currency) || !isTime(p.amount) || typeof p.rate !== "string" || p.rate.length > 20) return null;
  return { ...expense, paidIn: { currency: p.currency, amount: p.amount, rate: p.rate } };
}

function asChange(x: Record<string, unknown>): Change | null {
  switch (x.do) {
    case "expense": {
      const expense = asExpense(x.expense);
      return expense && { do: "expense", expense };
    }
    case "edit": {
      const to = asEdit(x.to);
      return to && isId(x.entry) ? { do: "edit", entry: x.entry, to } : null;
    }
    case "out":
      return isId(x.entry) && isTime(x.at) ? { do: "out", entry: x.entry, at: x.at } : null;
    case "back":
      return isId(x.entry) ? { do: "back", entry: x.entry } : null;
    case "transfer": {
      const t = x.transfer;
      return isRecord(t) && isId(t.id) && isTime(t.at) && isId(t.from) && isId(t.to) && isTime(t.amount) ? { do: "transfer", transfer: { id: t.id, at: t.at, from: t.from, to: t.to, amount: t.amount } } : null;
    }
    case "member": {
      const m = x.member;
      return isRecord(m) && isId(m.id) && isText(m.name) ? { do: "member", member: { id: m.id, name: m.name } } : null;
    }
    case "rename":
      return isId(x.member) && isText(x.name) ? { do: "rename", member: x.member, name: x.name } : null;
    case "remove":
      return isId(x.member) ? { do: "remove", member: x.member } : null;
    case "title":
      return isText(x.name) ? { do: "title", name: x.name } : null;
    default:
      return null;
  }
}

/**
 * A change as it was sent, read from whatever arrived: null when it isn't the shape of one. Only
 * the fields a change has are kept, so nothing else rides in with it. (Whether it is sound is
 * applyChange's business.)
 */
export function parseSent(x: unknown): Sent | null {
  if (!isRecord(x) || !isId(x.id) || !isTime(x.at) || !isRecord(x.change)) return null;
  const change = asChange(x.change);
  return change && { id: x.id, at: x.at, change };
}
