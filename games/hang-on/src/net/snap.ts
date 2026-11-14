/**
 * 手机局的画面快照：主机把局面压成 Snap 发出去，别的手机拼成 RemoteSim 交给同一套画面（Stage）画。
 *
 * 平滑：每来一张快照，从「现在画着的样子」到「新快照」在一个快照间隔里匀过去（比主机晚一个间隔，
 * 直连约 50 ms），所以 20 Hz 的快照画出来也是顺的。蜡烛被弹的动画、饼干的倒计时、时钟在两张之间
 * 照本地时间往前走。人数、绳数这种结构变了就直接跳过去，不匀。
 *
 * 这个文件不引物理（只要类型），手机的画面包里不会带 Rapier。
 */
import { forPlayers, gateAt, type GateDef, type Level, type Pt } from '../physics/level';
import type { Face, Rules, SimEvent } from '../physics/world';
import { ITEM_IDS, type ItemId } from '../items';
import type { FadingView, GateView, NoodleView, PlateView, PlayerView, PropView, RopeView, SimView, SpringView } from '../render/view';
import { SNAP_EVENT_SENDS, SNAP_EVENTS_MAX, type Snap } from './protocol';

export const FACES: Face[] = ['idle', 'grab', 'fly', 'scream', 'win'];
/** 一个人一行的长度：10 个标量 + 两条胳膊（各 8 个坐标 + 抓了几秒）+ 道具（A9：哪样、还剩几秒）。 */
const PLAYER_LEN = 10 + 2 * 9 + 2;
/** 快照里正在起作用的道具：0 没有，1 起是 ITEM_IDS 的下标加一。 */
const itemCode = (id: ItemId | null | undefined): number => (id ? ITEM_IDS.indexOf(id) + 1 : 0);
const itemOf = (code: number | undefined): ItemId | null => (code ? (ITEM_IDS[code - 1] ?? null) : null);
/** 拿来匀的那排数里一个人占几个：身体、速度、摇杆 6 个 + 两条胳膊 16 个。 */
const PACKED_PLAYER = 6 + 16;
/** 两张快照之间挪了这么远（像素）就不匀，直接跳过去。 */
const JUMP = 250;

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** 事件里的坐标、速度也只要一位小数。 */
function slim(ev: SimEvent): SimEvent {
  const o = { ...ev } as Record<string, unknown>;
  for (const key of ['x', 'y', 'speed']) if (typeof o[key] === 'number') o[key] = r1(o[key] as number);
  return o as unknown as SimEvent;
}

/**
 * 主机：把局面压成一张快照。events：最近发生的事和第一件的编号（编号一件一号，接着往下数），
 * 每张快照都带最近一小段，手机按编号去重。
 */
