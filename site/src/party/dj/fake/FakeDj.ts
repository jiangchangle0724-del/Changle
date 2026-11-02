/**
 * 打碟 · DJ Booth: the stand-in DJ, until Lyria plays. It records its sections on this device
 * (render.ts), then streams them into the speaker in quarter-second chunks, the way a live stream
 * arrives, keeping about five seconds waiting; at the end of each section it picks the next by the
 * phase of the night (arrange.ts), and lays the last section's ring-out over the new one.
 *
 * Lyria replaces this class (A2): the speaker, the clock and the screen stay the same.
 */
import { playing } from "../../../shared/dj/curve";
import type { DjPhase } from "../../../shared/dj/types";
import type { Speaker } from "../speaker/speaker";
import { nextSection, renderOrder } from "./arrange";
import { renderSection, type Rendered } from "./render";
import { BPM, SECTION_BY_ID, type Section } from "./sections";

const RATE = 48000;
const CHUNK = RATE / 4;
const AHEAD_S = 5;
/** a section that takes longer than this to record is given up on for now */
const RENDER_TIMEOUT_MS = 90_000;

export class FakeDj {
  readonly bpm = BPM;
  private made = new Map<string, Rendered>();
  private making: Promise<void> | null = null;
  private wanted: string[] = [];
  private phase: DjPhase = "wait";
  private speaker: Speaker | null = null;
  private cur: Rendered | null = null;
  private off = 0;
  private prev: string | null = null;
  private carry: { l: Float32Array; r: Float32Array; at: number } | null = null;
  /** the frame (in the speaker's count) where this stream's first downbeat is */
  private origin = 0;
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
    this.queue(renderOrder(playing(phase) ? phase : "warm"));
  }

  get ready() {
    return this.made.size > 0;
  }

  /** Plays into this speaker from now on (a new speaker starts a new stream). */
  attach(speaker: Speaker) {
    if (speaker !== this.speaker) {
      this.streaming = false;
      this.cur = null;
      this.carry = null;
      this.prev = null;
      this.marks = [];
    }
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
    if (playing(phase)) this.queue(renderOrder(phase));
    const sp = this.speaker;
    if (!sp) return;
    if (!playing(phase) && playing(was)) {
      // the end of a set: a fade, then quiet; the next set starts from its first section
      sp.fadeOut(3);
      this.streaming = false;
      this.cur = null;
      this.carry = null;
      this.prev = null;
      this.marks = [];
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
    return ((sp.heardFrame() - this.origin) / RATE) * (BPM / 60);
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
    this.streaming = false;
    this.cur = null;
    this.carry = null;
    this.prev = null;
    this.marks = [];
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

  private queue(ids: string[]) {
    this.wanted = [...ids.filter((id) => !this.made.has(id)), ...this.wanted.filter((id) => !ids.includes(id))];
    this.makeNext();
  }

  private makeNext(): void {
    if (this.making || this.dead) return;
    const id = this.wanted.shift();
    if (!id) return;
    if (this.made.has(id)) return this.makeNext();
    // a recording that never finishes must not hold up the rest (it is asked for again later)
    let timer = 0;
    const tooLong = new Promise<never>((_, no) => {
      timer = window.setTimeout(() => no(new Error("too long")), RENDER_TIMEOUT_MS);
    });
    this.making = Promise.race([this.render(SECTION_BY_ID[id], RATE), tooLong])
      .then((r) => {
        this.made.set(id, r);
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

  private feed() {
    const sp = this.speaker;
    if (!sp || this.dead || !playing(this.phase) || performance.now() < this.heldUntil) return;
    for (let guard = 0; guard < 40 && sp.buffered() < AHEAD_S; guard++) {
      if (!this.cur) {
        const id = nextSection(this.phase, this.prev);
        // not recorded yet: carry on with the last one, or wait for the first
        const pick = (id && this.made.get(id)) || (this.prev ? this.made.get(this.prev) : undefined);
        if (!pick) return;
        if (!this.streaming) {
          // a new stream: whatever is left of the last one goes, and this one's first downbeat is here
          this.streaming = true;
          sp.flush();
          this.origin = sp.sentFrames;
          sp.restore();
        }
        this.cur = pick;
        this.off = 0;
        this.marks = [...this.marks.slice(-5), { frame: sp.sentFrames, id: pick.id, phase: SECTION_BY_ID[pick.id]?.phase ?? this.phase }];
      }
      this.push(sp, this.cur);
    }
  }

  /** The next chunk of the current section, with the last one's ring-out laid over its start. */
  private push(sp: Speaker, cur: Rendered) {
    const n = Math.min(CHUNK, cur.frames - this.off);
    const l = cur.l.slice(this.off, this.off + n);
    const r = cur.r.slice(this.off, this.off + n);
    const c = this.carry;
    if (c) {
      const m = Math.min(n, c.l.length - c.at);
      for (let i = 0; i < m; i++) {
        l[i] += c.l[c.at + i];
        r[i] += c.r[c.at + i];
      }
      c.at += m;
      if (c.at >= c.l.length) this.carry = null;
    }
    this.off += n;
    if (this.off >= cur.frames) {
      this.carry = { l: cur.l.subarray(cur.frames), r: cur.r.subarray(cur.frames), at: 0 };
      this.prev = cur.id;
      this.cur = null;
    }
    sp.push(l, r);
  }
}
