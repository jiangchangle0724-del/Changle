/**
 * 打碟 · DJ Booth: more club sounds for the pads (Steve on Nov 2: "more DJ sound effects like
 * airhorn blasts, vinyl record"), made in the speaker like the others (fx.ts calls these): no
 * samples. Each starts at an audio time on the beat the driver picked and says when it's over.
 */

/** A soft clip, for a growl a small speaker can carry. */
function clip(k: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/** Let the nodes go once a sound is over. */
const after = (c: BaseAudioContext, end: number, node: AudioNode) => window.setTimeout(() => node.disconnect(), (end - c.currentTime + 1) * 1000);

/** Seeded noise, so a sound is the same every time (and the checks can hear it). */
export function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A sound's noise, made once per speaker: a press plays it straight away instead of holding the TV's
 * page up to make it again (the vinyl's two bars are about 190 000 numbers: 15 to 30 ms here, 50 to
 * 85 ms on a TV six times slower, Nov 5). One buffer plays under any number of presses at once; each
 * tempo makes its own length, and only the last few used are kept.
 */
const made = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const KEEP = 8;
export function noiseOnce(c: BaseAudioContext, name: string, n: number, fill: (d: Float32Array) => void): AudioBuffer {
  let m = made.get(c);
  if (!m) made.set(c, (m = new Map()));
  const key = `${name}:${n}`;
  let buf = m.get(key);
  if (buf) m.delete(key);
  else {
    buf = c.createBuffer(1, n, c.sampleRate);
    fill(buf.getChannelData(0));
  }
  m.set(key, buf);
  if (m.size > KEEP) m.delete(m.keys().next().value!);
  return buf;
}

/**
 * How this press of a pad comes out (audio-design, "vary repeated SFX"): a hair higher or lower and a
 * touch louder or softer than the last, so a pad pressed again and again doesn't sound like a
 * machine. `cents` moves the pitch (100 to a semitone), `level` the loudness (1 as made).
 */
export type Take = { cents: number; level: number };
export const AS_MADE: Take = { cents: 0, level: 1 };

/**
 * The next take of a pad whose last was take `last` (0 to 4; none yet: any): one of five pitches
 * across ±`cents`, never the last one again, and up to 1.5 dB louder or softer.
 */
export function nextTake(last: number | undefined, cents: number, rnd: () => number = Math.random): { i: number; take: Take } {
  let i = Math.floor(rnd() * (last === undefined ? 5 : 4));
  if (last !== undefined && i >= last) i++;
  return { i, take: { cents: ((i - 2) / 2) * cents, level: Math.pow(10, (rnd() * 3 - 1.5) / 20) } };
}

/**
 * 黑胶 Vinyl: two bars of an old record under the music: crackle (pops of every size, a few dozen a
 * second) over a soft hiss. fx.ts also darkens the music for those two bars.
 */
export function vinyl(c: BaseAudioContext, out: AudioNode, at: number, beat: number): number {
  const len = 8 * beat;
  const sr = c.sampleRate;
  const n = Math.ceil(len * sr);
  const buf = noiseOnce(c, "vinyl", n, (d) => {
    const r = rand(4242);
    let pop = 0;
    let decay = 0;
    for (let i = 0; i < n; i++) {
      // a pop now and then (about 40 a second), each dying away in a fraction of a millisecond to a few
      if (r() < 40 / sr) {
        pop = (r() < 0.15 ? 0.9 : 0.35) * (r() < 0.5 ? -1 : 1) * (0.4 + 0.6 * r());
        decay = Math.exp(-1 / (sr * (0.0002 + 0.0015 * r())));
      }
      d[i] = pop + (r() * 2 - 1) * 0.06;
      pop *= decay;
    }
  });
  const src = c.createBufferSource();
  src.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2600;
  band.Q.value = 0.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.6, at + 0.05);
  g.gain.setValueAtTime(0.6, at + len - 0.25);
  g.gain.linearRampToValueAtTime(0, at + len);
  src.connect(band).connect(g).connect(out);
  src.start(at);
  src.stop(at + len + 0.02);
  after(c, at + len, g);
  return at + len;
}

