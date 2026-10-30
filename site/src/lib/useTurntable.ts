import { animate, useMotionValue, type MotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const DEG = 180 / Math.PI;

export const expoOut = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

const mod = (n: number, m: number) => ((n % m) + m) % m;
const normalize = (deg: number) => ((deg + 540) % 360) - 180;

/** A spin as the room hears it: which slot it lands on, how far it travels (deg) and for how long (s). */
export type SpinPlan = { index: number; delta: number; duration: number };

export type TurntableOptions = {
  /** Number of slots around the rim. */
  count: number;
  /** Fired each time a different slot passes the front while moving. */
  onTick?: (index: number) => void;
  /** Fired once motion settles, with the slot now at the front. */
  onSettle?: (index: number) => void;
  /** Snap so that a slot sits exactly at the front when settling. Default true. */
  snap?: boolean;
  /** Friction per second; higher stops sooner. Default 1.4 */
  friction?: number;
  disabled?: boolean;
  /** Online: fired when this phone's hand starts a motion, so the other phones can replay it. */
  onPlan?: (plan: SpinPlan) => void;
};

export type Turntable = {
  rotation: MotionValue<number>;
  step: number;
  frontIndex: number;
  spinning: boolean;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<Element>) => void;
    onPointerMove: (e: ReactPointerEvent<Element>) => void;
    onPointerUp: (e: ReactPointerEvent<Element>) => void;
    onPointerCancel: (e: ReactPointerEvent<Element>) => void;
  };
  /** Rotate so slot `index` sits at the front, the short way, with a spring. */
  spinTo: (index: number) => void;
  /** Give the table a push, in degrees per second. Random if omitted. */
  flick: (velocity?: number) => void;
  /** True right after a drag; use to swallow the click that follows. */
  wasDragged: () => boolean;
  /** Online: replay another phone's spin so it lands on the same slot. */
  play: (plan: SpinPlan) => void;
  /** Put a slot at the front at once, silently (a phone joining mid-game). */
  jump: (index: number) => void;
};

/**
 * The physics of a glass lazy Susan: drag it, flick it, it coasts on its bearing
 * and settles so that a slot sits in front of the host's chopsticks (angle 0 = front).
 * Slot i's resting angle is i * step; the front is where (i * step + rotation) ≡ 0 (mod 360).
 */
