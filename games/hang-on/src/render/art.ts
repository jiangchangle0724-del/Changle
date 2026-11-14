/**
 * 美术底子（A3）：每个世界的色板（年夜饭桌、温哥华海湾，A10 加了中餐馆后厨、雪山缆车），和程序画出来的贴图（茶布、木头、瓷、钢、冰、雪、面条……）。
 * 全是代码画的，没有图片文件：下载小，风格统一，也不会有原版的任何东西。
 * 贴图在一张离屏 canvas 上画好，交给 Pixi 当纹理；粒子共用一张小图集。
 */
import { FillGradient, Rectangle, Texture, type Graphics } from 'pixi.js';

export type WorldId = 'table' | 'van' | 'kitchen' | 'snow';

/** 关卡的 world 字段 → 画哪个世界（没写、不认识的按年夜饭桌）。 */
export const worldOf = (w: string | undefined): WorldId => (w === 'van' || w === 'kitchen' || w === 'snow' ? w : 'table');

/** 台子没写材质时每个世界用什么：桌上和雪山是木头（雪山的木头上积着雪），温哥华和后厨是钢。 */
export const WORLD_MATERIAL: Record<WorldId, string> = { table: 'wood', van: 'metal', kitchen: 'metal', snow: 'wood' };

export interface Palette {
  /** 天空 / 房间的上下两色。 */
  skyTop: string;
  skyBottom: string;
  /** 远、中、近三层剪影的颜色。 */
  far: string;
  mid: string;
  near: string;
  /** 深渊：表面线、主体、底。 */
  abyssLine: string;
  abyssTop: string;
  abyssBottom: string;
  /** 雾（整体压一层的颜色）。 */
  haze: string;
  /** 终点旗的颜色。 */
  flag: string;
  /** 检查点灯的颜色（亮 / 灭）。 */
  lampOn: string;
  lampOff: string;
}

export const PALETTES: Record<WorldId, Palette> = {
  table: {
    skyTop: '#2a0d14',
    skyBottom: '#7a2a30',
    far: '#4a171f',
    mid: '#5e1f28',
    near: '#742c33',
    abyssLine: '#ffb36b',
    abyssTop: '#c93a22',
    abyssBottom: '#5e1308',
    haze: '#ff8a5b',
    flag: '#e8413c',
    lampOn: '#ffd166',
    lampOff: '#7a4a4f',
  },
  van: {
    skyTop: '#1b2550',
    skyBottom: '#f0915a',
    far: '#2d3a6b',
    mid: '#223058',
    near: '#182243',
    abyssLine: '#9fd3e8',
    abyssTop: '#2a4f7a',
    abyssBottom: '#0d1a33',
    haze: '#6a7fb5',
    flag: '#e8413c',
    lampOn: '#9be8ff',
    lampOff: '#3f4f73',
  },
  // 中餐馆后厨（A10）：上面是熏暗的不锈钢和瓷砖，下面是灶火的暖光；掉下去是一池洗碗水
  kitchen: {
    skyTop: '#1d282c',
    skyBottom: '#b9643a',
    far: '#2c3a3f',
    mid: '#344549',
    near: '#222d33',
    abyssLine: '#eef8ff',
    abyssTop: '#7fb0c4',
    abyssBottom: '#1c3747',
    haze: '#ffb07a',
    flag: '#e8413c',
    lampOn: '#ffc46b',
    lampOff: '#5b5148',
  },
  // 雪山缆车（A10）：黄昏的雪山，天是冷蓝到浅粉，掉下去是冰缝
  snow: {
    skyTop: '#22355a',
    skyBottom: '#d9b9c8',
    far: '#7f93b8',
    mid: '#5b7099',
    near: '#2d3d5e',
    abyssLine: '#eaf6ff',
    abyssTop: '#9cc6e4',
    abyssBottom: '#1b2c46',
    haze: '#d4e6ff',
    flag: '#e8413c',
    lampOn: '#ffd27a',
    lampOff: '#4f5d75',
  },
};

/** 地形材质的颜色：主体、暗部、亮边、花纹。 */
export interface MaterialStyle {
  base: string;
  dark: string;
  light: string;
  detail: string;
  /** 贴图的名字（textures() 里的键）。 */
  texture: 'cloth' | 'wood' | 'ceramic' | 'metal' | 'ice' | 'snow';
}

