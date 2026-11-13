// Round 2's count: approve as many cards as you like, veto at most one.
import type { Ballot } from "./types";

export interface CardScore {
  id: string;
  yes: number;
  vetoes: number;
}

export interface Tally {
  scores: CardScore[];
  /** Cards that tied for first; more than one means the spinner decides. */
  tied: string[];
  winner: string;
}

/** Nobody ticked anything: the spinner turns between the top of the list, not all of it. */
export const NO_VOTES_POOL = 6;

/**
 * A vetoed card is out. If everyone vetoed everything, the least-vetoed cards stay in.
 * Most approvals wins; a tie goes to `random`. `cards` are in the list's order, best first, so with
 * no approvals at all only the first NO_VOTES_POOL still in tie.
 */
export function tally(cards: string[], ballots: Ballot[], random: () => number): Tally {
  const scores = cards.map((id) => ({
    id,
    yes: ballots.filter((b) => b.approve.includes(id)).length,
    vetoes: ballots.filter((b) => b.veto === id).length,
  }));
  const fewest = Math.min(...scores.map((s) => s.vetoes));
  const alive = scores.filter((s) => s.vetoes === fewest);
  const best = Math.max(...alive.map((s) => s.yes));
  const tied = (best > 0 ? alive.filter((s) => s.yes === best) : alive.slice(0, NO_VOTES_POOL)).map((s) => s.id);
  const winner = tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
  return { scores, tied, winner };
}

/** A ballot from a phone, cut down to cards that exist and one veto that isn't also approved. */
export function cleanBallot(x: unknown, cards: string[]): Ballot {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const veto = typeof o.veto === "string" && cards.includes(o.veto) ? o.veto : null;
  const approve = Array.isArray(o.approve) ? [...new Set(o.approve.filter((id): id is string => typeof id === "string" && cards.includes(id) && id !== veto))] : [];
  return { approve, veto };
}
