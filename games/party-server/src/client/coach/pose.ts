// The coach's body as numbers: where the hips are, how the chest and head turn, where each hand and
// foot goes. The rig (rig.ts) bends the arms and legs to put the hands and feet there (two-bone IK),
// so a move is written as positions, the way a dance teacher says it: "hands up", "step left".
//
// Sides are the screen's: R is the side on the TV's right (+x), L its left. The coach faces the
// room, so it is everyone's mirror: when the screen-right hand goes up, the players lift their right.
// Units are metres and radians; the coach stands about 1.8 m tall at the middle of its spot.

export type V3 = [number, number, number];

export interface Foot {
  /** across (+ to the screen's right) and forward (+ towards the room), from the middle of the spot */
  x: number;
  z: number;
  /** how far the ankle is off the floor */
  lift: number;
  /** toes turned out (+: towards the screen's right for either foot) */
  yaw: number;
  /** toes up (+) or pointed down (-) */
  pitch: number;
}

export interface Pose {
  /** the whole body: moved across the floor, and turned round (a spin) */
  rx: number;
  rz: number;
  turn: number;
  /** the hips: off where they stand (m), and turned (yaw), tipped forward (pitch), tilted (roll + leans to the screen's left) */
  px: number;
  py: number;
  pz: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** the chest, on the hips */
  cYaw: number;
  cPitch: number;
  cRoll: number;
  /** the head, on the chest */
  hYaw: number;
  hPitch: number;
  hRoll: number;
  /** the wrists, from between the shoulders (the chest's frame: x across, y up, z forward) */
  hR: V3;
  hL: V3;
  /** which way each palm faces (the chest's frame) */
  pR: V3;
  pL: V3;
  /** which way each elbow points (the chest's frame) */
  eR: V3;
  eL: V3;
  /** the shoulders raised (y) and forward (z), for shoulder rolls */
  sR: [number, number];
  sL: [number, number];
  fR: Foot;
  fL: Foot;
  /** the handkerchiefs' twirl (radians), or 0 with none in hand */
  hanky: number;
  /** 0 to 1: how much a handkerchief shows */
  hankyOn: number;
}

/** Standing easy: feet under the hips, hands by the sides. */
export const BASE: Pose = {
  rx: 0,
  rz: 0,
  turn: 0,
  px: 0,
  py: 0,
  pz: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  cYaw: 0,
  cPitch: 0,
  cRoll: 0,
  hYaw: 0,
  hPitch: 0,
  hRoll: 0,
  hR: [0.23, -0.5, 0.06],
  hL: [-0.23, -0.5, 0.06],
  pR: [-1, 0, 0.2],
  pL: [1, 0, 0.2],
  eR: [0.5, -0.3, -1],
  eL: [-0.5, -0.3, -1],
  sR: [0, 0],
  sL: [0, 0],
  fR: { x: 0.12, z: 0, lift: 0, yaw: 0.14, pitch: 0 },
  fL: { x: -0.12, z: 0, lift: 0, yaw: -0.14, pitch: 0 },
  hanky: 0,
  hankyOn: 0,
};

/** Some of a pose: what a key frame sets (the rest comes from the move's base). */
export type Part = { [K in keyof Pose]?: Pose[K] extends Foot ? Partial<Foot> : Pose[K] };

export function clonePose(p: Pose): Pose {
  return { ...p, hR: [...p.hR], hL: [...p.hL], pR: [...p.pR], pL: [...p.pL], eR: [...p.eR], eL: [...p.eL], sR: [...p.sR], sL: [...p.sL], fR: { ...p.fR }, fL: { ...p.fL } };
}

