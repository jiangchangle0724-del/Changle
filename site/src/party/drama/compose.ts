/**
 * 戏精大赏's music, written here and played by the party's own synth voices (lib/audio/engine.ts):
 * nothing is downloaded and nothing needs a licence.
 *
 * The game has one theme for everything off stage (choosing, reading the cards, voting, the reveal,
 * the curtain call): a sly little tango in D minor, written out note by note below. On stage the
 * theme stops and each scene plays a piece of its own, composed here from the scene's mood
 * (data/dramaMusic.ts) and seeded by the scene's id: the same scene always plays the same piece,
 * and no two scenes play the same one.
 *
 * Every piece has the shape of a song: four phrases of four bars, A A' B A'' (a tune, the tune again
 * coming home, something new, the tune once more), played twice, the second time with the tune
 * resting for the first half so the actors have the room to themselves. A piece is just a list of
 * bars, each a list of hits on sixteenth-note steps; score.ts plays it.
 */
import type { Inst } from "../../lib/audio/engine";
import { CLASSIC_MOOD, READ_MOOD, sceneMood, type Mood } from "../../data/dramaMusic";
import type { DramaView } from "../../shared/protocol";

export type Drum = "kick" | "heart" | "snare" | "rim" | "brush" | "clap" | "hat" | "ohat" | "shaker" | "tom" | "clave" | "crash" | "gong" | "timp";

export type Hit = {
  /** the step in the bar it falls on */
  s: number;
  /** what plays it */
  i: Inst | Drum;
  /** the note (midi): an instrument's, a tom's, a timpani's */
  m?: number;
  /** how long it's held, in steps */
  d?: number;
  /** how hard, 0 to 1 */
  v: number;
  /** a little after its step, in steps: a strummed string, a grace note */
  t?: number;
};

export type Piece = {
  bpm: number;
  /** how far the off-beat eighths lean back: 0 is straight, 1/3 a triplet swing */
  swing: number;
  /** sixteenths in a bar: 16 for four beats, 12 for a waltz */
  steps: number;
  /** how loud, before the screen's own volume */
  gain: number;
  bars: Hit[][];
};

/* ------------------------------------------------------------------ notes and chords */

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const acc = (x: string) => (x === "#" ? 1 : x === "b" ? -1 : 0);

/** "C#5" to a midi note. */
export function midiOf(name: string): number {
  const x = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!x) throw new Error(`not a note: ${name}`);
  return 12 * (Number(x[3]) + 1) + PC[x[1]] + acc(x[2]);
}

/** A line of a tune, one token a step: a note starts, "-" holds it, "." is silence. */
function tune(line: string, i: Inst, v: number): Hit[] {
  const out: Hit[] = [];
  let cur: Hit | null = null;
  line
    .trim()
    .split(/\s+/)
    .forEach((tok, s) => {
      if (tok === "-") {
        if (cur) cur.d = (cur.d ?? 1) + 1;
        return;
      }
      cur = null;
      if (tok === ".") return;
      cur = { s, i, m: midiOf(tok), d: 1, v: s % 4 === 0 ? v : v * 0.85 };
      out.push(cur);
    });
  return out;
}

/** A chord: its root (semitones above the key) and its notes (semitones above the root). */
type Ch = { root: number; tones: number[] };

const QUALITY: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], m6: [0, 3, 7, 9] };

