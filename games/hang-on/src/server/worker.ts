// 抓紧了 · Hang On 的房间服务（changle.ca/hang-on）。Cloudflare 只做三件事：发房间码、交换 WebRTC
// 信令、直连失败时中转输入。一个 Durable Object 一个房间，逻辑在 src/server/room.ts（纯，有测试）。
//   POST /hang-on/api/rooms                 开房：{} -> { code }
//   GET  /hang-on/api/rooms/CODE/ws         房间的 WebSocket：?role=host | ?role=pad&id=…&name=… | ?role=watch
//   GET  /hang-on/r/CODE                    二维码的链接：手柄页，房间码填好
//   /hang-on/、/hang-on/pad/                页面（dist/hang-on，vite build）
import { DurableObject } from 'cloudflare:workers';
import { CODE_ALPHABET, CODE_RE, SEAT_ID_RE, type ClientMsg, type FatalKey, type ServerMsg } from '../net/protocol';
import { makeCode, Room, type From, type Out, type RoomData } from './room';

/** 一条消息的上限：SDP offer 两三千字节，再大就不对了。 */
const MAX_MSG = 16_384;

export class HangOnRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private alarmAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const d = await ctx.storage.get<RoomData>('r');
      if (d) this.room = new Room(d, () => Date.now());
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  /** 用这个码开房。码正被别的房用着就返回 false。 */
  async open(code: string): Promise<boolean> {
    if (this.room && !this.room.expired()) return false;
    for (const ws of this.ctx.getWebSockets()) ws.close(4000, 'ended');
    this.room = new Room(Room.create(code, Date.now()), () => Date.now());
    await this.ctx.storage.put('r', this.room.d);
    await this.wake();
    return true;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a WebSocket', { status: 426 });
    const q = new URL(req.url).searchParams;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const refuse = (key: FatalKey) => {
      server.send(JSON.stringify({ t: 'fatal', key } satisfies ServerMsg));
      server.close(4000, key);
      return new Response(null, { status: 101, webSocket: client });
    };
    const room = this.room;
    if (!room || room.expired()) return refuse(room?.d.phase === 'ended' ? 'ended' : 'noRoom');
    const roleParam = q.get('role');
    const role = roleParam === 'host' ? 'host' : roleParam === 'watch' ? 'watch' : 'pad';
    const seat = role === 'pad' ? (q.get('id') ?? '') : null;
    if (role === 'pad' && !SEAT_ID_RE.test(seat ?? '')) return refuse('badRequest');
    const from: From = { role, seat };
    const why = room.connect(from, q.get('name') ?? undefined);
    if (why) {
      room.flush();
      return refuse(why);
    }
    server.serializeAttachment(from);
    server.send(JSON.stringify({ t: 'welcome', role, seat, code: room.d.code } satisfies ServerMsg));
    server.send(JSON.stringify(room.roomMsg()));
    await this.commit();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const from = ws.deserializeAttachment() as From | null;
    if (!this.room || !from || typeof message !== 'string' || message.length > MAX_MSG) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message) as ClientMsg;
    } catch {
      return;
    }
    this.room.handle(from, msg);
    await this.commit();
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      // 已经关了
    }
    await this.commit();
  }

  async webSocketError(ws: WebSocket) {
    this.gone(ws);
    await this.commit();
  }

  async alarm() {
    this.alarmAt = null;
    if (!this.room) return;
    this.room.tick();
    if (this.room.expired()) {
      await this.commit();
      for (const ws of this.ctx.getWebSockets()) ws.close(4000, 'ended');
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.commit();
  }

  /** 一条连接关了：同一个人没有别的连接才算走了（刷新页面时新的先开）。 */
  private gone(ws: WebSocket) {
    const from = ws.deserializeAttachment() as From | null;
    ws.serializeAttachment(null);
    if (!this.room || !from) return;
    const same = this.ctx.getWebSockets().some((o) => {
      if (o === ws) return false;
      const f = o.deserializeAttachment() as From | null;
      return !!f && f.role === from.role && f.seat === from.seat;
    });
    if (!same) this.room.disconnect(from);
  }

  /** 把房间要说的话送出去，有变化就存，再定下一个闹钟。 */
  private async commit() {
    const room = this.room;
    if (!room) return;
    const { out, changed } = room.flush();
    const sockets = this.ctx.getWebSockets();
    for (const o of out) deliver(sockets, o);
    if (changed) await this.ctx.storage.put('r', room.d);
    await this.wake();
  }

  private async wake() {
    const at = this.room?.nextWake() ?? null;
    if (at === null || (this.alarmAt !== null && Math.abs(at - this.alarmAt) < 50)) return;
    this.alarmAt = Math.max(at, Date.now() + 5);
    await this.ctx.storage.setAlarm(this.alarmAt);
  }
}

function deliver(sockets: WebSocket[], o: Out) {
  const of = (ws: WebSocket) => ws.deserializeAttachment() as From | null;
  if ('close' in o) {
    for (const ws of sockets) {
      const f = of(ws);
      if (!f) continue;
      const hit = o.close === 'host' ? f.role === 'host' : f.role === 'pad' && f.seat === o.close.seat;
      if (!hit) continue;
      ws.serializeAttachment(null);
      try {
        ws.send(JSON.stringify({ t: 'fatal', key: o.key } satisfies ServerMsg));
        ws.close(4001, o.key);
      } catch {
        // 正在关
      }
    }
    return;
  }
  const text = JSON.stringify(o.msg);
  for (const ws of sockets) {
    const f = of(ws);
    if (!f) continue;
    const to = o.to;
    const hit = to === 'all' || (to === 'host' && f.role === 'host') || (typeof to === 'object' && f.role === 'pad' && f.seat === to.seat);
    if (!hit) continue;
    try {
      ws.send(text);
    } catch {
      // 正在关，它的 close 会收拾
    }
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function randomInt(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % n;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === '/hang-on/api/rooms') {
      if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      for (let i = 0; i < 20; i++) {
        const code = makeCode(CODE_ALPHABET, randomInt);
        if (await env.ROOMS.get(env.ROOMS.idFromName(code)).open(code)) return json({ code });
      }
      return json({ error: 'busy' }, 503);
    }
    const ws = /^\/hang-on\/api\/rooms\/([A-Za-z0-9]{4})\/ws$/.exec(path);
    if (ws) {
      const code = ws[1]!.toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'no such room' }, 404);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    const r = /^\/hang-on\/r\/([A-Za-z0-9]{4})\/?$/.exec(path);
    if (r) return Response.redirect(new URL(`/hang-on/pad/?code=${r[1]!.toUpperCase()}`, url).toString(), 302);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
