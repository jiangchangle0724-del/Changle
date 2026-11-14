// Gatherings asked by the period of the day (凌晨 0–6, 早上 6–11, 中午 11–14, 下午 14–18,
// 晚上 18–23:59), as every new one is from 2026-11-14. Run with `npx tsx --test tests/periods.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  best,
  cleanAnswers,
  clock,
  hoursLabel,
  mealLabel,
  mealTime,
  parseSlot,
  partHeading,
  partLabel,
  partRange,
  partsOf,
  PERIOD_MINUTES,
  quickSlots,
  shortDate,
  slotLabel,
  slotsOf,
  tally,
} from "../src/engine";
import type { Person } from "../src/engine";

const SAT = "2026-11-21";

test("five periods a day, from midnight on, covering the whole day without a gap", () => {
  assert.deepEqual(partsOf("periods"), [
    "dawn",
    "morning",
    "noon",
    "afternoon",
    "eve",
  ]);
  assert.deepEqual(slotsOf([SAT], "periods"), [
    `${SAT}:dawn`,
    `${SAT}:morning`,
    `${SAT}:noon`,
    `${SAT}:afternoon`,
    `${SAT}:eve`,
  ]);
  const ranges = partsOf("periods").map((part) => partRange("periods", part)!);
  assert.deepEqual(ranges, [
    [0, 360],
    [360, 660],
    [660, 840],
    [840, 1080],
    [1080, 1439],
  ]);
  for (let i = 1; i < ranges.length; i++)
    assert.equal(
      ranges[i][0],
      ranges[i - 1][1],
      "each starts where the one before ends",
    );
  assert.deepEqual(Object.keys(PERIOD_MINUTES), [
    "dawn",
    "morning",
    "noon",
    "afternoon",
    "eve",
  ]);
  // the half days and the whole day have no stated hours
  assert.equal(partRange("half", "eve"), null);
  assert.equal(partRange("day", "day"), null);
});

test("what each period is called, and its hours", () => {
  assert.deepEqual(
    partsOf("periods").map((part) => partLabel(part, "zh")),
    ["凌晨", "早上", "中午", "下午", "晚上"],
  );
  assert.deepEqual(
    partsOf("periods").map((part) => partHeading(part, "en").replace("­", "")),
    ["Night", "Morning", "Midday", "Afternoon", "Evening"],
  );
  assert.deepEqual(
    partsOf("periods").map((part) => hoursLabel(partRange("periods", part)!)),
    ["0–6", "6–11", "11–14", "14–18", "18–24"],
  );
  assert.equal(slotLabel(SAT, "noon", "zh"), "11月21日 周六 中午");
  // 凌晨 of a Saturday is Friday night in English: "early hours" keeps it on Saturday
  assert.equal(slotLabel(SAT, "dawn", "en"), "Sat, Nov 21, early hours");
  assert.equal(clock(0), "0:00");
  assert.equal(clock(1170), "19:30");
  assert.equal(clock(1439), "23:59");
  assert.equal(shortDate("2026-11-06", "zh"), "11/6");
  assert.equal(shortDate("2026-11-06", "en"), "Nov 6");
});

test("a period is a slot like any other: answered, counted, ranked", () => {
  for (const part of partsOf("periods"))
    assert.deepEqual(parseSlot(`${SAT}:${part}`), { day: SAT, part });
  const slots = new Set(slotsOf([SAT], "periods"));
  assert.deepEqual(
    cleanAnswers(
      { [`${SAT}:noon`]: 2, [`${SAT}:am`]: 2, [`${SAT}:eve`]: 1 },
      slots,
    ),
    { [`${SAT}:noon`]: 2, [`${SAT}:eve`]: 1 },
    "a half day's slot isn't one of this gathering's",
  );
  const person = (id: string, answers: Person["answers"]): Person => ({
    id,
    name: id,
    must: false,
    proxy: false,
    answers,
    at: 0,
  });
  const people = [
    person("a", { [`${SAT}:eve`]: 2, [`${SAT}:noon`]: 2 }),
    person("b", { [`${SAT}:eve`]: 2 }),
    person("c", { [`${SAT}:noon`]: 1 }),
  ];
  const top = best(
    tally({ days: [SAT], grain: "periods", people, minPeople: 1 }),
  );
  assert.deepEqual(
    top.map((t) => [t.part, t.yes.length, t.maybe.length]),
    [
      ["eve", 2, 0],
      ["noon", 1, 1],
    ],
  );
});

test("filling in many at once leaves 凌晨 alone; 晚上都行 is only the evenings", () => {
  const days = ["2026-11-20", SAT];
  assert.deepEqual(
    quickSlots({ kind: "all" }, days, "periods"),
    days.flatMap((day) =>
      ["morning", "noon", "afternoon", "eve"].map((part) => `${day}:${part}`),
    ),
  );
  assert.deepEqual(quickSlots({ kind: "day", day: SAT }, days, "periods"), [
    `${SAT}:morning`,
    `${SAT}:noon`,
    `${SAT}:afternoon`,
    `${SAT}:eve`,
  ]);
  assert.deepEqual(quickSlots({ kind: "weekends" }, days, "periods"), [
    `${SAT}:morning`,
    `${SAT}:noon`,
    `${SAT}:afternoon`,
    `${SAT}:eve`,
  ]);
  assert.deepEqual(quickSlots({ kind: "evenings" }, days, "periods"), [
    `2026-11-20:eve`,
    `${SAT}:eve`,
  ]);
});

test("the meal 随便 starts from, for each period", () => {
  assert.deepEqual(
    partsOf("periods").map((part) => mealTime(part)),
    ["00:30", "10:00", "12:00", "15:00", "18:30"],
  );
  assert.deepEqual(
    partsOf("periods").map((part) => mealLabel(part, "zh")),
    ["0:30", "10:00", "12:00", "15:00", "18:30"],
  );
  assert.deepEqual(
    partsOf("periods").map((part) => mealLabel(part, "en")),
    ["12:30 a.m.", "10:00 a.m.", "12:00 p.m.", "3:00 p.m.", "6:30 p.m."],
  );
});
