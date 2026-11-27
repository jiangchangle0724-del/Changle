/**
 * One person's MoneyLens on the server: everything their Durable Object does, as plain functions
 * on its database (ISO-1). The object itself (worker.ts) adapts the storage and nothing more, so
 * what is decided here is tested on Node's SQLite as chunks.ts and sessions.ts are.
 *
 * The database holds five things: whose it is and whether the owner signed in to it (one row),
 * the sessions (sessions.ts), the vault's sealed chunks (chunks.ts), the ways into the vault
 * (ways.ts: the wrapped keys, and what a session has to show to be given one), and a log of
 * security events (SEC-17) with no contents: what happened, when, and in which session. A database nobody has
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
 * cookie's token first (`hashOf`), reads the body first, and hashes the proofs the body carries
 * (`proofsIn`); none of that is done in `act`, because all of it waits. The account
 * the request names is only compared with the one this database belongs to: it is an address,
 * and the token is what is checked (ISO-2).
 */
import { chunkTables, lastDay, pullChunks, pushChunks, startVault, vaultHeld, type Db } from "./chunks";
import { admits, type Config, type Gate } from "./gate";
import { isAccount } from "./request";
import { checkSession, endAllSessions, endSession, hashOf, listSessions, openSession, sessionTables, type Session } from "./sessions";
import { isUnlocked, listWays, lock, paramsOf, startWays, tidyUnlocked, tryUnlock, unlockMaker, wayTables } from "./ways";
import { packPulled, packPushed, unpackPush } from "./wire";

/** Sign-ins one account may make in an hour. Eight sessions are kept, so signing in over and over pushes other devices out. */
export const SIGN_INS_PER_HOUR = 12;
const HOUR = 3_600_000;
/**
 * Events are kept twelve months (SEC-17), and never more than this many of each of two sorts: wrong proofs, and
 * everything else. The two are counted apart, so that no number of sign-ins, sign-outs or unlockings pushes a wrong
 * proof out of what is kept (the review of the door, finding 2). What is shown is the newest lines of both together:
 * a screen that shows the wrong proofs whatever came after them is the events screen's to add.
 */
const EVENTS_KEPT = 366 * 24 * HOUR;
const EVENTS_MOST = 500;
const EVENTS_SHOWN = 50;

export type EventKind = "sign-in" | "sign-out" | "session-ended" | "sessions-ended" | "vault-started" | "email-changed" | "unlocked" | "unlock-failed";
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

/**
 * Lets go of the lines that are too old, and of those past the most that are kept. Done wherever lines are written
 * that nothing else counts: at each sign-in, and at each proof shown (a right proof can be shown any number of times).
 */
function tidyEvents(db: Db, now: number): void {
  db.sql.exec(`DELETE FROM events WHERE at < ?`, now - EVENTS_KEPT);
  db.sql.exec(`DELETE FROM events WHERE kind = 'unlock-failed' AND n <= (SELECT n FROM events WHERE kind = 'unlock-failed' ORDER BY n DESC LIMIT 1 OFFSET ?)`, EVENTS_MOST);
  db.sql.exec(`DELETE FROM events WHERE kind != 'unlock-failed' AND n <= (SELECT n FROM events WHERE kind != 'unlock-failed' ORDER BY n DESC LIMIT 1 OFFSET ?)`, EVENTS_MOST);
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
        wayTables(db);
        db.sql.exec(`INSERT INTO account (one, id, owner) VALUES (1, ?, ?)`, made.account, made.owner ? 1 : 0);
      }
      if (!openSession(db, { id: made.session, hash: made.hash, label: made.label }, now)) throw REFUSED;
      // (whether it is the owner's is what the accounts service says now, not what it said last time)
      db.sql.exec(`UPDATE account SET owner = ? WHERE one = 1`, made.owner ? 1 : 0);
      note(db, "sign-in", made.session, now);
      tidyEvents(db, now);
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
  db.atomically(() => {
    if (endAllSessions(db) > 0 && isTime(now)) note(db, "email-changed", null, now);
    tidyUnlocked(db);
  });
}

// ---------------------------------------------------------------------------------------------
// Every other request
// ---------------------------------------------------------------------------------------------

/**
 * What a request asks, once the Worker has let it through: whose database it thinks this is, the hash of its token,
 * the body as it came, and the hashes of the proofs in that body, in the body's order (`proofsIn`).
 */
export type Asked = { account: string; hash: string; action: string; body: Uint8Array; proofs?: readonly string[] };
/** What is answered: a status with JSON, or with a frame (wire.ts). `signedOut`: the cookie is to be cleared. */
export type Answer = { status: number; json?: Record<string, unknown>; bytes?: Uint8Array; signedOut?: boolean };

export const ACTIONS: readonly string[] = ["session/end", "sessions", "sessions/end", "vault", "vault/start", "vault/way", "vault/unlock", "vault/lock", "sync/pull", "sync/push", "events"];

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

