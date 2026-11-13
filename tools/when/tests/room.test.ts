// One gathering's room: who may change what, the admin code, and that it all survives a restart.
import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_LOCK_MS, ADMIN_TRIES, EventRoom, KEEP_MS, MAX_HOSTS, MAX_PEOPLE, memoryStore } from "../src/room/event";

const NOW = Date.UTC(2026, 10, 13, 2, 0); // 12 November, 7 p.m. in Vancouver
const TODAY = "2026-11-12";
const SAT = "2026-11-21";
const SUN = "2026-11-22";

function make(over: Record<string, unknown> = {}) {
  const store = memoryStore();
  const room = new EventRoom(store);
  let n = 0;
  const newId = () => `p${++n}`;
  const made = room.create({ code: "abcdefgh", title: "周末火锅", days: [SUN, SAT], grain: "half", hostHash: "host", adminHash: "admin-ok", adminSalt: "salt", now: NOW, today: TODAY, ...over });
  const save = (keyHash: string, name: unknown, answers: unknown, id?: unknown, now = NOW + 1000) => room.saveMine({ id, keyHash, newId, name, answers, now });
  return { store, room, made, save, newId };
}

test("making a gathering", () => {
  const { room, made, store } = make();
  assert.deepEqual(made, { ok: true });
  const state = room.state()!;
  assert.deepEqual(state.days, [SAT, SUN], "days in order");
  assert.equal(state.title, "周末火锅");
  assert.equal(state.expiresAt, NOW + KEEP_MS);
  assert.equal(state.minPeople, 1);
  assert.equal(state.settled, null);
  assert.deepEqual(state.people, []);
  // nothing secret is shown
  assert.equal(JSON.stringify(state).includes("admin"), false);
  assert.equal(JSON.stringify(state).includes("host"), false);
  assert.equal(store.meta!.hosts[0], "host");
  // a second make doesn't replace it
  assert.deepEqual(room.create({ code: "abcdefgh", title: "x", days: [SAT], grain: "day", hostHash: "other", adminHash: "x", adminSalt: "x", now: NOW, today: TODAY }), { ok: false, error: "exists" });
});

test("what can't be made", () => {
  assert.deepEqual(make({ title: "   " }).made, { ok: false, error: "bad" });
  assert.deepEqual(make({ days: [] }).made, { ok: false, error: "bad" });
  assert.deepEqual(make({ days: ["2026-11-11"] }).made, { ok: false, error: "bad" }, "yesterday");
  assert.deepEqual(make({ grain: "hour" }).made, { ok: false, error: "bad" });
  const none = new EventRoom(memoryStore());
  assert.equal(none.exists, false);
  assert.equal(none.state(), null);
  assert.equal(none.title, null);
  assert.deepEqual(none.saveMine({ keyHash: "k", newId: () => "x", name: "a", answers: {}, now: NOW }), { ok: false, error: "gone" });
});

test("everyone has their own row and only they can change it", () => {
  const { room, save } = make();
  const a = save("key-a", " 阿May ", { [`${SAT}:eve`]: 2, [`${SUN}:am`]: 1, "2026-12-25:am": 2, [`${SAT}:pm`]: 5 });
  assert.deepEqual(a, { ok: true, id: "p1", fresh: true });
  const b = save("key-b", "老王", { [`${SAT}:eve`]: 2 });
  assert.deepEqual(b, { ok: true, id: "p2", fresh: true });
  let people = room.state()!.people;
  assert.deepEqual(people.map((p) => p.name), ["阿May", "老王"]);
  assert.deepEqual(people[0].answers, { [`${SAT}:eve`]: 2, [`${SUN}:am`]: 1 }, "only this gathering's slots, only 1 or 2");
  // nobody's key is shown
  assert.equal(JSON.stringify(people).includes("key-a"), false);

  // b can't write a's row, whatever id it sends
  assert.deepEqual(save("key-b", "老王", {}, "p1"), { ok: false, error: "forbidden" });
  assert.deepEqual(room.state()!.people[0].answers, { [`${SAT}:eve`]: 2, [`${SUN}:am`]: 1 });

  // a changes its own: same row, new answers; the id it sends doesn't matter when the key is its own
  assert.deepEqual(save("key-a", "阿May", { [`${SUN}:pm`]: 2 }, "p1"), { ok: true, id: "p1", fresh: false });
  assert.deepEqual(save("key-a", "May", {}), { ok: true, id: "p1", fresh: false });
  people = room.state()!.people;
  assert.equal(people.length, 2);
  assert.equal(people[0].name, "May");
  assert.deepEqual(people[0].answers, {});
  assert.equal(room.rowOf("key-a"), "p1");
  assert.equal(room.rowOf("key-nobody"), null);
  assert.equal(room.rowOf(null), null);
});

