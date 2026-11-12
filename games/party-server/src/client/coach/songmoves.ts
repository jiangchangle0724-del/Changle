// The songs' own dances as the coach dances them (src/shared/songmoves.ts names them): 江南Style's
// horse dance, Macarena's 16 counts, 科目三's ankle rolls and twirling hands, 最炫民族风's square
// dance, 爱你's sweet steps, APT.'s hand stack. Written like the library's (moves.ts): a loop of key
// frames on the beat, `p` the beat position in the move's 8-count (0 is count 1).
//
// Sides are the players': R is their right, the screen's right (+x); the coach is their mirror.
import { AKIMBO, APART, CLAP, P, TAU, UP, both, countAt as at, ease, elbows, feet, footOf, hand, palms, type MoveAnim } from "./kit";
import { BASE, keys, type Foot, type Part, type Pose, type V3 } from "./pose";

const S: Record<string, MoveAnim> = {};

// ---------- 江南Style: the horse dance

/** wide and low, as if on a horse */
const SADDLE: Part = { fR: { x: 0.23, yaw: 0.3 }, fL: { x: -0.23, yaw: -0.3 }, py: -0.08, cPitch: 0.05 };
/** the reins: wrists crossed in front of the chest, right over left, fists */
const REINS: Part = { hR: [-0.035, -0.07, 0.4], hL: [0.035, -0.1, 0.38], pR: [0, -0.7, 0.7], pL: [0, -0.7, 0.7], eR: [0.8, -0.5, -0.2], eL: [-0.8, -0.5, -0.2] };
/** which foot gallops on each count: R L R R, L R L L */
const GALLOP = [1, -1, 1, 1, -1, 1, -1, -1] as const;
/** the gallop: the next count's foot comes up after the half beat and lands on its beat, the body hopping with it */
function gallop(p: number, o: Pose) {
  const { i, f } = at(p);
  const side = GALLOP[(i + 1) % 8]!;
  const up = f > 0.4 ? Math.sin((Math.PI * (f - 0.4)) / 0.6) : 0;
  const foot = footOf(o, side);
  foot.lift += 0.09 * up;
  foot.z += 0.03 * up;
  foot.pitch -= 0.2 * up;
  o.py += 0.025 * up;
  o.px += 0.02 * side * up;
  o.cYaw += 0.06 * side * up;
}

S["horse-ride"] = {
  len: 8,
  groove: 0.9,
  // the reins pumped down on every beat
  pose: keys(BASE, 1, [
    [0, P(SADDLE, REINS, { hR: [-0.035, -0.13, 0.39], hL: [0.035, -0.16, 0.37] }), "hit"],
    [0.5, P(SADDLE, REINS)],
  ]),
  extra: gallop,
};

S["horse-lasso"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 1, [[0, P(SADDLE, { hL: [0.06, -0.1, 0.27], pL: [0, -1, 0.2], eL: [-1, -0.1, 0], eR: [1, 0.5, 0], pR: [0, -1, 0.2], hYaw: 0.08, hPitch: -0.06 })]]),
  extra: (p, o) => {
    gallop(p, o);
    // the right hand circles over the head, once a count
    const a = TAU * p;
    o.hR = [0.13 + 0.1 * Math.cos(a), 0.52, 0.07 + 0.1 * Math.sin(a)];
  },
};

/**
 * "Eh~ Sexy Lady": hands on the hips, the hips popped out to one side on the beat, the other knee
 * bending in, the chin up and the head tipping away (the riding hall and the subway in the video).
 */
const shake = (side: 1 | -1): Part =>
  P(AKIMBO, feet(0.22), { py: -0.06, px: 0.13 * side, roll: 0.16 * side, cRoll: -0.1 * side, hRoll: 0.09 * side, hPitch: -0.15 }, side > 0 ? { fL: { x: -0.17, yaw: 0.4, pitch: -0.45, lift: 0.025 } } : { fR: { x: 0.17, yaw: -0.4, pitch: -0.45, lift: 0.025 } });
S["sexy-lady"] = {
  len: 8,
  groove: 0.4,
  pose: keys(BASE, 2, [
    [0, shake(1), "hit"],
    [1, shake(-1), "hit"],
  ]),
};

/** wide and low, as if half sitting on the bus's seat */
const DISCO: Part = { fR: { x: 0.28, yaw: 0.4 }, fL: { x: -0.28, yaw: -0.4 }, py: -0.12, cPitch: 0.04 };
/** the left arm up and out on the diagonal, pointing; the right hand down by the right knee, pointing at the floor */
const pointUp = (jab: number): Part =>
  P(DISCO, hand(-1, [0.5 + 0.04 * jab, 0.36 + 0.06 * jab, 0.16], [0, 0.3, 1], [1, 0.2, -0.3]), hand(1, [0.34, -0.5, 0.3], [-0.4, -0.6, 0.7], [0.8, -0.1, -0.5]), { cRoll: -0.08, cYaw: 0.07, hYaw: -0.1, hPitch: -0.08 });
