import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, reduced } from "../../lib/anim";
import { FOLLOW_DEG, LOST_MS, MOVE_LEAD_MS, barAngleAt, classicBar, type LimboMode } from "../../shared/engine/games/limbo";
import type { LimboBar, LimboKind } from "../../shared/protocol";
import { useStore } from "../../store";
import { degreesApart, leanAndSide, leanOf, upOf, useTilt } from "../sensors";

/** How long you hold the lean before it counts. */
export const HOLD_MS = 1200;

/** A moving bar on screen: it sways along its path from `startAt`, read on `clock` (online, the server's). */
export type Sway = { bar: LimboBar; startAt: number; clock: () => number };

/** One phone's clock, for a moving bar that only this phone shows. */
export const phoneClock = () => performance.now();

const barY = (angle: number) => 40 + (angle / 90) * 150;

/**
 * Two poles and the bar. A deeper lean means a lower bar. A tilt-through bar slants to its side;
 * a moving bar sways along its path (it is the game, so it moves with reduced motion too), and the
 * players standing under it lean with it.
 */
export function LimboScene({ angle, level, side = 0, sway, children }: { angle: number; level: number; side?: number; sway?: Sway; children?: ReactNode }) {
  const bar = useRef<SVGGElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const y = barY(angle);
  const last = useRef(y);
  const swaying = !!sway && sway.bar.kind === "moving";
  useEffect(() => {
    if (!bar.current || swaying) return;
    if (reduced()) {
      bar.current.setAttribute("transform", `translate(0 ${y})`);
      last.current = y;
      return;
    }
    gsap.fromTo(bar.current, { attr: { transform: `translate(0 ${last.current})` } }, { attr: { transform: `translate(0 ${y})` }, duration: 0.9, ease: "bounce.out" });
    last.current = y;
  }, [y, swaying]);
  // the moving bar, frame by frame, from the same start time on every phone
  const path = sway && swaying ? sway : null;
  const { swing = 0, period = 0, moveMs = 0 } = path?.bar ?? {};
  const startAt = path?.startAt ?? 0;
  const clock = path?.clock;
  useEffect(() => {
    if (!clock || !bar.current) return;
    const g = bar.current;
    gsap.killTweensOf(g);
    const b: LimboBar = { ...classicBar(), kind: "moving", swing, period, moveMs };
    const glide = !reduced();
    let id = 0;
    const frame = () => {
      const ms = clock() - startAt;
      const to = barY(barAngleAt(angle, b, ms));
      // before it starts, it glides over from wherever the last bar left it
      last.current = ms < 0 && glide ? last.current + (to - last.current) * 0.12 : to;
      g.setAttribute("transform", `translate(0 ${last.current})`);
      const at = ((last.current - 40) / 150) * 90;
      stage.current?.querySelector<HTMLElement>(".lineup")?.style.setProperty("--lean", `${-at}deg`);
      id = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(id);
  }, [clock, angle, swing, period, moveMs, startAt]);
  const { lang } = useStore();
  const zh = lang === "zh";
  const label =
    (zh ? `第 ${level + 1} 杆，后仰 ${angle} 度` : `Bar ${level + 1}: lean back ${angle} degrees`) +
    (side ? (zh ? `，往${side > 0 ? "右" : "左"}歪 ${Math.abs(side)} 度` : `, tilt ${side > 0 ? "right" : "left"} ${Math.abs(side)} degrees`) : "") +
    (swaying ? (zh ? "，横杆上下浮动" : ", the bar floats up and down") : "");
  // a tilt shows as a slant, half as steep, to the side to tilt to
  const barG = (
    <g ref={bar} transform={`translate(0 ${y})`}>
      <g className="limbo-slant" style={{ transform: `rotate(${side / 2}deg)` }}>
        <rect x="32" y="-7" width="256" height="14" rx="7" className="limbo-bar" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={52 + i * 30} y="-7" width="12" height="14" className="limbo-stripe" />
        ))}
      </g>
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
    <div className="limbo-stage" ref={stage}>
      {frame(false)}
      <div className="limbo-people">{children}</div>
      <svg className="limbo-scene limbo-bar-front" viewBox="0 0 320 230" aria-hidden="true">
        {barG}
      </svg>
    </div>
  );
}

