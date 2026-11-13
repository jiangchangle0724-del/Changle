// The rules: Vancouver days, slots, and the best three (counted by hand below).
import assert from "node:assert/strict";
import test from "node:test";
import { addDays, best, cleanAnswers, cleanDays, cleanText, CODE_RE, dayLabel, daysBetween, defaultDays, instant, isDay, makeAdminCode, makeCode, nextAnswer, parseSlot, reason, slotLabel, slotsOf, tally, vancouverDay, weekday } from "../src/engine";
import type { Answers, Person } from "../src/engine";

test("a Vancouver day: UTC-7 all year, winter too", () => {
  // 2026-11-13 06:59 UTC is still the 12th in Vancouver; 07:00 UTC is midnight
  assert.equal(vancouverDay(Date.UTC(2026, 10, 13, 6, 59)), "2026-11-12");
  assert.equal(vancouverDay(Date.UTC(2026, 10, 13, 7, 0)), "2026-11-13");
  // January: the old tables say UTC-8; B.C. no longer does
  assert.equal(vancouverDay(Date.UTC(2027, 0, 10, 7, 0)), "2027-01-10");
  assert.equal(vancouverDay(Date.UTC(2026, 10, 13, 7, 0), 3), "2026-11-16");
});

test("the instant of a time of day in Vancouver", () => {
  assert.equal(instant("2026-11-21", 18, 0), Date.UTC(2026, 10, 22, 1, 0));
  assert.equal(instant("2027-01-09", 9, 30), Date.UTC(2027, 0, 9, 16, 30));
  assert.equal(vancouverDay(instant("2026-12-31", 23, 59)), "2026-12-31");
});

test("days: real ones only, counted across months and years", () => {
  assert.ok(isDay("2026-11-21"));
  assert.ok(isDay("2028-02-29"));
  for (const bad of ["2027-02-29", "2026-13-01", "2026-11-31", "2026-1-1", "20261121", "", null, 20261121]) assert.equal(isDay(bad), false, String(bad));
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(daysBetween("2026-11-12", "2027-01-07"), 56);
  assert.equal(weekday("2026-11-12"), 4); // a Thursday
  assert.equal(weekday("2026-11-21"), 6);
});

test("labels in both languages", () => {
  assert.equal(dayLabel("2026-11-21", "zh"), "11月21日 周六");
  assert.equal(dayLabel("2026-11-21", "en"), "Sat, Nov 21");
  assert.equal(slotLabel("2026-11-21", "eve", "zh"), "11月21日 周六 晚上");
  assert.equal(slotLabel("2026-11-21", "eve", "en"), "Sat, Nov 21, evening");
  assert.equal(slotLabel("2026-11-21", "day", "zh"), "11月21日 周六");
});

test("the days a host may ask about", () => {
  const today = "2026-11-12";
  assert.deepEqual(defaultDays(today).length, 14);
  assert.equal(defaultDays(today)[0], today);
  assert.deepEqual(cleanDays(["2026-11-14", "2026-11-13"], today), ["2026-11-13", "2026-11-14"]);
  assert.equal(cleanDays([], today), null, "at least one day");
  assert.equal(cleanDays(["2026-11-11"], today), null, "not yesterday");
  assert.equal(cleanDays(["2027-01-08"], today), null, "57 days ahead is too far");
  assert.deepEqual(cleanDays(["2027-01-07"], today), ["2027-01-07"], "56 days ahead is the last");
  assert.equal(cleanDays(["2026-11-13", "2026-11-13"], today), null, "a day twice");
  assert.equal(cleanDays(["2026-11-13", "tomorrow"], today), null, "something that isn't a day");
  assert.equal(cleanDays(Array.from({ length: 32 }, (_, i) => addDays(today, i)), today), null, "32 days is one too many");
  assert.equal(cleanDays("2026-11-13", today), null);
});

