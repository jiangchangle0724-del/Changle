// The moves written for the figure (no outside clips): key poses in time, in rig.ts's terms.
// Character space: metres, x = its left, y = up, z = forward; "chest" = Spine2, "head" = Head.
// Times in seconds; `add` lays a little life (breathing, sobbing) over the keys.
import { over, type Clip } from "./anim";
import type { PoseSpec, V3 } from "./rig";

type P = PoseSpec;

const at = (frame: string, p: V3) => ({ frame, p });
const ch = (p: V3) => at("char", p);
const cs = (p: V3) => at("chest", p);
const hd = (p: V3) => at("head", p);
const dir = (frame: string, d: V3) => ({ frame, d });
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as V3;
};
const add3 = (a: V3, b: V3, k = 1): V3 => a.map((x, i) => x + b[i] * k) as V3;

/** standing at ease: arms down, a soft knee */
export const BASE: P = {
  hips: { pos: [0, -0.012, 0], yaw: 0, pitch: 0, roll: 0 },
  spine: { bend: 2, side: 0, twist: 0 },
  head: { nod: 2, turn: 0, tilt: 0 },
  L: { clav: { up: 0, fwd: 0 }, hand: cs([0.205, -0.37, 0.05]), pole: dir("chest", [0.3, 0, -1]), fingers: "relaxed" },
  R: { clav: { up: 0, fwd: 0 }, hand: cs([-0.205, -0.37, 0.05]), pole: dir("chest", [-0.3, 0, -1]), fingers: "relaxed" },
  legL: { foot: ch([0.095, 0.126, -0.077]), pole: dir("hips", [0.1, 0, 1]) },
  legR: { foot: ch([-0.095, 0.126, -0.077]), pole: dir("hips", [-0.1, 0, 1]) },
};

/** breathing: k breaths over the loop */
const breathe = (amp = 1) => (t: number, pose: P, dur: number): P => {
  const k = Math.max(1, Math.round(dur / 3));
  const w = Math.sin((2 * Math.PI * k * t) / dur);
  return over(pose, {
    spine: { bend: (pose.spine?.bend ?? 0) + 1.3 * amp * w },
    L: { clav: { up: (pose.L?.clav?.up ?? 0) + 0.9 * amp * w } },
    R: { clav: { up: (pose.R?.clav?.up ?? 0) + 0.9 * amp * w } },
  });
};

// ---------------------------------------------------------------- 摆酷 cool: arms crossed, leaning back, shades; pushes them up
const crossed = (turn: number, nod: number): P => ({
  hips: { pos: [-0.035, -0.02, 0], roll: 3 },
  spine: { bend: -4, side: 2 },
  head: { nod, turn, tilt: -3 },
  // the left forearm low against the body, its hand round the right arm; the right forearm over it, its hand tucked under the left arm
  L: { hand: cs([-0.1, -0.17, 0.21]), pole: dir("chest", [1, -0.8, 0.1]), orient: { frame: "chest", fingers: [-1, 0.05, -0.45], palm: [-0.2, 0.3, -1] }, fingers: "cup" },
  R: { hand: cs([0.1, -0.11, 0.27]), pole: dir("chest", [-1, -0.8, 0.1]), orient: { frame: "chest", fingers: [1, 0.05, -0.55], palm: [0.1, -0.2, -1] }, fingers: "cup" },
  legL: { foot: ch([0.16, 0.135, 0.03]), pole: dir("hips", [0.4, 0, 1]), footYaw: 18 },
});
const pushShades = (lift: number): P =>
  over(crossed(2, 2), {
    head: { nod: 4 - lift * 300, turn: 0, tilt: 0 },
    R: { hand: hd([-0.065, -0.085 + lift, 0.2]), pole: dir("chest", [-1, -0.8, 0]), orient: { frame: "head", fingers: [0.3, 0.9, -0.3], palm: [0.1, -0.25, -1] }, fingers: "point" },
  });

