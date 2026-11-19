// Recurring charges: subscriptions at a steady price, bills that vary, and what is neither.
import assert from "node:assert/strict";
import test from "node:test";
import { addMonths } from "../src/core/dates";
import { findRecurring, type Charge } from "../src/core/recurring";

let n = 0;
const charge = (merchant: string, posted: string, dollars: number, currency = "CAD"): Charge => ({ id: `c${String(++n).padStart(4, "0")}`, posted, amount: -Math.round(dollars * 100), currency, merchant });
const monthlyFrom = (merchant: string, first: string, dollars: number[], currency = "CAD"): Charge[] => dollars.map((d, i) => charge(merchant, addMonths(first, i), d, currency));

test("the same day next month, clamped to the month's end", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-10-15", 3), "2027-01-15");
  assert.equal(addMonths("2026-12-31", 12), "2027-12-31");
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-01-15", -1), "2025-12-15");
  assert.equal(addMonths("2026-05-20", 0), "2026-05-20");
});

test("a monthly subscription at a steady price", () => {
  const found = findRecurring(monthlyFrom("Streamflix", "2026-06-15", [16.49, 16.49, 16.49, 16.49, 16.49]), "2026-11-01");
  assert.equal(found.length, 1);
  const [s] = found;
  assert.deepEqual(
    { merchant: s!.merchant, rhythm: s!.rhythm, typical: s!.typical, varies: s!.varies, count: s!.count, first: s!.first, last: s!.last, next: s!.next, active: s!.active, yearly: s!.yearly },
    { merchant: "Streamflix", rhythm: "monthly", typical: 1649, varies: false, count: 5, first: "2026-06-15", last: "2026-10-15", next: "2026-11-15", active: true, yearly: 19788 },
  );
  assert.equal(s!.ids.length, 5);
});

test("posting days wander a little; a missed month doesn't break it; a price rise starts a new one", () => {
  const wandering = [charge("Gym", "2026-05-01", 55), charge("Gym", "2026-06-02", 55), charge("Gym", "2026-06-30", 55), charge("Gym", "2026-08-01", 55), charge("Gym", "2026-09-01", 55)];
  assert.equal(findRecurring(wandering, "2026-09-10")[0]!.rhythm, "monthly");
  // July is missing: four gaps, three fit
  const skipped = [charge("Gym", "2026-04-01", 55), charge("Gym", "2026-05-01", 55), charge("Gym", "2026-06-01", 55), charge("Gym", "2026-08-01", 55), charge("Gym", "2026-09-01", 55)];
  assert.equal(findRecurring(skipped, "2026-09-10")[0]!.count, 5);
  // 9.99 for four months, then 11.99: two entries, the old one no longer going
  const raised = [...monthlyFrom("Tunes", "2026-03-05", [9.99, 9.99, 9.99, 9.99]), ...monthlyFrom("Tunes", "2026-07-05", [11.99, 11.99, 11.99, 11.99])];
  const tunes = findRecurring(raised, "2026-10-20");
  assert.deepEqual(tunes.map((t) => [t.typical, t.active, t.count]), [[1199, true, 4], [999, false, 4]]);
});

test("two subscriptions from one merchant are told apart by price", () => {
  const store = [...monthlyFrom("App Store", "2026-05-03", [1.29, 1.29, 1.29, 1.29]), ...monthlyFrom("App Store", "2026-05-20", [10.99, 10.99, 10.99, 10.99])];
  const found = findRecurring(store, "2026-08-25");
  assert.deepEqual(found.map((f) => [f.typical, f.rhythm, f.count, f.next]), [[1099, "monthly", 4, "2026-09-20"], [129, "monthly", 4, "2026-09-03"]]);
});

test("a bill that varies month to month is found, and says so", () => {
  const hydro = monthlyFrom("City Power", "2026-01-12", [88.4, 131.02, 95.77, 60.15, 71.9, 104.33]);
  const [bill] = findRecurring(hydro, "2026-06-20");
  assert.deepEqual([bill!.rhythm, bill!.varies, bill!.count, bill!.typical, bill!.yearly], ["monthly", true, 6, 8840, 106080]);
});

