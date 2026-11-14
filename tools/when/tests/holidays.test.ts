import assert from "node:assert/strict";
import test from "node:test";
import { HOLIDAYS, holidaysOn, inLongWeekend } from "../src/engine/holidays";
import { addDays, isDay, weekday } from "../src/engine/time";

test("the complete list is dated, ordered, bilingual and sourced, within the supported range", () => {
  assert.equal(HOLIDAYS.length, 45);
  assert.equal(HOLIDAYS.filter((holiday) => holiday.kind === "stat").length, 24);
  assert.equal(HOLIDAYS.filter((holiday) => holiday.kind === "festival").length, 21);
  assert.deepEqual(HOLIDAYS.map((holiday) => holiday.day), HOLIDAYS.map((holiday) => holiday.day).sort());
  const identities = new Set<string>();
  for (const holiday of HOLIDAYS) {
    assert.ok(isDay(holiday.day), holiday.day);
    assert.ok(holiday.day >= "2026-11-01" && holiday.day <= "2028-12-31", holiday.day);
    assert.ok(holiday.zh.trim() && holiday.en.trim(), holiday.day);
    const source = new URL(holiday.source);
    assert.equal(source.protocol, "https:");
    assert.equal(source.username, "");
    assert.equal(source.password, "");
    const identity = `${holiday.day}:${holiday.kind}:${holiday.en}`;
    assert.ok(!identities.has(identity), identity);
    identities.add(identity);
  }
});

test("all eleven B.C. statutory holidays have the official dates and names in each full year", () => {
  // B.C.'s 2026/2027 table and its Section 44 date rules for 2028; the latter's
  // movable dates were also checked against Alberta's official 2026–2028 table.
  const expected = [
    ["元旦", "New Year's Day", "01-01", "01-01"],
    ["家庭日", "Family Day", "02-15", "02-21"],
    ["耶稣受难日", "Good Friday", "03-26", "04-14"],
    ["维多利亚日", "Victoria Day", "05-24", "05-22"],
    ["国庆日", "Canada Day", "07-01", "07-01"],
    ["卑诗日", "B.C. Day", "08-02", "08-07"],
    ["劳动节", "Labour Day", "09-06", "09-04"],
    ["真相与和解日", "National Day for Truth and Reconciliation", "09-30", "09-30"],
    ["感恩节", "Thanksgiving", "10-11", "10-09"],
    ["国殇日", "Remembrance Day", "11-11", "11-11"],
    ["圣诞节", "Christmas Day", "12-25", "12-25"],
  ];
  for (const [year, index] of [[2027, 2], [2028, 3]]) {
    const rows = HOLIDAYS.filter((holiday) => holiday.kind === "stat" && holiday.day.startsWith(`${year}-`));
    assert.deepEqual(rows.map(({ day, zh, en }) => [day, zh, en]),
      expected.map((row) => [`${year}-${row[index]}`, row[0], row[1]]));
    for (const holiday of rows) {
      assert.ok(holiday.source.startsWith("https://www2.gov.bc.ca/"));
      if (["Family Day", "Victoria Day", "B.C. Day", "Labour Day", "Thanksgiving"].includes(holiday.en)) {
        assert.equal(weekday(holiday.day), 1, holiday.en);
      }
      if (holiday.en === "Good Friday") assert.equal(weekday(holiday.day), 5);
    }
  }
  assert.deepEqual(HOLIDAYS.filter((holiday) => holiday.kind === "stat" && holiday.day.startsWith("2026-"))
    .map(({ day, en }) => [day, en]), [["2026-11-11", "Remembrance Day"], ["2026-12-25", "Christmas Day"]]);
});

test("every lunar festival matches its year's Hong Kong Observatory conversion table", () => {
  const expected = [
    ["除夕", "Lunar New Year's Eve", "2027-02-05", "2028-01-25"],
    ["春节", "Lunar New Year", "2027-02-06", "2028-01-26"],
    ["元宵节", "Lantern Festival", "2027-02-20", "2028-02-09"],
    ["端午节", "Dragon Boat Festival", "2027-06-09", "2028-05-28"],
    ["中秋节", "Mid-Autumn Festival", "2027-09-15", "2028-10-03"],
  ];
  for (const [zh, en, ...days] of expected) {
    assert.deepEqual(HOLIDAYS.filter((holiday) => holiday.en === en).map((holiday) => holiday.day), days);
    for (const day of days) {
      assert.deepEqual(holidaysOn(day), [{ day, zh, en, kind: "festival",
        source: `https://www.hko.gov.hk/en/gts/time/calendar/text/files/T${day.slice(0, 4)}e.txt` }]);
    }
  }
  // The fifth month repeats in 2028; its leap-month fifth day is not Dragon Boat.
  assert.deepEqual(holidaysOn("2028-06-27"), []);
});

