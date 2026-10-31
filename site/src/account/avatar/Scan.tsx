import { useEffect, useRef } from "react";
import { reduced } from "../../lib/anim";

export type ScanState =
  | { stage: "load"; photo: string; progress: number }
  | { stage: "read"; photo: string }
  | { stage: "mesh"; photo: string; pic: HTMLCanvasElement; pts: [number, number][] }
  | { stage: "fail"; photo: string; why: "no-face" | "load" | "blocked" };

const SIZE = 232;

/**
 * The photo while it's being read: in a round frame, a ring filling while the reading kit downloads,
 * a band of light passing over while it looks, then the points it found on the face, lit one row
 * after another, before the drawing takes its place.
 */
export function Scan({ s, zh, onMeshDone }: { s: ScanState; zh: boolean; onMeshDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onMeshDone);
  done.current = onMeshDone;

  useEffect(() => {
    if (s.stage !== "mesh" || !canvas.current) return;
    const cv = canvas.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.round(SIZE * dpr);
    cv.width = cv.height = S;
    const ctx = cv.getContext("2d")!;
    const { pic, pts } = s;
    // frame the face: a square round the points, with room for the hair
    const xs = pts.map((p) => p[0] * pic.width);
    const ys = pts.map((p) => p[1] * pic.height);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const side = Math.max(x1 - x0, y1 - y0) * 1.75;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - (y1 - y0) * 0.1;
    const sx = cx - side / 2;
    const sy = cy - side / 2;
    const k = S / side;
    // every other point, top to bottom (they light up in that order)
    const dots = pts
      .filter((_, i) => i % 2 === 0)
      .map((p) => [(p[0] * pic.width - sx) * k, (p[1] * pic.height - sy) * k] as const)
      .sort((a, b) => a[1] - b[1]);
    const gel = getComputedStyle(cv).getPropertyValue("--gel").trim() || "#ff9cc5";
    const paint = (shown: number) => {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(pic, sx, sy, side, side, 0, 0, S, S);
      ctx.fillStyle = "rgba(14, 12, 34, 0.38)";
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = gel;
      ctx.shadowColor = gel;
      ctx.shadowBlur = 5 * dpr;
      const r = 1.35 * dpr;
      for (let i = 0; i < shown; i++) {
        ctx.beginPath();
        ctx.arc(dots[i][0], dots[i][1], r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };
    if (reduced()) {
      paint(dots.length);
      const t = window.setTimeout(() => done.current(), 700);
      return () => window.clearTimeout(t);
    }
    const t0 = performance.now();
    const RISE = 760;
    const HOLD = 520;
    let raf = 0;
    const tick = (now: number) => {
      const t = now - t0;
      const f = Math.min(1, t / RISE);
      paint(Math.round(dots.length * (1 - Math.pow(1 - f, 2))));
      if (t < RISE + HOLD) raf = requestAnimationFrame(tick);
      else done.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  const ring = 2 * Math.PI * (SIZE / 2 + 9);
  const status =
    s.stage === "load"
      ? zh
        ? `第一次用，先准备一下 ${Math.round(s.progress * 100)}%`
        : `Getting ready, first time only ${Math.round(s.progress * 100)}%`
      : s.stage === "read"
        ? zh
          ? "在看你的样子"
          : "Looking at your photo"
        : s.stage === "mesh"
          ? zh
            ? "看清楚了"
            : "Got it"
          : s.why === "no-face"
            ? zh
              ? "这张里没找到脸"
              : "No face in this one"
            : s.why === "blocked"
              ? zh
                ? "这里没法读照片"
                : "Photos can't be read here"
              : zh
                ? "没下载好"
                : "The download didn't finish";

  return (
    <div className={`mk-scan is-${s.stage}`} role="status" aria-live="polite">
      <div className="mk-scan-frame">
        {s.stage === "mesh" ? <canvas ref={canvas} className="mk-scan-pic" /> : <img src={s.photo} alt="" className="mk-scan-pic" />}
        {s.stage === "read" && <span className="mk-scan-beam" aria-hidden="true" />}
        <svg className="mk-scan-ring" viewBox={`0 0 ${SIZE + 24} ${SIZE + 24}`} aria-hidden="true">
          <circle cx={SIZE / 2 + 12} cy={SIZE / 2 + 12} r={SIZE / 2 + 9} className="mk-scan-track" />
          {s.stage === "load" && (
            <circle cx={SIZE / 2 + 12} cy={SIZE / 2 + 12} r={SIZE / 2 + 9} className="mk-scan-fill" strokeDasharray={ring} strokeDashoffset={ring * (1 - s.progress)} />
          )}
        </svg>
      </div>
      <p className="mk-scan-status tabular">{status}</p>
    </div>
  );
}
