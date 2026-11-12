/**
 * The audio engine: one AudioContext, a master chain (compressor, limiter, short room reverb),
 * a music bus, and the synth voices every cue and groove is built from.
 *
 * Phones only start audio inside a real gesture. Touch `pointerdown` does not count as one,
 * so the unlock listens to touchend / pointerup / click / keydown and stays armed until the
 * context is actually running (and re-arms after iOS interrupts it). On iPhone the page asks
 * for the "playback" audio session so the ring/silent switch does not mute the party.
 */

export type Bus = { c: AudioContext; out: GainNode; verb: GainNode; music: GainNode; dry: GainNode };

let A: Bus | null = null;
let enabled = true;
let noiseBuf: AudioBuffer | null = null;

/* ---------------- unlock ---------------- */

const isIOS = () =>
  typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function askForPlaybackSession() {
  try {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s) {
      if (s.type !== "playback") s.type = "playback";
      return true;
    }
  } catch {
    /* older engines */
  }
  return false;
}

let keepAlive: HTMLAudioElement | null = null;
function silentWav() {
  const n = 800;
  const rate = 8000;
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, n, true);
  bytes.fill(128, 44);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return "data:audio/wav;base64," + btoa(s);
}

/** Older iPhones (no audioSession API): a silent looping <audio> moves the page into the playback category. */
function startKeepAlive() {
  if (!isIOS() || askForPlaybackSession()) return;
  try {
    if (!keepAlive) {
      keepAlive = document.createElement("audio");
      keepAlive.setAttribute("x-webkit-airplay", "deny");
      keepAlive.setAttribute("playsinline", "");
      keepAlive.preload = "auto";
      keepAlive.loop = true;
      keepAlive.src = silentWav();
    }
    void keepAlive.play().catch(() => {});
  } catch {
    /* fine */
  }
}

const GESTURES = ["touchend", "pointerup", "click", "keydown"] as const;
let armed = false;

function onGesture() {
  if (!enabled) return;
  askForPlaybackSession();
  startKeepAlive();
  const b = bus();
  if (!b) return;
  try {
    // a one-sample buffer played inside the gesture wakes Safari's output
    const src = b.c.createBufferSource();
    src.buffer = b.c.createBuffer(1, 1, b.c.sampleRate);
    src.connect(b.c.destination);
    src.start(0);
  } catch {
    /* fine */
  }
  b.c
    .resume()
    .then(() => {
      if (b.c.state === "running") disarm();
    })
    .catch(() => {});
}

function arm() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  GESTURES.forEach((e) => window.addEventListener(e, onGesture, { capture: true, passive: true }));
}

function disarm() {
  if (!armed) return;
  armed = false;
  GESTURES.forEach((e) => window.removeEventListener(e, onGesture, { capture: true }));
}

let installed = false;
let wakeAt = 0;

/**
 * Coming back from another app: phones hand the speaker to whatever took it (WeChat, a call,
 * the music app) and the context is either stopped ("suspended", or "interrupted" on iPhone)
 * or, worse, still says "running" while producing silence. A stop-and-start cycle fixes both,
 * and the next tap tries again in case the browser only allows it inside a gesture.
 */
function wake() {
  const now = Date.now();
  if (now - wakeAt < 300) return;
  wakeAt = now;
  askForPlaybackSession();
  if (!A || !enabled) return;
  const c = A.c;
  const state = c.state as string;
  if (state === "closed") return;
  if (state === "running") {
    void c
      .suspend()
      .then(() => c.resume())
      .catch(() => {});
  } else {
    void c.resume().catch(() => {});
  }
  arm();
  startKeepAlive();
}

/** Call once at startup. */
export function initAudio() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  askForPlaybackSession();
  arm();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
    else if (keepAlive) keepAlive.pause();
  });
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) wake();
  });
}

/** Call from inside a tap when the person turns sound on, or to be sure audio is awake. */
export function unlockAudio() {
  onGesture();
}

export function audioRunning() {
  return !!A && A.c.state === "running";
}

export function setEnabled(on: boolean) {
  enabled = on;
  if (!A) return;
  if (!on) {
    if (A.c.state === "running") void A.c.suspend().catch(() => {});
  } else if (A.c.state !== "running") {
    void A.c.resume().catch(() => {});
    arm();
  }
}

