// The store: records in sealed chunks, on this device and on the server (VAULT-4; T-6, T-14, T-24).
// Every value here is invented. Nothing here uses the network: the server is the one in memory.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { newId } from "../src/core/ids";
import { MAX_CHUNK_BYTES, type OpenVault } from "../src/vault/crypto";
import { MemoryCache, MemoryRemote } from "../src/vault/memory";
import { MAX_ENTRIES, SOFT_CHUNK_BYTES, canonical, encode, entryOf, openContent, sealContent, type Entry, type Json, type Value } from "../src/vault/records";
import { LIMITS, Store, digestOf, markOf, type Cache, type Kept, type Pulled, type Pushed, type Remote, type Synced, type Write } from "../src/vault/sync";
import { idOf, testVault } from "./vaulthelp";
import { seeded } from "./seeded";

/** A clock that moves a second each time it is read, from a start of its own. */
const ticking = (start = 1_795_000_000_000) => {
  let now = start;
  return () => (now += 1000);
};

/** The network as it can be: an answer that is lost after the server acted, a request that never arrives, or one that arrives late. */
class Net implements Remote {
  /** What the next pushes do; "ok" when the list is empty. */
  plan: ("ok" | "lost" | "dropped" | "late")[] = [];
  down = false;
  /** Requests that have not arrived yet. */
  late: (() => Promise<Pushed>)[] = [];
  pulls = 0;
  pulledBytes = 0;
  pushes: Pushed[] = [];
  /** Lets a test stop a push half-way: it waits for this before going to the server. */
  gate?: Promise<void>;
  /** Something that happens between this device's look at the server and its write: another device's write, say. Once. */
  between?: () => Promise<void>;
  onReply?: (reply: Pushed) => void;
  constructor(readonly inner: Remote) {}

  async pull(vault: string, since: number): Promise<Pulled> {
    if (this.down) throw new Error("no network");
    this.pulls += 1;
    const page = await this.inner.pull(vault, since);
    if (page.ok) for (const chunk of page.chunks) this.pulledBytes += chunk.blob.length;
    return page;
  }

  async push(vault: string, writes: readonly Write[]): Promise<Pushed> {
    if (this.down) throw new Error("no network");
    const between = this.between;
    this.between = undefined;
    await between?.();
    const what = this.plan.shift() ?? "ok";
    if (what === "dropped") throw new Error("the request never arrived");
    if (what === "late") {
      const copy = writes.map((write) => ({ ...write, blob: write.blob.slice() }));
      this.late.push(() => this.inner.push(vault, copy));
      throw new Error("no answer in time");
    }
    if (this.gate) await this.gate;
    const reply = await this.inner.push(vault, writes);
    if (what === "lost") throw new Error("the answer was lost");
    this.pushes.push(reply);
    this.onReply?.(reply);
    return reply;
  }

  /** A late request arrives now. */
  async deliver(): Promise<Pushed | undefined> {
    return this.late.shift()?.();
  }
}

/** A cache that can fail a save, as a full disk or a page being closed would: that save does nothing. */
class Crashy implements Cache {
  failIn = Infinity;
  constructor(readonly inner = new MemoryCache()) {}
  load() {
    return this.inner.load();
  }
  async save(vault: string, change: { cursor: number; put: readonly Kept[]; drop: readonly string[] }): Promise<void> {
    if (--this.failIn <= 0) throw new Error("the page was closed");
    await this.inner.save(vault, change);
  }
  clear() {
    return this.inner.clear();
  }
}

type Device = { store: Store; cache: Crashy; net: Net; reopen(): Promise<void> };

async function device(vault: OpenVault, remote: Remote, now: () => number = ticking()): Promise<Device> {
  const cache = new Crashy();
  const d: Device = {
    cache,
    net: new Net(remote),
    store: await Store.open(vault, cache, { now }),
    async reopen() {
      d.store = await Store.open(vault, cache, { now });
    },
  };
  return d;
}

/** Everything a store holds, as plain data, whatever chunk it is in and whenever it was touched. */
const holds = (store: Store): Record<string, string> => Object.fromEntries(store.everything().map(({ kind, value }) => [value.id, `${kind} ${canonical(value)}`]).sort());

const ok = (result: Synced): Extract<Synced, { ok: true }> => {
  assert.ok(result.ok, `sync failed: ${result.ok ? "" : result.why}`);
  return result;
};

const txn = (n: number, more: { [name: string]: Json } = {}): Value => ({ id: idOf(n), posted: "2026-10-03", amount: -100 - n, description: `INVENTED SHOP ${n}`, ...more });

const includes = (hay: Uint8Array, needle: string): boolean => Buffer.from(hay).includes(Buffer.from(needle, "utf8")) || Buffer.from(hay).includes(Buffer.from(needle, "utf16le"));

test("what is kept is sealed: the server and the cache hold none of it (T-6, T-24)", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const markers = ["MARKER-ROSEWOOD-7731", "标记-青柠-4402", "marker.note.5519"];
  const account = idOf(9001);
  assert.deepEqual(a.store.add("account", "book", { id: account, name: markers[0]!, kind: "chequing", currency: "CAD", last4: "4402" }), { ok: true });
  for (let i = 0; i < 300; i++) assert.deepEqual(a.store.add("txn", `t/${account}`, txn(i, { account, description: `${markers[1]} ${i}`, note: markers[2]! })), { ok: true });
  // before anything is flushed the cache is empty
  assert.equal(a.cache.inner.everything().length, 0);
  await a.store.flush();
  assert.equal(a.store.status().pending, 3); // 300 transactions in two chunks, and the book
  const sent = ok(await a.store.sync(a.net));
  assert.equal(sent.sent, 3);
  assert.equal(remote.size, 3);
  assert.equal(a.store.status().pending, 0);
  const everywhere = [...remote.everything(), ...a.cache.inner.everything()];
  assert.ok(everywhere.length > 6);
  for (const bytes of everywhere) {
    for (const word of [...markers, "INVENTED", "chequing", "CAD", "4402", account, idOf(0), idOf(299), "book", `t/${account}`, "amount", "posted"]) {
      assert.equal(includes(bytes, word), false, `"${word}" is readable where only sealed bytes may be`);
    }
  }
  // closing and opening again, with no network: everything is there, read back from sealed bytes
  const before = holds(a.store);
  await a.reopen();
  assert.deepEqual(holds(a.store), before);
  assert.equal(a.store.list("txn").length, 300);
  assert.equal(a.store.get(account)!.name, markers[0]);
  assert.equal(a.store.kind(account), "account");
  // another device, starting from nothing
  const b = await device(vault, remote);
  assert.equal(ok(await b.store.sync(b.net)).received, 3);
  assert.deepEqual(holds(b.store), before);
});

test("a full import writes tens of chunks, not thousands, in a handful of requests (LIM-1)", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  let n = 0;
  for (let acct = 0; acct < 3; acct++) {
    const account = idOf(8000 + acct);
    a.store.add("account", "book", { id: account, name: `Invented account ${acct}`, kind: "chequing", currency: "CAD" });
    for (let month = 0; month < 24; month++) {
      a.store.add("import", "book", { id: idOf(7000 + acct * 100 + month), account, parser: "csv", lines: 60 });
      for (let line = 0; line < 60; line++) a.store.add("txn", `t/${account}`, txn(n++, { account, importId: idOf(7000 + acct * 100 + month), parser: "csv", type: "POS" }));
    }
  }
  assert.equal(n, 4320);
  const result = ok(await a.store.sync(a.net));
  // 1,440 transactions an account at 240 a chunk is 6 chunks an account, and one for the book
  assert.equal(result.sent, 19);
  assert.equal(remote.size, 19);
  assert.equal(a.net.pushes.length, 1, "one request carries the whole import, so it is saved whole or not at all");
  assert.ok(remote.bytes() < LIMITS.vaultBytes / 5, `${remote.bytes()} bytes`);
  // a second device gets all of it in two requests
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.equal(b.store.list("txn").length, 4320);
  assert.ok(b.net.pulls <= 2, `${b.net.pulls} requests`);
  // one more month for one account touches two chunks: that account's open one, and the book
  for (let line = 0; line < 60; line++) b.store.add("txn", `t/${idOf(8000)}`, txn(n++, { account: idOf(8000) }));
  b.store.add("import", "book", { id: idOf(7999), account: idOf(8000), parser: "csv", lines: 60 });
  assert.equal(ok(await b.store.sync(b.net)).sent, 2);
  // and after its own writes it does not download them again
  const bytes = b.net.pulledBytes;
  assert.deepEqual({ ...ok(await b.store.sync(b.net)), clashes: undefined }, { ok: true, received: 0, sent: 0, clashes: undefined });
  assert.equal(b.net.pulledBytes, bytes);
});

test("adding, changing and removing: what is refused, and what a change keeps", async () => {
  const vault = await testVault();
  const a = await device(vault, new MemoryRemote(vault.id));
  const id = idOf(1);
  assert.deepEqual(a.store.add("txn", "t/x", { id, amount: 5, later: { added: "by a newer version" } }), { ok: true });
  assert.deepEqual(a.store.add("txn", "t/x", { id, amount: 6 }), { ok: false, why: "exists" });
  assert.deepEqual(a.store.add("txn", "", txn(2)), { ok: false, why: "invalid" });
  assert.deepEqual(a.store.add("Txn", "t/x", txn(2)), { ok: false, why: "invalid" });
  assert.deepEqual(a.store.add("txn", "t/x", { id: "nope" }), { ok: false, why: "invalid" });
  assert.deepEqual(a.store.add("txn", "t/x", { id: idOf(2), bad: undefined } as unknown as Value), { ok: false, why: "invalid" });
  assert.deepEqual(a.store.add("txn", "t/x", { id: idOf(2), note: "x".repeat(5000) }), { ok: false, why: "too-big" });
  assert.deepEqual(a.store.change(idOf(3), { amount: 1 }), { ok: false, why: "unknown" });
  assert.deepEqual(a.store.change(id, { id: idOf(3) }), { ok: false, why: "invalid" });
  assert.deepEqual(a.store.change(id, { note: "x".repeat(5000) }), { ok: false, why: "too-big" });
  assert.deepEqual(a.store.change(id, JSON.parse('{"__proto__": {"polluted": 1}}') as { [name: string]: Json }), { ok: false, why: "invalid" });
  assert.deepEqual(a.store.remove(idOf(3)), { ok: false, why: "unknown" });
  // a change touches the fields it names; the others stay, known to this version or not
  assert.deepEqual(a.store.change(id, { category: "dining", amount: undefined }), { ok: true });
  assert.deepEqual(a.store.get(id), { id, later: { added: "by a newer version" }, category: "dining" });
  // what the store hands out cannot be changed in place
  assert.throws(() => ((a.store.get(id) as unknown as { category: string }).category = "x"), TypeError);
  ok(await a.store.sync(a.net));
  // a change that changes nothing is nothing to send
  const before = a.store.changes;
  assert.deepEqual(a.store.change(id, { category: "dining" }), { ok: true });
  assert.equal(a.store.changes, before);
  assert.equal(a.store.status().pending, 0);
  // changed and changed back: still nothing to send
  a.store.change(id, { category: "x" });
  a.store.change(id, { category: "dining" });
  assert.equal(a.store.status().pending, 0);
  assert.equal(ok(await a.store.sync(a.net)).sent, 0);
  assert.deepEqual(a.store.remove(id), { ok: true });
  assert.equal(a.store.get(id), undefined);
  // added and removed again before anything was sent: no chunk is made for it
  a.store.add("txn", "t/other", txn(50));
  a.store.remove(idOf(50));
  assert.equal(ok(await a.store.sync(a.net)).sent, 1);
  assert.equal(a.store.status().chunks, 1);
});

