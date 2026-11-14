// Times within a period, to the minute (src/engine/minutes.ts), and what they change: the best
// three, the time that gets set, the calendar file, the words and the meal time.
// Run with `npx tsx --test tests/minutes.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { atTime, best, cleanTimes, counted, eatLink, mealLabel, mealTime, meet, MIN_SPAN, reason, resultText, spanLabel, tally, toIcs, whenLabel } from "../src/engine";
import { entriesOf } from "../src/engine/minutes";
import type { Answers, Person, Times } from "../src/engine";
import { EventRoom, memoryStore } from "../src/room/event";

const SAT = "2026-11-21";
const EVE = `${SAT}:eve`;
const EVENING: [number, number] = [1080, 1439];
const at = (h: number, m = 0) => h * 60 + m;
const person = (id: string, answers: Answers, times?: Times): Person => ({ id, name: id, must: false, proxy: false, answers, times, at: 0 });

test("the words for a time", () => {
  assert.equal(spanLabel([at(19, 30), at(22)]), "19:30–22:00");
  assert.equal(spanLabel(EVENING), "18:00–23:59");
  assert.equal(whenLabel(SAT, "eve", "zh", at(19, 30), at(22)), "11月21日 周六 晚上 19:30–22:00");
  assert.equal(whenLabel(SAT, "eve", "en", at(19, 30), at(22)), "Sat, Nov 21, 19:30–22:00");
  assert.equal(whenLabel(SAT, "eve", "zh"), "11月21日 周六 晚上", "no minutes: the slot as always");
});

test("a phone's times are checked: its own answered slots, inside the period, half an hour or more", () => {
  const answers: Answers = { [EVE]: 2, [`${SAT}:noon`]: 1 };
  assert.deepEqual(cleanTimes({ [EVE]: [at(19, 30), at(22)] }, answers, "periods"), { [EVE]: [at(19, 30), at(22)] });
  assert.deepEqual(cleanTimes({ [`${SAT}:noon`]: [at(11, 7), at(13, 59)] }, answers, "periods"), { [`${SAT}:noon`]: [at(11, 7), at(13, 59)] }, "to the minute");
  const bad = [
    [at(17, 30), at(20)], // starts before the evening
    [at(19), at(24)], // past 23:59
    [at(19), at(19, 29)], // under half an hour
    [at(20), at(19)],
    [at(19, 0.5), at(21)], // not a whole minute
    [at(19)],
    "19:00-21:00",
  ];
  for (const span of bad) assert.deepEqual(cleanTimes({ [EVE]: span }, answers, "periods"), {}, JSON.stringify(span));
  assert.deepEqual(cleanTimes({ [EVE]: [...EVENING] }, answers, "periods"), {}, "the whole period is what no time means");
  assert.deepEqual(cleanTimes({ [`${SAT}:morning`]: [at(7), at(9)] }, answers, "periods"), {}, "a slot they didn't answer");
  assert.deepEqual(cleanTimes({ constructor: [at(7), at(9)] }, answers, "periods"), {});
  assert.deepEqual(cleanTimes({ [EVE]: [at(19), at(21)] }, answers, "half"), {}, "only by the period");
  assert.deepEqual(cleanTimes(null, answers, "periods"), {});
  assert.equal(MIN_SPAN, 30);
});

test("the best stretch of an evening: who suits it, and for how long", () => {
  const free = (id: string, from: number, to: number, answer: 1 | 2 = 2) => person(id, { [EVE]: answer }, from === EVENING[0] && to === EVENING[1] ? undefined : { [EVE]: [from, to] });
  const best1 = (people: Person[]) => meet(EVENING, entriesOf(people, EVE, EVENING));
  // nobody gave a time: everyone, the whole evening
  assert.deepEqual(best1([free("a", ...EVENING), free("b", ...EVENING)]), { yes: ["a", "b"], maybe: [], from: 1080, to: 1439 });
  // the time is as long as everyone free has
  assert.deepEqual(best1([free("a", at(19, 30), at(23)), free("b", at(18), at(22)), free("c", ...EVENING)]), { yes: ["a", "b", "c"], maybe: [], from: at(19, 30), to: at(22) });
  // free before seven, free after eight: they don't meet; the longer of the two times wins
  assert.deepEqual(best1([free("a", at(18), at(19)), free("b", at(20), at(23))]), { yes: ["b"], maybe: [], from: at(20), to: at(23) });
  // three overlap for a quarter of an hour, two for three hours: a quarter of an hour isn't a meeting
  assert.deepEqual(best1([free("a", at(18), at(20)), free("b", at(19, 30), at(23)), free("c", at(19, 45), at(23))]), { yes: ["b", "c"], maybe: [], from: at(19, 45), to: at(23) });
  // half an hour is: then three beat two
  assert.deepEqual(best1([free("a", at(18), at(20, 15)), free("b", at(19, 30), at(23)), free("c", at(19, 45), at(23))]), { yes: ["a", "b", "c"], maybe: [], from: at(19, 45), to: at(20, 15) });
  // someone who could move things doesn't narrow the free people's time; they count when they
  // could make all of it, as a set time counts them
  assert.deepEqual(best1([free("a", at(19), at(23)), free("m", at(20), at(21), 1)]), { yes: ["a"], maybe: [], from: at(19), to: at(23) });
  assert.deepEqual(best1([free("a", at(19), at(23)), free("m", at(18, 30), at(23, 30), 1)]), { yes: ["a"], maybe: ["m"], from: at(19), to: at(23) });
  // only could-move-things: their time
  assert.deepEqual(best1([free("m", at(20), at(21), 1)]), { yes: [], maybe: ["m"], from: at(20), to: at(21) });
  assert.equal(best1([]), null);
});

