import { Eye } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore } from "../store";
import { Deck } from "../lib/random";
import { DRAW_WORDS, type Difficulty, type DrawWord } from "../data/drawGuess";
import { reduced } from "../lib/motion";
import { sfx } from "../lib/sfx";
import { GameShell, usePenalty, useTurnOrder } from "./GameShell";
import { Resume, useKeepProgress } from "./Resume";
import { Cloche } from "../components/Cloche";
import { DrawingPlate, type DrawingPlateHandle } from "../components/DrawingPlate";
import { TimerArc } from "../components/TimerArc";
import { PlayerPicker } from "../components/PlayerPicker";
import { UI } from "../i18n";

type Phase = "pick" | "word" | "draw" | "who";
const SECONDS = 60;
type Kept = { phase: Phase; word: DrawWord | null; scores: Record<string, number>; turn: number; cards: Record<Difficulty, number[]> };

export function DrawGuess({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="draw" version={1}>
      {(saved) => <DrawGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function DrawGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, ui, tr, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const [firstDecks] = useState(() => {
    const decks = {
      1: new Deck(DRAW_WORDS.filter((w) => w.d === 1)),
      2: new Deck(DRAW_WORDS.filter((w) => w.d === 2)),
      3: new Deck(DRAW_WORDS.filter((w) => w.d === 3)),
    };
    if (saved) for (const d of [1, 2, 3] as Difficulty[]) decks[d].restore(saved.cards[d]);
    return decks;
  });
  const decks = useRef(firstDecks);
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "pick");
  const [word, setWord] = useState<DrawWord | null>(saved?.word ?? null);
  const [lidOpen, setLidOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>(saved?.scores ?? {});
  const plate = useRef<DrawingPlateHandle>(null);
  const who = useRef<HTMLDivElement>(null);
  const turn = useTurnOrder(saved?.turn ?? 0);
  const penalty = usePenalty();
  const [played, setPlayed] = useState(!!saved);
  // A half-drawn picture returns to the same word behind its lid, with a fresh minute.
  // A penalty stamp has already counted: return to the next drawer's difficulty choice.
  useKeepProgress<Kept>({
    phase: penalty.call ? "pick" : phase === "draw" ? "word" : phase,
    word: penalty.call ? null : word,
    scores,
    turn: penalty.call ? (turn.index + 1) % Math.max(1, players.length) : turn.index,
    cards: { 1: decks.current[1].keep(), 2: decks.current[2].keep(), 3: decks.current[3].keep() },
  }, played);

  const drawer = turn.current;

  // the names to pick from go in above the picture: in sight, even if the page was scrolled down to it
  useEffect(() => {
    if (phase === "who") who.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  }, [phase]);

  const chooseDifficulty = (d: Difficulty) => {
    setPlayed(true);
    setWord(decks.current[d].draw().card);
    setLidOpen(false);
    setPhase("word");
  };

  const startDrawing = () => {
    setTimeUp(false);
    setTimerKey((k) => k + 1);
    setPhase("draw");
  };

  const award = (ids: string[], pts: number) =>
    setScores((s) => {
      const n = { ...s };
      for (const id of ids) n[id] = (n[id] ?? 0) + pts;
      return n;
    });

  const nextTurn = () => {
    plate.current?.clear();
    setWord(null);
    setPhase("pick");
    turn.next();
  };

  const ranked = useMemo(() => players.map((p) => ({ ...p, pts: scores[p.id] ?? 0 })).sort((a, b) => b.pts - a.pts), [players, scores]);

  const diffLabel = (d: Difficulty) => (d === 1 ? (lang === "zh" ? "简单" : "Easy") : d === 2 ? (lang === "zh" ? "中等" : "Medium") : lang === "zh" ? "困难" : "Hard");

  const actions =
    phase === "word" && word && lidOpen ? (
      <motion.button type="button" className="btn btn-lg btn-primary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} onClick={startDrawing}>
        {lang === "zh" ? "开始画" : "Start drawing"}
      </motion.button>
    ) : phase === "draw" && word ? (
      <>
        <button type="button" className="btn btn-lg btn-penalty" onClick={() => penalty.show({ who: [drawer.name], kind: "sip", note: tr(word) }, nextTurn)}>
          {lang === "zh" ? "没人猜到" : "Nobody got it"}
        </button>
        <button type="button" className="btn btn-lg btn-jade" onClick={() => setPhase("who")}>
          {lang === "zh" ? "猜中了" : "Someone got it"}
        </button>
      </>
    ) : phase === "who" && word ? (
      // 猜中了 tapped by mistake: back to the same picture, the clock going on from where it stopped
      <button type="button" className="btn btn-lg btn-ghost" onClick={() => setPhase("draw")}>
        {timeUp ? (lang === "zh" ? "点错了，回去" : "Oops, go back") : lang === "zh" ? "点错了，接着画" : "Oops, keep drawing"}
      </button>
    ) : undefined;

  const rules = (
    <p>
      {lang === "zh"
        ? `轮到的人选难度、点开看词，然后在画板上画，一分钟。画的时候不能说话不能写字。有人猜中，画的人和猜中的人都得分（简单 1、中等 2、困难 3）。没人猜中，画的人${custom ? "受罚" : "喝"}。`
        : `The drawer picks a difficulty, lifts the lid to see the word and draws on the board for one minute. No talking, no letters. If someone guesses it, drawer and guesser both score (easy 1, medium 2, hard 3). Nobody? The drawer ${custom ? "takes the penalty" : "drinks"}.`}
    </p>
  );

  return (
    <GameShell
      title={UI.gameDraw}
      rules={rules}
      onBack={onBack}
      penalty={penalty.call}
      onPenaltyDone={penalty.done} roster={{ turn: drawer?.id }} actions={actions}
    >
      {/* the scores so far: at the start of each round, under the difficulty (the top bar holds buttons only) */}
      <AnimatePresence mode="wait">
        {phase === "pick" && (
          <motion.div key="pick" className="stack" style={{ gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              <span className="hint">{lang === "zh" ? "这轮画画的是" : "Drawing this round"}</span>
              <span className="turn-name">{drawer?.name}</span>
            </p>
            <div className="porcelain setup-card">
              <p className="hint-ink" style={{ marginBottom: 12 }}>
                {lang === "zh" ? "选个难度，分数不一样。" : "Pick a difficulty. Harder words score more."}
              </p>
              <div className="stack" style={{ gap: 10 }}>
                {([1, 2, 3] as Difficulty[]).map((d) => (
                  <button key={d} type="button" className={`btn btn-block ${d === 1 ? "btn-jade" : d === 2 ? "btn-gold" : "btn-porcelain"}`} onClick={() => chooseDifficulty(d)}>
                    {diffLabel(d)} · {d} {ui("score")}
                  </button>
                ))}
              </div>
            </div>
            {ranked.some((p) => p.pts > 0) && (
              <ul className="score-list">
                {ranked.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <span className="tabular">{p.pts}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}

        {phase === "word" && word && (
          <motion.div key="word" className="card-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              <span className="hint">{lang === "zh" ? "只有" : "Only"}</span>
              <span className="turn-name">{drawer?.name}</span>
              <span className="hint">{lang === "zh" ? "能看" : "may look"}</span>
            </p>
            <Cloche open={lidOpen} onOpen={() => setLidOpen(true)}>
              <div className="prompt-card">
                <p className={`word-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{tr(word)}</p>
                <p className="hint-ink">{lang === "zh" ? word.en : word.zh}</p>
                <p className="hint-ink">
                  {diffLabel(word.d)} · {word.d} {ui("score")}
                </p>
              </div>
            </Cloche>
          </motion.div>
        )}

        {(phase === "draw" || phase === "who") && word && (
          // one screen for drawing and for saying who got it: the picture and the clock stay, so a
          // 猜中了 tapped by mistake goes back to them (the clock waits while the drawer picks)
          <motion.div key="draw" className="stack" style={{ gap: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <TimerArc seconds={SECONDS} running={!timeUp && phase === "draw"} onEnd={() => setTimeUp(true)} size={72} resetKey={timerKey} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onPointerDown={() => setPeek(true)}
                onPointerUp={() => setPeek(false)}
                onPointerLeave={() => setPeek(false)}
                onPointerCancel={() => setPeek(false)}
              >
                <Eye size={16} />
                {peek ? tr(word) : lang === "zh" ? "按住看词" : "Hold to peek"}
              </button>
              <span className="turn-name">{drawer?.name}</span>
            </div>
            {phase === "who" && (
              <div ref={who} className="stack" style={{ gap: 14 }}>
                <p className="hint">{lang === "zh" ? "谁猜中的？" : "Who guessed it?"}</p>
                <PlayerPicker
                  players={players}
                  exclude={[drawer.id]}
                  onPick={(p) => {
                    sfx.correct();
                    award([drawer.id, p.id], word.d);
                    nextTurn();
                  }}
                />
              </div>
            )}
            <DrawingPlate ref={plate} disabled={timeUp || phase === "who"} />
            {timeUp && <p className="hint" style={{ textAlign: "center" }}>{lang === "zh" ? "时间到" : "Time's up"}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
