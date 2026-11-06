// Rio's dance, taught. A team that says it will dance gets a ready card on its phone, and nothing
// starts until it presses Start (left alone for a minute, it starts by itself: protocol DanceView).
// Then every screen counts down five seconds and plays the same 40 s lesson from the server's clock:
// eight figures of eight beats at 100 a minute (Latin dance competitions dance samba at 50 bars a
// minute, in 2/4), and a pose held to the end. A computer team has nobody to get ready or to teach:
// it dances a short one at once, two figures and the pose.
//
//   1  slowly       the basic step at half speed, "1 a 2": the leading foot forward, the other foot
//                   taps, the leading foot back; the right foot leads, then the left
//   2  the step     the same at speed: right, left, right; left, right, left
//   3  bounce       the knees bend and straighten
//   4  to the side  step and close, twice to the right, twice back
//   5  hips         feet still, hands on the hips, the hips sway
//   6  hands up     the step again, hands up and swaying, ribbons flying
//   7  shoulders    feet still, the shoulders shake
//   8  all of it    the step, the bounce, one hand up and then the other
//   then            hand on hip, the other to the sky: hey
//
// The teacher is a carnival dancer drawn as a person (hair and feathers, a face, a top and a skirt in
// the team's colour, arms with elbows, legs with knees, shoes), a mirror of you: when the spot under
// the foot on the screen's right lights up, you move your right foot. A word is spoken at the start of
// each figure (the phone's own voice), a little ahead of the beat. The music plays on the big screen
// when there is one, otherwise on the dancing team's phone.
//
// She is a paper puppet: each part is drawn once, on a layer of its own, and a frame only moves the
// layers (a CSS transform each). The page draws nothing again as she dances but the words beside her,
// when they change, and the two ribbons while they fly.
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { TIMING, type DanceView, type RoomView } from "../../room/protocol";
import { Face, INK } from "../art/characters";
import { getLang, t, type Key } from "../i18n";
import { reducedMotion } from "../motion";
import { audioReady, samba, sambaCount } from "../sound";
import { send, serverNow } from "../store";
import { HapticBtn, TEAM_COLORS, seatName, teamOf, useCountdown } from "./common";

// ---------- the lesson's clock ----------

type Fig = "slow" | "step" | "bounce" | "side" | "hips" | "hands" | "shake" | "all";

/** The lesson: its figures in order, and how many beats each has. */
const LONG: { fig: Fig; beats: number }[] = (["slow", "step", "bounce", "side", "hips", "hands", "shake", "all"] as Fig[]).map((fig) => ({ fig, beats: 8 }));
/** A computer team's: the step and the hands. */
const SHORT: { fig: Fig; beats: number }[] = [
  { fig: "step", beats: 8 },
  { fig: "hands", beats: 6 },
];
/** The pose at the end is held this many beats (1.6 s at 100 a minute). */
const HOLD = 8 / 3;
/** The countdown's numerals: 5 4 3 2 1, each up a fifth of the countdown (a second). */
const COUNT_STEPS = Math.round(TIMING.danceCount / 1000);

const figures = (short: boolean) => (short ? SHORT : LONG);
/** Beats danced before the pose: 64, or a computer team's 14. */
export const danceBeats = (short: boolean) => figures(short).reduce((n, f) => n + f.beats, 0);
/** A beat's length for a lesson of `ms`: 600 ms at the real 40 s (and a computer team's 10 s). */
export const beatMs = (d: Pick<DanceView, "ms" | "short">) => d.ms / (danceBeats(d.short) + HOLD);

export interface DanceClock {
  seat: number;
  /** Waiting for the dancing team's Start, counting down, the lesson, or over (the judges are scoring). */
  phase: "ready" | "count" | "dance" | "over";
  /** Server time of the lesson's first beat, or null while it waits for Start. */
  beat0: number | null;
  /** ms a beat, and how many before the pose. */
  beat: number;
  beats: number;
  short: boolean;
  /** The countdown's length before beat 0, in ms. */
  count: number;
  /** Server time the judges' buttons light up (null while it waits). */
  end: number | null;
  /** While it waits: the server time it starts by itself, or null. */
  auto: number | null;
  over: boolean;
}

/** The game's clock: the server's, standing still while the game does (a pause, a party forfeit). */
const gameNow = (v: RoomView) => v.game?.frozenAt ?? serverNow();

function clockOf(d: DanceView, now: number): DanceClock {
  const end = d.at === null ? null : d.at + d.ms;
  const phase = d.at === null ? "ready" : now < d.at ? "count" : now < d.at + d.ms ? "dance" : "over";
  return { seat: d.seat, phase, beat0: d.at, beat: beatMs(d), beats: danceBeats(d.short), short: d.short, count: d.count, end, auto: d.auto, over: phase === "over" };
}

/** The countdown's numeral at `now`: 5 down to 1 (0 when there is no countdown, or it's over). */
function numeralAt(c: Pick<DanceClock, "beat0" | "count">, now: number): number {
  if (c.beat0 === null || c.count <= 0 || now >= c.beat0) return 0;
  return Math.max(1, Math.min(COUNT_STEPS, Math.ceil((c.beat0 - now) / (c.count / COUNT_STEPS))));
}

/** The dance up now (waiting to start, counting down, on, or just over: the judges are scoring it), from the room's view. */
export function useDanceClock(v: RoomView): DanceClock | null {
  const d = v.game?.dance ?? null;
  const frozen = v.game?.frozenAt ?? null;
  const [, tick] = useState(0);
  const clock = d ? clockOf(d, gameNow(v)) : null;
  // Look again when the lesson starts, and when it's over.
  useEffect(() => {
    if (!d || d.at === null || frozen !== null) return;
    const now = serverNow();
    const next = [d.at, d.at + d.ms].find((x) => x > now);
    if (next === undefined) return;
    const id = window.setTimeout(() => tick((n) => n + 1), next - now + 20);
    return () => clearTimeout(id);
  }, [d?.at, d?.ms, frozen, clock?.phase]);
  return clock;
}

