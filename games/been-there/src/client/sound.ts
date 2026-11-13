// Sounds in the golden-age-of-travel style, synthesised in the browser: the airport chime, a rubber
// stamp, a till, an auctioneer's gavel, a propeller plane. Each city's first arrival plays a few
// seconds of a real recording made there (media/sounds, credited in media.ts), and the sketch made
// here in the browser while the recording hasn't loaded (or can't: the single-file demo).
// Phones (and WeChat) only allow sound after a tap, so the first tap unlocks it.
import { BASE } from "./base";

let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  try {
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    ctx = null;
  }
}

export function installAudioUnlock() {
  for (const ev of ["pointerdown", "touchend", "keydown"]) document.addEventListener(ev, unlockAudio, { passive: true });
  // iOS WeChat fires this when its bridge is ready; sound can start without a tap.
  document.addEventListener("WeixinJSBridgeReady", unlockAudio);
}

export const setMuted = (m: boolean) => (muted = m);
export const isMuted = () => muted;

/** Whether sound can play now (a phone or TV needs a first tap before it may). */
export const audioReady = () => !muted && !!ctx && ctx.state === "running";

/** Seconds on the audio clock now (to schedule music against). */
export const audioNow = () => ctx?.currentTime ?? 0;

/** The page's audio, once a tap has allowed it (for the local hits, music.ts), or null. */
export const audioCtx = (): AudioContext | null => (ctx && ctx.state !== "closed" ? ctx : null);

/**
 * Where a local hit (music.ts) and the game's own music (bgm.ts) play: under the game's own sounds,
 * which duck them while they play. Every sound below calls `duck` with when it ends; nothing is done
 * while neither is on.
 */
let bus: GainNode | null = null;
let songOn = false;
let themeOn = false;
let duckEnd = 0;
/** How far a song dips under a game sound, and how quickly it comes back. */
const DUCK = 0.3;
const DUCK_BACK = 0.6;

export function musicBus(): GainNode | null {
  if (!ctx) return null;
  if (!bus || bus.context !== ctx) {
    bus = ctx.createGain();
    bus.connect(ctx.destination);
  }
  return bus;
}

/** A song is on (or isn't): game sounds duck it from now on. */
export function setSongOn(on: boolean) {
  songOn = on;
  if (!songOn && !themeOn) duckEnd = 0;
}

/** The game's music is on (or isn't): game sounds duck it too. */
export function setThemeOn(on: boolean) {
  themeOn = on;
  if (!songOn && !themeOn) duckEnd = 0;
}

function duck(until: number) {
  if ((!songOn && !themeOn) || !bus || !ctx) return;
  const now = ctx.currentTime;
  duckEnd = Math.max(duckEnd, until);
  const g = bus.gain;
  try {
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(DUCK, now + 0.04);
    g.setValueAtTime(DUCK, Math.max(now + 0.04, duckEnd));
    g.linearRampToValueAtTime(1, Math.max(now + 0.04, duckEnd) + DUCK_BACK);
  } catch {
    // (an engine that won't take the ramps: the song just doesn't dip)
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {}) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + (opts.at ?? 0);
  duck(t0 + dur);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.12, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A burst of filtered noise: paper, wood, wind. */
function burst(dur: number, o: { vol?: number; at?: number; type?: BiquadFilterType; freq?: number; q?: number; sweep?: number } = {}) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  duck(t0 + dur);
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = o.type ?? "bandpass";
  filter.frequency.setValueAtTime(o.freq ?? 1200, t0);
  if (o.sweep) filter.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
  filter.Q.value = o.q ?? 0.8;
  gain.gain.value = o.vol ?? 0.1;
  src.buffer = buf;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
}

/** A bell: a few out-of-tune partials that ring on. */
function bell(freq: number, o: { at?: number; vol?: number; dur?: number } = {}) {
  for (const [m, g] of [[1, 1], [2, 0.5], [2.76, 0.32], [5.4, 0.12]])
    tone(freq * m, (o.dur ?? 1.6) / Math.pow(m, 0.3), { at: o.at, vol: (o.vol ?? 0.08) * g });
}

