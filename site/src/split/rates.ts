/**
 * Exchange rates for an expense paid in another currency: how a rate is written and kept, the one
 * a new expense starts with, and whether the ledger's record of one can be shown. A rate is always
 * "this many of the ledger's currency for one of the other" and always text, read digit by digit
 * (core/money.ts, convert), so every phone gets the same cent from it.
 *
 * Nothing here touches the screen or the network, so it is tested without a browser
 * (tests/split-screens.test.ts). Today's rates come from the site's own source (tools/fx.ts).
 */
import { isCode, type Rates } from "../tools/money";
import { convert, isAmount, isRate, type Expense, type Ledger } from "./core";
import { decimalsOf } from "./format";

/** What an expense holds about the other currency it was paid in. */
export type PaidIn = NonNullable<Expense["paidIn"]>;

/**
 * A number as a rate is written: five figures that count, never more than 8 decimals, no zeros
 * trailing ("1.4012", "150.12", "0.0091235"). Empty when it isn't a rate that can be written.
 */
export function rateText(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return "";
  // (a billion or more has ten figures before the point, which no rate has: isRate says no)
  const text = Number(x.toPrecision(5)).toFixed(8).replace(/\.?0+$/, "");
  return isRate(text) ? text : "";
}

/** Today's rate from one currency to another, out of the site's rates (so many of each for one US dollar); empty when either is missing. */
export function todaysRate(rates: Rates | null | undefined, from: string, to: string): string {
  const f = rates?.[from];
  const t = rates?.[to];
  return typeof f === "number" && typeof t === "number" && f > 0 && t > 0 ? rateText(t / f) : "";
}

/**
 * A rate while it is typed, held to what a rate can be: digits and one point, 9 digits before it
 * and 8 after, no zeros piling up in front. A comma or a Chinese full stop counts as the point
 * (as in input.ts); anything else is dropped. "1." is fine while typing: `settled` reads it as 1.
 */
export function asRateText(raw: string): string {
  let whole = "";
  let frac: string | null = null;
  for (const ch of raw.replace(/[。．,，]/g, ".")) {
    if (ch === ".") frac ??= "";
    else if (!/[0-9]/.test(ch)) continue;
    else if (frac !== null) frac += frac.length < 8 ? ch : "";
    else if (whole === "0") whole = ch;
    else if (whole.length < 9) whole += ch;
  }
  return frac === null ? whole : `${whole || "0"}.${frac}`;
}

/** The typed rate as it is used and kept: a point left hanging is dropped ("1." is "1"). Empty when it isn't a rate. */
export function settled(text: string): string {
  const rate = text.replace(/\.$/, "");
  return isRate(rate) ? rate : "";
}

/**
 * What an expense says it was paid in, when it can be shown: a currency the site knows that isn't
 * the ledger's own, and an amount that comes to exactly what the expense counts for at its rate.
 * Anything else (a currency from a newer page, a record that doesn't add up) is left alone: the
 * expense shows as what it counts for, and nothing the screens do rewrites what they can't read.
 */
export function paidInOf(e: Expense, l: Pick<Ledger, "currency">): PaidIn | null {
  const p = e.paidIn;
  if (!p || !isCode(p.currency) || p.currency === l.currency || !isAmount(p.amount) || !isRate(p.rate)) return null;
  return convert(p.amount, decimalsOf(p.currency), p.rate, decimalsOf(l.currency)) === e.amount ? p : null;
}

/** How long "the last one" stays the lead to follow: a trip's worth. */
export const RECENT = 30 * 24 * 60 * 60 * 1000;

/** The rate of the last expense in the ledger paid in this currency, and when that was; null when there is none. */
export function lastPaidIn(l: Ledger, currency: string): { rate: string; at: number } | null {
  for (let i = l.entries.length - 1; i >= 0; i--) {
    const e = l.entries[i];
    if (e.kind !== "expense" || e.gone !== undefined) continue;
    const p = paidInOf(e, l);
    if (p?.currency === currency) return { rate: p.rate, at: e.at };
  }
  return null;
}

/**
 * The rate an expense in this currency starts with. On a trip everything is paid in the one
 * currency, often with no signal and at the rate the money was changed at: so the rate of the last
 * expense in that currency, while that is recent. Otherwise today's, when the site has it. Empty
 * when there is neither yet.
 */
export function startingRate(l: Ledger, currency: string, today: Rates | null | undefined, now: number): string {
  const last = lastPaidIn(l, currency);
  if (last && now - last.at <= RECENT) return last.rate;
  return todaysRate(today, currency, l.currency);
}
