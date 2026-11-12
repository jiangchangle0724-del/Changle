/**
 * 一个房间：谁在、几个座位、什么阶段、谁掉线了多久，以及把主机和手柄之间的话送到对面。
 * 纯逻辑：不碰 socket、存储和真实时钟（时钟从外面传进来），所以测试能直接驱动它。
 * src/server/worker.ts 里的 Durable Object 包着它。
 */
import {
  HOST_GRACE_MS,
  IDLE_MS,
  MAX_SEATS,
  PAD_GRACE_MS,
  type ClientMsg,
  type FatalKey,
  type HostAction,
  type LinkMsg,
  type Phase,
  type RelayTo,
  type Role,
  type RoomView,
  type Seat,
  type ServerMsg,
} from '../net/protocol';

export interface SeatData extends Seat {
  /** 掉线的时刻（房间时钟），在线是 null。 */
  leftAt: number | null;
}

/** 房间存的东西（Durable Object storage）。时间都是房间时钟（Date.now()）。 */
export interface RoomData {
  code: string;
  phase: Phase;
  seats: SeatData[];
  hostConnected: boolean;
  hostGoneAt: number | null;
  watchers: number;
  openedAt: number;
  lastActive: number;
}

export interface From {
  role: Role;
  seat: string | null;
}

/** 发给谁：所有人、主机、某个座位；或者把谁踢下线。 */
export type Out = { to: 'all' | 'host' | { seat: string }; msg: ServerMsg } | { close: 'host' | { seat: string }; key: FatalKey };

const ACTIONS = new Set(['START', 'PLAY', 'FINISH', 'LOBBY', 'END', 'KICK']);
/** 每个阶段允许的主机动作和去向。 */
const MOVES: Record<string, Partial<Record<Phase, Phase>>> = {
  // 结算页的「下一关」「再来一次」直接开倒数，不绕回大厅
  START: { lobby: 'countdown', results: 'countdown' },
  PLAY: { countdown: 'playing' },
  FINISH: { playing: 'results' },
  LOBBY: { countdown: 'lobby', playing: 'lobby', results: 'lobby' },
  END: { lobby: 'ended', countdown: 'ended', playing: 'ended', results: 'ended' },
};

export class Room {
  private out: Out[] = [];
  private changed = false;

  constructor(
    public d: RoomData,
    private readonly now: () => number,
  ) {}

  static create(code: string, now: number): RoomData {
    return { code, phase: 'lobby', seats: [], hostConnected: false, hostGoneAt: null, watchers: 0, openedAt: now, lastActive: now };
  }

  expired(): boolean {
    return this.d.phase === 'ended' || this.now() - this.d.lastActive >= IDLE_MS;
  }

  view(): RoomView {
    return {
      code: this.d.code,
      phase: this.d.phase,
      hostConnected: this.d.hostConnected,
      seats: this.d.seats.map(({ id, name, color, connected }) => ({ id, name, color, connected })),
      watchers: this.d.watchers,
      age: this.now() - this.d.openedAt,
    };
  }

  /**
   * 有人连上来。手柄带座位 id：老座位就是回来了，新的分一个（满了拒绝）。
   * 返回 null 表示进来了，否则是拒绝的理由。
   */
  connect(from: From, name?: string): FatalKey | null {
    if (this.d.phase === 'ended') return 'ended';
    this.d.lastActive = this.now();
    if (from.role === 'host') {
      this.d.hostConnected = true;
      this.d.hostGoneAt = null;
      this.touch();
      return null;
    }
    if (from.role === 'watch') {
      this.d.watchers++;
      this.touch();
      return null;
    }
    if (!from.seat) return 'badRequest';
    const seat = this.d.seats.find((s) => s.id === from.seat);
    if (seat) {
      seat.connected = true;
      seat.leftAt = null;
      if (name) seat.name = cleanName(name);
      this.touch();
      return null;
    }
    if (this.d.seats.length >= MAX_SEATS) return 'full';
    const used = new Set(this.d.seats.map((s) => s.color));
    let color = 0;
    while (used.has(color)) color++;
    this.d.seats.push({ id: from.seat, name: cleanName(name), color, connected: true, leftAt: null });
    this.touch();
    return null;
  }

  /** 最后一条连接断了。座位留着等它回来，主机 30 秒不回来房间作废。 */
  disconnect(from: From): void {
    if (from.role === 'host') {
      if (!this.d.hostConnected) return;
      this.d.hostConnected = false;
      this.d.hostGoneAt = this.now();
      this.touch();
      return;
    }
    if (from.role === 'watch') {
      this.d.watchers = Math.max(0, this.d.watchers - 1);
      this.touch();
      return;
    }
    const seat = this.d.seats.find((s) => s.id === from.seat);
    if (!seat || !seat.connected) return;
    seat.connected = false;
    seat.leftAt = this.now();
    this.touch();
  }

