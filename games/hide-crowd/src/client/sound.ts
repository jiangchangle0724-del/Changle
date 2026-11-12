// Sounds, made in the page (no sound files): a punch's whoosh, a cartoon bonk when it lands, a body
// hitting the floor, the ferry horn and the opera gong, the last seconds' ticks, a whistle to start
// and a little fanfare at the end; on the big screen (and in practice) a light loop for the place.
// Phones only allow sound after a tap, so the first tap unlocks it. The menu's switch turns it off
// (hc.sound), and the game plays the same without it.
import type { ArenaId } from "../engine";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let on = readSound();

function readSound(): boolean {
  try {
    return localStorage.getItem("hc.sound") !== "0";
  } catch {
    return true;
  }
}

export const soundOn = () => on;

export function setSound(value: boolean): void {
  on = value;
  try {
    localStorage.setItem("hc.sound", value ? "1" : "0");
  } catch {
    // private mode: forgotten next time
  }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0.9 : 0, ctx.currentTime, 0.03);
  if (value) unlockAudio();
}

export function unlockAudio(): void {
  try {
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.9 : 0;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16;
    musicBus.connect(master);
    // (a silent blip: iOS only opens the speaker for a sound started inside the tap)
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, 22050);
    blip.connect(ctx.destination);
    blip.start(0);
  } catch {
    ctx = null;
  }
}

let installed = false;
export function installAudioUnlock(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  for (const name of ["pointerdown", "touchend", "keydown"]) document.addEventListener(name, unlockAudio, { passive: true });
}

/** the audio clock, when sound may play now */
function now(): number | null {
  if (!on || !ctx || !master || ctx.state !== "running") return null;
  return ctx.currentTime;
}

/** One voice: an oscillator gliding from one pitch to another, with a quick attack and a fall. */
function voice(type: OscillatorType, from: number, to: number, start: number, length: number, level: number, out: AudioNode = master!, attack = 0.006): void {
  const c = ctx!;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;
/** A breath of noise through a sweeping band-pass: whooshes, scuffs, the crack of a hit. */
function hiss(start: number, length: number, level: number, from: number, to: number, q = 1.2, out: AudioNode = master!): void {
  const c = ctx!;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + length);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + Math.min(0.03, length / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(filter).connect(gain).connect(out);
  source.start(start, Math.random() * 0.5);
  source.stop(start + length + 0.05);
}

/** The music dips under the big moments, and comes back. */
function duck(start: number, length: number): void {
  if (!musicBus || !ctx) return;
  musicBus.gain.cancelScheduledValues(start);
  musicBus.gain.setTargetAtTime(0.05, start, 0.05);
  musicBus.gain.setTargetAtTime(0.16, start + length, 0.4);
}

export const sfx = {
  /** a punch thrown */
  whoosh(): void {
    const t = now();
    if (t === null) return;
    hiss(t, 0.18, 0.32, 700, 2_600, 1.4);
  },
  /** a punch that lands: a cartoon bonk on a thump */
  bonk(): void {
    const t = now();
    if (t === null) return;
    voice("sine", 620, 150, t, 0.18, 0.42);
    voice("triangle", 1_240, 300, t, 0.1, 0.12);
    voice("sine", 120, 48, t, 0.24, 0.55);
    hiss(t, 0.06, 0.3, 2_400, 900, 0.8);
  },
  /** a body hitting the floor */
  thud(delay = 0): void {
    const t = now();
    if (t === null) return;
    voice("sine", 95, 40, t + delay, 0.28, 0.5);
    hiss(t + delay, 0.14, 0.18, 500, 160, 0.7);
  },
  /** you hit a passer-by: a sheepish two-note slide */
  oops(): void {
    const t = now();
    if (t === null) return;
    voice("square", 392, 370, t, 0.13, 0.09);
    voice("square", 294, 262, t + 0.14, 0.22, 0.09);
  },
  /** you were spotted */
  spotted(): void {
    const t = now();
    if (t === null) return;
    voice("sawtooth", 520, 120, t, 0.55, 0.12, master!, 0.01);
    voice("sine", 260, 70, t, 0.5, 0.2);
  },
  /** the ferry horn: a long low blast, two pipes a fifth apart */
  horn(): void {
    const t = now();
    if (t === null) return;
    const c = ctx!;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.connect(master!);
    for (const [pitch, level] of [
      [98, 0.22],
      [147, 0.16],
      [196, 0.06]
    ] as const) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(pitch * 0.97, t);
      osc.frequency.linearRampToValueAtTime(pitch, t + 0.25);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.18);
      gain.gain.setValueAtTime(level, t + 1.45);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      osc.connect(gain).connect(filter);
      osc.start(t);
      osc.stop(t + 2.1);
    }
    duck(t, 2.2);
  },
  /** the opera gong: a bright strike that rings and wobbles */
  gong(): void {
    const t = now();
    if (t === null) return;
    for (const [pitch, length, level] of [
      [118, 2.6, 0.24],
      [163, 2.1, 0.16],
      [247, 1.6, 0.12],
      [338, 1.1, 0.08],
      [452, 0.7, 0.06],
      [610, 0.45, 0.05]
    ] as const) {
      voice("sine", pitch * 1.02, pitch * 0.985, t, length, level, master!, 0.004);
    }
    hiss(t, 0.09, 0.2, 3_000, 1_200, 0.9);
    duck(t, 2.4);
  },
  /** one of the last five seconds */
  tick(last = false): void {
    const t = now();
    if (t === null) return;
    voice("sine", last ? 1_320 : 1_760, last ? 1_300 : 1_740, t, 0.05, 0.14);
  },
  /** the round starts */
  whistle(): void {
    const t = now();
    if (t === null) return;
    const c = ctx!;
    const osc = c.createOscillator();
    const wobble = c.createOscillator();
    const depth = c.createGain();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 2_100;
    wobble.frequency.value = 28;
    depth.gain.value = 90;
    wobble.connect(depth).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    gain.gain.setValueAtTime(0.16, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(gain).connect(master!);
    osc.start(t);
    wobble.start(t);
    osc.stop(t + 0.45);
    wobble.stop(t + 0.45);
  },
  /** the round is over */
  fanfare(): void {
    const t = now();
    if (t === null) return;
    [523, 659, 784, 1_047].forEach((pitch, index) => voice("triangle", pitch, pitch, t + index * 0.11, index === 3 ? 0.5 : 0.16, 0.18));
    duck(t, 0.9);
  }
};

