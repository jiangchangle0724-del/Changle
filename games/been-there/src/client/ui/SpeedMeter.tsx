// The speed test (menu, 测速): a small readout in a corner of how long the last couple of seconds'
// frames took (the 95th percentile, in ms: 16.7 or under is a smooth 60 a second) and how long the
// last tap took to show (from the touch to the next frame drawn). Numbers anyone can read off their
// own phone. Tests read the same numbers (window.__speed).
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import { prefs } from "../prefs";

interface Speed {
  frames: number[];
  taps: number[];
}

export function speedStats(frames: number[]) {
  const a = [...frames].sort((x, y) => x - y);
  return { p95: a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 0, n: a.length };
}

export function SpeedMeter() {
  const [text, setText] = useState("");
  const box = useRef<HTMLParagraphElement>(null);
  const on = prefs.speed;
  useEffect(() => {
    if (!on) return;
    const w = window as unknown as { __speed?: Speed };
    const speed: Speed = (w.__speed = { frames: [], taps: [] });
    let last = 0;
    let tapAt = 0;
    let raf = 0;
    let shown = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (last) speed.frames.push(now - last);
      if (speed.frames.length > 240) speed.frames.shift();
      last = now;
      if (tapAt) {
        speed.taps.push(now - tapAt);
        if (speed.taps.length > 20) speed.taps.shift();
        tapAt = 0;
      }
      if (now - shown > 250) {
        shown = now;
        const recent = speed.frames.slice(-120);
        const { p95 } = speedStats(recent);
        const tap = speed.taps[speed.taps.length - 1];
        setText(`${t("speedFrames", { p95: p95.toFixed(1) })} · ${tap === undefined ? "" : t("speedTap", { ms: Math.round(tap) })}`);
      }
    };
    // (the touch's own time stamp: from the finger, not from when the page got round to it)
    const tap = (e: PointerEvent) => {
      tapAt = e.timeStamp;
    };
    raf = requestAnimationFrame(frame);
    document.addEventListener("pointerdown", tap, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", tap, { capture: true });
    };
  }, [on]);
  if (!on) return null;
  return (
    <p class="speed-meter num" ref={box} aria-live="off">
      {text}
    </p>
  );
}
