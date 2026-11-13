/**
 * Settling up: the fewest transfers that bring everyone back to zero.
 *
 * `nets` is what each member is owed (above zero) or owes (below), in roster order; they add up to
 * zero. People who can square up among themselves form a group, and a group of m people needs
 * m - 1 transfers, so the fewest transfers overall means the most groups. Finding the most groups
 * is a hard problem in general, so:
 *
 *  - up to EXACT_UP_TO people still owing or owed, every way of grouping them is weighed (a table
 *    over all subsets, 65,536 of them for 16 people): the answer is the true fewest;
 *  - past that, people who cancel in twos and threes are paired off first, and whoever is left is
 *    weighed the same way if they now fit, or settled as one group if not: close to the fewest,
 *    not promised to be.
 *
 * The same nets always give the same transfers, on every phone and on the server: ties go to
 * whoever comes first on the roster.
 */

/** One transfer: the member at `from` pays the member at `to` (positions on the roster). */
export type Move = { from: number; to: number; amount: number };

/** Up to this many people still owing or owed, settle() returns the true fewest transfers. */
export const EXACT_UP_TO = 16;

/** The transfers that settle these nets, ordered by who pays, then who is paid. */
export function settle(nets: number[]): Move[] {
  if (nets.reduce((a, v) => a + v, 0) !== 0) throw new Error("split: nets must add up to zero");
  const moves: Move[] = [];
  for (const group of groupsOf(nets)) payOff(group, nets, moves);
  return moves.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** The roster split into groups that each add up to zero (people at zero are in none). */
function groupsOf(nets: number[]): number[][] {
  const groups: number[][] = [];
  let open = nets.flatMap((v, i) => (v !== 0 ? [i] : []));
  const take = (group: number[]) => {
    groups.push(group);
    open = open.filter((i) => !group.includes(i));
  };
  // two people who cancel exactly settle with each other. This never costs a transfer: in any best
  // grouping, the two groups holding them can be redrawn as the pair and everyone else, still two groups
  for (let a = 0; a < open.length; a++) {
    const b = open.findIndex((j, k) => k > a && nets[j] === -nets[open[a]]);
    if (b > 0) {
      take([open[a], open[b]]);
      a--;
    }
  }
  // too many for the table: threes that cancel go too (a good guess, no longer a proof)
  if (open.length > EXACT_UP_TO) {
    for (let a = 0; a < open.length; a++) {
      let found: number[] | null = null;
      for (let b = a + 1; b < open.length && !found; b++)
        for (let c = b + 1; c < open.length && !found; c++) if (nets[open[a]] + nets[open[b]] + nets[open[c]] === 0) found = [open[a], open[b], open[c]];
      if (found) {
        take(found);
        a--;
      }
    }
  }
  if (open.length > EXACT_UP_TO) groups.push(open);
  else if (open.length) for (const g of mostGroups(open.map((i) => nets[i]))) groups.push(g.map((k) => open[k]).sort((x, y) => x - y));
  return groups;
}

/**
 * The most groups adding up to zero that `v` (which adds up to zero) can be cut into, as lists of
 * positions in `v`. best[mask] is the most zero-sum groups the people in `mask` hold along the way
 * of removing them one at a time: the best of removing any one person, plus one if `mask` itself
 * adds up to zero. Walking back from everyone, the people removed between one zero-sum mask and
 * the next are a group.
 */
function mostGroups(v: number[]): number[][] {
  const size = 1 << v.length;
  const sum = new Float64Array(size);
  const best = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low] + v[31 - Math.clz32(low)];
  }
  for (let mask = 1; mask < size; mask++) {
    let most = 0;
    for (let rest = mask; rest; rest &= rest - 1) {
      const without = best[mask ^ (rest & -rest)];
      if (without > most) most = without;
    }
    best[mask] = most + (sum[mask] === 0 ? 1 : 0);
  }
  const groups: number[][] = [];
  let group: number[] = [];
  let mask = size - 1;
  while (mask) {
    const want = best[mask] - (sum[mask] === 0 ? 1 : 0);
    let bit = 0;
    for (let rest = mask; rest && !bit; rest &= rest - 1) if (best[mask ^ (rest & -rest)] === want) bit = rest & -rest;
    group.push(31 - Math.clz32(bit));
    mask ^= bit;
    if (sum[mask] === 0) {
      groups.push(group);
      group = [];
    }
  }
  return groups;
}

/**
 * One group squares up: whoever owes most pays whoever is owed most, as much as both can take, until
 * all are at zero. Every transfer brings at least one of the two to zero and the last brings both,
 * so a group of m takes at most m - 1.
 */
function payOff(group: number[], nets: number[], moves: Move[]) {
  const left = group.map((i) => nets[i]);
  for (;;) {
    let d = -1;
    let c = -1;
    for (let k = 0; k < left.length; k++) {
      if (left[k] < 0 && (d < 0 || left[k] < left[d])) d = k;
      if (left[k] > 0 && (c < 0 || left[k] > left[c])) c = k;
    }
    if (d < 0 || c < 0) return;
    const amount = Math.min(-left[d], left[c]);
    left[d] += amount;
    left[c] -= amount;
    moves.push({ from: group[d], to: group[c], amount });
  }
}
