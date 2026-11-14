/**
 * 跟着跳's moves for the dancer (shared/dj/dance.ts's DANCE_MOVES, the same ids), written as key
 * poses in the accounts' pose language (src/account/figure/pose: where the hands and feet go, which
 * way the body bends; README in site/scripts/figure/) and solved on the page for her body, the arms
 * kept out of it. A clip's time is in beats: `dur` beats long, looping, played from the speaker's
 * beat. Character space: metres for a figure with its eyes REF_EYE up (the solver scales them to
 * her), x her left, y up, z forward; "chest", "head" and "hips" frames move with those parts.
 */
import { over, type Clip } from "../../../account/figure/pose/anim";
import type { PoseSpec, V3 } from "../../../account/figure/pose/rig";
import { DANCE_MOVES } from "../../../shared/dj/dance";

type P = PoseSpec;

const at = (frame: string, p: V3) => ({ frame, p });
const ch = (p: V3) => at("char", p);
const cs = (p: V3) => at("chest", p);
const hd = (p: V3) => at("head", p);
const hp = (p: V3) => at("hips", p);
const dir = (frame: string, d: V3) => ({ frame, d });

/** standing easy, weight a little on one leg: where every standing move starts from */
export const BASE: P = {
  hips: { pos: [0.012, -0.02, 0], yaw: 0, pitch: 0, roll: -2 },
  spine: { bend: 1, side: 1, twist: 0 },
  head: { nod: 0, turn: 0, tilt: 2 },
  L: { clav: { up: 0, fwd: 0 }, hand: cs([0.235, -0.37, 0.0]), pole: dir("chest", [0.3, 0, -1]), orient: { frame: "chest", fingers: [0.08, -1, 0.06], palm: [-1, 0, 0.15] }, fingers: "relaxed" },
  R: { clav: { up: 0, fwd: 0 }, hand: cs([-0.235, -0.37, 0.0]), pole: dir("chest", [-0.3, 0, -1]), orient: { frame: "chest", fingers: [-0.08, -1, 0.06], palm: [1, 0, 0.15] }, fingers: "relaxed" },
  legL: { foot: ch([0.085, 0.126, -0.05]), pole: dir("hips", [0.1, 0, 1]), footYaw: 8 },
  legR: { foot: ch([-0.075, 0.126, -0.04]), pole: dir("hips", [-0.1, 0, 1]), footYaw: -10 },
};

/** how far behind where she stands the stool is (the moves' metres): she sits back onto it */
export const STOOL_BACK = 0.3;

/** sitting on the stool, upright, feet on the floor, hands on the thighs */
export const SIT: P = {
  hips: { pos: [0, -0.43, -STOOL_BACK], pitch: 0, roll: 0, yaw: 0 },
  spine: { bend: 4, side: 0, twist: 0 },
  head: { nod: 2, turn: 0, tilt: 0 },
  L: { hand: hp([0.13, 0.03, 0.22]), pole: dir("chest", [1, -0.2, -0.4]), orient: { frame: "hips", fingers: [0.05, -0.2, 1], palm: [0, -1, 0] }, fingers: "relaxed" },
  R: { hand: hp([-0.13, 0.03, 0.22]), pole: dir("chest", [-1, -0.2, -0.4]), orient: { frame: "hips", fingers: [-0.05, -0.2, 1], palm: [0, -1, 0] }, fingers: "relaxed" },
  legL: { foot: ch([0.13, 0.126, 0.13]), pole: dir("hips", [0.2, 0.3, 1]), footYaw: 6 },
  legR: { foot: ch([-0.13, 0.126, 0.13]), pole: dir("hips", [-0.2, 0.3, 1]), footYaw: -6 },
};

const stand = (p: P): P => over(BASE, p);
const sit = (p: P): P => over(SIT, p);

/** a beat's bounce: knees down on the beat (k: 0 up, 1 down) */
const down = (k: number, depth = 0.05): P => ({ hips: { pos: [0, -0.02 - depth * k, 0] } });

// ---------------------------------------------------------------- standing

