/**
 * Sync as it travels (VAULT-4): how a push and the answers to a pull and a push are written for
 * HTTP. Used at both ends: by the person's Durable Object, and by the device (web/remote.ts).
 *
 * Sealed chunks are bytes, up to a megabyte each and eight megabytes in one push. They are not
 * put into JSON: base64 would grow them by a third, and writing and reading megabytes of it costs
 * more processor time than a request on Cloudflare's Free plan has (LIM-1). So what travels is a
 * frame: four bytes of length, that many bytes of JSON (the head, which names each blob and says
 * how long it is), then the blobs themselves, one after another, untouched.
 *
 * Reading a frame checks its form only: that the head is JSON of the expected kind and that the
 * blobs use up the bytes exactly. What the numbers and names in it are worth is for whoever asked
 * (the server's `pushChunks`, the device's `sync`), and both check for themselves.
 */
import type { Pulled, Pushed, RemoteChunk, Write } from "../vault/protocol";

/** The longest head. A push of a hundred writes names each in about ninety bytes. */
export const HEAD_MAX = 64 * 1024;
/** More entries than any frame here has. */
const MOST = 1000;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export function frame(head: object, blobs: readonly Uint8Array[] = []): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(head));
  const out = new Uint8Array(4 + text.length + blobs.reduce((n, blob) => n + blob.length, 0));
  new DataView(out.buffer).setUint32(0, text.length);
  out.set(text, 4);
  let at = 4 + text.length;
  for (const blob of blobs) {
    out.set(blob, at);
    at += blob.length;
  }
  return out;
}

/** A frame's head and the bytes after it; null for anything that is not a frame. */
export function unframe(bytes: Uint8Array): { head: Record<string, unknown>; body: Uint8Array } | null {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) return null;
  const length = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  if (length > HEAD_MAX || 4 + length > bytes.length) return null;
  try {
    const head: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes.subarray(4, 4 + length)));
    return isRecord(head) ? { head, body: bytes.subarray(4 + length) } : null;
  } catch {
    return null;
  }
}

/**
 * The blobs after a head, cut where the head's entries say: an entry with `bytes` has that many, one without has
 * none (`null`). Null unless every entry is an object, every `bytes` a count, and together they use up the body exactly.
 */
function cut(body: Uint8Array, entries: unknown): (Uint8Array | null)[] | null {
  if (!Array.isArray(entries) || entries.length > MOST) return null;
  const blobs: (Uint8Array | null)[] = [];
  let at = 0;
  for (const entry of entries) {
    if (!isRecord(entry)) return null;
    if (entry.bytes === undefined) {
      blobs.push(null);
      continue;
    }
    if (!isCount(entry.bytes)) return null;
    blobs.push(body.subarray(at, at + entry.bytes));
    at += entry.bytes;
  }
  return at === body.length ? blobs : null;
}

// --- a push, from the device

export function packPush(vault: string, writes: readonly Write[]): Uint8Array {
  return frame(
    { vault, writes: writes.map((write) => ({ id: write.id, base: write.base, ...(write.mark === undefined ? {} : { mark: write.mark }), bytes: write.blob.length })) },
    writes.map((write) => write.blob),
  );
}

/** What a push asks, as it was sent. The names and numbers in it are not checked here: `pushChunks` does that. */
export function unpackPush(bytes: Uint8Array): { vault: string; writes: Write[] } | null {
  const framed = unframe(bytes);
  if (!framed) return null;
  const entries = framed.head.writes;
  const blobs = cut(framed.body, entries);
  if (!blobs || blobs.some((blob) => blob === null)) return null;
  const writes = (entries as Record<string, unknown>[]).map((entry, i) => ({ id: entry.id, base: entry.base, ...(entry.mark === undefined ? {} : { mark: entry.mark }), blob: blobs[i]! }) as Write);
  return { vault: framed.head.vault as string, writes };
}

// --- the answer to a pull

export function packPulled(pulled: Pulled): Uint8Array {
  if (!pulled.ok) return frame({ ok: false, why: pulled.why });
  return frame(
    { ok: true, cursor: pulled.cursor, more: pulled.more, digest: pulled.digest, chunks: pulled.chunks.map((chunk) => ({ id: chunk.id, version: chunk.version, bytes: chunk.blob.length })) },
    pulled.chunks.map((chunk) => chunk.blob),
  );
}

/** The answer to a pull as the server wrote it; null when it is not one. What it says is for `sync` to believe or not. */
export function unpackPulled(bytes: Uint8Array): Pulled | null {
  const framed = unframe(bytes);
  if (!framed) return null;
  const { head, body } = framed;
  if (head.ok === false) return body.length === 0 && typeof head.why === "string" ? ({ ok: false, why: head.why } as Pulled) : null;
  if (head.ok !== true) return null;
  const blobs = cut(body, head.chunks);
  if (!blobs || blobs.some((blob) => blob === null)) return null;
  const chunks = (head.chunks as Record<string, unknown>[]).map((entry, i) => ({ id: entry.id, version: entry.version, blob: blobs[i]! }) as RemoteChunk);
  return { ok: true, cursor: head.cursor, more: head.more, digest: head.digest, chunks } as Pulled;
}

// --- the answer to a push

export function packPushed(pushed: Pushed): Uint8Array {
  if (pushed.ok) return frame({ ok: true, versions: pushed.versions });
  if (pushed.why !== "stale") return frame({ ok: false, why: pushed.why });
  return frame(
    { ok: false, why: "stale", chunks: pushed.chunks.map((chunk) => ({ id: chunk.id, version: chunk.version, ...(chunk.blob ? { bytes: chunk.blob.length } : {}) })) },
    pushed.chunks.flatMap((chunk) => (chunk.blob ? [chunk.blob] : [])),
  );
}

/** The answer to a push as the server wrote it; null when it is not one. */
export function unpackPushed(bytes: Uint8Array): Pushed | null {
  const framed = unframe(bytes);
  if (!framed) return null;
  const { head, body } = framed;
  if (head.ok === true) return body.length === 0 && Array.isArray(head.versions) ? ({ ok: true, versions: head.versions } as Pushed) : null;
  if (head.ok !== false || typeof head.why !== "string") return null;
  if (head.why !== "stale") return body.length === 0 ? ({ ok: false, why: head.why } as Pushed) : null;
  const blobs = cut(body, head.chunks);
  if (!blobs) return null;
  const chunks = (head.chunks as Record<string, unknown>[]).map((entry, i) => ({ id: entry.id, version: entry.version, ...(blobs[i] ? { blob: blobs[i]! } : {}) }));
  return { ok: false, why: "stale", chunks } as Pushed;
}
