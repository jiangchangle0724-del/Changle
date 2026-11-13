// 约时间 · When Works: the server. One Worker at changle.ca/when.
//   /when/                 the home page (a file)
//   /when/<8-char code>    a gathering's page: the same file, with the gathering's name as its title
//   /when/api/…            making a gathering, reading it, saving answers, the host's moves, the live feed
// Each gathering is one Durable Object (EventDO) with its own small SQLite database. It keeps the
// rows, tells every open phone when something changes, and deletes itself 60 days after it was made.
import { DurableObject } from "cloudflare:workers";
import { BASE } from "../base";
import { ADMIN_RE, CODE_RE, KEY_RE, makeAdminCode, makeCode } from "../engine/ids";
import { vancouverDay } from "../engine/time";
import { EventRoom, type ErrorCode, type Fail, type HostAction, type Meta, type Row, type Store } from "../room/event";
import { KEY_HEADER, type ApiError, type Claimed, type Created, type Hosted, type Push, type Saved, type Snapshot } from "../room/protocol";

export interface Env {
  ASSETS: Fetcher;
  EVENTS: DurableObjectNamespace<EventDO>;
  GATES: DurableObjectNamespace<GateDO>;
  /** local runs and tests only: "1" lifts the daily allowances below */
  ALLOW_TEST_SETTINGS?: string;
}

/** Gatherings one network may make in a day, and admin codes it may try. */
const MAKES_PER_DAY = 30;
const CLAIMS_PER_DAY = 20;
const BODY_MAX = 16_000;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const refuse = (error: ApiError["error"], status: number) => json({ error } satisfies ApiError, status);
const STATUS: Record<ErrorCode, number> = { gone: 404, exists: 409, bad: 400, name: 400, full: 409, forbidden: 403, locked: 429, wrong: 403 };
const failed = (f: Fail) => refuse(f.error, STATUS[f.error]);

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const adminHash = (salt: string, code: string) => sha256(`${salt}:${code}`);

/** The phone's key, fingerprinted; null when it sent none or one that isn't a key. */
async function keyOf(req: Request): Promise<string | null> {
  const key = req.headers.get(KEY_HEADER) ?? "";
  return KEY_RE.test(key) ? sha256(key) : null;
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > BODY_MAX) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** One more use of `kind` today from this network; false when today's are used up. Networks are told apart by address, kept only as a fingerprint. */
async function allowed(req: Request, env: Env, kind: string, limit: number): Promise<boolean> {
  if (env.ALLOW_TEST_SETTINGS === "1") return true;
  const network = await sha256(`when:${req.headers.get("cf-connecting-ip") ?? "local"}`);
  return env.GATES.get(env.GATES.idFromName(network)).take(kind, limit, vancouverDay(Date.now()));
}

/**
 * The page itself: never kept by a phone, and nothing on it may run but the site's own files and
 * one thing of Cloudflare's: the visitor statistics it adds to every page of changle.ca (Web
 * Analytics). That script comes from static.cloudflareinsights.com and reports to this site's own
 * /cdn-cgi/rum, or to cloudflareinsights.com when it was put in by hand. The inline bot check
 * Cloudflare also adds is still turned away.
 */
const PAGE_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com wss://changle.ca ws://127.0.0.1:* ws://localhost:*; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
};

