// Days, parts of a day, and the slots people answer.
import { addDays, daysBetween, isDay, weekday } from "./time";
import type { Answer, Answers, Day, Grain, Lang, Part, SlotKey } from "./types";

export const HALF_PARTS: readonly Part[] = ["am", "pm", "eve"];
export const partsOf = (grain: Grain): readonly Part[] => (grain === "half" ? HALF_PARTS : ["day"]);

/** The hours a part stands for in a calendar: [hour, minute], Vancouver time. "day" is the whole day. */
export const PART_HOURS: Record<Exclude<Part, "day">, { start: [number, number]; end: [number, number] }> = {
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

export function parseSlot(key: unknown): { day: Day; part: Part } | null {
  if (typeof key !== "string") return null;
  const [day, part, more] = key.split(":");
  if (more !== undefined || !isDay(day) || !(part === "am" || part === "pm" || part === "eve" || part === "day")) return null;
  return { day, part };
}

/** Every slot of a gathering, in the order they're shown: by day, then morning to evening. */
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

const PART_ZH: Record<Part, string> = { am: "上午", pm: "下午", eve: "晚上", day: "全天" };
const PART_EN: Record<Part, string> = { am: "morning", pm: "afternoon", eve: "evening", day: "all day" };
export const partLabel = (part: Part, lang: Lang): string => (lang === "zh" ? PART_ZH : PART_EN)[part];

/** "11月21日 周六 晚上" / "Sat, Nov 21, evening"; a whole day is just the day. */
export const slotLabel = (day: Day, part: Part, lang: Lang): string =>
  part === "day" ? dayLabel(day, lang) : lang === "zh" ? `${dayLabel(day, lang)} ${partLabel(part, lang)}` : `${dayLabel(day, lang)}, ${partLabel(part, lang)}`;
