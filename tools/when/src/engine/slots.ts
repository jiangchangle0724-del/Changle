// Days, parts of a day, and the slots people answer.
import { addDays, daysBetween, isDay, weekday } from "./time";
import type { Answer, Answers, Day, Grain, Lang, Part, SlotKey } from "./types";

/** The periods of a day, from midnight on. */
export const PERIOD_PARTS: readonly Part[] = ["dawn", "morning", "noon", "afternoon", "eve"];
/** How gatherings made before 2026-11-14 were asked. */
export const HALF_PARTS: readonly Part[] = ["am", "pm", "eve"];
export const partsOf = (grain: Grain): readonly Part[] => (grain === "periods" ? PERIOD_PARTS : grain === "half" ? HALF_PARTS : ["day"]);

/** The minutes of the day each period covers, counted from midnight: from its start, up to (not including) its end. 晚上 runs to 23:59. */
export const PERIOD_MINUTES: Readonly<Record<string, readonly [number, number]>> = {
  dawn: [0, 360],
  morning: [360, 660],
  noon: [660, 840],
  afternoon: [840, 1080],
  eve: [1080, 1439],
};
/** A period's minutes in a gathering asked by the period; null for the half days and the whole day, which have no stated hours. */
export const partRange = (grain: Grain, part: Part): readonly [number, number] | null => (grain === "periods" ? (PERIOD_MINUTES[part] ?? null) : null);

/** "19:30", "0:00", "23:59": a time of day from its minutes. */
export const clock = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
/** "18–24": a period's hours, short, for the top of a column. */
export const hoursLabel = ([from, to]: readonly [number, number]): string => `${Math.floor(from / 60)}–${Math.ceil(to / 60)}`;

/** The hours a part stands for in a calendar: [hour, minute], Vancouver time. "day" is the whole day. */
export const PART_HOURS: Record<Exclude<Part, "day">, { start: [number, number]; end: [number, number] }> = {
  dawn: { start: [0, 0], end: [6, 0] },
  morning: { start: [6, 0], end: [11, 0] },
  noon: { start: [11, 0], end: [14, 0] },
  afternoon: { start: [14, 0], end: [18, 0] },
  am: { start: [9, 0], end: [12, 0] },
  pm: { start: [13, 0], end: [17, 0] },
  eve: { start: [18, 0], end: [22, 0] },
};

/** A gathering asks about at most this many days… */
export const MAX_DAYS = 31;
/** …none further than this many days after today. */
export const MAX_AHEAD = 56;
/** The days a new gathering starts with: today and the 13 after it. */
export const DEFAULT_DAYS = 14;

export const slotKey = (day: Day, part: Part): SlotKey => `${day}:${part}`;
const ALL_PARTS: ReadonlySet<string> = new Set<Part>(["dawn", "morning", "noon", "afternoon", "am", "pm", "eve", "day"]);

export function parseSlot(key: unknown): { day: Day; part: Part } | null {
  if (typeof key !== "string") return null;
  const [day, part, more] = key.split(":");
  if (more !== undefined || !isDay(day) || !ALL_PARTS.has(part)) return null;
  return { day, part: part as Part };
}

/** Every slot of a gathering, in the order they're shown: by day, then from the first part of the day to the last. */
export const slotsOf = (days: readonly Day[], grain: Grain): SlotKey[] => days.flatMap((day) => partsOf(grain).map((part) => slotKey(day, part)));

/** The days a host may ask about, checked and put in order; null when the list won't do. */
export function cleanDays(input: unknown, today: Day): Day[] | null {
  if (!Array.isArray(input)) return null;
  const days = [...new Set(input.filter(isDay))].sort();
  if (days.length !== input.length || days.length < 1 || days.length > MAX_DAYS) return null;
  if (daysBetween(today, days[0]) < 0 || daysBetween(today, days[days.length - 1]) > MAX_AHEAD) return null;
  return days;
}

/** Someone's answers as sent by a phone: only this gathering's slots, only 1 or 2. */
export function cleanAnswers(input: unknown, slots: ReadonlySet<SlotKey>): Answers {
  const out: Answers = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (slots.has(key) && (value === 1 || value === 2)) out[key] = value;
  }
  return out;
}

/** What a tap does: not free, free, could move things, and round again. */
export const nextAnswer = (now: Answer | undefined): Answer | undefined => (now === undefined ? 2 : now === 2 ? 1 : undefined);

/** The default days of a new gathering. */
export const defaultDays = (today: Day): Day[] => Array.from({ length: DEFAULT_DAYS }, (_, i) => addDays(today, i));

const WEEK_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const weekdayLabel = (day: Day, lang: Lang): string => (lang === "zh" ? WEEK_ZH : WEEK_EN)[weekday(day)];
/** "11月21日" / "Nov 21". */
export const dateLabel = (day: Day, lang: Lang): string => {
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return lang === "zh" ? `${month}月${date}日` : `${MONTH_EN[month - 1]} ${date}`;
};
/** "11月21日 周六" / "Sat, Nov 21". */
export const dayLabel = (day: Day, lang: Lang): string => (lang === "zh" ? `${dateLabel(day, lang)} ${weekdayLabel(day, lang)}` : `${weekdayLabel(day, lang)}, ${dateLabel(day, lang)}`);

const PART_ZH: Record<Part, string> = { dawn: "凌晨", morning: "早上", noon: "中午", afternoon: "下午", am: "上午", pm: "下午", eve: "晚上", day: "全天" };
// 凌晨 of a Saturday is what English calls Friday night: "early hours" keeps it on the right day
const PART_EN: Record<Part, string> = { dawn: "early hours", morning: "morning", noon: "midday", afternoon: "afternoon", am: "morning", pm: "afternoon", eve: "evening", day: "all day" };
export const partLabel = (part: Part, lang: Lang): string => (lang === "zh" ? PART_ZH : PART_EN)[part];
/** A part's name at the top of its column. The hours go under it, so 凌晨 can be "Night" there; "After­noon" may break at its soft hyphen. */
const HEAD_EN: Record<Part, string> = { dawn: "Night", morning: "Morning", noon: "Midday", afternoon: "After\u00adnoon", am: "Morning", pm: "Afternoon", eve: "Evening", day: "All day" };
export const partHeading = (part: Part, lang: Lang): string => (lang === "zh" ? PART_ZH[part] : HEAD_EN[part]);
/** "11/21" / "Nov 21": a date as short as it goes, for the side of a crowded grid. */
export const shortDate = (day: Day, lang: Lang): string => (lang === "zh" ? `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}` : dateLabel(day, lang));

/** "11月21日 周六 晚上" / "Sat, Nov 21, evening"; a whole day is just the day. */
export const slotLabel = (day: Day, part: Part, lang: Lang): string =>
  part === "day" ? dayLabel(day, lang) : lang === "zh" ? `${dayLabel(day, lang)} ${partLabel(part, lang)}` : `${dayLabel(day, lang)}, ${partLabel(part, lang)}`;
