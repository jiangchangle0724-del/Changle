// What the camera compares: a body as its bones' directions, seen from the front with the coach's
// sides (x: the TV's right, y: up, z: towards the TV): each upper arm and forearm, thigh and shin, each
// foot (ankle to toes) and the back (hips to shoulders). Directions, not places, so a child and a tall
// uncle, a small move and the coach's big one match alike. A camera sees across and up well and
// towards it poorly, so the towards part counts for less (DEPTH) in every direction, the coach's as
// the player's.
//
// The coach's come from its Pose with the rig's own sizes, turns and two-bone bends (coach/rig.ts
// apply; its three.js turns are written out here, so the camera's download leaves three.js out). A
// player's come from the pose model's landmarks (MediaPipe's 33, in metres round the middle of the
// hips; x to the picture's right, y down, z away from the camera), turned round to the coach's sides:
// the camera faces the player as the TV does, so the player's right hand is the coach's R hand
// (everyone's mirror) and the picture's right is the TV's left.

import type { Pose } from "../coach/pose";
import { ANKLE_Y, CHEST_Y, FOREARM, HIP_W, HIP_Y, SHIN, SHOULDER_W, SHOULDER_Y, SPINE_Y, THIGH, UPPER_ARM } from "../coach/sizes";

export const PARTS = ["upperArmR", "foreArmR", "upperArmL", "foreArmL", "thighR", "shinR", "thighL", "shinL", "footR", "footL", "back"] as const;
export type PartName = (typeof PARTS)[number];
const N = PARTS.length;

export interface Body {
  /** x, y, z of each part's direction (unit length, z shrunk by DEPTH first), in PARTS order */
  dir: Float32Array;
  /** how sure each part is (0: not seen) */
  sure: Float32Array;
}

/** How much the direction towards the camera counts against across and up */
export const DEPTH = 0.5;

/** A pose model landmark (MediaPipe's NormalizedLandmark / Landmark). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** MediaPipe's landmarks the camera uses, by the player's own left and right */
export const LM = { shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28, toesL: 31, toesR: 32 } as const;
type Joint = keyof typeof LM;
type P3 = [number, number, number];
type Joints = Record<Joint, P3>;

/** Each part: from which joint to which ("back" runs between the middles of the hips and shoulders) */
const BONES: [Joint, Joint][] = [
  ["shoulderR", "elbowR"],
  ["elbowR", "wristR"],
  ["shoulderL", "elbowL"],
  ["elbowL", "wristL"],
  ["hipR", "kneeR"],
  ["kneeR", "ankleR"],
  ["hipL", "kneeL"],
  ["kneeL", "ankleL"],
  ["ankleR", "toesR"],
  ["ankleL", "toesL"],
];

function partsOf(j: Joints, sureOf: (a: Joint | null, b: Joint | null) => number): Body {
  const mid = (a: P3, b: P3): P3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const pairs: [P3, P3, Joint | null, Joint | null][] = BONES.map(([a, b]) => [j[a], j[b], a, b]);
  pairs.push([mid(j.hipR, j.hipL), mid(j.shoulderR, j.shoulderL), null, null]);
  const dir = new Float32Array(3 * N);
  const sure = new Float32Array(N);
  pairs.forEach(([a, b, ja, jb], k) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = (b[2] - a[2]) * DEPTH;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return;
    dir[3 * k] = dx / d;
    dir[3 * k + 1] = dy / d;
    dir[3 * k + 2] = dz / d;
    sure[k] = sureOf(ja, jb);
  });
  return { dir, sure };
}

// ---------- the coach

/** A joint's place and turn: a rotation (3×3, by rows) and where it is, in its stage's metres. */
interface Frame3 {
  r: number[];
  t: P3;
}

/** three.js's Euler turns (the rig's Object3D rotations), as a rotation by rows: order XYZ or YXZ. */
function euler(x: number, y: number, z: number, order: "XYZ" | "YXZ" = "XYZ"): number[] {
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  if (order === "YXZ") {
    const ce = c * e;
    const cf = c * f;
    const de = d * e;
    const df = d * f;
    return [ce + df * b, de * b - cf, a * d, a * f, a * e, -b, cf * b - de, df + ce * b, a * c];
  }
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}

const mul = (m: number[], n: number[]): number[] => {
  const o: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(m[3 * i]! * n[j]! + m[3 * i + 1]! * n[3 + j]! + m[3 * i + 2]! * n[6 + j]!);
  return o;
};
const turn = (m: number[], v: readonly number[]): P3 => [m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!, m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!, m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!];