/**
 * The hashes of the proofs a request carries (vault/proof.ts), for the two requests that carry any: one for
 * `vault/unlock`, one for each way in for `vault/start`. Null when a proof is missing or is not 43 characters of
 * base64url. Done before `act`, because hashing waits; `act` goes by these and never sees a proof.
 */
export async function proofsIn(action: string, body: Uint8Array): Promise<readonly string[] | null> {
  if (action !== "vault/unlock" && action !== "vault/start") return [];
  const read = said(body);
  const shown: unknown[] = action === "vault/unlock" ? [read?.proof] : Array.isArray(read?.ways) && read.ways.length <= 8 ? read.ways.map((way: unknown) => (way as { proof?: unknown } | null)?.proof) : [undefined];
  const hashes = await Promise.all(shown.map((proof) => hashOf(proof)));
  return hashes.every((hash): hash is string => hash !== null) ? hashes : null;
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
      lock(db, session.id);
      note(db, "sign-out", session.id, now);
      return { status: 200, json: { ok: true }, signedOut: true };
    case "sessions":
      return { status: 200, json: { ok: true, sessions: listSessions(db, now).map((one) => ({ ...one, here: one.id === session.id })) } };
    case "sessions/end": {
      const body = said(asked.body);
      if (body?.others === true) {
        const ended = endAllSessions(db, session.id);
        if (ended) note(db, "sessions-ended", session.id, now);
        tidyUnlocked(db);
        return { status: 200, json: { ok: true, ended } };
      }
      if (!body || !endSession(db, body.id)) return no(404, "no-session");
      lock(db, body.id);
      note(db, "session-ended", session.id, now);
      return { status: 200, json: { ok: true, ended: 1 }, ...(body.id === session.id ? { signedOut: true } : {}) };
    }
    case "vault":
      return { status: 200, json: { ok: true, vault: vaultHeld(db), unlocked: isUnlocked(db, session.id), ways: listWays(db), limits: { vaultBytes: config.limits.vaultBytes, writesPerDay: config.limits.writesPerDay } } };
    case "vault/start": {
      const body = said(asked.body);
      if (!body || typeof body.vault !== "string" || !Array.isArray(body.ways)) return no(400, "bad-request");
      const vault = body.vault;
      const before = vaultHeld(db);
      // The same vault again is the same answer, and nothing more: its ways in stay as they are, and the session that
      // asks is not unlocked by asking. Another vault is a reset, which is not done here (VAULT-5, VAULT-7).
      if (before !== null) return before === vault ? { status: 200, json: { ok: true, vault } } : no(409, "another-vault");
      const ways = body.ways.map((way: unknown, i: number) => ({ wrapper: (way as { wrapper?: unknown } | null)?.wrapper, params: (way as { params?: unknown } | null)?.params, verifier: asked.proofs?.[i] }));
      // the vault, its ways in, and the session that made it unlocked: all of it or none of it
      try {
        db.atomically(() => {
          if (!startVault(db, vault) || !startWays(db, vault, ways, now)) throw REFUSED;
          unlockMaker(db, session.id, now);
          note(db, "vault-started", session.id, now);
        });
      } catch (error) {
        if (error === REFUSED) return no(400, "bad-request");
        throw error;
      }
      return { status: 200, json: { ok: true, vault } };
    }
    case "vault/way": {
      const body = said(asked.body);
      const way = body ? paramsOf(db, body) : null;
      return way ? { status: 200, json: { ok: true, ...way } } : no(404, "no-way");
    }
    case "vault/unlock": {
      const body = said(asked.body);
      if (!body) return no(400, "bad-request");
      // counted, noted and answered in one piece: a wrong proof that was counted is in the log, and one that is in the log was counted
      return db.atomically((): Answer => {
        const tried = tryUnlock(db, body.id, asked.proofs?.[0], session.id, now);
        if (tried.ok) {
          note(db, "unlocked", session.id, now);
          tidyEvents(db, now);
          tidyUnlocked(db);
          return { status: 200, json: { ok: true, wrapper: tried.wrapper } };
        }
        if (tried.why === "too-many") return { status: 429, json: { ok: false, why: "too-many", again: tried.again } };
        if (tried.why === "no-way") return no(404, "no-way");
        note(db, "unlock-failed", session.id, now);
        tidyEvents(db, now);
        return { status: 422, json: { ok: false, why: "wrong-secret", left: tried.left } };
      });
    }
    case "vault/lock":
      lock(db, session.id);
      return { status: 200, json: { ok: true } };
    case "sync/pull": {
      // (sync is for a session that has shown it can open the vault: no other reads anything, ciphertext included)
      if (!isUnlocked(db, session.id)) return no(423, "locked");
      const body = said(asked.body);
      if (!body) return no(400, "bad-request");
      return { status: 200, bytes: packPulled(pullChunks(db, body.vault as string, body.since as number, config.limits)) };
    }
    case "sync/push": {
      if (!isUnlocked(db, session.id)) return no(423, "locked");
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
