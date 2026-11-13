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
  /** 只在这么多人玩的时候才有：[最少, 最多]，两头都算（原版人多了关卡跟着变：缝更宽、抓点更少）。不写就是一直有。 */
  players?: [number, number];
}

export interface RopeDef {
  anchor: Pt;
  segments: number;
  segLen: number;
  players?: [number, number];
}

export interface SeesawDef {
  /** 转轴（固定点），板子绕它转。 */
  pivot: Pt;
  w: number;
  h?: number;
  material?: string;
  players?: [number, number];
}

/**
 * 碰到就死的东西（原版那种尖刺、电）：身体、胳膊、手碰到都算，不能抓，也不挡路。
 * kind 只管画面和声音：spike 尖的（桌上是牙签，温哥华是铁栏杆尖），hot 烫的（红油锅、夜市烤炉），zap 带电的（电炉丝、天车的电轨）。
 * dir：尖头朝哪边，默认朝上。
 */
export interface HazardDef extends Rect {
  kind?: 'spike' | 'hot' | 'zap';
  dir?: 'up' | 'down' | 'left' | 'right';
}

/**
 * 会动的平台：从 (x, y) 出发，依次走到 path 里的每个点（都是矩形左上角的位置），走到头原路回来；
 * loop 就从最后一点直接回起点。speed 像素/秒，每到一个点停 wait 秒；phase 把钟往后拨几秒，几块错开用。
 * 能站能抓，抓着就跟着走。deadly：会动的尖刺，碰到就死，不能抓。
 */
export interface MoverDef extends Rect {
  path: Pt[];
  speed: number;
  wait?: number;
  loop?: boolean;
  phase?: number;
  deadly?: boolean;
  /** deadly 时的样子，和 HazardDef 一样。 */
  hazard?: 'spike' | 'hot' | 'zap';
}

/**
 * 会转的杆子（转动的筷子、旋转门、风车）：绕 pivot 转，arms 根杆子均匀分开，每根从轴心伸出 len 长、h 粗；
 * spin 弧度/秒（正的顺时针），phase 起始角度（弧度）。能抓，抓着跟着转。deadly：带电的杆子，碰到就死，不能抓。
 */
export interface SpinnerDef {
  pivot: Pt;
  arms: number;
  len: number;
  h?: number;
  spin: number;
  phase?: number;
  material?: string;
  deadly?: boolean;
  players?: [number, number];
}

export interface CrateDef extends Rect {
  mass?: number;
}

/** 定时消失的饼干平台：在 `on` 秒、消失 `off` 秒，循环；`phase` 把这一块的钟往后拨几秒，几块错开用。 */
export interface FadingDef extends Rect {
  on?: number;
  off?: number;
  phase?: number;
}

/** 弹簧蜡烛：身体落在它顶上就弹起来，`power` 是弹力倍数（1 = 弹起约一个身高的 5 倍）。 */
export interface SpringDef extends Rect {
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
  hazards?: HazardDef[];
  movers?: MoverDef[];
  spinners?: SpinnerDef[];
  deathY: number;
  par?: { seconds: number; deathsPerPlayer: number };
  replay?: string;
}

/** 这件东西在 n 个人玩的时候有没有。 */
export function forCount(item: { players?: [number, number] }, n: number): boolean {
  const r = item.players;
  return !r || (n >= r[0] && n <= r[1]);
}

/**
 * 按人数摆出来的关卡：只留这么多人玩时该有的东西（`players` 范围）。没有写范围的关原样返回同一个对象。
 * 主机按开局的人数摆；手机局里别的手机按快照里的人数（Snap.np）摆，两边一样。
 */
