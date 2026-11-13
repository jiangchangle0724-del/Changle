/**
 * A ledger: who is in it, what was paid, and who has paid whom back. From those, what everyone is
 * owed or owes (balances) and the transfers that square it up (settlement).
 *
 * Every entry is made on a phone with an id of its own, so one sent twice is still one entry.
 * An entry taken out keeps its place with `gone` set (it can come back), and counts for nothing.
 */
import { isAmount, isRate } from "./money";
import { settle } from "./settle";
import { isShares, oddUnits, portions, weightsOf } from "./split";
import type { Expense, Ledger, Transfer } from "./types";

/** The most people one ledger holds. */
export const MAX_MEMBERS = 30;

/** What is wrong with an expense, for the screen to say; null when it is sound. */
export type Problem =
  /** the amount isn't a whole number of smallest units above zero */
  | { what: "amount" }
  /** whoever paid isn't in the ledger */
  | { what: "payer" }
  /** it is shared between nobody */
  | { what: "nobody" }
  /** someone it is shared with isn't in the ledger, or holds a share that isn't a whole number from 1 up */
  | { what: "member" }
  /** typed amounts don't add up: `off` is what is still to hand out (above zero) or handed out too much (below) */
  | { what: "sum"; off: number }
  /** the other currency's amount or rate isn't one */
  | { what: "rate" };

/** What is wrong with this expense in a ledger with these members, or null. */
export function problem(e: Pick<Expense, "payer" | "amount" | "split" | "paidIn">, roster: string[]): Problem | null {
  if (!isAmount(e.amount)) return { what: "amount" };
  if (!roster.includes(e.payer)) return { what: "payer" };
  const s = e.split;
  if (s.how === "equal") {
    if (!s.among.length) return { what: "nobody" };
    if (s.among.some((id) => !roster.includes(id)) || new Set(s.among).size !== s.among.length) return { what: "member" };
  } else if (s.how === "shares") {
    const held = Object.entries(s.shares).filter(([, n]) => n !== 0);
    if (!held.length) return { what: "nobody" };
    if (held.some(([id, n]) => !roster.includes(id) || !isShares(n))) return { what: "member" };
  } else {
    const owed = Object.entries(s.amounts).filter(([, n]) => n !== 0);
    if (!owed.length) return { what: "nobody" };
    if (owed.some(([id, n]) => !roster.includes(id) || !isAmount(n))) return { what: "member" };
    const off = e.amount - owed.reduce((a, [, n]) => a + n, 0);
    if (off !== 0) return { what: "sum", off };
  }
  if (e.paidIn && (!isAmount(e.paidIn.amount) || !isRate(e.paidIn.rate))) return { what: "rate" };
  return null;
}

/**
 * A transfer that counts: a whole amount above zero, between two different members of the ledger.
 * It can be more than one entry can be: someone who paid for several big things is owed their sum.
 */
export const soundTransfer = (t: Pick<Transfer, "from" | "to" | "amount">, roster: string[]) =>
  Number.isSafeInteger(t.amount) && t.amount > 0 && t.from !== t.to && roster.includes(t.from) && roster.includes(t.to);

const rosterOf = (l: Ledger) => l.members.map((m) => m.id);

/** The expenses that count: not taken out, and sound. */
export const expensesOf = (l: Ledger): Expense[] => {
  const roster = rosterOf(l);
  return l.entries.filter((e): e is Expense => e.kind === "expense" && !e.gone && !problem(e, roster));
};

/** The transfers that count: not taken out, and sound. */
export const transfersOf = (l: Ledger): Transfer[] => {
  const roster = rosterOf(l);
  return l.entries.filter((e): e is Transfer => e.kind === "transfer" && !e.gone && soundTransfer(e, roster));
};

/** What each member bears of one expense, by member id. */
export const portionsOf = (e: Expense, l: Ledger) => portions(e.amount, e.split, e.rot, rosterOf(l));

/** Everything spent, in smallest units. */
export const spent = (l: Ledger) => expensesOf(l).reduce((a, e) => a + e.amount, 0);

/**
 * Whose turn it is for the odd cents on the next expense: one place on for every odd cent any
 * expense in the ledger has handed out, the ones taken out included (so taking one out or putting
 * it back never moves anyone else's cent).
 */
export function nextRot(l: Ledger): number {
  const roster = rosterOf(l);
  let n = 0;
  for (const e of l.entries) {
    if (e.kind !== "expense" || problem(e, roster)) continue;
    const weights = weightsOf(e.split, roster);
    if (weights) n += oddUnits(e.amount, weights);
  }
  return n;
}

function netsOf(l: Ledger, withTransfers: boolean): number[] {
  const roster = rosterOf(l);
  const at = new Map(roster.map((id, i) => [id, i]));
  const nets = roster.map(() => 0);
  for (const e of expensesOf(l)) {
    nets[at.get(e.payer)!] += e.amount;
    for (const [id, part] of Object.entries(portionsOf(e, l))) nets[at.get(id)!] -= part;
  }
  if (withTransfers)
    for (const t of transfersOf(l)) {
      nets[at.get(t.from)!] += t.amount;
      nets[at.get(t.to)!] -= t.amount;
    }
  return nets;
}

/**
 * Where everyone stands, by member id: what they paid, less what they bear, plus what they have
 * paid back, less what they were paid back. Above zero they are owed, below they owe. Always adds
 * up to zero.
 */
export function balances(l: Ledger): Record<string, number> {
  const nets = netsOf(l, true);
  return Object.fromEntries(l.members.map((m, i) => [m.id, nets[i]]));
}

/** One line of the plan to settle up; `paid` is the id of the transfer that did it, once it is done. */
export type Step = { from: string; to: string; amount: number; paid?: string };

export type Settlement = {
  /** the transfers that square everything up, in a steady order */
  steps: Step[];
  /** transfers already made that are not one of the steps (see below), oldest first */
  others: Transfer[];
  /** nobody owes anybody */
  clear: boolean;
};

/**
 * The plan to settle up, and how far along it is.
 *
 * The plan is worked out from the expenses alone, and a transfer someone marks as made ticks its
 * step off. So the plan holds still while people pay one by one: the picture sent to the group
 * chat and the screen keep saying the same thing. (Working it out afresh from what is still owed
 * after every payment could hand the people who haven't paid yet a different, equally short plan.)
 *
 * A transfer that matches no step (a new expense changed the plan after it was made, or it was a
 * different amount) can't be ticked off anything: then the plan is what is still owed now, and
 * every transfer made so far is listed in `others`.
 */
export function settlement(l: Ledger): Settlement {
  const ids = rosterOf(l);
  const plan = (nets: number[]): Step[] => settle(nets).map((m) => ({ from: ids[m.from], to: ids[m.to], amount: m.amount }));
  const made = transfersOf(l).sort((a, b) => a.at - b.at);
  const steps = plan(netsOf(l, false));
  let fits = true;
  for (const t of made) {
    const step = steps.find((s) => !s.paid && s.from === t.from && s.to === t.to && s.amount === t.amount);
    if (step) step.paid = t.id;
    else fits = false;
  }
  if (fits) return { steps, others: [], clear: steps.every((s) => s.paid) };
  const now = plan(netsOf(l, true));
  return { steps: now, others: made, clear: now.length === 0 };
}
