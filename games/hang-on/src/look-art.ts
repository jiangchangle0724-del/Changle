/**
 * 红包扭蛋机（11-25）里那 12 样怎么画。主机游戏里是 Pixi，手柄页和座位卡的小预览是 2D canvas：
 * 这里只按「笔」（Pen）画一遍，两边各有一个把笔接上去的（`src/render/dumpling.ts` 的 pixiPen、`src/pad/look-preview.ts` 的 canvasPen）。
 * 坐标和老的帽子一样：身子圆心在 (0, 0)，半径 24，眼睛在 y = -4，帽子从 top = -24 往上画。这个文件不能 import Pixi。
 */
import type { Face, Glasses, Hat } from './look';

/** 画一个形状，接着填色、描边（两样都要就先填后描）。颜色是 0xRRGGBB。 */
export interface Pen {
  /** 折线；close 封口成多边形。points 是 [x0, y0, x1, y1, …]。 */
  poly(points: readonly number[], close?: boolean): Pen;
  circle(x: number, y: number, r: number): Pen;
  ellipse(x: number, y: number, rx: number, ry: number): Pen;
  rect(x: number, y: number, w: number, h: number, radius?: number): Pen;
  /** 一段弧，从 a0 顺时针到 a1（弧度）；close 连回起点成扇形的弦。 */
  arc(x: number, y: number, r: number, a0: number, a1: number, close?: boolean): Pen;
  /** 一段二次曲线。 */
  curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): Pen;
  fill(color: number, alpha?: number): Pen;
  stroke(width: number, color: number, alpha?: number): Pen;
}

const OUTLINE = 0x3a2a2a;
const INK = 0x2a1f3a;
const RED = 0xd8262f;
const GOLD = 0xf6c453;
const R = 24;

/** 心形（参数方程取 16 个点），中心在 (x, y)，s 是大小。 */
function heart(x: number, y: number, s: number): number[] {
  const pts: number[] = [];
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2;
    pts.push(x + s * 16 * Math.sin(t) ** 3, y - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)));
  }
  return pts;
}

/** 扭蛋机里的帽子：画了返回 true（不是扭蛋机里的返回 false，老的照老的画）。 */
export function drawGachaHat(pen: Pen, hat: Hat, top: number): boolean {
  switch (hat) {
    case 'caishen':
      // 财神帽：红帽顶、金边，两边伸出黑帽翅，正前面一个金元宝
      for (const s of [-1, 1]) pen.rect(s > 0 ? 20 : -36, top - 1, 16, 5, 2.5).fill(INK).stroke(1.6, OUTLINE);
      pen.arc(0, top + 11, 19, Math.PI, 0, true).fill(RED).stroke(2.5, OUTLINE);
      pen.rect(-20, top + 7, 40, 6, 2).fill(GOLD).stroke(2, OUTLINE);
      pen.poly([-7, top - 1, 7, top - 1, 4.5, top + 4, -4.5, top + 4]).fill(GOLD).stroke(1.5, OUTLINE);
      pen.ellipse(0, top - 2, 3, 2.2).fill(0xffe08a).stroke(1.2, OUTLINE);
      return true;
    case 'tiger':
      // 虎头帽：橘色帽子，两只圆耳朵，额头上一个「王」，两边几道黑纹
      for (const s of [-1, 1]) {
        pen.circle(s * 15, top - 5, 6.5).fill(0xf39c34).stroke(2.2, OUTLINE);
        pen.circle(s * 15, top - 5, 3).fill(0xfbd38d);
      }
      pen.arc(0, top + 12, 21, Math.PI, 0, true).fill(0xf39c34).stroke(2.5, OUTLINE);
      for (const s of [-1, 1]) {
        pen.poly([s * 19, top + 4, s * 13, top + 7], false).stroke(2, INK);
        pen.poly([s * 17, top - 1, s * 11, top + 2], false).stroke(2, INK);
      }
      pen.poly([-4.5, top - 4, 4.5, top - 4], false).stroke(1.8, INK);
      pen.poly([-3.5, top, 3.5, top], false).stroke(1.8, INK);
      pen.poly([-4.5, top + 4, 4.5, top + 4], false).stroke(1.8, INK);
      pen.poly([0, top - 4, 0, top + 4], false).stroke(1.8, INK);
      return true;
    case 'lion':
      // 舞狮头：大红的头壳、金角、两只大眼睛，下沿一圈白毛
      pen.poly([-5, top - 12, 0, top - 24, 5, top - 12]).fill(GOLD).stroke(2, OUTLINE);
      pen.arc(0, top + 12, 23, Math.PI, 0, true).fill(RED).stroke(2.5, OUTLINE);
      pen.curve(-16, top + 2, 0, top - 8, 16, top + 2).stroke(2.5, GOLD);
      for (const s of [-1, 1]) {
        pen.circle(s * 9, top - 2, 5).fill(0xffffff).stroke(1.6, OUTLINE);
        pen.circle(s * 9 + s * 1, top - 1.5, 2.3).fill(INK);
      }
      for (let x = -20; x <= 20; x += 5) pen.circle(x, top + 12, 3.4).fill(0xffffff).stroke(1, OUTLINE, 0.5);
      return true;
    case 'helmet':
      // 宇航头盔：整个头罩在一个透明的泡泡里，脖子一圈白领，头顶一根小天线
      pen.poly([10, top - 6, 15, top - 15], false).stroke(2, OUTLINE);
      pen.circle(15.5, top - 16, 3).fill(0xe8413c).stroke(1.4, OUTLINE);
      pen.circle(0, 0, R + 7).fill(0xbfe8ff, 0.2).stroke(2.6, 0xdfe8f2);
      pen.curve(-19, -12, -15, -24, -4, -28).stroke(3, 0xffffff, 0.75);
      pen.rect(-17, R - 1, 34, 7, 3).fill(0xe6e9ef).stroke(2, OUTLINE);
      return true;
    case 'party':
      // 派对帽：紫色尖帽子，彩点，顶上一个黄绒球
      pen.poly([-11, top + 7, 0, top - 22, 11, top + 7]).fill(0x9b7be0).stroke(2.4, OUTLINE);
      pen.circle(-3, top - 5, 2).fill(0xffd166);
      pen.circle(3.5, top + 1, 2).fill(0xf28ca6);
      pen.circle(-4.5, top + 4, 1.7).fill(0xffffff);
      pen.circle(1.5, top - 11, 1.6).fill(0x8ee0c8);
      pen.circle(0, top - 23, 4.5).fill(0xffd166).stroke(1.8, OUTLINE);
      return true;
    default:
      return false;
  }
}

