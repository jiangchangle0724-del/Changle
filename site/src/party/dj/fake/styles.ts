/**
 * 打碟 · DJ Booth: the stand-in DJ's other eleven styles (house is sections.ts), for the beginner
 * deck. Like a game that fits every song to one tempo and key, they all play at 125 BPM in A minor
 * over the same four chords (Am, F, C, G), so any two decks blend in key and on the beat: a style is
 * its drums, its bass, how it plays the chords and its melody, not its own tempo.
 *
 * Each style is a kit, the whole groove as its peak plays it; `kitSections` makes the six sections
 * of the night from it the way house's are written: two to warm up (fewer parts, darker), one to
 * build (a roll and a riser at the end), two for the peak (everything, a crash on the drop), one to
 * wind down (no kick for the first half, long bass, held chords).
 */
import type { Inst } from "../../../lib/audio/engine";
import { chord, line, v, type Style } from "../../../lib/music";
import type { StyleId } from "../../../shared/dj/types";
import { BPM, SECTIONS, type Perc, type Section } from "./sections";

type Notes = (number | null)[];
type Part = { inst: Inst; bars: Notes[]; len?: number; peak: number };

export type Kit = {
  id: Exclude<StyleId, "house">;
  swing?: number;
  /** 16 steps each: x loud, o medium, - soft, . nothing */
  kick: string;
  snare?: string;
  clap?: string;
  hat?: string;
  ohat?: string;
  shaker?: string;
  /** more of the drum kit (render.ts DRUMS): congas, a clave, a dhol */
  perc?: { key: string; hits: string; peak: number }[];
  bass: Notes[];
  bassLen?: number;
  chords: { inst: Inst; prog: number[][]; hits: [number, number][]; peak: number };
  lead: Part;
  /** the second peak's melody (the first's again if none) */
  lead2?: Part;
  /** the peak's loudness, RMS dBFS; the other sections sit under it as house's do */
  level?: number;
  gain?: number;
};

/* the four chords every style plays, in a few voicings */
const ROOTS = ["A1", "F1", "C2", "G1"];
const TRIADS = [chord("A3", "C4", "E4"), chord("F3", "A3", "C4"), chord("C4", "E4", "G4"), chord("G3", "B3", "D4")];
const SEVENTHS = [chord("A3", "C4", "E4", "G4"), chord("F3", "A3", "C4", "E4"), chord("C4", "E4", "G4", "B4"), chord("G3", "B3", "D4", "E4")];
const NINTHS = [chord("A3", "C4", "E4", "G4", "B4"), chord("F3", "A3", "C4", "E4", "G4"), chord("C4", "E4", "G4", "B4", "D5"), chord("G3", "B3", "D4", "E4", "A4")];
const HIGH = [chord("A4", "C5", "E5"), chord("A4", "C5", "F5"), chord("G4", "C5", "E5"), chord("G4", "B4", "D5")];
const LOW = [chord("A2", "E3", "C4"), chord("F2", "C3", "A3"), chord("C3", "G3", "E4"), chord("G2", "D3", "B3")];

const up = (n: string) => n.replace(/(\d)$/, (d) => String(Number(d) + 1));
/** A bass line from a pattern of the bar's root (`r`) and the root an octave up (`h`). */
const bassOf = (pat: string) => ROOTS.map((r) => line(pat.replace(/\bh\b/g, up(r)).replace(/\br\b/g, r)));
const bars = (...ls: string[]) => ls.map(line);