export function encodeSnap(sim: SimView, n: number, events?: { k: number; list: readonly SimEvent[] }): Snap {
  const p = sim.players.map((pl) => {
    // 第 7 个数：0 活着，1 死了，2 比谁先到了终点
    const row = [r1(pl.body.x), r1(pl.body.y), r1(pl.body.vx), r1(pl.body.vy), r2(pl.aim.x), r2(pl.aim.y), pl.dead ? 1 : pl.done ? 2 : 0, r2(pl.deadT), Math.max(0, FACES.indexOf(pl.face)), pl.deaths];
    for (const arm of pl.arms) {
      for (let k = 0; k < 4; k++) {
        const q = arm.pts[k] ?? arm.hand;
        row.push(r1(q.x), r1(q.y));
      }
      row.push(arm.grip ? r2(arm.grip.t) : -1);
    }
    row.push(itemCode(pl.itemOn), r2(pl.itemLeft ?? 0));
    return row;
  });
  const snap: Snap = {
    n,
    lv: sim.level.id,
    t: r2(sim.time),
    w: sim.won ? 1 : 0,
    cp: sim.checkpoint,
    p,
    ...(sim.layoutFor !== undefined && sim.layoutFor !== sim.players.length ? { np: sim.layoutFor } : {}),
    r: sim.ropes.map((rope) => rope.pts.flatMap((q) => [r1(q.x), r1(q.y)])),
    o: sim.props.map((o) => [r1(o.x), r1(o.y), r3(o.angle), o.w, o.h, o.kind === 'seesaw' ? 0 : 1]),
    f: sim.fadings.flatMap((f) => [f.on ? 1 : 0, r2(f.left)]),
    s: sim.springs.map((s) => (Number.isFinite(s.hit) ? r2(Math.min(s.hit, 99)) : -1)),
  };
  if (sim.envelopes?.length) snap.en = sim.envelopes.reduce((m, e, k) => (e.got ? m | (1 << k) : m), 0);
  if (sim.plates?.length) snap.pl = sim.plates.reduce((m, q, k) => (q.on ? m | (1 << k) : m), 0);
  if (sim.gates?.length) snap.gt = sim.gates.map((g) => r3(g.open));
  if (sim.noodles?.length) snap.nd = sim.noodles.map((nd) => [nd.owner, r2(nd.left), ...nd.pts.flatMap((q) => [r1(q.x), r1(q.y)])]);
  if (events && events.list.length) {
    snap.e = events.list.map(slim);
    snap.ek = events.k;
  }
  return snap;
}

/**
 * 主机：最近发生的事，编号连着往下数；每张快照都带上这一段。
 * 一件事跟着 6 轮快照走完才拿掉（最多留 40 件）：按发了几轮算，不按时间，房主卡一下也丢不了。
 */
export class EventWindow {
  private list: { ev: SimEvent; left: number }[] = [];
  /** list[0] 的编号。 */
  private first = 0;

  push(events: readonly SimEvent[]): void {
    for (const ev of events) this.list.push({ ev, left: SNAP_EVENT_SENDS });
    while (this.list.length > SNAP_EVENTS_MAX) this.drop();
  }

  /** 这一轮要带的：第一件的编号和这一段事。 */
  take(): { k: number; list: SimEvent[] } {
    return { k: this.first, list: this.list.map((x) => x.ev) };
  }

  /** 这一轮快照发出去了：每件事少一轮，带够了的拿掉（先来的先够）。 */
  sent(): void {
    for (const x of this.list) x.left--;
    while (this.list.length && (this.list[0] as { left: number }).left <= 0) this.drop();
  }

  private drop(): void {
    this.list.shift();
    this.first++;
  }
}

const pt = (): Pt => ({ x: 0, y: 0 });
function newPlayer(id: number): PlayerView {
  const arm = (side: -1 | 1) => ({ side, hand: pt(), pts: [pt(), pt(), pt(), pt()], grip: null });
  return { id, color: '#fff', body: { x: 0, y: 0, vx: 0, vy: 0 }, arms: [arm(-1), arm(1)], aim: pt(), dead: false, deadT: 0, deaths: 0, face: 'idle' };
}

/** 别的手机：拿快照拼出来的局面，结构和 Sim 一样，Stage 直接画。 */
export class RemoteSim implements SimView {
  level: Level;
  time = 0;
  won = false;
  checkpoint = -1;
  players: PlayerView[] = [];
  ropes: RopeView[] = [];
  props: PropView[] = [];
  fadings: FadingView[] = [];
  springs: SpringView[] = [];
  noodles: NoodleView[] = [];
  envelopes: { x: number; y: number; got: boolean }[] = [];
  /** 踩板门（11-13）：踏板按着没有跟着快照走（不匀）；门开到几成跟着匀，位置按关卡算。 */
  plates: PlateView[] = [];
  gates: (GateView & { def: GateDef })[] = [];
  /** envelopes 是按哪一版关卡摆的（换关就重摆）。 */
  private envFor: Level | null = null;
  /** 收到过的最新序号。 */
  seq = -1;
  /** 关卡是按几个人摆的（快照的 np，没有就是人数）。 */
  layoutFor = -1;
  /** 玩法：手机局里从样子名单（Cast.mode / teams）来，画面用（坐不住时手抓久了要抖）。 */
  rules: Rules = { mode: 'climb' };
  private levelId: string;
  /** 放过的最后一件事的编号。 */
  private lastK = -1;

