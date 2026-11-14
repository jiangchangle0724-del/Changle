// The banknotes money flies in (ui/notes.ts): the bills a sum is paid in, a handful at least, never
// more than a few.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BILLS, MOST_NOTES, notesFor } from "../src/client/ui/notes";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("a sum is paid in the fewest bills, biggest first", () => {
  assert.deepEqual(notesFor(180), [100, 50, 20, 10]);
  assert.deepEqual(notesFor(45), [20, 20, 5]);
  assert.deepEqual(notesFor(1385), [500, 500, 100, 100, 100, 50, 20, 10]);
});

test("a round sum is changed into smaller bills, so at least three fly", () => {
  assert.deepEqual(notesFor(200), [100, 50, 50]);
  assert.deepEqual(notesFor(500), [100, 100, 100, 100, 100]);
  assert.deepEqual(notesFor(100), [50, 20, 20, 10]);
  assert.deepEqual(notesFor(15), [5, 5, 5]);
  // (a dollar or two can't be changed)
  assert.deepEqual(notesFor(2), [1, 1]);
});

test("every sum up to $5,000: real bills, biggest first, 1 to 8 of them, adding up while they fit", () => {
  for (let n = 1; n <= 5000; n++) {
    const notes = notesFor(n);
    assert.ok(notes.length >= Math.min(3, n) && notes.length <= MOST_NOTES, `${n}: ${notes}`);
    assert.ok(notes.every((b) => (BILLS as readonly number[]).includes(b)), `${n}: ${notes}`);
    assert.deepEqual(notes, [...notes].sort((a, b) => b - a), `${n}: ${notes}`);
    if (notes.length < MOST_NOTES) assert.equal(sum(notes), n, `${n}: ${notes}`);
    else assert.ok(sum(notes) <= n, `${n}: ${notes}`);
  }
});
