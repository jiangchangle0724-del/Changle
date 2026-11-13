// Once the time is set: the words to paste back into the group chat, and the way on to 随便
// (changle.ca/eat) to choose where to eat.
import { reason, type Tally } from "./rank";
import { slotLabel } from "./slots";
import { daysBetween } from "./time";
import type { Day, Lang, Part, Person } from "./types";

/** "「周末火锅」定了：11月21日 周六 晚上。8 个人里 7 个有空，阿May 可以调。" and the link under it. */
export function resultText(input: { title: string; day: Day; part: Part; tally: Tally; people: readonly Person[]; url: string }, lang: Lang): string {
  const when = slotLabel(input.day, input.part, lang);
  const why = reason(input.tally, input.people, lang);
  return lang === "zh" ? `「${input.title}」定了：${when}。${why}。\n${input.url}` : `"${input.title}" is set: ${when}. ${why}.\n${input.url}`;
}

/** The meal 随便 starts from: lunch at noon for a morning or an afternoon, dinner at 6:30 otherwise. Changeable there. */
export const mealTime = (part: Part): string => (part === "am" || part === "pm" ? "12:00" : "18:30");

/** That time the way 随便 shows it in its own list: "18:30", "6:30 p.m.". */
export function mealLabel(part: Part, lang: Lang): string {
  const lunch = part === "am" || part === "pm";
  return lang === "zh" ? mealTime(part) : lunch ? "12:00 p.m." : "6:30 p.m.";
}

/** 随便 plans a meal today or in the six days after (it knows opening hours that far ahead). */
export const EAT_DAYS_AHEAD = 6;

/** How the day that was set sits against today: already past, close enough for 随便, or too far for now. */
export function eatWhen(day: Day, today: Day): "past" | "open" | "later" {
  const ahead = daysBetween(today, day);
  return ahead < 0 ? "past" : ahead <= EAT_DAYS_AHEAD ? "open" : "later";
}

/**
 * Where the host opens a table in 随便, carrying what is known: the day, the meal's time, the
 * occasion (friends) and how many can come. 随便 doesn't read these yet (its own chat's part, see
 * docs/briefs/when.md), so until it does the page also tells the host what to pick there.
 */
export function eatLink(input: { code: string; day: Day; part: Part; coming: number }): string {
  const query = new URLSearchParams({ from: "when", code: input.code, date: input.day, time: mealTime(input.part), occasion: "friends", people: String(Math.max(1, input.coming)) });
  return `/eat/?${query}`;
}
