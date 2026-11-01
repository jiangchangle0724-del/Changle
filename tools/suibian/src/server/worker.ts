// Cloudflare Worker: the server for 随便 · Whatever's Fine, one of changle.ca's tools. It answers on
// changle.ca/eat (a route on the changle.ca zone); everything below is under /eat.
//
//   GET  /api/me                 → { user, loginEnabled, card, last }
//   PUT  /api/me/card            ← Limits           save my diet card (logged in)
//   POST /api/me/last            ← { code, name }   remember my last table, to ask how it was
//   DELETE /api/me               → 204              forget everything about me
//   GET  /auth/google, /auth/callback, POST /auth/logout
//   POST /api/rooms              ← { cid, center, range } → { code }   (logged in, 10 a day)
//   GET  /api/rooms/:code        → { exists, phase }
//   GET  /api/rooms/:code/ws     → WebSocket (cid, key, name, lang in the query)
//   POST /api/rooms/:code/rate   ← { cid, overall, liked, wait }
//   /, /r/:code, /r/:code/rate   → the app's page (home, a phone at a table, rating the meal)
//   anything else                → the app's files (static assets in dist/client/eat)
//
// Real Google data needs both the Places key and Google login set up (so only logged-in people
// can spend API money). Without them the server runs on made-up demo restaurants.
import { DurableObject } from "cloudflare:workers";
import { BASE } from "../base";
import { NEIGHBOURHOODS, cleanAnswers, cleanLimits, isRange, soloPick, soloReasons, type Center, type Limits, type Place, type PlaceStats, type RangeId, type Rating } from "../engine";
import { cardView, type ClientMsg, type SoloResponse } from "../room/protocol";
import { Room, cleanRating, type RoomEnv, type RoomState, type Want } from "../room/room";
import { currentUser, finishLogin, loginEnabled, logout, startLogin, testSession } from "./auth";
import { demoPlaces, detailsGoogle, searchGoogle } from "./places";

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  USERS: DurableObjectNamespace<UserDO>;
  PLACES: DurableObjectNamespace<PlaceDO>;
  ASSETS: Fetcher;
  GOOGLE_PLACES_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  /** "1" only for local tests: allows /api/test/login. */
  ALLOW_TEST_SETTINGS?: string;
}

const ROOMS_PER_DAY = 10;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const randomUnit = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const roomCode = () => String(1000 + Math.floor(randomUnit() * 9000));
const usesGoogle = (env: Env) => !!env.GOOGLE_PLACES_KEY && loginEnabled(env);
const user = (env: Env, sub: string) => env.USERS.get(env.USERS.idFromName(sub));

function cleanCenter(x: unknown): Center | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  // Greater Vancouver and a generous margin around it.
  if (!(lat > 48.9 && lat < 49.6 && lng > -123.6 && lng < -122.2)) return null;
  const label = typeof o.label === "string" && NEIGHBOURHOODS.some((n) => n.en === o.label) ? o.label : undefined;
  return { lat, lng, label };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // On changle.ca only /eat reaches this Worker (the routes in wrangler.jsonc); on a computer running
    // it by itself, the bare address leads to /eat/ too.
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return Response.redirect(new URL(`${BASE}/`, url).toString(), 302);
    const path = url.pathname.slice(BASE.length) || "/";
    // Room and rating links are app pages; serve the app for them directly (old phones don't send
    // Sec-Fetch-Mode). The page is dist/client/eat/index.html, served at /eat/.
    if (path === "/" || path === "/solo" || /^\/r\/\d{4}(\/rate)?\/?$/.test(path)) return env.ASSETS.fetch(new Request(new URL(`${BASE}/`, url), req));

    if (path === "/auth/google") return loginEnabled(env) ? startLogin(req, env) : json({ error: "loginOff" }, 404);
    if (path === "/auth/callback") {
      if (!loginEnabled(env)) return json({ error: "loginOff" }, 404);
      const { res, session } = await finishLogin(req, env);
      if (session) await user(env, session.sub).setName(session.name);
      return res;
    }
    if (path === "/auth/logout" && req.method === "POST") return logout(req);

    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "api") return env.ASSETS.fetch(req);
    const me = await currentUser(req, env);

    if (parts[1] === "test" && parts[2] === "login" && req.method === "POST" && env.ALLOW_TEST_SETTINGS === "1" && env.SESSION_SECRET) {
      const body = (await req.json().catch(() => ({}))) as { sub?: string; name?: string };
      const sub = body.sub ?? "test";
      await user(env, sub).setName(body.name ?? "Test");
      return new Response(null, { status: 204, headers: { "set-cookie": await testSession(req, env, sub, body.name ?? "Test") } });
    }

    if (parts[1] === "me") {
      if (parts.length === 2 && req.method === "GET") {
        const data = me ? await user(env, me.sub).me() : { card: null, last: null };
        // Cards saved before a field existed (e.g. typed items) come back filled in.
        const card = data.card ? cleanLimits(data.card) : null;
        return json({ user: me ? { name: me.name } : null, loginEnabled: loginEnabled(env), demo: !usesGoogle(env), ...data, card });
      }
      if (!me) return json({ error: "login" }, 401);
      if (parts.length === 2 && req.method === "DELETE") {
        await user(env, me.sub).wipe();
        return logout(req);
      }
      if (parts[2] === "card" && req.method === "PUT") {
        await user(env, me.sub).setCard(cleanLimits(await req.json().catch(() => ({}))));
        return json({ ok: true });
      }
      if (parts[2] === "last" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { code?: string; name?: string };
        if (!/^\d{4}$/.test(body.code ?? "") || typeof body.name !== "string") return json({ error: "bad" }, 400);
        await user(env, me.sub).setLast({ code: body.code!, name: body.name.slice(0, 80), at: Date.now() });
        return json({ ok: true });
      }
    }

    if (parts[1] === "rooms" && parts.length === 2 && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { cid?: string; center?: unknown; range?: string; lang?: string };
      const center = cleanCenter(body.center);
      const range: RangeId = isRange(body.range) ? body.range : "walk20";
      if (!center) return json({ error: "badPlace" }, 400);
      if (!/^[a-f0-9]{8,64}$/.test(body.cid ?? "")) return json({ error: "bad" }, 400);
      const denied = await takeUse(env, me);
      if (denied) return denied;
      for (let i = 0; i < 40; i++) {
        const code = roomCode();
        if (await env.ROOMS.get(env.ROOMS.idFromName(code)).init(code, { host: body.cid!, center, range, demo: !usesGoogle(env), lang: body.lang === "en" ? "en" : "zh" })) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }

    if (parts[1] === "solo" && parts.length === 2 && req.method === "POST") return solo(req, env, me);

    const code = parts[2];
    if (parts[1] === "rooms" && code && /^\d{4}$/.test(code)) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (parts.length === 3 && req.method === "GET") return json(await stub.info());
      if (parts[3] === "rate" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const r = cleanRating(body);
        if (!r || typeof body.cid !== "string") return json({ error: "bad" }, 400);
        return json({ ok: await stub.rate(body.cid, r) });
      }
      if (parts[3] === "ws") {
        if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
        return stub.fetch(req);
      }
    }

    return json({ error: "notFound" }, 404);
  },
} satisfies ExportedHandler<Env>;

