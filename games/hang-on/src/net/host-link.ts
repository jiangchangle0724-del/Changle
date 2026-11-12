/**
 * 主机这头的链路：开房、收座位、给每个手柄发 WebRTC offer、开一条不可靠无序的数据通道收输入，
 * 每 250 ms 量一次往返，直连 3 秒没通就标成「绕路」（输入照样经房间转过来）。
 * 手柄每次（重新）连上房间会说 hello，主机就重新发 offer，所以关 Wi-Fi 再开也能回来。
 */
import { cleanLook, DEFAULT_LOOK, type Look } from '../look';
import { RttMeter } from './latency';
import {
  DIRECT_TIMEOUT_MS,
  PING_MS,
  type FatalKey,
  type HostAction,
  type LinkMsg,
  type PadInput,
  type PadStatus,
  type RelayTo,
  type RoomView,
  type ServerMsg,
} from './protocol';
import { ICE_SERVERS } from './ice';
import { RoomSocket, wsUrl } from './socket';

export interface PadPeer {
  seat: string;
  name: string;
  color: number;
  /** 手柄的 WebSocket 在不在。 */
  connected: boolean;
  /** 数据通道开着。 */
  direct: boolean;
  /** 直连等过了 3 秒还没通（或断了），在走中转。 */
  relayed: boolean;
  rtt: RttMeter;
  /** 手柄选的样子。 */
  look: Look;
  input: PadInput | null;
  /** 上一条输入到的时刻（performance.now()）。 */
  lastInputAt: number;
  pc: RTCPeerConnection | null;
  dc: RTCDataChannel | null;
  directTimer: ReturnType<typeof setTimeout> | null;
}

export interface HostLinkEvents {
  onRoom?(room: RoomView): void;
  onPeers?(peers: PadPeer[]): void;
  onInput?(peer: PadPeer, input: PadInput): void;
  onLook?(peer: PadPeer, look: Look): void;
  onFatal?(key: FatalKey): void;
  onSocket?(open: boolean): void;
}

