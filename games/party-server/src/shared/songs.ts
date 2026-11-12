// The songs: famous ones the whole room knows, played on the TV from YouTube's own player (never
// downloaded or copied: the video plays in YouTube's player, in sight, the way YouTube lets other
// sites show it), each with a dance of the library's easiest moves on its beat: a few moves, two
// 8-counts each, round and round. The moves are this site's own, not the songs' famous dances.
//
// A song's beat: its tempo (what the published tempo sites agree on; a fast song is danced at half
// its tempo, on every other beat: APT. at 74.5, Happy at 80), and when in the video the dance's
// first beat is: the first time a room dances a song, everyone taps along to it on their phones
// (找拍子), and the beat they find is kept for every room in the songbook (server/songbook.ts); one
// person can do it again on the speaker page (歌曲对拍). firstBeatMs here is only a rough guess, for
// the tests.
//
// The videos are the artists' or labels' own uploads (YouTube's "Topic" channels are the labels'
// audio). Checked 2026-11-11 in a browser at home: all 16 play embedded. 最炫民族风's first one
// (6eGj6ZC5R4E) wouldn't (error 150: its owner doesn't let other sites play it); the label's Topic
// upload does. A data centre's address is refused most of them, so the cloud checks can't tell.
// Left out: 小苹果 (its official video stops the song for sketches), 学猫叫 (no official upload),
// Y.M.C.A. (live drums: its tempo drifts).
import type { Difficulty } from "../../../party-base/src/index";

export interface Song {
  id: string;
  title_zh: string;
  title_en: string;
  artist_zh: string;
  artist_en: string;
  /** the YouTube video */
  videoId: string;
  bpm: number;
  /**
   * when in the video the dance's first beat is (ms). For an aligned song (below) it's from the
   * song's own timing, to within half a beat, and the room's tapped beat grid settles it exactly;
   * for the others a rough guess until the songbook knows better.
   */
  firstBeatMs: number;
  /** its dance is laid along the song's sections (the original dance), from firstBeatMs */
  aligned?: boolean;
  /** the beats the dance lasts (whole 8-counts), over before the video is */
  beats: number;
  /** the dance: a move for so many 8-counts, then the next, round and round */
  pattern: [string, number][];
  difficulty: Difficulty;
}

/** Song ids start with this (so a room tells them from the library's dances). */
export const SONG_PREFIX = "song-";