/** Starting a table and one person's pick both count toward the account's uses for the day. */
async function takeUse(env: Env, me: { sub: string } | null): Promise<Response | null> {
  if (!loginEnabled(env)) return null;
  if (!me) return json({ error: "login" }, 401);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
  if (!(await user(env, me.sub).takeRoom(day, ROOMS_PER_DAY))) return json({ error: "quota" }, 429);
  return null;
}

/**
 * One person who doesn't know what to eat: their answers, where they are and their diet card come
 * in; up to six places (two batches of three) go back, with phone, photo and map like a table's
 * cards, and why each was picked. Nothing is kept: the answers only steer this one search.
 */
async function solo(req: Request, env: Env, me: { sub: string } | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { center?: unknown; range?: unknown; answers?: unknown; limits?: unknown; lang?: unknown };
  const center = cleanCenter(body.center);
  if (!center) return json({ error: "badPlace" } satisfies SoloResponse, 400);
  const range: RangeId = isRange(body.range) ? body.range : "walk20";
  const answers = cleanAnswers(body.answers);
  const limits = cleanLimits(body.limits);
  const lang = body.lang === "en" ? "en" : "zh";
  const denied = await takeUse(env, me);
  if (denied) return denied;
  const google = usesGoogle(env);
  const key = env.GOOGLE_PLACES_KEY!;
  const now = Date.now();
  let places: Place[];
  try {
    places = google ? await searchGoogle(key, center, range, lang) : demoPlaces(center, range, now);
  } catch (e) {
    console.error("places", String(e));
    return json({ error: "searchFailed" } satisfies SoloResponse, 502);
  }
  if (!places.length) return json({ error: "nothingNearby", demo: !google } satisfies SoloResponse);
  if (google) await Promise.all(places.map(async (p) => (p.ours = (await env.PLACES.get(env.PLACES.idFromName(p.id)).get()) ?? undefined)));
  const { ids, relaxed } = soloPick({ places, answers, limits, center, range, now });
  if (!ids.length) return json({ error: "nothingFits", demo: !google } satisfies SoloResponse);
  const byId = new Map(places.map((p) => [p.id, p]));
  if (google) {
    const got = await Promise.allSettled(ids.map(async (id) => [id, await detailsGoogle(key, id, lang)] as const));
    for (const g of got) if (g.status === "fulfilled") Object.assign(byId.get(g.value[0])!, g.value[1]);
  }
  const cards = ids.map((id) => {
    const p = byId.get(id)!;
    return { ...cardView(p, center, range, limits, now), reasons: soloReasons(p, answers, limits, center, range) };
  });
  return json({ cards, relaxed, demo: !google } satisfies SoloResponse);
}

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
      this.room.presence(ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() as Attachment).id));
      // Restarted in the middle of a search: start it again.
      if (st.phase === "finding") void this.work({ k: "search", center: st.center, range: st.range, lang: st.lang ?? "zh" });
    });
  }

  async init(code: string, o: Parameters<typeof Room.create>[2]): Promise<boolean> {
    if (this.room && !this.room.expired()) return false;
    this.room = Room.create(code, this.roomEnv, o);
    await this.commit();
    return true;
  }

  async info() {
    const r = this.room;
    if (!r || r.expired()) return { exists: false };
    const st = r.st;
    const winner = st.phase === "result" && st.result ? st.places.find((p) => p.id === st.result!.winner)?.name : undefined;
    const rs = Object.values(st.ratings);
    return { exists: true, phase: st.phase, winner, ratings: { n: rs.length, liked: rs.filter((x) => x.liked).length } };
  }

  async rate(cid: string, rating: Rating): Promise<boolean> {
    const r = this.room;
    if (!r || r.expired() || !r.st.result) return false;
    const fresh = r.rate(cid, rating);
    if (fresh && !r.st.demo) await this.env.PLACES.get(this.env.PLACES.idFromName(r.st.result.winner)).add(rating);
    await this.commit();
    return true;
  }

  async fetch(req: Request): Promise<Response> {
    const q = new URL(req.url).searchParams;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const refuse = (key: string, code: number) => {
      server.send(JSON.stringify({ t: "fatal", key }));
      server.close(code, key);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!this.room || this.room.expired()) return refuse("noRoom", 4004);
    const id = q.get("cid") ?? "";
    if (!this.room.join(id, q.get("key") ?? "", { name: q.get("name") ?? undefined, lang: q.get("lang") === "en" ? "en" : "zh" })) return refuse("identity", 4003);
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

  /** Google searches and details run outside the room, then report back. */
  private async work(want: Want) {
    const room = this.room;
    if (!room) return;
    const key = room.st.demo ? undefined : this.env.GOOGLE_PLACES_KEY;
    try {
      if (want.k === "search") {
        const places = key ? await searchGoogle(key, want.center, want.range, want.lang) : demoPlaces(want.center, want.range, Date.now());
        // Our own numbers, for real places only (demo ones are made up).
        if (key) await Promise.all(places.map(async (p: Place) => (p.ours = (await this.env.PLACES.get(this.env.PLACES.idFromName(p.id)).get()) ?? undefined)));
        if (this.room === room) room.found(places);
      } else if (key) {
        const got = await Promise.allSettled(want.ids.map(async (id) => [id, await detailsGoogle(key, id, want.lang)] as const));
        const details: Record<string, Partial<Place>> = {};
        for (const g of got) if (g.status === "fulfilled") details[g.value[0]] = g.value[1];
        if (this.room === room) room.enrich(details);
      }
    } catch (e) {
      console.error("places", String(e));
      if (want.k === "search" && this.room === room) room.fail("searchFailed");
    }
    await this.commit();
  }

  /** Persist, tell everyone, start any outside work, set the next wake-up. */
  private async commit() {
    const room = this.room;
    if (!room) return;
    const out = room.flush();
    const sockets = this.ctx.getWebSockets();
    const of = (ws: WebSocket) => (ws.deserializeAttachment() as Attachment | null)?.id;
    for (const [id, msg] of out.direct) for (const ws of sockets) if (of(ws) === id) ws.send(JSON.stringify(msg));
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
    if (out.want) void this.work(out.want);
    const wake = room.nextWake();
    if (wake !== null) await this.ctx.storage.setAlarm(Math.max(wake, Date.now() + 5));
  }
}

