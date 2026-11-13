/**
 * 关卡的画法（A3）：平台按材质贴图（茶布、木头、瓷、钢、冰），细木条画成筷子，小块是筷子架；
 * 饼干平台会抖会消失，蜡烛顶上有火苗、被弹到就压一下；检查点是灯，亮了就发光；终点是面旗子。
 * 原版那套难的机关（A6）：要命的东西（桌上是牙签、红油锅、电炉丝；温哥华是铁栏杆尖、夜市烤炉、天车电轨），
 * 会动的平台和会转的杆子按 sim.time 摆（和物理同一套算法，手机局里别的手机也对得上）。
 * 静态的东西只画一次，动的每帧更新。
 */
import { Container, Graphics } from 'pixi.js';
import type { HazardDef, Level, Rect } from '../physics/level';
import { moverAt, spinnerAngle } from '../physics/motion';
import type { SimView } from './view';
import { glow, materialOf, OUTLINE, textures, hex, type MaterialStyle, type Palette, type Textures, type WorldId } from './art';

const rr = (g: Graphics, r: Rect, rad: number): Graphics => g.roundRect(r.x, r.y, r.w, r.h, Math.min(rad, r.h / 2, r.w / 2));

export class Terrain {
  readonly view = new Container();
  private readonly ground = new Graphics();
  private readonly fadingG: Graphics[] = [];
  private readonly springG: { body: Graphics; flame: Graphics; c: Container }[] = [];
  private readonly lamps = new Graphics();
  private readonly flag = new Graphics();
  private readonly goal = new Graphics();
  private readonly hazardG = new Graphics();
  /** 要命的东西会动的那一层：冒泡、冒烟、电火花。 */
  private readonly hazardFx = new Graphics();
  private readonly moverC: Container[] = [];
  private readonly spinnerC: Container[] = [];
  private lampState = -2;
  private readonly tex: Textures;
  private t = 0;

  constructor(
    private readonly level: Level,
    private readonly world: WorldId,
    private readonly pal: Palette,
  ) {
    this.tex = textures();
    this.view.addChild(this.goal, this.ground, this.lamps, this.flag);
    this.drawGoal();
    for (const r of level.rects) this.platform(this.ground, r);
    // 会动的平台：在自己的原点上画好，每帧整块挪过去（贴图跟着走）
    for (const m of level.movers ?? []) {
      const c = new Container();
      const g = new Graphics();
      const local = { ...m, x: 0, y: 0 };
      if (m.deadly) this.hazard(g, { ...local, kind: m.hazard ?? 'spike' });
      else this.platform(g, local);
      c.addChild(g);
      this.view.addChild(c);
      this.moverC.push(c);
    }
    // 会转的杆子：轴心是原点，每根杆子朝自己的方向画，每帧整个转
    for (const sp of level.spinners ?? []) {
      const c = new Container();
      c.position.set(sp.pivot.x, sp.pivot.y);
      for (let j = 0; j < Math.max(1, sp.arms); j++) {
        const g = new Graphics();
        this.spinnerArm(g, sp.len, sp.h ?? 16, !!sp.deadly, sp.material);
        g.rotation = (j * 2 * Math.PI) / Math.max(1, sp.arms);
        c.addChild(g);
      }
      const hub = new Graphics();
      this.spinnerHub(hub, sp.h ?? 16, !!sp.deadly);
      c.addChild(hub);
      this.view.addChild(c);
      this.spinnerC.push(c);
    }
    for (const h of level.hazards ?? []) this.hazard(this.hazardG, h);
    this.view.addChild(this.hazardG, this.hazardFx);
    for (const f of level.fading ?? []) {
      const g = new Graphics();
      this.platform(g, { ...f, kind: 'cookie' });
      this.view.addChild(g);
      this.fadingG.push(g);
    }
    for (const s of level.springs ?? []) {
      const c = new Container();
      const body = new Graphics();
      const flame = new Graphics();
      this.candle(body, s);
      c.addChild(body, flame);
      // 压扁时底边不动：容器的原点放在蜡烛底部中心
      c.position.set(s.x + s.w / 2, s.y + s.h);
      body.position.set(-(s.x + s.w / 2), -(s.y + s.h));
      flame.position.set(0, -(s.h + 2));
      this.view.addChild(c);
      this.springG.push({ body, flame, c });
    }
  }

