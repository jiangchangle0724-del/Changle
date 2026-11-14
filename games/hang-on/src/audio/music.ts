/**
 * 背景音乐（11-13 Steve：「每个不同的场景需要有不同的背景音乐，并且会根据玩家的游戏状态比如是否处于危机时刻及时调整音乐的节奏」）。
 * 全部 WebAudio 现场合成，没有音频文件：古筝、琵琶、马林巴、卡林巴是程序算出来的拨弦和敲击（第一次用到某个音时算一次存着），
 * 笙和合成器铺底是振荡器，鼓也是算出来的。曲子在 `themes.ts`，每一格弹什么在 `composer.ts`，多紧张在 `tension.ts`。
 *
 * 和音效用同一个 AudioContext，接在音效的总音量上（静音键一起管）；浏览器要点过一次页面才出声（`sfx.attach`）。
 * 排音：每 40 ms 往后排 0.18 秒的音（「两个时钟」的做法），速度和各层的响度每一格按当时的紧张算，所以变化不超过一拍就听得出来。
 * 只在开房那台设备上放（电视局是电视，手机局是房主的手机），别的手机不放。
 * 离线也能放（`OfflineAudioContext`）：`music.html` 的「导出」和检查脚本用同一套。
 */
import { bpmFor, DRUMS, layersFor, notesAt, PARTS, type Layers, type Note, type Part } from './composer';
import { THEMES, type Drum, type Kit, type Theme } from './themes';

export type MusicPhase = 'off' | 'lobby' | 'countdown' | 'playing' | 'won' | 'results';

/** 各声部的音量。 */
const VOL: Record<Part, number> = { lead: 0.24, arp: 0.14, bass: 0.28, pad: 0.035, kick: 0.46, snare: 0.2, hat: 0.1, perc: 0.16, cym: 0.14, tom: 0.24 };
/** 各声部送多少去混响。 */
const SEND: Partial<Record<Part, number>> = { lead: 0.3, arp: 0.28, pad: 0.45, snare: 0.18, perc: 0.16, cym: 0.35, tom: 0.12, hat: 0.08 };
/** 左右：旋律偏右、琶音偏左、镲偏右、木鱼偏左。 */
const PAN: Partial<Record<Part, number>> = { lead: 0.15, arp: -0.25, hat: 0.3, perc: -0.2, cym: 0.2, tom: -0.1 };
/** 每个阶段音乐多响、多紧张（玩的时候紧张由主机给）。 */
const PHASE_GAIN: Record<MusicPhase, number> = { off: 0, lobby: 0.5, countdown: 0.85, playing: 1, won: 1, results: 0.45 };
const CALM = 0.06;
const LOOKAHEAD = 0.18;

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- 算声音（纯 JS，算一次存成 AudioBuffer）

/**
 * 卡普拉斯-斯特朗拨弦：古筝、琵琶、低音弦。`bright` 越小越闷（拨弦的噪声先过一个低通）。
 * 一圈 = N 格延迟 + 平均（半格）+ 一个全通滤波（补小数，Jaffe–Smith 的做法），高音也准。
 */
export function pluck(sr: number, freq: number, seconds: number, t60: number, bright: number, rnd: () => number = Math.random): Float32Array {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const P = sr / freq;
  const N = Math.max(2, Math.floor(P - 0.6));
  const d = P - 0.5 - N;
  const C = (1 - d) / (1 + d);
  const size = N + 2;
  const ring = new Float32Array(size);
  // 拨的那一下：N 格白噪声过一个低通，去掉直流
  const hit = new Float32Array(N);
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    lp += bright * (rnd() * 2 - 1 - lp);
    hit[i] = lp;
    mean += lp;
  }
  mean /= N;
  const g = Math.pow(0.001, 1 / (freq * t60));
  let w = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[(w - N + size) % size] as number;
    const b = ring[(w - N - 1 + size) % size] as number;
    const u = 0.5 * (a + b);
    const v = C * u + apIn - C * apOut;
    apIn = u;
    apOut = v;
    const y = (i < N ? (hit[i] as number) - mean : 0) + g * v;
    ring[w] = y;
    out[i] = y;
    w = w + 1 === size ? 0 : w + 1;
  }
  return out;
}

