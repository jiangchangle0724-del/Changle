/* 打碟 · DJ Booth: the pads' own sounds (speaker/club.ts), the part that needs no sound card: each
   press a take of its own. The sounds themselves are heard in a browser (scripts/dj_turntable_check.py).
   Run with `npx tsx tests/dj-sound.test.ts`. */
import { AS_MADE, nextTake } from "../src/party/dj/speaker/club";

let failures = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}
function test(name: string, fn: () => void) {
  const before = failures;
  try {
    fn();
  } catch (e) {
    failures++;
    console.log("  THREW:", (e as Error).stack);
  }
  console.log(`${failures === before ? "ok  " : "FAIL"} ${name}`);
}

test("pads: each press a take of its own, never the last one again, a hair either way", () => {
  // a fixed run of numbers, so the test is the same every time
  let s = 12345;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  let last: number | undefined;
  const seen = new Set<number>();
  let repeats = 0;
  let wide = 0;
  for (let k = 0; k < 2000; k++) {
    const { i, take } = nextTake(last, 30, rnd);
    if (i === last) repeats++;
    seen.add(i);
    const db = 20 * Math.log10(take.level);
    if (!Number.isInteger(i) || i < 0 || i > 4 || Math.abs(take.cents) > 30 + 1e-9 || Math.abs(db) > 1.5 + 1e-9) wide++;
    last = i;
  }
  ok(repeats === 0, `never the same take twice running (${repeats})`);
  ok(seen.size === 5, `all five takes come up (${[...seen].sort().join(" ")})`);
  ok(wide === 0, `each within ±30 cents and ±1.5 dB (${wide} not)`);
  const mid = nextTake(undefined, 30, () => 0.5);
  ok(mid.i === 2 && mid.take.cents === 0 && Math.abs(mid.take.level - 1) < 1e-9, "the middle take is the sound as made");
  ok(nextTake(undefined, 30, () => 0).take.cents === -30 && nextTake(undefined, 30, () => 0.999).take.cents === 30, "the ends: 30 cents down, 30 up");
  ok(AS_MADE.cents === 0 && AS_MADE.level === 1, "no take given: the sound as made (the checks render that)");
});

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);
