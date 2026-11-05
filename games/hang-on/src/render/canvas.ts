/**
 * 开发用的 canvas 渲染：从原型 game.html 搬过来，读 Sim 的状态画画面。
 * 正式版（A3）换 Pixi；这里只求能看清抓点、深渊和 4 个人。
 */
import { CFG } from '../physics/config';
import type { Pt } from '../physics/level';
import type { Player, Sim, SimEvent } from '../physics/world';

export interface Camera {
  x: number;
  y: number;
  z: number;
  shake: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
}

const GLOVES = ['#63b3ed', '#f6ad55'];
const CONFETTI = ['#F28CA6', '#9BCF83', '#F8C56D', '#8EC5E8', '#fff6e9'];

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly cam: Camera = { x: 300, y: 500, z: 1, shake: 0 };
  private fx: Spark[] = [];
  private trails = new Map<number, { x: number; y: number; a: number }[]>();

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 把物理事件变成动效：抓上冒星、摔死抖镜头、过关撒纸屑。 */
  handleEvents(sim: Sim, events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'grab') {
        for (let i = 0; i < 6; i++) {
          this.fx.push({ x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, life: 0.35, color: '#fff6e9', r: 2 + Math.random() * 2 });
        }
      }
      if (ev.type === 'death') this.cam.shake = 10;
      if (ev.type === 'win') {
        const flag = sim.level.flag ?? { x: sim.level.goal.x + sim.level.goal.w / 2, y: sim.level.goal.y + sim.level.goal.h };
        for (let i = 0; i < 60; i++) {
          this.fx.push({ x: flag.x + 30, y: flag.y - 80, vx: (Math.random() - 0.5) * 600, vy: -Math.random() * 500, life: 1.2 + Math.random(), color: CONFETTI[i % 5] as string, r: 3 + Math.random() * 3 });
        }
      }
    }
  }

  reset(): void {
    this.trails.clear();
    this.fx = [];
  }

  updateCamera(sim: Sim, dt: number): void {
    const cam = this.cam;
    const level = sim.level;
    const ps = sim.players.filter((p) => !p.dead);
    const tx = ps.length ? ps.reduce((s, p) => s + p.body.x, 0) / ps.length : level.spawn.x;
    const ty = ps.length ? ps.reduce((s, p) => s + p.body.y, 0) / ps.length - 60 : level.spawn.y;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const z = Math.max(0.55, Math.min(1.15, Math.min(W / 900, H / 620)));
    cam.z += (z - cam.z) * Math.min(1, dt * 4);
    const halfW = W / 2 / cam.z;
    const halfH = H / 2 / cam.z;
    const cx = Math.max(halfW - 120, Math.min(level.w - halfW + 120, tx));
    const cy = Math.max(halfH, Math.min(level.h - halfH + 60, ty));
    cam.x += (cx - cam.x) * Math.min(1, dt * 5);
    cam.y += (cy - cam.y) * Math.min(1, dt * 5);
    cam.shake = Math.max(0, cam.shake - dt * 30);
  }

  /** 世界坐标 → 屏幕坐标（鼠标指向用）。 */
  toScreen(p: Pt): Pt {
    const { cam, canvas } = this;
    return { x: (p.x - cam.x) * cam.z + canvas.clientWidth / 2, y: (p.y - cam.y) * cam.z + canvas.clientHeight / 2 };
  }

  draw(sim: Sim, dt: number): void {
    const { ctx, cam } = this;
    const level = sim.level;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d2a4a');
    g.addColorStop(1, '#4a4f8c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this.hills(W, H, 0.25, '#2b3a6b', 0.62, 140);
    this.hills(W, H, 0.5, '#36508a', 0.74, 90);

    ctx.save();
    const sx = (Math.random() - 0.5) * cam.shake;
    const sy = (Math.random() - 0.5) * cam.shake;
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);

    // 终点和旗子
    const gz = level.goal;
    ctx.fillStyle = 'rgba(255, 220, 120, .10)';
    this.roundRect(gz.x, gz.y, gz.w, gz.h, 18);
    ctx.fill();
    const flag = level.flag ?? { x: gz.x + gz.w / 2, y: gz.y + gz.h };
    this.drawFlag(flag.x, flag.y);

    // 检查点
    (level.checkpoints ?? []).forEach((cp, i) => {
      const on = i <= sim.checkpoint;
      ctx.strokeStyle = on ? '#9BCF83' : 'rgba(255,246,233,.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cp.x, cp.y + 30);
      ctx.lineTo(cp.x, cp.y - 34);
      ctx.stroke();
      ctx.fillStyle = on ? '#9BCF83' : 'rgba(255,246,233,.35)';
      ctx.beginPath();
      ctx.moveTo(cp.x + 2, cp.y - 34);
      ctx.lineTo(cp.x + 30, cp.y - 24);
      ctx.lineTo(cp.x + 2, cp.y - 12);
      ctx.closePath();
      ctx.fill();
    });

    // 地形
    for (const r of level.rects) {
      if (r.kind === 'peg') {
        ctx.fillStyle = '#f3d9a4';
        this.roundRect(r.x, r.y, r.w, r.h, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        this.roundRect(r.x, r.y + r.h - 5, r.w, 5, 3);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = r.material === 'ice' ? '#7fb7d9' : '#6b3b2e';
      this.roundRect(r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.fillStyle = '#f5e2c2';
      this.roundRect(r.x + 2, r.y, r.w - 4, 14, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      this.roundRect(r.x, r.y + r.h - 16, r.w, 16, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = 0; i < Math.min(40, (r.w * r.h) / 9000); i++) {
        const px = r.x + ((i * 97) % r.w);
        const py = r.y + 24 + ((i * 53) % Math.max(1, r.h - 40));
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, 7);
        ctx.fill();
      }
    }
    for (const r of [...(level.fading ?? []), ...(level.springs ?? [])]) {
      ctx.fillStyle = 'rgba(245, 226, 194, .5)';
      this.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fill();
    }

    // 跷跷板、箱子
    for (const prop of sim.props) {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle);
      ctx.fillStyle = prop.kind === 'seesaw' ? '#caa06a' : '#d9a066';
      this.roundRect(-prop.w / 2, -prop.h / 2, prop.w, prop.h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      if (prop.kind === 'seesaw') {
        ctx.fillStyle = '#8c6a3c';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 7, 0, 7);
        ctx.fill();
      }
    }

    // 绳子
    for (const rope of sim.ropes) {
      ctx.strokeStyle = '#caa06a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(rope.pts[0]!.x, rope.pts[0]!.y);
      for (let i = 1; i < rope.pts.length; i++) ctx.lineTo(rope.pts[i]!.x, rope.pts[i]!.y);
      ctx.stroke();
      ctx.fillStyle = '#8c6a3c';
      ctx.beginPath();
      ctx.arc(rope.anchor.x, rope.anchor.y, 9, 0, 7);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#f5e2c2';
      ctx.beginPath();
      ctx.arc(rope.handle.x, rope.handle.y, 11, 0, 7);
      ctx.stroke();
    }

    for (const p of sim.players) this.drawPlayer(p);

    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i] as Spark;
      f.life -= dt;
      if (f.life <= 0) {
        this.fx.splice(i, 1);
        continue;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 900 * dt;
      ctx.globalAlpha = Math.max(0, f.life * 2.5);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private hills(W: number, H: number, par: number, color: string, yFrac: number, amp: number): void {
    const { ctx, cam } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    const base = H * yFrac;
    const off = -cam.x * par * cam.z;
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 40; x += 40) {
      const y = base + Math.sin((x - off) / 160) * amp * 0.35 + Math.sin((x - off) / 57) * amp * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  private drawFlag(x: number, y: number): void {
    const { ctx } = this;
    ctx.strokeStyle = '#f5e2c2';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 120);
    ctx.stroke();
    const wave = Math.sin(performance.now() / 180) * 6;
    ctx.fillStyle = '#ef5a5a';
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 118);
    ctx.quadraticCurveTo(x + 40, y - 112 + wave, x + 78, y - 104);
    ctx.lineTo(x + 3, y - 70);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6e9';
    ctx.font = '800 22px "Baloo 2", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('终', x + 34, y - 86);
  }

  private drawPlayer(p: Player): void {
    if (p.dead) return;
    const { ctx } = this;
    const b = p.body;
    const v = Math.hypot(b.vx, b.vy);
    let t = this.trails.get(p.id);
    if (!t) {
      t = [];
      this.trails.set(p.id, t);
    }
    t.push({ x: b.x, y: b.y, a: Math.min(1, v / 1400) });
    if (t.length > 14) t.shift();
    for (let i = 0; i < t.length; i++) {
      const q = t[i] as { x: number; y: number; a: number };
      if (q.a < 0.15) continue;
      ctx.globalAlpha = q.a * (i / t.length) * 0.35;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, CFG.bodyR * (0.4 + (0.6 * i) / t.length), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 面条胳膊和手套
    p.arms.forEach((arm, i) => {
      ctx.strokeStyle = '#3a2a2a';
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.noodle(arm.pts);
      ctx.stroke();
      ctx.strokeStyle = '#f6e7c8';
      ctx.lineWidth = 10;
      this.noodle(arm.pts);
      ctx.stroke();
      const h = arm.hand;
      ctx.fillStyle = '#3a2a2a';
      ctx.beginPath();
      ctx.arc(h.x, h.y, CFG.handR + 2.5, 0, 7);
      ctx.fill();
      ctx.fillStyle = GLOVES[i] as string;
      ctx.beginPath();
      ctx.arc(h.x, h.y, CFG.handR, 0, 7);
      ctx.fill();
      if (arm.grip) {
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, CFG.handR + 5 + Math.sin(arm.grip.t * 12) * 1.5, 0, 7);
        ctx.stroke();
      }
    });

    // 身体：沿速度方向拉长、落地压扁
    const sp = v / 120;
    const ang = Math.atan2(b.vy, b.vx);
    const stretch = Math.min(0.22, sp * 0.03);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    ctx.scale(1 + stretch, 1 - stretch);
    ctx.rotate(-ang);
    ctx.fillStyle = '#3a2a2a';
    ctx.beginPath();
    ctx.arc(0, 0, CFG.bodyR + 2.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, CFG.bodyR, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(-7, -9, 9, 5, -0.5, 0, 7);
    ctx.fill();
    // 脸：眼睛看向摇杆，嘴跟状态走
    const lx = p.aim.x * 4;
    const ly = p.aim.y * 3;
    const eyeY = -4;
    for (const ex of [-8, 8]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 5.5, p.face === 'scream' ? 7 : 6, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#2a1f3a';
      ctx.beginPath();
      ctx.arc(ex + lx, eyeY + ly, p.face === 'scream' ? 2 : 3, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = '#2a1f3a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.fillStyle = '#2a1f3a';
    ctx.beginPath();
    if (p.face === 'scream') {
      ctx.ellipse(0, 9, 5, 7, 0, 0, 7);
      ctx.fill();
    } else if (p.face === 'grab') {
      ctx.moveTo(-6, 8);
      ctx.quadraticCurveTo(0, 14, 6, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-13, -12);
      ctx.lineTo(-5, -9);
      ctx.moveTo(13, -12);
      ctx.lineTo(5, -9);
      ctx.stroke();
    } else if (p.face === 'fly') {
      ctx.ellipse(0, 9, 3.5, 4.5, 0, 0, 7);
      ctx.fill();
    } else if (p.face === 'win') {
      ctx.moveTo(-8, 7);
      ctx.quadraticCurveTo(0, 17, 8, 7);
      ctx.stroke();
    } else {
      ctx.moveTo(-5, 9);
      ctx.quadraticCurveTo(0, 12, 5, 9);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(240, 90, 110, .35)';
    ctx.beginPath();
    ctx.arc(-14, 4, 4, 0, 7);
    ctx.arc(14, 4, 4, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,246,233,.85)';
    ctx.font = '700 11px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`P${p.id + 1}`, b.x, b.y - CFG.bodyR - 10);
  }

  private noodle(pts: Pt[]): void {
    const { ctx } = this;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i] as Pt;
      const b = pts[i + 1] as Pt;
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const l = pts[pts.length - 1] as Pt;
    ctx.lineTo(l.x, l.y);
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
