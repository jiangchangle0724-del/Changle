import { Check, Crown } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Figure } from "../components/Figure";
import { GAME_BY_ID } from "../games/registry";
import type { T } from "../i18n";
import { gsap, reduced } from "../lib/anim";
import { confetti, type ConfettiOpts } from "../lib/confetti";
import { sfx } from "../lib/sfx";
import { SeatFace } from "../online/People";
import { useRoom } from "../online/RoomContext";
import type { GameId, SeatView } from "../shared/protocol";
import { useStore } from "../store";
import "../styles/tv-show.css";

/**
 * The pieces every game's big-screen view is built from: the lit room on a 1600x900 stage, the
 * game's name in neon top left, the round and the clock top right, the players standing on the
 * floor, the podium. Read from three metres: the smallest words are 22px on this stage (about 26
 * on a 1080p TV, 18 on a 720p one), everything that matters is far bigger.
 */

/* ------------------------------------------------------------------ language */

/** The page's language: the reader's leads, the other rides beneath it. */
export function useLang() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return {
    lang,
    zh,
    tx: (a: string, b: string) => (zh ? a : b),
    tr: (x: T) => (zh ? x.zh : x.en),
    other: (x: T) => (zh ? x.en : x.zh),
  };
}

/** A title in both languages: the reader's large, the other one smaller underneath. */
export function Bi({ t, className = "" }: { t: T; className?: string }) {
  const { tr, other, zh } = useLang();
  const main = tr(t);
  const sub = other(t);
  return (
    <span className={`tvx-bi ${className}`}>
      <span className={`tvx-bi-main ${zh ? "is-zh" : ""}`}>{main}</span>
      {sub && sub !== main && <span className="tvx-bi-sub">{sub}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ the people at the table */

export function useSeats() {
  const { room } = useRoom();
  const seats = room?.seats ?? [];
  return {
    seats,
    /** the people in the games (someone only watching isn't one) */
    players: seats.filter((s) => !s.watch),
    seat: (pid: string | null | undefined) => (pid ? seats.find((s) => s.id === pid) : undefined),
    name: (pid: string | null | undefined) => (pid ? (seats.find((s) => s.id === pid)?.name ?? "?") : ""),
  };
}

/** Names joined the way the reader's language joins them. */
export const joinNames = (names: string[], zh: boolean) => (zh ? names.join("、") : names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/* ------------------------------------------------------------------ the stage */

const ConfettiCtx = createContext<RefObject<HTMLCanvasElement | null> | null>(null);

/** Confetti over the whole stage, from a point (fractions of the stage). */
export function useConfetti() {
  const ref = useContext(ConfettiCtx);
  return (opts: ConfettiOpts) => {
    if (!reduced()) confetti(ref?.current ?? null, opts);
  };
}

/**
 * The room a game plays in on the big screen: the night lit by the game's gel from above, two
 * stage beams, a floor where the players stand; the name in neon and, opposite, the round and
 * the clock. `set` dresses the room for the game (a lamp, a curtain); the scene goes in children.
 */
export function TvShow({ game, round, clock, set, className = "", phase, children }: { game: GameId; round?: ReactNode; clock?: ReactNode; set?: ReactNode; className?: string; phase?: string; children: ReactNode }) {
  const meta = GAME_BY_ID[game];
  const canvas = useRef<HTMLCanvasElement>(null);
  return (
    <ConfettiCtx.Provider value={canvas}>
      <div className={`tvx ${className}`} data-phase={phase} style={{ ["--gel" as string]: meta.gel } as CSSProperties}>
        <div className="tvx-room" aria-hidden="true">
          <i className="tvx-wash" />
          <i className="tvx-beam tvx-beam-l" />
          <i className="tvx-beam tvx-beam-r" />
          {set}
          <i className="tvx-floor" />
        </div>
        <header className="tvx-top">
          <Neon name={meta.name} />
          <div className="tvx-round">
            {round}
            {clock}
          </div>
        </header>
        {children}
        <canvas className="tvx-confetti" ref={canvas} aria-hidden="true" />
      </div>
    </ConfettiCtx.Provider>
  );
}

/** The game's name in neon, warming up with a flicker. */
function Neon({ name }: { name: T }) {
  const { tr, other } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reduced() || !ref.current) return;
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { opacity: 0.15 }, { opacity: 1, duration: 0.06, repeat: 5, yoyo: true, ease: "steps(1)" }).to(ref.current, { opacity: 1, duration: 0.2 });
    return () => {
      tl.kill();
    };
  }, []);
  return (
    <div className="tvx-neon" ref={ref}>
      <span className="tvx-neon-main">{tr(name)}</span>
      <span className="tvx-neon-sub">{other(name)}</span>
    </div>
  );
}