/** A chord by name ("Dm", "A7", "Bb"), its root a pitch class. */
function named(name: string): Ch {
  const x = /^([A-G])([#b]?)(.*)$/.exec(name);
  if (!x || !QUALITY[x[3]]) throw new Error(`not a chord: ${name}`);
  return { root: (PC[x[1]] + acc(x[2]) + 12) % 12, tones: QUALITY[x[3]] };
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * A chord by its place in the key: the numeral's case gives major or minor, the scale gives its
 * root (so "VI" in a minor key is the flat sixth); "b" lowers it, "°" diminishes it, "ø7" is
 * half-diminished, "7" adds the seventh, "maj7" the major seventh.
 */
function roman(tok: string, scale: readonly number[]): Ch {
  const x = /^(b|#)?([IViv]+)(°|ø|\+)?(maj7|7|6|sus4|sus2|add9)?$/.exec(tok);
  const deg = x ? ROMAN.indexOf(x[2].toUpperCase()) : -1;
  if (!x || deg < 0) throw new Error(`not a chord: ${tok}`);
  const minor = x[2] === x[2].toLowerCase();
  let tones = x[3] === "°" ? [0, 3, 6] : x[3] === "ø" ? [0, 3, 6, 10] : x[3] === "+" ? [0, 4, 8] : minor ? [0, 3, 7] : [0, 4, 7];
  if (x[4] === "7" && x[3] !== "ø") tones = [...tones, x[3] === "°" ? 9 : 10];
  else if (x[4] === "maj7") tones = [...tones, 11];
  else if (x[4] === "6") tones = [...tones, 9];
  else if (x[4] === "add9") tones = [...tones, 14];
  else if (x[4] === "sus4") tones = [0, 5, 7];
  else if (x[4] === "sus2") tones = [0, 2, 7];
  return { root: (scale[deg] + (x[1] === "b" ? -1 : x[1] === "#" ? 1 : 0) + 12) % 12, tones };
}

/** The pitch classes of a chord in a key. */
const pcsOf = (ch: Ch, key: number) => [...new Set(ch.tones.map((t) => (key + ch.root + t) % 12))];

/** The lowest note at or above `lo` with this pitch class. */
const atOrAbove = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);

/**
 * The chord's notes stacked up from `lo`, in whichever inversion moves least from the last chord:
 * the voices glide from chord to chord instead of jumping.
 */
function voicing(pcs: number[], prev: number[] | null, lo: number): number[] {
  const all: number[][] = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
    for (const base of [atOrAbove(order[0], lo), atOrAbove(order[0], lo) + 12]) {
      const notes = [base];
      for (const pc of order.slice(1)) notes.push(atOrAbove(pc, notes[notes.length - 1] + 1));
      all.push(notes);
    }
  }
  // kept low enough to sit under the tune
  const fit = all.filter((n) => n[n.length - 1] <= lo + 19);
  const cost = (notes: number[]) =>
    prev && prev.length === notes.length ? notes.reduce((sum, m, i) => sum + Math.abs(m - prev[i]), 0) : Math.abs(notes.reduce((a, m) => a + m, 0) / notes.length - (lo + 7)) * 3;
  return (fit.length ? fit : all).reduce((best, n) => (cost(n) < cost(best) ? n : best));
}

/* ------------------------------------------------------------------ random, from a seed */

type Rand = () => number;

/** A string to a seed: the same scene gives the same seed on every phone. */
export function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number): Rand {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <X>(r: Rand, xs: readonly X[]): X => xs[Math.floor(r() * xs.length)];

/* ------------------------------------------------------------------ the theme */

/** The theme's sixteen bars: D minor, a turn to F major in the middle, home by way of A7. */
const THEME_CHORDS = ["Dm", "Dm", "Gm", "A7", "Dm", "Bb", "Gm6", "A7", "F", "C", "Dm", "A", "Bb", "Gm", "A7", "Dm"];

/** The tune, one line a bar: a tango's long-short-short, and a "chan-chan" to end on. */
const THEME_TUNE = [
  "A4 - - D5 F5 - E5 - D5 - - - A4 - - -",
  "D5 - - . F5 - E5 - D5 - C#5 - D5 - - -",
  "Bb4 - - D5 G5 - F5 - D5 - - - Bb4 - - -",
  "C#5 - - E5 A5 - G5 - F5 - E5 - . . . .",
  "A4 - - D5 F5 - E5 - D5 - - - A4 - - -",
  "D5 - - F5 Bb5 - A5 - F5 - - - D5 - - -",
  "D5 - - G5 Bb5 - A5 - G5 - F5 - E5 - - -",
  "C#5 - - E5 A5 - - - G5 - - - . . . .",
  "C5 - - F5 A5 - G5 - F5 - - - C5 - - -",
  "E5 - - G5 C6 - Bb5 - A5 - G5 - E5 - - -",
  "F5 - - A5 D6 - C6 - A5 - - - F5 - - -",
  "C#6 - - . A5 - - . E5 - - . C#5 - - -",
  "F5 - - D5 Bb4 - D5 - F5 - Bb5 - A5 - - -",
  "G5 - - Bb5 D6 - C6 - Bb5 - A5 - G5 - - -",
  "E5 - - G5 C#6 - Bb5 - A5 - G5 - F5 - E5 -",
  "D5 - - - - - - - . . . . A4 . D5 .",
];

function theme(): Piece {
  const bars: Hit[][] = [];
  let prev: number[] | null = null;
  const bass: Hit[][] = [];
  const comp: Hit[][] = [];
  THEME_CHORDS.forEach((name, b) => {
    const ch = named(name);
    const root = atOrAbove(ch.root, 38);
    const fifth = root + 7;
    const last = b === THEME_CHORDS.length - 1;
    // the habanera: dum . . da dum . dum ., twice a bar
    bass.push(
      last
        ? [
            { s: 0, i: "bass", m: root, d: 6, v: 0.9 },
            { s: 12, i: "bass", m: fifth, d: 1, v: 0.8 },
            { s: 14, i: "bass", m: root, d: 1, v: 0.9 },
          ]
        : [0, 8].flatMap((h): Hit[] => [
            { s: h, i: "bass", m: root, d: 3, v: 0.9 },
            { s: h + 3, i: "bass", m: root, d: 1, v: 0.55 },
            { s: h + 4, i: "bass", m: fifth, d: 2, v: 0.75 },
            { s: h + 6, i: "bass", m: root, d: 2, v: 0.6 },
          ]),
    );
    const notes = voicing(pcsOf(ch, 0), prev, 55);
    prev = notes;
    // plucked chords on two and four, a soft held chord under the whole bar
    comp.push([
      ...notes.map((m): Hit => ({ s: 0, i: "pad", m, d: 16, v: 0.55 })),
      ...(last ? [12, 14] : [4, 12]).flatMap((s, k) => notes.map((m, j): Hit => ({ s, i: "pluck", m, d: 2, v: k ? 0.6 : 0.7, t: j * 0.08 }))),
    ]);
  });
  for (let pass = 0; pass < 2; pass++)
    THEME_TUNE.forEach((line, b) => {
      // the first time on the electric piano, the second on the marimba
      const tuneHits = tune(line, pass ? "marimba" : "ep", pass ? 0.8 : 0.95);
      bars.push([...bass[b], ...comp[b], ...tuneHits]);
    });
  return { bpm: 104, swing: 0, steps: 16, gain: 0.37, bars };
}

export const THEME: Piece = theme();

/* ------------------------------------------------------------------ the composer */

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
} as const;
type ScaleName = keyof typeof SCALES;

/** Where each instrument sings best when it carries the tune. */
const RANGE: Record<Inst, [number, number]> = {
  ep: [64, 81],
  marimba: [67, 84],
  musicbox: [72, 88],
  bell: [72, 86],
  steel: [67, 84],
  pluck: [62, 81],
  brass: [57, 74],
  bass: [38, 52],
  lead: [67, 84],
  pad: [60, 76],
};

/** One bar's rhythm for a tune: [step, length] for each note. */
type Cell = [number, number][];
const CELLS: Record<string, Cell> = {
  long: [[0, 8], [8, 8]],
  ballad: [[0, 6], [6, 2], [8, 8]],
  lilt: [[0, 3], [3, 3], [6, 2], [8, 6], [14, 2]],
  walk: [[0, 4], [4, 4], [8, 4], [12, 4]],
  busy: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  sync: [[0, 3], [3, 3], [6, 4], [10, 2], [12, 4]],
  tiptoe: [[0, 1], [2, 1], [4, 1], [6, 2], [10, 1], [12, 1], [14, 1]],
  fanfare: [[0, 2], [2, 1], [3, 1], [4, 4], [8, 8]],
  answer: [[4, 2], [6, 2], [8, 4], [12, 4]],
  pickup: [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
  hook: [[0, 2], [2, 2], [4, 1], [6, 2], [8, 2], [10, 2], [12, 4]],
  sigh: [[0, 4], [4, 12]],
  sparse: [[0, 12]],
  // three beats
  w1: [[0, 4], [4, 4], [8, 4]],
  w2: [[0, 6], [6, 2], [8, 4]],
  w3: [[0, 8], [8, 4]],
  w4: [[0, 2], [2, 2], [4, 4], [8, 4]],
};
/** The last bar of a phrase: the tune comes to rest. */
const ENDS: Record<number, Cell[]> = {
  16: [
    [[0, 4], [4, 4], [8, 8]],
    [[0, 2], [2, 2], [4, 12]],
    [[0, 12]],
  ],
  12: [
    [[0, 4], [4, 8]],
    [[0, 12]],
  ],
};

type BassStyle = "hold" | "halves" | "bounce" | "walk" | "pulse" | "octave" | "offbeat" | "bossa" | "waltz" | "drone" | "tiptoe";
type CompStyle = "block" | "halves" | "backbeat" | "offbeat" | "charleston" | "push" | "bossa" | "arp8" | "arp16" | "broken" | "quarters" | "tremolo" | "waltz" | "strum" | "roll";
type Part = { style: CompStyle; inst: Inst; v: number; lo?: number };
type Form = { scale: ScaleName; a: string[]; cad: string; b: string[] };

type Spec = {
  bpm: [number, number];
  swing?: number;
  steps?: 12 | 16;
  /** the keys it can be in (pitch classes of the tonic) */
  keys: number[];
  /** the chords of phrase A (the last one the half-way stop), where A' comes home, and phrase B */
  forms: Form[];
  bass?: { style: BassStyle; inst?: Inst; v: number };
  comp?: Part;
  /** held chords under the rest: strings, an organ */
  pad?: Part;
  mel?: {
    /** the tune's instrument (one picked by the seed); the second time round, the other */
    inst: Inst[];
    v: number;
    cells: string[];
    /** only the pentatonic notes (the palace) */
    penta?: boolean;
    /** a quick note from above before a long one, and a long one trembling (a guzheng) */
    grace?: number;
    trem?: boolean;
    /** every note short (tiptoeing) */
    staccato?: boolean;
    /** the tune only in phrase B (a duel: the pulse is the music) */
    onlyB?: boolean;
  };
  kit?: { pat: Partial<Record<Drum, string>>; fill?: Partial<Record<Drum, string>>; crash?: number[]; v: number };
  /** a mood's own touches: the palace's gong, the cinema's timpani */
  extra?: (bar: number, key: number, steps: number) => Hit[];
  gain: number;
};

/** "x..o-" to a hit's strength: x full, o a bit softer, - a ghost. */
const STRENGTH: Record<string, number> = { x: 1, o: 0.6, "-": 0.32 };

const SPECS: Record<Mood, Spec> = {
  noir: {
    bpm: [84, 94],
    swing: 0.3,
    keys: [2, 4, 7, 9],
    forms: [
      { scale: "minor", a: ["i7", "iv7", "iiø7", "V7"], cad: "i7", b: ["iv7", "VII7", "IIImaj7", "V7"] },
      { scale: "minor", a: ["i", "VI7", "iiø7", "V7"], cad: "i", b: ["iv7", "i", "VI7", "V7"] },
    ],
    bass: { style: "walk", v: 0.8 },
    comp: { style: "charleston", inst: "ep", v: 0.5 },
    pad: { style: "block", inst: "pad", v: 0.4 },
    mel: { inst: ["marimba"], v: 0.75, cells: ["sync", "lilt", "pickup", "sigh", "answer"] },
    kit: { pat: { hat: "x...x.x.x...x.x.", brush: "....x.......x...", kick: "-.......-......." }, v: 0.6 },
    gain: 0.49,
  },
  suspense: {
    bpm: [104, 116],
    keys: [4, 2, 9, 7],
    forms: [
      { scale: "minor", a: ["i", "i", "VI", "VII"], cad: "i", b: ["iv", "VI", "bII", "V"] },
      { scale: "harm", a: ["i", "iv", "i", "V"], cad: "i", b: ["VI", "iv", "bII", "V"] },
    ],
    bass: { style: "pulse", v: 0.65 },
    pad: { style: "block", inst: "pad", v: 0.5 },
    comp: { style: "arp16", inst: "pluck", v: 0.42, lo: 57 },
    mel: { inst: ["ep"], v: 0.6, cells: ["long", "sigh", "sparse", "ballad"] },
    kit: { pat: { hat: "-o-o-o-o-o-o-o-o", kick: "x.....x...x.....", rim: "....x.......x..." }, fill: { tom: "........x.x.xxxx" }, v: 0.5 },
    gain: 0.57,
  },
  palace: {
    bpm: [66, 76],
    keys: [2, 7, 0, 9],
    forms: [
      { scale: "major", a: ["I", "I", "vi", "V"], cad: "I", b: ["IV", "I", "vi", "V"] },
      { scale: "major", a: ["I", "vi", "I", "V"], cad: "I", b: ["vi", "IV", "I", "V"] },
    ],
    bass: { style: "drone", inst: "pad", v: 0.5 },
    comp: { style: "roll", inst: "pluck", v: 0.5, lo: 50 },
    mel: { inst: ["pluck"], v: 0.95, cells: ["ballad", "long", "lilt", "pickup"], penta: true, grace: 0.4, trem: true },
    kit: { pat: { tom: "x.......x..x....", clave: "....-.......-..." }, v: 0.35 },
    extra: (bar, key) =>
      bar === 0 || bar === 8
        ? [{ s: 0, i: "gong", v: 0.85 }]
        : bar === 3 || bar === 11
          ? [{ s: 8, i: "bell", m: atOrAbove(key, 79), d: 8, v: 0.45 }]
          : [],
    gain: 1.6,
  },
  homey: {
    bpm: [92, 104],
    swing: 0.15,
    keys: [7, 0, 5, 2],
    forms: [
      { scale: "major", a: ["I", "vi", "IV", "V"], cad: "I", b: ["IV", "I", "ii", "V"] },
      { scale: "major", a: ["I", "IV", "I", "V"], cad: "I", b: ["vi", "iii", "IV", "V"] },
    ],
    bass: { style: "bounce", v: 0.55 },
    comp: { style: "backbeat", inst: "ep", v: 0.5 },
    mel: { inst: ["musicbox", "marimba"], v: 0.7, cells: ["lilt", "pickup", "walk", "sync", "answer"] },
    kit: { pat: { shaker: "x-x-x-x-x-x-x-x-", kick: "x.......x.......", rim: "....x.......x..." }, v: 0.45 },
    gain: 0.67,
  },
  festive: {
    bpm: [112, 124],
    keys: [0, 2, 7, 9],
    forms: [
      { scale: "major", a: ["I", "IV", "I", "V"], cad: "I", b: ["IV", "V", "vi", "V"] },
      { scale: "major", a: ["I", "vi", "IV", "V"], cad: "I", b: ["IV", "I", "IV", "V"] },
      { scale: "mixo", a: ["I", "VII", "IV", "V"], cad: "I", b: ["IV", "VII", "I", "V"] },
    ],
    bass: { style: "octave", v: 0.5 },
    comp: { style: "offbeat", inst: "marimba", v: 0.55 },
    mel: { inst: ["steel", "bell"], v: 0.75, cells: ["busy", "hook", "fanfare", "walk", "sync"] },
    kit: { pat: { kick: "x...x...x...x...", clap: "....x.......x...", shaker: "xoxoxoxoxoxoxoxo" }, fill: { tom: "............xxxx" }, crash: [0, 8], v: 0.5 },
    gain: 0.56,
  },
  romance: {
    bpm: [64, 74],
    keys: [5, 0, 7, 10],
    forms: [
      { scale: "major", a: ["Imaj7", "iii7", "IVmaj7", "V"], cad: "Imaj7", b: ["vi7", "iii7", "IVmaj7", "V"] },
      { scale: "major", a: ["I", "V", "vi", "V"], cad: "I", b: ["IV", "V", "iii", "vi|V"] },
    ],
    bass: { style: "hold", v: 0.45 },
    comp: { style: "broken", inst: "pluck", v: 0.5 },
    pad: { style: "block", inst: "pad", v: 0.45 },
    mel: { inst: ["ep", "musicbox"], v: 0.65, cells: ["ballad", "long", "sigh", "pickup"] },
    gain: 0.63,
  },
  heartbreak: {
    bpm: [58, 68],
    keys: [9, 4, 2, 11],
    forms: [
      { scale: "minor", a: ["i", "VI", "III", "VII"], cad: "i", b: ["iv", "i", "VI", "V"] },
      { scale: "minor", a: ["i", "iv", "VI", "V"], cad: "i", b: ["VI", "VII", "III", "V"] },
    ],
    bass: { style: "hold", v: 0.4 },
    pad: { style: "block", inst: "pad", v: 0.55 },
    comp: { style: "quarters", inst: "ep", v: 0.4 },
    mel: { inst: ["ep"], v: 0.55, cells: ["sigh", "long", "ballad", "sparse"] },
    gain: 0.74,
  },
  office: {
    bpm: [100, 112],
    swing: 0.3,
    keys: [5, 10, 0, 3],
    forms: [
      { scale: "major", a: ["Imaj7", "vi7", "ii7", "V7"], cad: "Imaj7", b: ["iii7", "VI7", "ii7", "V7"] },
      { scale: "major", a: ["ii7", "V7", "Imaj7", "VI7"], cad: "Imaj7", b: ["IVmaj7", "iii7", "ii7", "V7"] },
    ],
    bass: { style: "walk", v: 0.65 },
    comp: { style: "charleston", inst: "ep", v: 0.5 },
    mel: { inst: ["marimba"], v: 0.65, cells: ["sync", "lilt", "walk", "answer", "pickup"] },
    kit: { pat: { hat: "x...x.x.x...x.x.", rim: "....x.......x...", kick: "-.......-......." }, v: 0.5 },
    gain: 0.58,
  },
  gameshow: {
    bpm: [120, 130],
    keys: [0, 7, 2, 5],
    forms: [
      { scale: "major", a: ["I", "vi", "IV", "V"], cad: "I", b: ["IV", "V", "iii", "V"] },
      { scale: "major", a: ["I", "IV", "I", "V"], cad: "I", b: ["vi", "IV", "ii", "V"] },
    ],
    bass: { style: "octave", v: 0.55 },
    comp: { style: "offbeat", inst: "brass", v: 0.45 },
    mel: { inst: ["lead", "steel"], v: 0.6, cells: ["hook", "busy", "fanfare", "sync"] },
    kit: { pat: { kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x." }, fill: { snare: "........x.x.xxxx" }, crash: [0, 8], v: 0.5 },
    gain: 0.62,
  },
  sneaky: {
    bpm: [100, 112],
    swing: 0.12,
    keys: [9, 4, 2, 7],
    forms: [
      { scale: "harm", a: ["i", "iv", "i", "V"], cad: "i", b: ["VI", "iv", "iiø7", "V"] },
      { scale: "harm", a: ["i", "VI", "iv", "V"], cad: "i", b: ["iv", "i", "bII", "V"] },
    ],
    bass: { style: "tiptoe", v: 0.6 },
    comp: { style: "offbeat", inst: "pluck", v: 0.4 },
    mel: { inst: ["pluck", "marimba"], v: 0.75, cells: ["tiptoe", "answer", "sync", "tiptoe"], staccato: true },
    kit: { pat: { clave: "x.......x.......", rim: "....x.......x...", hat: "..-...-...-...-." }, v: 0.45 },
    gain: 0.9,
  },
  outdoors: {
    bpm: [96, 108],
    swing: 0.1,
    keys: [2, 7, 9, 4],
    forms: [
      { scale: "major", a: ["I", "V", "IV", "V"], cad: "I", b: ["vi", "IV", "I", "V"] },
      { scale: "mixo", a: ["I", "VII", "IV", "V"], cad: "I", b: ["IV", "I", "VII", "V"] },
    ],
    bass: { style: "bounce", v: 0.5 },
    comp: { style: "strum", inst: "pluck", v: 0.45 },
    mel: { inst: ["marimba", "ep"], v: 0.65, cells: ["lilt", "walk", "pickup", "sync"] },
    kit: { pat: { shaker: "x-x-x-x-x-x-x-x-", kick: "x.......x.x.....", rim: "....x.......x..." }, v: 0.4 },
    gain: 0.67,
  },
  party: {
    bpm: [118, 126],
    keys: [9, 4, 0, 7],
    forms: [
      { scale: "major", a: ["vi", "IV", "I", "V"], cad: "I", b: ["IV", "V", "vi", "V"] },
      { scale: "minor", a: ["i", "VI", "III", "VII"], cad: "i", b: ["VI", "VII", "i", "V"] },
    ],
    bass: { style: "offbeat", v: 0.6 },
    pad: { style: "block", inst: "pad", v: 0.35 },
    comp: { style: "push", inst: "ep", v: 0.4 },
    mel: { inst: ["lead"], v: 0.55, cells: ["hook", "busy", "sync"] },
    kit: { pat: { kick: "x...x...x...x...", clap: "....x.......x...", ohat: "..x...x...x...x.", hat: "-.-.-.-.-.-.-.-." }, fill: { snare: "............xxxx" }, crash: [0, 8], v: 0.55 },
    gain: 0.59,
  },
  spooky: {
    bpm: [120, 136],
    steps: 12,
    keys: [2, 4, 9, 0],
    forms: [
      { scale: "harm", a: ["i", "iv", "i", "V"], cad: "i", b: ["VI", "iv", "iiø7", "V"] },
      { scale: "harm", a: ["i", "VI", "iv", "V"], cad: "i", b: ["iv", "i", "VI", "V"] },
    ],
    bass: { style: "waltz", v: 0.5 },
    comp: { style: "waltz", inst: "pluck", v: 0.4 },
    mel: { inst: ["musicbox"], v: 0.75, cells: ["w1", "w2", "w3", "w4"] },
    // a clock somewhere in the house striking
    extra: (bar, key) => (bar === 0 || bar === 8 ? [{ s: 0, i: "bell", m: atOrAbove(key, 50), d: 12, v: 0.6 }] : []),
    gain: 0.79,
  },
  cinema: {
    bpm: [70, 80],
    keys: [2, 0, 7, 5],
    forms: [
      { scale: "major", a: ["I", "V", "vi", "IV|V"], cad: "I", b: ["vi", "IV", "I", "V"] },
      { scale: "minor", a: ["i", "VI", "III", "VII"], cad: "i", b: ["iv", "VI", "VII", "V"] },
    ],
    bass: { style: "hold", v: 0.5 },
    pad: { style: "block", inst: "pad", v: 0.6 },
    comp: { style: "arp8", inst: "pluck", v: 0.4 },
    mel: { inst: ["brass"], v: 0.6, cells: ["long", "ballad", "fanfare", "sigh"] },
    // the timpani on the big downbeats, a roll into the top
    extra: (bar, key) => {
      const low = atOrAbove(key, 38);
      if (bar % 4 === 0) return [{ s: 0, i: "timp", m: low, v: bar % 8 === 0 ? 0.8 : 0.55 }, ...(bar === 8 ? [{ s: 0, i: "crash" as const, v: 0.45 }] : [])];
      if (bar === 15) return [12, 13, 14, 15].map((s, k): Hit => ({ s, i: "timp", m: low + 7, v: 0.35 + k * 0.1 }));
      return [];
    },
    gain: 0.54,
  },
  soap: {
    bpm: [72, 84],
    keys: [4, 0, 2, 9],
    forms: [
      { scale: "harm", a: ["i", "VI", "iv", "V"], cad: "i", b: ["iv", "i", "bII", "V"] },
      { scale: "harm", a: ["i", "iv", "VI", "V"], cad: "i", b: ["VI", "iv", "bII", "V"] },
    ],
    bass: { style: "hold", v: 0.5 },
    pad: { style: "block", inst: "pad", v: 0.5 },
    comp: { style: "tremolo", inst: "ep", v: 0.32 },
    mel: { inst: ["ep"], v: 0.7, cells: ["ballad", "sigh", "pickup", "fanfare"] },
    // a stab on the big downbeats, and the dun, dun, DUN at the end
    extra: (bar, key) => {
      const low = atOrAbove(key, 40);
      if (bar === 0 || bar === 8) return [{ s: 0, i: "timp", m: low, v: 0.8 }, { s: 0, i: "brass", m: low + 12, d: 3, v: 0.6 }];
      if (bar === 15)
        return [8, 10, 12].flatMap((s, k): Hit[] => [
          { s, i: "timp", m: low + 7, v: 0.6 + k * 0.15 },
          { s, i: "brass", m: low + 19, d: k === 2 ? 4 : 1, v: 0.5 + k * 0.12 },
        ]);
      return [];
    },
    gain: 0.58,
  },
  news: {
    bpm: [116, 126],
    keys: [2, 4, 7, 0],
    forms: [
      { scale: "minor", a: ["i", "VI", "III", "VII"], cad: "i", b: ["iv", "VI", "VII", "V"] },
      { scale: "minor", a: ["i", "iv", "VII", "III"], cad: "i", b: ["VI", "VII", "i", "V"] },
    ],
    bass: { style: "pulse", v: 0.55 },
    pad: { style: "block", inst: "pad", v: 0.4 },
    comp: { style: "offbeat", inst: "pluck", v: 0.35 },
    mel: { inst: ["brass", "lead"], v: 0.5, cells: ["fanfare", "long", "sync"] },
    kit: { pat: { kick: "x.....x.x.......", snare: "....x.......x...", hat: "xoxoxoxoxoxoxoxo", clave: "x...x...x...x..." }, crash: [0], v: 0.45 },
    gain: 0.57,
  },
  elevator: {
    bpm: [92, 100],
    swing: 0.12,
    keys: [5, 0, 10, 3],
    forms: [
      { scale: "major", a: ["Imaj7", "vi7", "ii7", "V7"], cad: "Imaj7", b: ["IVmaj7", "iii7", "ii7", "V7"] },
      { scale: "major", a: ["Imaj7", "II7", "ii7", "V7"], cad: "Imaj7", b: ["IVmaj7", "iv7", "Imaj7", "V7"] },
    ],
    bass: { style: "bossa", v: 0.5 },
    comp: { style: "bossa", inst: "ep", v: 0.45 },
    mel: { inst: ["marimba", "musicbox"], v: 0.6, cells: ["lilt", "long", "sync", "ballad"] },
    kit: { pat: { shaker: "xoxoxoxoxoxoxoxo", rim: "x..x..x...x..x..", kick: "x..x....x..x...." }, v: 0.35 },
    gain: 0.58,
  },
  solemn: {
    bpm: [60, 66],
    keys: [3, 10, 5, 0],
    forms: [
      { scale: "major", a: ["I", "IV", "I", "V"], cad: "I", b: ["vi", "IV", "I", "V"] },
      { scale: "major", a: ["I", "vi", "IV", "V"], cad: "I", b: ["IV", "I", "ii", "V"] },
    ],
    bass: { style: "hold", inst: "pad", v: 0.55 },
    comp: { style: "halves", inst: "pad", v: 0.65 },
    // no tune: the organ's chords are the music, and a bell now and then
    extra: (bar, key) => (bar % 4 === 0 ? [{ s: 0, i: "bell", m: atOrAbove(key, 72), d: 8, v: 0.4 }] : []),
    gain: 1.7,
  },
  tension: {
    bpm: [86, 96],
    keys: [4, 2, 11, 9],
    forms: [
      { scale: "minor", a: ["i", "i", "bII", "i"], cad: "i", b: ["VI", "VII", "bII", "V"] },
      { scale: "harm", a: ["i", "iv", "bII", "V"], cad: "i", b: ["i", "VI", "bII", "V"] },
    ],
    bass: { style: "drone", v: 0.5 },
    pad: { style: "block", inst: "pad", v: 0.5 },
    comp: { style: "arp16", inst: "pluck", v: 0.35, lo: 50 },
    mel: { inst: ["ep"], v: 0.45, cells: ["sparse", "long"], onlyB: true },
    kit: { pat: { heart: "x.x.....x.x.....", hat: "-.-.-.-.-.-.-.-." }, fill: { tom: "........x...x.xx" }, v: 0.55 },
    gain: 0.58,
  },
};

/** A chord in a bar: where it starts, how long it lasts. */
type Slot = { s: number; len: number; ch: Ch };

function bassSlot(style: BassStyle, inst: Inst, v: number, sl: Slot, next: Ch, key: number, r: Rand): Hit[] {
  const root = atOrAbove((key + sl.ch.root) % 12, 38);
  const t = sl.ch.tones;
  const fifth = root + (t.includes(6) ? 6 : t.includes(8) ? 8 : 7);
  const third = root + (t.includes(3) ? 3 : t.includes(4) ? 4 : t.includes(5) ? 5 : 2);
  const nextRoot = atOrAbove((key + next.root) % 12, 38);
  const at = (s: number, m: number, d: number, k = 1): Hit | null => (s < sl.len ? { s: sl.s + s, i: inst, m, d: Math.min(d, sl.len - s), v: v * k } : null);
  const out: (Hit | null)[] = [];
  switch (style) {
    case "hold":
      out.push(at(0, root, sl.len));
      break;
    case "halves":
      out.push(at(0, root, 8), at(8, fifth, 8, 0.8));
      break;
    case "bounce":
      out.push(at(0, root, 4), at(8, fifth, 4, 0.8));
      if (r() < 0.5) out.push(at(14, root, 2, 0.6));
      break;
    case "walk": {
      // four to the bar: the root, a step up, the fifth, a half step into the next chord
      const into = nextRoot + (r() < 0.5 ? -1 : 1);
      const notes = sl.len >= 16 ? [root, r() < 0.5 ? third : root + 2, fifth, into] : [root, into];
      notes.forEach((m, k) => out.push(at(k * 4, m, 3, k ? 0.8 : 1)));
      break;
    }
    case "pulse":
      for (let s = 0; s < sl.len; s += 2) out.push(at(s, root, 1.5, s % 4 ? 0.65 : 1));
      break;
    case "octave":
      for (let s = 0; s < sl.len; s += 2) out.push(at(s, s % 4 ? root + 12 : root, 1, s % 4 ? 0.7 : 1));
      break;
    case "offbeat":
      for (let s = 2; s < sl.len; s += 4) out.push(at(s, root, 1.5));
      break;
    case "bossa":
      out.push(at(0, root, 6), at(6, fifth, 2, 0.7), at(8, fifth, 6, 0.85), at(14, root, 2, 0.7));
      break;
    case "waltz":
      out.push(at(0, root, 4));
      if (r() < 0.4) out.push(at(8, fifth, 4, 0.6));
      break;
    case "drone":
      out.push(at(0, root, sl.len), { s: sl.s, i: "pad", m: fifth + 12, d: sl.len, v: v * 0.6 });
      break;
    case "tiptoe":
      [root, fifth, root, nextRoot + (r() < 0.5 ? -1 : 1)].forEach((m, k) => out.push(at(k * 4, m, 1, k % 2 ? 0.7 : 1)));
      break;
  }
  return out.filter((h): h is Hit => !!h);
}

function compSlot(p: Part, sl: Slot, notes: number[], r: Rand): Hit[] {
  const n = notes;
  const out: Hit[] = [];
  const chord = (s: number, d: number, k = 1, strum = 0) => {
    if (s >= sl.len) return;
    n.forEach((m, j) => out.push({ s: sl.s + s, i: p.inst, m, d: Math.min(d, sl.len - s), v: p.v * k, t: strum ? j * strum : undefined }));
  };
  const one = (s: number, m: number, d: number, k = 1) => {
    if (s < sl.len) out.push({ s: sl.s + s, i: p.inst, m, d: Math.min(d, sl.len - s), v: p.v * k });
  };
  const updown = n.length > 3 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 1];
  switch (p.style) {
    case "block":
      chord(0, sl.len);
      break;
    case "halves":
      chord(0, 8);
      chord(8, 8, 0.85);
      break;
    case "backbeat":
      chord(4, 2);
      chord(12, 2, 0.9);
      break;
    case "offbeat":
      for (let s = 2; s < sl.len; s += 4) chord(s, 1, s % 8 === 2 ? 1 : 0.85);
      break;
    case "charleston":
      chord(0, 3);
      chord(6, 2, 0.8);
      if (r() < 0.4) chord(10, 2, 0.7);
      break;
    case "push":
      chord(0, 2);
      chord(3, 2, 0.8);
      chord(6, 2, 0.85);
      chord(10, 2, 0.75);
      break;
    case "bossa":
      [0, 3, 6, 10, 13].forEach((s, k) => chord(s, 2, k ? 0.8 : 1));
      break;
    case "arp8":
      for (let s = 0, k = 0; s < sl.len; s += 2, k++) one(s, n[updown[k % updown.length]], 2, s % 4 ? 0.75 : 1);
      break;
    case "arp16":
      for (let s = 0, k = 0; s < sl.len; s++, k++) one(s, n[[0, 1, 2, 1][k % 4]], 1, s % 4 ? 0.6 : 1);
      break;
    case "broken": {
      // up the chord and over the top, like a harp
      const ext = [n[0] - 12, n[0], n[1], n[2], n[0] + 12, n[2], n[1], n[0]];
      for (let s = 0, k = 0; s < sl.len; s += 2, k++) one(s, ext[k % ext.length], 3, s % 8 ? 0.7 : 1);
      break;
    }
    case "quarters":
      for (let s = 0, k = 0; s < sl.len; s += 4, k++) one(s, n[[0, 1, 2, 1][k % 4]], 4, s ? 0.8 : 1);
      break;
    case "tremolo":
      for (let s = 0; s < sl.len; s += 2) chord(s, 2, s % 4 ? 0.6 : 0.8);
      break;
    case "waltz":
      chord(4, 2, 0.9);
      chord(8, 2, 0.8);
      break;
    case "strum":
      // down, down-up, up-down-up: a strummed guitar
      [0, 4, 6, 10, 12, 14].forEach((s, k) => {
        const up = k % 2 === 1;
        const strings = up ? [...n].reverse() : n;
        if (s < sl.len) strings.forEach((m, j) => out.push({ s: sl.s + s, i: p.inst, m, d: 2, v: p.v * (s % 4 ? 0.7 : 1), t: j * 0.12 }));
      });
      break;
    case "roll":
      // a guzheng sweeps up the chord, and sometimes again half way
      chord(0, sl.len, 1, 0.35);
      if (sl.len >= 16 && r() < 0.5) chord(8, 8, 0.7, 0.3);
      break;
  }
  return out;
}

/** A tune's notes for one chord: the scale, bent to fit the chord (and only the pentatonic, for the palace). */
function ladderFor(ch: Ch, key: number, scale: readonly number[], lo: number, hi: number, penta: boolean): number[] {
  const chord = pcsOf(ch, key);
  let pcs: Set<number>;
  if (penta) pcs = new Set([0, 2, 4, 7, 9].map((x) => (x + key) % 12));
  else {
    // a minor key's tune takes the raised seventh only over the chord that has it (the V)
    const inScale = new Set((scale === SCALES.harm ? SCALES.minor : scale).map((x) => (x + key) % 12));
    pcs = new Set([...inScale, ...chord]);
    // a chord note from outside the key (the raised seventh of a V): its neighbours give way
    for (const c of chord) if (!inScale.has(c)) for (const nb of [(c + 11) % 12, (c + 1) % 12]) if (!chord.includes(nb)) pcs.delete(nb);
  }
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
  return out;
}

type Note = { s: number; d: number; m: number };

/**
 * A tune. Phrase A: a motif, an answer, the motif again on the new chord, a stop half way; A' the same
 * coming home; B something new, higher; A'' the tune once more.
 */
function melody(spec: NonNullable<Spec["mel"]>, prog: Slot[][], key: number, scale: readonly number[], inst: Inst, steps: number, r: Rand): Note[][] {
  const [lo, hi] = RANGE[inst];
  const penta = !!spec.penta;
  // the downbeats and the long notes are the chord's own; so, more often than not, are the other beats
  const strong = (s: number, d: number) => s % (steps === 12 ? 12 : 8) === 0 || d >= (steps === 12 ? 6 : 4);
  const onBeat = (s: number) => s % 4 === 0;
  const chordAt = (bar: number, s: number) => prog[bar].find((sl) => s >= sl.s && s < sl.s + sl.len)!.ch;
  const tonePcs = (ch: Ch) => pcsOf(ch, key);
  let prev = Math.round((lo + hi) / 2);
  let dir = 1;

  const choose = (bar: number, s: number, d: number, lift: number): number => {
    const ch = chordAt(bar, s);
    const ladder = ladderFor(ch, key, scale, lo + lift, hi + lift, penta);
    const chordPcs = tonePcs(ch);
    const own = ladder.filter((m) => chordPcs.includes(m % 12));
    // a held note a half step above the chord's (the fourth over a major chord) rubs: let it pass quickly
    const easy = d >= 2 ? ladder.filter((m) => !chordPcs.includes((m + 11) % 12) || chordPcs.includes(m % 12)) : ladder;
    let pool = strong(s, d) || (onBeat(s) && r() < 0.6) ? own : easy;
    if (!pool.length) pool = ladder;
    const near = pool.filter((m) => Math.abs(m - prev) <= 9);
    if (near.length) pool = near;
    if (prev > hi + lift - 3) dir = -1;
    else if (prev < lo + lift + 3) dir = 1;
    else if (r() < 0.22) dir = -dir;
    const target = prev + dir * 2;
    const sorted = [...pool].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
    const x = r();
    let m = sorted[x < 0.6 ? 0 : x < 0.88 ? Math.min(1, sorted.length - 1) : Math.min(2, sorted.length - 1)];
    if (m === prev && sorted.length > 1 && r() < 0.7) m = sorted.find((y) => y !== prev)!;
    prev = m;
    return m;
  };

  const bar = (b: number, cell: Cell, lift: number): Note[] => cell.map(([s, d]) => ({ s, d, m: choose(b, s, d, lift) }));

  /** The motif again on another chord: the same shape, moved along the scale, fitted to the chord. */
  const sequence = (from: Note[], b: number, fromBar: number, lift: number): Note[] => {
    const scaleLadder = ladderFor({ root: 0, tones: [0] }, key, scale, lo + lift - 12, hi + lift + 12, penta).filter((m) => (penta ? true : scale.some((x) => (x + key) % 12 === m % 12)));
    const deg = (m: number) => scaleLadder.reduce((bi, y, i) => (Math.abs(y - m) < Math.abs(scaleLadder[bi] - m) ? i : bi), 0);
    const steps2 = (a: Ch, c: Ch) => {
      const da = deg(atOrAbove((key + a.root) % 12, 60));
      const dc = deg(atOrAbove((key + c.root) % 12, 60));
      let x = dc - da;
      const per = penta ? 5 : 7;
      if (x > per / 2) x -= per;
      if (x < -per / 2) x += per;
      return x;
    };
    const shift = steps2(chordAt(fromBar, 0), chordAt(b, 0));
    return from.map((n) => {
      let m = scaleLadder[Math.max(0, Math.min(scaleLadder.length - 1, deg(n.m) + shift))];
      const ch = chordAt(b, n.s);
      const ladder = ladderFor(ch, key, scale, lo + lift, hi + lift, penta);
      const pool = strong(n.s, n.d) ? ladder.filter((y) => tonePcs(ch).includes(y % 12)) : ladder;
      const use = pool.length ? pool : ladder;
      m = use.reduce((best, y) => (Math.abs(y - m) < Math.abs(best - m) ? y : best), use[0]);
      prev = m;
      return { ...n, m };
    });
  };

  /** The phrase's last bar: come to rest on the chord (half way) or on the home note. */
  const cadence = (b: number, home: boolean, lift: number): Note[] => {
    const cell = pick(r, ENDS[steps]);
    const notes = bar(b, cell, lift);
    const last = notes[notes.length - 1];
    const ch = chordAt(b, last.s);
    const ladder = ladderFor(ch, key, scale, lo + lift, hi + lift, penta);
    const want = home ? [(key + (r() < 0.75 ? 0 : penta ? 4 : scale[2])) % 12] : [(key + ch.root) % 12, (key + ch.root + 7) % 12];
    const pool = ladder.filter((m) => want.includes(m % 12));
    if (pool.length) last.m = pool.reduce((best, y) => (Math.abs(y - prev) < Math.abs(best - prev) ? y : best), pool[0]);
    prev = last.m;
    return notes;
  };

  const cells = spec.cells.map((c) => CELLS[c]);
  const c1 = pick(r, cells);
  const c2 = pick(r, cells);
  // phrase A
  const a0 = bar(0, c1, 0);
  const a1 = bar(1, c2, 0);
  const a2 = sequence(a0, 2, 0, 0);
  const a3 = cadence(3, false, 0);
  // A', home
  prev = a2[a2.length - 1].m;
  const h3 = cadence(7, true, 0);
  // B, a little higher
  const lift = penta ? 2 : 3;
  const c3 = pick(r, cells);
  const c4 = pick(r, cells);
  const b0 = bar(8, c3, lift);
  const b1 = bar(9, c4, lift);
  const b2 = sequence(b0, 10, 8, lift);
  const b3 = cadence(11, false, lift);
  return [a0, a1, a2, a3, a0, a1, a2, h3, b0, b1, b2, b3, a0, a1, a2, h3];
}

/** A tune's notes as hits, with the ornaments the mood asks for. */
function melodyHits(notes: Note[], inst: Inst, spec: NonNullable<Spec["mel"]>, key: number, scale: readonly number[], steps: number, r: Rand): Hit[] {
  const out: Hit[] = [];
  for (const n of notes) {
    const accent = n.s % (steps === 12 ? 12 : 8) === 0 ? 1 : n.s % 4 === 0 ? 0.88 : 0.78;
    const v = Math.min(1, spec.v * accent * (0.94 + r() * 0.12));
    const d = spec.staccato ? Math.min(n.d, 1) : n.d;
    if (spec.grace && n.d >= 4 && r() < spec.grace) {
      // a quick note from just above, then the note
      const above = ladderFor({ root: 0, tones: [0] }, key, scale, n.m + 1, n.m + 4, !!spec.penta)[0] ?? n.m + 2;
      out.push({ s: n.s, i: inst, m: above, d: 0.5, v: v * 0.7 });
      out.push({ s: n.s, i: inst, m: n.m, d: d - 0.5, v, t: 0.5 });
    } else out.push({ s: n.s, i: inst, m: n.m, d, v });
    if (spec.trem && n.d >= 8 && r() < 0.6)
      // the long note trembles under the finger, fading
      for (let k = 3; k < n.d * 2 - 1; k++) out.push({ s: n.s + Math.floor(k / 2), i: inst, m: n.m, d: 0.5, v: v * 0.42 * (1 - k / (n.d * 2)), t: k % 2 ? 0.5 : undefined });
  }
  return out;
}

function drumBar(kit: NonNullable<Spec["kit"]>, bar: number, steps: number): Hit[] {
  const out: Hit[] = [];
  const end = bar % 4 === 3;
  const add = (pat: Partial<Record<Drum, string>>) => {
    for (const [i, line] of Object.entries(pat) as [Drum, string][])
      for (let s = 0; s < steps && s < line.length; s++) {
        const k = STRENGTH[line[s]];
        if (k) out.push({ s, i, v: kit.v * k, m: i === "tom" ? 50 + (s % 4) * -3 : undefined });
      }
  };
  if (end && kit.fill) {
    // the phrase's last bar: the fill takes over from its own drums
    const keep = Object.fromEntries(Object.entries(kit.pat).filter(([i]) => !(i in kit.fill!))) as Partial<Record<Drum, string>>;
    add(keep);
    add(kit.fill);
  } else add(kit.pat);
  if (kit.crash?.includes(bar)) out.push({ s: 0, i: "crash", v: kit.v * 0.8 });
  return out;
}

const cache = new Map<string, Piece>();

/** A mood's piece, the same for the same seed on every phone. */
export function compose(mood: Mood, seed: number): Piece {
  const id = `${mood}|${seed}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const sp = SPECS[mood];
  const r = rng(seed);
  const steps = sp.steps ?? 16;
  const form = pick(r, sp.forms);
  const key = pick(r, sp.keys);
  const bpm = Math.round(sp.bpm[0] + r() * (sp.bpm[1] - sp.bpm[0]));
  const scale = SCALES[form.scale];
  const home = [...form.a.slice(0, 3), form.cad];
  const prog: Slot[][] = [...form.a, ...home, ...form.b, ...home].map((tok) => {
    const parts = tok.split("|").map((x) => roman(x, scale));
    const len = steps / parts.length;
    return parts.map((ch, k) => ({ s: k * len, len, ch }));
  });
  const slots = prog.flat();

  // the band: bass, chords, held chords
  const band: Hit[][] = prog.map(() => []);
  let prevComp: number[] | null = null;
  let prevPad: number[] | null = null;
  prog.forEach((bar, b) =>
    bar.forEach((sl) => {
      const next = slots[(slots.indexOf(sl) + 1) % slots.length].ch;
      if (sp.bass) band[b].push(...bassSlot(sp.bass.style, sp.bass.inst ?? "bass", sp.bass.v, sl, next, key, r));
      if (sp.comp) {
        const notes = voicing(pcsOf(sl.ch, key), prevComp, sp.comp.lo ?? 55);
        prevComp = notes;
        band[b].push(...compSlot(sp.comp, sl, notes, r));
      }
      if (sp.pad) {
        const notes = voicing(pcsOf(sl.ch, key), prevPad, sp.pad.lo ?? 53);
        prevPad = notes;
        band[b].push(...compSlot(sp.pad, sl, notes, r));
      }
    }),
  );

  // the tune: the first time on one instrument; the second time it rests through A and A', then
  // comes back (on the other instrument, if the mood has two)
  let tunes: Hit[][][] = [prog.map(() => []), prog.map(() => [])];
  if (sp.mel) {
    const first = pick(r, sp.mel.inst);
    const second = sp.mel.inst.find((x) => x !== first) ?? first;
    const notes = melody(sp.mel, prog, key, scale, first, steps, r);
    const shift = Math.round((RANGE[second][0] + RANGE[second][1] - RANGE[first][0] - RANGE[first][1]) / 24) * 12;
    const mel = sp.mel;
    tunes = [0, 1].map((pass) =>
      notes.map((bar, b) => {
        if (mel.onlyB && (b < 8 || b > 11)) return [];
        if (pass === 1 && b < 8 && !mel.onlyB) return [];
        const inst = pass ? second : first;
        return melodyHits(pass ? bar.map((n) => ({ ...n, m: n.m + shift })) : bar, inst, mel, key, scale, steps, r);
      }),
    );
  }

  const bars: Hit[][] = [];
  for (let pass = 0; pass < 2; pass++)
    for (let b = 0; b < 16; b++) bars.push([...band[b], ...(sp.kit ? drumBar(sp.kit, b, steps) : []), ...(sp.extra?.(b, key, steps) ?? []), ...tunes[pass][b]]);
  const piece: Piece = { bpm, swing: sp.swing ?? 0, steps, gain: sp.gain, bars };
  cache.set(id, piece);
  return piece;
}

/* ------------------------------------------------------------------ what plays on stage */

/** The act's music: its mood, and the seed that makes it this scene's own. */
export function actMusic(v: Pick<DramaView, "mode" | "scene" | "classic" | "read" | "pk">): { mood: Mood; seed: number; key: string } {
  if (v.mode === "pk") {
    const key = `pk|${v.pk?.line.en ?? ""}`;
    return { mood: "tension", seed: seedOf(key), key };
  }
  if (v.mode === "classic" && v.classic) {
    const key = `classic|${v.classic.id}`;
    return { mood: CLASSIC_MOOD[v.classic.id] ?? "cinema", seed: seedOf(key), key };
  }
  if (v.mode === "read" && v.read) {
    const key = `read|${v.read.id}`;
    return { mood: READ_MOOD[v.read.kind] ?? "elevator", seed: seedOf(key), key };
  }
  const key = `scene|${v.scene?.id ?? ""}`;
  return { mood: sceneMood(v.scene?.id ?? "", v.scene?.kind ?? ""), seed: seedOf(key), key };
}

export function actPiece(v: Pick<DramaView, "mode" | "scene" | "classic" | "read" | "pk">): Piece {
  const { mood, seed } = actMusic(v);
  return compose(mood, seed);
}
