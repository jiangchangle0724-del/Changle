// Cloudflare Worker: the online server for 到此一游, one of changle.ca's games. It answers on
// changle.ca/trip (a route on the changle.ca zone); everything below is under /trip.
//
//   POST /api/rooms               → { code }        new room with a free 4-digit code; a changle.ca
//                                                   table sends { host, table } (see Opening)
//   GET  /api/rooms/:code         → { exists, ... } check a code before joining
//   GET  /api/rooms/:code/ws      → WebSocket       play (cid, key, name, lang, role in the query)
//   POST /api/saves/:save/load    → { code }        continue a saved game in a new room
//   GET  /api/weather             → { at, cities }  the weather right now in each city (15-minute cache)
//   GET  /api/trivia-sources      → { cities }      the quiz questions' sources by city (the credits page)
//   /r/:code, /tv/:code           → the game's page (phone, big screen)
//   /demo                         → one phone playing every human team (no server)
//   anything else                 → the game's files (static assets in dist/client/trip)
//
// The old address on workers.dev sends everyone to changle.ca/trip.
//
// Each room is one Durable Object: the single source of truth for that game. It saves itself after
// every change, so a phone that drops (or a server restart) never loses the game.
import { DurableObject } from "cloudflare:workers";
import { COORDS } from "../client/art/coords";
import type { ClientMsg, Settings } from "../room/protocol";
import { Room, type Opening, type RoomEnv, type RoomState, type SaveFile } from "../room/room";
import { triviaSources } from "../room/trivia";
import { WEATHER_TTL, parseWeather, weatherUrl, type WeatherReport } from "../room/weather";

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  SAVES: DurableObjectNamespace<SaveVault>;
  ASSETS: Fetcher;
  /** "1" only for local tests: lets a new room use faster timings. */
  ALLOW_TEST_SETTINGS?: string;
  /** "1" on a computer running the game by itself (npm run dev, the browser tests): keeps the game's own start page. */
  STANDALONE?: string;
}

const BASE = "/trip";
const SAVE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SAVE_DAYS = 90;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const randomUnit = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const roomCode = () => String(1000 + Math.floor(randomUnit() * 9000));
const saveCode = () => Array.from({ length: 6 }, () => SAVE_ALPHABET[Math.floor(randomUnit() * SAVE_ALPHABET.length)]).join("");

// The weather: kept in this isolate's memory and in Cloudflare's cache (which works on changle.ca,
// not on workers.dev), so Open-Meteo hears from the game about once every 15 minutes.
let weatherMemo: { report: WeatherReport; until: number } | null = null;
const WEATHER_CACHE_KEY = "https://been-there.cache/weather-v1";
// (The DOM types, which the pages share, don't know Cloudflare's default cache.)
const edgeCache = () => (caches as unknown as { default: Cache }).default;

