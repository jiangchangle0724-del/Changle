// 两清 · All Square: the server. One Worker answering changle.ca/split/api and nothing else (the
// pages at changle.ca/split are the main site's own, site/src/split). What is said on each address
// is in src/room/protocol.ts.
//
// Each ledger is one Durable Object (LedgerDO) with its own small SQLite database: the ledger, the
// fingerprints of the key that opens it and of its owner's key, the id of every change it has been
// sent, and the record of the ones that counted. It takes changes one request at a time, so two
// phones recording at once can't cross, and it tells every phone that is listening.
//
// Each changle.ca account that has signed in here has one too (AccountDO): its ledgers, with their
// keys (src/room/account.ts), and the room its files use. Who is signed in, the rooms server says
// (src/server/who.ts).
//
// Receipt photos and files are in the private bucket split-files (FILES), each at
// "<ledger>/<file>". The Worker puts them there and reads them back; the ledger keeps the list, and
// the sender's account is charged for each before it goes in.
import { DurableObject } from "cloudflare:workers";
import type { Ledger } from "../../../../site/src/split/core";
import { AccountRoom, STARTS_PER_DAY, type AccountFile, type AccountStore, type Kept, type Mine, type Reserved, type Storage } from "../room/account";
import { ID_RE, LedgerRoom, type ErrorCode, type Fail, type FileInfo, type Logged, type Meta, type Store, type StoredFile } from "../room/ledger";
import {
  FILE_MAX,
  FILE_TYPES,
  KEY_HEADER,
  KEY_RE,
  LIVE_PROTOCOL,
  MEMBER_RE,
  NEXT_HEADER,
  OWNER_HEADER,
  QUOTA,
  type ApiError,
  type Files,
  type MineBody,
  type MyLedgers,
  type Push,
  type Pushed,
  type Since,
  type Snapshot,
  type Stored,
} from "../room/protocol";
import { sessionOf, sha256, whoIs } from "./who";

export interface Env {
  LEDGERS: DurableObjectNamespace<LedgerDO>;
  GATES: DurableObjectNamespace<GateDO>;
  ACCOUNTS: DurableObjectNamespace<AccountDO>;
  /** the rooms server (site/worker), which says whose a sign-in is */
  ROOMS: Fetcher;
  /** receipt photos (stage three): the private bucket split-files, read and written only here */
  FILES: R2Bucket;
  /** local runs and tests only: "1" lifts the daily allowance of new ledgers per network (not per account) */
  ALLOW_TEST_SETTINGS?: string;
  /** with ALLOW_TEST_SETTINGS only: an account's room for files, in bytes, smaller than QUOTA, for the tests to fill */
  TEST_QUOTA?: string;
}

const BASE = "/split/api";
/** Ledgers one network may make in a day. (One account may start STARTS_PER_DAY, src/room/account.ts.) */
const MAKES_PER_DAY = 10;
/** The longest request read: 500 changes fit several times over. */
const BODY_MAX = 400_000;
/** How the Worker hands the Durable Object the fingerprint of a live connection's key. Set here only, never taken from a phone. */
const HASH_HEADER = "x-split-key-hash";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const refuse = (error: ApiError["error"], status: number) => json({ error } satisfies ApiError, status);
const STATUS: Record<ErrorCode, number> = { gone: 404, exists: 409, bad: 400, key: 403, full: 409, owner: 403, locked: 423 };
/** The live connections of a ledger whose key was changed are closed with this: they were let in by the old one. */
const KEY_CHANGED = 4403;
/** The live connections of a ledger its owner deleted are closed with this. */
const DELETED = 4404;
const failed = (f: Fail) => refuse(f.error, STATUS[f.error]);
const today = () => new Date().toISOString().slice(0, 10);

async function body(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > BODY_MAX) return null;
  const text = await req.text();
  if (text.length > BODY_MAX) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** One more ledger today from this network; false when today's are used up. Networks are told apart by address, kept only as a fingerprint. */
