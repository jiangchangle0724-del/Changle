/**
 * Plays 戏精大赏's music (compose.ts): the theme off stage, and on stage the scene's own piece, so
 * the theme is never heard while anyone is acting.
 *
 * A piece plays on the audio clock from a moment every screen agrees on: the act's first second for
 * the scene's piece, and for the theme a beat that runs from the table clock's zero, so every phone
 * and the big screen play the same note at the same time, and one that comes back from a call or
 * the lock screen falls back in step.
 */
import { useEffect, useState } from "react";
import { bus, clave, ctxTimeAt, midiHz, noise, note, strike, tone, voice, type Bus, type Inst } from "../../lib/audio/engine";
import type { DramaView } from "../../shared/protocol";
import { perfAt } from "../sensors";
import { actMusic, actPiece, THEME, type Hit, type Piece } from "./compose";

/** Each instrument's loudest, at full strength: a soft band, under the voices. */
const PEAK: Record<Inst, number> = {
  ep: 0.075,
  marimba: 0.1,
  musicbox: 0.07,
  bell: 0.055,
  steel: 0.09,
  pluck: 0.13,
  brass: 0.05,
  bass: 0.2,
  lead: 0.032,
  pad: 0.03,
};

type Hiss = { at: number; dest: AudioNode; peak: number; decay: number; f: number; type?: BiquadFilterType; q?: number; attack?: number; hold?: number; wet?: number };

/**
 * A short hiss of filtered noise, the stuff of the drums. The engine's own (`burst`) lets the noise's
 * first sample through at full strength, a click far louder than a soft hi-hat; this one starts
 * silent. (The engine's fix is handed to the platform: docs/briefs/drama.md.)
 */
function hiss(b: Bus, o: Hiss) {
  const { c } = b;
  const t0 = Math.max(c.currentTime, o.at);
  const attack = o.attack ?? 0.002;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filt = c.createBiquadFilter();
  filt.type = o.type ?? "bandpass";
  filt.frequency.value = o.f;
  filt.Q.value = o.q ?? 1;
  const amp = c.createGain();
  amp.gain.value = 0;
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(o.peak, t0 + attack);
  amp.gain.setTargetAtTime(0, t0 + attack + (o.hold ?? 0), Math.max(0.004, o.decay / 4));
  src.connect(filt).connect(amp).connect(voice(b, o.wet ?? 0.15, o.dest));
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + attack + (o.hold ?? 0) + o.decay * 1.6 + 0.05);
}

/** A kick drum: a falling sine, and a soft tap on top. */
function thump(b: Bus, at: number, dest: AudioNode, peak: number, pitch = 1) {
  tone(b, { at, abs: true, dest, f: 165 * pitch, f2: 46 * pitch, glide: 0.11, peak, attack: 0.002, decay: 0.4, wet: 0.04 });
  hiss(b, { at, dest, peak: peak * 0.12, decay: 0.008, type: "lowpass", f: 3500, q: 0.7, wet: 0 });
}

