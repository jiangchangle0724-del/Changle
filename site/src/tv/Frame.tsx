import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "../styles/tv.css";

/** How much the 1600x900 canvas is scaled to fit a box this size. */
const fitOf = (w: number, h: number) => Math.min(w / 1600, h / 900);

/**
 * While the big screen's picture is up, two fingers don't zoom it (tv.css). A page that is zoomed
 * in already says so (`is-zoomed` on the page), so it can still be pinched back out.
 */
export function useNoPinch() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const check = () => root.classList.toggle("is-zoomed", vv.scale > 1.01);
    check();
    vv.addEventListener("resize", check);
    return () => {
      vv.removeEventListener("resize", check);
      root.classList.remove("is-zoomed");
    };
  }, []);
}

/**
 * The TV's canvas, also used while the rest of its files download. `outside` goes on the screen
 * itself, next to the canvas, in the page's own units (a word for a phone held upright).
 *
 * The scale follows the box the canvas sits in, as the browser lays it out (Steve on Nov 14, the
 * DJ booth's shared phone: sometimes the stage came up small in the middle after the phone turned
 * sideways, or too big with its top and bottom cut off). An iPhone can tell a page its new size a
 * moment after it turns, so the box is watched, and looked at again a moment after a turn.
 */
export function Fit({ children, outside }: { children: ReactNode; outside?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(() => fitOf(window.innerWidth, window.innerHeight));
  useNoPinch();
  useLayoutEffect(() => {
    const el = box.current;
    const fit = () => {
      const w = el?.clientWidth || window.innerWidth;
      const h = el?.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) setK(fitOf(w, h));
    };
    fit();
    let later: number[] = [];
    const turned = () => {
      fit();
      later.forEach((id) => window.clearTimeout(id));
      later = [150, 500, 1200].map((ms) => window.setTimeout(fit, ms));
    };
    window.addEventListener("resize", turned);
    window.addEventListener("orientationchange", turned);
    window.visualViewport?.addEventListener("resize", turned);
    const seen = typeof ResizeObserver === "undefined" || !el ? null : new ResizeObserver(fit);
    if (el) seen?.observe(el);
    return () => {
      window.removeEventListener("resize", turned);
      window.removeEventListener("orientationchange", turned);
      window.visualViewport?.removeEventListener("resize", turned);
      seen?.disconnect();
      later.forEach((id) => window.clearTimeout(id));
    };
  }, []);
  return (
    <div className="tv-fit" ref={box}>
      <div className="tv-canvas" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>{children}</div>
      {outside}
    </div>
  );
}
