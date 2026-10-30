import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useStore } from "../store";
import { Deck } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { LIKELY, NEVER } from "../data/prompts";
import { GameShell, usePenalty } from "./GameShell";
import { PlayerPicker } from "../components/PlayerPicker";
import { UI, type T } from "../i18n";

type Mode = "never" | "likely";

export function PromptDecks({ onBack }: { onBack: () => void }) {
  const { players, ui, tr, lang, sound } = useStore();
  const never = useRef(new Deck<T>(NEVER));
  const likely = useRef(new Deck<T>(LIKELY));
  const [mode, setMode] = useState<Mode>("never");
  const [card, setCard] = useState<T | null>(null);
  const [n, setN] = useState(0);
  const [picking, setPicking] = useState(false);
  const [guilty, setGuilty] = useState<string[]>([]);
  const [remaining, setRemaining] = useState({ never: never.current.remaining, likely: likely.current.remaining });
  const penalty = usePenalty();

  const draw = () => {
    const d = mode === "never" ? never.current : likely.current;
    setCard(d.draw().card);
    setRemaining({ never: never.current.remaining, likely: likely.current.remaining });
    setN((k) => k + 1);
    setPicking(false);
    setGuilty([]);
    if (sound) {
      sfx.cardSlide();
      window.setTimeout(() => sfx.flip(), 140);
    }
    haptic(8);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setCard(null);
    setPicking(false);
  };

  const lead = mode === "never" ? (lang === "zh" ? "我从来没有……" : "Never have I ever…") : lang === "zh" ? "在座谁最有可能……" : "Who's most likely to…";

  const rules = (
    <p>
      {lang === "zh"
        ? "我从来没有：念出卡片，做过这件事的人都喝。谁最有可能：念出卡片，数到三大家一起指人，被指最多的喝。"
        : "Never Have I Ever: read the card. Anyone who has done it drinks. Most Likely To: read the card, count to three, everyone points. The most pointed-at drinks."}
    </p>
  );

  return (
    <GameShell title={UI.gamePrompts} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <div className="deck-stage">
        <div className="segmented-row" style={{ justifyContent: "center" }}>
          <div className="lang-tab heat-tab" role="group">
            <button aria-pressed={mode === "never"} onClick={() => switchMode("never")}>
              {lang === "zh" ? "我从来没有" : "Never have I ever"}
            </button>
            <button aria-pressed={mode === "likely"} onClick={() => switchMode("likely")}>
              {lang === "zh" ? "谁最有可能" : "Most likely to"}
            </button>
          </div>
        </div>
        <p className="deck-lead">{lead}</p>
        <div className="deck-stack">
          <div className="porcelain deck-ghost deck-ghost-2" aria-hidden="true" />
          <div className="porcelain deck-ghost" aria-hidden="true" />
          <AnimatePresence mode="popLayout" initial={false}>
            {card ? (
              <motion.div
                key={n}
                className="porcelain deck-card"
                initial={{ y: 60, rotate: 4, opacity: 0 }}
                animate={{ y: 0, rotate: 0, opacity: 1 }}
                exit={{ x: -260, rotate: -10, opacity: 0, transition: { duration: 0.3 } }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              >
                <p className="deck-text">{tr(card)}</p>
                <p className="hint-ink prompt-other">
                  {mode === "never"
                    ? lang === "zh" ? `Never have I ever ${card.en}` : `我从来没有${card.zh}`
                    : lang === "zh" ? `Who's most likely to ${card.en}` : `在座谁最有可能${card.zh}`}
                </p>
              </motion.div>
            ) : (
              <motion.div key="empty" className="porcelain deck-card deck-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="hint-ink">{lang === "zh" ? "抽一张，念出来。" : "Draw a card and read it out."}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="hint tabular" style={{ textAlign: "center" }}>
          {ui("remaining", { n: mode === "never" ? remaining.never : remaining.likely })}
        </p>

        <AnimatePresence mode="wait">
          {picking && mode === "never" ? (
            <motion.div key="guilty" className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="hint" style={{ textAlign: "center" }}>
                {lang === "zh" ? "点一下做过的人，可以多选" : "Tap everyone who has. Pick as many as it takes."}
              </p>
              <PlayerPicker
                players={players}
                selected={guilty}
                onPick={(p) => setGuilty((g) => (g.includes(p.id) ? g.filter((x) => x !== p.id) : [...g, p.id]))}
              />
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-ghost btn-block" onClick={draw}>
                  {lang === "zh" ? "没人做过" : "Nobody has"}
                </button>
                <button
                  type="button"
                  className="btn btn-penalty btn-block"
                  disabled={guilty.length === 0}
                  onClick={() =>
                    penalty.show({ who: players.filter((p) => guilty.includes(p.id)).map((p) => p.name), kind: "sip", note: card ? tr(card) : undefined }, draw)
                  }
                >
                  {ui("drink")}
                </button>
              </div>
            </motion.div>
          ) : picking ? (
            <motion.div key="pick" className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="hint" style={{ textAlign: "center" }}>
                {lang === "zh" ? "被指最多的是谁？" : "Who got the most fingers?"}
              </p>
              <PlayerPicker players={players} onPick={(p) => penalty.show({ who: [p.name], kind: "sip", note: card ? tr(card) : undefined }, draw)} />
            </motion.div>
          ) : (
            <motion.div key="actions" className="row" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {card && (
                <button type="button" className="btn btn-penalty btn-lg btn-block" onClick={() => setPicking(true)}>
                  {mode === "likely" ? (lang === "zh" ? "指完了" : "We pointed") : lang === "zh" ? "谁做过" : "Who has?"}
                </button>
              )}
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={draw}>
                {card ? ui("next") : lang === "zh" ? "抽一张" : "Draw a card"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GameShell>
  );
}