async function allowed(req: Request, env: Env): Promise<boolean> {
  if (env.ALLOW_TEST_SETTINGS === "1") return true;
  const network = await sha256(`split:${req.headers.get("cf-connecting-ip") ?? "local"}`);
  return env.GATES.get(env.GATES.idFromName(network)).take("make", MAKES_PER_DAY, today());
}

const accountOf = (env: Env, id: string) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(`u:${id}`));

/** An account's room for files: QUOTA, or a smaller one the tests set. */
const quotaOf = (env: Env) => (env.ALLOW_TEST_SETTINGS === "1" && /^\d{1,12}$/.test(env.TEST_QUOTA ?? "") ? Number(env.TEST_QUOTA) : QUOTA);

/** Where a ledger's file is in the bucket. */
const fileKey = (ledger: string, id: string) => `${ledger}/${id}`;

/** Does a file start the way one of its kind does? (A file that says it is a photo and isn't, isn't kept.) */
function looksLike(bytes: Uint8Array, type: string): boolean {
  const starts = (...b: number[]) => b.every((x, i) => bytes[i] === x);
  const text = (from: number, s: string) => [...s].every((c, i) => bytes[from + i] === c.charCodeAt(0));
  if (type === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (type === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === "image/webp") return text(0, "RIFF") && text(8, "WEBP");
  if (type === "application/pdf") return text(0, "%PDF-");
  return false;
}

/**
 * A file goes back to a phone holding the key: as what it is, kept on that phone (it never changes:
 * an id is never used for another file), and only ever shown, never run.
 */
function fileResponse(object: R2ObjectBody, file: FileInfo): Response {
  return new Response(object.body, {
    headers: {
      "content-type": file.type,
      "content-length": String(object.size),
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    },
  });
}

/**
 * A ledger's files: listed, stored, read, and taken off. Every one needs the key; storing one
 * also needs a sign-in, and is charged to that account before it goes in the bucket.
 */
async function files(req: Request, env: Env, ctx: ExecutionContext, stub: DurableObjectStub<LedgerDO>, ledger: string, id: string | undefined, keyHash: string | null): Promise<Response> {
  if (id === undefined) {
    if (req.method !== "GET") return refuse("notfound", 404);
    const got = await stub.listFiles(keyHash);
    return got.ok ? json({ files: got.files } satisfies Files) : failed(got);
  }
  if (!ID_RE.test(id)) return refuse("notfound", 404);
  if (req.method === "GET") {
    const got = await stub.file(keyHash, id);
    if (!got.ok) return failed(got);
    const object = await env.FILES.get(fileKey(ledger, id));
    return object ? fileResponse(object, got.file) : refuse("gone", 404);
  }
  if (req.method === "DELETE") {
    const got = await stub.unstore(keyHash, id);
    if (!got.ok) return failed(got);
    // (it is off the ledger whatever happens here; a file left behind is found by the nightly check)
    try {
      await env.FILES.delete(fileKey(ledger, id));
      await accountOf(env, got.file.by).release(ledger, [id]);
    } catch (e) {
      console.error("split: a file taken off its ledger wasn't let go", e);
    }
    return json({ ok: true });
  }
  if (req.method !== "PUT") return refuse("notfound", 404);

  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who) return refuse("signin", 401);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!(FILE_TYPES as readonly string[]).includes(type)) return refuse("bad", 400);
  if (Number(req.headers.get("content-length") ?? 0) > FILE_MAX) return refuse("big", 413);
  // (the key, before a body of up to 10 MB is read; a file stored already is that file, charged once)
  const may = await stub.mayStore(keyHash, id);
  if (!may.ok) return failed(may);
  const account = accountOf(env, who.id);
  const quota = quotaOf(env);
  if (may.kept) return json({ file: may.kept, used: await account.used(), quota } satisfies Stored);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > FILE_MAX) return refuse("big", 413);
  if (!bytes.length || !looksLike(bytes, type)) return refuse("bad", 400);
  const room = await account.reserve({ ledger, id, size: bytes.length, day: today(), quota });
  if (!room.ok) return refuse(room.error, room.error === "quota" ? 413 : 429);
  const at = Date.now();
  try {
    await env.FILES.put(fileKey(ledger, id), bytes, { httpMetadata: { contentType: type }, customMetadata: { by: who.id, at: String(at) } });
  } catch {
    await account.release(ledger, [id]);
    return refuse("down", 503);
  }
  const kept = await stub.stored({ id, size: bytes.length, type, by: who.id, at });
  if (!kept.ok) {
    // (the ledger was locked or deleted meanwhile: the file goes, and so does its charge)
    await env.FILES.delete(fileKey(ledger, id));
    await account.release(ledger, [id]);
    return failed(kept);
  }
  return json({ file: kept.file, used: room.used, quota } satisfies Stored, 201);
}

