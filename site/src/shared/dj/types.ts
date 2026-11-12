/**
 * 打碟 · DJ Booth: the shapes every part of the booth agrees on: the rules on the rooms server,
 * the speaker (the big screen that plays the music), the phones, and later the Lyria relay and
 * the song pipeline. CONTRACTS.md beside this file says how they fit together.
 */
import type { T } from "../../i18n";
import type { Dancer } from "./dance";

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
export type Source = "fake" | "lyria" | "local";

/**
 * One of the host's own songs on a night of them (`local`: Steve's ask on Nov 2), as the room keeps
 * it: the big screen's computer has the file and plays it (nothing is uploaded); the room has its
 * name, to show and to ask for. `t` its title, `a` its artist, `bpm` its tempo, `s` its seconds.
 */
export type CrateSong = { id: string; t: string; a: string; bpm: number; s: number };
/** the host's songs a night keeps at most (their names go to the room in one message) */
export const CRATE_MAX = 200;

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
export type PadId = "echo" | "sweep" | "horn" | "brake" | "siren" | "laser" | "scratch" | "rewind" | "vinyl" | "bassdrop" | "reverse" | "whistle";
/** in this order on the phones (two rows of four); the room's `pad` event names a pad by its place here */
/** (the last four Steve's ask on Nov 2: more club sounds, "airhorn blasts, vinyl record") */
export const PAD_IDS: PadId[] = ["echo", "sweep", "horn", "brake", "siren", "laser", "scratch", "rewind", "vinyl", "bassdrop", "reverse", "whistle"];
/** the pads that move the music itself (the brake, a scratch, a rewind): one at a time, never into a drop */
export const MOVES: PadId[] = ["brake", "scratch", "rewind"];
/** the pads that are a sound of their own, not something done to the music: they also play over a
 *  whole song from YouTube (Steve on Nov 2: "在播放youtube 音乐的时候我还是要可以放DJ 相关的音效来热场") */
export const OVER_SONG: PadId[] = ["horn", "siren", "laser", "vinyl", "bassdrop", "reverse", "whistle"];

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
  /** 点歌模式 (the jukebox, Steve on Nov 5): the switch into the next song, on its bar all the same,
   *  with no countdown, nothing to press and no boom */
  quiet?: boolean;
};

/** A drop that landed: what the screens celebrate, and the night's record. */
export type LandedDrop = { at: number; bar: number; hits: { pid: string; grade: DropGrade }[]; auto: boolean; to: DeckSide; style: StyleId; quiet?: boolean };

/**
 * A song asked for by name on the beginner deck (Steve's ask on Nov 1). With its video on YouTube
 * (`yt`: a pasted link, or a search) the whole song plays on the big screen in YouTube's own player
 * once the table drops into it (真歌时间, Steve on Nov 2), and the DJ's remix in its style carries on
 * after it; without one, the remix alone. One the player picked from the site's song list (`song`)
 * shows its title and artist, the list's, to the whole table; a name they typed themself, or a
 * video's title from YouTube, only they and the host read (the others see that they asked for a
 * song): nothing a player sends reaches the big screen unchecked.
 */
/**
 * Who asked for a song picked on the big screen itself (Steve on Nov 11: "公用手机（投屏电视）...
 * 这个手机是可以在YouTube上点歌的": one phone everyone shares, its screen on the TV): the table's,
 * nobody's seat. Its songs count against the table's `reqMax` only, and everyone reads their names
 * (they were typed on the screen everyone watches).
 */
export const SHARED_BY = "~shared";

export type SongReq = {
  id: string;
  /** who asked for it */
  by: string;
  /** the song's title (from the song list, or Apple's for one found there), or what the player typed */
  text: string;
  /** its artist, from the song list (or Apple) */
  artist?: string;
  /** the song list's id for it (Apple's track id) */
  song?: number;
  /** the whole song on YouTube (a video id), played on the big screen in YouTube's own player
   *  (Steve on Nov 2, his plan's 观众点歌: never downloaded, never mixed), and its title there */
  yt?: string;
  ytT?: string;
  /** the big screen found its video won't play outside YouTube (removed, private, or embedding off)
   *  while getting it ready: the video was taken off it, its remix plays alone */
  ytNo?: boolean;
  /** (a clip the DJ can play over its drums: no licensed source sets one now; LICENSES.md) */
  p?: string;
  /** one of the host's own songs (a night of them): its id in the room's `crate` */
  local?: string;
  /** the style its remix is made in (requests.ts) */
  style: StyleId;
  /** the stand-in's song for the remix (requests.ts `trackFor`): the same name, the same remix */
  track: number;
  /** server time it was asked for */
  at: number;
};

