// 几点开始, the second of two steps (A4, 2026-11-20). Once the day and the period are set, the host
// asks what time to start: two to five times within it. Everyone taps the ones that suit them, and
// the host sets one; it is then the set time's `from` (with no `to` when the whole period was set,
// which reads "18:30 开始"), and goes into the words for the group chat, the calendar and 随便.
import { MIN_SPAN } from "./minutes";
import { partRange } from "./slots";
import type { Grain, Person, Settled } from "./types";

/** A start is on the quarter hour; the host is offered the half hours. */
export const START_STEP = 15;
export const STARTS_MIN = 2;
export const STARTS_MAX = 5;

/**
 * When it can start: [first, last] minutes, within the time set to the minute or else its period,
 * at least MIN_SPAN before it ends. A start set before doesn't narrow it. Null where there are no
 * minutes (a gathering asked by the half day or the whole day) or nothing is set.
 */
export function startWindow(grain: Grain, settled: Settled | null): [number, number] | null {
  if (!settled) return null;
  const range = partRange(grain, settled.part);
  if (!range) return null;
  const windowed = settled.from !== undefined && settled.to !== undefined;
  const first = windowed ? settled.from! : range[0];
  const last = (windowed ? settled.to! : range[1]) - MIN_SPAN;
  return first <= last ? [first, last] : null;
}

/** The half hours a host can offer, from the first one in the window to its last start. */
export function startChoices(window: readonly [number, number]): number[] {
  const out: number[] = [];
  for (let at = Math.ceil(window[0] / 30) * 30; at <= window[1]; at += 30) out.push(at);
  return out;
}

/** A start the window allows. */
export const startFits = (at: unknown, window: readonly [number, number] | null): at is number =>
  !!window && Number.isInteger(at) && (at as number) % START_STEP === 0 && (at as number) >= window[0] && (at as number) <= window[1];

/** The times as kept: 2 to 5 different ones the window allows, in order; [] to stop asking. Null when it isn't that. */
export function cleanStarts(input: unknown, window: readonly [number, number] | null): number[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0) return [];
  if (!input.every((at) => startFits(at, window))) return null;
  const times = [...new Set(input as number[])].sort((a, b) => a - b);
  return times.length >= STARTS_MIN && times.length <= STARTS_MAX ? times : null;
}

/** Who each time suits, in the times' order. */
export const startTally = (times: readonly number[], people: readonly Pick<Person, "id" | "starts">[]): { at: number; ids: string[] }[] =>
  times.map((at) => ({ at, ids: people.filter((p) => p.starts?.includes(at)).map((p) => p.id) }));

/** The time most people tapped, the earliest of equals; null while nobody has. */
export function leadingStart(tally: readonly { at: number; ids: string[] }[]): number | null {
  let lead: { at: number; ids: string[] } | null = null;
  for (const t of tally) if (t.ids.length > 0 && (!lead || t.ids.length > lead.ids.length)) lead = t;
  return lead?.at ?? null;
}