// ---------- the teacher's pose ----------

type P = [number, number];

/** The teacher at one moment, in a 240 × 240 box. Left and right are the screen's (the teacher is a mirror). */
export interface Pose {
  /** The whole dancer's step to the side. */
  x: number;
  /** The middle of the hips. */
  hip: P;
  /** The hips' tilt, the upper body's lean, and the head's tilt on top of it (degrees, clockwise). */
  roll: number;
  lean: number;
  tilt: number;
  /** A shoulder up and the other down, in the shake. */
  shrug: number;
  /** Ankles. */
  L: P;
  R: P;
  /** How much bigger each leg is drawn: a foot stepped toward you. */
  sL: number;
  sR: number;
  /** Each foot's turn: a toe pointed down in a tap. */
  toeL: number;
  toeR: number;
  /** Which footprints are lit: the foot to move. */
  litL: boolean;
  litR: boolean;
  /** Each wrist, from its shoulder. */
  HL: P;
  HR: P;
  /** How far each hand is on its hip instead (0 to 1). */
  onL: number;
  onR: number;
  /** The ribbons in the hands (0 to 1). */
  ribbon: number;
}

const CX = 120;
/** (the legs are straight when she stands: a bent knee is then a step or a bounce) */
const HIP_Y = 149;
/** Hip joints either side of the hips' middle, the waist above it, the shoulders' line above that, and the head's middle. */
const HIP_W = 9;
const WAIST = 16;
const TORSO = 30;
const SHOULDER_W = 17.5;
const NECK = 26;
const THIGH = 29;
const SHIN = 28.5;
const UPPER = 23;
const FORE = 21;
/** Ankles at rest (the soles are 8 lower). */
const FOOT: { L: P; R: P } = { L: [105, 206], R: [135, 206] };

const out = (p: number) => 1 - Math.pow(1 - p, 3);
const clamp01 = (p: number) => Math.max(0, Math.min(1, p));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpP = (a: P, b: P, k: number): P => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const rot = ([x, y]: P, deg: number): P => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
};

/** Standing: feet under the hips, arms down. */
function stand(): Pose {
  return {
    x: 0,
    hip: [CX, HIP_Y],
    roll: 0,
    lean: 0,
    tilt: 0,
    shrug: 0,
    L: [...FOOT.L],
    R: [...FOOT.R],
    sL: 1,
    sR: 1,
    toeL: 0,
    toeR: 0,
    litL: false,
    litR: false,
    HL: [-7, 40],
    HR: [7, 40],
    onL: 0,
    onR: 0,
    ribbon: 0,
  };
}

/**
 * The basic step, "1 a 2", over a bar of `bar` beats (2 at speed): the leading foot forward (toward
 * you: lower on the screen, and drawn a little bigger), the other foot taps, the leading foot back.
 * The right foot leads the first bar, the left the next. Returns how far forward the leading foot is
 * (signed: + for the right foot) for the arms to swing against.
 */
function basic(P: Pose, k: number, bar: number): number {
  const n = Math.floor(k / bar);
  const p = ((k - n * bar) / bar) * 2;
  const leadR = n % 2 === 0;
  let fwd = 0;
  let tap = 0;
  if (p < 0.75) fwd = out(p / 0.75); // "1": the leading foot forward
  else if (p < 1) {
    fwd = 1; // "a": the other foot taps
    tap = Math.sin((Math.PI * (p - 0.75)) / 0.25);
  } else fwd = 1 - out(p - 1); // "2": back in place
  const side = leadR ? 1 : -1;
  const lead: P = [FOOT[leadR ? "R" : "L"][0] + side * 5 * fwd, FOOT.R[1] + 10 * fwd];
  const other: P = [FOOT[leadR ? "L" : "R"][0], FOOT.L[1] - 9 * tap];
  if (leadR) {
    P.R = lead;
    P.L = other;
    P.sR = 1 + 0.17 * fwd;
    P.toeL = 20 * tap;
    P.litR = fwd > 0.35;
    P.litL = tap > 0.3;
  } else {
    P.L = lead;
    P.R = other;
    P.sL = 1 + 0.17 * fwd;
    P.toeR = 20 * tap;
    P.litL = fwd > 0.35;
    P.litR = tap > 0.3;
  }
  // (the weight goes with the leading foot)
  P.hip[0] += side * 3.5 * fwd;
  P.roll = -side * 3.5 * fwd;
  return side * fwd;
}

/** Where a fist is with the arm bent in front of the body: the screen's left arm's, from its shoulder. */
const FIST: P = [5, 22];
/** The right arm's: the same, mirrored. */
const mirror = ([x, y]: P): P => [-x, y];

/** Arms bent, fists in front of the body, pumping against the feet like a runner's: `a` from -1 to 1. */
function pump(P: Pose, a: number, much = 1) {
  const k = 0.5 + 0.5 * a * much;
  const down: P = [1, 36];
  const up: P = [9, 8];
  P.HL = lerpP(down, up, k);
  P.HR = lerpP(mirror(up), mirror(down), k);
}

/** The bounce: down between the beats, up on them. */
const bounce = (k: number, deep = 5) => deep * (0.5 - 0.5 * Math.cos(2 * Math.PI * k));