export function useTurntable(opts: TurntableOptions): Turntable {
  const { count, onTick, onSettle, onPlan, snap = true, friction = 1.4, disabled = false } = opts;
  const step = 360 / Math.max(1, count);
  const rotation = useMotionValue(0);
  const [frontIndex, setFrontIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const lastTick = useRef(0);
  const center = useRef({ x: 0, y: 0 });
  const lastAngle = useRef(0);
  const samples = useRef<{ t: number; a: number }[]>([]);
  const dragging = useRef(false);
  const dragged = useRef(false);
  const captured = useRef(false);
  const travel = useRef(0);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  const cbs = useRef({ onTick, onSettle, onPlan });
  cbs.current = { onTick, onSettle, onPlan };
  const quiet = useRef(false);

  const indexAt = useCallback((r: number) => mod(Math.round(-r / step), count), [step, count]);

  useEffect(() => {
    lastTick.current = indexAt(rotation.get());
    return rotation.on("change", (r) => {
      const i = indexAt(r);
      if (quiet.current) {
        lastTick.current = i;
        return;
      }
      if (i !== lastTick.current) {
        lastTick.current = i;
        cbs.current.onTick?.(i);
      }
    });
  }, [rotation, indexAt]);

  const finish = useCallback(() => {
    setSpinning(false);
    const i = indexAt(rotation.get());
    setFrontIndex(i);
    cbs.current.onSettle?.(i);
  }, [indexAt, rotation]);

  const snapTarget = useCallback(
    (raw: number) => (snap ? Math.round(raw / step) * step : raw),
    [snap, step],
  );

  const stopAnim = () => {
    anim.current?.stop();
    anim.current = null;
  };

  const coast = useCallback(
    (velocity: number) => {
      stopAnim();
      const v = Math.abs(velocity) < 40 ? 0 : velocity;
      const current = rotation.get();
      if (v === 0) {
        const target = snapTarget(current);
        if (Math.abs(target - current) < 0.01) {
          finish();
          return;
        }
        setSpinning(true);
        cbs.current.onPlan?.({ index: indexAt(target), delta: target - current, duration: 0.6 });
        anim.current = animate(rotation, target, { type: "spring", stiffness: 180, damping: 22, onComplete: finish });
        return;
      }
      const distance = v / friction;
      const target = snapTarget(current + distance);
      const duration = Math.min(4.6, Math.max(0.7, Math.log(Math.abs(v) / 12) / friction));
      setSpinning(true);
      cbs.current.onPlan?.({ index: indexAt(target), delta: target - current, duration });
      anim.current = animate(rotation, target, { duration, ease: expoOut, onComplete: finish });
    },
    [finish, friction, rotation, snapTarget],
  );

  const angleOf = (e: { clientX: number; clientY: number }) =>
    Math.atan2(e.clientY - center.current.y, e.clientX - center.current.x) * DEG;

  const onPointerDown = (e: ReactPointerEvent<Element>) => {
    if (disabled) return;
    const el = e.currentTarget as Element;
    const rect = el.getBoundingClientRect();
    center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    stopAnim();
    setSpinning(false);
    dragging.current = true;
    dragged.current = false;
    travel.current = 0;
    lastAngle.current = angleOf(e);
    samples.current = [{ t: performance.now(), a: lastAngle.current }];
    // capture only once it is really a drag: a plain tap must still reach the plate under the finger
    captured.current = false;
  };

  const onPointerMove = (e: ReactPointerEvent<Element>) => {
    if (!dragging.current) return;
    const a = angleOf(e);
    const delta = normalize(a - lastAngle.current);
    lastAngle.current = a;
    travel.current += Math.abs(delta);
    if (travel.current > 3) {
      dragged.current = true;
      if (!captured.current) {
        captured.current = true;
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
          /* some browsers refuse capture on SVG; dragging still works */
        }
      }
    }
    rotation.set(rotation.get() + delta);
    const now = performance.now();
    const s = samples.current;
    s.push({ t: now, a: s[s.length - 1].a + delta });
    while (s.length > 2 && now - s[0].t > 90) s.shift();
  };

  const endDrag = (_e: ReactPointerEvent<Element>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const s = samples.current;
    const now = performance.now();
    let velocity = 0;
    if (s.length >= 2) {
      const first = s[0];
      const last = s[s.length - 1];
      const dt = Math.max(1, last.t - first.t);
      // ignore a stale finger that paused before lifting
      velocity = now - last.t > 80 ? 0 : ((last.a - first.a) / dt) * 1000;
    }
    coast(Math.max(-2400, Math.min(2400, velocity)));
    if (dragged.current) window.setTimeout(() => (dragged.current = false), 0);
  };

  const spinTo = useCallback(
    (index: number) => {
      stopAnim();
      const current = rotation.get();
      const want = -index * step;
      const turns = Math.round((current - want) / 360);
      let target = want + turns * 360;
      if (Math.abs(target - current) < 0.01) {
        finish();
        return;
      }
      // take the short way around
      if (target - current > 180) target -= 360;
      if (target - current < -180) target += 360;
      setSpinning(true);
      cbs.current.onPlan?.({ index, delta: target - current, duration: 0.8 });
      anim.current = animate(rotation, target, { type: "spring", stiffness: 120, damping: 20, onComplete: finish });
    },
    [finish, rotation, step],
  );

  const play = useCallback(
    (p: SpinPlan) => {
      stopAnim();
      dragging.current = false;
      const current = rotation.get();
      const want = -mod(p.index, count) * step;
      // land on the same slot, travelling about as far as the phone that spun it
      let target = want + Math.round((current + p.delta - want) / 360) * 360;
      if (p.delta > 30 && target < current) target += 360;
      if (p.delta < -30 && target > current) target -= 360;
      if (Math.abs(target - current) < 0.01) {
        finish();
        return;
      }
      setSpinning(true);
      if (p.duration <= 0.9) anim.current = animate(rotation, target, { type: "spring", stiffness: 150, damping: 21, onComplete: finish });
      else anim.current = animate(rotation, target, { duration: p.duration, ease: expoOut, onComplete: finish });
    },
    [count, finish, rotation, step],
  );

  const jump = useCallback(
    (index: number) => {
      stopAnim();
      const i = mod(index, count);
      quiet.current = true;
      rotation.set(-i * step);
      quiet.current = false;
      lastTick.current = i;
      setSpinning(false);
      setFrontIndex(i);
    },
    [count, rotation, step],
  );

  const flick = useCallback(
    (velocity?: number) => {
      if (disabled) return;
      const v = velocity ?? (Math.random() < 0.5 ? -1 : 1) * (900 + Math.random() * 700);
      coast(v);
    },
    [coast, disabled],
  );

  useEffect(() => () => stopAnim(), []);

  return {
    rotation,
    step,
    frontIndex,
    spinning,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
    spinTo,
    flick,
    wasDragged: () => dragged.current,
    play,
    jump,
  };
}
