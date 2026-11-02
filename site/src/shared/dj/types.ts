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

/** Still to be played: being checked, made or waiting its turn. */
export const WAITING: Track["status"][] = ["queued", "checking", "making", "ready"];
/** Past the text check: what the player wrote can be shown to the whole table. */
export const CHECKED: Track["status"][] = ["making", "ready", "playing", "played", "failed"];
/** A described song is 2 to 120 characters (an emoji or a Chinese character counts as one). */
export const ASK_CHARS = { min: 2, max: 120 } as const;
/** Songs one player can have waiting at once, and the whole table. */
export const ASKS_EACH = 1;
export const QUEUE_MAX = 12;
/** Played, refused and failed songs kept for the night's recap. */
export const KEEP_DONE = 20;

/* ------------------------------------------------------------------ the dancers */

/**
 * The list beside the dancers' 3D files, `/dancers/manifest.json` (site/public/dancers/): the asset
 * pipeline writes it (C2), the dance floor reads it (C3). Every move fits every character: they
 * share Mixamo's skeleton.
 */
export type DancerManifest = {
  /** when the files were made, YYYY-MM-DD */
  made: string;
  characters: {
    id: string;
    /** its URL, e.g. "/dancers/c1.glb" */
    file: string;
    bytes: number;
    /** standing height in metres */
    height: number;
  }[];
  moves: DancerMove[];
};

/** One dance move: a loop any character can play. */
export type DancerMove = {
  id: string;
  file: string;
  bytes: number;
  /** one loop */
  seconds: number;
  /** the move's own tempo: it plays at (the music's BPM ÷ this) to land on the beat */
  bpm: number;
  /** beats in one loop */
  beats: number;
  /** measured from the motion, or set by hand */
  bpmFrom: "measured" | "hand";
  /** someone has watched it against a click at that tempo and it lands */
  bpmChecked: boolean;
  /** the styles it suits */
  styles: StyleId[];
  /** "drop": the big moves the whole floor switches to on a drop */
  energy: "low" | "mid" | "drop";
};

/* ------------------------------------------------------------------ the beginner deck */

/**
 * The beginner deck: everyone at the table DJs at once from their phone, and nothing they press
 * can trainwreck. Two decks play in step, at one tempo and in one key (the stand-in plays every
 * style at 125 BPM in A minor); the crossfader blends them; the effect pads, the build-up and the
 * drop all land on the beat. CONTRACTS.md, "The beginner deck".
 */
export type PadId = "echo" | "sweep" | "horn" | "brake" | "siren" | "laser" | "scratch" | "rewind";
/** in this order on the phones (two rows of four); the room's `pad` event names a pad by its place here */
export const PAD_IDS: PadId[] = ["echo", "sweep", "horn", "brake", "siren", "laser", "scratch", "rewind"];
/** the pads that move the music itself (the brake, a scratch, a rewind): one at a time, never into a drop */
export const MOVES: PadId[] = ["brake", "scratch", "rewind"];

export type DeckSide = "a" | "b";

/** How a DROP press landed: on the cue beat (perfect), or anywhere else in the countdown (good). */
export type DropGrade = "perfect" | "good";

/** A drop on its way: the build-up is full and the countdown runs to a bar. */
export type DropState = {
  /** the bar it lands on (the speaker's count, see `grid`; -1: the speaker hasn't said) and when, server time */
  bar: number;
  at: number;
  /** the cue, one beat before: press DROP on it (server time) */
  cue: number;
  /** countdowns that came and went with nobody pressing */
  misses: number;
  /** after DECK.maxMisses the DJ drops it by itself */
  auto: boolean;
  /** who pressed in time, first first */
  hits: { pid: string; grade: DropGrade }[];
  /** the deck it lands on: the one off the air when the floor has loaded a new style there (a swap) */
  to: DeckSide;
};

/** A drop that landed: what the screens celebrate, and the night's record. */
export type LandedDrop = { at: number; bar: number; hits: { pid: string; grade: DropGrade }[]; auto: boolean; to: DeckSide; style: StyleId };

