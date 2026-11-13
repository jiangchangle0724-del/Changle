import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { usePenaltyText, useStore } from "../store";
import { Deck } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { LIKELY, NEVER } from "../data/prompts";
import { GameShell, usePenalty } from "./GameShell";
import { Resume, useKeepProgress } from "./Resume";
import { PlayerPicker } from "../components/PlayerPicker";
import { UI, type T } from "../i18n";
import "./PromptDecks.css";

type Mode = "never" | "likely";

// `guilty`: who takes the penalty, picked after 谁做过 (everyone who has) or 指完了 (the most
// pointed-at: on a tie, all of them)
type Kept = { mode: Mode; card: T | null; n: number; picking: boolean; guilty: string[]; never: number[]; likely: number[]; paid: boolean };

/** The box that scrolls the names: the game's column on a phone held sideways, the page otherwise. */
function scrollerOf(el: HTMLElement): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Bottom-button taps closer together than this are one press (a quick double tap). */
const TAP_GAP = 600;

export function PromptDecks({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="prompts" version={1}>
      {(saved) => <PromptGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function PromptGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, ui, tr, lang, sound } = useStore();
  const [first] = useState(() => {
    const never = new Deck<T>(NEVER);
    const likely = new Deck<T>(LIKELY);
    if (saved) {
      never.restore(saved.never);
      likely.restore(saved.likely);
    }
    // The stamp already counted its penalty: perform its pending draw once on return.
    const card = saved?.paid ? (saved.mode === "never" ? never : likely).draw().card : saved?.card ?? null;
    return { never, likely, card };
  });
  const never = useRef(first.never);
  const likely = useRef(first.likely);
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "never");
  const [card, setCard] = useState<T | null>(first.card);
  const [n, setN] = useState((saved?.n ?? 0) + (saved?.paid ? 1 : 0));
  const [picking, setPicking] = useState(!saved?.paid && (saved?.picking ?? false));
  const [guilty, setGuilty] = useState<string[]>(saved?.paid ? [] : saved?.guilty ?? []);
  const [remaining, setRemaining] = useState({ never: never.current.remaining, likely: likely.current.remaining });
  const penalty = usePenalty();
  const pen = usePenaltyText();
  useKeepProgress<Kept>({ mode, card, n, picking, guilty, never: never.current.keep(), likely: likely.current.keep(), paid: !!penalty.call }, n > 0);

  // picking: once the card has stepped back, every name should sit above the bottom buttons. On a
  // big table or a short screen, scroll just enough to bring the last one up, and never so far that
  // the line saying what to tap goes off the top.
  const pickRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const t = window.setTimeout(() => {
      const el = pickRef.current;
      const bar = el?.closest(".game-screen")?.querySelector(".game-actions");
      if (!el || !bar) return;
      const box = el.getBoundingClientRect();
      const under = box.bottom + 8 - bar.getBoundingClientRect().top;
      if (under <= 0) return;
      const scroller = scrollerOf(el);
      const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
      const by = Math.min(under, box.top - top - 8);
      if (by <= 0) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollBy({ top: by, behavior: still ? "auto" : "smooth" });
    }, 260);
    return () => window.clearTimeout(t);
  }, [picking, mode]);

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

  const lead = mode === "never" ? (lang === "zh" ? "我曾经……" : "Never have I ever…") : lang === "zh" ? "在座谁最有可能……" : "Who's most likely to…";

  const toggle = (id: string) => setGuilty((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const stamp = () => penalty.show({ who: players.filter((p) => guilty.includes(p.id)).map((p) => p.name), kind: "sip", note: card ? tr(card) : undefined }, draw);
  // the bottom buttons change under the finger (谁做过 becomes 没人做过, 指完了 becomes 再指一次, 下一张
  // stays 下一张): a quick double tap is one press, or its second half would skip the card nobody
  // has answered yet
  const lastTap = useRef(Number.NEGATIVE_INFINITY);
  const settle = (fn: () => void) => () => {
    const now = performance.now();
    if (now - lastTap.current < TAP_GAP) return;
    lastTap.current = now;
    fn();
  };

  const actions = picking ? (
    <>
      {mode === "never" ? (
        <button type="button" className="btn btn-lg btn-ghost" onClick={settle(draw)}>
          {lang === "zh" ? "没人做过" : "Nobody has"}
        </button>
      ) : (
        // pointed too soon, or the tie is settled by pointing again: back to the card
        <button
          type="button"
          className="btn btn-lg btn-ghost"
          onClick={settle(() => {
            setPicking(false);
            setGuilty([]);
          })}
        >
          {lang === "zh" ? "再指一次" : "Point again"}
        </button>
      )}
      <button type="button" className="btn btn-lg btn-penalty" disabled={guilty.length === 0} onClick={settle(stamp)}>
        {pen.isCustom ? ui("takePenalty") : ui("drink")}
      </button>
    </>
  ) : (
    <>
      {card && (
        <button type="button" className="btn btn-lg btn-penalty" onClick={settle(() => setPicking(true))}>
          {mode === "likely" ? (lang === "zh" ? "指完了" : "We pointed") : lang === "zh" ? "谁做过" : "Who has?"}
        </button>
      )}
      <button type="button" className="btn btn-lg btn-primary" onClick={settle(draw)}>
        {card ? (lang === "zh" ? "下一张" : "Next card") : lang === "zh" ? "抽一张" : "Draw a card"}
      </button>
    </>
  );

  const rules = (
    <p>
      {pen.line(
        {
          zh: "我从来没有：念出卡片，做过这件事的人都喝。谁最有可能：念出卡片，数到三大家一起指人，被指最多的喝，平手就一起喝。",
          en: "Never Have I Ever: read the card. Anyone who has done it drinks. Most Likely To: read the card, count to three, everyone points. The most pointed-at drinks. On a tie, they all drink.",
        },
        {
          zh: "我从来没有：念出卡片，做过这件事的人都受罚。谁最有可能：念出卡片，数到三大家一起指人，被指最多的受罚，平手就一起罚。",
          en: "Never Have I Ever: read the card. Anyone who has done it takes the penalty. Most Likely To: read the card, count to three, everyone points. The most pointed-at takes the penalty. On a tie, they all do.",
        },
      )}
    </p>
  );

  return (
    <GameShell title={UI.gamePrompts} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} status={n > 0 ? { kind: "round", current: n } : undefined} roster={{}} actions={actions}>
      <div className={`deck-stage${picking ? " is-picking" : ""}`}>
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
                    ? lang === "zh" ? `Never have I ever ${card.en}` : `我曾经${card.zh}`
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
        {/* how many are left matters when drawing, not while picking (the names need the room) */}
        {!picking && (
          <p className="hint tabular" style={{ textAlign: "center" }}>
            {ui("remaining", { n: mode === "never" ? remaining.never : remaining.likely })}
          </p>
        )}

        <AnimatePresence mode="wait">
          {picking && (
            <motion.div key={mode} ref={pickRef} className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="hint" style={{ textAlign: "center" }}>
                {mode === "never"
                  ? lang === "zh"
                    ? "点一下做过的人，可以多选"
                    : "Tap everyone who has. Pick as many as it takes."
                  : lang === "zh"
                    ? "被指最多的是谁？平手就都点上"
                    : "Who got the most fingers? On a tie, tap them all."}
              </p>
              <PlayerPicker players={players} selected={guilty} onPick={(p) => toggle(p.id)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GameShell>
  );
}
