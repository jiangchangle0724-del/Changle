/**
 * 背景（A3）：天空渐变加三层视差剪影，屏幕空间，跟着镜头慢慢走。
 * 年夜饭桌：红灯笼、碗、茶壶、蒸笼的剪影，蒸汽往上飘。
 * 温哥华：傍晚的天、雪山、吊桥、楼群的灯、海边的树；冰关下雨。
 * 全部程序画，每层是一张周期为 P 的图，画两份接起来滚。
 */
import { Container, FillGradient, Graphics } from 'pixi.js';
import { glow, hex, type Palette, type WorldId } from './art';
import type { Burst, Particles } from './fx';

interface Layer {
  c: Container;
  /** 视差系数：镜头走 1，它走 f。 */
  f: number;
  period: number;
  g: [Graphics, Graphics];
}

/** 确定性随机：背景每次长一样。 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export class Backdrop {
  readonly view = new Container();
  private readonly sky = new Graphics();
  private readonly layers: Layer[] = [];
  private W = 0;
  private H = 0;
  private steamT = 0;
  private rainT = 0;
  rain = false;

  constructor(
    private readonly world: WorldId,
    private readonly pal: Palette,
    private readonly fx: Particles,
  ) {
    this.view.addChild(this.sky);
    for (const f of [0.1, 0.28, 0.5]) {
      const c = new Container();
      const g: [Graphics, Graphics] = [new Graphics(), new Graphics()];
      c.addChild(g[0], g[1]);
      this.view.addChild(c);
      this.layers.push({ c, f, period: 1600, g });
    }
  }

  resize(W: number, H: number): void {
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    const sky = this.sky.clear();
    const grad = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: this.pal.skyTop }, { offset: 1, color: this.pal.skyBottom }] });
    sky.rect(0, 0, W, H).fill(grad);
    if (this.world === 'van') this.stars(sky, W, H);
    const period = Math.max(1600, Math.ceil(W / 100) * 100);
    this.layers.forEach((l, i) => {
      l.period = period;
      for (const g of l.g) {
        g.clear();
        if (this.world === 'table') this.tableLayer(g, i, period, H);
        else this.vanLayer(g, i, period, H);
      }
      l.g[1].x = period;
    });
  }

  /** camX / camY：镜头中心（世界坐标）；levelH 用来算竖直视差。 */
  update(camX: number, camY: number, zoom: number, levelH: number, dt: number): void {
    for (const l of this.layers) {
      const off = ((camX * l.f * zoom) % l.period) + l.period;
      l.c.x = -(off % l.period);
      l.c.y = -(camY - levelH / 2) * l.f * 0.35 * zoom;
    }
    if (this.world === 'table') this.steam(dt);
    if (this.rain) this.rainfall(dt);
  }

  // ---------------------------------------------------------------- 年夜饭桌

  private tableLayer(g: Graphics, i: number, P: number, H: number): void {
    const r = rng(100 + i);
    const pal = this.pal;
    if (i === 0) {
      // 灯笼：一根线上挂几盏，每盏一团暖光
      const y0 = H * 0.02;
      g.moveTo(0, y0).lineTo(P, y0).stroke({ width: 2, color: hex(pal.far), alpha: 0.9 });
      for (const [fx, fy] of [
        [0.07, 0.16],
        [0.29, 0.1],
        [0.5, 0.19],
        [0.74, 0.11],
        [0.9, 0.17],
      ] as const) {
        this.lantern(g, fx * P, fy * H, 1 + (r() - 0.5) * 0.3, y0);
      }
      // 远处的桌面：一条暗的地平线，上面是碗和壶的剪影
      const hy = H * 0.6;
      g.rect(0, hy, P, H - hy).fill(hex(pal.far));
      const dark = hex(pal.far);
      this.bowl(g, 0.12 * P, hy, 150, 52, dark);
      this.steamers(g, 0.33 * P, hy, 120, 3, dark);
      this.teapot(g, 0.56 * P, hy, 130, dark);
      this.bowl(g, 0.8 * P, hy, 190, 60, dark);
      this.bottle(g, 0.95 * P, hy, 46, 120, dark);
    } else if (i === 1) {
      const hy = H * 0.7;
      const col = hex(pal.mid);
      g.rect(0, hy, P, H - hy).fill(col);
      this.steamers(g, 0.08 * P, hy, 190, 4, col);
      this.bowl(g, 0.38 * P, hy, 300, 90, col);
      this.chopsticks(g, 0.4 * P, hy - 60, col);
      this.cup(g, 0.62 * P, hy, 70, 60, col);
      this.teapot(g, 0.8 * P, hy, 200, col);
      this.bowl(g, 0.98 * P, hy, 220, 70, col);
    } else {
      // 近景：几团暖色的光斑，像桌边的烛光
      for (let k = 0; k < 7; k++) {
        const x = r() * P;
        const y = H * (0.2 + r() * 0.7);
        const rad = 40 + r() * 90;
        for (let s = 0; s < 3; s++) g.circle(x, y, rad * (1 - s * 0.3)).fill({ color: hex(pal.haze), alpha: 0.025 + s * 0.015 });
      }
      const hy = H * 0.86;
      g.rect(0, hy, P, H - hy).fill(hex(pal.near));
      this.bowl(g, 0.2 * P, hy, 360, 110, hex(pal.near));
      this.steamers(g, 0.7 * P, hy, 260, 3, hex(pal.near));
    }
  }

  private lantern(g: Graphics, x: number, y: number, s: number, lineY: number): void {
    g.moveTo(x, lineY).lineTo(x, y - 34 * s).stroke({ width: 2, color: 0x3a1218 });
    glow(g, x, y, 130 * s, this.pal.lampOn, 0.22);
    g.roundRect(x - 10 * s, y - 36 * s, 20 * s, 7 * s, 2).fill(0xd9a441);
    g.ellipse(x, y, 24 * s, 30 * s).fill(0xc93a2e).stroke({ width: 2, color: 0x6b1a14 });
    g.ellipse(x, y, 24 * s, 30 * s).stroke({ width: 1.5, color: 0xff8a5b, alpha: 0.35 });
    for (const k of [-0.5, 0, 0.5]) g.ellipse(x + k * 20 * s, y, 7 * s, 29 * s).stroke({ width: 1.2, color: 0xff9a7b, alpha: 0.35 });
    g.roundRect(x - 10 * s, y + 29 * s, 20 * s, 7 * s, 2).fill(0xd9a441);
    g.moveTo(x, y + 36 * s).lineTo(x, y + 52 * s).stroke({ width: 2, color: 0xd9a441 });
    g.moveTo(x - 5 * s, y + 52 * s).lineTo(x + 5 * s, y + 52 * s).lineTo(x, y + 72 * s).closePath().fill(0xe8413c);
  }

  private bowl(g: Graphics, x: number, y: number, w: number, h: number, col: number): void {
    g.moveTo(x - w / 2, y - h).quadraticCurveTo(x - w / 2, y + 2, x - w * 0.3, y).lineTo(x + w * 0.3, y).quadraticCurveTo(x + w / 2, y + 2, x + w / 2, y - h).closePath().fill(col);
    g.ellipse(x, y - h, w / 2, h * 0.14).fill(col);
  }

  private steamers(g: Graphics, x: number, y: number, w: number, n: number, col: number): void {
    const tier = 42;
    for (let k = 0; k < n; k++) {
      const yy = y - (k + 1) * tier;
      g.roundRect(x - w / 2, yy, w, tier - 4, 6).fill(col);
      g.roundRect(x - w / 2 - 6, yy - 6, w + 12, 10, 4).fill(col);
    }
    g.ellipse(x, y - n * tier - 8, w / 2 - 6, 12).fill(col);
  }

  private teapot(g: Graphics, x: number, y: number, w: number, col: number): void {
    const h = w * 0.6;
    g.ellipse(x, y - h / 2, w / 2, h / 2).fill(col);
    g.rect(x - w / 2, y - h / 2, w, h / 2).fill(col);
    g.moveTo(x + w * 0.4, y - h * 0.6).quadraticCurveTo(x + w * 0.8, y - h * 0.9, x + w * 0.72, y - h * 1.2).lineTo(x + w * 0.62, y - h * 1.1).quadraticCurveTo(x + w * 0.62, y - h * 0.8, x + w * 0.35, y - h * 0.4).closePath().fill(col);
    g.moveTo(x - w * 0.42, y - h * 0.7).quadraticCurveTo(x - w * 0.85, y - h * 0.9, x - w * 0.46, y - h * 0.25).stroke({ width: w * 0.08, color: col });
    g.roundRect(x - w * 0.12, y - h - 14, w * 0.24, 16, 4).fill(col);
    g.circle(x, y - h - 18, 7).fill(col);
  }

  private bottle(g: Graphics, x: number, y: number, w: number, h: number, col: number): void {
    g.roundRect(x - w / 2, y - h * 0.7, w, h * 0.7, 8).fill(col);
    g.roundRect(x - w * 0.2, y - h, w * 0.4, h * 0.35, 4).fill(col);
  }

  private cup(g: Graphics, x: number, y: number, w: number, h: number, col: number): void {
    g.moveTo(x - w / 2, y - h).lineTo(x - w * 0.35, y).lineTo(x + w * 0.35, y).lineTo(x + w / 2, y - h).closePath().fill(col);
  }

  private chopsticks(g: Graphics, x: number, y: number, col: number): void {
    for (const k of [0, 1]) {
      const x0 = x + 60 + k * 16;
      g.moveTo(x0, y).lineTo(x0 + 70, y - 190).stroke({ width: 7, color: col, cap: 'round' });
    }
  }

  private steam(dt: number): void {
    this.steamT += dt;
    const every = 0.12;
    while (this.steamT >= every) {
      this.steamT -= every;
      const b: Burst = {
        x: Math.random() * this.W,
        y: this.H * (0.72 + Math.random() * 0.3),
        n: 1,
        texture: 'puff',
        colors: [0xffd9c2],
        speed: [18, 40],
        angle: -Math.PI / 2,
        spread: 0.5,
        life: [5, 8],
        size: [90, 170],
        grow: 1.8,
        alpha: 0.07,
        drag: 0.1,
      };
      this.fx.burst(b);
    }
  }

  // ---------------------------------------------------------------- 温哥华

  private stars(g: Graphics, W: number, H: number): void {
    const r = rng(9);
    for (let k = 0; k < 90; k++) {
      const x = r() * W;
      const y = r() * H * 0.45;
      g.circle(x, y, 0.8 + r() * 1.3).fill({ color: 0xffffff, alpha: 0.25 + r() * 0.55 });
    }
    // 月亮
    const mx = W * 0.78;
    const my = H * 0.14;
    glow(g, mx, my, 110, '#fff1c9', 0.16);
    g.circle(mx, my, 30).fill(0xfff1c9);
    g.circle(mx + 12, my - 8, 26).fill(hex(this.pal.skyTop));
  }

  private vanLayer(g: Graphics, i: number, P: number, H: number): void {
    const r = rng(300 + i);
    const pal = this.pal;
    if (i === 0) {
      // 雪山
      const base = H * 0.62;
      const col = hex(pal.far);
      const peaks: [number, number][] = [];
      let x = 0;
      while (x < P + 200) {
        peaks.push([x, base - 60 - r() * 170]);
        x += 140 + r() * 180;
      }
      g.moveTo(-10, H);
      g.lineTo(-10, base);
      for (const [px, py] of peaks) g.lineTo(px, py);
      g.lineTo(P + 10, base).lineTo(P + 10, H).closePath().fill(col);
      for (const [px, py] of peaks) {
        const cap = 22 + r() * 16;
        g.moveTo(px, py).lineTo(px - cap * 0.9, py + cap).lineTo(px - cap * 0.3, py + cap * 0.8).lineTo(px + cap * 0.2, py + cap * 1.05).lineTo(px + cap * 0.9, py + cap).closePath().fill({ color: 0xffffff, alpha: 0.45 });
      }
      // 吊桥
      const bx = P * 0.55;
      const by = base - 10;
      const span = P * 0.3;
      g.rect(bx, by - 120, 10, 130).fill(col);
      g.rect(bx + span, by - 120, 10, 130).fill(col);
      g.moveTo(bx - 120, by).quadraticCurveTo(bx + 5, by - 118, bx + 5, by - 118).stroke({ width: 3, color: col });
      g.moveTo(bx + 5, by - 118).quadraticCurveTo(bx + span / 2, by + 40, bx + span + 5, by - 118).stroke({ width: 3, color: col });
      g.moveTo(bx + span + 5, by - 118).quadraticCurveTo(bx + span + 5, by - 118, bx + span + 130, by).stroke({ width: 3, color: col });
      g.rect(bx - 130, by - 4, span + 270, 8).fill(col);
      g.rect(0, base + 12, P, H - base - 12).fill(col);
    } else if (i === 1) {
      // 楼群和灯
      const base = H * 0.7;
      const col = hex(pal.mid);
      const lamp = hex(pal.lampOn);
      let x = 0;
      while (x < P) {
        const w = 34 + r() * 56;
        const h = 50 + r() * 190;
        g.rect(x, base - h, w, h + 20).fill(col);
        for (let wy = base - h + 10; wy < base - 8; wy += 14) {
          for (let wx = x + 6; wx < x + w - 6; wx += 12) if (r() > 0.55) g.rect(wx, wy, 5, 7).fill({ color: lamp, alpha: 0.75 });
        }
        x += w + 6 + r() * 14;
      }
      // 一座带圆盘的塔
      const tx = P * 0.42;
      g.rect(tx - 7, base - 300, 14, 300).fill(col);
      g.ellipse(tx, base - 250, 44, 18).fill(col);
      g.ellipse(tx, base - 250, 36, 10).fill({ color: lamp, alpha: 0.3 });
      glow(g, tx, base - 250, 70, this.pal.lampOn, 0.14);
      g.rect(0, base + 20, P, H - base - 20).fill(col);
    } else {
      // 海边的树和码头
      const base = H * 0.86;
      const col = hex(pal.near);
      let x = 20;
      while (x < P) {
        const h = 90 + r() * 110;
        const w = 40 + r() * 30;
        for (let k = 0; k < 3; k++) {
          const ty = base - h + (k * h) / 3.2;
          const tw = w * (0.45 + k * 0.28);
          g.moveTo(x, ty - h * 0.2).lineTo(x - tw / 2, ty + h * 0.26).lineTo(x + tw / 2, ty + h * 0.26).closePath().fill(col);
        }
        g.rect(x - 4, base - 14, 8, 20).fill(col);
        x += 70 + r() * 160;
      }
      g.rect(0, base, P, H - base).fill(col);
      for (let px = 40; px < P; px += 46) g.rect(px, base - 30, 6, 32).fill(col);
      g.rect(0, base - 34, P, 8).fill(col);
    }
  }

  private rainfall(dt: number): void {
    this.rainT += dt;
    const every = 0.018;
    while (this.rainT >= every) {
      this.rainT -= every;
      this.fx.burst({
        x: Math.random() * (this.W + 200) - 100,
        y: -20,
        n: 1,
        texture: 'dot',
        colors: [0xd8f1fb],
        speed: [900, 1200],
        angle: Math.PI / 2 - 0.18,
        spread: 0.02,
        life: [1.2, 1.4],
        size: [3, 5],
        alpha: 0.55,
        stretch: 7,
      });
    }
  }
}
