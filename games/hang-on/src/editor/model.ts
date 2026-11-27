/**
 * 关卡编辑器（11-26）的「关」：编辑器里改的就是一个收拾过的关（`cleanCustom`），每一步改完再收拾一遍，所以总是能玩。
 * 这里只有数据和算法（点到了什么、怎么放、怎么拖），不碰 DOM，`model.test.ts` 测它；画和点在 `main.ts`。
 */
import { cleanCustom, CUSTOM_MATERIALS, LIMITS } from '../custom';
import type { Level, Pt, Rect } from '../physics/level';

/** 工具：选（拖、拉角）、画台子、放把手、出生点、终点、检查点、绳子、蜡烛、饼干、尖刺、箱子、大石头、擦。 */
export type Tool = 'select' | 'rect' | 'peg' | 'spawn' | 'goal' | 'checkpoint' | 'rope' | 'spring' | 'cookie' | 'spike' | 'crate' | 'boulder' | 'erase';
export const TOOLS: readonly Tool[] = ['select', 'rect', 'peg', 'spawn', 'goal', 'checkpoint', 'rope', 'spring', 'cookie', 'spike', 'crate', 'boulder', 'erase'];
/** 拖着画的工具（别的点一下就放）。 */
export const DRAG_TOOLS: readonly Tool[] = ['rect', 'spring', 'cookie', 'spike', 'goal'];
export type Material = (typeof CUSTOM_MATERIALS)[number];
export type HazardKind = 'spike' | 'hot' | 'zap';

/** 关里的一样东西：哪一串、第几个（出生点、终点只有一个）。 */
export type Ref =
  | { list: 'rects' | 'springs' | 'fading' | 'hazards' | 'crates' | 'boulders' | 'ropes' | 'checkpoints'; i: number }
  | { list: 'spawn' }
  | { list: 'goal' };

/** 网格：放东西对齐到 20 像素。 */
export const GRID = 20;
export const snap = (v: number): number => Math.round(v / GRID) * GRID;

/** 关卡大小的几种（宽 × 高）。 */
export const SIZES: readonly { w: number; h: number; zh: string; en: string }[] = [
  { w: 1280, h: 720, zh: '一屏', en: 'One screen' },
  { w: 2560, h: 720, zh: '两屏宽', en: 'Two screens wide' },
  { w: 3840, h: 720, zh: '三屏宽', en: 'Three screens wide' },
  { w: 1280, h: 1440, zh: '两屏高', en: 'Two screens tall' },
  { w: 1280, h: 2160, zh: '三屏高', en: 'Three screens tall' },
  { w: 2560, h: 1440, zh: '大', en: 'Big' },
];

/** 新的关：两块台子中间一道缝，出生点、终点、一个检查点。 */
export function starter(): Level {
  return cleanCustom(
    {
      name: '',
      world: 'table',
      w: 2560,
      h: 720,
      spawn: { x: 120, y: 560 },
      goal: { x: 2380, y: 440, w: 120, h: 160 },
      checkpoints: [{ x: 1300, y: 560 }],
      rects: [
        { x: 0, y: 620, w: 960, h: 100, material: 'wood' },
        { x: 1180, y: 620, w: 1380, h: 100, material: 'wood' },
      ],
    },
    'custom-draft',
  ) as Level;
}

/** 收拾一遍（每一步改完都过一下）：夹到关里、去掉多的。没有出生点、终点是不可能的（编辑器不让删）。 */
export function tidy(l: Level): Level {
  return cleanCustom(l, 'custom-draft') ?? l;
}

/** 一个圆、一个点算成框（点到判断用）。 */
const around = (p: Pt, r: number): Rect => ({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 });
const inside = (r: Rect, p: Pt, pad = 0): boolean => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

/** 绳子底下那一头。 */
export const ropeEnd = (l: Level, i: number): Pt => {
  const r = l.ropes?.[i];
  return r ? { x: r.anchor.x, y: r.anchor.y + r.segments * r.segLen } : { x: 0, y: 0 };
};