test("the best three go by the best stretch; the grid still counts everyone who answered", () => {
  const people = [
    person("a", { [EVE]: 2, [`${SAT}:noon`]: 2 }, { [EVE]: [at(18), at(19)] }),
    person("b", { [EVE]: 2, [`${SAT}:noon`]: 2 }, { [EVE]: [at(21), at(23)] }),
    person("c", { [`${SAT}:noon`]: 1 }),
  ];
  const all = tally({ days: [SAT], grain: "periods", people, minPeople: 1 });
  const evening = all.find((t) => t.slot === EVE)!;
  assert.deepEqual([evening.yes, evening.meet], [["a", "b"], { yes: ["b"], maybe: [], from: at(21), to: at(23) }]);
  // nobody gave noon a time: its best stretch is all of it, so it counts as it always has
  assert.equal(all.find((t) => t.part === "noon")!.meet, null);
  const top = best(all);
  assert.deepEqual(
    top.map((t) => [t.part, counted(t).yes.length, counted(t).maybe.length]),
    [
      ["noon", 2, 1],
      ["eve", 1, 0],
    ],
  );
  assert.equal(reason(top[1], people, "zh"), "3 个人里 1 个有空");
  // someone who must be there: the stretch is one they can make, the best of those
  const evening2 = (people: Person[], minPeople = 1) => tally({ days: [SAT], grain: "periods", people, minPeople }).find((t) => t.slot === EVE)!;
  const aMust = people.map((p) => (p.id === "a" ? { ...p, must: true } : p));
  assert.deepEqual([evening2(aMust).out, evening2(aMust).meet], [null, { yes: ["a"], maybe: [], from: at(18), to: at(19) }]);
  assert.equal(evening2(aMust, 2).out, "few", "a alone isn't two");
  // two who must be there with no half hour in common: out
  const bothMust = people.map((p) => (p.id === "c" ? p : { ...p, must: true }));
  assert.equal(evening2(bothMust).out, "must");
  // someone who must be there and could only move things still bounds the time
  const group = [person("a", { [EVE]: 2 }), person("b", { [EVE]: 2 }, { [EVE]: [at(19), at(23)] }), { ...person("m", { [EVE]: 1 }, { [EVE]: [at(20), at(21, 30)] }), must: true }];
  assert.deepEqual(evening2(group).meet, { yes: ["a", "b"], maybe: ["m"], from: at(20), to: at(21, 30) });
  // must-be-there who didn't answer: out, as always
  assert.equal(evening2([...group.slice(0, 2), { ...person("x", {}), must: true }]).out, "must");
});

test("a set time counts who is free for all of it", () => {
  const people = [person("a", { [EVE]: 2 }, { [EVE]: [at(19), at(23)] }), person("b", { [EVE]: 2 }), person("m", { [EVE]: 1 }, { [EVE]: [at(18), at(20)] })];
  const evening = tally({ days: [SAT], grain: "periods", people, minPeople: 1 }).find((t) => t.slot === EVE)!;
  const late = atTime(evening, people, "periods", at(19, 30), at(22));
  assert.deepEqual(late.meet, { yes: ["a", "b"], maybe: [], from: at(19, 30), to: at(22) });
  assert.equal(reason(late, people, "zh"), "3 个人里 2 个有空");
  const early = atTime(evening, people, "periods", at(18), at(19, 30));
  assert.deepEqual([early.meet!.yes, early.meet!.maybe], [["b"], ["m"]], "a starts at 19:00, too late for 18:00");
  // no minutes, or the whole evening: everyone who answered it
  assert.deepEqual(atTime(evening, people, "periods"), { ...evening, meet: null });
  assert.deepEqual(atTime(evening, people, "periods", ...EVENING), { ...evening, meet: null });
  assert.equal(reason(atTime(evening, people, "periods"), people, "zh"), "3 个人里 2 个有空，m 可以调");
  // not by the period: the slot as it is
  const half = tally({ days: [SAT], grain: "half", people, minPeople: 1 }).find((t) => t.slot === EVE)!;
  assert.equal(atTime(half, people, "half", at(19), at(21)), half);
});

