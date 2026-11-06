/**
 * The night's set: the background music around the site, eight original songs in different styles,
 * all livelier than the lofi loop it replaced (Steve 2026-11-05: more of them, and more of a party).
 * Every song is made here on the step sequencer in lib/music.ts, so there is nothing to license and
 * nothing to download but this file.
 *
 * A song is one 4-bar loop of each part, played as a short arrangement (FORM): an intro on the hats
 * and chords, the groove, a break that rolls into the drop, the drop with the hook, and an outro that
 * rolls into the next song. Each visit plays the songs in its own shuffled order (lib/music.ts).
 */
import { chord, line, v, type Style } from "./music";

export type Part = "kick" | "snare" | "clap" | "hat" | "ohat" | "shaker" | "tom" | "bass" | "chords" | "lead";
/** `loops` of the song's 4 bars; `fill` ends it on a snare roll; `crash` opens it on a cymbal */
export type Section = { loops: number; mute?: Part[]; fill?: boolean; crash?: boolean };
export type Song = { name: { zh: string; en: string }; style: Style };

export const FORM: Section[] = [
  { loops: 1, mute: ["kick", "snare", "clap", "bass", "lead"] },
  { loops: 2, mute: ["lead"], crash: true },
  { loops: 1, mute: ["kick", "snare", "clap", "bass"], fill: true },
  { loops: 3, crash: true },
  { loops: 1, mute: ["chords", "lead"], fill: true },
];

/** The song as one section plays it: the muted parts left out. */
export function sectionStyle(s: Style, sec: Section): Style {
  if (!sec.mute?.length) return s;
  const out: Style = { ...s };
  for (const p of sec.mute) delete out[p];
  return out;
}

