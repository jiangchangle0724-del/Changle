/**
 * 主机画面（A3）：Pixi 8。
 * 屏幕空间：背景（天空和三层视差剪影）→ 背景粒子（蒸汽、雨）→ 世界 → 暗角和闪白。
 * 世界空间（跟镜头）：深渊的汤 → 关卡 → 物件 → 绳子 → 拖尾 → 糯米团 → 粒子 → 汤面（人掉进去就被盖住）。
 * 镜头：跟着活着的人的中心走，把所有人框进来就缩，到关卡边缘就停；摔死时抖一下、慢 0.3 秒。
 * 所有动效读 docs/hang-on.md 的「动效清单」，减弱动效模式下不抖不闪不拉伸。
 */
import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import { CFG } from '../physics/config';
import type { Level, Pt } from '../physics/level';
import type { Sim, SimEvent } from '../physics/world';
import { DEFAULT_LOOK, type Look } from '../look';
import { CONFETTI, hex, OUTLINE, PALETTES, textures, type Palette, type Textures, type WorldId } from './art';
import { Backdrop } from './backdrop';
import { Dumpling } from './dumpling';
import { Particles } from './fx';
import { Terrain } from './terrain';

export interface Camera {
  x: number;
  y: number;
  z: number;
  shake: number;
}

export interface PlayerStyle {
  name: string;
  color: string;
  look: Look;
}

interface Trail {
  pts: { x: number; y: number; a: number }[];
}

const STAR_COLORS = [0xfff6e9, 0xffd166, 0xffffff];

export class Stage {
  readonly cam: Camera = { x: 300, y: 500, z: 1, shake: 0 };
  /** 主机按它缩放物理时间：摔死后慢 0.3 秒。 */
  timeScale = 1;
  readonly reduced: boolean;

  private readonly app: Application;
  private readonly tex: Textures;
  private readonly root = new Container();
  private readonly screenFx: Particles;
  private readonly world = new Container();
  private readonly abyssBody = new Graphics();
  private readonly abyssTop = new Graphics();
  private readonly propsG = new Graphics();
  private readonly ropesG = new Graphics();
  private readonly trailsG = new Graphics();
  private readonly playersC = new Container();
  private readonly fx: Particles;
  private readonly vignette = new Graphics();
  private readonly flash = new Graphics();

  private backdrop: Backdrop | null = null;
  private terrain: Terrain | null = null;
  private world_: WorldId = 'table';
  private pal: Palette = PALETTES.table;
  private dumplings: Dumpling[] = [];
  private styles: PlayerStyle[] = [];
  private trails: Trail[] = [];
  private slow = 0;
  private flashA = 0;
  private vignetteGrad: FillGradient | null = null;
  private abyssGrad: FillGradient | null = null;
  private t = 0;
  private bubbleT = 0;
  private W = 1;
  private H = 1;

  private constructor(app: Application, reduced: boolean) {
    this.app = app;
    this.reduced = reduced;
    this.tex = textures();
    this.screenFx = new Particles(this.tex.particles);
    this.fx = new Particles(this.tex.particles);
    if (reduced) {
      this.fx.cap = 150;
      this.screenFx.cap = 60;
    }
    this.world.addChild(this.abyssBody, this.propsG, this.ropesG, this.trailsG, this.playersC, this.fx.view, this.abyssTop);
    this.root.addChild(this.screenFx.view, this.world, this.vignette, this.flash);
    app.stage.addChild(this.root);
  }

  /** 建画面：Pixi 要异步初始化。 */
  static async create(canvas: HTMLCanvasElement): Promise<Stage> {
    const opts = {
      canvas,
      width: innerWidth,
      height: innerHeight,
      antialias: true,
      resolution: Math.min(2, devicePixelRatio || 1),
      autoDensity: true,
      backgroundAlpha: 1,
      background: '#1d2a4a',
      powerPreference: 'high-performance' as const,
    };
    let app = new Application();
    try {
      await app.init({ ...opts, preference: 'webgl' });
    } catch (e) {
      // 没有 WebGL（很老的机器、某些无头浏览器）：退到 canvas 画，慢一点但能看
      console.warn('[hang-on] WebGL 不可用，改用 canvas 渲染', e);
      app = new Application();
      await app.init({ ...opts, preference: 'canvas' });
    }
    app.ticker.stop();
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stage = new Stage(app, reduced);
    stage.resize();
    return stage;
  }

