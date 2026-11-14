/**
 * 背景音乐的曲子（11-13）：每个场景一首，全是现场合成（`music.ts`），没有音频文件，旋律都是自己写的。
 * 一首曲子 = 调、和弦（一小节一个，四小节一轮）、几段两小节的旋律、伴奏的节奏型、一套音色和鼓。
 * 难关（13 号往后）是同一个场景的小调版：同样的乐器，更暗、更快、鼓更多。坐不住用小调版，一开始就紧一点。
 * 新场景（后厨、雪山缆车、老宅、太空站）做好时在这里加一首，`themeFor` 里接上。
 *
 * 写法：一小节 16 格（十六分音符）。
 * - 旋律：一格一个字。`0`–`9` 是音阶里第几个音（0 是主音，五声音阶里 5 是高八度的主音），`a`–`e` 是低八度的 0–4，
 *   `-` 接着上一个音拉长，`.` 不出声。
 * - 琶音：`0`–`4` 是和弦里第几个音（根、三、五、八度、八度上的三），`.` 不出声。
 * - 低音：`r` 根音、`f` 五度、`o` 高八度根音、`.` 不出声、`-` 拉长。
 * - 鼓：`x` 重、`o` 轻、`.` 不出声。
 */

export type LeadTone = 'zheng' | 'marimba';
export type ArpTone = 'pipa' | 'kalimba';
export type PadTone = 'sheng' | 'warm';
export type Kit = 'cny' | 'coast';

/** 鼓的几样：大鼓/底鼓、打板/拍手、镲/沙锤、木鱼/边击、锣/吊镲、通鼓。 */
export type Drum = 'kick' | 'snare' | 'hat' | 'perc' | 'cym' | 'tom';

export interface Theme {
  id: string;
  name: { zh: string; en: string };
  /** 平常和最紧张时每分钟几拍。 */
  bpm: [number, number];
  /** 主音（MIDI 音高，60 是中央 C）。 */
  root: number;
  /** 旋律用的音阶（半音，从主音算）。 */
  scale: number[];
  /** 四小节一轮的和弦：根音（从主音算的半音）和和弦音（从根音算）。 */
  chords: { root: number; tones: number[] }[];
  /** 旋律：两小节一段，每小节 16 格。 */
  melody: [string, string][];
  /** 琶音：平常、紧的时候（16 格，循环）。 */
  arp: { calm: string; groove: string };
  /** 低音（16 格）：平常、危机。 */
  bass: { groove: string; crisis: string };
  /** 鼓：平常有的（groove）和危机时加的（crisis）。 */
  drums: { groove: Partial<Record<Drum, string>>; crisis: Partial<Record<Drum, string>> };
  lead: LeadTone;
  arpTone: ArpTone;
  pad: PadTone;
  kit: Kit;
  /** 十六分音符的摇摆（0 不摇；0.12 是轻轻的）。 */
  swing?: number;
}

const PENTA_MAJOR = [0, 2, 4, 7, 9];
const PENTA_MINOR = [0, 3, 5, 7, 10];

/** 年夜饭桌：热闹，古筝领、琵琶弹、笙铺底，木鱼、大鼓、小镲；D 宫调（D E F# A B）。 */
const TABLE: Theme = {
  id: 'table',
  name: { zh: '年夜饭桌', en: 'New Year Dinner' },
  bpm: [104, 138],
  root: 62,
  scale: PENTA_MAJOR,
  // D | Bm | Em | A
  chords: [
    { root: 0, tones: [0, 4, 7, 12, 16] },
    { root: 9, tones: [0, 3, 7, 12, 15] },
    { root: 2, tones: [0, 3, 7, 12, 15] },
    { root: 7, tones: [0, 4, 7, 12, 16] },
  ],
  melody: [
    ['5.565.3.2.353--.', '4.3.2-3.1.2.3---'],
    ['5.565.3.2.356-5.', '6.5.3-2.1.210---'],
    ['7-6.5.678-7.6--.', '5.6.7.654-3.5---'],
    ['33.5.32.33.6.53.', '2.123.5.4-3-2-1.'],
  ],
  arp: { calm: '0...2...3...2...', groove: '0.2.3.2.4.2.3.2.' },
  bass: { groove: 'r.......f.......', crisis: 'r.r.f.r.r.r.f.o.' },
  drums: {
    groove: { kick: 'x.......x.......', perc: '..o...x...o...x.', snare: '....o.......o...' },
    crisis: { kick: 'x...x...x...x.x.', snare: '....x.......x.xo', hat: 'x.o.x.o.x.o.x.o.', cym: 'x...............' },
  },
  lead: 'zheng',
  arpTone: 'pipa',
  pad: 'sheng',
  kit: 'cny',
};

