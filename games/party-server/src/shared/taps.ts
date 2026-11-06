// A phone's judge: its player's moves against the beats the room hears. For now a move is a tap on
// the phone's big button (the plan's 假体感: the button stands in for the motion sensor); task A2
// feeds it the motion sensor's peaks instead (party-base's energyPeaks), and nothing else changes.
// It settles each scored beat once its window has closed (party-base's scoring windows: the beat
// counts as hit within WINDOW_MS, as moved within twice that) and gathers the dance's beats into
// the bars the phone sends the room. Pure: the phone page drives it with its clock, the tests by hand.
import { WINDOW_MS, nearestPeakOffset, type Difficulty } from "../../../party-base/src/index";
import type { RunBeat } from "./show";

/** hit: on the beat. close: a move near it, outside the strict window. miss: no move near it. */
export type Verdict = "hit" | "close" | "miss";

export interface Judged {
  /** the beat's index in the run */
  i: number;
  beat: RunBeat;
  /** the move's distance from the beat in ms (negative: early); null: no move near it */
  off: number | null;
  verdict: Verdict;
}

/** Beats of the dance for the room: `offs[k]` is dance beat `from + k`. */
export interface Batch {
  from: number;
  offs: (number | null)[];
}

/** A beat counts as moved when a move is this close to it (party-base's scoreBeats). */
export const movedWindowMs = (d: Difficulty) => Math.min(300, WINDOW_MS[d] * 2);
/** A batch holds at most this many beats (a bar is 4; protocol.ts lets the room take 16). */
const MAX_BATCH = 8;

export class BeatJudge {
  private moves: number[] = [];
  private next = 0;
  private pending: Batch | null = null;
  private ready: Batch[] = [];
  private win: number;
  /** The player has moved on a scored beat in this run: from then on, the phone sends its dance beats. */
  dancing = false;

  /**
   * `run`: the beats as the room hears them (show.ts's planRun with the TV's delay), in speaker
   * time. `since`: when this phone started listening; a beat whose window opened before it is
   * neither judged nor sent.
   */
  constructor(
    readonly run: readonly RunBeat[],
    readonly difficulty: Difficulty,
    readonly since: number,
  ) {
    this.win = movedWindowMs(difficulty);
  }

  /** A move at speaker time t. */
  move(t: number): void {
    if (!Number.isFinite(t)) return;
    this.moves.push(t);
  }

  /** Every scored beat whose window has closed by `now` (speaker time), oldest first. */
  settle(now: number): Judged[] {
    const out: Judged[] = [];
    while (this.next < this.run.length && this.run[this.next]!.t + this.win < now) {
      const i = this.next++;
      const beat = this.run[i]!;
      if (!beat.score || beat.t - this.win < this.since) continue;
      const off = nearestPeakOffset(this.moves, beat.t, this.win);
      const verdict: Verdict = off === null ? "miss" : Math.abs(off) <= WINDOW_MS[this.difficulty] ? "hit" : "close";
      if (off !== null) this.dancing = true;
      out.push({ i, beat, off: off === null ? null : Math.round(off), verdict });
      if (beat.danceBeat !== null && this.dancing) this.keep(beat.danceBeat, off === null ? null : Math.round(off));
    }
    // (moves too old for any beat still to settle)
    const oldest = (this.run[this.next]?.t ?? now) - this.win;
    if (this.moves.length && this.moves[0]! < oldest) this.moves = this.moves.filter((m) => m >= oldest);
    return out;
  }

  /** The dance's beats ready to go to the room: whole bars, a cut-off run of beats, or (`all`) what's left. */
  take(all = false): Batch[] {
    if (all && this.pending) this.close();
    const r = this.ready;
    this.ready = [];
    return r;
  }

  /** Every beat of the run is behind it. */
  get done(): boolean {
    return this.next >= this.run.length;
  }

  private keep(danceBeat: number, off: number | null): void {
    const p = this.pending;
    if (p && danceBeat !== p.from + p.offs.length) this.close();
    if (!this.pending) this.pending = { from: danceBeat, offs: [] };
    this.pending.offs.push(off);
    if (danceBeat % 4 === 3 || this.pending.offs.length >= MAX_BATCH) this.close();
  }

  private close(): void {
    if (this.pending?.offs.length) this.ready.push(this.pending);
    this.pending = null;
  }
}
