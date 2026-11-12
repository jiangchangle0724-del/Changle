/**
 * Punchline numbers shared by the server's rules and the show on the screens: how long each
 * beat of the presentation lasts (so every phone and the TV land on the same moment) and how
 * votes turn into points.
 */

/** At most this many people write; anyone else at the table is the audience and votes. */
export const MAX_WRITERS = 8;
export const ROUNDS = 3;

/**
 * Who writes a game, in seat order: everyone, up to eight. Past eight, playing again gives the pen
 * first to whoever only watched the last game (`last` is who wrote it), then to those who have
 * written the fewest games (`written`), then by seat; the rest watch and vote. With at most 15 at a
 * table, everyone who watched writes the next game.
 */
export function nextWriters(ids: string[], last: string[] | null, written: Record<string, number>): string[] {
  if (ids.length <= MAX_WRITERS || !last) return ids.slice(0, MAX_WRITERS);
  const wrote = new Set(last);
  const seat = new Map(ids.map((id, i) => [id, i]));
  const pick = new Set(
    ids
      .slice()
      .sort((a, b) => Number(wrote.has(a)) - Number(wrote.has(b)) || (written[a] ?? 0) - (written[b] ?? 0) || seat.get(a)! - seat.get(b)!)
      .slice(0, MAX_WRITERS),
  );
  return ids.filter((id) => pick.has(id));
}

/** Games written so far, counting a new game's writers. */
export function countWriters(written: Record<string, number>, writers: string[]): Record<string, number> {
  const next = { ...written };
  for (const id of writers) next[id] = (next[id] ?? 0) + 1;
  return next;
}

export const WRITE_MS = 90_000;
export const FINAL_WRITE_MS = 75_000;
export const VOTE_MS = 20_000;
export const FINAL_VOTE_MS = 40_000;
export const RESULT_MS = 9_500;
export const FINAL_RESULT_MS = 14_000;
export const SCORES_MS = 11_000;
/** The final round: how many answers each voter may pick. */
export const FINAL_VOTES = 3;

/** The presentation before a vote: the prompt lands, then each answer, one after another. */
export const PRESENT = { lead: 1800, gap: 1600, finalGap: 1100, tail: 800 };

export function presentMs(answers: number, final: boolean) {
  return PRESENT.lead + answers * (final ? PRESENT.finalGap : PRESENT.gap) + PRESENT.tail;
}

/** When answer `i` appears, in ms after the presentation starts. */
export function answerAt(i: number, final: boolean) {
  return PRESENT.lead + i * (final ? PRESENT.finalGap : PRESENT.gap);
}

/** The result, beat by beat (ms after the result starts). */
export const RESULT_BEATS = { roll: 0, votes: 1300, voteGap: 260, names: 3200, points: 4000, sweep: 4600 };

/**
 * Points for one head-to-head: a share of 1000 by votes, 100 for winning it, 250 more for
 * taking every vote; doubled in round two. A safety quip earns half.
 */
export function headToHeadPoints(counts: number[], round: number, safety: boolean[]) {
  const mult = round;
  const total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(...counts);
  const winner = total > 0 && counts.filter((c) => c === top).length === 1 ? counts.indexOf(top) : -1;
  const sweep = winner >= 0 && total >= 2 && counts.every((c, i) => i === winner || c === 0) ? winner : -1;
  const points = counts.map((c, i) => {
    let p = total ? Math.round((1000 * c) / total) : 0;
    if (i === winner) p += 100;
    if (i === sweep) p += 250;
    p *= mult;
    if (safety[i]) p = Math.round(p / 20) * 10;
    return p;
  });
  return { points, winner, sweep };
}

/** The last round: a share of 4000 by votes. */
export function finalPoints(counts: number[], safety: boolean[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c, i) => {
    const p = total ? Math.round((4000 * c) / total) : 0;
    return safety[i] ? Math.round(p / 20) * 10 : p;
  });
}