/** One figure at its beat `k` (0 up to its length). */
function figure(fig: Fig, k: number): Pose {
  const P = stand();
  switch (fig) {
    case "slow": {
      const a = basic(P, k, 4);
      pump(P, a, 0.6);
      P.tilt = 3 * a;
      return P;
    }
    case "step": {
      const a = basic(P, k, 2);
      pump(P, a);
      P.tilt = 3 * a;
      return P;
    }
    case "bounce": {
      const a = basic(P, k, 2);
      pump(P, a);
      P.hip[1] += bounce(k, 6);
      P.tilt = 4 * a;
      return P;
    }
    case "side": {
      // Step and close, twice toward the screen's right, then twice back.
      const STEP = 15;
      const back = k >= 4;
      const dir = back ? -1 : 1;
      const kk = back ? k - 4 : k;
      const n = Math.min(1, Math.floor(kk / 2));
      const q = kk - n * 2;
      const from = (back ? 2 * STEP : 0) + dir * n * STEP;
      const a = out(clamp01(q / 0.7));
      const b = q < 1 ? 0 : out(clamp01((q - 1) / 0.7));
      const lift = (p: number) => 6 * Math.sin(Math.PI * clamp01(p));
      const lead: P = [from + dir * STEP * a, -lift(q / 0.7)];
      const other: P = [from + dir * STEP * b, q < 1 ? 0 : -lift((q - 1) / 0.7)];
      const [r, l] = dir > 0 ? [lead, other] : [other, lead];
      P.R = add(FOOT.R, r);
      P.L = add(FOOT.L, l);
      P.x = from + dir * STEP * (a + b) * 0.5;
      P.hip[0] += P.x;
      P.roll = -dir * 4 * Math.sin(Math.PI * clamp01(q));
      const sw = dir * (q < 1 ? out(clamp01(q)) : 1 - out(clamp01(q - 1)));
      // (both fists swing the way she's going)
      P.HL = add(FIST, [8 * sw, -4 * Math.abs(sw)]);
      P.HR = add(mirror(FIST), [8 * sw, -4 * Math.abs(sw)]);
      P.lean = 3 * sw;
      P.tilt = 3 * sw;
      const moving = q < 1 ? q < 0.75 : q - 1 < 0.75;
      if (dir > 0) {
        P.litR = q < 1 && moving;
        P.litL = q >= 1 && moving;
      } else {
        P.litL = q < 1 && moving;
        P.litR = q >= 1 && moving;
      }
      return P;
    }
    case "hips": {
      // Feet still, a little apart; the hips go to a side on every beat, the shoulders stay over the feet.
      const sway = 8 * clamp01(k * 2) * -Math.cos(Math.PI * k);
      P.L[0] -= 3;
      P.R[0] += 3;
      P.hip[0] += sway;
      P.hip[1] += 2;
      P.roll = -sway * 1.2;
      P.lean = -sway * 0.9;
      P.tilt = sway * 1.3;
      P.onL = P.onR = clamp01(k * 2.5) * clamp01((8 - k) * 4);
      // (lit from early in the beat: with reduced motion each beat is one still pose, taken 0.4 of the way in)
      P.litR = sway > 1.9;
      P.litL = sway < -1.9;
      return P;
    }
    case "hands": {
      basic(P, k, 2);
      P.hip[1] += bounce(k);
      const sw = Math.sin(Math.PI * k);
      P.HL = [-9 + 9 * sw, -40 + 2 * Math.abs(sw)];
      P.HR = [9 + 9 * sw, -40 + 2 * Math.abs(sw)];
      P.lean = 4 * sw;
      P.tilt = 3 * sw;
      P.ribbon = clamp01(k * 2) * clamp01((8 - k) * 2);
      return P;
    }
    case "shake": {
      // Feet still and wide, knees soft; the shoulders shake twice a beat, the arms out with them.
      P.L[0] -= 5;
      P.R[0] += 5;
      P.hip[1] += 3 + 1.5 * Math.sin(2 * Math.PI * k);
      P.shrug = 6 * Math.sin(4 * Math.PI * k);
      P.HL = [-25, -1 + P.shrug * 1.3];
      P.HR = [25, -1 - P.shrug * 1.3];
      P.lean = 3 * Math.sin(Math.PI * k) + 0.5 * P.shrug;
      P.tilt = -P.lean;
      return P;
    }
    case "all": {
      basic(P, k, 2);
      P.hip[1] += bounce(k, 6);
      // one hand up and then the other, a beat each
      const u = 0.5 - 0.5 * Math.cos(Math.PI * k);
      P.HL = lerpP(FIST, [-10, -40], u);
      P.HR = lerpP(mirror(FIST), [10, -40], 1 - u);
      P.lean = 4 * (2 * u - 1);
      P.tilt = 4 * (2 * u - 1);
      P.ribbon = clamp01(k * 2);
      return P;
    }
  }
}

/** The pose at the end: feet apart, a hand on the hip, the other to the sky. */
function finale(): Pose {
  const P = stand();
  P.L[0] -= 6;
  P.R[0] += 6;
  P.hip[0] += 4;
  P.roll = -6;
  P.lean = 3;
  P.tilt = 6;
  P.onL = 1;
  P.HR = [14, -41];
  return P;
}

/** Between two poses (the footprints are those of the one it's nearer). */
function mix(a: Pose, b: Pose, k: number): Pose {
  const n = (x: number, y: number) => lerp(x, y, k);
  return {
    x: n(a.x, b.x),
    hip: lerpP(a.hip, b.hip, k),
    roll: n(a.roll, b.roll),
    lean: n(a.lean, b.lean),
    tilt: n(a.tilt, b.tilt),
    shrug: n(a.shrug, b.shrug),
    L: lerpP(a.L, b.L, k),
    R: lerpP(a.R, b.R, k),
    sL: n(a.sL, b.sL),
    sR: n(a.sR, b.sR),
    toeL: n(a.toeL, b.toeL),
    toeR: n(a.toeR, b.toeR),
    litL: (k < 0.5 ? a : b).litL,
    litR: (k < 0.5 ? a : b).litR,
    HL: lerpP(a.HL, b.HL, k),
    HR: lerpP(a.HR, b.HR, k),
    onL: n(a.onL, b.onL),
    onR: n(a.onR, b.onR),
    ribbon: n(a.ribbon, b.ribbon),
  };
}

