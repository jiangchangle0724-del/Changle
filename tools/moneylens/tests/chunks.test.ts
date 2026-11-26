/**
 * The server's code for a vault's chunks (src/server/chunks.ts), by itself: what its database is
 * made of, which vault it is for, that bytes come back as they went in, that a batch is whole,
 * and what one call costs. What it checks and what it answers is tested by the store's own
 * tests, every one of them, run against it (sync-sql.test.ts).
 *
 *   npx tsx --test tests/chunks.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { newId } from "../src/core/ids";
import { chunkTables, pullChunks, pushChunks, startVault, vaultHeld, type Db } from "../src/server/chunks";
import { LIMITS, digestOf, markOf, type Pulled, type Pushed, type Write } from "../src/vault/sync";
import { sqlite } from "./sqlremote";

const DAY = "2026-11-25";
/** Bytes that stand for a sealed blob: the server never opens one. Different for every `seed`, nonce included. */
const blob = (seed: number, length = 100): Uint8Array => Uint8Array.from({ length }, (_, i) => (seed * 31 + i * 7) % 251);
const fresh = (vault = newId()) => {
  const db = sqlite();
  chunkTables(db);
  assert.equal(startVault(db, vault), true);
  return { db, vault };
};
const taken = (answer: Pushed) => {
  assert.ok(answer.ok, answer.ok ? "" : answer.why);
  return answer.versions;
};
const page = (answer: Pulled) => {
  assert.ok(answer.ok);
  return answer;
};

/** Every statement the code runs from here on, as "read chunks" or "write vault". */
function watch(db: Db): string[] {
  const seen: string[] = [];
  const exec = db.sql.exec;
  db.sql.exec = (query, ...args) => {
    const [, verb, table] = /^(SELECT|INSERT|UPDATE|DELETE)\b[^]*?\b(chunks|vault)\b/.exec(query) ?? [];
    seen.push(`${verb === "SELECT" ? (/\bblob\b/.test(query) ? "read blob of" : "read") : "write"} ${table}`);
    return exec(query, ...args);
  };
  return seen;
}

test("what the database is made of: two tables, and no column a record could be in (VAULT-1)", () => {
  const { db } = fresh();
  const columns = (table: string) => (db.raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[]).map((c) => `${c.name} ${c.type}`);
  assert.deepEqual((db.raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]).map((t) => t.name), ["chunks", "vault"]);
  assert.deepEqual(columns("chunks"), ["id TEXT", "version INTEGER", "mark TEXT", "bytes INTEGER", "blob BLOB"]);
  assert.deepEqual(columns("vault"), ["one INTEGER", "id TEXT", "seq INTEGER", "day TEXT", "written INTEGER"]);
  // a Durable Object makes its tables every time it wakes: doing it again changes nothing
  const id = newId();
  taken(pushChunks(db, vaultHeld(db)!, [{ id, base: 0, blob: blob(1) }], LIMITS, DAY));
  chunkTables(db);
  assert.deepEqual(page(pullChunks(db, vaultHeld(db)!, 0, LIMITS)).chunks.map((c) => [c.id, c.version]), [[id, 1]]);
  // the vault's row can only be the one row
  assert.throws(() => db.raw.exec(`INSERT INTO vault (one, id, seq, day, written) VALUES (2, 'x', 0, '', 0)`));
});

test("a database is for one vault: none until it is told which, and never another", () => {
  const db = sqlite();
  chunkTables(db);
  const vault = newId();
  assert.equal(vaultHeld(db), null);
  assert.deepEqual(pullChunks(db, vault, 0, LIMITS), { ok: false, why: "wrong-vault" });
  assert.deepEqual(pushChunks(db, vault, [{ id: newId(), base: 0, blob: blob(1) }], LIMITS, DAY), { ok: false, why: "wrong-vault" });
  for (const bad of ["", "vault", "x".repeat(22), `${vault} `]) assert.equal(startVault(db, bad), false, bad);
  assert.equal(vaultHeld(db), null);
  assert.equal(startVault(db, vault), true);
  assert.equal(startVault(db, vault), true, "saying it again is no harm");
  assert.equal(startVault(db, newId()), false, "another vault is not put in its place");
  assert.equal(vaultHeld(db), vault);
  assert.deepEqual(pullChunks(db, newId(), 0, LIMITS), { ok: false, why: "wrong-vault" });
  assert.deepEqual(pushChunks(db, newId(), [{ id: newId(), base: 0, blob: blob(1) }], LIMITS, DAY), { ok: false, why: "wrong-vault" });
  assert.deepEqual(page(pullChunks(db, vault, 0, LIMITS)), { ok: true, cursor: 0, more: false, digest: digestOf([]), chunks: [] });
});

