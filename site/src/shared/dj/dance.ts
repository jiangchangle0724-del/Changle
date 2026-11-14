/**
 * 打碟 · DJ Booth: dancing along (Steve on Nov 2: "电视那边是要玩家进行与舞蹈相匹配的舞蹈"; his plan's
 * 一起跳, docs/dance-along.md: a coach on the TV, everyone's phone in their dancing hand, its motion
 * read on the beat, easy mode: did you move, near the beat). Plain functions of the speaker's beat
 * count and the night's stretch, so the TV's coach, every phone and the room agree on the move with
 * nothing more sent.
 */

import type { DjPhase } from "./types";

/**
 * The routine's moves (Steve on Nov 14: "更新一些简单的舞步适合所有的歌曲，有站着的有坐着的，慢摇，
 * 快摇…. 并且下面有文字告诉大家怎么跳"): simple ones that go with any song, standing or sitting, each
 * with a line under the coach saying how. `sit`: danced sitting down. `drawn`: the drawn coach's
 * nearest move (party/tune/moves.ts), on a screen that can't show the robot.
 */
export const DANCE_MOVES = {
  sway: { zh: "慢摇", en: "Slow sway", sit: false, drawn: "sway", how: { zh: "站着，身体左右慢慢摇，膝盖放松，手自然摆", en: "Sway side to side, slowly, knees loose" } },
  bounce: { zh: "快摇", en: "Bounce", sit: false, drawn: "bounce", how: { zh: "每一拍膝盖往下弹一下，头跟着点，双手举高晃", en: "Bounce your knees on the beat, hands up" } },
  stepClap: { zh: "踏步拍手", en: "Step and clap", sit: false, drawn: "stepClap", how: { zh: "左右踏步，每两拍拍一次手", en: "Step side to side, clap every other beat" } },
  raiseRoof: { zh: "举手顶天", en: "Raise the roof", sit: false, drawn: "raiseRoof", how: { zh: "双手举过头顶，每一拍往上推", en: "Hands over your head, push up on the beat" } },
  fistPump: { zh: "出拳", en: "Fist pump", sit: false, drawn: "fistPump", how: { zh: "一只手握拳，每一拍往上冲，另一只手叉腰", en: "Punch a fist up on the beat, other hand on hip" } },
  point: { zh: "指天指地", en: "Disco point", sit: false, drawn: "discoPoint", how: { zh: "一只手斜着指天，再往下指地，一拍一下", en: "Point up and out, then down across, on the beat" } },
  waveBoth: { zh: "双手挥", en: "Wave", sit: false, drawn: "waveBoth", how: { zh: "双手举高，一起左右挥", en: "Both hands up high, wave them side to side" } },
  shimmy: { zh: "抖肩", en: "Shimmy", sit: false, drawn: "shimmy", how: { zh: "膝盖微弯，肩膀一前一后快快地抖", en: "Knees soft, shake your shoulders, fast" } },
  twist: { zh: "扭一扭", en: "Twist", sit: false, drawn: "twist", how: { zh: "双脚并拢不动，膝盖和腰左右扭", en: "Feet together, twist your knees and hips" } },
  seatSway: { zh: "坐着摇", en: "Seated sway", sit: true, drawn: "sway", how: { zh: "坐着，上身左右慢慢摇，手在腿上打拍子", en: "Seated, sway side to side, tap your knees" } },
  kneeClap: { zh: "拍腿拍手", en: "Slap and clap", sit: true, drawn: "clapSide", how: { zh: "坐着，拍两下腿，再拍两下手", en: "Seated, slap your knees twice, clap twice" } },
  seatRoof: { zh: "坐着举手", en: "Seated roof", sit: true, drawn: "raiseRoof", how: { zh: "坐着，双手举起来，每一拍往上推", en: "Seated, hands up, push up on the beat" } },
  nod: { zh: "点头打拍子", en: "Nod along", sit: true, drawn: "snap", how: { zh: "坐着，跟着拍子点头，一只手打响指", en: "Seated, nod on the beat, snap your fingers" } },
  row: { zh: "划船", en: "Row", sit: true, drawn: "rollingArms", how: { zh: "坐着，双手往前伸，再往回拉，两拍一下", en: "Seated, reach forward, pull back, every 2 beats" } },
  seatWave: { zh: "坐着挥手", en: "Seated wave", sit: true, drawn: "lighterWave", how: { zh: "坐着，举起一只手，慢慢左右挥", en: "Seated, raise one hand and wave it slowly" } },
} as const;
export type MoveId = keyof typeof DANCE_MOVES;
export type DanceMove = (typeof DANCE_MOVES)[MoveId] & { id: MoveId };

/**
 * Which moves, in what order, for the night as it goes (each for `DANCE.moveBeats`, then round
 * again): the warm-up mostly sitting (people still settling in), getting up at its end; the build
 * standing; the peak the bounciest (快摇 first); the wind-down slow, standing then sitting down. A slow
 * song (`slowSong`) gets the gentle ones whatever the stretch.
 */
export type Mood = "warm" | "build" | "peak" | "cool" | "slow";
const GENTLE: readonly MoveId[] = ["sway", "waveBoth", "seatSway", "seatWave", "nod", "row"];
export const ROUTINES: Record<Mood, readonly MoveId[]> = {
  warm: ["seatSway", "kneeClap", "nod", "seatRoof", "sway", "stepClap"],
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
  /** the screens show the next move this many beats before it starts */
  showNext: 4,
  /** a beat is danced when the hand moves this hard (m/s², gravity taken out) this close to it (ms) */
  minAccel: 2.5,
  windowMs: 150,
  /** the room takes a phone's bar this many bars late at most (and never one it already has) */
  lateBars: 3,
  /** a bar the whole floor danced: most of those dancing hit most of its beats */
  goodShare: 0.7,
  /** the floor's combo: up this much a good bar, down this much a bad one; full: fireworks */
  comboUp: 0.125,
  comboDown: 0.25,
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

type Grid = { at: number; bar: number; bpm: number };

/** When beat `b` is heard (server time), from the speaker's bars. */
export const beatTime = (g: Grid, b: number) => g.at + ((b - 4 * g.bar) * 60_000) / g.bpm;
/** The beat being heard at server time `t` (fractional). */
export const beatOf = (g: Grid, t: number) => 4 * g.bar + ((t - g.at) * g.bpm) / 60_000;
/** A whole song's own beats (bar 0 from its first beat), where the speaker said they fall; null before it has. */
export const songGrid = (song: { at: number; beat?: { off: number; bpm: number } } | null | undefined): Grid | null =>
  song?.beat ? { at: song.at + song.beat.off, bar: 0, bpm: song.beat.bpm } : null;

/**
 * Which beats the hand danced: one whose time has a motion of at least `DANCE.minAccel` within
 * `DANCE.windowMs` of it (the plan's easy mode: you moved, near the beat). `samples` are the hand's
 * motion (server time, m/s²), oldest first.
 */
export function danced(samples: { t: number; a: number }[], beats: number[]): boolean[] {
  return beats.map((tb) => samples.some((x) => Math.abs(x.t - tb) <= DANCE.windowMs && x.a >= DANCE.minAccel));
}

/** A player's dancing tonight: beats danced of beats sent, the bars, the latest bar, bars in a row they danced most of. */
export type Dancer = { hits: number; of: number; bars: number; bar: number; streak: number };

/** How well someone danced: the share of beats they hit (0 with nothing sent). */
export const danceShare = (d: Dancer | undefined) => (d && d.of ? d.hits / d.of : 0);