/** A pose with a part laid over it. */
export function over(base: Pose, part: Part): Pose {
  const out = clonePose(base);
  for (const k of Object.keys(part) as (keyof Pose)[]) {
    const v = part[k];
    if (v === undefined) continue;
    if (k === "fR" || k === "fL") out[k] = { ...out[k], ...(v as Partial<Foot>) };
    else (out as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const lerpFoot = (a: Foot, b: Foot, t: number): Foot => ({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), lift: lerp(a.lift, b.lift, t), yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t) });

/** Between two poses (t 0 to 1). A foot that travels lifts off the floor on the way. */
export function mix(a: Pose, b: Pose, t: number, arc = true): Pose {
  const foot = (fa: Foot, fb: Foot) => {
    const f = lerpFoot(fa, fb, t);
    if (arc) {
      const d = Math.hypot(fb.x - fa.x, fb.z - fa.z);
      if (d > 0.03) f.lift += Math.min(0.11, 0.35 * d) * Math.sin(Math.PI * t);
    }
    return f;
  };
  return {
    rx: lerp(a.rx, b.rx, t),
    rz: lerp(a.rz, b.rz, t),
    turn: lerp(a.turn, b.turn, t),
    px: lerp(a.px, b.px, t),
    py: lerp(a.py, b.py, t),
    pz: lerp(a.pz, b.pz, t),
    yaw: lerp(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    roll: lerp(a.roll, b.roll, t),
    cYaw: lerp(a.cYaw, b.cYaw, t),
    cPitch: lerp(a.cPitch, b.cPitch, t),
    cRoll: lerp(a.cRoll, b.cRoll, t),
    hYaw: lerp(a.hYaw, b.hYaw, t),
    hPitch: lerp(a.hPitch, b.hPitch, t),
    hRoll: lerp(a.hRoll, b.hRoll, t),
    hR: lerp3(a.hR, b.hR, t),
    hL: lerp3(a.hL, b.hL, t),
    pR: lerp3(a.pR, b.pR, t),
    pL: lerp3(a.pL, b.pL, t),
    eR: lerp3(a.eR, b.eR, t),
    eL: lerp3(a.eL, b.eL, t),
    sR: [lerp(a.sR[0], b.sR[0], t), lerp(a.sR[1], b.sR[1], t)],
    sL: [lerp(a.sL[0], b.sL[0], t), lerp(a.sL[1], b.sL[1], t)],
    fR: foot(a.fR, b.fR),
    fL: foot(a.fL, b.fL),
    hanky: lerp(a.hanky, b.hanky, t),
    hankyOn: lerp(a.hankyOn, b.hankyOn, t),
  };
}

/**
 * How a key frame is reached. hit: fast at the end, landing hard on the beat (a clap, a punch).
 * smooth: eased in and out (a sway). snap: there early, then held (a pose struck on the beat).
 */
export type Ease = "hit" | "smooth" | "snap";
const EASES: Record<Ease, (t: number) => number> = {
  hit: (t) => t * t * (1.6 - 0.6 * t),
  smooth: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  snap: (t) => 1 - (1 - t) ** 3,
};

export interface Key {
  /** where in the loop, in beats from its first beat */
  at: number;
  pose: Pose;
  ease: Ease;
}

/**
 * A loop of key frames `len` beats long, as a pose at any beat position (it wraps round: the last
 * key runs into the first). Each key is a part laid over `base`.
 */
export function keys(base: Pose, len: number, list: [number, Part, Ease?][]): (p: number) => Pose {
  const ks: Key[] = list.map(([at, part, ease]) => ({ at, pose: over(base, part), ease: ease ?? "smooth" })).sort((a, b) => a.at - b.at);
  return (p: number) => {
    const q = ((p % len) + len) % len;
    let i = ks.length - 1;
    for (let j = 0; j < ks.length; j++) if (ks[j]!.at <= q) i = j;
    const a = ks[i]!;
    const b = ks[(i + 1) % ks.length]!;
    const from = a.at;
    let to = b.at;
    let at = q;
    if (to <= from) to += len;
    if (at < from) at += len;
    const span = to - from;
    const t = span > 0 ? Math.min(1, Math.max(0, (at - from) / span)) : 1;
    return mix(a.pose, b.pose, EASES[b.ease](t));
  };
}

/** The bounce under every move: down on the beat, up between. `frac` is how far through the beat. */
export function groove(p: Pose, frac: number, amount: number): Pose {
  const down = 0.5 + 0.5 * Math.cos(2 * Math.PI * frac);
  p.py -= 0.032 * amount * down;
  p.cPitch += 0.03 * amount * down;
  p.hPitch += 0.06 * amount * down;
  return p;
}