export const MATERIALS: Record<string, MaterialStyle> = {
  cloth: { base: '#5c9a63', dark: '#3c7046', light: '#9ed29a', detail: '#7bb881', texture: 'cloth' },
  wood: { base: '#c98a4b', dark: '#8a5a2b', light: '#f1c58d', detail: '#a86a33', texture: 'wood' },
  ceramic: { base: '#f3ecdd', dark: '#c8b89a', light: '#ffffff', detail: '#3b5ba5', texture: 'ceramic' },
  metal: { base: '#8c9aab', dark: '#5a6676', light: '#d3dbe6', detail: '#6f7d8f', texture: 'metal' },
  ice: { base: '#bfe6f6', dark: '#7fb9d6', light: '#ffffff', detail: '#9fd3ec', texture: 'ice' },
  noodle: { base: '#f3dc9a', dark: '#c9a860', light: '#fff4c8', detail: '#e0c070', texture: 'wood' },
  // 竹蒸笼（后厨，A10）
  bamboo: { base: '#d9b77a', dark: '#9c7a3c', light: '#f3dfae', detail: '#b8924f', texture: 'wood' },
  // 压实的雪（雪山，A10）
  snow: { base: '#eef4fa', dark: '#b4c6da', light: '#ffffff', detail: '#d3e1ef', texture: 'snow' },
};
export const DEFAULT_MATERIAL: MaterialStyle = MATERIALS.wood as MaterialStyle;

export function materialOf(name: string | undefined): MaterialStyle {
  return (name && MATERIALS[name]) || DEFAULT_MATERIAL;
}

export { GLOVES } from '../look';
export const INK = '#2a1f3a';
export const OUTLINE = '#3a2a2a';
export const CREAM = '#fff6e9';
export const CONFETTI = ['#F28CA6', '#9BCF83', '#F8C56D', '#8EC5E8', '#fff6e9', '#e8413c'];

// ---------------------------------------------------------------- 贴图

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  return [c, ctx];
}

/** 确定性的伪随机，贴图每次长一样。 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function textureOf(c: HTMLCanvasElement, repeat = true): Texture {
  const t = Texture.from(c);
  if (repeat) t.source.addressMode = 'repeat';
  t.source.scaleMode = 'linear';
  return t;
}

/** 茶布：细密的十字织纹，深浅两色。 */
function cloth(m: MaterialStyle): HTMLCanvasElement {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = m.base;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = m.detail;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let i = 0; i < 64; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, 64);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(64, i + 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = m.dark;
  for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < 64; x += 16) ctx.fillRect(x + 1, y + 1, 6, 6);
  ctx.globalAlpha = 1;
  return c;
}

/** 木头：顺着的纹路加几个节。 */
function wood(m: MaterialStyle): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 64);
  const r = rng(7);
  ctx.fillStyle = m.base;
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = m.detail;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const y = 4 + i * 7 + r() * 3;
    ctx.globalAlpha = 0.25 + r() * 0.3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 128; x += 16) ctx.lineTo(x, y + Math.sin(x / 19 + i) * 1.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = m.dark;
  ctx.beginPath();
  ctx.ellipse(40, 30, 7, 4, 0.2, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(98, 46, 5, 3, -0.3, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
  return c;
}

/** 瓷：奶白釉，青花的小枝叶。 */
function ceramic(m: MaterialStyle): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = m.base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = m.detail;
  ctx.fillStyle = m.detail;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.55;
  const sprig = (x: number, y: number, s: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 10 * s, y - 14 * s, x + 22 * s, y - 10 * s);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (6 + k * 6) * s, y - (6 + k * 3) * s, 3.2 * s, 1.8 * s, -0.6, 0, 7);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x + 24 * s, y - 11 * s, 2.2 * s, 0, 7);
    ctx.fill();
  };
  sprig(12, 44, 1);
  sprig(70, 110, 0.9);
  sprig(80, 36, 0.7);
  sprig(20, 100, 0.6);
  ctx.globalAlpha = 1;
  return c;
}

