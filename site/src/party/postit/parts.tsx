import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { T } from "../../i18n";
import { useStore } from "../../store";

/** A yellow sticky note. `null` is your own forehead: a question mark. */
export function Sticky({ note, size = "md", tilt = 0 }: { note: T | null; size?: "sm" | "md" | "lg"; tilt?: number }) {
  const { lang } = useStore();
  const main = note ? (lang === "zh" ? note.zh : note.en) : "?";
  const other = note && note.zh !== note.en ? (lang === "zh" ? note.en : note.zh) : null;
  return (
    <span className={`sticky sticky-${size} ${note ? "" : "is-mine"}`} style={{ rotate: `${tilt}deg` }}>
      <span className="sticky-main">{main}</span>
      {other && <span className="sticky-other">{other}</span>}
    </span>
  );
}

/** One person at the wall: their face with the note stuck on their forehead. */
export function Forehead({ face, name, note, tilt, turn, solved, children }: { face: ReactNode; name: string; note: T | null; tilt: number; turn?: boolean; solved?: boolean; children?: ReactNode }) {
  return (
    <div className={`forehead ${turn ? "is-turn" : ""} ${solved ? "is-solved" : ""}`}>
      <Sticky note={note} size="sm" tilt={tilt} />
      <span className="forehead-face">
        {face}
        {solved && (
          <span className="forehead-check" aria-hidden="true">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="forehead-name">{name}</span>
      {children}
    </div>
  );
}

/** A steady little tilt per seat so the wall looks hand-stuck, not printed. */
export const tiltFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 9) - 4) * 1.1;
};
