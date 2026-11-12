// Name That Tune: tidies the song list (src/data/songs.ts) in place, for the decades and the singer
// specials.
//
// 1. Singers' names: the invisible characters some of Apple's rows carry go, and a few singers written
//    two ways become one (JOLIN蔡依林 is 蔡依林).
// 2. Years: Apple dates a track by the album it is on, so an old hit on a later best-of or remaster
//    reads as new (邓丽君's 月亮代表我的心 as 2018, 张国荣's 追 as 2010) and would play in the wrong
//    decade. This asks MusicBrainz when each song first came out and moves the year back when it
//    finds an earlier one, never forward. A song that moves back into its language's oldies years
//    becomes an oldie too (the build's own rule, scripts/build-songs.mjs).
//
// MusicBrainz allows one call a second. Every answer is kept in songcache/mb/ (or $SONG_CACHE/mb/), so
// a run can stop and start again. At the end it rewrites src/data/songPools.ts (scripts/song-pools.ts).
//
//     node scripts/fix-songs.mjs          # the songs that may be on a later album (see `suspect`)
//     node scripts/fix-songs.mjs all      # every song
//     node scripts/fix-songs.mjs names    # only the names, no calls
//     node scripts/fix-songs.mjs only:追,红豆   # what it finds for a few songs (writes nothing)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, "..");
const OUT = path.join(SITE, "src", "data", "songs.ts");
const CACHE = path.join(process.env.SONG_CACHE || path.join(SITE, "songcache"), "mb");
fs.mkdirSync(CACHE, { recursive: true });
const MODE = process.argv[2] || "suspects";

const t2s = OpenCC.Converter({ from: "tw", to: "cn" });
const s2tw = OpenCC.Converter({ from: "cn", to: "tw" });
const s2hk = OpenCC.Converter({ from: "cn", to: "hk" });

/** the last year that counts as old, by language (scripts/song_seeds.json, CATEGORIES.oldies.maxYear) */
const SEEDS = JSON.parse(fs.readFileSync(path.join(HERE, "song_seeds.json"), "utf8"));
const MAX_OLD = SEEDS.CATEGORIES.oldies.maxYear;
const LANG_KEY = { 0: "zh", 1: "en", 2: "yue", 3: "ko", 4: "ja", 5: "vi" };
const OLDIES = 1;

/** singers written two ways: the name players know, and its English one */
const RENAME = { "JOLIN蔡依林": ["蔡依林", "Jolin Tsai"], "森山 良子": ["森山良子", "森山良子"] };
const INVISIBLE = new RegExp("[" + String.fromCharCode(0x2028, 0x2029, 0x200b, 0x200c, 0x200d, 0xfeff) + "]", "g");

/* ---------- the list, as the build writes it ---------- */

const text = fs.readFileSync(OUT, "utf8");
const lines = text.split("\n");
const rowAt = [];
const rows = [];
lines.forEach((line, i) => {
  const l = line.trim();
  if (l.startsWith("[") && l.endsWith("],")) {
    rowAt.push(i);
    rows.push(JSON.parse(l.slice(0, -1)));
  }
});
console.log(rows.length, "songs");

/* ---------- 1. names ---------- */

const tidy = (s) => s.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
let renamed = 0;
for (const r of rows) {
  const [a, ae] = [r[2], r[3]];
  r[2] = tidy(r[2]);
  r[3] = tidy(r[3]);
  for (const [from, [to, en]] of Object.entries(RENAME)) {
    if (!r[2].split(/\s*&\s*/).includes(from)) continue;
    r[2] = r[2].split(/\s*&\s*/).map((x) => (x === from ? to : x)).join(" & ");
    const enParts = (r[3] || from).split(/\s*&\s*/);
    r[3] = enParts.map((x) => (x === from ? en : x)).join(" & ");
  }
  if (r[3] === r[2]) r[3] = "";
  if (r[2] !== a || r[3] !== ae) renamed++;
}
console.log("names tidied:", renamed);

/* ---------- 2. years ---------- */

const SPLIT = /\s*(?:&|,|\/|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b|\bx\b|\bX\b|\bvs\.?\b|＆|、|和)\s*/i;
const lead = (artist) => artist.split(SPLIT)[0].trim();
const normTitle = (s) =>
  t2s(s)
    .toLowerCase()
    .replace(/[([（【《][^)\]）】》]*[)\]）】》]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
const normName = (s) => t2s(s).toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");
const sameName = (a, b) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))));