  /** 画布永远铺满窗口（页面的 CSS 也这么写）。 */
  resize(): void {
    const W = innerWidth;
    const H = innerHeight;
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    this.app.renderer.resize(W, H);
    this.backdrop?.resize(W, H);
    const v = this.vignette.clear();
    const grad = (this.vignetteGrad ??= new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.78,
      colorStops: [
        { offset: 0, color: 'rgba(0,0,0,0)' },
        { offset: 0.6, color: 'rgba(0,0,0,0)' },
        { offset: 1, color: 'rgba(0,0,0,0.42)' },
      ],
    }));
    v.rect(0, 0, W, H).fill(grad);
    this.flash.clear().rect(0, 0, W, H).fill(0xffffff);
    this.flash.alpha = 0;
  }

  // ---------------------------------------------------------------- 关卡和人

  /** 换关：重建背景、关卡画面、深渊。 */
  setLevel(level: Level): void {
    this.world_ = level.world === 'van' ? 'van' : 'table';
    this.pal = PALETTES[this.world_];
    this.backdrop?.destroy();
    this.terrain?.view.destroy({ children: true });
    this.backdrop = new Backdrop(this.world_, this.pal, this.screenFx);
    this.backdrop.rain = this.world_ === 'van' && (level.teaches === 'ice' || level.rects.some((r) => r.material === 'ice'));
    this.backdrop.resize(this.W, this.H);
    this.root.addChildAt(this.backdrop.view, 0);
    this.terrain = new Terrain(level, this.world_, this.pal);
    this.world.addChildAt(this.terrain.view, 1);
    const a = this.abyssBody.clear();
    this.abyssGrad?.destroy();
    this.abyssGrad = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: this.pal.abyssTop }, { offset: 1, color: this.pal.abyssBottom }] });
    a.rect(-3000, level.deathY - 8, level.w + 6000, 1400).fill(this.abyssGrad);
    this.cam.x = level.spawn.x;
    this.cam.y = level.spawn.y - 60;
    this.screenFx.clear();
    this.fx.clear();
  }

  /** 玩家数量跟着 sim 走；样子（名字、颜色、帽子）另外给。 */
  syncPlayers(sim: Sim): void {
    while (this.dumplings.length < sim.players.length) {
      const i = this.dumplings.length;
      const st = this.styles[i] ?? { name: `P${i + 1}`, color: sim.players[i]?.color ?? '#fff', look: DEFAULT_LOOK };
      const d = new Dumpling(st.name, st.color, st.look, this.reduced);
      this.playersC.addChild(d.view);
      this.dumplings.push(d);
      this.trails.push({ pts: [] });
    }
    while (this.dumplings.length > sim.players.length) {
      const d = this.dumplings.pop();
      d?.view.destroy({ children: true });
      this.trails.pop();
    }
  }

  setPlayerStyle(i: number, st: PlayerStyle): void {
    this.styles[i] = st;
    const d = this.dumplings[i];
    if (!d) return;
    d.setName(st.name);
    d.setColor(st.color);
    d.setLook(st.look);
  }

  reset(): void {
    for (const t of this.trails) t.pts.length = 0;
    this.fx.clear();
    this.slow = 0;
    this.timeScale = 1;
    this.cam.shake = 0;
  }

  // ---------------------------------------------------------------- 事件 → 动效

  handleEvents(sim: Sim, events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'grab': {
          const p = sim.players[ev.player];
          this.dumplings[ev.player]?.onGrab({ x: ev.x, y: ev.y }, p?.body ?? { x: ev.x, y: ev.y });
          this.fx.burst({ x: ev.x, y: ev.y, n: 5, texture: 'star', colors: STAR_COLORS, speed: [90, 220], life: [0.3, 0.5], size: [7, 12], gravity: 500, spin: 10, grow: 0.3 });
          this.fx.burst({ x: ev.x, y: ev.y, n: 1, texture: 'ring', colors: [0xffffff], speed: [0, 0], life: [0.22, 0.22], size: [18, 18], grow: 3.2, alpha: 0.8 });
          break;
        }
        case 'release':
          this.fx.burst({ x: ev.x, y: ev.y, n: 3, texture: 'circle', colors: [0xfff6e9], speed: [30, 80], life: [0.2, 0.35], size: [4, 7], grow: 0.4, alpha: 0.7 });
          break;
        case 'land': {
          const p = sim.players[ev.player];
          this.dumplings[ev.player]?.onLand(ev.speed);
          if (p) {
            const n = Math.min(10, Math.round(ev.speed / 120));
            this.fx.burst({ x: p.body.x, y: p.body.y + CFG.bodyR, n, texture: 'puff', colors: [0xffffff], speed: [40, 140], angle: -Math.PI / 2, spread: 1.3, life: [0.3, 0.5], size: [14, 26], grow: 2, alpha: 0.35, drag: 2 });
          }
          if (ev.speed > 800 && !this.reduced) this.cam.shake = Math.max(this.cam.shake, 3);
          break;
        }
        case 'death': {
          this.cam.shake = this.reduced ? 0 : 12;
          this.slow = 0.55;
          this.flashA = this.reduced ? 0 : 0.28;
          this.splash(ev.x, sim.level.deathY);
          sim.players.forEach((q, i) => {
            if (i !== ev.player && !q.dead) this.dumplings[i]?.onMateDied();
          });
          break;
        }
        case 'respawn': {
          const d = this.dumplings[ev.player];
          const p = sim.players[ev.player];
          if (ev.summoned && p) {
            this.fx.burst({ x: p.body.x, y: p.body.y, n: 12, texture: 'circle', colors: [0xfff6e9, hex(p.color)], speed: [80, 260], life: [0.3, 0.6], size: [5, 10], grow: 0.2, drag: 3 });
          } else d?.onRespawn();
          break;
        }
        case 'checkpoint': {
          const cp = sim.level.checkpoints?.[ev.index];
          if (cp) this.fx.burst({ x: cp.x, y: cp.y - 10, n: 14, texture: 'star', colors: [hex(this.pal.lampOn), 0xffffff], speed: [60, 200], life: [0.5, 0.9], size: [6, 12], gravity: 300, spin: 8, grow: 0.3 });
          break;
        }
        case 'bounce': {
          const s = sim.springs[ev.spring];
          this.dumplings[ev.player]?.onBounce();
          if (s) this.fx.burst({ x: s.x + s.w / 2, y: s.y, n: 8, texture: 'circle', colors: [0xffb347, 0xfff1a8], speed: [80, 220], angle: -Math.PI / 2, spread: 0.9, life: [0.25, 0.5], size: [4, 9], gravity: 600, grow: 0.3 });
          break;
        }
        case 'fade': {
          const f = sim.fadings[ev.index];
          if (f && !ev.on) {
            this.fx.burst({ x: f.x + f.w / 2, y: f.y + f.h / 2, n: Math.min(36, Math.round(f.w / 5)), texture: 'square', colors: [0xe2b06a, 0xa56f2e, 0xfff6e9], speed: [60, 220], life: [0.6, 1.1], size: [7, 14], gravity: 800, spin: 9, jitter: f.w / 12 });
          }
          break;
        }
        case 'win': {
          const flag = sim.level.flag ?? { x: sim.level.goal.x + sim.level.goal.w / 2, y: sim.level.goal.y + sim.level.goal.h };
          this.confetti(flag.x + 30, flag.y - 90);
          break;
        }
        default:
          break;
      }
    }
  }

  private splash(x: number, y: number): void {
    const table = this.world_ === 'table';
    const colors = table ? [0xe8584a, 0xff8a5b, 0xffd166] : [0x9fd3e8, 0xffffff, 0x6aa6d6];
    this.fx.burst({ x, y: y - 4, n: 22, texture: 'drop', colors, speed: [200, 520], angle: -Math.PI / 2, spread: 0.9, life: [0.5, 0.9], size: [8, 16], gravity: 1400, spin: 6 });
    this.fx.burst({ x, y: y - 4, n: 10, texture: 'circle', colors, speed: [100, 300], angle: -Math.PI / 2, spread: 1.2, life: [0.3, 0.6], size: [5, 12], gravity: 1200 });
    this.fx.burst({ x, y: y - 10, n: 4, texture: 'puff', colors: [0xffffff], speed: [30, 80], angle: -Math.PI / 2, spread: 0.6, life: [0.8, 1.4], size: [40, 80], grow: 2.2, alpha: 0.35, drag: 1 });
  }

  private confetti(x: number, y: number): void {
    const colors = CONFETTI.map(hex);
    this.fx.burst({ x, y, n: this.reduced ? 30 : 90, texture: 'square', colors, speed: [250, 700], angle: -Math.PI / 2, spread: 1.1, life: [1.4, 2.6], size: [6, 11], gravity: 500, spin: 14, drag: 1.2 });
    this.fx.burst({ x, y, n: this.reduced ? 10 : 30, texture: 'star', colors: STAR_COLORS, speed: [200, 500], angle: -Math.PI / 2, spread: 1.2, life: [1, 2], size: [8, 14], gravity: 400, spin: 10 });
  }

  // ---------------------------------------------------------------- 镜头

  updateCamera(sim: Sim, dt: number): void {
    const cam = this.cam;
    const level = sim.level;
    const alive = sim.players.filter((p) => !p.dead);
    const ps = alive.length ? alive : sim.players;
    let tx = level.spawn.x;
    let ty = level.spawn.y - 60;
    let bw = 0;
    let bh = 0;
    if (ps.length) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of ps) {
        x0 = Math.min(x0, p.body.x);
        x1 = Math.max(x1, p.body.x);
        y0 = Math.min(y0, p.body.y);
        y1 = Math.max(y1, p.body.y);
      }
      tx = (x0 + x1) / 2;
      ty = (y0 + y1) / 2 - 50;
      bw = x1 - x0;
      bh = y1 - y0;
    }
    const W = this.W;
    const H = this.H;
    // 缩放：基础按屏幕大小，人分散了再缩到都能看见
    const base = Math.max(0.6, Math.min(1.25, Math.min(W / 1000, H / 640)));
    const fit = Math.min(W / (bw + 420), H / (bh + 360));
    const zt = Math.max(0.45, Math.min(base, fit));
    cam.z += (zt - cam.z) * Math.min(1, dt * 2.5);
    const halfW = W / 2 / cam.z;
    const halfH = H / 2 / cam.z;
    // 关卡比画面窄就居中，不然到边停
    const cx = level.w <= halfW * 2 ? level.w / 2 : Math.max(halfW - 60, Math.min(level.w - halfW + 60, tx));
    const cy = level.h <= halfH * 2 ? level.h / 2 : Math.max(halfH - 40, Math.min(level.h - halfH + 80, ty));
    cam.x += (cx - cam.x) * Math.min(1, dt * 5);
    cam.y += (cy - cam.y) * Math.min(1, dt * 5);
    cam.shake = Math.max(0, cam.shake - dt * 30);
  }

  /** 世界坐标 → 屏幕坐标（鼠标指向用）。 */
  toScreen(p: Pt): Pt {
    const { cam } = this;
    return { x: (p.x - cam.x) * cam.z + this.W / 2, y: (p.y - cam.y) * cam.z + this.H / 2 };
  }

  // ---------------------------------------------------------------- 每帧

  draw(sim: Sim, dt: number): void {
    this.t += dt;
    // 慢动作：摔死后 0.3 秒 0.25 倍，再 0.25 秒回到 1
    if (this.slow > 0) {
      this.slow = Math.max(0, this.slow - dt);
      this.timeScale = this.slow > 0.25 ? 0.25 : 0.25 + 0.75 * (1 - this.slow / 0.25);
    } else this.timeScale = 1;
    this.flashA = Math.max(0, this.flashA - dt * 1.6);
    this.flash.alpha = this.flashA;

    const { cam } = this;
    const sx = (Math.random() - 0.5) * cam.shake;
    const sy = (Math.random() - 0.5) * cam.shake;
    this.world.position.set(this.W / 2 + sx, this.H / 2 + sy);
    this.world.scale.set(cam.z);
    this.world.pivot.set(cam.x, cam.y);

    const level = sim.level;
    this.backdrop?.update(cam.x, cam.y, cam.z, level.h, dt);
    this.terrain?.update(sim, dt);
    this.drawProps(sim);
    this.drawRopes(sim);
    this.drawTrails(sim);
    this.syncPlayers(sim);
    sim.players.forEach((p, i) => this.dumplings[i]?.update(p, dt, sim.won, this.t));
    this.drawAbyss(sim, dt);
    this.fx.update(dt);
    this.screenFx.update(dt);
    this.app.renderer.render(this.app.stage);
  }

  private drawProps(sim: Sim): void {
    const g = this.propsG.clear();
    const table = this.world_ === 'table';
    for (const prop of sim.props) {
      const w = prop.w;
      const h = prop.h;
      // 本地坐标：先画到原点，再用 Graphics 的变换太贵；直接算四个角
      const c = Math.cos(prop.angle);
      const s = Math.sin(prop.angle);
      const corner = (lx: number, ly: number): [number, number] => [prop.x + lx * c - ly * s, prop.y + lx * s + ly * c];
      const pts = [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)].flat();
      if (prop.kind === 'seesaw') {
        g.poly(pts).fill({ texture: table ? this.tex.wood : this.tex.metal, textureSpace: 'global' });
        g.poly(pts).stroke({ width: 3, color: table ? 0x8a5a2b : 0x5a6676, join: 'round' });
        const [tx0, ty0] = corner(-w / 2 + 4, -h / 2 + 1);
        const [tx1, ty1] = corner(w / 2 - 4, -h / 2 + 1);
        g.moveTo(tx0, ty0).lineTo(tx1, ty1).stroke({ width: 3, color: 0xffffff, alpha: 0.35 });
        // 转轴：一只小碗 / 一个浮筒
        if (table) {
          g.moveTo(prop.x - 26, prop.y + 2).quadraticCurveTo(prop.x, prop.y + 40, prop.x + 26, prop.y + 2).closePath().fill(0xf3ecdd).stroke({ width: 2.5, color: 0x8a5a2b });
          g.moveTo(prop.x - 20, prop.y + 12).lineTo(prop.x + 20, prop.y + 12).stroke({ width: 2, color: 0x3b5ba5, alpha: 0.7 });
        } else {
          g.ellipse(prop.x, prop.y + 16, 30, 16).fill(0xe8413c).stroke({ width: 2.5, color: 0x5a6676 });
          g.ellipse(prop.x, prop.y + 11, 30, 6).fill({ color: 0xffffff, alpha: 0.35 });
        }
        g.circle(prop.x, prop.y, 6).fill(0x3a2a2a);
        g.circle(prop.x - 1.5, prop.y - 1.5, 2).fill({ color: 0xffffff, alpha: 0.4 });
      } else {
        // 箱子：年夜饭桌上是蒸笼，温哥华是货箱
        g.poly(pts).fill({ texture: table ? this.tex.wood : this.tex.metal, textureSpace: 'global' });
        if (table) {
          for (const f of [0.3, 0.7]) {
            const [ax, ay] = corner(-w / 2, -h / 2 + h * f);
            const [bx, by] = corner(w / 2, -h / 2 + h * f);
            g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 3, color: 0x8a5a2b, alpha: 0.6 });
          }
          const lid = [corner(-w / 2 - 4, -h / 2 - 6), corner(w / 2 + 4, -h / 2 - 6), corner(w / 2 + 4, -h / 2 + 4), corner(-w / 2 - 4, -h / 2 + 4)].flat();
          g.poly(lid).fill(0xd9a66a).stroke({ width: 2.5, color: 0x8a5a2b, join: 'round' });
        } else {
          const [ax, ay] = corner(-w / 2, -h / 2);
          const [bx, by] = corner(w / 2, h / 2);
          const [cx, cy] = corner(w / 2, -h / 2);
          const [dx, dy] = corner(-w / 2, h / 2);
          g.moveTo(ax, ay).lineTo(bx, by).moveTo(cx, cy).lineTo(dx, dy).stroke({ width: 4, color: 0x5a6676, alpha: 0.7 });
        }
        g.poly(pts).stroke({ width: 3, color: table ? 0x8a5a2b : 0x5a6676, join: 'round' });
      }
    }
  }

  private drawRopes(sim: Sim): void {
    const g = this.ropesG.clear();
    const table = this.world_ === 'table';
    for (const rope of sim.ropes) {
      const pts = rope.pts;
      if (pts.length < 2) continue;
      const path = (): void => {
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i] as Pt;
          const b = pts[i + 1] as Pt;
          g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        const l = pts[pts.length - 1] as Pt;
        g.lineTo(l.x, l.y);
      };
      if (table) {
        // 面条
        path();
        g.stroke({ width: 10, color: 0xc9a860, cap: 'round', join: 'round' });
        path();
        g.stroke({ width: 6.5, color: 0xf3dc9a, cap: 'round', join: 'round' });
        path();
        g.stroke({ width: 2, color: 0xffffff, alpha: 0.35, cap: 'round', join: 'round' });
        // 锚：筷子头夹着；绳尾：一颗丸子
        g.roundRect(rope.anchor.x - 12, rope.anchor.y - 8, 24, 12, 5).fill(0xc98a4b).stroke({ width: 2, color: 0x8a5a2b });
        g.circle(rope.handle.x, rope.handle.y, 13).fill(0x9a6a46).stroke({ width: 2.5, color: OUTLINE });
        g.circle(rope.handle.x - 4, rope.handle.y - 4, 4).fill({ color: 0xffffff, alpha: 0.35 });
      } else {
        path();
        g.stroke({ width: 8, color: 0x6b4a2b, cap: 'round', join: 'round' });
        path();
        g.stroke({ width: 4, color: 0xa87a4b, cap: 'round', join: 'round' });
        g.circle(rope.anchor.x, rope.anchor.y, 8).fill(0x5a6676).stroke({ width: 2, color: OUTLINE });
        g.circle(rope.handle.x, rope.handle.y, 12).fill(0xe8413c).stroke({ width: 2.5, color: OUTLINE });
        g.circle(rope.handle.x, rope.handle.y, 5).fill(0xfff6e9);
      }
    }
  }

  private drawTrails(sim: Sim): void {
    const g = this.trailsG.clear();
    if (this.reduced) return;
    sim.players.forEach((p, i) => {
      const t = this.trails[i];
      if (!t) return;
      const b = p.body;
      const v = Math.hypot(b.vx, b.vy);
      if (p.dead) {
        t.pts.length = 0;
        return;
      }
      t.pts.push({ x: b.x, y: b.y, a: Math.min(1, Math.max(0, (v - 500) / 900)) });
      if (t.pts.length > 12) t.pts.shift();
      const col = hex(p.color);
      for (let k = 1; k < t.pts.length; k++) {
        const q = t.pts[k] as { x: number; y: number; a: number };
        const q0 = t.pts[k - 1] as { x: number; y: number; a: number };
        if (q.a < 0.05) continue;
        const f = k / t.pts.length;
        g.moveTo(q0.x, q0.y).lineTo(q.x, q.y).stroke({ width: 4 + 24 * f * q.a, color: col, alpha: 0.3 * f * q.a, cap: 'round' });
      }
    });
  }

  /** 汤面 / 水面：一条会动的波浪，盖在人前面；表面冒泡、冒蒸汽。 */
  private drawAbyss(sim: Sim, dt: number): void {
    const level = sim.level;
    const g = this.abyssTop.clear();
    const y = level.deathY - 8;
    const table = this.world_ === 'table';
    const halfW = this.W / 2 / this.cam.z;
    const x0 = Math.floor((this.cam.x - halfW - 80) / 40) * 40;
    const x1 = this.cam.x + halfW + 80;
    if (this.cam.y + this.H / 2 / this.cam.z < y - 60) return;
    g.moveTo(x0, y + 400);
    g.lineTo(x0, y);
    for (let x = x0; x <= x1; x += 40) g.lineTo(x, y + Math.sin(x / 90 + this.t * 2.2) * 5 + Math.sin(x / 37 - this.t * 3.1) * 3);
    g.lineTo(x1, y + 400);
    g.closePath();
    g.fill({ color: hex(this.pal.abyssTop), alpha: 0.93 });
    g.moveTo(x0, y);
    for (let x = x0; x <= x1; x += 40) g.lineTo(x, y + Math.sin(x / 90 + this.t * 2.2) * 5 + Math.sin(x / 37 - this.t * 3.1) * 3);
    g.stroke({ width: 4, color: hex(this.pal.abyssLine), alpha: 0.55 });
    // 浮着的东西：辣椒圈和葱花 / 浪花
    for (let x = x0 + 20; x <= x1; x += 110) {
      const bob = Math.sin(x / 60 + this.t * 1.8) * 4;
      if (table) {
        g.ellipse(x, y + 14 + bob, 11, 6).fill(0xd8321f).stroke({ width: 1.5, color: 0x7a1a0f });
        g.ellipse(x, y + 14 + bob, 5, 2.5).fill(0xffb36b);
        g.circle(x + 50, y + 18 - bob, 5).fill(0x9bcf83).stroke({ width: 1.2, color: 0x4b7a3a });
      } else {
        g.moveTo(x - 16, y + 12 + bob).quadraticCurveTo(x, y + 6 + bob, x + 16, y + 12 + bob).stroke({ width: 2.5, color: 0xffffff, alpha: 0.45, cap: 'round' });
      }
    }
    // 冒泡和蒸汽
    this.bubbleT += dt;
    const every = table ? 0.12 : 0.24;
    while (this.bubbleT >= every) {
      this.bubbleT -= every;
      const bx = this.cam.x - halfW + Math.random() * halfW * 2;
      if (table) {
        this.fx.burst({ x: bx, y: y + 10, n: 1, texture: 'dot', colors: [0xffd9a0], speed: [20, 50], angle: -Math.PI / 2, spread: 0.3, life: [0.4, 0.8], size: [6, 12], grow: 1.6, alpha: 0.7 });
        if (Math.random() < 0.4) this.fx.burst({ x: bx, y: y - 10, n: 1, texture: 'puff', colors: [0xffffff], speed: [20, 45], angle: -Math.PI / 2, spread: 0.4, life: [2, 3.2], size: [50, 100], grow: 2, alpha: 0.12, drag: 0.2 });
      } else {
        this.fx.burst({ x: bx, y: y + 6, n: 1, texture: 'dot', colors: [0xffffff], speed: [0, 10], life: [0.6, 1.2], size: [3, 6], grow: 0.2, alpha: 0.6 });
      }
    }
  }

  /** 画面里有多少粒子（帧时间脚本看）。 */
  get particleCount(): number {
    return this.fx.count + this.screenFx.count;
  }

  destroy(): void {
    this.app.destroy(false, { children: true });
  }
}

