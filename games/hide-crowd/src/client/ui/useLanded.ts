// The round's last blow lands before anything covers the arena: once the round is over, wait a
// moment (the final knock-down plays in slow motion, Arena3D) before the penalty and the results.
import { useEffect, useState } from "preact/hooks";
import { reducedNow } from "../prefs";

export const LANDING_MS = 1_400;

/** True once `over` has held for a moment (at once with reduced motion: nothing to watch then). */
export function useLanded(over: boolean, round: number): boolean {
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
    const timer = window.setTimeout(() => setLanded(true), LANDING_MS);
    return () => window.clearTimeout(timer);
  }, [over, round]);
  return landed;
}