test("a chunk takes 240 records, and a device does not grow one past half a megabyte", async () => {
  const vault = await testVault();
  const a = await device(vault, new MemoryRemote(vault.id));
  for (let i = 0; i < MAX_ENTRIES + 1; i++) a.store.add("txn", "t/x", txn(i));
  assert.equal(a.store.status().chunks, 2);
  // large records: the chunk closes by size before it closes by count
  const big = "n".repeat(3900);
  let i = 1000;
  while (a.store.status().chunks < 4) a.store.add("txn", "t/big", txn(i++, { note: big }));
  const perChunk = i - 1000 - 1;
  assert.ok(perChunk * 3990 <= SOFT_CHUNK_BYTES && (perChunk + 1) * 4096 > SOFT_CHUNK_BYTES, `${perChunk} large records in a chunk`);
  // growing a record in a chunk that is at its size is refused; shrinking one is not
  for (let j = 0; j < 5; j++) a.store.add("txn", "t/grow", txn(5000 + j, { note: "" }));
  for (let j = 0; a.store.status().chunks < 6 && j < 400; j++) a.store.add("txn", "t/grow", txn(6000 + j, { note: big }));
  assert.deepEqual(a.store.change(idOf(5000), { note: big }), { ok: false, why: "full" });
  assert.deepEqual(a.store.change(idOf(6000), { note: "short" }), { ok: true });
  ok(await a.store.sync(a.net));
});

test("two devices, different records and different fields: both end with everything", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote, ticking(1_795_000_500_000));
  for (let i = 0; i < 10; i++) a.store.add("txn", "t/x", txn(i));
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  // offline, each does its own thing to the same chunk
  a.store.change(idOf(0), { category: "groceries" });
  a.store.add("txn", "t/x", txn(100));
  a.store.remove(idOf(9));
  b.store.change(idOf(0), { note: "from the other device" });
  b.store.change(idOf(1), { category: "transit" });
  b.store.add("txn", "t/x", txn(200));
  ok(await a.store.sync(a.net));
  const merged = ok(await b.store.sync(b.net));
  assert.deepEqual(merged.clashes, []);
  assert.equal(merged.received, 1, "it looked first, found the other device's version, and merged before it wrote");
  ok(await a.store.sync(a.net));
  assert.deepEqual(holds(a.store), holds(b.store));
  assert.deepEqual(a.store.get(idOf(0)), { ...txn(0), category: "groceries", note: "from the other device" });
  assert.equal(a.store.get(idOf(1))!.category, "transit");
  assert.equal(a.store.get(idOf(9)), undefined);
  assert.ok(a.store.get(idOf(100)) && a.store.get(idOf(200)));
  assert.equal(a.store.list("txn").length, 11);
  assert.equal(remote.size, 1, "one chunk all along: a merge makes no copies");
});

test("the same field on two devices: the later change wins on both, and the device that lost is told", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote, ticking(1_795_000_000_000));
  const b = await device(vault, remote, ticking(1_795_009_000_000)); // b's clock is ahead: its changes are the later ones
  a.store.add("txn", "t/x", txn(1));
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  a.store.change(idOf(1), { category: "from-a", note: "a's note" });
  b.store.change(idOf(1), { category: "from-b" });
  ok(await b.store.sync(b.net));
  const lost = ok(await a.store.sync(a.net));
  assert.deepEqual(lost.clashes, [{ id: idOf(1), what: "fields", fields: ["category"], winner: "there" }]);
  ok(await b.store.sync(b.net));
  for (const d of [a, b]) assert.deepEqual(d.store.get(idOf(1)), { ...txn(1), category: "from-b", note: "a's note" });
  // the other order of arrival ends the same way
  a.store.change(idOf(1), { category: "a-again" });
  b.store.change(idOf(1), { category: "b-again" });
  ok(await a.store.sync(a.net));
  const won = ok(await b.store.sync(b.net));
  assert.deepEqual(won.clashes, [{ id: idOf(1), what: "fields", fields: ["category"], winner: "here" }]);
  ok(await a.store.sync(a.net));
  for (const d of [a, b]) assert.equal(d.store.get(idOf(1))!.category, "b-again");
});

test("removed on one device and changed on the other: removed on both, and said", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  a.store.add("txn", "t/x", txn(2));
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  a.store.remove(idOf(1));
  b.store.change(idOf(1), { category: "x" });
  a.store.change(idOf(2), { category: "y" });
  b.store.remove(idOf(2));
  ok(await a.store.sync(a.net));
  const merged = ok(await b.store.sync(b.net));
  assert.deepEqual(
    merged.clashes.sort((x, y) => (x.id < y.id ? -1 : 1)),
    [
      { id: idOf(1), what: "removed-there" },
      { id: idOf(2), what: "removed-here" },
    ],
  );
  ok(await a.store.sync(a.net));
  assert.deepEqual(holds(a.store), {});
  assert.deepEqual(holds(b.store), {});
});

test("a stale write is refused whole: no part of the batch is written", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  a.store.add("account", "book", { id: idOf(50), name: "Invented" });
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  // b changes both chunks. After b has looked at the server and before it writes, a changes one of them.
  b.store.change(idOf(1), { note: "b" });
  b.store.change(idOf(50), { name: "Renamed" });
  let before: Uint8Array[] = [];
  b.net.between = async () => {
    a.store.change(idOf(1), { category: "a" });
    ok(await a.store.sync(a.net));
    before = remote.everything();
  };
  const after: Uint8Array[][] = [];
  b.net.onReply = () => after.push(remote.everything());
  const result = ok(await b.store.sync(b.net));
  assert.deepEqual(b.net.pushes.map((reply) => (reply.ok ? "taken" : reply.why)), ["stale", "taken"]);
  assert.deepEqual(after[0], before, "the refused batch left the server exactly as it was, the chunk that was not stale included");
  assert.equal(result.sent, 2);
  assert.equal(result.received, 1);
  ok(await a.store.sync(a.net));
  assert.deepEqual(a.store.get(idOf(1)), { ...txn(1), category: "a", note: "b" });
  assert.equal(a.store.get(idOf(50))!.name, "Renamed");
});

test("an answer that never came: sending again doubles nothing", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  for (let i = 0; i < 5; i++) a.store.add("txn", "t/x", txn(i));
  // the server took it; the answer was lost
  a.net.plan = ["lost"];
  const first = await a.store.sync(a.net);
  assert.deepEqual([first.ok, first.ok ? "" : first.why], [false, "offline"]);
  assert.equal(remote.size, 1);
  assert.equal(a.store.status().pending, 1, "the device does not know yet");
  const second = ok(await a.store.sync(a.net));
  assert.equal(second.sent, 0, "it found its own copy on the server and wrote nothing more");
  assert.equal(remote.size, 1);
  assert.equal(a.store.status().pending, 0);
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.equal(b.store.list("txn").length, 5);

  // the request never arrived: sent again, taken once
  a.store.add("txn", "t/x", txn(10));
  a.net.plan = ["dropped"];
  assert.equal((await a.store.sync(a.net)).ok, false);
  assert.equal(ok(await a.store.sync(a.net)).sent, 1);
  ok(await b.store.sync(b.net));
  assert.equal(b.store.list("txn").length, 6);
});

test("an answer that never came, and then another device wrote: what was removed since stays removed", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  // a adds two records; the server takes them; the answer is lost
  a.store.add("txn", "t/x", txn(2));
  a.store.add("txn", "t/x", txn(3));
  a.net.plan = ["lost"];
  assert.equal((await a.store.sync(a.net)).ok, false);
  // b sees them and builds on them
  ok(await b.store.sync(b.net));
  b.store.change(idOf(3), { category: "b" });
  b.store.add("txn", "t/x", txn(4));
  ok(await b.store.sync(b.net));
  // meanwhile a removed one of the two it had added, and changed the first
  a.store.remove(idOf(2));
  a.store.change(idOf(1), { note: "a" });
  const result = ok(await a.store.sync(a.net));
  assert.deepEqual(result.clashes, []);
  ok(await b.store.sync(b.net));
  for (const d of [a, b]) {
    assert.equal(d.store.get(idOf(2)), undefined, "a record removed after a lost answer came back");
    assert.deepEqual(d.store.get(idOf(3)), { ...txn(3), category: "b" });
    assert.deepEqual(d.store.get(idOf(1)), { ...txn(1), note: "a" });
    assert.ok(d.store.get(idOf(4)));
  }
});

test("a request that arrives late, after the device gave up on it, undoes nothing", async () => {
  for (const order of ["late-first", "retry-first", "other-device-first", "late-between"] as const) {
    const vault = await testVault();
    const remote = new MemoryRemote(vault.id);
    const a = await device(vault, remote);
    const b = await device(vault, remote);
    a.store.add("txn", "t/x", txn(1));
    a.store.add("txn", "t/x", txn(2));
    a.net.plan = ["late"];
    assert.equal((await a.store.sync(a.net)).ok, false);
    assert.equal(remote.size, 0);
    // a carries on: removes one, adds one, and looks at the server, which shows nothing of its request
    a.store.remove(idOf(1));
    a.store.add("txn", "t/x", txn(3));
    if (order === "late-first") {
      assert.equal((await a.net.deliver())!.ok, true);
      ok(await a.store.sync(a.net));
    } else if (order === "retry-first") {
      ok(await a.store.sync(a.net));
      const late = await a.net.deliver();
      assert.deepEqual([late!.ok, late!.ok ? "" : late!.why], [false, "stale"]);
    } else if (order === "other-device-first") {
      // the late request arrives, and another device builds on it before a tries again
      assert.equal((await a.net.deliver())!.ok, true);
      ok(await b.store.sync(b.net));
      b.store.change(idOf(2), { category: "b" });
      ok(await b.store.sync(b.net));
      ok(await a.store.sync(a.net));
    } else {
      // it arrives after a has looked at the server and before a's next write gets there
      a.net.between = async () => {
        assert.equal((await a.net.deliver())!.ok, true);
      };
      ok(await a.store.sync(a.net));
      assert.equal(a.net.pushes.filter((reply) => !reply.ok && reply.why === "stale").length, 1);
    }
    ok(await a.store.sync(a.net));
    ok(await b.store.sync(b.net));
    for (const d of [a, b]) {
      assert.deepEqual(Object.keys(holds(d.store)).sort(), [idOf(2), idOf(3)].sort(), order);
      assert.equal(d.store.status().pending, 0, order);
    }
    assert.equal(remote.size, 1, order);
  }
});

