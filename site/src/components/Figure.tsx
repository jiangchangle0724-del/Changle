import { useMemo, useState } from "react";
import { AV_COLORS, Avatar, colorFor } from "../account/Avatar";
import { API } from "../config";
import type { SeatView } from "../shared/protocol";

/**
 * Someone at the table, standing: their AI-drawn figure (lifted off its backdrop), or, without
 * one, their round face on a little body in their colour. As tall as its box (`--fig-h`).
 */
export function Figure({ seat, className = "" }: { seat: SeatView; className?: string }) {
  const [broken, setBroken] = useState(false);
  const color = AV_COLORS[(seat.uid ? (seat.ac ?? 0) : colorFor(seat.id)) % AV_COLORS.length];
  const src = seat.uid && seat.fg && !broken ? `${API}/figure/${seat.uid}/cut?v=${seat.fg}` : null;
  return (
    <span className={`fig ${className}`} style={{ ["--tc" as string]: color }}>
      {src ? (
        <img className="fig-img" src={src} alt="" draggable={false} decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span className="fig-token">
          <span className="fig-token-head">
            <Avatar uid={seat.uid} name={seat.name} av={seat.av ?? 0} ac={seat.uid ? seat.ac : colorFor(seat.id)} size={64} frame={seat.fr} />
          </span>
          <svg className="fig-token-body" viewBox="0 0 60 56" aria-hidden="true">
            <g stroke="rgba(14,12,34,0.55)" strokeWidth="2.2">
              <rect x="3" y="9" width="10" height="25" rx="5" fill="var(--tc)" />
              <rect x="47" y="9" width="10" height="25" rx="5" fill="var(--tc)" />
              <rect x="11" y="2" width="38" height="44" rx="16" fill="var(--tc)" />
              <ellipse cx="22" cy="50" rx="8.5" ry="5" fill="#f5f4fd" />
              <ellipse cx="38" cy="50" rx="8.5" ry="5" fill="#f5f4fd" />
            </g>
            <rect x="21" y="13" width="18" height="25" rx="9" fill="rgba(255,255,255,0.22)" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** A burst of confetti from a point (absolute: place it where it should come from). */
export function Confetti({ n = 14, className = "" }: { n?: number; className?: string }) {
  const bits = useMemo(
    () =>
      Array.from({ length: n }, (_, k) => ({
        a: (k / n) * 360 + Math.random() * 20,
        r: 38 + Math.random() * 34,
        c: ["var(--gel-amber)", "var(--gel-pink)", "var(--gel-cyan)", "var(--gel-mint)", "var(--moon)"][k % 5],
        d: Math.random() * 0.12,
      })),
    [n],
  );
  return (
    <span className={`confetti ${className}`} aria-hidden="true">
      {bits.map((b, k) => (
        <i key={k} style={{ ["--a" as string]: `${b.a}deg`, ["--r" as string]: `${b.r}px`, ["--d" as string]: `${b.d}s`, background: b.c }} />
      ))}
    </span>
  );
}

export type MomentKind = "king" | "winner" | "out" | "picked";

/**
 * One person's moment on a small lit stage: the king on a throne with a crown, an award winner
 * with a sash and confetti, the one voted out under a hard spotlight with what they really were.
 */
export function Moment({
  seat,
  kind,
  tag,
  tagTone = "neutral",
  caught,
  small,
}: {
  seat: SeatView;
  kind: MomentKind;
  tag?: string;
  tagTone?: "bad" | "good" | "neutral";
  caught?: boolean;
  /** a smaller stage, where the game needs the room (the bottle's in Truth or Dare) */
  small?: boolean;
}) {
  return (
    <div className={`moment moment-${kind} ${caught ? "is-caught" : ""} ${small ? "is-sm" : ""}`} aria-hidden="true">
      <span className="moment-beam" />
      <span className="moment-floor" />
      {kind === "king" && (
        <svg className="moment-throne" viewBox="0 0 120 150">
          <path d="M14 150 V58 C14 30 30 10 60 4 C90 10 106 30 106 58 V150 Z" fill="#7a1530" stroke="#ffcf5a" strokeWidth="4" />
          <path d="M28 150 V64 C28 44 40 28 60 22 C80 28 92 44 92 64 V150 Z" fill="#a51f43" />
          <circle cx="60" cy="40" r="7" fill="#ffcf5a" />
          <rect x="6" y="96" width="108" height="16" rx="5" fill="#ffcf5a" />
        </svg>
      )}
      <span className="moment-fig">
        <Figure seat={seat} />
        {kind === "king" && (
          <svg className="moment-crown" viewBox="0 0 64 44">
            <path d="M4 40 L8 10 L22 24 L32 4 L42 24 L56 10 L60 40 Z" fill="#ffcf5a" stroke="#b9861d" strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx="32" cy="30" r="4.5" fill="#ff5fa2" />
            <circle cx="16" cy="32" r="3" fill="#31b9ff" />
            <circle cx="48" cy="32" r="3" fill="#31b9ff" />
          </svg>
        )}
        {kind === "winner" && (
          <>
            <span className="moment-sash" />
            <span className="moment-medal" />
          </>
        )}
      </span>
      {kind === "winner" && <Confetti className="moment-confetti" />}
      {tag && <span className={`moment-tag is-${tagTone}`}>{tag}</span>}
    </div>
  );
}

/** Everyone at the table, standing together on the lobby's floor (the host with a small crown). */
export function RoomFigures({ seats, host }: { seats: SeatView[]; host: string }) {
  if (!seats.length) return null;
  return (
    <div className={`room-figs ${seats.length > 7 ? "is-crowded" : ""}`} aria-hidden="true">
      {seats.map((s, i) => (
        <span key={s.id} className={`room-fig ${s.on ? "" : "is-away"} ${s.watch ? "is-watching" : ""}`} style={{ ["--i" as string]: i }}>
          {s.id === host && (
            <svg className="room-fig-crown" viewBox="0 0 64 44">
              <path d="M4 40 L8 10 L22 24 L32 4 L42 24 L56 10 L60 40 Z" fill="#ffcf5a" stroke="#b9861d" strokeWidth="2.5" strokeLinejoin="round" />
            </svg>
          )}
          <Figure seat={s} />
        </span>
      ))}
    </div>
  );
}

/** idle: standing; dance: dancing; frozen: stopped dead, a frosty glint; caught: moved, toppling grey;
 *  lean: leaning back (limbo, by --lean); pass: made it; fail: fell over; cheers: raising a glass */
export type Pose = "idle" | "dance" | "frozen" | "caught" | "lean" | "pass" | "fail" | "cheers";

/** People in a row, each doing what the game has them doing (dancing, frozen, leaning back...). */
export function Lineup({ items, lean = 0, className = "" }: { items: { seat: SeatView; pose: Pose }[]; lean?: number; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={`lineup ${items.length > 7 ? "is-crowded" : ""} ${className}`} aria-hidden="true" style={{ ["--lean" as string]: `${-lean}deg` }}>
      {items.map(({ seat, pose }, i) => (
        <span key={seat.id} className="lineup-fig" data-pose={pose} style={{ ["--i" as string]: i }}>
          <Figure seat={seat} />
          {pose === "pass" && (
            <svg className="lineup-badge" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="10" fill="var(--go)" />
              <path d="M5.5 10.5 L8.6 13.4 L14.5 7" fill="none" stroke="var(--night)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}
