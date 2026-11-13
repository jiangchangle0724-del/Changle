/**
 * 记一笔 while it is being filled in: the amount as typed, who paid, how it is shared, the note.
 * A draft becomes an expense only when it is sound (core/ledger.ts, problem). Nothing here touches
 * the screen, so it is tested without a browser (tests/split-screens.test.ts).
 */
import { allot, fromMinor, problem, toMinor, type Decimals, type Expense, type Ledger, type Problem, type Split } from "./core";

export type How = Split["how"];

export type Draft = {
  /** the amount as typed on the keypad ("86.4"), empty before anything is typed */
  text: string;
  payer: string;
  how: How;
  /** shared equally: who takes part */
  among: string[];
  /** shared by shares: how many each holds (0, or missing, takes no part) */
  shares: Record<string, number>;
  /** shared by amounts: what was typed for each */
  amounts: Record<string, string>;
  note: string;
};

/** A new expense as it starts: paid by you (or the first on the roster), shared equally by everyone. */
export function blankDraft(l: Ledger, me: string | undefined): Draft {
  const everyone = l.members.map((m) => m.id);
  return { text: "", payer: me && everyone.includes(me) ? me : everyone[0], how: "equal", among: everyone, shares: {}, amounts: {}, note: "" };
}

/** An expense already in the ledger, opened to change it. */
export function draftOf(e: Expense, decimals: Decimals): Draft {
  const s = e.split;
  return {
    text: fromMinor(e.amount, decimals),
    payer: e.payer,
    how: s.how,
    among: s.how === "equal" ? [...s.among] : [],
    shares: s.how === "shares" ? { ...s.shares } : {},
    amounts: s.how === "exact" ? Object.fromEntries(Object.entries(s.amounts).map(([id, n]) => [id, n ? fromMinor(n, decimals) : ""])) : {},
    note: e.note,
  };
}

/** The amount typed so far, in smallest units; null when it isn't one yet. */
export const amountOf = (d: Draft, decimals: Decimals) => toMinor(d.text, decimals);

/** Who takes part in the draft as it stands, in roster order. */
export function sharers(d: Draft, l: Ledger, decimals: Decimals): string[] {
  const takes = (id: string) => (d.how === "equal" ? d.among.includes(id) : d.how === "shares" ? (d.shares[id] ?? 0) > 0 : (toMinor(d.amounts[id] ?? "", decimals) ?? 0) > 0);
  return l.members.map((m) => m.id).filter(takes);
}

/** The draft's way of sharing, as the ledger keeps it. Typed amounts that aren't amounts count as nothing (and the sum then shows it). */
export function splitOf(d: Draft, decimals: Decimals): Split {
  if (d.how === "equal") return { how: "equal", among: d.among };
  if (d.how === "shares") return { how: "shares", shares: Object.fromEntries(Object.entries(d.shares).filter(([, n]) => n > 0)) };
  const amounts: Record<string, number> = {};
  for (const [id, text] of Object.entries(d.amounts)) {
    const n = toMinor(text, decimals);
    if (n) amounts[id] = n;
  }
  return { how: "exact", amounts };
}

/**
 * The same draft shared another way, with the same people taking part: by shares they start with
 * one share each; by amounts each starts from exactly what they bore the way it was shared before
 * (`rot` is the expense's turn for the odd cents, so the figures are the ones the sheet just
 * showed), and the sum is right before anyone changes a figure.
 */
export function shareBy(d: Draft, how: How, l: Ledger, decimals: Decimals, rot = 0): Draft {
  if (how === d.how) return d;
  const everyone = l.members.map((m) => m.id);
  const now = sharers(d, l, decimals);
  const who = now.length ? now : everyone;
  if (how === "equal") return { ...d, how, among: who };
  if (how === "shares") return { ...d, how, shares: Object.fromEntries(who.map((id) => [id, d.shares[id] > 0 ? d.shares[id] : 1])) };
  const amount = amountOf(d, decimals) ?? 0;
  const byShares = d.how === "shares" && now.length > 0;
  const parts = allot(amount, everyone.map((id) => (who.includes(id) ? (byShares ? d.shares[id] : 1) : 0)), rot);
  return { ...d, how, amounts: Object.fromEntries(everyone.flatMap((id, i) => (parts[i] ? [[id, fromMinor(parts[i], decimals)]] : []))) };
}

/** What is wrong with the draft, in the core's words; null when it can be recorded. */
export function draftProblem(d: Draft, l: Ledger, decimals: Decimals): Problem | null {
  const amount = amountOf(d, decimals);
  if (!amount) return { what: "amount" };
  return problem({ payer: d.payer, amount, split: splitOf(d, decimals) }, l.members.map((m) => m.id));
}
