/**
 * 打碟 · DJ Booth: the beginner deck on the speaker. The room keeps what the table does (the pads
 * pressed, the build-up, the drop and its bar, the fader); this turns it into sound, every bit of it
 * on the beat: a pad starts on the next beat, the build-up's roll falls on the grid, the drop lands
 * on its bar, the crossfader jumps with it. It also tells the room where the speaker's bars fall, so
 * every phone counts down to the same moment the room hears.
 *
 * Times here are audio times (the speaker's context) unless they say server.
 */
import { beatsLeft, chargeNow, COUNT_SPAN } from "../../../shared/dj/deck";
import { hasB, onAir } from "../../../shared/dj/deck";
import type { DeckSide, DropState, PadId } from "../../../shared/dj/types";
import type { DeckView } from "../../../shared/protocol";
import { DeckFx } from "../speaker/fx";
import type { Speaker } from "../speaker/speaker";

/** Whichever DJ plays, as far as the deck needs it (useBooth's BoothDj). */
export type DeckDj = { readonly decks: boolean; readonly bpm: number; readonly epoch: number; beat(): number; beatFrame(b: number): number | null; cue?(side: DeckSide, beat: number): void };
export type Grid = { at: number; bar: number; bpm: number };

/** How far ahead the roll is written, seconds. */
const ROLL_AHEAD = 0.3;
/** How far up the build-up goes as the table fills it; the countdown takes it the rest of the way. */
const FILLED = 0.85;
/**
 * The bars: the room's are these when they put the next bar within this much of a beat of where
 * the speaker hears it (the room itself takes a twentieth as the same). Said again at most every
 * GRID_AGAIN_MS until the room has them (a word lost, or turned away), and every GRID_STILL_MS
 * anyway, which tells the room this screen is still the speaker.
 */
const GRID_SAME = 0.06;
const GRID_AGAIN_MS = 1500;
const GRID_STILL_MS = 10_000;