/** 一样东西占的框（选中时画框、拉角用）。 */
export function boxOf(l: Level, ref: Ref): Rect | null {
  if (ref.list === 'spawn') return around(l.spawn, 24);
  if (ref.list === 'goal') return l.goal;
  if (ref.list === 'checkpoints') {
    const c = l.checkpoints?.[ref.i];
    return c ? { x: c.x - 16, y: c.y - 56, w: 32, h: 80 } : null;
  }
  if (ref.list === 'boulders') {
    const b = l.boulders?.[ref.i];
    return b ? around(b, b.r ?? 56) : null;
  }
  if (ref.list === 'ropes') {
    const r = l.ropes?.[ref.i];
    if (!r) return null;
    const end = ropeEnd(l, ref.i);
    return { x: r.anchor.x - 14, y: r.anchor.y - 14, w: 28, h: end.y - r.anchor.y + 28 };
  }
  return (l[ref.list] as Rect[] | undefined)?.[ref.i] ?? null;
}

/** 能拉角改大小的（台子、蜡烛、饼干、尖刺、箱子、终点）。 */
export const resizable = (ref: Ref): boolean => ref.list === 'rects' || ref.list === 'springs' || ref.list === 'fading' || ref.list === 'hazards' || ref.list === 'crates' || ref.list === 'goal';

/** 点到了什么：上面的先（小东西、会动的、出生点、检查点、终点，最后才是台子；台子里把手先）。pad：手指粗，多算几像素。 */
export function hit(l: Level, p: Pt, pad = 0): Ref | null {
  for (let i = (l.boulders?.length ?? 0) - 1; i >= 0; i--) {
    const b = l.boulders?.[i];
    if (b && Math.hypot(p.x - b.x, p.y - b.y) <= (b.r ?? 56) + pad) return { list: 'boulders', i };
  }
  if (Math.hypot(p.x - l.spawn.x, p.y - l.spawn.y) <= 28 + pad) return { list: 'spawn' };
  for (let i = (l.checkpoints?.length ?? 0) - 1; i >= 0; i--) if (inside(boxOf(l, { list: 'checkpoints', i }) as Rect, p, pad)) return { list: 'checkpoints', i };
  for (let i = (l.ropes?.length ?? 0) - 1; i >= 0; i--) if (inside(boxOf(l, { list: 'ropes', i }) as Rect, p, pad)) return { list: 'ropes', i };
  for (const list of ['crates', 'springs', 'hazards', 'fading'] as const) {
    const xs = (l[list] ?? []) as Rect[];
    for (let i = xs.length - 1; i >= 0; i--) if (inside(xs[i] as Rect, p, pad)) return { list, i };
  }
  if (inside(l.goal, p, pad)) return { list: 'goal' };
  const rs = l.rects;
  for (let i = rs.length - 1; i >= 0; i--) if (rs[i]?.kind === 'peg' && inside(rs[i] as Rect, p, pad)) return { list: 'rects', i };
  for (let i = rs.length - 1; i >= 0; i--) if (rs[i]?.kind !== 'peg' && inside(rs[i] as Rect, p, pad)) return { list: 'rects', i };
  return null;
}

/** 摆好的这样还能不能再加（每样有上限）。 */
export function room(l: Level, tool: Tool): boolean {
  const n = (k: keyof typeof LIMITS): number => ((l[k] as unknown[] | undefined) ?? []).length;
  if (tool === 'rect' || tool === 'peg') return n('rects') < LIMITS.rects;
  if (tool === 'checkpoint') return n('checkpoints') < LIMITS.checkpoints;
  if (tool === 'rope') return n('ropes') < LIMITS.ropes;
  if (tool === 'spring') return n('springs') < LIMITS.springs;
  if (tool === 'cookie') return n('fading') < LIMITS.fading;
  if (tool === 'spike') return n('hazards') < LIMITS.hazards;
  if (tool === 'crate') return n('crates') < LIMITS.crates;
  if (tool === 'boulder') return n('boulders') < LIMITS.boulders;
  return true;
}

