/**
 * 音效（A3）：全部 WebAudio 现场合成，没有音频文件。抓、松、落地、摔死（每个人的尖叫音高不同）、
 * 掉进汤里、复活、检查点、弹簧、饼干碎、背叛（全场「哦——」）、召唤、过关、倒数。
 * 浏览器要用户点过一次才让出声：attach() 挂在第一次按键 / 点击上。静音记在 localStorage。
 */
import type { Voice } from '../look';
import type { Sim, SimEvent } from '../physics/world';

type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  /** 滑到哪个频率（Hz），不给就不滑。 */
  to?: number;
  wave?: Wave;
  dur: number;
  attack?: number;
  vol?: number;
  /** 颤音：深度（Hz）和速度（Hz）。 */
  vibrato?: [number, number];
  pan?: number;
  /** 低通截止（Hz），不给就不滤。 */
  lowpass?: number;
  delay?: number;
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number; to?: number };
  attack?: number;
  pan?: number;
  delay?: number;
}

const MUTE_KEY = 'hang-on:mute';
/** 每个玩家尖叫的基频：四个人四个嗓子。 */
const SCREAM_HZ = [520, 400, 640, 340];

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted_ = false;
  /** 世界坐标 → 左右声道（-1..1），主机按镜头给。 */
  panOf: ((x: number, y: number) => number) | null = null;
  private lastAt = new Map<string, number>();
  /** 每个玩家选的嗓子（主机按座位设）。 */
  private voices: Voice[] = [];

  constructor() {
    try {
      this.muted_ = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // 没有存储
    }
  }

  get muted(): boolean {
    return this.muted_;
  }

  set muted(v: boolean) {
    this.muted_ = v;
    try {
      localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      // 记不住就记不住
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVoice(player: number, voice: Voice): void {
    this.voices[player] = voice;
  }

  /** 手柄页换嗓子时试听一下（这一下点击本身就开了声音）。 */
  async previewVoice(voice: Voice, player = 0): Promise<void> {
    await this.unlock();
    if (!this.ready || this.muted_) return;
    this.screamAs(voice, player, 0);
  }

  /** 第一次按键 / 点击时开声音。 */
  attach(target: Document | HTMLElement): void {
    const unlock = (): void => {
      void this.unlock();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) target.addEventListener(type, unlock, { passive: true });
  }

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const w = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AC = typeof AudioContext !== 'undefined' ? AudioContext : w.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted_ ? 0 : 0.8;
      this.master = master;
      // 总线上压一下，几个人同时尖叫也不破
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // 还没点过
      }
    }
  }

  // ---------------------------------------------------------------- 事件 → 声音

  handleEvents(sim: Sim, events: readonly SimEvent[]): void {
    if (!this.ready || this.muted_) return;
    for (const ev of events) {
      switch (ev.type) {
        case 'grab': {
          const pan = this.pan(ev.x, ev.y);
          if (!this.throttle(`grab${ev.player}`, 0.06)) break;
          if (ev.kind === 'rope') this.tone({ freq: 300, to: 210, wave: 'triangle', dur: 0.16, vol: 0.35, pan });
          else if (ev.kind === 'player') this.tone({ freq: 640, to: 900, wave: 'sine', dur: 0.1, vol: 0.3, pan });
          else if (ev.kind === 'prop') this.tone({ freq: 150, wave: 'square', dur: 0.06, vol: 0.18, pan, lowpass: 600 });
          else {
            this.tone({ freq: 190, to: 150, wave: 'sine', dur: 0.08, vol: 0.4, pan });
            this.noise({ dur: 0.04, vol: 0.18, filter: { type: 'highpass', freq: 2500 }, pan });
          }
          break;
        }
        case 'release':
          if (this.throttle(`rel${ev.player}`, 0.08)) this.tone({ freq: 520, to: 240, wave: 'sine', dur: 0.07, vol: 0.2, pan: this.pan(ev.x, ev.y) });
          break;
        case 'land': {
          const p = sim.players[ev.player];
          const pan = p ? this.pan(p.body.x, p.body.y) : 0;
          const v = Math.min(1, ev.speed / 1200);
          this.tone({ freq: 95, to: 60, wave: 'sine', dur: 0.12, vol: 0.25 + 0.45 * v, pan });
          this.noise({ dur: 0.06, vol: 0.12 + 0.2 * v, filter: { type: 'lowpass', freq: 900 }, pan });
          break;
        }
        case 'death':
          this.scream(ev.player, this.pan(ev.x, ev.y));
          this.splash(this.pan(ev.x, ev.y), sim.level.world !== 'van');
          break;
        case 'respawn': {
          const p = sim.players[ev.player];
          const pan = p ? this.pan(p.body.x, p.body.y) : 0;
          if (ev.summoned) {
            this.tone({ freq: 700, to: 1100, wave: 'sine', dur: 0.08, vol: 0.25, pan });
            this.tone({ freq: 900, to: 1400, wave: 'sine', dur: 0.1, vol: 0.25, pan, delay: 0.09 });
          } else {
            this.tone({ freq: 260, to: 620, wave: 'sine', dur: 0.26, vol: 0.3, pan, vibrato: [12, 9] });
            this.tone({ freq: 120, to: 70, wave: 'sine', dur: 0.1, vol: 0.3, pan, delay: 0.42 });
          }
          break;
        }
        case 'checkpoint':
          this.tone({ freq: 659, wave: 'sine', dur: 0.22, vol: 0.3 });
          this.tone({ freq: 880, wave: 'sine', dur: 0.4, vol: 0.3, delay: 0.12 });
          this.tone({ freq: 1319, wave: 'triangle', dur: 0.5, vol: 0.12, delay: 0.12 });
          break;
        case 'bounce': {
          const s = sim.springs[ev.spring];
          const pan = s ? this.pan(s.x, s.y) : 0;
          this.tone({ freq: 180, to: 760, wave: 'triangle', dur: 0.22, vol: 0.35, pan, vibrato: [30, 18] });
          break;
        }
        case 'fade': {
          const f = sim.fadings[ev.index];
          const pan = f ? this.pan(f.x, f.y) : 0;
          if (ev.on) this.tone({ freq: 420, to: 520, wave: 'sine', dur: 0.08, vol: 0.15, pan });
          else for (let k = 0; k < 4; k++) this.noise({ dur: 0.07, vol: 0.22, filter: { type: 'lowpass', freq: 1400 - k * 250 }, pan, delay: k * 0.05 });
          break;
        }
        case 'betrayal':
          this.ooh();
          break;
        case 'win':
          this.fanfare();
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------- 具体的声音

  /** 倒数：3、2、1 一声，开始一声高的。 */
  countdown(n: number): void {
    if (!this.ready || this.muted_) return;
    if (n > 0) this.tone({ freq: 880, wave: 'sine', dur: 0.08, vol: 0.25 });
    else {
      this.tone({ freq: 1320, wave: 'sine', dur: 0.3, vol: 0.3 });
      this.tone({ freq: 1760, wave: 'triangle', dur: 0.3, vol: 0.1 });
    }
  }

  /** 界面的小声。 */
  tick(): void {
    if (!this.ready || this.muted_) return;
    this.tone({ freq: 1200, to: 900, wave: 'sine', dur: 0.04, vol: 0.12 });
  }

  /** 尖叫：按这个人选的嗓子叫；默认按座位分四个音高。 */
  private scream(player: number, pan: number): void {
    this.screamAs(this.voices[player] ?? 'auto', player, pan);
  }

  private screamAs(voice: Voice, player: number, pan: number): void {
    const seat = SCREAM_HZ[player % SCREAM_HZ.length] as number;
    switch (voice) {
      case 'high':
        // 尖嗓：又高又抖
        this.tone({ freq: 980, to: 520, wave: 'sawtooth', dur: 0.55, attack: 0.02, vol: 0.18, vibrato: [70, 14], pan, lowpass: 3600 });
        this.tone({ freq: 1960, to: 1040, wave: 'square', dur: 0.45, attack: 0.02, vol: 0.04, vibrato: [120, 14], pan, lowpass: 4200 });
        return;
      case 'low':
        // 粗嗓：低、长、往下沉
        this.tone({ freq: 230, to: 105, wave: 'sawtooth', dur: 0.8, attack: 0.04, vol: 0.3, vibrato: [10, 7], pan, lowpass: 1400 });
        this.tone({ freq: 460, to: 210, wave: 'square', dur: 0.6, attack: 0.04, vol: 0.05, vibrato: [18, 7], pan, lowpass: 1600 });
        return;
      case 'duck':
        // 鸭子：方波、鼻音、快颤，三声嘎
        for (let k = 0; k < 3; k++) this.tone({ freq: 620 - k * 60, to: 380 - k * 40, wave: 'square', dur: 0.16, attack: 0.01, vol: 0.14, vibrato: [90, 28], pan, lowpass: 1500, delay: k * 0.17 });
        return;
      case 'robot': {
        // 机器人：一格一格往下掉的音，方波
        const steps = [720, 640, 560, 480, 400, 330, 270];
        steps.forEach((f, k) => this.tone({ freq: f, wave: 'square', dur: 0.085, attack: 0.004, vol: 0.12, pan, lowpass: 2600, delay: k * 0.08 }));
        return;
      }
      case 'opera':
        // 歌剧：先唱上去，再长长地滑下来，宽颤音
        this.tone({ freq: 660, to: 880, wave: 'triangle', dur: 0.32, attack: 0.05, vol: 0.22, vibrato: [22, 6], pan });
        this.tone({ freq: 880, to: 330, wave: 'triangle', dur: 0.9, attack: 0.05, vol: 0.22, vibrato: [30, 6], pan, delay: 0.3 });
        this.tone({ freq: 1760, to: 660, wave: 'sine', dur: 0.9, attack: 0.05, vol: 0.05, vibrato: [60, 6], pan, delay: 0.3 });
        return;
      default:
        // 默认：锯齿波带颤音一路往下滑，四个座位四个音高
        this.tone({ freq: seat * 1.15, to: seat * 0.5, wave: 'sawtooth', dur: 0.62, attack: 0.03, vol: 0.22, vibrato: [seat * 0.06, 11], pan, lowpass: 2400 });
        this.tone({ freq: seat * 2.3, to: seat * 1.0, wave: 'square', dur: 0.5, attack: 0.03, vol: 0.05, vibrato: [seat * 0.1, 11], pan, lowpass: 3000 });
    }
  }

  private splash(pan: number, hot: boolean): void {
    const d = 0.55;
    this.noise({ dur: 0.35, vol: 0.5, filter: { type: 'lowpass', freq: hot ? 1100 : 1600, to: 300 }, attack: 0.01, pan, delay: d });
    for (let k = 0; k < 5; k++) this.tone({ freq: 900 + Math.random() * 900, to: 400, wave: 'sine', dur: 0.06, vol: 0.12, pan, delay: d + 0.08 + k * 0.05 });
    if (hot) this.noise({ dur: 0.9, vol: 0.12, filter: { type: 'bandpass', freq: 3200, q: 1.2 }, attack: 0.05, pan, delay: d + 0.2 });
  }

  /** 背叛：全场「哦——」，三个音一起往下滑。 */
  private ooh(): void {
    for (const f of [330, 415, 494]) this.tone({ freq: f, to: f * 0.78, wave: 'triangle', dur: 0.7, attack: 0.08, vol: 0.14, vibrato: [4, 6], lowpass: 1200 });
  }

  private fanfare(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this.tone({ freq: f, wave: 'square', dur: 0.14, vol: 0.12, delay: i * 0.13, lowpass: 3000 });
      this.tone({ freq: f, wave: 'triangle', dur: 0.14, vol: 0.2, delay: i * 0.13 });
    });
    for (const f of [523, 659, 784, 1047, 1319]) {
      this.tone({ freq: f, wave: 'triangle', dur: 0.9, attack: 0.02, vol: 0.14, delay: 0.55 });
      this.tone({ freq: f * 1.003, wave: 'sine', dur: 0.9, attack: 0.02, vol: 0.1, delay: 0.55 });
    }
    this.noise({ dur: 0.5, vol: 0.12, filter: { type: 'highpass', freq: 4000 }, attack: 0.01, delay: 0.55 });
  }

  // ---------------------------------------------------------------- 合成

  private tone(o: ToneOpts): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.wave ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    const gain = ctx.createGain();
    const attack = o.attack ?? 0.005;
    const vol = o.vol ?? 0.3;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato[1];
      const depth = ctx.createGain();
      depth.gain.value = o.vibrato[0];
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
    }
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    this.out(gain, o.pan).connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const gain = ctx.createGain();
    const attack = o.attack ?? 0.003;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.freq, t0);
      if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t0 + o.dur);
      if (o.filter.q) f.Q.value = o.filter.q;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    this.out(gain, o.pan).connect(master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  private out(node: AudioNode, pan: number | undefined): AudioNode {
    const ctx = this.ctx as AudioContext;
    if (pan === undefined || !('createStereoPanner' in ctx)) return node;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    return p;
  }

  private pan(x: number, y: number): number {
    return this.panOf ? this.panOf(x, y) : 0;
  }

  /** 同一种声音太密就跳过（四个人一起抓地时不炸耳朵）。 */
  private throttle(key: string, gap: number): boolean {
    const now = this.ctx?.currentTime ?? 0;
    const last = this.lastAt.get(key) ?? -1;
    if (now - last < gap) return false;
    this.lastAt.set(key, now);
    return true;
  }
}

export const sfx = new Sfx();