/** "My files": how much of its room a signed-in account's files use, in all and in each ledger. */
async function myFiles(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (req.method !== "GET") return refuse("notfound", 404);
  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who) return refuse("signin", 401);
  return json((await accountOf(env, who.id).storage(quotaOf(env))) satisfies Storage);
}

/**
 * The account a request is signed in to. Null when it carries no sign-in; a response to send
 * back when it carries one that isn't anybody's (401 "signin") or can't be checked now (503).
 */
async function signedIn(req: Request, env: Env, ctx: ExecutionContext): Promise<{ id: string } | null | Response> {
  const session = sessionOf(req);
  if (session === null) return req.headers.has("authorization") ? refuse("signin", 401) : null;
  const asked = await whoIs(session, env.ROOMS, (p) => ctx.waitUntil(p));
  return asked.ok ? asked.who : refuse(asked.error, asked.error === "signin" ? 401 : 503);
}

/** "My ledgers": what a signed-in phone asks of its account. */
async function mine(req: Request, env: Env, ctx: ExecutionContext, id: string | undefined): Promise<Response> {
  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who) return refuse("signin", 401);
  const account = accountOf(env, who.id);
  if (id === undefined) {
    if (req.method !== "GET") return refuse("notfound", 404);
    return json({ ledgers: await account.list() } satisfies MyLedgers);
  }
  if (!ID_RE.test(id)) return refuse("notfound", 404);
  if (req.method === "DELETE") {
    await account.drop(id);
    return json({ ok: true });
  }
  if (req.method !== "PUT") return refuse("notfound", 404);
  // Kept only when the key opens the ledger, and the owner's key, when one comes, is its owner's.
  const key = req.headers.get(KEY_HEADER) ?? "";
  const owner = req.headers.get(OWNER_HEADER);
  if (!KEY_RE.test(key) || (owner !== null && !KEY_RE.test(owner))) return refuse("bad", 400);
  const input = (await body(req)) ?? {};
  const stub = env.LEDGERS.get(env.LEDGERS.idFromName(id));
  const got = await stub.read(await sha256(key));
  if (!got.ok) return failed(got);
  if (owner !== null && !(await stub.owned(await sha256(owner)))) return refuse("owner", 403);
  // (who they are only if they are someone in it: one taken out since is forgotten)
  const me = typeof input.me === "string" && MEMBER_RE.test(input.me) && got.ledger.members.some((m) => m.id === input.me) ? input.me : input.me === undefined ? undefined : null;
  const kept = await account.keep({ id, key, owner, me });
  return kept.ok ? json({ mine: kept.mine } satisfies MineBody) : refuse(kept.error, 409);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return refuse("notfound", 404);
    const parts = url.pathname.slice(BASE.length).split("/").filter(Boolean);
    if (parts[0] === "me" && parts[1] === "ledgers" && parts.length <= 3) return mine(req, env, ctx, parts[2]);
    if (parts[0] === "me" && parts[1] === "files" && parts.length === 2) return myFiles(req, env, ctx);
    if (parts[0] !== "ledgers" || parts.length > 4) return refuse("notfound", 404);

    // the live connection: its key comes as a protocol name, because a browser can't give it a header
    if (parts.length === 3 && parts[2] === "live" && req.method === "GET") {
      if (!ID_RE.test(parts[1])) return refuse("notfound", 404);
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host) return new Response("forbidden", { status: 403 });
      const [name, key = ""] = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim());
      if (name !== LIVE_PROTOCOL || !KEY_RE.test(key)) return refuse("key", 403);
      const headers = new Headers(req.headers);
      headers.set(HASH_HEADER, await sha256(key));
      return env.LEDGERS.get(env.LEDGERS.idFromName(parts[1])).fetch(new Request(req, { headers }));
    }

    const key = req.headers.get(KEY_HEADER) ?? "";
    const keyHash = KEY_RE.test(key) ? await sha256(key) : null;
    // the owner's key: on the request that makes the ledger, and on the owner's two
    const owner = req.headers.get(OWNER_HEADER);
    const ownerHash = owner !== null && KEY_RE.test(owner) ? await sha256(owner) : null;

    if (parts.length === 1 && req.method === "POST") {
      if (!keyHash) return refuse("key", 403);
      // (an owner's key that isn't one makes no ledger: better than a ledger its maker can't lock)
      if (owner !== null && !ownerHash) return refuse("bad", 400);
      // A ledger is made for a phone signed in to changle.ca: it goes into the account's list, keys
      // and all, and counts against the account's day. (Asked for again, one already made needs no
      // sign-in: nothing new is made, and a phone that signed out meanwhile still gets its answer.)
      const who = await signedIn(req, env, ctx);
      if (who instanceof Response) return who;
      const input = await body(req);
      if (!input || typeof input.id !== "string" || !ID_RE.test(input.id)) return refuse("bad", 400);
      const id = input.id;
      const stub = env.LEDGERS.get(env.LEDGERS.idFromName(id));
      // (keeping it in the list is a convenience: the phone holds the keys, and puts them in its account itself when this didn't)
      const keep = async (owned: boolean) => {
        if (who) await accountOf(env, who.id).keep({ id, key, owner: owned && ownerHash ? owner : undefined }).catch(() => undefined);
      };
      // a phone asking again for the ledger it has already made doesn't use up the day's allowance
      // (and its owner's key is kept only if it is the one the ledger was made with)
      const there = await stub.read(keyHash);
      if (there.ok) {
        await keep(await stub.owned(ownerHash));
        return json({ seq: there.seq, ledger: there.ledger } satisfies Snapshot);
      }
      if (there.error !== "gone") return refuse("exists", 409);
      if (!who) return refuse("signin", 401);
      if (!(await allowed(req, env))) return refuse("limit", 429);
      if (who && !(await accountOf(env, who.id).take(today(), STARTS_PER_DAY))) return refuse("limit", 429);
      const made = await stub.create({ id, name: input.name, currency: input.currency, members: input.members, keyHash, ownerHash, now: Date.now() });
      if (!made.ok) return failed(made);
      await keep(true);
      return json({ seq: made.seq, ledger: made.ledger } satisfies Snapshot, 201);
    }

    if (!ID_RE.test(parts[1] ?? "")) return refuse("notfound", 404);
    const stub = env.LEDGERS.get(env.LEDGERS.idFromName(parts[1]));
    if (parts[2] === "files") return files(req, env, ctx, stub, parts[1], parts[3], keyHash);
    if (parts.length > 3) return refuse("notfound", 404);

    // The owner deletes it. Signed in, it also leaves the owner's list.
    if (parts.length === 2 && req.method === "DELETE") {
      const got = await stub.wipe(ownerHash);
      if (!got.ok) return failed(got);
      const who = await signedIn(req, env, ctx);
      if (who && !(who instanceof Response)) await accountOf(env, who.id).drop(parts[1]);
      return json({ ok: true });
    }
    if (parts.length === 2 && req.method === "GET") {
      const since = url.searchParams.get("since");
      if (since === null) {
        const got = await stub.read(keyHash);
        return got.ok ? json({ seq: got.seq, ledger: got.ledger } satisfies Snapshot) : failed(got);
      }
      const got = await stub.since(keyHash, /^\d{1,15}$/.test(since) ? Number(since) : -1);
      return got.ok ? json({ seq: got.seq, changes: got.changes } satisfies Since) : failed(got);
    }
    if (parts.length === 3 && parts[2] === "changes" && req.method === "POST") {
      const input = await body(req);
      if (!input) return refuse("bad", 400);
      const got = await stub.push(keyHash, input.changes);
      return got.ok ? json({ seq: got.seq, ledger: got.ledger, took: got.took } satisfies Pushed) : failed(got);
    }
    if (parts.length === 3 && parts[2] === "key" && req.method === "POST") {
      const next = req.headers.get(NEXT_HEADER) ?? "";
      if (!KEY_RE.test(next)) return refuse("bad", 400);
      const got = await stub.rekey(ownerHash, await sha256(next));
      return got.ok ? json({ seq: got.seq, ledger: got.ledger } satisfies Snapshot) : failed(got);
    }
    if (parts.length === 3 && parts[2] === "lock" && req.method === "POST") {
      const input = await body(req);
      if (!input) return refuse("bad", 400);
      const got = await stub.lock(ownerHash, input.locked);
      return got.ok ? json({ seq: got.seq, ledger: got.ledger } satisfies Snapshot) : failed(got);
    }
    return refuse("notfound", 404);
  },
} satisfies ExportedHandler<Env>;

