import { beatAt, beatTime, countInPhrase, nextPhraseStart } from '../../party-base/src/beat-clock';
import type { BeatMap } from '../../party-base/src/types';
import type { Move, Routine } from '../data/schema';

export type SessionPhase = 'warmup' | 'watch' | 'follow' | 'countdown' | 'dance' | 'cooldown';

export interface TimelineEntry {
  /** Sequential timeline index, NOT a beat index in the full-speed routine map. */
  beat: number;
  phase: SessionPhase;
  move: Move | null;
  /** Index in routine.sections; learning points to the move's first appearance. */
  section: number | null;
  /** Original choreography beat, shared by watch/follow and the corresponding dance beat. */
  routineBeat: number | null;
  /** One-based eight-count, or 4, 3, 2, 1 during countdown. */
  count: number;
  bpm: number;
  /** Relative to session start; add speaker time when scheduling playback. */
  atMs: number;
  durationMs: number;
  score: boolean;
  countsForResults: boolean;
  countsForCombo: boolean;
}

export interface TimelineOptions {
  /** learn includes instruction before the full dance; dance skips instruction. */
  mode: 'learn' | 'dance';
  learnSpeed?: number;
}

function positiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
}

/** A fresh practice grid (default 70%); speaker-time origin and length are unchanged. */
export function practiceMap(map: BeatMap, learnSpeed = 0.7): BeatMap {
  positiveFinite(map.bpm, 'bpm');
  positiveFinite(learnSpeed, 'learnSpeed');
  if (learnSpeed > 1) throw new RangeError('learnSpeed must be at most 1');
  return { ...map, bpm: map.bpm * learnSpeed };
}

/**
 * Warmup → optional watch/follow once per distinct move → four-count → dance → cooldown.
 * Teach moves in first-appearance order, retaining their original section/beat offsets.
 * Warmup/cooldown use complete eight-counts at the selected move's native tempo,
 * rounded up to at least 60 seconds. Each stage starts its own phrase grid, so
 * instruction and dance always start on count 1 with no shortened beats.
 * The exclusive end (last.atMs + last.durationMs) is when the caller sends FINISH/results;
 * there is no extra scored beat for results. No room state or input is mutated here.
 */
export function buildTimeline(
  routine: Routine,
  moves: readonly Move[],
  opts: TimelineOptions,
): TimelineEntry[] {
  positiveFinite(routine.bpm, 'bpm');
  if (opts.mode !== 'learn' && opts.mode !== 'dance') throw new RangeError('Unknown session mode');
  const danceMap: BeatMap = { bpm: routine.bpm, beatsPerBar: 4, startAt: 0, totalBeats: 0 };
  const learningMap = practiceMap(danceMap, opts.learnSpeed);
  const byId = new Map(moves.map(move => [move.id, move]));
  const getMove = (id: string): Move => {
    const move = byId.get(id);
    if (!move) throw new RangeError(`Unknown move: ${id}`);
    if (move.beats !== 8) throw new RangeError(`Move must have eight beats: ${id}`);
    return move;
  };
  const warmup = getMove(routine.warmup);
  const cooldown = getMove(routine.cooldown);
  const sections = routine.sections.map(section => {
    if (!Number.isInteger(section.repeat) || section.repeat < 1 || section.repeat > 4) {
      throw new RangeError('Section repeat must be an integer from 1 to 4');
    }
    return { move: getMove(section.move), repeat: section.repeat };
  });
  if (sections.length === 0) throw new RangeError('A routine needs at least one section');

  const timeline: TimelineEntry[] = [];
  let elapsedMs = 0;
  const append = (
    phase: SessionPhase, move: Move | null, map: BeatMap, phaseBeat: number,
    section: number | null, routineBeat: number | null,
  ) => {
    const atMs = beatTime(map, phaseBeat);
    const durationMs = beatTime(map, phaseBeat + 1) - atMs;
    timeline.push({
      beat: timeline.length, phase, move, section, routineBeat,
      count: phase === 'countdown' ? 4 - phaseBeat : countInPhrase(map, phaseBeat),
      bpm: map.bpm, atMs, durationMs,
      score: phase === 'follow' || phase === 'dance',
      countsForResults: phase === 'dance',
      countsForCombo: phase === 'dance',
    });
    elapsedMs = atMs + durationMs;
  };
  const gentleMinute = (phase: 'warmup' | 'cooldown', move: Move) => {
    positiveFinite(move.native_bpm, 'native_bpm');
    const map = { ...danceMap, bpm: move.native_bpm, startAt: elapsedMs };
    const totalBeats = Math.ceil(move.native_bpm / 8) * 8;
    for (let beat = 0; beat < totalBeats; beat++) {
      append(phase, move, map, beat, null, null);
    }
  };
  const choreography = (learning: boolean) => {
    const map = { ...(learning ? learningMap : danceMap), startAt: elapsedMs };
    let phaseBeat = 0;
    let routineBeat = 0;
    const taught = new Set<string>();
    sections.forEach((section, index) => {
      const repeats = learning ? (taught.has(section.move.id) ? 0 : 1) : section.repeat;
      taught.add(section.move.id);
      for (let repeat = 0; repeat < repeats; repeat++) {
        const phases: SessionPhase[] = learning ? ['watch', 'follow'] : ['dance'];
        for (const phase of phases) {
          // Ask for the boundary after the preceding beat, avoiding floating-point
          // ceil at an already-computed boundary in nextPhraseStart.
          const startAt = nextPhraseStart(map, beatTime(map, Math.max(0, phaseBeat - 1)));
          const phraseMap = { ...map, startAt };
          for (let beat = 0; beat < 8; beat++) {
            append(phase, section.move, phraseMap, beat, index, routineBeat + repeat * 8 + beat);
          }
          phaseBeat += 8;
        }
      }
      routineBeat += section.repeat * 8;
    });
  };

  gentleMinute('warmup', warmup);
  if (opts.mode === 'learn') choreography(true);
  const countdownMap = { ...danceMap, startAt: elapsedMs };
  for (let beat = 0; beat < 4; beat++) append('countdown', null, countdownMap, beat, null, null);
  choreography(false);
  gentleMinute('cooldown', cooldown);
  return timeline;
}