test("a refusal settles only the request it answers: a copy from an earlier, unanswered request is still watched for", async () => {
  for (const closed of [false, true]) {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  a.store.add("account", "book", { id: idOf(50), name: "Invented" });
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  // a adds a record; the request is on its way and a hears nothing
  a.store.add("txn", "t/x", txn(2));
  a.net.plan = ["late"];
  assert.equal((await a.store.sync(a.net)).ok, false);
  // (the second time round, the page is closed and opened again here: what was sent is still watched for)
  if (closed) await a.reopen();
  // a takes the record out again and renames the account
  a.store.remove(idOf(2));
  a.store.change(idOf(50), { name: "From a" });
  // a's next write is refused because b changed the account first. That says nothing about the earlier request,
  // which arrives right after the refusal.
  a.net.between = async () => {
    b.store.change(idOf(50), { note: "from b" });
    ok(await b.store.sync(new Net(remote)));
  };
  a.net.onReply = (reply) => {
    a.net.onReply = undefined;
    assert.ok(!reply.ok && reply.why === "stale");
    a.net.between = async () => {
      assert.equal((await a.net.deliver())!.ok, true);
    };
  };
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  ok(await a.store.sync(a.net));
  for (const d of [a, b]) {
    assert.equal(d.store.get(idOf(2)), undefined, "the record a took out came back with the late request");
    assert.deepEqual(d.store.get(idOf(50)), { id: idOf(50), name: "From a", note: "from b" });
    assert.equal(d.store.status().pending, 0);
  }
  }
});

test("a merged chunk too large to seal: the sync says so, nothing is written, and this device keeps its changes", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/big", txn(0));
  ok(await a.store.sync(a.net));
  const [id] = remote.ids();
  const mine = ((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks[0]!;
  const had = await openContent(vault, id!, mine.blob);
  assert.ok(had.ok);
  // Other devices fill the chunk to just under what one chunk can be. (Made by hand: it takes several devices merging
  // large records into one chunk, which the test above does the slow way.)
  const filled = new Map(had.content.records);
  const big = "n".repeat(3900);
  const sizeOf = (set: Map<string, Entry>) => encode({ group: "t/big", n: 2, rev: idOf(1), history: [idOf(1), had.content.rev], records: set }).length;
  for (let i = 1; sizeOf(filled) < MAX_CHUNK_BYTES - 6000; i++) filled.set(idOf(i), entryOf("txn", 5, txn(i, { note: big }))!);
  for (let i = 5000; sizeOf(filled) < MAX_CHUNK_BYTES - 1500; i++) filled.set(idOf(i), entryOf("txn", 5, { id: idOf(i), n: "x".repeat(200) })!);
  const rev = newId();
  const blob = await sealContent(vault, id!, { group: "t/big", n: 2, rev, history: [rev, had.content.rev], records: filled });
  assert.ok(blob);
  assert.deepEqual((await remote.push(vault.id, [{ id: id!, base: 1, mark: markOf(mine.blob), blob }])).ok, true);
  // a makes the one record it knows larger: with that, the merged chunk no longer fits, and there is nothing of a's own to move out
  a.store.change(idOf(0), { note: big });
  const held = remote.everything();
  const result = await a.store.sync(a.net);
  assert.deepEqual(result.ok ? [] : [result.why, result.chunks], ["too-big", [id]]);
  assert.deepEqual(remote.everything(), held);
  assert.equal(a.store.get(idOf(0))!.note, big);
  assert.equal(a.store.list("txn").length, filled.size);
  // closing the page now loses nothing: the cache still holds a's change, not the server's copy without it
  await a.store.flush();
  await a.reopen();
  assert.equal(a.store.get(idOf(0))!.note, big);
  // taking the change back lets the sync through
  a.store.change(idOf(0), { note: undefined });
  ok(await a.store.sync(a.net));
  assert.equal(a.store.list("txn").length, filled.size);
});

/** Every copy of a record that the server holds, one for each chunk it is in. */
async function copiesOn(vault: OpenVault, remote: MemoryRemote, record: string): Promise<string[]> {
  const out: string[] = [];
  for (let since = 0; ; ) {
    const page = (await remote.pull(vault.id, since)) as Extract<Pulled, { ok: true }>;
    for (const chunk of page.chunks) {
      const opened = await openContent(vault, chunk.id, chunk.blob);
      assert.ok(opened.ok);
      const copy = opened.content.records.get(record);
      if (copy) out.push(canonical(copy.value));
      since = chunk.version;
    }
    if (!page.more) return out;
  }
}

/** A chunk made by hand, as no device makes one, and put on the server or into a cache. */
async function handMade(vault: OpenVault, records: Entry[], group = "t/x"): Promise<{ id: string; blob: Uint8Array }> {
  const [id, rev] = [newId(), newId()];
  const blob = await sealContent(vault, id, { group, n: 1, rev, history: [rev], records: new Map(records.map((e) => [e.value.id, e])) });
  assert.ok(blob);
  return { id, blob };
}

test("the same record in more than one chunk, which should never be: read as one, made alike by a sync, and no copy is taken out", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  for (const records of [
    [entryOf("txn", 10, txn(1, { note: "older", onlyOlder: 1 }))!, entryOf("txn", 10, txn(2, { note: "older" }))!],
    [entryOf("txn", 20, txn(1, { note: "newer", onlyNewer: 2 }))!, entryOf("txn", 20, txn(2, { note: "newer" }))!, entryOf("txn", 20, txn(3))!],
  ]) {
    const made = await handMade(vault, records);
    assert.ok((await remote.push(vault.id, [{ id: made.id, base: 0, blob: made.blob }])).ok);
  }
  const a = await device(vault, remote);
  const first = ok(await a.store.sync(a.net));
  // read as one record: every field either copy had, and the later copy's value where they differ
  const one = { ...txn(1), note: "newer", onlyOlder: 1, onlyNewer: 2 };
  const two = { ...txn(2), note: "newer" };
  assert.deepEqual(a.store.get(idOf(1)), one);
  assert.deepEqual(a.store.get(idOf(2)), two);
  assert.equal(a.store.list("txn").length, 3, "each is listed once");
  assert.deepEqual(first.clashes.map((clash) => `${clash.what} ${clash.id}`).sort(), [`doubled ${idOf(1)}`, `doubled ${idOf(2)}`].sort());
  // the sync made the copies alike where they are: both chunks were written, and each record is still in both
  assert.equal(first.sent, 2);
  assert.deepEqual(a.store.status(), { records: 3, chunks: 2, pending: 0, damaged: 0, doubled: 0 });
  assert.deepEqual(await copiesOn(vault, remote, idOf(1)), [canonical(one), canonical(one)]);
  assert.deepEqual(await copiesOn(vault, remote, idOf(2)), [canonical(two), canonical(two)]);
  // another device finds them alike: nothing to say, nothing to write
  const b = await device(vault, remote);
  const second = ok(await b.store.sync(b.net));
  assert.deepEqual([second.clashes, second.sent], [[], 0]);
  assert.deepEqual(holds(b.store), holds(a.store));
  // a change goes into every copy
  assert.deepEqual(b.store.change(idOf(1), { category: "x", onlyOlder: undefined }), { ok: true });
  assert.equal(ok(await b.store.sync(b.net)).sent, 2);
  const changed = { ...txn(1), note: "newer", onlyNewer: 2, category: "x" };
  assert.deepEqual(await copiesOn(vault, remote, idOf(1)), [canonical(changed), canonical(changed)]);
  ok(await a.store.sync(a.net));
  assert.deepEqual(a.store.get(idOf(1)), changed);
  // and a removal takes it out of every chunk
  assert.deepEqual(a.store.remove(idOf(2)), { ok: true });
  assert.equal(ok(await a.store.sync(a.net)).sent, 2);
  assert.deepEqual(await copiesOn(vault, remote, idOf(2)), []);
  ok(await b.store.sync(b.net));
  assert.equal(b.store.get(idOf(2)), undefined);
  assert.equal(b.store.list("txn").length, 2);

  // Found in the cache when the store is opened, before any sync: read as one from the start, and a change is made to
  // the record as it is read, in both copies. The next sync says that it was doubled.
  const remote2 = new MemoryRemote(vault.id);
  const hand = new MemoryCache();
  for (const records of [[entryOf("txn", 10, txn(7, { left: 1, both: "older" }))!], [entryOf("txn", 20, txn(7, { right: 2, both: "newer" }))!]]) {
    const made = await handMade(vault, records);
    await hand.save(vault.id, { cursor: 0, put: [{ id: made.id, version: 0, local: made.blob }], drop: [] });
  }
  const c = await Store.open(vault, hand);
  assert.equal(c.status().doubled, 1);
  assert.deepEqual(c.get(idOf(7)), { ...txn(7), left: 1, right: 2, both: "newer" });
  assert.deepEqual(c.list("txn"), [c.get(idOf(7))]);
  assert.equal(c.kind(idOf(7)), "txn");
  assert.deepEqual(c.change(idOf(7), { category: "x" }), { ok: true });
  assert.equal(c.status().doubled, 0);
  const told = ok(await c.sync(remote2));
  assert.deepEqual([told.clashes, told.sent, remote2.size], [[{ id: idOf(7), what: "doubled" }], 2, 2]);
  const after = { ...txn(7), left: 1, right: 2, both: "newer", category: "x" };
  assert.deepEqual(await copiesOn(vault, remote2, idOf(7)), [canonical(after), canonical(after)]);
  const fresh = await Store.open(vault, new MemoryCache());
  assert.deepEqual(ok(await fresh.sync(remote2)).clashes, []);
  assert.deepEqual(fresh.get(idOf(7)), after);
});

test("a doubled record: a removal takes out the copies this device has seen, and a copy it has not seen keeps the record", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote, ticking(1_795_000_900_000));
  // the same id used on two devices before either has seen the other: each has a chunk of its own for it
  a.store.add("txn", "t/x", txn(1, { fromA: true }));
  b.store.add("txn", "t/x", txn(1, { fromB: true }));
  ok(await a.store.sync(a.net));
  // a removes the record, knowing of one copy
  a.store.remove(idOf(1));
  ok(await a.store.sync(a.net));
  // b's copy arrives afterwards. Nothing b did is dropped: the record is there again, as b had it, and a's removal has to be made again.
  ok(await b.store.sync(b.net));
  ok(await a.store.sync(a.net));
  for (const d of [a, b]) assert.deepEqual(d.store.get(idOf(1)), { ...txn(1), fromB: true });
  assert.deepEqual(a.store.remove(idOf(1)), { ok: true });
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  for (const d of [a, b]) assert.equal(d.store.get(idOf(1)), undefined);
  assert.deepEqual(await copiesOn(vault, remote, idOf(1)), []);
});

