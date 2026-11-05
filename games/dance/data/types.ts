// The dance library's types, written out plainly so the room server and the pages
// (games/party-server) can import the library and session-flow.ts without zod.
// schema.ts checks at compile time that these are exactly what its schemas parse to.
import type { Difficulty } from '../../party-base/src/types';

export type { Difficulty } from '../../party-base/src/types';

export interface Move {
  id: string;
  name_zh: string;
  name_en: string;
  difficulty: Difficulty;
  beats: 8;
  body: 'arms' | 'arms+steps' | 'full';
  seated_ok: boolean;
  icon: string;
  clip: string;
  /** Estimated per-beat energy (0 to 1) until phone sensor recordings are available. */
  template: number[];
  /** Provisional recording tempo; the asset pipeline (C2) reports the measured one. */
  native_bpm: number;
}

export interface Section {
  move: string;
  repeat: number;
}

export interface Routine {
  id: string;
  name_zh: string;
  name_en: string;
  difficulty: Difficulty;
  bpm: number;
  style: 'square' | 'pop';
  sections: Section[];
  warmup: string;
  cooldown: string;
}

export interface MoveLibrary {
  moves: Move[];
  routines: Routine[];
}
