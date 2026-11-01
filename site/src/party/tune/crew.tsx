import { useMemo, useState } from "react";
import { AV_COLORS, Avatar, colorFor } from "../../account/Avatar";
import { API } from "../../config";
import type { SeatView } from "../../shared/protocol";

/**
 * Everyone at the table on the stage: their AI-drawn figures (cut out), or for someone without
 * one, their round face on a little body in their colour. They stand along the front edge and
 * bounce to the beat. Whoever buzzes in steps up into the spotlight; the right answer gets a
 * victory hop and confetti, a miss slumps; at the end the top three stand on the podium.
 */

/** line: in the row; spot: buzzed in; win: got it; miss: got it wrong; dim: waiting while someone else answers; 1 2 3: the podium */
export type MateState = "line" | "spot" | "win" | "miss" | "dim" | "first" | "second" | "third";
export type Mate = { seat: SeatView; state: MateState; me: boolean };

const RAISED: MateState[] = ["spot", "win", "first", "second", "third"];

/** Where each mate stands across the stage: the row spread out, the raised ones in the middle (the podium's on its steps). */
function placeAll(mates: Mate[]): string[] {
  const out: string[] = new Array(mates.length).fill("50%");
  const row = mates.map((m, i) => ({ m, i })).filter(({ m }) => !RAISED.includes(m.state));
  const up = mates.map((m, i) => ({ m, i })).filter(({ m }) => RAISED.includes(m.state));
  row.forEach(({ i }, k) => (out[i] = `${row.length === 1 ? 50 : 10 + (80 * k) / (row.length - 1)}%`));
  const podium = up.some(({ m }) => m.state === "first" || m.state === "second" || m.state === "third");
  // (a step is 0.95 of a figure's height wide, 4px apart: see .tn-step)
  const step = "(var(--mate-h) * 0.95 + 4px)";
  if (podium) for (const { m, i } of up) out[i] = m.state === "first" ? "50%" : m.state === "second" ? `calc(50% - ${step})` : `calc(50% + ${step})`;
  else {
    const spread = Math.min(18, 64 / Math.max(1, up.length));
    up.forEach(({ i }, k) => (out[i] = `${50 + (k - (up.length - 1) / 2) * spread}%`));
  }
  return out;
}

export function Crew({ mates }: { mates: Mate[] }) {
  const xs = placeAll(mates);
  const crowded = mates.length > 8;
  return (
    <div className={`tn-crew ${crowded ? "is-crowded" : ""}`} aria-hidden="true">
      {mates.some((m) => m.state === "first") && <Podium />}
      {mates.map((m, i) => (
        <MateView key={m.seat.id} mate={m} x={xs[i]} i={i} />
      ))}
    </div>
  );
}

function MateView({ mate, x, i }: { mate: Mate; x: string; i: number }) {
  const { seat, state, me } = mate;
  const [broken, setBroken] = useState(false);
  const fig = seat.uid && seat.fg && !broken ? `${API}/figure/${seat.uid}/cut?v=${seat.fg}` : null;
  const color = AV_COLORS[(seat.uid ? (seat.ac ?? 0) : colorFor(seat.id)) % AV_COLORS.length];
  const named = RAISED.includes(state);
  return (
    <div
      className={`tn-mate ${me ? "is-me" : ""}`}
      data-state={state}
      style={{ ["--x" as string]: x, ["--dir" as string]: i % 2 ? -1 : 1, ["--tc" as string]: color }}
    >
      <span className="tn-mate-shadow" />
      <div className="tn-mate-hop" key={state}>
        <div className="tn-mate-bob">
          {fig ? <img className="tn-mate-fig" src={fig} alt="" draggable={false} decoding="async" onError={() => setBroken(true)} /> : <Token seat={seat} />}
        </div>
      </div>
      {state === "win" || state === "first" ? <Confetti key={state} /> : null}
      {named && <span className="tn-mate-name">{seat.name}</span>}
    </div>
  );
}

/** Someone without a drawn figure: their round face on a little body, in their colour. */
function Token({ seat }: { seat: SeatView }) {
  return (
    <div className="tn-token">
      <div className="tn-token-head">
        <Avatar uid={seat.uid} name={seat.name} av={seat.av ?? 0} ac={seat.uid ? seat.ac : colorFor(seat.id)} size={64} />
      </div>
      <svg className="tn-token-body" viewBox="0 0 60 56" aria-hidden="true">
        <g stroke="rgba(14,12,34,0.55)" strokeWidth="2.2">
          <rect x="3" y="9" width="10" height="25" rx="5" fill="var(--tc)" />
          <rect x="47" y="9" width="10" height="25" rx="5" fill="var(--tc)" />
          <rect x="11" y="2" width="38" height="44" rx="16" fill="var(--tc)" />
          <ellipse cx="22" cy="50" rx="8.5" ry="5" fill="#f5f4fd" />
          <ellipse cx="38" cy="50" rx="8.5" ry="5" fill="#f5f4fd" />
        </g>
        <rect x="21" y="13" width="18" height="25" rx="9" fill="rgba(255,255,255,0.22)" />
      </svg>
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 14 }, (_, k) => ({
        a: (k / 14) * 360 + Math.random() * 20,
        r: 38 + Math.random() * 34,
        c: ["var(--gel-amber)", "var(--gel-pink)", "var(--gel-cyan)", "var(--gel-mint)", "var(--moon)"][k % 5],
        d: Math.random() * 0.12,
      })),
    [],
  );
  return (
    <span className="tn-confetti">
      {bits.map((b, k) => (
        <i key={k} style={{ ["--a" as string]: `${b.a}deg`, ["--r" as string]: `${b.r}px`, ["--d" as string]: `${b.d}s`, background: b.c }} />
      ))}
    </span>
  );
}

function Podium() {
  return (
    <div className="tn-podium">
      <span className="tn-step tn-step-2">2</span>
      <span className="tn-step tn-step-1">1</span>
      <span className="tn-step tn-step-3">3</span>
    </div>
  );
}

/**
 * Who stands where in Name That Tune, from the game's view: the buzzer in the spotlight, a
 * wrong answer slumped, the right answer(s) cheering, the podium at the end.
 */
export function tuneCrew(
  seats: SeatView[],
  me: string,
  v: { phase: string; buzzer: string | null; locked: string[]; correct: string | null; quiz: boolean; right: string[]; last: { pid: string; ok: boolean } | null; scores: Record<string, number> },
): Mate[] {
  const state = (pid: string): MateState => {
    if (v.phase === "answer") return v.buzzer === pid ? "spot" : "dim";
    if (v.phase === "listen") return v.locked.includes(pid) ? "miss" : "line";
    if (v.phase === "reveal") {
      if (v.quiz) return v.right.includes(pid) ? "win" : "miss";
      if (v.correct) return v.correct === pid ? "win" : "line";
      return v.last && !v.last.ok && v.last.pid === pid ? "miss" : "line";
    }
    return "line";
  };
  const mates = seats.map((s) => ({ seat: s, state: state(s.id), me: s.id === me }));
  if (v.phase === "end") {
    const ranked = [...seats].sort((a, b) => (v.scores[b.id] ?? 0) - (v.scores[a.id] ?? 0)).filter((s) => (v.scores[s.id] ?? 0) > 0);
    const place: MateState[] = ["first", "second", "third"];
    for (const m of mates) {
      const k = ranked.findIndex((s) => s.id === m.seat.id);
      m.state = k >= 0 && k < 3 ? place[k] : "line";
    }
  }
  return mates;
}
