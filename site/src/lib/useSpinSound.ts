import { useEffect } from "react";
import type { MotionValue } from "motion/react";
import { sfx } from "./sfx";

/**
 * While a turntable, bottle or wheel moves, a low glass-on-bearing rumble follows its speed.
 */
export function useSpinSound(rotation: MotionValue<number>) {
  useEffect(() => {
    let loop: ReturnType<typeof sfx.spinLoop> | null = null;
    let last = rotation.get();
    let lastT = performance.now();
    let idle: number | null = null;
    const stop = () => {
      loop?.stop();
      loop = null;
    };
    const unsub = rotation.on("change", (r) => {
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const jumped = Math.abs(r - last) > 90 && dt < 40;
      const speed = jumped ? 0 : (Math.abs(r - last) / dt) * 1000;
      last = r;
      lastT = now;
      if (speed > 40) {
        if (!loop) loop = sfx.spinLoop();
        loop.set(speed);
      } else loop?.set(speed);
      if (idle !== null) window.clearTimeout(idle);
      idle = window.setTimeout(stop, 140);
    });
    return () => {
      unsub();
      if (idle !== null) window.clearTimeout(idle);
      stop();
    };
  }, [rotation]);
}