  update(sim: SimView, dt: number): void {
    this.t += dt;
    // 饼干：快没了就抖、变淡；没了就不画；回来时弹一下
    sim.fadings.forEach((f, i) => {
      const g = this.fadingG[i];
      if (!g) return;
      if (!f.on) {
        g.visible = f.left < 0.35;
        if (g.visible) {
          const k = 1 - f.left / 0.35;
          g.alpha = 0.6 * k;
          g.position.set(0, 0);
          g.scale.set(1);
        }
        return;
      }
      g.visible = true;
      g.alpha = f.left < 0.8 ? 0.45 + 0.55 * (f.left / 0.8) : 1;
      const shake = f.left < 0.8 ? (0.8 - f.left) * 4 : 0;
      g.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    });
    // 蜡烛：火苗摇，被弹就压一下再弹回
    sim.springs.forEach((s, i) => {
      const sg = this.springG[i];
      if (!sg) return;
      const k = s.hit < 0.3 ? Math.sin((s.hit / 0.3) * Math.PI) : 0;
      sg.c.scale.set(1 + 0.18 * k, 1 - 0.28 * k);
      this.drawFlame(sg.flame, s.w, this.t * 9 + i, k);
    });
    // 会动的平台、会转的杆子：和物理同一套算法，按 sim.time 摆
    (this.level.movers ?? []).forEach((m, i) => {
      const at = moverAt(m, sim.time);
      this.moverC[i]?.position.set(at.x, at.y);
    });
    (this.level.spinners ?? []).forEach((sp, i) => {
      const c = this.spinnerC[i];
      if (c) c.rotation = spinnerAngle(sp, sim.time);
    });
    this.drawHazardFx(sim.time);
    // 检查点的灯
    if (sim.checkpoint !== this.lampState) {
      this.lampState = sim.checkpoint;
      this.drawLamps(sim.checkpoint);
    }
    this.drawFlag();
  }

  // ---------------------------------------------------------------- 平台

  private platform(g: Graphics, r: Rect): void {
    const m = materialOf(r.material ?? (this.world === 'van' ? 'metal' : 'wood'));
    const tex = this.tex[m.texture];
    const thin = r.h <= 26 && r.w >= r.h * 3;
    if (r.kind === 'peg') return this.peg(g, r);
    if (r.kind === 'cookie') return this.cookie(g, r, m);
    if (thin && (m.texture === 'wood' || r.material === 'noodle')) return this.chopstick(g, r, m);
    const rad = m.texture === 'ceramic' ? 14 : m.texture === 'cloth' ? 6 : 10;
    rr(g, r, rad).fill({ texture: tex, textureSpace: 'global' });
    if (m.texture === 'ice') rr(g, r, rad).fill({ color: 0xffffff, alpha: 0.12 });
    // 顶边亮、底边暗，3 米外能看出哪面能站
    const top = Math.min(12, r.h * 0.3);
    g.roundRect(r.x + 2, r.y, r.w - 4, top, Math.min(6, top / 2)).fill({ color: hex(m.light), alpha: m.texture === 'ceramic' ? 0.9 : 0.7 });
    const bottom = Math.min(16, r.h * 0.3);
    g.roundRect(r.x, r.y + r.h - bottom, r.w, bottom, Math.min(8, bottom / 2)).fill({ color: hex(m.dark), alpha: 0.35 });
    if (m.texture === 'ceramic') {
      // 青花的边：两道蓝线
      g.moveTo(r.x + 8, r.y + top + 4).lineTo(r.x + r.w - 8, r.y + top + 4).stroke({ width: 2, color: hex(m.detail), alpha: 0.7 });
      g.moveTo(r.x + 8, r.y + top + 9).lineTo(r.x + r.w - 8, r.y + top + 9).stroke({ width: 1, color: hex(m.detail), alpha: 0.5 });
    }
    if (m.texture === 'cloth') {
      // 桌布的缝边
      g.moveTo(r.x + 6, r.y + top + 3).lineTo(r.x + r.w - 6, r.y + top + 3).stroke({ width: 1.5, color: hex(m.light), alpha: 0.5 });
    }
    if (r.grab === false) this.sheen(g, r);
    rr(g, r, rad).stroke({ width: 3, color: hex(m.dark), alpha: 0.85 });
  }

