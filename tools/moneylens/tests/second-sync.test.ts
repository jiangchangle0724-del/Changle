// C3: all data is invented. No financial data, fixed key material or network.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { merge, type Rec, type Recs } from './second/merge';
import { entryOf, merge3, sealContent, MAX_ENTRY_BYTES, type Entry, type Records } from '../src/vault/records';
import { holdCache } from '../src/web/idbcache';
import { MemoryCache, MemoryRemote } from '../src/vault/memory';
import { Store, LIMITS, markOf, digestOf, type Cache, type Remote, type Write, type Pulled, type Pushed } from '../src/vault/sync';
import type { OpenVault } from '../src/vault/crypto';

function generator(seed: number) {
  let state = seed >>> 0;
  return (n: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 0x100000000 * n);
  };
}
// Seed production-generated ids/nonces too, so chunk packing and late requests
// can be replayed. WebCrypto's nonexportable test keys still come from the OS.
beforeEach(t => {
  assert.ok('mock' in t, 'this hook runs for individual tests');
  const seed = [...t.name].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0xc3);
  const random = generator(seed);
  t.mock.method(crypto, 'getRandomValues', (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) array[i] = random(256);
    return array;
  });
  t.diagnostic(`invented id/nonce byte seed=${seed}`);
});
// Deterministic invented identifiers, independent of the production id helper.
function id(n: number): string {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(n >>> 0, 12);
  return bytes.toString('base64url');
}
function entries(x: Recs): Records {
  return new Map(Object.entries(x).map(([key, r]) => {
    const e = entryOf(r.kind, r.t, { ...r.fields, id: key } as Entry['value']);
    assert.ok(e, 'invented test entry must be valid');
    return [key, e];
  }));
}
function plain(x: Records): Recs {
  return Object.fromEntries([...x].map(([key, r]) => {
    const { id: _id, ...fields } = r.value;
    return [key, { kind: r.kind, t: r.at, fields }];
  }));
}
const ordinary = (x: Recs): Recs => JSON.parse(JSON.stringify(x)) as Recs;

test('independent assessment merge versus merge3: 24,000 seeded hard triples', () => {
  const seed = 0xc3502026, rand = generator(seed);
  const keys = [id(1), id(2), id(3), id(4)];
  const names = ['a', 'z', '10', '2', 'constructor', 'nested'];
  function rec(): Rec {
    const fields: Rec['fields'] = {};
    for (const name of names) if (rand(3)) {
      fields[name] = [null, false, rand(4), 'invented-' + rand(4),
        { z: [rand(3), null], a: { q: rand(3), b: true } }][rand(5)];
    }
    return { kind: ['invented-a', 'invented-b'][rand(2)]!, t: rand(3), fields };
  }
  for (let round = 0; round < 24_000; round++) {
    const base: Recs | undefined = round % 5 === 0 ? undefined : {};
    const here: Recs = {}, there: Recs = {};
    for (const key of keys) {
      const b = rec();
      if (base && rand(4)) base[key] = b;
      const h = rec(), r = rec();
      switch (rand(10)) {
        case 0: here[key] = h; there[key] = r; break;
        case 1: here[key] = structuredClone(b); there[key] = r; break;
        case 2: here[key] = h; there[key] = structuredClone(b); break;
        case 3: here[key] = h; break;
        case 4: there[key] = r; break;
        case 5: here[key] = h; there[key] = { ...structuredClone(h), t: rand(3) }; break;
        case 6: here[key] = { ...b, fields: { ...b.fields, a: 'invented-local' } };
          there[key] = { ...b, fields: { ...b.fields, z: 'invented-remote' } }; break;
        case 7: here[key] = { ...b, fields: { ...b.fields } }; delete here[key]!.fields.a;
          there[key] = { ...b, kind: 'invented-other' }; break;
        case 8: here[key] = h; there[key] = structuredClone(h); break;
        default: break;
      }
    }
    const message = `seed=${seed} triple=${round}`;
    const want = ordinary(merge(base, here, there));
    const got = plain(merge3(base && entries(base), entries(here), entries(there)).records);
    // Compare every id, kind, field AND t. (Before the fix for finding 1 this tolerated, and counted, one
    // disagreement: two equal changed branches, where the code kept the server's t and this oracle the later
    // one. The code now keeps the later one, so nothing is tolerated. Changed by Claude Code after the review.)
    assert.deepEqual(got, want, message);
  }
  console.log(`seed=${seed}; compared=24000; ids, kinds, fields and t all matched`);
});

