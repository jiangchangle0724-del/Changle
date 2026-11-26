/**
 * The server and the cache of sync.ts, kept in memory.
 *
 * `MemoryRemote` is the rule book for the real server (a Durable Object per user, not written
 * yet): what it checks, in which order, and what it answers. The tests of the store run against
 * it, and the real one will have to pass the same tests. It is also what the demo runs on
 * (ARCH-1): a vault that lives in the page and goes nowhere.
 *
 * Like the real server it holds sealed blobs, ids, sizes and version numbers, and has no key.
 */
import { isId } from "../core/ids";
import { LIMITS, MIN_BLOB, digestOf, isMark, markOf, type Cache, type Kept, type Limits, type Pulled, type Pushed, type Remote, type Write } from "./sync";

const isVersion = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

type Held = { version: number; blob: Uint8Array };

export class MemoryRemote implements Remote {
  private chunks = new Map<string, Held>();
  /** The last version number given out. */
  private seq = 0;
  private day = "";
  private written = 0;

  constructor(
    readonly vault: string,
    readonly limits: Limits = LIMITS,
    /** The server's day, as "YYYY-MM-DD" (UTC). */
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async pull(vault: string, since: number): Promise<Pulled> {
    if (vault !== this.vault) return { ok: false, why: "wrong-vault" };
    if (!isVersion(since)) return { ok: false, why: "bad-request" };
    const later = [...this.chunks].filter(([, held]) => held.version > since).sort((a, b) => a[1].version - b[1].version);
    const chunks: { id: string; version: number; blob: Uint8Array }[] = [];
    let bytes = 0;
    for (const [id, held] of later) {
      // a page always carries at least one chunk, however large
      if (chunks.length && bytes + held.blob.length > this.limits.pageBytes) break;
      chunks.push({ id, version: held.version, blob: held.blob.slice() });
      bytes += held.blob.length;
    }
    const more = chunks.length < later.length;
    return { ok: true, cursor: more ? chunks[chunks.length - 1]!.version : this.seq, more, digest: digestOf([...this.chunks.values()].map((held) => markOf(held.blob))), chunks };
  }

  async push(vault: string, writes: readonly Write[]): Promise<Pushed> {
    if (vault !== this.vault) return { ok: false, why: "wrong-vault" };
    // 1. Is it a request at all? Nothing from a client is trusted.
    if (!Array.isArray(writes) || writes.length < 1 || writes.length > this.limits.batchWrites) return { ok: false, why: "bad-request" };
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
    if (bytes > this.limits.batchBytes || writes.some((write) => write.blob.length > this.limits.blobBytes)) return { ok: false, why: "too-big" };
    // 3. Was each write made from the copy held here: its version number, and its mark? If one was not, nothing is written,
    //    and the answer carries what is held.
    const stale = writes.filter((write) => {
      const held = this.chunks.get(write.id);
      return held ? held.version !== write.base || markOf(held.blob) !== write.mark : write.base !== 0;
    });
    if (stale.length) {
      return {
        ok: false,
        why: "stale",
        chunks: stale.map((write) => {
          const held = this.chunks.get(write.id);
          return held ? { id: write.id, version: held.version, blob: held.blob.slice() } : { id: write.id, version: 0 };
        }),
      };
    }
    // 4. Quotas (LIM-2). A refused batch counts for nothing. A batch that makes an over-full vault smaller is let through.
    const today = this.today();
    if (today !== this.day) {
      this.day = today;
      this.written = 0;
    }
    if (this.written + writes.length > this.limits.writesPerDay) return { ok: false, why: "quota-writes" };
    const before = this.bytes();
    const after = before + writes.reduce((sum, write) => sum + write.blob.length - (this.chunks.get(write.id)?.blob.length ?? 0), 0);
    if (after > this.limits.vaultBytes && after > before) return { ok: false, why: "quota-bytes" };
    // 5. All of it, with a version number each, in the order given.
    const versions: { id: string; version: number }[] = [];
    for (const write of writes) {
      this.seq += 1;
      this.chunks.set(write.id, { version: this.seq, blob: write.blob.slice() });
      versions.push({ id: write.id, version: this.seq });
    }
    this.written += writes.length;
    return { ok: true, versions };
  }

  /** How many bytes of blobs the vault holds. */
  bytes(): number {
    let total = 0;
    for (const held of this.chunks.values()) total += held.blob.length;
    return total;
  }

  /** How many chunks it holds. */
  get size(): number {
    return this.chunks.size;
  }

  /** Everything it holds, as bytes: for tests that look for what a server must never hold (T-6). */
  everything(): Uint8Array[] {
    const text = new TextEncoder();
    return [...this.chunks].flatMap(([id, held]) => [text.encode(`${id} ${held.version}`), held.blob.slice()]);
  }

  /** A copy of its state, and going back to one: what a restore from the platform's recovery history does (BAK-1). */
  snapshot(): { seq: number; chunks: Map<string, Held> } {
    return { seq: this.seq, chunks: new Map([...this.chunks].map(([id, held]) => [id, { version: held.version, blob: held.blob.slice() }])) };
  }

  restore(to: { seq: number; chunks: Map<string, Held> }): void {
    this.seq = to.seq;
    this.chunks = new Map([...to.chunks].map(([id, held]) => [id, { version: held.version, blob: held.blob.slice() }]));
  }

  /** Changes one stored blob in place, as a fault or a hostile server could. For tests. */
  corrupt(id: string, change: (blob: Uint8Array) => Uint8Array): void {
    const held = this.chunks.get(id);
    if (held) held.blob = change(held.blob.slice());
  }

  ids(): string[] {
    return [...this.chunks.keys()];
  }
}

const copy = (kept: Kept): Kept => ({ id: kept.id, version: kept.version, ...(kept.base ? { base: kept.base.slice() } : {}), ...(kept.local ? { local: kept.local.slice() } : {}), ...(kept.sent ? { sent: kept.sent.slice() } : {}) });

export class MemoryCache implements Cache {
  private vault: string | null = null;
  private cursor = 0;
  private chunks = new Map<string, Kept>();

  async load(): Promise<{ vault: string; cursor: number; chunks: Kept[] } | null> {
    return this.vault === null ? null : { vault: this.vault, cursor: this.cursor, chunks: [...this.chunks.values()].map(copy) };
  }

  async save(vault: string, change: { cursor: number; put: readonly Kept[]; drop: readonly string[] }): Promise<void> {
    if (this.vault !== null && this.vault !== vault) throw new Error("cache: it holds another vault");
    this.vault = vault;
    this.cursor = change.cursor;
    for (const kept of change.put) this.chunks.set(kept.id, copy(kept));
    for (const id of change.drop) this.chunks.delete(id);
  }

  async clear(): Promise<void> {
    this.vault = null;
    this.cursor = 0;
    this.chunks = new Map();
  }

  /** Everything it holds, as bytes: for tests that look for what browser storage must never hold (T-24). */
  everything(): Uint8Array[] {
    const text = new TextEncoder();
    return [...this.chunks.values()].flatMap((kept) => [text.encode(`${this.vault} ${this.cursor} ${kept.id} ${kept.version}`), ...[kept.base, kept.local, kept.sent].filter((blob): blob is Uint8Array => blob !== undefined)]);
  }

  /** Changes one stored blob in place. For tests. */
  corrupt(id: string, which: "base" | "local" | "sent", change: (blob: Uint8Array) => Uint8Array): void {
    const kept = this.chunks.get(id);
    const blob = kept?.[which];
    if (kept && blob) kept[which] = change(blob.slice());
  }

  ids(): string[] {
    return [...this.chunks.keys()];
  }
}
