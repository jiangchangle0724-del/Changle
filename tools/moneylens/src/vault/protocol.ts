/**
 * What a device and the server say to each other about a vault's chunks (VAULT-4): the two calls,
 * what each carries, how a sealed copy is named, and the limits the server keeps. Both ends import
 * this file and nothing of each other: the device's side is sync.ts, the server's is
 * server/chunks.ts, and the rule book both are tested against is memory.ts.
 *
 * Nothing here seals, opens or reads a chunk. To the server a chunk is bytes.
 */
import { base64url, fromBase64url } from "../core/ids";
import { MAX_CHUNK_BYTES } from "./sizes";

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

/** The smallest a sealed blob can be: version byte, nonce, tag. */
export const MIN_BLOB = 1 + 12 + 16;
