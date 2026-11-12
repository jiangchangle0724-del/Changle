/**
 * 流氓十三张's five standing powers, each with a sound of its own (Steve, 11-11): a woman's flirty
 * "Hi~" for 陪酒, a paparazzi burst for 照相机, a clown's horn and nose for 摸鼻子, a toilet flushing
 * for WC 票, a wolf whistle and a cuckoo for 神经病. Synthesized like the rest of the table's sounds
 * (lib/sfx), so there is nothing to download; the "Hi" is the phone's own voice where it has one,
 * and a voice built from parts where it hasn't. A cue plays when its card comes up and whenever
 * the power is used, on one phone and online alike; `render` draws one into any bus, which is how
 * the check script listens to them without a sound card.
 */
import { burst, bus, midiHz, noise, tone, voice, type Bus } from "../lib/audio/engine";
import type { Power } from "../data/rogue13";

/** A tone held for `dur` seconds (the engine's `tone` is percussive), gliding to `f2`, with an optional wobble. */
function held(b: Bus, o: { f: number; f2?: number; at: number; dur: number; peak: number; type?: OscillatorType; wet?: number; wobble?: number }) {
  const { c } = b;
  const t0 = c.currentTime + o.at;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  if (o.wobble) {
    const lfo = c.createOscillator();
    lfo.frequency.value = 7;
    const depth = c.createGain();
    depth.gain.value = o.wobble;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + o.dur + 0.1);
  }
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(o.peak, t0 + 0.02);
  amp.gain.setValueAtTime(o.peak, t0 + Math.max(0.02, o.dur - 0.05));
  amp.gain.linearRampToValueAtTime(0, t0 + o.dur);
  osc.connect(amp).connect(voice(b, o.wet ?? 0.25));
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

/* ---------------- 陪酒: a woman's "Hi~" ---------------- */

const FEMALE = /samantha|karen|moira|tessa|fiona|victoria|allison|ava|susan|zoe|nicky|serena|kate|martha|zira|aria|jenny|michelle|libby|sonia|natasha|hazel|female|女|ting|tingting|mei|meijia|sin-?ji|xiaoxiao|xiaoyi|yaoyao|huihui|hanhan|yating|hiujin|wan/i;
const MALE = /daniel|alex|fred|tom|aaron|arthur|gordon|rishi|david|mark|george|james|oliver|ryan|guy|male|男|yunxi|yunyang|yunjian|kangkang|wayne|liang|sin-?ho/i;

/** The phone's own voices: a woman's, English or Mandarin, if it has one; otherwise whatever it has. */
function flirtyVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const all = speechSynthesis.getVoices();
  if (!all.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.replace("_", "-").toLowerCase();
    let s = 0;
    if (lang.startsWith("en")) s += 2;
    else if (lang.startsWith("zh") && !/hk|yue/.test(lang)) s += 1;
    else s -= 4;
    if (FEMALE.test(v.name)) s += 4;
    if (MALE.test(v.name)) s -= 4;
    if (v.localService) s += 1;
    if (v.default) s += 0.5;
    return s;
  };
  return [...all].sort((x, y) => score(y) - score(x))[0] ?? null;
}

