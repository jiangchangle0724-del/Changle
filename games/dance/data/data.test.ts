import { describe, expect, it } from 'vitest';
import movesData from './moves.json';
import routinesData from './routines.json';
import {
  librarySchema, moveSchema, movesSchema, routineSchema, routinesSchema,
  type Difficulty, type Routine,
} from './schema';

const freshLibrary = () => librarySchema.parse({ moves: movesData, routines: routinesData });
const seconds = (routine: Routine) => routine.sections.reduce((sum, section) => sum + section.repeat * 8, 0) * 60 / routine.bpm;

function routineAtBpm(difficulty: Difficulty, bpm: number): Routine {
  return {
    ...freshLibrary().routines[0]!, difficulty, bpm,
    sections: Array.from({ length: Math.round(bpm / 4) }, () => ({ move: 'clap-2x', repeat: 1 })),
  };
}

describe('shipped dance library', () => {
  it('parses both JSON files with all cross-file checks', () => {
    expect(() => freshLibrary()).not.toThrow();
  });

  it('contains 20 unique moves split into 8 easy, 7 medium and 5 hard', () => {
    const { moves } = freshLibrary();
    expect(moves).toHaveLength(20);
    expect(new Set(moves.map(move => move.id)).size).toBe(20);
    expect(['easy', 'medium', 'hard'].map(difficulty => moves.filter(move => move.difficulty === difficulty).length)).toEqual([8, 7, 5]);
    expect(moves.filter(move => move.difficulty === 'easy').every(move => move.seated_ok && move.body === 'arms')).toBe(true);
  });

  it('includes familiar Plaza dance and Kemusan moves by their Chinese names', () => {
    const names = movesData.map(move => move.name_zh);
    for (const name of ['手绢花', '十字步', '扭秧歌', '八步摇', '科目三摇花手']) {
      expect(names).toContain(name);
    }
  });

  it('ships one square and one pop routine at each difficulty', () => {
    const { routines } = freshLibrary();
    expect(routines).toHaveLength(6);
    expect(new Set(routines.map(routine => routine.id)).size).toBe(6);
    for (const difficulty of ['easy', 'medium', 'hard']) {
      expect(routines.filter(routine => routine.difficulty === difficulty).map(routine => routine.style).sort()).toEqual(['pop', 'square']);
    }
  });

  it.each(routinesData.map(routine => [routine.id, routine] as const))('%s lasts about two minutes and follows the learning pattern', (_id, data) => {
    const routine = routineSchema.parse(data);
    expect(seconds(routine)).toBeGreaterThanOrEqual(110);
    expect(seconds(routine)).toBeLessThanOrEqual(130);
    const count = new Set(routine.sections.map(section => section.move)).size;
    if (routine.difficulty === 'easy') expect(count).toBe(4);
    if (routine.difficulty === 'medium') expect(count).toBeGreaterThanOrEqual(6);
    if (routine.difficulty === 'medium') expect(count).toBeLessThanOrEqual(8);
    if (routine.difficulty === 'hard') expect(count).toBeGreaterThanOrEqual(10);
    expect(routine.sections.every(section => section.repeat === { easy: 4, medium: 2, hard: 1 }[routine.difficulty])).toBe(true);
  });

  it('uses every move and selects gentle seated moves for warmup/cooldown', () => {
    const { moves, routines } = freshLibrary();
    const used = new Set(routines.flatMap(routine => [
      ...routine.sections.map(section => section.move), routine.warmup, routine.cooldown,
    ]));
    expect(moves.every(move => used.has(move.id))).toBe(true);
    for (const routine of routines) {
      for (const id of [routine.warmup, routine.cooldown]) {
        expect(moves.find(move => move.id === id)).toMatchObject({ difficulty: 'easy', seated_ok: true });
      }
    }
  });

  it('uses shoulder rolls only for warmup and gives pop-easy an active seated replacement', () => {
    const { moves, routines } = freshLibrary();
    const popEasy = routines.find(routine => routine.id === 'pop-easy')!;
    expect(popEasy.warmup).toBe('shoulder-roll');
    expect(popEasy.sections[0]!.move).toBe('side-wave');
    expect(popEasy.sections.every(section => moves.find(move => move.id === section.move)?.seated_ok)).toBe(true);
    for (const routine of routines) {
      expect(routine.sections.some(section => section.move === 'shoulder-roll')).toBe(false);
      expect(routine.cooldown).not.toBe('shoulder-roll');
    }
  });

  it('gives clap-2x two pairs of energy peaks across the eight beats', () => {
    expect(movesData.find(move => move.id === 'clap-2x')!.template).toEqual([0.6, 0.6, 0, 0, 0.6, 0.6, 0, 0]);
  });
});

