// 谁在看 (A3 item 6, 2026-11-18): who else has the page open, the line at the top that says so, and
// who of the others has just filled in.
import assert from "node:assert/strict";
import test from "node:test";
import { AGAIN_MS, Finished, QUIET_MS as DONE_AFTER, type Clock, type Finish } from "../src/client/finished";
import { hereLine } from "../src/engine/here";
import type { Here, Person } from "../src/engine/types";
import { EventRoom, memoryStore, QUIET_MS } from "../src/room/event";

const NOW = Date.UTC(2026, 10, 19, 3, 0); // 18 November, 8 p.m. in Vancouver
const TODAY = "2026-11-18";
const SAT = "2026-11-21";
const EVE = `${SAT}:eve`;

function make() {
  const room = new EventRoom(memoryStore());
  room.create({ code: "abcdefgh", title: "周末火锅", days: [SAT], grain: "periods", hostHash: "host", adminHash: "a", adminSalt: "s", now: NOW, today: TODAY });
  let n = 0;
  const newId = () => `p${++n}`;
  return { room, newId };
}
const seen = (key: string, ago = 0) => ({ key, seen: NOW - ago });

test("who is watching: everyone else heard from lately, once each, rows in the order people joined", () => {
  const { room, newId } = make();
  room.saveMine({ keyHash: "key-may", newId, name: "阿May", answers: {}, now: NOW }); // p1
  room.saveMine({ keyHash: "key-wang", newId, name: "小王", answers: { [EVE]: 2 }, now: NOW }); // p2
  room.hostAct("host", { do: "proxy", name: "妈妈", answers: { [EVE]: 2 } }, NOW, newId); // p3, no phone's
  const watching = [seen("key-wang"), seen("key-may", 10_000), seen("key-may"), seen("key-new"), seen("key-gone", QUIET_MS + 1), seen("me")];
  assert.deepEqual(room.here(watching, "me", NOW), { at: NOW, ids: ["p1", "p2"], others: 1, host: false }, "the page twice counts once; one quiet too long is gone; the asker isn't told about itself");
  assert.deepEqual(room.here(watching, "key-may", NOW), { at: NOW, ids: ["p2"], others: 2, host: false }, "asked by 阿May's phone: she is left out, and the two phones without a row are counted");
  assert.deepEqual(room.here([seen("key-may", QUIET_MS)], null, NOW).ids, ["p1"], "heard from exactly that long ago still counts");
  assert.deepEqual(room.here([], null, NOW), { at: NOW, ids: [], others: 0, host: false });
});

test("a host's phone without a row is said to be the host's; one with a row goes by it", () => {
  const { room, newId } = make();
  assert.deepEqual(room.here([seen("host"), seen("key-x")], "key-may", NOW), { at: NOW, ids: [], others: 1, host: true });
  room.saveMine({ keyHash: "host", newId, name: "Steve", answers: {}, now: NOW });
  assert.deepEqual(room.here([seen("host"), seen("key-x")], "key-may", NOW), { at: NOW, ids: ["p1"], others: 1, host: false });
  // a second host's phone, made a host with the admin code, without a row
  room.claim({ adminHash: "a", keyHash: "host-2", now: NOW });
  assert.deepEqual(room.here([seen("host"), seen("host-2")], null, NOW), { at: NOW, ids: ["p1"], others: 0, host: true });
});

const people: Person[] = [
  { id: "p1", name: "阿May", must: false, proxy: false, answers: {}, at: NOW },
  { id: "p2", name: "小王", must: false, proxy: false, answers: {}, at: NOW },
  { id: "p3", name: "老李", must: false, proxy: false, answers: {}, at: NOW },
  { id: "p4", name: "Jason", must: false, proxy: false, answers: {}, at: NOW },
];
const here = (ids: string[], others = 0, host = false): Here => ({ at: NOW, ids, others, host });

test("the line at the top, in Chinese", () => {
  const line = (h: Here) => hereLine(h, people, "zh");
  assert.equal(line(here([])), "现在只有你在看");
  assert.equal(line(here([], 1)), "还有 1 个人在看");
  assert.equal(line(here(["p1"])), "阿May 也在看");
  assert.equal(line(here(["p1", "p2"])), "阿May、小王 也在看");
  assert.equal(line(here(["p1", "p2"], 2)), "阿May、小王 和另外 2 个人也在看");
  assert.equal(line(here([], 0, true)), "发起人也在看");
  assert.equal(line(here([], 1, true)), "发起人和另外 1 个人也在看");
  assert.equal(line(here(["p1"], 0, true)), "发起人、阿May 也在看");
  assert.equal(line(here(["p1", "p2", "p3", "p4"], 1)), "阿May、小王、老李 等 5 个人也在看");
  assert.equal(line(here(["p1", "gone"])), "阿May 和另外 1 个人也在看", "a row the page doesn't have yet is counted");
});

