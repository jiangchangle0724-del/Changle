/**
 * A vault's chunks as the server keeps them (VAULT-1, VAULT-4): the sync half of one person's
 * Durable Object, on that object's own SQLite database (ISO-1).
 *
 * The rule book is `MemoryRemote` (vault/memory.ts): what is checked, in which order, and what is
 * answered. This is the same book on SQL, and it passes the same tests: `npm test` runs the
 * store's tests against both (tests/sqlremote.ts).
 *
 * What is stored, and all that is stored: for each chunk its id, its version number, its mark
 * (the nonce the blob itself begins with), its size and the sealed blob; for the vault its id,
 * the last version number given out, and how many chunks were written on which day. No key, no
 * record, no field, no group (T-6).
 *
 * The digest a pull carries and the vault's size are worked out from the chunks that are there,
 * each time, as the rule book does. They are not kept beside them: a number kept beside what it
 * counts can come to disagree with it, and the digest is how a device notices that a chunk it
 * had is gone.
 *
 * Plain functions on a `Db`, so they run on Node's SQLite in the tests as they do on a Durable
 * Object's. Nothing here is asynchronous: in a Durable Object one call runs from its first read
 * to its last write with nothing in between, and `atomically` keeps a batch whole if a write
 * fails half-way.
 *
 * Who may call this for which person is not decided here. The Durable Object is addressed by the
 * account the session belongs to (ISO-2), and a request names no account.
 *
 * What it costs (LIM-1: on the Free plan rows are counted across the whole site, 100,000 written
 * and 5,000,000 read a day). A chunk written for the first time is two rows (the table and its
 * key), a chunk written again is one, and every push adds one for the vault's row. A pull or a
 * push reads one short row for each chunk the vault holds (a two-year import for three accounts
 * is 19 chunks), and a pull reads each blob it hands out once more.
 */
import { isId } from "../core/ids";
import { MIN_BLOB, digestOf, isMark, markOf, type Limits, type Pulled, type Pushed, type RemoteChunk, type Write } from "../vault/protocol";

/** What can be bound to a `?`. A blob goes in as an ArrayBuffer, which is what a Durable Object's SQL takes and gives. */
type Bound = string | number | null | ArrayBuffer;
/** The part of a Durable Object's `ctx.storage.sql` this uses. */
export type Sql = { exec(query: string, ...args: Bound[]): { toArray(): Record<string, unknown>[] } };
export type Db = {
  sql: Sql;
  /** Runs `work` so that all it writes is kept, or none of it (`ctx.storage.transactionSync`). */
  atomically<T>(work: () => T): T;
};

const isVersion = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Bytes as SQL takes them: a buffer of their own holding exactly these bytes, whatever they were a view of (a larger buffer, a shared one). */
function toSql(bytes: Uint8Array): ArrayBuffer {
  const own = new Uint8Array(bytes.byteLength);
  own.set(bytes);
  return own.buffer;
}
/** Bytes as SQL gives them. */
const fromSql = (x: unknown): Uint8Array => (x instanceof ArrayBuffer ? new Uint8Array(x) : x instanceof Uint8Array ? x.slice() : new Uint8Array(0));

type VaultRow = { id: string; seq: number; day: string; written: number };
/** What is held of each chunk, without its blob. */
type Held = { version: number; mark: string; bytes: number };