describe('move validation rejects malformed assets and motion templates', () => {
  it.each([
    ['id', 'Clap-2x'], ['id', 'clap_2x'], ['id', '-clap'], ['id', 'clap--2x'],
    ['name_zh', ' '], ['name_en', ''], ['difficulty', 'expert'], ['beats', 4],
    ['body', 'legs'], ['seated_ok', 'true'], ['seated_ok', false],
    ['icon', 'other.png'], ['icon', '../clap-2x.png'], ['clip', 'other.glb'], ['clip', 'clap-2x.GLB'],
    ['template', Array(7).fill(0)], ['template', Array(9).fill(0)],
    ['template', [-0.1, 0, 0, 0, 0, 0, 0, 0]], ['template', [1.1, 0, 0, 0, 0, 0, 0, 0]],
    ['template', [NaN, 0, 0, 0, 0, 0, 0, 0]], ['template', [Infinity, 0, 0, 0, 0, 0, 0, 0]],
    ['native_bpm', 0], ['native_bpm', -1], ['native_bpm', Infinity], ['native_bpm', NaN],
  ])('rejects invalid %s = %j', (field, value) => {
    expect(moveSchema.safeParse({ ...movesData[0], [field as string]: value }).success).toBe(false);
  });

  it('accepts normalized energy endpoints 0 and 1', () => {
    expect(moveSchema.safeParse({ ...movesData[0], template: [0, 1, 0, 1, 0, 1, 0, 1] }).success).toBe(true);
  });

  it('rejects missing and unknown fields', () => {
    expect(moveSchema.safeParse({ id: 'clap-2x' }).success).toBe(false);
    expect(moveSchema.safeParse({ ...movesData[0], extra: true }).success).toBe(false);
  });

  it('rejects duplicate move ids even when asset filenames match', () => {
    const { moves } = freshLibrary();
    moves[1] = { ...moves[0]! };
    const result = movesSchema.safeParse(moves);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: [1, 'id'] })]));
  });

  it('rejects missing moves and incorrect difficulty counts', () => {
    const { moves } = freshLibrary();
    expect(movesSchema.safeParse(moves.slice(1)).success).toBe(false);
    moves[0]!.difficulty = 'medium';
    expect(movesSchema.safeParse(moves).success).toBe(false);
  });
});

describe('routine validation', () => {
  it.each([
    ['easy', 90, 100], ['medium', 110, 120], ['hard', 125, 135],
  ] as const)('enforces inclusive BPM limits for %s', (difficulty, min, max) => {
    for (const bpm of [min, max]) expect(routineSchema.safeParse(routineAtBpm(difficulty, bpm)).success).toBe(true);
    for (const bpm of [min - 1, max + 1]) expect(routineSchema.safeParse(routineAtBpm(difficulty, bpm)).success).toBe(false);
  });

  it.each([[21, false], [22, true], [26, true], [27, false]] as const)('checks duration at %i eight-beat groups / 96 BPM', (groups, valid) => {
    const routine = routineAtBpm('easy', 96);
    routine.sections = Array.from({ length: groups }, () => ({ move: 'clap-2x', repeat: 1 }));
    expect(routineSchema.safeParse(routine).success).toBe(valid);
  });

  it.each([0, 5, 1.5, -1])('rejects repeat %s', repeat => {
    const routine = freshLibrary().routines[0]!;
    routine.sections[0]!.repeat = repeat;
    expect(routineSchema.safeParse(routine).success).toBe(false);
  });

  it.each([1, 4])('accepts repeat boundary %s when duration remains valid', repeat => {
    const routine = routineAtBpm('easy', 96);
    routine.sections = Array.from({ length: 24 / repeat }, () => ({ move: 'clap-2x', repeat }));
    expect(routineSchema.safeParse(routine).success).toBe(true);
  });

  it.each([
    ['id', 'Bad_id'], ['name_zh', ''], ['name_en', ' '], ['difficulty', 'expert'],
    ['style', 'jazz'], ['bpm', 0], ['bpm', Infinity], ['bpm', NaN],
    ['sections', []], ['warmup', 'Bad_id'], ['cooldown', ''],
  ])('rejects malformed %s', (field, value) => {
    expect(routineSchema.safeParse({ ...routinesData[0], [field as string]: value }).success).toBe(false);
  });

  it('rejects missing routines, duplicate routine ids and missing style/difficulty combinations', () => {
    const { routines } = freshLibrary();
    expect(routinesSchema.safeParse(routines.slice(1)).success).toBe(false);
    routines[1]!.id = routines[0]!.id;
    expect(routinesSchema.safeParse(routines).success).toBe(false);
    routines[1]!.id = 'another-easy-routine';
    routines[1]!.style = 'square';
    expect(routinesSchema.safeParse(routines).success).toBe(false);
  });
});