  private from: number[] = [];
  private to: number[] = [];
  private cur: number[] = [];
  private t0 = 0;
  private dur = 50;
  private lastAt = 0;
  private snap: Snap | null = null;

  constructor(
    private readonly find: (id: string) => Level | undefined,
    level: Level,
  ) {
    this.level = level;
    this.levelId = level.id;
  }

  /** 收到一张快照（now：performance.now()）。返回要放的声音和特效；旧的、关卡找不到的不要。 */
  apply(s: Snap, now: number): SimEvent[] {
    if (s.n <= this.seq) return [];
    // 关卡按主机摆的人数摆；关卡或人数变了才重摆（没有人数范围的关原样拿来，还是同一个对象）
    const np = s.np ?? s.p.length;
    let lv = this.level;
    if (s.lv !== this.levelId || np !== this.layoutFor) {
      const base = this.find(s.lv);
      if (!base) return [];
      lv = forPlayers(base, np);
    }
    const levelChanged = lv !== this.level;
    this.levelId = s.lv;
    this.layoutFor = np;
    // 先把正在匀的推到这一刻：画面一帧比快照慢（慢手机）时，从「现在该在的地方」接着匀，别回到上一帧
    if (this.snap) this.lerp(now);
    this.seq = s.n;
    this.level = lv;
    const shape = this.reshape(s, levelChanged);
    const next = this.pack(s);
    if (shape || this.cur.length !== next.length) {
      // 结构变了（有人进出、换关）：直接跳到新样子
      this.from = next.slice();
      this.cur = next.slice();
    } else {
      this.from = this.cur.slice();
      // 一个人一下子挪得很远（复活、再来一次）：这个人直接过去，别从半空滑过整关
      for (let i = 0; i < s.p.length; i++) {
        const o = i * PACKED_PLAYER;
        if (Math.hypot((next[o] ?? 0) - (this.cur[o] ?? 0), (next[o + 1] ?? 0) - (this.cur[o + 1] ?? 0)) < JUMP) continue;
        for (let j = o; j < o + PACKED_PLAYER; j++) this.from[j] = this.cur[j] = next[j] as number;
      }
    }
    this.to = next;
    this.dur = this.lastAt ? Math.max(30, Math.min(200, now - this.lastAt)) : 50;
    this.lastAt = now;
    this.t0 = now;
    this.snap = s;
    this.discrete(s, 0);
    this.write();
    // 同一件事跟着几张快照走：编号放过的不再放
    const out: SimEvent[] = [];
    if (s.e && typeof s.ek === 'number') {
      s.e.forEach((ev, j) => {
        const k = (s.ek as number) + j;
        if (k <= this.lastK) return;
        this.lastK = k;
        out.push(ev);
      });
    }
    return out;
  }

  /**
   * 每帧调：把连续的量匀到这一刻，计时类的照本地时间往前走。
   * now 和 apply 的 now 要是同一个钟（performance.now()）：requestAnimationFrame 给的时间是这一帧开始的时候，
   * 画得慢的手机上会比刚收到的快照还早，那样就一直匀不动。
   */
  advance(now: number): void {
    if (!this.snap) return;
    this.lerp(now);
    this.write();
    this.discrete(this.snap, Math.max(0, Math.min(0.5, (now - this.t0) / 1000)));
  }

