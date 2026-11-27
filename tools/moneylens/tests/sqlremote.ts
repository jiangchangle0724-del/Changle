/**
 * The server's own code for a vault's chunks (src/server/chunks.ts), run on Node's SQLite in
 * place of a Durable Object's, with the handles the tests have on the rule book (`MemoryRemote`,
 * vault/memory.ts). The store's tests run against either: `MONEYLENS_REMOTE=sql` picks this one
 * (tests/sync.test.ts), and `npm test` runs both.
 *
 * After every push, and whenever a test looks, what the database says about each blob (its mark
 * and its size) is checked against the blob, and a push that was refused is checked to have
 * written nothing at all.
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { chunkTables, pullChunks, pushChunks, startVault, type Db } from "../src/server/chunks";
import { LIMITS, markOf, type Limits, type Pulled, type Pushed, type Remote, type Write } from "../src/vault/sync";

type Bound = string | number | null | ArrayBuffer;

/** Node's SQLite, shaped like a Durable Object's storage: a blob goes in and comes out as an ArrayBuffer, and a transaction is a function. */
export function sqlite(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  let depth = 0;
  const prepared = new Map<string, ReturnType<DatabaseSync["prepare"]>>();
  return {
    raw,
    sql: {
      exec: (query: string, ...args: Bound[]) => {
        // (a statement is prepared once for each wording: the tests that try every order run the same few many thousands of times)
        let statement = prepared.get(query);
        if (!statement) prepared.set(query, (statement = raw.prepare(query)));
        const rows = statement.all(...args.map((arg) => (arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg))) as Record<string, unknown>[];
        const out = rows.map((row) => Object.fromEntries(Object.entries(row).map(([name, value]) => [name, value instanceof Uint8Array ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value])));
        return { toArray: () => out };
      },
    },
    // One inside another is a savepoint, as with a Durable Object's `transactionSync` (tests/platform/server.test.ts
    // shows that the platform does the same): what the inner one wrote goes if the outer one fails.
    atomically: <T>(work: () => T): T => {
      const name = `s${depth++}`;
      raw.exec(`SAVEPOINT ${name}`);
      try {
        const out = work();
        raw.exec(`RELEASE ${name}`);
        return out;
      } catch (error) {
        raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
  };
}

type Row = { id: string; version: number; mark: string; bytes: number; blob: Uint8Array };
type Whole = { chunks: Row[]; vault: Record<string, unknown> };

export class SqlRemote implements Remote {
  readonly db = sqlite();

  constructor(
    readonly vault: string,
    readonly limits: Limits = LIMITS,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {
    chunkTables(this.db);
    assert.ok(startVault(this.db, vault));
  }

  async pull(vault: string, since: number): Promise<Pulled> {
    return pullChunks(this.db, vault, since, this.limits);
  }

  async push(vault: string, writes: readonly Write[]): Promise<Pushed> {
    const before = this.whole();
    const answer = pushChunks(this.db, vault, writes, this.limits, this.today());
    // a batch that was not taken wrote nothing at all, the day's count included
    if (!answer.ok) assert.deepEqual(this.whole(), before);
    this.check();
    return answer;
  }

  private rows(): Row[] {
    return (this.db.raw.prepare(`SELECT id, version, mark, bytes, blob FROM chunks ORDER BY rowid`).all() as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      version: Number(row.version),
      mark: String(row.mark),
      bytes: Number(row.bytes),
      blob: new Uint8Array(row.blob as Uint8Array),
    }));
  }

  private whole(): Whole {
    return { chunks: this.rows(), vault: { ...(this.db.raw.prepare(`SELECT * FROM vault`).get() as Record<string, unknown>) } };
  }

  /** What the database says about itself is what its blobs say. */
  private check(): void {
    const { chunks, vault } = this.whole();
    for (const row of chunks) assert.deepEqual([row.mark, row.bytes], [markOf(row.blob), row.blob.length], `chunk ${row.id}`);
    assert.equal(vault.seq, Math.max(Number(vault.seq), ...chunks.map((row) => row.version)));
    assert.equal(new Set(chunks.map((row) => row.version)).size, chunks.length);
  }

  /** How many bytes of blobs the vault holds. */
  bytes(): number {
    this.check();
    return this.rows().reduce((sum, row) => sum + row.blob.length, 0);
  }

  /** How many chunks it holds. */
  get size(): number {
    return this.rows().length;
  }

  /** Everything the database holds, every column of every row, as bytes: for tests that look for what a server must never hold (T-6). */
  everything(): Uint8Array[] {
    this.check();
    const text = new TextEncoder();
    const { chunks, vault } = this.whole();
    return [text.encode(JSON.stringify(vault)), ...chunks.flatMap((row) => [text.encode(`${row.id} ${row.version} ${row.mark} ${row.bytes}`), row.blob])];
  }

  /** A copy of the whole database, and going back to one: what a restore from the platform's recovery history does (BAK-1). */
  snapshot(): Whole {
    return this.whole();
  }

  restore(to: Whole): void {
    this.db.atomically(() => {
      this.db.raw.exec(`DELETE FROM chunks; DELETE FROM vault`);
      for (const row of to.chunks) this.db.raw.prepare(`INSERT INTO chunks (id, version, mark, bytes, blob) VALUES (?, ?, ?, ?, ?)`).run(row.id, row.version, row.mark, row.bytes, row.blob);
      const v = to.vault;
      this.db.raw.prepare(`INSERT INTO vault (one, id, seq, day, written) VALUES (1, ?, ?, ?, ?)`).run(String(v.id), Number(v.seq), String(v.day), Number(v.written));
    });
    this.check();
  }

  /**
   * Changes one stored blob in place, as a fault or a hostile server could. For tests. What the database says about
   * the blob follows it, as it does in the rule book, where those are worked out from the blob each time.
   */
  corrupt(id: string, change: (blob: Uint8Array) => Uint8Array): void {
    const row = this.rows().find((r) => r.id === id);
    if (!row) return;
    const blob = change(row.blob.slice());
    this.db.raw.prepare(`UPDATE chunks SET blob = ?, mark = ?, bytes = ? WHERE id = ?`).run(blob, markOf(blob), blob.length, id);
    this.check();
  }

  /** In the order the chunks were first written. */
  ids(): string[] {
    return this.rows().map((row) => row.id);
  }
}
