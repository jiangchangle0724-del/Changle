/**
 * 两清's money. An amount is a whole number of its currency's smallest unit: cents for dollars, one
 * yen for yen (a currency writes 2 decimals or none, as in tools/money.ts). No amount is ever a
 * fraction, so nothing is rounded twice and every sum is exact.
 *
 * Nothing browser-only in this folder: the phone and (later) the server run the same file, and
 * tests/split.test.ts imports it directly.
 */

/** How many decimals a currency writes: 2 (cents) or 0 (yen, won). */
export type Decimals = 0 | 2;

/**
 * The most one entry can be, in smallest units: 99,999,999.99 in dollars. Sums of thousands of
 * entries stay far inside what a JavaScript number holds exactly (9,007,199,254,740,991).
 */
export const MAX_AMOUNT = 9_999_999_999;

/** A whole number of smallest units, above zero and no more than one entry can be. */
export const isAmount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT;

/**
 * What was typed, in smallest units: "86.4" is 8640 cents, "86." (still typing) is 8600, "3000" yen
 * is 3000. Null when it isn't an amount: empty, letters, a second point, or more decimals than the
 * currency writes ("1.005", or "12.5" yen). Read digit by digit, never through a fraction.
 */
export function toMinor(text: string, decimals: Decimals): number | null {
  const m = /^(\d{1,12})(?:\.(\d*))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > decimals) return null;
  const n = Number(m[1]) * 10 ** decimals + (decimals ? Number(frac.padEnd(decimals, "0")) : 0);
  return Number.isSafeInteger(n) ? n : null;
}

/** Smallest units written out plainly, no grouping and no symbol: 8640 cents is "86.40", -500 is "-5.00", 3000 yen is "3000". */
export function fromMinor(minor: number, decimals: Decimals): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  if (decimals === 0) return sign + String(abs);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** An exchange rate as it is typed and stored: digits with up to 8 decimals, above zero ("1.40", "0.0091"). */
export const isRate = (rate: string) => /^\d{1,9}(\.\d{1,8})?$/.test(rate) && /[1-9]/.test(rate);

/**
 * An amount in one currency as an amount in another, at a rate of "this many of the second for one
 * of the first": 3000 US cents at "1.40" is 4200 Canadian cents. Half a smallest unit rounds up.
 * The rate is read as written, digit by digit, and the sum is done in whole numbers (BigInt), so
 * 1.005 is exactly 1.005 and every phone gets the same cent. Null for a rate that isn't one, or a
 * result too big to hold.
 */
export function convert(amount: number, from: Decimals, rate: string, to: Decimals): number | null {
  if (!Number.isSafeInteger(amount) || amount < 0 || !isRate(rate)) return null;
  const [whole, frac = ""] = rate.split(".");
  const ten = BigInt(10);
  const two = BigInt(2);
  // amount / 10^from is the sum in whole dollars; the rate is (whole + frac) / 10^frac.length
  const top = BigInt(amount) * BigInt(whole + frac) * ten ** BigInt(to);
  const bottom = ten ** BigInt(from + frac.length);
  const rounded = (top * two + bottom) / (two * bottom);
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}
