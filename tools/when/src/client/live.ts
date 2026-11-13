// Keeping a gathering's page up to date. The server pushes the gathering over a WebSocket whenever
// it changes. When the socket is down (WeChat suspends a page that isn't in front; some networks
// block sockets), the page asks again every ten seconds instead, and the moment it comes back to
// the front. Saving never goes through the socket, so nothing typed is lost with it.
import { BASE } from "../base";
import type { EventState } from "../engine/types";
import type { Push } from "../room/protocol";

export type Watcher = {
  /** the gathering, as pushed */
  state(state: EventState): void;
  gone(): void;
  /** true while the socket is open */
  live(on: boolean): void;
  /** time to fetch the gathering the ordinary way */
  refresh(): void;
};

const RETRY_MS = [1000, 2000, 5000, 10_000];
const POLL_MS = 10_000;
const PING_MS = 30_000;

/** Start watching; the function it returns stops. */
export function watch(code: string, on: Watcher): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let tries = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const open = () => {
    if (stopped || (socket && socket.readyState <= WebSocket.OPEN)) return;
    clearTimeout(retry);
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${BASE}/api/e/${code}/ws`);
    } catch {
      return again();
    }
    socket = ws;
    ws.onopen = () => {
      tries = 0;
      on.live(true);
      clearInterval(ping);
      ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), PING_MS);
    };
    ws.onmessage = (event) => {
      if (event.data === "pong") return;
      try {
        const push = JSON.parse(String(event.data)) as Push;
        if (push.t === "state") on.state(push.state);
        else if (push.t === "gone") on.gone();
      } catch {
        // not ours
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      clearInterval(ping);
      on.live(false);
      again();
    };
    ws.onerror = () => ws.close();
  };

  const again = () => {
    if (stopped) return;
    clearTimeout(retry);
    retry = setTimeout(open, RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)]);
  };

  const poll = setInterval(() => {
    if (!stopped && document.visibilityState === "visible" && socket?.readyState !== WebSocket.OPEN) on.refresh();
  }, POLL_MS);

  const front = () => {
    if (document.visibilityState !== "visible") return;
    on.refresh();
    tries = 0;
    open();
  };
  document.addEventListener("visibilitychange", front);
  window.addEventListener("online", front);
  window.addEventListener("pageshow", front);

  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(ping);
    clearInterval(poll);
    document.removeEventListener("visibilitychange", front);
    window.removeEventListener("online", front);
    window.removeEventListener("pageshow", front);
    const ws = socket;
    socket = null;
    ws?.close();
  };
}