test("doubled records on a bad network, each device knowing other copies: they end the same, with every field only one copy had", async (t) => {
  const runs = Number(process.env.MONEYLENS_SEEDS ?? 30);
  for (let seed = 1; seed <= runs; seed++) {
    const random = seeded(seed * 6173);
    const pick = (n: number) => Math.floor(random() * n);
    const bytes = seeded(seed * 15_485_863);
    const restore = t.mock.method(globalThis.crypto, "getRandomValues", (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = Math.floor(bytes() * 256);
      return array;
    });
    try {
      const vault = await testVault();
      const remote = new MemoryRemote(vault.id, { ...LIMITS, writesPerDay: 1e9 });
      const id = idOf(1);
      // Every copy says something of its own (`only…`), and something they all say differently (`v`), at a time of its own.
      const times = [100, 200, 300, 400, 500].sort(() => random() - 0.5);
      const copy = (n: number) => entryOf("txn", times[n]!, { id, v: n, [`only${n}`]: n })!;
      // one or two copies are on the server already; each device has one more in a chunk it has never sent
      const onServer = 1 + pick(2);
      for (let n = 0; n < onServer; n++) {
        const made = await handMade(vault, [copy(n)]);
        assert.ok((await remote.push(vault.id, [{ id: made.id, base: 0, blob: made.blob }])).ok);
      }
      const devices: Device[] = [];
      for (let n = onServer; n < onServer + 3; n++) {
        const d = await device(vault, remote, ticking(1_795_000_000_000 + n * 3_600_000));
        const made = await handMade(vault, [copy(n)]);
        await d.cache.inner.save(vault.id, { cursor: 0, put: [{ id: made.id, version: 0, local: made.blob }], drop: [] });
        await d.reopen();
        devices.push(d);
      }
      const all = onServer + 3;
      for (let step = 0; step < 40; step++) {
        const d = devices[pick(3)]!;
        const roll = pick(10);
        if (roll < 6) {
          d.net.plan = [(["ok", "ok", "lost", "dropped", "late"] as const)[pick(5)]!];
          if (pick(3) === 0) {
            const other = devices[pick(3)]!;
            d.net.between = async () => {
              if (other !== d) await other.store.sync(new Net(remote));
            };
          }
          await d.store.sync(d.net);
          d.net.between = undefined;
        } else if (roll < 8) await devices[pick(3)]!.net.deliver();
        else {
          await d.store.flush();
          await d.reopen();
        }
      }
      for (const d of devices) {
        d.net.plan = [];
        while (d.net.late.length) await d.net.deliver();
      }
      for (let pass = 0, moving = true; moving; pass++) {
        assert.ok(pass < 10, `seed ${seed}: the devices never settle`);
        moving = false;
        for (const d of devices) {
          const result = ok(await d.store.sync(d.net));
          if (result.sent || result.received) moving = true;
        }
      }
      const fresh = await device(vault, remote);
      ok(await fresh.store.sync(fresh.net));
      const latest = times.slice(0, all).indexOf(Math.max(...times.slice(0, all)));
      const want: { [name: string]: Json } = { id, v: latest };
      for (let n = 0; n < all; n++) want[`only${n}`] = n;
      for (const d of [...devices, fresh]) {
        assert.deepEqual(d.store.get(id), want, `seed ${seed}`);
        assert.deepEqual(d.store.status(), { records: 1, chunks: all, pending: 0, damaged: 0, doubled: 0 }, `seed ${seed}`);
      }
      // every chunk still holds the record, and they all say the same
      assert.deepEqual(await copiesOn(vault, remote, id), Array.from({ length: all }, () => canonical(want as Value)), `seed ${seed}`);
    } finally {
      restore.mock.restore();
    }
  }
});

/** A chunk filled by hand to within a few hundred bytes of what `alike` leaves a chunk, around the records given. */
function nearlyFull(around: Entry[], spare: number): Map<string, Entry> {
  const filled = new Map(around.map((e) => [e.value.id, e]));
  const bytes = () => [...filled.values()].reduce((sum, e) => sum + e.size, 0);
  const limit = MAX_CHUNK_BYTES - 2048 - spare;
  const big = "n".repeat(3900);
  for (let i = 100_000; bytes() + 4096 < limit; i++) filled.set(idOf(i), entryOf("txn", 5, txn(i, { note: big }))!);
  const room = limit - bytes() - entryOf("txn", 5, txn(99_999, { note: "" }))!.size;
  if (room > 0) filled.set(idOf(99_999), entryOf("txn", 5, txn(99_999, { note: "n".repeat(room) }))!);
  assert.ok(limit - bytes() >= 0 && limit - bytes() < 8, `${limit - bytes()} bytes short of the limit`);
  return filled;
}

test("a doubled record whose merged form does not fit one of its chunks is left as it is, and still read as one", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id, { ...LIMITS, vaultBytes: 8 * 1024 * 1024 });
  const small = entryOf("txn", 10, { id: idOf(1), a: "from the full chunk" })!;
  const large = entryOf("txn", 20, { id: idOf(1), b: "y".repeat(2600) })!;
  // one chunk with 400 bytes to spare, holding the smaller copy; another chunk holding a copy 2,600 bytes larger
  for (const records of [nearlyFull([small], 400), new Map([[idOf(1), large]])]) {
    const [id, rev] = [newId(), newId()];
    const blob = await sealContent(vault, id, { group: "t/big", n: 1, rev, history: [rev], records });
    assert.ok(blob, "the test's own chunk has to be one that can be sealed");
    assert.ok((await remote.push(vault.id, [{ id, base: 0, blob }])).ok);
  }
  const held = remote.everything();
  const a = await device(vault, remote);
  const first = ok(await a.store.sync(a.net));
  assert.deepEqual([first.clashes, first.sent], [[{ id: idOf(1), what: "doubled" }], 0]);
  assert.deepEqual(remote.everything(), held, "neither chunk was written");
  assert.equal(a.store.status().doubled, 1);
  assert.equal(a.store.status().pending, 0);
  assert.deepEqual(a.store.get(idOf(1)), { id: idOf(1), a: "from the full chunk", b: "y".repeat(2600) });
  // it stays so, quietly, sync after sync; a change that would have to grow the full chunk is refused, a removal is not
  assert.deepEqual([ok(await a.store.sync(a.net)).clashes, a.store.status().doubled], [[], 1]);
  assert.deepEqual(a.store.change(idOf(1), { c: 1 }), { ok: false, why: "full" });
  assert.deepEqual(a.store.get(idOf(1)), { id: idOf(1), a: "from the full chunk", b: "y".repeat(2600) });
  assert.deepEqual(a.store.remove(idOf(1)), { ok: true });
  assert.equal(ok(await a.store.sync(a.net)).sent, 2);
  assert.deepEqual(await copiesOn(vault, remote, idOf(1)), []);
});

test("a chunk made too large by a merge: what this device added moves out, but never a copy of a doubled record", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id, { ...LIMITS, vaultBytes: 8 * 1024 * 1024 });
  const a = await device(vault, remote);
  a.store.add("txn", "t/big", txn(0));
  ok(await a.store.sync(a.net));
  const [id] = remote.ids();
  const mine = ((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks[0]!;
  const had = await openContent(vault, id!, mine.blob);
  assert.ok(had.ok);
  // Offline, this device adds two records to that chunk. One of them, it turns out, is also in a chunk another device made.
  a.store.add("txn", "t/big", { id: idOf(1), fromHere: true });
  a.store.add("txn", "t/big", txn(2, { note: "n".repeat(3900) }));
  assert.equal(a.store.status().chunks, 1);
  // Meanwhile other devices fill the chunk to 2,500 bytes short of what a chunk can be, and the other copy arrives.
  const rev = newId();
  const filled = await sealContent(vault, id!, { group: "t/big", n: 2, rev, history: [rev, had.content.rev], records: nearlyFull([...had.content.records.values()], 452) });
  assert.ok(filled);
  assert.ok((await remote.push(vault.id, [{ id: id!, base: 1, mark: markOf(mine.blob), blob: filled }])).ok);
  const elsewhere = await handMade(vault, [entryOf("txn", 3, { id: idOf(1), fromThere: true })!], "t/big");
  assert.ok((await remote.push(vault.id, [{ id: elsewhere.id, base: 0, blob: elsewhere.blob }])).ok);
  // With both additions the merged chunk cannot be sealed. The record that is this device's alone moves to another chunk
  // of its group with room, which here is the one the other copy came in. The doubled record stays where it is: moved the
  // same way, it would have landed on its own other copy and wiped out what that one said.
  const first = ok(await a.store.sync(a.net));
  assert.deepEqual(first.clashes, [{ id: idOf(1), what: "doubled" }]);
  assert.deepEqual(a.store.get(idOf(1)), { id: idOf(1), fromHere: true, fromThere: true });
  assert.equal(a.store.get(idOf(2))!.note, "n".repeat(3900));
  assert.equal(a.store.status().chunks, 2);
  ok(await a.store.sync(a.net));
  assert.deepEqual(a.store.status().doubled, 0);
  const merged = canonical({ id: idOf(1), fromHere: true, fromThere: true });
  assert.deepEqual(await copiesOn(vault, remote, idOf(1)), [merged, merged]);
  assert.equal((await copiesOn(vault, remote, idOf(2))).length, 1);
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), holds(a.store));
});

test("a device whose clock is behind still dates its change after the version it changed", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const fast = await device(vault, remote, ticking(1_795_036_000_000)); // ten hours ahead
  const slow = await device(vault, remote, ticking(1_795_000_000_000));
  const middle = await device(vault, remote, ticking(1_795_018_000_000));
  fast.store.add("txn", "t/x", txn(1));
  ok(await fast.store.sync(fast.net));
  ok(await slow.store.sync(slow.net));
  ok(await middle.store.sync(middle.net));
  // both change the same field of a record they have both seen; by its own clock, the slow device's change is the older
  slow.store.change(idOf(1), { category: "slow" });
  middle.store.change(idOf(1), { category: "middle" });
  ok(await middle.store.sync(middle.net));
  const result = ok(await slow.store.sync(slow.net));
  // but the slow device changed a version dated ten hours ahead, so its change is dated after that
  assert.deepEqual(result.clashes, [{ id: idOf(1), what: "fields", fields: ["category"], winner: "here" }]);
  ok(await middle.store.sync(middle.net));
  assert.equal(middle.store.get(idOf(1))!.category, "slow");
});

test("a copy whose fate is unknown survives closing the page", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  a.net.plan = ["lost"];
  assert.equal((await a.store.sync(a.net)).ok, false);
  a.store.add("txn", "t/x", txn(2));
  await a.store.flush();
  await a.reopen();
  assert.equal(a.store.list("txn").length, 2);
  assert.equal(a.store.status().pending, 1);
  ok(await a.store.sync(a.net));
  assert.equal(remote.size, 1);
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), holds(a.store));
});

test("a change undone while its copy is still out stays undone when the page is opened again", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  a.net.plan = ["lost"];
  assert.equal((await a.store.sync(a.net)).ok, false);
  // the record is on the server; this device does not know, and removes it again
  a.store.remove(idOf(1));
  await a.store.flush();
  await a.reopen();
  assert.equal(a.store.get(idOf(1)), undefined, "the copy that was sent is not what this device holds");
  assert.equal(a.store.status().pending, 1);
  ok(await a.store.sync(a.net));
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), {});
  // the same with a chunk the server already had
  a.store.add("txn", "t/y", txn(2));
  ok(await a.store.sync(a.net));
  a.store.change(idOf(2), { category: "x" });
  a.net.plan = ["lost"];
  assert.equal((await a.store.sync(a.net)).ok, false);
  a.store.change(idOf(2), { category: undefined });
  await a.store.flush();
  await a.reopen();
  assert.deepEqual(a.store.get(idOf(2)), txn(2));
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  assert.deepEqual(b.store.get(idOf(2)), txn(2));
});

