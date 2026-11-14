// Filling in many slots with one tap (src/engine/quick.ts).
// Run with `npx tsx --test tests/quick.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { allFree, quickFill, quickSlots } from "../src/engine/quick";
import type { Answers } from "../src/engine/types";

// Thursday 19 November 2026 to Monday the 23rd: one weekend in the middle
const days = ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];

test("what each quick fill covers, by the half day", () => {
  assert.equal(quickSlots({ kind: "all" }, days, "half").length, 15);
  assert.deepEqual(quickSlots({ kind: "day", day: "2026-11-20" }, days, "half"), ["2026-11-20:am", "2026-11-20:pm", "2026-11-20:eve"]);
  assert.deepEqual(quickSlots({ kind: "weekends" }, days, "half"), ["2026-11-21:am", "2026-11-21:pm", "2026-11-21:eve", "2026-11-22:am", "2026-11-22:pm", "2026-11-22:eve"]);
  assert.deepEqual(quickSlots({ kind: "evenings" }, days, "half"), ["2026-11-19:eve", "2026-11-20:eve", "2026-11-21:eve", "2026-11-22:eve", "2026-11-23:eve"]);
});

test("by the day there are no evenings, and a day is its one slot", () => {
  assert.deepEqual(quickSlots({ kind: "all" }, days, "day"), days.map((day) => `${day}:day`));
  assert.deepEqual(quickSlots({ kind: "weekends" }, days, "day"), ["2026-11-21:day", "2026-11-22:day"]);
  assert.deepEqual(quickSlots({ kind: "evenings" }, days, "day"), []);
  assert.deepEqual(quickSlots({ kind: "day", day: "2026-11-23" }, days, "day"), ["2026-11-23:day"]);
});

test("nothing to cover: no weekend among the days, a day that isn't asked about", () => {
  assert.deepEqual(quickSlots({ kind: "weekends" }, ["2026-11-17", "2026-11-18"], "half"), []);
  assert.deepEqual(quickSlots({ kind: "day", day: "2026-12-01" }, days, "half"), []);
  assert.equal(allFree({}, []), false, "no slots are not 'all free'");
});

test("a quick fill says free for all of its slots and leaves the rest alone", () => {
  const before: Answers = { "2026-11-19:am": 2, "2026-11-19:eve": 1, "2026-11-21:pm": 1 };
  const evenings = quickSlots({ kind: "evenings" }, days, "half");
  const after = quickFill(before, evenings);
  assert.equal(allFree(after, evenings), true);
  assert.equal(after["2026-11-19:eve"], 2, "could-move-things becomes free");
  assert.equal(after["2026-11-19:am"], 2, "an answer outside it stays");
  assert.equal(after["2026-11-21:pm"], 1, "and so does this one");
  assert.equal(Object.keys(after).length, 7);
  assert.deepEqual(before, { "2026-11-19:am": 2, "2026-11-19:eve": 1, "2026-11-21:pm": 1 }, "what was given isn't changed");
});

test("pressed again when they are all free, it takes them back, and only them", () => {
  const evenings = quickSlots({ kind: "evenings" }, days, "half");
  const filled = quickFill({ "2026-11-19:am": 2 }, evenings);
  assert.deepEqual(quickFill(filled, evenings), { "2026-11-19:am": 2 });
  // one of them unticked since: it fills in again instead
  const { ["2026-11-20:eve"]: _gone, ...most } = filled;
  assert.equal(allFree(most, evenings), false);
  assert.equal(allFree(quickFill(most, evenings), evenings), true);
});

test("everything, then everything off", () => {
  const all = quickSlots({ kind: "all" }, days, "half");
  const on = quickFill({ "2026-11-22:am": 1 }, all);
  assert.equal(Object.values(on).filter((answer) => answer === 2).length, 15);
  assert.deepEqual(quickFill(on, all), {});
});
