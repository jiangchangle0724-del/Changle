/**
 * Music for the party: a small step sequencer that plays original grooves (dance games and the
 * background set, lib/nightset.ts), and a melody player for Name That Tune. Everything is scheduled on the
 * audio clock, and grooves can start on a shared wall-clock moment so every phone at an online
 * table lands on the same beat.
 */
import { bus, clap, crash, ctxTimeAt, hat, kick, midiHz, note, onAudioReset, shaker, snare, tom, burst, type Bus, type Inst } from "./audio/engine";

type Hits = number[]; // 16 velocities (0 = silent)
export const v = (s: string): Hits => s.split("").map((ch) => (ch === "." ? 0 : ch === "x" ? 1 : ch === "o" ? 0.55 : ch === "-" ? 0.3 : 0));

export type GrooveId = "house" | "disco" | "funk" | "calypso" | "electro" | "hiphop" | "lofi" | "lounge";

export type Style = {
  bpm: number;
  swing?: number;
  kick?: Hits;
  snare?: Hits;
  clap?: Hits;
  hat?: Hits;
  ohat?: Hits;
  shaker?: Hits;
  tom?: Hits;
  /** per bar of a 4-bar loop: 16 steps of midi notes (null = rest) */
  bass?: (number | null)[][];
  bassLen?: number;
  chords?: { inst: Inst; prog: number[][]; hits: [number, number][]; peak: number };
  lead?: { inst: Inst; bars: (number | null)[][]; len?: number; peak: number };
  crackle?: boolean;
  gain: number;
};

const N = null;
/** Turn "A2 . . A2" style strings into midi steps. */
const NOTES: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
function m(name: string): number {
  const mm = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!mm) throw new Error(name);
  return 12 * (Number(mm[2]) + 1) + NOTES[mm[1]];
}
export function line(s: string): (number | null)[] {
  const out = s
    .trim()
    .split(/\s+/)
    .map((t) => (t === "." ? N : m(t)));
  while (out.length < 16) out.push(N);
  return out.slice(0, 16);
}
export const chord = (...names: string[]) => names.map(m);