/** The room's store, in the Durable Object's own SQLite. Nothing is written for a ledger nobody made. */
function sqlStore(sql: SqlStorage): Store {
  // every change this ledger was sent, and whether it counted
  const HEARD = "CREATE TABLE IF NOT EXISTS heard (id TEXT PRIMARY KEY, counted INTEGER NOT NULL) WITHOUT ROWID";
  // its receipt photos and files: what is in the bucket for it, and whose account sent each
  const FILES = "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, size INTEGER NOT NULL, type TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL)";
  let made = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray().length > 0;
  // A ledger made on the server's first day has a table named `sent` with ids only. It gets the
  // new table here and the old one is left as it is, not read. (A ledger made before files gets
  // their table here too.)
  if (made) {
    sql.exec(HEARD);
    sql.exec(FILES);
  }
  const ready = () => {
    if (made) return;
    sql.exec("CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, ledger TEXT NOT NULL)");
    sql.exec(HEARD);
    sql.exec(FILES);
    sql.exec("CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, json TEXT NOT NULL)");
    made = true;
  };
  return {
    load() {
      if (!made) return null;
      const row = sql.exec("SELECT json, ledger FROM meta WHERE id = 1").toArray()[0];
      return row ? { meta: JSON.parse(row.json as string) as Meta, ledger: JSON.parse(row.ledger as string) as Ledger } : null;
    },
    save(meta, ledger) {
      ready();
      sql.exec("INSERT INTO meta (id, json, ledger) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, ledger = excluded.ledger", JSON.stringify(meta), JSON.stringify(ledger));
    },
    seen(id) {
      if (!made) return undefined;
      const row = sql.exec("SELECT counted FROM heard WHERE id = ?", id).toArray()[0];
      return row ? row.counted === 1 : undefined;
    },
    keep(id, logged) {
      ready();
      sql.exec("INSERT OR IGNORE INTO heard (id, counted) VALUES (?, ?)", id, logged ? 1 : 0);
      if (logged) sql.exec("INSERT INTO log (seq, at, json) VALUES (?, ?, ?)", logged.seq, logged.at, JSON.stringify(logged.sent));
    },
    // (a line that is no change is kept as {"lock": true or false}, where a change's line is the change as it was sent)
    note(logged) {
      ready();
      sql.exec("INSERT INTO log (seq, at, json) VALUES (?, ?, ?)", logged.seq, logged.at, JSON.stringify({ lock: logged.lock }));
    },
    since(seq, limit) {
      if (!made) return [];
      const rows = sql.exec("SELECT seq, at, json FROM log WHERE seq > ? ORDER BY seq LIMIT ?", seq, limit).toArray();
      return rows.map((r): Logged => {
        const line = JSON.parse(r.json as string) as { lock?: unknown };
        return typeof line.lock === "boolean" ? { seq: r.seq as number, at: r.at as number, lock: line.lock } : { seq: r.seq as number, at: r.at as number, sent: line as Extract<Logged, { sent: unknown }>["sent"] };
      });
    },
    // Every table goes (the ledger, the ids it was sent, its record, the first day's `sent`), and
    // one is made with only the time it went.
    wipe(now) {
      const tables = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").toArray();
      for (const t of tables) sql.exec(`DROP TABLE IF EXISTS "${String(t.name).replaceAll('"', "")}"`);
      sql.exec("CREATE TABLE buried (at INTEGER NOT NULL)");
      sql.exec("INSERT INTO buried (at) VALUES (?)", now);
      made = false;
    },
    buried() {
      if (made) return null;
      const there = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'buried'").toArray().length > 0;
      const row = there ? sql.exec("SELECT at FROM buried LIMIT 1").toArray()[0] : undefined;
      return row ? (row.at as number) : null;
    },
    files() {
      if (!made) return [];
      return sql.exec("SELECT id, size, type, by, at FROM files ORDER BY at, rowid").toArray().map(asStoredFile);
    },
    file(id) {
      if (!made) return null;
      const row = sql.exec("SELECT id, size, type, by, at FROM files WHERE id = ?", id).toArray()[0];
      return row ? asStoredFile(row) : null;
    },
    putFile(f) {
      ready();
      sql.exec("INSERT OR IGNORE INTO files (id, size, type, by, at) VALUES (?, ?, ?, ?, ?)", f.id, f.size, f.type, f.by, f.at);
    },
    dropFile(id) {
      if (made) sql.exec("DELETE FROM files WHERE id = ?", id);
    },
    fileCount: () => (made ? Number(sql.exec("SELECT count(*) AS n FROM files").one().n) : 0),
  };
}