/** 扭蛋机里的帽子有多高（名字往上让多少）。 */
export function gachaHatHeight(hat: Hat): number | null {
  switch (hat) {
    case 'caishen':
      return 12;
    case 'tiger':
      return 16;
    case 'lion':
      return 24;
    case 'helmet':
      return 12;
    case 'party':
      return 28;
    default:
      return null;
  }
}

/** 扭蛋机里的眼镜。 */
export function drawGachaGlasses(pen: Pen, glasses: Glasses, eyeY: number): boolean {
  switch (glasses) {
    case 'heart':
      // 爱心镜：两颗红心
      for (const s of [-1, 1]) pen.poly(heart(s * 8.5, eyeY - 0.5, 0.48)).fill(0xe8413c, 0.9).stroke(1.6, OUTLINE);
      pen.poly([-1.5, eyeY - 3, 1.5, eyeY - 3], false).stroke(2, OUTLINE);
      return true;
    case 'threed':
      // 3D 眼镜：白框，左红右蓝
      pen.rect(-17, eyeY - 6, 15, 11, 2).fill(0xe8413c, 0.7).stroke(2.4, 0xffffff);
      pen.rect(2, eyeY - 6, 15, 11, 2).fill(0x3ec9e8, 0.7).stroke(2.4, 0xffffff);
      pen.poly([-2, eyeY - 2, 2, eyeY - 2], false).stroke(2.4, 0xffffff);
      pen.rect(-17, eyeY - 6, 34, 11, 2).stroke(0.8, OUTLINE, 0.6);
      return true;
    case 'ski':
      // 滑雪镜：一条黑带子绕过头，中间一大片紫色镜片带白反光
      pen.rect(-24, eyeY - 3, 48, 6, 3).fill(INK);
      pen.rect(-17, eyeY - 7.5, 34, 13, 6).fill(0x8a6cf0, 0.9).stroke(2.2, 0xffffff);
      pen.curve(-12, eyeY - 2, -7, eyeY - 6, 0, eyeY - 5).stroke(1.8, 0xffffff, 0.7);
      return true;
    default:
      return false;
  }
}

/** 扭蛋机里的脸上的东西。 */
export function drawGachaFace(pen: Pen, face: Face): boolean {
  switch (face) {
    case 'blush':
      // 红脸蛋：两大团粉，带一点亮
      for (const s of [-1, 1]) {
        pen.circle(s * 13.5, 6, 6.2).fill(0xf06a8a, 0.55);
        pen.circle(s * 11.5, 4, 1.6).fill(0xffffff, 0.8);
      }
      return true;
    case 'paint':
      // 京剧脸谱：两颊红色的勾，眉毛上挑的黑笔，额头一滴红
      for (const s of [-1, 1]) {
        pen.curve(s * 8, 3, s * 21, 0, s * 17, 13).stroke(3.4, RED);
        pen.curve(s * 4, -11, s * 10, -16, s * 16, -10).stroke(2.4, INK);
      }
      pen.ellipse(0, -15, 2.4, 3.8).fill(RED);
      return true;
    default:
      return false;
  }
}