  /** 不能抓的面：一层亮亮的斜纹，像铺了膜。 */
  private sheen(g: Graphics, r: Rect): void {
    for (let x = r.x - r.h; x < r.x + r.w; x += 34) {
      const x0 = Math.max(r.x, x);
      const x1 = Math.min(r.x + r.w, x + r.h);
      if (x1 <= x0) continue;
      g.moveTo(x0, r.y + (x0 - x)).lineTo(x1, r.y + (x1 - x)).stroke({ width: 5, color: 0xffffff, alpha: 0.14 });
    }
  }

  private chopstick(g: Graphics, r: Rect, m: MaterialStyle): void {
    const h = r.h;
    g.roundRect(r.x, r.y, r.w, h, h / 2).fill({ texture: this.tex.wood, textureSpace: 'global' });
    g.roundRect(r.x + 3, r.y + 1, r.w - 6, Math.max(3, h * 0.3), 3).fill({ color: hex(m.light), alpha: 0.7 });
    // 漆红的一头
    g.roundRect(r.x + r.w - Math.min(60, r.w * 0.22), r.y, Math.min(60, r.w * 0.22), h, h / 2).fill({ color: 0xc93a2e, alpha: 0.85 });
    g.roundRect(r.x, r.y, r.w, h, h / 2).stroke({ width: 3, color: hex(m.dark), alpha: 0.9 });
  }

  private peg(g: Graphics, r: Rect): void {
    g.roundRect(r.x, r.y, r.w, r.h, 5).fill(0xf3d9a4);
    g.roundRect(r.x, r.y + r.h - 5, r.w, 5, 3).fill({ color: 0x000000, alpha: 0.18 });
    g.roundRect(r.x, r.y, r.w, r.h, 5).stroke({ width: 2, color: OUTLINE, alpha: 0.6 });
  }

  /** 饼干：圆角、焦边、几个洞，一看就不牢。 */
  private cookie(g: Graphics, r: Rect, m: MaterialStyle): void {
    const rad = Math.min(12, r.h / 2);
    const base = this.world === 'van' ? m.base : '#e2b06a';
    const dark = this.world === 'van' ? m.dark : '#a56f2e';
    g.roundRect(r.x, r.y, r.w, r.h, rad).fill(base);
    g.roundRect(r.x + 2, r.y, r.w - 4, Math.min(10, r.h * 0.3), 5).fill({ color: 0xffffff, alpha: 0.35 });
    for (let k = 0; k < Math.max(2, Math.floor(r.w / 30)); k++) {
      const px = r.x + 14 + ((k * 37) % Math.max(1, r.w - 28));
      const py = r.y + 8 + ((k * 23) % Math.max(1, r.h - 16));
      g.circle(px, py, 2.5).fill({ color: hex(dark), alpha: 0.6 });
    }
    // 裂纹
    g.moveTo(r.x + r.w * 0.3, r.y).lineTo(r.x + r.w * 0.36, r.y + r.h * 0.5).lineTo(r.x + r.w * 0.3, r.y + r.h).stroke({ width: 1.5, color: hex(dark), alpha: 0.5 });
    g.moveTo(r.x + r.w * 0.68, r.y).lineTo(r.x + r.w * 0.62, r.y + r.h * 0.5).lineTo(r.x + r.w * 0.7, r.y + r.h).stroke({ width: 1.5, color: hex(dark), alpha: 0.5 });
    g.roundRect(r.x, r.y, r.w, r.h, rad).stroke({ width: 3, color: hex(dark), alpha: 0.9 });
  }

  // ---------------------------------------------------------------- 要命的东西（A6）

