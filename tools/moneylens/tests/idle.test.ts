// The idle lock (VAULT-3): fifteen quiet minutes lock the vault, however the machine spent them.
import assert from "node:assert/strict";
import test from "node:test";
import { elapsed, watchIdle, type IdleClock, type Moment } from "../src/app/idle";

const LIMIT = 15 * 60_000;

/** Two clocks and a timer, moved by hand. `pass` is time with the machine awake; `sleep` moves the wall clock only, and no timer fires. */
function fake() {
  const at: Moment = { wall: 1_800_000_000_000, steady: 5_000 };
  let timers: { due: number; run: () => void; off: boolean }[] = [];
  const clock: IdleClock = {
    now: () => ({ ...at }),
    later(ms, run) {
      const timer = { due: at.steady + ms, run, off: false };
      timers.push(timer);
      return () => void (timer.off = true);
    },
  };
  const pass = (ms: number): void => {
    const end = at.steady + ms;
    for (;;) {
      const next = timers.filter((t) => !t.off && t.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      at.wall += next.due - at.steady;
      at.steady = next.due;
      next.off = true;
      next.run();
    }
    at.wall += end - at.steady;
    at.steady = end;
    timers = timers.filter((t) => !t.off);
  };
  return { clock, pass, sleep: (ms: number) => void (at.wall += ms), setBack: (ms: number) => void (at.wall -= ms), waiting: () => timers.filter((t) => !t.off).length };
}

test("the longer of the two clocks counts", () => {
  assert.equal(elapsed({ wall: 100, steady: 10 }, { wall: 160, steady: 30 }), 60);
  assert.equal(elapsed({ wall: 100, steady: 10 }, { wall: 90, steady: 30 }), 20);
  assert.equal(elapsed({ wall: 100, steady: 10 }, { wall: 100, steady: 10 }), 0);
});

test("fifteen quiet minutes lock, once, and not a moment before", () => {
  const { clock, pass, waiting } = fake();
  let locks = 0;
  watchIdle(LIMIT, () => locks++, clock);
  pass(LIMIT - 1);
  assert.equal(locks, 0);
  pass(1);
  assert.equal(locks, 1);
  pass(10 * LIMIT);
  assert.equal(locks, 1, "it locks once");
  assert.equal(waiting(), 0, "and leaves no timer behind");
});

test("a press starts the count again", () => {
  const { clock, pass, waiting } = fake();
  let locks = 0;
  const watch = watchIdle(LIMIT, () => locks++, clock);
  for (let i = 0; i < 10; i++) {
    pass(LIMIT - 1000);
    watch.touch();
    watch.touch();
  }
  assert.equal(locks, 0, "two and a half hours of pressing now and then");
  assert.equal(waiting(), 1, "one timer, however many presses");
  pass(LIMIT - 1);
  assert.equal(locks, 0);
  pass(1);
  assert.equal(locks, 1);
});

test("looking is not pressing", () => {
  const { clock, pass, waiting } = fake();
  let locks = 0;
  const watch = watchIdle(LIMIT, () => locks++, clock);
  pass(LIMIT - 1000);
  watch.look();
  watch.look();
  assert.equal(locks, 0);
  assert.equal(waiting(), 1, "one timer, however often it is looked at");
  pass(1000);
  assert.equal(locks, 1, "the count went on from the last press");
});

test("a machine that slept past the limit locks at the first look", () => {
  const { clock, pass, sleep } = fake();
  let locks = 0;
  const watch = watchIdle(LIMIT, () => locks++, clock);
  pass(60_000);
  sleep(2 * 60 * 60_000);
  assert.equal(locks, 0, "nothing ran while it slept");
  watch.look();
  assert.equal(locks, 1);
  // (locked, it is done: nothing that comes after locks again)
  watch.look();
  watch.touch();
  pass(2 * LIMIT);
  assert.equal(locks, 1);
});

test("the press that wakes it locks it, and does not start the count afresh", () => {
  const { clock, pass, sleep, waiting } = fake();
  let locks = 0;
  const watch = watchIdle(LIMIT, () => locks++, clock);
  pass(60_000);
  sleep(LIMIT);
  watch.touch();
  assert.equal(locks, 1);
  watch.touch();
  watch.look();
  pass(LIMIT);
  assert.equal(locks, 1);
  assert.equal(waiting(), 0);
});

test("a machine that slept, and whose timer then fires, locks", () => {
  const { clock, pass, sleep } = fake();
  let locks = 0;
  watchIdle(LIMIT, () => locks++, clock);
  pass(60_000);
  sleep(LIMIT);
  // (awake again, nothing looked at and nothing pressed: the timer still has fourteen minutes by its own clock)
  pass(14 * 60_000);
  assert.equal(locks, 1);
});

test("a short sleep shortens what is left", () => {
  const { clock, pass, sleep } = fake();
  let locks = 0;
  const watch = watchIdle(LIMIT, () => locks++, clock);
  pass(5 * 60_000);
  sleep(5 * 60_000);
  watch.look();
  assert.equal(locks, 0);
  pass(5 * 60_000 - 1);
  assert.equal(locks, 0);
  pass(1);
  assert.equal(locks, 1, "five awake, five asleep, five awake");
});

test("a wall clock set back buys no time", () => {
  const { clock, pass, setBack } = fake();
  let locks = 0;
  const watch = watchIdle(LIMIT, () => locks++, clock);
  pass(LIMIT - 1000);
  setBack(60 * 60_000);
  watch.look();
  assert.equal(locks, 0);
  pass(1000);
  assert.equal(locks, 1, "the steady clock counted all fifteen minutes");
});

test("a timer that fires early is asked again for what is left", () => {
  const at: Moment = { wall: 0, steady: 0 };
  const asked: number[] = [];
  let run: () => void = () => {};
  let locks = 0;
  watchIdle(LIMIT, () => locks++, { now: () => ({ ...at }), later: (ms, next) => (asked.push(ms), (run = next), () => {}) });
  at.wall = at.steady = LIMIT - 250;
  run();
  assert.equal(locks, 0);
  assert.deepEqual(asked, [LIMIT, 250]);
  at.wall = at.steady = LIMIT;
  run();
  assert.equal(locks, 1);
});

test("stopped, it neither locks nor waits", () => {
  const { clock, pass, waiting } = fake();
  let locks = 0;
  const watch = watchIdle(LIMIT, () => locks++, clock);
  pass(60_000);
  watch.stop();
  assert.equal(waiting(), 0);
  pass(10 * LIMIT);
  watch.touch();
  watch.look();
  assert.equal(locks, 0);
});
