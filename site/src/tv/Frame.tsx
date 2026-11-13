import { useLayoutEffect, useState, type ReactNode } from "react";
import "../styles/tv.css";

/**
 * The TV's canvas, also used while the rest of its files download. `outside` goes on the screen
 * itself, next to the canvas, in the page's own units (a word for a phone held upright).
 */
export function Fit({ children, outside }: { children: ReactNode; outside?: ReactNode }) {
  const [k, setK] = useState(() => Math.min(window.innerWidth / 1600, window.innerHeight / 900));
  useLayoutEffect(() => {
    const fit = () => setK(Math.min(window.innerWidth / 1600, window.innerHeight / 900));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="tv-fit">
      <div className="tv-canvas" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>{children}</div>
      {outside}
    </div>
  );
}
