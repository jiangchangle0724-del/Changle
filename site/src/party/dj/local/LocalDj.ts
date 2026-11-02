/**
 * 打碟 · DJ Booth, your songs (Steve's ask on Nov 2): the DJ that plays the host's own song files,
 * on the big screen's computer (nothing is uploaded), two decks in step like the stand-in, so the
 * crossfader, the pads, the build-up and the drop all work as they do with it.
 *
 * Each song's beat is found when it's added (beats.ts). The night's bars are the first song's; a
 * song that comes in after it plays a little faster or slower so its beats fall on the night's
 * (up to MATCH either way, as a DJ's pitch fader does, the pitch with it), or, too far off, at its
 * own speed: then the night's bars become its bars once it's on the air. A drop into a song lands
 * on its loud part (its `cue`), on the drop's bar: the bars before it play into it on the deck off
 * the air, unheard. A deck off the air waits at its song's start until the fader leans towards it
 * (it starts on the next bar line) or a drop is on its way into it. The room is told when the song
 * on the air is nearly over (the DJ drops into the next) and which songs the decks really have.
 *
 * Like the stand-in it streams into the speaker a few seconds ahead, in quarter-second chunks.
 */
import { playing } from "../../../shared/dj/curve";
import type { DeckSide, DjPhase } from "../../../shared/dj/types";
import type { Speaker } from "../speaker/speaker";
import { matchRate, type SongBeat } from "./beats";

const RATE = 48000;
const CHUNK = RATE / 4;
const AHEAD_S = 5;
/** the room hears a song is ending this long before its end (time for the count and a drop) */
export const ENDING_S = 40;
/** a song plays at most this much faster or slower to fall on the night's beat */
export const MATCH = 0.08;
/** decoded songs kept (about 90 MB a four-minute song) */
const KEEP = 3;

/** One of the host's songs, found on this computer and listened to (crate.ts). */
export type LocalSong = { id: string; title: string; artist: string; file: File; beat: SongBeat; seconds: number };

type Pcm = { l: Float32Array; r: Float32Array };
type Deck = {
  song: LocalSong | null;
  pcm: Pcm | null;
  /** loading: being decoded; parked: decoded, at its start, waiting for the fader or a drop; playing */
  state: "empty" | "loading" | "parked" | "playing";
  /** stream frame `at` plays the song's sample `src`, and every frame after it `step` samples on */
  at: number;
  src: number;
  step: number;
  /** on the night's beat (its own beat counted as `beat` seconds: its tempo, or half or twice it) */
  matched: boolean;
  beat: number;
  /** the room has been told it's ending (this time through) */
  told: boolean;
};

const fresh = (): Deck => ({ song: null, pcm: null, state: "empty", at: 0, src: 0, step: 1, matched: false, beat: 0.5, told: false });

/** A song's samples at a fractional position (a four-point curve through its neighbours; 0 outside). */
function sample(x: Float32Array, p: number): number {
  const i = Math.floor(p);
  if (i < 1 || i + 2 >= x.length) return i >= 0 && i < x.length ? x[i] : 0;
  const t = p - i;
  const y0 = x[i - 1];
  const y1 = x[i];
  const y2 = x[i + 1];
  const y3 = x[i + 2];
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + y1;
}

export class LocalDj {
  /** two decks in step, like the stand-in */
  readonly decks = true;
  /** counts the night's bars starting over (a new stream, or a song on the air too far off the beat to match) */
  epoch = 0;
  /** the stream frame of the night's beat 0, and frames a beat */
  private origin = 0;
  private beatF = (60 / 125) * RATE;
  private d: Record<DeckSide, Deck> = { a: fresh(), b: fresh() };
  private air: DeckSide = "a";
  private fader = 0;
  private phase: DjPhase = "wait";
  private sp: Speaker | null = null;
  private streaming = false;
  private stopTick: (() => void) | null = null;
  private timer = 0;
  private heldUntil = 0;
  private dead = false;
  private songs = new Map<string, LocalSong>();
  private pcm = new Map<string, Promise<Pcm>>();
  /** the song on the air is nearly over (once a time through) */
  onEnding: ((id: string) => void) | null = null;
  /** what the decks really have changed (tell the room) */
  onChange: (() => void) | null = null;