  /** 要命的东西的底子：尖的画一排尖头，烫的画一锅红油（或一炉炭），带电的画电炉丝（或黄黑电轨）。 */
  private hazard(g: Graphics, h: HazardDef): void {
    const van = this.world === 'van';
    const kind = h.kind ?? 'spike';
    if (kind === 'spike') return this.spikes(g, h, van);
    if (kind === 'hot') {
      if (van) {
        // 夜市烤炉：铁盒子，炭火，铁网
        rr(g, h, 6).fill(0x2b2b30);
        g.roundRect(h.x + 4, h.y + 4, h.w - 8, Math.max(4, h.h - 8), 4).fill(0x5a1d12);
        for (let x = h.x + 10; x < h.x + h.w - 6; x += 18) g.circle(x, h.y + h.h * 0.55, Math.min(7, h.h * 0.25)).fill({ color: 0xff6a2c, alpha: 0.85 });
        for (let x = h.x + 6; x < h.x + h.w - 4; x += 12) g.moveTo(x, h.y + 2).lineTo(x, h.y + Math.min(12, h.h)).stroke({ width: 2, color: 0x9aa3ad, alpha: 0.8 });
        g.moveTo(h.x + 2, h.y + 3).lineTo(h.x + h.w - 2, h.y + 3).stroke({ width: 3, color: 0x9aa3ad });
        rr(g, h, 6).stroke({ width: 3, color: OUTLINE, alpha: 0.9 });
        return;
      }
      // 红油锅：深红的汤，亮一点的油面，漂着辣椒段和芝麻
      rr(g, h, 8).fill(0x8e1b10);
      g.roundRect(h.x, h.y, h.w, Math.min(14, h.h * 0.4), 6).fill({ color: 0xd8432a, alpha: 0.95 });
      g.roundRect(h.x + 6, h.y + 2, h.w - 12, 3, 2).fill({ color: 0xffb37a, alpha: 0.6 });
      for (let k = 0; k < Math.floor(h.w / 46); k++) {
        const x = h.x + 20 + k * 46 + ((k * 17) % 13);
        g.roundRect(x, h.y + 4 + ((k * 7) % 5), 14, 5, 2.5).fill(0xe8413c).stroke({ width: 1, color: 0x5a0d06 });
        g.circle(x + 26, h.y + 8 + ((k * 5) % 4), 1.6).fill(0xf5e2c2);
      }
      rr(g, h, 8).stroke({ width: 3, color: 0x5a0d06, alpha: 0.9 });
      return;
    }
    // 带电的
    if (van) {
      // 天车的电轨：黄黑条纹
      rr(g, h, 4).fill(0x1f1f24);
      const stripe = 22;
      for (let x = h.x - h.h; x < h.x + h.w; x += stripe * 2) {
        const x0 = Math.max(h.x, x);
        const x1 = Math.min(h.x + h.w, x + stripe);
        if (x1 > x0) g.poly([x0, h.y, x1, h.y, Math.min(h.x + h.w, x1 + h.h * 0.4), h.y + h.h, Math.min(h.x + h.w, x0 + h.h * 0.4), h.y + h.h]).fill(0xf6c445);
      }
      rr(g, h, 4).stroke({ width: 3, color: OUTLINE, alpha: 0.9 });
      return;
    }
    // 电炉丝：黑瓷板上一圈圈发红的丝
    rr(g, h, 8).fill(0x2a2226);
    const rows = Math.max(1, Math.floor(h.h / 14));
    for (let r = 0; r < rows; r++) {
      const y = h.y + (h.h / (rows + 1)) * (r + 1);
      g.moveTo(h.x + 6, y);
      for (let x = h.x + 6; x < h.x + h.w - 6; x += 10) g.lineTo(x + 5, y + (((x / 10) | 0) % 2 ? -3 : 3));
      g.stroke({ width: 3, color: 0xff7a2f, alpha: 0.95 });
    }
    rr(g, h, 8).stroke({ width: 3, color: OUTLINE, alpha: 0.9 });
  }