test('finding 1: equal changed records should choose a symmetric t (fixed after the review)', () => {
  const key = id(1);
  const b: Recs = { [key]: { kind: 'invented', t: 0, fields: { text: 'invented-before' } } };
  const h: Recs = { [key]: { kind: 'invented', t: 2, fields: { text: 'invented-after' } } };
  const r: Recs = { [key]: { ...h[key]!, t: 1 } };
  assert.deepEqual(plain(merge3(entries(b), entries(h), entries(r)).records), ordinary(merge(b, h, r)));
});

async function vault(): Promise<OpenVault> {
  return { id: id(900), key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) };
}
class FailingCache implements Cache {
  readonly disk = new MemoryCache();
  fail = false;
  load: Cache['load'] = () => this.disk.load();
  clear: Cache['clear'] = () => this.disk.clear();
  save: Cache['save'] = async (v, change) => {
    if (this.fail) { this.fail = false; throw new Error('invented atomic save failure'); }
    await this.disk.save(v, change);
  };
}
class Faults implements Remote {
  mode: 'plain' | 'drop' | 'lose' | 'late' | 'twice' = 'plain';
  delayed: (() => Promise<unknown>)[] = [];
  between?: () => Promise<void>;
  constructor(readonly server: MemoryRemote) {}
  pull: Remote['pull'] = (v, n) => this.server.pull(v, n);
  push: Remote['push'] = async (v, writes) => {
    const mode = this.mode; this.mode = 'plain';
    const frozen = structuredClone(writes);
    const between = this.between; this.between = undefined;
    if (between) await between();
    if (mode === 'drop') throw new Error('invented dropped request');
    if (mode === 'late') {
      this.delayed.push(() => this.server.push(v, frozen));
      throw new Error('invented request still in flight');
    }
    const answer = await this.server.push(v, frozen);
    if (mode === 'lose') throw new Error('invented lost answer');
    if (mode === 'twice') await this.server.push(v, frozen);
    return answer;
  };
  async deliver(reverse = false) {
    const queue = this.delayed.splice(0);
    if (reverse) queue.reverse();
    for (const request of queue) { await request(); await request(); }
  }
}
function view(store: Store) {
  return store.everything().sort((a, b) => a.value.id.localeCompare(b.value.id));
}
function ok(result: { ok: boolean }, context = 'invented operation') { assert.equal(result.ok, true, context); }
async function settle(stores: Store[], remote: Remote) {
  for (let pass = 0; pass < 4; pass++) for (const store of stores) ok(await store.sync(remote), `settle pass=${pass}`);
}

