/**
 * Text from a statement file. It is untrusted (IMP-5): it is only ever kept and shown as text.
 * What is done to it here: turned from bytes into characters, tidied, and its account and card
 * numbers cut to their last four digits (IMP-6).
 */

export type Charset = "utf-8" | "windows-1252" | "utf-16le" | "utf-16be";

/**
 * A file's bytes as text. A byte-order mark decides; then a `hint` (an OFX header names its
 * character set); otherwise UTF-8, and when the bytes aren't valid UTF-8, Windows-1252, which is
 * what older bank exports with accents are in.
 */
export function decodeText(bytes: Uint8Array, hint?: Charset): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (hint && hint !== "utf-8") return new TextDecoder(hint).decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** One line of statement text, tidied: control characters out, runs of spaces to one, ends trimmed, and no longer than `most`. */
export function tidy(text: string, most = 200): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, most);
}

/** The last four digits of an account or card number, however it was written ("1234-567 8901" gives "8901"). Fewer than four digits: those. */
export function lastFour(number: string): string {
  return number.replace(/\D/g, "").slice(-4);
}

/**
 * IMP-6: account and card numbers inside a line of text are cut to their last four digits,
 * written "****1234". Taken for one: seven or more digits in a row; a card number in groups
 * ("4500 1234 5678 9012", "3712-345678-90123"); and a number the bank already masked
 * ("4500********9012", "XXXX XXXX XXXX 9012"). Shorter numbers (a store number, an amount, a day)
 * stay. Running it twice changes nothing more.
 */
export function maskNumbers(text: string): string {
  // one line of a statement is never this long; past it the text is cut, so the patterns below always finish quickly
  return text
    .slice(0, 1000)
    // already masked by the bank: at least four X, * or • in a row (spaces and dashes between them
    // allowed), with the card's first digits before them or its last digits after them
    .replace(/(?<![A-Za-z0-9])(?:\d{4}[ -]?){0,3}\d{0,6}(?:[Xx*\u2022][ -]?){4,}\d*(?![A-Za-z0-9])/g, (run) => {
      const kept = lastDigits(run);
      return kept ? `****${kept}` : "****";
    })
    // a card number in groups of digits
    .replace(/(?<![\d*])\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}(?!\d)/g, (run) => `****${lastFour(run)}`)
    .replace(/(?<![\d*])\d{4}[ -]\d{6}[ -]\d{5}(?!\d)/g, (run) => `****${lastFour(run)}`)
    // any long run of digits
    .replace(/(?<![\d*])\d{7,}(?!\d)/g, (run) => `****${run.slice(-4)}`);
}

/** The digits a masked number still shows at its end (none when it ends in a mask character). */
function lastDigits(run: string): string {
  const m = /(\d[ -]?){1,4}$/.exec(run.trimEnd());
  return m ? m[0].replace(/\D/g, "") : "";
}

/**
 * Text as it is compared: accents and width folded (NFKC), capitals, everything that isn't a
 * letter or a digit turned into a space, runs of spaces to one. "Tim Horton's #1234" and
 * "TIM HORTON S 1234" compare equal. Chinese, Japanese and Korean characters are kept.
 */
export function fold(text: string): string {
  return text.normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