export const GROOVES: Record<GrooveId, Style> = {
  house: {
    bpm: 124,
    kick: v("x...x...x...x..."),
    clap: v("....x.......x..."),
    hat: v("..o...o...o...o."),
    ohat: v("..x...x...x...x."),
    shaker: v("-.-.-.-.-.-.-.-."),
    bass: [line(". . A1 . . . A1 . . . A1 . . . A2 ."), line(". . F1 . . . F1 . . . F1 . . . F2 ."), line(". . C2 . . . C2 . . . C2 . . . C3 ."), line(". . G1 . . . G1 . . . G1 . . . B1 .")],
    chords: { inst: "ep", prog: [chord("A3", "C4", "E4", "G4"), chord("F3", "A3", "C4", "E4"), chord("C4", "E4", "G4", "B4"), chord("G3", "B3", "D4", "F#4")], hits: [[3, 1], [6, 2], [11, 1]], peak: 0.07 },
    gain: 0.9,
  },
  disco: {
    bpm: 118,
    kick: v("x...x...x...x..."),
    snare: v("....x.......x..."),
    hat: v("o.o.o.o.o.o.o.o."),
    ohat: v("..x...x...x...x."),
    bass: [line("D2 . D3 . D2 . D3 . D2 . D3 . D2 . D3 ."), line("G1 . G2 . G1 . G2 . G1 . G2 . G1 . G2 ."), line("C2 . C3 . C2 . C3 . C2 . C3 . C2 . C3 ."), line("A1 . A2 . A1 . A2 . A1 . A2 . E2 . E3 .")],
    bassLen: 0.9,
    chords: { inst: "pad", prog: [chord("D4", "F4", "A4", "C5"), chord("D4", "F4", "G4", "B4"), chord("C4", "E4", "G4", "B4"), chord("C4", "E4", "A4", "C5")], hits: [[0, 16]], peak: 0.03 },
    lead: {
      inst: "ep",
      bars: [line(". . A5 . . . A5 . C6 . . . A5 . . ."), line(". . G5 . . . G5 . B5 . . . G5 . . ."), line(". . E5 . . . G5 . E5 . . . C5 . . ."), line(". . E5 . . . E5 . C5 . . . E5 . . .")],
      len: 1,
      peak: 0.06,
    },
    gain: 0.85,
  },
  funk: {
    bpm: 104,
    kick: v("x..x...x..x....."),
    snare: v("....x..-.-..x..-"),
    hat: v("xoxoxoxoxoxoxoxo"),
    bass: [line("E2 . . E3 . . G2 . A2 . B2 . . D3 E2 ."), line("E2 . . E3 . . G2 . A2 . B2 . . D3 E2 ."), line("A2 . . A3 . . C3 . D3 . E3 . . G2 A2 ."), line("B1 . . B2 . . D2 . E2 . F#2 . . A2 B1 .")],
    bassLen: 0.7,
    chords: { inst: "pluck", prog: [chord("E4", "G4", "B4", "D5"), chord("E4", "G4", "B4", "D5"), chord("A3", "C4", "E4", "G4"), chord("B3", "D4", "F#4", "A4")], hits: [[2, 1], [5, 1], [9, 1], [14, 1]], peak: 0.07 },
    gain: 0.85,
  },
  calypso: {
    bpm: 112,
    kick: v("x.....x.x.....x."),
    tom: v("...o.......o...."),
    snare: v("....-.......-..."),
    shaker: v("xoxoxoxoxoxoxoxo"),
    bass: [line("C2 . . G2 . . C2 . E2 . . G2 . . C2 ."), line("F2 . . C3 . . F2 . A2 . . C3 . . F2 ."), line("G2 . . D3 . . G2 . B2 . . D3 . . G2 ."), line("C2 . . G2 . . C2 . E2 . . G2 . . C2 .")],
    bassLen: 1.6,
    lead: {
      inst: "steel",
      bars: [
        line("E5 . G5 . C6 . . G5 . . E5 . G5 . A5 ."),
        line("A5 . . F5 . . C5 . F5 . A5 . . G5 . ."),
        line("D5 . G5 . B5 . . D6 . . B5 . G5 . A5 ."),
        line("G5 . E5 . C5 . . E5 . . G5 . . . . ."),
      ],
      len: 1.5,
      peak: 0.15,
    },
    chords: { inst: "steel", prog: [chord("C4", "E4", "G4"), chord("F4", "A4", "C5"), chord("G4", "B4", "D5"), chord("C4", "E4", "G4")], hits: [[2, 1], [6, 1], [10, 1], [14, 1]], peak: 0.05 },
    gain: 0.9,
  },
  electro: {
    bpm: 128,
    kick: v("x...x...x...x..."),
    clap: v("....x.......x..."),
    hat: v("..x...x...x...x."),
    shaker: v("o-o-o-o-o-o-o-o-"),
    bass: [line(". A1 A1 A1 . A1 A1 A1 . A1 A1 A1 . A1 A1 A1"), line(". F1 F1 F1 . F1 F1 F1 . F1 F1 F1 . F1 F1 F1"), line(". C2 C2 C2 . C2 C2 C2 . C2 C2 C2 . C2 C2 C2"), line(". G1 G1 G1 . G1 G1 G1 . G1 G1 G1 . G1 G1 G1")],
    bassLen: 0.7,
    lead: {
      inst: "lead",
      bars: [line("A4 C5 E5 A5 E5 C5 A4 C5 E5 A5 E5 C5 A4 C5 E5 G5"), line("F4 A4 C5 F5 C5 A4 F4 A4 C5 F5 C5 A4 F4 A4 C5 E5"), line("C5 E5 G5 C6 G5 E5 C5 E5 G5 C6 G5 E5 C5 E5 G5 B5"), line("G4 B4 D5 G5 D5 B4 G4 B4 D5 G5 D5 B4 G4 B4 D5 F#5")],
      len: 0.8,
      peak: 0.045,
    },
    chords: { inst: "pad", prog: [chord("A3", "C4", "E4"), chord("F3", "A3", "C4"), chord("C4", "E4", "G4"), chord("G3", "B3", "D4")], hits: [[0, 16]], peak: 0.028 },
    gain: 0.85,
  },
  hiphop: {
    bpm: 90,
    swing: 0.16,
    kick: v("x......x..x....."),
    snare: v("....x.......x..."),
    hat: v("x.o.x.o.x.o.x.oo"),
    bass: [line("D2 . . . . . . . . . D2 . . . . ."), line("G1 . . . . . . . . . G1 . . . . ."), line("C2 . . . . . . . . . C2 . . . . ."), line("A1 . . . . . . . E2 . . . A1 . . .")],
    bassLen: 4,
    chords: { inst: "ep", prog: [chord("F3", "A3", "C4", "E4"), chord("F3", "A3", "B3", "E4"), chord("E3", "G3", "B3", "D4"), chord("E3", "G3", "C4", "E4")], hits: [[0, 6], [10, 4]], peak: 0.06 },
    gain: 0.9,
  },
  /** A late-night comedy club: brushes, a walking bass, Rhodes comping a ii-V-I. */
  lounge: {
    bpm: 112,
    swing: 0.22,
    kick: v("-.......-......."),
    snare: v("....-.......-..."),
    hat: v("o...o.-.o...o.-."),
    bass: [line("D2 . . . F2 . . . A2 . . . C3 . . ."), line("G1 . . . B1 . . . D2 . . . F2 . . ."), line("C2 . . . E2 . . . G2 . . . B2 . . ."), line("A1 . . . C#2 . . . E2 . . . G2 . . .")],
    bassLen: 0.85,
    chords: {
      inst: "ep",
      prog: [chord("F3", "A3", "C4", "E4"), chord("F3", "A3", "B3", "E4"), chord("E3", "G3", "B3", "D4"), chord("C#3", "G3", "B3", "E4")],
      hits: [
        [3, 2],
        [10, 3],
      ],
      peak: 0.05,
    },
    gain: 0.6,
  },
  lofi: {
    bpm: 78,
    swing: 0.2,
    kick: v("x.........o....."),
    snare: v("....o.......o..."),
    hat: v("-.-.-.-.-.-.-.--"),
    bass: [line("F2 . . . . . . . . . . . . . . ."), line("E2 . . . . . . . . . . . . . . ."), line("D2 . . . . . . . . . . . . . . ."), line("C2 . . . . . . . . . . . . . . .")],
    bassLen: 10,
    chords: { inst: "ep", prog: [chord("A3", "C4", "E4", "G4"), chord("G3", "B3", "D4", "E4"), chord("F3", "A3", "C4", "E4"), chord("E3", "G3", "B3", "D4")], hits: [[0, 14]], peak: 0.05 },
    crackle: true,
    gain: 0.4,
  },
};

