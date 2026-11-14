// What the grid says above a day: its holidays and festivals, and where a long weekend runs to.
// The dates are in holidays.ts (looked up, with their sources); this only chooses the words.
import { holidaysOn, inLongWeekend } from "./holidays";
import { dayLabel } from "./slots";
import { addDays } from "./time";
import type { Day, Lang } from "./types";

/** One piece of a day's note. `stat`: a statutory holiday in B.C. `festival`: a day people keep but don't get off. `long`: a long weekend. */
export type DayNote = { kind: "stat" | "festival" | "long"; text: string };

/**
 * The note for one day of a gathering, in pieces: statutory holidays first (and that they are
 * ones), then festivals, then how far a long weekend runs. The long weekend is said once, on its
 * first day among the days the gathering asks about. Most days have nothing: an empty list.
 */
export function dayNotes(day: Day, days: readonly Day[], lang: Lang): DayNote[] {
  const notes: DayNote[] = [];
  const today = holidaysOn(day);
  const stat = today.filter((holiday) => holiday.kind === "stat");
  for (const holiday of stat) notes.push({ kind: "stat", text: holiday[lang] });
  if (stat.length > 0) notes.push({ kind: "stat", text: lang === "zh" ? "法定假日" : "stat holiday" });
  for (const holiday of today) if (holiday.kind === "festival") notes.push({ kind: "festival", text: holiday[lang] });

  const before = addDays(day, -1);
  if (inLongWeekend(day) && !(inLongWeekend(before) && days.includes(before))) {
    let end = day;
    while (inLongWeekend(addDays(end, 1))) end = addDays(end, 1);
    if (end !== day) notes.push({ kind: "long", text: lang === "zh" ? `连休到 ${dayLabel(end, lang)}` : `long weekend to ${dayLabel(end, lang)}` });
  }
  return notes;
}

/** The same note as one line of words: "圣诞节 · 法定假日 · 连休到 12月27日 周日". Empty when there is none. */
export const dayNoteText = (day: Day, days: readonly Day[], lang: Lang): string =>
  dayNotes(day, days, lang)
    .map((note) => note.text)
    .join(" · ");