test("changes made while a push is on its way are kept, and sent next", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  let open!: () => void;
  a.net.gate = new Promise<void>((resolve) => (open = resolve));
  const syncing = a.store.sync(a.net);
  // let the sync get as far as the push, then change things under it
  await new Promise((resolve) => setTimeout(resolve, 20));
  a.store.change(idOf(1), { category: "while-sending" });
  a.store.add("txn", "t/x", txn(2));
  a.store.add("txn", "t/y", txn(3));
  a.net.gate = undefined;
  open();
  const result = ok(await syncing);
  assert.equal(result.sent, 3, "the first copy, then the chunk again with the changes, and the new chunk");
  assert.equal(a.store.status().pending, 0);
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), holds(a.store));
  assert.equal(b.store.get(idOf(1))!.category, "while-sending");
  // two syncs asked for at once run one after the other
  a.store.add("txn", "t/x", txn(4));
  const [one, two] = await Promise.all([a.store.sync(a.net), a.store.sync(a.net)]);
  assert.equal(ok(one).sent + ok(two).sent, 1);
});

test("flush keeps what was not sent, sealed, and reopening finds it", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1, { note: "MARKER-UNSENT-1" }));
  ok(await a.store.sync(a.net));
  a.store.change(idOf(1), { category: "later" });
  a.store.add("txn", "t/y", txn(2, { note: "MARKER-UNSENT-2" }));
  await a.store.flush();
  for (const bytes of a.cache.inner.everything()) assert.equal(includes(bytes, "MARKER-UNSENT"), false);
  await a.reopen();
  assert.equal(a.store.get(idOf(1))!.category, "later");
  assert.ok(a.store.get(idOf(2)));
  assert.equal(a.store.status().pending, 2);
  // what was not flushed is gone with the page: only what `flush` saw is kept
  a.store.add("txn", "t/y", txn(3));
  await a.reopen();
  assert.equal(a.store.get(idOf(3)), undefined);
  assert.equal(ok(await a.store.sync(a.net)).sent, 2);
});

test("quotas hold, and a refused batch writes nothing (T-14)", async () => {
  const vault = await testVault();
  let day = "2026-11-20";
  const remote = new MemoryRemote(vault.id, { ...LIMITS, writesPerDay: 3, vaultBytes: 40_000 }, () => day);
  const a = await device(vault, remote);
  for (let i = 0; i < 4; i++) a.store.add("txn", `t/${i}`, txn(i));
  const refused = await a.store.sync(a.net);
  assert.deepEqual([refused.ok, refused.ok ? "" : refused.why], [false, "quota-writes"]);
  assert.equal(remote.size, 0);
  assert.equal(a.store.status().pending, 4);
  // three fit today
  a.store.remove(idOf(3));
  assert.equal(ok(await a.store.sync(a.net)).sent, 3);
  a.store.change(idOf(0), { note: "one more" });
  assert.equal((await a.store.sync(a.net)).ok, false);
  day = "2026-11-21";
  assert.equal(ok(await a.store.sync(a.net)).sent, 1);
  // bytes: what would take the vault over its size is refused whole, and stays on the device
  for (let i = 0; i < 20; i++) a.store.add("txn", "t/0", txn(100 + i, { note: "n".repeat(3000) }));
  const full = await a.store.sync(a.net);
  assert.deepEqual([full.ok, full.ok ? "" : full.why], [false, "quota-bytes"]);
  assert.ok(remote.bytes() < 40_000);
  assert.equal(a.store.list("txn").length, 23);
  for (let i = 5; i < 20; i++) a.store.remove(idOf(100 + i));
  day = "2026-11-22";
  assert.equal(ok(await a.store.sync(a.net)).sent, 1);
});

test("the server checks every write before it takes any", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id, { ...LIMITS, batchWrites: 3, blobBytes: 5000, batchBytes: 9000 });
  const blob = new Uint8Array(100);
  const write = (id = newId(), base = 0, bytes = blob): Write => ({ id, base, blob: bytes });
  const bad: unknown[] = [[], [write(), write(), write(), write()], [write("nope")], [write(undefined, -1)], [write(undefined, 1.5)], [write(undefined, 0, new Uint8Array(28))], [{ id: newId(), base: 0, blob: "text" }], [null], "nope"];
  for (const writes of bad) assert.deepEqual(await remote.push(vault.id, writes as Write[]), { ok: false, why: "bad-request" });
  const twice = newId();
  assert.deepEqual(await remote.push(vault.id, [write(twice), write(twice)]), { ok: false, why: "bad-request" });
  assert.deepEqual(await remote.push(vault.id, [write(undefined, 0, new Uint8Array(5001))]), { ok: false, why: "too-big" });
  assert.deepEqual(await remote.push(vault.id, [write(undefined, 0, new Uint8Array(4000)), write(undefined, 0, new Uint8Array(4000)), write(undefined, 0, new Uint8Array(4000))]), { ok: false, why: "too-big" });
  assert.deepEqual(await remote.push(newId(), [write()]), { ok: false, why: "wrong-vault" });
  assert.deepEqual(await remote.pull(newId(), 0), { ok: false, why: "wrong-vault" });
  assert.deepEqual(await remote.pull(vault.id, -1), { ok: false, why: "bad-request" });
  assert.equal(remote.size, 0);
  // versions count up across the vault, one a chunk; a write names the version it was made from
  const [x, y] = [newId(), newId()];
  assert.deepEqual(await remote.push(vault.id, [write(x), write(y)]), { ok: true, versions: [{ id: x, version: 1 }, { id: y, version: 2 }] });
  const made = (bytes: Uint8Array): string => markOf(bytes);
  assert.deepEqual(await remote.push(vault.id, [{ ...write(x, 1), mark: made(blob) }]), { ok: true, versions: [{ id: x, version: 3 }] });
  // a write made from a copy says which: its number and its mark. Without the mark it is not a request; a first write has none.
  assert.deepEqual(await remote.push(vault.id, [write(x, 3)]), { ok: false, why: "bad-request" });
  assert.deepEqual(await remote.push(vault.id, [{ ...write(newId(), 0), mark: made(blob) }]), { ok: false, why: "bad-request" });
  assert.deepEqual(await remote.push(vault.id, [{ ...write(x, 3), mark: "short" }]), { ok: false, why: "bad-request" });
  const stale = await remote.push(vault.id, [{ ...write(y, 2), mark: made(blob) }, { ...write(x, 1), mark: made(blob) }, { ...write(newId(), 7), mark: made(blob) }]);
  assert.ok(!stale.ok && stale.why === "stale");
  assert.deepEqual(stale.chunks.map((chunk) => [chunk.version, chunk.blob?.length]), [[3, 100], [0, undefined]]);
  // the right number with the mark of another copy is stale too
  const other = new Uint8Array(100).fill(7);
  const wrong = await remote.push(vault.id, [{ ...write(x, 3, other), mark: made(other) }]);
  assert.ok(!wrong.ok && wrong.why === "stale" && wrong.chunks[0]!.version === 3);
  assert.deepEqual((await remote.pull(vault.id, 0) as Extract<Pulled, { ok: true }>).chunks.map((chunk) => chunk.version), [2, 3]);
  assert.deepEqual((await remote.pull(vault.id, 2) as Extract<Pulled, { ok: true }>).chunks.map((chunk) => chunk.id), [x]);
  // what it hands out is a copy: changing it changes nothing it holds
  const page = (await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>;
  page.chunks[0]!.blob[0] = 99;
  assert.equal(((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks[0]!.blob[0], 0);
});

test("a pull comes in pages, and nothing is missed between them", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id, { ...LIMITS, pageBytes: 20_000 });
  const a = await device(vault, remote);
  for (let i = 0; i < 30; i++) a.store.add("txn", `t/${i}`, txn(i, { note: "n".repeat(3000) }));
  ok(await a.store.sync(a.net));
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.ok(b.net.pulls >= 5, `${b.net.pulls} pages`);
  assert.deepEqual(holds(b.store), holds(a.store));
});

test("the server holds another vault: nothing is sent and nothing is changed", async () => {
  const vault = await testVault();
  const a = await device(vault, new MemoryRemote(vault.id));
  a.store.add("txn", "t/x", txn(1));
  ok(await a.store.sync(a.net));
  a.store.add("txn", "t/x", txn(2));
  const reset = new MemoryRemote(newId());
  const result = await a.store.sync(reset);
  assert.deepEqual([result.ok, result.ok ? "" : result.why], [false, "wrong-vault"]);
  assert.equal(reset.size, 0);
  assert.equal(a.store.list("txn").length, 2);
  // and a cache that belongs to another vault is emptied, not read
  const other = await testVault();
  const stranger = await Store.open(other, a.cache);
  assert.equal(stranger.status().records, 0);
  assert.equal(await a.cache.load(), null);
});

test("a server that went back is noticed by a device that had seen more, and nothing is changed on either side", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  ok(await a.store.sync(a.net));
  const earlier = remote.snapshot();
  a.store.add("txn", "t/x", txn(2));
  a.store.add("txn", "t/y", txn(3));
  ok(await a.store.sync(a.net));
  const mine = holds(a.store);
  // the platform restores an older copy (BAK-1)
  remote.restore(earlier);
  const held = remote.everything();
  a.store.change(idOf(1), { note: "after" });
  const result = await a.store.sync(a.net);
  assert.deepEqual([result.ok, result.ok ? "" : result.why], [false, "server-older"]);
  assert.deepEqual(remote.everything(), held);
  assert.deepEqual(holds(a.store), { ...mine, [idOf(1)]: `txn ${canonical({ ...txn(1), note: "after" })}` });
  // a device that has never synced cannot notice: it gets the older copy. A stated limit.
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.deepEqual(Object.keys(holds(b.store)), [idOf(1)]);

  // the version numbers did not go back, but a chunk this device had is gone
  const remote2 = new MemoryRemote(vault.id);
  const c = await device(vault, remote2);
  c.store.add("txn", "t/x", txn(1));
  c.store.add("txn", "t/y", txn(2));
  ok(await c.store.sync(c.net));
  const now = remote2.snapshot();
  now.chunks.delete([...now.chunks.keys()][0]!);
  remote2.restore(now);
  c.store.change(idOf(1), { note: "x" });
  c.store.change(idOf(2), { note: "y" });
  const gone = await c.store.sync(c.net);
  assert.deepEqual([gone.ok, gone.ok ? "" : gone.why], [false, "server-older"]);
  assert.equal(remote2.size, 1);
  assert.equal(c.store.list("txn").length, 2);

  // the server says "stale" and hands back the version this device already has, with other bytes
  const honest = new MemoryRemote(vault.id);
  const d = await device(vault, honest);
  d.store.add("txn", "t/x", txn(1));
  ok(await d.store.sync(d.net));
  d.store.change(idOf(1), { note: "z" });
  const lying: Remote = {
    pull: (v, since) => honest.pull(v, since),
    push: async (_vault, writes) => ({ ok: false, why: "stale", chunks: [{ id: writes[0]!.id, version: 1, blob: new Uint8Array(64) }] }),
  };
  const same = await d.store.sync(lying);
  assert.deepEqual([same.ok, same.ok ? "" : same.why], [false, "server-older"]);
  assert.equal(d.store.get(idOf(1))!.note, "z");
});

