// Vancouver time, for a tool that only looks ahead. B.C. stopped changing its clocks on 8 March
// 2026 and has been UTC-7 all year since; every day in a gathering is after that. So the offset is
// written here once and nothing asks the phone's or the server's time-zone table, which on some
// devices still says UTC-8 in winter.
import type { Day } from "./types";

export const VANCOUVER_OFFSET_MS = -7 * 3_600_000;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
const fromUtc = (ms: number): Day => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
/** Midnight UTC of the day's own date: a handle for calendar arithmetic, not an instant in Vancouver. */
const utcMidnight = (day: Day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** A real calendar day, written "2026-11-21". */
export function isDay(value: unknown): value is Day {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(utcMidnight(value)) === value;
}

/** The Vancouver day at an instant, or that many days after it. */
export const vancouverDay = (ms: number, plusDays = 0): Day => fromUtc(ms + VANCOUVER_OFFSET_MS + plusDays * DAY_MS);

export const addDays = (day: Day, n: number): Day => fromUtc(utcMidnight(day) + n * DAY_MS);

/** Whole days from one day to another (negative when `to` is earlier). */
export const daysBetween = (from: Day, to: Day): number => Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);

/** 0 Sunday … 6 Saturday. */
export const weekday = (day: Day): number => new Date(utcMidnight(day)).getUTCDay();

/** The instant of a time of day in Vancouver on that day. */
export const instant = (day: Day, hour = 0, minute = 0): number => utcMidnight(day) + hour * 3_600_000 + minute * 60_000 - VANCOUVER_OFFSET_MS;
