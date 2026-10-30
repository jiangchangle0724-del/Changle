import { Crown, Trophy } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { T } from "../../i18n";
import { gsap, reduced } from "../../lib/anim";
import { sfx } from "../../lib/sfx";
import { useStore } from "../../store";
import { Both } from "../common";

/** The award up for grabs this round. */
export function AwardCard({ title, round, total, custom }: { title: T; round: number; total: number; custom?: boolean }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current) return;
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { rotateX: -70, y: 30, opacity: 0 }, { rotateX: 0, y: 0, opacity: 1, duration: 0.7, ease: "back.out(1.4)", clearProps: "transform,opacity" });
    tl.fromTo(ref.current.querySelector(".award-trophy"), { scale: 0.4, rotate: -18 }, { scale: 1, rotate: 0, duration: 0.6, ease: "elastic.out(1, 0.5)", clearProps: "transform" }, 0.25);
  }, [title.zh, title.en, round]);
  return (
    <div className="award-card" ref={ref}>
      <span className="award-count tabular">{lang === "zh" ? `第 ${round} 个奖，共 ${total} 个` : `Award ${round} of ${total}`}</span>
      <span className="award-trophy" aria-hidden="true">
        <Trophy size={30} strokeWidth={2} />
      </span>
      {custom ? <span className="award-title both-main">{lang === "zh" ? title.zh : title.en}</span> : <Both t={title} className="award-title" />}
    </div>
  );
}

export type Nominee = { id: string; name: string; face: (size: number) => ReactNode; count: number };

/** "And the award goes to…": the winner, then everyone's votes as bars. */
export function AwardReveal({ title, winners, nominees }: { title: T; winners: Nominee[]; nominees: Nominee[] }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const key = winners.map((w) => w.id).join(",");
  useEffect(() => {
    if (!ref.current) return;
    if (reduced()) {
      sfx.crown();
      return;
    }
    const q = gsap.utils.selector(ref.current);
    const tl = gsap.timeline();
    // drum roll, then the name
    sfx.drum(0.7);
    tl.call(() => sfx.drum(0.8), [], 0.35)
      .call(() => sfx.drum(1), [], 0.7)
      .fromTo(q(".reveal-goes"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, clearProps: "transform,opacity" }, 0)
      .fromTo(q(".winner"), { scale: 0.2, rotate: -12, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.8, ease: "back.out(2)", stagger: 0.12, clearProps: "transform,opacity" }, 1.05)
      .call(() => sfx.crown(), [], 1.05)
      .fromTo(q(".confetti i"), { y: 0, x: 0, opacity: 1, rotate: 0 }, { y: () => gsap.utils.random(-160, -60), x: () => gsap.utils.random(-140, 140), rotate: () => gsap.utils.random(-260, 260), opacity: 0, duration: 1.6, ease: "power2.out", stagger: 0.01 }, 1.1)
      .fromTo(q(".vote-row"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.07, clearProps: "transform,opacity" }, 1.6)
      .fromTo(q(".vote-row .vote-fill"), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "settle", stagger: 0.07, clearProps: "transform" }, 1.7);
    return () => {
      tl.kill();
    };
  }, [key]);
  const max = Math.max(1, ...nominees.map((n) => n.count));
  return (
    <div className="award-reveal" ref={ref}>
      <p className="reveal-goes">{lang === "zh" ? "获奖的是" : "And the award goes to"}</p>
      <div className="winners">
        {winners.map((w) => (
          <div key={w.id} className="winner">
            <span className="winner-face">
              {w.face(winners.length > 2 ? 64 : 88)}
              <span className="winner-crown" aria-hidden="true">
                <Crown size={16} strokeWidth={2.6} />
              </span>
            </span>
            <strong>{w.name}</strong>
          </div>
        ))}
        <span className="confetti" aria-hidden="true">
          {Array.from({ length: 22 }, (_, i) => (
            <i key={i} style={{ ["--c" as string]: ["#ff8c42", "#f5df3b", "#ff5fa2", "#4be38f", "#31b9ff", "#b072ff"][i % 6] }} />
          ))}
        </span>
      </div>
      <p className="hint reveal-title">{lang === "zh" ? `「${title.zh}」` : `"${title.en}"`}</p>
      <ul className="vote-rows">
        {nominees
          .filter((n) => n.count > 0)
          .sort((a, b) => b.count - a.count)
          .map((n) => (
            <li key={n.id} className={`vote-row ${winners.some((w) => w.id === n.id) ? "is-top" : ""}`}>
              {n.face(30)}
              <span className="vote-name">{n.name}</span>
              <span className="vote-track" aria-hidden="true">
                <span className="vote-fill" style={{ width: `${(n.count / max) * 100}%` }} />
              </span>
              <span className="vote-n tabular">{n.count}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export type Shelf = { id: string; name: string; face: (size: number) => ReactNode; awards: T[] };

/** The end of the night: everyone's trophies, the most decorated on top. */
export function Ceremony({ shelves }: { shelves: Shelf[] }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const sorted = shelves.slice().sort((a, b) => b.awards.length - a.awards.length);
  const top = sorted[0]?.awards.length ?? 0;
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current.querySelectorAll(".shelf"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.09, ease: "back.out(1.4)", clearProps: "transform,opacity" });
  }, [shelves.length]);
  return (
    <div className="ceremony" ref={ref}>
      <h2 className="ceremony-title">{lang === "zh" ? "颁奖典礼" : "The Awards"}</h2>
      <ul className="shelves">
        {sorted.map((s) => (
          <li key={s.id} className={`shelf ${top > 0 && s.awards.length === top ? "is-mvp" : ""}`}>
            <span className="shelf-face">{s.face(48)}</span>
            <span className="shelf-main">
              <strong>
                {s.name}
                {top > 0 && s.awards.length === top && <span className="mvp-tag">{lang === "zh" ? "全场最佳" : "MVP"}</span>}
              </strong>
              {s.awards.length ? (
                <span className="shelf-awards">
                  {s.awards.map((a, i) => (
                    <span key={i} className="award-chip">
                      <Trophy size={12} strokeWidth={2.4} />
                      {lang === "zh" ? a.zh : a.en}
                    </span>
                  ))}
                </span>
              ) : (
                <small className="hint">{lang === "zh" ? "今晚低调" : "Kept a low profile"}</small>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
