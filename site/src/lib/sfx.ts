/**
 * The party's sounds, all synthesized in the browser: nothing to download, nothing to license.
 * A universal party palette: glass and dice on a table, claps and poppers, an air horn for
 * penalties, a drum roll for reveals, marimba and bell chimes for turns and right answers.
 */
import {
  bus,
  burst,
  clap,
  clave,
  crash,
  duck,
  initAudio,
  isEnabled,
  kick,
  midiHz,
  note,
  setEnabled,
  snare,
  strike,
  tom,
  tone,
  unlockAudio as unlock,
  voice,
  type Bus,
} from "./audio/engine";
import { startBackground, stopBackground } from "./music";

export { initAudio };
let lastTick = 0;

export function unlockAudio() {
  unlock();
}

export function setSfxEnabled(on: boolean) {
  setEnabled(on);
  if (!on) stopBackground();
}

export function isSfxEnabled() {
  return isEnabled();
}

const C5 = 72;
/** Major pentatonic from C5: the "happy" scale every chime is drawn from. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].map((s) => midiHz(C5 + s));

function hornAt(b: Bus, at: number, dur: number, peak: number) {
  const { c } = b;
  const t0 = c.currentTime + at;
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    curve[i] = Math.tanh(x * 3);
  }
  shaper.curve = curve;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 320;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.018);
  amp.gain.setValueAtTime(peak, t0 + dur - 0.03);
  amp.gain.linearRampToValueAtTime(0, t0 + dur);
  shaper.connect(hp).connect(lp).connect(amp).connect(voice(b, 0.22));
  for (const [f, det] of [
    [466, -6],
    [466, 5],
    [699, 0],
    [932, -4],
  ] as const) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 0.86, t0);
    o.frequency.linearRampToValueAtTime(f, t0 + 0.045);
    o.detune.value = det;
    const g = c.createGain();
    g.gain.value = f > 800 ? 0.18 : 0.32;
    o.connect(g).connect(shaper);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}

function buzzerAt(b: Bus, at: number, dur: number, peak: number, pitch = 1) {
  const { c } = b;
  const t0 = c.currentTime + at;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1700;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  amp.gain.setValueAtTime(peak, t0 + dur - 0.04);
  amp.gain.linearRampToValueAtTime(0, t0 + dur);
  lp.connect(amp).connect(voice(b, 0.12));
  for (const [f, type] of [
    [110 * pitch, "square"],
    [111.5 * pitch, "sawtooth"],
    [165 * pitch, "square"],
  ] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0.33;
    o.connect(g).connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}

function popperAt(b: Bus, at: number, peak: number) {
  burst(b, { at, dur: 0.003, decay: 0.03, type: "highpass", f: 900, q: 0.7, peak, wet: 0.25 });
  tone(b, { f: 900, f2: 110, glide: 0.05, at, peak: peak * 0.6, attack: 0.001, decay: 0.06, wet: 0.2 });
  // the confetti settling
  for (let i = 0; i < 16; i++) {
    const t = at + 0.05 + Math.pow(Math.random(), 1.6) * 0.75;
    burst(b, { at: t, dur: 0.003, decay: 0.012, f: 4500 + Math.random() * 4500, q: 2, peak: peak * (0.05 + Math.random() * 0.06), wet: 0.3 });
  }
}

function applauseAt(b: Bus, at: number, seconds: number, vol: number) {
  const n = Math.round(seconds * 38);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const t = at + u * seconds;
    const swell = Math.sin(Math.PI * Math.min(1, u * 1.25)) * 0.8 + 0.2;
    burst(b, { at: t, dur: 0.002, decay: 0.012 + Math.random() * 0.02, f: 900 + Math.random() * 1900, q: 1.4, peak: (0.03 + Math.random() * 0.05) * swell * vol, wet: 0.35 });
  }
  burst(b, { at, dur: seconds, attack: seconds * 0.3, type: "bandpass", f: 1400, q: 0.5, peak: 0.025 * vol, wet: 0.4 });
}

function chime(b: Bus, steps: number[], gap: number, inst: "marimba" | "bell" | "ep" = "marimba", peak = 0.18, at = 0) {
  steps.forEach((s, i) => note(b, inst, { f: PENTA[Math.max(0, Math.min(PENTA.length - 1, s))], at: at + i * gap, peak }));
}

/* ---------------- the cues ---------------- */

