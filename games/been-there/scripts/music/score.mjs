// 到此一游's music, written for the game: "Boarding Call", a medium swing in the style of a 1930s
// small band (clarinet, muted trumpet, piano, rhythm guitar, upright bass, brushes), and its ending
// for the results. Everything here is the score; scripts/music.mjs turns it into sound.
//
// The theme is two choruses of a 32-bar AABA tune in F, 64 bars at 125 a minute (122.88 s), written
// to go round: the end of the second chorus turns back into the first. 125 a minute makes a beat
// 0.48 s, a whole number of samples at 44.1 and 48 kHz and of milliseconds, so the loop is exact.
//
// Chorus 1: the clarinet plays the tune (the bass in two, the brushes swirling), the muted trumpet
//   takes the bridge over the clarinet's long notes, both play the last eight.
// Chorus 2: the piano takes sixteen bars (the bass walks, the ride comes in), the clarinet the bridge
//   with more notes, and the last eight is the shout: clarinet and trumpet together, louder.
import { note, pc, rng, swing } from "./midi.mjs";

export const BPM = 125;
/** Where the "and" of a beat falls (0.5 is straight, 0.667 a full triplet swing). */
export const SWING = 0.64;
export const BEAT_S = 60 / BPM;

// ---------- harmony ----------

/** Each chord's root, third, seventh (or sixth), fifth and a colour tone, as pitch classes. */
const CHORDS = {
  F6: { root: "F", third: "A", seventh: "D", fifth: "C", color: "G" },
  D7: { root: "D", third: "F#", seventh: "C", fifth: "A", color: "E" },
  Gm7: { root: "G", third: "Bb", seventh: "F", fifth: "D", color: "A" },
  C7: { root: "C", third: "E", seventh: "Bb", fifth: "G", color: "D" },
  Am7: { root: "A", third: "C", seventh: "G", fifth: "E", color: "D" },
  Bb7: { root: "Bb", third: "D", seventh: "Ab", fifth: "F", color: "C" },
  A7: { root: "A", third: "C#", seventh: "G", fifth: "E", color: "B" },
  G7: { root: "G", third: "B", seventh: "F", fifth: "D", color: "A" },
};
const chordPcs = (sym) => {
  const c = CHORDS[sym];
  return { root: pc(c.root), third: pc(c.third), seventh: pc(c.seventh), fifth: pc(c.fifth), color: pc(c.color) };
};

/** One 8-bar A section's chords, bar by bar: [chord] or [first half, second half]; `end` is its last two bars. */
const A_BODY = [["F6"], ["D7"], ["Gm7"], ["C7"], ["Am7", "D7"], ["Gm7", "C7"]];
const A1_END = [["F6", "D7"], ["Gm7", "C7"]];
const A2_END = [["F6", "Bb7"], ["F6"]];
/** The last A of a chorus turns round into the next: F6 for two beats, then Gm7 and C7 a beat each. */
const A3_END = [["F6", "Bb7"], ["F6", "F6", "Gm7", "C7"]];
const BRIDGE = [["A7"], ["A7"], ["D7"], ["D7"], ["G7"], ["G7"], ["C7"], ["C7"]];
const CHORUS = [...A_BODY, ...A1_END, ...A_BODY, ...A2_END, ...BRIDGE, ...A_BODY, ...A3_END];

/** The theme's chords: [{ at (beats from the start), len, sym }]. */
export function chart(choruses = 2) {
  const out = [];
  for (let c = 0; c < choruses; c++)
    CHORUS.forEach((bar, b) => {
      const len = 4 / bar.length;
      bar.forEach((sym, k) => out.push({ at: (c * 32 + b) * 4 + k * len, len, sym, bar: c * 32 + b }));
    });
  // (merge the turnaround's two F6 beats into one chord of two beats)
  return out.reduce((acc, ch) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.sym === ch.sym && prev.bar === ch.bar) prev.len += ch.len;
    else acc.push({ ...ch });
    return acc;
  }, []);
}

const chordAt = (ch, beat) => ch.find((c) => beat >= c.at - 1e-9 && beat < c.at + c.len - 1e-9) ?? ch[ch.length - 1];

// ---------- the tune ----------

