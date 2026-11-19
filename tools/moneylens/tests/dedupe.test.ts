// ACC-3: duplicates across overlapping files of one account, found before saving. A new line is
// never thrown away on thin evidence, and the same line is never kept twice on a re-import.
import assert from "node:assert/strict";
import test from "node:test";
import { findDuplicates, type Held, type Incoming } from "../src/core/dedupe";
import { readOfx } from "../src/core/ofx";
import { bankV1, bytesOf } from "./samples";

let n = 0;
const held = (posted: string, amount: number, description: string, ref?: string): Held => ({ id: `h${++n}`, posted, amount, description, ...(ref ? { ref } : {}) });
const line = (posted: string, amount: number, description: string, ref?: string): Incoming => ({ posted, amount, description, ...(ref ? { ref } : {}) });

test("the same file twice: every line is a duplicate, nothing is new", () => {
  const result = readOfx(bytesOf(bankV1()));
  assert.ok(result.ok);
  const lines = result.statements[0]!.lines;
  const kept = lines.map((l, i) => ({ id: `t${i}`, ...l }));
  const again = findDuplicates(kept, lines);
  assert.deepEqual(again.fresh, []);
  assert.equal(again.exact.length, 11);
  assert.ok(again.exact.every((e) => e.by === "ref"));
  assert.deepEqual(again.likely, []);
  // each incoming line took a different held line: the two coffees on the 25th didn't share one
  assert.equal(new Set(again.exact.map((e) => e.held)).size, 11);
});

test("overlapping files: the overlap is dropped, the rest is new", () => {
  const first = [held("2026-10-01", -450, "COFFEE", "a1"), held("2026-10-02", -1200, "LUNCH", "a2")];
  const second = [line("2026-10-02", -1200, "LUNCH", "a2"), line("2026-10-03", -800, "BAKERY", "a3")];
  const d = findDuplicates(first, second);
  assert.deepEqual(d.exact, [{ index: 0, held: first[1]!.id, by: "ref" }]);
  assert.deepEqual(d.fresh, [1]);
});

test("a bank that numbers each file's lines from 1 again: an old number is not a reason to drop a new line", () => {
  const first = [held("2026-09-30", -450, "COFFEE", "1"), held("2026-09-30", -1200, "LUNCH", "2")];
  const second = [line("2026-10-01", -999, "BOOKS", "1"), line("2026-10-02", -1200, "LUNCH", "2")];
  const d = findDuplicates(first, second);
  assert.deepEqual(d.exact, []);
  assert.deepEqual(d.fresh, [0, 1]);
});

test("a bank that makes new identifiers each download: the day, amount and wording still match", () => {
  const first = [held("2026-10-01", -450, "Tim Hortons #1234", "old-1")];
  const d = findDuplicates(first, [line("2026-10-01", -450, "TIM HORTONS  #1234", "new-9")]);
  assert.deepEqual(d.exact, [{ index: 0, held: first[0]!.id, by: "content" }]);
  assert.deepEqual(d.fresh, []);
});

test("two alike on one day are two: one held and two arriving means one duplicate and one new", () => {
  const first = [held("2026-10-25", -450, "TIM HORTONS #1234")];
  const d = findDuplicates(first, [line("2026-10-25", -450, "TIM HORTONS #1234"), line("2026-10-25", -450, "TIM HORTONS #1234")]);
  assert.equal(d.exact.length, 1);
  assert.deepEqual(d.fresh, [1]);
  // and a file's own repeats are never dropped against each other
  const alone = findDuplicates([], [line("2026-10-25", -450, "TIM HORTONS", "same"), line("2026-10-25", -450, "TIM HORTONS", "same")]);
  assert.deepEqual(alone.fresh, [0, 1]);
  assert.deepEqual(alone.exact, []);
});

test("the same statement in another format: a likely duplicate for the user to decide", () => {
  const fromQfx = [held("2026-10-02", -8437, "SAVE ON FOODS #987", "q1"), held("2026-10-15", 245000, "PAYROLL DEPOSIT", "q2"), held("2026-10-20", -3000, "PARKING", "q3")];
  const fromCsv = [line("2026-10-01", -8437, "POS SAVE ON FOODS 987 VANCOUVER"), line("2026-10-15", 245000, "ACME FOODS PAYROLL"), line("2026-10-18", -6000, "DINNER")];
  const d = findDuplicates(fromQfx, fromCsv);
  assert.deepEqual(d.exact, []);
  assert.deepEqual(d.likely, [
    { index: 0, held: fromQfx[0]!.id, days: 1 },
    { index: 1, held: fromQfx[1]!.id, days: 0 },
  ]);
  assert.deepEqual(d.fresh, [2]);
});

test("likely only inside what was imported before, only close in days, and one for one", () => {
  const first = [held("2026-10-10", -2000, "ATM WITHDRAWAL"), held("2026-10-11", -500, "SNACK")];
  // after the last imported day: a plain new line, however similar
  assert.deepEqual(findDuplicates(first, [line("2026-10-12", -2000, "LUNCH SPOT")]).fresh, [0]);
  // too many days apart
  assert.deepEqual(findDuplicates(first, [line("2026-10-05", -2000, "LUNCH SPOT")]).fresh, [0]);
  assert.deepEqual(findDuplicates(first, [line("2026-10-05", -2000, "LUNCH SPOT")], { window: 5 }).likely.length, 1);
  // two arriving, one held: the nearer day takes it, the other is new
  const d = findDuplicates(first, [line("2026-10-08", -2000, "A"), line("2026-10-09", -2000, "B")]);
  assert.deepEqual(d.likely, [{ index: 1, held: first[0]!.id, days: 1 }]);
  assert.deepEqual(d.fresh, [0]);
});

test("nothing held, or nothing arriving", () => {
  assert.deepEqual(findDuplicates([], [line("2026-10-01", -1, "X")]), { fresh: [0], exact: [], likely: [] });
  assert.deepEqual(findDuplicates([held("2026-10-01", -1, "X")], []), { fresh: [], exact: [], likely: [] });
});
