/**
 * What the two performers do while a song plays: the choreography (a move per eight beats, picked
 * for the song's mood), the singer's gestures (no microphone: hands on the chest, reaching out, arms
 * open on the big notes), and the face (blinks, winks with a sparkle, smiles, a flirty glance, tears
 * in a sad song, hearts in a love song).
 *
 * Every choice is a function of the song and the beat number, never of the clock or Math.random, so
 * every phone at the table shows the same dance at the same moment.
 */
import { gsap, reduced } from "../../lib/anim";
import type { BeatMap } from "../../lib/beats";
import type { MoodHint } from "../../shared/songs";
import { restPose, type Kind, type Performer, type Pose } from "./performer";

export type Mood = "hype" | "rock" | "happy" | "groove" | "love" | "tender" | "sad" | "classic";
export type Role = "sing" | "dance" | "idle";
export type Cue = "right" | "wrong";

/* ------------------------------------------------------------------ the song's mood */

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/**
 * The title and categories say what kind of song it is; the music says how hard it hits. Loudness
 * is the best single clue (measured on 96 previews: dance, rock and rap masters 0.35-0.6, ballads and
 * folk 0.1-0.3, classical under 0.2); the tempo estimate wanders too much to lead.
 */
export function resolveMood(hint: MoodHint | string, m: BeatMap | null): Mood {
  const e = m ? clamp((m.loud - 0.15) / 0.35) : 0.5;
  const fast = !!m && m.bpm >= 112;
  switch (hint) {
    case "sad":
      return "sad";
    case "love":
      return e > 0.7 && fast ? "happy" : "love";
    case "hype":
      return e < 0.25 ? "happy" : "hype";
    case "rock":
      return e < 0.22 ? "tender" : "rock";
    case "groove":
      return e < 0.2 ? "tender" : "groove";
    case "classic":
      return e > 0.6 && fast ? "happy" : "classic";
  }
  if (!m) return "happy";
  if (e > 0.62 && (fast || m.conf > 0.4)) return "hype";
  if (e > 0.42) return fast ? "happy" : "groove";
  if (e > 0.2) return fast ? "happy" : "tender";
  return "tender";
}

/* ------------------------------------------------------------------ same dice on every phone */