export const SONGS: readonly Song[] = [
  {
    id: "song-gangnam-style",
    title_zh: "江南Style",
    title_en: "Gangnam Style",
    artist_zh: "PSY",
    artist_en: "PSY",
    videoId: "9bZkp7q19f0",
    bpm: 132,
    firstBeatMs: 10000,
    beats: 328,
    pattern: [["march-clap", 2], ["raise-arms", 2], ["side-step-touch", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-apt",
    title_zh: "APT.",
    title_en: "APT.",
    artist_zh: "ROSÉ & Bruno Mars",
    artist_en: "ROSÉ & Bruno Mars",
    videoId: "ekr2nIex040",
    bpm: 74.5,
    firstBeatMs: 4000,
    beats: 184,
    pattern: [["clap-2x", 2], ["raise-arms", 2], ["side-wave", 2], ["forward-push", 2]],
    difficulty: "easy",
  },
  {
    id: "song-ai-ni",
    title_zh: "爱你",
    title_en: "Ai Ni (Love You)",
    artist_zh: "王心凌",
    artist_en: "Cyndi Wang",
    videoId: "NAODcPQcy9U",
    bpm: 100,
    firstBeatMs: 8000,
    beats: 248,
    pattern: [["side-wave", 2], ["clap-2x", 2], ["open-arms", 2], ["alternating-reach", 2]],
    difficulty: "easy",
  },
  {
    id: "song-dynamite",
    title_zh: "Dynamite",
    title_en: "Dynamite",
    artist_zh: "防弹少年团 BTS",
    artist_en: "BTS",
    videoId: "gdZLi9oWNZg",
    bpm: 114,
    firstBeatMs: 10000,
    beats: 280,
    pattern: [["side-step-touch", 2], ["clap-2x", 2], ["alternating-reach", 2], ["raise-arms", 2]],
    difficulty: "easy",
  },
  {
    id: "song-gentleman",
    title_zh: "Gentleman",
    title_en: "Gentleman",
    artist_zh: "PSY",
    artist_en: "PSY",
    videoId: "ASO_zypdnsQ",
    bpm: 126,
    firstBeatMs: 12000,
    beats: 312,
    pattern: [["march-clap", 2], ["forward-push", 2], ["side-wave", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-happy",
    title_zh: "Happy",
    title_en: "Happy",
    artist_zh: "Pharrell Williams",
    artist_en: "Pharrell Williams",
    videoId: "y6Sxv-sUYtM",
    bpm: 80,
    firstBeatMs: 8000,
    beats: 200,
    pattern: [["clap-2x", 2], ["side-step-touch", 2], ["raise-arms", 2], ["side-wave", 2]],
    difficulty: "easy",
  },
  {
    id: "song-24k-magic",
    title_zh: "24K Magic",
    title_en: "24K Magic",
    artist_zh: "火星哥 Bruno Mars",
    artist_en: "Bruno Mars",
    videoId: "UqyT8IEBkvY",
    bpm: 107,
    firstBeatMs: 4000,
    beats: 264,
    pattern: [["side-step-touch", 2], ["forward-push", 2], ["clap-2x", 2], ["raise-arms", 2]],
    difficulty: "easy",
  },
  {
    id: "song-levitating",
    title_zh: "Levitating",
    title_en: "Levitating",
    artist_zh: "Dua Lipa",
    artist_en: "Dua Lipa",
    videoId: "TUVcZfQe-Kw",
    bpm: 103,
    firstBeatMs: 10000,
    beats: 256,
    pattern: [["side-wave", 2], ["side-step-touch", 2], ["alternating-reach", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-dance-monkey",
    title_zh: "Dance Monkey",
    title_en: "Dance Monkey",
    artist_zh: "Tones And I",
    artist_en: "Tones And I",
    videoId: "q0hyYWKXF0Q",
    bpm: 98,
    firstBeatMs: 10000,
    beats: 240,
    pattern: [["clap-2x", 2], ["side-wave", 2], ["march-clap", 2], ["open-arms", 2]],
    difficulty: "easy",
  },
  {
    id: "song-zui-xuan-min-zu-feng",
    title_zh: "最炫民族风",
    title_en: "Zui Xuan Min Zu Feng",
    artist_zh: "凤凰传奇",
    artist_en: "Phoenix Legend",
    videoId: "S0wHttDxEW0",
    bpm: 127,
    firstBeatMs: 2000,
    beats: 312,
    pattern: [["handkerchief-flower", 2], ["side-step-touch", 2], ["clap-2x", 2], ["raise-arms", 2]],
    difficulty: "easy",
  },
  {
    id: "song-yi-xiao-jiang-hu",
    title_zh: "一笑江湖（科目三）",
    title_en: "Yi Xiao Jiang Hu (Kemusan)",
    artist_zh: "闻人听書",
    artist_en: "Wenren Tingshu",
    videoId: "b3rFbkFjRrA",
    bpm: 130,
    firstBeatMs: 2000,
    beats: 320,
    pattern: [["handkerchief-flower", 2], ["march-clap", 2], ["clap-2x", 2], ["side-wave", 2]],
    difficulty: "easy",
  },
  {
    id: "song-macarena",
    title_zh: "Macarena",
    title_en: "Macarena",
    artist_zh: "Los del Río",
    artist_en: "Los del Río",
    videoId: "zWaymcVmJ-A",
    bpm: 103,
    firstBeatMs: 6000,
    beats: 256,
    pattern: [["alternating-reach", 2], ["forward-push", 2], ["open-arms", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-waka-waka",
    title_zh: "Waka Waka",
    title_en: "Waka Waka",
    artist_zh: "夏奇拉 Shakira",
    artist_en: "Shakira",
    videoId: "pRpeEdMmmQ0",
    bpm: 127,
    firstBeatMs: 10000,
    beats: 312,
    pattern: [["side-step-touch", 2], ["clap-2x", 2], ["raise-arms", 2], ["side-wave", 2]],
    difficulty: "easy",
  },
  {
    id: "song-uptown-funk",
    title_zh: "Uptown Funk",
    title_en: "Uptown Funk",
    artist_zh: "Mark Ronson, Bruno Mars",
    artist_en: "Mark Ronson ft. Bruno Mars",
    videoId: "OPf0YbXqDm0",
    bpm: 115,
    firstBeatMs: 10000,
    beats: 280,
    pattern: [["march-clap", 2], ["side-step-touch", 2], ["forward-push", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-despacito",
    title_zh: "Despacito",
    title_en: "Despacito",
    artist_zh: "Luis Fonsi, Daddy Yankee",
    artist_en: "Luis Fonsi ft. Daddy Yankee",
    videoId: "kJQP7kiw5Fk",
    bpm: 89,
    firstBeatMs: 10000,
    beats: 216,
    pattern: [["side-wave", 2], ["open-arms", 2], ["side-step-touch", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-cant-stop-the-feeling",
    title_zh: "CAN'T STOP THE FEELING!",
    title_en: "CAN'T STOP THE FEELING!",
    artist_zh: "贾斯汀 Justin Timberlake",
    artist_en: "Justin Timberlake",
    videoId: "ru0K8uYEZWw",
    bpm: 113,
    firstBeatMs: 10000,
    beats: 280,
    pattern: [["clap-2x", 2], ["side-step-touch", 2], ["raise-arms", 2], ["alternating-reach", 2]],
    difficulty: "easy",
  },
];

const byId = new Map(SONGS.map((s) => [s.id, s]));
export const songById = (id: string): Song | null => byId.get(id) ?? null;
export const isSongId = (id: string) => id.startsWith(SONG_PREFIX);

/** The song's move for each of its 8-counts, from its pattern, round and round. */
export function songMoveAt(song: Song, eightCount: number): string {
  const total = song.pattern.reduce((n, [, k]) => n + k, 0);
  let i = ((eightCount % total) + total) % total;
  for (const [move, k] of song.pattern) {
    if (i < k) return move;
    i -= k;
  }
  return song.pattern[0]![0];
}

/** Its moves, once each, in the order they first come (what the teaching goes through). */
export const songMoves = (song: Song): string[] => [...new Set(song.pattern.map(([m]) => m))];
