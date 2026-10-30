import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, reduced } from "../lib/anim";
import { haptic, sfx } from "../lib/sfx";
import { usePenaltyText, useStore } from "../store";
import { Glass } from "./Glass";

export type PenaltyKind = "sip" | "full" | "everyone" | "safe" | "two";

export type PenaltyCall = {
  /** Who it lands on. Empty for the whole table. */
  who: string[];
  kind: PenaltyKind;
  /** Optional line under the names, e.g. the rule that caused it. */
  note?: string;
};

/**
 * The moment every turn ends on: the room flashes, one huge word slams down, the glass slides
 * in and its level drops. Poster scale on purpose.
 */
export function PenaltyStamp({
  call,
  onDone,
  customText,
  names: nameNode,
  actions,
  volume = 1,
  emptied = false,
}: {
  call: PenaltyCall | null;
  onDone: () => void;
  /** Online: the table's own penalty (set by the host) instead of this phone's setting. */
  customText?: string;
  /** Online: names with a mark for each one who has already drunk. */
  names?: ReactNode;
  /** Online: what this phone can do about it (I drank / call the buddy) instead of Continue. */
  actions?: ReactNode;
  /** Quieter for a phone that is only watching. */
  volume?: number;
  /** Online: this phone said it drank; the glass goes down to the last drop. */
  emptied?: boolean;
}) {
  const { ui, lang, sound } = useStore();
  const local = usePenaltyText();
  const custom = customText === undefined ? null : customText.trim();
  const penalty = custom === null ? local : { sip: custom || ui("sip"), full: custom || ui("finish"), isCustom: !!custom };
  const [level, setLevel] = useState(1);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!call) return;
    setLevel(1);
    haptic([20, 40, 30]);
    const target = call.kind === "safe" ? 1 : call.kind === "full" ? 0.02 : call.kind === "two" ? 0.5 : 0.72;
    const timers: number[] = [];
    if (sound) {
      if (call.kind === "safe") timers.push(window.setTimeout(() => sfx.safe(), 120));
      else {
        timers.push(window.setTimeout(() => sfx.stamp(volume), 90));
        if (call.kind === "everyone") timers.push(window.setTimeout(() => sfx.clink(volume), 560));
        timers.push(window.setTimeout(() => sfx.pour(call.kind === "full" ? 1.2 : call.kind === "two" ? 0.8 : 0.55, volume), 760));
      }
    }
    timers.push(window.setTimeout(() => setLevel(target), 700));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // volume is fixed for a given call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, sound]);

  useEffect(() => {
    if (emptied) setLevel(0.02);
  }, [emptied]);

  useLayoutEffect(() => {
    if (!call || !layer.current) return;
    const q = gsap.utils.selector(layer);
    if (reduced()) return;
    const safe = call.kind === "safe";
    const tl = gsap.timeline();
    tl.fromTo(layer.current, { opacity: 0 }, { opacity: 1, duration: 0.18 })
      .fromTo(q(".stamp-flash"), { opacity: safe ? 0.55 : 0.9 }, { opacity: 0, duration: 0.7, ease: "power2.out" }, 0.06)
      .fromTo(q(".stamp-names"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, 0.05)
      .fromTo(q(".stamp-seal"), { scale: 2.6, rotate: -16, opacity: 0 }, { scale: 1, rotate: -5, opacity: 1, duration: 0.42, ease: "back.out(2.2)" }, 0.08)
      .to(q(".stamp-seal"), { rotate: -3, duration: 0.6, ease: "elastic.out(1.2, 0.35)" }, ">")
      .fromTo(q(".stamp-second"), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, 0.36)
      .fromTo(q(".stamp-glass"), { x: 170, rotate: 10, opacity: 0 }, { x: 0, rotate: 0, opacity: 1, duration: 0.7, ease: "back.out(1.3)" }, 0.32)
      .fromTo(q(".stamp-note"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.5)
      .fromTo(q(".stamp-foot"), { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0.7);
    if (!safe) tl.fromTo(q(".stamp-stage"), { x: -10 }, { x: 0, duration: 0.55, ease: "elastic.out(1.6, 0.18)" }, 0.14);
    return () => {
      tl.kill();
    };
  }, [call]);

  if (!call) return null;

  const safe = call.kind === "safe";
  const big = safe ? ui("safe") : penalty.isCustom ? penalty.sip : lang === "zh" ? "喝" : "Drink";
  const second = safe
    ? lang === "zh"
      ? "Safe"
      : "免罪"
    : penalty.isCustom
      ? ""
      : call.kind === "full"
        ? ui("finish")
        : call.kind === "everyone"
          ? ui("everyoneDrinks")
          : call.kind === "two"
            ? ui("twoSips")
            : ui("sip");

  const names = call.who.length ? call.who.join(lang === "zh" ? "、" : ", ") : ui("everyoneDrinks");

  return createPortal(
    <div className={`stamp-layer ${safe ? "is-safe" : ""}`} ref={layer} role="alertdialog" aria-live="assertive">
      <div className="stamp-flash" aria-hidden="true" />
      <div className="stamp-stage">
        <div className="stamp-names">{nameNode ?? names}</div>
        <div className={`stamp-seal ${safe ? "stamp-safe" : ""} ${penalty.isCustom && !safe ? "stamp-custom" : ""}`}>
          <span className={`stamp-big ${lang === "zh" && !penalty.isCustom ? "zh-display" : "en-display"}`}>{big}</span>
          {second && <span className="stamp-second">{second}</span>}
        </div>
        {!safe && !penalty.isCustom && (
          <div className="stamp-glass">
            <Glass level={level} size={84} />
          </div>
        )}
        {call.note && <p className="stamp-note">{call.note}</p>}
        <div className="stamp-foot">
          {actions ? (
            <div className="stamp-actions">{actions}</div>
          ) : (
            <button className="btn btn-moon btn-lg stamp-done" onClick={onDone}>
              {ui("continue")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
