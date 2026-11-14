// The moves written for the figure (no outside clips): key poses in time, in rig.mjs's terms.
// Character space: metres, x = its left, y = up, z = forward; "chest" = Spine2, "head" = Head.
// Times in seconds; `add` lays a little life (breathing, sobbing) over the keys.
import { over } from "./anim.mjs";

const at = (frame, p) => ({ frame, p });
const ch = (p) => at("char", p);
const cs = (p) => at("chest", p);
const hd = (p) => at("head", p);
const dir = (frame, d) => ({ frame, d });
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const add3 = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);

/** standing at ease: arms down, a soft knee */
export const BASE = {
  hips: { pos: [0, -0.012, 0], yaw: 0, pitch: 0, roll: 0 },
  spine: { bend: 2, side: 0, twist: 0 },
  head: { nod: 2, turn: 0, tilt: 0 },
  L: { clav: { up: 0, fwd: 0 }, hand: cs([0.205, -0.37, 0.05]), pole: dir("chest", [0.3, 0, -1]), fingers: "relaxed" },
  R: { clav: { up: 0, fwd: 0 }, hand: cs([-0.205, -0.37, 0.05]), pole: dir("chest", [-0.3, 0, -1]), fingers: "relaxed" },
  legL: { foot: ch([0.095, 0.126, -0.077]), pole: dir("hips", [0.1, 0, 1]) },
  legR: { foot: ch([-0.095, 0.126, -0.077]), pole: dir("hips", [-0.1, 0, 1]) },
};

/** breathing: k breaths over the loop */
const breathe = (amp = 1) => (t, pose, dur) => {
  const k = Math.max(1, Math.round(dur / 3));
  const w = Math.sin((2 * Math.PI * k * t) / dur);
  return over(pose, {
    spine: { bend: (pose.spine?.bend ?? 0) + 1.3 * amp * w },
    L: { clav: { up: (pose.L?.clav?.up ?? 0) + 0.9 * amp * w } },
    R: { clav: { up: (pose.R?.clav?.up ?? 0) + 0.9 * amp * w } },
  });
};

// ---------------------------------------------------------------- 摆酷 cool: arms crossed, leaning back, shades; pushes them up
const crossed = (turn, nod) => ({
  hips: { pos: [-0.035, -0.02, 0], roll: 3 },
  spine: { bend: -4, side: 2 },
  head: { nod, turn, tilt: -3 },
  L: { hand: cs([-0.04, -0.15, 0.15]), pole: dir("chest", [1, -0.6, -0.2]), orient: { frame: "chest", fingers: [-1, 0, -0.2], palm: [0, 0.3, -1] }, fingers: "cup" },
  R: { hand: cs([0.04, -0.11, 0.18]), pole: dir("chest", [-1, -0.6, -0.2]), orient: { frame: "chest", fingers: [1, 0.1, -0.3], palm: [0, -0.3, -1] }, fingers: "cup" },
  legL: { foot: ch([0.16, 0.135, 0.03]), pole: dir("hips", [0.4, 0, 1]), footYaw: 18 },
});
const pushShades = (lift) =>
  over(crossed(2, 2), {
    head: { nod: 4 - lift * 300, turn: 0, tilt: 0 },
    R: { hand: hd([-0.065, -0.085 + lift, 0.2]), pole: dir("chest", [-1, -0.8, 0]), orient: { frame: "head", fingers: [0.3, 0.9, -0.3], palm: [0.1, -0.25, -1] }, fingers: "point" },
  });