// 慢摇 sway: the weight from one foot to the other over two beats, hips rolling, arms swinging easy
const sway = (s: number, mid: boolean): P =>
  stand({
    hips: { pos: [0.075 * s, mid ? -0.055 : -0.03, 0], roll: -8 * s, yaw: 6 * s },
    spine: { side: 7 * s, twist: -5 * s, bend: 2 },
    head: { tilt: 6 * s, nod: mid ? 5 : 0, turn: -4 * s },
    L: { hand: cs([0.23 - 0.05 * s, -0.33, 0.08 + 0.08 * s]), pole: dir("chest", [0.4, -0.2, -1]), fingers: "relaxed" },
    R: { hand: cs([-0.23 - 0.05 * s, -0.33, 0.08 - 0.08 * s]), pole: dir("chest", [-0.4, -0.2, -1]), fingers: "relaxed" },
    legL: { foot: ch([0.1, 0.126, -0.04]), footYaw: 10 },
    legR: { foot: ch([-0.1, 0.126, -0.04]), footYaw: -10 },
  });

// 快摇 bounce: knees down every beat, hands up high and shaking, head nodding
const bounce = (dn: boolean, s: number): P =>
  stand({
    ...down(dn ? 1 : 0, 0.07),
    spine: { bend: dn ? 5 : 0, side: 2 * s },
    head: { nod: dn ? 10 : -4, tilt: 4 * s },
    L: { clav: { up: 10 }, hand: ch([0.28 + 0.04 * s, 1.98 - (dn ? 0.06 : 0), 0.12]), pole: dir("chest", [1, 0.2, -0.3]), orient: { frame: "char", fingers: [0.15 + 0.2 * s, 1, 0.1], palm: [0, 0.1, 1] }, fingers: "open" },
    R: { clav: { up: 10 }, hand: ch([-0.28 + 0.04 * s, 1.98 - (dn ? 0.06 : 0), 0.12]), pole: dir("chest", [-1, 0.2, -0.3]), orient: { frame: "char", fingers: [-0.15 + 0.2 * s, 1, 0.1], palm: [0, 0.1, 1] }, fingers: "open" },
    legL: { foot: ch([0.12, 0.126, -0.03]), footYaw: 12 },
    legR: { foot: ch([-0.12, 0.126, -0.03]), footYaw: -12 },
  });

// 踏步拍手 step and clap: a step out to one side, the other foot in beside it, a clap; and back
const stepOut = (s: number): P =>
  stand({
    hips: { pos: [0.11 * s, -0.05, 0], roll: -3 * s },
    spine: { side: 3 * s, bend: 3 },
    head: { tilt: 3 * s, nod: 2 },
    L: { hand: cs([0.26, -0.12, 0.16]), pole: dir("chest", [1, -0.6, -0.3]), orient: { frame: "chest", fingers: [0.2, 0.6, 0.8], palm: [-1, 0, 0.2] }, fingers: "flat" },
    R: { hand: cs([-0.26, -0.12, 0.16]), pole: dir("chest", [-1, -0.6, -0.3]), orient: { frame: "chest", fingers: [-0.2, 0.6, 0.8], palm: [1, 0, 0.2] }, fingers: "flat" },
    legL: { foot: ch([s > 0 ? 0.32 : 0.02, 0.126, -0.02]), footYaw: 10 },
    legR: { foot: ch([s > 0 ? -0.02 : -0.32, 0.126, -0.02]), footYaw: -10 },
  });
const stepIn = (s: number): P =>
  stand({
    hips: { pos: [0.15 * s, -0.025, 0], roll: 2 * s },
    spine: { side: -2 * s, bend: 2 },
    head: { tilt: -2 * s, nod: 6 },
    // the clap: palms together in front of the chest
    L: { hand: cs([0.022, -0.04, 0.33]), pole: dir("chest", [1, -0.7, -0.2]), orient: { frame: "chest", fingers: [-0.15, 0.75, 0.65], palm: [-1, 0, 0] }, fingers: "flat" },
    R: { hand: cs([-0.022, -0.04, 0.33]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "chest", fingers: [0.15, 0.75, 0.65], palm: [1, 0, 0] }, fingers: "flat" },
    legL: { foot: ch([s > 0 ? 0.25 : 0.05, 0.126, -0.03]), footYaw: 10 },
    legR: { foot: ch([s > 0 ? 0.05 : -0.25, 0.126, -0.03]), footYaw: -10 },
  });

