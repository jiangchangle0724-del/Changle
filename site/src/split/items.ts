/**
 * 小票逐项分 (2026-11-27, as Splitwise's itemize): a receipt's lines, each had by some of the
 * ledger's people, turned into each one's part of what was paid. Each line is shared evenly by
 * whoever had it; what isn't on a line someone had (tax, tip, a line not read, one nobody had) goes
 * in proportion to that, so the parts come to the whole amount. The parts fill 按金额: nothing of
 * the lines is kept in the ledger.
 */
import { allot } from "./core";

/** A line of the receipt: what it came to (in smallest units of what was paid), and who had it. */
export type Line = { name: string; amount: number; who: string[] };

/** What each had of the lines, in the roster's order (an odd unit of a line to the first of them): the weights the whole is shared by. */
export function hadOf(lines: Line[], roster: string[]): number[] {
  const had = roster.map(() => 0);
  for (const line of lines) {
    const who = roster.flatMap((id, i) => (line.who.includes(id) ? [i] : []));
    if (!who.length) continue;
    allot(line.amount, who.map(() => 1), 0).forEach((n, k) => (had[who[k]] += n));
  }
  return had;
}

/** Each one's part of `total` (smallest units of the ledger's currency) by what they had; null while nobody had anything. */
export function itemParts(lines: Line[], total: number, roster: string[]): Record<string, number> | null {
  const had = hadOf(lines, roster);
  if (!had.some((n) => n > 0)) return null;
  const parts = allot(total, had, 0);
  return Object.fromEntries(roster.flatMap((id, i) => (parts[i] > 0 ? [[id, parts[i]]] : [])));
}
