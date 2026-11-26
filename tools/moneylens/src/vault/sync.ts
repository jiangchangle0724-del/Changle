/**
 * The vault's records on this device, and keeping them the same as the server's copy (VAULT-4).
 *
 * `Store` holds every record in memory while the vault is open. Records are packed into chunks
 * (records.ts); each chunk is sealed whole (crypto.ts). Three parties:
 *
 * - The server (`Remote`) keeps, for each chunk, a sealed blob and a version number. Version
 *   numbers count up across the whole vault, one per chunk written. A write names the copy it
 *   was made from: its version number and its mark (`markOf`). If that is not the copy the
 *   server holds, the write is refused: a batch of writes is taken whole or not at all. The
 *   server's copy is the durable one.
 * - The cache (`Cache`) is this device's copy, in the browser's storage. It holds sealed blobs and
 *   version numbers and nothing else. Losing it loses only what had not been sent.
 * - This device's changes. They are sealed and written to the cache by `flush`, and sent by
 *   `sync`.
 *
 * When a write is refused, the server's newer copy of the chunk is merged record by record with
 * this device's copy (`merge3`), and the result is sent again. So one device never overwrites what
 * another wrote without having seen it.
 *
 * Sending twice never doubles anything. A write replaces a whole chunk, so the same write twice
 * is the same chunk. What needs care is a write whose answer never came. Its copy is kept as
 * `sent`, and the next thing sent for that chunk is that same copy, until an answer shows what
 * became of it: taken as it was (the same bytes come back), taken and then built on by another
 * device (its name is in the newer copy's history), or never taken. Until then nothing is
 * assumed, because a request that timed out here can still arrive there.
 *
 * What the server can do: hand back an older copy, or none (a restore, a fault, or malice). A
 * device that has synced before notices. Every pull carries a digest of what the server holds,
 * and the device compares it with what it believes the server holds; when they differ it asks
 * for everything and finds the chunk that is gone or changed. And a copy the server calls newer
 * has to say so itself, inside its sealed part: it names the device's copy among the versions it
 * was made from, or is by its own count too many versions on to still name it. The device then
 * stops and says so ("server-older"), and changes nothing on either side. A device that has
 * never synced cannot notice. Stated in docs/moneylens/security-assessment.md (1.6, section 2).
 *
 * A chunk from the server that does not open, or that was written by a later version of the app,
 * stops the sync before anything is changed. A copy that cannot be read is never written over.
 *
 * An answer is believed only if it answers the request that was sent (`readPushed`, `isPage`), and
 * every request has an end (`ask`). An answer that makes no sense, or does not come, leaves what
 * was sent as of unknown fate.
 *
 * The store never takes a record out of a chunk on its own, and never moves one that the server
 * has had. A record that turns up in more than one chunk (it should not: ids are random) is read
 * as its copies merged, and a sync makes the copies alike, each in its own chunk (`alike`).
 */
import { base64url, fromBase64url, isId, newId } from "../core/ids";
import { MAX_CHUNK_BYTES, type OpenVault } from "./crypto";
import { HISTORY, MAX_ENTRIES, SOFT_CHUNK_BYTES, differs, entryOf, isGroup, isJson, isKind, merge3, mergeMany, openContent, sameEntry, sealContent, type Clash, type Content, type Entry, type Json, type Records, type Value } from "./records";

/** A chunk as the server holds it. */
export type RemoteChunk = { id: string; version: number; blob: Uint8Array };

/**
 * What changed since `since`: chunks in the order they were written. `cursor` is how far this
 * answer reaches; `more` says to ask again from there. `digest` is the marks of every blob the
 * vault holds, combined (`digestOf`): a device that combines the marks of what it believes the
 * server holds gets the same value, or knows that its picture of the server is wrong.
 */
export type Pulled = { ok: true; cursor: number; more: boolean; digest: string; chunks: RemoteChunk[] } | { ok: false; why: "wrong-vault" | "bad-request" };

/**
 * One chunk to write. `base` is the version it was made from, and `mark` the mark of that copy
 * (`markOf`); `base` 0 and no mark for a chunk the server has never had. Both must match what the
 * server holds. The number alone is not enough: after a restore the server counts up from an
 * older number, and gives the same numbers to other copies.
 */
export type Write = { id: string; base: number; mark?: string; blob: Uint8Array };

export type Pushed =
  | { ok: true; versions: { id: string; version: number }[] }
  /** Nothing was written. For each write whose `base` was not the server's version: what the server holds (no blob, version 0: it holds no such chunk). */
  | { ok: false; why: "stale"; chunks: { id: string; version: number; blob?: Uint8Array }[] }
  | { ok: false; why: "wrong-vault" | "bad-request" | "too-big" | "quota-bytes" | "quota-writes" };

/**
 * The server, as the store sees it. Both calls name the vault: after a reset the server holds
 * another vault, and a device still holding the old one must be told, not obeyed. A call that
 * throws means the answer is not known (the network), never that the answer was no.
 */
