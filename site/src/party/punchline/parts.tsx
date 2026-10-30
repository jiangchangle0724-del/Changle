import { MessageSquareQuote } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { T } from "../../i18n";
import { gsap, reduced } from "../../lib/anim";
import { sfx } from "../../lib/sfx";
import { useStore } from "../../store";
import { Both } from "../common";

/** The prompt, with the other language underneath. */
export function PromptCard({ prompt, kicker }: { prompt: T; kicker?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { y: 18, opacity: 0, rotate: -1.5 }, { y: 0, opacity: 1, rotate: 0, duration: 0.55, ease: "back.out(1.6)", clearProps: "transform,opacity" });
  }, [prompt.zh]);
  return (
    <div className="pl-prompt" ref={ref}>
      <span className="pl-kicker">
        <MessageSquareQuote size={15} />
        {kicker}
      </span>
      <Both t={prompt} className="pl-prompt-text" />
    </div>
  );
}

/** One answer on the board: big text, and whatever the moment needs underneath. */
export function AnswerCard({
  text,
  slot,
  selected,
  winner,
  mine,
  disabled,
  onPick,
  children,
}: {
  text: string;
  slot: number;
  selected?: boolean;
  winner?: boolean;
  mine?: boolean;
  disabled?: boolean;
  onPick?: () => void;
  children?: ReactNode;
}) {
  const { lang } = useStore();
  const empty = !text;
  const body = (
    <>
      <span className="pl-slot" aria-hidden="true">
        {String.fromCharCode(65 + slot)}
      </span>
      <span className={`pl-answer-text ${empty ? "is-empty" : ""}`}>{empty ? (lang === "zh" ? "（没写出来）" : "(no answer)") : text}</span>
      {mine && <span className="pl-mine">{lang === "zh" ? "你写的" : "Yours"}</span>}
      {children}
    </>
  );
  const cls = `pl-answer ${selected ? "is-on" : ""} ${winner ? "is-win" : ""} ${mine ? "is-mine" : ""}`;
  if (!onPick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} disabled={disabled} aria-pressed={selected} onClick={onPick}>
      {body}
    </button>
  );
}

/** "神回复！": stamped across an answer that took every vote. */
export function SweepStamp() {
  const { lang } = useStore();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    sfx.stamp(0.8);
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { scale: 2.6, rotate: -24, opacity: 0 }, { scale: 1, rotate: -9, opacity: 1, duration: 0.45, ease: "back.out(2.4)", delay: 0.35 });
  }, []);
  return (
    <span className="pl-sweep" ref={ref}>
      {lang === "zh" ? "神回复！" : "Punchline!"}
    </span>
  );
}

/** Points flying up on a scored answer. */
export function Points({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current || !n) return;
    gsap.fromTo(ref.current, { y: 10, opacity: 0, scale: 0.6 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)", delay: 0.2 });
  }, [n]);
  return (
    <span className="pl-points tabular" ref={ref}>
      +{n}
    </span>
  );
}
