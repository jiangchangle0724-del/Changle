/**
 * 流氓十三张's five standing powers, each with a sound of its own (Steve, 11-11): glasses and a toast
 * for 陪酒, an autofocus and shutter for 照相机, a squeezed clown's nose for 摸鼻子, a flush for WC 票
 * and a slide whistle with a cuckoo for 神经病. Synthesized like the rest of the table's sounds
 * (lib/sfx), so there is nothing to download. A cue plays when its card comes up and whenever the
 * power is used, on one phone and online alike; `render` draws one into any bus, which is how the
 * check script listens to them without a sound card.
 */
import { burst, bus, midiHz, note, strike, tone, voice, type Bus } from "../lib/audio/engine";
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

/** Two glasses meeting (the table's clink, at a moment of its own). */
function glass(b: Bus, at: number, vol: number) {
  const j = 1 + (Math.random() - 0.5) * 0.04;
  strike(b, 2370 * j, [1, 1.65, 2.31, 3.09], [1, 0.6, 0.38, 0.22], [0.95, 0.6, 0.42, 0.28], { at, peak: 0.12 * vol, wet: 0.4 });
  strike(b, 2690 * j, [1, 1.57, 2.24], [0.75, 0.45, 0.25], [0.8, 0.5, 0.3], { at: at + 0.028, peak: 0.12 * vol, wet: 0.4 });
  burst(b, { at, dur: 0.004, decay: 0.008, type: "highpass", f: 5200, q: 0.7, peak: 0.06 * vol, wet: 0.1 });
}

/** A rubber nose squeezed: a short squeak that rises as it is pressed. */
function squeak(b: Bus, at: number, pitch: number, vol: number) {
  tone(b, { f: 880 * pitch, f2: 1560 * pitch, glide: 0.08, type: "triangle", at, peak: 0.11 * vol, attack: 0.012, decay: 0.1, wet: 0.2 });
  tone(b, { f: 1760 * pitch, f2: 3120 * pitch, glide: 0.08, type: "sine", at, peak: 0.035 * vol, attack: 0.012, decay: 0.08, wet: 0.2 });
  burst(b, { at, dur: 0.06, attack: 0.01, type: "bandpass", f: 2400 * pitch, q: 3, peak: 0.03 * vol, wet: 0.1 });
}

/** A flute's note, for the cuckoo: a sine with a soft second harmonic. */
function flute(b: Bus, at: number, f: number, dur: number, vol: number) {
  held(b, { f, at, dur, peak: 0.09 * vol, wet: 0.35 });
  held(b, { f: f * 2, at, dur, peak: 0.022 * vol, wet: 0.35 });
}

