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

/* ------------------------------------------------------------------ a song's tempo, for the floor */

// what a video's title says that isn't the song (an official video, its lyrics, its quality)
const NOISE =
  /\b(official|music|video|audio|lyrics?|lyric video|visuali[sz]er|m\/?v|hd|hq|4k|8k|remaster(ed)?|explicit|clean|full|version|live)\b|官方|完整版|高音质|高音質|动态歌词|動態歌詞|歌词|歌詞|中字|中英字幕|字幕|伴奏/gi;
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * What to look a video's song up by (Steve on Nov 12: "机器人没有跟着音乐一起跳": the robots dance to
 * the song's own tempo): its title less what isn't the song, brackets opened up (a Chinese title's
 * song is often in 【】), and its channel in front when the title doesn't say who sings it (no
 * "Artist - Title"), less what YouTube adds to a channel's name.
 */
export function songQuery(title: string, channel: string): string {
  const t = unescape(title)
    .replace(/[([【「『〖[](?:[^)\]】」』〗]*?)(official|video|audio|lyrics?|visuali[sz]er|m\/?v|hd|4k|官方|歌词|歌詞|字幕)[^)\]】」』〗]*[)\]】」』〗]/gi, " ")
    .replace(/[()[\]【】「」『』〖〗|｜/／]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const who = unescape(channel)
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\b(official|music|records?|tv|channel)\b|官方频道|官方頻道|官方/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const named = /\s[-–—~]\s/.test(t) || !who || norm(t).includes(norm(who));
  return (named ? t : `${who} ${t}`).slice(0, 100).trim();
}

/**
 * A catalogue's answer to that (Deezer's search: `{ data: [{ id, title, title_short, artist: { name } }] }`):
 * the track that's the video's song, its name in the video's title: its whole name before its short
 * one (a remix of it isn't it), by the singer the video names (its title or channel) before anyone
 * else's. None that is: null (better no tempo than a wrong one).
 */
export function trackOf(data: unknown, title: string, channel = ""): number | null {
  const hits = (data as { data?: unknown[] })?.data;
  if (!Array.isArray(hits)) return null;
  const want = norm(unescape(title));
  const by = norm(unescape(`${title} ${channel}`));
  type Hit = { id: number; title?: unknown; title_short?: unknown; artist?: { name?: unknown } };
  const list = hits.slice(0, 8).filter((h): h is Hit => typeof (h as Hit)?.id === "number");
  const named = (n: unknown, bare = false) => {
    const k = typeof n === "string" ? norm(bare ? n.replace(/\([^)]*\)|\[[^\]]*\]/g, " ") : n) : "";
    return k.length >= 2 && want.includes(k);
  };
  const theirs = (x: Hit) => {
    const a = typeof x.artist?.name === "string" ? norm(x.artist.name) : "";
    return a.length >= 2 && by.includes(a);
  };
  const tries: ((x: Hit) => boolean)[] = [(x) => named(x.title) && theirs(x), (x) => named(x.title), (x) => named(x.title_short, true) && theirs(x), (x) => named(x.title_short, true)];
  for (const t of tries) {
    const x = list.find(t);
    if (x) return x.id;
  }
  return null;
}

/** A tempo the floor dances to: a song's, folded into 70 to 140 BPM (a fast one danced at half time). */
export function danceBpm(bpm: number): number {
  if (!(bpm > 0) || !Number.isFinite(bpm)) return 120;
  let b = bpm;
  while (b > 140) b /= 2;
  while (b < 70) b *= 2;
  return Math.round(b * 10) / 10;
}