test("two people tap the same slot at once: both answers stay", () => {
  const { room, save } = make();
  save("key-a", "a", { [`${SAT}:eve`]: 2 });
  save("key-b", "b", { [`${SAT}:eve`]: 2 });
  assert.deepEqual(room.state()!.people.map((p) => p.answers[`${SAT}:eve`]), [2, 2]);
});

test("a name is needed; the room holds 40", () => {
  const { room, save } = make();
  assert.deepEqual(save("key-a", "  ", {}), { ok: false, error: "name" });
  assert.deepEqual(save("key-a", 7, {}), { ok: false, error: "name" });
  for (let i = 0; i < MAX_PEOPLE; i++) assert.equal(save(`key-${i}`, `n${i}`, {}).ok, true);
  assert.deepEqual(save("key-late", "late", {}), { ok: false, error: "full" });
  // someone already in can still change their row
  assert.equal(save("key-3", "again", { [`${SAT}:am`]: 2 }).ok, true);
  assert.equal(room.state()!.people.length, MAX_PEOPLE);
});

test("the version goes up with every change", () => {
  const { room, save } = make();
  const v0 = room.state()!.v;
  save("key-a", "a", {});
  const v1 = room.state()!.v;
  room.hostAct("host", { do: "settle", slot: `${SAT}:eve` }, NOW);
  const v2 = room.state()!.v;
  assert.ok(v0 < v1 && v1 < v2);
  // a refused change doesn't count
  room.hostAct("not-host", { do: "reopen" }, NOW);
  save("key-a", "", {});
  assert.equal(room.state()!.v, v2);
});

test("only a host sets the time, and only on one of the gathering's slots", () => {
  const { room, save } = make();
  save("key-a", "a", { [`${SAT}:eve`]: 2 });
  assert.deepEqual(room.hostAct("key-a", { do: "settle", slot: `${SAT}:eve` }, NOW), { ok: false, error: "forbidden" });
  assert.deepEqual(room.hostAct(null, { do: "settle", slot: `${SAT}:eve` }, NOW), { ok: false, error: "forbidden" });
  assert.deepEqual(room.hostAct("host", { do: "settle", slot: "2026-12-25:eve" }, NOW), { ok: false, error: "bad" });
  assert.deepEqual(room.hostAct("host", { do: "settle", slot: `${SAT}:day` }, NOW), { ok: false, error: "bad" }, "a half-day gathering has no whole-day slot");
  assert.deepEqual(room.hostAct("host", { do: "settle", slot: `${SAT}:eve` }, NOW + 5), { ok: true });
  assert.deepEqual(room.state()!.settled, { day: SAT, part: "eve", at: NOW + 5 });
  // answers can still change afterwards; the time stays set
  assert.equal(save("key-a", "a", {}).ok, true);
  assert.deepEqual(room.state()!.settled, { day: SAT, part: "eve", at: NOW + 5 });
  assert.deepEqual(room.hostAct("host", { do: "reopen" }, NOW), { ok: true });
  assert.equal(room.state()!.settled, null);
});

test("the host's other moves", () => {
  const { room, save } = make();
  save("key-a", "寿星", {});
  save("key-b", "b", {});
  assert.deepEqual(room.hostAct("host", { do: "must", id: "p1", must: true }, NOW), { ok: true });
  assert.deepEqual(room.state()!.people.map((p) => p.must), [true, false]);
  assert.deepEqual(room.hostAct("host", { do: "must", id: "nobody", must: true }, NOW), { ok: false, error: "bad" });
  assert.deepEqual(room.hostAct("host", { do: "edit", title: " 周六火锅 ", minPeople: 4, deadline: NOW + 86_400_000 }, NOW), { ok: true });
  let state = room.state()!;
  assert.deepEqual([state.title, state.minPeople, state.deadline], ["周六火锅", 4, NOW + 86_400_000]);
  for (const bad of [{ minPeople: 0 }, { minPeople: 2.5 }, { minPeople: MAX_PEOPLE + 1 }, { minPeople: "4" }, { title: " " }, { deadline: NOW - 1 }, { deadline: NOW + KEEP_MS + 1 }, { deadline: "soon" }]) {
    assert.deepEqual(room.hostAct("host", { do: "edit", ...bad }, NOW), { ok: false, error: "bad" }, JSON.stringify(bad));
  }
  assert.deepEqual(room.hostAct("host", { do: "edit", deadline: null }, NOW), { ok: true });
  assert.equal(room.state()!.deadline, null);
  // removing a row (a duplicate): gone for everyone; that phone can start again with a new row
  assert.deepEqual(room.hostAct("host", { do: "remove", id: "p2" }, NOW), { ok: true });
  assert.deepEqual(room.state()!.people.map((p) => p.id), ["p1"]);
  assert.deepEqual(room.hostAct("host", { do: "remove", id: "p2" }, NOW), { ok: false, error: "bad" });
  assert.deepEqual(save("key-b", "b", {}, "p2"), { ok: true, id: "p3", fresh: true });
  // nonsense
  assert.deepEqual(room.hostAct("host", { do: "explode" } as never, NOW), { ok: false, error: "bad" });
  assert.deepEqual(room.hostAct("host", null as never, NOW), { ok: false, error: "bad" });
  state = room.state()!;
  assert.equal(state.title, "周六火锅");
});