/** both arms up in a V, swaying to one side */
const discoV = (side: 1 | -1): Part => P(DISCO, both(0.36, 0.5, 0.12), palms(0, 0.2, 1), elbows(1, 0.3, -0.3), { py: -0.07, px: 0.05 * side, roll: -0.05 * side, cRoll: -0.04 * side });
S["disco-point"] = {
  len: 8,
  groove: 0.9,
  pose: keys(BASE, 8, [
    // 1-4: point up and down, the up hand jabbing on every beat
    [0, pointUp(1), "hit"],
    [0.5, pointUp(0)],
    [1, pointUp(1), "hit"],
    [1.5, pointUp(0)],
    [2, pointUp(1), "hit"],
    [2.5, pointUp(0)],
    [3, pointUp(1), "hit"],
    [3.6, pointUp(0)],
    // 5-8: both arms up, swaying
    [4, discoV(1)],
    [5, discoV(-1)],
    [6, discoV(1)],
    [7, discoV(-1)],
  ]),
};

/** the right palm flat on the chest */
const HAND_ON_CHEST: Part = hand(1, [-0.03, -0.09, 0.17], [0, 0.2, -1], [1, -0.5, 0.1]);
/** a step to one side (count 1 or 3), then the other foot tapping in by it (2 or 4), the shoulders swinging that way */
const strut = (side: 1 | -1, tap: boolean): Part => {
  // (on the step both feet are wide; on the tap the other foot is in by the first)
  const out: Foot = { x: 0.26 * side, z: 0, lift: 0, yaw: 0.2 * side, pitch: 0 };
  const other: Partial<Foot> = tap ? { x: 0.08 * side, lift: 0.02, pitch: -0.4 } : { x: -0.26 * side };
  const swing = hand(-1, [0.2, -0.45, side > 0 ? 0.17 : -0.05], [1, 0, 0.2], [0.5, -0.3, -1]);
  return P(HAND_ON_CHEST, swing, side > 0 ? { fR: out, fL: other } : { fL: out, fR: other }, { px: (tap ? 0.15 : 0.09) * side, roll: 0.03 * side, cRoll: (tap ? -0.07 : -0.03) * side, sR: tap && side > 0 ? [0.04, 0] : [0, 0], sL: tap && side < 0 ? [0.04, 0] : [0, 0], hPitch: tap ? -0.06 : -0.12 });
};
S["gangnam-strut"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, strut(1, false), "snap"],
    [1, strut(1, true), "hit"],
    [2, strut(-1, false), "snap"],
    [3, strut(-1, true), "hit"],
  ]),
};

/** little PSY's groove: fists at the chest, the knees bouncing, the hips pushed forward on 2 and 4 */
const PSY_FISTS: Part = P(both(0.11, -0.15, 0.23), palms(-0.3, -1, 0.3), elbows(1, -0.4, -0.2));
S["gangnam-bounce"] = {
  len: 8,
  groove: 0.9,
  pose: keys(BASE, 2, [
    [0, P(feet(0.17), PSY_FISTS), "hit"],
    [1, P(feet(0.17), PSY_FISTS, both(0.12, -0.26, 0.25), { py: -0.03, pz: 0.08, pitch: -0.14, cPitch: 0.08, hPitch: 0.06, sR: [0.03, 0], sL: [0.03, 0] }), "hit"],
  ]),
};

const swayAt = (side: 1 | -1): Part => P(feet(0.18), { px: 0.05 * side, roll: -0.04 * side, cRoll: -0.05 * side, hR: [0.18, -0.2, 0.26], hL: [-0.18, -0.2, 0.26], pR: [-0.6, 0, 0.6], pL: [0.6, 0, 0.6], eR: [0.7, -0.7, -0.3], eL: [-0.7, -0.7, -0.3] });
/** "hey!": an arm straight out forward and up, the other hand on the hip */
const hey = (side: 1 | -1): Part => P(feet(0.18), hand(side, [0.42, 0.22, 0.42], [0, -0.3, 1], [1, 0, -0.3]), hand(-side as 1 | -1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { px: 0.04 * side, cYaw: -0.1 * side, hPitch: -0.12 });
S["hey-point"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 8, [
    [0, swayAt(1)],
    [1, swayAt(-1)],
    [2, swayAt(1)],
    [3, hey(1), "hit"],
    [3.6, hey(1)],
    [4, swayAt(-1)],
    [5, swayAt(1)],
    [6, swayAt(-1)],
    [7, hey(-1), "hit"],
    [7.6, hey(-1)],
  ]),
};

const FINAL: Part = { fR: { x: 0.44, z: 0.06, lift: 0.13, pitch: -0.35, yaw: 0.35 }, fL: { x: -0.06 }, px: -0.08, roll: 0.13, cRoll: 0.08, hR: [0.48, 0.36, 0.16], pR: [0, 0, 1], eR: [1, 0, -0.3], hL: [-0.215, -0.4, -0.01], pL: [1, 0, -0.3], eL: [-1, 0, -0.25], hYaw: 0.12, hRoll: 0.12 };
S["gangnam-pose"] = {
  len: 8,
  groove: 0.15,
  pose: keys(BASE, 8, [
    [0, FINAL, "snap"],
    [7.9, FINAL],
  ]),
};

// ---------- Macarena: 16 counts, arms then hips