test("the room keeps someone's times with their answers, and the minutes of a set time", () => {
  const store = memoryStore();
  const room = new EventRoom(store);
  const now = Date.UTC(2026, 10, 14, 9);
  room.create({ code: "abcdefgh", title: "周末火锅", days: [SAT], grain: "periods", hostHash: "host", adminHash: "a", adminSalt: "s", now, today: "2026-11-14" });
  let n = 0;
  const save = (key: string, answers: unknown, times: unknown) => room.saveMine({ keyHash: key, newId: () => `p${++n}`, name: key, answers, times, now });
  save("host", { [EVE]: 2, [`${SAT}:noon`]: 2 }, { [EVE]: [at(19, 30), at(22)], [`${SAT}:noon`]: [660, 840], [`${SAT}:dawn`]: [0, 60] });
  assert.deepEqual(room.state()!.people[0].times, { [EVE]: [at(19, 30), at(22)] }, "the whole of noon and an unanswered slot are dropped");
  save("host", { [EVE]: 2 }, {});
  assert.equal("times" in room.state()!.people[0], false, "no times, no field");
  // settling: the minutes given; none given, or all of it, is the slot itself
  assert.deepEqual(room.hostAct("host", { do: "settle", slot: EVE, from: at(19, 30), to: at(22) }, now), { ok: true });
  assert.deepEqual(room.state()!.settled, { day: SAT, part: "eve", at: now, from: at(19, 30), to: at(22) });
  room.hostAct("host", { do: "settle", slot: `${SAT}:noon` }, now);
  assert.deepEqual(room.state()!.settled, { day: SAT, part: "noon", at: now });
  room.hostAct("host", { do: "settle", slot: EVE, from: EVENING[0], to: EVENING[1] }, now);
  assert.deepEqual(room.state()!.settled, { day: SAT, part: "eve", at: now });
  for (const [from, to] of [
    [at(17), at(19)],
    [at(19), at(19, 20)],
    ["19:00", at(21)],
    [at(19), at(24)],
    [at(19), undefined],
  ])
    assert.deepEqual(room.hostAct("host", { do: "settle", slot: EVE, from, to }, now), { ok: false, error: "bad" }, `${from}–${to}`);
  // a gathering by the half day sets no minutes
  const half = new EventRoom(memoryStore());
  half.create({ code: "abcdefgh", title: "x", days: [SAT], grain: "half", hostHash: "host", adminHash: "a", adminSalt: "s", now, today: "2026-11-14" });
  half.hostAct("host", { do: "settle", slot: EVE, from: at(19), to: at(21) }, now);
  assert.deepEqual(half.state()!.settled, { day: SAT, part: "eve", at: now });
});

test("the calendar, the words for the group and the meal start at the minutes that were set", () => {
  const ics = toIcs({ code: "abcdefgh", title: "周末火锅", day: SAT, part: "eve", setAt: 0, from: at(19, 30), to: at(22) });
  // Vancouver is seven hours behind UTC all year
  assert.match(ics, /DTSTART:20261122T023000Z\r\nDTEND:20261122T050000Z\r\n/);
  assert.match(toIcs({ code: "abcdefgh", title: "x", day: SAT, part: "eve", setAt: 0, from: 1080, to: 1439 }), /DTSTART:20261122T010000Z\r\nDTEND:20261122T065900Z\r\n/);
  const people = [person("a", { [EVE]: 2 })];
  const t = atTime(tally({ days: [SAT], grain: "periods", people, minPeople: 1 })[4], people, "periods", at(19, 30), at(22));
  assert.equal(
    resultText({ title: "周末火锅", day: SAT, part: "eve", from: at(19, 30), to: at(22), tally: t, people, url: "u" }, "zh"),
    "「周末火锅」定了：11月21日 周六 晚上 19:30–22:00。1 个人里 1 个有空。\nu",
  );
  assert.equal(mealTime("eve", at(19, 30)), "19:30");
  assert.equal(mealTime("dawn", at(1, 5)), "01:05");
  assert.equal(mealLabel("eve", "en", at(19, 30)), "7:30 p.m.");
  assert.match(eatLink({ code: "abcdefgh", day: SAT, part: "eve", from: at(19, 30), coming: 3 }), /&time=19%3A30&/);
  assert.match(eatLink({ code: "abcdefgh", day: SAT, part: "eve", coming: 3 }), /&time=18%3A30&/, "no minutes: dinner at 18:30");
});
