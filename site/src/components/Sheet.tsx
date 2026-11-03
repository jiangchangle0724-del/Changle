import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EASE, play } from "../lib/motion";
import { useBackCloses } from "../router";
import { useStore } from "../store";

/** Open sheets, bottom to top: Esc closes only the top one. */
const stack: number[] = [];
let sheetIds = 0;

/**
 * A bottom sheet. It rises with a little weight, can be swiped down by its handle, and
 * stays mounted until its exit animation has finished. The phone's back button closes it.
 */
export function Sheet({
  open,
  onClose,
  title,
  label,
  children,
  gel,
  history = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** names the dialog for screen readers when it has no title */
  label?: string;
  children: ReactNode;
  /** the game color this sheet belongs to (primary buttons glow in it) */
  gel?: string;
  tone?: string;
  /** false when the page's own address already stands for the sheet (a game's card at /g/<slug>) */
  history?: boolean;
}) {
  const { ui } = useStore();
  const titleId = useId();
  useBackCloses(open, onClose, history);
  const [id] = useState(() => ++sheetIds);
  // a closing sheet (its exit animation still running) can't be closed a second time
  const requestClose = () => {
    if (open) onClose();
  };
  const [mounted, setMounted] = useState(open);
  const back = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const kept = useRef<ReactNode>(children);
  if (open) kept.current = children;

  const exit = useRef<(Animation | null)[]>([]);
  useEffect(() => {
    if (open) {
      // opened again while it was still leaving: stop the exit (a cancelled exit doesn't unmount it)
      exit.current.forEach((a) => a?.cancel());
      exit.current = [];
      closing.current = false;
      setMounted(true);
    } else if (mounted && !closing.current) {
      closing.current = true;
      const done = () => {
        closing.current = false;
        setMounted(false);
      };
      // it leaves from wherever it is, a swipe partway down included; held there until it unmounts
      const fade = play(back.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" });
      const drop = play(card.current, [{ transform: card.current?.style.transform || "none" }, { transform: "translateY(100%)" }], { duration: 280, easing: EASE.leave, fill: "forwards" });
      exit.current = [fade, drop];
      if (drop) drop.onfinish = done;
      else done();
    }
  }, [open, mounted]);

  useLayoutEffect(() => {
    if (!mounted || !open || !card.current) return;
    card.current.style.transform = "";
    play(back.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
    play(card.current, [{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 550, easing: EASE.settle });
  }, [mounted, open]);

  useEffect(() => {
    if (!open) return;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stack[stack.length - 1] === id && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
    };
  }, [open, onClose, id]);

  // swipe down on the handle area to dismiss
  const drag = useRef<{ y: number; t: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, t: performance.now() };
    // the finger takes over from the rise, if it's still going
    card.current?.getAnimations().forEach((a) => a.finish());
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !card.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    card.current.style.transform = `translateY(${dy}px)`;
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || !card.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    const v = dy / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    // far or fast enough: it goes on down from where the finger left it
    if (dy > 120 || v > 0.6) requestClose();
    else {
      card.current.style.transform = "";
      play(card.current, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 350, easing: EASE.pop });
    }
  };

  if (!mounted) return null;
  return createPortal(
    // only a tap on the backdrop itself closes: taps inside the sheet go on to the page (links stay in-page)
    <div className="sheet-backdrop" ref={back} onClick={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        className="sheet"
        style={gel ? ({ ["--gel" as string]: gel } as React.CSSProperties) : undefined}
      >
        <div className="sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="sheet-handle" aria-hidden="true" />
          <div className="sheet-head">
            {title ? (
              <h2 className="sheet-title" id={titleId}>
                {title}
              </h2>
            ) : (
              <span />
            )}
            <button className="icon-btn sheet-close" onClick={requestClose} onPointerDown={(e) => e.stopPropagation()} aria-label={ui("close")}>
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{open ? children : kept.current}</div>
      </div>
    </div>,
    document.body,
  );
}
