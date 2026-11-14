// 两清 · All Square: the server. One Worker answering changle.ca/split/api and nothing else (the
// pages at changle.ca/split are the main site's own, site/src/split). What is said on each address
// is in src/room/protocol.ts.
//
// Each ledger is one Durable Object (LedgerDO) with its own small SQLite database: the ledger, the
// fingerprints of the key that opens it and of its owner's key, the id of every change it has been
// sent, and the record of the ones that counted. It takes changes one request at a time, so two
// phones recording at once can't cross, and it tells every phone that is listening.
import { DurableObject } from "cloudflare:workers";
import type { Ledger } from "../../../../site/src/split/core";
import { ID_RE, LedgerRoom, type ErrorCode, type Fail, type Logged, type Meta, type Store } from "../room/ledger";
import { KEY_HEADER, KEY_RE, LIVE_PROTOCOL, NEXT_HEADER, OWNER_HEADER, type ApiError, type Push, type Pushed, type Since, type Snapshot } from "../room/protocol";

export interface Env {
  LEDGERS: DurableObjectNamespace<LedgerDO>;
  GATES: DurableObjectNamespace<GateDO>;
  /** local runs and tests only: "1" lifts the daily allowance below */
  ALLOW_TEST_SETTINGS?: string;
}

const BASE = "/split/api";
/** Ledgers one network may make in a day. (Signing in to make one, and a day's allowance per account, come with accounts.) */
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
const failed = (f: Fail) => refuse(f.error, STATUS[f.error]);

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  return env.GATES.get(env.GATES.idFromName(network)).take("make", MAKES_PER_DAY, new Date().toISOString().slice(0, 10));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return refuse("notfound", 404);
    const parts = url.pathname.slice(BASE.length).split("/").filter(Boolean);
    if (parts[0] !== "ledgers" || parts.length > 3) return refuse("notfound", 404);

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
      const input = await body(req);
      if (!input || typeof input.id !== "string" || !ID_RE.test(input.id)) return refuse("bad", 400);
      const stub = env.LEDGERS.get(env.LEDGERS.idFromName(input.id));
      // a phone asking again for the ledger it has already made doesn't use up the day's allowance
      const there = await stub.read(keyHash);
      if (there.ok) return json({ seq: there.seq, ledger: there.ledger } satisfies Snapshot);
      if (there.error !== "gone") return refuse("exists", 409);
      if (!(await allowed(req, env))) return refuse("limit", 429);
      const made = await stub.create({ id: input.id, name: input.name, currency: input.currency, members: input.members, keyHash, ownerHash, now: Date.now() });
      return made.ok ? json({ seq: made.seq, ledger: made.ledger } satisfies Snapshot, 201) : failed(made);
    }

    if (!ID_RE.test(parts[1] ?? "")) return refuse("notfound", 404);
    const stub = env.LEDGERS.get(env.LEDGERS.idFromName(parts[1]));

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
  let made = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray().length > 0;
  // A ledger made on the server's first day has a table named `sent` with ids only. It gets the
  // new table here and the old one is left as it is, not read.
  if (made) sql.exec(HEARD);
  const ready = () => {
    if (made) return;
    sql.exec("CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, ledger TEXT NOT NULL)");
    sql.exec(HEARD);
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
  };
}

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