/** 几个正弦的泛音各自衰减：马林巴、卡林巴、圆的低音；`click` 是敲下去那一下的噪声。 */
export function partials(sr: number, freq: number, seconds: number, parts: [ratio: number, amp: number, t60: number][], click = 0, rnd: () => number = Math.random): Float32Array {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  for (const [r, a, t60] of parts) {
    const f = freq * r;
    if (f > sr * 0.45) continue;
    const w = (2 * Math.PI * f) / sr;
    const k = Math.pow(0.001, 1 / (t60 * sr));
    let env = a;
    for (let i = 0; i < n; i++) {
      out[i] = (out[i] as number) + env * Math.sin(w * i);
      env *= k;
    }
  }
  const cn = Math.floor(sr * 0.004);
  for (let i = 0; i < cn && i < n; i++) out[i] = (out[i] as number) + click * (rnd() * 2 - 1) * (1 - i / cn);
  return out;
}

/** 一个 RBJ 双二阶滤波器（低通、高通、带通），给噪声做形状。 */
function biquad(kind: 'lp' | 'hp' | 'bp', f: number, q: number, sr: number): (x: number) => number {
  const w = (2 * Math.PI * f) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (kind === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (kind === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** 扫频的正弦（底鼓、大鼓、通鼓）：从 f0 滑到 f1，`sweep` 秒滑完大半。 */
function drumTone(sr: number, seconds: number, f0: number, f1: number, sweep: number, t60: number): Float32Array {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  let ph = 0;
  const k = Math.pow(0.001, 1 / (t60 * sr));
  let env = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t / sweep))) / sr;
    out[i] = Math.sin(ph) * env;
    env *= k;
  }
  return out;
}

/** 加一段滤过的噪声。 */
function addNoise(out: Float32Array, sr: number, amp: number, t60: number, filter: ((x: number) => number) | null, at = 0, attack = 0.001, rnd: () => number = Math.random): void {
  const k = Math.pow(0.001, 1 / (t60 * sr));
  let env = amp;
  const a = Math.max(1, Math.floor(attack * sr));
  for (let i = Math.floor(at * sr); i < out.length; i++) {
    const j = i - Math.floor(at * sr);
    const x = rnd() * 2 - 1;
    const y = filter ? filter(x) : x;
    out[i] = (out[i] as number) + y * env * Math.min(1, j / a);
    if (j >= a) env *= k;
    if (env < 1e-4) break;
  }
}

/** 一组不成谐波的金属泛音（镲、锣）；`bend` 是锣敲下去以后音往上走多少（戏曲里的小锣）。 */
function metal(out: Float32Array, sr: number, base: number, ratios: number[], amp: number, t60: number, bend = 0): void {
  ratios.forEach((r, j) => {
    let ph = Math.random() * 6.28;
    const k = Math.pow(0.001, 1 / (t60 * (1 - j * 0.08) * sr));
    let env = amp / (1 + j * 0.35);
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      const f = base * r * (1 + bend * (1 - Math.exp(-t / 0.12)));
      ph += (2 * Math.PI * f) / sr;
      out[i] = (out[i] as number) + Math.sin(ph) * env;
      env *= k;
    }
  });
}

function normalize(d: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (const v of d) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] = ((d[i] as number) / m) * peak;
  // 头尾各淡一点，免得咔一声
  const fade = Math.min(d.length, 64);
  for (let i = 0; i < fade; i++) d[d.length - 1 - i] = (d[d.length - 1 - i] as number) * (i / fade);
  return d;
}

