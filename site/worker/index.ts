/**
 * 开席 rooms: one Durable Object per table. It holds the authoritative game state,
 * hands each phone only what that phone may see, and survives phones locking or dropping.
 */
import { DurableObject } from "cloudflare:workers";
import { freshRoom, RoomEngine, type Output, type Profile, type RoomData } from "../src/shared/engine/room";
import { CODE_RE, type ClientMsg, type ServerMsg } from "../src/shared/protocol";
import { drawPicture, drawReady } from "./draw";
import { Hub, type Reply } from "./hub";
import { cleanChoices, drawPrompt } from "../src/shared/draw";

export { Hub };

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  HUB: DurableObjectNamespace<Hub>;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  ADMIN_EMAILS?: string;
  DEV_SHOW_CODES?: string;
  /** Google AI key for drawing anime avatars (a secret: set-ai-key.cmd) */
  GEMINI_API_KEY?: string;
  GEMINI_IMAGE_MODEL?: string;
  /** local runs without a key: "drawing" answers with the picture it was sent */
  DEV_FAKE_DRAW?: string;
}

/** `screen`: a TV or computer showing the table, with no seat at it */
type Attachment = { pid: string; screen?: boolean };

const IDLE_FORGET = 8 * 60 * 60 * 1000; // a table nobody has touched for eight hours is cleared
const IDLE_RECHECK = 30 * 60 * 1000; // past that, while someone is still connected, check every half hour
const ORIGINS = [
  /^https:\/\/(www\.)?changle\.ca$/,
  /^https:\/\/([a-z0-9-]+\.)?changle-ets\.pages\.dev$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

function originOk(req: Request) {
  const o = req.headers.get("Origin");
  if (!o) return true; // non-browser health checks
  return ORIGINS.some((r) => r.test(o));
}

function cors(res: Response, req: Request, cache = "no-store") {
  const h = new Headers(res.headers);
  const o = req.headers.get("Origin");
  if (o && ORIGINS.some((r) => r.test(o))) {
    h.set("Access-Control-Allow-Origin", o);
    h.set("Vary", "Origin");
  }
  h.set("Cache-Control", cache);
  return new Response(res.body, { status: res.status, headers: h });
}

const json = (data: unknown, status = 200) => Response.json(data, { status });

/* ---------------- exchange rates ---------------- */

type Fx = { rates: Record<string, number>; at: number; source: string };
const KEEP = ["USD", "CAD", "CNY", "HKD", "EUR", "GBP", "JPY", "AUD", "TWD", "KRW", "SGD"];

async function fetchRates(): Promise<Fx> {
  const pick = (r: Record<string, unknown>) => {
    const out: Record<string, number> = {};
    for (const k of KEEP) {
      const v = Number(r[k]);
      if (Number.isFinite(v) && v > 0) out[k] = v;
    }
    out.USD = 1;
    if (!out.CAD || !out.CNY || !out.HKD) throw new Error("missing");
    return out;
  };
  try {
    const r = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=USD", { headers: { Accept: "application/json" } });
    const d = (await r.json()) as { data?: { rates?: Record<string, unknown> } };
    return { rates: pick(d.data?.rates ?? {}), at: Date.now(), source: "coinbase" };
  } catch {
    /* next source */
  }
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = (await r.json()) as { rates?: Record<string, unknown>; time_last_update_unix?: number };
    return { rates: pick(d.rates ?? {}), at: (d.time_last_update_unix ?? Date.now() / 1000) * 1000, source: "open.er-api.com" };
  } catch {
    /* next source */
  }
  const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD");
  const d = (await r.json()) as { rates?: Record<string, unknown> };
  return { rates: pick(d.rates ?? {}), at: Date.now(), source: "frankfurter" };
}

async function fx(req: Request, ctx: ExecutionContext) {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request("https://rooms.changle.ca/__fx/v1");
  const hit = await cache.match(key);
  if (hit) return cors(hit, req, "public, max-age=30");
  try {
    const data = await fetchRates();
    const res = new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return cors(res, req, "public, max-age=30");
  } catch {
    return cors(json({ error: "unavailable" }, 503), req);
  }
}

/* ---------------- the API ---------------- */

