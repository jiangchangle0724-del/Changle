import { Eraser, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { INK_COLORS, type Stroke } from "../shared/protocol";
import { useStore } from "../store";
import { useRoom } from "./RoomContext";

const INK_NAMES = ["cobalt", "ink", "vermilion", "jade", "gold"];
/** Brush widths as a fraction of the plate, so a stroke looks the same on every phone. */
const BRUSHES = [0.012, 0.024, 0.042];
const FLUSH_MS = 45;

/**
 * The porcelain drawing plate, shared: the drawer's strokes stream to every phone as they are drawn.
 * Coordinates travel as 0..1 of the plate, so phones of any size see the same drawing.
 */
export function NetPlate({ canDraw }: { canDraw: boolean }) {
  const { strokes, stroke, sendStroke } = useRoom();
  const { ui } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [width, setWidth] = useState(BRUSHES[1]);
  const drawing = useRef<{ id: string; pending: number[]; timer: number | null } | null>(null);

  // draw whatever the store holds, at most once a frame
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const size = c.width / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of strokes.list) drawStroke(ctx, s, size);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.width * dpr);
      paint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    const off = strokes.subscribe(schedule);
    return () => {
      off();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strokes]);

  const at = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [round(clamp(x)), round(clamp(y))];
  };

  const flush = () => {
    const d = drawing.current;
    if (!d) return;
    if (d.timer !== null) window.clearTimeout(d.timer);
    d.timer = null;
    if (d.pending.length) {
      sendStroke({ o: "p", id: d.id, p: d.pending });
      d.pending = [];
    }
  };

  const end = () => {
    const d = drawing.current;
    if (!d) return;
    flush();
    sendStroke({ o: "e", id: d.id });
    drawing.current = null;
  };

  return (
    <div className="plate-draw">
      <div className={`plate-surface ${canDraw ? "" : "plate-watch"}`}>
        <canvas
          ref={canvasRef}
          className="plate-canvas"
          style={{ touchAction: canDraw ? "none" : "auto", cursor: canDraw ? "crosshair" : "default" }}
          onPointerDown={(e) => {
            if (!canDraw) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const id = Math.random().toString(36).slice(2, 10);
            drawing.current = { id, pending: [], timer: null };
            stroke({ o: "b", id, c: color, w: width, p: at(e) });
          }}
          onPointerMove={(e) => {
            const d = drawing.current;
            if (!d) return;
            // coalesced events keep fast strokes smooth on phones that batch touch input
            const list = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const pts = list.length ? list.map((p) => [round(clamp((p.clientX - rect.left) / rect.width)), round(clamp((p.clientY - rect.top) / rect.height))]) : [at(e)];
            for (const [x, y] of pts) d.pending.push(x, y);
            // draw locally at once; send in small batches
            strokes.apply({ o: "p", id: d.id, p: pts.flat() });
            if (d.pending.length >= 120) flush();
            else if (d.timer === null) d.timer = window.setTimeout(flush, FLUSH_MS);
          }}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      {canDraw && (
        <div className="plate-tools">
          <div className="inks" role="radiogroup" aria-label="ink">
            {INK_COLORS.map((ink, i) => (
              <button
                key={ink}
                type="button"
                role="radio"
                aria-checked={color === ink}
                className={`swatch ${color === ink ? "ink-on" : ""}`}
                style={{ "--swatch": ink } as React.CSSProperties}
                onClick={() => setColor(ink)}
                aria-label={INK_NAMES[i]}
              />
            ))}
          </div>
          <div className="inks" role="radiogroup" aria-label="brush">
            {BRUSHES.map((w, i) => (
              <button key={w} type="button" role="radio" aria-checked={width === w} className={`brush ${width === w ? "ink-on" : ""}`} onClick={() => setWidth(w)} aria-label={`${i + 1}`}>
                <span>
                  <i style={{ width: 6 + i * 5, height: 6 + i * 5 }} />
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label="undo" onClick={() => stroke({ o: "u" })}>
            <Undo2 size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label={ui("reset")} onClick={() => stroke({ o: "c" })}>
            <Eraser size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, size: number) {
  if (s.p.length < 2) return;
  ctx.strokeStyle = s.c;
  ctx.lineWidth = Math.max(1, s.w * size);
  ctx.beginPath();
  ctx.moveTo(s.p[0] * size, s.p[1] * size);
  if (s.p.length === 2) ctx.lineTo(s.p[0] * size + 0.1, s.p[1] * size);
  for (let i = 2; i + 1 < s.p.length; i += 2) ctx.lineTo(s.p[i] * size, s.p[i + 1] * size);
  ctx.stroke();
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 1000) / 1000;
