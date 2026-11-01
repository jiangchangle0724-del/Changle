import { Confetti, Figure } from "../../components/Figure";
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
  const named = RAISED.includes(state);
  return (
    <div className={`tn-mate ${me ? "is-me" : ""}`} data-state={state} style={{ ["--x" as string]: x, ["--dir" as string]: i % 2 ? -1 : 1 }}>
      <span className="tn-mate-shadow" />
      <div className="tn-mate-hop" key={state}>
        <div className="tn-mate-bob">
          <Figure seat={seat} />
        </div>
      </div>
      {state === "win" || state === "first" ? <Confetti key={state} className="tn-confetti" /> : null}
      {named && <span className="tn-mate-name">{seat.name}</span>}
    </div>
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