  /** 把要匀的那排数推到 now 这一刻（不写回对象）。 */
  private lerp(now: number): void {
    const k = Math.max(0, Math.min(1, (now - this.t0) / this.dur));
    for (let i = 0; i < this.to.length; i++) {
      const a = this.from[i] as number;
      const b = this.to[i] as number;
      this.cur[i] = a + (b - a) * k;
    }
  }

  /** 人数、绳子、物件、饼干、蜡烛的个数和快照对不上就重建；建了返回 true。 */
  private reshape(s: Snap, force: boolean): boolean {
    let changed = force;
    if (this.players.length !== s.p.length) {
      const old = this.players;
      this.players = s.p.map((_, i) => {
        const p = old[i] ?? newPlayer(i);
        p.id = i;
        return p;
      });
      changed = true;
    }
    if (force || this.ropes.length !== s.r.length || this.ropes.some((r, i) => r.pts.length * 2 !== (s.r[i]?.length ?? 0))) {
      this.ropes = s.r.map((flat) => {
        const pts = Array.from({ length: flat.length / 2 }, pt);
        return { anchor: pts[0] ?? pt(), pts, handle: pts[pts.length - 1] ?? pt() };
      });
      changed = true;
    }
    if (force || this.props.length !== s.o.length) {
      this.props = s.o.map((o) => ({ kind: o[5] === 0 ? 'seesaw' : 'crate', w: o[3] ?? 0, h: o[4] ?? 0, x: 0, y: 0, angle: 0 }));
      changed = true;
    }
    const fd = this.level.fading ?? [];
    if (force || this.fadings.length !== s.f.length / 2) {
      this.fadings = Array.from({ length: s.f.length / 2 }, (_, i) => {
        const d = fd[i];
        return { x: d?.x ?? 0, y: d?.y ?? 0, w: d?.w ?? 0, h: d?.h ?? 0, on: true, left: 0 };
      });
      changed = true;
    }
    const nd = s.nd ?? [];
    if (force || this.noodles.length !== nd.length || this.noodles.some((n, i) => n.pts.length * 2 + 2 !== (nd[i]?.length ?? 0) || n.owner !== nd[i]?.[0])) {
      this.noodles = nd.map((row) => ({ owner: row[0] ?? 0, left: 0, pts: Array.from({ length: Math.max(0, row.length - 2) / 2 }, pt) }));
      changed = true;
    }
    const gd = this.level.gates ?? [];
    const gt = s.gt ?? [];
    if (force || this.gates.length !== gt.length) {
      this.gates = gt.map((_, i) => {
        const d = gd[i] as GateDef;
        return { def: d, x: d?.x ?? 0, y: d?.y ?? 0, w: d?.w ?? 0, h: d?.h ?? 0, open: 0 };
      });
      changed = true;
    }
    const pd = this.level.plates ?? [];
    if (force || this.plates.length !== pd.length) {
      this.plates = pd.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, on: false }));
      changed = true;
    }
    const sd = this.level.springs ?? [];
    if (force || this.springs.length !== s.s.length) {
      this.springs = s.s.map((_, i) => {
        const d = sd[i];
        return { x: d?.x ?? 0, y: d?.y ?? 0, w: d?.w ?? 0, h: d?.h ?? 0, hit: Infinity };
      });
      changed = true;
    }
    return changed;
  }

  /** 要匀的数摊成一排：身体、速度、摇杆、胳膊的点；绳子的点；物件的位置和角度。 */
  private pack(s: Snap): number[] {
    const out: number[] = [];
    for (const row of s.p) {
      for (let i = 0; i < 6; i++) out.push(row[i] ?? 0);
      for (let a = 0; a < 2; a++) for (let i = 0; i < 8; i++) out.push(row[10 + a * 9 + i] ?? 0);
    }
    for (const flat of s.r) for (const v of flat) out.push(v);
    for (const o of s.o) out.push(o[0] ?? 0, o[1] ?? 0, o[2] ?? 0);
    for (const row of s.nd ?? []) for (let i = 2; i < row.length; i++) out.push(row[i] ?? 0);
    for (const v of s.gt ?? []) out.push(v);
    // 时间也跟着匀：会动的平台按时间画，和匀过的人对得上（站在上面不抖）
    out.push(s.t);
    return out;
  }

  /** 把匀好的数写回对象。 */
  private write(): void {
    const c = this.cur;
    let i = 0;
    for (const p of this.players) {
      p.body.x = c[i++] as number;
      p.body.y = c[i++] as number;
      p.body.vx = c[i++] as number;
      p.body.vy = c[i++] as number;
      p.aim.x = c[i++] as number;
      p.aim.y = c[i++] as number;
      for (const arm of p.arms) {
        for (const q of arm.pts) {
          q.x = c[i++] as number;
          q.y = c[i++] as number;
        }
        const h = arm.pts[3] as Pt;
        arm.hand.x = h.x;
        arm.hand.y = h.y;
      }
    }
    for (const rope of this.ropes) {
      for (const q of rope.pts) {
        q.x = c[i++] as number;
        q.y = c[i++] as number;
      }
    }
    for (const o of this.props) {
      o.x = c[i++] as number;
      o.y = c[i++] as number;
      o.angle = c[i++] as number;
    }
    for (const n of this.noodles) {
      for (const q of n.pts) {
        q.x = c[i++] as number;
        q.y = c[i++] as number;
      }
    }
    for (const g of this.gates) {
      g.open = c[i++] as number;
      if (g.def) {
        const at = gateAt(g.def, g.open);
        g.x = at.x;
        g.y = at.y;
      }
    }
    this.time = c[i++] as number;
  }

  /** 不匀的：死没死、表情、抓没抓、检查点、饼干、蜡烛；since 是这张快照到现在几秒。时钟跟着匀（write）。 */
  private discrete(s: Snap, since: number): void {
    this.won = s.w === 1;
    this.checkpoint = s.cp;
    const pl = s.pl ?? 0;
    this.plates.forEach((q, k) => (q.on = (pl & (1 << k)) !== 0));
    // 红包：位置在关卡里，拿没拿到跟着快照走；这一局没有红包（不写 en）就不画
    const en = s.en;
    if (en === undefined) {
      this.envelopes = [];
      this.envFor = null;
    } else {
      if (this.envFor !== this.level) {
        this.envFor = this.level;
        this.envelopes = (this.level.envelopes ?? []).map((d) => ({ x: d.x, y: d.y, got: false }));
      }
      this.envelopes.forEach((e, k) => (e.got = (en & (1 << k)) !== 0));
    }
    s.p.forEach((row, i) => {
      const p = this.players[i];
      if (!p) return;
      p.dead = row[6] === 1;
      p.done = row[6] === 2;
      p.deadT = (row[7] ?? 0) + (p.dead ? since : 0);
      p.face = FACES[row[8] ?? 0] ?? 'idle';
      p.deaths = row[9] ?? 0;
      p.arms.forEach((arm, a) => {
        const g = row[10 + a * 9 + 8] ?? -1;
        arm.grip = g >= 0 ? { t: g + since } : null;
      });
      p.itemOn = itemOf(row[28]);
      p.itemLeft = Math.max(0, (row[29] ?? 0) - since);
    });
    (s.nd ?? []).forEach((row, i) => {
      const n = this.noodles[i];
      if (n) n.left = Math.max(0, (row[1] ?? 0) - since);
    });
    this.fadings.forEach((f, i) => {
      f.on = s.f[i * 2] === 1;
      f.left = Math.max(0, (s.f[i * 2 + 1] ?? 0) - since);
    });
    this.springs.forEach((sp, i) => {
      const h = s.s[i] ?? -1;
      sp.hit = h < 0 ? Infinity : h + since;
    });
  }
}

/** 一个人一行有多长（测试用）。 */
export const SNAP_PLAYER_LEN = PLAYER_LEN;
