/**
 * One person's MoneyLens on the server: everything their Durable Object does, as plain functions
 * on its database (ISO-1). The object itself (worker.ts) adapts the storage and nothing more, so
 * what is decided here is tested on Node's SQLite as chunks.ts and sessions.ts are.
 *
 * The database holds four things: whose it is and whether the owner signed in to it (one row),
 * the sessions (sessions.ts), the vault's sealed chunks (chunks.ts), and a log of security events
 * (SEC-17) with no contents: what happened, when, and in which session. A database nobody has
 * signed in to has no tables at all, and a request that reaches one writes none (`act` answers
 * that nobody is signed in): an address someone made up costs a read and leaves nothing behind.
 *
 * Two ways in.
 *
 * `signIn` is called once a handoff code has been traded for an account (ARCH-3; flows.ts is the
 * trading). It asks the gate (SEC-10), makes the tables the first time, and opens a session, all
 * in one transaction.
 *
 * `act` is every other request. It is one synchronous stretch: the session is checked and the
 * thing is done with nothing in between, so nothing done here was allowed by a session that had
 * ended by the time it was done (the review of #789, obligation 3). The caller hashes the
 * cookie's token first (`hashOf`) and reads the body first; neither is done here. The account
 * the request names is only compared with the one this database belongs to: it is an address,
 * and the token is what is checked (ISO-2).
 */
import { chunkTables, lastDay, pullChunks, pushChunks, startVault, vaultHeld, type Db } from "./chunks";
import { admits, type Config, type Gate } from "./gate";
import { isAccount } from "./request";
import { checkSession, endAllSessions, endSession, listSessions, openSession, sessionTables, type Session } from "./sessions";
import { packPulled, packPushed, unpackPush } from "./wire";

/** Sign-ins one account may make in an hour. Eight sessions are kept, so signing in over and over pushes other devices out. */
export const SIGN_INS_PER_HOUR = 12;
const HOUR = 3_600_000;
/** Events are kept twelve months (SEC-17), and never more than this many. */
const EVENTS_KEPT = 366 * 24 * HOUR;
const EVENTS_MOST = 500;
const EVENTS_SHOWN = 50;

export type EventKind = "sign-in" | "sign-out" | "session-ended" | "sessions-ended" | "vault-started" | "email-changed";
export type Event = { at: number; kind: EventKind; session: string | null };

