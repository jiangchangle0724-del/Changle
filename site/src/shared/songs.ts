/**
 * Real songs for Name That Tune: the shape of a song, where its preview and cover live, and how
 * the game picks one. The song list itself (src/data/songs.ts) is big, so screens never import it:
 * the server sends each phone what it needs, and the one-phone game loads the list on demand.
 */

/**
 * [Apple track id, title, artist, artist in English ("" = same), language, year, preview, artwork,
 *  storefront, chart, categories, singer]
 * language: see LANGS (0 Chinese, 1 English, 2 Cantonese, 3 Korean, 4 Japanese, 5 Vietnamese, 6 world classics).
 * categories: a bit set, see CATS. singer: 0 unknown, 1 man, 2 woman, 3 mixed group.
 * Rows from before the list grew have ten fields: they read as pop, singer unknown.
 */
export type SongRow =
  | [number, string, string, string, number, number, string, string, string, 0 | 1]
  | [number, string, string, string, number, number, string, string, string, 0 | 1, number, number];

export type Song = {
  id: number;
  /** title as shown (Chinese songs in Simplified) */
  t: string;
  /** artist, and the artist's English name */
  a: string;
  ae: string;
  /** language, an index into LANGS */
  l: number;
  y: number;
  /** preview: a path on Apple's preview server, or a full URL */
  p: string;
  /** cover: "n|path" on Apple's image server */
  art: string;
  /** Apple Music storefront the song came from */
  s: string;
  /** on a most-played chart */
  c: 0 | 1;
  /** categories, a bit set over CATS */
  k: number;
  /** who sings it: 0 unknown, 1 a man, 2 a woman, 3 a mixed group */
  g: number;
};

/* ---------- languages and categories ---------- */

export type LangKey = "zh" | "en" | "yue" | "ko" | "ja" | "vi" | "world" | "other";
export const LANGS: { key: LangKey; zh: string; en: string }[] = [
  { key: "zh", zh: "华语", en: "Chinese" },
  { key: "en", zh: "英文", en: "English" },
  { key: "yue", zh: "粤语", en: "Cantonese" },
  { key: "ko", zh: "韩语", en: "Korean" },
  { key: "ja", zh: "日语", en: "Japanese" },
  { key: "vi", zh: "越南语", en: "Vietnamese" },
  { key: "world", zh: "世界名曲", en: "World classics" },
  /** chart songs in other languages: only in the charts and "anything" pools */
  { key: "other", zh: "其他", en: "Other" },
];
export const LANG_INDEX: Record<LangKey, number> = { zh: 0, en: 1, yue: 2, ko: 3, ja: 4, vi: 5, world: 6, other: 7 };

export type CatKey = "oldies" | "pop" | "rock" | "folk" | "rap" | "dance" | "rnb" | "ost";
export const CATS: { key: CatKey; bit: number; zh: string; en: string }[] = [
  { key: "oldies", bit: 1, zh: "老歌", en: "Oldies" },
  { key: "pop", bit: 2, zh: "流行", en: "Pop" },
  { key: "rock", bit: 4, zh: "摇滚", en: "Rock" },
  { key: "folk", bit: 8, zh: "民谣", en: "Folk" },
  { key: "rap", bit: 16, zh: "说唱", en: "Hip-hop" },
  { key: "dance", bit: 32, zh: "电子舞曲", en: "Dance" },
  { key: "rnb", bit: 64, zh: "R&B", en: "R&B" },
  { key: "ost", bit: 128, zh: "影视金曲", en: "Film & TV" },
];
export const CAT_BIT: Record<CatKey, number> = { oldies: 1, pop: 2, rock: 4, folk: 8, rap: 16, dance: 32, rnb: 64, ost: 128 };
/** world classics carry this instead of a category */
export const CLASSIC_BIT = 256;
/** "old" by year alone, when a song carries no categories (rows from the first list) */
export const OLD_BEFORE: Record<number, number> = { 0: 2003, 1: 2000, 2: 2003, 3: 2006, 4: 2006, 5: 2009 };