// 举手顶天 raise the roof: both hands over the head, palms up, pushing up on the beat
const roof = (up: boolean): P =>
  stand({
    ...down(up ? 0 : 1, 0.05),
    spine: { bend: up ? -3 : 2 },
    head: { nod: up ? -10 : 2 },
    L: { clav: { up: up ? 16 : 8 }, hand: up ? ch([0.17, 2.06, 0.06]) : hd([0.19, 0.17, 0.02]), pole: dir("chest", [1, -0.2, -0.3]), orient: { frame: "char", fingers: [-0.2, 0.1, -1], palm: [0, 1, 0] }, fingers: "flat" },
    R: { clav: { up: up ? 16 : 8 }, hand: up ? ch([-0.17, 2.06, 0.06]) : hd([-0.19, 0.17, 0.02]), pole: dir("chest", [-1, -0.2, -0.3]), orient: { frame: "char", fingers: [0.2, 0.1, -1], palm: [0, 1, 0] }, fingers: "flat" },
    legL: { foot: ch([0.13, 0.126, -0.03]), footYaw: 12 },
    legR: { foot: ch([-0.13, 0.126, -0.03]), footYaw: -12 },
  });

/** the left hand on the hip, elbow out */
const handOnHip: P = {
  L: { hand: hp([0.19, 0.09, 0.0]), pole: dir("chest", [1, -0.2, -0.6]), orient: { frame: "hips", fingers: [0.15, -0.35, 1], palm: [-1, 0, 0.15] }, fingers: "relaxed" },
};

// 出拳 fist pump: the right fist up on the beat, the left hand on the hip
const pump = (up: boolean): P =>
  stand({
    hips: { pos: [0, up ? -0.03 : -0.07, 0], roll: 3, yaw: -6 },
    spine: { side: -3, bend: up ? -2 : 3 },
    head: { nod: up ? -8 : 6, turn: -6 },
    ...handOnHip,
    R: { clav: { up: up ? 14 : 4 }, hand: up ? ch([-0.2, 2.06, 0.12]) : cs([-0.2, 0.08, 0.2]), pole: dir("chest", [-1, -0.3, -0.2]), fingers: "fist" },
    legL: { foot: ch([0.12, 0.126, -0.03]), footYaw: 12 },
    legR: { foot: ch([-0.12, 0.126, -0.03]), footYaw: -12 },
  });

// 指天指地 disco point: the right hand points up and out, then down and across
const point = (up: boolean): P =>
  stand({
    hips: { pos: [up ? 0.05 : -0.04, -0.03, 0], roll: up ? -5 : 4, yaw: up ? -8 : 10 },
    spine: { side: up ? 6 : -4, twist: up ? -6 : 10, bend: up ? -2 : 6 },
    head: { look: up ? ch([-0.7, 2.3, 0.6]) : ch([0.4, 0.6, 0.8]) },
    ...handOnHip,
    R: { clav: { up: up ? 14 : 0 }, hand: up ? ch([-0.5, 2.0, 0.18]) : ch([0.18, 0.8, 0.3]), pole: dir("chest", [-1, up ? -0.3 : -0.5, -0.3]), orient: { frame: "char", fingers: up ? [-0.55, 0.8, 0.15] : [0.5, -0.75, 0.4], palm: up ? [0.3, 0.2, 1] : [0.2, 0.4, 1] }, fingers: "point" },
    legL: { foot: ch([0.13, 0.126, -0.02]), footYaw: 12 },
    legR: { foot: ch([-0.1, 0.126, 0.0]), footYaw: -14, toe: up ? 0 : 18 },
  });

