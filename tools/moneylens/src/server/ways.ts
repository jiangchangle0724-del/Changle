/**
 * The ways into a vault, as the server keeps them (VAULT-1: "wrapped keys"; VAULT-7; threat 1).
 *
 * A way in is a wrapper (the vault key under a passphrase, or under the recovery code:
 * vault/crypto.ts) with what guards it: the public parameters of a proof (vault/proof.ts) and the
 * hash of the proof itself. The server understands none of it. It keeps the wrapper as the text
 * it was given, and gives it back to a session that shows the proof, and to no other: whoever
 * can sign in to the account (which takes the mailbox and nothing else) gets the parameters, and
 * has to put every guess at the passphrase to this code.
 *
 * Guesses are counted for the account, not for the session or the way in: ten wrong in an hour,
 * thirty in a day, and then every proof is turned away unlooked at, the right one too, until
 * time has passed. Counting only what was wrong and answering what was right would be counting
 * nothing. So someone who holds the mailbox can keep the owner out for as long as they keep at
 * it, by guessing wrong on purpose thirty times a day. They could already do worse with the
 * mailbox (start the vault's erasing, sign the owner out); what they cannot do is read. Each
 * wrong proof is a line in the events log (SEC-17), and the newest of them are shown to the
 * owner whatever lines came after (account.ts, "events").
 *
 * A session that has shown a proof is "unlocked", until it ends or says it has locked. Sync is
 * for unlocked sessions only (account.ts): a session that has not unlocked reads nothing, not
 * even ciphertext.
 *
 * "Unlocked" is what a session says of itself now, and it is a browser's word: any page of the
 * browser can say it has locked while another still holds the key, and one that means harm can
 * say so and keep it. What the server knows is that a session has opened the vault since it
 * signed in ("opened"), and that is what its owner is shown of each device (the review of the
 * devices' screen, finding 1). It is kept when the session locks, and goes when it ends. Nothing
 * a session may do goes by it.
 *
 * Plain synchronous functions on a `Db`, like chunks.ts. The proof arrives here already hashed
 * (`hashOf`, sessions.ts): hashing waits, and nothing here does.
 */
import { isId } from "../core/ids";
import type { Db } from "./chunks";

/** Wrong proofs an account may show in an hour, and in a day. */
export const TRIES_PER_HOUR = 10;
export const TRIES_PER_DAY = 30;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A wrapper, and a proof's parameters, as text. */
export const WRAPPER_MOST = 1024;
export const PARAMS_MOST = 256;
/** The kinds of way in a vault is started with: one of each, no more and no fewer. */
export const KINDS = ["passphrase", "recovery"] as const;
export type Kind = (typeof KINDS)[number];

const isTime = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const isHash = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{43}$/.test(x);
const isKind = (x: unknown): x is Kind => typeof x === "string" && (KINDS as readonly string[]).includes(x);
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

export function wayTables(db: Db): void {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS ways (id TEXT PRIMARY KEY, kind TEXT NOT NULL, wrapper TEXT NOT NULL, params TEXT NOT NULL, verifier TEXT NOT NULL, made INTEGER NOT NULL)`);
  db.sql.exec(`CREATE TABLE IF NOT EXISTS tries (n INTEGER PRIMARY KEY, at INTEGER NOT NULL)`);
  db.sql.exec(`CREATE TABLE IF NOT EXISTS unlocked (session TEXT PRIMARY KEY, at INTEGER NOT NULL)`);
}

/**
 * Which sessions have opened the vault since they signed in, and when first. This table is newer than the databases
 * that were made before it (the others are made at an account's first sign-in, above), so it is made in one way for
 * every database, old or new: whatever reads or writes it makes sure of it first. That is an unlocking, the list of
 * devices and a tidying, none of which is often.
 */
function openedTable(db: Db): void {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS opened (session TEXT PRIMARY KEY, at INTEGER NOT NULL)`);
}
/** This session has opened the vault: noted once, the first time. */
function noteOpened(db: Db, session: string, now: number): void {
  openedTable(db);
  db.sql.exec(`INSERT INTO opened (session, at) VALUES (?, ?) ON CONFLICT (session) DO NOTHING`, session, now);
}

