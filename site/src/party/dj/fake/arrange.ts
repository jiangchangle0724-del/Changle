/**
 * 打碟 · DJ Booth: the stand-in DJ's one rule. At the end of every 8-bar section it picks the next
 * one for the phase of the night: the phase's own sections in turn, starting from its first when
 * the phase has just changed (so the peak always opens with the drop). Pure: no sound, no clock.
 */
import { playing } from "../../../shared/dj/curve";
import { SET_PHASES, type DjPhase, type SetPhase } from "../../../shared/dj/types";
import { SECTIONS } from "./sections";

export const BY_PHASE: Record<SetPhase, string[]> = Object.fromEntries(SET_PHASES.map((p) => [p, SECTIONS.filter((s) => s.phase === p).map((s) => s.id)])) as Record<SetPhase, string[]>;

/** The section after `prev`, or null when no music should play. */
export function nextSection(phase: DjPhase, prev: string | null): string | null {
  if (!playing(phase)) return null;
  const list = BY_PHASE[phase as SetPhase];
  const i = prev ? list.indexOf(prev) : -1;
  return list[(i + 1) % list.length];
}

/** The order to make the sections in: this phase's first, then the rest of the night in order. */
export function renderOrder(phase: DjPhase): string[] {
  const start = Math.max(0, SET_PHASES.indexOf(phase as SetPhase));
  const order: string[] = [];
  for (let k = 0; k < SET_PHASES.length; k++) order.push(...BY_PHASE[SET_PHASES[(start + k) % SET_PHASES.length]]);
  return order;
}
