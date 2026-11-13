// What the grid says above a day (src/engine/daynotes.ts), on top of the looked-up dates in
// holidays.ts. Run with `npx tsx --test tests/daynotes.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dayNotes, dayNoteText } from "../src/engine/daynotes";
import { addDays } from "../src/engine/time";

/** `n` days in a row from `first`. */
const run = (first: string, n: number) => Array.from({ length: n }, (_, i) => addDays(first, i));

test("most days have nothing to say", () => {
  const days = run("2026-11-16", 7);
  for (const day of days) assert.deepEqual(dayNotes(day, days, "zh"), [], day);
  assert.equal(dayNoteText("2026-11-18", days, "en"), "");
});

test("Christmas 2026 is a Friday: the holiday, that it is one, and the long weekend, said once", () => {
  const days = run("2026-12-23", 7);
  assert.equal(dayNoteText("2026-12-23", days, "zh"), "");
  assert.equal(dayNoteText("2026-12-24", days, "zh"), "平安夜");
  assert.deepEqual(dayNotes("2026-12-25", days, "zh"), [
    { kind: "stat", text: "圣诞节" },
    { kind: "stat", text: "法定假日" },
    { kind: "long", text: "连休到 12月27日 周日" },
  ]);
  assert.equal(dayNoteText("2026-12-25", days, "en"), "Christmas Day · stat holiday · long weekend to Sun, Dec 27");
  // the days after it are in the same long weekend: not said again
  assert.equal(dayNoteText("2026-12-26", days, "zh"), "节礼日");
  assert.equal(dayNoteText("2026-12-27", days, "zh"), "");
  assert.equal(dayNoteText("2026-12-28", days, "zh"), "");
});

test("a holiday on a Monday: the long weekend is said on the Saturday, the holiday on its day", () => {
  const days = run("2027-02-12", 5);
  assert.equal(dayNoteText("2027-02-12", days, "zh"), "");
  assert.equal(dayNoteText("2027-02-13", days, "zh"), "连休到 2月15日 周一");
  assert.equal(dayNoteText("2027-02-13", days, "en"), "long weekend to Mon, Feb 15");
  assert.equal(dayNoteText("2027-02-14", days, "zh"), "");
  assert.equal(dayNoteText("2027-02-15", days, "zh"), "家庭日 · 法定假日");
  assert.equal(dayNoteText("2027-02-16", days, "zh"), "");
});

test("a gathering that starts inside a long weekend says it on its own first day there", () => {
  // only the Saturday and the Sunday after Christmas are asked about
  const days = ["2026-12-26", "2026-12-27"];
  assert.equal(dayNoteText("2026-12-26", days, "zh"), "节礼日 · 连休到 12月27日 周日");
  assert.equal(dayNoteText("2026-12-27", days, "zh"), "");
  // only its last day: nothing further to run to
  assert.equal(dayNoteText("2026-12-27", ["2026-12-27"], "zh"), "");
  // days picked with a gap: the Sunday comes right after a day that wasn't asked about
  assert.equal(dayNoteText("2026-12-27", ["2026-12-25", "2026-12-27"], "zh"), "");
});

test("a holiday in the middle of the week is one, with no long weekend made up around it", () => {
  const days = run("2027-06-29", 5);
  assert.equal(dayNoteText("2027-07-01", days, "zh"), "国庆日 · 法定假日");
  assert.equal(dayNoteText("2027-07-02", days, "zh"), "");
  assert.equal(dayNoteText("2027-07-03", days, "zh"), "");
});

test("a festival that isn't a day off, and one that falls beside a holiday", () => {
  assert.equal(dayNoteText("2027-02-06", run("2027-02-05", 3), "zh"), "春节");
  assert.equal(dayNoteText("2027-02-06", run("2027-02-05", 3), "en"), "Lunar New Year");
  assert.equal(dayNoteText("2026-12-31", run("2026-12-30", 4), "zh"), "跨年夜");
  assert.equal(dayNoteText("2027-01-01", run("2026-12-30", 4), "zh"), "元旦 · 法定假日 · 连休到 1月3日 周日");
});
