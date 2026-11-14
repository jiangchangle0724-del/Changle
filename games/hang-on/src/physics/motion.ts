/**
 * 会动的东西在第 t 秒的样子，和「碰到没有」的几何：只用关卡数据和时间算，不碰 Rapier。
 * 物理（主机）用它摆动的平台和转的杆子；画面（主机和手机局里别的手机）用同一套算法按 sim.time 画，
 * 所以快照里不用带它们，两边永远对得上。
 */
import { CFG } from './config';
import type { LiftDef, MoverDef, Pt, Rect, SpinnerDef, VentDef } from './level';

/** 会动的平台在第 t 秒时矩形左上角的位置。 */
export function moverAt(m: MoverDef, t: number): Pt {
  const start = { x: m.x, y: m.y };
  const pts = [start, ...m.path];
  if (pts.length < 2 || !(m.speed > 0)) return start;
  // 一圈走过的点：来回走就是 0 → n → 0，绕圈就是 0 → n → 0（最后一段直接回起点）
  const route = m.loop ? [...pts, start] : [...pts, ...pts.slice(0, -1).reverse()];
  const wait = Math.max(0, m.wait ?? 0);
  const legs = route.slice(1).map((p, i) => {
    const a = route[i] as Pt;
    return { a, b: p, dur: Math.hypot(p.x - a.x, p.y - a.y) / m.speed };
  });
  const cycle = legs.reduce((s, l) => s + l.dur + wait, 0);
  if (!(cycle > 0)) return start;
  let u = ((((t + (m.phase ?? 0)) % cycle) + cycle) % cycle);
  for (const l of legs) {
    if (u < l.dur) {
      const k = l.dur > 0 ? u / l.dur : 1;
      // 两头慢一点（缓入缓出），抓着的人不会被猛地一拽
      const e = k * k * (3 - 2 * k);
      return { x: l.a.x + (l.b.x - l.a.x) * e, y: l.a.y + (l.b.y - l.a.y) * e };
    }
    u -= l.dur;
    if (u < wait) return { ...l.b };
    u -= wait;
  }
  return start;
}

/** 转的杆子在第 t 秒的角度（弧度）。 */
export function spinnerAngle(s: SpinnerDef, t: number): number {
  return (s.phase ?? 0) + s.spin * t;
}

/** 第 j 根杆子在角度 angle 时的样子：中心、方向角、长、粗（一根从轴心伸出去的长条）。 */
export function spinnerArm(s: SpinnerDef, j: number, angle: number): { x: number; y: number; angle: number; len: number; h: number } {
  const a = angle + (j * 2 * Math.PI) / Math.max(1, s.arms);
  return { x: s.pivot.x + Math.cos(a) * (s.len / 2), y: s.pivot.y + Math.sin(a) * (s.len / 2), angle: a, len: s.len, h: s.h ?? 16 };
}

/** 圆（c, r）和轴对齐矩形碰没碰到。 */
export function circleHitsRect(c: Pt, r: number, b: Rect): boolean {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r;
}

/** 圆（c, r）和斜着放的长条（中心、方向角、长、粗）碰没碰到。 */
export function circleHitsBar(c: Pt, r: number, bar: { x: number; y: number; angle: number; len: number; h: number }): boolean {
  const cos = Math.cos(bar.angle);
  const sin = Math.sin(bar.angle);
  const dx = c.x - bar.x;
  const dy = c.y - bar.y;
  // 换到长条自己的坐标里，就是圆碰轴对齐矩形
  const lx = cos * dx + sin * dy;
  const ly = -sin * dx + cos * dy;
  return circleHitsRect({ x: lx, y: ly }, r, { x: -bar.len / 2, y: -bar.h / 2, w: bar.len, h: bar.h });
}

/**
 * 蒸笼喷汽（后厨，A10）在第 t 秒：喷着没有（on）、快喷了没有（warn，喷之前 CFG.ventWarn 秒）、
 * 这一段走了几成（k：喷着时是喷了几成，停着时是停了几成）。物理和画面用同一个钟。
 */
export function ventState(v: VentDef, t: number): { on: boolean; warn: boolean; k: number } {
  const on = Math.max(0.2, v.on ?? CFG.ventOn);
  const off = Math.max(0.2, v.off ?? CFG.ventOff);
  const cycle = on + off;
  const u = (((t + (v.phase ?? 0)) % cycle) + cycle) % cycle;
  if (u < on) return { on: true, warn: false, k: u / on };
  return { on: false, warn: u >= cycle - Math.min(CFG.ventWarn, off), k: (u - on) / off };
}

/** 汽柱：蒸笼顶往上 reach 像素、和蒸笼一样宽。 */
export const ventColumn = (v: VentDef): Rect => {
  const reach = v.reach ?? CFG.ventReach;
  return { x: v.x, y: v.y - reach, w: v.w, h: reach };
};

/** 一把缆椅 / 缆车厢的几块（相对座板中心）：座板（能站），横杆或车顶（能抓；车顶也能站）。 */
export function liftParts(l: LiftDef): { seat: Rect; top: Rect } {
  if (l.kind === 'cabin') return { seat: { x: -60, y: -6, w: 120, h: 12 }, top: { x: -60, y: -96, w: 120, h: 12 } };
  return { seat: { x: -36, y: -6, w: 72, h: 12 }, top: { x: -28, y: -50, w: 56, h: 8 } };
}

/**
 * 雪山缆车（A10）在第 t 秒：每把椅子座板的中心，在不在缆绳上（`on` 是 false 的收在站里，不画、碰不到）。
 * 一圈 = 椅子数 × gap，比缆绳长一点：每把椅子在缆绳上走完，在站里停一小会儿，再从起点出来。
 */
export function liftChairs(l: LiftDef, t: number): { x: number; y: number; on: boolean }[] {
  const dx = l.to.x - l.from.x;
  const dy = l.to.y - l.from.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const gap = Math.max(40, l.gap);
  const n = Math.floor(len / gap) + 1;
  const loop = n * gap;
  const drop = l.drop ?? CFG.liftDrop;
  const out: { x: number; y: number; on: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const s = ((((t + (l.phase ?? 0)) * l.speed + k * gap) % loop) + loop) % loop;
    const u = Math.min(1, s / len);
    out.push({ x: l.from.x + dx * u, y: l.from.y + dy * u + drop, on: s < len });
  }
  return out;
}
