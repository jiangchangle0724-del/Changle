/**
 * 关卡数据（契约见 games/hang-on/CONTRACTS.md「关卡契约」）。关卡是 JSON，不是代码。
 * 坐标：像素，y 向下，矩形以左上角为原点。
 */
import type { FestId } from '../fest';

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
  /** 第几秒塌掉（不再回来），提前 2 秒开始抖；坐不住的场地用。不写就一直在。 */
  until?: number;
  /** 冰溜子（雪山，A10）：一只手抓着它最多几秒就滑脱（快到时手抖、圈变红），滑了 CFG.slipCooldown 秒抓不了。不写就抓多久都行。 */
  slip?: number;
  /**
   * 会塌的台子（A12）：有人站上去或抓住，过这么多秒就塌（最后 CFG.crumbleWarn 秒抖），
   * 塌了 regrow 秒（不写是 CFG.crumbleRegrow）再长回来。
   */
  crumble?: number;
  regrow?: number;
}

/**
 * 涨潮（A12）：关底下的汤 / 水从 from（不写是 deathY）开始，开局 delay 秒后每秒涨 speed 像素，涨到 top 停。
 * 碰到就死（cause 'tide'）。有人回检查点时水面离那里不到 CFG.tideGap，水退到那下面 CFG.tideGap，停 CFG.tidePause 秒再涨。
 */
/**
 * 摆锤（A12）：吊在 pivot 下面 len 长的锤（半径 r，不写 34），摆幅 amp 弧度，来回一次 period 秒，phase 把钟往后拨几秒。
 * 撞上被弹飞（CFG.pendulumKick）；能抓（抓着跟着荡），grab: false 不能抓；deadly 是烫的（烧红的铁锅），碰到就死。
 */
export interface PendulumDef {
  pivot: Pt;
  len: number;
  amp: number;
  period: number;
  phase?: number;
  r?: number;
  grab?: boolean;
  deadly?: boolean;
  players?: [number, number];
}

/**
 * 阵风（A12）：这块矩形里一阵一阵刮风，往 dir 吹；刮 on 秒（不写 CFG.windOn）停 off 秒（不写 CFG.windOff），phase 错开；
 * 刮之前 CFG.windWarn 秒先起风丝（提醒）。force 是风力的倍数（不写 1）。
 */
export interface WindDef extends Rect {
  dir: 'left' | 'right' | 'up' | 'down';
  force?: number;
  on?: number;
  off?: number;
  phase?: number;
}

export interface TideDef {
  speed: number;
  delay?: number;
  from?: number;
  top?: number;
}

/**
 * 推大石头（11-26）：(x, y) 是圆心，r 是半径（36 到 90，不写是 CFG.boulderR）。又圆又重，一个人推得慢，几个人一起推得动；
 * 能抓、能站在上面（会滚）、能压踏板、能填缝当桥。掉出关卡 CFG.boulderBack 秒后回到原地。
 */
export interface BoulderDef extends Pt {
  r?: number;
  material?: string;
  players?: [number, number];
}

/**
 * 卷屏（11-26）：开局 delay 秒（不写 CFG.scrollDelay）后，一块 view 大的「屏幕」（不写是 CFG.scrollW × CFG.scrollH）
 * 从起点那头往 dir（right 往右、up 往上）每秒挪 speed 像素，挪到关卡那头停。落在屏幕后面那条边外头
 * （CFG.scrollGrace 像素以外）的人被甩掉（死，cause 'scroll'）；复活在屏幕里最靠前的检查点（出生点也算），屏幕里没有就等一等。
 * 屏幕的位置只由关卡和时间算（motion.ts 的 scrollFrame），物理、画面、手机局都用这一个。
 */
