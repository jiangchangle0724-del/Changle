/*
 * Made-up 两清 ledgers for the tests: the same seed always gives the same ledger, so two
 * implementations of the arithmetic can be run over the very same ten thousand and compared
 * (tests/split.test.ts, and the second implementation Codex writes from card C1).
 *
 * The ledgers are meant to be awkward: people who only share inside their own circle (so the fewest
 * transfers is fewer than "everyone but one"), amounts from one cent to the most an entry can be,
 * every way of sharing, any turn for the odd cents, entries taken out, transfers already made.
 */
import type { Entry, Ledger, Split } from "../../src/split/core/types";

/** The most one entry can be (money.ts, MAX_AMOUNT), written out so this file imports shapes only. */
const MOST = 9_999_999_999;

/** A small seeded generator (mulberry32): the same seed, the same numbers, on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomLedger(seed: number): Ledger {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <X>(xs: X[]) => xs[int(0, xs.length - 1)];
  const some = <X>(xs: X[]) => {
    // a part of the list, never empty, in the list's own order
    const keep = xs.filter(() => r() < 0.6);
    return keep.length ? keep : [pick(xs)];
  };

  const size = r();
  const n = size < 0.6 ? int(2, 6) : size < 0.85 ? int(7, 12) : size < 0.95 ? int(13, 16) : int(17, 30);
  const ids = Array.from({ length: n }, (_, i) => `m${i + 1}`);

  // circles: people who only ever share with each other, so each circle squares up by itself
  let circles: string[][] = [ids];
  if (r() < 0.5 && n >= 4) {
    const count = int(2, Math.min(4, Math.floor(n / 2)));
    circles = Array.from({ length: count }, () => [] as string[]);
    ids.forEach((id, i) => circles[i < count ? i : int(0, count - 1)].push(id));
  }

  const amount = () => {
    const kind = r();
    if (kind < 0.5) return int(100, 50_000);
    if (kind < 0.7) return 100 * int(1, 2_000);
    if (kind < 0.85) return int(1, 99);
    if (kind < 0.95) return int(50_001, 10_000_000);
    return int(MOST - 1_000, MOST);
  };

  const entries: Entry[] = [];
  let at = 1_800_000_000_000;
  const expenses = int(1, 30);
  for (let i = 0; i < expenses; i++) {
    const circle = pick(circles);
    const sharers = r() < 0.5 ? circle : some(circle);
    let cost = amount();
    let split: Split;
    const how = r();
    if (how < 0.5) split = { how: "equal", among: r() < 0.5 ? sharers : [...sharers].reverse() };
    else if (how < 0.75) split = { how: "shares", shares: Object.fromEntries(sharers.map((id) => [id, r() < 0.1 ? int(100, 999) : int(1, 5)])) };
    else {
      // typed amounts: cut the cost at random places, every part at least one unit
      if (cost < sharers.length) cost = sharers.length;
      const cuts = sharers.slice(1).map(() => int(1, cost - 1)).sort((x, y) => x - y);
      const parts = sharers.map((_, k) => (k < cuts.length ? cuts[k] : cost) - (k ? cuts[k - 1] : 0));
      // (two cuts in the same place leave a part of zero: it takes no part, which is allowed)
      split = { how: "exact", amounts: Object.fromEntries(sharers.map((id, k) => [id, parts[k]])) };
      if (parts.every((p) => p === 0)) split = { how: "equal", among: sharers };
    }
    at += int(1, 3_600_000);
    entries.push({
      kind: "expense",
      id: `e${i + 1}`,
      at,
      payer: pick(circle),
      amount: cost,
      note: "",
      split,
      rot: r() < 0.9 ? int(0, 200) : int(0, 2_000_000_000),
      ...(r() < 0.1 ? { paidIn: { currency: "USD", amount: int(1, 500_000), rate: "1.40" } } : {}),
      ...(r() < 0.05 ? { gone: at + 1 } : {}),
    });
    // now and then the same again, paid by someone else in the circle: more ways to cancel exactly
    if (r() < 0.08) {
      at += 1;
      entries.push({ ...(entries[entries.length - 1] as Entry & { kind: "expense" }), id: `e${i + 1}b`, at, payer: pick(circle), gone: undefined });
    }
  }
  if (r() < 0.3) {
    const transfers = int(1, 4);
    for (let i = 0; i < transfers; i++) {
      const from = pick(ids);
      const to = pick(ids.filter((id) => id !== from));
      at += int(1, 3_600_000);
      entries.push({ kind: "transfer", id: `t${i + 1}`, at, from, to, amount: amount(), ...(r() < 0.1 ? { gone: at + 1 } : {}) });
    }
  }
  return { id: `L${seed}`, name: `Ledger ${seed}`, currency: r() < 0.85 ? "CAD" : "JPY", members: ids.map((id, i) => ({ id, name: `Person ${i + 1}` })), entries };
}
