/**
 * MoneyLens sessions (ARCH-4, ARCH-8, T-3): who is signed in to one person's MoneyLens, kept in
 * that person's own database (ISO-1), beside their vault's chunks (chunks.ts).
 *
 * A session is made once a handoff code from the main site has been traded for an account
 * (ARCH-3; that is not in this file). The browser then holds a cookie with two things in it
 * (request.ts): the account's id, which only says whose database to ask, and a token of 256
 * random bits, which is what is checked. The id is an address, never a permission (ISO-2):
 * whoever sends another person's id reaches that person's database and is asked for a token
 * they do not have.
 *
 * What is kept for a session: a random id (for the list its owner sees, and for signing one
 * device out from another), the SHA-256 of its token, when it was made, when it was last seen,
 * and a short label for the list. Never the token: a copy of this database signs nobody in.
 *
 * A session ends 30 minutes after it was last seen, and 12 hours after it was made whatever its
 * use (ARCH-4). The server can end one, or all of them, at any time. A session that has ended
 * is taken out when that is noticed, so it cannot come back if the clock does. And if the clock
 * goes back by more than a minute, the sessions seen since then end (`on`).
 *
 * Plain synchronous functions on a `Db`, like chunks.ts, and for the same reasons. Hashing a
 * token is the one thing that cannot be synchronous, so the caller does it first (`hashOf`) and
 * hands the hash over: between a function's first read and its last write nothing else runs.
 *
 * What it costs (LIM-1). "Last seen" is written at most once a minute, not on every request,
 * so a quiet session ends between 29 and 30 minutes after its last request. A check that finds
 * nothing writes nothing. An account has at most eight sessions, so every call reads at most
 * eight short rows.
 */
import { base64url, isId } from "../core/ids";
import type { Db } from "./chunks";

/** A session ends this long after it was last seen. */
export const IDLE = 30 * 60_000;
/** A session ends this long after it was made, whatever its use. */
export const LIFETIME = 12 * 60 * 60_000;
/** "Last seen" is written again only when it is this old. */
export const TOUCH = 60_000;
/** The sessions one account can have at once. */
export const MOST = 8;
/** How long a label may be. */
const LABEL = 60;

/** A token, and the hash of one: 256 bits as 43 URL-safe characters. */
const isToken = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{43}$/.test(x);
const isTime = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
/** A label is one short line of ordinary characters. It is shown to the session's owner, as text. */
function isLabel(x: unknown): x is string {
  if (typeof x !== "string" || x.length > LABEL) return false;
  for (let i = 0; i < x.length; i++) {
    const code = x.charCodeAt(i);
    // no control characters, and nothing that starts a new line
    if (code < 32 || (code >= 127 && code < 160) || code === 0x2028 || code === 0x2029) return false;
  }
  return true;
}

/** A session as its owner may see it. The hash of its token is not part of it. */
export type Session = { id: string; made: number; seen: number; label: string };
type Row = Session & { hash: string };