test('independent fault schedules: late duplicate requests, lost answers, intervening writers, failed saves and reopen', async () => {
  for (const seed of [0xc301, 0xc30b, 0xc319, 0xc32f, 0xc34d, 0xc36b, 0xc389, 0xc3a7]) {
    try {
      const rand = generator(seed), v = await vault();
      const server = new MemoryRemote(v.id, { ...LIMITS, writesPerDay: 100_000, pageBytes: 400 });
      const caches = [new FailingCache(), new FailingCache(), new FailingCache()];
      let tick = 100;
      const stores = await Promise.all(caches.map(c => Store.open(v, c, { now: () => ++tick })));
      const net = new Faults(server), root = id(500);
      const kind = 'invented-private-kind', group = 'invented-private-group';
      ok(stores[0]!.add(kind, group, { id: root, text: 'invented-private-text', a: 'start', b: 'start', c: 'start' }));
      await settle(stores, net);
      const expected = new Map<string, { kind: string; value: Entry['value'] }>(view(stores[0]!).map(x => [x.value.id, x]));
      const needles = new Set([root, kind, group, 'invented-private-text']);
      for (let turn = 0; turn < 30; turn++) {
        const who = rand(3), store = stores[who]!, field = ['a', 'b', 'c'][who]!;
        const text = `invented-owner-${who}-turn-${turn}`, added = id(seed * 100 + turn);
        ok(store.change(root, { [field]: text }));
        const prior = expected.get(root)!;
        expected.set(root, { kind, value: { ...prior.value, [field]: text } });
        ok(store.add(kind, group, { id: added, text: `invented-item-${turn}` }));
        expected.set(added, { kind, value: { id: added, text: `invented-item-${turn}` } });
        needles.add(added); needles.add(text); needles.add(`invented-item-${turn}`);
        await store.flush();
        net.mode = (['drop', 'lose', 'late', 'twice', 'plain'] as const)[turn % 5]!;
        if (turn % 6 === 0) net.between = async () => {
          const other = stores[(who + 1) % 3]!, own = ['a', 'b', 'c'][(who + 1) % 3]!;
          const value = `invented-interloper-${turn}`;
          ok(other.change(root, { [own]: value }));
          expected.set(root, { kind, value: { ...expected.get(root)!.value, [own]: value } });
          needles.add(value);
          ok(await other.sync(server));
        };
        const result = await store.sync(net);
        assert.ok(result.ok || result.why === 'offline', `seed=${seed} turn=${turn}`);
        if (turn % 3 === 0) {
          ok(store.remove(added)); expected.delete(added);
          await store.flush();
        }
        if (turn % 4 === 0) {
          caches[who]!.fail = true;
          ok(store.change(root, { [field]: text + '-saved' }));
          expected.set(root, { kind, value: { ...expected.get(root)!.value, [field]: text + '-saved' } });
          needles.add(text + '-saved');
          await assert.rejects(store.flush(), /invented atomic save failure/);
          await store.flush();
        }
        // Restart only after a successful explicit flush. The ledger above is
        // independent of merge3 and never derives its expected answer from sync.
        if (turn % 2 === 0) stores[who] = await Store.open(v, caches[who]!, { now: () => ++tick });
        if (turn % 4 === 3) await net.deliver(turn % 8 === 3);
      }
      await net.deliver(true);
      await settle(stores, net);
      const fresh = await Store.open(v, new MemoryCache());
      ok(await fresh.sync(server)); stores.push(fresh);
      const want = [...expected.values()].sort((a, b) => a.value.id.localeCompare(b.value.id));
      for (const store of stores) assert.deepEqual(view(store), want, `seed=${seed}`);
      const blobs = [...server.everything(), ...caches.flatMap(c => c.disk.everything())];
      for (const bytes of blobs) for (const needle of needles) {
        assert.equal(Buffer.from(bytes).includes(Buffer.from(needle)), false, `seed=${seed}; plaintext leaked`);
      }
    } catch (error) { throw new Error(`independent schedule seed=${seed}`, { cause: error }); }
  }
});

async function rollback() {
  const v = await vault(), server = new MemoryRemote(v.id), cache = new MemoryCache();
  const store = await Store.open(v, cache);
  ok(store.add('invented', 'invented-group', { id: id(11), text: 'invented-first' }));
  ok(await store.sync(server));
  const old = server.snapshot();
  ok(store.change(id(11), { text: 'invented-second' })); ok(await store.sync(server));
  server.restore(old);
  ok(store.change(id(11), { local: 'invented-unsent' })); await store.flush();
  const before = { disk: await cache.load(), server: server.snapshot(), view: view(store) };
  const result = await store.sync(server);
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.why, 'server-older');
  return { before, after: { disk: await cache.load(), server: server.snapshot(), view: view(store) } };
}

test('snapshot rollback: server-older preserves records, sealed copies and the server', async () => {
  const { before, after } = await rollback();
  assert.deepEqual(after.view, before.view);
  assert.deepEqual(after.server, before.server);
  assert.deepEqual(after.disk?.chunks, before.disk?.chunks);
});

test('finding 2: rollback leaves cache cursor unchanged (fixed after the review)', async () => {
  const { before, after } = await rollback();
  assert.equal(after.disk?.cursor, before.disk?.cursor);
});

