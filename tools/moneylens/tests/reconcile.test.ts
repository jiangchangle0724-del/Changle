// ACC-2: opening balance plus the lines equals the closing balance, to the cent, or the import
// carries the "unreconciled" mark.
import assert from "node:assert/strict";
import test from "node:test";
import { reconcile, runningBalances, unreconciled } from "../src/core/reconcile";

const lines = (...amounts: number[]) => amounts.map((amount) => ({ amount }));

test("it adds up, or it says by how much it doesn't", () => {
  assert.deepEqual(reconcile(lines(-8437, 245000, -120000), 100000, 216563), { status: "reconciled", opening: 100000, closing: 216563, sum: 116563 });
  // one cent is a mismatch: nothing is forgiven
  assert.deepEqual(reconcile(lines(-8437, 245000, -120000), 100000, 216564), { status: "mismatch", opening: 100000, closing: 216564, sum: 116563, difference: 1 });
  assert.deepEqual(reconcile(lines(-8437, 245000, -120000), 100000, 216000), { status: "mismatch", opening: 100000, closing: 216000, sum: 116563, difference: -563 });
  // a credit card: owing 350.00, spending 62.18 more, owing 412.18
  assert.equal(reconcile(lines(-31240, -6803, 2000, 35025, -5200), -35000, -41218).status, "reconciled");
  assert.equal(reconcile([], 500, 500).status, "reconciled");
  assert.equal(reconcile(lines(0), 0, 0).status, "reconciled");
});

test("with a balance missing there is nothing to check, and that is said, not passed", () => {
  assert.deepEqual(reconcile(lines(-100), undefined, undefined), { status: "unchecked", why: "no-balances", sum: -100 });
  assert.deepEqual(reconcile(lines(-100), undefined, 900), { status: "unchecked", why: "no-opening", sum: -100 });
  assert.deepEqual(reconcile(lines(-100), 1000, undefined), { status: "unchecked", why: "no-closing", sum: -100 });
  assert.equal(reconcile(lines(-100), NaN, 900).status, "unchecked");
});

test("only a clean reconciliation goes without the mark", () => {
  assert.equal(unreconciled(reconcile(lines(-100), 1000, 900)), false);
  assert.equal(unreconciled(reconcile(lines(-100), 1000, 901)), true);
  assert.equal(unreconciled(reconcile(lines(-100), undefined, 900)), true);
});

test("an amount that isn't whole smallest units is an error, never rounded", () => {
  assert.throws(() => reconcile(lines(-100.5), 1000, 900), RangeError);
  assert.throws(() => reconcile(lines(Number.MAX_SAFE_INTEGER), 0, 0), RangeError);
});

test("a file with a running balance gives both ends", () => {
  const file = [
    { amount: -500, balance: 9500 },
    { amount: 2000, balance: 11500 },
    { amount: -250, balance: 11250 },
  ];
  assert.deepEqual(runningBalances(file), { opening: 10000, closing: 11250 });
  const ends = runningBalances(file)!;
  assert.equal(reconcile(file, ends.opening, ends.closing).status, "reconciled");
  // balances on some lines only
  assert.deepEqual(runningBalances([{ amount: -500 }, { amount: 2000, balance: 11500 }, { amount: -250 }]), { opening: 10000, closing: 11250 });
  assert.deepEqual(runningBalances([{ amount: -500, balance: 9500 }]), { opening: 10000, closing: 9500 });
  assert.equal(runningBalances([{ amount: -500 }, { amount: 100 }]), null);
  assert.equal(runningBalances([]), null);
});

test("a line missing from the middle shows where the balances stop following", () => {
  const gap = [
    { amount: -500, balance: 9500 },
    { amount: -250, balance: 11250 }, // the 2,000 deposit before it is missing
    { amount: -100, balance: 11150 },
  ];
  const ends = runningBalances(gap)!;
  assert.equal(ends.breaksAt, 1);
  assert.equal(reconcile(gap, ends.opening, ends.closing).status, "mismatch");
});
