/**
 * The three things that are done across more than one object, and the order each is done in:
 * trading a handoff code for a session, and the accounts service's two notices (an account is
 * gone; an account's email address changed). Plain functions over `Doors` and `Inside`, which
 * worker.ts fills with the real objects and the tests fill with ones they can stop between any
 * two steps (tests/flows.test.ts tries every order the steps can come in).
 *
 * Why the order is a rule and not a habit (the review of #814, finding 1). A sign-in touches the
 * accounts service, the registry and the account's own object, one after another, and a notice
 * touches the registry and the object. Nothing holds the three still, so a notice can run from
 * beginning to end between two steps of a sign-in. A session opened after "everyone signs in
 * again" had finished, for a code traded before the address changed, would be a session that
 * notice was meant to end; a session opened after an account's database was emptied would be
 * data of an account that no longer exists.
 *
 * Two things put them in order.
 *
 * The registry's stamp (registry.ts). A notice sets a new stamp first, and only then does its
 * work. A sign-in reads the stamp before it trades its code (`tradeCode`), and the account's own
 * object reads it again just before it opens the session (`signInHere`), and opens none if the
 * two differ.
 *
 * And the object's own count of the notices that have done their work on it since it was loaded
 * (`noticed`, kept in memory). The object takes the count, reads the stamp, and opens the
 * session only if the count is still what it was. From the count's second reading to the
 * session's being written nothing waits.
 *
 * For a notice about the account being signed in to, one of three things is then true:
 *
 * 1. Its stamp was set before the sign-in's first read, so the accounts service had done its own
 *    part before the code was traded: it tells the apps only afterwards. In that part it drops
 *    the waiting codes of an account it deletes, and of an account whose other devices it signs
 *    out because the address changed (site/worker/hub.ts, `endSessions`, and handoffCodes.ts,
 *    `forgetHandoffs`). A deleted account's code therefore no longer trades. After a change of
 *    address, a code can still trade when it was asked for after the change, or when the
 *    account had no other device signed in at that moment (with no session to end, the
 *    accounts service drops no code). The second is, nearly always, the one device the change
 *    left signed in: a sign-in the notice was never meant to stop. The exception is a code
 *    asked for by a session that ran out in the minute before the change: it still trades, and
 *    opens a session the change should have ended. That is the accounts service's to close (the
 *    review of #814, finding 2; asked of its owner in docs/briefs/moneylens.md).
 * 2. Its stamp was set after that, and before the object's read. The stamps differ, and no
 *    session is opened.
 * 3. Its stamp was set after the object's read. Its work on the object comes later still, so
 *    either it comes while the object waits for the answer to its read, and the count has moved:
 *    no session is opened. Or it comes after the session was written, and ends it.
 *
 * A sign-in that is turned away like this has written nothing: there is nothing to undo, and so
 * no undoing that could fail half way. The person is asked to try again.
 *
 * The stamp is one for everybody, because a sign-in does not know whose it is until the code is
 * traded. So a notice about one account turns away the sign-ins of others that were under way at
 * that moment, and they try again.
 */
import type { SignIn } from "./account";
import { admits, type Gate } from "./gate";
import { isAccount, isNonce } from "./request";

/** What an object's `signIn` answers: account.ts's own answers, and "try-again" (see above). */
export type Entered = "ok" | "not-admitted" | "too-many" | "refused" | "try-again";

/** The other objects, as the Worker reaches them. Every call can fail by throwing. */
export type Doors = {
  /** The registry's stamp as it stands. */
  stampNow(): Promise<string>;
  /** Sets a new stamp, unlike any before it. */
  newStamp(): Promise<void>;
  /** Notes an account in the registry: true when it is noted. */
  note(account: string): Promise<boolean>;
  /** Takes an account off the registry. */
  forget(account: string): Promise<void>;
  /** The accounts service: the account a handoff code is for and the nonce it was asked with, or null. */
  redeem(code: string): Promise<{ id: string; master: boolean; nonce: string } | null>;
  /** The accounts service: is this account still there? It throws when it cannot say. */
  exists(account: string): Promise<boolean>;
  /** The account's own object: `signInHere` with the stamp this sign-in started under; ending every session; emptying it. */
  signIn(made: SignIn, stamp: string): Promise<Entered>;
  signEveryoneOut(account: string): Promise<void>;
  erase(account: string): Promise<void>;
};

