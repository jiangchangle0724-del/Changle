// The 20 moves of games/dance/data/moves.json as the coach dances them, each a loop of key frames on
// the beat (pose.ts). `p` is the beat position in the move's 8-count: 0 is count 1, 7.5 is halfway
// through count 8. A key at a whole beat is where the body is ON that count; "hit" keys land hard
// on it (claps, punches, arms flung up), "snap" ones get there early and hold.
//
// The moves are mirrored for the room (pose.ts): "step to the screen's left" is the players' left.
import { BASE, groove, keys, over, type Part, type Pose, type V3 } from "./pose";

/** Both hands, the screen-left one mirrored. */
const both = (x: number, y: number, z: number): Part => ({ hR: [x, y, z], hL: [-x, y, z] });
const palms = (x: number, y: number, z: number): Part => ({ pR: [x, y, z], pL: [-x, y, z] });
const elbows = (x: number, y: number, z: number): Part => ({ eR: [x, y, z], eL: [-x, y, z] });
const P = (...parts: Part[]): Part => Object.assign({}, ...parts) as Part;

// hands
const CLAP = P(both(0.034, -0.1, 0.3), palms(-1, 0, 0), elbows(0.7, -0.7, -0.3));
const APART = P(both(0.17, -0.11, 0.3), palms(-1, 0, 0.2), elbows(0.7, -0.7, -0.3));
const OPEN_LOW = P(both(0.5, -0.24, 0.14), palms(0, 0.3, 1), elbows(1, -0.5, -0.4));
const OPEN_MID = P(both(0.27, -0.16, 0.22), palms(-0.4, 0, 1), elbows(0.8, -0.8, -0.3));
const UP = P(both(0.21, 0.54, 0.08), palms(-0.3, 0, 1), elbows(1, 0, -0.3));
const AT_SHOULDERS = P(both(0.25, -0.03, 0.12), palms(0, 0.2, 1), elbows(0.5, -1, -0.2));
const DOWN = P(both(0.23, -0.48, 0.08), palms(-1, 0, 0.2), elbows(0.5, -0.3, -1));
const AKIMBO = P(both(0.215, -0.4, -0.01), palms(-1, 0, -0.3), elbows(1, 0, -0.25));
const GUARD = P(both(0.12, -0.13, 0.24), palms(-1, 0, 0), elbows(0.6, -1, -0.2));

export interface MoveAnim {
  /** beats per loop of its key frames */
  len: number;
  pose: (p: number) => Pose;
  /** how much of the beat's bounce goes on top (0 to 1) */
  groove: number;
  /** what else moves between the key frames (twirls, rolls, a marching foot) */
  extra?: (p: number, pose: Pose) => void;
}

const add = (v: V3, x: number, y: number, z: number): V3 => [v[0] + x, v[1] + y, v[2] + z];

const A: Record<string, MoveAnim> = {};

A["clap-2x"] = {
  len: 8,
  groove: 0.8,
  pose: keys(BASE, 8, [
    [0, P(CLAP, { cPitch: 0.06 }), "hit"],
    [0.5, APART],
    [1, P(CLAP, { cPitch: 0.06 }), "hit"],
    [2, P(OPEN_LOW, { cPitch: -0.05, hPitch: -0.08 }), "snap"],
    [3.5, OPEN_LOW],
    [3.75, APART],
    [4, P(CLAP, { cPitch: 0.06 }), "hit"],
    [4.5, APART],
    [5, P(CLAP, { cPitch: 0.06 }), "hit"],
    [6, P(OPEN_LOW, { cPitch: -0.05, hPitch: -0.08 }), "snap"],
    [7.5, OPEN_LOW],
    [7.75, APART],
  ]),
};

A["raise-arms"] = {
  len: 2,
  groove: 0.7,
  pose: keys(BASE, 2, [
    [0, P(UP, { cPitch: -0.07, hPitch: -0.14 }), "hit"],
    [1, AT_SHOULDERS],
  ]),
};

A["side-wave"] = {
  len: 4,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, P(palms(0, 0, 1), elbows(1, 0, -0.3), { hR: [0.06, 0.52, 0.1], hL: [-0.36, 0.44, 0.1], cRoll: 0.14, roll: -0.05, px: 0.03, hRoll: 0.08 }), "snap"],
    [1, P(UP, palms(0, 0, 1))],
    [2, P(palms(0, 0, 1), elbows(1, 0, -0.3), { hR: [0.36, 0.44, 0.1], hL: [-0.06, 0.52, 0.1], cRoll: -0.14, roll: 0.05, px: -0.03, hRoll: -0.08 }), "snap"],
    [3, P(UP, palms(0, 0, 1))],
  ]),
};

