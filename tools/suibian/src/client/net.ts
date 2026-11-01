// Talking to the room. The WebSocket reconnects by itself (phone locked, network switched,
// app backgrounded), and the server puts this phone back in its seat using its id + key.
// Paths here are the server's ("/api/…"); BASE (/eat) is put in front of them in one place.
import { BASE } from "../base";
import type { ClientMsg, Lang, ServerMsg } from "../room/protocol";

export type Status = "idle" | "connecting" | "open" | "reconnecting" | "fatal";

export interface Conn {
  send(msg: ClientMsg): void;
  close(): void;
}

export interface Handlers {
  onMsg(msg: ServerMsg): void;
  onStatus(status: Status, why?: string): void;
}

export interface JoinInfo {
  cid: string;
  key: string;
  name: string;
  lang: Lang;
}

export function connectWs(code: string, info: JoinInfo, h: Handlers): Conn {
  let ws: WebSocket | null = null;
  let closed = false;
  let tries = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let lastMsg = 0;
  // What was sent while the socket was down (the latest of each kind), sent again once it's back,
  // so a diet card saved while reconnecting isn't lost.
  const outbox = new Map<ClientMsg["t"], ClientMsg>();

  const open = () => {
    if (closed) return;
    h.onStatus(tries ? "reconnecting" : "connecting");
    const url = new URL(`${BASE}/api/rooms/${code}/ws`, location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.search = new URLSearchParams({ cid: info.cid, key: info.key, name: info.name, lang: info.lang }).toString();
    const sock = new WebSocket(url.toString());
    ws = sock;
    sock.onopen = () => {
      tries = 0;
      lastMsg = Date.now();
      h.onStatus("open");
      for (const m of outbox.values()) sock.send(JSON.stringify(m));
      outbox.clear();
    };
    sock.onmessage = (e) => {
      lastMsg = Date.now();
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.t === "fatal") {
        closed = true;
        h.onStatus("fatal", msg.key);
      }
      h.onMsg(msg);
    };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (!closed) later();
    };
    sock.onerror = () => {
      try {
        sock.close();
      } catch {
        // ignore
      }
    };
  };

  const later = () => {
    clearTimeout(retry);
    h.onStatus("reconnecting");
    retry = setTimeout(open, Math.min(5000, 300 * 2 ** tries++));
  };

  const wake = () => {
    if (closed || (ws && ws.readyState <= 1)) return;
    clearTimeout(retry);
    tries = Math.min(tries, 1);
    open();
  };

  const onVisible = () => document.visibilityState === "visible" && wake();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", wake);
  window.addEventListener("pageshow", wake);
  const pinger = setInterval(() => {
    if (!ws || ws.readyState !== 1) return;
    // A socket that went quiet after the phone slept is often dead without saying so.
    if (Date.now() - lastMsg > 40_000) return ws.close();
    ws.send(JSON.stringify({ t: "ping" }));
  }, 15_000);

  open();
  return {
    send(msg) {
      if (ws && ws.readyState === 1) return ws.send(JSON.stringify(msg));
      if (msg.t === "ping") return;
      outbox.delete(msg.t);
      outbox.set(msg.t, msg);
    },
    close() {
      closed = true;
      clearInterval(pinger);
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      ws?.close();
    },
  };
}

/** Call the server; `path` is the server's own ("/api/me"), BASE is added here. */
export async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}