export interface Remote {
  pull(vault: string, since: number): Promise<Pulled>;
  push(vault: string, writes: readonly Write[]): Promise<Pushed>;
}

/** The name of one sealed copy: its nonce, which is random and made new every time a chunk is sealed. Sixteen characters. */
export const markOf = (blob: Uint8Array): string => base64url(blob.subarray(1, 13));

export const isMark = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{16}$/.test(s);

/** Marks combined: each one's twelve bytes, exclusive-or. The order does not matter, and taking a mark out is combining it in again. */
export function digestOf(marks: Iterable<string>): string {
  const sum = new Uint8Array(12);
  for (const mark of marks) {
    const bytes = fromBase64url(mark);
    if (bytes?.length === 12) for (let i = 0; i < 12; i++) sum[i] = sum[i]! ^ bytes[i]!;
  }
  return base64url(sum);
}

/** What the server enforces. Defaults the operator may change (LIM-2). */
export type Limits = {
  /** One sealed chunk. */
  blobBytes: number;
  /** Everything one vault holds. */
  vaultBytes: number;
  /** Chunks written in one day (UTC). */
  writesPerDay: number;
  /** One push: how many chunks, and how many bytes. */
  batchWrites: number;
  batchBytes: number;
  /** One answer to a pull. */
  pageBytes: number;
};

export const LIMITS: Limits = { blobBytes: 1 + 12 + MAX_CHUNK_BYTES + 16, vaultBytes: 10 * 1024 * 1024, writesPerDay: 300, batchWrites: 100, batchBytes: 8 * 1024 * 1024, pageBytes: 2 * 1024 * 1024 };

/** What one push from this device holds at most. Under the server's limits, with room to spare. */
const PUSH_WRITES = 50;
const PUSH_BYTES = 4 * 1024 * 1024;
/** How many times one `sync` goes round (pull, merge, push) before it gives up for now. */
const ROUNDS = 6;
/**
 * An answer in pages has an end. These are far past what any vault can hold (LIMITS), so an
 * answer that goes beyond one of them is not an answer, and the sync stops instead of following
 * it for ever: pages, chunks and bytes in one pull, and how often one chunk may come round again
 * (it can, when it is written between two pages).
 */
const PULL_PAGES = 1000;
const PULL_CHUNKS = 20_000;
const PULL_BYTES = 64 * 1024 * 1024;
const PULL_REPEATS = 8;
/** The reasons a server may give for refusing a push without having written anything. */
const REFUSALS: ReadonlySet<unknown> = new Set(["wrong-vault", "bad-request", "too-big", "quota-bytes", "quota-writes"]);
/** The smallest a sealed blob can be: version byte, nonce, tag. */
export const MIN_BLOB = 1 + 12 + 16;
/** How long one request may take before its answer counts as not known, in milliseconds, unless the caller says otherwise. */
const PATIENCE = 120_000;
/** What a chunk's heading takes, at most: left free when the copies of a doubled record are made alike. */
const HEADROOM = 2048;

/**
 * One chunk in the cache: sealed blobs and a version number. `base` is the server's copy as last
 * seen (`version` 0 and no base: the server has never had it). `local` is this device's copy with
 * changes that are not on the server. `sent` is a copy that was sent and whose fate is not known.
 */
export type Kept = { id: string; version: number; base?: Uint8Array; local?: Uint8Array; sent?: Uint8Array };

/** This device's copy. It never sees a key or a record, only what `Kept` holds. One `save` is one step: all of it or none. */
export interface Cache {
  load(): Promise<{ vault: string; cursor: number; chunks: Kept[] } | null>;
  save(vault: string, change: { cursor: number; put: readonly Kept[]; drop: readonly string[] }): Promise<void>;
  clear(): Promise<void>;
}

export type Outcome = { ok: true } | { ok: false; why: "invalid" | "exists" | "unknown" | "too-big" | "full" };

export type Trouble =
  | "offline" // no answer; whatever was sent is tried again next time
  | "wrong-vault" // the server holds another vault: this one was reset somewhere else
  | "server-older" // the server's copy is behind what this device last saw
  | "newer" // a chunk written by a later version of the app
  | "unreadable" // a chunk that does not open
  | "malformed" // a chunk that opens and is not what a chunk holds
  | "too-big" // a merged chunk too large to seal, or refused by the server for its size
  | "quota-bytes"
  | "quota-writes"
  | "bad-request"
  | "bad-reply" // the server's answer made no sense
  | "busy"; // other devices kept writing; try again

export type Synced = { ok: true; received: number; sent: number; clashes: Clash[] } | { ok: false; why: Trouble; received: number; sent: number; clashes: Clash[]; chunks?: string[] };

type Sealed = { readonly blob: Uint8Array; readonly content: Content };

type Slot = {
  readonly id: string;
  group: string;
  /** The server's version of `base`. 0: the server has never had this chunk. */
  version: number;
  base?: Sealed;
  /** `base` with this device's changes. A new map on every change; never changed in place. */
  work: Records;
  /** `work` sealed, as of when it was sealed. Current when `local.content.records === work`. */
  local?: Sealed;
  sent?: Sealed;
};

