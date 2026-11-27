/**
 * 心里有数 · MoneyLens lives on its own domain, money.changle.ca (its code is tools/moneylens). The
 * main site's session never goes there (docs/moneylens.md, ARCH-3). What goes instead is a code,
 * good once and for a minute, that the accounts service makes for whoever is signed in here
 * (worker/handoffCodes.ts) and that only MoneyLens's own server can trade (worker/handoff.ts).
 *
 * This file is the plain part of the page that fetches that code (Finance.tsx): which address may
 * be left for, and what to say when no code came. It is kept apart so that it can be tested
 * without a page (tests/finance.test.ts).
 *
 * The whole round, for whoever reads this next:
 *   1. money.changle.ca/enter puts a nonce in a cookie only that domain can set, and sends the
 *      browser to changle.ca/tools/finance?handoff=<nonce>.
 *   2. This page asks the accounts service for a code bound to that nonce (signing in first when
 *      nobody is), and sends the browser to money.changle.ca/#h=<code>.
 *   3. MoneyLens trades the code, and the trade stands only when the nonce it was bound to is
 *      the one in that browser's cookie.
 * So a link made by someone else brings a code that is of no use to them (it never leaves this
 * browser) and of no use here (its nonce is not this browser's). That is why the page goes on by
 * itself and asks for no extra press.
 */

/** Where a code is taken. Written out here and never read from the address, so that a code can be taken nowhere else. */
export const MONEY = "https://money.changle.ca";

/** What the accounts service makes codes for (worker/handoffCodes.ts, `AUDIENCES`). */
export const AUDIENCE = "moneylens";

/** A nonce as MoneyLens makes one (and as the accounts service takes one): the shape, and nothing longer. */
export const isNonce = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(s);

/**
 * The address the browser leaves for with its code, or null when what came back is not a code. The
 * code rides in the fragment, which is sent to no server and kept in no log; MoneyLens's page
 * takes it out of the address before it does anything else.
 */
export function wayIn(code: unknown): string | null {
  return typeof code === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(code) ? `${MONEY}/#h=${code}` : null;
}

/**
 * Why no code came, as what the page should say:
 * - "sign-in": nobody is signed in here (or the session has ended): sign in, and it goes on.
 * - "slow-down": too many codes asked for by this account (five a minute, a hundred a day).
 * - "bad-link": the nonce was not taken. The way in starts over at MoneyLens.
 * - "offline": nothing came back.
 * - "failed": anything else (the site paused, the account stopped, a server error).
 */
export type Trouble = "sign-in" | "slow-down" | "bad-link" | "offline" | "failed";

/** `status` and `code` are the accounts service's answer (lib/api.ts, `ApiError`); null when there was no answer at all. */
export function troubleOf(status: number | null, code = ""): Trouble {
  if (status === null) return "offline";
  if (status === 401) return "sign-in";
  if (status === 429) return "slow-down";
  if (status === 400 && (code === "nonce" || code === "aud")) return "bad-link";
  return "failed";
}
