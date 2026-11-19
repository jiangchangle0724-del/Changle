import { useEffect, useRef, useState, type ReactNode } from "react";
import { reduced } from "../../../lib/anim";
import { barAngleAt } from "../../../shared/engine/games/limbo";
import type { Sway } from "../parts";
import type { FigurePose } from "./figure";
import { ratio, watchFrames } from "./gl";
import type { FigureSpec, World } from "./world";

/** Someone on the stage: their colour and name, what they're doing, and (their own phone) how far back they really are. */
export type StageFigure = { id: string; color: string; name: string; pose: FigurePose; lean?: number; side?: number; full?: boolean };

export type Scene3DProps = { angle: number; side?: number; sway?: Sway; figures: StageFigure[]; label: string; onFail: () => void; placeholder?: ReactNode };

/** In its first seconds, frames mostly slower than this: a chip too weak for it, the drawn scene instead. */
const SLOW_MS = 50;
const WATCH_MS = 2500;
const WATCH_FRAMES = 10;

type Latest = { angle: number; side: number; sway: Sway | undefined; figures: StageFigure[] };

/**
 * The limbo stage in 3D (Steve, Nov 18: "做 3D 建模，更贴切更真实的动画效果"): the stands, the bar and
 * the players, built in world.ts. three.js loads only here, after the page. No graphics chip, frames
 * too slow, or three.js can't load: `onFail`, and the drawn scene takes over. Every frame it hands
 * the world what the game wants now: the bar's angle (a moving bar's, from the shared start time),
 * who stands under it and how far back each is leaning. `placeholder` (the drawn scene) shows until
 * the first frame is drawn: three.js takes a moment to arrive on a phone.
 */
export function Scene3D({ angle, side = 0, sway, figures, label, onFail, placeholder }: Scene3DProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef<Latest>({ angle, side, sway, figures });
  latest.current = { angle, side, sway, figures };
  const fail = useRef(onFail);
  fail.current = onFail;
  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    let gone = false;
    let raf = 0;
    let world: World | null = null;
    let ro: ResizeObserver | null = null;
    void (async () => {
      try {
        const { createWorld } = await import("./world");
        if (gone) return;
        const css = getComputedStyle(document.documentElement);
        const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
        const palette = { night: v("--night", "#0e0c22"), dusk: v("--dusk", "#181633"), dusk2: v("--dusk-2", "#221f44"), dusk3: v("--dusk-3", "#2c2955"), line: v("--line", "#35325a"), haze: v("--haze", "#b6b4d0"), moon: v("--moon", "#f5f4fd") };
        // the room's light: the game's gel, looked at again now and then
        const gelNow = () => getComputedStyle(el).getPropertyValue("--gel").trim() || "#b6e83a";
        const w = createWorld(cv, { gel: gelNow(), palette, reduced: reduced() });
        world = w;
        const size = () => {
          const r = el.getBoundingClientRect();
          w.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), ratio());
        };
        size();
        ro = new ResizeObserver(size);
        ro.observe(el);

        let synced = "";
        let barWas = "";
        const apply = (first: boolean) => {
          const p = latest.current;
          const key = p.figures.map((f) => `${f.id}|${f.color}|${f.name}`).join(",");
          if (key !== synced) {
            synced = key;
            w.sync(p.figures.map((f): FigureSpec => ({ id: f.id, color: f.color, name: f.name })));
          }
          let now = p.angle;
          if (p.sway && p.sway.bar.kind === "moving") {
            now = barAngleAt(p.angle, p.sway.bar, p.sway.clock() - p.sway.startAt);
            w.swayBar(now);
            barWas = "";
          } else {
            const k = `${p.angle}|${p.side}`;
            if (k !== barWas) {
              barWas = k;
              w.setBar(p.angle, p.side, first);
            }
          }
          for (const f of p.figures) w.pose(f.id, { pose: f.pose, lean: f.lean ?? (f.pose === "idle" ? 0 : now), side: f.side ?? (f.pose === "lean" ? p.side : 0) }, f.full);
        };
        apply(true);

        let gelAt = 0;
        let shown = false;
        let prev = performance.now();
        let watch = watchFrames();
        let watchFrom = 0;
        const gaps: number[] = [];
        const frame = () => {
          const t = performance.now();
          const gap = t - prev;
          prev = t;
          if (watch) {
            if (!watchFrom) watchFrom = t;
            else if (gap < 1000) gaps.push(gap);
            if (t - watchFrom >= WATCH_MS && gaps.length >= WATCH_FRAMES) {
              watch = false;
              const mid = gaps.sort((x, y) => x - y)[gaps.length >> 1];
              if (mid > SLOW_MS) {
                fail.current();
                return;
              }
            }
          }
          raf = requestAnimationFrame(frame);
          if (t - gelAt > 1000) {
            gelAt = t;
            w.setGel(gelNow());
          }
          apply(false);
          // (the checks can slow the stage's clock to photograph a move frame by frame)
          const slow = import.meta.env.DEV ? (window as unknown as { __limboSlow?: number }).__limboSlow || 1 : 1;
          const st = w.frame((t / 1000) * slow);
          if (!shown) {
            shown = true;
            setReady(true);
          }
          // (the checks read what it draws and what drawing it costs: limbo3d_check.py)
          if (import.meta.env.DEV) (window as unknown as { __limbo3d?: unknown }).__limbo3d = { ...st, poses: latest.current.figures.map((f) => ({ id: f.id, pose: f.pose, lean: f.lean })) };
        };
        frame();
      } catch {
        if (!gone) fail.current();
      }
    })();
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      world?.dispose();
      world = null;
    };
  }, []);
  return (
    <div className="limbo-3d" ref={box} role="img" aria-label={label}>
      {!ready && placeholder}
      <canvas ref={canvas} />
    </div>
  );
}