/** A buzz in the hand (Android; iPhones don't let a page do it). */
export function buzz(pattern: number | number[]): void {
  try {
    if (on && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // not allowed here
  }
}

// --- the place's loop: a light groove under the round (big screen and practice only) ---

interface Groove {
  bpm: number;
  /** the bass's notes (MIDI), one a bar */
  bass: number[];
  /** the tune's scale (MIDI) and its voice */
  scale: number[];
  lead: OscillatorType;
  /** a woodblock instead of hi-hats (the theatre) */
  block: boolean;
}

const GROOVES: Record<ArenaId, Groove> = {
  // a sunny bayside stroll
  plaza: { bpm: 104, bass: [48, 45, 41, 43], scale: [72, 74, 76, 79, 81, 84], lead: "triangle", block: false },
  // a busy concourse
  metro: { bpm: 116, bass: [45, 45, 41, 43], scale: [69, 72, 74, 76, 79, 81], lead: "square", block: false },
  // the courtyard theatre: pentatonic, plucked, a woodblock keeping time
  gallery: { bpm: 96, bass: [43, 43, 38, 40], scale: [67, 69, 71, 74, 76, 79], lead: "triangle", block: true }
};

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

let loop: { timer: number; arena: ArenaId; step: number; at: number; seed: number } | null = null;

export function startMusic(arena: ArenaId): void {
  if (loop?.arena === arena) return;
  stopMusic();
  loop = { timer: 0, arena, step: 0, at: 0, seed: (Math.random() * 1e9) | 0 };
  const groove = GROOVES[arena];
  const beat = 60 / groove.bpm / 2; // eighth notes
  const pattern = Array.from({ length: 16 }, (_, index) => {
    // the same little tune for the whole round, made up once
    const value = Math.sin((index + 1) * 12.9898 + loop!.seed) * 43758.5453;
    const roll = value - Math.floor(value);
    return index % 2 === 0 && roll < 0.62 ? groove.scale[Math.floor(roll * 9.7) % groove.scale.length] : roll > 0.86 ? groove.scale[Math.floor(roll * 13) % groove.scale.length] : 0;
  });
  const schedule = () => {
    const current = loop;
    if (!current || !ctx || !musicBus || !on || ctx.state !== "running") return;
    if (current.at < ctx.currentTime) current.at = ctx.currentTime + 0.05;
    while (current.at < ctx.currentTime + 0.25) {
      const step = current.step % 16;
      const bar = Math.floor(current.step / 16) % groove.bass.length;
      const t = current.at;
      // kick on the beat, a light snare on 2 and 4, hats (or the woodblock) on the off-beats
      if (step % 4 === 0) voice("sine", 140, 45, t, 0.16, 0.5, musicBus);
      if (step % 8 === 4) hiss(t, 0.09, 0.22, 2_200, 1_400, 0.8, musicBus);
      if (step % 2 === 1) {
        if (groove.block) voice("sine", 1_050, 980, t, 0.05, 0.16, musicBus);
        else hiss(t, 0.035, 0.1, 8_000, 7_000, 1.5, musicBus);
      }
      if (step % 4 === 0 || step === 6 || step === 14) voice("triangle", midi(groove.bass[bar]), midi(groove.bass[bar]), t, beat * 1.6, 0.28, musicBus);
      const note = pattern[step];
      if (note) voice(groove.lead, midi(note), midi(note) * (groove.block ? 0.995 : 1), t, beat * 1.3, groove.lead === "square" ? 0.05 : 0.12, musicBus);
      current.step++;
      current.at += beat;
    }
  };
  loop.timer = window.setInterval(schedule, 60);
  schedule();
}

export function stopMusic(): void {
  if (!loop) return;
  window.clearInterval(loop.timer);
  loop = null;
}
