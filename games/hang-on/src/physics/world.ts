/**
 * 抓紧了 · Hang On — Rapier2D 物理（A1）。
 *
 * 结构（按 docs/hang-on.md「物理与动效」的表）：
 * - 身体：圆形刚体，质量 1，锁旋转，CCD。
 * - 胳膊：每条 3 节胶囊，转动关节相连；肩关节带速度电机，目标角 = 摇杆方向；
 *   没抓着的手还有一根弹簧把手心拉向「肩 + 摇杆 × reach」（原型的伸手模型，摇杆推一半伸一半）。
 * - 手：末节末端的小圆；抓取用一个半径 handR + grabPad 的查询圆在场景里找可抓物。
 * - 抓：按下当帧，在手心到可抓物表面的最近点建一个 revolute joint（手绕抓点转）；松开就删。
 *   拉人就是关节连到对方的身体或胳膊刚体。
 * - 系绳：身体到抓点的 rope joint，长度 = 胳膊长 + 肩宽 + 2，两人成链时面条不会被拉成橡皮筋。
 * - 挂着时：摇杆 = 身体想去的方向，对身体施力（和原型一样），再加横向助力。
 * - 绳子：一串胶囊小刚体 + 转动关节，锚点到绳尾再加一根 rope joint 防拉长。
 * - 关卡：静态矩形（按材质给摩擦）、跷跷板（铰接板）、箱子（动态方块）、
 *   饼干平台（A3：到点就关掉碰撞体，抓着它的手一起松开）、弹簧蜡烛（A3：身体落在顶上就给一个向上的冲量）。
 * - 背叛（A3）：松开抓着的队友之后，队友没抓到东西也没落地就摔死了，算松手的人一笔。
 * - 召唤（A3）：手柄的 act = summon，摔死还没复活的队友直接从你身上掉出来。
 * - 原版那套难的机关（A6）：碰到就死的东西（尖刺、烫的、带电的，只做几何判断，不建碰撞体）；
 *   会动的平台和会转的杆子是运动学刚体，每步按 motion.ts 算的位置摆（画面用同一套算法，两边对得上），
 *   站在上面被带着走，抓着跟着动；带 deadly 的碰到就死。
 * - 人数（A6）：关卡按开局的人数摆（level.ts 的 forPlayers：缝更宽、抓点更少）。
 * - 道具（A9，闯关和大团队）：act = item 用自己带的那一样。速冻：身体换成运动学刚体钉在原地，
 *   碰撞体多一个 FROZEN 组（别人的身体碰得到，能站上去），几秒后化开；拉面：抓着不动的地形的那只手旁边
 *   放一根会碰地形的绳子（和关卡的绳子一样的做法），几秒后断；荷叶：往下掉的速度封顶，摇杆推着横着飘。
 *
 * 单位：像素、秒；y 向下。主机是唯一跑物理的地方（铁律 1）。
 */
import RAPIER from '@dimforge/rapier2d-compat';
import {
  CFG,
  DEFAULT_FRICTION,
  GRAB_R,
  MATERIAL_FRICTION,
  PLAYER_COLORS,
  TETHER_LEN,
} from './config';
import type { ItemId } from '../items';
import { forPlayers, gateAt, opensOf, type FadingDef, type GateDef, type HazardDef, type Level, type MoverDef, type PlateDef, type Pt, type Rect, type SpinnerDef, type SpringDef, type VentDef } from './level';
import { circleHitsBar, circleHitsRect, moverAt, spinnerAngle, spinnerArm, ventColumn, ventState } from './motion';

type RB = RAPIER.RigidBody;
type Col = RAPIER.Collider;
type Joint = RAPIER.ImpulseJoint;

/** 碰撞分组：16 位 membership << 16 | 16 位 filter。 */
/** FROZEN：速冻的人的身体（A9）。别人的身体碰得到它，谁也不冻的时候这一组里没有东西，和以前一样。 */
export const GROUP = { TERRAIN: 0x0001, PLAYER: 0x0002, ROPE: 0x0004, PROP: 0x0008, FROZEN: 0x0010, ALL: 0xffff } as const;
const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;
/**
 * 身体：平时是 PLAYER，碰地形、物件和冻住的人（站得上去）。冻住时（A9）多一个 FROZEN，也碰 PLAYER：
 * 和别人的身体两边都对得上就碰；胳膊的过滤只有地形和物件，自己的、别人的胳膊都不碰它。
 */
const BODY_GROUPS = groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.PROP | GROUP.FROZEN);
const FROZEN_BODY_GROUPS = groups(GROUP.PLAYER | GROUP.FROZEN, GROUP.TERRAIN | GROUP.PROP | GROUP.FROZEN | GROUP.PLAYER);

/** 手柄 → 主机的每帧输入（契约「输入契约」）。 */
export interface PadInput {
  seq?: number;
  t?: number;
  /** 摇杆 x，-1..1 */
  ax: number;
  /** 摇杆 y，-1..1，上为负 */
  ay: number;
  /** 左手抓 */
  gl: boolean;
  /** 右手抓 */
  gr: boolean;
  /** 偶发动作：召唤、表情、用道具（A9）。 */
  act?: 'summon' | 'emote' | 'item';
}

export type GripKind = 'terrain' | 'rope' | 'player' | 'prop';

export interface Grip {
  kind: GripKind;
  /** 抓点的当前世界坐标（每步更新）。 */
  x: number;
  y: number;
  /** 抓的是哪块地形 / 哪个玩家 / 哪根绳 / 哪个物件。 */
  rect?: Rect;
  player?: number;
  rope?: number;
  prop?: number;
  /** 抓的是谁放的拉面（A9）：放面条的人的下标。 */
  noodle?: number;
  /** 抓了多久（秒）。 */
  t: number;
}

interface GripInternal extends Grip {
  joint: Joint;
  tether: Joint;
  target: RB;
  /** 抓点在目标刚体局部坐标里的位置。 */
  local: Pt;
}

type ColInfo =
  | { kind: 'terrain'; rect: Rect }
  | { kind: 'rope'; rope: number; link: number }
  /** 道具拉面的一节（A9）：id 是这根面条的编号。 */
  | { kind: 'noodle'; noodle: number; link: number }
  | { kind: 'player'; player: number; part: 'body' | 'arm' | 'hand'; arm: number }
  | { kind: 'prop'; prop: number }
  | { kind: 'spring'; spring: number; rect: Rect }
  /** 会动的平台、会转的杆子、门：抓着算抓地形；deadly 的、写了 grab: false 的门不能抓。 */
  | { kind: 'moving'; deadly: boolean; noGrab?: boolean };

export interface Arm {
  side: -1 | 1;
  /** 三节，从肩到手。 */
  segs: RB[];
  cols: Col[];
  shoulder: RAPIER.RevoluteImpulseJoint;
  elbows: Joint[];
  /** 当前抓着什么；没抓着是 null。 */
  grip: Grip | null;
  /** 手心的世界坐标（每步更新）。 */
  hand: Pt;
  /** 画面用的折线：肩、两个肘、手心。 */
  pts: Pt[];
  /** 坐不住：刚滑脱，还有几秒抓不了。 */
  slipCd: number;
}

export type Face = 'idle' | 'grab' | 'fly' | 'scream' | 'win';

export interface Player {
  id: number;
  color: string;
  rb: RB;
  bodyCol: Col;
  /** 身体中心和速度（每步更新）。 */
  body: { x: number; y: number; vx: number; vy: number };
  arms: [Arm, Arm];
  aim: Pt;
  grab: [boolean, boolean];
  dead: boolean;
  deadT: number;
  deaths: number;
  face: Face;
  /** 身体是否压在一个朝上的面上。 */
  ground: boolean;
  /** 刚被谁松开（背叛判定用）：没抓到东西也没落地就摔死，算那个人一笔。 */
  heldBy: { by: number; t: number } | null;
  /** 抓过几次。 */
  grabs: number;
  /** 松手害队友摔死几次。 */
  betrayals: number;
  /** 弹簧的冷却（秒），免得一次落地弹好几下。 */
  springCd: number;
  /** 手柄的偶发动作，等下一步处理。 */
  pendingAct: 'summon' | 'emote' | null;
  actAt: number;
  /** 比谁先：到终点了（停在终点里，不再动、不会死）。 */
  done: boolean;
  /** 坐不住：出局了（不再复活）。 */
  out: boolean;
  /** 到终点或者出局是第几秒，没有是 null。 */
  endT: number | null;
  /** 带的道具（A9），没带是 null。 */
  item: ItemId | null;
  /** 道具还要几秒才能再用（从用的那一下算）。 */
  itemCd: number;
  /** 正在起作用的道具（速冻、荷叶）和还剩几秒；拉面挂在墙上，不算在人身上。 */
  itemOn: ItemId | null;
  itemLeft: number;
  /** 手柄按了道具键，下一步用。 */
  pendingItem: boolean;
  /** 上一次没用成（拉面没抓着墙）是第几秒：没用成的事件 1 秒只报一次。 */
  itemFailAt: number;
}

/** 饼干平台的当前样子（画面用）。 */
export interface Fading {
  x: number;
  y: number;
  w: number;
  h: number;
  material?: string;
  /** 现在在不在。 */
  on: boolean;
  /** 距离下一次切换还有几秒。 */
  left: number;
  onS: number;
  offS: number;
}

/** 弹簧蜡烛的当前样子（画面用）。 */
export interface Spring {
  x: number;
  y: number;
  w: number;
  h: number;
  power: number;
  /** 上一次被弹到现在几秒（没弹过是 Infinity）。 */
  hit: number;
}

export interface Betrayal {
  by: number;
  victim: number;
  t: number;
}

export interface Rope {
  anchor: Pt;
  links: RB[];
  /** 锚点、每节末端……最后一个是绳尾把手。 */
  pts: Pt[];
  handle: Pt;
  segLen: number;
}

/** 道具拉面（A9）：谁放的、还剩几秒；pts 和关卡的绳子一样（锚点、每节末端）。 */
export interface Noodle {
  id: number;
  owner: number;
  left: number;
  anchor: Pt;
  pts: Pt[];
  handle: Pt;
  segLen: number;
  links: RB[];
  anchorRb: RB;
}

export interface Prop {
  kind: 'seesaw' | 'crate' | 'ingot' | 'tray';
  rb: RB;
  w: number;
  h: number;
  x: number;
  y: number;
  angle: number;
}

/** 怎么死的：掉下去，或者碰到尖的、烫的、带电的。 */
export type DeathCause = 'fall' | 'spike' | 'hot' | 'zap';

/**
 * 玩法（A7，开局前在大厅里选）：
 * - climb 闯关：大家都到终点才算过，摔了回最近的检查点。
 * - team 大团队：规则和闯关一样，关卡是给 4 到 6 个人的大关。
 * - race 比谁先：各跑各的（或者分两队），先到终点的赢；每个人（每队）有自己的检查点，到了终点就停在那。
 * - last 坐不住：摔了不复活，平台一块块塌，一个地方抓久了手会滑，最后还挂着的赢。
 * - gold 抢金元宝（A9d）：场地中间一个金元宝，抓在手里（只有你一个人抓着）攒够 CFG.goldHold 秒赢一局；摔了回自己那边。
 */
export type GameMode = 'climb' | 'team' | 'race' | 'last' | 'gold';
export interface Rules {
  mode: GameMode;
  /** 比谁先分两队时：每个人在第几队（0 或 1）。不写就是各跑各的。 */
  teams?: number[];
  /** 卡太久来帮手（A9c，外卖无人机）：主机开局时给闯关、大团队打开；回放、验收、测试默认没有（回放不变）。 */
  helper?: boolean;
}

/** 外卖无人机（A9c）在干什么：飞来、等人抓、带人走、放人、飞走。 */
export type DronePhase = 'arrive' | 'wait' | 'carry' | 'drop' | 'leave';
export const CLIMB: Rules = { mode: 'climb' };