test("bytes come out as they went in, whatever larger buffer they were part of, and what is handed out is a copy", () => {
  const { db, vault } = fresh();
  const big = blob(3, 1000);
  const part = big.subarray(200, 500);
  const id = newId();
  taken(pushChunks(db, vault, [{ id, base: 0, blob: part }], LIMITS, DAY));
  const first = page(pullChunks(db, vault, 0, LIMITS));
  assert.deepEqual([...first.chunks[0]!.blob], [...part]);
  assert.equal(first.digest, digestOf([markOf(part)]));
  first.chunks[0]!.blob.fill(0);
  assert.deepEqual([...page(pullChunks(db, vault, 0, LIMITS)).chunks[0]!.blob], [...part]);
  // a view of a shared buffer is stored as its bytes too
  const shared = new Uint8Array(new SharedArrayBuffer(300), 50, 120);
  shared.set(blob(9, 120));
  const other = newId();
  taken(pushChunks(db, vault, [{ id: other, base: 0, blob: shared }], LIMITS, DAY));
  shared.fill(0);
  assert.deepEqual([...page(pullChunks(db, vault, 1, LIMITS)).chunks[0]!.blob], [...blob(9, 120)], "and changing what was sent, afterwards, changes nothing here");
  // the same for the copy a stale answer shows
  const stale = pushChunks(db, vault, [{ id, base: 7, mark: markOf(part), blob: blob(4) }], LIMITS, DAY);
  assert.ok(!stale.ok && stale.why === "stale");
  assert.deepEqual([...stale.chunks[0]!.blob!], [...part]);
  stale.chunks[0]!.blob!.fill(0);
  assert.deepEqual([...page(pullChunks(db, vault, 0, LIMITS)).chunks[0]!.blob], [...part]);
});

test("a batch is whole: when the database fails half-way through it, nothing of it is kept, the count included", () => {
  const { db, vault } = fresh();
  const [x, y, z] = [newId(), newId(), newId()];
  taken(pushChunks(db, vault, [{ id: x, base: 0, blob: blob(1) }], LIMITS, DAY));
  const before = db.raw.prepare(`SELECT * FROM vault`).get();
  const batch: Write[] = [
    { id: x, base: 1, mark: markOf(blob(1)), blob: blob(2) },
    { id: y, base: 0, blob: blob(3) },
    { id: z, base: 0, blob: blob(4) },
  ];
  // the third write of the batch fails
  const exec = db.sql.exec;
  let writes = 0;
  db.sql.exec = (query, ...args) => {
    if (/^(INSERT|UPDATE) /.test(query) && ++writes === 3) throw new Error("the disk is full");
    return exec(query, ...args);
  };
  assert.throws(() => pushChunks(db, vault, batch, LIMITS, DAY), /the disk is full/);
  db.sql.exec = exec;
  assert.deepEqual(db.raw.prepare(`SELECT * FROM vault`).get(), before);
  const held = page(pullChunks(db, vault, 0, LIMITS));
  assert.deepEqual(held.chunks.map((c) => [c.id, c.version, markOf(c.blob)]), [[x, 1, markOf(blob(1))]]);
  // and the same batch, sent again, is taken as if nothing had happened
  assert.deepEqual(taken(pushChunks(db, vault, batch, LIMITS, DAY)), [{ id: x, version: 2 }, { id: y, version: 3 }, { id: z, version: 4 }]);
});

