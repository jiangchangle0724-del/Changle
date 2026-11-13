/**
 * 2.5D（A8）：台子、会动的台子、转杆、跷跷板、箱子、烫锅和电轨画成有厚度的块。
 *
 * 正面还是 Terrain 和 Stage 画的那一面（物理的那条边），这里只画它后面露出来的侧面：
 * 每个点往镜头中心缩一点，背面的点 = 镜头中心 + (正面的点 − 镜头中心) × F / (F + 厚度)。
 * 正面四条边各连一块侧面，只画从镜头这边看得见的（边的外法线朝着镜头中心那边的）；
 * 正面画在这一层前面，挡住的部分自然看不见。镜头往右走，台子的左侧面露出来；
 * 人在高处往下看，台子的顶面露出来。光从左上来：朝上的面最亮，朝下的最暗。
 *
 * 每帧只画镜头里的东西（几十块，几毫秒都不到）；减弱动效时照样画（它不晃不闪，只是跟着镜头）。
 * 物理不看它：站的、抓的还是正面那条边。
 */
import { Container, Graphics } from 'pixi.js';
import type { HazardDef, Level, Pt, Rect } from '../physics/level';
import { moverAt, spinnerAngle } from '../physics/motion';
import type { SimView } from './view';
import { hex, materialOf, mix, OUTLINE, type MaterialStyle, type WorldId } from './art';

/** 焦距（世界像素）：越小透视越猛。800 时 80 px 厚的台子，离镜头中心 300 px 的地方露出约 27 px 的侧面。 */
export const FOCAL = 800;
/** 光从哪来（从面指向光）：左上偏上。 */
const LIGHT = (() => {
  const x = -0.35;
  const y = -1;
  const m = Math.hypot(x, y);
  return { x: x / m, y: y / m };
})();

interface Box {
  /** 正面的四个角，顺时针（左上、右上、右下、左下）。 */
  pts: [Pt, Pt, Pt, Pt];
  depth: number;
  style: MaterialStyle;
  alpha: number;
}

interface Shade {
  light: string;
  dark: string;
}

/** 世界的「看得见的范围」：镜头中心、半宽半高（世界坐标）。 */
export interface DepthView {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}

/** 一块侧面多亮（-1 背光 … 1 正对着光）：外法线和光的方向点乘。 */
function facing(n: Pt): number {
  return n.x * LIGHT.x + n.y * LIGHT.y;
}

/** 正面一点往镜头中心缩到背面。 */
function back(p: Pt, vp: Pt, s: number): Pt {
  return { x: vp.x + (p.x - vp.x) * s, y: vp.y + (p.y - vp.y) * s };
}

function rectPts(r: Rect): [Pt, Pt, Pt, Pt] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** 一块平台多厚：细筷子、钉子是圆棍（厚度 = 粗细），饼干薄一点，别的都是 70 px 的块。 */
export function depthOf(r: Rect): number {
  if (r.kind === 'peg') return 24;
  if (r.kind === 'cookie') return 42;
  const thin = r.h <= 26 && r.w >= r.h * 3;
  if (thin) return Math.max(10, r.h);
  return 80;
}

export class Depth {
  readonly view = new Container();
  private readonly g = new Graphics();
  private readonly shades = new Map<MaterialStyle, Shade>();

  constructor(
    private readonly level: Level,
    private readonly world: WorldId,
  ) {
    this.view.addChild(this.g);
  }

  private style(material: string | undefined): MaterialStyle {
    return materialOf(material ?? (this.world === 'van' ? 'metal' : 'wood'));
  }