export type SimEvent =
  | { type: 'grab'; player: number; kind: GripKind; x: number; y: number }
  | { type: 'release'; player: number; kind: GripKind; x: number; y: number }
  /** 落地（身体从空中压到地上），speed 是落地前的竖直速度。 */
  | { type: 'land'; player: number; speed: number }
  /** 死在哪；碰到机关死的带 cause（掉下去的不带，和以前一样）。 */
  | { type: 'death'; player: number; x: number; y: number; cause?: Exclude<DeathCause, 'fall'> }
  | { type: 'respawn'; player: number; summoned: boolean }
  /** 检查点亮了；比谁先时带是谁过的（每个人、每队各有各的检查点）。 */
  | { type: 'checkpoint'; index: number; player?: number }
  | { type: 'bounce'; player: number; spring: number }
  /** 饼干平台没了 / 回来了。 */
  | { type: 'fade'; index: number; on: boolean }
  /** by 松开 victim 之后 victim 摔死了。 */
  | { type: 'betrayal'; by: number; victim: number }
  | { type: 'summon'; player: number; who: number[] }
  /** 比谁先：有人到终点了，第几个到的。 */
  | { type: 'finish'; player: number; place: number }
  /** 坐不住：这个人出局了（不复活）。 */
  | { type: 'out'; player: number }
  /** 定时的东西塌了（until），塌的那一块在哪。 */
  | { type: 'crumble'; x: number; y: number; w: number; h: number }
  /** 坐不住：一个地方抓太久，手滑了。 */
  | { type: 'slip'; player: number; arm: number }
  /** 这一局结束：闯关是大家都到了；比谁先、坐不住带赢的人（平局可能几个，坐不住一个人玩摔了是空的）。 */
  | { type: 'win'; who?: number[] }
  /** 拿到一个红包（A9b）：第几个、谁拿的、在哪。 */
  | { type: 'envelope'; index: number; player: number; x: number; y: number }
  /** 抢金元宝（A9d）：有人抓住了元宝（t 是他这一局攒了几秒，整秒报一次）；元宝掉下去回到中间（player 是 -1）。 */
  | { type: 'gold'; player: number; t: number; x: number; y: number }
  /** 外卖无人机（A9c）：飞来了（arrive）、有人抓着开始带（carry）、飞走了（leave）；x、y 是提手在哪。 */
  | { type: 'drone'; phase: 'arrive' | 'carry' | 'leave'; x: number; y: number }
  /** 踩板门（11-13）：踏板按下去 / 弹起来了；门开始开 / 开始关（x、y 是踏板、门的中间）。 */
  | { type: 'plate'; index: number; on: boolean; x: number; y: number }
  | { type: 'gate'; index: number; open: boolean; x: number; y: number }
  /** 蒸笼喷汽（后厨，A10）：第几摞快喷了（warn，盖子跳）、喷了（on）；x、y 是蒸笼顶的中间。 */
  | { type: 'vent'; index: number; phase: 'warn' | 'on'; x: number; y: number }
  /** 端托盘（后厨，A10）：点心翻了（spill）、托盘回到存档的地方（back）、端进终点了（home）；x、y 是托盘在哪。 */
  | { type: 'tray'; phase: 'spill' | 'back' | 'home'; x: number; y: number }
  /** 用道具（A9）：ok 是用成了没有（拉面要先抓着墙或台子）；x、y 是在哪用的。 */
  | { type: 'item'; player: number; item: ItemId; ok: boolean; x: number; y: number }
  /** 道具的劲过了：速冻化开、荷叶收起、拉面断了（x、y 是在哪）。 */
  | { type: 'itemEnd'; player: number; item: ItemId; x: number; y: number };

export interface TeleportOpts {
  /** 每只手摆到哪（世界坐标）；null 用默认收拢姿势。 */
  hands?: [Pt | null, Pt | null];
}

