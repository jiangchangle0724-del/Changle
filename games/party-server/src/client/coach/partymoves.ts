// The party songs' own dances as the coach dances them (src/shared/songmoves.ts names them): the
// Cupid Shuffle's line dance, the Cha-Cha Slide's calls, Y.M.C.A.'s letters, Watch Me's whip and
// nae nae, the Ketchup Song's hands, Gee's crab step, 海草舞's seaweed arms and 極楽浄土's fan
// hands. Written like songmoves.ts: `p` is the beat position in the move's 8-count (0 is count 1);
// a call's move (the Cha-Cha Slide's) is counted from where the call puts it, so its p starts at 0.
//
// Sides are the players': R is their right, the screen's right (+x); the coach is their mirror.
import { CLAP, P, TAU, UP, both, countAt as at, ease, elbows, feet, footOf, hand, palms, type MoveAnim } from "./kit";
import { BASE, keys, type Ease, type Part, type Pose } from "./pose";

const S: Record<string, MoveAnim> = {};
const other = (side: 1 | -1) => (side > 0 ? -1 : 1) as 1 | -1;

/** arms loose, elbows bent, the hands at the belt, swung a little towards one side (-1 to 1) */
const loose = (sway = 0): Part => P(palms(-0.7, 0, 0.5), elbows(0.7, -0.6, -0.4), { hR: [0.2 + 0.06 * sway, -0.3, 0.17], hL: [-0.2 + 0.06 * sway, -0.3, 0.17] });
/** walking arms: the hand opposite the stepping foot comes forward */
const swing = (side: 1 | -1, k = 1): Part => P(palms(-0.8, 0, 0.4), elbows(0.6, -0.5, -0.6), { hR: [0.21, -0.36, 0.1 - 0.12 * k * side], hL: [-0.21, -0.36, 0.1 + 0.12 * k * side] });

/**
 * Steps to one side, the other foot closing in after each (a step and a close on every two beats),
 * `steps` times, 0.12 m a step, starting `from` metres across (where the last move left the coach).
 */
function sideSteps(o: Pose, q: number, side: 1 | -1, steps: number, from: number, touchLast = true) {
  const STEP = 0.12;
  const HALF = 0.1;
  const k = Math.min(steps - 1, Math.floor(q / 2));
  const ph = Math.min(2, q - 2 * k);
  const c = from + side * STEP * k;
  const out = ease(ph);
  const close = ease(ph - 1);
  const mid = c + side * STEP * (0.55 * out + 0.45 * close);
  const lead = footOf(o, side);
  const trail = footOf(o, other(side));
  o.rx = mid;
  lead.x = c + side * (HALF + STEP * out) - mid;
  trail.x = c - side * HALF + side * STEP * close - mid;
  lead.lift += 0.05 * Math.sin(Math.PI * Math.min(1, ph));
  if (ph > 1) trail.lift += 0.045 * Math.sin(Math.PI * (ph - 1));
  // the last close only touches: that foot leads off next
  if (touchLast && k === steps - 1 && ph > 1.6) {
    trail.lift += 0.02;
    trail.pitch -= 0.3;
  }
  o.px += 0.025 * side * Math.sin((Math.PI * ph) / 2);
  o.cRoll -= 0.03 * side * Math.sin(Math.PI * ph);
}

// ---------- Cupid Shuffle

S["cupid-right"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 2, [
    [0, loose(1)],
    [1, loose(0.4)],
  ]),
  extra: (p, o) => {
    const { q } = at(p);
    sideSteps(o, q, 1, 4, 0);
    // the shoulders shrug with each step
    const s = 0.03 * Math.max(0, Math.sin(Math.PI * q));
    o.sR = [s, 0];
    o.sL = [s, 0];
  },
};

S["cupid-left"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 2, [
    [0, loose(-1)],
    [1, loose(-0.4)],
  ]),
  extra: (p, o) => {
    const { q } = at(p);
    sideSteps(o, q, -1, 4, 0.48);
    const s = 0.03 * Math.max(0, Math.sin(Math.PI * q));
    o.sR = [s, 0];
    o.sL = [s, 0];
  },
};

/** a low kick forward, the toes up a little, the body leaning back against it */
const kick = (side: 1 | -1): Part =>
  P(loose(-0.6 * side), side > 0 ? { fR: { x: 0.2, z: 0.26, lift: 0.26, pitch: 0.25, yaw: 0.4 }, fL: { x: -0.08 } } : { fL: { x: -0.2, z: 0.26, lift: 0.26, pitch: 0.25, yaw: -0.4 }, fR: { x: 0.08 } }, { pitch: -0.08, pz: -0.04, px: -0.04 * side, roll: 0.04 * side });
const TOGETHER: Part = P(loose(0), feet(0.1));
S["cupid-kick"] = {
  len: 8,
  groove: 0.6,
  // kick right on 1, back on 2, left on 3, back on 4; again on 5 to 8
  pose: keys(BASE, 4, [
    [0, kick(1), "hit"],
    [0.9, TOGETHER, "snap"],
    [2, kick(-1), "hit"],
    [2.9, TOGETHER, "snap"],
  ]),
};

/** walking on the spot, a foot a count (right on 1), turning a quarter to the left over the 8 counts */
S["cupid-walk"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 2, [
    [0, P(feet(0.11), swing(1), { px: 0.03, roll: -0.03 })],
    [1, P(feet(0.11), swing(-1), { px: -0.03, roll: 0.03 })],
  ]),
  extra: (p, o) => {
    const { i, f, q } = at(p);
    // the next count's foot comes up after the half beat and steps down on its count
    const next = (i + 1) % 2 === 0 ? 1 : -1;
    const up = f > 0.35 ? Math.sin((Math.PI * (f - 0.35)) / 0.65) : 0;
    const foot = footOf(o, next);
    foot.lift += 0.07 * up;
    foot.pitch -= 0.25 * up;
    o.turn = (-Math.PI / 2) * ease(q / 7.5);
  },
};

// ---------- Cha-Cha Slide: each call's move from the beat it's called (p from 0), done once and
// held for as long as the call lasts, or round and round where it says so

/** key frames from the call's first beat, the last one held after (for up to 64 beats) */
const once = (list: [number, Part, Ease?][]) => keys(BASE, 64, [...list, [63.9, list[list.length - 1]![1]]]);
const STAND: Part = P(feet(0.12), loose(0));
const FISTS_DOWN: Part = P(both(0.2, -0.24, 0.2), palms(-0.3, -1, 0.3), elbows(0.8, -0.5, -0.3));

