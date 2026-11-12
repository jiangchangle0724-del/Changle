// The practice dances' own tunes: each of the library's six dances has a song of its own, written
// here as notes and played by synth.ts's instruments on the dance's beats (no audio files, nothing
// copied: the tunes are this site's). A tune is a key, a melody in 简谱 (1 = do; ' an octave up, ,
// down; - holds the note an eighth longer, . is an eighth's rest, a/b two sixteenths in one eighth),
// two chords an 8-count (one a bar), a bass line, how the chords are played, and drum patterns for
// three levels: gentle (warm-up and cool-down), teach (the teaching) and full (the dance). The
// melody's phrases go round, one an 8-count; the dance starts at the tune's first phrase.
//
//   广场初体验   D major, 96: a 笛子 tune over a plucked 古筝-like arpeggio, a soft four-on-the-floor
//   坐着也能嗨   F major, 100: a whistled hook, electric piano, a funky bass, hand claps
//   秧歌扭起来   G major, 112: a 唢呐 over a 笙 drone, with the 锣鼓: 大鼓, 镲, 大锣 and 小锣
//   流行踏步派对 A minor, 120: disco house: a synth hook, piano chords, an octave bass, open hats
//   广场摇摆串烧 E minor, 132: big 广场舞 dance-pop, a wide synth lead, driving drums
//   全身节拍挑战 F minor, 128: EDM: a sixteenth-note arpeggio, a pumping sub bass, risers
import type { RunBeat } from "../shared/show";

/**
 * A pitched voice: oscillators stacked (each its wave, pitch multiple and detune in cents) through a
 * filter (its cutoff opening on the attack by `sweep` Hz, back over `sweepS`), an envelope, a
 * vibrato that comes in after a moment, a scoop up into the note, and its sends to the reverb and
 * the echo.
 */
export interface Voice {
  osc: { type: "sine" | "square" | "sawtooth" | "triangle"; mul?: number; cents?: number; level?: number }[];
  filter?: { type: "lowpass" | "highpass" | "bandpass"; hz: number; q?: number; sweep?: number; sweepS?: number };
  attack: number;
  /** seconds to fall to `sustain` (0 to 1) after the attack, and the release after the note */
  decay: number;
  sustain: number;
  release: number;
  vibrato?: { hz: number; cents: number; after: number };
  /** cents below the note it starts at, and how long it takes to get there */
  scoop?: { cents: number; seconds: number };
  rev?: number;
  echo?: number;
}

/** What a tune plays on: synth.ts's Synth (kept apart so the tunes read without a browser, for the tests). */
interface Synth {
  note(t: number, hz: number, seconds: number, v: Voice, level: number): void;
  kick2(t: number, level: number): void;
  snare(t: number, level: number): void;
  clap2(t: number, level: number): void;
  hat(t: number, level: number): void;
  openHat(t: number, level: number): void;
  shaker(t: number, level: number): void;
  tom(t: number, hz: number, level: number): void;
  block(t: number, hz: number, level: number): void;
  bigDrum(t: number, level: number): void;
  cymbal(t: number, level: number, seconds: number): void;
  gong(t: number, hz: number, level: number, seconds: number, slide?: number): void;
  riser(t: number, seconds: number, level: number): void;
  chime(t: number, hz: number, level: number): void;
}

/** Chords as 简谱 degrees: "1" major, "6m" minor, "5_7" dominant 7th, "1M7" major 7th, "2m7" minor 7th, "1p" root and fifth. */
type Chord = string;

interface Phrase {
  /** the chord of each bar (4 beats) of the 8-count */
  chords: [Chord, Chord];
  /** 16 eighths */
  melody: string;
}

type Drum = "kick" | "snare" | "clap" | "hat" | "open" | "shaker" | "tom" | "block" | "drum" | "cymbal" | "gong" | "smallGong";
/** An 8-count of drums: 32 sixteenths, or 16 eighths ("x" a hit, "o" a soft one, "." none; spaces ignored). */
type Kit = Partial<Record<Drum, string>>;