const FWD = (side: 1 | -1, up: boolean): Part => hand(side, [0.3, -0.04, 0.5], [0, up ? 1 : -1, 0.1], [1, -0.2, -0.4]);
const SIDE_DOWN = (side: 1 | -1): Part => hand(side, [0.23, -0.5, 0.06], [-1, 0, 0.2], [0.5, -0.3, -1]);
const SHOULDER = (side: 1 | -1): Part => hand(side, [-0.15, -0.02, 0.11], [-0.5, 0, -1], [0.7, -0.6, 0.3]);
const HEAD = (side: 1 | -1): Part => hand(side, [0.07, 0.27, -0.05], [-0.4, 0, -1], [1, 0.5, 0.2]);
const HIP_FRONT = (side: 1 | -1): Part => hand(side, [-0.1, -0.4, 0.17], [-0.3, 0, -1], [0.8, -0.3, 0.2]);
const POCKET = (side: 1 | -1): Part => hand(side, [0.17, -0.44, -0.13], [0, 0, -1], [1, -0.1, -0.3]);
S["macarena-arms"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(feet(0.13), FWD(1, false), SIDE_DOWN(-1)), "snap"],
    [1, P(feet(0.13), FWD(1, false), FWD(-1, false)), "snap"],
    [2, P(feet(0.13), FWD(1, true), FWD(-1, false)), "snap"],
    [3, P(feet(0.13), FWD(1, true), FWD(-1, true)), "snap"],
    [4, P(feet(0.13), SHOULDER(1), FWD(-1, true)), "snap"],
    [5, P(feet(0.13), SHOULDER(1), SHOULDER(-1)), "snap"],
    [6, P(feet(0.13), HEAD(1), SHOULDER(-1)), "snap"],
    [7, P(feet(0.13), HEAD(1), HEAD(-1)), "snap"],
  ]),
};

const POCKETS = P(feet(0.13), POCKET(1), POCKET(-1));
S["macarena-hips"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0, P(feet(0.13), HIP_FRONT(1), HEAD(-1)), "snap"],
    [1, P(feet(0.13), HIP_FRONT(1), HIP_FRONT(-1)), "snap"],
    [2, P(feet(0.13), POCKET(1), HIP_FRONT(-1)), "snap"],
    [3, P(feet(0.13), POCKET(1), POCKET(-1)), "snap"],
    [4, POCKETS],
    [6.5, POCKETS],
    // 8: jump, a quarter turn to the left, and clap (hey!)
    [7, P(CLAP, { fR: { x: 0.13, lift: 0.1 }, fL: { x: -0.13, lift: 0.1 }, py: 0.07, turn: -Math.PI / 2 }), "snap"],
    [7.7, P(CLAP, { turn: -Math.PI / 2 })],
  ]),
  extra: (p, o) => {
    // 5, 6, 7: the hips roll round, once a count
    const { q } = at(p);
    if (q < 4 || q >= 7) return;
    const a = TAU * (q - 4);
    o.px += 0.06 * Math.sin(a);
    o.pz += 0.05 * Math.cos(a) - 0.05;
    o.roll -= 0.05 * Math.sin(a);
  },
};

// ---------- 科目三 (一笑江湖): ankle rolls (拐) and twirling hands (花手)

/** 拐: a foot tips onto its outer edge and the knee follows it out (no weight on it) */
const guai = (side: 1 | -1): Part => (side > 0 ? { fR: { x: 0.22, yaw: 1.3, lift: 0.045, pitch: -0.2 }, px: -0.045, roll: 0.045, py: -0.03 } : { fL: { x: -0.22, yaw: -1.3, lift: 0.045, pitch: -0.2 }, px: 0.045, roll: -0.045, py: -0.03 });
/** the free foot crosses in front of the other, tipped out */
const crossGuai = (side: 1 | -1): Part => (side > 0 ? { fR: { x: -0.04, z: 0.15, yaw: 0.9, lift: 0.035 }, px: -0.02 } : { fL: { x: 0.04, z: 0.15, yaw: -0.9, lift: 0.035 }, px: 0.02 });
const LOOSE: Part = P(both(0.28, -0.38, 0.12), palms(-0.6, 0, 0.6), elbows(0.6, -0.3, -0.8));
const OPEN: Part = P(both(0.62, -0.02, 0.06), palms(0, -1, 0.2), elbows(0.2, -1, -0.3));
const X_ARMS: Part = { hR: [-0.07, -0.1, 0.28], hL: [0.07, -0.08, 0.26], pR: [0, 0, 1], pL: [0, 0, 1], eR: [0.8, -0.6, -0.2], eL: [-0.8, -0.6, -0.2] };
const X_OPEN: Part = P(both(0.43, -0.08, 0.16), palms(0, 0, 1), elbows(1, -0.4, -0.3));
/** 花手: the hands flip palm down, palm up, twice a beat */
function twirl(p: number, o: Pose, k = 1) {
  const c = Math.cos(2 * TAU * p);
  o.pR = [o.pR[0], -k * c, Math.abs(o.pR[2]) + 0.3];
  o.pL = [o.pL[0], -k * c, Math.abs(o.pL[2]) + 0.3];
}

