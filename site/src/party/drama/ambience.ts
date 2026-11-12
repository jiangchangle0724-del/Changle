/**
 * 戏精大赏's soundscapes, playing quietly under the actors' voices. Before the curtain: the
 * house filling up, the orchestra tuning. During a scene, the set sounds like itself: rain and
 * thunder at the old mansion, a guzheng in the palace, a dinner table, a love song's piano, an
 * office humming, a studio audience; a duel gets a held breath and a heartbeat; a famous scene,
 * the cinema: the projector and a film score. A reading gets the room its kind belongs in: the
 * ballad piano under a love letter, the palace under a memorial, the newsroom under a broadcast, the
 * cameras clicking at an apology, and for a straight face, a hushed room where someone coughs.
 *
 * Every event comes from a seed and the moment the scene started, so all the phones at a table
 * (and the big screen) play the same thunder at the same second.
 */
import { KINDS, type DramaKind } from "../../data/drama";
import type { ReadKind } from "../../data/dramaReadings";
import { burst, bus, ctxTimeAt, kick, midiHz, note, strike, tone, type Bus } from "../../lib/audio/engine";
import type { DramaView } from "../../shared/protocol";

export type Scape = DramaKind | "pk" | "foyer" | "classic" | "hush" | "press";

/** The room each kind of reading is read in. */
const READ_SCAPE: Record<ReadKind, Scape> = {
  cry: "love",
  breakup: "love",
  melodrama: "classic",
  voice: "classic",
  court: "palace",
  anchor: "office",
  rant: "pk",
  sell: "show",
  sorry: "press",
  deadpan: "hush",
};

/** What plays while the act is on: the scene's set, the duel, the cinema, or the reading's room. */
export function actScape(v: Pick<DramaView, "mode" | "scene" | "read">): Scape | null {
  if (v.mode === "pk") return "pk";
  if (v.mode === "classic") return "classic";
  if (v.mode === "read") return v.read ? READ_SCAPE[v.read.kind] : "hush";
  const k = v.scene?.kind;
  return KINDS.some((x) => x.key === k) ? (k as DramaKind) : null;
}
export type Ambience = { stop: (fade?: number) => void };

type Rand = () => number;
type At = { at: number; abs: true; dest: AudioNode };
type Layer = {
  /** seconds from one event to the next: [min, max] */
  gap: [number, number];
  /** the first one, in seconds after the start */
  first?: number;
  /** k counts this layer's events from the start */
  play: (b: Bus, o: At, r: Rand, k: number) => void;
};

/** A string to a seed: the same scene and round give the same seed on every phone. */
export function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mix(a: number, b: number) {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return x >>> 0;
}

