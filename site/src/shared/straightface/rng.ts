/** Seeded RNG (mulberry32) so every game is replayable in tests and bug reports. */
export interface Rng {
  /** [0, 1) */
  next(): number;
  int(maxExclusive: number): number;
  shuffle<T>(xs: readonly T[]): T[];
  pick<T>(xs: readonly T[]): T;
  state(): number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    pick: (xs) => {
      if (xs.length === 0) throw new RangeError("pick from empty list");
      return xs[Math.floor(next() * xs.length)];
    },
    state: () => a,
  };
}
