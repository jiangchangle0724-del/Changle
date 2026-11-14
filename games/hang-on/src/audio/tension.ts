/**
 * 音乐跟着局面变（11-13 Steve：「每个不同的场景需要有不同的背景音乐，并且会根据玩家的游戏状态，
 * 比如是否处于危机时刻，及时调整音乐的节奏」）。这里只算「现在多紧张」，不碰声音：
 * - 危险（danger）：有人挂在深坑上（一只手比两只手危险，悬空没抓东西最危险）、身边就是尖刺烫锅电线、正在往下掉。
 *   最危险的那个人为主（七成），大家平均三成。
 * - 催（push）：快到了、比谁先有人到了终点、坐不住只剩两三个人、准时那颗星快没了。
 * - 事件：有人摔死、出局、松手害人往上顶一下，过了检查点松一口气。
 * 主机每帧算一次交给 `music.ts`（`Tension.update`）；纯函数，测试直接喂局面。
 */
import { CFG } from '../physics/config';
import type { Level, Rect } from '../physics/level';
import { liftChairs, moverAt, spinnerAngle, spinnerArm } from '../physics/motion';
import type { SimEvent } from '../physics/world';
import type { PlayerView, SimView } from '../render/view';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 这一点正下方最近的台面还有多远（px）；下面什么都没有就是到摔死线的距离，至少 600。`extra` 是现在在哪的门（踩板门）。 */
export function dropBelow(level: Level, x: number, y: number, t = 0, extra: readonly { x: number; y: number; w: number }[] = []): number {
  let best = Infinity;
  const consider = (r: { x: number; y: number; w: number }): void => {
    if (x < r.x - CFG.bodyR || x > r.x + r.w + CFG.bodyR || r.y < y - 6) return;
    best = Math.min(best, r.y - y);
  };
  for (const r of level.rects) if (!r.until || t < r.until) consider(r);
  for (const s of level.springs ?? []) consider(s);
  for (const f of level.fading ?? []) consider(f);
  for (const m of level.movers ?? []) if (!m.deadly) consider({ ...moverAt(m, t), w: m.w });
  for (const p of level.plates ?? []) consider(p);
  // 蒸笼（后厨，A10）也是台子；缆车的座板（雪山，A10）在缆绳上的那几把也是
  for (const v of level.vents ?? []) consider(v);
  for (const l of level.lifts ?? []) for (const c of liftChairs(l, t)) if (c.on) consider({ x: c.x - 36, y: c.y - 6, w: 72 });
  for (const r of extra) consider(r);
  return Number.isFinite(best) ? best : Math.max(600, level.deathY - y);
}

/** 离最近的要命的东西多远（px，身子的边到它的边）；没有就是 Infinity。 */
export function hazardNear(level: Level, x: number, y: number, t = 0): number {
  let best = Infinity;
  const toRect = (r: Rect): number => {
    const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
    const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
    return Math.hypot(dx, dy) - CFG.bodyR;
  };
  for (const h of level.hazards ?? []) best = Math.min(best, toRect(h));
  for (const m of level.movers ?? []) if (m.deadly) best = Math.min(best, toRect({ ...m, ...moverAt(m, t) }));
  for (const s of level.spinners ?? []) {
    if (!s.deadly) continue;
    const a = spinnerAngle(s, t);
    for (let j = 0; j < s.arms; j++) {
      const bar = spinnerArm(s, j, a);
      // 转杆按杆子中间那条线量：到线段的距离减半个杆宽
      const ex = bar.x + Math.cos(bar.angle) * bar.len;
      const ey = bar.y + Math.sin(bar.angle) * bar.len;
      const vx = ex - bar.x;
      const vy = ey - bar.y;
      const k = clamp01(((x - bar.x) * vx + (y - bar.y) * vy) / (vx * vx + vy * vy || 1));
      best = Math.min(best, Math.hypot(x - (bar.x + vx * k), y - (bar.y + vy * k)) - bar.h / 2 - CFG.bodyR);
    }
  }
  return best;
}

/** 一个人现在有多危险（0–1）。 */
export function playerDanger(level: Level, p: PlayerView, t = 0, gates: readonly { x: number; y: number; w: number }[] = []): number {
  if (p.dead || p.done) return 0;
  // 冻住的人哪也不去（A9 速冻），算安全
  if (p.itemOn === 'freeze') return 0.05;
  const { x, y, vy } = p.body;
  const grips = (p.arms[0].grip ? 1 : 0) + (p.arms[1].grip ? 1 : 0);
  // 脚下 120 px 以内有台子不算高；越过 620 px 算最高
  const height = clamp01((dropBelow(level, x, y, t, gates) - 120) / 500);
  const hold = grips === 2 ? 0.35 : grips === 1 ? 0.7 : 1;
  let d = height * hold;
  // 没抓东西、往下掉得快：正在摔
  if (!grips && vy > 450) d = Math.max(d, clamp01((vy - 450) / 450));
  // 贴着要命的东西（110 px 以内）：越近越危险
  const near = hazardNear(level, x, y, t);
  if (near < 110) d = Math.max(d, 0.8 * (1 - Math.max(0, near) / 110));
  // 撑着荷叶慢慢飘：没那么急
  if (p.itemOn === 'leaf') d *= 0.5;
  return clamp01(d);
}

