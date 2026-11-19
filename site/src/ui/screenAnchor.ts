import { useLayoutEffect, type RefObject } from "react";

const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
/** An iPhone or an iPad (an iPad's Safari says it's a Mac, but has a touch screen). */
export const IOS =
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);

/**
 * Keeps an open layer on the screen by its own numbers instead of `position: fixed`, on an iPhone or
 * an iPad. Their Safari can lose track of where fixed things go after a while (a web app left in the
 * background, the keyboard put away): a game's card then opened at the top of the page, scrolled out
 * of sight (Steve, 2026-11-19). The layer is laid into the page where the screen is (the visual
 * viewport) and follows it while it's open: the keyboard coming up, the phone turning.
 * - "fill" covers the screen (a sheet's dimmed backdrop, with the sheet at its foot);
 * - "bottom" stands on the screen's bottom edge (a dialog that is itself the sheet).
 * Elsewhere `position: fixed` does the job, and nothing changes.
 */
export function useScreenAnchor(ref: RefObject<HTMLElement | null>, active: boolean, how: "fill" | "bottom") {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!IOS || !active || !el) return;
    const vv = window.visualViewport;
    const place = () => {
      const top = vv ? vv.pageTop : window.scrollY;
      const height = vv ? vv.height : window.innerHeight;
      el.style.position = "absolute";
      el.style.bottom = "auto";
      el.style.setProperty("--screen-h", `${height}px`);
      if (how === "fill") {
        el.style.top = `${top}px`;
        el.style.height = `${height}px`;
      } else {
        // its foot on the screen's: placed by its bottom edge, whatever its height
        el.style.top = `${top + height}px`;
        el.style.translate = "0 -100%";
      }
    };
    place();
    // the page under it can still move (the keyboard pushing it, a scroll that got through)
    const events: [EventTarget, string][] = [
      [window, "scroll"],
      [window, "resize"],
      [window, "pageshow"],
      [document, "visibilitychange"],
    ];
    if (vv) events.push([vv, "resize"], [vv, "scroll"]);
    for (const [t, e] of events) t.addEventListener(e, place, { passive: true });
    return () => {
      for (const [t, e] of events) t.removeEventListener(e, place);
    };
  }, [ref, active, how]);
}

/**
 * On an iPhone or an iPad, a finger dragged on an open layer doesn't scroll the page under it (that
 * would carry the page away from the layer): only what's inside `scrolls` (the sheet's own list) moves.
 */
export function useNoScrollUnder(ref: RefObject<HTMLElement | null>, active: boolean, scrolls: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!IOS || !active || !el) return;
    const stop = (e: TouchEvent) => {
      if (!(e.target instanceof Element && e.target.closest(scrolls))) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, [ref, active, scrolls]);
}
