import type { ClientMsg, Lang, Role, ServerMsg } from "../room/protocol";

export type ConnectionState = "connecting" | "online" | "offline";
export type MessageHandler = (message: ServerMsg) => void;
export type StatusHandler = (status: ConnectionState) => void;

export interface RoomConnection {
  send(message: ClientMsg): void;
  close(): void;
}

function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

function clientId(role: Role): string {
  const key = "unspottable.id." + role;
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = newClientId();
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return newClientId();
  }
}

export async function createRoom(): Promise<string> {
  const response = await fetch("/api/rooms", { method: "POST" });
  if (!response.ok) throw new Error("create");
  const data = await response.json() as { code?: string };
  if (!data.code || !/^\d{4}$/.test(data.code)) throw new Error("create");
  return data.code;
}

export async function roomExists(code: string): Promise<boolean> {
  const response = await fetch("/api/rooms/" + encodeURIComponent(code), { cache: "no-store" });
  if (!response.ok) return false;
  const data = await response.json() as { exists?: boolean };
  return data.exists === true;
}

export function openRoomClient(
  code: string,
  role: Role,
  name: string,
  lang: Lang,
  onMessage: MessageHandler,
  onStatus: StatusHandler
): RoomConnection {
  let stopped = false;
  let socket: WebSocket | null = null;
  let retry: number | undefined;

  const connect = () => {
    if (stopped) return;
    onStatus("connecting");
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({
      cid: clientId(role),
      role,
      name,
      lang
    });
    socket = new WebSocket(scheme + "//" + location.host + "/api/rooms/" + encodeURIComponent(code) + "/ws?" + query.toString());
    socket.onopen = () => onStatus("online");
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as ServerMsg);
      } catch {
        // Ignore malformed frames; the server will send a fresh view on the next event.
      }
    };
    socket.onerror = () => onStatus("offline");
    socket.onclose = (event) => {
      onStatus("offline");
      if (!stopped && event.code !== 4004 && event.code !== 4003) retry = window.setTimeout(connect, 900);
    };
  };

  connect();
  return {
    send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close() {
      stopped = true;
      if (retry !== undefined) window.clearTimeout(retry);
      socket?.close(1000, "leave");
    }
  };
}