  /** `decode` turns a song's file into samples at 48 kHz (the tests hand in their own) */
  constructor(private decode: (file: File) => Promise<Pcm> = decodeFile) {
    // local runs: the checks look inside (scripts/dj_local_check.py)
    if (typeof window !== "undefined" && import.meta.env?.DEV) (window as unknown as { __localDj: LocalDj }).__localDj = this;
  }

  get bpm() {
    return (60 * RATE) / this.beatF;
  }

  /** It has the song for the deck on the air. */
  get ready() {
    return !!this.d[this.air].pcm;
  }

  /** The songs it may be asked to play. */
  setCrate(list: LocalSong[]) {
    this.songs = new Map(list.map((s) => [s.id, s]));
  }

  /** What the room has on the decks (song ids), which one is on the air, and the fader. */
  setDecks(a: string | null, b: string | null, air: DeckSide, fader: number) {
    this.fader = fader;
    this.load("a", a);
    this.load("b", b);
    if (air !== this.air) this.swap(air);
    this.wake();
    this.feed();
  }

  /** A drop on its way into deck `side`, landing on the night's beat `beat`: its song's loud part lands there. */
  cue(side: DeckSide, beat: number) {
    const k = this.d[side];
    if (!k.pcm || !k.song || side === this.air || !this.streaming) return;
    this.anchor(side, k.song.beat.cue, this.origin + beat * this.beatF);
  }

  /** The songs the decks really have (decoded): a drop only goes into one that does. */
  sounding(): { a: string | null; b: string | null } {
    const has = (k: Deck) => (k.pcm && k.song ? k.song.id : null);
    return { a: has(this.d.a), b: has(this.d.b) };
  }