export const KITS: Kit[] = [
  {
    id: "latin",
    kick: "x...x...x...x...",
    // the dembow, on the rim
    snare: "...o..o....o..o.",
    hat: "..o...o...o...o.",
    shaker: "-o-o-o-o-o-o-o-o",
    perc: [
      { key: "clave", hits: "x..x..x...x.x...", peak: 0.16 },
      { key: "tom1.6", hits: "..o.o.....o.o...", peak: 0.18 },
      { key: "tom1.3", hits: "......o.......o.", peak: 0.2 },
    ],
    bass: bassOf("r . . r . . h . . . r . h . . ."),
    bassLen: 1.4,
    chords: { inst: "pluck", prog: TRIADS, hits: [[0, 1], [3, 1], [6, 1], [10, 1], [13, 1]], peak: 0.06 },
    lead: { inst: "brass", bars: bars("A4 . . C5 . . E5 . D5 . C5 . . A4 . .", "A4 . . C5 . . F5 . E5 . C5 . . A4 . .", "G4 . . C5 . . E5 . D5 . C5 . . G4 . .", "B4 . . D5 . . G5 . E5 . D5 . . B4 . ."), len: 1.5, peak: 0.07 },
    lead2: { inst: "marimba", bars: bars("A5 . . C6 . . E6 . D6 . C6 . . A5 . .", "A5 . . C6 . . F6 . E6 . C6 . . A5 . .", "G5 . . C6 . . E6 . D6 . C6 . . G5 . .", "B5 . . D6 . . G6 . E6 . D6 . . B5 . ."), len: 1, peak: 0.09 },
  },
  {
    id: "techno",
    kick: "x...x...x...x...",
    clap: "....o.......o...",
    hat: "-o-o-o-o-o-o-o-o",
    ohat: "..x...x...x...x.",
    perc: [{ key: "tom0.8", hits: "......o.......o.", peak: 0.12 }],
    // the rumble: the root on every sixteenth but the beat
    bass: bassOf(". r r r . r r r . r r r . r r r"),
    bassLen: 0.6,
    chords: { inst: "pad", prog: LOW, hits: [[0, 16]], peak: 0.025 },
    lead: { inst: "lead", bars: bars("A3 A3 A4 A3 C4 A3 E4 A3 A3 A4 A3 G4 A3 E4 C4 A3", "F3 F3 F4 F3 A3 F3 C4 F3 F3 F4 F3 E4 F3 C4 A3 F3", "C4 C4 C5 C4 E4 C4 G4 C4 C4 C5 C4 B4 C4 G4 E4 C4", "G3 G3 G4 G3 B3 G3 D4 G3 G3 G4 G3 E4 G3 D4 B3 G3"), len: 0.7, peak: 0.04 },
    lead2: { inst: "bell", bars: bars("E5 . . . . . . . . . . . A4 . . .", "C5 . . . . . . . . . . . A4 . . .", "G5 . . . . . . . . . . . E5 . . .", "D5 . . . . . . . . . . . B4 . . ."), len: 3, peak: 0.05 },
    gain: 0.85,
  },
  {
    id: "trance",
    kick: "x...x...x...x...",
    clap: "....x.......x...",
    hat: "-o-o-o-o-o-o-o-o",
    ohat: "..x...x...x...x.",
    // the rolling bass: two sixteenths on every offbeat
    bass: bassOf(". . r r . . r r . . r r . . r r"),
    bassLen: 0.8,
    chords: { inst: "pad", prog: HIGH, hits: [[0, 16]], peak: 0.04 },
    lead: { inst: "pluck", bars: bars("A4 C5 E5 A5 E5 C5 A4 C5 E5 A5 E5 C5 A4 C5 E5 C5", "A4 C5 F5 A5 F5 C5 A4 C5 F5 A5 F5 C5 A4 C5 F5 C5", "G4 C5 E5 G5 E5 C5 G4 C5 E5 G5 E5 C5 G4 C5 E5 C5", "G4 B4 D5 G5 D5 B4 G4 B4 D5 G5 D5 B4 G4 B4 D5 B4"), len: 0.9, peak: 0.05 },
    lead2: { inst: "lead", bars: bars("E5 . . . . . . . D5 . . . C5 . . .", "C5 . . . . . . . A4 . . . C5 . . .", "E5 . . . . . . . G5 . . . E5 . . .", "D5 . . . . . . . B4 . . . . . . ."), len: 3.5, peak: 0.05 },
  },
  {
    id: "bass",
    // half time: the kick on one, the snare on three
    kick: "x.........x.....",
    snare: "........x.......",
    hat: "o.o.o.o.o.o.o.o.",
    bass: bassOf("r . . . . . . . . . . . . . . ."),
    bassLen: 14,
    chords: { inst: "pad", prog: LOW, hits: [[0, 16]], peak: 0.025 },
    // the wobble
    lead: { inst: "lead", bars: bars("A2 . A2 A2 . A2 . . A2 A2 . A2 . A2 A2 .", "F2 . F2 F2 . F2 . . F2 F2 . F2 . F2 F2 .", "C3 . C3 C3 . C3 . . C3 C3 . C3 . C3 C3 .", "G2 . G2 G2 . G2 . . G2 G2 . G2 . G2 G2 ."), len: 0.75, peak: 0.07 },
    lead2: { inst: "lead", bars: bars("A2 A2 A2 . A2 A2 A2 . A2 . A2 A2 A2 . . .", "F2 F2 F2 . F2 F2 F2 . F2 . F2 F2 F2 . . .", "C3 C3 C3 . C3 C3 C3 . C3 . C3 C3 C3 . . .", "G2 G2 G2 . G2 G2 G2 . G2 . G2 G2 G2 . . ."), len: 0.75, peak: 0.07 },
  },
  {
    id: "dnb",
    // breaks: two kicks, two snares, ghosts between
    kick: "x.........x.....",
    snare: "....x.......x...",
    hat: "o.o.o.o.o.o.o.o.",
    shaker: "o-o-o-o-o-o-o-o-",
    perc: [{ key: "snare", hits: "......-.......-.", peak: 0.12 }],
    bass: bassOf("r . . . . . . . . . r . . . . ."),
    bassLen: 8,
    chords: { inst: "pad", prog: SEVENTHS, hits: [[0, 16]], peak: 0.035 },
    lead: { inst: "bell", bars: bars("E5 . . . . . C5 . . . . . A4 . . .", "C5 . . . . . A4 . . . . . F4 . . .", "E5 . . . . . G5 . . . . . E5 . . .", "D5 . . . . . B4 . . . . . G4 . . ."), len: 3, peak: 0.06 },
    lead2: { inst: "ep", bars: bars("E4 . . . . . C4 . . . . . A3 . . .", "C4 . . . . . A3 . . . . . F3 . . .", "E4 . . . . . G4 . . . . . E4 . . .", "D4 . . . . . B3 . . . . . G3 . . ."), len: 3, peak: 0.06 },
  },
  {
    id: "hiphop",
    // trap, at half the tempo
    kick: "x......x..x.....",
    clap: "........x.......",
    hat: "xoxoxoxoxoxxxoxo",
    bass: bassOf("r . . . . . . r . . r . . . . ."),
    bassLen: 5,
    chords: { inst: "ep", prog: SEVENTHS, hits: [[0, 8]], peak: 0.04 },
    lead: { inst: "bell", bars: bars("E5 . . . C5 . . . A4 . . . C5 . E5 .", "F5 . . . E5 . . . C5 . . . A4 . . .", "E5 . . . G5 . . . E5 . . . C5 . . .", "D5 . . . B4 . . . G4 . . . . . . ."), len: 2, peak: 0.06 },
    lead2: { inst: "musicbox", bars: bars("E5 . . . C5 . . . A4 . . . C5 . E5 .", "F5 . . . E5 . . . C5 . . . A4 . . .", "E5 . . . G5 . . . E5 . . . C5 . . .", "D5 . . . B4 . . . G4 . . . . . . ."), len: 2, peak: 0.08 },
  },
  {
    id: "rnb",
    swing: 0.12,
    kick: "x.....x...x.....",
    snare: "........x.......",
    hat: "x.o.x.o.x.o.x.o.",
    perc: [{ key: "snare", hits: "...-.......-...-", peak: 0.1 }],
    bass: bassOf("r . . . . . . . h . . . r . . ."),
    bassLen: 3,
    chords: { inst: "ep", prog: NINTHS, hits: [[0, 6], [10, 4]], peak: 0.05 },
    lead: { inst: "ep", bars: bars("E5 . . . D5 . C5 . . . . . A4 . . .", "C5 . . . A4 . G4 . . . . . A4 . . .", "E5 . . . G5 . E5 . . . . . D5 . C5 .", "D5 . . . B4 . G4 . . . . . . . . ."), len: 2, peak: 0.05 },
    lead2: { inst: "bell", bars: bars("E5 . . . D5 . C5 . . . . . A4 . . .", "C5 . . . A4 . G4 . . . . . A4 . . .", "E5 . . . G5 . E5 . . . . . D5 . C5 .", "D5 . . . B4 . G4 . . . . . . . . ."), len: 2, peak: 0.05 },
  },
  {
    id: "afro",
    kick: "x...x...x...x...",
    clap: "....o.......o...",
    hat: "..o...o...o...o.",
    shaker: "o-o-o-o-o-o-o-o-",
    perc: [
      { key: "tom1.6", hits: "..x..x....x..x..", peak: 0.16 },
      { key: "tom1.3", hits: "x......x.....x..", peak: 0.14 },
      { key: "clave", hits: "...x......x.....", peak: 0.12 },
    ],
    // the log drum
    bass: bassOf("r . . r . . h . . . r . . h . ."),
    bassLen: 2.5,
    chords: { inst: "ep", prog: SEVENTHS, hits: [[6, 2], [14, 2]], peak: 0.045 },
    lead: { inst: "marimba", bars: bars("A4 . C5 . E5 . . G5 . E5 . . C5 . . .", "A4 . C5 . F5 . . A5 . F5 . . C5 . . .", "G4 . C5 . E5 . . G5 . E5 . . C5 . . .", "G4 . B4 . D5 . . G5 . D5 . . B4 . . ."), len: 1, peak: 0.09 },
    lead2: { inst: "steel", bars: bars("A4 . C5 . E5 . . G5 . E5 . . C5 . . .", "A4 . C5 . F5 . . A5 . F5 . . C5 . . .", "G4 . C5 . E5 . . G5 . E5 . . C5 . . .", "G4 . B4 . D5 . . G5 . D5 . . B4 . . ."), len: 1.2, peak: 0.12 },
  },
  {
    id: "kpop",
    kick: "x...x...x...x...",
    clap: "....x.......x...",
    hat: "-o-o-o-o-o-o-o-o",
    ohat: "..o...o...o...o.",
    // octaves, pumping
    bass: bassOf("r . h . r . h . r . h . r . h ."),
    bassLen: 0.9,
    chords: { inst: "brass", prog: TRIADS, hits: [[2, 1], [6, 1], [10, 1], [14, 1]], peak: 0.06 },
    lead: { inst: "lead", bars: bars("A5 . . G5 . . E5 . . . C5 . D5 . E5 .", "C6 . . A5 . . F5 . . . C5 . D5 . E5 .", "G5 . . E5 . . C5 . . . E5 . G5 . A5 .", "G5 . . F5 . . D5 . . . B4 . . . . ."), len: 1, peak: 0.05 },
    lead2: { inst: "pluck", bars: bars("A5 . . G5 . . E5 . . . C5 . D5 . E5 .", "C6 . . A5 . . F5 . . . C5 . D5 . E5 .", "G5 . . E5 . . C5 . . . E5 . G5 . A5 .", "G5 . . F5 . . D5 . . . B4 . . . . ."), len: 1, peak: 0.08 },
  },
  {
    id: "cpop",
    kick: "x...x...x...x...",
    clap: "....x.......x...",
    hat: "..o...o...o...o.",
    shaker: "-.-.-.-.-.-.-.-.",
    bass: bassOf("r . r . r . r . r . r . r . h ."),
    bassLen: 0.9,
    chords: { inst: "ep", prog: SEVENTHS, hits: [[0, 2], [3, 1], [6, 2], [10, 1], [12, 2]], peak: 0.05 },
    // a pentatonic hook (A C D E G)
    lead: { inst: "musicbox", bars: bars("E5 . D5 . C5 . . A4 . C5 . D5 . E5 . .", "G5 . E5 . D5 . . C5 . A4 . C5 . D5 . .", "E5 . G5 . A5 . . G5 . E5 . D5 . C5 . .", "D5 . . C5 . . A4 . . . G4 . A4 . . ."), len: 1.6, peak: 0.09 },
    lead2: { inst: "bell", bars: bars("E5 . D5 . C5 . . A4 . C5 . D5 . E5 . .", "G5 . E5 . D5 . . C5 . A4 . C5 . D5 . .", "E5 . G5 . A5 . . G5 . E5 . D5 . C5 . .", "D5 . . C5 . . A4 . . . G4 . A4 . . ."), len: 1.6, peak: 0.07 },
  },
  {
    id: "bhangra",
    kick: "x...x...x...x...",
    clap: "....x.......x...",
    hat: "..o...o...o...o.",
    // the dhol: its low head and its high one
    perc: [
      { key: "tom0.62", hits: "x..x..x.x..x..x.", peak: 0.3 },
      { key: "tom1.6", hits: "..x..x....x..x..", peak: 0.18 },
    ],
    bass: bassOf("r . . r . . h . r . . r . . h ."),
    bassLen: 1,
    chords: { inst: "pad", prog: TRIADS, hits: [[0, 16]], peak: 0.03 },
    // the tumbi's riff
    lead: { inst: "pluck", bars: bars("A5 . A5 E5 . A5 . . A5 . A5 E5 . G5 . .", "A5 . A5 F5 . A5 . . A5 . A5 F5 . G5 . .", "G5 . G5 E5 . G5 . . G5 . G5 E5 . C6 . .", "G5 . G5 D5 . G5 . . G5 . G5 D5 . B5 . ."), len: 0.8, peak: 0.08 },
    lead2: { inst: "steel", bars: bars("A5 . A5 E5 . A5 . . A5 . A5 E5 . G5 . .", "A5 . A5 F5 . A5 . . A5 . A5 F5 . G5 . .", "G5 . G5 E5 . G5 . . G5 . G5 E5 . C6 . .", "G5 . G5 D5 . G5 . . G5 . G5 D5 . B5 . ."), len: 0.8, peak: 0.1 },
  },
];