const FIST_PALM: Part = { hR: [0.01, -0.12, 0.27], hL: [-0.012, -0.13, 0.29], pR: [-1, 0, 0.3], pL: [1, 0, 0.3], eR: [0.8, -0.6, -0.2], eL: [-0.8, -0.6, -0.2], fR: { x: 0.09 }, fL: { x: -0.09 } };
const BOWED: Part = P(FIST_PALM, { pitch: 0.36, cPitch: 0.2, hPitch: 0.26, pz: -0.04 });
S["kms-bow"] = {
  len: 8,
  groove: 0.15,
  pose: keys(BASE, 8, [
    [0, FIST_PALM],
    [1, FIST_PALM],
    [3, BOWED],
    [4.5, BOWED],
    [6.5, FIST_PALM],
  ]),
};

const swing = (side: 1 | -1): Part => P(hand(side, [0.36, -0.1, 0.2], [0.3, -1, 0.3], [1, -0.5, -0.4]), hand(-side as 1 | -1, [-0.1, -0.12, 0.3], [-0.3, -1, 0.3], [0.4, -0.8, -0.4]), { cYaw: 0.15 * side, hYaw: 0.1 * side });
S["kms-swing"] = {
  len: 4,
  groove: 0.8,
  pose: keys(BASE, 4, [
    [0, P(swing(1), guai(1)), "hit"],
    [1, swing(1)],
    [2, P(swing(-1), guai(-1)), "hit"],
    [3, swing(-1)],
  ]),
  extra: (p, o) => twirl(p, o, 0.8),
};

const THROW: Part = P({ hR: [0.58, 0.02, 0.22], hL: [0.3, -0.03, 0.36], pR: [1, 0, 0.3], pL: [1, 0, 0.3], eR: [1, -0.4, -0.3], eL: [0.2, -0.8, -0.3], cYaw: 0.2, hYaw: 0.18 }, guai(1));
S["kms-roll-throw"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [
    [0, P(feet(0.14), APART)],
    [3.8, P(feet(0.14), APART)],
    [4, THROW, "hit"],
    [6, THROW],
    [7.4, P(feet(0.14), APART)],
  ]),
  extra: (p, o) => {
    // 1-4: the hands roll round each other in front of the chest, twice
    const { q } = at(p);
    if (q >= 4) return;
    const a = (TAU * q) / 2;
    const r = 0.075;
    o.hR = [0.05, -0.15 + r * Math.sin(a), 0.28 + r * Math.cos(a)];
    o.hL = [-0.05, -0.15 + r * Math.sin(a + Math.PI), 0.28 + r * Math.cos(a + Math.PI)];
    o.pR = [-0.6, -0.6, 0.6];
    o.pL = [0.6, -0.6, 0.6];
  },
};

S["kms-guai"] = {
  len: 4,
  groove: 0.9,
  pose: keys(BASE, 4, [
    [0, P(LOOSE, guai(1), { cYaw: -0.08 }), "hit"],
    [1, LOOSE],
    [2, P(LOOSE, guai(-1), { cYaw: 0.08 }), "hit"],
    [3, LOOSE],
  ]),
};

const UP_HIGH: Part = P(UP, { hR: [0.2, 0.52, 0.12], hL: [-0.2, 0.52, 0.12] });
S["kms-open-up"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 8, [
    [0, P(OPEN, guai(1)), "hit"],
    [1, OPEN],
    [2, P(OPEN, guai(-1)), "hit"],
    [3, OPEN],
    [4, P(UP_HIGH, crossGuai(1)), "hit"],
    [5, UP_HIGH],
    [6, P(UP_HIGH, crossGuai(-1)), "hit"],
    [7, UP_HIGH],
  ]),
  extra: (p, o) => {
    if (at(p).q >= 4) twirl(p, o);
  },
};

S["kms-open-guai"] = {
  len: 4,
  groove: 0.9,
  pose: keys(BASE, 4, [
    [0, P(OPEN, guai(1)), "hit"],
    [1, OPEN],
    [2, P(OPEN, guai(-1)), "hit"],
    [3, OPEN],
  ]),
};

S["kms-cross"] = {
  len: 4,
  groove: 0.8,
  pose: keys(BASE, 4, [
    [0, P(X_ARMS, guai(1)), "hit"],
    [1, X_OPEN, "snap"],
    [2, P(X_ARMS, guai(-1)), "hit"],
    [3, X_OPEN, "snap"],
  ]),
};

/** 销手: a hand sweeps down from high on its side across the body */
const sweepFrom = (side: 1 | -1): Part => P(hand(side, [0.45, 0.36, 0.15], [0.3, -1, 0.3], [1, 0.2, -0.3]), hand(-side as 1 | -1, [0.28, -0.38, 0.12], [-0.6, 0, 0.6], [0.6, -0.3, -0.8]));
const sweepTo = (side: 1 | -1): Part => P(hand(side, [-0.1, -0.4, 0.22], [-0.3, -1, 0.3], [0.8, -0.3, -0.3]), hand(-side as 1 | -1, [0.28, -0.38, 0.12], [-0.6, 0, 0.6], [0.6, -0.3, -0.8]), { cYaw: -0.12 * side });
S["kms-xiao"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [
    [0, X_ARMS, "hit"],
    [1, X_OPEN, "snap"],
    [2, X_ARMS, "hit"],
    [3, X_OPEN, "snap"],
    [4, P(sweepFrom(1), guai(1)), "snap"],
    [5, sweepTo(1), "hit"],
    [6, P(sweepFrom(-1), guai(-1)), "snap"],
    [7, sweepTo(-1), "hit"],
  ]),
};

