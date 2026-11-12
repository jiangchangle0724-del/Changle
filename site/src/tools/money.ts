/** The currency list and the arithmetic, with nothing browser-only in them (tests/tools.test.ts imports this file). */

/** Units per one US dollar. */
export type Rates = Record<string, number>;

/** Every currency the rooms server's /api/fx returns; `decimals` is how the amount is written (yen and won have no cents). */
export const CURRENCIES = [
  { code: "CAD", zh: "加元", en: "Canadian dollar", symbol: "$", decimals: 2 },
  { code: "CNY", zh: "人民币", en: "Chinese yuan", symbol: "¥", decimals: 2 },
  { code: "USD", zh: "美元", en: "US dollar", symbol: "US$", decimals: 2 },
  { code: "HKD", zh: "港元", en: "Hong Kong dollar", symbol: "HK$", decimals: 2 },
  { code: "EUR", zh: "欧元", en: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", zh: "英镑", en: "British pound", symbol: "£", decimals: 2 },
  { code: "JPY", zh: "日元", en: "Japanese yen", symbol: "JP¥", decimals: 0 },
  { code: "KRW", zh: "韩元", en: "Korean won", symbol: "₩", decimals: 0 },
  { code: "TWD", zh: "新台币", en: "New Taiwan dollar", symbol: "NT$", decimals: 2 },
  { code: "SGD", zh: "新加坡元", en: "Singapore dollar", symbol: "S$", decimals: 2 },
  { code: "AUD", zh: "澳元", en: "Australian dollar", symbol: "A$", decimals: 2 },
] as const;
export type Code = (typeof CURRENCIES)[number]["code"];
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c])) as Record<string, Currency>;
/** The rows a new phone starts with; the rest are added from the sheet. */
export const DEFAULT_CODES: Code[] = ["CAD", "CNY", "USD", "HKD"];
export const isCode = (s: unknown): s is Code => typeof s === "string" && s in CURRENCY_BY_CODE;

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