/**
 * What the table listens to: one or more sources (languages, the world classics, today's charts
 * everywhere) and one or more categories, or any. Written with "+" between the picks:
 * "zh+yue:oldies+rock", "en:any", "global:any". The first list's words still read: "mix" is
 * Chinese and English, "all" is every source.
 */
export type SourceKey = Exclude<LangKey, "other"> | "global";
export type SongPool = string;
export const SOURCES: { key: SourceKey; zh: string; en: string; cats: boolean }[] = [
  { key: "zh", zh: "华语", en: "Chinese", cats: true },
  { key: "en", zh: "英文", en: "English", cats: true },
  { key: "yue", zh: "粤语", en: "Cantonese", cats: true },
  { key: "ko", zh: "韩语", en: "Korean", cats: true },
  { key: "ja", zh: "日语", en: "Japanese", cats: true },
  { key: "vi", zh: "越南语", en: "Vietnamese", cats: true },
  { key: "world", zh: "世界名曲", en: "World classics", cats: false },
  { key: "global", zh: "全球热曲", en: "Global hits", cats: false },
];
export const DEFAULT_POOL: SongPool = "zh+en:any";
export type ParsedPool = { srcs: SourceKey[]; cats: CatKey[] };

const parsed = new Map<string, ParsedPool | null>();
export function parsePool(p: unknown): ParsedPool | null {
  if (typeof p !== "string" || p.length > 160) return null;
  const hit = parsed.get(p);
  if (hit !== undefined) return hit;
  const out = parseOnce(p);
  if (parsed.size > 200) parsed.clear();
  parsed.set(p, out);
  return out;
}
function parseOnce(p: string): ParsedPool | null {
  const parts = p.split(":");
  if (parts.length !== 2) return null;
  const want = new Set<string>();
  for (const w of parts[0].split("+")) {
    if (w === "mix") ["zh", "en"].forEach((x) => want.add(x));
    else if (w === "all") SOURCES.forEach((x) => want.add(x.key));
    else if (SOURCES.some((x) => x.key === w)) want.add(w);
    else return null;
  }
  const srcs = SOURCES.filter((x) => want.has(x.key)).map((x) => x.key);
  if (!srcs.length) return null;
  const cw = new Set<string>();
  if (parts[1] !== "any") {
    for (const c of parts[1].split("+")) {
      if (!CATS.some((x) => x.key === c)) return null;
      cw.add(c);
    }
  }
  const cats = srcs.some((k) => SOURCES.find((x) => x.key === k)!.cats) ? CATS.filter((c) => cw.has(c.key)).map((c) => c.key) : [];
  return { srcs, cats };
}
export const isPool = (p: unknown): p is SongPool => parsePool(p) !== null;
/** The one way to write a pool, whatever order the picks came in. */
export function poolOf(srcs: readonly string[], cats: readonly string[]): SongPool {
  const s = SOURCES.filter((x) => srcs.includes(x.key)).map((x) => x.key);
  const c = CATS.filter((x) => cats.includes(x.key)).map((x) => x.key);
  return `${s.length ? s.join("+") : "zh+en"}:${c.length ? c.join("+") : "any"}`;
}
export function samePool(a: unknown) {
  const p = parsePool(a);
  return p ? poolOf(p.srcs, p.cats) : null;
}