/** One hit at audio time `t` (exported for scripts that record a piece offline to listen to it). */
export function playHit(b: Bus, h: Hit, t: number, stepS: number, dest: AudioNode) {
  const o = { at: t, abs: true as const, dest };
  switch (h.i) {
    case "kick":
      return thump(b, t, dest, 0.7 * h.v);
    case "heart":
      // a heartbeat: low and soft
      return thump(b, t, dest, 0.6 * h.v, 0.5);
    case "snare":
      hiss(b, { at: t, dest, peak: 0.24 * h.v, decay: 0.13, f: 2600, q: 0.6, wet: 0.22 });
      return tone(b, { ...o, f: 190, f2: 160, glide: 0.06, type: "triangle", peak: 0.14 * h.v, attack: 0.001, decay: 0.07, wet: 0.15 });
    case "rim":
      return clave(b, { ...o, peak: 0.11 * h.v, pitch: 0.7 });
    case "brush":
      return hiss(b, { at: t, dest, peak: 0.07 * h.v, attack: 0.02, hold: 0.03, decay: 0.06, f: 4200, q: 0.7, wet: 0.2 });
    case "clap":
      for (const d of [0, 0.011, 0.023]) hiss(b, { at: t + d, dest, peak: 0.2 * h.v, decay: 0.012, f: 1300, q: 1.1, wet: 0.2 });
      return hiss(b, { at: t + 0.03, dest, peak: 0.15 * h.v, decay: 0.12, f: 1150, q: 0.9, wet: 0.35 });
    case "hat":
      return hiss(b, { at: t, dest, peak: 0.12 * h.v, decay: 0.03, type: "highpass", f: 7600, q: 0.7, wet: 0.08 });
    case "ohat":
      return hiss(b, { at: t, dest, peak: 0.08 * h.v, decay: 0.17, type: "highpass", f: 7000, q: 0.7, wet: 0.08 });
    case "shaker":
      return hiss(b, { at: t, dest, peak: 0.09 * h.v, attack: 0.012, decay: 0.035, f: 6200, q: 1.3, wet: 0.08 });
    case "tom": {
      const p = h.m ? midiHz(h.m) / 150 : 1;
      tone(b, { ...o, f: 210 * p, f2: 92 * p, glide: 0.2, peak: 0.24 * h.v, attack: 0.002, decay: 0.32, wet: 0.25 });
      return hiss(b, { at: t, dest, peak: 0.07 * h.v, decay: 0.04, type: "lowpass", f: 1400, q: 0.7, wet: 0.15 });
    }
    case "clave":
      return clave(b, { ...o, peak: 0.12 * h.v });
    case "crash":
      hiss(b, { at: t, dest, peak: 0.09 * h.v, decay: 1.6, type: "highpass", f: 4200, q: 0.5, wet: 0.4 });
      return hiss(b, { at: t, dest, peak: 0.055 * h.v, decay: 1, f: 7800, q: 0.8, wet: 0.4 });
    case "gong":
      return strike(b, 82, [1, 1.48, 2.06, 2.72, 3.4], [1, 0.6, 0.45, 0.3, 0.2], [3.2, 2.4, 1.8, 1.2, 0.9], { ...o, peak: 0.08 * h.v, wet: 0.6, glide: 0.97 });
    case "timp": {
      const f = midiHz(h.m ?? 38);
      tone(b, { ...o, f: f * 1.02, f2: f, glide: 0.3, peak: 0.22 * h.v, attack: 0.004, decay: 1.1, wet: 0.35 });
      return hiss(b, { at: t, dest, peak: 0.05 * h.v, decay: 0.2, type: "lowpass", f: 380, q: 0.8, wet: 0.3 });
    }
    default:
      return note(b, h.i, { ...o, f: midiHz(h.m ?? 60), dur: Math.max(0.06, (h.d ?? 1) * stepS), peak: PEAK[h.i] * h.v });
  }
}

export type Playing = { stop: (fade?: number) => void };

/**
 * Play a piece round and round. `startPerf` is where its first step falls on this screen's
 * performance clock: in the past, it joins wherever the piece has got to.
 */