type Comp = { kind: "pad" } | { kind: "stab"; steps: number[]; seconds: number } | { kind: "arp"; every: 1 | 2; shape: number[] };

export interface Tune {
  /** the library routine it's for */
  id: string;
  /** the MIDI note of 简谱's 1 */
  key: number;
  lead: Voice;
  leadLevel: number;
  /** octaves the melody sits above the key */
  leadOct: number;
  bass: Voice | null;
  bassLevel: number;
  /** a bar's bass: 16 sixteenths: R root, O octave up, F fifth, - hold, . rest */
  bassLine: string;
  comp: Voice;
  compLevel: number;
  compStyle: Comp;
  kits: { gentle: Kit; teach: Kit; full: Kit; fill?: Kit };
  phrases: Phrase[];
  /** a crash cymbal at the start of every 4th phrase of the dance */
  crash?: boolean;
  /** a rush of noise into every 4th phrase of the dance */
  riser?: boolean;
}

// ---------- the instruments' voices

const DIZI: Voice = { osc: [{ type: "triangle" }, { type: "sine", mul: 2, level: 0.25 }], filter: { type: "lowpass", hz: 4500 }, attack: 0.025, decay: 0.2, sustain: 0.75, release: 0.12, vibrato: { hz: 5.5, cents: 18, after: 0.12 }, scoop: { cents: 40, seconds: 0.05 }, rev: 0.35, echo: 0.18 };
const ZHENG: Voice = { osc: [{ type: "sawtooth" }, { type: "square", cents: 7, level: 0.3 }], filter: { type: "lowpass", hz: 900, q: 2, sweep: 2600, sweepS: 0.12 }, attack: 0.003, decay: 0.35, sustain: 0.001, release: 0.15, rev: 0.3 };
const ROUND_BASS: Voice = { osc: [{ type: "sine" }, { type: "triangle", level: 0.5 }], filter: { type: "lowpass", hz: 600 }, attack: 0.008, decay: 0.2, sustain: 0.7, release: 0.08 };
const WHISTLE: Voice = { osc: [{ type: "sine" }, { type: "sine", mul: 2, level: 0.08 }], attack: 0.03, decay: 0.1, sustain: 0.85, release: 0.1, vibrato: { hz: 6, cents: 22, after: 0.08 }, scoop: { cents: 60, seconds: 0.06 }, rev: 0.3, echo: 0.25 };
const E_PIANO: Voice = { osc: [{ type: "sine" }, { type: "sine", mul: 4, level: 0.12 }, { type: "triangle", cents: 5, level: 0.3 }], attack: 0.005, decay: 0.6, sustain: 0.25, release: 0.25, rev: 0.25 };
const FUNK_BASS: Voice = { osc: [{ type: "sawtooth" }, { type: "square", mul: 0.5, level: 0.4 }], filter: { type: "lowpass", hz: 500, sweep: 900, sweepS: 0.08 }, attack: 0.004, decay: 0.25, sustain: 0.4, release: 0.06 };
const SUONA: Voice = { osc: [{ type: "sawtooth", level: 0.7 }, { type: "square", cents: 6, level: 0.35 }], filter: { type: "lowpass", hz: 3000, q: 4 }, attack: 0.012, decay: 0.15, sustain: 0.8, release: 0.06, vibrato: { hz: 6.5, cents: 30, after: 0.09 }, scoop: { cents: 80, seconds: 0.045 }, rev: 0.2, echo: 0.08 };
const SHENG: Voice = { osc: [{ type: "square", level: 0.5 }, { type: "sawtooth", cents: -6, level: 0.3 }], filter: { type: "lowpass", hz: 1400 }, attack: 0.15, decay: 0.3, sustain: 0.8, release: 0.3, rev: 0.3 };
const SYNTH_LEAD: Voice = { osc: [{ type: "square", level: 0.5 }, { type: "sawtooth", cents: 8, level: 0.5 }], filter: { type: "lowpass", hz: 2600, q: 1.5, sweep: 1500, sweepS: 0.1 }, attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.08, vibrato: { hz: 5, cents: 12, after: 0.2 }, rev: 0.25, echo: 0.3 };
const PIANO: Voice = { osc: [{ type: "triangle" }, { type: "sine", mul: 2, level: 0.4 }, { type: "square", level: 0.08 }], filter: { type: "lowpass", hz: 3500 }, attack: 0.003, decay: 0.3, sustain: 0.15, release: 0.15, rev: 0.2 };
const DISCO_BASS: Voice = { osc: [{ type: "sawtooth" }], filter: { type: "lowpass", hz: 700, sweep: 600, sweepS: 0.05 }, attack: 0.003, decay: 0.12, sustain: 0.6, release: 0.04 };
const SUPERSAW: Voice = { osc: [{ type: "sawtooth", cents: -12, level: 0.4 }, { type: "sawtooth", level: 0.4 }, { type: "sawtooth", cents: 12, level: 0.4 }], filter: { type: "lowpass", hz: 3200 }, attack: 0.008, decay: 0.2, sustain: 0.7, release: 0.1, vibrato: { hz: 5.5, cents: 10, after: 0.25 }, rev: 0.3, echo: 0.2 };
const PLUCK: Voice = { osc: [{ type: "sawtooth" }, { type: "square", cents: -5, level: 0.4 }], filter: { type: "lowpass", hz: 1200, q: 3, sweep: 3500, sweepS: 0.09 }, attack: 0.003, decay: 0.22, sustain: 0.001, release: 0.1, rev: 0.25, echo: 0.2 };
const PUNCH_BASS: Voice = { osc: [{ type: "sawtooth" }, { type: "sine", level: 0.6 }], filter: { type: "lowpass", hz: 450, sweep: 700, sweepS: 0.06 }, attack: 0.004, decay: 0.15, sustain: 0.5, release: 0.05 };
const SAW_LEAD: Voice = { osc: [{ type: "sawtooth", cents: -8, level: 0.5 }, { type: "sawtooth", cents: 8, level: 0.5 }], filter: { type: "lowpass", hz: 2400, q: 2, sweep: 2500, sweepS: 0.12 }, attack: 0.005, decay: 0.2, sustain: 0.55, release: 0.1, rev: 0.3, echo: 0.3 };
const SUB: Voice = { osc: [{ type: "sine" }, { type: "triangle", mul: 2, level: 0.15 }], attack: 0.07, decay: 0.1, sustain: 0.9, release: 0.05 };

