/**
 * 打碟 · DJ Booth: the speaker's sound chain, on the one device that plays the music.
 *
 *   PCM chunks → player (AudioWorklet, ring buffer) → master gain → glue compressor → limiter → speakers
 *                                                                                  ↘ analyser (the lights)
 *
 * Its own AudioContext at 48 kHz (Lyria's rate), tuned for steady playback rather than quick
 * reactions. Open it from inside a tap: iPhone and Safari start audio only from one.
 */
import { pcm16ToFloat } from "./pcm";
import workletUrl from "./player.worklet.js?url";

export type PlayerState = "waiting" | "playing" | "buffering";
type Tick = { pos: number; written: number; time: number; state: PlayerState; stalls: number; drops: number };

export type SpeakerOptions = {
  /** the stream's sample rate */
  rate?: number;
  /** seconds to have waiting before the first sound, and before sound comes back after running dry */
  prebuffer?: number;
  resume?: number;
  /** the ring buffer's size in seconds */
  seconds?: number;
};

export class Speaker {
  readonly ctx: AudioContext;
  readonly rate: number;
  private opts: Required<SpeakerOptions>;
  private node: AudioWorkletNode | null = null;
  private master: GainNode;
  private analyser: AnalyserNode;
  private bins: Float32Array<ArrayBuffer>;
  private lo = 2;
  private hi = 6;
  private peak = 1e-4;
  private last: Tick | null = null;
  /** frames sent to the player, all told */
  private sent = 0;
  /** the audio clock against performance.now(), smoothed (seconds) */
  private clockOffset: number | null = null;
  private volume = 1;
  private listeners = new Set<(t: Tick) => void>();
  private wake = () => {
    if (document.visibilityState === "visible" && this.ctx.state !== "running" && this.ctx.state !== "closed") void this.ctx.resume().catch(() => {});
  };

  /** Call inside the tap: the context is made and woken here; then `await ready()`. */
  constructor(opts: SpeakerOptions = {}) {
    this.opts = { rate: opts.rate ?? 48000, prebuffer: opts.prebuffer ?? 2.5, resume: opts.resume ?? 1.5, seconds: opts.seconds ?? 16 };
    this.rate = this.opts.rate;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext;
    try {
      ctx = new AC({ sampleRate: this.rate, latencyHint: "playback" });
    } catch {
      // an older Safari picks its own rate: the player resamples
      ctx = new AC();
    }
    this.ctx = ctx;
    void ctx.resume().catch(() => {});
    try {
      // a one-sample sound inside the tap wakes Safari's output
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* fine */
    }
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    // a gentle glue, then a hard ceiling: the stream, songs mixed in and anything else come out at
    // one loudness, and the TV's speakers (and ears) are spared the peaks
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -1.5;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.08;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.15;
    this.bins = new Float32Array(this.analyser.frequencyBinCount);
    // the kick and the bass: about 45 to 140 Hz
    const hz = ctx.sampleRate / this.analyser.fftSize;
    this.lo = Math.max(1, Math.round(45 / hz));
    this.hi = Math.max(this.lo, Math.round(140 / hz));
    this.master.connect(glue).connect(limit).connect(ctx.destination);
    limit.connect(this.analyser);
    document.addEventListener("visibilitychange", this.wake);
  }