test("after a restore the server gives old numbers to other copies: a device that was ahead is not fooled by the number", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  const earlier = remote.snapshot();
  a.store.change(idOf(1), { note: "a, version 2" });
  ok(await a.store.sync(a.net));
  const [chunk] = remote.ids();
  const mine = ((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks[0]!;
  assert.equal(mine.version, 2);
  // the restore; then the other device, which never saw a's version 2, writes its own version 2
  remote.restore(earlier);
  b.store.change(idOf(1), { category: "b, also version 2" });
  ok(await b.store.sync(b.net));
  const theirs = ((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks[0]!;
  assert.equal(theirs.version, 2);
  // a write that names version 2 and the copy a had is refused: the number matches, the copy does not
  const forged = await remote.push(vault.id, [{ id: chunk!, base: 2, mark: markOf(mine.blob), blob: mine.blob }]);
  assert.ok(!forged.ok && forged.why === "stale");
  // and a itself notices as soon as it looks: what the server holds is not what a believes it holds
  a.store.change(idOf(1), { note: "a, version 3" });
  const held = remote.everything();
  const result = await a.store.sync(a.net);
  assert.deepEqual(result.ok ? [] : [result.why, result.chunks], ["server-older", [chunk]]);
  assert.deepEqual(remote.everything(), held);
  assert.equal(a.store.get(idOf(1))!.note, "a, version 3");
  // the way out that needs nothing new: take the server's copy. What only this device had goes with its cache.
  await a.cache.clear();
  await a.reopen();
  ok(await a.store.sync(a.net));
  assert.deepEqual(a.store.get(idOf(1)), { ...txn(1), category: "b, also version 2" });
});

test("a newer copy that was not built on this device's copy is not merged with it", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  const b = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  a.store.add("txn", "t/x", txn(2));
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  const earlier = remote.snapshot();
  a.store.add("txn", "t/x", txn(3));
  ok(await a.store.sync(a.net)); // version 2, on a and on the server
  remote.restore(earlier);
  // b writes twice: the server is at version 3 now, past anything a has seen, and its chunk is the only one
  b.store.change(idOf(1), { category: "b" });
  ok(await b.store.sync(b.net));
  b.store.remove(idOf(2));
  ok(await b.store.sync(b.net));
  // To a this looks like an ordinary newer version, and the digest agrees. Merged as one, it would take record 3 for
  // "removed by the other side". The copy's own history says it was never built on a's version 2.
  const result = await a.store.sync(a.net);
  assert.deepEqual(result.ok ? [] : [result.why, result.chunks], ["server-older", remote.ids()]);
  assert.deepEqual(Object.keys(holds(a.store)).sort(), [idOf(1), idOf(2), idOf(3)].sort());
});

test("an older copy handed back under a higher number is not taken, however many versions back it is", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id, { ...LIMITS, writesPerDay: 1000 });
  const a = await device(vault, remote);
  const away = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  const old: { [version: number]: Uint8Array } = {};
  for (let i = 1; i <= 40; i++) {
    a.store.change(idOf(1), { note: `version ${i}` });
    if (i === 30) a.store.add("txn", "t/x", txn(2));
    ok(await a.store.sync(a.net));
    old[i] = ((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks[0]!.blob;
    // another device sees the first version, changes something of its own, and then stays away
    if (i === 1) {
      ok(await away.store.sync(away.net));
      away.store.change(idOf(1), { category: "from the device that was away" });
    }
  }
  const [id] = remote.ids();
  for (const back of [39, 20, 3]) {
    // a server that means harm: it hands back a genuine older blob and calls it version 41
    const hostile: Remote = {
      pull: async () => ({ ok: true, cursor: 41, more: false, digest: digestOf([markOf(old[back]!)]), chunks: [{ id: id!, version: 41, blob: old[back]! }] }),
      push: (v, writes) => remote.push(v, writes),
    };
    const result = await a.store.sync(hostile);
    assert.deepEqual(result.ok ? [] : [result.why, result.chunks], ["server-older", [id]], `${back} versions in`);
    assert.equal(a.store.get(idOf(1))!.note, "version 40");
    assert.ok(a.store.get(idOf(2)), "a record added since that older copy was taken for removed");
  }
  // the honest server still works
  a.store.change(idOf(1), { note: "after" });
  ok(await a.store.sync(a.net));
  // And a copy that really is forty versions on is taken by the device that was away, although the name of the
  // version it has is long gone from the list: by the copy's own count it is far enough ahead for that.
  ok(await away.store.sync(away.net));
  assert.deepEqual(away.store.get(idOf(1)), { ...txn(1), note: "after", category: "from the device that was away" });
  assert.ok(away.store.get(idOf(2)));
});

test("the digest: what a device believes the server holds, against what it holds", async () => {
  const marks = ["AAAAAAAAAAAAAAAB", "AAAAAAAAAAAAAAAC", "abcdefghijklmnop"];
  assert.equal(digestOf(marks), digestOf([...marks].reverse()));
  assert.equal(digestOf([...marks, marks[1]!]), digestOf([marks[0]!, marks[2]!]));
  assert.equal(digestOf([]), "AAAAAAAAAAAAAAAA");
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  for (let i = 0; i < 5; i++) a.store.add("txn", `t/${i}`, txn(i));
  ok(await a.store.sync(a.net));
  const page = (await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>;
  assert.equal(page.digest, digestOf(page.chunks.map((chunk) => markOf(chunk.blob))));
  // a device whose place in the list is wrong (it believes it has seen everything, and has not) asks for everything again
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  a.store.add("txn", "t/new", txn(9));
  ok(await a.store.sync(a.net));
  const skipping: Remote = {
    // hides the newest chunk unless asked from the very start
    pull: async (v, since) => {
      const all = (await remote.pull(v, since)) as Extract<Pulled, { ok: true }>;
      return since === 0 ? all : { ...all, chunks: [] };
    },
    push: (v, writes) => remote.push(v, writes),
  };
  const fixed = ok(await b.store.sync(skipping));
  assert.equal(fixed.received, 1);
  assert.ok(b.store.get(idOf(9)));
  // and an answer whose digest never adds up is not acted on
  const wrong: Remote = { pull: async (v, since) => ({ ...((await remote.pull(v, since)) as Extract<Pulled, { ok: true }>), digest: "AAAAAAAAAAAAAAAB" }), push: (v, writes) => remote.push(v, writes) };
  const refused = await b.store.sync(wrong);
  assert.deepEqual([refused.ok, refused.ok ? "" : refused.why], [false, "bad-reply"]);
});

test("answers that are not answers: the sync says so, ends, and keeps what it was sending", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const writer = await device(vault, remote);
  for (let i = 0; i < 3; i++) writer.store.add("txn", `t/${i}`, txn(i));
  ok(await writer.store.sync(writer.net));
  const honest = (await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>;
  const why = async (store: Store, bad: Partial<Remote>) => {
    const result = await store.sync({ pull: (v, n) => remote.pull(v, n), push: (v, w) => remote.push(v, w), ...bad });
    return result.ok ? "ok" : result.why;
  };
  const reader = (await device(vault, remote)).store;
  // not an answer at all
  for (const reply of [null, undefined, 7, "ok", [], {}, { ok: "yes" }, { ok: false, why: "because" }, { ok: true }, { ...honest, more: "no" }, { ...honest, digest: 5 }, { ...honest, chunks: [{ id: "nope", version: 1, blob: new Uint8Array(40) }] }]) {
    assert.equal(await why(reader, { pull: async () => reply as unknown as Pulled }), "bad-reply", JSON.stringify(reply)?.slice(0, 60));
  }
  // pages that never end: the same chunk again and again, and new chunks for ever
  let pulls = 0;
  assert.equal(await why(reader, { pull: async (_v, since) => (pulls++, { ...honest, cursor: since + 1, more: true, chunks: [{ ...honest.chunks[0]!, version: since + 1 }] }) }), "bad-reply");
  assert.ok(pulls <= 9, `${pulls} pages of the same chunk`);
  pulls = 0;
  const endless = await why(reader, { pull: async (_v, since) => (pulls++, { ...honest, cursor: since + 1, more: true, chunks: [{ id: idOf(100_000 + since), version: since + 1, blob: new Uint8Array(40) }] }) });
  assert.equal(endless, "bad-reply");
  assert.ok(pulls <= 1001, `${pulls} pages`);
  assert.equal(reader.status().records, 0, "none of it was taken");
  // the store is still usable afterwards, and nothing waits behind the sync that was cut short
  assert.equal(await why(reader, {}), "ok");
  assert.equal(reader.list("txn").length, 3);

  // a push answered with nonsense: what was sent is treated as of unknown fate, and settled by the next honest answer
  reader.add("txn", "t/0", txn(50));
  for (const reply of [null, undefined, "taken", { ok: false, why: "because" }, { ok: true, versions: "all" }, { ok: true, versions: [] }, { ok: false, why: "stale", chunks: [] }, { ok: false, why: "stale", chunks: [{ id: idOf(999), version: 3, blob: new Uint8Array(40) }] }]) {
    assert.equal(await why(reader, { push: async () => reply as unknown as Pushed }), "bad-reply", JSON.stringify(reply)?.slice(0, 60));
    assert.equal(reader.status().pending, 1);
  }
  // one of those "answers" may have come after the server took the write: here it did
  assert.equal(await why(reader, { push: async (v, w) => (await remote.push(v, w), null as unknown as Pushed) }), "bad-reply");
  assert.equal(await why(reader, {}), "ok");
  assert.equal(reader.status().pending, 0);
  ok(await writer.store.sync(writer.net));
  assert.equal(writer.store.list("txn").length, 4);
});

test("the answer to a push is believed only if it answers that push: any other leaves what was sent as of unknown fate", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  a.store.add("txn", "t/y", txn(2));
  ok(await a.store.sync(a.net));
  // the copies the next writes are made from
  const [x] = ((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks;
  const other = new Uint8Array(64).fill(7);
  // two chunks the server has are changed, and one is new
  a.store.change(idOf(1), { note: "x" });
  a.store.change(idOf(2), { note: "y" });
  a.store.add("txn", "t/z", txn(5));
  const why = async (push: (writes: readonly Write[]) => unknown) => {
    const result = await a.store.sync({ pull: (v, n) => remote.pull(v, n), push: async (_v, writes) => (await push(writes)) as Pushed });
    return result.ok ? "ok" : result.why;
  };
  const stale = (...chunks: unknown[]) => () => ({ ok: false, why: "stale", chunks });
  const taken = (versions: (writes: readonly Write[]) => unknown) => (writes: readonly Write[]) => ({ ok: true, versions: versions(writes) });
  const answers: [string, (writes: readonly Write[]) => unknown][] = [
    // "stale" that shows nothing stale, or is not about this request
    ["stale: the very copy the write was made from", stale(x)],
    ["stale: that copy, twice", stale(x, x)],
    ["stale: that copy under a later number", stale({ ...x!, version: 9 })],
    ["stale: one chunk named twice", stale({ id: x!.id, version: 9, blob: other }, { id: x!.id, version: 9, blob: other })],
    ["stale: a chunk that was not in the request", stale({ id: idOf(999), version: 9, blob: other })],
    ["stale: a copy with no number", stale({ id: x!.id, version: 0, blob: other })],
    ["stale: a copy too short to be one", stale({ id: x!.id, version: 9, blob: new Uint8Array(10) })],
    ["stale: a number and no copy", stale({ id: x!.id, version: 9 })],
    ["stale: a copy that is not bytes", stale({ id: x!.id, version: 9, blob: "bytes" })],
    ["stale: nothing shown", stale()],
    ["stale: not a list", () => ({ ok: false, why: "stale", chunks: { 0: x } })],
    ["stale: an entry that is nothing", stale(null)],
    ["stale: 'the server holds none' for a chunk the write itself called new", (w) => ({ ok: false, why: "stale", chunks: [{ id: w.find((write) => write.base === 0)!.id, version: 0 }] })],
    // "taken" that does not account for the request
    ["taken: one chunk missing", taken((w) => w.slice(1).map((write, i) => ({ id: write.id, version: 10 + i })))],
    ["taken: one chunk named twice", taken((w) => w.map((write, i) => ({ id: (i === 1 ? w[0]! : write).id, version: 10 + i })))],
    ["taken: a chunk that was not in the request", taken((w) => w.map((write, i) => ({ id: i === 1 ? idOf(999) : write.id, version: 10 + i })))],
    ["taken: one more than was sent", taken((w) => [...w.map((write, i) => ({ id: write.id, version: 10 + i })), { id: idOf(999), version: 20 }])],
    ["taken: the same number for two chunks", taken((w) => w.map((write) => ({ id: write.id, version: 10 })))],
    ["taken: a number no later than the copy it replaces", taken((w) => w.map((write, i) => ({ id: write.id, version: write.base > 0 ? write.base : 10 + i })))],
    ["taken: a number this device has already been past", taken((w) => w.map((write, i) => ({ id: write.id, version: write.base === 0 ? 2 : 10 + i })))],
    ["taken: a number that is not a whole number", taken((w) => w.map((write, i) => ({ id: write.id, version: 10.5 + i })))],
    ["taken: no list", () => ({ ok: true })],
    ["taken: an entry that is nothing", taken((w) => [null, ...w.slice(1).map((write, i) => ({ id: write.id, version: 10 + i }))])],
    // neither
    ["refused for a reason nobody knows", () => ({ ok: false, why: "because" })],
    ["refused for no reason", () => ({ ok: false })],
    ["not an answer", () => "stale"],
  ];
  for (const [what, push] of answers) {
    assert.equal(await why(push), "bad-reply", what);
    assert.equal(a.store.status().pending, 3, what);
  }
  // (and a well-formed one is taken as such: the three numbers are what the checks above would let through)
  assert.equal(await why(() => ({ ok: false, why: "quota-writes" })), "quota-writes");
  // One such answer came although the server had taken the writes. Then something is undone, and the page is closed and
  // opened again: the copy that was sent is still known, so what the server holds is recognized and the undo holds.
  assert.equal(
    await why(async (writes) => {
      assert.ok((await remote.push(vault.id, writes)).ok);
      return { ok: false, why: "stale", chunks: [x] };
    }),
    "bad-reply",
  );
  a.store.change(idOf(1), { note: undefined });
  await a.store.flush();
  await a.reopen();
  ok(await a.store.sync(a.net));
  assert.deepEqual(a.store.get(idOf(1)), txn(1));
  assert.equal(a.store.get(idOf(2))!.note, "y");
  const b = await device(vault, remote);
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), holds(a.store));

  // An answer that is no answer, to a request that is still on its way. A proper refusal of the next request (for today's
  // quota, say) is about that next request only: the first one can still arrive, so what it carried is not forgotten.
  a.store.add("txn", "t/x", txn(6));
  let onItsWay: readonly Write[] = [];
  assert.equal(
    await why((writes) => {
      onItsWay = structuredClone(writes);
      return null;
    }),
    "bad-reply",
  );
  a.store.remove(idOf(6));
  assert.equal(await why(() => ({ ok: false, why: "quota-writes" })), "quota-writes");
  assert.ok((await remote.push(vault.id, onItsWay)).ok, "the first request arrives after all");
  ok(await a.store.sync(a.net));
  assert.equal(a.store.get(idOf(6)), undefined, "a record taken out again came back with the request that had no answer");
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), holds(a.store));

  // The same through a pull: the copy this device already has, handed back under a later number, is not "the chunk has
  // moved on". Taking it for that would give up a sent copy that can still arrive.
  a.store.add("txn", "t/x", txn(3));
  a.net.plan = ["late"];
  assert.equal((await a.store.sync(a.net)).ok, false);
  a.store.remove(idOf(3));
  await a.store.flush();
  const now = (await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>;
  const base = now.chunks.find((chunk) => chunk.id === x!.id)!;
  const renumbered = await a.store.sync({
    pull: async () => ({ ok: true, cursor: 50, more: false, digest: now.digest, chunks: [{ ...base, version: 50 }] }),
    push: () => assert.fail("nothing is sent after such an answer"),
  });
  assert.deepEqual(renumbered.ok ? [] : [renumbered.why, renumbered.chunks], ["bad-reply", [x!.id]]);
  await a.reopen();
  assert.equal((await a.net.deliver())!.ok, true, "the request that was on its way arrives");
  ok(await a.store.sync(a.net));
  assert.equal(a.store.get(idOf(3)), undefined, "a record taken out again came back with the late request");
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), holds(a.store));
});