// ---------------------------------------------------------------- 照相 selfie: phone up, a V by the face, flash; then hand on hip, flash; then look at it
const lookAtPhone = (nod: number): P => ({
  spine: { bend: 6 },
  head: { nod, turn: -8, tilt: 4 },
  R: { grip: ch([-0.13, 1.2, 0.3]), pole: dir("chest", [-1, -0.6, -0.4]), orient: { frame: "char", thumb: [0.1, 0.45, 0.88], palm: [0.25, 0.85, -0.45] }, fingers: "phone" },
  L: { hand: ch([0.04, 1.14, 0.3]), pole: dir("chest", [1, -0.6, -0.4]), orient: { frame: "char", fingers: [-0.4, 0.3, 0.85], palm: [-0.4, 0.8, -0.3] }, fingers: "relaxed" },
});
const selfieA: P = {
  hips: { pos: [0.02, -0.03, 0], roll: -3 },
  spine: { bend: 0, side: -3 },
  head: { look: ch([-0.25, 1.74, 0.52]), tilt: 13 },
  R: { grip: ch([-0.25, 1.72, 0.52]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "char", thumb: [0.1, 0.95, -0.1], palm: [0.6, -0.12, -0.78] }, fingers: "phone" },
  L: { hand: ch([0.12, 1.56, 0.19]), pole: dir("chest", [1, -0.8, -0.3]), orient: { frame: "char", fingers: [-0.18, 1, 0.08], palm: [-0.45, 0.15, 0.88] }, fingers: "v" },
  legL: { foot: ch([0.13, 0.13, -0.03]), footYaw: 10 },
};
const selfieB: P = {
  hips: { pos: [0.05, -0.02, 0], roll: -5, yaw: -6 },
  spine: { bend: -2, side: 4 },
  head: { look: ch([-0.27, 1.72, 0.5]), tilt: -9 },
  R: { grip: ch([-0.27, 1.7, 0.5]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "char", thumb: [0.15, 0.95, -0.05], palm: [0.6, -0.1, -0.78] }, fingers: "phone" },
  L: { hand: ch([0.24, 1.02, 0.02]), pole: dir("chest", [1, 0.1, -0.6]), orient: { frame: "char", fingers: [-0.3, -0.75, 0.6], palm: [-1, 0.1, -0.3] }, fingers: "relaxed" },
  legR: { foot: ch([-0.15, 0.13, 0.0]), footYaw: -14 },
};

// ---------------------------------------------------------------- 睡觉 sleep: a yawn and a stretch, down, curled on its side, hands under the cheek
const yawn: P = {
  spine: { bend: -9 },
  head: { nod: -18 },
  L: { clav: { up: 18 }, hand: ch([0.11, 2.0, 0.0]), pole: dir("chest", [1, 0.2, -0.4]), orient: { frame: "char", fingers: [-0.2, 1, 0.1], palm: [0, 0.1, 1] }, fingers: "open" },
  R: { clav: { up: 18 }, hand: ch([-0.11, 2.0, 0.0]), pole: dir("chest", [-1, 0.2, -0.4]), orient: { frame: "char", fingers: [0.2, 1, 0.1], palm: [0, 0.1, 1] }, fingers: "open" },
};
const crouch: P = {
  hips: { pos: [0, -0.43, 0.02], pitch: 18 },
  spine: { bend: 24 },
  head: { nod: -10 },
  L: { hand: ch([0.24, 0.42, 0.42]), pole: dir("chest", [1, 0, -0.4]), fingers: "relaxed" },
  R: { hand: ch([-0.2, 0.36, 0.45]), pole: dir("chest", [-1, 0, -0.4]), fingers: "relaxed" },
  legL: { foot: ch([0.12, 0.126, -0.06]), pole: dir("char", [0.3, 0, 1]) },
  legR: { foot: ch([-0.12, 0.126, -0.09]), pole: dir("char", [-0.3, 0, 1]) },
};
// lying on its right side: in the hips' own terms +y runs to the head, -y to the feet, +z forward, +x up off the floor
const hp = (p: V3) => at("hips", p);
const lying = (breath: number): P => ({
  hips: { pos: [0.0, -0.835, -0.02], roll: 90, yaw: -28 },
  spine: { bend: 20 + breath * 2.5, side: 0, twist: 4 },
  head: { nod: 18, tilt: -14, turn: 0 },
  // the upper arm lies along the body, its hand on the floor in front of the chest; the other under the cheek
  L: { clav: { up: 4 + breath * 2 }, hand: hp([-0.09, 0.4, 0.33]), pole: dir("hips", [0.6, -0.3, 0.75]), orient: { frame: "hips", fingers: [-0.1, 0.35, 1], palm: [-1, 0, 0.1] }, fingers: "relaxed" },
  R: { hand: hp([-0.115, 0.535, 0.21]), pole: dir("hips", [-0.3, -0.4, 1]), orient: { frame: "hips", fingers: [0, 1, 0.1], palm: [1, 0, 0] }, fingers: "flat" },
  legL: { foot: hp([0.09, -0.52, 0.27]), pole: dir("hips", [0.3, 0, 1]), footDir: { frame: "hips", d: [0, -0.45, 0.9] } },
  legR: { foot: hp([-0.09, -0.54, 0.32]), pole: dir("hips", [-0.2, 0, 1]), footDir: { frame: "hips", d: [0, -0.45, 0.9] } },
});

// ---------------------------------------------------------------- 挥刀 sword: two hands on the hilt, raise, a diagonal cut, hold, back
/** both hands on the hilt: the right by the guard, the left below; the blade along `b` */
const hilt = (grip: V3, b: V3, palmR: V3, palmL: V3, frame = "char"): P => ({
  R: { grip: at(frame, grip), orient: { frame, thumb: b, palm: palmR }, fingers: "grip" },
  L: { grip: at(frame, add3(grip, norm(b), -0.105)), orient: { frame, thumb: b, palm: palmL }, fingers: "grip" },
});
const stance = (extra: P = {}): P =>
  over(
    {
      hips: { pos: [0, -0.075, 0.02], yaw: 8 },
      spine: { bend: 4 },
      head: { nod: 4, turn: -6 },
      legL: { foot: ch([0.15, 0.126, 0.17]), pole: dir("hips", [0.3, 0, 1]), footYaw: 10 },
      legR: { foot: ch([-0.13, 0.126, -0.26]), pole: dir("hips", [-0.3, 0, 1]), footYaw: -25 },
    },
    extra,
  );
