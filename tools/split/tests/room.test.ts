// One ledger's room: who may open it, that changes are taken in order and once, the record of
// them, that it all survives a restart, and that its owner can delete it; its list of receipt
// photos and files. Then one account's list of ledgers, and its room for files. (What a change does
// is tested with the phone's own rules: site/tests/split-changes.test.ts.)
import assert from "node:assert/strict";
import test from "node:test";
import type { Sent } from "../../../site/src/split/changes";
import type { Expense } from "../../../site/src/split/core";
import { AccountRoom, INVITE_DAYS, MAX_INVITES, MAX_MINE, memoryAccountStore, UPLOADS_PER_DAY, type Invite } from "../src/room/account";
import { LedgerRoom, MAX_BATCH, MAX_LEDGER_FILES, MAX_SENT, memoryStore, SETTLING_MS, UNUSED_DAYS, usedFiles, type StoredFile } from "../src/room/ledger";
import { nextNight } from "../src/room/nightly";
import { base64, costOf, fakeRead, monthOf, readAnswer, readRequest, READ_MODELS } from "../src/server/read";

const NOW = Date.UTC(2026, 10, 13, 19, 0);
const three = [
  { id: "s", name: "Steve" },
  { id: "w", name: "小王" },
  { id: "m", name: "阿美" },
];
const asked = { id: "ledger-0001", name: " 周末 ", currency: "CAD", members: three, keyHash: "key", now: NOW };

function make(over: Record<string, unknown> = {}) {
  const store = memoryStore();
  const room = new LedgerRoom(store);
  const made = room.create({ ...asked, ...over });
  return { store, room, made };
}
let n = 0;
const expense = (id: string, over: Partial<Expense> = {}): Sent => ({
  id: `c${++n}`,
  at: NOW,
  change: { do: "expense", expense: { kind: "expense", id, at: NOW, payer: "s", amount: 3000, note: "", split: { how: "equal", among: ["s", "w", "m"] }, rot: 0, ...over } },
});

test("making a ledger", () => {
  const { room, made, store } = make();
  assert.deepEqual(made, { ok: true, seq: 0, ledger: { id: "ledger-0001", name: "周末", currency: "CAD", members: three, entries: [] } });
  assert.deepEqual(store.load()?.meta, { keyHash: "key", madeAt: NOW, seq: 0, sent: 0 });
  room.push("key", [expense("e1")], NOW + 1);
  const again = room.create({ ...asked, name: "别的名字", now: NOW + 5 });
  assert.ok(again.ok && again.seq === 1 && again.ledger.name === "周末", "asked for again with the same key: the ledger already made, as it stands");
  assert.deepEqual(room.create({ ...asked, keyHash: "another" }), { ok: false, error: "exists" }, "the id is taken: another key doesn't get it");
});

