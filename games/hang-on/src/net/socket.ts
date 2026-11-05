/**
 * 房间的 WebSocket：断了自己回来（退避 0.4、0.8、1.6…最多 5 秒），房间说结束就不再试。
 */
import type { ClientMsg, ServerMsg } from './protocol';

export function wsUrl(code: string, params: Record<string, string>, base = location.origin): string {
  const u = new URL(`/hang-on/api/rooms/${code}/ws`, base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.search = new URLSearchParams(params).toString();
  return u.toString();
}

export class RoomSocket {
  private ws: WebSocket | null = null;
  private tries = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: () => string,
    private readonly onMsg: (m: ServerMsg) => void,
    private readonly onStatus: (open: boolean) => void,
  ) {
    this.open();
  }

  private open(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.retry();
      return;
    }
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
      if (m.t === 'fatal') this.stopped = true;
      this.onMsg(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus(false);
      this.retry();
    };
    ws.onerror = () => {
      // onclose 紧跟着来
    };
  }

  private retry(): void {
    if (this.stopped || this.timer) return;
    const wait = Math.min(5000, 400 * 2 ** this.tries++);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, wait);
  }

  send(m: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** 马上断开并立刻重连（测试「关 Wi-Fi 再开」用）。 */
  kick(): void {
    const ws = this.ws;
    if (ws) {
      this.ws = null;
      try {
        ws.close();
      } catch {
        // 已经关了
      }
      this.onStatus(false);
    }
    this.tries = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.open();
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      // 已经关了
    }
  }
}