// ---------------------------------------------------------------- 照相 selfie: phone up, a V by the face, flash; then hand on hip, flash; then look at it
const lookAtPhone = (nod) => ({
  spine: { bend: 6 },
  head: { nod, turn: -8, tilt: 4 },
  R: { grip: ch([-0.13, 1.2, 0.3]), pole: dir("chest", [-1, -0.6, -0.4]), orient: { frame: "char", thumb: [0.1, 0.45, 0.88], palm: [0.25, 0.85, -0.45] }, fingers: "phone" },
  L: { hand: ch([0.04, 1.14, 0.3]), pole: dir("chest", [1, -0.6, -0.4]), orient: { frame: "char", fingers: [-0.4, 0.3, 0.85], palm: [-0.4, 0.8, -0.3] }, fingers: "relaxed" },
});
const selfieA = {
  hips: { pos: [0.02, -0.03, 0], roll: -3 },
  spine: { bend: 0, side: -3 },
  head: { look: ch([-0.25, 1.74, 0.52]), tilt: 13 },
  R: { grip: ch([-0.25, 1.72, 0.52]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "char", thumb: [0.1, 0.95, -0.1], palm: [0.6, -0.12, -0.78] }, fingers: "phone" },
  L: { hand: ch([0.12, 1.56, 0.19]), pole: dir("chest", [1, -0.8, -0.3]), orient: { frame: "char", fingers: [-0.18, 1, 0.08], palm: [-0.45, 0.15, 0.88] }, fingers: "v" },
  legL: { foot: ch([0.13, 0.13, -0.03]), footYaw: 10 },
};
const selfieB = {
  hips: { pos: [0.05, -0.02, 0], roll: -5, yaw: -6 },
  spine: { bend: -2, side: 4 },
  head: { look: ch([-0.27, 1.72, 0.5]), tilt: -9 },
  R: { grip: ch([-0.27, 1.7, 0.5]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "char", thumb: [0.15, 0.95, -0.05], palm: [0.6, -0.1, -0.78] }, fingers: "phone" },
  L: { hand: ch([0.24, 1.02, 0.02]), pole: dir("chest", [1, 0.1, -0.6]), orient: { frame: "char", fingers: [-0.3, -0.75, 0.6], palm: [-1, 0.1, -0.3] }, fingers: "relaxed" },
  legR: { foot: ch([-0.15, 0.13, 0.0]), footYaw: -14 },
};

// ---------------------------------------------------------------- 睡觉 sleep: a yawn and a stretch, down, curled on its side, hands under the cheek
const yawn = {
  spine: { bend: -9 },
  head: { nod: -18 },
  L: { clav: { up: 18 }, hand: ch([0.11, 2.0, 0.0]), pole: dir("chest", [1, 0.2, -0.4]), orient: { frame: "char", fingers: [-0.2, 1, 0.1], palm: [0, 0.1, 1] }, fingers: "open" },
  R: { clav: { up: 18 }, hand: ch([-0.11, 2.0, 0.0]), pole: dir("chest", [-1, 0.2, -0.4]), orient: { frame: "char", fingers: [0.2, 1, 0.1], palm: [0, 0.1, 1] }, fingers: "open" },
};
const crouch = {
  hips: { pos: [0, -0.43, 0.02], pitch: 18 },
  spine: { bend: 24 },
  head: { nod: -10 },
  L: { hand: ch([0.24, 0.42, 0.42]), pole: dir("chest", [1, 0, -0.4]), fingers: "relaxed" },
  R: { hand: ch([-0.2, 0.36, 0.45]), pole: dir("chest", [-1, 0, -0.4]), fingers: "relaxed" },
  legL: { foot: ch([0.12, 0.126, -0.06]), pole: dir("char", [0.3, 0, 1]) },
  legR: { foot: ch([-0.12, 0.126, -0.09]), pole: dir("char", [-0.3, 0, 1]) },
};
// lying on its right side: in the hips' own terms +y runs to the head, -y to the feet, +z forward, +x up off the floor
const hp = (p) => at("hips", p);
const lying = (breath) => ({
  hips: { pos: [0.0, -0.835, -0.02], roll: 90, yaw: -28 },
  spine: { bend: 20 + breath * 2.5, side: 0, twist: 4 },
  head: { nod: 18, tilt: -14, turn: 0 },
  L: { clav: { up: 4 + breath * 2 }, hand: hp([-0.07, 0.53, 0.2]), pole: dir("hips", [1, -0.3, -0.5]), orient: { frame: "hips", fingers: [0, 1, 0.1], palm: [-1, 0, 0] }, fingers: "flat" },
  R: { hand: hp([-0.115, 0.535, 0.21]), pole: dir("hips", [-0.3, -0.4, 1]), orient: { frame: "hips", fingers: [0, 1, 0.1], palm: [1, 0, 0] }, fingers: "flat" },
  legL: { foot: hp([0.09, -0.52, 0.27]), pole: dir("hips", [0.3, 0, 1]), footDir: { frame: "hips", d: [0, -0.45, 0.9] } },
  legR: { foot: hp([-0.09, -0.54, 0.32]), pole: dir("hips", [-0.2, 0, 1]), footDir: { frame: "hips", d: [0, -0.45, 0.9] } },
});

