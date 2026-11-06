// 一起跳 · Dance Along's room server at changle.ca/party. One Durable Object per
// room keeps the session (src/server/session.ts) around party-base's state machine; the pages talk
// to it over one WebSocket each.
//   POST /party/api/rooms                 open a room: { speakerAt } -> { code }
//   GET  /party/api/rooms/CODE/ws         the room's WebSocket: ?role=speaker, or ?id=…&name=… for a phone
//   GET  /party/r/CODE                    the QR code's link: the phone page with the code filled in
//   /party/screen, /party/join            the pages (dist/client/party, built by scripts/build.mjs)
import { DurableObject } from "cloudflare:workers";
import { CODE_ALPHABET, CODE_RE, type ClientMsg, type ServerMsg } from "../shared/protocol";
import { makeCode, Session, validPlayerId, type From, type Out, type SessionData } from "./session";
import { emptyScores, type Scores } from "./tally";

/** The beats of the dance being danced are stored at most this often (they change with every bar). */
const SCORES_EVERY_MS = 3_000;

/**
 * "1" only for the local checks (`--var ALLOW_TEST_SETTINGS:1`, scripts/song-check.cjs): a room may
 * start the short test dance. Never set on Cloudflare.
 */
const testing = (env: Env) => (env as Env & { ALLOW_TEST_SETTINGS?: string }).ALLOW_TEST_SETTINGS === "1";

export class PartyRoom extends DurableObject<Env> {
  private s: Session | null = null;
  /** The alarm last set, so a busy room doesn't rewrite it every second. */
  private alarmAt: number | null = null;
  /** The speaker's clock offset as last stored: it moves a little every second, stored when it moves more. */
  private storedOffset: number | null = null;
  /** When the dance's beats were last stored, and whether some came in since. */
  private scoresAt = 0;
  private scoresDirty = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const d = await ctx.storage.get<SessionData>("s");
      if (d) {
        const scores = (await ctx.storage.get<Scores>("scores")) ?? emptyScores();
        this.s = new Session(d, () => Date.now(), scores, { testRoutines: testing(env) });
        this.storedOffset = d.speakerOffset;
      }
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  /** Open the room under this code. False when the code is already a room in use. */
  async open(code: string, speakerAt?: number): Promise<boolean> {
    if (this.s && !this.s.expired()) return false;
    for (const ws of this.ctx.getWebSockets()) ws.close(4000, "ended");
    this.s = new Session(Session.create(code, Date.now(), speakerAt), () => Date.now(), emptyScores(), { testRoutines: testing(this.env) });
    await this.ctx.storage.put("s", this.s.d);
    await this.ctx.storage.delete("scores");
    this.storedOffset = this.s.d.speakerOffset;
    await this.wake();
    return true;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected a WebSocket", { status: 426 });
    const q = new URL(req.url).searchParams;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const refuse = (key: "noRoom" | "full" | "ended" | "badRequest") => {
      server.send(JSON.stringify({ t: "fatal", key } satisfies ServerMsg));
      server.close(4000, key);
      return new Response(null, { status: 101, webSocket: client });
    };
    const s = this.s;
    if (!s || s.expired()) return refuse(s?.d.state.phase === "ended" ? "ended" : "noRoom");
    const role = q.get("role") === "speaker" ? "speaker" : "player";
    const playerId = role === "player" ? (q.get("id") ?? "") : null;
    if (role === "player" && !validPlayerId(playerId ?? "")) return refuse("badRequest");
    const from: From = { role, playerId };
    s.connect(from, q.get("name") ?? undefined);
    if (role === "player" && !s.d.state.players.some((p) => p.id === playerId)) {
      s.flush();
      return refuse("full");
    }
    server.serializeAttachment(from);
    server.send(JSON.stringify({ t: "welcome", role, you: playerId } satisfies ServerMsg));
    server.send(JSON.stringify(s.stateMsg()));
    await this.commit();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const from = ws.deserializeAttachment() as From | null;
    if (!this.s || !from || typeof message !== "string" || message.length > 4096) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message) as ClientMsg;
    } catch {
      return;
    }
    this.s.handle(from, msg);
    await this.commit();
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // already closed
    }
    await this.commit();
  }

  async webSocketError(ws: WebSocket) {
    this.gone(ws);
    await this.commit();
  }

  async alarm() {
    this.alarmAt = null;
    if (!this.s) return;
    this.s.tick();
    if (this.s.expired()) {
      await this.commit();
      for (const ws of this.ctx.getWebSockets()) ws.close(4000, "ended");
      this.s = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.commit();
  }

  /** A socket closed: the page is gone if it has no other socket open (a reload opens one first). */
  private gone(ws: WebSocket) {
    const from = ws.deserializeAttachment() as From | null;
    ws.serializeAttachment(null);
    if (!this.s || !from) return;
    const same = this.ctx.getWebSockets().some((o) => {
      if (o === ws) return false;
      const f = o.deserializeAttachment() as From | null;
      return !!f && f.role === from.role && f.playerId === from.playerId;
    });
    if (!same) this.s.disconnect(from);
  }

  /** Send what the session has to say, store it if it changed, set the next alarm. */
  private async commit() {
    const s = this.s;
    if (!s) return;
    const { out, changed, scored } = s.flush();
    const sockets = this.ctx.getWebSockets();
    for (const o of out) deliver(sockets, o);
    // (the speaker's offset is refreshed every second: kept in memory, stored when it moves 5 ms)
    const offsetMoved = this.storedOffset === null || Math.abs(s.d.speakerOffset - this.storedOffset) >= 5;
    if (changed || offsetMoved) {
      await this.ctx.storage.put("s", s.d);
      this.storedOffset = s.d.speakerOffset;
    }
    // (the dance's beats come in with every bar from every phone: stored every few seconds, and
    // whenever the room itself changes, so a room woken from storage loses a bar or two at most)
    if (scored) this.scoresDirty = true;
    if (this.scoresDirty && (changed || Date.now() - this.scoresAt >= SCORES_EVERY_MS)) {
      await this.ctx.storage.put("scores", s.scores);
      this.scoresAt = Date.now();
      this.scoresDirty = false;
    }
    await this.wake();
  }

  /** Set the alarm for the session's next deadline (unless it's already set within 50 ms of it). */
  private async wake() {
    const at = this.s?.nextWake() ?? null;
    if (at === null || (this.alarmAt !== null && Math.abs(at - this.alarmAt) < 50)) return;
    this.alarmAt = Math.max(at, Date.now() + 5);
    await this.ctx.storage.setAlarm(this.alarmAt);
  }
}

