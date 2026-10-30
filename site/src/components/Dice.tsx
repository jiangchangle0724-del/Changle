import { motion } from "motion/react";
import { useEffect, useState } from "react";

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

/** A white die with night pips (the one-pip lit in the game color), tumbling while it rolls. */
export function Die({ value, rolling, size = 96, delay = 0 }: { value: number; rolling: boolean; size?: number; delay?: number }) {
  const [face, setFace] = useState(value);
  const [jitter, setJitter] = useState(0);

  useEffect(() => {
    if (!rolling) {
      setFace(value);
      setJitter(0);
      return;
    }
    const id = window.setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 6));
      setJitter((Math.random() - 0.5) * 40);
    }, 75);
    return () => window.clearInterval(id);
  }, [rolling, value]);

  const lit = face === 1;
  return (
    <motion.div
      className="die"
      style={{ width: size, height: size }}
      animate={
        rolling
          ? { rotate: jitter, y: [0, -14, 0], scale: 1.04 }
          : { rotate: (value * 37) % 14 - 7, y: 0, scale: 1 }
      }
      transition={rolling ? { duration: 0.18, repeat: Infinity, repeatType: "mirror" } : { type: "spring", stiffness: 380, damping: 14, delay }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label={String(value)}>
        <defs>
          <linearGradient id="dieFace" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dcd9ee" />
          </linearGradient>
        </defs>
        <rect x={4} y={4} width={92} height={92} rx={20} fill="url(#dieFace)" />
        {PIPS[face].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={face === 1 ? 12 : 7.5} fill={lit ? "var(--gel, #ff5fa2)" : "#0e0c22"} />
        ))}
      </svg>
    </motion.div>
  );
}