export function isEnabled() {
  return enabled;
}

/* ---------------- the bus ---------------- */

export function impulse(c: BaseAudioContext, seconds: number, decay: number) {
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const tt = i / len;
      const early = i < rate * 0.025 && Math.random() < 0.025 ? 1.5 : 1;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - tt, decay) * early;
    }
  }
  return buf;
}

export function bus(): Bus | null {
  if (!enabled || typeof window === "undefined") return null;
  try {
    if (!A) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      let c: AudioContext;
      try {
        c = new AC({ latencyHint: "interactive" });
      } catch {
        c = new AC();
      }
      // master: mix -> glue compressor -> makeup -> brickwall-ish limiter -> speakers
      const glue = c.createDynamicsCompressor();
      glue.threshold.value = -18;
      glue.knee.value = 12;
      glue.ratio.value = 3.5;
      glue.attack.value = 0.004;
      glue.release.value = 0.18;
      const makeup = c.createGain();
      makeup.gain.value = 1.3;
      const limit = c.createDynamicsCompressor();
      limit.threshold.value = -2;
      limit.knee.value = 0;
      limit.ratio.value = 20;
      limit.attack.value = 0.001;
      limit.release.value = 0.06;
      const out = c.createGain();
      out.gain.value = 1;
      out.connect(glue).connect(makeup).connect(limit).connect(c.destination);
      const dry = c.createGain();
      dry.gain.value = 1;
      dry.connect(out);
      const conv = c.createConvolver();
      conv.buffer = impulse(c, 1.5, 3);
      const verb = c.createGain();
      verb.gain.value = 0.28;
      verb.connect(conv).connect(out);
      const music = c.createGain();
      music.gain.value = 0.8;
      music.connect(out);
      c.onstatechange = () => {
        if (c.state !== "running") arm();
      };
      A = { c, out, verb, music, dry };
    }
    if (A.c.state !== "running" && A.c.state !== "closed") void A.c.resume().catch(() => {});
    return A;
  } catch {
    return null;
  }
}

/**
 * The same voices on an OfflineAudioContext, to render music ahead of time (the DJ booth's
 * stand-in tracks): the mix and the music bus, without the live master chain (whatever plays the
 * result brings its own) and without the room reverb: WebKit keeps every offline context that had a
 * reverb (a convolver) in memory for good, about 5 to 10 MB a recording, and the stand-in records
 * one every half minute or so through a night. The speaker adds the room to the stand-in instead
 * (speaker.ts `setRoom`). `out` goes to the context's destination.
 */
export function offlineBus(oc: OfflineAudioContext): Bus {
  return busTo(oc, oc.destination, false);
}

/**
 * The same voices into any node of any context (the DJ booth's speaker plays its effects into its
 * own chain): the mix, the room reverb (unless `room` is false: the send goes nowhere) and the
 * music bus, ending in `dest`.
 */
export function busTo(ctx: BaseAudioContext, dest: AudioNode, room = true): Bus {
  // the voices only create nodes and read the clock, which every context does the same way
  const c = ctx as unknown as AudioContext;
  const out = c.createGain();
  out.connect(dest);
  const dry = c.createGain();
  dry.connect(out);
  const verb = c.createGain();
  verb.gain.value = 0.28;
  if (room) {
    const conv = c.createConvolver();
    conv.buffer = impulse(c, 1.5, 3);
    verb.connect(conv).connect(out);
  }
  const music = c.createGain();
  music.gain.value = 0.8;
  music.connect(out);
  return { c, out, verb, music, dry };
}

/** Seconds on the audio clock for a moment on the performance.now() clock. */
export function ctxTimeAt(b: Bus, perfMs: number) {
  return b.c.currentTime + (perfMs - performance.now()) / 1000;
}

/** Lower the music for a moment so a cue reads clearly. */
export function duck(b: Bus, seconds = 0.9, depth = 0.35) {
  const g = b.music.gain;
  const t = b.c.currentTime;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(0.8 * depth, t, 0.03);
  g.setTargetAtTime(0.8, t + seconds, 0.25);
}