/** one slide: the foot out wide, the body after it, the other foot dragged in along the floor */
const slide = (side: 1 | -1): ((p: number) => Pose) => {
  const lead = side > 0 ? "fR" : "fL";
  const trail = side > 0 ? "fL" : "fR";
  const arm = hand(side, [0.5, -0.12, 0.12], [0, -0.2, 1], [1, -0.4, -0.4]);
  return once([
    [0, STAND],
    [0.6, P(loose(side), arm, { [lead]: { x: 0.4 * side }, [trail]: { x: -0.1 * side }, px: 0.12 * side, roll: -0.05 * side, cRoll: -0.04 * side }), "snap"],
    [1.6, P(loose(0.6 * side), { [lead]: { x: 0.4 * side }, [trail]: { x: 0.2 * side }, px: 0.27 * side }), "smooth"],
  ]);
};
/** the trailing foot drags (stays on the floor, toes down) while it's pulled in */
const drag = (side: 1 | -1) => (p: number, o: Pose) => {
  if (p < 0.6 || p > 1.6) return;
  const f = footOf(o, other(side));
  f.lift = 0;
  f.pitch = -0.35;
};
S["cha-left"] = { len: 64, groove: 0.5, pose: slide(-1), extra: drag(-1) };
S["cha-right"] = { len: 64, groove: 0.5, pose: slide(1), extra: drag(1) };

/** "Take it back now y'all": four steps back, right, left, right, left, the arms swinging */
S["cha-back"] = {
  len: 64,
  groove: 0.5,
  pose: keys(BASE, 2, [
    [0, P(feet(0.12), swing(1, 0.7), { pitch: -0.04 })],
    [1, P(feet(0.12), swing(-1, 0.7), { pitch: -0.04 })],
  ]),
  extra: (p, o) => {
    const q = Math.min(4, Math.max(0, p));
    o.rz = -0.09 * q;
    if (q >= 4) return;
    const k = Math.floor(q);
    const f = q - k;
    const foot = footOf(o, k % 2 === 0 ? 1 : -1);
    foot.lift += 0.06 * Math.sin(Math.PI * f);
    foot.z += 0.08 * (0.5 - f);
  },
};

/** a jump on the spot or forward: crouch, up, land soft (`at` its take-off), arms swinging up */
function hop(o: Pose, p: number, at: number, height = 1) {
  const t = p - at;
  if (t < -0.25 || t > 0.9) return;
  const crouch = (x: number) => -0.07 * Math.exp(-((x / 0.12) ** 2));
  const air = t > 0 && t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0;
  o.py += height * (0.12 * air + crouch(t + 0.05) + crouch(t - 0.6));
  o.fR.lift += height * 0.1 * air;
  o.fL.lift += height * 0.1 * air;
  o.fR.pitch -= 0.4 * air;
  o.fL.pitch -= 0.4 * air;
  o.hR = [o.hR[0], o.hR[1] + 0.25 * air, o.hR[2] + 0.1 * air];
  o.hL = [o.hL[0], o.hL[1] + 0.25 * air, o.hL[2] + 0.1 * air];
}
const hops = (at: number[]): MoveAnim => ({
  len: 64,
  groove: 0.3,
  pose: once([[0, STAND]]),
  extra: (p, o) => {
    for (const a of at) hop(o, p, a, at.length > 2 ? 0.7 : 1);
  },
});
S["cha-hop"] = hops([0]);
S["cha-hop2"] = hops([0, 1]);
S["cha-hops"] = hops([0, 1, 2, 3, 4, 5, 6, 7]);

/** the knee up, then the foot stamped down hard (`at` the stamp), the fists pumping down with it */
function stomp(o: Pose, p: number, side: 1 | -1, at: number) {
  const t = p - at;
  if (t < -0.6 || t > 0.5) return;
  const up = t < 0 ? Math.sin((Math.PI * (t + 0.6)) / 1.2) : 0;
  const f = footOf(o, side);
  f.lift += 0.2 * up;
  f.z += 0.05 * up;
  f.pitch += 0.15 * up;
  const hit = t >= 0 ? Math.exp(-((t / 0.12) ** 2)) : 0;
  o.py -= 0.05 * hit;
  o.cPitch += 0.08 * hit;
  o.hR = [o.hR[0], o.hR[1] - 0.08 * hit, o.hR[2]];
  o.hL = [o.hL[0], o.hL[1] - 0.08 * hit, o.hL[2]];
}
const stomps = (side: 1 | -1, at: number[]): MoveAnim => ({
  len: 64,
  groove: 0.3,
  pose: once([[0, P(feet(0.13), FISTS_DOWN)]]),
  extra: (p, o) => {
    for (const a of at) stomp(o, p, side, a);
  },
});
S["cha-stomp-r"] = stomps(1, [0.75]);
S["cha-stomp-l"] = stomps(-1, [0.75]);
S["cha-stomp2-r"] = stomps(1, [0.75, 1.75]);
S["cha-stomp2-l"] = stomps(-1, [0.75, 1.75]);

/** the cha-cha's basic: rock forward and back, then cha-cha-cha on the spot; then the other foot */
const CHA_ARMS = (side: 1 | -1): Part => P(both(0.24, -0.16, 0.22), palms(-0.2, -1, 0.4), elbows(0.9, -0.5, -0.2), { hR: [0.24 + 0.05 * side, -0.16, 0.22 - 0.04 * side], hL: [-0.24 + 0.05 * side, -0.16, 0.22 + 0.04 * side] });
const rock = (side: 1 | -1, fwd: boolean): Part => P(CHA_ARMS(side), feet(0.12), side > 0 ? { fR: { z: fwd ? 0.16 : 0 } } : { fL: { z: fwd ? 0.16 : 0 } }, { px: 0.05 * side, roll: -0.05 * side, pz: fwd ? 0.05 : -0.01 });
const cha = (side: 1 | -1): Part => P(CHA_ARMS(side), feet(0.12), { px: 0.06 * side, roll: -0.07 * side, cRoll: 0.03 * side });
S["cha-cha"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0, rock(1, true), "snap"],
    [1, rock(-1, false), "snap"],
    [2, cha(1)],
    [2.5, cha(-1)],
    [3, cha(1)],
    [4, rock(-1, true), "snap"],
    [5, rock(1, false), "snap"],
    [6, cha(-1)],
    [6.5, cha(1)],
    [7, cha(-1)],
  ]),
  extra: (p, o) => {
    // the cha-cha-cha's little steps on 3-and-4 and 7-and-8
    const { q } = at(p);
    const r = q % 4;
    if (r < 2) return;
    const k = Math.floor((r - 2) * 2);
    const f = (r - 2) * 2 - k;
    const foot = footOf(o, ((k % 2 === 0) === q < 4 ? 1 : -1) as 1 | -1);
    foot.lift += 0.035 * Math.sin(Math.PI * f);
  },
};

/** "Turn it out": a quarter turn to the left, stepping round on the spot, then facing that way */
S["cha-turn"] = {
  len: 64,
  groove: 0.4,
  pose: once([[0, STAND]]),
  extra: (p, o) => {
    o.turn = (-Math.PI / 2) * ease(p / 2);
    if (p < 2) {
      const k = Math.floor(p * 2);
      const foot = footOf(o, k % 2 === 0 ? -1 : 1);
      foot.lift += 0.05 * Math.sin(Math.PI * (p * 2 - k));
    }
  },
};

