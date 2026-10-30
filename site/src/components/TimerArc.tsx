import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sfx } from "../lib/sfx";

/**
 * A countdown drawn as an arc that empties like a glass, with the seconds stated in text.
 * `running` starts it; `onEnd` fires once at zero.
 */
export function TimerArc({
  seconds,
  running,
  onEnd,
  size = 160,
  resetKey,
  endsAt,
  offset = 0,
  ticking = true,
}: {
  seconds: number;
  running: boolean;
  onEnd?: () => void;
  size?: number;
  resetKey?: string | number;
  /** Online: the server's deadline (ms) and this phone's clock offset to the server. */
  endsAt?: number;
  offset?: number;
  /** Knock the last ten seconds. */
  ticking?: boolean;
}) {
  const [left, setLeft] = useState(seconds);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const lastWhole = useRef<number | null>(null);

  useEffect(() => setLeft(seconds), [seconds, resetKey]);

  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const startLeft = endsAt !== undefined ? 0 : left;
    let raf = 0;
    let ended = false;
    lastWhole.current = null;
    const loop = () => {
      const next = endsAt !== undefined ? Math.max(0, (endsAt - (Date.now() + offset)) / 1000) : Math.max(0, startLeft - (performance.now() - started) / 1000);
      setLeft(next);
      const whole = Math.ceil(next);
      if (lastWhole.current !== null && whole !== lastWhole.current && ticking) {
        if (whole > 0 && whole <= 10) sfx.countdown(whole);
        if (whole === 0) sfx.timeUp();
      }
      lastWhole.current = whole;
      if (next <= 0) {
        if (!ended) endRef.current?.();
        ended = true;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, endsAt, offset]);

  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const frac = seconds > 0 ? left / seconds : 0;
  const urgent = left <= 10 && running;

  return (
    <div className={`timer-arc ${size < 100 ? "timer-small" : ""}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(255,255,255,0.04)" stroke="rgba(181,178,220,0.16)" strokeWidth={6} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? "var(--stop)" : "var(--gel, var(--moon))"}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 0.12, ease: "linear" }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={`timer-text tabular ${urgent ? "timer-urgent" : ""}`}>{Math.ceil(left)}</div>
    </div>
  );
}
