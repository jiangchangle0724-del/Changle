import { useEffect, useRef, type RefObject } from "react";
import { burst, bus, crash, ctxTimeAt, snare, tom, tone, type Bus } from "../../lib/audio/engine";
import { GROOVES, playStep, v, type Style } from "../../lib/music";
import { sfx } from "../../lib/sfx";
import type { Grid } from "./coach";

/**
 * 林波舞's band: the calypso from lib/music, a notch harder every bar. Each bar is quicker (6% a
 * bar, up to 30% from bar 6), adds a layer (off-beat hats, then a backbeat, then a driving kick,
 * then open hats and tom fills, then everything), and from bar 4 goes up a key a bar. The grid is
 * shared: every phone and the TV work the same bar out from the same start time, so they play in
 * time, and the coach's cues land on it. It also makes the band's own noises: the riser under the
 * count-in, the ratchet as the bar comes down, the crowd when a deep bar is cleared.
 */

/** How much quicker than the first bar: 6% a bar, up to 30% quicker from bar 6 on. */
export const limboRate = (level: number) => 1 + 0.06 * Math.min(Math.max(0, level), 5);
/** How many semitones up: a key higher at bars 4, 5, 6, 7 and 8, then it stays. */
export const limboLift = (level: number) => Math.min(5, Math.max(0, level - 2));

const up = (n: number) => (x: number | null) => (x == null ? null : x + n);

/** The calypso as this bar (level 0 is bar 1) plays it. */
export function limboStyle(level: number): Style {
  const l = Math.max(0, Math.floor(level));
  const base = GROOVES.calypso;
  const n = limboLift(l);
  const s: Style = {
    ...base,
    bpm: Math.round(base.bpm * limboRate(l)),
    bass: base.bass?.map((bar) => bar.map(up(n))),
    chords: base.chords && { ...base.chords, prog: base.chords.prog.map((ch) => ch.map((x) => x + n)) },
    lead: base.lead && { ...base.lead, bars: base.lead.bars.map((bar) => bar.map(up(n))) },
  };
  if (l >= 1) s.hat = v("..o...o...o...o.");
  if (l >= 2) {
    s.snare = v("....x.......x...");
    s.clap = v("....o.......o...");
  }
  if (l >= 3) s.kick = v("x...x.x.x...x.x.");
  if (l >= 4) {
    s.ohat = v("......x.......x.");
    s.tom = v("...o..o....o..o.");
  }
  if (l >= 5) {
    s.shaker = v("xxxxxxxxxxxxxxxx");
    s.bassLen = 1;
    if (s.lead) s.lead = { ...s.lead, peak: 0.18 };
  }
  return s;
}

/** From bar 4: a snare fill through the last beat of the four-bar loop, and a cymbal on the one. */
function fills(b: Bus, level: number, step: number, t: number, dest: AudioNode) {
  if (level < 3) return;
  const i = step % 16;
  const bar = Math.floor(step / 16) % 4;
  const o = { at: t, abs: true, dest };
  if (bar === 3 && i >= 12) snare(b, { ...o, peak: 0.12 + 0.05 * (i - 12) });
  if (bar === 0 && i === 0) crash(b, { ...o, peak: 0.09, decay: 1.1 });
  if (level >= 5 && bar === 3 && i >= 12) tom(b, { ...o, peak: 0.2, pitch: 1.5 - 0.12 * (i - 12) });
}

export type LimboMusic = { stop: (fade?: number) => void; grid: Grid; level: number };

/**
 * Play this bar's calypso. `startPerf` (performance.now() ms, maybe long ago) is the grid's origin:
 * every phone given the same moment and level plays the same thing at the same time, and one that
 * starts late joins on the next step.
 */
export function startLimboMusic(level: number, opts: { startPerf?: number; volume?: number } = {}): LimboMusic | null {
  const b = bus();
  if (!b) return null;
  const s = limboStyle(level);
  const stepS = 60 / s.bpm / 4;
  const out = b.c.createGain();
  out.gain.value = s.gain * (opts.volume ?? 1);
  out.connect(b.music);
  const startPerf = opts.startPerf ?? performance.now() + 80;
  const originCtx = ctxTimeAt(b, startPerf);
  let step = 0;
  const now = b.c.currentTime;
  if (originCtx < now + 0.02) step = Math.ceil((now + 0.03 - originCtx) / stepS);
  let nextTime = originCtx + step * stepS;
  let dead = false;
  const timer = window.setInterval(() => {
    if (dead) return;
    const horizon = b.c.currentTime + 0.14;
    while (nextTime < horizon) {
      const swing = step % 2 === 1 ? (s.swing ?? 0) * stepS : 0;
      playStep(b, s, step, nextTime + swing, stepS, out);
      fills(b, level, step, nextTime, out);
      step++;
      nextTime = originCtx + step * stepS;
    }
  }, 25);
  const finish = () => {
    dead = true;
    window.clearInterval(timer);
    window.setTimeout(() => out.disconnect(), 2500);
  };
  return {
    level,
    grid: { originPerf: startPerf, beatMs: (60 / s.bpm) * 1000 },
    stop(fade = 0.02) {
      if (dead) return;
      const t = b.c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, fade);
      finish();
    },
  };
}

/**
 * The band while `playing`, at this bar's level (it changes gear when the level does), on the grid
 * from `anchor()` (performance time; online, the table's shared moment). Returns the grid, for the
 * coach.
 */
export function useLimboMusic(playing: boolean, level: number, anchor: () => number): RefObject<Grid | null> {
  const grid = useRef<Grid | null>(null);
  useEffect(() => {
    if (!playing) return;
    const h = startLimboMusic(level, { startPerf: anchor() });
    grid.current = h?.grid ?? null;
    return () => h?.stop(0.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, level]);
  return grid;
}

/* ---------------- the band's own noises ---------------- */

/** Under the count-in: a riser that swells for `seconds`, louder at a deeper bar. */
export function riser(seconds: number, level: number) {
  const b = bus();
  if (!b) return;
  const loud = Math.min(1, 0.45 + 0.11 * level);
  burst(b, { dur: seconds, attack: seconds * 0.85, type: "bandpass", f: 400, f2: 3600, q: 1.2, peak: 0.07 * loud, wet: 0.3 });
  tone(b, { f: 110, f2: 440, glide: seconds, type: "sawtooth", peak: 0.035 * loud, attack: seconds * 0.9, decay: 0.12, wet: 0.2 });
}

/** The bar coming down a notch: a ratchet, then the thud as it settles. */
export function barDrops() {
  const b = bus();
  if (!b) return;
  for (let i = 0; i < 5; i++) burst(b, { at: i * 0.09, dur: 0.004, decay: 0.03, type: "bandpass", f: 2600 - i * 260, q: 3, peak: 0.16, wet: 0.15 });
  tom(b, { at: 0.5, peak: 0.6, pitch: 0.9 });
}

/** Through a deep bar: the crowd, bigger the deeper it was (nothing for the first two). */
export function crowdFor(level: number) {
  if (level < 2) return;
  sfx.applause(0.7 + 0.2 * Math.min(level, 6), 0.3 + 0.07 * Math.min(level, 6));
}
