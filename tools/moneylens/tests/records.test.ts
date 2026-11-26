// What is inside a chunk, and merging two copies of one (VAULT-4). Every value here is invented.
import assert from "node:assert/strict";
import { test } from "node:test";
import { newId } from "../src/core/ids";
import { MAX_CHUNK_BYTES } from "../src/vault/crypto";
import { MAX_ENTRY_BYTES, canonical, decode, differs, encode, entryOf, isJson, merge3, mergeMany, openContent, sealContent, type Content, type Entry, type Json, type Records, type Value } from "../src/vault/records";
import { seeded } from "./seeded";
import { idOf, testVault } from "./vaulthelp";

const entry = (kind: string, at: number, value: Value): Entry => {
  const made = entryOf(kind, at, value);
  assert.ok(made, "the test's own record must be one that can be kept");
  return made;
};

const records = (...entries: Entry[]): Map<string, Entry> => new Map(entries.map((e) => [e.value.id, e]));

/** Records as plain data, to compare two sets whatever order they are in. */
const plain = (set: Records): Record<string, string> => Object.fromEntries([...set].map(([id, e]) => [id, `${e.kind} ${e.at} ${canonical(e.value)}`]).sort());
const plainNoTime = (set: Records): Record<string, string> => Object.fromEntries([...set].map(([id, e]) => [id, `${e.kind} ${canonical(e.value)}`]).sort());

const content = (set: Records, group = "book"): Content => {
  const rev = idOf(900001);
  return { group, n: 2, rev, history: [rev, idOf(900002)], records: set };
};

test("a chunk's contents come back as they went in", () => {
  const set = records(
    entry("txn", 1795000000000, { id: idOf(1), account: idOf(50), posted: "2026-10-03", amount: -1234, description: "CAFE 老王面馆 #12", splits: [{ category: "dining", amount: -1000 }, { category: null, amount: -234 }] }),
    entry("account", 5, { id: idOf(2), name: "Chequing ‘main’", closed: false, nested: { a: [1, 2, { b: null }] } }),
    entry("rule", 0, { id: idOf(3) }),
  );
  const bytes = encode(content(set, "t/" + idOf(50)));
  const back = decode(bytes);
  assert.ok(back.ok);
  assert.equal(back.content.group, "t/" + idOf(50));
  assert.deepEqual(back.content.history, [idOf(900001), idOf(900002)]);
  assert.deepEqual(plain(back.content.records), plain(set));
  // what a record is said to take is what it takes: the records' sizes add up to the chunk, give or take its heading
  const sizes = [...set.values()].reduce((sum, e) => sum + e.size, 0);
  assert.ok(bytes.length >= sizes - 1 && bytes.length <= sizes + 200, `${bytes.length} bytes for records said to take ${sizes}`);
  // and what comes back cannot be changed in place
  const first = back.content.records.get(idOf(1))!;
  assert.throws(() => ((first.value as unknown as { amount: number }).amount = 1), TypeError);
  assert.throws(() => (first.value.splits as Json[]).push(null), TypeError);
});