// 双手挥 wave: both hands high, swaying together from side to side
const waves = (s: number): P =>
  stand({
    hips: { pos: [-0.03 * s, -0.035, 0], roll: 3 * s },
    spine: { side: 5 * s, bend: -1 },
    head: { tilt: 5 * s, nod: -6 },
    L: { clav: { up: 14 }, hand: ch([0.2 + 0.2 * s, 2.0, 0.12]), pole: dir("chest", [1, 0, -0.4]), orient: { frame: "char", fingers: [0.4 * s, 1, 0.1], palm: [0, 0.05, 1] }, fingers: "open" },
    R: { clav: { up: 14 }, hand: ch([-0.2 + 0.2 * s, 2.0, 0.12]), pole: dir("chest", [-1, 0, -0.4]), orient: { frame: "char", fingers: [0.4 * s, 1, 0.1], palm: [0, 0.05, 1] }, fingers: "open" },
    legL: { foot: ch([0.12, 0.126, -0.03]), footYaw: 12 },
    legR: { foot: ch([-0.12, 0.126, -0.03]), footYaw: -12 },
  });

// 抖肩 shimmy: knees soft, leaning in a little, the shoulders one forward one back, fast
const shimmy = (s: number): P =>
  stand({
    hips: { pos: [0, -0.06, 0.0], pitch: 4 },
    spine: { bend: 8, twist: 9 * s },
    head: { nod: -4, turn: -4 * s },
    L: { clav: { fwd: 10 * s, up: 4 }, hand: cs([0.27, -0.25, 0.22]), pole: dir("chest", [1, -0.5, -0.4]), fingers: "relaxed" },
    R: { clav: { fwd: -10 * s, up: 4 }, hand: cs([-0.27, -0.25, 0.22]), pole: dir("chest", [-1, -0.5, -0.4]), fingers: "relaxed" },
    legL: { foot: ch([0.15, 0.126, -0.02]), footYaw: 14 },
    legR: { foot: ch([-0.15, 0.126, -0.02]), footYaw: -14 },
  });

// 扭一扭 twist: feet together, knees and hips turning one way, the arms the other
const twist = (s: number): P =>
  stand({
    hips: { pos: [0, -0.1, 0.02], yaw: 22 * s, roll: -3 * s },
    spine: { twist: -26 * s, bend: 5 },
    head: { turn: 6 * s, nod: 2 },
    L: { hand: cs([0.25 + 0.06 * s, -0.16, 0.2 + 0.08 * s]), pole: dir("chest", [1, -0.6, -0.2]), fingers: "fist" },
    R: { hand: cs([-0.25 + 0.06 * s, -0.16, 0.2 - 0.08 * s]), pole: dir("chest", [-1, -0.6, -0.2]), fingers: "fist" },
    legL: { foot: ch([0.08, 0.126, 0.0]), pole: dir("char", [0.5 * s, 0, 1]), footYaw: 10 + 25 * s },
    legR: { foot: ch([-0.08, 0.126, 0.0]), pole: dir("char", [0.5 * s, 0, 1]), footYaw: -10 + 25 * s },
  });

// ---------------------------------------------------------------- sitting

// 坐着摇 seated sway: leaning from side to side, hands tapping the thighs
const seatSway = (s: number, tap: boolean): P =>
  sit({
    hips: { roll: -3 * s },
    spine: { side: 7 * s, bend: 3 },
    head: { tilt: 6 * s, nod: tap ? 6 : 0 },
    L: { hand: hp([0.13, tap ? 0.03 : 0.08, 0.24]) },
    R: { hand: hp([-0.13, tap ? 0.03 : 0.08, 0.24]) },
  });

// 拍腿拍手 slap and clap: both hands slap the knees twice, then two claps
const slap = (onKnees: boolean): P =>
  sit({
    spine: { bend: onKnees ? 14 : 8 },
    head: { nod: onKnees ? 10 : 4 },
    L: { hand: hp([0.12, onKnees ? 0.04 : 0.12, 0.36]), orient: { frame: "hips", fingers: [0, -0.3, 1], palm: [0, -1, 0] }, fingers: "flat" },
    R: { hand: hp([-0.12, onKnees ? 0.04 : 0.12, 0.36]), orient: { frame: "hips", fingers: [0, -0.3, 1], palm: [0, -1, 0] }, fingers: "flat" },
  });
