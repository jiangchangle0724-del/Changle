/**
 * 打碟 · DJ Booth: what Lyria RealTime is asked to play for a mix (A2). The room's mix is a blend
 * of styles with a tempo, a key and the stretch's energy; Lyria takes weighted prompts and a config.
 * Until the style presets exist (task card C1) the only style here is the stand-in's, house, in
 * words from Google's prompt guide; the DJ's brain (A4) takes over choosing the blend.
 */
import { playing } from "../../../shared/dj/curve";
import type { DjPhase, Mix, StyleId, WeightedPrompt } from "../../../shared/dj/types";

/** A style's prompts until C1's presets: house only, as the stand-in plays. */
export const FALLBACK_PROMPTS: Partial<Record<StyleId, WeightedPrompt[]>> = {
  house: [
    { text: "Deep House", weight: 1 },
    { text: "TR-909 Drum Machine", weight: 0.6 },
    { text: "Rhodes Piano", weight: 0.4 },
    { text: "Synth Pads", weight: 0.3 },
  ],
};

/** The feel of each stretch, one mood word from the guide each. */
const MOOD: Partial<Record<DjPhase, WeightedPrompt>> = {
  warm: { text: "Chill", weight: 0.5 },
  build: { text: "Upbeat", weight: 0.6 },
  peak: { text: "Euphoric", weight: 0.8 },
  cool: { text: "Dreamy", weight: 0.6 },
};

export type LyriaAsk = {
  prompts: WeightedPrompt[];
  config: { bpm: number; density: number; brightness: number; scale: Mix["scale"]; guidance: number };
};

/**
 * The prompts and config for a stretch of the night: each style in the mix brings its prompts
 * scaled by its weight, the stretch adds its mood, and density and brightness follow the curve.
 */
export function lyriaFor(phase: DjPhase, mix: Mix, presets: Partial<Record<StyleId, WeightedPrompt[]>> = FALLBACK_PROMPTS): LyriaAsk {
  const prompts: WeightedPrompt[] = [];
  for (const [id, w] of Object.entries(mix.weights) as [StyleId, number][]) {
    if (!w) continue;
    for (const p of presets[id] ?? presets.house ?? []) {
      const weight = Math.round(p.weight * w * 1000) / 1000;
      if (weight) prompts.push({ text: p.text, weight });
    }
  }
  if (!prompts.length) prompts.push(...(presets.house ?? FALLBACK_PROMPTS.house!));
  const mood = MOOD[phase];
  if (mood && playing(phase)) prompts.push(mood);
  return {
    prompts: prompts.slice(0, 8),
    // guidance a little under Lyria's default 4: the stretch changes glide rather than jump
    config: { bpm: mix.bpm, density: mix.density, brightness: mix.brightness, scale: mix.scale, guidance: 3.5 },
  };
}