test("slots and answers", () => {
  assert.deepEqual(slotsOf(["2026-11-21", "2026-11-22"], "half"), ["2026-11-21:am", "2026-11-21:pm", "2026-11-21:eve", "2026-11-22:am", "2026-11-22:pm", "2026-11-22:eve"]);
  assert.deepEqual(slotsOf(["2026-11-21"], "day"), ["2026-11-21:day"]);
  assert.deepEqual(parseSlot("2026-11-21:eve"), { day: "2026-11-21", part: "eve" });
  for (const bad of ["2026-11-21", "2026-11-21:night", "2026-11-31:am", "2026-11-21:am:x", 7]) assert.equal(parseSlot(bad), null, String(bad));
  const slots = new Set(slotsOf(["2026-11-21"], "half"));
  assert.deepEqual(cleanAnswers({ "2026-11-21:am": 2, "2026-11-21:pm": 1, "2026-11-21:eve": 0, "2026-11-22:am": 2, x: 2, "2026-11-21:day": 2 }, slots), { "2026-11-21:am": 2, "2026-11-21:pm": 1 });
  assert.deepEqual(cleanAnswers([2, 1], slots), {});
  assert.deepEqual(cleanAnswers(null, slots), {});
  // a tap: not free, free, could move things, and round again
  assert.equal(nextAnswer(undefined), 2);
  assert.equal(nextAnswer(2), 1);
  assert.equal(nextAnswer(1), undefined);
});

test("names and titles", () => {
  assert.equal(cleanText("  周末\n火锅  ", 40), "周末 火锅");
  assert.equal(cleanText("阿May👩‍🍳", 16), "阿May👩‍🍳");
  assert.equal(cleanText("一二三四五六七八九十一二三四五六七八", 16), "一二三四五六七八九十一二三四五六");
  assert.equal(cleanText("   ", 16), null);
  assert.equal(cleanText(42, 16), null);
});

test("codes: 8 characters nobody misreads, and six digits", () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 200; i++) {
    const code = makeCode(rand);
    assert.match(code, CODE_RE);
    assert.doesNotMatch(code, /[01lio]/);
    assert.match(makeAdminCode(rand), /^\d{6}$/);
  }
  assert.equal(makeAdminCode(() => 0), "000000");
  assert.equal(makeAdminCode(() => 0.9999999), "999999");
});

// ---------- the best three ----------

const SAT = "2026-11-21";
const SUN = "2026-11-22";
const person = (id: string, answers: Answers, must = false): Person => ({ id, name: id, must, proxy: false, answers, at: 0 });
const free = (...slots: string[]): Answers => Object.fromEntries(slots.map((s) => [s, 2]));

test("eight people, counted by hand", () => {
  // Saturday evening: seven free and May could move things. Sunday afternoon: seven free, nobody
  // else. Saturday afternoon: five free, two could move things. Sunday evening: three free.
  const people = [
    person("安", free(`${SAT}:eve`, `${SUN}:pm`, `${SAT}:pm`)),
    person("白", free(`${SAT}:eve`, `${SUN}:pm`, `${SAT}:pm`, `${SUN}:eve`)),
    person("陈", free(`${SAT}:eve`, `${SUN}:pm`, `${SAT}:pm`)),
    person("丁", free(`${SAT}:eve`, `${SUN}:pm`, `${SAT}:pm`, `${SUN}:eve`)),
    person("方", free(`${SAT}:eve`, `${SUN}:pm`, `${SAT}:pm`)),
    person("高", { ...free(`${SAT}:eve`, `${SUN}:pm`, `${SUN}:eve`), [`${SAT}:pm`]: 1 }),
    person("何", { ...free(`${SAT}:eve`, `${SUN}:pm`), [`${SAT}:pm`]: 1 }),
    person("阿May", { [`${SAT}:eve`]: 1 }),
  ];
  const all = tally({ days: [SAT, SUN], grain: "half", people, minPeople: 1 });
  assert.equal(all.length, 6);
  const top = best(all);
  assert.deepEqual(top.map((t) => t.slot), [`${SAT}:eve`, `${SUN}:pm`, `${SAT}:pm`]);
  assert.deepEqual([top[0].yes.length, top[0].maybe.length, top[0].no.length], [7, 1, 0]);
  assert.deepEqual([top[1].yes.length, top[1].maybe.length, top[1].no.length], [7, 0, 1]);
  assert.deepEqual([top[2].yes.length, top[2].maybe.length], [5, 2]);
  assert.equal(reason(top[0], people, "zh"), "8 个人里 7 个有空，阿May 可以调");
  assert.equal(reason(top[0], people, "en"), "7 of 8 free, 阿May could move things");
  assert.equal(reason(top[1], people, "zh"), "8 个人里 7 个有空");
});

