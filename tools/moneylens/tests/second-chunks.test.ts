// C7 independent server review. All ids, dates and opaque blob bytes are invented.
// No network, key material, real records, author SQL wrapper or author fault helpers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { chunkTables, startVault, vaultHeld, pullChunks, pushChunks, type Db } from '../src/server/chunks';
import { MemoryRemote } from '../src/vault/memory';
import { LIMITS, digestOf, markOf, type Limits, type Write, type Pushed } from '../src/vault/sync';

function id(n: number): string {
  const bytes = Buffer.alloc(16); bytes.writeUInt32BE(n >>> 0, 12);
  return bytes.toString('base64url');
}
function random(seed: number) {
  let state = seed >>> 0;
  return (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 0x100000000 * n); };
}
function blob(seed: number, length = 40): Uint8Array {
  const bytes = Uint8Array.from({ length: length + 19 }, (_, i) => (seed * 17 + i * 31) % 251);
  return bytes.subarray(7, 7 + length); // deliberately a view into a larger allocation
}

/** An independent, eagerly consumed Node/DO boundary. It does not massage numbers or text. */
function database() {
  const raw = new DatabaseSync(':memory:');
  let inside = false;
  let intercept: ((query: string, when: 'before' | 'after') => void) | undefined;
  const db: Db = {
    sql: { exec(query, ...args) {
      intercept?.(query, 'before');
      for (const arg of args) {
        if (arg !== null && typeof arg === 'object' && !(arg instanceof ArrayBuffer)) throw new TypeError('invented adapter: blob binding must be an ordinary ArrayBuffer');
      }
      const values = args.map(arg => arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg);
      const rows = raw.prepare(query).all(...values) as Record<string, unknown>[];
      const copied = rows.map(row => Object.fromEntries(Object.entries(row).map(([name, value]) => [name,
        value instanceof Uint8Array ? Uint8Array.from(value).buffer : value])));
      intercept?.(query, 'after');
      return { toArray: () => copied };
    } },
    atomically<T>(work: () => T): T {
      assert.equal(inside, false);
      raw.exec('BEGIN IMMEDIATE'); inside = true;
      try { const out = work(); raw.exec('COMMIT'); return out; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
      finally { inside = false; }
    },
  };
  chunkTables(db);
  return { raw, db, isInside: () => inside,
    intercept(fn?: typeof intercept) { intercept = fn; },
    dump() { return { vault: raw.prepare('SELECT * FROM vault ORDER BY one').all(), chunks: raw.prepare('SELECT * FROM chunks ORDER BY id').all() }; },
  };
}

function taken(answer: Pushed) { assert.ok(answer.ok); return answer.versions; }

test('C7: 6,000 seeded mixed calls match MemoryRemote, every answer and every resulting chunk', async () => {
  const counts = new Map<string, number>();
  for (const seed of [0xc701, 0xc70b, 0xc719, 0xc72f, 0xc74d, 0xc76b, 0xc789, 0xc7a7, 0xc7bd, 0xc7d3, 0xc7e9, 0xc7ff]) {
    const next = random(seed), v = id(100), sql = database();
    const limits: Limits = { ...LIMITS, blobBytes: 64, batchBytes: 110, batchWrites: 3, vaultBytes: 180, writesPerDay: 5, pageBytes: 55 };
    let day = 0;
    const today = () => `2026-12-${String(day + 1).padStart(2, '0')}`;
    const memory = new MemoryRemote(v, limits, today);
    assert.equal(startVault(sql.db, v), true);
    let successfulDay = '', successfulWrites = 0;
    try {
      // Listing order must not accidentally come from rowid or primary-key order.
      sql.raw.exec('PRAGMA reverse_unordered_selects = ON');
      for (let turn = 0; turn < 500; turn++) {
        if (turn % 23 === 0 && day < 27) day++;
        if (turn % 67 === 0) limits.vaultBytes = 100 + next(160);
        const message = `seed=${seed}; turn=${turn}; day=${today()}`;
        const before = sql.dump(), snapshot = memory.snapshot();
        const vault = next(12) === 0 ? id(101) : v;
        if (next(5) === 0) {
          const since = [0, next(snapshot.seq + 3), snapshot.seq, -1, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1, '0'][next(8)];
          const want = await memory.pull(vault, since as number);
          assert.deepEqual(pullChunks(sql.db, vault, since as number, limits), want, message);
          assert.deepEqual(sql.dump(), before, message + ': pull wrote to SQL');
        } else {
          let writes: unknown = Array.from({ length: 1 + next(4) }, () => {
            const name = id(200 + next(7)), held = snapshot.chunks.get(name), choice = next(5);
            return { id: name, base: held && choice !== 0 ? held.version : 0,
              ...(held && choice !== 0 ? { mark: choice === 1 ? markOf(blob(9000 + turn)) : markOf(held.blob) } : {}),
              blob: blob(seed + turn, 29 + next(45)) };
          });
          if (turn % 7 === 0) {
            const x = { id: id(200), base: 0, blob: blob(turn) };
            writes = [null, [], 'invented-not-a-batch', [null], [{ ...x, id: '__proto__' }],
              [x, x], [{ ...x, base: -1 }], [{ ...x, blob: 'invented-not-bytes' }],
              [{ ...x, blob: new Uint8Array(28) }], [{ ...x, mark: 'bad' }]][next(10)];
          }
          const want = await memory.push(vault, writes as Write[]);
          const got = pushChunks(sql.db, vault, writes as Write[], limits, today());
          assert.deepEqual(got, want, message);
          counts.set(got.ok ? 'taken' : got.why, (counts.get(got.ok ? 'taken' : got.why) ?? 0) + 1);
          if (!got.ok) assert.deepEqual(sql.dump(), before, message + ': refusal changed SQL');
          else {
            if (successfulDay !== today()) { successfulDay = today(); successfulWrites = 0; }
            successfulWrites += got.versions.length;
            const row = sql.raw.prepare('SELECT day, written FROM vault').get();
            assert.deepEqual({ ...row }, { day: successfulDay, written: successfulWrites }, message);
          }
        }
        const state = memory.snapshot();
        assert.equal(sql.raw.prepare('SELECT seq FROM vault').get()!.seq, state.seq, message);
        const rows = sql.raw.prepare('SELECT id, version, mark, bytes, blob FROM chunks ORDER BY id').all();
        const expected = [...state.chunks].sort(([a], [b]) => a < b ? -1 : 1).map(([name, held]) => ({ id: name, version: held.version, mark: markOf(held.blob), bytes: held.blob.length, blob: held.blob }));
        assert.deepEqual(rows.map(row => ({ ...row })), expected, message);
        const all = pullChunks(sql.db, v, 0, { ...limits, pageBytes: Number.MAX_SAFE_INTEGER });
        assert.ok(all.ok);
        assert.deepEqual([all.cursor, all.more, all.digest], [state.seq, false, digestOf([...state.chunks.values()].map(held => markOf(held.blob)))], message);
      }
    } finally { sql.raw.close(); }
  }
  for (const reason of ['taken', 'wrong-vault', 'bad-request', 'too-big', 'stale', 'quota-bytes', 'quota-writes']) assert.ok((counts.get(reason) ?? 0) > 0, `unexercised ${reason}`);
  console.log(`C7 compared=6000; result counts=${JSON.stringify(Object.fromEntries(counts))}`);
});

test('C7: failure before or after every mutation rolls back existing/new chunks and final quota metadata', () => {
  for (const when of ['before', 'after'] as const) for (let cut = 1; cut <= 4; cut++) {
    const sql = database(), v = id(300), x = id(301);
    try {
      startVault(sql.db, v);
      taken(pushChunks(sql.db, v, [{ id: x, base: 0, blob: blob(1) }], LIMITS, '2026-11-25'));
      const before = sql.dump();
      const batch = [{ id: x, base: 1, mark: markOf(blob(1)), blob: blob(2) },
        { id: id(302), base: 0, blob: blob(3) }, { id: id(303), base: 0, blob: blob(4) }];
      let mutations = 0;
      sql.intercept((query, phase) => {
        if (/^(INSERT|UPDATE)\b/.test(query)) {
          assert.equal(sql.isInside(), true, 'all batch mutations must be inside atomically');
          if (phase === when && ++mutations === cut) throw new Error('invented interrupted SQL mutation');
        }
      });
      assert.throws(() => pushChunks(sql.db, v, batch, LIMITS, '2026-11-26'), /invented interrupted SQL mutation/);
      sql.intercept();
      assert.deepEqual(sql.dump(), before, `${when} mutation ${cut}`);
      assert.deepEqual(taken(pushChunks(sql.db, v, batch, LIMITS, '2026-11-26')), [{ id: x, version: 2 }, { id: id(302), version: 3 }, { id: id(303), version: 4 }]);
      const row = sql.raw.prepare('SELECT seq, day, written FROM vault').get();
      assert.deepEqual({ ...row }, { seq: 4, day: '2026-11-26', written: 3 });
    } finally { sql.raw.close(); }
  }
});

test('C7: real SQLite constraint failure, rather than a JS fault, aborts a mixed batch', () => {
  const sql = database(), v = id(400), x = id(401), bad = id(402);
  try {
    startVault(sql.db, v);
    taken(pushChunks(sql.db, v, [{ id: x, base: 0, blob: blob(1) }], LIMITS, '2026-11-25'));
    sql.raw.exec(`CREATE TRIGGER invented_failure BEFORE INSERT ON chunks WHEN NEW.id = '${bad}' BEGIN SELECT RAISE(ABORT, 'invented constraint'); END`);
    const before = sql.dump();
    const batch = [{ id: x, base: 1, mark: markOf(blob(1)), blob: blob(2) }, { id: bad, base: 0, blob: blob(3) }];
    assert.throws(() => pushChunks(sql.db, v, batch, LIMITS, '2026-11-26'), /invented constraint/);
    assert.deepEqual(sql.dump(), before);
  } finally { sql.raw.close(); }
});

test('C7: page boundaries and output ownership hold with reversed SQL scan order and a removed highest version', () => {
  const sql = database(), v = id(500), limits = { ...LIMITS, pageBytes: 35 };
  try {
    startVault(sql.db, v); sql.raw.exec('PRAGMA reverse_unordered_selects = ON');
    const ids = [id(503), id(501), id(502)], original = blob(7, 50);
    taken(pushChunks(sql.db, v, ids.map((name, i) => ({ id: name, base: 0, blob: i === 0 ? original : blob(i, 29) })), limits, '2026-11-25'));
    original.fill(0); // the bound subview was snapshotted, not retained
    const result = [];
    for (let since = 0; ;) {
      const page = pullChunks(sql.db, v, since, limits); assert.ok(page.ok);
      result.push(...page.chunks.map(c => c.id));
      if (!page.more) { assert.equal(page.cursor, 3); break; }
      since = page.cursor;
    }
    assert.deepEqual(result, ids);
    const first = pullChunks(sql.db, v, 0, limits); assert.ok(first.ok);
    assert.deepEqual(first.chunks[0]!.blob, blob(7, 50));
    first.chunks[0]!.blob.fill(0);
    const stale = pushChunks(sql.db, v, [{ id: ids[0]!, base: 0, blob: blob(9) }], limits, '2026-11-25');
    assert.ok(!stale.ok && stale.why === 'stale');
    assert.deepEqual(stale.chunks[0]!.blob, blob(7, 50)); stale.chunks[0]!.blob!.fill(0);
    sql.raw.prepare('DELETE FROM chunks WHERE id = ?').run(ids[2]!);
    const next = taken(pushChunks(sql.db, v, [{ id: id(504), base: 0, blob: blob(8) }], limits, '2026-11-25'));
    assert.equal(next[0]!.version, 4);
    const page = pullChunks(sql.db, v, 4, limits); assert.ok(page.ok);
    assert.deepEqual([page.cursor, page.more, page.chunks], [4, false, []]);
  } finally { sql.raw.close(); }
});

test('C7: SQL text affinity and the last safe integer are observed without test-side numeric coercion', () => {
  const sql = database(), v = id(600);
  try {
    assert.equal(vaultHeld(sql.db), null); assert.equal(startVault(sql.db, v), true);
    sql.raw.prepare('UPDATE vault SET seq = ?').run(String(Number.MAX_SAFE_INTEGER - 1));
    assert.equal(typeof sql.raw.prepare('SELECT seq FROM vault').get()!.seq, 'number');
    const answer = taken(pushChunks(sql.db, v, [{ id: id(601), base: 0, blob: blob(1) }], LIMITS, '2026-11-25'));
    assert.equal(answer[0]!.version, Number.MAX_SAFE_INTEGER);
    const page = pullChunks(sql.db, v, 0, LIMITS); assert.ok(page.ok);
    assert.equal(page.cursor, Number.MAX_SAFE_INTEGER);
    // Going beyond the boundary is a platform assumption, not simulated by rounding in this adapter.
    sql.raw.exec('UPDATE vault SET seq = 9223372036854775807');
    assert.throws(() => pullChunks(sql.db, v, 0, LIMITS), /range|large|safe|integer/i);
  } finally { sql.raw.close(); }
});

test('finding 2: a shared-buffer byte view must be normalized to the declared ArrayBuffer binding', { skip: 'finding 2: toSql preserves SharedArrayBuffer backing; the declared binding and Node 22 reject it' }, async () => {
  const sql = database(), v = id(700);
  try {
    startVault(sql.db, v);
    const bytes = new Uint8Array(new SharedArrayBuffer(80), 11, 40); bytes.set(blob(2));
    const request = [{ id: id(701), base: 0, blob: bytes }];
    const memory = new MemoryRemote(v);
    const want = await memory.push(v, request); assert.ok(want.ok);
    assert.deepEqual(pushChunks(sql.db, v, request, LIMITS, '2026-11-25'), want);
  } finally { sql.raw.close(); }
});

test('finding 1: a refused next-day write followed by a date rewind must have the same quota answer', { skip: 'finding 1: MemoryRemote resets the quota day on refusal, while SQL retains its last successful day' }, async () => {
  const sql = database(), v = id(800), x = id(801);
  const limits = { ...LIMITS, vaultBytes: 30, writesPerDay: 1 };
  let today = '2026-11-25';
  const memory = new MemoryRemote(v, limits, () => today);
  try {
    startVault(sql.db, v);
    const first = [{ id: x, base: 0, blob: blob(1, 29) }];
    assert.deepEqual(pushChunks(sql.db, v, first, limits, today), await memory.push(v, first));
    today = '2026-11-26';
    const tooLarge = [{ id: x, base: 1, mark: markOf(blob(1, 29)), blob: blob(2, 31) }];
    assert.deepEqual(pushChunks(sql.db, v, tooLarge, limits, today), await memory.push(v, tooLarge));
    today = '2026-11-25';
    const next = [{ id: x, base: 1, mark: markOf(blob(1, 29)), blob: blob(3, 29) }];
    assert.deepEqual(pushChunks(sql.db, v, next, limits, today), await memory.push(v, next));
  } finally { sql.raw.close(); }
});