const chudan = stance(over(hilt([-0.01, 1.08, 0.36], [0.22, 0.62, 0.75], [0.55, -0.8, 0.1], [-0.5, -0.85, 0.1]), { R: { pole: dir("chest", [-1, -0.7, -0.3]) }, L: { pole: dir("chest", [1, -0.7, -0.3]) } }));
const raised = stance(
  over(hilt([-0.3, 1.47, 0.14], [-0.45, 0.75, -0.5], [0.8, 0, 0.6], [0.7, -0.3, 0.6]), {
    hips: { yaw: -10 },
    spine: { twist: -22, bend: -2 },
    head: { turn: 12, nod: 2 },
    R: { pole: dir("chest", [-1, -0.6, 0]) },
    L: { pole: dir("chest", [0.3, -1, 0.3]) },
  }),
);
// on the way up, the hilt passes well in front of the chest (the left forearm crosses it)
const lift = stance(
  over(hilt([-0.2, 1.36, 0.33], [-0.25, 0.9, 0.12], [0.75, -0.3, 0.5], [0.6, -0.5, 0.5]), {
    hips: { yaw: -3 },
    spine: { twist: -12 },
    head: { turn: 4 },
    R: { pole: dir("chest", [-1, -0.6, -0.1]) },
    L: { pole: dir("chest", [0.6, -0.9, 0.3]) },
  }),
);
const cut = stance(
  over(hilt([0.2, 0.92, 0.4], [0.55, -0.42, 0.72], [-0.1, -0.85, -0.5], [-0.2, -0.9, -0.4]), {
    hips: { pos: [0.02, -0.12, 0.12], yaw: 22 },
    spine: { twist: 18, bend: 10, side: 4 },
    head: { turn: -18, nod: 10 },
    R: { pole: dir("chest", [-0.6, -0.8, -0.2]) },
    L: { pole: dir("chest", [1, -0.6, -0.2]) },
    legL: { foot: ch([0.17, 0.126, 0.24]) },
  }),
);
const after = over(cut, { ...hilt([0.3, 0.9, 0.38], [0.65, -0.48, 0.58], [-0.1, -0.85, -0.5], [-0.2, -0.9, -0.4]), spine: { twist: 22 } });

// ---------------------------------------------------------------- 干杯 cheers: raise the beer, clink, drink, ahh
/** where the right hand's grip goes for the glass's rim to be at `rim`, the glass along `ts` */
const glassAt = (frame: string, rim: V3, ts: V3, palm: V3): P => ({ grip: at(frame, add3(add3(rim, norm(ts), -0.105), norm(palm), -0.022)), orient: { frame, thumb: ts, palm }, fingers: "cup" });
const holdBeer: P = { R: { grip: ch([-0.15, 1.2, 0.3]), pole: dir("chest", [-1, -0.6, -0.4]), orient: { frame: "char", thumb: [0, 1, 0.05], palm: [1, 0, -0.25] }, fingers: "cup" } };
const raiseBeer = (push: number): P => ({
  spine: { bend: 7 },
  head: { nod: -6, tilt: 4 },
  R: { grip: ch([-0.1, 1.55, 0.5 + push]), pole: dir("chest", [-1, -0.7, -0.3]), orient: { frame: "char", thumb: [0.05, 1, 0.1], palm: [1, 0, -0.1] }, fingers: "cup" },
});
const drink = (tilt: number, nod: number): P => ({
  spine: { bend: -5 - tilt * 6 },
  head: { nod, tilt: 0, turn: 0 },
  R: { ...glassAt("head", [-0.004, 0.006, 0.14], [0.05, Math.cos(tilt), -Math.sin(tilt)], [1, 0, 0]), pole: dir("chest", [-1, -0.4, -0.3]) },
});

// ---------------------------------------------------------------- 比心 heart: a big heart over the head, swaying
const bigHeart = (side: number): P => ({
  hips: { pos: [0.03 * side, -0.02, 0], roll: -3 * side },
  spine: { bend: -3, side: 7 * side },
  head: { nod: -2, tilt: 9 * side },
  L: { clav: { up: 16 }, hand: cs([0.12, 0.6, 0.03]), pole: dir("chest", [1, 0.5, -0.1]), orient: { frame: "chest", fingers: [-0.8, -0.6, 0.05], palm: [0.6, -0.8, 0] }, fingers: "flat" },
  R: { clav: { up: 16 }, hand: cs([-0.12, 0.6, 0.03]), pole: dir("chest", [-1, 0.5, -0.1]), orient: { frame: "chest", fingers: [0.8, -0.6, 0.05], palm: [-0.6, -0.8, 0] }, fingers: "flat" },
});