/** "Criss cross": a jump landing with the right foot crossed in front, a jump landing apart */
const CROSSED: Part = P({ fR: { x: -0.06, z: 0.06, yaw: 0.3 }, fL: { x: 0.06, z: -0.04, yaw: -0.3 } }, { hR: [-0.1, -0.12, 0.3], hL: [0.1, -0.1, 0.28], pR: [0, 0, 1], pL: [0, 0, 1], eR: [0.8, -0.6, -0.2], eL: [-0.8, -0.6, -0.2] });
const APART_WIDE: Part = P(feet(0.22), both(0.42, -0.2, 0.12), palms(0, -0.2, 1), elbows(1, -0.4, -0.3));
S["cha-criss"] = {
  len: 64,
  groove: 0.2,
  pose: once([
    [0, P(feet(0.18), loose(0))],
    [0.7, CROSSED, "hit"],
    [1.7, APART_WIDE, "hit"],
  ]),
  extra: (p, o) => {
    hop(o, p, 0.2, 0.6);
    hop(o, p, 1.2, 0.6);
  },
};

/** "Hands on your knees": bent over, hands on the knees, the knees swinging in and out */
const KNEES: Part = P(feet(0.2), { pitch: 0.42, py: -0.14, pz: -0.04, cPitch: 0.1, hPitch: -0.45 }, both(0.16, -0.5, 0.36), palms(-0.2, -1, 0.3), elbows(1, 0, -0.2));
S["cha-knees"] = {
  len: 2,
  groove: 0.5,
  pose: keys(BASE, 2, [
    [0, P(KNEES, { fR: { yaw: -0.3 }, fL: { yaw: 0.3 } }, { hR: [0.11, -0.5, 0.36], hL: [-0.11, -0.5, 0.36] }), "hit"],
    [1, P(KNEES, { fR: { yaw: 0.5 }, fL: { yaw: -0.5 } }, { hR: [0.2, -0.5, 0.36], hL: [-0.2, -0.5, 0.36] }), "hit"],
  ]),
};

/** "Get funky with it": a body roll and the shoulders going, free */
S["cha-funky"] = {
  len: 4,
  groove: 0.8,
  pose: keys(BASE, 4, [
    [0, P(feet(0.17), FISTS_DOWN, { pz: 0.05, pitch: -0.08, cPitch: -0.1, sR: [0.05, 0], px: 0.04 })],
    [1, P(feet(0.17), FISTS_DOWN, { pz: -0.04, pitch: 0.1, cPitch: 0.12, sL: [0.05, 0], px: -0.04 })],
    [2, P(feet(0.17), FISTS_DOWN, { pz: 0.05, pitch: -0.08, cPitch: -0.1, sR: [0.05, 0], px: 0.04, yaw: 0.15 })],
    [3, P(feet(0.17), FISTS_DOWN, { pz: -0.04, pitch: 0.1, cPitch: 0.12, sL: [0.05, 0], px: -0.04, yaw: -0.15 })],
  ]),
};

/** clap on every beat, stepping side to side */
S["cha-clap"] = {
  len: 2,
  groove: 0.6,
  pose: keys(BASE, 2, [
    [0, P(CLAP, { fR: { x: 0.24 }, fL: { x: -0.06 }, px: 0.06 }), "hit"],
    [0.5, P(both(0.17, -0.11, 0.3), palms(-1, 0, 0.2), elbows(0.7, -0.7, -0.3), { fR: { x: 0.2 }, fL: { x: -0.02 }, px: 0.06 })],
    [1, P(CLAP, { fL: { x: -0.24 }, fR: { x: 0.06 }, px: -0.06 }), "hit"],
    [1.5, P(both(0.17, -0.11, 0.3), palms(-1, 0, 0.2), elbows(0.7, -0.7, -0.3), { fL: { x: -0.2 }, fR: { x: 0.02 }, px: -0.06 })],
  ]),
};

/** "Freeze!": stopped dead, hands up, not even the bounce */
S["cha-freeze"] = { len: 64, groove: 0, pose: once([[0, P(feet(0.2), UP, { hPitch: -0.1 }), "snap"]]) };

/** "How low can you go": down a little lower every beat, the arms swinging, bouncing as you go */
S["cha-low"] = {
  len: 64,
  groove: 0.7,
  pose: keys(BASE, 2, [
    [0, P(feet(0.28), { fR: { yaw: 0.6 }, fL: { yaw: -0.6 } }, both(0.3, -0.2, 0.25), palms(0, -1, 0.3), elbows(1, -0.5, -0.3), { hYaw: 0.15 })],
    [1, P(feet(0.28), { fR: { yaw: 0.6 }, fL: { yaw: -0.6 } }, both(0.18, -0.24, 0.3), palms(0, -1, 0.3), elbows(1, -0.5, -0.3), { hYaw: -0.15 })],
  ]),
  extra: (p, o) => {
    o.py -= 0.34 * ease(p / 14);
    o.cPitch += 0.15 * ease(p / 14);
  },
};

/** "Bring it to the top": back up from low, the hands going up to the sky */
S["cha-top"] = {
  len: 64,
  groove: 0.6,
  pose: once([
    [0, P(feet(0.28), { fR: { yaw: 0.6 }, fL: { yaw: -0.6 }, py: -0.34, cPitch: 0.15 }, both(0.3, -0.2, 0.25), palms(0, -1, 0.3), elbows(1, -0.5, -0.3))],
    [6, P(feet(0.2), both(0.3, 0.2, 0.2), palms(0, 0.3, 1), elbows(1, -0.2, -0.3), { py: -0.08 })],
    [10, P(feet(0.18), UP, { py: 0.02, fR: { pitch: -0.4, lift: 0.03 }, fL: { pitch: -0.4, lift: 0.03 }, hPitch: -0.15 })],
  ]),
  extra: (p, o) => {
    // the hands waving up there
    if (p < 6) return;
    const w = 0.06 * Math.sin(TAU * p);
    o.hR = [o.hR[0] + w, o.hR[1], o.hR[2]];
    o.hL = [o.hL[0] + w, o.hL[1], o.hL[2]];
  },
};

/** "Reverse": a jump that turns you round to face the back */
S["cha-reverse"] = {
  len: 64,
  groove: 0.3,
  pose: once([[0, STAND]]),
  extra: (p, o) => {
    hop(o, p, 0.1, 0.8);
    o.turn = -Math.PI * ease((p - 0.1) / 0.5);
  },
};

/** "Charlie Brown": rock forward onto the right with the left kicking up, back onto the left with the right touching behind */
S["cha-charlie"] = {
  len: 4,
  groove: 0.7,
  pose: keys(BASE, 4, [
    [0, P(feet(0.12), swing(-1), { fR: { z: 0.18 }, pz: 0.08, pitch: 0.06 }), "snap"],
    [1, P(feet(0.12), swing(-1, 1.3), { fR: { z: 0.18 }, fL: { z: 0.3, lift: 0.15, pitch: 0.2 }, pz: 0.1, pitch: -0.04 }), "hit"],
    [2, P(feet(0.12), swing(1), { fR: { z: 0.18 }, fL: { z: -0.12 }, pz: -0.05, pitch: -0.05 }), "snap"],
    [3, P(feet(0.12), swing(1, 1.3), { fR: { z: -0.3, lift: 0.04, pitch: -0.5 }, fL: { z: -0.12 }, pz: -0.08, pitch: 0.06 }), "hit"],
  ]),
};