test("fixed festivals stay festivals; Easter Sunday and Monday are not B.C. statutory holidays", () => {
  for (const year of [2026, 2027, 2028]) {
    const expected = [
      ["10-31", "万圣节", "Halloween"],
      ["12-24", "平安夜", "Christmas Eve"],
      ["12-26", "节礼日", "Boxing Day"],
      ["12-31", "跨年夜", "New Year's Eve"],
    ];
    for (const [date, zh, en] of expected) {
      const day = `${year}-${date}`;
      assert.deepEqual(holidaysOn(day).map(({ zh, en, kind }) => [zh, en, kind]),
        day < "2026-11-01" ? [] : [[zh, en, "festival"]]);
    }
  }
  for (const day of ["2027-03-28", "2027-03-29", "2028-04-16", "2028-04-17"]) {
    assert.deepEqual(holidaysOn(day), []);
  }
});

test("lookups return all rows on a day and a fresh empty array for ordinary or unsupported days", () => {
  for (const holiday of HOLIDAYS) {
    assert.deepEqual(holidaysOn(holiday.day), HOLIDAYS.filter((row) => row.day === holiday.day));
  }
  const result = holidaysOn("2027-05-24");
  result.pop();
  assert.equal(holidaysOn("2027-05-24").length, 1);
  for (const day of ["2027-05-25", "2026-10-31", "2029-01-01", "2028-02-30", ""]) {
    assert.deepEqual(holidaysOn(day), []);
    assert.equal(inLongWeekend(day), false, day);
  }
});

test("Victoria Day includes exactly Saturday, Sunday and Monday", () => {
  for (const day of ["2027-05-22", "2027-05-23", "2027-05-24"]) assert.equal(inLongWeekend(day), true, day);
  for (const day of ["2027-05-21", "2027-05-25", "2027-11-11"]) assert.equal(inLongWeekend(day), false, day);
});

test("every day in the supported range matches the independently listed long weekends", () => {
  // Inclusive spans; festivals, bridge days and employer-specific substitute days are excluded.
  const spans = [
    ["2026-12-25", "2026-12-27"],
    ["2027-01-01", "2027-01-03"],
    ["2027-02-13", "2027-02-15"],
    ["2027-03-26", "2027-03-28"],
    ["2027-05-22", "2027-05-24"],
    ["2027-07-31", "2027-08-02"],
    ["2027-09-04", "2027-09-06"],
    ["2027-10-09", "2027-10-11"],
    ["2028-02-19", "2028-02-21"],
    ["2028-04-14", "2028-04-16"],
    ["2028-05-20", "2028-05-22"],
    ["2028-08-05", "2028-08-07"],
    ["2028-09-02", "2028-09-04"],
    ["2028-10-07", "2028-10-09"],
    ["2028-12-23", "2028-12-25"],
  ];
  let count = 0;
  for (let day = "2026-11-01"; day <= "2028-12-31"; day = addDays(day, 1)) {
    const expected = spans.some(([start, end]) => start <= day && day <= end);
    assert.equal(inLongWeekend(day), expected, day);
    if (expected) count++;
  }
  assert.equal(count, 45);
});

test("no bridge days, substitute Mondays, or extra days off for festivals", () => {
  for (const [start, end] of [
    ["2027-06-30", "2027-07-05"], // Thursday Canada Day
    ["2027-09-30", "2027-10-04"], // Thursday Truth and Reconciliation
    ["2027-11-11", "2027-11-15"], // Thursday Remembrance Day
    ["2027-12-24", "2027-12-27"], // Saturday Christmas; Friday/Sunday festivals
    ["2027-12-31", "2028-01-03"], // Saturday New Year; no replacement Monday
    ["2028-06-30", "2028-07-03"], // Saturday Canada Day
    ["2028-09-29", "2028-10-03"], // Saturday Truth and Reconciliation; Tuesday Mid-Autumn
    ["2028-11-10", "2028-11-13"], // Saturday Remembrance Day
  ]) {
    for (let day = start; day <= end; day = addDays(day, 1)) assert.equal(inLongWeekend(day), false, day);
  }
  assert.equal(inLongWeekend("2026-12-24"), false); // Christmas Eve does not extend Friday Christmas
  assert.equal(inLongWeekend("2028-12-26"), false); // Boxing Day does not extend Monday Christmas
  assert.equal(inLongWeekend("2028-01-25"), false); // Tuesday Lunar New Year's Eve
});
