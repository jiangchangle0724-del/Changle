/**
 * How the coach robot (robot.ts) dances each of the routine's moves (shared/dj/dance.ts): plain
 * functions of the beat, so it lands on the music however the frames fall. A pose says where the hips
 * are and how the spine, chest and head lean; where the hands go (in the chest's own space, so they
 * move with the body) and the feet (on the floor); whether it sits, its eyes, its chest light. Two
 * poses blend, so one move flows into the next (sitting down and standing up included).
 */
import type { MoveId } from "../../../shared/dj/dance";
import { DIMS } from "./robot";

export type Lean = { pitch: number; roll: number; yaw: number };
export type P3 = [number, number, number];
export type Pose = {
  /** 0 standing, 1 sitting on the stool */
  sit: number;
  /** the pelvis's centre (x, y, z over the floor) and its turn */
  hips: P3;
  pelvis: Lean;
  spine: Lean;
  chest: Lean;
  head: Lean;
  /** [left, right] hands, in the chest's space (0 where the chest starts, +z to the front) */
  hands: [P3, P3];
  /** [left, right] feet: x, z on the floor, and how high the foot is lifted */
  feet: [P3, P3];
  /** happy eyes (arcs) rather than open ones: 0 or 1, blended at a half */
  happy: number;
  /** the chest light, 0 to 1 */
  glow: number;
};

const still: Lean = { pitch: 0, roll: 0, yaw: 0 };
const lean = (pitch = 0, roll = 0, yaw = 0): Lean => ({ pitch, roll, yaw });
const frac = (x: number) => x - Math.floor(x);
/** 1 right on a beat, easing away by the next (feet and heads land on it) */
const onBeat = (b: number) => Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * frac(b)), 1.5);
/** a hit right on a beat, gone quickly */
const hit = (b: number) => Math.exp(-7 * frac(b));
/** side to side: −1 on even beats, +1 on odd ones, smoothly between (`per` beats a side) */
const side = (b: number, per = 1) => -Math.cos((Math.PI * b) / per);
const D = DIMS;

/** Standing easy: hands by the hips, feet a little apart. */
export function standPose(): Pose {
  return {
    sit: 0,
    hips: [0, D.stand, 0],
    pelvis: still,
    spine: still,
    chest: still,
    head: still,
    hands: [
      [0.25, -0.21, 0.07],
      [-0.25, -0.21, 0.07],
    ],
    feet: [
      [0.12, 0.02, 0],
      [-0.12, 0.02, 0],
    ],
    happy: 0,
    glow: 0.35,
  };
}

/** Sitting on the stool: feet out in front, hands on the knees. */
export function sitPose(): Pose {
  return {
    sit: 1,
    hips: [0, D.sit, -0.02],
    pelvis: lean(-0.05),
    spine: lean(0.04),
    chest: lean(0.03),
    head: still,
    hands: [
      [0.14, -0.19, 0.36],
      [-0.14, -0.19, 0.36],
    ],
    feet: [
      [0.14, 0.4, 0],
      [-0.14, 0.4, 0],
    ],
    happy: 0,
    glow: 0.35,
  };
}

/** Resting with no music: breathing, looking about a little. */
export function idlePose(t: number): Pose {
  const p = standPose();
  const br = Math.sin(t * 1.3);
  p.hips[1] += 0.004 * br;
  p.chest = lean(-0.015 * br, 0, 0);
  p.head = lean(0.03 * Math.sin(t * 0.37), 0.04 * Math.sin(t * 0.23), 0.18 * Math.sin(t * 0.17));
  p.hands[0][0] += 0.005 * br;
  p.hands[1][0] -= 0.005 * br;
  return p;
}

type Mover = (b: number) => Pose;

