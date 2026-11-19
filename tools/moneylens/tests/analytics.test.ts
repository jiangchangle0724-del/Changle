// Totals: spending and income by category, moves left out, refunds lowering their category (ACC-4),
// each currency on its own (ACC-6).
import assert from "node:assert/strict";
import test from "node:test";
import { monthly, splitAddsUp, summarize, type Entry } from "../src/core/analytics";
import { CATEGORIES } from "../src/core/classify";

const kindOf = (id: string) => CATEGORIES.find((c) => c.id === id)?.kind;
const entry = (posted: string, amount: number, category: string | null, more: Partial<Entry> = {}): Entry => ({ posted, amount, currency: "CAD", category, ...more });

test("a month: income, spending, what is left", () => {
  const october = [
    entry("2026-10-02", -8437, "groceries"),
    entry("2026-10-03", -31240, "groceries"),
    entry("2026-10-12", 2000, "groceries"), // a refund
    entry("2026-10-15", 245000, "pay"),
    entry("2026-10-16", -120000, "housing"),
    entry("2026-10-25", -450, "dining"),
    entry("2026-10-26", -1299, null),
    entry("2026-10-27", 5000, null),
  ];
  assert.deepEqual(summarize(october, kindOf), {
    CAD: {
      income: 250000,
      spending: 159426,
      net: 90574,
      byCategory: { groceries: 37677, pay: 245000, housing: 120000, dining: 450 },
      unsortedOut: 1299,
      unsortedIn: 5000,
      movedOut: 0,
      movedIn: 0,
      count: 8,
    },
  });
});

test("moves between the user's own accounts are neither spending nor income (ACC-4)", () => {
  const t = summarize(
    [
      entry("2026-10-20", -50000, "transfer", { pair: "b" }),
      entry("2026-10-20", 50000, "transfer", { pair: "a" }),
      entry("2026-10-22", -35025, "card-payment"), // the card isn't imported: still a move, by its category
      entry("2026-10-23", -99, null, { pair: "z" }), // paired, whatever its category says
      entry("2026-10-25", -450, "dining"),
    ],
    kindOf,
  ).CAD!;
  assert.equal(t.spending, 450);
  assert.equal(t.income, 0);
  assert.equal(t.movedOut, 85124);
  assert.equal(t.movedIn, 50000);
  assert.deepEqual(t.byCategory, { dining: 450 });
});

test("a refund larger than the month's spending shows as negative spending, not as income", () => {
  const t = summarize([entry("2026-11-02", 9900, "shopping"), entry("2026-11-03", -1000, "shopping")], kindOf).CAD!;
  assert.equal(t.byCategory.shopping, -8900);
  assert.equal(t.spending, -8900);
  assert.equal(t.income, 0);
  assert.equal(t.net, 8900);
});

test("a split counts part by part", () => {
  const splits = [
    { category: "groceries", amount: -6000 },
    { category: "shopping", amount: -3000 },
    { category: null, amount: -1000 },
  ];
  assert.ok(splitAddsUp(-10000, splits));
  assert.ok(!splitAddsUp(-10000, splits.slice(0, 2)));
  const t = summarize([entry("2026-10-05", -10000, "groceries", { splits })], kindOf).CAD!;
  assert.deepEqual(t.byCategory, { groceries: 6000, shopping: 3000 });
  assert.equal(t.unsortedOut, 1000);
  assert.equal(t.spending, 10000);
  assert.equal(t.count, 1);
});

test("each currency is totalled on its own, never converted (ACC-6)", () => {
  const totals = summarize([entry("2026-10-05", -1000, "dining"), entry("2026-10-06", -2000, "dining", { currency: "USD" })], kindOf);
  assert.equal(totals.CAD!.spending, 1000);
  assert.equal(totals.USD!.spending, 2000);
  assert.deepEqual(Object.keys(totals).sort(), ["CAD", "USD"]);
});

test("a range of days, and month by month", () => {
  const entries = [entry("2026-09-30", -100, "dining"), entry("2026-10-01", -200, "dining"), entry("2026-10-31", -300, "dining"), entry("2026-11-01", -400, "dining")];
  assert.equal(summarize(entries, kindOf, { from: "2026-10-01", to: "2026-10-31" }).CAD!.spending, 500);
  assert.equal(summarize(entries, kindOf, { from: "2026-10-31" }).CAD!.spending, 700);
  assert.equal(summarize(entries, kindOf, { to: "2026-09-30" }).CAD!.spending, 100);
  assert.deepEqual(summarize([], kindOf), {});
  const months = monthly(entries, kindOf);
  assert.deepEqual(Object.keys(months), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(months["2026-10"]!.CAD!.spending, 500);
});

test("a category the book doesn't know counts as unsorted", () => {
  const t = summarize([entry("2026-10-05", -1000, "gone"), entry("2026-10-06", 700, "gone")], kindOf).CAD!;
  assert.equal(t.unsortedOut, 1000);
  assert.equal(t.unsortedIn, 700);
  assert.deepEqual(t.byCategory, {});
});