const asStoredFile = (r: Record<string, SqlStorageValue>): StoredFile => ({ id: String(r.id), size: Number(r.size), type: String(r.type), by: String(r.by), at: Number(r.at) });

/** One ledger. */
export class LedgerDO extends DurableObject<Env> {
  private room: LedgerRoom;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = new LedgerRoom(sqlStore(ctx.storage.sql));
  }

  /** Every phone that is listening gets the ledger as it now stands. */
  private tell(): void {
    const snap = this.room.snapshot();
    if (!snap) return;
    const text = JSON.stringify({ t: "ledger", ...snap } satisfies Push);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // a phone that just left
      }
    }
  }

  async create(input: Parameters<LedgerRoom["create"]>[0]): Promise<ReturnType<LedgerRoom["create"]>> {
    return this.room.create(input);
  }

  async read(keyHash: string | null): Promise<ReturnType<LedgerRoom["read"]>> {
    return this.room.read(keyHash);
  }

  async push(keyHash: string | null, changes: unknown): Promise<ReturnType<LedgerRoom["push"]>> {
    const got = this.room.push(keyHash, changes, Date.now());
    if (got.ok && got.took.includes("new")) this.tell();
    return got;
  }

  async since(keyHash: string | null, seq: number): Promise<ReturnType<LedgerRoom["since"]>> {
    return this.room.since(keyHash, seq);
  }

  /** The owner changes the key. Every phone that was listening was let in by the old one: they are let go, and come back with the new one or not at all. */
  async rekey(ownerHash: string | null, nextHash: string): Promise<ReturnType<LedgerRoom["rekey"]>> {
    const got = this.room.rekey(ownerHash, nextHash);
    if (got.ok && got.changed) {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(KEY_CHANGED, "key");
        } catch {
          // a phone that just left
        }
      }
    }
    return got;
  }

  /** Is this the owner's key? */
  async owned(ownerHash: string | null): Promise<boolean> {
    return this.room.owns(ownerHash);
  }

  /**
   * The owner deletes the ledger. Every phone that was listening is let go, and finds it gone when
   * it comes back. Its files go from the bucket, and each sender's account has their room back.
   */
  async wipe(ownerHash: string | null): Promise<Fail | { ok: true }> {
    const got = this.room.wipe(ownerHash, Date.now());
    if (!got.ok) return got;
    this.letGo();
    // (the ledger is gone whatever happens here; a file left behind is found by the nightly check)
    try {
      const keys = got.files.map((f) => fileKey(got.id, f.id));
      for (let i = 0; i < keys.length; i += 1000) await this.env.FILES.delete(keys.slice(i, i + 1000));
      const by = new Map<string, string[]>();
      for (const f of got.files) by.set(f.by, [...(by.get(f.by) ?? []), f.id]);
      for (const [account, ids] of by) await accountOf(this.env, account).release(got.id, ids);
    } catch (e) {
      console.error("split: a deleted ledger's files weren't all let go", e);
    }
    return { ok: true };
  }

  async mayStore(keyHash: string | null, id: string): Promise<ReturnType<LedgerRoom["mayStore"]>> {
    return this.room.mayStore(keyHash, id);
  }

  async stored(file: StoredFile): Promise<ReturnType<LedgerRoom["stored"]>> {
    return this.room.stored(file);
  }

  async file(keyHash: string | null, id: string): Promise<ReturnType<LedgerRoom["file"]>> {
    return this.room.file(keyHash, id);
  }

  async listFiles(keyHash: string | null): Promise<ReturnType<LedgerRoom["listFiles"]>> {
    return this.room.listFiles(keyHash);
  }

  async unstore(keyHash: string | null, id: string): Promise<ReturnType<LedgerRoom["unstore"]>> {
    return this.room.unstore(keyHash, id);
  }

  /** Every phone listening to a ledger that is gone is let go. */
  private letGo() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(DELETED, "gone");
      } catch {
        // a phone that just left
      }
    }
  }

  /** The owner locks the ledger, or opens it again: every phone that is listening sees it. */
  async lock(ownerHash: string | null, locked: unknown): Promise<ReturnType<LedgerRoom["lock"]>> {
    const got = this.room.lock(ownerHash, locked, Date.now());
    if (got.ok && got.changed) this.tell();
    return got;
  }

  /** The live connection: a phone listens here and is sent the ledger now, and again whenever it changes. */
  async fetch(req: Request): Promise<Response> {
    const snap = this.room.snapshot();
    if (!snap) return refuse("gone", 404);
    if (!this.room.opens(req.headers.get(HASH_HEADER))) return refuse("key", 403);
    const [client, server] = Object.values(new WebSocketPair());
    // a phone's keep-alive is answered without waking the ledger
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ t: "ledger", ...snap } satisfies Push));
    return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": LIVE_PROTOCOL } });
  }

  async webSocketMessage(): Promise<void> {
    // phones only listen here (changes go by POST); "ping" is answered before it gets this far
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011);
    } catch {
      // already closed
    }
  }
}