test('server rule order and refused-batch atomicity (including marks and quotas)', async () => {
  const v = id(900), a = id(20), b = id(21);
  const blob = (size = 40, mark = 1) => { const x = new Uint8Array(size); x.fill(mark, 1, 13); x[0] = 1; return x; };
  const limits = { ...LIMITS, blobBytes: 80, batchBytes: 100, vaultBytes: 70, writesPerDay: 2 };
  const server = new MemoryRemote(v, limits, () => '2026-01-01');
  async function refused(writes: unknown, why: string, vaultId = v) {
    const before = { held: server.snapshot(), bytes: server.bytes(), all: server.everything() };
    const answer = await server.push(vaultId, writes as Write[]);
    assert.equal(answer.ok, false); if (!answer.ok) assert.equal(answer.why, why);
    assert.deepEqual({ held: server.snapshot(), bytes: server.bytes(), all: server.everything() }, before);
  }
  await refused(null, 'wrong-vault', id(999));
  for (const writes of [null, [], [{ id: '__proto__', base: 0, blob: blob(90) }],
    [{ id: a, base: -1, blob: blob() }], [{ id: a, base: 1, blob: blob() }],
    [{ id: a, base: 0, mark: 'bad', blob: blob() }],
    [{ id: a, base: 0, blob: blob(28) }],
    [{ id: a, base: 0, blob: blob() }, { id: a, base: 0, blob: blob() }]]) await refused(writes, 'bad-request');
  ok(await server.push(v, [{ id: a, base: 0, blob: blob() }]));
  await refused([{ id: a, base: 0, blob: blob(81) }], 'too-big'); // size before stale
  await refused([{ id: a, base: 0, blob: blob(70) }, { id: b, base: 0, blob: blob(40) }], 'too-big');
  await refused([{ id: a, base: 0, blob: blob() }, { id: b, base: 0, blob: blob() }], 'stale');
  await refused([{ id: a, base: 1, mark: markOf(blob(40, 9)), blob: blob() }], 'stale');
  await refused([{ id: a, base: 1, mark: markOf(blob()), blob: blob(60) }, { id: b, base: 0, blob: blob() }], 'quota-writes');
  await refused([{ id: b, base: 0, blob: blob() }], 'quota-bytes');
  ok(await server.push(v, [{ id: a, base: 1, mark: markOf(blob()), blob: blob(30, 2) }]));
  await refused([{ id: b, base: 0, blob: blob() }], 'quota-writes');
});

test('finding 3: incompatible kind changes report a clash (fixed after the review)', () => {
  const key = id(40), fields = { text: 'invented-unchanged' };
  const b: Recs = { [key]: { kind: 'invented-base', t: 0, fields } };
  const h: Recs = { [key]: { kind: 'invented-here', t: 2, fields } };
  const r: Recs = { [key]: { kind: 'invented-there', t: 1, fields } };
  const result = merge3(entries(b), entries(h), entries(r));
  assert.deepEqual(plain(result.records), ordinary(merge(b, h, r)));
  assert.ok(result.clashes.length > 0, 'discarding a different kind must tell the caller');
});

test('finding 4: a null successful-transport pull reply reports bad-reply (fixed after the review)', async () => {
  const v = await vault(), store = await Store.open(v, new MemoryCache());
  const remote: Remote = { pull: async () => null as unknown as Pulled, push: async () => { throw new Error('must not push'); } };
  const answer = await store.sync(remote);
  assert.equal(answer.ok, false); if (!answer.ok) assert.equal(answer.why, 'bad-reply');
});

test('finding 4: null push reply preserves pending changes and reports bad-reply (fixed after the review)', async () => {
  const v = await vault(), server = new MemoryRemote(v.id), store = await Store.open(v, new MemoryCache());
  ok(store.add('invented', 'invented-group', { id: id(45), text: 'invented-pending' }));
  const remote: Remote = { pull: (v, n) => server.pull(v, n), push: async () => null as unknown as Pushed };
  const answer = await store.sync(remote);
  assert.equal(answer.ok, false); if (!answer.ok) assert.equal(answer.why, 'bad-reply');
  assert.equal(store.get(id(45))?.text, 'invented-pending');
  ok(await store.sync(server));
});

