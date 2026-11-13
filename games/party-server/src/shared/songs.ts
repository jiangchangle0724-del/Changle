// The songs: famous ones the whole room knows, played on the TV from YouTube's own player (never
// downloaded or copied: the video plays in YouTube's player, in sight, the way YouTube lets other
// sites show it).
//
// Fourteen have their own famous dance, laid along the song (`dance`, `aligned`): 江南Style's horse
// dance, Macarena, 科目三, 最炫民族风's square dance, 爱你's sweet steps, APT.'s hand stack, the Cupid
// Shuffle's line dance, the Cha-Cha Slide's calls, Y.M.C.A.'s letters, Watch Me's whip and nae nae,
// the Ketchup Song's hands, Gee's crab step, 海草舞's seaweed arms and 極楽浄土's kimono sleeves (the
// moves: shared/songmoves.ts).
// Their parts were placed from the songs' timed lyrics. The other six dance a few of the library's
// easiest moves, two 8-counts each, round and round (`pattern`).
// Every song's beat was measured in its video (2026-11-11 and 12, in a browser: the video played
// silently and its onsets fitted to a grid, the tempo and beat 0 to within ~10 ms), so a song starts
// as soon as a phone picks it: nobody taps along to find its beat (Steve, 2026-11-12: the players
// pick any song on their phones and it plays; the TV is touched for nothing). A fast song is danced
// at half its tempo, on every other beat (APT. at 74.5).
//
// The videos are the artists' or labels' own uploads (YouTube's "Topic" channels are the labels'
// audio), but 海草舞's (there is none). Checked in a browser at home: all play embedded (the first
// twelve 2026-11-11; all of them again on the 12th, as their beats were measured). 最炫民族风's first one
// (6eGj6ZC5R4E) wouldn't (error 150: its owner doesn't let other sites play it); the label's Topic
// upload does. A data centre's address is refused most of them, so the cloud checks can't tell.
// Left out: 小苹果 (its official video stops the song for sketches), 学猫叫 (no official upload).
// Happy, Dance Monkey, Despacito and 24K Magic made way for songs with a dance of their own
// (2026-11-12). 極楽浄土's album video is a still picture: its band's dance video is used instead.
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
  /** when in the video the dance's first beat is (ms): a beat of the grid measured in the video */
  firstBeatMs: number;
  /** its dance is laid along the song's sections (the original dance), from firstBeatMs */
  aligned?: boolean;
  /** the beats the dance lasts (whole 8-counts), over before the video is */
  beats: number;
  /** a song without its own dance: a move for so many 8-counts, then the next, round and round */
  pattern?: [string, number][];
  /** a song's own dance, from its first beat to its end, part by part (aligned songs) */
  dance?: Step[];
  /**
   * its dance doesn't keep to 8-counts: it follows a caller (the Cha-Cha Slide: each part what a call
   * asks for, from the beat it's called to the next call), or the song's lines run 12 beats (the
   * Ketchup Song). Each part lasts as long as it needs, counted from where it starts.
   */
  calls?: true;
  /** the moves its teaching goes through, when not all of them (a caller's song says the rest as it goes) */
  teach?: string[];
  difficulty: Difficulty;
}

/**
 * A part of a song's dance: a move for so many beats (whole 8-counts, or 4 where the song has half a
 * phrase), counted from 1 (or from `from`: 5 for a half phrase's pickup, "5, 6, 7, 8").
 */
export type Step = readonly [move: string, beats: number, from?: number];

// 江南Style as its official video dances it (looked at frame by frame, 2026-11-12): the chorus is the
// horse ride and the lasso (the riding hall, the subway), "Eh~ Sexy Lady" the hands-on-hips hip
// shake, the line between them the tour bus's disco point, "op op op op" the horse again; the
// verses little PSY's groove, the build the bus's disco, the bridge the strut across the disco.
const GANGNAM_CHORUS: Step[] = [["horse-ride", 8], ["horse-lasso", 8], ["horse-ride", 8], ["horse-lasso", 8], ["sexy-lady", 8], ["disco-point", 8], ["sexy-lady", 8], ["horse-ride", 8]];
const GANGNAM_VERSE: Step[] = [["gangnam-bounce", 24], ["horse-ride", 8], ["gangnam-bounce", 24], ["horse-ride", 8]];
/** the build ("지금부터 갈 데까지 가볼까"), then the "Oppan" pickup: half a phrase, counted 5 to 8 */
const GANGNAM_BUILD: Step[] = [["disco-point", 16], ["horse-ride", 4, 5]];

