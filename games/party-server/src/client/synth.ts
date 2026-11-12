// The speaker's sound, made on the spot with Web Audio (no audio files): A1's clicks (calibration,
// the metronome, the count-in), the instruments the practice dances' own tunes play (tunes.ts: a
// lead voice, bass, chords, drums, and 秧歌's drums, gongs and cymbals), a reverb and an echo they
// send to, and a plain four-on-the-floor groove for a dance without a tune of its own. Every sound
// is scheduled at a speaker time (common.ts's pageClock: PAGE_ORIGIN + performance.now()).
import type { RunBeat } from "../shared/show";
import { PAGE_ORIGIN } from "./common";
import { playTuneBeat, type Tune, type Voice } from "./tunes";


export type Click = "accent" | "beat" | "count" | "cal";

/** Each 8-count's bass notes, two bars of two chords (A minor, F, C, G), in Hz. */
const BASS = [
  [110, 87.31],
  [130.81, 98],
];

export class Synth {
  private ctx: BaseAudioContext | null = null;
  private out: GainNode | null = null;
  private rev: GainNode | null = null;
  private echo: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private live = new Set<AudioScheduledSourceNode>();
  /** Rendering offline (scripts/tunes-preview.cjs): speaker time t (ms) is t / 1000 on its clock. */
  private offlineClock = false;