export const sfx = {
  /** A wheel's pointer clicking past a peg. */
  tick(speed = 1) {
    const b = bus();
    if (!b) return;
    const now = performance.now();
    if (now - lastTick < 26) return;
    lastTick = now;
    const s = Math.max(0.35, Math.min(1.2, speed));
    burst(b, { dur: 0.004, decay: 0.012, f: 3200 + s * 600, q: 2.5, peak: 0.1 * s, wet: 0.1 });
    tone(b, { f: 1700 + s * 300, f2: 1100, glide: 0.015, peak: 0.04 * s, attack: 0.001, decay: 0.018, wet: 0.08 });
  },

  /** A soft whir while something spins; drive it with set(speed in deg/s). */
  spinLoop() {
    const b = bus();
    if (!b) return { set: (_: number) => {}, stop: () => {} };
    const { c } = b;
    const src = c.createBufferSource();
    src.buffer = (() => {
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    })();
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 300;
    lp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(lp).connect(g).connect(voice(b, 0.08));
    src.start();
    let stopped = false;
    return {
      set(speed: number) {
        if (stopped) return;
        const v = Math.min(1, Math.abs(speed) / 1600);
        g.gain.setTargetAtTime(v * 0.07, c.currentTime, 0.05);
        lp.frequency.setTargetAtTime(220 + v * 700, c.currentTime, 0.05);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        g.gain.setTargetAtTime(0, c.currentTime, 0.08);
        src.stop(c.currentTime + 0.5);
      },
    };
  },

  /** Something lands on its spot: a two-note marimba ding. */
  settle() {
    const b = bus();
    if (!b) return;
    note(b, "marimba", { f: midiHz(84), peak: 0.16 });
    note(b, "bell", { f: midiHz(88), at: 0.07, peak: 0.07 });
  },

  /** A soft click for ordinary buttons. */
  tap() {
    const b = bus();
    if (!b) return;
    tone(b, { f: 1250, f2: 820, glide: 0.02, peak: 0.07, attack: 0.001, decay: 0.03, wet: 0.08 });
  },

  /** Something small appears (a chip, a vote). */
  pop() {
    const b = bus();
    if (!b) return;
    tone(b, { f: 480, f2: 980, glide: 0.035, peak: 0.12, attack: 0.002, decay: 0.06, wet: 0.2 });
  },

  woodblock(pitch = 1, vol = 1) {
    const b = bus();
    if (!b) return;
    clave(b, { pitch, peak: 0.24 * vol });
  },

  /** One marimba note from the pentatonic scale (degree 0 = C5). */
  pluck(degree = 5, vol = 1) {
    const b = bus();
    if (!b) return;
    note(b, "marimba", { f: PENTA[Math.max(0, Math.min(PENTA.length - 1, degree))], peak: 0.2 * vol });
  },

  cardSlide() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.16, attack: 0.015, type: "bandpass", f: 3200, f2: 1800, q: 0.7, hp: 1200, peak: 0.12, wet: 0.12 });
  },

  /** A card snapping over on the table. */
  flip() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.035, decay: 0.03, f: 1500, q: 1, peak: 0.2, wet: 0.15 });
    tone(b, { f: 190, f2: 120, glide: 0.05, peak: 0.08, attack: 0.002, decay: 0.06, wet: 0.1 });
    burst(b, { at: 0.085, dur: 0.02, decay: 0.03, f: 2400, q: 1.2, peak: 0.1, wet: 0.15 });
  },

  /** A riffle shuffle. */
  shuffle() {
    const b = bus();
    if (!b) return;
    for (let i = 0; i < 18; i++) burst(b, { at: i * 0.024 + Math.random() * 0.006, dur: 0.012, decay: 0.02, f: 2000 + Math.random() * 1800, q: 1.4, peak: 0.05 + Math.random() * 0.04, wet: 0.12 });
    burst(b, { at: 0.46, dur: 0.22, attack: 0.03, f: 900, f2: 3000, q: 0.8, peak: 0.06, wet: 0.15 });
  },

  /** A reveal: air rushing up into a bright shimmer. */
  lift() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.45, attack: 0.25, f: 380, f2: 4200, q: 1.1, peak: 0.07, wet: 0.4 });
    note(b, "bell", { f: midiHz(91), at: 0.32, peak: 0.07 });
    note(b, "bell", { f: midiHz(96), at: 0.4, peak: 0.05 });
  },

  whoosh(seconds = 0.45, up = true) {
    const b = bus();
    if (!b) return;
    burst(b, { dur: seconds, attack: seconds * 0.4, f: up ? 320 : 2600, f2: up ? 2600 : 320, q: 1.2, peak: 0.07, wet: 0.3 });
  },

  /** The penalty: a boom, a cymbal and the air horn. */
  stamp(vol = 1) {
    const b = bus();
    if (!b) return;
    duck(b, 1.2);
    kick(b, { peak: 0.95 * vol });
    snare(b, { peak: 0.35 * vol });
    crash(b, { peak: 0.16 * vol, decay: 1.2 });
    hornAt(b, 0.06, 0.13, 0.2 * vol);
    hornAt(b, 0.24, 0.42, 0.22 * vol);
  },

  /** Beer going down. */
  pour(seconds = 0.8, vol = 1) {
    const b = bus();
    if (!b) return;
    const { c } = b;
    const t0 = c.currentTime;
    const src = c.createBufferSource();
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    const steps = 24;
    const curve = new Float32Array(steps);
    let f = 900;
    for (let i = 0; i < steps; i++) {
      f = Math.max(650, Math.min(1550, f + (Math.random() - 0.5) * 260));
      curve[i] = f;
    }
    bp.frequency.setValueCurveAtTime(curve, t0, seconds);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.13 * vol, t0 + 0.07);
    g.gain.setValueAtTime(0.13 * vol, t0 + seconds * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + seconds);
    src.connect(bp).connect(g).connect(voice(b, 0.3));
    src.start(t0, Math.random());
    src.stop(t0 + seconds + 0.05);
    for (let i = 0; i < 9; i++) tone(b, { f: 520 + Math.random() * 500, f2: 1300 + Math.random() * 600, glide: 0.035, at: 0.05 + Math.random() * (seconds - 0.1), peak: 0.035 * vol, attack: 0.002, decay: 0.045, wet: 0.4 });
  },

  /** Gulps, then the glass goes back down on the table. */
  gulps(n = 3, vol = 1) {
    const b = bus();
    if (!b) return;
    for (let i = 0; i < n; i++) {
      const at = i * 0.36;
      burst(b, { at, dur: 0.09, attack: 0.02, type: "lowpass", f: 520, q: 1, peak: 0.22 * vol, wet: 0.12 });
      tone(b, { f: 200, f2: 105, glide: 0.11, at, peak: 0.16 * vol, attack: 0.01, decay: 0.12, wet: 0.12 });
    }
    tone(b, { f: 620, f2: 540, glide: 0.04, at: n * 0.36 + 0.12, peak: 0.18 * vol, attack: 0.001, decay: 0.06, wet: 0.2 });
    burst(b, { at: n * 0.36 + 0.12, dur: 0.01, decay: 0.03, type: "lowpass", f: 900, q: 0.7, peak: 0.18 * vol, wet: 0.15 });
  },

  /** Glasses touching. */
  clink(vol = 1) {
    const b = bus();
    if (!b) return;
    const j = 1 + (Math.random() - 0.5) * 0.04;
    strike(b, 2370 * j, [1, 1.65, 2.31, 3.09], [1, 0.6, 0.38, 0.22], [0.95, 0.6, 0.42, 0.28], { peak: 0.13 * vol, wet: 0.4 });
    strike(b, 2690 * j, [1, 1.57, 2.24], [0.75, 0.45, 0.25], [0.8, 0.5, 0.3], { at: 0.028, peak: 0.13 * vol, wet: 0.4 });
    burst(b, { dur: 0.004, decay: 0.008, type: "highpass", f: 5200, q: 0.7, peak: 0.06 * vol, wet: 0.1 });
  },

  /** Dice tumbling across the table, then landing. */
  dice(seconds = 0.95, vol = 1) {
    const b = bus();
    if (!b) return;
    let tt = 0;
    let gap = 0.045;
    while (tt < seconds - 0.12) {
      const fade = 1 - tt / seconds;
      tone(b, { f: 1500 + Math.random() * 1500, at: tt, peak: 0.06 * vol * (0.4 + fade), attack: 0.001, decay: 0.04, wet: 0.2 });
      burst(b, { at: tt, dur: 0.004, decay: 0.012, f: 3200, q: 3, peak: 0.06 * vol * (0.4 + fade), wet: 0.15 });
      tt += gap + Math.random() * 0.03;
      gap *= 1.08;
    }
    burst(b, { at: seconds - 0.1, dur: 0.006, decay: 0.05, type: "lowpass", f: 1200, q: 0.8, peak: 0.2 * vol, wet: 0.2 });
    burst(b, { at: seconds - 0.02, dur: 0.006, decay: 0.05, type: "lowpass", f: 1500, q: 0.8, peak: 0.16 * vol, wet: 0.2 });
  },

  /** Emphasis: big is a crash with a boom, small is a bright bell. */
  gong(kind: "big" | "small" = "big", vol = 1) {
    const b = bus();
    if (!b) return;
    if (kind === "big") {
      kick(b, { peak: 0.7 * vol });
      crash(b, { peak: 0.2 * vol });
    } else note(b, "bell", { f: midiHz(86), peak: 0.13 * vol });
  },

  drum(vol = 1) {
    const b = bus();
    if (!b) return;
    tom(b, { peak: 0.55 * vol });
  },

  /* ---------- the comedy club (Punchline's show) ---------- */

  /** Ba-dum-tss: the stand-up's punchline drum. */
  rimshot(vol = 1) {
    const b = bus();
    if (!b) return;
    tom(b, { pitch: 1.5, peak: 0.42 * vol });
    tom(b, { at: 0.13, pitch: 1.05, peak: 0.46 * vol });
    kick(b, { at: 0.36, peak: 0.5 * vol });
    crash(b, { at: 0.36, peak: 0.16 * vol, decay: 0.9 });
  },

  /** A steady snare roll that swells for `seconds`, then lands on a hit. */
  drumroll(seconds = 1.3, vol = 1) {
    const b = bus();
    if (!b) return;
    duck(b, seconds + 0.6);
    const n = Math.round(seconds / 0.042);
    for (let i = 0; i < n; i++) snare(b, { at: i * 0.042, peak: (0.05 + (i / n) * 0.18) * vol * (i % 2 ? 0.8 : 1) });
    kick(b, { at: seconds, peak: 0.8 * vol });
    crash(b, { at: seconds, peak: 0.18 * vol });
  },

  /** A card slapped onto the stage. */
  slam(vol = 1) {
    const b = bus();
    if (!b) return;
    kick(b, { peak: 0.55 * vol, tone: 1.4 });
    burst(b, { dur: 0.012, decay: 0.09, type: "lowpass", f: 1800, q: 0.8, peak: 0.28 * vol, wet: 0.2 });
    burst(b, { at: 0.005, dur: 0.004, decay: 0.03, type: "highpass", f: 3200, q: 0.8, peak: 0.12 * vol, wet: 0.1 });
  },

  /** The VS between two answers: a ringing metal hit. */
  versus(vol = 1) {
    const b = bus();
    if (!b) return;
    strike(b, 220, [1, 2.76, 5.4, 8.93], [1, 0.6, 0.35, 0.2], [1.4, 0.9, 0.5, 0.3], { peak: 0.12 * vol, wet: 0.45 });
    kick(b, { peak: 0.45 * vol, tone: 0.8 });
    burst(b, { dur: 0.35, attack: 0.02, f: 2600, f2: 400, q: 1, peak: 0.06 * vol, wet: 0.3 });
  },

  /** A line of text typing onto the screen. */
  type(chars = 6, vol = 1) {
    const b = bus();
    if (!b) return;
    const n = Math.min(14, Math.max(2, chars));
    for (let i = 0; i < n; i++) {
      const at = i * 0.045 + Math.random() * 0.012;
      burst(b, { at, dur: 0.002, decay: 0.012, type: "bandpass", f: 2600 + Math.random() * 1600, q: 2.5, peak: (0.07 + Math.random() * 0.04) * vol, wet: 0.05 });
    }
  },

  /** One vote dropping onto an answer: each one a step higher. */
  vote(step = 0, vol = 1) {
    const b = bus();
    if (!b) return;
    note(b, "marimba", { f: PENTA[Math.min(PENTA.length - 1, 3 + step)], peak: 0.17 * vol });
    tone(b, { f: 480, f2: 980, glide: 0.035, peak: 0.06 * vol, attack: 0.002, decay: 0.05, wet: 0.2 });
  },

  /** The crowd goes wild: applause with whistles on top. */
  cheer(seconds = 2.2, vol = 1) {
    const b = bus();
    if (!b) return;
    applauseAt(b, 0, seconds, vol * 1.1);
    for (let i = 0; i < 3; i++) {
      const at = 0.1 + i * 0.35 + Math.random() * 0.2;
      const f = 1500 + Math.random() * 900;
      tone(b, { at, f, f2: f * 1.6, glide: 0.18, type: "sine", peak: 0.035 * vol, attack: 0.03, decay: 0.28, wet: 0.35 });
    }
  },

  /** The show opens: a short brass fanfare over a snare fill. */
  showtime(vol = 1) {
    const b = bus();
    if (!b) return;
    duck(b, 1.6);
    [0, 0.06, 0.12].forEach((at) => snare(b, { at, peak: 0.12 * vol }));
    [67, 72, 76].forEach((m, i) => note(b, "brass", { f: midiHz(m), at: 0.18 + i * 0.1, dur: 0.11, peak: 0.08 * vol }));
    note(b, "brass", { f: midiHz(79), at: 0.5, dur: 0.6, peak: 0.09 * vol });
    note(b, "brass", { f: midiHz(72), at: 0.5, dur: 0.6, peak: 0.06 * vol });
    kick(b, { at: 0.5, peak: 0.7 * vol });
    crash(b, { at: 0.5, peak: 0.18 * vol });
  },

  /** A small tick as a score counts up. */
  count(vol = 1) {
    const b = bus();
    if (!b) return;
    tone(b, { f: 2100, peak: 0.035 * vol, attack: 0.001, decay: 0.02, wet: 0.05 });
  },

  /** A snare roll that speeds up, then a cymbal: for reveals. */
  reveal(vol = 1) {
    const b = bus();
    if (!b) return;
    duck(b, 1.6);
    let tt = 0;
    let gap = 0.1;
    let i = 0;
    while (tt < 0.95) {
      snare(b, { at: tt, peak: (0.08 + (i / 24) * 0.2) * vol });
      tt += gap;
      gap = Math.max(0.035, gap * 0.9);
      i++;
    }
    kick(b, { at: 1.0, peak: 0.85 * vol });
    crash(b, { at: 1.0, peak: 0.2 * vol });
  },

  /** Party poppers going off. */
  firecrackers(seconds = 1.4, vol = 1) {
    const b = bus();
    if (!b) return;
    const n = Math.max(2, Math.round(seconds * 2.4));
    for (let i = 0; i < n; i++) popperAt(b, (i / n) * seconds * 0.8 + Math.random() * 0.08, (0.3 + Math.random() * 0.15) * vol);
  },

  /** A camera shutter. */
  shutter() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.004, decay: 0.015, f: 3000, q: 4, peak: 0.32, wet: 0.12 });
    tone(b, { f: 1200, f2: 420, glide: 0.01, peak: 0.08, attack: 0.001, decay: 0.012, wet: 0.08 });
    tone(b, { f: 95, type: "sawtooth", at: 0.012, peak: 0.04, attack: 0.004, decay: 0.05, wet: 0.05 });
    burst(b, { at: 0.07, dur: 0.004, decay: 0.02, f: 2400, q: 3, peak: 0.26, wet: 0.15 });
  },

  /** A bicycle horn. */
  honk() {
    const b = bus();
    if (!b) return;
    const { c } = b;
    for (const [at, len] of [
      [0, 0.17],
      [0.24, 0.12],
    ] as const) {
      for (const f of [349, 440]) {
        const t0 = c.currentTime + at;
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.setValueAtTime(f, t0);
        o.frequency.linearRampToValueAtTime(f * 0.96, t0 + len);
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1300;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.015);
        g.gain.setValueAtTime(0.05, t0 + len - 0.03);
        g.gain.linearRampToValueAtTime(0, t0 + len);
        o.connect(lp).connect(g).connect(voice(b, 0.12));
        o.start(t0);
        o.stop(t0 + len + 0.02);
      }
    }
  },

  /** A timer's last seconds: clave ticks that rise in pitch. */
  countdown(secondsLeft: number) {
    const b = bus();
    if (!b) return;
    const urgent = secondsLeft <= 3;
    clave(b, { pitch: urgent ? 1.33 : 1, peak: urgent ? 0.3 : 0.17 });
  },

  /** Time's up: the game-show buzzer. */
  timeUp() {
    const b = bus();
    if (!b) return;
    buzzerAt(b, 0, 0.55, 0.16);
  },

  /** It's your turn: a rising two-note chime, noticeable on your own phone. */
  yourTurn() {
    const b = bus();
    if (!b) return;
    note(b, "marimba", { f: midiHz(79), peak: 0.2 });
    note(b, "marimba", { f: midiHz(84), at: 0.12, peak: 0.22 });
    note(b, "bell", { f: midiHz(91), at: 0.12, peak: 0.05 });
  },

  join() {
    const b = bus();
    if (!b) return;
    note(b, "marimba", { f: midiHz(76), peak: 0.15 });
    note(b, "marimba", { f: midiHz(83), at: 0.1, peak: 0.15 });
  },

  leave() {
    const b = bus();
    if (!b) return;
    note(b, "marimba", { f: midiHz(83), peak: 0.13 });
    note(b, "marimba", { f: midiHz(76), at: 0.12, peak: 0.13 });
  },

  /** Somebody got it right: a quick run up and a bell. */
  correct() {
    const b = bus();
    if (!b) return;
    chime(b, [5, 6, 7, 8, 10], 0.05, "marimba", 0.16);
    note(b, "bell", { f: midiHz(96), at: 0.27, peak: 0.07 });
  },

  /** A wrong answer: the short buzzer. */
  wrong() {
    const b = bus();
    if (!b) return;
    buzzerAt(b, 0, 0.26, 0.13, 0.94);
  },

  /** Let off the hook: a sparkle. */
  safe() {
    const b = bus();
    if (!b) return;
    note(b, "bell", { f: midiHz(88), peak: 0.1 });
    note(b, "bell", { f: midiHz(95), at: 0.08, peak: 0.09 });
    note(b, "marimba", { f: midiHz(100), at: 0.16, peak: 0.08 });
  },

  /** Losing: the sad trombone, four steps down. */
  sadTrombone(vol = 1) {
    const b = bus();
    if (!b) return;
    const steps = [63, 62, 61];
    steps.forEach((m, i) => note(b, "brass", { f: midiHz(m - 12), at: i * 0.34, dur: 0.3, peak: 0.1 * vol }));
    note(b, "brass", { f: midiHz(60 - 12), at: 1.02, dur: 0.95, peak: 0.1 * vol });
  },

  /** A crown lands: a short fanfare and a popper. */
  crown() {
    const b = bus();
    if (!b) return;
    [60, 64, 67].forEach((m, i) => note(b, "brass", { f: midiHz(m), at: i * 0.09, dur: 0.12, peak: 0.08 }));
    note(b, "brass", { f: midiHz(72), at: 0.27, dur: 0.5, peak: 0.09 });
    popperAt(b, 0.3, 0.32);
  },

  /** A side wins: fanfare, poppers, applause. */
  win() {
    const b = bus();
    if (!b) return;
    duck(b, 2.6);
    [60, 64, 67, 72].forEach((m, i) => note(b, "brass", { f: midiHz(m), at: i * 0.11, dur: 0.14, peak: 0.08 }));
    note(b, "brass", { f: midiHz(76), at: 0.44, dur: 0.75, peak: 0.09 });
    note(b, "brass", { f: midiHz(72), at: 0.44, dur: 0.75, peak: 0.06 });
    kick(b, { at: 0.44, peak: 0.6 });
    crash(b, { at: 0.44, peak: 0.16 });
    popperAt(b, 0.46, 0.35);
    popperAt(b, 0.62, 0.3);
    applauseAt(b, 0.5, 2.2, 1);
  },

  applause(seconds = 2, vol = 1) {
    const b = bus();
    if (!b) return;
    applauseAt(b, 0, seconds, vol);
  },

  /** A buzzer someone slaps to answer; each seat gets its own pitch. */
  buzz(seat = 0) {
    const b = bus();
    if (!b) return;
    const pitch = [1, 1.12, 1.26, 1.33, 1.5, 1.68, 0.89, 0.75][seat % 8];
    buzzerAt(b, 0, 0.22, 0.12, pitch * 1.8);
  },

  /** Music cuts out: a scratch and a power-down. */
  scratch() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.09, attack: 0.005, f: 700, f2: 2600, q: 2.2, peak: 0.3, wet: 0.1 });
    burst(b, { at: 0.09, dur: 0.1, attack: 0.005, f: 2600, f2: 500, q: 2.2, peak: 0.3, wet: 0.1 });
    tone(b, { f: 420, f2: 38, glide: 0.5, type: "sawtooth", at: 0.16, peak: 0.12, attack: 0.005, decay: 0.55, wet: 0.1 });
  },

  /** A held breath: two low heartbeats. */
  heartbeat(vol = 1) {
    const b = bus();
    if (!b) return;
    kick(b, { peak: 0.5 * vol, tone: 0.55 });
    kick(b, { at: 0.2, peak: 0.38 * vol, tone: 0.5 });
  },

  /** A clock's tick (or tock). */
  clock(tock = false) {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.002, decay: 0.014, f: tock ? 2100 : 3100, q: 5, peak: 0.16, wet: 0.08 });
  },

  /** Reactions people throw at the table. */
  reaction(r: "cheers" | "nice" | "haha" | "drink", vol = 1) {
    const b = bus();
    if (!b) return;
    if (r === "cheers") {
      sfx.clink(vol);
    } else if (r === "nice") {
      clap(b, { peak: 0.26 * vol });
      clap(b, { at: 0.14, peak: 0.26 * vol });
      clap(b, { at: 0.28, peak: 0.3 * vol });
    } else if (r === "haha") {
      // three bouncing chirps, each a little lower: ha, ha, ha
      [0, 0.12, 0.24].forEach((at, i) => {
        const f = 960 - i * 130;
        tone(b, { f, f2: f * 1.4, glide: 0.045, at, type: "triangle", peak: 0.17 * vol, attack: 0.006, decay: 0.085, wet: 0.2 });
      });
    } else {
      hornAt(b, 0, 0.1, 0.14 * vol);
      hornAt(b, 0.16, 0.22, 0.16 * vol);
    }
  },

  /** Two phones on the same number: a clash. */
  clash() {
    const b = bus();
    if (!b) return;
    snare(b, { peak: 0.35 });
    snare(b, { at: 0.03, peak: 0.3 });
    buzzerAt(b, 0.04, 0.18, 0.09, 1.2);
  },
};

/* ---------------- background music ---------------- */

export function startMusic() {
  startBackground();
}

export function stopMusic() {
  stopBackground();
}

export function haptic(pattern: number | number[] = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* no haptics on this device */
  }
}
