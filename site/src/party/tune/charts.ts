import { toSimplified } from "../../data/t2s";
import { cleanTitle, guessLang, type SongRow } from "../../shared/songs";

/**
 * Today's top songs on Apple's iTunes charts, fetched by the phone itself: Taiwan and Hong Kong
 * for Chinese, pop in the US and Canada for English, then Korea, Japan, Vietnam and a few more
 * countries for the global hits. Apple turns away requests from servers but lets browsers in,
 * and these lists carry each song's 30-second preview. The room checks every row before it
 * plays one. Same filters as scripts/build_songs.py.
 */

/** store, which language its songs count as (-1: tell from the title), genre filter */
const FEEDS: [store: string, lang: number, genre: string][] = [
  ["tw", 0, ""],
  ["hk", 0, ""],
  ["us", 1, "/genre=14"],
  ["ca", 1, "/genre=14"],
  ["gb", 1, ""],
  ["kr", -1, ""],
  ["jp", -1, ""],
  ["vn", -1, ""],
  ["au", 1, ""],
  ["br", -1, ""],
  ["mx", -1, ""],
  ["de", -1, ""],
  ["fr", -1, ""],
  ["in", -1, ""],
];
const SKIP =
  /(?<![a-z])live(?![a-z])|現場|现场|演唱會|演唱会|金曲|\bin [a-g][b#]? (major|minor)\b|remix|\bmix\)|instrumental|伴奏|伴唱|純音樂|纯音乐|演奏|karaoke|\bdemo\b|acoustic|\bversion\)|\bver\.|medley|reprise|\bintro\b|\boutro\b|interlude|commentary|鋼琴版|钢琴版|\bedit\)|sped up|slowed|orchestral|unplugged|a cappella|cover\)/i;
const LIVE_ALBUM = /(?<![a-z])live(?![a-z])|演唱會|演唱会/i;
const CJK = /[㐀-鿿]/;
const OTHER = /[가-힯぀-ヿ]/;
const CJK_LANGS = [0, 2];
const PRE = "https://audio-ssl.itunes.apple.com/itunes-assets/";
const SUF = ".plus.aac.p.m4a";
const ART = /^https:\/\/is(\d)-ssl\.mzstatic\.com\/image\/thumb\/(.+)\/\d+x\d+bb\.(jpg|png)$/;
const KEY = "tune-charts-v2";
const KEEP_MS = 6 * 3600_000;
/** a room message stays under 32 KB: a few dozen songs of each language */
export const CHARTS_EACH = 16;

type Label = { label?: string; attributes?: Record<string, string> };
type Entry = {
  "im:name"?: Label;
  "im:artist"?: Label;
  "im:releaseDate"?: Label;
  "im:image"?: Label[];
  "im:collection"?: { "im:name"?: Label };
  id?: Label;
  link?: Label | Label[];
};

export function rowFromEntry(e: Entry, feedLang: number, store: string): SongRow | null {
  const name = e["im:name"]?.label ?? "";
  const artist = e["im:artist"]?.label ?? "";
  const id = Number(e.id?.attributes?.["im:id"]);
  const links = Array.isArray(e.link) ? e.link : e.link ? [e.link] : [];
  const url = links.find((l) => l.attributes?.["im:assetType"] === "preview")?.attributes?.href ?? "";
  if (!Number.isSafeInteger(id) || id <= 0 || !name || !artist || !url.startsWith(PRE)) return null;
  if (SKIP.test(name) || LIVE_ALBUM.test(e["im:collection"]?.["im:name"]?.label ?? "")) return null;
  const lang = feedLang >= 0 ? feedLang : guessLang(name, artist, store);
  // a feed that counts as one language only keeps songs that look like it
  if (feedLang === 0 && (!CJK.test(name) || OTHER.test(name))) return null;
  if (feedLang === 1 && (CJK.test(name) || OTHER.test(name) || CJK.test(artist))) return null;
  const p = url.endsWith(SUF) ? url.slice(PRE.length, -SUF.length) : url;
  const m = ART.exec((e["im:image"] ?? []).map((x) => x.label ?? "").pop() ?? "");
  const cjk = CJK_LANGS.includes(lang);
  const title = cleanTitle(cjk ? toSimplified(name) : name, lang);
  const a = cjk ? toSimplified(artist) : artist;
  // a song named after its singer gives the answer away
  if (title.toLowerCase() === a.toLowerCase()) return null;
  return [id, title.slice(0, 120), a.slice(0, 120), "", lang, Number((e["im:releaseDate"]?.label ?? "").slice(0, 4)) || 0, p, m ? `${m[1]}|${m[2]}` : "", store, 1, 0, 0];
}

async function feed(store: string, lang: number, genre: string, signal: AbortSignal): Promise<SongRow[]> {
  const r = await fetch(`https://itunes.apple.com/${store}/rss/topsongs/limit=100${genre}/json`, { signal });
  if (!r.ok) return [];
  const d = (await r.json()) as { feed?: { entry?: Entry | Entry[] } };
  const entries = d.feed?.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return list.map((e) => rowFromEntry(e, lang, store)).filter((x): x is SongRow => !!x);
}

let pending: Promise<SongRow[]> | null = null;

/** Today's chart songs; kept in this browser for six hours. Never fails: no charts just means the built-in list. */
export function loadCharts(ms = 5000): Promise<SongRow[]> {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at: number; rows: SongRow[] } | null;
    if (kept && Date.now() - kept.at < KEEP_MS && Array.isArray(kept.rows) && kept.rows.length) return Promise.resolve(kept.rows);
  } catch {
    /* no storage here: fetch */
  }
  pending ??= (async () => {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), ms);
    try {
      const lists = await Promise.all(FEEDS.map(([store, lang, genre]) => feed(store, lang, genre, ctl.signal).catch(() => [] as SongRow[])));
      const seen = new Set<number>();
      const rows = lists.flat().filter((r) => !seen.has(r[0]) && !!seen.add(r[0]));
      if (rows.length)
        try {
          localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rows }));
        } catch {
          /* full or blocked: fine */
        }
      return rows;
    } finally {
      window.clearTimeout(timer);
      pending = null;
    }
  })();
  return pending;
}

/** What the host's phone hands the room with the first song: a random few of each language. */
export function chartsForRoom(rows: SongRow[]): SongRow[] {
  const langs = [...new Set(rows.map((r) => r[4]))];
  const pick = (l: number) =>
    rows
      .filter((r) => r[4] === l)
      .map((r) => ({ r, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, CHARTS_EACH)
      .map((x) => x.r);
  return langs.flatMap(pick);
}
