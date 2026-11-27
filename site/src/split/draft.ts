/**
 * 记一笔 while it is being filled in: the amount as typed and the currency it is typed in, who
 * paid, how it is shared, the note. A draft becomes an expense only when it is sound
 * (core/ledger.ts, problem). Nothing here touches the screen, so it is tested without a browser
 * (tests/split-screens.test.ts).
 *
 * Two currencies can be in play. The amount is typed in the one it was paid in; everything about
 * sharing (the parts, the typed amounts, what is left over) is in the ledger's own, on what the
 * amount comes to at the rate. That is the plan's rule: convert first, then share.
 */
import { CURRENCIES, type Rates } from "../tools/money";
import { allot, convert, expensesOf, fromMinor, isAmount, problem, toMinor, type Decimals, type Expense, type Ledger, type Problem, type Split } from "./core";
import { decimalsOf, localDay } from "./format";
import type { ExpenseEdit } from "./ops";
import { lastPaidIn, paidInOf, RECENT, settled, startingRate, todaysRate } from "./rates";
import type { Category } from "./categories";
import type { Reading } from "./shape";

export type How = Split["how"];

export type Draft = {
  /** the amount as typed on the keypad ("86.4"), in `currency`; empty before anything is typed */
  text: string;
  /**
   * amounts typed with the keypad's + between them ("12.50+8.75+"), while they are: `text` is what
   * they come to (input.ts, totalOf). Anything else that sets `text` leaves this behind, and then it
   * no longer comes to `text` and is let go.
   */
  terms?: string;
  /** the currency it was paid in: the ledger's own, or another the site knows */
  currency: string;
  /** paid in another currency: how many of the ledger's for one of it, as typed or filled in; empty while there is none */
  rate: string;
  /** there is no rate yet and today's has been asked for: it goes in when it comes (rated) */
  asking: boolean;
  /**
   * The expense being changed says it was paid in a currency these screens can't show (rates.ts,
   * paidInOf), and nobody has picked one here: saved like this, the change says nothing about it.
   */
  untouched: boolean;
  payer: string;
  how: How;
  /** shared equally: who takes part */
  among: string[];
  /** shared by shares: how many each holds (0, or missing, takes no part) */
  shares: Record<string, number>;
  /** shared by amounts: what was typed for each */
  amounts: Record<string, string>;
  note: string;
  /**
   * what the receipt says went to the tip, and to tax, in `currency` as read or typed ("18.00");
   * empty for none. Kept with the expense when they fit in what was paid (extrasOf); a currency
   * picked anew empties them, since they were in the old one.
   */
  tip: string;
  tax: string;
  /**
   * the day it was spent ("2026-11-15"): today for a new one; for one opened, the day it says, or
   * empty when it says none (the day it was recorded stands for it, and nothing is said of it).
   * Read off a receipt, or picked.
   */
  date: string;
  /** the business, the place and what paid, as read off its receipt or typed; empty for none */
  merchant: string;
  place: string;
  payment: string;
  /** its kind of spending (categories.ts), as picked or read off its receipt; none, and it counts as its words say (kinds.ts) */
  category: Category | null;
  /** 退款: money that came back rather than money paid out (core/types.ts, refund); then it has no tip or tax */
  refund: boolean;
  /** 几个人一起付: what each typed they paid, in the ledger's currency ("100", "86"); null when `payer` paid it all */
  payers: Record<string, string> | null;
};

/**
 * A new expense as it starts: paid by you (or the first on the roster), shared equally by everyone,
 * and in the currency of the last expense in the ledger at that one's rate, while that is recent.
 * On a trip everything is paid in the one currency, so it is picked once; an expense in the
 * ledger's own currency puts the next one back.
 */
export function blankDraft(l: Ledger, me: string | undefined, now: number): Draft {
  const everyone = l.members.map((m) => m.id);
  const last = expensesOf(l).at(-1);
  const lead = last && now - last.at <= RECENT ? paidInOf(last, l) : null;
  return {
    text: "",
    currency: lead ? lead.currency : l.currency,
    rate: lead ? lead.rate : "",
    asking: false,
    untouched: false,
    payer: me && everyone.includes(me) ? me : everyone[0],
    how: "equal",
    among: everyone,
    shares: {},
    amounts: {},
    note: "",
    tip: "",
    tax: "",
    date: localDay(now),
    merchant: "",
    place: "",
    payment: "",
    category: null,
    refund: false,
    payers: null,
  };
}

