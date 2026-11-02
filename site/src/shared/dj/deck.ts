/**
 * 打碟 · DJ Booth: the beginner deck as plain functions (no sound, no clock of its own), shared by
 * the rooms server, the speaker and the phones, so they all read the deck the same way.
 * CONTRACTS.md, "The beginner deck".
 */
import { DECK, STYLE_IDS, type DeckSide, type DeckState, type DropGrade, type DropState, type Mix, type StyleId } from "./types";

/** The stand-in's tempo, and the deck's when the speaker hasn't said. */
export const DECK_BPM = 125;

export function freshDeck(): DeckState {
  return {
    a: "house",
    b: null,
    fader: 0,
    faderBy: null,
    faderAt: 0,
    votes: {},
    charge: 0,
    chargeAt: 0,
    pending: 0,
    drop: null,
    last: null,
    grid: null,
    pads: [],
    perfects: {},
    sounding: null,
    padAt: {},
    voteAt: {},
    brakeAt: 0,
    gridFrom: null,
    gridSetAt: 0,
  };
}

/** The deck that's on the air: the one the fader leans to (A at the middle). */
export const onAir = (d: { fader: number }): DeckSide => (d.fader > 0.5 ? "b" : "a");
export const offAir = (d: { fader: number }): DeckSide => (onAir(d) === "a" ? "b" : "a");
export const styleOn = (d: { a: StyleId; b: StyleId | null }, side: DeckSide): StyleId | null => (side === "a" ? d.a : d.b);

type Cueable = { a: StyleId; b: StyleId | null; fader: number; votes: Record<string, StyleId>; sounding?: { a: StyleId; b: StyleId | null } | null };

/**
 * The deck the floor's pick is loaded on: the one off the air, when the pick is on it and isn't
 * what's on the air. Picks start over whenever the decks swap, so the old deck left behind never
 * counts by itself.
 */
export function loaded(d: Cueable): DeckSide | null {
  const pick = leader(d.votes);
  const off = offAir(d);
  return pick && styleOn(d, off) === pick && pick !== styleOn(d, onAir(d)) ? off : null;
}

/**
 * The deck the floor has cued: loaded, and really sounding the pick on the speaker (`lyria`: one
 * stream that blends the styles' prompts, so a pick counts at once). A drop swaps to it.
 */
export function cued(d: Cueable, lyria = false): DeckSide | null {
  const side = loaded(d);
  if (!side) return null;
  return lyria || d.sounding?.[side] === styleOn(d, side) ? side : null;
}

/** The build-up now: as it stood at `chargeAt`, less what it fell back since nobody pushed. */
export function chargeNow(d: { charge: number; chargeAt: number; drop: DropState | null }, now: number): number {
  if (d.drop) return 1;
  const idle = now - d.chargeAt - DECK.idleMs;
  return idle > 0 ? Math.max(0, d.charge - (DECK.fall * idle) / 1000) : d.charge;
}

/** The style most of the table picked (a tie goes to the one picked last), or null. */
export function leader(votes: Record<string, StyleId>): StyleId | null {
  const n = new Map<StyleId, number>();
  const last = new Map<StyleId, number>();
  Object.values(votes).forEach((s, i) => {
    if (!STYLE_IDS.includes(s)) return;
    n.set(s, (n.get(s) ?? 0) + 1);
    last.set(s, i);
  });
  let best: StyleId | null = null;
  for (const [s, k] of n) {
    const b = best ? n.get(best)! : -1;
    if (k > b || (k === b && last.get(s)! > last.get(best!)!)) best = s;
  }
  return best;
}

/** Picks per style, for the phones' style list. */
export function tally(votes: Record<string, StyleId>): Partial<Record<StyleId, number>> {
  const out: Partial<Record<StyleId, number>> = {};
  for (const s of Object.values(votes)) out[s] = (out[s] ?? 0) + 1;
  return out;
}

