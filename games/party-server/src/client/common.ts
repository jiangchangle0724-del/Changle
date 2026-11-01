// What both pages share: the language, the room's WebSocket, clock sync and the screen wake lock.
import { estimateClockOffset, type ClockOffsetEstimate, type ClockProbe } from "../../../party-base/src/index";
import type { ClientMsg, ServerMsg } from "../shared/protocol";

export type Lang = "zh" | "en";

let lang: Lang = (() => {
  try {
    const saved = localStorage.getItem("party:lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // (no storage: the browser's language decides)
  }
  return /^zh/i.test(navigator.language) ? "zh" : "en";
})();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  try {
    localStorage.setItem("party:lang", l);
  } catch {
    // fine: it just won't be remembered
  }
}
/** The text in the page's language. */
export const tr = (zh: string, en: string) => (lang === "zh" ? zh : en);

/** An element, with text set safely. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function wsUrl(code: string, params: Record<string, string>): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/party/api/rooms/${code}/ws?${new URLSearchParams(params)}`;
}

/** The room's WebSocket. It comes back by itself after a drop, until the room says it's over. */
export class RoomSocket {
  private ws: WebSocket | null = null;
  private tries = 0;
  private stopped = false;

  constructor(
    private readonly url: () => string,
    private readonly onMsg: (m: ServerMsg) => void,
    private readonly onStatus: (open: boolean) => void,
  ) {
    this.open();
  }

  private open() {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.onStatus(true);
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (m.t === "fatal") this.stopped = true;
      this.onMsg(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.onStatus(false);
      if (!this.stopped) setTimeout(() => this.open(), Math.min(5000, 400 * 2 ** this.tries++));
    };
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * How this page's clock relates to another (the speaker's, for a phone; the room's, for the
 * speaker), NTP-style: pings out, the other clock's reading back, and party-base's
 * estimateClockOffset() over the recent probes, which keeps the ones with the shortest round trip.
 * remote ≈ performance.now() + estimate().offsetMs
 */
export class ClockSync {
  private probes: ClockProbe[] = [];
  private pending = new Map<number, number>();
  private nextId = 1;

  constructor(
    private readonly sendPing: (id: number) => void,
    private readonly keep = 16,
  ) {}

  ping(): void {
    const id = this.nextId++;
    this.pending.set(id, performance.now());
    if (this.pending.size > 32) this.pending.delete(this.pending.keys().next().value as number);
    this.sendPing(id);
  }

  /** A pong came: the other clock's reading when the ping got there (null: it isn't known yet). */
  pong(id: number, remoteAt: number | null): boolean {
    const receivedAt = performance.now();
    const sentAt = this.pending.get(id);
    this.pending.delete(id);
    if (sentAt === undefined || remoteAt === null) return false;
    this.probes.push({ sentAt, speakerAt: remoteAt, receivedAt });
    if (this.probes.length > this.keep) this.probes.shift();
    return true;
  }

  estimate(): ClockOffsetEstimate {
    return estimateClockOffset(this.probes);
  }

  get count(): number {
    return this.probes.length;
  }
}

/** Keeps the screen on while the page is open (asked again when the page comes back into view). */
export class ScreenAwake {
  private lock: { release(): Promise<void> } | null = null;
  private wanted = false;

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (this.wanted && document.visibilityState === "visible") void this.request();
    });
  }

  async on(): Promise<boolean> {
    this.wanted = true;
    return this.request();
  }

  get held(): boolean {
    return this.lock !== null;
  }

  private async request(): Promise<boolean> {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void>; addEventListener(t: "release", f: () => void): void }> } }).wakeLock;
    if (!wl) return false;
    try {
      const lock = await wl.request("screen");
      lock.addEventListener("release", () => {
        if (this.lock === lock) this.lock = null;
      });
      this.lock = lock;
      return true;
    } catch {
      return false;
    }
  }
}

/** Speaker time shown as seconds with milliseconds, for the side-by-side photo that measures sync. */
export const clockText = (ms: number) => (ms / 1000).toFixed(3);
