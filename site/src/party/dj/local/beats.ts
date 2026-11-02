/**
 * 打碟 · DJ Booth, your songs: where a song's beats fall, from its sound alone. The tempo (to a
 * hundredth of a beat a minute, so two songs stay together for minutes), the first beat, which
 * beat starts a bar, where it gets loud (a drop lands there), and where it's still worth playing.
 *
 * How: the sound's onsets (sudden rises in its loudness, the low end, the kick, counted more), the
 * tempo whose beats line up with the most of them over the whole song (a rough guess from how the
 * onsets repeat, then every tempo and phase near it tried against the song), the bar from where the
 * kick falls heaviest, the loud part from each bar's loudness. Pure: no sound, no clock.
 */

export type SongBeat = {
  /** beats a minute, between MIN_BPM and MAX_BPM (a tempo outside is counted in halves or doubles) */
  bpm: number;
  /** seconds: the first beat, and the first beat of a bar (a downbeat) */
  first: number;
  down: number;
  /** seconds: a downbeat where the song gets loud (where a drop into it lands) */
  cue: number;
  /** seconds: where it's still worth playing to (before a long fade or silence) */
  end: number;
  /** 0 to 1: how clear the beat is (a song with no drums is near 0: it isn't matched) */
  sure: number;
};

export const MIN_BPM = 78;
export const MAX_BPM = 165;
/** frames a second of the onset envelope */
const FPS = 100;

/** A one-pole low-pass's coefficient for `hz` at `rate`. */
const pole = (hz: number, rate: number) => 1 - Math.exp((-2 * Math.PI * hz) / rate);

/** The envelope's value at a fractional frame (linear between frames; 0 outside). */
function at(env: Float32Array, x: number) {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  const f = x - i;
  return env[i] * (1 - f) + env[i + 1] * f;
}

/**
 * The song's beat. `mono`: the song's samples (any loudness), `rate`: their sample rate. Null when
 * it's too short (under 20 seconds) to tell.
 */
