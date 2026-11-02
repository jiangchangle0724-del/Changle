/**
 * 打碟 · DJ Booth: the stand-in DJ, until Lyria plays. It records its sections on this device
 * (render.ts), then streams them into the speaker in quarter-second chunks, the way a live stream
 * arrives, keeping about five seconds waiting; at the end of each section it picks the next by the
 * phase of the night (arrange.ts), and lays the last section's ring-out over the new one.
 *
 * Two decks (the beginner deck): deck A plays one style, deck B another (or nothing), the same
 * section of the night in each, frame for frame on the same bars, so the speaker's crossfader can
 * blend them at any moment. A deck that changes style changes on the next section (8 bars), once
 * that style's section is recorded; until then it plays on in the style it had.
 *
 * Tracks (tracks.ts): every TRACK_SECTIONS sections (about two minutes) the night moves on to a new
 * song, its own chords and its own turn on the melody, both decks together; a song asked for by
 * name (`playTrack`) comes in at the next section. The first track is the night as written.
 *
 * Lyria replaces this class (A2): the speaker, the clock and the screen stay the same.
 */
import { playing } from "../../../shared/dj/curve";
import { SET_PHASES, type DjPhase, type SetPhase, type StyleId } from "../../../shared/dj/types";
import type { Speaker } from "../speaker/speaker";
import { BY_PHASE, nextSection } from "./arrange";
import { renderSection, type Rendered } from "./render";
import { BPM, beatFrames, type Section } from "./sections";
import { sectionById, sectionOf } from "./styles";
import { newTrack } from "./tracks";

const RATE = 48000;
const CHUNK = RATE / 4;
const AHEAD_S = 5;
/** a section that takes longer than this to record is given up on for now */
const RENDER_TIMEOUT_MS = 90_000;
/** recordings kept (about 7 MB each): what both decks play this stretch and the next song's start, and a few more */
const KEEP_MADE = 16;
/** a song lasts this many sections (8 bars each: about two minutes) */
export const TRACK_SECTIONS = 8;

type Carry = { l: Float32Array; r: Float32Array; at: number };
type Slot = { base: string; a: Rendered; b: Rendered | null };

export class FakeDj {
  readonly bpm = BPM;
  /** it plays two decks in step (Lyria plays one) */
  readonly decks = true;
  private made = new Map<string, Rendered>();
  private making: Promise<void> | null = null;
  private wanted: string[] = [];
  /** every recording the plan wants, made or not (what to keep) */
  private need = new Set<string>();
  /** the song playing (tracks.ts; 0 is the night as written), the one after it, and how many of its sections have started */
  private track = 0;
  private nextN = newTrack();
  private parts = 0;
  private phase: DjPhase = "wait";
  private styleA: StyleId = "house";
  private styleB: StyleId | null = null;
  /** the styles each deck played last section (a new one waits until it's recorded) */
  private playedA: StyleId = "house";
  private playedB: StyleId | null = null;
  private speaker: Speaker | null = null;
  private cur: Slot | null = null;
  private off = 0;
  private prev: string | null = null;
  private carryA: Carry | null = null;
  private carryB: Carry | null = null;
  /** the frame (in the speaker's count) where this stream's first downbeat is */
  private origin = 0;
  /** counts the streams: a new one starts its bars over */
  epoch = 0;
  private streaming = false;
  private stopTick: (() => void) | null = null;
  private timer = 0;
  private dead = false;
  private sets = 0;
  private heldUntil = 0;
  /** where each of the last few sections starts in the stream (the speaker's frame count), and the styles its decks play */
  private marks: { frame: number; id: string; phase: DjPhase; a: StyleId; b: StyleId | null; track: number }[] = [];
  /** called once the first section is ready to play */
  onReady: (() => void) | null = null;

  /** `render` records a section (the tests hand in their own) */
  constructor(private render: (sec: Section, rate: number) => Promise<Rendered> = renderSection) {}

  /** Start recording the sections (no tap needed): the warm-up's first, so it can start soon. */
  prepare(phase: DjPhase = "warm") {
    this.dead = false;
    this.wish(playing(phase) ? phase : "warm");
  }

  get ready() {
    return this.made.size > 0;
  }

  /** The decks' styles (B: none). A deck takes a new one at its next section, once recorded. */
  setDecks(a: StyleId, b: StyleId | null) {
    if (a === this.styleA && b === this.styleB) return;
    this.styleA = a;
    this.styleB = b;
    this.wish(playing(this.phase) ? this.phase : "warm");
  }

  /** A song asked for by name: its track (tracks.ts `trackFor`) comes in at the next section, once recorded. */
  playTrack(n: number) {
    if (n === this.track || (n === this.nextN && this.parts >= TRACK_SECTIONS)) return;
    this.nextN = n;
    this.parts = TRACK_SECTIONS;
    this.wish(playing(this.phase) ? this.phase : "warm");
  }