  /** Load the player into the audio thread. */
  async ready() {
    await this.ctx.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(this.ctx, "dj-player", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { rate: this.rate, prebuffer: this.opts.prebuffer, resume: this.opts.resume, seconds: this.opts.seconds },
    });
    node.port.onmessage = (e: MessageEvent<Tick & { t: string }>) => {
      if (e.data?.t !== "tick") return;
      this.last = e.data;
      for (const fn of this.listeners) fn(e.data);
    };
    node.connect(this.master);
    this.node = node;
  }

  get running() {
    return this.ctx.state === "running";
  }

  /** Wake the sound again from a tap (an iPhone stops it when the screen locks or a call comes in). */
  resume() {
    void this.ctx.resume().catch(() => {});
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* fine */
    }
  }

  /** One chunk of the stream (planar, at `rate`). The arrays are handed over, not copied. */
  push(l: Float32Array, r: Float32Array) {
    if (!this.node) return;
    this.sent += l.length;
    this.node.port.postMessage({ t: "pcm", l, r }, [l.buffer, r.buffer]);
  }

  /** Lyria's own format. */
  pushPcm16(buf: ArrayBuffer) {
    const { l, r } = pcm16ToFloat(buf);
    this.push(l, r);
  }

  /** Drop whatever is waiting; the next sound waits for a full prebuffer again. */
  flush() {
    this.node?.port.postMessage({ t: "flush" });
    if (this.last) this.last = { ...this.last, pos: this.sent, state: "waiting" };
  }

  /** Called with every report from the player (about 23 a second). */
  onTick(fn: (t: Tick) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** The audio time the speakers are sounding now (smoothed against the page's clock). */
  heardTime(): number {
    const ctx = this.ctx;
    const perfMs = performance.now();
    let ctxNow: number;
    const ts = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime) {
      // the moment it was taken, on our clock: WebKit's runs at another pace, so use it only if it agrees
      const age = ts.performanceTime ? (perfMs - ts.performanceTime) / 1000 : NaN;
      ctxNow = ts.contextTime + (age >= 0 && age < 0.2 ? age : 0);
    } else ctxNow = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    const raw = ctxNow - perfMs / 1000;
    // the audio clock moves in blocks; a slow average gives the dancers a smooth one
    this.clockOffset = this.clockOffset === null || Math.abs(raw - this.clockOffset) > 0.25 ? raw : this.clockOffset + (raw - this.clockOffset) * 0.05;
    return perfMs / 1000 + this.clockOffset;
  }

  /** Frames of the stream the speakers are sounding right now (the beat clock reads this). */
  heardFrame(): number {
    const t = this.last;
    if (!t) return 0;
    if (t.state !== "playing") return t.pos;
    const p = t.pos + (this.heardTime() - t.time) * this.rate;
    return Math.max(0, Math.min(p, t.written));
  }

  /** Frames sent so far (a new stream after a flush starts here). */
  get sentFrames() {
    return this.sent;
  }

  /** Seconds of sound waiting to play. */
  buffered(): number {
    const t = this.last;
    if (!t) return this.sent / this.rate;
    let pos = t.pos;
    if (t.state === "playing") pos += Math.max(0, this.ctx.currentTime - t.time) * this.rate;
    return Math.max(0, this.sent - pos) / this.rate;
  }

  stats() {
    const t = this.last;
    return {
      state: (t?.state ?? "waiting") as PlayerState,
      stalls: t?.stalls ?? 0,
      drops: t?.drops ?? 0,
      buffered: this.buffered(),
      rate: this.ctx.sampleRate,
      latency: (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0),
    };
  }

  /**
   * How hard the low end is hitting, 0 to 1, against the loudest it has been lately: the lights
   * pulse with the kick whatever the volume.
   */
  energy(): number {
    this.analyser.getFloatFrequencyData(this.bins);
    let sum = 0;
    for (let i = this.lo; i <= this.hi; i++) sum += Math.pow(10, this.bins[i] / 20);
    const mag = sum / (this.hi - this.lo + 1);
    if (!Number.isFinite(mag) || mag <= 0) return 0;
    this.peak = Math.max(mag, this.peak * 0.9993);
    const x = mag / this.peak;
    return Math.min(1, Math.max(0, (x - 0.3) / 0.7));
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.volume, t, 0.05);
  }

  /** Fade everything out over about `seconds` (the end of a set). */
  fadeOut(seconds: number) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, Math.max(0.01, seconds / 4));
  }

  /** Back up to the volume after a fade. */
  restore() {
    this.setVolume(this.volume);
  }

  close() {
    document.removeEventListener("visibilitychange", this.wake);
    this.listeners.clear();
    try {
      this.node?.disconnect();
    } catch {
      /* fine */
    }
    void this.ctx.close().catch(() => {});
  }
}