const KEMUSAN: Step[] = [["kms-swing", 8], ["kms-roll-throw", 8], ["kms-guai", 8], ["kms-open-up", 8], ["kms-guai", 8], ["kms-open-guai", 8], ["kms-cross", 8], ["kms-xiao", 8], ["kms-slow-xiao", 8]];

const ZX_VERSE: Step[] = [["zx-raise", 16], ["zx-push-walk", 16], ["zx-oath", 16], ["zx-travel-clap", 16], ["zx-swing", 8]];
const ZX_CHORUS: Step[] = [["zx-flower", 8], ["zx-reach-pull", 8], ["zx-wave-high", 16], ["zx-flower", 8], ["zx-reach-pull", 8], ["zx-wave-high", 16]];

const YMCA_VERSE: Step[] = [["ymca-groove", 8], ["ymca-pump", 8], ["ymca-groove", 8], ["ymca-pump", 8], ["ymca-groove", 8], ["ymca-pump", 8], ["ymca-groove", 8], ["ymca-pump", 8]];
/** the chorus: "Y-M-C-A" twice, "they have everything…", "Y-M-C-A" twice, "you can get yourself clean…" */
const YMCA_CHORUS: Step[] = [["ymca-letters", 16], ["ymca-groove", 16], ["ymca-letters", 16], ["ymca-groove", 16]];

/** Watch Me's chorus: "now watch me whip, now watch me nae nae", "whip, whip, nae nae", twice */
const WM_CHORUS: Step[] = [["wm-whip", 8], ["wm-whip2", 8], ["wm-whip", 8], ["wm-whip2", 8]];

/** a line of the Ketchup Song's chorus: 12 beats, the hands, then the forehead and the wiggle (counted 5 to 8) */
const KETCHUP_LINE: Step[] = [["ketchup-hands", 8], ["ketchup-head", 4, 5]];

/** Gee's verse: "너무 너무 멋져…", then "Gee gee gee gee, baby baby baby", twice */
const GEE_VERSE: Step[] = [["gee-groove", 8], ["gee-crab", 8], ["gee-groove", 8], ["gee-crab", 8]];
/** its chorus: 반짝반짝 (sparkle), 깜짝깜짝 (startled), 짜릿짜릿 (tingling), "Oh 젖은 눈빛…" */
const GEE_CHORUS: Step[] = [["gee-sparkle", 8], ["gee-surprise", 8], ["gee-shiver", 8], ["gee-groove", 8]];

/** 海草舞's chorus, a line each 16 beats: 人海啊 茫茫啊, 随波逐流 浮浮沉沉, 人生啊 如梦啊, 亲爱的你 在哪里 */
const HC_CHORUS: Step[] = [["hc-look", 16], ["hc-float", 16], ["hc-dream", 16], ["hc-where", 16]];

/** 極楽浄土's verse: "月明かり昇る刻…", "祭囃子の合図…"; then "（ちょいと覗いて…）", "迷い込めば…", "（楽しいことが…）", "おいでませ" */
const GJ_VERSE: Step[] = [["gj-step", 16], ["gj-butterfly", 16], ["gj-peek", 8], ["gj-sway", 8], ["gj-peek", 8], ["gj-beckon", 8]];
/** its chorus, a move a line: 歌えや歌え, アナタの声を, 踊れや踊れ, 今宵共に あゝ狂い咲き */
const GJ_CHORUS: Step[] = [["gj-sing", 8], ["gj-voice", 8], ["gj-dance", 8], ["gj-bloom", 8]];

const AINI_CHORUS: Step[] = [["aini-jianzi", 8], ["heel-tap", 8], ["aini-jianzi", 8], ["aini-skip-turn", 8]];

/**
 * A caller's dance (Song.calls) from its calls: each call's move from the beat it's called (on the
 * video's beat grid) to the next call's, the dance from the first call to `end`.
 */
function fromCalls(end: number, calls: [beat: number, move: string][]): Step[] {
  return calls.map(([beat, move], i): Step => [move, (calls[i + 1]?.[0] ?? end) - beat]);
}

/**
 * The Cha-Cha Slide's calls, on its video's beat grid (131 BPM from 0.402 s; the dance from beat 64,
 * where the music settles on the grid). Placed from two sets of the song's timed lyrics (one timed
 * to this video, one to the album's, 27.6 s shorter at the start) and the song's 4-beat bars, to
 * within about a beat: each move starts as its call does.
 */