/** 开一个房间，拿到房间码。 */
export async function openRoom(base = location.origin): Promise<string> {
  const res = await fetch(new URL('/hang-on/api/rooms', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`开房失败 ${res.status}`);
  const { code } = (await res.json()) as { code: string };
  return code;
}

export class HostLink {
  readonly peers = new Map<string, PadPeer>();
  room: RoomView | null = null;
  private readonly sock: RoomSocket;
  private pingId = 1;
  private readonly pending = new Map<string, Map<number, number>>();
  /** 每条直连在 answer 装好之前收到的 ICE 候选；换了新连接旧的自然作废。 */
  private readonly earlyIce = new WeakMap<RTCPeerConnection, RTCIceCandidateInit[]>();
  private pingTimer: ReturnType<typeof setInterval>;
  /** 测试用：true 时不发 offer，所有手柄都走中转。 */
  forceRelay = false;

  constructor(
    readonly code: string,
    private readonly ev: HostLinkEvents = {},
    base = location.origin,
  ) {
    this.sock = new RoomSocket(
      () => wsUrl(code, { role: 'host' }, base),
      (m) => this.onMsg(m),
      (open) => this.ev.onSocket?.(open),
    );
    this.pingTimer = setInterval(() => this.pingAll(), PING_MS);
  }

  get socketOpen(): boolean {
    return this.sock.isOpen;
  }

  act(action: HostAction): void {
    this.sock.send({ t: 'act', action });
  }

  /** 给一个手柄发小包：直连走通道，不然绕房间。 */
  status(seat: string, s: PadStatus): void {
    const p = this.peers.get(seat);
    if (!p) return;
    this.send(p, { k: 'status', s });
  }

  /** 关掉一切（离开页面）。 */
  close(): void {
    clearInterval(this.pingTimer);
    for (const p of this.peers.values()) this.dropPeer(p);
    this.sock.close();
  }

  private onMsg(m: ServerMsg): void {
    switch (m.t) {
      case 'room':
        this.room = m.room;
        this.syncPeers(m.room);
        this.ev.onRoom?.(m.room);
        return;
      case 'relay': {
        if (m.from === 'host') return;
        const p = this.peers.get(m.from.seat);
        if (p) this.onLink(p, m.data, false);
        return;
      }
      case 'fatal':
        this.ev.onFatal?.(m.key);
        return;
      default:
        return;
    }
  }

  private syncPeers(room: RoomView): void {
    const seen = new Set<string>();
    for (const s of room.seats) {
      seen.add(s.id);
      let p = this.peers.get(s.id);
      if (!p) {
        p = { seat: s.id, name: s.name, color: s.color, connected: s.connected, direct: false, relayed: false, rtt: new RttMeter(), look: DEFAULT_LOOK, input: null, lastInputAt: 0, pc: null, dc: null, directTimer: null };
        this.peers.set(s.id, p);
      }
      p.name = s.name;
      p.color = s.color;
      // 它的 WebSocket 掉了也先不动通道：通道可能还活着；它回来会说 hello，那时再换新的
      p.connected = s.connected;
    }
    for (const [seat, p] of [...this.peers]) {
      if (!seen.has(seat)) {
        this.dropPeer(p);
        this.peers.delete(seat);
      }
    }
    this.ev.onPeers?.([...this.peers.values()]);
  }

  /** 手柄说的话，不管是从通道还是绕房间来的。 */
  private onLink(p: PadPeer, data: LinkMsg, viaDirect: boolean): void {
    switch (data.k) {
      case 'hello':
        void this.offer(p);
        return;
      case 'look':
        p.look = cleanLook(data.look);
        this.ev.onLook?.(p, p.look);
        return;
      case 'sdp':
        if (data.sdp.type === 'answer' && p.pc) void this.acceptAnswer(p.pc, data.sdp);
        return;
      case 'ice': {
        const pc = p.pc;
        if (!pc || !data.ice) return;
        // answer 还没装好就先到的候选先存着（手柄那边也是这样），装好再补上
        if (pc.remoteDescription) void pc.addIceCandidate(data.ice).catch(() => undefined);
        else this.earlyIce.set(pc, [...(this.earlyIce.get(pc) ?? []), data.ice]);
        return;
      }
      case 'pong': {
        const sent = this.pending.get(p.seat)?.get(data.id);
        if (sent !== undefined) {
          this.pending.get(p.seat)?.delete(data.id);
          p.rtt.add(performance.now() - sent);
        }
        return;
      }
      case 'input': {
        const i = data.i;
        if (!i || typeof i !== 'object') return;
        // 不可靠无序通道：比收到过的旧的直接丢
        if (p.input && typeof i.seq === 'number' && typeof p.input.seq === 'number' && i.seq <= p.input.seq) return;
        if (viaDirect && !p.direct) p.direct = true;
        p.input = i;
        p.lastInputAt = performance.now();
        this.ev.onInput?.(p, i);
        return;
      }
      default:
        return;
    }
  }

  private async acceptAnswer(pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      await pc.setRemoteDescription(sdp);
    } catch {
      return;
    }
    const early = this.earlyIce.get(pc) ?? [];
    this.earlyIce.delete(pc);
    for (const c of early) void pc.addIceCandidate(c).catch(() => undefined);
  }

  private async offer(p: PadPeer): Promise<void> {
    this.dropPeer(p);
    if (this.forceRelay) {
      p.relayed = true;
      this.ev.onPeers?.([...this.peers.values()]);
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    p.pc = pc;
    const dc = pc.createDataChannel('pad', { ordered: false, maxRetransmits: 0 });
    p.dc = dc;
    dc.onopen = () => {
      if (p.dc !== dc) return;
      p.direct = true;
      p.relayed = false;
      if (p.directTimer) clearTimeout(p.directTimer);
      p.directTimer = null;
      this.ev.onPeers?.([...this.peers.values()]);
    };
    dc.onclose = () => {
      if (p.dc !== dc) return;
      p.direct = false;
      p.relayed = true;
      this.ev.onPeers?.([...this.peers.values()]);
    };
    dc.onmessage = (e) => {
      let m: LinkMsg;
      try {
        m = JSON.parse(String(e.data)) as LinkMsg;
      } catch {
        return;
      }
      this.onLink(p, m, true);
    };
    pc.onicecandidate = (e) => {
      const c = e.candidate;
      this.relay(p.seat, { k: 'ice', ice: c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } : null });
    };
    pc.onconnectionstatechange = () => {
      if (p.pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        p.direct = false;
        p.relayed = true;
        this.ev.onPeers?.([...this.peers.values()]);
      }
    };
    p.directTimer = setTimeout(() => {
      p.directTimer = null;
      if (!p.direct) {
        p.relayed = true;
        this.ev.onPeers?.([...this.peers.values()]);
      }
    }, DIRECT_TIMEOUT_MS);
    try {
      const offer = await pc.createOffer();
      if (p.pc !== pc) return;
      await pc.setLocalDescription(offer);
      if (p.pc !== pc || !pc.localDescription) return;
      this.relay(p.seat, { k: 'sdp', sdp: { type: 'offer', sdp: pc.localDescription.sdp } });
    } catch {
      p.relayed = true;
      this.ev.onPeers?.([...this.peers.values()]);
    }
  }

  private dropPeer(p: PadPeer): void {
    if (p.directTimer) clearTimeout(p.directTimer);
    p.directTimer = null;
    const { pc, dc } = p;
    p.pc = null;
    p.dc = null;
    p.direct = false;
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
    this.pending.delete(p.seat);
  }

  private pingAll(): void {
    const now = performance.now();
    for (const p of this.peers.values()) {
      if (!p.connected) continue;
      const id = this.pingId++;
      let map = this.pending.get(p.seat);
      if (!map) {
        map = new Map();
        this.pending.set(p.seat, map);
      }
      map.set(id, now);
      if (map.size > 16) map.delete(map.keys().next().value as number);
      this.send(p, { k: 'ping', id, at: now });
    }
  }

  /** 通道开着走通道，不然绕房间。 */
  private send(p: PadPeer, m: LinkMsg): void {
    if (p.dc && p.dc.readyState === 'open') {
      try {
        p.dc.send(JSON.stringify(m));
        return;
      } catch {
        // 掉到下面绕路
      }
    }
    this.relay(p.seat, m);
  }

  private relay(seat: string, data: LinkMsg): void {
    const to: RelayTo = { seat };
    this.sock.send({ t: 'relay', to, data });
  }
}