/** An account's own object, as `signInHere` sees it from the inside. */
export type Inside = {
  /** How many times a notice has done its work on this object since it was loaded. Kept in memory, and read without waiting. */
  noticed(): number;
  /** The registry's stamp as it stands. */
  stampNow(): Promise<string>;
  /** account.ts, `signIn`, on this object's database: one transaction, without waiting. */
  open(): "ok" | "not-admitted" | "too-many" | "refused";
};

/** Are these two the same text? Every character is compared, wherever the first difference is. */
export function same(a: string, b: string): boolean {
  let differ = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) differ |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return differ === 0;
}

/** What the browser brought, and what the Worker made for this sign-in. */
export type Offer = {
  /** The handoff code, already known to look like one. */
  code: string;
  /** The nonce in this browser's cookie, set at /enter. */
  nonce: string;
  gate: Gate;
  /** Made by the Worker for this sign-in: the session's id, and the hash of a token nobody has been given yet. */
  session: string;
  hash: string;
  label: string;
};

export type Traded = { ok: true; account: string } | { ok: false; status: number; why: string };

const no = (status: number, why: string): Traded => ({ ok: false, status, why });

/**
 * In the Worker: trades a handoff code for a session (ARCH-3, T-3). "ok" means the session is open and its token may
 * be given to the browser. Anything else means this sign-in opened no session, and the token is to be thrown away.
 */
export async function tradeCode(doors: Doors, offer: Offer): Promise<Traded> {
  const stamp = await doors.stampNow();
  const account = await doors.redeem(offer.code);
  // one answer for a code that is wrong, used, out of time or bound to another browser's nonce
  if (!account || !isAccount(account.id) || typeof account.master !== "boolean" || !isNonce(account.nonce) || !same(account.nonce, offer.nonce)) return no(401, "code");
  if (!admits(offer.gate, account.id, account.master)) return no(403, "not-admitted");
  // noted before its database is touched: there is never a database the registry does not know of
  if (!(await doors.note(account.id))) return no(500, "unavailable");
  const said = await doors.signIn({ account: account.id, session: offer.session, hash: offer.hash, label: offer.label, owner: account.master }, stamp);
  if (said === "ok") return { ok: true, account: account.id };
  if (said === "too-many") return no(429, "too-many");
  if (said === "not-admitted") return no(403, "not-admitted");
  if (said !== "try-again") return no(500, "unavailable");
  // A notice came while this sign-in was under way, and nothing was opened. If the notice was that this account is
  // gone, the registry may have been told to forget it before this sign-in noted it: then it is taken off again,
  // its database emptied first, as the notice does. Not being able to is no failure of the sign-in: the weekly sweep
  // goes by the registry and finds it.
  try {
    if (!(await doors.exists(account.id))) {
      await doors.erase(account.id);
      await doors.forget(account.id);
    }
  } catch {
    // (left for the sweep)
  }
  return no(503, "try-again");
}

/**
 * In the account's own object: opens the session, unless a notice came since this sign-in began. `stamp` is what the
 * Worker read before it traded the code. Between the count's second reading and the session's being written there
 * is no waiting, and that is what the rule rests on: nothing may be put there that waits.
 */
export async function signInHere(inside: Inside, stamp: unknown): Promise<Entered> {
  const before = inside.noticed();
  const now = await inside.stampNow();
  if (inside.noticed() !== before || typeof stamp !== "string" || typeof now !== "string" || !same(now, stamp)) return "try-again";
  return inside.open();
}

/** The changle.ca account was deleted: everything MoneyLens holds of it goes (ARCH-10). Doing it twice is doing it once. */
export async function accountGone(doors: Doors, account: string): Promise<void> {
  await doors.newStamp();
  await doors.erase(account);
  await doors.forget(account);
}

/** The account's email address changed: everyone signs in again (ARCH-9). Doing it twice is doing it once. */
export async function accountChanged(doors: Doors, account: string): Promise<void> {
  await doors.newStamp();
  await doors.signEveryoneOut(account);
}