/** An expense already in the ledger, opened to change it: in the currency it was paid in, at the rate it was recorded at. */
export function draftOf(e: Expense, l: Ledger): Draft {
  const s = e.split;
  const decimals = decimalsOf(l.currency);
  const paid = paidInOf(e, l);
  // (paid in a currency these screens can't show: that, and its tip and tax, are left unsaid)
  const untouched = !paid && e.paidIn !== undefined;
  const inPaid = (n: number | undefined) => (n && !untouched ? fromMinor(n, decimalsOf(paid ? paid.currency : l.currency)) : "");
  return {
    text: paid ? fromMinor(paid.amount, decimalsOf(paid.currency)) : fromMinor(e.amount, decimals),
    currency: paid ? paid.currency : l.currency,
    rate: paid ? paid.rate : "",
    asking: false,
    untouched,
    payer: e.payer,
    how: s.how,
    among: s.how === "equal" ? [...s.among] : [],
    shares: s.how === "shares" ? { ...s.shares } : {},
    amounts: s.how === "exact" ? Object.fromEntries(Object.entries(s.amounts).map(([id, n]) => [id, n ? fromMinor(n, decimals) : ""])) : {},
    note: e.note,
    tip: inPaid(e.tip),
    tax: inPaid(e.tax),
    date: e.date ?? "",
    merchant: e.merchant ?? "",
    place: e.place ?? "",
    payment: e.payment ?? "",
    category: e.category ?? null,
    refund: !!e.refund,
    payers: e.payers ? Object.fromEntries(Object.entries(e.payers).map(([id, n]) => [id, fromMinor(n, decimalsOf(l.currency))])) : null,
  };
}

/** Is the draft in a currency other than the ledger's? */
export const abroad = (d: Draft, l: Ledger) => d.currency !== l.currency;

/** The amount typed so far, in the smallest units of the currency it is typed in; null when it isn't one yet. */
export const paidOf = (d: Draft) => toMinor(d.text, decimalsOf(d.currency));

/**
 * What the draft counts for, in the ledger's currency and its smallest units: the amount typed,
 * or what it comes to at the rate. Null when it isn't an amount yet, or there is no rate to take
 * it across with.
 */
export function amountOf(d: Draft, l: Ledger): number | null {
  const paid = paidOf(d);
  if (paid === null || !abroad(d, l)) return paid;
  return convert(paid, decimalsOf(d.currency), settled(d.rate), decimalsOf(l.currency));
}

/**
 * The draft paid in another currency (or back in the ledger's own). The digits typed stay, less
 * any cents the new currency doesn't write; the rate is the one such an expense starts with
 * (rates.ts, startingRate), and when there is none yet it is asked for.
 */
/**
 * A receipt read, put into an expense being written (记一笔, and each of 几张小票): its total in the
 * currency it says (one the site knows: at today's rate, or the last one, when that isn't the
 * ledger's), the tip and tax in it, its day unless one was picked, and the business, place and what
 * paid where nothing is typed. Null when the total can't be an amount in that currency (cents in yen).
 */
export function readInto(d: Draft, got: Reading, l: Ledger, today: Rates | null | undefined, now: number, dayPicked = false): Draft | null {
  const other = got.currency && got.currency !== d.currency && CURRENCIES.some((c) => c.code === got.currency) ? got.currency : null;
  const next = other ? payIn(d, other, l, today, now) : d;
  const decimals = decimalsOf(next.currency);
  if (toMinor(got.total, decimals) === null) return null;
  // (the tip and tax in it, when they are sums that currency can be)
  const part = (x: string | null) => (x && toMinor(x, decimals) !== null ? x : "");
  return {
    ...next,
    text: got.total,
    merchant: next.merchant || got.merchant || "",
    place: next.place || got.place || "",
    payment: next.payment || got.payment || "",
    // (a kind picked stays; else the one the receipt says)
    category: next.category ?? got.category ?? null,
    tip: part(got.tip),
    tax: part(got.tax),
    date: got.date && !dayPicked ? got.date : next.date,
  };
}

export function payIn(d: Draft, currency: string, l: Ledger, today: Rates | null | undefined, now: number): Draft {
  if (currency === d.currency) return d;
  const text = decimalsOf(currency) === 0 ? d.text.split(".")[0] : d.text;
  // (a tip and tax were in the old currency)
  if (currency === l.currency) return { ...d, text, currency, rate: "", asking: false, untouched: false, tip: "", tax: "" };
  const rate = startingRate(l, currency, today, now);
  return { ...d, text, currency, rate, asking: !rate, untouched: false, tip: "", tax: "" };
}

/** A tip and tax typed that together come to more than the amount: they won't be kept (extrasOf), and the receipt's sheet says so. */
export function extrasOver(d: Draft): boolean {
  const decimals = decimalsOf(d.currency);
  return (toMinor(d.tip, decimals) ?? 0) + (toMinor(d.tax, decimals) ?? 0) > (paidOf(d) ?? 0);
}

/**
 * The tip and tax as the expense keeps them: each in the smallest units of the currency it is paid
 * in, null for none (empty, or not a sum in that currency); both null when together they come to
 * more than the amount typed (ops.ts, soundExtras: the ledger wouldn't take them).
 */
export function extrasOf(d: Draft): { tip: number | null; tax: number | null } {
  const decimals = decimalsOf(d.currency);
  const sum = (text: string) => {
    const n = toMinor(text, decimals);
    return n ? n : null;
  };
  const tip = sum(d.tip);
  const tax = sum(d.tax);
  return (tip ?? 0) + (tax ?? 0) <= (paidOf(d) ?? 0) ? { tip, tax } : { tip: null, tax: null };
}