export class DeckDriver {
  private fx: DeckFx;
  private deck: DeckView | null = null;
  private on = false;
  private timer = 0;
  private dropKey = "";
  /** the drop the DJ was last told is on its way (the host's songs: the song it goes into is cued for its bar) */
  private cueKey = "";
  /** when the drop lands (0: none on its way); the room's fader waits until the room says it landed */
  private dropT = 0;
  private holdFader = 0;
  private holdBar: number | null = null;
  private fader = -1;
  private level = -1;
  private rollBeat = -Infinity;
  private brakeUntil = 0;
  private sentAt = 0;
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
    this.fx.dispose();
    this.sp.setXfade(0);
  }

  private note(k: string, at: number, beat: number) {
    this.log.push({ k, at, beat });
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
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
    else if (pad === "siren") done = this.fx.siren(nb.at, beat);
    else if (pad === "laser") done = this.fx.laser(nb.at, beat);
    else if (pad === "brake" || pad === "rewind" || pad === "scratch") {
      // a move of the music itself: never into a drop, never on top of another. The brake slows to
      // a stop over most of a beat and the rewind spins back over a beat, both quiet until the next
      // bar line and back on its downbeat; the scratch goes back and forth for a beat and comes
      // back on the next one
      if (this.dropT > this.sp.ctx.currentTime || nb.at < this.brakeUntil) return;
      const until = pad === "scratch" ? nb.at + beat : this.timeOfBeat(Math.ceil((nb.b + 1) / 4) * 4);
      if (until === null) return;
      this.sp.move(pad, nb.at, pad === "brake" ? 0.75 * beat : beat, until);
      this.brakeUntil = until;
      done = true;
    }
    if (done) this.note(pad, nb.at, nb.b);
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

    // the crossfader: the room's (Lyria, or no deck B: deck A alone), except from a drop's jump
    // until the room says it landed (or a few seconds, if that word never comes)
    if (this.holdBar !== null && (!d.drop || d.last?.bar === this.holdBar || ctxNow > this.holdFader)) this.holdBar = null;
    const want = this.dj.decks && hasB(d) ? d.fader : 0;
    if (this.holdBar === null && want !== this.fader) {
      this.sp.setXfade(want);
      this.fader = want;
    }

    if (!this.on) return;

    // a drop on its way into the deck off the air: the DJ cues that deck for its bar (a host's
    // song's loud part lands on it), as soon as the countdown starts and again if it's moved
    if (d.drop && d.drop.bar >= 0 && d.drop.to !== onAir(d)) {
      const key = this.keyOf(d.drop);
      if (key !== this.cueKey) {
        this.cueKey = key;
        this.dj.cue?.(d.drop.to, d.drop.bar * 4);
      }
    }
    // the drop: once someone pressed in time (or the DJ will), on its bar
    if (d.drop && (d.drop.hits.length || d.drop.auto)) {
      const key = this.keyOf(d.drop);
      if (key !== this.dropKey) this.land(d.drop, key);
    }
    // landed: the room says so a moment later, until then the build-up stays down (or the room
    // moved that drop to new bars, a new stream: its countdown builds up again)
    if (this.dropT && ctxNow >= this.dropT && (!d.drop || this.keyOf(d.drop) !== this.dropKey)) this.dropT = 0;
    const landing = this.dropT > 0;
    // the build-up: most of the way as the table taps it full, the countdown the rest of the way to
    // the drop; the roll in quarters, eighths once it's half full and through the count, sixteenths
    // in the count's last two bars
    const charge = chargeNow(d, this.now());
    const left = d.drop ? beatsLeft(d.drop, d.grid, this.now()) : Infinity;
    const counted = Math.max(0, Math.min(1, 1 - left / COUNT_SPAN));
    const level = landing ? (ctxNow < this.dropT ? 1 : 0) : d.drop ? FILLED + (1 - FILLED) * counted : FILLED * charge;
    if (Math.abs(level - this.level) > 0.004) {
      this.fx.build(level);
      this.level = level;
    }
    this.roll(level, landing || left <= 8 ? 0.25 : d.drop || charge >= 0.5 ? 0.5 : 1);
  }

  /** The same bar of the same stream is the same drop, however its time is corrected. */
  private keyOf(drop: DropState) {
    return drop.bar >= 0 ? `${drop.bar}:${this.dj.epoch}` : `t${drop.at}`;
  }

  /** The snare roll under the build-up, every `step` beats, louder as it climbs. */
  private roll(level: number, step: number) {
    const ctxNow = this.sp.ctx.currentTime;
    if (level < 0.05) {
      this.rollBeat = -Infinity;
      return;
    }
    const bn = this.beatNow();
    if (bn === null) return;
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
    // the word came a moment late (a slow network, a speaker that works far ahead): at once, which
    // the ear takes as on the bar; later than that, the next beat
    if (at !== null && at < ctxNow + 0.01 && at > ctxNow - 0.15) at = ctxNow + 0.01;
    // the bars it was aimed at aren't this stream's (it started over), or it's long gone: the next
    // bar line, or failing that the next beat
    if (at === null || at > ctxNow + 20 || at < ctxNow + 0.01) {
      const nb = this.nextBeat(0.01);
      if (!nb) return;
      at = at === null || at > ctxNow + 20 ? (this.timeOfBeat(Math.ceil(nb.b / 4) * 4) ?? nb.at) : nb.at;
    }
    this.dropKey = key;
    this.dropT = at;
    this.fx.drop(at);
    if (this.dj.decks) {
      const to = drop.to === "b" && this.deck && hasB(this.deck) ? 1 : 0;
      this.sp.setXfade(to, at);
      this.fader = to;
      this.holdBar = drop.bar;
      this.holdFader = at + 3;
    }
    const t0 = this.timeOfBeat(0);
    this.note("drop", at, t0 === null ? NaN : (at - t0) / (60 / this.dj.bpm));
  }

  /**
   * Where the speaker's bars fall, on the server's clock, told to the room whenever the room's bars
   * aren't these (a new stream, a drift, a stall, a word that never arrived), countdown or not: the
   * room keeps a drop's bar and its presses through a correction.
   */
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
    const beatMs = 60_000 / bpm;
    const room = this.deck?.grid;
    const same = !!room && room.bpm === bpm && Math.abs(room.at + (bar - room.bar) * 4 * beatMs - at) < GRID_SAME * beatMs;
    if (nowMs - this.sentAt < (same ? GRID_STILL_MS : GRID_AGAIN_MS)) return;
    this.sentAt = nowMs;
    this.sendGrid({ at: Math.round(at), bar, bpm });
  }
}