/** Two hashes, compared without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) differ |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differ === 0;
}

/** A way in as a device hands it over: the wrapper and the proof's parameters as it made them, and the hash of the proof. */
export type NewWay = { wrapper: unknown; params: unknown; verifier: unknown };

/** What the server checks of a way in, which is only what it goes by: whose it is, of which kind, and that it is not long. */
function fits(vault: string, way: NewWay): { id: string; kind: Kind; wrapper: string; params: string; verifier: string } | null {
  if (!way || !isRecord(way.wrapper) || !isRecord(way.params) || !isHash(way.verifier)) return null;
  const { id, kind } = way.wrapper;
  if (!isId(id) || !isKind(kind) || way.wrapper.vault !== vault || way.params.kind !== kind) return null;
  const [wrapper, params] = [JSON.stringify(way.wrapper), JSON.stringify(way.params)];
  return wrapper.length <= WRAPPER_MOST && params.length <= PARAMS_MOST ? { id, kind, wrapper, params, verifier: way.verifier } : null;
}

/**
 * Keeps the ways in a new vault comes with: one by passphrase and one by recovery code, each for this vault. False,
 * and nothing kept, for anything else. For the caller that has just started the vault, in the same transaction: a
 * vault that already has ways in keeps them, whoever asks.
 */
export function startWays(db: Db, vault: string, ways: unknown, now: number): boolean {
  if (!isId(vault) || !Array.isArray(ways) || !isTime(now)) return false;
  if (Number(db.sql.exec(`SELECT COUNT(*) AS n FROM ways`).toArray()[0]?.n ?? 0) !== 0) return false;
  const fit = ways.map((way) => fits(vault, way as NewWay));
  if (fit.some((way) => way === null)) return false;
  const all = fit as NonNullable<(typeof fit)[number]>[];
  if (KINDS.some((kind) => all.filter((way) => way.kind === kind).length !== 1) || new Set(all.map((way) => way.id)).size !== all.length) return false;
  for (const way of all) db.sql.exec(`INSERT INTO ways (id, kind, wrapper, params, verifier, made) VALUES (?, ?, ?, ?, ?, ?)`, way.id, way.kind, way.wrapper, way.params, way.verifier, now);
  return true;
}

/** The ways in there are, as any signed-in session may see them: which, of what kind, since when. Nothing to open anything with. */
export function listWays(db: Db): { id: string; kind: string; made: number }[] {
  return db.sql
    .exec(`SELECT id, kind, made FROM ways ORDER BY made, kind, id`)
    .toArray()
    .map((row) => ({ id: String(row.id), kind: String(row.kind), made: Number(row.made) }));
}

/** The parameters of one way in's proof, by its id or, for the two kinds a vault has one of, by its kind. Null when there is none. */
export function paramsOf(db: Db, ask: { id?: unknown; kind?: unknown }): { id: string; kind: string; params: unknown } | null {
  const row = isId(ask?.id)
    ? db.sql.exec(`SELECT id, kind, params FROM ways WHERE id = ?`, ask.id).toArray()[0]
    : isKind(ask?.kind)
      ? db.sql.exec(`SELECT id, kind, params FROM ways WHERE kind = ? ORDER BY made, id LIMIT 1`, ask.kind).toArray()[0]
      : undefined;
  if (!row || typeof row.params !== "string") return null;
  return { id: String(row.id), kind: String(row.kind), params: JSON.parse(row.params) as unknown };
}

export type Unlock = { ok: true; wrapper: unknown } | { ok: false; why: "no-way" | "wrong-secret"; left?: number } | { ok: false; why: "too-many"; again: number };

/**
 * A session shows a proof for one way in. `verifier` is the hash of what it showed.
 *
 * Right: the session is unlocked, and the wrapper is the answer. Wrong: counted, with how many more may be wrong
 * this hour and today (`left`). Past the count: turned away unlooked at, with how long until one more may be shown
 * (`again`, milliseconds). A way in that is not there is not a guess, and is not counted.
 */
