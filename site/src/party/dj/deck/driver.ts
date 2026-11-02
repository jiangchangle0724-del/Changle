/**
 * 打碟 · DJ Booth: the beginner deck on the speaker. The room keeps what the table does (the pads
 * pressed, the build-up, the drop and its bar, the fader); this turns it into sound, every bit of it
 * on the beat: a pad starts on the next beat, the build-up's roll falls on the grid, the drop lands
 * on its bar, the crossfader jumps with it. It also tells the room where the speaker's bars fall, so
 * every phone counts down to the same moment the room hears.
 *
 * Times here are audio times (the speaker's context) unless they say server.
 */
import { chargeNow } from "../../../shared/dj/deck";
import type { DropState, PadId } from "../../../shared/dj/types";
import type { DeckView } from "../../../shared/protocol";
import { DeckFx } from "../speaker/fx";
import type { Speaker } from "../speaker/speaker";

/** Whichever DJ plays, as far as the deck needs it (useBooth's BoothDj). */
export type DeckDj = { readonly decks: boolean; readonly bpm: number; readonly epoch: number; beat(): number; beatFrame(b: number): number | null };
export type Grid = { at: number; bar: number; bpm: number };

/** How far ahead the roll is written, seconds. */
const ROLL_AHEAD = 0.3;

export class DeckDriver {
  private fx: DeckFx;
  private deck: DeckView | null = null;
  private on = false;
  private timer = 0;
  private dropKey = "";
  /** when the drop lands (0: none on its way), and until when the room's fader waits for it */
  private dropT = 0;
  private holdFader = 0;
  private fader = -1;
  private level = -1;
  private rollBeat = -Infinity;
  private brakeUntil = 0;
  private sent: (Grid & { epoch: number; when: number }) | null = null;
  private checked = 0;
  /** what the deck did, for the checks (scripts/dj_deck_check.py): kind and audio time */
  readonly log: { k: string; at: number; beat: number }[] = [];