async function weather(ctx: ExecutionContext): Promise<Response> {
  const now = Date.now();
  const reply = (report: WeatherReport, ttl: number) =>
    new Response(JSON.stringify(report), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${Math.max(1, Math.round(ttl / 1000))}` },
    });
  if (weatherMemo && now < weatherMemo.until) return reply(weatherMemo.report, weatherMemo.until - now);
  const hit = await edgeCache().match(WEATHER_CACHE_KEY).catch(() => undefined);
  if (hit) return hit;
  let report: WeatherReport = { at: now, cities: {} };
  try {
    const res = await fetch(weatherUrl(COORDS), { signal: AbortSignal.timeout(5000) });
    if (res.ok) report = parseWeather(await res.json(), Object.keys(COORDS), now);
  } catch {
    // No weather this time; the pages simply don't show it.
  }
  // An empty answer is asked again in a minute rather than kept for 15.
  const ttl = Object.keys(report.cities).length ? WEATHER_TTL : 60_000;
  weatherMemo = { report, until: now + ttl };
  const res = reply(report, ttl);
  ctx.waitUntil(edgeCache().put(WEATHER_CACHE_KEY, res.clone()).catch(() => {}));
  return res;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // The game had its own address on workers.dev; it is one of changle.ca's games now.
    if (url.hostname.endsWith(".workers.dev")) {
      const rest = url.pathname === BASE || url.pathname.startsWith(`${BASE}/`) ? url.pathname.slice(BASE.length) : url.pathname;
      return Response.redirect(`https://changle.ca${BASE}${rest || "/"}${url.search}`, 301);
    }
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return Response.redirect(new URL(`${BASE}/`, url).toString(), 302);
    const path = url.pathname.slice(BASE.length) || "/";
    // On changle.ca a game starts from a table, so the game's own start page and a bare /tv lead to
    // the game's card and to changle.ca's big screen. (A computer running the game by itself keeps them.)
    if (env.STANDALONE !== "1") {
      if (path === "/") return Response.redirect(new URL("/#/g/trip", url).toString(), 302);
      if (/^\/tv\/?$/.test(path)) return Response.redirect(new URL("/tv", url).toString(), 302);
    }
    // Room and big-screen links (and the start page) are the app's page. Serve it for them directly
    // rather than relying on the browser sending Sec-Fetch-Mode (older iPhones don't), so a scanned
    // QR code always opens. (The file is app.html, served at /trip/app.)
    if (path === "/" || /^\/(r\/\d{4}|tv(\/\d{4})?)\/?$/.test(path)) return env.ASSETS.fetch(new Request(new URL(`${BASE}/app`, url), req));
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "api") return env.ASSETS.fetch(req);

    if (parts[1] === "rooms" && parts.length === 2 && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Partial<Settings> & Opening & { test?: { speed?: number; testRounds?: number; dice?: unknown } };
      const settings: Partial<Settings> = {};
      if (body.mode === "target" || body.mode === 15 || body.mode === 60) settings.mode = body.mode;
      if (env.ALLOW_TEST_SETTINGS === "1" && body.test) {
        if (typeof body.test.speed === "number") settings.speed = Math.min(1, Math.max(0.01, body.test.speed));
        if (typeof body.test.testRounds === "number") settings.testRounds = Math.max(1, Math.round(body.test.testRounds));
        if (Array.isArray(body.test.dice)) settings.dice = body.test.dice.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 6).slice(0, 40);
      }
      for (let i = 0; i < 40; i++) {
        const code = roomCode();
        if (await env.ROOMS.get(env.ROOMS.idFromName(code)).init(code, settings, { host: body.host, table: body.table })) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }

    const code = parts[2];
    if (parts[1] === "rooms" && code && /^\d{4}$/.test(code)) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (parts.length === 3 && req.method === "GET") return json(await stub.info());
      if (parts[3] === "ws") {
        // Header values are case-insensitive ("websocket" / "WebSocket" both appear in the wild).
        if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
        return stub.fetch(req);
      }
    }

    if (parts[1] === "weather" && parts.length === 2 && req.method === "GET") return weather(ctx);
    if (parts[1] === "trivia-sources" && parts.length === 2 && req.method === "GET") return json({ cities: triviaSources() });

    if (parts[1] === "saves" && parts[3] === "load" && req.method === "POST") {
      const save = (parts[2] ?? "").toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(save)) return json({ error: "badCode" }, 400);
      const file = await env.SAVES.get(env.SAVES.idFromName(save)).load();
      if (!file) return json({ error: "noSave" }, 404);
      const opening = (await req.json().catch(() => ({}))) as Opening;
      for (let i = 0; i < 40; i++) {
        const code = roomCode();
        if (await env.ROOMS.get(env.ROOMS.idFromName(code)).restore(code, file, { host: opening.host, table: opening.table })) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }

    return json({ error: "notFound" }, 404);
  },
} satisfies ExportedHandler<Env>;

