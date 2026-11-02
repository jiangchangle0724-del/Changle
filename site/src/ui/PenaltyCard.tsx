import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glass } from "../components/Glass";
import { Button } from "./Button";
import { labels } from "./labels";
import type { PenaltyCardProps } from "./types";
import "./PenaltyCard.css";

export function PenaltyCard({
  call,
  lang,
  onDone,
  presentation = "stamp",
  customText,
  actions,
}: PenaltyCardProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [drained, setDrained] = useState(false);
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    setDrained(false);
    if (!call) return;
    const ms = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--dur-emphasis",
      ),
    );
    const timer = window.setTimeout(() => setDrained(true), ms);
    return () => window.clearTimeout(timer);
  }, [call]);
  useEffect(() => {
    const node = dialog.current;
    if (!call || presentation !== "stamp" || !node) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [call, presentation]);
  if (!call) return null;
  const safe = call.kind === "safe";
  const custom = call.say || customText?.trim();
  const detail =
    safe || custom
      ? null
      : call.kind === "everyone"
        ? `${labels.everyone[lang]} · ${labels.sip[lang]}`
        : labels[call.kind][lang];
  const word = safe
    ? labels.safe[lang]
    : custom || (presentation === "card" ? detail : labels.drink[lang]);
  const target = call.kind === "full" ? 0.02 : call.kind === "two" ? 0.5 : 0.72;
  const names = call.who.length
    ? call.who.join(lang === "zh" ? "、" : ", ")
    : labels.everyone[lang];
  const content = (
    <>
      <div className="ui-penalty-flash" aria-hidden="true" />
      <div className="ui-penalty-stage">
        <div className="ui-penalty-names">{names}</div>
        <div className="ui-penalty-seal" id={id}>
          {word}
        </div>
        {detail && presentation === "stamp" && (
          <div className="ui-penalty-detail">{detail}</div>
        )}
        {!safe && !custom && presentation === "stamp" && (
          <div className="ui-penalty-glass" aria-hidden="true">
            <Glass
              key={reduced ? "still" : "moving"}
              level={reduced || drained ? target : 1}
              size={84}
            />
          </div>
        )}
        {call.note && <p className="ui-penalty-note">{call.note}</p>}
        <div className="ui-penalty-actions">
          {actions ?? <Button onClick={onDone}>{labels.continue[lang]}</Button>}
        </div>
      </div>
    </>
  );
  const className = `ui-penalty ui-penalty-${presentation}${safe ? " ui-penalty-safe" : ""}${custom ? " ui-penalty-custom" : ""}`;
  return presentation === "card" ? (
    <div className={className}>{content}</div>
  ) : (
    createPortal(
      <dialog
        ref={dialog}
        className={className}
        aria-modal="true"
        aria-labelledby={id}
        onCancel={(event) => {
          event.preventDefault();
          onDone();
        }}
      >
        {content}
      </dialog>,
      document.body,
    )
  );
}
