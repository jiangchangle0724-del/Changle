/** The currency list and the arithmetic, with nothing browser-only in them (tests/tools.test.ts imports this file). */

/** Units per one US dollar. */
export type Rates = Record<string, number>;

export const CURRENCIES = [
  { code: "CAD", zh: "加元", en: "Canadian dollar", symbol: "$" },
  { code: "CNY", zh: "人民币", en: "Chinese yuan", symbol: "¥" },
  { code: "USD", zh: "美元", en: "US dollar", symbol: "US$" },
  { code: "HKD", zh: "港元", en: "Hong Kong dollar", symbol: "HK$" },
] as const;
export type Code = (typeof CURRENCIES)[number]["code"];

/** Convert an amount between two currencies with per-USD rates. */
export function convert(rates: Rates, amount: number, from: string, to: string) {
  const f = rates[from];
  const t = rates[to];
  if (!f || !t) return NaN;
  return (amount / f) * t;
}

/** What a typed amount means: digits and one decimal point ("1.2.3" is 1.23; Chinese 。 and ，work). */
export const cleanAmount = (s: string) => {
  const t = s.replace(/[，,\s]/g, "").replace(/[。]/g, ".").replace(/[^0-9.]/g, "");
  const i = t.indexOf(".");
  return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "");
};

/** The most digits an amount can have: a trillion is plenty, and the result still fits on a phone. */
export const MAX_DIGITS = 12;

/** A cleaned amount with at most `max` digits; the decimal point stays, the digits past the cap go. */
export function capDigits(cleaned: string, max: number) {
  const i = cleaned.indexOf(".");
  const whole = i < 0 ? cleaned : cleaned.slice(0, i);
  if (whole.length >= max) return whole.slice(0, max);
  if (i < 0) return cleaned;
  return cleaned.slice(0, i + 1 + (max - whole.length));
}

/**
 * How large a number reads on screen: the display font steps down as the digits add up, so
 * "7,015,816.75" is whole on a 320px phone instead of losing its last digits. Returns a class
 * for the field or figure ("" at the normal size); `steps` are the character counts past which
 * it shrinks once and twice (a narrower field passes smaller ones).
 */
export function sizeClass(shown: string, steps: [number, number] = [9, 12]) {
  const n = shown.length;
  return n > steps[1] ? "is-longer" : n > steps[0] ? "is-long" : "";
}
