// What the coach's moves are written with (moves.ts: the library's 20; songmoves.ts: the songs'
// own dances): both hands at once (the screen-left one mirrored), the hand shapes the moves share,
// and a move's loop of key frames (pose.ts).
import type { Foot, Part, Pose, V3 } from "./pose";

/** Both hands, the screen-left one mirrored. */
export const both = (x: number, y: number, z: number): Part => ({ hR: [x, y, z], hL: [-x, y, z] });
export const palms = (x: number, y: number, z: number): Part => ({ pR: [x, y, z], pL: [-x, y, z] });
export const elbows = (x: number, y: number, z: number): Part => ({ eR: [x, y, z], eL: [-x, y, z] });
export const P = (...parts: Part[]): Part => Object.assign({}, ...parts) as Part;
/** one hand's part: the screen-right one, or the screen-left one mirrored */
export const hand = (side: 1 | -1, h: V3, pa: V3, el: V3): Part => (side > 0 ? { hR: h, pR: pa, eR: el } : { hL: [-h[0], h[1], h[2]], pL: [-pa[0], pa[1], pa[2]], eL: [-el[0], el[1], el[2]] });
/** the feet so far apart (each that far from the middle) */
export const feet = (w: number): Part => ({ fR: { x: w }, fL: { x: -w } });
export const footOf = (o: Pose, side: 1 | -1): Foot => (side > 0 ? o.fR : o.fL);

export const TAU = 2 * Math.PI;
/** where p is in its 8-count: the count (0 to 7), how far through it, and the position (0 to 8) */
export const countAt = (p: number) => {
  const q = ((p % 8) + 8) % 8;
  const i = Math.floor(q);
  return { i, f: q - i, q };
};
/** eased in and out, t clamped to 0 to 1 */
export const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

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
