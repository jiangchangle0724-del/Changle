import { MotionConfig } from "motion/react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { T } from "../i18n";
import { useStore } from "../store";
import { TopBar } from "../components/TopBar";
import { Sheet } from "../components/Sheet";
import { PenaltyStamp, type PenaltyCall } from "../components/PenaltyStamp";

export function usePenalty() {
  const [call, setCall] = useState<PenaltyCall | null>(null);
  // What happens after the stamp runs once: a second tap on Continue as the stamp leaves (a quick
  // double tap) finds nothing left to do. Kept in a ref so the stamp on its way out sees it too.
  const after = useRef<(() => void) | null>(null);
  const show = useCallback((c: PenaltyCall, then?: () => void) => {
    after.current = then ?? null;
    setCall(c);
  }, []);
  const done = useCallback(() => {
    const then = after.current;
    after.current = null;
    setCall(null);
    then?.();
  }, []);
  return { call, show, done };
}

export function GameShell({
  title,
  rules,
  onBack,
  children,
  penalty,
  onPenaltyDone,
  right,
}: {
  title: T;
  rules: ReactNode;
  onBack: () => void;
  children: ReactNode;
  penalty: PenaltyCall | null;
  onPenaltyDone: () => void;
  right?: ReactNode;
}) {
  const { ui } = useStore();
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <MotionConfig reducedMotion="user">
    <div className="screen game-screen">
      <TopBar title={title} onBack={onBack} onHelp={() => setRulesOpen(true)} right={right} />
      <div className="game-body">{children}</div>
      <Sheet open={rulesOpen} onClose={() => setRulesOpen(false)} title={ui("rules")}>
        <div className="rules-text">{rules}</div>
      </Sheet>
      <PenaltyStamp call={penalty} onDone={onPenaltyDone} />
    </div>
    </MotionConfig>
  );
}

/** Rotate through players for "whose turn" games. */
export function useTurnOrder() {
  const { players } = useStore();
  // `n` counts the turns taken, so each turn passes once: a second tap on a button that is already
  // leaving the screen (a quick double tap, or the old screen still fading out) calls next() from
  // the turn that has already ended, and must not skip the next player.
  const [turn, setTurn] = useState({ i: 0, n: 0 });
  const len = Math.max(1, players.length);
  const i = turn.i;
  const current = players[i % len];
  const next = () => setTurn((t) => (t.n === turn.n ? { i: (t.i + 1) % len, n: t.n + 1 } : t));
  const setIndex = (k: number) => setTurn((t) => ({ i: k, n: t.n + 1 }));
  const left = players[(i - 1 + players.length) % len];
  const right = players[(i + 1) % len];
  return { current, next, left, right, index: i, setIndex };
}
