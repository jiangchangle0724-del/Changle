// Will there be a queue? Google doesn't tell us (no live busyness in its API), so this is an
// estimate from rules, corrected by what people at our tables reported after eating there.
import type { Place } from "./types";

export type WaitLevel = 0 | 1 | 2;
export type WaitReason = "peak" | "popular" | "veryPopular" | "reviews" | "reservable" | "ours";

export interface WaitEstimate {
  level: WaitLevel;
  reasons: WaitReason[];
  /** Typical minutes from our own reports, when we have at least two. */
  ours?: number;
}

const QUEUE_WORDS = /排队|排隊|排了|排长队|排長隊|要排|等位|等了|等很久|等太久|line ?up|lineup|long line|queue|wait(ed)? (for )?(over |about |around )?\d+|waited/i;

/** Does a review talk about queueing? */
export const mentionsQueue = (text: string) => QUEUE_WORDS.test(text);

function isPeak(p: Place, dow: number, minutes: number): boolean {
  const weekend = dow === 0 || dow === 6;
  const between = (a: number, b: number) => minutes >= a && minutes < b;
  if (weekend && (p.cuisine === "cantonese" || p.cuisine === "brunch") && between(600, 810)) return true;
  if ((dow === 5 || dow === 6) && between(1050, 1230)) return true;
  if (between(1080, 1170)) return true;
  return between(705, 795) && (p.ratings ?? 0) >= 500;
}

export function estimateWait(p: Place, clock: { dow: number; minutes: number }): WaitEstimate {
  const peak = isPeak(p, clock.dow, clock.minutes);
  const waits = p.ours?.waits ?? [];
  if (waits.length >= 2) {
    const sorted = [...waits].sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length / 2)];
    let level: WaitLevel = typical < 10 ? 0 : typical < 25 ? 1 : 2;
    // Reports come mostly from dinner time; off-peak it's usually one step better.
    if (!peak && level > 0) level = (level - 1) as WaitLevel;
    return { level, reasons: peak ? ["ours", "peak"] : ["ours"], ours: typical };
  }
  const reasons: WaitReason[] = [];
  let points = 0;
  if (peak) {
    points += 1;
    reasons.push("peak");
  }
  const n = p.ratings ?? 0;
  if (n >= 1500) {
    points += peak ? 1 : 0.5;
    reasons.push("veryPopular");
  } else if (n >= 500) {
    points += 0.5;
    reasons.push("popular");
  }
  if (p.waitQuote) {
    points += 0.75;
    reasons.push("reviews");
  }
  if (p.reservable) {
    points -= 0.5;
    reasons.push("reservable");
  }
  const level: WaitLevel = points >= 2 ? 2 : points >= 1 ? 1 : 0;
  return { level, reasons };
}