test('finding 5: repeated chunk ids on forever-advancing pages are bounded (fixed after the review)', async () => {
  const v = await vault(), server = new MemoryRemote(v.id), writer = await Store.open(v, new MemoryCache());
  ok(writer.add('invented', 'invented-group', { id: id(50), text: 'invented-page' }));
  ok(await writer.sync(server));
  const page = await server.pull(v.id, 0); assert.ok(page.ok);
  const chunk = page.chunks[0]!;
  let pulls = 0;
  const remote: Remote = {
    pull: async (_v, since) => {
      // Test-only circuit breaker: without it this sync never completes. No
      // wall-clock timeout or runaway background promise is left behind.
      if (++pulls > 64) throw new Error('invented circuit breaker');
      return { ok: true, cursor: since + 1, more: true, digest: page.digest, chunks: [{ ...chunk, version: since + 1 }] };
    },
    push: async () => { throw new Error('must not push'); },
  };
  const reader = await Store.open(v, new MemoryCache());
  const answer = await reader.sync(remote);
  assert.ok(pulls < 65, 'sync must stop itself before the test circuit breaker');
  assert.equal(answer.ok, false); if (!answer.ok) assert.equal(answer.why, 'bad-reply');
});

test('record size fallback: independent disjoint large fields and UTF-8 accounting', () => {
  const key = id(60);
  const b: Recs = { [key]: { kind: 'invented', t: 0, fields: {} } };
  const h: Recs = { [key]: { kind: 'invented', t: 2, fields: { a: '虚构'.repeat(450) } } };
  const r: Recs = { [key]: { kind: 'invented', t: 1, fields: { b: 'invented'.repeat(400) } } };
  const result = merge3(entries(b), entries(h), entries(r));
  assert.deepEqual(plain(result.records), ordinary(merge(b, h, r)));
  assert.equal(result.clashes.length, 1);
  assert.ok([...result.records.values()].every(e => e.size <= MAX_ENTRY_BYTES));
});

test('finding 6 (settled in the document after the review): a record is measured as it is written in the chunk, and the limit is inclusive', () => {
  const key = id(61);
  // Assessment 1.6 now gives the measure: the UTF-8 bytes of "<id>":{"k":…,"t":…,"d":{…}} as written in the chunk,
  // plus one for the comma after it. (The oracle in tests/second/merge.ts was written before the document said so
  // and counts one byte more; it is left as it was, so this test compares with the document, not with the oracle.)
  const written = (fields: { [name: string]: string }) => Buffer.byteLength(`${JSON.stringify(key)}:${JSON.stringify({ k: 'invented', t: 2, d: fields })}`) + 1;
  const room = MAX_ENTRY_BYTES - written({ b: 'y', a: '' });
  const b: Recs = { [key]: { kind: 'invented', t: 0, fields: {} } };
  const r: Recs = { [key]: { kind: 'invented', t: 1, fields: { b: 'y' } } };
  // exactly at the limit: both sides' fields are kept, and nothing is reported
  const fits = merge3(entries(b), entries({ [key]: { kind: 'invented', t: 2, fields: { a: 'x'.repeat(room) } } }), entries(r));
  assert.equal(fits.records.get(key)!.size, MAX_ENTRY_BYTES);
  assert.deepEqual(Object.keys(fits.records.get(key)!.value).sort(), ['a', 'b', 'id']);
  assert.deepEqual(fits.clashes, []);
  // one byte more: the later version is kept whole, and the caller is told
  const over = merge3(entries(b), entries({ [key]: { kind: 'invented', t: 2, fields: { a: 'x'.repeat(room + 1) } } }), entries(r));
  assert.deepEqual(Object.keys(over.records.get(key)!.value).sort(), ['a', 'id']);
  assert.equal(over.clashes.length, 1);
});

test('finding 7 (changed after the review): the same id added to different chunks becomes one record with both sides\' fields, and is reported', async () => {
  const v = await vault(), server = new MemoryRemote(v.id);
  const a = await Store.open(v, new MemoryCache(), { now: () => 100 });
  const b = await Store.open(v, new MemoryCache(), { now: () => 200 });
  const key = id(62);
  ok(a.add('invented', 'invented-group', { id: key, onlyA: 'invented-left' }));
  ok(b.add('invented', 'invented-group', { id: key, onlyB: 'invented-right' }));
  ok(await a.sync(server));
  const answer = await b.sync(server); ok(answer);
  assert.ok(answer.clashes.some(clash => clash.what === 'doubled'), 'finding the same record twice must be reported');
  assert.equal(b.status().doubled, 0);
  assert.deepEqual(b.get(key), { id: key, onlyA: 'invented-left', onlyB: 'invented-right' });
  ok(await a.sync(server));
  assert.deepEqual(a.get(key), b.get(key));
  assert.equal(a.status().doubled, 0);
});