/** Noise that rises and falls: water, waves, wind, a crowd. */
function swell(dur: number, o: { at?: number; vol?: number; type?: BiquadFilterType; freq?: number; q?: number; sweep?: number } = {}) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  duck(t0 + dur);
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = o.type ?? "lowpass";
  filter.frequency.setValueAtTime(o.freq ?? 600, t0);
  if (o.sweep) filter.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
  filter.Q.value = o.q ?? 0.7;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(o.vol ?? 0.08, t0 + dur * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.buffer = buf;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
}

/** Notes held together, swelling in: a bandoneón's bellows, a street organ, a ship's horn. */
function chord(freqs: number[], dur: number, o: { at?: number; vol?: number; type?: OscillatorType; detune?: number } = {}) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  duck(t0 + dur);
  const voices = freqs.length * (o.detune ? 2 : 1);
  const peak = (o.vol ?? 0.05) / Math.sqrt(voices);
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.35, dur / 3));
  out.gain.setValueAtTime(peak, t0 + dur * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  out.connect(lp).connect(ctx.destination);
  for (const f of freqs)
    for (const d of o.detune ? [-o.detune, o.detune] : [0]) {
      const osc = ctx.createOscillator();
      osc.type = o.type ?? "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = d;
      osc.connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
}

const horn = (at: number, dur: number, f = 110) => chord([f, f * 1.5], dur, { type: "sawtooth", vol: 0.09, at });
const honk = (at: number, f: number, dur = 0.3) => chord([f, f * 1.26], dur, { type: "square", vol: 0.05, at });
const gulls = (at: number) => {
  tone(1900, 0.35, { at, vol: 0.03, slide: 1300 });
  tone(2100, 0.3, { at: at + 0.42, vol: 0.025, slide: 1500 });
};

/** The recorded city sounds: fetched when a team lands, decoded once the phone allows sound. */
const clipFiles = new Map<string, ArrayBuffer | "loading" | "decoding" | "missing">();
const clips = new Map<string, AudioBuffer>();

/** Start fetching a city's recording (a team has just landed there; its sound comes a few seconds later). */
export function preloadCity(id: string) {
  if (clipFiles.has(id) || clips.has(id) || typeof fetch !== "function") return;
  clipFiles.set(id, "loading");
  fetch(`${BASE}/sounds/${id}.mp3`)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => {
      clipFiles.set(id, b ?? "missing");
      decodeClip(id);
    })
    .catch(() => clipFiles.set(id, "missing"));
}

function decodeClip(id: string) {
  const b = clipFiles.get(id);
  if (!ctx || !(b instanceof ArrayBuffer)) return;
  clipFiles.set(id, "decoding");
  const done = (buf: AudioBuffer) => {
    clips.set(id, buf);
    clipFiles.delete(id);
  };
  const fail = () => clipFiles.set(id, "missing");
  try {
    // (the callback form: older Safari has no promise from decodeAudioData)
    const p = ctx.decodeAudioData(b, done, fail) as Promise<AudioBuffer> | undefined;
    p?.catch(fail);
  } catch {
    fail();
  }
}

