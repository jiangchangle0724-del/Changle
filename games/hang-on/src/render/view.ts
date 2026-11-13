/**
 * 画面和声音读到的那部分局面。主机上就是物理的 Sim 本身（结构上对得上）；
 * 手机局里别的手机没有物理，拿主机发来的快照拼一个（`src/net/snap.ts` 的 RemoteSim）。
 * 这里只放类型，不引物理：手机的画面包里不能带 Rapier。
 */
import type { Level, Pt } from '../physics/level';
import type { Face } from '../physics/world';

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
}

export interface RopeView {
  anchor: Pt;
  pts: Pt[];
  handle: Pt;
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

export interface SimView {
  /** 按人数摆出来的关卡（forPlayers 之后的那一版）。 */
  level: Level;
  /** 关卡是按几个人摆的（主机的 Sim 有；手机局里别的手机从快照拿）。 */
  readonly layoutFor?: number;
  time: number;
  won: boolean;
  /** 最新生效的检查点，没有是 -1。 */
  checkpoint: number;
  players: PlayerView[];
  ropes: RopeView[];
  props: PropView[];
  fadings: FadingView[];
  springs: SpringView[];
}