/** "Award 3 of 8", in the corner beside the clock. */
export function RoundTag({ children }: { children: ReactNode }) {
  return <span className="tvx-round-name tabular">{children}</span>;
}

/* ------------------------------------------------------------------ the clock */

/**
 * Seconds left, as a ring that empties like a glass: the game's gel, Stop Red for the last ten,
 * which knock on the screen that plays the show. `paused`: the server time it stopped at.
 */
export function TvClock({ endsAt, total, sound, paused = null, size = 96 }: { endsAt: number; total: number; sound: boolean; paused?: number | null; size?: number }) {
  const { now } = useRoom();
  const [, bump] = useState(0);
  useEffect(() => {
    if (!endsAt || paused) return;
    const id = window.setInterval(() => bump((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [endsAt, paused]);
  const left = Math.max(0, endsAt - (paused ?? now()));
  const secs = Math.ceil(left / 1000);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = secs;
    if (!sound || paused || prev === null || prev === secs) return;
    if (secs > 0 && secs <= 10) sfx.countdown(secs);
    else if (secs === 0 && prev > 0) sfx.timeUp();
  }, [secs, sound, paused]);
  if (!endsAt) return null;
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const late = secs <= 10 && !paused;
  return (
    <span className={`tvx-clock ${late ? "is-late" : ""}`} role="timer" aria-label={`${secs}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="tvx-clock-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="tvx-clock-arc" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="tvx-clock-n tabular">{secs}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ moments on the beat */

/**
 * A GSAP timeline for one moment (a reveal, the podium) that keeps to the clock: a TV's browser
 * that stalls for a moment lets an animation fall behind, and the room should see every beat on
 * time. It starts when the moment arrives on this screen (or at `startAt`, the server's time,
 * when the game gives one); beats skipped to catch up stay quiet. Reduced motion: the end state.
 */
export function useBeat(build: (tl: gsap.core.Timeline, q: (sel: string) => Element[]) => void, root: RefObject<HTMLElement | null>, deps: unknown[], startAt?: number) {
  const { now } = useRoom();
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const tl = gsap.timeline({ paused: true });
    build(tl, q);
    if (reduced()) {
      tl.progress(1, true);
      return () => {
        tl.kill();
      };
    }
    const t0 = performance.now() - (startAt ? Math.max(0, now() - startAt) : 0);
    const at = () => Math.min((performance.now() - t0) / 1000, tl.duration());
    tl.time(at(), true);
    tl.play();
    const sync = () => {
      if (document.visibilityState !== "visible" || tl.progress() >= 1) return;
      const want = at();
      if (Math.abs(tl.time() - want) > 0.25) tl.time(want, true);
    };
    const id = window.setInterval(sync, 250);
    return () => {
      window.clearInterval(id);
      tl.progress(1, true);
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ------------------------------------------------------------------ arrivals */

/**
 * A soft sound for each name new to a list (a vote in, a card read), on the screen that plays the
 * show. Nothing for the names already there when the screen arrived.
 */
export function useArrivals(ids: string[], sound: boolean, play: () => void = () => sfx.pop()) {
  const seen = useRef<Set<string> | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const before = seen.current;
    seen.current = new Set(ids);
    if (before && sound && ids.some((id) => !before.has(id))) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Faces popping in as people do something (vote, answer), never saying what they did. */
export function FacesIn({ seats, size = 52, max = 15 }: { seats: (SeatView | undefined)[]; size?: number; max?: number }) {
  return (
    <span className="tvx-faces">
      {seats.slice(0, max).map((s, i) =>
        s ? (
          <span key={s.id} className="tvx-face-in" style={{ ["--i" as string]: i } as CSSProperties}>
            <SeatFace seat={s} size={size} />
          </span>
        ) : null,
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ the players, standing */

export type PersonState = "idle" | "voted" | "ready" | "dim" | "out" | "spot" | "win" | "lose" | "speaking" | "done";
export type Person = { seat: SeatView; state?: PersonState; badge?: ReactNode; tag?: ReactNode; under?: ReactNode };

/** How tall the people stand for how many there are (a crowd stands smaller). */
export function figureHeight(n: number, big = 250) {
  return n <= 4 ? big : n <= 6 ? Math.round(big * 0.86) : n <= 8 ? Math.round(big * 0.74) : n <= 11 ? Math.round(big * 0.6) : Math.round(big * 0.5);
}

/** Everyone in a row on the floor, their names on plates under their feet. */
export function TvLineup({ people, big = 250, className = "" }: { people: Person[]; big?: number; className?: string }) {
  const h = figureHeight(people.length, big);
  return (
    <div className={`tvx-line ${people.length > 8 ? "is-crowded" : ""} ${className}`} style={{ ["--fig-h" as string]: `${h}px` } as CSSProperties}>
      {people.map((p, i) => (
        <TvPerson key={p.seat.id} p={p} i={i} />
      ))}
    </div>
  );
}

export function TvPerson({ p, i = 0 }: { p: Person; i?: number }) {
  return (
    <div className={`tvx-person ${p.seat.on ? "" : "is-away"}`} data-state={p.state ?? "idle"} style={{ ["--i" as string]: i } as CSSProperties}>
      <span className="tvx-person-spot" aria-hidden="true" />
      {p.badge && <span className="tvx-badge">{p.badge}</span>}
      {p.tag && <span className="tvx-tag">{p.tag}</span>}
      <span className="tvx-fig">
        <Figure seat={p.seat} />
      </span>
      <span className="tvx-plate">{p.seat.name}</span>
      {p.under}
    </div>
  );
}

/** The badge over someone who has done their part (voted, read their card). */
export function DoneBadge() {
  return <Check size={26} strokeWidth={3.4} />;
}

/* ------------------------------------------------------------------ the stamp */

/**
 * One word slammed onto the stage (UNDERCOVER, CAUGHT), in a signal color. It slams in by itself,
 * or, `held`, when the moment's own timeline says (see stampIn).
 */
export function Stamp({ children, tone = "stop", className = "", held = false }: { children: ReactNode; tone?: "stop" | "go" | "gel" | "moon"; className?: string; held?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (held || reduced() || !ref.current) return;
    const tw = stampIn(gsap.timeline(), [ref.current], 0);
    return () => {
      tw.progress(1);
      tw.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span className={`tvx-stamp is-${tone} ${className}`} ref={ref}>
      {children}
    </span>
  );
}

/** The stamp's slam, at `at` seconds into a moment's timeline. */
export function stampIn(tl: gsap.core.Timeline, el: Element[], at: number) {
  return tl.fromTo(el, { scale: 2.6, rotate: -18, opacity: 0 }, { scale: 1, rotate: -6, opacity: 1, duration: 0.45, ease: "back.out(2.2)" }, at);
}

/* ------------------------------------------------------------------ the podium */

export type Ranked = { seat: SeatView; score: number; note?: ReactNode };

/**
 * The end of a game: the top three on the steps (first in the middle, highest), everyone else
 * along the front. The steps rise, the people drop onto them, confetti over the winner.
 */
export function TvPodium({ rows, unit, sound, className = "", burstX = 0.5 }: { rows: Ranked[]; unit?: string; sound: boolean; className?: string; burstX?: number }) {
  const ranked = rows.slice().sort((a, b) => b.score - a.score);
  const place = (r: Ranked) => 1 + ranked.filter((x) => x.score > r.score).length;
  const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean) as Ranked[];
  const rest = ranked.slice(3);
  const root = useRef<HTMLDivElement>(null);
  const burst = useConfetti();
  const key = ranked.map((r) => `${r.seat.id}:${r.score}`).join(",");
  useBeat(
    (tl, q) => {
      tl.fromTo(q(".tvx-step"), { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: "power3.out", stagger: 0.12, transformOrigin: "50% 100%" }, 0.3);
      const drops: [string, number][] = [
        ['[data-slot="3"] .tvx-step-top', 1.0],
        ['[data-slot="2"] .tvx-step-top', 1.3],
        ['[data-slot="1"] .tvx-step-top', 1.7],
      ];
      for (const [sel, at] of drops) tl.fromTo(q(sel), { y: -420, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, ease: "bounce.out" }, at);
      tl.fromTo(q(".tvx-rest li"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.06 }, 2.3);
      if (sound) {
        tl.call(() => sfx.drumroll(1.6), [], 0.1);
        tl.call(() => sfx.cheer(2.6), [], 2.15);
      }
      tl.call(() => burst({ x: burstX, y: 0.55, count: 280, spread: 120, power: 28 }), [], 2.1);
    },
    root,
    [key],
  );
  return (
    <div className={`tvx-podium ${className}`} ref={root}>
      <div className="tvx-steps">
        {top.map((r) => {
          const rank = place(r);
          const slot = r === ranked[0] ? 1 : r === ranked[1] ? 2 : 3;
          return (
            <div key={r.seat.id} className="tvx-place" data-slot={slot} data-rank={Math.min(3, rank)}>
              <div className="tvx-step-top">
                {rank === 1 && (
                  <span className="tvx-crown" aria-hidden="true">
                    <Crown size={46} strokeWidth={2.2} />
                  </span>
                )}
                <span className="tvx-fig">
                  <Figure seat={r.seat} />
                </span>
                <span className="tvx-step-name">{r.seat.name}</span>
                <span className="tvx-step-score tabular">
                  {r.score}
                  {unit && <small>{unit}</small>}
                </span>
                {r.note && <span className="tvx-step-note">{r.note}</span>}
              </div>
              <div className="tvx-step">
                <b className="tabular">{rank}</b>
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <ol className="tvx-rest">
          {rest.map((r) => (
            <li key={r.seat.id}>
              <span className="tvx-rest-rank tabular">{place(r)}</span>
              <SeatFace seat={r.seat} size={44} />
              <span className="tvx-rest-name">{r.seat.name}</span>
              <span className="tvx-rest-score tabular">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the scores */

export type BoardRow = { seat: SeatView; score: number; note?: ReactNode; hot?: boolean };

/** Scores, highest first, with bars; the leader wears the crown. */
export function TvBoard({ rows, unit, title, max = 8, className = "" }: { rows: BoardRow[]; unit?: string; title?: ReactNode; max?: number; className?: string }) {
  const sorted = rows.slice().sort((a, b) => b.score - a.score);
  const top = Math.max(1, ...sorted.map((r) => r.score));
  return (
    <div className={`tvx-board ${className}`}>
      {title && <h2>{title}</h2>}
      <ol>
        {sorted.slice(0, max).map((r, i) => (
          <li key={r.seat.id} className={r.hot ? "is-hot" : ""} style={{ ["--i" as string]: i } as CSSProperties}>
            <span className="tvx-board-face">
              <SeatFace seat={r.seat} size={50} />
              {i === 0 && r.score > 0 && (
                <span className="tvx-board-crown" aria-hidden="true">
                  <Crown size={18} strokeWidth={2.6} />
                </span>
              )}
            </span>
            <span className="tvx-board-main">
              <span className="tvx-board-name">{r.seat.name}</span>
              {r.note && <small>{r.note}</small>}
              <span className="tvx-board-bar" aria-hidden="true">
                <i style={{ width: `${(r.score / top) * 100}%` }} />
              </span>
            </span>
            <span className="tvx-board-score tabular">
              {r.score}
              {unit && <small>{unit}</small>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
