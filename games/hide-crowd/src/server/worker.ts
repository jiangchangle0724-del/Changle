// Cloudflare Worker: the online server for 藏在人群里 · Hide in the Crowd, one of changle.ca's games.
// It answers on changle.ca/hide (routes on the changle.ca zone, in wrangler.jsonc); everything below
// is under /hide.
//
//   POST /api/rooms            → { code }        a new room with a free 4-digit code; a changle.ca
//                                                table sends { host, table, penalty } (see Opening)
//   GET  /api/rooms/:code      → { exists, ... } check a code before joining
//   GET  /api/rooms/:code/ws   → WebSocket       play (cid, name, lang, role in the query)
//   /r/:code, /tv/:code        → the game's page (a phone, the big screen)
//   /practice, /credits        → the same page: one phone against the crowd, and where the art comes from
//   anything else              → the game's files (dist/client/hide)
//
// Each room is one Durable Object. While a round is on it moves the crowd 20 times a second in
// memory and sends every screen the new frame; it stores the room only when something worth keeping
// changes (someone joins, a vote, a tag, the end of a round), so a round costs a few dozen writes, not
// a write per frame. An alarm every few seconds keeps the round going if the object was restarted.
import { DurableObject } from "cloudflare:workers";
import { SIMULATION_STEP_MS } from "../engine";
import type { ClientMsg, Lang, Role } from "../room/protocol";
import { Room, type Opening, type RoomState, type TestSettings } from "../room/room";

export interface Env {
  ROOMS: DurableObjectNamespace<HideRoom>;
  ASSETS: Fetcher;
  /** "1" on a computer running the game by itself (npm run dev, the browser tests): keeps the game's own start page */
  STANDALONE?: string;
  /** "1" only for the browser tests: a new room may ask for a short round and a face-to-face start */
  ALLOW_TEST_SETTINGS?: string;
}

interface Attachment {
  id: string;
  role: Role;
}

const BASE = "/hide";
/** the game's card on changle.ca */
const CARD = "/g/hide-in-the-crowd";
const WATCHDOG_MS = 5_000;
const ROOM_KEY = "room";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const randomUnit = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const roomCode = () => String(1000 + Math.floor(randomUnit() * 9000));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return Response.redirect(new URL(`${BASE}/`, url).toString(), 302);
    const path = url.pathname.slice(BASE.length) || "/";
    // On changle.ca a game starts from a table: the bare /hide leads to the game's card, and /hide/tv
    // to changle.ca's big screen. (A computer running the game by itself keeps its own start page.)
    if (env.STANDALONE !== "1") {
      if (path === "/") return Response.redirect(new URL(CARD, url).toString(), 302);
      if (/^\/tv\/?$/.test(path)) return Response.redirect(new URL("/tv", url).toString(), 302);
    }
    // The page itself, for every address that is the game (served directly: older iPhones don't send
    // Sec-Fetch-Mode, and a scanned link must always open).
    if (path === "/" || /^\/(r\/\d{4}|tv\/\d{4}|practice|credits)\/?$/.test(path)) {
      const page = await env.ASSETS.fetch(new Request(new URL(`${BASE}/app`, url), req));
      const headers = new Headers(page.headers);
      headers.set("cache-control", "no-cache");
      return new Response(page.body, { status: page.status, headers });
    }
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "api") return env.ASSETS.fetch(req);

    if (parts[1] === "rooms" && parts.length === 2 && req.method === "POST") {
      const opening = (await req.json().catch(() => ({}))) as Opening & { test?: { roundMs?: unknown; duel?: unknown; stall?: unknown } };
      let test: TestSettings | undefined;
      if (env.ALLOW_TEST_SETTINGS === "1" && opening.test && typeof opening.test === "object") {
        const roundMs = Number(opening.test.roundMs);
        const stall = opening.test.stall;
        test = {
          ...(roundMs >= 1_000 && roundMs <= 600_000 ? { roundMs } : {}),
          ...(opening.test.duel === true ? { duel: true } : {}),
          ...(typeof stall === "number" && Number.isInteger(stall) && stall >= 0 && stall < 4 ? { stall } : {})
        };
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        const code = roomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        if (await stub.init(code, { host: opening.host, table: opening.table, penalty: opening.penalty }, test)) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }

    if (parts[1] === "rooms" && parts[2] && /^\d{4}$/.test(parts[2])) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(parts[2]));
      if (parts.length === 3 && req.method === "GET") return json(await stub.info());
      if (parts[3] === "ws") {
        if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
        return stub.fetch(req);
      }
    }
    return json({ error: "notFound" }, 404);
  }
} satisfies ExportedHandler<Env>;