S["kms-slow-xiao"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(sweepFrom(1), guai(-1)), "snap"],
    [3.6, P(sweepTo(1), guai(-1)), "smooth"],
    [4, P(sweepFrom(-1), guai(1)), "snap"],
    [7.6, P(sweepTo(-1), guai(1)), "smooth"],
  ]),
};

// ---------- 最炫民族风: the square dance

const FISTS: Part = { hR: [0.2, -0.16, 0.24], hL: [-0.2, -0.16, 0.24], pR: [-1, 0, 0.2], pL: [1, 0, 0.2], eR: [0.6, -1, -0.2], eL: [-0.6, -1, -0.2] };
const swingTo = (side: 1 | -1): Part => P(feet(0.2), hand(side, [0.34, -0.15, 0.16], [-1, 0, 0.2], [0.6, -1, -0.2]), hand(-side as 1 | -1, [-0.04, -0.15, 0.3], [-1, 0, 0.2], [0.6, -1, -0.2]), { px: 0.06 * side, cYaw: 0.2 * side, hYaw: 0.15 * side });
S["zx-swing"] = {
  len: 4,
  groove: 0.8,
  pose: keys(BASE, 4, [
    [0, swingTo(-1), "snap"],
    [2, swingTo(1), "snap"],
  ]),
};

const ARMS_UP: Part = P(both(0.16, 0.6, 0.05), palms(0, 0, 1), elbows(1, 0, -0.2), { hPitch: -0.15 });
const stepOut = (side: 1 | -1): Part => (side > 0 ? { fR: { x: 0.32 }, px: 0.08 } : { fL: { x: -0.32 }, px: -0.08 });
S["zx-raise"] = {
  len: 4,
  groove: 0.7,
  pose: keys(BASE, 4, [
    [0, P(ARMS_UP, stepOut(1)), "hit"],
    [1, FISTS, "snap"],
    [2, P(ARMS_UP, stepOut(-1)), "hit"],
    [3, FISTS, "snap"],
  ]),
};

const PUSH: Part = P(both(0.27, -0.04, 0.48), palms(0, -1, 0.2), elbows(0.9, -0.4, -0.3));
S["zx-push-walk"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [
    // 1-3: forward right, left, right, pushing; 4: together. 5-7: back left, right, left; 8: together
    [0, P(PUSH, { fR: { z: 0.15 }, pz: 0.07 }), "hit"],
    [1, P(FISTS, { fR: { z: 0.15 }, fL: { z: 0.3 }, pz: 0.15 })],
    [2, P(PUSH, { fR: { z: 0.45 }, fL: { z: 0.3 }, pz: 0.23 }), "hit"],
    [3, P(FISTS, { fR: { z: 0.45 }, fL: { z: 0.45 }, pz: 0.3 })],
    [4, P(PUSH, { fR: { z: 0.45 }, fL: { z: 0.3 }, pz: 0.23 }), "hit"],
    [5, P(FISTS, { fR: { z: 0.15 }, fL: { z: 0.3 }, pz: 0.15 })],
    [6, P(PUSH, { fR: { z: 0.15 }, fL: { z: 0 }, pz: 0.07 }), "hit"],
    [7, FISTS],
  ]),
};

/** the oath: a fist up by the temple, the elbow out at shoulder height, the other hand on the hip */
const oath = (side: 1 | -1): Part => P(stepOut(side), hand(side, [0.21, 0.2, 0.05], [-1, 0, 0.3], [1, 0, 0]), hand(-side as 1 | -1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { hPitch: -0.12 });
S["zx-oath"] = {
  len: 4,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, oath(1), "hit"],
    [1, FISTS, "snap"],
    [2, oath(-1), "hit"],
    [3, FISTS, "snap"],
  ]),
};

const ARMS_SIDE: Part = P(both(0.6, -0.02, 0.06), palms(0, -0.3, 1), elbows(0.2, -1, -0.3));
const clapOver = (side: 1 | -1): Part => ({ hR: [0.18 * side + 0.03, 0.12, 0.2], hL: [0.18 * side - 0.03, 0.12, 0.2], pR: [-1, 0, 0], pL: [1, 0, 0], eR: [0.8, -0.4, -0.3], eL: [-0.8, -0.4, -0.3], cRoll: -0.06 * side });
S["zx-travel-clap"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 8, [
    // 1-4: step together to the left twice, a clap on 4; 5-8: a hop and a clap over each shoulder, back
    [0, P(ARMS_SIDE, { fL: { x: -0.36 }, fR: { x: 0.12 }, px: -0.1 }), "snap"],
    [1, P(ARMS_SIDE, { fL: { x: -0.36 }, fR: { x: -0.14 }, px: -0.25 }), "snap"],
    [2, P(ARMS_SIDE, { fL: { x: -0.6 }, fR: { x: -0.14 }, px: -0.37 }), "snap"],
    [3, P(CLAP, { fL: { x: -0.6 }, fR: { x: -0.38 }, px: -0.49 }), "hit"],
    [4, P(clapOver(1), { fR: { x: -0.14, lift: 0.04 }, fL: { x: -0.4 }, px: -0.3, py: 0.03 }), "hit"],
    [5, P(ARMS_SIDE, { fR: { x: -0.14 }, fL: { x: -0.34 }, px: -0.24 })],
    [6, P(clapOver(-1), { fL: { x: -0.12, lift: 0.04 }, fR: { x: 0.12 }, px: 0, py: 0.03 }), "hit"],
    [7, P(ARMS_SIDE, feet(0.12))],
  ]),
};