export interface MoodInput {
  /** 准时那颗星的秒数（A9b，闯关、大团队才有）。 */
  timeTarget?: number;
}

/** 这一刻的危险和催（还没平滑）。 */
export function moodOf(sim: SimView, opts: MoodInput = {}): { danger: number; push: number } {
  const live = sim.players.filter((p) => !p.dead && !p.done);
  // 抓着外卖无人机（A9c）的人：有人接着，不算危险
  const d = sim.drone;
  const onDrone = (p: PlayerView): boolean => !!d && p.arms.some((a) => a.grip && Math.abs(a.hand.x - d.x) < 40 && Math.abs(a.hand.y - d.y) < 20);
  const ds = live.map((p) => (onDrone(p) ? 0.1 : playerDanger(sim.level, p, sim.time, sim.gates ?? [])));
  const max = ds.length ? Math.max(...ds) : 0;
  const mean = ds.length ? ds.reduce((s, d) => s + d, 0) / ds.length : 0;
  const danger = 0.7 * max + 0.3 * mean;
  let push = 0;
  const mode = sim.rules?.mode ?? 'climb';
  if (mode === 'gold' && sim.gold) {
    // 抢元宝：有人快攒够了越来越紧
    const most = Math.max(0, ...sim.gold.holdT);
    push = Math.min(1, most / sim.gold.need) * 0.9;
  } else if (mode === 'last') {
    // 坐不住：剩的人越少越紧
    const n = live.length;
    push = n <= 2 ? 0.85 : n === 3 ? 0.5 : 0.2;
  } else if (mode === 'race' && sim.players.some((p) => p.done)) {
    // 比谁先：有人到了，别人只剩 40 秒
    push = 0.8;
  } else {
    const cps = sim.level.checkpoints?.length ?? 0;
    // 最后一段（过了最后一个检查点）
    if (cps && sim.checkpoint >= cps - 1) push = 0.45;
    // 离终点近了
    const g = sim.level.goal;
    const gx = g.x + g.w / 2;
    const gy = g.y + g.h / 2;
    const closest = Math.min(...live.map((p) => Math.hypot(p.body.x - gx, p.body.y - gy)), Infinity);
    if (closest < 700) push = Math.max(push, 0.45 + 0.35 * (1 - closest / 700));
  }
  // 准时那颗星：用了四分之三以后越来越催
  if (opts.timeTarget && mode !== 'last') push = Math.max(push, clamp01((sim.time / opts.timeTarget - 0.75) / 0.25) * 0.7);
  return { danger, push };
}

/** 局面 → 音乐的紧张（0–1）。0.1 左右是安安静静，0.4 是正常在爬，0.7 以上是危险，0.85 以上是危机（节奏加快、鼓变密）。 */
export function rawIntensity(m: { danger: number; push: number }): number {
  return clamp01(0.3 + 0.62 * m.danger + 0.3 * m.push);
}

/** 平滑：变紧张快（约 0.35 秒），放松慢（约 2.5 秒）；事件往上顶一下再慢慢退。 */
export class Tension {
  value = 0;
  private bump = 0;

  update(raw: number, dt: number): number {
    const tc = raw > this.value ? 0.35 : 2.5;
    this.value += (raw - this.value) * (1 - Math.exp(-dt / tc));
    this.bump *= Math.exp(-dt / 2.5);
    return this.level;
  }

  get level(): number {
    return clamp01(this.value + this.bump);
  }

  /** 事件：摔死、出局、背叛、托盘翻了往上顶；过检查点松一口气。 */
  events(evs: readonly SimEvent[]): void {
    for (const e of evs) {
      if (e.type === 'death' || e.type === 'out') this.kick(0.3);
      else if (e.type === 'betrayal') this.kick(0.2);
      // 后厨的托盘翻了：往上顶一下
      else if (e.type === 'tray' && e.phase === 'spill') this.kick(0.2);
      else if (e.type === 'checkpoint') this.kick(-0.2);
    }
  }

  kick(v: number): void {
    this.bump = Math.max(-0.3, Math.min(0.5, this.bump + v));
  }

  reset(v = 0): void {
    this.value = v;
    this.bump = 0;
  }
}