/** Every beat's four sixteenths, the same pattern each beat: written once, for all eight. */
const each = (beat: string) => beat.repeat(8);

export const TUNES: readonly Tune[] = [
  {
    id: "square-easy",
    key: 62,
    lead: DIZI,
    leadLevel: 0.22,
    leadOct: 1,
    bass: ROUND_BASS,
    bassLevel: 0.11,
    bassLine: "R---R---F---R---",
    comp: ZHENG,
    compLevel: 0.24,
    compStyle: { kind: "arp", every: 2, shape: [0, 1, 2, 3, 4, 3, 2, 1] },
    kits: {
      gentle: { kick: "o... .... .... .... o... .... .... ....", shaker: each("..o.") },
      teach: { kick: each("o..."), clap: ".... o... .... o... .... o... .... o...", shaker: each("..o.") },
      full: { kick: each("x..."), clap: ".... x... .... x... .... x... .... x...", shaker: each("..o.") },
      fill: { tom: ".... .... .... .... .... .... x.x. x.x." },
    },
    phrases: [
      { chords: ["1", "6m"], melody: "3 5 6 5 3 - 2 1 6, 1 2 3 1 - - ." },
      { chords: ["4", "5"], melody: "6 1' 6 5 6 - 5 3 2 3 5 2 5 - - ." },
      { chords: ["1", "6m"], melody: "3 5 6 1' 6 5 3 5 6 - 5 3 2 3 1 ." },
      { chords: ["4", "5"], melody: "1' 6 5 6 1' - 2' 1' 6 5 3 2 3 - - ." },
      { chords: ["4", "5"], melody: "6 6 5 6 1' - 6 5 3 3 2 3 5 - - ." },
      { chords: ["3m", "6m"], melody: "3 3 2 3 5 - 3 2 1 2 3 5 6 - - ." },
      { chords: ["2m", "5"], melody: "6 5 6 1' 2' 1' 6 5 2 - 3 5 2 - - ." },
      { chords: ["1", "1"], melody: "3 5 6 5 3 2 1 2 1 - - - - - . ." },
    ],
  },
  {
    id: "pop-easy",
    key: 65,
    lead: WHISTLE,
    leadLevel: 0.22,
    leadOct: 1,
    bass: FUNK_BASS,
    bassLevel: 0.26,
    bassLine: "R.....O.R..F..O.",
    comp: E_PIANO,
    compLevel: 0.068,
    compStyle: { kind: "stab", steps: [4, 7, 12], seconds: 0.22 },
    kits: {
      gentle: { kick: "o... .... .... .... o... .... .... ....", hat: each("..o.") },
      teach: { kick: "o....... o....... o....... o.......", clap: ".... o... .... o... .... o... .... o...", hat: each("..o.") },
      full: { kick: "x.....x.x....... x.....x.x.......", clap: ".... x... .... x... .... x... .... x...", hat: each("o.x."), shaker: each(".o.o") },
      fill: { snare: ".... .... .... .... .... .... x.x. x.xx" },
    },
    phrases: [
      { chords: ["1M7", "6m7"], melody: "5 . 3 5 6 5 3 . 1 . 1 2 3 . . ." },
      { chords: ["2m7", "5_7"], melody: "4 . 4 5 6 5 4 . 2 . 2 3 2 . 7, ." },
      { chords: ["1M7", "6m7"], melody: "5 . 3 5 6 . 1' . 7 . 6 5 6 . . ." },
      { chords: ["2m7", "5_7"], melody: "4 . 6 1' 7 6 5 . 4 3 2 3 5 . . ." },
    ],
  },
  {
    id: "square-medium",
    key: 67,
    lead: SUONA,
    leadLevel: 0.27,
    leadOct: 0,
    bass: null,
    bassLevel: 0,
    bassLine: "................",
    comp: SHENG,
    compLevel: 0.08,
    compStyle: { kind: "pad" },
    kits: {
      // 锣鼓经: 咚咚锵 咚咚锵 咚锵咚锵 咚咚咚锵 (咚 the big drum; 锵 cymbals, the big gong on the strong ones; 台 the small gong)
      gentle: { drum: "x.......x.......", smallGong: "....o.......o...", block: "..o...o...o...o." },
      teach: { drum: "x.x.x.x.x.x.x.x.", cymbal: "..x...x...x...x." },
      full: { drum: "xx..xx..x.x.xxx.", cymbal: "..x...x..x.x...x", gong: "..x...x.........", smallGong: "...o...o........" },
      fill: { drum: ".... .... .... .... .... .... xxxx xxx.", cymbal: ".... .... .... .... .... .... .... ...x" },
    },
    phrases: [
      { chords: ["1p", "1p"], melody: "5 6/5 3 5 6 1' 6 5 3 5 2 3 5 - 5 ." },
      { chords: ["5p", "1p"], melody: "6 1' 6 5 3 5 6 . 2' 1' 6 5 6 - 6 ." },
      { chords: ["1p", "5p"], melody: "1' 2'/1' 6 1' 5 6 3 5 2 3 5 6 3 2 1 ." },
      { chords: ["5p", "1p"], melody: "2 2/3 5 3 2 1 6, 1 2 - 3 5 1 - 1 ." },
    ],
  },
  {
    id: "pop-medium",
    key: 60,
    lead: SYNTH_LEAD,
    leadLevel: 0.32,
    leadOct: 0,
    bass: DISCO_BASS,
    bassLevel: 0.28,
    bassLine: "R.O.R.O.R.O.R.O.",
    comp: PIANO,
    compLevel: 0.12,
    compStyle: { kind: "stab", steps: [2, 6, 10, 14], seconds: 0.18 },
    kits: {
      gentle: { kick: "o... .... .... .... o... .... .... ....", hat: each("..o.") },
      teach: { kick: each("o..."), clap: ".... o... .... o... .... o... .... o...", hat: each("..o.") },
      full: { kick: each("x..."), clap: ".... x... .... x... .... x... .... x...", open: each("..x."), hat: each("o.o.") },
      fill: { clap: ".... .... .... .... .... .... x.x. x.xx" },
    },
    crash: true,
    phrases: [
      { chords: ["6m", "4"], melody: "6 . 1' . 2' 1' 6 . 3' . 2' 1' 2' . . ." },
      { chords: ["1", "5"], melody: "1' . 2' . 3' 2' 1' . 2' . 1' 6 5 . . ." },
      { chords: ["6m", "4"], melody: "6 . 1' . 2' 1' 6 . 5' . 3' 2' 3' . . ." },
      { chords: ["1", "5"], melody: "1' . 3' . 2' 1' 2' . 6 . . . 5 . 6 ." },
    ],
  },
  {
    id: "square-hard",
    key: 67,
    lead: SUPERSAW,
    leadLevel: 0.40,
    leadOct: 0,
    bass: PUNCH_BASS,
    bassLevel: 0.165,
    bassLine: "R.R.R.R.R.R.R.R.",
    comp: PLUCK,
    compLevel: 0.2,
    compStyle: { kind: "stab", steps: [2, 6, 10, 14], seconds: 0.12 },
    kits: {
      gentle: { kick: "o... .... .... .... o... .... .... ....", hat: each("..o.") },
      teach: { kick: each("o..."), snare: ".... o... .... o... .... o... .... o...", hat: each("..o.") },
      full: { kick: each("x..."), snare: ".... x... .... x... .... x... .... x...", clap: ".... o... .... o... .... o... .... o...", hat: each("o.x."), shaker: each(".o.o") },
      fill: { snare: ".... .... .... .... .... .... x.x. xxxx" },
    },
    crash: true,
    phrases: [
      { chords: ["6m", "4"], melody: "6 6 5 6 1' . 6 5 3 . 5 3 2 . . ." },
      { chords: ["5", "3m"], melody: "2 2 1 2 3 . 5 3 2 . 1 6, 3 . . ." },
      { chords: ["6m", "4"], melody: "6 6 5 6 1' . 2' 1' 6 . 5 6 3 . . ." },
      { chords: ["5", "3m"], melody: "2 3 5 6 5 3 2 1 6, . . . 6, . 3 ." },
      { chords: ["4", "5"], melody: "1' 1' 6 1' 2' . 1' 6 5 . 6 5 3 . . ." },
      { chords: ["3m", "6m"], melody: "3 5 6 5 3 2 1 2 3 . . . 6 . . ." },
      { chords: ["4", "5"], melody: "1' 2' 3' 2' 1' 6 5 6 2' . 1' 6 5 . . ." },
      { chords: ["6m", "6m"], melody: "6 5 3 5 6 1' 2' 3' 6' . . . . . . ." },
    ],
  },
  {
    id: "pop-hard",
    key: 68,
    lead: SAW_LEAD,
    leadLevel: 0.40,
    leadOct: 0,
    bass: SUB,
    bassLevel: 0.19,
    bassLine: "R---R---R---R---",
    comp: PLUCK,
    compLevel: 0.17,
    compStyle: { kind: "arp", every: 1, shape: [0, 1, 2, 3, 4, 3, 2, 1] },
    kits: {
      gentle: { kick: "o... .... .... .... o... .... .... ....", hat: each("..o.") },
      teach: { kick: each("x..."), clap: ".... o... .... o... .... o... .... o...", hat: each("..o.") },
      full: { kick: each("x..."), clap: ".... x... .... x... .... x... .... x...", snare: ".... o... .... o... .... o... .... o...", open: each("..x."), hat: each("o.o.") },
      fill: { snare: ".... .... .... .... .... .... xxxx xxxx" },
    },
    crash: true,
    riser: true,
    phrases: [
      { chords: ["6m", "4"], melody: "6 . 6 1' . 6 1' 2' 3' . 2' 1' . 6 . ." },
      { chords: ["1", "5"], melody: "1' . 1' 2' . 1' 2' 3' 5' . 3' 2' . 1' . ." },
      { chords: ["6m", "4"], melody: "6 . 6 1' . 6 1' 2' 3' . 5' 6' . 5' 3' ." },
      { chords: ["1", "5"], melody: "1' . 2' 3' . 5' 3' 2' 1' . . . 6 . . ." },
    ],
  },
];