export function noise(c: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/* ---------------- building blocks ---------------- */

/** A gain stage feeding a destination dry and the reverb wet. */
export function voice(b: Bus, wet: number, dest?: AudioNode) {
  const g = b.c.createGain();
  g.connect(dest ?? b.dry);
  if (wet > 0) {
    const w = b.c.createGain();
    w.gain.value = wet;
    g.connect(w).connect(b.verb);
  }
  return g;
}

/** Percussive envelope: fast attack, exponential fall. */
export function perc(p: AudioParam, t0: number, peak: number, attack: number, decay: number) {
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(peak, t0 + attack);
  p.setTargetAtTime(0, t0 + attack, Math.max(0.004, decay / 4));
}

/** `at` is seconds from now, or an absolute audio-clock time when `abs` is true. */
type When = { at?: number; abs?: boolean; dest?: AudioNode };
const t0Of = (b: Bus, o: When) => (o.abs ? Math.max(b.c.currentTime, o.at ?? 0) : b.c.currentTime + (o.at ?? 0));

export type ToneOpt = When & { f: number; f2?: number; glide?: number; type?: OscillatorType; peak?: number; attack?: number; decay?: number; wet?: number; detune?: number };
export function tone(b: Bus, o: ToneOpt) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const decay = o.decay ?? 0.2;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.glide ?? decay));
  if (o.detune) osc.detune.value = o.detune;
  const amp = c.createGain();
  perc(amp.gain, t0, o.peak ?? 0.2, o.attack ?? 0.003, decay);
  osc.connect(amp).connect(voice(b, o.wet ?? 0.25, o.dest));
  osc.start(t0);
  osc.stop(t0 + (o.attack ?? 0.003) + decay * 1.4 + 0.05);
}

export type NoiseOpt = When & { dur: number; peak?: number; attack?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number; hp?: number; wet?: number; decay?: number };
export function burst(b: Bus, o: NoiseOpt) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filt = c.createBiquadFilter();
  filt.type = o.type ?? "bandpass";
  filt.frequency.setValueAtTime(o.f ?? 2000, t0);
  if (o.f2) filt.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  filt.Q.value = o.q ?? 1;
  let head: AudioNode = filt;
  if (o.hp) {
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = o.hp;
    filt.connect(hp);
    head = hp;
  }
  const amp = c.createGain();
  // a new gain starts at 1: begin silent rather than count on the automation at t0 to land first
  // (the 戏精 chat heard a click there, docs/briefs/drama.md; Chrome measured here showed none, 11-11)
  amp.gain.value = 0;
  const attack = o.attack ?? 0.002;
  if (o.decay !== undefined) perc(amp.gain, t0, o.peak ?? 0.2, attack, o.decay);
  else {
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(o.peak ?? 0.2, t0 + attack);
    amp.gain.setValueAtTime(o.peak ?? 0.2, t0 + Math.max(attack, o.dur * 0.6));
    amp.gain.linearRampToValueAtTime(0, t0 + o.dur);
  }
  src.connect(filt);
  head.connect(amp).connect(voice(b, o.wet ?? 0.2, o.dest));
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + o.dur + (o.decay ?? 0) * 1.4 + 0.05);
}

/** A struck body: a few inharmonic partials, each with its own decay. */
export function strike(b: Bus, base: number, ratios: number[], amps: number[], decays: number[], o: When & { peak?: number; wet?: number; glide?: number } = {}) {
  ratios.forEach((r, i) => {
    const f = base * r;
    tone(b, {
      f,
      f2: o.glide ? f * o.glide : undefined,
      glide: o.glide ? decays[i] ?? 1 : undefined,
      at: o.at,
      abs: o.abs,
      dest: o.dest,
      peak: (o.peak ?? 0.2) * (amps[i] ?? 0.3),
      attack: 0.002,
      decay: decays[i] ?? 0.3,
      wet: o.wet ?? 0.35,
    });
  });
}

/* ---------------- pitched instruments ---------------- */

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export type Inst = "ep" | "marimba" | "musicbox" | "bell" | "steel" | "pluck" | "brass" | "bass" | "lead" | "pad";

type NoteOpt = When & { f: number; dur?: number; peak?: number; wet?: number };