A["handkerchief-flower"] = {
  len: 2,
  groove: 0.6,
  pose: keys(BASE, 2, [
    [0, P(palms(0, -0.3, 1), elbows(1, -0.4, -0.3), { hR: [0.46, 0.2, 0.2], hL: [-0.4, -0.2, 0.24], cYaw: 0.12, hYaw: 0.1, hankyOn: 1 })],
    [1, P(palms(0, -0.3, 1), elbows(1, -0.4, -0.3), { hR: [0.4, -0.2, 0.24], hL: [-0.46, 0.2, 0.2], cYaw: -0.12, hYaw: -0.1, hankyOn: 1 })],
  ]),
  extra: (p, o) => {
    const a = 2 * Math.PI * p;
    o.hanky = a * 1.5;
    o.hR = add(o.hR, 0.045 * Math.cos(a), 0.045 * Math.sin(a), 0);
    o.hL = add(o.hL, -0.045 * Math.cos(a), 0.045 * Math.sin(a), 0);
  },
};

A["shoulder-roll"] = {
  len: 2,
  groove: 0.35,
  pose: keys(BASE, 2, [
    [0, P(DOWN, { hRoll: 0.04 })],
    [1, P(DOWN, { hRoll: -0.04 })],
  ]),
  extra: (p, o) => {
    // backwards: forward, up, back, down, once every two beats
    const a = Math.PI * p;
    const up = 0.05 * Math.sin(a);
    const fwd = 0.05 * Math.cos(a);
    o.sR = [up, fwd];
    o.sL = [up, fwd];
  },
};

A["forward-push"] = {
  len: 2,
  groove: 0.7,
  pose: keys(BASE, 2, [
    // (pushed a little up and out as well as forward: from the front, the arms straightening shows)
    [0, P(both(0.21, 0.03, 0.5), palms(0, 0.25, 1), elbows(0.7, -0.7, -0.1), { cPitch: 0.06, pz: 0.03 }), "hit"],
    [1, P(both(0.15, -0.16, 0.12), palms(0, 0.25, 1), elbows(0.6, -1, -0.3))],
  ]),
};

A["open-arms"] = {
  len: 2,
  groove: 0.6,
  pose: keys(BASE, 2, [
    [0, P(both(0.7, 0.02, -0.04), palms(0, 0, 1), elbows(0, -1, -0.4), { cPitch: -0.09, hPitch: -0.09 }), "hit"],
    [1, P(both(0.1, -0.02, 0.3), palms(0, -1, 0.2), elbows(1, 0.15, 0))],
  ]),
};

A["alternating-reach"] = {
  len: 4,
  groove: 0.7,
  pose: keys(BASE, 4, [
    [0, P(palms(-0.3, 0, 1), { hR: [0.2, 0.56, 0.1], hL: [-0.24, -0.46, 0.08], eR: [1, 0, -0.3], cRoll: 0.07, hYaw: 0.15, hPitch: -0.14 }), "hit"],
    [1, AT_SHOULDERS],
    [2, P(palms(-0.3, 0, 1), { hR: [0.24, -0.46, 0.08], hL: [-0.2, 0.56, 0.1], eL: [-1, 0, -0.3], cRoll: -0.07, hYaw: -0.15, hPitch: -0.14 }), "hit"],
    [3, AT_SHOULDERS],
  ]),
};

A["side-step-touch"] = {
  len: 4,
  groove: 1,
  pose: keys(BASE, 4, [
    // count 1: the screen-left foot steps out; 2: the other touches beside it (and a clap there)
    [0, { fL: { x: -0.21 }, fR: { x: 0.21 }, px: -0.07, hR: [0.0, -0.26, 0.28], hL: [-0.38, -0.3, 0.16], cYaw: -0.08 }, "snap"],
    [1, P(palms(-1, 0, 0), { fL: { x: -0.21 }, fR: { x: -0.09 }, px: -0.15, hR: [-0.12, -0.15, 0.3], hL: [-0.19, -0.15, 0.3], eR: [0.7, -0.7, -0.3], eL: [-0.7, -0.7, -0.3], cYaw: -0.16 }), "hit"],
    [2, { fL: { x: -0.21 }, fR: { x: 0.21 }, px: 0.07, hR: [0.38, -0.3, 0.16], hL: [0.0, -0.26, 0.28], cYaw: 0.08 }, "snap"],
    [3, P(palms(-1, 0, 0), { fL: { x: 0.09 }, fR: { x: 0.21 }, px: 0.15, hR: [0.19, -0.15, 0.3], hL: [0.12, -0.15, 0.3], eR: [0.7, -0.7, -0.3], eL: [-0.7, -0.7, -0.3], cYaw: 0.16 }), "hit"],
  ]),
};

