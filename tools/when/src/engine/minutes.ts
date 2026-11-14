// Times within a period, to the minute (Steve, 2026-11-14: "精确到分钟"). Someone free for only
// part of a period says which part; the best three then look for the stretch of each period that
// suits the most people, and that stretch is the time that gets set. Only gatherings asked by the
// period have this: a half day and a whole day have no stated hours.
import { clock, dayLabel, parseSlot, partRange, slotLabel } from "./slots";
import type { Answers, Day, Grain, Lang, Part, Person, SlotKey, Times } from "./types";

/** The shortest stretch someone can give, and the shortest the best three count as a time to meet. */
export const MIN_SPAN = 30;

/** A stretch of a day: minutes from midnight, from `from` up to (not including) `to`. */
export type Span = readonly [number, number];

/** "19:30–22:00". */
export const spanLabel = ([from, to]: Span): string => `${clock(from)}–${clock(to)}`;

/** The part of a slot someone is free for: what they gave, or the whole period. */
export function spanOf(person: Pick<Person, "times">, slot: SlotKey, range: Span): Span {
  const given = person.times?.[slot];
  return given ? [given[0], given[1]] : range;
}

/**
 * Someone's times as sent by a phone: only for slots they answered, only in a gathering asked by
 * the period, whole minutes inside the period, half an hour or more. The whole period is left out:
 * it's what an answer without a time already means.
 */
export function cleanTimes(input: unknown, answers: Answers, grain: Grain): Times {
  const out: Times = {};
  if (grain !== "periods" || !input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!Object.hasOwn(answers, key)) continue;
    const slot = parseSlot(key);
    const range = slot && partRange(grain, slot.part);
    if (!range || !Array.isArray(value) || value.length !== 2) continue;
    const [from, to] = value as unknown[];
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    const span = [from as number, to as number];
    if (span[0] < range[0] || span[1] > range[1] || span[1] - span[0] < MIN_SPAN) continue;
    if (span[0] === range[0] && span[1] === range[1]) continue;
    out[key] = span;
  }
  return out;
}

/** A time to meet within one slot, and who it suits: free for all of it, or could move things for all of it. */
export type Meet = { yes: string[]; maybe: string[]; from: number; to: number };

type Entry = { id: string; answer: 1 | 2; span: Span };

/** Everyone who answered a slot, with the part of it they gave; in the order they joined. */
export function entriesOf(people: readonly Person[], slot: SlotKey, range: Span): Entry[] {
  const out: Entry[] = [];
  for (const p of people) {
    const answer = p.answers[slot];
    if (answer === 1 || answer === 2) out.push({ id: p.id, answer, span: spanOf(p, slot, range) });
  }
  return out;
}

const ids = (entries: readonly Entry[]) => entries.map((e) => e.id);

/** Who is free, and who could move things, for every minute of [from, to). */
export function covering(entries: readonly Entry[], from: number, to: number): { yes: string[]; maybe: string[] } {
  const all = entries.filter((e) => e.span[0] <= from && e.span[1] >= to);
  return { yes: ids(all.filter((e) => e.answer === 2)), maybe: ids(all.filter((e) => e.answer === 1)) };
}

/**
 * The stretch of a period that suits the most people. Every half hour that could start a meeting
 * is tried (it is enough to try the period's start and each time someone's part starts): the most
 * free for all of it wins, then the most who could move things. The time is then as long as the
 * free people (or, with nobody free, the could-move-things people) all have, and it counts who is
 * free and who could move things for all of it; the longest such time wins a tie, then the
 * earliest. `must`: people who must be there; a stretch has all of them, and their time bounds it
 * even when they could only move things. Null when nobody answered, or when no stretch has
 * everyone who must be there.
 */
export function meet(range: Span, entries: readonly Entry[], must: readonly string[] = []): Meet | null {
  const starts = [...new Set([range[0], ...entries.map((e) => e.span[0])])].sort((a, b) => a - b);
  let found: Meet | null = null;
  for (const start of starts) {
    const end = start + MIN_SPAN;
    if (end > range[1]) continue;
    const here = entries.filter((e) => e.span[0] <= start && e.span[1] >= end);
    if (must.some((id) => !here.some((e) => e.id === id))) continue;
    const yes = here.filter((e) => e.answer === 2);
    // the time is as long as the free people all have (with nobody free, everyone here), and anyone who must be there
    const lead = yes.length ? [...yes, ...here.filter((e) => e.answer === 1 && must.includes(e.id))] : here;
    if (!lead.length) continue;
    const from = Math.max(...lead.map((e) => e.span[0]));
    const to = Math.min(...lead.map((e) => e.span[1]));
    // counted as a set time would be: who is free, and who could move things, for all of it
    const next: Meet = { ...covering(entries, from, to), from, to };
    // the starts go earliest first, so on a full tie the earlier time stays
    if (!found || beats(next, found)) found = next;
  }
  return found;
}

/** More free, then more who could move things, then longer. */
function beats(a: Meet, b: Meet): boolean {
  const by = [a.yes.length - b.yes.length, a.maybe.length - b.maybe.length, a.to - a.from - (b.to - b.from)];
  const first = by.find((d) => d !== 0);
  return first !== undefined && first > 0;
}

/** The minutes a slot stands for in a gathering asked by the period; null otherwise. */
export const rangeOfSlot = (grain: Grain, part: Part): Span | null => partRange(grain, part);

/** A whole period, or a part of it. */
export const isWhole = (span: Span, range: Span): boolean => span[0] === range[0] && span[1] === range[1];

/**
 * A day, a part and, when it has them, the minutes: "11月21日 周六 晚上 19:30–22:00",
 * "Sat, Nov 21, 19:30–22:00". Without minutes, the slot as always.
 */
export function whenLabel(day: Day, part: Part, lang: Lang, from?: number, to?: number): string {
  if (from === undefined || to === undefined) return slotLabel(day, part, lang);
  return lang === "zh" ? `${slotLabel(day, part, lang)} ${spanLabel([from, to])}` : `${dayLabel(day, lang)}, ${spanLabel([from, to])}`;
}