/** Two-operator FM: the electric piano, marimba, music box and bell all come from here. */
function fmNote(b: Bus, o: NoteOpt, ratio: number, index: number, indexDecay: number, ampDecay: number, extra?: { ratio: number; index: number; decay: number }) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const dur = o.dur ?? ampDecay;
  const end = t0 + Math.min(dur + 0.25, ampDecay * 1.6) + 0.05;
  const car = c.createOscillator();
  car.frequency.value = o.f;
  const mod = c.createOscillator();
  mod.frequency.value = o.f * ratio;
  const depth = c.createGain();
  depth.gain.setValueAtTime(o.f * ratio * index, t0);
  depth.gain.setTargetAtTime(o.f * ratio * index * 0.12, t0, indexDecay / 3);
  mod.connect(depth).connect(car.frequency);
  if (extra) {
    const m2 = c.createOscillator();
    m2.frequency.value = o.f * extra.ratio;
    const d2 = c.createGain();
    d2.gain.setValueAtTime(o.f * extra.ratio * extra.index, t0);
    d2.gain.setTargetAtTime(0, t0, extra.decay / 3);
    m2.connect(d2).connect(car.frequency);
    m2.start(t0);
    m2.stop(end);
  }
  const amp = c.createGain();
  const peak = o.peak ?? 0.2;
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  amp.gain.setTargetAtTime(0, t0 + 0.004, ampDecay / 4);
  if (o.dur !== undefined) amp.gain.setTargetAtTime(0, t0 + o.dur, 0.05);
  car.connect(amp).connect(voice(b, o.wet ?? 0.3, o.dest));
  car.start(t0);
  mod.start(t0);
  car.stop(end);
  mod.stop(end);
}

/** Additive steel pan: bright, ringing, a little hollow. */
function steelNote(b: Bus, o: NoteOpt) {
  const peak = o.peak ?? 0.18;
  strike(b, o.f, [1, 2, 3.01, 4.07], [1, 0.62, 0.3, 0.12], [0.85, 0.55, 0.32, 0.18], { at: o.at, abs: o.abs, dest: o.dest, peak, wet: o.wet ?? 0.3 });
  burst(b, { at: o.at, abs: o.abs, dest: o.dest, dur: 0.004, decay: 0.012, f: o.f * 3, q: 3, peak: peak * 0.4, wet: 0.1 });
}

/** Saw stack through an opening filter: fanfares and stabs. */
function brassNote(b: Bus, o: NoteOpt & { vibrato?: boolean; bendTo?: number }) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const dur = o.dur ?? 0.4;
  const peak = o.peak ?? 0.12;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(380, t0);
  lp.frequency.linearRampToValueAtTime(2600, t0 + 0.06);
  lp.frequency.setTargetAtTime(1500, t0 + 0.06, 0.15);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.03);
  amp.gain.setValueAtTime(peak * 0.85, t0 + Math.max(0.04, dur - 0.06));
  amp.gain.linearRampToValueAtTime(0, t0 + dur + 0.08);
  lp.connect(amp).connect(voice(b, o.wet ?? 0.3, o.dest));
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.6;
  const lfoDepth = c.createGain();
  lfoDepth.gain.setValueAtTime(0, t0);
  if (o.vibrato) lfoDepth.gain.linearRampToValueAtTime(o.f * 0.012, t0 + Math.min(0.25, dur));
  lfo.connect(lfoDepth);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.12);
  for (const det of [-7, 0, 7]) {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(o.f * 0.97, t0);
    osc.frequency.linearRampToValueAtTime(o.f, t0 + 0.035);
    if (o.bendTo) osc.frequency.linearRampToValueAtTime(o.bendTo, t0 + dur);
    osc.detune.value = det;
    lfoDepth.connect(osc.frequency);
    osc.connect(lp);
    osc.start(t0);
    osc.stop(t0 + dur + 0.12);
  }
}

function bassNote(b: Bus, o: NoteOpt) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const dur = o.dur ?? 0.2;
  const peak = o.peak ?? 0.3;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 5;
  lp.frequency.setValueAtTime(1100, t0);
  lp.frequency.setTargetAtTime(240, t0, 0.07);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.006);
  amp.gain.setValueAtTime(peak * 0.8, t0 + Math.max(0.01, dur - 0.03));
  amp.gain.linearRampToValueAtTime(0, t0 + dur + 0.04);
  const saw = c.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.value = o.f;
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.value = o.f;
  const subG = c.createGain();
  subG.gain.value = 0.9;
  saw.connect(lp);
  sub.connect(subG).connect(amp);
  lp.connect(amp).connect(voice(b, o.wet ?? 0.05, o.dest));
  saw.start(t0);
  sub.start(t0);
  saw.stop(t0 + dur + 0.08);
  sub.stop(t0 + dur + 0.08);
}