/** The phone says it: slow, a little low, as if leaning in. False when this phone has no voice. */
function sayHi(vol: number): boolean {
  if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return false;
  const v = flirtyVoice();
  if (!v) return false;
  try {
    const u = new SpeechSynthesisUtterance(v.lang.toLowerCase().startsWith("zh") ? "嗨" : "Hi");
    u.voice = v;
    u.lang = v.lang;
    u.rate = 0.7;
    u.pitch = 0.9;
    u.volume = Math.max(0, Math.min(1, vol));
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/** Phones only let a page talk after a tap: the first tap on the page says nothing, so the "Hi" can come later. */
function primeVoice() {
  if (typeof window === "undefined" || typeof speechSynthesis === "undefined") return;
  const events = ["touchend", "pointerup", "click", "keydown"] as const;
  const prime = () => {
    events.forEach((e) => window.removeEventListener(e, prime, true));
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      /* no voice here: the built one speaks instead */
    }
  };
  events.forEach((e) => window.addEventListener(e, prime, { capture: true, passive: true }));
}
primeVoice();

/**
 * A "Hi~" built from a voice's parts, for a phone with no voice of its own: a breath, the folds'
 * buzz with a sing-song pitch (up, then down and long) and vibrato, and the mouth's three
 * resonances gliding from /a/ to /i/.
 */
function hiAt(b: Bus, at: number, vol: number) {
  const { c } = b;
  const t0 = c.currentTime + at;
  const end = t0 + 0.95;
  const out = voice(b, 0.3);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4800;
  lp.connect(out);
  // the mouth: F1, F2, F3 for a woman's /a/, then /i/
  const F: [number, number][] = [
    [820, 320],
    [1250, 2650],
    [2850, 3250],
  ];
  const G: [number, number][] = [
    [1, 0.7],
    [0.5, 2.2],
    [0.25, 1.2],
  ];
  const Q = [9, 12, 16];
  const mouth = F.map(([a, i], k) => {
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = Q[k];
    f.frequency.setValueAtTime(a, t0);
    f.frequency.setValueAtTime(a, t0 + 0.22);
    f.frequency.exponentialRampToValueAtTime(i, t0 + 0.6);
    const g = c.createGain();
    g.gain.setValueAtTime(G[k][0], t0);
    g.gain.setValueAtTime(G[k][0], t0 + 0.22);
    g.gain.linearRampToValueAtTime(G[k][1], t0 + 0.6);
    f.connect(g).connect(lp);
    return f;
  });
  // the buzz
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(215, t0);
  osc.frequency.exponentialRampToValueAtTime(285, t0 + 0.28);
  osc.frequency.exponentialRampToValueAtTime(190, end);
  const vib = c.createOscillator();
  vib.frequency.value = 5.5;
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, t0);
  vg.gain.linearRampToValueAtTime(7, t0 + 0.4);
  vib.connect(vg).connect(osc.frequency);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.setValueAtTime(0.0001, t0 + 0.06);
  amp.gain.exponentialRampToValueAtTime(0.5 * vol, t0 + 0.18);
  amp.gain.setValueAtTime(0.5 * vol, t0 + 0.55);
  amp.gain.exponentialRampToValueAtTime(0.03 * vol, end - 0.05);
  amp.gain.linearRampToValueAtTime(0, end);
  osc.connect(amp);
  mouth.forEach((f) => amp.connect(f));
  // the breath: the h, then a little air under the whole word
  const air = c.createBufferSource();
  air.buffer = noise(c);
  air.loop = true;
  const ag = c.createGain();
  ag.gain.setValueAtTime(0.0001, t0);
  ag.gain.exponentialRampToValueAtTime(0.35 * vol, t0 + 0.05);
  ag.gain.exponentialRampToValueAtTime(0.06 * vol, t0 + 0.2);
  ag.gain.setValueAtTime(0.06 * vol, t0 + 0.6);
  ag.gain.exponentialRampToValueAtTime(0.0001, end);
  air.connect(ag);
  mouth.forEach((f) => ag.connect(f));
  osc.start(t0);
  osc.stop(end + 0.05);
  vib.start(t0);
  vib.stop(end + 0.05);
  air.start(t0, Math.random());
  air.stop(end + 0.05);
}

/* ---------------- the other parts ---------------- */

/** A camera's shutter, with a flashbulb going off. */
function flashAt(b: Bus, at: number, vol: number) {
  burst(b, { at, dur: 0.004, decay: 0.015, f: 3000, q: 4, peak: 0.26 * vol, wet: 0.12 });
  tone(b, { f: 1200, f2: 420, glide: 0.01, at, peak: 0.07 * vol, attack: 0.001, decay: 0.012, wet: 0.08 });
  burst(b, { at: at + 0.05, dur: 0.004, decay: 0.02, f: 2400, q: 3, peak: 0.2 * vol, wet: 0.15 });
  // the bulb: a pop and a bright ting
  burst(b, { at: at + 0.012, dur: 0.004, decay: 0.05, type: "highpass", f: 1800, q: 0.7, peak: 0.13 * vol, wet: 0.3 });
  tone(b, { f: 4200, f2: 3000, glide: 0.02, at: at + 0.012, peak: 0.05 * vol, attack: 0.001, decay: 0.22, wet: 0.45 });
}

