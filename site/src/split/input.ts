/**
 * The keypad on 记一笔: what the amount reads after each key. Kept apart from the screen so the
 * typing rules can be tested without a browser (tests/split-screens.test.ts).
 */
import type { Decimals } from "./core";

export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back";

/** The digits before the point an amount can have: 99,999,999.99, or 9,999,999,999 yen (core/money.ts, MAX_AMOUNT). */
const wholeDigits = (decimals: Decimals) => (decimals === 2 ? 8 : 10);

/**
 * The typed amount after one more key. Never more decimals than the currency writes, never more
 * digits than an entry can be, no second point, and no zeros piling up in front ("0" then "5" is
 * "5"; the point on its own is "0."). A key that can't apply leaves the amount as it was.
 */
export function press(text: string, key: Key, decimals: Decimals): string {
  if (key === "back") return text.slice(0, -1);
  const [whole, frac] = text.split(".");
  if (key === ".") return decimals === 0 || text.includes(".") ? text : `${whole || "0"}.`;
  if (frac !== undefined) return frac.length < decimals ? text + key : text;
  if (whole === "0") return key;
  return whole.length < wholeDigits(decimals) ? text + key : text;
}

/**
 * Text typed or pasted into a field for one person's amount (sharing by amounts), held to what an
 * amount can be: the same rules as the keypad, a key at a time. A comma counts as the point (that
 * is what the number keyboard of a phone set to French types), and so does a Chinese full stop.
 * Anything else is dropped.
 */
export function asAmountText(raw: string, decimals: Decimals): string {
  let out = "";
  for (const ch of raw.replace(/[。．,，]/g, ".")) if (/[0-9.]/.test(ch)) out = press(out, ch as Key, decimals);
  return out;
}
