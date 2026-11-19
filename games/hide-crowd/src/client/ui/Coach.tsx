// A phone's first practice round, step by step (2026-11-19, the big upgrade's last part, the
// experience): three tips at the moments they matter, each until it's tapped away or its moment has
// passed. Once a phone has been through them it never sees them again (hc.coach). Online rounds don't
// have them: a table plays with friends who explain.
import { useEffect, useState } from "preact/hooks";
import { MATCH_MS } from "../../engine";
import type { GameView } from "../../room/protocol";
import { t, type Key } from "../i18n";

const SEEN = "hc.coach";

/** each tip: from and until how far into the round (ms), what it says, and which control it points at */
export const COACH: readonly { from: number; until: number; text: Key; point?: "punch" }[] = [
  // (after the camera's opening sweep)
  { from: 2_800, until: 8_600, text: "coach1" },
  // (just before the first moment: the horn, the busker, the drill or the firecrackers)
  { from: 8_600, until: 17_000, text: "coach2" },
  { from: 17_500, until: 28_000, text: "coach3", point: "punch" }
];

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // private mode: shown again next time
  }
}

/** Which tip shows now (its index), or -1: none. */
export function coachTip(elapsedMs: number, done: ReadonlySet<number>): number {
  return COACH.findIndex((tip, index) => !done.has(index) && elapsedMs >= tip.from && elapsedMs < tip.until);
}

/** The tip showing now, if this phone hasn't been through them; once the last one is over, never again. */
export function useCoach(game: GameView, on: boolean): { index: number; dismiss: () => void } {
  const [active] = useState(() => on && !seen());
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set());
  const elapsed = MATCH_MS - game.remainingMs;
  const playing = active && game.phase === "playing";
  const index = playing ? coachTip(elapsed, done) : -1;
  const over = active && (game.phase !== "playing" || elapsed >= COACH[COACH.length - 1].until || done.size === COACH.length);
  useEffect(() => {
    if (over) remember();
  }, [over]);
  return { index, dismiss: () => setDone((before) => new Set([...before, index])) };
}

export function Coach(props: { index: number; onDismiss: () => void }) {
  if (props.index < 0) return null;
  const tip = COACH[props.index];
  return (
    <aside class={`coach${tip.point ? ` points-${tip.point}` : ""}`} aria-live="polite" key={props.index}>
      <span class="coach-step">{t("coachStep", { n: props.index + 1, m: COACH.length })}</span>
      <p>{t(tip.text)}</p>
      <button type="button" class="coach-ok" onClick={props.onDismiss}>
        {t("coachOk")}
      </button>
    </aside>
  );
}
