// A small Standard MIDI File writer, and the helpers the score uses: note names, swing, a steady
// random for the players' small unevenness (the same every time the score is made).

export const PPQ = 960;

/** MIDI note number from a name: "C4" is 60, "F#3" 54, "Bb5" 82. */
export function note(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + base + acc;
}

/** Pitch class of a name without octave: "F#" is 6. */
export function pc(name) {
  return ((note(`${name}4`) % 12) + 12) % 12;
}

/** A steady random in [0, 1), from a seed (mulberry32). */
export function rng(seed) {
  let a = typeof seed === "string" ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0 : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Swing: an eighth note on the "and" of a beat comes late, at `ratio` of the beat instead of half
 * way (2:1 is 0.667; 1930s swing sits a little lighter). Only the "and" moves: triplets, grace notes
 * and sixteenths stay where they're written.
 */
export function swing(beats, ratio) {
  const i = Math.floor(beats + 1e-9);
  const f = beats - i;
  return Math.abs(f - 0.5) < 1e-6 ? i + ratio : beats;
}

const vlq = (n) => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];

/**
 * One track's events, each { tick, data: [bytes] } (a meta event's data starts with 0xff), written
 * in order of time; at the same tick a note-off comes before a note-on.
 */
function track(events) {
  const order = (e) => (e.data[0] === 0xff ? 0 : (e.data[0] & 0xf0) === 0xb0 || (e.data[0] & 0xf0) === 0xc0 ? 1 : (e.data[0] & 0xf0) === 0x80 ? 2 : (e.data[0] & 0xf0) === 0xe0 ? 3 : 4);
  const sorted = [...events].sort((a, b) => a.tick - b.tick || order(a) - order(b));
  const bytes = [];
  let last = 0;
  for (const e of sorted) {
    bytes.push(...vlq(Math.max(0, e.tick - last)), ...e.data);
    last = Math.max(last, e.tick);
  }
  bytes.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(bytes.length), ...bytes];
}

/**
 * A type-1 MIDI file: a tempo track, then a track per part. A part is { ch, program, bank?, cc: {num: value},
 * notes: [{ at, len, n, v }] (in beats, already swung and nudged), bends: [{ at, value }] }.
 */
export function midiFile(parts, bpm) {
  const usPerBeat = Math.round(60_000_000 / bpm);
  const tempo = track([
    { tick: 0, data: [0xff, 0x51, 3, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255] },
    { tick: 0, data: [0xff, 0x58, 4, 4, 2, 24, 8] },
  ]);
  const tracks = parts.map((p) => {
    const ch = p.ch;
    const ev = [];
    if (p.bank !== undefined) ev.push({ tick: 0, data: [0xb0 | ch, 0, p.bank] });
    ev.push({ tick: 0, data: [0xc0 | ch, p.program] });
    for (const [num, value] of Object.entries(p.cc ?? {})) ev.push({ tick: 0, data: [0xb0 | ch, Number(num), value] });
    for (const c of p.ccs ?? []) ev.push({ tick: Math.max(1, Math.round(c.at * PPQ)), data: [0xb0 | ch, c.num, c.value] });
    for (const b of p.bends ?? []) {
      const v = Math.max(0, Math.min(16383, Math.round(b.value)));
      ev.push({ tick: Math.max(1, Math.round(b.at * PPQ)), data: [0xe0 | ch, v & 0x7f, (v >> 7) & 0x7f] });
    }
    for (const n of p.notes) {
      const on = Math.max(1, Math.round(n.at * PPQ));
      const off = Math.max(on + 1, Math.round((n.at + n.len) * PPQ));
      const v = Math.max(1, Math.min(127, Math.round(n.v)));
      ev.push({ tick: on, data: [0x90 | ch, n.n, v] }, { tick: off, data: [0x80 | ch, n.n, 0] });
    }
    return track(ev);
  });
  const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(tracks.length + 1), ...u16(PPQ)];
  return Uint8Array.from([...head, ...tempo, ...tracks.flat()]);
}
