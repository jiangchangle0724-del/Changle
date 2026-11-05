/**
 * 手柄这头的链路：连房间，每次连上就对主机说 hello，收到 offer 就答，拿到数据通道就把每帧输入
 * 从通道发；通道没开就绕房间（30 Hz）。主机的 ping 原路回，小包交给页面。
 */
import {
  RELAY_INPUT_HZ,
  type FatalKey,
  type LinkMsg,
  type PadInput,
  type PadStatus,
  type RoomView,
  type ServerMsg,
} from './protocol';
import { RoomSocket, wsUrl } from './socket';
import { ICE_SERVERS } from './ice';

export interface PadLinkEvents {
  onRoom?(room: RoomView): void;
  onStatus?(s: PadStatus): void;
  onFatal?(key: FatalKey): void;
  /** 连接状态变了：房间的 WebSocket 在不在、数据通道通没通。 */
  onConn?(c: { socket: boolean; direct: boolean }): void;
}

/** 这台手机的座位 id，存起来，刷新、换 Wi-Fi 都还是同一个座位。 */
export function seatId(): string {
  const key = 'hang-on:seat';
  try {
    const s = localStorage.getItem(key);
    if (s && /^[A-Za-z0-9_-]{8,64}$/.test(s)) return s;
  } catch {
    // 没有存储就现做一个
  }
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  const id = Array.from(a, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');
  try {
    localStorage.setItem(key, id);
  } catch {
    // 记不住就记不住
  }
  return id;
}

export class PadLink {
  room: RoomView | null = null;
  private readonly sock: RoomSocket;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private direct = false;
  private socketOpen = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private lastRelayAt = 0;
  private seq = 1;

  constructor(
    readonly code: string,
    readonly seat: string,
    name: string,
    private readonly ev: PadLinkEvents = {},
    base = location.origin,
  ) {
    this.sock = new RoomSocket(
      () => wsUrl(code, { role: 'pad', id: seat, name }, base),
      (m) => this.onMsg(m),
      (open) => {
        this.socketOpen = open;
        if (open) this.relay({ k: 'hello' });
        this.ev.onConn?.({ socket: open, direct: this.direct });
      },
    );
  }

  get isDirect(): boolean {
    return this.direct;
  }

  get isSocketOpen(): boolean {
    return this.socketOpen;
  }

  /** 每帧一条，只发最新状态。通道开着每帧都发；绕路时限到 30 Hz。 */
  send(input: Omit<PadInput, 'seq' | 't'>): void {
    const i: PadInput = { ...input, seq: this.seq++, t: performance.now() };
    const m: LinkMsg = { k: 'input', i };
    if (this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(JSON.stringify(m));
        return;
      } catch {
        // 掉到下面绕路
      }
    }
    const now = performance.now();
    if (now - this.lastRelayAt < 1000 / RELAY_INPUT_HZ) return;
    this.lastRelayAt = now;
    this.relay(m);
  }

  /** 测试「关 Wi-Fi 再开」：把房间连接和直连都掐断，看多久回来。 */
  simulateDrop(): void {
    this.dropPeer();
    this.sock.kick();
  }

  close(): void {
    this.dropPeer();
    this.sock.close();
  }

  private onMsg(m: ServerMsg): void {
    switch (m.t) {
      case 'room':
        this.room = m.room;
        this.ev.onRoom?.(m.room);
        return;
      case 'relay':
        if (m.from === 'host') this.onLink(m.data, false);
        return;
      case 'fatal':
        this.ev.onFatal?.(m.key);
        return;
      default:
        return;
    }
  }

  private onLink(data: LinkMsg, viaDirect: boolean): void {
    switch (data.k) {
      case 'sdp':
        if (data.sdp.type === 'offer') void this.answer({ type: 'offer', sdp: data.sdp.sdp });
        return;
      case 'ice':
        if (!data.ice) return;
        if (this.pc && this.pc.remoteDescription) void this.pc.addIceCandidate(data.ice).catch(() => undefined);
        else this.pendingIce.push(data.ice);
        return;
      case 'ping': {
        const pong: LinkMsg = { k: 'pong', id: data.id, at: data.at };
        if (viaDirect && this.dc && this.dc.readyState === 'open') {
          try {
            this.dc.send(JSON.stringify(pong));
            return;
          } catch {
            // 绕路
          }
        }
        this.relay(pong);
        return;
      }
      case 'status':
        this.ev.onStatus?.(data.s);
        return;
      default:
        return;
    }
  }

  private async answer(offer: { type: 'offer'; sdp: string }): Promise<void> {
    this.dropPeer();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.ondatachannel = (e) => {
      if (this.pc !== pc) return;
      const dc = e.channel;
      this.dc = dc;
      dc.onopen = () => {
        if (this.dc !== dc) return;
        this.direct = true;
        this.ev.onConn?.({ socket: this.socketOpen, direct: true });
      };
      dc.onclose = () => {
        if (this.dc !== dc) return;
        this.direct = false;
        this.ev.onConn?.({ socket: this.socketOpen, direct: false });
      };
      dc.onmessage = (ev) => {
        let m: LinkMsg;
        try {
          m = JSON.parse(String(ev.data)) as LinkMsg;
        } catch {
          return;
        }
        this.onLink(m, true);
      };
    };
    pc.onicecandidate = (e) => {
      const c = e.candidate;
      this.relay({ k: 'ice', ice: c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } : null });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.direct = false;
        this.ev.onConn?.({ socket: this.socketOpen, direct: false });
      }
    };
    try {
      await pc.setRemoteDescription(offer);
      if (this.pc !== pc) return;
      for (const c of this.pendingIce) void pc.addIceCandidate(c).catch(() => undefined);
      this.pendingIce = [];
      const answer = await pc.createAnswer();
      if (this.pc !== pc) return;
      await pc.setLocalDescription(answer);
      if (this.pc !== pc || !pc.localDescription) return;
      this.relay({ k: 'sdp', sdp: { type: 'answer', sdp: pc.localDescription.sdp } });
    } catch {
      // 这次没谈成；主机下次 hello 再来
    }
  }

  private dropPeer(): void {
    const { pc, dc } = this;
    this.pc = null;
    this.dc = null;
    this.pendingIce = [];
    if (this.direct) {
      this.direct = false;
      this.ev.onConn?.({ socket: this.socketOpen, direct: false });
    }
    try {
      dc?.close();
    } catch {
      // 没开过
    }
    try {
      pc?.close();
    } catch {
      // 没开过
    }
  }

  private relay(data: LinkMsg): void {
    this.sock.send({ t: 'relay', to: 'host', data });
  }
}
