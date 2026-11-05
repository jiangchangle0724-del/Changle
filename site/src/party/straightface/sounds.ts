/**
 * 一本正经's sound cues: a game-show night built from the site's own synthesised sounds (lib/sfx),
 * so there are no sound files and nothing to license. Every cue respects the sound setting; the
 * timers tick and buzz on their own (TimerArc).
 */
import { sfx } from "../../lib/sfx";

const later = (ms: number, f: () => void) => window.setTimeout(f, ms);

export const cue = {
  /** the deck is shuffled and a card slides out */
  deal() {
    sfx.shuffle();
    later(320, () => sfx.cardSlide());
  },
  /** the word goes up for the whole table */
  termUp() {
    later(380, () => sfx.showtime(0.6));
  },
  /** the phone changes hands */
  handOff() {
    sfx.whoosh();
  },
  /** the next person stands up to explain */
  speakerUp() {
    sfx.yourTurn();
  },
  /** the judge pins a suspect */
  tag() {
    sfx.stamp(0.9);
  },
  /** one more bet goes in; the pitch climbs with each */
  bet(step: number) {
    sfx.vote(step);
  },
  /** the judge names someone: a drumroll before the truth */
  accuse() {
    sfx.drumroll(1.2, 0.8);
  },
  /** the honest one is shown: the judge was right, or was fooled */
  verdict(judgeRight: boolean) {
    if (judgeRight) {
      sfx.correct();
      later(250, () => sfx.applause(1.4, 0.55));
    } else {
      sfx.sadTrombone(0.8);
    }
  },
  /** the points land */
  points() {
    sfx.count(0.7);
  },
  /** the bluffer who fooled the judge gets to pick */
  master() {
    sfx.crown();
  },
  /** the last round is done */
  finale() {
    sfx.win();
    later(400, () => sfx.cheer(2, 0.6));
  },
};