/** Which language a chart song is in, from its title and singer (Apple's charts don't say). */
export function guessLang(title: string, artist: string, store: string): number {
  const s = title + " " + artist;
  if (/[぀-ヿ]/.test(s)) return 4;
  if (/[가-힯]/.test(s)) return 3;
  if (/[ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(s)) return 5;
  if (/[㐀-鿿]/.test(title)) return store === "hk" ? 2 : 0;
  if (["us", "gb", "ca", "au", "nz", "ie"].includes(store)) return 1;
  // elsewhere, plain ASCII titles are most likely English; accents and other letters are not
  return /^[\x20-\x7e’“”…]+$/.test(s) ? 1 : 7;
}

export const isOld = (s: Song) => (s.k ? (s.k & CAT_BIT.oldies) !== 0 : s.y > 0 && s.y < (OLD_BEFORE[s.l] ?? 2003));

/** Does a song belong to a category? Songs from the first list count as pop (and as old by their year). */
export function inCat(s: Song, cat: CatKey | "any"): boolean {
  if (cat === "any") return true;
  if (cat === "oldies") return isOld(s);
  if (!s.k) return cat === "pop" && s.l !== 6;
  return (s.k & CAT_BIT[cat]) !== 0;
}

/** A song is in a pool when it's on today's charts and the charts are picked, or when its language
 *  is picked and it belongs to any picked category (the world classics have none: always in). */
export function inPool(s: Song, pool: SongPool): boolean {
  const p = parsePool(pool);
  if (!p) return false;
  if (s.c === 1 && p.srcs.includes("global")) return true;
  const key = LANGS[s.l]?.key;
  if (!key || key === "other" || !p.srcs.includes(key)) return false;
  if (s.l === 6 || !p.cats.length) return true;
  return p.cats.some((c) => inCat(s, c));
}

/**
 * How a song feels, from its title, categories and language, for the stage: sad songs bring tears,
 * love songs blushes and hearts, party songs the big moves, rock a headbang, hip-hop and R&B a
 * groove, the world classics something graceful. "" when nothing says (the music itself decides).
 */
export type MoodHint = "sad" | "love" | "hype" | "rock" | "groove" | "classic" | "";
const SAD = /泪|淚|哭|伤心|傷心|心痛|心碎|分手|离开|離開|再见|再見|孤单|孤單|寂寞|后悔|後悔|遗憾|遺憾|难过|難過|告别|告別|失恋|失戀|离别|離別|悲|愁|放手|回不去|不爱|不愛|涙|泣|さよなら|サヨナラ|悲し|눈물|이별|슬픔|nước mắt|buồn|chia tay|cô đơn|khóc|\b(cry|crying|tears?|sad|lonely|alone|goodbye|good ?bye|miss you|hurt|broken|sorry|someone like you|without you|let (her|him|you) go|say something|fix you|apologi[sz]e|heartbreak|heartless|stay with me|all i ask|when we were young)\b/i;
const LOVE = /爱|愛|喜欢|喜歡|恋|戀|心动|心動|亲爱|親愛|甜蜜|告白|情歌|月亮代表|小幸运|好き|愛して|恋|사랑|yêu|thương|\b(love|lover|kiss|baby|darling|honey|sweet|heart|perfect|marry|beautiful|you are|with you|my girl|my boy)\b/i;
const HYPE = /派对|嗨|燃|炸|跳舞|蹦迪|\b(party|dance|dancing|jump|fire|boom|bang|crazy|wild|club|shake|hot|turn up|let'?s go|gangnam|dynamite|butter)\b/i;
export function moodOf(s: { t: string; k?: number; l?: number }): MoodHint {
  const k = s.k ?? 0;
  if (SAD.test(s.t)) return "sad";
  if (HYPE.test(s.t) || (k & CAT_BIT.dance) !== 0) return "hype";
  if (LOVE.test(s.t)) return "love";
  if (k & CAT_BIT.rock) return "rock";
  if (k & (CAT_BIT.rap | CAT_BIT.rnb)) return "groove";
  if (s.l === 6 || (k & CLASSIC_BIT) !== 0) return "classic";
  return "";
}

export const fromRow = (r: SongRow): Song => ({ id: r[0], t: r[1], a: r[2], ae: r[3] || r[2], l: r[4], y: r[5], p: r[6], art: r[7], s: r[8], c: r[9], k: r[10] ?? 0, g: r[11] ?? 0 });
export const toRow = (s: Song): SongRow => [s.id, s.t, s.a, s.ae === s.a ? "" : s.ae, s.l, s.y, s.p, s.art, s.s, s.c, s.k, s.g];

const PREVIEW = "https://audio-ssl.itunes.apple.com/itunes-assets/";

export function previewUrl(p: string) {
  return /^https:\/\//.test(p) ? p : `${PREVIEW}${p}.plus.aac.p.m4a`;
}

/**
 * A preview a phone sends (one it found on Apple), only if it can only be on Apple's preview
 * server: a plain path there (as the song list has them), or the full URL of one there.
 */
export function previewOk(p: unknown): p is string {
  if (typeof p !== "string" || p.length < 10 || p.length > 300) return false;
  const full = p.startsWith(PREVIEW);
  const path = full ? p.slice(PREVIEW.length) : p;
  if (path.includes("..") || path.includes("//") || !/^[A-Za-z][\w/.-]+$/.test(path)) return false;
  return !full || path.endsWith(".m4a");
}

export function artUrl(art: string, size = 300) {
  if (!art) return "";
  const bar = art.indexOf("|");
  const n = art.slice(0, bar);
  const path = art.slice(bar + 1);
  if (!/^\d$/.test(n) || !path) return "";
  return `https://is${n}-ssl.mzstatic.com/image/thumb/${path}/${size}x${size}bb.jpg`;
}

export function appleMusicUrl(id: number, store: string) {
  return `https://music.apple.com/${/^[a-z]{2}$/.test(store) ? store : "us"}/song/${id}`;
}

/** A song as a phone needs it once it is revealed. */
export type SongCard = { id: number; t: string; a: string; ae: string; art: string; url: string; y: number; g: number; l: number };
export const cardOf = (s: Song): SongCard => ({ id: s.id, t: s.t, a: s.a, ae: s.ae, art: artUrl(s.art), url: appleMusicUrl(s.id, s.s), y: s.y, g: s.g, l: s.l });

/** Accept a song row from outside (the charts service) only if every field looks right. */
export function checkRow(r: unknown): Song | null {
  if (!Array.isArray(r) || (r.length !== 10 && r.length !== 12)) return null;
  const [id, t, a, ae, l, y, p, art, s, c, k, g] = r as unknown[];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  if (typeof t !== "string" || !t || t.length > 120 || typeof a !== "string" || !a || a.length > 120) return null;
  if (typeof ae !== "string" || ae.length > 120 || typeof l !== "number" || !Number.isInteger(l) || l < 0 || l >= LANGS.length || typeof y !== "number") return null;
  if (typeof p !== "string" || !p || p.length > 300 || (/^https?:/.test(p) && !p.startsWith(PREVIEW))) return null;
  if (typeof art !== "string" || art.length > 300 || typeof s !== "string" || (c !== 0 && c !== 1)) return null;
  if (r.length === 12 && (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k > 1023 || typeof g !== "number" || ![0, 1, 2, 3].includes(g))) return null;
  return fromRow(r as SongRow);
}

/** The title as players know it: no "(theme song of ...)", "(feat. ...)", "(Remastered)" or " - subtitle" tails. Same rules as scripts/build_songs.py. */
export function cleanTitle(name: string, lang: number): string {
  let t = name;
  if (lang === 0 || lang === 2) {
    if (/主题曲|片尾曲|片头曲|插曲|推广曲|宣传曲|心动曲|陪伴曲|主题歌|原声/.test(t)) t = t.split(/\s*[(（《[【]/)[0] || t;
    for (let prev = ""; prev !== t; ) {
      prev = t;
      t = t.replace(/\s*[(（[【《][^(（[【《)）\]】》]*[)）\]】》]/g, "");
    }
  } else {
    t = t.replace(/(?<=\S)\s*[([][^)\]]*[)\]]/g, "");
  }
  t = t.replace(/\s+-\s+.*$/, "").trim();
  return t || name.trim();
}

/**
 * Pick the next song: never one played this game, preferably none anyone at the table has
 * heard lately. A pool with several languages lets them take turns at random, so a small
 * language is heard as often as a big one. Chart songs and newer ones come up a little more often.
 */
export function pickSong(all: Song[], pool: SongPool, avoid: Set<number>, played: Set<number>, rand: () => number, lang?: number): Song | null {
  const fit = all.filter((s) => inPool(s, pool));
  if (!fit.length) return null;
  const present = [...new Set(fit.map((s) => s.l))];
  const wantLang = lang !== undefined && present.includes(lang) ? lang : present[Math.floor(rand() * present.length)];
  const tiers = [
    fit.filter((s) => s.l === wantLang && !avoid.has(s.id) && !played.has(s.id)),
    fit.filter((s) => !avoid.has(s.id) && !played.has(s.id)),
    fit.filter((s) => s.l === wantLang && !played.has(s.id)),
    fit.filter((s) => !played.has(s.id)),
    fit,
  ];
  const list = tiers.find((x) => x.length) ?? [];
  if (!list.length) return null;
  const weight = (s: Song) => 1 + (s.c ? 1.2 : 0) + (s.y >= 2015 ? 0.4 : 0);
  let total = 0;
  for (const s of list) total += weight(s);
  let r = rand() * total;
  for (const s of list) {
    r -= weight(s);
    if (r <= 0) return s;
  }
  return list[list.length - 1];
}

/**
 * Who sings a song, one name each: "周杰伦 & 五月天 阿信" is 周杰伦 and 五月天 阿信, "JENNIE (from
 * BLACKPINK)" is JENNIE. Names are folded (case, spaces, the invisible characters some rows carry) so
 * the same singer written two ways is one.
 */
export function singersOf(artist: string): string[] {
  return artist
    .replace(/[\u2028\u2029\u200b\ufeff]/g, "")
    .replace(/\s*[(（](?:from|of)\s[^)）]*[)）]/gi, "")
    .split(/\s*(?:,|，|、|&|＆|\bfeat\.?|\bft\.|\s[x×]\s|\swith\s)\s*/i)
    .map((x) => x.toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const sharesSinger = (a: string, b: string) => {
  const mine = singersOf(a);
  return singersOf(b).some((x) => mine.includes(x));
};

/**
 * Three wrong answers that look like they could be right: same language, other artists, close in
 * time, and sung by the same kind of voice when that is known (the singer on stage gives that away).
 *
 * `hard`: the titles show without their singers, and the wrong ones are the same singer's other
 * songs as far as there are any (knowing the voice is no longer enough: you have to know the song).
 */
export function decoysFor(song: Song, all: Song[], rand: () => number, hard = false): Song[] {
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const out: Song[] = [];
  const titles = new Set<string>([norm(song.t)]);
  const take = (list: Song[], distinctArtists: Set<string> | null) => {
    const order = list.map((s) => ({ s, k: rand() })).sort((x, y) => x.k - y.k);
    for (const { s } of order) {
      if (out.length >= 3) break;
      if (titles.has(norm(s.t)) || distinctArtists?.has(s.a)) continue;
      distinctArtists?.add(s.a);
      titles.add(norm(s.t));
      out.push(s);
    }
  };
  if (hard) {
    take(all.filter((s) => s.l === song.l && s.id !== song.id && sharesSinger(s.a, song.a)), null);
    if (out.length >= 3) return out;
  }
  const same = all.filter((s) => s.l === song.l && s.id !== song.id && s.a !== song.a && norm(s.t) !== norm(song.t));
  const voice = song.g === 1 || song.g === 2 ? same.filter((s) => s.g === song.g) : [];
  const close = same.filter((s) => Math.abs(s.y - song.y) <= 8);
  const voiceClose = voice.filter((s) => Math.abs(s.y - song.y) <= 8);
  const taken = new Set<string>([song.a, ...out.map((s) => s.a)]);
  for (const list of [voiceClose, voice, close, same]) take(list, taken);
  return out;
}

/* ---------- one second (一秒猜歌, like Soundle's Snap): a snippet first, longer ones after ---------- */

/**
 * One-second rounds: when each of the three snippets starts (ms after the first) and how long the
 * first two last, in seconds (the third plays on to the end of the round). The points go 3, 2, 1
 * with them, as with the whole preview. All three start at the same spot in the song (its "hook").
 */
export const SNAP_GAPS = [0, 6000, 13_000];
export const SNAP_SECONDS = [1, 3];
/** how long a one-second round listens: 25 s, or 20 with the four titles up from the start */
export const SNAP_MS = 25_000;
export const SNAP_QUIZ_MS = 20_000;
/** where the snippets start when nobody has worked it out for this preview: just past Apple's fade-in */
export const DEFAULT_HOOK_MS = 1000;
export const HOOK_MAX_MS = 20_000;

/** The four titles as a phone shows them: on the hard level, without who sings them. */
export function shownChoices(choices: Song[], hard: boolean): { id: number; t: string; a: string; ae: string }[] {
  return choices.map((c) => (hard ? { id: c.id, t: c.t, a: "", ae: "" } : { id: c.id, t: c.t, a: c.a, ae: c.ae }));
}
