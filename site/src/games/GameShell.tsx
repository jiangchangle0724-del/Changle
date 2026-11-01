import { MotionConfig } from "motion/react";
import { useCallback, useState, type ReactNode } from "react";
import type { T } from "../i18n";
import { useStore } from "../store";
import { LangTab, TopBar } from "../components/TopBar";
import { Sheet } from "../components/Sheet";
import { PenaltyStamp, type PenaltyCall } from "../components/PenaltyStamp";

export function usePenalty() {
  const [call, setCall] = useState<PenaltyCall | null>(null);
  const [after, setAfter] = useState<(() => void) | null>(null);
  const show = useCallback((c: PenaltyCall, then?: () => void) => {
    setCall(c);
    setAfter(() => then ?? null);
  }, []);
  const done = useCallback(() => {
    setCall(null);
    after?.();
    setAfter(null);
  }, [after]);
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
        {/* a mixed table switches language here, mid-game, without losing the game */}
        <div className="settings-row">
          <span>{ui("language")}</span>
          <LangTab />
        </div>
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
  const [i, setI] = useState(0);
  const current = players[i % Math.max(1, players.length)];
  const next = () => setI((n) => (n + 1) % Math.max(1, players.length));
  const left = players[(i - 1 + players.length) % Math.max(1, players.length)];
  const right = players[(i + 1) % Math.max(1, players.length)];
  return { current, next, left, right, index: i, setIndex: setI };
}
