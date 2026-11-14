/**
 * 近景虚化（A8）：离镜头很近、对不上焦的东西，从画面下沿和两边飘过：
 * 年夜饭桌是几团烛光的光斑和一缕缕热气，温哥华是城里灯的光斑。
 * 屏幕空间，镜头走 1 它走 1.4（比台子还近），所以一动起来前后就分出来了。
 * 都很淡、都在边上，不挡路；手机上不画（满屏半透明费电）。少动画（reduced motion）时光斑不飘、没有热气。
 */
import { Container, Sprite } from 'pixi.js';
import { textures, type WorldId } from './art';

interface Blob {
  /** 在一条宽 P 的带子上的位置（屏幕像素）。 */
  x: number;
  /** 0..1，乘屏幕高。 */
  y: number;
  r: number;
  color: number;
  alpha: number;
  /** 慢慢上下飘的相位。 */
  phase: number;
  /** 热气：一团团往上飘、变大、变淡。 */
  steam: boolean;
  /** 一团软光的图（粒子图集里的雾团），上色、缩放，便宜。 */
  s: Sprite;
}

/** 雾团那张图的软边半径（64 px 的格子里画到 30 px）。 */
const PUFF_R = 30;

/** 近景比台子近多少：镜头走 1，它走 PARALLAX。 */
const PARALLAX = 1.4;
const P = 2600;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export class Foreground {
  readonly view = new Container();
  private readonly blobs: Blob[] = [];
  private t = 0;
  private W = 1;
  private H = 1;

  constructor(
    world: WorldId,
    private readonly still = false,
  ) {
    const puff = textures().particles.puff;
    const sprite = (color: number): Sprite => {
      const s = new Sprite(puff);
      s.anchor.set(0.5);
      s.tint = color;
      this.view.addChild(s);
      return s;
    };
    // 年夜饭桌和后厨是暖的光斑和热气，温哥华是城里的灯
    const warmWorld = world !== 'van';
    const r = rng(world === 'table' ? 31 : world === 'kitchen' ? 43 : 57);
    const warm = [0xffb35c, 0xff8a5b, 0xffd27a];
    const city = [0xffd27a, 0x8ec5e8, 0xf28ca6, 0xa8c8ff];
    for (let i = 0; i < 9; i++) {
      // 光斑：多数贴着下沿，少数在左右上角
      const low = r() < 0.75;
      const color = (warmWorld ? warm : city)[i % (warmWorld ? warm.length : city.length)] as number;
      this.blobs.push({
        x: r() * P,
        y: low ? 0.86 + r() * 0.22 : 0.02 + r() * 0.14,
        r: 50 + r() * 90,
        color,
        alpha: 0.1 + r() * 0.08,
        phase: r() * 6.28,
        steam: false,
        s: sprite(color),
      });
    }
    if (warmWorld && !still) {
      for (let i = 0; i < 5; i++) this.blobs.push({ x: r() * P, y: 0.95 + r() * 0.1, r: 90 + r() * 60, color: 0xffffff, alpha: 0.07, phase: r() * 6.28, steam: true, s: sprite(0xffffff) });
    }
  }

  resize(W: number, H: number): void {
    this.W = W;
    this.H = H;
  }

  update(camX: number, camY: number, zoom: number, levelH: number, dt: number): void {
    this.t += dt;
    const off = camX * PARALLAX * zoom;
    const dy = -(camY - levelH / 2) * 0.12 * zoom;
    for (const b of this.blobs) {
      let x = (((b.x - off) % P) + P) % P;
      // 带子比屏幕宽：只画落在屏幕附近的
      if (x > this.W + b.r * 2) x -= P;
      const on = x > -b.r * 2 && x < this.W + b.r * 2;
      b.s.visible = on;
      if (!on) continue;
      if (b.steam) {
        // 热气：从下面往上飘一段，长大、变淡，再从下面冒出来
        const u = (this.t * 0.06 + b.phase / 6.28) % 1;
        b.s.position.set(x + Math.sin(this.t * 0.5 + b.phase) * 30, (b.y - u * 0.35) * this.H + dy);
        b.s.scale.set((b.r * (1 + u)) / PUFF_R);
        b.s.alpha = b.alpha * Math.sin(u * Math.PI);
        continue;
      }
      b.s.position.set(x, b.y * this.H + (this.still ? 0 : Math.sin(this.t * 0.4 + b.phase) * 8) + dy);
      b.s.scale.set(b.r / PUFF_R);
      b.s.alpha = b.alpha;
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
