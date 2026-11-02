/**
 * 打碟 · DJ Booth: the stand-in DJ's songs. A track is the styles' sections played over its own chord
 * progression in A minor, with its own turn on the melody, so the night moves from song to song
 * instead of looping one (Steve's ask on Nov 1). Every part the styles wrote over Am, F, C, G is
 * moved, bar by bar, along the A minor scale onto the track's chords: a shift along the scale keeps
 * everything in key and keeps each line's shape against its chord, and both decks play the track's
 * chords at the same time, so any two styles still blend. Track 0 is the night as written.
 *
 * Pure: no sound, no clock. A track is a number, and everything about it follows from that number
 * (a song asked for by name gets its number from the name: the same words, the same remix).
 */
import { TRACK_MAX, trackFor } from "../../../shared/dj/requests";
import type { Section } from "./sections";

type Notes = (number | null)[];

/** A minor from A: each degree's semitones above A. */
const RELS = [0, 2, 3, 5, 7, 8, 10];
/** The degree each bar of the written loop stands on: Am, F, C, G. */
const WRITTEN = [0, 5, 2, 6];

/** Progressions in A minor, one chord a bar, as degrees (0 is Am, 5 is F, 6 is G …). */
export const PROGS: number[][] = [
  [0, 5, 2, 6], // Am F C G, as written
  [0, 6, 5, 6], // Am G F G
  [5, 6, 0, 0], // F G Am Am
  [0, 3, 6, 2], // Am Dm G C
  [0, 4, 5, 6], // Am Em F G
  [3, 4, 5, 6], // Dm Em F G
  [0, 5, 3, 4], // Am F Dm Em
  [5, 2, 6, 0], // F C G Am
  [0, 2, 6, 5], // Am C G F
  [0, 0, 5, 6], // Am Am F G
  [0, 6, 3, 0], // Am G Dm Am
  [5, 0, 6, 4], // F Am G Em
];

/** A midi note moved `k` steps along A minor (a note off the scale keeps its sharp). */
export function shiftNote(m: number, k: number): number {
  const a = m - 9;
  const oct = Math.floor(a / 12);
  const rel = a - oct * 12;
  let deg = 0;
  for (let i = 0; i < 7; i++) if (RELS[i] <= rel) deg = i;
  const sharp = rel - RELS[deg];
  const s = oct * 7 + deg + k;
  const o2 = Math.floor(s / 7);
  return 9 + o2 * 12 + RELS[s - o2 * 7] + sharp;
}

/** The smallest move along the scale from degree `from` to degree `to`: -3 to 3 steps. */
export function stepTo(from: number, to: number): number {
  const k = (((to - from) % 7) + 7) % 7;
  return k > 3 ? k - 7 : k;
}

/**
 * What makes a track itself: its chords; the melody's bars taken from `rot` bars on, each moved to
 * its new chord; played backwards (`rev`) or a sixteenth pair late (`late`); and the peak's two
 * melodies the other way round (`swap`).
 */
export type Track = { n: number; prog: number[]; rot: number; rev: boolean; late: boolean; swap: boolean };

/** A small seeded random (mulberry32): the same number, the same track. */
function seeded(n: number) {
  let t = n >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function trackOf(n: number): Track {
  if (!n) return { n: 0, prog: PROGS[0], rot: 0, rev: false, late: false, swap: false };
  const r = seeded(n);
  return { n, prog: PROGS[1 + Math.floor(r() * (PROGS.length - 1))], rot: Math.floor(r() * 4), rev: r() < 0.35, late: r() < 0.3, swap: r() < 0.5 };
}

// a track's number: any whole number from 1 to TRACK_MAX; a song asked for by name gets its own
// (the room works it out when the song is asked for, so it lives with the requests)
export { TRACK_MAX, trackFor };

/** A track to play next: any but `not`. */
export function newTrack(not = 0, rand: () => number = Math.random): number {
  for (;;) {
    const n = 1 + Math.floor(rand() * TRACK_MAX);
    if (n !== not) return n;
  }
}

/** A bass note kept between E1 and E3: low enough to be the bass, high enough for a small speaker. */
const inBass = (m: number) => (m < 28 ? m + 12 : m > 52 ? m - 12 : m);
const moveBar = (bar: Notes, k: number, fit = (m: number) => m): Notes => bar.map((m) => (m === null ? null : fit(shiftNote(m, k))));

/**
 * A section played as track `t` (its id `id`): its bass, chords and melody moved bar by bar onto the
 * track's chords; `lead` is the melody to start from (the other peak's when the track swaps them).
 */
export function asTrack(sec: Section, t: Track, id: string, lead = sec.style.lead): Section {
  if (!t.n) return sec;
  const k = t.prog.map((to, i) => stepTo(WRITTEN[i], to));
  const st = sec.style;
  const bass = st.bass?.map((bar, i) => moveBar(bar, k[i], inBass));
  const chords = st.chords && { ...st.chords, prog: st.chords.prog.map((c, i) => c.map((m) => shiftNote(m, k[i]))) };
  const bars = lead?.bars.map((_, i) => {
    const from = (i + t.rot) % 4;
    let b = moveBar(lead.bars[from], stepTo(WRITTEN[from], t.prog[i]));
    if (t.rev) b = [...b].reverse();
    if (t.late) b = [...b.slice(-2), ...b.slice(0, -2)];
    return b;
  });
  return { ...sec, id, style: { ...st, bass, chords, lead: lead && bars ? { ...lead, bars } : undefined } };
}
