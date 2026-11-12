import { Eraser, Undo2 } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { INK_COLORS } from "../shared/protocol";
import { useStore } from "../store";
import { BRUSHES, BRUSH_NAMES, INK_NAMES, PLATE_LABELS } from "./plateLabels";

/** A line: its points as 0..1 of the plate (x, y, x, y, …) and its width as a fraction of the plate. */
type Stroke = { color: string; width: number; points: number[] };

export type DrawingPlateHandle = { clear: () => void };

/**
 * A dark board you draw on with a finger in bright inks. Strokes are kept in memory so undo works,
 * as fractions of the board: turn the phone and the board changes size, the drawing with it.
 */
export const DrawingPlate = forwardRef<DrawingPlateHandle, { disabled?: boolean }>(function DrawingPlate({ disabled }, ref) {
  const { ui, tr } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [width, setWidth] = useState(BRUSHES[1]);
  const [, bump] = useState(0);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.width / dpr;
    const h = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = current.current ? [...strokes.current, current.current] : strokes.current;
    for (const s of all) {
      if (s.points.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, s.width * w);
      ctx.beginPath();
      ctx.moveTo(s.points[0] * w, s.points[1] * h);
      if (s.points.length === 2) ctx.lineTo(s.points[0] * w + 0.1, s.points[1] * h);
      for (let i = 2; i + 1 < s.points.length; i += 2) ctx.lineTo(s.points[i] * w, s.points[i + 1] * h);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokes.current = [];
      current.current = null;
      redraw();
      bump((n) => n + 1);
    },
  }));

  const pos = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [clamp((e.clientX - rect.left) / rect.width), clamp((e.clientY - rect.top) / rect.height)];
  };

  return (
    <div className="plate-draw">
      <div className={`plate-surface ${disabled ? "plate-disabled" : ""}`}>
        <canvas
          ref={canvasRef}
          className="plate-canvas"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            if (disabled) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            current.current = { color, width, points: pos(e) };
            redraw();
          }}
          onPointerMove={(e) => {
            if (!current.current) return;
            current.current.points.push(...pos(e));
            redraw();
          }}
          onPointerUp={() => {
            if (!current.current) return;
            strokes.current.push(current.current);
            current.current = null;
            redraw();
            bump((n) => n + 1);
          }}
          onPointerCancel={() => {
            current.current = null;
            redraw();
          }}
        />
      </div>
      <div className="plate-tools">
        <div className="inks" role="radiogroup" aria-label={tr(PLATE_LABELS.inks)}>
          {INK_COLORS.map((ink, i) => (
            <button
              key={ink}
              type="button"
              role="radio"
              aria-checked={color === ink}
              className={`swatch ${color === ink ? "ink-on" : ""}`}
              style={{ "--swatch": ink } as React.CSSProperties}
              onClick={() => setColor(ink)}
              aria-label={tr(INK_NAMES[i])}
            />
          ))}
        </div>
        <div className="inks" role="radiogroup" aria-label={tr(PLATE_LABELS.brushes)}>
          {BRUSHES.map((w, i) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={width === w}
              className={`brush ${width === w ? "ink-on" : ""}`}
              onClick={() => setWidth(w)}
              aria-label={tr(BRUSH_NAMES[i])}
            >
              <span>
                <i style={{ width: 6 + i * 5, height: 6 + i * 5 }} />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={tr(PLATE_LABELS.undo)}
          onClick={() => {
            strokes.current.pop();
            redraw();
            bump((n) => n + 1);
          }}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={ui("reset")}
          onClick={() => {
            strokes.current = [];
            redraw();
            bump((n) => n + 1);
          }}
        >
          <Eraser size={18} />
        </button>
      </div>
    </div>
  );
});

const clamp = (n: number) => Math.min(1, Math.max(0, n));
