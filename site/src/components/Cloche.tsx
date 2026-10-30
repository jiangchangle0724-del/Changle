import { Eye } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { gsap, reduced } from "../lib/anim";
import { haptic, sfx } from "../lib/sfx";
import { useStore } from "../store";

/**
 * A card under a cover. Tap the cover: it lifts away and the card beneath is revealed.
 * `open` is controlled so a game can decide when the reveal counts. (The name stays from
 * the days it was a dome over a plate.)
 */
export function Cloche({
  open,
  onOpen,
  children,
  label,
  minHeight = 220,
}: {
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
  label?: string;
  minHeight?: number;
}) {
  const { ui, sound } = useStore();
  const cover = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [coverShown, setCoverShown] = useState(!open);
  const was = useRef(open);

  useLayoutEffect(() => {
    const prev = was.current;
    was.current = open;
    if (open === prev) return;
    if (open) {
      // lift the cover off, then show the card
      if (reduced() || !cover.current) {
        setCoverShown(false);
        return;
      }
      const tl = gsap.timeline({ onComplete: () => setCoverShown(false) });
      tl.to(cover.current, { yPercent: -18, rotate: -3, duration: 0.18, ease: "power2.out" })
        .to(cover.current, { yPercent: -125, rotate: -9, opacity: 0, duration: 0.5, ease: "power3.in" }, ">-0.02")
        .fromTo(content.current, { opacity: 0, scale: 0.94, filter: "blur(8px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.5, ease: "back.out(1.6)" }, 0.28);
    } else {
      setCoverShown(true);
    }
  }, [open]);

  // a fresh cover drops back on for the next card
  useLayoutEffect(() => {
    if (!coverShown || !cover.current || reduced()) return;
    if (!open) gsap.fromTo(cover.current, { yPercent: -30, opacity: 0, rotate: 2 }, { yPercent: 0, opacity: 1, rotate: 0, duration: 0.45, ease: "back.out(1.4)" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverShown]);

  return (
    <div className="cloche-wrap" style={{ minHeight }}>
      <div className="cloche-plate porcelain">
        {/* the card is only visible once the cover is off: nothing to peek at round the edges */}
        <div className="cloche-content" ref={content} aria-hidden={!open} style={{ visibility: open ? "visible" : "hidden" }}>
          {children}
        </div>
      </div>
      {coverShown && (
        <button
          type="button"
          ref={cover}
          className="cloche-dome"
          aria-label={label ?? ui("liftLid")}
          disabled={open}
          onClick={() => {
            if (sound) sfx.lift();
            haptic(12);
            onOpen();
          }}
        >
          <span className="cover-mark" aria-hidden="true">
            <Eye size={30} strokeWidth={1.8} />
          </span>
          <span className="cloche-hint">{label ?? ui("tapToReveal")}</span>
        </button>
      )}
    </div>
  );
}