  constructor(
    private sp: Speaker,
    private dj: DeckDj,
    /** the server's clock (ms) */
    private now: () => number,
    private sendGrid: (g: Grid) => void,
  ) {
    this.fx = new DeckFx(sp);
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  stop() {
    window.clearInterval(this.timer);
    this.fx.reset();
    this.sp.setXfade(0);
  }

  /** The room's deck changed (or the night did). */
  update(deck: DeckView, on: boolean) {
    const was = this.on;
    this.deck = deck;
    this.on = on;
    if (was && !on) {
      // the set is over: every effect off, nothing on its way
      this.fx.reset();
      this.dropT = 0;
      this.dropKey = "";
      this.level = -1;
    }
    this.tick();
  }

  /** Someone pressed a pad: it plays from the next beat. */
  pad(pad: PadId) {
    if (!this.on) return;
    const nb = this.nextBeat();
    if (!nb) return;
    const beat = 60 / this.dj.bpm;
    let done = false;
    if (pad === "echo") done = this.fx.echo(nb.at, beat);
    else if (pad === "sweep") done = this.fx.sweep(nb.at, beat);
    else if (pad === "horn") done = this.fx.horn(nb.at, beat);
    else if (pad === "brake") {
      // never into a drop, never on top of another brake: slow to a stop over most of a beat,
      // quiet until the next bar line, back on the downbeat
      if (this.dropT > this.sp.ctx.currentTime || nb.at < this.brakeUntil) return;
      const until = this.timeOfBeat(Math.ceil((nb.b + 1) / 4) * 4);
      if (until === null) return;
      this.sp.brake(nb.at, 0.75 * beat, until);
      this.brakeUntil = until;
      done = true;
    }
    if (done) this.log.push({ k: pad, at: nb.at, beat: nb.b });
  }

  /* ------------------------------------------------------------------ the beat grid */

  /** Audio time of beat `b` (fractional is fine), or null. */
  private timeOfBeat(b: number): number | null {
    const f = this.dj.beatFrame(b);
    return f === null ? null : this.sp.timeOfFrame(f);
  }

  /** The beat the speaker is working on now (ahead of what's heard by the output's delay). */
  private beatNow(): number | null {
    const t0 = this.timeOfBeat(0);
    if (t0 === null) return null;
    return (this.sp.ctx.currentTime - t0) / (60 / this.dj.bpm);
  }

  /** The next whole beat at least `lead` seconds away, and when. */
  private nextBeat(lead = 0.03): { b: number; at: number } | null {
    const bn = this.beatNow();
    if (bn === null) return null;
    let b = Math.floor(bn) + 1;
    let at = this.timeOfBeat(b);
    if (at === null) return null;
    if (at < this.sp.ctx.currentTime + lead) {
      b += 1;
      at = this.timeOfBeat(b)!;
    }
    return { b, at };
  }

  /* ------------------------------------------------------------------ every tenth of a second */

  private tick() {
    const d = this.deck;
    if (!d) return;
    const ctxNow = this.sp.ctx.currentTime;
    this.reportGrid();

    // the crossfader: the room's, except while a drop's jump is on its way (Lyria: one deck, A)
    const want = this.dj.decks ? d.fader : 0;
    if (ctxNow >= this.holdFader && want !== this.fader) {
      this.sp.setXfade(want);
      this.fader = want;
    }

    if (!this.on) return;

    // the drop: once someone pressed in time (or the DJ will), on its bar
    if (d.drop && (d.drop.hits.length || d.drop.auto)) {
      const key = `${d.drop.bar}:${d.drop.at}`;
      if (key !== this.dropKey) this.land(d.drop, key);
    }
    // landed: the room says so a moment later, until then the build-up stays down
    if (this.dropT && ctxNow >= this.dropT && !d.drop) this.dropT = 0;
    const landing = this.dropT > 0;
    const level = landing ? (ctxNow < this.dropT ? 1 : 0) : chargeNow(d, this.now());
    if (Math.abs(level - this.level) > 0.004) {
      this.fx.build(level);
      this.level = level;
    }
    this.roll(level, !!d.drop);
  }

  /** The snare roll under the build-up: quarters, then eighths, then sixteenths as it fills. */
  private roll(level: number, armed: boolean) {
    const ctxNow = this.sp.ctx.currentTime;
    if (level < 0.05) {
      this.rollBeat = -Infinity;
      return;
    }
    const bn = this.beatNow();
    if (bn === null) return;
    const step = armed || level >= 0.75 ? 0.25 : level >= 0.4 ? 0.5 : 1;
    let x = Math.max(this.rollBeat + step, Math.ceil((bn + 0.05) / step) * step);
    for (let guard = 0; guard < 32; guard++, x += step) {
      const at = this.timeOfBeat(x);
      if (at === null || at > ctxNow + ROLL_AHEAD) break;
      if (this.dropT && at >= this.dropT - 0.001) break;
      if (at < ctxNow + 0.01) continue;
      this.fx.roll(at, 0.06 + 0.2 * level);
      this.rollBeat = x;
    }
  }

  /** A drop on its way: everything lets go on its bar, and the fader jumps to its deck. */
  private land(drop: DropState, key: string) {
    const ctxNow = this.sp.ctx.currentTime;
    let at: number | null = drop.bar >= 0 ? this.timeOfBeat(drop.bar * 4) : null;
    // the bars it was aimed at aren't this stream's (it started over), or the word came late:
    // the next bar line, or failing that the next beat
    if (at === null || at > ctxNow + 20 || at < ctxNow + 0.01) {
      const nb = this.nextBeat(0.01);
      if (!nb) return;
      at = at === null || at > ctxNow + 20 ? (this.timeOfBeat(Math.ceil(nb.b / 4) * 4) ?? nb.at) : nb.at;
    }
    this.dropKey = key;
    this.dropT = at;
    this.fx.drop(at);
    if (this.dj.decks) {
      const to = drop.to === "b" ? 1 : 0;
      this.sp.setXfade(to, at);
      this.fader = to;
      this.holdFader = at + 0.3;
    }
    const bn = this.beatNow();
    const t0 = this.timeOfBeat(0);
    this.log.push({ k: "drop", at, beat: t0 === null || bn === null ? NaN : (at - t0) / (60 / this.dj.bpm) });
  }

  /** Where the speaker's bars fall, on the server's clock: told to the room when it changes. */
  private reportGrid() {
    const nowMs = performance.now();
    if (nowMs - this.checked < 1000 || !this.on) return;
    this.checked = nowMs;
    const heard = this.dj.beat();
    if (!(heard > 0)) return;
    // a bar a little ahead of what's heard
    const bar = Math.ceil(heard / 4) + 1;
    const f = this.dj.beatFrame(bar * 4);
    const t = f === null ? null : this.sp.timeOfFrame(f);
    if (t === null) return;
    const at = this.now() + (t - this.sp.heardTime()) * 1000;
    const bpm = this.dj.bpm;
    const epoch = this.dj.epoch;
    const s = this.sent;
    if (s && s.epoch === epoch && s.bpm === bpm) {
      const predicted = s.at + ((bar - s.bar) * 4 * 60_000) / bpm;
      // near enough, or told only a moment ago: the room has it
      if (Math.abs(predicted - at) < 25 || nowMs - s.when < 5000) return;
    }
    this.sent = { at, bar, bpm, epoch, when: nowMs };
    this.sendGrid({ at: Math.round(at), bar, bpm });
  }
}