export type GrooveHandle = { stop: (fade?: number) => void; stopAt: (perfMs: number) => void; id: GrooveId; startedPerf: number; beatMs: number };

/**
 * Play a groove. `startPerf` (performance.now() ms) lets several phones share a downbeat; a
 * groove that "started" in the past joins on the next step of the same grid.
 */
export function startGroove(id: GrooveId, opts: { startPerf?: number; volume?: number } = {}): GrooveHandle | null {
  const b = bus();
  if (!b) return null;
  const s = GROOVES[id];
  const stepS = 60 / s.bpm / 4;
  const out = b.c.createGain();
  out.gain.value = s.gain * (opts.volume ?? 1);
  out.connect(b.music);
  const startPerf = opts.startPerf ?? performance.now() + 80;
  const originCtx = ctxTimeAt(b, startPerf);
  let step = 0;
  const now = b.c.currentTime;
  if (originCtx < now + 0.02) {
    step = Math.ceil((now + 0.03 - originCtx) / stepS);
  }
  let nextTime = originCtx + step * stepS;
  let stopCtx = Infinity;
  let dead = false;
  const timer = window.setInterval(() => {
    if (dead) return;
    const horizon = b.c.currentTime + 0.14;
    while (nextTime < horizon) {
      if (nextTime >= stopCtx) {
        finish();
        return;
      }
      const swing = step % 2 === 1 ? (s.swing ?? 0) * stepS : 0;
      playStep(b, s, step, nextTime + swing, stepS, out);
      step++;
      nextTime = originCtx + step * stepS;
    }
  }, 25);
  function finish() {
    dead = true;
    window.clearInterval(timer);
    window.setTimeout(() => out.disconnect(), 2500);
  }
  const handle: GrooveHandle = {
    id,
    startedPerf: startPerf,
    beatMs: (60 / s.bpm) * 1000,
    stop(fade = 0.02) {
      if (dead) return;
      const t = b.c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, fade);
      stopCtx = t;
      finish();
    },
    stopAt(perfMs: number) {
      if (dead) return;
      const t = Math.max(b.c.currentTime, ctxTimeAt(b, perfMs));
      stopCtx = t;
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.setTargetAtTime(0, t, 0.012);
      window.setTimeout(() => finish(), Math.max(0, perfMs - performance.now()) + 200);
    },
  };
  return handle;
}