/** The beginner deck's part of the booth. */
export type DeckState = {
  /** the two decks' styles; B stays empty until the floor picks a style */
  a: StyleId;
  b: StyleId | null;
  /** the crossfader: 0 is all deck A, 1 all deck B */
  fader: number;
  /** who has the fader: whoever moved it last, until DECK.faderHoldMs after their last move */
  faderBy: string | null;
  faderAt: number;
  /** each phone's pick for the next style; it goes on the deck that's off the air */
  votes: Record<string, StyleId>;
  /** the build-up, 0 to 1, as it stood at `chargeAt` (it falls back by itself when nobody pushes) */
  charge: number;
  chargeAt: number;
  /** taps the room hasn't added yet (it adds them a few times a second) */
  pending: number;
  drop: DropState | null;
  /** the latest drop that landed */
  last: LandedDrop | null;
  /** where the speaker's bars fall: bar `bar` starts at server time `at`, at `bpm` (sent by the speaker) */
  grid: { at: number; bar: number; bpm: number } | null;
  /** effect pads pressed lately, oldest first (the latest 12) */
  pads: { pid: string; pad: PadId; at: number }[];
  /** perfect drops per player, all night */
  perfects: Record<string, number>;
  /**
   * The styles the speaker's decks are sounding now, as it says (a deck takes a new style at its
   * next section, once recorded): a drop swaps to the floor's pick only once it really plays there.
   */
  sounding: { a: StyleId; b: StyleId | null } | null;
  /** the room's own bookkeeping (not sent to the phones): when each phone last had a pad and a
   *  pick taken, the last brake, which screen gives the bars, when it last moved them and when it
   *  last said anything at all (it says the bars every 10 s while it plays), and when the decks
   *  and the source were last taken from it */
  padAt: Record<string, number>;
  voteAt: Record<string, number>;
  brakeAt: number;
  gridFrom: string | null;
  gridSetAt: number;
  speakerAt: number;
  decksAt: number;
  srcAt: number;
};

/** The beginner deck's numbers. */
export const DECK = {
  /** the fader stays with whoever moved it for this long after their last move */
  faderHoldMs: 1200,
  /** a phone sends the fader at most this often while a finger drags it */
  faderSendMs: 120,
  /** the build-up: each tap adds this much, the room at most `maxRise` a second; this long after
   *  the last tap it falls back `fall` a second */
  tapStep: 0.03,
  maxRise: 0.25,
  idleMs: 1500,
  fall: 0.12,
  /** the room adds waiting taps at most this often (and only then tells the table) */
  foldMs: 200,
  /** a phone sends its taps at most this often, this many at most */
  chargeSendMs: 250,
  maxTaps: 8,
  /** an effect pad: a phone sends one per `padGapMs` and the room takes one per `padTakeMs` (a
   *  little under, as the network bunches presses up); the same pad once for the whole room per
   *  `roomPadGapMs`; a move (MOVES: brake, scratch, rewind) once per `brakeGapMs` for the room, and
   *  never while a drop is on its way */
  padGapMs: 600,
  padTakeMs: 500,
  roomPadGapMs: 150,
  brakeGapMs: 4000,
  /** a phone's picks: one per this long (and none while a drop is on its way: it lands on the deck
   *  the floor had cued) */
  voteGapMs: 300,
  /** the speaker's bars, decks and source: each taken at most this often, from the screen that
   *  gives the bars (another screen can take over once it has said nothing for `speakerQuietMs`) */
  gridGapMs: 1000,
  speakerQuietMs: 30_000,
  /** the countdown: `countFrom` down to 1, `countBeats` beats each (about a second), then DROP for
   *  the cue's beat, the beat before the bar: 17 beats, about 8 seconds at 125 BPM */
  countFrom: 8,
  countBeats: 2,
  /** a drop lands on a bar that's a multiple of this, at least `minBeats` beats after the build-up
   *  is full (the whole countdown fits) */
  every: 2,
  minBeats: 17,
  /** countdowns nobody pressed before the DJ drops it by itself */
  maxMisses: 1,
  /** a DROP press has to reach the room this long before the bar, so the speaker can land it; a
   *  phone counts `pressTripMs` for getting there. So a press counts until a little over a quarter
   *  second after the cue (people press a moment after they see DROP), and a word that reaches the
   *  speaker a moment late lands at once, not a beat later */
  leadMs: 120,
  pressTripMs: 80,
  /** within this much of a beat of the cue: perfect */
  perfect: 0.25,
  /** pads kept */
  keepPads: 12,
} as const;