/** A bar of melody: [beat, length, note name or names] (beats from the bar's start, unswung). */
const RIFF = [
  // bar 1, F6: the riff climbs to F and comes back
  [[0.5, 0.5, "A4"], [1, 0.5, "C5"], [1.5, 0.5, "D5"], [2, 1, "F5"], [3, 0.5, "D5"], [3.5, 0.5, "C5"]],
  // bar 2, D7: and settles
  [[0, 1.5, "A4"], [1.5, 0.5, "G4"], [2, 1, "F#4"]],
  // bar 3, Gm7: the riff again, a step higher
  [[0.5, 0.5, "Bb4"], [1, 0.5, "D5"], [1.5, 0.5, "F5"], [2, 1, "G5"], [3, 0.5, "F5"], [3.5, 0.5, "D5"]],
  // bar 4, C7
  [[0, 1.5, "E5"], [1.5, 0.5, "D5"], [2, 1, "C5"], [3.5, 0.5, "C5"]],
  // bar 5, Am7 D7: up to the top
  [[0, 0.5, "E5"], [0.5, 0.5, "G5"], [1, 0.5, "A5"], [1.5, 0.5, "G5"], [2, 1, "F#5"], [3, 0.5, "E5"], [3.5, 0.5, "D5"]],
  // bar 6, Gm7 C7: down, and turning back up
  [[0, 1, "D5"], [1, 0.5, "Bb4"], [1.5, 0.5, "G4"], [2, 0.5, "Bb4"], [2.5, 0.5, "C5"], [3, 1, "E5"]],
];
const A1_TUNE_END = [
  // F6 D7
  [[0, 1.5, "F5"], [1.5, 0.5, "D5"], [2, 1, "C5"]],
  // Gm7 C7
  [[0, 1, "Bb4"], [1, 0.5, "A4"], [1.5, 0.5, "G4"], [2, 1, "E4"]],
];
const A2_TUNE_END = [
  // F6 Bb7: the blue seventh on the way down
  [[0, 1, "F5"], [1, 0.5, "D5"], [1.5, 0.5, "C5"], [2, 1, "Ab4"], [3, 1, "F4"]],
  // F6
  [[0, 2.5, "A4"]],
];
const A3_TUNE_END = [A2_TUNE_END[0], [[0, 2, "A4"]]];

/** The bridge: a figure that goes round the cycle of dominants, each two bars a fifth lower. */
const BRIDGE_TUNE = [
  [[0.5, 0.5, "E5"], [1, 0.5, "C#5"], [1.5, 0.5, "E5"], [2, 1.5, "G5"], [3.5, 0.5, "E5"]],
  [[0, 2, "C#5"], [2, 1, "A4"]],
  [[0.5, 0.5, "A4"], [1, 0.5, "F#4"], [1.5, 0.5, "A4"], [2, 1.5, "C5"], [3.5, 0.5, "A4"]],
  [[0, 2, "D5"], [2, 0.5, "C5"], [2.5, 0.5, "A4"], [3, 1, "F#4"]],
  [[0.5, 0.5, "D5"], [1, 0.5, "B4"], [1.5, 0.5, "D5"], [2, 1.5, "F5"], [3.5, 0.5, "D5"]],
  [[0, 2, "B4"], [2, 1, "G4"]],
  [[0.5, 0.5, "G4"], [1, 0.5, "Bb4"], [1.5, 0.5, "C5"], [2, 1, "E5"], [3, 1, "G5"]],
  [[0, 1.5, "E5"], [1.5, 0.5, "D5"], [2, 1, "C5"], [3, 0.5, "Bb4"], [3.5, 0.5, "G4"]],
];

/** The bridge again in the second chorus, the clarinet's own way: more notes, the same shape. */
const BRIDGE_TUNE_2 = [
  [[0, 0.5, "A4"], [0.5, 0.5, "C#5"], [1, 0.5, "E5"], [1.5, 0.5, "G5"], [2, 1, "A5"], [3, 0.5, "G5"], [3.5, 0.5, "E5"]],
  [[0, 1.5, "C#5"], [1.5, 0.5, "D5"], [2, 0.5, "C#5"], [2.5, 0.5, "A4"]],
  [[0, 0.5, "F#4"], [0.5, 0.5, "A4"], [1, 0.5, "C5"], [1.5, 0.5, "D5"], [2, 1, "F#5"], [3, 0.5, "E5"], [3.5, 0.5, "D5"]],
  [[0, 1.5, "C5"], [1.5, 0.5, "A4"], [2, 1, "F#4"], [3.5, 0.5, "B4"]],
  [[0, 0.5, "D5"], [0.5, 0.5, "F5"], [1, 0.5, "G5"], [1.5, 0.5, "F5"], [2, 1, "D5"], [3, 0.5, "B4"], [3.5, 0.5, "D5"]],
  [[0, 2, "F5"], [2, 0.5, "D5"], [2.5, 0.5, "B4"], [3, 1, "G4"]],
  [[0, 0.5, "Bb4"], [0.5, 0.5, "C5"], [1, 0.5, "E5"], [1.5, 0.5, "G5"], [2, 1, "Bb5"], [3, 1, "G5"]],
  [[0, 1, "E5"], [1, 0.5, "G5"], [1.5, 0.5, "E5"], [2, 0.5, "D5"], [2.5, 0.5, "C5"], [3, 0.5, "Bb4"], [3.5, 0.5, "G4"]],
];