// ---------- Y.M.C.A.: the letters everyone makes with their arms (the crowds' dance since 1979)

/** a step out to one side and the other foot touching in by it, a clap on the touch */
const stepTouch = (side: 1 | -1, touch: boolean): Part =>
  side > 0 ? { fR: { x: 0.24 }, fL: touch ? { x: 0.06, lift: 0.02, pitch: -0.3 } : { x: -0.12 }, px: (touch ? 0.1 : 0.06) } : { fL: { x: -0.24 }, fR: touch ? { x: -0.06, lift: 0.02, pitch: -0.3 } : { x: 0.12 }, px: (touch ? -0.1 : -0.06) };
const OPEN_HANDS: Part = P(both(0.2, -0.1, 0.28), palms(-1, 0, 0.2), elbows(0.7, -0.7, -0.3));
S["ymca-groove"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 4, [
    [0, P(OPEN_HANDS, stepTouch(1, false)), "snap"],
    [1, P(CLAP, stepTouch(1, true)), "hit"],
    [2, P(OPEN_HANDS, stepTouch(-1, false)), "snap"],
    [3, P(CLAP, stepTouch(-1, true)), "hit"],
  ]),
};

/** a fist punched up at the sky, the other at the shoulder */
const pump = (side: 1 | -1, up: boolean): Part =>
  P(
    hand(side, up ? [0.16, 0.56, 0.1] : [0.2, 0.02, 0.14], [0, up ? 0.2 : -0.6, up ? 1 : 0.6], up ? [1, 0, -0.3] : [0.8, -0.8, -0.2]),
    hand(other(side), [0.2, 0.02, 0.14], [0, -0.6, 0.6], [0.8, -0.8, -0.2]),
  );
S["ymca-pump"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 4, [
    [0, P(pump(1, true), stepTouch(1, false)), "hit"],
    [1, P(pump(1, false), stepTouch(1, true)), "snap"],
    [2, P(pump(-1, true), stepTouch(-1, false)), "hit"],
    [3, P(pump(-1, false), stepTouch(-1, true)), "snap"],
  ]),
};

/** Y: both arms up and out in a V */
const Y: Part = P(feet(0.17), both(0.4, 0.5, 0.1), palms(0, 0.2, 1), elbows(1, 0.2, -0.3), { hPitch: -0.08 });
/** M: the fingertips on top of the head, the elbows out to the sides */
const M: Part = P(feet(0.17), both(0.05, 0.36, 0.03), palms(-0.3, -1, 0), elbows(1, 0.4, 0));
/** C: both arms curved out to the screen's left (the room sees a C), leaning that way */
const C: Part = P(feet(0.17), hand(1, [-0.16, 0.4, 0.14], [-1, -0.3, 0.2], [0.6, 0.6, -0.5]), hand(-1, [0.46, -0.14, 0.16], [-1, 0.5, 0.3], [1, -0.4, -0.3]), { roll: 0.12, cRoll: 0.12, px: 0.03, hRoll: 0.1 });
/** A: the hands together over the head, the elbows out: a pointed roof */
const A: Part = P(feet(0.17), both(0.02, 0.6, 0.06), palms(-1, 0.2, 0), elbows(1, 0.1, -0.1));
S["ymca-letters"] = {
  len: 8,
  groove: 0.5,
  // each letter lands on its beat and holds it
  pose: keys(BASE, 8, [
    [0, Y, "hit"],
    [0.72, Y],
    [1, M, "hit"],
    [1.72, M],
    [2, C, "hit"],
    [2.72, C],
    [3, A, "hit"],
    [3.72, A],
    // 5-8: clapping on, stepping side to side ("it's fun to stay at the…")
    [4, P(OPEN_HANDS, stepTouch(1, false)), "snap"],
    [5, P(CLAP, stepTouch(1, true)), "hit"],
    [6, P(OPEN_HANDS, stepTouch(-1, false)), "snap"],
    [7, P(CLAP, stepTouch(-1, true)), "hit"],
  ]),
};

// ---------- Watch Me (Whip/Nae Nae): each call's dance, as the video's dancers do them

const CHEST_FISTS: Part = P(both(0.13, -0.12, 0.24), palms(-0.3, -1, 0.3), elbows(1, -0.4, -0.2));
/** the whip: the right knee bent forward, leaning back, the right arm thrown straight out in front, palm down */
const WHIP: Part = P(
  hand(1, [0.4, 0.06, 0.44], [0, -1, 0.2], [1, -0.2, -0.2]),
  hand(-1, [0.1, -0.1, 0.22], [0, -1, 0.3], [1, -0.4, -0.2]),
  { fR: { x: 0.16, z: 0.2, yaw: 0.3 }, fL: { x: -0.14, z: -0.05 }, py: -0.07, pitch: -0.1, cPitch: -0.08, hPitch: -0.1, hYaw: -0.1, yaw: -0.12 },
);
/** the nae nae: the right hand up over the head, waving to one side, the body swaying with it */
const naeNae = (side: 1 | -1): Part =>
  P(hand(1, [0.2 + 0.12 * side, 0.55, 0.06], [0, 0.1, 1], [1, 0.2, -0.3]), hand(-1, [0.06, -0.2, 0.2], [0, 0, -1], [1, -0.5, -0.1]), feet(0.17), { px: 0.06 * side, roll: -0.06 * side, cRoll: -0.06 * side, hRoll: 0.06 * side });
const naeNaeKeys: [number, Part, Ease?][] = [
  [4, naeNae(1), "smooth"],
  [5, naeNae(-1), "smooth"],
  [6, naeNae(1), "smooth"],
  [7, naeNae(-1), "smooth"],
];
S["wm-whip"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [[0, P(CHEST_FISTS, feet(0.15))], [1, P(CHEST_FISTS, feet(0.15), { py: -0.03 })], [2, WHIP, "hit"], [3.6, WHIP], ...naeNaeKeys]),
};
S["wm-whip2"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [[0, WHIP, "hit"], [0.6, WHIP], [1, P(CHEST_FISTS, feet(0.15)), "snap"], [2, WHIP, "hit"], [3.6, WHIP], ...naeNaeKeys]),
};

/** "watch me": both index fingers to the eyes, then out at the room, then the shoulders bouncing */
const POINT_EYES: Part = P(both(0.07, 0.17, 0.12), palms(0, 0, -1), elbows(1, -0.3, -0.2));
const POINT_OUT: Part = P(both(0.16, 0.05, 0.52), palms(0, -0.3, 1), elbows(1, -0.3, -0.3));
S["wm-watch"] = {
  len: 8,
  groove: 0.9,
  pose: keys(BASE, 8, [
    [0, P(POINT_EYES, feet(0.15)), "hit"],
    [1.6, P(POINT_EYES, feet(0.15))],
    [2, P(POINT_OUT, feet(0.15), { pz: 0.03 }), "hit"],
    [3.6, P(POINT_OUT, feet(0.15))],
    [4, P(CHEST_FISTS, feet(0.17), { sR: [0.05, 0], px: 0.04 }), "hit"],
    [5, P(CHEST_FISTS, feet(0.17), { sL: [0.05, 0], px: -0.04 }), "hit"],
    [6, P(CHEST_FISTS, feet(0.17), { sR: [0.05, 0], px: 0.04 }), "hit"],
    [7, P(CHEST_FISTS, feet(0.17), { sL: [0.05, 0], px: -0.04 }), "hit"],
  ]),
};