/** 一样鼓（按鼓组）。 */
export function drumSamples(sr: number, kit: Kit, drum: Drum): Float32Array {
  const cny = kit === 'cny';
  switch (drum) {
    case 'kick': {
      // 年夜饭桌是大鼓（低、长、带皮的声音）；海湾是电子底鼓
      const d = cny ? drumTone(sr, 0.9, 120, 58, 0.14, 0.85) : drumTone(sr, 0.5, 150, 46, 0.09, 0.38);
      addNoise(d, sr, cny ? 0.35 : 0.25, cny ? 0.12 : 0.02, biquad('lp', cny ? 400 : 3000, 0.7, sr));
      return normalize(d);
    }
    case 'snare': {
      const d = new Float32Array(Math.floor(sr * 0.3));
      if (cny) {
        // 板：竹板一拍，又短又脆
        addNoise(d, sr, 1, 0.07, biquad('bp', 2600, 2.5, sr));
        metal(d, sr, 1800, [1, 1.6], 0.4, 0.05);
      } else {
        // 拍手：三下挨得很近，再一个尾巴
        for (const at of [0, 0.011, 0.023]) addNoise(d, sr, 0.8, 0.03, biquad('bp', 1300, 1.2, sr), at);
        addNoise(d, sr, 0.5, 0.2, biquad('bp', 1200, 0.9, sr), 0.03);
      }
      return normalize(d);
    }
    case 'hat': {
      const d = new Float32Array(Math.floor(sr * 0.25));
      if (cny) {
        // 小镲
        metal(d, sr, 3150, [1, 1.34, 1.72, 2.11, 2.57], 0.5, 0.2);
        addNoise(d, sr, 0.4, 0.1, biquad('hp', 6000, 0.7, sr));
      } else {
        // 沙锤：慢慢起、很快收
        addNoise(d, sr, 1, 0.08, biquad('bp', 7000, 1.4, sr), 0, 0.012);
      }
      return normalize(d);
    }
    case 'perc': {
      const d = new Float32Array(Math.floor(sr * 0.2));
      if (cny) {
        // 木鱼
        metal(d, sr, 820, [1, 2.62], 1, 0.09);
        addNoise(d, sr, 0.3, 0.01, biquad('bp', 3000, 1, sr));
      } else {
        // 边击
        metal(d, sr, 1750, [1, 1.47], 0.8, 0.035);
        addNoise(d, sr, 0.5, 0.025, biquad('bp', 3200, 1.5, sr));
      }
      return normalize(d);
    }
    case 'cym': {
      if (cny) {
        // 锣：敲下去音往上走一点（戏曲里的小锣）
        const d = new Float32Array(Math.floor(sr * 2.6));
        metal(d, sr, 260, [1, 1.33, 1.71, 2.21, 2.75, 3.4], 0.6, 2.2, 0.05);
        addNoise(d, sr, 0.25, 0.08, biquad('bp', 1800, 0.8, sr));
        return normalize(d, 0.8);
      }
      // 吊镲
      const d = new Float32Array(Math.floor(sr * 1.8));
      addNoise(d, sr, 1, 1.4, biquad('hp', 5000, 0.6, sr));
      metal(d, sr, 3900, [1, 1.27, 1.53, 1.81], 0.25, 0.9);
      return normalize(d, 0.75);
    }
    case 'tom': {
      const d = cny ? drumTone(sr, 0.6, 190, 110, 0.07, 0.5) : drumTone(sr, 0.5, 170, 98, 0.08, 0.42);
      addNoise(d, sr, 0.2, 0.05, biquad('lp', 1500, 0.7, sr));
      return normalize(d);
    }
  }
}

/** 一个有音高的乐器的一个音（开头 1.5 ms 淡入，拨弦不咔）。 */
export function toneSamples(sr: number, kind: 'zheng' | 'pipa' | 'marimba' | 'kalimba' | 'bass-cny' | 'bass-coast', midi: number): Float32Array {
  const d = rawTone(sr, kind, mtof(midi));
  const a = Math.floor(sr * 0.0015);
  for (let i = 0; i < a && i < d.length; i++) d[i] = (d[i] as number) * (i / a);
  return d;
}

function rawTone(sr: number, kind: 'zheng' | 'pipa' | 'marimba' | 'kalimba' | 'bass-cny' | 'bass-coast', f: number): Float32Array {
  switch (kind) {
    case 'zheng':
      return normalize(pluck(sr, f, 2.2, 2.4, 0.6));
    case 'pipa':
      return normalize(pluck(sr, f, 1.1, 0.9, 0.72));
    case 'marimba':
      return normalize(partials(sr, f, 1.5, [[1, 1, 1.3], [3.93, 0.28, 0.32], [9.2, 0.07, 0.09]], 0.12));
    case 'kalimba':
      return normalize(partials(sr, f, 1.6, [[1, 1, 1.6], [6.27, 0.16, 0.16]], 0.15));
    case 'bass-cny':
      return normalize(pluck(sr, f, 1.3, 1.1, 0.35));
    case 'bass-coast':
      return normalize(partials(sr, f, 1.1, [[1, 1, 0.8], [2, 0.3, 0.4], [3, 0.08, 0.2]], 0.05));
  }
}

/** 混响的冲激响应：两个声道各一段越来越暗的噪声，2.4 秒。 */
function impulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 2.4);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const pre = Math.floor(sr * 0.015);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const k = 0.5 * Math.exp(-t * 1.6) + 0.05;
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp((-t * 6.9) / 1.9);
    }
  }
  return buf;
}

