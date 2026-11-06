// 对拍: someone on the speaker page taps along to a song, from its first strong beat, 16 times. From
// the taps (each at its time in the video, the TV's delay taken out), the song's beat: where the
// beat falls (the taps' average place in the beat, a circular mean, so taps either side of it
// don't cancel out), how tightly they agree, and the dance's first beat: the beat nearest the first
// tap. A tap on every beat or on every half beat both work (a fast song danced at half its tempo).

export const TAPS_WANTED = 16;
const MIN_TAPS = 8;
/** Taps on average further than this share of a beat from their beat are too loose to go by. */
const MAX_SPREAD = 0.2;

export type TapAlong = { ok: true; firstBeatMs: number; spreadMs: number; taps: number; halfBeats: boolean } | { ok: false; why: "few" | "uneven" | "spread" };

/** `taps`: video times (ms) of the beats heard, in order. `beatMs`: the dance's beat. */
export function tapAlong(taps: readonly number[], beatMs: number): TapAlong {
  const v = taps.filter((t) => Number.isFinite(t));
  if (v.length < MIN_TAPS || !(beatMs > 0)) return { ok: false, why: "few" };
  const gaps = v.slice(1).map((t, i) => t - v[i]!).sort((a, b) => a - b);
  const mid = gaps[gaps.length >> 1]!;
  let period: number;
  if (Math.abs(mid - beatMs) <= 0.2 * beatMs) period = beatMs;
  else if (Math.abs(mid - beatMs / 2) <= 0.12 * beatMs) period = beatMs / 2;
  else return { ok: false, why: "uneven" };
  let c = 0;
  let s = 0;
  for (const t of v) {
    const a = (2 * Math.PI * t) / period;
    c += Math.cos(a);
    s += Math.sin(a);
  }
  const r = Math.hypot(c, s) / v.length;
  const phase = ((((Math.atan2(s, c) / (2 * Math.PI)) * period) % period) + period) % period;
  const spreadMs = r > 0 ? (period / (2 * Math.PI)) * Math.sqrt(-2 * Math.log(Math.min(1, r))) : Infinity;
  if (!(spreadMs <= MAX_SPREAD * beatMs)) return { ok: false, why: "spread" };
  const first = phase + Math.round((v[0]! - phase) / period) * period;
  return { ok: true, firstBeatMs: Math.round(first), spreadMs: Math.round(spreadMs), taps: v.length, halfBeats: period !== beatMs };
}
