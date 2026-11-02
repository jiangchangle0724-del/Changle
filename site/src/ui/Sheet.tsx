import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBackCloses } from "../router";
import { Button } from "./Button";
import { labels } from "./labels";
import type { CSSProperties } from "react";
import type { SheetProps } from "./types";
import "./Sheet.css";

export function Sheet(props: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // the phone's back button closes the sheet, and closing it any other way takes its entry off again
  useBackCloses(props.open, props.onClose, props.history ?? true);
  const shown = useRef(props.open);
  shown.current = props.open;
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  // a sheet on its way out (still fading) can't be closed a second time: a swipe on the handle is
  // followed by a click on it, and Esc or the backdrop still work during the exit
  const close = useRef(() => {
    if (shown.current) onClose.current();
  });
  const start = useRef<{ x: number; y: number } | null>(null);
  const restore = useRef<(() => void) | null>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!props.open) {
      if (!node.open) return;
      node.classList.add("ui-sheet-leaving");
      const ms = parseFloat(
        getComputedStyle(node).getPropertyValue("--dur-exit"),
      );
      const timer = window.setTimeout(() => node.close(), ms);
      return () => window.clearTimeout(timer);
    }
    if (!restore.current) {
      const opener = document.activeElement as HTMLElement | null;
      const overflow = document.body.style.overflow;
      restore.current = () => {
        document.body.style.overflow = overflow;
        if (opener?.isConnected) opener.focus();
        restore.current = null;
      };
    }
    node.classList.remove("ui-sheet-leaving");
    if (!node.open) node.showModal();
    document.body.style.overflow = "hidden";
  }, [props.open]);
  useEffect(() => {
    const node = dialog.current;
    return () => {
      node?.close();
      restore.current?.();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className={`ui-sheet${props.category ? ` ui-category-${props.category}` : ""}`}
      style={props.gel ? ({ "--gel": props.gel } as CSSProperties) : undefined}
      aria-modal="true"
      aria-labelledby={props.title !== undefined ? titleId : undefined}
      aria-label={props.label}
      onClose={() => {
        if (!dialog.current?.open) restore.current?.();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const targets = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], [tabindex]",
          ),
        ).filter(
          (node) =>
            node.tabIndex >= 0 &&
            !node.matches(":disabled") &&
            node.getClientRects().length > 0,
        );
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <button
        className="ui-sheet-handle"
        type="button"
        aria-label={labels.close[props.lang]}
        onClick={() => close.current()}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const p = start.current;
          start.current = null;
          if (
            p &&
            event.clientY - p.y > 44 &&
            event.clientY - p.y > Math.abs(event.clientX - p.x)
          )
            close.current();
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <span />
      </button>
      <div className="ui-sheet-heading">
        {props.title !== undefined && <h2 id={titleId}>{props.title}</h2>}
        <Button
          tone="icon"
          icon={X}
          label={labels.close[props.lang]}
          onClick={() => close.current()}
        />
      </div>
      <div className="ui-sheet-body" tabIndex={0}>
        {props.children}
      </div>
      {props.footer && <div className="ui-sheet-footer">{props.footer}</div>}
    </dialog>,
    document.body,
  );
}
