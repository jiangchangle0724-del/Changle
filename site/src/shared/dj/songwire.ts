/**
 * 打碟 · DJ Booth: a song file the host sends from their phone to the big screen (Steve on Nov 2:
 * 我的歌 should work from the phone too). The file goes in pieces over the phone's own line to the
 * table, as binary messages: the rooms server checks each piece, says whose it is, and passes it
 * straight on to the big screen (it keeps nothing); the big screen puts the file back together and
 * listens to it like one chosen on its own computer.
 *
 * A piece: "SONG", the header's length (4 bytes, little-endian), the header (JSON), the bytes.
 * Pure: the phone, the rooms server and the big screen all use it.
 */

/** One piece of a song file: which file (`id`, the phone's own name for it), which piece of how many, the file's size, name and type; `by`, the phone it came from (the rooms server says, never the phone). */
export type SongPiece = { id: string; i: number; n: number; size: number; name: string; type: string; by?: string };

/** a piece's bytes (the last one has the rest) */
export const PIECE_BYTES = 256 * 1024;
/** the biggest song file a phone sends (a long song at a high bitrate) */
export const SONG_BYTES = 30 * 1024 * 1024;
/** the most a phone sends a minute (two big songs) */
export const PHONE_BYTES_MIN = 2 * SONG_BYTES;

const MAGIC = [0x53, 0x4f, 0x4e, 0x47];
const HEAD_MAX = 1024;
const ID = /^[a-z0-9]{4,16}$/;

/** A file's number, for the word back on how it went (a room event carries numbers). */
export const fileNumber = (id: string) => parseInt(id.slice(0, 8), 36);

/** A piece, ready to send. */
export function encodePiece(h: SongPiece, bytes: Uint8Array): ArrayBuffer {
  const head = new TextEncoder().encode(JSON.stringify({ id: h.id, i: h.i, n: h.n, size: h.size, name: h.name, type: h.type, ...(h.by ? { by: h.by } : {}) }));
  const out = new Uint8Array(8 + head.length + bytes.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, head.length, true);
  out.set(head, 8);
  out.set(bytes, 8 + head.length);
  return out.buffer;
}

/** A piece that came in, every field checked (its bytes the right length for where it falls in the file), else null. */
export function decodePiece(buf: ArrayBuffer): { h: SongPiece; bytes: Uint8Array } | null {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength < 9 || buf.byteLength > 8 + HEAD_MAX + PIECE_BYTES) return null;
  const all = new Uint8Array(buf);
  if (MAGIC.some((b, i) => all[i] !== b)) return null;
  const len = new DataView(buf).getUint32(4, true);
  if (len < 2 || len > HEAD_MAX || 8 + len > buf.byteLength) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(all.subarray(8, 8 + len)));
  } catch {
    return null;
  }
  const r = (raw ?? {}) as Record<string, unknown>;
  const { id, i, n, size, name, type, by } = r;
  if (typeof id !== "string" || !ID.test(id)) return null;
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > SONG_BYTES) return null;
  if (typeof n !== "number" || n !== Math.ceil(size / PIECE_BYTES)) return null;
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= n) return null;
  if (typeof name !== "string" || !name || name.length > 200 || typeof type !== "string" || type.length > 80) return null;
  if (by !== undefined && (typeof by !== "string" || !by || by.length > 48)) return null;
  const bytes = all.subarray(8 + len);
  const want = i < n - 1 ? PIECE_BYTES : size - (n - 1) * PIECE_BYTES;
  if (bytes.length !== want) return null;
  return { h: { id, i, n, size, name: name.replace(/[\u0000-\u001f\u007f]/g, ""), type, ...(by ? { by } : {}) }, bytes };
}
