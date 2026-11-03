/**
 * 打碟 · DJ Booth: dancing along (Steve on Nov 2: "电视那边是要玩家进行与舞蹈相匹配的舞蹈"; his plan's
 * 一起跳, docs/dance-along.md: a coach on the TV, everyone's phone in their dancing hand, its motion
 * read on the beat, easy mode: did you move, near the beat). Plain functions of the speaker's beat
 * count, so the TV's coach, every phone and the room agree on the move with nothing sent.
 */

/** The coach's moves (the performer's own, `party/tune/moves.ts`), in the order the routine runs them. */
export const DANCE_MOVES = [
  { id: "stepClap", zh: "拍手踏步", en: "Step and clap" },
  { id: "raiseRoof", zh: "举手顶天", en: "Raise the roof" },
  { id: "hipSway", zh: "左右摇", en: "Hip sway" },
  { id: "fistPump", zh: "出拳", en: "Fist pump" },
  { id: "discoPoint", zh: "迪斯科", en: "Disco point" },
  { id: "bounce", zh: "弹跳", en: "Bounce" },
  { id: "waveBoth", zh: "双手挥", en: "Wave" },
  { id: "twist", zh: "扭一扭", en: "Twist" },
  { id: "runningMan", zh: "跑步人", en: "Running man" },
  { id: "shimmy", zh: "抖肩", en: "Shimmy" },
] as const;
export type DanceMove = (typeof DANCE_MOVES)[number];

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

/** The move on beat `b` (the speaker's count), the next one, and how many beats until it. */
export function moveAt(b: number): { move: DanceMove; next: DanceMove; left: number; index: number } {
  const n = DANCE_MOVES.length;
  const k = Math.floor(b / DANCE.moveBeats);
  const at = (i: number) => DANCE_MOVES[((i % n) + n) % n];
  return { move: at(k), next: at(k + 1), left: (k + 1) * DANCE.moveBeats - b, index: ((k % n) + n) % n };
}

type Grid = { at: number; bar: number; bpm: number };

/** When beat `b` is heard (server time), from the speaker's bars. */
export const beatTime = (g: Grid, b: number) => g.at + ((b - 4 * g.bar) * 60_000) / g.bpm;
/** The beat being heard at server time `t` (fractional). */
export const beatOf = (g: Grid, t: number) => 4 * g.bar + ((t - g.at) * g.bpm) / 60_000;

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