let rapierReady: Promise<void> | null = null;
/** 初始化 Rapier（解码内嵌 wasm），只做一次。 */
export function initPhysics(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function toLocal(rb: RB, p: Pt): Pt {
  const t = rb.translation();
  const r = rb.rotation();
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

function toWorld(rb: RB, p: Pt): Pt {
  const t = rb.translation();
  const r = rb.rotation();
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: t.x + c * p.x - s * p.y, y: t.y + s * p.x + c * p.y };
}

function frictionOf(material: string | undefined): number {
  return (material ? MATERIAL_FRICTION[material] : undefined) ?? DEFAULT_FRICTION;
}

/**
 * 一个关卡里的全部物理：地形、绳子、物件、玩家。
 * 用 `createSim()` 建；`setInput()` 喂输入，`step(dt)` 推进，读 `players` / `ropes` / `props` 画画面。
 */
export class Sim {
  readonly level: Level;
  readonly world: RAPIER.World;
  readonly players: Player[] = [];
  readonly ropes: Rope[] = [];
  readonly props: Prop[] = [];
  readonly fadings: Fading[] = [];
  readonly springs: Spring[] = [];
  /** 背叛榜：谁松开谁、什么时候。 */
  readonly betrayals: Betrayal[] = [];
  /** 本帧发生的事（抓、松、死、复活、检查点、过关……），每次 step 清空。 */
  readonly events: SimEvent[] = [];
  time = 0;
  won = false;
  winT = 0;
  /** 全队激活到第几个检查点（-1 = 还在起点）。 */
  checkpoint = -1;
  /** 关卡是按几个人摆的（开局的人数；中途进来的人不重摆）。 */
  readonly layoutFor: number;
  /** 玩法（A7）。 */
  readonly rules: Rules;
  /** 比谁先：到终点的先后（玩家下标）。 */
  readonly finishOrder: number[] = [];
  /** 坐不住：出局的先后。 */
  readonly outOrder: number[] = [];
  /** 结束时赢的人：闯关是全队，比谁先是第一个到的（分队时先到齐的那一队），坐不住是最后挂着的。 */
  winners: number[] = [];
  /** 道具放下来的拉面（A9）。 */
  readonly noodles: Noodle[] = [];
  /** 红包（A9b）：关里藏的几个，拿到没有（闯关和大团队才有）。 */
  readonly envelopes: { x: number; y: number; got: boolean }[] = [];
  /** 抢金元宝（A9d）：元宝是第几个物件、每个人这一局抓着它攒了几秒、元宝掉下去了多久、现在谁一个人抓着（没有是 -1）。 */
  gold: { prop: number; holdT: number[]; need: number; lostT: number; holder: number } | null = null;
  /** 外卖无人机（A9c）：x、y 是外卖袋提手的中间；没来是 null。 */
  drone: { phase: DronePhase; x: number; y: number; t: number; hover: Pt; path: Pt[]; rb: RB; col: Col } | null = null;
  /** 这一段卡了几秒、摔了几次（过一个检查点清零），无人机走了也清零。 */
  private stuckT = 0;
  private segDeaths = 0;
  private stuckCp = -1;
  /** 蒸笼喷汽（后厨，A10）：每摞现在喷着没有、快喷了没有（钟在 motion.ts 的 ventState，画面也用它）。 */
  readonly vents: { def: VentDef; on: boolean; warn: boolean }[] = [];
  /**
   * 端托盘（后厨，A10）：托盘是第几个物件、存档到第几个检查点（-1 是开局那里）、点心翻了没有（翻了几秒）、
   * 歪了几秒、刚回来还有几秒不算翻、在不在终点里。闯关、大团队里关卡有 `tray` 才有。
   */
  tray: { prop: number; cp: number; spilled: boolean; spillT: number; tiltT: number; grace: number; home: boolean } | null = null;
  /** 踩板门（11-13）：踏板按着没有；门开到几成（0 关、1 开）、现在在哪。 */
  readonly plates: { def: PlateDef; x: number; y: number; w: number; h: number; on: boolean }[] = [];
  readonly gates: { def: GateDef; rb: RB; x: number; y: number; w: number; h: number; open: number; holdT: number; opening: boolean }[] = [];
  private noodleSeq = 0;

  private readonly info = new Map<number, ColInfo>();
  private readonly movers: { def: MoverDef; rb: RB }[] = [];
  private readonly spinners: { def: SpinnerDef; rb: RB }[] = [];
  private readonly terrain: RB;
  private readonly grabShape: RAPIER.Ball;
  private readonly grips = new Map<Joint, { player: number; arm: number; g: GripInternal }>();
  private readonly fadingCols: { def: FadingDef; col: Col }[] = [];
  /** 定时塌的东西（until）：到点关掉碰撞体、松开抓着它的手。 */
  private readonly crumbles: { until: number; gone: boolean; cols: Col[]; rect?: Rect; rb?: RB; box: () => Rect }[] = [];
  /** 比谁先：每个人（分队时每队）自己的检查点。 */
  private readonly cpOf: number[] = [];
  /** 坐不住：出局的人已经挪到画面外面停好了。 */
  private readonly parked = new Set<number>();
  /** 每个人离开实在的地方多久了、拽着悬空队友的拉力是不是已经不算了（pullCounts）。 */
  private readonly offSolid: number[] = [];
  private readonly airCut: boolean[] = [];
  private acc = 0;

  constructor(level: Level, nPlayers: number, rules: Rules = CLIMB) {
    this.level = forPlayers(level, nPlayers);
    this.layoutFor = nPlayers;
    this.rules = rules;
    level = this.level;
    const world = new RAPIER.World({ x: 0, y: CFG.gravity });
    world.timestep = CFG.step;
    world.lengthUnit = CFG.lengthUnit;
    world.numSolverIterations = CFG.solverIterations;
    this.world = world;
    this.grabShape = new RAPIER.Ball(GRAB_R);

    // 地形：一个固定刚体，每块矩形一个碰撞体
    this.terrain = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const r of level.rects) this.addRect(r, frictionOf(r.material), 0);
    for (const r of level.fading ?? []) this.addFading(r);
    for (const r of level.springs ?? []) this.addSpring(r);
    for (const def of level.ropes ?? []) this.addRope(def.anchor, def.segments, def.segLen);
    for (const def of level.seesaws ?? []) this.addSeesaw(def.pivot, def.w, def.h ?? 14, frictionOf(def.material));
    for (const def of level.crates ?? []) this.addCrate(def, frictionOf(def.material));
    for (const def of level.movers ?? []) this.addMover(def);
    for (const def of level.spinners ?? []) this.addSpinner(def);
    for (const def of level.plates ?? []) this.addPlate(def);
    for (const def of level.gates ?? []) this.addGate(def);
    for (const def of level.vents ?? []) this.addVent(def);
    if (this.itemsOn) for (const e of level.envelopes ?? []) this.envelopes.push({ x: e.x, y: e.y, got: false });
    // 端托盘（后厨，A10）：闯关、大团队里摆上一托盘点心
    const traySpot = level.tray?.[0];
    if (traySpot && this.itemsOn) this.addTray(traySpot);

    this.setPlayers(nPlayers);
    // 抢金元宝（A9d）：中间放一个元宝
    if (rules.mode === 'gold' && level.ingot) {
      const prop = this.props.length;
      this.addCrate({ x: level.ingot.x - 23, y: level.ingot.y - 13, w: 46, h: 26, mass: 0.6 }, 0.9);
      (this.props[prop] as Prop).kind = 'ingot';
      this.gold = { prop, holdT: this.players.map(() => 0), need: CFG.goldHold, lostT: 0, holder: -1 };
    }
  }

  // ---------------------------------------------------------------- 关卡物件

  private addRect(r: Rect, friction: number, restitution: number): Col {
    const desc = RAPIER.ColliderDesc.cuboid(r.w / 2, r.h / 2)
      .setTranslation(r.x + r.w / 2, r.y + r.h / 2)
      .setFriction(friction)
      .setRestitution(restitution)
      .setCollisionGroups(groups(GROUP.TERRAIN, GROUP.ALL));
    const col = this.world.createCollider(desc, this.terrain);
    this.info.set(col.handle, { kind: 'terrain', rect: r });
    if (r.until !== undefined) this.crumbles.push({ until: r.until, gone: false, cols: [col], rect: r, box: () => r });
    return col;
  }

  /** 饼干平台：普通地形，到点就关掉碰撞体。 */
  private addFading(def: FadingDef): void {
    const col = this.addRect(def, frictionOf(def.material), 0);
    this.fadingCols.push({ def, col });
    const onS = Math.max(0.2, def.on ?? CFG.fadeOn);
    const offS = Math.max(0.2, def.off ?? CFG.fadeOff);
    this.fadings.push({ x: def.x, y: def.y, w: def.w, h: def.h, material: def.material, on: true, left: onS, onS, offS });
    this.tickFading(this.fadings.length - 1);
  }

  /** 弹簧蜡烛：能站能抓，身体落在顶上就弹。 */
  private addSpring(def: SpringDef): void {
    const col = this.addRect(def, frictionOf(def.material), 0);
    const index = this.springs.length;
    this.info.set(col.handle, { kind: 'spring', spring: index, rect: def });
    this.springs.push({ x: def.x, y: def.y, w: def.w, h: def.h, power: def.power ?? 1, hit: Infinity });
  }

  /** 饼干平台的钟：算这一步它在不在，变了就开关碰撞体、松开抓着它的手。 */
  private tickFading(i: number): void {
    const f = this.fadings[i];
    const fc = this.fadingCols[i];
    if (!f || !fc) return;
    const cycle = f.onS + f.offS;
    const t = (((this.time + (fc.def.phase ?? 0)) % cycle) + cycle) % cycle;
    // 塌了（until）就不再回来；left 给个有限的大数（快照里 Infinity 会变成 null）
    const gone = fc.def.until !== undefined && this.time >= fc.def.until;
    const on = !gone && t < f.onS;
    f.left = gone ? 99 : on ? f.onS - t : cycle - t;
    if (on === f.on) return;
    f.on = on;
    fc.col.setEnabled(on);
    if (!on) {
      for (const [, entry] of [...this.grips]) {
        if (entry.g.kind === 'terrain' && entry.g.rect === fc.def) {
          const holder = this.players[entry.player];
          if (holder) this.release(holder, entry.arm);
        }
      }
    }
    this.events.push({ type: 'fade', index: i, on });
  }

  private addRope(anchor: Pt, n: number, segLen: number): void {
    const w = this.world;
    const index = this.ropes.length;
    const anchorRb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchor.x, anchor.y));
    const links: RB[] = [];
    let prev = anchorRb;
    for (let k = 0; k < n; k++) {
      const rb = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(anchor.x, anchor.y + (k + 0.5) * segLen)
          .setLinearDamping(CFG.ropeDamp)
          .setAngularDamping(CFG.ropeDamp)
          .setCanSleep(false),
      );
      const col = w.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(1, segLen / 2 - CFG.ropeLinkR), CFG.ropeLinkR)
          .setMass(CFG.ropeLinkMass)
          .setCollisionGroups(groups(GROUP.ROPE, 0)),
        rb,
      );
      this.info.set(col.handle, { kind: 'rope', rope: index, link: k });
      if (k === n - 1) {
        const handle = w.createCollider(
          RAPIER.ColliderDesc.ball(CFG.ropeHandleR)
            .setTranslation(0, segLen / 2)
            .setMass(CFG.ropeLinkMass * 1.5)
            .setCollisionGroups(groups(GROUP.ROPE, 0)),
          rb,
        );
        this.info.set(handle.handle, { kind: 'rope', rope: index, link: k });
      }
      const jd = RAPIER.JointData.revolute(
        k === 0 ? { x: 0, y: 0 } : { x: 0, y: segLen / 2 },
        { x: 0, y: -segLen / 2 },
      );
      w.createImpulseJoint(jd, prev, rb, true);
      links.push(rb);
      prev = rb;
    }
    // 锚点到绳尾的系绳：绳子再重也拉不长
    const last = links[n - 1];
    if (last) w.createImpulseJoint(RAPIER.JointData.rope(n * segLen, { x: 0, y: 0 }, { x: 0, y: segLen / 2 }), anchorRb, last, true);
    const rope: Rope = { anchor: { ...anchor }, links, pts: [], handle: { x: anchor.x, y: anchor.y + n * segLen }, segLen };
    this.ropes.push(rope);
    this.refreshRope(rope);
  }

  private addSeesaw(pivot: Pt, w: number, h: number, friction: number): void {
    const world = this.world;
    const pivotRb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y));
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pivot.x, pivot.y).setAngularDamping(1.5).setCcdEnabled(true),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
        .setMass(2)
        .setFriction(friction)
        .setCollisionGroups(groups(GROUP.PROP, GROUP.TERRAIN | GROUP.PLAYER | GROUP.PROP)),
      rb,
    );
    world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), pivotRb, rb, true);
    const index = this.props.length;
    this.info.set(col.handle, { kind: 'prop', prop: index });
    this.props.push({ kind: 'seesaw', rb, w, h, x: pivot.x, y: pivot.y, angle: 0 });
  }

  private addCrate(def: Rect & { mass?: number }, friction: number): void {
    const world = this.world;
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(def.x + def.w / 2, def.y + def.h / 2)
        .setLinearDamping(0.2)
        .setAngularDamping(0.5)
        .setCcdEnabled(true),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.w / 2, def.h / 2)
        .setMass(def.mass ?? 0.5)
        .setFriction(Math.min(friction, 0.3))
        .setCollisionGroups(groups(GROUP.PROP, GROUP.TERRAIN | GROUP.PLAYER | GROUP.PROP)),
      rb,
    );
    const index = this.props.length;
    this.info.set(col.handle, { kind: 'prop', prop: index });
    this.props.push({ kind: 'crate', rb, w: def.w, h: def.h, x: def.x + def.w / 2, y: def.y + def.h / 2, angle: 0 });
  }

  /** 蒸笼喷汽（后厨，A10）：蒸笼本身是普通的台子（能站能抓），汽柱只是个范围，喷的时候在 tickVents 里往上托。 */
  private addVent(def: VentDef): void {
    const material = def.material ?? 'wood';
    this.addRect({ ...def, material }, frictionOf(material), 0);
    const s = ventState(def, 0);
    this.vents.push({ def, on: s.on, warn: s.warn });
  }

  /** 端托盘（后厨，A10）：一块薄薄的托盘（at 是中心），能抓能拽；抓在中间端得平，抓在一头就往下歪。 */
  private addTray(at: Pt): void {
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y).setLinearDamping(0.2).setAngularDamping(2).setCcdEnabled(true),
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(CFG.trayW / 2, CFG.trayH / 2)
        .setMass(CFG.trayMass)
        .setFriction(CFG.trayFriction)
        .setCollisionGroups(groups(GROUP.PROP, GROUP.TERRAIN | GROUP.PLAYER | GROUP.PROP)),
      rb,
    );
    const index = this.props.length;
    this.info.set(col.handle, { kind: 'prop', prop: index });
    this.props.push({ kind: 'tray', rb, w: CFG.trayW, h: CFG.trayH, x: at.x, y: at.y, angle: 0 });
    this.tray = { prop: index, cp: -1, spilled: false, spillT: 0, tiltT: 0, grace: CFG.trayGrace, home: false };
  }

  /** 会动的平台：运动学刚体，每步摆到 moverAt 算的位置。 */
  private addMover(def: MoverDef): void {
    const at = moverAt(def, 0);
    const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x + def.w / 2, at.y + def.h / 2));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.w / 2, def.h / 2)
        .setFriction(frictionOf(def.material))
        .setSensor(!!def.deadly)
        .setCollisionGroups(groups(GROUP.TERRAIN, GROUP.ALL)),
      rb,
    );
    this.info.set(col.handle, { kind: 'moving', deadly: !!def.deadly });
    this.movers.push({ def, rb });
    if (def.until !== undefined) {
      this.crumbles.push({ until: def.until, gone: false, cols: [col], rb, box: () => ({ ...moverAt(def, this.time), w: def.w, h: def.h }) });
    }
  }

  /** 踏板：一块实的矮台子（能站），有人压着就算按下（`tickGates` 里量）。 */
  private addPlate(def: PlateDef): void {
    this.addRect(def, frictionOf(def.material ?? 'metal'), 0);
    this.plates.push({ def, x: def.x, y: def.y, w: def.w, h: def.h, on: false });
  }

  /** 门：运动学刚体，能站能抓（和会动的平台一样，抓着跟着走），开到几成由踏板管。 */
  private addGate(def: GateDef): void {
    const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.x + def.w / 2, def.y + def.h / 2));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.w / 2, def.h / 2)
        .setFriction(frictionOf(def.material ?? 'wood'))
        .setCollisionGroups(groups(GROUP.TERRAIN, GROUP.ALL)),
      rb,
    );
    this.info.set(col.handle, { kind: 'moving', deadly: false, noGrab: def.grab === false });
    this.gates.push({ def, rb, x: def.x, y: def.y, w: def.w, h: def.h, open: 0, holdT: 0, opening: false });
  }

  /**
   * 踩板门每一步：哪块踏板有人压着（身体贴着踏板上沿；冻住的人、箱子也算），连着的门往开或者往关挪；
   * 关的时候门要去的地方有人的身子就停住等（不夹人），站在门顶上的也算挡着。
   */
  private tickGates(dt: number): void {
    if (!this.plates.length && !this.gates.length) return;
    const reach = CFG.plateReach;
    this.plates.forEach((pl, k) => {
      const top = { x: pl.x, y: pl.y - reach, w: pl.w, h: reach };
      let on = this.players.some((p) => !p.dead && !p.done && circleHitsRect(p.body, CFG.bodyR, top));
      if (!on)
        on = this.props.some(
          (pr) => pr.kind === 'crate' && pr.y + pr.h / 2 >= pl.y - reach && pr.y + pr.h / 2 <= pl.y + reach && pr.x + pr.w / 2 > pl.x && pr.x - pr.w / 2 < pl.x + pl.w,
        );
      if (on !== pl.on) {
        pl.on = on;
        this.events.push({ type: 'plate', index: k, on, x: pl.x + pl.w / 2, y: pl.y });
      }
    });
    this.gates.forEach((g, k) => {
      const mine = this.plates.filter((pl) => opensOf(pl.def).includes(g.def.id));
      const want = mine.length > 0 && (g.def.all ? mine.every((pl) => pl.on) : mine.some((pl) => pl.on));
      g.holdT = want ? (g.def.hold ?? CFG.gateHold) : Math.max(0, g.holdT - dt);
      const opening = want || g.holdT > 0;
      const len = Math.hypot(g.def.move.x, g.def.move.y) || 1;
      const d = ((g.def.speed ?? CFG.gateSpeed) * dt) / len;
      let next = opening ? Math.min(1, g.open + d) : Math.max(0, g.open - d);
      if (next < g.open) {
        const at = gateAt(g.def, next);
        const box = { x: at.x - 2, y: at.y - 2, w: g.w + 4, h: g.h + 4 };
        if (this.players.some((p) => !p.dead && circleHitsRect(p.body, CFG.bodyR, box))) next = g.open;
      }
      if (opening !== g.opening && (opening ? g.open < 1 : g.open > 0)) {
        const at = gateAt(g.def, g.open);
        this.events.push({ type: 'gate', index: k, open: opening, x: at.x + g.w / 2, y: at.y + g.h / 2 });
      }
      g.opening = opening;
      g.open = next;
      const at = gateAt(g.def, next);
      g.x = at.x;
      g.y = at.y;
    });
  }

  // ---------------------------------------------------------------- 卡太久来帮手（A9c）

  /** 下一个要去的地方：下一个检查点，没有了就是终点中间。 */
  private nextTarget(): Pt {
    const cp = this.level.checkpoints?.[this.checkpoint + 1];
    if (cp) return cp;
    const g = this.level.goal;
    return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  }

  /**
   * 外卖无人机每一步：闯关、大团队里打开了帮手（`rules.helper`）才有。这一段卡久了就飞来，悬在落在最后的人头上；
   * 有人抓住提手就先升到这一路最高的台子上面，横着飞到下一个检查点（或终点）上头，降下来悬一会儿，再飞走。
   * 提手是运动学刚体上的一小条（能抓，跟着走），无人机本身不碰任何东西。
   */
  private tickDrone(dt: number): void {
    const mode = this.rules.mode;
    if (!this.rules.helper || (mode !== 'climb' && mode !== 'team')) return;
    if (this.checkpoint !== this.stuckCp) {
      this.stuckCp = this.checkpoint;
      this.stuckT = 0;
      this.segDeaths = 0;
    }
    const d = this.drone;
    if (!d) {
      this.stuckT += dt;
      if (this.stuckT >= CFG.helpLate || (this.stuckT >= CFG.helpAfter && this.segDeaths >= CFG.helpDeaths)) this.callDrone();
      return;
    }
    d.t += dt;
    const step = CFG.droneSpeed * dt;
    const toward = (to: Pt): boolean => {
      const dx = to.x - d.x;
      const dy = to.y - d.y;
      const len = Math.hypot(dx, dy);
      if (len <= step) {
        d.x = to.x;
        d.y = to.y;
        return true;
      }
      d.x += (dx / len) * step;
      d.y += (dy / len) * step;
      return false;
    };
    const held = (): boolean => [...this.grips.values()].some((e) => e.g.target === d.rb);
    switch (d.phase) {
      case 'arrive':
        if (toward(d.hover)) {
          d.phase = 'wait';
          d.t = 0;
        }
        break;
      case 'wait':
        // 悬着上下轻轻晃；有人抓住就走，等太久没人抓也走
        d.y = d.hover.y + Math.sin(d.t * 2.4) * 5;
        if (held()) {
          d.phase = 'carry';
          d.t = 0;
          d.path = this.dronePath(d.x, d.y);
          this.events.push({ type: 'drone', phase: 'carry', x: d.x, y: d.y });
        } else if (d.t >= CFG.droneWait) this.droneLeave();
        break;
      case 'carry':
        if (d.path.length && toward(d.path[0] as Pt)) d.path.shift();
        if (!d.path.length) {
          d.phase = 'drop';
          d.t = 0;
        }
        break;
      case 'drop':
        if (d.t >= CFG.droneDrop || !held()) this.droneLeave();
        break;
      case 'leave':
        d.y -= step * 1.5;
        // 飞出关卡顶上：还抓着的手松开，无人机没了
        if (d.y < -260 || d.t > 4) {
          for (const [, e] of [...this.grips]) if (e.g.target === d.rb) this.release(this.players[e.player] as Player, e.arm);
          this.world.removeRigidBody(d.rb);
          this.info.delete(d.col.handle);
          this.drone = null;
          this.stuckT = 0;
          this.segDeaths = 0;
        }
        break;
    }
  }

  /**
   * 抢金元宝（A9d）每一步：只有一个人的手抓着元宝，他就攒时间（几个人同时抓着谁都不算）；攒够就赢这一局。
   * 元宝掉出场地（掉进锅里、摔死线下面）一秒后回到中间，抓着它的手松开。
   */
  private tickGold(dt: number): void {
    const g = this.gold;
    if (!g || this.won) return;
    const prop = this.props[g.prop] as Prop;
    const holders = this.players.filter((p) => !p.dead && p.arms.some((a) => a.grip?.kind === 'prop' && a.grip.prop === g.prop));
    if (holders.length !== 1) g.holder = -1;
    else {
      const p = holders[0] as Player;
      const before = g.holdT[p.id] ?? 0;
      const after = before + dt;
      g.holdT[p.id] = after;
      if (g.holder !== p.id || Math.floor(after) > Math.floor(before)) this.events.push({ type: 'gold', player: p.id, t: Math.floor(after), x: prop.x, y: prop.y });
      g.holder = p.id;
      if (after >= g.need) {
        this.won = true;
        this.winT = 0;
        this.winners = [p.id];
        this.events.push({ type: 'win', who: [p.id] });
        p.face = 'win';
        return;
      }
    }
    // 掉出去了：一秒后回到中间
    const lost = prop.y > this.level.deathY || (this.level.hazards ?? []).some((h) => circleHitsRect(prop, 12, h));
    g.lostT = lost ? g.lostT + dt : 0;
    if (g.lostT >= CFG.ingotBack && this.level.ingot) {
      for (const [, e] of [...this.grips]) if (e.g.target === prop.rb) this.release(this.players[e.player] as Player, e.arm);
      prop.rb.setTranslation(this.level.ingot, true);
      prop.rb.setLinvel({ x: 0, y: 0 }, true);
      prop.rb.setAngvel(0, true);
      prop.rb.setRotation(0, true);
      g.lostT = 0;
      this.events.push({ type: 'gold', player: -1, t: 0, x: this.level.ingot.x, y: this.level.ingot.y });
    }
  }

  /**
   * 蒸笼喷汽（后厨，A10）每一步：快喷了、喷了报一声；喷着的那几摞把汽柱里的身体、胳膊、箱子、托盘往上托
   * （往上的速度没到 ventLift 就加，汽柱最上面那几成越往上越弱）。冻住的人不动（钉住了）。
   */
  private tickVents(dt: number): void {
    this.vents.forEach((v, i) => {
      const s = ventState(v.def, this.time);
      const here = v.def.until === undefined || this.time < v.def.until;
      const on = s.on && here;
      const warn = s.warn && here;
      const top = { x: v.def.x + v.def.w / 2, y: v.def.y };
      if (warn && !v.warn) this.events.push({ type: 'vent', index: i, phase: 'warn', ...top });
      if (on && !v.on) this.events.push({ type: 'vent', index: i, phase: 'on', ...top });
      v.on = on;
      v.warn = warn;
      if (!on) return;
      const col = ventColumn(v.def);
      const power = v.def.power ?? 1;
      const max = -CFG.ventLift * power;
      const lift = (rb: RB, x: number, y: number, pad: number, k: number): void => {
        if (x < col.x - pad || x > col.x + col.w + pad || y < col.y || y > v.def.y + 2) return;
        const f = Math.min(1, (y - col.y) / (col.h * CFG.ventFade)) * k;
        const vel = rb.linvel();
        if (vel.y <= max || f <= 0) return;
        rb.setLinvel({ x: vel.x, y: Math.max(max, vel.y - CFG.ventAccel * power * f * dt) }, true);
      };
      for (const p of this.players) {
        if (p.dead || p.done || p.itemOn === 'freeze') continue;
        lift(p.rb, p.body.x, p.body.y, CFG.bodyR * 0.5, 1);
        for (const arm of p.arms) {
          for (const rb of arm.segs) {
            const at = rb.translation();
            lift(rb, at.x, at.y, 0, CFG.ventArm);
          }
        }
      }
      for (const prop of this.props) if (prop.kind !== 'seesaw') lift(prop.rb, prop.x, prop.y, 0, CFG.ventArm);
    });
  }

  /**
   * 端托盘（后厨，A10）每一步：歪太久、掉下去、碰到要命的东西，点心就翻了，过 CFG.trayBack 秒托盘回存档的地方；
   * 托盘到了（大家激活过的）检查点旁边就存档；在不在终点里（闯关、大团队要它在终点里才算过关）。
   */
  private tickTray(dt: number): void {
    const tr = this.tray;
    if (!tr || this.won) return;
    const prop = this.props[tr.prop] as Prop;
    if (tr.spilled) {
      tr.spillT += dt;
      if (tr.spillT >= CFG.trayBack) this.trayBack();
      return;
    }
    tr.grace = Math.max(0, tr.grace - dt);
    const a = Math.atan2(Math.sin(prop.angle), Math.cos(prop.angle));
    tr.tiltT = Math.abs(a) > CFG.traySpill ? tr.tiltT + dt : 0;
    const fell = prop.y > this.level.deathY;
    if (fell || this.trayBurnt(prop) || (tr.grace <= 0 && tr.tiltT >= CFG.traySpillTime)) {
      tr.spilled = true;
      tr.spillT = 0;
      tr.home = false;
      this.events.push({ type: 'tray', phase: 'spill', x: prop.x, y: prop.y });
      return;
    }
    const cps = this.level.checkpoints ?? [];
    for (let j = tr.cp + 1; j <= this.checkpoint && j < cps.length; j++) if (dist(prop, cps[j] as Pt) < CFG.trayCpR) tr.cp = j;
    const g = this.level.goal;
    const pad = 20;
    const home = prop.x > g.x - pad && prop.x < g.x + g.w + pad && prop.y > g.y - pad && prop.y < g.y + g.h + pad;
    if (home && !tr.home) this.events.push({ type: 'tray', phase: 'home', x: prop.x, y: prop.y });
    tr.home = home;
  }

  /** 托盘碰到要命的东西没有（关卡的、会动的、会转的）。 */
  private trayBurnt(c: Pt): boolean {
    const r = CFG.trayH;
    const here = (until: number | undefined): boolean => until === undefined || this.time < until;
    if ((this.level.hazards ?? []).some((h) => circleHitsRect(c, r, h))) return true;
    for (const { def } of this.movers) {
      if (!def.deadly || !here(def.until)) continue;
      const at = moverAt(def, this.time);
      if (circleHitsRect(c, r, { x: at.x, y: at.y, w: def.w, h: def.h })) return true;
    }
    for (const { def } of this.spinners) {
      if (!def.deadly || !here(def.until)) continue;
      const angle = spinnerAngle(def, this.time);
      for (let j = 0; j < Math.max(1, def.arms); j++) if (circleHitsBar(c, r, spinnerArm(def, j, angle))) return true;
    }
    return false;
  }

  /** 翻了的托盘回到存档的地方：摆平、不动，抓着它的手松开。 */
  private trayBack(): void {
    const tr = this.tray;
    if (!tr) return;
    const prop = this.props[tr.prop] as Prop;
    const spots = this.level.tray ?? [];
    const at = spots[Math.min(spots.length - 1, tr.cp + 1)] ?? spots[0] ?? { x: prop.x, y: prop.y };
    for (const [, e] of [...this.grips]) if (e.g.target === prop.rb) this.release(this.players[e.player] as Player, e.arm);
    prop.rb.setTranslation(at, true);
    prop.rb.setLinvel({ x: 0, y: 0 }, true);
    prop.rb.setAngvel(0, true);
    prop.rb.setRotation(0, true);
    prop.x = at.x;
    prop.y = at.y;
    prop.angle = 0;
    tr.spilled = false;
    tr.spillT = 0;
    tr.tiltT = 0;
    tr.grace = CFG.trayGrace;
    this.events.push({ type: 'tray', phase: 'back', x: at.x, y: at.y });
  }

  /** 叫无人机：悬在离下一个目标最远的那个活着的人头上。 */
  private callDrone(): void {
    const target = this.nextTarget();
    const live = this.players.filter((p) => !p.dead && !p.done);
    if (!live.length) return;
    const p = live.reduce((a, b) => (dist(b.body, target) > dist(a.body, target) ? b : a));
    const hover = { x: p.body.x, y: p.body.y - CFG.droneHang };
    const from = { x: hover.x, y: hover.y - 420 };
    const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(from.x, from.y));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(28, 5).setFriction(1).setCollisionGroups(groups(GROUP.TERRAIN, GROUP.ALL & ~GROUP.TERRAIN & ~GROUP.PLAYER)),
      rb,
    );
    this.info.set(col.handle, { kind: 'moving', deadly: false });
    this.drone = { phase: 'arrive', x: from.x, y: from.y, t: 0, hover, path: [], rb, col };
    this.events.push({ type: 'drone', phase: 'arrive', x: hover.x, y: hover.y });
  }

  /** 带人的路线：先升到这一路上最高的台子再高 200 px（至少比目标高 140 px），横着飞过去，再降到目标上头。 */
  private dronePath(x: number, y: number): Pt[] {
    const t = this.nextTarget();
    const lo = Math.min(x, t.x) - 80;
    const hi = Math.max(x, t.x) + 80;
    let top = Math.min(y, t.y - CFG.droneHang);
    for (const r of this.level.rects) if (r.x < hi && r.x + r.w > lo) top = Math.min(top, r.y - 200);
    for (const m of this.level.movers ?? []) if (m.x < hi && m.x + m.w > lo) top = Math.min(top, m.y - 200);
    const cruise = Math.max(-180, top);
    return [
      { x, y: cruise },
      { x: t.x, y: cruise },
      { x: t.x, y: t.y - CFG.droneHang + 20 },
    ];
  }

  private droneLeave(): void {
    const d = this.drone;
    if (!d || d.phase === 'leave') return;
    d.phase = 'leave';
    d.t = 0;
    this.events.push({ type: 'drone', phase: 'leave', x: d.x, y: d.y });
  }

  /** 会转的杆子：运动学刚体在轴心，每根杆子一个长条碰撞体，每步转到 spinnerAngle 算的角度。 */
  private addSpinner(def: SpinnerDef): void {
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.pivot.x, def.pivot.y).setRotation(spinnerAngle(def, 0)),
    );
    const cols: Col[] = [];
    for (let j = 0; j < Math.max(1, def.arms); j++) {
      const arm = spinnerArm(def, j, 0);
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(arm.len / 2, arm.h / 2)
          .setTranslation(arm.x - def.pivot.x, arm.y - def.pivot.y)
          .setRotation(arm.angle)
          .setFriction(frictionOf(def.material))
          .setSensor(!!def.deadly)
          .setCollisionGroups(groups(GROUP.TERRAIN, GROUP.ALL)),
        rb,
      );
      this.info.set(col.handle, { kind: 'moving', deadly: !!def.deadly });
      cols.push(col);
    }
    this.spinners.push({ def, rb });
    if (def.until !== undefined) {
      this.crumbles.push({ until: def.until, gone: false, cols, rb, box: () => ({ x: def.pivot.x - def.len, y: def.pivot.y - def.len, w: def.len * 2, h: def.len * 2 }) });
    }
  }

  /** 这一步会动的东西该在哪：下一次 world.step() 把它们挪过去（站在上面的、抓着的跟着走）。 */
  private moveKinematics(): void {
    for (const { def, rb } of this.movers) {
      const at = moverAt(def, this.time);
      rb.setNextKinematicTranslation({ x: at.x + def.w / 2, y: at.y + def.h / 2 });
    }
    for (const { def, rb } of this.spinners) rb.setNextKinematicRotation(spinnerAngle(def, this.time));
    for (const g of this.gates) g.rb.setNextKinematicTranslation({ x: g.x + g.w / 2, y: g.y + g.h / 2 });
    if (this.drone) this.drone.rb.setNextKinematicTranslation({ x: this.drone.x, y: this.drone.y });
  }

  /**
   * 这个人碰到要命的东西没有（身体、两个手心、两个肘）：碰到了返回怎么死的、在哪。
   * 只做几何，不靠碰撞体：尖刺不挡路，碰一下就够。
   */
  private hazardHit(p: Player): { cause: Exclude<DeathCause, 'fall'>; at: Pt } | null {
    const lv = this.level;
    const here = (until: number | undefined): boolean => until === undefined || this.time < until;
    const deadlyMovers = this.movers.filter((m) => m.def.deadly && here(m.def.until));
    const deadlySpinners = this.spinners.filter((s) => s.def.deadly && here(s.def.until));
    if (!lv.hazards?.length && !deadlyMovers.length && !deadlySpinners.length) return null;
    const parts: { c: Pt; r: number }[] = [{ c: p.body, r: CFG.bodyR * 0.85 }];
    for (const arm of p.arms) {
      parts.push({ c: arm.hand, r: CFG.handR });
      for (const e of arm.pts.slice(1, -1)) parts.push({ c: e, r: CFG.segR });
    }
    for (const { c, r } of parts) {
      for (const h of lv.hazards ?? []) if (circleHitsRect(c, r, h)) return { cause: (h as HazardDef).kind ?? 'spike', at: { ...c } };
      for (const { def } of deadlyMovers) {
        const at = moverAt(def, this.time);
        if (circleHitsRect(c, r, { x: at.x, y: at.y, w: def.w, h: def.h })) return { cause: def.hazard ?? 'spike', at: { ...c } };
      }
      for (const { def } of deadlySpinners) {
        const angle = spinnerAngle(def, this.time);
        for (let j = 0; j < Math.max(1, def.arms); j++) if (circleHitsBar(c, r, spinnerArm(def, j, angle))) return { cause: 'zap', at: { ...c } };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- 玩家

  /** 把玩家数调到 n：多的加在出生点，少的连同别人抓着它的手一起去掉。 */
  setPlayers(n: number): void {
    while (this.players.length < n) this.addPlayer();
    while (this.players.length > n) this.removePlayer();
  }

  private addPlayer(): void {
    const id = this.players.length;
    const world = this.world;
    const spawn = this.startPoint(id);
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y)
        .lockRotations()
        .setLinearDamping(CFG.bodyDamp)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    const bodyCol = world.createCollider(
      RAPIER.ColliderDesc.ball(CFG.bodyR)
        .setMass(CFG.bodyMass)
        .setFriction(CFG.bodyFriction)
        .setRestitution(0)
        .setCollisionGroups(BODY_GROUPS),
      rb,
    );
    this.info.set(bodyCol.handle, { kind: 'player', player: id, part: 'body', arm: -1 });

    const p: Player = {
      id,
      color: PLAYER_COLORS[id % PLAYER_COLORS.length] ?? '#ffffff',
      rb,
      bodyCol,
      body: { x: spawn.x, y: spawn.y, vx: 0, vy: 0 },
      arms: [this.makeArm(id, rb, spawn, -1), this.makeArm(id, rb, spawn, 1)],
      aim: { x: 0, y: 0 },
      grab: [false, false],
      dead: false,
      deadT: 0,
      deaths: 0,
      face: 'idle',
      ground: false,
      heldBy: null,
      grabs: 0,
      betrayals: 0,
      springCd: 0,
      pendingAct: null,
      actAt: -10,
      done: false,
      out: false,
      endT: null,
      item: null,
      itemCd: 0,
      itemOn: null,
      itemLeft: 0,
      pendingItem: false,
      itemFailAt: -10,
    };
    this.players.push(p);
    this.refreshPlayer(p);
  }

  private makeArm(playerId: number, body: RB, bodyPos: Pt, side: -1 | 1): Arm {
    const world = this.world;
    const shoulder = { x: bodyPos.x + side * CFG.shoulderDX, y: bodyPos.y + CFG.shoulderDY };
    const pose = chainPose(shoulder, { x: shoulder.x + side * 55, y: shoulder.y - 20 });
    const segs: RB[] = [];
    const cols: Col[] = [];
    const armIndex = side < 0 ? 0 : 1;
    for (let k = 0; k < CFG.armSegs; k++) {
      const c = pose.centers[k] as Pt;
      const rb = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(c.x, c.y)
          .setRotation(pose.angles[k] as number)
          .setGravityScale(CFG.armGravity)
          .setLinearDamping(CFG.armDamp)
          .setAngularDamping(CFG.armAngDamp)
          .setCcdEnabled(true)
          .setCanSleep(false),
      );
      const cap = world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(1, CFG.segLen / 2 - CFG.segR), CFG.segR)
          .setRotation(Math.PI / 2)
          .setMass(CFG.segMass)
          .setFriction(CFG.armFriction)
          .setCollisionGroups(groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.PROP)),
        rb,
      );
      this.info.set(cap.handle, { kind: 'player', player: playerId, part: 'arm', arm: armIndex });
      segs.push(rb);
      cols.push(cap);
    }
    const last = segs[CFG.armSegs - 1] as RB;
    const hand = world.createCollider(
      RAPIER.ColliderDesc.ball(CFG.handR)
        .setTranslation(CFG.segLen / 2, 0)
        .setMass(CFG.handMass)
        .setFriction(CFG.armFriction)
        .setCollisionGroups(groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.PROP)),
      last,
    );
    this.info.set(hand.handle, { kind: 'player', player: playerId, part: 'hand', arm: armIndex });
    cols.push(hand);

    const shoulderJoint = world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: side * CFG.shoulderDX, y: CFG.shoulderDY }, { x: -CFG.segLen / 2, y: 0 }),
      body,
      segs[0] as RB,
      true,
    ) as RAPIER.RevoluteImpulseJoint;
    shoulderJoint.configureMotorModel(RAPIER.MotorModel.AccelerationBased);
    const elbows: Joint[] = [];
    for (let k = 1; k < CFG.armSegs; k++) {
      elbows.push(
        world.createImpulseJoint(
          RAPIER.JointData.revolute({ x: CFG.segLen / 2, y: 0 }, { x: -CFG.segLen / 2, y: 0 }),
          segs[k - 1] as RB,
          segs[k] as RB,
          true,
        ),
      );
    }
    return { side, segs, cols, shoulder: shoulderJoint, elbows, grip: null, hand: { ...pose.end }, pts: [], slipCd: 0 };
  }

  private removePlayer(): void {
    const p = this.players.pop();
    if (!p) return;
    this.releaseAll(p);
    this.releaseGripsOn(p.id);
    for (const arm of p.arms) for (const rb of arm.segs) this.world.removeRigidBody(rb);
    this.world.removeRigidBody(p.rb);
    for (const [h, i] of [...this.info]) if (i.kind === 'player' && i.player === p.id) this.info.delete(h);
  }

  /** 第 i 个玩家的复活点：最近激活的检查点，没有就是起点；几个人并排错开。 */
  private spawnPoint(i: number): Pt {
    // 抢金元宝：每个人站自己那个位置（摔了也回那）
    const sp = this.rules.mode === 'gold' ? this.level.spawns : undefined;
    if (sp?.length) return sp[i % sp.length] as Pt;
    // 比谁先：回自己（自己那一队）到过的检查点
    const at = this.rules.mode === 'race' ? (this.cpOf[this.teamOf(i)] ?? -1) : this.checkpoint;
    const cp = at >= 0 ? this.level.checkpoints?.[at] : undefined;
    if (cp) return { x: cp.x + i * 30, y: cp.y };
    return { x: this.level.spawn.x + i * 44, y: this.level.spawn.y };
  }

  /**
   * 摔死以后的复活点。照常是 spawnPoint；那里离活着的队友不到一个身体宽（玩家之间不碰撞，叠上了就分不开），
   * 就沿着同一高度往两边找，找一个脚下有不会消失的平台、身体放得下、离谁都够远的地方。
   * 照常的位置空着就不动，所以回放里没人挡道的复活和以前一模一样。
   */
  private respawnPoint(i: number): Pt {
    const s = this.spawnPoint(i);
    const minGap = CFG.bodyR * 2;
    const others = this.players.filter((q) => q.id !== i && !q.dead && !q.done).map((q) => q.body);
    const gap = (x: number): number => others.reduce((m, b) => Math.min(m, Math.hypot(b.x - x, b.y - s.y)), Infinity);
    // 照常的位置挨着要命的东西（几个人错开站，最后一个可能站到尖刺上）也往旁边找
    const nearHazard = (this.level.hazards ?? []).some((h) => circleHitsRect(s, CFG.bodyR + 4, h));
    // 第 5、6 个人错开站到了台子外面（关卡只保证 4 个人的落脚）也往旁边找
    const footing = i < 4 || this.standable(s.x, s.y);
    if (gap(s.x) >= minGap && !nearHazard && footing) return s;
    let best: Pt | null = footing && !nearHazard ? s : null;
    let bestGap = best ? gap(s.x) : -1;
    for (let k = 1; k <= 25; k++) {
      for (const x of [s.x + k * 8, s.x - k * 8]) {
        if (!this.standable(x, s.y)) continue;
        const g = gap(x);
        if (g >= minGap) return { x, y: s.y };
        if (g > bestGap) {
          best = { x, y: s.y };
          bestGap = g;
        }
      }
    }
    // 两边都站不住：回 1 号的位置（每一关都保证那里有落脚），和别人叠着也比掉下去好
    return best ?? this.spawnPoint(0);
  }

  /** 开局放人的位置：前 4 个人照关卡摆的（回放靠它）；第 5、6 个人那里站不住就往旁边找。 */
  private startPoint(i: number): Pt {
    const s = this.spawnPoint(i);
    if (i < 4 || this.standable(s.x, s.y, false)) return s;
    for (let k = 1; k <= 40; k++) {
      for (const x of [s.x - k * 8, s.x + k * 8]) if (this.standable(x, s.y, false)) return { x, y: s.y };
    }
    return this.spawnPoint(0);
  }

  /** (x, y) 放得下一个身体，而且脚下 80 px 内有不会消失的平台（饼干会没、蜡烛会弹，都不算），离要命的东西也够远。 */
  private standable(x: number, y: number, lasting = true): boolean {
    const r = CFG.bodyR;
    const lv = this.level;
    // 复活时会塌的（until）不算站得住；开局放人时还在就算（lasting = false）
    const footing = lv.rects.some((b) => (!lasting || b.until === undefined) && x - r >= b.x && x + r <= b.x + b.w && b.y - y >= r && b.y - y <= 80);
    if (!footing) return false;
    if ((lv.hazards ?? []).some((h) => circleHitsRect({ x, y }, r + 40, h))) return false;
    const solid = [...lv.rects, ...(lv.fading ?? []), ...(lv.springs ?? [])];
    return !solid.some((b) => x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h);
  }

  // ---------------------------------------------------------------- 输入

  /** 摇杆归一（超过 1 缩回单位圆，死区 0.12），抓键按住就是抓。 */
  setInput(i: number, input: PadInput): void {
    const p = this.players[i];
    if (!p) return;
    let ax = input.ax;
    let ay = input.ay;
    const l = Math.hypot(ax, ay);
    if (l > 1) {
      ax /= l;
      ay /= l;
    }
    p.aim.x = l < 0.12 ? 0 : ax;
    p.aim.y = l < 0.12 ? 0 : ay;
    p.grab[0] = !!input.gl;
    p.grab[1] = !!input.gr;
    // 偶发动作：手柄会连发几帧保证送到，1 秒内同一个动作只算一次
    if ((input.act === 'summon' || input.act === 'emote') && this.time - p.actAt >= CFG.actCooldown) {
      p.actAt = this.time;
      p.pendingAct = input.act;
    }
    // 道具：冷却里连发的那几帧不算；没用成的（拉面没抓着墙）下一步再试，事件 1 秒只报一次
    if (input.act === 'item' && p.item && p.itemCd <= 0) p.pendingItem = true;
  }

  /** 这个人带哪样道具（A9），null 是不带。换了道具，正在起作用的那样照旧到时候才完。 */
  setItem(i: number, item: ItemId | null): void {
    const p = this.players[i];
    if (p) p.item = item;
  }

  /** 这一局用不用得了道具：闯关和大团队用得了。 */
  get itemsOn(): boolean {
    return this.rules.mode === 'climb' || this.rules.mode === 'team';
  }

  /** 第 i 个人的道具冷却好了多少：0 刚用完，1 能用了（手柄上那条充能条）。 */
  itemReady(i: number): number {
    const p = this.players[i];
    if (!p?.item || p.itemCd <= 0) return 1;
    const cd = p.item === 'freeze' ? CFG.freezeCd : p.item === 'noodle' ? CFG.noodleCd : CFG.leafCd;
    return Math.max(0, Math.min(1, 1 - p.itemCd / cd));
  }

  /**
   * 把玩家搬到 (x, y)，速度清零，松开它抓的和抓它的手。
   * 手默认收在身侧；`hands` 可以指定每只手心摆到哪（比如正好放在绳尾上）。
   */
  teleport(i: number, x: number, y: number, opts: TeleportOpts = {}): void {
    const p = this.players[i];
    if (!p) return;
    this.releaseAll(p);
    this.releaseGripsOn(p.id);
    if (p.itemOn) this.endItem(p, false);
    p.rb.setTranslation({ x, y }, true);
    p.rb.setLinvel({ x: 0, y: 0 }, true);
    p.arms.forEach((arm, k) => {
      const shoulder = { x: x + arm.side * CFG.shoulderDX, y: y + CFG.shoulderDY };
      const want = opts.hands?.[k] ?? { x: shoulder.x + arm.side * 55, y: shoulder.y - 20 };
      const pose = chainPose(shoulder, want);
      arm.segs.forEach((rb, s) => {
        const c = pose.centers[s] as Pt;
        rb.setTranslation({ x: c.x, y: c.y }, true);
        rb.setRotation(pose.angles[s] as number, true);
        rb.setLinvel({ x: 0, y: 0 }, true);
        rb.setAngvel(0, true);
      });
    });
    this.world.propagateModifiedBodyPositionsToColliders();
    p.dead = false;
    p.deadT = 0;
    p.heldBy = null;
    p.springCd = CFG.springCooldown;
    this.refreshPlayer(p);
  }

  // ---------------------------------------------------------------- 推进

  /** 推进 dt 秒：内部按固定 120 Hz 走整数步，多出来的零头攒到下一次。 */
  step(dt: number): void {
    // 先清事件：赢了以后照样每步清，不然 win 会被主机一步步重复读到（横幅不消失、过关音乐叠几百遍）
    this.events.length = 0;
    if (this.won) {
      this.winT += dt;
      return;
    }
    this.acc += dt;
    while (this.acc >= CFG.step - 1e-6) {
      this.substep();
      this.acc -= CFG.step;
      if (this.won) {
        this.acc = 0;
        break;
      }
    }
  }

  private substep(): void {
    const dt = CFG.step;
    this.time += dt;
    for (let i = 0; i < this.fadings.length; i++) this.tickFading(i);
    this.tickCrumbles();
    for (const s of this.springs) s.hit += dt;
    this.tickItems(dt);
    this.tickGates(dt);
    this.tickDrone(dt);
    const pulls = this.pullCounts(dt);
    for (const p of this.players) {
      if (p.dead || p.done || p.itemOn === 'freeze') continue;
      this.control(p, pulls[p.id] ?? true);
      if (p.itemOn === 'leaf') this.glide(p, dt);
    }
    this.tickVents(dt);
    const slips = this.rules.mode === 'last';
    for (const p of this.players) {
      // 冻住的人手也冻住了：抓着的照旧抓着，没抓的抓不了
      if (p.dead || p.done || p.itemOn === 'freeze') continue;
      p.arms.forEach((arm, k) => {
        if (arm.slipCd > 0) arm.slipCd = Math.max(0, arm.slipCd - dt);
        if (p.grab[k] && !arm.grip && arm.slipCd <= 0) this.tryGrab(p, k);
        else if (!p.grab[k] && arm.grip) this.release(p, k);
        if (arm.grip) {
          arm.grip.t += dt;
          // 坐不住：一个地方抓太久手就滑了，一会儿抓不了（按着键也不会马上又抓回去）
          if (slips && arm.grip.t >= CFG.lastGripMax) {
            this.release(p, k);
            arm.slipCd = CFG.slipCooldown;
            this.events.push({ type: 'slip', player: p.id, arm: k });
          }
        }
      });
    }
    this.moveKinematics();
    this.world.step();
    for (const p of this.players) {
      const wasGround = p.ground;
      const vyBefore = p.body.vy;
      this.refreshPlayer(p);
      if (!p.dead && p.ground && !wasGround && vyBefore > CFG.landSpeed) this.events.push({ type: 'land', player: p.id, speed: vyBefore });
      if (p.ground) p.heldBy = null;
      p.springCd = Math.max(0, p.springCd - dt);
    }
    for (const rope of this.ropes) this.refreshRope(rope);
    for (const n of this.noodles) this.refreshRope(n);
    for (const prop of this.props) {
      const t = prop.rb.translation();
      prop.x = t.x;
      prop.y = t.y;
      prop.angle = prop.rb.rotation();
    }
    this.lifeAndDeath(dt);
    this.tickGold(dt);
    this.acts();
    this.pickEnvelopes();
    this.checkpoints();
    this.tickTray(dt);
    this.checkEnd();
    for (const p of this.players) this.updateFace(p);
  }

  /** 定时塌的东西到点了：关掉碰撞体，松开抓着它的手（站在上面的自然掉下去）。 */
  private tickCrumbles(): void {
    for (const c of this.crumbles) {
      if (c.gone || this.time < c.until) continue;
      c.gone = true;
      for (const col of c.cols) col.setEnabled(false);
      for (const [, entry] of [...this.grips]) {
        const on = c.rb ? entry.g.target === c.rb : entry.g.kind === 'terrain' && entry.g.rect === c.rect;
        const holder = this.players[entry.player];
        if (on && holder) this.release(holder, entry.arm);
      }
      const b = c.box();
      this.events.push({ type: 'crumble', x: b.x, y: b.y, w: b.w, h: b.h });
    }
  }

  /** 比谁先分队时这个人在哪一队（各跑各的时每人自己一队）。 */
  private teamOf(i: number): number {
    return this.rules.teams ? (this.rules.teams[i] ?? i % 2) : i;
  }

  /** 手柄的偶发动作：召唤 = 摔死还没复活的队友立刻从你身上掉出来。 */
  private acts(): void {
    for (const p of this.players) {
      const act = p.pendingAct;
      p.pendingAct = null;
      if (!act || p.dead || p.done || act !== 'summon') continue;
      // 坐不住摔了就出局；比谁先各跑各的没有队友可以拉
      if (this.rules.mode === 'last' || this.rules.mode === 'gold' || (this.rules.mode === 'race' && !this.rules.teams)) continue;
      const who: number[] = [];
      for (const q of this.players) {
        if (!q.dead || q.done) continue;
        if (this.rules.mode === 'race' && this.teamOf(q.id) !== this.teamOf(p.id)) continue;
        this.teleport(q.id, p.body.x, p.body.y - CFG.bodyR * 2);
        q.face = 'idle';
        who.push(q.id);
        this.events.push({ type: 'respawn', player: q.id, summoned: true });
      }
      if (who.length) this.events.push({ type: 'summon', player: p.id, who });
    }
  }

  /**
   * 谁的拉力算数。拉身体的力只加在身体上，没有反作用力：抓着地形时地形扛着，没事。可抓着的是一个悬空的队友、两个人都没
   * 连到实在的地方时，这股力就是凭空推着两个人走：两个人互相抓着推摇杆往上，或者一个先往上一窜、另一个抓住他再往上拽、
   * 再换过来，一秒一千多 px 一直往天上飞。所以没连上的人往上快过 CFG.airPullRise，或者离开实在的地方超过
   * CFG.airPullTime 秒，拉力就不算了，直到又连到实在的地方：最多一起蹦一下，飞不上天。
   * 实在的地方：自己站在地上，抓着地形、绳子、跷跷板或箱子，比谁先到了终点钉在那里；抓着这样的人也算连上了。
   * 两个门槛放在录好的回放之外（12 关里没连上还在拽队友的时候，最久离地 0.92 秒、最快往上 538 px/s，都在 van-10），
   * 所以回放和以前一模一样。
   */
  private pullCounts(dt: number): boolean[] {
    const ok = this.players.map((p) => {
      if (p.dead) return false;
      // 冻住的人钉在原地，和站在地上一样实在（抓着他的人也算连上了）
      if (p.done || p.ground || p.itemOn === 'freeze') return true;
      // 抓着会动的物件（箱子、托盘、元宝）：物件得靠在实在的东西上才算（端着托盘悬在空中往上推，不能把自己推上天）
      return p.arms.some((a) => a.grip !== null && a.grip.kind !== 'player' && (a.grip.kind !== 'prop' || this.propRests(a.grip.prop ?? -1)));
    });
    // 抓着已经连上的人也算连上；最多 6 个人，转几圈就定了
    for (let changed = true; changed; ) {
      changed = false;
      this.players.forEach((p, i) => {
        if (ok[i] || p.dead) return;
        if (p.arms.some((a) => a.grip?.kind === 'player' && a.grip.player !== undefined && ok[a.grip.player])) {
          ok[i] = true;
          changed = true;
        }
      });
    }
    return this.players.map((p, i) => {
      if (ok[i] || p.dead) {
        this.offSolid[i] = 0;
        this.airCut[i] = false;
        return true;
      }
      this.offSolid[i] = (this.offSolid[i] ?? 0) + dt;
      if (p.body.vy < -CFG.airPullRise || (this.offSolid[i] ?? 0) > CFG.airPullTime) this.airCut[i] = true;
      return !this.airCut[i];
    });
  }

  /**
   * 这个物件靠在实在的东西上没有：跷跷板钉在轴上，算；箱子、托盘、元宝要贴着地形或别的物件（不算人）。
   * 拉力只推身体，物件自己悬在空中时拽着它往上推就是凭空往上飞（和两个人在空中互相抓着一样，#435）。
   */
  private propRests(i: number): boolean {
    const prop = this.props[i];
    if (!prop) return false;
    if (prop.kind === 'seesaw') return true;
    const col = prop.rb.collider(0);
    let rests = false;
    this.world.contactPairsWith(col, (other) => {
      if (rests) return;
      const info = this.info.get(other.handle);
      if (!info || info.kind === 'player') return;
      this.world.contactPair(col, other, (manifold) => {
        for (let k = 0; k < manifold.numContacts(); k++) if (manifold.contactDist(k) < 1.5) rests = true;
      });
    });
    return rests;
  }

  /** 一步里的操作：挂着时对身体施力，没抓着的手伸向摇杆方向。 */
  private control(p: Player, pulls: boolean): void {
    const body = p.rb;
    body.resetForces(false);
    const aimed = p.aim.x !== 0 || p.aim.y !== 0;
    const gripping = p.arms.filter((a) => a.grip);
    body.setLinearDamping(gripping.length && !p.ground ? CFG.hangDamp : CFG.bodyDamp);
    p.bodyCol.setFriction(gripping.length && aimed ? CFG.bodyFrictionPulling : CFG.bodyFriction);
    if (gripping.length && aimed && pulls) {
      // 挂着时摇杆指「身体想去哪」，不是「手指哪」：往上推翻上去，左右推是荡。
      let tx = 0;
      let ty = 0;
      for (const arm of gripping) {
        tx += arm.hand.x + p.aim.x * CFG.pullReach - arm.side * CFG.shoulderDX;
        ty += arm.hand.y + p.aim.y * CFG.pullReach - CFG.shoulderDY;
      }
      tx /= gripping.length;
      ty /= gripping.length;
      const t = body.translation();
      const kx = p.ground ? CFG.pullKxGround : CFG.pullKx;
      const boost = p.ground ? CFG.swingBoostGround : CFG.swingBoost;
      body.addForce(
        {
          x: CFG.bodyMass * (kx * (tx - t.x) + boost * p.aim.x),
          y: CFG.bodyMass * (CFG.pullK * (ty - t.y)),
        },
        true,
      );
    }
    const t = body.translation();
    const armMass = CFG.armSegs * CFG.segMass + CFG.handMass;
    for (const arm of p.arms) {
      const seg0 = arm.segs[0] as RB;
      const last = arm.segs[CFG.armSegs - 1] as RB;
      for (const rb of arm.segs) {
        rb.resetForces(false);
        rb.resetTorques(false);
      }
      if (arm.grip) {
        // 抓着的手：肩电机关掉，让拉力顺着关节传到身体
        arm.shoulder.configureMotorVelocity(0, 0);
        continue;
      }
      const sx = t.x + arm.side * CFG.shoulderDX;
      const sy = t.y + CFG.shoulderDY;
      const dx = aimed ? p.aim.x : arm.side * CFG.restX;
      const dy = aimed ? p.aim.y : CFG.restY;
      // 手的弹簧：手心朝「肩 + 摇杆 × reach」
      const hx = sx + dx * CFG.reach;
      const hy = sy + dy * CFG.reach;
      const k = CFG.reachK * armMass;
      last.addForceAtPoint({ x: k * (hx - arm.hand.x), y: k * (hy - arm.hand.y) }, arm.hand, true);
      // 肩电机：上臂指向摇杆方向
      const target = Math.atan2(dy, dx);
      const err = wrapAngle(target - seg0.rotation());
      arm.shoulder.configureMotorVelocity(clamp(CFG.shoulderGain * err, -CFG.shoulderMaxVel, CFG.shoulderMaxVel), CFG.shoulderDamping);
    }
  }

  // ---------------------------------------------------------------- 抓与放

  private tryGrab(p: Player, k: number): void {
    const arm = p.arms[k] as Arm;
    const h = arm.hand;
    let best: { col: Col; point: Pt; d: number; info: ColInfo } | null = null;
    this.world.intersectionsWithShape(h, 0, this.grabShape, (col) => {
      const info = this.info.get(col.handle);
      // 关掉的碰撞体（消失中的饼干）这一步查询还查得到，自己跳过
      if (!info || !col.isEnabled()) return true;
      if (info.kind === 'player') {
        const other = this.players[info.player];
        if (info.player === p.id || !other || other.dead) return true;
      }
      if (info.kind === 'terrain' && info.rect.grab === false) return true;
      if (info.kind === 'moving' && (info.deadly || info.noGrab)) return true;
      const proj = col.projectPoint(h, true);
      if (!proj) return true;
      const d = proj.isInside ? 0 : dist(proj.point, h);
      if (d <= GRAB_R && (!best || d < best.d)) best = { col, point: { x: proj.point.x, y: proj.point.y }, d, info };
      return true;
    });
    if (!best) return;
    const { col, point, info } = best as { col: Col; point: Pt; d: number; info: ColInfo };
    const target = col.parent();
    if (!target) return;
    const local = toLocal(target, point);
    const last = arm.segs[CFG.armSegs - 1] as RB;
    const joint = this.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: CFG.segLen / 2, y: 0 }, local),
      last,
      target,
      true,
    );
    joint.setContactsEnabled(false);
    const tether = this.world.createImpulseJoint(RAPIER.JointData.rope(TETHER_LEN, { x: 0, y: 0 }, local), p.rb, target, true);
    const kind: GripKind = info.kind === 'spring' || info.kind === 'moving' ? 'terrain' : info.kind === 'noodle' ? 'rope' : info.kind;
    const grip: GripInternal = {
      kind,
      x: point.x,
      y: point.y,
      t: 0,
      joint,
      tether,
      target,
      local,
    };
    if (info.kind === 'terrain' || info.kind === 'spring') grip.rect = info.rect;
    if (info.kind === 'player') grip.player = info.player;
    if (info.kind === 'rope') grip.rope = info.rope;
    if (info.kind === 'noodle') grip.noodle = this.noodles.find((n) => n.id === info.noodle)?.owner;
    if (info.kind === 'prop') grip.prop = info.prop;
    arm.grip = grip;
    this.grips.set(joint, { player: p.id, arm: k, g: grip });
    p.grabs++;
    p.heldBy = null;
    this.events.push({ type: 'grab', player: p.id, kind, x: point.x, y: point.y });
  }

  private release(p: Player, k: number): void {
    const arm = p.arms[k] as Arm;
    const g = arm.grip as GripInternal | null;
    if (!g) return;
    this.world.removeImpulseJoint(g.joint, true);
    this.world.removeImpulseJoint(g.tether, true);
    this.grips.delete(g.joint);
    arm.grip = null;
    // 松开的是队友，而队友此刻悬空又没抓着别的：记下来，几秒内摔死就是背叛
    if (g.kind === 'player' && g.player !== undefined && !p.dead) {
      const victim = this.players[g.player];
      if (victim && !victim.dead && !victim.ground && !victim.arms.some((a) => a.grip)) victim.heldBy = { by: p.id, t: this.time };
    }
    this.events.push({ type: 'release', player: p.id, kind: g.kind, x: g.x, y: g.y });
  }

  private releaseAll(p: Player): void {
    p.arms.forEach((arm, k) => {
      if (arm.grip) this.release(p, k);
    });
  }

  /** 松开所有抓着第 id 号玩家的手。 */
  private releaseGripsOn(id: number): void {
    for (const [, entry] of [...this.grips]) {
      if (entry.g.kind === 'player' && entry.g.player === id) {
        const holder = this.players[entry.player];
        if (holder) this.release(holder, entry.arm);
      }
    }
  }

  // ---------------------------------------------------------------- 状态刷新

  private refreshPlayer(p: Player): void {
    const t = p.rb.translation();
    const v = p.rb.linvel();
    p.body.x = t.x;
    p.body.y = t.y;
    p.body.vx = v.x;
    p.body.vy = v.y;
    for (const arm of p.arms) {
      const pts: Pt[] = [{ x: t.x + arm.side * CFG.shoulderDX, y: t.y + CFG.shoulderDY }];
      for (const rb of arm.segs) pts.push(toWorld(rb, { x: CFG.segLen / 2, y: 0 }));
      arm.pts = pts;
      const hand = pts[pts.length - 1] as Pt;
      arm.hand.x = hand.x;
      arm.hand.y = hand.y;
      const g = arm.grip as GripInternal | null;
      if (g) {
        const w = toWorld(g.target, g.local);
        g.x = w.x;
        g.y = w.y;
      }
    }
    // 地面：身体和某个碰撞体的接触法线朝上
    p.ground = false;
    let springHit = -1;
    this.world.contactPairsWith(p.bodyCol, (other) => {
      if (p.ground && springHit >= 0) return;
      this.world.contactPair(p.bodyCol, other, (manifold, flipped) => {
        if (manifold.numContacts() === 0) return;
        let close = false;
        for (let i = 0; i < manifold.numContacts(); i++) if (manifold.contactDist(i) < 1.5) close = true;
        if (!close) return;
        const n = manifold.normal();
        const ny = flipped ? -n.y : n.y;
        // 法线从身体指向对方：对方在身体下面时 y 为正（y 向下）
        if (ny > 0.5) {
          p.ground = true;
          const info = this.info.get(other.handle);
          if (info?.kind === 'spring') springHit = info.spring;
        }
      });
    });
    // 弹簧蜡烛：身体压在顶上就弹起来（冷却里不重复弹）
    if (springHit >= 0 && !p.dead && p.springCd <= 0) {
      const s = this.springs[springHit];
      if (s) {
        // 整个人一起弹：身体和两条胳膊都给同样的向上速度，不然胳膊的阻尼会把身体拽住
        const launch = CFG.springLaunch * s.power;
        p.rb.setLinvel({ x: p.body.vx, y: 0 }, true);
        p.rb.applyImpulse({ x: 0, y: -p.rb.mass() * launch }, true);
        for (const arm of p.arms) for (const rb of arm.segs) rb.applyImpulse({ x: 0, y: -rb.mass() * launch }, true);
        p.springCd = CFG.springCooldown;
        s.hit = 0;
        this.events.push({ type: 'bounce', player: p.id, spring: springHit });
      }
    }
  }

  private refreshRope(rope: Rope | Noodle): void {
    const pts: Pt[] = [{ ...rope.anchor }];
    for (const rb of rope.links) pts.push(toWorld(rb, { x: 0, y: rope.segLen / 2 }));
    rope.pts = pts;
    const end = pts[pts.length - 1] as Pt;
    rope.handle.x = end.x;
    rope.handle.y = end.y;
  }

  /** 红包（A9b）：活着的人身体或手心碰到就算拿到（只读位置，不影响物理）。 */
  private pickEnvelopes(): void {
    this.envelopes.forEach((e, k) => {
      if (e.got) return;
      for (const p of this.players) {
        if (p.dead) continue;
        const near = (q: Pt, r: number): boolean => Math.hypot(q.x - e.x, q.y - e.y) <= r + CFG.envelopeR;
        if (near(p.body, CFG.bodyR) || p.arms.some((a) => near(a.hand, CFG.handR))) {
          e.got = true;
          this.events.push({ type: 'envelope', index: k, player: p.id, x: e.x, y: e.y });
          return;
        }
      }
    });
  }

  // ---------------------------------------------------------------- 道具（A9）

  /** 每步：冷却往下走，起作用的道具到点就完，按了道具键的用掉，拉面到点就断。 */
  private tickItems(dt: number): void {
    for (const p of this.players) {
      if (p.itemCd > 0) p.itemCd = Math.max(0, p.itemCd - dt);
      if (p.itemOn) {
        p.itemLeft -= dt;
        if (p.itemLeft <= 0) this.endItem(p, true);
      }
      if (p.pendingItem) {
        p.pendingItem = false;
        this.useItem(p);
      }
    }
    for (const n of [...this.noodles]) {
      n.left -= dt;
      if (n.left <= 0) this.cutNoodle(n);
    }
  }

  private useItem(p: Player): void {
    const item = p.item;
    if (!item || p.dead || p.done || p.itemCd > 0 || p.itemOn || !this.itemsOn) return;
    const at = { x: p.body.x, y: p.body.y };
    if (item === 'noodle') {
      const spot = this.noodleSpot(p);
      if (!spot) {
        if (this.time - p.itemFailAt >= CFG.actCooldown) {
          p.itemFailAt = this.time;
          this.events.push({ type: 'item', player: p.id, item, ok: false, x: at.x, y: at.y });
        }
        return;
      }
      this.addNoodle(p, spot);
      p.itemCd = CFG.noodleCd;
      this.events.push({ type: 'item', player: p.id, item, ok: true, x: spot.x, y: spot.y });
      return;
    }
    if (item === 'freeze') {
      p.itemOn = 'freeze';
      p.itemLeft = CFG.freezeTime;
      p.itemCd = CFG.freezeCd;
      p.heldBy = null;
      p.rb.setLinvel({ x: 0, y: 0 }, true);
      p.rb.resetForces(true);
      p.rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      p.bodyCol.setCollisionGroups(FROZEN_BODY_GROUPS);
      // 胳膊也定住：加在胳膊上的力会一直留着（Rapier 的力不自己清），肩电机停下
      for (const arm of p.arms) {
        for (const rb of arm.segs) {
          rb.resetForces(true);
          rb.resetTorques(true);
        }
        arm.shoulder.configureMotorVelocity(0, CFG.shoulderDamping);
      }
    } else {
      p.itemOn = 'leaf';
      p.itemLeft = CFG.leafTime;
      p.itemCd = CFG.leafCd;
    }
    this.events.push({ type: 'item', player: p.id, item, ok: true, x: at.x, y: at.y });
  }

  /** 起作用的道具完了：速冻化开（身体变回动态刚体，站在上面的人自然掉下去），荷叶收起。loud：要不要事件（死了、传送时不要）。 */
  private endItem(p: Player, loud: boolean): void {
    const item = p.itemOn;
    if (!item) return;
    p.itemOn = null;
    p.itemLeft = 0;
    if (item === 'freeze') {
      p.bodyCol.setCollisionGroups(BODY_GROUPS);
      p.rb.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      p.rb.setLinvel({ x: 0, y: 0 }, true);
    }
    if (loud) this.events.push({ type: 'itemEnd', player: p.id, item, x: p.body.x, y: p.body.y });
  }

  /**
   * 荷叶：往下掉的速度封顶，摇杆推着往左右飘（抓着东西、站在地上时不管）。
   * 胳膊也封顶，不然垂着的胳膊往下拽身体，一步一步又快起来。
   */
  private glide(p: Player, dt: number): void {
    if (p.ground || p.arms.some((a) => a.grip)) return;
    const v = p.rb.linvel();
    const want = p.aim.x * CFG.leafDrift;
    const vx = v.x + clamp(want - v.x, -CFG.leafAccel * dt, CFG.leafAccel * dt);
    const vy = Math.min(v.y, CFG.leafFall);
    if (vx !== v.x || vy !== v.y) p.rb.setLinvel({ x: vx, y: vy }, true);
    for (const arm of p.arms) {
      for (const rb of arm.segs) {
        const a = rb.linvel();
        if (a.y > CFG.leafFall) rb.setLinvel({ x: a.x, y: CFG.leafFall }, true);
      }
    }
  }

  /**
   * 拉面从哪儿垂下来：抓着不动的地形（关卡的台子、墙，不是会动的、跷跷板、绳子、队友）的那只手旁边。
   * 抓在台面上就挪到离抓点近的那条边外面，抓在侧面、底面就往外挪一点：面条顺着墙或者从空中垂下去。
   */
  private noodleSpot(p: Player): Pt | null {
    for (const arm of p.arms) {
      const g = arm.grip as GripInternal | null;
      if (!g || g.kind !== 'terrain' || g.target !== this.terrain || !g.rect) continue;
      const r = g.rect;
      const out = CFG.noodleGap;
      const dTop = Math.abs(g.y - r.y);
      const dBottom = Math.abs(g.y - (r.y + r.h));
      const dLeft = Math.abs(g.x - r.x);
      const dRight = Math.abs(g.x - (r.x + r.w));
      const near = Math.min(dTop, dBottom, dLeft, dRight);
      if (near === dLeft) return { x: r.x - out, y: Math.max(r.y + out, g.y) };
      if (near === dRight) return { x: r.x + r.w + out, y: Math.max(r.y + out, g.y) };
      if (near === dBottom) return { x: g.x, y: r.y + r.h + out };
      // 台面上：挪到近的那条边外面
      return g.x - r.x < r.x + r.w - g.x ? { x: r.x - out, y: r.y + out } : { x: r.x + r.w + out, y: r.y + out };
    }
    return null;
  }

  /** 放一根拉面：和关卡的绳子一样（一串胶囊小刚体 + 转动关节 + 防拉长的系绳），只是会碰地形（顺着墙垂）。 */
  private addNoodle(p: Player, anchor: Pt): void {
    const w = this.world;
    const id = this.noodleSeq++;
    const n = CFG.noodleSegs;
    const segLen = CFG.noodleSegLen;
    const anchorRb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchor.x, anchor.y));
    const links: RB[] = [];
    let prev = anchorRb;
    for (let k = 0; k < n; k++) {
      const rb = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(anchor.x, anchor.y + (k + 0.5) * segLen)
          .setLinearDamping(CFG.ropeDamp)
          .setAngularDamping(CFG.ropeDamp)
          .setCanSleep(false),
      );
      const col = w.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(1, segLen / 2 - CFG.ropeLinkR), CFG.ropeLinkR)
          .setMass(CFG.ropeLinkMass)
          .setFriction(0.4)
          .setCollisionGroups(groups(GROUP.ROPE, GROUP.TERRAIN)),
        rb,
      );
      this.info.set(col.handle, { kind: 'noodle', noodle: id, link: k });
      if (k === n - 1) {
        const handle = w.createCollider(
          RAPIER.ColliderDesc.ball(CFG.ropeHandleR)
            .setTranslation(0, segLen / 2)
            .setMass(CFG.ropeLinkMass * 1.5)
            .setCollisionGroups(groups(GROUP.ROPE, GROUP.TERRAIN)),
          rb,
        );
        this.info.set(handle.handle, { kind: 'noodle', noodle: id, link: k });
      }
      const jd = RAPIER.JointData.revolute(k === 0 ? { x: 0, y: 0 } : { x: 0, y: segLen / 2 }, { x: 0, y: -segLen / 2 });
      w.createImpulseJoint(jd, prev, rb, true);
      links.push(rb);
      prev = rb;
    }
    const last = links[n - 1];
    if (last) w.createImpulseJoint(RAPIER.JointData.rope(n * segLen, { x: 0, y: 0 }, { x: 0, y: segLen / 2 }), anchorRb, last, true);
    const noodle: Noodle = { id, owner: p.id, left: CFG.noodleTime, anchor: { ...anchor }, pts: [], handle: { x: anchor.x, y: anchor.y + n * segLen }, segLen, links, anchorRb };
    this.noodles.push(noodle);
    this.refreshRope(noodle);
  }

  /** 拉面断了：抓着它的手松开（人自然掉下去），刚体都拿掉。 */
  private cutNoodle(n: Noodle): void {
    const bodies = new Set(n.links.map((rb) => rb.handle));
    for (const [, entry] of [...this.grips]) {
      if (!bodies.has(entry.g.target.handle)) continue;
      const holder = this.players[entry.player];
      if (holder) this.release(holder, entry.arm);
    }
    for (const [h, info] of [...this.info]) if (info.kind === 'noodle' && info.noodle === n.id) this.info.delete(h);
    for (const rb of n.links) this.world.removeRigidBody(rb);
    this.world.removeRigidBody(n.anchorRb);
    this.noodles.splice(this.noodles.indexOf(n), 1);
    const end = n.handle;
    this.events.push({ type: 'itemEnd', player: n.owner, item: 'noodle', x: end.x, y: end.y });
  }

  private lifeAndDeath(dt: number): void {
    for (const p of this.players) {
      // 到了终点的人停在那，不会再死
      if (p.done) continue;
      if (!p.dead && p.body.y > this.level.deathY) this.kill(p, 'fall', p.body);
      if (!p.dead) {
        const hit = this.hazardHit(p);
        if (hit) this.kill(p, hit.cause, hit.at);
      }
      if (p.dead) {
        p.deadT += dt;
        // 坐不住：出局了不复活；一秒后把人挪到画面下面停好（不然一直往下掉）
        if (p.out) {
          if (p.deadT >= CFG.respawnDelay && !this.parked.has(p.id)) this.park(p);
          continue;
        }
        if (p.deadT >= CFG.respawnDelay) {
          const s = this.respawnPoint(p.id);
          this.teleport(p.id, s.x, s.y);
          p.face = 'idle';
          this.events.push({ type: 'respawn', player: p.id, summoned: false });
        }
      }
    }
  }

  /** 坐不住出局的人：挪到死线下面，身体钉住（胳膊挂着），不再算。 */
  private park(p: Player): void {
    const deadT = p.deadT;
    this.teleport(p.id, p.body.x, this.level.deathY + 400);
    p.dead = true;
    p.deadT = deadT;
    p.rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.parked.add(p.id);
  }

  /** 死了：记一次，被队友刚松开的算他背叛，松开所有手（自己的和抓着自己的）。 */
  private kill(p: Player, cause: DeathCause, at: Pt): void {
    if (p.itemOn) this.endItem(p, false);
    p.dead = true;
    p.deadT = 0;
    p.deaths++;
    p.face = 'scream';
    if (this.rules.mode === 'last' && !p.out) {
      p.out = true;
      p.endT = this.time;
      this.outOrder.push(p.id);
      this.events.push({ type: 'out', player: p.id });
    }
    this.events.push(cause === 'fall' ? { type: 'death', player: p.id, x: at.x, y: at.y } : { type: 'death', player: p.id, x: at.x, y: at.y, cause });
    this.segDeaths++;
    const held = p.heldBy;
    p.heldBy = null;
    if (held && this.time - held.t <= CFG.betrayalWindow) {
      const by = this.players[held.by];
      if (by) by.betrayals++;
      this.betrayals.push({ by: held.by, victim: p.id, t: this.time });
      this.events.push({ type: 'betrayal', by: held.by, victim: p.id });
    }
    this.releaseAll(p);
    this.releaseGripsOn(p.id);
  }

  private checkpoints(): void {
    const cps = this.level.checkpoints ?? [];
    if (this.rules.mode === 'race') {
      // 比谁先：每个人（分队时每队）自己的检查点；灯按跑得最远的亮
      for (const p of this.players) {
        if (p.dead || p.done) continue;
        const key = this.teamOf(p.id);
        for (let j = (this.cpOf[key] ?? -1) + 1; j < cps.length; j++) {
          if (dist(p.body, cps[j] as Pt) >= CFG.checkpointR) continue;
          this.cpOf[key] = j;
          this.checkpoint = Math.max(this.checkpoint, j);
          this.events.push({ type: 'checkpoint', index: j, player: p.id });
        }
      }
      return;
    }
    for (let j = this.checkpoint + 1; j < cps.length; j++) {
      const cp = cps[j] as Pt;
      if (this.players.some((p) => !p.dead && dist(p.body, cp) < CFG.checkpointR)) {
        this.checkpoint = j;
        this.events.push({ type: 'checkpoint', index: j });
      }
    }
  }

  /** 这一局完了没有：闯关、大团队是大家都到终点；比谁先、坐不住见下面。 */
  private checkEnd(): void {
    if (this.won || this.players.length === 0) return;
    if (this.rules.mode === 'race') return this.checkRace();
    if (this.rules.mode === 'last') return this.checkLast();
    if (this.rules.mode === 'gold') return;
    // 端托盘的关：托盘也要端进终点（点心没翻）
    const allIn = this.players.every((p) => !p.dead && this.inGoal(p)) && (!this.tray || this.tray.home);
    if (allIn) {
      this.won = true;
      this.winT = 0;
      this.winners = this.players.map((p) => p.id);
      this.events.push({ type: 'win' });
      for (const p of this.players) p.face = 'win';
    }
  }

  private inGoal(p: Player): boolean {
    const g = this.level.goal;
    return p.body.x > g.x && p.body.x < g.x + g.w && p.body.y > g.y && p.body.y < g.y + g.h;
  }

  /**
   * 比谁先：进了终点的人停在终点里。各跑各的：只剩一个人没到、或者第一个到了以后过了 raceGrace 秒就完，
   * 第一个到的赢；分队：哪一队的人都到了就完，那一队赢。
   */
  private checkRace(): void {
    for (const p of this.players) if (!p.dead && !p.done && this.inGoal(p)) this.finish(p);
    if (this.rules.teams) {
      for (const team of [0, 1]) {
        const members = this.players.filter((p) => this.teamOf(p.id) === team);
        if (members.length && members.every((p) => p.done)) return this.end(members.map((p) => p.id));
      }
      return;
    }
    const first = this.finishOrder[0];
    if (first === undefined) return;
    const n = this.players.length;
    const done = this.finishOrder.length;
    const since = this.time - (this.players[first]?.endT ?? this.time);
    if (done >= n || (n >= 2 && done >= n - 1) || since >= CFG.raceGrace) this.end([first]);
  }

  /** 到终点了：记名次，搬进终点里排好，身体钉住（胳膊挂着），不再动、不会死。 */
  private finish(p: Player): void {
    p.done = true;
    p.endT = this.time;
    this.finishOrder.push(p.id);
    const place = this.finishOrder.length;
    const g = this.level.goal;
    const k = place - 1;
    const x = g.x + Math.min(g.w - CFG.bodyR, CFG.bodyR + (k % 3) * 40);
    const y = g.y + g.h - CFG.bodyR - 6 - Math.floor(k / 3) * 46;
    this.teleport(p.id, x, y);
    p.rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    p.face = 'win';
    this.events.push({ type: 'finish', player: p.id, place });
  }

  /** 坐不住：只剩一个人挂着就是他赢；最后几个同时掉下去算平局（都赢）；一个人玩的摔了就完。 */
  private checkLast(): void {
    const n = this.players.length;
    const alive = this.players.filter((p) => !p.dead);
    if (n >= 2 && alive.length === 1) return this.end([(alive[0] as Player).id]);
    if (alive.length === 0) {
      const lastT = Math.max(...this.players.map((p) => p.endT ?? -1));
      this.end(n >= 2 ? this.players.filter((p) => p.endT === lastT).map((p) => p.id) : []);
    }
  }

  private end(who: number[]): void {
    this.won = true;
    this.winT = 0;
    this.winners = who;
    this.events.push({ type: 'win', who });
    for (const i of who) {
      const p = this.players[i];
      if (p) p.face = 'win';
    }
  }

  private updateFace(p: Player): void {
    // 赢了的、到了终点的笑；比谁先、坐不住没赢的照常
    if ((this.won && (this.rules.mode === 'climb' || this.rules.mode === 'team' || this.winners.includes(p.id))) || p.done) {
      p.face = 'win';
      return;
    }
    if (p.dead) {
      p.face = 'scream';
      return;
    }
    const { vx, vy } = p.body;
    if (p.arms.some((a) => a.grip)) p.face = 'grab';
    else if (vy > 1000) p.face = 'scream';
    else if (Math.abs(vy) > 380 || Math.abs(vx) > 700) p.face = 'fly';
    else p.face = 'idle';
  }

  /** 释放 wasm 里的世界。 */
  destroy(): void {
    this.world.free();
  }
}