/** Sixteen bars of piano, over the two A sections of the second chorus. */
const PIANO_SOLO = [
  // F6: up the chord, a C held across the beat
  [[0.5, 0.5, "F5"], [1, 0.5, "A5"], [1.5, 0.5, "C6"], [2, 0.5, "D6"], [2.5, 1, "C6"], [3.5, 0.5, "A5"]],
  // D7
  [[0, 0.5, "F#5"], [0.5, 0.5, "A5"], [1, 0.5, "C6"], [1.5, 0.5, "A5"], [2, 1, "F#5"], [3, 0.5, "E5"], [3.5, 0.5, "D5"]],
  // Gm7: a triplet to start
  [[0, 1 / 3, "D5"], [1 / 3, 1 / 3, "F5"], [2 / 3, 1 / 3, "G5"], [1, 1, "Bb5"], [2, 0.5, "A5"], [2.5, 0.5, "G5"], [3, 0.5, "F5"], [3.5, 0.5, "D5"]],
  // C7
  [[0, 0.5, "E5"], [0.5, 0.5, "G5"], [1, 0.5, "Bb5"], [1.5, 0.5, "A5"], [2, 1, "G5"], [3, 0.5, "E5"], [3.5, 0.5, "C5"]],
  // Am7 D7: high, short, in octaves, on the offbeats
  [[0.5, 0.25, ["E5", "E6"]], [1.5, 0.25, ["E5", "E6"]], [2.5, 0.25, ["F#5", "F#6"]], [3, 0.25, ["F#5", "F#6"]]],
  // Gm7 C7
  [[0, 0.5, "Bb5"], [0.5, 0.5, "G5"], [1, 0.5, "F5"], [1.5, 0.5, "D5"], [2, 0.5, "E5"], [2.5, 0.5, "G5"], [3, 1, "Bb5"]],
  // F6 D7
  [[0, 1.5, "A5"], [1.5, 0.5, "F5"], [2, 0.5, "F#5"], [2.5, 0.5, "A5"], [3, 0.5, "C6"], [3.5, 0.5, "Eb6"]],
  // Gm7 C7
  [[0, 1, "D6"], [1, 0.5, "Bb5"], [1.5, 0.5, "G5"], [2, 0.5, "E5"], [2.5, 0.5, "G5"], [3, 0.5, "C6"], [3.5, 0.5, "A5"]],
  // F6: the blue third, crushed into the major one
  [[0, 0.25, "Ab5"], [0.25, 0.75, "A5"], [1, 0.5, "F5"], [1.5, 0.5, "D5"], [2, 0.25, "Ab5"], [2.25, 0.75, "A5"], [3, 1, "C6"]],
  // D7
  [[0, 0.5, "C6"], [0.5, 0.5, "A5"], [1, 0.5, "F#5"], [1.5, 0.5, "A5"], [2, 1, "C6"]],
  // Gm7: walking down
  [[0, 0.5, "D6"], [0.5, 0.5, "C6"], [1, 0.5, "Bb5"], [1.5, 0.5, "A5"], [2, 0.5, "G5"], [2.5, 0.5, "F5"], [3, 0.5, "D5"], [3.5, 0.5, "F5"]],
  // C7
  [[0, 1, "E5"], [1, 0.5, "G5"], [1.5, 0.5, "Bb5"], [2, 1, "A5"], [3, 0.5, "G5"], [3.5, 0.5, "E5"]],
  // Am7 D7
  [[0, 0.5, "E5"], [0.5, 0.5, "G5"], [1, 0.5, "C6"], [1.5, 0.5, "E6"], [2, 1, "D6"], [3, 0.5, "C6"], [3.5, 0.5, "A5"]],
  // Gm7 C7
  [[0, 0.5, "Bb5"], [0.5, 0.5, "G5"], [1, 1, "D5"], [2, 0.5, "E5"], [2.5, 0.5, "G5"], [3, 1, "Bb5"]],
  // F6 Bb7
  [[0, 1, "A5"], [1, 0.5, "F5"], [1.5, 0.5, "D5"], [2, 0.5, "Ab5"], [2.5, 0.5, "F5"], [3, 1, "D5"]],
  // F6: and hands back to the clarinet
  [[0, 1, "F5"], [1, 0.5, "A5"], [1.5, 1.5, "C6"]],
];

