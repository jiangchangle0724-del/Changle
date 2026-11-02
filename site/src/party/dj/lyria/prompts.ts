/**
 * 打碟 · DJ Booth: what Lyria RealTime is asked to play for a mix (A2). The room's mix is a blend
 * of styles with a tempo, a key and the stretch's energy; Lyria takes weighted prompts and a config.
 * Each style's prompts are its preset's (C1, words from Google's prompt guide); the beginner deck's
 * two decks and fader make the blend (the DJ's brain, A4, will too).
 */
import { playing } from "../../../shared/dj/curve";
import { PRESETS } from "../../../shared/dj/presets";
import { STYLE_IDS, type DjPhase, type Mix, type StyleId, type WeightedPrompt } from "../../../shared/dj/types";

/** Every style's prompts, from its preset. */
export const STYLE_PROMPTS: Partial<Record<StyleId, WeightedPrompt[]>> = Object.fromEntries(STYLE_IDS.map((id) => [id, PRESETS[id].prompts]));
/** House's alone (what the stand-in played before the other styles). */
export const FALLBACK_PROMPTS: Partial<Record<StyleId, WeightedPrompt[]>> = { house: PRESETS.house.prompts };

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
export function lyriaFor(phase: DjPhase, mix: Mix, presets: Partial<Record<StyleId, WeightedPrompt[]>> = STYLE_PROMPTS): LyriaAsk {
  // the same word from two places (two styles, a style and the mood) is one prompt, its weights added
  const sum = new Map<string, number>();
  const add = (text: string, weight: number) => sum.set(text, (sum.get(text) ?? 0) + weight);
  for (const [id, w] of Object.entries(mix.weights) as [StyleId, number][]) {
    if (!w) continue;
    for (const p of presets[id] ?? presets.house ?? []) add(p.text, p.weight * w);
  }
  if (!sum.size) for (const p of presets.house ?? FALLBACK_PROMPTS.house!) add(p.text, p.weight);
  const mood = MOOD[phase];
  if (mood && playing(phase)) add(mood.text, mood.weight);
  // Lyria takes 8: the lightest go
  const prompts = [...sum]
    .map(([text, w]) => ({ text, weight: Math.round(w * 1000) / 1000 }))
    .filter((p) => p.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
  return {
    prompts,
    // guidance a little under Lyria's default 4: the stretch changes glide rather than jump
    config: { bpm: mix.bpm, density: mix.density, brightness: mix.brightness, scale: mix.scale, guidance: 3.5 },
  };
}
