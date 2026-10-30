import { Eraser, Undo2 } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useStore } from "../store";

type Stroke = { color: string; width: number; points: { x: number; y: number }[] };

export type DrawingPlateHandle = { clear: () => void };

const INKS = [
  { id: "chalk", color: "#f5f4fd" },
  { id: "pink", color: "#ff5fa2" },
  { id: "cyan", color: "#31b9ff" },
  { id: "lemon", color: "#f5df3b" },
  { id: "mint", color: "#4be38f" },
];

/**
 * A dark board you draw on with a finger in bright inks. Strokes are kept in memory so undo works.
 */
export const DrawingPlate = forwardRef<DrawingPlateHandle, { disabled?: boolean }>(function DrawingPlate({ disabled }, ref) {
  const { ui } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState(INKS[0].color);
  const [width, setWidth] = useState(6);
  const [, bump] = useState(0);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = current.current ? [...strokes.current, current.current] : strokes.current;
    for (const s of all) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
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
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
            current.current = { color, width, points: [pos(e)] };
            redraw();
          }}
          onPointerMove={(e) => {
            if (!current.current) return;
            current.current.points.push(pos(e));
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
        <div className="inks" role="radiogroup" aria-label="ink">
          {INKS.map((ink) => (
            <button
              key={ink.id}
              type="button"
              role="radio"
              aria-checked={color === ink.color}
              className={`swatch ${color === ink.color ? "ink-on" : ""}`}
              style={{ "--swatch": ink.color } as React.CSSProperties}
              onClick={() => setColor(ink.color)}
              aria-label={ink.id}
            />
          ))}
        </div>
        <div className="inks" role="radiogroup" aria-label="brush">
          {[4, 8, 14].map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={width === w}
              className={`brush ${width === w ? "ink-on" : ""}`}
              onClick={() => setWidth(w)}
              aria-label={`${w}`}
            >
              <span>
                <i style={{ width: w + 4, height: w + 4 }} />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="undo"
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