  attach(sp: Speaker) {
    if (sp !== this.sp) this.restart();
    this.sp = sp;
    this.dead = false;
    this.stopTick?.();
    this.stopTick = sp.onTick(() => this.feed());
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.feed(), 200);
    this.feed();
  }

  detach() {
    this.stopTick?.();
    this.stopTick = null;
    window.clearInterval(this.timer);
    this.sp = null;
    this.restart();
  }

  stop() {
    this.dead = true;
    this.detach();
  }

  setPhase(phase: DjPhase) {
    if (phase === this.phase) return;
    const was = this.phase;
    this.phase = phase;
    const sp = this.sp;
    if (sp && !playing(phase) && playing(was)) {
      sp.fadeOut(3);
      this.restart();
      window.setTimeout(() => {
        if (!this.streaming && !this.dead) sp.flush();
      }, 3500);
    }
    this.feed();
  }

  holdFor(ms: number) {
    this.heldUntil = performance.now() + ms;
  }

  beat(): number {
    const sp = this.sp;
    if (!sp || !this.streaming) return 0;
    return (sp.heardFrame() - this.origin) / this.beatF;
  }

  beatFrame(b: number): number | null {
    if (!this.sp || !this.streaming) return null;
    return this.origin + b * this.beatF;
  }

  heardSection(): { id: string; phase: DjPhase } | null {
    if (!this.sp || !this.streaming) return null;
    return { id: this.d[this.air].song?.id ?? "local", phase: this.phase };
  }

  /** Where the song on the air is now, in its own seconds (the checks read it). */
  heardAt(): { id: string | null; at: number } {
    const k = this.d[this.air];
    const sp = this.sp;
    if (!sp || !k.song || k.state !== "playing") return { id: k.song?.id ?? null, at: 0 };
    return { id: k.song.id, at: (k.src + (sp.heardFrame() - k.at) * k.step) / RATE };
  }

  /* ------------------------------------------------------------------ inside */

  private restart() {
    this.streaming = false;
    for (const side of ["a", "b"] as const) {
      const k = this.d[side];
      if (k.state === "playing") k.state = "parked";
      k.told = false;
    }
  }

  /** Deck `side` should have song `id` (null: nothing): decoded now, waiting at its start. */
  private load(side: DeckSide, id: string | null) {
    const k = this.d[side];
    if ((k.song?.id ?? null) === id) return;
    const song = id ? (this.songs.get(id) ?? null) : null;
    this.d[side] = { ...fresh(), song, state: song ? "loading" : "empty" };
    this.onChange?.();
    if (!song) return;
    this.samples(song)
      .then((pcm) => {
        const now = this.d[side];
        if (now.song?.id !== song.id || now.pcm) return;
        now.pcm = pcm;
        now.state = "parked";
        this.onChange?.();
        this.feed();
      })
      .catch(() => {
        const now = this.d[side];
        if (now.song?.id === song.id) {
          now.state = "empty";
          now.song = null;
          this.onChange?.();
        }
      });
  }

  /** A song's samples, decoded once and kept for the KEEP latest. */
  private samples(song: LocalSong): Promise<Pcm> {
    let p = this.pcm.get(song.id);
    if (p) {
      // the latest used goes to the back
      this.pcm.delete(song.id);
      this.pcm.set(song.id, p);
      return p;
    }
    p = this.decode(song.file);
    this.pcm.set(song.id, p);
    p.catch(() => this.pcm.delete(song.id));
    // the oldest not on a deck go
    const keep = new Set([this.d.a.song?.id, this.d.b.song?.id, song.id]);
    for (const id of [...this.pcm.keys()]) {
      if (this.pcm.size <= KEEP) break;
      if (!keep.has(id)) this.pcm.delete(id);
    }
    return p;
  }

  /**
   * Deck `side` plays its song so that its second `songAt` is heard at stream frame `frame`: on the
   * night's beat when it's near enough, else at its own speed.
   */
  private anchor(side: DeckSide, songAt: number, frame: number) {
    const k = this.d[side];
    if (!k.song) return;
    const own = 60 / k.song.beat.bpm;
    const r = side === this.air && !this.streaming ? 1 : matchRate(k.song.beat.bpm, this.bpm, MATCH);
    if (r === null || k.song.beat.sure < 0.2) {
      k.matched = false;
      k.step = 1;
      k.beat = own;
    } else {
      k.matched = true;
      k.step = r;
      // a song matched at half or twice its tempo counts its beats so
      k.beat = (r * this.beatF) / RATE;
    }
    k.at = frame;
    k.src = songAt * RATE;
    k.state = "playing";
    k.told = false;
  }

  /** The decks swapped (a drop landed, or the fader crossed the middle). */
  private swap(air: DeckSide) {
    this.air = air;
    const k = this.d[air];
    if (!this.streaming || !k.song) return;
    // a deck that never started (the fader flicked across): it starts on the next bar line
    if (k.state !== "playing" && k.pcm) this.startOnBar(air);
    // too far off the night's beat to match: the night's bars become its bars
    if (k.state === "playing" && !k.matched) this.barsOf(air);
  }

  /** The night's bars become deck `side`'s (its first downbeat counted as beat 0). */
  private barsOf(side: DeckSide) {
    const k = this.d[side];
    if (!k.song) return;
    this.beatF = (60 / k.song.beat.bpm) * RATE;
    this.origin = k.at + (k.song.beat.down * RATE - k.src) / k.step;
    k.matched = true;
    k.beat = 60 / k.song.beat.bpm;
    this.epoch += 1;
  }

  /** Deck `side` starts its song from the top, its first downbeat on the next bar line there's room for. */
  private startOnBar(side: DeckSide) {
    const k = this.d[side];
    const sp = this.sp;
    if (!k.song || !k.pcm || !sp) return;
    const lead = k.song.beat.down * RATE;
    const bar = 4 * this.beatF;
    const from = sp.sentFrames + lead + 0.05 * RATE;
    const n = Math.ceil((from - this.origin) / bar);
    this.anchor(side, k.song.beat.down, this.origin + n * bar);
  }

  /** The fader leans towards a deck off the air that's waiting: it starts. */
  private wake() {
    const off: DeckSide = this.air === "a" ? "b" : "a";
    const k = this.d[off];
    const towards = off === "b" ? this.fader : 1 - this.fader;
    if (this.streaming && k.state === "parked" && towards > 0.05) this.startOnBar(off);
  }

  private feed() {
    const sp = this.sp;
    if (!sp || this.dead || !playing(this.phase) || performance.now() < this.heldUntil) return;
    const on = this.d[this.air];
    if (!this.streaming) {
      // a new stream: the song on the air from its top, its bars the night's
      if (!on.pcm || !on.song) return;
      sp.flush();
      sp.restore();
      // (anchored before the stream counts as started: the first song plays at its own speed)
      this.anchor(this.air, 0, sp.sentFrames);
      this.streaming = true;
      this.barsOf(this.air);
      this.onChange?.();
    }
    // the song on the air changed under it (the host's list changed): it starts on the next bar line
    if (on.state === "parked") this.startOnBar(this.air);
    for (let guard = 0; guard < 40 && sp.buffered() < AHEAD_S; guard++) {
      const f0 = sp.sentFrames;
      // the song on the air ran out with nothing after it: its loud part again, on the next bar
      const k = this.d[this.air];
      if (k.state === "playing" && k.song && k.src + (f0 - k.at) * k.step >= k.song.beat.end * RATE) {
        const bar = 4 * this.beatF;
        this.anchor(this.air, k.song.beat.cue, this.origin + Math.ceil((f0 - this.origin) / bar) * bar);
      }
      const a = this.render(this.d.a, f0);
      const b = this.render(this.d.b, f0);
      if (!a && !b) return;
      // a deck with nothing playing sounds the other one (the fader never finds silence)
      if (a && b) sp.push(a[0], a[1], b[0], b[1], true);
      else if (a) sp.push(a[0], a[1], new Float32Array(CHUNK), new Float32Array(CHUNK), false);
      else sp.push(b![0].slice(), b![1].slice(), b![0], b![1], true);
    }
    this.ending();
  }

  /** A chunk of deck `k` from stream frame `f0`, or null when it isn't playing. */
  private render(k: Deck, f0: number): [Float32Array, Float32Array] | null {
    if (k.state !== "playing" || !k.pcm) return null;
    const l = new Float32Array(CHUNK);
    const r = new Float32Array(CHUNK);
    const { l: L, r: R } = k.pcm;
    let p = k.src + (f0 - k.at) * k.step;
    for (let i = 0; i < CHUNK; i++, p += k.step) {
      l[i] = sample(L, p);
      r[i] = sample(R, p);
    }
    return [l, r];
  }

  /** The song on the air nearly over: the room hears it once (it drops into the next). */
  private ending() {
    const sp = this.sp;
    const k = this.d[this.air];
    if (!sp || !k.song || k.state !== "playing" || k.told) return;
    const left = (k.song.beat.end * RATE - (k.src + (sp.heardFrame() - k.at) * k.step)) / k.step / RATE;
    if (left < ENDING_S) {
      k.told = true;
      this.onEnding?.(k.song.id);
    }
  }
}

/** A song file's samples at 48 kHz, both channels (a mono file twice). */
export async function decodeFile(file: File): Promise<Pcm> {
  const data = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, RATE);
  const buf = await ctx.decodeAudioData(data);
  const l = buf.getChannelData(0);
  const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
  return { l, r };
}