test('server malformed pull and ordinary malformed reply fields do not change records', async () => {
  const v = await vault(), server = new MemoryRemote(v.id), store = await Store.open(v, new MemoryCache());
  for (const since of [-1, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null]) {
    assert.deepEqual(await server.pull(v.id, since as number), { ok: false, why: 'bad-request' });
  }
  const emptyDigest = digestOf([]);
  for (const patch of [{ cursor: -1 }, { cursor: '1' }, { more: 'yes' }, { digest: '__proto__' }, { chunks: null },
    { more: true, chunks: [] }, { chunks: [{ id: '__proto__', version: 1, blob: new Uint8Array(40) }] }]) {
    const before = view(store);
    const remote: Remote = {
      pull: async () => ({ ok: true, cursor: 0, more: false, digest: emptyDigest, chunks: [], ...patch }) as Pulled,
      push: async () => { throw new Error('must not push'); },
    };
    const answer = await store.sync(remote);
    assert.equal(answer.ok, false); if (!answer.ok) assert.equal(answer.why, 'bad-reply');
    assert.deepEqual(view(store), before);
  }
});

test('cache save cuts during sent-history resolution reopen without resurrection', async () => {
  const hit = new Set<number>();
  for (let cut = 1; cut <= 6; cut++) {
    try {
      const v = await vault(), disk = new MemoryCache(), server = new MemoryRemote(v.id);
      let armed = false, saves = 0;
      const cache: Cache = {
        load: () => disk.load(), clear: () => disk.clear(),
        save: async (vaultId, change) => {
          if (armed && ++saves === cut) { hit.add(cut); throw new Error('invented page closed before atomic save'); }
          await disk.save(vaultId, change);
        },
      };
      let a = await Store.open(v, cache);
      const b = await Store.open(v, new MemoryCache());
      const root = id(70), doomed = id(71);
      ok(a.add('invented', 'invented-group', { id: root, left: 'invented-start', right: 'invented-start' }));
      await settle([a, b], server);
      ok(a.add('invented', 'invented-group', { id: doomed, text: 'invented-to-remove' }));
      const net = new Faults(server); net.mode = 'lose';
      const lost = await a.sync(net); assert.ok(!lost.ok && lost.why === 'offline');
      ok(a.remove(doomed)); ok(a.change(root, { left: 'invented-durable-left' })); await a.flush();
      ok(await b.sync(server));
      ok(b.change(root, { right: 'invented-durable-right' })); ok(await b.sync(server));
      armed = true;
      try { ok(await a.sync(server)); }
      catch (error) { assert.match(String(error), /invented page closed before atomic save/); }
      armed = false;
      a = await Store.open(v, cache);
      await settle([a, b], server);
      const fresh = await Store.open(v, new MemoryCache()); ok(await fresh.sync(server));
      for (const store of [a, b, fresh]) {
        assert.equal(store.get(doomed), undefined, `cache cut=${cut}: removed record resurrected`);
        assert.deepEqual(store.get(root), { id: root, left: 'invented-durable-left', right: 'invented-durable-right' });
      }
    } catch (error) { throw new Error(`cache cut=${cut}`, { cause: error }); }
  }
  assert.ok(hit.has(1) && hit.has(2), 'both persistence stages must be exercised');
  console.log(`cache save cuts exercised=${[...hit].join(',')}; attempted cuts=1..6`);
});

// C4: only invented records; cryptographic keys are generated, nonexportable and never printed.
async function duplicateWrite(v: OpenVault, chunk: number, record: number, t: number, fields: Rec['fields']): Promise<Write> {
  const chunkId = id(chunk), rev = id(chunk + 10_000);
  const blob = await sealContent(v, chunkId, {
    group: 'invented-c4', n: 1, rev, history: [rev],
    records: entries({ [id(record)]: { kind: 'invented', t, fields } }),
  });
  assert.ok(blob);
  return { id: chunkId, base: 0, blob };
}