// ---------------------------------------------------------------- 打碟 DJ: a hand on the headphones, the other scratching, nodding on the beat
const dj = (beat: boolean, x: number): P => ({
  hips: { pos: [0, beat ? -0.055 : -0.025, 0.01] },
  spine: { bend: beat ? 9 : 5 },
  head: { nod: beat ? 14 : 0, turn: -4, tilt: 4 },
  L: { clav: { up: 10 }, hand: hd([0.15, -0.03, -0.01]), pole: dir("chest", [1, -0.1, -0.5]), orient: { frame: "head", fingers: [-0.25, 1, -0.15], palm: [-1, -0.1, 0.05] }, fingers: "cup" },
  R: { hand: ch([x, 1.06, 0.33]), pole: dir("chest", [-1, -0.6, -0.3]), orient: { frame: "char", fingers: [0.15, -0.2, 1], palm: [0, -1, -0.1] }, fingers: "relaxed" },
});

// ---------------------------------------------------------------- 大哭 cry: fists rubbing the eyes, then a wail with the arms flung out
const rub = (k: number): P => ({
  hips: { pos: [0, -0.03, 0] },
  spine: { bend: 13 },
  head: { nod: 13, tilt: 0 },
  L: { hand: hd([0.045 + 0.012 * k, 0.035 + 0.01 * k, 0.2]), pole: dir("chest", [1, -0.7, -0.2]), orient: { frame: "head", fingers: [0, 0.6, -0.8], palm: [0, -0.8, -0.6] }, fingers: "fist" },
  R: { hand: hd([-0.045 + 0.012 * k, 0.035 - 0.01 * k, 0.2]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "head", fingers: [0, 0.6, -0.8], palm: [0, -0.8, -0.6] }, fingers: "fist" },
});
const wail: P = {
  hips: { pos: [0, -0.06, -0.01] },
  spine: { bend: -14 },
  head: { nod: -32, tilt: 0 },
  L: { clav: { up: 14 }, hand: ch([0.46, 1.8, 0.24]), pole: dir("chest", [1, -0.5, -0.3]), orient: { frame: "char", fingers: [0.55, 0.75, 0.2], palm: [-0.35, 0.45, 0.8] }, fingers: "open" },
  R: { clav: { up: 14 }, hand: ch([-0.46, 1.8, 0.24]), pole: dir("chest", [-1, -0.5, -0.3]), orient: { frame: "char", fingers: [-0.55, 0.75, 0.2], palm: [0.35, 0.45, 0.8] }, fingers: "open" },
};
const sob = (t: number, pose: P): P => {
  const s = Math.max(0, Math.sin(t * 2 * Math.PI * 4.5));
  return over(pose, { L: { clav: { up: (pose.L?.clav?.up ?? 0) + 5 * s } }, R: { clav: { up: (pose.R?.clav?.up ?? 0) + 5 * s } }, spine: { bend: (pose.spine?.bend ?? 0) + 2 * s } });
};

// ---------------------------------------------------------------- 抱拳 fist salute: right fist in the left palm before the chest, a bow
const salute = (y: number, bow: number): P => ({
  hips: { pitch: bow * 0.35 },
  spine: { bend: 2 + bow },
  head: { nod: 2 + bow * 0.6 },
  R: { hand: cs([-0.09, -0.08 + y, 0.25]), pole: dir("chest", [-1, -0.4, -0.2]), orient: { frame: "chest", fingers: [0.85, -0.05, 0.5], palm: [0.35, -0.15, -0.9] }, fingers: "fist" },
  L: { hand: cs([0.06, -0.12 + y, 0.31]), pole: dir("chest", [1, -0.4, -0.2]), orient: { frame: "chest", fingers: [-0.25, 1, 0.05], palm: [-1, -0.15, -0.3] }, fingers: "flat" },
});

// ---------------------------------------------------------------- the everyday ones (Nov 14, after the borrowed clips went)

// 挥手 wave: the right hand up by the head, waving from the elbow
const wave = (k: number): P => ({
  hips: { pos: [0.012 * k, -0.01, 0], roll: -1.5 * k },
  spine: { side: -2, bend: -1 },
  head: { tilt: 6 + 2 * k, nod: -2, turn: -4 },
  R: { clav: { up: 8 }, hand: cs([-0.33 + 0.06 * k, 0.4, 0.12]), pole: dir("chest", [-1, -0.7, 0.1]), orient: { frame: "chest", fingers: [-0.1 + 0.35 * k, 1, 0.05], palm: [0.05, 0.05, 1] }, fingers: "open" },
});

// 鼓掌 clap: hands meeting before the chest
const clap = (shut: boolean, bob: number): P => ({
  hips: { pos: [0, -0.012 - 0.012 * bob, 0] },
  spine: { bend: 4 },
  head: { nod: 3 + 2 * bob, tilt: 2 },
  R: { hand: cs([shut ? -0.028 : -0.13, -0.08, 0.31]), pole: dir("chest", [-1, -0.8, -0.1]), orient: { frame: "chest", fingers: [-0.1, 0.65, 1], palm: [1, 0, -0.05] }, fingers: "flat" },
  L: { hand: cs([shut ? 0.028 : 0.13, -0.06, 0.31]), pole: dir("chest", [1, -0.8, -0.1]), orient: { frame: "chest", fingers: [0.1, 0.55, 1], palm: [-1, 0, -0.05] }, fingers: "flat" },
});