  /** Plays into this speaker from now on (a new speaker starts a new stream). */
  attach(speaker: Speaker) {
    if (speaker !== this.speaker) this.restart();
    this.speaker = speaker;
    this.stopTick?.();
    // the player reports about 23 times a second: top the stream up then, and on a timer too
    this.stopTick = speaker.onTick(() => this.feed());
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.feed(), 200);
    this.feed();
  }

  setPhase(phase: DjPhase) {
    if (phase === this.phase) return;
    const was = this.phase;
    this.phase = phase;
    if (playing(phase)) this.wish(phase);
    const sp = this.speaker;
    if (!sp) return;
    if (!playing(phase) && playing(was)) {
      // the end of a set: a fade, then quiet; the next set starts from its first section
      sp.fadeOut(3);
      this.restart();
      const set = ++this.sets;
      window.setTimeout(() => {
        if (set === this.sets && !this.streaming && !this.dead) sp.flush();
      }, 3500);
    }
    this.feed();
  }

  /** Beats since this stream's first downbeat, at what the speakers are sounding now. */
  beat(): number {
    const sp = this.speaker;
    if (!sp || !this.streaming) return 0;
    return (sp.heardFrame() - this.origin) / beatFrames(RATE);
  }

  /** The frame (the speaker's count) where beat `b` of this stream falls, or null between streams. */
  beatFrame(b: number): number | null {
    if (!this.speaker || !this.streaming) return null;
    return this.origin + b * beatFrames(RATE);
  }

  /**
   * The section the speakers are sounding right now (null between sets): the screen times its
   * moments to the music, not to the tap that asked for them.
   */
  heardSection(): { id: string; phase: DjPhase; track: number } | null {
    const sp = this.speaker;
    if (!sp || !this.streaming) return null;
    const at = sp.heardFrame();
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].frame <= at) return this.marks[i];
    return null;
  }

  /** The styles the two decks are sounding now (what the speakers play, not what's waiting), or null between sets. */
  heardDecks(): { a: StyleId; b: StyleId | null } | null {
    const m = this.heardSection() as { a: StyleId; b: StyleId | null } | null;
    return m ? { a: m.a, b: m.b } : null;
  }

  /**
   * Stop feeding the speaker (Lyria plays instead); what has been recorded stays. Attaching again
   * starts a fresh stream.
   */
  detach() {
    this.stopTick?.();
    this.stopTick = null;
    window.clearInterval(this.timer);
    this.speaker = null;
    this.restart();
  }

  /** Stop sending for a while, as a dropped connection would (the speaker test page's button). */
  holdFor(ms: number) {
    this.heldUntil = performance.now() + ms;
  }

  /** Stop feeding and recording (the screen went away; `prepare` picks it up again). */
  stop() {
    this.dead = true;
    this.stopTick?.();
    this.stopTick = null;
    window.clearInterval(this.timer);
  }

  private restart() {
    this.streaming = false;
    this.cur = null;
    this.carryA = null;
    this.carryB = null;
    this.prev = null;
    this.marks = [];
    // a new stream starts its song from the top
    this.parts = 0;
  }

  /**
   * What to record, in order, deck A's style before deck B's: the section that plays next (a new
   * style or song is heard as soon as it can be), this stretch's sections in this song, the next
   * song's when this one is nearly over, and every other stretch's first in this song (so the host
   * can go anywhere; deck A's only, B catches up).
   */
  private wish(phase: DjPhase) {
    const ids: string[] = [];
    const add = (base: string | null | undefined, track: number, both = true) => {
      if (!base) return;
      ids.push(sectionOf(this.styleA, base, track));
      if (both && this.styleB) ids.push(sectionOf(this.styleB, base, track));
    };
    const here = (BY_PHASE[phase as SetPhase] ?? BY_PHASE.warm) as string[];
    // (the one after the section going out now: that one's decks were settled when it began)
    const next = this.streaming && playing(this.phase) ? nextSection(this.phase, this.cur?.base ?? this.prev) : null;
    const turning = this.parts >= TRACK_SECTIONS;
    add(next, turning ? this.nextN : this.track);
    for (const base of here) add(base, this.track);
    if (this.parts >= TRACK_SECTIONS - 2) for (const base of here) add(base, this.nextN);
    for (const p of SET_PHASES) add(BY_PHASE[p][0], this.track, false);
    this.need = new Set(ids);
    this.wanted = [...this.need].filter((id) => !this.made.has(id));
    this.makeNext();
  }

  /**
   * At most KEEP_MADE recordings (about 7 MB each): the ones playing now stay, then what the plan
   * wants (`wish`); the rest go, oldest first.
   */
  private trim() {
    if (this.made.size <= KEEP_MADE) return;
    const rank = (id: string) => (id === this.cur?.a.id || id === this.cur?.b?.id ? 0 : this.need.has(id) ? 1 : 4);
    // the least wanted first; Map keys are oldest first, and the sort keeps that within a rank
    const victims = [...this.made.keys()].sort((x, y) => rank(y) - rank(x));
    for (const id of victims) {
      if (this.made.size <= KEEP_MADE || rank(id) === 0) break;
      this.made.delete(id);
    }
  }

  private makeNext(): void {
    if (this.making || this.dead) return;
    const id = this.wanted.shift();
    if (!id) return;
    const sec = sectionById(id);
    if (this.made.has(id) || !sec) return this.makeNext();
    // a recording that never finishes must not hold up the rest (it is asked for again later)
    let timer = 0;
    const tooLong = new Promise<never>((_, no) => {
      timer = window.setTimeout(() => no(new Error("too long")), RENDER_TIMEOUT_MS);
    });
    this.making = Promise.race([this.render(sec, RATE), tooLong])
      .then((r) => {
        this.made.set(id, r);
        this.trim();
        if (this.made.size === 1) this.onReady?.();
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timer);
        this.making = null;
        // give the page a breath between sections
        window.setTimeout(() => this.makeNext(), 30);
        this.feed();
      });
  }

  /** A deck's section for this slot in song `track`: its style's if recorded, else the style it played last, else nothing. */
  private pick(base: string, want: StyleId | null, played: StyleId | null, track: number): { r: Rendered; style: StyleId } | null {
    for (const st of [want, played]) {
      const r = st ? this.made.get(sectionOf(st, base, track)) : undefined;
      if (r && st) return { r, style: st };
    }
    return null;
  }

  private feed() {
    const sp = this.speaker;
    if (!sp || this.dead || !playing(this.phase) || performance.now() < this.heldUntil) return;
    for (let guard = 0; guard < 40 && sp.buffered() < AHEAD_S; guard++) {
      if (!this.cur) {
        const base = nextSection(this.phase, this.prev);
        if (!base) return;
        // the next song once this one has had its sections (or one was asked for), if it's recorded;
        // until then this one plays on. Deck A must have something: its style, the one it had, or
        // the last section again
        let track = this.parts >= TRACK_SECTIONS ? this.nextN : this.track;
        let at = base;
        let a = this.pick(base, this.styleA, this.playedA, track);
        if (!a && track !== this.track) {
          track = this.track;
          a = this.pick(base, this.styleA, this.playedA, track);
        }
        if (!a && this.prev) {
          at = this.prev;
          a = this.pick(this.prev, this.styleA, this.playedA, track);
        }
        if (!a) return;
        // deck B plays the same section of the same song (the same chords) in its own style, or the
        // one it had; with neither recorded it has nothing this section, and the player plays deck
        // A alone, wherever the fader is (never silence)
        const b = this.styleB ? this.pick(at, this.styleB, this.playedB, track) : null;
        if (track !== this.track) {
          this.track = track;
          this.parts = 0;
          this.nextN = newTrack(track);
        }
        this.parts += 1;
        if (!this.streaming) {
          // a new stream: whatever is left of the last one goes, and this one's first downbeat is here
          this.streaming = true;
          this.epoch += 1;
          sp.flush();
          this.origin = sp.sentFrames;
          sp.restore();
        }
        this.playedA = a.style;
        if (b) this.playedB = b.style;
        this.cur = { base: at, a: a.r, b: b?.r ?? null };
        this.off = 0;
        this.marks = [...this.marks.slice(-5), { frame: sp.sentFrames, id: a.r.id, phase: sectionById(a.r.id)?.phase ?? this.phase, a: a.style, b: b?.style ?? null, track }];
        // plan the recordings again: the next section, and the next song's when it's near
        this.wish(this.phase);
      }
      this.push(sp, this.cur);
    }
  }

  /** The next chunk of the current section on both decks, each with its last section's ring-out laid over its start. */
  private push(sp: Speaker, cur: Slot) {
    const n = Math.min(CHUNK, cur.a.frames - this.off);
    const [l, r] = this.slice(cur.a, n, this.carryA);
    let l2: Float32Array | undefined;
    let r2: Float32Array | undefined;
    // (B with nothing this section but its last one's ring-out: the player lets the tail fade
    // under deck A rather than cutting it)
    if (cur.b || this.carryB) [l2, r2] = this.slice(cur.b, n, this.carryB);
    const ownB = !!cur.b;
    this.off += n;
    if (this.off >= cur.a.frames) {
      this.carryA = { l: cur.a.l.subarray(cur.a.frames), r: cur.a.r.subarray(cur.a.frames), at: 0 };
      this.carryB = cur.b ? { l: cur.b.l.subarray(cur.b.frames), r: cur.b.r.subarray(cur.b.frames), at: 0 } : null;
      this.prev = cur.base;
      this.cur = null;
    }
    sp.push(l, r, l2, r2, ownB);
  }

  private slice(rec: Rendered | null, n: number, c: Carry | null): [Float32Array, Float32Array] {
    const l = rec ? rec.l.slice(this.off, this.off + n) : new Float32Array(n);
    const r = rec ? rec.r.slice(this.off, this.off + n) : new Float32Array(n);
    if (c) {
      const m = Math.min(n, c.l.length - c.at);
      for (let i = 0; i < m; i++) {
        l[i] += c.l[c.at + i];
        r[i] += c.r[c.at + i];
      }
      c.at += m;
      if (c.at >= c.l.length) {
        if (c === this.carryA) this.carryA = null;
        else if (c === this.carryB) this.carryB = null;
      }
    }
    return [l, r];
  }
}