  /** 每帧：镜头中心 vp，看得见的范围 view。 */
  update(sim: SimView, view: DepthView): void {
    const g = this.g.clear();
    const vp = { x: view.x, y: view.y };
    const margin = 220;
    const x0 = view.x - view.halfW - margin;
    const x1 = view.x + view.halfW + margin;
    const y0 = view.y - view.halfH - margin;
    const y1 = view.y + view.halfH + margin;
    const seen = (r: Rect): boolean => r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0;
    const boxes: Box[] = [];
    const level = this.level;
    const t = sim.time;
    for (const r of level.rects) {
      if (r.until !== undefined && t >= r.until) continue;
      if (!seen(r)) continue;
      boxes.push({ pts: rectPts(r), depth: depthOf(r), style: this.style(r.material), alpha: 1 });
    }
    for (const m of level.movers ?? []) {
      if (m.until !== undefined && t >= m.until) continue;
      const at = moverAt(m, t);
      const r = { ...m, x: at.x, y: at.y };
      if (!seen(r)) continue;
      if (m.deadly) boxes.push({ pts: rectPts(r), depth: 34, style: this.hazardStyle(m.hazard ?? 'spike'), alpha: 1 });
      else boxes.push({ pts: rectPts(r), depth: depthOf(r), style: this.style(m.material), alpha: 1 });
    }
    for (const sp of level.spinners ?? []) {
      if (sp.until !== undefined && t >= sp.until) continue;
      const reach = sp.len + 30;
      if (sp.pivot.x + reach < x0 || sp.pivot.x - reach > x1 || sp.pivot.y + reach < y0 || sp.pivot.y - reach > y1) continue;
      const a0 = spinnerAngle(sp, t);
      const h = sp.h ?? 16;
      const style = sp.deadly ? this.hazardStyle('zap') : this.style(sp.material);
      for (let j = 0; j < Math.max(1, sp.arms); j++) {
        const a = a0 + (j * 2 * Math.PI) / Math.max(1, sp.arms);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const at = (lx: number, ly: number): Pt => ({ x: sp.pivot.x + lx * c - ly * s, y: sp.pivot.y + lx * s + ly * c });
        boxes.push({ pts: [at(0, -h / 2), at(sp.len, -h / 2), at(sp.len, h / 2), at(0, h / 2)], depth: Math.max(10, h), style, alpha: 1 });
      }
    }
    for (const h of level.hazards ?? []) {
      if (h.until !== undefined && t >= h.until) continue;
      if ((h.kind ?? 'spike') === 'spike' || !seen(h)) continue;
      boxes.push({ pts: rectPts(h), depth: h.kind === 'hot' ? 60 : 30, style: this.hazardStyle(h.kind ?? 'zap'), alpha: 1 });
    }
    sim.fadings.forEach((f) => {
      if (!seen(f)) return;
      const alpha = f.on ? (f.left < 0.8 ? 0.45 + 0.55 * (f.left / 0.8) : 1) : f.left < 0.35 ? 0.6 * (1 - f.left / 0.35) : 0;
      if (alpha <= 0.02) return;
      boxes.push({ pts: rectPts(f), depth: depthOf({ ...f, kind: 'cookie' }), style: this.cookieStyle(), alpha });
    });
    for (const prop of sim.props) {
      const c = Math.cos(prop.angle);
      const s = Math.sin(prop.angle);
      const at = (lx: number, ly: number): Pt => ({ x: prop.x + lx * c - ly * s, y: prop.y + lx * s + ly * c });
      const w = prop.w / 2;
      const hh = prop.h / 2;
      const style = this.style(this.world === 'van' ? 'metal' : 'wood');
      boxes.push({ pts: [at(-w, -hh), at(w, -hh), at(w, hh), at(-w, hh)], depth: prop.kind === 'crate' ? Math.min(90, prop.w) : 50, style, alpha: 1 });
    }
    // 离镜头远的先画：近处的侧面压在远处的上面
    boxes.sort((a, b) => dist2(b, vp) - dist2(a, vp));
    for (const b of boxes) this.box(g, b, vp);
  }

