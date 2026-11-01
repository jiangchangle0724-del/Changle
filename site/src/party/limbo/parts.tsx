import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, reduced } from "../../lib/anim";
import { useStore } from "../../store";
import { leanOf, useTilt } from "../sensors";

/** How long you hold the lean before it counts. */
export const HOLD_MS = 1200;

/** Two poles and the bar. A deeper lean means a lower bar. */
export function LimboScene({ angle, level, children }: { angle: number; level: number; children?: ReactNode }) {
  const bar = useRef<SVGGElement>(null);
  const y = 40 + (angle / 90) * 150;
  const last = useRef(y);
  useEffect(() => {
    if (!bar.current) return;
    if (reduced()) {
      bar.current.setAttribute("transform", `translate(0 ${y})`);
      return;
    }
    gsap.fromTo(bar.current, { attr: { transform: `translate(0 ${last.current})` } }, { attr: { transform: `translate(0 ${y})` }, duration: 0.9, ease: "bounce.out" });
    last.current = y;
  }, [y]);
  const { lang } = useStore();
  const label = lang === "zh" ? `第 ${level + 1} 杆，后仰 ${angle} 度` : `Bar ${level + 1}: lean back ${angle} degrees`;
  const barG = (
    <g ref={bar} transform={`translate(0 ${y})`}>
      <rect x="32" y="-7" width="256" height="14" rx="7" className="limbo-bar" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={52 + i * 30} y="-7" width="12" height="14" className="limbo-stripe" />
      ))}
    </g>
  );
  const frame = (withBar: boolean) => (
    <svg className="limbo-scene" viewBox="0 0 320 230" role="img" aria-label={label}>
      <line x1="10" y1="214" x2="310" y2="214" className="limbo-ground" />
      <rect x="40" y="26" width="10" height="188" rx="5" className="limbo-pole" />
      <rect x="270" y="26" width="10" height="188" rx="5" className="limbo-pole" />
      {withBar && barG}
    </svg>
  );
  if (!children) return frame(true);
  // the players stand between the poles, and the bar goes in front of them
  return (
    <div className="limbo-stage">
      {frame(false)}
      <div className="limbo-people">{children}</div>
      <svg className="limbo-scene limbo-bar-front" viewBox="0 0 320 230" aria-hidden="true">
        {barG}
      </svg>
    </div>
  );
}

