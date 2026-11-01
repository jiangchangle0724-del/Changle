import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore, type Player } from "../store";
import { Deck } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { fullDeck, RULES, RULE_BY_RANK, ruleWords, SUIT_GLYPH, SUIT_RED, type Card, type Rank } from "../data/rogue13";
import { GameShell, usePenalty, useTurnOrder } from "./GameShell";
import { PlayerPicker } from "../components/PlayerPicker";
import { UI } from "../i18n";

type Phase = "idle" | "revealed" | "pick" | "group-loser";

export function Rogue13({ onBack }: { onBack: () => void }) {
  const { players, ui, tr, lang, sound } = useStore();
  const deck = useRef(new Deck<Card>(fullDeck()));
  const [card, setCard] = useState<Card | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [holders, setHolders] = useState<Partial<Record<Rank, Player>>>({});
  const [remaining, setRemaining] = useState(deck.current.remaining);
  const [reshuffled, setReshuffled] = useState(false);
  const turn = useTurnOrder();
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;

  const rule = card ? RULE_BY_RANK[card.rank] : null;
  // the card's words: drinking, or the penalty set in settings
  const words = rule ? ruleWords(rule, custom) : null;

  const draw = () => {
    // one card at a time: a double tap on the deck lands on the card still turning over
    if (card) return;
    const { card: c, reshuffled: r } = deck.current.draw();
    setReshuffled(r);
    if (r) setHolders({});
    setRemaining(deck.current.remaining);
    setCard(c);
    setPhase("revealed");
    if (sound) {
      if (r) sfx.shuffle();
      window.setTimeout(() => sfx.cardSlide(), r ? 520 : 0);
      window.setTimeout(() => sfx.flip(), r ? 700 : 180);
    }
    haptic(10);
  };

  const endTurn = () => {
    setCard(null);
    setPhase("idle");
    turn.next();
  };

  const resolve = () => {
    if (!rule || !card || !words) return;
    const me = turn.current;
    switch (rule.kind) {
      case "pick":
        setPhase("pick");
        return;
      case "self-sip":
        penalty.show({ who: [me.name], kind: "sip", note: tr(words.title) }, endTurn);
        return;
      case "self-full":
        penalty.show({ who: [me.name], kind: "full", note: tr(words.title) }, endTurn);
        return;
      case "left":
        penalty.show({ who: [turn.left.name], kind: "sip", note: tr(words.title) }, endTurn);
        return;
      case "right":
        penalty.show({ who: [turn.right.name], kind: "sip", note: tr(words.title) }, endTurn);
        return;
      case "group":
        setPhase("group-loser");
        return;
      case "hold":
        setHolders((h) => ({ ...h, [card.rank]: me }));
        endTurn();
        return;
    }
  };

  const held = useMemo(() => (Object.entries(holders) as [Rank, Player][]).filter(([, p]) => p), [holders]);

  const rules = (
    <ul className="rule-list">
      {RULES.map((r) => (
        <li key={r.rank}>
          <span className="rule-rank en-display">{r.rank}</span>
          <span>
            <strong>{tr(ruleWords(r, custom).title)}</strong>
            <br />
            {tr(ruleWords(r, custom).rule)}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <GameShell title={UI.gameRogue} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <div className="turn-line">
        <span className="hint">{ui("yourTurn")}</span>
        <span className="turn-name">{turn.current?.name}</span>
        <span className="hint tabular">{ui("remaining", { n: remaining })}</span>
      </div>

      <div className="card-stage">
        <PlayingCard card={card} onDraw={draw} canDraw={!card} drawLabel={lang === "zh" ? "抽牌" : "Draw"} />
      </div>

      <AnimatePresence mode="wait">
        {card && rule && words && phase === "revealed" && (
          <motion.div
            key={card.rank + card.suit}
            className="porcelain rule-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.35, duration: 0.3 }}
          >
            <h2 className={`rule-title ${lang === "zh" ? "zh-display" : "en-display"}`}>{tr(words.title)}</h2>
            <p className="rule-body">{tr(words.rule)}</p>
            {reshuffled && <p className="hint-ink">{ui("deckReshuffled")}</p>}
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <button type="button" className={`btn btn-block ${rule.kind === "hold" ? "btn-primary" : "btn-penalty"}`} onClick={resolve}>
                {rule.kind === "pick"
                  ? ui("pickOne")
                  : rule.kind === "group"
                    ? lang === "zh" ? "玩完了，谁输了" : "Played it. Who lost?"
                    : rule.kind === "hold"
                      ? lang === "zh" ? "记住了" : "Got it"
                      : rule.kind === "self-sip" || rule.kind === "self-full"
                        ? custom ? ui("iTakeIt") : lang === "zh" ? "我喝" : "I drink"
                        : rule.kind === "left" || rule.kind === "right"
                          ? lang === "zh" ? "罚" : "Penalty"
                          : custom ? ui("whoPenalty") : ui("whoDrinks")}
              </button>
            </div>
          </motion.div>
        )}

        {card && rule && words && (phase === "pick" || phase === "group-loser") && (
          <motion.div key="pick" className="porcelain rule-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="hint-ink" style={{ marginBottom: 10 }}>
              {phase === "pick" ? ui("chooseTarget") : lang === "zh" ? "点一下输的人。没人输就跳过。" : "Tap whoever lost. Nobody? Skip."}
            </p>
            <PlayerPicker
              players={players}
              tone="lacquer"
              onPick={(p) => penalty.show({ who: [p.name], kind: "sip", note: tr(words.title) }, endTurn)}
            />
            {phase === "group-loser" && (
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 12, color: "var(--haze)" }} onClick={endTurn}>
                {lang === "zh" ? "没人输，下一位" : "No one lost. Next."}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {held.length > 0 && (
        <div className="held">
          {held.map(([rank, p]) => (
            <span key={rank} className="chip">
              <span className="en-display held-rank">{rank}</span>
              {tr(ruleWords(RULE_BY_RANK[rank], custom).badge!)} · {p.name}
            </span>
          ))}
        </div>
      )}
    </GameShell>
  );
}

/** A playing card: face down shows a lattice in the game color, tap to flip. */
export function PlayingCard({ card, onDraw, drawLabel, canDraw = true }: { card: Card | null; onDraw: () => void; drawLabel: string; canDraw?: boolean }) {
  const flipped = !!card;
  return (
    <div className="pcard-scene">
      <motion.div
        className="pcard"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <button type="button" className="pcard-face pcard-back" onClick={onDraw} aria-label={drawLabel} disabled={!canDraw} style={canDraw ? undefined : { cursor: "default" }}>
          <svg viewBox="0 0 200 280" aria-hidden="true">
            <defs>
              <pattern id="lattice" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="20" height="20" fill="var(--gel)" />
                <rect x="2" y="2" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
              </pattern>
            </defs>
            <rect x="4" y="4" width="192" height="272" rx="14" fill="#ffffff" />
            <rect x="14" y="14" width="172" height="252" rx="8" fill="url(#lattice)" />
            <rect x="20" y="20" width="160" height="240" rx="6" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
            <circle cx="100" cy="140" r="36" fill="#ffffff" />
            <text x="100" y="141" textAnchor="middle" dominantBaseline="central" fontSize="30" fontWeight="800" fill="#0e0c22" style={{ fontFamily: "var(--font-display)" }}>
              13
            </text>
          </svg>
          {canDraw && <span className="pcard-draw">{drawLabel}</span>}
        </button>
        <div className="pcard-face pcard-front" aria-hidden={!flipped}>
          {card && (
            <svg viewBox="0 0 200 280" aria-hidden="true">
              <rect x="4" y="4" width="192" height="272" rx="14" fill="#ffffff" />
              <rect x="12" y="12" width="176" height="256" rx="9" fill="none" stroke="rgba(14,12,34,0.1)" strokeWidth="1.2" />
              <text x="26" y="44" fontSize="30" fontWeight="800" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"} style={{ fontFamily: "var(--font-display)" }}>
                {card.rank}
              </text>
              <text x="26" y="72" fontSize="26" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"}>
                {SUIT_GLYPH[card.suit]}
              </text>
              <text x="100" y="148" textAnchor="middle" dominantBaseline="central" fontSize="92" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"}>
                {SUIT_GLYPH[card.suit]}
              </text>
              <g transform="rotate(180 100 140)">
                <text x="26" y="44" fontSize="30" fontWeight="800" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"} style={{ fontFamily: "var(--font-display)" }}>
                  {card.rank}
                </text>
                <text x="26" y="72" fontSize="26" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"}>
                  {SUIT_GLYPH[card.suit]}
                </text>
              </g>
            </svg>
          )}
        </div>
      </motion.div>
    </div>
  );
}