  /** 一块的侧面：看得见的每条边连一块，按朝向上色，后边描一道线。 */
  private box(g: Graphics, b: Box, vp: Pt): void {
    const s = FOCAL / (FOCAL + b.depth);
    const shade = this.shade(b.style);
    const backs = b.pts.map((p) => back(p, vp, s)) as [Pt, Pt, Pt, Pt];
    for (let i = 0; i < 4; i++) {
      const a = b.pts[i] as Pt;
      const c = b.pts[(i + 1) % 4] as Pt;
      // 顺时针的边，外法线 = (dy, -dx) 归一
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const n = { x: dy / len, y: -dx / len };
      // 镜头中心在这条边外面，背面的边就往外挪，这块侧面露出来
      if ((vp.x - a.x) * n.x + (vp.y - a.y) * n.y <= 0) continue;
      const ba = backs[i] as Pt;
      const bc = backs[(i + 1) % 4] as Pt;
      const lit = (facing(n) + 1) / 2;
      // 往里越深越暗：分三条，前面本色，后面压暗，像光照不进去
      for (let k = 0; k < BANDS.length - 1; k++) {
        const t0 = BANDS[k] as number;
        const t1 = BANDS[k + 1] as number;
        const p0 = lerp(a, ba, t0);
        const p1 = lerp(c, bc, t0);
        const p2 = lerp(c, bc, t1);
        const p3 = lerp(a, ba, t1);
        const color = mix(shade.dark, shade.light, Math.max(0, lit - k * 0.14));
        g.poly([p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y]).fill({ color, alpha: b.alpha });
      }
      // 远处那条边描一道，卡通的轮廓
      g.moveTo(ba.x, ba.y).lineTo(bc.x, bc.y).stroke({ width: 2, color: hex(OUTLINE), alpha: 0.55 * b.alpha });
      // 侧面和正面的接缝：朝上的面在接缝亮一道（像磨圆的边）
      if (n.y < -0.5) g.moveTo(a.x, a.y).lineTo(c.x, c.y).stroke({ width: 2, color: 0xffffff, alpha: 0.22 * b.alpha });
    }
  }

  private shade(m: MaterialStyle): Shade {
    let s = this.shades.get(m);
    if (!s) {
      // 亮面在亮边和本色之间，暗面比暗部再深一点
      const light = '#' + mix(m.light, m.base, 0.35).toString(16).padStart(6, '0');
      const dark = '#' + mix(m.dark, '#000000', 0.25).toString(16).padStart(6, '0');
      s = { light, dark };
      this.shades.set(m, s);
    }
    return s;
  }

  private hazardStyle(kind: NonNullable<HazardDef['kind']>): MaterialStyle {
    const van = this.world === 'van';
    if (kind === 'hot') return van ? HOT_VAN : HOT_TABLE;
    if (kind === 'zap') return van ? ZAP_VAN : ZAP_TABLE;
    return van ? SPIKE_VAN : SPIKE_TABLE;
  }

  private cookieStyle(): MaterialStyle {
    return this.world === 'van' ? this.style('metal') : COOKIE;
  }
}

/** 侧面往里分的三条（0 = 正面那条边，1 = 后边）。 */
const BANDS = [0, 0.45, 0.78, 1];

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function dist2(b: Box, vp: Pt): number {
  let x = 0;
  let y = 0;
  for (const p of b.pts) {
    x += p.x;
    y += p.y;
  }
  x = x / 4 - vp.x;
  y = y / 4 - vp.y;
  return x * x + y * y;
}

// 要命的东西和饼干的侧面颜色（和 Terrain 画的正面配）
const HOT_TABLE: MaterialStyle = { base: '#8e1b10', dark: '#4a0c06', light: '#d8432a', detail: '#ffb37a', texture: 'wood' };
const HOT_VAN: MaterialStyle = { base: '#2b2b30', dark: '#141418', light: '#5a5a66', detail: '#ff6a2c', texture: 'metal' };
const ZAP_TABLE: MaterialStyle = { base: '#2a2226', dark: '#151013', light: '#5a4a50', detail: '#ff7a2f', texture: 'metal' };
const ZAP_VAN: MaterialStyle = { base: '#1f1f24', dark: '#0e0e12', light: '#f6c445', detail: '#f6c445', texture: 'metal' };
const SPIKE_TABLE: MaterialStyle = { base: '#c99a5b', dark: '#8a5a2b', light: '#f0d9a8', detail: '#fff4dc', texture: 'wood' };
const SPIKE_VAN: MaterialStyle = { base: '#4a5466', dark: '#2a303b', light: '#c9d3e0', detail: '#c9d3e0', texture: 'metal' };
const COOKIE: MaterialStyle = { base: '#e2b06a', dark: '#a56f2e', light: '#f6d49a', detail: '#a56f2e', texture: 'wood' };