export const SONGS: Song[] = [
  {
    // piano house on the 王道 progression (IV V iii vi), bells on top
    name: { zh: "天台", en: "Rooftop" },
    style: {
      bpm: 124,
      kick: v("x...x...x...x..."),
      clap: v("....x.......x..."),
      hat: v("-.-.-.-.-.-.-.-."),
      ohat: v("..x...x...x...x."),
      shaker: v(".o.o.o.o.o.o.o.o"),
      bass: [line(". . F2 . . . F2 . . . F2 . . F2 . ."), line(". . G2 . . . G2 . . . G2 . . G2 . ."), line(". . E2 . . . E2 . . . E2 . . E2 . ."), line(". . A1 . . . A1 . . . A2 . . A1 . .")],
      bassLen: 1.3,
      chords: {
        inst: "ep",
        prog: [chord("F3", "A3", "C4", "E4"), chord("G3", "B3", "D4", "F4"), chord("E3", "G3", "B3", "D4"), chord("A3", "C4", "E4", "G4")],
        hits: [
          [0, 2],
          [3, 1],
          [6, 2],
          [10, 1],
          [12, 2],
        ],
        peak: 0.055,
      },
      lead: {
        inst: "bell",
        bars: [line("A5 . . G5 . . E5 . . . G5 . A5 . . ."), line("B5 . . A5 . . G5 . . . D5 . G5 . . ."), line("G5 . . E5 . . B4 . . . D5 . E5 . . ."), line("C6 . . B5 . . A5 . . . E5 . A5 . . .")],
        len: 2,
        peak: 0.07,
      },
      gain: 0.9,
    },
  },
  {
    // nu-disco: octave bass, a guitar on the offbeats, horn hits at the end of each bar
    name: { zh: "镜面球", en: "Mirror Ball" },
    style: {
      bpm: 118,
      kick: v("x...x...x...x..."),
      snare: v("....x.......x..."),
      hat: v("xoxoxoxoxoxoxoxo"),
      ohat: v("..x...x...x...x."),
      bass: [line("G1 . G2 . G1 . G2 . G1 . G2 . G1 . G2 ."), line("C2 . C3 . C2 . C3 . C2 . C3 . C2 . C3 ."), line("F1 . F2 . F1 . F2 . F1 . F2 . F1 . F2 ."), line("D2 . D3 . D2 . D3 . A1 . A2 . C2 . C3 .")],
      bassLen: 0.9,
      chords: {
        inst: "pluck",
        prog: [chord("G3", "Bb3", "D4", "F4"), chord("G3", "Bb3", "C4", "E4"), chord("F3", "A3", "C4", "E4"), chord("F3", "A3", "C4", "D4")],
        hits: [
          [2, 1],
          [6, 1],
          [10, 1],
          [14, 1],
        ],
        peak: 0.07,
      },
      lead: {
        inst: "brass",
        bars: [line(". . . . . . . . . . D5 . F5 . . ."), line(". . . . . . . . . . E5 . G5 . . ."), line(". . . . . . . . . . C5 . E5 . F5 ."), line(". . . . . . . . D5 . . F5 . . A5 .")],
        len: 1.2,
        peak: 0.07,
      },
      gain: 0.85,
    },
  },
  {
    // afrobeats: a swung shaker, rim clicks on 3-3-2, congas, a highlife guitar line, marimba chords
    name: { zh: "拉各斯之夜", en: "Lagos Nights" },
    style: {
      bpm: 106,
      swing: 0.12,
      kick: v("x.....x...x....."),
      snare: v("...o..o....o..o."),
      clap: v("....-.......o..."),
      hat: v("..-...-...-...-."),
      shaker: v("xoxoxoxoxoxoxoxo"),
      tom: v(".......o......o."),
      bass: [line("C2 . . . . . G1 . . . C2 . . E2 . ."), line("A1 . . . . . E2 . . . A1 . . C2 . ."), line("F1 . . . . . C2 . . . F1 . . A1 . ."), line("G1 . . . . . D2 . . . G1 . . B1 . .")],
      bassLen: 2,
      chords: {
        inst: "marimba",
        prog: [chord("E4", "G4", "C5"), chord("E4", "A4", "C5"), chord("F4", "A4", "C5"), chord("D4", "G4", "B4")],
        hits: [
          [2, 1],
          [5, 1],
          [8, 1],
          [13, 1],
        ],
        peak: 0.08,
      },
      lead: {
        inst: "pluck",
        bars: [
          line("G5 . E5 . C5 . E5 G5 . . A5 . G5 . E5 ."),
          line("A5 . E5 . C5 . E5 A5 . . C6 . A5 . E5 ."),
          line("A5 . F5 . C5 . F5 A5 . . C6 . A5 . F5 ."),
          line("G5 . D5 . B4 . D5 G5 . . B5 . A5 . G5 ."),
        ],
        len: 0.9,
        peak: 0.09,
      },
      gain: 0.9,
    },
  },
  {
    // reggaeton: the dembow on the snare, a sub that follows it, a plucky synth hook
    name: { zh: "狂欢", en: "Fiesta" },
    style: {
      bpm: 95,
      kick: v("x...x...x...x..."),
      snare: v("...x..x....x..x."),
      hat: v("o.o.o.o.o.o.o.oo"),
      shaker: v("..o...o...o...o."),
      bass: [line("A1 . . A1 . . A1 . A1 . . A1 . . A1 ."), line("F1 . . F1 . . F1 . F1 . . F1 . . F1 ."), line("C2 . . C2 . . C2 . C2 . . C2 . . C2 ."), line("G1 . . G1 . . G1 . G1 . . G1 . . G1 .")],
      bassLen: 1.8,
      chords: { inst: "pad", prog: [chord("A3", "C4", "E4"), chord("A3", "C4", "F4"), chord("G3", "C4", "E4"), chord("G3", "B3", "D4")], hits: [[0, 16]], peak: 0.03 },
      lead: {
        inst: "lead",
        bars: [line("E5 . . E5 . . D5 . C5 . . . D5 . E5 ."), line("F5 . . E5 . . C5 . A4 . . . C5 . . ."), line("E5 . . E5 . . G5 . E5 . . . D5 . C5 ."), line("D5 . . B4 . . G4 . B4 . . . D5 . . .")],
        len: 1.2,
        peak: 0.04,
      },
      gain: 0.9,
    },
  },
  {
    // UK garage: a swung 2-step, Rhodes stabs in F minor, a chopped pluck
    name: { zh: "末班车", en: "Night Bus" },
    style: {
      bpm: 132,
      swing: 0.2,
      kick: v("x......x..x....."),
      clap: v("....x.......x..."),
      hat: v("..o...o...o...o."),
      shaker: v("-o-o-o-o-o-o-o-o"),
      bass: [line("F1 . . . . . . F2 . . F1 . . . Eb2 ."), line("Db2 . . . . . . Db3 . . Db2 . . . C2 ."), line("Eb2 . . . . . . Eb3 . . Eb2 . . . F2 ."), line("C2 . . . . . . C3 . . C2 . . . Bb1 .")],
      bassLen: 2.2,
      chords: {
        inst: "ep",
        prog: [chord("Ab3", "C4", "Eb4", "G4"), chord("F3", "Ab3", "C4", "Db4"), chord("G3", "Bb3", "Eb4", "F4"), chord("G3", "Bb3", "C4", "Eb4")],
        hits: [
          [2, 1],
          [7, 2],
          [12, 1],
        ],
        peak: 0.06,
      },
      lead: {
        inst: "pluck",
        bars: [line(". . C5 . Eb5 . . F5 . . Eb5 . C5 . . ."), line(". . Db5 . F5 . . Ab5 . . F5 . Db5 . . ."), line(". . Eb5 . G5 . . Bb5 . . G5 . F5 . . ."), line(". . C5 . Eb5 . . G5 . . Bb4 . C5 . . .")],
        len: 0.8,
        peak: 0.09,
      },
      gain: 0.85,
    },
  },
  {
    // synth-pop: four on the floor, a pumping bass, a bright arpeggio hook in C# minor
    name: { zh: "霓虹", en: "Neon" },
    style: {
      bpm: 126,
      kick: v("x...x...x...x..."),
      clap: v("....x.......x..."),
      hat: v("o-o-o-o-o-o-o-o-"),
      ohat: v("..x...x...x...x."),
      bass: [line(". . C#2 . . . C#2 . . . C#2 . . . C#2 C#2"), line(". . A1 . . . A1 . . . A1 . . . A1 A1"), line(". . E2 . . . E2 . . . E2 . . . E2 E2"), line(". . B1 . . . B1 . . . B1 . . . B1 B1")],
      bassLen: 1.6,
      chords: { inst: "pad", prog: [chord("G#3", "C#4", "E4"), chord("A3", "C#4", "E4"), chord("G#3", "B3", "E4"), chord("F#3", "B3", "D#4")], hits: [[0, 16]], peak: 0.03 },
      lead: {
        inst: "lead",
        bars: [
          line("G#5 . E5 . C#5 . E5 . G#5 . . B5 . G#5 . ."),
          line("A5 . E5 . C#5 . E5 . A5 . . C#6 . A5 . ."),
          line("B5 . G#5 . E5 . G#5 . B5 . . E6 . B5 . ."),
          line("F#5 . D#5 . B4 . D#5 . F#5 . . A5 . G#5 . ."),
        ],
        len: 0.9,
        peak: 0.04,
      },
      gain: 0.85,
    },
  },
  {
    // 国风 dance: four on the floor under a guzheng-like pluck on the D major pentatonic
    name: { zh: "东风", en: "East Wind" },
    style: {
      bpm: 120,
      kick: v("x...x...x...x..."),
      clap: v("....x.......x..."),
      ohat: v("..x...x...x...x."),
      shaker: v("o-o-o-o-o-o-o-o-"),
      tom: v("..............oo"),
      bass: [line("D2 . . D2 . . D3 . . . D2 . . D2 . ."), line("B1 . . B1 . . B2 . . . B1 . . B1 . ."), line("G1 . . G1 . . G2 . . . G1 . . G1 . ."), line("A1 . . A1 . . A2 . . . A1 . . C#2 . .")],
      bassLen: 1.4,
      chords: { inst: "pad", prog: [chord("F#3", "A3", "D4"), chord("F#3", "B3", "D4"), chord("G3", "B3", "D4"), chord("E3", "A3", "C#4")], hits: [[0, 16]], peak: 0.03 },
      lead: {
        inst: "pluck",
        bars: [
          line("A5 . B5 . D6 . . B5 A5 . F#5 . E5 . D5 ."),
          line("F#5 . . E5 D5 . . B4 . . D5 . E5 . F#5 ."),
          line("B5 . A5 . F#5 . . E5 D5 . . E5 . F#5 . ."),
          line("E5 . . F#5 A5 . . B5 . . A5 . F#5 . E5 ."),
        ],
        len: 1.1,
        peak: 0.1,
      },
      gain: 0.9,
    },
  },
  {
    // funk: a busy kick, ghost notes, a slap-like bass, clav chords and a horn section
    name: { zh: "放克机器", en: "Groove Machine" },
    style: {
      bpm: 112,
      swing: 0.06,
      kick: v("x..x...x.x....x."),
      snare: v("....x.-..-..x.-."),
      hat: v("xoxoxoxoxoxoxoxo"),
      ohat: v("..............x."),
      bass: [line("A1 . A2 . . A1 . G2 . . E2 . G2 . A2 ."), line("D2 . D3 . . D2 . C3 . . A2 . C3 . D3 ."), line("A1 . A2 . . A1 . G2 . . E2 . G2 . A2 ."), line("E2 . E3 . . E2 . D3 . . B2 . G#2 . E2 .")],
      bassLen: 0.6,
      chords: {
        inst: "pluck",
        prog: [chord("G3", "C4", "E4"), chord("F#3", "C4", "E4"), chord("G3", "C4", "E4"), chord("G#3", "D4", "G4")],
        hits: [
          [2, 1],
          [6, 1],
          [10, 1],
          [11, 1],
          [14, 1],
        ],
        peak: 0.07,
      },
      lead: {
        inst: "brass",
        bars: [line(". . . . . . . . . . . . A4 . C5 ."), line(". . . . . . . . . . . . D5 . C5 ."), line(". . . . . . . . . . E5 . D5 . C5 ."), line(". . . . . . . . G#4 . . B4 . D5 . E5")],
        len: 1,
        peak: 0.08,
      },
      gain: 0.85,
    },
  },
];
