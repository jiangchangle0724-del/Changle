// Codes people read out, type and paste: no 0 or O, no 1, I or L.

const LETTERS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A random code. `rand` gives numbers in [0, 1). */
export function makeCode(rand: () => number, length: number, lower = false): string {
  let code = "";
  for (let i = 0; i < length; i++) code += LETTERS[Math.floor(rand() * LETTERS.length)];
  return lower ? code.toLowerCase() : code;
}

/** An order's code: 6 characters, upper case. It goes in the payment's memo. */
export const ORDER_LENGTH = 6;
export const ORDER_RE = /^[2-9A-HJKMNP-Z]{6}$/;
/** An offer's id, as in its address /tuan/t/<id>: 8 characters, lower case. */
export const OFFER_LENGTH = 8;
export const OFFER_RE = /^[2-9a-hjkmnp-z]{8}$/;
/** A shop's address /tuan/s/<slug>: lower-case letters, digits and hyphens. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** An order code as someone typed it: spaces dropped, upper case. */
export const tidyOrderCode = (text: string): string => text.replace(/\s+/g, "").toUpperCase();
