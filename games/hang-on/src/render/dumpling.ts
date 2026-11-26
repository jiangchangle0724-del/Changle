/**
 * 糯米团（A3）：一个玩家的画法。身体是物理驱动的圆，脸、帽子、眼镜程序画；胳膊是两条面条，每帧重画。
 * 动效都在这里：沿速度方向拉伸、落地压扁、抓上一颤、复活从天上掉、眨眼、眼睛跟摇杆、队友摔死时冒汗。
 * A14 的表情：被摆锤撞了晕（转圈的眼睛、头上转星星），底下的水快淹到了吓（瞪眼、小嘴），手酸了累（耷拉眼皮、
 * 喘），在风里眯眼、身子往风那边歪，过检查点乐一下。
 */
import { Container, FillGradient, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { CFG } from '../physics/config';
import type { Pt } from '../physics/level';
import type { PlayerView } from './view';
import { ARM_COLORS, DEFAULT_LOOK, type Look } from '../look';
import { CREAM, GLOVES, INK, OUTLINE, hex } from './art';
import { pickExpression, type Expr, type Mood } from './mood';

const R = CFG.bodyR;
/** 表情气泡里的字（11-25）。 */
/** 臭气的黄绿（11-25 放屁键）：烟团和脸边那两道一个颜色。 */
export const STINK = 0xa8b85c;
const BUBBLE_STYLE: TextStyleOptions = {
  fontFamily: '"Noto Sans SC", system-ui, sans-serif',
  fontSize: 15,
  fontWeight: '800',
  fill: INK,
  align: 'center',
};
/** 气泡挂到最后这么多秒开始淡。 */
const BUBBLE_FADE = 0.4;

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

/** 晕了多久、乐多久（秒）。 */
const DIZZY_S = 1.3;
const CHEER_S = 1.1;

/** 五角星的点（外圈 r、内圈 r × 0.45），从正上方开始。 */
function starPoints(cx: number, cy: number, r: number, turn = 0): number[] {
  const pts: number[] = [];
  for (let k = 0; k < 10; k++) {
    const a = turn - Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return pts;
}

/**
 * 2.5D 的光影（A8）：光从左上来。身体是个球：左上一团亮、右下边上暗下去，右下沿着边一道反光。
 * 渐变用白和黑的半透明叠在本色上，换什么颜色都对；local 坐标，所有糯米团共用这两个。
 * Pixi 画放射渐变时先拿最后一个颜色铺满整张图，所以最后一个颜色必须是透明的，
 * 不然整个圆都蒙上那层颜色：暗的那圈放在 0.96（圆上离光最远的点），1 再回到透明。
 */
let LIT: FillGradient | null = null;
let SHADE: FillGradient | null = null;
function bodyGradients(): { lit: FillGradient; shade: FillGradient } {
  LIT ??= new FillGradient({
    type: 'radial',
    center: { x: 0.34, y: 0.28 },
    innerRadius: 0,
    outerCenter: { x: 0.4, y: 0.34 },
    outerRadius: 0.6,
    colorStops: [
      { offset: 0, color: 'rgba(255,255,255,0.55)' },
      { offset: 0.35, color: 'rgba(255,255,255,0.2)' },
      { offset: 1, color: 'rgba(255,255,255,0)' },
    ],
  });
  SHADE ??= new FillGradient({
    type: 'radial',
    center: { x: 0.4, y: 0.36 },
    innerRadius: 0,
    outerCenter: { x: 0.4, y: 0.36 },
    outerRadius: 0.7,
    colorStops: [
      { offset: 0, color: 'rgba(20,10,30,0)' },
      { offset: 0.5, color: 'rgba(20,10,30,0)' },
      { offset: 0.96, color: 'rgba(20,10,30,0.34)' },
      { offset: 1, color: 'rgba(20,10,30,0)' },
    ],
  });
  return { lit: LIT, shade: SHADE };
}

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
  /** 道具（A9）：冻住时的冰块、撑开的荷叶，压在人上面。 */
  private readonly itemG = new Graphics();
  private itemKey = '';
  /** 晕的时候头顶转的星星（A14），每帧画。 */
  private readonly moodG = new Graphics();
  private readonly label: Text;
  /** 表情（11-25）：头顶的气泡，挂 EMOTE_SHOW_S 秒，最后 0.4 秒淡掉；刚冒出来弹一下。 */
  private readonly bubble = new Container();
  private readonly bubbleBg = new Graphics();
  private readonly bubbleText: Text;
  private bubbleT = 0;
  private bubbleAge = 0;

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
  /** 被摆锤撞晕还剩几秒、过检查点乐还剩几秒、在风里歪了多少（A14）。 */
  private dizzy = 0;
  private cheer = 0;
  /** 旁边有人放屁（11-25），还要皱几秒。 */
  private stink = 0;
  private lean = 0;
  /** 帽子跟着身子晚半拍（A14b）：偏了多少、晃得多快（弹簧）。 */
  private hatO = { x: 0, y: 0 };
  private hatV = { x: 0, y: 0 };
  /** 站着不动多久了（A14b：站久了喘气、眼睛四处看）。 */
  private still = 0;
  private reduced = false;
  private faceKey = '';

  constructor(name: string, color: string, look: Look, reducedMotion: boolean) {
    this.reduced = reducedMotion;
    this.label = new Text({ text: name, style: NAME_STYLE, resolution: 2 });
    this.label.anchor.set(0.5, 1);
    this.bubbleText = new Text({ text: '', style: BUBBLE_STYLE, resolution: 2 });
    this.bubbleText.anchor.set(0.5, 0.5);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.visible = false;
    this.inner.addChild(this.body, this.face, this.extras, this.glasses, this.hat);
    this.stretchC.addChild(this.inner);
    this.bodyC.addChild(this.stretchC);
    this.view.addChild(this.shadow, this.arms, this.bodyC, this.itemG, this.moodG, this.label, this.bubble);
    this.setColor(color);
    this.setLook(look);
  }

  /** 表情（11-25）：头顶冒一句，挂 seconds 秒；再来一句就换掉。 */
  emote(text: string, seconds: number): void {
    this.bubbleText.text = text;
    const w = Math.max(48, Math.ceil(this.bubbleText.width) + 22);
    const h = 30;
    this.bubbleText.position.set(0, -h / 2 - 1);
    const g = this.bubbleBg.clear();
    // 尾巴朝下指着人，先画尾巴再画圆角框盖住接缝
    g.poly([-7, -3, 0, 9, 7, -3]).fill(hex(CREAM)).stroke({ color: hex(INK), width: 2.5, join: 'round' });
    g.roundRect(-w / 2, -h, w, h, 13).fill(hex(CREAM)).stroke({ color: hex(INK), width: 2.5 });
    g.rect(-5.5, -3.5, 11, 4).fill(hex(CREAM));
    this.bubbleT = seconds;
    this.bubbleAge = 0;
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
  /** 被摆锤撞了（A14）：一下压扁，晕一会儿。 */
  onBonk(): void {
    this.squash = 1;
    this.dizzy = DIZZY_S;
  }
  /** 有人过了检查点（A14）：大家乐一下。 */
  onCheer(): void {
    this.cheer = CHEER_S;
  }
  /** 自己放了个屁（11-25）：身子一抖，舒服地乐一下。 */
  onFart(): void {
    this.squash = -0.35;
    this.cheer = Math.max(this.cheer, 0.7);
  }
  /** 旁边有人放屁（11-25）：眯眼皱嘴一会儿。 */
  onStink(seconds: number): void {
    this.stink = Math.max(this.stink, seconds);
  }

  /** 每帧：读玩家状态，摆位置，重画胳膊和脸。 */
  /** won：这个人赢了（一起跳）；slips：坐不住，手抓久了要抖、圈变红。 */
  update(p: PlayerView, dt: number, won: boolean, time: number, slips = false, mood: Mood = {}): void {
    const b = p.body;
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.cheer = Math.max(0, this.cheer - dt);
    this.stink = Math.max(0, this.stink - dt);
    // 风里身子往风那边歪一点，风停了慢慢回正（减弱动效时不歪）
    const leanTo = this.reduced || p.dead ? 0 : (mood.lean ?? 0) * 0.2;
    this.lean += (leanTo - this.lean) * Math.min(1, dt * 6);
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
    if (!this.view.visible) {
      this.dizzy = 0;
      return;
    }

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
    this.still = v < 20 && !p.dead ? this.still + dt : 0;
    let stretch = this.reduced ? 0 : Math.min(0.22, (v / 120) * 0.03);
    const sq = this.reduced ? 0 : this.squash;
    let ang = Math.atan2(b.vy, b.vx);
    // 一只手吊着、没怎么动：身子往那只手那边坠长一点（A14b）
    const held = p.arms.filter((a) => a.grip);
    if (!this.reduced && held.length === 1 && v < 160) {
      const h = (held[0] as (typeof p.arms)[number]).hand;
      if (h.y < b.y - 8) {
        ang = Math.atan2(h.y - b.y, h.x - b.x);
        stretch = Math.max(stretch, 0.07);
      }
    }
    // 站着不动：一呼一吸（A14b）
    const breath = !this.reduced && this.still > 0.4 && held.length === 0 ? Math.sin(time * 2.6 + p.id * 1.3) * 0.022 : 0;
    if (breath !== 0) ang = 0;
    // 帽子晚半拍：往速度反方向偏一点，弹回来（减弱动效时不晃）
    if (!this.reduced) {
      const tx = Math.max(-5, Math.min(5, -b.vx * 0.006));
      const ty = Math.max(-5, Math.min(5, -b.vy * 0.006));
      for (const k of ['x', 'y'] as const) {
        this.hatV[k] += ((k === 'x' ? tx : ty) - this.hatO[k]) * 140 * dt - this.hatV[k] * 12 * dt;
        this.hatO[k] += this.hatV[k] * dt;
      }
    }
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
      this.stretchC.scale.set(1 + stretch + 0.08 * this.pulse - breath * 0.6, 1 - stretch + 0.08 * this.pulse + breath);
      this.stretchC.position.set(0, -breath * R * 0.5);
    }

    this.bodyC.rotation = this.lean;
    this.drawArms(p, slips);
    this.drawFace(p, time, mood);
    this.drawMood(p, time);
    this.drawItem(p, time);
    this.label.position.set(b.x, this.bodyC.y - R - this.hatHeight() - (p.itemOn === 'leaf' && !p.dead ? 34 : 4));
    this.label.alpha = sinking ? 0 : 1;
    // 表情气泡在名字上面；刚冒出来从小弹到大（减弱动效时直接出来），最后 0.4 秒淡掉
    if (this.bubbleT > 0) {
      this.bubbleT = Math.max(0, this.bubbleT - dt);
      this.bubbleAge += dt;
      const k = Math.min(1, this.bubbleAge / 0.18);
      const pop = this.reduced ? 1 : 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.12;
      this.bubble.scale.set(pop);
      this.bubble.position.set(b.x, this.label.y - this.label.height - 3);
      this.bubble.alpha = sinking ? 0 : Math.min(1, this.bubbleT / BUBBLE_FADE);
    }
    this.bubble.visible = this.bubbleT > 0;
  }

  /**
   * 道具（A9）。速冻：整个人封在一块冰里（半透明，脸看得见），快化的最后 0.8 秒一闪一闪。
   * 荷叶：头顶撑一片大荷叶，叶柄连到头上，跟着摇杆轻轻歪（减弱动效时不歪、不闪）。
   */
  private drawItem(p: PlayerView, time: number): void {
    const g = this.itemG;
    const on = p.dead ? null : (p.itemOn ?? null);
    const left = p.itemLeft ?? 0;
    if (!on) {
      if (this.itemKey) {
        g.clear();
        this.itemKey = '';
      }
      return;
    }
    const x = this.bodyC.x;
    const y = this.bodyC.y;
    g.clear();
    this.itemKey = on;
    if (on === 'freeze') {
      const s = R + 9;
      const blink = left < 0.8 && !this.reduced ? 0.55 + 0.45 * Math.abs(Math.sin(time * 18)) : 1;
      g.roundRect(x - s, y - s, s * 2, s * 2, 12).fill({ color: 0xbfe8ff, alpha: 0.42 * blink });
      g.roundRect(x - s, y - s, s * 2, s * 2, 12).stroke({ width: 3, color: 0xffffff, alpha: 0.85 * blink });
      // 冰面的反光：左上两道斜的亮条
      g.moveTo(x - s + 8, y - s + 22).lineTo(x - s + 22, y - s + 8).stroke({ width: 4, color: 0xffffff, alpha: 0.75 * blink, cap: 'round' });
      g.moveTo(x - s + 9, y - s + 34).lineTo(x - s + 34, y - s + 9).stroke({ width: 2.5, color: 0xffffff, alpha: 0.5 * blink, cap: 'round' });
      // 右下角一点霜
      g.circle(x + s - 9, y + s - 9, 3).fill({ color: 0xffffff, alpha: 0.7 * blink });
      return;
    }
    // 荷叶
    const tilt = this.reduced ? 0 : Math.max(-0.35, Math.min(0.35, p.aim.x * 0.3 + Math.sin(time * 2.2 + p.id) * 0.05));
    const top = y - R - this.hatHeight() - 26;
    const cx = x + Math.sin(tilt) * 26;
    const cy = top + (1 - Math.cos(tilt)) * 26;
    const w = 46;
    const h = 15;
    // 叶柄
    g.moveTo(x, y - R + 4).quadraticCurveTo(x + Math.sin(tilt) * 10, (y - R + top) / 2, cx, cy + 4).stroke({ width: 4, color: 0x4e8a3c, cap: 'round' });
    // 叶面：一个扁的半圆盖，边上一圈深一点，几条叶脉
    const pts: number[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI + (k / 16) * Math.PI;
      const lx = Math.cos(a) * w;
      const ly = Math.sin(a) * h;
      pts.push(cx + lx * Math.cos(tilt) - ly * Math.sin(tilt), cy + lx * Math.sin(tilt) + ly * Math.cos(tilt));
    }
    const rim = (k: number): [number, number] => [pts[k * 2] as number, pts[k * 2 + 1] as number];
    g.poly(pts).fill(0x6dbb5a);
    g.poly(pts).stroke({ width: 3, color: 0x3f7a33, join: 'round' });
    for (const k of [2, 5, 8, 11, 14]) {
      const [ex, ey] = rim(k);
      g.moveTo(cx, cy).lineTo(cx + (ex - cx) * 0.85, cy + (ey - cy) * 0.85).stroke({ width: 1.6, color: 0x3f7a33, alpha: 0.8 });
    }
    // 高光
    const [hx, hy] = rim(5);
    g.moveTo(cx - 6, cy - 4).lineTo(cx + (hx - cx) * 0.6, cy + (hy - cy) * 0.6).stroke({ width: 3, color: 0xd8f5c4, alpha: 0.6, cap: 'round' });
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
    const { lit, shade } = bodyGradients();
    g.clear();
    g.circle(0, 0, R + 2.5).fill(OUTLINE);
    g.circle(0, 0, R).fill(this.color);
    // 糯米的糯：一点点半透明的白，像粉
    g.circle(0, 0, R - 1).fill({ color: 0xffffff, alpha: 0.1 });
    // 球的光影：左上亮，右下暗，右下沿着边一道反光（A8）
    g.circle(0, 0, R).fill(shade);
    g.circle(0, 0, R).fill(lit);
    g.arc(0, 0, R - 2.2, Math.PI * 0.08, Math.PI * 0.62).stroke({ width: 2.4, color: 0xffffff, alpha: 0.26, cap: 'round' });
    // 高光：一小块亮的
    g.ellipse(-8, -12, 5.5, 3.2).fill({ color: 0xffffff, alpha: 0.8 });
    g.circle(-14, 4, 4.2).fill({ color: 0xf05a6e, alpha: 0.35 });
    g.circle(14, 4, 4.2).fill({ color: 0xf05a6e, alpha: 0.35 });
  }

  private drawArms(p: PlayerView, slips: boolean): void {
    const g = this.arms;
    g.clear();
    // 手酸（A11）：力气剩不到 staminaWarn 时，抓着的手开始抖、圈变红，越少越厉害
    const stamina = p.stamina ?? 1;
    const tired = stamina < CFG.staminaWarn ? Math.min(1, (CFG.staminaWarn - stamina) / CFG.staminaWarn) : 0;
    if (tired > 0 && p.arms.some((a) => a.grip)) this.sweat = Math.max(this.sweat, 0.4);
    p.arms.forEach((arm, i) => {
      // 坐不住、雪山的冰溜子：快到滑脱前 slipWarn 秒手开始抖、圈变红，到点就滑（减弱动效时只变红）
      const max = Math.min(slips ? CFG.lastGripMax : Infinity, arm.grip?.max ?? Infinity);
      const slipWarn = arm.grip && Number.isFinite(max) ? Math.min(1, Math.max(0, (arm.grip.t - (max - CFG.slipWarn)) / CFG.slipWarn)) : 0;
      const warn = arm.grip ? Math.max(slipWarn, tired) : 0;
      const jit = warn > 0 && !this.reduced ? warn * 3 : 0;
      const pts = arm.pts;
      if (pts.length >= 2) {
        this.noodle(g, pts);
        g.stroke({ width: 15, color: OUTLINE, cap: 'round', join: 'round' });
        this.noodle(g, pts);
        g.stroke({ width: 10, color: ARM_COLORS[this.look.arms] ?? ARM_COLORS.noodle, cap: 'round', join: 'round' });
        // 面条是圆的：靠光的那边一道亮（A8）
        this.noodle(g, pts, -1.3, -1.8);
        g.stroke({ width: 3.2, color: 0xffffff, alpha: 0.32, cap: 'round', join: 'round' });
      }
      const h = jit ? { x: arm.hand.x + (Math.random() - 0.5) * jit, y: arm.hand.y + (Math.random() - 0.5) * jit } : arm.hand;
      const glove = GLOVES[i] as string;
      // 手（A14b）：没抓东西时张开，三根手指朝着胳膊伸的方向露出来；抓着时是拳头，指节一道线
      const prev = pts.length >= 2 ? (pts[pts.length - 2] as Pt) : p.body;
      const dl = Math.hypot(h.x - prev.x, h.y - prev.y) || 1;
      const ux = (h.x - prev.x) / dl;
      const uy = (h.y - prev.y) / dl;
      const fingers = arm.grip
        ? []
        : [-0.62, 0, 0.62].map((a) => ({
            x: h.x + (ux * Math.cos(a) - uy * Math.sin(a)) * (CFG.handR + 1.5),
            y: h.y + (ux * Math.sin(a) + uy * Math.cos(a)) * (CFG.handR + 1.5),
          }));
      for (const f of fingers) g.circle(f.x, f.y, 3.6 + 2.5).fill(OUTLINE);
      g.circle(h.x, h.y, CFG.handR + 2.5).fill(OUTLINE);
      for (const f of fingers) g.circle(f.x, f.y, 3.6).fill(glove);
      g.circle(h.x, h.y, CFG.handR).fill(glove);
      // 手套也是个球：右下压暗一圈，左上留一道亮边，再点一个高光
      g.circle(h.x + 1.6, h.y + 1.8, CFG.handR - 0.8).fill({ color: 0x140a1e, alpha: 0.2 });
      g.circle(h.x - 3, h.y - 3, 3).fill({ color: 0xffffff, alpha: 0.5 });
      if (arm.grip) {
        // 拳头的指节：朝抓的那边一道弧
        const a0 = Math.atan2(uy, ux);
        const kr = CFG.handR - 3.2;
        g.moveTo(h.x + Math.cos(a0 - 0.9) * kr, h.y + Math.sin(a0 - 0.9) * kr)
          .arc(h.x, h.y, kr, a0 - 0.9, a0 + 0.9)
          .stroke({ width: 1.6, color: OUTLINE, alpha: 0.55, cap: 'round' });
      }
      if (arm.grip) {
        const r = CFG.handR + 5 + Math.sin(arm.grip.t * (12 + warn * 18)) * 1.5;
        g.circle(h.x, h.y, r).stroke({ width: 2 + warn * 1.5, color: warn > 0 ? 0xff6b5a : 0xffffff, alpha: 0.9 });
      }
    });
    // 力气圈（A11）：没满的时候在头顶右上角画一小圈（避开胳膊和名字），绿、黄、红，满了就不画
    if (stamina < 0.995 && !p.dead) {
      const cx = p.body.x + R + 8;
      const cy = p.body.y - R - 8;
      const rr = 8;
      const color = stamina > 0.6 ? 0x8fd16a : stamina > CFG.staminaWarn ? 0xf8c56d : 0xff6b5a;
      g.circle(cx, cy, rr).fill({ color: 0x140a1e, alpha: 0.45 });
      if (stamina > 0.01) {
        g.moveTo(cx, cy).arc(cx, cy, rr - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stamina).lineTo(cx, cy).fill({ color, alpha: 0.95 });
      }
      g.circle(cx, cy, rr).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
    }
  }

  private noodle(g: Graphics, pts: Pt[], ox = 0, oy = 0): void {
    g.moveTo(pts[0]!.x + ox, pts[0]!.y + oy);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i] as Pt;
      const b = pts[i + 1] as Pt;
      g.quadraticCurveTo(a.x + ox, a.y + oy, (a.x + b.x) / 2 + ox, (a.y + b.y) / 2 + oy);
    }
    const l = pts[pts.length - 1] as Pt;
    g.lineTo(l.x + ox, l.y + oy);
  }

  /** 晕的时候头顶三颗星星转圈（减弱动效时不转），快好了变淡。 */
  private drawMood(p: PlayerView, time: number): void {
    const g = this.moodG;
    if (this.dizzy <= 0 || p.dead) {
      if (g.visible) g.clear();
      g.visible = false;
      return;
    }
    g.visible = true;
    g.clear();
    const cx = this.bodyC.x;
    // 绕着头顶转一圈（名字在更上面，不挡）
    const cy = this.bodyC.y - R + 3;
    const a = Math.min(1, this.dizzy / 0.35);
    const spin = this.reduced ? 0 : time * 5.5;
    for (let k = 0; k < 3; k++) {
      const t = spin + (k * Math.PI * 2) / 3;
      const x = cx + Math.cos(t) * 22;
      const y = cy + Math.sin(t) * 7;
      g.poly(starPoints(x, y, 6, t)).fill({ color: 0xffd166, alpha: a }).stroke({ width: 1.5, color: OUTLINE, alpha: a });
    }
  }

  private drawFace(p: PlayerView, time: number, mood: Mood = {}): void {
    // 眼睛跟摇杆；没推摇杆就看向飞的方向
    const aimed = p.aim.x !== 0 || p.aim.y !== 0;
    const v = Math.hypot(p.body.vx, p.body.vy);
    // 站久了眼睛左右看看（A14b）
    const idleLook = !this.reduced && this.still > 2.5 ? Math.sin(time * 0.9 + p.id) * 2.5 : 0;
    const lx = aimed ? p.aim.x * 4 : v > 200 ? (p.body.vx / v) * 3 : idleLook;
    const ly = aimed ? p.aim.y * 3 : v > 200 ? (p.body.vy / v) * 2 : 0;
    // 2.5D（A8）：脸长在球面上，往哪看整张脸就往那边转一点（帽子转得少），看着是个圆的
    const turn = this.reduced ? 0 : 1;
    this.face.position.set(lx * 0.9 * turn, ly * 0.6 * turn);
    this.extras.position.set(lx * 0.9 * turn, ly * 0.6 * turn);
    this.glasses.position.set(lx * 0.9 * turn, ly * 0.6 * turn);
    this.hat.position.set(lx * 0.4 * turn + this.hatO.x, this.hatO.y);
    this.hat.rotation = this.hatO.x * 0.05;
    const blink = this.blink > 0 && this.look.eyes !== 'happy';
    const expr = pickExpression(p.face, p.dead, { dizzy: this.dizzy, cheer: this.cheer, stamina: p.stamina ?? 1, mood, stink: this.stink });
    const key = `${expr}|${lx.toFixed(1)}|${ly.toFixed(1)}|${blink}|${this.sweat > 0}|${this.look.eyes}|${Math.floor(time * 6) % 2}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    const g = this.face;
    g.clear();
    const eyeY = -4;
    if (expr !== p.face) {
      this.drawMoodFace(g, expr, lx, ly, time);
      return;
    }
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

  /**
   * A14 的表情。晕：两只转圈的眼睛、波浪嘴；吓：眼白瞪大、黑眼珠缩小往下看、小圆嘴、眉毛挑起来、冒汗；
   * 累：眼皮耷拉一半、嘴张着喘、冒汗；风里：眯成 > < 的眼、抿着嘴；乐：眯眯眼加张嘴笑。
   */
  private drawMoodFace(g: Graphics, expr: Expr, lx: number, ly: number, time: number): void {
    const eyeY = -4;
    if (expr === 'dizzy') {
      for (const side of [-1, 1]) {
        const ex = side * 8;
        g.moveTo(ex, eyeY);
        for (let k = 1; k <= 22; k++) {
          const a = (k / 22) * Math.PI * 3.2 * side;
          const r = (k / 22) * 5.5;
          g.lineTo(ex + Math.cos(a) * r, eyeY + Math.sin(a) * r);
        }
        g.stroke({ width: 1.8, color: INK, cap: 'round', join: 'round' });
      }
      g.moveTo(-7, 10);
      for (let k = 1; k <= 8; k++) g.lineTo(-7 + (k * 14) / 8, 10 + (k % 2 ? -2 : 2));
      g.stroke({ width: 2, color: INK, cap: 'round', join: 'round' });
      return;
    }
    if (expr === 'scared') {
      for (const side of [-1, 1]) {
        const ex = side * 8;
        g.ellipse(ex, eyeY, 6.5, 7.8).fill(0xffffff).stroke({ width: 1.2, color: INK, alpha: 0.5 });
        g.circle(ex + lx * 0.5, eyeY + 2.5, 1.9).fill(INK);
        g.moveTo(ex - side * 5, eyeY - 12).quadraticCurveTo(ex, eyeY - 15, ex + side * 5, eyeY - 11).stroke({ width: 2.2, color: INK, cap: 'round' });
      }
      g.ellipse(0, 10, 3.2, 4).fill(INK);
      this.sweatDrop(g, R - 5, -12, time);
      return;
    }
    if (expr === 'tired') {
      for (const side of [-1, 1]) {
        const ex = side * 8;
        g.ellipse(ex, eyeY, 5.5, 6).fill(0xffffff);
        g.circle(ex + lx, eyeY + 1.5 + ly * 0.5, 3).fill(INK);
        // 眼皮：盖住上面一半多，边上一道弯线
        g.rect(ex - 7, eyeY - 7, 14, 7.5).fill(this.color);
        g.moveTo(ex - 6, eyeY + 0.5).quadraticCurveTo(ex, eyeY + 2, ex + 6, eyeY + 0.5).stroke({ width: 2, color: INK, cap: 'round' });
      }
      // 张着嘴喘：一张一合
      const open = this.reduced ? 3 : 2.5 + 1.5 * Math.abs(Math.sin(time * 9));
      g.ellipse(0, 10, 4.5, open).fill(INK);
      this.sweatDrop(g, R - 5, -12, time);
      this.sweatDrop(g, -(R - 6), -8, time + 0.4);
      return;
    }
    if (expr === 'windy') {
      for (const side of [-1, 1]) {
        const ex = side * 8;
        // 尖朝鼻子：左眼 >、右眼 <
        g.moveTo(ex + side * 5, eyeY - 4).lineTo(ex - side * 3, eyeY).lineTo(ex + side * 5, eyeY + 4).stroke({ width: 2.4, color: INK, cap: 'round', join: 'round' });
      }
      g.moveTo(-5, 10).lineTo(5, 10).stroke({ width: 2.4, color: INK, cap: 'round' });
      return;
    }
    if (expr === 'stinky') {
      // 闻到屁（11-25）：眯成 >_<，嘴皱成波浪，脸边两道黄绿的臭气往上飘（减弱动效时不飘）
      for (const side of [-1, 1]) {
        const ex = side * 8;
        g.moveTo(ex + side * 5, eyeY - 4).lineTo(ex - side * 3, eyeY).lineTo(ex + side * 5, eyeY + 4).stroke({ width: 2.4, color: INK, cap: 'round', join: 'round' });
      }
      g.moveTo(-7, 10).quadraticCurveTo(-3.5, 6.5, 0, 10).quadraticCurveTo(3.5, 13.5, 7, 10).stroke({ width: 2.2, color: INK, cap: 'round', join: 'round' });
      const ph = this.reduced ? 0 : Math.floor(time * 6) % 2;
      for (const side of [-1, 1]) {
        const x = side * (R - 4);
        const y0 = 2 - ph * 3;
        g.moveTo(x, y0);
        for (let k = 1; k <= 3; k++) g.quadraticCurveTo(x + (k % 2 ? 3 : -3) * side, y0 - k * 5 + 2.5, x, y0 - k * 5);
        g.stroke({ width: 1.8, color: STINK, alpha: 0.9, cap: 'round', join: 'round' });
      }
      return;
    }
    // 乐
    for (const side of [-1, 1]) {
      const ex = side * 8;
      g.moveTo(ex - 5, eyeY + 1).quadraticCurveTo(ex, eyeY - 5, ex + 5, eyeY + 1).stroke({ width: 2.4, color: INK, cap: 'round' });
    }
    g.moveTo(-7, 6).quadraticCurveTo(0, 16, 7, 6).closePath().fill(INK);
    g.moveTo(-4, 10).quadraticCurveTo(0, 14, 4, 10).closePath().fill(0xe8413c);
  }

  /** 一滴汗，一上一下地动（减弱动效时不动）。 */
  private sweatDrop(g: Graphics, x: number, y0: number, time: number): void {
    const y = y0 + (this.reduced ? 0 : (Math.floor(time * 6) % 2) * 2);
    g.moveTo(x, y - 6).quadraticCurveTo(x + 3.5, y, x, y + 3).quadraticCurveTo(x - 3.5, y, x, y - 6).fill(0x8ec5e8);
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
