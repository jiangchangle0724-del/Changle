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
 * Lyria replaces this class (A2): the speaker, the clock and the screen stay the same.
 */
import { playing } from "../../../shared/dj/curve";
import type { DjPhase, StyleId } from "../../../shared/dj/types";
import type { Speaker } from "../speaker/speaker";
import { nextSection, renderOrder } from "./arrange";
import { renderSection, type Rendered } from "./render";
import { BPM, beatFrames, type Section } from "./sections";
import { ANY_SECTION, sectionOf } from "./styles";

const RATE = 48000;
const CHUNK = RATE / 4;
const AHEAD_S = 5;
/** a section that takes longer than this to record is given up on for now */
const RENDER_TIMEOUT_MS = 90_000;
/** recordings kept (about 7 MB each): both decks' six sections and a couple more */
const KEEP_MADE = 14;

type Carry = { l: Float32Array; r: Float32Array; at: number };
type Slot = { base: string; a: Rendered; b: Rendered | null };

export class FakeDj {
  readonly bpm = BPM;
  /** it plays two decks in step (Lyria plays one) */
  readonly decks = true;
  private made = new Map<string, Rendered>();
  private making: Promise<void> | null = null;
  private wanted: string[] = [];
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
  /** where each of the last few sections starts in the stream (the speaker's frame count) */
  private marks: { frame: number; id: string; phase: DjPhase }[] = [];
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
  heardSection(): { id: string; phase: DjPhase } | null {
    const sp = this.speaker;
    if (!sp || !this.streaming) return null;
    const at = sp.heardFrame();
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].frame <= at) return this.marks[i];
    return null;
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
  }

  /**
   * What to record, in order: for each section of the night (this phase's first, then every other
   * stretch's first, then the rest), deck A's style, then deck B's.
   */
  private wish(phase: DjPhase) {
    const ids: string[] = [];
    for (const base of renderOrder(phase)) {
      ids.push(sectionOf(this.styleA, base));
      if (this.styleB) ids.push(sectionOf(this.styleB, base));
    }
    this.wanted = ids.filter((id) => !this.made.has(id));
    this.makeNext();
  }

  /** Recordings of styles neither deck plays go first when there are too many. */
  private trim() {
    if (this.made.size <= KEEP_MADE) return;
    const keep = (id: string) => [this.styleA, this.styleB, this.playedA, this.playedB].some((st) => st && ANY_SECTION[id] && sectionOf(st, id.split(":").pop()!) === id);
    for (const id of [...this.made.keys()]) {
      if (this.made.size <= KEEP_MADE) break;
      if (!keep(id)) this.made.delete(id);
    }
  }

  private makeNext(): void {
    if (this.making || this.dead) return;
    const id = this.wanted.shift();
    if (!id) return;
    if (this.made.has(id) || !ANY_SECTION[id]) return this.makeNext();
    // a recording that never finishes must not hold up the rest (it is asked for again later)
    let timer = 0;
    const tooLong = new Promise<never>((_, no) => {
      timer = window.setTimeout(() => no(new Error("too long")), RENDER_TIMEOUT_MS);
    });
    this.making = Promise.race([this.render(ANY_SECTION[id], RATE), tooLong])
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

  /** A deck's section for this slot: its style's if recorded, else the style it played last, else nothing. */
  private pick(base: string, want: StyleId | null, played: StyleId | null): { r: Rendered; style: StyleId } | null {
    for (const st of [want, played]) {
      const r = st ? this.made.get(sectionOf(st, base)) : undefined;
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
        // deck A must have something: its style, the one it had, or the last section again
        let at = base;
        let a = this.pick(base, this.styleA, this.playedA);
        if (!a && this.prev) {
          at = this.prev;
          a = this.pick(this.prev, this.styleA, this.playedA);
        }
        if (!a) return;
        // deck B plays the same section of the night, in its own style
        const b = this.styleB ? this.pick(at, this.styleB, this.playedB) : null;
        if (!this.streaming) {
          // a new stream: whatever is left of the last one goes, and this one's first downbeat is here
          this.streaming = true;
          this.epoch += 1;
          sp.flush();
          this.origin = sp.sentFrames;
          sp.restore();
        }
        this.playedA = a.style;
        this.playedB = b?.style ?? null;
        this.cur = { base: at, a: a.r, b: b?.r ?? null };
        this.off = 0;
        this.marks = [...this.marks.slice(-5), { frame: sp.sentFrames, id: a.r.id, phase: ANY_SECTION[a.r.id]?.phase ?? this.phase }];
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
    if (cur.b || this.carryB) [l2, r2] = this.slice(cur.b, n, this.carryB);
    this.off += n;
    if (this.off >= cur.a.frames) {
      this.carryA = { l: cur.a.l.subarray(cur.a.frames), r: cur.a.r.subarray(cur.a.frames), at: 0 };
      this.carryB = cur.b ? { l: cur.b.l.subarray(cur.b.frames), r: cur.b.r.subarray(cur.b.frames), at: 0 } : null;
      this.prev = cur.base;
      this.cur = null;
    }
    sp.push(l, r, l2, r2);
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
