import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore } from "../store";
import { Deck } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { useSpinSound } from "../lib/useSpinSound";
import { useTurntable } from "../lib/useTurntable";
import { DARES, promptText, TRUTHS, type Heat, type Prompt } from "../data/truthDare";
import { GameShell, usePenalty } from "./GameShell";
import { Cloche } from "../components/Cloche";
import { DareTimer } from "../components/DareTimer";
import { durationOf } from "../lib/duration";
import { PorcelainDefs } from "../components/Dish";
import { polar } from "../lib/geom";
import { UI } from "../i18n";

type Phase = "spin" | "choose" | "card";

export function TruthDare({ onBack }: { onBack: () => void }) {
  const { players, ui, tr, lang, sound } = useStore();
  const [heat, setHeat] = useState<Heat>(1);
  const [phase, setPhase] = useState<Phase>("spin");
  const [kind, setKind] = useState<"truth" | "dare">("truth");
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [lidOpen, setLidOpen] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  /** each card drawn gets a fresh countdown */
  const [drawn, setDrawn] = useState(0);
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;

  const truthDeck = useRef(new Deck(TRUTHS.filter((p) => p.heat <= heat)));
  const dareDeck = useRef(new Deck(DARES.filter((p) => p.heat <= heat)));
  useEffect(() => {
    truthDeck.current = new Deck(TRUTHS.filter((p) => p.heat <= heat));
    dareDeck.current = new Deck(DARES.filter((p) => p.heat <= heat));
  }, [heat]);

  const table = useTurntable({
    count: players.length,
    friction: 1.1,
    onTick: () => {
      if (sound) sfx.tick(0.55);
      haptic(5);
    },
    onSettle: (i) => {
      setChosen(i);
      setPhase("choose");
      if (sound) {
        sfx.settle();
        window.setTimeout(() => sfx.yourTurn(), 220);
      }
      haptic([12, 40, 18]);
    },
  });

  const bottleRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (r: number) => bottleRef.current?.setAttribute("transform", `rotate(${-r} 180 180)`);
    apply(table.rotation.get());
    return table.rotation.on("change", apply);
  }, [table.rotation]);
  useSpinSound(table.rotation);

  const seats = useMemo(() => players.map((p, i) => ({ ...p, ...polar(180, 180, 132, -90 + i * table.step) })), [players, table.step]);

  const pickKind = (k: "truth" | "dare") => {
    const deck = k === "truth" ? truthDeck.current : dareDeck.current;
    setKind(k);
    setPrompt(deck.draw().card);
    setDrawn((n) => n + 1);
    setLidOpen(false);
    setPhase("card");
  };

  const nextRound = () => {
    setPhase("spin");
    setPrompt(null);
    setChosen(null);
  };

  const who = chosen !== null ? players[chosen] : null;
  // a dare that names a time ("对视 20 秒") gets a countdown once the lid is off
  const seconds = prompt ? durationOf(promptText(prompt, custom)) : null;

  // each moment's buttons, at the bottom by the thumb (the main one on the right)
  const actions =
    phase === "spin" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => table.flick()} disabled={table.spinning || players.length < 2}>
        {table.spinning ? ui("spinning") : lang === "zh" ? "转瓶子" : "Spin the bottle"}
      </button>
    ) : phase === "choose" && who ? (
      <>
        <button type="button" className="btn btn-porcelain btn-lg" onClick={() => pickKind("truth")}>
          {lang === "zh" ? "真心话" : "Truth"}
        </button>
        <button type="button" className="btn btn-gold btn-lg" onClick={() => pickKind("dare")}>
          {lang === "zh" ? "大冒险" : "Dare"}
        </button>
      </>
    ) : phase === "card" && lidOpen && who ? (
      <>
        <button type="button" className="btn btn-penalty btn-lg" onClick={() => penalty.show({ who: [who.name], kind: "sip" }, nextRound)}>
          {ui("pass")}
        </button>
        <button type="button" className="btn btn-jade btn-lg" onClick={nextRound}>
          {lang === "zh" ? "做完了" : "Done it"}
        </button>
      </>
    ) : undefined;

  const rules = (
    <p>
      {lang === "zh"
        ? "把手机放桌子中间，拨一下瓶子。瓶口指到谁，谁选真心话或大冒险。揭开盖子念出来，不做就认罚。尺度（温和或辣）在瓶子上方选。"
        : "Put the phone in the middle of the table and flick the bottle. Whoever it points at chooses truth or dare, lifts the lid and reads it out. Refuse and take the penalty. Pick the heat (mild or spicy) above the bottle."}
    </p>
  );

  return (
    <GameShell
      title={UI.gameTruth}
      rules={rules}
      onBack={onBack}
      penalty={penalty.call}
      onPenaltyDone={penalty.done}
      roster={{ turn: phase !== "spin" ? who?.id : undefined }}
      actions={actions}
    >
      <AnimatePresence mode="wait">
        {phase !== "card" && (
          <motion.div key="bottle" className="bottle-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <div className="segmented-row" style={{ justifyContent: "center" }}>
              <span className="hint">{ui("heat")}</span>
              <div className="lang-tab heat-tab" role="group" aria-label={ui("heat")}>
                <button aria-pressed={heat === 1} onClick={() => setHeat(1)}>
                  {ui("mild")}
                </button>
                <button aria-pressed={heat === 2} onClick={() => setHeat(2)} className="heat-spicy">
                  {ui("spicy")}
                </button>
              </div>
            </div>
            <svg viewBox="0 0 360 360" className="bottle-svg" {...table.handlers} style={{ touchAction: "none" }}>
              <PorcelainDefs />
              <defs>
                <linearGradient id="bottleGlass" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0f7a55" />
                  <stop offset="40%" stopColor="#3be0a4" />
                  <stop offset="60%" stopColor="#1fb683" />
                  <stop offset="100%" stopColor="#0b5a3f" />
                </linearGradient>
              </defs>
              <circle cx={180} cy={180} r={170} fill="url(#lampPool)" />
              <circle cx={180} cy={180} r={100} fill="url(#plate)" filter="url(#dishShadow)" />
              <circle cx={180} cy={180} r={92} fill="none" stroke="var(--line)" strokeWidth={1.6} opacity={0.9} />
              <circle cx={180} cy={180} r={86} fill="none" stroke="var(--line)" strokeWidth={0.8} opacity={0.6} />

              {seats.map((s, i) => (
                <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
                  <motion.g
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    animate={{ scale: chosen === i && phase === "choose" ? 1.25 : 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  >
                    <circle r={22} fill={chosen === i && phase === "choose" ? "var(--gel)" : "rgba(255,255,255,0.07)"} stroke={chosen === i && phase === "choose" ? "var(--moon)" : "rgba(181,178,220,0.3)"} strokeWidth={1.5} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={players.length > 8 ? 9 : 10.5} fontWeight={700} fill={chosen === i && phase === "choose" ? "var(--night)" : "var(--moon)"}>
                      {s.name.length > 5 ? s.name.slice(0, 4) + "…" : s.name}
                    </text>
                  </motion.g>
                </g>
              ))}

              {/* the bottle: body, neck, cap; points up when rotation is 0 */}
              <g ref={bottleRef}>
                <g filter="url(#dishShadow)">
                  <path
                    d="M 164 236 L 164 152 C 164 134 170 130 174 118 L 174 98 L 186 98 L 186 118 C 190 130 196 134 196 152 L 196 236 Q 180 246 164 236 Z"
                    fill="url(#bottleGlass)"
                  />
                  <rect x={171} y={86} width={18} height={14} rx={3} fill="var(--moon)" />
                  <rect x={169} y={100} width={22} height={3} fill="rgba(0,0,0,0.25)" />
                  <rect x={168} y={166} width={24} height={42} rx={3} fill="var(--moon)" opacity={0.95} />
                  <rect x={172} y={176} width={16} height={2} fill="var(--night)" opacity={0.7} />
                  <rect x={174} y={184} width={12} height={2} fill="var(--gel)" opacity={1} />
                  <rect x={172} y={192} width={16} height={2} fill="var(--night)" opacity={0.7} />
                  <rect x={169} y={140} width={4} height={80} rx={2} fill="rgba(255,255,255,0.35)" />
                </g>
              </g>
            </svg>

            <div className="bottle-actions">
              {phase === "spin" && <p className="hint">{lang === "zh" ? "也可以直接用手拨" : "Or flick it with a finger"}</p>}
              {phase === "choose" && who && (
                <motion.div className="choose-box" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <p className="choose-who">
                    <span className="turn-name">{who.name}</span>
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {phase === "card" && prompt && who && (
          <motion.div key="card" className="card-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              <span className="turn-name">{who.name}</span>
              <span className={`kind-tag ${kind}`}>{kind === "truth" ? (lang === "zh" ? "真心话" : "Truth") : lang === "zh" ? "大冒险" : "Dare"}</span>
            </p>
            <Cloche open={lidOpen} onOpen={() => setLidOpen(true)}>
              <div className="prompt-card">
                <p className="prompt-text">{tr(promptText(prompt, custom))}</p>
                <p className="hint-ink prompt-other">{lang === "zh" ? promptText(prompt, custom).en : promptText(prompt, custom).zh}</p>
              </div>
            </Cloche>
            <AnimatePresence>
              {lidOpen && seconds !== null && (
                <motion.div key="timer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <DareTimer seconds={seconds} lang={lang} resetKey={drawn} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
