import { Crown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "../account/Avatar";
import { gsap, reduced } from "../lib/anim";
import type { Player } from "../store";
import { useStore } from "../store";

/** "Pass the phone to Amy": a curtain that keeps the next screen private until they tap. */
export function PassCurtain({ name, note, onReady }: { name: string; note?: string; onReady: () => void }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current.querySelector(".pass-name"), { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.6)", clearProps: "transform,opacity" });
  }, [name]);
  return (
    <div className="pass-curtain" ref={ref}>
      <Avatar name={name} size={84} />
      <p className="pass-lead">{lang === "zh" ? "把手机交给" : "Pass the phone to"}</p>
      <p className="pass-name">{name}</p>
      {note && <p className="hint pass-note">{note}</p>}
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onReady}>
        {lang === "zh" ? `我是 ${name}` : `I'm ${name}`}
      </button>
    </div>
  );
}

/** A player's face on the one-phone games (no profile, so a letter on a color). */
export function NameFace({ name, size = 40 }: { name: string; size?: number }) {
  return <Avatar name={name} size={size} />;
}

export type Row = { id: string; name: string; score: number; face: ReactNode; note?: ReactNode };

/** Scores, highest first, with bars; the leader wears the crown. */
export function Leaderboard({ rows, unit, highlight }: { rows: Row[]; unit?: string; highlight?: string[] }) {
  const sorted = rows.slice().sort((a, b) => b.score - a.score);
  const top = Math.max(1, ...sorted.map((r) => r.score));
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current.querySelectorAll(".lb-bar > i"), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "settle", stagger: 0.06, clearProps: "transform" });
  }, [rows.length]);
  return (
    <ol className="leaderboard" ref={ref}>
      {sorted.map((r, i) => (
        <li key={r.id} className={`lb-row ${highlight?.includes(r.id) ? "is-hot" : ""}`}>
          <span className="lb-face">
            {r.face}
            {i === 0 && r.score > 0 && (
              <span className="lb-crown" aria-hidden="true">
                <Crown size={12} strokeWidth={2.6} />
              </span>
            )}
          </span>
          <span className="lb-main">
            <strong>{r.name}</strong>
            {r.note && <small>{r.note}</small>}
            <span className="lb-bar" aria-hidden="true">
              <i style={{ width: `${(r.score / top) * 100}%` }} />
            </span>
          </span>
          <span className="lb-score tabular">
            {r.score}
            {unit && <small>{unit}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Seconds left until a deadline on this phone's clock, re-rendering every quarter second. */
export function useSecondsLeft(endsAt: number | null, now: () => number) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => bump((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now()) / 1000)) : 0;
}

/** Bilingual line: the reader's language, with the other one underneath. */
export function Both({ t, className = "" }: { t: { zh: string; en: string }; className?: string }) {
  const { lang } = useStore();
  const main = lang === "zh" ? t.zh : t.en;
  const other = lang === "zh" ? t.en : t.zh;
  return (
    <span className={`both ${className}`}>
      <span className="both-main">{main}</span>
      {other !== main && <span className="both-other">{other}</span>}
    </span>
  );
}

export const byId = (players: Player[]) => Object.fromEntries(players.map((p) => [p.id, p]));