/** the stanky leg: one knee bent and turned in, rolling round, the arms out low */
const stanky = (side: 1 | -1, inward: boolean): Part =>
  P(
    both(0.4, -0.34, 0.14),
    palms(0, -1, 0.3),
    elbows(1, -0.3, -0.3),
    side > 0 ? { fR: inward ? { x: 0.1, z: 0.06, yaw: -0.8, lift: 0.05, pitch: -0.55 } : { x: 0.27, yaw: 0.7, lift: 0.02, pitch: -0.25 }, fL: { x: -0.17 } } : { fL: inward ? { x: -0.1, z: 0.06, yaw: 0.8, lift: 0.05, pitch: -0.55 } : { x: -0.27, yaw: -0.7, lift: 0.02, pitch: -0.25 }, fR: { x: 0.17 } },
    { py: -0.09, px: (inward ? -0.07 : 0.02) * side, roll: (inward ? 0.08 : -0.04) * side, yaw: (inward ? 0.15 : -0.1) * side },
  );
S["wm-stanky"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0, stanky(1, true), "hit"],
    [1, stanky(1, false)],
    [2, stanky(1, true), "hit"],
    [3, stanky(1, false)],
    [4, stanky(-1, true), "hit"],
    [5, stanky(-1, false)],
    [6, stanky(-1, true), "hit"],
    [7, stanky(-1, false)],
  ]),
};

/** break your legs: the knees knocked in with the heels kicked out, then the feet back flat, side to side */
const knock = (side: 1 | -1): Part => P(loose(-side), { fR: { x: 0.2, yaw: -0.5, pitch: -0.25, lift: 0.02 }, fL: { x: -0.2, yaw: 0.5, pitch: -0.25, lift: 0.02 }, py: -0.1, px: 0.05 * side, roll: -0.04 * side });
const FLAT: Part = P(loose(0), feet(0.2), { py: -0.04 });
S["wm-break"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 2, [
    [0, knock(1), "hit"],
    [0.5, FLAT],
    [1, knock(-1), "hit"],
    [1.5, FLAT],
  ]),
};

/** the bop: up on the toes, bouncing, the arms rowing in front, stepping over to the left and back */
const bop = (side: 1 | -1): Part =>
  P(hand(side, [0.16, -0.16, 0.42], [0, -1, 0.3], [1, -0.4, -0.3]), hand(other(side), [0.18, -0.24, 0.16], [0, -1, 0.3], [1, -0.4, -0.3]), feet(0.14), { fR: { pitch: -0.3 }, fL: { pitch: -0.3 }, py: 0.01, px: 0.04 * side, cYaw: -0.12 * side });
S["wm-bop"] = {
  len: 8,
  groove: 1,
  pose: keys(BASE, 2, [
    [0, bop(1), "hit"],
    [1, bop(-1), "hit"],
  ]),
  extra: (p, o) => {
    // over to the left on 1-4, back on 5-8
    const { q } = at(p);
    o.rx = -0.2 * Math.sin((Math.PI * q) / 8);
  },
};

/** yule (cranking the fists by the hips, leaning back) then Superman (a jump, the arms out in front, a leg kicked back) */
const crank = (side: 1 | -1): Part => P(hand(side, [0.2, -0.32, 0.28], [0, -1, 0.3], [1, -0.4, -0.3]), hand(other(side), [0.24, -0.4, 0.06], [0, -1, 0.3], [1, -0.3, -0.5]), feet(0.17), { pitch: -0.08, cYaw: 0.12 * side, py: -0.05 });
const SUPERMAN: Part = P(both(0.12, 0.12, 0.58), palms(0, -1, 0.3), elbows(1, -0.1, -0.3), { fL: { x: -0.08, z: -0.36, lift: 0.22, pitch: -0.6 }, fR: { x: 0.08 }, pitch: 0.28, cPitch: 0.08, hPitch: -0.35, py: -0.02 });
S["wm-yule"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, crank(1), "hit"],
    [1, crank(-1), "hit"],
    [2, crank(1), "hit"],
    [3, crank(-1), "hit"],
    [4, P(feet(0.12), CHEST_FISTS, { py: -0.08 })],
    [4.5, SUPERMAN, "snap"],
    [7.5, SUPERMAN],
  ]),
  extra: (p, o) => {
    const { q } = at(p);
    // the jump into the Superman
    if (q > 4 && q < 4.6) {
      const air = Math.sin((Math.PI * (q - 4)) / 0.6);
      o.py += 0.1 * air;
      o.fR.lift += 0.08 * air;
    }
  },
};

/** the duff: the hands open beside the face, bouncing from side to side, the hips popping */
const duff = (side: 1 | -1): Part => P(both(0.17, 0.12, 0.2), palms(0, 0.1, 1), elbows(1, -0.6, -0.2), feet(0.18), { px: 0.08 * side, roll: -0.08 * side, cRoll: 0.04 * side, hRoll: 0.05 * side });
S["wm-duff"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 2, [
    [0, duff(1), "hit"],
    [1, duff(-1), "hit"],
  ]),
};

// ---------- The Ketchup Song (Aserejé): Las Ketchup's hands on the chorus, a rumba sway between

