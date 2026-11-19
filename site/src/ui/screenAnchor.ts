import { useLayoutEffect, type RefObject } from "react";

const ua = navigator.userAgent;
/** An iPhone or an iPad (an iPad's Safari says it's a Mac, but has a touch screen). */
export const IOS = /iP(hone|ad|od)/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);

/**
 * Keeps an open layer on the screen by its own numbers instead of `position: fixed`, on an iPhone or
 * an iPad. Their Safari can lose track of where fixed things go after a while (a web app left in the
 * background, the keyboard put away): a game's card then opened at the top of the page, scrolled out
 * of sight (Steve, 2026-11-19). The layer is laid into the page where the screen is (the visual
 * viewport) and follows it while it's open: the keyboard coming up, the phone turning.
 * - by default it covers the screen (a sheet's dimmed backdrop, with the sheet at its foot);
 * - `bottom`: it stands on the screen's bottom edge, whatever its height (a dialog that is the sheet).
 * `scrolls`: a finger dragged anywhere else on the layer doesn't scroll the page away under it; only
 * what's inside this (the sheet's own list) moves.
 * Elsewhere `position: fixed` does the job, and nothing changes. (Kept small: it's in the home page's
 * first download.)
 */
export function useScreenAnchor(ref: RefObject<HTMLElement | null>, active: boolean, bottom?: boolean, scrolls?: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!IOS || !active || !el || !vv) return;
    const s = el.style;
    const place = () => {
      s.position = "absolute";
      s.bottom = "auto";
      s.setProperty("--screen-h", vv.height + "px");
      s.top = vv.pageTop + (bottom ? vv.height : 0) + "px";
      if (bottom) s.translate = "0 -100%";
      else s.height = vv.height + "px";
    };
    const stop = (e: TouchEvent) => {
      if (scrolls && !(e.target as Element).closest?.(scrolls)) e.preventDefault();
    };
    const on = ["scroll", "resize"];
    place();
    for (const t of on) {
      window.addEventListener(t, place);
      vv.addEventListener(t, place);
    }
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      for (const t of on) {
        window.removeEventListener(t, place);
        vv.removeEventListener(t, place);
      }
      el.removeEventListener("touchmove", stop);
    };
  }, [ref, active, bottom, scrolls]);
}