const byId = new Map(TUNES.map((t) => [t.id, t]));
/** A library dance's tune, or null (the plain groove). */
export const tuneFor = (routineId: string | null | undefined): Tune | null => (routineId ? (byId.get(routineId) ?? null) : null);

// ---------- reading the notes

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Note {
  /** sixteenths from the 8-count's start */
  step: number;
  /** semitones from the key */
  semis: number;
  /** 简谱 degree (0 to 6) and octave, for the harmony a third under */
  deg: number;
  oct: number;
  /** sixteenths */
  len: number;
}

/** A 简谱 note: "#4", "6,", "1'": its degree, octave and semitones from the key; null for anything else. */
function readNote(tok: string): Omit<Note, "step" | "len"> | null {
  const m = /^([#b]?)([1-7])([',]*)$/.exec(tok);
  if (!m) return null;
  const deg = Number(m[2]) - 1;
  const oct = [...m[3]!].reduce((n, c) => n + (c === "'" ? 1 : -1), 0);
  const acc = m[1] === "#" ? 1 : m[1] === "b" ? -1 : 0;
  return { deg, oct, semis: SCALE[deg]! + 12 * oct + acc };
}

const melodies = new Map<string, Note[]>();
/** A phrase's 16 eighths as notes (kept: read once). */
export function readMelody(src: string): Note[] {
  const known = melodies.get(src);
  if (known) return known;
  const notes: Note[] = [];
  let last: Note | null = null;
  const put = (tok: string, step: number, len: number) => {
    if (tok === "-") {
      if (last) last.len += len;
      return;
    }
    if (tok === ".") {
      last = null;
      return;
    }
    const n = readNote(tok);
    if (!n) throw new Error(`not a note: ${tok}`);
    last = { ...n, step, len };
    notes.push(last);
  };
  src
    .trim()
    .split(/\s+/)
    .forEach((tok, i) => {
      if (tok.includes("/")) tok.split("/").forEach((part, k) => put(part, i * 2 + k, 1));
      else put(tok, i * 2, 2);
    });
  melodies.set(src, notes);
  return notes;
}

/** How many eighths a phrase's melody is (the tests: every phrase 16). */
export const melodyEighths = (src: string) => src.trim().split(/\s+/).length;

/** A chord's notes, in semitones from the key (its root within the octave above the key). */
export function chordNotes(c: Chord): number[] {
  const m = /^([1-7])(m7|M7|_7|m|p)?$/.exec(c);
  if (!m) throw new Error(`not a chord: ${c}`);
  const root = SCALE[Number(m[1]) - 1]!;
  const shape = { "": [0, 4, 7], m: [0, 3, 7], _7: [0, 4, 7, 10], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], p: [0, 7, 12] }[m[2] ?? ""]!;
  return shape.map((x) => root + x);
}

/** A kit line's hit at sixteenth `k` of the 8-count: 1, a soft one 0.5, or 0. */
function hitAt(line: string | undefined, k: number): number {
  if (!line) return 0;
  const l = line.replace(/\s+/g, "");
  const c = l.length === 16 ? (k % 2 === 0 ? l[k / 2] : ".") : l[k];
  return c === "x" ? 1 : c === "o" ? 0.5 : 0;
}

function drum(s: Synth, d: Drum, t: number, v: number, k: number): void {
  switch (d) {
    case "kick":
      return s.kick2(t, 0.75 * v);
    case "snare":
      return s.snare(t, 0.4 * v);
    case "clap":
      return s.clap2(t, 0.35 * v);
    case "hat":
      return s.hat(t, 0.13 * v);
    case "open":
      return s.openHat(t, 0.09 * v);
    case "shaker":
      return s.shaker(t, 0.12 * v);
    case "tom":
      // (a fill's toms come down the kit)
      return s.tom(t, 210 - 12 * (k % 8), 0.4 * v);
    case "block":
      return s.block(t, 1150, 0.3 * v);
    case "drum":
      return s.bigDrum(t, 0.6 * v);
    case "cymbal":
      return s.cymbal(t, 0.22 * v, 0.2);
    case "gong":
      return s.gong(t, 170, 0.2 * v, 1.2, 0.97);
    case "smallGong":
      return s.gong(t, 640, 0.13 * v, 0.35, 1.15);
  }
}

type Level = "gentle" | "teach" | "full";
const levelOf = (b: RunBeat): Level => (b.stage === "dance" ? "full" : b.stage === "watch" || b.stage === "follow" ? "teach" : "gentle");

/**
 * One beat of a tune: its drums, its bass, its chords and the melody notes that start on it, at the
 * beat's level; a bell where a new move or stage starts (and in the teaching, where it's your turn).
 * The dance's 8-counts start at the tune's first phrase; the warm-up, teaching and cool-down go by
 * the 8-counts played so far (`phrase`).
 */
export function playTuneBeat(s: Synth, tune: Tune, b: RunBeat, prev: RunBeat | null, phrase: number): void {
  const level = levelOf(b);
  const beat = b.count - 1;
  const step = b.ms / 4;
  const ph = b.danceBeat !== null ? Math.floor(b.danceBeat / 8) : phrase;
  const p = tune.phrases[((ph % tune.phrases.length) + tune.phrases.length) % tune.phrases.length]!;
  const bar = beat < 4 ? 0 : 1;
  const chord = chordNotes(p.chords[bar]!);
  const lift = level === "full" ? 1 : level === "teach" ? 0.8 : 0.6;
  // drums (the full dance: a fill at the end of every 4th phrase, a crash at the start of the next, a riser into it)
  const fill = level === "full" && ph % 4 === 3 && beat >= 6 && tune.kits.fill;
  const kit = tune.kits[level];
  for (let k = 0; k < 4; k++) {
    const at = b.t + k * step;
    const i = beat * 4 + k;
    for (const d of Object.keys(kit) as Drum[]) {
      if (fill && fill[d] !== undefined) continue;
      const v = hitAt(kit[d], i);
      if (v) drum(s, d, at, v, i);
    }
    if (fill) for (const d of Object.keys(fill) as Drum[]) {
      const v = hitAt(fill[d], i);
      if (v) drum(s, d, at, v, i);
    }
  }
  if (level === "full" && tune.crash && ph % 4 === 0 && beat === 0 && ph > 0) s.cymbal(b.t, 0.2, 1.2);
  if (level === "full" && tune.riser && ph % 4 === 3 && beat === 4) s.riser(b.t, (b.ms * 4) / 1000, 0.12);
  // bass: the bar's line (gentle: the root held through the bar)
  if (tune.bass) {
    const root = tune.key - 24 + chord[0]!;
    if (level === "gentle") {
      if (beat % 4 === 0) s.note(b.t, midiHz(root), (b.ms * 3.8) / 1000, tune.bass, tune.bassLevel * 0.7);
    } else {
      const line = tune.bassLine;
      for (let k = 0; k < 4; k++) {
        const i = (beat % 4) * 4 + k;
        const c = line[i];
        if (!c || c === "-" || c === ".") continue;
        let len = 1;
        while (line[i + len] === "-") len++;
        const semis = c === "O" ? 12 : c === "F" ? 7 : 0;
        s.note(b.t + k * step, midiHz(root + semis), (len * step * 0.9) / 1000, tune.bass, tune.bassLevel * lift);
      }
    }
  }
  // the chords
  const mid = tune.key - 12;
  const cs = tune.compStyle;
  const cl = tune.compLevel * lift;
  if (cs.kind === "pad") {
    if (beat % 4 === 0) for (const n of chord) s.note(b.t, midiHz(mid + n), (b.ms * 3.9) / 1000, tune.comp, cl);
  } else if (cs.kind === "stab") {
    for (let k = 0; k < 4; k++) {
      const i = (beat % 4) * 4 + k;
      if (!cs.steps.includes(i) || (level === "gentle" && k !== 0 && i % 4 !== 0)) continue;
      for (const n of chord) s.note(b.t + k * step, midiHz(mid + n), cs.seconds, tune.comp, cl);
    }
  } else {
    // an arpeggio up and down the chord (and the octave over it)
    const tones = [...chord.slice(0, 3), ...chord.slice(0, 3).map((n) => n + 12)];
    const every = level === "gentle" ? 2 * cs.every : cs.every;
    for (let k = 0; k < 4; k += every) {
      const i = Math.floor(((beat % 4) * 4 + k) / cs.every);
      const n = tones[cs.shape[i % cs.shape.length]! % tones.length]!;
      s.note(b.t + k * step, midiHz(mid + n), (step * every * 1.6) / 1000, tune.comp, cl);
    }
  }
  // the melody: notes starting on this beat (the teaching and the warm-up softer); every other
  // round of the tune in the dance, a harmony a third under it
  const melodyLevel = tune.leadLevel * (level === "full" ? 1 : level === "teach" ? 0.55 : 0.45);
  const harmony = level === "full" && Math.floor(ph / tune.phrases.length) % 2 === 1;
  for (const n of readMelody(p.melody)) {
    if (n.step < beat * 4 || n.step >= beat * 4 + 4) continue;
    const at = b.t + (n.step - beat * 4) * step;
    const seconds = (n.len * step * 0.92) / 1000;
    const base = tune.key + 12 * tune.leadOct;
    s.note(at, midiHz(base + n.semis), seconds, tune.lead, melodyLevel);
    if (harmony) {
      const d = n.deg - 2;
      const under = SCALE[(d + 7) % 7]! + 12 * (n.oct + (d < 0 ? -1 : 0));
      s.note(at, midiHz(base + under), seconds, tune.lead, melodyLevel * 0.45);
    }
  }
  // the bells: a new move or stage, and in the teaching your turn (in the tune's key)
  const fresh = !prev || prev.stage !== b.stage || prev.move?.id !== b.move?.id;
  if (level === "teach" && b.count === 1) s.chime(b.t, midiHz(tune.key + (b.stage === "follow" ? 24 : 19)), 0.2);
  else if (fresh && b.count === 1) s.chime(b.t, midiHz(tune.key + 19), 0.16);
}
