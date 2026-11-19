// ACC-5: a statement's day is a calendar day, read as written, with no clock and no time zone.
import assert from "node:assert/strict";
import test from "node:test";
import { addDays, dayNumber, daysBetween, fromDayNumber, isDay, makeDay, monthOf, ofxDay, parseDay } from "../src/core/dates";

test("only real days", () => {
  assert.equal(makeDay(2026, 10, 31), "2026-10-31");
  assert.equal(makeDay(2024, 2, 29), "2024-02-29");
  assert.equal(makeDay(2000, 2, 29), "2000-02-29");
  for (const [y, m, d] of [[2026, 2, 29], [2100, 2, 29], [1900, 2, 29], [2026, 4, 31], [2026, 13, 1], [2026, 0, 1], [2026, 1, 0], [1899, 1, 1], [2200, 1, 1], [2026, 1.5, 1]] as const) {
    assert.equal(makeDay(y, m, d), null, `${y}-${m}-${d}`);
  }
  assert.ok(isDay("2026-10-31"));
  for (const bad of ["2026-10-32", "2026-1-01", "20261031", "2026-10-31T00:00", "", null, 20261031]) assert.ok(!isDay(bad), String(bad));
});

test("day numbers agree with the calendar, both ways, for 230 years", () => {
  assert.equal(dayNumber("1970-01-01"), 0);
  assert.equal(dayNumber("2000-03-01"), 11017);
  for (let n = -25567; n < 84000; n += 37) {
    const date = new Date(n * 86400_000);
    const day = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    assert.equal(fromDayNumber(n), day);
    assert.equal(dayNumber(day), n);
  }
});

test("stepping over month ends, year ends and leap days", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-01", "2026-10-31"), 30);
  assert.equal(daysBetween("2026-10-31", "2026-10-01"), -30);
  assert.equal(daysBetween("2024-01-01", "2025-01-01"), 366);
  assert.equal(monthOf("2026-10-31"), "2026-10");
});

test("numbers only: the file's parser says which comes first", () => {
  assert.equal(parseDay("2026-10-31", "YMD"), "2026-10-31");
  assert.equal(parseDay("2026/10/31", "YMD"), "2026-10-31");
  assert.equal(parseDay("20261031", "YMD"), "2026-10-31");
  assert.equal(parseDay("2026-1-5", "YMD"), "2026-01-05");
  assert.equal(parseDay("10/31/2026", "MDY"), "2026-10-31");
  assert.equal(parseDay("1/5/2026", "MDY"), "2026-01-05");
  assert.equal(parseDay("10-31-26", "MDY"), "2026-10-31");
  assert.equal(parseDay("31/10/2026", "DMY"), "2026-10-31");
  assert.equal(parseDay("31.10.2026", "DMY"), "2026-10-31");
  assert.equal(parseDay("5/1/2026", "DMY"), "2026-01-05");
  assert.equal(parseDay("01/02/99", "MDY"), "1999-01-02");
  // the same text is a different day under the other style, and never silently swapped
  assert.equal(parseDay("05/01/2026", "MDY"), "2026-05-01");
  assert.equal(parseDay("31/10/2026", "MDY"), null);
  assert.equal(parseDay("10/31/2026", "DMY"), null);
  assert.equal(parseDay("20261031", "MDY"), null);
  assert.equal(parseDay("10/31/2026", "YMD"), null);
});

test("a month's name reads the same whatever the style", () => {
  for (const style of ["YMD", "MDY", "DMY"] as const) {
    assert.equal(parseDay("Oct 31, 2026", style), "2026-10-31");
    assert.equal(parseDay("October 31 2026", style), "2026-10-31");
    assert.equal(parseDay("31 Oct 2026", style), "2026-10-31");
    assert.equal(parseDay("31-OCT-26", style), "2026-10-31");
    assert.equal(parseDay("2026-Oct-31", style), "2026-10-31");
    assert.equal(parseDay("Sept. 5, 2026", style), "2026-09-05");
    assert.equal(parseDay("31 déc. 2026", style), "2026-12-31");
    assert.equal(parseDay("1 août 2026", style), "2026-08-01");
    assert.equal(parseDay("15 févr 2026", style), "2026-02-15");
  }
});

test("what isn't one real day is refused", () => {
  for (const text of ["", "yesterday", "Oct 31", "31 Oct", "Foo 31, 2026", "2026-02-30", "Feb 30, 2026", "10/31", "2026-10-31 12:00", "1/2/3", "10/31/202", "0/0/0", "x".repeat(41)]) {
    assert.equal(parseDay(text, "MDY"), null, JSON.stringify(text));
  }
});

test("an OFX date is its first eight digits, whatever clock and zone follow", () => {
  assert.equal(ofxDay("20261031"), "2026-10-31");
  assert.equal(ofxDay("20261031120000"), "2026-10-31");
  assert.equal(ofxDay("20261031120000.000[-8:PST]"), "2026-10-31");
  // midnight GMT is the evening before in Vancouver: the day stays the one the bank wrote
  assert.equal(ofxDay("20261101000000[0:GMT]"), "2026-11-01");
  for (const bad of ["", "2026103", "20261332", "20260230", "abcdefgh"]) assert.equal(ofxDay(bad), null, bad);
});