/**
 * beat is a (possibly fractional) timeline index. Preview appears only in the final
 * two beats before a move/stage changes; repeating the same move does not flash a cue.
 * Out-of-session queries throw so a caller cannot accidentally score a clamped beat.
 */
export function upcoming(timeline: readonly TimelineEntry[], beat: number): {
  current: TimelineEntry; next: TimelineEntry | null; beatsUntilNext: number;
} {
  if (!Number.isFinite(beat) || beat < 0 || beat >= timeline.length) {
    throw new RangeError('beat must be inside the timeline');
  }
  const index = Math.floor(beat);
  const current = timeline[index]!;
  for (let i = index + 1; i < timeline.length && i - beat <= 2; i++) {
    const entry = timeline[i]!;
    if (entry.phase !== current.phase || entry.move?.id !== current.move?.id) {
      return { current, next: entry, beatsUntilNext: i - beat };
    }
  }
  return { current, next: null, beatsUntilNext: 0 };
}

/**
 * Rebase the selected eight-count as beat 0 of a resumed map, starting exactly four
 * beats from now. fromBeat selects the original choreography slice; do not apply the
 * new startAt to the unsliced original map (which would replay preceding sections).
 */
export function restartSection(map: BeatMap, nowSpeakerTime: number): {
  routineStartAt: number; fromBeat: number;
} {
  positiveFinite(map.bpm, 'bpm');
  if (!Number.isFinite(map.startAt) || !Number.isFinite(nowSpeakerTime)) {
    throw new RangeError('Speaker times must be finite');
  }
  if (!Number.isInteger(map.totalBeats) || map.totalBeats <= 0) {
    throw new RangeError('totalBeats must be a positive integer');
  }
  let beat = Math.floor(beatAt(map, nowSpeakerTime));
  // Division can put an exact boundary infinitesimally on the wrong side. Compare
  // speaker timestamps on the shared grid rather than widening the scoring window.
  if (beatTime(map, beat) > nowSpeakerTime) beat--;
  else if (beatTime(map, beat + 1) <= nowSpeakerTime) beat++;
  beat = Math.max(0, Math.min(map.totalBeats - 1, beat));
  const fromBeat = beat - countInPhrase(map, beat) + 1;
  return { routineStartAt: beatTime({ ...map, startAt: nowSpeakerTime }, 4), fromBeat };
}
