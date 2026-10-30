import { Snowflake } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, reduced } from "../../lib/anim";
import { GROOVES, type GrooveId } from "../../lib/music";
import { useStore } from "../../store";

export const TRACKS: { id: GrooveId; zh: string; en: string }[] = [
  { id: "disco", zh: "迪斯科", en: "Disco" },
  { id: "house", zh: "浩室", en: "House" },
  { id: "funk", zh: "放克", en: "Funk" },
  { id: "electro", zh: "电音", en: "Electro" },
  { id: "hiphop", zh: "嘻哈", en: "Hip-hop" },
];
export const trackName = (id: string, zh: boolean) => {
  const t = TRACKS.find((x) => x.id === id);
  return t ? (zh ? t.zh : t.en) : id;
};

/** The floor while the music plays: rings that pulse on the beat. */
export function DanceFloor({ groove, children }: { groove: string; children?: ReactNode }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const bpm = GROOVES[groove as GrooveId]?.bpm ?? 120;
  return (
    <div className="floor" style={{ ["--beat" as string]: `${60 / bpm}s` }}>
      <span className="floor-ring r1" aria-hidden="true" />
      <span className="floor-ring r2" aria-hidden="true" />
      <span className="floor-ring r3" aria-hidden="true" />
      <span className="floor-word">{zh ? "跳起来" : "Dance"}</span>
      <span className="floor-track">
        {trackName(groove, zh)}
        <small className="tabular">{bpm} BPM</small>
      </span>
      {children}
    </div>
  );
}

/** The moment the music cuts: the room goes icy and everyone holds still. */
export function FreezeFlash({ children, caught }: { children?: ReactNode; caught?: boolean }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current) return;
    const q = gsap.utils.selector(ref.current);
    gsap.fromTo(ref.current, { backgroundColor: "rgba(255,255,255,0.9)" }, { backgroundColor: "rgba(49,185,255,0.12)", duration: 0.7, ease: "power2.out" });
    gsap.fromTo(q(".freeze-word"), { scale: 1.8, opacity: 0, letterSpacing: "0.3em" }, { scale: 1, opacity: 1, letterSpacing: "0em", duration: 0.5, ease: "expo.out", clearProps: "transform,opacity,letterSpacing" });
    gsap.fromTo(q(".freeze-flake"), { rotate: -90, scale: 0 }, { rotate: 0, scale: 1, duration: 0.8, ease: "back.out(2)", stagger: 0.05 });
  }, []);
  return (
    <div className={`freeze ${caught ? "is-caught" : ""}`} ref={ref} role="alert">
      <span className="freeze-flakes" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Snowflake key={i} className="freeze-flake" size={18 + (i % 3) * 8} />
        ))}
      </span>
      <span className="freeze-word">{caught ? (lang === "zh" ? "你动了！" : "You moved!") : lang === "zh" ? "定住！" : "Freeze!"}</span>
      {children}
    </div>
  );
}

/** How still this phone is being held: full bar is perfectly still. */
export function StillMeter({ still }: { still: number }) {
  const { lang } = useStore();
  return (
    <div className="still">
      <span className="still-label">{lang === "zh" ? "稳不稳" : "Steady"}</span>
      <span className="still-track">
        <span className="still-fill" style={{ width: `${Math.round(still * 100)}%` }} />
      </span>
    </div>
  );
}
