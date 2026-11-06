// What a room can play: the dance library in games/dance (20 moves of 8 beats, 6 routines; its own
// tests check the data), the 120 BPM metronome (A1's timing test) and a short routine for the
// browser check. The room and both pages import the same data, so they agree on every beat with
// nothing but the routine's id sent.
import movesData from "../../../dance/data/moves.json";
import routinesData from "../../../dance/data/routines.json";
import type { Move, Routine } from "../../../dance/data/types";

export type { Move, Routine } from "../../../dance/data/types";

export const MOVES = movesData as unknown as readonly Move[];
/** The six dances, in the order the host's phone lists them: easy first. */
export const ROUTINES = routinesData as unknown as readonly Routine[];

/** A1's click track: two minutes at 120 BPM, no moves. */
export const METRONOME_ID = "metronome-120";

/**
 * Two moves once each (8 seconds of dance), for scripts/song-check.cjs. The room only starts it
 * when the Worker runs with ALLOW_TEST_SETTINGS=1 (local checks), and no page lists it.
 */
export const TEST_ROUTINE: Routine = {
  id: "test-short",
  name_zh: "测试用短舞",
  name_en: "Short test routine",
  difficulty: "easy",
  bpm: 120,
  style: "pop",
  sections: [
    { move: "clap-2x", repeat: 1 },
    { move: "raise-arms", repeat: 1 },
  ],
  warmup: "shoulder-roll",
  cooldown: "open-arms",
};

const byId = new Map(MOVES.map((m) => [m.id, m]));
export const moveById = (id: string): Move | null => byId.get(id) ?? null;

export function routineById(id: string): Routine | null {
  if (id === TEST_ROUTINE.id) return TEST_ROUTINE;
  return ROUTINES.find((r) => r.id === id) ?? null;
}
