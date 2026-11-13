// The round's last blow lands before anything covers the arena: once the round is over, wait a
// moment (the final knock-down plays in slow motion, Arena3D) before the penalty and the results.
// When someone won, a little longer: the camera comes down to the winner and the confetti flies
// (cinema.ts, which takes its timing from here).
import { useEffect, useState } from "preact/hooks";
import { reducedNow } from "../prefs";

export const LANDING_MS = 1_400;
/** after the round ends, when the camera starts down to the winner, and how long it takes */
export const CLOSE_AFTER_MS = 1_200;
export const CLOSE_MS = 1_100;
/** with a winner: the slow-motion blow, the move down to them, and a moment of the confetti */
export const LANDING_WINNER_MS = CLOSE_AFTER_MS + CLOSE_MS + 1_100;

/** True once `over` has held for a moment (at once with reduced motion: nothing to watch then). */
export function useLanded(over: boolean, round: number, winner = false): boolean {
  const [landed, setLanded] = useState(over);
  useEffect(() => {
    if (!over) {
      setLanded(false);
      return;
    }
    if (reducedNow()) {
      setLanded(true);
      return;
    }
    const timer = window.setTimeout(() => setLanded(true), winner ? LANDING_WINNER_MS : LANDING_MS);
    return () => window.clearTimeout(timer);
  }, [over, round, winner]);
  return landed;
}