A["march-clap"] = {
  len: 2,
  groove: 0.8,
  pose: keys(BASE, 2, [
    [0, P(OPEN_MID, { px: 0.025 }), "snap"],
    [1, P(CLAP, { px: -0.025 }), "hit"],
  ]),
  extra: (p, o) => {
    // a foot comes up between the beats and down on the next one: the screen-left on 1 to 2, the other on 2 to 3
    const f = p - Math.floor(p);
    const up = Math.sin(Math.PI * f);
    const foot = Math.floor(p) % 2 === 0 ? o.fL : o.fR;
    foot.lift += 0.13 * up;
    foot.z += 0.05 * up;
    foot.pitch -= 0.25 * up;
  },
};

A["cross-step"] = {
  len: 4,
  groove: 0.8,
  pose: keys(BASE, 4, [
    // 1: the screen-right foot crosses in front; 2: the other steps back; 3: the first out to the side; 4: the other back in front
    [0, P(both(0.26, -0.34, 0.16), { fR: { x: -0.05, z: 0.17, yaw: -0.2 }, fL: { x: -0.12, z: 0 }, px: -0.03, pz: 0.05, cYaw: -0.12, yaw: -0.08 }), "snap"],
    [1, P(both(0.26, -0.34, 0.16), { fR: { x: -0.05, z: 0.17, yaw: -0.2 }, fL: { x: -0.17, z: -0.2 }, pz: -0.04, cYaw: 0 }), "snap"],
    [2, P(both(0.26, -0.34, 0.16), { fR: { x: 0.15, z: -0.02 }, fL: { x: -0.17, z: -0.2 }, px: 0.04, cYaw: 0.1 }), "snap"],
    [3, P(both(0.26, -0.34, 0.16), { fR: { x: 0.13, z: 0 }, fL: { x: -0.12, z: 0 } }), "snap"],
  ]),
};

A["yangge-twist"] = {
  len: 4,
  groove: 0.9,
  pose: keys(BASE, 4, [
    [0, P(palms(0, -0.3, 1), { fR: { x: 0.12, z: 0.2 }, yaw: -0.22, roll: 0.06, cYaw: 0.12, hR: [0.12, 0.18, 0.36], hL: [-0.34, -0.36, -0.02], eR: [1, -0.6, 0], eL: [-0.6, -0.2, -1], hankyOn: 1 }), "snap"],
    [1, P(palms(0, -0.3, 1), { hR: [0.26, -0.16, 0.22], hL: [-0.26, -0.16, 0.22], hankyOn: 1 })],
    [2, P(palms(0, -0.3, 1), { fL: { x: -0.12, z: 0.2 }, yaw: 0.22, roll: -0.06, cYaw: -0.12, hL: [-0.12, 0.18, 0.36], hR: [0.34, -0.36, -0.02], eL: [-1, -0.6, 0], eR: [0.6, -0.2, -1], hankyOn: 1 }), "snap"],
    [3, P(palms(0, -0.3, 1), { hR: [0.26, -0.16, 0.22], hL: [-0.26, -0.16, 0.22], hankyOn: 1 })],
  ]),
  extra: (p, o) => {
    o.hanky = 2 * Math.PI * p * 1.5;
  },
};

A["heel-tap"] = {
  len: 4,
  groove: 0.7,
  pose: keys(BASE, 4, [
    [0, P(AKIMBO, { fR: { x: 0.16, z: 0.3, pitch: 0.7, lift: 0.025 }, pz: -0.03, cPitch: -0.04, cYaw: 0.1, hYaw: 0.08 }), "snap"],
    [1, AKIMBO],
    [2, P(AKIMBO, { fL: { x: -0.16, z: 0.3, pitch: 0.7, lift: 0.025 }, pz: -0.03, cPitch: -0.04, cYaw: -0.1, hYaw: -0.08 }), "snap"],
    [3, AKIMBO],
  ]),
};