// ---------------------------------------------------------------- 挥刀 sword: two hands on the hilt, raise, a diagonal cut, hold, back
/** both hands on the hilt: the right by the guard, the left below; the blade along `b` */
const hilt = (grip, b, palmR, palmL, frame = "char") => ({
  R: { grip: at(frame, grip), orient: { frame, thumb: b, palm: palmR }, fingers: "grip" },
  L: { grip: at(frame, add3(grip, norm(b), -0.105)), orient: { frame, thumb: b, palm: palmL }, fingers: "grip" },
});
const stance = (extra = {}) =>
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
const cut = stance(
  over(hilt([0.2, 0.92, 0.4], [0.55, -0.42, 0.72], [-0.1, -0.85, -0.5], [-0.2, -0.9, -0.4]), {
    hips: { pos: [0.02, -0.12, 0.12], yaw: 22 },
    spine: { twist: 26, bend: 14, side: 4 },
    head: { turn: -18, nod: 10 },
    R: { pole: dir("chest", [-0.6, -0.8, -0.2]) },
    L: { pole: dir("chest", [1, -0.6, -0.2]) },
    legL: { foot: ch([0.17, 0.126, 0.24]) },
  }),
);
const after = over(cut, { ...hilt([0.25, 0.88, 0.36], [0.62, -0.52, 0.58], [-0.1, -0.85, -0.5], [-0.2, -0.9, -0.4]), spine: { twist: 30 } });

// ---------------------------------------------------------------- 干杯 cheers: raise the beer, clink, drink, ahh
/** where the right hand's grip goes for the glass's rim to be at `rim`, the glass along `ts` */
const glassAt = (frame, rim, ts, palm) => ({ grip: at(frame, add3(add3(rim, norm(ts), -0.105), norm(palm), -0.022)), orient: { frame, thumb: ts, palm }, fingers: "cup" });
const holdBeer = { R: { grip: ch([-0.15, 1.2, 0.3]), pole: dir("chest", [-1, -0.6, -0.4]), orient: { frame: "char", thumb: [0, 1, 0.05], palm: [1, 0, -0.25] }, fingers: "cup" } };
const raiseBeer = (push) => ({
  spine: { bend: 7 },
  head: { nod: -6, tilt: 4 },
  R: { grip: ch([-0.1, 1.55, 0.5 + push]), pole: dir("chest", [-1, -0.7, -0.3]), orient: { frame: "char", thumb: [0.05, 1, 0.1], palm: [1, 0, -0.1] }, fingers: "cup" },
});
const drink = (tilt, nod) => ({
  spine: { bend: -5 - tilt * 6 },
  head: { nod, tilt: 0, turn: 0 },
  R: { ...glassAt("head", [-0.004, 0.006, 0.14], [0.05, Math.cos(tilt), -Math.sin(tilt)], [1, 0, 0]), pole: dir("chest", [-1, -0.4, -0.3]) },
});

// ---------------------------------------------------------------- 比心 heart: a big heart over the head, swaying
const bigHeart = (side) => ({
  hips: { pos: [0.03 * side, -0.02, 0], roll: -3 * side },
  spine: { bend: -3, side: 7 * side },
  head: { nod: -2, tilt: 9 * side },
  L: { clav: { up: 16 }, hand: cs([0.12, 0.6, 0.03]), pole: dir("chest", [1, 0.5, -0.1]), orient: { frame: "chest", fingers: [-0.8, -0.6, 0.05], palm: [0.6, -0.8, 0] }, fingers: "flat" },
  R: { clav: { up: 16 }, hand: cs([-0.12, 0.6, 0.03]), pole: dir("chest", [-1, 0.5, -0.1]), orient: { frame: "chest", fingers: [0.8, -0.6, 0.05], palm: [-0.6, -0.8, 0] }, fingers: "flat" },
});