test("what is not a chunk's contents is refused, and a later version is told apart", () => {
  const rev = idOf(7);
  const good = { v: 1, group: "book", n: 1, rev, history: [rev], records: { [idOf(1)]: { k: "txn", t: 5, d: { amount: 1 } } } };
  const bytes = (x: unknown) => new TextEncoder().encode(typeof x === "string" ? x : JSON.stringify(x));
  assert.ok(decode(bytes(good)).ok);
  assert.ok(decode(bytes({ ...good, n: 40, history: [rev, ...Array.from({ length: 15 }, (_, i) => idOf(100 + i))] })).ok);
  assert.deepEqual(decode(bytes({ ...good, v: 2, anything: "at all" })), { ok: false, why: "newer" });
  const bad: unknown[] = [
    "",
    "not json",
    "[]",
    "null",
    { ...good, v: 0 },
    { ...good, v: 1.5 },
    { ...good, v: "1" },
    { ...good, extra: 1 },
    { ...good, group: "" },
    { ...good, group: "x".repeat(65) },
    { ...good, group: 7 },
    { ...good, rev: "short" },
    { ...good, history: [] },
    { ...good, history: [idOf(8)] },
    { ...good, history: [rev, rev] },
    { ...good, history: [rev, "nope"] },
    { ...good, n: 40, history: [rev, ...Array.from({ length: 16 }, (_, i) => idOf(100 + i))] },
    { ...good, n: 0 },
    { ...good, n: 1.5 },
    { ...good, n: "1" },
    // the history is as long as the chunk is old: a second version that names no first, a first that names a second
    { ...good, n: 2 },
    { ...good, n: 1, history: [rev, idOf(8)] },
    { ...good, n: 17, history: [rev, ...Array.from({ length: 14 }, (_, i) => idOf(100 + i))] },
    { ...good, records: [] },
    { ...good, records: { nope: { k: "txn", t: 5, d: {} } } },
    { ...good, records: { [idOf(1)]: { k: "Txn", t: 5, d: {} } } },
    { ...good, records: { [idOf(1)]: { k: "txn", t: -1, d: {} } } },
    { ...good, records: { [idOf(1)]: { k: "txn", t: 1.5, d: {} } } },
    { ...good, records: { [idOf(1)]: { k: "txn", t: 5, d: [] } } },
    { ...good, records: { [idOf(1)]: { k: "txn", t: 5, d: { id: idOf(2) } } } },
    { ...good, records: { [idOf(1)]: { k: "txn", t: 5, d: {}, more: 1 } } },
    { ...good, records: { [idOf(1)]: { k: "txn", t: 5 } } },
    { ...good, records: { [idOf(1)]: { k: "txn", t: 5, d: { note: "x".repeat(MAX_ENTRY_BYTES) } } } },
    `{"v":1,"group":"book","n":1,"rev":"${rev}","history":["${rev}"],"records":{"${idOf(1)}":{"k":"txn","t":5,"d":{"__proto__":{"polluted":true}}}}}`,
  ];
  for (const x of bad) assert.deepEqual(decode(bytes(x)), { ok: false, why: "malformed" }, typeof x === "string" ? x : JSON.stringify(x).slice(0, 120));
  assert.deepEqual(decode(new Uint8Array([0xff, 0xfe, 0x7b])), { ok: false, why: "malformed" });
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("a record that JSON would change, or that is too large, cannot be kept", () => {
  const id = idOf(1);
  assert.ok(entryOf("txn", 1, { id, note: "fine" }));
  for (const value of [{ id, a: undefined }, { id, a: Number.NaN }, { id, a: Infinity }, { id, a: () => 1 }, { id, a: new Date(0) }, { id, a: [1, , 3] }, { id, a: 10n }, { id: "nope" }, { id, a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }]) {
    assert.equal(entryOf("txn", 1, value as unknown as Value), null, String(Object.values(value)[1]));
  }
  assert.equal(entryOf("Txn", 1, { id }), null);
  assert.equal(entryOf("txn", -1, { id }), null);
  assert.equal(entryOf("txn", 1.5, { id }), null);
  assert.equal(isJson(JSON.parse('{"__proto__": 1}')), false);
  // the limit is on what the record takes in the chunk, to the byte
  const room = MAX_ENTRY_BYTES - entryOf("txn", 1, { id, note: "" })!.size;
  assert.equal(entryOf("txn", 1, { id, note: "x".repeat(room) })!.size, MAX_ENTRY_BYTES);
  assert.equal(entryOf("txn", 1, { id, note: "x".repeat(room + 1) }), null);
  assert.equal(entryOf("txn", 1, { id, note: "面".repeat(Math.floor(room / 3) + 1) }), null);
  // the caller's own object is not the one kept
  const mine = { id, list: [1, 2] };
  const kept = entryOf("txn", 1, mine)!;
  mine.list.push(3);
  assert.deepEqual(kept.value.list, [1, 2]);
});

test("a chunk opens under its own id and vault, and nowhere else", async () => {
  const vault = await testVault();
  const other = await testVault();
  const id = newId();
  const set = records(entry("txn", 1, { id: idOf(1), description: "MARKER-ROSEWOOD" }));
  const blob = await sealContent(vault, id, content(set));
  assert.ok(blob);
  assert.equal(Buffer.from(blob).includes("MARKER-ROSEWOOD"), false);
  const back = await openContent(vault, id, blob);
  assert.ok(back.ok);
  assert.deepEqual(plain(back.content.records), plain(set));
  assert.deepEqual(await openContent(vault, newId(), blob), { ok: false, why: "unreadable" });
  assert.deepEqual(await openContent(other, id, blob), { ok: false, why: "unreadable" });
  for (const at of [1, 13, blob.length - 1]) {
    const changed = blob.slice();
    changed[at] = changed[at]! ^ 1;
    assert.deepEqual(await openContent(vault, id, changed), { ok: false, why: "unreadable" });
  }
  assert.deepEqual(await openContent(vault, id, blob.subarray(0, blob.length - 1)), { ok: false, why: "unreadable" });
  // a blob that says it is from a later version: said so, and still not used
  const later = blob.slice();
  later[0] = 2;
  assert.deepEqual(await openContent(vault, id, later), { ok: false, why: "newer" });
  // too large for one chunk: not sealed at all
  const many = records(...Array.from({ length: 300 }, (_, i) => entry("txn", 1, { id: idOf(i + 10), note: "n".repeat(3900) })));
  assert.ok(encode(content(many)).length > MAX_CHUNK_BYTES);
  assert.equal(await sealContent(vault, id, content(many)), null);
});

test("merging: what each side changed is kept", () => {
  const a = idOf(1);
  const b = idOf(2);
  const c = idOf(3);
  const d = idOf(4);
  const base = records(entry("txn", 10, { id: a, category: "x", note: "n" }), entry("txn", 10, { id: b, amount: 5 }), entry("txn", 10, { id: c, amount: 7 }));
  // here: changes a's category, removes b, adds d. there: changes a's note, changes c.
  const here = records(entry("txn", 20, { id: a, category: "y", note: "n" }), base.get(c)!, entry("txn", 21, { id: d, amount: 9 }));
  const there = records(entry("txn", 30, { id: a, category: "x", note: "m" }), base.get(b)!, entry("txn", 31, { id: c, amount: 8 }));
  const merged = merge3(base, here, there);
  assert.deepEqual(plain(merged.records), plain(records(entry("txn", 30, { id: a, category: "y", note: "m" }), entry("txn", 31, { id: c, amount: 8 }), entry("txn", 21, { id: d, amount: 9 }))));
  assert.deepEqual(merged.clashes, []);
  assert.equal(merged.ahead, true);
  // the other device, merging the same two copies, gets the same records
  assert.deepEqual(plain(merge3(base, there, here).records), plain(merged.records));
});

test("merging: nothing to send when this side changed nothing", () => {
  const a = idOf(1);
  const base = records(entry("txn", 10, { id: a, n: 1 }));
  const there = records(entry("txn", 20, { id: a, n: 2 }), entry("txn", 20, { id: idOf(2), n: 3 }));
  const merged = merge3(base, base, there);
  assert.equal(merged.ahead, false);
  assert.deepEqual(plain(merged.records), plain(there));
  // and a change that was undone is no change, whatever the clock says
  const undone = records(entry("txn", 99, { id: a, n: 1 }));
  assert.equal(differs(undone, base), false);
  assert.equal(merge3(base, undone, there).ahead, false);
});

test("merging: the same field changed on both sides goes to the later change, and is reported", () => {
  const a = idOf(1);
  const base = records(entry("txn", 10, { id: a, category: "x", note: "n", keep: 1 }));
  const here = records(entry("txn", 50, { id: a, category: "here", note: "n", keep: 1, mine: true }));
  const there = records(entry("txn", 40, { id: a, category: "there", note: "theirs", keep: 1 }));
  const merged = merge3(base, here, there);
  assert.deepEqual(plain(merged.records), plain(records(entry("txn", 50, { id: a, category: "here", note: "theirs", keep: 1, mine: true }))));
  assert.deepEqual(merged.clashes, [{ id: a, what: "fields", fields: ["category"], winner: "here" }]);
  const other = merge3(base, there, here);
  assert.deepEqual(plain(other.records), plain(merged.records));
  assert.deepEqual(other.clashes, [{ id: a, what: "fields", fields: ["category"], winner: "there" }]);
  // on the same millisecond both devices still pick the same one
  const tie1 = records(entry("txn", 40, { id: a, category: "p" }));
  const tie2 = records(entry("txn", 40, { id: a, category: "q" }));
  assert.deepEqual(plain(merge3(base, tie1, tie2).records), plain(merge3(base, tie2, tie1).records));
  // a field taken out on one side and changed on the other is a clash like any other
  const gone = records(entry("txn", 60, { id: a, category: "x", keep: 1 }));
  const kept = merge3(base, gone, there);
  assert.equal(Object.hasOwn(kept.records.get(a)!.value, "note"), false);
  assert.deepEqual(kept.clashes, [{ id: a, what: "fields", fields: ["note"], winner: "here" }]);
});

test("merging: a record removed on one side stays removed", () => {
  const a = idOf(1);
  const b = idOf(2);
  const base = records(entry("txn", 10, { id: a, n: 1 }), entry("txn", 10, { id: b, n: 1 }));
  const here = records(entry("txn", 90, { id: a, n: 2 }));
  const there = records(entry("txn", 20, { id: b, n: 3 }));
  const merged = merge3(base, here, there);
  assert.deepEqual(plain(merged.records), {});
  assert.deepEqual(merged.clashes, [
    { id: b, what: "removed-here" },
    { id: a, what: "removed-there" },
  ]);
  assert.equal(merged.ahead, true); // b is still to be removed there
  assert.deepEqual(plain(merge3(base, there, here).records), {});
  // removed on both sides: gone, and nothing to say
  assert.deepEqual(merge3(base, records(), records()), { records: new Map(), ahead: false, clashes: [] });
});

test("merging: without a common start, everything on either side is kept", () => {
  const a = idOf(1);
  const here = records(entry("txn", 10, { id: a, n: 1, x: 1 }), entry("txn", 10, { id: idOf(2), n: 1 }));
  const there = records(entry("txn", 20, { id: a, n: 2, y: 1 }), entry("txn", 20, { id: idOf(3), n: 1 }));
  const merged = merge3(undefined, here, there);
  assert.deepEqual(Object.keys(plain(merged.records)).sort(), [a, idOf(2), idOf(3)].sort());
  assert.deepEqual(merged.records.get(a)!.value, { id: a, n: 2, y: 1, x: 1 });
});

test("merging: the same change on both sides keeps the later time, whoever merges; and a kind both changed is a clash", () => {
  const a = idOf(1);
  const base = records(entry("txn", 10, { id: a, n: 1 }));
  const here = records(entry("txn", 50, { id: a, n: 2 }));
  const there = records(entry("txn", 40, { id: a, n: 2 }));
  assert.deepEqual(plain(merge3(base, here, there).records), plain(here));
  assert.deepEqual(plain(merge3(base, there, here).records), plain(here));
  assert.equal(merge3(base, here, there).ahead, false, "a time alone is nothing to send");
  // the kind is one more field: one side changing it is kept, both changing it differently is settled by the later and reported
  const renamed = records(entry("rule", 60, { id: a, n: 1 }));
  assert.deepEqual(merge3(base, renamed, there).clashes, []);
  assert.equal(merge3(base, renamed, there).records.get(a)!.kind, "rule");
  const other = records(entry("alias", 70, { id: a, n: 1 }));
  const fought = merge3(base, renamed, other);
  assert.equal(fought.records.get(a)!.kind, "alias");
  assert.deepEqual(fought.clashes, [{ id: a, what: "kind", winner: "there" }]);
  assert.deepEqual(merge3(base, other, renamed).clashes, [{ id: a, what: "kind", winner: "here" }]);
});

test("several copies of one record: each field from the latest copy that has it, whatever order they come in", () => {
  const a = idOf(1);
  const show = (e: Entry) => `${e.kind} ${e.at} ${canonical(e.value)}`;
  // the reviewer's case (finding 8): the copy with the unrelated field is the latest, and must not carry the old x past the new one
  const old = entry("txn", 100, { id: a, x: "old" });
  const unrelated = entry("txn", 300, { id: a, y: "unrelated" });
  const fresh = entry("txn", 200, { id: a, x: "new" });
  for (const order of [[old, unrelated, fresh], [fresh, old, unrelated], [unrelated, fresh, old], [unrelated, old, fresh]]) {
    assert.equal(show(mergeMany(order)), show(entry("txn", 300, { id: a, x: "new", y: "unrelated" })));
  }
  // one copy is itself; copies that say the same are that, with the latest time; the kind is the latest copy's
  assert.equal(show(mergeMany([old])), show(old));
  assert.equal(show(mergeMany([entry("txn", 5, { id: a, n: 1 }), entry("txn", 9, { id: a, n: 1 })])), show(entry("txn", 9, { id: a, n: 1 })));
  assert.equal(mergeMany([entry("rule", 5, { id: a }), entry("txn", 9, { id: a }), entry("alias", 7, { id: a })]).kind, "txn");
  // a field that only an older copy has is kept; one that a later copy has taken out is not known to be taken out, and stays
  assert.deepEqual(mergeMany([entry("txn", 9, { id: a, kept: 1 }), entry("txn", 5, { id: a, kept: 0, only: "older" })]).value, { id: a, kept: 1, only: "older" });
  // on the same millisecond the greater text is the later, so the order still does not matter
  const [p, q] = [entry("txn", 7, { id: a, x: "p" }), entry("txn", 7, { id: a, x: "q" })];
  assert.equal(show(mergeMany([p, q])), show(mergeMany([q, p])));
  assert.equal(mergeMany([p, q]).value.x, "q");
  // too large when put together: the latest copy as it is
  const left = entry("txn", 20, { id: a, left: "l".repeat(2500) });
  const right = entry("txn", 30, { id: a, right: "r".repeat(2500) });
  assert.equal(mergeMany([left, right]), right);
  assert.equal(mergeMany([right, left]), right);

  // five hundred random sets of copies, each in several orders, against the rule worked out the slow way
  const random = seeded(8_11);
  const pick = (n: number) => Math.floor(random() * n);
  const names = ["a", "b", "c", "d", "e"];
  for (let round = 0; round < 500; round++) {
    const copies = Array.from({ length: 2 + pick(4) }, () => entry(["txn", "rule"][pick(2)]!, 100 + pick(4), { id: a, ...Object.fromEntries(names.filter(() => pick(2)).map((n) => [n, pick(3)])) }));
    const text = (e: Entry) => `${e.kind} ${canonical(e.value)}`;
    const isLater = (x: Entry, y: Entry) => (x.at !== y.at ? x.at > y.at : text(x) > text(y));
    const latestOf = (set: Entry[]) => set.reduce((best, e) => (isLater(e, best) ? e : best));
    const want: { [name: string]: Json } = { id: a };
    for (const name of names) {
      const having = copies.filter((copy) => Object.hasOwn(copy.value, name));
      if (having.length) want[name] = latestOf(having).value[name]!;
    }
    const top = latestOf(copies);
    const expected = `${top.kind} ${top.at} ${canonical(want as Value)}`;
    for (let turn = 0; turn < 4; turn++) {
      const shuffled = [...copies].sort(() => random() - 0.5);
      assert.equal(show(mergeMany(shuffled)), expected, `round ${round}`);
    }
    // And merging what is already merged with an older copy changes nothing. (With a copy of the very same millisecond it
    // can: the merged record has one time for all its fields, and the tie is then between two other texts. Assessment, section 2.)
    const merged = mergeMany(copies);
    const older = copies.filter((copy) => copy.at < merged.at);
    if (older.length) assert.equal(show(mergeMany([merged, older[pick(older.length)]!, merged])), expected, `round ${round}`);
  }
});

test("merging: inherited names are not fields", () => {
  const a = idOf(1);
  const base = records(entry("txn", 10, { id: a, n: 1 }));
  const here = records(entry("txn", 20, { id: a, n: 1, constructor: "mine", toString: 1 }));
  const there = records(entry("txn", 30, { id: a, n: 2, hasOwnProperty: false }));
  const merged = merge3(base, here, there);
  assert.deepEqual(JSON.parse(canonical(merged.records.get(a)!.value)), { constructor: "mine", hasOwnProperty: false, id: a, n: 2, toString: 1 });
  assert.deepEqual(merged.clashes, []);
});

test("merging: two versions that fit but would not fit together keep the later one whole", () => {
  const a = idOf(1);
  const base = records(entry("txn", 10, { id: a }));
  const here = records(entry("txn", 20, { id: a, left: "l".repeat(2500) }));
  const there = records(entry("txn", 30, { id: a, right: "r".repeat(2500) }));
  const merged = merge3(base, here, there);
  assert.deepEqual(plain(merged.records), plain(there));
  assert.deepEqual(merged.clashes, [{ id: a, what: "fields", fields: ["left", "right"], winner: "there" }]);
  assert.deepEqual(plain(merge3(base, there, here).records), plain(there));
});

test("merging, two thousand random pairs: the same result whoever merges, and nothing one side did alone is lost", () => {
  const random = seeded(20261120);
  const pick = (n: number) => Math.floor(random() * n);
  const names = ["a", "b", "c", "d"];
  const kinds = ["txn", "rule"];
  const fresh = (id: string, at: number): Entry => entry(kinds[pick(2)]!, at, { id, ...Object.fromEntries(names.filter(() => pick(2)).map((n) => [n, pick(4)])) });
  /** A copy of `from` after a few changes. Times are close together on purpose, so that ties happen. */
  const change = (from: Records, firstNew: number): Map<string, Entry> => {
    const out = new Map(from);
    for (let i = pick(5); i > 0; i--) {
      const ids = [...out.keys()];
      const what = pick(4);
      if (what === 0 || !ids.length) out.set(idOf(firstNew + pick(3)), fresh(idOf(firstNew + pick(3)), 100 + pick(3)));
      else if (what === 1) out.delete(ids[pick(ids.length)]!);
      else {
        const old = out.get(ids[pick(ids.length)]!)!;
        const name = names[pick(4)]!;
        const fields = { ...old.value, [name]: pick(4) } as { [k: string]: Json };
        if (what === 3) delete fields[name];
        out.set(old.value.id, entry(old.kind, 100 + pick(3), fields as Value));
      }
    }
    // an entry made under one id and stored under another would be the test's own mistake
    for (const [id, e] of [...out]) if (e.value.id !== id) out.set(id, entry(e.kind, e.at, { ...e.value, id }));
    return out;
  };
  for (let round = 0; round < 2000; round++) {
    const base = records(...Array.from({ length: pick(7) }, (_, i) => fresh(idOf(i), 10)));
    // both sides may add a record under the same id (500..502): that is what a write whose answer was lost looks like
    const here = change(base, 500);
    const there = change(base, pick(2) ? 500 : 600);
    const one = merge3(base, here, there);
    const two = merge3(base, there, here);
    // (the times are left out: a record touched and left as it was keeps the other side's time, and that is not a difference)
    assert.deepEqual(plainNoTime(one.records), plainNoTime(two.records), `round ${round}`);
    assert.equal(one.ahead, differs(one.records, there), `round ${round}`);
    assert.equal(two.ahead, differs(two.records, here), `round ${round}`);
    // merging the result again changes nothing
    const again = merge3(there, one.records, there);
    assert.deepEqual(plainNoTime(again.records), plainNoTime(one.records), `round ${round}`);
    assert.deepEqual(again.clashes, [], `round ${round}`);
    assert.equal(again.ahead, one.ahead, `round ${round}`);
    for (const id of new Set([...base.keys(), ...here.keys(), ...there.keys()])) {
      const [was, mine, theirs, now] = [base.get(id), here.get(id), there.get(id), one.records.get(id)];
      // removed on either side: gone
      if (was && (!mine || !theirs)) assert.equal(now, undefined, `round ${round}: a removed record came back`);
      // added on one side only: there, as it was added
      if (!was && mine && !theirs) assert.equal(canonical(now!.value), canonical(mine.value), `round ${round}`);
      if (!was && theirs && !mine) assert.equal(canonical(now!.value), canonical(theirs.value), `round ${round}`);
      if (!mine || !theirs || !now) continue;
      for (const name of names) {
        const w: Json | undefined = was?.value[name];
        const m: Json | undefined = mine.value[name];
        const t: Json | undefined = theirs.value[name];
        const n: Json | undefined = now.value[name];
        // a field one side changed and the other left alone keeps that change
        if (m !== w && t === w) assert.equal(n, m, `round ${round}: field ${name}`);
        if (t !== w && m === w) assert.equal(n, t, `round ${round}: field ${name}`);
        // and whatever it holds, one of the two sides wrote it
        assert.ok(n === m || n === t, `round ${round}: field ${name} holds a value nobody wrote`);
      }
    }
  }
  // the laws
  const base = records(fresh(idOf(1), 10), fresh(idOf(2), 10));
  const x = change(base, 500);
  assert.deepEqual(plainNoTime(merge3(base, x, base).records), plainNoTime(x));
  assert.deepEqual(plainNoTime(merge3(base, base, x).records), plainNoTime(x));
  assert.deepEqual(plainNoTime(merge3(base, x, x).records), plainNoTime(x));
});