/**
 * 把一条 3 节胳膊从肩摆到手心目标：够得着就折成 Z 形正好够到，够不着就伸直指过去。
 * 返回每节的中心、角度和实际手心位置。
 */
export function chainPose(shoulder: Pt, hand: Pt): { centers: Pt[]; angles: number[]; end: Pt } {
  const L = CFG.segLen;
  const n = CFG.armSegs;
  let r = dist(hand, shoulder);
  const theta = r < 1e-6 ? -Math.PI / 2 : Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x);
  r = clamp(r, 1, n * L);
  // 3 节：e(θ+φ) + e(θ−φ) + e(θ) = (1 + 2cosφ)·e(θ)
  const phi = Math.acos(clamp((r / L - 1) / 2, -1, 1));
  const angles = n === 3 ? [theta + phi, theta - phi, theta] : Array.from({ length: n }, () => theta);
  const centers: Pt[] = [];
  let x = shoulder.x;
  let y = shoulder.y;
  for (let k = 0; k < n; k++) {
    const a = angles[k] as number;
    centers.push({ x: x + (L / 2) * Math.cos(a), y: y + (L / 2) * Math.sin(a) });
    x += L * Math.cos(a);
    y += L * Math.sin(a);
  }
  return { centers, angles, end: { x, y } };
}

/** 建一局：初始化 Rapier，然后按关卡搭世界、放 nPlayers 个人在起点。 */
export async function createSim(level: Level, nPlayers = 1, rules: Rules = CLIMB): Promise<Sim> {
  await initPhysics();
  return new Sim(level, nPlayers, rules);
}