/** hands flat, palms down, one wrist crossed over the other in front of the waist, or swept apart */
const crossed = (rightOver: boolean): Part => ({ hR: [-0.05, -0.32, 0.3], hL: [0.05, rightOver ? -0.35 : -0.29, 0.29], pR: [0, -1, 0.1], pL: [0, -1, 0.1], eR: [0.9, -0.4, -0.2], eL: [-0.9, -0.4, -0.2] });
const SWEPT: Part = P(both(0.36, -0.32, 0.22), palms(0, -1, 0.1), elbows(1, -0.3, -0.3));
/** a hitchhiker's thumb back over that shoulder */
const thumb = (side: 1 | -1): Part => hand(side, [0.3, 0.12, -0.02], [0, 0, -1], [1, -0.6, 0.2]);
const HIPS: Part = P(feet(0.15), { py: -0.03 });
S["ketchup-hands"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    // "Aserejé, ja, dejé": cross, sweep apart, cross the other way, apart
    [0, P(HIPS, crossed(true)), "hit"],
    [1, P(HIPS, SWEPT), "hit"],
    [2, P(HIPS, crossed(false)), "hit"],
    [3, P(HIPS, SWEPT), "hit"],
    // "de jebe tu de jebere": the right thumb over the shoulder, then the left
    [4, P(HIPS, thumb(1), hand(-1, [0.2, -0.3, 0.2], [0, -1, 0.2], [1, -0.4, -0.3]), { cYaw: -0.15, hYaw: -0.2 }), "hit"],
    [5, P(HIPS, thumb(1), thumb(-1), { cYaw: 0.15, hYaw: 0.2 }), "hit"],
    // "seibiunouva majavi": the fists rolling round each other
    [6, P(HIPS, { hR: [0.04, -0.12, 0.3], hL: [-0.04, -0.2, 0.3], pR: [0, -1, 0.2], pL: [0, -1, 0.2], eR: [0.9, -0.5, -0.2], eL: [-0.9, -0.5, -0.2] })],
  ]),
  extra: (p, o) => {
    const { q } = at(p);
    if (q < 6) return;
    const a = 2 * TAU * (q - 6);
    o.hR = [0.04, -0.16 + 0.06 * Math.sin(a), 0.3 + 0.06 * Math.cos(a)];
    o.hL = [-0.04, -0.16 - 0.06 * Math.sin(a), 0.3 - 0.06 * Math.cos(a)];
  },
};
/** "an de bugui, an de buididipí": the right hand to the forehead (looking out), the left on the hip, a wiggle */
const LOOK: Part = P(hand(1, [0.02, 0.18, 0.2], [0, -1, 0.1], [1, 0.1, -0.2]), hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), feet(0.15), { hYaw: 0.15 });
S["ketchup-head"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [4, P(LOOK, { px: 0.05, roll: -0.05 }), "hit"],
    [5, P(LOOK, { px: -0.05, roll: 0.05 }), "hit"],
    [6, P(LOOK, { px: 0.05, roll: -0.05, hYaw: -0.15 }), "hit"],
    [7, P(LOOK, { px: -0.05, roll: 0.05, hYaw: -0.15 }), "hit"],
  ]),
};
/** the rumba sway: a step to one side with the hips, a soft clap */
S["ketchup-sway"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, P(OPEN_HANDS, stepTouch(1, false), { roll: -0.07, cRoll: 0.03 })],
    [1, P(CLAP, stepTouch(1, true), { roll: -0.07, cRoll: 0.03 }), "hit"],
    [2, P(OPEN_HANDS, stepTouch(-1, false), { roll: 0.07, cRoll: -0.03 })],
    [3, P(CLAP, stepTouch(-1, true), { roll: 0.07, cRoll: -0.03 }), "hit"],
  ]),
};

// ---------- Gee (Girls' Generation): the crab step on "Gee gee gee gee, baby baby baby", the chorus' sparkling eyes

/** loose fists by the chin, cute */
const CHIN_FISTS: Part = P(both(0.09, 0.08, 0.22), palms(-0.4, 0, -1), elbows(1, -0.6, -0.1));
S["gee-groove"] = {
  len: 8,
  groove: 0.9,
  pose: keys(BASE, 4, [
    [0, P(CHIN_FISTS, stepTouch(1, false), { hRoll: -0.12 })],
    [1, P(CHIN_FISTS, stepTouch(1, true), { hRoll: -0.12, sR: [0.04, 0] }), "hit"],
    [2, P(CHIN_FISTS, stepTouch(-1, false), { hRoll: 0.12 })],
    [3, P(CHIN_FISTS, stepTouch(-1, true), { hRoll: 0.12, sL: [0.04, 0] }), "hit"],
  ]),
};

/** the crab step: knees bent out, the hands flat by the hips patting the air, edging sideways */
const CRAB: Part = P(both(0.3, -0.36, 0.2), palms(0, -1, 0.2), elbows(1, -0.3, -0.4), { py: -0.1, cPitch: 0.06, fR: { yaw: 0.5 }, fL: { yaw: -0.5 } });
S["gee-crab"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 1, [
    [0, P(CRAB, { hR: [0.3, -0.42, 0.2], hL: [-0.3, -0.42, 0.2] }), "hit"],
    [0.5, CRAB],
  ]),
  extra: (p, o) => {
    // four little steps to the right (1-4), four back to the left (5-8)
    const { q } = at(p);
    const side = q < 4 ? 1 : -1;
    const r = q < 4 ? q : q - 4;
    sideSteps(o, Math.min(4, r) * 2, side, 4, side > 0 ? 0 : 0.48, false);
    o.rx *= 0.5;
    o.hRoll = 0.1 * Math.sin(Math.PI * q);
  },
};

/** the hands by the eyes, the fingers flashing open and shut (sparkle), the head turning away dazzled */
S["gee-sparkle"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 4, [
    [0, P(feet(0.14), both(0.11, 0.16, 0.16), palms(0, 0, 1), elbows(1, -0.5, -0.1), { hYaw: 0.15 })],
    [2, P(feet(0.14), both(0.13, 0.17, 0.16), palms(0, 0, 1), elbows(1, -0.5, -0.1), { hYaw: -0.15, px: -0.03 })],
  ]),
  extra: (p, o) => {
    // the flashing: the palms turning out and back, twice a beat
    const c = Math.cos(2 * TAU * p);
    o.pR = [0.6 * c, 0, 1];
    o.pL = [-0.6 * c, 0, 1];
  },
};

/** startled: a little jump back, the hands up by the mouth, then again */
const STARTLED: Part = P(feet(0.12), both(0.07, 0.04, 0.18), palms(0, 0, -1), elbows(1, -0.7, -0.1), { pz: -0.06, pitch: -0.08, hPitch: -0.12 });
S["gee-surprise"] = {
  len: 8,
  groove: 0.4,
  pose: keys(BASE, 4, [
    [0, P(STARTLED), "hit"],
    [1.5, P(feet(0.12), CHIN_FISTS)],
    [2, P(STARTLED), "hit"],
    [3.5, P(feet(0.12), CHIN_FISTS)],
  ]),
  extra: (p, o) => {
    hop(o, ((p % 2) + 2) % 2, 0, 0.5);
  },
};

/** a tingle all over: arms hugging yourself, the shoulders shivering */
S["gee-shiver"] = {
  len: 8,
  groove: 0.3,
  pose: keys(BASE, 8, [[0, P(feet(0.13), { hR: [-0.16, -0.08, 0.16], hL: [0.16, -0.06, 0.14], pR: [-1, 0, -0.2], pL: [1, 0, -0.2], eR: [0.8, -0.6, 0.1], eL: [-0.8, -0.6, 0.1] }, { py: -0.03 })]]),
  extra: (p, o) => {
    const s = 0.035 * Math.sin(4 * TAU * p);
    o.px += s;
    o.cRoll += 2 * s;
    o.sR = [Math.max(0, s), 0];
    o.sL = [Math.max(0, -s), 0];
  },
};

/** shy: the hands on the cheeks, swaying side to side */
S["gee-shy"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, P(feet(0.12), both(0.1, 0.12, 0.12), palms(-1, 0, -0.3), elbows(1, -0.6, -0.1), { px: 0.04, roll: -0.05, hRoll: -0.15 })],
    [2, P(feet(0.12), both(0.1, 0.12, 0.12), palms(-1, 0, -0.3), elbows(1, -0.6, -0.1), { px: -0.04, roll: 0.05, hRoll: 0.15 })],
  ]),
};