const CUPPED: V3 = [0, 1, 0.2];
const CUP_CHEST: Part = { hR: [0.05, -0.15, 0.26], hL: [-0.05, -0.15, 0.26], pR: CUPPED, pL: CUPPED, eR: [0.7, -0.7, -0.3], eL: [-0.7, -0.7, -0.3] };
const offer = (side: 1 | -1): Part => P({ hR: [0.16 * side + 0.05, 0.2, 0.46], hL: [0.16 * side - 0.05, 0.18, 0.46], pR: CUPPED, pL: CUPPED, eR: [0.6, -0.8, -0.2], eL: [-0.6, -0.8, -0.2], pz: 0.06, px: 0.05 * side, pitch: 0.06, cPitch: 0.08, hRoll: -0.1 * side, hYaw: 0.1 * side, hPitch: -0.1 }, side > 0 ? { fR: { x: 0.26, z: 0.24, yaw: 0.35 } } : { fL: { x: -0.26, z: 0.24, yaw: -0.35 } });
S["zx-flower"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0, P(CUP_CHEST, side(1))],
    [1, offer(1), "snap"],
    [2, CUP_CHEST],
    [3, CUP_CHEST],
    [4, P(CUP_CHEST, side(-1))],
    [5, offer(-1), "snap"],
    [6, CUP_CHEST],
    [7, CUP_CHEST],
  ]),
};
function side(s: 1 | -1): Part {
  return s > 0 ? { fR: { x: 0.26, z: 0.24, yaw: 0.35 }, px: 0.04, pz: 0.04 } : { fL: { x: -0.26, z: 0.24, yaw: -0.35 }, px: -0.04, pz: 0.04 };
}

const REACH: Part = P(both(0.17, -0.02, 0.56), palms(0, 1, 0.2), elbows(1, -0.3, -0.3), { cPitch: -0.04 });
const PULL: Part = P(both(0.2, -0.32, -0.06), palms(-1, 0, 0), elbows(0.6, -0.2, -1));
S["zx-reach-pull"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(REACH, { fR: { z: 0.28 }, pz: 0.08 }), "snap"],
    [1, P(REACH, { fR: { z: 0.28 }, pz: 0.08 })],
    [2, PULL, "hit"],
    [3, PULL],
    [4, P(REACH, { fL: { z: 0.28 }, pz: 0.08 }), "snap"],
    [5, P(REACH, { fL: { z: 0.28 }, pz: 0.08 })],
    [6, PULL, "hit"],
    [7, PULL],
  ]),
};

const vUp = (s: 1 | -1): Part => P({ hR: [0.36 + 0.06 * s, 0.48, 0.1], hL: [-0.36 + 0.06 * s, 0.48, 0.1], pR: [0, 0, 1], pL: [0, 0, 1], eR: [1, 0, -0.3], eL: [-1, 0, -0.3], cRoll: -0.08 * s, roll: -0.03 * s, hPitch: -0.12 });
S["zx-wave-high"] = {
  len: 4,
  groove: 0.8,
  pose: keys(BASE, 4, [
    [0, P(vUp(1), { fR: { x: 0.34 }, px: 0.09 }), "snap"],
    [1, P(vUp(1), { fR: { x: 0.34 }, fL: { x: 0.14 }, px: 0.2 }), "snap"],
    [2, P(vUp(-1), { fR: { x: 0.14 }, fL: { x: -0.08 }, px: 0.03 }), "snap"],
    [3, P(vUp(-1), feet(0.12)), "snap"],
  ]),
  extra: (p, o) => {
    // a flick of the wrists on each count
    const flick = Math.cos(TAU * p);
    o.pR = [0.3 * flick, -0.2, 1];
    o.pL = [0.3 * flick, -0.2, 1];
  },
};

const ZX_POSE: Part = { hR: [0.12, 0.62, 0.05], pR: [-0.3, 0, 1], eR: [1, 0, -0.2], hL: [-0.17, -0.02, 0.56], pL: [0, -1, 0.2], eL: [-1, -0.2, -0.4], fR: { x: 0.12, z: 0.26, pitch: -0.5, lift: 0.02 }, fL: { x: -0.1 }, px: -0.04, hPitch: -0.12 };
S["zx-pose"] = {
  len: 8,
  groove: 0.15,
  pose: keys(BASE, 8, [
    [0, ZX_POSE, "snap"],
    [7.9, ZX_POSE],
  ]),
};

// ---------- 爱你: arms out like wings, kicking the shuttlecock, the sweet tap

