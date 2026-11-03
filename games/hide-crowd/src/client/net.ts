// The phone's line to its room on the server (a WebSocket), reconnecting by itself.
import type { ClientMsg, Lang, Role, RoomInfo, ServerMsg } from "../room/protocol";
import { BASE } from "./base";

export type ConnectionState = "connecting" | "online" | "offline";
export type MessageHandler = (message: ServerMsg) => void;
export type StatusHandler = (status: ConnectionState) => void;

export interface RoomConnection {
  send(message: ClientMsg): void;
  close(): void;
}

/** A new room (the computer's own start page; on changle.ca the table opens it). */
export async function createRoom(): Promise<string> {
  const response = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!response.ok) throw new Error("create");
  const data = (await response.json()) as { code?: string };
  if (!data.code || !/^\d{4}$/.test(data.code)) throw new Error("create");
  return data.code;
}

export async function roomInfo(code: string): Promise<RoomInfo> {
  const response = await fetch(`${BASE}/api/rooms/${encodeURIComponent(code)}`, { cache: "no-store" });
  if (!response.ok) return { exists: false };
  return (await response.json()) as RoomInfo;
}

export function openRoomClient(
  code: string,
  role: Role,
  id: string,
  name: string,
  lang: Lang,
  onMessage: MessageHandler,
  onStatus: StatusHandler
): RoomConnection {
  let stopped = false;
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  let tries = 0;

  const connect = () => {
    if (stopped) return;
    onStatus("connecting");
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({ cid: id, role, name, lang });
    socket = new WebSocket(`${scheme}//${location.host}${BASE}/api/rooms/${encodeURIComponent(code)}/ws?${query}`);
    socket.onopen = () => {
      tries = 0;
      onStatus("online");
    };
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as ServerMsg);
      } catch {
        // a broken frame: the next one brings the whole picture again
      }
    };
    socket.onerror = () => onStatus("offline");
    socket.onclose = (event) => {
      onStatus("offline");
      // 4004: the room said no (gone, full, or not this device): don't knock again
      if (!stopped && event.code !== 4004) {
        tries++;
        retry = window.setTimeout(connect, Math.min(4_000, 600 + tries * 400));
      }
    };
  };

  // back from the background (a locked phone): reconnect at once rather than wait for the timer
  const wake = () => {
    if (document.visibilityState === "visible" && socket && socket.readyState === WebSocket.CLOSED && !stopped) {
      if (retry !== undefined) window.clearTimeout(retry);
      connect();
    }
  };
  document.addEventListener("visibilitychange", wake);

  connect();
  return {
    send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close() {
      stopped = true;
      document.removeEventListener("visibilitychange", wake);
      if (retry !== undefined) window.clearTimeout(retry);
      socket?.close(1000, "leave");
    }
  };
}