async function page(req: Request, env: Env, url: URL, title: string | null, status: number): Promise<Response> {
  const file = await env.ASSETS.fetch(new Request(new URL(`${BASE}/`, url), { headers: req.headers }));
  const headers = new Headers(file.headers);
  for (const [name, value] of Object.entries(PAGE_HEADERS)) headers.set(name, value);
  const res = new Response(file.body, { status: file.ok ? status : file.status, headers });
  if (!title) return res;
  const named = `${title} · 约时间 When Works`;
  return new HTMLRewriter()
    .on("title", { element: (el) => void el.setInnerContent(named) })
    .on('meta[property="og:title"]', { element: (el) => void el.setAttribute("content", named) })
    .transform(res);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return new Response("not found", { status: 404 });
    const parts = url.pathname.slice(BASE.length).split("/").filter(Boolean);

    if (parts.length === 0) return page(req, env, url, null, 200);
    if (parts.length === 1 && CODE_RE.test(parts[0])) {
      const title = await env.EVENTS.get(env.EVENTS.idFromName(parts[0])).title();
      return page(req, env, url, title, title === null ? 404 : 200);
    }
    if (parts[0] !== "api") return env.ASSETS.fetch(req);

    // ---------- the API ----------
    const keyHash = await keyOf(req);

    if (parts.length === 2 && parts[1] === "events" && req.method === "POST") {
      if (!keyHash) return refuse("key", 400);
      const input = await body(req);
      if (!input) return refuse("bad", 400);
      if (!(await allowed(req, env, "make", MAKES_PER_DAY))) return refuse("limit", 429);
      const now = Date.now();
      const adminCode = makeAdminCode(rand);
      const salt = makeCode(rand, 16);
      const hashed = await adminHash(salt, adminCode);
      for (let tries = 0; tries < 5; tries++) {
        const code = makeCode(rand);
        const made = await env.EVENTS.get(env.EVENTS.idFromName(code)).create({ code, title: input.title, days: input.days, grain: input.grain, hostHash: keyHash, adminHash: hashed, adminSalt: salt, now, today: vancouverDay(now) });
        if (made.ok) return json({ code, adminCode, state: made.state } satisfies Created, 201);
        if (made.error !== "exists") return failed(made);
      }
      return refuse("bad", 500);
    }

    if (parts[1] !== "e" || !CODE_RE.test(parts[2] ?? "")) return refuse("notfound", 404);
    const stub = env.EVENTS.get(env.EVENTS.idFromName(parts[2]));
    const what = parts[3];

    if (parts.length === 3 && req.method === "GET") {
      const snap = await stub.snapshot(keyHash);
      return snap ? json(snap satisfies Snapshot) : refuse("notfound", 404);
    }
    if (parts.length === 4 && what === "ws" && req.method === "GET") {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host) return new Response("forbidden", { status: 403 });
      return stub.fetch(req);
    }
    if (parts.length !== 4 || req.method !== "POST") return refuse("notfound", 404);
    if (!keyHash) return refuse("key", 400);
    const input = await body(req);
    if (!input) return refuse("bad", 400);

    if (what === "me") {
      const saved = await stub.saveMine(keyHash, input);
      return saved.ok ? json({ id: saved.id, state: saved.state } satisfies Saved) : failed(saved);
    }
    if (what === "host") {
      const done = await stub.hostAct(keyHash, input as unknown as HostAction);
      return done.ok ? json({ state: done.state } satisfies Hosted) : failed(done);
    }
    if (what === "claim") {
      const code = typeof input.adminCode === "string" ? input.adminCode.trim() : "";
      if (!ADMIN_RE.test(code)) return refuse("wrong", 403);
      if (!(await allowed(req, env, "claim", CLAIMS_PER_DAY))) return refuse("limit", 429);
      const claimed = await stub.claim(keyHash, code);
      return claimed.ok ? json({ host: true } satisfies Claimed) : failed(claimed);
    }
    return refuse("notfound", 404);
  },
} satisfies ExportedHandler<Env>;

/** The room's store, in the Durable Object's own SQLite. Nothing is written for a gathering nobody made. */
function sqlStore(sql: SqlStorage): Store {
  const has = () => sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray().length > 0;
  const ready = () => {
    sql.exec("CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, joined INTEGER NOT NULL, json TEXT NOT NULL)");
  };
  return {
    load() {
      if (!has()) return { meta: null, rows: [] };
      const meta = sql.exec("SELECT json FROM meta WHERE id = 1").toArray()[0];
      const rows = sql.exec("SELECT json FROM people ORDER BY joined, id").toArray();
      return { meta: meta ? (JSON.parse(meta.json as string) as Meta) : null, rows: rows.map((r) => JSON.parse(r.json as string) as Row) };
    },
    saveMeta(meta) {
      ready();
      sql.exec("INSERT INTO meta (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json", JSON.stringify(meta));
    },
    saveRow(row) {
      ready();
      sql.exec("INSERT INTO people (id, joined, json) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json", row.id, row.joinedAt, JSON.stringify(row));
    },
    deleteRow(id) {
      if (has()) sql.exec("DELETE FROM people WHERE id = ?", id);
    },
    wipe() {
      sql.exec("DROP TABLE IF EXISTS people");
      sql.exec("DROP TABLE IF EXISTS meta");
    },
  };
}

