import { useEffect, useRef, type RefObject } from "react";
import { bus, clave, ctxTimeAt, tone, voice, type Bus } from "../../lib/audio/engine";
import { FOLLOW_DEG } from "../../shared/engine/games/limbo";
import type { LimboKind } from "../../shared/protocol";

/**
 * The coach: what the phone says to someone who can't see it. It's on their chest, screen out, so
 * everything the gauge shows is also heard, in time with the music:
 * - two notes falling: lean back more (the bar is lower than you are)
 * - two notes rising: come up a bit (a moving bar has gone back up)
 * - the same, quiet and on the beat: you're still with a moving bar but drifting to its edge
 *   (the warning comes before the grace clock, so there is time to move)
 * - a tick on the beat: you're there; with a moving bar, you're with it
 * - three quick clicks: tilt further to the side (tilt through)
 * - a hum that climbs while a hold counts down; a low buzz when a wobble starts it again (hold steady)
 * The music also dips while you're off the bar and comes back when you're on it.
 * Blind lean says nothing: not seeing is the game.
 */

export type Say = "down" | "up" | "side" | "on" | null;

/**
 * What to say right now: which cue, how urgently (0 to 1: twice as often at 1), how far through a
 * hold, when the last wobble was, and `soft` for the early warning (quiet, on the beat, no dip).
 */
export type Coaching = { say: Say; urgency: number; hold: number; wobbleAt: number; soft?: boolean };

export const QUIET: Coaching = { say: null, urgency: 0, hold: 0, wobbleAt: 0 };

/** Moving bar: this far from it (still within FOLLOW_DEG) the coach starts warning, quietly. */
export const EDGE_DEG = FOLLOW_DEG - 4;

/** What the phone measures at a bar. */
export type Measure = {
  /** the live lean, and the lean the bar asks for (a moving bar: where it is right now) */
  lean: number;
  target: number;
  /** how far through a hold (0 to 1) */
  hold?: number;
  /** tilt through: the sideways tilt now and the one asked for (right is positive) */
  side?: number;
  want?: number;
  /** moving bar: how close to losing it (0 to 1) */
  lost?: number;
  /** hold steady: when the last wobble was (performance time, 0 for none) */
  wobbleAt?: number;
};

/** What to say to someone at this kind of bar, from what the phone measures. */
export function coaching(kind: LimboKind, m: Measure): Coaching {
  const far = (deg: number, span: number) => Math.min(1, Math.max(0, deg) / span);
  if (kind === "moving") {
    const d = m.lean - m.target;
    if (Math.abs(d) <= EDGE_DEG) return { say: "on", urgency: 0, hold: 0, wobbleAt: 0 };
    // drifting to the edge of the band: the warning, before the grace clock starts
    if (Math.abs(d) <= FOLLOW_DEG) return { say: d < 0 ? "down" : "up", urgency: 0, hold: 0, wobbleAt: 0, soft: true };
    // off it: the grace clock running out is the alarm; a long way off hurries it up too
    return { say: d < 0 ? "down" : "up", urgency: Math.max(m.lost ?? 0, far(Math.abs(d) - FOLLOW_DEG, 30)), hold: 0, wobbleAt: 0 };
  }
  const wobbleAt = m.wobbleAt ?? 0;
  if (m.lean < m.target) return { say: "down", urgency: far(m.target - m.lean, 40), hold: 0, wobbleAt };
  const side = m.side ?? 0;
  const want = m.want ?? 0;
  if (kind === "tilt" && want !== 0 && !(want > 0 ? side >= want : side <= want)) return { say: "side", urgency: 0, hold: 0, wobbleAt };
  return { say: "on", urgency: 0, hold: m.hold ?? 0, wobbleAt };
}

/** The music's grid, so the cues land on it: when it started (performance time) and its beat. */
export type Grid = { originPerf: number; beatMs: number };
const DEFAULT_BEAT_MS = 536; // the calypso's 112 bpm

const MUSIC_GAIN = 0.8; // the engine's music bus at rest
const DIP = 0.5; // the music while you're off the bar

function blip(b: Bus, at: number, up: boolean, loud: number) {
  const [f1, f2] = up ? [440, 659.3] : [659.3, 440];
  tone(b, { at, abs: true, f: f1, type: "triangle", peak: 0.2 * loud, attack: 0.004, decay: 0.07, wet: 0.15 });
  tone(b, { at: at + 0.09, abs: true, f: f2, type: "triangle", peak: 0.24 * loud, attack: 0.004, decay: 0.11, wet: 0.15 });
}

function tick(b: Bus, at: number) {
  clave(b, { at, abs: true, pitch: 0.8, peak: 0.2 });
}

function clicks(b: Bus, at: number) {
  for (let i = 0; i < 3; i++) clave(b, { at: at + i * 0.06, abs: true, pitch: 1.45, peak: 0.17 });
}