function rng(seed: number): Rand {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------ the pieces */

/** A wash of filtered noise that overlaps the next one: rain, a crowd, an air vent. */
const bed = (gap: number, o: { type: BiquadFilterType; f: number; spread?: number; q: number; peak: number; wet?: number }): Layer => ({
  gap: [gap, gap],
  play: (b, at, r) => burst(b, { ...at, dur: gap + 1, attack: gap * 0.5, type: o.type, f: o.f + r() * (o.spread ?? 0), f2: o.f * 0.85, q: o.q, peak: o.peak, wet: o.wet ?? 0.3 }),
});

/** Many people talking at once: short narrow bands of noise where voices live, overlapping. */
const babble = (gap: [number, number], lo: number, hi: number, peak: number): Layer => ({
  gap,
  play: (b, at, r) => {
    const f = lo + r() * (hi - lo);
    const dur = 0.18 + r() * 0.4;
    burst(b, { ...at, dur, attack: dur * 0.3, type: "bandpass", f, f2: f * (0.85 + r() * 0.3), q: 3 + r() * 4, peak: peak * (0.5 + r() * 0.5), wet: 0.5 });
  },
});

/** A low chord held under everything. */
const drone = (gap: number, notes: number[], peak: number): Layer => ({
  gap: [gap, gap],
  play: (b, at) => notes.forEach((m, i) => note(b, "pad", { ...at, f: midiHz(m), dur: gap + 0.4, peak: peak / (i + 1), wet: 0.55 })),
});

const PENTA_D = [62, 64, 66, 69, 71, 74, 76, 78, 81];
const PENTA_C = [60, 62, 64, 67, 69, 72, 74, 76];
/** Am, F, C, G: the strings of a film score. */
const SCORE = [
  [45, 57, 60, 64],
  [41, 57, 60, 65],
  [48, 55, 64, 67],
  [43, 55, 62, 67],
];
/** Cmaj7, Am7, Fmaj7, G7, as a slow ballad would. */
const BALLAD = [
  [48, 64, 67, 71, 72],
  [45, 60, 64, 67, 69],
  [41, 57, 60, 64, 65],
  [43, 59, 62, 65, 67],
];

const SCAPES: Record<Scape, Layer[]> = {
  /** The house before the curtain: people finding their seats, the orchestra tuning to an A. */
  foyer: [
    babble([0.05, 0.14], 280, 1100, 0.12),
    {
      gap: [4.5, 8],
      first: 1.5,
      play: (b, at, r) => {
        // an oboe gives the A, and a few strings slide onto it
        note(b, "pad", { ...at, f: 440, dur: 2.6, peak: 0.018 });
        for (let i = 0; i < 2; i++) {
          const m = [57, 64, 69, 76][Math.floor(r() * 4)];
          tone(b, { ...at, at: at.at + 0.4 + i * 0.5, f: midiHz(m) * (1 + (r() - 0.5) * 0.02), f2: midiHz(m), glide: 0.6, type: "sawtooth", peak: 0.006, attack: 0.3, decay: 1.6, wet: 0.6 });
        }
      },
    },
    {
      gap: [7, 13],
      first: 4,
      // someone coughs, a programme rustles
      play: (b, at, r) =>
        r() < 0.5
          ? burst(b, { ...at, dur: 0.12, attack: 0.01, decay: 0.08, type: "bandpass", f: 700 + r() * 300, q: 2, peak: 0.022, wet: 0.5 })
          : burst(b, { ...at, dur: 0.5, attack: 0.05, type: "highpass", f: 3500, q: 0.7, peak: 0.008, wet: 0.3 }),
    },
  ],

  /** A storm outside the manor, and something low and patient underneath. */
  crime: [
    bed(1.5, { type: "bandpass", f: 2300, spread: 600, q: 0.4, peak: 0.02, wet: 0.15 }),
    {
      gap: [0.25, 0.9],
      play: (b, at, r) => burst(b, { ...at, dur: 0.002, decay: 0.01 + r() * 0.01, type: "highpass", f: 3000 + r() * 4000, q: 1, peak: 0.005 + r() * 0.01, wet: 0.2 }),
    },
    drone(7, [38, 45], 0.022),
    {
      gap: [16, 28],
      first: 5,
      play: (b, at, r) => {
        burst(b, { ...at, dur: 0.08, decay: 0.3, type: "highpass", f: 1800, q: 0.5, peak: 0.03, wet: 0.4 });
        burst(b, { ...at, at: at.at + 0.05, dur: 3.2, attack: 0.05, type: "lowpass", f: 180, f2: 45, q: 0.8, peak: 0.09 + r() * 0.05, wet: 0.5 });
        burst(b, { ...at, at: at.at + 0.3 + r() * 0.4, dur: 2.2, attack: 0.3, type: "lowpass", f: 90, f2: 40, q: 0.6, peak: 0.07, wet: 0.6 });
      },
    },
  ],

  /** A guzheng in the empty hall, a temple gong far off. */
  palace: [
    drone(8, [50, 57], 0.016),
    {
      gap: [0.9, 2.4],
      first: 1.2,
      play: (b, at, r) => {
        const i = Math.floor(r() * PENTA_D.length);
        note(b, "pluck", { ...at, f: midiHz(PENTA_D[i]), peak: 0.07, wet: 0.45 });
        const roll = r();
        if (roll < 0.25) note(b, "pluck", { ...at, at: at.at + 0.14, f: midiHz(PENTA_D[Math.max(0, i - 1)]), peak: 0.05, wet: 0.45 });
        else if (roll < 0.4)
          for (let k = 1; k <= 3; k++) note(b, "pluck", { ...at, at: at.at + 0.09 * k, f: midiHz(PENTA_D[Math.min(PENTA_D.length - 1, i + k)]), peak: 0.045, wet: 0.45 });
      },
    },
    {
      gap: [18, 26],
      first: 7,
      play: (b, at) => strike(b, 82, [1, 1.48, 2.06, 2.72, 3.4], [1, 0.6, 0.45, 0.3, 0.2], [3.2, 2.4, 1.8, 1.2, 0.9], { ...at, peak: 0.07, wet: 0.6, glide: 0.97 }),
    },
  ],

  /** The family dinner: talk, glasses, a little festive tune, firecrackers down the street. */
  family: [
    babble([0.08, 0.24], 240, 820, 0.17),
    {
      gap: [4, 9],
      first: 2,
      play: (b, at, r) => strike(b, 2600 + r() * 1400, [1, 2.76, 5.4], [1, 0.4, 0.2], [0.4, 0.25, 0.12], { ...at, peak: 0.03, wet: 0.35 }),
    },
    {
      gap: [4, 7],
      first: 1,
      play: (b, at, r) => {
        const start = Math.floor(r() * 4);
        const up = r() < 0.5;
        for (let i = 0; i < 3; i++) note(b, "marimba", { ...at, at: at.at + i * 0.2, f: midiHz(PENTA_C[start + (up ? i : 2 - i)]), peak: 0.04, wet: 0.35 });
      },
    },
    {
      gap: [22, 34],
      first: 11,
      play: (b, at, r) => {
        const n = 10 + Math.floor(r() * 8);
        for (let i = 0; i < n; i++) {
          const t = at.at + (i / n) * 1.6 + r() * 0.05;
          burst(b, { ...at, at: t, dur: 0.003, decay: 0.03, type: "highpass", f: 900, q: 0.7, peak: 0.02 + r() * 0.02, wet: 0.7 });
          burst(b, { ...at, at: t, dur: 0.02, decay: 0.12, type: "lowpass", f: 160, q: 0.7, peak: 0.02, wet: 0.7 });
        }
      },
    },
  ],

  /** A love song on the piano, slowly, and a music box now and then. */
  love: [
    {
      gap: [4, 4],
      first: 0.3,
      play: (b, at, r, k) => {
        const [bass, ...chord] = BALLAD[k % BALLAD.length];
        note(b, "pad", { ...at, f: midiHz(bass), dur: 4.2, peak: 0.016 });
        chord.forEach((m, i) => note(b, "ep", { ...at, at: at.at + i * 0.42 + r() * 0.03, f: midiHz(m), dur: 1.6, peak: 0.04, wet: 0.45 }));
      },
    },
    {
      gap: [7, 12],
      first: 6,
      play: (b, at, r) => note(b, "musicbox", { ...at, f: midiHz(PENTA_C[3 + Math.floor(r() * 5)] + 12), peak: 0.025 }),
    },
  ],

  /** The office: the air conditioning, keyboards, a phone nobody answers. */
  office: [
    bed(2, { type: "bandpass", f: 1000, spread: 200, q: 0.5, peak: 0.05, wet: 0.05 }),
    {
      gap: [2.5, 6],
      first: 0.8,
      play: (b, at, r) => {
        const n = 4 + Math.floor(r() * 10);
        let t = at.at;
        for (let i = 0; i < n; i++) {
          t += 0.07 + r() * 0.11;
          burst(b, { ...at, at: t, dur: 0.002, decay: 0.012, type: "bandpass", f: 2400 + r() * 1800, q: 2, peak: 0.02 + r() * 0.012, wet: 0.08 });
        }
      },
    },
    {
      gap: [20, 30],
      first: 9,
      play: (b, at) => {
        for (let ring = 0; ring < 2; ring++)
          for (let i = 0; i < 10; i++) tone(b, { ...at, at: at.at + ring * 1.1 + i * 0.05, f: i % 2 ? 1180 : 940, peak: 0.02, attack: 0.002, decay: 0.045, type: "triangle", wet: 0.15 });
      },
    },
  ],

  /** A live studio: the audience murmuring, laughing, clapping; a gift chime from a viewer. */
  show: [
    babble([0.05, 0.13], 300, 1100, 0.11),
    {
      gap: [9, 16],
      first: 4,
      play: (b, at, r) => {
        for (let i = 0; i < 6; i++) {
          const f = 480 + r() * 260;
          burst(b, { ...at, at: at.at + i * 0.15 + r() * 0.03, dur: 0.08, attack: 0.02, decay: 0.07, type: "bandpass", f, f2: f * 1.12, q: 6, peak: 0.018, wet: 0.5 });
        }
      },
    },
    {
      gap: [15, 24],
      first: 8,
      play: (b, at, r) => {
        for (let i = 0; i < 34; i++) {
          const u = r();
          burst(b, { ...at, at: at.at + u * 1.4, dur: 0.002, decay: 0.012 + r() * 0.02, f: 900 + r() * 1900, q: 1.4, peak: (0.012 + r() * 0.02) * (Math.sin(Math.PI * u) * 0.8 + 0.2), wet: 0.4 });
        }
      },
    },
    {
      gap: [5, 10],
      first: 2.5,
      play: (b, at) => [84, 88, 91].forEach((m, i) => note(b, "bell", { ...at, at: at.at + i * 0.08, f: midiHz(m), peak: 0.022 })),
    },
  ],

  /** The cinema, for a famous scene: the projector rattling in the booth, and the score swelling now and then. */
  classic: [
    bed(2, { type: "bandpass", f: 1500, spread: 300, q: 0.7, peak: 0.016, wet: 0.08 }),
    {
      // the film running through the gate
      gap: [0.085, 0.11],
      play: (b, at, r) => burst(b, { ...at, dur: 0.002, decay: 0.008, type: "highpass", f: 2600 + r() * 900, q: 1.2, peak: 0.004 + r() * 0.003, wet: 0.05 }),
    },
    {
      gap: [8, 8],
      first: 1.5,
      play: (b, at, r, k) => {
        const [bass, ...chord] = SCORE[k % SCORE.length];
        note(b, "pad", { ...at, f: midiHz(bass), dur: 8.4, peak: 0.018, wet: 0.6 });
        chord.forEach((m, i) => note(b, "pad", { ...at, at: at.at + 0.2 * i, f: midiHz(m), dur: 8, peak: 0.011, wet: 0.6 }));
        // a solo violin above, rising into the chord
        const top = midiHz(chord[chord.length - 1] + 12);
        tone(b, { ...at, at: at.at + 1.2, f: top * 0.94, f2: top, glide: 1.4, type: "sawtooth", peak: 0.004 + r() * 0.002, attack: 1.4, decay: 4, wet: 0.7 });
        // and a timpani on the downbeat, every other chord
        if (k % 2 === 0) burst(b, { ...at, dur: 1.4, attack: 0.01, type: "lowpass", f: 130, f2: 55, q: 0.9, peak: 0.05, wet: 0.5 });
      },
    },
  ],

  /** A hushed room for a straight face: the air, a chair creaking, someone trying not to cough. */
  hush: [
    bed(3, { type: "bandpass", f: 420, spread: 80, q: 0.6, peak: 0.012, wet: 0.2 }),
    {
      gap: [9, 16],
      first: 6,
      play: (b, at, r) =>
        r() < 0.6
          ? burst(b, { ...at, dur: 0.12, attack: 0.01, decay: 0.08, type: "bandpass", f: 700 + r() * 300, q: 2, peak: 0.02, wet: 0.5 })
          : tone(b, { ...at, f: 180 + r() * 60, f2: 150 + r() * 40, glide: 0.35, type: "sawtooth", peak: 0.004, attack: 0.05, decay: 0.35, wet: 0.3 }),
    },
  ],

  /** The press conference for an apology: a quiet room, and the cameras going off. */
  press: [
    bed(2.5, { type: "bandpass", f: 900, spread: 150, q: 0.5, peak: 0.016, wet: 0.15 }),
    {
      gap: [1.2, 4.5],
      first: 0.8,
      play: (b, at, r) => {
        // one camera, or a few at once
        const n = r() < 0.25 ? 3 + Math.floor(r() * 4) : 1;
        for (let i = 0; i < n; i++) {
          const t = at.at + i * (0.09 + r() * 0.12);
          burst(b, { ...at, at: t, dur: 0.002, decay: 0.018, type: "highpass", f: 2600 + r() * 1600, q: 1, peak: 0.022 + r() * 0.012, wet: 0.2 });
          burst(b, { ...at, at: t + 0.05, dur: 0.002, decay: 0.03, type: "bandpass", f: 900 + r() * 400, q: 1.5, peak: 0.018, wet: 0.2 });
        }
      },
    },
  ],

  /** The duel: two spotlights, a held breath, a heartbeat. */
  pk: [
    drone(6, [43, 50], 0.018),
    {
      gap: [1.4, 1.4],
      first: 0.6,
      play: (b, at) => {
        kick(b, { ...at, peak: 0.09, tone: 0.45 });
        kick(b, { ...at, at: at.at + 0.22, peak: 0.06, tone: 0.45 });
      },
    },
  ],
};

/**
 * Start a soundscape. `startPerf` is when it began on this phone's performance clock (so a
 * phone that arrives late joins in step); `seed` makes every phone's random the same.
 */
export function startAmbience(scape: Scape, opts: { startPerf: number; seed: number; volume?: number }): Ambience | null {
  const b = bus();
  if (!b) return null;
  const out = b.c.createGain();
  out.gain.value = 0;
  out.connect(b.music);
  out.gain.setTargetAtTime(1.4 * (opts.volume ?? 1), b.c.currentTime, 0.9);
  const origin = ctxTimeAt(b, opts.startPerf);
  const layers = SCAPES[scape].map((l, i) => ({ l, seed: mix(opts.seed, i + 1), k: 0, t: origin + (l.first ?? 0) }));
  let dead = false;
  const step = () => {
    if (dead) return;
    const now = b.c.currentTime;
    const horizon = now + 0.6;
    for (const x of layers) {
      let guard = 0;
      while (x.t < horizon && guard++ < 4000) {
        if (x.t >= now - 0.03) x.l.play(b, { at: x.t, abs: true, dest: out }, rng(mix(x.seed ^ 0x51ed27, x.k)), x.k);
        x.t += x.l.gap[0] + rng(mix(x.seed, x.k))() * (x.l.gap[1] - x.l.gap[0]);
        x.k++;
      }
    }
  };
  step();
  const timer = window.setInterval(step, 200);
  return {
    stop(fade = 0.6) {
      if (dead) return;
      dead = true;
      window.clearInterval(timer);
      const t = b.c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.setTargetAtTime(0, t, Math.max(0.02, fade / 3));
      window.setTimeout(() => out.disconnect(), fade * 1000 + 3000);
    },
  };
}
