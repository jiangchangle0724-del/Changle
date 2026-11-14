// The banknotes money flies in (ui/Moments.tsx MoneyFx): paid out as a board game's bank pays, in the
// bills on the table.

/** The bills there are, biggest first. */
export const BILLS = [500, 100, 50, 20, 10, 5, 1] as const;

/** The most notes that fly for one payment. */
export const MOST_NOTES = 8;

/**
 * The notes an amount is paid in, biggest first: the fewest bills that make it, except that a round
 * sum in one or two is changed into smaller ones, so a handful flies ($200 is a 100 and two 50s, not
 * two 100s). At most MOST_NOTES (a big sum leaves its smallest bills behind: the amount's label says
 * what it is).
 */
export function notesFor(amount: number): number[] {
  const out: number[] = [];
  let left = Math.max(1, Math.round(amount));
  for (const bill of BILLS)
    while (left >= bill && out.length < MOST_NOTES) {
      out.push(bill);
      left -= bill;
    }
  while (out.length < 3) {
    // (the biggest that can be changed)
    const i = out.findIndex((bill) => bill > 1);
    if (i < 0) break;
    const note = out[i];
    let rest = note;
    const change: number[] = [];
    for (const bill of BILLS)
      while (bill < note && rest >= bill) {
        change.push(bill);
        rest -= bill;
      }
    out.splice(i, 1, ...change);
  }
  return out.sort((a, b) => b - a).slice(0, MOST_NOTES);
}
