// Once the time is set: what the words for the group chat say (copy.ts writes them), and the way
// on to 随便 (changle.ca/eat) to choose where to eat.
import type { ResultWords } from "./copy";
import { counted, type Tally } from "./rank";
import { clock } from "./slots";
import { daysBetween } from "./time";
import type { Day, Lang, Part, Person } from "./types";
import type { Weather } from "./weather";

/**
 * What the words for the group say about the time that was set (copy.ts writes them): who is free
 * for it, and who could move things, as the page counts them. `from` and `to`: the minutes, when
 * the time was set to them. `weather`: its forecast, where the forecast reaches it.
 */
export function resultWords(input: { title: string; day: Day; part: Part; from?: number; to?: number; tally: Tally; people: readonly Person[]; url: string; weather?: Weather | null }): ResultWords {
  const { yes, maybe } = counted(input.tally);
  const names = maybe.map((id) => input.people.find((p) => p.id === id)?.name ?? "").filter(Boolean);
  return {
    title: input.title,
    url: input.url,
    day: input.day,
    part: input.part,
    from: input.from,
    to: input.to,
    coming: yes.length,
    asked: input.people.length,
    maybe: names,
    weather: input.weather ?? null,
  };
}

/**
 * The meal 随便 starts from: 宵夜 at 0:30 in the early hours, 早茶 at 10:00 in the morning, lunch at
 * noon (and for the half days' morning and afternoon), afternoon tea at 15:00, dinner at 18:30
 * otherwise. Changeable there.
 */
const MEAL: Partial<Record<Part, string>> = { dawn: "0:30", morning: "10:00", noon: "12:00", am: "12:00", pm: "12:00", afternoon: "15:00" };
/** "18:30". With `from` (a time set to the minute, narrower than its period), it starts then instead. */
export const mealTime = (part: Part, from?: number): string => (from !== undefined ? clock(from) : (MEAL[part] ?? "18:30")).padStart(5, "0");

/** That time the way 随便 shows it in its own list: "18:30", "6:30 p.m.". */
export function mealLabel(part: Part, lang: Lang, from?: number): string {
  const time = mealTime(part, from);
  if (lang === "zh") return time.replace(/^0(?=\d:)/, "");
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
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
export function eatLink(input: { code: string; day: Day; part: Part; from?: number; coming: number }): string {
  const query = new URLSearchParams({ from: "when", code: input.code, date: input.day, time: mealTime(input.part, input.from), occasion: "friends", people: String(Math.max(1, input.coming)) });
  return `/eat/?${query}`;
}