  /** Must run inside a tap: iOS and Safari only start audio from one. */
  start(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: "interactive" });
    void ctx.resume();
    // a silent sound first: what unlocks audio on iOS
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
    this.wire(ctx);
  }

  /** For scripts/tunes-preview.cjs: everything into an offline context, speaker time t at t / 1000 s. */
  startOffline(ctx: OfflineAudioContext): void {
    this.offlineClock = true;
    this.wire(ctx);
  }

  /** The output (a gentle limiter, so the sounds added together never clip), the reverb, the echo, the noise. */
  private wire(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.72;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    this.out.connect(comp).connect(ctx.destination);
    // a second of noise for the hi-hats, claps and cymbals
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    // a room: two seconds of noise dying away, a little different in each ear
    const len = Math.round(ctx.sampleRate * 2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    this.rev = ctx.createGain();
    this.rev.connect(conv).connect(wet).connect(this.out);
    // an echo a little under half a second, coming back softer each time
    const dl = ctx.createDelay(1);
    dl.delayTime.value = 0.36;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3200;
    this.echo = ctx.createGain();
    this.echo.connect(dl);
    dl.connect(tone).connect(fb).connect(dl);
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.5;
    tone.connect(echoOut).connect(this.out);
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Audio stopped (the page went to the background): start it again, inside a tap. */
  resume(): void {
    if (this.ctx && !this.offlineClock) void (this.ctx as AudioContext).resume();
    else if (!this.ctx) this.start();
  }

  /** The audio clock's time at which a sound comes out of this device at speaker time t. */
  private when(t: number): number {
    if (this.offlineClock) return t / 1000;
    const ctx = this.ctx as AudioContext;
    const p = t - PAGE_ORIGIN;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime) return ts.contextTime + (p - ts.performanceTime) / 1000;
    // (no output timestamp: schedule ahead by the latency the browser reports)
    return ctx.currentTime + (p - performance.now()) / 1000 - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  /** The audio time for speaker time t, or null when it has gone by (or there is no audio). */
  private at(t: number): number | null {
    const ctx = this.ctx;
    if (!ctx || !this.out) return null;
    const a = this.when(t);
    return a < ctx.currentTime ? null : a;
  }

  private keep(n: AudioScheduledSourceNode): void {
    this.live.add(n);
    n.onended = () => this.live.delete(n);
  }

  /** A1's click: a short triangle beep (the calibration's, the metronome's, the count-in's). */
  click(t: number, kind: Click): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = kind === "accent" ? 1760 : kind === "cal" ? 1320 : kind === "count" ? 660 : 1175;
    const peak = kind === "count" ? 0.35 : 0.7;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + 0.09);
    this.keep(o);
  }

  kick(t: number, level: number): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(48, at + 0.12);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + 0.3);
    this.keep(o);
  }

  /**
   * Noise through a filter: the hi-hat (high, short), the clap (mid, a little longer), cymbals. `rev`:
   * how much goes to the reverb; `attack`: a soft start (a shaker's).
   */
  private noiseHit(t: number, level: number, type: BiquadFilterType, hz: number, decay: number, rev = 0, attack = 0.002): void {
    const at = this.at(t);
    if (at === null || !this.noise) return;
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(decay, attack + 0.005));
    s.connect(f).connect(g).connect(this.out!);
    if (rev && this.rev) {
      const sg = ctx.createGain();
      sg.gain.value = rev;
      g.connect(sg).connect(this.rev);
    }
    // (a different stretch of the noise each time)
    s.start(at, Math.random() * 0.5);
    s.stop(at + decay + 0.02);
    this.keep(s);
  }

  hat(t: number, level: number): void {
    this.noiseHit(t, level, "highpass", 7000, 0.05);
  }

  clap(t: number, level: number): void {
    this.noiseHit(t, level, "bandpass", 1500, 0.16);
  }

  bass(t: number, hz: number, seconds: number, level: number): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = hz;
    f.type = "lowpass";
    f.frequency.value = 420;
    const end = at + Math.max(0.08, seconds);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.01);
    g.gain.setValueAtTime(level, end - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(f).connect(g).connect(this.out!);
    o.start(at);
    o.stop(end + 0.02);
    this.keep(o);
  }

  /** A bell where something new starts: a new move (lower), your turn (higher). */
  chime(t: number, hz: number, level: number): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    for (const [mul, lv] of [
      [1, level],
      [2.01, level * 0.35],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = hz * mul;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(lv, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      o.connect(g).connect(this.out!);
      o.start(at);
      o.stop(at + 1);
      this.keep(o);
    }
  }

  // ---------- the tunes' instruments (tunes.ts)

  /** A note of a voice at speaker time t: `hz`, held `seconds` (its release after), at `level`. */
  note(t: number, hz: number, seconds: number, v: Voice, level: number): void {
    const at = this.at(t);
    if (at === null || !(hz > 0)) return;
    const ctx = this.ctx!;
    const end = at + Math.max(0.03, seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + v.attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * v.sustain), at + v.attack + v.decay);
    g.gain.setValueAtTime(Math.max(0.0001, level * v.sustain), Math.max(at + v.attack + v.decay, end));
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(at + v.attack + v.decay, end) + v.release);
    const stop = Math.max(at + v.attack + v.decay, end) + v.release + 0.02;
    let head: AudioNode = g;
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.Q.value = v.filter.q ?? 0.7;
      if (v.filter.sweep) {
        f.frequency.setValueAtTime(v.filter.hz + v.filter.sweep, at);
        f.frequency.exponentialRampToValueAtTime(v.filter.hz, at + (v.filter.sweepS ?? 0.2));
      } else f.frequency.value = v.filter.hz;
      f.connect(g);
      head = f;
    }
    let lfo: OscillatorNode | null = null;
    let depth: GainNode | null = null;
    if (v.vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = v.vibrato.hz;
      depth = ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.setValueAtTime(0, at + v.vibrato.after);
      depth.gain.linearRampToValueAtTime(v.vibrato.cents, at + v.vibrato.after + 0.15);
      lfo.connect(depth);
      lfo.start(at);
      lfo.stop(stop);
      this.keep(lfo);
    }
    for (const o of v.osc) {
      const osc = ctx.createOscillator();
      osc.type = o.type;
      const f0 = hz * (o.mul ?? 1);
      osc.frequency.value = f0;
      osc.detune.setValueAtTime((o.cents ?? 0) - (v.scoop?.cents ?? 0), at);
      if (v.scoop) osc.detune.linearRampToValueAtTime(o.cents ?? 0, at + v.scoop.seconds);
      if (depth) depth.connect(osc.detune);
      const lv = ctx.createGain();
      lv.gain.value = o.level ?? 1;
      osc.connect(lv).connect(head);
      osc.start(at);
      osc.stop(stop);
      this.keep(osc);
    }
    g.connect(this.out!);
    if (v.rev && this.rev) {
      const sg = ctx.createGain();
      sg.gain.value = v.rev;
      g.connect(sg).connect(this.rev);
    }
    if (v.echo && this.echo) {
      const sg = ctx.createGain();
      sg.gain.value = v.echo;
      g.connect(sg).connect(this.echo);
    }
  }

  /** A kick with its own pitch and length (the tunes'), louder and punchier than the groove's. */
  kick2(t: number, level: number, top = 160, bottom = 45, seconds = 0.32): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(top, at);
    o.frequency.exponentialRampToValueAtTime(bottom, at + 0.09);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + seconds + 0.02);
    this.keep(o);
    // the click of the beater
    this.noiseHit(t, level * 0.25, "highpass", 2500, 0.012);
  }

  /** A snare: a short tone under a burst of noise. */
  snare(t: number, level: number): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(230, at);
    o.frequency.exponentialRampToValueAtTime(160, at + 0.06);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level * 0.5, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + 0.1);
    this.keep(o);
    this.noiseHit(t, level, "bandpass", 2400, 0.17, 0.08);
  }

  /** A hand clap: three quick bursts and a tail, a little room on it. */
  clap2(t: number, level: number): void {
    for (const [ms, lv] of [
      [0, 0.6],
      [9, 0.7],
      [18, 1],
    ] as const)
      this.noiseHit(t + ms, level * lv, "bandpass", 1300, ms === 18 ? 0.2 : 0.012, 0.12);
  }

  openHat(t: number, level: number): void {
    this.noiseHit(t, level, "highpass", 7500, 0.28);
  }

  shaker(t: number, level: number): void {
    this.noiseHit(t, level, "bandpass", 6500, 0.07, 0, 0.012);
  }

  /** A tom: a falling tone. */
  tom(t: number, hz: number, level: number): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(hz * 1.6, at);
    o.frequency.exponentialRampToValueAtTime(hz, at + 0.08);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + 0.37);
    this.keep(o);
  }

  /** A wood block (梆子): a short knock. */
  block(t: number, hz: number, level: number): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    for (const [mul, lv] of [
      [1, 1],
      [2.71, 0.4],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = hz * mul;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level * lv, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      o.connect(g).connect(this.out!);
      o.start(at);
      o.stop(at + 0.07);
      this.keep(o);
    }
  }

  /** The big drum (大鼓) of 秧歌: a deep boom and the skin's thud. */
  bigDrum(t: number, level: number): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(62, at + 0.12);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    o.connect(g).connect(this.out!);
    if (this.rev) {
      const sg = ctx.createGain();
      sg.gain.value = 0.25;
      g.connect(sg).connect(this.rev);
    }
    o.start(at);
    o.stop(at + 0.47);
    this.keep(o);
    this.noiseHit(t, level * 0.35, "lowpass", 900, 0.06);
  }

  /**
   * A gong: partials that don't line up as a string's do, ringing out. Small (小锣, around 600 Hz,
   * its pitch sliding up: the 台 of the 锣鼓经) or big (大锣, low and long).
   */
  gong(t: number, hz: number, level: number, seconds: number, slide = 1): void {
    const at = this.at(t);
    if (at === null) return;
    const ctx = this.ctx!;
    const mix = ctx.createGain();
    mix.gain.setValueAtTime(0.0001, at);
    mix.gain.exponentialRampToValueAtTime(level, at + 0.006);
    mix.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    mix.connect(this.out!);
    if (this.rev) {
      const sg = ctx.createGain();
      sg.gain.value = 0.35;
      mix.connect(sg).connect(this.rev);
    }
    for (const [mul, lv] of [
      [1, 1],
      [1.48, 0.55],
      [2.02, 0.4],
      [2.83, 0.22],
      [3.6, 0.12],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(hz * mul, at);
      if (slide !== 1) o.frequency.exponentialRampToValueAtTime(hz * mul * slide, at + Math.min(0.25, seconds * 0.5));
      g.gain.value = lv;
      o.connect(g).connect(mix);
      o.start(at);
      o.stop(at + seconds + 0.02);
      this.keep(o);
    }
  }

  /** Cymbals (镲): bright noise with a ring, choked short or let ring. */
  cymbal(t: number, level: number, seconds: number): void {
    this.noiseHit(t, level, "highpass", 4200, seconds, 0.2);
    this.noiseHit(t, level * 0.6, "bandpass", 8200, seconds * 0.8, 0.2);
  }

  /** A rising rush of noise over `seconds`, into the next phrase. */
  riser(t: number, seconds: number, level: number): void {
    const at = this.at(t);
    if (at === null || !this.noise) return;
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, at);
    f.frequency.exponentialRampToValueAtTime(9000, at + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + seconds * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds + 0.05);
    s.connect(f).connect(g).connect(this.out!);
    s.start(at);
    s.stop(at + seconds + 0.08);
    this.keep(s);
  }

  // ---------- the room's sound effects (they react: played now, not on a beat)

  /** A short glassy pop, `step` notes up a scale: a player on the beat (their little dancer lights up). */
  pop(step: number, level = 0.14): void {
    if (!this.ctx || !this.out) return;
    const ctx = this.ctx;
    const at = ctx.currentTime + 0.005;
    const hz = 880 * 2 ** ([0, 2, 4, 7, 9, 12, 14, 16][((step % 8) + 8) % 8]! / 12);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(hz * 1.5, at);
    o.frequency.exponentialRampToValueAtTime(hz, at + 0.03);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + 0.18);
    this.keep(o);
  }

  /** A rising run of bells: the floor's streak went up another 8 beats together. */
  sparkle(level = 0.18): void {
    if (!this.ctx) return;
    const now = performance.now() + PAGE_ORIGIN;
    [0, 4, 7, 12].forEach((semi, k) => this.chimeNow(now + k * 70, 1046.5 * 2 ** (semi / 12), level * (1 - k * 0.12)));
  }

  /** Fireworks: a low boom, then crackles. */
  boom(level = 0.5): void {
    if (!this.ctx || !this.out) return;
    const ctx = this.ctx;
    const at = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(90, at);
    o.frequency.exponentialRampToValueAtTime(35, at + 0.5);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + 0.75);
    this.keep(o);
    const base = performance.now() + PAGE_ORIGIN;
    for (let k = 0; k < 9; k++) this.noiseHit(base + 250 + k * (60 + Math.random() * 90), 0.12 + Math.random() * 0.1, "highpass", 3000 + Math.random() * 4000, 0.04);
  }

  /** The results: a little fanfare. */
  fanfare(level = 0.2): void {
    if (!this.ctx) return;
    const base = performance.now() + PAGE_ORIGIN + 30;
    const notes: [number, number][] = [
      [0, 523.25],
      [150, 659.25],
      [300, 783.99],
      [450, 1046.5],
      [450, 783.99],
    ];
    for (const [ms, hz] of notes) this.chimeNow(base + ms, hz, level);
  }

  /** A bell at speaker time t (no further ahead than the audio clock allows). */
  private chimeNow(t: number, hz: number, level: number) {
    // (a little ahead: the audio clock's view of "now" runs behind by the output's latency)
    this.chime(Math.max(t, performance.now() + PAGE_ORIGIN + 80), hz, level);
  }

  /** Stop everything scheduled. */
  hush(): void {
    for (const n of this.live) {
      try {
        n.stop();
      } catch {
        // not started yet or already stopped
      }
    }
    this.live.clear();
  }
}