// 点赞 thumbs up: the right arm out in front, thumb up, a push on the beat
const thumbs = (push: number): P => ({
  hips: { pos: [0.01, -0.01, 0], roll: -2 },
  spine: { bend: 2 + 3 * push, twist: 6 },
  head: { nod: 4 * push, tilt: 5 },
  R: { hand: cs([-0.13, 0.04 + 0.02 * push, 0.5 + 0.06 * push]), pole: dir("chest", [-1, -1, 0]), orient: { frame: "chest", thumb: [0, 1, 0.05], palm: [1, 0, 0.1] }, fingers: "thumbsup" },
  L: { hand: hp([0.19, 0.08, 0.02]), pole: dir("chest", [1, 0, -0.6]), orient: { frame: "hips", fingers: [0.1, -0.5, 1], palm: [-1, 0, 0] }, fingers: "relaxed" },
});

// 鞠躬 bow: hands down the front of the thighs, bent at the hips
const bow = (k: number): P => ({
  hips: { pos: [0, -0.01, -0.05 * k], pitch: 30 * k },
  spine: { bend: 4 + 14 * k },
  head: { nod: 2 + 12 * k },
  L: { hand: hp([0.08, -0.2 - 0.08 * k, 0.15]), pole: dir("hips", [0.6, 0, -1]), orient: { frame: "hips", fingers: [-0.1, -1, 0.15], palm: [-0.2, 0, -1] }, fingers: "flat" },
  R: { hand: hp([-0.08, -0.2 - 0.08 * k, 0.15]), pole: dir("hips", [-0.6, 0, -1]), orient: { frame: "hips", fingers: [0.1, -1, 0.15], palm: [0.2, 0, -1] }, fingers: "flat" },
});

// 欢呼 cheer: fists up in a V, bouncing
const cheer = (up: number): P => ({
  hips: { pos: [0, -0.045 + 0.04 * up, 0] },
  spine: { bend: -6 },
  head: { nod: -12, tilt: 0 },
  R: { clav: { up: 18 }, hand: cs([-0.3, 0.44 + 0.12 * up, 0.08]), pole: dir("chest", [-1, -0.4, -0.3]), orient: { frame: "chest", fingers: [0, 1, 0.3], palm: [-0.2, 0, 1] }, fingers: "fist" },
  L: { clav: { up: 18 }, hand: cs([0.3, 0.44 + 0.12 * up, 0.08]), pole: dir("chest", [1, -0.4, -0.3]), orient: { frame: "chest", fingers: [0, 1, 0.3], palm: [0.2, 0, 1] }, fingers: "fist" },
});

// 摊手 shrug: shoulders up, palms up and out, eyebrows up
const shrug = (k: number): P => ({
  hips: { pos: [0, -0.01, 0] },
  spine: { bend: -2 * k },
  head: { tilt: 12 * k, nod: -3 * k, turn: 6 * k },
  R: { clav: { up: 16 * k }, hand: cs([-0.24 - 0.1 * k, -0.33 + 0.05 * k, 0.12 + 0.12 * k]), pole: dir("chest", [-0.5, -1, -0.4]), orient: { frame: "chest", fingers: [-0.7, 0.1, 0.7], palm: [-0.1, 1, 0.1] }, fingers: "open" },
  L: { clav: { up: 16 * k }, hand: cs([0.24 + 0.1 * k, -0.33 + 0.05 * k, 0.12 + 0.12 * k]), pole: dir("chest", [0.5, -1, -0.4]), orient: { frame: "chest", fingers: [0.7, 0.1, 0.7], palm: [0.1, 1, 0.1] }, fingers: "open" },
});

// 思考 think: the right hand at the chin, its elbow on the left hand across the body, looking up
const think = (k: number): P => ({
  hips: { pos: [0.01, -0.012, 0], roll: -2 },
  spine: { bend: 3, side: -2 },
  head: { nod: -8 + 3 * k, turn: 12 - 4 * k, tilt: 8 },
  R: { hand: hd([-0.02, -0.115, 0.115]), pole: dir("chest", [-0.15, -1, 0.15]), orient: { frame: "head", fingers: [0.15, 1, 0.25], palm: [0.6, -0.1, -0.8] }, fingers: "point" },
  L: { hand: cs([-0.1, -0.27, 0.22]), pole: dir("chest", [1, -0.6, -0.2]), orient: { frame: "chest", fingers: [-1, 0.1, -0.2], palm: [0, 1, 0.2] }, fingers: "cup" },
});