/** 两个角拉出来的框（对齐网格，至少 min 大）。 */
export function boxFrom(a: Pt, b: Pt, min = GRID): Rect {
  const x0 = snap(Math.min(a.x, b.x));
  const y0 = snap(Math.min(a.y, b.y));
  const x1 = Math.max(x0 + min, snap(Math.max(a.x, b.x)));
  const y1 = Math.max(y0 + min, snap(Math.max(a.y, b.y)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 用工具在 a（按下）到 b（松开）放一样东西；返回改好的关和新放的那样（放不下、没放是 null）。 */
export function place(l: Level, tool: Tool, a: Pt, b: Pt, opts: { material: Material; hazard: HazardKind }): { level: Level; ref: Ref | null } {
  if (!room(l, tool)) return { level: l, ref: null };
  const next = structuredClone(l);
  const at = { x: snap(b.x), y: snap(b.y) };
  const push = <K extends 'rects' | 'springs' | 'fading' | 'hazards' | 'crates' | 'boulders' | 'ropes' | 'checkpoints'>(list: K, item: NonNullable<Level[K]>[number]): Ref => {
    const xs = ((next[list] as unknown[] | undefined) ?? []) as unknown[];
    xs.push(item);
    (next as unknown as Record<string, unknown>)[list] = xs;
    return { list, i: xs.length - 1 };
  };
  let ref: Ref | null = null;
  if (tool === 'rect') ref = push('rects', { ...boxFrom(a, b, 40), kind: 'ground', material: opts.material });
  else if (tool === 'peg') ref = push('rects', { x: at.x - 20, y: at.y - 8, w: 40, h: 16, kind: 'peg', material: opts.material });
  else if (tool === 'spring') ref = push('springs', { ...boxFrom(a, b, 40), power: 1 });
  else if (tool === 'cookie') ref = push('fading', { ...boxFrom(a, b, 40), material: opts.material, on: 4, off: 2, phase: 0 });
  else if (tool === 'spike') ref = push('hazards', { ...boxFrom(a, b, 20), kind: opts.hazard });
  else if (tool === 'crate') ref = push('crates', { x: at.x - 40, y: at.y - 40, w: 80, h: 80, material: opts.material });
  else if (tool === 'boulder') ref = push('boulders', { x: at.x, y: at.y, r: 56 });
  else if (tool === 'rope') ref = push('ropes', { anchor: at, segments: 8, segLen: 22 });
  else if (tool === 'checkpoint') ref = push('checkpoints', at);
  else if (tool === 'spawn') {
    next.spawn = at;
    ref = { list: 'spawn' };
  } else if (tool === 'goal') {
    const big = Math.abs(b.x - a.x) >= 80 && Math.abs(b.y - a.y) >= 80;
    next.goal = big ? boxFrom(a, b, 80) : { x: at.x - 60, y: at.y - 80, w: 120, h: 160 };
    ref = { list: 'goal' };
  }
  return { level: tidy(next), ref };
}

/** 删掉一样（出生点、终点删不掉）。 */
export function remove(l: Level, ref: Ref): Level {
  if (ref.list === 'spawn' || ref.list === 'goal') return l;
  const next = structuredClone(l);
  (next[ref.list] as unknown[] | undefined)?.splice(ref.i, 1);
  return tidy(next);
}

/** 整个挪 (dx, dy)（对齐网格）。 */
export function move(l: Level, ref: Ref, dx: number, dy: number): Level {
  const next = structuredClone(l);
  const sx = snap(dx);
  const sy = snap(dy);
  const shift = (p: Pt): void => {
    p.x += sx;
    p.y += sy;
  };
  if (ref.list === 'spawn') shift(next.spawn);
  else if (ref.list === 'goal') shift(next.goal);
  else if (ref.list === 'ropes') {
    const r = next.ropes?.[ref.i];
    if (r) shift(r.anchor);
  } else {
    const item = (next[ref.list] as Pt[] | undefined)?.[ref.i];
    if (item) shift(item);
  }
  return tidy(next);
}

/** 拉角：把框的一个角（0 左上、1 右上、2 右下、3 左下）拉到 p。绳子拉底下那头改长短，大石头拉边改大小。 */
export function resize(l: Level, ref: Ref, corner: number, p: Pt): Level {
  const next = structuredClone(l);
  if (ref.list === 'ropes') {
    const r = next.ropes?.[ref.i];
    if (r) r.segments = Math.max(3, Math.min(16, Math.round((p.y - r.anchor.y) / r.segLen)));
    return tidy(next);
  }
  if (ref.list === 'boulders') {
    const b = next.boulders?.[ref.i];
    if (b) b.r = Math.max(36, Math.min(90, Math.round(Math.hypot(p.x - b.x, p.y - b.y))));
    return tidy(next);
  }
  const box = ref.list === 'goal' ? next.goal : ref.list === 'spawn' || ref.list === 'checkpoints' ? null : ((next[ref.list] as Rect[] | undefined)?.[ref.i] ?? null);
  if (!box) return l;
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  const px = snap(p.x);
  const py = snap(p.y);
  const left = corner === 0 || corner === 3;
  const top = corner === 0 || corner === 1;
  const nx0 = left ? Math.min(px, x1 - GRID) : x0;
  const nx1 = left ? x1 : Math.max(px, x0 + GRID);
  const ny0 = top ? Math.min(py, y1 - GRID) : y0;
  const ny1 = top ? y1 : Math.max(py, y0 + GRID);
  box.x = nx0;
  box.y = ny0;
  box.w = nx1 - nx0;
  box.h = ny1 - ny0;
  return tidy(next);
}

/** 换材料（台子、把手、饼干、箱子）或者尖刺的种类。 */
export function restyle(l: Level, ref: Ref, opts: { material?: Material; hazard?: HazardKind }): Level {
  const next = structuredClone(l);
  if (opts.material && (ref.list === 'rects' || ref.list === 'fading' || ref.list === 'crates')) {
    const item = next[ref.list]?.[ref.i];
    if (item) item.material = opts.material;
  }
  if (opts.hazard && ref.list === 'hazards') {
    const z = next.hazards?.[ref.i];
    if (z) z.kind = opts.hazard;
  }
  return tidy(next);
}

/** 出生点底下 120 像素内有没有台子接着（没有的话一开局就掉下去）。 */
export function spawnHasFloor(l: Level): boolean {
  return l.rects.some((r) => r.kind !== 'peg' && l.spawn.x >= r.x && l.spawn.x <= r.x + r.w && r.y - l.spawn.y >= 0 && r.y - l.spawn.y <= 120);
}

/** 撤销、重做：每一步存一份（最多 100 步）。 */
export class History {
  private back: string[] = [];
  private fwd: string[] = [];
  constructor(private now: Level) {}
  get level(): Level {
    return this.now;
  }
  push(next: Level): void {
    if (JSON.stringify(next) === JSON.stringify(this.now)) return;
    this.back.push(JSON.stringify(this.now));
    if (this.back.length > 100) this.back.shift();
    this.fwd = [];
    this.now = next;
  }
  undo(): boolean {
    const prev = this.back.pop();
    if (!prev) return false;
    this.fwd.push(JSON.stringify(this.now));
    this.now = JSON.parse(prev) as Level;
    return true;
  }
  redo(): boolean {
    const nxt = this.fwd.pop();
    if (!nxt) return false;
    this.back.push(JSON.stringify(this.now));
    this.now = JSON.parse(nxt) as Level;
    return true;
  }
  get canUndo(): boolean {
    return this.back.length > 0;
  }
  get canRedo(): boolean {
    return this.fwd.length > 0;
  }
}
