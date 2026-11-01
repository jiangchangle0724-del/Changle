/**
 * 打碟 · DJ Booth: records one of the stand-in DJ's sections ahead of time, on this device, with
 * the site's own instruments (an OfflineAudioContext renders faster than real time and needs no
 * tap). The result is exactly 8 bars of stereo PCM plus 2 seconds of ring-out, which the DJ lays
 * over the start of whatever comes next.
 */
import { burst, crash, offlineBus, snare, tom } from "../../../lib/audio/engine";
import { playStep, type Style } from "../../../lib/music";
import { BARS, beatFrames, sectionFrames, type Section } from "./sections";

export const TAIL_S = 2;

export type Rendered = {
  id: string;
  /** frames in the 8 bars; the arrays run `tail` frames longer */
  frames: number;
  tail: number;
  l: Float32Array;
  r: Float32Array;
};

export async function renderSection(sec: Section, rate = 48000): Promise<Rendered> {
  const frames = sectionFrames(rate);
  const tail = Math.round(TAIL_S * rate);
  const oc = new OfflineAudioContext(2, frames + tail, rate);
  const b = offlineBus(oc);
  if (sec.lp) {
    const lp = oc.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = sec.lp;
    lp.Q.value = 0.6;
    b.out.disconnect();
    b.out.connect(lp).connect(oc.destination);
  }
  const out = oc.createGain();
  out.gain.value = sec.style.gain;
  out.connect(b.music);

  const stepS = beatFrames(rate) / rate / 4;
  const noKick: Style = { ...sec.style, kick: undefined };
  for (let step = 0; step < BARS * 16; step++) {
    const bar = Math.floor(step / 16);
    const style = sec.noKick?.includes(bar) ? noKick : sec.style;
    playStep(b, style, step, step * stepS, stepS, out);
  }

  const at = (bar: number, step = 0) => (bar * 16 + step) * stepS;
  const o = { abs: true, dest: out };
  for (const x of sec.extras ?? []) {
    if (x === "crash") crash(b, { ...o, at: 0, peak: 0.16, decay: 2.2 });
    if (x === "roll")
      // the last bar: eighths, then sixteenths, getting louder
      for (let k = 0; k < 16; k++) if (k >= 8 || k % 2 === 0) snare(b, { ...o, at: at(BARS - 1, k), peak: 0.1 + 0.25 * (k / 15) });
    if (x === "riser") burst(b, { ...o, at: at(BARS - 2), dur: 2 * 16 * stepS, attack: 2 * 16 * stepS - 0.06, type: "bandpass", f: 350, f2: 7000, q: 1.4, peak: 0.07, wet: 0.35 });
    if (x === "fill") [1.45, 1.25, 1.05, 0.88].forEach((pitch, k) => tom(b, { ...o, at: at(BARS - 1, 12 + k), peak: 0.32, pitch }));
  }

  const buf = await oc.startRendering();
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  level(l, r, frames, sec.level);
  return { id: sec.id, frames, tail, l, r };
}

/** Bring the 8 bars to their RMS level (dBFS), never letting a peak past -0.5 dBFS. */
function level(l: Float32Array, r: Float32Array, frames: number, db: number) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    sum += l[i] * l[i] + r[i] * r[i];
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  const rms = Math.sqrt(sum / (2 * frames));
  if (!rms || !peak) return;
  const k = Math.min(Math.pow(10, db / 20) / rms, 0.944 / peak);
  for (let i = 0; i < l.length; i++) {
    l[i] *= k;
    r[i] *= k;
  }
}
