// Poses a Mixamo-named skeleton (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm,
// LeftForeArm, LeftHand, fingers, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, and Right…) from a
// pose written in the character's own terms: where the hands and feet go, which way the body bends,
// where the head looks. The same pose solves on any such body, in the browser, so a figure of any
// height and build moves alike; and the arms keep out of the body, the head and the floor.
//
// Character space: metres, the ground at y = 0, x = the character's left, y = up, z = forward (the
// way it faces at rest). Angles in degrees. Moves are written for a figure whose eyes are REF_EYE
// above the ground, with ankles ANKLE up: other figures scale them.
import * as THREE from "three";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** a pose, as written (keys.ts): nested plain objects; see the README for its words */
export type PoseSpec = Record<string, any>;
export type V3 = [number, number, number];

const deg = Math.PI / 180;
const v3 = (a: THREE.Vector3 | number[]) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const qAxis = (axis: THREE.Vector3, rad: number) => new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), rad);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** the eye height and ankle height (metres) the moves were written for (the first stand-in's) */
export const REF_EYE = 1.7257;
export const ANKLE = 0.1265;

/** yaw (turn left +), pitch (lean forward +), roll (lean to its right +), about the character's own axes */
export function qBody(yaw = 0, pitch = 0, roll = 0) {
  return qAxis(Y, yaw * deg).multiply(qAxis(X, pitch * deg)).multiply(qAxis(Z, roll * deg));
}

/** the rotation taking a1 to b1, and a2 (as near as it can) to b2 */
function align(a1: THREE.Vector3, a2: THREE.Vector3, b1: THREE.Vector3, b2: THREE.Vector3) {
  const basis = (p: THREE.Vector3, s: THREE.Vector3) => {
    const x = p.clone().normalize();
    const y = s.clone().sub(x.clone().multiplyScalar(s.dot(x))).normalize();
    const z = x.clone().cross(y);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const A = basis(a1, a2);
  const B = basis(b1, b2);
  return new THREE.Quaternion().setFromRotationMatrix(B.multiply(A.transpose()));
}

/** the twist part of q about axis (swing-twist split) */
function twistAngle(q: THREE.Quaternion, axis: THREE.Vector3) {
  const r = new THREE.Vector3(q.x, q.y, q.z);
  const p = axis.clone().multiplyScalar(r.dot(axis));
  const t = new THREE.Quaternion(p.x, p.y, p.z, q.w);
  if (t.lengthSq() < 1e-12) return 0;
  t.normalize();
  let a = 2 * Math.atan2(new THREE.Vector3(t.x, t.y, t.z).dot(axis), t.w);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

const MAIN: Record<string, string> = {
  Hips: "Spine", Spine: "Spine1", Spine1: "Spine2", Spine2: "Neck", Neck: "Head",
  LeftShoulder: "LeftArm", LeftArm: "LeftForeArm", LeftForeArm: "LeftHand", LeftHand: "LeftHandMiddle1",
  RightShoulder: "RightArm", RightArm: "RightForeArm", RightForeArm: "RightHand", RightHand: "RightHandMiddle1",
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg", RightLeg: "RightFoot", RightFoot: "RightToeBase",
};
const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
/** the frames a pose can be written in, by bone */
const FRAMES: Record<string, string> = { hips: "Hips", chest: "Spine2", head: "Head", spine: "Spine1" };

type Thumb = { across?: number; curl?: number[]; spread?: number };
export type HandShape = { Index?: number[]; Middle?: number[]; Ring?: number[]; Pinky?: number[]; Thumb?: Thumb };

/** Finger shapes: curl of joints 1, 2, 3 (into the palm +), spread of joint 1 (away from the middle finger +). */
export const HANDS: Record<string, HandShape> = {
  relaxed: { Index: [8, 14, 8, 2], Middle: [12, 18, 10, 0], Ring: [16, 20, 12, -2], Pinky: [20, 24, 14, -4], Thumb: { across: 10, curl: [4, 8, 6], spread: 4 } },
  open: { Index: [0, 0, 0, 4], Middle: [0, 0, 0, 0], Ring: [0, 0, 0, -4], Pinky: [0, 0, 0, -8], Thumb: { across: 0, curl: [0, 0, 0], spread: 14 } },
  flat: { Index: [0, 0, 0, 0], Middle: [0, 0, 0, 0], Ring: [0, 0, 0, 0], Pinky: [0, 0, 0, 0], Thumb: { across: 6, curl: [0, 0, 0], spread: 0 } },
  fist: { Index: [80, 95, 60, 0], Middle: [85, 95, 60, 0], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: 40, curl: [20, 40, 30], spread: -6 } },
  grip: { Index: [62, 70, 40, 0], Middle: [68, 72, 42, 0], Ring: [72, 72, 42, 0], Pinky: [76, 72, 42, 0], Thumb: { across: 34, curl: [14, 26, 20], spread: -4 } },
  cup: { Index: [38, 40, 24, 2], Middle: [42, 42, 26, 0], Ring: [46, 44, 26, -2], Pinky: [50, 46, 28, -4], Thumb: { across: 30, curl: [6, 14, 10], spread: 4 } },
  point: { Index: [0, 0, 0, 0], Middle: [85, 95, 60, 0], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: 38, curl: [16, 34, 26], spread: -6 } },
  v: { Index: [0, 0, 0, 10], Middle: [0, 0, 0, -8], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: 40, curl: [18, 36, 28], spread: -6 } },
  thumbsup: { Index: [80, 95, 60, 0], Middle: [85, 95, 60, 0], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: -8, curl: [0, 0, 0], spread: 18 } },
  phone: { Index: [18, 24, 12, 0], Middle: [30, 30, 18, 0], Ring: [40, 36, 20, 0], Pinky: [48, 40, 22, 0], Thumb: { across: 20, curl: [4, 10, 6], spread: 6 } },
  spread: { Index: [2, 4, 2, 12], Middle: [2, 4, 2, 2], Ring: [2, 4, 2, -8], Pinky: [2, 4, 2, -18], Thumb: { across: -4, curl: [0, 2, 2], spread: 20 } },
  salute: { Index: [4, 4, 2, 0], Middle: [4, 4, 2, 0], Ring: [4, 4, 2, 0], Pinky: [4, 4, 2, 0], Thumb: { across: 16, curl: [4, 6, 4], spread: -4 } },
};