const CHA_CHA_CALLS: [number, string][] = [
  [64, "cha-funky"], [92, "cha-clap"],
  // the basic steps, twice
  [114, "cha-left"], [116, "cha-back"], [120, "cha-hop"], [124, "cha-stomp-r"], [128, "cha-stomp-l"], [132, "cha-cha"],
  [142, "cha-turn"], [146, "cha-left"], [148, "cha-back"], [152, "cha-hop"], [156, "cha-stomp-r"], [160, "cha-stomp-l"], [164, "cha-cha"],
  // "now it's time to get funky"
  [168, "cha-funky"], [172, "cha-right"], [176, "cha-left"], [180, "cha-back"], [184, "cha-hop"], [188, "cha-hop"], [192, "cha-stomp2-r"], [196, "cha-stomp2-l"],
  [202, "cha-left"], [204, "cha-right"], [208, "cha-criss"], [212, "cha-criss"], [216, "cha-cha"],
  // "let's go to work"
  [224, "cha-funky"], [230, "cha-left"], [232, "cha-back"], [236, "cha-hop2"], [240, "cha-hop2"], [244, "cha-stomp2-r"], [248, "cha-stomp2-l"], [252, "cha-knees"], [256, "cha-funky"],
  [272, "cha-cha"], [276, "cha-turn"], [284, "cha-left"], [288, "cha-back"], [292, "cha-hops"],
  [300, "cha-stomp-r"], [304, "cha-stomp-l"], [308, "cha-stomp-r"], [312, "cha-stomp-l"], [316, "cha-stomp-r"], [320, "cha-stomp-l"],
  // "freeze!" (the music stops on 326), clap, how low, back to the top
  [324, "cha-freeze"], [328, "cha-clap"], [346, "cha-low"], [362, "cha-top"],
  [374, "cha-hop"], [376, "cha-stomp-r"], [380, "cha-stomp-l"], [384, "cha-cha"],
  [392, "cha-turn"], [398, "cha-left"], [400, "cha-back"], [404, "cha-hop"], [408, "cha-hop"], [414, "cha-reverse"], [416, "cha-reverse"],
  [420, "cha-left"], [424, "cha-right"], [428, "cha-reverse"], [432, "cha-reverse"], [436, "cha-cha"],
  [452, "cha-turn"], [456, "cha-left"], [460, "cha-back"], [464, "cha-hop2"], [468, "cha-hop2"], [472, "cha-stomp-r"], [476, "cha-stomp-l"],
  [480, "cha-charlie"], [484, "cha-hops"], [488, "cha-right"], [492, "cha-left"], [496, "cha-back"], [500, "cha-cha"],
  // "oh yeah", to the end
  [504, "cha-funky"],
];

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
      // bridge (the strut across the disco, then riding into the last chorus), the last chorus, the end
      ["gangnam-strut", 16],
      ["horse-ride", 16],
      ["horse-ride", 8],
      ["horse-lasso", 8],
      ["sexy-lady", 8],
      ["disco-point", 8],
      ["horse-ride", 8],
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
    id: "song-cupid-shuffle",
    title_zh: "Cupid Shuffle",
    title_en: "Cupid Shuffle",
    artist_zh: "Cupid",
    artist_en: "Cupid",
    videoId: "uPna1dIeUHQ",
    // (its line dance's 32 counts over and over from the first "down, down, do your dance" (the
    // video's beat 32): the calls, "to the right…", come at 128, 224, 256, 384 and 416, each on a
    // round's first count)
    bpm: 143.61,
    firstBeatMs: 13549,
    aligned: true,
    beats: 512,
    dance: Array.from({ length: 16 }, (): Step[] => [["cupid-right", 8], ["cupid-left", 8], ["cupid-kick", 8], ["cupid-walk", 8]]).flat(),
    difficulty: "easy",
  },
  {
    id: "song-cha-cha-slide",
    title_zh: "Cha-Cha Slide",
    title_en: "Cha-Cha Slide",
    artist_zh: "Mr. C The Slide Man",
    artist_en: "Mr. C The Slide Man",
    videoId: "wZv62ShoStY",
    // (the calls: CHA_CHA_CALLS)
    bpm: 131,
    firstBeatMs: 29715,
    aligned: true,
    calls: true,
    beats: 476,
    dance: fromCalls(540, CHA_CHA_CALLS),
    teach: ["cha-left", "cha-back", "cha-hop", "cha-stomp-r", "cha-stomp-l", "cha-cha", "cha-turn", "cha-criss"],
    difficulty: "easy",
  },
  {
    id: "song-ymca",
    title_zh: "Y.M.C.A.",
    title_en: "Y.M.C.A.",
    artist_zh: "Village People",
    artist_en: "Village People",
    videoId: "CS9OO0S5w2k",
    // (live drums: the beat wanders up to about 80 ms either side of this grid, the average of the
    // whole song; the letters fall on each 8-count's first four beats, from the timed lyrics)
    bpm: 127.44,
    firstBeatMs: 3878,
    aligned: true,
    beats: 488,
    dance: [["ymca-groove", 16], ...YMCA_VERSE, ["ymca-groove", 8], ...YMCA_CHORUS, ...YMCA_VERSE, ["ymca-groove", 8], ...YMCA_CHORUS, ...YMCA_VERSE, ["ymca-groove", 8], ["ymca-letters", 16], ["ymca-groove", 16], ["ymca-letters", 16], ["ymca-groove", 16], ["ymca-letters", 16], ["ymca-groove", 16], ["ymca-letters", 32]],
    difficulty: "easy",
  },
  {
    id: "song-watch-me",
    title_zh: "Watch Me (Whip/Nae Nae)",
    title_en: "Watch Me (Whip/Nae Nae)",
    artist_zh: "Silentó",
    artist_en: "Silentó",
    videoId: "vjW8wmF5VWc",
    // (140 BPM; each call starts on a 4-beat bar, as the video's captions show: "WHIP" from 28.0 s;
    // the stanky leg, break your legs, bop, yule and Superman, duff, as the song calls them)
    bpm: 140,
    firstBeatMs: 14293,
    aligned: true,
    beats: 416,
    dance: [
      ["wm-watch", 32],
      ...WM_CHORUS,
      ["wm-watch", 32],
      ["wm-stanky", 32],
      ["wm-break", 32],
      ["wm-bop", 32],
      ...WM_CHORUS,
      ["wm-watch", 32],
      ["wm-yule", 32],
      ["wm-duff", 32],
      ["wm-bop", 32],
      ...WM_CHORUS,
      ["wm-watch", 32],
    ],
    difficulty: "easy",
  },
  {
    id: "song-ketchup",
    title_zh: "The Ketchup Song (Aserejé)",
    title_en: "The Ketchup Song (Aserejé)",
    artist_zh: "Las Ketchup",
    artist_en: "Las Ketchup",
    videoId: "V0PisGe66mY",
    // (the chorus lines are 12 beats, so its parts keep to the song's lines, not to 8-counts: the
    // choruses from the video's beats 54, 145 and 215, from the timed lyrics)
    bpm: 92.5,
    firstBeatMs: 9627,
    aligned: true,
    calls: true,
    beats: 297,
    dance: [
      ["ketchup-sway", 40],
      ...KETCHUP_LINE, ...KETCHUP_LINE, ...KETCHUP_LINE,
      ["ketchup-sway", 55],
      ...KETCHUP_LINE, ...KETCHUP_LINE, ...KETCHUP_LINE,
      ["ketchup-sway", 34],
      ...Array.from({ length: 8 }, () => KETCHUP_LINE).flat(),
    ],
    difficulty: "easy",
  },
  {
    id: "song-gee",
    title_zh: "Gee",
    title_en: "Gee",
    artist_zh: "少女时代",
    artist_en: "Girls' Generation",
    videoId: "U7mPqycQ0tQ",
    // (the video's song comes in 18.2 s later than the record's, its beat dropping on "너무 너무
    // 멋져" at 38.6 s; the second half runs half a phrase later, after a 4-beat break)
    bpm: 100,
    firstBeatMs: 24250,
    aligned: true,
    beats: 316,
    dance: [
      ["gee-groove", 24],
      ...GEE_VERSE,
      ["gee-shy", 16],
      ["gee-groove", 16],
      ...GEE_CHORUS,
      ["gee-groove", 4, 5],
      ...GEE_VERSE,
      ["gee-shy", 16],
      ["gee-groove", 16],
      ...GEE_CHORUS,
      // the slow bridge ("말도 못했는걸…"), then the chorus twice
      ["gee-shy", 32],
      ...GEE_CHORUS,
      ...GEE_CHORUS,
    ],
    difficulty: "easy",
  },
  {
    id: "song-hai-cao-wu",
    title_zh: "海草舞",
    title_en: "Hai Cao Wu (Seaweed Dance)",
    artist_zh: "萧全",
    artist_en: "Sammy Chan",
    videoId: "McfyHbZOO5I",
    // (an upload of the full video, not the artist's own: there is none. Its lines fall on the
    // video's 8-counts from beat 16, "像一棵海草…")
    bpm: 128,
    firstBeatMs: 7696,
    aligned: true,
    beats: 568,
    dance: [
      ["hc-seaweed", 32],
      ...HC_CHORUS,
      // the rap, then "你我都是这茫茫人海中…"
      ["hc-bounce", 64],
      ["hc-hero", 64],
      ...HC_CHORUS,
      ["hc-seaweed", 32],
      ["hc-bounce", 64],
      ["hc-hero", 64],
      ...HC_CHORUS,
      // "亲爱的你 就在这里", the seaweed to the end
      ["hc-where", 16],
      ["hc-seaweed", 40],
    ],
    difficulty: "easy",
  },
  {
    id: "song-gokuraku-jodo",
    title_zh: "極楽浄土（极乐净土）",
    title_en: "Gokuraku Jodo",
    artist_zh: "GARNiDELiA",
    artist_en: "GARNiDELiA",
    // (the band's own dance video, みうめ's choreography that everyone dances: its subtitles time the
    // lines; the dance from the video's beat 40, the verses on 72 and 200, the choruses on 136, 264
    // and, after the bridge's extra half phrase, 396)
    videoId: "BEULybZnLO8",
    bpm: 131,
    firstBeatMs: 18556,
    aligned: true,
    beats: 428,
    dance: [
      ["gj-sway", 32],
      ...GJ_VERSE,
      ...GJ_CHORUS,
      ["gj-sway", 32],
      ...GJ_VERSE,
      ...GJ_CHORUS,
      // the bridge: the dance break, then half a phrase
      ["gj-sway", 32],
      ["gj-dance", 32],
      ["gj-sway", 4, 5],
      // "（ちょいと「いいこと」…）", "ゆきましょう 極楽浄土", the last chorus with its extra line, the end
      ["gj-peek", 8],
      ["gj-sway", 8],
      ["gj-peek", 8],
      ["gj-beckon", 8],
      ...GJ_CHORUS,
      ["gj-bloom", 8],
      ["gj-sway", 32],
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
    // (114 BPM from 0.04 s; the video opens with a scene of its own, the song from its beat 48)
    bpm: 114,
    firstBeatMs: 25303,
    beats: 368,
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
    // (126 BPM from 0.123 s, the dance from its beat 8 to the full stop at beat 400; the video's
    // ending after it is off that grid)
    bpm: 126,
    firstBeatMs: 3933,
    beats: 392,
    pattern: [["march-clap", 2], ["forward-push", 2], ["side-wave", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-levitating",
    title_zh: "Levitating",
    title_en: "Levitating",
    artist_zh: "Dua Lipa",
    artist_en: "Dua Lipa",
    videoId: "TUVcZfQe-Kw",
    // (103 BPM from 0.559 s, the dance from its beat 8 to the stop at beat 344; the video's ending
    // after it is off that grid)
    bpm: 103,
    firstBeatMs: 5219,
    beats: 336,
    pattern: [["side-wave", 2], ["side-step-touch", 2], ["alternating-reach", 2], ["clap-2x", 2]],
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
    // (127 BPM from 0.288 s, the dance from its beat 40, where the drums come in, to the fade)
    bpm: 127,
    firstBeatMs: 19186,
    beats: 392,
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
    // (115 BPM from 0.28 s, the dance from the first verse, its beat 16, to the song's end)
    bpm: 115,
    firstBeatMs: 8628,
    beats: 496,
    pattern: [["march-clap", 2], ["side-step-touch", 2], ["forward-push", 2], ["clap-2x", 2]],
    difficulty: "easy",
  },
  {
    id: "song-cant-stop-the-feeling",
    title_zh: "CAN'T STOP THE FEELING!",
    title_en: "CAN'T STOP THE FEELING!",
    artist_zh: "贾斯汀 Justin Timberlake",
    artist_en: "Justin Timberlake",
    videoId: "ru0K8uYEZWw",
    // (113 BPM from 0.432 s, the dance from its beat 16 to just before the stop at beat 446; the
    // video's last part after it is off that grid)
    bpm: 113,
    firstBeatMs: 8928,
    beats: 424,
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