/** A clown's bulb horn: a reedy honk that sags as the bulb empties. */
function honk(b: Bus, at: number, f: number, dur: number, vol: number) {
  const { c } = b;
  const t0 = c.currentTime + at;
  const reed = c.createBiquadFilter();
  reed.type = "bandpass";
  reed.frequency.value = f * 2.6;
  reed.Q.value = 1.1;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2800;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.1 * vol, t0 + 0.02);
  amp.gain.setValueAtTime(0.1 * vol, t0 + dur);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.06);
  reed.connect(lp).connect(amp).connect(voice(b, 0.15));
  for (const mul of [1, 1.007]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * mul, t0);
    o.frequency.exponentialRampToValueAtTime(f * mul * 0.94, t0 + dur);
    o.connect(reed);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }
}

/** A rubber nose squeezed: a short squeak that rises as it is pressed. */
function squeak(b: Bus, at: number, pitch: number, vol: number) {
  tone(b, { f: 880 * pitch, f2: 1560 * pitch, glide: 0.08, type: "triangle", at, peak: 0.11 * vol, attack: 0.012, decay: 0.1, wet: 0.2 });
  tone(b, { f: 1760 * pitch, f2: 3120 * pitch, glide: 0.08, type: "sine", at, peak: 0.035 * vol, attack: 0.012, decay: 0.08, wet: 0.2 });
  burst(b, { at, dur: 0.06, attack: 0.01, type: "bandpass", f: 2400 * pitch, q: 3, peak: 0.03 * vol, wet: 0.1 });
}

/** A whistle between the lips: a near-pure tone that slides, with a little air on it. */
function whistle(b: Bus, at: number, f: number, f2: number, dur: number, vol: number) {
  held(b, { f, f2, at, dur, peak: 0.09 * vol, wet: 0.3 });
  held(b, { f: f * 2, f2: f2 * 2, at, dur, peak: 0.012 * vol, wet: 0.3 });
  burst(b, { at, dur, attack: 0.03, type: "bandpass", f, f2, q: 3, peak: 0.02 * vol, wet: 0.2 });
}

/** A flute's note, for the cuckoo: a sine with a soft second harmonic. */
function flute(b: Bus, at: number, f: number, dur: number, vol: number) {
  held(b, { f, at, dur, peak: 0.09 * vol, wet: 0.35 });
  held(b, { f: f * 2, at, dur, peak: 0.022 * vol, wet: 0.35 });
}

/** A toilet flushing: the handle, the water rushing in and swirling down, the gurgles, the last suck. */
function flushAt(b: Bus, at: number, vol: number) {
  const { c } = b;
  const t0 = c.currentTime + at;
  // the handle
  burst(b, { at, dur: 0.015, decay: 0.06, type: "lowpass", f: 700, q: 0.9, peak: 0.14 * vol, wet: 0.1 });
  tone(b, { f: 160, f2: 70, glide: 0.05, at, peak: 0.07 * vol, attack: 0.002, decay: 0.07, wet: 0.1 });
  // the rush: water filling the bowl, wide and dark, swelling then falling away
  const rush = c.createBufferSource();
  rush.buffer = noise(c);
  rush.loop = true;
  const rushLp = c.createBiquadFilter();
  rushLp.type = "lowpass";
  rushLp.Q.value = 0.6;
  rushLp.frequency.setValueAtTime(1600, t0);
  rushLp.frequency.exponentialRampToValueAtTime(400, t0 + 2.3);
  const rushG = c.createGain();
  rushG.gain.setValueAtTime(0.0001, t0);
  rushG.gain.setValueAtTime(0.0001, t0 + 0.1);
  rushG.gain.exponentialRampToValueAtTime(0.2 * vol, t0 + 0.6);
  rushG.gain.setValueAtTime(0.2 * vol, t0 + 1.4);
  rushG.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
  rush.connect(rushLp).connect(rushG).connect(voice(b, 0.35));
  rush.start(t0, Math.random());
  rush.stop(t0 + 2.5);
  // the swirl: the vortex, a wobbling band that drops as the water goes down
  const swirl = c.createBufferSource();
  swirl.buffer = noise(c);
  swirl.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(1300, t0 + 0.2);
  bp.frequency.exponentialRampToValueAtTime(220, t0 + 2.2);
  const lfo = c.createOscillator();
  lfo.frequency.value = 5;
  const depth = c.createGain();
  depth.gain.value = 90;
  lfo.connect(depth).connect(bp.frequency);
  const swirlG = c.createGain();
  swirlG.gain.setValueAtTime(0.0001, t0);
  swirlG.gain.setValueAtTime(0.0001, t0 + 0.2);
  swirlG.gain.exponentialRampToValueAtTime(0.17 * vol, t0 + 0.7);
  swirlG.gain.setValueAtTime(0.17 * vol, t0 + 1.8);
  swirlG.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.3);
  swirl.connect(bp).connect(swirlG).connect(voice(b, 0.3));
  swirl.start(t0 + 0.2, Math.random());
  swirl.stop(t0 + 2.4);
  lfo.start(t0);
  lfo.stop(t0 + 2.4);
  // the gurgles as the bowl empties
  for (let i = 0; i < 5; i++) {
    const g = at + 1.85 + i * 0.11 + Math.random() * 0.03;
    tone(b, { f: 170 - i * 12, f2: 70, glide: 0.07, at: g, peak: 0.09 * vol, attack: 0.004, decay: 0.09, wet: 0.3 });
    burst(b, { at: g, dur: 0.03, decay: 0.04, type: "lowpass", f: 500, q: 0.8, peak: 0.08 * vol, wet: 0.2 });
  }
  // the last suck
  tone(b, { f: 150, f2: 42, glide: 0.3, at: at + 2.35, peak: 0.11 * vol, attack: 0.01, decay: 0.32, wet: 0.3 });
}

