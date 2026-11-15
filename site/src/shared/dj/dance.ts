/**
 * 打碟 · DJ Booth: what the dancer on the big screen dances (the bar's dancer, there to lift the room:
 * Steve on Nov 14, "她更像一个在酒吧跳舞的角色来烘托气氛的"). Plain functions of the speaker's beat
 * count and the night's stretch. Until Nov 14 the phones danced along with her too (跟着跳, scored on
 * the beat); Steve took that out the same day ("把跟着跳的功能也删了"), and her sitting down with it
 * ("她也不需要坐着了"), so only the big screen reads this now.
 */

import type { DjPhase } from "./types";

/**
 * Her moves: simple ones that go with any song, all standing. `drawn`: the drawn dancer's nearest
 * move (party/tune/moves.ts), on a screen that can't show her in 3D.
 */
export const DANCE_MOVES = {
  sway: { zh: "慢摇", en: "Slow sway", drawn: "sway" },
  bounce: { zh: "快摇", en: "Bounce", drawn: "bounce" },
  stepClap: { zh: "踏步拍手", en: "Step and clap", drawn: "stepClap" },
  raiseRoof: { zh: "举手顶天", en: "Raise the roof", drawn: "raiseRoof" },
  fistPump: { zh: "出拳", en: "Fist pump", drawn: "fistPump" },
  point: { zh: "指天指地", en: "Disco point", drawn: "discoPoint" },
  waveBoth: { zh: "双手挥", en: "Wave", drawn: "waveBoth" },
  shimmy: { zh: "抖肩", en: "Shimmy", drawn: "shimmy" },
  twist: { zh: "扭一扭", en: "Twist", drawn: "twist" },
} as const;
export type MoveId = keyof typeof DANCE_MOVES;
export type DanceMove = (typeof DANCE_MOVES)[MoveId] & { id: MoveId };

/**
 * Which moves, in what order, for the night as it goes (each for `DANCE.moveBeats`, then round
 * again): the warm-up easy, the build stepping out, the peak the bounciest (快摇 first), the wind-down
 * slow. A slow song (`slowSong`) gets the gentle ones whatever the stretch.
 */
export type Mood = "warm" | "build" | "peak" | "cool" | "slow";
const GENTLE: readonly MoveId[] = ["sway", "waveBoth"];
export const ROUTINES: Record<Mood, readonly MoveId[]> = {
  warm: ["sway", "waveBoth", "twist", "stepClap"],
  build: ["stepClap", "point", "waveBoth", "twist", "raiseRoof", "sway"],
  peak: ["bounce", "fistPump", "raiseRoof", "shimmy", "waveBoth", "point"],
  cool: GENTLE,
  slow: GENTLE,
};
/** A whole song slower than this, by its own tempo (as found), gets the slow routine. */
export const SLOW_BPM = 90;
/** A ballad, say, by its own tempo (not the one it's danced at: `danceBpm` doubles one under 70). */
export const slowSong = (bpm: number | null | undefined) => typeof bpm === "number" && bpm >= 40 && bpm < SLOW_BPM;

/** The routine for the night's stretch (the room's), or for a slow song playing whole. */
export function moodOf(phase: DjPhase, slow = false): Mood {
  if (slow) return "slow";
  return phase === "warm" || phase === "build" || phase === "peak" || phase === "cool" ? phase : "build";
}

export const DANCE = {
  /** beats a move lasts (four bars: two eights, then the next) */
  moveBeats: 16,
} as const;

/** The move on beat `b` (the speaker's count, or a song's from its start) in `mood`'s routine, the next one, and how many beats until it. */
export function moveAt(b: number, mood: Mood = "build"): { move: DanceMove; next: DanceMove; left: number; index: number } {
  const list = ROUTINES[mood];
  const n = list.length;
  const k = Math.floor(b / DANCE.moveBeats);
  const at = (i: number): DanceMove => {
    const id = list[((i % n) + n) % n];
    return { id, ...DANCE_MOVES[id] };
  };
  return { move: at(k), next: at(k + 1), left: (k + 1) * DANCE.moveBeats - b, index: ((k % n) + n) % n };
}
