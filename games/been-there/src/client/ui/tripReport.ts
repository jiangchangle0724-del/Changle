// The finale's report card (战报): from what each seat did over the game (the room's tallies,
// `Tally` in protocol.ts), the awards it earned and how the dice fell. No drawing here: the card
// (ReportCard.tsx) and its picture (reportPicture.ts) both read it.
import type { Tally } from "../../room/protocol";

export type AwardKind = "landlord" | "dearest" | "quiz" | "auction" | "hotDice" | "doubles" | "immigration";

export interface Award {
  kind: AwardKind;
  /** The seats that earned it (a tie shares it). */
  seats: number[];
  /** Money, a count, or an average of pips (one decimal). */
  value: number;
  /** Where (`dearest`: the space the rent was paid on). */
  at?: number;
}

/** At most this many awards on a card. */
export const MAX_AWARDS = 5;

/** Each total of two dice in the long run: 1 in 36 for 2, 6 in 36 for 7, 1 in 36 for 12. */
export const LONG_RUN = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((n) => n / 36);

/**
 * The awards, in this order, as many as were earned up to five: nothing is awarded for nothing (a
 * value of 0), and a tie shares it. The best average throw needs three throws or more.
 */
export function awards(tally: Tally[]): Award[] {
  const out: Award[] = [];
  const best = (kind: AwardKind, value: (t: Tally) => number) => {
    const values = tally.map(value);
    const top = Math.max(0, ...values);
    if (!(top > 0)) return;
    out.push({ kind, value: top, seats: values.flatMap((x, i) => (x === top ? [i] : [])) });
  };
  best("landlord", (t) => t.rentGot);
  const dearest = tally.map((t) => t.topRent?.amount ?? 0);
  const top = Math.max(0, ...dearest);
  if (top > 0) {
    const seats = dearest.flatMap((x, i) => (x === top ? [i] : []));
    out.push({ kind: "dearest", value: top, seats, at: tally[seats[0]].topRent!.at });
  }
  best("quiz", (t) => t.quizWins);
  best("auction", (t) => t.auctionsWon);
  best("hotDice", (t) => (t.throws >= 3 ? Math.round((t.pips / t.throws) * 10) / 10 : 0));
  best("doubles", (t) => t.doubles);
  best("immigration", (t) => t.jail);
  return out.slice(0, MAX_AWARDS);
}

/** How the dice fell over the game, all seats together. */
export function diceOf(tally: Tally[]) {
  const throws = tally.reduce((a, t) => a + t.throws, 0);
  const pips = tally.reduce((a, t) => a + t.pips, 0);
  const doubles = tally.reduce((a, t) => a + t.doubles, 0);
  const totals = LONG_RUN.map((_, i) => tally.reduce((a, t) => a + (t.totals[i] ?? 0), 0));
  return { throws, doubles, totals, avg: throws ? pips / throws : 0 };
}
