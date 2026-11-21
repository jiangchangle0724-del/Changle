// 几点开始, the second of two steps (A4, 2026-11-20): once the time is set, the host asks what time
// to start, everyone says which times suit them, and the host sets one.
import assert from "node:assert/strict";
import test from "node:test";
import { cleanStarts, leadingStart, startChoices, startTally, startWindow, toIcs, whenLabel } from "../src/engine";
import { EventRoom, memoryStore } from "../src/room/event";

const NOW = Date.UTC(2026, 10, 21, 3, 0); // 20 November, 8 p.m. in Vancouver
const SAT = "2026-11-21";
const EVE = `${SAT}:eve`;

function make() {
  const room = new EventRoom(memoryStore());
  room.create({ code: "abcdefgh", title: "周末火锅", days: [SAT], grain: "periods", hostHash: "host", adminHash: "a", adminSalt: "s", now: NOW, today: "2026-11-20" });
  let n = 0;
  const newId = () => `p${++n}`;
  room.saveMine({ keyHash: "host", newId, name: "Steve", answers: { [EVE]: 2 }, now: NOW }); // p1
  room.saveMine({ keyHash: "may", newId, name: "阿May", answers: { [EVE]: 2 }, now: NOW }); // p2
  return room;
}
const starts = (room: EventRoom) => room.state()!.starts;
const votes = (room: EventRoom) => room.state()!.people.map((p) => p.starts ?? []);

test("when it can start: within the time set to the minute, else its period, half an hour before it ends", () => {
  const settled = { day: SAT, part: "eve" as const, at: NOW };
  assert.deepEqual(startWindow("periods", settled), [1080, 1409]);
  assert.deepEqual(startWindow("periods", { ...settled, from: 1140, to: 1320 }), [1140, 1290]);
  assert.deepEqual(startWindow("periods", { ...settled, from: 1110 }), [1080, 1409], "a start set before doesn't narrow it");
  assert.equal(startWindow("half", settled), null, "a gathering by the half day has no minutes");
  assert.equal(startWindow("periods", null), null);
  assert.deepEqual(startChoices([1080, 1409]), [1080, 1110, 1140, 1170, 1200, 1230, 1260, 1290, 1320, 1350, 1380]);
  assert.deepEqual(startChoices([1145, 1290]), [1170, 1200, 1230, 1260, 1290], "from the first half hour in it");
});

test("the times as kept: 2 to 5, on the quarter hour, within the window, in order", () => {
  const w: [number, number] = [1080, 1409];
  assert.deepEqual(cleanStarts([1140, 1080, 1110, 1080], w), [1080, 1110, 1140]);
  assert.deepEqual(cleanStarts([], w), [], "none: stop asking");
  assert.equal(cleanStarts([1080], w), null, "one is no question");
  assert.equal(cleanStarts([1080, 1110, 1140, 1170, 1200, 1230], w), null, "six are too many");
  assert.equal(cleanStarts([1080, 1100], w), null, "on the quarter hour");
  assert.equal(cleanStarts([1080, 1410], w), null, "half an hour before the end at the latest");
  assert.equal(cleanStarts([1080, 1110], null), null, "nothing set, or no minutes");
  assert.equal(cleanStarts("18:00", w), null);
});

test("who each time suits, and the one most people tapped (the earliest of equals)", () => {
  const people = [{ id: "a", starts: [1110, 1140] }, { id: "b", starts: [1140] }, { id: "c", starts: [1110] }, { id: "d" }];
  const tally = startTally([1080, 1110, 1140], people);
  assert.deepEqual(tally, [
    { at: 1080, ids: [] },
    { at: 1110, ids: ["a", "c"] },
    { at: 1140, ids: ["a", "b"] },
  ]);
  assert.equal(leadingStart(tally), 1110);
  assert.equal(leadingStart(startTally([1080, 1110], [{ id: "d" }])), null, "nobody has said");
});

