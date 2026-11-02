import { describe, expect, it } from 'vitest';
import { beatAt, beatTime, countInPhrase, nextPhraseStart } from '../../party-base/src/beat-clock';
import type { BeatMap } from '../../party-base/src/types';
import movesData from '../data/moves.json';
import routinesData from '../data/routines.json';
import { librarySchema, type Routine } from '../data/schema';
import { buildTimeline, practiceMap, restartSection, upcoming, type TimelineEntry } from './session-flow';

const { moves, routines } = librarySchema.parse({ moves: movesData, routines: routinesData });
const end = (entry: TimelineEntry) => entry.atMs + entry.durationMs;
const build = (routine: Routine, mode: 'learn' | 'dance' = 'learn') =>
  buildTimeline(routine, moves, { mode, learnSpeed: 0.7 });
const map: BeatMap = { bpm: 120, beatsPerBar: 4, startAt: 10000, totalBeats: 192 };

describe('buildTimeline', () => {
  it.each(routines)('$id teaches distinct moves once and preserves every dance repeat', routine => {
    const timeline = build(routine);
    const expectedMoves = routine.sections.flatMap(section => Array<string>(section.repeat * 8).fill(section.move));
    const dance = timeline.filter(entry => entry.phase === 'dance');
    const learning = timeline.filter(entry => entry.phase === 'watch' || entry.phase === 'follow');
    const warmupBpm = moves.find(move => move.id === routine.warmup)!.native_bpm;
    const cooldownBpm = moves.find(move => move.id === routine.cooldown)!.native_bpm;
    const warmupBeats = Math.ceil(warmupBpm / 8) * 8;
    const cooldownBeats = Math.ceil(cooldownBpm / 8) * 8;
    const learnedMoves = [...new Set(expectedMoves)];
    expect(timeline).toHaveLength(warmupBeats + learnedMoves.length * 16 + expectedMoves.length + 4 + cooldownBeats);
    expect(dance.map(entry => entry.move!.id)).toEqual(expectedMoves);
    expect(dance.map(entry => entry.routineBeat)).toEqual(expectedMoves.map((_, i) => i));
    expect(dance.map(entry => entry.section)).toEqual(routine.sections.flatMap((section, index) => Array(section.repeat * 8).fill(index)));
    expect(learning).toHaveLength(learnedMoves.length * 16);
    for (let group = 0; group < learnedMoves.length; group++) {
      const move = learnedMoves[group]!;
      const firstBeat = expectedMoves.indexOf(move);
      const firstSection = routine.sections.findIndex(section => section.move === move);
      for (const [offset, phase] of [[0, 'watch'], [8, 'follow']] as const) {
        const phrase = learning.slice(group * 16 + offset, group * 16 + offset + 8);
        expect(phrase.map(entry => entry.phase)).toEqual(Array(8).fill(phase));
        expect(phrase.map(entry => entry.count)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(phrase.map(entry => entry.routineBeat)).toEqual(Array.from({ length: 8 }, (_, i) => firstBeat + i));
        expect(phrase.every(entry => entry.move!.id === move && entry.section === firstSection)).toBe(true);
      }
    }
    const expectedDuration = warmupBeats * 60000 / warmupBpm + cooldownBeats * 60000 / cooldownBpm
      + learnedMoves.length * 16 * 60000 / (routine.bpm * 0.7)
      + (4 + expectedMoves.length) * 60000 / routine.bpm;
    expect(end(timeline.at(-1)!)).toBeCloseTo(expectedDuration, 6);
    timeline.forEach((entry, i) => {
      expect(entry.beat).toBe(i);
      expect(entry.durationMs).toBeGreaterThan(0);
      if (i > 0) expect(entry.atMs).toBeCloseTo(end(timeline[i - 1]!), 6);
      expect(entry.score).toBe(entry.phase === 'follow' || entry.phase === 'dance');
      expect(entry.countsForResults).toBe(entry.phase === 'dance');
      expect(entry.countsForCombo).toBe(entry.phase === 'dance');
    });
  });

  it('teaches repeated moves only at their first appearance, including nonadjacent sections', () => {
    const routine = {
      ...routines[0]!, warmup: 'clap-2x', cooldown: 'clap-2x',
      sections: [
        { move: 'clap-2x', repeat: 4 }, { move: 'raise-arms', repeat: 2 },
        { move: 'clap-2x', repeat: 1 }, { move: 'side-wave', repeat: 3 },
        { move: 'raise-arms', repeat: 4 },
      ],
    };
    const timeline = build(routine);
    const learning = timeline.filter(entry => entry.phase === 'watch' || entry.phase === 'follow');
    expect(learning).toHaveLength(48);
    expect(learning.filter(entry => entry.count === 1).map(entry => [entry.move!.id, entry.phase, entry.section, entry.routineBeat])).toEqual([
      ['clap-2x', 'watch', 0, 0], ['clap-2x', 'follow', 0, 0],
      ['raise-arms', 'watch', 1, 32], ['raise-arms', 'follow', 1, 32],
      ['side-wave', 'watch', 3, 56], ['side-wave', 'follow', 3, 56],
    ]);
    expect(timeline.filter(entry => entry.phase === 'dance')).toHaveLength(112);
  });

  it.each(routines)('$id skips learning in dance mode, retaining a four-beat unscored countdown', routine => {
    const timeline = build(routine, 'dance');
    expect(timeline.some(entry => entry.phase === 'watch' || entry.phase === 'follow')).toBe(false);
    const countdown = timeline.filter(entry => entry.phase === 'countdown');
    expect(countdown.map(entry => entry.count)).toEqual([4, 3, 2, 1]);
    expect(countdown.every(entry => !entry.score && !entry.countsForCombo && !entry.countsForResults && entry.move === null)).toBe(true);
    expect(end(countdown.at(-1)!) - countdown[0]!.atMs).toBeCloseTo(4 * 60000 / routine.bpm, 7);
    expect(timeline[countdown.at(-1)!.beat + 1]).toMatchObject({ phase: 'dance', count: 1, routineBeat: 0 });
  });

  it.each(routines)('$id changes choreography only on eight-count phrase boundaries at the correct tempo', routine => {
    const timeline = build(routine);
    for (const phases of [['watch', 'follow'], ['dance']]) {
      const entries = timeline.filter(entry => phases.includes(entry.phase));
      const bpm = phases.includes('watch') ? routine.bpm * 0.7 : routine.bpm;
      const grid = { ...map, bpm, startAt: entries[0]!.atMs };
      entries.forEach((entry, i) => {
        expect(entry.bpm).toBe(bpm);
        expect(entry.atMs).toBeCloseTo(beatTime(grid, i), 6);
        expect(entry.count).toBe(countInPhrase(grid, i));
        if (i % 8 === 0) {
          expect(entry.atMs).toBeCloseTo(nextPhraseStart(grid, beatTime(grid, Math.max(0, i - 1))), 6);
        }
      });
    }
  });

  it.each([84.5, 88, 90, 96, 96.5])('rounds gentle stages at %s BPM up to complete phrases lasting at least a minute', native_bpm => {
    const gentleMoves = moves.map(move => ({ ...move, native_bpm }));
    const routine = routines[1]!;
    const timeline = buildTimeline(routine, gentleMoves, { mode: 'learn', learnSpeed: 0.7 });
    const expectedBeats = Math.ceil(native_bpm / 8) * 8;
    for (const phase of ['warmup', 'cooldown'] as const) {
      const entries = timeline.filter(entry => entry.phase === phase);
      expect(entries).toHaveLength(expectedBeats);
      expect(entries.at(-1)!.count).toBe(8);
      const duration = end(entries.at(-1)!) - entries[0]!.atMs;
      expect(duration).toBeCloseTo(expectedBeats * 60000 / native_bpm, 7);
      expect(duration).toBeGreaterThanOrEqual(60000 - 1e-7);
      expect(duration - 8 * 60000 / native_bpm).toBeLessThan(60000);
      expect(entries.every(entry => Math.abs(entry.durationMs - 60000 / native_bpm) < 1e-7)).toBe(true);
      expect(entries.every(entry => entry.move!.id === routine[phase] && !entry.score && !entry.countsForResults && !entry.countsForCombo)).toBe(true);
    }
    const firstWatch = timeline.find(entry => entry.phase === 'watch')!;
    expect(firstWatch.atMs).toBeCloseTo(expectedBeats * 60000 / native_bpm, 7);
    expect(firstWatch.count).toBe(1);
    expect(timeline.find(entry => entry.phase === 'cooldown')!.count).toBe(1);
  });

  it('defaults to 70% learning speed and also supports a slower practice tempo', () => {
    expect(buildTimeline(routines[0]!, moves, { mode: 'learn' })).toEqual(build(routines[0]!));
    const timeline = buildTimeline(routines[0]!, moves, { mode: 'learn', learnSpeed: 0.5 });
    expect(timeline.filter(entry => entry.phase === 'watch' || entry.phase === 'follow').every(entry => entry.bpm === routines[0]!.bpm * 0.5)).toBe(true);
    expect(timeline.filter(entry => entry.phase === 'dance').every(entry => entry.bpm === routines[0]!.bpm)).toBe(true);
  });

  it('does not mutate the supplied library or options and is deterministic', () => {
    const opts = Object.freeze({ mode: 'learn', learnSpeed: 0.7 } as const);
    const before = JSON.stringify({ routines, moves });
    expect(buildTimeline(routines[0]!, Object.freeze([...moves]), opts)).toEqual(build(routines[0]!));
    expect(JSON.stringify({ routines, moves })).toBe(before);
  });

  it.each(['section', 'warmup', 'cooldown'] as const)('rejects missing %s moves rather than silently dropping time', field => {
    const routine = { ...routines[0]!, sections: routines[0]!.sections.map(section => ({ ...section })) };
    if (field === 'section') routine.sections[0]!.move = 'missing';
    else routine[field] = 'missing';
    expect(() => build(routine)).toThrow('Unknown move: missing');
  });

  it('rejects an empty routine and invalid BPM/repeat values', () => {
    expect(() => build({ ...routines[0]!, sections: [] })).toThrow(RangeError);
    for (const bpm of [0, -1, NaN, Infinity]) expect(() => build({ ...routines[0]!, bpm })).toThrow(RangeError);
    for (const repeat of [0, 1.5, 5]) {
      expect(() => build({ ...routines[0]!, sections: [{ move: moves[0]!.id, repeat }] })).toThrow(RangeError);
    }
  });
});

describe('upcoming', () => {
  const timeline = build(routines[0]!);
  const watch = timeline.find(entry => entry.phase === 'watch')!.beat;
  const dance = timeline.find(entry => entry.phase === 'dance')!.beat;

  it('reveals watch → follow exactly two beats ahead, including fractional positions', () => {
    expect(upcoming(timeline, watch + 5.99).next).toBeNull();
    expect(upcoming(timeline, watch + 6)).toEqual({ current: timeline[watch + 6], next: timeline[watch + 8], beatsUntilNext: 2 });
    expect(upcoming(timeline, watch + 7.5)).toEqual({ current: timeline[watch + 7], next: timeline[watch + 8], beatsUntilNext: 0.5 });
    expect(upcoming(timeline, watch + 8).current.phase).toBe('follow');
  });

  it('previews an actual move change and does not announce identical repeated moves', () => {
    expect(upcoming(timeline, dance + 6).next).toBeNull();
    expect(upcoming(timeline, dance + 29).next).toBeNull();
    expect(upcoming(timeline, dance + 30)).toMatchObject({ next: { move: { id: 'raise-arms' } }, beatsUntilNext: 2 });
    expect(upcoming(timeline, dance + 32).current.move!.id).toBe('raise-arms');
  });

  it('previews the first dance move during countdown and has no next action at the end', () => {
    expect(upcoming(timeline, dance - 2)).toMatchObject({ current: { phase: 'countdown' }, next: { phase: 'dance' }, beatsUntilNext: 2 });
    expect(upcoming(timeline, timeline.length - 0.5)).toMatchObject({ current: { phase: 'cooldown' }, next: null, beatsUntilNext: 0 });
  });

  it('rejects empty timelines, out-of-session beats and nonfinite values', () => {
    expect(() => upcoming([], 0)).toThrow(RangeError);
    for (const beat of [-1, timeline.length, NaN, Infinity]) expect(() => upcoming(timeline, beat)).toThrow(RangeError);
  });
});

describe('restartSection', () => {
  it.each([[0, 0], [7.99, 0], [8, 8], [15.5, 8], [16, 16], [191.9, 184]])('restarts beat %s from %s with exactly four countdown beats', (beat, fromBeat) => {
    const now = beatTime(map, beat);
    const result = restartSection(map, now);
    expect(result).toEqual({ fromBeat, routineStartAt: now + 2000 });
    const resumedMap = { ...map, startAt: result.routineStartAt, totalBeats: map.totalBeats - result.fromBeat };
    expect(beatAt(resumedMap, now)).toBe(-4);
    expect(beatTime(resumedMap, 0)).toBe(result.routineStartAt);
  });

  it('clamps before the routine and after completion to the first/last existing phrase', () => {
    expect(restartSection(map, 5000).fromBeat).toBe(0);
    expect(restartSection(map, beatTime(map, 200)).fromBeat).toBe(184);
    expect(restartSection({ ...map, totalBeats: 11 }, beatTime(map, 20)).fromBeat).toBe(8);
  });

  it.each(routines)('$id keeps exact phrase boundaries at both normal and practice BPM', routine => {
    for (const bpm of [routine.bpm, routine.bpm * 0.7]) {
      const grid = { ...map, bpm };
      for (let beat = 8; beat < grid.totalBeats; beat += 8) {
        const boundary = beatTime(grid, beat);
        expect(restartSection(grid, boundary).fromBeat).toBe(beat);
        expect(restartSection(grid, boundary - 0.001).fromBeat).toBe(beat - 8);
        expect(restartSection(grid, boundary + 0.001).fromBeat).toBe(beat);
      }
    }
  });

  it('uses eight-count sections even with a non-four-beat bar and preserves the input', () => {
    const input = Object.freeze({ ...map, bpm: 67.2, beatsPerBar: 3 });
    const now = beatTime(input, 21.5);
    const result = restartSection(input, now);
    expect(result.fromBeat).toBe(16);
    expect(result.routineStartAt - now).toBeCloseTo(4 * 60000 / 67.2, 8);
    expect(input.startAt).toBe(10000);
  });

  it('rejects invalid clocks and empty maps', () => {
    for (const now of [NaN, Infinity]) expect(() => restartSection(map, now)).toThrow(RangeError);
    for (const totalBeats of [0, -1, 1.5, Infinity]) expect(() => restartSection({ ...map, totalBeats }, 10000)).toThrow(RangeError);
    expect(() => restartSection({ ...map, startAt: NaN }, 10000)).toThrow(RangeError);
  });
});

describe('practiceMap', () => {
  it('returns a new map at 70% BPM with unchanged speaker origin, meter and length', () => {
    const input = Object.freeze({ ...map, bpm: 96 });
    const practice = practiceMap(input, 0.7);
    expect(practiceMap(input)).toEqual(practice);
    expect(practice).toEqual({ ...input, bpm: input.bpm * 0.7 });
    expect(practice.bpm).toBeCloseTo(67.2, 10);
    expect(practice).not.toBe(input);
    expect(input.bpm).toBe(96);
    expect(beatTime(practice, 8) - practice.startAt).toBeCloseTo(8 * 60000 / 67.2, 8);
  });

  it.each([0.1, 0.5, 0.7, 1])('accepts practice speed %s and preserves the rest of the map', speed => {
    const input = Object.freeze({ ...map });
    expect(practiceMap(input, speed)).toEqual({ ...map, bpm: map.bpm * speed });
    expect(input.bpm).toBe(120);
  });

  it('rejects nonfinite/nonpositive BPM and speeds outside (0, 1]', () => {
    for (const bpm of [0, -1, NaN, Infinity]) expect(() => practiceMap({ ...map, bpm }, 0.7)).toThrow(RangeError);
    for (const speed of [0, -1, 1.01, NaN, Infinity]) expect(() => practiceMap(map, speed)).toThrow(RangeError);
  });
});