const cues: Record<Power, (b: Bus, vol: number) => void> = {
  /** 陪酒: "Hi~" (the built voice; a phone with a voice of its own says it instead, see playPower). */
  buddy(b, vol) {
    hiAt(b, 0, vol);
  },

  /** 照相机: the paparazzi, three shots with the flashbulbs going, and a last sparkle. */
  camera(b, vol) {
    [0, 0.14, 0.3].forEach((at) => flashAt(b, at, vol));
    tone(b, { f: 1500, f2: 3000, glide: 0.2, at: 0.5, peak: 0.05 * vol, attack: 0.01, decay: 0.25, wet: 0.45 });
    tone(b, { f: midiHz(103), at: 0.55, peak: 0.05 * vol, attack: 0.002, decay: 0.35, wet: 0.5 });
  },

  /** 摸鼻子: a clown's horn, honk honk, the nose squeezed, then the boing. */
  nose(b, vol) {
    honk(b, 0, 330, 0.2, vol);
    honk(b, 0.27, 262, 0.3, vol);
    squeak(b, 0.64, 1.1, vol);
    held(b, { f: 170, f2: 330, at: 0.8, dur: 0.36, peak: 0.1 * vol, type: "triangle", wobble: 32, wet: 0.25 });
    held(b, { f: 340, f2: 660, at: 0.8, dur: 0.3, peak: 0.03 * vol, type: "sine", wobble: 60, wet: 0.25 });
    burst(b, { at: 0.8, dur: 0.012, decay: 0.04, type: "lowpass", f: 1200, q: 0.8, peak: 0.12 * vol, wet: 0.15 });
  },

  /** WC 票: the toilet flushing. */
  wc(b, vol) {
    flushAt(b, 0, vol);
  },

  /** 神经病: a wolf whistle (wheet-whew), then the cuckoo. */
  trouble(b, vol) {
    whistle(b, 0, 1000, 2100, 0.3, vol);
    tone(b, { f: 1700, f2: 2150, glide: 0.08, at: 0.38, peak: 0.05 * vol, attack: 0.01, decay: 0.1, wet: 0.3 });
    whistle(b, 0.42, 2100, 780, 0.5, vol);
    flute(b, 1.05, midiHz(76), 0.16, vol);
    flute(b, 1.25, midiHz(72), 0.26, vol);
  },
};

/** How long each cue runs, in seconds (for the check script's recordings and for timing what follows). */
export const POWER_SOUND_SECONDS: Record<Power, number> = { buddy: 1.1, camera: 1.0, nose: 1.3, wc: 3.0, trouble: 1.6 };

/** Play a power's cue on the table's speakers (nothing when sound is off). */
export function playPower(power: Power, vol = 1) {
  const b = bus();
  if (!b) return;
  // the buddy's "Hi": the phone's own voice, when it has one
  if (power === "buddy" && sayHi(vol)) return;
  cues[power](b, vol);
}

/** Draw a power's cue into `b` (an offline bus, say) instead of the speakers. */
export function render(power: Power, b: Bus, vol = 1) {
  cues[power](b, vol);
}
