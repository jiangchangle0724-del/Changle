/**
 * 打碟 · DJ Booth: the 12 style presets (task card C1), how each style sounds on Lyria RealTime.
 * Every prompt is a word from Google's prompt guide, written as there (saved in
 * tests/fixtures/dj/lyria-prompt-words.json): the style's genre first at 1, then instruments and a
 * mood. The DJ (A4) mixes them by weight; nothing here plays.
 *
 * Home keys go round the circle of fifths, one style a key, in the order the styles blend (house,
 * techno, trance, bass, dnb, hiphop, rnb, latin, bhangra, afro, cpop, kpop, back to house): a step
 * of the key lock from a style's home key lands on a neighbour's. House keeps the stand-in's A minor.
 */
import type { Preset, StyleId } from "./types";

export const PRESETS: Record<StyleId, Preset> = {
  latin: {
    id: "latin",
    name: { zh: "拉丁", en: "Latin" },
    prompts: [
      { text: "Reggaeton", weight: 1 },
      { text: "808 Hip Hop Beat", weight: 0.4 },
      { text: "Conga Drums", weight: 0.6 },
    ],
    bpm: [95, 105],
    scale: "D_FLAT_MAJOR_B_FLAT_MINOR",
    // the dembow never lets up, so fairly full; sunny, not sharp
    density: 0.6,
    brightness: 0.6,
  },
  house: {
    id: "house",
    name: { zh: "浩室", en: "House" },
    prompts: [
      { text: "Deep House", weight: 1 },
      { text: "TR-909 Drum Machine", weight: 0.6 },
      { text: "Rhodes Piano", weight: 0.4 },
      { text: "Synth Pads", weight: 0.3 },
    ],
    bpm: [120, 126],
    scale: "C_MAJOR_A_MINOR",
    // a steady four on the floor with room around it; warm rather than bright
    density: 0.5,
    brightness: 0.45,
  },
  techno: {
    id: "techno",
    name: { zh: "科技", en: "Techno" },
    prompts: [
      { text: "Techno", weight: 1 },
      { text: "TR-909 Drum Machine", weight: 0.7 },
      { text: "Dirty Synths", weight: 0.5 },
      { text: "Dark", weight: 0.5 },
    ],
    bpm: [128, 135],
    scale: "G_MAJOR_E_MINOR",
    // dark and dense: the kick drives, little sits up top
    density: 0.8,
    brightness: 0.25,
  },
  trance: {
    id: "trance",
    name: { zh: "迷幻", en: "Trance" },
    prompts: [
      { text: "Trance", weight: 1 },
      { text: "Euphoric", weight: 0.5 },
      { text: "Moog Oscillations", weight: 0.6 },
      { text: "Synth Pads", weight: 0.5 },
    ],
    bpm: [136, 140],
    scale: "D_MAJOR_B_MINOR",
    // bright: arpeggios and pads up high, airy around the rolling bass
    density: 0.6,
    brightness: 0.85,
  },
  bass: {
    id: "bass",
    name: { zh: "低音", en: "Bass" },
    prompts: [
      { text: "Dubstep", weight: 1 },
      { text: "Boomy Bass", weight: 0.7 },
      { text: "Dirty Synths", weight: 0.6 },
    ],
    bpm: [140, 150],
    scale: "A_MAJOR_G_FLAT_MINOR",
    // half time leaves gaps and the bass fills them; heavy and low
    density: 0.65,
    brightness: 0.4,
  },
  dnb: {
    id: "dnb",
    name: { zh: "鼓打贝斯", en: "Drum & Bass" },
    prompts: [
      { text: "Drum & Bass", weight: 1 },
      { text: "Funk Drums", weight: 0.7 },
      { text: "Boomy Bass", weight: 0.6 },
    ],
    bpm: [170, 176],
    scale: "E_MAJOR_D_FLAT_MINOR",
    // the busiest: fast breaks over a deep sub, crisp on top
    density: 0.85,
    brightness: 0.5,
  },
  hiphop: {
    id: "hiphop",
    name: { zh: "说唱", en: "Hip-hop" },
    prompts: [
      { text: "Trap Beat", weight: 1 },
      { text: "808 Hip Hop Beat", weight: 0.7 },
      { text: "Boomy Bass", weight: 0.5 },
    ],
    bpm: [70, 80],
    scale: "B_MAJOR_A_FLAT_MINOR",
    // space between the 808s, only the hats are busy; dark and low
    density: 0.45,
    brightness: 0.35,
  },
  rnb: {
    id: "rnb",
    name: { zh: "R&B", en: "R&B" },
    prompts: [
      { text: "Contemporary R&B", weight: 1 },
      { text: "Smooth Pianos", weight: 0.6 },
      { text: "Groovy", weight: 0.4 },
    ],
    bpm: [85, 95],
    scale: "G_FLAT_MAJOR_E_FLAT_MINOR",
    // sparse: a slow groove with room for the chords; soft, not dull
    density: 0.3,
    brightness: 0.45,
  },
  afro: {
    id: "afro",
    name: { zh: "非洲节拍", en: "Afrobeats" },
    prompts: [
      { text: "Afrobeat", weight: 1 },
      { text: "Boomy Bass", weight: 0.6 },
      { text: "Djembe", weight: 0.5 },
    ],
    bpm: [105, 115],
    scale: "E_FLAT_MAJOR_C_MINOR",
    // the percussion keeps it moving without crowding it; warm and sunny
    density: 0.55,
    brightness: 0.6,
  },
  kpop: {
    id: "kpop",
    name: { zh: "韩流", en: "K-pop club" },
    prompts: [
      { text: "Synthpop", weight: 1 },
      { text: "Bright", weight: 0.6 },
      { text: "TR-909 Drum Machine", weight: 0.6 },
    ],
    bpm: [120, 128],
    scale: "F_MAJOR_D_MINOR",
    // punchy and full, the synths bright on top
    density: 0.7,
    brightness: 0.8,
  },
  cpop: {
    id: "cpop",
    name: { zh: "华语夜店", en: "C-pop club" },
    prompts: [
      { text: "EDM", weight: 1 },
      { text: "Emotional", weight: 0.5 },
      { text: "Smooth Pianos", weight: 0.6 },
    ],
    bpm: [120, 128],
    scale: "B_FLAT_MAJOR_G_MINOR",
    // room for the piano hook; clear and bright, softer than K-pop
    density: 0.55,
    brightness: 0.65,
  },
  bhangra: {
    id: "bhangra",
    name: { zh: "旁遮普", en: "Bhangra" },
    prompts: [
      { text: "Bhangra", weight: 1 },
      { text: "Tabla", weight: 0.7 },
      { text: "Upbeat", weight: 0.5 },
    ],
    bpm: [100, 110],
    scale: "A_FLAT_MAJOR_F_MINOR",
    // the dhol never stops: full, loud and bright
    density: 0.7,
    brightness: 0.7,
  },
};

/** The preset for a style. */
export function presetFor(id: StyleId): Preset {
  return PRESETS[id];
}