/** Which figure beat `b` of the lesson is in, and the beat within it; null once the pose is up. */
function figureAt(b: number, short: boolean): { fig: Fig; i: number; k: number; beats: number } | null {
  let from = 0;
  const list = figures(short);
  for (let i = 0; i < list.length; i++) {
    if (b < from + list[i].beats) return { fig: list[i].fig, i, k: b - from, beats: list[i].beats };
    from += list[i].beats;
  }
  return null;
}

/** How long one figure's arms and hips take to become the next one's, in beats. */
const BLEND = 0.5;

/** The teacher at beat `b` (fractional) of the lesson. */
export function poseAt(b: number, short = false): Pose {
  const at = figureAt(Math.max(0, b), short);
  const list = figures(short);
  if (!at) {
    // the pose, struck in a quarter of a beat
    const last = list[list.length - 1];
    const k = (b - danceBeats(short)) / 0.25;
    return k >= 1 ? finale() : mix(figure(last.fig, last.beats), finale(), out(clamp01(k)));
  }
  const P = figure(at.fig, at.k);
  if (at.i === 0 || at.k >= BLEND) return P;
  const prev = list[at.i - 1];
  return mix(figure(prev.fig, prev.beats), P, out(at.k / BLEND));
}

/**
 * Before the lesson: standing ready. While the team hasn't pressed Start, a wave of the hand (`x`: ms
 * she has waved); through the countdown, hands on hips and a dip of the knees to each numeral (`x`:
 * numerals gone by).
 */
function waiting(phase: "ready" | "count", x: number): Pose {
  const P = stand();
  if (phase === "ready") {
    const w = Math.sin((x / 1000) * Math.PI * 2.2);
    P.HR = [17 + 5 * w, -30];
    P.tilt = 3 + w;
    P.lean = 1.5;
    P.onL = 1;
  } else {
    P.hip[1] += 3 * (0.5 - 0.5 * Math.cos(x * 2 * Math.PI));
    P.onL = P.onR = 1;
  }
  return P;
}

// ---------- what to say ----------

type Cue = { at: number; key: Key };

const CUES: { long?: Cue[]; short?: Cue[] } = {};

/** The word for each stretch of the lesson, by the beat it starts on: shown, and spoken a little ahead. */
function cues(short: boolean): Cue[] {
  const made = CUES[short ? "short" : "long"];
  if (made) return made;
  const list: Cue[] = (CUES[short ? "short" : "long"] = []);
  let from = 0;
  for (const f of figures(short)) {
    switch (f.fig) {
      case "slow":
        list.push({ at: from, key: "sambaSlowR" }, { at: from + 4, key: "sambaSlowL" });
        break;
      case "step":
        for (let k = 0; k < f.beats; k += 2) list.push({ at: from + k, key: (k / 2) % 2 ? "sambaLeft" : "sambaRight" });
        break;
      case "bounce":
        list.push({ at: from, key: "sambaBounce" });
        break;
      case "side":
        list.push({ at: from, key: "sambaSideR" }, { at: from + 4, key: "sambaSideL" });
        break;
      case "hips":
        list.push({ at: from, key: "sambaHips" });
        break;
      case "hands":
        list.push({ at: from, key: "sambaHands" });
        break;
      case "shake":
        list.push({ at: from, key: "sambaShake" });
        break;
      case "all":
        list.push({ at: from, key: "sambaAll" });
        break;
    }
    from += f.beats;
  }
  list.push({ at: from, key: "sambaHey" });
  return list;
}

/** The cue up at beat `b`. */
export function cueAt(b: number, short = false): Key {
  let key: Key = "sambaReady";
  for (const c of cues(short)) if (b >= c.at) key = c.key;
  return key;
}

/** The count beside it: "1 a 2" through the step, the beat's number in the other figures. */
function countAt(b: number, short: boolean): string {
  const at = figureAt(b, short);
  if (b < 0) return "";
  if (!at) return t("sambaHey").replace(/[!！]/g, "");
  if (at.fig === "side" || at.fig === "hips" || at.fig === "shake") return String(Math.floor(at.k) + 1);
  const bar = at.fig === "slow" ? 4 : 2;
  const p = (((at.k % bar) + bar) % bar) / bar;
  return p < 0.375 ? "1" : p < 0.5 ? "a" : "2";
}

// ---------- drawing ----------

const SKIN = "#e0a674";
const SKIN_EDGE = "#b97b4b";
const HAIR = "#6b3a22";
/** The spot on the floor under each foot: lit when that foot is the one to move. */
const SPOT = "rgba(245,244,253,.14)";
const GOLD = "#ffd36e";
const PAPER = "#f1e6cf";
const FEATHERS = ["#ff4d6d", "#ffb82e", "#4be38f", "#56b4e9", "#cc79a7"];

/** A limb's shape from its joint down: `len` long, `w0` wide at the joint and `w1` at its end, both ends round. */
const limb = (len: number, w0: number, w1: number) => {
  const a = w0 / 2;
  const b = w1 / 2;
  return `M${-a} 0A${a} ${a} 0 0 1 ${a} 0L${b} ${len}A${b} ${b} 0 0 1 ${-b} ${len}Z`;
};

/**
 * Where the joint between two bones is, from `a` to `b`: of the two ways it can bend, the one further
 * out from the body's middle (`side`: -1 for the screen's left limb), and for an arm held out level,
 * the lower one.
 */
