/**
 * One person's MoneyLens on the server: everything their Durable Object does, as plain functions
 * on its database (ISO-1). The object itself (worker.ts) adapts the storage and nothing more, so
 * what is decided here is tested on Node's SQLite as chunks.ts and sessions.ts are.
 *
 * The database holds five things: whose it is and whether the owner signed in to it (one row),
 * the sessions (sessions.ts), the vault's sealed chunks (chunks.ts), the ways into the vault
 * (ways.ts: the wrapped keys, and what a session has to show to be given one), and a log of
 * security events (SEC-17) with no contents: what happened, when, and in which session. And,
 * when one is asked for, an erasing of the vault and when it is due (erase.ts). A database nobody has
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
import { isId } from "../core/ids";
import { chunkTables, lastDay, pullChunks, pushChunks, startVault, vaultHeld, type Db } from "./chunks";
import { askErase, cancelErase, carrySpent, eraseVault, pendingErase, settleErase, type Erasing } from "./erase";
import { admits, type Config, type Gate } from "./gate";
import { isAccount } from "./request";
import { checkSession, endAllSessions, endSession, hashOf, listSessions, openSession, sessionTables, type Session } from "./sessions";
import { isUnlocked, listWays, lock, openedSessions, paramsOf, startWays, tidyUnlocked, tryUnlock, unlockedSessions, unlockMaker, wayTables, TRIES_PER_DAY } from "./ways";
import { packPulled, packPushed, unpackPush } from "./wire";

/** Sign-ins one account may make in an hour. Eight sessions are kept, so signing in over and over pushes other devices out. */
export const SIGN_INS_PER_HOUR = 12;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * Events are kept twelve months (SEC-17), and never more than this many of each kind. Each kind is counted apart, so
 * that no number of lines of one kind pushes a line of another out of what is kept: not sign-ins and sign-outs a wrong
 * proof (the review of the door, finding 2), and not a right proof shown over and over the erasing of a vault.
 *
 * What is shown is the newest lines of all kinds together and, however many lines came after them, the newest of the
 * kinds a person must not miss: wrong proofs, as many as can be made in a day (ways.ts); the vault opened by any other
 * session than the one asking (the review of the devices' screen, finding 3); and the vault made, asked to be erased,
 * kept from being erased, erased, and the account's email address changed. Whoever holds the mailbox can sign in and out
 * all afternoon, and the owner is still shown that the passphrase was guessed at, that another device opened the
 * vault, and that it was asked to be erased.
 */
const EVENTS_KEPT = 366 * DAY;
const EVENTS_MOST = 500;
const EVENTS_SHOWN = 50;
const WRONG_SHOWN = TRIES_PER_DAY;
const APART_SHOWN = 10;

export const EVENT_KINDS = ["sign-in", "sign-out", "session-ended", "sessions-ended", "vault-started", "email-changed", "unlocked", "unlock-failed", "erase-asked", "erase-cancelled", "vault-erased"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** The kinds shown apart, besides wrong proofs and the vault opened by other sessions. */
const SHOWN_APART: readonly EventKind[] = ["vault-started", "erase-asked", "erase-cancelled", "vault-erased", "email-changed"];
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
 * Lets go of the lines that are too old, and of those past the most that are kept of their kind. Done wherever lines
 * are written: at each sign-in, at each proof shown (a right proof can be shown any number of times), and where a vault
 * is erased or asked to be. A line of a kind this code does not know is kept for its twelve months, like any other.
 */
function tidyEvents(db: Db, now: number): void {
  eventIndex(db);
  db.sql.exec(`DELETE FROM events WHERE at < ?`, now - EVENTS_KEPT);
  for (const kind of EVENT_KINDS) db.sql.exec(`DELETE FROM events WHERE kind = ? AND n <= (SELECT n FROM events WHERE kind = ? ORDER BY n DESC LIMIT 1 OFFSET ?)`, kind, kind, EVENTS_MOST);
}

/**
 * The lines of each kind by number, so that a kind's newest lines are read without reading the others' (rows read count
 * toward the plan's daily number, LIM-1). The table is older than the index, so it is made where it is needed.
 */
function eventIndex(db: Db): void {
  db.sql.exec(`CREATE INDEX IF NOT EXISTS events_by_kind ON events (kind, n)`);
}

/**
 * The lines shown to `session`, newest first, each once: the newest of all, and the newest of each kind shown apart
 * however many lines came after them (above). One small query for each, put together here: Cloudflare's SQLite takes
 * few terms in one compound SELECT.
 */
function shownEvents(db: Db, session: string): { at: number; kind: string; session: unknown }[] {
  eventIndex(db);
  const sets = [
    db.sql.exec(`SELECT n, at, kind, session FROM events ORDER BY n DESC LIMIT ?`, EVENTS_SHOWN),
    db.sql.exec(`SELECT n, at, kind, session FROM events WHERE kind = 'unlock-failed' ORDER BY n DESC LIMIT ?`, WRONG_SHOWN),
    db.sql.exec(`SELECT n, at, kind, session FROM events WHERE kind = 'unlocked' AND (session IS NULL OR session != ?) ORDER BY n DESC LIMIT ?`, session, APART_SHOWN),
    ...SHOWN_APART.map((kind) => db.sql.exec(`SELECT n, at, kind, session FROM events WHERE kind = ? ORDER BY n DESC LIMIT ?`, kind, APART_SHOWN)),
  ];
  const lines = new Map<number, { at: number; kind: string; session: unknown }>();
  for (const set of sets) for (const row of set.toArray()) lines.set(Number(row.n), { at: Number(row.at), kind: String(row.kind), session: row.session });
  return [...lines.entries()].sort(([a], [b]) => b - a).map(([, line]) => line);
}

/** An erasing as a session is shown it: when it was asked for and when it is due, and by which session (`here`: this one). Not which vault. */
const shownErase = (erasing: Erasing, session: string) => ({ asked: erasing.asked, due: erasing.due, session: erasing.session, here: erasing.session === session });

/**
 * Erases the vault when its erasing is due, with its line in the events log (in no session's name: the delay did it),
 * all in one transaction. Done before every request is answered, and by the object's alarm (worker.ts): the alarm is
 * what keeps the seven days whether or not anyone comes back, and the check before every request is what keeps them
 * if an alarm is lost. Returns when the erasing asked for is due, for the alarm, or null when none is.
 */
export function dueErase(db: Db, now: number): number | null {
  if (!isSetUp(db) || !isTime(now)) return null;
  return db.atomically(() => {
    const settled = settleErase(db, now, () => vaultHeld(db));
    if ("due" in settled) return settled.due;
    if (settled.did === "erased") {
      note(db, "vault-erased", null, now);
      tidyEvents(db, now);
    }
    return null;
  });
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
/**
 * What is answered: a status with JSON, or with a frame (wire.ts). `signedOut`: the cookie is to be cleared. `wake`:
 * an erasing is asked for, and the object's alarm is to be set for when it is due (worker.ts).
 */
export type Answer = { status: number; json?: Record<string, unknown>; bytes?: Uint8Array; signedOut?: boolean; wake?: number };

export const ACTIONS: readonly string[] = ["session/end", "sessions", "sessions/end", "vault", "vault/start", "vault/way", "vault/unlock", "vault/lock", "vault/erase", "vault/erase-later", "vault/erase-cancel", "sync/pull", "sync/push", "events"];

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
  // (an erasing that is due is done before anything is answered: after its seven days, nobody is shown that vault again)
  dueErase(db, now);
  switch (asked.action) {
    case "session/end":
      endSession(db, session.id);
      lock(db, session.id);
      note(db, "sign-out", session.id, now);
      return { status: 200, json: { ok: true }, signedOut: true };
    case "sessions": {
      // What their owner is shown of each besides (the review of the door, obligations; of the devices' screen,
      // finding 1). `unlocked`: it counts as holding the vault open, by its own word. `opened`: it has opened the
      // vault since it signed in, which the server knows whatever the session says since.
      const [open, opened] = [unlockedSessions(db), openedSessions(db)];
      return { status: 200, json: { ok: true, sessions: listSessions(db, now).map((one) => ({ ...one, here: one.id === session.id, unlocked: open.has(one.id), opened: opened.has(one.id) })) } };
    }
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
    case "vault": {
      // (an erasing asked for is shown to every signed-in device, VAULT-7; and its alarm is set again, should it have been lost)
      const erasing = pendingErase(db);
      return {
        status: 200,
        json: { ok: true, vault: vaultHeld(db), unlocked: isUnlocked(db, session.id), ways: listWays(db), limits: { vaultBytes: config.limits.vaultBytes, writesPerDay: config.limits.writesPerDay }, erasing: erasing && shownErase(erasing, session.id) },
        ...(erasing ? { wake: erasing.due } : {}),
      };
    }
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
          // (a vault made after one was erased goes on from the day's writes of the one before: erase.ts)
          carrySpent(db);
          unlockMaker(db, session.id, now);
          note(db, "vault-started", session.id, now);
          tidyEvents(db, now);
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
    case "vault/erase": {
      // At once, by a session that has the vault open (VAULT-7), and only the vault it names: a device erases the vault
      // it has open, never one made since.
      const body = said(asked.body);
      if (!body || !isId(body.vault)) return no(400, "bad-request");
      if (!isUnlocked(db, session.id)) return no(423, "locked");
      const held = vaultHeld(db);
      if (held === null) return no(404, "no-vault");
      if (held !== body.vault) return no(409, "another-vault");
      db.atomically(() => {
        eraseVault(db);
        note(db, "vault-erased", session.id, now);
        tidyEvents(db, now);
      });
      return { status: 200, json: { ok: true } };
    }
    case "vault/erase-later": {
      // By any signed-in session: in seven days, shown on every device meanwhile, and called off by one that has the vault open.
      const body = said(asked.body);
      if (!body || !isId(body.vault)) return no(400, "bad-request");
      const held = vaultHeld(db);
      if (held === null) return no(404, "no-vault");
      if (held !== body.vault) return no(409, "another-vault");
      const erasing = db.atomically(() => {
        const made = askErase(db, held, session.id, now);
        if (made.made) {
          note(db, "erase-asked", session.id, now);
          tidyEvents(db, now);
        }
        return made.erasing;
      });
      return { status: 200, json: { ok: true, erasing: shownErase(erasing, session.id) }, wake: erasing.due };
    }
    case "vault/erase-cancel": {
      if (!isUnlocked(db, session.id)) return no(423, "locked");
      const cancelled = db.atomically(() => {
        if (!cancelErase(db)) return false;
        note(db, "erase-cancelled", session.id, now);
        tidyEvents(db, now);
        return true;
      });
      return cancelled ? { status: 200, json: { ok: true } } : no(404, "no-erase");
    }
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
          // (the newest lines, and the newest of the kinds shown apart wherever they stand among them: one list, newest
          // first. `session` is the id of the session a line is about, for naming the device when it is still in the list.)
          events: shownEvents(db, session.id).map((row) => ({ at: row.at, kind: row.kind, here: row.session === session.id, session: typeof row.session === "string" ? row.session : null })),
          // (how many wrong proofs in the last day, of those that are kept)
          wrong: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM events WHERE kind = 'unlock-failed' AND at > ?`, now - DAY).toArray()[0]?.n ?? 0),
        },
      };
    default:
      return no(404, "no-such-thing");
  }
}
