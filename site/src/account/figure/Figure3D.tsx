import { useEffect, useRef } from "react";
import { glOf, ratioFor } from "../../party/dj/robot3d";
import type { MoveId } from "./moves";
import type { Stage } from "./FigureStage";

/** How the figure turned out, for the page and the checks (figure_check.py). */
export type FigureIs = "loading" | "on" | "none" | "software" | "failed";
/** What the page shows under the figure: the file's size, the model's triangles, frames a second, the engine's download. */
export type FigureStats = { kb: number; tris: number; fps: number; engineKb: number };

/** The checks' browsers draw WebGL in software only: they take the figure anyway. */
const anyGl = () => import.meta.env.DEV && (window as unknown as { __figAnyGl?: boolean }).__figAnyGl === true;
const tell = (is: FigureIs | null, move?: string) => {
  if (import.meta.env.DEV) {
    const w = window as unknown as { __figIs?: FigureIs; __figMove?: string };
    if (is) w.__figIs = is;
    if (move) w.__figMove = move;
  }
};

/** How much of three.js and the figure's code came down for this page (the files are named after their modules). */
function engineKb(): number {
  try {
    const rs = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const mine = rs.filter((r) => /three\.module|GLTFLoader|meshopt|FigurePage|Figure3D|FigureStage/i.test(r.name) && /\.js(\?|$)/.test(r.name));
    return Math.round(mine.reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0) / 1024);
  } catch {
    return 0;
  }
}

/**
 * The 3D figure (the prototype, Steve on Nov 13): one stand-in model with its moves, drawn with
 * three.js, which loads only here, after the page (FigureStage.ts). Drag sideways to turn it round;
 * swiping up and down still scrolls the page (touch-action: pan-y), and two fingers still zoom the
 * page. No graphics chip, or the model can't load: `onIs` says so and the page explains.
 */
export function Figure3D({ move, onIs, onStats }: { move: MoveId; onIs: (is: FigureIs) => void; onStats: (s: FigureStats) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const is = useRef(onIs);
  const stats = useRef(onStats);
  is.current = onIs;
  stats.current = onStats;
  const wanted = useRef<MoveId>(move);
  wanted.current = move;
  const stage = useRef<Stage | null>(null);

  useEffect(() => {
    stage.current?.play(move);
  }, [move]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const gl = glOf();
    if (gl === "none" || (gl === "software" && !anyGl())) {
      tell(gl);
      is.current(gl);
      return;
    }
    tell("loading");
    let gone = false;
    void (async () => {
      try {
        const { mountStage } = await import("./FigureStage");
        if (gone) return;
        const s = await mountStage(el, {
          ratio: ratioFor(el),
          first: wanted.current,
          onFirstFrame: () => {
            tell("on");
            is.current("on");
          },
          onStats: (x) => stats.current({ ...x, engineKb: engineKb() }),
          onMove: (id) => tell(null, id),
          flash: () => {
            const f = flash.current;
            if (!f) return;
            f.classList.remove("is-on");
            void f.offsetWidth;
            f.classList.add("is-on");
          },
        });
        if (gone) {
          s.dispose();
          return;
        }
        stage.current = s;
        // a move picked while it loaded
        s.play(wanted.current);
      } catch (e) {
        if (import.meta.env.DEV) console.error("figure", e);
        if (!gone) {
          tell("failed");
          is.current("failed");
        }
      }
    })();
    return () => {
      gone = true;
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  return (
    <div className="fig-canvas" ref={box}>
      <div className="fig-flash" ref={flash} aria-hidden="true" />
    </div>
  );
}