function bend(a: P, b: P, l1: number, l2: number, side: number): P {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 0.001;
  const dd = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, d));
  const ux = dx / d;
  const uy = dy / d;
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const p: P = [a[0] + ux * along - uy * off, a[1] + uy * along + ux * off];
  const q: P = [a[0] + ux * along + uy * off, a[1] + uy * along - ux * off];
  const outer = (j: P) => side * j[0] + 0.6 * j[1];
  return outer(p) >= outer(q) ? p : q;
}

/** A point no further than `max` from `a`. */
function reach(a: P, b: P, max: number): P {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return d <= max ? b : [a[0] + ((b[0] - a[0]) * max) / d, a[1] + ((b[1] - a[1]) * max) / d];
}

/** A bone's turn from straight down, to lie from `a` to `b` (degrees, as SVG turns). */
const turn = (a: P, b: P) => (Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * 180) / Math.PI;

/**
 * The teacher's parts. Each is a small drawing of its own, round its joint, and a layer of its own on
 * the page: a frame moves it by a CSS transform, which the phone's compositor does without drawing
 * anything again. Its box in the pose's units, from the joint: left, top, width, height.
 */
const BOX = {
  shadow: [-72, -11, 144, 22],
  spotL: [-17, -7, 34, 14],
  spotR: [-17, -7, 34, 14],
  thighL: [-8, -8, 16, 45],
  shinL: [-7, -7, 14, 42],
  footL: [-18, -6, 26, 16],
  thighR: [-8, -8, 16, 45],
  shinR: [-7, -7, 14, 42],
  footR: [-8, -6, 26, 16],
  hips: [-24, -18, 48, 35],
  torso: [-20, -44, 40, 51],
  head: [-34, -54, 68, 75],
  upperL: [-9, -10, 18, 41],
  foreL: [-9, -6, 18, 41],
  upperR: [-9, -10, 18, 41],
  foreR: [-9, -6, 18, 41],
} satisfies Record<string, [number, number, number, number]>;
type Part = keyof typeof BOX;
/** The parts' elements, and the few shapes inside them that change: each spot's light, the two ribbons. */
type Parts = Partial<Record<Part, HTMLElement | null> & Record<"litL" | "litR" | "ribbonL" | "ribbonR", SVGElement | null>>;

const f1 = (n: number) => n.toFixed(1);
/** Put a part's joint at `a` (the pose's units), turned and scaled about it. (A translate's % is of the part's own box.) */
function place(parts: Parts, name: Part, a: P, deg = 0, scale = 1) {
  const el = parts[name];
  if (!el) return;
  const [, , w, h] = BOX[name];
  el.style.transform = `translate(${((100 * a[0]) / w).toFixed(2)}%,${((100 * a[1]) / h).toFixed(2)}%) rotate(${f1(deg)}deg)${scale === 1 ? "" : ` scale(${scale.toFixed(3)})`}`;
}

/** Put the teacher's parts where the pose says: a transform each, nothing drawn again. `b`: the beat, for the ribbons' wave. */
function draw(parts: Parts, P: Pose, b: number) {
  const hipL = add(P.hip, rot([-HIP_W, 0], P.roll));
  const hipR = add(P.hip, rot([HIP_W, 0], P.roll));
  const waist = add(P.hip, rot([0, -WAIST], P.roll * 0.5));
  const mid = add(waist, rot([0, -TORSO], P.lean));
  const shL = add(add(mid, rot([-SHOULDER_W, 0], P.lean)), [0, -P.shrug]);
  const shR = add(add(mid, rot([SHOULDER_W, 0], P.lean)), [0, P.shrug]);
  const head = add(mid, rot([0, -NECK], P.lean + P.tilt * 0.5));
  // legs: the ankles are where the pose puts them, the knees bend outward
  const L = reach(hipL, P.L, (THIGH + SHIN) * P.sL - 0.1);
  const R = reach(hipR, P.R, (THIGH + SHIN) * P.sR - 0.1);
  const kneeL = bend(hipL, L, THIGH * P.sL, SHIN * P.sL, -1);
  const kneeR = bend(hipR, R, THIGH * P.sR, SHIN * P.sR, 1);
  place(parts, "thighL", hipL, turn(hipL, kneeL), P.sL);
  place(parts, "shinL", kneeL, turn(kneeL, L), P.sL);
  place(parts, "footL", L, -P.toeL, P.sL);
  place(parts, "thighR", hipR, turn(hipR, kneeR), P.sR);
  place(parts, "shinR", kneeR, turn(kneeR, R), P.sR);
  place(parts, "footR", R, P.toeR, P.sR);
  place(parts, "hips", P.hip, P.roll);
  place(parts, "torso", waist, P.lean);
  place(parts, "head", head, P.lean + P.tilt);
  // arms: each wrist from its shoulder, or on its hip (at the waist, so the elbow stands out)
  const wristL = reach(shL, lerpP(add(shL, P.HL), add(hipL, [-11, -13]), P.onL), UPPER + FORE - 0.5);
  const wristR = reach(shR, lerpP(add(shR, P.HR), add(hipR, [11, -13]), P.onR), UPPER + FORE - 0.5);
  const elL = bend(shL, wristL, UPPER, FORE, -1);
  const elR = bend(shR, wristR, UPPER, FORE, 1);
  place(parts, "upperL", shL, turn(shL, elL));
  place(parts, "foreL", elL, turn(elL, wristL));
  place(parts, "upperR", shR, turn(shR, elR));
  place(parts, "foreR", elR, turn(elR, wristR));
  // the floor: her shadow, and the spot under each foot (drawn again only when its light changes)
  place(parts, "shadow", [CX + P.x, 226]);
  place(parts, "spotL", [P.L[0] - 3, 222.5]);
  place(parts, "spotR", [P.R[0] + 3, 222.5]);
  for (const [el, lit] of [
    [parts.litL, P.litL],
    [parts.litR, P.litR],
  ] as [SVGElement | null | undefined, boolean][]) {
    const fill = lit ? "var(--gel)" : SPOT;
    if (el && el.getAttribute("fill") !== fill) el.setAttribute("fill", fill);
  }
  // the ribbons are the one thing drawn again as they fly (two lines, in the two figures that have them)
  for (const [el, wrist, dir] of [
    [parts.ribbonL, wristL, -1],
    [parts.ribbonR, wristR, 1],
  ] as [SVGElement | null | undefined, P, number][]) {
    if (!el) continue;
    if (P.ribbon <= 0.01) {
      if (el.getAttribute("opacity") !== "0") el.setAttribute("opacity", "0");
      continue;
    }
    el.setAttribute("opacity", P.ribbon.toFixed(2));
    el.setAttribute("d", `M${f1(wrist[0])} ${f1(wrist[1])}q${dir * 18} ${f1(-12 + 8 * Math.sin(b * Math.PI))} ${dir * 36} 0t${dir * 34} 0`);
  }
}