// 跳舞 dance: a step and a touch to each side, the arms swinging, on the beat (120 a minute)
const dance = (side: number, down: boolean): P => ({
  hips: { pos: [0.07 * side, down ? -0.06 : -0.025, 0], roll: -5 * side, yaw: 10 * side },
  spine: { side: 7 * side, twist: -12 * side, bend: down ? 6 : 2 },
  head: { tilt: 7 * side, nod: down ? 8 : -2, turn: -6 * side },
  legL: { foot: ch([side > 0 ? 0.2 : 0.06, side > 0 ? 0.126 : 0.15, side > 0 ? 0 : 0.05]), footYaw: 12, toe: side > 0 ? 0 : 20 },
  legR: { foot: ch([side < 0 ? -0.2 : -0.06, side < 0 ? 0.126 : 0.15, side < 0 ? 0 : 0.05]), footYaw: -12, toe: side < 0 ? 0 : 20 },
  L: { hand: cs(side > 0 ? [0.3, 0.12, 0.2] : [0.08, -0.2, 0.28]), pole: dir("chest", [1, -0.7, -0.2]), fingers: side > 0 ? "point" : "fist" },
  R: { hand: cs(side < 0 ? [-0.3, 0.12, 0.2] : [-0.08, -0.2, 0.28]), pole: dir("chest", [-1, -0.7, -0.2]), fingers: side < 0 ? "point" : "fist" },
});

// 敬礼 salute: standing straight, the right hand's fingers at the brow
const attention: P = {
  hips: { pos: [0, 0, 0] },
  spine: { bend: -2 },
  head: { nod: -3 },
  L: { hand: cs([0.215, -0.42, 0.04]), pole: dir("chest", [0.3, 0, -1]), orient: { frame: "chest", fingers: [0, -1, 0], palm: [-1, 0, 0] }, fingers: "flat" },
  legL: { foot: ch([0.07, 0.126, -0.07]), footYaw: 10 },
  legR: { foot: ch([-0.07, 0.126, -0.07]), footYaw: -10 },
};
const salut: P = over(attention, {
  // the hand flat, its fingertips at the right eyebrow, the elbow out to the side
  R: { clav: { up: 6 }, hand: hd([-0.19, 0.1, 0.0]), pole: dir("chest", [-1, 0.1, 0.3]), orient: { frame: "head", fingers: [0.75, 0.3, 0.6], palm: [-0.1, -0.85, 0.45] }, fingers: "salute" },
});

// 叉腰 hands on hips: elbows out, chest up
const akimbo = (k: number): P => ({
  hips: { pos: [0.015 * k, -0.01, 0], roll: -2 * k },
  spine: { bend: -5, side: k },
  head: { nod: -6, turn: 8 * k, tilt: -3 * k },
  L: { hand: hp([0.2, 0.09, 0.0]), pole: dir("chest", [1, -0.2, -0.6]), orient: { frame: "hips", fingers: [0.15, -0.35, 1], palm: [-1, 0, 0.15] }, fingers: "relaxed" },
  R: { hand: hp([-0.2, 0.09, 0.0]), pole: dir("chest", [-1, -0.2, -0.6]), orient: { frame: "hips", fingers: [-0.15, -0.35, 1], palm: [1, 0, 0.15] }, fingers: "relaxed" },
  legL: { foot: ch([0.15, 0.126, -0.04]), footYaw: 14 },
  legR: { foot: ch([-0.15, 0.126, -0.04]), footYaw: -14 },
});

// 晕倒 faint: the back of a hand to the forehead, a sway, down on the back; then lying there
const swoon: P = {
  hips: { pos: [0.02, -0.02, -0.02], roll: 4 },
  spine: { bend: -10, side: -4 },
  head: { nod: -22, tilt: -10, turn: 6 },
  R: { clav: { up: 10 }, hand: hd([-0.02, 0.13, 0.12]), pole: dir("chest", [-1, 0.3, 0.2]), orient: { frame: "head", fingers: [0.9, 0.1, 0.2], palm: [0, 0.4, 0.9] }, fingers: "relaxed" },
  L: { hand: cs([0.32, -0.25, 0.1]), pole: dir("chest", [1, -0.5, -0.4]), orient: { frame: "chest", fingers: [0.7, -0.6, 0.2], palm: [0, 0.2, 1] }, fingers: "open" },
};
const wobble: P = over(swoon, { hips: { pos: [-0.03, -0.12, -0.04], roll: -6, pitch: -4 }, spine: { side: 6 }, head: { tilt: 14 } });
const sink: P = {
  hips: { pos: [0, -0.45, -0.18], pitch: -25 },
  spine: { bend: -8 },
  head: { nod: -10, tilt: 10 },
  R: { hand: ch([-0.35, 0.65, -0.25]), pole: dir("chest", [-1, 0, 0]), fingers: "open" },
  L: { hand: ch([0.35, 0.65, -0.25]), pole: dir("chest", [1, 0, 0]), fingers: "open" },
  legL: { foot: ch([0.14, 0.126, 0.12]) },
  legR: { foot: ch([-0.12, 0.126, 0.05]) },
};
// lying on its back: in the hips' own terms +y runs to the head, -z down to the floor
const flat = (breath: number): P => ({
  hips: { pos: [0, -0.88, -0.45], pitch: -90 },
  spine: { bend: -2 + breath * 1.5 },
  head: { nod: 6, tilt: 16, turn: -14 },
  R: { hand: hp([-0.5, 0.48, -0.06]), pole: dir("hips", [-0.4, 0, 1]), orient: { frame: "hips", fingers: [-0.6, 0.5, 0], palm: [0, 0, 1] }, fingers: "relaxed" },
  L: { hand: hp([0.33, -0.05, -0.04]), pole: dir("hips", [0.5, 0, 1]), orient: { frame: "hips", fingers: [0.3, -0.9, 0], palm: [0, 0, 1] }, fingers: "relaxed" },
  // one leg out straight, heel on the floor; the other knee up, its foot flat
  legL: { foot: hp([0.15, -0.86, -0.08]), pole: dir("hips", [0.2, 0, 1]), footDir: { frame: "hips", d: [0.2, -0.25, 1] } },
  legR: { foot: hp([-0.13, -0.58, -0.09]), pole: dir("hips", [-0.15, 0, 1]), footDir: { frame: "hips", d: [-0.1, -1, -0.12] } },
});