/* ------------------------------------------------------------------ what the table can say */

/**
 * Everything a phone or the speaker can tell the booth: the game action `{ x, ...data }`. The room
 * takes and keeps all of them (CONTRACTS.md says how); what the DJ does with the knobs, the ❄️ and
 * the drops is A4, making the songs is A5.
 */
export type DjCommand =
  // anyone at the table
  | { x: "fire" }
  /** too much: the other side of 🔥 */
  | { x: "cold" }
  /** more or less of a style, -1 to 1 in steps of KNOB_STEP (0 takes it back) */
  | { x: "knob"; style: StyleId; value: number }
  /** describe a song: what they wrote, and a style if they picked one */
  | { x: "ask"; text: string; style?: StyleId }
  /** take back a song that isn't being checked or made yet (the host can take back anyone's) */
  | { x: "unask"; id: string }
  /** DROP, pressed during the countdown; `c`: when, on this phone's estimate of the server's clock */
  | { x: "drop"; c?: number }
  // the beginner deck (anyone at the table)
  /** an effect pad */
  | { x: "pad"; pad: PadId }
  /** taps on the build-up since the last send (1 to DECK.maxTaps; 0 once the taps stop: add what's waiting) */
  | { x: "charge"; n: number }
  /** pick a style for the deck that's off the air (the same one again takes the pick back) */
  | { x: "vote"; style: StyleId }
  /** the crossfader, 0 (deck A) to 1 (deck B) */
  | { x: "fader"; value: number }
  // the host
  | { x: "phase"; phase: SetPhase | "end" }
  /** a new set after the end */
  | { x: "again" }
  // the speaker (a big screen; it has no seat)
  /** the music started on the speaker: the set begins */
  | { x: "live"; source: Source }
  /** the speaker's music now comes from elsewhere, mid-set (Lyria came in, or it fell back) */
  | { x: "src"; source: Source }
  /** how the playing has gone since the last report */
  | { x: "stats"; stalls: number; resets: number; seconds: number }
  /** where the speaker's bars fall: bar `bar` starts at server time `at`, at `bpm` */
  | { x: "grid"; at: number; bar: number; bpm: number }
  /** the styles its two decks are sounding now */
  | { x: "decks"; a: StyleId; b: StyleId | null };

/** Most 🔥 or ❄️ a phone sends: one per this many ms. */
export const FIRE_GAP_MS = 400;
/** The room takes one (🔥 or ❄️) per this many ms a phone: a little under, as the network bunches taps up. */
export const FIRE_TAKE_MS = 300;
/** Knobs move in steps of this much. */
export const KNOB_STEP = 0.25;

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
  /** ❄️ presses, oldest first (the latest 40) */
  colds: { pid: string; at: number }[];
  /** each player's knobs, -1 (less) to 1 (more); a style at 0 is left out, and a player with none */
  knobs: Record<string, Partial<Record<StyleId, number>>>;
  /** DROP presses that counted, oldest first (the latest 20) */
  drops: { pid: string; at: number }[];
  /** songs asked for, oldest first: the waiting ones (QUEUE_MAX at most) and the latest KEEP_DONE done */
  queue: Track[];
  /** the speaker's reports added up, for the night's recap (C8) */
  speaker: { at: number; stalls: number; resets: number; seconds: number };
  /** how many sets this table has started (a new one after "again") */
  set: number;
  /** the beginner deck: what the table is doing to the music */
  deck: DeckState;
};