/** 年夜饭桌的难关：B 羽调（B D E F# A），一样的乐器，更暗更急。 */
const TABLE_HARD: Theme = {
  ...TABLE,
  id: 'table-hard',
  name: { zh: '年夜饭桌 · 难关', en: 'New Year Dinner · Hard' },
  bpm: [112, 150],
  root: 59,
  scale: PENTA_MINOR,
  // Bm | Bm | G | A
  chords: [
    { root: 0, tones: [0, 3, 7, 12, 15] },
    { root: 0, tones: [0, 3, 7, 12, 15] },
    { root: 8, tones: [0, 4, 7, 12, 16] },
    { root: 10, tones: [0, 4, 7, 12, 16] },
  ],
  melody: [
    ['5.5.4.5.3.4.2.3.', '1.2.3--.2.1.0--.'],
    ['55.67.654.5.3--.', '4.3.2.3.1.2.0---'],
    ['5.5.4.5.3.4.2.3.', '5.6.7--.6.5.4--.'],
    ['7.7.6.5.6.5.4.3.', '4.3.2.1.2.1.0---'],
  ],
  arp: { calm: '0...2...3...2...', groove: '0.2.3.2.0.2.3.2.' },
  bass: { groove: 'r...r...f...r...', crisis: 'r.r.r.r.f.f.r.o.' },
  drums: {
    groove: { kick: 'x.......x...x...', perc: '..o...x...o...x.', snare: '....o.......o...' },
    crisis: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x.xx', hat: 'xoxoxoxoxoxoxoxo', cym: 'x.......x.......', tom: '............x.x.' },
  },
};

/** 温哥华海湾：海风、轻松，马林巴领、卡林巴弹、暖的合成器铺底，沙锤、边击、轻底鼓；E 大调五声，轻轻摇摆。 */
const VAN: Theme = {
  id: 'van',
  name: { zh: '温哥华海湾', en: 'Vancouver Harbour' },
  bpm: [96, 128],
  root: 64,
  scale: PENTA_MAJOR,
  // Emaj7 | C#m7 | Amaj7 | Bsus
  chords: [
    { root: 0, tones: [0, 4, 7, 11, 16] },
    { root: 9, tones: [0, 3, 7, 10, 15] },
    { root: 5, tones: [0, 4, 7, 11, 16] },
    { root: 7, tones: [0, 5, 7, 10, 14] },
  ],
  melody: [
    ['3..5.43.2..3--..', '4..3.21.2---....'],
    ['5.45.7.54.3.4--.', '3.23.5.32.1.0---'],
    ['7..76.5.6..54.3.', '4--.3.453---....'],
    ['3..5.43.2..3-.5.', '6.5.4.3.2.1.0---'],
  ],
  arp: { calm: '0...3...2...4...', groove: '0.2.3..20..3.2.4' },
  bass: { groove: 'r..r..f.r..r..o.', crisis: 'r.rr.rf.r.rr.ro.' },
  drums: {
    groove: { kick: 'x.....x...x.....', perc: '....x.......x...', hat: 'xoooxoooxoooxooo' },
    crisis: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', tom: '............xxx.', cym: 'x...............' },
  },
  lead: 'marimba',
  arpTone: 'kalimba',
  pad: 'warm',
  kit: 'coast',
  swing: 0.12,
};

/** 温哥华海湾的难关：C# 小调五声，同样的乐器，夜里起风了。 */
const VAN_HARD: Theme = {
  ...VAN,
  id: 'van-hard',
  name: { zh: '温哥华海湾 · 难关', en: 'Vancouver Harbour · Hard' },
  bpm: [108, 144],
  root: 61,
  scale: PENTA_MINOR,
  // C#m | A | E | B
  chords: [
    { root: 0, tones: [0, 3, 7, 12, 15] },
    { root: 8, tones: [0, 4, 7, 12, 16] },
    { root: 3, tones: [0, 4, 7, 12, 16] },
    { root: 10, tones: [0, 4, 7, 12, 16] },
  ],
  melody: [
    ['0.3.4.3.0.3.5.4.', '3.2.1.2.0--.....'],
    ['5.7.8.7.5.4.3.4.', '5--.4.3.2--.0--.'],
    ['0.3.4.3.0.3.5.4.', '6.5.4.5.3--.....'],
    ['8.7.5.7.4.5.3.4.', '2.3.1.2.0---....'],
  ],
  arp: { calm: '0...2...3...2...', groove: '0.2.3.2.0.2.3.2.' },
  bass: { groove: 'r..r..r.f..f..o.', crisis: 'r.r.r.r.f.f.f.o.' },
  drums: {
    groove: { kick: 'x.....x...x.....', perc: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' },
    crisis: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', tom: '........x.x.xxx.', cym: 'x.......x.......' },
  },
  swing: 0.06,
};

export const THEMES: Record<string, Theme> = { table: TABLE, 'table-hard': TABLE_HARD, van: VAN, 'van-hard': VAN_HARD };

/** 这一关放哪首：按场景（world），难关和坐不住用小调版。没写的场景先用年夜饭桌。 */
export function themeFor(level: { world?: string; arena?: boolean }, hard: boolean): Theme {
  const world = level.world === 'van' ? 'van' : 'table';
  return THEMES[hard || level.arena ? `${world}-hard` : world] as Theme;
}

/** 每关的种子：同一首曲子，每关的旋律段落顺序不一样、调高一点或低一点。 */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
