// Cloudflare Worker: the server for 随便 · Whatever's Fine, one of changle.ca's tools. It answers on
// changle.ca/eat (a route on the changle.ca zone); everything below is under /eat.
//
//   GET  /api/me                 → { user, loginEnabled, card, last }
//   PUT  /api/me/card            ← Limits           save my diet card (logged in)
//   POST /api/me/last            ← { code, name } or { place, name }   remember my last table (or a solo pick made before picking alone went, 2026-11), to ask how it was
//   POST /api/places/:id/rate    ← { overall, liked, wait }   rate my last solo pick (logged in, once; picking alone went in 2026-11, this stays a few days for picks made before)
//   DELETE /api/me               → 204              forget everything about me
//   GET  /auth/google, /auth/callback, POST /auth/logout
//   POST /api/rooms              ← { cid, center, range, at, occasion } → { code }   (logged in, 10 a day; `at`: a planned meal, or none for now)
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
import { NEIGHBOURHOODS, cleanAt, cleanLimits, isOccasion, isRange, type Center, type Limits, type Place, type PlaceStats, type RangeId, type Rating } from "../engine";
import { type ClientMsg, type WireView } from "../room/protocol";
import { Room, cleanRating, type RoomEnv, type RoomState, type Want } from "../room/room";
import { currentUser, finishLogin, loginEnabled, logout, startLogin, testSession } from "./auth";
import { demoPlaces, detailsGoogle, keepAbout, searchGoogle } from "./places";

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
/** A Google place id, or one of the made-up demo places. */
const PLACE_ID = /^(demo-\d{1,3}|[A-Za-z0-9_-]{10,300})$/;

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
    // Picking alone (/solo) went in 2026-11: "一个人" is an occasion at a table now. Its old address goes home.
    if (path === "/solo" || path === "/solo/") return Response.redirect(new URL(`${BASE}/`, url).toString(), 302);
    if (path === "/" || path === "/rate" || /^\/r\/\d{4}(\/rate)?\/?$/.test(path)) return env.ASSETS.fetch(new Request(new URL(`${BASE}/`, url), req));

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
        const body = (await req.json().catch(() => ({}))) as { code?: string; place?: string; name?: string };
        if (typeof body.name !== "string") return json({ error: "bad" }, 400);
        const name = body.name.slice(0, 80);
        if (/^\d{4}$/.test(body.code ?? "")) await user(env, me.sub).setLast({ code: body.code!, name, at: Date.now() });
        else if (PLACE_ID.test(body.place ?? "")) {
          // Only a place your last solo search showed, so the rating can't be pointed at any restaurant.
          if (!(await user(env, me.sub).chooseSolo(body.place!, name))) return json({ error: "notYours" }, 403);
        } else return json({ error: "bad" }, 400);
        return json({ ok: true });
      }
    }

    if (parts[1] === "rooms" && parts.length === 2 && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { cid?: string; center?: unknown; range?: string; lang?: string; at?: unknown; occasion?: unknown };
      const center = cleanCenter(body.center);
      const range: RangeId = isRange(body.range) ? body.range : "walk20";
      if (!center) return json({ error: "badPlace" }, 400);
      if (!/^[a-f0-9]{8,64}$/.test(body.cid ?? "")) return json({ error: "bad" }, 400);
      const denied = await takeUse(env, me);
      if (denied) return denied;
      for (let i = 0; i < 40; i++) {
        const code = roomCode();
        if (await env.ROOMS.get(env.ROOMS.idFromName(code)).init(code, { host: body.cid!, center, range, demo: !usesGoogle(env), lang: body.lang === "en" ? "en" : "zh", at: cleanAt(body.at, Date.now()), occasion: isOccasion(body.occasion) ? body.occasion : "casual" })) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }


    // One person's pick, rated after the meal: only your own last pick, once.
    if (parts[1] === "places" && parts[3] === "rate" && parts.length === 4 && req.method === "POST") {
      const id = decodeURIComponent(parts[2]);
      if (!me) return json({ error: "login" }, 401);
      const r = cleanRating(await req.json().catch(() => ({})));
      if (!r || !PLACE_ID.test(id)) return json({ error: "bad" }, 400);
      if (!(await user(env, me.sub).rateLast(id))) return json({ error: "notYours" }, 403);
      if (!id.startsWith("demo-")) await env.PLACES.get(env.PLACES.idFromName(id)).add(r);
      return json({ ok: true });
    }

    const code = parts[2];
    if (parts[1] === "rooms" && code && /^\d{4}$/.test(code)) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (parts.length === 3 && req.method === "GET") return json(await stub.info());
      if (parts[3] === "rate" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const r = cleanRating(body);
        if (!r || typeof body.cid !== "string") return json({ error: "bad" }, 400);
        const status = await stub.rate(body.cid, r);
        // 409: this phone already rated it. 410: nothing to rate here, or the table's ratings are full.
        return status === "new" ? json({ ok: true }) : json({ error: status }, status === "again" ? 409 : 410);
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

interface Attachment {
  id: string;
  /** The page keeps the list between views (it says v=2): it may be sent without an unchanged one. */
  keeps?: boolean;
  /** The cardsRev this phone was last sent with the cards (see commit()). */
  rev?: string;
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
      // A socket refused before it got an attachment has no id: skip it rather than fail to start.
      this.room.presence(ctx.getWebSockets().flatMap((ws) => (ws.deserializeAttachment() as Attachment | null)?.id ?? []));
      // Restarted in the middle of a search: start it again.
      if (st.phase === "finding") void this.work(this.room.searchWant());
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
    // After "start over", the rate link in the group chat is still about the meal before it.
    const winner = st.phase === "result" && st.result ? st.places.find((p) => p.id === st.result!.winner)?.name : (st.last?.name ?? undefined);
    const rs = Object.values(st.ratings);
    return { exists: true, phase: st.phase, winner, ratings: { n: rs.length, liked: rs.filter((x) => x.liked).length } };
  }

  async rate(cid: string, rating: Rating): Promise<"new" | "again" | "closed"> {
    const r = this.room;
    if (!r || r.expired()) return "closed";
    const { status, winner } = r.rate(cid, rating);
    if (status === "new" && winner && !r.st.demo) await this.env.PLACES.get(this.env.PLACES.idFromName(winner)).add(rating);
    await this.commit();
    return status;
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
    if (this.room.full(id)) return refuse("full", 4005);
    if (!this.room.join(id, q.get("key") ?? "", { name: q.get("name") ?? undefined, lang: q.get("lang") === "en" ? "en" : "zh" })) return refuse("identity", 4003);
    server.serializeAttachment({ id, keeps: q.get("v") === "2" } satisfies Attachment);
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
        const places = key ? await searchGoogle(key, want.center, want.range, want.lang, { liked: want.liked, occasion: want.occasion, at: want.at, random: randomUnit }) : demoPlaces(want.center, want.range, Date.now());
        // Our own numbers, for real places only (demo ones are made up).
        if (key) await Promise.all(places.map(async (p: Place) => (p.ours = (await this.env.PLACES.get(this.env.PLACES.idFromName(p.id)).get()) ?? undefined)));
        if (this.room === room) room.found(places);
      } else if (key) {
        const got = await Promise.allSettled(want.ids.map(async (id) => [id, await detailsGoogle(key, id)] as const));
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
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.id) continue;
        try {
          const view = room.view(att.id);
          // The list is the same for everyone and changes rarely: a phone that has it gets it once. A page
          // from before that (open while the server was updated) still gets it every time.
          const same = !!att.keeps && att.rev === view.cardsRev;
          ws.send(JSON.stringify({ t: "view", view: { ...view, cards: same ? null : view.cards } satisfies WireView }));
          if (!same) ws.serializeAttachment({ ...att, rev: view.cardsRev } satisfies Attachment);
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

/** The last table (its code) or solo pick (its place id) someone went to, to ask how it was. */
type Last = { code?: string; place?: string; name: string; at: number; rated?: boolean };
/**
 * The last solo search: the places it showed, and whether one of them has been rated. Replaced by
 * the next search.
 */
type Solo = { ids: string[]; rated?: boolean; at: number };
/** How long an old solo pick can still be rated (the home page asks for as long). */
const SOLO_RATE_DAYS = 3;

/** One logged-in person: their diet card, last table or pick, and today's count. */
export class UserDO extends DurableObject<Env> {
  async me(): Promise<{ card: Limits | null; last: Last | null }> {
    // From 2026-11-05 to 11-11 picking alone kept the places it showed, to show others first; no longer used.
    await this.ctx.storage.delete("seen");
    // Picking alone went in 2026-11: its last search and pick are only kept while the pick can be
    // rated (the home page asks for three days), as the privacy page says.
    const old = Date.now() - SOLO_RATE_DAYS * 24 * 3600_000;
    const solo = await this.ctx.storage.get<Solo>("solo");
    if (solo && solo.at < old) await this.ctx.storage.delete("solo");
    let last = (await this.ctx.storage.get<Last>("last")) ?? null;
    if (last?.place && last.at < old) {
      await this.ctx.storage.delete("last");
      last = null;
    }
    return { card: (await this.ctx.storage.get<Limits>("card")) ?? null, last };
  }

  /**
   * True once for the person's own last solo pick, and at most once per solo search (choosing another
   * of its places doesn't open a second rating); false for anything else.
   */
  async rateLast(place: string): Promise<boolean> {
    const last = await this.ctx.storage.get<Last>("last");
    const solo = await this.ctx.storage.get<Solo>("solo");
    if (!last || last.place !== place || last.rated || solo?.rated) return false;
    await this.ctx.storage.put("last", { ...last, rated: true });
    if (solo) await this.ctx.storage.put("solo", { ...solo, rated: true });
    return true;
  }

  async setName(name: string) {
    await this.ctx.storage.put("name", name);
  }

  async setCard(card: Limits) {
    await this.ctx.storage.put("card", card);
  }

  async setLast(last: Last) {
    await this.ctx.storage.put("last", last);
  }

  /** "就它了": becomes the pick to ask about, if the last solo search showed it. Choosing it again keeps it as it was (rated or not). */
  async chooseSolo(place: string, name: string): Promise<boolean> {
    const s = await this.ctx.storage.get<Solo>("solo");
    if (!s?.ids.includes(place)) return false;
    const last = await this.ctx.storage.get<Last>("last");
    if (last?.place !== place) await this.ctx.storage.put("last", { place, name, at: Date.now() } satisfies Last);
    return true;
  }

  /** Count a new room against today's limit. False when the limit is reached. */
  async takeRoom(day: string, max: number): Promise<boolean> {
    const q = (await this.ctx.storage.get<{ day: string; n: number }>("quota")) ?? { day, n: 0 };
    const n = q.day === day ? q.n : 0;
    if (n >= max) return false;
    await this.ctx.storage.put("quota", { day, n: n + 1 });
    return true;
  }

  /** "Delete all my data". Today's count stays until the day is over, or deleting would reset the daily limit. */
  async wipe() {
    const quota = await this.ctx.storage.get("quota");
    await this.ctx.storage.deleteAll();
    if (quota) await this.ctx.storage.put("quota", quota);
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
