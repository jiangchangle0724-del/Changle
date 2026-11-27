import { motion, type MotionValue } from "motion/react";
import { useEffect, useId, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { PorcelainDefs } from "../components/Dish";
import { polar } from "../lib/geom";
import { fitName } from "./truthRules";

export type RingSeat = { id: string; name: string; on?: boolean };

/**
 * The plate, the names round it and the bottle, for one phone and online alike. The bottle is drawn
 * where it last pointed from the first frame (it used to start pointing up after each card and jump
 * back on the next spin).
 */
export function TruthBottle({
  seats,
  count,
  rotation,
  lit,
  me,
  grab,
  handlers,
}: {
  seats: RingSeat[];
  /** slots round the plate (online: never fewer than 2) */
  count: number;
  rotation: MotionValue<number>;
  /** the seat the bottle has picked, lit up */
  lit: (id: string) => boolean;
  /** this phone's own seat, ringed (online) */
  me?: string;
  /** this phone may spin it now */
  grab: boolean;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<Element>) => void;
    onPointerMove: (e: ReactPointerEvent<Element>) => void;
    onPointerUp: (e: ReactPointerEvent<Element>) => void;
    onPointerCancel: (e: ReactPointerEvent<Element>) => void;
  };
}) {
  const glass = `bottleGlass${useId().replace(/:/g, "")}`;
  const bottle = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (r: number) => bottle.current?.setAttribute("transform", `rotate(${-r} 180 180)`);
    apply(rotation.get());
    return rotation.on("change", apply);
  }, [rotation]);

  const base = seats.length > 8 ? 9 : 10.5;
  const ring = useMemo(
    () =>
      seats.map((s, i) => ({
        ...s,
        ...polar(180, 180, 132, -90 + i * (360 / Math.max(1, count))),
        label: fitName(s.name, base),
      })),
    [seats, count, base],
  );

  return (
    <svg viewBox="0 0 360 360" className="bottle-svg" {...handlers} style={{ touchAction: "none", cursor: grab ? "grab" : "default" }}>
      <PorcelainDefs />
      <defs>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0f7a55" />
          <stop offset="40%" stopColor="#3be0a4" />
          <stop offset="60%" stopColor="#1fb683" />
          <stop offset="100%" stopColor="#0b5a3f" />
        </linearGradient>
      </defs>
      <circle cx={180} cy={180} r={170} fill="url(#lampPool)" />
      <circle cx={180} cy={180} r={100} fill="url(#plate)" filter="url(#dishShadow)" />
      <circle cx={180} cy={180} r={92} fill="none" stroke="var(--line)" strokeWidth={1.6} opacity={0.9} />
      <circle cx={180} cy={180} r={86} fill="none" stroke="var(--line)" strokeWidth={0.8} opacity={0.6} />

      {ring.map((s) => {
        const on = lit(s.id);
        return (
          <g key={s.id} transform={`translate(${s.x} ${s.y})`} opacity={s.on === false ? 0.45 : 1}>
            <motion.g
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              animate={{ scale: on ? 1.25 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <title>{s.name}</title>
              <circle
                r={22}
                fill={on ? "var(--gel)" : "rgba(255,255,255,0.07)"}
                stroke={on || s.id === me ? "var(--moon)" : "rgba(181,178,220,0.3)"}
                strokeWidth={s.id === me ? 2.2 : 1.5}
              />
              <text textAnchor="middle" dominantBaseline="central" fontSize={s.label.size} fontWeight={700} fill={on ? "var(--night)" : "var(--moon)"}>
                {s.label.text}
              </text>
            </motion.g>
          </g>
        );
      })}

      {/* the bottle: body, neck, cap; points up when rotation is 0 */}
      <g ref={bottle} transform={`rotate(${-rotation.get()} 180 180)`}>
        <g filter="url(#dishShadow)">
          <path d="M 164 236 L 164 152 C 164 134 170 130 174 118 L 174 98 L 186 98 L 186 118 C 190 130 196 134 196 152 L 196 236 Q 180 246 164 236 Z" fill={`url(#${glass})`} />
          <rect x={171} y={86} width={18} height={14} rx={3} fill="var(--moon)" />
          <rect x={169} y={100} width={22} height={3} fill="rgba(0,0,0,0.25)" />
          <rect x={168} y={166} width={24} height={42} rx={3} fill="var(--moon)" opacity={0.95} />
          <rect x={172} y={176} width={16} height={2} fill="var(--night)" opacity={0.7} />
          <rect x={174} y={184} width={12} height={2} fill="var(--gel)" opacity={1} />
          <rect x={172} y={192} width={16} height={2} fill="var(--night)" opacity={0.7} />
          <rect x={169} y={140} width={4} height={80} rx={2} fill="rgba(255,255,255,0.35)" />
        </g>
      </g>
    </svg>
  );
}