const clapSit = (together: boolean): P =>
  sit({
    spine: { bend: 2 },
    head: { nod: together ? 6 : -2 },
    L: { hand: cs([together ? 0.022 : 0.12, -0.06, 0.33]), pole: dir("chest", [1, -0.7, -0.2]), orient: { frame: "chest", fingers: [-0.15, 0.75, 0.65], palm: [-1, 0, 0] }, fingers: "flat" },
    R: { hand: cs([together ? -0.022 : -0.12, -0.06, 0.33]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "chest", fingers: [0.15, 0.75, 0.65], palm: [1, 0, 0] }, fingers: "flat" },
  });

// 坐着举手 seated roof: hands up, pushing up on the beat
const seatRoof = (up: boolean): P =>
  sit({
    spine: { bend: up ? -2 : 4 },
    head: { nod: up ? -10 : 3 },
    L: { clav: { up: up ? 16 : 8 }, hand: up ? cs([0.17, 0.72, 0.04]) : hd([0.19, 0.16, 0.02]), pole: dir("chest", [1, -0.2, -0.3]), orient: { frame: "chest", fingers: [-0.2, 0.1, -1], palm: [0, 1, 0] }, fingers: "flat" },
    R: { clav: { up: up ? 16 : 8 }, hand: up ? cs([-0.17, 0.72, 0.04]) : hd([-0.19, 0.16, 0.02]), pole: dir("chest", [-1, -0.2, -0.3]), orient: { frame: "chest", fingers: [0.2, 0.1, -1], palm: [0, 1, 0] }, fingers: "flat" },
  });

// 点头打拍子 nod along: a nod on each beat, the right hand snapping by the shoulder
const SNAP_SET = { Index: [10, 12, 6, 0], Middle: [18, 22, 10, 0], Ring: [80, 90, 60, 0], Pinky: [85, 90, 60, 0], Thumb: { across: 34, curl: [8, 18, 12], spread: 0 } };
const SNAPPED = { Index: [14, 14, 8, 0], Middle: [82, 92, 60, 0], Ring: [82, 92, 60, 0], Pinky: [86, 92, 60, 0], Thumb: { across: 12, curl: [0, 6, 4], spread: 10 } };
const nod = (dn: boolean): P =>
  sit({
    spine: { bend: dn ? 6 : 2, side: -2 },
    head: { nod: dn ? 16 : -2, tilt: -3 },
    R: { hand: cs([-0.24, 0.12, 0.2]), pole: dir("chest", [-1, -0.8, -0.1]), orient: { frame: "chest", fingers: [0, 1, 0.3], palm: [0.6, 0, 1] }, fingers: dn ? SNAPPED : SNAP_SET },
  });

// 划船 row: reaching forward, then pulling back, every two beats
const row = (reach: boolean): P =>
  sit({
    hips: { pitch: reach ? 8 : -4 },
    spine: { bend: reach ? 14 : -6 },
    head: { nod: reach ? -6 : 4 },
    L: { hand: reach ? cs([0.14, -0.08, 0.56]) : cs([0.2, -0.24, 0.1]), pole: dir("chest", [1, -0.6, -0.3]), orient: { frame: "chest", fingers: [0, -0.3, 1], palm: [-1, -0.2, 0] }, fingers: "fist" },
    R: { hand: reach ? cs([-0.14, -0.08, 0.56]) : cs([-0.2, -0.24, 0.1]), pole: dir("chest", [-1, -0.6, -0.3]), orient: { frame: "chest", fingers: [0, -0.3, 1], palm: [1, -0.2, 0] }, fingers: "fist" },
  });

// 坐着挥手 seated wave: one hand up, waving slowly from side to side
const seatWave = (s: number): P =>
  sit({
    spine: { side: 3 * s, bend: 2 },
    head: { tilt: 4 * s, nod: -3 },
    R: { clav: { up: 12 }, hand: cs([-0.22 + 0.12 * s, 0.68, 0.1]), pole: dir("chest", [-1, 0, -0.3]), orient: { frame: "chest", fingers: [0.35 * s, 1, 0.1], palm: [0, 0.05, 1] }, fingers: "open" },
  });