export interface ScrollDef {
  dir: 'right' | 'up';
  speed: number;
  delay?: number;
  view?: { w: number; h: number };
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
  /** 第几秒塌掉（和 Rect.until 一样）。 */
  until?: number;
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

/**
 * 踩板门（11-13，多人非配合不可的机关）：踏板是地上一块矮按钮，有人站在上面（身体压着；冻住的人、箱子也算）就按下去；
 * 门是一块会挪开的墙或台子，连着它的踏板按下时往 `move` 那边挪开，没人按了 `hold` 秒以后挪回来，有人挡着就停住，不夹人。
 * 踏板本身是实的（能站），门是运动学刚体（能站能抓，抓着跟着走）。踏板离门远到一个人按着够不着门、跑不过去，就得两个人：
 * 一个按着，一个过去；过去的那个在门那边再按一块开同一扇门的踏板，把按着的人放过来。
 */
export interface PlateDef extends Rect {
  /** 开哪几扇门：门的 id，几扇用空格分开。 */
  opens: string;
}

export interface GateDef extends Rect {
  id: string;
  /** 开的时候挪多少（从关着的位置算），比如往上 `{ "x": 0, "y": -220 }`。 */
  move: Pt;
  /** 每秒挪多少像素（默认 `CFG.gateSpeed`）。 */
  speed?: number;
  /** 没人按了还开着几秒（默认 `CFG.gateHold`）。 */
  hold?: number;
  /** 连着它的几块踏板都按着才开（默认按一块就开）。 */
  all?: boolean;
}

/**
 * 蒸笼喷汽（后厨，A10）：台子上一摞蒸笼（这个矩形，实的，能站能抓），定时从顶上往上喷汽。喷的时候汽柱里
 * （蒸笼顶往上 `reach` 像素，和蒸笼一样宽）的人和物件被往上托，停的时候就是一摞普通的蒸笼。喷之前 CFG.ventWarn 秒盖子跳、冒小汽。
 * `on` 喷几秒、`off` 停几秒（默认 CFG.ventOn / ventOff），`phase` 把钟往后拨几秒（几摞错开），`power` 托的力气倍数。
 */
export interface VentDef extends Rect {
  reach?: number;
  on?: number;
  off?: number;
  phase?: number;
  power?: number;
}

/**
 * 雪山缆车（A10）：一根缆绳从 `from` 到 `to`（两头是站），一串缆椅沿着缆绳从 from 往 to 走，每隔 `gap` 像素一把，
 * 走到 to 那头就收进站里（站在上面的掉下来、抓着的手松开），从 from 那头再出来。座板吊在缆绳下面 `drop` 像素（默认 CFG.liftDrop）。
 * `kind`：`chair` 缆椅（默认，一块能站的座板，上面一根能抓的横杆）、`cabin` 缆车厢（宽的地板，上面一块顶，顶能站能抓）。
 * `speed` 每秒多少像素，`phase` 把钟往后拨。位置只由关卡和时间算（motion.ts 的 `liftChairs`），快照不带。
 */
export interface LiftDef {
  from: Pt;
  to: Pt;
  speed: number;
  gap: number;
  drop?: number;
  kind?: 'chair' | 'cabin';
  phase?: number;
  players?: [number, number];
}

/**
 * 老宅找钥匙（A10）：一把钥匙（物件，能抓、能拽、能丢），开 `opens` 那扇门（GateDef 的 id）。钥匙碰到它的门（离门不到
 * CFG.keyReach）门就开了，一直开着，钥匙插在锁里没了。门只由钥匙开（不连踏板）。钥匙掉下去、碰到要命的东西，
 * 过 CFG.keyBack 秒回来：回到它到过的最后一个（大家激活过的）检查点，没到过就回开局的地方。(x, y) 是钥匙的中心。
 */
export interface KeyDef extends Pt {
  opens: string;
  players?: [number, number];
}

/** 手提的灯笼（老宅，A10）：一个物件，拿着走照亮周围；碰到灭着的灯就点着它。掉了和钥匙一样回来。(x, y) 是灯笼的中心。 */
export interface LanternDef extends Pt {
  players?: [number, number];
}

/**
 * 墙上的灯（老宅，A10）：一盏油灯 / 一支蜡烛，亮着照亮周围 `r` 像素（默认 CFG.lampR）。`off`：一开始灭着，
 * 有人（身体、手）或者灯笼碰一下就点着，点着了一直亮。只管看得见看不见，不碰撞、不挡路。
 */
export interface LampDef extends Pt {
  r?: number;
  off?: boolean;
  players?: [number, number];
}

/**
 * 太空站的拉杆（A10）：墙上一根把手（(x, y) 是中心，默认 44 × 14，能抓），有人的手抓着它就算拉下去了；
 * 开 `opens` 那几扇门（和踏板一样，门的 id 用空格分开）。门写 `all` 就要连着它的拉杆、踏板同时都按着才开：
 * 几根拉杆隔得远，一个人抓不过来，得几个人一起拉。
 */
export interface LeverDef extends Pt {
  opens: string;
  w?: number;
  h?: number;
  players?: [number, number];
}

export interface Level {
  id: string;
  /** 涨潮（A12）。 */
  tide?: TideDef;
  /** 摆锤（A12）。 */
  pendulums?: PendulumDef[];
  /** 阵风（A12）。 */
  winds?: WindDef[];
  /**
   * 手酸（A11）：这关的回放是开着手酸录的、验收开着手酸跑的，分难度的玩法里选中等、困难就开手酸。
   * 不写就不开（还没按手酸重录过的关；简单的关不写）。
   */
  stamina?: boolean;
  /**
   * 长关（A13，Steve 11-18「关太短太直」）：路绕、至少 6 段、两样以上新机关（验收器 longLevel 查）。
   * 大厅里「这关教」前面写「长关」。
   */
  long?: boolean;
  /**
   * 节日关（11-26）：这是哪个节日的关（levels/fest/，C19 做）。节日那几天排在闯关、比谁先简单那一串最前面，
   * 画面挂这个节日的装饰；平常不出现（开发页 `?level=fest-xmas` 还能开）。
   */
  fest?: FestId;
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
  /** 推大石头（11-26）。 */
  boulders?: BoulderDef[];
  /** 卷屏（11-26）。 */
  scroll?: ScrollDef;
  /** 踩板门（11-13）：踏板和门。 */
  plates?: PlateDef[];
  gates?: GateDef[];
  /** 蒸笼喷汽（后厨，A10）。 */
  vents?: VentDef[];
  /** 雪山缆车（A10）。 */
  lifts?: LiftDef[];
  /**
   * 端托盘（后厨，A10）：关里有一托盘点心，要端到终点才算过关（闯关、大团队）。托盘歪过 CFG.traySpill 弧度
   * 超过 CFG.traySpillTime 秒、掉下去、碰到要命的东西，点心就翻了，托盘回到存档的地方。
   * 第一个点是开局托盘放在哪（中心），第 j + 1 个是托盘过了第 j 个检查点以后翻了回哪；没写的用前一个。
   */
  tray?: Pt[];
  /**
   * 老宅找钥匙（A10）：钥匙（开锁着的门）、手提的灯笼、墙上的灯、黑屋子。黑屋子（`dark` 里的矩形）里看不清，
   * 只有灯、灯笼、每个人自己身上那一圈、亮了的检查点照得到的地方看得见；只管画面，物理照常。
   */
  keys?: KeyDef[];
  lanterns?: LanternDef[];
  lamps?: LampDef[];
  dark?: Rect[];
  /**
   * 太空站（A10）：失重区（这些矩形里没有重力，人、胳膊、物件飘着；没抓着东西时摇杆轻轻喷气挪一点）和拉杆。
   */
  zerog?: Rect[];
  levers?: LeverDef[];
  deathY: number;
  par?: { seconds: number; deathsPerPlayer: number };
  replay?: string;
  /** 坐不住的场地：没有终点和检查点，最后还挂着的赢（画面不画旗子和灯）。 */
  arena?: boolean;
  /** 抢金元宝（A9d）的场地：元宝放在哪；每个人站在哪（第 i 个人站 `spawns[i % 几个]`，摔了也回那）。 */
  ingot?: Pt;
  spawns?: Pt[];
  /** 难度（11-13）：0 简单、1 中等、2 困难。不写就按 id 末尾的号算（1 到 6 简单、7 到 12 中等、13 往后困难）；多人的关（levels/multi/）写明。 */
  tier?: 0 | 1 | 2;
  /**
   * 红包（A9b）：藏在关里的几个红包，谁的身体或手碰到就算拿到（不碰撞、不挡路）。
   * 位置用 `npm run envelopes` 从回放里挑（回放里有人的手到过那里，够得着），闯关和大团队里才有。
   */
  envelopes?: Pt[];
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
  const lists = [level.rects, level.ropes, level.seesaws, level.crates, level.boulders, level.fading, level.springs, level.hazards, level.movers, level.spinners, level.plates, level.gates, level.vents, level.lifts, level.keys, level.lanterns, level.lamps, level.dark, level.zerog, level.levers, level.pendulums, level.winds];
  if (!lists.some((l) => l?.some((x) => x.players))) return level;
  const keep = <T extends { players?: [number, number] }>(l: T[] | undefined): T[] | undefined => l?.filter((x) => forCount(x, n));
  return {
    ...level,
    rects: keep(level.rects) ?? [],
    ropes: keep(level.ropes),
    seesaws: keep(level.seesaws),
    crates: keep(level.crates),
    boulders: keep(level.boulders),
    fading: keep(level.fading),
    springs: keep(level.springs),
    hazards: keep(level.hazards),
    movers: keep(level.movers),
    spinners: keep(level.spinners),
    plates: keep(level.plates),
    gates: keep(level.gates),
    vents: keep(level.vents),
    lifts: keep(level.lifts),
    keys: keep(level.keys),
    lanterns: keep(level.lanterns),
    lamps: keep(level.lamps),
    dark: keep(level.dark),
    zerog: keep(level.zerog),
    levers: keep(level.levers),
    pendulums: keep(level.pendulums),
    winds: keep(level.winds),
  };
}

/** 拉杆的那块把手（矩形）。 */
export const leverRect = (l: LeverDef): Rect => {
  const w = l.w ?? 44;
  const h = l.h ?? 14;
  return { x: l.x - w / 2, y: l.y - h / 2, w, h, kind: 'lever', material: 'metal' };
};

/** 这块踏板开哪几扇门。 */
export const opensOf = (p: { opens: string }): string[] => p.opens.split(/\s+/).filter(Boolean);

/** 门开到 `open`（0 关着，1 全开）时在哪（左上角）。 */
export const gateAt = (g: GateDef, open: number): Pt => ({ x: g.x + g.move.x * open, y: g.y + g.move.y * open });

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

/**
 * 踩板门样板（11-13）：开发页 `play.html?level=proto-04&players=2` 两个人试。不进大厅。
 * 第一段：一扇门，门两边各一块踏板，一个人按着放另一个过去，过去的那个按那边的踏板把人放过来。
 * 第二段：一面抓不住的高墙，墙边一块升降台（门往上挪），地上和墙顶各一块踏板：一个人踩地上的，另一个站台子上去；
 * 上去的那个踩墙顶的，把台子再升上来接人。
 */
export function gatesLevel(): Level {
  return {
    id: 'proto-04',
    world: 'table',
    name: { zh: '踩板门样板', en: 'Plates and gates sampler' },
    teaches: 'combine',
    w: 2600,
    h: 720,
    spawn: { x: 100, y: 500 },
    goal: { x: 2380, y: 150, w: 180, h: 150 },
    checkpoints: [
      { x: 1150, y: 500 },
      { x: 1800, y: 260 },
    ],
    rects: [
      { x: 0, y: 540, w: 1500, h: 180, kind: 'ground', material: 'cloth' },
      { x: 1500, y: 300, w: 1100, h: 420, kind: 'wall', material: 'ceramic', grab: false },
    ],
    plates: [
      { x: 300, y: 528, w: 80, h: 12, opens: 'door' },
      { x: 1000, y: 528, w: 80, h: 12, opens: 'door' },
      { x: 1200, y: 528, w: 80, h: 12, opens: 'lift' },
      { x: 1700, y: 288, w: 80, h: 12, opens: 'lift' },
    ],
    gates: [
      { id: 'door', x: 760, y: 200, w: 40, h: 340, move: { x: 0, y: -300 } },
      { id: 'lift', x: 1380, y: 520, w: 110, h: 20, move: { x: 0, y: -220 }, hold: 1.2, grab: false },
    ],
    deathY: 900,
  };
}

/**
 * 后厨样板关（A10，只在开发页：`play.html?level=proto-05`）：两摞蒸笼喷汽（第一摞把人托上一面贴瓷砖、抓不住的墙顶上的砧板，
 * 第二摞托上终点那块台子）、一口热锅、一台灭蚊灯、一排刀，和一托盘点心（端到终点才算过）。Codex 做后厨的关时照着写 JSON。
 */
export function kitchenLevel(): Level {
  return {
    id: 'proto-05',
    world: 'kitchen',
    name: { zh: '后厨样板', en: 'Kitchen sampler' },
    teaches: 'tray',
    w: 2300,
    h: 900,
    spawn: { x: 100, y: 520 },
    goal: { x: 2080, y: 140, w: 200, h: 160 },
    checkpoints: [
      { x: 900, y: 166 },
      { x: 1240, y: 566 },
    ],
    rects: [
      { x: 0, y: 560, w: 700, h: 340, kind: 'ground', material: 'metal' },
      // 贴瓷砖的墙抓不住，只有顶上那块砧板抓得住：得靠汽托上去
      { x: 700, y: 226, w: 60, h: 674, kind: 'wall', material: 'ceramic', grab: false },
      { x: 700, y: 200, w: 400, h: 26, kind: 'step', material: 'wood' },
      { x: 1100, y: 600, w: 600, h: 300, kind: 'ground', material: 'metal' },
      { x: 1700, y: 300, w: 600, h: 600, kind: 'ground', material: 'metal' },
    ],
    vents: [
      { x: 600, y: 520, w: 96, h: 40, reach: 330 },
      { x: 1590, y: 560, w: 96, h: 40, reach: 340, phase: 1.2 },
    ],
    hazards: [
      { x: 1430, y: 572, w: 120, h: 28, kind: 'hot' },
      { x: 1820, y: 272, w: 56, h: 28, kind: 'zap' },
      { x: 1960, y: 278, w: 60, h: 22, kind: 'spike' },
    ],
    tray: [
      { x: 340, y: 554 },
      { x: 810, y: 194 },
      { x: 1150, y: 594 },
    ],
    deathY: 980,
    par: { seconds: 90, deathsPerPlayer: 3 },
  };
}

/**
 * 雪山样板关（A10，只在开发页：`play.html?level=proto-06`）：一条缆椅从山脚坐到半山的木平台；平台上一面冰墙（`slip`，
 * 一只手最多抓 1.6 秒就滑，得快快倒手爬上去），或者坐旁边的缆车厢上去；冰锥、火盆、漏电的电网各一处。Codex 做雪山的关时照着写 JSON。
 */
export function snowLevel(): Level {
  return {
    id: 'proto-06',
    world: 'snow',
    name: { zh: '雪山样板', en: 'Snow mountain sampler' },
    teaches: 'lift',
    w: 2400,
    h: 1100,
    spawn: { x: 100, y: 760 },
    goal: { x: 2180, y: 140, w: 200, h: 160 },
    checkpoints: [{ x: 1600, y: 466 }],
    rects: [
      { x: 0, y: 800, w: 520, h: 300, kind: 'ground', material: 'snow' },
      { x: 1520, y: 500, w: 480, h: 600, kind: 'ground', material: 'wood' },
      { x: 1880, y: 300, w: 120, h: 200, kind: 'wall', material: 'ice', slip: 1.6 },
      { x: 2000, y: 300, w: 400, h: 800, kind: 'ground', material: 'snow' },
      // 起点上方一块挂着冰锥的石头
      { x: 60, y: 560, w: 200, h: 40, kind: 'step', material: 'snow' },
    ],
    lifts: [
      { from: { x: 470, y: 670 }, to: { x: 1530, y: 410 }, speed: 110, gap: 250 },
      // 缆车厢：从木平台坐到冰墙顶上（到头时地板比冰墙高 40 px，跳下去）
      { from: { x: 1560, y: 380 }, to: { x: 1860, y: 190 }, speed: 80, gap: 300, kind: 'cabin', phase: 2 },
    ],
    hazards: [
      { x: 340, y: 770, w: 30, h: 30, kind: 'zap' },
      { x: 80, y: 600, w: 160, h: 30, kind: 'spike', dir: 'down' },
      { x: 2080, y: 280, w: 70, h: 20, kind: 'hot' },
    ],
    deathY: 1180,
    par: { seconds: 90, deathsPerPlayer: 3 },
  };
}

/**
 * 老宅样板关（A10，只在开发页：`play.html?level=proto-07`）：月下的院子，往右是一间黑着的库房（`dark`），门口一盏手提灯笼、
 * 墙上一支灭着的蜡烛（碰一下就点着），地板中间一个窟窿，一地碎瓷片；钥匙在高柜子顶上，拿下来端到库房尽头那扇锁着的门，
 * 门就开了；门后是厅堂，炭盆、漏电的老电线，台阶上去是终点。Codex 做老宅的关时照着写 JSON。
 */
export function houseLevel(): Level {
  return {
    id: 'proto-07',
    world: 'house',
    name: { zh: '老宅样板', en: 'Old house sampler' },
    teaches: 'key',
    w: 2700,
    h: 1100,
    spawn: { x: 100, y: 760 },
    goal: { x: 2480, y: 300, w: 200, h: 160 },
    checkpoints: [{ x: 1950, y: 766 }],
    rects: [
      // 院子：青砖地
      { x: 0, y: 800, w: 900, h: 300, kind: 'ground', material: 'brick' },
      // 库房：木地板，中间一个窟窿；顶上一道抓不住的大梁（门在梁的那头，翻不过去）
      { x: 900, y: 800, w: 340, h: 300, kind: 'ground', material: 'wood' },
      { x: 1360, y: 800, w: 990, h: 300, kind: 'ground', material: 'wood' },
      { x: 880, y: 280, w: 980, h: 40, kind: 'wall', material: 'wood', grab: false },
      // 高柜子，钥匙在柜顶上
      { x: 1520, y: 560, w: 180, h: 240, kind: 'wall', material: 'wood' },
      // 门后的厅堂：一级台阶，再上去是青砖的高台
      { x: 2150, y: 640, w: 200, h: 160, kind: 'step', material: 'wood' },
      { x: 2350, y: 460, w: 350, h: 640, kind: 'ground', material: 'brick' },
    ],
    gates: [{ id: 'door', x: 1820, y: 320, w: 40, h: 480, move: { x: 0, y: -260 }, grab: false }],
    keys: [{ x: 1610, y: 552, opens: 'door' }],
    lanterns: [{ x: 960, y: 780 }],
    lamps: [
      { x: 1180, y: 650, off: true },
      { x: 1700, y: 420, r: 200, off: true },
      { x: 2260, y: 520 },
    ],
    // 黑屋子连着地板一起黑（地板下面的窟窿也看不清）
    dark: [{ x: 900, y: 320, w: 920, h: 780 }],
    hazards: [
      { x: 1400, y: 784, w: 80, h: 16, kind: 'spike' },
      { x: 2060, y: 772, w: 70, h: 28, kind: 'hot' },
      { x: 2230, y: 624, w: 50, h: 16, kind: 'zap' },
    ],
    deathY: 1180,
    par: { seconds: 90, deathsPerPlayer: 3 },
  };
}

/**
 * 太空站样板关（A10，只在开发页：`play.html?level=proto-08&players=2`）：气闸舱的甲板，往右是一段失重舱（`zerog`，
 * 底下没有地板，只有几根扶手，飘出失重舱就掉下去），中间一道激光栅栏；对面的甲板上两根拉杆隔得老远，两个人一起拉着，
 * 舱门才开（门 `all`）；门后是控制室，推进器的尾焰、一地碎片。Codex 做太空站的关时照着写 JSON。
 */
export function spaceLevel(): Level {
  return {
    id: 'proto-08',
    world: 'space',
    name: { zh: '太空站样板', en: 'Space station sampler' },
    teaches: 'float',
    w: 2800,
    h: 1100,
    spawn: { x: 100, y: 760 },
    goal: { x: 2580, y: 380, w: 200, h: 160 },
    checkpoints: [{ x: 1780, y: 666 }],
    rects: [
      // 气闸舱的甲板
      { x: 0, y: 800, w: 700, h: 300, kind: 'ground', material: 'hull' },
      // 失重舱的顶（抓不住的白舱壁）和几根扶手
      { x: 700, y: 120, w: 1000, h: 40, kind: 'wall', material: 'hull', grab: false },
      { x: 820, y: 560, w: 60, h: 14, kind: 'peg', material: 'metal' },
      { x: 1000, y: 430, w: 60, h: 14, kind: 'peg', material: 'metal' },
      { x: 1210, y: 560, w: 60, h: 14, kind: 'peg', material: 'metal' },
      { x: 1420, y: 400, w: 60, h: 14, kind: 'peg', material: 'metal' },
      { x: 1580, y: 540, w: 60, h: 14, kind: 'peg', material: 'metal' },
      // 对面的甲板，一个高一点的台子（第二根拉杆在上面），舱门后面是控制室
      { x: 1700, y: 700, w: 640, h: 400, kind: 'ground', material: 'hull' },
      { x: 2080, y: 520, w: 120, h: 180, kind: 'step', material: 'metal' },
      { x: 2340, y: 700, w: 100, h: 400, kind: 'ground', material: 'hull' },
      { x: 2440, y: 540, w: 360, h: 560, kind: 'ground', material: 'hull' },
      { x: 2300, y: 120, w: 140, h: 180, kind: 'wall', material: 'hull', grab: false },
    ],
    zerog: [{ x: 700, y: 160, w: 1000, h: 640 }],
    levers: [
      { x: 1830, y: 620, opens: 'hatch' },
      { x: 2140, y: 470, opens: 'hatch' },
    ],
    gates: [{ id: 'hatch', x: 2300, y: 300, w: 40, h: 400, move: { x: 0, y: -280 }, all: true, hold: 3, grab: false }],
    hazards: [
      { x: 1290, y: 260, w: 12, h: 200, kind: 'zap' },
      { x: 1960, y: 684, w: 70, h: 16, kind: 'spike' },
      { x: 2470, y: 520, w: 50, h: 20, kind: 'hot' },
    ],
    deathY: 1180,
    par: { seconds: 90, deathsPerPlayer: 3 },
  };
}

/**
 * 新机关样板关（A12，只在开发页：`play.html?level=proto-09&players=2`）：年夜饭桌上，
 * 先过一串会塌的台阶，再躲一口来回荡的铁锅、抓着灯笼荡过一道缝，顶着一阵一阵往回刮的风抓小钉过去，
 * 最后爬一面墙到顶，底下的汤开局 14 秒后开始涨。
 */
export function gadgetsLevel(): Level {
  return {
    id: 'proto-09',
    world: 'table',
    name: { zh: '新机关样板', en: 'New gadgets sampler' },
    teaches: 'all',
    w: 3400,
    h: 1400,
    spawn: { x: 100, y: 1060 },
    goal: { x: 3150, y: 280, w: 200, h: 140 },
    checkpoints: [
      { x: 1300, y: 1066 },
      { x: 2170, y: 1066 },
      { x: 2920, y: 966 },
    ],
    rects: [
      { x: 0, y: 1100, w: 500, h: 300, kind: 'ground' },
      // 会塌的台阶：站上去 1.2 秒塌，5 秒长回来
      { x: 560, y: 1100, w: 150, h: 30, kind: 'step', crumble: 1.2, regrow: 5 },
      { x: 790, y: 1080, w: 150, h: 30, kind: 'step', crumble: 1.2, regrow: 5 },
      { x: 1020, y: 1100, w: 150, h: 30, kind: 'step', crumble: 1.2, regrow: 5 },
      // 铁锅在这块台子上来回荡
      { x: 1240, y: 1100, w: 460, h: 300, kind: 'ground' },
      { x: 2120, y: 1100, w: 260, h: 300, kind: 'ground' },
      // 风里的小钉
      { x: 2470, y: 980, w: 24, h: 16, kind: 'peg' },
      { x: 2610, y: 950, w: 24, h: 16, kind: 'peg' },
      { x: 2750, y: 980, w: 24, h: 16, kind: 'peg' },
      // 爬的墙
      { x: 2860, y: 1000, w: 140, h: 400, kind: 'ground' },
      { x: 3000, y: 420, w: 60, h: 980, kind: 'wall' },
      { x: 2976, y: 880, w: 24, h: 16, kind: 'peg' },
      { x: 2976, y: 770, w: 24, h: 16, kind: 'peg' },
      { x: 2976, y: 660, w: 24, h: 16, kind: 'peg' },
      { x: 2976, y: 550, w: 24, h: 16, kind: 'peg' },
      { x: 3060, y: 420, w: 340, h: 40, kind: 'ground' },
    ],
    pendulums: [
      { pivot: { x: 1480, y: 640 }, len: 400, amp: 0.8, period: 2.6, r: 36 },
      { pivot: { x: 1910, y: 640 }, len: 420, amp: 0.75, period: 3.2, r: 30 },
    ],
    winds: [{ x: 2380, y: 640, w: 480, h: 460, dir: 'left', on: 1.4, off: 2.2 }],
    tide: { speed: 14, delay: 14, from: 1390, top: 560 },
    deathY: 1400,
    par: { seconds: 120, deathsPerPlayer: 4 },
  };
}

/**
 * 推大石头样板关（11-26，只在开发页：`play.html?level=proto-10&players=2`）：年夜饭桌上，先把一个大狮子头推进一道沟里，
 * 它正好填平当桥；再把一个小的滚到踏板上压着，门开了大家过去。
 */
export function boulderLevel(): Level {
  return {
    id: 'proto-10',
    world: 'table',
    name: { zh: '推大石头样板', en: 'Boulder sampler' },
    teaches: 'boulder',
    w: 2800,
    h: 1400,
    spawn: { x: 120, y: 960 },
    goal: { x: 2480, y: 860, w: 200, h: 140 },
    checkpoints: [{ x: 1200, y: 966 }],
    rects: [
      { x: 0, y: 1000, w: 900, h: 400, kind: 'ground' },
      // 沟：140 宽，底比两边低 112（大狮子头的直径），推进去正好填平
      { x: 900, y: 1112, w: 140, h: 288, kind: 'ground' },
      { x: 1040, y: 1000, w: 1060, h: 400, kind: 'ground' },
      { x: 1500, y: 988, w: 120, h: 12, kind: 'plate' },
      { x: 2100, y: 1000, w: 700, h: 400, kind: 'ground' },
    ],
    boulders: [
      { x: 600, y: 944 },
      { x: 1300, y: 960, r: 40 },
    ],
    plates: [{ x: 1500, y: 988, w: 120, h: 12, opens: 'g1' }],
    gates: [{ id: 'g1', x: 1880, y: 640, w: 44, h: 360, move: { x: 0, y: -330 }, hold: 1.2 }],
    deathY: 1400,
    par: { seconds: 90, deathsPerPlayer: 2 },
  };
}

/**
 * 卷屏样板关（11-26，只在开发页：`play.html?level=proto-11&players=2`）：温哥华的一长条码头，开局 5 秒后屏幕往右卷
 * （每秒 55 像素），后面追着海雾；一路是缝、小钉和绳，落在后面的被甩掉，复活在屏幕里最靠前的检查点。
 */
export function scrollLevel(): Level {
  const ground = [
    [0, 1100],
    [1220, 1900],
    [2030, 2800],
    [2950, 3700],
    [3830, 4600],
    [4760, 5500],
    [5640, 6400],
  ];
  return {
    id: 'proto-11',
    world: 'van',
    name: { zh: '卷屏样板', en: 'Scroll sampler' },
    teaches: 'scroll',
    w: 6400,
    h: 1000,
    spawn: { x: 240, y: 760 },
    goal: { x: 6150, y: 660, w: 200, h: 140 },
    checkpoints: [800, 1700, 2600, 3500, 4400, 5300].map((x) => ({ x, y: 766 })),
    rects: [
      ...ground.map(([a, b]) => ({ x: a as number, y: 800, w: (b as number) - (a as number), h: 200, kind: 'ground' })),
      { x: 2860, y: 700, w: 24, h: 16, kind: 'peg' },
      { x: 4670, y: 690, w: 24, h: 16, kind: 'peg' },
    ],
    ropes: [{ anchor: { x: 5570, y: 420 }, segments: 8, segLen: 38 }],
    scroll: { dir: 'right', speed: 55, delay: 5, view: { w: 1600, h: 1000 } },
    deathY: 1300,
    par: { seconds: 150, deathsPerPlayer: 3 },
  };
}

