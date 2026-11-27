/**
 * The common mistakes in a character's motion (Steve on Nov 21: "舞蹈动作…一定要…检查没有常见的的AI
 * 生成错误，要符合现实物理逻辑"), measured on her as the page plays a dance: her feet skating on the
 * floor while they stand on it, going into it, both off it too long; knees bending backwards; hands
 * inside her body or head; standing on one foot with her weight far off it; jitter (a joint's turn
 * jerking from frame to frame), and a jump where the loop starts again.
 */
import * as THREE from "three";

export type MotionFacts = {
  /**
   * Of the frames a foot stands on the floor with her weight on it (a stand of at least a sixth of a
   * second, its first and last two frames left out: landing and lifting off; her hips nearer over it
   * than over the other foot, or the other up), the share it slides along it (heel and toe both moving,
   * slower than a step: faster, it isn't standing). A foot brushing the floor as it steps, her weight on
   * the other, is how Latin dancers step.
   */
  skate: number;
  /** How far a foot goes into the floor (metres, below where it stands at rest). */
  sink: number;
  /** The longest both feet are off the floor (seconds). */
  air: number;
  /** The furthest a knee bends backwards (degrees past straight). */
  knee: number;
  /**
   * How deep a hand or forearm goes into her (metres, counting its own thickness: her trunk's and
   * thighs' shape read from her model, dancer/hands.ts), or without her shape, a wrist into her
   * trunk's or head's rough size.
   */
  hand: number;
  /** The longest she stands on one foot with her hips far off it (seconds). */
  tilt: number;
  /** The sharpest jerk in any joint's turning (radians a second, a second: the top 0.2%). */
  jerk: number;
  /** The turn at the loop's seam against the frames beside it, or an ordinary one's (times as much, the worst joint). */
  seam: number;
};

/** her pose in a frame: where a joint is, how it's turned, and how deep her hands are in her (hands.ts handDepth) */
type Pose = { at: (name: string) => THREE.Vector3; turn: (name: string) => THREE.Quaternion; inside?: number };

/**
 * Her motion's facts, frame by frame: `pose(k)` puts her in frame k of n (the clip played as the page
 * plays it) and reads where her joints are; `fps` the frames a second.
 */
