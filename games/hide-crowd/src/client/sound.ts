// Sounds, made in the page (no sound files): a punch's whoosh, a cartoon bonk when it lands, a body
// hitting the floor, the ferry horn, the busker's riff, the opera gong, the theatre's drill (the
// stage's count and the crowd's punches), the night market's firecrackers and fireworks, a bite at a
// stall and a feast, the last seconds' ticks, a whistle to start and a little fanfare at the end; on the big
// screen (and in practice) a light loop for the place. Phones only allow sound after a tap, so the
// first tap unlocks it. The menu's two switches turn the sounds off (hc.sound) and the music
// (hc.music), and the game plays the same without.
import { DRILL_BEAT_MS, DRILL_GO_MS, type ArenaId } from "../engine";
import { FIREWORK_RISE_MS, FIREWORK_SHOTS } from "./fireworks";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let on = readFlag("hc.sound");
let music = readFlag("hc.music");
const MUSIC_LEVEL = 0.16;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function keepFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // private mode: forgotten next time
  }
}

export const soundOn = () => on;
export const musicOn = () => music;

export function setSound(value: boolean): void {
  on = value;
  keepFlag("hc.sound", value);
  if (master && ctx) master.gain.setTargetAtTime(value ? 0.9 : 0, ctx.currentTime, 0.03);
  if (value) unlockAudio();
}

