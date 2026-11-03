import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { DeckSide } from "../../../shared/dj/types";

/** A record turned this far (degrees, either way, all told) is a scratch. */
const SCRATCH_DEG = 40;
/** Turned back (anticlockwise) this far is a rewind: the record spun back. */
const REWIND_DEG = 200;
/** A finger held on the record this long without turning it stops the record: the brake. */
const HOLD_MS = 450;
const STILL_DEG = 12;

export type Move = "scratch" | "rewind" | "brake";

/** The turn from one angle to the next, the short way round (-180 to 180). */
const turnOf = (from: number, to: number) => {
  const d = to - from;
  return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
};

/** What a finger did on the record: turned it back a long way, turned it, or held it still. */
export function moveOf(g: { total: number; net: number; held: boolean }): Move | null {
  if (g.held) return "brake";
  if (g.net <= -REWIND_DEG) return "rewind";
  if (g.total >= SCRATCH_DEG) return "scratch";
  return null;
}

/**
 * 打碟 · DJ Booth on a phone: one deck as a turntable (Steve on Nov 2: the page should look like a
 * DJ deck, with records). The record spins while its deck is on the air; a finger on it is the
 * DJ's hand on the vinyl: turn it back and forth and it's a scratch, spin it back a long way and the
 * music rewinds, hold it still and the music brakes to a stop. Each lands on the big screen from the
 * next beat, like the pads.
 */
export function Platter({ side, name, status, on, cued, live, zh, onMove }: { side: DeckSide; name: string; status: string | null; on: boolean; cued: boolean; live: boolean; zh: boolean; onMove: (m: Move) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const g = useRef<{ last: number; total: number; net: number; held: boolean; timer: number } | null>(null);
  const [turn, setTurn] = useState(0);
  const [hand, setHand] = useState<"" | "turn" | "hold">("");
  useEffect(() => () => window.clearTimeout(g.current?.timer), []);

  const angle = (e: PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const timer = window.setTimeout(() => {
      const x = g.current;
      if (!x || x.total > STILL_DEG) return;
      // held still: the record stops under the hand
      x.held = true;
      setHand("hold");
      onMove("brake");
    }, HOLD_MS);
    g.current = { last: angle(e), total: 0, net: 0, held: false, timer };
    setHand("turn");
  };
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const x = g.current;
    if (!x || x.held) return;
    const a = angle(e);
    const d = turnOf(x.last, a);
    x.last = a;
    x.total += Math.abs(d);
    x.net += d;
    setTurn((t) => t + d);
  };
  const up = () => {
    const x = g.current;
    if (!x) return;
    window.clearTimeout(x.timer);
    g.current = null;
    const m = x.held ? null : moveOf(x);
    if (m) onMove(m);
    setHand("");
    setTurn(0);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!live || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onMove("scratch");
  };

  return (
    <div className={`djk-deck djk-platter is-${side} ${on ? "is-on" : ""} ${cued ? "is-cued" : ""} ${hand ? `is-${hand}` : ""}`}>
      <div
        ref={el}
        className="djk-vinyl"
        role="button"
        tabIndex={live ? 0 : -1}
        aria-disabled={!live}
        aria-label={zh ? `${side.toUpperCase()} 碟唱盘：来回搓是搓碟，往回转一大圈是倒带，按住不动是刹车` : `Deck ${side.toUpperCase()}: rub it to scratch, spin it back to rewind, hold it to brake`}
        onPointerDown={down}
        onPointerMove={drag}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        style={{ ["--turn" as string]: `${turn}deg` } as CSSProperties}
      >
        <div className="djk-vinyl-disc">
          <span className="djk-vinyl-label">{side.toUpperCase()}</span>
        </div>
      </div>
      <span className="djk-tonearm" aria-hidden="true" />
      <span className="djk-platter-name">{name}</span>
      {status && <span className={`djk-platter-status ${on ? "is-on" : cued ? "is-next" : ""}`}>{status}</span>}
    </div>
  );
}