function leadNote(b: Bus, o: NoteOpt) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const dur = o.dur ?? 0.2;
  const peak = o.peak ?? 0.08;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3200, t0);
  lp.frequency.setTargetAtTime(1600, t0, 0.1);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  amp.gain.setTargetAtTime(peak * 0.6, t0 + 0.01, 0.08);
  amp.gain.setTargetAtTime(0, t0 + dur, 0.04);
  const sq = c.createOscillator();
  sq.type = "square";
  sq.frequency.value = o.f;
  const tri = c.createOscillator();
  tri.type = "triangle";
  tri.frequency.value = o.f * 2;
  tri.detune.value = 6;
  sq.connect(lp);
  tri.connect(lp);
  lp.connect(amp).connect(voice(b, o.wet ?? 0.3, o.dest));
  sq.start(t0);
  tri.start(t0);
  sq.stop(t0 + dur + 0.3);
  tri.stop(t0 + dur + 0.3);
}

function padNote(b: Bus, o: NoteOpt) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const dur = o.dur ?? 1.5;
  const peak = o.peak ?? 0.04;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.35, dur * 0.3));
  amp.gain.setValueAtTime(peak, t0 + dur * 0.8);
  amp.gain.linearRampToValueAtTime(0, t0 + dur + 0.3);
  lp.connect(amp).connect(voice(b, o.wet ?? 0.5, o.dest));
  for (const det of [-9, 9]) {
    const s = c.createOscillator();
    s.type = "sawtooth";
    s.frequency.value = o.f;
    s.detune.value = det;
    s.connect(lp);
    s.start(t0);
    s.stop(t0 + dur + 0.35);
  }
}

/** Karplus-Strong plucked string: harp and guitar. */
const plucks = new Map<number, AudioBuffer>();
function pluckBuffer(c: AudioContext, freq: number) {
  const key = Math.round(freq);
  const hit = plucks.get(key);
  if (hit && hit.sampleRate === c.sampleRate) return hit;
  const sr = c.sampleRate;
  const len = Math.floor(sr * 1.8);
  const n = Math.max(2, Math.round(sr / freq));
  const buf = c.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 2 - 1;
    ring[i] = r * 0.5 + prev * 0.5; // a soft fingertip
    prev = r;
  }
  const decay = Math.min(0.9985, 0.996 + 120 / (freq * 400));
  let idx = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx];
    const b2 = ring[(idx + 1) % n];
    out[i] = a;
    ring[idx] = decay * 0.5 * (a + b2);
    idx = (idx + 1) % n;
    if (Math.abs(a) > peak) peak = Math.abs(a);
  }
  if (peak > 0) for (let i = 0; i < len; i++) out[i] /= peak;
  plucks.set(key, buf);
  return buf;
}

function pluckNote(b: Bus, o: NoteOpt) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, o.f);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(5200, t0);
  lp.frequency.exponentialRampToValueAtTime(1600, t0 + 1);
  const amp = c.createGain();
  amp.gain.setValueAtTime(o.peak ?? 0.2, t0);
  amp.gain.setTargetAtTime(0, t0 + Math.min(o.dur ?? 0.5, 0.6), 0.35);
  src.connect(lp).connect(amp).connect(voice(b, o.wet ?? 0.3, o.dest));
  src.start(t0);
  src.stop(t0 + 1.8);
}

/** Play one pitched note on an instrument. */
export function note(b: Bus, inst: Inst, o: NoteOpt) {
  switch (inst) {
    case "ep":
      return fmNote(b, { peak: 0.14, ...o }, 1, 1.8, 0.7, o.f > 600 ? 1.1 : 1.8, { ratio: 14, index: 0.35, decay: 0.06 });
    case "marimba":
      return fmNote(b, { peak: 0.2, ...o }, 4, 1.6, 0.06, o.f > 900 ? 0.32 : 0.5);
    case "musicbox":
      return fmNote(b, { peak: 0.16, wet: 0.4, ...o }, 5, 0.9, 0.18, 1.3);
    case "bell":
      return fmNote(b, { peak: 0.12, wet: 0.45, ...o }, 3.5, 2.2, 1.2, 2.2);
    case "steel":
      return steelNote(b, o);
    case "pluck":
      return pluckNote(b, o);
    case "brass":
      return brassNote(b, o);
    case "bass":
      return bassNote(b, o);
    case "lead":
      return leadNote(b, o);
    case "pad":
      return padNote(b, o);
  }
}