/** Lay bars of melody from `bar` on: [{ t, d, n: [numbers] }] in beats from the start. */
function lay(bars, bar, opts = {}) {
  const out = [];
  bars.forEach((notes, i) =>
    notes.forEach(([beat, d, names]) =>
      out.push({ t: (bar + i) * 4 + beat, d, n: (Array.isArray(names) ? names : [names]).map(note), ...opts }),
    ),
  );
  return out;
}

const A_TUNE = (end) => [...RIFF, ...end];

/** Each chord's scale, for passing notes (in F: the chord's own sharps and flats). */
const SCALES = {
  F6: ["F", "G", "A", "Bb", "C", "D", "E"],
  D7: ["D", "E", "F#", "G", "A", "Bb", "C"],
  Gm7: ["G", "A", "Bb", "C", "D", "E", "F"],
  C7: ["C", "D", "E", "F", "G", "A", "Bb"],
  Am7: ["A", "Bb", "C", "D", "E", "F", "G"],
  Bb7: ["Bb", "C", "D", "Eb", "F", "G", "Ab"],
  A7: ["A", "B", "C#", "D", "E", "F", "G"],
  G7: ["G", "A", "B", "C", "D", "E", "F"],
};
const scaleOf = (sym) => SCALES[sym].map(pc);
const pcOf = (n) => ((n % 12) + 12) % 12;

/**
 * A second voice under the tune, as a section plays it: on the beat and on long notes the nearest
 * note of the chord at least a minor third below; on the quick notes between, a third below in the
 * chord's scale, so the two move together.
 */
function under(tune, ch) {
  return tune.map((m) => {
    const sym = chordAt(ch, m.t).sym;
    const c = chordPcs(sym);
    const top = m.n[0];
    const strong = Math.abs(m.t % 1) < 1e-6 || m.d >= 1;
    if (strong) {
      const tones = [c.root, c.third, c.seventh, c.fifth];
      let h = top - 3;
      while (h > top - 10 && !tones.includes(pcOf(h))) h--;
      return { ...m, n: [h] };
    }
    const scale = scaleOf(sym);
    // two scale steps down from the tune's note (or from the scale note under it)
    let h = top - 1;
    let steps = scale.includes(pcOf(top)) ? 0 : 1;
    while (steps < 2) {
      if (scale.includes(pcOf(h))) steps++;
      if (steps < 2) h--;
    }
    if (top - h < 3) h -= 1;
    return { ...m, n: [h] };
  });
}

// ---------- the players ----------

/** Velocity and articulation for a line of melody: longer notes held, short ones a little detached, offbeats leaned on. */
function phrase(line, { v = 78, gate = 0.82, swell = 0 } = {}) {
  return line.map((m, i) => {
    const off = Math.abs((m.t % 1) - 0.5) < 1e-6;
    const long = m.d >= 1.5;
    const accent = (off ? 6 : 0) + (long ? 3 : 0) + (m.n[0] > note("F5") ? 3 : 0);
    const next = line[i + 1];
    // (a note followed straight away by the next is played legato into it)
    const joined = next && Math.abs(next.t - (m.t + m.d)) < 1e-6;
    return { ...m, v: v + accent + swell, gate: m.gate ?? (long ? 0.95 : joined ? Math.max(gate, 0.9) : gate) };
  });
}

/** Three-note voicings that move as little as they can from one chord to the next, between `lo` and `hi`. */
function voicer(lo, hi, pick) {
  let prev = null;
  return (sym) => {
    const c = chordPcs(sym);
    const want = pick(c);
    let best = null;
    for (let a = lo; a <= hi; a++) {
      if (((a % 12) + 12) % 12 !== want[0] && ((a % 12) + 12) % 12 !== want[1] && ((a % 12) + 12) % 12 !== want[2]) continue;
      // the notes above the lowest, in order, each the next of the chord's three
      const set = [a];
      for (let k = 1; k < 3; k++) {
        let n = set[k - 1] + 1;
        while (!want.includes(((n % 12) + 12) % 12) || set.some((s) => ((s % 12) + 12) % 12 === ((n % 12) + 12) % 12)) n++;
        set.push(n);
      }
      if (set[2] > hi) continue;
      const cost = prev ? set.reduce((s, n, k) => s + Math.abs(n - prev[k]), 0) : Math.abs(set[1] - (lo + hi) / 2);
      if (!best || cost < best.cost) best = { set, cost };
    }
    prev = best.set;
    return best.set;
  };
}

