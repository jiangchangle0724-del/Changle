import type { Random } from "../src/fixture/invent";

/** A generator with a fixed seed, so that a test that fails can be run again. */
export function seeded(seed: number): Random {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