// ---------- 海草舞: the arms swaying overhead like seaweed

/** the hands up by the head, the elbows out, the body swaying with the current to one side (the video's dancers: the wrists twisting like seaweed) */
const weed = (side: 1 | -1): Part => P(palms(0, 0, 1), elbows(1, -0.2, -0.3), { hR: [0.2 + 0.06 * side, 0.3, 0.1], hL: [-0.2 + 0.06 * side, 0.3, 0.1], px: -0.05 * side, roll: 0.06 * side, cRoll: -0.08 * side, hRoll: -0.05 * side }, feet(0.15));
/** the hands waving like water in front, low */
const waves = (side: 1 | -1): Part => P(feet(0.15), { hR: [0.34 + 0.14 * side, -0.16 + 0.05 * side, 0.3], hL: [-0.34 + 0.14 * side, -0.16 - 0.05 * side, 0.3], pR: [0, -1, 0.3], pL: [0, -1, 0.3], eR: [1, -0.3, -0.3], eL: [-1, -0.3, -0.3], px: 0.05 * side, py: -0.04, roll: -0.04 * side });
S["hc-seaweed"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0, weed(1)],
    [1, weed(-1)],
    [2, weed(1)],
    [3, weed(-1)],
    [4, waves(1)],
    [5, waves(-1)],
    [6, waves(1)],
    [7, waves(-1)],
  ]),
  extra: (p, o) => {
    // the wrists twisting, the palms turning out and in twice a beat
    const w = 0.9 * Math.sin(2 * TAU * p);
    o.pR = [o.pR[0] + w, o.pR[1], o.pR[2]];
    o.pL = [o.pL[0] - w, o.pL[1], o.pL[2]];
  },
};

/** a hand shading the eyes, looking out over the sea to one side */
const lookOut = (side: 1 | -1): Part => P(hand(side, [0.03, 0.17, 0.2], [0, -1, 0.2], [1, 0.2, -0.2]), hand(other(side), [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), feet(0.15), { hYaw: 0.35 * side, cYaw: 0.12 * side, px: 0.04 * side });
S["hc-look"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, lookOut(1), "snap"],
    [3.4, lookOut(1)],
    [4, lookOut(-1), "snap"],
    [7.4, lookOut(-1)],
  ]),
};
/** "随波逐流 浮浮沉沉": the hands waving low like water, the knees bobbing down and up */
S["hc-float"] = {
  len: 8,
  groove: 0.4,
  pose: keys(BASE, 2, [
    [0, P(waves(1), { py: -0.1 })],
    [1, P(waves(-1), { py: 0 })],
  ]),
};
/** "人生啊 如梦啊": the hands together by the cheek, as if asleep, swaying */
const dream = (side: 1 | -1): Part => P(feet(0.13), { hR: [0.06 * side + 0.02, 0.1, 0.12], hL: [0.06 * side - 0.02, 0.1, 0.12], pR: [-1, 0, 0], pL: [1, 0, 0], eR: [0.8, -0.6, -0.1], eL: [-0.8, -0.6, -0.1], hRoll: -0.3 * side, roll: -0.05 * side, px: 0.04 * side });
S["hc-dream"] = {
  len: 8,
  groove: 0.4,
  pose: keys(BASE, 8, [
    [0, dream(1)],
    [3.5, dream(1)],
    [4, dream(-1)],
    [7.5, dream(-1)],
  ]),
};
/** "亲爱的你 在哪里": a heart at the chest, then a hand reaching out, looking for you */
S["hc-where"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(feet(0.14), { hR: [0.03, -0.06, 0.24], hL: [-0.03, -0.06, 0.24], pR: [-0.6, 0, 1], pL: [0.6, 0, 1], eR: [0.9, -0.5, -0.2], eL: [-0.9, -0.5, -0.2] }), "snap"],
    [3.4, P(feet(0.14), { hR: [0.03, -0.06, 0.24], hL: [-0.03, -0.06, 0.24], pR: [-0.6, 0, 1], pL: [0.6, 0, 1], eR: [0.9, -0.5, -0.2], eL: [-0.9, -0.5, -0.2] })],
    [4, P(feet(0.14), hand(1, [0.3, 0.1, 0.5], [0, 0.2, 1], [1, -0.2, -0.3]), hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { pz: 0.05, hYaw: 0.15 }), "snap"],
    [7.4, P(feet(0.14), hand(1, [0.3, 0.1, 0.5], [0, 0.2, 1], [1, -0.2, -0.3]), hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { pz: 0.05, hYaw: -0.1 })],
  ]),
};
/** the rap: stepping side to side, a fist pumping on every other beat */
S["hc-bounce"] = {
  len: 8,
  groove: 1,
  pose: keys(BASE, 4, [
    [0, P(pump(1, true), stepTouch(1, false)), "hit"],
    [1, P(pump(1, false), stepTouch(1, true))],
    [2, P(pump(-1, true), stepTouch(-1, false)), "hit"],
    [3, P(pump(-1, false), stepTouch(-1, true))],
  ]),
};
/** "小人物… 做英雄": small, the hands cupped low; then a fist up high, the hero */
S["hc-hero"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(feet(0.12), both(0.08, -0.36, 0.22), palms(-0.3, 1, 0.3), elbows(1, -0.3, -0.3), { py: -0.08, cPitch: 0.1 })],
    [3.4, P(feet(0.12), both(0.08, -0.36, 0.22), palms(-0.3, 1, 0.3), elbows(1, -0.3, -0.3), { py: -0.08, cPitch: 0.1 })],
    [4, P(feet(0.2), hand(1, [0.14, 0.58, 0.08], [0, 0.2, 1], [1, 0, -0.3]), hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { hPitch: -0.15 }), "hit"],
    [7.4, P(feet(0.2), hand(1, [0.14, 0.58, 0.08], [0, 0.2, 1], [1, 0, -0.3]), hand(-1, [0.215, -0.4, -0.01], [-1, 0, -0.3], [1, 0, -0.25]), { hPitch: -0.15 })],
  ]),
};

// ---------- 極楽浄土: the official dance video's moves (みうめ's choreography), the kimono sleeves wide

