/**
 * 搜索账目 (2026-11-26, borrowed from Spliit's search, its #51): finding an expense by what it says.
 *
 * What is typed is looked for in the note, the business, the place, the payment and who paid it
 * (by name, and 你 for whoever is reading), on letters and digits alone and in any case: "mcdonalds"
 * finds McDonald's, "ＴＩＭ" finds Tim Hortons. Typed as a sum, it is also looked for in what was
 * paid, in the ledger's currency or the one it was paid in: "42.50" (or "$42.5") finds $42.50 and
 * nothing else, "42" finds $42.00 to $42.99.
 */
import type { Lang } from "../i18n";
import type { Expense, Ledger } from "./core";
import { decimalsOf } from "./format";
import { nameFor } from "./lines";

/** Letters and digits only, in one case and one width: what two texts are compared on. */
export const bare = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** A sum typed: its whole part, and the part after the point when there is one (as typed, at most two digits). */
type Sum = { whole: number; part: string | null };

/** What is typed, read as a sum ("42", "42.5", "$42.50", "JP¥4,200", "CAD 42.50", "42。50"), or null when it isn't one. */
export function sumOf(typed: string): Sum | null {
  const m = /^(?:[a-z]{2,3}[$¥€£₩]|[a-z]{3}\s+|[$¥€£₩])?\s*(\d{1,10})(?:[.。](\d{1,2}))?$/i.exec(typed.normalize("NFKC").trim().replace(/,/g, ""));
  return m ? { whole: Number(m[1]), part: m[2] ?? null } : null;
}

/** An amount in a currency's smallest units is the sum typed: the same whole part, and the same cents when cents were typed. */
function fits(amount: number, currency: string, sum: Sum): boolean {
  const d = decimalsOf(currency);
  const unit = 10 ** d;
  if (Math.floor(amount / unit) !== sum.whole) return false;
  if (sum.part === null) return true;
  return d > 0 && amount % unit === Number(sum.part.padEnd(d, "0"));
}

/** This expense is one being looked for. Nothing typed: every one is. */
export function matches(e: Expense, l: Ledger, typed: string, me: string | undefined, lang: Lang): boolean {
  if (!typed.trim()) return true;
  const sum = sumOf(typed);
  if (sum && (fits(e.amount, l.currency, sum) || (e.paidIn !== undefined && fits(e.paidIn.amount, e.paidIn.currency, sum)))) return true;
  const want = bare(typed);
  if (!want) return false;
  const name = l.members.find((m) => m.id === e.payer)?.name;
  return [e.note, e.merchant, e.place, e.payment, name, nameFor(l, e.payer, me, lang)].some((text) => !!text && bare(text).includes(want));
}

/** Below this many expenses there is nothing to search: the list is short enough to see whole. */
export const SEARCH_FROM = 6;
