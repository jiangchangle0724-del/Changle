/**
 * 作曲（11-13）：一首曲子（`themes.ts`）+ 第几小节第几格 + 各层多响 → 这一格要弹哪些音。
 * 纯函数，不碰声音：`music.ts` 每一格问一次，按这里给的音去弹；测试直接查。
 *
 * 紧张（0–1，`tension.ts` 算的）怎么变成音乐：
 * - 0.1 左右（大厅、结算）：只有铺底和慢的琶音。
 * - 0.3–0.45（平常在爬）：加低音和旋律，鼓刚开始进。
 * - 0.55 以上：整套鼓；速度从这里开始往上提，到 1 时是曲子最快的速度。
 * - 0.75 以上（危机）：鼓变密、加镲和通鼓，低音变急，琶音变成轮指（一格弹两下），旋律高八度叠一层。
 */
import type { Drum, Theme } from './themes';

export type Part = 'lead' | 'arp' | 'bass' | 'pad' | Drum;
export const PARTS: Part[] = ['lead', 'arp', 'bass', 'pad', 'kick', 'snare', 'hat', 'perc', 'cym', 'tom'];
export const DRUMS: Drum[] = ['kick', 'snare', 'hat', 'perc', 'cym', 'tom'];

export interface Note {
  part: Part;
  /** MIDI 音高（鼓没有；铺底是 `chord`）。 */
  midi?: number;
  /** 铺底的和弦（MIDI 音高）。 */
  chord?: number[];
  /** 力度 0–1。 */
  vel: number;
  /** 多长（几格）。 */
  steps: number;
  /** 古筝的滑音：从下面滑上来（长音才滑）。 */
  slide?: boolean;
  /** 一格里弹几下（琵琶的轮指）。 */
  repeat?: number;
}

/** 各层多响（0–1）。 */
export interface Layers {
  pad: number;
  arp: number;
  bass: number;
  lead: number;
  /** 平常的鼓。 */
  groove: number;
  /** 危机：鼓变密、轮指、旋律叠高八度。 */
  crisis: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function layersFor(i: number): Layers {
  return {
    pad: 1 - 0.3 * smooth(0.7, 1, i),
    arp: 0.45 + 0.55 * smooth(0.05, 0.3, i),
    bass: smooth(0.2, 0.35, i),
    lead: smooth(0.25, 0.4, i),
    groove: smooth(0.38, 0.55, i),
    crisis: smooth(0.72, 0.88, i),
  };
}

/** 紧张 → 每分钟几拍：0.55 以下是平常的速度，到 1 时是这首曲子最快的速度。 */
export function bpmFor(theme: Theme, i: number): number {
  return theme.bpm[0] + (theme.bpm[1] - theme.bpm[0]) * smooth(0.55, 1, i);
}

/** 十六格的段落顺序（两小节一段，八段一轮）：A B A C A B D B 的样子，每关从不同的段开始。 */
const FORM = [0, 1, 0, 2, 0, 1, 3, 1];
export function phraseAt(theme: Theme, bar: number, seed: number): number {
  const n = theme.melody.length;
  return ((FORM[Math.floor(bar / 2) % FORM.length] as number) + seed) % n;
}

/** 每关调高调低一点：0、升两个半音、降两个半音。 */
export function transposeOf(seed: number): number {
  return [0, 2, -2][seed % 3] as number;
}

/** 音阶第 d 个音（可以是负的，低八度）→ MIDI。 */
export function degreeMidi(theme: Theme, d: number, transpose = 0): number {
  const n = theme.scale.length;
  const oct = Math.floor(d / n);
  return theme.root + transpose + (theme.scale[d - oct * n] as number) + 12 * oct;
}

/** 旋律一个字 → 音阶第几个音（`0`–`9`，`a`–`e` 是低八度的 0–4）；不是音就是 null。 */
export function degreeOf(ch: string): number | null {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'a' && ch <= 'e') return ch.charCodeAt(0) - 97 - 5;
  return null;
}

