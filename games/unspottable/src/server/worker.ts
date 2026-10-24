import { DurableObject } from "cloudflare:workers";
import { Room, type RoomState } from "../room/room";
import type { ClientMsg, Lang, Role } from "../room/protocol";

export interface Env {
  ROOMS: DurableObjectNamespace<ArenaRoom>;
  ASSETS: Fetcher;
}

interface Attachment {
  id: string;
  role: Role;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
});

function roomCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (/^\/(r|tv)\/\d{4}\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/", url), req));
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "api") return env.ASSETS.fetch(req);

    if (parts[1] === "rooms" && parts.length === 2 && req.method === "POST") {
      for (let attempt = 0; attempt < 40; attempt++) {
        const code = roomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        if (await stub.init(code)) return json({ code });
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

export class ArenaRoom extends DurableObject<Env> {
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomState>("room");
      if (saved) {
        this.room = new Room(saved);
        this.room.presenceFromSockets(ctx.getWebSockets().map((socket) => (socket.deserializeAttachment() as Attachment | null)?.id).filter((id): id is string => typeof id === "string"), Date.now());
      }
    });
  }

  async init(code: string): Promise<boolean> {
    if (this.room && !this.room.expired(Date.now())) return false;
    this.room = Room.create(code, Date.now());
    await this.ctx.storage.put("room", this.room.st);
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
    if (!this.room || !this.room.join(id, name, lang, role, Date.now())) {
      server.send(JSON.stringify({ t: "fatal", key: this.room ? "full" : "noRoom" }));
      server.close(4004, "room unavailable");
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ id, role } satisfies Attachment);
    await this.saveAndBroadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (!this.room || !attachment || typeof data !== "string" || data.length > 4_096) return;
    let message: ClientMsg;
    try {
      message = JSON.parse(data) as ClientMsg;
    } catch {
      return;
    }
    if (!message || typeof message !== "object" || typeof message.t !== "string") return;
    this.room.handle(attachment.id, message, Date.now());
    await this.saveAndBroadcast();
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    this.drop(socket);
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // Socket already closed.
    }
    await this.saveAndBroadcast();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.drop(socket);
    await this.saveAndBroadcast();
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    if (this.room.expired(Date.now())) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    this.room.advance(Date.now());
    await this.saveAndBroadcast();
  }

  private drop(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (this.room && attachment) {
      const stillConnected = this.ctx.getWebSockets().some((candidate) => candidate !== socket && (candidate.deserializeAttachment() as Attachment | null)?.id === attachment.id);
      this.room.presence(attachment.id, stillConnected, Date.now());
    }
    socket.serializeAttachment(null);
  }

  private async saveAndBroadcast(): Promise<void> {
    const room = this.room;
    if (!room) return;
    await this.ctx.storage.put("room", room.st);
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (!attachment) continue;
      try {
        socket.send(JSON.stringify({ t: "view", view: room.view(attachment.id, attachment.role, now) }));
      } catch {
        // A closing socket is cleaned up by its close handler.
      }
    }
    const wake = room.nextWake();
    if (wake !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 25, wake));
    else if (room.st.members.every((member) => !member.online)) await this.ctx.storage.setAlarm(Date.now() + 3 * 60 * 60_000);
  }
}