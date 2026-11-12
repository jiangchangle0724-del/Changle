/**
 * 房间的 WebSocket：断了自己回来（退避 0.4、0.8、1.6、最多 2 秒），房间说结束就不再试。
 * 手机网络回来（浏览器的 online 事件）就马上重连，不等退避：关 Wi-Fi 再开要 5 秒内回来，
 * 断网 4 秒时退避已经排到几秒以后，光等它会超时。
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
    if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('online', this.onOnline);
    this.open();
  }

  private readonly onOnline = (): void => {
    if (this.stopped || this.ws?.readyState === WebSocket.OPEN) return;
    // 断网时开的那条可能卡在连接中，扔掉重开
    const stale = this.ws;
    this.ws = null;
    try {
      stale?.close();
    } catch {
      // 已经关了
    }
    this.tries = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.open();
  };

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
    const wait = Math.min(2000, 400 * 2 ** this.tries++);
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
    if (typeof globalThis.removeEventListener === 'function') globalThis.removeEventListener('online', this.onOnline);
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
