// A routine as a room plays it. games/dance's session-flow.ts lays a routine out as one timeline:
// warm-up, the teaching (each move once: 8 beats to watch, 8 to follow, at 70% speed), a count-in,
// the dance, the cool-down. A room has two anchors in that timeline, so a show is cut in two at the
// count-in:
//   the lead    warm-up and teaching, from RoutineInfo.leadStartAt (phase learning)
//   the dance   and its cool-down, from RoomState.routineStartAt, the dance's beat 0 (phase dancing)
// The dance follows the lead by itself; the host can also skip ahead to it, or go back a phrase
// (then routineStartAt is beat `fromBeat`, not beat 0). Pure: the room, the speaker page and every
// phone run the same code on the same anchors, so they agree on each beat with nothing sent.
import { buildTimeline, restartSection, type TimelineEntry } from "../../../dance/src/session-flow";
import type { Difficulty, RoomPhase } from "../../../party-base/src/index";
import { METRONOME_ID, MOVES, routineById, type Move, type Routine } from "./catalog";
import type { RoutineInfo } from "./protocol";

/** learn: warm-up, teaching, dance, cool-down. dance: the same without the teaching. */
export type Mode = "learn" | "dance";
export type Stage = "warmup" | "watch" | "follow" | "countdown" | "dance" | "cooldown";

export interface ShowBeat {
  stage: Stage;
  /** null in the count-in and for the metronome */
  move: Move | null;
  /** 1 to 8; in the count-in, the beats left: 4, 3, 2, 1 */
  count: number;
  /** ms from its part's anchor: the lead's first beat, or the dance's beat 0 */
  at: number;
  ms: number;
  /** the phone scores it (follow, dance) */
  score: boolean;
  /** its place in the dance when it counts for the results and the floor's combo, else null */
  danceBeat: number | null;
}

export interface Show {
  id: string;
  /** null: the metronome */
  routine: Routine | null;
  mode: Mode | null;
  difficulty: Difficulty;
  /** the dance's tempo (the teaching runs at 70% of it, warm-up and cool-down at their move's own) */
  bpm: number;
  beatMs: number;
  /** warm-up, then the teaching when mode is learn; empty for the metronome */
  lead: ShowBeat[];
  leadMs: number;
  /** beats counted in before the dance (4; the metronome: 8) */
  countIn: number;
  dance: ShowBeat[];
  danceMs: number;
  /** the cool-down, `at` from the dance's beat 0 like the dance's */
  tail: ShowBeat[];
  tailMs: number;
}

const METRONOME_BPM = 120;
const METRONOME_BEATS = 240;
const METRONOME_COUNT_IN = 8;

const cache = new Map<string, Show | null>();

/** The show for a routine id (null: no such routine). The metronome has no modes. */
export function buildShow(id: string, mode: Mode | null): Show | null {
  const key = `${id}:${id === METRONOME_ID ? "" : (mode ?? "learn")}`;
  if (!cache.has(key)) cache.set(key, make(id, mode ?? "learn"));
  return cache.get(key) ?? null;
}

function make(id: string, mode: Mode): Show | null {
  if (id === METRONOME_ID) {
    const beatMs = 60000 / METRONOME_BPM;
    const dance: ShowBeat[] = Array.from({ length: METRONOME_BEATS }, (_, b) => ({ stage: "dance", move: null, count: (b % 8) + 1, at: b * beatMs, ms: beatMs, score: true, danceBeat: b }));
    return { id, routine: null, mode: null, difficulty: "easy", bpm: METRONOME_BPM, beatMs, lead: [], leadMs: 0, countIn: METRONOME_COUNT_IN, dance, danceMs: METRONOME_BEATS * beatMs, tail: [], tailMs: 0 };
  }
  const routine = routineById(id);
  if (!routine) return null;
  const timeline = buildTimeline(routine, MOVES, { mode });
  const firstCount = timeline.findIndex((e) => e.phase === "countdown");
  const firstDance = timeline.findIndex((e) => e.phase === "dance");
  const firstCool = timeline.findIndex((e, i) => i > firstDance && e.phase === "cooldown");
  const beatMs = 60000 / routine.bpm;
  const danceAt = timeline[firstDance]!.atMs;
  const beat = (e: TimelineEntry, at: number): ShowBeat => ({ stage: e.phase, move: e.move, count: e.count, at, ms: e.durationMs, score: e.score, danceBeat: e.countsForResults ? e.routineBeat : null });
  const lead = timeline.slice(0, firstCount).map((e) => beat(e, e.atMs));
  // (the dance on its exact grid, beat b at b beats: what the phones score against)
  const dance = timeline.slice(firstDance, firstCool).map((e, b) => beat(e, b * beatMs));
  const danceMs = dance.length * beatMs;
  const coolAt = timeline[firstCool]!.atMs;
  const tail = timeline.slice(firstCool).map((e) => beat(e, danceMs + (e.atMs - coolAt)));
  const last = timeline[timeline.length - 1]!;
  return {
    id,
    routine,
    mode,
    difficulty: routine.difficulty,
    bpm: routine.bpm,
    beatMs,
    lead,
    leadMs: timeline[firstCount]!.atMs,
    countIn: firstDance - firstCount,
    dance,
    danceMs,
    tail,
    tailMs: last.atMs + last.durationMs - coolAt,
  };
}

