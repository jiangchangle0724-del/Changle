/**
 * 黑屋子（老宅，A10）：关卡 `dark` 里的矩形看不清，只有光照得到的地方看得见。
 *
 * 做法：一张比屏幕小的光照图（屏幕的 1/3，放大后边上自然是软的），每帧先铺白，把黑屋子涂成夜色，
 * 再把每一处光用「加」叠上去（中间到白，往外软软地淡掉）；最后整张图用「乘」盖在世界上：白的地方不变，夜色的地方变暗。
 * 光：每个人身上一圈、亮着的墙灯、灯笼、亮了的检查点（没亮的只有一小点，看得出在哪）、灭着的灯一点点（看得出能点）、
 * 没用掉的钥匙一闪一闪、要命的东西（炭盆、电线自己发光，碎瓷片反一点光，免得摸黑撞上去）、终点、外卖无人机。
 * 没有 WebGL（canvas 画）的时候退一步：黑屋子整块压暗一半，不挖光。
 */
import { Container, FillGradient, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import type { Level, Rect } from '../physics/level';
import { moverAt } from '../physics/motion';
import type { SimView } from './view';

/** 光照图比屏幕小几倍。 */
const SCALE = 1 / 3;
/** 黑屋子里的夜色（乘上去）：偏蓝的暗，台子和人的轮廓还隐约看得见。 */
const NIGHT = 0x26263f;
/** 每个人身上那一圈、灯笼照多远（像素）。 */
const PLAYER_LIGHT = 170;
const LANTERN_LIGHT = 300;

export class Darkness {
  readonly view: Container;
  private readonly rt: RenderTexture | null = null;
  private readonly sprite: Sprite | null = null;
  private readonly scene = new Container();
  private readonly paper = new Graphics();
  private readonly inner = new Container();
  private readonly shade = new Graphics();
  private readonly lights = new Graphics();
  /** canvas 画的时候：直接盖在世界里的一层暗。 */
  readonly fallback: Graphics | null = null;
  private readonly grads = new Map<string, FillGradient>();
  private W = 0;
  private H = 0;
  private t = 0;

  constructor(
    private readonly renderer: Renderer,
    level: Level,
    private readonly reduced: boolean,
  ) {
    if (renderer.name === 'canvas') {
      // 没有 WebGL：黑屋子整块压暗
      const g = new Graphics();
      for (const r of level.dark ?? []) g.rect(r.x, r.y, r.w, r.h).fill({ color: 0x0b0b18, alpha: 0.55 });
      this.fallback = g;
      this.view = new Container();
      return;
    }
    this.rt = RenderTexture.create({ width: 8, height: 8, resolution: 1 });
    this.sprite = new Sprite(this.rt);
    this.sprite.blendMode = 'multiply';
    this.view = this.sprite;
    this.lights.blendMode = 'add';
    this.inner.addChild(this.shade, this.lights);
    this.scene.addChild(this.paper, this.inner);
  }

  resize(W: number, H: number): void {
    if (!this.rt || (W === this.W && H === this.H)) return;
    this.W = W;
    this.H = H;
    const w = Math.max(8, Math.ceil(W * SCALE));
    const h = Math.max(8, Math.ceil(H * SCALE));
    this.rt.resize(w, h);
    this.paper.clear().rect(0, 0, w, h).fill(0xffffff);
    this.sprite?.scale.set(W / w, H / h);
  }

  /** 每帧：world 是画世界的那个容器（镜头的平移、缩放、抖都在它上面），照它摆光照图。 */
  update(sim: SimView, world: Container, dt: number): void {
    if (!this.rt) return;
    this.t += dt;
    const sx = this.rt.width / Math.max(1, this.W);
    this.inner.position.set(world.position.x * sx, world.position.y * sx);
    this.inner.scale.set(world.scale.x * sx);
    this.inner.pivot.set(world.pivot.x, world.pivot.y);
    const shade = this.shade.clear();
    const dark = sim.level.dark ?? [];
    for (const r of dark) shade.rect(r.x, r.y, r.w, r.h);
    if (dark.length) shade.fill(NIGHT);
    const g = this.lights.clear();
    const near = (x: number, y: number, r: number): boolean => dark.some((d) => x + r > d.x && x - r < d.x + d.w && y + r > d.y && y - r < d.y + d.h);
    const light = (x: number, y: number, r: number, color: string, alpha = 1): void => {
      if (r <= 0 || !near(x, y, r)) return;
      g.circle(x, y, r).fill({ fill: this.grad(color), alpha: Math.max(0, Math.min(1, alpha)) });
    };
    const flick = (k: number, i: number): number => (this.reduced ? 1 : 1 - k + k * (0.5 + 0.5 * Math.sin(this.t * 11 + i * 2.3) * Math.sin(this.t * 7.3 + i)));
    // 每个人身上一圈
    for (const p of sim.players) if (!p.dead) light(p.body.x, p.body.y - 10, PLAYER_LIGHT, '#ffffff', 0.95);
    // 墙上的灯：亮的照一大片（火苗晃，光也跟着晃一点）；灭着的只有一小点，看得出那里有一盏
    (sim.lamps ?? []).forEach((l, i) => {
      if (l.on) light(l.x, l.y, l.r * (0.96 + 0.04 * flick(1, i)), '#ffd9a0');
      else light(l.x, l.y + 14, 34, '#ffd9a0', 0.5 + 0.2 * Math.sin(this.t * 2.4 + i));
    });
    // 灯笼（物件）
    for (const prop of sim.props) if (prop.kind === 'lantern') light(prop.x, prop.y, LANTERN_LIGHT * (0.97 + 0.03 * flick(1, 7)), '#ffc890');
    // 检查点：亮了的照一片，没亮的一小点
    (sim.level.checkpoints ?? []).forEach((cp, i) => light(cp.x, cp.y - 30, i <= sim.checkpoint ? 220 : 50, '#ffd9a0', i <= sim.checkpoint ? 1 : 0.6));
    // 没用掉的钥匙：一闪一闪，摸黑也找得到
    for (const k of sim.keys ?? []) {
      const prop = sim.props[k.prop];
      if (!prop || k.used) continue;
      const pulse = this.reduced ? 0.7 : 0.45 + 0.4 * Math.max(0, Math.sin(this.t * 3.2 + k.prop));
      light(prop.x, prop.y, 56, '#ffe8a0', pulse);
    }
    // 要命的东西自己看得见：炭盆、电线发光，碎瓷片反一点光
    const hazards = [...(sim.level.hazards ?? [])];
    for (const m of sim.level.movers ?? []) if (m.deadly) hazards.push({ ...m, ...moverAt(m, sim.time), kind: m.hazard ?? 'spike' });
    hazards.forEach((h: Rect & { kind?: string }, i) => {
      const cx = h.x + h.w / 2;
      const cy = h.y + h.h / 2;
      const size = Math.max(h.w, h.h) / 2;
      if (h.kind === 'hot') light(cx, cy - 10, size + 110, '#ffb070', 0.9 * flick(0.25, i));
      else if (h.kind === 'zap') light(cx, cy, size + 80, '#bfe0ff', 0.85 * flick(0.6, i));
      else light(cx, cy, size + 50, '#ffffff', 0.55);
    });
    // 终点
    const goal = sim.level.goal;
    if (!sim.level.arena) light(goal.x + goal.w / 2, goal.y + goal.h / 2, Math.max(goal.w, goal.h), '#ffe0b0');
    if (sim.drone) light(sim.drone.x, sim.drone.y - 40, 160, '#ffffff', 0.8);
    this.renderer.render({ container: this.scene, target: this.rt, clear: true });
  }

  /**
   * 一团光：中间到满，往外软软地淡掉。一种颜色只建一个渐变（它背后是一张贴图），亮度用画的时候的 alpha 调
   * （闪烁、呼吸每帧亮度都不一样，按亮度建会建出上百张贴图）。
   */
  private grad(color: string): FillGradient {
    let gr = this.grads.get(color);
    if (!gr) {
      gr = new FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: `${color}ff` },
          { offset: 0.4, color: `${color}d9` },
          { offset: 0.75, color: `${color}4d` },
          { offset: 1, color: `${color}00` },
        ],
      });
      this.grads.set(color, gr);
    }
    return gr;
  }

  destroy(): void {
    for (const gr of this.grads.values()) gr.destroy();
    this.grads.clear();
    this.fallback?.destroy();
    this.scene.destroy({ children: true });
    this.view.destroy();
    this.rt?.destroy(true);
  }
}