type WithState<T = object> = { ok: true; state: NonNullable<ReturnType<EventRoom["state"]>> } & T;

/** One gathering. */
export class EventDO extends DurableObject<Env> {
  private room: EventRoom;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = new EventRoom(sqlStore(ctx.storage.sql));
  }

  /** Its 60 days are up (the alarm can be a little late): gone already, as far as anyone can tell. */
  private async live(): Promise<boolean> {
    const until = this.room.expiresAt;
    if (until === null) return false;
    if (Date.now() < until) return true;
    await this.end();
    return false;
  }

  private async end(): Promise<void> {
    this.tell({ t: "gone" });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "gone");
      } catch {
        // already closed
      }
    }
    this.room.wipe();
    await this.ctx.storage.deleteAll();
  }

  private tell(push: Push): void {
    const text = JSON.stringify(push);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // a phone that just left
      }
    }
  }

  private changed(): NonNullable<ReturnType<EventRoom["state"]>> {
    const state = this.room.state()!;
    this.tell({ t: "state", state });
    return state;
  }

  async title(): Promise<string | null> {
    return (await this.live()) ? this.room.title : null;
  }

  async create(input: Parameters<EventRoom["create"]>[0]): Promise<WithState | Fail> {
    const made = this.room.create(input);
    if (!made.ok) return made;
    await this.ctx.storage.setAlarm(this.room.expiresAt!);
    return { ok: true, state: this.room.state()! };
  }

  async snapshot(keyHash: string | null): Promise<Snapshot | null> {
    if (!(await this.live())) return null;
    return { state: this.room.state()!, host: this.room.isHost(keyHash), me: this.room.rowOf(keyHash) };
  }

  async saveMine(keyHash: string, input: Record<string, unknown>): Promise<WithState<{ id: string }> | Fail> {
    if (!(await this.live())) return { ok: false, error: "gone" };
    const saved = this.room.saveMine({ id: input.id, keyHash, newId: () => makeCode(rand, 10), name: input.name, answers: input.answers, now: Date.now() });
    return saved.ok ? { ok: true, id: saved.id, state: this.changed() } : saved;
  }

  async hostAct(keyHash: string, action: HostAction): Promise<WithState | Fail> {
    if (!(await this.live())) return { ok: false, error: "gone" };
    const done = this.room.hostAct(keyHash, action, Date.now());
    return done.ok ? { ok: true, state: this.changed() } : done;
  }

  async claim(keyHash: string, code: string): Promise<{ ok: true } | Fail> {
    if (!(await this.live())) return { ok: false, error: "gone" };
    const now = Date.now();
    const salt = this.room.adminSalt(now);
    if (!salt.ok) return salt;
    return this.room.claim({ adminHash: await adminHash(salt.salt, code), keyHash, now });
  }

  /** The live feed: a phone listens here and is sent the gathering whenever it changes. */
  async fetch(_req: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    const state = (await this.live()) ? this.room.state() : null;
    // a phone's keep-alive is answered without waking the room (set only for a gathering that
    // exists, so a made-up address leaves nothing behind)
    if (state) this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify(state ? ({ t: "state", state } satisfies Push) : ({ t: "gone" } satisfies Push)));
    if (!state) server.close(1000, "gone");
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(): Promise<void> {
    // phones only listen; "ping" is answered before it gets here
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

  async alarm(): Promise<void> {
    const until = this.room.expiresAt;
    if (until === null) return;
    if (Date.now() >= until) await this.end();
    else await this.ctx.storage.setAlarm(until);
  }
}

/** One network's daily allowances (gatherings made, admin codes tried). Forgets everything two days after its last use. */
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
