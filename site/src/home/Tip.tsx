import { Beer, Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { Sheet } from "../components/Sheet";
import { TIP_EMAIL } from "../config";
import { gsap, reduced, useGSAP } from "../lib/anim";
import { sfx } from "../lib/sfx";
import { useStore } from "../store";

/** The tip jar in the bottom corner of the home screen. */
export function TipButton() {
  const { ui } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.fromTo(ref.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, delay: 1.1, clearProps: "transform,opacity" });
    },
    { scope: ref },
  );
  return (
    <>
      <button
        type="button"
        ref={ref}
        className="tip-btn"
        onClick={() => {
          sfx.clink();
          setOpen(true);
        }}
      >
        <Beer size={17} />
        {ui("tip")}
      </button>
      <TipSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TipSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ui } = useStore();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TIP_EMAIL);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = TIP_EMAIL;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* the address is on screen */
      }
      ta.remove();
    }
    setCopied(true);
    sfx.pop();
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Sheet open={open} onClose={onClose} title={ui("tipTitle")} gel="#ffb82e">
      <div className="tip">
        <p className="tip-body">{ui("tipBody")}</p>
        {TIP_EMAIL ? (
          <>
            <div className="tip-card">
              <span className="field-label">{ui("tipTo")}</span>
              <p className="tip-email">{TIP_EMAIL}</p>
              <button type="button" className="btn btn-primary btn-block" onClick={copy}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? ui("tipCopied") : ui("tipCopy")}
              </button>
            </div>
            <p className="hint">{ui("tipSteps")}</p>
          </>
        ) : (
          <p className="tip-card hint">{ui("tipPending")}</p>
        )}
        <p className="tip-thanks">{ui("tipThanks")}</p>
      </div>
    </Sheet>
  );
}