test("what isn't a ledger is not made", () => {
  const thirtyOne = Array.from({ length: 31 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const not: [string, Record<string, unknown>][] = [
    ["an id too short for an address", { id: "abc" }],
    ["an id with a space", { id: "ledger 0001" }],
    ["an id that isn't text", { id: 5 }],
    ["no name", { name: "   " }],
    ["a name that isn't text", { name: null }],
    ["a currency the site doesn't know", { currency: "XXX" }],
    ["a currency that is a word JavaScript knows", { currency: "constructor" }],
    ["one person", { members: three.slice(0, 1) }],
    ["thirty-one people", { members: thirtyOne }],
    ["people that aren't a list", { members: "s,w" }],
    ["the same person twice", { members: [three[0], three[0]] }],
    ["two people with one name", { members: [three[0], { id: "x", name: "steve" }] }],
    ["someone with no name", { members: [three[0], { id: "x", name: " " }] }],
    ["someone whose id isn't one", { members: [three[0], { id: "x y", name: "X" }] }],
    ["someone who isn't a person", { members: [three[0], null] }],
  ];
  for (const [what, over] of not) {
    const { made, store, room } = make(over);
    assert.deepEqual(made, { ok: false, error: "bad" }, what);
    assert.equal(store.load(), null, `${what}: nothing is kept`);
    assert.deepEqual(room.read("key"), { ok: false, error: "gone" }, `${what}: there is no ledger`);
  }
  const { made } = make({ members: [{ id: "a", name: "  Ann  ", extra: 1 }, { id: "b", name: "Bo" }] });
  assert.ok(made.ok && JSON.stringify(made.ledger.members) === JSON.stringify([{ id: "a", name: "Ann" }, { id: "b", name: "Bo" }]), "names are tidied, and nothing else about a person is kept");
});

test("only the key opens it", () => {
  const { room } = make();
  assert.ok(room.read("key").ok);
  assert.ok(room.opens("key") && !room.opens("wrong") && !room.opens(null));
  for (const key of ["wrong", null]) {
    assert.deepEqual(room.read(key), { ok: false, error: "key" });
    assert.deepEqual(room.push(key, [expense("e1")], NOW), { ok: false, error: "key" });
    assert.deepEqual(room.since(key, 0), { ok: false, error: "key" });
  }
  assert.equal(room.snapshot()?.seq, 0, "and a wrong key changed nothing");
  const nowhere = new LedgerRoom(memoryStore());
  assert.ok(!nowhere.opens("key") && nowhere.snapshot() === null);
  assert.deepEqual([nowhere.read("key"), nowhere.push("key", [], NOW), nowhere.since("key", 0)], Array(3).fill({ ok: false, error: "gone" }), "a ledger nobody made");
});

test("changes are taken in order, each one once, and written in the record", () => {
  const { room, store } = make();
  const [e1, e2, e3] = [expense("e1"), expense("e2", { amount: 100 }), expense("e3")];
  const first = room.push("key", [e1, e2], NOW + 10);
  assert.ok(first.ok);
  assert.deepEqual([first.took, first.seq, first.ledger.entries.map((e) => e.id)], [["new", "new"], 2, ["e1", "e2"]]);
  // the answer is lost, so the phone sends everything it has waiting again, with one more
  const second = room.push("key", [e1, e2, e3, e3], NOW + 20);
  assert.ok(second.ok);
  assert.deepEqual([second.took, second.seq, second.ledger.entries.map((e) => e.id)], [["seen", "seen", "new", "seen"], 3, ["e1", "e2", "e3"]]);
  assert.deepEqual(store.log.map((l) => [l.seq, l.at, "sent" in l && l.sent.id]), [[1, NOW + 10, e1.id], [2, NOW + 10, e2.id], [3, NOW + 20, e3.id]]);
  assert.deepEqual(store.load()?.meta, { keyHash: "key", madeAt: NOW, seq: 3, sent: 3 });

  const after = room.since("key", 1);
  assert.ok(after.ok);
  assert.deepEqual([after.seq, after.changes.map((l) => l.seq)], [3, [2, 3]], "the record after change 1");
  const none = room.since("key", 3);
  assert.ok(none.ok && none.changes.length === 0);
  for (const bad of [-1, 1.5, "1", null]) assert.deepEqual(room.since("key", bad), { ok: false, error: "bad" });
});

test("a change that changes nothing is remembered, and is not in the record", () => {
  const { room, store } = make();
  const unsound = expense("e1", { payer: "nobody" });
  const got = room.push("key", [unsound], NOW);
  assert.ok(got.ok);
  assert.deepEqual([got.took, got.seq, got.ledger.entries.length, store.log.length, store.load()?.meta.sent], [["nothing"], 0, 0, 0, 1]);
  const again = room.push("key", [unsound], NOW);
  assert.ok(again.ok && again.took[0] === "nothing" && store.load()?.meta.sent === 1, "sent again, it is told the same: it didn't stick");
});

test("an expense paid in another currency keeps both amounts, and a change to it says what becomes of the other one", () => {
  const { room } = make();
  const said = { payer: "s", note: "", split: { how: "equal" as const, among: ["s", "w", "m"] } };
  const edit = (to: Record<string, unknown>): unknown => ({ id: `c${++n}`, at: NOW, change: { do: "edit", entry: "e1", to: { ...said, ...to } } });
  const now = (got: ReturnType<typeof room.push>) => {
    assert.ok(got.ok);
    const e = got.ledger.entries[0] as Expense;
    return [got.took.join(), e.amount, e.paidIn ?? null];
  };
  const usd = { currency: "USD", amount: 3000, rate: "1.40" };
  assert.deepEqual(now(room.push("key", [expense("e1", { amount: 4200, paidIn: usd })], NOW)), ["new", 4200, usd], "30 US dollars at 1.40 counts for 42 Canadian, and the ledger keeps both");
  // (sent as text, the way a phone sends it: only what an other currency has is kept)
  const dearer = { currency: "USD", amount: 3500, rate: "1.40" };
  assert.deepEqual(now(room.push("key", JSON.parse(JSON.stringify([edit({ amount: 4900, paidIn: { ...dearer, extra: 1 } })])), NOW)), ["new", 4900, dearer], "changed to 35 dollars by a change that says so");
  assert.deepEqual(now(room.push("key", [edit({ amount: 4900, note: "lunch" })], NOW)), ["new", 4900, dearer], "a page from before changes the note and says nothing of the dollars: they stay");
  assert.deepEqual(now(room.push("key", [edit({ amount: 5000, note: "lunch" })], NOW)), ["new", 5000, null], "it changes the amount: the dollars go, since they no longer come to it");
  assert.deepEqual(now(room.push("key", [edit({ amount: 4170, paidIn: { currency: "USD", amount: 3000, rate: "1.39" } }), edit({ amount: 4170, paidIn: null })], NOW)), ["new,new", 4170, null], "put back by a change that says so, then said to be in the ledger's own currency");
  for (const paidIn of [5, "USD", { currency: "usd", amount: 5, rate: "1" }, { currency: "USD", amount: 5 }]) {
    assert.deepEqual(room.push("key", [edit({ amount: 4170, paidIn })], NOW), { ok: false, error: "bad" }, "an other currency that isn't the shape of one isn't a change");
  }
  assert.deepEqual(now(room.push("key", [edit({ amount: 9000, paidIn: { currency: "USD", amount: 5, rate: "0" } })], NOW)), ["nothing", 4170, null], "one with no rate changes nothing, the amount included");
});

test("a request with anything in it that isn't a change is turned away whole", () => {
  const { room, store } = make();
  const good = expense("e1");
  for (const raw of [[good, { id: "x" }], [good, null], "changes", { 0: good }, Array(MAX_BATCH + 1).fill(good)]) {
    assert.deepEqual(room.push("key", raw, NOW), { ok: false, error: "bad" });
  }
  assert.deepEqual([room.snapshot()?.seq, store.ids.size, store.log.length], [0, 0, 0], "nothing was taken, and nothing remembered");
  const alone = room.push("key", [good], NOW);
  assert.ok(alone.ok && alone.took[0] === "new", "the good one, sent by itself, still counts");
  const empty = room.push("key", [], NOW);
  assert.ok(empty.ok && empty.took.length === 0 && empty.seq === 1, "nothing to send is fine: it is how a phone asks where things stand");
});

test("a ledger takes only so many changes", () => {
  const { store } = make();
  const kept = store.load()!;
  store.save({ ...kept.meta, sent: MAX_SENT - 1 }, kept.ledger);
  const room = new LedgerRoom(store);
  assert.deepEqual(room.push("key", [expense("e1"), expense("e2")], NOW), { ok: false, error: "full" });
  assert.equal(room.snapshot()?.ledger.entries.length, 0, "turned away whole");
  const last = expense("e1");
  const one = room.push("key", [last], NOW);
  assert.ok(one.ok && one.took[0] === "new");
  assert.deepEqual(room.push("key", [expense("e2")], NOW), { ok: false, error: "full" });
  const seen = room.push("key", [last], NOW);
  assert.ok(seen.ok && seen.took[0] === "seen", "what it was sent before it still answers for");
});

test("it all survives a restart", () => {
  const { room, store } = make();
  const e1 = expense("e1");
  room.push("key", [e1, { id: "c-out", at: NOW, change: { do: "out", entry: "e1", at: NOW + 1 } }], NOW + 10);
  const before = room.snapshot();
  const woken = new LedgerRoom(store);
  assert.deepEqual(woken.snapshot(), before);
  assert.ok(woken.opens("key") && !woken.opens("wrong"));
  const next = woken.push("key", [e1, expense("e2")], NOW + 30);
  assert.ok(next.ok);
  assert.deepEqual([next.took, next.seq], [["seen", "new"], 3]);
  assert.equal((next.ledger.entries[0] as Expense).gone, NOW + 1, "the first is still out");
});

test("a ledger has an owner: the key only the phone that made it holds", () => {
  const { room, store } = make({ ownerHash: "owner" });
  assert.equal(store.load()?.meta.ownerHash, "owner");
  assert.ok(room.owns("owner") && !room.owns("key") && !room.owns("wrong") && !room.owns(null));
  assert.deepEqual(room.read("owner"), { ok: false, error: "key" }, "the owner's key doesn't open the ledger: it is for the owner's two doors only");
  assert.deepEqual(room.push("owner", [expense("e1")], NOW), { ok: false, error: "key" });
  const again = room.create({ ...asked, ownerHash: "another", now: NOW + 1 });
  assert.ok(again.ok && room.owns("owner") && !room.owns("another"), "asked for again with the same key: whoever owned it first still does");
  assert.deepEqual(make({ ownerHash: "key" }).made, { ok: false, error: "bad" }, "the owner's key can't be the one in the invitation");

  const old = make();
  assert.ok(!old.room.owns("owner") && !old.room.owns("key") && !old.room.owns(null), "a ledger made with no owner's key has no owner: no key is one");
  assert.ok(!("ownerHash" in old.store.load()!.meta));
});

test("the owner changes the key: the old invitation is turned away", () => {
  const { room, store } = make({ ownerHash: "owner" });
  room.push("key", [expense("e1")], NOW + 1);
  for (const who of ["key", "wrong", null]) assert.deepEqual(room.rekey(who, "key2"), { ok: false, error: "owner" }, `not by ${who ?? "nobody"}`);
  assert.ok(room.opens("key"), "and the key is as it was");

  const done = room.rekey("owner", "key2");
  assert.deepEqual(done, { ok: true, seq: 1, ledger: room.snapshot()!.ledger, changed: true });
  assert.deepEqual(room.read("key"), { ok: false, error: "key" }, "the old key reads nothing");
  assert.deepEqual(room.push("key", [expense("e2")], NOW + 2), { ok: false, error: "key" }, "and records nothing");
  assert.deepEqual(room.since("key", 0), { ok: false, error: "key" });
  const read = room.read("key2");
  assert.ok(read.ok && read.seq === 1 && read.ledger.entries.length === 1, "the new one opens the ledger with everything in it; changing the key is no change to the ledger");
  assert.deepEqual(room.rekey("owner", "key2"), { ...done, changed: false }, "asked again with the same new key (the answer was lost): it is already so");
  assert.deepEqual(room.rekey("owner", "owner"), { ok: false, error: "bad" }, "the invitation's key can't be the owner's own");
  assert.ok(room.opens("key2"));

  const woken = new LedgerRoom(store);
  assert.ok(woken.opens("key2") && !woken.opens("key") && woken.owns("owner"), "after a restart too");
  assert.deepEqual(make().room.rekey("key", "key2"), { ok: false, error: "owner" }, "a ledger with no owner keeps its key");
  assert.deepEqual(new LedgerRoom(memoryStore()).rekey("owner", "key2"), { ok: false, error: "gone" });
});

test("the owner locks the ledger, and opens it again", () => {
  const { room, store } = make({ ownerHash: "owner" });
  const e1 = expense("e1");
  room.push("key", [e1], NOW + 1);
  for (const who of ["key", "wrong", null]) assert.deepEqual(room.lock(who, true, NOW + 2), { ok: false, error: "owner" }, `not by ${who ?? "nobody"}`);
  for (const not of ["yes", 1, null, undefined]) assert.deepEqual(room.lock("owner", not, NOW + 2), { ok: false, error: "bad" });
  assert.ok(!("locked" in room.snapshot()!.ledger) && room.snapshot()!.seq === 1);

  const locked = room.lock("owner", true, NOW + 2);
  assert.ok(locked.ok && locked.changed && locked.seq === 2 && locked.ledger.locked === NOW + 2, "locked: the ledger says so, and since when, under a number of its own");
  const read = room.read("key");
  assert.ok(read.ok && read.ledger.locked === NOW + 2 && read.ledger.entries.length === 1, "it can still be read");
  assert.deepEqual(room.push("key", [expense("e2")], NOW + 3), { ok: false, error: "locked" }, "it takes nothing new");
  assert.deepEqual(room.push("key", [e1, expense("e2")], NOW + 3), { ok: false, error: "locked" }, "and a request with anything new in it is turned away whole");
  assert.deepEqual(room.push("key", [e1, "nonsense"], NOW + 3), { ok: false, error: "bad" }, "what isn't a change is still that, first");
  const seen = room.push("key", [e1], NOW + 3);
  assert.ok(seen.ok && seen.took[0] === "seen" && seen.seq === 2, "what it took before the lock it still answers for (a phone whose answer was lost)");
  const none = room.push("key", [], NOW + 3);
  assert.ok(none.ok && none.took.length === 0);
  const again = room.lock("owner", true, NOW + 4);
  assert.ok(again.ok && !again.changed && again.seq === 2 && again.ledger.locked === NOW + 2, "locked again: it is already so, and keeps the time it was first locked");
  assert.deepEqual([store.ids.size, room.snapshot()?.ledger.entries.length], [1, 1], "nothing that was turned away is remembered");

  const woken = new LedgerRoom(store);
  assert.equal(woken.snapshot()?.ledger.locked, NOW + 2, "still locked after a restart");
  assert.deepEqual(woken.push("key", [expense("e3")], NOW + 5), { ok: false, error: "locked" });

  const opened = woken.lock("owner", false, NOW + 6);
  assert.ok(opened.ok && opened.changed && opened.seq === 3 && !("locked" in opened.ledger), "opened again");
  const unlockedAgain = woken.lock("owner", false, NOW + 6);
  assert.ok(unlockedAgain.ok && !unlockedAgain.changed && unlockedAgain.seq === 3);
  const next = woken.push("key", [expense("e2")], NOW + 7);
  assert.ok(next.ok && next.took[0] === "new" && next.seq === 4, "and it takes changes as before");

  const since = woken.since("key", 0);
  assert.ok(since.ok);
  assert.deepEqual(
    since.changes.map((c) => ("lock" in c ? `${c.lock ? "locked" : "opened"} ${c.seq} ${c.at - NOW}` : `${c.sent.change.do} ${c.seq} ${c.at - NOW}`)),
    ["expense 1 1", "locked 2 2", "opened 3 6", "expense 4 7"],
    "the record has when it was locked and opened, in their places",
  );

  const old = make();
  assert.deepEqual(old.room.lock("key", true, NOW), { ok: false, error: "owner" }, "a ledger with no owner can't be locked");
  assert.deepEqual(new LedgerRoom(memoryStore()).lock("owner", true, NOW), { ok: false, error: "gone" });
});

test("a 查看链接: its key lets people look, and does nothing else", () => {
  const { room, store } = make({ ownerHash: "owner" });
  room.push("key", [expense("e1")], NOW + 1);
  room.stored({ id: "f1", size: 300_000, type: "image/jpeg", by: "u1", at: NOW + 1 });
  assert.deepEqual(room.look("view"), { ok: false, error: "key" }, "before it is made, nothing");
  for (const who of ["view", "wrong", null, "owner"]) assert.deepEqual(room.view(who, "view"), { ok: false, error: "key" }, `not made by ${who ?? "nobody"}: only the key makes it`);
  for (const same of ["key", "owner"]) assert.deepEqual(room.view("key", same), { ok: false, error: "bad" }, `never the ledger's own key or its owner's (${same})`);
  assert.deepEqual(room.view("key", "view"), { ok: true, changed: true }, "the key makes it");
  assert.deepEqual(room.view("key", "view"), { ok: true, changed: false }, "made again, the same: nothing changes");
  const seen = room.look("view");
  assert.ok(seen.ok && seen.ledger.entries.length === 1 && seen.seq === 1, "its key looks at the ledger as it stands");
  assert.deepEqual(room.look("key"), seen, "and so does the ledger's own");
  assert.deepEqual(
    [room.read("view"), room.push("view", [expense("e2")], NOW + 2), room.since("view", 0), room.mayStore("view", "f2"), room.file("view", "f1"), room.listFiles("view"), room.unstore("view", "f1"), room.view("view", "view2")],
    Array(8).fill({ ok: false, error: "key" }),
    "and nothing else: no changes, no record, no files, no making another",
  );
  assert.ok(room.snapshot()!.seq === 1 && !("view" in room.snapshot()!.ledger), "nothing in the ledger, or its record, says it was made");
  const woken = new LedgerRoom(store);
  assert.ok(woken.look("view").ok, "it survives a restart");
  // a locked ledger can have one: it isn't a change to the ledger
  room.lock("owner", true, NOW + 3);
  assert.deepEqual(room.view("key", "view3"), { ok: true, changed: true }, "a locked ledger can have one");
  assert.ok(room.look("view3").ok && !room.look("view").ok, "the one made last is the one that works");
  // the owner changes the key: the 查看链接 goes with the old one
  room.rekey("owner", "key2");
  assert.deepEqual(room.look("view3"), { ok: false, error: "key" }, "the key changed: the old 查看链接 is turned away");
  assert.deepEqual(room.view("key", "view4"), { ok: false, error: "key" }, "and the old key makes no new one");
  assert.ok(room.view("key2", "view4").ok && room.look("view4").ok, "the new key makes the next");
});

test("收款方式: set by the ledger's people, kept, and never read through a 查看链接", () => {
  const { room, store } = make();
  const pay = (id: string, member: string, to: string): Sent => ({ id, at: NOW, change: { do: "pay", member, pay: to } });
  const set = room.push("key", [pay("p1", "s", "  steve@example.com "), pay("p2", "nobody", "x@y.z")], NOW + 1);
  assert.ok(set.ok && set.took.join() === "new,nothing", "set for someone in the ledger, tidied; not for someone who isn't");
  const mine = room.read("key");
  assert.ok(mine.ok && mine.ledger.members.find((m) => m.id === "s")?.pay === "steve@example.com", "the ledger's people read it");
  assert.deepEqual(room.push("key", [pay("p3", "s", "steve@example.com")], NOW + 2).ok && room.snapshot()!.seq, 1, "the same again changes nothing");
  room.view("key", "view");
  const seen = room.look("view");
  assert.ok(seen.ok && seen.ledger.members.length === 3 && seen.ledger.members.every((m) => !("pay" in m)), "a 查看链接 reads the people, and nobody's 收款方式");
  assert.ok(seen.ok && JSON.stringify(seen.ledger.entries) === JSON.stringify(mine.ok && mine.ledger.entries), "and the rest as it is");
  const own = room.look("key");
  assert.ok(own.ok && own.ledger.members.find((m) => m.id === "s")?.pay === "steve@example.com", "the ledger's own key, looking, still reads it");
  assert.deepEqual(room.push("view", [pay("p4", "s", "thief@example.com")], NOW + 3), { ok: false, error: "key" }, "a 查看链接 can't change it");
  assert.ok(new LedgerRoom(store).read("key").ok && new LedgerRoom(store).snapshot()!.ledger.members[0].pay === "steve@example.com", "it survives a restart");
  const off = room.push("key", [pay("p5", "s", "   ")], NOW + 4);
  assert.ok(off.ok && !("pay" in room.snapshot()!.ledger.members[0]), "nothing left once tidied: taken off");
});

test("a locked ledger with its key changed: both hold", () => {
  const { room } = make({ ownerHash: "owner" });
  room.lock("owner", true, NOW + 1);
  const done = room.rekey("owner", "key2");
  assert.ok(done.ok && done.ledger.locked === NOW + 1 && done.seq === 1);
  assert.deepEqual(room.push("key2", [expense("e1")], NOW + 2), { ok: false, error: "locked" });
  assert.deepEqual(room.push("key", [expense("e1")], NOW + 2), { ok: false, error: "key" }, "the wrong key is told that, not that the ledger is locked");
});

test("the owner deletes the ledger: it is gone for everyone, and its id isn't made again", () => {
  const { room, store } = make({ ownerHash: "owner" });
  room.push("key", [expense("e1")], NOW + 1);
  room.lock("owner", true, NOW + 2);
  for (const who of ["key", "wrong", null]) assert.deepEqual(room.wipe(who, NOW + 3), { ok: false, error: "owner" }, `not by ${who ?? "nobody"}`);
  assert.ok(room.read("key").ok, "(still there)");

  assert.deepEqual(room.wipe("owner", NOW + 3), { ok: true, id: asked.id, files: [] }, "the owner deletes it, locked or not");
  assert.deepEqual([store.load(), store.ids.size, store.log.length, store.buried()], [null, 0, 0, NOW + 3], "nothing of it is kept but when it went");
  for (const got of [room.read("key"), room.push("key", [expense("e2")], NOW + 4), room.since("key", 0), room.lock("owner", false, NOW + 4), room.rekey("owner", "next"), room.wipe("owner", NOW + 4)]) {
    assert.deepEqual(got, { ok: false, error: "gone" }, "it is gone: to its key, its owner's key, and a second delete");
  }
  assert.equal(room.snapshot(), null);
  assert.deepEqual(room.create({ ...asked, now: NOW + 5 }), { ok: false, error: "gone" }, "made again with its own key: no, it is gone");
  assert.deepEqual(room.create({ ...asked, keyHash: "another", now: NOW + 5 }), { ok: false, error: "gone" }, "nor with another: the phones that had it would open a stranger's ledger");
  const woken = new LedgerRoom(store);
  assert.deepEqual([woken.snapshot(), woken.read("key"), woken.create({ ...asked, now: NOW + 6 })], [null, { ok: false, error: "gone" }, { ok: false, error: "gone" }], "the same after a restart");

  const { room: ownerless } = make();
  assert.deepEqual(ownerless.wipe(null, NOW + 1), { ok: false, error: "owner" }, "a ledger with no owner can't be deleted by anyone");
});

test("a ledger's files: stored once, read and listed with the key, taken off, and handed back when it is deleted", () => {
  const { room, store } = make({ ownerHash: "owner" });
  const photo = (id: string, over: Partial<StoredFile> = {}): StoredFile => ({ id, size: 300_000, type: "image/jpeg", by: "u1", at: NOW + 1, ...over });
  for (const key of ["wrong", null]) assert.deepEqual(room.mayStore(key, "f1"), { ok: false, error: "key" }, `not with ${key ?? "no key"}`);
  assert.deepEqual(room.mayStore("key", "f1"), { ok: true, kept: null }, "the key may store a new one");
  assert.deepEqual(room.stored(photo("f1")), { ok: true, file: { id: "f1", size: 300_000, type: "image/jpeg", at: NOW + 1 } }, "kept: nobody but the server is told whose account sent it");
  assert.deepEqual(room.stored(photo("f1", { size: 5, by: "u2" })), { ok: true, file: { id: "f1", size: 300_000, type: "image/jpeg", at: NOW + 1 } }, "told again, it is as it was first kept");
  assert.deepEqual(room.mayStore("key", "f1"), { ok: true, kept: { id: "f1", size: 300_000, type: "image/jpeg", at: NOW + 1 } }, "asked again for the same id: it is there already");
  room.stored(photo("f2", { type: "application/pdf", size: 1_000_000, by: "u2", at: NOW + 2 }));
  assert.deepEqual(room.file("key", "f2"), { ok: true, file: { id: "f2", size: 1_000_000, type: "application/pdf", at: NOW + 2 } });
  assert.deepEqual([room.file("wrong", "f2"), room.file("key", "nope")], [{ ok: false, error: "key" }, { ok: false, error: "gone" }], "the wrong key, and an id it doesn't have");
  assert.deepEqual(room.listFiles("key"), { ok: true, files: [{ id: "f1", size: 300_000, type: "image/jpeg", at: NOW + 1 }, { id: "f2", size: 1_000_000, type: "application/pdf", at: NOW + 2 }] }, "listed, the first stored first");
  assert.deepEqual(room.listFiles("wrong"), { ok: false, error: "key" });

  room.lock("owner", true, NOW + 3);
  assert.deepEqual([room.mayStore("key", "f3"), room.stored(photo("f3")), room.unstore("key", "f1")], [{ ok: false, error: "locked" }, { ok: false, error: "locked" }, { ok: false, error: "locked" }], "locked: no new file, and none taken off");
  assert.ok(room.mayStore("key", "f1").ok && room.file("key", "f1").ok && room.listFiles("key").ok, "but one stored already is still there to be read (and a phone sending it again hears it is)");
  room.lock("owner", false, NOW + 4);

  assert.deepEqual(room.unstore("wrong", "f1"), { ok: false, error: "key" });
  assert.deepEqual(room.unstore("key", "f1"), { ok: true, file: photo("f1") }, "taken off by the key: its record comes back, whose account sent it included");
  assert.deepEqual([room.unstore("key", "f1"), room.file("key", "f1")], [{ ok: false, error: "gone" }, { ok: false, error: "gone" }], "taken off twice: gone");
  const woken = new LedgerRoom(store);
  assert.deepEqual(woken.listFiles("key"), { ok: true, files: [{ id: "f2", size: 1_000_000, type: "application/pdf", at: NOW + 2 }] }, "the same after a restart");

  const deleted = woken.wipe("owner", NOW + 5);
  assert.deepEqual(deleted, { ok: true, id: asked.id, files: [photo("f2", { type: "application/pdf", size: 1_000_000, by: "u2", at: NOW + 2 })] }, "deleted: its files come back, for the bucket and their senders' accounts");
  assert.deepEqual([store.kept.size, woken.mayStore("key", "f4"), woken.stored(photo("f4")), woken.file("key", "f2")], [0, { ok: false, error: "gone" }, { ok: false, error: "gone" }, { ok: false, error: "gone" }], "and nothing of them is kept, nor can more be");

  const full = make();
  for (let i = 0; i < MAX_LEDGER_FILES; i++) full.store.putFile(photo(`p${i}`));
  assert.deepEqual([full.room.mayStore("key", "one-more"), full.room.stored(photo("one-more"))], [{ ok: false, error: "full" }, { ok: false, error: "full" }], `${MAX_LEDGER_FILES} files: no more`);
  assert.ok(full.room.mayStore("key", "p7").ok, "though one of them can still be sent again");
});

test("an account's room for files: charged once, never past its quota, so many a day, and given back", () => {
  const store = memoryAccountStore();
  const account = new AccountRoom(store);
  const quota = 1_000;
  const day = "2026-11-14";
  const reserve = (ledger: string, id: string, size: number, on = day) => account.reserve({ ledger, id, size, now: NOW, day: on, quota });
  assert.deepEqual(reserve("L1", "f1", 400), { ok: true, used: 400, fresh: true });
  assert.deepEqual(reserve("L1", "f1", 400), { ok: true, used: 400, fresh: false }, "the same file again: charged once");
  assert.deepEqual(reserve("L2", "f1", 600), { ok: true, used: 1_000, fresh: true }, "the same id in another ledger is another file; the quota exactly");
  assert.deepEqual(reserve("L2", "f2", 1), { ok: false, error: "quota" }, "one byte more: no");
  assert.equal(account.used(), 1_000);
  assert.equal(account.release("L2", ["f1", "nope"]), 400, "a file let go: its room is back (one it never had changes nothing)");
  assert.deepEqual(reserve("L2", "f2", 500), { ok: true, used: 900, fresh: true });
  assert.deepEqual(account.storage(quota), { used: 900, quota, ledgers: [{ id: "L2", bytes: 500, count: 1 }, { id: "L1", bytes: 400, count: 1 }] }, "in all, and in each ledger, the most first");
  assert.equal(account.release("L1", ["f1"]), 500);
  assert.equal(account.release("L2", ["f2"]), 0);
  assert.deepEqual(account.storage(quota), { used: 0, quota, ledgers: [] });

  const busy = new AccountRoom(memoryAccountStore());
  for (let i = 0; i < UPLOADS_PER_DAY; i++) assert.ok(busy.reserve({ ledger: "L", id: `f${i}`, size: 1, now: NOW, day, quota }).ok);
  assert.deepEqual(busy.reserve({ ledger: "L", id: "more", size: 1, now: NOW, day, quota }), { ok: false, error: "limit" }, `${UPLOADS_PER_DAY} files in a day: no more today`);
  assert.deepEqual(busy.reserve({ ledger: "L", id: "f3", size: 1, now: NOW, day, quota }), { ok: true, used: UPLOADS_PER_DAY, fresh: false }, "one sent again is still let through");
  assert.ok(busy.reserve({ ledger: "L", id: "more", size: 1, now: NOW, day: "2026-11-15", quota }).ok, "the next day, yes");
});

test("an account's ledgers: kept with their keys, brought up to date, taken off", () => {
  const store = memoryAccountStore();
  const account = new AccountRoom(store);
  assert.deepEqual(account.list(), []);
  const first = account.keep({ id: "ledger-0001", key: "k1", owner: "o1", me: "s", now: NOW });
  assert.deepEqual(first, { ok: true, mine: { id: "ledger-0001", key: "k1", owner: "o1", me: "s", at: NOW } }, "one they started: its key, the owner's key, and who they are in it");
  account.keep({ id: "ledger-0002", key: "k2", me: "w", now: NOW + 1 });
  assert.deepEqual(account.list().map((m) => m.id), ["ledger-0002", "ledger-0001"], "the last one kept first");

  const rekeyed = account.keep({ id: "ledger-0001", key: "k1b", now: NOW + 2 });
  assert.deepEqual(rekeyed, { ok: true, mine: { id: "ledger-0001", key: "k1b", owner: "o1", me: "s", at: NOW } }, "a new key replaces the old; what wasn't said stays, and so does when it was first kept");
  assert.deepEqual(account.list().map((m) => m.id), ["ledger-0002", "ledger-0001"], "and it keeps its place");
  assert.equal(account.keep({ id: "ledger-0001", key: "k1b", owner: null, now: NOW + 3 }).ok && store.get("ledger-0001")?.owner, "o1", "a phone without the owner's key doesn't take it from the others");
  assert.deepEqual(account.keep({ id: "ledger-0001", key: "k1b", me: null, now: NOW + 3 }), { ok: true, mine: { id: "ledger-0001", key: "k1b", owner: "o1", at: NOW } }, "null takes away who they are (just looking, or taken out of it)");
  assert.equal((account.keep({ id: "ledger-0001", key: "k1b", me: "m", now: NOW + 3 }) as { mine: { me?: string } }).mine.me, "m", "and they can be someone again");

  account.drop("ledger-0002");
  account.drop("ledger-0002");
  assert.deepEqual(account.list().map((m) => m.id), ["ledger-0001"], "taken off (twice is once)");

  for (let i = account.list().length; i < MAX_MINE; i++) assert.ok(account.keep({ id: `l-${i}`, key: "k", now: NOW }).ok);
  assert.deepEqual(account.keep({ id: "one-more", key: "k", now: NOW }), { ok: false, error: "full" }, `an account keeps at most ${MAX_MINE}`);
  assert.ok(account.keep({ id: "ledger-0001", key: "k1c", now: NOW }).ok, "one already kept is still brought up to date");
});

test("an account starts at most so many ledgers a day", () => {
  const store = memoryAccountStore();
  const account = new AccountRoom(store);
  const day = (n: number) => Array.from({ length: n }, () => account.take("2026-11-14", 3));
  assert.deepEqual(day(4), [true, true, true, false], "three, and no fourth");
  assert.equal(account.take("2026-11-15", 3), true, "the next day, again");
  assert.deepEqual([...store.days.keys()], ["2026-11-15"], "the day before is forgotten");
});

const DAY = 86_400_000;
const sent = (id: string, change: Sent["change"], at = NOW): Sent => ({ id, at, change });
const edit = (entry: string, files: string[] | null): Sent["change"] => ({ do: "edit", entry, to: { payer: "s", amount: 3000, note: "", split: { how: "equal", among: ["s", "w", "m"] }, files } });

test("the files a ledger's expenses use: those on an expense still in it", () => {
  const { room } = make();
  room.push("key", [expense("e1", { files: ["a", "b"] }), expense("e2", { files: ["c"] }), expense("e3", { files: ["b"] }), expense("e4")], NOW);
  room.push("key", [sent("o1", { do: "out", entry: "e2", at: NOW + 5 }), sent("o2", { do: "out", entry: "e3", at: NOW + 6 })], NOW + 6);
  const { used, since } = usedFiles(room.snapshot()!.ledger);
  assert.deepEqual([[...used].sort(), [...since]], [["a", "b"], [["c", NOW + 5]]], "a deleted expense's photo isn't used, from when it was deleted; one on a deleted expense and a live one is used");
});

test("the nightly check: a file no expense uses is kept thirty days from when it stopped being used, then let go", () => {
  const { room, store } = make({ ownerHash: "owner" });
  const photo = (id: string): StoredFile => ({ id, size: 1_000, type: "image/jpeg", by: id === "d" ? "u2" : "u1", at: NOW });
  for (const f of ["a", "b", "c", "d"]) room.stored(photo(f));
  // a: on an expense; b: on one deleted a day later; c: taken off an expense on day 2; d: never on one
  room.push("key", [expense("e1", { files: ["a", "c"] }), expense("e2", { files: ["b"] })], NOW);
  room.push("key", [sent("o1", { do: "out", entry: "e2", at: NOW + DAY }, NOW + DAY)], NOW + DAY);
  room.push("key", [sent("x1", edit("e1", ["a"]), NOW + 2 * DAY)], NOW + 2 * DAY);
  const night = (d: number) => room.nightly(NOW + d * DAY);
  assert.deepEqual(night(3), { gone: [], left: 4 }, "the third night: nothing goes");
  assert.deepEqual([...store.marks].sort(), [["b", NOW + DAY], ["c", NOW + 3 * DAY], ["d", NOW + 3 * DAY]], "each unused one marked: the deleted expense's from when it was deleted, the others from the night they were found so");
  assert.deepEqual(night(4), { gone: [], left: 4 }, "found again, a mark keeps its time");
  assert.deepEqual(store.marks.get("c"), NOW + 3 * DAY);
  assert.deepEqual(night(UNUSED_DAYS + 1), { gone: [photo("b")], left: 3 }, `${UNUSED_DAYS} days after its expense was deleted: that photo goes, its sender with it (for the room)`);
  // c is put back on its expense (改回去) before its thirty days are up
  room.push("key", [sent("x2", edit("e1", ["a", "c"]), NOW + (UNUSED_DAYS + 2) * DAY)], NOW + (UNUSED_DAYS + 2) * DAY);
  assert.deepEqual(night(UNUSED_DAYS + 2), { gone: [], left: 3 }, "changed back: used again, it loses its mark");
  assert.deepEqual([...store.marks.keys()], ["d"]);
  assert.deepEqual(night(UNUSED_DAYS + 3), { gone: [photo("d")], left: 2 }, "never on an expense: thirty days after it was first found so");
  room.lock("owner", true, NOW + (UNUSED_DAYS + 4) * DAY);
  room.stored(photo("e"));
  assert.equal(store.kept.has("e"), false, "(locked: no new file)");
  room.lock("owner", false, NOW + (UNUSED_DAYS + 4) * DAY);
  assert.deepEqual([night(40).gone, night(100).gone], [[], []], "what is used stays, however long");
  assert.ok(room.keeps("a") && !room.keeps("b") && !room.keeps("nope"));
  const woken = new LedgerRoom(store);
  assert.deepEqual(woken.nightly(NOW + 101 * DAY), { gone: [], left: 2 }, "the same after a restart");
  woken.wipe("owner", NOW + 102 * DAY);
  assert.deepEqual([woken.nightly(NOW + 200 * DAY), store.marks.size], [{ gone: [], left: 0 }, 0], "a deleted ledger: nothing left to check");
});

test("an account's files in a ledger: how many no expense uses, cleared now (not one just stored), and all of them when the account is deleted", () => {
  const { room, store } = make();
  const photo = (id: string, by: string, at = NOW): StoredFile => ({ id, size: id.length * 100, type: "image/jpeg", by, at });
  room.stored(photo("used1", "u1"));
  room.stored(photo("loose1", "u1"));
  room.stored(photo("fresh1", "u1", NOW + 2 * DAY - SETTLING_MS + 1));
  room.stored(photo("theirs", "u2"));
  room.stored(photo("theirsLoose", "u2"));
  room.push("key", [expense("e1", { files: ["used1", "theirs"] })], NOW);
  const now = NOW + 2 * DAY;
  assert.deepEqual(room.usage("u1", now), { count: 3, bytes: 1_700, unused: { count: 1, bytes: 600 } }, "u1's three: one on an expense, one on none, one on none but stored in the last hour (it may be on its way onto one)");
  assert.deepEqual(room.usage("u2", now), { count: 2, bytes: 1_700, unused: { count: 1, bytes: 1_100 } });
  assert.deepEqual(room.usage("nobody", now), { count: 0, bytes: 0, unused: { count: 0, bytes: 0 } });
  assert.deepEqual(room.dropUnused("u1", now), [photo("loose1", "u1")], "cleared now: the one on no expense, not the one just stored, nor another account's");
  assert.deepEqual(room.dropUnused("u1", now), [], "twice is once");
  assert.deepEqual(room.filesBy("u1")?.map((f) => f.id), ["used1", "fresh1"], "what is left of u1's, as the list has it");
  assert.deepEqual(room.dropBy("u1").map((f) => f.id), ["used1", "fresh1"], "u1 deleted: every one of theirs goes, on an expense or not");
  assert.deepEqual([...store.kept.keys()], ["theirs", "theirsLoose"], "another account's stay, on an expense or not");
  const [kept] = room.snapshot()!.ledger.entries;
  assert.equal(kept.kind === "expense" ? kept.files?.join() : "", "used1,theirs", "the expense keeps both ids (its photo shows as gone)");
  room.wipe(null, now);
  assert.equal(room.snapshot()?.ledger.id, asked.id, "(only the owner deletes it: this one has none)");
  const gone = make({ ownerHash: "owner" });
  gone.room.wipe("owner", now);
  assert.deepEqual([gone.room.usage("u1", now), gone.room.filesBy("u1"), gone.room.dropUnused("u1", now), gone.room.dropBy("u1")], [null, null, [], []], "a ledger that is gone: nothing to tell, nothing to drop");
});

test("an account checked against the ledgers: charged for what they keep, and nothing kept once it is deleted", () => {
  const store = memoryAccountStore();
  const account = new AccountRoom(store);
  const quota = 10_000;
  const day = "2026-11-14";
  assert.equal(account.self(), null, "not told who it is yet");
  account.reserve({ ledger: "L1", id: "f1", size: 400, now: NOW, day, quota, account: "u1" });
  account.reserve({ ledger: "L1", id: "f2", size: 300, now: NOW, day, quota });
  account.reserve({ ledger: "L2", id: "f3", size: 200, now: NOW, day, quota });
  assert.deepEqual([account.self(), account.ledgersWithFiles()], ["u1", ["L1", "L2"]], "told with its first file; and the ledgers its files are in");
  assert.equal(account.settle("L1", [{ id: "f1", size: 400, at: NOW }, { id: "f9", size: 50, at: NOW }]), 650, "the ledger keeps f1 and an f9 it wasn't charged for, not f2: so it is charged");
  assert.deepEqual(account.storage(quota).ledgers, [{ id: "L1", bytes: 450, count: 2 }, { id: "L2", bytes: 200, count: 1 }]);
  assert.equal(account.settle("L1", [{ id: "f1", size: 410, at: NOW }, { id: "f9", size: 50, at: NOW }]), 660, "the size the ledger has is the one charged");
  assert.equal(account.settle("L2", []), 460, "a ledger that keeps none of its files (or is gone): none charged");
  assert.deepEqual(account.ledgersWithFiles(), ["L1"]);
  account.keep({ id: "L1", key: "k", now: NOW });
  account.take(day, 10);
  account.wipe();
  assert.deepEqual([account.list(), account.used(), account.self(), account.ledgersWithFiles(), store.days.size, store.sent.size], [[], 0, null, [], 0, 0], "deleted: its ledgers, its room, its days, who it is, all gone");
});

const steve = { id: "usteve", name: "Steve", av: 2, ac: 4 };
const invitation = (ledger: string, at = NOW, more: Partial<Invite> = {}): Invite => ({ ledger, key: `key-${ledger}`, name: "周末", from: steve, at, ...more });

test("an invitation from a friend: waits in their account, once, until they keep the ledger or say no", () => {
  const store = memoryAccountStore();
  const amy = new AccountRoom(store);
  assert.deepEqual(amy.invites(NOW), [], "nothing waiting");
  assert.equal(amy.invited(invitation("L1", NOW, { member: "m" }), NOW), "sent");
  assert.deepEqual(amy.invites(NOW), [invitation("L1", NOW, { member: "m" })], "as it was sent: the ledger, its key and name, who sent it, and who in it they are");
  assert.equal(amy.invited(invitation("L1", NOW + 5), NOW + 5), "again", "the same one again (from anyone): nothing new");
  assert.equal(amy.invites(NOW + 5)[0].at, NOW, "and the one waiting is as it was");
  assert.equal(amy.invited(invitation("L1", NOW + 6, { key: "key-L1-new" }), NOW + 6), "sent", "with another key (the owner changed it): it takes the place of the old one");
  assert.deepEqual(amy.invites(NOW + 6).map((i) => [i.ledger, i.key]), [["L1", "key-L1-new"]]);
  amy.invited(invitation("L2", NOW + 7), NOW + 7);
  assert.deepEqual(amy.invites(NOW + 7).map((i) => i.ledger), ["L2", "L1"], "the newest first");

  amy.keep({ id: "L1", key: "key-L1-new", now: NOW + 8 });
  assert.deepEqual(amy.invites(NOW + 8).map((i) => i.ledger), ["L2"], "keeping the ledger uses the invitation up");
  assert.equal(amy.invited(invitation("L1", NOW + 9), NOW + 9), "in", "inviting someone to a ledger of theirs: nothing kept");
  assert.deepEqual(amy.invites(NOW + 9).map((i) => i.ledger), ["L2"]);
  amy.uninvite("L2");
  amy.uninvite("L2");
  assert.deepEqual(amy.invites(NOW + 9), [], "said no to (twice is once)");
});

test("invitations wait thirty days, at most thirty of them; an account sends so many a day; and all of it goes with the account", () => {
  const store = memoryAccountStore();
  const amy = new AccountRoom(store);
  amy.invited(invitation("old", NOW), NOW);
  amy.invited(invitation("newer", NOW + DAY), NOW + DAY);
  assert.deepEqual(amy.invites(NOW + INVITE_DAYS * DAY - 1).map((i) => i.ledger), ["newer", "old"], "a moment short of thirty days: still there");
  assert.deepEqual(amy.invites(NOW + INVITE_DAYS * DAY).map((i) => i.ledger), ["newer"], "thirty days on: gone");
  assert.deepEqual(store.invites().map((i) => i.ledger), ["newer"], "and not only out of sight");

  for (let i = 0; i < MAX_INVITES + 3; i++) amy.invited(invitation(`L${i}`, NOW + 2 * DAY + i), NOW + 2 * DAY + i);
  const left = amy.invites(NOW + 3 * DAY).map((i) => i.ledger);
  assert.equal(left.length, MAX_INVITES, `at most ${MAX_INVITES} wait`);
  assert.deepEqual([left[0], left.at(-1), left.includes("newer")], [`L${MAX_INVITES + 2}`, "L3", false], "a new one past them pushes the oldest out");

  const day = (n: number) => Array.from({ length: n }, () => amy.mayInvite("2026-11-14", 3));
  assert.deepEqual(day(4), [true, true, true, false], "three a day, and no fourth");
  assert.equal(amy.mayInvite("2026-11-15", 3), true, "the next day, again");
  assert.deepEqual([...store.asked.keys()], ["2026-11-15"], "the day before is forgotten");

  amy.wipe();
  assert.deepEqual([store.invites(), store.asked.size], [[], 0], "deleted: the invitations waiting for it, and its day, gone too");
});

test("an account has so many receipts read a day", () => {
  const store = memoryAccountStore();
  const account = new AccountRoom(store);
  const day = (n: number) => Array.from({ length: n }, () => account.mayRead("2026-11-14", 3));
  assert.deepEqual(day(4), [true, true, true, false], "three, and no fourth");
  assert.equal(account.mayRead("2026-11-15", 3), true, "the next day, again");
  assert.deepEqual([...store.read.keys()], ["2026-11-15"], "the day before is forgotten");
  account.wipe();
  assert.equal(store.read.size, 0, "and it goes with the account");
});

/** What Google's model answers, saying `said` (as its JSON text) and what it used. */
const answered = (said: unknown, use: Record<string, number> = {}) => ({ candidates: [{ content: { parts: [{ text: typeof said === "string" ? said : JSON.stringify(said) }] } }], usageMetadata: use });

test("reading a receipt: what is asked, what is taken from the answer, and what it cost", () => {
  const asked = readRequest("QUJD", "image/jpeg", "CAD", true) as { contents: { parts: Record<string, unknown>[] }[]; generationConfig: Record<string, unknown> };
  const parts = asked.contents[0].parts;
  assert.deepEqual(parts[1], { inline_data: { mime_type: "image/jpeg", data: "QUJD" } }, "the photo goes as itself, with its type");
  assert.ok(String(parts[0].text).includes('A bare "$" is CAD'), "and the words say what a bare $ is: the ledger's currency");
  assert.equal(asked.generationConfig.responseMimeType, "application/json", "the answer is JSON");
  assert.deepEqual((asked.generationConfig.responseSchema as { required: string[] }).required, ["receipt"], "in the shape it is given");
  assert.deepEqual(asked.generationConfig.thinkingConfig, { thinkingLevel: "minimal" }, "thinking as little as the model will");
  assert.equal((readRequest("QUJD", "application/pdf", "JPY", false) as { generationConfig: Record<string, unknown> }).generationConfig.thinkingConfig, undefined, "and asked again without it, for a model that doesn't take that");

  const read = (said: unknown, currency = "CAD") => readAnswer(answered(said), currency);
  assert.deepEqual(read({ receipt: true, total: "42.50", currency: "CAD", merchant: "Tim Hortons" }), { total: "42.50", currency: "CAD", merchant: "Tim Hortons", tip: null, tax: null, date: null, place: null, payment: null });
  assert.deepEqual(read({ receipt: true, total: "$1,234.5", currency: "usd", merchant: "  Costco\nWholesale  " }), { total: "1234.50", currency: "USD", merchant: "Costco Wholesale", tip: null, tax: null, date: null, place: null, payment: null }, "a sign, a thousands separator, one decimal, a code in small letters, a name on two lines: all made plain");
  assert.deepEqual(read({ receipt: true, total: "3,200", currency: "JPY", merchant: null }), { total: "3200", currency: "JPY", merchant: null, tip: null, tax: null, date: null, place: null, payment: null }, "yen, which has no cents");
  assert.deepEqual(read({ receipt: true, total: "12.5", currency: "THB" }), { total: "12.50", currency: null, merchant: null, tip: null, tax: null, date: null, place: null, payment: null }, "a currency no ledger can be in: none said");
  assert.equal(read({ receipt: true, total: "12.50", currency: "KRW" }), null, "cents in a currency without them: no total");
  assert.equal(read({ receipt: false, total: "12.00" }), null, "not a receipt, whatever else it says");
  assert.equal(read({ receipt: true, total: null }), null, "no total on it");
  for (const total of ["0", "0.00", "-5", "12.345", "abc", "123456789.00", ""]) assert.equal(read({ receipt: true, total }), null, `no total: ${JSON.stringify(total)}`);
  assert.equal(read("not json"), null, "an answer that isn't JSON");
  const shop = (x: Record<string, unknown>) => read({ receipt: true, total: "20.00", currency: "CAD", ...x });
  // the time printed, to tell an itemized receipt and its card slip apart (Steve, 2026-11-21): only when read
  assert.deepEqual(["21:01:11", "9:05", " 21:04 ", "24:00", "21:61", "9pm", "", null].map((time) => shop({ time })?.time), ["21:01", "09:05", "21:04", undefined, undefined, undefined, undefined, undefined], "a time of day the clock has, seconds dropped; none otherwise");
  assert.ok(!("time" in (shop({}) ?? {})), "none read: the reading says nothing of it (as one from before it)");
  assert.deepEqual(shop({ merchant: "McDonald's", place: " Aldergrove,\n BC ", payment: "Mastercard" }), { total: "20.00", currency: "CAD", merchant: "McDonald's", tip: null, tax: null, date: null, place: "Aldergrove, BC", payment: "Mastercard" }, "the business, the place and what paid, each made one plain line");
  for (const [said, kept] of [
    ["Mastercard ****1234", "Mastercard"],
    ["VISA XXXXXXXXXXXX4417", "VISA"],
    ["Interac debit 5412-xxxx-xxxx-0027", "Interac debit"],
    ["**** **** **** 9921", null],
    ["4417", null],
    ["Cash", "Cash"],
    [12, null],
  ] as const) assert.equal(shop({ payment: said })?.payment, kept, `what paid, never any of a card's number: ${JSON.stringify(said)} → ${JSON.stringify(kept)}`);
  assert.equal(shop({ place: "x".repeat(60) })?.place?.length, 40, "a place as long as a note, at most");
  assert.deepEqual([shop({ place: "  " })?.place, shop({ merchant: "" })?.merchant], [null, null], "nothing in them: none");
  assert.equal(readAnswer({ candidates: [] }, "CAD"), null, "no answer at all");
  assert.equal(readAnswer(null, "CAD"), null);
  assert.equal(read({ receipt: true, total: "9.99", merchant: "x".repeat(80) })?.merchant?.length, 40, "a long name, cut short");

  // the tip and tax in the total: written like it, no more than it, and both none when together they come to more
  const extras = (tip: unknown, tax: unknown, total = "123.00", currency = "CAD") => {
    // (the ledger's in dollars: a receipt that says yen is read in yen)
    const got = read({ receipt: true, total, currency, merchant: "Joe's", tip, tax }, "CAD");
    return got && [got.tip, got.tax];
  };
  assert.deepEqual(extras("18.00", "5.25"), ["18.00", "5.25"], "a tip and tax read as the total is");
  assert.deepEqual(extras("$18", "5.5"), ["18", "5.50"], "a sign dropped, one decimal written with two");
  assert.deepEqual(extras(null, "5.25"), [null, "5.25"], "no tip on it");
  assert.deepEqual(extras("0", "0.00"), [null, null], "a tip and tax of nothing are none");
  assert.deepEqual(extras("-2.00", "(1.00)"), [null, null], "money back is no tip or tax");
  assert.deepEqual(extras("124.00", "5.25"), [null, "5.25"], "a tip bigger than the total is a misreading: that one goes");
  assert.deepEqual(extras("100.00", "30.00"), [null, null], "a tip and tax that come to more than the total: both go");
  assert.deepEqual(extras("100.00", "23.00"), ["100.00", "23.00"], "ones that come to all of it stay");
  assert.deepEqual(extras("abc", 7), [null, null], "a tip that isn't a sum, a tax that isn't text: none");
  assert.deepEqual(extras("1,000", "80", "3200", "JPY"), ["1000", "80"], "yen: whole yen, as the total");
  assert.deepEqual(extras("10.50", "80", "3200", "JPY"), [null, "80"], "a tip in yen with cents: none");
  assert.equal(read({ receipt: true, total: "9.99" })?.tip, null, "an answer that doesn't mention them: none");
  assert.ok(String(asked.contents[0].parts[0].text).includes("suggested tip"), "and the words say a suggested tip is no tip");
  assert.deepEqual(Object.keys((asked.generationConfig.responseSchema as { properties: Record<string, unknown> }).properties), ["receipt", "total", "currency", "merchant", "tip", "tax", "date", "place", "payment", "time", "category"], "they are asked for in the shape given");
  // its kind (2026-11-26): one of the seven, asked for by name, and kept only when it is one
  assert.deepEqual((asked.generationConfig.responseSchema as { properties: Record<string, { enum?: string[] }> }).properties.category.enum, ["food", "groceries", "transport", "lodging", "fun", "shopping", "other"], "the kinds are the only answers it may give");
  assert.ok(String(asked.contents[0].parts[0].text).includes("what kind of spending"), "and the words say what each kind takes in");
  assert.deepEqual(["food", "lodging", "Food", "restaurant", "", null, 3].map((category) => shop({ category })?.category), ["food", "lodging", undefined, undefined, undefined, undefined, undefined], "a kind there is: kept; anything else: none");
  assert.ok(!("category" in (shop({}) ?? {})), "none read: the reading says nothing of it (as one from before it)");

  // the day it was spent: one the calendar has, from 2000, no later than tomorrow
  const noon = Date.UTC(2026, 10, 15, 12);
  const day = (date: unknown) => readAnswer(answered({ receipt: true, total: "9.99", date }), "CAD", noon)?.date;
  assert.equal(day("2026-11-12"), "2026-11-12", "the day on the receipt");
  assert.equal(day(" 2026-11-12 "), "2026-11-12", "spaces around it dropped");
  assert.equal(day("2026-11-16"), "2026-11-16", "tomorrow (it is somewhere already)");
  for (const bad of ["2026-11-17", "2026-02-30", "2026-13-01", "1999-12-31", "26-11-12", "2026/11/12", "Nov 12, 2026", 20261112, null, ""]) assert.equal(day(bad), null, `${JSON.stringify(bad)}: no day`);
  assert.ok(String(asked.contents[0].parts[0].text).includes("YYYY-MM-DD"), "and the words ask for it written so");

  assert.equal(costOf(answered({}, { promptTokenCount: 1500, candidatesTokenCount: 60, thoughtsTokenCount: 40 }), READ_MODELS[0].model), Math.ceil(1500 * 0.25 + 100 * 1.5), "what went in, and what came out with the thinking, at the model's prices: millionths of a dollar");
  assert.equal(costOf({ usageMetadata: { promptTokenCount: 1000 } }, "gemini-3.5-flash-lite"), 300, "another model, its prices");
  assert.equal(costOf(null, READ_MODELS[0].model), 0, "nothing said: nothing counted");

  const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7) % 256);
  assert.equal(Buffer.from(base64(bytes), "base64").equals(Buffer.from(bytes)), true, "a photo bigger than one piece, as base64 and back, is itself");
  assert.equal(monthOf(Date.UTC(2026, 10, 30, 23, 59)), "2026-11");
  const fake = (text: string) => fakeRead(new TextEncoder().encode(`\xff\xd8\xff ${text}`), "CAD");
  assert.deepEqual(fake("receipt:42.50 CAD Test Café"), { ok: true, read: { total: "42.50", currency: "CAD", merchant: "Test Café", tip: null, tax: null, date: null, place: null, payment: null }, cost: 400 }, "the stand-in for Google reads what the file says");
  assert.deepEqual(fake("receipt:none"), { ok: true, read: null, cost: 400 }, "and a file that says it is no receipt is none");
  const dated = fake("receipt:123.00 CAD Joe's Diner tip=18.00 tax=5.25 date=2026-11-12");
  assert.deepEqual([dated.ok && dated.read?.date, dated.ok && dated.read?.merchant], ["2026-11-12", "Joe's Diner"], "and a day, out of the shop's name");
  const timed = fake("receipt:45.30 CAD DEER GARDEN SIGNATURE tip=4.85 time=21:04 date=2026-10-15");
  assert.deepEqual(timed.ok && [timed.read?.merchant, timed.read?.time, timed.read?.tip], ["DEER GARDEN SIGNATURE", "21:04", "4.85"], "and a time, out of the shop's name");
  const placed = fake("receipt:20.00 CAD McDonald's place=Aldergrove,_BC paid=Mastercard tax=1.38");
  assert.deepEqual(placed.ok && [placed.read?.merchant, placed.read?.place, placed.read?.payment, placed.read?.tax], ["McDonald's", "Aldergrove, BC", "Mastercard", "1.38"], "and a place and what paid (a _ for a space), out of the shop's name");
  assert.deepEqual(fake("receipt:123.00 CAD Joe's Diner tip=18.00 tax=5.25"), { ok: true, read: { total: "123.00", currency: "CAD", merchant: "Joe's Diner", tip: "18.00", tax: "5.25", date: null, place: null, payment: null }, cost: 400 }, "the stand-in reads a tip and tax the file says, after the shop");
  const kinded = fake("receipt:58.00 CAD Petro-Canada kind=transport paid=Visa");
  assert.deepEqual(kinded.ok && [kinded.read?.merchant, kinded.read?.category, kinded.read?.payment], ["Petro-Canada", "transport", "Visa"], "and a kind, out of the shop's name");
});

test("the night: in the small hours on the coast, a minute of its own for each, never the minute it is now", () => {
  const at = (s: string) => Date.parse(s);
  const night = nextNight("ledger-0001", at("2026-11-14T23:00:00Z"));
  assert.equal(new Date(night).toISOString().slice(0, 13), "2026-11-15T10", "after the night's hour: the next day's, at 10:00 UTC (2 a.m. in Vancouver)");
  assert.equal(nextNight("ledger-0001", at("2026-11-14T03:00:00Z")), night - DAY, "before it: that day's");
  assert.equal(nextNight("ledger-0001", night), night + DAY, "at the minute itself: the next day's");
  assert.equal(nextNight("ledger-0001", night - 30_000), night + DAY, "half a minute before it: the next day's too");
  const minutes = new Set(Array.from({ length: 50 }, (_, i) => new Date(nextNight(`ledger-${i}`, at("2026-11-14T23:00:00Z"))).getUTCMinutes()));
  assert.ok(minutes.size > 20, `fifty ledgers wake at ${minutes.size} different minutes of the hour`);
});