// ---------------------------------------------------------------- the body, as shapes the limbs keep out of


/**
 * A piece of the body the arms and legs keep out of: an elliptic capsule (a segment with an oval
 * cross-section and round ends) or an ellipsoid (a == b), fixed to a bone, in that bone's rest
 * terms (relative to its head, world axes at rest).
 */
export type Collider = {
  name: string;
  bone: string;
  part: "torso" | "head" | "leg" | "arm";
  side?: "Left" | "Right";
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** the cross-section's axes (unit, rest): across the body, and front to back */
  ax: THREE.Vector3;
  fr: THREE.Vector3;
  /** radii: across, front to back, and along (the ends) */
  r: [number, number, number];
};

const SEGMENTS: { name: string; bone: string; to: string; part: Collider["part"]; side?: "Left" | "Right" }[] = [
  { name: "pelvis", bone: "Hips", to: "Spine", part: "torso" },
  { name: "belly", bone: "Spine", to: "Spine1", part: "torso" },
  { name: "ribs", bone: "Spine1", to: "Spine2", part: "torso" },
  { name: "chest", bone: "Spine2", to: "Neck", part: "torso" },
  { name: "neck", bone: "Neck", to: "Head", part: "torso" },
  { name: "thighL", bone: "LeftUpLeg", to: "LeftLeg", part: "leg", side: "Left" },
  { name: "shinL", bone: "LeftLeg", to: "LeftFoot", part: "leg", side: "Left" },
  { name: "thighR", bone: "RightUpLeg", to: "RightLeg", part: "leg", side: "Right" },
  { name: "shinR", bone: "RightLeg", to: "RightFoot", part: "leg", side: "Right" },
  { name: "upperL", bone: "LeftArm", to: "LeftForeArm", part: "arm", side: "Left" },
  { name: "foreL", bone: "LeftForeArm", to: "LeftHand", part: "arm", side: "Left" },
  { name: "upperR", bone: "RightArm", to: "RightForeArm", part: "arm", side: "Right" },
  { name: "foreR", bone: "RightForeArm", to: "RightHand", part: "arm", side: "Right" },
];

const pct = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};

/**
 * The colliders for a body, from points on its skin and clothes at rest (world, metres) and the
 * bone each point mostly moves with, sized to hold 96% of their points.
 */
export function fitBody(points: ArrayLike<number>, boneOf: ArrayLike<number>, names: string[], heads: Map<string, THREE.Vector3>): Collider[] {
  const out: Collider[] = [];
  const byBone = new Map<string, number[]>();
  for (let i = 0; i < boneOf.length; i++) {
    const n = names[boneOf[i]];
    if (!n) continue;
    let l = byBone.get(n);
    if (!l) byBone.set(n, (l = []));
    l.push(i);
  }
  for (const s of SEGMENTS) {
    const h = heads.get(s.bone);
    const t = heads.get(s.to);
    const ids = byBone.get(s.bone);
    if (!h || !t || !ids?.length) continue;
    const axis = t.clone().sub(h);
    const L = axis.length();
    const u = axis.clone().normalize();
    const ax = X.clone().sub(u.clone().multiplyScalar(u.x)).normalize();
    const fr = ax.clone().cross(u).normalize();
    const as: number[] = [];
    const fs: number[] = [];
    const ts: number[] = [];
    for (const i of ids) {
      const rel = new THREE.Vector3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]).sub(h);
      const along = rel.dot(u) / L;
      if (along < -0.15 || along > 1.15) continue;
      as.push(rel.dot(ax));
      fs.push(rel.dot(fr));
      ts.push(rel.dot(u));
    }
    if (as.length < 8) continue;
    const a0 = (pct(as, 0.02) + pct(as, 0.98)) / 2;
    const f0 = (pct(fs, 0.02) + pct(fs, 0.98)) / 2;
    const ra = (pct(as, 0.98) - pct(as, 0.02)) / 2;
    const rf = (pct(fs, 0.98) - pct(fs, 0.02)) / 2;
    // its length: as far along the bone as its points go (2 cm more each end, to meet the next
    // piece), round ends included; a fat chest's round top would otherwise reach up to the chin
    const t0 = pct(ts, 0.02) - 0.02;
    const t1 = pct(ts, 0.98) + 0.02;
    const rEnd = Math.min(ra, rf, (t1 - t0) / 2);
    const off = ax.clone().multiplyScalar(a0).add(fr.clone().multiplyScalar(f0));
    out.push({ name: s.name, bone: s.bone, part: s.part, side: s.side, a: off.clone().add(u.clone().multiplyScalar(t0 + rEnd)), b: off.clone().add(u.clone().multiplyScalar(t1 - rEnd)), ax, fr, r: [ra, rf, rEnd] });
  }
  // the head: an ellipsoid round the head's own points
  const hb = heads.get("Head");
  const ids = byBone.get("Head");
  if (hb && ids?.length) {
    const c: number[][] = [[], [], []];
    for (const i of ids) for (let k = 0; k < 3; k++) c[k].push(points[i * 3 + k]);
    const mid = c.map((xs) => (pct(xs, 0.02) + pct(xs, 0.98)) / 2);
    const rad = c.map((xs) => (pct(xs, 0.98) - pct(xs, 0.02)) / 2);
    const centre = new THREE.Vector3(mid[0], mid[1], mid[2]).sub(hb);
    out.push({ name: "head", bone: "Head", part: "head", a: centre.clone(), b: centre.clone(), ax: X.clone(), fr: Z.clone(), r: [rad[0], rad[2], rad[1]] });
  }
  return out;
}