/** Play the city's recording if it's ready; false if not (the sketch plays instead). */
function cityClip(id: string): boolean {
  if (muted || !ctx || ctx.state !== "running") return false;
  const buf = clips.get(id);
  if (!buf) {
    decodeClip(id);
    return false;
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 0.45;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
  duck(ctx.currentTime + buf.duration);
  return true;
}

/**
 * A sound sketch for each city, made in the browser like the other sounds: what plays on a first
 * arrival while the city's recording hasn't loaded.
 */
const CITY_SOUND: Record<string, () => void> = {
  // bells over the Thames
  london: () => [415.3, 370, 329.6, 246.9].forEach((f, i) => bell(f, { at: i * 0.55, vol: 0.09, dur: 2.2 })),
  // station chimes as a train pulls in
  tokyo: () => [1046.5, 784, 1318.5, 1174.7, 1046.5].forEach((f, i) => tone(f, 0.45, { type: "triangle", at: i * 0.2, vol: 0.06 })),
  seoul: () => [659.3, 784, 880, 1046.5].forEach((f, i) => tone(f, 0.5, { at: i * 0.24, vol: 0.07 })),
  singapore: () => [1318.5, 1046.5, 784].forEach((f, i) => tone(f, 0.6, { at: i * 0.3, vol: 0.07 })),
  // the tram's ding-ding
  hongkong: () => {
    bell(1250, { vol: 0.07, dur: 0.9 });
    bell(1250, { at: 0.28, vol: 0.07, dur: 1.2 });
    swell(2.4, { freq: 500, vol: 0.03 });
  },
  // bicycle bells down a hutong
  beijing: () => {
    for (let i = 0; i < 6; i++) bell(2100 + (i % 2) * 90, { at: i * 0.07, vol: 0.035, dur: 0.5 });
    swell(2.2, { freq: 700, vol: 0.025, at: 0.2 });
  },
  // ferries, horns and gulls on the water
  istanbul: () => {
    horn(0, 1.4);
    gulls(1.0);
    swell(3, { freq: 400, vol: 0.04 });
  },
  shanghai: () => {
    horn(0, 1.6, 98);
    swell(3, { freq: 350, vol: 0.05 });
  },
  sydney: () => {
    swell(1.6, { freq: 900, sweep: 300, vol: 0.06 });
    swell(1.6, { at: 1.3, freq: 900, sweep: 300, vol: 0.06 });
    gulls(0.6);
  },
  capetown: () => {
    swell(2.2, { freq: 1200, sweep: 250, vol: 0.07 });
    swell(2.2, { at: 1.6, freq: 1100, sweep: 250, vol: 0.06 });
  },
  // water lapping in a canal, a church bell beyond
  venice: () => {
    for (const at of [0, 0.7, 1.4, 2.1]) swell(0.9, { at, freq: 420, vol: 0.05, q: 2 });
    bell(330, { at: 1.1, vol: 0.05, dur: 2.4 });
  },
  // horns in traffic
  newyork: () => {
    honk(0, 349.2);
    honk(0.35, 349.2);
    tone(700, 0.8, { type: "sawtooth", vol: 0.02, at: 0.9, slide: 1100 });
    tone(1100, 0.8, { type: "sawtooth", vol: 0.02, at: 1.7, slide: 700 });
  },
  mumbai: () => {
    [0, 0.18, 0.36, 0.9, 1.05].forEach((at, i) => honk(at, i % 2 ? 622 : 587, 0.12));
    swell(2.6, { freq: 300, vol: 0.05 });
  },
  // a tuk-tuk putters past a temple bell
  bangkok: () => {
    for (let i = 0; i < 20; i++) burst(0.05, { at: i * 0.083, type: "lowpass", freq: 300, vol: 0.07 });
    honk(1.0, 660, 0.14);
    bell(880, { at: 1.6, vol: 0.04, dur: 1.6 });
  },
  // samba on the beach
  rio: () => {
    for (let i = 0; i < 8; i++) {
      const at = i * 0.3;
      if (i % 2 === 0) tone(62, 0.3, { at, vol: 0.2, slide: 48 });
      burst(0.04, { at: at + 0.15, freq: 3500, q: 6, vol: 0.06 });
      if (i % 4 === 3) burst(0.04, { at: at + 0.075, freq: 3500, q: 6, vol: 0.05 });
    }
  },
  // a bandoneón breathing in
  buenosaires: () => chord([220, 261.6, 329.6], 2.4, { vol: 0.07, detune: 9 }),
  // an accordion on a café terrace
  paris: () => chord([293.7, 349.2, 440], 2.2, { type: "square", vol: 0.05, detune: 12 }),
  // a street organ's waltz
  mexicocity: () => [392, 493.9, 587.3, 493.9, 392, 493.9, 587.3, 784].forEach((f, i) => tone(f, 0.28, { type: "square", at: i * 0.22, vol: 0.035 })),
  // slot machines paying out
  lasvegas: () => {
    for (let i = 0; i < 10; i++) tone(880 * Math.pow(2, ((i % 5) * 3) / 12), 0.1, { type: "square", at: i * 0.08, vol: 0.03 });
    for (let i = 0; i < 6; i++) tone(2600 + (i % 3) * 300, 0.12, { type: "triangle", at: 0.9 + i * 0.09, vol: 0.04 });
  },
  // the Gastown steam clock's whistles
  vancouver: () => {
    chord([523.3, 659.3, 784], 1.6, { type: "sine", vol: 0.07 });
    swell(1.8, { type: "highpass", freq: 3000, vol: 0.03 });
  },
  // wind at the top of the tower, and the lift arriving
  dubai: () => {
    swell(2.8, { type: "bandpass", freq: 500, sweep: 1400, q: 1.5, vol: 0.05 });
    tone(659.3, 0.6, { at: 1.6, vol: 0.06 });
    tone(523.3, 0.9, { at: 1.85, vol: 0.06 });
  },
  // a market: voices and tea glasses
  cairo: () => {
    for (let i = 0; i < 14; i++) burst(0.18, { at: i * 0.17, freq: 500 + ((i * 337) % 900), q: 3, vol: 0.035 });
    for (const at of [0.6, 1.3, 1.9]) tone(3200, 0.15, { type: "triangle", at, vol: 0.035 });
  },
};

/**
 * Rio's samba school, synthesised, at 100 beats a minute (Latin dance competitions' samba: 50 bars
 * a minute in 2/4): `beats` beats of the band (the big surdo heavy on the second beat and answered
 * on the first, the shaker in sixteenths, the tamborim's syncopation, the agogô's two bells marking
 * the change of foot; every eighth beat the snare rolls and the whistle calls the next figure) and
 * one last hit. `delay` is when beat 0 falls, in seconds from now (negative: the band is already
 * playing, and joins in time); `beat`, a beat's length in seconds.
 *
 * A lesson is 64 beats long: the band is put on the audio clock a few beats ahead as it goes, not all
 * at once. Returns how to stop it (a pause, the page leaving the lesson).
 */
export function samba(delay: number, beats: number, beat = 0.6): () => void {
  if (muted || !ctx || ctx.state !== "running") return () => {};
  const audio = ctx;
  const t0 = audio.currentTime + delay;
  let next = Math.max(0, Math.ceil((-delay - 0.02) / beat));
  const play = (b: number) => {
    // (when this beat falls, from now)
    const at = Math.max(0, t0 + b * beat - audio.currentTime);
    if (b >= beats) {
      tone(55, 0.6, { vol: 0.32, at, slide: 40 });
      burst(0.3, { type: "highpass", freq: 3000, q: 0.7, vol: 0.12, at });
      return;
    }
    const second = b % 2 === 1;
    tone(second ? 58 : 78, 0.35, { vol: second ? 0.34 : 0.2, at, slide: second ? 44 : 62 });
    for (let k = 0; k < 4; k++) burst(0.03, { type: "highpass", freq: 6000, q: 0.8, vol: k === 0 || k === 3 ? 0.06 : 0.028, at: at + (k * beat) / 4 });
    for (const k of [[0, 3], [1, 2], [0, 2], [1, 3]][b % 4]) burst(0.02, { type: "bandpass", freq: 2600, q: 6, vol: 0.08, at: at + (k * beat) / 4 });
    tone(second ? 740 : 990, 0.14, { type: "triangle", vol: 0.035, at });
    // The last beat of a figure: a roll on the snare, and the whistle calls the next one.
    if (b % 8 === 7 && b < beats - 1) {
      for (let k = 0; k < 4; k++) burst(0.05, { type: "bandpass", freq: 1900, q: 1.4, vol: 0.05 + k * 0.012, at: at + (k * beat) / 4 });
      tone(2600, 0.1, { type: "sine", vol: 0.05, at: at + beat / 2, slide: 2450 });
      tone(2600, 0.1, { type: "sine", vol: 0.05, at: at + (beat * 3) / 4, slide: 2450 });
    }
  };
  const ahead = () => {
    if (muted || audio.state !== "running") return;
    while (next <= beats && t0 + next * beat < audio.currentTime + 1.6) play(next++);
    if (next > beats) clearInterval(timer);
  };
  const timer = setInterval(ahead, 400);
  ahead();
  return () => clearInterval(timer);
}

/**
 * The whistle counting down to a dance: a pip as each of the countdown's `steps` numerals comes up
 * (5 4 3 2 1, a second each: `step`, in seconds), the last one long. `delay` is when the dance starts,
 * in seconds from now.
 */
export function sambaCount(delay: number, steps: number, step = 1) {
  for (let n = steps; n >= 1; n--) {
    const at = delay - n * step;
    if (at < -0.02) continue;
    tone(n > 1 ? 2600 : 2500, (n > 1 ? 0.12 : 0.42) * Math.min(1, step), { type: "sine", vol: 0.07, at: Math.max(0, at), slide: n > 1 ? 2450 : 2250 });
  }
}

export const sfx = {
  /** Your turn: an airport chime's shape, three rising notes 0.2 s apart, done in under a second. */
  turn: () => {
    [523.3, 659.3, 784].forEach((f, i) => {
      tone(f, 0.42, { vol: 0.1, at: i * 0.2 });
      tone(f * 3, 0.18, { vol: 0.012, at: i * 0.2 });
    });
  },
  /** A finger on the button. */
  tap: () => burst(0.025, { type: "bandpass", freq: 2400, q: 1.2, vol: 0.12 }),
  /** The dice settle and their number comes up. */
  result: () => tone(880, 0.16, { type: "triangle", vol: 0.08 }),
  /** A split-flap departures board turning over: one space passed. */
  flap: () => {
    burst(0.012, { type: "highpass", freq: 4200, q: 1.5, vol: 0.09 });
    burst(0.02, { type: "bandpass", freq: 900, q: 3, vol: 0.06, at: 0.004 });
  },
  /** Two dice rattling in a wooden cup. */
  dice: () => {
    [0, 0.06, 0.11, 0.19].forEach((at, i) => burst(0.04, { at, freq: 1800 + i * 300, q: 4, vol: 0.12 }));
  },
  /** The till: a bell and the drawer. */
  coin: () => {
    burst(0.05, { freq: 2500, q: 1.5, vol: 0.08 });
    tone(1568, 0.25, { type: "triangle", vol: 0.07, at: 0.04 });
    tone(2093, 0.35, { type: "triangle", vol: 0.06, at: 0.09 });
  },
  pay: () => tone(392, 0.28, { type: "triangle", slide: 262, vol: 0.1 }),
  /** A quiz-show buzzer, but polite: a question the waiting teams can answer. */
  ask: () => {
    tone(988, 0.12, { type: "square", vol: 0.035 });
    tone(1319, 0.2, { type: "square", vol: 0.035, at: 0.11 });
  },
  /** The auctioneer's gavel. */
  bid: () => {
    burst(0.05, { type: "lowpass", freq: 900, vol: 0.25 });
    tone(150, 0.08, { vol: 0.16 });
  },
  /** A rubber stamp on a passport page. */
  stamp: () => {
    tone(110, 0.12, { vol: 0.22, slide: 70 });
    burst(0.07, { freq: 900, q: 0.7, vol: 0.18, at: 0.01 });
  },
  /** A ship's horn: time's up, or a party forfeit. */
  alert: () => {
    tone(196, 0.5, { type: "sawtooth", vol: 0.05 });
    tone(247, 0.5, { type: "sawtooth", vol: 0.04 });
  },
  /** A propeller plane passing over: a token flies to another region (big screen). */
  flight: () => {
    burst(1.4, { type: "bandpass", freq: 300, sweep: 1400, q: 1.2, vol: 0.16 });
    tone(55, 1.2, { type: "sawtooth", vol: 0.025, slide: 70 });
  },
  /** The seat-belt chime: the plane is coming in to land. */
  cabin: () => {
    tone(1174.7, 0.9, { vol: 0.07 });
    tone(880, 1.2, { vol: 0.07, at: 0.32 });
  },
  /** Air rushing past the window on the way down. */
  descent: () => swell(1.4, { type: "bandpass", freq: 300, sweep: 1400, q: 0.8, vol: 0.07 }),
  /** The city's own sound: its recording, or its sketch (see CITY_SOUND) until that has loaded. */
  city: (id: string) => {
    if (!cityClip(id)) CITY_SOUND[id]?.();
  },
  /** Travel news: a newsroom ticker. */
  news: () => [880, 1108.7, 1318.5, 1760].forEach((f, i) => tone(f, 0.11, { type: "square", vol: 0.035, at: i * 0.085 })),
  /** 世界大动荡: a newsroom's breaking-news call, then the event's own sound. */
  world: (id: string) => {
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, 0.16, { type: "square", vol: 0.04, at: i * 0.11 }));
    tone(1046.5, 0.5, { type: "triangle", vol: 0.05, at: 0.44 });
    const at = 0.8;
    if (id === "crash") tone(523.3, 1.3, { type: "sawtooth", vol: 0.035, at, slide: 98 });
    else if (id === "meteor") {
      swell(0.9, { type: "bandpass", freq: 2400, sweep: 500, q: 0.8, vol: 0.07, at });
      burst(1.1, { type: "lowpass", freq: 130, q: 0.4, vol: 0.32, at: at + 0.85 });
    } else if (id === "terror") chord([196, 233.1, 293.7], 1.8, { vol: 0.05, at, detune: 6 });
    else if (id === "ai") [784, 988, 1174.7, 1568, 1318.5, 1975.5].forEach((f, i) => tone(f, 0.09, { type: "square", vol: 0.03, at: at + i * 0.07 }));
    else if (id === "invention") {
      swell(1.2, { type: "bandpass", freq: 400, sweep: 2600, q: 0.7, vol: 0.06, at });
      chord([523.3, 659.3, 784], 1, { type: "triangle", vol: 0.05, at: at + 0.9 });
    } else if (id === "boom") {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, 0.3, { type: "triangle", vol: 0.06, at: at + i * 0.09 }));
      burst(0.4, { type: "highpass", freq: 5000, vol: 0.05, at: at + 0.4 });
    }
  },
  /** The weather we land in: rain on the window, a roll of thunder, wind with the snow or fog. */
  weather: (kind: string) => {
    if (kind === "rain" || kind === "storm" || kind === "drizzle") {
      const heavy = kind !== "drizzle";
      swell(3.4, { type: "highpass", freq: heavy ? 1500 : 2600, q: 0.4, vol: heavy ? 0.06 : 0.035 });
      if (heavy) swell(3.4, { type: "lowpass", freq: 450, vol: 0.035 });
    }
    if (kind === "storm") burst(2.6, { type: "lowpass", freq: 140, q: 0.5, vol: 0.32, at: 1.1 });
    if (kind === "snow" || kind === "fog") swell(3.2, { type: "bandpass", freq: 520, sweep: 300, q: 0.6, vol: 0.045 });
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, { at: i * 0.13, type: "triangle" }));
    tone(1319, 0.6, { at: 0.55, type: "triangle", vol: 0.08 });
  },
  /** The dice hitting the table. */
  clack: () => {
    burst(0.03, { type: "bandpass", freq: 2600, q: 3, vol: 0.14 });
    burst(0.05, { type: "lowpass", freq: 500, vol: 0.12, at: 0.02 });
  },
  /** A token's step on the board: a soft wooden tick. */
  step: () => {
    burst(0.025, { type: "bandpass", freq: 1500, q: 6, vol: 0.06 });
    tone(620, 0.05, { type: "triangle", vol: 0.025 });
  },
  /** A token landing: a thud with a little ring. */
  land: () => {
    tone(140, 0.16, { vol: 0.14, slide: 90 });
    burst(0.06, { type: "lowpass", freq: 700, vol: 0.12 });
    tone(988, 0.3, { type: "triangle", vol: 0.03, at: 0.05 });
  },
  /** Air past the camera: in (1) as it leans down to the token, out (-1) as it pulls back up. */
  whoosh: (dir: number) =>
    dir > 0
      ? swell(0.55, { type: "bandpass", freq: 260, sweep: 1500, q: 0.9, vol: 0.05 })
      : swell(0.6, { type: "bandpass", freq: 1500, sweep: 240, q: 0.9, vol: 0.04 }),
  /** A card off the pile. */
  card: () => {
    burst(0.07, { type: "highpass", freq: 2200, vol: 0.06 });
    burst(0.05, { type: "bandpass", freq: 900, q: 1.2, vol: 0.05, at: 0.06 });
  },
  /**
   * A building comes up out of the ground (art.css b-rise, in time with it): the ground gives with a
   * rumble, the house shoots up out of it, lands on its foot with a wooden thunk, and a little chime.
   * A hotel: its floors land one on another, 0.16 s apart, and a fanfare when its sign is up.
   */
  build: (hotel = false) => {
    swell(0.5, { type: "lowpass", freq: 170, sweep: 80, vol: 0.14 });
    burst(0.12, { type: "lowpass", freq: 380, vol: 0.16, at: 0.04 });
    swell(0.32, { type: "bandpass", freq: 380, sweep: 2000, q: 1, vol: 0.06, at: 0.1 });
    const lands = hotel ? [0, 1, 2, 3] : [0];
    for (const i of lands) {
      const at = 0.44 + i * 0.16;
      tone(hotel ? 170 - i * 12 : 150, 0.15, { vol: 0.2, slide: 80, at });
      burst(0.06, { type: "lowpass", freq: 650, vol: 0.13, at });
      burst(0.03, { type: "bandpass", freq: 2200, q: 2.5, vol: 0.05, at: at + 0.06 });
    }
    const done = 0.5 + (lands.length - 1) * 0.16;
    [1046.5, 1318.5, 1568].forEach((f, i) => tone(f, 0.32, { type: "triangle", vol: 0.05, at: done + i * 0.07 }));
    if (hotel) {
      chord([523.3, 659.3, 784], 0.9, { type: "triangle", vol: 0.06, at: done + 0.24 });
      bell(1046.5, { at: done + 0.26, vol: 0.05, dur: 1.2 });
    }
  },
  /** A building sold back: a creak, and it sinks back into the ground with a falling thud. */
  sink: () => {
    tone(330, 0.5, { type: "triangle", vol: 0.05, slide: 165 });
    swell(0.6, { type: "lowpass", freq: 260, sweep: 90, vol: 0.12, at: 0.08 });
    tone(110, 0.2, { vol: 0.14, slide: 60, at: 0.55 });
  },
  /** A city mortgaged: its chip turned face down, a card flipped onto the table. */
  flip: () => {
    burst(0.05, { type: "highpass", freq: 3000, vol: 0.05 });
    burst(0.08, { type: "bandpass", freq: 1100, q: 1.3, vol: 0.07, at: 0.3 });
    tone(220, 0.1, { vol: 0.08, at: 0.34, slide: 160 });
  },
  /** Sent to Immigration: the gate comes down. */
  jail: () => {
    burst(0.08, { type: "bandpass", freq: 700, q: 2, vol: 0.2 });
    tone(196, 0.5, { type: "square", vol: 0.04, at: 0.02 });
    tone(147, 0.7, { type: "square", vol: 0.04, at: 0.22 });
  },
};