/** 低音炸弹 Bass drop: a sub boom on the beat, its pitch diving, with a thump on top. */
export function bassDrop(c: BaseAudioContext, out: AudioNode, at: number, beat: number, take: Take = AS_MADE): number {
  const end = at + 3 * beat;
  const shaper = c.createWaveShaper();
  shaper.curve = clip(1.8);
  const g = c.createGain();
  const peak = 0.5 * take.level;
  const fall = at + 0.8 * beat;
  const tau = 0.45 * beat;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.008);
  g.gain.setTargetAtTime(0, fall, tau);
  // the tail closes to nothing just before the end, so the boom doesn't click off (ui-sound-design,
  // "stop after the envelope"): held where the fall has got to, then a short fade
  const close = end - 0.03;
  g.gain.setValueAtTime(peak * Math.exp(-(close - fall) / tau), close);
  g.gain.linearRampToValueAtTime(0, end);
  shaper.connect(g).connect(out);
  // the sub, and an octave up so a TV's small speakers carry it
  for (const [mul, level] of [
    [1, 1],
    [2, 0.35],
  ]) {
    const o = c.createOscillator();
    o.type = "sine";
    o.detune.value = take.cents;
    o.frequency.setValueAtTime(120 * mul, at);
    o.frequency.exponentialRampToValueAtTime(32 * mul, at + 1.6 * beat);
    const lv = c.createGain();
    lv.gain.value = level;
    o.connect(lv).connect(shaper);
    o.start(at);
    o.stop(end + 0.01);
  }
  // the thump: a short dark burst
  const src = c.createBufferSource();
  const n = Math.ceil(0.08 * c.sampleRate);
  src.buffer = noiseOnce(c, "thump", n, (d) => {
    const r = rand(77);
    for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.exp((-i / n) * 6);
  });
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  const tg = c.createGain();
  tg.gain.value = 0.6 * take.level;
  src.connect(lp).connect(tg).connect(out);
  src.start(at);
  after(c, end, g);
  after(c, end, tg);
  return end;
}

/** 反向镲 Reverse cymbal: a crash played backwards, swelling for two beats into the beat after. */
export function reverseCymbal(c: BaseAudioContext, out: AudioNode, at: number, beat: number): number {
  const len = 2 * beat;
  const n = Math.ceil(len * c.sampleRate);
  const src = c.createBufferSource();
  src.buffer = noiseOnce(c, "reverse", n, (d) => {
    const r = rand(9001);
    // a crash's noise, rising instead of dying away (and cut on the beat)
    for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.pow(i / n, 2.6);
  });
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3800;
  const peak = c.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 8200;
  peak.gain.value = 6;
  const g = c.createGain();
  g.gain.value = 0.42;
  src.connect(hp).connect(peak).connect(g).connect(out);
  src.start(at);
  after(c, at + len, g);
  return at + len;
}

/** 口哨 Whistle: a samba whistle, two short blasts and a long trill, on the eighths. */
export function whistle(c: BaseAudioContext, out: AudioNode, at: number, beat: number, take: Take = AS_MADE): number {
  const end = at + 2.2 * beat;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.value = 2950;
  o.detune.value = take.cents;
  // the pea's trill: the pitch and the level flutter about 26 times a second
  const lfo = c.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 26;
  const wob = c.createGain();
  wob.gain.value = 120;
  lfo.connect(wob).connect(o.frequency);
  const trill = c.createGain();
  const am = c.createGain();
  am.gain.value = 0.35;
  lfo.connect(am).connect(trill.gain);
  trill.gain.value = 0.65;
  const g = c.createGain();
  g.gain.value = 0;
  o.connect(trill).connect(g).connect(out);
  for (const [b, len] of [
    [0, 0.32],
    [0.5, 0.32],
    [1, 1.15],
  ]) {
    const t0 = at + b * beat;
    const t1 = t0 + len * beat;
    // each blast pipes up into its note
    o.frequency.setValueAtTime(2550, t0);
    o.frequency.exponentialRampToValueAtTime(2950, t0 + 0.03);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.38 * take.level, t0 + 0.008);
    g.gain.setValueAtTime(0.38 * take.level, Math.max(t0 + 0.009, t1 - 0.02));
    g.gain.linearRampToValueAtTime(0, t1);
  }
  o.start(at);
  lfo.start(at);
  o.stop(end + 0.05);
  lfo.stop(end + 0.05);
  after(c, end, g);
  return end;
}

// a check rendered these offline in the browser (dj_turntable_check.py, retired on Nov 12 with the phones' turntables: in git's history)
if (typeof window !== "undefined" && import.meta.env?.DEV) (window as unknown as { __club: unknown }).__club = { vinyl, bassDrop, reverseCymbal, whistle, noiseOnce };
