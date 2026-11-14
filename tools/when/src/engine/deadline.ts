// When to answer by: a moment, shown and picked in Vancouver time like everything else here. It
// only marks who is still to answer; answers are taken after it as before.
import { clock, dayLabel } from "./slots";
import { addDays, daysBetween, instant, VANCOUVER_OFFSET_MS, vancouverDay } from "./time";
import type { Day, Lang } from "./types";

const DAY_MS = 86_400_000;
/** How far into its Vancouver day a moment is, in minutes. */
export const vancouverMinutes = (ms: number): number => Math.floor(((((ms + VANCOUVER_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);

/** "11月19日 周四 20:00", "Thu, Nov 19, 20:00": the words the page and the group messages use. */
export function deadlineLabel(ms: number, lang: Lang): string {
  const day = dayLabel(vancouverDay(ms), lang);
  const at = clock(vancouverMinutes(ms));
  return lang === "zh" ? `${day} ${at}` : `${day}, ${at}`;
}

/** The days a deadline can fall on: today to the last day asked about. */
export function deadlineDays(today: Day, days: readonly Day[]): Day[] {
  const last = days[days.length - 1] ?? today;
  const n = Math.max(0, daysBetween(today, last));
  return Array.from({ length: n + 1 }, (_, i) => addDays(today, i));
}

/** A day and a time of it, in Vancouver, as a moment. */
export const deadlineAt = (day: Day, minutes: number): number => instant(day, 0, minutes);