/** 钢：拉丝横纹，几颗铆钉。 */
function metal(m: MaterialStyle): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 64);
  const r = rng(11);
  ctx.fillStyle = m.base;
  ctx.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 64; y += 2) {
    ctx.fillStyle = r() > 0.5 ? m.light : m.dark;
    ctx.globalAlpha = 0.08 + r() * 0.1;
    ctx.fillRect(0, y, 128, 1);
  }
  ctx.globalAlpha = 0.6;
  for (const [x, y] of [
    [14, 14],
    [114, 14],
    [14, 50],
    [114, 50],
  ] as const) {
    ctx.fillStyle = m.dark;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, 7);
    ctx.fill();
    ctx.fillStyle = m.light;
    ctx.beginPath();
    ctx.arc(x - 0.8, y - 0.8, 1.2, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

/** 冰：淡蓝底，斜着的亮痕。 */
/** 压实的雪：白底，几团淡蓝的影子，一些亮晶晶的点。 */
function snowTex(m: MaterialStyle): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = m.base;
  ctx.fillRect(0, 0, 128, 128);
  const r = rng(77);
  ctx.fillStyle = m.dark;
  ctx.globalAlpha = 0.16;
  for (let k = 0; k < 10; k++) {
    ctx.beginPath();
    ctx.ellipse(r() * 128, r() * 128, 10 + r() * 18, 5 + r() * 8, 0, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.95;
  for (let k = 0; k < 18; k++) {
    ctx.beginPath();
    ctx.arc(r() * 128, r() * 128, 0.8 + r() * 1.1, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

function ice(m: MaterialStyle): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = m.base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = m.light;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.5;
  for (const [x, y, l] of [
    [12, 90, 36],
    [66, 120, 22],
    [80, 54, 44],
    [26, 28, 16],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y - l);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = m.dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 80);
  ctx.lineTo(40, 66);
  ctx.lineTo(58, 82);
  ctx.lineTo(128, 64);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return c;
}

export interface ParticleFrames {
  circle: Texture;
  star: Texture;
  square: Texture;
  puff: Texture;
  drop: Texture;
  ring: Texture;
  /** 没有半径的小圆点（雨点 / 气泡）。 */
  dot: Texture;
}

/** 粒子共用一张 448×64 的图集，每格 64×64，都是白色，用 tint 上色。 */
function particleAtlas(): ParticleFrames {
  const [c, ctx] = canvas(448, 64);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  // 0 圆
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, 7);
  ctx.fill();
  // 1 星
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 11 : 27;
    ctx.lineTo(96 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  // 2 方（纸屑）
  ctx.fillRect(166, 12, 20, 40);
  // 3 雾团（软边）
  const g = ctx.createRadialGradient(224, 32, 2, 224, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(192, 0, 64, 64);
  ctx.fillStyle = '#fff';
  // 4 水滴
  ctx.beginPath();
  ctx.moveTo(288, 6);
  ctx.quadraticCurveTo(312, 40, 288, 58);
  ctx.quadraticCurveTo(264, 40, 288, 6);
  ctx.fill();
  // 5 环
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(352, 32, 24, 0, 7);
  ctx.stroke();
  // 6 点
  ctx.beginPath();
  ctx.arc(416, 32, 8, 0, 7);
  ctx.fill();
  const source = Texture.from(c).source;
  source.scaleMode = 'linear';
  const frame = (i: number): Texture => new Texture({ source, frame: new Rectangle(i * 64, 0, 64, 64) });
  return { circle: frame(0), star: frame(1), square: frame(2), puff: frame(3), drop: frame(4), ring: frame(5), dot: frame(6) };
}

export interface Textures {
  cloth: Texture;
  wood: Texture;
  ceramic: Texture;
  metal: Texture;
  ice: Texture;
  snow: Texture;
  particles: ParticleFrames;
}

let cache: Textures | null = null;
/** 所有贴图，只画一次。 */
export function textures(): Textures {
  if (cache) return cache;
  cache = {
    cloth: textureOf(cloth(MATERIALS.cloth as MaterialStyle)),
    wood: textureOf(wood(MATERIALS.wood as MaterialStyle)),
    ceramic: textureOf(ceramic(MATERIALS.ceramic as MaterialStyle)),
    metal: textureOf(metal(MATERIALS.metal as MaterialStyle)),
    ice: textureOf(ice(MATERIALS.ice as MaterialStyle)),
    snow: textureOf(snowTex(MATERIALS.snow as MaterialStyle)),
    particles: particleAtlas(),
  };
  return cache;
}

/**
 * 一团软光：径向渐变，中心 alpha 最大，边上到零。渐变是 local 坐标（相对每个形状的外框），
 * 所以同一种颜色和亮度的光只建一个渐变（它背后是一张贴图），每帧画也不会越建越多。
 */
const glows = new Map<string, FillGradient>();
export function glow(g: Graphics, x: number, y: number, r: number, color: string | number, alpha: number): void {
  const c = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color;
  const a = Math.round(alpha * 100) / 100;
  const key = `${c}|${a}`;
  let grad = glows.get(key);
  if (!grad) {
    const hx = (v: number): string => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    grad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: `${c}${hx(a)}` },
        { offset: 0.45, color: `${c}${hx(a * 0.45)}` },
        { offset: 1, color: `${c}00` },
      ],
    });
    glows.set(key, grad);
  }
  g.circle(x, y, r).fill(grad);
}

/** '#rrggbb' → 数字，Pixi 的 tint 用。 */
export function hex(color: string): number {
  return parseInt(color.replace('#', ''), 16);
}

/** 两个颜色按 t 混（0 = a，1 = b）。 */
export function mix(a: string, b: string, t: number): number {
  const ca = hex(a);
  const cb = hex(b);
  const ch = (shift: number): number => {
    const x = (ca >> shift) & 255;
    const y = (cb >> shift) & 255;
    return Math.round(x + (y - x) * t) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