export function tryUnlock(db: Db, id: unknown, verifier: unknown, session: string, now: number): Unlock {
  if (!isTime(now) || !isId(session)) throw new Error("unlock");
  const way = isId(id) ? db.sql.exec(`SELECT wrapper, verifier FROM ways WHERE id = ?`, id).toArray()[0] : undefined;
  if (!way || typeof way.wrapper !== "string" || !isHash(way.verifier)) return { ok: false, why: "no-way" };
  // (a try made under a clock that has since gone back counts for as long as it reads as later than now, and a day more)
  db.sql.exec(`DELETE FROM tries WHERE at <= ?`, now - DAY);
  const tries = db.sql
    .exec(`SELECT at FROM tries ORDER BY at DESC, n DESC`)
    .toArray()
    .map((row) => Number(row.at));
  const hour = tries.filter((at) => at > now - HOUR);
  if (hour.length >= TRIES_PER_HOUR || tries.length >= TRIES_PER_DAY) {
    const waits = [hour.length >= TRIES_PER_HOUR ? hour[TRIES_PER_HOUR - 1]! + HOUR - now : 0, tries.length >= TRIES_PER_DAY ? tries[TRIES_PER_DAY - 1]! + DAY - now : 0];
    return { ok: false, why: "too-many", again: Math.max(1, ...waits) };
  }
  if (!isHash(verifier) || !same(way.verifier, verifier)) {
    db.sql.exec(`INSERT INTO tries (at) VALUES (?)`, now);
    return { ok: false, why: "wrong-secret", left: Math.min(TRIES_PER_HOUR - hour.length, TRIES_PER_DAY - tries.length) - 1 };
  }
  db.sql.exec(`INSERT INTO unlocked (session, at) VALUES (?, ?) ON CONFLICT (session) DO UPDATE SET at = excluded.at`, session, now);
  noteOpened(db, session, now);
  return { ok: true, wrapper: JSON.parse(way.wrapper) as unknown };
}

/** Has this session shown a proof, and not locked since? */
export const isUnlocked = (db: Db, session: string): boolean => db.sql.exec(`SELECT 1 AS there FROM unlocked WHERE session = ?`, session).toArray().length === 1;

/** The sessions that have, for the list of devices their owner sees. A session in it that has since ended is not in that list (sessions.ts). */
export const unlockedSessions = (db: Db): Set<string> => new Set(db.sql.exec(`SELECT session FROM unlocked`).toArray().map((row) => String(row.session)));

/**
 * The sessions that have opened the vault since they signed in, whether or not they say they have locked since. One
 * that is unlocked has opened it, noted or not (a session that unlocked before this table was there).
 */
export function openedSessions(db: Db): Set<string> {
  openedTable(db);
  return new Set(db.sql.exec(`SELECT session FROM opened UNION SELECT session FROM unlocked`).toArray().map((row) => String(row.session)));
}

/** The session that made the vault holds its key: it is unlocked without showing a proof. For `vault/start` alone. */
export function unlockMaker(db: Db, session: string, now: number): void {
  if (!isId(session) || !isTime(now)) throw new Error("unlock");
  db.sql.exec(`INSERT INTO unlocked (session, at) VALUES (?, ?) ON CONFLICT (session) DO UPDATE SET at = excluded.at`, session, now);
  noteOpened(db, session, now);
}

/** The session has locked its vault, or has ended. That it opened the vault stays noted while it is a session. */
export function lock(db: Db, session: unknown): void {
  if (typeof session === "string") db.sql.exec(`DELETE FROM unlocked WHERE session = ?`, session);
}

/**
 * Lets go of the ways in and of everything that went with them: the wrong tries counted against them, and which
 * sessions hold the vault open and which have opened it. The vault is erased (erase.ts).
 */
export function forgetWays(db: Db): void {
  db.sql.exec(`DELETE FROM ways`);
  db.sql.exec(`DELETE FROM tries`);
  db.sql.exec(`DELETE FROM unlocked`);
  openedTable(db);
  db.sql.exec(`DELETE FROM opened`);
}

/** Forgets the unlocking, and the having opened, of sessions that are no longer there. */
export function tidyUnlocked(db: Db): void {
  db.sql.exec(`DELETE FROM unlocked WHERE session NOT IN (SELECT id FROM sessions)`);
  openedTable(db);
  db.sql.exec(`DELETE FROM opened WHERE session NOT IN (SELECT id FROM sessions)`);
}