const pc = (n: number) => `${((100 * n) / 240).toFixed(3)}%`;

/** The teacher, drawn once: each part a small drawing the pose moves (draw). `color`: the dancing team's. */
function Teacher({ parts, color, happy }: { parts: { current: Parts }; color: string; happy: boolean }) {
  const hold = (name: keyof Parts) => (el: Element | null) => void ((parts.current as Record<string, Element | null>)[name] = el);
  /** One part: its box round its joint, turning about the joint. */
  const part = (name: Part, drawing: ComponentChildren) => {
    const [x, y, w, h] = BOX[name];
    return (
      <div
        class="samba-part"
        ref={hold(name)}
        style={{ left: pc(x), top: pc(y), width: pc(w), height: pc(h), transformOrigin: `${((-100 * x) / w).toFixed(3)}% ${((-100 * y) / h).toFixed(3)}%` }}
      >
        <svg viewBox={`${x} ${y} ${w} ${h}`}>{drawing}</svg>
      </div>
    );
  };
  // (limbs have no outline: a thigh and its shin, an arm and its forearm are one shape, bent)
  const skin = { fill: SKIN };
  const face = { fill: SKIN, stroke: SKIN_EDGE, "stroke-width": 1.2 };
  const cloth = { fill: color, stroke: PAPER, "stroke-width": 1.6, "stroke-linejoin": "round" as const };
  const shoe = (
    <>
      <path d="M5 -3.5L5 8L-12.5 8Q-16 7.4 -14.2 4.2Q-9.5 1.5 -5 -3.5Z" fill={GOLD} stroke={INK} stroke-width="1" stroke-linejoin="round" />
      <path d="M5 4.6L-13.6 4.6" fill="none" stroke={INK} stroke-width="0.9" opacity="0.45" />
    </>
  );
  const arm = (upper: Part, fore: Part, flip: boolean) => (
    <>
      {part(
        upper,
        <>
          <path d={limb(UPPER, 9.4, 8)} {...skin} />
          {/* the sleeve */}
          <path d="M-6 -3.2Q0 -7.4 6 -3.2L5.5 8.5Q0 10.6 -5.5 8.5Z" {...cloth} stroke-width="1.4" />
        </>,
      )}
      {part(
        fore,
        <>
          <path d={limb(FORE, 7.8, 6.2)} {...skin} />
          {/* the hand, its thumb toward the body */}
          <ellipse cx="0" cy={FORE + 3.6} rx="5" ry="5.8" {...skin} />
          <ellipse cx={flip ? -4.2 : 4.2} cy={FORE + 1.6} rx="2" ry="3.2" transform={`rotate(${flip ? 28 : -28} ${flip ? -4.2 : 4.2} ${FORE + 1.6})`} {...skin} />
          <path d={`M-3.5 ${FORE - 2.4}L3.5 ${FORE - 2.4}`} stroke={GOLD} stroke-width="2.6" stroke-linecap="round" />
        </>,
      )}
    </>
  );
  const leg = (thigh: Part, shin: Part, foot: Part, flip: boolean) => (
    <>
      {part(thigh, <path d={limb(THIGH, 13, 10.4)} {...skin} />)}
      {part(
        shin,
        <>
          <path d={limb(SHIN, 10.2, 7.4)} {...skin} />
          {/* the knee */}
          <path d="M-3 1.2Q0 3.6 3 1.2" fill="none" stroke={SKIN_EDGE} stroke-width="1.2" stroke-linecap="round" />
        </>,
      )}
      {part(foot, flip ? <g transform="scale(-1 1)">{shoe}</g> : shoe)}
    </>
  );
  return (
    <>
      {/* her shadow on the floor, and the spot under each foot */}
      {part("shadow", <ellipse cx="0" cy="0" rx="70" ry="9" fill="rgba(0,0,0,.35)" />)}
      {part("spotL", <ellipse ref={hold("litL")} cx="0" cy="0" rx="15.5" ry="5.6" fill={SPOT} />)}
      {part("spotR", <ellipse ref={hold("litR")} cx="0" cy="0" rx="15.5" ry="5.6" fill={SPOT} />)}
      <svg class="samba-ribbons" viewBox="0 0 240 240">
        <path ref={hold("ribbonL")} fill="none" stroke="#ffb82e" stroke-width="5" stroke-linecap="round" opacity="0" />
        <path ref={hold("ribbonR")} fill="none" stroke="#56b4e9" stroke-width="5" stroke-linecap="round" opacity="0" />
      </svg>
      {leg("thighL", "shinL", "footL", false)}
      {leg("thighR", "shinR", "footR", true)}
      {part(
        "hips",
        <>
          {/* the skirt, its hem in scallops, sequins along it */}
          <path d="M-12.5 -15L12.5 -15L21 9Q15.5 14 10.5 9.5Q5 14 0 9.5Q-5 14 -10.5 9.5Q-15.5 14 -21 9Z" {...cloth} />
          {[-13, -6.5, 0, 6.5, 13].map((x, i) => (
            <circle key={i} cx={x} cy={i % 2 ? -1 : 3} r="1.9" fill={GOLD} />
          ))}
        </>,
      )}
      {part(
        "torso",
        <>
          <path d="M-5.2 -27L-5.2 -41L5.2 -41L5.2 -27Z" fill={SKIN} />
          <ellipse cx="0" cy="-29.5" rx="8.5" ry="4" fill={SKIN} />
          <path d="M-12 1L-17 -27Q-17.5 -31 -13 -31.5L-6.5 -32Q0 -26 6.5 -32L13 -31.5Q17.5 -31 17 -27L12 1Q0 4 -12 1Z" {...cloth} />
          <path d="M-12 0.5Q0 3.8 12 0.5" fill="none" stroke={GOLD} stroke-width="3" stroke-linecap="round" />
          {[
            [-6, -19],
            [0, -15],
            [6, -19],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.7" fill={GOLD} />
          ))}
        </>,
      )}
      {part(
        "head",
        <>
          {/* feathers, from behind the head */}
          <g transform="translate(0 -11)">
            {FEATHERS.map((c, i) => (
              <path key={c} d="M0 0Q-7.5 -20 0 -40Q7.5 -20 0 0Z" fill={c} transform={`rotate(${(i - 2) * 25}) scale(${1 - Math.abs(i - 2) * 0.09})`} />
            ))}
          </g>
          <path d="M-19 -3Q-20.5 -22 0 -22Q20.5 -22 19 -3L18 12Q14.5 17.5 10 13L10 0L-10 0L-10 13Q-14.5 17.5 -18 12Z" fill={HAIR} />
          <circle cx="-16.6" cy="2.5" r="3" {...face} />
          <circle cx="16.6" cy="2.5" r="3" {...face} />
          <ellipse cx="0" cy="0" rx="16.5" ry="18.5" {...face} />
          <path d="M-16.2 -4.5Q-15 -19 0 -19.4Q15 -19 16.2 -4.5Q9 -11.5 1.5 -10.6Q-6.5 -10 -16.2 -4.5Z" fill={HAIR} />
          <path d="M-16.5 -9Q0 -16.5 16.5 -9" fill="none" stroke={GOLD} stroke-width="4" stroke-linecap="round" />
          <circle cx="0" cy="-13.4" r="3.1" fill="#ff5a3c" stroke={GOLD} stroke-width="1.4" />
          <Face x={0} y={0.5} s={0.72} mood={happy ? "happy" : "idle"} />
          <path d="M-1.5 3.6Q0.3 5.2 1.9 3.6" fill="none" stroke={SKIN_EDGE} stroke-width="1.3" stroke-linecap="round" />
        </>,
      )}
      {arm("upperL", "foreL", false)}
      {arm("upperR", "foreR", true)}
    </>
  );
}

