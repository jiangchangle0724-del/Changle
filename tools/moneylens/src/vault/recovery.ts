/**
 * The recovery code (VAULT-2, VAULT-7): 160 random bits, shown once when the vault is made, that
 * can open the vault when the passphrase and every passkey are lost. It is written in Crockford's
 * base32 because that alphabet survives being copied by hand: no I, L, O or U, and when read back
 * O counts as 0, I and L as 1, and capitals don't matter.
 *
 * Thirty-two symbols carry the bits. Two more are a check on them, so that a slip of the pen is
 * told apart from a code that simply isn't this vault's: the check catches any one wrong symbol
 * and any two neighbours swapped. It is there for people, not for secrecy.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** How many random bytes a recovery code holds: 20, which is 160 bits (the floor in VAULT-7 is 128). */
export const RECOVERY_BYTES = 20;
const DATA_SYMBOLS = (RECOVERY_BYTES * 8) / 5;
/** The check is the 32 symbols, read as one base-32 number, modulo this prime: any single wrong symbol or swap of neighbours changes it. */
const CHECK_PRIME = 1021;

function checkOf(values: readonly number[]): string {
  let rest = 0;
  for (const v of values) rest = (rest * 32 + v) % CHECK_PRIME;
  return ALPHABET[rest >> 5]! + ALPHABET[rest & 31]!;
}

/** The code for these bytes: eight groups of four and the two check symbols, "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX". */
export function formatRecovery(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_BYTES) throw new RangeError("recovery: wrong length");
  const values: number[] = [];
  let bits = 0;
  let have = 0;
  for (const b of bytes) {
    bits = (bits << 8) | b;
    have += 8;
    while (have >= 5) {
      have -= 5;
      values.push((bits >> have) & 31);
    }
    bits &= (1 << have) - 1;
  }
  const symbols = values.map((v) => ALPHABET[v]!).join("");
  return `${symbols.match(/.{4}/g)!.join("-")}-${checkOf(values)}`;
}

export type RecoveryRead = { ok: true; bytes: Uint8Array } | { ok: false; why: "malformed" | "typo" } | { ok: false; why: "wrong-length"; symbols: number };

/**
 * Reads a code as someone typed it: spaces, dashes, dots or underscores anywhere, any capitals,
 * full-width characters from a Chinese keyboard, O for 0, I or L for 1.
 *
 * - "malformed": a character no code has, or far too much text. Not a recovery code.
 * - "wrong-length": only symbols a code has, but `symbols` of them where a code has 34. One was
 *   left out or typed twice, or this is something else.
 * - "typo": the right shape, but the check doesn't agree, so something was miscopied.
 */
export function readRecovery(text: string): RecoveryRead {
  if (typeof text !== "string" || text.length > 200) return { ok: false, why: "malformed" };
  // (whatever a word processor or a form put between the groups: any dash, a dot, an underscore)
  const typed = text.normalize("NFKC").replace(/[\s\p{Pd}_.]/gu, "");
  // (only plain letters and digits from here on: capitals of other alphabets can turn into ours)
  if (!/^[0-9A-Za-z]+$/.test(typed)) return { ok: false, why: "malformed" };
  const symbols = typed.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  const values: number[] = [];
  for (const s of symbols) {
    const value = ALPHABET.indexOf(s);
    if (value < 0) return { ok: false, why: "malformed" };
    values.push(value);
  }
  if (symbols.length !== DATA_SYMBOLS + 2) return { ok: false, why: "wrong-length", symbols: symbols.length };
  const data = values.slice(0, DATA_SYMBOLS);
  if (checkOf(data) !== symbols.slice(DATA_SYMBOLS)) return { ok: false, why: "typo" };
  const bytes = new Uint8Array(RECOVERY_BYTES);
  let bits = 0;
  let have = 0;
  let at = 0;
  for (const value of data) {
    bits = (bits << 5) | value;
    have += 5;
    if (have >= 8) {
      have -= 8;
      bytes[at++] = (bits >> have) & 255;
      bits &= (1 << have) - 1;
    }
  }
  return { ok: true, bytes };
}

/** The bytes of a typed code, or null when it isn't one (malformed, the wrong length or miscopied). */
export function parseRecovery(text: string): Uint8Array | null {
  const read = readRecovery(text);
  return read.ok ? read.bytes : null;
}

/** A new recovery code, from the platform's random generator. */
export function newRecovery(): { code: string; bytes: Uint8Array } {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES));
  return { code: formatRecovery(bytes), bytes };
}