/** Where a room is in a show: the two anchors (speaker time) and the beat the dance was restarted from. */
export interface Anchors {
  /** the lead's first beat; null when no lead is playing */
  leadStartAt: number | null;
  /** RoomState.routineStartAt: the dance's beat `fromBeat`; null while the lead plays */
  danceStartAt: number | null;
  fromBeat: number;
}

/** A beat of a show at its time: speaker time, or the time the room hears it (see planRun). */
export interface RunBeat extends ShowBeat {
  t: number;
}

/**
 * The anchors of what a room is playing, from its state (the pages' view of it): null when nothing
 * plays (the lobby, calibrating, the results).
 */
export function anchorsOf(phase: RoomPhase, routineStartAt: number | null, routine: RoutineInfo | null): Anchors | null {
  if (!routine || (phase !== "learning" && phase !== "dancing")) return null;
  return { leadStartAt: routine.leadStartAt, danceStartAt: phase === "dancing" ? routineStartAt : null, fromBeat: routine.fromBeat };
}

/**
 * Names a run: it changes when the host skips ahead, goes back a phrase, stops or starts another
 * dance, and stays the same when the lead runs into the dance by itself (the room's LEARNING_DONE
 * puts the dance where the lead already had it). A page plans its beats again only when it changes.
 */
export function runKey(show: Show, a: Anchors): string {
  return `${show.id}|${show.mode ?? "-"}|${a.leadStartAt ?? "-"}|${danceStart(show, a) ?? "-"}|${a.fromBeat}`;
}

/** When the dance's beat `fromBeat` is: where the room put it, or where the lead runs into it. */
export function danceStart(show: Show, a: Anchors): number | null {
  if (a.danceStartAt !== null) return a.danceStartAt;
  if (a.leadStartAt !== null) return a.leadStartAt + show.leadMs + show.countIn * show.beatMs;
  return null;
}

/**
 * Every beat still to come from these anchors, in order: what is left of the lead, the count-in,
 * the dance from `fromBeat`, the cool-down. `shiftMs` moves them all later: a phone passes the
 * TV's delay (RoomState.audioOffsetMs) to get each beat when the room hears it. Empty when nothing
 * is set to play (the metronome waiting for the host).
 */
export function planRun(show: Show, a: Anchors, shiftMs = 0): RunBeat[] {
  const start = danceStart(show, a);
  if (start === null) return [];
  const from = Math.min(Math.max(0, Math.floor(a.fromBeat)), Math.max(0, show.dance.length - 1));
  const countStart = start - show.countIn * show.beatMs;
  const out: RunBeat[] = [];
  if (a.leadStartAt !== null) {
    for (const b of show.lead) {
      const t = a.leadStartAt + b.at;
      // (the host skipped ahead: the count-in cuts the lead off)
      if (t >= countStart - 0.5) break;
      out.push({ ...b, ms: Math.min(b.ms, countStart - t), t: t + shiftMs });
    }
  }
  for (let k = 0; k < show.countIn; k++) out.push({ stage: "countdown", move: null, count: show.countIn - k, at: (k - show.countIn) * show.beatMs, ms: show.beatMs, score: false, danceBeat: null, t: countStart + k * show.beatMs + shiftMs });
  const zero = start - from * show.beatMs;
  for (let b = from; b < show.dance.length; b++) out.push({ ...show.dance[b]!, t: zero + b * show.beatMs + shiftMs });
  for (const b of show.tail) out.push({ ...b, t: zero + b.at + shiftMs });
  return out;
}

/** When the last beat of a run is over (the same clock as the run). */
export const runEnd = (run: readonly RunBeat[]): number => (run.length ? run[run.length - 1]!.t + run[run.length - 1]!.ms : 0);

/** The beat sounding at time t: its index in the run and how far through it is (0 to 1). Null before the first and after the last. */
export function spotAt(run: readonly RunBeat[], t: number): { i: number; frac: number } | null {
  if (!run.length || t < run[0]!.t || t >= runEnd(run)) return null;
  let lo = 0;
  let hi = run.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (run[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  const b = run[lo]!;
  return { i: lo, frac: Math.min(1, Math.max(0, (t - b.t) / b.ms)) };
}

/**
 * What comes after the move or stage at index i, and how many beats until it (counting the rest of
 * the current beat as `1 - frac`). Null when nothing changes before the end.
 */
export function nextChange(run: readonly RunBeat[], i: number, frac = 0): { beat: RunBeat; beats: number } | null {
  const cur = run[i];
  if (!cur) return null;
  for (let j = i + 1; j < run.length; j++) {
    const b = run[j]!;
    if (b.stage !== cur.stage || b.move?.id !== cur.move?.id) return { beat: b, beats: j - i - frac };
  }
  return null;
}

/** The screens bring the next move forward this many beats before it starts (session-flow's `upcoming`). */
export const PREVIEW_BEATS = 2;

/**
 * 这一段再来: the 8-count the room is hearing now, as the beat to restart the dance from
 * (session-flow's restartSection picks it; before the dance it is beat 0, after it the last 8-count).
 */
export function phraseStart(show: Show, a: Anchors, heardNow: number): number {
  const start = danceStart(show, a);
  if (start === null) return 0;
  const map = { bpm: show.bpm, beatsPerBar: 4, startAt: start - a.fromBeat * show.beatMs, totalBeats: show.dance.length };
  return restartSection(map, heardNow).fromBeat;
}