test("the line at the top, in English", () => {
  const line = (h: Here) => hereLine(h, people, "en");
  assert.equal(line(here([])), "Just you here right now");
  assert.equal(line(here([], 1)), "1 other person is here");
  assert.equal(line(here([], 3)), "3 other people are here");
  assert.equal(line(here(["p4"])), "Jason is here too");
  assert.equal(line(here(["p1", "p4"])), "阿May and Jason are here too");
  assert.equal(line(here(["p1", "p2", "p4"])), "阿May, 小王 and Jason are here too");
  assert.equal(line(here(["p4"], 1)), "Jason and 1 other are here too");
  assert.equal(line(here([], 0, true)), "The host is here too");
  assert.equal(line(here(["p4"], 2, true)), "The host, Jason and 2 others are here too");
  assert.equal(line(here(["p1", "p2", "p3", "p4"])), "阿May, 小王, 老李 and 1 other are here too");
});

/** A clock the test moves by hand. */
function fakeClock(): Clock & { tick(ms: number): void } {
  let now = NOW;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let ids = 0;
  return {
    now: () => now,
    after: (ms, run) => (timers.push({ at: now + ms, run, id: ++ids }), ids),
    cancel: (id) => void (timers = timers.filter((x) => x.id !== id)),
    tick(ms) {
      const until = now + ms;
      for (let next = timers.sort((a, b) => a.at - b.at)[0]; next && next.at <= until; next = timers.sort((a, b) => a.at - b.at)[0]) {
        timers = timers.filter((x) => x !== next);
        now = next.at;
        next.run();
      }
      now = until;
    },
  };
}
const row = (id: string, name: string, answers: Person["answers"], times?: Person["times"]): Person => ({ id, name, must: false, proxy: false, answers, times, at: NOW });

test("someone else is done once their answers have stayed put a moment; said once, then again only much later", () => {
  const clock = fakeClock();
  const said: Finish[] = [];
  const done = new Finished((f) => said.push(f), clock);
  done.look([row("p1", "阿May", { [EVE]: 2 })], ["me"]);
  // the first look says nothing: those answers were there before the page was opened
  clock.tick(DONE_AFTER * 2);
  assert.deepEqual(said, []);

  // a newcomer names herself (no answers yet), then taps twice in a row
  done.look([row("p1", "阿May", { [EVE]: 2 }), row("p2", "小王", {})], ["me"]);
  clock.tick(1000);
  done.look([row("p1", "阿May", { [EVE]: 2 }), row("p2", "小王", { [EVE]: 2 })], ["me"]);
  clock.tick(DONE_AFTER - 1);
  assert.deepEqual(said, [], "still tapping, as far as anyone can tell");
  done.look([row("p1", "阿May", { [EVE]: 1 }), row("p2", "小王", { [EVE]: 1 })], ["me"]);
  clock.tick(DONE_AFTER);
  assert.deepEqual(said, [
    { id: "p1", name: "阿May", first: false },
    { id: "p2", name: "小王", first: true },
  ]);

  // the same again soon after: still the same filling in
  done.look([row("p1", "阿May", {}), row("p2", "小王", { [EVE]: 2 })], ["me"]);
  clock.tick(DONE_AFTER);
  assert.equal(said.length, 2);
  // much later, a change of time (to the minute) is said again
  clock.tick(AGAIN_MS);
  done.look([row("p1", "阿May", {}), row("p2", "小王", { [EVE]: 2 }, { [EVE]: [1170, 1290] })], ["me"]);
  clock.tick(DONE_AFTER);
  assert.deepEqual(said[2], { id: "p2", name: "小王", first: false });
  assert.equal(said.length, 3, "阿May took everything back: nothing to say about her");
});

test("this phone's own row, and one it fills in for someone, are never said to be done", () => {
  const clock = fakeClock();
  const said: Finish[] = [];
  const done = new Finished((f) => said.push(f), clock);
  done.look([row("me", "Steve", {}), row("mum", "妈妈", {})], ["me", "mum"]);
  done.look([row("me", "Steve", { [EVE]: 2 }), row("mum", "妈妈", { [EVE]: 2 })], ["me", "mum"]);
  clock.tick(DONE_AFTER * 2);
  assert.deepEqual(said, []);
  // the same answers in another order are the same answers
  done.look([row("me", "Steve", { [EVE]: 2 }), row("mum", "妈妈", { [EVE]: 2, [`${SAT}:noon`]: 1 })], []);
  done.look([row("me", "Steve", { [EVE]: 2 }), row("mum", "妈妈", { [`${SAT}:noon`]: 1, [EVE]: 2 })], []);
  clock.tick(DONE_AFTER);
  assert.deepEqual(said, [{ id: "mum", name: "妈妈", first: false }]);
  done.stop();
});
