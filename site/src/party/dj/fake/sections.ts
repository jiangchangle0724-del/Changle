/**
 * 打碟 · DJ Booth: the stand-in DJ's music (until Lyria plays). Six 8-bar sections of deep house
 * at 125 BPM in A minor, written for the site's own instruments: two to warm up, one to build, two
 * for the peak, one to wind down. Each is a 4-bar loop played twice, plus what happens at its edges
 * (a crash on the drop, a snare roll and a riser before it, a tom fill at the end of a phrase).
 *
 * The DJ picks the next section at the end of each one, by the phase of the night (arrange.ts).
 */
import { chord, line, v, type Style } from "../../../lib/music";
import type { SetPhase } from "../../../shared/dj/types";

export type Extra = "crash" | "roll" | "riser" | "fill";
/** More of the drum kit than a Style has (render.ts DRUMS): a key, 16 steps of strengths, how loud. */
export type Perc = { key: string; hits: number[]; peak: number };

export type Section = {
  id: string;
  phase: SetPhase;
  style: Style;
  /** how loud it sits, as an RMS level in dBFS (the warm-up quieter than the peak) */
  level: number;
  /** a low-pass over the whole section, for a darker warm-up and wind-down (Hz) */
  lp?: number;
  /** bars (0 to 7) with no kick: a breakdown */
  noKick?: number[];
  /** what happens at the edges of the phrase */
  extras?: Extra[];
  /** congas, a clave, a dhol: the other styles' own percussion (styles.ts) */
  perc?: Perc[];
};

export const BPM = 125;
export const BARS = 8;

/* the 4-bar loop under everything: Am7, Fmaj7, Cmaj7, G6 */
const PROG = [chord("A3", "C4", "E4", "G4"), chord("F3", "A3", "C4", "E4"), chord("C4", "E4", "G4", "B4"), chord("G3", "B3", "D4", "E4")];
const ROOTS = ["A1", "F1", "C2", "G1"];
const offbeatBass = ROOTS.map((n) => line(`. . ${n} . . . ${n} . . . ${n} . . . ${n} .`));
const octave = (n: string) => n.replace(/(\d)$/, (d) => String(Number(d) + 1));
const busyBass = ROOTS.map((n) => line(`. . ${n} . . . ${octave(n)} . . . ${n} . ${n} . ${octave(n)} .`));
const longBass = ROOTS.map((n) => line(`${n} . . . . . . . . . . . . . . .`));
const STABS: [number, number][] = [
  [3, 1],
  [6, 2],
  [11, 1],
  [14, 1],
];

export const SECTIONS: Section[] = [
  {
    id: "warm1",
    phase: "warm",
    level: -19,
    lp: 2600,
    style: {
      bpm: BPM,
      kick: v("o...o...o...o..."),
      hat: v("..o...o...o...o."),
      shaker: v("-.-.-.-.-.-.-.-."),
      bass: offbeatBass,
      chords: { inst: "pad", prog: PROG, hits: [[0, 16]], peak: 0.035 },
      gain: 0.9,
    },
  },
  {
    id: "warm2",
    phase: "warm",
    level: -18,
    lp: 5000,
    style: {
      bpm: BPM,
      kick: v("x...x...x...x..."),
      clap: v("....o.......o..."),
      hat: v("..o...o...o...o."),
      ohat: v("..-...-...-...-."),
      shaker: v("-.-.-.-.-.-.-.-."),
      bass: offbeatBass,
      chords: { inst: "ep", prog: PROG, hits: [[3, 1], [6, 2], [11, 1]], peak: 0.055 },
      gain: 0.9,
    },
  },
  {
    id: "build1",
    phase: "build",
    level: -16.5,
    extras: ["roll", "riser"],
    style: {
      bpm: BPM,
      kick: v("x...x...x...x..."),
      clap: v("....x.......x..."),
      hat: v("-.o.-.o.-.o.-.o."),
      ohat: v("..x...x...x...x."),
      shaker: v("-o-o-o-o-o-o-o-o"),
      bass: busyBass,
      chords: { inst: "ep", prog: PROG, hits: STABS, peak: 0.065 },
      gain: 0.9,
    },
  },
  {
    id: "peak1",
    phase: "peak",
    level: -15,
    extras: ["crash", "fill"],
    style: {
      bpm: BPM,
      kick: v("x...x...x...x..."),
      clap: v("....x.......x..."),
      hat: v("-o-o-o-o-o-o-o-o"),
      ohat: v("..x...x...x...x."),
      shaker: v("o-o-o-o-o-o-o-o-"),
      bass: busyBass,
      chords: { inst: "ep", prog: PROG, hits: STABS, peak: 0.06 },
      lead: {
        inst: "pluck",
        bars: [
          line("A4 . E5 . C5 . E5 . A5 . E5 . C5 . E5 ."),
          line("F4 . C5 . A4 . C5 . F5 . C5 . A4 . C5 ."),
          line("C5 . G5 . E5 . G5 . C6 . G5 . E5 . G5 ."),
          line("G4 . D5 . B4 . D5 . G5 . D5 . B4 . E5 ."),
        ],
        len: 1.2,
        peak: 0.09,
      },
      gain: 0.9,
    },
  },
  {
    id: "peak2",
    phase: "peak",
    level: -15,
    extras: ["fill"],
    style: {
      bpm: BPM,
      kick: v("x...x...x...x..."),
      clap: v("....x.......x..."),
      hat: v("-o-o-o-o-o-o-o-o"),
      ohat: v("..x...x...x...x."),
      shaker: v("o-o-o-o-o-o-o-o-"),
      bass: busyBass,
      chords: { inst: "ep", prog: PROG, hits: STABS, peak: 0.055 },
      lead: {
        inst: "bell",
        bars: [line("E5 . . E5 . . D5 . C5 . . . A4 . . ."), line("C5 . . C5 . . A4 . G4 . . . A4 . . ."), line("E5 . . E5 . . G5 . E5 . . . D5 . C5 ."), line("D5 . . D5 . . B4 . G4 . . . . . . .")],
        len: 2,
        peak: 0.075,
      },
      gain: 0.9,
    },
  },
  {
    id: "cool1",
    phase: "cool",
    level: -19.5,
    lp: 2400,
    noKick: [0, 1, 2, 3],
    style: {
      bpm: BPM,
      kick: v("o...o...o...o..."),
      hat: v("..-...-...-...-."),
      shaker: v("-.-.-.-.-.-.-.-."),
      bass: longBass,
      bassLen: 12,
      chords: { inst: "pad", prog: PROG, hits: [[0, 16]], peak: 0.04 },
      lead: {
        inst: "ep",
        bars: [line("E5 . . . . . . . C5 . . . . . . ."), line("C5 . . . . . . . A4 . . . . . . ."), line("G5 . . . . . . . E5 . . . . . . ."), line("D5 . . . . . . . B4 . . . . . . .")],
        len: 6,
        peak: 0.05,
      },
      gain: 0.9,
    },
  },
];

export const SECTION_BY_ID: Record<string, Section> = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

/** Exact sizes at a sample rate: at 48 kHz a beat is 23,040 samples, a section 737,280. */
export const beatFrames = (rate: number) => (rate * 60) / BPM;
export const sectionFrames = (rate: number) => Math.round(beatFrames(rate) * 4 * BARS);
