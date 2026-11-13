/**
 * How 两清 writes money for a person to read: the currency's own sign, digits in threes, and as many
 * decimals as that currency writes ("$1,234.50", "JP¥3,000"). The currencies are the site's own
 * list (tools/money.ts), the ones its exchange rates cover.
 */
import type { Lang } from "../i18n";
import { CURRENCY_BY_CODE } from "../tools/money";
import { fromMinor, type Decimals } from "./core";

/** How many decimals this currency writes; a code the site doesn't know is treated as cents. */
export const decimalsOf = (currency: string): Decimals => (CURRENCY_BY_CODE[currency]?.decimals === 0 ? 0 : 2);

/** The currency's sign ("$", "JP¥"); a code the site doesn't know stands for itself. */
export const signOf = (currency: string) => CURRENCY_BY_CODE[currency]?.symbol ?? `${currency} `;

/** The currency's name in the reader's language. */
export const currencyName = (currency: string, lang: Lang) => CURRENCY_BY_CODE[currency]?.[lang] ?? currency;

const groupers = new Map<string, Intl.NumberFormat>();
/** A whole number with its digits in threes, the way the reader's language groups them. */
function grouped(whole: string, lang: Lang): string {
  const locale = lang === "zh" ? "zh-CN" : "en-CA";
  let nf = groupers.get(locale);
  if (!nf) groupers.set(locale, (nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })));
  // (BigInt, so the digits of even the largest sum come through whole)
  return nf.format(BigInt(whole));
}

/** An amount in smallest units, written out: 4250 Canadian cents is "$42.50". Never negative: the words around it say who owes whom. */
export function money(minor: number, currency: string, lang: Lang): string {
  const [whole, frac] = fromMinor(Math.abs(minor), decimalsOf(currency)).split(".");
  return `${signOf(currency)}${grouped(whole, lang)}${frac ? `.${frac}` : ""}`;
}

/**
 * An amount while it is being typed on the keypad: the sign, the whole part in threes, and the
 * decimals exactly as far as they have been typed ("$1,234." after the point, "$0" before anything).
 */
export function typed(text: string, currency: string, lang: Lang): string {
  const [whole, frac] = text.split(".");
  return `${signOf(currency)}${grouped(whole || "0", lang)}${text.includes(".") ? `.${frac ?? ""}` : ""}`;
}