/** One sixteenth of a groove at audio time `t` (a 4-bar loop: `step` counts on from 0). */
export function playStep(b: Bus, s: Style, step: number, t: number, stepS: number, dest: AudioNode) {
  const i = step % 16;
  const bar = Math.floor(step / 16) % 4;
  const o = { at: t, abs: true, dest };
  if (s.kick?.[i]) kick(b, { ...o, peak: 0.75 * s.kick[i] });
  if (s.snare?.[i]) snare(b, { ...o, peak: 0.3 * s.snare[i] });
  if (s.clap?.[i]) clap(b, { ...o, peak: 0.24 * s.clap[i] });
  if (s.hat?.[i]) hat(b, { ...o, peak: 0.08 * s.hat[i] });
  if (s.ohat?.[i]) hat(b, { ...o, open: true, peak: 0.06 * s.ohat[i] });
  if (s.shaker?.[i]) shaker(b, { ...o, peak: 0.06 * s.shaker[i] });
  if (s.tom?.[i]) tom(b, { ...o, peak: 0.3 * s.tom[i], pitch: 1.3 });
  const bn = s.bass?.[bar]?.[i];
  if (bn != null) note(b, "bass", { ...o, f: midiHz(bn), dur: stepS * (s.bassLen ?? 1.2), peak: 0.22 });
  if (s.chords) {
    for (const [at, len] of s.chords.hits) {
      if (at === i) for (const n of s.chords.prog[bar]) note(b, s.chords.inst, { ...o, f: midiHz(n), dur: stepS * len, peak: s.chords.peak });
    }
  }
  const ln = s.lead?.bars[bar]?.[i];
  if (s.lead && ln != null) note(b, s.lead.inst, { ...o, f: midiHz(ln), dur: stepS * (s.lead.len ?? 1), peak: s.lead.peak });
  if (s.crackle && Math.random() < 0.5) burst(b, { ...o, at: t + Math.random() * stepS, dur: 0.001, decay: 0.004, type: "highpass", f: 3000 + Math.random() * 4000, q: 0.7, peak: 0.02 + Math.random() * 0.03, wet: 0 });
}

/* ---------------- background: the night's set ---------------- */

// The music around the site is a set of original songs in different styles (lib/nightset.ts),
// livelier than the lofi loop it replaced (Steve 2026-11-05). Each visit shuffles them; each song
// plays an intro, the groove, a break that rolls into the drop, and an outro that rolls into the
// next song. The songs download when the music first starts, not with this file.
type NightSet = typeof import("./nightset");
let nightset: Promise<NightSet> | null = null;
const loadSet = () => (nightset ??= import("./nightset"));

type SetPlayer = { stop: (fade?: number) => void };
let background: SetPlayer | null = null;
let wanted = false;
let holds = 0;
/** this visit's order, and where in it we are, so the set goes on after a game had the speaker */
let order: number[] = [];
let at = -1;
/** the set's level on the music bus: these songs are busier than the lofi loop (0.4 x 0.8) was */
const SET_VOLUME = 0.42;

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The last half bar before a drop or the next song: the drums give way to a snare roll. */
function roll(b: Bus, i: number, t: number, dest: AudioNode) {
  if (i < 8 || (i < 12 && i % 2 === 1)) return;
  snare(b, { at: t, abs: true, dest, peak: 0.1 + 0.03 * (i - 8) });
}

const DRUMS = ["kick", "snare", "clap", "tom"] as const;

/**
 * The set's playhead: which song, section and step, and when the next step falls. `until` puts
 * every step before `horizon` (audio-clock seconds) on the clock; `pick` chooses each next song
 * (the visit's shuffled order; a test renders the songs in turn).
 */