/** Each move, at beat `b` (the speaker's count: whole numbers land on the beat). */
export const POSES: Record<MoveId, Mover> = {
  // 慢摇: the weight from foot to foot over two beats, hips leading, arms loose
  sway: (b) => {
    const p = standPose();
    const s = side(b, 2);
    p.hips = [0.06 * s, D.stand - 0.025 * (1 - Math.abs(s)), 0];
    p.pelvis = lean(0, -0.08 * s, 0.05 * s);
    p.spine = lean(0.02, 0.05 * s);
    p.chest = lean(0, 0.04 * s, -0.04 * s);
    p.head = lean(0.04, 0.09 * s);
    p.hands = [
      [0.26 + 0.04 * s, -0.24, 0.08 + 0.04 * Math.abs(s)],
      [-0.26 + 0.04 * s, -0.24, 0.08 + 0.04 * Math.abs(s)],
    ];
    p.glow = 0.3 + 0.2 * onBeat(b);
    return p;
  },
  // 快摇: knees bounce on every beat, nodding, both hands up and shaking
  bounce: (b) => {
    const p = standPose();
    const d = onBeat(b);
    const w = Math.sin(4 * Math.PI * b);
    p.hips = [0, D.stand - 0.07 * d, 0.01];
    p.feet = [
      [0.15, 0.02, 0],
      [-0.15, 0.02, 0],
    ];
    p.spine = lean(0.06 * d);
    p.chest = lean(0.05 * d, 0, 0.05 * Math.sin(Math.PI * b));
    p.head = lean(0.22 * d - 0.06);
    p.hands = [
      [0.3 + 0.035 * w, 0.78 - 0.05 * d, 0.12],
      [-0.3 + 0.035 * w, 0.78 - 0.05 * d, 0.12],
    ];
    p.happy = 1;
    p.glow = 0.4 + 0.6 * d;
    return p;
  },
  // 踏步拍手: step to one side, bring the other foot in, the other way; a clap every other beat
  stepClap: (b) => {
    const p = standPose();
    const s = side(b, 1);
    const k = 0.5 + 0.5 * Math.cos(Math.PI * (b - 1));
    const lift = 0.05 * Math.max(0, Math.sin(Math.PI * frac(b)));
    p.hips = [0.07 * s, D.stand - 0.03 * onBeat(b), 0];
    p.pelvis = lean(0, -0.05 * s, 0.04 * s);
    p.chest = lean(0.03, 0.03 * s);
    p.head = lean(0.06 * onBeat(b), 0.06 * s);
    // the weight on the left (s = 1): both feet that way, the right one lifting as it comes in; and back
    p.feet = [
      [0.12 + 0.08 * s, 0.02, s < 0 ? lift : 0],
      [-0.12 + 0.08 * s, 0.02, s > 0 ? lift : 0],
    ];
    const apart = 0.02 + 0.2 * (1 - k);
    p.hands = [
      [apart, 0.13 + 0.02 * k, 0.3],
      [-apart, 0.13 + 0.02 * k, 0.3],
    ];
    p.happy = k > 0.9 ? 1 : 0;
    p.glow = 0.3 + 0.7 * k;
    return p;
  },
  // 举手顶天: hands over the head, pushing up on every beat
  raiseRoof: (b) => {
    const p = standPose();
    const push = hit(b);
    const d = onBeat(b);
    p.hips = [0, D.stand - 0.04 * d, 0];
    p.chest = lean(-0.05, 0, 0.03 * side(b));
    p.head = lean(-0.12 - 0.05 * push);
    p.hands = [
      [0.21, 0.74 + 0.1 * push, 0.06],
      [-0.21, 0.74 + 0.1 * push, 0.06],
    ];
    p.happy = 1;
    p.glow = 0.4 + 0.6 * push;
    return p;
  },
  // 出拳: the right fist up on every beat, the left hand on the hip
  fistPump: (b) => {
    const p = standPose();
    const up = hit(b);
    const d = onBeat(b);
    p.hips = [0.02, D.stand - 0.04 * d, 0];
    p.pelvis = lean(0, 0.04, 0);
    p.chest = lean(-0.04 * up, -0.04, -0.06);
    p.head = lean(-0.08 * up + 0.05 * d, -0.03, -0.1);
    p.hands = [
      [0.24, -0.1, -0.02],
      [-0.23 + 0.01 * up, 0.24 + 0.62 * up, 0.17 - 0.08 * up],
    ];
    p.happy = up > 0.6 ? 1 : 0;
    p.glow = 0.3 + 0.7 * up;
    return p;
  },
  // 指天指地: the right hand up and out on one beat, down across on the next; the left on the hip
  point: (b) => {
    const p = standPose();
    const u = 0.5 + 0.5 * Math.cos(Math.PI * b);
    const s = side(b, 1);
    p.hips = [-0.05 * s, D.stand - 0.03 * onBeat(b), 0];
    p.pelvis = lean(0, 0.06 * s, -0.06 * s);
    p.chest = lean(0, -0.04 * s, 0.1 * (u - 0.5));
    p.head = lean(-0.2 * u + 0.15 * (1 - u), 0, -0.25 * u + 0.15 * (1 - u));
    p.hands = [
      [0.23, -0.1, -0.02],
      [-0.42 * u + 0.1 * (1 - u), 0.86 * u - 0.24 * (1 - u), 0.14 * u + 0.28 * (1 - u)],
    ];
    p.happy = u > 0.8 ? 1 : 0;
    p.glow = 0.3 + 0.5 * onBeat(b);
    return p;
  },
  // 双手挥: both hands high, sweeping side to side together over two beats
  waveBoth: (b) => {
    const p = standPose();
    const s = side(b, 1);
    p.hips = [-0.04 * s, D.stand - 0.025 * onBeat(b), 0];
    p.pelvis = lean(0, 0.05 * s);
    p.chest = lean(-0.03, -0.06 * s);
    p.head = lean(-0.06, 0.08 * s);
    // (high, like wipers: the trailing hand stops above the head's edge, not across it)
    p.hands = [
      [0.25 + 0.11 * s, 0.8 - 0.04 * Math.abs(s), 0.1],
      [-0.25 + 0.11 * s, 0.8 - 0.04 * Math.abs(s), 0.1],
    ];
    p.happy = 1;
    p.glow = 0.35 + 0.4 * onBeat(b);
    return p;
  },
  // 抖肩: the shoulders back and forth quickly, elbows bent, knees soft
  shimmy: (b) => {
    const p = standPose();
    const q = Math.sin(4 * Math.PI * b);
    const d = onBeat(b);
    p.hips = [0, D.stand - 0.05 - 0.02 * d, 0];
    p.spine = lean(0.08);
    p.chest = lean(0.04, 0, 0.16 * q);
    p.head = lean(0.05 * d, 0.05 * q);
    p.hands = [
      [0.26, 0.0 + 0.02 * q, 0.2],
      [-0.26, 0.0 - 0.02 * q, 0.2],
    ];
    p.happy = 1;
    p.glow = 0.3 + 0.5 * Math.abs(q);
    return p;
  },
  // 扭一扭: feet together and still, the knees and hips turning side to side on the beat
  twist: (b) => {
    const p = standPose();
    const s = side(b, 1);
    p.hips = [0.01 * s, D.stand - 0.06, 0];
    p.feet = [
      [0.07, 0.03, 0],
      [-0.07, 0.03, 0],
    ];
    p.pelvis = lean(0, 0, 0.42 * s);
    p.spine = lean(0.05, 0, -0.18 * s);
    p.chest = lean(0, 0, -0.16 * s);
    p.head = lean(0.05 * onBeat(b), 0, -0.05 * s);
    p.hands = [
      [0.22, 0.02, 0.24],
      [-0.22, 0.02, 0.24],
    ];
    p.happy = 1;
    p.glow = 0.3 + 0.5 * onBeat(b);
    return p;
  },
  // 坐着摇: sitting, the upper body side to side over two beats, the hands tapping the knees
  seatSway: (b) => {
    const p = sitPose();
    const s = side(b, 2);
    const tap = 1 - hit(b);
    p.spine = lean(0.04, 0.1 * s);
    p.chest = lean(0.03, 0.06 * s);
    p.head = lean(0.06 * onBeat(b), 0.1 * s);
    p.hands = [
      [0.14 + 0.02 * s, -0.19 + 0.05 * tap * 0.5, 0.36],
      [-0.14 + 0.02 * s, -0.19 + 0.05 * tap * 0.5, 0.36],
    ];
    p.glow = 0.3 + 0.4 * onBeat(b);
    return p;
  },
  // 拍腿拍手: sitting, the knees twice, then a clap twice (four beats)
  kneeClap: (b) => {
    const p = sitPose();
    const bar = ((b % 4) + 4) % 4;
    // 0 to 1: how far towards the clap (it moves just before beat 2 and back before beat 0)
    const toClap = bar < 1.6 ? 0 : bar < 2 ? (bar - 1.6) / 0.4 : bar < 3.6 ? 1 : 1 - (bar - 3.6) / 0.4;
    const e = toClap * toClap * (3 - 2 * toClap);
    const d = onBeat(b);
    const knee: [P3, P3] = [
      [0.14, -0.19 + 0.06 * (1 - d), 0.36],
      [-0.14, -0.19 + 0.06 * (1 - d), 0.36],
    ];
    const apart = 0.02 + 0.16 * (1 - d);
    const clap: [P3, P3] = [
      [apart, 0.12, 0.3],
      [-apart, 0.12, 0.3],
    ];
    p.hands = [0, 1].map((i) => knee[i].map((v, j) => v + (clap[i][j] - v) * e)) as [P3, P3];
    p.spine = lean(0.06 + 0.06 * (1 - e) * d);
    p.head = lean(0.08 * d);
    p.happy = e > 0.5 ? 1 : 0;
    p.glow = 0.3 + 0.6 * d;
    return p;
  },
  // 坐着举手: sitting, both hands up, pushing on every beat
  seatRoof: (b) => {
    const p = sitPose();
    const push = hit(b);
    p.spine = lean(-0.04);
    p.chest = lean(-0.05, 0, 0.04 * side(b));
    p.head = lean(-0.1 - 0.05 * push);
    p.hands = [
      [0.21, 0.72 + 0.1 * push, 0.08],
      [-0.21, 0.72 + 0.1 * push, 0.08],
    ];
    p.happy = 1;
    p.glow = 0.4 + 0.6 * push;
    return p;
  },
  // 点头打拍子: sitting, a nod on every beat, the right hand up snapping, the left on the knee
  nod: (b) => {
    const p = sitPose();
    const d = onBeat(b);
    const flick = hit(b);
    p.spine = lean(0.05 + 0.03 * d);
    p.chest = lean(0.03 * d, 0, 0.08);
    p.head = lean(0.26 * d - 0.04, 0.05 * side(b, 2));
    p.hands = [
      [0.14, -0.19, 0.36],
      [-0.24 + 0.02 * flick, 0.26 + 0.03 * flick, 0.2],
    ];
    p.glow = 0.3 + 0.6 * d;
    return p;
  },
  // 划船: sitting, both hands reach forward and pull back over two beats, leaning with it
  row: (b) => {
    const p = sitPose();
    const r = 0.5 - 0.5 * Math.cos(Math.PI * b);
    p.spine = lean(0.18 * r - 0.04);
    p.chest = lean(0.06 * r);
    p.head = lean(-0.06 * r);
    p.hands = [
      [0.17, 0.04 + 0.02 * r, 0.12 + 0.36 * r],
      [-0.17, 0.04 + 0.02 * r, 0.12 + 0.36 * r],
    ];
    p.glow = 0.3 + 0.5 * r;
    return p;
  },
  // 坐着挥手: sitting, the right hand up high waving slowly over two beats, the left on the knee
  seatWave: (b) => {
    const p = sitPose();
    const s = side(b, 1);
    p.spine = lean(0.02, -0.05 * s);
    p.chest = lean(-0.02, -0.04 * s, -0.05);
    p.head = lean(-0.08, 0.06 * s, -0.08);
    p.hands = [
      [0.14, -0.19, 0.36],
      [-0.24 + 0.17 * s, 0.76 - 0.05 * Math.abs(s), 0.12],
    ];
    p.happy = 1;
    p.glow = 0.3 + 0.4 * onBeat(b);
    return p;
  },
};

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixLean = (a: Lean, b: Lean, k: number): Lean => ({ pitch: mix(a.pitch, b.pitch, k), roll: mix(a.roll, b.roll, k), yaw: mix(a.yaw, b.yaw, k) });
const mix3 = (a: P3, b: P3, k: number): P3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

/** Between two poses (`k` 0: all `a`, 1: all `b`). */
export function blend(a: Pose, b: Pose, k: number): Pose {
  return {
    sit: mix(a.sit, b.sit, k),
    hips: mix3(a.hips, b.hips, k),
    pelvis: mixLean(a.pelvis, b.pelvis, k),
    spine: mixLean(a.spine, b.spine, k),
    chest: mixLean(a.chest, b.chest, k),
    head: mixLean(a.head, b.head, k),
    hands: [mix3(a.hands[0], b.hands[0], k), mix3(a.hands[1], b.hands[1], k)],
    feet: [mix3(a.feet[0], b.feet[0], k), mix3(a.feet[1], b.feet[1], k)],
    happy: mix(a.happy, b.happy, k),
    glow: mix(a.glow, b.glow, k),
  };
}
