import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * A new moment starts at the top of the screen. The page kept its scroll from the moment before
 * (the last voter had scrolled a long ballot to its end, and the reveal opened down there with the
 * winner hidden under the top bar); on a phone held sideways the frame's body scrolls instead, so
 * every scrolling ancestor of `inside` goes back to the top too.
 */
export function useTopOfMoment(moment: string, inside: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    for (let el = inside.current?.parentElement; el; el = el.parentElement) if (el.scrollTop) el.scrollTop = 0;
  }, [moment, inside]);
}

/** how long the bottom bar's new button belongs to the tap that brought it */
const FRESH_MS = 350;

/**
 * The bottom bar's button changes with the moment, in the same place: the second tap of a quick
 * double tap on "Start" or "Next award" used to land on the "I'm Mia" that took its place and open
 * her ballot with no hand-over. For its first 350 ms the new button is `aria-disabled` (a script
 * driving the screen waits for that to clear; the look doesn't change) and `guard` drops the tap.
 */
export function useFreshTapGuard(moment: string) {
  const [fresh, setFresh] = useState(true);
  const since = useRef(0);
  useLayoutEffect(() => {
    since.current = performance.now();
    setFresh(true);
    const timer = window.setTimeout(() => setFresh(false), FRESH_MS);
    return () => window.clearTimeout(timer);
  }, [moment]);
  const guard = (fn: () => void) => () => {
    if (performance.now() - since.current < FRESH_MS) return;
    fn();
  };
  return { fresh: fresh || undefined, guard };
}
