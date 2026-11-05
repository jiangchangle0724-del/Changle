/**
 * 粒子（A3）：一个对象池，一张图集，Sprite 自己批。星星、纸屑、水花、雾团、气泡、雨点都走这里。
 * 每个粒子只有位置、速度、寿命、转速、重力和缩放曲线，没有别的。
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import type { ParticleFrames } from './art';

export interface Burst {
  x: number;
  y: number;
  n: number;
  texture: keyof ParticleFrames;
  colors: number[];
  /** 速度范围（px/s），方向：angle ± spread。 */
  speed: [number, number];
  angle?: number;
  spread?: number;
  life: [number, number];
  size: [number, number];
  gravity?: number;
  /** 寿命内的缩放：1 不变，0 缩到没有，> 1 长大。 */
  grow?: number;
  spin?: number;
  /** 空气阻力（每秒衰减比例）。 */
  drag?: number;
  alpha?: number;
  blend?: 'normal' | 'add';
  /** 0..1：正数把粒子出生点在 r 半径内撒开。 */
  jitter?: number;
  /** 竖着拉长几倍（雨丝），并且转到和飞行方向一致。 */
  stretch?: number;
}

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
  grow: number;
  spin: number;
  drag: number;
  size: number;
  alpha: number;
  stretch: number;
}

export class Particles {
  readonly view = new Container();
  private pool: Sprite[] = [];
  private live: P[] = [];
  /** 上限，再多就丢最老的。减弱动效时主机会把它调小。 */
  cap = 600;

  constructor(private readonly frames: ParticleFrames) {}

  get count(): number {
    return this.live.length;
  }

  burst(b: Burst): void {
    const spread = b.spread ?? Math.PI;
    const base = b.angle ?? -Math.PI / 2;
    for (let i = 0; i < b.n; i++) {
      if (this.live.length >= this.cap) this.kill(0);
      const s = this.pool.pop() ?? new Sprite();
      s.texture = this.frames[b.texture] as Texture;
      s.anchor.set(0.5);
      s.tint = b.colors[i % b.colors.length] ?? 0xffffff;
      s.blendMode = b.blend ?? 'normal';
      const j = (b.jitter ?? 0) * 20;
      s.position.set(b.x + (Math.random() - 0.5) * j, b.y + (Math.random() - 0.5) * j);
      const a = base + (Math.random() - 0.5) * 2 * spread;
      const v = b.speed[0] + Math.random() * (b.speed[1] - b.speed[0]);
      const size = (b.size[0] + Math.random() * (b.size[1] - b.size[0])) / 64;
      const stretch = b.stretch ?? 1;
      s.scale.set(size, size * stretch);
      s.rotation = stretch !== 1 ? a + Math.PI / 2 : Math.random() * 7;
      s.alpha = b.alpha ?? 1;
      s.visible = true;
      this.view.addChild(s);
      const life = b.life[0] + Math.random() * (b.life[1] - b.life[0]);
      this.live.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, g: b.gravity ?? 0, grow: b.grow ?? 1, spin: (b.spin ?? 0) * (Math.random() - 0.5) * 2, drag: b.drag ?? 0, size, alpha: b.alpha ?? 1, stretch });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i] as P;
      p.life -= dt;
      if (p.life <= 0) {
        this.kill(i);
        continue;
      }
      p.vy += p.g * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      const s = p.s;
      s.x += p.vx * dt;
      s.y += p.vy * dt;
      s.rotation += p.spin * dt;
      const t = p.life / p.max; // 1 → 0
      const sc = p.size * (1 + (p.grow - 1) * (1 - t));
      s.scale.set(sc, sc * p.stretch);
      s.alpha = p.alpha * Math.min(1, t * 3);
    }
  }

  clear(): void {
    while (this.live.length) this.kill(this.live.length - 1);
  }

  private kill(i: number): void {
    const p = this.live[i] as P;
    this.live.splice(i, 1);
    this.view.removeChild(p.s);
    p.s.visible = false;
    this.pool.push(p.s);
  }
}