export function setMusic(value: boolean): void {
  music = value;
  keepFlag("hc.music", value);
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(value ? MUSIC_LEVEL : 0, ctx.currentTime, 0.05);
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
    musicBus.gain.value = music ? MUSIC_LEVEL : 0;
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
/** A second of white noise, made once. */
function noise(): AudioBuffer {
  const c = ctx!;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** A breath of noise through a sweeping band-pass: whooshes, scuffs, the crack of a hit. */
function hiss(start: number, length: number, level: number, from: number, to: number, q = 1.2, out: AudioNode = master!): void {
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = noise();
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

/** A fuse burning: a thin, spitting hiss that holds until the bang. */
function sizzle(start: number, length: number, level: number): void {
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = noise();
  source.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 4_500;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.04);
  // (it spits: the level flickers)
  for (let at = start + 0.06; at < start + length - 0.05; at += 0.07) gain.gain.setValueAtTime(level * (0.55 + Math.random() * 0.45), at);
  gain.gain.setValueAtTime(level, start + Math.max(0.05, length - 0.04));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(filter).connect(gain).connect(master!);
  source.start(start, Math.random() * 0.5);
  source.stop(start + length + 0.05);
}

/** The music dips under the big moments, and comes back. */
function duck(start: number, length: number): void {
  if (!musicBus || !ctx || !music) return;
  musicBus.gain.cancelScheduledValues(start);
  musicBus.gain.setTargetAtTime(0.05, start, 0.05);
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL, start + length, 0.4);
}

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

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
  /**
   * The theatre's drill: the stage's count on a big drum, three beats rising, then the call, a deep
   * hit under the whole crowd's punches swishing at once. In time with the screen's count: `elapsedMs`
   * is how far into the drill this screen came in (a beat already gone isn't played).
   */
  drill(elapsedMs = 0): void {
    const t = now();
    if (t === null) return;
    const at = (ms: number) => t + (ms - elapsedMs) / 1000;
    [0, 1, 2].forEach((beat) => {
      const start = at(beat * DRILL_BEAT_MS);
      if (start < t - 0.03) return;
      const pitch = 150 + beat * 22;
      voice("sine", pitch, pitch * 0.42, start, 0.34, 0.5);
      voice("triangle", pitch * 2.02, pitch * 0.9, start, 0.1, 0.1, master!, 0.003);
      hiss(start, 0.05, 0.16, 1_600, 600, 0.9);
    });
    const go = at(DRILL_GO_MS);
    if (go >= t - 0.03) {
      voice("sine", 120, 34, go, 0.55, 0.62);
      voice("square", 240, 120, go, 0.09, 0.06, master!, 0.003);
      hiss(go, 0.3, 0.38, 500, 2_900, 1);
      hiss(go + 0.08, 0.24, 0.26, 2_600, 800, 0.8);
    }
    duck(t, Math.max(0.4, (DRILL_GO_MS + 700 - elapsedMs) / 1000));
  },
  /**
   * The night market's firecrackers, in time with the screen: each one's throw (a whoosh), its landing
   * (a tick on the asphalt), its fuse (a spitting hiss) and its bang, with the crackle of the paper.
   * Times are from now (ms); one already gone isn't played.
   */
  crackers(list: readonly { landsInMs: number; bangsInMs: number }[]): void {
    const t = now();
    if (t === null) return;
    let last = t;
    for (const cracker of list) {
      const land = t + cracker.landsInMs / 1000;
      const bang = t + cracker.bangsInMs / 1000;
      if (bang < t - 0.03) continue;
      if (land >= t) {
        hiss(Math.max(t, land - 0.45), 0.42, 0.07, 800, 2_400, 1.2);
        voice("triangle", 1_900, 1_350, land, 0.05, 0.07, master!, 0.002);
      }
      const fuse = Math.max(t, land);
      if (bang - fuse > 0.08) sizzle(fuse, bang - fuse, 0.035);
      voice("sine", 170, 36, bang, 0.45, 0.6);
      voice("square", 330, 90, bang, 0.07, 0.06, master!, 0.002);
      hiss(bang, 0.3, 0.5, 3_400, 500, 0.7);
      for (let pop = 0; pop < 8; pop++) hiss(bang + 0.07 + pop * 0.042 + ((pop * 29) % 7) / 350, 0.025, 0.13, 6_000, 4_000, 2);
      last = Math.max(last, bang);
    }
    duck(t, last - t + 0.7);
  },
  /** the transit hall's busker strikes up: a bouncy plucked riff over a bass and claps, for the dance */
  busker(): void {
    const t = now();
    if (t === null) return;
    const eighth = 0.165;
    const riff = [67, 71, 74, 71, 76, 74, 71, 69, 67, 71, 74, 79, 76, 74, 71, 67];
    const bass = [43, 43, 48, 50];
    riff.forEach((note, index) => {
      const at = t + index * eighth;
      voice("triangle", midi(note), midi(note), at, eighth * 1.6, 0.16, master!, 0.004);
      voice("square", midi(note + 12), midi(note + 12), at, eighth * 0.6, 0.025, master!, 0.003);
      if (index % 2 === 0) voice("triangle", midi(bass[Math.floor(index / 4)]), midi(bass[Math.floor(index / 4)]), at, eighth * 1.8, 0.2);
      if (index % 4 === 2) hiss(at, 0.07, 0.2, 1_800, 1_200, 1.1);
    });
    duck(t, riff.length * eighth + 0.2);
  },
  /** a bite at one of the night market's stalls: a crunch and a little bell, each stall its own note */
  bite(stall: number): void {
    const t = now();
    if (t === null) return;
    hiss(t, 0.07, 0.26, 3_400, 1_400, 1.1);
    hiss(t + 0.06, 0.05, 0.18, 2_800, 1_200, 1.1);
    const note = midi([79, 81, 84, 86][stall % 4]);
    voice("sine", note, note, t + 0.08, 0.32, 0.16, master!, 0.004);
    voice("triangle", note * 2, note * 2, t + 0.08, 0.12, 0.04, master!, 0.003);
  },
  /** all four tasted: the four stalls' bells running up, and a sparkle */
  feast(): void {
    const t = now();
    if (t === null) return;
    [79, 81, 84, 86, 91].forEach((note, index) => {
      const at = t + index * 0.085;
      voice("triangle", midi(note), midi(note), at, index === 4 ? 0.6 : 0.18, 0.15, master!, 0.004);
      voice("sine", midi(note + 12), midi(note + 12), at, 0.12, 0.05, master!, 0.003);
    });
    for (let index = 0; index < 6; index++) hiss(t + 0.42 + index * 0.05, 0.04, 0.06, 7_000, 6_000, 3);
    duck(t, 0.9);
  },
  /** the night market's fireworks: each rocket whistles up, bursts with a boom and crackles (in time with the picture) */
  fireworks(): void {
    const t = now();
    if (t === null) return;
    for (const shot of FIREWORK_SHOTS) {
      const up = t + shot.at / 1000;
      const burst = up + FIREWORK_RISE_MS / 1000;
      voice("sine", 520, 1_900, up, FIREWORK_RISE_MS / 1000, 0.035, master!, 0.08);
      hiss(up, FIREWORK_RISE_MS / 1000, 0.05, 1_200, 4_000, 2.5);
      voice("sine", 120, 36, burst, 0.6, 0.45, master!, 0.004);
      hiss(burst, 0.7, 0.3, 1_100, 180, 0.6);
      for (let crack = 0; crack < 9; crack++) hiss(burst + 0.18 + crack * 0.055 + ((crack * 37) % 10) / 400, 0.03, 0.07, 6_000, 4_500, 2.2);
    }
    const last = FIREWORK_SHOTS[FIREWORK_SHOTS.length - 1];
    duck(t, (last.at + FIREWORK_RISE_MS) / 1000 + 0.8);
  },
  /** your distraction: a sly little whistle down and up, only for you */
  psst(): void {
    const t = now();
    if (t === null) return;
    hiss(t, 0.16, 0.12, 4_200, 2_600, 2.2);
    voice("sine", 1_480, 990, t + 0.05, 0.16, 0.08, master!, 0.01);
    voice("sine", 990, 1_480, t + 0.22, 0.18, 0.08, master!, 0.01);
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
  gallery: { bpm: 96, bass: [43, 43, 38, 40], scale: [67, 69, 71, 74, 76, 79], lead: "triangle", block: true },
  // the night market: a bright, bustling pentatonic over a walking bass
  market: { bpm: 112, bass: [41, 45, 46, 48], scale: [72, 74, 77, 79, 81, 84], lead: "triangle", block: false }
};

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
    if (!current || !ctx || !musicBus || !on || !music || ctx.state !== "running") return;
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