describe('cross-file reference validation', () => {
  const referenceCases = ['section', 'warmup', 'cooldown'] as const;
  function setReference(routine: Routine, field: typeof referenceCases[number], id: string) {
    if (field === 'section') routine.sections[0]!.move = id;
    else routine[field] = id;
  }

  it.each(referenceCases)('rejects unknown %s references and reports their path', field => {
    const library = freshLibrary();
    setReference(library.routines[0]!, field, 'missing-move');
    const result = librarySchema.safeParse(library);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['routines', 0, ...(field === 'section' ? ['sections', 0, 'move'] : [field])],
        message: 'Unknown move: missing-move',
      }));
    }
  });

  it.each(referenceCases)('rejects harder moves in easy and medium %s references', field => {
    for (const [index, id] of [[0, 'side-step-touch'], [2, 'kemusan-hand-twirl']] as const) {
      const library = freshLibrary();
      setReference(library.routines[index]!, field, id);
      expect(librarySchema.safeParse(library).success).toBe(false);
    }
  });

  it.each(referenceCases)('rejects non-seated moves in easy %s references', field => {
    const library = freshLibrary();
    library.moves[0]!.seated_ok = false;
    setReference(library.routines[0]!, field, library.moves[0]!.id);
    expect(librarySchema.safeParse(library).success).toBe(false);
  });

  it('accepts same-level and lower-level scored section references', () => {
    const library = freshLibrary();
    setReference(library.routines[0]!, 'section', 'clap-2x');
    setReference(library.routines[2]!, 'section', 'side-step-touch');
    setReference(library.routines[4]!, 'section', 'kemusan-hand-twirl');
    expect(librarySchema.safeParse(library).success).toBe(true);
  });

  it.each(['warmup', 'cooldown'] as const)('rejects non-easy %s even within the routine difficulty and with seated support', field => {
    for (const [index, id] of [[2, 'side-step-touch'], [4, 'side-step-touch'], [4, 'kemusan-hand-twirl']] as const) {
      const library = freshLibrary();
      library.moves.find(move => move.id === id)!.seated_ok = true;
      setReference(library.routines[index]!, field, id);
      const result = librarySchema.safeParse(library);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({
          path: ['routines', index, field],
          message: 'Warmup and cooldown require easy seated moves',
        }));
      }
    }
  });

  it.each(['warmup', 'cooldown'] as const)('rejects non-seated %s at every routine difficulty', field => {
    for (const index of [0, 2, 4]) {
      const library = freshLibrary();
      const move = library.moves.find(move => move.id === library.routines[index]![field])!;
      move.seated_ok = false;
      expect(librarySchema.safeParse(library).success).toBe(false);
    }
  });

  it.each(['warmup', 'cooldown'] as const)('accepts easy seated %s with updated recording BPMs at every routine difficulty', field => {
    const library = freshLibrary();
    library.moves.find(move => move.id === 'shoulder-roll')!.native_bpm = 84.5;
    library.moves.find(move => move.id === 'open-arms')!.native_bpm = 92;
    for (const routine of library.routines) {
      expect(library.moves.find(move => move.id === routine[field])).toMatchObject({ difficulty: 'easy', seated_ok: true });
    }
    expect(librarySchema.safeParse(library).success).toBe(true);
  });
});