export function playPiece(piece: Piece, o: { startPerf: number; volume?: number; fadeIn?: number }): Playing | null {
  const b = bus();
  if (!b) return null;
  const stepS = 60 / piece.bpm / 4;
  const loop = piece.bars.length * piece.steps;
  const loopMs = loop * stepS * 1000;
  // the same beat, counted from its latest time round: the numbers stay small
  let startPerf = o.startPerf;
  const nowPerf = performance.now();
  if (startPerf < nowPerf - loopMs) startPerf += Math.floor((nowPerf - startPerf) / loopMs) * loopMs;
  const byStep = piece.bars.map((bar) => {
    const at: Hit[][] = Array.from({ length: piece.steps }, () => []);
    for (const h of bar) at[Math.max(0, Math.min(piece.steps - 1, Math.floor(h.s)))].push(h);
    return at;
  });
  const out = b.c.createGain();
  out.gain.value = 0;
  out.connect(b.music);
  out.gain.setTargetAtTime(piece.gain * (o.volume ?? 1), b.c.currentTime, Math.max(0.05, (o.fadeIn ?? 1) / 3));
  let origin = ctxTimeAt(b, startPerf);
  // the next step to play: found once the audio clock runs
  let step = -1;
  let dead = false;
  const tick = () => {
    if (dead || b.c.state !== "running") return;
    const now = b.c.currentTime;
    const est = ctxTimeAt(b, startPerf);
    // the audio clock stood still (a phone not tapped yet, a call): back in step with everyone
    if (step < 0 || Math.abs(est - origin) > 0.04) {
      origin = est;
      step = Math.max(0, Math.ceil((now + 0.05 - origin) / stepS));
    }
    const horizon = now + (document.hidden ? 1.5 : 0.25);
    while (origin + step * stepS < horizon) {
      const pos = step % loop;
      const bar = Math.floor(pos / piece.steps);
      const s = pos % piece.steps;
      const at = origin + step * stepS;
      // the off-beat eighth leans back, and the sixteenth after it with it
      const lean = piece.swing ? (s % 4 === 2 ? piece.swing * 2 : s % 4 === 3 ? piece.swing : 0) * stepS : 0;
      if (at >= now - 0.01) for (const h of byStep[bar][s]) playHit(b, h, at + lean + (h.s - s + (h.t ?? 0)) * stepS, stepS, out);
      step++;
    }
  };
  tick();
  const timer = window.setInterval(tick, 40);
  return {
    stop(fade = 0.8) {
      if (dead) return;
      dead = true;
      window.clearInterval(timer);
      const t = b.c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.setTargetAtTime(0, t, Math.max(0.02, fade / 3));
      window.setTimeout(() => out.disconnect(), fade * 1000 + 2500);
    },
  };
}

/** The scene's piece sits under the actors' voices. */
const ACT_VOLUME = 0.75;

/**
 * The music for where the game is: the theme while the table chooses, reads its cards, votes, sees
 * the reveal (once the drum roll and the spotlight are done) and takes its bow; the scene's own piece
 * from the moment the curtain goes up until the scene ends. `on`: this screen plays it. `tableNow`:
 * the table's clock online, so every screen is on the same beat; without it (one phone) the theme
 * starts from its first bar each time it comes back.
 */
export function useDramaMusic(v: DramaView, on: boolean, tableNow?: () => number) {
  const act = on && v.phase === "act" ? `${v.round}|${actMusic(v).key}` : null;
  useEffect(() => {
    if (!act) return;
    const from = v.endsAt - v.actMs;
    const startPerf = tableNow ? perfAt(from, tableNow()) : performance.now() - (Date.now() - from);
    const p = playPiece(actPiece(v), { startPerf, volume: ACT_VOLUME, fadeIn: 2.5 });
    return () => p?.stop(1.2);
    // once per scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  // the theme: one run through choosing and reading the cards, then a fresh one for each vote,
  // reveal and curtain call
  const run = !on || v.phase === "act" ? null : v.phase === "setup" || v.phase === "brief" ? "before" : `${v.phase}${v.round}`;
  useEffect(() => {
    if (!run) return;
    const wait = v.phase === "reveal" ? 5000 : v.phase === "end" ? 2500 : 0;
    let p: Playing | null = null;
    const id = window.setTimeout(() => {
      p = playPiece(THEME, { startPerf: tableNow ? perfAt(0, tableNow()) : performance.now() + 80, volume: v.phase === "vote" ? 0.8 : 1, fadeIn: wait ? 3 : 1.5 });
    }, wait);
    return () => {
      window.clearTimeout(id);
      p?.stop(0.8);
    };
    // once per run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
}

/** True while `on`, and for `ms` after: a big screen that blinks off for a moment still counts. */
export function useHeld(on: boolean, ms: number) {
  const [held, setHeld] = useState(on);
  useEffect(() => {
    if (on) {
      setHeld(true);
      return;
    }
    const id = window.setTimeout(() => setHeld(false), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  return on || held;
}
