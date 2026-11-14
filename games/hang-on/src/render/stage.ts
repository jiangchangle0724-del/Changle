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
import type { SimEvent } from '../physics/world';
import { moverAt } from '../physics/motion';
import type { SimView } from './view';
import { DEFAULT_LOOK, type Look } from '../look';
import { CONFETTI, hex, OUTLINE, PALETTES, textures, type Palette, type Textures, type WorldId } from './art';
import { Backdrop } from './backdrop';
import { Depth } from './depth';
import { Dumpling } from './dumpling';
import { Foreground } from './fore';
import { FrameWatch } from './framewatch';
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
  /** 落在台子上的影子（A8）。 */
  private readonly shadowsG = new Graphics();
  private readonly ropesG = new Graphics();
  private readonly trailsG = new Graphics();
  private readonly playersC = new Container();
  private readonly fx: Particles;
  private readonly vignette = new Graphics();
  private readonly flash = new Graphics();

  private backdrop: Backdrop | null = null;
  /** 近景虚化（A8）：手机上没有。 */
  private fore: Foreground | null = null;
  /**
   * 画多细（A8）：2 全画；1 没有近景光斑和斜光（手机局、小触屏投屏当电视从这一级开始）；
   * 0 台子也不画侧面。一直掉帧（FrameWatch）就降一级，这一局不再升回去。
   */
  private detail: 0 | 1 | 2;
  private readonly watch = new FrameWatch();
  private depth: Depth | null = null;
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
  /** 开局镜头从终点扫回起点（A8）：还剩几秒、一共几秒。 */
  private introT = 0;
  private introDur = 0;
  private bubbleT = 0;
  private W = 1;
  private H = 1;

  private constructor(
    app: Application,
    reduced: boolean,
    private readonly plates: Partial<Record<WorldId, string>>,
    /** 手机屏幕：镜头拉近一点，糯米团别小得看不清。 */
    private readonly compact: boolean,
    smallTouch: boolean,
  ) {
    this.app = app;
    this.detail = compact || smallTouch ? 1 : 2;
    this.reduced = reduced;
    this.tex = textures();
    this.screenFx = new Particles(this.tex.particles);
    this.fx = new Particles(this.tex.particles);
    if (reduced) {
      this.fx.cap = 150;
      this.screenFx.cap = 60;
    }
    this.world.addChild(this.abyssBody, this.propsG, this.shadowsG, this.ropesG, this.trailsG, this.playersC, this.fx.view, this.abyssTop);
    this.root.addChild(this.screenFx.view, this.world, this.vignette, this.flash);
    app.stage.addChild(this.root);
  }

  /**
   * 建画面：Pixi 要异步初始化。plates：每个世界的远景画地址（主机页和开发页给 `src/render/plates.ts` 的）；
   * compact：画在手机上（手机局），镜头近一些。
   */
  static async create(canvas: HTMLCanvasElement, opts: { plates?: Partial<Record<WorldId, string>>; compact?: boolean } = {}): Promise<Stage> {
    const init = {
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
      await app.init({ ...init, preference: 'webgl' });
    } catch (e) {
      // 没有 WebGL（很老的机器、某些无头浏览器）：退到 canvas 画，慢一点但能看
      console.warn('[hang-on] WebGL 不可用，改用 canvas 渲染', e);
      app = new Application();
      await app.init({ ...init, preference: 'canvas' });
    }
    app.ticker.stop();
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const smallTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
    const stage = new Stage(app, reduced, opts.plates ?? {}, !!opts.compact, smallTouch);
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
    this.fore?.resize(W, H);
    const v = this.vignette.clear();
    // 暗角只压四边。Pixi 画放射渐变时先拿最后一个颜色铺满整张图，所以最后一个必须透明：
    // 原来最后是 0.42 的黑，整个画面（连中间）都蒙了一层，亮度只剩六成（A8 查出来的）。
    // 现在 0.982 是四个角（离中心 0.707），1 再回到透明；中间到四边的样子和原来想要的一样。
    const grad = (this.vignetteGrad ??= new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.72,
      colorStops: [
        { offset: 0, color: 'rgba(0,0,0,0)' },
        { offset: 0.65, color: 'rgba(0,0,0,0)' },
        { offset: 0.982, color: 'rgba(0,0,0,0.32)' },
        { offset: 1, color: 'rgba(0,0,0,0)' },
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
    this.depth?.view.destroy({ children: true });
    this.terrain?.view.destroy({ children: true });
    this.backdrop = new Backdrop(this.world_, this.pal, this.screenFx, this.plates[this.world_]);
    this.backdrop.rain = this.world_ === 'van' && (level.teaches === 'ice' || level.rects.some((r) => r.material === 'ice'));
    this.backdrop.resize(this.W, this.H);
    this.backdrop.light = this.detail === 2;
    this.root.addChildAt(this.backdrop.view, 0);
    this.fore?.destroy();
    this.fore = null;
    this.watch.reset();
    if (this.detail === 2) {
      this.fore = new Foreground(this.world_, this.reduced);
      this.fore.resize(this.W, this.H);
      this.root.addChildAt(this.fore.view, this.root.getChildIndex(this.world) + 1);
    }
    // 2.5D：台子后面露出来的侧面画在正面下面（A8）
    this.depth = new Depth(level, this.world_);
    this.depth.view.visible = this.detail > 0;
    this.world.addChildAt(this.depth.view, 1);
    this.terrain = new Terrain(level, this.world_, this.pal, this.reduced);
    this.world.addChildAt(this.terrain.view, 2);
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
  syncPlayers(sim: SimView): void {
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

  /**
   * 开局倒数时镜头从终点扫回起点（A8）：先看到终点在哪，拉远一点，再落到大家身上。
   * 坐不住的场地一屏就看全了，减弱动效时不扫。
   */
  intro(seconds = 2.6): void {
    if (this.reduced) return;
    this.introDur = seconds;
    this.introT = seconds;
  }

  reset(): void {
    for (const t of this.trails) t.pts.length = 0;
    this.fx.clear();
    this.slow = 0;
    this.timeScale = 1;
    this.cam.shake = 0;
  }

  // ---------------------------------------------------------------- 事件 → 动效

  handleEvents(sim: SimView, events: readonly SimEvent[]): void {
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
          // 碰到机关死的在出事的地方炸开；掉下去的在深渊面上溅起来
          if (ev.cause) this.hazardBurst(ev.cause, ev.x, ev.y);
          else this.splash(ev.x, sim.level.deathY);
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
        case 'item': {
          const p = sim.players[ev.player];
          const at = ev.item === 'noodle' ? { x: ev.x, y: ev.y } : (p?.body ?? { x: ev.x, y: ev.y });
          if (!ev.ok) {
            // 没用成（拉面没抓着墙）：冒一小团灰烟
            this.fx.burst({ x: at.x, y: at.y - CFG.bodyR, n: 4, texture: 'puff', colors: [0xb8b0c8], speed: [20, 60], angle: -Math.PI / 2, spread: 1, life: [0.3, 0.5], size: [10, 16], grow: 1.6, alpha: 0.5, drag: 2 });
            break;
          }
          if (ev.item === 'freeze') {
            this.fx.burst({ x: at.x, y: at.y, n: 14, texture: 'star', colors: [0xffffff, 0xbfe8ff, 0x8ec5e8], speed: [80, 240], life: [0.35, 0.7], size: [6, 12], drag: 3, spin: 8, grow: 0.3 });
            this.fx.burst({ x: at.x, y: at.y, n: 1, texture: 'ring', colors: [0xbfe8ff], speed: [0, 0], life: [0.3, 0.3], size: [30, 30], grow: 2.6, alpha: 0.9 });
          } else if (ev.item === 'leaf') {
            this.fx.burst({ x: at.x, y: at.y - CFG.bodyR - 20, n: 10, texture: 'circle', colors: [0x6dbb5a, 0xa8e08f, 0xffffff], speed: [60, 180], angle: -Math.PI / 2, spread: 1.6, life: [0.3, 0.6], size: [5, 9], drag: 3, grow: 0.3 });
          } else {
            // 拉面：锚点冒一团热气
            this.fx.burst({ x: at.x, y: at.y, n: 6, texture: 'puff', colors: [0xffffff], speed: [30, 90], angle: -Math.PI / 2, spread: 0.8, life: [0.5, 0.9], size: [12, 20], grow: 2, alpha: 0.45, drag: 2 });
          }
          break;
        }
        case 'itemEnd': {
          if (ev.item === 'freeze') {
            // 化开：冰碴往外崩
            this.fx.burst({ x: ev.x, y: ev.y, n: 12, texture: 'square', colors: [0xffffff, 0xbfe8ff, 0x8ec5e8], speed: [120, 300], life: [0.4, 0.8], size: [5, 10], gravity: 900, spin: 12, flip: this.reduced ? 0 : 9 });
          } else if (ev.item === 'noodle') {
            this.fx.burst({ x: ev.x, y: ev.y, n: 8, texture: 'circle', colors: [0xf3d79a, 0xfff6dc], speed: [60, 200], life: [0.3, 0.6], size: [4, 8], gravity: 700, grow: 0.4 });
          } else {
            this.fx.burst({ x: ev.x, y: ev.y - CFG.bodyR - 24, n: 6, texture: 'circle', colors: [0x6dbb5a, 0xa8e08f], speed: [40, 120], life: [0.3, 0.6], size: [5, 9], gravity: 300, grow: 0.3 });
          }
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
            this.fx.burst({ x: f.x + f.w / 2, y: f.y + f.h / 2, n: Math.min(36, Math.round(f.w / 5)), texture: 'square', colors: [0xe2b06a, 0xa56f2e, 0xfff6e9], speed: [60, 220], life: [0.6, 1.1], size: [7, 14], gravity: 800, spin: 9, jitter: f.w / 12, flip: this.reduced ? 0 : 8 });
          }
          break;
        }
        case 'win': {
          // 场地没有旗子：纸屑撒在赢的人头上
          const w = ev.who?.[0];
          const winner = w !== undefined ? sim.players[w] : undefined;
          if (sim.level.arena) {
            if (winner) this.confetti(winner.body.x, winner.body.y - 60);
            break;
          }
          const flag = sim.level.flag ?? { x: sim.level.goal.x + sim.level.goal.w / 2, y: sim.level.goal.y + sim.level.goal.h };
          this.confetti(flag.x + 30, flag.y - 90);
          break;
        }
        case 'finish': {
          // 比谁先：到了终点的人头上冒一把星星
          const p = sim.players[ev.player];
          if (p) this.fx.burst({ x: p.body.x, y: p.body.y - 30, n: this.reduced ? 8 : 24, texture: 'star', colors: [0xffd166, 0xffffff, hex(p.color)], speed: [120, 360], angle: -Math.PI / 2, spread: 1.1, life: [0.6, 1.2], size: [7, 13], gravity: 400, spin: 10 });
          break;
        }
        case 'crumble': {
          // 定时的东西塌了：碎块往下掉，镜头轻轻一抖
          const n = Math.min(40, Math.max(10, Math.round(ev.w / 8)));
          const colors = this.world_ === 'table' ? [0xe8d5b0, 0xb08050, 0xfff6e9] : [0x9aa8c0, 0x5f6b85, 0xd8dde8];
          this.fx.burst({ x: ev.x + ev.w / 2, y: ev.y + ev.h / 2, n, texture: 'square', colors, speed: [60, 240], life: [0.6, 1.2], size: [6, 14], gravity: 900, spin: 9, jitter: ev.w / 3, flip: this.reduced ? 0 : 8 });
          if (!this.reduced) this.cam.shake = Math.max(this.cam.shake, 4);
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

  /** 碰到机关的死法：电是一团火花，烫是一股白气加几滴红油，扎是一圈白点。 */
  private hazardBurst(cause: 'spike' | 'hot' | 'zap', x: number, y: number): void {
    const van = this.world_ === 'van';
    if (cause === 'zap') {
      this.fx.burst({ x, y, n: this.reduced ? 8 : 26, texture: 'star', colors: van ? [0xbff0ff, 0x7fd8ff, 0xffffff] : [0xffd27a, 0xff7a2f, 0xffffff], speed: [200, 620], life: [0.25, 0.6], size: [6, 12], drag: 3, spin: 12 });
      this.fx.burst({ x, y, n: 3, texture: 'puff', colors: [0x2a2a2a], speed: [20, 60], angle: -Math.PI / 2, spread: 0.8, life: [0.6, 1], size: [30, 60], grow: 2, alpha: 0.35, drag: 1 });
      return;
    }
    if (cause === 'hot') {
      this.fx.burst({ x, y, n: 6, texture: 'puff', colors: [0xffffff], speed: [40, 120], angle: -Math.PI / 2, spread: 0.7, life: [0.8, 1.4], size: [40, 80], grow: 2.4, alpha: 0.4, drag: 1 });
      this.fx.burst({ x, y, n: 12, texture: 'drop', colors: van ? [0xff6a2c, 0xffb347] : [0xd8432a, 0xff8a5b], speed: [150, 380], angle: -Math.PI / 2, spread: 1, life: [0.4, 0.8], size: [6, 12], gravity: 1300 });
      return;
    }
    this.fx.burst({ x, y, n: this.reduced ? 6 : 16, texture: 'circle', colors: [0xfff6e9, 0xf8c56d], speed: [180, 420], life: [0.3, 0.6], size: [5, 10], drag: 3 });
  }

  private confetti(x: number, y: number): void {
    const colors = CONFETTI.map(hex);
    this.fx.burst({ x, y, n: this.reduced ? 30 : 90, texture: 'square', colors, speed: [250, 700], angle: -Math.PI / 2, spread: 1.1, life: [1.4, 2.6], size: [6, 11], gravity: 500, spin: 14, drag: 1.2, flip: this.reduced ? 0 : 11 });
    this.fx.burst({ x, y, n: this.reduced ? 10 : 30, texture: 'star', colors: STAR_COLORS, speed: [200, 500], angle: -Math.PI / 2, spread: 1.2, life: [1, 2], size: [8, 14], gravity: 400, spin: 10 });
  }

  // ---------------------------------------------------------------- 镜头

  updateCamera(sim: SimView, dt: number): void {
    const cam = this.cam;
    const level = sim.level;
    // 镜头跟着还在路上的人（比谁先到了终点的不算）
    const alive = sim.players.filter((p) => !p.dead && !p.done);
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
    // 缩放：基础按屏幕大小，人分散了再缩到都能看见；手机屏幕小，基础近一些
    const base = this.compact ? Math.max(0.55, Math.min(1.1, Math.min(W / 820, H / 500))) : Math.max(0.6, Math.min(1.25, Math.min(W / 1000, H / 640)));
    const fit = Math.min(W / (bw + 420), H / (bh + 360));
    // 坐不住的场地只有一屏：整个场地都看得见（哪块要塌、谁在哪一眼看全）
    let zt = level.arena ? Math.min(W / level.w, H / level.h) : Math.max(0.45, Math.min(base, fit));
    // 过关：镜头推近一点看大家一起跳（A8）
    if (sim.won && !level.arena && !this.reduced) zt *= 1.22;
    const clampX = (x: number, z: number): number => {
      const hw = W / 2 / z;
      return level.w <= hw * 2 ? level.w / 2 : Math.max(hw - 60, Math.min(level.w - hw + 60, x));
    };
    const clampY = (y: number, z: number): number => {
      const hh = H / 2 / z;
      return level.h <= hh * 2 ? level.h / 2 : Math.max(hh - 40, Math.min(level.h - hh + 80, y));
    };
    if (this.introT > 0 && !level.arena) {
      // 开局：从终点扫回起点，中途拉远一点（像摇臂）
      this.introT = Math.max(0, this.introT - dt);
      const u = 1 - this.introT / this.introDur;
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const z0 = Math.max(0.45, zt * 0.8);
      const z = z0 + (zt - z0) * e - 0.14 * zt * Math.sin(Math.PI * u);
      const g = level.goal;
      const gx = clampX(g.x + g.w / 2, z);
      const gy = clampY(g.y + g.h / 2 - 40, z);
      cam.z = z;
      cam.x = gx + (clampX(tx, z) - gx) * e;
      cam.y = gy + (clampY(ty, z) - gy) * e;
      cam.shake = 0;
      return;
    }
    cam.z += (zt - cam.z) * Math.min(1, dt * 2.5);
    // 关卡比画面窄就居中，不然到边停
    const cx = clampX(tx, cam.z);
    const cy = clampY(ty, cam.z);
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

  draw(sim: SimView, dt: number): void {
    this.t += dt;
    if (this.detail > 0 && !(typeof navigator !== 'undefined' && navigator.webdriver) && this.watch.tick(performance.now())) this.lessDetail();
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
    this.backdrop?.update(cam.x, cam.y, cam.z, level.w, level.h, dt);
    this.fore?.update(cam.x, cam.y, cam.z, level.h, dt);
    if (this.detail > 0) this.depth?.update(sim, { x: cam.x, y: cam.y, halfW: this.W / 2 / cam.z, halfH: this.H / 2 / cam.z });
    this.terrain?.update(sim, dt);
    this.drawProps(sim);
    this.drawShadows(sim);
    this.drawRopes(sim);
    this.drawTrails(sim);
    this.syncPlayers(sim);
    // 结束时只有赢的（笑着的）一起跳；坐不住时手抓久了要抖
    const slips = sim.rules?.mode === 'last';
    sim.players.forEach((p, i) => this.dumplings[i]?.update(p, dt, sim.won && p.face === 'win', this.t, slips));
    this.drawAbyss(sim, dt);
    this.fx.update(dt);
    this.screenFx.update(dt);
    this.app.renderer.render(this.app.stage);
  }

  /** 一直掉帧：降一级（先关近景光斑和斜光，再不画台子的侧面）。截图、测试用的无头浏览器不降，画面才稳。 */
  private lessDetail(): void {
    this.detail = this.detail === 2 ? 1 : 0;
    if (this.detail < 2) {
      if (this.backdrop) this.backdrop.light = false;
      this.fore?.destroy();
      this.fore = null;
    }
    if (this.detail < 1 && this.depth) this.depth.view.visible = false;
    console.info(`[hang-on] 一直掉帧，画面降到第 ${this.detail} 级`);
  }

  /**
   * 道具拉面（A9）：一根粗的、米色的面条，边上一道深色、一道亮的（看着是圆的），垂到底一个面疙瘩当把手。
   * 快断的最后 2 秒一闪一闪（减弱动效时只变淡）。
   */
  private drawNoodles(g: Graphics, sim: SimView): void {
    for (const n of sim.noodles ?? []) {
      const pts = n.pts;
      if (pts.length < 2) continue;
      const warn = n.left < 2 ? (this.reduced ? 0.6 : 0.45 + 0.55 * Math.abs(Math.sin(this.t * 14))) : 1;
      const path = (ox: number, oy: number): void => {
        g.moveTo(pts[0]!.x + ox, pts[0]!.y + oy);
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i] as Pt;
          const b = pts[i + 1] as Pt;
          g.quadraticCurveTo(a.x + ox, a.y + oy, (a.x + b.x) / 2 + ox, (a.y + b.y) / 2 + oy);
        }
        const l = pts[pts.length - 1] as Pt;
        g.lineTo(l.x + ox, l.y + oy);
      };
      path(0, 0);
      g.stroke({ width: 11, color: OUTLINE, alpha: warn, cap: 'round', join: 'round' });
      path(0, 0);
      g.stroke({ width: 7, color: 0xf3d79a, alpha: warn, cap: 'round', join: 'round' });
      path(-1.2, -1.2);
      g.stroke({ width: 2.4, color: 0xfff6dc, alpha: 0.8 * warn, cap: 'round', join: 'round' });
      const end = pts[pts.length - 1] as Pt;
      g.circle(end.x, end.y, 9).fill({ color: OUTLINE, alpha: warn });
      g.circle(end.x, end.y, 7).fill({ color: 0xf3d79a, alpha: warn });
      g.circle(end.x - 2, end.y - 2, 2.4).fill({ color: 0xffffff, alpha: 0.7 * warn });
    }
  }

  private drawProps(sim: SimView): void {
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

  /**
   * 落在台子上的影子（A8）：每个人正下方最近的台面上一团椭圆，离得越高越淡越小，
   * 光从左上来，影子往右偏一点。人飞在半空、底下没东西就没有影子。
   */
  private drawShadows(sim: SimView): void {
    const g = this.shadowsG.clear();
    for (const p of sim.players) {
      if (p.dead) continue;
      const b = p.body;
      const foot = b.y + CFG.bodyR;
      const gy = this.groundBelow(sim, b.x, foot - 6);
      if (gy === null) continue;
      const h = Math.max(0, gy - foot);
      const k = Math.min(1, h / 320);
      const sx = b.x + h * 0.1;
      const rx = CFG.bodyR * (1.15 - 0.5 * k);
      const ry = CFG.bodyR * 0.3 * (1 - 0.35 * k);
      const a = 0.32 * (1 - k) * (1 - k);
      g.ellipse(sx, gy - 2, rx, ry).fill({ color: 0x140a1e, alpha: a });
      g.ellipse(sx, gy - 2, rx * 0.6, ry * 0.6).fill({ color: 0x140a1e, alpha: a * 0.7 });
    }
  }

  /** (x, y) 正下方 320 px 内最近的台面的 y；没有就是 null。 */
  private groundBelow(sim: SimView, x: number, y: number): number | null {
    let best = Infinity;
    const take = (top: number, x0: number, x1: number): void => {
      if (x >= x0 && x <= x1 && top >= y && top < best) best = top;
    };
    const level = sim.level;
    for (const r of level.rects) if (r.until === undefined || sim.time < r.until) take(r.y, r.x, r.x + r.w);
    for (const m of level.movers ?? []) {
      if (m.deadly || (m.until !== undefined && sim.time >= m.until)) continue;
      const at = moverAt(m, sim.time);
      take(at.y, at.x, at.x + m.w);
    }
    for (const f of sim.fadings) if (f.on) take(f.y, f.x, f.x + f.w);
    for (const s of sim.springs) take(s.y, s.x, s.x + s.w);
    for (const prop of sim.props) {
      const c = Math.cos(prop.angle);
      if (Math.abs(c) < 0.3) continue;
      const lx = (x - prop.x) / c;
      if (Math.abs(lx) > prop.w / 2) continue;
      take(prop.y + lx * Math.sin(prop.angle) - (prop.h / 2) * c, x - 1, x + 1);
    }
    return best <= y + 320 ? best : null;
  }

  private drawRopes(sim: SimView): void {
    const g = this.ropesG.clear();
    const table = this.world_ === 'table';
    this.drawNoodles(g, sim);
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

  private drawTrails(sim: SimView): void {
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
  private drawAbyss(sim: SimView, dt: number): void {
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