export function chunkTables(db: Db): void {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, version INTEGER NOT NULL, mark TEXT NOT NULL, bytes INTEGER NOT NULL, blob BLOB NOT NULL)`);
  // one row: the vault this database holds
  db.sql.exec(`CREATE TABLE IF NOT EXISTS vault (one INTEGER PRIMARY KEY CHECK (one = 1), id TEXT NOT NULL, seq INTEGER NOT NULL, day TEXT NOT NULL, written INTEGER NOT NULL)`);
}

/**
 * The vault's row. What it holds is checked each time it is read: a count that is not a count (a database damaged or
 * restored into nonsense) is an error, thrown, and nothing is done on it. The caller answers that it cannot serve.
 */
function vaultRow(db: Db): VaultRow | null {
  const row = db.sql.exec(`SELECT id, seq, day, written FROM vault WHERE one = 1`).toArray()[0];
  if (!row) return null;
  const { id, seq, day, written } = row;
  if (typeof id !== "string" || !isVersion(seq) || !isVersion(written) || typeof day !== "string" || !/^(?:\d{4}-\d\d-\d\d)?$/.test(day)) throw new Error("vault row");
  return { id, seq, day, written };
}

/** The last day chunks were written on ("YYYY-MM-DD"; "" before the first write). The day a caller hands to `pushChunks` is never an earlier one. */
export const lastDay = (db: Db): string => vaultRow(db)?.day ?? "";

/** Every chunk the vault holds, without the blobs. */
function listing(db: Db): Map<string, Held> {
  const out = new Map<string, Held>();
  for (const row of db.sql.exec(`SELECT id, version, mark, bytes FROM chunks`).toArray()) out.set(String(row.id), { version: Number(row.version), mark: String(row.mark), bytes: Number(row.bytes) });
  return out;
}

const blobOf = (db: Db, id: string): Uint8Array => fromSql(db.sql.exec(`SELECT blob FROM chunks WHERE id = ?`, id).toArray()[0]?.blob);

/** The id of the vault this database holds, or null when it holds none yet. */
export const vaultHeld = (db: Db): string | null => vaultRow(db)?.id ?? null;

/**
 * Says which vault this database is for, when it is for none yet. False: it already holds
 * another one (replacing a vault is a reset, VAULT-5 and VAULT-7, and is not done here).
 */
export function startVault(db: Db, id: string): boolean {
  if (!isId(id)) return false;
  const held = vaultRow(db);
  if (held) return held.id === id;
  db.sql.exec(`INSERT INTO vault (one, id, seq, day, written) VALUES (1, ?, 0, '', 0)`, id);
  return true;
}

/**
 * Lets go of every chunk and of the vault's row: the vault is erased (erase.ts). What the vault wrote on its last day
 * is handed back, so that a vault made after it on the same day goes on from that count.
 */
export function forgetChunks(db: Db): { day: string; written: number } | null {
  const held = vaultRow(db);
  db.sql.exec(`DELETE FROM chunks`);
  db.sql.exec(`DELETE FROM vault`);
  return held ? { day: held.day, written: held.written } : null;
}

/** What changed since `since`, in pages (`Remote.pull`). */
export function pullChunks(db: Db, vault: string, since: number, limits: Limits): Pulled {
  const held = vaultRow(db);
  if (!held || vault !== held.id) return { ok: false, why: "wrong-vault" };
  if (!isVersion(since)) return { ok: false, why: "bad-request" };
  const all = listing(db);
  const digest = digestOf([...all.values()].map((chunk) => chunk.mark));
  const later = [...all].filter(([, chunk]) => chunk.version > since).sort((x, y) => x[1].version - y[1].version);
  const chunks: RemoteChunk[] = [];
  let bytes = 0;
  for (const [id, chunk] of later) {
    // a page always carries at least one chunk, however large
    if (chunks.length && bytes + chunk.bytes > limits.pageBytes) break;
    chunks.push({ id, version: chunk.version, blob: blobOf(db, id) });
    bytes += chunk.bytes;
  }
  const more = chunks.length < later.length;
  return { ok: true, cursor: more ? chunks[chunks.length - 1]!.version : held.seq, more, digest, chunks };
}

/** A batch of writes, taken whole or not at all (`Remote.push`). `today` is the server's day, "YYYY-MM-DD" (UTC). */
export function pushChunks(db: Db, vault: string, writes: readonly Write[], limits: Limits, today: string): Pushed {
  const held = vaultRow(db);
  if (!held || vault !== held.id) return { ok: false, why: "wrong-vault" };
  // 1. Is it a request at all? Nothing from a client is trusted.
  if (!Array.isArray(writes) || writes.length < 1 || writes.length > limits.batchWrites) return { ok: false, why: "bad-request" };
  const ids = new Set<string>();
  let bytes = 0;
  for (const write of writes as readonly Write[]) {
    if (!write || !isId(write.id) || ids.has(write.id) || !isVersion(write.base) || !(write.blob instanceof Uint8Array) || write.blob.length < MIN_BLOB) return { ok: false, why: "bad-request" };
    // a write made from a copy names that copy; a first write names none
    if (write.base > 0 ? !isMark(write.mark) : write.mark !== undefined) return { ok: false, why: "bad-request" };
    ids.add(write.id);
    bytes += write.blob.length;
  }
  // 2. Sizes.
  if (bytes > limits.batchBytes || writes.some((write) => write.blob.length > limits.blobBytes)) return { ok: false, why: "too-big" };
  // 3. Was each write made from the copy held here: its version number, and its mark? If one was not, nothing is written,
  //    and the answer carries what is held.
  const now = listing(db);
  const stale = writes.filter((write) => {
    const was = now.get(write.id);
    return was ? was.version !== write.base || was.mark !== write.mark : write.base !== 0;
  });
  if (stale.length) {
    return {
      ok: false,
      why: "stale",
      chunks: stale.map((write) => {
        const was = now.get(write.id);
        return was ? { id: write.id, version: was.version, blob: blobOf(db, write.id) } : { id: write.id, version: 0 };
      }),
    };
  }
  // 4. Quotas (LIM-2). A refused batch counts for nothing and changes nothing, the day it was refused on included. A
  //    batch that makes an over-full vault smaller is let through.
  const written = held.day === today ? held.written : 0;
  if (written + writes.length > limits.writesPerDay) return { ok: false, why: "quota-writes" };
  const before = [...now.values()].reduce((sum, chunk) => sum + chunk.bytes, 0);
  const after = before + writes.reduce((sum, write) => sum + write.blob.length - (now.get(write.id)?.bytes ?? 0), 0);
  if (after > limits.vaultBytes && after > before) return { ok: false, why: "quota-bytes" };
  // 5. All of it, with a version number each, in the order given.
  return db.atomically(() => {
    const versions: { id: string; version: number }[] = [];
    // (version numbers stay whole numbers that can be counted with: past them there is no writing)
    if (!isVersion(held.seq + writes.length)) throw new Error("version count");
    let seq = held.seq;
    for (const write of writes) {
      seq += 1;
      if (now.has(write.id)) db.sql.exec(`UPDATE chunks SET version = ?, mark = ?, bytes = ?, blob = ? WHERE id = ?`, seq, markOf(write.blob), write.blob.length, toSql(write.blob), write.id);
      else db.sql.exec(`INSERT INTO chunks (id, version, mark, bytes, blob) VALUES (?, ?, ?, ?, ?)`, write.id, seq, markOf(write.blob), write.blob.length, toSql(write.blob));
      versions.push({ id: write.id, version: seq });
    }
    db.sql.exec(`UPDATE vault SET seq = ?, day = ?, written = ? WHERE one = 1`, seq, today, written + writes.length);
    return { ok: true, versions };
  });
}