test('C4: concurrent duplicate settlers and a later third copy preserve exclusive fields and converge', async () => {
  const v = await vault(), server = new MemoryRemote(v.id);
  ok(await server.push(v.id, [
    await duplicateWrite(v, 8001, 8010, 100, { left: 'invented-left' }),
    await duplicateWrite(v, 8002, 8010, 200, { right: 'invented-right' }),
  ]));
  const stores = await Promise.all([new MemoryCache(), new MemoryCache()].map(cache => Store.open(v, cache)));
  const answers = await Promise.all(stores.map(store => store.sync(server)));
  for (const answer of answers) ok(answer);
  await settle(stores, server);
  ok(await server.push(v.id, [await duplicateWrite(v, 8003, 8010, 300, { third: 'invented-third' })]));
  await settle(stores, server);
  const fresh = await Store.open(v, new MemoryCache());
  ok(await fresh.sync(server));
  for (const store of [...stores, fresh]) {
    assert.deepEqual(store.get(id(8010)), { id: id(8010), left: 'invented-left', right: 'invented-right', third: 'invented-third' });
    assert.equal(store.status().pending, 0);
    assert.equal(store.status().doubled, 0);
  }
});

test('C4: removing a record doubled in the cache before sync removes every copy after reopen', async () => {
  const v = await vault(), cache = new MemoryCache(), server = new MemoryRemote(v.id);
  const writes = [
    await duplicateWrite(v, 8101, 8110, 100, { left: 'invented-left' }),
    await duplicateWrite(v, 8102, 8110, 200, { right: 'invented-right' }),
  ];
  await cache.save(v.id, { cursor: 0, put: writes.map(write => ({ id: write.id, version: 0, local: write.blob })), drop: [] });
  const store = await Store.open(v, cache);
  assert.equal(store.status().doubled, 1);
  ok(store.remove(id(8110)));
  await store.flush();
  const reopened = await Store.open(v, cache);
  ok(await reopened.sync(server));
  assert.equal(reopened.get(id(8110)), undefined);
  assert.equal(reopened.status().doubled, 0);
  assert.equal(server.size, 0);
});

test('C4: distinct forever-advancing pages release a flush queued behind sync', async () => {
  const v = await vault(), cache = new MemoryCache(), store = await Store.open(v, cache);
  let pulls = 0;
  const remote: Remote = {
    pull: async (_vault, since) => {
      assert.ok(++pulls <= 1002, 'test circuit breaker');
      return { ok: true, cursor: since + 1, more: true, digest: digestOf([]), chunks: [{ id: id(20_000 + since), version: since + 1, blob: new Uint8Array(40) }] };
    },
    push: async () => { throw new Error('invented unexpected push'); },
  };
  const syncing = store.sync(remote);
  ok(store.add('invented', 'invented-c4', { id: id(8200), text: 'invented-queued-save' }));
  const flushing = store.flush();
  const result = await syncing;
  assert.ok(!result.ok && result.why === 'bad-reply');
  assert.equal(pulls, 1001);
  await flushing;
  const reopened = await Store.open(v, cache);
  assert.equal(reopened.get(id(8200))?.text, 'invented-queued-save');
});

test('finding 8: three duplicate copies must choose the newest original value of each field (fixed after the second round)', async () => {
  const v = await vault(), cache = new MemoryCache();
  const writes = [
    await duplicateWrite(v, 8301, 8310, 100, { x: 'invented-old' }),
    await duplicateWrite(v, 8302, 8310, 300, { y: 'invented-unrelated' }),
    await duplicateWrite(v, 8303, 8310, 200, { x: 'invented-new' }),
  ];
  await cache.save(v.id, { cursor: 0, put: writes.map(write => ({ id: write.id, version: 0, local: write.blob })), drop: [] });
  const store = await Store.open(v, cache);
  ok(store.change(id(8310), { edited: true }));
  assert.deepEqual(store.get(id(8310)), { id: id(8310), x: 'invented-new', y: 'invented-unrelated', edited: true });
});