export const CLIPS: Clip[] = [
  // ---------------------------------------------------------------- 站着 stand: breathing, the weight from one leg to the other, a look about
  {
    name: "stand",
    fps: 10,
    dur: 8,
    add: breathe(1),
    keys: [
      { t: 0, pose: {} },
      { t: 2.4, pose: { hips: { pos: [0.018, -0.008, 0], roll: -1.6 }, spine: { side: 1 }, head: { turn: 7, nod: 1, tilt: -1 }, legR: { foot: ch([-0.105, 0.126, -0.06]), footYaw: -6 } } },
      { t: 4.2, pose: { hips: { pos: [0.018, -0.008, 0], roll: -1.6 }, spine: { side: 1 }, head: { turn: 2, nod: 3, tilt: 1 }, legR: { foot: ch([-0.105, 0.126, -0.06]), footYaw: -6 } } },
      { t: 6.2, pose: { hips: { pos: [-0.012, -0.01, 0], roll: 1.2 }, spine: { side: -1 }, head: { turn: -6, nod: 2, tilt: 2 } } },
    ],
  },
  {
    name: "cool",
    fps: 15,
    dur: 6,
    add: breathe(0.8),
    keys: [
      { t: 0, pose: crossed(10, -7) },
      { t: 1.8, pose: crossed(4, -9) },
      { t: 2.35, pose: pushShades(0) },
      { t: 2.75, pose: pushShades(0.012) },
      { t: 3.3, pose: crossed(2, -10), ease: "inout" },
      { t: 4.6, pose: crossed(-8, -8) },
    ],
  },
  {
    name: "photo",
    fps: 15,
    dur: 6.4,
    add: breathe(0.6),
    keys: [
      { t: 0, pose: lookAtPhone(24) },
      { t: 1.05, pose: selfieA },
      { t: 1.8, pose: selfieA },
      { t: 2.6, pose: selfieB },
      { t: 4.1, pose: selfieB },
      { t: 5.1, pose: lookAtPhone(22) },
      { t: 5.6, pose: lookAtPhone(28) },
    ],
  },
  {
    name: "sleep_in",
    fps: 20,
    dur: 2.7,
    loop: false,
    keys: [
      { t: 0, pose: {} },
      { t: 0.85, pose: yawn },
      { t: 1.15, pose: yawn },
      { t: 1.85, pose: crouch },
      { t: 2.7, pose: lying(0), ease: "out" },
    ],
  },
  {
    name: "sleep",
    fps: 10,
    dur: 4,
    keys: [
      { t: 0, pose: lying(0) },
      { t: 1, pose: lying(1) },
      { t: 2, pose: lying(0) },
      { t: 3, pose: lying(1) },
    ],
  },
  {
    name: "sword",
    fps: 30,
    dur: 3.4,
    add: breathe(0.5),
    keys: [
      { t: 0, pose: chudan },
      { t: 0.5, pose: lift, ease: "in" },
      { t: 0.85, pose: raised, ease: "out" },
      { t: 1.12, pose: cut, ease: "snap" },
      { t: 1.65, pose: after, ease: "out" },
      { t: 2.6, pose: chudan, ease: "inout" },
    ],
  },
  {
    name: "toast",
    fps: 20,
    dur: 5.2,
    add: breathe(0.6),
    keys: [
      { t: 0, pose: holdBeer },
      { t: 0.7, pose: raiseBeer(0) },
      { t: 0.85, pose: raiseBeer(0.05), ease: "snap" },
      { t: 1.0, pose: raiseBeer(0) },
      { t: 1.75, pose: drink(0.45, -12) },
      { t: 2.9, pose: drink(1.1, -30) },
      { t: 3.6, pose: over(holdBeer, { spine: { bend: -6 }, head: { nod: -10 } }) },
      { t: 3.95, pose: over(holdBeer, { spine: { bend: -4 }, head: { nod: -6 }, L: { hand: hd([0.02, -0.03, 0.17]), pole: dir("chest", [1, -0.6, -0.3]), orient: { frame: "head", fingers: [-1, 0.2, 0.1], palm: [0, 0.2, -1] }, fingers: "relaxed" } }) },
      { t: 4.4, pose: holdBeer },
    ],
  },
  {
    name: "heart",
    fps: 15,
    dur: 2.4,
    keys: [
      { t: 0, pose: bigHeart(1) },
      { t: 1.2, pose: bigHeart(-1) },
    ],
  },
  {
    name: "dj",
    fps: 30,
    dur: 2,
    keys: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ t: i * 0.25, pose: dj(i % 2 === 0, i % 2 === 0 ? -0.1 : -0.26), ease: i % 2 === 0 ? "snap" : "inout" })),
  },
  {
    name: "cry",
    fps: 24,
    dur: 3.2,
    add: sob,
    keys: [
      { t: 0, pose: rub(1) },
      { t: 0.3, pose: rub(-1) },
      { t: 0.6, pose: rub(1) },
      { t: 0.9, pose: rub(-1) },
      { t: 1.2, pose: rub(1) },
      { t: 1.75, pose: wail, ease: "snap" },
      { t: 2.6, pose: wail },
    ],
  },
  {
    name: "fist",
    fps: 15,
    dur: 3.4,
    add: breathe(0.5),
    keys: [
      { t: 0, pose: {} },
      { t: 0.55, pose: salute(0, 0) },
      { t: 0.8, pose: salute(0.03, 2) },
      { t: 1.05, pose: salute(-0.01, 4) },
      { t: 1.3, pose: salute(0.03, 6) },
      { t: 1.9, pose: salute(0, 20) },
      { t: 2.5, pose: salute(0, 2) },
      { t: 2.9, pose: salute(0, 0) },
    ],
  },
  {
    name: "wave",
    fps: 20,
    dur: 2,
    add: breathe(0.6),
    keys: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ t: i * 0.25, pose: wave(i % 2 ? -1 : 1) })),
  },
  {
    name: "clap",
    fps: 30,
    dur: 2,
    keys: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ t: i * 0.25, pose: clap(i % 2 === 1, i % 2), ease: i % 2 ? "snap" : "out" })),
  },
  {
    name: "thumbs",
    fps: 15,
    dur: 2.4,
    add: breathe(0.6),
    keys: [
      { t: 0, pose: thumbs(0) },
      { t: 0.35, pose: thumbs(1), ease: "snap" },
      { t: 0.9, pose: thumbs(0.2) },
      { t: 1.4, pose: thumbs(0) },
    ],
  },
  {
    name: "bow",
    fps: 15,
    dur: 3.2,
    keys: [
      { t: 0, pose: bow(0) },
      { t: 0.8, pose: bow(1) },
      { t: 1.7, pose: bow(1) },
      { t: 2.5, pose: bow(0) },
    ],
  },
  {
    name: "cheer",
    fps: 20,
    dur: 1.6,
    keys: [
      { t: 0, pose: cheer(1) },
      { t: 0.4, pose: cheer(0), ease: "in" },
      { t: 0.8, pose: cheer(1), ease: "out" },
      { t: 1.2, pose: cheer(0), ease: "in" },
    ],
  },
  {
    name: "shrug",
    fps: 15,
    dur: 2.6,
    keys: [
      { t: 0, pose: shrug(0.15) },
      { t: 0.45, pose: shrug(1), ease: "snap" },
      { t: 1.7, pose: shrug(0.9) },
      { t: 2.3, pose: shrug(0.15) },
    ],
  },
  {
    name: "think",
    fps: 10,
    dur: 4,
    add: breathe(0.6),
    keys: [
      { t: 0, pose: think(0) },
      { t: 2, pose: think(1) },
    ],
  },
  {
    name: "dance",
    fps: 30,
    dur: 4,
    keys: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => ({ t: i * 0.25, pose: dance(Math.floor(i / 2) % 2 ? -1 : 1, i % 2 === 0), ease: i % 2 ? "out" : "in" })),
  },
  {
    name: "salute",
    fps: 15,
    dur: 3,
    add: breathe(0.4),
    keys: [
      { t: 0, pose: attention },
      { t: 0.45, pose: salut, ease: "snap" },
      { t: 2.2, pose: salut },
      { t: 2.65, pose: attention },
    ],
  },
  {
    name: "akimbo",
    fps: 10,
    dur: 4,
    add: breathe(0.8),
    keys: [
      { t: 0, pose: akimbo(1) },
      { t: 2, pose: akimbo(-1) },
    ],
  },
  {
    name: "faint_in",
    fps: 20,
    dur: 2.8,
    loop: false,
    keys: [
      { t: 0, pose: {} },
      { t: 0.6, pose: swoon },
      { t: 1.3, pose: wobble },
      { t: 1.9, pose: sink, ease: "in" },
      { t: 2.8, pose: flat(0), ease: "out" },
    ],
  },
  {
    name: "faint",
    fps: 10,
    dur: 4,
    keys: [
      { t: 0, pose: flat(0) },
      { t: 2, pose: flat(1) },
    ],
  },
];