const soft = (p?: string) => p?.replace(/x/g, "o");
const light = (p?: string) => p?.replace(/[xo]/g, "-");
const hits = (p?: string) => (p ? v(p) : undefined);
const percOf = (k: Kit, scale = 1, only?: string[]): Perc[] | undefined =>
  k.perc?.filter((p) => !only || only.includes(p.key)).map((p) => ({ key: p.key, hits: v(p.hits), peak: p.peak * scale }));
/** Only the notes on the beat's first and third quarter-bar: the wind-down's melody. */
const sparse = (bs: Notes[]) => bs.map((b) => b.map((n, i) => (i % 8 === 0 ? n : null)));

/** The six sections of the night for a kit (ids `style:warm1` and so on, as house's without the style). */
export function kitSections(k: Kit): Section[] {
  const L = k.level ?? -15;
  const base = { bpm: BPM, swing: k.swing, gain: k.gain ?? 0.9 };
  const drums = { kick: hits(k.kick), snare: hits(k.snare), clap: hits(k.clap), hat: hits(k.hat), ohat: hits(k.ohat), shaker: hits(k.shaker) };
  const held = (peak: number) => ({ inst: "pad" as Inst, prog: k.chords.prog, hits: [[0, 16]] as [number, number][], peak });
  const all: Style = { ...base, ...drums, bass: k.bass, bassLen: k.bassLen, chords: k.chords };
  const id = (s: string) => `${k.id}:${s}`;
  return [
    {
      id: id("warm1"),
      phase: "warm",
      level: L - 4,
      lp: 2600,
      style: { ...base, kick: hits(soft(k.kick)), hat: hits(light(k.hat)), shaker: hits(light(k.shaker)), bass: k.bass, bassLen: k.bassLen, chords: held(0.035) },
    },
    {
      id: id("warm2"),
      phase: "warm",
      level: L - 3,
      lp: 5000,
      perc: percOf(k, 0.7),
      style: { ...all, snare: hits(soft(k.snare)), clap: hits(soft(k.clap)), ohat: hits(light(k.ohat)), chords: { ...k.chords, peak: k.chords.peak * 0.85 } },
    },
    { id: id("build1"), phase: "build", level: L - 1.5, extras: ["roll", "riser"], perc: percOf(k), style: all },
    { id: id("peak1"), phase: "peak", level: L, extras: ["crash", "fill"], perc: percOf(k), style: { ...all, lead: k.lead } },
    { id: id("peak2"), phase: "peak", level: L, extras: ["fill"], perc: percOf(k), style: { ...all, lead: k.lead2 ?? k.lead } },
    {
      id: id("cool1"),
      phase: "cool",
      level: L - 4.5,
      lp: 2400,
      noKick: [0, 1, 2, 3],
      style: {
        ...base,
        kick: hits(soft(k.kick)),
        hat: hits(light(k.hat)),
        shaker: hits(light(k.shaker)),
        bass: ROOTS.map((r) => line(`${r} . . . . . . . . . . . . . . .`)),
        bassLen: 12,
        chords: held(0.04),
        lead: { ...(k.lead2 ?? k.lead), bars: sparse((k.lead2 ?? k.lead).bars), len: 6 },
      },
    },
  ];
}

/** Every style's sections, house's first. */
export const ALL_SECTIONS: Section[] = [...SECTIONS, ...KITS.flatMap(kitSections)];
export const ANY_SECTION: Record<string, Section> = Object.fromEntries(ALL_SECTIONS.map((s) => [s.id, s]));
/** A style's take on one of the night's sections (`warm1` … `cool1`, house's ids). */
export const sectionOf = (style: StyleId, base: string) => (style === "house" ? base : `${style}:${base}`);
