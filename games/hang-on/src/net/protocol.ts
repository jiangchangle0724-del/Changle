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
import type { PadInput } from '../physics/world';

export type { PadInput };

export type Phase = 'lobby' | 'countdown' | 'playing' | 'results' | 'ended';
export type Role = 'host' | 'pad' | 'watch';

/** 座位：最多 4 个手柄。 */
export interface Seat {
  id: string;
  name: string;
  /** 馅儿色 0..3（草莓粉、抹茶绿、芒果黄、苏打蓝）。 */
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
  /** 队友里摔死还没复活的有几个（手柄上亮「召唤」键用）。 */
  teamDead?: number;
}

/**
 * 主机和手柄之间的话。`k` 是种类：
 * - hello：手柄每次（重新）连上房间就说一声，主机收到就发 offer。
 * - sdp / ice：WebRTC 信令（只走房间）。
 * - ping / pong：主机量往返，手柄原样回。
 * - input：手柄的每帧输入；status：主机的小包。
 * - look：手柄选的样子（帽子、眼镜、眼睛），连上时发一次，改了再发；只走房间（要可靠）。
 */
export type LinkMsg =
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
export const MAX_SEATS = 4;
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