A["v-step"] = {
  len: 4,
  groove: 0.9,
  pose: keys(BASE, 4, [
    // out, out (a V with the feet and the arms), in, in
    [0, P(palms(0, 0, 1), { fR: { x: 0.3, z: 0.24, yaw: 0.3 }, hR: [0.46, 0.42, 0.12], eR: [1, 0, -0.3], hL: [-0.23, -0.48, 0.08], pz: 0.06, py: -0.03 }), "snap"],
    [1, P(palms(0, 0, 1), { fR: { x: 0.3, z: 0.24, yaw: 0.3 }, fL: { x: -0.3, z: 0.24, yaw: -0.3 }, hR: [0.46, 0.42, 0.12], hL: [-0.46, 0.42, 0.12], eR: [1, 0, -0.3], eL: [-1, 0, -0.3], pz: 0.12, py: -0.05 }), "snap"],
    [2, P(palms(0, 0, 1), { fL: { x: -0.3, z: 0.24, yaw: -0.3 }, hR: [0.23, -0.48, 0.08], hL: [-0.46, 0.42, 0.12], eL: [-1, 0, -0.3], pz: 0.06, py: -0.03 }), "snap"],
    [3, DOWN, "snap"],
  ]),
};

A["step-knee-lift"] = {
  len: 4,
  groove: 0.9,
  pose: keys(BASE, 4, [
    [0, P(UP, { fR: { x: 0.18 }, fL: { x: -0.18 }, px: 0.08 }), "snap"],
    [1, P(palms(0, -1, 0.3), { fR: { x: 0.18 }, fL: { x: -0.05, z: 0.2, lift: 0.36, pitch: -0.25 }, px: 0.1, hR: [-0.03, -0.5, 0.32], hL: [-0.13, -0.5, 0.32], eR: [0.8, -0.2, -0.4], eL: [-0.8, -0.2, -0.4], cPitch: 0.16, hPitch: 0.1 }), "hit"],
    [2, P(UP, { fR: { x: 0.18 }, fL: { x: -0.18 }, px: -0.08 }), "snap"],
    [3, P(palms(0, -1, 0.3), { fL: { x: -0.18 }, fR: { x: 0.05, z: 0.2, lift: 0.36, pitch: -0.25 }, px: -0.1, hR: [0.13, -0.5, 0.32], hL: [0.03, -0.5, 0.32], eR: [0.8, -0.2, -0.4], eL: [-0.8, -0.2, -0.4], cPitch: 0.16, hPitch: 0.1 }), "hit"],
  ]),
};

const swayL = (arms: Part): Part => P(arms, { px: -0.08, roll: 0.07, cRoll: 0.1, fR: { x: 0.2, pitch: -0.3, lift: 0.03 }, fL: { x: -0.2 } });
const swayR = (arms: Part): Part => P(arms, { px: 0.08, roll: -0.07, cRoll: -0.1, fL: { x: -0.2, pitch: -0.3, lift: 0.03 }, fR: { x: 0.2 } });
A["eight-step-sway"] = {
  len: 8,
  groove: 0.9,
  pose: keys(BASE, 8, [
    [0, swayL(P(palms(0, 0, 1), elbows(1, 0, -0.3), { hR: [0.04, 0.5, 0.1], hL: [-0.38, 0.42, 0.1] })), "snap"],
    [1, swayR(P(palms(0, 0, 1), elbows(1, 0, -0.3), { hR: [0.38, 0.42, 0.1], hL: [-0.04, 0.5, 0.1] })), "snap"],
    [2, swayL(P(palms(0, 0, 1), elbows(1, 0, -0.3), { hR: [0.04, 0.5, 0.1], hL: [-0.38, 0.42, 0.1] })), "snap"],
    [3, swayR(P(palms(0, 0, 1), elbows(1, 0, -0.3), { hR: [0.38, 0.42, 0.1], hL: [-0.04, 0.5, 0.1] })), "snap"],
    [4, swayL({ hR: [-0.04, -0.3, 0.3], hL: [-0.4, -0.34, 0.12] }), "snap"],
    [5, swayR({ hR: [0.4, -0.34, 0.12], hL: [0.04, -0.3, 0.3] }), "snap"],
    [6, swayL({ hR: [-0.04, -0.3, 0.3], hL: [-0.4, -0.34, 0.12] }), "snap"],
    [7, P(CLAP, { fR: { x: 0.2 }, fL: { x: -0.2 } }), "hit"],
  ]),
};