const cues: Record<Power, (b: Bus, vol: number) => void> = {
  /** 陪酒: two glasses meet, then a little toast fanfare. 谢谢老板！ */
  buddy(b, vol) {
    glass(b, 0, vol);
    glass(b, 0.15, vol * 0.9);
    [72, 76, 79].forEach((m, i) => note(b, "brass", { f: midiHz(m), at: 0.34 + i * 0.09, dur: 0.1, peak: 0.07 * vol }));
    note(b, "brass", { f: midiHz(84), at: 0.62, dur: 0.42, peak: 0.085 * vol });
    note(b, "bell", { f: midiHz(96), at: 0.64, peak: 0.05 * vol });
  },

  /** 照相机: the autofocus finds its mark, the shutter, the film winding on. */
  camera(b, vol) {
    for (const at of [0, 0.1]) tone(b, { f: 2900, at, peak: 0.06 * vol, attack: 0.002, decay: 0.045, wet: 0.08 });
    const at = 0.28;
    burst(b, { at, dur: 0.004, decay: 0.015, f: 3000, q: 4, peak: 0.32 * vol, wet: 0.12 });
    tone(b, { f: 1200, f2: 420, glide: 0.01, at, peak: 0.08 * vol, attack: 0.001, decay: 0.012, wet: 0.08 });
    tone(b, { f: 95, type: "sawtooth", at: at + 0.012, peak: 0.04 * vol, attack: 0.004, decay: 0.05, wet: 0.05 });
    burst(b, { at: at + 0.07, dur: 0.004, decay: 0.02, f: 2400, q: 3, peak: 0.26 * vol, wet: 0.15 });
    burst(b, { at: 0.44, dur: 0.26, attack: 0.03, type: "bandpass", f: 1400, f2: 2600, q: 1.2, peak: 0.05 * vol, wet: 0.1 });
    tone(b, { f: 70, f2: 95, glide: 0.25, type: "sawtooth", at: 0.44, peak: 0.03 * vol, attack: 0.03, decay: 0.26, wet: 0.05 });
  },

  /** 摸鼻子: a clown's nose squeezed twice, then a boing. */
  nose(b, vol) {
    squeak(b, 0, 1, vol);
    squeak(b, 0.17, 1.18, vol);
    held(b, { f: 170, f2: 330, at: 0.38, dur: 0.36, peak: 0.1 * vol, type: "triangle", wobble: 32, wet: 0.25 });
    held(b, { f: 340, f2: 660, at: 0.38, dur: 0.3, peak: 0.03 * vol, type: "sine", wobble: 60, wet: 0.25 });
    burst(b, { at: 0.38, dur: 0.012, decay: 0.04, type: "lowpass", f: 1200, q: 0.8, peak: 0.12 * vol, wet: 0.15 });
  },

  /** WC 票: the flush, the bubbles coming up, the last glug. */
  wc(b, vol) {
    burst(b, { at: 0, dur: 1.15, attack: 0.18, type: "bandpass", f: 2400, f2: 320, q: 0.9, peak: 0.13 * vol, wet: 0.3 });
    for (let i = 0; i < 9; i++) {
      const at = 0.25 + (i / 9) * 0.75 + Math.random() * 0.05;
      const f = 360 + Math.random() * 220;
      tone(b, { f, f2: f * 0.45, glide: 0.07, at, peak: 0.055 * vol, attack: 0.004, decay: 0.08, wet: 0.35 });
    }
    tone(b, { f: 260, f2: 85, glide: 0.14, at: 1.12, peak: 0.11 * vol, attack: 0.006, decay: 0.16, wet: 0.3 });
    burst(b, { at: 1.12, dur: 0.08, attack: 0.01, type: "lowpass", f: 600, q: 0.8, peak: 0.07 * vol, wet: 0.2 });
  },

  /** 神经病: a slide whistle swooping up and down, then the cuckoo. */
  trouble(b, vol) {
    held(b, { f: 520, f2: 1500, at: 0, dur: 0.28, peak: 0.09 * vol, wet: 0.3 });
    burst(b, { at: 0, dur: 0.28, attack: 0.03, type: "bandpass", f: 1500, f2: 3500, q: 1.5, peak: 0.02 * vol, wet: 0.2 });
    held(b, { f: 1500, f2: 480, at: 0.3, dur: 0.3, peak: 0.09 * vol, wet: 0.3 });
    burst(b, { at: 0.3, dur: 0.3, attack: 0.03, type: "bandpass", f: 3500, f2: 1400, q: 1.5, peak: 0.02 * vol, wet: 0.2 });
    flute(b, 0.7, midiHz(76), 0.16, vol);
    flute(b, 0.9, midiHz(72), 0.26, vol);
  },
};

/** How long each cue runs, in seconds (for the check script's recordings and for timing what follows). */
export const POWER_SOUND_SECONDS: Record<Power, number> = { buddy: 1.2, camera: 0.8, nose: 0.8, wc: 1.4, trouble: 1.3 };

/** Play a power's cue on the table's speakers (nothing when sound is off). */
export function playPower(power: Power, vol = 1) {
  const b = bus();
  if (!b) return;
  cues[power](b, vol);
}

/** Draw a power's cue into `b` (an offline bus, say) instead of the speakers. */
export function render(power: Power, b: Bus, vol = 1) {
  cues[power](b, vol);
}