test("the same count: the earlier slot comes first; a slot nobody can make is never offered", () => {
  const people = [person("a", free(`${SUN}:am`, `${SAT}:eve`)), person("b", free(`${SUN}:am`, `${SAT}:eve`))];
  const top = best(tally({ days: [SAT, SUN], grain: "half", people, minPeople: 1 }));
  assert.deepEqual(top.map((t) => t.slot), [`${SAT}:eve`, `${SUN}:am`], "two slots only: the other four have nobody");
  assert.deepEqual(best(tally({ days: [SAT], grain: "half", people: [], minPeople: 1 })), []);
});

test("someone who must be there: a slot they can't make is out, however many others can", () => {
  const people = [
    person("寿星", { [`${SUN}:pm`]: 2, [`${SAT}:pm`]: 1 }, true),
    person("b", free(`${SAT}:eve`, `${SUN}:pm`, `${SAT}:pm`)),
    person("c", free(`${SAT}:eve`, `${SAT}:pm`)),
    person("d", free(`${SAT}:eve`, `${SAT}:pm`)),
  ];
  const all = tally({ days: [SAT, SUN], grain: "half", people, minPeople: 1 });
  assert.equal(all.find((t) => t.slot === `${SAT}:eve`)!.out, "must", "three free, but not the one who must be there");
  // Saturday afternoon has three free plus the birthday person as a maybe; Sunday afternoon two free
  assert.deepEqual(best(all).map((t) => t.slot), [`${SAT}:pm`, `${SUN}:pm`]);
  // until that person answers, nothing can be offered
  const waiting = [person("寿星", {}, true), person("b", free(`${SAT}:eve`))];
  assert.deepEqual(best(tally({ days: [SAT], grain: "half", people: waiting, minPeople: 1 })), []);
});

test("the least number of people: free and could-move-things both count", () => {
  const people = [person("a", free(`${SAT}:eve`, `${SUN}:pm`)), person("b", { [`${SAT}:eve`]: 1 }), person("c", free(`${SUN}:am`))];
  const all = tally({ days: [SAT, SUN], grain: "half", people, minPeople: 2 });
  assert.equal(all.find((t) => t.slot === `${SAT}:eve`)!.out, null, "one free and one maybe make two");
  assert.equal(all.find((t) => t.slot === `${SUN}:pm`)!.out, "few");
  assert.deepEqual(best(all).map((t) => t.slot), [`${SAT}:eve`]);
});

test("by the day", () => {
  const people = [person("a", free(`${SAT}:day`)), person("b", free(`${SAT}:day`, `${SUN}:day`))];
  const top = best(tally({ days: [SAT, SUN], grain: "day", people, minPeople: 1 }));
  assert.deepEqual(top.map((t) => [t.day, t.part, t.yes.length]), [[SAT, "day", 2], [SUN, "day", 1]]);
});

test("many maybes are counted, not listed", () => {
  const people = ["a", "b", "c", "d"].map((id) => person(id, { [`${SAT}:eve`]: 1 }));
  const [t] = tally({ days: [SAT], grain: "half", people, minPeople: 1 }).filter((x) => x.slot === `${SAT}:eve`);
  assert.equal(reason(t, people, "zh"), "4 个人里 0 个有空，4 个可以调");
  assert.equal(reason(t, people, "en"), "0 of 4 free, 4 could move things");
});
