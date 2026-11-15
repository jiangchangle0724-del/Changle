/**
 * 打碟 · DJ Booth: the night's recap (今晚回顾, the plan's C8), from the room's view: how long the
 * music played, the styles on the air and for how long, the songs asked for that played, who was
 * most fired up, who dropped perfectly, how the sound held up. Plain functions: the TV's end card
 * and the phones read the same numbers.
 */
import type { StyleId } from "../../shared/dj/types";
import type { DjView, ReqView } from "../../shared/protocol";

export type Recap = {
  /** minutes of music tonight (between sets the music stops) */
  minutes: number;
  /** 🔥 tonight, everyone */
  fires: number;
  /** the styles on the air the longest (the host's songs: `mine`), at most three, half a minute or more */
  styles: { style: StyleId | "mine"; minutes: number }[];
  /** the songs asked for that played, oldest first */
  songs: ReqView[];
  /** the most 🔥, and the most perfect drops: at most three each, with their counts */
  fans: { pid: string; n: number }[];
  perfect: { pid: string; n: number }[];
  /** the speaker's stalls this night (0: the sound never broke) */
  stalls: number;
};

const top = (counts: Record<string, number>) =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pid, n]) => ({ pid, n }));

/** The night's recap in `v`, as of `now` (server time): its end, once a set is over. */
export function recapOf(v: DjView, now: number): Recap {
  const end = v.phase === "end" ? v.phaseAt : now;
  const aired = v.deck?.aired ?? [];
  // how long each style was on the air tonight (the music stopped between sets: `off`)
  const ms = new Map<StyleId | "mine", number>();
  let all = 0;
  aired.forEach((a, k) => {
    const until = Math.min(end, aired[k + 1]?.at ?? end);
    if (a.style === "off" || until <= a.at) return;
    ms.set(a.style, (ms.get(a.style) ?? 0) + until - a.at);
    all += until - a.at;
  });
  // (a booth from before the record: this set's time)
  const played = aired.length ? all : v.liveAt ? end - v.liveAt : 0;
  const minutes = played > 0 ? Math.max(1, Math.round(played / 60_000)) : 0;
  const styles = [...ms.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, t]) => t >= 30_000)
    .slice(0, 3)
    .map(([style, t]) => ({ style, minutes: Math.max(1, Math.round(t / 60_000)) }));
  return {
    minutes,
    fires: Object.values(v.total).reduce((a, b) => a + b, 0),
    styles,
    songs: v.deck?.heard ?? [],
    fans: top(v.total),
    perfect: top(v.deck?.perfects ?? {}),
    stalls: v.speaker?.stalls ?? 0,
  };
}