/**
 * Where this body's chest, head and hips frames sit, so the moves' points (written on the first
 * stand-in) land at the same places on it: the chest's front 0.155 m ahead of the chest frame, the
 * eyes 0.0872 m above and 0.083 m ahead of the head's, the hip joints' midpoint a little above the
 * hips' (each times the body's size against the stand-in's, as the points are). points: the skin
 * and clothes at rest (world, metres).
 */
export function figureFrames(points: ArrayLike<number>, heads: Map<string, THREE.Vector3>): Record<string, V3> {
  const at = (n: string) => heads.get(n) ?? new THREE.Vector3();
  const sp = at("Spine2");
  const eyes = at("LeftEye").clone().add(at("RightEye")).multiplyScalar(0.5);
  const k = eyes.y > 0 ? eyes.y / REF_EYE : 1;
  let front = -Infinity;
  for (let i = 0; i < points.length; i += 3) if (Math.abs(points[i]) < 0.04 && Math.abs(points[i + 1] - sp.y) < 0.03) front = Math.max(front, points[i + 2]);
  if (!Number.isFinite(front)) front = sp.z + 0.155 * k;
  const legs = at("LeftUpLeg").clone().add(at("RightUpLeg")).multiplyScalar(0.5);
  const hd = at("Head");
  const hips = at("Hips");
  return {
    chest: [0, 0, front - sp.z - 0.155 * k],
    head: [0, eyes.y - hd.y - 0.0872 * k, eyes.z - hd.z - 0.083 * k],
    hips: [legs.x - hips.x, legs.y - 0.0053 * k - hips.y, legs.z + 0.0031 * k - hips.z],
  };
}

/** what each arm chose last frame, keeping out of the body: its hand target and elbow direction (world) */
export type KeepMem = Partial<Record<string, { T: THREE.Vector3; pole: THREE.Vector3 }>>;

/** a ball to keep out of the body: its centre (world) and radius */
type Probe = { p: THREE.Vector3; r: number };

export type RigOptions = {
  /** where this body's chest, head and hips frames sit off their bones (metres, rest) */
  frames?: Record<string, V3 | THREE.Vector3>;
  /** the body's pieces, to keep the arms (and the legs, from each other) out of */
  body?: Collider[];
};

type Bone = {
  name: string;
  parent: Bone | null;
  t: THREE.Vector3;
  r: THREE.Quaternion;
  Wr: THREE.Quaternion;
  Pr: THREE.Vector3;
  off: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
};
type HandFrame = { fingers: THREE.Vector3; palm: THREE.Vector3; thumbSide: THREE.Vector3; grip: THREE.Vector3; len: number };

export class Rig {
  bones = new Map<string, Bone>();
  order: Bone[] = [];
  hand: Record<string, HandFrame> = {};
  hinge: Record<string, THREE.Vector3> = {};
  eyes: THREE.Vector3;
  /** this figure's size against the one the moves were written for (by eye height) */
  k: number;
  ankle: number;
  frameOff: Record<string, THREE.Vector3>;
  body: Collider[];
  D = new Map<string, THREE.Quaternion>();
  P = new Map<string, THREE.Vector3>();
  /** how deep the limbs went into the body in the last pose solved, before and after keeping them out (metres) */
  inside = { before: 0, after: 0 };
  /** what's still inside after solving (set it to [] to collect) */
  debug: string[] | null = null;
  lastHit = "";

