import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, reduced } from "../lib/anim";
import { useBackCloses } from "../router";
import { useStore } from "../store";

/** Open sheets, bottom to top: Esc closes only the top one. */
const stack: number[] = [];
let sheetIds = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

  useEffect(() => {
    if (open) {
      closing.current = false;
      setMounted(true);
    } else if (mounted && !closing.current) {
      closing.current = true;
      const done = () => {
        closing.current = false;
        setMounted(false);
      };
      if (reduced() || !card.current) return done();
      gsap.to(back.current, { opacity: 0, duration: 0.22, ease: "power1.in" });
      gsap.to(card.current, { yPercent: 100, duration: 0.28, ease: "power2.in", onComplete: done });
    }
  }, [open, mounted]);

  useLayoutEffect(() => {
    if (!mounted || !open || !card.current) return;
    if (reduced()) return;
    gsap.fromTo(back.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    gsap.fromTo(card.current, { yPercent: 100 }, { yPercent: 0, duration: 0.55, ease: "expo.out" });
  }, [mounted, open]);

  // (the latest onClose, read when Esc is pressed: an effect that depended on it re-ran on every
  // render of the page under the sheet, and moved this sheet to the top of the stack each time)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stack[stack.length - 1] === id && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
    };
  }, [open, id]);

  // with a keyboard or a screen reader: focus moves into the sheet as it opens, Tab goes round
  // inside it, and focus goes back to whatever opened it once it closes
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = card.current;
    if (!open || !mounted || !node) return;
    const at = document.activeElement as HTMLElement | null;
    if (node.contains(at)) return;
    if (!opener.current && at && at !== document.body) opener.current = at;
    node.focus({ preventScroll: true });
  }, [open, mounted]);
  useEffect(() => {
    if (open) return;
    const to = opener.current;
    opener.current = null;
    const at = document.activeElement;
    // only when focus would otherwise be lost (in the closing sheet, or nowhere)
    if (to?.isConnected && (!at || at === document.body || !!card.current?.contains(at))) to.focus({ preventScroll: true });
  }, [open]);
  const keepFocus = (e: React.KeyboardEvent) => {
    const node = card.current;
    if (e.key !== "Tab" || e.defaultPrevented || !node || !node.contains(e.target as Node)) return;
    const list = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    if (!list.length) return e.preventDefault();
    const first = list[0];
    const last = list[list.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === node)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // swipe down on the handle area to dismiss
  const drag = useRef<{ y: number; t: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, t: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !card.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    gsap.set(card.current, { y: dy });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || !card.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    const v = dy / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    if (dy > 120 || v > 0.6) {
      gsap.set(card.current, { y: 0 });
      gsap.set(card.current, { yPercent: (dy / card.current.offsetHeight) * 100 });
      requestClose();
    } else gsap.to(card.current, { y: 0, duration: 0.35, ease: "back.out(1.6)" });
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
        tabIndex={-1}
        onKeyDown={keepFocus}
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
