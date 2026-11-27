// The camera's half of the beat judge: for each beat the room hears, the moment near it when the
// player looked most like the coach on that beat. If they looked alike enough, the beat was danced
// then, and the phone's beat judge (shared/taps.ts decide) says how near the beat: on it, near it;
// else it wasn't danced. So a player is judged on doing the move (arms, legs and
// back, as Just Dance's camera does) and on doing it in time. Pure: the phone feeds it frames.

import type { Difficulty } from "../../../../party-base/src/index";
import { spotAt, type RunBeat } from "../../shared/show";
import { movedWindowMs } from "../../shared/taps";
import { moveAnim, poseOf, type Doing } from "../coach/moves";
import { angleOf, coachBody, likeness, moveWeights, type Body } from "./body";

/** How alike (0 to 1) a moment has to be to count as doing the move, by difficulty. */
export const ALIKE: Record<Difficulty, number> = { easy: 0.55, medium: 0.62, hard: 0.7 };
/** A moment nearer the beat wins over a slightly more alike one: this much likeness per window. */
const NEAR = 0.08;
/** The frames kept (ms): a beat's window and then some. */
const KEEP_MS = 3000;

export interface Frame {
  /** speaker time */
  t: number;
  body: Body | null;
}

const doingOf = (b: Pick<RunBeat, "move">): Doing => (b.move ? { kind: "move", id: b.move.id } : { kind: "clap" });
const keyOf = (d: Doing) => (d.kind === "move" ? d.id : d.kind);

const bodies = new Map<string, Body>();
const weights = new Map<string, Float32Array>();

/** The coach on a beat of the run: its body on the beat, and which parts its move is about. */
export function targetOf(b: Pick<RunBeat, "move" | "count">): { body: Body; weight: Float32Array } {
  const doing = doingOf(b);
  const p = b.move ? b.count - 1 : 0;
  const k = `${keyOf(doing)}:${p}`;
  let body = bodies.get(k);
  if (!body) bodies.set(k, (body = coachBody(poseOf(doing, p, 0))));
  let weight = weights.get(keyOf(doing));
  if (!weight) {
    const len = doing.kind === "move" ? (moveAnim(doing.id)?.len ?? 8) : 2;
    const along: Body[] = [];
    for (let q = 0; q < len; q += 0.5) along.push(coachBody(poseOf(doing, q, 0)));
    weights.set(keyOf(doing), (weight = moveWeights(along)));
  }
  return { body, weight };
}

/** The coach's body at heard time `t` of the run, as the TV shows it then (cached by move and place). */
function coachAt(run: readonly RunBeat[], t: number): Body | null {
  const spot = spotAt(run, t);
  if (!spot) return null;
  const b = run[spot.i]!;
  const doing = doingOf(b);
  const p = b.move ? b.count - 1 + spot.frac : spot.frac;
  const k = `${keyOf(doing)}:${p.toFixed(2)}`;
  let body = bodies.get(k);
  if (!body) bodies.set(k, (body = coachBody(poseOf(doing, p, 0))));
  return body;
}