export function sessionTables(db: Db): void {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, hash TEXT NOT NULL, made INTEGER NOT NULL, seen INTEGER NOT NULL, label TEXT NOT NULL)`);
}

/** A new token: 256 random bits. It goes into the cookie and is kept nowhere else. */
export const newToken = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** What is kept of a token: the SHA-256 of its 43 characters. Null for anything that is not a token. */
export async function hashOf(token: unknown): Promise<string | null> {
  if (!isToken(token)) return null;
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

function rows(db: Db): Row[] {
  return db.sql
    .exec(`SELECT id, hash, made, seen, label FROM sessions`)
    .toArray()
    .map((row) => ({ id: String(row.id), hash: String(row.hash), made: Number(row.made), seen: Number(row.seen), label: String(row.label) }));
}

/**
 * Is a session still on at `now`? The clock is the server's, and it is the only one there is. A session that was last
 * seen more than a minute after what the clock reads now was seen under a clock that has since gone back: how long
 * ago that really was cannot be told, so the session has ended, and its owner signs in again. Within that minute
 * (two machines never agree to the millisecond) it is on, and its times are left as they are.
 */
function on(session: Session, now: number): boolean {
  if (session.seen - now > TOUCH) return false;
  return now - session.seen < IDLE && now - session.made < LIFETIME;
}

/** Two hashes, compared without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) differ |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differ === 0;
}

const shown = ({ id, made, seen, label }: Row): Session => ({ id, made, seen, label });

/**
 * Signs a device in: a session for the token whose hash this is. The caller made the token (`newToken`) and puts it
 * in the cookie. False, and nothing is written, when what was given is not an id, a hash, a label and a time, or when
 * the id or the hash is already there.
 *
 * Sessions that have ended are taken out first. If the account would then have more than `MOST`, the ones seen
 * longest ago are ended to make room.
 */
export function openSession(db: Db, made: { id: string; hash: string; label: string }, now: number): boolean {
  if (!made || !isId(made.id) || !isToken(made.hash) || !isLabel(made.label) || !isTime(now)) return false;
  const all = rows(db);
  if (all.some((row) => row.id === made.id || same(row.hash, made.hash))) return false;
  const still = all.filter((row) => on(row, now)).sort((a, b) => a.seen - b.seen || a.made - b.made || (a.id < b.id ? -1 : 1));
  const keep = new Set(still.slice(Math.max(0, still.length + 1 - MOST)).map((row) => row.id));
  db.atomically(() => {
    for (const row of all) if (!keep.has(row.id)) db.sql.exec(`DELETE FROM sessions WHERE id = ?`, row.id);
    db.sql.exec(`INSERT INTO sessions (id, hash, made, seen, label) VALUES (?, ?, ?, ?, ?)`, made.id, made.hash, now, now, made.label);
  });
  return true;
}

/**
 * Is this the token of a session that is still on? `hash` is the SHA-256 of what the cookie held (`hashOf`).
 *
 * Yes: the session, its "last seen" brought up to now if that was written a minute ago or more. No: null. A session
 * found to have ended is taken out.
 */
export function checkSession(db: Db, hash: unknown, now: number): Session | null {
  if (!isToken(hash) || !isTime(now)) return null;
  let found: Row | undefined;
  // every session is compared, whichever one it is
  for (const row of rows(db)) if (same(row.hash, hash)) found = row;
  if (!found) return null;
  if (!on(found, now)) {
    db.sql.exec(`DELETE FROM sessions WHERE id = ?`, found.id);
    return null;
  }
  if (now - found.seen >= TOUCH) {
    db.sql.exec(`UPDATE sessions SET seen = ? WHERE id = ?`, now, found.id);
    found.seen = now;
  }
  return shown(found);
}

/** The account's sessions that are on, the one seen last first. Those that have ended are taken out. */
export function listSessions(db: Db, now: number): Session[] {
  if (!isTime(now)) return [];
  const all = rows(db);
  const ended = all.filter((row) => !on(row, now));
  if (ended.length) {
    db.atomically(() => {
      for (const row of ended) db.sql.exec(`DELETE FROM sessions WHERE id = ?`, row.id);
    });
  }
  return all
    .filter((row) => on(row, now))
    .sort((a, b) => b.seen - a.seen || b.made - a.made || (a.id < b.id ? -1 : 1))
    .map(shown);
}

/** Ends one session, by its id (signing out, or signing another device out). False when there is no such session. */
export function endSession(db: Db, id: unknown): boolean {
  if (!isId(id) || !rows(db).some((row) => row.id === id)) return false;
  db.sql.exec(`DELETE FROM sessions WHERE id = ?`, id);
  return true;
}

/**
 * Ends every session of the account, or every one but `except` (signing out everywhere else). How many were ended.
 * Also what happens when the account's email address changed (ARCH-9): everyone signs in again.
 */
export function endAllSessions(db: Db, except?: string): number {
  const going = rows(db).filter((row) => row.id !== except);
  if (going.length) {
    db.atomically(() => {
      for (const row of going) db.sql.exec(`DELETE FROM sessions WHERE id = ?`, row.id);
    });
  }
  return going.length;
}
