/**
 * 打碟 · DJ Booth: the shapes every part of the booth agrees on: the rules on the rooms server,
 * the speaker (the big screen that plays the music), the phones, and later the Lyria relay and
 * the song pipeline. CONTRACTS.md beside this file says how they fit together.
 */
import type { T } from "../../i18n";

/* ------------------------------------------------------------------ the night */

/**
 * The night's energy curve, in order. `wait`: the booth is open, no music yet (the speaker
 * starts it). `warm` → `build` → `peak` → `cool`: the set. `end`: the set is over.
 */
export type DjPhase = "wait" | "warm" | "build" | "peak" | "cool" | "end";
export const DJ_PHASES: DjPhase[] = ["wait", "warm", "build", "peak", "cool", "end"];
/** The stretches of the set the host can drag the night to. */
export const SET_PHASES = ["warm", "build", "peak", "cool"] as const satisfies readonly DjPhase[];
export type SetPhase = (typeof SET_PHASES)[number];

/** How long each stretch runs before the night moves on by itself (the peak waits for the host). */
export const DJ_TIMES = {
  warm: 15 * 60_000,
  build: 15 * 60_000,
  /** the wind-down: it starts this long before the cap, or when the host picks it, then the set ends */
  cool: 15 * 60_000,
  /** every set ends itself 4 hours after the music starts (the cost cap) */
  cap: 4 * 60 * 60_000,
} as const;

/* ------------------------------------------------------------------ styles and the mix */

/** The 12 styles. Their presets (C1) say how each one sounds. */
export type StyleId = "latin" | "house" | "techno" | "trance" | "bass" | "dnb" | "hiphop" | "rnb" | "afro" | "kpop" | "cpop" | "bhangra";
export const STYLE_IDS: StyleId[] = ["latin", "house", "techno", "trance", "bass", "dnb", "hiphop", "rnb", "afro", "kpop", "cpop", "bhangra"];

/** Lyria RealTime's keys: each one names a major key and its relative minor. */
export type Scale =
  | "C_MAJOR_A_MINOR"
  | "D_FLAT_MAJOR_B_FLAT_MINOR"
  | "D_MAJOR_B_MINOR"
  | "E_FLAT_MAJOR_C_MINOR"
  | "E_MAJOR_D_FLAT_MINOR"
  | "F_MAJOR_D_MINOR"
  | "G_FLAT_MAJOR_E_FLAT_MINOR"
  | "G_MAJOR_E_MINOR"
  | "A_FLAT_MAJOR_F_MINOR"
  | "A_MAJOR_G_FLAT_MINOR"
  | "B_FLAT_MAJOR_G_MINOR"
  | "B_MAJOR_A_FLAT_MINOR"
  | "SCALE_UNSPECIFIED";

/** One prompt with its weight, the way Lyria RealTime takes them (a weight is never 0). */
export type WeightedPrompt = { text: string; weight: number };

/**
 * A style's preset, written once and shared by every table (C1 writes all 12). Prompt words come
 * only from Lyria's prompt guide; the BPM range is where this style lives (Lyria takes 60 to 200).
 */
export type Preset = {
  id: StyleId;
  name: T;
  prompts: WeightedPrompt[];
  bpm: [number, number];
  /** the home key; the key lock only ever moves to a neighbour of it */
  scale: Scale;
  /** density and brightness (0 to 1) at the middle of the energy curve */
  density: number;
  brightness: number;
};

/**
 * What the speaker is playing, as the DJ set it: a blend of styles by weight (latin 1 with house
 * 0.6), a tempo, a key and the energy knobs. With Lyria this becomes its prompts and config.
 */
export type Mix = {
  weights: Partial<Record<StyleId, number>>;
  bpm: number;
  scale: Scale;
  /** 0 to 1 */
  density: number;
  /** 0 to 1 */
  brightness: number;
  muteDrums?: boolean;
  muteBass?: boolean;
};

/** Where the music comes from: the recorded stand-in (now), or Lyria RealTime (A2). */
export type Source = "fake" | "lyria";

/* ------------------------------------------------------------------ songs players ask for */

/**
 * A song a player asked for (A5): they describe it, it is checked, Lyria 3.5 makes it at the
 * base's tempo and key, the DJ mixes it in on a phrase and fades back to the base after.
 */
export type Track = {
  id: string;
  /** who asked for it */
  by: string;
  /** what they wrote: a style, a mood, a line of lyrics */
  ask: string;
  style: StyleId | null;
  status: "queued" | "checking" | "making" | "ready" | "playing" | "played" | "refused" | "failed";
  /** why it was turned down (the text check, or Lyria's own filter), shown to whoever asked */
  why?: T;
  bpm?: number;
  scale?: Scale;
  seconds?: number;
  /** where the speaker fetches it once it is made */
  url?: string;
  /** server time it was asked for */
  at: number;
};

/* ------------------------------------------------------------------ what the table can say */

/**
 * Everything a phone or the speaker can tell the booth: the game action `{ x, ...data }`.
 * Version 1 so far: `fire`, `phase`, `again`, and from the speaker `live` and `stats`. The rest is
 * the agreed shape for the steps that come next; the rooms server ignores them until then.
 */
export type DjCommand =
  // anyone at the table
  | { x: "fire" }
  | { x: "cold" }
  /** more or less of a style, -1 to 1 (A4) */
  | { x: "knob"; style: StyleId; value: number }
  /** describe a song (A5) */
  | { x: "ask"; text: string }
  /** ask for a drop (A4) */
  | { x: "drop" }
  // the host
  | { x: "phase"; phase: SetPhase | "end" }
  /** a new set after the end */
  | { x: "again" }
  // the speaker (a big screen; it has no seat)
  /** the music started on the speaker: the set begins */
  | { x: "live"; source: Source }
  /** how the playing has gone since the last report */
  | { x: "stats"; stalls: number; resets: number; seconds: number };

/** Most 🔥 a phone sends: one per this many ms. */
export const FIRE_GAP_MS = 400;
/** The room takes one per this many ms a phone: a little under, as the network bunches taps up. */
export const FIRE_TAKE_MS = 300;

/* ------------------------------------------------------------------ the booth's state */

/**
 * The booth's part of the table, kept by the rooms server (seats, host and the rest belong to the
 * table itself). Pure data: it is saved whole after every change.
 */
export type RoomState = {
  phase: DjPhase;
  /** server time the music started (the set began); 0 before */
  liveAt: number;
  /** when this phase began, and when it moves on by itself (0: only the host moves it) */
  phaseAt: number;
  nextAt: number;
  /** the set ends itself here: DJ_TIMES.cap after the music started (0 before) */
  capAt: number;
  /** what the speaker plays */
  mix: Mix;
  source: Source;
  /** 🔥 presses, oldest first (the latest 40) */
  fires: { pid: string; at: number }[];
  /** 🔥 per player, all night */
  total: Record<string, number>;
  /** songs asked for (A5); empty until then */
  queue: Track[];
  /** the speaker's reports added up, for the night's recap (C8) */
  speaker: { at: number; stalls: number; resets: number; seconds: number };
  /** how many sets this table has started (a new one after "again") */
  set: number;
};
