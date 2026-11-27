/**
 * 节日装饰（11-26，节日关）：节日那几天（`festNow`）和节日关里，画面上挂这个节日的东西。屏幕空间，
 * 压在远景前面、关卡后面（Stage.setLevel 摆进去），不挡人和台子。
 * - 春节：上面一串红灯笼（金穗子），天上时不时放一朵烟花。
 * - 中秋：一轮大月亮（老宅自己有月亮，不另画），一串圆纸灯笼，孔明灯从底下慢慢飘上去。
 * - 圣诞：一串彩灯，单双号轮着亮；下雪（雪山本来就下，不另下）。
 * - 万圣节：一串南瓜灯，顶上一层紫雾，蝙蝠时不时飞过去。
 * 灯串画一次存起来，镜头横着走的时候整串跟着挪（视差 FOLLOW）；亮光另一层，只改透明度。
 * 减弱动效时灯不闪、不放烟花、不飘孔明灯、不飞蝙蝠、不另下雪。手机上（lite）烟花和雪少一点。
 */
import { Container, Graphics } from 'pixi.js';
import type { FestId } from '../fest';
import { glow, type WorldId } from './art';
import type { Particles } from './fx';

/** 镜头横着走 1，灯串走多少（比远景快，比关卡慢）。 */
const FOLLOW = 0.55;
/** 一段灯串（两个挂钩之间）上挂几个，在这一段的哪儿（0 到 1）。 */
const SPOTS: Record<FestId, number[]> = {
  cny: [0.25, 0.5, 0.75],
  midautumn: [0.2, 0.4, 0.6, 0.8],
  xmas: [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92],
  halloween: [0.25, 0.5, 0.75],
};
/** 灯串的线。 */
const WIRE: Record<FestId, number> = { cny: 0x5a1a12, midautumn: 0x4a2a1a, xmas: 0x1f3a24, halloween: 0x2a1838 };
const BULBS = [0xff4d4d, 0x48d17a, 0xffd166, 0x5aa9ff, 0xff7ad9];
const PAPER = [0xfff1c9, 0xffb347, 0xff8fa3];

interface Bat {
  x: number;
  y: number;
  vx: number;
  ph: number;
  s: number;
}

export class Festive {
  readonly view = new Container();
  private readonly far = new Graphics();
  private readonly strandC = new Container();
  private readonly strand: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private readonly glowC = new Container();
  /** 亮光分两组（单号、双号），彩灯轮着亮。 */
  private readonly glowA: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private readonly glowB: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private readonly batsG = new Graphics();
  private bats: Bat[] = [];
  private W = 0;
  private H = 0;
  private P = 1600;
  private t = 0;
  private fireT = 1;
  private skyT = 0;
  private snowT = 0;
  private batT = 2;

  constructor(
    readonly fest: FestId,
    private readonly world: WorldId,
    private readonly fx: Particles,
    private readonly reduced: boolean,
    private readonly lite: boolean,
  ) {
    this.strandC.addChild(...this.strand);
    this.glowC.addChild(...this.glowA, ...this.glowB);
    for (const g of [...this.glowA, ...this.glowB]) g.blendMode = 'add';
    this.view.addChild(this.far, this.strandC, this.glowC, this.batsG);
  }

  resize(W: number, H: number): void {
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    this.P = Math.max(1600, Math.ceil(W / 100) * 100);
    this.drawFar();
    for (let c = 0; c < 2; c++) {
      this.drawStrand(this.strand[c] as Graphics, this.glowA[c] as Graphics, this.glowB[c] as Graphics);
      for (const g of [this.strand[c], this.glowA[c], this.glowB[c]] as Graphics[]) g.x = c * this.P;
    }
  }