/** One logged-in person: their diet card, last table, and today's room count. */
export class UserDO extends DurableObject<Env> {
  async me(): Promise<{ card: Limits | null; last: { code: string; name: string; at: number } | null }> {
    return { card: (await this.ctx.storage.get<Limits>("card")) ?? null, last: (await this.ctx.storage.get<{ code: string; name: string; at: number }>("last")) ?? null };
  }

  async setName(name: string) {
    await this.ctx.storage.put("name", name);
  }

  async setCard(card: Limits) {
    await this.ctx.storage.put("card", card);
  }

  async setLast(last: { code: string; name: string; at: number }) {
    await this.ctx.storage.put("last", last);
  }

  /** Count a new room against today's limit. False when the limit is reached. */
  async takeRoom(day: string, max: number): Promise<boolean> {
    const q = (await this.ctx.storage.get<{ day: string; n: number }>("quota")) ?? { day, n: 0 };
    const n = q.day === day ? q.n : 0;
    if (n >= max) return false;
    await this.ctx.storage.put("quota", { day, n: n + 1 });
    return true;
  }

  async wipe() {
    await this.ctx.storage.deleteAll();
  }
}

/** Our own numbers for one Google place id: post-meal ratings and waits. Nothing from Google. */
export class PlaceDO extends DurableObject<Env> {
  async get(): Promise<PlaceStats | null> {
    return (await this.ctx.storage.get<PlaceStats>("stats")) ?? null;
  }

  async add(r: Rating) {
    const s = (await this.get()) ?? { up: 0, mid: 0, down: 0, waits: [] };
    s[r.overall] += 1;
    s.waits = [...s.waits, r.wait].slice(-20);
    await this.ctx.storage.put("stats", s);
  }
}