const isVersion = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const isAnswer = (x: unknown): x is { ok: boolean } => typeof x === "object" && x !== null && typeof (x as { ok?: unknown }).ok === "boolean";

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class Store {
  private readonly slots = new Map<string, Slot>();
  /** Which chunk each record is read from. */
  private where = new Map<string, string>();
  /**
   * Records found in more than one chunk, with the chunks that hold them. Should be none: ids are random, and a record
   * never moves. The store does not move one either, nor take a copy out: see `alike`.
   */
  private many = new Map<string, string[]>();
  /** Of those, the ones whose copies differ, as they are read: all copies merged (`mergeMany`). */
  private merged = new Map<string, Entry>();
  private cursor = 0;
  private savedCursor = 0;
  private readonly touched = new Set<string>();
  private readonly dropped = new Set<string>();
  private readonly measured = new WeakMap<Records, number>();
  /** Chunks whose `sent` copy went out in a request that got no answer: it may be on the server, or still on its way. */
  private readonly unanswered = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private spoiled = 0;
  /** What a sync has still to tell the app: records found doubled in the cache when the store was opened. */
  private owed: Clash[] = [];
  /** Goes up with every change to what the store holds, from here or from the server. */
  changes = 0;

  private constructor(
    private readonly vault: OpenVault,
    private readonly cache: Cache,
    private readonly clock: () => number,
    private readonly patience: number,
  ) {}

  /**
   * Opens the store from this device's cache. Call `sync` next. A cache that belongs to another
   * vault is emptied. A cached chunk that does not open is left out and counted in `status()`,
   * and everything is then asked of the server again.
   */
  static async open(vault: OpenVault, cache: Cache, options: { now?: () => number; patience?: number } = {}): Promise<Store> {
    const store = new Store(vault, cache, options.now ?? Date.now, options.patience !== undefined && options.patience > 0 ? options.patience : PATIENCE);
    let kept = await cache.load();
    if (kept && kept.vault !== vault.id) {
      await cache.clear();
      kept = null;
    }
    if (kept) {
      for (const chunk of kept.chunks) {
        const slot = await store.revive(chunk);
        if (slot && !store.slots.has(slot.id)) {
          store.slots.set(slot.id, slot);
          // what became of a copy that was sent before the page closed is not known here
          if (slot.sent) store.unanswered.add(slot.id);
        } else {
          store.spoiled += 1;
          if (typeof chunk.id === "string" && !store.slots.has(chunk.id)) store.dropped.add(chunk.id);
        }
      }
      store.cursor = store.savedCursor = isVersion(kept.cursor) && !store.spoiled ? kept.cursor : 0;
    }
    store.reindex();
    for (const id of store.merged.keys()) store.owed.push({ id, what: "doubled" });
    return store;
  }

  private async revive(chunk: Kept): Promise<Slot | null> {
    if (!isId(chunk.id) || !isVersion(chunk.version) || chunk.version > 0 !== (chunk.base !== undefined)) return null;
    const copies: (Sealed | undefined)[] = [];
    for (const blob of [chunk.base, chunk.local, chunk.sent]) {
      if (blob === undefined) copies.push(undefined);
      else {
        if (!(blob instanceof Uint8Array)) return null;
        const opened = await openContent(this.vault, chunk.id, blob);
        if (!opened.ok) return null;
        copies.push({ blob, content: opened.content });
      }
    }
    const [base, local, sent] = copies;
    const any = local ?? base ?? sent;
    if (!any) return null;
    // No `local` means this device's copy is the server's: with a `sent` copy still out, that is a change that was undone since.
    return { id: chunk.id, group: any.content.group, version: chunk.version, work: (local ?? base)?.content.records ?? new Map(), ...(base ? { base } : {}), ...(local ? { local } : {}), ...(sent ? { sent } : {}) };
  }

  // ---- reading

  /** A record, by its id. */
  get(id: string): Value | undefined {
    return this.entry(id)?.value;
  }

  /** What kind of record an id is. */
  kind(id: string): string | undefined {
    return this.entry(id)?.kind;
  }

  /** Every record of one kind, in no particular order. */
  list(kind: string): Value[] {
    return this.everything().filter((record) => record.kind === kind).map((record) => record.value);
  }

  /** Every record with its kind, for an export or a comparison. */
  everything(): { kind: string; value: Value }[] {
    const out: { kind: string; value: Value }[] = [];
    for (const slot of this.slots.values()) {
      for (const [id, own] of slot.work) {
        // a record found in more than one chunk is listed once
        if (this.where.get(id) !== slot.id) continue;
        const entry = this.merged.get(id) ?? own;
        out.push({ kind: entry.kind, value: entry.value });
      }
    }
    return out;
  }

  /** `doubled`: records found in more than one chunk whose copies differ (they are read merged; `sync` makes them alike). */
  status(): { records: number; chunks: number; pending: number; damaged: number; doubled: number } {
    let pending = 0;
    for (const slot of this.slots.values()) if (slot.sent || differs(slot.work, slot.base?.content.records)) pending += 1;
    return { records: this.where.size, chunks: this.slots.size, pending, damaged: this.spoiled, doubled: this.merged.size };
  }

  private entry(id: string): Entry | undefined {
    return this.merged.get(id) ?? this.slots.get(this.where.get(id) ?? "")?.work.get(id);
  }

  /** The chunks that hold a record: one, unless something went wrong somewhere. */
  private holders(id: string): Slot[] {
    const ids = this.many.get(id) ?? [this.where.get(id) ?? ""];
    return ids.map((holder) => this.slots.get(holder)).filter((slot): slot is Slot => slot !== undefined && slot.work.has(id));
  }

  // ---- changing (in memory; `flush` keeps it, `sync` sends it)

  /**
   * Adds a record. `group` says which records it belongs with (one account's transactions, or
   * the book of accounts and rules): it goes into a chunk of that group with room, or a new one.
   */
  add(kind: string, group: string, value: Value): Outcome {
    if (!isGroup(group)) return { ok: false, why: "invalid" };
    const entry = entryOf(kind, this.stamp(0), value);
    if (!entry) return { ok: false, why: this.whyNot(kind, value) };
    if (this.where.has(entry.value.id)) return { ok: false, why: "exists" };
    this.put(this.roomFor(group, entry.size), entry);
    return { ok: true };
  }

  /** Changes fields of a record. A field given as `undefined` is taken out. The others stay, including ones this version of the app does not know. */
  change(id: string, fields: { readonly [name: string]: Json | undefined }): Outcome {
    const old = this.entry(id);
    if (!old) return { ok: false, why: "unknown" };
    if (typeof fields !== "object" || fields === null || (Object.hasOwn(fields, "id") && fields.id !== id)) return { ok: false, why: "invalid" };
    const value = Object.fromEntries(Object.entries({ ...old.value, ...fields }).filter(([, v]) => v !== undefined)) as Value;
    const entry = entryOf(old.kind, this.stamp(old.at + 1), value);
    if (!entry) return { ok: false, why: this.whyNot(old.kind, value) };
    if (sameEntry(entry, old)) return { ok: true };
    // A record found in more than one chunk is changed in every one of them: the copies are the same from then on.
    const holders = this.holders(id);
    for (const slot of holders) {
      const copy = slot.work.get(id)!;
      if (entry.size > copy.size && this.bytes(slot.work) - copy.size + entry.size > SOFT_CHUNK_BYTES) return { ok: false, why: "full" };
    }
    for (const slot of holders) {
      const next = new Map(slot.work);
      next.set(id, entry);
      slot.work = next;
    }
    this.merged.delete(id);
    this.changes += 1;
    return { ok: true };
  }

  /** Removes a record: every copy of it that this device holds. */
  remove(id: string): Outcome {
    if (!this.where.has(id)) return { ok: false, why: "unknown" };
    for (const slot of this.holders(id)) {
      const next = new Map(slot.work);
      next.delete(id);
      slot.work = next;
    }
    this.where.delete(id);
    this.many.delete(id);
    this.merged.delete(id);
    this.changes += 1;
    return { ok: true };
  }

  private stamp(least: number): number {
    const now = this.clock();
    return Math.max(Number.isSafeInteger(now) && now >= 0 ? now : 0, least);
  }

  private whyNot(kind: string, value: Value): "invalid" | "too-big" {
    return isKind(kind) && typeof value === "object" && value !== null && isId(value.id) && isJson(value) ? "too-big" : "invalid";
  }

  /** Puts into this chunk a record that is in none yet, or one that `seal` is moving out of a chunk too large to seal. */
  private put(slot: Slot, entry: Entry): void {
    const next = new Map(slot.work);
    next.set(entry.value.id, entry);
    slot.work = next;
    this.where.set(entry.value.id, slot.id);
    this.changes += 1;
  }

  /**
   * The copies of a record found in more than one chunk are made alike: each becomes all of them merged (`mergeMany`).
   * No copy is taken out of its chunk, here or anywhere. To a device that has not seen the other chunk, a record taken
   * out of one chunk to be kept in another is a record that was removed, and what that device did to it would go with it.
   * A record whose merged form does not fit in one of its chunks is left as it is; it is still read merged.
   */
  private alike(): void {
    for (const [id, merged] of [...this.merged]) {
      const holders = this.holders(id);
      if (holders.some((slot) => this.bytes(slot.work) - slot.work.get(id)!.size + merged.size > MAX_CHUNK_BYTES - HEADROOM)) continue;
      for (const slot of holders) {
        if (sameEntry(slot.work.get(id), merged)) continue;
        const next = new Map(slot.work);
        next.set(id, merged);
        slot.work = next;
      }
      this.merged.delete(id);
    }
  }

  private bytes(records: Records): number {
    let total = this.measured.get(records);
    if (total === undefined) {
      total = 0;
      for (const entry of records.values()) total += entry.size;
      this.measured.set(records, total);
    }
    return total;
  }

  /** A chunk of this group that can take a record of this size: the fullest one with room, or a new one. */
  private roomFor(group: string, size: number): Slot {
    let best: Slot | undefined;
    for (const slot of this.slots.values()) {
      if (slot.group !== group || slot.work.size >= MAX_ENTRIES || this.bytes(slot.work) + size > SOFT_CHUNK_BYTES) continue;
      if (!best || slot.work.size > best.work.size || (slot.work.size === best.work.size && slot.id < best.id)) best = slot;
    }
    if (best) return best;
    const slot: Slot = { id: newId(), group, version: 0, work: new Map() };
    this.slots.set(slot.id, slot);
    return slot;
  }

  private reindex(): void {
    const where = new Map<string, string>();
    const many = new Map<string, string[]>();
    for (const slot of this.slots.values()) {
      for (const id of slot.work.keys()) {
        const first = where.get(id);
        if (first === undefined) {
          where.set(id, slot.id);
          continue;
        }
        // The same record in more than one chunk. It is listed with the chunk that has the smallest id, and read as all its copies merged.
        const all = many.get(id);
        if (all) all.push(slot.id);
        else many.set(id, [first, slot.id]);
        if (slot.id < first) where.set(id, slot.id);
      }
    }
    const merged = new Map<string, Entry>();
    for (const [id, holders] of many) {
      const copies = holders.map((holder) => this.slots.get(holder)!.work.get(id)!);
      if (copies.some((copy) => !sameEntry(copy, copies[0]))) merged.set(id, mergeMany(copies));
    }
    this.where = where;
    this.many = many;
    this.merged = merged;
  }

  // ---- keeping and sending

  /** Seals what changed and writes it to the cache, so that closing the page loses nothing. */
  flush(): Promise<void> {
    return this.inTurn(async () => {
      await this.seal();
    });
  }

  /** Brings this device and the server to the same state: receives what changed there, merges, sends what changed here. */
  sync(remote: Remote): Promise<Synced> {
    return this.inTurn(() => this.run(remote));
  }

  private inTurn<T>(job: () => Promise<T>): Promise<T> {
    const turn = this.queue.then(job, job);
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  /** Seals every chunk whose records changed since it was last sealed, then saves. Returns the chunks that cannot be sealed. */
  private async seal(): Promise<string[]> {
    const stuck = new Set<string>();
    for (let pass = 0, again = true; again && pass < 8; pass++) {
      again = false;
      for (const slot of [...this.slots.values()]) {
        const work = slot.work;
        if (slot.local?.content.records === work || stuck.has(slot.id)) continue;
        const from = slot.base?.content.records;
        if (!differs(work, from)) {
          // nothing of this device's is in it
          if (slot.local) {
            slot.local = undefined;
            this.touched.add(slot.id);
          }
          if (from) slot.work = from;
          else if (!slot.sent) {
            // made here, never sent, and empty again
            this.slots.delete(slot.id);
            this.touched.delete(slot.id);
            this.dropped.add(slot.id);
          }
          continue;
        }
        const rev = newId();
        const content: Content = { group: slot.group, n: (slot.base?.content.n ?? 0) + 1, rev, history: [rev, ...(slot.base?.content.history ?? [])].slice(0, HISTORY), records: work };
        const blob = await sealContent(this.vault, slot.id, content);
        if (blob) {
          slot.local = { blob, content };
          this.touched.add(slot.id);
          continue;
        }
        // Too large for one chunk: only a merge does that. The records this device added and the server has never had go to another chunk.
        // Not while a copy's fate is unknown: one of them might be in it. And not a record that is in another chunk too: no copy of
        // such a record is ever taken out of its chunk (`alike`).
        const added = slot.sent ? [] : [...work.values()].filter((entry) => !from?.has(entry.value.id) && !this.many.has(entry.value.id));
        if (!added.length || slot.work !== work) {
          if (slot.work === work) stuck.add(slot.id);
          else again = true;
          continue;
        }
        const stay = new Map(work);
        for (const entry of added) stay.delete(entry.value.id);
        slot.work = stay;
        for (const entry of added) this.put(this.roomFor(slot.group, entry.size), entry);
        again = true;
      }
    }
    await this.save();
    return [...stuck];
  }

  private async save(): Promise<void> {
    const put: Kept[] = [];
    const saved: string[] = [];
    for (const id of this.touched) {
      const slot = this.slots.get(id);
      if (!slot) {
        saved.push(id);
        continue;
      }
      // The base moved on and this device's changes are not sealed against it yet: writing the chunk now would put the server's
      // newer copy in the cache without them. (A sealed copy that is a few changes behind is fine: it was made from this base.)
      if (!slot.local && differs(slot.work, slot.base?.content.records)) continue;
      put.push({ id, version: slot.version, ...(slot.base ? { base: slot.base.blob } : {}), ...(slot.local ? { local: slot.local.blob } : {}), ...(slot.sent ? { sent: slot.sent.blob } : {}) });
      saved.push(id);
    }
    const drop = [...this.dropped].filter((id) => !this.slots.has(id));
    if (!put.length && !drop.length && this.cursor === this.savedCursor) return;
    await this.cache.save(this.vault.id, { cursor: this.cursor, put, drop });
    for (const id of saved) this.touched.delete(id);
    this.dropped.clear();
    this.savedCursor = this.cursor;
  }

  /** One request, with an end: an answer that does not come in time is an answer that is not known. */
  private async ask<T>(request: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("no answer in time")), this.patience);
    });
    try {
      return await Promise.race([request(), late]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async run(remote: Remote): Promise<Synced> {
    const clashes: Clash[] = this.owed.splice(0);
    let received = 0;
    let sent = 0;
    const fail = (why: Trouble, chunks?: string[]): Synced => ({ ok: false, why, received, sent, clashes, ...(chunks?.length ? { chunks } : {}) });
    let recounted = false;
    /** Ask for everything in the next round: the digest did not add up. (Kept apart from the cursor, which only moves when a pull is taken.) */
    let recount = false;
    for (let round = 0; round < ROUNDS; round++) {
      const everything = recount || this.cursor === 0;
      await this.seal();

      // What changed on the server since this device last looked.
      const got = new Map<string, RemoteChunk>();
      const seen = new Map<string, number>();
      const from = everything ? 0 : this.cursor;
      let cursor = from;
      let digest = "";
      for (let since = from, pages = 0, bytes = 0, count = 0; ; ) {
        let page: Pulled;
        try {
          page = await this.ask(() => remote.pull(this.vault.id, since));
        } catch {
          return fail("offline");
        }
        if (!isAnswer(page)) return fail("bad-reply");
        if (!page.ok) return fail(page.why === "wrong-vault" || page.why === "bad-request" ? page.why : "bad-reply");
        if (!isPage(page, since)) return fail("bad-reply");
        for (const chunk of page.chunks) {
          const times = (seen.get(chunk.id) ?? 0) + 1;
          seen.set(chunk.id, times);
          bytes += chunk.blob.length;
          count += 1;
          if (times > PULL_REPEATS) return fail("bad-reply");
          got.set(chunk.id, chunk);
        }
        if (++pages > PULL_PAGES || count > PULL_CHUNKS || bytes > PULL_BYTES) return fail("bad-reply");
        cursor = page.cursor;
        digest = page.digest;
        if (!page.more) break;
        since = page.chunks[page.chunks.length - 1]!.version;
      }
      // Is this device's picture of the server right? Everything it believes the server holds, with what it was just sent:
      // the marks of all of it, combined, must be the server's own.
      const marks = new Map<string, string>();
      for (const slot of this.slots.values()) if (slot.base) marks.set(slot.id, markOf(slot.base.blob));
      if (everything) {
        // The server has just listed all it holds. A chunk this device had from it and that is not in the list is gone.
        const gone = [...marks.keys()].filter((id) => !got.has(id));
        if (gone.length) return fail("server-older", gone);
      }
      for (const chunk of got.values()) marks.set(chunk.id, markOf(chunk.blob));
      if (digestOf(marks.values()) !== digest) {
        // It is not. Ask for everything, once, and compare chunk by chunk.
        if (everything || recounted) return fail("bad-reply");
        recounted = true;
        recount = true;
        continue;
      }
      // The server's count never goes back. A place behind this device's own, with nothing else amiss, is a server whose count did.
      if (cursor < this.cursor) return fail("server-older");
      const taken = await this.take([...got.values()], clashes);
      if (!taken.ok) return fail(taken.why, taken.chunks);
      received += taken.count;
      this.cursor = cursor;
      recount = false;
      // (after every look at the server, with or without news: the cache can hold doubled records from before)
      this.alike();
      const stuck = await this.seal();

      // What changed here. A chunk with a copy of unknown fate sends that same copy again.
      const ready = [...this.slots.values()].filter((slot) => slot.sent || (slot.local && slot.local.content.records === slot.work));
      if (!ready.length) {
        if (stuck.length) return fail("too-big", stuck);
        if ([...this.slots.values()].some((slot) => differs(slot.work, slot.base?.content.records))) continue;
        return { ok: true, received, sent, clashes };
      }
      let refused = false;
      for (const batch of batches(ready)) {
        const writes: Write[] = batch.map((slot) => {
          slot.sent ??= slot.local!;
          this.touched.add(slot.id);
          return { id: slot.id, base: slot.version, ...(slot.base ? { mark: markOf(slot.base.blob) } : {}), blob: slot.sent.blob };
        });
        // what is about to leave is on record before it leaves
        await this.save();
        // Until an answer says otherwise, any of these copies may be on the server or still on its way there.
        const unknown = (why: Trouble): Synced => {
          for (const slot of batch) this.unanswered.add(slot.id);
          return fail(why);
        };
        let reply: unknown;
        try {
          reply = await this.ask(() => remote.push(this.vault.id, writes));
        } catch {
          return unknown("offline");
        }
        // An answer that is not an answer to these writes says nothing about what became of them.
        const answer = readPushed(reply, writes, this.cursor);
        if (!answer) return unknown("bad-reply");
        if (answer.is === "taken") {
          const numbers = [...answer.versions.values()].sort((a, b) => a - b);
          for (const slot of batch) this.adopt(slot, slot.sent!, answer.versions.get(slot.id)!);
          // If nobody else wrote in between, this device has now seen everything up to its own writes.
          if (numbers.every((n, i) => n === this.cursor + 1 + i)) this.cursor += numbers.length;
          sent += batch.length;
          continue;
        }
        // Refused, and the refusal holds up: this request wrote nothing. Each stale chunk came with what the server holds,
        // which is merged first. (One that came with nothing is a chunk this device had and the server no longer holds:
        // the next look at the server finds that, and says so.)
        if (answer.is === "stale") {
          const merged = await this.take(answer.theirs, clashes);
          if (!merged.ok) return fail(merged.why, merged.chunks);
          received += merged.count;
        }
        // A copy that went out in no other request is then neither on the server nor on its way, and the next round sends
        // whatever is newest. A copy from an earlier request that got no answer stays as it is.
        for (const slot of batch) {
          if (!slot.sent || this.unanswered.has(slot.id)) continue;
          slot.sent = undefined;
          this.touched.add(slot.id);
        }
        if (answer.is === "refused") {
          await this.save();
          return fail(answer.why);
        }
        refused = true;
        break;
      }
      const still = await this.seal();
      if (refused) continue;
      const waiting = [...this.slots.values()].filter((slot) => slot.sent || differs(slot.work, slot.base?.content.records));
      if (!waiting.length) return { ok: true, received, sent, clashes };
      if (waiting.every((slot) => still.includes(slot.id))) return fail("too-big", still);
    }
    return fail("busy");
  }

  /** The server took this copy: it is the base now. */
  private adopt(slot: Slot, copy: Sealed, version: number): void {
    slot.base = copy;
    slot.version = version;
    slot.sent = undefined;
    this.unanswered.delete(slot.id);
    // A copy sealed against the old base names the wrong history; it is sealed again if there is still something to send.
    slot.local = undefined;
    if (!differs(slot.work, copy.content.records)) slot.work = copy.content.records;
    this.touched.add(slot.id);
  }

  /**
   * Takes chunks the server sent. All are opened first: if one cannot be used, none is applied.
   * Then each replaces this device's copy, or is merged with it when this device has changes.
   */
  private async take(chunks: readonly RemoteChunk[], clashes: Clash[]): Promise<{ ok: true; count: number } | { ok: false; why: Trouble; chunks?: string[] }> {
    const opened: { chunk: RemoteChunk; content: Content }[] = [];
    const bad: Record<"newer" | "unreadable" | "malformed", string[]> = { newer: [], unreadable: [], malformed: [] };
    for (const chunk of chunks) {
      const slot = this.slots.get(chunk.id);
      if (slot?.base && chunk.version === slot.version && equal(chunk.blob, slot.base.blob)) continue; // what this device already has
      if (slot && chunk.version <= slot.version) return { ok: false, why: "server-older", chunks: [chunk.id] };
      // The very copy this device has, under a later number. A server that keeps its numbers gives one copy one number,
      // and taking this for "the chunk has moved on" would give up a sent copy that can still arrive.
      if (slot?.base && markOf(chunk.blob) === markOf(slot.base.blob)) return { ok: false, why: "bad-reply", chunks: [chunk.id] };
      const content = await openContent(this.vault, chunk.id, chunk.blob);
      if (!content.ok) {
        bad[content.why].push(chunk.id);
        continue;
      }
      // The server calls this copy newer. The copy itself has to agree, in the part the server cannot write: it names the
      // copy this device has among the versions it was made from, unless by its own count it is so many versions later
      // that the name has dropped off the end of that list. A copy that does not is an older one handed back, or one that
      // was never built on this device's, and merging it as if it were newer would remove records.
      const mine = slot?.base?.content;
      if (mine && content.content.n - mine.n < HISTORY && !content.content.history.includes(mine.rev)) return { ok: false, why: "server-older", chunks: [chunk.id] };
      opened.push({ chunk, content: content.content });
    }
    for (const why of ["newer", "unreadable", "malformed"] as const) if (bad[why].length) return { ok: false, why, chunks: bad[why] };

    // From here to the end nothing waits, so nothing else changes in between.
    for (const { chunk, content } of opened) {
      const copy: Sealed = { blob: chunk.blob, content };
      const slot = this.slots.get(chunk.id);
      this.touched.add(chunk.id);
      if (!slot) {
        this.slots.set(chunk.id, { id: chunk.id, group: content.group, version: chunk.version, base: copy, work: content.records });
        continue;
      }
      let from = slot.base?.content.records;
      if (slot.sent) {
        const mine = slot.sent;
        if (equal(chunk.blob, mine.blob)) {
          // the copy this device sent arrived, as it was
          this.adopt(slot, mine, chunk.version);
          continue;
        }
        // It arrived and another device built on it; or the chunk moved on without it (the server's copy is no longer the
        // one it was made from), and then it never can arrive.
        if (content.history.includes(mine.content.rev)) from = mine.content.records;
        slot.sent = undefined;
        this.unanswered.delete(slot.id);
      }
      const merged = merge3(from, slot.work, content.records);
      clashes.push(...merged.clashes);
      slot.base = copy;
      slot.version = chunk.version;
      slot.group = content.group;
      slot.work = merged.ahead ? merged.records : content.records;
      slot.local = undefined;
    }
    if (opened.length) {
      const known = new Set(this.merged.keys());
      this.reindex();
      // a record that now turns out to be in more than one chunk: said once, when it is first seen
      for (const id of this.merged.keys()) if (!known.has(id)) clashes.push({ id, what: "doubled" });
      this.changes += 1;
    }
    return { ok: true, count: opened.length };
  }
}

type Answer =
  | { is: "taken"; versions: Map<string, number> }
  | { is: "stale"; theirs: RemoteChunk[] }
  | { is: "refused"; why: "wrong-vault" | "bad-request" | "too-big" | "quota-bytes" | "quota-writes" };

/**
 * Reads the answer to a push. Null: it is not an answer to these writes, and nothing in it is believed.
 *
 * "Taken" names every chunk of the request, each once and no other, each with a version number of its own that is
 * later than the copy it replaces and than anything this device has seen. (The second covers the first unless the
 * device's place is behind a chunk it wrote itself, which is so after another device wrote between its look and its
 * write. Both are checked.)
 *
 * "Stale" names chunks of the request, each at most once, and for each of them shows why: a copy that is not the one
 * the write was made from, or that the server holds none where the write named one. An answer that calls a write stale
 * and shows the very copy it was made from has shown nothing, and is not taken for a refusal.
 */
function readPushed(reply: unknown, writes: readonly Write[], cursor: number): Answer | null {
  if (!isAnswer(reply)) return null;
  const asked = new Map(writes.map((write) => [write.id, write]));
  const named = new Set<string>();
  const one = (x: unknown): { write: Write; version: number; blob: unknown } | null => {
    if (typeof x !== "object" || x === null) return null;
    const { id, version, blob } = x as { id?: unknown; version?: unknown; blob?: unknown };
    const write = typeof id === "string" ? asked.get(id) : undefined;
    if (!write || named.has(write.id) || !isVersion(version)) return null;
    named.add(write.id);
    return { write, version, blob };
  };
  if (reply.ok) {
    const list = (reply as { versions?: unknown }).versions;
    if (!Array.isArray(list) || list.length !== writes.length) return null;
    const versions = new Map<string, number>();
    const numbers = new Set<number>();
    for (const x of list as unknown[]) {
      const entry = one(x);
      if (!entry || entry.version <= entry.write.base || entry.version <= cursor || numbers.has(entry.version)) return null;
      numbers.add(entry.version);
      versions.set(entry.write.id, entry.version);
    }
    return { is: "taken", versions };
  }
  const why = (reply as { why?: unknown }).why;
  if (why !== "stale") return REFUSALS.has(why) ? { is: "refused", why: why as Extract<Answer, { is: "refused" }>["why"] } : null;
  const list = (reply as { chunks?: unknown }).chunks;
  if (!Array.isArray(list) || !list.length) return null;
  const theirs: RemoteChunk[] = [];
  for (const x of list as unknown[]) {
    const entry = one(x);
    if (!entry) return null;
    if (entry.blob === undefined) {
      // "the server holds no such chunk" refuses only a write that named a copy
      if (entry.version !== 0 || entry.write.base === 0) return null;
      continue;
    }
    if (!(entry.blob instanceof Uint8Array) || entry.blob.length < MIN_BLOB || entry.version === 0 || markOf(entry.blob) === entry.write.mark) return null;
    theirs.push({ id: entry.write.id, version: entry.version, blob: entry.blob });
  }
  return { is: "stale", theirs };
}

function isPage(page: Extract<Pulled, { ok: true }>, since: number): boolean {
  if (!isVersion(page.cursor) || !isMark(page.digest) || typeof page.more !== "boolean" || !Array.isArray(page.chunks)) return false;
  if (page.more && !page.chunks.length) return false;
  let last = since;
  for (const chunk of page.chunks) {
    if (!chunk || !isId(chunk.id) || !isVersion(chunk.version) || chunk.version <= last || !(chunk.blob instanceof Uint8Array) || chunk.blob.length < MIN_BLOB) return false;
    last = chunk.version;
  }
  // (a cursor behind `since` with nothing to show is a server that went back: the caller's to say)
  return !page.chunks.length || page.cursor >= last;
}

function batches(slots: readonly Slot[]): Slot[][] {
  const out: Slot[][] = [];
  let bytes = 0;
  for (const slot of slots) {
    const size = (slot.sent ?? slot.local!).blob.length;
    const last = out[out.length - 1];
    if (last && last.length < PUSH_WRITES && bytes + size <= PUSH_BYTES) {
      last.push(slot);
      bytes += size;
    } else {
      out.push([slot]);
      bytes = size;
    }
  }
  return out;
}
