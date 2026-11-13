/**
 * 糯米团（A3）：一个玩家的画法。身体是物理驱动的圆，脸、帽子、眼镜程序画；胳膊是两条面条，每帧重画。
 * 动效都在这里：沿速度方向拉伸、落地压扁、抓上一颤、复活从天上掉、眨眼、眼睛跟摇杆、队友摔死时冒汗。
 */
import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { CFG } from '../physics/config';
import type { Pt } from '../physics/level';
import type { PlayerView } from './view';
import { ARM_COLORS, DEFAULT_LOOK, type Look } from '../look';
import { CREAM, GLOVES, INK, OUTLINE, hex } from './art';

const R = CFG.bodyR;
const NAME_STYLE: TextStyleOptions = {
  fontFamily: '"Noto Sans SC", system-ui, sans-serif',
  fontSize: 12,
  fontWeight: '700',
  fill: CREAM,
  stroke: { color: INK, width: 3, join: 'round' },
  align: 'center',
};

const ease = {
  inQuad: (t: number): number => t * t,
};

export class Dumpling {
  readonly view = new Container();
  private readonly arms = new Graphics();
  private readonly shadow = new Graphics();
  private readonly bodyC = new Container();
  private readonly stretchC = new Container();
  private readonly inner = new Container();
  private readonly body = new Graphics();
  private readonly face = new Graphics();
  /** 脸上的小东西（胡子、雀斑、创可贴），换装时画一次。 */
  private readonly extras = new Graphics();
  private readonly glasses = new Graphics();
  private readonly hat = new Graphics();
  private readonly label: Text;

  private color = '#ffffff';
  private look: Look = DEFAULT_LOOK;
  /** 落地压扁 1 → 0。 */
  private squash = 0;
  /** 抓上一颤 1 → 0，和颤的方向。 */
  private pulse = 0;
  private pulseDir: Pt = { x: 0, y: 0 };
  /** 复活：从天上掉下来 1 → 0。 */
  private drop = 0;
  /** 冒汗还剩几秒。 */
  private sweat = 0;
  private blinkIn = 2 + Math.random() * 3;
  private blink = 0;
  /** 过关时一起跳的相位。 */
  private hop = 0;
  private reduced = false;
  private faceKey = '';

  constructor(name: string, color: string, look: Look, reducedMotion: boolean) {
    this.reduced = reducedMotion;
    this.label = new Text({ text: name, style: NAME_STYLE, resolution: 2 });
    this.label.anchor.set(0.5, 1);
    this.inner.addChild(this.body, this.face, this.extras, this.glasses, this.hat);
    this.stretchC.addChild(this.inner);
    this.bodyC.addChild(this.stretchC);
    this.view.addChild(this.shadow, this.arms, this.bodyC, this.label);
    this.setColor(color);
    this.setLook(look);
  }

  setName(name: string): void {
    if (this.label.text !== name) this.label.text = name;
  }

  setColor(color: string): void {
    if (this.color === color) return;
    this.color = color;
    this.drawBody();
    this.drawHat();
  }

  setLook(look: Look): void {
    this.look = look;
    this.drawHat();
    this.drawGlasses();
    this.drawExtras();
    this.faceKey = '';
  }

  /** 物理事件 → 动效。 */
  onGrab(at: Pt, body: Pt): void {
    this.pulse = 1;
    const d = Math.hypot(at.x - body.x, at.y - body.y) || 1;
    this.pulseDir = { x: (at.x - body.x) / d, y: (at.y - body.y) / d };
  }
  onLand(speed: number): void {
    this.squash = Math.min(1, speed / 900);
  }
  onRespawn(): void {
    this.drop = this.reduced ? 0 : 1;
    this.squash = 0;
  }
  onMateDied(): void {
    this.sweat = 1.6;
  }
  onBounce(): void {
    this.squash = -0.8; // 负的 = 拉长
  }