/** The piano's comping: the chord's third, fifth and seventh (no root: the bass has it), short, on the offbeats and on four. */
function pianoComp(ch, from, to, { v = 54, busy = 0, r }) {
  const voice = voicer(note("F3"), note("Bb4"), (c) => [c.third, c.fifth, c.seventh]);
  const out = [];
  for (const c of ch) {
    if (c.at < from * 4 || c.at >= to * 4) continue;
    const set = voice(c.sym);
    const hits = c.len >= 4 ? (r() < 0.5 ? [1.5, 3] : r() < 0.6 ? [0, 1.5] : [1, 2.5, 3.5]) : c.len >= 2 ? (r() < 0.6 ? [0.5] : [1]) : [0];
    if (busy && c.len >= 4 && r() < busy) hits.push(0);
    for (const h of hits) out.push({ t: c.at + h, d: 0.35, n: set, v: v + (h === 3 ? 4 : 0) + Math.round((r() - 0.5) * 8), gate: 1 });
  }
  return out;
}

/**
 * The guitar's chord shapes, as a 1930s rhythm player holds them on the low strings: the root at the
 * bottom (E2 to E flat 3), the seventh (or sixth) and the third above it, whichever way round moves least.
 */
function guitarVoicer() {
  let prev = null;
  return (sym) => {
    const c = chordPcs(sym);
    let best = null;
    for (let root = note("E2"); root <= note("Eb3"); root++) {
      if (pcOf(root) !== c.root) continue;
      for (const order of [[c.seventh, c.third], [c.third, c.seventh]]) {
        const set = [root];
        for (const p of order) {
          let n = set[set.length - 1] + 1;
          while (pcOf(n) !== p) n++;
          set.push(n);
        }
        if (set[2] > note("D4") || set[2] - set[0] > 17) continue;
        const cost = prev ? set.reduce((s, n, k) => s + Math.abs(n - prev[k]), 0) : Math.abs(set[0] - note("G2"));
        if (!best || cost < best.cost) best = { set, cost };
      }
    }
    prev = best.set;
    return best.set;
  };
}

/** The rhythm guitar: four even strokes a bar, the root low with the seventh (or sixth) and the third. */
function guitar(ch, from, to, r) {
  const voice = guitarVoicer();
  const out = [];
  for (const c of ch) {
    if (c.at < from * 4 || c.at >= to * 4) continue;
    const set = voice(c.sym);
    for (let b = 0; b < c.len; b++) out.push({ t: c.at + b, d: 0.3, n: set, v: ((c.at + b) % 2 === 1 ? 50 : 44) + Math.round((r() - 0.5) * 6), gate: 1 });
  }
  return out;
}

const inRange = (n, lo, hi) => {
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
};
const nearest = (pcN, to, lo, hi) => {
  let best = null;
  for (let n = lo; n <= hi; n++) if (((n % 12) + 12) % 12 === pcN && (best === null || Math.abs(n - to) < Math.abs(best - to))) best = n;
  return best;
};

/**
 * The bass. In two (`walk` false): the root on one, the fifth (or the next chord's root) on three.
 * Walking: a note a beat, the root first, then chord and passing notes towards the next root, which
 * the last beat leads into from a half step away (or from its fifth).
 */
function bass(ch, from, to, walkFrom, r) {
  const LO = note("E1");
  const HI = note("D3");
  const out = [];
  let last = note("F2");
  let carry = null;
  const cs = ch.filter((c) => c.at >= from * 4 && c.at < to * 4);
  cs.forEach((c) => {
    const next = ch[ch.indexOf(c) + 1] ?? ch[0];
    const p = chordPcs(c.sym);
    const root = nearest(p.root, last, LO, HI);
    const walk = c.at >= walkFrom * 4;
    if (!walk) {
      // in two
      const two = c.len >= 4 ? [root, nearest(p.fifth, root - 3, LO, HI)] : [root];
      two.forEach((n, k) => out.push({ t: c.at + k * 2, d: 1.9, n: [n], v: 78 - k * 4 + Math.round((r() - 0.5) * 8), gate: 1 }));
      // a pickup into the next bar now and then
      if (c.len >= 4 && r() < 0.3) {
        const target = nearest(chordPcs(next.sym).root, root, LO, HI);
        out.push({ t: c.at + 3.5, d: 0.45, n: [target + (r() < 0.5 ? -1 : 1)], v: 66, gate: 1 });
      }
      last = two[two.length - 1];
      return;
    }
    // Two bars of one chord walk as one line: the first heads for the chord's third or fifth,
    // which starts the second, instead of going back to the root.
    const start = carry ?? root;
    carry = null;
    let target;
    if (next.sym === c.sym && c.len >= 4) {
      target = nearest(r() < 0.5 ? p.fifth : p.third, start + (start < note("A1") ? 7 : start > note("A2") ? -7 : r() < 0.5 ? 7 : -7), LO + 2, HI - 2);
      carry = target;
    } else target = nearest(chordPcs(next.sym).root, start, LO + 2, HI - 2);
    const line = walkLine(c.sym, start, target, Math.round(c.len), r, LO, HI);
    line.forEach((n, k) => out.push({ t: c.at + k, d: 0.9, n: [n], v: (k === 0 ? 82 : 74) + Math.round((r() - 0.5) * 10), gate: 1 }));
    last = line[line.length - 1];
  });
  return out;
}