A["kemusan-hand-twirl"] = {
  len: 4,
  groove: 1,
  pose: keys(BASE, 4, [
    [0, { cYaw: -0.16, px: 0.04, fR: { x: 0.14 }, fL: { x: -0.18 }, hYaw: -0.12 }],
    [1.6, { cYaw: -0.16, px: 0.04, fR: { x: 0.14 }, fL: { x: -0.18 }, hYaw: -0.12 }],
    [2, { cYaw: 0.16, px: -0.04, fR: { x: 0.18 }, fL: { x: -0.14 }, hYaw: 0.12 }, "snap"],
    [3.6, { cYaw: 0.16, px: -0.04, fR: { x: 0.18 }, fL: { x: -0.14 }, hYaw: 0.12 }],
  ]),
  extra: (p, o) => {
    // the hands roll round each other, once a beat, on the side the body turns to; the free foot flicks out
    const side = p % 4 < 2 ? -1 : 1;
    const c: V3 = [0.2 * side, -0.2, 0.26];
    const a = 2 * Math.PI * p;
    const r = 0.075;
    o.hR = [c[0] + 0.05, c[1] + r * Math.sin(a), c[2] + r * Math.cos(a)];
    o.hL = [c[0] - 0.05, c[1] + r * Math.sin(a + Math.PI), c[2] + r * Math.cos(a + Math.PI)];
    o.pR = [-0.6 * Math.cos(a), -0.6, 0.8];
    o.pL = [0.6 * Math.cos(a), -0.6, 0.8];
    o.eR = [0.8, -0.8, -0.2];
    o.eL = [-0.8, -0.8, -0.2];
    const f = p - Math.floor(p);
    const kick = Math.sin(Math.PI * f);
    if (Math.floor(p) % 2 === 0) {
      o.fR.x += 0.1 * kick;
      o.fR.lift += 0.06 * kick;
    } else {
      o.fL.x -= 0.1 * kick;
      o.fL.lift += 0.06 * kick;
    }
  },
};

const OUT = P(both(0.6, -0.06, 0.05), palms(0, 0, 1), elbows(0, -1, -0.4));
const IN = P(both(0.1, -0.12, 0.2), palms(-1, 0, 0), elbows(0.6, -1, -0.2));
const SPIN = 2 * Math.PI;
A["grapevine-turn"] = {
  len: 8,
  groove: 0.7,
  pose: keys(BASE, 8, [
    // to the screen's right: side, behind, side and turn, together (a clap); then back to the left
    [0, P(OUT, { fR: { x: 0.06 }, fL: { x: -0.24 }, px: -0.09 }), "snap"],
    [1, P(OUT, { fR: { x: 0.06 }, fL: { x: 0.12, z: -0.12 }, px: 0.09 }), "snap"],
    [2, P(IN, { fR: { x: 0.26 }, fL: { x: 0.12, z: -0.12 }, px: 0.19 }), "snap"],
    [3, P(CLAP, { fR: { x: 0.26, yaw: 0.14 - SPIN }, fL: { x: 0.14, z: 0, yaw: -0.14 - SPIN }, px: 0.2, yaw: -SPIN }), "hit"],
    [4, P(OUT, { fL: { x: -0.06, yaw: -0.14 - SPIN }, fR: { x: 0.24, yaw: 0.14 - SPIN }, px: 0.09, yaw: -SPIN }), "snap"],
    [5, P(OUT, { fL: { x: -0.06, yaw: -0.14 - SPIN }, fR: { x: -0.12, z: -0.12, yaw: 0.14 - SPIN }, px: -0.09, yaw: -SPIN }), "snap"],
    [6, P(IN, { fL: { x: -0.26, yaw: -0.14 - SPIN }, fR: { x: -0.12, z: -0.12, yaw: 0.14 - SPIN }, px: -0.19, yaw: -SPIN }), "snap"],
    [7, P(CLAP, { fL: { x: -0.26 }, fR: { x: -0.14, z: 0 }, px: -0.2, yaw: 0 }), "hit"],
  ]),
};

A["squat-reach"] = {
  len: 4,
  groove: 0.6,
  pose: keys(BASE, 4, [
    [0, P(both(0.16, -0.12, 0.46), palms(0, -1, 0.2), elbows(0.5, -1, 0), { py: -0.27, pz: -0.05, pitch: 0.32, cPitch: 0.14, fR: { x: 0.2, yaw: 0.3 }, fL: { x: -0.2, yaw: -0.3 } }), "snap"],
    [1, P(UP, { py: 0.01, cPitch: -0.06, hPitch: -0.14, fR: { x: 0.2, yaw: 0.3 }, fL: { x: -0.2, yaw: -0.3 } }), "hit"],
    [2, P(DOWN, { fR: { x: 0.2, yaw: 0.3 }, fL: { x: -0.2, yaw: -0.3 } })],
    [3.4, P(DOWN, { fR: { x: 0.2, yaw: 0.3 }, fL: { x: -0.2, yaw: -0.3 } })],
  ]),
};

