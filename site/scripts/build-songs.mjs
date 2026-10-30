// The song list grows: languages and categories for Name That Tune. (Node version of
// scripts/build_songs2.py, for a computer without Python; same rules, same output.)
//
// Keeps every song already in src/data/songs.ts, then adds songs for the artists in
// scripts/song_seeds.json (Chinese, Cantonese, English, Korean, Japanese, Vietnamese, each with
// oldies / pop / rock / folk / hip-hop / dance / R&B / film & TV), the world classics, and today's
// most-played charts in fifteen countries. Who sings each song comes from scripts/singers.json
// (MusicBrainz). Writes src/data/songs.ts in the twelve-field row format (see src/shared/songs.ts).
//
// Apple's search API allows about twenty calls a minute, so a full run takes a couple of hours.
// It is safe to stop and start again: every call is cached in songcache/.
//
//     node scripts/build-songs.mjs            # everything
//     node scripts/build-songs.mjs ko ja      # only some languages (or: world, charts)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, "..");
const OUT = path.join(SITE, "src", "data", "songs.ts");
const CACHE = process.env.SONG_CACHE || path.join(SITE, "songcache");
fs.mkdirSync(CACHE, { recursive: true });
const LOG = fs.createWriteStream(path.join(CACHE, "build.log"), { flags: "a" });
const log = (...a) => { const s = a.join(" "); console.log(s); LOG.write(s + "\n"); };

const SEEDS = JSON.parse(fs.readFileSync(path.join(HERE, "song_seeds.json"), "utf8"));
const SINGERS = JSON.parse(fs.readFileSync(path.join(HERE, "singers.json"), "utf8"));
const ONLY = new Set(process.argv.slice(2));
const want = (k) => ONLY.size === 0 || ONLY.has(k);

const t2s = OpenCC.Converter({ from: "tw", to: "cn" });
const s2t = OpenCC.Converter({ from: "cn", to: "twp" });
const s2hk = OpenCC.Converter({ from: "cn", to: "hk" });

const LANG_INDEX = { zh: 0, en: 1, yue: 2, ko: 3, ja: 4, vi: 5, world: 6, other: 7 };
const LANG_OF = Object.fromEntries(Object.entries(LANG_INDEX).map(([k, v]) => [v, k]));
const CAT_BIT = { oldies: 1, pop: 2, rock: 4, folk: 8, rap: 16, dance: 32, rnb: 64, ost: 128 };
const CLASSIC_BIT = 256;
const PER = { pop: 10, oldies: 10, rock: 8, folk: 8, rap: 8, dance: 6, rnb: 8, ost: 6 };
const CHART_COUNTRIES = ["us", "gb", "ca", "au", "tw", "hk", "cn", "jp", "kr", "vn", "br", "mx", "de", "fr", "in"];
const STORES = { zh: ["tw", "cn"], yue: ["hk"], en: ["us", "gb"], ko: ["kr"], ja: ["jp"], vi: ["vn"] };
const GENDER = { m: 1, f: 2, mixed: 3 };