export class HideRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomState>(ROOM_KEY);
      if (!saved) return;
      this.room = new Room(saved);
      // woken from hibernation, or restarted: count who is actually connected
      this.room.presenceFromSockets(this.connectedIds(), Date.now());
      if (this.room.playing) this.startLoop();
    });
  }

  private connectedIds(): string[] {
    return this.ctx
      .getWebSockets()
      .map((socket) => (socket.deserializeAttachment() as Attachment | null)?.id)
      .filter((id): id is string => typeof id === "string");
  }

  /** Claim this code for a new room. False if a live room already has it. */
  async init(code: string, opening: Opening, test?: TestSettings): Promise<boolean> {
    if (this.room && !this.room.expired(Date.now())) return false;
    this.stopLoop();
    this.room = Room.create(code, Date.now(), Math.floor(randomUnit() * 0x7fffffff), opening, test);
    await this.commit();
    return true;
  }

  async info() {
    return this.room?.info(Date.now()) ?? { exists: false };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const id = url.searchParams.get("cid") ?? "";
    const role: Role = url.searchParams.get("role") === "screen" ? "screen" : "player";
    const lang: Lang = url.searchParams.get("lang") === "en" ? "en" : "zh";
    const name = url.searchParams.get("name") ?? "";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const joined = this.room ? this.room.join(id, name, lang, role, Date.now()) : "noRoom";
    if (joined !== "ok") {
      server.send(JSON.stringify({ t: "fatal", key: joined }));
      server.close(4004, "room unavailable");
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ id, role } satisfies Attachment);
    await this.commit();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (!this.room || !attachment || typeof data !== "string" || data.length > 2_048) return;
    let message: ClientMsg;
    try {
      message = JSON.parse(data) as ClientMsg;
    } catch {
      return;
    }
    if (!message || typeof message !== "object" || typeof message.t !== "string") return;
    if (message.t === "ping") {
      socket.send(JSON.stringify({ t: "pong", now: Date.now() }));
      return;
    }
    const wasPlaying = this.room.playing;
    this.room.handle(attachment.id, message, Date.now());
    // a held stick: the next frame carries it
    if (message.t === "move") return;
    if (this.room.playing && !wasPlaying) this.startLoop();
    // during a round the frames carry everything (punches too); the rest is said now
    if (this.room.playing && (message.t === "punch" || message.t === "blend")) {
      if (this.room.takeDirty()) await this.store();
      return;
    }
    await this.commit();
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    this.drop(socket);
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // already closed
    }
    await this.commit();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.drop(socket);
    await this.commit();
  }

  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    if (room.expired(now)) {
      this.stopLoop();
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    room.claimHost(now);
    // the round goes on: restart the frames if this object was restarted in the middle of it
    if (room.playing && !this.loop) this.startLoop();
    await this.commit();
  }

  private drop(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (this.room && attachment) {
      const stillConnected = this.ctx.getWebSockets().some((other) => other !== socket && (other.deserializeAttachment() as Attachment | null)?.id === attachment.id);
      this.room.presence(attachment.id, stillConnected, Date.now());
    }
    socket.serializeAttachment(null);
  }

  private startLoop(): void {
    if (this.loop) return;
    this.loop = setInterval(() => void this.tick(), SIMULATION_STEP_MS);
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** One frame of the round: move the crowd, show everyone. */
  private async tick(): Promise<void> {
    const room = this.room;
    if (!room || !room.playing) {
      this.stopLoop();
      return;
    }
    room.advance(Date.now());
    this.broadcast();
    if (!room.playing) this.stopLoop();
    if (room.takeDirty()) await this.store();
  }

  private broadcast(): void {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (!attachment) continue;
      try {
        socket.send(JSON.stringify({ t: "view", view: room.view(attachment.id, attachment.role, now) }));
      } catch {
        // a closing socket is tidied up by its close handler
      }
    }
  }

  private async store(): Promise<void> {
    if (!this.room) return;
    await this.ctx.storage.put(ROOM_KEY, this.room.st);
    await this.arm();
  }

  /** The next wake-up: a watchdog while a round is on, a host to hand over, or the room's expiry. */
  private async arm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    const check = room.nextCheck(now);
    let at = room.playing ? now + WATCHDOG_MS : now + 3 * 60 * 60_000 + 1_000;
    if (check !== null) at = Math.min(at, check + 50);
    const current = await this.ctx.storage.getAlarm();
    // (setting an alarm is a write: only when it moves)
    if (current === null || Math.abs(current - at) > 1_000 && (at < current || !room.playing)) await this.ctx.storage.setAlarm(at);
  }

  /** Store what changed, tell everyone, and set the next wake-up. */
  private async commit(): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (room.takeDirty()) await this.ctx.storage.put(ROOM_KEY, room.st);
    this.broadcast();
    await this.arm();
  }
}
