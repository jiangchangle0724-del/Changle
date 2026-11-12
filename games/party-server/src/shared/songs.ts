// The songs: famous ones the whole room knows, played on the TV from YouTube's own player (never
// downloaded or copied: the video plays in YouTube's player, in sight, the way YouTube lets other
// sites show it).
//
// Six have their own famous dance, laid along the song (`dance`, `aligned`): 江南Style's horse dance,
// Macarena, 科目三, 最炫民族风's square dance, 爱你's sweet steps, APT.'s hand stack (the moves:
// shared/songmoves.ts). Their beat was measured in each video (2026-11-11, in a browser, the video
// played silently and its onsets fitted to a grid: the tempo, beat 0 to within ~10 ms) and their
// parts placed from the songs' timed lyrics, so they need no 找拍子. The others dance a few of the
// library's easiest moves, two 8-counts each, round and round (`pattern`), on a beat found the first
// time a room dances them: everyone taps along on their phones (找拍子) and the beat is kept for every
// room in the songbook (server/songbook.ts); one person can do it again on the speaker page
// (歌曲对拍). Their firstBeatMs here is only a rough guess, for the tests. A fast song is danced at
// half its tempo, on every other beat (APT. at 74.5, Happy at 80).
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
  /** a song without its own dance: a move for so many 8-counts, then the next, round and round */
  pattern?: [string, number][];
  /** a song's own dance, from its first beat to its end, part by part (aligned songs) */
  dance?: Step[];
  difficulty: Difficulty;
}

/**
 * A part of a song's dance: a move for so many beats (whole 8-counts, or 4 where the song has half a
 * phrase), counted from 1 (or from `from`: 5 for a half phrase's pickup, "5, 6, 7, 8").
 */
export type Step = readonly [move: string, beats: number, from?: number];

const GANGNAM_CHORUS: Step[] = [["horse-ride", 8], ["horse-lasso", 8], ["horse-ride", 8], ["horse-lasso", 8], ["sexy-lady", 8], ["horse-ride", 8], ["gangnam-lunge", 8], ["chest-pop", 8]];
const GANGNAM_VERSE: Step[] = [["gangnam-bounce", 24], ["horse-ride", 8], ["gangnam-bounce", 24], ["horse-ride", 8]];
/** the build ("지금부터 갈 데까지 가볼까"), then the "Oppan" pickup: half a phrase, counted 5 to 8 */
const GANGNAM_BUILD: Step[] = [["gangnam-bounce", 16], ["horse-ride", 4, 5]];

const KEMUSAN: Step[] = [["kms-swing", 8], ["kms-roll-throw", 8], ["kms-guai", 8], ["kms-open-up", 8], ["kms-guai", 8], ["kms-open-guai", 8], ["kms-cross", 8], ["kms-xiao", 8], ["kms-slow-xiao", 8]];

const ZX_VERSE: Step[] = [["zx-raise", 16], ["zx-push-walk", 16], ["zx-oath", 16], ["zx-travel-clap", 16], ["zx-swing", 8]];
const ZX_CHORUS: Step[] = [["zx-flower", 8], ["zx-reach-pull", 8], ["zx-wave-high", 16], ["zx-flower", 8], ["zx-reach-pull", 8], ["zx-wave-high", 16]];