function deliver(sockets: WebSocket[], o: Out) {
  const of = (ws: WebSocket) => ws.deserializeAttachment() as From | null;
  if ("close" in o) {
    for (const ws of sockets) {
      if (of(ws)?.playerId !== o.close) continue;
      ws.serializeAttachment(null);
      try {
        ws.send(JSON.stringify({ t: "fatal", key: "ended" } satisfies ServerMsg));
        ws.close(4001, "kicked");
      } catch {
        // already closing
      }
    }
    return;
  }
  const text = JSON.stringify(o.msg);
  for (const ws of sockets) {
    const f = of(ws);
    if (!f) continue;
    const to = o.to;
    if (to === "all" || (to === "speaker" && f.role === "speaker") || (typeof to === "object" && f.role === "player" && f.playerId === to.player)) {
      try {
        ws.send(text);
      } catch {
        // closing; its close handler tidies up
      }
    }
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function randomInt(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % n;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/party/api/rooms") {
      if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
      const body = (await req.json().catch(() => ({}))) as { speakerAt?: unknown };
      const speakerAt = typeof body.speakerAt === "number" && Number.isFinite(body.speakerAt) ? body.speakerAt : undefined;
      for (let i = 0; i < 20; i++) {
        const code = makeCode(CODE_ALPHABET, randomInt);
        if (await env.ROOMS.get(env.ROOMS.idFromName(code)).open(code, speakerAt)) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }
    const ws = /^\/party\/api\/rooms\/([A-Za-z0-9]{4})\/ws$/.exec(path);
    if (ws) {
      const code = ws[1]!.toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: "no such room" }, 404);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    const r = /^\/party\/r\/([A-Za-z0-9]{4})\/?$/.exec(path);
    if (r) return Response.redirect(new URL(`/party/join?code=${r[1]!.toUpperCase()}`, url).toString(), 302);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