test("the admin code makes another phone a host", () => {
  const { room } = make();
  assert.deepEqual(room.adminSalt(NOW), { ok: true, salt: "salt" });
  assert.equal(room.isHost("phone-2"), false);
  assert.deepEqual(room.claim({ adminHash: "admin-ok", keyHash: "phone-2", now: NOW }), { ok: true });
  assert.equal(room.isHost("phone-2"), true);
  assert.equal(room.isHost("host"), true, "the first phone still is");
  assert.deepEqual(room.hostAct("phone-2", { do: "settle", slot: `${SAT}:eve` }, NOW), { ok: true });
  // the same phone twice is still one host
  room.claim({ adminHash: "admin-ok", keyHash: "phone-2", now: NOW });
  assert.equal(room.isHost(null), false);
});

test("five wrong codes in a row: none are taken for an hour, not even the right one", () => {
  const { room } = make();
  for (let i = 1; i < ADMIN_TRIES; i++) assert.deepEqual(room.claim({ adminHash: "guess", keyHash: "thief", now: NOW + i }), { ok: false, error: "wrong" });
  assert.deepEqual(room.claim({ adminHash: "guess", keyHash: "thief", now: NOW + 10 }), { ok: false, error: "locked" });
  assert.deepEqual(room.adminSalt(NOW + 11), { ok: false, error: "locked" });
  assert.deepEqual(room.claim({ adminHash: "admin-ok", keyHash: "owner-2", now: NOW + ADMIN_LOCK_MS }), { ok: false, error: "locked" });
  assert.equal(room.isHost("thief"), false);
  // after the hour
  assert.deepEqual(room.claim({ adminHash: "admin-ok", keyHash: "owner-2", now: NOW + 10 + ADMIN_LOCK_MS }), { ok: true });
  // a right code clears the count: four wrong, one right, four wrong again is not a lock
  const again = make().room;
  for (let i = 1; i < ADMIN_TRIES; i++) again.claim({ adminHash: "guess", keyHash: "x", now: NOW });
  assert.deepEqual(again.claim({ adminHash: "admin-ok", keyHash: "y", now: NOW }), { ok: true });
  for (let i = 1; i < ADMIN_TRIES; i++) assert.deepEqual(again.claim({ adminHash: "guess", keyHash: "x", now: NOW }), { ok: false, error: "wrong" });
});

test("at most eight phones manage a gathering; the one that made it always does", () => {
  const { room } = make();
  for (let i = 0; i < MAX_HOSTS + 3; i++) room.claim({ adminHash: "admin-ok", keyHash: `phone-${i}`, now: NOW });
  assert.equal(room.isHost("host"), true);
  assert.equal(room.isHost(`phone-${MAX_HOSTS + 2}`), true, "the newest");
  assert.equal(room.isHost("phone-0"), false, "the oldest extra one made way");
});

test("everything survives a restart", () => {
  const { store, room, save } = make();
  save("key-a", "阿May", { [`${SAT}:eve`]: 2 });
  save("key-b", "老王", { [`${SAT}:eve`]: 1 }, undefined, NOW + 2000);
  room.hostAct("host", { do: "must", id: "p1", must: true }, NOW);
  room.hostAct("host", { do: "edit", minPeople: 2 }, NOW);
  room.hostAct("host", { do: "settle", slot: `${SAT}:eve` }, NOW + 9);
  room.claim({ adminHash: "guess", keyHash: "x", now: NOW });
  const before = room.state();

  const woken = new EventRoom(store);
  assert.deepEqual(woken.state(), before);
  assert.equal(woken.isHost("host"), true);
  assert.equal(woken.rowOf("key-b"), "p2");
  assert.deepEqual(woken.state()!.people.map((p) => p.name), ["阿May", "老王"], "in the order they joined");
  // the wrong tries were kept too: four more and it locks
  for (let i = 0; i < ADMIN_TRIES - 2; i++) woken.claim({ adminHash: "guess", keyHash: "x", now: NOW });
  assert.deepEqual(woken.claim({ adminHash: "guess", keyHash: "x", now: NOW }), { ok: false, error: "locked" });
});

test("after its 60 days, nothing is left", () => {
  const { store, room, save } = make();
  save("key-a", "a", {});
  room.wipe();
  assert.equal(room.exists, false);
  assert.equal(room.state(), null);
  assert.equal(store.meta, null);
  assert.equal(store.rows.size, 0);
  assert.equal(new EventRoom(store).exists, false);
});