/** A song's name typed in: 1 to 60 characters (an emoji or a Chinese character counts as one). */
export const REQ_CHARS = { min: 1, max: 60 } as const;

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
  sounding: { a: StyleId; b: StyleId | null; sa?: string | null; sb?: string | null } | null;
  /**
   * A night of the host's own songs (the room's source is `local`): each deck has one of them
   * (`songs`, ids in the room's `crate`) instead of a style; the ones already on the air tonight
   * (`played`); the one on the air the speaker says is nearly over (`ending`: the DJ drops into the
   * next). The speaker says which songs its decks really have (`sounding.sa`, `sounding.sb`).
   */
  local: boolean;
  songs: { a: string | null; b: string | null };
  played: string[];
  ending: string | null;
  /**
   * Songs asked for by name (`req`): the ones waiting their turn, oldest first; the one up next,
   * its style on the deck off the air (the picks wait for it: the next drop onto that deck plays
   * its remix); and the one whose remix is on the air.
   */
  reqs: SongReq[];
  up: SongReq | null;
  now: SongReq | null;
  /** when each player's last song asked for came on the air: within DECK.reqAgainMs the others'
   *  waiting songs go first (the plan: one person's two songs 10 minutes apart) */
  reqOn: Record<string, number>;
  /** tonight, for the night's recap (今晚回顾): what went on the air and when (a style, the host's
   *  songs: `mine`, or nothing between sets: `off`), and the songs asked for that played, oldest
   *  first. Another set carries them on, like the night's 🔥 */
  aired: { at: number; style: StyleId | "mine" | "off" }[];
  heard: SongReq[];
  /** 真歌时间: a song asked for from YouTube plays whole on the big screen (from `at`, after the DJ
   *  fades out); the deck waits until it ends, its player or the host skips it, or 12 minutes */
  song: { id: string; yt: string; by: string; at: number } | null;
  /** the table's mixer on the speaker's output (混音台) */
  mixer: MixerState;
  /** the room's own bookkeeping (not sent to the phones): when each phone last had a pad, a pick,
   *  a song asked for and a mixer switch taken, the last brake, which screen gives the bars, when
   *  it last moved them and when it last said anything at all (it says the bars every 10 s while it
   *  plays), and when the decks and the source were last taken from it */
  padAt: Record<string, number>;
  mixAt: Record<string, number>;
  voteAt: Record<string, number>;
  reqAt: Record<string, number>;
  brakeAt: number;
  gridFrom: string | null;
  gridSetAt: number;
  speakerAt: number;
  decksAt: number;
  srcAt: number;
  crateAt: number;
};

/* ------------------------------------------------------------------ the mixer (混音台) */

/**
 * 混音台 (Steve on Nov 2: "professional mixing, more electronic, knobs"): every phone has the
 * table's mixer on the speaker's output. Four knobs, -1 to 1, 0 as the music plays: `low`, `mid`,
 * `high` (the EQ: -1 cuts the band right out, 1 lifts it) and `filter` (left a low-pass closing in,
 * right a high-pass thinning the music out). Four effects, on or off, each switching on the next
 * beat: `pump` (the music ducks on every beat and swells back, as under a sidechained kick), `gate`
 * (cut into sixteenths, a trance gate), `flange` (a jet's sweep) and `crush` (lo-fi, a few bits).
 */
export const MIX_KNOBS = ["low", "mid", "high", "filter"] as const;
export type MixKnob = (typeof MIX_KNOBS)[number];
export const MIX_FX = ["pump", "gate", "flange", "crush"] as const;
export type MixFx = (typeof MIX_FX)[number];

/** The mixer as the room keeps it. */
export type MixerState = {
  knobs: Record<MixKnob, number>;
  /** who has each knob: whoever moved it last, until MIXER.holdMs after their last move */
  knobBy: Partial<Record<MixKnob, string>>;
  knobAt: Partial<Record<MixKnob, number>>;
  /** the effects that are on: when (server time) and by whom */
  fx: Partial<Record<MixFx, { at: number; by: string }>>;
};

export const MIXER = {
  /** knobs move in steps of this much */
  step: 0.05,
  /** a phone sends a knob at most this often while a finger turns it */
  sendMs: 100,
  /** a knob stays with whoever moved it for this long after their last move */
  holdMs: 1500,
  /** a phone switches an effect (or resets the mixer) at most this often */
  fxGapMs: 400,
  /** an effect goes off by itself this long after it went on (32 bars at 125 BPM): nobody leaves the
   *  night crushed by accident */
  fxMs: 61_440,
} as const;