// ---------------------------------------------------------------- the clips

/** keys every `step` beats from a pose function of the key's number */
const every = (n: number, step: number, f: (i: number) => P, ease = "inout") => Array.from({ length: n }, (_, i) => ({ t: i * step, pose: f(i), ease }));

export const CLIPS: Clip[] = [
  { name: "stand", dur: 4, fps: 6, keys: [{ t: 0, pose: stand({}) }, { t: 2, pose: stand({ spine: { bend: 2 }, head: { nod: 2 } }) }] },
  { name: "sit", dur: 4, fps: 6, keys: [{ t: 0, pose: sit({}) }, { t: 2, pose: sit({ spine: { bend: 5 } }) }] },
  { name: "sway", dur: 4, fps: 8, keys: every(4, 1, (i) => sway(i % 4 < 2 ? (i % 4 === 0 ? 1 : 0) : i % 4 === 2 ? -1 : 0, i % 2 === 1)) },
  { name: "bounce", dur: 2, fps: 12, keys: every(4, 0.5, (i) => bounce(i % 2 === 0, i < 2 ? 1 : -1), "inout") },
  { name: "stepClap", dur: 4, fps: 10, keys: [{ t: 0, pose: stepOut(1) }, { t: 1, pose: stepIn(1), ease: "out" }, { t: 2, pose: stepOut(-1) }, { t: 3, pose: stepIn(-1), ease: "out" }] },
  { name: "raiseRoof", dur: 2, fps: 12, keys: every(4, 0.5, (i) => roof(i % 2 === 0), "out") },
  { name: "fistPump", dur: 2, fps: 12, keys: every(4, 0.5, (i) => pump(i % 2 === 0), "snap") },
  { name: "point", dur: 2, fps: 12, keys: [{ t: 0, pose: point(true) }, { t: 1, pose: point(false), ease: "snap" }], closeEase: "snap" },
  { name: "waveBoth", dur: 4, fps: 8, keys: [{ t: 0, pose: waves(1) }, { t: 2, pose: waves(-1) }] },
  { name: "shimmy", dur: 1, fps: 24, keys: every(4, 0.25, (i) => shimmy(i % 2 ? -1 : 1), "inout") },
  { name: "twist", dur: 2, fps: 12, keys: [{ t: 0, pose: twist(1) }, { t: 1, pose: twist(-1) }] },
  { name: "seatSway", dur: 4, fps: 8, keys: every(4, 1, (i) => seatSway(i < 2 ? 1 : -1, i % 2 === 0)) },
  { name: "kneeClap", dur: 4, fps: 12, keys: [{ t: 0, pose: slap(true), ease: "snap" }, { t: 0.5, pose: slap(false) }, { t: 1, pose: slap(true), ease: "snap" }, { t: 1.5, pose: clapSit(false) }, { t: 2, pose: clapSit(true), ease: "snap" }, { t: 2.5, pose: clapSit(false) }, { t: 3, pose: clapSit(true), ease: "snap" }, { t: 3.5, pose: slap(false) }] },
  { name: "seatRoof", dur: 2, fps: 12, keys: every(4, 0.5, (i) => seatRoof(i % 2 === 0), "out") },
  { name: "nod", dur: 1, fps: 16, keys: [{ t: 0, pose: nod(true), ease: "snap" }, { t: 0.5, pose: nod(false) }] },
  { name: "row", dur: 2, fps: 10, keys: [{ t: 0, pose: row(true) }, { t: 1, pose: row(false) }] },
  { name: "seatWave", dur: 4, fps: 8, keys: [{ t: 0, pose: seatWave(1) }, { t: 2, pose: seatWave(-1) }] },
];

/** which clips are danced sitting (the stool's there for them) */
export const SITTING = new Set<string>(["sit", ...Object.entries(DANCE_MOVES).filter(([, m]) => m.sit).map(([id]) => id)]);