// ---------------------------------------------------------------- 打碟 DJ: a hand on the headphones, the other scratching, nodding on the beat
const dj = (beat, x) => ({
  hips: { pos: [0, beat ? -0.055 : -0.025, 0.01] },
  spine: { bend: beat ? 9 : 5 },
  head: { nod: beat ? 14 : 0, turn: -4, tilt: 4 },
  L: { clav: { up: 10 }, hand: hd([0.15, -0.03, -0.01]), pole: dir("chest", [1, -0.1, -0.5]), orient: { frame: "head", fingers: [-0.25, 1, -0.15], palm: [-1, -0.1, 0.05] }, fingers: "cup" },
  R: { hand: ch([x, 1.06, 0.33]), pole: dir("chest", [-1, -0.6, -0.3]), orient: { frame: "char", fingers: [0.15, -0.2, 1], palm: [0, -1, -0.1] }, fingers: "relaxed" },
});

// ---------------------------------------------------------------- 大哭 cry: fists rubbing the eyes, then a wail with the arms flung out
const rub = (k) => ({
  hips: { pos: [0, -0.03, 0] },
  spine: { bend: 13 },
  head: { nod: 13, tilt: 0 },
  L: { hand: hd([0.045 + 0.012 * k, 0.035 + 0.01 * k, 0.2]), pole: dir("chest", [1, -0.7, -0.2]), orient: { frame: "head", fingers: [0, 0.6, -0.8], palm: [0, -0.8, -0.6] }, fingers: "fist" },
  R: { hand: hd([-0.045 + 0.012 * k, 0.035 - 0.01 * k, 0.2]), pole: dir("chest", [-1, -0.7, -0.2]), orient: { frame: "head", fingers: [0, 0.6, -0.8], palm: [0, -0.8, -0.6] }, fingers: "fist" },
});
const wail = {
  hips: { pos: [0, -0.06, -0.01] },
  spine: { bend: -14 },
  head: { nod: -32, tilt: 0 },
  L: { clav: { up: 14 }, hand: ch([0.46, 1.8, 0.24]), pole: dir("chest", [1, -0.5, -0.3]), orient: { frame: "char", fingers: [0.55, 0.75, 0.2], palm: [-0.35, 0.45, 0.8] }, fingers: "open" },
  R: { clav: { up: 14 }, hand: ch([-0.46, 1.8, 0.24]), pole: dir("chest", [-1, -0.5, -0.3]), orient: { frame: "char", fingers: [-0.55, 0.75, 0.2], palm: [0.35, 0.45, 0.8] }, fingers: "open" },
};
const sob = (t, pose) => {
  const s = Math.max(0, Math.sin(t * 2 * Math.PI * 4.5));
  return over(pose, { L: { clav: { up: (pose.L?.clav?.up ?? 0) + 5 * s } }, R: { clav: { up: (pose.R?.clav?.up ?? 0) + 5 * s } }, spine: { bend: (pose.spine?.bend ?? 0) + 2 * s } });
};

// ---------------------------------------------------------------- 抱拳 fist salute: right fist in the left palm before the chest, a bow
const salute = (y, bow) => ({
  hips: { pitch: bow * 0.35 },
  spine: { bend: 2 + bow },
  head: { nod: 2 + bow * 0.6 },
  R: { hand: cs([-0.09, -0.08 + y, 0.25]), pole: dir("chest", [-1, -0.4, -0.2]), orient: { frame: "chest", fingers: [0.85, -0.05, 0.5], palm: [0.35, -0.15, -0.9] }, fingers: "fist" },
  L: { hand: cs([0.06, -0.12 + y, 0.31]), pole: dir("chest", [1, -0.4, -0.2]), orient: { frame: "chest", fingers: [-0.25, 1, 0.05], palm: [-1, -0.15, -0.3] }, fingers: "flat" },
});

export const MOVES = [
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
      { t: 0.85, pose: raised, ease: "inout" },
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
];