  /** nodes: [{ name, parent, t: [x, y, z], r: [x, y, z, w] }], parents before children */
  constructor(nodes: { name: string; parent: string | null; t: number[]; r: number[] }[], o: RigOptions = {}) {
    this.frameOff = Object.fromEntries(Object.entries(o.frames ?? {}).map(([k, v]) => [k, v3(v as number[])]));
    this.body = o.body ?? [];
    for (const n of nodes) {
      const parent = n.parent ? this.bones.get(n.parent) ?? null : null;
      const t = v3(n.t);
      const r = new THREE.Quaternion(n.r[0], n.r[1], n.r[2], n.r[3]);
      const Wr = parent ? parent.Wr.clone().multiply(r) : r.clone();
      const Pr = parent ? parent.Pr.clone().add(t.clone().applyQuaternion(parent.Wr)) : t.clone();
      const b: Bone = { name: n.name, parent, t, r, Wr, Pr, off: parent ? Pr.clone().sub(parent.Pr) : new THREE.Vector3(), dir: Y.clone(), len: 0.05 };
      this.bones.set(n.name, b);
      this.order.push(b);
    }
    for (const b of this.order) {
      const main = this.bones.get(MAIN[b.name] ?? "") ?? this.order.find((c) => c.parent === b && /\d$/.test(c.name) && c.name.replace(/\d$/, "") === b.name.replace(/\d$/, ""));
      b.dir = main ? main.off.clone().normalize() : Y.clone().applyQuaternion(b.Wr);
      b.len = main ? main.off.length() : 0.05;
    }
    const get = (n: string) => {
      const b = this.bones.get(n);
      if (!b) throw new Error(`no bone ${n}`);
      return b;
    };
    // each hand's rest frame: fingers along, palm normal out of the palm
    for (const side of ["Left", "Right"]) {
      const h = get(`${side}Hand`);
      const idx = get(`${side}HandIndex1`).Pr.clone().sub(h.Pr);
      const pky = get(`${side}HandPinky1`).Pr.clone().sub(h.Pr);
      const mid = get(`${side}HandMiddle1`).Pr.clone().sub(h.Pr);
      const fingers = mid.clone().normalize();
      let palm = idx.clone().cross(pky).normalize();
      if (side === "Left") palm.negate();
      palm = palm.sub(fingers.clone().multiplyScalar(palm.dot(fingers))).normalize();
      // the thumb's side of the hand
      const thumbSide = get(`${side}HandThumb1`).Pr.clone().sub(h.Pr);
      thumbSide.sub(fingers.clone().multiplyScalar(thumbSide.dot(fingers))).sub(palm.clone().multiplyScalar(thumbSide.dot(palm))).normalize();
      // where a held handle runs through the closed hand: along the fingers, out from the palm
      const grip = fingers.clone().multiplyScalar(0.085).add(palm.clone().multiplyScalar(0.032));
      // the hand's length: the middle finger's knuckle and its bones
      let len = mid.length();
      for (const i of [1, 2, 3]) len += this.bones.get(`${side}HandMiddle${i}`)?.len ?? 0;
      this.hand[side] = { fingers, palm, thumbSide, grip, len };
    }
    // the elbows' and knees' hinge at rest: across the bend of an arm that rests bent (an A pose),
    // else as a straight arm along ±x bends its forearm forward (+z): about -y (left) or +y (right)
    for (const side of ["Left", "Right"]) {
      const s = side === "Left" ? 1 : -1;
      const bent = get(`${side}Arm`).dir.clone().cross(get(`${side}ForeArm`).dir);
      this.hinge[`${side}Arm`] = bent.length() > 0.2 ? bent.normalize() : new THREE.Vector3(0, -s, 0);
      this.hinge[`${side}UpLeg`] = new THREE.Vector3(1, 0, 0);
    }
    const l = this.bones.get("LeftEye");
    const r = this.bones.get("RightEye");
    this.eyes = l && r ? l.Pr.clone().add(r.Pr).multiplyScalar(0.5) : get("Head").Pr.clone().add(new THREE.Vector3(0, 0.09, 0.08));
    this.k = this.eyes.y / REF_EYE;
    this.ankle = get("LeftFoot").Pr.y;
  }

  handShape(h: string | HandShape): HandShape {
    return typeof h === "string" ? HANDS[h] ?? HANDS.relaxed : h;
  }

