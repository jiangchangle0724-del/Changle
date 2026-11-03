/**
 * 打碟 · DJ Booth: the energy curve as plain functions (no sound, no clock of its own), shared by
 * the rooms server and the speaker.
 */
import type { DjPhase, Mix } from "./types";

/** Density and brightness (0 to 1) for each stretch of the night. */
export const ENERGY: Record<DjPhase, { density: number; brightness: number }> = {
  wait: { density: 0, brightness: 0 },
  warm: { density: 0.35, brightness: 0.4 },
  build: { density: 0.6, brightness: 0.6 },
  peak: { density: 0.9, brightness: 0.8 },
  cool: { density: 0.4, brightness: 0.35 },
  end: { density: 0, brightness: 0 },
};

/**
 * The recorded stand-in's mix: deep house at 125 BPM in A minor. 125 makes a beat exactly 23,040
 * samples at 48 kHz, so its bars line up to the sample however long it plays.
 */
export const FAKE_MIX: Mix = { weights: { house: 1 }, bpm: 125, scale: "C_MAJOR_A_MINOR", density: 0, brightness: 0 };

/** Reading the room (读场): how far the floor's reactions move the stretch's energy at most. */
export const LEAN = 0.15;
/** The reactions it reads: the last minute's. */
export const LEAN_MS = 60_000;

/**
 * 读场, from the plan: more 🔥, more density and brightness; more ❄️, less. The last minute's 🔥
 * against its ❄️, -1 (all cold) to 1 (all hot), damped while there are only a few (six 🔥 and no
 * ❄️ lean it halfway), on a 0.05 grid so the mix moves in steps, not with every press.
 */
export function heatLean(fires: { at: number }[], colds: { at: number }[], now: number): number {
  const f = fires.filter((x) => now - x.at < LEAN_MS).length;
  const c = colds.filter((x) => now - x.at < LEAN_MS).length;
  return Math.round(((f - c) / (f + c + 6)) * 20) / 20 || 0;
}

/** The mix for a phase: the same blend and tempo, the phase's energy, leaned by the room (读场). */
export function mixFor(phase: DjPhase, base: Mix, lean = 0): Mix {
  const e = ENERGY[phase];
  const by = playing(phase) ? LEAN * lean : 0;
  const at = (x: number) => Math.round(Math.max(0.05, Math.min(1, x + by)) * 1000) / 1000;
  return { ...base, weights: { ...base.weights }, density: by ? at(e.density) : e.density, brightness: by ? at(e.brightness) : e.brightness };
}

/** Whether music plays in this phase. */
export const playing = (phase: DjPhase) => phase !== "wait" && phase !== "end";
