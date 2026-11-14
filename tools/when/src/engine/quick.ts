// Filling in many slots with one tap: a whole day, every weekend, every evening, everything.
// A quick fill says "free" for all of its slots; pressed again when they all are, it takes them
// back. What it doesn't cover stays as it was. None of them covers 凌晨 (0:00–6:00): nobody who
// says "any time" means the middle of the night, and someone who does taps those themselves.
import { partsOf, slotKey } from "./slots";
import { weekday } from "./time";
import type { Answers, Day, Grain, SlotKey } from "./types";

export type Quick = { kind: "all" } | { kind: "weekends" } | { kind: "evenings" } | { kind: "day"; day: Day };

/** The slots a quick fill covers in this gathering; none when it has no such slots (no weekend among the days, no evenings in a gathering asked by the day). */
export function quickSlots(quick: Quick, days: readonly Day[], grain: Grain): SlotKey[] {
  const parts = partsOf(grain).filter((part) => part !== "dawn");
  const of = (wanted: readonly Day[], which = parts) => wanted.flatMap((day) => which.map((part) => slotKey(day, part)));
  if (quick.kind === "all") return of(days);
  if (quick.kind === "day") return days.includes(quick.day) ? of([quick.day]) : [];
  if (quick.kind === "weekends") return of(days.filter((day) => weekday(day) % 6 === 0));
  return of(days, parts.filter((part) => part === "eve"));
}

/** Every one of these slots is answered "free". False for no slots at all. */
export const allFree = (answers: Answers, slots: readonly SlotKey[]): boolean => slots.length > 0 && slots.every((slot) => answers[slot] === 2);

/** The answers after a quick fill of these slots: all of them free, or, when they all were already, none of them answered. */
export function quickFill(answers: Answers, slots: readonly SlotKey[]): Answers {
  const next = { ...answers };
  if (allFree(answers, slots)) for (const slot of slots) delete next[slot];
  else for (const slot of slots) next[slot] = 2;
  return next;
}
