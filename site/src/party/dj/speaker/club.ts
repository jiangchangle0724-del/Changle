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
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 黑胶 Vinyl: two bars of an old record under the music: crackle (pops of every size, a few dozen a
 * second) over a soft hiss. fx.ts also darkens the music for those two bars.
 */
export function vinyl(c: BaseAudioContext, out: AudioNode, at: number, beat: number): number {
  const len = 8 * beat;
  const sr = c.sampleRate;
  const n = Math.ceil(len * sr);
  const buf = c.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
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
export function bassDrop(c: BaseAudioContext, out: AudioNode, at: number, beat: number): number {
  const end = at + 3 * beat;
  const shaper = c.createWaveShaper();
  shaper.curve = clip(1.8);
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.5, at + 0.008);
  g.gain.setTargetAtTime(0, at + 0.8 * beat, 0.45 * beat);
  shaper.connect(g).connect(out);
  // the sub, and an octave up so a TV's small speakers carry it
  for (const [mul, level] of [
    [1, 1],
    [2, 0.35],
  ]) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120 * mul, at);
    o.frequency.exponentialRampToValueAtTime(32 * mul, at + 1.6 * beat);
    const lv = c.createGain();
    lv.gain.value = level;
    o.connect(lv).connect(shaper);
    o.start(at);
    o.stop(end);
  }
  // the thump: a short dark burst
  const src = c.createBufferSource();
  const n = Math.ceil(0.08 * c.sampleRate);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  const r = rand(77);
  for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.exp((-i / n) * 6);
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  const tg = c.createGain();
  tg.gain.value = 0.6;
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
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  const r = rand(9001);
  // a crash's noise, rising instead of dying away (and cut on the beat)
  for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.pow(i / n, 2.6);
  const src = c.createBufferSource();
  src.buffer = buf;
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
export function whistle(c: BaseAudioContext, out: AudioNode, at: number, beat: number): number {
  const end = at + 2.2 * beat;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.value = 2950;
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
    g.gain.linearRampToValueAtTime(0.38, t0 + 0.008);
    g.gain.setValueAtTime(0.38, Math.max(t0 + 0.009, t1 - 0.02));
    g.gain.linearRampToValueAtTime(0, t1);
  }
  o.start(at);
  lfo.start(at);
  o.stop(end + 0.05);
  lfo.stop(end + 0.05);
  after(c, end, g);
  return end;
}

// the checks render these offline in the browser (dj_turntable_check.py)
if (typeof window !== "undefined" && import.meta.env?.DEV) (window as unknown as { __club: unknown }).__club = { vinyl, bassDrop, reverseCymbal, whistle };