  handle(from: From, msg: ClientMsg): void {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'ping':
        this.send(from, { t: 'pong', id: Number(msg.id) || 0, at: this.now() });
        return;
      case 'act':
        if (from.role !== 'host') return;
        this.d.lastActive = this.now();
        this.act(msg.action);
        return;
      case 'relay':
        this.relay(from, msg.to, msg.data);
        return;
    }
  }

  private act(a: HostAction): void {
    if (!a || typeof a !== 'object' || !ACTIONS.has(a.type)) return;
    if (a.type === 'KICK') {
      const i = this.d.seats.findIndex((s) => s.id === String(a.seat));
      if (i < 0) return;
      this.d.seats.splice(i, 1);
      this.out.push({ close: { seat: String(a.seat) }, key: 'kicked' });
      this.touch();
      return;
    }
    const next = MOVES[a.type]?.[this.d.phase];
    if (!next) {
      this.send({ role: 'host', seat: null }, { t: 'error', code: 'bad_phase', message: `${a.type} 不能在 ${this.d.phase} 阶段做` });
      return;
    }
    this.d.phase = next;
    this.touch();
    if (next === 'ended') this.endAll();
  }

  /** 转发：主机 → 某座位，手柄 → 主机。观众不能说话，房间不看内容。 */
  private relay(from: From, to: RelayTo, data: LinkMsg): void {
    if (!data || typeof data !== 'object' || typeof (data as { k?: unknown }).k !== 'string') return;
    if (from.role === 'host') {
      if (!to || typeof to !== 'object' || !this.d.seats.some((s) => s.id === to.seat)) return;
      this.out.push({ to: { seat: to.seat }, msg: { t: 'relay', from: 'host', data } });
      return;
    }
    if (from.role === 'pad' && from.seat && to === 'host' && this.d.seats.some((s) => s.id === from.seat)) {
      if (data.k === 'input') this.d.lastActive = this.now();
      this.out.push({ to: 'host', msg: { t: 'relay', from: { seat: from.seat }, data } });
    }
  }

  /** 房间时钟到了某个期限：主机没回来、座位空太久。 */
  tick(): void {
    const now = this.now();
    if (this.d.hostGoneAt !== null && now - this.d.hostGoneAt >= HOST_GRACE_MS && this.d.phase !== 'ended') {
      this.d.hostGoneAt = null;
      this.d.phase = 'ended';
      this.touch();
      this.endAll();
      return;
    }
    const before = this.d.seats.length;
    this.d.seats = this.d.seats.filter((s) => s.leftAt === null || now - s.leftAt < PAD_GRACE_MS);
    if (this.d.seats.length !== before) this.touch();
  }

  /** 下一个期限（房间时钟），没有就是 null。 */
  nextWake(): number | null {
    const times: number[] = [];
    if (this.d.hostGoneAt !== null) times.push(this.d.hostGoneAt + HOST_GRACE_MS);
    for (const s of this.d.seats) if (s.leftAt !== null) times.push(s.leftAt + PAD_GRACE_MS);
    times.push(this.d.lastActive + IDLE_MS);
    return Math.min(...times);
  }

  flush(): { out: Out[]; changed: boolean } {
    const r = { out: this.out, changed: this.changed };
    this.out = [];
    this.changed = false;
    return r;
  }

  roomMsg(): ServerMsg {
    return { t: 'room', room: this.view() };
  }

  private endAll(): void {
    this.out.push({ close: 'host', key: 'ended' });
    for (const s of this.d.seats) this.out.push({ close: { seat: s.id }, key: 'ended' });
  }

  /** 有变化：存一下，所有人收一份新的房间样子。 */
  private touch(): void {
    this.changed = true;
    this.out.push({ to: 'all', msg: this.roomMsg() });
  }

  private send(from: From, msg: ServerMsg): void {
    if (from.role === 'host') this.out.push({ to: 'host', msg });
    else if (from.role === 'pad' && from.seat) this.out.push({ to: { seat: from.seat }, msg });
  }
}

/** 名字照人打的：去多余空格，最多 12 个字，不能空。 */
export function cleanName(name: string | undefined): string {
  const n = [...(name ?? '').replace(/\s+/g, ' ').trim()].slice(0, 12).join('');
  return n || '糯米团';
}

/** 4 位房间码。 */
export function makeCode(alphabet: string, random: (n: number) => number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[random(alphabet.length)];
  return s;
}