test("weekly and fortnightly only at a steady price: a shopping habit is not a subscription", () => {
  const saturdays = ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03"];
  const groceries = saturdays.map((day, i) => charge("Big Grocer", day, [84.37, 122.1, 67.45, 141.8, 98.02][i]!));
  assert.deepEqual(findRecurring(groceries, "2026-10-04"), []);
  const pass = saturdays.map((day) => charge("Weekly Pass", day, 30));
  assert.deepEqual(findRecurring(pass, "2026-10-04").map((f) => [f.rhythm, f.typical, f.yearly, f.next]), [["weekly", 3000, 156000, "2026-10-10"]]);
  const fortnight = ["2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18"].map((day) => charge("Lawn Care", day, 45));
  assert.equal(findRecurring(fortnight, "2026-09-20")[0]!.rhythm, "fortnightly");
});

test("quarterly and yearly", () => {
  const strata = ["2026-01-02", "2026-04-01", "2026-07-02", "2026-10-01"].map((day) => charge("Water Utility", day, 210.5));
  assert.deepEqual(findRecurring(strata, "2026-10-15").map((f) => [f.rhythm, f.yearly, f.next]), [["quarterly", 84200, "2027-01-01"]]);
  const domain = [charge("Domain Registrar", "2025-03-14", 21.99), charge("Domain Registrar", "2026-03-14", 21.99)];
  assert.deepEqual(findRecurring(domain, "2026-11-01").map((f) => [f.rhythm, f.count, f.next, f.active, f.yearly]), [["yearly", 2, "2027-03-14", true, 2199]]);
});

test("what isn't recurring", () => {
  // two charges a month apart are not yet a pattern
  assert.deepEqual(findRecurring(monthlyFrom("Streamflix", "2026-09-15", [16.49, 16.49]), "2026-11-01"), []);
  // irregular shopping at one merchant
  const shop = [charge("Mega Mart", "2026-06-03", 23.1), charge("Mega Mart", "2026-06-19", 208.44), charge("Mega Mart", "2026-08-02", 12.99), charge("Mega Mart", "2026-08-09", 77.2), charge("Mega Mart", "2026-10-28", 41.0)];
  assert.deepEqual(findRecurring(shop, "2026-11-01"), []);
  // on the same day every month, but the amounts are all over the place: shopping, not a bill
  assert.deepEqual(findRecurring(monthlyFrom("Warehouse Club", "2026-05-09", [38.2, 412.75, 61.4, 655.1, 90.0]), "2026-10-01"), []);
  // a heating bill that triples in winter still counts
  assert.equal(findRecurring(monthlyFrom("Gas Utility", "2026-01-20", [148.0, 139.5, 92.3, 61.0, 52.4, 50.9]), "2026-07-01").length, 1);
  // money in is never a charge, and a line with no merchant can't be grouped
  const refunds = monthlyFrom("Streamflix", "2026-06-15", [16.49, 16.49, 16.49]).map((c) => ({ ...c, amount: -c.amount }));
  assert.deepEqual(findRecurring(refunds, "2026-11-01"), []);
  assert.deepEqual(findRecurring(monthlyFrom(" ", "2026-06-15", [5, 5, 5]), "2026-11-01"), []);
  assert.deepEqual(findRecurring([], "2026-11-01"), []);
});

test("still going or not, each currency on its own, and the order they come in", () => {
  const all = [
    ...monthlyFrom("Old Magazine", "2025-11-10", [8, 8, 8, 8]), // stopped in February
    ...monthlyFrom("Streamflix", "2026-07-15", [16.49, 16.49, 16.49, 16.49]),
    ...monthlyFrom("Cloud Drive", "2026-07-02", [2.99, 2.99, 2.99, 2.99], "USD"),
    ...monthlyFrom("streamflix", "2026-07-20", [3.5, 3.5, 3.5, 3.5], "USD"),
  ];
  const found = findRecurring(all, "2026-10-25");
  assert.deepEqual(found.map((f) => [f.merchant, f.currency, f.active]), [
    ["Streamflix", "CAD", true],
    ["streamflix", "USD", true],
    ["Cloud Drive", "USD", true],
    ["Old Magazine", "CAD", false],
  ]);
  // the day asked about only decides "still going": 46 days after the last charge it still is, 47 it isn't
  const one = monthlyFrom("Streamflix", "2026-07-15", [16.49, 16.49, 16.49]);
  assert.equal(findRecurring(one, "2026-10-31")[0]!.active, true);
  assert.equal(findRecurring(one, "2026-11-01")[0]!.active, false);
  // the same charges in any order give the same answer
  assert.deepEqual(findRecurring([...all].reverse(), "2026-10-25"), found);
});