/** A child joint: at `x, y, z` in its parent's frame, turned by the Euler angles. */
function child(parent: Frame3, x: number, y: number, z: number, rx: number, ry: number, rz: number): Frame3 {
  const p = turn(parent.r, [x, y, z]);
  return { r: mul(parent.r, euler(rx, ry, rz)), t: [parent.t[0] + p[0], parent.t[1] + p[1], parent.t[2] + p[2]] };
}

/** A point given in a joint's frame, in the stage's. */
const at = (f: Frame3, x: number, y: number, z: number): P3 => {
  const p = turn(f.r, [x, y, z]);
  return [f.t[0] + p[0], f.t[1] + p[1], f.t[2] + p[2]];
};

const STAGE: Frame3 = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

/** The rig's two-bone bend (rig.ts twoBone): where the middle joint and the end go. */
function bend(from: P3, target: P3, l1: number, l2: number, pole: P3): { mid: P3; end: P3 } {
  let to = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
  let d = Math.hypot(to[0]!, to[1]!, to[2]!);
  if (d < 1e-5) to = [0, -1, 0];
  const n0 = Math.hypot(to[0]!, to[1]!, to[2]!);
  to = to.map((c) => c / n0);
  d = Math.min(l1 + l2 - 0.002, Math.max(Math.abs(l1 - l2) + 0.01, d));
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const pd = pole[0] * to[0]! + pole[1] * to[1]! + pole[2] * to[2]!;
  let n = [pole[0] - pd * to[0]!, pole[1] - pd * to[1]!, pole[2] - pd * to[2]!];
  if (n[0]! ** 2 + n[1]! ** 2 + n[2]! ** 2 < 1e-8) n = [-to[2]! * to[0]!, -to[2]! * to[1]!, 1 - to[2]! * to[2]!];
  const nl = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  const up = [0, 1, 2].map((c) => to[c]! * cosA + (n[c]! / nl) * sinA);
  return { mid: [from[0] + up[0]! * l1, from[1] + up[1]! * l1, from[2] + up[2]! * l1], end: [from[0] + to[0]! * d, from[1] + to[1]! * d, from[2] + to[2]! * d] };
}

/** From the ankle to the tip of the shoe, in the foot's frame */
const TOES: P3 = [0, -0.05, 0.17];

/** Where the coach's joints are in a pose (its stage's metres), as rig.ts apply puts them. */
export function coachJoints(p: Pose): Joints {
  const root = child(STAGE, p.rx, 0, p.rz, 0, p.turn, 0);
  const hips = child(root, p.px, HIP_Y + p.py, p.pz, p.pitch, p.yaw, p.roll);
  const spine = child(hips, 0, SPINE_Y, 0, p.cPitch * 0.4, p.cYaw * 0.4, p.cRoll * 0.4);
  const chest = child(spine, 0, CHEST_Y, 0, p.cPitch * 0.6, p.cYaw * 0.6, p.cRoll * 0.6);
  const sR = at(chest, SHOULDER_W, SHOULDER_Y + p.sR[0], p.sR[1]);
  const sL = at(chest, -SHOULDER_W, SHOULDER_Y + p.sL[0], p.sL[1]);
  const armR = bend(sR, at(chest, p.hR[0], SHOULDER_Y + p.hR[1] + p.sR[0], p.hR[2] + p.sR[1]), UPPER_ARM, FOREARM, turn(chest.r, p.eR));
  const armL = bend(sL, at(chest, p.hL[0], SHOULDER_Y + p.hL[1] + p.sL[0], p.hL[2] + p.sL[1]), UPPER_ARM, FOREARM, turn(chest.r, p.eL));
  const hR = at(hips, HIP_W, -0.04, 0);
  const hL = at(hips, -HIP_W, -0.04, 0);
  const legR = bend(hR, at(root, p.fR.x, ANKLE_Y + p.fR.lift, p.fR.z), THIGH, SHIN, turn(hips.r, [0.18, 0, 1]));
  const legL = bend(hL, at(root, p.fL.x, ANKLE_Y + p.fL.lift, p.fL.z), THIGH, SHIN, turn(hips.r, [-0.18, 0, 1]));
  // (the foot turned by its yaw and tipped by its pitch, then with the whole body: rig.ts)
  const toes = (ankle: P3, f: Pose["fR"]): P3 => {
    const v = turn(mul(root.r, euler(-f.pitch, f.yaw, 0, "YXZ")), TOES);
    return [ankle[0] + v[0], ankle[1] + v[1], ankle[2] + v[2]];
  };
  return {
    shoulderR: sR,
    shoulderL: sL,
    elbowR: armR.mid,
    elbowL: armL.mid,
    wristR: armR.end,
    wristL: armL.end,
    hipR: hR,
    hipL: hL,
    kneeR: legR.mid,
    kneeL: legL.mid,
    ankleR: legR.end,
    ankleL: legL.end,
    toesR: toes(legR.end, p.fR),
    toesL: toes(legL.end, p.fL),
  };
}