/** The blend the two decks make now, as a mix's weights (what Lyria plays and the screens name). */
export function deckWeights(d: { a: StyleId; b: StyleId | null; fader: number }): Mix["weights"] {
  const x = Math.min(1, Math.max(0, d.fader));
  if (!d.b || d.b === d.a || x <= 0.02) return { [d.a]: 1 };
  if (x >= 0.98) return { [d.b]: 1 };
  const r = (v: number) => Math.round(v * 100) / 100;
  return { [d.a]: r(1 - x), [d.b]: r(x) };
}

export const beatMsOf = (grid: { bpm: number } | null) => 60_000 / (grid?.bpm || DECK_BPM);

/** Beats since the speaker's bar 0, at server time `now` (NaN when the speaker hasn't said). */
export function beatAt(grid: DeckState["grid"], now: number): number {
  if (!grid) return NaN;
  return grid.bar * 4 + (now - grid.at) / beatMsOf(grid);
}

/**
 * Where a drop lands, aimed at `now` (the build-up just filled, or a countdown passed with nobody
 * pressing): the first bar that's a multiple of DECK.every at least DECK.minBeats beats away; and
 * the cue a beat before it. Without the speaker's bars, a few seconds on (the speaker lands it on
 * its next bar).
 */
export function aim(grid: DeckState["grid"], now: number): { bar: number; at: number; cue: number } {
  const beat = beatMsOf(grid);
  if (!grid) {
    const at = now + DECK.minBeats * beat;
    return { bar: -1, at, cue: at - beat };
  }
  const want = beatAt(grid, now) + DECK.minBeats;
  const bar = Math.ceil(want / 4 / DECK.every - 1e-9) * DECK.every;
  const at = grid.at + (bar - grid.bar) * 4 * beat;
  return { bar, at, cue: at - beat };
}

/** The next countdown after one that passed (DECK.every bars on). */
export function reaim(drop: DropState, grid: DeckState["grid"]): { bar: number; at: number; cue: number } {
  const beat = beatMsOf(grid);
  const bar = drop.bar < 0 ? -1 : drop.bar + DECK.every;
  const at = drop.at + DECK.every * 4 * beat;
  return { bar, at, cue: at - beat };
}

/** Beats left before the drop lands (0 at the bar). The countdown shows 3, 2, 1, DROP over the last 4. */
export const beatsLeft = (drop: { at: number }, grid: DeckState["grid"], now: number) => (drop.at - now) / beatMsOf(grid);

/** What the countdown says now: "3", "2", "1", "drop" (the cue beat), or null outside it. */
export function countdown(drop: { at: number } | null, grid: DeckState["grid"], now: number): "3" | "2" | "1" | "drop" | null {
  if (!drop) return null;
  const r = beatsLeft(drop, grid, now);
  if (r > 4 || r <= 0) return null;
  return r > 3 ? "3" : r > 2 ? "2" : r > 1 ? "1" : "drop";
}

/**
 * A DROP press at `at` (server time): null when it doesn't count (before the countdown, or too
 * late for the speaker to land it), else how well it hit the cue.
 */
export function grade(drop: DropState, grid: DeckState["grid"], at: number, now: number): DropGrade | null {
  const beat = beatMsOf(grid);
  if (now > drop.at - DECK.leadMs) return null;
  if (at < drop.at - 4 * beat) return null;
  return Math.abs(at - drop.cue) <= DECK.perfect * beat ? "perfect" : "good";
}

/** What a beginner might do next, for the hint line on the screens. */
export type Hint = "countdown" | "charge" | "charging" | "fade" | "loading" | "pick" | "pads" | "dropped";

export function hintFor(d: Cueable & { drop: DropState | null; last: { at: number } | null; charge: number; chargeAt: number }, now: number, playing: boolean, lyria = false): Hint | null {
  if (!playing) return null;
  if (d.drop) return "countdown";
  if (d.last && now - d.last.at < 4000) return "dropped";
  if (chargeNow(d, now) > 0) return "charging";
  if (cued(d, lyria)) return Math.floor(now / 12_000) % 2 ? "fade" : "charge";
  if (loaded(d)) return "loading";
  return Math.floor(now / 12_000) % 2 ? "pick" : "pads";
}