/**
 * A walking line over one chord, `beats` long, from `start` (its root, mostly) towards `target`:
 * every line of chord and scale notes is tried and the best wins. A chord note on three, the last
 * note leading into the target from a half step or a step away, or from its fifth; no note twice
 * in a bar, no leap over a fifth, a line that goes somewhere and turns now and then.
 */
function walkLine(sym, start, target, beats, r, LO, HI) {
  if (beats <= 1) return [start];
  const c = chordPcs(sym);
  const tones = [c.root, c.third, c.fifth, c.seventh];
  const scale = scaleOf(sym);
  const span = (from) => {
    const out = [];
    for (let n = from - 7; n <= from + 7; n++) if (n >= LO && n <= HI && n !== from && (tones.includes(pcOf(n)) || scale.includes(pcOf(n)))) out.push(n);
    return out;
  };
  const leads = [target - 1, target + 1, target - 2, target + 2, target - 5, target + 7].filter((n) => n >= LO && n <= HI && n !== start);
  let best = null;
  const tryLine = (line) => {
    if (new Set(line).size < line.length) return;
    let cost = 0;
    for (let k = 1; k < line.length; k++) {
      const step = Math.abs(line[k] - line[k - 1]);
      if (step > 7) return;
      cost += step <= 2 ? 0 : step <= 4 ? 0.8 : 2.5;
      // beats two and three of four: chord notes are best; on three, not the root again
      if (k < line.length - 1 && !tones.includes(pcOf(line[k]))) cost += k === 2 ? 2.5 : 1;
      if (k === 2 && pcOf(line[k]) === c.root) cost += 1.5;
    }
    const lead = line[line.length - 1];
    const gap = Math.abs(lead - target);
    if (gap > 7 || gap === 0) return;
    cost += gap === 1 ? 0 : gap === 2 ? 0.8 : 1.2;
    // a line that stays in a corner is dull; one that turns once is a little better than a run
    const hi = Math.max(...line);
    const lo = Math.min(...line);
    if (hi - lo < 4) cost += 1.5;
    const dirs = line.slice(1).map((n, k) => Math.sign(n - line[k]));
    if (line.length >= 4 && dirs.every((d) => d === dirs[0])) cost += 0.4;
    cost += r() * 1.2;
    if (!best || cost < best.cost) best = { line, cost };
  };
  if (beats === 2) for (const l of leads) tryLine([start, l]);
  else if (beats === 3) for (const a of span(start)) for (const l of leads) tryLine([start, a, l]);
  else for (const a of span(start)) for (const b of span(a)) for (const l of leads) tryLine([start, a, b, l]);
  return best ? best.line : [start, ...Array(beats - 1).fill(target - 1)];
}

const KICK = 36;
const TAP = 38;
const SLAP = 39;
const SWIRL = 40;
const PEDAL = 44;
const CRASH = 49;
const RIDE = 51;
const TOM_LO = 45;
const TOM_HI = 47;

/**
 * Brushes. The left hand swirls on every beat; the right taps two and four, or plays the ride's
 * "ding, ding-a ding" once the band warms up; the hi-hat closes on two and four; the bass drum
 * is felt more than heard, four to the bar. A little fill at the end of each eight.
 */
function drums(from, to, rideFrom, r, { shoutFrom = Infinity, crashes = [] } = {}) {
  const out = [];
  const hit = (t, n, v, d = 0.2) => out.push({ t, d, n: [n], v: v + Math.round((r() - 0.5) * 8), gate: 1, straight: Math.abs((t % 1) - 0.5) > 1e-6 && Math.abs(t % 1) > 1e-6 });
  for (let bar = from; bar < to; bar++) {
    const t0 = bar * 4;
    const ride = bar >= rideFrom;
    const shout = bar >= shoutFrom;
    const fill = bar % 8 === 7;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b;
      if (!(fill && b >= 2)) hit(t, SWIRL, ride ? 34 : 44, 0.95);
      hit(t, KICK, b % 2 === 0 ? 28 : 24, 0.3);
      if (b % 2 === 1) hit(t, PEDAL, 54, 0.2);
      if (ride) {
        if (!(fill && b >= 2)) {
          hit(t, RIDE, b % 2 === 1 ? 58 : 48, 0.5);
          if (b % 2 === 1) hit(t + 0.5, RIDE, 40, 0.3);
        }
      } else if (b % 2 === 1 && !(fill && b === 3)) hit(t, TAP, 58, 0.2);
      if (shout && b % 2 === 1 && r() < 0.5) hit(t + 0.5, TAP, 46, 0.2);
    }
    if (fill) {
      // beats three and four: triplets on the snare, then down the toms
      [0, 1 / 3, 2 / 3].forEach((k, i) => hit(t0 + 2 + k, TAP, 50 + i * 6, 0.15));
      hit(t0 + 3, TOM_HI, 60, 0.3);
      hit(t0 + 3 + 1 / 3, SLAP, 52, 0.2);
      hit(t0 + 3 + 2 / 3, TOM_LO, 64, 0.3);
    }
  }
  for (const bar of crashes) if (bar >= from && bar < to) hit(bar * 4, CRASH, 52, 2);
  return out;
}