/* ---------------- drums ---------------- */

export function kick(b: Bus, o: When & { peak?: number; tone?: number } = {}) {
  const { c } = b;
  const t0 = t0Of(b, o);
  const peak = o.peak ?? 0.85;
  const f = o.tone ?? 1;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(165 * f, t0);
  osc.frequency.exponentialRampToValueAtTime(46 * f, t0 + 0.11);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.002);
  amp.gain.setTargetAtTime(0, t0 + 0.002, 0.1);
  osc.connect(amp).connect(voice(b, 0.04, o.dest));
  osc.start(t0);
  osc.stop(t0 + 0.6);
  burst(b, { at: o.at, abs: o.abs, dest: o.dest, dur: 0.003, decay: 0.006, type: "lowpass", f: 3500, q: 0.7, peak: peak * 0.22, wet: 0 });
}

export function snare(b: Bus, o: When & { peak?: number } = {}) {
  const peak = o.peak ?? 0.4;
  burst(b, { ...o, dur: 0.01, decay: 0.13, type: "bandpass", f: 2300, q: 0.6, hp: 900, peak, wet: 0.22 });
  tone(b, { ...o, f: 190, f2: 160, glide: 0.06, type: "triangle", peak: peak * 0.55, attack: 0.001, decay: 0.07, wet: 0.15 });
}

export function clap(b: Bus, o: When & { peak?: number } = {}) {
  const peak = o.peak ?? 0.3;
  const base = o.at ?? 0;
  for (const d of [0, 0.011, 0.023]) burst(b, { abs: o.abs, dest: o.dest, at: base + d, dur: 0.002, decay: 0.012, f: 1300, q: 1.1, peak, wet: 0.2 });
  burst(b, { abs: o.abs, dest: o.dest, at: base + 0.03, dur: 0.004, decay: 0.12, f: 1150, q: 0.9, peak: peak * 0.75, wet: 0.35 });
}

export function hat(b: Bus, o: When & { peak?: number; open?: boolean } = {}) {
  burst(b, { ...o, dur: 0.002, decay: o.open ? 0.17 : 0.028, type: "highpass", f: 7600, q: 0.7, peak: o.peak ?? 0.12, wet: 0.08 });
}

export function shaker(b: Bus, o: When & { peak?: number } = {}) {
  burst(b, { ...o, dur: 0.03, attack: 0.012, decay: 0.035, type: "bandpass", f: 6200, q: 1.3, peak: o.peak ?? 0.07, wet: 0.08 });
}

export function crash(b: Bus, o: When & { peak?: number; decay?: number } = {}) {
  const peak = o.peak ?? 0.22;
  burst(b, { ...o, dur: 0.004, decay: o.decay ?? 1.5, type: "highpass", f: 4200, q: 0.5, peak, wet: 0.4 });
  burst(b, { ...o, dur: 0.004, decay: (o.decay ?? 1.5) * 0.6, type: "bandpass", f: 7800, q: 0.8, peak: peak * 0.6, wet: 0.4 });
}

export function tom(b: Bus, o: When & { peak?: number; pitch?: number } = {}) {
  const p = o.pitch ?? 1;
  tone(b, { ...o, f: 210 * p, f2: 92 * p, glide: 0.2, peak: o.peak ?? 0.5, attack: 0.002, decay: 0.32, wet: 0.25 });
  burst(b, { ...o, dur: 0.01, decay: 0.04, type: "lowpass", f: 1400, q: 0.7, peak: (o.peak ?? 0.5) * 0.3, wet: 0.15 });
}

export function clave(b: Bus, o: When & { peak?: number; pitch?: number } = {}) {
  const p = o.pitch ?? 1;
  tone(b, { ...o, f: 2450 * p, peak: o.peak ?? 0.2, attack: 0.001, decay: 0.05, wet: 0.2 });
  tone(b, { ...o, f: 980 * p, peak: (o.peak ?? 0.2) * 0.35, attack: 0.001, decay: 0.03, wet: 0.1 });
}
