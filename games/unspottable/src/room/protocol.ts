import type { ArenaId, Pose, Vector } from "../engine";

export type Lang = "zh" | "en";
export type Role = "player" | "screen";

export type ClientMsg =
  | { t: "move"; x: number; y: number }
  | { t: "punch" }
  | { t: "blend" }
  | { t: "vote"; arena: ArenaId }
  | { t: "start" }
  | { t: "again" }
  | { t: "leave" }
  | { t: "ping" };

export type ServerMsg =
  | { t: "view"; view: RoomView }
  | { t: "fatal"; key: string }
  | { t: "pong"; now: number };

export interface PlayerView {
  name: string;
  online: boolean;
  host: boolean;
  score: number;
}

export interface AvatarView {
  x: number;
  y: number;
  facing: number;
  pose: Pose;
  isMine: boolean;
}

export interface EventView {
  id: number;
  t: "tag" | "foul" | "swing" | "over";
  byYou: boolean;
}

export interface GameView {
  phase: "playing" | "over";
  arena: ArenaId;
  endsAt: number;
  remainingMs: number;
  scoreToWin: number;
  winnerName: string | null;
  youWon: boolean;
  avatars: AvatarView[];
  events: EventView[];
  blendReadyAt: number;
  punchReadyAt: number;
}

export interface RoomView {
  code: string;
  phase: "lobby" | "playing" | "over";
  you: { role: Role; host: boolean; vote: ArenaId | null };
  arenaVotes: Record<ArenaId, number>;
  players: PlayerView[];
  screenCount: number;
  game: GameView | null;
}

export interface RoomInfo {
  exists: boolean;
  phase?: "lobby" | "playing" | "over";
  players?: number;
  full?: boolean;
}

export interface InputState {
  [memberId: string]: Vector;
}