  /** 每帧：读玩家状态，摆位置，重画胳膊和脸。 */
  /** won：这个人赢了（一起跳）；slips：坐不住，手抓久了要抖、圈变红。 */
  update(p: PlayerView, dt: number, won: boolean, time: number, slips = false): void {
    const b = p.body;
    this.squash = this.squash > 0 ? Math.max(0, this.squash - dt * 4.5) : Math.min(0, this.squash + dt * 4.5);
    this.pulse = Math.max(0, this.pulse - dt * 5);
    this.sweat = Math.max(0, this.sweat - dt);
    if (this.drop > 0) {
      this.drop = Math.max(0, this.drop - dt / 0.45);
      if (this.drop === 0) this.squash = 0.9;
    }
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.12;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);

    // 摔死：前 0.45 秒还画（沉进汤里），之后藏起来
    const sinking = p.dead && p.deadT < 0.45;
    this.view.visible = !p.dead || sinking;
    if (!this.view.visible) return;

    // 复活：从天上掉，影子先到；胳膊跟着身体一起抬
    const dropY = this.drop > 0 ? -280 * ease.inQuad(this.drop) : 0;
    this.arms.position.y = dropY;
    this.shadow.visible = this.drop > 0;
    if (this.drop > 0) {
      const k = 1 - this.drop;
      this.shadow.clear().ellipse(b.x, b.y + R - 2, R * (0.5 + 0.5 * k), R * (0.18 + 0.12 * k)).fill({ color: 0x000000, alpha: 0.25 * k });
    }

    // 过关：一起跳
    if (won) {
      this.hop += dt * 7;
      const h = Math.abs(Math.sin(this.hop + p.id * 0.9)) * 26;
      this.bodyC.position.set(b.x, b.y - h + dropY);
    } else {
      this.hop = 0;
      this.bodyC.position.set(b.x + this.pulseDir.x * 3 * this.pulse, b.y + this.pulseDir.y * 3 * this.pulse + dropY);
    }

    // 挤压拉伸：沿速度方向拉长，落地压扁，弹簧拉长
    const v = Math.hypot(b.vx, b.vy);
    const stretch = this.reduced ? 0 : Math.min(0.22, (v / 120) * 0.03);
    const sq = this.reduced ? 0 : this.squash;
    const ang = Math.atan2(b.vy, b.vx);
    if (sq > 0.02) {
      this.stretchC.rotation = 0;
      this.inner.rotation = 0;
      this.stretchC.scale.set(1 + 0.28 * sq, 1 - 0.32 * sq);
      // 压扁时底边不动
      this.stretchC.position.set(0, R * 0.32 * sq);
    } else if (sq < -0.02) {
      this.stretchC.rotation = 0;
      this.inner.rotation = 0;
      this.stretchC.scale.set(1 + 0.25 * sq, 1 - 0.3 * sq);
      this.stretchC.position.set(0, 0);
    } else {
      this.stretchC.rotation = ang;
      this.inner.rotation = -ang;
      this.stretchC.scale.set(1 + stretch + 0.08 * this.pulse, 1 - stretch + 0.08 * this.pulse);
      this.stretchC.position.set(0, 0);
    }

