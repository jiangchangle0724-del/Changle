/**
 * 打碟 · DJ Booth on a phone: finding a song on YouTube, through the rooms server (worker/youtube.ts):
 * a pasted link's title (no key needed), or a search (only once the owner has set YouTube's key, and
 * within the key's daily allowance).
 */
import { ROOMS_URL } from "../../../online/config";
import type { YtHit } from "../../../shared/dj/youtube";

const base = () => ROOMS_URL.replace(/^ws/, "http");

/** A video's title and channel, or null for a real missing video. Network failures reject. */
export async function ytInfo(id: string): Promise<YtHit | null> {
  const r = await fetch(`${base()}/api/yt/info?id=${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("YouTube info unavailable");
  const d = (await r.json()) as YtHit;
  return d && d.id === id && d.t ? d : null;
}

/**
 * Up to six videos for some words; "nokey" until the owner sets YouTube's key; "quota" once the
 * key's searches for the day are used up; [] only for a successful, empty search.
 */
export async function ytSearch(q: string): Promise<YtHit[] | "nokey" | "quota"> {
  const r = await fetch(`${base()}/api/yt/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("YouTube search unavailable");
  const d = (await r.json()) as { hits?: YtHit[]; nokey?: boolean; quota?: boolean };
  if (d.nokey) return "nokey";
  if (d.quota) return "quota";
  return Array.isArray(d.hits) ? d.hits : [];
}

const tempos = new Map<string, Promise<number | null>>();

/**
 * The tempo of a video's song, for the big screen's dancers (worker/youtube.ts looks it up by its
 * title), or null; asked once a page. Never rejects.
 */
export function ytBpm(id: string): Promise<number | null> {
  let p = tempos.get(id);
  if (!p) {
    p = fetch(`${base()}/api/yt/bpm?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ bpm?: unknown }>) : null))
      .then((d) => (d && typeof d.bpm === "number" && d.bpm > 0 ? d.bpm : null))
      .catch(() => {
        tempos.delete(id);
        return null;
      });
    tempos.set(id, p);
  }
  return p;
}
