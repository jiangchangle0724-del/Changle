// One ledger's room: who may open it, that changes are taken in order and once, the record of
// them, that it all survives a restart, and that its owner can delete it. Then one account's list
// of ledgers. (What a change does is tested with the phone's own rules:
// site/tests/split-changes.test.ts.)
import assert from "node:assert/strict";
import test from "node:test";
import type { Sent } from "../../../site/src/split/changes";
import type { Expense } from "../../../site/src/split/core";
import { AccountRoom, MAX_MINE, memoryAccountStore } from "../src/room/account";
import { LedgerRoom, MAX_BATCH, MAX_SENT, memoryStore } from "../src/room/ledger";

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

  assert.deepEqual(room.wipe("owner", NOW + 3), { ok: true }, "the owner deletes it, locked or not");
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