/** the earliest year each singer has in the list: a song much later than that may be on a best-of */
const firstYear = new Map();
for (const r of rows) {
  const who = normName(lead(r[2]));
  if (r[5]) firstYear.set(who, Math.min(firstYear.get(who) ?? 9999, r[5]));
}
function suspect(r) {
  const [, , a, , l, y, , , , , k] = r;
  if (!y || l === 6 || l === 7) return false;
  const old = MAX_OLD[LANG_KEY[l]] ?? 2002;
  return y - (firstYear.get(normName(lead(a))) ?? y) >= 6 || ((k & OLDIES) !== 0 && y > old);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
let calls = 0;
async function get(url) {
  const key = path.join(CACHE, url.replace(/^https:\/\/musicbrainz\.org\/ws\/2\//, "").replace(/[^A-Za-z0-9%]+/g, "_").slice(0, 200) + ".json");
  if (fs.existsSync(key)) return JSON.parse(fs.readFileSync(key, "utf8"));
  for (let i = 0; i < 5; i++) {
    const wait = 1250 - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    last = Date.now();
    calls++;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "changle.ca song list/1.0 (https://changle.ca)", Accept: "application/json" } });
      if (res.status === 503 || res.status === 429) throw new Error("busy " + res.status);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      fs.writeFileSync(key, JSON.stringify({ recordings: (data.recordings || []).map((x) => ({ s: x.score, t: x.title, d: x["first-release-date"] || "", a: (x["artist-credit"] || []).map((c) => c.name) })) }));
      return JSON.parse(fs.readFileSync(key, "utf8"));
    } catch (e) {
      console.log("  retry", i + 1, String(e.message || e));
      await sleep(5000 * (i + 1));
    }
  }
  return null;
}
const quote = (s) => '"' + s.replace(/[\\"]/g, (c) => "\\" + c) + '"';
async function earliest(title, artist) {
  const q = `recording:${quote(title)} AND artist:${quote(artist)}`;
  const d = await get("https://musicbrainz.org/ws/2/recording?fmt=json&limit=40&query=" + encodeURIComponent(q));
  return d ? d.recordings : null;
}

/** The first year MusicBrainz knows for this song by this singer, or 0. */
async function firstRelease(r) {
  const [, t, a, ae, l] = r;
  const cn = l === 0 || l === 2;
  const who = lead(a);
  const tries = cn ? [[(l === 2 ? s2hk : s2tw)(t), (l === 2 ? s2hk : s2tw)(who)], [t, who]] : [[t, who]];
  if (!cn && ae && ae !== a) tries.push([t, lead(ae)]);
  const want = normTitle(t);
  const names = [normName(who), normName(lead(ae || a))].filter(Boolean);
  let best = 0;
  for (const [qt, qa] of tries) {
    const recs = await earliest(qt, qa);
    if (!recs) continue;
    for (const x of recs) {
      if (x.s < 80 || !x.d || normTitle(x.t) !== want) continue;
      if (!x.a.some((n) => names.some((m) => sameName(normName(n), m)))) continue;
      const y = parseInt(x.d.slice(0, 4), 10);
      if (y >= 1900 && (!best || y < best)) best = y;
    }
    if (best) break;
  }
  return best;
}

if (MODE.startsWith("only:")) {
  // a look at a few songs, by title (nothing is written): node scripts/fix-songs.mjs only:追,月亮代表我的心
  for (const r of rows.filter((r) => MODE.slice(5).split(",").includes(r[1]))) console.log(r[1], "·", r[2], r[5], "->", await firstRelease(r), suspect(r) ? "(suspect)" : "");
  process.exit(0);
}

if (MODE !== "names") {
  const todo = rows.filter((r) => (MODE === "all" ? r[5] && r[4] !== 6 && r[4] !== 7 : suspect(r)));
  console.log("asking MusicBrainz about", todo.length, "songs");
  let moved = 0;
  let found = 0;
  const log = [];
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    const y = await firstRelease(r);
    if (y) found++;
    // (a singer's first song in the list, give or take: a much earlier "first release" is a
    // namesake's, unless the song was on the oldies list to begin with)
    const floor = (r[10] & OLDIES) !== 0 ? 1900 : (firstYear.get(normName(lead(r[2]))) ?? r[5]) - 12;
    if (y && y < r[5] && y >= floor) {
      log.push(`${r[1]} · ${r[2]}: ${r[5]} -> ${y}`);
      r[5] = y;
      moved++;
      const old = MAX_OLD[LANG_KEY[r[4]]];
      if (old && y <= old) r[10] |= OLDIES;
    } else if (y && y < r[5]) log.push(`(kept) ${r[1]} · ${r[2]}: ${r[5]}, MusicBrainz says ${y}`);
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1} of ${todo.length}: ${found} found, ${moved} moved back, ${calls} calls`);
  }
  console.log(`found ${found} of ${todo.length}, moved ${moved} back`);
  fs.writeFileSync(path.join(CACHE, "moved.txt"), log.join("\n") + "\n");
}

/* ---------- write it back, rows in the build's order ---------- */

const order = rows.map((r, i) => ({ r, i })).sort((x, y) => x.r[4] - y.r[4] || x.r[2].localeCompare(y.r[2]) || x.r[5] - y.r[5] || x.i - y.i);
const head = lines.slice(0, rowAt[0]);
const tail = lines.slice(rowAt[rowAt.length - 1] + 1);
const stamp = new Date().toISOString().slice(0, 10);
const note = ` * Years: the first release MusicBrainz knows of, where Apple's album came later (scripts/fix-songs.mjs, ${stamp}).`;
const at = head.findIndex((l) => l.includes("singers looked up on MusicBrainz"));
if (MODE !== "names" && at >= 0 && !head.some((l) => l.startsWith(" * Years:"))) head.splice(at + 1, 0, note);
else if (MODE !== "names") for (let i = 0; i < head.length; i++) if (head[i].startsWith(" * Years:")) head[i] = note;
fs.writeFileSync(OUT, [...head, ...order.map(({ r }) => "  " + JSON.stringify(r) + ","), ...tail].join("\n"));
console.log("wrote", OUT);
execFileSync("npx", ["tsx", path.join(HERE, "song-pools.ts")], { cwd: SITE, stdio: "inherit" });
