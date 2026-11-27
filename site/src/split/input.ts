/**
 * The keypad on 记一笔: what the amount reads after each key. Kept apart from the screen so the
 * typing rules can be tested without a browser (tests/split-screens.test.ts).
 *
 * Its + (2026-11-26, borrowed from Kostos, whose amount fields take sums): amounts typed one after
 * another with a + between them, "12.50+8.75", come to their sum (totalOf). Each one follows the
 * same rules as an amount on its own.
 */
import { fromMinor, MAX_AMOUNT, toMinor, type Decimals } from "./core";

export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back" | "+";

/** The most amounts one sum adds up. */
export const MAX_TERMS = 20;

/** The digits before the point an amount can have: 99,999,999.99, or 9,999,999,999 yen (core/money.ts, MAX_AMOUNT). */
const wholeDigits = (decimals: Decimals) => (decimals === 2 ? 8 : 10);

/**
 * The typed amount after one more key. Never more decimals than the currency writes, never more
 * digits than an entry can be, no second point, and no zeros piling up in front ("0" then "5" is
 * "5"; the point on its own is "0."). A key that can't apply leaves the amount as it was.
 */
export function press(text: string, key: Key, decimals: Decimals): string {
  if (key === "back") return text.slice(0, -1);
  // a sum: the keys go to its last amount, and + starts another once that one is more than nothing
  // (its point left hanging comes off); the sum can't come to more than an expense can be
  const cut = text.lastIndexOf("+") + 1;
  const head = text.slice(0, cut);
  const last = text.slice(cut);
  if (key === "+") {
    const done = last.endsWith(".") ? last.slice(0, -1) : last;
    return /[1-9]/.test(done) && text.split("+").length < MAX_TERMS ? `${head}${done}+` : text;
  }
  const next = one(last, key, decimals);
  if (!head || next === last) return head + next;
  const sum = sumOf(head + next, decimals);
  return sum !== null && sum <= MAX_AMOUNT ? head + next : text;
}

/** One amount after one more key (press, for an amount on its own). */
function one(text: string, key: Exclude<Key, "back" | "+">, decimals: Decimals): string {
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

/** What the amounts of a sum come to, in smallest units (an amount still being typed counts as far as it goes, none yet as nothing); null when one isn't an amount. */
function sumOf(text: string, decimals: Decimals): number | null {
  let sum = 0;
  for (const term of text.split("+")) {
    if (!term) continue;
    const n = toMinor(term, decimals);
    if (n === null) return null;
    sum += n;
  }
  return sum;
}

/**
 * A sum as the amount it comes to, written as an amount is typed ("12.5+8.75" is "21.25", "12+8" is
 * "20"); text with no + is itself. An amount still being typed counts as far as it goes.
 */
export function totalOf(text: string, decimals: Decimals): string {
  if (!text.includes("+")) return text;
  const sum = sumOf(text, decimals) ?? 0;
  const written = fromMinor(sum, decimals);
  return decimals && written.endsWith(".00") ? written.slice(0, -3) : written;
}