  /** 一排尖头（桌上是牙签，温哥华是铁栏杆尖），朝 dir 那边。 */
  private spikes(g: Graphics, h: HazardDef, van: boolean): void {
    const dir = h.dir ?? 'up';
    const vertical = dir === 'up' || dir === 'down';
    const span = vertical ? h.w : h.h;
    const depth = vertical ? h.h : h.w;
    const n = Math.max(1, Math.round(span / (van ? 26 : 18)));
    const step = span / n;
    // 桌上是竹签（浅竹色），温哥华是铁栏杆尖（深铁色）；描深边，隔着电视也看得清
    const stick = van ? 0x4a5466 : 0xf0d9a8;
    const tip = van ? 0xc9d3e0 : 0xfff4dc;
    // 底座：桌上是一小条豆腐干一样的托，温哥华是横铁杆
    const base = Math.min(10, depth * 0.3);
    const baseR: Rect = dir === 'up' ? { x: h.x, y: h.y + h.h - base, w: h.w, h: base } : dir === 'down' ? { x: h.x, y: h.y, w: h.w, h: base } : dir === 'left' ? { x: h.x + h.w - base, y: h.y, w: base, h: h.h } : { x: h.x, y: h.y, w: base, h: h.h };
    for (let k = 0; k < n; k++) {
      const a = (vertical ? h.x : h.y) + step * k;
      const mid = a + step / 2;
      const half = Math.max(3, step * 0.36);
      let pts: number[];
      if (dir === 'up') pts = [mid - half, h.y + h.h, mid, h.y, mid + half, h.y + h.h];
      else if (dir === 'down') pts = [mid - half, h.y, mid, h.y + h.h, mid + half, h.y];
      else if (dir === 'left') pts = [h.x + h.w, mid - half, h.x, mid, h.x + h.w, mid + half];
      else pts = [h.x, mid - half, h.x + h.w, mid, h.x, mid + half];
      g.poly(pts).fill(stick).stroke({ width: 2, color: OUTLINE, alpha: 0.95, join: 'miter' });
      // 尖头亮一点
      const [x0, y0, x1, y1, x2, y2] = pts as [number, number, number, number, number, number];
      g.poly([x1, y1, x1 + (x0 - x1) * 0.35, y1 + (y0 - y1) * 0.35, x1 + (x2 - x1) * 0.35, y1 + (y2 - y1) * 0.35]).fill(tip);
    }
    g.roundRect(baseR.x, baseR.y, baseR.w, baseR.h, 3).fill(van ? 0x2a303b : 0xc99a5b).stroke({ width: 2, color: OUTLINE, alpha: 0.8 });
  }

  /** 会动的那一层：红油冒泡、烤炉冒火星、电丝闪、电轨打火花。 */
  private drawHazardFx(t: number): void {
    const g = this.hazardFx.clear();
    const van = this.world === 'van';
    const all: HazardDef[] = [...(this.level.hazards ?? [])];
    for (const m of this.level.movers ?? []) {
      if (!m.deadly) continue;
      const at = moverAt(m, t);
      all.push({ ...m, x: at.x, y: at.y, kind: m.hazard ?? 'spike' });
    }
    all.forEach((h, i) => {
      const kind = h.kind ?? 'spike';
      if (kind === 'hot') {
        const n = Math.max(2, Math.floor(h.w / 40));
        for (let k = 0; k < n; k++) {
          const u = (t * 0.9 + k * 0.37 + i * 0.21) % 1;
          const x = h.x + ((k + 0.5) * h.w) / n + Math.sin(t * 3 + k) * 4;
          if (van) {
            // 火星往上飘
            g.circle(x, h.y - u * 60, 2.2 * (1 - u)).fill({ color: 0xffb347, alpha: 1 - u });
          } else {
            // 泡：在油面上鼓起来、破
            const r = 3 + 6 * Math.sin(u * Math.PI);
            g.circle(x, h.y + 6, r).stroke({ width: 1.5, color: 0xffb37a, alpha: 0.8 * (1 - u) });
            // 热气
            g.circle(x + 6, h.y - 10 - u * 50, 8 + u * 14).fill({ color: 0xffffff, alpha: 0.12 * (1 - u) });
          }
        }
        glow(g, h.x + h.w / 2, h.y, Math.max(60, h.w * 0.6), van ? '#ff7a2f' : '#ff5a3c', 0.18);
      } else if (kind === 'zap') {
        const flick = 0.55 + 0.45 * Math.abs(Math.sin(t * 23 + i));
        glow(g, h.x + h.w / 2, h.y + h.h / 2, Math.max(50, Math.max(h.w, h.h) * 0.5), van ? '#7fd8ff' : '#ff7a2f', 0.22 * flick);
        // 两三道电弧在上面跳
        const arcs = Math.max(1, Math.floor(h.w / 90));
        for (let k = 0; k < arcs; k++) {
          const seed = Math.floor(t * 12) + k * 7 + i * 13;
          const x0 = h.x + ((seed * 37) % Math.max(1, h.w));
          let x = x0;
          let y = h.y + h.h / 2;
          g.moveTo(x, y);
          for (let s = 0; s < 4; s++) {
            x += (((seed + s * 11) % 9) - 4) * 4;
            y -= 6 + ((seed + s) % 5) * 2;
            g.lineTo(x, y);
          }
          g.stroke({ width: 2, color: van ? 0xbff0ff : 0xffd27a, alpha: flick });
        }
      }
    });
  }