/** One network's daily allowance of new ledgers. Forgets everything two days after its last use. */
export class GateDO extends DurableObject<Env> {
  async take(kind: string, limit: number, day: string): Promise<boolean> {
    const key = `${kind}:${day}`;
    const used = (await this.ctx.storage.get<number>(key)) ?? 0;
    if (used >= limit) return false;
    await this.ctx.storage.put(key, used + 1);
    await this.ctx.storage.setAlarm(Date.now() + 2 * 86_400_000);
    return true;
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

/** An account's list, in the Durable Object's own SQLite. */
function accountStore(sql: SqlStorage): AccountStore {
  sql.exec("CREATE TABLE IF NOT EXISTS mine (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS started (day TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID");
  sql.exec("CREATE TABLE IF NOT EXISTS files (ledger TEXT NOT NULL, id TEXT NOT NULL, size INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (ledger, id))");
  sql.exec("CREATE TABLE IF NOT EXISTS sent (day TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID");
  const asFile = (r: Record<string, SqlStorageValue>): AccountFile => ({ ledger: String(r.ledger), id: String(r.id), size: Number(r.size), at: Number(r.at) });
  const read = (json: unknown) => JSON.parse(json as string) as Mine;
  return {
    // (the last first kept first; among those kept the same moment, the last put)
    list: () => sql.exec("SELECT json FROM mine ORDER BY at DESC, rowid DESC").toArray().map((r) => read(r.json)),
    get: (id) => {
      const row = sql.exec("SELECT json FROM mine WHERE id = ?", id).toArray()[0];
      return row ? read(row.json) : null;
    },
    put(m) {
      sql.exec("INSERT INTO mine (id, json, at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json", m.id, JSON.stringify(m), m.at);
    },
    drop(id) {
      sql.exec("DELETE FROM mine WHERE id = ?", id);
    },
    count: () => Number(sql.exec("SELECT count(*) AS n FROM mine").one().n),
    used: (day) => Number(sql.exec("SELECT n FROM started WHERE day = ?", day).toArray()[0]?.n ?? 0),
    use(day) {
      sql.exec("DELETE FROM started WHERE day <> ?", day);
      sql.exec("INSERT INTO started (day, n) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1", day);
    },
    fileOf(ledger, id) {
      const row = sql.exec("SELECT ledger, id, size, at FROM files WHERE ledger = ? AND id = ?", ledger, id).toArray()[0];
      return row ? asFile(row) : null;
    },
    addFile(f) {
      sql.exec("INSERT OR IGNORE INTO files (ledger, id, size, at) VALUES (?, ?, ?, ?)", f.ledger, f.id, f.size, f.at);
    },
    dropFile(ledger, id) {
      sql.exec("DELETE FROM files WHERE ledger = ? AND id = ?", ledger, id);
    },
    files: () => sql.exec("SELECT ledger, id, size, at FROM files ORDER BY at, rowid").toArray().map(asFile),
    uploads: (day) => Number(sql.exec("SELECT n FROM sent WHERE day = ?", day).toArray()[0]?.n ?? 0),
    upload(day) {
      sql.exec("DELETE FROM sent WHERE day <> ?", day);
      sql.exec("INSERT INTO sent (day, n) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1", day);
    },
  };
}

/** One changle.ca account's ledgers ("my ledgers"), with their keys; and how many it started today. */
export class AccountDO extends DurableObject<Env> {
  private room: AccountRoom;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = new AccountRoom(accountStore(ctx.storage.sql));
  }

  async list(): Promise<Mine[]> {
    return this.room.list();
  }

  async keep(input: { id: string; key: string; owner?: string | null; me?: string | null }): Promise<Kept> {
    return this.room.keep({ ...input, now: Date.now() });
  }

  async drop(id: string): Promise<void> {
    this.room.drop(id);
  }

  async take(day: string, limit: number): Promise<boolean> {
    return this.room.take(day, limit);
  }

  async used(): Promise<number> {
    return this.room.used();
  }

  async reserve(input: { ledger: string; id: string; size: number; day: string; quota: number }): Promise<Reserved> {
    return this.room.reserve({ ...input, now: Date.now() });
  }

  async release(ledger: string, ids: string[]): Promise<number> {
    return this.room.release(ledger, ids);
  }

  async storage(quota: number): Promise<Storage> {
    return this.room.storage(quota);
  }
}
