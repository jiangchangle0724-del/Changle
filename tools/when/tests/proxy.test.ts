// A host filling in for someone (代填, A3 item 5, 2026-11-14): for parents, or a friend without
// WeChat. The row is marked, no phone holds its key, and a host changes no other row.
import assert from "node:assert/strict";
import test from "node:test";
import { EventRoom, MAX_PEOPLE, memoryStore } from "../src/room/event";

const NOW = Date.UTC(2026, 10, 13, 2, 0); // 12 November, 7 p.m. in Vancouver
const TODAY = "2026-11-12";
const SAT = "2026-11-21";
const EVE = `${SAT}:eve`;

function make() {
  const store = memoryStore();
  const room = new EventRoom(store);
  room.create({ code: "abcdefgh", title: "周末火锅", days: [SAT], grain: "periods", hostHash: "host", adminHash: "a", adminSalt: "s", now: NOW, today: TODAY });
  let n = 0;
  const newId = () => `p${++n}`;
  return { store, room, newId };
}

test("a host fills in for someone: a marked row, then changed again, times and all", () => {
  const { room, store, newId } = make();
  const made = room.hostAct("host", { do: "proxy", name: " 妈妈 ", answers: { [EVE]: 2, "2026-11-30:eve": 2 } }, NOW, newId);
  assert.deepEqual(made, { ok: true, id: "p1" });
  let mum = room.state()!.people[0];
  assert.deepEqual([mum.name, mum.proxy, mum.must, mum.answers], ["妈妈", true, false, { [EVE]: 2 }], "a slot not asked about is dropped");
  assert.equal(store.rows.get("p1")!.keyHash, "", "no phone holds its key");
  // changed again: the same row, its time to the minute kept like anyone's
  assert.deepEqual(room.hostAct("host", { do: "proxy", id: "p1", name: "妈妈", answers: { [EVE]: 1 }, times: { [EVE]: [19 * 60, 21 * 60] } }, NOW + 1, newId), { ok: true, id: "p1" });
  mum = room.state()!.people[0];
  assert.deepEqual([mum.answers, mum.times], [{ [EVE]: 1 }, { [EVE]: [1140, 1260] }]);
  assert.deepEqual(room.hostAct("host", { do: "proxy", id: "p1", name: "老妈", answers: {} }, NOW + 2, newId), { ok: true, id: "p1" });
  mum = room.state()!.people[0];
  assert.deepEqual([mum.name, mum.answers, mum.times], ["老妈", {}, undefined]);
  assert.equal(room.state()!.people.length, 1);
  // and removed like any row
  assert.deepEqual(room.hostAct("host", { do: "remove", id: "p1" }, NOW, newId), { ok: true });
  assert.deepEqual(room.state()!.people, []);
});

test("only a host fills in for someone, and never over a row someone filled in themselves", () => {
  const { room, newId } = make();
  const self = room.saveMine({ keyHash: "key-may", newId, name: "阿May", answers: { [EVE]: 2 }, now: NOW });
  assert.deepEqual(self, { ok: true, id: "p1", fresh: true });
  assert.deepEqual(room.hostAct("key-may", { do: "proxy", name: "妈妈", answers: {} }, NOW, newId), { ok: false, error: "forbidden" });
  assert.deepEqual(room.hostAct("host", { do: "proxy", id: "p1", name: "阿May", answers: {} }, NOW, newId), { ok: false, error: "forbidden" });
  assert.deepEqual(room.state()!.people[0].answers, { [EVE]: 2 }, "her own answers stay hers");
  assert.deepEqual(room.hostAct("host", { do: "proxy", id: "nobody", name: "x", answers: {} }, NOW, newId), { ok: false, error: "bad" });
  assert.deepEqual(room.hostAct("host", { do: "proxy", name: "  ", answers: {} }, NOW, newId), { ok: false, error: "name" });
  // a phone can't take the row over by its id either
  const proxy = room.hostAct("host", { do: "proxy", name: "妈妈", answers: { [EVE]: 2 } }, NOW, newId);
  assert.ok(proxy.ok && proxy.id);
  assert.deepEqual(room.saveMine({ id: proxy.id, keyHash: "key-mum", newId, name: "妈妈", answers: {}, now: NOW }), { ok: false, error: "forbidden" });
  assert.equal(room.rowOf("key-mum"), null);
});

test("filling in for someone counts toward the 40 people a gathering takes", () => {
  const { room, newId } = make();
  for (let i = 0; i < MAX_PEOPLE; i++) assert.equal(room.hostAct("host", { do: "proxy", name: `朋友${i}`, answers: {} }, NOW, newId).ok, true);
  assert.deepEqual(room.hostAct("host", { do: "proxy", name: "再来一个", answers: {} }, NOW, newId), { ok: false, error: "full" });
});