function buzz(b: Bus) {
  tone(b, { f: 98, type: "square", peak: 0.16, attack: 0.005, decay: 0.15, wet: 0.1 });
  tone(b, { f: 147, type: "sawtooth", peak: 0.06, attack: 0.005, decay: 0.12, wet: 0.1 });
}

type Hum = { osc: OscillatorNode; low: OscillatorNode; amp: GainNode };
function makeHum(b: Bus): Hum {
  const osc = b.c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 330;
  const low = b.c.createOscillator();
  low.type = "triangle";
  low.frequency.value = 165;
  const body = b.c.createGain();
  body.gain.value = 0.4;
  const amp = b.c.createGain();
  amp.gain.value = 0;
  osc.connect(amp);
  low.connect(body).connect(amp);
  amp.connect(voice(b, 0.2));
  osc.start();
  low.start();
  return { osc, low, amp };
}

export type Coach = { stop: () => void };

/**
 * Start coaching: every 30 ms it reads `read()` and says what that asks for, on the music's
 * sixteenth grid. Returns the way to stop it (the hum fades, the music comes back up).
 */
export function startCoach(read: () => Coaching, grid?: Grid): Coach {
  const b = bus();
  if (!b) return { stop() {} };
  const beat = (grid?.beatMs ?? DEFAULT_BEAT_MS) / 1000;
  const sixteenth = beat / 4;
  const origin = grid ? ctxTimeAt(b, grid.originPerf) : b.c.currentTime;
  // the first cue on the next sixteenth of the grid; k counts sixteenths from the origin
  let k = Math.ceil((b.c.currentTime + 0.05 - origin) / sixteenth);
  let hum: Hum | null = null;
  let lastWobble = 0;
  let dipped = false;
  let said: Say = null;
  const timer = window.setInterval(() => {
    const s = read();
    const t = b.c.currentTime;
    // a new direction is said at once, not at the next slot of the grid (unless that is about now)
    if (s.say !== said) {
      said = s.say;
      if ((s.say === "down" || s.say === "up") && origin + k * sixteenth - t > 0.12) blip(b, t, s.say === "up", s.soft ? 0.5 : 1);
    }
    // a hold's hum: up an octave from start to finish
    if (s.hold > 0) {
      hum ??= makeHum(b);
      hum.amp.gain.setTargetAtTime(0.09, t, 0.05);
      const f = 330 * Math.pow(2, Math.min(1, s.hold));
      hum.osc.frequency.setTargetAtTime(f, t, 0.06);
      hum.low.frequency.setTargetAtTime(f / 2, t, 0.06);
    } else hum?.amp.gain.setTargetAtTime(0, t, 0.05);
    if (s.wobbleAt && s.wobbleAt !== lastWobble) {
      lastWobble = s.wobbleAt;
      buzz(b);
    }
    // the music dips while you're off the bar (not for the warning)
    const away = s.say === "down" || s.say === "up";
    const off = away && !s.soft;
    if (off !== dipped) {
      dipped = off;
      b.music.gain.setTargetAtTime(MUSIC_GAIN * (off ? DIP : 1), t, 0.1);
    }
    const horizon = t + 0.1;
    let at = origin + k * sixteenth;
    while (at < horizon) {
      if (at >= t - 0.02) {
        const onBeat = k % 4 === 0;
        const onEighth = k % 2 === 0;
        if (off) {
          // every eighth; every sixteenth when it's urgent
          if (onEighth || s.urgency > 0.5) blip(b, at, s.say === "up", 0.85 + 0.3 * s.urgency);
        } else if (away) {
          // the warning: quiet, on the beat
          if (onBeat) blip(b, at, s.say === "up", 0.5);
        } else if (s.say === "on" && onBeat) tick(b, at);
        else if (s.say === "side" && onBeat) clicks(b, at);
      }
      k++;
      at = origin + k * sixteenth;
    }
  }, 30);
  return {
    stop() {
      window.clearInterval(timer);
      const t = b.c.currentTime;
      if (dipped) b.music.gain.setTargetAtTime(MUSIC_GAIN, t, 0.1);
      if (hum) {
        const h = hum;
        hum = null;
        h.amp.gain.setTargetAtTime(0, t, 0.04);
        h.osc.stop(t + 0.4);
        h.low.stop(t + 0.4);
        window.setTimeout(() => h.amp.disconnect(), 600);
      }
    },
  };
}

/** Coach while `on`, saying whatever `now` asks for; `grid` (read when it starts) puts the cues on the music. */
export function useCoach(on: boolean, now: Coaching, grid?: RefObject<Grid | null>) {
  const latest = useRef(now);
  latest.current = now;
  useEffect(() => {
    if (!on) return;
    const c = startCoach(() => latest.current, grid?.current ?? undefined);
    return () => c.stop();
  }, [on, grid]);
}
