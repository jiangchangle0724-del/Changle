// The speaker's sound, made on the spot with Web Audio (no audio files): A1's clicks (calibration,
// the metronome, the count-in) and, until the dances have their own songs (task A5), a simple
// four-on-the-floor groove for each beat of a dance: kick on every beat, clap on the even counts,
// hi-hat between, a bass line, and a chime where a new move or stage starts. Every sound is
// scheduled at a speaker time (common.ts's pageClock: PAGE_ORIGIN + performance.now()).
import type { RunBeat } from "../shared/show";
import { PAGE_ORIGIN } from "./common";

export type Click = "accent" | "beat" | "count" | "cal";

/** Each 8-count's bass notes, two bars of two chords (A minor, F, C, G), in Hz. */
const BASS = [
  [110, 87.31],
  [130.81, 98],
];

export class Synth {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private live = new Set<AudioScheduledSourceNode>();

  /** Must run inside a tap: iOS and Safari only start audio from one. */
  start(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;
    void ctx.resume();
    // a silent sound first: what unlocks audio on iOS
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    // a gentle limiter, so the groove's sounds added together never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.out.connect(comp).connect(ctx.destination);
    // a second of noise for the hi-hats and claps
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Audio stopped (the page went to the background): start it again, inside a tap. */
  resume(): void {
    if (this.ctx) void this.ctx.resume();
    else this.start();
  }

  /** The audio clock's time at which a sound comes out of this device at speaker time t. */
  private when(t: number): number {
    const ctx = this.ctx!;
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

  /** Noise through a filter: the hi-hat (high, short) and the clap (mid, a little longer). */
  private noiseHit(t: number, level: number, type: BiquadFilterType, hz: number, decay: number): void {
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
    g.gain.exponentialRampToValueAtTime(level, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    s.connect(f).connect(g).connect(this.out!);
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
 * A1's clicks only.
 */
export function playBeat(s: Synth, b: RunBeat, prev: RunBeat | null, phrase: number, metronome: boolean): void {
  if (b.stage === "countdown") return s.click(b.t, "count");
  if (metronome) return s.click(b.t, (b.count - 1) % 4 === 0 ? "accent" : "beat");
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