  /** a frame's origin and turn: { p, q } (from a pose being solved, or the last one) */
  frameOf(f: string | undefined, P = this.P, D = this.D) {
    if (!f || f === "char") return { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    const name = FRAMES[f] ?? f;
    const q = (D.get(name) ?? new THREE.Quaternion()).clone();
    const p = (P.get(name) ?? new THREE.Vector3()).clone();
    // a frame's own offsets were written at the first stand-in's size
    if (this.frameOff[f]) p.add(this.frameOff[f].clone().applyQuaternion(q));
    return { p, q };
  }

  /** a point written in char terms, on this figure: scaled by its size */
  charPoint(p: number[]) {
    return new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(this.k);
  }

  /** how far a ball is inside the body (a push to take it out, world), skipping the colliders `skip` says */
  pushOut(pr: Probe, D: Map<string, THREE.Quaternion>, P: Map<string, THREE.Vector3>, skip?: (c: Collider) => boolean) {
    let best: THREE.Vector3 | null = null;
    let deepest = 0;
    for (const c of this.body) {
      if (skip?.(c)) continue;
      const qd = D.get(c.bone);
      const pb = P.get(c.bone);
      if (!qd || !pb) continue;
      const inv = qd.clone().invert();
      const q = pr.p.clone().sub(pb).applyQuaternion(inv);
      const ab = c.b.clone().sub(c.a);
      const L2 = ab.lengthSq();
      const t = L2 > 1e-9 ? Math.min(1, Math.max(0, q.clone().sub(c.a).dot(ab) / L2)) : 0;
      const m = c.a.clone().add(ab.clone().multiplyScalar(t));
      const d = q.clone().sub(m);
      const up = L2 > 1e-9 ? ab.clone().normalize() : Y.clone();
      const ra = c.r[0] + pr.r;
      const rf = c.r[1] + pr.r;
      const ru = c.r[2] + pr.r;
      const da = d.dot(c.ax);
      const df = d.dot(c.fr);
      const du = d.dot(up);
      const n = Math.sqrt((da / ra) ** 2 + (df / rf) ** 2 + (du / ru) ** 2);
      if (n >= 1) continue;
      // out along its own line from the middle, to the surface (straight out the front if dead centre)
      let push: THREE.Vector3;
      if (n < 1e-4) push = c.fr.clone().multiplyScalar(rf);
      else push = c.ax.clone().multiplyScalar(da).add(c.fr.clone().multiplyScalar(df)).add(up.clone().multiplyScalar(du)).multiplyScalar(1 / n - 1);
      const depth = push.length();
      if (depth > deepest) {
        deepest = depth;
        best = push.applyQuaternion(qd);
        this.lastHit = c.name;
      }
    }
    return best;
  }

  /** Solves a pose: returns { local: Map(name → Quaternion), hips: Vector3 (the Hips translation) } and keeps the world state for drawing and checks. */
  /** a pose solved onto the bones; `mem` carries what the frame before chose (a clip solved frame by frame), so an arm kept out doesn't jump about */
  solve(pose: PoseSpec, mem?: KeepMem) {
    const D = new Map<string, THREE.Quaternion>();
    const P = new Map<string, THREE.Vector3>();
    const local = new Map<string, THREE.Quaternion>();
    const E = new Map<string, THREE.Quaternion>();
    const get = (n: string) => this.bones.get(n) as Bone;
    const setE = (b: Bone, e: THREE.Quaternion) => {
      const dp = b.parent ? (D.get(b.parent.name) as THREE.Quaternion) : new THREE.Quaternion();
      D.set(b.name, dp.clone().multiply(e));
      const p = b.parent ? (P.get(b.parent.name) as THREE.Vector3).clone().add(b.off.clone().applyQuaternion(dp)) : b.Pr.clone();
      P.set(b.name, p);
      E.set(b.name, e);
    };
    const frame = (f?: string) => this.frameOf(f, P, D);
    const point = (spec: any) => {
      if (!spec) return null;
      if (!spec.frame || spec.frame === "char") return this.charPoint(spec.p);
      // (written for the first stand-in: a bigger body, a bigger reach)
      const fr = frame(spec.frame);
      return v3(spec.p).multiplyScalar(this.k).applyQuaternion(fr.q).add(fr.p);
    };
    const dirOf = (spec: any, fallbackFrame: string): THREE.Vector3 => {
      const arr = Array.isArray(spec) ? spec : spec.d;
      const fr = frame(Array.isArray(spec) ? fallbackFrame : spec.frame ?? fallbackFrame);
      return v3(arr).normalize().applyQuaternion(fr.q);
    };
    const swingTo = (b: Bone, worldDir: THREE.Vector3) => {
      const dp = b.parent ? (D.get(b.parent.name) as THREE.Quaternion) : new THREE.Quaternion();
      const want = worldDir.clone().applyQuaternion(dp.clone().invert()).normalize();
      return new THREE.Quaternion().setFromUnitVectors(b.dir, want);
    };
    let before = 0;
    let after = 0;

    // ---- hips
    const hipsB = get("Hips");
    const hp = pose.hips ?? {};
    const hq = qBody(hp.yaw, hp.pitch, hp.roll);
    D.set("Hips", hq.clone());
    E.set("Hips", hq.clone());
    P.set("Hips", hipsB.Pr.clone().add(v3(hp.pos ?? [0, 0, 0]).multiplyScalar(this.k)));

    // ---- spine: bend forward, to the side (its left +), twist (to its left +)
    const sp = pose.spine ?? {};
    const share: Record<string, number> = { Spine: 0.25, Spine1: 0.35, Spine2: 0.4 };
    for (const n of ["Spine", "Spine1", "Spine2"]) {
      const w = share[n];
      setE(get(n), qBody((sp.twist ?? 0) * w, (sp.bend ?? 0) * w, -(sp.side ?? 0) * w));
    }

    // ---- neck and head: look at a point, then nod (chin down +), turn (its left +), tilt (to its left shoulder +)
    const hd = pose.head ?? {};
    let turn = hd.turn ?? 0;
    let nod = hd.nod ?? 0;
    if (hd.look) {
      // the look's direction, in the chest's own terms
      const neckB = get("Neck");
      const pNeck = (P.get("Spine2") as THREE.Vector3).clone().add(neckB.off.clone().applyQuaternion(D.get("Spine2") as THREE.Quaternion));
      const eyes = this.eyes.clone().sub(neckB.Pr).applyQuaternion(D.get("Spine2") as THREE.Quaternion).add(pNeck);
      const want = (point(hd.look) as THREE.Vector3).sub(eyes).normalize().applyQuaternion((D.get("Spine2") as THREE.Quaternion).clone().invert());
      turn += Math.atan2(want.x, want.z) / deg;
      nod += Math.atan2(-want.y, Math.hypot(want.x, want.z)) / deg;
    }
    setE(get("Neck"), qBody(turn * 0.4, nod * 0.4, -(hd.tilt ?? 0) * 0.4));
    setE(get("Head"), qBody(turn * 0.6, nod * 0.6, -(hd.tilt ?? 0) * 0.6));
    for (const n of ["LeftEye", "RightEye", "HeadTop_End"]) if (this.bones.get(n)) setE(get(n), new THREE.Quaternion());

    // ---- legs first (the arms keep out of them): the ankle to a point (feet stay where they stood
    // unless told), the knee toward the pole; the shins kept off each other
    for (const side of ["Left", "Right"]) {
      const s = side === "Left" ? 1 : -1;
      const l = (side === "Left" ? pose.legL : pose.legR) ?? {};
      const th = get(`${side}UpLeg`);
      const sh = get(`${side}Leg`);
      const ft = get(`${side}Foot`);
      const toe = get(`${side}ToeBase`);
      const H = (P.get("Hips") as THREE.Vector3).clone().add(th.off.clone().applyQuaternion(D.get("Hips") as THREE.Quaternion));
      let T: THREE.Vector3;
      if (l.foot && (l.foot.frame ?? "char") === "char") {
        // a foot written on the ground stays on this figure's ground
        T = this.charPoint(l.foot.p);
        T.y = (l.foot.p[1] - ANKLE) * this.k + this.ankle;
      } else T = l.foot ? (point(l.foot) as THREE.Vector3) : ft.Pr.clone();
      const la = th.len;
      const lb = sh.len;
      const toT = T.clone().sub(H);
      let d = toT.length();
      const u = toT.normalize();
      d = Math.min(Math.max(d, Math.abs(la - lb) + 1e-3), la + lb - 1e-4);
      const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const pole = dirOf(l.pole ?? { frame: "hips", d: [s * 0.12, 0, 1] }, "hips");
      const pPerp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
      if (pPerp.lengthSq() < 1e-8) pPerp.set(0, 0, 1);
      pPerp.normalize();
      const K = H.clone().add(u.clone().multiplyScalar(la * cosA)).add(pPerp.clone().multiplyScalar(la * sinA));
      const uDir = K.clone().sub(H).normalize();
      const fDir = H.clone().add(u.clone().multiplyScalar(d)).sub(K).normalize();
      let eT = swingTo(th, uDir);
      {
        const dPar = D.get("Hips") as THREE.Quaternion;
        const hingeNow = this.hinge[`${side}UpLeg`].clone().applyQuaternion(dPar.clone().multiply(eT));
        const want = uDir.clone().cross(fDir);
        if (want.lengthSq() > 0.02) {
          want.normalize();
          const hn = hingeNow.sub(uDir.clone().multiplyScalar(hingeNow.dot(uDir))).normalize();
          const ang = Math.atan2(hn.clone().cross(want).dot(uDir), hn.dot(want));
          eT = qAxis(uDir.clone().applyQuaternion(dPar.clone().invert()), ang).multiply(eT);
        } else {
          // a straight leg: its knee faces the pole
          const hn = hingeNow.sub(uDir.clone().multiplyScalar(hingeNow.dot(uDir))).normalize();
          const wantH = uDir.clone().cross(pPerp).negate().normalize();
          const ang = Math.atan2(hn.clone().cross(wantH).dot(uDir), hn.dot(wantH));
          eT = qAxis(uDir.clone().applyQuaternion(dPar.clone().invert()), ang).multiply(eT);
        }
      }
      setE(th, eT);
      setE(sh, swingTo(sh, fDir));
      // the foot: flat on the ground and facing as it stood, unless told
      const fo = l.footDir ? dirOf(l.footDir, "char") : ft.dir.clone().applyQuaternion(qAxis(Y, (l.footYaw ?? 0) * deg)).applyQuaternion(qAxis(X, (l.footPitch ?? 0) * deg));
      const dLeg = D.get(sh.name) as THREE.Quaternion;
      setE(ft, dLeg.clone().invert().multiply(new THREE.Quaternion().setFromUnitVectors(ft.dir, fo.clone().normalize())));
      setE(toe, qAxis(X, (l.toe ?? 0) * deg));
    }

    // ---- arms
    for (const side of ["Left", "Right"]) {
      const s = side === "Left" ? 1 : -1;
      const a = (side === "Left" ? pose.L : pose.R) ?? {};
      const sh = get(`${side}Shoulder`);
      const up = get(`${side}Arm`);
      const fo = get(`${side}ForeArm`);
      const ha = get(`${side}Hand`);
      const hf = this.hand[side];
      // collarbone: up (shrug) and forward
      const cl = a.clav ?? {};
      setE(sh, qAxis(Z, s * (cl.up ?? 0) * deg).multiply(qAxis(Y, -s * (cl.fwd ?? 0) * deg)));
      const S = (P.get(sh.name) as THREE.Vector3).clone().add(up.off.clone().applyQuaternion(D.get(sh.name) as THREE.Quaternion));
      // the hand's wanted directions (world): from fingers + palm, or the thumb's side + palm
      let want: { f: THREE.Vector3; p: THREE.Vector3 } | null = null;
      if (a.orient) {
        const fr = a.orient.frame ?? "chest";
        const p0 = dirOf(a.orient.palm, fr);
        if (a.orient.thumb) {
          const ts = dirOf(a.orient.thumb, fr);
          const pw = p0.clone().sub(ts.clone().multiplyScalar(p0.dot(ts))).normalize();
          const fw = side === "Right" ? pw.clone().cross(ts) : ts.clone().cross(pw);
          want = { f: fw.normalize(), p: pw };
        } else want = { f: dirOf(a.orient.fingers, fr), p: p0 };
      }
      const R = want ? align(hf.fingers, hf.palm, want.f, want.p) : null;
      const la = up.len;
      const lb = fo.len;
      // the elbow's circle: the two-bone reach from the shoulder to a wrist at W, the elbow toward `pole`
      const reach = (W: THREE.Vector3, pole: THREE.Vector3) => {
        const toT = W.clone().sub(S);
        let d = toT.length();
        const u = toT.normalize();
        d = Math.min(Math.max(d, Math.abs(la - lb) + 1e-3), la + lb - 1e-4);
        const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const pPerp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
        if (pPerp.lengthSq() < 1e-8) pPerp.copy(new THREE.Vector3(0, -1, 0).sub(u.clone().multiplyScalar(-u.y)));
        pPerp.normalize();
        const El = S.clone().add(u.clone().multiplyScalar(la * cosA)).add(pPerp.clone().multiplyScalar(la * sinA));
        const Wr = S.clone().add(u.clone().multiplyScalar(d));
        return { El, Wr, uDir: El.clone().sub(S).normalize(), fDir: Wr.clone().sub(El).normalize() };
      };
      let uDir: THREE.Vector3;
      let fDir: THREE.Vector3;
      if (a.hand || a.grip) {
        let T: THREE.Vector3;
        if (a.grip) T = (point(a.grip) as THREE.Vector3).sub(hf.grip.clone().applyQuaternion(R as THREE.Quaternion));
        else T = point(a.hand) as THREE.Vector3;
        let pole = dirOf(a.pole ?? { frame: "chest", d: [s * 0.35, -0.55, -0.75] }, "chest");
        // keep out of the body, the head, the legs and the floor: the hand pushed out to the skin,
        // the elbow swung round its circle (a few goes: each move can bring another part in)
        const fingersW = (r: ReturnType<typeof reach>) => (want ? want.f.clone() : r.fDir.clone());
        const probes = (r: ReturnType<typeof reach>): { pr: Probe; hand: boolean; upper: boolean }[] => {
          const f = fingersW(r);
          const out: { pr: Probe; hand: boolean; upper: boolean }[] = [];
          out.push({ pr: { p: r.Wr.clone().add(f.clone().multiplyScalar(hf.len * 0.45)), r: 0.03 }, hand: true, upper: false });
          out.push({ pr: { p: r.Wr.clone().add(f.clone().multiplyScalar(hf.len * 0.9)), r: 0.018 }, hand: true, upper: false });
          out.push({ pr: { p: r.Wr.clone(), r: 0.032 }, hand: true, upper: false });
          for (const t of [0.35, 0.7]) out.push({ pr: { p: r.El.clone().lerp(r.Wr, t), r: 0.04 }, hand: false, upper: false });
          out.push({ pr: { p: r.El.clone(), r: 0.042 }, hand: false, upper: false });
          out.push({ pr: { p: S.clone().lerp(r.El, 0.6), r: 0.048 }, hand: false, upper: true });
          return out;
        };
        // the upper arm grows out of the chest: it only keeps out of the rest; an arm keeps out of the
        // other arm (the one solved before it), never its own
        const skipFor = (upper: boolean, hand: boolean) => (c: Collider) =>
          (c.part === "arm" && (c.side === side || hand)) || (upper && (c.name === "chest" || c.name === "neck" || c.name === "ribs"));
        const depth = (r: ReturnType<typeof reach>) => {
          let worst = 0;
          let hand: THREE.Vector3 | null = null;
          let arm: THREE.Vector3 | null = null;
          for (const x of probes(r)) {
            let push = this.pushOut(x.pr, D, P, skipFor(x.upper, x.hand));
            // and above the floor
            const floor = x.pr.r - x.pr.p.y;
            if (floor > 0 && (!push || floor > push.length())) push = new THREE.Vector3(0, floor, 0);
            if (!push) continue;
            const len = push.length();
            worst = Math.max(worst, len);
            if (x.hand) {
              if (!hand || len > hand.length()) hand = push;
            } else if (!arm || len > arm.length()) arm = push;
          }
          return { worst, hand, arm };
        };
        let r = reach(T, pole);
        let dep = depth(r);
        before = Math.max(before, dep.worst);
        const written = { T: T.clone(), pole: pole.clone() };
        for (let it = 0; it < 6 && dep.worst > 0.004; it++) {
          if (dep.arm) {
            // the elbow: round its circle, the way that comes out soonest
            const axis = r.Wr.clone().sub(S).normalize();
            let bestPole = pole;
            let bestDep = dep;
            for (const ang of [20, -20, 40, -40, 65, -65, 90, -90]) {
              const p2 = pole.clone().applyAxisAngle(axis, ang * deg);
              const d2 = depth(reach(T, p2));
              if (d2.worst < bestDep.worst - 1e-4) {
                bestDep = d2;
                bestPole = p2;
                if (d2.worst <= 0.004) break;
              }
            }
            pole = bestPole;
            if (bestDep.arm && bestDep === dep) T.add(dep.arm.clone().multiplyScalar(0.6));
          }
          r = reach(T, pole);
          dep = depth(r);
          if (dep.hand) {
            T.add(dep.hand.clone().multiplyScalar(1.05));
            r = reach(T, pole);
            dep = depth(r);
          }
        }
        // still in (a body much bigger or smaller than the moves were written on): a wider look,
        // the elbow anywhere round its circle and the hand moved out a little in a few ways; the
        // least deep wins, then the nearest to what was written and to the frame before
        const last = mem?.[side];
        if (dep.worst > 0.008) {
          const ways: THREE.Vector3[] = [];
          if (dep.arm) ways.push(dep.arm.clone().normalize());
          if (dep.hand) ways.push(dep.hand.clone().normalize());
          // out from the body's middle, level
          const out = written.T.clone().sub(P.get("Spine1") as THREE.Vector3).setY(0);
          if (out.lengthSq() > 1e-6) ways.push(out.normalize());
          // and out to its own side, forward, and up
          const hq = D.get("Hips") as THREE.Quaternion;
          ways.push(X.clone().multiplyScalar(s).applyQuaternion(hq).setY(0).normalize(), Z.clone().applyQuaternion(hq).setY(0).normalize(), Y.clone());
          let best = { cost: Infinity, T, pole, r, dep };
          // from where the move put the hand, and from where the quick fix took it
          const starts = written.T.distanceTo(T) > 0.01 ? [written, { T, pole }] : [written];
          for (const from of starts)
            for (const far of [0, 0.03, 0.06, 0.1, 0.14])
              for (const way of far ? ways : [null]) {
                const Tc = way ? from.T.clone().addScaledVector(way, far) : from.T.clone();
                const axis = Tc.clone().sub(S).normalize();
                for (let ang = -150; ang <= 180; ang += 30) {
                  const pc = from.pole.clone().applyAxisAngle(axis, ang * deg);
                  const rc = reach(Tc, pc);
                  const dc = depth(rc);
                  let cost = dc.worst * 100 + Tc.distanceTo(written.T) + Math.abs(ang) / 1800;
                  if (last) cost += (pc.angleTo(last.pole) / Math.PI) * 0.3 + Tc.distanceTo(last.T) * 2;
                  if (cost < best.cost) best = { cost, T: Tc, pole: pc, r: rc, dep: dc };
                }
              }
          if (best.dep.worst < dep.worst) ({ T, pole, r, dep } = best);
        }
        if (mem) mem[side] = { T: T.clone(), pole: pole.clone() };
        after = Math.max(after, dep.worst);
        if (this.debug && dep.worst > 0.01)
          for (const x of probes(r)) {
            const push = this.pushOut(x.pr, D, P, skipFor(x.upper, x.hand));
            if (push && push.length() > 0.01) this.debug.push(`${side} ${x.hand ? "hand" : x.upper ? "upper" : "fore"} ${(push.length() * 100).toFixed(1)}cm ${this.lastHit}`);
            if (x.pr.r - x.pr.p.y > 0.01) this.debug.push(`${side} floor ${((x.pr.r - x.pr.p.y) * 100).toFixed(1)}cm`);
          }
        uDir = r.uDir;
        fDir = r.fDir;
      } else {
        uDir = dirOf(a.arm ?? [s * 0.12, -1, 0.02], "chest");
        fDir = dirOf(a.fore ?? a.arm ?? [s * 0.08, -1, 0.12], "chest");
      }
      // upper arm: point it, then turn it so its hinge lies across the bend
      let eU = swingTo(up, uDir);
      {
        const dPar = D.get(sh.name) as THREE.Quaternion;
        const hingeNow = this.hinge[`${side}Arm`].clone().applyQuaternion(dPar.clone().multiply(eU));
        const wantH = uDir.clone().cross(fDir);
        if (wantH.lengthSq() > 0.02) {
          wantH.normalize();
          const hn = hingeNow.sub(uDir.clone().multiplyScalar(hingeNow.dot(uDir))).normalize();
          const ang = Math.atan2(hn.clone().cross(wantH).dot(uDir), hn.dot(wantH));
          eU = qAxis(uDir.clone().applyQuaternion(dPar.clone().invert()), ang).multiply(eU);
        }
      }
      setE(up, eU);
      let eF = swingTo(fo, fDir);
      setE(fo, eF);
      // hand: a direction for the fingers and the palm, or follow the forearm
      if (R) {
        const dF = D.get(fo.name) as THREE.Quaternion;
        let eH = dF.clone().invert().multiply(R);
        // give part of the wrist's twist to the forearm, as a real forearm turns
        const ang = twistAngle(eH, fo.dir) * (a.twistShare ?? 0.6);
        const tw = qAxis(fo.dir, ang);
        eF = eF.clone().multiply(tw);
        setE(fo, eF);
        eH = tw.clone().invert().multiply(eH);
        setE(ha, eH);
      } else {
        setE(ha, qAxis(hf.palm.clone().cross(hf.fingers), (a.wrist ?? 0) * deg));
      }
      // fingers: curl into the palm, spread toward the thumb's side (+) or the little finger's (-)
      const shape = this.handShape(a.fingers ?? "relaxed");
      const { fingers: hfF, palm: pn, thumbSide: ts } = hf;
      const spreadAxis = hfF.clone().cross(ts).normalize();
      for (const F of FINGERS) {
        const j = [1, 2, 3, 4].map((i) => this.bones.get(`${side}Hand${F}${i}`)).filter((x): x is Bone => !!x);
        if (!j.length) continue;
        if (F === "Thumb") {
          const t = shape.Thumb ?? {};
          // across: in front of the palm; spread: away from the index finger; curl: its joints bend toward the palm
          const acrossAxis = ts.clone().cross(pn).normalize();
          for (let i = 0; i < j.length; i++) {
            const curlAxis = j[i].dir.clone().cross(pn).normalize();
            let e = qAxis(curlAxis, (t.curl?.[i] ?? 0) * deg);
            if (i === 0) e = qAxis(acrossAxis, (t.across ?? 0) * deg).multiply(qAxis(spreadAxis, (t.spread ?? 0) * deg)).multiply(e);
            setE(j[i], e);
          }
          continue;
        }
        const c = (shape as Record<string, number[]>)[F] ?? [0, 0, 0, 0];
        for (let i = 0; i < j.length; i++) {
          if (i > 2) {
            setE(j[i], new THREE.Quaternion());
            continue;
          }
          const curlAxis = j[i].dir.clone().cross(pn).normalize();
          let e = qAxis(curlAxis, (c[i] ?? 0) * deg);
          if (i === 0) e = qAxis(spreadAxis, (c[3] ?? 0) * deg).multiply(e);
          setE(j[i], e);
        }
      }
    }

    // every other bone follows its parent
    for (const b of this.order) if (!E.has(b.name)) setE(b, new THREE.Quaternion());

    // local rotations: L = Wr(parent)^-1 · E · Wr
    for (const b of this.order) {
      const e = E.get(b.name) as THREE.Quaternion;
      const l = b.parent ? b.parent.Wr.clone().invert().multiply(e).multiply(b.Wr) : e.clone().multiply(b.Wr);
      local.set(b.name, l.normalize());
    }
    this.D = D;
    this.P = P;
    this.inside = { before, after };
    // the Hips node's translation (its parent is the scene, at the origin)
    const hipsT = (P.get("Hips") as THREE.Vector3).clone().sub(hipsB.Pr).add(hipsB.t);
    return { local, hips: hipsT };
  }
}