/** one arm out at the shoulder like a sleeve spread wide, the other hand at the chest, swaying that way */
const sleeve = (side: 1 | -1): Part => P(hand(side, [0.52, 0.02, 0.12], [0, -1, 0.3], [1, -0.1, -0.3]), hand(other(side), [0.04, -0.08, 0.22], [0, 0, -1], [1, -0.6, -0.1]), stepTouch(side, false), { roll: -0.05 * side, hRoll: 0.08 * side });
const WIDE: Part = P(both(0.52, 0.04, 0.12), palms(0, -1, 0.3), elbows(1, -0.1, -0.3));
const CROSSED_FRONT: Part = { hR: [-0.08, -0.08, 0.3], hL: [0.08, -0.06, 0.28], pR: [0, 0, 1], pL: [0, 0, 1], eR: [0.8, -0.6, -0.2], eL: [-0.8, -0.6, -0.2] };
const HEAD_HANDS: Part = P(both(0.18, 0.3, 0.12), palms(0, 0, 1), elbows(1, -0.1, -0.3));
/** a knee lifted high in front, the other leg standing */
const knee = (side: 1 | -1): Part => (side > 0 ? { fR: { x: 0.06, z: 0.14, lift: 0.3, pitch: -0.4 }, fL: { x: -0.1 }, py: 0.01 } : { fL: { x: -0.06, z: 0.14, lift: 0.3, pitch: -0.4 }, fR: { x: 0.1 }, py: 0.01 });
S["gj-sway"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, sleeve(1)],
    [2, sleeve(-1)],
  ]),
};
S["gj-step"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(WIDE, feet(0.15)), "hit"],
    [1, P(CROSSED_FRONT, feet(0.12)), "hit"],
    [2, P(HEAD_HANDS, knee(1)), "hit"],
    [3, P(WIDE, feet(0.15)), "hit"],
    [4, P(WIDE, feet(0.15)), "hit"],
    [5, P(CROSSED_FRONT, feet(0.12)), "hit"],
    [6, P(HEAD_HANDS, knee(-1)), "hit"],
    [7, P(WIDE, feet(0.15)), "hit"],
  ]),
};
/** turned to one side, walking, the hands fluttering at the sides like a butterfly's wings */
S["gj-butterfly"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0, P(both(0.34, -0.06, 0.02), palms(0, -1, 0.2), elbows(1, -0.3, -0.3), feet(0.1), { turn: 0.7 })],
    [3.5, P(both(0.34, -0.06, 0.02), palms(0, -1, 0.2), elbows(1, -0.3, -0.3), feet(0.1), { turn: 0.7 })],
    [4, P(both(0.34, -0.06, 0.02), palms(0, -1, 0.2), elbows(1, -0.3, -0.3), feet(0.1), { turn: -0.7 })],
    [7.5, P(both(0.34, -0.06, 0.02), palms(0, -1, 0.2), elbows(1, -0.3, -0.3), feet(0.1), { turn: -0.7 })],
  ]),
  extra: (p, o) => {
    // the wings flutter twice a beat; a step a beat
    const w = 0.07 * Math.sin(2 * TAU * p);
    o.hR = [o.hR[0], o.hR[1] + w, o.hR[2]];
    o.hL = [o.hL[0], o.hL[1] + w, o.hL[2]];
    const { i, f } = at(p);
    const foot = footOf(o, i % 2 === 0 ? 1 : -1);
    foot.lift += 0.05 * Math.sin(Math.PI * f);
  },
};
/** "ちょいと覗いて": a hand at the forehead, peeking out to one side, the other on the hip */
S["gj-peek"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(lookOut(1), { roll: -0.06 }), "snap"],
    [3.5, P(lookOut(1), { roll: -0.06 })],
    [4, P(lookOut(-1), { roll: 0.06 }), "snap"],
    [7.5, P(lookOut(-1), { roll: 0.06 })],
  ]),
};
/** "おいでませ": beckoning like a lucky cat, the right hand curling down by the face on every beat */
const beckon = (down: boolean): Part => P(hand(1, [0.2, down ? 0.12 : 0.2, 0.16], [0, down ? -1 : 0, down ? 0.4 : 1], [1, -0.4, -0.2]), hand(-1, [0.05, -0.1, 0.2], [0, 0, -1], [1, -0.6, -0.1]), feet(0.13), { hRoll: -0.08 });
S["gj-beckon"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 1, [
    [0, P(beckon(true), { px: 0.02 }), "hit"],
    [0.5, P(beckon(false), { px: -0.02 })],
  ]),
};
/** "歌えや歌え": a spin with the sleeves opening, a knee up, the hands by the head; again with the other knee */
S["gj-sing"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0.8, P(WIDE, feet(0.15)), "snap"],
    [2, P(HEAD_HANDS, knee(1)), "hit"],
    [3, P(WIDE, feet(0.15)), "hit"],
    [4, P(both(0.1, 0.12, 0.18), palms(0, 0, 1), elbows(1, -0.6, -0.1), feet(0.13)), "hit"],
    [6, P(HEAD_HANDS, knee(-1)), "hit"],
    [7, P(WIDE, feet(0.15)), "hit"],
  ]),
  extra: (p, o) => {
    // count 1: a whole turn to the left
    const { q } = at(p);
    if (q < 1) o.turn = -TAU * ease(q);
  },
};
/** "アナタの声を さぁ聞かせて": a hand cupped behind the ear, listening, then held out to you */
const LISTEN: Part = P(hand(1, [0.15, 0.12, -0.02], [-1, 0, 0.6], [1, -0.2, 0.1]), hand(-1, [0.05, -0.1, 0.2], [0, 0, -1], [1, -0.6, -0.1]), feet(0.14), { roll: -0.08, hRoll: -0.15, px: 0.04 });
const HOLD_OUT: Part = P(hand(1, [0.22, 0, 0.5], [0, 0.3, 1], [1, -0.3, -0.3]), hand(-1, [0.05, -0.1, 0.2], [0, 0, -1], [1, -0.6, -0.1]), feet(0.14), { pz: 0.04 });
S["gj-voice"] = {
  len: 8,
  groove: 0.5,
  pose: keys(BASE, 8, [
    [0, LISTEN, "snap"],
    [3.5, LISTEN],
    [4, HOLD_OUT, "snap"],
    [5.5, HOLD_OUT],
    [6, LISTEN, "snap"],
    [7.5, LISTEN],
  ]),
};
/** "踊れや踊れ": the arms up, then a knee up with the arms out wide, one side then the other */
const V_UP: Part = P(both(0.4, 0.5, 0.1), palms(0, 0.2, 1), elbows(1, 0.2, -0.3));
S["gj-dance"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, P(V_UP, feet(0.15)), "hit"],
    [1, P(WIDE, knee(1)), "hit"],
    [2, P(V_UP, feet(0.15)), "hit"],
    [3, P(WIDE, knee(-1)), "hit"],
  ]),
};
/** "今宵共に あゝ狂い咲き": the hands together at the chest like a bud, opening up into a flower over the head */
const BUD: Part = P({ hR: [0.03, -0.04, 0.24], hL: [-0.03, -0.04, 0.24], pR: [-0.6, 0.5, 0.6], pL: [0.6, 0.5, 0.6], eR: [0.9, -0.5, -0.2], eL: [-0.9, -0.5, -0.2] }, feet(0.13), { py: -0.05 });
S["gj-bloom"] = {
  len: 8,
  groove: 0.4,
  pose: keys(BASE, 8, [
    [0, BUD, "snap"],
    [1.5, BUD],
    [3.5, P(V_UP, feet(0.17), { hPitch: -0.15 })],
    [4, P(WIDE, feet(0.17), { px: 0.05, roll: -0.05 })],
    [5, P(WIDE, feet(0.17), { px: -0.05, roll: 0.05 })],
    [6, P(V_UP, feet(0.17))],
    [7.6, P(V_UP, feet(0.17))],
  ]),
};

export const PARTY_ANIMS: Record<string, MoveAnim> = S;