/**
 * The sounds of one beat of a run. `prev`: the beat before it (null for the first), to hear where a
 * new move or stage starts. `phrase`: the 8-counts played so far, for the bass line. `metronome`:
 * A1's clicks only. `tune`: the dance's own tune (tunes.ts), else the plain groove.
 */
export function playBeat(s: Synth, b: RunBeat, prev: RunBeat | null, phrase: number, metronome: boolean, tune: Tune | null = null): void {
  if (b.stage === "countdown") return s.click(b.t, "count");
  if (metronome) return s.click(b.t, (b.count - 1) % 4 === 0 ? "accent" : "beat");
  if (tune) return playTuneBeat(s, tune, b, prev, phrase);
  const half = b.ms / 2;
  const even = b.count % 2 === 0;
  const fresh = !prev || prev.stage !== b.stage || prev.move?.id !== b.move?.id;
  const chord = BASS[phrase % 2]![b.count <= 4 ? 0 : 1]!;
  switch (b.stage) {
    case "warmup":
    case "cooldown":
      // gentle: a soft kick, the hats, a long bass note each bar
      s.kick(b.t, 0.45);
      s.hat(b.t + half, 0.12);
      if (b.count === 1 || b.count === 5) s.bass(b.t, chord, (b.ms * 3.5) / 1000, 0.22);
      if (fresh && b.count === 1) s.chime(b.t, 660, 0.18);
      return;
    case "watch":
    case "follow":
      s.kick(b.t, 0.6);
      if (even) s.clap(b.t, 0.3);
      s.hat(b.t + half, 0.16);
      s.bass(b.t, chord, (b.ms * 0.45) / 1000, 0.24);
      // a bell where a move is shown, a higher one where it's your turn
      if (b.count === 1) s.chime(b.t, b.stage === "follow" ? 990 : 660, 0.22);
      return;
    case "dance":
      s.kick(b.t, 0.8);
      if (even) s.clap(b.t, 0.42);
      s.hat(b.t, 0.08);
      s.hat(b.t + half, 0.2);
      s.bass(b.t, chord, (b.ms * 0.45) / 1000, 0.3);
      s.bass(b.t + half, chord * 2, (b.ms * 0.3) / 1000, 0.16);
      if (fresh && b.count === 1) s.chime(b.t, 880, 0.16);
      return;
  }
}
