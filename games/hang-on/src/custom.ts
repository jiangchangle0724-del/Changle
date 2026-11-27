/**
 * 关卡编辑器（11-26，14 样的第 14 样）：自己做的关。编辑器（/hang-on/editor/）做好以后变成一串码，
 * 放进链接里分享（不存服务器）：主机页 `?custom=码` 开这一关，编辑器 `#码` 接着改。
 * 码 = 关卡的 JSON 压缩（deflate-raw）再 base64url。码是别人给的，什么都可能有：解开以后一律经过 `cleanCustom`，
 * 只留编辑器放得出来的几样（台子、出生点、终点、检查点、绳子、蜡烛、饼干、尖刺、箱子、大石头），数都夹在范围里。
 * 自制关没有星、没有红包（不让人做个红包关刷扭蛋机），不进每日一关。契约见 CONTRACTS.md「关卡编辑器契约」。
 */
import type { CrateDef, FadingDef, HazardDef, Level, Pt, Rect, RopeDef, SpringDef, BoulderDef } from './physics/level';

export const CUSTOM_WORLDS = ['table', 'van', 'kitchen', 'snow', 'house', 'space'] as const;
export type CustomWorld = (typeof CUSTOM_WORLDS)[number];
export const CUSTOM_MATERIALS = ['wood', 'cloth', 'ceramic', 'metal', 'bamboo', 'brick', 'snow', 'ice', 'hull', 'noodle'] as const;
/** 关卡大小：宽 1280 到 4000，高 720 到 2400。 */
export const SIZE = { minW: 1280, maxW: 4000, minH: 720, maxH: 2400 } as const;
/** 每样最多几个（和验收器给正式关的预算差不多，手机局的快照也装得下）。 */
export const LIMITS = { rects: 60, checkpoints: 10, ropes: 6, springs: 10, fading: 20, hazards: 30, crates: 6, boulders: 3 } as const;
/** 名字最多几个字。 */
export const CUSTOM_NAME_MAX = 20;
/** 码最长多少（再长就不是编辑器做出来的了）。 */
export const CODE_MAX = 12_000;
/** 解开以后的 JSON 最多多大（防一小串码解出一大堆）。 */
const JSON_MAX = 64_000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: unknown, lo: number, hi: number, d: number): number => (finite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
const arr = (v: unknown, max: number): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** 收拾名字：去掉控制字符和看不见的字，最多 CUSTOM_NAME_MAX 个字。 */
export function cleanCustomName(x: unknown): string {
  const s = typeof x === 'string' ? x : '';
  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '').trim();
  return [...t].slice(0, CUSTOM_NAME_MAX).join('').trim();
}

/**
 * 别人给的关（解开的 JSON，或者编辑器里的）收拾成能玩的关：只留编辑器放得出来的几样，数夹在范围里，东西都在关里。
 * 没有出生点或终点、或者收拾完太大（手机局一张样子名单装不下），就不要（null）。id 由外面给（`customId`）。
 */