  /** 会转的杆子的一根：桌上是一根筷子（红头朝外），温哥华是一根钢梁；带电的画成黄黑电杆。 */
  private spinnerArm(g: Graphics, len: number, h: number, deadly: boolean, material?: string): void {
    const r: Rect = { x: 0, y: -h / 2, w: len, h };
    if (deadly) {
      rr(g, r, 4).fill(0x1f1f24);
      for (let x = 0; x < len; x += 28) g.rect(x, -h / 2, Math.min(14, len - x), h).fill(0xf6c445);
      rr(g, r, 4).stroke({ width: 3, color: OUTLINE, alpha: 0.9 });
      return;
    }
    const m = materialOf(material ?? (this.world === 'van' ? 'metal' : 'wood'));
    if (this.world === 'van' && !material) {
      rr(g, r, 5).fill({ texture: this.tex.metal, textureSpace: 'global' });
      for (let x = 14; x < len - 6; x += 30) g.circle(x, 0, 2.5).fill(0x8a96aa);
      rr(g, r, 5).stroke({ width: 3, color: hex(m.dark), alpha: 0.9 });
      return;
    }
    this.chopstick(g, r, m);
  }

  /** 转轴：桌上是一个小碟子，温哥华是一颗大螺栓。 */
  private spinnerHub(g: Graphics, h: number, deadly: boolean): void {
    const r = Math.max(12, h * 0.9);
    if (this.world === 'table' && !deadly) {
      g.circle(0, 0, r).fill(0xf5efe6).stroke({ width: 3, color: OUTLINE });
      g.circle(0, 0, r * 0.62).stroke({ width: 2, color: 0x3d6db5, alpha: 0.8 });
      return;
    }
    g.circle(0, 0, r).fill(0x3b4352).stroke({ width: 3, color: OUTLINE });
    g.circle(0, 0, r * 0.4).fill(0x8a96aa);
  }

  // ---------------------------------------------------------------- 蜡烛

  private candle(g: Graphics, s: Rect): void {
    const wax = this.world === 'van' ? 0xd3dbe6 : 0xe8413c;
    const dark = this.world === 'van' ? 0x5a6676 : 0x8a1f1a;
    g.roundRect(s.x, s.y, s.w, s.h, 6).fill(wax);
    // 流下来的蜡
    g.moveTo(s.x + s.w * 0.2, s.y).quadraticCurveTo(s.x + s.w * 0.1, s.y + 16, s.x + s.w * 0.22, s.y + 26).quadraticCurveTo(s.x + s.w * 0.3, s.y + 10, s.x + s.w * 0.4, s.y).closePath().fill({ color: 0xffffff, alpha: 0.35 });
    g.roundRect(s.x + 3, s.y, s.w - 6, 7, 3).fill({ color: 0xffffff, alpha: 0.4 });
    g.roundRect(s.x, s.y, s.w, s.h, 6).stroke({ width: 3, color: dark, alpha: 0.9 });
    // 金字：福
    if (this.world === 'table' && s.h >= 50 && s.w >= 36) {
      g.circle(s.x + s.w / 2, s.y + s.h * 0.55, Math.min(s.w, s.h) * 0.26).stroke({ width: 2, color: 0xf8c56d, alpha: 0.8 });
    }
    // 灯芯
    g.rect(s.x + s.w / 2 - 1.5, s.y - 8, 3, 9).fill(0x3a2a2a);
  }

