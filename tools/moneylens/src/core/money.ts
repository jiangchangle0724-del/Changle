/**
 * Money (ACC-1). An amount is a whole number of the currency's smallest unit: cents for CAD and
 * USD. Text is read digit by digit and never goes through parseFloat, so there is no fraction
 * anywhere to round.
 *
 * Sign, everywhere in MoneyLens: positive is money into the account (a deposit, a payment made to a
 * credit card, a refund), negative is money out (a withdrawal, a purchase). A credit card that
 * owes $400 has a balance of -40000.
 */

/** Decimal places of a currency's smallest unit where it isn't 2 (ISO 4217). */
const EXPONENTS: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

/** A currency code as statements write it: three capital letters. */
export const isCurrency = (s: unknown): s is string => typeof s === "string" && /^[A-Z]{3}$/.test(s);

/** How many decimal places `currency` has. */
export const exponentOf = (currency: string): number => EXPONENTS[currency] ?? 2;

/** The largest single amount taken: 10^13 smallest units ($100 billion). Sums are checked on their own (`add`). */
export const MAX_MINOR = 1e13;

/** Is this a usable amount: a whole number, and not absurdly large? */
export const isMinor = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= MAX_MINOR;

/** a + b, refusing a result too large to be exact. */
export function add(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(sum)) throw new RangeError("money: not a whole amount");
  return sum;
}

/** The total of a list of amounts. */
export const total = (amounts: Iterable<number>): number => {
  let sum = 0;
  for (const a of amounts) sum = add(sum, a);
  return sum;
};

/** How a file writes its numbers. `decimal` is the mark before the cents: "." (1,234.56, the default) or "," (1 234,56, as French-language exports do). */
export type AmountStyle = { decimal?: "." | "," };

/**
 * An amount as a statement prints it, in smallest units; null for anything that isn't exactly one
 * amount. Read: "1,234.56", "-1,234.56", "+12", "(1,234.56)", "1,234.56-", "$1,234.56",
 * "CA$12.50", "12.50 CAD", ".5", and with `decimal: ","` "1 234,56 $". Digits past the currency's
 * own places are taken only when they are zeros ("12.3400"). A currency written next to the amount
 * has to be `currency`: "US$5.00" or "5.00 USD" on a CAD account is refused, not read as CAD. "CR"
 * and "DR" are not read here: what they mean depends on the statement, so its own parser decides.
 */
export function parseAmount(text: string, currency = "CAD", style: AmountStyle = {}): number | null {
  if (typeof text !== "string" || text.length > 40) return null;
  // (a minus sign as typeset, and the spaces French exports group thousands with)
  let s = text.replace(/[\u2212\u2012\u2013]/g, "-").replace(/[\u00a0\u202f\u2009]/g, " ").trim();
  let negative = false;
  let signs = 0;
  const bracketed = /^\((.*)\)$/.exec(s);
  if (bracketed) {
    negative = true;
    signs++;
    s = bracketed[1]!.trim();
  }
  // the currency, before or after: "$", "CA$", "US$", or the three-letter code
  const stripCurrency = (): boolean => {
    const dollar = /^([A-Z]{0,3})\s?\$\s*/.exec(s);
    if (dollar) {
      if (!currency.startsWith(dollar[1]!)) return false;
      s = s.slice(dollar[0].length);
    }
    s = s.replace(/\s*\$$/, "").trim();
    const code = /^([A-Z]{3})\s+/.exec(s) ?? /\s+([A-Z]{3})$/.exec(s);
    if (code) {
      if (code[1] !== currency) return false;
      s = (code.index === 0 ? s.slice(code[0].length) : s.slice(0, code.index)).trim();
    }
    return true;
  };
  if (!stripCurrency()) return null;
  if (/^[+-]/.test(s)) {
    if (s[0] === "-") negative = true;
    signs++;
    s = s.slice(1).trim();
    // "-$5.00": the sign came before the currency
    if (!stripCurrency()) return null;
  }
  if (s.endsWith("-")) {
    negative = true;
    signs++;
    s = s.slice(0, -1).trim();
  }
  if (signs > 1) return null;
  const point = style.decimal ?? ".";
  const shape = point === "." ? /^(\d{1,3}(?:[, ]\d{3})+|\d*)(?:\.(\d+))?$/ : /^(\d{1,3}(?:[ .]\d{3})+|\d*)(?:,(\d+))?$/;
  const m = shape.exec(s);
  if (!m) return null;
  const whole = (m[1] ?? "").replace(/[^\d]/g, "");
  let cents = m[2] ?? "";
  if (!whole && !cents) return null;
  const places = exponentOf(currency);
  if (cents.length > places) {
    if (/[^0]/.test(cents.slice(places))) return null;
    cents = cents.slice(0, places);
  }
  cents = cents.padEnd(places, "0");
  const digits = (whole + cents).replace(/^0+(?=\d)/, "");
  if (digits.length > 14) return null;
  const value = Number(digits);
  if (!isMinor(value)) return null;
  return negative && value !== 0 ? -value : value;
}

/** An amount as plain text for a file: "-1234.56" (no grouping, a point, the currency's own places). */
export function toDecimalString(minor: number, currency = "CAD"): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError("money: not a whole amount");
  const places = exponentOf(currency);
  const digits = String(Math.abs(minor)).padStart(places + 1, "0");
  const whole = places ? digits.slice(0, -places) : digits;
  return `${minor < 0 ? "-" : ""}${whole}${places ? `.${digits.slice(-places)}` : ""}`;
}
