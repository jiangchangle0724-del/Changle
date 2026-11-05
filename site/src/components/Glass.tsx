import { motion } from "motion/react";
import { useId } from "react";

/**
 * A beer glass drawn as geometry. `level` is 0..1 of the glass; the liquid moves with a spring.
 */
export function Glass({ level, size = 120, label }: { level: number; size?: number; label?: string }) {
  const h = size * 1.5;
  const w = size;
  // glass walls: a slight taper
  const top = 10;
  const bottom = h - 10;
  const xl = (y: number) => 14 + ((y - top) / (bottom - top)) * 6; // left wall x at y
  const xr = (y: number) => w - 14 - ((y - top) / (bottom - top)) * 6;
  const innerTop = top + 6;
  const innerBottom = bottom - 8;
  const clamped = Math.max(0, Math.min(1, level));
  const liquidTop = innerBottom - (innerBottom - innerTop) * clamped;
  // two glasses on one screen (the shared glass and the stamp's) must not share a clip path
  const uid = useId().replace(/:/g, "");
  const beer = `beer-${uid}`;
  const wall = `glassWall-${uid}`;
  const inner = `glassInner-${uid}`;

  return (
    <div className="glass-wrap" style={{ width: w }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <defs>
          <linearGradient id={beer} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffcf4a" />
            <stop offset="100%" stopColor="#ff9f2e" />
          </linearGradient>
          <linearGradient id={wall} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="20%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="80%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.3)" />
          </linearGradient>
          <clipPath id={inner}>
            <path d={`M ${xl(innerTop)} ${innerTop} L ${xr(innerTop)} ${innerTop} L ${xr(innerBottom)} ${innerBottom} Q ${w / 2} ${innerBottom + 8} ${xl(innerBottom)} ${innerBottom} Z`} />
          </clipPath>
        </defs>
        {/* liquid */}
        <g clipPath={`url(#${inner})`}>
          {/* only the top of the liquid moves: the glass's inside clips the rest (a moving height could
              spring past zero for a frame, and a negative height is an error in the console) */}
          <motion.rect
            x={0}
            width={w}
            height={h}
            initial={false}
            animate={{ y: liquidTop }}
            transition={{ type: "spring", stiffness: 90, damping: 16 }}
            fill={`url(#${beer})`}
          />
          <motion.ellipse
            cx={w / 2}
            rx={w / 2 - 16}
            ry={7}
            initial={false}
            animate={{ cy: liquidTop + 1, opacity: clamped > 0.02 ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 90, damping: 16 }}
            fill="#fffaf0"
          />
          {/* a few bubbles */}
          {[0.3, 0.55, 0.72].map((p, i) => (
            <motion.circle
              key={i}
              cx={xl(innerBottom) + (xr(innerBottom) - xl(innerBottom)) * p}
              r={2.2 - i * 0.4}
              fill="rgba(255,240,200,0.75)"
              initial={{ cy: innerBottom, opacity: 0 }}
              animate={{ cy: [innerBottom, liquidTop + 6], opacity: [0, 0.9, 0] }}
              transition={{ duration: 2.4 + i * 0.6, repeat: Infinity, ease: "easeOut", delay: i * 0.7 }}
            />
          ))}
        </g>
        {/* glass */}
        <path
          d={`M ${xl(top)} ${top} L ${xr(top)} ${top} L ${xr(bottom)} ${bottom} Q ${w / 2} ${bottom + 10} ${xl(bottom)} ${bottom} Z`}
          fill={`url(#${wall})`}
          stroke="rgba(245,244,253,0.6)"
          strokeWidth={2}
        />
        <path d={`M ${xl(top) + 5} ${top + 16} L ${xl(bottom) + 5} ${bottom - 14}`} stroke="rgba(255,255,255,0.35)" strokeWidth={3} strokeLinecap="round" />
      </svg>
      {label && <div className="glass-label">{label}</div>}
    </div>
  );
}