/** The frame nearest `t`, if one is near enough to stand for it. */
function frameAt(frames: readonly Frame[], t: number, from: number): Body | null {
  let best: Frame | null = null;
  for (let i = from; i < frames.length; i++) {
    const f = frames[i]!;
    if (!best || Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
    if (f.t > t) break;
  }
  return best && Math.abs(best.t - t) <= NEAR_FRAME ? best.body : null;
}

/**
 * How alike the player's moments are to the coach's (each a quarter of a beat apart, the beat in the
 * middle): each moment's pose, and how much each part moved from one moment to the next against how
 * much the coach's did (so standing still is not a step-touch, though its feet are together on the
 * touch). Null with too few moments seen.
 */
export function fit(seen: readonly (Body | null)[], coach: readonly (Body | null)[], weight: Float32Array): number | null {
  let pose = 0;
  let of = 0;
  for (let j = 0; j < seen.length; j++) {
    const pb = seen[j];
    const c = coach[j];
    if (!c) continue;
    pose += STEP_WEIGHT[j]! * (pb ? likeness(pb, c, weight) : UNSEEN);
    of += STEP_WEIGHT[j]!;
  }
  if (of < 1.5) return null;
  pose /= of;
  let move = 0;
  let moved = 0;
  for (let j = 0; j + 1 < seen.length; j++) {
    const p0 = seen[j];
    const p1 = seen[j + 1];
    const c0 = coach[j];
    const c1 = coach[j + 1];
    if (!p0 || !p1 || !c0 || !c1) continue;
    for (let k = 0; k < weight.length; k++) {
      const sure = Math.min(p0.sure[k]!, p1.sure[k]!);
      if (sure <= 0) continue;
      const tc = angleOf(c0, c1, k);
      const tp = angleOf(p0, p1, k);
      const m = weight[k]! * sure * Math.max(tc, tp);
      move += m * Math.exp(-(((tp - tc) / MOVE_SIGMA) ** 2));
      moved += m;
    }
  }
  // (nothing much moving, the player's or the coach's: the poses say it all)
  if (moved < 0.15) return pose;
  return (1 - MOVE_SHARE) * pose + (MOVE_SHARE * move) / moved;
}


/** How differently a part may move from the coach's between two moments (radians) */
const MOVE_SIGMA = 0.3;
/** How much the moving counts against the poses */
const MOVE_SHARE = 0.45;

/**
 * Around a beat, a quarter of a beat apart: how the player's moves line up with the coach's. More
 * before the beat than after: getting into the move says most, and the judge needn't wait long.
 */
const STEPS = [-2, -1, 0, 1];
const STEP_WEIGHT = [0.5, 0.8, 1, 0.8];
/** How near a frame has to be to stand for a moment (ms) */
const NEAR_FRAME = 70;
/** A moment not seen (a frame missing) counts as this alike, so every fit has all its moments */
const UNSEEN = 0.3;

/** How long after a beat the camera has seen enough to judge it (ms). */
export const decidedAfter = (d: Difficulty, beatMs: number) => movedWindowMs(d) + beatMs / 4 + NEAR_FRAME;

/**
 * When near beat `i` of the run (± win) the player was where the coach is on it, and how alike they
 * were: the coach's moves from half a beat before to half a beat after, laid over the player's at
 * each frame near the beat, the best fit winning (a nearer one when two fit about as well). The moves
 * around the beat say when it was danced; a pose held still, as alike all round, falls on the beat.
 */
export function bestMoment(frames: readonly Frame[], run: readonly RunBeat[], i: number, win: number): { t: number; alike: number } | null {
  const b = run[i]!;
  const step = b.ms / 4;
  const coach = STEPS.map((k) => coachAt(run, b.t + k * step));
  const { weight } = targetOf(b);
  let best: { t: number; alike: number; score: number } | null = null;
  let from = 0;
  for (let n = 0; n < frames.length; n++) {
    const f = frames[n]!;
    if (!f.body || Math.abs(f.t - b.t) > win) continue;
    const lag = f.t - b.t;
    while (from < frames.length && frames[from]!.t < f.t + STEPS[0]! * step - NEAR_FRAME - 30) from++;
    const seen = STEPS.map((k) => (k === 0 ? f.body : frameAt(frames, b.t + lag + k * step, from)));
    if (seen.filter(Boolean).length < 2) continue;
    const alike = fit(seen, coach, weight);
    if (alike === null) continue;
    const score = alike - (NEAR * Math.abs(lag)) / win;
    if (!best || score > best.score) best = { t: f.t, alike, score };
  }
  return best && { t: best.t, alike: best.alike };
}

export class CameraJudge {
  private frames: Frame[] = [];
  private run: readonly RunBeat[] | null = null;
  private next = 0;
  /** How alike the player has looked on the last beats (0 to 1): the phone's meter. */
  alike = 0;
  /** `onBeat(i, t)`: beat i of the run was danced at speaker time t, or not (null). */
  constructor(private readonly onBeat: (i: number, t: number | null) => void) {}

  /** A camera frame at speaker time `t` (body null: nobody seen). */
  push(t: number, body: Body | null): void {
    if (!Number.isFinite(t)) return;
    this.frames.push({ t, body });
    const old = t - KEEP_MS;
    let cut = 0;
    while (cut < this.frames.length && this.frames[cut]!.t < old) cut++;
    if (cut) this.frames.splice(0, cut);
  }

  /** Decide each scored beat of `run` (the beats as the room hears them) whose window the frames have passed. */
  decide(run: readonly RunBeat[], d: Difficulty): void {
    const last = this.frames.at(-1)?.t;
    if (last === undefined) return;
    const win = movedWindowMs(d);
    if (run !== this.run) {
      // (a new run: from the first beat the frames can still see all round)
      this.run = run;
      const first = this.frames[0]!.t;
      this.next = 0;
      while (this.next < run.length && run[this.next]!.t - win < first) this.next++;
    }
    while (this.next < run.length && run[this.next]!.t + decidedAfter(d, run[this.next]!.ms) < last) {
      const i = this.next++;
      if (!run[i]!.score) continue;
      const best = bestMoment(this.frames, run, i, win);
      const alike = best?.alike ?? 0;
      this.alike += 0.3 * (alike - this.alike);
      this.onBeat(i, best && alike >= ALIKE[d] ? best.t : null);
    }
  }

  /** Forget the frames (the camera stopped, or a new dance). */
  reset(): void {
    this.frames = [];
    this.run = null;
    this.next = 0;
    this.alike = 0;
  }
}
