/**
 * Real songs for Name That Tune: the shape of a song, where its preview and cover live, and how
 * the game picks one. The song list itself (src/data/songs.ts) is big, so screens never import it:
 * the server sends each phone what it needs, and the one-phone game loads the list on demand.
 */

/** [Apple track id, title, artist, artist in English ("" = same), 0 Chinese / 1 English, year, preview, artwork, storefront, chart] */
export type SongRow = [number, string, string, string, 0 | 1, number, string, string, string, 0 | 1];

export type Song = {
  id: number;
  /** title as shown (Chinese songs in Simplified) */
  t: string;
  /** artist, and the artist's English name */
  a: string;
  ae: string;
  /** 0 Chinese, 1 English */
  l: 0 | 1;
  y: number;
  /** preview: a path on Apple's preview server, or a full URL */
  p: string;
  /** cover: "n|path" on Apple's image server */
  art: string;
  /** Apple Music storefront the song came from */
  s: string;
  /** on a most-played chart */
  c: 0 | 1;
};

export type SongPool = "mix" | "zh" | "en";

export const fromRow = (r: SongRow): Song => ({ id: r[0], t: r[1], a: r[2], ae: r[3] || r[2], l: r[4], y: r[5], p: r[6], art: r[7], s: r[8], c: r[9] });
export const toRow = (s: Song): SongRow => [s.id, s.t, s.a, s.ae === s.a ? "" : s.ae, s.l, s.y, s.p, s.art, s.s, s.c];

const PREVIEW = "https://audio-ssl.itunes.apple.com/itunes-assets/";

export function previewUrl(p: string) {
  return /^https:\/\//.test(p) ? p : `${PREVIEW}${p}.plus.aac.p.m4a`;
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
export type SongCard = { id: number; t: string; a: string; ae: string; art: string; url: string; y: number };
export const cardOf = (s: Song): SongCard => ({ id: s.id, t: s.t, a: s.a, ae: s.ae, art: artUrl(s.art), url: appleMusicUrl(s.id, s.s), y: s.y });

/** Accept a song row from outside (the charts service) only if every field looks right. */
export function checkRow(r: unknown): Song | null {
  if (!Array.isArray(r) || r.length !== 10) return null;
  const [id, t, a, ae, l, y, p, art, s, c] = r as unknown[];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  if (typeof t !== "string" || !t || t.length > 120 || typeof a !== "string" || !a || a.length > 120) return null;
  if (typeof ae !== "string" || ae.length > 120 || (l !== 0 && l !== 1) || typeof y !== "number") return null;
  if (typeof p !== "string" || !p || p.length > 300 || (/^https?:/.test(p) && !p.startsWith(PREVIEW))) return null;
  if (typeof art !== "string" || art.length > 300 || typeof s !== "string" || (c !== 0 && c !== 1)) return null;
  return fromRow(r as SongRow);
}

/** The title as players know it: no "(theme song of ...)", "(feat. ...)", "(Remastered)" or " - subtitle" tails. Same rules as scripts/build_songs.py. */
export function cleanTitle(name: string, lang: 0 | 1): string {
  let t = name;
  if (lang === 0) {
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

const inPool = (pool: SongPool) => (s: Song) => pool === "mix" || (pool === "zh" ? s.l === 0 : s.l === 1);

/**
 * Pick the next song: never one played this game, preferably none anyone at the table has
 * heard lately, and in a mixed game the two languages take turns at random. Chart songs and
 * newer ones come up a little more often.
 */
export function pickSong(all: Song[], pool: SongPool, avoid: Set<number>, played: Set<number>, rand: () => number, lang?: 0 | 1): Song | null {
  const fit = all.filter(inPool(pool));
  const wantLang = pool === "mix" ? (lang ?? (rand() < 0.5 ? 0 : 1)) : pool === "zh" ? 0 : 1;
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

/** Three wrong answers that look like they could be right: same language, other artists, close in time. */
export function decoysFor(song: Song, all: Song[], rand: () => number): Song[] {
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const same = all.filter((s) => s.l === song.l && s.id !== song.id && s.a !== song.a && norm(s.t) !== norm(song.t));
  const close = same.filter((s) => Math.abs(s.y - song.y) <= 8);
  const out: Song[] = [];
  const taken = new Set<string>([song.a]);
  const titles = new Set<string>([norm(song.t)]);
  for (const list of [close, same]) {
    const order = list.map((s) => ({ s, k: rand() })).sort((x, y) => x.k - y.k);
    for (const { s } of order) {
      if (out.length >= 3) break;
      if (taken.has(s.a) || titles.has(norm(s.t))) continue;
      taken.add(s.a);
      titles.add(norm(s.t));
      out.push(s);
    }
  }
  return out;
}
