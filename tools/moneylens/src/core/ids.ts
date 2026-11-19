/**
 * Identifiers (ISO-3): 128 random bits from the platform's own generator, written as 22 URL-safe
 * characters. Knowing one grants nothing: the server never treats an identifier as permission.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Bytes as URL-safe base64 with no padding. */
export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    out += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += ALPHABET[c & 63]!;
  }
  return out;
}

/** URL-safe base64 (no padding) back to bytes; null when it isn't that. */
export function fromBase64url(text: string): Uint8Array | null {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let have = 0;
  let at = 0;
  for (const ch of text) {
    bits = (bits << 6) | ALPHABET.indexOf(ch);
    have += 6;
    if (have >= 8) {
      have -= 8;
      out[at++] = (bits >> have) & 255;
    }
  }
  // the bits left over must be zero, so that one value has one spelling
  return (bits & ((1 << have) - 1)) === 0 ? out : null;
}

/** A new identifier: 128 random bits, 22 characters. */
export function newId(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

/** Is this an identifier as `newId` makes them? (The last character carries two bits, so only four spellings of it are canonical.) */
export const isId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{21}[AQgw]$/.test(s);