const WINGS: Part = P(both(0.42, -0.33, 0.1), palms(0, -1, 0.25), elbows(1, -0.2, -0.5));
S["aini-wings"] = {
  len: 4,
  groove: 1,
  pose: keys(BASE, 4, [
    [0, P(WINGS, feet(0.15), { px: 0.04, roll: -0.03, hRoll: -0.07 })],
    [2, P(WINGS, feet(0.15), { px: -0.04, roll: 0.03, hRoll: 0.07 })],
  ]),
  extra: (p, o) => {
    const flick = 0.35 * Math.cos(TAU * p);
    o.pR = [0, -1, 0.25 + flick];
    o.pL = [0, -1, 0.25 + flick];
  },
};

/** 踢毽子: a foot comes up on the inside, in front of the other knee, sole up */
const kick = (s: 1 | -1): Part => (s > 0 ? { fR: { x: 0.01, z: 0.12, lift: 0.24, yaw: 1.15, pitch: 0.1 }, fL: { x: -0.1 }, px: -0.04 } : { fL: { x: -0.01, z: 0.12, lift: 0.24, yaw: -1.15, pitch: 0.1 }, fR: { x: 0.1 }, px: 0.04 });
S["aini-jianzi"] = {
  len: 2,
  groove: 0.7,
  pose: keys(BASE, 2, [
    [0, P(WINGS, kick(1), { hPitch: 0.08 }), "snap"],
    [0.55, P(WINGS, feet(0.12))],
    [1, P(WINGS, kick(-1), { hPitch: 0.08 }), "snap"],
    [1.55, P(WINGS, feet(0.12))],
  ]),
};

S["aini-skip-turn"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [
    // 1-4: a skipping turn, the left hand on the waist, the right drawing a half circle over the head
    [0, P(hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { hR: [0.42, 0.1, 0.12], pR: [0, -0.3, 1], eR: [1, 0, -0.3] })],
    [2, P(hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { hR: [0.1, 0.56, 0.08], pR: [-0.3, 0, 1], eR: [1, 0.2, -0.2] })],
    [3.6, P(hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { hR: [-0.2, 0.42, 0.12], pR: [-0.6, 0, 1], eR: [1, 0.2, -0.2] })],
    // 5-8: both hands on the waist, a twist each count
    [4, P(AKIMBO, feet(0.14), { yaw: 0.22, cYaw: 0.08 }), "snap"],
    [5, P(AKIMBO, feet(0.14), { yaw: -0.22, cYaw: -0.08 }), "snap"],
    [6, P(AKIMBO, feet(0.14), { yaw: 0.22, cYaw: 0.08 }), "snap"],
    [7, P(AKIMBO, feet(0.14), { yaw: -0.22, cYaw: -0.08 }), "snap"],
  ]),
  extra: (p, o) => {
    const { q, f } = at(p);
    if (q >= 4) return;
    o.turn = TAU * ease(q / 4);
    // a skip on each count
    const up = Math.sin(Math.PI * f);
    const foot = Math.floor(q) % 2 === 0 ? o.fR : o.fL;
    foot.lift += 0.1 * up;
    o.py += 0.02 * up;
  },
};

const HEART: Part = { hR: [0.04, 0.1, 0.24], hL: [-0.04, 0.1, 0.24], pR: [-0.6, 0, 0.8], pL: [0.6, 0, 0.8], eR: [0.7, -0.6, 0], eL: [-0.7, -0.6, 0] };
S["aini-heart"] = {
  len: 4,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, P(HEART, feet(0.13), { px: 0.04, roll: -0.04, hRoll: -0.16, cRoll: -0.05 }), "snap"],
    [2, P(HEART, feet(0.13), { px: -0.04, roll: 0.04, hRoll: 0.16, cRoll: 0.05 }), "snap"],
  ]),
};

// ---------- APT.: the apartment game's hand stack, and the moves everyone does to the chorus

S["apt-stack"] = {
  len: 8,
  groove: 0.9,
  pose: keys(BASE, 1, [[0, P(feet(0.17), { pR: [0, -1, 0.3], pL: [0, -1, 0.3], eR: [1, -0.3, -0.2], eL: [-1, -0.3, -0.2] })]]),
  extra: (p, o) => {
    // a floor a count, the bottom fist to the top: right, left, right, left, right, left (up to the
    // chin); 7: hold, nodding; 8: both back down for the next round
    const { q } = at(p);
    const level = (k: number) => -0.3 + 0.07 * Math.max(-1, k);
    if (q >= 7) {
      const t = ease(q - 7);
      o.hR = [0.02, level(4) + (level(-1) - level(4)) * t, 0.3];
      o.hL = [-0.02, level(5) + (level(-1) - level(5)) * t, 0.3];
      return;
    }
    const n = Math.min(5, Math.floor(q));
    const t = q >= 6 ? 1 : Math.min(1, (q - Math.floor(q)) / 0.35);
    const moving = level(n - 2) + (level(n) - level(n - 2)) * ease(t);
    const still = level(n - 1);
    o.hR = [0.02, n % 2 === 0 ? moving : still, 0.3];
    o.hL = [-0.02, n % 2 === 0 ? still : moving, 0.3];
    if (q >= 6) o.hPitch += 0.12 * Math.sin(TAU * q);
  },
};