/**
 * Today's rates have come, or it is known that they won't (`failed`): a draft still asking for its
 * rate takes today's; with none to be had, the rate of the last expense in that currency, however
 * old; with neither, it stops asking and the rate is left to be typed. A draft that isn't asking
 * is left as it is: a rate someone typed, or the one an expense was recorded at, is never replaced.
 */
export function rated(d: Draft, l: Ledger, today: Rates | null | undefined, failed: boolean): Draft {
  if (!d.asking) return d;
  const rate = todaysRate(today, d.currency, l.currency) || (failed ? (lastPaidIn(l, d.currency)?.rate ?? "") : "");
  return rate ? { ...d, rate, asking: false } : failed ? { ...d, asking: false } : d;
}

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
  const amount = amountOf(d, l) ?? 0;
  const byShares = d.how === "shares" && now.length > 0;
  const parts = allot(amount, everyone.map((id) => (who.includes(id) ? (byShares ? d.shares[id] : 1) : 0)), rot);
  return { ...d, how, amounts: Object.fromEntries(everyone.flatMap((id, i) => (parts[i] ? [[id, fromMinor(parts[i], decimals)]] : []))) };
}

/**
 * What is wrong with the draft, in the core's words; null when it can be recorded. Paid in another
 * currency, "rate" is a rate still to be filled in, and "amount" is also an amount that comes to
 * nothing in the ledger's currency (one yen at 0.009 is less than a cent) or to more than an entry
 * can be.
 */
export function draftProblem(d: Draft, l: Ledger): Problem | PaidProblem | null {
  if (!paidOf(d)) return { what: "amount" };
  if (abroad(d, l) && !settled(d.rate)) return { what: "rate" };
  const amount = amountOf(d, l);
  if (!amount || !isAmount(amount)) return { what: "amount" };
  return problem({ payer: d.payer, amount, split: splitOf(d, decimalsOf(l.currency)) }, l.members.map((m) => m.id)) ?? payersProblem(d, l);
}

/** Several who paid, in smallest units (those above nothing), in the roster's order; null when one paid it all. */
export function payersOf(d: Pick<Draft, "payers">, l: Ledger): Record<string, number> | null {
  if (!d.payers) return null;
  const decimals = decimalsOf(l.currency);
  const out: Record<string, number> = {};
  for (const m of l.members) {
    const n = toMinor(d.payers[m.id] ?? "", decimals);
    if (n) out[m.id] = n;
  }
  return out;
}

/** Of several who paid, the one who paid the most (of two the same, the first on the roster): the expense's `payer`. */
export const mostPaid = (p: Record<string, number>): string => Object.entries(p).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

/** What can be wrong with several who paid: paid in another currency, fewer than two, or not adding up to it (`off`: still to pay, above zero; too much, below). */
export type PaidProblem = { what: "paidAbroad" } | { what: "paidFew" } | { what: "paidOff"; off: number };
export function payersProblem(d: Draft, l: Ledger): PaidProblem | null {
  const p = payersOf(d, l);
  if (!p) return null;
  if (abroad(d, l)) return { what: "paidAbroad" };
  if (Object.keys(p).length < 2) return { what: "paidFew" };
  const amount = amountOf(d, l);
  const off = (amount ?? 0) - Object.values(p).reduce((a, n) => a + n, 0);
  return amount && off ? { what: "paidOff", off } : null;
}

/**
 * The draft as an expense says it, new or changed; null while something is wrong with it. Paid in
 * another currency, it says both amounts and the rate. In the ledger's own, a change says so
 * (null), or says nothing when the expense's other currency was one these screens couldn't show
 * and nobody touched it (ops.ts, ExpenseEdit, says what each does).
 */
export function saying(d: Draft, l: Ledger): ExpenseEdit | null {
  if (draftProblem(d, l)) return null;
  const several = payersOf(d, l);
  const said = {
    // (of several, the one who paid the most; always said, so an edit says one alone with null)
    payer: several ? mostPaid(several) : d.payer,
    payers: several,
    amount: amountOf(d, l) ?? 0,
    note: d.note,
    split: splitOf(d, decimalsOf(l.currency)),
    ...(d.date ? { date: d.date } : {}),
    // (the business, the place and what paid are always said: one emptied here is taken off)
    merchant: d.merchant.trim() || null,
    place: d.place.trim() || null,
    payment: d.payment.trim() || null,
    category: d.category,
    // (always said, so an edit turns it either way)
    refund: d.refund ? (true as const) : null,
  };
  // (a refund has no tip or tax)
  const extras = d.refund ? { tip: null, tax: null } : extrasOf(d);
  if (abroad(d, l)) return { ...said, paidIn: { currency: d.currency, amount: paidOf(d) ?? 0, rate: settled(d.rate) }, ...extras };
  // (paid in a currency these screens can't show: that, and its tip and tax, unsaid)
  return d.untouched ? said : { ...said, paidIn: null, ...extras };
}
