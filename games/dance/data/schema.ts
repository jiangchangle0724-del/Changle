import { z } from 'zod';
import type { Difficulty } from '../../party-base/src/types';

export type { Difficulty } from '../../party-base/src/types';

export const difficultySchema = z.enum(['easy', 'medium', 'hard'] satisfies [Difficulty, ...Difficulty[]]);
const difficultyRank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
const bpmRanges: Record<Difficulty, readonly [number, number]> = {
  easy: [90, 100], medium: [110, 120], hard: [125, 135],
};
const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nameSchema = z.string().trim().min(1);

export const moveSchema = z.object({
  id: idSchema,
  name_zh: nameSchema,
  name_en: nameSchema,
  difficulty: difficultySchema,
  beats: z.literal(8),
  body: z.enum(['arms', 'arms+steps', 'full']),
  seated_ok: z.boolean(),
  icon: z.string(),
  clip: z.string(),
  // Estimated per-beat energy until phone sensor recordings are available.
  template: z.array(z.number().finite().min(0).max(1)).length(8),
  // Provisional recording tempo; C2 replaces it with the measured BPM.
  native_bpm: z.number().finite().positive(),
}).strict().superRefine((move, ctx) => {
  for (const [field, extension] of [['icon', 'png'], ['clip', 'glb']] as const) {
    if (move[field] !== `${move.id}.${extension}`) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `Expected ${move.id}.${extension}` });
    }
  }
  if (move.difficulty === 'easy' && !move.seated_ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['seated_ok'], message: 'Easy moves must support seated play' });
  }
});

export const sectionSchema = z.object({
  move: idSchema,
  repeat: z.number().int().min(1).max(4),
}).strict();

export const routineSchema = z.object({
  id: idSchema,
  name_zh: nameSchema,
  name_en: nameSchema,
  difficulty: difficultySchema,
  bpm: z.number().finite().positive(),
  style: z.enum(['square', 'pop']),
  sections: z.array(sectionSchema).min(1),
  warmup: idSchema,
  cooldown: idSchema,
}).strict().superRefine((routine, ctx) => {
  const [min, max] = bpmRanges[routine.difficulty];
  if (routine.bpm < min || routine.bpm > max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bpm'], message: `Expected ${min}–${max} BPM` });
  }
  const seconds = routine.sections.reduce((beats, section) => beats + section.repeat * 8, 0) * 60 / routine.bpm;
  if (seconds < 110 || seconds > 130) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections'], message: `Routine must last 110–130 seconds (got ${seconds})` });
  }
});

function checkUniqueIds(items: { id: string }[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'id'], message: `Duplicate id: ${item.id}` });
    }
    seen.add(item.id);
  });
}

export const movesSchema = z.array(moveSchema).length(20).superRefine((moves, ctx) => {
  checkUniqueIds(moves, ctx);
  for (const [difficulty, count] of Object.entries({ easy: 8, medium: 7, hard: 5 })) {
    if (moves.filter(move => move.difficulty === difficulty).length !== count) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected ${count} ${difficulty} moves` });
    }
  }
});

export const routinesSchema = z.array(routineSchema).length(6).superRefine((routines, ctx) => {
  checkUniqueIds(routines, ctx);
  for (const difficulty of difficultySchema.options) {
    for (const style of ['square', 'pop'] as const) {
      if (routines.filter(routine => routine.difficulty === difficulty && routine.style === style).length !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected one ${difficulty} ${style} routine` });
      }
    }
  }
});

/** Parse both files together to validate references, including warmup/cooldown. */
export const librarySchema = z.object({ moves: movesSchema, routines: routinesSchema }).strict().superRefine((library, ctx) => {
  const moves = new Map(library.moves.map(move => [move.id, move]));
  library.routines.forEach((routine, index) => {
    const references = [
      ...routine.sections.map((section, sectionIndex) => ({ id: section.move, path: ['sections', sectionIndex, 'move'] })),
      { id: routine.warmup, path: ['warmup'] },
      { id: routine.cooldown, path: ['cooldown'] },
    ];
    for (const reference of references) {
      const move = moves.get(reference.id);
      const path = ['routines', index, ...reference.path];
      if (!move) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `Unknown move: ${reference.id}` });
      } else if (reference.path[0] !== 'sections' && (move.difficulty !== 'easy' || !move.seated_ok)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Warmup and cooldown require easy seated moves' });
      } else if (difficultyRank[move.difficulty] > difficultyRank[routine.difficulty]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Move exceeds routine difficulty' });
      } else if (routine.difficulty === 'easy' && !move.seated_ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Easy routines require seated moves' });
      }
    }
  });
});

export type Move = z.infer<typeof moveSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type MoveLibrary = z.infer<typeof librarySchema>;
