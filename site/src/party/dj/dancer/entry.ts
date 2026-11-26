/**
 * Where a new dance starts (Nov 25; Steve: "继续", after "跳舞的动作太多问题了"). The page hands one dance
 * over to the next in a moment (Dancer3D's BLEND_S), the new one at the song's beat; a dance that opens
 * facing away spun her round in it. Here: how many whole bars into the new one to start it, so that
 * through the hand-over (the beat it starts and the one after) her hips face as near the way they face
 * now as the dance has them on a bar. Bars, not beats: its steps stay on the song's bars.
 */
type Turns = { facing(dance: string, t: number): number | null; beats(dance: string): number | null };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** beats to add to the new dance's time (0 when it can't tell) */
export function entryOf(her: Turns, dance: string, beat: number, now: number | null): number {
  const n = her.beats(dance);
  if (now === null || !n) return 0;
  let best = 0;
  let bestOff = Infinity;
  for (let skip = 0; skip < n; skip += 4) {
    let off = 0;
    for (const s of [0, 0.5, 1, 1.5]) {
      const f = her.facing(dance, beat + skip + s);
      if (f === null) return 0;
      off = Math.max(off, Math.abs(wrap(f - now)));
    }
    // (the first bar unless another faces her a good deal nearer: 0.3 rad, about 17 degrees)
    if (off < bestOff - (best === 0 && skip > 0 ? 0.3 : 0)) {
      best = skip;
      bestOff = off;
    }
  }
  return best;
}
