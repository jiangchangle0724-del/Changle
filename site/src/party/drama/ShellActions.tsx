import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const DramaActionHost = createContext<HTMLElement | null>(null);

/** Only the one-phone game sends a private card or ballot's own button to the shell. */
export function DramaAction({ children, inShell = false }: { children: ReactNode; inShell?: boolean }) {
  const host = useContext(DramaActionHost);
  return inShell ? (host ? createPortal(children, host) : null) : children;
}

/**
 * A quick double tap's second tap lands on whatever the next screen has in the same place: on one
 * phone the buttons sit in one spot at the bottom, and online a new button is scrolled up to where
 * the finger is. So for a moment after the screen changes (`screen` is anything that names it),
 * the handlers wrapped in `settle` let no tap through. The screen a game opens on doesn't wait.
 */
export function useSettle(screen: string, ms = 600) {
  const since = useRef(Number.NEGATIVE_INFINITY);
  const last = useRef(screen);
  useLayoutEffect(() => {
    if (last.current === screen) return;
    last.current = screen;
    since.current = performance.now();
  }, [screen]);
  return useCallback(
    <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (performance.now() - since.current >= ms) fn(...args);
      },
    [ms],
  );
}
