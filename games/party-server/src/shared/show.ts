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
import { METRONOME_ID, MOVES, moveById, routineById, type Move, type Routine } from "./catalog";
import type { RoutineInfo } from "./protocol";
import { songBeat, songById, songMoves, type Song } from "./songs";

/** learn: warm-up, teaching, dance, cool-down. dance: the same without the teaching. */
export type Mode = "learn" | "dance";
/** intro: a song's beats before the count-in (it plays from its start; the dance begins after its intro). */
export type Stage = "warmup" | "watch" | "follow" | "intro" | "countdown" | "dance" | "cooldown";

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
  kind: "routine" | "song" | "metronome";
  /** the library's dance (null for a song and the metronome) */
  routine: Routine | null;
  /** the song (null for the others) */
  song: Song | null;
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
  /**
   * From the lead's end to the dance's first beat (ms): the count-in; for a song, its intro (the
   * video starts as the lead ends). A room's RoutineInfo.introMs overrides it (a song tapped along to).
   */
  introMs: number;
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
/** How many shows are kept (the tests: never more than the dances there are). */
export const cachedShows = () => cache.size;

/** The show for a routine id (null: no such routine). The metronome has no modes. */
export function buildShow(id: string, mode: Mode | null): Show | null {
  // (only the shows there are get kept: a made-up id from a phone is not)
  if (id !== METRONOME_ID && !routineById(id) && !songById(id)) return null;
  const key = `${id}:${id === METRONOME_ID ? "" : (mode ?? "learn")}`;
  if (!cache.has(key)) cache.set(key, make(id, mode ?? "learn"));
  return cache.get(key) ?? null;
}

function make(id: string, mode: Mode): Show | null {
  if (id === METRONOME_ID) {
    const beatMs = 60000 / METRONOME_BPM;
    const dance: ShowBeat[] = Array.from({ length: METRONOME_BEATS }, (_, b) => ({ stage: "dance", move: null, count: (b % 8) + 1, at: b * beatMs, ms: beatMs, score: true, danceBeat: b }));
    return { id, kind: "metronome", routine: null, song: null, mode: null, difficulty: "easy", bpm: METRONOME_BPM, beatMs, lead: [], leadMs: 0, countIn: METRONOME_COUNT_IN, introMs: METRONOME_COUNT_IN * beatMs, dance, danceMs: METRONOME_BEATS * beatMs, tail: [], tailMs: 0 };
  }
  const song = songById(id);
  if (song) return makeSong(song, mode);
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
  const countIn = firstDance - firstCount;
  return {
    id,
    kind: "routine",
    routine,
    song: null,
    mode,
    difficulty: routine.difficulty,
    bpm: routine.bpm,
    beatMs,
    lead,
    leadMs: timeline[firstCount]!.atMs,
    countIn,
    introMs: countIn * beatMs,
    dance,
    danceMs,
    tail,
    tailMs: last.atMs + last.durationMs - coolAt,
  };
}

/** The teaching of a song runs at this share of its tempo (as the library's dances' does). */
const SONG_TEACH = 0.7;
const SONG_COUNT_IN = 4;

/**
 * A song as a show: in learn mode, each of its moves taught once (8 beats to watch, 8 to follow, at
 * 70% of its tempo, on the synth); then the video from its start, its intro, a count-in on its
 * last 4 beats, and the dance on the song's beats to the end of its pattern. No cool-down: the
 * song plays out.
 */