/** A clarinet's long tones under the bridge: the chords' sevenths and thirds stepping down, G F# F E. */
const BRIDGE_PAD = [[[0, 8, "G4"]], [], [[0, 8, "F#4"]], [], [[0, 8, "F4"]], [], [[0, 7.5, "E4"]], []];

/** The piano's answers where the tune rests (two, three and seven of a section's bars). */
function pianoFills(bars) {
  const out = [];
  for (const bar of bars) {
    const t0 = bar * 4;
    out.push(
      { t: t0 + 3, d: 0.25, n: [note("A5"), note("A6")], v: 62, gate: 1 },
      { t: t0 + 3.5, d: 0.25, n: [note("F#5"), note("F#6")], v: 58, gate: 1 },
    );
  }
  return out;
}

// ---------- the pieces ----------

export const STEMS = {
  clarinet: { ch: 0, program: 71, pan: 46 },
  trumpet: { ch: 1, program: 59, pan: 80 },
  piano: { ch: 2, program: 0, pan: 86 },
  guitar: { ch: 3, program: 26, pan: 36 },
  bass: { ch: 4, program: 32, pan: 64 },
  drums: { ch: 9, program: 40, pan: 68 },
};

/** The theme, one time round: { beats, parts: { stem: [notes] } } (beats unswung, before the players' timing). */
export function theme() {
  const ch = chart(2);
  const r = rng("boarding call");
  const C1 = 0;
  const C2 = 32;
  // chorus 1
  const clarinet = [
    ...phrase(lay(A_TUNE(A1_TUNE_END), C1 + 0)),
    ...phrase(lay(A_TUNE(A2_TUNE_END), C1 + 8)),
    ...phrase(lay(BRIDGE_PAD, C1 + 16), { v: 50, gate: 0.97 }),
    ...phrase(lay(A_TUNE(A3_TUNE_END), C1 + 24), { v: 80 }),
  ];
  const trumpet = [
    ...phrase(lay(BRIDGE_TUNE, C1 + 16), { v: 82 }),
    ...phrase(under(lay(A_TUNE(A3_TUNE_END), C1 + 24), ch), { v: 66 }),
  ];
  // chorus 2: the piano's sixteen, the clarinet's bridge, the shout
  clarinet.push(...phrase(lay(BRIDGE_TUNE_2, C2 + 16), { v: 80 }), ...phrase(lay(A_TUNE(A3_TUNE_END), C2 + 24), { v: 88 }));
  trumpet.push(...phrase(under(lay(A_TUNE(A3_TUNE_END), C2 + 24), ch), { v: 76 }));
  const solo = phrase(lay(PIANO_SOLO, C2 + 0), { v: 74, gate: 0.85 });
  const piano = [
    ...pianoComp(ch, 0, 32, { v: 52, r }),
    ...pianoFills([C1 + 1, C1 + 9, C1 + 25]),
    ...pianoComp(ch, 32, 48, { v: 44, r }),
    ...solo,
    ...pianoComp(ch, 48, 64, { v: 56, busy: 0.4, r }),
  ];
  return {
    beats: 64 * 4,
    parts: {
      clarinet,
      trumpet,
      piano,
      guitar: guitar(ch, 0, 64, r),
      bass: bass(ch, 0, 64, 16, r),
      drums: drums(0, 64, 16, r, { shoutFrom: 56, crashes: [0, 16, 32, 56] }),
    },
  };
}

/**
 * The ending, for the results: two bars of the riff by everyone, three high piano notes in the quiet,
 * and the band's last chord on four, held, with a cymbal. About ten seconds.
 */
