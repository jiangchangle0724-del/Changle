/**
 * 抓紧了 · Hang On — 房间和链路的协议（A2）。
 *
 * 两层：
 * 1. 房间 WebSocket（手柄 / 主机 / 观众 ↔ Durable Object）：进出房、座位、阶段、以及「转发」——
 *    房间不看转发的内容，只按座位号送到对面。
 * 2. 链路消息（LinkMsg）：主机和手柄之间真正说的话。走 WebRTC 数据通道（直连），
 *    直连没有时原样装进房间的 relay 消息里绕一圈。两条路上的消息一个样。
 *
 * 契约见 games/hang-on/CONTRACTS.md「输入契约」「房间契约」。
 */
import type { Look } from '../look';
import type { GameMode, PadInput, SimEvent } from '../physics/world';

export type { PadInput };

export type Phase = 'lobby' | 'countdown' | 'playing' | 'results' | 'ended';
export type Role = 'host' | 'pad' | 'watch';

/** 座位：最多 6 个手柄（手机局里房主占一个，再进 5 个）。 */
export interface Seat {
  id: string;
  name: string;
  /** 馅儿色 0..5（草莓粉、抹茶绿、芒果黄、苏打蓝、芋泥紫、椰奶白）。 */
  color: number;
  connected: boolean;
}

/** 房间给每个人看的样子。 */
export interface RoomView {
  code: string;
  phase: Phase;
  hostConnected: boolean;
  seats: Seat[];
  watchers: number;
  /** 房间开了多久（毫秒，房间时钟）。 */
  age: number;
  /**
   * 手机局：主机是一部手机，房主自己也玩（占 0 号颜色，手柄最多 3 个），
   * 每部手机都看主机发来的画面。没有这个字段就是电视局。
   */
  hostPlays?: boolean;
}

export type HostAction =
  | { type: 'START' } // lobby → countdown
  | { type: 'PLAY' } // countdown → playing
  | { type: 'FINISH' } // playing → results
  | { type: 'LOBBY' } // results / countdown → lobby
  | { type: 'END' } // → ended
  | { type: 'KICK'; seat: string };

/** 转发的目标：某个座位，或者主机。 */
export type RelayTo = { seat: string } | 'host';

export type ClientMsg =
  | { t: 'ping'; id: number }
  | { t: 'act'; action: HostAction }
  /** 主机 → 某座位，或手柄 → 主机。内容是 LinkMsg，房间不看。 */
  | { t: 'relay'; to: RelayTo; data: LinkMsg };

export type FatalKey = 'noRoom' | 'full' | 'ended' | 'badRequest' | 'kicked' | 'hostTaken';

export type ServerMsg =
  | { t: 'welcome'; role: Role; seat: string | null; code: string }
  | { t: 'room'; room: RoomView }
  | { t: 'pong'; id: number; at: number }
  | { t: 'relay'; from: RelayTo; data: LinkMsg }
  | { t: 'error'; code: string; message: string }
  | { t: 'fatal'; key: FatalKey };

/** 主机 → 手柄，每 250 ms 一条小包（契约）。 */
export interface PadStatus {
  color: number;
  hands: [boolean, boolean];
  deaths: number;
  rttMs: number | null;
  phase: Phase;
  /** 走直连还是绕路。 */
  direct: boolean;
  /** 队友里摔死还没复活的有几个（手柄上亮「召唤」键用；比谁先各跑各的、坐不住没有队友可拉，是 0）。 */
  teamDead?: number;
  /** 这一局的玩法（A7），手柄上显示用。 */
  mode?: GameMode;
  /** 比谁先分两队：你在第几队（0 甜队，1 咸队）。 */
  team?: number;
  /** 比谁先：你第几个到的终点。 */
  place?: number;
  /** 坐不住：你出局了。 */
  out?: boolean;
}

/**
 * 手机局（主机也是一部手机，大家各自在手机上看画面）：主机每 50 ms（绕路 100 ms）给每部手机发一张快照。
 * 数字都压成短数组省流量，编码和拼回去在 `src/net/snap.ts`。只在直连通道上可以丢；丢了下一张补上。
 */
export interface Snap {
  /** 序号，只增不减；旧的丢掉。 */
  n: number;
  /** 关卡 id。 */
  lv: string;
  /** 关卡是按几个人摆的（和现在的人数不一样时才有，比如有人半路进来）；手机照这个人数摆关卡。 */
  np?: number;
  /** 模拟时间（秒）。 */
  t: number;
  /** 1 = 到顶了。 */
  w: 0 | 1;
  /** 最新生效的检查点，-1 没有。 */
  cp: number;
  /**
   * 每个人一行：x, y, vx, vy, 摇杆 x, 摇杆 y, 死了(0 活着 / 1 死了 / 2 比谁先到了终点), 死了几秒, 表情(FACES 下标), 摔死次数,
   * 左臂四个点(8 个数), 左手抓了几秒(-1 没抓), 右臂四个点, 右手抓了几秒。
   */
  p: number[][];
  /** 每根绳一行：各点 x, y 摊平；第一个是锚，最后一个是把手。 */
  r: number[][];
  /** 每个物件一行：x, y, 角度, 宽, 高, 种类(0 跷跷板, 1 箱子)。 */
  o: number[][];
  /** 每块饼干两个数：在不在(0/1)、还有几秒切换。 */
  f: number[];
  /** 每根蜡烛被弹了几秒（-1 没弹过）。 */
  s: number[];
  /**
   * 最近发生的事（声音、特效用），ek 是第一件的编号，后面的依次加一。
   * 同一件事跟着好几轮快照走（丢一两张也收得到），手机按编号只放一次。
   */
  e?: SimEvent[];
  ek?: number;
}