/** 这一格往后连着几个 `-`（拉长到第几格，不过小节线）。 */
function held(bar: string, step: number): number {
  let n = 1;
  while (step + n < bar.length && bar[step + n] === '-') n++;
  return n;
}

const velOf = (ch: string | undefined): number => (ch === 'x' ? 1 : ch === 'o' ? 0.55 : 0);

/** 这一格要弹的音。 */
export function notesAt(theme: Theme, bar: number, step: number, layers: Layers, seed: number): Note[] {
  const out: Note[] = [];
  const tr = transposeOf(seed);
  const chord = theme.chords[bar % theme.chords.length] as Theme['chords'][number];
  const chordRoot = theme.root + tr + chord.root;
  const crisis = layers.crisis > 0.5;

  // 铺底：一小节一个和弦（根、三、五、七或八度），在主音下面那个八度
  if (step === 0 && layers.pad > 0.01) {
    const base = chordRoot - 12;
    out.push({ part: 'pad', chord: chord.tones.slice(0, 4).map((t) => base + t), vel: 1, steps: 16 });
  }

  // 琶音：平常四分音符，紧了八分音符，危机时每格轮指
  if (layers.arp > 0.01) {
    const pat = layers.groove > 0.5 ? theme.arp.groove : theme.arp.calm;
    const lift = theme.arpTone === 'kalimba' ? 12 : 0;
    if (crisis) {
      const k = [0, 2, 3, 2][step % 4] as number;
      out.push({ part: 'arp', midi: chordRoot - 12 + lift + (chord.tones[k] as number), vel: step % 4 === 0 ? 0.9 : 0.6, steps: 1, repeat: theme.arpTone === 'pipa' ? 2 : 1 });
    } else {
      const ch = pat[step % pat.length] as string;
      const k = degreeOf(ch);
      if (k !== null && k >= 0 && k < chord.tones.length) out.push({ part: 'arp', midi: chordRoot - 12 + lift + (chord.tones[k] as number), vel: step % 4 === 0 ? 0.85 : 0.6, steps: 2 });
    }
  }

  // 低音：根音、五度、高八度
  if (layers.bass > 0.01) {
    const pat = crisis ? theme.bass.crisis : theme.bass.groove;
    const ch = pat[step % pat.length];
    const off = ch === 'r' ? 0 : ch === 'f' ? 7 : ch === 'o' ? 12 : null;
    if (off !== null) out.push({ part: 'bass', midi: chordRoot - 24 + off, vel: step % 8 === 0 ? 1 : 0.75, steps: held(pat, step) });
  }

  // 旋律：两小节一段；危机时高八度叠一层
  if (layers.lead > 0.01) {
    const phrase = theme.melody[phraseAt(theme, bar, seed)] as [string, string];
    const line = phrase[bar % 2] as string;
    const d = degreeOf(line[step] as string);
    if (d !== null) {
      const midi = degreeMidi(theme, d, tr);
      const steps = held(line, step);
      out.push({ part: 'lead', midi, vel: step % 4 === 0 ? 0.95 : 0.75, steps, slide: theme.lead === 'zheng' && steps >= 3 });
      if (crisis) out.push({ part: 'lead', midi: midi + 12, vel: 0.4, steps });
    }
  }

  // 鼓：平常的一套；危机时同一样鼓换成危机的节奏，只在危机里有的（镲、通鼓）跟着危机的响度
  if (layers.groove > 0.01 || layers.crisis > 0.01) {
    for (const drum of Object.keys({ ...theme.drums.groove, ...theme.drums.crisis }) as Drum[]) {
      const g = theme.drums.groove[drum];
      const c = theme.drums.crisis[drum];
      let vel = 0;
      if (c && (crisis || !g)) vel = velOf(c[step]) * (g ? 1 : layers.crisis);
      else if (g) vel = velOf(g[step]);
      if (vel > 0) out.push({ part: drum, vel, steps: 1 });
    }
  }
  return out;
}