export function setCursor(m: NightSet, b: Bus, dest: AudioNode, startAt: number, pick: () => number) {
  let song = m.SONGS[0].style;
  let stepS = 0;
  let sec = 0;
  let loop = 0;
  let step = 0;
  let style = song;
  let fill = song;
  const enter = () => {
    style = m.sectionStyle(song, m.FORM[sec]);
    fill = m.sectionStyle(style, { loops: 0, mute: [...DRUMS] });
  };
  const next = () => {
    song = m.SONGS[pick()].style;
    stepS = 60 / song.bpm / 4;
    sec = 0;
    loop = 0;
    step = 0;
    enter();
  };
  next();
  let nextTime = startAt;
  return {
    until(horizon: number) {
      while (nextTime < horizon) {
        const section = m.FORM[sec];
        const swing = step % 2 === 1 ? (song.swing ?? 0) * stepS : 0;
        const t = nextTime + swing;
        if (section.crash && loop === 0 && step === 0) crash(b, { at: t, abs: true, dest, peak: 0.1, decay: 1.2 });
        if (section.fill && loop === section.loops - 1 && step >= 56) {
          playStep(b, fill, step, t, stepS, dest);
          roll(b, step % 16, t, dest);
        } else playStep(b, style, step, t, stepS, dest);
        nextTime += stepS;
        if (++step === 64) {
          step = 0;
          if (++loop === section.loops) {
            loop = 0;
            if (++sec === m.FORM.length) next();
            else enter();
          }
        }
      }
    },
  };
}

function playSet(m: NightSet): SetPlayer | null {
  const b = bus();
  if (!b) return null;
  if (order.length !== m.SONGS.length) order = shuffled(m.SONGS.length);
  const out = b.c.createGain();
  out.gain.value = SET_VOLUME;
  out.connect(b.music);
  const cursor = setCursor(m, b, out, b.c.currentTime + 0.08, () => order[(at = (at + 1) % order.length)]);
  let dead = false;
  const timer = window.setInterval(() => {
    if (!dead) cursor.until(b.c.currentTime + 0.14);
  }, 25);
  return {
    stop(fade = 0.02) {
      if (dead) return;
      dead = true;
      window.clearInterval(timer);
      try {
        const t = b.c.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0, t, fade);
      } catch {
        /* a context being replaced */
      }
      window.setTimeout(() => out.disconnect(), 2500);
    },
  };
}

// a context an iPhone wouldn't bring back is replaced (engine.ts): the set starts again on the new one
onAudioReset(() => {
  if (!background) return;
  background.stop(0);
  background = null;
  if (wanted && !holds) startBackground();
});

export function startBackground() {
  wanted = true;
  if (background || holds > 0) return;
  void loadSet()
    .then((m) => {
      if (wanted && !holds && !background) background = playSet(m);
    })
    .catch(() => {
      nightset = null; // offline: the next start tries again
    });
}

export function stopBackground() {
  wanted = false;
  background?.stop(0.4);
  background = null;
}

/**
 * A screen with its own soundtrack (the Punchline show, the big screen) silences the lounge
 * music while it is up; the music comes back when the last such screen goes away.
 */
export function holdBackground(): () => void {
  holds += 1;
  background?.stop(0.6);
  background = null;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (!holds && wanted) startBackground();
  };
}

/* ---------------- melodies ---------------- */

/** [midi note (0 = rest), beats] */
export type Melody = [number, number][];

export type TuneHandle = { stop: () => void; seconds: number };

/** Play a melody on an instrument; `notes` limits it to the first n notes (Name That Tune clips). */
export function playMelody(mel: Melody, opts: { bpm?: number; inst?: Inst; notes?: number; startPerf?: number; transpose?: number; volume?: number } = {}): TuneHandle | null {
  const b = bus();
  if (!b) return null;
  const bpm = opts.bpm ?? 110;
  const beat = 60 / bpm;
  const out = b.c.createGain();
  out.gain.value = opts.volume ?? 1;
  out.connect(b.music);
  let t = Math.max(b.c.currentTime + 0.05, opts.startPerf ? ctxTimeAt(b, opts.startPerf) : 0);
  const t0 = t;
  let count = 0;
  for (const [n, beats] of mel) {
    if (opts.notes !== undefined && count >= opts.notes) break;
    const dur = beats * beat;
    if (n > 0) {
      note(b, opts.inst ?? "musicbox", { at: t, abs: true, dest: out, f: midiHz(n + (opts.transpose ?? 0)), dur: Math.max(0.12, dur * 0.95), peak: 0.2 });
      count++;
    }
    t += dur;
  }
  const seconds = t - t0;
  let stopped = false;
  return {
    seconds,
    stop() {
      if (stopped) return;
      stopped = true;
      out.gain.setTargetAtTime(0, b.c.currentTime, 0.03);
      window.setTimeout(() => out.disconnect(), 600);
    },
  };
}