async function api(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, "");
  if (path === "/fx" && req.method === "GET") return fx(req, ctx);
  const hub = env.HUB.get(env.HUB.idFromName("hub"));
  if (path === "/live") {
    if (!originOk(req)) return new Response("forbidden", { status: 403 });
    return hub.fetch(req);
  }
  if (req.method !== "GET" && !originOk(req)) return new Response("forbidden", { status: 403 });
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const type = req.headers.get("Content-Type") ?? "";
  // (the largest body is a photo for drawing, as base64: about 1 MB)
  if (Number(req.headers.get("Content-Length") ?? 0) > 1_500_000) return cors(json({ error: "size" }, 413), req);
  if (path === "/avatar/draw" && req.method === "POST") return cors(await drawAvatar(req, env, hub, token), req);
  let body: unknown = undefined;
  let bytes: ArrayBuffer | undefined;
  if (req.method === "GET") body = Object.fromEntries(url.searchParams);
  else if (type.startsWith("image/")) {
    const len = Number(req.headers.get("Content-Length") ?? 0);
    if (len > 450_000) return cors(json({ error: "size" }, 413), req);
    bytes = await req.arrayBuffer();
    if (bytes.byteLength > 450_000) return cors(json({ error: "size" }, 413), req);
  } else {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }
  const r = (await hub.call({
    method: req.method,
    path,
    token,
    device: (req.headers.get("X-Device") ?? "").slice(0, 48),
    ip: req.headers.get("CF-Connecting-IP") ?? "",
    body,
    bytes,
    type,
  })) as unknown as Reply;
  if (r.bytes) return cors(new Response(r.bytes, { status: r.status, headers: { "Content-Type": r.type ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" } }), req, r.cache ?? "no-store");
  return cors(json(r.json ?? {}, r.status), req);
}

/**
 * POST /api/avatar/draw: { image (base64), mime, from: "photo" | "figure", choices, ticket? }.
 * The hub says whether this person may draw again today; the picture goes to the image model with
 * words built only from the choice lists, and the drawing comes straight back. Nothing is kept.
 */
async function drawAvatar(req: Request, env: Env, hub: DurableObjectStub<Hub>, token: string): Promise<Response> {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "bad" }, 400);
  }
  const image = typeof b.image === "string" ? b.image : "";
  const mime = typeof b.mime === "string" && /^image\/(jpeg|png|webp)$/.test(b.mime) ? b.mime : "";
  if (!image || !mime || image.length > 1_400_000 || !/^[A-Za-z0-9+/]+=*$/.test(image)) return json({ error: "size" }, 400);
  if (!drawReady(env)) return json({ error: "not-ready" }, 503);
  const ip = req.headers.get("CF-Connecting-IP") ?? "";
  const gate = await hub.drawGate({ token, ticket: typeof b.ticket === "string" ? b.ticket : "", ip });
  if ("error" in gate) return json({ error: gate.error }, gate.error === "signin" ? 401 : 429);
  const from = b.from === "figure" ? "figure" : "photo";
  const r = await drawPicture(env, { mime, b64: image }, drawPrompt(cleanChoices(b.choices), from));
  if (!r.ok) {
    // (a refusal still counts: the same photo would be refused again)
    if (r.code !== "blocked") await hub.drawRefund({ key: gate.key, ip });
    console.log("draw failed", r.code, r.detail ?? "");
    return json({ error: r.code, left: gate.left + (r.code === "blocked" ? 0 : 1) }, r.code === "blocked" ? 422 : 502);
  }
  return json({ image: r.pic.b64, mime: r.pic.mime, left: gate.left });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return cors(
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device",
            "Access-Control-Max-Age": "86400",
          },
        }),
        req,
      );
    }
    if (url.pathname.startsWith("/api/")) return api(req, env, ctx, url);
    if (url.pathname === "/" || url.pathname === "/health") return cors(new Response("changle rooms ok"), req);
    const m = /^\/room\/([A-Za-z0-9]{4})\/(ws|info)$/.exec(url.pathname);
    if (!m) return cors(new Response("not found", { status: 404 }), req);
    if (!originOk(req)) return new Response("forbidden", { status: 403 });
    const code = m[1].toUpperCase();
    if (!CODE_RE.test(code)) return cors(new Response("bad code", { status: 400 }), req);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const inner = new URL(req.url);
    inner.searchParams.set("code", code);
    const res = await stub.fetch(new Request(inner.toString(), req));
    return m[2] === "ws" ? res : cors(res, req);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  private engine: RoomEngine | null = null;

  private async load(code?: string): Promise<RoomEngine> {
    if (this.engine) return this.engine;
    const data = (await this.ctx.storage.get<RoomData>("room")) ?? freshRoom(code ?? "", Date.now());
    if (!data.code && code) data.code = code;
    if (!data.strokes) data.strokes = (await this.ctx.storage.get("strokes")) ?? [];
    // after a cold start, presence comes from the sockets that are actually still open
    const socks = this.sockets();
    const live = new Set(socks.filter((s) => !s.screen).map((s) => s.pid));
    for (const seat of data.seats) seat.on = live.has(seat.id);
    data.screens = socks.filter((s) => s.screen).length;
    this.engine = new RoomEngine(data, { now: () => Date.now(), rand: () => Math.random() });
    return this.engine;
  }

  private sockets() {
    const out: { ws: WebSocket; pid: string; screen: boolean }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.pid) out.push({ ws, pid: a.pid, screen: !!a.screen });
    }
    return out;
  }

  private screenCount(except?: WebSocket) {
    return this.sockets().filter((s) => s.screen && s.ws !== except).length;
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already gone */
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get("code") ?? "";
    const engine = await this.load(code);
    if (req.headers.get("Upgrade") !== "websocket") return Response.json(engine.info());
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: "" } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 32_000) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    const engine = await this.load();
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { pid: "" };

    if (msg.t === "ping") {
      this.send(ws, { t: "pong", c: Number(msg.c) || 0, s: Date.now() });
      return;
    }

    if (msg.t === "hello") {
      const pid = String(msg.pid ?? "").slice(0, 48);
      let who: Profile | null = null;
      if (typeof msg.auth === "string" && msg.auth) {
        try {
          who = await this.env.HUB.get(this.env.HUB.idFromName("hub")).whoami(msg.auth);
        } catch {
          who = null;
        }
      }
      const screen = msg.screen === true;
      const err = screen ? engine.screenHello(pid, !!msg.create, typeof msg.game === "string" ? msg.game : undefined) : engine.hello(pid, String(msg.name ?? ""), !!msg.create, who);
      if (err) {
        this.send(ws, { t: "error", code: err });
        try {
          ws.close(4004, err);
        } catch {
          /* gone */
        }
        engine.flush();
        return;
      }
      ws.serializeAttachment({ pid, screen } satisfies Attachment);
      // one socket per phone (or screen): an older one for the same id is retired
      for (const s of this.sockets()) if (s.pid === pid && s.ws !== ws) {
        try {
          s.ws.serializeAttachment({ pid: "" } satisfies Attachment);
          s.ws.close(4000, "replaced");
        } catch {
          /* gone */
        }
      }
      engine.setScreens(this.screenCount());
      await this.commit(engine.flush());
      this.send(ws, { t: "strokes", list: engine.d.strokes });
      return;
    }

    // a big screen only watches
    if (!att.pid || att.screen) return;
    if (msg.t === "act") {
      engine.act(att.pid, msg.a);
      await this.commit(engine.flush());
      return;
    }
    if (msg.t === "stroke") {
      engine.stroke(att.pid, msg.op);
      await this.commit(engine.flush());
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    await this.drop(ws, code);
  }

  async webSocketError(ws: WebSocket) {
    await this.drop(ws, 1011);
  }

  private async drop(ws: WebSocket, code: number) {
    const att = ws.deserializeAttachment() as Attachment | null;
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* already closed */
    }
    if (!att?.pid) return;
    const engine = await this.load();
    if (att.screen) {
      engine.setScreens(this.screenCount(ws));
      await this.commit(engine.flush());
      return;
    }
    if (this.sockets().some((s) => s.pid === att.pid && s.ws !== ws)) return;
    engine.setOnline(att.pid, false);
    await this.commit(engine.flush());
  }

  async alarm() {
    const engine = await this.load();
    engine.due();
    const out = engine.flush();
    const idle = Date.now() - engine.d.touched > IDLE_FORGET && engine.onlineCount() === 0 && !(engine.d.screens ?? 0);
    if (idle && !out.changed) {
      await this.ctx.storage.deleteAll();
      this.engine = null;
      return;
    }
    await this.commit(out);
  }

  /** Persist, broadcast, relay, and re-arm the alarm after any change. */
  private async commit(out: Output) {
    const engine = this.engine;
    if (!engine) return;
    if (out.records.length) {
      const hub = this.env.HUB.get(this.env.HUB.idFromName("hub"));
      for (const rec of out.records) {
        try {
          await hub.recordGame(rec);
        } catch (e) {
          console.error("record", e);
        }
      }
    }
    if (out.changed || out.persist) await this.ctx.storage.put("room", engine.d);

    const socks = this.sockets();
    if (out.kicked.length) {
      for (const s of socks) if (out.kicked.includes(s.pid)) {
        this.send(s.ws, { t: "error", code: "kicked" });
        try {
          s.ws.serializeAttachment({ pid: "" } satisfies Attachment);
          s.ws.close(4001, "kicked");
        } catch {
          /* gone */
        }
      }
    }
    const live = socks.filter((s) => !out.kicked.includes(s.pid));
    const now = Date.now();
    if (out.changed) for (const s of live) this.send(s.ws, { t: "room", room: engine.view(s.pid), now });
    for (const e of out.events) {
      const msg: ServerMsg = { t: "event", e, now };
      for (const s of live) this.send(s.ws, msg);
    }
    for (const r of out.relay) {
      const msg: ServerMsg = { t: "stroke", op: r.op };
      for (const s of live) if (s.pid !== r.from) this.send(s.ws, msg);
    }
    if (out.strokesReset) for (const s of live) this.send(s.ws, { t: "strokes", list: [] });

    const next = engine.nextAlarm();
    let forget = engine.d.touched + IDLE_FORGET;
    // someone is still here (a phone, or a TV left on overnight): look again later instead of
    // re-arming the alarm in the past, which would fire it over and over
    if (forget <= Date.now()) forget = Date.now() + IDLE_RECHECK;
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 50, Math.min(next ?? forget, forget)));
  }
}