// ---------- the lesson on a screen ----------

/**
 * The lesson, from the ready card to the pose. `size`: "full" covers the dancing team's phone (the
 * ready card with its Start button, the countdown, the lesson); "small" sits over another team's
 * judging buttons; "tv" fills the big screen's board.
 */
export function SambaLesson({ v, size }: { v: RoomView; size: "full" | "small" | "tv" }) {
  const clock = useDanceClock(v);
  const root = useRef<HTMLDivElement>(null);
  const parts = useRef<Parts>({});
  // (the frames below ask for the words around the teacher to be drawn again when they change)
  const [, redraw] = useState(0);
  const now = gameNow(v);
  const frozen = v.game?.frozenAt ?? null;
  const team = clock ? teamOf(v, clock.seat) : undefined;
  const color = team ? TEAM_COLORS[team.color] : "#ff8a6b";
  const reduced = reducedMotion();
  const screenOn = v.members.some((m) => m.role === "screen" && m.online);
  const speaker = !!clock && (v.you.role === "screen" || (!screenOn && v.you.seats.includes(clock.seat)));
  const beat0 = clock?.beat0 ?? null;
  const beat = clock?.beat ?? 600;
  const short = clock?.short ?? false;
  const mine = !!clock && v.you.seats.includes(clock.seat);
  const [sent, setSent] = useState(false);
  const autoLeft = useCountdown(clock?.phase === "ready" ? clock.auto : null);

  // The whistle through the countdown, the band and the spoken words through the lesson: on the audio
  // clock and timers from the server's beat 0. (Nothing while the game stands still: it starts again,
  // in time, when the game goes on.)
  useEffect(() => {
    if (beat0 === null || !clock || clock.over || frozen !== null) return;
    const ahead = (beat0 - serverNow()) / 1000;
    let stop = () => {};
    if (speaker && audioReady()) {
      if (clock.count > 0) sambaCount(ahead, COUNT_STEPS, clock.count / COUNT_STEPS / 1000);
      stop = samba(ahead, clock.beats, beat / 1000);
    }
    const timers: number[] = [];
    const voice = typeof speechSynthesis !== "undefined" && speaker && audioReady();
    if (voice)
      for (const c of cues(short)) {
        const at = beat0 + c.at * beat - 150 - serverNow();
        if (at < -100) continue;
        timers.push(
          window.setTimeout(() => {
            try {
              // (the words, not the punctuation between them)
              const u = new SpeechSynthesisUtterance(t(c.key));
              u.lang = getLang() === "zh" ? "zh-CN" : "en-US";
              u.rate = 1.25;
              speechSynthesis.speak(u);
            } catch {
              // no voice on this device: the words are on screen
            }
          }, Math.max(0, at)),
        );
      }
    return () => {
      stop();
      timers.forEach(clearTimeout);
      if (voice) speechSynthesis.cancel();
    };
  }, [beat0, speaker, frozen, beat, short]);

  // The teacher, every frame: each part gets its place (a transform), nothing is drawn again.
  const live = !!clock;
  // (the newest view, for the frames)
  const latest = useRef(v);
  latest.current = v;
  useLayoutEffect(() => {
    if (!live) return;
    let raf = 0;
    let said = "";
    let stood = "";
    let flashed = false;
    let drawn = NaN;
    const started = performance.now();
    const step = () => {
      const view = latest.current;
      const d = view.game?.dance;
      if (!d) return;
      const nowS = gameNow(view);
      // (the game stands still, a pause: so does she, and there's nothing to move)
      if (nowS === drawn && d.at !== null) return;
      drawn = nowS;
      const c = clockOf(d, nowS);
      const before = c.beat0 === null || nowS < c.beat0;
      const b = before ? -1 : Math.min((nowS - c.beat0!) / c.beat, c.beats + HOLD);
      // What the words and the count say changes once or twice a beat at most: the page around the
      // teacher is drawn again only then.
      const words = c.beat0 === null ? "ready" : before ? `c${numeralAt(c, nowS)}` : `${cueAt(b, c.short)}|${countAt(b, c.short)}`;
      if (words !== said) {
        said = words;
        redraw((n) => n + 1);
      }
      if (reduced) {
        // Reduced motion: the teacher stands still, in each beat's pose for the whole beat (the lit
        // spots under her feet, the words and the count do the teaching), and just stands until the
        // lesson starts.
        const pose = c.beat0 === null ? "ready" : before ? "count" : `b${Math.floor(b)}`;
        if (pose !== stood) {
          stood = pose;
          draw(parts.current, before ? waiting(c.beat0 === null ? "ready" : "count", 0) : { ...poseAt(Math.floor(b) + 0.4, c.short), ribbon: 0 }, 0);
        }
      } else if (c.beat0 === null) draw(parts.current, waiting("ready", performance.now() - started), 0);
      else if (before) draw(parts.current, waiting("count", c.count > 0 ? (COUNT_STEPS * (c.count - (c.beat0 - nowS))) / c.count : 0), 0);
      else draw(parts.current, poseAt(b, c.short), b);
      if (b >= c.beats && !flashed && !reduced) {
        flashed = true;
        root.current?.classList.add("hey");
      }
      if (c.end !== null && nowS > c.end + 1500) cancelAnimationFrame(raf);
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      step();
    };
    // (placed before the first paint: the parts are drawn at the box's corner until they are)
    step();
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, beat0, reduced]);

  // The ready card sits under the top bar (the menu stays in reach: the sound may still be off).
  const [top, setTop] = useState(0);
  const ready = clock?.phase === "ready";
  useLayoutEffect(() => {
    if (size !== "full" || !ready) return;
    const measure = () => setTop(Math.max(0, Math.round(document.querySelector(".game > .top")?.getBoundingClientRect().bottom ?? 0)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [size, ready]);
  // Start can be pressed again if the room hasn't answered in two seconds (a phone that was offline for a moment).
  useEffect(() => {
    if (!ready) return setSent(false);
    if (!sent) return;
    const id = window.setTimeout(() => setSent(false), 2000);
    return () => clearTimeout(id);
  }, [ready, sent]);

  // The teacher's drawing is made once (and again only when her smile changes): the frames move its parts.
  const b = beat0 === null ? -1 : (now - beat0) / beat;
  const happy = !!clock && (clock.phase === "ready" || (clock.phase !== "count" && b >= clock.beats));
  const teacher = useMemo(() => <Teacher parts={parts} color={color} happy={happy} />, [color, happy]);

  if (!clock) return null;
  const who = seatName(v, clock.seat);
  const cue =
    clock.phase === "over"
      ? t("sambaDone")
      : clock.phase === "ready"
        ? size === "full" && mine
          ? t("sambaReadyTitle")
          : t("sambaWait", { team: who })
        : clock.phase === "count"
          ? t("sambaReady")
          : t(cueAt(b, short));
  const count = clock.phase === "count" ? String(numeralAt(clock, now) || 1) : clock.phase === "dance" ? countAt(b, short) : "";
  const card = size === "full" && ready;
  return (
    <div
      class={`samba samba-${size} ${clock.phase}`}
      ref={root}
      role={card ? "dialog" : "img"}
      aria-label={card ? t("sambaReadyTitle") : clock.phase === "ready" || clock.phase === "over" ? cue : t("sambaFollow")}
      style={card && top ? { top: `${top}px` } : undefined}
      data-phase={clock.phase}
    >
      <div class="samba-fig" aria-hidden="true">
        {teacher}
      </div>
      <p class="samba-cue">{cue}</p>
      {card ? (
        <>
          {v.you.seats.length > 1 && <p class="samba-who">{who}</p>}
          {/* (the game's own numbers: a test's room runs its clocks faster) */}
          <p class="samba-how">{t("sambaReadyHow", { count: COUNT_STEPS, secs: TIMING.dance / 1000 })}</p>
          <HapticBtn
            kind="primary"
            wide
            disabled={sent}
            onClick={() => {
              setSent(true);
              send({ t: "dance-go" });
            }}
          >
            {t("sambaGo")}
          </HapticBtn>
          <p class="samba-auto">{autoLeft !== null && autoLeft <= 15 ? t("sambaAuto", { n: autoLeft }) : ""}</p>
        </>
      ) : (
        <>
          <p class="samba-count num">{count}</p>
          {size !== "small" && clock.phase !== "ready" && <p class="samba-who">{t("sambaWho", { team: who })}</p>}
          {size === "full" && <p class="samba-tip">{t("sambaFollow")}</p>}
        </>
      )}
    </div>
  );
}
