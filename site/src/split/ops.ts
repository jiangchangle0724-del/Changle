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

/**
 * What can be changed about an expense after it is recorded: who paid, how much, the note, how it
 * is shared, the other currency it was paid in, and its receipt photos. `paidIn` is said one of
 * three ways: what it is now; null, for an expense paid in the ledger's own currency; or not at
 * all. Said not at all (a page from before expenses had another currency says nothing), the
 * expense keeps what it had while its amount stays the same, and loses it when the amount changes:
 * an amount in another currency that no longer comes to what the expense counts for would be a
 * lie. `files` too: the ids it has now; null (or none), for an expense with no photos; or not at
 * all, and it keeps the ones it had (a page from before photos can't take them away). `tip` and
 * `tax` the same three ways: what they are now; null (or 0), for none; or not at all, and they stay
 * while what was paid, in the currency it was paid in, stays (they were read off that receipt).
 */
export type ExpenseEdit = Pick<Expense, "payer" | "amount" | "note" | "split"> & { paidIn?: Expense["paidIn"] | null; files?: string[] | null; tip?: number | null; tax?: number | null };

/** What was paid, in the currency it was paid in: the other currency's amount when there is one, else the ledger's. Tip and tax are in it. */
export const paidAmount = (e: Pick<Expense, "amount" | "paidIn">) => (e.paidIn ? e.paidIn.amount : e.amount);

/**
 * Whether an expense's tip and tax can be kept: each, when there is one, a whole number of the
 * smallest units above zero, and the two together no more than was paid. (They are only kept and
 * shown: what anyone owes never comes from them.)
 */
export function soundExtras(e: Pick<Expense, "amount" | "paidIn" | "tip" | "tax">): boolean {
  const one = (n: number | undefined) => n === undefined || (Number.isSafeInteger(n) && n > 0);
  return one(e.tip) && one(e.tax) && (e.tip ?? 0) + (e.tax ?? 0) <= paidAmount(e);
}

/**
 * An expense as an edit leaves it (ExpenseEdit says what each way of saying a field means), or null
 * when the tip and tax it would be left with can't be kept. The record (history.ts) reads old
 * edits with these same rules.
 */
export function afterEdit(e: Expense, to: ExpenseEdit): Expense | null {
  const paidIn = to.paidIn === undefined ? (to.amount === e.amount ? e.paidIn : undefined) : (to.paidIn ?? undefined);
  const files = to.files === undefined ? e.files : (to.files ?? undefined);
  const samePaid = (paidIn?.currency ?? "") === (e.paidIn?.currency ?? "") && paidAmount({ amount: to.amount, paidIn }) === paidAmount(e);
  const tip = to.tip === undefined ? (samePaid ? e.tip : undefined) : to.tip || undefined;
  const tax = to.tax === undefined ? (samePaid ? e.tax : undefined) : to.tax || undefined;
  if (!soundExtras({ amount: to.amount, paidIn, tip, tax })) return null;
  // (every field keeps its place, so an expense changed to what it already says is the same, letter for letter)
  const next: Expense = { ...e, payer: to.payer, amount: to.amount, note: tidy(to.note, NOTE_MAX), split: to.split };
  if (paidIn) next.paidIn = { currency: paidIn.currency, amount: paidIn.amount, rate: paidIn.rate };
  else delete next.paidIn;
  if (files?.length) next.files = [...files];
  else delete next.files;
  if (tip) next.tip = tip;
  else delete next.tip;
  if (tax) next.tax = tax;
  else delete next.tax;
  return next;
}

/** An expense changed. Its id, its time and its turn for the odd cents stay. */
export function editExpense(l: Ledger, id: string, to: ExpenseEdit): Ledger {
  if (problem({ payer: to.payer, amount: to.amount, split: to.split, paidIn: to.paidIn ?? undefined }, roster(l))) return l;
  const was = l.entries.find((e): e is Expense => e.id === id && e.kind === "expense");
  const next = was && afterEdit(was, to);
  return next ? { ...l, entries: l.entries.map((e) => (e === was ? next : e)) } : l;
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

/** One person has paid another back. A transfer that isn't sound changes nothing, and nor does one whose id the ledger has. */
export function addTransfer(l: Ledger, t: Omit<Transfer, "kind" | "gone">): Ledger {
  if (!soundTransfer(t, roster(l)) || l.entries.some((x) => x.id === t.id)) return l;
  return { ...l, entries: [...l.entries, { ...t, kind: "transfer" }] };
}

/** A 53-bit fingerprint of some text (cyrb53, public domain), in letters and digits. */
function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * The id of a transfer marked as made from a step of the plan to settle up (core/ledger.ts,
 * settlement): the same on every phone that marks the same step of the same ledger. So when the
 * one who paid and the one who was paid both mark one payment, at the same moment or with no
 * signal, it is recorded once: the second is a transfer the ledger already has (addTransfer).
 *
 * What it is made of: the ledger and the step; how many expenses have ever been recorded in it
 * (the plan is worked out from them, so the same step after other expenses came and went is a new
 * one); and how many transfers like it the ledger already has, taken back ones included (so marking
 * it again after taking it back is a new one too).
 */
export function paidId(l: Ledger, step: { from: string; to: string; amount: number }): string {
  let expenses = 0;
  let before = 0;
  for (const e of l.entries) {
    if (e.kind === "expense") expenses++;
    else if (e.from === step.from && e.to === step.to && e.amount === step.amount) before++;
  }
  return `paid-${fingerprint(`${l.id}|${expenses}|${step.from}|${step.to}|${step.amount}|${before}`)}`;
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