/**
 * Live lean against the target: an arc from upright (0°) to flat (90°). Past the target counts; with
 * `band` (a moving bar), only within that many degrees of it either way. The bar underneath fills
 * with `hold` (0 to 1); `warn` turns it red, for a fill that's bad news. `note` replaces the line under it.
 */
export function LeanGauge({ lean, target, hold, band, warn, note }: { lean: number; target: number; hold: number; band?: number; warn?: boolean; note?: string }) {
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
  const over = band === undefined ? lean >= target : Math.abs(lean - target) <= band;
  const [tx, ty] = pt(target, r + 14);
  const [nx, ny] = pt(shown, r - 26);
  const { lang } = useStore();
  return (
    // the targets are on the element too, for the browser checks' stand-in player (scripts/party_test.py)
    <div className={`gauge ${over ? "is-over" : ""}`} data-target={target.toFixed(1)} data-band={band}>
      <svg viewBox="0 0 260 150" aria-hidden="true">
        <path d={arc(0, 90)} className="gauge-track" />
        <path d={band === undefined ? arc(target, 90) : arc(Math.max(0, target - band), Math.min(90, target + band))} className="gauge-zone" />
        <path d={arc(0, shown)} className="gauge-fill" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="gauge-needle" />
        <circle cx={cx} cy={cy} r="7" className="gauge-hub" />
        <text x={tx} y={ty} className="gauge-target" textAnchor="middle" dominantBaseline="middle">
          {Math.round(target)}°
        </text>
      </svg>
      <span className="gauge-read tabular">{Math.round(lean)}°</span>
      <span className={`gauge-hold ${warn ? "is-warn" : ""}`} aria-hidden="true">
        <i style={{ width: `${Math.round(hold * 100)}%` }} />
      </span>
      <span className="gauge-note">{note ?? (over ? (lang === "zh" ? "坚持住" : "Hold it") : lang === "zh" ? `往后仰到 ${target}°` : `Lean back to ${target}°`)}</span>
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

/** Hold steady: how far the phone may move, any way, from where the hold began before it counts as a wobble. */
export const STEADY_DEG = 3;

/** What a bar asks you to hold: a lean, a sideways tilt (right is positive, 0 for none), for how long, and whether dead still. */
export type PoseAsk = { target: number; side: number; holdMs: number; still: boolean };

/**
 * Hold a pose while `on` (稳住, 歪着过): lean back at least `target`, tilt at least `side` that way
 * when it asks, and keep it up for `holdMs`. With `still`, the phone must also stay within
 * STEADY_DEG of where the hold began, or the hold starts again. `onPass` gets the lean, once.
 * Returns the live lean and sideways tilt, the deepest lean so far, how far through the hold
 * (0 to 1), and when the last wobble was (performance time, 0 for none).
 */
export function usePose(on: boolean, ask: PoseAsk, onPass: (deg: number) => void) {
  const tilt = useTilt(on);
  const [best, setBest] = useState(0);
  const [hold, setHold] = useState(0);
  const [wobbleAt, setWobbleAt] = useState(0);
  /** this hold: when it began, and the sum of the "up" directions since (their average direction) */
  const run = useRef<{ t0: number; sum: [number, number, number] } | null>(null);
  const done = useRef(false);
  const cb = useRef(onPass);
  cb.current = onPass;
  const { target, side, holdMs, still } = ask;
  useEffect(() => {
    if (!on) {
      setBest(0);
      setHold(0);
      setWobbleAt(0);
      run.current = null;
      done.current = false;
    }
  }, [on, target, side, holdMs]);
  const pose = tilt ? leanAndSide(tilt.beta, tilt.gamma) : { lean: 0, side: 0 };
  useEffect(() => {
    if (!on || done.current || !tilt) return;
    setBest((b) => Math.max(b, pose.lean));
    const t = performance.now();
    const sideOk = side === 0 || (side > 0 ? pose.side >= side : pose.side <= side);
    if (pose.lean < target || !sideOk) {
      run.current = null;
      setHold(0);
      return;
    }
    const up = upOf(tilt.beta, tilt.gamma);
    const r = run.current;
    if (r && still && degreesApart(up, r.sum) > STEADY_DEG) {
      // a wobble: the hold starts again from here (settling in for a moment doesn't count as one)
      if (t - r.t0 > 400) setWobbleAt(t);
      run.current = null;
    }
    if (!run.current) {
      run.current = { t0: t, sum: up };
      setHold(0);
      return;
    }
    const s = run.current.sum;
    run.current.sum = [s[0] + up[0], s[1] + up[1], s[2] + up[2]];
    const h = Math.min(1, (t - run.current.t0) / holdMs);
    setHold(h);
    if (h >= 1) {
      done.current = true;
      cb.current(Math.round(pose.lean));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilt]);
  return { lean: pose.lean, side: pose.side, best, hold, wobbleAt, live: !!tilt };
}

/**
 * Moving bar (跟着动的杆) while `on`: keep your lean within FOLLOW_DEG of the bar as it sways. Away
 * from it for longer than LOST_MS (once it has started moving) and `onEnd(false)`; still with it
 * when it stops, `onEnd(true)`. Both get the deepest the bar went while you were with it. `startAt`
 * is on `clock` (online, the server's clock), so every phone judges against the bar every screen
 * shows. Returns where the bar is, the live lean, how close you are to losing it (0 to 1), and the
 * deepest you followed it.
 */
export function useFollow(on: boolean, angle: number, bar: LimboBar, startAt: number, clock: () => number, onEnd: (kept: boolean, deg: number) => void) {
  const tilt = useTilt(on);
  const latest = useRef(tilt);
  latest.current = tilt;
  const cb = useRef(onEnd);
  cb.current = onEnd;
  const [st, setSt] = useState({ at: angle, lean: 0, lost: 0, best: 0 });
  const { swing, period, moveMs } = bar;
  useEffect(() => {
    if (!on) return;
    const b: LimboBar = { ...classicBar(), kind: "moving", swing, period, moveMs };
    let lostAt: number | null = null;
    let best = 0;
    let over = false;
    const tick = () => {
      if (over) return;
      const ms = clock() - startAt;
      const at = barAngleAt(angle, b, ms);
      const r = latest.current;
      const lean = r ? leanAndSide(r.beta, r.gamma).lean : 0;
      if (ms >= moveMs) {
        over = true;
        cb.current(true, Math.round(best));
        return;
      }
      if (Math.abs(lean - at) <= FOLLOW_DEG) {
        lostAt = null;
        best = Math.max(best, at);
      } else if (ms >= MOVE_LEAD_MS) {
        // it waits at its top first: time to get there doesn't count
        lostAt ??= ms;
        if (ms - lostAt > LOST_MS) {
          over = true;
          setSt({ at, lean, lost: 1, best });
          cb.current(false, Math.round(best));
          return;
        }
      }
      setSt({ at, lean, lost: lostAt === null ? 0 : Math.min(1, (ms - lostAt) / LOST_MS), best });
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [on, angle, swing, period, moveMs, startAt, clock]);
  return { ...st, live: !!tilt };
}

/** Seconds, to one decimal place when there is one (2, 2.5). */
const secs = (ms: number) => String(Math.round(ms / 100) / 10);

/** Hold steady: the gauge, and what to do now: lean back, hold still, or start again after a wobble. */
export function SteadyMeter({ target, holdMs, pose }: { target: number; holdMs: number; pose: ReturnType<typeof usePose> }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const wobbled = pose.wobbleAt > 0 && performance.now() - pose.wobbleAt < 900;
  const left = secs(Math.max(0, 1 - pose.hold) * holdMs);
  const note =
    pose.lean < target ? (zh ? `往后仰到 ${target}°` : `Lean back to ${target}°`) : wobbled ? (zh ? "晃了，重来" : "You moved, start again") : zh ? `别动，还要 ${left} 秒` : `Hold still, ${left}s to go`;
  return <LeanGauge lean={pose.lean} target={target} hold={pose.hold} note={note} />;
}

/** Tilt through: how far you tilt to the side against what the bar asks (right is positive), on a level. */
export function SideGauge({ side, want }: { side: number; want: number }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const right = want > 0;
  const ok = right ? side >= want : side <= want;
  const at = (d: number) => 50 + (Math.max(-45, Math.min(45, d)) / 45) * 50;
  const Arrow = right ? ArrowRight : ArrowLeft;
  const now = Math.round(Math.abs(side));
  return (
    <div className={`lb-side ${ok ? "is-over" : ""}`} data-want={want}>
      <span className="lb-side-ask">
        {!right && <Arrow size={20} aria-hidden="true" />}
        {zh ? `往${right ? "右" : "左"}歪 ${Math.abs(want)}°` : `Tilt ${right ? "right" : "left"} ${Math.abs(want)}°`}
        {right && <Arrow size={20} aria-hidden="true" />}
      </span>
      <span className="lb-side-track" aria-hidden="true">
        <i className="lb-side-zone" style={right ? { left: `${at(want)}%`, right: 0 } : { left: 0, right: `${100 - at(want)}%` }} />
        <i className="lb-side-mid" />
        <i className="lb-side-dot" style={{ left: `${at(side)}%` }} />
      </span>
      <span className="lb-side-read tabular">{now === 0 ? (zh ? "没歪" : "Straight") : zh ? `往${side > 0 ? "右" : "左"} ${now}°` : `${now}° to the ${side > 0 ? "right" : "left"}`}</span>
    </div>
  );
}

/** Tilt through: the lean gauge and the sideways level, and what's still missing. */
export function TiltMeter({ target, side, pose }: { target: number; side: number; pose: ReturnType<typeof usePose> }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const right = side > 0;
  const sideOk = right ? pose.side >= side : pose.side <= side;
  const note =
    pose.lean < target
      ? zh ? `往后仰到 ${target}°` : `Lean back to ${target}°`
      : !sideOk ? (zh ? `再往${right ? "右" : "左"}歪一点` : `Tilt ${right ? "right" : "left"} a bit more`) : zh ? "撑住" : "Hold it";
  return (
    <>
      <LeanGauge lean={pose.lean} target={target} hold={pose.hold} note={note} />
      <SideGauge side={pose.side} want={side} />
    </>
  );
}

/** Moving bar: the gauge's target moves with the bar, the band around it is "with it", and the bar underneath fills red while you're away from it. */
export function FollowMeter({ follow }: { follow: ReturnType<typeof useFollow> }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const d = follow.lean - follow.at;
  const note = Math.abs(d) <= FOLLOW_DEG ? (zh ? "跟住" : "Stay with it") : d < 0 ? (zh ? "再往后仰" : "Lean back more") : zh ? "回来一点" : "Come up a bit";
  return <LeanGauge lean={follow.lean} target={follow.at} band={FOLLOW_DEG} hold={follow.lost} warn note={note} />;
}

/** Every way to play Limbo, as the pickers name them; one phone adds a real bar. */
export type LimboPick = LimboMode | "bar";
const NAMES: Record<LimboPick, [string, string]> = {
  classic: ["经典", "Classic"],
  steady: ["稳住", "Hold steady"],
  moving: ["跟着动的杆", "Moving bar"],
  tilt: ["歪着过", "Tilt through"],
  party: ["派对", "Party"],
  blind: ["盲仰", "Blind lean"],
  bar: ["真杆子", "Real bar"],
};
export const modeName = (m: LimboPick, zh: boolean) => NAMES[m][zh ? 0 : 1];

/** The mode picker: one chip per way to play. */
export function ModePicker({ modes, value, off = [], onPick }: { modes: LimboPick[]; value: LimboPick; off?: LimboPick[]; onPick: (m: LimboPick) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="lb-modes" role="group" aria-label={zh ? "玩法" : "Mode"}>
      {modes.map((m) => (
        <button key={m} type="button" className="chip" aria-pressed={value === m} disabled={off.includes(m)} onClick={() => onPick(m)}>
          {modeName(m, zh)}
        </button>
      ))}
    </div>
  );
}

/** The variants and party mode, in a line each (under the picker). */
export function variantLine(m: LimboKind | "party", zh: boolean) {
  switch (m) {
    case "steady":
      return zh ? "仰到横杆的角度以后一动不动撑住，一晃就重来。每杆要撑得更久。" : "Reach the bar's angle, then hold dead still. Any wobble starts the hold again, and each bar is longer.";
    case "moving":
      return zh ? "横杆上下浮动，跟着它仰下去又回来。跟丢超过 1 秒就出局。" : "The bar floats up and down: follow it down and back up. Lose it for over a second and you're out.";
    case "tilt":
      return zh ? "往后仰的同时往左或往右歪到指定角度，每杆方向随机。" : "Lean back and tilt left or right to the angle shown. The side is random each bar.";
    case "party":
      return zh ? "每杆随机一种：经典、稳住、跟着动的杆、歪着过。" : "Each bar is one of these at random: classic, hold steady, moving bar or tilt through.";
    default:
      return zh ? "往后仰到横杆的角度，坚持一秒多就过。" : "Lean back to the bar's angle and hold it for a second.";
  }
}

/** The steps for a variant or party mode, after the first one (how to hold the phone). */
export function variantSteps(m: Exclude<LimboKind, "classic"> | "party", zh: boolean): string[] {
  switch (m) {
    case "steady":
      return zh ? ["仰到横杆的角度，然后一动不动", "一晃就重来，每杆要撑得更久"] : ["Lean back to the bar's angle, then keep dead still", "Any wobble starts the hold again. Each bar is longer."];
    case "moving":
      return zh ? ["横杆上下浮动，跟着它仰下去又回来", "跟丢超过 1 秒就出局"] : ["The bar floats up and down: follow it down and back up", "Lose it for over a second and you're out"];
    case "tilt":
      return zh ? ["往后仰到横杆的角度，同时往左或往右歪", "每杆方向随机，看清箭头"] : ["Lean back to the bar's angle and tilt left or right too", "The side is random each bar: watch the arrow"];
    case "party":
      return zh ? ["每杆随机一种：经典、稳住、跟着动的杆、歪着过", "每杆开始前会告诉你是哪种"] : ["Each bar is one at random: classic, hold steady, moving bar or tilt through", "You see which one before each bar starts"];
  }
}

/** A bar's variant in a few words, for the line under the scene ("" for a classic bar, unless in party mode). */
export function barTag(bar: LimboBar, zh: boolean, party: boolean) {
  switch (bar.kind) {
    case "steady":
      return zh ? `稳住 ${secs(bar.hold)} 秒` : `Hold still ${secs(bar.hold)}s`;
    case "moving":
      return modeName("moving", zh);
    case "tilt":
      return zh ? `往${bar.side > 0 ? "右" : "左"}歪 ${Math.abs(bar.side)}°` : `Tilt ${bar.side > 0 ? "right" : "left"} ${Math.abs(bar.side)}°`;
    default:
      return party ? modeName("classic", zh) : "";
  }
}

/** How to clear this bar, in a sentence or two. */
export function barHow(bar: LimboBar, angle: number, zh: boolean) {
  const phone = zh ? "手机竖着贴在胸口，屏幕朝自己。" : "Phone upright on your chest, screen facing you. ";
  const dir = bar.side > 0 ? (zh ? "右" : "right") : zh ? "左" : "left";
  switch (bar.kind) {
    case "steady":
      return phone + (zh ? `仰到 ${angle}° 以后一动不动撑住 ${secs(bar.hold)} 秒，一晃就重来。` : `Lean back to ${angle}°, then hold dead still for ${secs(bar.hold)} seconds. Any wobble starts it again.`);
    case "moving":
      return phone + (zh ? `横杆在 ${angle - bar.swing}° 到 ${angle}° 之间上下浮动，跟着它。跟丢超过 1 秒就出局。` : `The bar floats between ${angle - bar.swing}° and ${angle}°: follow it. Lose it for over a second and you're out.`);
    case "tilt":
      return phone + (zh ? `往后仰到 ${angle}°，同时往${dir}歪 ${Math.abs(bar.side)}°。` : `Lean back to ${angle}° and tilt ${dir} ${Math.abs(bar.side)}° at the same time.`);
    default:
      return zh ? `手机竖着贴在胸口，屏幕朝自己，往后仰到 ${angle}°` : `Phone upright on your chest, screen facing you. Lean back to ${angle}°.`;
  }
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
        {locked ? (zh ? "锁定了" : "Locked") : steady > 0 ? (zh ? "别动……" : "Hold still…") : zh ? `往后仰到你觉得的 ${target}°，然后停住` : `Lean back to what feels like ${target}°, then hold still`}
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