/** The coach's body in a pose (everything sure: the coach is always seen). */
export function coachBody(p: Pose): Body {
  return partsOf(coachJoints(p), () => 1);
}

/**
 * The landmarks a camera would see on someone dancing the pose as the coach shows it (a player
 * following their mirror): for the checks and the tests.
 */
export function coachLandmarks(p: Pose): Landmark[] {
  const j = coachJoints(p);
  const c: P3 = [(j.hipR[0] + j.hipL[0]) / 2, (j.hipR[1] + j.hipL[1]) / 2, (j.hipR[2] + j.hipL[2]) / 2];
  const out: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  // (the coach's sides are the player's; the camera's x and y run the other way, and z away from it)
  for (const k of Object.keys(LM) as Joint[]) out[LM[k]] = { x: -(j[k][0] - c[0]), y: -(j[k][1] - c[1]), z: -(j[k][2] - c[2]), visibility: 0.99 };
  return out;
}

// ---------- a player

const seen = (v: number | undefined) => Math.min(1, Math.max(0, ((v ?? 1) - 0.45) / 0.35));

/** A player's body from the pose model's world landmarks; null when too little of them shows. */
export function playerBody(lm: readonly Landmark[]): Body | null {
  if (lm.length < 33) return null;
  const j = {} as Joints;
  for (const k of Object.keys(LM) as Joint[]) {
    const l = lm[LM[k]]!;
    j[k] = [-l.x, -l.y, -l.z];
  }
  const v = (k: Joint) => seen(lm[LM[k]]!.visibility);
  const b = partsOf(j, (a, c) => (a && c ? Math.min(v(a), v(c)) : Math.min(v("shoulderR"), v("shoulderL"), v("hipR"), v("hipL"))));
  // the back has to show, or nothing else means much
  return b.sure[N - 1]! > 0.2 ? b : null;
}

// ---------- how alike

/** How far each part may turn from the coach's before it stops counting (radians) */
const SIGMA = [0.5, 0.6, 0.5, 0.6, 0.35, 0.4, 0.35, 0.4, 0.5, 0.5, 0.25];
/** how much each part counts before the move says which parts it is about */
export const BASE_WEIGHT = new Float32Array([0.8, 0.8, 0.8, 0.8, 0.7, 0.7, 0.7, 0.7, 0.4, 0.4, 0.5]);

/** The angle between part k of two bodies (radians). */
export function angleOf(a: Body, b: Body, k: number): number {
  const dot = a.dir[3 * k]! * b.dir[3 * k]! + a.dir[3 * k + 1]! * b.dir[3 * k + 1]! + a.dir[3 * k + 2]! * b.dir[3 * k + 2]!;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/** How alike two bodies are, 0 to 1: each part's angle from the coach's, weighted. */
export function likeness(player: Body, coach: Body, weight: Float32Array = BASE_WEIGHT): number {
  let sum = 0;
  let of = 0;
  for (let k = 0; k < N; k++) {
    const w = weight[k]! * player.sure[k]!;
    if (w <= 0) continue;
    sum += w * Math.exp(-((angleOf(player, coach, k) / SIGMA[k]!) ** 2));
    of += w;
  }
  return of > 0 ? sum / of : 0;
}

/**
 * Which parts a move is about: each part's weight, more for a part the coach moves a lot in it (how
 * far its direction strays over the move's beats), less for one that only stands by.
 */
export function moveWeights(bodies: readonly Body[]): Float32Array {
  const w = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const m = [0, 0, 0];
    for (const b of bodies) for (let c = 0; c < 3; c++) m[c]! += b.dir[3 * k + c]!;
    const len = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
    let spread = 0;
    for (const b of bodies) spread += Math.acos(Math.max(-1, Math.min(1, (b.dir[3 * k]! * m[0]! + b.dir[3 * k + 1]! * m[1]! + b.dir[3 * k + 2]! * m[2]!) / len)));
    spread /= Math.max(1, bodies.length);
    w[k] = BASE_WEIGHT[k]! * (0.3 + Math.min(1, spread / 0.35));
  }
  return w;
}
