/**
 * 打碟 · DJ Booth: records one of the stand-in DJ's sections ahead of time, on this device, with
 * the site's own instruments (an OfflineAudioContext renders faster than real time and needs no
 * tap). The result is exactly 8 bars of stereo PCM plus 2 seconds of ring-out, which the DJ lays
 * over the start of whatever comes next.
 *
 * Recording has to be quick, since the night can't move on until the next section exists. The drums
 * were most of the work (a filter and envelopes for every hat), so each drum is recorded once, a few
 * takes of it, and every hit plays a take back: the same sound for a fraction of the cost. The tuned
 * parts (bass, chords, melody) are played by the instruments themselves. And every sound is written
 * into the recording a beat before it plays rather than all at the start (see renderSection).
 */
import { burst, clap, clave, crash, hat, kick, offlineBus, shaker, snare, tom, type Bus } from "../../../lib/audio/engine";
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

/**
 * `spare`: the sound of a recording that has gone, to record into (WebKit is slow to give back
 * what a recording took, and a night records one every half minute or so: reusing it keeps the
 * page's memory flat). The recording is copied out of the renderer's own buffer either way.
 */
export async function renderSection(sec: Section, rate = 48000, spare?: () => { l: Float32Array; r: Float32Array } | undefined): Promise<Rendered> {
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
  const barS = 16 * stepS;
  const at = (bar: number, step = 0) => bar * barS + step * stepS;
  const kit = await drumKit(rate);
  const play = drummer(oc, b, out, kit);
  // the tuned parts from the instruments; the drums from the kit
  const tuned: Style = { ...sec.style, kick: undefined, snare: undefined, clap: undefined, hat: undefined, ohat: undefined, shaker: undefined, tom: undefined };
  const st = sec.style;
  const extras = sec.extras ?? [];

  /** Everything that starts in one beat. */
  const writeBeat = (beat: number) => {
    const bar = Math.floor(beat / 4);
    for (let i = (beat % 4) * 4; i < (beat % 4) * 4 + 4; i++) {
      const t = at(bar, i);
      playStep(b, tuned, bar * 16 + i, t, stepS, out);
      if (st.kick?.[i] && !sec.noKick?.includes(bar)) play("kick", t, 0.75 * st.kick[i]);
      if (st.snare?.[i]) play("snare", t, 0.3 * st.snare[i]);
      if (st.clap?.[i]) play("clap", t, 0.24 * st.clap[i]);
      if (st.hat?.[i]) play("hat", t, 0.08 * st.hat[i]);
      if (st.ohat?.[i]) play("ohat", t, 0.06 * st.ohat[i]);
      if (st.shaker?.[i]) play("shaker", t, 0.06 * st.shaker[i]);
      if (st.tom?.[i]) play("tom1.3", t, 0.3 * st.tom[i]);
      for (const pc of sec.perc ?? []) if (pc.hits[i]) play(pc.key, t, pc.peak * pc.hits[i]);
      // the roll: eighths, then sixteenths, getting louder
      if (bar === BARS - 1 && extras.includes("roll") && (i >= 8 || i % 2 === 0)) play("snare", t, 0.1 + 0.25 * (i / 15));
      if (bar === BARS - 1 && extras.includes("fill") && i >= 12) play(`tom${[1.45, 1.25, 1.05, 0.88][i - 12]}`, t, 0.32);
    }
    if (beat === 0 && extras.includes("crash")) play("crash", 0, 0.16);
    if (beat === (BARS - 2) * 4 && extras.includes("riser"))
      burst(b, { abs: true, dest: out, at: at(bar), dur: 2 * barS, attack: 2 * barS - 0.06, type: "bandpass", f: 350, f2: 7000, q: 1.4, peak: 0.07, wet: 0.35 });
  };

  // Every sound waiting to start costs a little on every slice of the recording, so each beat is
  // written a beat before it plays (the recording pauses there), not all at the start.
  const beatS = 4 * stepS;
  writeBeat(0);
  writeBeat(1);
  for (let beat = 2; beat < BARS * 4; beat++) {
    const write = () => writeBeat(beat);
    let paused: Promise<void> | null = null;
    try {
      paused = oc.suspend((beat - 1) * beatS);
    } catch {
      // a browser that can't pause a recording gets everything up front
    }
    if (!paused) {
      write();
      continue;
    }
    paused.then(
      () => {
        try {
          write();
        } finally {
          oc.resume().catch(() => {});
        }
      },
      write,
    );
  }

  const buf = await oc.startRendering();
  const into = spare?.();
  const n = buf.length;
  const l = into && into.l.length === n ? into.l : new Float32Array(n);
  const r = into && into.r.length === n ? into.r : new Float32Array(n);
  l.set(buf.getChannelData(0));
  r.set(buf.getChannelData(1));
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

/* ------------------------------------------------------------------ the drum kit */

type Take = { dry: Float32Array; wet: Float32Array };
type Kit = Record<string, Take[]>;

/** Each drum, how many takes of it (noise differs a little take to take), and how long it rings. */
const DRUMS: { key: string; takes: number; len: number; hit: (b: Bus, at: number) => void }[] = [
  { key: "kick", takes: 2, len: 0.7, hit: (b, at) => kick(b, { at, abs: true, peak: 1 }) },
  { key: "snare", takes: 3, len: 0.6, hit: (b, at) => snare(b, { at, abs: true, peak: 1 }) },
  { key: "clap", takes: 2, len: 0.7, hit: (b, at) => clap(b, { at, abs: true, peak: 1 }) },
  { key: "hat", takes: 4, len: 0.3, hit: (b, at) => hat(b, { at, abs: true, peak: 1 }) },
  { key: "ohat", takes: 2, len: 0.6, hit: (b, at) => hat(b, { at, abs: true, peak: 1, open: true }) },
  { key: "shaker", takes: 4, len: 0.3, hit: (b, at) => shaker(b, { at, abs: true, peak: 1 }) },
  ...[1.3, 1.45, 1.25, 1.05, 0.88].map((pitch) => ({ key: `tom${pitch}`, takes: 1, len: 0.8, hit: (b: Bus, at: number) => tom(b, { at, abs: true, peak: 1, pitch }) })),
  // the other styles' percussion: congas, a low dhol, a clave
  ...[1.6, 0.8, 0.62].map((pitch) => ({ key: `tom${pitch}`, takes: 2, len: 0.8, hit: (b: Bus, at: number) => tom(b, { at, abs: true, peak: 1, pitch }) })),
  { key: "clave", takes: 2, len: 0.2, hit: (b, at) => clave(b, { at, abs: true, peak: 1 }) },
  { key: "crash", takes: 1, len: 3.4, hit: (b, at) => crash(b, { at, abs: true, peak: 1, decay: 2.2 }) },
];

const kits = new Map<number, Promise<Kit>>();

/**
 * Every drum recorded once (a few takes), at full strength, its dry sound and what it sends to the
 * room reverb kept apart: one short recording for the whole kit.
 */
function drumKit(rate: number): Promise<Kit> {
  let k = kits.get(rate);
  if (!k) {
    k = recordKit(rate).catch((e) => {
      // asked for again by the next section
      kits.delete(rate);
      throw e;
    });
    kits.set(rate, k);
  }
  return k;
}

async function recordKit(rate: number): Promise<Kit> {
  const slots: { key: string; at: number; len: number }[] = [];
  let at = 0.01;
  for (const d of DRUMS)
    for (let n = 0; n < d.takes; n++) {
      slots.push({ key: d.key, at, len: d.len });
      at += d.len + 0.05;
    }
  const oc = new OfflineAudioContext(2, Math.ceil((at + 0.1) * rate), rate);
  // the dry sound on the left channel, the reverb send on the right
  const merge = oc.createChannelMerger(2);
  merge.connect(oc.destination);
  const dry = oc.createGain();
  dry.connect(merge, 0, 0);
  const wet = oc.createGain();
  wet.connect(merge, 0, 1);
  const b: Bus = { c: oc as unknown as AudioContext, out: dry, dry, verb: wet, music: dry };
  for (const sl of slots) DRUMS.find((d) => d.key === sl.key)!.hit(b, sl.at);
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const kit: Kit = {};
  for (const sl of slots) {
    const a = Math.round(sl.at * rate);
    // cut where the take has died away (-80 dB at full strength), so it plays no longer than it sounds
    let z = a + Math.round(sl.len * rate);
    while (z > a + 1 && Math.abs(L[z - 1]) < 1e-4 && Math.abs(R[z - 1]) < 1e-4) z--;
    (kit[sl.key] ??= []).push({ dry: L.slice(a, z), wet: R.slice(a, z) });
  }
  return kit;
}

/**
 * Plays a drum at a strength, the next of its takes each time: its dry sound into the section, its
 * send into the reverb.
 */
function drummer(oc: OfflineAudioContext, b: Bus, out: AudioNode, kit: Kit) {
  const cache = new Map<Float32Array, AudioBuffer>();
  const count = new Map<string, number>();
  const buffer = (data: Float32Array) => {
    let ab = cache.get(data);
    if (!ab) {
      ab = oc.createBuffer(1, data.length, oc.sampleRate);
      ab.getChannelData(0).set(data);
      cache.set(data, ab);
    }
    return ab;
  };
  return (key: string, at: number, peak: number) => {
    const takes = kit[key];
    if (!takes?.length || peak <= 0) return;
    const n = count.get(key) ?? 0;
    count.set(key, n + 1);
    const take = takes[n % takes.length];
    for (const [data, dest] of [
      [take.dry, out],
      [take.wet, b.verb],
    ] as const) {
      const src = oc.createBufferSource();
      src.buffer = buffer(data);
      const g = oc.createGain();
      g.gain.value = peak;
      src.connect(g).connect(dest);
      src.start(at);
    }
  };
}