A["side-lunge-punch"] = {
  len: 8,
  groove: 0.6,
  pose: keys(BASE, 8, [
    [0, P(GUARD, { fR: { x: 0.48, yaw: 0.45 }, fL: { x: -0.16 }, px: 0.17, py: -0.15, cYaw: 0.22, hYaw: 0.2 }), "snap"],
    [1, P(GUARD, { fR: { x: 0.48, yaw: 0.45 }, fL: { x: -0.16 }, px: 0.17, py: -0.15, cYaw: 0.32, hYaw: 0.25, hR: [0.64, -0.03, 0.2], pR: [0, -1, 0], eR: [1, 0, -0.5] }), "hit"],
    [2, GUARD],
    [3, GUARD],
    [4, P(GUARD, { fL: { x: -0.48, yaw: -0.45 }, fR: { x: 0.16 }, px: -0.17, py: -0.15, cYaw: -0.22, hYaw: -0.2 }), "snap"],
    [5, P(GUARD, { fL: { x: -0.48, yaw: -0.45 }, fR: { x: 0.16 }, px: -0.17, py: -0.15, cYaw: -0.32, hYaw: -0.25, hL: [-0.64, -0.03, 0.2], pL: [0, -1, 0], eL: [-1, 0, -0.5] }), "hit"],
    [6, GUARD],
    [7, GUARD],
  ]),
};

/** The count-in and the metronome: a clap on every beat. */
const CLAPPING: MoveAnim = {
  len: 1,
  groove: 1,
  pose: keys(BASE, 1, [
    [0, CLAP, "hit"],
    [0.5, APART],
  ]),
};

/** The results: arms up, cheering. */
const CHEER: MoveAnim = {
  len: 2,
  groove: 1,
  pose: keys(BASE, 2, [
    [0, P(UP, palms(0, 0, 1), { hR: [0.3, 0.52, 0.1], hL: [-0.24, 0.5, 0.12], cRoll: 0.06, py: 0.01 }), "snap"],
    [1, P(UP, palms(0, 0, 1), { hR: [0.24, 0.5, 0.12], hL: [-0.3, 0.52, 0.1], cRoll: -0.06, py: 0.01 }), "snap"],
  ]),
};

export const moveAnim = (id: string): MoveAnim | null => A[id] ?? null;
export const animatedMoves = () => Object.keys(A);

export type Doing = { kind: "move"; id: string } | { kind: "clap" } | { kind: "cheer" } | { kind: "idle" };

/**
 * The coach's pose: dancing `doing` at beat position `p` (in its 8-count; `frac` how far through the
 * beat), or standing by (idle: `secs` is the page's clock).
 */
export function poseOf(doing: Doing, p: number, secs: number): Pose {
  if (doing.kind === "idle") return idle(secs);
  const anim = doing.kind === "move" ? (A[doing.id] ?? CLAPPING) : doing.kind === "cheer" ? CHEER : CLAPPING;
  const o = anim.pose(p);
  anim.extra?.(p, o);
  return groove(o, p - Math.floor(p), anim.groove);
}

/** Standing by: breathing, a little sway, a wave now and then. */
function idle(secs: number): Pose {
  const o = over(BASE, {});
  const s = Math.sin((2 * Math.PI * secs) / 4);
  o.py = -0.006 + 0.006 * s;
  o.cPitch = -0.01 * s;
  o.roll = 0.015 * Math.sin((2 * Math.PI * secs) / 7);
  o.hYaw = 0.12 * Math.sin((2 * Math.PI * secs) / 9);
  // every 8 s, a two-second wave with the screen-right hand
  const w = secs % 8;
  if (w < 2) {
    const up = Math.sin((Math.PI * w) / 2);
    const wag = Math.sin(2 * Math.PI * w * 1.6) * up;
    o.hR = [0.23 + 0.2 * up + 0.06 * wag, -0.5 + 0.95 * up, 0.06 + 0.08 * up];
    o.pR = [-0.3, 0, 1];
    o.eR = [1, -0.6 * (1 - up), -0.4];
    o.hRoll = -0.06 * up;
  }
  return o;
}