S["apt-drum"] = {
  len: 8,
  groove: 1,
  pose: keys(BASE, 8, [
    [0, P(feet(0.18), { hR: [0.13, -0.46, 0.16], hL: [-0.2, -0.3, 0.2], pR: [0, -1, 0], pL: [0, -1, 0] }), "hit"],
    [1, P(feet(0.18), { hR: [0.2, -0.3, 0.2], hL: [-0.13, -0.46, 0.16], pR: [0, -1, 0], pL: [0, -1, 0] }), "hit"],
    [2, P(feet(0.18), { hR: [0.13, -0.46, 0.16], hL: [-0.2, -0.3, 0.2], pR: [0, -1, 0], pL: [0, -1, 0] }), "hit"],
    [3, P(feet(0.18), { hR: [0.2, -0.3, 0.2], hL: [-0.13, -0.46, 0.16], pR: [0, -1, 0], pL: [0, -1, 0] }), "hit"],
    [4, P(feet(0.18), { hR: [0.13, -0.46, 0.16], hL: [-0.2, -0.3, 0.2], pR: [0, -1, 0], pL: [0, -1, 0] }), "hit"],
    [5, P(feet(0.18), { hR: [0.2, -0.3, 0.2], hL: [-0.13, -0.46, 0.16], pR: [0, -1, 0], pL: [0, -1, 0] }), "hit"],
    [6, P(feet(0.18), CLAP), "hit"],
    [7, P(feet(0.18), hand(1, [0.2, 0.5, 0.15], [0, 0, 1], [1, 0, -0.3]), hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25])), "hit"],
  ]),
};

/** one hand up, the other down, the body on a diagonal */
const upHand = (s: 1 | -1, facing: 1 | -1): Part => P(feet(0.22), hand(s, [0.2, 0.5, 0.15], [0, 0, 1], [1, 0, -0.3]), hand(-s as 1 | -1, [0.24, -0.34, 0.12], [-1, 0, 0.2], [0.6, -0.4, -0.8]), { yaw: 0.28 * facing, cPitch: -0.05 });
S["apt-rlr-clap"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 8, [
    [0, upHand(1, 1), "hit"],
    [1, upHand(-1, 1), "hit"],
    [2, upHand(1, 1), "hit"],
    [3, P(CLAP, feet(0.22), { yaw: 0.28, fL: { x: -0.22, lift: 0.08 } }), "hit"],
    [4, upHand(-1, -1), "hit"],
    [5, upHand(1, -1), "hit"],
    [6, upHand(-1, -1), "hit"],
    [7, P(CLAP, feet(0.22), { yaw: -0.28, fR: { x: 0.22, lift: 0.08 } }), "hit"],
  ]),
};

const climb = (k: number): Part => {
  const r = k % 2 === 0;
  const y = -0.25 + 0.17 * k;
  return P(r ? { fR: { x: 0.3 }, fL: { x: -0.06 }, px: 0.06 } : { fL: { x: -0.3 }, fR: { x: 0.06 }, px: -0.06 }, {
    hR: [0.1, r ? y : y - 0.17, 0.3],
    hL: [-0.1, r ? y - 0.17 : y, 0.3],
    pR: [0, 0, 1],
    pL: [0, 0, 1],
    eR: [1, -0.4, -0.2],
    eL: [-1, -0.4, -0.2],
    py: -0.05,
  });
};
const WIDE_OPEN: Part = P(both(0.62, 0.12, 0.1), palms(0, 0, 1), elbows(0.3, -1, -0.3), feet(0.16), { cPitch: -0.06, hPitch: -0.1 });
S["apt-climb"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [
    [0, climb(0), "snap"],
    [1, climb(1), "snap"],
    [2, climb(2), "snap"],
    [3, climb(3), "snap"],
    [4, WIDE_OPEN, "snap"],
    [5, P(WIDE_OPEN, { hPitch: 0.12 })],
    [6, WIDE_OPEN],
    [7, P(WIDE_OPEN, { hPitch: 0.12 })],
  ]),
};

const EARS: Part = { hR: [0.12, 0.13, 0.02], hL: [-0.12, 0.13, 0.02], pR: [-1, 0, 0], pL: [1, 0, 0], eR: [1, -0.5, 0], eL: [-1, -0.5, 0] };
S["apt-headphones"] = {
  len: 8,
  groove: 0.9,
  pose: keys(BASE, 8, [
    [0, P(hand(1, [0.55, 0, 0.2], [0, 0, 1], [1, -0.4, -0.3]), { fR: { x: 0.34 }, px: 0.08 }), "snap"],
    [1, P(feet(0.12), APART)],
    [2, P(hand(-1, [0.55, 0, 0.2], [0, 0, 1], [1, -0.4, -0.3]), { fL: { x: -0.34 }, px: -0.08 }), "snap"],
    [3, P(feet(0.12), APART)],
    [4, P(feet(0.15), { hR: [0.36, -0.06, 0.24], hL: [0.3, -0.06, 0.26], pR: [-1, 0, 0], pL: [1, 0, 0], cYaw: 0.2 }), "hit"],
    [5, P(EARS, feet(0.15)), "snap"],
    [6, P(EARS, feet(0.15), { px: 0.03 })],
    [7, P(EARS, feet(0.15), { px: -0.03 })],
  ]),
};

export const SONG_ANIMS: Record<string, MoveAnim> = S;
