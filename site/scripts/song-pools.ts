/**
 * Writes src/data/songPools.ts from the song list (src/data/songs.ts): what the setup screen can offer
 * without loading the big list. Run by scripts/build-songs.mjs and scripts/fix-songs.mjs when they
 * change the list, or by hand: npx tsx scripts/song-pools.ts
 *
 * - POOL_CATS: the categories each language has at least MIN songs in (no rock in Korean, say)
 * - POOL_ERAS: the same for the decades
 * - SPECIALS: the singers a table can play a whole game of (歌手专场), by language, most songs first
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SONG_ROWS, SONGS_BUILT } from "../src/data/songs";
import { CATS, eraOf, ERAS, fromRow, inCat, LANGS, singersOf, type Song } from "../src/shared/songs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "src", "data", "songPools.ts");
const MIN = 20;
/** a singer special needs this many different songs, at least this many of them the singer's alone */
const SPECIAL_SONGS = 15;
const SPECIAL_SOLO = 10;
/** names that fold into one but are two singers (LiSA and LISA), or half a duo's name (Simon & Garfunkel) */
const NOT_ONE = new Set(["lisa", "simon", "garfunkel"]);
/** names in English for singers whose rows only carry the Chinese or Japanese one */
const EN: Record<string, string> = {
  周杰伦: "Jay Chou", 王菲: "Faye Wong", 邓紫棋: "G.E.M.", 萧敬腾: "Jam Hsiao", 张杰: "Jason Zhang", 林俊杰: "JJ Lin",
  周深: "Zhou Shen", 张惠妹: "A-Mei", 毛不易: "Mao Buyi", 潘玮柏: "Wilber Pan", 罗志祥: "Show Lo", 告五人: "Accusefive",
  王力宏: "Leehom Wang", 王心凌: "Cyndi Wang", 王以太: "Wang Yitai", 岑宁儿: "Yoyo Sham", 萧亚轩: "Elva Hsiao",
  陈奕迅: "Eason Chan", 张学友: "Jacky Cheung", "mc 张天赋": "MC Cheung Tinfu", 林忆莲: "Sandy Lam", 张敬轩: "Hins Cheung",
  容祖儿: "Joey Yung", 李克勤: "Hacken Lee", 谭咏麟: "Alan Tam", 梅艳芳: "Anita Mui", 刘德华: "Andy Lau", 张国荣: "Leslie Cheung",
  陈蕾: "Panther Chan", 陈慧娴: "Priscilla Chan", 郭富城: "Aaron Kwok", 黎明: "Leon Lai", 太极乐队: "Tai Chi", 谢安琪: "Kay Tse",
  达明一派: "Tat Ming Pair", 周国贤: "Endy Chow", 洪嘉豪: "Hung Kaho", 蓝奕邦: "Pong Nan", 卫兰: "Janice Vidal", 郑秀文: "Sammi Cheng",
  あいみょん: "Aimyon", さだまさし: "Masashi Sada", 中島みゆき: "Miyuki Nakajima", 井上陽水: "Yosui Inoue", 優里: "Yuuri",
  吉田拓郎: "Takuro Yoshida", 尾崎豊: "Yutaka Ozaki", "長渕 剛": "Tsuyoshi Nagabuchi",
};

const songs: Song[] = SONG_ROWS.map(fromRow);
const LANG_SETS: [string, number[]][] = [["mix", [0, 1]], ["zh", [0]], ["en", [1]], ["yue", [2]], ["ko", [3]], ["ja", [4]], ["vi", [5]]];

const cats: Record<string, string[]> = {};
const eras: Record<string, string[]> = {};
for (const [key, langs] of LANG_SETS) {
  const mine = songs.filter((s) => langs.includes(s.l));
  cats[key] = CATS.filter((c) => mine.filter((s) => inCat(s, c.key)).length >= MIN).map((c) => c.key);
  eras[key] = ERAS.filter((e) => mine.filter((s) => eraOf(s.y) === e.key).length >= MIN).map((e) => e.key);
}

/* ---------- singer specials ---------- */

const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
type Who = { songs: number; titles: Set<string>; solo: number; names: Map<string, number>; en: Map<string, number>; langs: number[] };
const by = new Map<string, Who>();
for (const s of songs) {
  const all = singersOf(s.a);
  for (const k of all) {
    const w = by.get(k) ?? { songs: 0, titles: new Set(), solo: 0, names: new Map(), en: new Map(), langs: [0, 0, 0, 0, 0, 0, 0, 0] };
    // (every song they sing is in their special, a world classic too)
    w.songs++;
    w.titles.add(norm(s.t));
    if (s.l !== 6) w.langs[s.l]++;
    if (all.length === 1) {
      w.solo++;
      w.names.set(s.a, (w.names.get(s.a) ?? 0) + 1);
      w.en.set(s.ae, (w.en.get(s.ae) ?? 0) + 1);
    }
    by.set(k, w);
  }
}
const most = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
const latin = (x: string) => /^[\p{Script=Latin}\p{N}\s.,'’&!?+\-:/()]+$/u.test(x);
const specials: [string, string, string, number, number][] = [];
for (const [k, w] of by) {
  if (NOT_ONE.has(k) || w.titles.size < SPECIAL_SONGS || w.solo < SPECIAL_SOLO) continue;
  const l = w.langs.indexOf(Math.max(...w.langs));
  if (l === 7) continue; // the charts' songs in other languages: no special of their own
  const zh = most(w.names);
  const ae = most(w.en);
  const en = EN[k] ?? (latin(zh) ? zh : latin(ae) ? ae : zh);
  // (a game plays a title once, so the count is the titles: poolSize in src/shared/songs.ts)
  specials.push([k, zh, en === zh ? "" : en, l, w.titles.size]);
}
specials.sort((a, b) => a[3] - b[3] || b[4] - a[4] || a[1].localeCompare(b[1]));

const perLang = LANGS.map((x, i) => `${specials.filter((s) => s[3] === i).length} ${x.en}`).filter((x) => !x.startsWith("0 "));
fs.writeFileSync(
  OUT,
  `/**
 * What the setup screen can offer without loading the big song list (src/data/songs.ts, built on
 * ${SONGS_BUILT}). Written by scripts/song-pools.ts: don't edit by hand.
 */

/** the categories each language has at least ${MIN} songs in */
export const POOL_CATS: Record<string, string[]> = ${JSON.stringify(cats)};

/** the decades each language has at least ${MIN} songs from */
export const POOL_ERAS: Record<string, string[]> = ${JSON.stringify(eras)};

/**
 * Singer specials (歌手专场): singers with at least ${SPECIAL_SONGS} different songs in the list, ${SPECIAL_SOLO} of them
 * their own: ${specials.length} in all.
 * ${perLang.join(", ")}.
 * [the name as singersOf folds it (the pool is "@" and this), the name shown, the English one
 * ("" = the same), language, how many different songs the pool has]
 */
export const SPECIALS: [string, string, string, number, number][] = [
${specials.map((s) => "  " + JSON.stringify(s) + ",").join("\n")}
];
`,
);
console.log(`wrote ${OUT}: ${specials.length} singer specials (${perLang.join(", ")})`);
console.log("cats", JSON.stringify(cats));
console.log("eras", JSON.stringify(eras));