test("the server's numbers only go up: a count that went back, or a number at or under the copy it replaces, is not believed", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  a.store.add("txn", "t/x", txn(1));
  ok(await a.store.sync(a.net)); // the chunk is number 1, and a has seen up to 1
  const [x] = remote.ids();
  // Another device writes between a's look and a's write: a's write gets number 3, and a's place stays at 1 until it looks again.
  const b = await device(vault, remote);
  b.store.add("txn", "t/y", txn(2));
  a.store.change(idOf(1), { note: "one" });
  a.net.between = async () => {
    ok(await b.store.sync(b.net));
  };
  ok(await a.store.sync(a.net));
  const mine = ((await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>).chunks.find((chunk) => chunk.id === x)!;
  assert.equal(mine.version, 3);
  // A server that answers a's next look as if nothing had happened since (a's own picture agrees), and then gives a's
  // write a number that is past a's place but not past the copy it replaces.
  a.store.change(idOf(1), { note: "two" });
  const low = await a.store.sync({
    pull: async () => ({ ok: true, cursor: 1, more: false, digest: digestOf([markOf(mine.blob)]), chunks: [] }),
    push: async (_v, writes) => ({ ok: true, versions: [{ id: writes[0]!.id, version: 2 }] }),
  });
  assert.deepEqual([low.ok, low.ok ? "" : low.why], [false, "bad-reply"]);
  assert.equal(a.store.status().pending, 1);
  // the honest server sorts it out: a sees the other device's chunk, and its own write goes through
  ok(await a.store.sync(a.net));
  assert.equal(a.store.list("txn").length, 2);
  // A look that puts the server's count behind a's own place, with everything else as a believes it: the count went back.
  a.store.change(idOf(1), { note: "three" });
  const now = (await remote.pull(vault.id, 0)) as Extract<Pulled, { ok: true }>;
  assert.equal(now.cursor, 4);
  const back = await a.store.sync({
    pull: async () => ({ ok: true, cursor: 2, more: false, digest: now.digest, chunks: [] }),
    push: () => assert.fail("nothing is sent to a server whose count went back"),
  });
  assert.deepEqual([back.ok, back.ok ? "" : back.why], [false, "server-older"]);
  assert.equal(a.store.get(idOf(1))!.note, "three");
  ok(await a.store.sync(a.net));
  ok(await b.store.sync(b.net));
  assert.deepEqual(holds(b.store), holds(a.store));
});

test("a server that never answers: the sync gives that request up, the saves behind it go on, and nothing that was sent is forgotten", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const cache = new MemoryCache();
  let store = await Store.open(vault, cache, { patience: 40 });
  store.add("txn", "t/x", txn(1));
  const never = new Promise<never>(() => undefined);
  // a pull that never answers
  const started = Date.now();
  const hung = store.sync({ pull: () => never, push: (v, w) => remote.push(v, w) });
  store.add("txn", "t/x", txn(2));
  const flushing = store.flush(); // waits its turn behind the sync
  const first = await hung;
  assert.deepEqual([first.ok, first.ok ? "" : first.why], [false, "offline"]);
  await flushing;
  assert.ok(Date.now() - started < 5000);
  assert.equal(((await Store.open(vault, cache)).list("txn")).length, 2, "what was added while the sync hung is in the cache");
  // a push that never answers, although the server took it
  const second = await store.sync({
    pull: (v, n) => remote.pull(v, n),
    push: (v, w) => {
      void remote.push(v, w);
      return never;
    },
  });
  assert.deepEqual([second.ok, second.ok ? "" : second.why], [false, "offline"]);
  assert.equal(remote.size, 1);
  assert.equal(store.status().pending, 1);
  // something in it is taken back while its fate is unknown, and the page is closed and opened again
  store.remove(idOf(2));
  await store.flush();
  store = await Store.open(vault, cache, { patience: 40 });
  ok(await store.sync(remote));
  assert.deepEqual(Object.keys(holds(store)), [idOf(1)]);
  const other = await Store.open(vault, new MemoryCache());
  ok(await other.sync(remote));
  assert.deepEqual(holds(other), holds(store));
  // an answer that comes in time is not cut short, and a request that throws at once is "no answer", not an exception
  store.add("txn", "t/x", txn(4));
  ok(await store.sync({ pull: (v, n) => new Promise((resolve) => setTimeout(() => resolve(remote.pull(v, n)), 10)), push: (v, w) => remote.push(v, w) }));
  const thrown = await store.sync({
    pull: () => {
      throw new Error("no network");
    },
    push: (v, w) => remote.push(v, w),
  });
  assert.deepEqual([thrown.ok, thrown.ok ? "" : thrown.why], [false, "offline"]);
});