test('finding 9: duplicate stale-answer ids must leave the sent copy of unknown fate (fixed after the second round)', async () => {
  const v = await vault(), cache = new MemoryCache(), server = new MemoryRemote(v.id);
  let store = await Store.open(v, cache);
  ok(store.add('invented', 'invented-c4', { id: id(8400), text: 'invented-anchor' }));
  ok(await store.sync(server));
  const old = await server.pull(v.id, 0); assert.ok(old.ok);
  const held = old.chunks[0]!;
  ok(store.add('invented', 'invented-c4', { id: id(8401), text: 'invented-removed-in-flight' }));
  let delayed: readonly Write[] | undefined;
  const answer = await store.sync({
    pull: (vaultId, since) => server.pull(vaultId, since),
    push: async (_vaultId, writes) => {
      assert.equal(delayed, undefined, 'only one delayed request');
      delayed = structuredClone(writes);
      ok(store.remove(id(8401))); // a user edit while the request is in flight
      return { ok: false, why: 'stale', chunks: [held, held] };
    },
  });
  await store.flush();
  store = await Store.open(v, cache);
  assert.ok(delayed);
  ok(await server.push(v.id, delayed)); // the original request arrives after the removal was flushed
  ok(await store.sync(server));
  assert.equal(store.get(id(8401)), undefined, 'a flushed removal must not be resurrected');
  assert.ok(!answer.ok && answer.why === 'bad-reply');
});

// These tests exercise unavailable platform APIs in Node; they launch no browser.
async function withCacheGlobals(navigatorValue: unknown, databaseValue: unknown, run: () => Promise<void>) {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const db = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorValue });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: databaseValue });
  try { await run(); }
  finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else Reflect.deleteProperty(globalThis, 'navigator');
    if (db) Object.defineProperty(globalThis, 'indexedDB', db); else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
}

test('C4: absent Web Locks returns unavailable without opening storage', async () => {
  await withCacheGlobals({}, { open: () => { throw new Error('must not open storage'); } }, async () => {
    assert.equal(await holdCache('invented-missing-locks'), 'unavailable');
  });
});

test('finding 10: a rejected Web Lock request is unavailable storage, not another tab (fixed after the second round)', async () => {
  await withCacheGlobals({ locks: { request: () => Promise.reject(new DOMException('invented policy refusal', 'SecurityError')) } }, {}, async () => {
    assert.equal(await holdCache('invented-denied-locks'), 'unavailable');
  });
});

test('finding 11: simultaneous settlers with different local duplicates must preserve both flushed fields (fixed after the second round)', async () => {
  const v = await vault(), server = new MemoryRemote(v.id);
  const [small, middle, large] = [8501, 8502, 8503].sort((a, b) => id(a) < id(b) ? -1 : 1);
  ok(await server.push(v.id, [await duplicateWrite(v, middle!, 8510, 200, { common: 'invented-common' })]));
  const aCache = new MemoryCache(), bCache = new MemoryCache();
  for (const [cache, chunk, t, fields] of [
    [aCache, small!, 100, { left: 'invented-left' }],
    [bCache, large!, 300, { right: 'invented-right' }],
  ] as const) {
    const write = await duplicateWrite(v, chunk, 8510, t, fields);
    await cache.save(v.id, { cursor: 0, put: [{ id: write.id, version: 0, local: write.blob }], drop: [] });
  }
  const a = await Store.open(v, aCache), b = await Store.open(v, bCache);
  let bPulled!: () => void, aCommitted!: () => void;
  const bRead = new Promise<void>(resolve => { bPulled = resolve; });
  const aWrote = new Promise<void>(resolve => { aCommitted = resolve; });
  const aSync = a.sync({
    pull: (vaultId, since) => server.pull(vaultId, since),
    push: async (vaultId, writes) => {
      await bRead;
      const answer = await server.push(vaultId, writes);
      aCommitted();
      return answer;
    },
  });
  const bSync = b.sync({
    pull: async (vaultId, since) => {
      const answer = await server.pull(vaultId, since);
      bPulled();
      return answer;
    },
    push: async (vaultId, writes) => { await aWrote; return server.push(vaultId, writes); },
  });
  const answers = await Promise.all([aSync, bSync]);
  for (const answer of answers) ok(answer);
  await settle([a, b], server);
  const fresh = await Store.open(v, new MemoryCache());
  ok(await fresh.sync(server));
  for (const store of [a, b, fresh]) {
    assert.deepEqual(store.get(id(8510)), { id: id(8510), common: 'invented-common', left: 'invented-left', right: 'invented-right' });
  }
});