    this.drawArms(p, slips);
    this.drawFace(p, time);
    this.label.position.set(b.x, this.bodyC.y - R - this.hatHeight() - 4);
    this.label.alpha = sinking ? 0 : 1;
  }

  private hatHeight(): number {
    switch (this.look.hat) {
      case 'chef':
        return 26;
      case 'crown':
        return 16;
      case 'bun':
        return 18;
      case 'beanie':
        return 18;
      case 'halo':
        return 20;
      case 'ears':
        return 16;
      case 'knob':
        return 10;
      case 'bow':
        return 10;
      default:
        return 0;
    }
  }

  // ---------------------------------------------------------------- 画

  private drawBody(): void {
    const g = this.body;
    g.clear();
    g.circle(0, 0, R + 2.5).fill(OUTLINE);
    g.circle(0, 0, R).fill(this.color);
    // 糯米的糯：一点点半透明的白，像粉
    g.circle(0, 0, R - 1).fill({ color: 0xffffff, alpha: 0.12 });
    g.ellipse(-7, -10, 9, 5).fill({ color: 0xffffff, alpha: 0.4 });
    g.circle(-14, 4, 4.2).fill({ color: 0xf05a6e, alpha: 0.35 });
    g.circle(14, 4, 4.2).fill({ color: 0xf05a6e, alpha: 0.35 });
  }

  private drawArms(p: PlayerView, slips: boolean): void {
    const g = this.arms;
    g.clear();
    p.arms.forEach((arm, i) => {
      // 坐不住：抓了 lastGripWarn 秒起手开始抖、圈变红，到 lastGripMax 就滑（减弱动效时只变红）
      const warn = slips && arm.grip ? Math.min(1, Math.max(0, (arm.grip.t - CFG.lastGripWarn) / (CFG.lastGripMax - CFG.lastGripWarn))) : 0;
      const jit = warn > 0 && !this.reduced ? warn * 3 : 0;
      const pts = arm.pts;
      if (pts.length >= 2) {
        this.noodle(g, pts);
        g.stroke({ width: 15, color: OUTLINE, cap: 'round', join: 'round' });
        this.noodle(g, pts);
        g.stroke({ width: 10, color: ARM_COLORS[this.look.arms] ?? ARM_COLORS.noodle, cap: 'round', join: 'round' });
      }
      const h = jit ? { x: arm.hand.x + (Math.random() - 0.5) * jit, y: arm.hand.y + (Math.random() - 0.5) * jit } : arm.hand;
      g.circle(h.x, h.y, CFG.handR + 2.5).fill(OUTLINE);
      g.circle(h.x, h.y, CFG.handR).fill(GLOVES[i] as string);
      g.circle(h.x - 3, h.y - 3, 3).fill({ color: 0xffffff, alpha: 0.35 });
      if (arm.grip) {
        const r = CFG.handR + 5 + Math.sin(arm.grip.t * (12 + warn * 18)) * 1.5;
        g.circle(h.x, h.y, r).stroke({ width: 2 + warn * 1.5, color: warn > 0 ? 0xff6b5a : 0xffffff, alpha: 0.9 });
      }
    });
  }

  private noodle(g: Graphics, pts: Pt[]): void {
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i] as Pt;
      const b = pts[i + 1] as Pt;
      g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const l = pts[pts.length - 1] as Pt;
    g.lineTo(l.x, l.y);
  }

  private drawFace(p: PlayerView, time: number): void {
    // 眼睛跟摇杆；没推摇杆就看向飞的方向
    const aimed = p.aim.x !== 0 || p.aim.y !== 0;
    const v = Math.hypot(p.body.vx, p.body.vy);
    const lx = aimed ? p.aim.x * 4 : v > 200 ? (p.body.vx / v) * 3 : 0;
    const ly = aimed ? p.aim.y * 3 : v > 200 ? (p.body.vy / v) * 2 : 0;
    const blink = this.blink > 0 && this.look.eyes !== 'happy';
    const key = `${p.face}|${lx.toFixed(1)}|${ly.toFixed(1)}|${blink}|${this.sweat > 0}|${this.look.eyes}|${Math.floor(time * 6) % 2}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    const g = this.face;
    g.clear();
    const eyeY = -4;
    const big = this.look.eyes === 'big';
    const rx = big ? 7 : 5.5;
    const ry = p.face === 'scream' ? (big ? 8.5 : 7) : big ? 7.5 : 6;
    for (const side of [-1, 1]) {
      const ex = side * 8;
      const style = this.look.eyes;
      if ((style === 'happy' && p.face !== 'scream') || (style === 'wink' && side === 1 && p.face !== 'scream')) {
        // 眯眯眼：一道弯弧
        g.moveTo(ex - 5, eyeY + 1).quadraticCurveTo(ex, eyeY - 5, ex + 5, eyeY + 1).stroke({ width: 2.4, color: INK, cap: 'round' });
        continue;
      }
      if (blink) {
        g.moveTo(ex - 5, eyeY).lineTo(ex + 5, eyeY).stroke({ width: 2.2, color: INK, cap: 'round' });
        continue;
      }
      g.ellipse(ex, eyeY, rx, ry).fill(0xffffff);
      const pr = p.face === 'scream' ? 2 : big ? 3.6 : 3;
      g.circle(ex + lx, eyeY + ly, pr).fill(INK);
      g.circle(ex + lx - 1, eyeY + ly - 1, pr * 0.35).fill(0xffffff);
      if (style === 'sleepy') g.rect(ex - rx - 1, eyeY - ry - 1, rx * 2 + 2, ry * 0.9).fill(this.color);
    }
    // 眉毛和嘴
    if (p.face === 'scream') {
      g.ellipse(0, 9, 5.5, 7.5).fill(INK);
      g.ellipse(0, 12, 3, 2.5).fill(0xe8413c);
      g.moveTo(-13, -15).lineTo(-5, -12).moveTo(13, -15).lineTo(5, -12).stroke({ width: 2.2, color: INK, cap: 'round' });
    } else if (p.face === 'grab') {
      // 咬牙：扁扁的嘴，几道竖线
      g.roundRect(-7, 6, 14, 6, 3).fill(0xffffff).stroke({ width: 1.6, color: INK });
      g.moveTo(-3, 6).lineTo(-3, 12).moveTo(1, 6).lineTo(1, 12).moveTo(4.5, 6).lineTo(4.5, 12).stroke({ width: 1.2, color: INK });
      g.moveTo(-13, -12).lineTo(-5, -9).moveTo(13, -12).lineTo(5, -9).stroke({ width: 2.2, color: INK, cap: 'round' });
    } else if (p.face === 'fly') {
      g.ellipse(0, 9, 3.8, 4.8).fill(INK);
    } else if (p.face === 'win') {
      g.moveTo(-8, 6).quadraticCurveTo(0, 18, 8, 6).closePath().fill(INK);
      g.moveTo(-5, 10).quadraticCurveTo(0, 15, 5, 10).closePath().fill(0xe8413c);
    } else {
      g.moveTo(-5, 9).quadraticCurveTo(0, 12.5, 5, 9).stroke({ width: 2.2, color: INK, cap: 'round' });
    }
    if (this.sweat > 0) {
      const t = Math.floor(time * 6) % 2;
      for (const side of [-1, 1]) {
        const x = side * (R - 4);
        const y = -14 + t * 2;
        g.moveTo(x, y - 6).quadraticCurveTo(x + 3.5, y, x, y + 3).quadraticCurveTo(x - 3.5, y, x, y - 6).fill(0x8ec5e8);
      }
    }
  }

  private drawExtras(): void {
    const g = this.extras;
    g.clear();
    switch (this.look.face) {
      case 'mustache':
        // 两撇往上翘的胡子，正好压在嘴上面
        g.moveTo(0, 4).quadraticCurveTo(-5, 0.5, -10, 4.5).quadraticCurveTo(-12.5, 7.5, -9, 8).quadraticCurveTo(-6, 6, 0, 7).closePath().fill(0x3a2a2a);
        g.moveTo(0, 4).quadraticCurveTo(5, 0.5, 10, 4.5).quadraticCurveTo(12.5, 7.5, 9, 8).quadraticCurveTo(6, 6, 0, 7).closePath().fill(0x3a2a2a);
        break;
      case 'freckles':
        for (const s of [-1, 1]) {
          for (const [x, y] of [
            [12, 6],
            [15.5, 8.5],
            [10.5, 9.5],
            [16, 4.5],
          ] as const) {
            g.circle(s * x, y, 1.2).fill({ color: 0x9a5a3a, alpha: 0.75 });
          }
        }
        break;
      case 'bandage': {
        // 斜贴在右脸上
        const cx = 12;
        const cy = 7;
        const a = 0.45;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const pt = (x: number, y: number): number[] => [cx + x * c - y * sn, cy + x * sn + y * c];
        const band = [...pt(-8, -3), ...pt(8, -3), ...pt(8, 3), ...pt(-8, 3)];
        g.poly(band).fill(0xf3d0a0).stroke({ width: 1.2, color: 0xb08a60, join: 'round' });
        const pad = [...pt(-3, -2.4), ...pt(3, -2.4), ...pt(3, 2.4), ...pt(-3, 2.4)];
        g.poly(pad).fill(0xfbe6c8);
        for (const [x, y] of [
          [-5.5, 0],
          [5.5, 0],
        ] as const) {
          const [px, py] = pt(x, y) as [number, number];
          g.circle(px, py, 0.7).fill(0xb08a60);
        }
        break;
      }
      case 'beard':
        // 下半张脸一圈，从两颊绕到下巴，嘴露在外面
        g.arc(0, 0, R - 0.5, 0.25, Math.PI - 0.25).arc(0, 3, R - 8, Math.PI - 0.45, 0.45, true).closePath().fill(0x5a3a2a);
        g.arc(0, 3, R - 8, Math.PI - 0.45, 0.45, true).stroke({ width: 1.2, color: 0x3a2418, alpha: 0.6 });
        break;
      default:
        break;
    }
  }

  private drawGlasses(): void {
    const g = this.glasses;
    g.clear();
    const eyeY = -4;
    switch (this.look.glasses) {
      case 'round':
        g.circle(-8, eyeY, 8).stroke({ width: 2.2, color: INK });
        g.circle(8, eyeY, 8).stroke({ width: 2.2, color: INK });
        g.moveTo(-1, eyeY - 1).lineTo(1, eyeY - 1).stroke({ width: 2.2, color: INK });
        g.moveTo(-16, eyeY - 2).lineTo(-23, eyeY - 5).moveTo(16, eyeY - 2).lineTo(23, eyeY - 5).stroke({ width: 2, color: INK, cap: 'round' });
        break;
      case 'shades':
        g.roundRect(-16, eyeY - 6, 14, 11, 4).fill(INK);
        g.roundRect(2, eyeY - 6, 14, 11, 4).fill(INK);
        g.moveTo(-2, eyeY - 3).lineTo(2, eyeY - 3).stroke({ width: 2.2, color: INK });
        g.moveTo(-13, eyeY - 4).lineTo(-6, eyeY - 4).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5, cap: 'round' });
        g.moveTo(5, eyeY - 4).lineTo(12, eyeY - 4).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5, cap: 'round' });
        break;
      case 'monocle':
        g.circle(8, eyeY, 8.5).stroke({ width: 2.2, color: 0xf8c56d });
        g.moveTo(14, eyeY + 6).quadraticCurveTo(20, eyeY + 14, 18, eyeY + 24).stroke({ width: 1.4, color: 0xf8c56d });
        break;
      case 'star':
        g.star(-8, eyeY, 5, 9.5, 4.5).stroke({ width: 2, color: 0xf28ca6, join: 'round' });
        g.star(8, eyeY, 5, 9.5, 4.5).stroke({ width: 2, color: 0xf28ca6, join: 'round' });
        g.moveTo(-1, eyeY - 2).lineTo(1, eyeY - 2).stroke({ width: 2, color: 0xf28ca6 });
        break;
      default:
        break;
    }
  }

  private drawHat(): void {
    const g = this.hat;
    g.clear();
    const top = -R;
    const body = hex(this.color);
    switch (this.look.hat) {
      case 'knob':
        // 瓜皮帽：深色半圆加金边，顶上一颗红珠
        g.moveTo(-R + 3, top + 12).arc(0, top + 12, R - 3, Math.PI, 0).closePath().fill(0x2b2f5c).stroke({ width: 2.5, color: OUTLINE });
        g.moveTo(-R + 3, top + 12).lineTo(R - 3, top + 12).stroke({ width: 3, color: 0xf8c56d });
        g.circle(0, top - 10, 4).fill(0xe8413c).stroke({ width: 1.5, color: OUTLINE });
        break;
      case 'chef':
        g.roundRect(-13, top - 2, 26, 10, 3).fill(0xffffff).stroke({ width: 2.5, color: OUTLINE });
        g.circle(-10, top - 12, 9).fill(0xffffff).stroke({ width: 2.5, color: OUTLINE });
        g.circle(10, top - 12, 9).fill(0xffffff).stroke({ width: 2.5, color: OUTLINE });
        g.circle(0, top - 18, 11).fill(0xffffff).stroke({ width: 2.5, color: OUTLINE });
        g.circle(-10, top - 12, 8).fill(0xffffff);
        g.circle(10, top - 12, 8).fill(0xffffff);
        g.circle(0, top - 18, 10).fill(0xffffff);
        g.roundRect(-13, top - 2, 26, 10, 3).fill(0xffffff);
        break;
      case 'bow':
        g.moveTo(12, top + 6).lineTo(0, top + 1).lineTo(12, top - 6).closePath().fill(0xe8413c).stroke({ width: 2, color: OUTLINE, join: 'round' });
        g.moveTo(12, top + 6).lineTo(24, top + 1).lineTo(12, top - 6).closePath().fill(0xe8413c).stroke({ width: 2, color: OUTLINE, join: 'round' });
        g.circle(12, top, 3.5).fill(0xffd166).stroke({ width: 1.5, color: OUTLINE });
        break;
      case 'crown':
        g.moveTo(-14, top + 6).lineTo(-14, top - 10).lineTo(-7, top - 2).lineTo(0, top - 14).lineTo(7, top - 2).lineTo(14, top - 10).lineTo(14, top + 6).closePath().fill(0xf8c56d).stroke({ width: 2.2, color: OUTLINE, join: 'round' });
        g.circle(-7, top + 1, 2).fill(0xe8413c);
        g.circle(7, top + 1, 2).fill(0x63b3ed);
        g.circle(0, top - 4, 2).fill(0x9bcf83);
        break;
      case 'ears':
        for (const s of [-1, 1]) {
          g.moveTo(s * 8, top + 6).lineTo(s * 20, top - 12).lineTo(s * 22, top + 10).closePath().fill(body).stroke({ width: 2.5, color: OUTLINE, join: 'round' });
          g.moveTo(s * 11, top + 5).lineTo(s * 18, top - 6).lineTo(s * 19, top + 7).closePath().fill(0xf6a5b5);
        }
        break;
      case 'bun':
        g.moveTo(-R + 2, top + 10).arc(0, top + 10, R - 2, Math.PI, 0).closePath().fill(0x3a2a2a);
        g.circle(0, top - 8, 9).fill(0x3a2a2a).stroke({ width: 2, color: OUTLINE });
        g.circle(0, top - 8, 9).stroke({ width: 1.5, color: 0x6b4a3a, alpha: 0.6 });
        g.moveTo(-6, top + 2).lineTo(-4, top - 1).stroke({ width: 2, color: 0xe8413c });
        break;
      case 'beanie':
        g.moveTo(-R + 2, top + 10).arc(0, top + 10, R - 2, Math.PI, 0).closePath().fill(0x5a6ad8).stroke({ width: 2.5, color: OUTLINE });
        g.roundRect(-R + 2, top + 6, (R - 2) * 2, 7, 3).fill(0x4553b8).stroke({ width: 2, color: OUTLINE });
        for (let x = -R + 8; x < R - 4; x += 6) g.moveTo(x, top + 7).lineTo(x, top + 12).stroke({ width: 1.2, color: 0x2b2f5c, alpha: 0.6 });
        g.circle(0, top - 13, 5.5).fill(0xfff6e9).stroke({ width: 2, color: OUTLINE });
        break;
      case 'halo':
        g.ellipse(0, top - 12, 15, 5).stroke({ width: 3.5, color: 0xffd166 });
        g.ellipse(0, top - 12, 15, 5).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
        break;
      default:
        break;
    }
  }
}