test("version numbers are counted, not looked up: a chunk that is gone does not give its number to the next", () => {
  const { db, vault } = fresh();
  const [x, y] = [newId(), newId()];
  taken(pushChunks(db, vault, [{ id: x, base: 0, blob: blob(1) }, { id: y, base: 0, blob: blob(2) }], LIMITS, DAY));
  db.raw.prepare(`DELETE FROM chunks WHERE id = ?`).run(y);
  // what a pull says follows what is there: the digest no longer has the lost chunk's mark, which is how a device that had it notices
  const after = page(pullChunks(db, vault, 0, LIMITS));
  assert.deepEqual([after.cursor, after.digest, after.chunks.length], [2, digestOf([markOf(blob(1))]), 1]);
  const next = newId();
  assert.deepEqual(taken(pushChunks(db, vault, [{ id: next, base: 0, blob: blob(3) }], LIMITS, DAY)), [{ id: next, version: 3 }]);
});

test("what a call costs: a few statements, and none more for a larger vault (LIM-1)", () => {
  const { db, vault } = fresh();
  const ids = Array.from({ length: 40 }, () => newId());
  taken(pushChunks(db, vault, ids.map((id, i) => ({ id, base: 0, blob: blob(i) })), LIMITS, DAY));
  const seen = watch(db);
  const count = () => {
    const out: Record<string, number> = {};
    for (const what of seen.splice(0)) out[what] = (out[what] ?? 0) + 1;
    return out;
  };
  // a pull with nothing new: the vault's row, and one look over the chunks without their blobs
  page(pullChunks(db, vault, 40, LIMITS));
  assert.deepEqual(count(), { "read vault": 1, "read chunks": 1 });
  // a pull that hands out three chunks reads those three blobs and no other
  assert.equal(page(pullChunks(db, vault, 37, LIMITS)).chunks.length, 3);
  assert.deepEqual(count(), { "read vault": 1, "read chunks": 1, "read blob of chunks": 3 });
  // a push of five chunks: five writes and the vault's row
  const again = ids.slice(0, 5).map((id, i) => ({ id, base: i + 1, mark: markOf(blob(i)), blob: blob(100 + i) }));
  taken(pushChunks(db, vault, again, LIMITS, DAY));
  assert.deepEqual(count(), { "read vault": 1, "read chunks": 1, "write chunks": 5, "write vault": 1 });
  // a stale push writes nothing, and reads the blobs it shows
  const stale = pushChunks(db, vault, again, LIMITS, DAY);
  assert.ok(!stale.ok && stale.why === "stale" && stale.chunks.length === 5);
  assert.deepEqual(count(), { "read vault": 1, "read chunks": 1, "read blob of chunks": 5 });
  // what is not a request, or is too large, is turned away on the vault's row alone
  assert.deepEqual(pushChunks(db, vault, [], LIMITS, DAY), { ok: false, why: "bad-request" });
  assert.deepEqual(pushChunks(db, vault, [{ id: newId(), base: 0, blob: new Uint8Array(LIMITS.blobBytes + 1) }], LIMITS, DAY), { ok: false, why: "too-big" });
  assert.deepEqual(pullChunks(db, vault, -1, LIMITS), { ok: false, why: "bad-request" });
  assert.deepEqual(count(), { "read vault": 3 });
});

test("the platform's own limits leave room for what this stores (checked against Cloudflare's pages on 25 November 2026)", () => {
  // A row, and a blob in it, may be 2 MB. The largest row here is the largest sealed chunk with its id, mark and three numbers.
  assert.ok(LIMITS.blobBytes + 200 < 2_000_000);
  // One request to a Worker may carry 100 MB; one push is far under it, and one page of a pull is too.
  assert.ok(LIMITS.batchBytes <= 8 * 1024 * 1024 && LIMITS.pageBytes + LIMITS.blobBytes < 8 * 1024 * 1024);
  // A statement may bind 100 values. None here binds more than five; a batch is one statement for each chunk, not one for all.
  assert.ok(LIMITS.batchWrites <= 100);
});
