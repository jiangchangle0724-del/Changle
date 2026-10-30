import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, reduced } from "../lib/anim";
import { useStore } from "../store";

/**
 * A bottom sheet. It rises with a little weight, can be swiped down by its handle, and
 * stays mounted until its exit animation has finished.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  gel,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** the game color this sheet belongs to (primary buttons glow in it) */
  gel?: string;
  tone?: string;
}) {
  const { ui } = useStore();
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
      onClose();
    } else gsap.to(card.current, { y: 0, duration: 0.35, ease: "back.out(1.6)" });
  };

  if (!mounted) return null;
  return createPortal(
    <div className="sheet-backdrop" ref={back} onClick={onClose}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        className="sheet"
        style={gel ? ({ ["--gel" as string]: gel } as React.CSSProperties) : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="sheet-handle" aria-hidden="true" />
          <div className="sheet-head">
            {title ? <h2 className="sheet-title">{title}</h2> : <span />}
            <button className="icon-btn sheet-close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label={ui("close")}>
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
