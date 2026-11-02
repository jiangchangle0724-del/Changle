/**
 * 打碟 · DJ Booth, your songs: the host's song files, read on the big screen's computer (nothing is
 * uploaded). Each is decoded once to listen for its beat (beats.ts) and named from its tags (an MP3's
 * ID3, an M4A's iTunes tags) or, without them, from its file name ("Artist - Title.mp3").
 */
import { CRATE_MAX } from "../../../shared/dj/types";
import { analyzeSong } from "./beats";
import type { LocalSong } from "./LocalDj";

export { CRATE_MAX };

/** The sound files a browser can usually play, by their ending. */
export const SONG_FILES = /\.(mp3|m4a|aac|mp4|wav|wave|aif|aiff|flac|ogg|oga|opus|webm)$/i;
/** how long a song may be */
export const SONG_MIN_S = 45;
export const SONG_MAX_S = 15 * 60;
/** the sample rate songs are listened to at (the beat needs no more) */
const LISTEN_RATE = 22050;

/** A file's id on the night's list: the same file (name, size, date) is the same song. */
export function songId(f: { name: string; size: number; lastModified: number }): string {
  let h = 2166136261;
  for (const ch of `${f.name}|${f.size}|${f.lastModified}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return `s${(h >>> 0).toString(36)}`;
}

/** Why a file wasn't added. */
export type NotAdded = "kind" | "short" | "long" | "unreadable";

/** A file's title and artist, from its name: "01 Artist - Title.mp3" → Artist, Title. */
export function nameOfFile(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const bare = base.replace(/^\d{1,3}(\s*[-._)]\s*|\s+)/, "").trim() || base;
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(bare);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: bare, artist: "" };
}

/* ------------------------------------------------------------------ tags */

const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

/** An ID3v2 text frame's text (its first byte says how it's written). */
function id3Text(b: Uint8Array): string {
  const enc = b[0];
  const body = b.subarray(1);
  let s: string;
  if (enc === 0) s = latin1(body);
  else if (enc === 3) s = new TextDecoder("utf-8").decode(body);
  else if (enc === 1) {
    // UTF-16 with its byte-order mark
    const le = body[0] === 0xff && body[1] === 0xfe;
    s = new TextDecoder(le ? "utf-16le" : "utf-16be").decode(body.subarray(body[0] === 0xff || body[0] === 0xfe ? 2 : 0));
  } else s = new TextDecoder("utf-16be").decode(body);
  return s.replace(/\0+$/, "").split("\0")[0].trim();
}

/** An MP3's ID3v2 title and artist. */
function id3(b: Uint8Array): { title?: string; artist?: string } {
  if (b.length < 10 || latin1(b.subarray(0, 3)) !== "ID3") return {};
  const ver = b[3];
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  const out: { title?: string; artist?: string } = {};
  let p = 10;
  if (b[5] & 0x40) p += ver === 4 ? ((b[10] & 0x7f) << 21) | ((b[11] & 0x7f) << 14) | ((b[12] & 0x7f) << 7) | (b[13] & 0x7f) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4;
  const end = Math.min(b.length, 10 + size);
  while (p + 10 <= end) {
    const id = latin1(b.subarray(p, p + 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const n = ver === 4 ? ((b[p + 4] & 0x7f) << 21) | ((b[p + 5] & 0x7f) << 14) | ((b[p + 6] & 0x7f) << 7) | (b[p + 7] & 0x7f) : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7];
    if (n <= 0 || p + 10 + n > end) break;
    const body = b.subarray(p + 10, p + 10 + n);
    if (id === "TIT2") out.title = id3Text(body);
    else if (id === "TPE1") out.artist = id3Text(body);
    p += 10 + n;
  }
  return out;
}

/** An M4A's iTunes title and artist (moov › udta › meta › ilst › ©nam, ©ART). */
function mp4(b: Uint8Array): { title?: string; artist?: string } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: { title?: string; artist?: string } = {};
  const walk = (from: number, to: number, depth: number) => {
    let p = from;
    while (p + 8 <= to && depth < 8) {
      let size = dv.getUint32(p);
      const type = latin1(b.subarray(p + 4, p + 8));
      let head = 8;
      if (size === 1 && p + 16 <= to) {
        size = Number(dv.getBigUint64(p + 8));
        head = 16;
      } else if (size === 0) size = to - p;
      if (size < head || p + size > to) return;
      if (type === "moov" || type === "udta" || type === "ilst") walk(p + head, p + size, depth + 1);
      else if (type === "meta") walk(p + head + 4, p + size, depth + 1);
      else if (type === "©nam" || type === "©ART") {
        // its 'data' atom: 8 bytes of header, 8 of type and locale, then the text
        const d = p + head;
        if (d + 16 <= p + size && latin1(b.subarray(d + 4, d + 8)) === "data") {
          const text = new TextDecoder("utf-8").decode(b.subarray(d + 16, p + size)).trim();
          if (type === "©nam") out.title = text;
          else out.artist = text;
        }
      }
      p += size;
    }
  };
  walk(0, b.length, 0);
  return out;
}

/** A song file's title and artist: its tags, else its name. */
export function tagsOf(bytes: Uint8Array, fileName: string): { title: string; artist: string } {
  let t: { title?: string; artist?: string } = {};
  try {
    t = latin1(bytes.subarray(0, 3)) === "ID3" ? id3(bytes) : latin1(bytes.subarray(4, 8)) === "ftyp" ? mp4(bytes) : {};
  } catch {
    t = {};
  }
  const byName = nameOfFile(fileName);
  return { title: (t.title || byName.title).slice(0, 40), artist: (t.artist || (t.title ? "" : byName.artist)).slice(0, 30) };
}

/* ------------------------------------------------------------------ reading a file */

/** One of the host's files, named and listened to; or why not. */
export async function readSong(file: File, id: string): Promise<LocalSong | NotAdded> {
  if (!SONG_FILES.test(file.name) && !file.type.startsWith("audio/")) return "kind";
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return "unreadable";
  }
  const names = tagsOf(new Uint8Array(bytes), file.name);
  let mono: Float32Array;
  let seconds: number;
  try {
    const ctx = new OfflineAudioContext(1, 1, LISTEN_RATE);
    // (the bytes are handed over: the names are read first)
    const buf = await ctx.decodeAudioData(bytes);
    seconds = buf.duration;
    if (seconds < SONG_MIN_S) return "short";
    if (seconds > SONG_MAX_S) return "long";
    mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
    }
  } catch {
    return "unreadable";
  }
  const beat = analyzeSong(mono, LISTEN_RATE);
  if (!beat) return "short";
  return { id, title: names.title, artist: names.artist, file, beat, seconds };
}