interface Attachment {
  id: string;
}

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private readonly roomEnv: RoomEnv = { now: () => Date.now(), random: randomUnit };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const st = await ctx.storage.get<RoomState>("room");
      if (!st) return;
      this.room = new Room(st, this.roomEnv);
      // Woken from hibernation or restarted: recount who is actually connected.
      this.room.presence(ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() as Attachment).id));
    });
  }

  /** Claim this code for a new room. False if a live room already has it. */
  async init(code: string, settings: Partial<Settings>, opening: Opening = {}): Promise<boolean> {
    if (this.room && !this.room.expired()) return false;
    this.room = Room.create(code, this.roomEnv, settings, opening);
    await this.commit();
    return true;
  }

  /** Claim this code for a saved game. */
  async restore(code: string, file: SaveFile, opening: Opening = {}): Promise<boolean> {
    if (this.room && !this.room.expired()) return false;
    this.room = Room.fromSave(code, file, this.roomEnv, opening);
    await this.commit();
    return true;
  }

  async info() {
    const r = this.room;
    if (!r || r.expired()) return { exists: false };
    const st = r.st;
    return {
      exists: true,
      phase: !st.game ? "lobby" : st.game.s.over ? "over" : "playing",
      teams: st.teams.length,
      players: Object.values(st.members).filter((m) => m.role === "player").length,
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const q = url.searchParams;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    if (!this.room || this.room.expired()) {
      server.send(JSON.stringify({ t: "fatal", key: "noRoom" }));
      server.close(4004, "no room");
      return new Response(null, { status: 101, webSocket: client });
    }
    const id = q.get("cid") ?? "";
    const role = q.get("role") === "screen" ? "screen" : "player";
    const lang = q.get("lang") === "en" ? "en" : "zh";
    if (!this.room.join(id, q.get("key") ?? "", { name: q.get("name") ?? undefined, lang, role })) {
      server.send(JSON.stringify({ t: "fatal", key: "identity" }));
      server.close(4003, "identity");
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ id } satisfies Attachment);
    await this.commit();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!this.room || !att || typeof message !== "string" || message.length > 8192) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    this.room.handle(att.id, msg);
    await this.commit();
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.drop(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // already closed
    }
    await this.commit();
  }

  async webSocketError(ws: WebSocket) {
    this.drop(ws);
    await this.commit();
  }

  private drop(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (this.room && att) this.room.leave(att.id);
    ws.serializeAttachment(null);
  }

  async alarm() {
    if (!this.room) return;
    this.room.tick();
    if (this.room.expired()) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.commit();
  }

  /** Persist, tell everyone, and set the next wake-up. */
  private async commit() {
    const room = this.room;
    if (!room) return;
    const out = room.flush();
    const sockets = this.ctx.getWebSockets();
    const of = (ws: WebSocket) => (ws.deserializeAttachment() as Attachment | null)?.id;
    for (const [id, msg] of out.direct) for (const ws of sockets) if (of(ws) === id) ws.send(JSON.stringify(msg));
    if (out.save) {
      const code = await this.storeSave(out.save.file);
      for (const ws of sockets) if (of(ws) === out.save.member) ws.send(JSON.stringify(code ? { t: "saved", code } : { t: "toast", key: "saveFailed" }));
    }
    if (out.changed) {
      await this.ctx.storage.put("room", room.st);
      for (const ws of sockets) {
        const id = of(ws);
        if (!id) continue;
        try {
          ws.send(JSON.stringify({ t: "view", view: room.view(id) }));
        } catch {
          // socket closing; its close handler will tidy up
        }
      }
    }
    const wake = room.nextWake();
    if (wake !== null) await this.ctx.storage.setAlarm(Math.max(wake, Date.now() + 5));
  }

  private async storeSave(file: SaveFile): Promise<string | null> {
    for (let i = 0; i < 10; i++) {
      const code = saveCode();
      if (await this.env.SAVES.get(this.env.SAVES.idFromName(code)).store(file)) return code;
    }
    return null;
  }
}

/** Keeps one saved game for 90 days, addressed by its 6-letter code. */
export class SaveVault extends DurableObject<Env> {
  async store(file: SaveFile): Promise<boolean> {
    if (await this.ctx.storage.get("file")) return false;
    await this.ctx.storage.put("file", file);
    await this.ctx.storage.setAlarm(Date.now() + SAVE_DAYS * 24 * 3600_000);
    return true;
  }

  async load(): Promise<SaveFile | null> {
    return (await this.ctx.storage.get<SaveFile>("file")) ?? null;
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