function makeSong(song: Song, mode: Mode): Show {
  const beatMs = 60000 / song.bpm;
  const lead: ShowBeat[] = [];
  if (mode === "learn") {
    const teachMs = 60000 / (song.bpm * SONG_TEACH);
    let at = 0;
    for (const id of song.teach ?? songMoves(song)) {
      const move = moveById(id);
      for (const stage of ["watch", "follow"] as const)
        for (let k = 0; k < 8; k++) {
          lead.push({ stage, move, count: k + 1, at, ms: teachMs, score: stage === "follow", danceBeat: null });
          at += teachMs;
        }
    }
  }
  const leadMs = lead.length ? lead[lead.length - 1]!.at + lead[lead.length - 1]!.ms : 0;
  const dance: ShowBeat[] = Array.from({ length: song.beats }, (_, b) => {
    const { move, count } = songBeat(song, b);
    return { stage: "dance", move: moveById(move), count, at: b * beatMs, ms: beatMs, score: true, danceBeat: b };
  });
  return {
    id: song.id,
    kind: "song",
    routine: null,
    song,
    mode,
    difficulty: song.difficulty,
    bpm: song.bpm,
    beatMs,
    lead,
    leadMs,
    countIn: SONG_COUNT_IN,
    introMs: song.firstBeatMs,
    dance,
    danceMs: song.beats * beatMs,
    tail: [],
    tailMs: 0,
  };
}

/** Where a room is in a show: the two anchors (speaker time) and the beat the dance was restarted from. */
export interface Anchors {
  /** the lead's first beat; null when no lead is playing */
  leadStartAt: number | null;
  /** RoomState.routineStartAt: the dance's beat `fromBeat`; null while the lead plays */
  danceStartAt: number | null;
  fromBeat: number;
  /** the room's RoutineInfo.introMs (a song tapped along to), else null: the show's own */
  introMs?: number | null;
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
  // (paused: nothing plays until 继续 moves the run on; held: until the song's video plays again)
  if (!routine || (phase !== "learning" && phase !== "dancing") || routine.pausedAt !== undefined || routine.heldAt !== undefined) return null;
  return { leadStartAt: routine.leadStartAt, danceStartAt: phase === "dancing" ? routineStartAt : null, fromBeat: routine.fromBeat, introMs: routine.introMs ?? null };
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
  if (a.leadStartAt !== null) return a.leadStartAt + show.leadMs + introOf(show, a);
  return null;
}

/** From the lead's end to the dance's first beat: the room's (a song tapped along to), or the show's. */
export const introOf = (show: Show, a: Anchors): number => a.introMs ?? show.introMs;

/**
 * Where a song's dance starts in its video, given a beat people tapped along to (找拍子 or 歌曲对拍:
 * any beat of the song's grid). A song whose dance is laid along its sections (`Song.aligned`: its
 * first beat known from the song's own timing, to within half a beat) starts on the tapped grid's
 * beat nearest that; any other song starts on the tapped beat itself.
 */
export function songStart(show: Show, tappedMs: number): number {
  const song = show.song;
  if (!song?.aligned) return tappedMs;
  const n = Math.round((song.firstBeatMs - tappedMs) / show.beatMs);
  return tappedMs + n * show.beatMs;
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
  const zero = start - from * show.beatMs;
  // a song's intro: its beats from where the video starts (the lead's end) to the count-in
  if (show.kind === "song" && from === 0) {
    const videoStart = start - introOf(show, a);
    for (let k = Math.floor((start - videoStart) / show.beatMs); k > show.countIn; k--) {
      const t = start - k * show.beatMs;
      if (t < videoStart - 0.5) continue;
      out.push({ stage: "intro", move: null, count: (((-k % 8) + 8) % 8) + 1, at: -k * show.beatMs, ms: show.beatMs, score: false, danceBeat: null, t: t + shiftMs });
    }
  }
  for (let k = 0; k < show.countIn; k++) out.push({ stage: "countdown", move: null, count: show.countIn - k, at: (k - show.countIn) * show.beatMs, ms: show.beatMs, score: false, danceBeat: null, t: countStart + k * show.beatMs + shiftMs });
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
 * (session-flow's restartSection picks it; after the dance, the last 8-count). In a count-in, the
 * beat it is counting in to: a second tap during a restart's count-in starts the same 8-count again.
 */
export function phraseStart(show: Show, a: Anchors, heardNow: number): number {
  const start = danceStart(show, a);
  if (start === null) return 0;
  if (heardNow < start) return Math.max(0, Math.floor(a.fromBeat));
  const map = { bpm: show.bpm, beatsPerBar: 4, startAt: start - a.fromBeat * show.beatMs, totalBeats: show.dance.length };
  return restartSection(map, heardNow).fromBeat;
}