/** Live lean against the target: an arc from upright (0°) to flat (90°). */
export function LeanGauge({ lean, target, hold }: { lean: number; target: number; hold: number }) {
  const r = 110;
  const cx = 130;
  const cy = 130;
  const pt = (deg: number, rr = r) => {
    const a = (Math.PI / 180) * (180 + deg * 2);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    // never more than a half turn, so always the short way round
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const shown = Math.max(0.5, Math.min(90, lean));
  const over = lean >= target;
  const [tx, ty] = pt(target, r + 14);
  const [nx, ny] = pt(shown, r - 26);
  const { lang } = useStore();
  return (
    <div className={`gauge ${over ? "is-over" : ""}`}>
      <svg viewBox="0 0 260 150" aria-hidden="true">
        <path d={arc(0, 90)} className="gauge-track" />
        <path d={arc(target, 90)} className="gauge-zone" />
        <path d={arc(0, shown)} className="gauge-fill" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="gauge-needle" />
        <circle cx={cx} cy={cy} r="7" className="gauge-hub" />
        <text x={tx} y={ty} className="gauge-target" textAnchor="middle" dominantBaseline="middle">
          {target}°
        </text>
      </svg>
      <span className="gauge-read tabular">{Math.round(lean)}°</span>
      <span className="gauge-hold" aria-hidden="true">
        <i style={{ width: `${Math.round(hold * 100)}%` }} />
      </span>
      <span className="gauge-note">{over ? (lang === "zh" ? "坚持住！" : "Hold it!") : lang === "zh" ? `往后仰到 ${target}°` : `Lean back to ${target}°`}</span>
    </div>
  );
}

/**
 * Watch the phone's lean while `on`; calls `onPass` once the target has been held long enough.
 * Returns the live lean, the best lean so far, and how far through the hold we are (0 to 1).
 */
export function useLean(on: boolean, target: number, onPass: (deg: number) => void) {
  const tilt = useTilt(on);
  const [best, setBest] = useState(0);
  const [hold, setHold] = useState(0);
  const since = useRef<number | null>(null);
  const done = useRef(false);
  const cb = useRef(onPass);
  cb.current = onPass;
  useEffect(() => {
    if (!on) {
      setBest(0);
      setHold(0);
      since.current = null;
      done.current = false;
    }
  }, [on, target]);
  const lean = tilt ? leanOf(tilt.beta) : 0;
  useEffect(() => {
    if (!on || done.current || !tilt) return;
    setBest((b) => Math.max(b, lean));
    const t = performance.now();
    if (lean >= target) {
      if (since.current === null) since.current = t;
      const h = Math.min(1, (t - since.current) / HOLD_MS);
      setHold(h);
      if (h >= 1) {
        done.current = true;
        cb.current(Math.round(lean));
      }
    } else {
      since.current = null;
      setHold(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilt]);
  return { lean, best, hold, live: !!tilt };
}

/** Blind lean: how long the lean must stay steady before it locks, how steady, and the least lean that counts. */
export const BLIND_HOLD_MS = 1500;
const BLIND_STEADY_DEG = 2.5;
const BLIND_MIN_LEAN = 8;

/**
 * Blind lean: watch the lean without showing it. Once it is past BLIND_MIN_LEAN and stays within
 * BLIND_STEADY_DEG of its average for BLIND_HOLD_MS, `onLock` gets that average, once. Returns how
 * far through the hold we are (0 to 1) and `lockNow`, which locks whatever the lean is when time
 * runs out (if it's a real lean). The live angle is never returned, so no screen can show it.
 */
export function useBlindLock(on: boolean, onLock: (deg: number) => void) {
  const tilt = useTilt(on);
  const [steady, setSteady] = useState(0);
  const run = useRef<{ t0: number; sum: number; n: number } | null>(null);
  const done = useRef(false);
  const cb = useRef(onLock);
  cb.current = onLock;
  useEffect(() => {
    if (!on) {
      setSteady(0);
      run.current = null;
      done.current = false;
    }
  }, [on]);
  const lean = tilt ? leanOf(tilt.beta) : 0;
  useEffect(() => {
    if (!on || done.current || !tilt) return;
    const t = performance.now();
    const r = run.current;
    if (lean < BLIND_MIN_LEAN || !r || Math.abs(lean - r.sum / r.n) > BLIND_STEADY_DEG) {
      run.current = lean < BLIND_MIN_LEAN ? null : { t0: t, sum: lean, n: 1 };
      setSteady(0);
      return;
    }
    r.sum += lean;
    r.n += 1;
    const h = Math.min(1, (t - r.t0) / BLIND_HOLD_MS);
    setSteady(h);
    if (h >= 1) {
      done.current = true;
      cb.current(Math.round(r.sum / r.n));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilt]);
  /** True when it locked something. */
  const lockNow = (): boolean => {
    if (!on || done.current || lean < BLIND_MIN_LEAN) return false;
    done.current = true;
    cb.current(Math.round(lean));
    return true;
  };
  return { steady, lockNow };
}

/** Blind lean: the target, but not your own lean; a bar fills while you hold still. */
export function BlindMeter({ target, steady, locked }: { target: number; steady: number; locked: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className={`gauge lb-blind ${locked ? "is-over" : ""}`}>
      <span className="lb-blind-target tabular">{target}°</span>
      <span className="gauge-note">
        {locked ? (zh ? "锁定了！" : "Locked!") : steady > 0 ? (zh ? "别动……" : "Hold still…") : zh ? `往后仰到你觉得的 ${target}°，然后停住` : `Lean back to what feels like ${target}°, then hold still`}
      </span>
      <span className="gauge-hold" aria-hidden="true">
        <i style={{ width: `${Math.round((locked ? 1 : steady) * 100)}%` }} />
      </span>
      <span className="hint">{zh ? "看不到自己仰了多少度，全凭感觉" : "You can't see your own angle: it's all feel"}</span>
    </div>
  );
}

/** How a blind lean went: the angle locked and how far it was from the target. */
export function blindLine(zh: boolean, lock: number | undefined, target: number) {
  if (lock === undefined) return zh ? "没锁定" : "No lock";
  const d = lock - target;
  return zh ? `${lock}°（${d === 0 ? "正好" : d > 0 ? `多 ${d}°` : `少 ${-d}°`}）` : `${lock}° (${d === 0 ? "spot on" : d > 0 ? `${d}° over` : `${-d}° short`})`;
}