export function cleanCustom(raw: unknown, id = 'custom'): Level | null {
  const o = obj(raw);
  if (!o) return null;
  const w = Math.round(clamp(o.w, SIZE.minW, SIZE.maxW, 2560) / 40) * 40;
  const h = Math.round(clamp(o.h, SIZE.minH, SIZE.maxH, 720) / 40) * 40;
  const pt = (v: unknown, m = 24): Pt | null => {
    const p = obj(v);
    return p && finite(p.x) && finite(p.y) ? { x: clamp(p.x, m, w - m, 0), y: clamp(p.y, m, h - m, 0) } : null;
  };
  /** 一个框：宽高夹在 [lo, hi]，整个在关里。 */
  const box = (v: Record<string, unknown>, lo: number, hiW: number, hiH = hiW): Rect | null => {
    if (!finite(v.x) || !finite(v.y) || !finite(v.w) || !finite(v.h)) return null;
    const bw = clamp(v.w, lo, Math.min(hiW, w), lo);
    const bh = clamp(v.h, lo, Math.min(hiH, h), lo);
    return { x: clamp(v.x, 0, w - bw, 0), y: clamp(v.y, 0, h - bh, 0), w: bw, h: bh };
  };
  const spawn = pt(o.spawn, 40);
  const g = obj(o.goal);
  const goal = g ? box(g, 80, 400) : null;
  if (!spawn || !goal) return null;
  const name = cleanCustomName(obj(o.name)?.zh ?? o.name) || '自制关';
  const rects: Rect[] = [];
  for (const r of arr(o.rects, LIMITS.rects)) {
    const kind = pick(r.kind, ['ground', 'wall', 'peg'] as const, 'ground');
    const b = box(r, kind === 'peg' ? 12 : 16, kind === 'peg' ? 80 : 4000);
    if (b) rects.push({ ...b, kind, material: pick(r.material, CUSTOM_MATERIALS, 'wood') });
  }
  const ropes: RopeDef[] = [];
  for (const r of arr(o.ropes, LIMITS.ropes)) {
    const anchor = pt(r.anchor, 0);
    if (anchor) ropes.push({ anchor, segments: clamp(r.segments, 3, 16, 8), segLen: clamp(r.segLen, 16, 32, 22) });
  }
  const springs: SpringDef[] = [];
  for (const s of arr(o.springs, LIMITS.springs)) {
    const b = box(s, 40, 200, 600);
    if (b) springs.push({ ...b, power: Math.min(1.6, Math.max(0.5, finite(s.power) ? Math.round(s.power * 10) / 10 : 1)) });
  }
  const fading: FadingDef[] = [];
  for (const f of arr(o.fading, LIMITS.fading)) {
    const b = box(f, 24, 300);
    if (b) fading.push({ ...b, material: pick(f.material, CUSTOM_MATERIALS, 'wood'), on: clamp(f.on, 1, 8, 4), off: clamp(f.off, 1, 8, 2), phase: clamp(f.phase, 0, 10, 0) });
  }
  const hazards: HazardDef[] = [];
  for (const z of arr(o.hazards, LIMITS.hazards)) {
    const b = box(z, 12, 600);
    if (b) hazards.push({ ...b, kind: pick(z.kind, ['spike', 'hot', 'zap'] as const, 'spike') });
  }
  const crates: CrateDef[] = [];
  for (const c of arr(o.crates, LIMITS.crates)) {
    const b = box(c, 30, 160);
    if (b) crates.push({ ...b, material: pick(c.material, CUSTOM_MATERIALS, 'wood') });
  }
  const boulders: BoulderDef[] = [];
  for (const b of arr(o.boulders, LIMITS.boulders)) {
    const p = pt(b, 40);
    if (p) boulders.push({ ...p, r: clamp(b.r, 36, 90, 56) });
  }
  const checkpoints = arr(o.checkpoints, LIMITS.checkpoints)
    .map((c) => pt(c, 40))
    .filter((c): c is Pt => !!c);
  const level: Level = {
    id,
    name: { zh: name, en: name },
    world: pick(o.world, CUSTOM_WORLDS, 'table'),
    w,
    h,
    spawn,
    goal,
    checkpoints,
    deathY: h + 70,
    rects,
    ...(ropes.length ? { ropes } : {}),
    ...(springs.length ? { springs } : {}),
    ...(fading.length ? { fading } : {}),
    ...(hazards.length ? { hazards } : {}),
    ...(crates.length ? { crates } : {}),
    ...(boulders.length ? { boulders } : {}),
  };
  return JSON.stringify(level).length <= 12_000 ? level : null;
}

/** 码的 id：「custom-」加码的 8 位十六进制指纹（主机和每部手机算出来一样）。 */
export function customId(code: string): string {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  return `custom-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
export const isCustom = (l: Pick<Level, 'id'>): boolean => l.id.startsWith('custom-');

const toB64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (code: string): Uint8Array<ArrayBuffer> => {
  const s = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function pump(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** 关卡变成码（不带 id）。 */
export async function encodeLevel(level: Level): Promise<string> {
  const { id: _id, ...rest } = level;
  const bytes = new TextEncoder().encode(JSON.stringify(rest));
  const out = await pump(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')), JSON_MAX);
  return out ? toB64url(out) : '';
}

/** 码解成能玩的关（收拾过，id 是 `customId(码)`）；解不开、不对的是 null。 */
export async function decodeLevel(code: string): Promise<Level | null> {
  if (!code || code.length > CODE_MAX || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const bytes = fromB64url(code);
    const out = await pump(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')), JSON_MAX);
    if (!out) return null;
    return cleanCustom(JSON.parse(new TextDecoder().decode(out)), customId(code));
  } catch {
    return null;
  }
}
