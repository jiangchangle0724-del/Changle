// What the coach's moves are written with (moves.ts: the library's 20; songmoves.ts: the songs'
// own dances): both hands at once (the screen-left one mirrored), the hand shapes the moves share,
// and a move's loop of key frames (pose.ts).
import type { Part, Pose, V3 } from "./pose";

/** Both hands, the screen-left one mirrored. */
export const both = (x: number, y: number, z: number): Part => ({ hR: [x, y, z], hL: [-x, y, z] });
export const palms = (x: number, y: number, z: number): Part => ({ pR: [x, y, z], pL: [-x, y, z] });
export const elbows = (x: number, y: number, z: number): Part => ({ eR: [x, y, z], eL: [-x, y, z] });
export const P = (...parts: Part[]): Part => Object.assign({}, ...parts) as Part;

// hands
export const CLAP = P(both(0.034, -0.1, 0.3), palms(-1, 0, 0), elbows(0.7, -0.7, -0.3));
export const APART = P(both(0.17, -0.11, 0.3), palms(-1, 0, 0.2), elbows(0.7, -0.7, -0.3));
export const OPEN_LOW = P(both(0.5, -0.24, 0.14), palms(0, 0.3, 1), elbows(1, -0.5, -0.4));
export const OPEN_MID = P(both(0.27, -0.16, 0.22), palms(-0.4, 0, 1), elbows(0.8, -0.8, -0.3));
export const UP = P(both(0.21, 0.54, 0.08), palms(-0.3, 0, 1), elbows(1, 0, -0.3));
export const AT_SHOULDERS = P(both(0.25, -0.03, 0.12), palms(0, 0.2, 1), elbows(0.5, -1, -0.2));
export const DOWN = P(both(0.23, -0.48, 0.08), palms(-1, 0, 0.2), elbows(0.5, -0.3, -1));
export const AKIMBO = P(both(0.215, -0.4, -0.01), palms(-1, 0, -0.3), elbows(1, 0, -0.25));
export const GUARD = P(both(0.12, -0.13, 0.24), palms(-1, 0, 0), elbows(0.6, -1, -0.2));

export interface MoveAnim {
  /** beats per loop of its key frames */
  len: number;
  pose: (p: number) => Pose;
  /** how much of the beat's bounce goes on top (0 to 1) */
  groove: number;
  /** what else moves between the key frames (twirls, rolls, a marching foot) */
  extra?: (p: number, pose: Pose) => void;
}

export const add = (v: V3, x: number, y: number, z: number): V3 => [v[0] + x, v[1] + y, v[2] + z];