export function forPlayers(level: Level, n: number): Level {
  const lists = [level.rects, level.ropes, level.seesaws, level.crates, level.fading, level.springs, level.hazards, level.movers, level.spinners];
  if (!lists.some((l) => l?.some((x) => x.players))) return level;
  const keep = <T extends { players?: [number, number] }>(l: T[] | undefined): T[] | undefined => l?.filter((x) => forCount(x, n));
  return {
    ...level,
    rects: keep(level.rects) ?? [],
    ropes: keep(level.ropes),
    seesaws: keep(level.seesaws),
    crates: keep(level.crates),
    fading: keep(level.fading),
    springs: keep(level.springs),
    hazards: keep(level.hazards),
    movers: keep(level.movers),
    spinners: keep(level.spinners),
  };
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

/**
 * 机关样板关（A6，只在开发页：`play.html?level=proto-02` 桌上、`proto-03` 温哥华）：
 * 要命的三种东西、会动的平台、会动的尖刺、会转的杆子、带电的杆子各一个，Codex 做难关时照着写 JSON。
 * 不进大厅，也不保证能过。
 */
export function machinesLevel(world: 'table' | 'van'): Level {
  const ground = world === 'van' ? 'metal' : 'cloth';
  return {
    id: world === 'van' ? 'proto-03' : 'proto-02',
    world,
    name: { zh: '机关样板', en: 'Machines sampler' },
    teaches: 'combine',
    w: 2600,
    h: 1000,
    spawn: { x: 120, y: 596 },
    goal: { x: 2380, y: 380, w: 200, h: 180 },
    checkpoints: [{ x: 1180, y: 596 }],
    rects: [
      { kind: 'ground', x: 0, y: 620, w: 420, h: 380, material: ground },
      { kind: 'ground', x: 900, y: 620, w: 520, h: 380, material: ground },
      { kind: 'ground', x: 2080, y: 560, w: 520, h: 440, material: ground },
    ],
    hazards: [
      { x: 420, y: 760, w: 480, h: 40, kind: 'hot' },
      { x: 1000, y: 584, w: 120, h: 36, kind: 'spike' },
      { x: 1300, y: 520, w: 60, h: 100, kind: 'zap' },
      { x: 1420, y: 800, w: 660, h: 44, kind: 'spike', dir: 'up' },
    ],
    movers: [
      { x: 450, y: 560, w: 180, h: 22, material: 'wood', path: [{ x: 700, y: 560 }], speed: 110, wait: 0.6 },
      { x: 960, y: 420, w: 44, h: 44, path: [{ x: 1360, y: 420 }], speed: 160, deadly: true, hazard: 'zap' },
      { x: 1460, y: 600, w: 160, h: 22, material: world === 'van' ? 'metal' : 'ceramic', path: [{ x: 1460, y: 420 }, { x: 1700, y: 420 }], speed: 90, wait: 0.4, loop: true },
    ],
    spinners: [
      { pivot: { x: 1880, y: 420 }, arms: 3, len: 150, h: 18, spin: 0.9 },
      { pivot: { x: 1180, y: 300 }, arms: 2, len: 120, h: 14, spin: -1.6, deadly: true },
    ],
    deathY: 1000,
    par: { seconds: 120, deathsPerPlayer: 4 },
  };
}

/**
 * 彩蛋关「桌上杂技」：A3 新加的物件都在这一关——饼干平台、弹簧蜡烛、面条绳、瓷碗、蒸笼箱子。
 * 大厅里排在最后，也是开发页看动效用的关。
 */
export function showcaseLevel(): Level {
  return {
    id: 'bonus-01',
    world: 'table',
    name: { zh: '桌上杂技', en: 'Table Circus' },
    teaches: 'combine',
    w: 1280,
    h: 720,
    spawn: { x: 100, y: 536 },
    goal: { x: 1040, y: 260, w: 200, h: 160 },
    checkpoints: [{ x: 820, y: 262 }],
    rects: [
      { kind: 'ground', x: 0, y: 560, w: 300, h: 160, material: 'cloth' },
      { kind: 'ground', x: 720, y: 300, w: 200, h: 20, material: 'wood' }, // 高处的筷子，蜡烛弹上来抓它
      { kind: 'ground', x: 1000, y: 420, w: 280, h: 300, material: 'ceramic' },
      { kind: 'wall', x: 1240, y: 200, w: 40, h: 220, material: 'ceramic' },
    ],
    fading: [
      { x: 360, y: 540, w: 110, h: 24, material: 'wood', on: 4, off: 1.6 },
      { x: 520, y: 500, w: 110, h: 24, material: 'wood', on: 4, off: 1.6, phase: 2 },
    ],
    springs: [{ x: 660, y: 600, w: 50, h: 120, power: 1.2 }],
    ropes: [{ anchor: { x: 975, y: 120 }, segments: 7, segLen: 38 }],
    crates: [{ x: 1030, y: 360, w: 44, h: 60, material: 'wood' }],
    deathY: 790,
    par: { seconds: 75, deathsPerPlayer: 3 },
  };
}