/** The mixer as the music plays: every knob at 0, no effects. */
export const freshMixer = (): MixerState => ({ knobs: { low: 0, mid: 0, high: 0, filter: 0 }, knobBy: {}, knobAt: {}, fx: {} });

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
  /** songs asked for by name (the night's 歌单, Steve on Nov 2: "很多人点歌要把它们放到一个
   *  playlist"): `reqMax` waiting for the whole table, `reqEach` each (waiting or up next), a
   *  phone's taken one per `reqGapMs`. Up next: if the table hasn't dropped into it `reqWaitMs`
   *  after it's ready, the DJ starts the countdown itself (and drops it if nobody presses); its
   *  remix is named on the screens for `reqPlayMs` after its drop */
  reqMax: 30,
  reqEach: 3,
  reqGapMs: 5000,
  reqWaitMs: 40_000,
  reqPlayMs: 90_000,
  /** a whole song from YouTube starts on its drop's bar (the big screen has it cued and buffered
   *  while it's up next, and the DJ lets go with the drop's boom), and plays at most this long (the
   *  big screen says when it ends; this is in case it never does) */
  songMaxMs: 12 * 60_000,
  /** after a whole song, the DJ plays at least this long before it drops into the next one by
   *  itself (Steve: "歌和 DJ 轮流"); the table can build up and drop into it sooner */
  songGapMs: 60_000,
  /** 点歌模式: a song up next starts this soon (a moment for the big screen to load it), after a
   *  song the DJ comes back for `jukeGapMs`, and the switch lands on the first bar at least
   *  `jukeBeats` beats on (about 5 seconds of DJ between two songs at 125 BPM) */
  jukeWaitMs: 1500,
  jukeGapMs: 1000,
  jukeBeats: 8,
  /** a player whose song came on the air this recently waits behind the others' songs (alone, it
   *  still plays: nobody's turn is taken) */
  reqAgainMs: 600_000,
  /** how much of the night the recap keeps: style changes, songs that played */
  airedMax: 200,
  heardMax: 30,
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
  /** ask for a song by name (the deck): `song`, the song list's id when they picked it there;
   *  `yt`, its video on YouTube (a pasted link or a search): [video id, title, channel];
   *  on a night of the host's songs, `local`: one of them */
  | { x: "req"; text?: string; song?: number; yt?: [string, string, string]; local?: string }
  | { x: "songskip" }
  /** take back a song asked for by name, waiting or up next (the host can take back anyone's) */
  | { x: "unreq"; id: string }
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
  /** the styles its two decks are sounding now (and on a night of the host's songs, which songs) */
  | { x: "decks"; a: StyleId; b: StyleId | null; sa?: string | null; sb?: string | null }
  /** the host's own songs on this computer: [id, title, artist, bpm, seconds] each */
  | { x: "crate"; songs: [string, string, string, number, number][] }
  /** the host's song on the air is nearly over */
  | { x: "ending"; id: string }
  /** the host (their phone, or the big screen's 我的歌): the night on their songs, or back to the stand-in */
  | { x: "mine"; on: boolean }
  | { x: "voice"; on: boolean }
  | { x: "shuffle"; on: boolean }
  /** 点歌模式 (the host): no build-up and no DROP, the songs asked for one after another */
  | { x: "juke"; on: boolean }
  /** anyone at the table: the song's video over the whole TV, or back in its corner */
  | { x: "full"; on: boolean }
  | { x: "dance"; bar: number; n: number; of: number }
  // the mixer (anyone at the table)
  /** a knob, -1 to 1 (0: as the music plays) */
  | { x: "mix"; knob: MixKnob; value: number }
  /** an effect on or off */
  | { x: "mixfx"; fx: MixFx; on: boolean }
  /** every knob back to 0, every effect off */
  | { x: "mixoff" }
  /** the speaker: how a song file sent from the host's phone went (`code`: SONG_SENT), for that phone (`by`), the file's number (`id`) */
  | { x: "song"; by: string; id: number; code: number }
  | { x: "songdone"; id: string }
  /** the speaker: the video of the song up next won't play here (YouTube's answer while getting it
   *  ready): it comes off that song, which plays as the DJ's remix alone */
  | { x: "nosong"; id: string };

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
  /** the host's own songs, when the speaker has some (a night of them: source `local`); `crateV` counts their changes */
  crate: CrateSong[];
  crateV: number;
  /** the host wants the night on their songs (from their phone or the big screen): the speaker plays them once it has some */
  mine: boolean;
  /** 报幕: the big screen says who a song asked for is from as the countdown into it starts (the host can turn it off) */
  voice: boolean;
  /** the 歌单 in a random order (the host's switch, Steve on Nov 2: "可选择随机排序或按顺序"):
   *  the next song asked for is any of the waiting ones, else first come, first played */
  shuffle: boolean;
  /**
   * 点歌模式 (the host's switch, Steve on Nov 5: "关闭 drop ... 当成一个点歌器，播放完一首歌，下一首歌就
   * 自动播放"): no build-up, no DROP and no picks; the songs asked for play one after another, the DJ
   * for a few seconds between them, and on its own when there are none
   */
  juke: boolean;
  /** the song's video over the whole TV (anyone at the table, Steve on Nov 5), else in its corner */
  full: boolean;
  /** 跟着跳 (shared/dj/dance.ts): each dancer's night, the bar the floor is being counted on, and the floor's combo (0 to 1) */
  dance: Record<string, Dancer>;
  danceBar: { bar: number; n: number; good: number };
  combo: number;
};

/**
 * How a song file sent from the host's phone went (the speaker says, the room tells that phone):
 * added, or why not (not a sound file, under 45 s, over 15 minutes, can't be played, no room for
 * more, or there already).
 */
export const SONG_SENT = ["added", "kind", "short", "long", "unreadable", "full", "there"] as const;
export type SongSent = (typeof SONG_SENT)[number];