  /** camX：镜头中心（世界坐标）；zoom：镜头远近。 */
  update(camX: number, zoom: number, dt: number): void {
    this.t += dt;
    const off = (((camX * FOLLOW * zoom) % this.P) + this.P) % this.P;
    this.strandC.x = -off;
    this.glowC.x = -off;
    if (this.reduced) return;
    const a = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    if (this.fest === 'xmas') {
      // 彩灯：单号、双号轮着亮
      for (const g of this.glowA) g.alpha = 0.25 + 0.75 * a;
      for (const g of this.glowB) g.alpha = 1 - 0.75 * a;
    } else {
      // 灯笼：慢慢呼吸
      const b = 0.82 + 0.18 * Math.sin(this.t * 1.3);
      for (const g of [...this.glowA, ...this.glowB]) g.alpha = b;
    }
    if (this.fest === 'cny') this.fireworks(dt);
    if (this.fest === 'midautumn') this.skyLanterns(dt);
    if (this.fest === 'xmas' && this.world !== 'snow') this.snowfall(dt);
    if (this.fest === 'halloween') this.flyBats(dt);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  // ---------------------------------------------------------------- 画一次的

  private get scale(): number {
    return Math.max(0.75, Math.min(1.5, this.H / 720));
  }

  /** 远处的：中秋的月亮、万圣节顶上的紫雾。 */
  private drawFar(): void {
    const g = this.far.clear();
    const { W, H } = this;
    if (this.fest === 'midautumn' && this.world !== 'house') {
      const r = Math.max(40, H * 0.1);
      const x = W * 0.8;
      const y = H * 0.22;
      glow(g, x, y, r * 2.8, 0xffe8b0, 0.3);
      g.circle(x, y, r).fill(0xfff3d6);
      // 几个淡淡的坑
      for (const [dx, dy, rr] of [
        [-0.3, -0.2, 0.18],
        [0.25, 0.1, 0.24],
        [-0.05, 0.38, 0.14],
      ] as const)
        g.circle(x + dx * r, y + dy * r, rr * r).fill({ color: 0xeed8a8, alpha: 0.7 });
    }
    if (this.fest === 'halloween') {
      for (let k = 1; k <= 6; k++) g.rect(0, 0, W, H * 0.06 * k).fill({ color: 0x6a2c91, alpha: 0.035 });
    }
  }

  /** 一段灯串：挂钩在屏幕上沿外面，中间往下垂；挂着的东西和它们的光。 */
  private drawStrand(g: Graphics, ga: Graphics, gb: Graphics): void {
    g.clear();
    ga.clear();
    gb.clear();
    const s = this.scale;
    const P = this.P;
    const spans = 3;
    const span = P / spans;
    const y0 = -6;
    const sag = this.H * (this.fest === 'xmas' ? 0.05 : 0.06);
    const yAt = (u: number): number => y0 + sag * 4 * u * (1 - u);
    // 线：每段一条弧
    for (let i = 0; i < spans; i++) {
      const x0 = i * span;
      g.moveTo(x0, y0).quadraticCurveTo(x0 + span / 2, y0 + sag * 2, x0 + span, y0).stroke({ width: 2 * s, color: WIRE[this.fest], alpha: 0.95 });
    }
    let k = 0;
    for (let i = 0; i < spans; i++) {
      for (const u of SPOTS[this.fest]) {
        const x = i * span + u * span;
        const y = yAt(u);
        const lit = k % 2 === 0 ? ga : gb;
        if (this.fest === 'cny') this.redLantern(g, lit, x, y, s);
        else if (this.fest === 'midautumn') this.paperLantern(g, lit, x, y, s, PAPER[k % PAPER.length] as number);
        else if (this.fest === 'xmas') this.bulb(g, lit, x, y, s, BULBS[k % BULBS.length] as number);
        else this.pumpkin(g, lit, x, y, s);
        k++;
      }
    }
  }

  /** 春节的红灯笼：金盖、几道竖纹、金穗子。 */
  private redLantern(g: Graphics, lit: Graphics, x: number, y: number, s: number): void {
    const drop = 14 * s;
    const rx = 17 * s;
    const ry = 21 * s;
    const cy = y + drop + ry;
    g.moveTo(x, y).lineTo(x, y + drop).stroke({ width: 1.5 * s, color: 0x3a1a10 });
    g.ellipse(x, cy, rx, ry).fill(0xd72a2a);
    g.ellipse(x, cy, rx * 0.5, ry).stroke({ width: 1.5 * s, color: 0x9e1616 });
    g.moveTo(x, cy - ry).lineTo(x, cy + ry).stroke({ width: 1.5 * s, color: 0x9e1616 });
    g.rect(x - 8 * s, cy - ry - 3 * s, 16 * s, 5 * s).fill(0xf2b33d);
    g.rect(x - 8 * s, cy + ry - 2 * s, 16 * s, 5 * s).fill(0xf2b33d);
    g.moveTo(x, cy + ry + 3 * s).lineTo(x, cy + ry + 17 * s).stroke({ width: 3 * s, color: 0xf2b33d, cap: 'round' });
    glow(lit, x, cy, rx * 2.6, 0xff7043, 0.4);
    lit.ellipse(x, cy, rx * 0.8, ry * 0.8).fill({ color: 0xffb36b, alpha: 0.22 });
  }

  /** 中秋的圆纸灯笼：上下两个小盖、两道横纹、红穗子。 */
  private paperLantern(g: Graphics, lit: Graphics, x: number, y: number, s: number, color: number): void {
    const drop = 12 * s;
    const r = 14 * s;
    const cy = y + drop + r;
    g.moveTo(x, y).lineTo(x, y + drop).stroke({ width: 1.5 * s, color: 0x3a2412 });
    g.circle(x, cy, r).fill(color);
    for (const dy of [-0.4, 0.4]) g.moveTo(x - r * 0.9, cy + dy * r).quadraticCurveTo(x, cy + dy * r * 1.25, x + r * 0.9, cy + dy * r).stroke({ width: 1.2 * s, color: 0x8a5a2a, alpha: 0.5 });
    g.rect(x - 6 * s, cy - r - 2 * s, 12 * s, 4 * s).fill(0x8a2b1c);
    g.rect(x - 6 * s, cy + r - 2 * s, 12 * s, 4 * s).fill(0x8a2b1c);
    g.moveTo(x, cy + r + 2 * s).lineTo(x, cy + r + 13 * s).stroke({ width: 2.5 * s, color: 0xc0392b, cap: 'round' });
    glow(lit, x, cy, r * 2.8, 0xffc46b, 0.4);
    lit.circle(x, cy, r * 0.8).fill({ color: 0xffe2a8, alpha: 0.22 });
  }

  /** 圣诞彩灯：一颗灯泡，深绿的灯座；亮的时候整颗发光。 */
  private bulb(g: Graphics, lit: Graphics, x: number, y: number, s: number, color: number): void {
    const cy = y + 9 * s;
    g.rect(x - 3 * s, y, 6 * s, 4 * s).fill(0x2d4a2d);
    g.ellipse(x, cy, 5.5 * s, 8 * s).fill({ color, alpha: 0.55 });
    glow(lit, x, cy, 20 * s, color, 0.55);
    lit.ellipse(x, cy, 5 * s, 7.5 * s).fill({ color, alpha: 0.75 });
    lit.circle(x - 1.5 * s, cy - 3 * s, 1.6 * s).fill({ color: 0xffffff, alpha: 0.8 });
  }

  /** 万圣节的南瓜灯：几瓣、绿把、三角眼睛、锯齿嘴，里面透出火光。 */
  private pumpkin(g: Graphics, lit: Graphics, x: number, y: number, s: number): void {
    const drop = 12 * s;
    const rx = 16 * s;
    const ry = 13 * s;
    const cy = y + drop + ry;
    g.moveTo(x, y).lineTo(x, y + drop).stroke({ width: 1.5 * s, color: 0x1a0f24 });
    g.rect(x - 2 * s, cy - ry - 5 * s, 4 * s, 7 * s).fill(0x4d7a2a);
    g.ellipse(x, cy, rx, ry).fill(0xf07a1a);
    g.ellipse(x, cy, rx * 0.45, ry).stroke({ width: 1.5 * s, color: 0xc85a0e });
    const face = 0x3a1405;
    g.poly([x - 9 * s, cy - 2 * s, x - 3 * s, cy - 2 * s, x - 6 * s, cy - 7 * s]).fill(face);
    g.poly([x + 3 * s, cy - 2 * s, x + 9 * s, cy - 2 * s, x + 6 * s, cy - 7 * s]).fill(face);
    g.poly([x - 9 * s, cy + 3 * s, x - 5 * s, cy + 6 * s, x - 2 * s, cy + 3 * s, x + 2 * s, cy + 6 * s, x + 5 * s, cy + 3 * s, x + 9 * s, cy + 4 * s, x + 6 * s, cy + 9 * s, x - 6 * s, cy + 9 * s]).fill(face);
    glow(lit, x, cy, rx * 2.6, 0xffa63d, 0.4);
    lit.ellipse(x, cy + 2 * s, rx * 0.6, ry * 0.55).fill({ color: 0xffd27a, alpha: 0.3 });
  }

  // ---------------------------------------------------------------- 会动的

  /** 春节：天上时不时放一朵烟花。 */
  private fireworks(dt: number): void {
    this.fireT -= dt;
    if (this.fireT > 0) return;
    this.fireT = 2.4 + Math.random() * 1.4;
    this.fx.burst({
      x: this.W * (0.15 + Math.random() * 0.7),
      y: this.H * (0.1 + Math.random() * 0.28),
      n: this.lite ? 16 : 28,
      texture: 'dot',
      colors: [0xffd166, 0xff5a5a, 0xffa94d, 0xfff3b0],
      speed: [90, 220],
      spread: Math.PI,
      life: [0.9, 1.5],
      size: [4, 7],
      gravity: 90,
      drag: 1.4,
      alpha: 0.95,
      blend: 'add',
    });
  }

  /** 中秋：孔明灯从底下慢慢往上飘。 */
  private skyLanterns(dt: number): void {
    this.skyT -= dt;
    if (this.skyT > 0) return;
    this.skyT = this.lite ? 3 : 1.8;
    this.fx.burst({
      x: Math.random() * this.W,
      y: this.H + 20,
      n: 1,
      texture: 'puff',
      colors: [0xffb25e, 0xffd08a],
      speed: [30, 46],
      spread: 0.15,
      life: [14, 18],
      size: [9, 13],
      alpha: 0.85,
      blend: 'add',
    });
  }

  /** 圣诞：下雪（雪山以外的世界）。 */
  private snowfall(dt: number): void {
    this.snowT += dt;
    const every = this.lite ? 0.12 : 0.07;
    while (this.snowT >= every) {
      this.snowT -= every;
      this.fx.burst({
        x: Math.random() * (this.W + 200) - 100,
        y: -20,
        n: 1,
        texture: 'circle',
        colors: [0xffffff, 0xeaf4ff],
        speed: [40, 90],
        angle: Math.PI / 2,
        spread: 0.25,
        life: [8, 11],
        size: [3, 6],
        alpha: 0.75,
      });
    }
  }

  /** 万圣节：蝙蝠时不时飞过去，翅膀一扇一扇。 */
  private flyBats(dt: number): void {
    this.batT -= dt;
    if (this.batT <= 0 && this.bats.length < 3) {
      this.batT = 4 + Math.random() * 3;
      const right = Math.random() < 0.5;
      this.bats.push({ x: right ? -40 : this.W + 40, y: this.H * (0.08 + Math.random() * 0.32), vx: (right ? 1 : -1) * (120 + Math.random() * 60), ph: Math.random() * 6, s: this.scale * (0.8 + Math.random() * 0.5) });
    }
    const g = this.batsG.clear();
    this.bats = this.bats.filter((b) => b.x > -60 && b.x < this.W + 60);
    for (const b of this.bats) {
      b.x += b.vx * dt;
      b.y += Math.sin(this.t * 2 + b.ph) * 12 * dt;
      const flap = Math.sin(this.t * 14 + b.ph);
      const s = b.s;
      const tip = -6 * s * flap;
      g.ellipse(b.x, b.y, 4 * s, 3 * s).fill(0x1a0f24);
      g.poly([b.x - 2 * s, b.y, b.x - 9 * s, b.y + tip - 3 * s, b.x - 16 * s, b.y + tip, b.x - 10 * s, b.y + 3 * s]).fill(0x1a0f24);
      g.poly([b.x + 2 * s, b.y, b.x + 9 * s, b.y + tip - 3 * s, b.x + 16 * s, b.y + tip, b.x + 10 * s, b.y + 3 * s]).fill(0x1a0f24);
    }
  }
}
