/**
 * 关卡数据（契约见 games/hang-on/CONTRACTS.md「关卡契约」）。关卡是 JSON，不是代码。
 * 坐标：像素，y 向下，矩形以左上角为原点。
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 渲染用的种类：ground | step | wall | peg | … 物理不看它。 */
  kind?: string;
  /** 摩擦材质：cloth | wood | ceramic | metal | noodle | ice。 */
  material?: string;
  /** false = 不可抓（只能站）。默认可抓。 */
  grab?: boolean;
}

export interface RopeDef {
  anchor: Pt;
  segments: number;
  segLen: number;
}

export interface SeesawDef {
  /** 转轴（固定点），板子绕它转。 */
  pivot: Pt;
  w: number;
  h?: number;
  material?: string;
}

export interface CrateDef extends Rect {
  mass?: number;
}

export interface FadingDef extends Rect {
  /** 可见（可站可抓）多少秒、消失多少秒。A1 先当普通平台。 */
  on?: number;
  off?: number;
}

export interface SpringDef extends Rect {
  /** 弹力倍数。A1 先当高弹性平台。 */
  power?: number;
}

export interface Level {
  id: string;
  world?: string;
  name?: { zh: string; en: string };
  teaches?: string;
  /** 画面尺寸（摄像机边界），不是碰撞体。 */
  w: number;
  h: number;
  spawn: Pt;
  goal: Rect;
  /** 旗子的位置，纯渲染。 */
  flag?: Pt;
  checkpoints?: Pt[];
  rects: Rect[];
  ropes?: RopeDef[];
  seesaws?: SeesawDef[];
  crates?: CrateDef[];
  fading?: FadingDef[];
  springs?: SpringDef[];
  deathY: number;
  par?: { seconds: number; deathsPerPlayer: number };
  replay?: string;
}

/**
 * 原型里的那一关，照搬：过缝、荡绳子、攀岩、到旗子。
 * 所有矩形默认可抓。
 */
export function sampleLevel(): Level {
  return {
    id: 'proto-01',
    world: 'table',
    name: { zh: '手感原型关', en: 'Feel prototype' },
    teaches: 'all',
    w: 1900,
    h: 1040,
    spawn: { x: 120, y: 600 },
    goal: { x: 1560, y: 60, w: 160, h: 140 },
    flag: { x: 1620, y: 200 },
    checkpoints: [{ x: 1080, y: 530 }],
    rects: [
      { x: -200, y: 640, w: 560, h: 400, kind: 'ground' }, // 起点台
      { x: 470, y: 600, w: 180, h: 440, kind: 'ground' }, // 第二块台（110 px 的缝）
      { x: 600, y: 500, w: 50, h: 100, kind: 'step' }, // 台阶，借它够绳子
      { x: 980, y: 560, w: 240, h: 480, kind: 'ground' }, // 荡过去的落点
      { x: 1220, y: 200, w: 120, h: 840, kind: 'wall' }, // 要爬的崖
      { x: 1198, y: 476, w: 24, h: 16, kind: 'peg' },
      { x: 1198, y: 386, w: 24, h: 16, kind: 'peg' },
      { x: 1198, y: 296, w: 24, h: 16, kind: 'peg' },
      { x: 1340, y: 200, w: 560, h: 840, kind: 'ground' }, // 山顶，旗子在这
    ],
    ropes: [{ anchor: { x: 720, y: 120 }, segments: 8, segLen: 38 }],
    deathY: 1040,
    par: { seconds: 90, deathsPerPlayer: 3 },
  };
}