export function finale() {
  const r = rng("last call");
  const ch = [
    { at: 0, len: 2, sym: "F6" },
    { at: 2, len: 2, sym: "D7" },
    { at: 4, len: 2, sym: "Gm7" },
    { at: 6, len: 2, sym: "C7" },
    { at: 8, len: 8, sym: "F6" },
  ];
  const tune = phrase(
    lay(
      [
        [[0, 0.5, "C5"], [0.5, 0.5, "D5"], [1, 1, "F5"], [2, 0.5, "F#5"], [2.5, 0.5, "A5"], [3, 1, "C6"]],
        [[0, 1, "Bb5"], [1, 0.5, "G5"], [1.5, 0.5, "E5"], [2, 0.5, "G5"], [2.5, 0.5, "Bb5"], [3, 1, "C6"]],
      ],
      0,
    ),
    { v: 92 },
  );
  // the last chord on four of the third bar, held for the fermata (about 3 s)
  const HOLD = 6.5;
  const last = 11;
  const clarinet = [...tune, { t: last, d: HOLD, n: [note("F5")], v: 96, gate: 1 }];
  const trumpet = [...under(tune, ch).map((m) => ({ ...m, v: m.v - 12 })), { t: last, d: HOLD, n: [note("C5")], v: 86, gate: 1 }];
  const piano = [
    ...pianoComp(ch.slice(0, 4), 0, 2, { v: 60, r }),
    // plink, plink, plink
    { t: 8, d: 0.3, n: [note("A5"), note("A6")], v: 70, gate: 1 },
    { t: 9, d: 0.3, n: [note("C6"), note("C7")], v: 70, gate: 1 },
    { t: 10, d: 0.3, n: [note("F6"), note("F7")], v: 74, gate: 1 },
    { t: last, d: HOLD, n: [note("A3"), note("C4"), note("D4"), note("G4"), note("A4")], v: 78, gate: 1 },
  ];
  const guitarPart = [...guitar(ch.slice(0, 4), 0, 2, r), { t: last, d: HOLD, n: [note("F2"), note("D3"), note("A3"), note("C4")], v: 66, gate: 1 }];
  const bassPart = [...bass(ch.slice(0, 4), 0, 2, 0, r), { t: last, d: HOLD, n: [note("F1")], v: 92, gate: 1 }];
  const kit = [];
  const hit = (t, n, v, d = 0.25) => kit.push({ t, d, n: [n], v, gate: 1, straight: true });
  for (let b = 0; b < 8; b++) {
    hit(b, RIDE, b % 2 ? 62 : 52, 0.5);
    if (b % 2) hit(b + 0.5, RIDE, 44, 0.3), hit(b, PEDAL, 56);
    hit(b, KICK, 30);
  }
  hit(0, CRASH, 64, 2);
  // the quiet bar: just the plinks; then the hit, a roll swelling on the cymbal, and the last stroke
  hit(last, CRASH, 84, 3);
  hit(last, KICK, 76);
  for (let k = 0; k < 18; k++) hit(last + 0.25 + k * 0.25, RIDE, 30 + k * 2, 0.3);
  hit(last + HOLD, CRASH, 96, 3);
  hit(last + HOLD, KICK, 90);
  bassPart.push({ t: last + HOLD, d: 1, n: [note("F1")], v: 100, gate: 1 });
  piano.push({ t: last + HOLD, d: 1.2, n: [note("F2"), note("F3"), note("A3"), note("C4"), note("F4")], v: 88, gate: 1 });
  return { beats: last + HOLD + 6, parts: { clarinet, trumpet, piano, guitar: guitarPart, bass: bassPart, drums: kit } };
}

/**
 * The players' timing: swing on the offbeats, each player's own small unevenness (the clarinet a
 * hair behind the beat, the bass on top of it), the length each note is held. Returns notes in
 * beats from the start: [{ at, len, n, v }].
 */
export function perform(stem, notes, { seed = stem } = {}) {
  const feel = { clarinet: [9, 8], trumpet: [7, 8], piano: [2, 7], guitar: [0, 4], bass: [-3, 4], drums: [0, 3] }[stem];
  const [late, wobble] = feel;
  const r = rng(`${seed}:timing`);
  const out = [];
  for (const m of notes) {
    const start = m.straight ? m.t : swing(m.t, SWING);
    const end = m.straight ? m.t + m.d : swing(m.t + m.d, SWING);
    const ms = late + (r() - 0.5) * 2 * wobble;
    const at = start + ms / 1000 / BEAT_S;
    const len = Math.max(0.05, (end - start) * (m.gate ?? 0.85));
    const vel = m.v + (r() - 0.5) * 6;
    // chords spread a few milliseconds, lowest first
    m.n.forEach((n, k) => out.push({ at: at + (k * 3) / 1000 / BEAT_S, len, n, v: vel - k * 2 }));
  }
  return out;
}