test("the host asks, people say, the host sets it: the start goes into the set time, and the asking stops", () => {
  const room = make();
  assert.deepEqual(room.hostAct("host", { do: "starts", times: [1080, 1110] }, NOW), { ok: false, error: "bad" }, "nothing set yet");
  room.hostAct("host", { do: "settle", slot: EVE }, NOW);
  assert.deepEqual(room.hostAct("may", { do: "starts", times: [1080, 1110] }, NOW), { ok: false, error: "forbidden" }, "only a host asks");
  assert.deepEqual(room.vote("may", [1110]), { ok: false, error: "bad" }, "nothing asked yet");
  assert.deepEqual(room.hostAct("host", { do: "starts", times: [1140, 1080, 1110] }, NOW), { ok: true });
  assert.deepEqual(starts(room), [1080, 1110, 1140]);

  assert.deepEqual(room.vote("may", [1110, 1140, 1200]), { ok: true }, "a time not asked about is left out");
  assert.deepEqual(room.vote("host", [1110]), { ok: true });
  assert.deepEqual(room.vote("stranger", [1110]), { ok: false, error: "name" }, "it takes a name");
  assert.deepEqual(votes(room), [[1110], [1110, 1140]]);

  // asked again with other times: a vote for a time still asked about stands
  room.hostAct("host", { do: "starts", times: [1110, 1170] }, NOW);
  assert.deepEqual(votes(room), [[1110], [1110]]);

  assert.deepEqual(room.hostAct("host", { do: "start", at: 1100 }, NOW), { ok: false, error: "bad" }, "on the quarter hour");
  assert.deepEqual(room.hostAct("host", { do: "start", at: 1110 }, NOW), { ok: true });
  const set = room.state()!.settled!;
  assert.deepEqual([set.from, set.to], [1110, undefined], "the whole evening, starting at 18:30");
  assert.deepEqual(starts(room), [], "no more asking");
  assert.deepEqual(votes(room), [[], []]);
  assert.equal(whenLabel(SAT, "eve", "zh", set.from, set.to), "11月21日 周六 晚上 18:30 开始");
  assert.equal(whenLabel(SAT, "eve", "en", set.from, set.to), "Sat, Nov 21, from 18:30");
});

test("within a time set to the minute the start moves and the end stays; setting the time again stops the asking", () => {
  const room = make();
  room.hostAct("host", { do: "settle", slot: EVE, from: 1140, to: 1320 }, NOW);
  assert.deepEqual(room.hostAct("host", { do: "starts", times: [1080, 1140] }, NOW), { ok: false, error: "bad" }, "before 19:00 it isn't set");
  room.hostAct("host", { do: "starts", times: [1140, 1170] }, NOW);
  room.vote("may", [1170]);
  assert.deepEqual(room.hostAct("host", { do: "start", at: 1170 }, NOW), { ok: true });
  assert.deepEqual([room.state()!.settled!.from, room.state()!.settled!.to], [1170, 1320]);

  room.hostAct("host", { do: "starts", times: [1170, 1200] }, NOW);
  room.vote("may", [1200]);
  room.hostAct("host", { do: "reopen" }, NOW);
  assert.deepEqual([starts(room), votes(room)], [[], [[], []]], "reopened: nothing asked");
  room.hostAct("host", { do: "settle", slot: EVE }, NOW);
  room.hostAct("host", { do: "starts", times: [1080, 1110] }, NOW);
  room.hostAct("host", { do: "settle", slot: EVE, from: 1140, to: 1320 }, NOW);
  assert.deepEqual(starts(room), [], "set again: asked afresh, if at all");
});

test("the calendar file of a set start: from then to the period's usual end, two hours at least", () => {
  const ics = (from: number) => toIcs({ code: "abcdefgh", title: "火锅", day: SAT, part: "eve", setAt: NOW, from });
  // 18:30 to 22:00 in Vancouver (UTC-7)
  assert.match(ics(1110), /DTSTART:20261122T013000Z[\s\S]*DTEND:20261122T050000Z/);
  // 21:30: two hours, to 23:30
  assert.match(ics(1290), /DTSTART:20261122T043000Z[\s\S]*DTEND:20261122T063000Z/);
});
