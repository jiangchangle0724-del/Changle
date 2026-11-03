/**
 * 打碟 · DJ Booth: YouTube's links and search answers, read the same way by the phones and the rooms
 * server (worker/youtube.ts). Whole songs play on the big screen in YouTube's own player, never
 * downloaded (Steve on Nov 2; his plan's 观众点歌).
 */
export type YtHit = { id: string; t: string; a: string };

/** A YouTube video id: 11 of letters, digits, - and _. */
export const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id in a YouTube link (watch, youtu.be, shorts, embed, music.youtube.com), or null. */
export function ytIdOf(text: string): string | null {
  const s = text.trim();
  if (YT_ID.test(s)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

/** YouTube's titles come with HTML's escapes (&amp;, &#39;, &quot;). */
export function unescape(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? unescape(s).replace(/\s+/g, " ").trim().slice(0, n) : "");

/** A search answer as hits: embeddable videos with a title. */
export function hitsOf(data: unknown): YtHit[] {
  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  const out: YtHit[] = [];
  for (const it of items) {
    const x = it as { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown } };
    const id = x.id?.videoId;
    const t = clip(x.snippet?.title, 120);
    if (typeof id !== "string" || !YT_ID.test(id) || !t) continue;
    out.push({ id, t, a: clip(x.snippet?.channelTitle, 80) });
  }
  return out;
}