export function analyzeSong(mono: Float32Array, rate: number): SongBeat | null {
  const seconds = mono.length / rate;
  if (seconds < 20) return null;

  // 1. Down to about 11 kHz (the beat is in the low and middle), level to RMS 1.
  const k = Math.max(1, Math.round(rate / 11025));
  const r2 = rate / k;
  const n2 = Math.floor(mono.length / k);
  const x = new Float32Array(n2);
  let sum = 0;
  for (let i = 0; i < n2; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += mono[i * k + j];
    x[i] = s / k;
    sum += x[i] * x[i];
  }
  const rms = Math.sqrt(sum / Math.max(1, n2)) || 1;
  for (let i = 0; i < n2; i++) x[i] /= rms;

  // 2. Each 10 ms: the whole sound's loudness and the low end's (below 150 Hz: the kick, the bass).
  const hop = r2 / FPS;
  const frames = Math.floor(n2 / hop);
  const eAll = new Float32Array(frames);
  const eLow = new Float32Array(frames);
  const a = pole(150, r2);
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    const s0 = Math.floor(f * hop);
    const s1 = Math.floor((f + 1) * hop);
    let ea = 0;
    let el = 0;
    for (let i = s0; i < s1; i++) {
      lp += a * (x[i] - lp);
      ea += x[i] * x[i];
      el += lp * lp;
    }
    const m = Math.max(1, s1 - s0);
    eAll[f] = Math.log1p(10 * (ea / m));
    eLow[f] = Math.log1p(10 * (el / m));
  }

  // 3. Onsets: where the loudness rises (the low end's counted more), less the moment's average.
  const flux = new Float32Array(frames);
  const lowFlux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    lowFlux[f] = Math.max(0, eLow[f] - eLow[f - 1]);
    flux[f] = Math.max(0, eAll[f] - eAll[f - 1]) + 1.5 * lowFlux[f];
  }
  const W = 25;
  const env = new Float32Array(frames);
  let run = 0;
  for (let f = 0; f < Math.min(frames, W); f++) run += flux[f];
  for (let f = 0; f < frames; f++) {
    if (f + W < frames) run += flux[f + W];
    if (f - W - 1 >= 0) run -= flux[f - W - 1];
    const lo = Math.max(0, f - W);
    const hi = Math.min(frames - 1, f + W);
    env[f] = Math.max(0, flux[f] - run / (hi - lo + 1));
  }
  // a little smoothing, so a beat a frame off still counts
  const sm = new Float32Array(frames);
  for (let f = 1; f < frames - 1; f++) sm[f] = 0.25 * env[f - 1] + 0.5 * env[f] + 0.25 * env[f + 1];

  // 4. A rough tempo: the period the onsets repeat at most (the middle of the song, where it's
  // steadiest), with its double and half helping, and a lean towards dance tempos.
  const from = Math.floor(frames * 0.1);
  const to = Math.floor(frames * 0.9);
  const minLag = Math.floor((60 * FPS) / MAX_BPM);
  const maxLag = Math.ceil((60 * FPS) / MIN_BPM);
  const ac = new Float64Array(maxLag * 2 + 2);
  for (let lag = Math.floor(minLag / 2); lag <= maxLag * 2 + 1 && lag < ac.length; lag++) {
    let s = 0;
    for (let f = from; f + lag < to; f++) s += sm[f] * sm[f + lag];
    ac[lag] = s;
  }
  let best = -1;
  let bestLag = 0;
  let total = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * FPS) / lag;
    const lean = Math.exp(-0.5 * (Math.log2(bpm / 122) / 0.7) ** 2);
    const score = (ac[lag] + 0.5 * ac[2 * lag] + 0.25 * ac[Math.round(lag / 2)]) * lean;
    total += ac[lag];
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  if (!bestLag || best <= 0) return { bpm: 120, first: 0, down: 0, cue: Math.min(seconds * 0.25, 30), end: seconds, sure: 0 };
  // between the frames
  const y0 = ac[bestLag - 1];
  const y1 = ac[bestLag];
  const y2 = ac[bestLag + 1];
  const den = y0 - 2 * y1 + y2;
  const lag0 = bestLag + (den < 0 ? (0.5 * (y0 - y2)) / den : 0);

  // 5. The exact tempo and the beats: every period near the rough one, and every phase, tried
  // against the whole song (most onsets on the beats wins); coarse, then fine.
  const beatsOf = (period: number, phase: number) => {
    let s = 0;
    for (let t = phase; t < frames - 1; t += period) s += at(sm, t);
    return s;
  };
  let P = lag0;
  let phi = 0;
  let top = -1;
  const search = (lo: number, hi: number, step: number, phases: number) => {
    let bp = P;
    let bf = phi;
    let bs = -1;
    for (let p = lo; p <= hi; p += step) {
      for (let j = 0; j < phases; j++) {
        const ph = (j / phases) * p;
        const s = beatsOf(p, ph) / Math.max(1, Math.floor((frames - ph) / p));
        if (s > bs) {
          bs = s;
          bp = p;
          bf = ph;
        }
      }
    }
    P = bp;
    phi = bf;
    top = bs;
  };
  search(lag0 * 0.98, lag0 * 1.02, lag0 * 0.002, 64);
  search(P * 0.9985, P * 1.0015, P * 0.0001, 96);
  // the phase to a tenth of a frame
  let bestPh = phi;
  let bestS = -1;
  for (let d = -1; d <= 1; d += 0.1) {
    const s = beatsOf(P, phi + d);
    if (s > bestS) {
      bestS = s;
      bestPh = phi + d;
    }
  }
  phi = ((bestPh % P) + P) % P;

  // how clear: the beats' onsets against the average moment
  let mean = 0;
  for (let f = from; f < to; f++) mean += sm[f];
  mean /= Math.max(1, to - from);
  const sure = mean > 0 ? Math.max(0, Math.min(1, (top / mean - 1.5) / 4)) : 0;
  void total;

  const beat = P / FPS;
  const bpm = 60 / beat;
  const first = phi / FPS;

  // 6. The bar: the beat of four the low end hits hardest.
  const hits = [0, 0, 0, 0];
  let nb = 0;
  for (let t = phi; t < frames - 1; t += P, nb++) {
    const f = Math.round(t);
    let s = 0;
    for (let d = -2; d <= 2; d++) s += lowFlux[f + d] ?? 0;
    hits[nb % 4] += s;
  }
  let bar = 0;
  for (let m = 1; m < 4; m++) if (hits[m] > hits[bar]) bar = m;
  const down = first + bar * beat;

  // 7. Each bar's loudness; the loud part: the first 8 bars nearly as loud as the loudest 8 (on a
  // 4-bar line from the first downbeat when one is close), leaving at least 40 s to play
  const barS = 4 * beat;
  const bars = Math.floor((seconds - down) / barS);
  const loud = new Float64Array(Math.max(0, bars));
  for (let j = 0; j < bars; j++) {
    const s0 = Math.floor((down + j * barS) * r2);
    const s1 = Math.min(n2, Math.floor((down + (j + 1) * barS) * r2));
    let e = 0;
    for (let i = s0; i < s1; i++) e += x[i] * x[i];
    loud[j] = Math.sqrt(e / Math.max(1, s1 - s0));
  }
  const eight = (j: number) => {
    let e = 0;
    let c = 0;
    for (let i = j; i < Math.min(bars, j + 8); i++, c++) e += loud[i];
    return c ? e / c : 0;
  };
  const lastCue = Math.floor((seconds - 40 - down) / barS);
  let peak = 0;
  for (let j = 0; j <= Math.min(lastCue, bars - 1); j++) peak = Math.max(peak, eight(j));
  let cueBar = 0;
  for (let j = 0; j <= Math.min(lastCue, bars - 1); j++) {
    if (eight(j) >= 0.9 * peak) {
      cueBar = j;
      break;
    }
  }
  // the first bar from there that's loud itself, on a 4-bar line from the first downbeat if that
  // one is loud too
  for (let i = cueBar; i < Math.min(bars, cueBar + 8); i++) {
    if (loud[i] >= 0.9 * peak) {
      cueBar = i;
      break;
    }
  }
  const snap = cueBar - (cueBar % 4);
  if (loud[snap] >= 0.85 * peak) cueBar = snap;
  const cue = down + cueBar * barS;

  // 8. The end: after the last bar still at a third of the loudest (a fade or silence after it isn't played)
  let lastLoud = bars - 1;
  let maxBar = 0;
  for (let j = 0; j < bars; j++) maxBar = Math.max(maxBar, loud[j]);
  while (lastLoud > 0 && loud[lastLoud] < maxBar / 3) lastLoud--;
  const end = Math.min(seconds, down + (lastLoud + 1) * barS);

  return { bpm, first, down, cue, end, sure };
}

/**
 * How fast to play a song so its beats fall on `bpm`'s: its own tempo, or half or twice it,
 * whichever is nearest, if that's within `range` (a little faster or slower, as a DJ's pitch
 * fader does); null when none is (then it isn't matched: it plays at its own speed).
 */
export function matchRate(songBpm: number, bpm: number, range = 0.1): number | null {
  let best: number | null = null;
  for (const m of [0.5, 1, 2]) {
    const r = bpm / (songBpm * m);
    if (Math.abs(r - 1) <= range && (best === null || Math.abs(r - 1) < Math.abs(best - 1))) best = r;
  }
  return best;
}
