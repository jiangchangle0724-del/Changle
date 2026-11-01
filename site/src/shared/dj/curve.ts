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

/** The mix for a phase: the same blend and tempo, the phase's energy. */
export function mixFor(phase: DjPhase, base: Mix): Mix {
  const e = ENERGY[phase];
  return { ...base, weights: { ...base.weights }, density: e.density, brightness: e.brightness };
}

/** Whether music plays in this phase. */
export const playing = (phase: DjPhase) => phase !== "wait" && phase !== "end";
