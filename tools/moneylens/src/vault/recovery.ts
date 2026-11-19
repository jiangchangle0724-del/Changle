/**
 * The recovery code (VAULT-2, VAULT-7): 160 random bits, shown once when the vault is made, that
 * can open the vault when the passphrase and every passkey are lost. It is written in Crockford's
 * base32, in eight groups of four, because that alphabet survives being copied by hand: no I, L, O
 * or U, and when read back O counts as 0, I and L as 1, and capitals don't matter.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** How many random bytes a recovery code holds: 20, which is 160 bits (the floor in VAULT-7 is 128). */
export const RECOVERY_BYTES = 20;

/** The code for these bytes: "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX". */
export function formatRecovery(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_BYTES) throw new RangeError("recovery: wrong length");
  let symbols = "";
  let bits = 0;
  let have = 0;
  for (const b of bytes) {
    bits = (bits << 8) | b;
    have += 8;
    while (have >= 5) {
      have -= 5;
      symbols += ALPHABET[(bits >> have) & 31]!;
    }
    bits &= (1 << have) - 1;
  }
  return symbols.match(/.{4}/g)!.join("-");
}

/** The bytes of a code as someone typed it: spaces and dashes anywhere, any capitals, O for 0, I or L for 1. Null when it isn't a whole code. */
export function parseRecovery(text: string): Uint8Array | null {
  if (typeof text !== "string" || text.length > 200) return null;
  const symbols = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (symbols.length !== (RECOVERY_BYTES * 8) / 5) return null;
  const out = new Uint8Array(RECOVERY_BYTES);
  let bits = 0;
  let have = 0;
  let at = 0;
  for (const s of symbols) {
    const value = ALPHABET.indexOf(s);
    if (value < 0) return null;
    bits = (bits << 5) | value;
    have += 5;
    if (have >= 8) {
      have -= 8;
      out[at++] = (bits >> have) & 255;
      bits &= (1 << have) - 1;
    }
  }
  return out;
}

/** A new recovery code, from the platform's random generator. */
export function newRecovery(): { code: string; bytes: Uint8Array } {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES));
  return { code: formatRecovery(bytes), bytes };
}