/** 结算页要的数（主机算，手机局里装进 Cast 发给每部手机，画法在 `src/results.ts`）。 */
export interface Results {
  /** 用时（秒）。 */
  time: number;
  /** 每个人摔了几次、抓了几下，下标和玩家一样。 */
  deaths: number[];
  grabs: number[];
  /** 背叛榜：[谁, 松开了谁, 几次]，多的在前。 */
  betrayals: [number, number, number][];
  /** 玩法（A7），没有就是闯关。 */
  mode?: GameMode;
  /** 赢的人（比谁先、坐不住）。 */
  winners?: number[];
  /** 比谁先分两队：每个人在第几队。 */
  teams?: number[];
  /**
   * 排名：比谁先是到终点的先后和用时（没到的秒数是 null，排在后面）；
   * 坐不住是撑了多久，赢的在前、先出局的在后。[玩家, 秒]
   */
  order?: [number, number | null][];
}

/** 手机局：主机的样子名单（谁叫什么、什么颜色、什么样子），变了就发，每 2 秒也补一次。 */
export interface Cast {
  /** 收的这部手机是第几个人。 */
  me: number;
  players: { name: string; color: string; look: Look }[];
  /** 到了结算页才有。 */
  results?: Results;
  /** 这一局的玩法（A7）和比谁先的分队，横幅、结算页、画面（坐不住时手抓久了要抖）用。 */
  mode?: GameMode;
  teams?: number[];
}

/**
 * 主机和手柄之间的话。`k` 是种类：
 * - hello：手柄每次（重新）连上房间就说一声，主机收到就发 offer。
 * - sdp / ice：WebRTC 信令（只走房间）。
 * - ping / pong：主机量往返，手柄原样回。
 * - input：手柄的每帧输入；status：主机的小包。
 * - look：手柄选的样子（帽子、眼镜、眼睛），连上时发一次，改了再发；只走房间（要可靠）。
 * - snap / cast：手机局里主机发给每部手机的画面快照和样子名单（见上面 Snap、Cast）。
 */
export type LinkMsg =
  | { k: 'snap'; s: Snap }
  | { k: 'cast'; c: Cast }
  | { k: 'hello' }
  | { k: 'look'; look: Look }
  | { k: 'sdp'; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { k: 'ice'; ice: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } | null }
  | { k: 'ping'; id: number; at: number }
  | { k: 'pong'; id: number; at: number }
  | { k: 'input'; i: PadInput }
  | { k: 'status'; s: PadStatus };

/** 房间码：4 个在电视上不会认错的字符（和一起跳一样的字母表）。 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
export const SEAT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_SEATS = 6;
/** 主机断开多久房间作废（契约：30 秒）。 */
export const HOST_GRACE_MS = 30_000;
/** 手柄断开多久座位让出来（锁屏、换 Wi-Fi 都要能回来）。 */
export const PAD_GRACE_MS = 120_000;
/** 没人用的房间多久清掉。 */
export const IDLE_MS = 6 * 3_600_000;
/** 直连等多久没通就走中转。 */
export const DIRECT_TIMEOUT_MS = 3_000;
/** 主机量往返的间隔，和发小包的间隔。 */
export const PING_MS = 250;
export const STATUS_MS = 250;
/** 延迟表的颜色阈值（毫秒）。 */
export const RTT_WARN_MS = 60;
export const RTT_BAD_MS = 120;
/** 绕路时手柄发输入的频率（直连时每帧都发）。 */
export const RELAY_INPUT_HZ = 30;
/** 手机局：直连时每 50 ms 给每部手机一张快照，绕路时 100 ms（房间转发扛得住的量）。 */
export const SNAP_MS = 50;
export const SNAP_RELAY_MS = 100;
/**
 * 一件事跟着几轮快照走（直连每轮都发，约 0.3 秒；绕路隔一轮发一张），快照里最多带几件。
 * 按轮数不按时间：房主那部手机卡一下（过关撒纸屑那一下），事情也还在，等发出去了才算数。
 */
export const SNAP_EVENT_SENDS = 6;
export const SNAP_EVENTS_MAX = 40;
/** 样子名单没变也隔多久补发一次。 */
export const CAST_MS = 2000;