// ---------------------------------------------------------------- 放

export class Music {
  private ctx: BaseAudioContext | null = null;
  private out: GainNode | null = null;
  private buses = new Map<Part, GainNode>();
  private busLevel = new Map<Part, number>();
  private cache = new Map<string, AudioBuffer>();
  private theme: Theme = THEMES.table as Theme;
  private nextTheme: Theme | null = null;
  private seed = 0;
  private nextSeed = 0;
  private bar = 0;
  private step = 0;
  private nextAt = 0;
  private phase_: MusicPhase = 'off';
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Array<'flourish' | 'win'> = [];
  /** 离线放的时候「现在」是几秒（`render` 一段一段往前拨）。 */
  private virtualNow: number | null = null;
  /** 玩的时候主机每帧给（`tension.ts` 算的，0–1）。 */
  intensity = CALM;

  /** 接上一个 AudioContext（主机页用音效那个，离线用 OfflineAudioContext）；`dest` 是接到哪（音效的总音量）。 */
  connect(ctx: BaseAudioContext, dest: AudioNode): void {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.cache.clear();
    const out = ctx.createGain();
    out.gain.value = 0;
    // 去掉 35 Hz 以下的闷响，5 kHz 以上压一点，不刺耳
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 35;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 5000;
    shelf.gain.value = -5;
    out.connect(hp).connect(shelf).connect(dest);
    this.out = out;
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx);
    reverb.connect(out);
    this.buses.clear();
    this.busLevel.clear();
    for (const part of PARTS) {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      const pan = PAN[part];
      let tail: AudioNode = bus;
      if (pan && 'createStereoPanner' in ctx) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        bus.connect(p);
        tail = p;
      }
      tail.connect(out);
      const send = SEND[part];
      if (send) {
        const s = ctx.createGain();
        s.gain.value = send;
        tail.connect(s).connect(reverb);
      }
      this.buses.set(part, bus);
      this.busLevel.set(part, 0);
    }
    this.applyPhaseGain(0.05);
  }

  get phase(): MusicPhase {
    return this.phase_;
  }

  get themeId(): string {
    return this.theme.id;
  }

  /** 换曲子（换关、换难度）：没在放就马上换，在放就等这一小节完。 */
  scene(theme: Theme, seed: number): void {
    if (theme === this.theme && seed === this.seed && !this.nextTheme) return;
    if (this.phase_ === 'off' || !this.ctx) {
      this.theme = theme;
      this.seed = seed;
      return;
    }
    this.nextTheme = theme;
    this.nextSeed = seed;
  }

  /** 换阶段：大厅、倒数（从头开始）、玩、过关（收尾）、结算、关。 */
  setPhase(p: MusicPhase): void {
    const prev = this.phase_;
    if (p === prev) return;
    this.phase_ = p;
    if (p === 'countdown' || ((p === 'lobby' || p === 'results') && (prev === 'off' || prev === 'won'))) this.restart();
    if (p === 'lobby' || p === 'results' || p === 'countdown') this.intensity = p === 'countdown' ? 0.15 : CALM;
    if (p !== 'won') this.applyPhaseGain(p === 'countdown' ? 0.4 : 0.6);
  }

  /** 过了检查点：下一拍旋律往上走三个音。 */
  flourish(): void {
    if (this.phase_ === 'playing') this.pending.push('flourish');
  }

  /** 过关：下一拍弹一个主和弦、敲一下锣（镲），然后收掉。 */
  win(): void {
    if (this.phase_ !== 'playing' && this.phase_ !== 'countdown') return;
    this.pending.push('win');
  }

  /** 有人摔死、出局：音乐让一下，叫声听得清。 */
  duck(): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || this.phase_ !== 'playing') return;
    const t = this.now();
    const g = PHASE_GAIN.playing;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(g * 0.45, t, 0.03);
    out.gain.setTargetAtTime(g, t + 0.35, 0.5);
  }

  // ---- 主机页用：跟着音效的 AudioContext 走，自己排音

  /** 挂到音效上：音效的 AudioContext 有了、跑起来了就接上，之后每 40 ms 排一次音；页面藏起来时停。 */
  attach(get: () => { ctx: AudioContext; bus: AudioNode } | null): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const a = get();
      if (!a || a.ctx.state !== 'running') return;
      if (this.ctx !== a.ctx) this.connect(a.ctx, a.bus);
      if (typeof document !== 'undefined' && document.hidden) return;
      this.pump(a.ctx.currentTime, a.ctx.currentTime + LOOKAHEAD);
    }, 40);
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        // 回来时从下一小节重新起，别一下子补一堆音
        if (!document.hidden && this.ctx) this.nextAt = this.now() + 0.05;
      });
  }

  /** 离线放一段（`OfflineAudioContext`）：`curve(秒)` 给每一刻的紧张，`events` 在第几秒发生什么。 */
  render(seconds: number, curve: (t: number) => number, events: { t: number; do: 'flourish' | 'win' | 'duck' }[] = []): void {
    const queue = [...events].sort((a, b) => a.t - b.t);
    for (let t = 0; t < seconds; t += 0.04) {
      this.virtualNow = t;
      this.intensity = curve(t);
      while (queue.length && (queue[0] as { t: number }).t <= t) {
        const e = queue.shift() as (typeof queue)[number];
        if (e.do === 'duck') this.duck();
        else if (e.do === 'win') this.win();
        else this.flourish();
      }
      this.pump(t, t + LOOKAHEAD);
    }
    this.virtualNow = null;
  }

  // ---------------------------------------------------------------- 排音

  private now(): number {
    return this.virtualNow ?? this.ctx?.currentTime ?? 0;
  }

  private restart(): void {
    this.bar = 0;
    this.step = 0;
    this.nextAt = this.now() + 0.08;
    if (this.nextTheme) {
      this.theme = this.nextTheme;
      this.seed = this.nextSeed;
      this.nextTheme = null;
    }
  }

  private applyPhaseGain(tc: number): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    const t = this.now();
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(PHASE_GAIN[this.phase_], t, tc);
  }

  /** 把 `until` 之前该响的格子都排上。 */
  pump(now: number, until: number): void {
    if (!this.ctx || this.phase_ === 'off' || this.phase_ === 'won') return;
    // 掉了队（卡了一下、页面刚回来）：从现在接着，不补
    if (this.nextAt < now - 0.05) this.nextAt = now + 0.02;
    while (this.nextAt < until) {
      if (this.step === 0 && this.nextTheme) {
        this.theme = this.nextTheme;
        this.seed = this.nextSeed;
        this.nextTheme = null;
        this.bar = 0;
      }
      const at = this.nextAt;
      const i = this.phase_ === 'playing' ? this.intensity : this.phase_ === 'countdown' ? 0.15 : CALM;
      const layers = layersFor(i);
      const bpm = bpmFor(this.theme, i);
      const base = 60 / bpm / 4;
      const sw = this.theme.swing ?? 0;
      const dur = base * (this.step % 2 === 0 ? 1 + sw : 1 - sw);
      this.levels(layers, at);
      // 过关、检查点：等到拍子上
      if (this.pending.length && this.step % 4 === 0) {
        const what = this.pending.shift();
        if (what === 'win') {
          this.finale(at, base);
          return;
        }
        this.run(at, base);
      }
      for (const n of notesAt(this.theme, this.bar, this.step, layers, this.seed)) this.play(n, at, base);
      this.nextAt += dur;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  /** 各声部的响度跟着各层走（慢慢变，不跳）。 */
  private levels(l: Layers, at: number): void {
    for (const part of PARTS) {
      const w = part === 'pad' ? l.pad : part === 'arp' ? l.arp : part === 'bass' ? l.bass : part === 'lead' ? l.lead : part === 'cym' || part === 'tom' ? Math.max(l.groove, l.crisis) : l.groove;
      const target = VOL[part] * w;
      if (Math.abs(target - (this.busLevel.get(part) ?? 0)) < 0.004) continue;
      this.busLevel.set(part, target);
      this.buses.get(part)?.gain.setTargetAtTime(target, at, 0.25);
    }
  }

  private play(n: Note, at: number, stepDur: number): void {
    if (n.part === 'pad') {
      this.pad(n.chord ?? [], at, stepDur * n.steps);
      return;
    }
    const buf = this.buffer(n.part, n.midi);
    if (!buf) return;
    const hits = n.repeat ?? 1;
    for (let k = 0; k < hits; k++) {
      const t = at + (k * stepDur) / hits;
      // 旋律、琶音的长度：拨完了自然衰减；短音稍微收一下，免得糊
      const hold = n.part === 'lead' || n.part === 'arp' || n.part === 'bass' ? stepDur * n.steps * 1.6 + 0.25 : 0;
      this.voice(n.part, buf, t, n.vel * (k ? 0.75 : 1), hold, n.slide);
    }
  }

  private voice(part: Part, buf: AudioBuffer, at: number, vel: number, hold: number, slide = false): void {
    const ctx = this.ctx as BaseAudioContext;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (slide) {
      // 古筝的滑音：从低两个半音滑上来
      src.playbackRate.setValueAtTime(0.89, at);
      src.playbackRate.exponentialRampToValueAtTime(1, at + 0.09);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, at);
    let end = at + buf.duration;
    if (hold && hold < buf.duration) {
      g.gain.setTargetAtTime(0, at + hold, 0.12);
      end = at + hold + 0.6;
    }
    src.connect(g).connect(this.buses.get(part) as GainNode);
    src.start(at);
    src.stop(end);
  }

  /** 铺底：笙（锯齿过低通，轻轻颤）或者暖的合成器（两个锯齿错一点音过低通，越紧张越亮）。 */
  private pad(chord: number[], at: number, dur: number): void {
    const ctx = this.ctx as BaseAudioContext;
    const sheng = this.theme.pad === 'sheng';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sheng ? 1300 : 900 + 900 * this.intensity;
    filter.Q.value = sheng ? 1.2 : 0.4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.35);
    env.gain.setValueAtTime(1, at + dur);
    env.gain.setTargetAtTime(0, at + dur, 0.35);
    filter.connect(env).connect(this.buses.get('pad') as GainNode);
    let lfo: OscillatorNode | null = null;
    let depth: GainNode | null = null;
    if (sheng) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      depth = ctx.createGain();
      depth.gain.value = 9;
      lfo.connect(depth);
      lfo.start(at);
      lfo.stop(at + dur + 1.6);
    }
    for (const m of chord) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        if (depth) depth.connect(o.detune);
        o.connect(filter);
        o.start(at);
        o.stop(at + dur + 1.6);
      }
    }
  }

  /** 检查点：旋律从和弦的根音往上走三个音（八分音符）。 */
  private run(at: number, stepDur: number): void {
    const chord = this.theme.chords[this.bar % this.theme.chords.length] as Theme['chords'][number];
    const root = this.theme.root + chord.root + 12;
    [0, 2, 3].forEach((k, j) => {
      const buf = this.buffer('lead', root + (chord.tones[k] as number));
      if (buf) this.voice('lead', buf, at + j * stepDur * 2, 0.7, stepDur * 4);
    });
  }

  /** 过关：主和弦扫一下，敲一下锣（镲），其余的收掉。 */
  private finale(at: number, stepDur: number): void {
    const root = this.theme.root;
    const tones = [0, 4, 7, 12].map((t) => root + (this.theme.scale.includes(3) ? (t === 4 ? 3 : t) : t));
    tones.forEach((m, j) => {
      const buf = this.buffer('lead', m);
      if (buf) this.voice('lead', buf, at + j * 0.035, 0.9, 1.6);
    });
    const cym = this.buffer('cym');
    if (cym) this.voice('cym', cym, at, 1, 0);
    this.buses.get('cym')?.gain.setTargetAtTime(VOL.cym, at, 0.02);
    this.phase_ = 'won';
    const out = this.out;
    if (out) {
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(PHASE_GAIN.playing, at);
      out.gain.setTargetAtTime(0, at + stepDur * 8, 0.5);
    }
  }

  /** 这个声部、这个音的样本（第一次用到时算）。 */
  private buffer(part: Part, midi?: number): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const t = this.theme;
    const kind =
      part === 'lead' ? t.lead : part === 'arp' ? t.arpTone : part === 'bass' ? (t.kit === 'cny' ? 'bass-cny' : 'bass-coast') : (DRUMS as Part[]).includes(part) ? `${t.kit}` : null;
    if (!kind) return null;
    const key = `${kind}:${part}:${midi ?? ''}`;
    let buf = this.cache.get(key);
    if (!buf) {
      const data =
        midi === undefined
          ? drumSamples(ctx.sampleRate, t.kit, part as Drum)
          : toneSamples(ctx.sampleRate, kind as 'zheng' | 'pipa' | 'marimba' | 'kalimba' | 'bass-cny' | 'bass-coast', midi);
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      this.cache.set(key, buf);
    }
    return buf;
  }
}

/** 主机页的那一份。 */
export const music = new Music();
