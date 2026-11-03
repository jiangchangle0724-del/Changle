/**
 * 打碟 · DJ Booth: the speaker's sound chain, on the one device that plays the music.
 *
 *   PCM chunks (deck A, deck B) → player (AudioWorklet: ring buffer, crossfader, brake, rewind, scratch)
 *     → the table's mixer (EQ, filter, crush, flanger, pump, gate: mixer.ts)
 *     → high-pass (the build-up) → low-pass (the sweep) → master gain → glue compressor → limiter → speakers
 *                                                  ↘ echo ↗              ↗                    ↘ analyser (the lights)
 *     the deck's own sounds (horn, riser, roll, impact: fx.ts) ──────────┘
 *
 * Its own AudioContext at 48 kHz (Lyria's rate), tuned for steady playback rather than quick
 * reactions. Open it from inside a tap: iPhone and Safari start audio only from one.
 */
import { impulse } from "../../../lib/audio/engine";
import { MixerChain } from "./mixer";
import { pcm16ToFloat } from "./pcm";
import workletUrl from "./player.worklet.js?url";

/** How loud the stand-in's room is (measured: about the reverb its recordings carried, on the mix above 350 Hz). */
const ROOM_WET = 0.12;

export type PlayerState = "waiting" | "playing" | "buffering";
/** The speaker's effect nodes, for fx.ts. */
export type FxNodes = { hp: BiquadFilterNode; lp: BiquadFilterNode; send: GainNode; delay: DelayNode; synth: GainNode };
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

/** how far the music dips while the TV speaks (报幕) */
const DUCK = 0.4;

export class Speaker {
  readonly ctx: AudioContext;
  readonly rate: number;
  private opts: Required<SpeakerOptions>;
  private node: AudioWorkletNode | null = null;
  private master: GainNode;
  /** under everything, after the ceiling: the music dips while the TV speaks (报幕) */
  private talk: GainNode;
  /** and gives way to a whole song from YouTube (giveWay) */
  private talkFade: GainNode;
  private room: GainNode;
  /** the beginner deck's effects (fx.ts plays them): the filters the music passes through, the echo's send, and where its own sounds go */
  readonly fxNodes: FxNodes;
  /** the table's mixer, between the player and those (the driver moves it) */
  readonly mixer: MixerChain;
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
    this.talk = ctx.createGain();
    this.talkFade = ctx.createGain();
    this.master.connect(glue).connect(limit).connect(this.talk).connect(this.talkFade).connect(ctx.destination);
    limit.connect(this.analyser);
    // the beginner deck's effects: both filters wide open, the echo silent, until fx.ts moves them
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 10;
    hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 22000;
    lp.Q.value = 0.7;
    hp.connect(lp).connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.36;
    const darker = ctx.createBiquadFilter();
    darker.type = "lowpass";
    darker.frequency.value = 3200;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.45;
    lp.connect(send).connect(delay).connect(darker).connect(feedback).connect(delay);
    darker.connect(this.master);
    const synth = ctx.createGain();
    synth.connect(this.master);
    // the stand-in's room: a short reverb on the mix above the bass, about as loud as the one its
    // recordings used to carry (offlineBus: WebKit keeps an offline reverb in memory for good)
    const roomHp = ctx.createBiquadFilter();
    roomHp.type = "highpass";
    roomHp.frequency.value = 350;
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 1.5, 3);
    this.room = ctx.createGain();
    this.room.gain.value = 0;
    lp.connect(roomHp).connect(conv).connect(this.room).connect(this.master);
    this.fxNodes = { hp, lp, send, delay, synth };
    this.mixer = new MixerChain(ctx);
    this.mixer.output.connect(hp);
    document.addEventListener("visibilitychange", this.wake);
  }

  /** The room reverb: on for the stand-in (its recordings are dry), off for music that brings its own. */
  setRoom(on: boolean) {
    const g = this.room.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(on ? ROOM_WET : 0, t, 0.3);
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
    node.connect(this.mixer.input);
    this.mixer.attachCrusher(new AudioWorkletNode(this.ctx, "dj-crush", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }));
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

  /**
   * One chunk of the stream (planar, at `rate`), with deck B's frames for the same stretch when
   * deck B plays. `ownB` false: B's frames are only the ring-out of its last section (B has nothing
   * of its own now), so the player plays deck A alone and lets that tail fade under it. The arrays
   * are handed over, not copied.
   */
  push(l: Float32Array, r: Float32Array, l2?: Float32Array, r2?: Float32Array, ownB = true) {
    if (!this.node) return;
    this.sent += l.length;
    if (l2 && r2) this.node.port.postMessage({ t: "pcm", l, r, l2, r2, own: ownB }, [l.buffer, r.buffer, l2.buffer, r2.buffer]);
    else this.node.port.postMessage({ t: "pcm", l, r }, [l.buffer, r.buffer]);
  }

  /**
   * The crossfader: 0 all deck A, 1 all deck B. Now (smoothed by the player), or at an audio time
   * (a drop's bar). Moving it now leaves a jump already set for later alone.
   */
  setXfade(value: number, at?: number) {
    const p = this.node?.parameters.get("xfade");
    if (!p) return;
    const v = Math.max(0, Math.min(1, value));
    if (at === undefined) p.value = v;
    else {
      p.cancelScheduledValues(at);
      p.setValueAtTime(v, Math.max(at, this.ctx.currentTime));
    }
  }

  /**
   * A move of the music itself (player.worklet.js), from audio time `at` for `dur` seconds, back at
   * `until` where the stream has got to: the brake (a tape stop, then quiet), a rewind (spun back,
   * then quiet), a scratch (back and forth).
   */
  move(kind: "brake" | "rewind" | "scratch", at: number, dur: number, until: number) {
    this.node?.port.postMessage({ t: "move", kind, at, dur, until });
  }

  /** The audio time stream frame `f` plays at (null while the player isn't playing). */
  timeOfFrame(f: number): number | null {
    const t = this.last;
    if (!t || t.state !== "playing") return null;
    return t.time + (f - t.pos) / this.rate;
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

  /** How loud it plays right now: the RMS of the last 40 ms or so, after the volume (the checks' ear). */
  level(): number {
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const x of buf) sum += x * x;
    return Math.sqrt(sum / buf.length);
  }

  /** The music dips (about 8 dB) while the TV speaks, and comes back after. */
  duck(on: boolean) {
    const g = this.talk.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(on ? DUCK : 1, t, on ? 0.08 : 0.3);
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

  /** The DJ gives way to a whole song (真歌时间: it plays in YouTube's player, not here), or comes back: over `seconds`. */
  giveWay(away: boolean, seconds: number) {
    const g = this.talkFade;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(away ? 0 : 1, t + Math.max(0.05, seconds));
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
