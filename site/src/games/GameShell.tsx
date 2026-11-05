import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { T } from "../i18n";
import { useStore } from "../store";
import { LangTab } from "../components/TopBar";
import { Sheet } from "../components/Sheet";
import { PenaltyStamp, type PenaltyCall } from "../components/PenaltyStamp";
import { GameHeader } from "../ui/GameHeader";
import { RosterChip } from "../ui/RosterChip";
import type { GameHeaderProps } from "../ui/types";
import "../ui/base.css";
import "./GameShell.css";

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

/** How many dots a penalty puts by each name it lands on (two sips count twice; safe is none). */
const DOTS: Record<PenaltyCall["kind"], number> = { sip: 1, two: 2, full: 1, everyone: 1, safe: 0 };

/**
 * Every game on one phone sits in this (UI plan A5): the 56px top bar (back, the game's name in both
 * languages, the round or the seconds left, sound, rules), optionally tonight's people under it with
 * the turn and the penalties so far, the game itself, and optionally its one or two buttons kept at
 * the bottom by the thumb. Penalties land with the stamp; the rules sheet switches language mid-game.
 */
export function GameShell({
  title,
  rules,
  onBack,
  children,
  penalty,
  onPenaltyDone,
  right,
  status,
  roster,
  actions,
}: {
  title: T;
  rules: ReactNode;
  onBack: () => void;
  children: ReactNode;
  penalty: PenaltyCall | null;
  onPenaltyDone: () => void;
  /** one more button in the top bar, only if the game truly needs it: an icon there, the icon and its name in the ⋯ menu */
  right?: GameHeaderProps["extra"];
  /** round 3 (of 10), or the seconds left: in the top bar */
  status?: GameHeaderProps["status"];
  /** tonight's people under the top bar: whose turn it is (a player id) and who is out; each penalty adds a dot by its names */
  roster?: { turn?: string; out?: string[] };
  /** the screen's one or two buttons, at the bottom by the thumb; the main one goes last (on the right) */
  actions?: ReactNode;
}) {
  const { ui, lang, sound, setSound, players } = useStore();
  const [rulesOpen, setRulesOpen] = useState(false);

  // the penalties so far, counted from the stamps this game showed
  const [dots, setDots] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!penalty || !roster) return;
    const names = penalty.who.length ? penalty.who : players.map((p) => p.name);
    const n = DOTS[penalty.kind];
    if (n) setDots((d) => Object.fromEntries([...Object.entries(d), ...names.map((name) => [name, (d[name] ?? 0) + n])]));
    // counted once per stamp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penalty]);

  // the row scrolls sideways when the table is long: bring whoever's turn it is into the middle
  const rosterRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rosterRow.current;
    const chip = row?.querySelector("[data-turn]");
    if (!row || !chip) return;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({ left: c.left - r.left - (r.width - c.width) / 2, behavior: still ? "auto" : "smooth" });
  }, [roster?.turn]);

  return (
    <MotionConfig reducedMotion="user">
    <div className={`screen game-screen${actions ? " has-actions" : ""}`}>
      <GameHeader
        title={title}
        lang={lang}
        onBack={onBack}
        status={status}
        sound={{ on: sound, onToggle: () => setSound(!sound) }}
        onHelp={() => setRulesOpen(true)}
        extra={right}
      />
      {roster && players.length > 0 && (
        // a row that scrolls sideways can be reached from the keyboard too (arrow keys scroll it)
        <div className="game-roster" role="list" aria-label={ui("players")} ref={rosterRow} tabIndex={0}>
          {players.map((p) => {
            const state = roster.out?.includes(p.id) ? "out" : roster.turn === p.id ? "turn" : "idle";
            return (
              <div role="listitem" key={p.id} data-turn={state === "turn" || undefined}>
                <RosterChip name={p.name} lang={lang} size="sm" state={state} drinks={dots[p.name] ?? 0} />
              </div>
            );
          })}
        </div>
      )}
      <div className="game-body">{children}</div>
      {actions && <div className="game-actions">{actions}</div>}
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
