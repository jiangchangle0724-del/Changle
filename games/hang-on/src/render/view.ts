/**
 * 画面和声音读到的那部分局面。主机上就是物理的 Sim 本身（结构上对得上）；
 * 手机局里别的手机没有物理，拿主机发来的快照拼一个（`src/net/snap.ts` 的 RemoteSim）。
 * 这里只放类型，不引物理：手机的画面包里不能带 Rapier。
 */
import type { ItemId } from '../items';
import type { Level, Pt } from '../physics/level';
import type { Face, Rules } from '../physics/world';

export interface ArmView {
  side: -1 | 1;
  /** 手心（= pts 最后一个）。 */
  hand: Pt;
  /** 肩、两个肘、手心。 */
  pts: Pt[];
  /** 抓着什么就有，t 是抓了多久（秒）。 */
  grip: { t: number } | null;
}

export interface PlayerView {
  id: number;
  color: string;
  body: { x: number; y: number; vx: number; vy: number };
  arms: [ArmView, ArmView];
  aim: Pt;
  dead: boolean;
  deadT: number;
  deaths: number;
  face: Face;
  /** 比谁先：到终点了（停在终点里）。 */
  done?: boolean;
  /** 正在起作用的道具（A9：速冻、荷叶）和还剩几秒。 */
  itemOn?: ItemId | null;
  itemLeft?: number;
}

export interface RopeView {
  anchor: Pt;
  pts: Pt[];
  handle: Pt;
}

/** 道具拉面（A9）：谁放的、还剩几秒，点和绳子一样（第一个是锚）。 */
export interface NoodleView {
  owner: number;
  left: number;
  pts: Pt[];
}

export interface PropView {
  kind: 'seesaw' | 'crate';
  w: number;
  h: number;
  x: number;
  y: number;
  angle: number;
}

export interface FadingView {
  x: number;
  y: number;
  w: number;
  h: number;
  on: boolean;
  /** 距离下一次切换还有几秒。 */
  left: number;
}

export interface SpringView {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 上一次被弹到现在几秒（没弹过是 Infinity）。 */
  hit: number;
}

/** 踩板门（11-13）：踏板按着没有，门开到几成（0 关、1 开）、现在在哪。 */
export interface PlateView {
  x: number;
  y: number;
  w: number;
  h: number;
  on: boolean;
}
export interface GateView {
  x: number;
  y: number;
  w: number;
  h: number;
  open: number;
}

export interface SimView {
  /** 按人数摆出来的关卡（forPlayers 之后的那一版）。 */
  level: Level;
  /** 关卡是按几个人摆的（主机的 Sim 有；手机局里别的手机从快照拿）。 */
  readonly layoutFor?: number;
  /** 玩法（主机的 Sim 有；手机局里别的手机从样子名单拿）。坐不住时手抓久了要抖。 */
  readonly rules?: Rules;
  time: number;
  won: boolean;
  /** 最新生效的检查点，没有是 -1。 */
  checkpoint: number;
  players: PlayerView[];
  ropes: RopeView[];
  props: PropView[];
  fadings: FadingView[];
  springs: SpringView[];
  /** 道具放下来的拉面（A9）。 */
  noodles?: NoodleView[];
  /** 红包（A9b）：在哪、拿到没有。 */
  envelopes?: { x: number; y: number; got: boolean }[];
  /** 踩板门（11-13）。 */
  plates?: PlateView[];
  gates?: GateView[];
}