export function seedOf(key: string | number): number {
  const s = String(key);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** A number in [0, 1) that depends only on its arguments. */
function rnd(seed: number, a: number, b = 0) {
  let h = seed ^ Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ moves */

type T = Partial<Pose>;
/** Who is moving: shoulder and hip widths, which side leads this phrase, which way the partner is. */
type Ctx = { kind: Kind; sx: number; hip: number; s: number; inw: number };
type Fx = "heart" | "sparkle" | "wink" | "tear" | "woo" | "joy" | "spin" | "glance" | "wipe";
type Key = { at?: number; d?: number; e?: string; to?: T; fx?: Fx[] };
type Move = { id: string; beat: (b: number, c: Ctx) => Key[] };

/** A hand `out` units outside its shoulder (negative: across the body), at height y (torso space). */
const hand = (c: Ctx, side: number, out: number, y: number): T => (side < 0 ? { hLx: 100 - (c.sx + out), hLy: y } : { hRx: 100 + (c.sx + out), hRy: y });
/** A hand at an exact spot. */
const handAt = (side: number, x: number, y: number): T => (side < 0 ? { hLx: x, hLy: y } : { hRx: x, hRy: y });
const wrist = (side: number, deg: number): T => (side < 0 ? { wristL: deg } : { wristR: deg });
/** A foot `out` units outside its rest spot, lifted `lift` off the floor. */
const foot = (c: Ctx, side: number, out: number, lift: number): T => (side < 0 ? { fLx: 100 - (c.hip + 1 + out), fLy: 280 - lift } : { fRx: 100 + (c.hip + 1 + out), fRy: 280 - lift });
const both = (c: Ctx, out: number, y: number): T => ({ ...hand(c, -1, out, y), ...hand(c, 1, out, y) });
const feet = (c: Ctx, out: number, lift = 0): T => ({ ...foot(c, -1, out, lift), ...foot(c, 1, out, lift) });
const alt = (b: number) => (b % 2 ? 1 : -1);

const MOVES: Record<string, Move> = {
  /* ---- soft ---- */
  sway: {
    id: "sway",
    beat: (b, c) => {
      const s = alt(b);
      return [{ d: 1, e: "sine.inOut", to: { px: 5 * s, py: 1.5, lean: 3 * s, headTilt: -5 * s, ...hand(c, -1, 5 - 3 * s, 197), ...hand(c, 1, 5 + 3 * s, 197) } }];
    },
  },
  lighterWave: {
    // one arm up, swaying slowly over two beats, like a light held up at a concert
    id: "lighterWave",
    beat: (b, c) => {
      if (b % 2) return [];
      const s = (b >> 1) % 2 ? 1 : -1, up = c.s;
      return [{ d: 2, e: "sine.inOut", to: { ...hand(c, up, 14 + 12 * s * up, 100), ...wrist(up, -16 * s), ...hand(c, -up, 6, 186), px: 3 * s, lean: 2.5 * s, headTilt: -5 * s, py: 1 } }];
    },
  },
  handOnHeart: {
    id: "handOnHeart",
    beat: (b, c) => {
      const s = c.s, sw = alt(b >> 1);
      if (b % 2) return [];
      const reach = b >= 4;
      return [
        {
          d: 2,
          e: "sine.inOut",
          to: { ...handAt(s, 100 + s * 6, 166), ...wrist(s, 0), ...(reach ? { ...hand(c, -s, 44, 146), ...wrist(-s, s * 40) } : hand(c, -s, 6, 194)), px: 2.5 * sw, lean: 2 * sw, headTilt: 7 * s },
          fx: b === 6 ? ["glance"] : undefined,
        },
      ];
    },
  },
  selfHug: {
    // arms crossed to the other shoulder, rocking; a hand to the eye now and then
    id: "selfHug",
    beat: (b, c) => {
      if (b % 2) return [];
      const s = alt(b >> 1);
      if (b === 6) return [{ d: 1.6, e: "sine.inOut", to: { ...handAt(c.s, 100 + c.s * 17, 98), ...wrist(c.s, -c.s * 150), ...handAt(-c.s, 100 + c.s * 15, 160), headTilt: 6 * c.s, headNod: 3 }, fx: ["wipe"] }];
      return [{ d: 2, e: "sine.inOut", to: { hLx: 117, hLy: 158, hRx: 83, hRy: 160, wristL: 0, wristR: 0, px: 3 * s, lean: 3 * s, headTilt: -6 * s, headNod: 2.5, py: 2 } }];
    },
  },
  heartHands: {
    id: "heartHands",
    beat: (b, c) => {
      const s = c.s;
      if (b < 4) {
        const w = alt(b);
        return [{ d: 0.9, e: "sine.inOut", to: { hLx: 94, hLy: 157, hRx: 106, hRy: 157, wristL: -40, wristR: 40, px: 4 * w, lean: 3 * w, headTilt: -6 * w } }];
      }
      if (b === 4) return [{ d: 0.45, e: "back.out(2)", to: { ...hand(c, s, 20, 112), ...wrist(s, -s * 25), ...hand(c, -s, 10, 192), headTilt: 10 * s, px: 2 * s, lean: 2 * s }, fx: ["heart", "wink"] }];
      return [{ d: 0.5, e: "sine.inOut", to: { py: b % 2 ? 0 : 3, headTilt: (b % 2 ? 7 : 11) * s } }];
    },
  },
  waveBoth: {
    id: "waveBoth",
    beat: (b, c) => {
      if (b % 2) return [];
      const s = (b >> 1) % 2 ? 1 : -1;
      return [{ d: 2, e: "sine.inOut", to: { ...hand(c, -1, 18 - 12 * s, 102), ...hand(c, 1, 18 + 12 * s, 102), wristL: 16 * s, wristR: 16 * s, px: 3 * s, lean: 3 * s, headTilt: -3 * s, py: 1 } }];
    },
  },
  snap: {
    // fingers snapped out to the side on two and four, head nodding with it
    id: "snap",
    beat: (b, c) => {
      const s = (b >> 2) % 2 ? -c.s : c.s;
      if (b % 2 === 0) return [{ d: 0.5, e: "sine.inOut", to: { ...hand(c, s, 16, 152), ...wrist(s, 0), ...hand(c, -s, 6, 192), py: 0, headNod: 0, px: 2 * s, lean: 2 * s, headTilt: 0 } }];
      return [
        { d: 0.12, e: "power3.out", to: { ...hand(c, s, 24, 140), ...wrist(s, -40 * s), py: 3, headNod: 3, headTilt: 5 * s } },
        { at: 0.35, d: 0.5, e: "sine.out", to: { headNod: 0, py: 0 } },
      ];
    },
  },
  conductor: {
    // conducting four to the bar: down, in, out, up
    id: "conductor",
    beat: (b, c) => {
      const s = c.s;
      const pts: [number, number][] = [[16, 152], [-6, 148], [38, 146], [20, 106]];
      const [dx, y] = pts[b % 4];
      const sw = alt(b >> 1);
      return [{ d: 0.9, e: "sine.inOut", to: { ...hand(c, s, dx, y), ...wrist(s, -s * 12), ...handAt(-s, 100 - s * 6, 168), px: 2 * sw, lean: 1.5 * sw, headTilt: s * (b % 4 === 3 ? 7 : 2) } }];
    },
  },
  ballet: {
    // port de bras: arms low and round, open to the sides, one up, and round again (a turn at the end)
    id: "ballet",
    beat: (b, c) => {
      if (b % 2) return [];
      const s = c.s;
      if (b === 0) return [{ d: 2, e: "sine.inOut", to: { hLx: 93, hLy: 196, hRx: 107, hRy: 196, wristL: -30, wristR: 30, py: 0, ...feet(c, 0), lean: 0, px: 0, headTilt: 0 } }];
      if (b === 2) return [{ d: 2, e: "sine.inOut", to: { ...both(c, 44, 150), wristL: 20, wristR: -20, headTilt: -4 * s, py: 1 } }];
      if (b === 4) return [{ d: 2, e: "sine.inOut", to: { ...hand(c, s, 12, 98), ...wrist(s, 0), ...hand(c, -s, 44, 150), py: -3, ...feet(c, -4), headTilt: 8 * s } }];
      return [{ d: 2, e: "sine.inOut", to: { hLx: 93, hLy: 196, hRx: 107, hRy: 196, wristL: -30, wristR: 30, py: 0, ...feet(c, 0), headTilt: 0 }, fx: c.kind === "f" ? ["spin"] : undefined }];
    },
  },
  hipSway: {
    id: "hipSway",
    beat: (b, c) => {
      const s = (b >> 1) % 2 ? 1 : -1;
      const out: Key[] = [
        { d: 0.2, e: "power2.out", to: { headNod: 2.5 } },
        { at: 0.35, d: 0.5, e: "sine.inOut", to: { headNod: 0 } },
      ];
      if (b % 2 === 0) out.push({ d: 2, e: "sine.inOut", to: { px: 8 * s, lean: -4 * s, headTilt: 5 * s, py: 2, ...hand(c, s, 12, 190), ...hand(c, -s, 20, 162), ...wrist(-s, s * 20) } });
      return out;
    },
  },

  /* ---- bouncy ---- */
  bounce: {
    id: "bounce",
    beat: (b, c) => {
      const s = alt(b);
      return [
        { d: 0.22, e: "power2.out", to: { py: 6, headNod: 2.5, ...hand(c, s, 6, 166), ...hand(c, -s, 6, 186), lean: 1.5 * s } },
        { at: 0.3, d: 0.6, e: "sine.inOut", to: { py: 0, headNod: 0 } },
      ];
    },
  },
  stepClap: {
    // step-touch side to side, clapping in front on every step
    id: "stepClap",
    beat: (b, c) => {
      const s = alt(b);
      const trail = -s;
      return [
        { d: 0.35, e: "power2.out", to: { px: 7 * s, lean: -2 * s, ...foot(c, s, 7, 0), ...foot(c, trail, -7, 6), py: 3 } },
        { at: 0.3, d: 0.25, e: "power1.in", to: foot(c, trail, -7, 0) },
        { at: 0.35, d: 0.5, e: "sine.out", to: { py: 0 } },
        { d: 0.16, e: "power3.out", to: { hLx: 97 + 7 * s, hLy: 158, hRx: 103 + 7 * s, hRy: 158, wristL: 0, wristR: 0 } },
        { at: 0.3, d: 0.5, e: "power2.out", to: both(c, 10, 172) },
      ];
    },
  },
  clapSide: {
    id: "clapSide",
    beat: (b) => {
      const s = alt(b);
      return [
        { d: 0.18, e: "power3.out", to: { hLx: 100 + s * 24 - 3, hLy: 148, hRx: 100 + s * 24 + 3, hRy: 148, wristL: 0, wristR: 0, lean: 4 * s, headTilt: -5 * s, px: 2 * s, py: 3 } },
        { at: 0.35, d: 0.5, e: "sine.out", to: { hLx: 100 + s * 24 - 15, hRx: 100 + s * 24 + 15, hLy: 156, hRy: 156, py: 0 } },
      ];
    },
  },
  twist: {
    id: "twist",
    beat: (b, c) => {
      const s = alt(b);
      return [{ d: 0.45, e: "sine.inOut", to: { lean: 7 * s, px: -3 * s, py: 6, fLx: 100 - (c.hip + 1) + 4 * s, fRx: 100 + (c.hip + 1) + 4 * s, fLy: 280, fRy: 280, ...hand(c, -1, 16 + 8 * s, 170), ...hand(c, 1, 16 - 8 * s, 170), headTilt: -4 * s } }];
    },
  },
  rollingArms: {
    id: "rollingArms",
    beat: (b) => {
      const keys: Key[] = [];
      for (let i = 0; i < 4; i++) {
        const th = ((b * 4 + i + 1) * Math.PI) / 2;
        keys.push({ at: i / 4, d: 0.25, e: "sine.inOut", to: { hLx: 91 + 9 * Math.cos(th), hLy: 166 + 7 * Math.sin(th), hRx: 109 - 9 * Math.cos(th), hRy: 166 - 7 * Math.sin(th), wristL: 0, wristR: 0 } });
      }
      const s = alt(b);
      keys.push({ d: 0.25, e: "power2.out", to: { py: 4, headNod: 2, lean: 2 * s, px: 2 * s } }, { at: 0.4, d: 0.5, e: "sine.inOut", to: { py: 0, headNod: 0 } });
      return keys;
    },
  },
  shimmy: {
    id: "shimmy",
    beat: (_b, c) => {
      const keys: Key[] = [{ d: 0.2, e: "power2.out", to: { py: 4, ...both(c, 22, 184), wristL: 0, wristR: 0 } }];
      for (let i = 0; i < 4; i++) keys.push({ at: i / 4, d: 0.25, e: "sine.inOut", to: { lean: i % 2 ? -4 : 4, px: i % 2 ? -1 : 1, headTilt: i % 2 ? 2 : -2 } });
      return keys;
    },
  },
  discoPoint: {
    id: "discoPoint",
    beat: (b, c) => {
      const s = (b >> 2) % 2 ? -c.s : c.s;
      if (b % 2 === 0) return [{ d: 0.25, e: "power3.out", to: { ...hand(c, s, 40, 96), ...wrist(s, 0), ...hand(c, -s, 12, 190), px: -5 * s, lean: -6 * s, headTilt: 6 * s, py: 2 } }];
      return [{ d: 0.25, e: "power3.out", to: { ...handAt(s, 100 - 12 * s, 204), px: 3 * s, lean: 3 * s, headTilt: -3 * s, py: 5 } }];
    },
  },
  raiseRoof: {
    id: "raiseRoof",
    beat: (b, c) => [
      { d: 0.2, e: "power3.out", to: { ...both(c, 22, 104), wristL: 70, wristR: -70, py: 4, headNod: 2, ...feet(c, 6) } },
      { at: 0.4, d: 0.45, e: "sine.inOut", to: { ...both(c, 22, 120), py: 0, headNod: 0, lean: alt(b) * 2 } },
    ],
  },
  kpop: {
    // four sharp poses, one a beat
    id: "kpop",
    beat: (b, c) => {
      const s = c.s, q = b % 4;
      const k = (to: T, fx?: Fx[]): Key[] => [{ d: 0.16, e: "power4.out", to, fx }];
      if (q === 0) return k({ hLx: 117, hLy: 160, hRx: 83, hRy: 156, wristL: 0, wristR: 0, px: 0, lean: 0, py: 3, ...feet(c, -3), headTilt: 0 });
      if (q === 1) return k({ ...hand(c, s, 40, 98), ...hand(c, -s, 12, 190), px: 5 * s, lean: -5 * s, py: 0, ...feet(c, 10), headTilt: 5 * s });
      if (q === 2) return k({ hLx: 55, hLy: 100, hRx: 145, hRy: 100, wristL: 160, wristR: -160, px: 0, lean: 0, headTilt: 8 * s }, ["wink"]);
      return k({ ...hand(c, -s, 42, 182), ...hand(c, s, 8, 190), wristL: 0, wristR: 0, py: 8, px: -6 * s, lean: 6 * s, headTilt: -4 * s });
    },
  },
  runningMan: {
    id: "runningMan",
    beat: (b, c) => {
      const s = alt(b);
      return [
        { d: 0.25, e: "power2.out", to: { py: -3, ...foot(c, s, -3, 18), ...foot(c, -s, 0, 0), ...hand(c, s, 4, 158), ...hand(c, -s, 10, 196), lean: 2 * s } },
        { at: 0.5, d: 0.3, e: "power2.in", to: { py: 3, ...foot(c, s, 0, 0) } },
      ];
    },
  },
  sideKick: {
    id: "sideKick",
    beat: (b, c) => {
      const s = b % 4 < 2 ? -c.s : c.s;
      if (b % 2 === 0) return [{ d: 0.25, e: "power3.out", to: { ...foot(c, s, 46, 40), px: -6 * s, lean: -8 * s, py: -2, ...hand(c, s, 30, 128), ...hand(c, -s, 26, 140), headTilt: -4 * s } }];
      return [{ d: 0.3, e: "power2.inOut", to: { ...foot(c, s, 0, 0), px: 0, lean: 0, py: 2, ...both(c, 6, 192), headTilt: 0 } }];
    },
  },
  jump: {
    id: "jump",
    beat: (b, c) => {
      const q = b % 4;
      if (q === 0) return [{ d: 0.4, e: "power2.out", to: { py: 9, lean: 0, px: 0, headNod: 3, ...both(c, 16, 206), wristL: 0, wristR: 0 } }];
      if (q === 1)
        return [
          { d: 0.28, e: "power2.out", to: { py: -18, ...feet(c, 4, 22), headNod: -2, ...both(c, 30, 100) }, fx: ["woo"] },
          { at: 0.3, d: 0.3, e: "power2.in", to: { py: 0, ...feet(c, 4, 0), headNod: 0 } },
          { at: 0.6, d: 0.2, e: "power2.out", to: { py: 6 } },
          { at: 0.8, d: 0.4, e: "sine.out", to: { py: 0 } },
        ];
      if (q === 2) return [{ d: 0.5, e: "power2.out", to: { ...both(c, 24, 112), wristL: 20, wristR: -20 }, fx: ["joy"] }];
      return [{ d: 0.5, e: "sine.inOut", to: { ...both(c, 8, 190), wristL: 0, wristR: 0, ...feet(c, 0) }, fx: b === 7 ? ["spin"] : undefined }];
    },
  },
  fistPump: {
    id: "fistPump",
    beat: (_b, c) => {
      const s = c.s;
      return [
        { d: 0.16, e: "power3.out", to: { ...hand(c, s, 16, 100), ...wrist(s, 180), py: 4, headNod: 2, ...hand(c, -s, 12, 190) } },
        { at: 0.45, d: 0.4, e: "power2.inOut", to: { ...hand(c, s, 10, 146), py: 0, headNod: 0 } },
      ];
    },
  },
  headbang: {
    // nodding hard, air guitar: one hand out on the neck, the other strumming
    id: "headbang",
    beat: (b, c) => {
      const s = c.s;
      const slide = (b % 4) * 3;
      return [
        { d: 0.18, e: "power3.out", to: { headNod: 7, headTilt: 3 * s, py: 5, lean: 2 * s, ...hand(c, -s, 34 - slide, 170 - slide / 2), ...wrist(-s, s * 30), ...handAt(s, 100 + s * 4, 198), ...wrist(s, 0), ...feet(c, 8) } },
        { at: 0.5, d: 0.3, e: "power2.inOut", to: { headNod: -1, py: 0, ...handAt(s, 100 + s * 2, 184) } },
      ];
    },
  },
};

/** Which moves fit which mood. */
const POOLS: Record<Mood, string[]> = {
  hype: ["jump", "raiseRoof", "discoPoint", "runningMan", "kpop", "shimmy", "sideKick", "fistPump", "stepClap"],
  rock: ["headbang", "fistPump", "jump", "sideKick", "bounce", "headbang"],
  happy: ["stepClap", "bounce", "twist", "discoPoint", "shimmy", "clapSide", "waveBoth", "kpop", "rollingArms"],
  groove: ["bounce", "snap", "hipSway", "rollingArms", "raiseRoof", "shimmy"],
  love: ["heartHands", "hipSway", "sway", "snap", "waveBoth", "clapSide", "handOnHeart"],
  tender: ["sway", "lighterWave", "waveBoth", "handOnHeart", "snap"],
  sad: ["sway", "selfHug", "handOnHeart", "lighterWave"],
  classic: ["conductor", "ballet", "sway", "waveBoth"],
};
/** Slow moods sway every other beat on a fast song. */
const SLOW = new Set<Mood>(["love", "tender", "sad", "classic"]);
/** When the music is calm but a move is a big one, it can't be picked. */
const BIG = new Set(["jump", "sideKick", "runningMan"]);

/* ------------------------------------------------------------------ faces */

type Expr = { lid: number; brow: number; browSad: number; smile: number; blush: number; happy: number; gaze: number; open: number; wide: number };
const FACES: Record<Mood | "idle", Expr> = {
  idle: { lid: 0.04, brow: 0.05, browSad: 0, smile: 0.45, blush: 0.25, happy: 0, gaze: 0, open: 0, wide: 1 },
  hype: { lid: 0, brow: 0.35, browSad: 0, smile: 0.95, blush: 0.45, happy: 0, gaze: 0, open: 0.22, wide: 1.25 },
  rock: { lid: 0.12, brow: -0.5, browSad: 0, smile: 0.25, blush: 0.3, happy: 0, gaze: 0, open: 0.15, wide: 1.1 },
  happy: { lid: 0, brow: 0.2, browSad: 0, smile: 0.85, blush: 0.4, happy: 0, gaze: 0, open: 0.1, wide: 1.2 },
  groove: { lid: 0.32, brow: -0.1, browSad: 0, smile: 0.55, blush: 0.3, happy: 0, gaze: 0, open: 0, wide: 1 },
  love: { lid: 0.18, brow: 0.15, browSad: 0, smile: 0.75, blush: 0.9, happy: 0, gaze: 0, open: 0, wide: 1 },
  tender: { lid: 0.28, brow: 0.1, browSad: 0.1, smile: 0.5, blush: 0.35, happy: 0, gaze: 0, open: 0, wide: 1 },
  sad: { lid: 0.34, brow: 0, browSad: 0.9, smile: -0.4, blush: 0.2, happy: 0, gaze: 0, open: 0, wide: 0.9 },
  classic: { lid: 0.36, brow: 0.2, browSad: 0, smile: 0.5, blush: 0.3, happy: 0, gaze: 0, open: 0, wide: 1 },
};
/** How likely a wink is at the end of a phrase. */
const WINK: Record<Mood, number> = { hype: 0.5, rock: 0.2, happy: 0.55, groove: 0.5, love: 0.8, tender: 0.2, sad: 0, classic: 0.15 };

/* ------------------------------------------------------------------ the singer's hands */

type Gesture = "chest" | "reach" | "open" | "up" | "point" | "fist" | "pray" | "chop" | "ear";
const GESTURES: Record<Mood, Gesture[]> = {
  hype: ["up", "point", "ear", "fist", "chop", "open"],
  rock: ["fist", "point", "chop", "open", "fist"],
  happy: ["up", "point", "chest", "reach", "open", "chop"],
  groove: ["chop", "point", "chest", "reach", "chop"],
  love: ["chest", "reach", "pray", "open", "chest"],
  tender: ["chest", "reach", "open", "pray"],
  sad: ["chest", "pray", "reach", "chest"],
  classic: ["open", "reach", "chest"],
};
/** Arms for a gesture, on beat `b` of it (some keep time). */
function gesture(g: Gesture, b: number, c: Ctx): Key[] {
  const s = c.s;
  const k = (to: T, d = 0.8, e = "sine.inOut"): Key[] => [{ d, e, to }];
  switch (g) {
    case "chest":
      return k({ ...handAt(s, 100 + s * 6, 166), ...wrist(s, 0), ...hand(c, -s, 8 + (b % 2) * 3, 192), ...wrist(-s, 0) });
    case "reach":
      return k({ ...hand(c, c.inw, 46, 140 - (b % 2) * 4), ...wrist(c.inw, c.inw * -40), ...handAt(-c.inw, 100 - c.inw * 6, 166), ...wrist(-c.inw, 0) });
    case "open":
      return k({ ...both(c, 46, 130 - (b % 2) * 5), wristL: -30, wristR: 30 }, 1);
    case "up":
      return k({ ...hand(c, s, 18 + (b % 2 ? 8 : -4), 100), ...wrist(s, (b % 2 ? -20 : 20) * s), ...hand(c, -s, 8, 190), ...wrist(-s, 0) }, 0.7);
    case "point":
      return k({ ...hand(c, c.inw, 50, b % 2 ? 150 : 144), ...wrist(c.inw, c.inw * -70), ...hand(c, -c.inw, 12, 190), ...wrist(-c.inw, 0) }, 0.4, "power2.out");
    case "fist":
      return [
        { d: 0.16, e: "power3.out", to: { ...hand(c, s, 14, b % 2 ? 108 : 98), ...wrist(s, 180), ...hand(c, -s, 12, 190), ...wrist(-s, 0) } },
        { at: 0.5, d: 0.4, e: "sine.inOut", to: hand(c, s, 12, 122) },
      ];
    case "pray":
      return k({ hLx: 96, hLy: 160 - (b % 2) * 2, hRx: 104, hRy: 160 - (b % 2) * 2, wristL: -150, wristR: 150 }, 1);
    case "chop":
      return [
        { d: 0.18, e: "power3.out", to: { ...hand(c, s, 22, b % 2 ? 164 : 150), ...wrist(s, -s * 70), ...hand(c, -s, 8, 190), ...wrist(-s, 0) } },
        { at: 0.5, d: 0.4, e: "sine.inOut", to: hand(c, s, 20, 156) },
      ];
    case "ear":
      return k({ ...hand(c, s, 20, 98), ...wrist(s, s * 160), ...hand(c, -s, 34, 150), ...wrist(-s, -s * 60), headTilt: 8 * s }, 0.5, "power2.out");
  }
}

/* ------------------------------------------------------------------ one performer's brain */

const BODY: (keyof Pose)[] = ["px", "py", "lean", "headTilt", "headNod", "headTurn"];

export class Choreo {
  role: Role = "idle";
  mood: Mood = "happy";
  private seed = 1;
  private sub: number;
  private expr: Expr = { ...FACES.idle };
  private ov = { blinkL: 0, blinkR: 0 };
  private sing = { open: 0, lid: 0, brow: 0, hi: 0, quiet: 0, peakUntil: -1 };
  private div = 1;
  private lastIdx = -1;
  private fresh = true;
  private moveId = "";
  private cueUntil = 0;
  private idleNext = 0;
  private blinkNext = 0;
  private sideTear = 1;
  private partnerSync: (() => Choreo | null) | null = null;
  /** CSS-free knobs the stage reads: how loud the voice is, for the notes */
  voice = 0;

  constructor(readonly p: Performer) {
    this.sub = p.kind === "m" ? 1 : 2;
  }

  /** The other performer, so the two can sometimes dance the same move mirrored. */
  pairWith(get: () => Choreo | null) {
    this.partnerSync = get;
  }

  private ctx(s: number): Ctx {
    return { kind: this.p.kind, sx: this.p.look.shoulderX, hip: this.p.look.hip, s, inw: this.p.inward };
  }

  /** Change what this performer is doing. */
  set(role: Role, mood: Mood, seed: number, bpm: number) {
    const changed = role !== this.role || mood !== this.mood || seed !== this.seed;
    this.role = role;
    this.mood = mood;
    this.seed = seed;
    this.div = SLOW.has(mood) && bpm >= 110 ? 2 : 1;
    if (!changed) return;
    this.lastIdx = -1;
    this.fresh = true;
    this.moveId = "";
    this.sing.hi = 0;
    this.sing.peakUntil = -1;
    gsap.killTweensOf(this.p.pose);
    gsap.killTweensOf(this.expr);
    const face = role === "idle" ? FACES.idle : FACES[mood];
    gsap.to(this.expr, { ...face, duration: 0.6, ease: "sine.inOut" });
    const rest = restPose(this.p.kind);
    if (role === "idle") {
      const still: Partial<Pose> = { ...rest };
      delete still.py; // breathing moves it
      gsap.to(this.p.pose, { ...still, duration: 0.6, ease: "sine.inOut" });
      this.idleNext = performance.now() + 1500 + Math.random() * 2500;
    } else if (role === "sing") {
      gsap.to(this.p.pose, { ...rest, duration: 0.5, ease: "sine.inOut" });
    }
  }

  /** A big reaction to the answer: a jump for joy, or a shrug with a drop of sweat. */
  cue(kind: Cue) {
    const P = this.p.pose, c = this.ctx(this.p.inward);
    const now = performance.now();
    this.cueUntil = now + 1700;
    this.fresh = true;
    gsap.killTweensOf(P);
    gsap.killTweensOf(this.expr);
    const back = FACES[this.role === "idle" ? "idle" : this.mood] ?? FACES.idle;
    const red = reduced();
    if (kind === "right") {
      gsap.to(this.expr, { happy: 1, smile: 1, open: 0.55, wide: 1.3, blush: 0.9, brow: 0.5, browSad: 0, lid: 0, duration: 0.15 });
      gsap
        .timeline()
        .to(P, { py: 8, ...both(c, 14, 204), wristL: 0, wristR: 0, headNod: 3, duration: 0.14, ease: "power2.out" })
        .to(P, { py: red ? -4 : -20, ...feet(c, 5, red ? 4 : 24), ...both(c, 30, 98), headNod: -2, duration: 0.24, ease: "power2.out" })
        .to(P, { py: 0, ...feet(c, 5, 0), headNod: 0, duration: 0.24, ease: "power2.in" })
        .to(P, { py: 5, duration: 0.1 })
        .to(P, { py: red ? 0 : -9, ...feet(c, 5, red ? 0 : 10), duration: 0.18, ease: "power2.out" })
        .to(P, { py: 0, ...feet(c, 0, 0), ...both(c, 26, 108), duration: 0.2, ease: "power2.in" })
        .to(P, { ...both(c, 8, 192), duration: 0.5, ease: "sine.inOut" }, "+=0.35");
      gsap.to(this.expr, { ...back, delay: 1.5, duration: 0.4 });
      this.p.sparkle("L");
      gsap.delayedCall(0.18, () => this.p.sparkle("R"));
    } else {
      gsap.to(this.expr, { happy: 0, smile: -0.55, open: 0.3, wide: 0.75, browSad: 0.9, brow: 0.1, lid: 0.1, duration: 0.2 });
      gsap
        .timeline()
        .to(P, { ...both(c, 22, 176), wristL: -60, wristR: 60, py: -3, lean: 0, headTilt: -8 * c.inw, headNod: -1, duration: 0.25, ease: "back.out(2)" })
        .to(P, { headTurn: -0.7, duration: 0.18 })
        .to(P, { headTurn: 0.7, duration: 0.22 })
        .to(P, { headTurn: -0.5, duration: 0.2 })
        .to(P, { headTurn: 0, py: 0, ...both(c, 6, 194), wristL: 0, wristR: 0, headTilt: 0, headNod: 0, duration: 0.5, ease: "sine.inOut" }, "+=0.3");
      gsap.to(this.expr, { ...back, delay: 1.5, duration: 0.5 });
      this.p.sweat();
    }
  }

  /**
   * Once a frame. `pos` is the song position in seconds (negative: not playing), `idx` the beat
   * number at that position, `period` seconds per beat; `drum` and `voice` are 0..1 now.
   */
  frame(dt: number, now: number, pos: number, idx: number, period: number, drum: number, voice: number) {
    const live = this.role !== "idle" && pos >= 0;
    if (live && idx !== this.lastIdx && now >= this.cueUntil) {
      if (this.lastIdx >= 0 && idx !== this.lastIdx + 1) this.fresh = true; // skipped ahead or back
      this.lastIdx = idx;
      if (idx % this.div === 0) this.onBeat(Math.floor(idx / this.div), period * this.div, drum, voice);
    }
    if (live) this.singFrame(dt, pos, period, voice);
    else this.idleFrame(now);
    this.voice = this.role === "sing" && live ? voice : 0;
    this.compose();
    this.p.render(dt);
  }

  /* ---- the beat ---- */

  private onBeat(n: number, period: number, drum: number, voice: number) {
    const b = n % 8, phrase = Math.floor(n / 8);
    const seed = this.seed;
    if (this.role === "dance") this.danceBeat(b, phrase, period, drum);
    else if (this.role === "sing") this.singBeat(n, b, phrase, period, drum, voice);

    // blinks: about one every three seconds, on beats every phone agrees on
    if (rnd(seed, n, 30 + this.sub) < Math.min(0.6, period / 3.2)) this.blink(period * 0.3);
    // a wink at the end of some phrases, a glance at the partner in others
    if (b === 6 && this.mood !== "sad" && rnd(seed, phrase, 40 + this.sub) < WINK[this.mood]) this.wink(rnd(seed, phrase, 50 + this.sub) < 0.5 ? "L" : "R", period * 0.1);
    if (b === 3 && rnd(seed, phrase, 60 + this.sub) < (this.role === "dance" ? 0.45 : 0.25)) this.glance(period * 2);
    // feelings
    if (this.mood === "sad") {
      const every = this.role === "sing" ? 8 : 12;
      if (n % every === (this.role === "sing" ? 5 : 9) && (this.role !== "sing" || voice > 0.2)) {
        this.sideTear = -this.sideTear;
        this.p.tear(this.sideTear < 0 ? "L" : "R");
      }
    }
    if (this.mood === "love" && b % 4 === (this.role === "sing" ? 2 : 0) && rnd(seed, n, 70 + this.sub) < (this.role === "sing" ? 0.35 : 0.7)) this.p.heart();
    if ((this.mood === "hype" || this.mood === "happy") && b === 0 && phrase % 2 === 1 && rnd(seed, phrase, 80 + this.sub) < 0.5) this.p.sparkle(rnd(seed, phrase, 81) < 0.5 ? "L" : "R");
  }

  private pickMove(phrase: number, sub: number): string {
    const pool = POOLS[this.mood];
    const calm = SLOW.has(this.mood);
    const at = (k: number) => {
      let i = Math.floor(rnd(this.seed, k, sub) * pool.length);
      if (calm || reduced()) for (let t = 0; t < pool.length && BIG.has(pool[i]); t++) i = (i + 1) % pool.length;
      return i;
    };
    let i = at(phrase);
    if (phrase > 0 && i === at(phrase - 1)) i = (i + 1) % pool.length;
    return pool[i];
  }

  private danceBeat(b: number, phrase: number, period: number, drum: number) {
    const seed = this.seed;
    // two dancers (nobody knows who sings) sometimes do the same move, mirrored
    const partner = this.partnerSync?.();
    const pair = partner?.role === "dance" && rnd(seed, phrase, 77) < 0.35;
    const sub = pair ? 0 : this.sub + 2;
    const id = this.pickMove(phrase, sub);
    const s = pair ? this.p.inward : rnd(seed, phrase, sub + 5) < 0.5 ? 1 : -1;
    const startOfMove = b === 0 || this.fresh || id !== this.moveId;
    this.moveId = id;
    const amp = this.amp(drum);
    const keys = MOVES[id].beat(b, this.ctx(s));
    this.play(keys, period, amp, startOfMove);
    this.fresh = false;
  }

  private singBeat(n: number, b: number, phrase: number, period: number, drum: number, voice: number) {
    const seed = this.seed;
    const c = this.ctx(rnd(seed, n >> 2, 90 + this.sub) < 0.5 ? 1 : -1);
    const amp = this.amp(drum) * 0.75;
    const start = this.fresh;
    this.fresh = false;
    // long quiet stretch (an intro, a solo): dance a little instead
    if (this.sing.quiet > 1.6) {
      const id = this.pickMove(phrase, this.sub + 10);
      this.play(MOVES[id].beat(b, this.ctx(c.s)), period, amp * 0.8, start || b === 0 || id !== this.moveId);
      this.moveId = id;
      return;
    }
    this.moveId = "";
    // legs and body keep the beat
    const s = alt(n);
    const body: Key[] = SLOW.has(this.mood)
      ? n % 2
        ? []
        : [{ d: 2, e: "sine.inOut", to: { px: 3 * alt(n >> 1), lean: 2 * alt(n >> 1), py: 1, headTilt: -3 * alt(n >> 1) } }]
      : this.mood === "rock"
        ? [{ d: 0.18, e: "power3.out", to: { py: 5, headNod: 4 } }, { at: 0.45, d: 0.4, e: "sine.inOut", to: { py: 0, headNod: 0 } }]
        : [{ d: 0.22, e: "power2.out", to: { py: 4, lean: 1.5 * s, px: 1.5 * s } }, { at: 0.35, d: 0.55, e: "sine.inOut", to: { py: 0 } }];
    // hands: a gesture every four beats; a big note opens the arms
    const peak = this.sing.peakUntil >= n;
    let g: Gesture;
    if (peak) g = this.mood === "sad" ? "reach" : this.mood === "rock" || this.mood === "hype" ? "fist" : "open";
    else {
      const list = GESTURES[this.mood];
      g = list[Math.floor(rnd(seed, n >> 2, 100 + this.sub) * list.length)];
    }
    if (voice > 0.8 && !peak && rnd(seed, n, 110 + this.sub) < 0.5) this.sing.peakUntil = n + 2;
    this.play([...body, ...gesture(g, b, c)], period, amp, start);
  }

  private amp(drum: number) {
    const base = this.mood === "hype" || this.mood === "rock" ? 1.05 : SLOW.has(this.mood) ? 0.85 : 1;
    return (reduced() ? 0.45 : 1) * clamp(base * (0.78 + 0.4 * drum), 0.5, 1.2);
  }

  /** Run a beat's keys as tweens on the pose. The first beat of a move starts from rest, so nothing
   *  from the last move (a bent wrist, a lifted foot) hangs on. */
  private play(keys: Key[], period: number, amp: number, fromRest: boolean) {
    const P = this.p.pose;
    const red = reduced();
    const rest = restPose(this.p.kind);
    keys.forEach((k, i) => {
      let to: T = { ...(k.to ?? {}) };
      if (fromRest && i === 0) to = { ...rest, ...to };
      for (const f of BODY) if (to[f] !== undefined) to[f] = (to[f] as number) * amp;
      if (red) {
        for (const f of Object.keys(to) as (keyof Pose)[]) if (!BODY.includes(f) && f !== "spin") to[f] = rest[f] + ((to[f] as number) - rest[f]) * 0.6;
      }
      const delay = (k.at ?? 0) * period;
      if (Object.keys(to).length) gsap.to(P, { ...to, duration: Math.max(0.05, (k.d ?? 0.5) * period), ease: k.e ?? "power2.out", delay, overwrite: "auto" });
      for (const fx of k.fx ?? []) this.effect(fx, delay, period);
    });
  }

  private effect(fx: Fx, delay: number, period: number) {
    const call = (f: () => void) => (delay > 0 ? gsap.delayedCall(delay, f) : f());
    switch (fx) {
      case "heart":
        return call(() => this.p.heart());
      case "sparkle":
        return call(() => this.p.sparkle(this.p.inward > 0 ? "R" : "L"));
      case "wink":
        return this.mood === "sad" ? undefined : this.wink(this.p.inward > 0 ? "R" : "L", delay);
      case "tear":
        return call(() => this.p.tear());
      case "glance":
        return this.glance(period * 2, delay);
      case "wipe":
        return call(() => gsap.to(this.expr, { lid: 0.7, duration: 0.3, yoyo: true, repeat: 1, repeatDelay: period }));
      case "woo":
        return call(() => gsap.timeline().to(this.expr, { open: 0.65, wide: 0.8, duration: 0.12 }).to(this.expr, { open: FACES[this.mood].open, wide: FACES[this.mood].wide, duration: 0.3 }, "+=0.25"));
      case "joy":
        return call(() => gsap.timeline().to(this.expr, { happy: 1, duration: 0.05 }).to(this.expr, { happy: 0, duration: 0.05 }, `+=${Math.max(0.3, period * 1.2)}`));
      case "spin":
        if (reduced()) return;
        return call(() => gsap.timeline().to(this.p.pose, { spin: -1, duration: period * 0.45, ease: "sine.inOut" }).to(this.p.pose, { spin: 1, duration: period * 0.45, ease: "sine.inOut" }));
    }
  }

  /* ---- the face ---- */

  private blink(delay = 0) {
    gsap.timeline({ delay }).to(this.ov, { blinkL: 1, blinkR: 1, duration: 0.07, ease: "power2.in" }).to(this.ov, { blinkL: 0, blinkR: 0, duration: 0.12, ease: "power2.out" }, "+=0.04");
  }

  /** 抛媚眼: one eye shuts, the smile lifts, the head tips toward it, a sparkle by that eye. */
  private wink(side: "L" | "R", delay = 0) {
    const k = side === "L" ? "blinkL" : "blinkR";
    const tl = gsap.timeline({ delay });
    tl.to(this.ov, { [k]: 1, duration: 0.08, ease: "power2.in" }).to(this.ov, { [k]: 0, duration: 0.16, ease: "power2.out" }, "+=0.34");
    const smile = this.expr.smile;
    gsap.timeline({ delay }).to(this.expr, { smile: Math.min(1, smile + 0.3), blush: Math.min(1, this.expr.blush + 0.25), duration: 0.12 }).to(this.expr, { smile, blush: (FACES[this.mood] ?? FACES.idle).blush, duration: 0.4 }, "+=0.35");
    gsap.delayedCall(delay + 0.05, () => this.p.sparkle(side));
  }

  /** A look at the partner (eyes and a little turn of the head), then back to the room. */
  private glance(hold: number, delay = 0) {
    const inw = this.p.inward;
    gsap.timeline({ delay }).to(this.expr, { gaze: inw * 0.9, duration: 0.2 }).to(this.expr, { gaze: 0, duration: 0.35 }, `+=${hold}`);
    gsap.timeline({ delay }).to(this.p.pose, { headTurn: inw * 0.6, duration: 0.25 }).to(this.p.pose, { headTurn: 0, duration: 0.4 }, `+=${hold}`);
  }

  /** The singer's mouth follows the voice, two syllables a beat; eyes close on a long high note. */
  private singFrame(dt: number, pos: number, period: number, voice: number) {
    if (this.role !== "sing") return;
    const S = this.sing;
    const rate = 2 / Math.max(0.25, period);
    const syl = Math.abs(Math.sin(pos * Math.PI * rate + 0.6 * Math.sin(pos * 3.1)));
    const target = voice > 0.12 ? clamp((voice - 0.1) / 0.75) * (0.42 + 0.58 * syl) : 0;
    S.open += (target - S.open) * Math.min(1, dt * 24);
    S.hi = voice > 0.78 ? S.hi + dt : Math.max(0, S.hi - dt * 2);
    S.quiet = voice < 0.14 ? S.quiet + dt : 0;
    const lidT = S.hi > 0.45 ? 0.92 : 0;
    S.lid += (lidT - S.lid) * Math.min(1, dt * 9);
    const emo = this.mood === "sad" || this.mood === "love" || this.mood === "tender" || this.mood === "classic";
    const browT = emo ? 0.55 * voice : this.mood === "rock" ? -0.2 * voice : 0.25 * voice;
    S.brow += (browT - S.brow) * Math.min(1, dt * 6);
  }

  /** Not playing: breathe, blink, look around, now and then a little something. */
  private idleFrame(now: number) {
    const P = this.p.pose;
    if (now >= this.cueUntil) P.py = 1.1 * Math.sin((now / 1000) * ((2 * Math.PI) / 3.4) + (this.p.kind === "f" ? 1.3 : 0));
    if (now >= this.blinkNext) {
      this.blinkNext = now + 1800 + Math.random() * 3600;
      this.blink();
    }
    if (now < this.idleNext || now < this.cueUntil) return;
    this.idleNext = now + 4500 + Math.random() * 5000;
    if (reduced()) return;
    const c = this.ctx(this.p.inward);
    const rest = restPose(this.p.kind);
    const back = { hLx: rest.hLx, hLy: rest.hLy, hRx: rest.hRx, hRy: rest.hRy, wristL: 0, wristR: 0, headTilt: 0, headTurn: 0, fLx: rest.fLx, fLy: rest.fLy, fRx: rest.fRx, fRy: rest.fRy };
    const pick = Math.floor(Math.random() * 5);
    const tl = gsap.timeline();
    if (pick === 0) {
      // wave hello
      const s = -this.p.inward;
      tl.to(P, { ...hand(c, s, 18, 100), ...wrist(s, 20), headTilt: 5 * s, duration: 0.35, ease: "back.out(1.6)" });
      for (let i = 0; i < 3; i++) tl.to(P, { ...wrist(s, -25), duration: 0.18, ease: "sine.inOut" }).to(P, { ...wrist(s, 20), duration: 0.18, ease: "sine.inOut" });
      tl.to(P, { ...back, duration: 0.5, ease: "sine.inOut" });
      gsap.to(this.expr, { smile: 0.8, duration: 0.3, yoyo: true, repeat: 1, repeatDelay: 1.2 });
    } else if (pick === 1) {
      // a look at the other one, a smile
      this.glance(1.4);
      gsap.to(this.expr, { smile: 0.75, blush: 0.5, duration: 0.3, yoyo: true, repeat: 1, repeatDelay: 1.3 });
    } else if (pick === 2) {
      // hands on hips
      tl.to(P, { ...both(c, 12, 190), duration: 0.4, ease: "sine.inOut" }).to(P, { headTilt: 4 * this.p.inward, duration: 0.4 }).to(P, { ...back, duration: 0.5, ease: "sine.inOut" }, "+=1.6");
    } else if (pick === 3) {
      // a stretch and a yawn
      tl.to(P, { ...both(c, 20, 102), wristL: 160, wristR: -160, duration: 0.6, ease: "sine.inOut" }).to(P, { ...back, duration: 0.6, ease: "sine.inOut" }, "+=0.9");
      gsap.timeline().to(this.expr, { open: 0.55, wide: 0.8, lid: 0.85, duration: 0.5 }).to(this.expr, { ...FACES.idle, duration: 0.5 }, "+=0.8");
    } else {
      // tap a foot
      const s = this.p.inward;
      for (let i = 0; i < 4; i++) tl.to(P, { ...foot(c, s, 2, 6), duration: 0.14 }).to(P, { ...foot(c, s, 2, 0), duration: 0.16 });
      tl.to(P, { ...back, duration: 0.3 });
    }
  }

  /** Expression + blinks + singing → the face the performer draws. */
  private compose() {
    const F = this.p.face, e = this.expr, S = this.sing;
    const singing = this.role === "sing" && this.voice > 0;
    const lid = Math.max(e.lid, singing ? S.lid : 0);
    F.lidL = clamp(Math.max(lid, this.ov.blinkL));
    F.lidR = clamp(Math.max(lid, this.ov.blinkR));
    F.brow = e.brow + (this.role === "sing" ? S.brow : 0);
    F.browSad = e.browSad;
    F.blush = e.blush;
    F.happy = e.happy;
    F.gaze = e.gaze;
    if (this.role === "sing" && S.open > 0.01) {
      F.open = S.open;
      F.wide = 0.95 + 0.25 * Math.sin(this.lastIdx * 1.7 + S.open * 4);
      F.smile = e.smile * (1 - 0.55 * S.open);
    } else {
      F.open = e.open;
      F.wide = e.wide;
      F.smile = e.smile;
    }
  }

  destroy() {
    gsap.killTweensOf([this.p.pose, this.expr, this.ov]);
  }
}