test("a chunk that cannot be read stops the sync before anything changes", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  for (let i = 0; i < 3; i++) a.store.add("txn", `t/${i}`, txn(i));
  ok(await a.store.sync(a.net));
  const [first, second] = remote.ids();
  remote.corrupt(second!, (blob) => {
    blob[20] = blob[20]! ^ 1;
    return blob;
  });
  const b = await device(vault, remote);
  b.store.add("txn", "t/new", txn(50));
  const result = await b.store.sync(b.net);
  assert.deepEqual(result.ok ? [] : [result.why, result.chunks], ["unreadable", [second]]);
  assert.deepEqual(Object.keys(holds(b.store)), [idOf(50)], "none of the three chunks was taken, not even the two that open");
  assert.equal(remote.size, 3, "and nothing was sent");
  // a chunk from a later version of the app: said so
  remote.corrupt(first!, (blob) => {
    blob[0] = 2;
    return blob;
  });
  const c = await device(vault, remote);
  const newer = await c.store.sync(c.net);
  assert.deepEqual(newer.ok ? [] : [newer.why, newer.chunks], ["newer", [first]]);
  // a chunk that opens and is not a chunk of records (sealed by a device gone wrong): the same
  const remote2 = new MemoryRemote(vault.id);
  const { seal } = await import("../src/vault/crypto");
  const id = newId();
  await remote2.push(vault.id, [{ id, base: 0, blob: await seal(vault, { id, type: "records" }, new TextEncoder().encode('{"v":1,"nonsense":true}')) }]);
  const d = await device(vault, remote2);
  const malformed = await d.store.sync(d.net);
  assert.deepEqual(malformed.ok ? [] : [malformed.why, malformed.chunks], ["malformed", [id]]);
  // the device that wrote the good copy still has it, and what it sends next heals the server
  a.store.change(idOf(1), { note: "again" });
  a.store.change(idOf(0), { note: "again" });
  ok(await a.store.sync(a.net));
  const e = await device(vault, remote);
  ok(await e.store.sync(e.net));
  assert.deepEqual(holds(e.store), holds(a.store));
});

test("a cached chunk that does not open is left out, and the server is asked for everything again", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const a = await device(vault, remote);
  for (let i = 0; i < 3; i++) a.store.add("txn", `t/${i}`, txn(i));
  ok(await a.store.sync(a.net));
  const all = holds(a.store);
  a.store.change(idOf(2), { note: "not sent yet" });
  await a.store.flush();
  const ids = a.cache.inner.ids();
  a.cache.inner.corrupt(ids[0]!, "base", (blob) => {
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 1;
    return blob;
  });
  await a.reopen();
  assert.equal(a.store.status().damaged, 1);
  assert.equal(a.store.list("txn").length, 2);
  ok(await a.store.sync(a.net));
  assert.deepEqual(holds(a.store), { ...all, [idOf(2)]: `txn ${canonical({ ...txn(2), note: "not sent yet" })}` });
  await a.reopen();
  assert.equal(a.store.status().damaged, 0);
  assert.equal(a.store.list("txn").length, 3);
  // an entry that makes no sense is left out the same way
  await a.cache.inner.save(vault.id, { cursor: 5, put: [{ id: newId(), version: 3 }, { id: "nope", version: 0 }], drop: [] });
  await a.reopen();
  assert.equal(a.store.status().damaged, 2);
  assert.equal(a.store.list("txn").length, 3);
});

test("three devices fill the same chunk: nothing is lost, and no chunk is too large to seal", async () => {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  const devices = [await device(vault, remote), await device(vault, remote), await device(vault, remote)];
  devices[0]!.store.add("txn", "t/big", txn(0));
  ok(await devices[0]!.store.sync(devices[0]!.net));
  for (const d of devices) ok(await d.store.sync(d.net));
  const big = "n".repeat(3900);
  let n = 1;
  const added: string[] = [idOf(0)];
  for (const d of devices) {
    // as many as the chunk takes on this device, offline
    while (d.store.status().chunks === 1) {
      d.store.add("txn", "t/big", txn(n, { note: big }));
      added.push(idOf(n++));
    }
  }
  for (const d of devices) ok(await d.store.sync(d.net));
  for (const d of devices) ok(await d.store.sync(d.net));
  for (const d of devices) {
    assert.deepEqual(Object.keys(holds(d.store)).sort(), [...added].sort());
    assert.equal(d.store.status().pending, 0);
    assert.equal(d.store.status().doubled, 0);
  }
  assert.ok(n > 300, `${n} records`);
  for (const bytes of remote.everything()) assert.ok(bytes.length <= LIMITS.blobBytes);
  // every record is in exactly one chunk on the server
  const seen = new Map<string, number>();
  const page = await remote.pull(vault.id, 0);
  assert.ok(page.ok && !page.more);
  for (const chunk of page.chunks) {
    const opened = await openContent(vault, chunk.id, chunk.blob);
    assert.ok(opened.ok);
    for (const id of opened.content.records.keys()) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  assert.equal(seen.size, added.length);
  assert.ok([...seen.values()].every((count) => count === 1));
});

test("three devices, a bad network, pages closed half-way: they end the same, and nothing is lost or doubled", async (t) => {
  // More runs: MONEYLENS_SEEDS=500 npx tsx --test tests/sync.test.ts. One run again: MONEYLENS_SEED=37.
  const only = Number(process.env.MONEYLENS_SEED ?? 0);
  const runs = only ? 1 : Number(process.env.MONEYLENS_SEEDS ?? 8);
  /** How often each hard case came up, so that a change to the test that stops reaching one is noticed. */
  const met = { stale: 0, lost: 0, late: 0, closed: 0, clashes: 0, refusedLate: 0, takenLate: 0 };
  for (let seed = only || 1; seed <= (only || runs); seed++) {
    const random = seeded(seed * 7919);
    const pick = (n: number) => Math.floor(random() * n);
    // the same "random" bytes every run, so that a seed that fails can be run again
    const bytes = seeded(seed * 104729);
    const restore = t.mock.method(globalThis.crypto, "getRandomValues", (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = Math.floor(bytes() * 256);
      return array;
    });
    try {
      const vault = await testVault();
      const remote = new MemoryRemote(vault.id, { ...LIMITS, writesPerDay: 1e9, pageBytes: 3000 });
      // three clocks that disagree by hours
      const devices = [await device(vault, remote, ticking(1_795_000_000_000)), await device(vault, remote, ticking(1_795_007_200_000)), await device(vault, remote, ticking(1_794_990_000_000))];
      const names = ["a", "b", "c", "d"];
      const groups = ["book", "t/one", "t/two"];
      /** What was done, to hold the end state against. */
      const model = new Map<string, { removed: boolean; first: { [name: string]: Json }; writers: Map<string, Set<number>>; last: Map<string, Map<number, Json | undefined>>; ever: Map<string, Set<string>> }>();
      let next = 0;
      for (let step = 0; step < 260; step++) {
        const who = pick(3);
        const d = devices[who]!;
        const roll = pick(100);
        const have = d.store.everything();
        if (roll < 22) {
          const id = idOf(next++);
          const first = Object.fromEntries(names.filter(() => pick(2)).map((name) => [name, pick(5)]));
          assert.deepEqual(d.store.add(pick(2) ? "txn" : "rule", groups[pick(3)]!, { id, ...first }), { ok: true });
          model.set(id, { removed: false, first, writers: new Map(), last: new Map(), ever: new Map() });
        } else if (roll < 52 && have.length) {
          const id = have[pick(have.length)]!.value.id;
          const name = names[pick(4)]!;
          const value: Json | undefined = pick(6) ? pick(5) : undefined;
          assert.deepEqual(d.store.change(id, { [name]: value }), { ok: true });
          const m = model.get(id)!;
          if (!m.writers.has(name)) m.writers.set(name, new Set());
          if (!m.last.has(name)) m.last.set(name, new Map());
          if (!m.ever.has(name)) m.ever.set(name, new Set());
          m.writers.get(name)!.add(who);
          m.last.get(name)!.set(who, value);
          m.ever.get(name)!.add(String(value));
        } else if (roll < 60 && have.length) {
          const id = have[pick(have.length)]!.value.id;
          assert.deepEqual(d.store.remove(id), { ok: true });
          model.get(id)!.removed = true;
        } else if (roll < 66) {
          await d.store.flush();
        } else if (roll < 86) {
          d.net.plan = [(["ok", "ok", "ok", "ok", "lost", "dropped", "late"] as const)[pick(7)]!, (["ok", "ok", "lost"] as const)[pick(3)]!];
          if (d.net.plan.includes("lost")) met.lost += 1;
          d.net.down = pick(12) === 0;
          if (pick(3) === 0) {
            // between this device's look at the server and its write, another device writes, or a late request arrives
            const other = devices[(who + 1 + pick(2)) % 3]!;
            d.net.between = async () => {
              if (pick(2)) await other.store.sync(new Net(remote));
              else await devices[pick(3)]!.net.deliver();
            };
          }
          const result = await d.store.sync(d.net);
          d.net.between = undefined;
          met.clashes += result.clashes.length;
          d.net.down = false;
        } else if (roll < 91) {
          // a request that was given up on arrives now
          const late = await devices[pick(3)]!.net.deliver();
          if (late) met[late.ok ? "takenLate" : "refusedLate"] += 1;
        } else if (roll < 95) {
          await d.store.flush();
          await d.reopen();
        } else {
          // the page is closed in the middle of a sync, at one of its saves
          await d.store.flush();
          d.cache.failIn = 1 + pick(4);
          await d.store.sync(d.net).catch(() => (met.closed += 1));
          d.cache.failIn = Infinity;
          await d.reopen();
        }
      }
      // the network settles: late requests arrive, and everyone syncs until nothing moves
      for (const d of devices) {
        d.net.plan = [];
        met.late += d.net.late.length;
        while (d.net.late.length) await d.net.deliver();
        met.stale += d.net.pushes.filter((reply) => !reply.ok && reply.why === "stale").length;
      }
      for (let pass = 0, moving = true; moving; pass++) {
        assert.ok(pass < 8, `seed ${seed}: the devices never settle`);
        moving = false;
        for (const d of devices) {
          const result = ok(await d.store.sync(d.net));
          if (result.sent || result.received) moving = true;
        }
      }
      const end = holds(devices[0]!.store);
      for (const d of devices) {
        assert.deepEqual(holds(d.store), end, `seed ${seed}: two devices differ`);
        assert.deepEqual(d.store.status(), { records: Object.keys(end).length, chunks: remote.size, pending: 0, damaged: 0, doubled: 0 }, `seed ${seed}`);
      }
      // a device that starts from nothing reads the same from the server
      const fresh = await device(vault, remote);
      ok(await fresh.store.sync(fresh.net));
      assert.deepEqual(holds(fresh.store), end, `seed ${seed}: the server holds something else`);
      for (const [id, m] of model) {
        const now = devices[0]!.store.get(id);
        if (m.removed) {
          assert.equal(now, undefined, `seed ${seed}: a removed record is back`);
          continue;
        }
        assert.ok(now, `seed ${seed}: a record that was added and never removed is gone`);
        for (const name of names) {
          const writers = m.writers.get(name);
          const value: Json | undefined = Object.hasOwn(now, name) ? now[name] : undefined;
          if (!writers) assert.equal(value, m.first[name], `seed ${seed}: a field nobody changed has changed`);
          else if (writers.size === 1) assert.equal(value, m.last.get(name)!.get([...writers][0]!), `seed ${seed}: the only device that changed a field lost its change`);
          else assert.ok(m.ever.get(name)!.has(String(value)), `seed ${seed}: a field holds a value nobody wrote`);
        }
      }
      assert.equal(Object.keys(end).length, [...model.values()].filter((m) => !m.removed).length);
    } finally {
      restore.mock.restore();
    }
  }
  t.diagnostic(`met in ${runs} runs: ${JSON.stringify(met)}`);
  if (runs >= 8) for (const [what, times] of Object.entries(met)) assert.ok(times > 0, `the runs never met: ${what} (${JSON.stringify(met)})`);
});
