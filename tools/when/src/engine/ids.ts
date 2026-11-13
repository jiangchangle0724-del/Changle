// A gathering's address and its admin code.

/** No 0, o, 1, l or i: nothing that reads as something else when typed from a screenshot. */
export const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODE_RE = /^[a-hjkmnp-z2-9]{8}$/;
export const ADMIN_RE = /^\d{6}$/;
/** A phone's own key: 32 random bytes as base64url, made on the phone. */
export const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

/** `rand` gives numbers from 0 up to (not including) 1. */
export const makeCode = (rand: () => number, length = 8): string => Array.from({ length }, () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]).join("");
export const makeAdminCode = (rand: () => number): string => String(Math.floor(rand() * 1_000_000)).padStart(6, "0");