/* ---------- the same filters as build_songs.py ---------- */
const SKIP = /(?<![a-z])live(?![a-z])|現場|现场|演唱會|演唱会|remix|\bmix\)|instrumental|伴奏|伴唱|純音樂|纯音乐|演奏|karaoke|\bdemo\b|acoustic|金曲|\bin [a-g][b#]? (major|minor)\b|\bversion\)|\bver\.|medley|reprise|\bintro\b|\boutro\b|interlude|commentary|鋼琴版|钢琴版|\bedit\)|sped up|slowed|orchestral|unplugged|a cappella|cover\)/i;
const LIVE_ALBUM = /(?<![a-z])live(?![a-z])|演唱會|演唱会|ライブ|라이브/i;
const CJK = /[㐀-鿿]/;
const OTHER_SCRIPTS = /[가-힯぀-ヿ]/;
const HANGUL = /[가-힯]/;
const KANA = /[぀-ヿ]/;
const VIET = /[ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/;
const SPLIT = /\s*(?:&|,|\/|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b|\bx\b|\bX\b|\bvs\.?\b|＆|、|和)\s*/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function get(url, tries = 4) {
  const key = path.join(CACHE, url.replace(/[^A-Za-z0-9]+/g, "_").slice(-180) + ".json");
  if (fs.existsSync(key)) return JSON.parse(fs.readFileSync(key, "utf8"));
  for (let i = 0; i < tries; i++) {
    const wait = 3300 - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const r = await fetch(url, { headers: { "User-Agent": "changle.ca song list builder" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      fs.writeFileSync(key, JSON.stringify(data));
      return data;
    } catch (e) {
      log("  retry", i + 1, url.slice(0, 90), String(e.message || e));
      await sleep((String(e).includes("403") ? 150000 : 20000) * (i + 1));
    }
  }
  return null;
}
async function search(term, country, limit = 60) {
  const q = new URLSearchParams({ term, entity: "song", attribute: "artistTerm", limit: String(limit), country });
  const d = await get("https://itunes.apple.com/search?" + q);
  return (d && d.results) || [];
}
async function lookup(ids, country) {
  const out = [];
  for (let k = 0; k < ids.length; k += 150) {
    const q = new URLSearchParams({ id: ids.slice(k, k + 150).join(","), country, entity: "song" });
    const d = await get("https://itunes.apple.com/lookup?" + q);
    for (const x of (d && d.results) || []) if (x.kind === "song") out.push(x);
  }
  return out;
}
async function chart(country) {
  const d = await get(`https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/100/songs.json`);
  return (((d && d.feed) || {}).results || []).map((x) => parseInt(x.id, 10)).filter(Boolean);
}

function normTitle(s) {
  s = t2s(s).toLowerCase();
  s = s.replace(/[([（【].*?[)\]）】]/g, "");
  s = s.replace(/\s+-\s+.*$/, "");
  return s.replace(/[^\p{L}\p{N}_]+/gu, "");
}
function cleanTitle(name, lang) {
  const title = lang === "zh" ? t2s(name) : name;
  let shown;
  if (lang === "zh") {
    shown = title;
    if (/主题曲|片尾曲|片头曲|插曲|推广曲|宣传曲|心动曲|陪伴曲|主题歌|原声/.test(shown)) shown = shown.split(/\s*[(（《[【]/)[0] || shown;
    for (let prev = null; shown !== prev; ) {
      prev = shown;
      shown = shown.replace(/\s*[(（[【《][^(（[【《)）\]】》]*[)）\]】》]/g, "");
    }
  } else {
    shown = title.replace(/(?<=\S)\s*[([][^)\]]*[)\]]/g, "");
  }
  shown = shown.replace(/\s+-\s+.*$/, "").trim();
  return shown || title.trim();
}
function okTrack(x, lang) {
  if (x.kind !== "song" || !x.previewUrl) return false;
  if ((x.trackTimeMillis || 0) < 100000) return false;
  const name = x.trackName || "";
  if (SKIP.test(name) || /(?<![a-z])live(?![a-z])|演唱會|演唱会/i.test(x.collectionName || "")) return false;
  if (t2s(cleanTitle(name, lang)).toLowerCase() === t2s(x.artistName || "").toLowerCase()) return false;
  if (lang === "zh") return CJK.test(name) && !OTHER_SCRIPTS.test(name);
  return !CJK.test(name) && !OTHER_SCRIPTS.test(name) && !CJK.test(x.artistName || "");
}
function okFor(x, lang) {
  if (lang === "zh" || lang === "en") return okTrack(x, lang);
  if (x.kind !== "song" || !x.previewUrl || (x.trackTimeMillis || 0) < 100000) return false;
  const name = x.trackName || "", album = x.collectionName || "";
  if (SKIP.test(name) || LIVE_ALBUM.test(album)) return false;
  if (lang === "yue") return CJK.test(name) && !OTHER_SCRIPTS.test(name) && !/國語|国语|Mandarin/i.test(album + " " + name);
  if (lang === "ko") return HANGUL.test(name + " " + (x.artistName || "")) || !CJK.test(name);
  if (lang === "ja") return !HANGUL.test(name);
  if (lang === "vi") return !CJK.test(name) && !HANGUL.test(name) && !KANA.test(name);
  return true;
}
function guessLang(title, artist, store) {
  const s = title + " " + artist;
  if (KANA.test(s)) return 4;
  if (HANGUL.test(s)) return 3;
  if (VIET.test(s)) return 5;
  if (CJK.test(title)) return store === "hk" ? 2 : 0;
  if (["us", "gb", "ca", "au", "nz", "ie"].includes(store)) return 1;
  return /^[\x20-\x7e’“”…]+$/.test(s) ? 1 : 7;
}
const normArtist = (s) => t2s(s).toLowerCase().replace(/é/g, "e").replace(/[^\p{L}\p{N}_]+/gu, "");
function artistMatches(seed, name) {
  const a = normArtist(seed), b = normArtist(name);
  if (!a || !b) return false;
  if (a === b || (a.length >= 2 && b.includes(a)) || (b.length >= 3 && a.includes(b))) return true;
  for (const chunk of seed.split(/\s+|&|,/)) { const c = normArtist(chunk); if (c.length >= 3 && b.includes(c)) return true; }
  return false;
}
function singerOf(artist) {
  const first = artist.split(SPLIT)[0].trim();
  for (const key of [first, t2s(first), artist, t2s(artist)]) { const g = SINGERS[key]; if (g) return GENDER[g] || 0; }
  return 0;
}

const PRE = "https://audio-ssl.itunes.apple.com/itunes-assets/", SUF = ".plus.aac.p.m4a";
const ART = /^https:\/\/is(\d)-ssl\.mzstatic\.com\/image\/thumb\/(.+)\/\d+x\d+bb\.(jpg|png)$/;
function pack(x, lang, artist, artistEn, store, chartHit) {
  let p = x.previewUrl;
  if (p.startsWith(PRE) && p.endsWith(SUF)) p = p.slice(PRE.length, p.length - SUF.length);
  const m = ART.exec(x.artworkUrl100 || "");
  return { id: x.trackId, t: cleanTitle(x.trackName, lang), a: artist, ae: artistEn, l: lang, y: parseInt((x.releaseDate || "0000").slice(0, 4), 10) || 0, p, art: m ? `${m[1]}|${m[2]}` : "", s: store, c: chartHit ? 1 : 0 };
}

function loadExisting() {
  const rows = [];
  for (const line of fs.readFileSync(OUT, "utf8").split("\n")) {
    const l = line.trim();
    if (l.startsWith("[") && l.endsWith("],")) rows.push(JSON.parse(l.slice(0, -1)));
  }
  return rows;
}

async function main() {
  const songs = new Map();
  const titles = new Set();
  for (const r of loadExisting()) {
    songs.set(r[0], { id: r[0], t: r[1], a: r[2], ae: r[3], l: r[4], y: r[5], p: r[6], art: r[7], s: r[8], c: r[9], k: r[10] || 0, g: r[11] || singerOf(r[2]) });
    titles.add(normTitle(r[1]) + "|" + t2s(r[2]).toLowerCase());
  }
  log("kept", songs.size, "songs from the current list");

  function add(x, lang, store, cats, chartHit = false, shown = null) {
    const tid = x.trackId, li = LANG_INDEX[lang];
    if (songs.has(tid)) { const s = songs.get(tid); s.k |= cats; if (chartHit) s.c = 1; return false; }
    const isCn = lang === "zh" || lang === "yue";
    const aRaw = x.artistName || "";
    const artist = isCn ? t2s(aRaw) : aRaw;
    const title = shown || cleanTitle(x.trackName, isCn ? "zh" : "en");
    const key = normTitle(title) + "|" + t2s(artist).toLowerCase();
    if (titles.has(key)) return false;
    titles.add(key);
    const p = pack(x, isCn ? "zh" : "en", artist, isCn ? aRaw : artist, store, chartHit);
    p.t = title; p.l = li; p.k = cats; p.g = singerOf(aRaw);
    songs.set(tid, p);
    return true;
  }

  const missing = [];
  for (const [lang, cats] of Object.entries(SEEDS.SEEDS)) {
    if (!want(lang)) continue;
    const maxy = ((SEEDS.CATEGORIES.oldies || {}).maxYear || {})[lang];
    for (const [cat, names] of Object.entries(cats)) {
      for (const seed of names) {
        let got = 0, seen = 0;
        for (const store of STORES[lang]) {
          const term = store === "tw" ? s2t(seed) : store === "hk" ? s2hk(seed) : seed;
          for (const x of await search(term, store)) {
            if (!artistMatches(seed, x.artistName || "") || !okFor(x, lang)) continue;
            seen++;
            let bits = CAT_BIT[cat];
            const y = parseInt((x.releaseDate || "0000").slice(0, 4), 10) || 0;
            if (cat !== "oldies" && maxy && y && y <= maxy) bits |= CAT_BIT.oldies;
            if (add(x, lang, store, bits)) got++;
            if (got >= PER[cat]) break;
          }
          if (got >= Math.min(5, PER[cat]) || seen >= PER[cat]) break;
        }
        if (seen === 0) missing.push(`${lang}/${cat}/${seed}`);
        log(`${lang}/${cat} ${seed}: +${got} (${seen} usable)`);
      }
    }
  }

  if (want("world")) {
    for (const [title, by, zh] of SEEDS.WORLD_CLASSICS) {
      const q = new URLSearchParams({ term: `${title} ${by}`, entity: "song", limit: "12", country: "us" });
      const d = await get("https://itunes.apple.com/search?" + q);
      const items = ((d && d.results) || []).filter((x) => x.previewUrl && (x.trackTimeMillis || 0) >= 45000 && !/karaoke|ringtone|tutorial|8-bit|lullab|music box|tribute/i.test((x.trackName || "") + " " + (x.collectionName || "")));
      const head = normTitle(title).slice(0, 6);
      const pick = items.find((x) => head && normTitle(x.trackName || "").includes(head)) || items[0] || null;
      if (pick) {
        const orig = cleanTitle(pick.trackName, "en");
        add(pick, "world", "us", CLASSIC_BIT, false, zh !== orig ? `${zh} · ${orig}` : zh);
      }
      log(`world ${title}: ${pick ? pick.trackName + " — " + pick.artistName : "not found"}`);
    }
  }

  if (want("charts")) {
    for (const cc of CHART_COUNTRIES) {
      const ids = await chart(cc);
      let n = 0;
      for (const x of await lookup(ids, cc)) {
        const li = guessLang(x.trackName || "", x.artistName || "", cc);
        const lang = LANG_OF[li];
        if (!okFor(x, STORES[lang] ? lang : lang === "other" ? "en" : lang)) continue;
        if (add(x, lang, cc, 0, true)) n++;
      }
      log("chart", cc, ids.length, "added", n);
    }
  }

  const rows = [...songs.values()].sort((a, b) => a.l - b.l || a.a.localeCompare(b.a) || a.y - b.y);
  const byLang = {};
  for (const s of rows) byLang[s.l] = (byLang[s.l] || 0) + 1;
  log("total", rows.length, JSON.stringify(byLang));
  const names = { 0: "Chinese", 1: "English", 2: "Cantonese", 3: "Korean", 4: "Japanese", 5: "Vietnamese", 6: "world classics", 7: "other" };
  const counts = Object.keys(byLang).sort((a, b) => a - b).map((l) => `${byLang[l]} ${names[l]}`).join(", ");
  const stamp = new Date().toISOString().slice(0, 10);
  const lines = rows.map((s) => JSON.stringify([s.id, s.t, s.a, s.ae === s.a ? "" : s.ae, s.l, s.y, s.p, s.art, s.s, s.c, s.k, s.g]));
  const ts = `/**
 * Name That Tune: real songs. Built from Apple's public iTunes Search API on ${stamp}
 * (${counts}), each with Apple's 30-second preview; singers looked up on MusicBrainz.
 * The previews stream from Apple and every reveal links to the song on Apple Music.
 * scripts/build-songs.mjs rebuilds this file (scripts/song_seeds.json has the artists).
 *
 * Row: [Apple track id, title, artist, artist in English ("" = same), language (see LANGS in
 *       src/shared/songs.ts), year, preview (path inside Apple's preview server, or a full URL),
 *       artwork ("n|path"), storefront, 1 if it was on a most-played chart when the list was built,
 *       categories (a bit set, see CATS), who sings it (0 unknown, 1 a man, 2 a woman, 3 mixed)]
 */
import type { SongRow } from "../shared/songs";

export const SONGS_BUILT = "${stamp}";

export const SONG_ROWS: SongRow[] = [
${lines.map((r) => "  " + r + ",").join("\n")}
];
`;
  fs.writeFileSync(OUT, ts);
  fs.writeFileSync(path.join(CACHE, "missing.txt"), missing.join("\n"));
  log("wrote", OUT, fs.statSync(OUT).size, "bytes;", "artists with nothing usable:", missing.length);
  log("DONE");
}

main().catch((e) => { log("FAILED", String(e && e.stack || e)); process.exit(1); });