export function motionFacts(n: number, fps: number, pose: (k: number) => Pose, rest: { ankle: number; toe: number }, walk: boolean): MotionFacts {
  const P: Record<string, THREE.Vector3[]> = {};
  const Q: Record<string, THREE.Quaternion[]> = {};
  const names = ["Hips", "Spine2", "Head", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftHand", "RightHand", "LeftLeg", "RightLeg"];
  const turned = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"];
  for (const s of names) P[s] = [];
  for (const s of turned) Q[s] = [];
  let inside: number | null = null;
  for (let k = 0; k <= n; k++) {
    const p = pose(k % n);
    if (p.inside !== undefined) inside = Math.max(inside ?? 0, p.inside);
    for (const s of names) P[s].push(p.at(s).clone());
    for (const s of turned) Q[s].push(p.turn(s).clone());
  }
  const dt = 1 / fps;
  const down = (s: "Left" | "Right", k: number) => P[`${s}Foot`][k].y - rest.ankle < 0.04 || P[`${s}ToeBase`][k].y - rest.toe < 0.03;
  // skating: a foot standing on the floor whose heel and toe both slide (a turn on the ball of the foot
  // is fine, so is the moment it lands or lifts)
  let stood = 0;
  let slid = 0;
  const least = Math.max(5, Math.round(fps / 6));
  const v = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(b.x - a.x, b.z - a.z) / dt;
  for (const s of ["Left", "Right"] as const) {
    const on = Array.from({ length: n }, (_, k) => down(s, k));
    if (on.every(Boolean)) on[0] = false;
    const start = on.findIndex((d, k) => d && !on[(k - 1 + n) % n]);
    if (start < 0) continue;
    for (let k0 = start, seen = 0; seen < n; ) {
      if (!on[k0 % n]) {
        k0++;
        seen++;
        continue;
      }
      let len = 0;
      while (len < n && on[(k0 + len) % n]) len++;
      if (len >= least) {
        const o = s === "Left" ? "Right" : "Left";
        const off = (f: string, k: number) => Math.hypot(P.Hips[k].x - P[f][k].x, P.Hips[k].z - P[f][k].z);
        for (let j = 2; j < len - 3; j++) {
          const k = (k0 + j) % n;
          if (down(o, k) && off(`${s}Foot`, k) > off(`${o}Foot`, k) + 0.05) continue;
          stood++;
          const heel = v(P[`${s}Foot`][k], P[`${s}Foot`][k + 1]);
          const toe = v(P[`${s}ToeBase`][k], P[`${s}ToeBase`][k + 1]);
          if (heel > 1.2 && toe > 1.2) {
            stood--;
            continue;
          }
          if (heel > 0.25 && toe > 0.25) slid++;
        }
      }
      k0 += len;
      seen += len;
    }
  }
  const skate = walk ? 0 : slid / Math.max(1, stood);
  // into the floor
  let sink = 0;
  for (let k = 0; k < n; k++) {
    for (const s of ["Left", "Right"] as const) {
      sink = Math.max(sink, rest.ankle - 0.02 - P[`${s}Foot`][k].y, -P[`${s}ToeBase`][k].y - 0.02);
    }
  }
  // both feet off the floor: the longest stretch
  let air = 0;
  let run = 0;
  for (let k = 0; k < n * 2; k++) {
    const i = k % n;
    run = !down("Left", i) && !down("Right", i) ? run + 1 : 0;
    air = Math.max(air, Math.min(run, n) * dt);
  }
  // knees: the shin swung forward of the thigh's line (bending backwards), in degrees
  let knee = 0;
  for (const s of ["Left", "Right"] as const) {
    for (let k = 0; k < n; k++) {
      const thigh = P[`${s}Leg`][k].clone().sub(P.Hips[k]);
      const shin = P[`${s}Foot`][k].clone().sub(P[`${s}Leg`][k]);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(Q.Hips[k]);
      const axis = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      // (the leg's bend about its own side axis: forward of straight is backwards for a knee)
      const t = thigh.clone().projectOnPlane(axis).normalize();
      const h = shin.clone().projectOnPlane(axis).normalize();
      if (t.lengthSq() < 0.5 || h.lengthSq() < 0.5) continue;
      const signed = Math.atan2(new THREE.Vector3().crossVectors(t, h).dot(axis), t.dot(h)) * (180 / Math.PI);
      knee = Math.max(knee, signed);
    }
  }
  // hands inside her: deeper than her torso's and head's rough size (when her shape isn't measured)
  let hand = inside ?? 0;
  const seg = new THREE.Line3();
  const near = new THREE.Vector3();
  for (let k = 0; inside === null && k < n; k++) {
    seg.set(P.Hips[k], P.Spine2[k]);
    const head = P.Head[k].clone().add(new THREE.Vector3(0, 0.08, 0));
    for (const s of ["Left", "Right"] as const) {
      const p = P[`${s}Hand`][k];
      seg.closestPointToPoint(p, true, near);
      hand = Math.max(hand, 0.07 - p.distanceTo(near), 0.06 - p.distanceTo(head));
    }
  }
  // on one foot (the other well up), her hips far off it: the longest stretch
  let tilt = 0;
  run = 0;
  for (let k = 0; k < n * 2; k++) {
    const i = k % n;
    const l = down("Left", i);
    const r = down("Right", i);
    const up = (s: "Left" | "Right") => P[`${s}Foot`][i].y - rest.ankle > 0.12;
    let off = false;
    if (l && !r && up("Right")) off = Math.hypot(P.Hips[i].x - P.LeftFoot[i].x, P.Hips[i].z - P.LeftFoot[i].z) > 0.32;
    if (r && !l && up("Left")) off = Math.hypot(P.Hips[i].x - P.RightFoot[i].x, P.Hips[i].z - P.RightFoot[i].z) > 0.32;
    run = off ? run + 1 : 0;
    tilt = Math.max(tilt, Math.min(run, n) * dt);
  }
  // jerk: each joint's turning speed from frame to frame, how fast that changes
  const jerks: number[] = [];
  let seam = 0;
  for (const s of turned) {
    const q = Q[s];
    const w: number[] = [];
    for (let k = 0; k < n; k++) w.push(q[k].angleTo(q[k + 1]) / dt);
    for (let k = 0; k + 1 < n; k++) jerks.push(Math.abs(w[k + 1] - w[k]) / dt);
    // the seam: from the last frame to the first (q[n] is frame 0 again) against the steps on either
    // side of it (a seam that carries on as it was moving is no seam) or the joint's usual step
    const steps = w.slice(0, n - 1).map((x) => x * dt).sort((a, b) => a - b);
    const usual = Math.max(steps[steps.length >> 1], w[n - 2] * dt, w[0] * dt, 0.004);
    seam = Math.max(seam, (w[n - 1] * dt) / usual);
  }
  jerks.sort((a, b) => a - b);
  const jerk = jerks[Math.floor(jerks.length * 0.998)] ?? 0;
  return { skate, sink, air, knee, hand, tilt, jerk, seam };
}

/**
 * The limits: real dancers' motion stays inside them. Skating is each dance's own: as much as the real
 * dancer's capture over that stretch (tests/support/captured.ts), 0.1 more (where her toe counts as on
 * the floor isn't quite where the dancer's did: her feet aren't the dancer's, in boots or in heels), and
 * never under 0.15.
 */
export const LIMITS: MotionFacts = { skate: 0.15, sink: 0.04, air: 0.35, knee: 12, hand: 0.03, tilt: 0.6, jerk: 900, seam: 8 };
