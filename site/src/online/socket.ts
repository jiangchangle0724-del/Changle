import type { ClientMsg, ErrorCode, ServerMsg } from "../shared/protocol";
import { wsUrl } from "./config";
import { sessionToken } from "../lib/api";

export type Status = "connecting" | "open" | "reconnecting" | "stopped";
export type Stop = { kind: "error"; code: ErrorCode } | { kind: "replaced" } | { kind: "left" };

type Handlers = {
  onStatus: (s: Status) => void;
  onMessage: (m: ServerMsg) => void;
  onStop: (why: Stop) => void;
  onOffset: (ms: number) => void;
  /** a binary message (the DJ booth's song files, passed on by the rooms server to a big screen) */
  onBytes?: (data: ArrayBuffer) => void;
};

const PING_MS = 15_000;
const SILENT_MS = 40_000;

/**
 * One phone's line to its table. Says hello on every (re)connect, keeps the clock in step
 * with the server, and comes back on its own after the phone sleeps or the network drops.
 */
export class RoomSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  private watchdog: number | null = null;
  private stopped = false;
  private bestRtt = Infinity;
  private lastHeard = 0;
  private queue: ClientMsg[] = [];
  status: Status = "connecting";

  constructor(
    private code: string,
    private pid: string,
    private name: string,
    private create: boolean,
    private h: Handlers,
    /** a big screen (TV or computer) watching the table, and the game it opens with */
    private as: { screen?: boolean; game?: string } = {},
  ) {}

  start() {
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("online", this.onOnline);
    this.open();
  }

  stop(why?: Stop) {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("online", this.onOnline);
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000, "bye");
    } catch {
      /* already closed */
    }
    this.setStatus("stopped");
    if (why) this.h.onStop(why);
  }

  /** Send now if the line is up; actions taken while reconnecting wait (a few) for it. */
  send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.status === "open") {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    if (msg.t === "act" && this.queue.length < 8) this.queue.push(msg);
    return false;
  }

  /** Send bytes now if the line is up (else nothing: the caller tries again). */
  sendBytes(data: ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status !== "open") return false;
    this.ws.send(data);
    return true;
  }

  /** Bytes sent but not yet on their way (the caller waits for a big file to drain). */
  get buffered() {
    return this.ws?.bufferedAmount ?? 0;
  }

  rename(name: string) {
    this.name = name;
  }

  /** Say hello again on the open line (after signing in or out, so the seat shows the right face). */
  rehello() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.status === "open") this.sayHello(this.ws);
  }

  private sayHello(ws: WebSocket) {
    // signed in? the table learns who you are (face, history) from the session, never from the name
    const auth = sessionToken() || undefined;
    if (this.as.screen) {
      ws.send(JSON.stringify({ t: "hello", pid: this.pid, name: "", create: this.create, screen: true, game: this.as.game } satisfies ClientMsg));
      return;
    }
    ws.send(JSON.stringify({ t: "hello", pid: this.pid, name: this.name, create: this.create, auth } satisfies ClientMsg));
  }

  /** Try again right away (after "opened elsewhere", or a tap on the banner). */
  kick() {
    if (this.stopped) return;
    this.attempts = 0;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ping();
      return;
    }
    this.clearRetry();
    this.open();
  }

  private setStatus(s: Status) {
    if (this.status === s) return;
    this.status = s;
    this.h.onStatus(s);
  }

  private open() {
    if (this.stopped) return;
    this.clearTimers();
    this.setStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(this.code));
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.lastHeard = Date.now();
      this.sayHello(ws);
      this.ping();
      this.pingTimer = window.setInterval(() => this.ping(), PING_MS);
      this.watchdog = window.setInterval(() => {
        if (Date.now() - this.lastHeard > SILENT_MS) this.drop();
      }, 5000);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.lastHeard = Date.now();
      if (e.data instanceof ArrayBuffer) {
        this.h.onBytes?.(e.data);
        return;
      }
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === "pong") {
        const rtt = Date.now() - msg.c;
        this.bestRtt *= 1.15; // let a better path win later
        if (rtt <= this.bestRtt) {
          this.bestRtt = rtt;
          this.h.onOffset(msg.s - (msg.c + rtt / 2));
        }
        return;
      }
      if (msg.t === "error") {
        this.stop({ kind: "error", code: msg.code });
        return;
      }
      if (msg.t === "room") {
        if (this.status !== "open") {
          this.attempts = 0;
          this.create = false; // only the very first hello opens a table
          this.setStatus("open");
          const waiting = this.queue.splice(0);
          for (const m of waiting) ws.send(JSON.stringify(m));
        }
        if (this.bestRtt === Infinity) this.h.onOffset(msg.now - Date.now());
      }
      this.h.onMessage(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.stopped) return;
      if (e.code === 4000) {
        this.stop({ kind: "replaced" });
        return;
      }
      if (e.code === 4001) {
        this.stop({ kind: "error", code: "kicked" });
        return;
      }
      if (e.code === 4004) return; // the error message already stopped us
      this.retry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private ping() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: "ping", c: Date.now() } satisfies ClientMsg));
  }

  /** A socket that went quiet (the phone slept through it): close it and dial again. */
  private drop() {
    const ws = this.ws;
    this.ws = null;
    this.clearTimers();
    try {
      ws?.close();
    } catch {
      /* gone */
    }
    this.retry(true);
  }

  private retry(now = false) {
    if (this.stopped) return;
    this.attempts += 1;
    this.setStatus("reconnecting");
    const delay = now ? 150 : Math.min(8000, 300 * Math.pow(1.9, this.attempts - 1)) * (0.8 + Math.random() * 0.4);
    this.clearRetry();
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }

  private onVisible = () => {
    if (document.visibilityState !== "visible" || this.stopped) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.attempts = 0;
      this.clearRetry();
      this.open();
      return;
    }
    // the socket may be a ghost after sleep: if nothing answers soon, redial
    const asked = Date.now();
    this.ping();
    window.setTimeout(() => {
      if (!this.stopped && this.lastHeard < asked) this.drop();
    }, 3500);
  };

  private onOnline = () => {
    if (!this.ws) this.kick();
  };

  private clearRetry() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearTimers() {
    this.clearRetry();
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    if (this.watchdog !== null) window.clearInterval(this.watchdog);
    this.pingTimer = null;
    this.watchdog = null;
  }
}