const isTime = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/** Has anyone ever signed in to this database? Reads; never writes. */
export const isSetUp = (db: Db): boolean => db.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'account'`).toArray().length === 1;

function whose(db: Db): { id: string; owner: boolean } | null {
  const row = db.sql.exec(`SELECT id, owner FROM account WHERE one = 1`).toArray()[0];
  return row && typeof row.id === "string" ? { id: row.id, owner: row.owner === 1 } : null;
}

function note(db: Db, kind: EventKind, session: string | null, now: number): void {
  db.sql.exec(`INSERT INTO events (at, kind, session) VALUES (?, ?, ?)`, now, kind, session);
}

// ---------------------------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------------------------

export type SignIn = {
  /** The account the handoff code was traded for. */
  account: string;
  /** Made by the caller for this sign-in: the session's id and the hash of its token (sessions.ts). */
  session: string;
  hash: string;
  label: string;
  /** The accounts service said this is the owner's account. */
  owner: boolean;
};

/** Thrown inside `signIn`'s one transaction to undo what it had written, and caught there. */
const REFUSED = Symbol("refused");

/**
 * Opens a session for an account whose handoff code was just traded.
 *
 * "not-admitted": the gate does not let this account in; nothing is written. "too-many": more sign-ins in the last
 * hour than one account makes. "refused": this database belongs to another account, or the session could not be
 * opened (what was handed over is not an id, a hash and a label).
 *
 * All of it or none of it: the tables the first time, the session (and the oldest one it pushes out when there are
 * eight), and the line in the events log are one transaction. A sign-in that fails at any step, whether it is refused
 * or the database fails under it, leaves every session that was there, and no session nobody was given the token of
 * (the review of #814, finding 2).
 */
export function signIn(db: Db, made: SignIn, now: number, gate: Gate): "ok" | "not-admitted" | "too-many" | "refused" {
  if (!made || !isAccount(made.account) || typeof made.owner !== "boolean" || !isTime(now)) return "refused";
  if (!admits(gate, made.account, made.owner)) return "not-admitted";
  const first = !isSetUp(db);
  if (!first) {
    const held = whose(db);
    if (!held || held.id !== made.account) return "refused";
    const recent = Number(db.sql.exec(`SELECT COUNT(*) AS n FROM events WHERE kind = 'sign-in' AND at > ?`, now - HOUR).toArray()[0]?.n ?? 0);
    if (recent >= SIGN_INS_PER_HOUR) return "too-many";
  }
  try {
    db.atomically(() => {
      if (first) {
        db.sql.exec(`CREATE TABLE account (one INTEGER PRIMARY KEY CHECK (one = 1), id TEXT NOT NULL, owner INTEGER NOT NULL)`);
        db.sql.exec(`CREATE TABLE events (n INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, session TEXT)`);
        sessionTables(db);
        chunkTables(db);
        db.sql.exec(`INSERT INTO account (one, id, owner) VALUES (1, ?, ?)`, made.account, made.owner ? 1 : 0);
      }
      if (!openSession(db, { id: made.session, hash: made.hash, label: made.label }, now)) throw REFUSED;
      // (whether it is the owner's is what the accounts service says now, not what it said last time)
      db.sql.exec(`UPDATE account SET owner = ? WHERE one = 1`, made.owner ? 1 : 0);
      note(db, "sign-in", made.session, now);
      db.sql.exec(`DELETE FROM events WHERE at < ?`, now - EVENTS_KEPT);
      db.sql.exec(`DELETE FROM events WHERE n <= (SELECT n FROM events ORDER BY n DESC LIMIT 1 OFFSET ?)`, EVENTS_MOST);
    });
  } catch (error) {
    if (error === REFUSED) return "refused";
    throw error;
  }
  return "ok";
}

/** The account's email address changed, or its database was restored: everyone signs in again (ARCH-9). Nothing to do where nobody ever signed in. */
export function signEveryoneOut(db: Db, now: number): void {
  if (!isSetUp(db)) return;
  if (endAllSessions(db) > 0 && isTime(now)) note(db, "email-changed", null, now);
}

// ---------------------------------------------------------------------------------------------
// Every other request
// ---------------------------------------------------------------------------------------------

/** What a request asks, once the Worker has let it through: whose database it thinks this is, the hash of its token, and the body as it came. */
export type Asked = { account: string; hash: string; action: string; body: Uint8Array };
/** What is answered: a status with JSON, or with a frame (wire.ts). `signedOut`: the cookie is to be cleared. */
export type Answer = { status: number; json?: Record<string, unknown>; bytes?: Uint8Array; signedOut?: boolean };

export const ACTIONS: readonly string[] = ["session/end", "sessions", "sessions/end", "vault", "vault/start", "sync/pull", "sync/push", "events"];

const no = (status: number, why: string, signedOut = false): Answer => ({ status, json: { ok: false, why }, ...(signedOut ? { signedOut } : {}) });

/** A small body: one JSON object, or null. */
function said(body: Uint8Array): Record<string, unknown> | null {
  if (body.length === 0 || body.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The server's day (UTC), and never an earlier one than the last day this vault was written on: a clock set back does not hand out a second day's writes. */
function today(db: Db, now: number): string {
  const day = new Date(now).toISOString().slice(0, 10);
  const last = lastDay(db);
  return last > day ? last : day;
}

/**
 * The session a request comes with, if it is one of this database's and still on, and the gate still lets its account
 * in. Otherwise the answer to give. Used twice by the object for a request with a body: once before the body is read
 * (so that whoever has no session cannot make it hold megabytes), and again by `act`, which is the check that counts.
 */
export function sessionFor(db: Db, asked: Pick<Asked, "account" | "hash">, now: number, gate: Gate): Session | Answer {
  if (!isTime(now)) return no(500, "unavailable");
  if (gate.mode === "closed") return no(403, "closed");
  if (!isSetUp(db)) return no(401, "signed-out", true);
  const held = whose(db);
  if (!held || held.id !== asked.account) return no(401, "signed-out", true);
  if (!admits(gate, held.id, held.owner)) return no(403, "not-admitted", true);
  return checkSession(db, asked.hash, now) ?? no(401, "signed-out", true);
}

export function act(db: Db, asked: Asked, now: number, config: Config): Answer {
  const session = sessionFor(db, asked, now, config.gate);
  if ("status" in session) return session;
  switch (asked.action) {
    case "session/end":
      endSession(db, session.id);
      note(db, "sign-out", session.id, now);
      return { status: 200, json: { ok: true }, signedOut: true };
    case "sessions":
      return { status: 200, json: { ok: true, sessions: listSessions(db, now).map((one) => ({ ...one, here: one.id === session.id })) } };
    case "sessions/end": {
      const body = said(asked.body);
      if (body?.others === true) {
        const ended = endAllSessions(db, session.id);
        if (ended) note(db, "sessions-ended", session.id, now);
        return { status: 200, json: { ok: true, ended } };
      }
      if (!body || !endSession(db, body.id)) return no(404, "no-session");
      note(db, "session-ended", session.id, now);
      return { status: 200, json: { ok: true, ended: 1 }, ...(body.id === session.id ? { signedOut: true } : {}) };
    }
    case "vault":
      return { status: 200, json: { ok: true, vault: vaultHeld(db), limits: { vaultBytes: config.limits.vaultBytes, writesPerDay: config.limits.writesPerDay } } };
    case "vault/start": {
      const body = said(asked.body);
      if (!body || typeof body.vault !== "string") return no(400, "bad-request");
      const before = vaultHeld(db);
      // (the same vault again is the same answer; another one is a reset, which is not done here: VAULT-5, VAULT-7)
      if (!startVault(db, body.vault)) return before === null ? no(400, "bad-request") : no(409, "another-vault");
      if (before === null) note(db, "vault-started", session.id, now);
      return { status: 200, json: { ok: true, vault: body.vault } };
    }
    case "sync/pull": {
      const body = said(asked.body);
      if (!body) return no(400, "bad-request");
      return { status: 200, bytes: packPulled(pullChunks(db, body.vault as string, body.since as number, config.limits)) };
    }
    case "sync/push": {
      const push = unpackPush(asked.body);
      if (!push) return no(400, "bad-request");
      return { status: 200, bytes: packPushed(pushChunks(db, push.vault, push.writes, config.limits, today(db, now))) };
    }
    case "events":
      return {
        status: 200,
        json: {
          ok: true,
          events: db.sql
            .exec(`SELECT at, kind, session FROM events ORDER BY n DESC LIMIT ?`, EVENTS_SHOWN)
            .toArray()
            .map((row) => ({ at: Number(row.at), kind: String(row.kind), here: row.session === session.id })),
        },
      };
    default:
      return no(404, "no-such-thing");
  }
}
