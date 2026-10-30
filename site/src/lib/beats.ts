/**
 * Where the beats and the singing are in a decoded preview, worked out once from the samples so
 * every phone can move the stage the same way at the same moment: a beat grid (tempo and the
 * time of each beat), how much drum there is around each moment, and how much voice.
 *
 * All of it comes from two filtered copies of the mono mix: the lows (kick and bass) for the
 * beats, the mids (where voices live) for the singing. No FFT: a few biquads over the samples,
 * then 20 ms frames, an onset curve, autocorrelation for the tempo and a comb for the phase.
 */

export type BeatMap = {
  bpm: number;
  /** seconds into the clip of every beat on the grid */
  beats: Float32Array;
  /** per frame: how much low end (drums) is hitting, 0..1 */
  drum: Float32Array;
  /** per frame: how much voice there is, 0..1 */
  voice: Float32Array;
  /** seconds per frame */
  frame: number;
  /** how sure the tempo is, 0..1 */
  conf: number;
};

const FRAME_S = 0.02;

/** Direct-form biquad over a whole signal (in place into `out`). */
function biquad(x: Float32Array, out: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
}
function lowpass(f: number, sr: number, q = 0.707) {
  const w = (2 * Math.PI * f) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), a0 = 1 + al;
  return [((1 - cs) / 2) / a0, (1 - cs) / a0, ((1 - cs) / 2) / a0, (-2 * cs) / a0, (1 - al) / a0] as const;
}
function highpass(f: number, sr: number, q = 0.707) {
  const w = (2 * Math.PI * f) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), a0 = 1 + al;
  return [((1 + cs) / 2) / a0, -(1 + cs) / a0, ((1 + cs) / 2) / a0, (-2 * cs) / a0, (1 - al) / a0] as const;
}

function frameRms(x: Float32Array, hop: number): Float32Array {
  const n = Math.floor(x.length / hop);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) s += x[base + i] * x[base + i];
    out[f] = Math.sqrt(s / hop);
  }
  return out;
}

function percentile(a: Float32Array, p: number) {
  const s = Array.from(a).sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] || 0;
}

export function analyzeBuffer(buf: AudioBuffer): BeatMap {
  const sr = buf.sampleRate;
  const n = buf.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels;
  }
  const low = new Float32Array(n), mid = new Float32Array(n), tmp = new Float32Array(n);
  const [lb0, lb1, lb2, la1, la2] = lowpass(150, sr);
  biquad(mono, tmp, lb0, lb1, lb2, la1, la2);
  biquad(tmp, low, lb0, lb1, lb2, la1, la2); // 4th order: tighter lows
  const [hb0, hb1, hb2, ha1, ha2] = highpass(280, sr);
  const [mb0, mb1, mb2, ma1, ma2] = lowpass(3200, sr);
  biquad(mono, tmp, hb0, hb1, hb2, ha1, ha2);
  biquad(tmp, mid, mb0, mb1, mb2, ma1, ma2);

  const hop = Math.round(sr * FRAME_S);
  const eLow = frameRms(low, hop), eMid = frameRms(mid, hop), eAll = frameRms(mono, hop);
  const F = eLow.length;

  // onset curve: rises in the lows count double, rises anywhere count too
  const lowMax = percentile(eLow, 0.98) || 1, allMax = percentile(eAll, 0.98) || 1;
  const onset = new Float32Array(F);
  for (let f = 1; f < F; f++) {
    const dl = Math.max(0, eLow[f] - eLow[f - 1]) / lowMax;
    const da = Math.max(0, eAll[f] - eAll[f - 1]) / allMax;
    onset[f] = dl * 2 + da;
  }
  let mean = 0;
  for (let f = 0; f < F; f++) mean += onset[f];
  mean /= F || 1;
  for (let f = 0; f < F; f++) onset[f] = Math.max(0, onset[f] - mean);

  // tempo: autocorrelation over 60..180 BPM with a soft preference for the 100-130 range
  const r = (L: number) => {
    let s = 0;
    for (let i = 0; i + L < F; i++) s += onset[i] * onset[i + L];
    return s / Math.max(1, F - L);
  };
  const r0 = r(0) || 1e-9;
  const minL = Math.round(60 / 180 / FRAME_S), maxL = Math.round(60 / 60 / FRAME_S);
  const scores = new Float32Array(maxL + 1);
  let best = -1, bestL = Math.round(60 / 115 / FRAME_S);
  for (let L = minL; L <= maxL; L++) {
    const bpm = 60 / (L * FRAME_S);
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.55, 2));
    const harm = r(L) + 0.5 * r(2 * L) + 0.3 * (L % 2 === 0 ? r(L / 2) : 0);
    scores[L] = harm * prior;
    if (scores[L] > best) {
      best = scores[L];
      bestL = L;
    }
  }
  let Lf = bestL;
  if (bestL > minL && bestL < maxL) {
    const a = scores[bestL - 1], b = scores[bestL], c = scores[bestL + 1], den = a - 2 * b + c;
    if (Math.abs(den) > 1e-12) Lf = bestL + (0.5 * (a - c)) / den;
  }
  const period = Lf * FRAME_S;
  const conf = Math.max(0, Math.min(1, r(bestL) / r0));

  // phase: the comb that collects the most onset
  let bestPhi = 0, bestS = -1;
  for (let phi = 0; phi < bestL; phi++) {
    let s = 0, k = 0;
    for (let i = phi; i < F; i += bestL) {
      s += onset[i];
      k++;
    }
    s /= k || 1;
    if (s > bestS) {
      bestS = s;
      bestPhi = phi;
    }
  }
  // snap the first beat to the strongest onset near the comb's start, then lay the grid
  let t0 = bestPhi * FRAME_S;
  const seconds = n / sr;
  const beats: number[] = [];
  for (let t = t0; t < seconds; t += period) beats.push(t);

  // drum: lows, peak-held so a kick reads for a moment; voice: mids above their quiet floor
  const drum = new Float32Array(F), voice = new Float32Array(F);
  const midHi = percentile(eMid, 0.95) || 1, midLo = percentile(eMid, 0.2);
  let hold = 0, v = 0;
  for (let f = 0; f < F; f++) {
    const d = Math.min(1, eLow[f] / lowMax);
    hold = Math.max(d, hold * 0.86);
    drum[f] = hold;
    const raw = Math.max(0, Math.min(1, (eMid[f] - midLo) / Math.max(1e-6, midHi - midLo)));
    v += (raw - v) * (raw > v ? 0.5 : 0.18);
    voice[f] = v;
  }
  return { bpm: 60 / period, beats: Float32Array.from(beats), drum, voice, frame: FRAME_S, conf };
}

/** Sample a per-frame curve at a time in seconds. */
export function curveAt(curve: Float32Array, frame: number, t: number) {
  if (t < 0) return 0;
  const i = Math.floor(t / frame);
  return i < curve.length ? curve[i] : 0;
}

/** How many beats have passed by `t` seconds (the index of the next beat). */
export function beatIndexAt(beats: Float32Array, t: number) {
  let lo = 0, hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const cache = new Map<string, BeatMap>();
/** The beat map for a preview URL, worked out once per phone. */
export function beatsFor(url: string, buf: AudioBuffer | null): BeatMap | null {
  if (!buf) return null;
  let m = cache.get(url);
  if (!m) {
    try {
      m = analyzeBuffer(buf);
    } catch {
      return null;
    }
    cache.set(url, m);
    if (cache.size > 4) cache.delete(cache.keys().next().value as string);
  }
  return m;
}
