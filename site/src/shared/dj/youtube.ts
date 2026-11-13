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

// a bracket of a title that's only what isn't the song ([Official Video], (Lyrics), 【MV】)
const NOISE_GROUP = /[([【「『〖《[](?:[^)\]】」』〗》]*?)(official|video|audio|lyrics?|visuali[sz]er|m\/?v|hd|4k|官方|歌词|歌詞|字幕)[^)\]】」』〗》]*[)\]】」』〗》]/gi;
// the scripts a Chinese, Japanese or Korean name is written in
const CJK = "\\p{Script=Han}\\p{Script=Hangul}\\p{Script=Hiragana}\\p{Script=Katakana}";

/** A part of a title less what isn't the song: its noise (M/V before its slash goes), its brackets and
 *  quotes opened up, the dashes at its ends. */
function bare(s: string): string {
  return s
    .replace(NOISE_GROUP, " ")
    .replace(NOISE, " ")
    .replace(/[()[\]【】「」『』〖〗《》|｜/／‘’“”"]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—~_:：,，]+|[\s\-–—~_:：,，]+$/g, "")
    .trim();
}

/** A channel's name less what YouTube adds to it (- Topic, VEVO, Official). */
function channelName(channel: string): string {
  return unescape(channel)
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\b(official|music|records?|tv|channel)\b|官方频道|官方頻道|官方/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What to look a video's song up by (Steve on Nov 12: "机器人没有跟着音乐一起跳": the robots dance to
 * the song's own tempo): its title less what isn't the song, brackets opened up (a Chinese title's
 * song is often in 【】 or 《》), and its channel in front when the title doesn't say who sings it (no
 * "Artist - Title"), less what YouTube adds to a channel's name.
 */
export function songQuery(title: string, channel: string): string {
  const t = bare(unescape(title));
  const who = channelName(channel);
  const named = /\s[-–—~]\s/.test(t) || !who || norm(t).includes(norm(who));
  return (named ? t : `${who} ${t}`).slice(0, 100).trim();
}

/** Who sings a video's song and what it's called: a Chinese, Japanese or Korean title's 【】《》「」 hold
 *  the song (who sings it before them, else the channel), else "Artist - Title", else the channel and
 *  the title. */
function songParts(title: string, channel: string): { who: string; song: string } {
  const t = unescape(title).replace(NOISE_GROUP, " ");
  const who = channelName(channel);
  for (const m of t.matchAll(/[【《「『〖]([^】》」』〗]*)[】》」』〗]/g)) {
    const song = bare(m[1]);
    if (norm(song)) return { who: bare(t.slice(0, m.index ?? 0)) || who, song };
  }
  const d = t.match(/^(.*?\S)\s+[-–—~_]\s+(.+)$/);
  if (d && norm(bare(d[1])) && norm(bare(d[2]))) return { who: bare(d[1]), song: bare(d[2]) };
  return { who, song: bare(t) };
}

/** A name written twice, in two scripts ("周杰倫 Jay Chou", "晴天 Sunny Day"): its Chinese, Japanese or
 *  Korean name, then the other; one name: that one. */
function names(s: string): string[] {
  const own = (s.match(new RegExp(`[${CJK}][${CJK}\\s·・]*`, "u"))?.[0] ?? "").trim();
  const other = s.replace(new RegExp(`[${CJK}·・]+`, "gu"), " ").replace(/\s+/g, " ").trim();
  return [own, other].filter((x) => norm(x).length > 0);
}

/**
 * The ways to look a video's song up, best first, at most three: `songQuery`, then the singer and the
 * song by one name each (the catalogue names a Chinese singer in Latin letters, "Jay Chou", and the
 * song as it's sung, "晴天"; a title giving both doesn't match it), then the singer's other name or
 * the song's.
 */
export function songQueries(title: string, channel: string): string[] {
  const out: string[] = [];
  const add = (q: string) => {
    const k = q.slice(0, 100).trim();
    if (norm(k).length >= 2 && !out.some((o) => norm(o) === norm(k))) out.push(k);
  };
  add(songQuery(title, channel));
  const { who, song } = songParts(title, channel);
  const [w1, w2] = names(who).reverse();
  const [s1, s2] = names(song);
  if (s1) {
    add(w1 ? `${w1} ${s1}` : s1);
    if (w2) add(`${w2} ${s1}`);
    else if (s2) add(w1 ? `${w1} ${s2}` : s2);
  }
  return out.slice(0, 3);
}

/**
 * A catalogue's answer to that (Deezer's search: `{ data: [{ id, title, title_short, artist: { name } }] }`):
 * the tracks that could be the video's song, its name in the video's title, best first: by the singer
 * the video names (its title or channel), its whole name before its short one (a remix of it isn't
 * it), then anyone's of that name (`theirs` false: a cover, or another song called that). None:
 * empty (better no tempo than a wrong one).
 */
export function tracksOf(data: unknown, title: string, channel = ""): { id: number; theirs: boolean }[] {
  const hits = (data as { data?: unknown[] })?.data;
  if (!Array.isArray(hits)) return [];
  const want = norm(unescape(title));
  const by = norm(unescape(`${title} ${channel}`));
  type Hit = { id: number; title?: unknown; title_short?: unknown; artist?: { name?: unknown } };
  const list = hits.slice(0, 8).filter((h): h is Hit => typeof (h as Hit)?.id === "number");
  const named = (n: unknown, short = false) => {
    const k = typeof n === "string" ? norm(short ? n.replace(/\([^)]*\)|\[[^\]]*\]/g, " ") : n) : "";
    return k.length >= 2 && want.includes(k);
  };
  const theirs = (x: Hit) => {
    const a = typeof x.artist?.name === "string" ? norm(x.artist.name) : "";
    return a.length >= 2 && by.includes(a);
  };
  const tries: [(x: Hit) => boolean, boolean][] = [
    [(x) => named(x.title) && theirs(x), true],
    [(x) => named(x.title_short, true) && theirs(x), true],
    [(x) => named(x.title), false],
    [(x) => named(x.title_short, true), false],
  ];
  const out: { id: number; theirs: boolean }[] = [];
  for (const [t, mine] of tries) for (const x of list) if (t(x) && !out.some((o) => o.id === x.id)) out.push({ id: x.id, theirs: mine });
  return out;
}

/** The best of those, or null. */
export function trackOf(data: unknown, title: string, channel = ""): number | null {
  return tracksOf(data, title, channel)[0]?.id ?? null;
}

/** A tempo the floor dances to: a song's, folded into 70 to 140 BPM (a fast one danced at half time). */
export function danceBpm(bpm: number): number {
  if (!(bpm > 0) || !Number.isFinite(bpm)) return 120;
  let b = bpm;
  while (b > 140) b /= 2;
  while (b < 70) b *= 2;
  return Math.round(b * 10) / 10;
}
