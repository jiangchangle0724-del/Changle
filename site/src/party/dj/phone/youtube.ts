/**
 * 打碟 · DJ Booth on a phone: finding a song on YouTube, through the rooms server (worker/youtube.ts):
 * a pasted link's title (no key needed), or a search (only once the owner has set YouTube's key, and
 * within the key's daily allowance).
 */
import { ROOMS_URL } from "../../../online/config";
import type { YtHit } from "../../../shared/dj/youtube";

const base = () => ROOMS_URL.replace(/^ws/, "http");

/** A video's title and channel by its id, or null (private, removed, not embeddable, or offline). */
export async function ytInfo(id: string): Promise<YtHit | null> {
  try {
    const r = await fetch(`${base()}/api/yt/info?id=${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const d = (await r.json()) as YtHit;
    return d && d.id === id && d.t ? d : null;
  } catch {
    return null;
  }
}

/**
 * Up to six videos for some words; "nokey" until the owner sets YouTube's key; "quota" once the
 * key's searches for the day are used up; [] when nothing (or offline).
 */
export async function ytSearch(q: string): Promise<YtHit[] | "nokey" | "quota"> {
  try {
    const r = await fetch(`${base()}/api/yt/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const d = (await r.json()) as { hits?: YtHit[]; nokey?: boolean; quota?: boolean };
    if (d.nokey) return "nokey";
    if (d.quota) return "quota";
    return Array.isArray(d.hits) ? d.hits : [];
  } catch {
    return [];
  }
}