  private drawFlame(g: Graphics, w: number, t: number, k: number): void {
    g.clear();
    const sway = Math.sin(t) * 2 + Math.sin(t * 2.3) * 1.2;
    const h = 22 + Math.sin(t * 1.7) * 3 + k * 12;
    const base = Math.min(12, w * 0.3);
    g.moveTo(-base, -6).quadraticCurveTo(-base - 2, -h * 0.5, sway, -h - 8).quadraticCurveTo(base + 2, -h * 0.5, base, -6).closePath().fill({ color: 0xffb347, alpha: 0.9 });
    g.moveTo(-base * 0.5, -6).quadraticCurveTo(-base * 0.6, -h * 0.4, sway * 0.6, -h * 0.65).quadraticCurveTo(base * 0.6, -h * 0.4, base * 0.5, -6).closePath().fill({ color: 0xfff1a8, alpha: 0.95 });
    glow(g, sway * 0.3, -h * 0.4, h * 2.2, '#ffb347', 0.25);
  }

  // ---------------------------------------------------------------- 灯、旗、终点

  private drawLamps(active: number): void {
    const g = this.lamps.clear();
    (this.level.checkpoints ?? []).forEach((cp, i) => {
      const on = i <= active;
      const col = hex(on ? this.pal.lampOn : this.pal.lampOff);
      // 杆
      g.moveTo(cp.x, cp.y + 34).lineTo(cp.x, cp.y - 30).stroke({ width: 4, color: OUTLINE });
      g.ellipse(cp.x, cp.y + 34, 12, 4).fill({ color: 0x000000, alpha: 0.2 });
      if (this.world === 'table') {
        // 小灯笼
        if (on) glow(g, cp.x, cp.y - 10, 60, col, 0.35);
        g.roundRect(cp.x - 7, cp.y - 34, 14, 5, 2).fill(0xd9a441);
        g.ellipse(cp.x, cp.y - 10, 16, 20).fill(on ? 0xff5a3c : 0x6b3a3a).stroke({ width: 2, color: OUTLINE });
        g.ellipse(cp.x, cp.y - 10, 16, 20).stroke({ width: 1.2, color: col, alpha: on ? 0.7 : 0.3 });
        g.roundRect(cp.x - 7, cp.y + 9, 14, 5, 2).fill(0xd9a441);
      } else {
        // 浮标灯
        if (on) glow(g, cp.x, cp.y - 24, 60, col, 0.35);
        g.roundRect(cp.x - 9, cp.y - 32, 18, 16, 4).fill(on ? 0x9be8ff : 0x3f4f73).stroke({ width: 2, color: OUTLINE });
        g.roundRect(cp.x - 12, cp.y - 16, 24, 8, 3).fill(0xe8413c).stroke({ width: 2, color: OUTLINE });
      }
    });
  }

  private drawGoal(): void {
    const gz = this.level.goal;
    const g = this.goal;
    g.roundRect(gz.x, gz.y, gz.w, gz.h, 18).fill({ color: hex(this.pal.lampOn), alpha: 0.08 });
    g.roundRect(gz.x, gz.y, gz.w, gz.h, 18).stroke({ width: 2, color: hex(this.pal.lampOn), alpha: 0.25 });
  }

  private drawFlag(): void {
    const gz = this.level.goal;
    const f = this.level.flag ?? { x: gz.x + gz.w / 2, y: gz.y + gz.h };
    const g = this.flag.clear();
    g.moveTo(f.x, f.y).lineTo(f.x, f.y - 120).stroke({ width: 6, color: 0xf5e2c2, cap: 'round' });
    g.circle(f.x, f.y - 122, 5).fill(0xf8c56d);
    const wave = Math.sin(this.t * 5.5) * 6;
    const wave2 = Math.sin(this.t * 5.5 + 1.2) * 4;
    g.moveTo(f.x + 3, f.y - 118).quadraticCurveTo(f.x + 40, f.y - 112 + wave, f.x + 80, f.y - 104 + wave2).quadraticCurveTo(f.x + 60, f.y - 90, f.x + 80, f.y - 70 + wave2).quadraticCurveTo(f.x + 40, f.y - 64 + wave, f.x + 3, f.y - 70).closePath().fill(hex(this.pal.flag)).stroke({ width: 2.5, color: 0x8a1f1a, join: 'round' });
    // 旗上的圆：金色，像一枚印
    g.circle(f.x + 40, f.y - 92 + wave * 0.5, 13).fill(0xf8c56d).stroke({ width: 2, color: 0x8a1f1a });
    g.circle(f.x + 40, f.y - 92 + wave * 0.5, 6).fill(0xe8413c);
  }
}