const AINI_CHORUS: Step[] = [["aini-jianzi", 8], ["heel-tap", 8], ["aini-jianzi", 8], ["aini-skip-turn", 8]];

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
    // (the video's first 8 beats are silent; it goes off the beat after the song, past 218 s)
    bpm: 132,
    firstBeatMs: 4009,
    aligned: true,
    beats: 472,
    dance: [
      // intro, verse
      ["gangnam-bounce", 16],
      ["horse-ride", 16],
      ...GANGNAM_VERSE,
      // pre-chorus ("…그래 너 hey, 그래 바로 너 hey"), the build, the chorus
      ["hey-point", 32],
      ...GANGNAM_BUILD,
      ...GANGNAM_CHORUS,
      ...GANGNAM_VERSE,
      ["hey-point", 32],
      ...GANGNAM_BUILD,
      ...GANGNAM_CHORUS,
      // bridge, the last chorus, the end
      ["horse-lasso", 16],
      ["horse-ride", 16],
      ["horse-ride", 8],
      ["sexy-lady", 8],
      ["horse-ride", 8],
      ["gangnam-lunge", 8],
      ["chest-pop", 8],
      ["gangnam-pose", 8],
    ],
    difficulty: "easy",
  },
  {
    id: "song-apt",
    title_zh: "APT.",
    title_en: "APT.",
    artist_zh: "ROSÉ & Bruno Mars",
    artist_en: "ROSÉ & Bruno Mars",
    videoId: "ekr2nIex040",
    // (149 BPM, danced on every other beat; the dance from the first "아파트" chant, after the call)
    bpm: 74.495,
    firstBeatMs: 6756,
    aligned: true,
    beats: 200,
    dance: [
      ["apt-stack", 16],
      ["apt-drum", 16],
      ["apt-rlr-clap", 8],
      ["apt-climb", 8],
      ["apt-stack", 16],
      ["apt-drum", 16],
      ["apt-rlr-clap", 8],
      ["apt-climb", 8],
      ["apt-stack", 16],
      // bridge
      ["apt-headphones", 8],
      ["apt-drum", 8],
      ["apt-headphones", 8],
      ["apt-drum", 8],
      ["apt-climb", 8],
      ["apt-rlr-clap", 8],
      ["apt-climb", 8],
      // the last chants
      ["apt-stack", 16],
      ["apt-rlr-clap", 8],
      ["apt-headphones", 8],
    ],
    difficulty: "easy",
  },
  {
    id: "song-ai-ni",
    title_zh: "爱你",
    title_en: "Ai Ni (Love You)",
    artist_zh: "王心凌",
    artist_en: "Cyndi Wang",
    videoId: "NAODcPQcy9U",
    // (the video's first 8 beats are silent: the song starts on beat 8 of its grid)
    bpm: 100,
    firstBeatMs: 5120,
    aligned: true,
    beats: 352,
    dance: [
      // intro, verse, pre-chorus, chorus
      ["aini-wings", 24],
      ["heel-tap", 16],
      ["heel-tap", 16],
      ["aini-wings", 16],
      ["heel-tap", 16],
      ["aini-wings", 16],
      ["aini-skip-turn", 8],
      ...AINI_CHORUS,
      // interlude, verse 2, pre-chorus, chorus
      ["aini-wings", 16],
      ["aini-heart", 8],
      ["heel-tap", 16],
      ["aini-wings", 16],
      ["heel-tap", 8],
      ["aini-skip-turn", 8],
      ...AINI_CHORUS,
      // bridge, chorus, the last chorus (longer)
      ["aini-wings", 16],
      ["aini-heart", 8],
      ...AINI_CHORUS,
      ...AINI_CHORUS,
      ["heel-tap", 8],
      ["aini-heart", 8],
    ],
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
    // (the dance from the intro's third 8-count)
    bpm: 127,
    firstBeatMs: 7997,
    aligned: true,
    beats: 576,
    dance: [
      ["zx-swing", 32],
      ...ZX_VERSE,
      ...ZX_CHORUS,
      // the "留下来" chant and the interlude
      ["zx-swing", 56],
      ...ZX_VERSE,
      ...ZX_CHORUS,
      // the slow bridge (five and a half 8-counts), the chorus
      ["zx-swing", 40],
      ["zx-pose", 4, 5],
      ...ZX_CHORUS,
      // a half-phrase break, the rap, the chorus, the end
      ["zx-pose", 4, 5],
      ["zx-travel-clap", 32],
      ...ZX_CHORUS,
      ["zx-pose", 8],
    ],
    difficulty: "easy",
  },
  {
    id: "song-yi-xiao-jiang-hu",
    title_zh: "一笑江湖（科目三）",
    title_en: "Yi Xiao Jiang Hu (Kemusan)",
    artist_zh: "闻人听書",
    artist_en: "Wenren Tingshu",
    videoId: "b3rFbkFjRrA",
    // (the bow at the end of the intro; the routine (the steps as written up in 數位時代, 2024)
    // three times, 花手 through the breakdown, twice more, and a bow)
    bpm: 130,
    firstBeatMs: 14794,
    aligned: true,
    beats: 456,
    dance: [["kms-bow", 8], ...KEMUSAN, ...KEMUSAN, ...KEMUSAN, ["kms-swing", 8], ["kemusan-hand-twirl", 32], ...KEMUSAN, ...KEMUSAN, ...KEMUSAN.slice(0, 5), ["kms-bow", 8]],
    difficulty: "easy",
  },
  {
    id: "song-macarena",
    title_zh: "Macarena",
    title_en: "Macarena",
    artist_zh: "Los del Río",
    artist_en: "Los del Río",
    videoId: "zWaymcVmJ-A",
    // (the 16 counts over and over, the jump on the chorus' "¡Ay!")
    bpm: 103.16,
    firstBeatMs: 5154,
    aligned: true,
    beats: 352,
    dance: Array.from({ length: 22 }, (): Step[] => [["macarena-arms", 8], ["macarena-hips", 8]]).flat(),
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

/** The song's move and its count on each beat of its dance: its own dance's, or its pattern's, round and round. */
export function songBeat(song: Song, beat: number): { move: string; count: number } {
  if (song.dance) {
    let b = beat;
    for (const [move, n, from = 1] of song.dance) {
      if (b < n) return { move, count: ((from - 1 + b) % 8) + 1 };
      b -= n;
    }
    const last = song.dance[song.dance.length - 1]!;
    return { move: last[0], count: (beat % 8) + 1 };
  }
  const pattern = song.pattern ?? [];
  const total = pattern.reduce((n, [, k]) => n + k, 0);
  let i = (((Math.floor(beat / 8) % total) + total) % total) || 0;
  for (const [move, k] of pattern) {
    if (i < k) return { move, count: (beat % 8) + 1 };
    i -= k;
  }
  return { move: pattern[0]?.[0] ?? "", count: (beat % 8) + 1 };
}

/** Its moves, once each, in the order they first come (what the teaching goes through). */
export const songMoves = (song: Song): string[] => [...new Set((song.dance ?? song.pattern ?? []).map(([m]) => m))];
