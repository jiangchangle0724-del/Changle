import { Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { usePenaltyText, useStore, type Player } from "../store";
import { pick, shuffle } from "../lib/random";
import { WORD_PAIRS, type WordPair } from "../data/undercover";
import { sfx } from "../lib/sfx";
import { GameShell, usePenalty } from "./GameShell";
import { Cloche } from "../components/Cloche";
import { TimerArc } from "../components/TimerArc";
import { PlayerPicker } from "../components/PlayerPicker";
import { UI } from "../i18n";

type Role = "civilian" | "undercover" | "blank";
type Seat = { player: Player; role: Role; alive: boolean };
type Phase = "setup" | "deal" | "talk" | "vote" | "reveal" | "end";

function defaultUndercovers(n: number) {
  return n <= 5 ? 1 : n <= 8 ? 2 : 3;
}

export function Undercover({ onBack }: { onBack: () => void }) {
  const { players, ui, tr, lang } = useStore();
  const [undercovers, setUndercovers] = useState(defaultUndercovers(players.length));
  const [withBlank, setWithBlank] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [pair, setPair] = useState<WordPair | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [dealIndex, setDealIndex] = useState(0);
  const [lidOpen, setLidOpen] = useState(false);
  const [round, setRound] = useState(1);
  const [timerOn, setTimerOn] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [eliminated, setEliminated] = useState<Seat | null>(null);
  const [winner, setWinner] = useState<"civilians" | "undercovers" | null>(null);
  const [firstSpeaker, setFirstSpeaker] = useState<Player | null>(null);
  const penalty = usePenalty();

  const maxUndercovers = Math.max(1, Math.min(3, players.length - 3));

  const start = () => {
    const p = pick(WORD_PAIRS);
    const order = shuffle(players);
    const uc = Math.min(undercovers, maxUndercovers);
    const roles: Role[] = [];
    for (let i = 0; i < players.length; i++) roles.push(i < uc ? "undercover" : i === uc && withBlank ? "blank" : "civilian");
    const byId = new Map(order.map((pl, i) => [pl.id, roles[i]]));
    setPair(p);
    setSeats(players.map((pl) => ({ player: pl, role: byId.get(pl.id)!, alive: true })));
    setDealIndex(0);
    setLidOpen(false);
    setRound(1);
    setWinner(null);
    setEliminated(null);
    setPhase("deal");
  };

  const alive = useMemo(() => seats.filter((s) => s.alive), [seats]);

  const startTalk = () => {
    setFirstSpeaker(pick(seats.filter((s) => s.alive)).player);
    setTimerOn(false);
    setTimerKey((k) => k + 1);
    setPhase("talk");
  };

  const eliminate = (p: Player) => {
    const next = seats.map((s) => (s.player.id === p.id ? { ...s, alive: false } : s));
    const out = next.find((s) => s.player.id === p.id)!;
    setSeats(next);
    setEliminated(out);
    const aliveNext = next.filter((s) => s.alive);
    const uc = aliveNext.filter((s) => s.role === "undercover").length;
    const civ = aliveNext.length - uc;
    if (uc === 0) setWinner("civilians");
    else if (uc >= civ) setWinner("undercovers");
    setPhase("reveal");
    sfx.reveal();
  };

  const afterReveal = () => {
    if (winner) {
      setPhase("end");
      sfx.win();
      const losers = seats.filter((s) => (winner === "civilians" ? s.role !== "civilian" : s.role === "civilian")).map((s) => s.player.name);
      penalty.show({ who: losers, kind: "sip", note: winner === "civilians" ? (lang === "zh" ? "卧底被揪出来了" : "The undercover got caught") : lang === "zh" ? "卧底赢了" : "The undercover wins" });
    } else {
      setRound((r) => r + 1);
      startTalk();
    }
  };

  const word = (s: Seat) => (s.role === "blank" ? (lang === "zh" ? "白板：你没有词，靠听" : "Blank: no word. Listen and bluff.") : s.role === "undercover" ? tr(pair!.b) : tr(pair!.a));

  const roleName = (r: Role) => (r === "civilian" ? (lang === "zh" ? "平民" : "Civilian") : r === "undercover" ? (lang === "zh" ? "卧底" : "Undercover") : lang === "zh" ? "白板" : "Blank");
  const custom = usePenaltyText().isCustom;

  const rules = (
    <p>
      {lang === "zh"
        ? `每人点开看自己的词，大多数人拿同一个词，卧底拿一个相近的词。轮流用一句话描述自己的词，不能说出来。每轮讨论后投票淘汰一个人。卧底全部出局，平民赢；卧底人数追平平民，卧底赢。输的一方${custom ? "受罚" : "喝"}。`
        : `Everyone lifts the lid to see their word. Most players share one word; the undercover gets a similar one. Take turns describing your word in a sentence without saying it. After each round, vote someone out. All undercovers out: civilians win. Undercovers match civilians: undercovers win. The losing side ${custom ? "takes the penalty" : "drinks"}.`}
    </p>
  );

  return (
    <GameShell title={UI.gameUndercover} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <AnimatePresence mode="wait">
        {phase === "setup" && (
          <motion.div key="setup" className="stack" style={{ gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain setup-card">
              <div className="settings-row ink">
                <span>{lang === "zh" ? "卧底人数" : "Undercovers"}</span>
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="icon-btn ink" onClick={() => setUndercovers((n) => Math.max(1, n - 1))} aria-label="-">
                    <Minus size={18} />
                  </button>
                  <span className="tabular" style={{ minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 20 }}>
                    {Math.min(undercovers, maxUndercovers)}
                  </span>
                  <button type="button" className="icon-btn ink" onClick={() => setUndercovers((n) => Math.min(maxUndercovers, n + 1))} aria-label="+">
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              <div className="settings-row ink">
                <span>{lang === "zh" ? "加一个白板" : "Add a blank"}</span>
                <button type="button" className={`btn btn-sm ${withBlank ? "btn-jade" : "btn-ghost ink"}`} aria-pressed={withBlank} onClick={() => setWithBlank((v) => !v)}>
                  {withBlank ? (lang === "zh" ? "有" : "Yes") : lang === "zh" ? "无" : "No"}
                </button>
              </div>
              <p className="hint-ink">{lang === "zh" ? `${players.length} 人在座。白板没有词，猜出平民的词就赢。` : `${players.length} at the table. A blank has no word and wins by guessing the civilians' word.`}</p>
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={start}>
              {lang === "zh" ? "发词" : "Deal the words"}
            </button>
          </motion.div>
        )}

        {phase === "deal" && seats[dealIndex] && (
          <motion.div key={`deal-${dealIndex}`} className="card-flow" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <p className="turn-line">
              <span className="hint">{ui("passPhone")}</span>
              <span className="turn-name">{seats[dealIndex].player.name}</span>
              <span className="hint tabular">
                {dealIndex + 1} / {seats.length}
              </span>
            </p>
            <Cloche open={lidOpen} onOpen={() => setLidOpen(true)} label={lidOpen ? undefined : `${seats[dealIndex].player.name} · ${ui("liftLid")}`}>
              <div className="prompt-card">
                <p className={`word-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{word(seats[dealIndex])}</p>
                {seats[dealIndex].role !== "blank" && <p className="hint-ink">{lang === "zh" ? (seats[dealIndex].role === "undercover" ? pair!.b.en : pair!.a.en) : seats[dealIndex].role === "undercover" ? pair!.b.zh : pair!.a.zh}</p>}
              </div>
            </Cloche>
            {lidOpen && (
              <motion.button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                onClick={() => {
                  setLidOpen(false);
                  if (dealIndex + 1 >= seats.length) startTalk();
                  else setDealIndex((i) => i + 1);
                }}
              >
                {ui("gotIt")}
              </motion.button>
            )}
          </motion.div>
        )}

        {phase === "talk" && (
          <motion.div key={`talk-${round}`} className="stack" style={{ gap: 16, alignItems: "center" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              <span className="hint">{ui("roundOf", { n: round })}</span>
              <span className="hint">
                {lang === "zh" ? "从" : "Start with"} <strong style={{ color: "var(--cream)" }}>{firstSpeaker?.name}</strong> {lang === "zh" ? "开始描述" : ""}
              </span>
            </p>
            <TimerArc seconds={90} running={timerOn} onEnd={() => setTimerOn(false)} resetKey={timerKey} />
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setTimerOn((v) => !v)}>
                {timerOn ? ui("stop") : ui("start")}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setTimerOn(false);
                  setTimerKey((k) => k + 1);
                }}
              >
                {ui("reset")}
              </button>
            </div>
            <div className="picker" style={{ justifyContent: "center" }}>
              {seats.map((s) => (
                <span key={s.player.id} className={`chip ${s.alive ? "" : "chip-out"}`}>
                  {s.player.name}
                </span>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setPhase("vote")}>
              {lang === "zh" ? "投票" : "Vote"}
            </button>
          </motion.div>
        )}

        {phase === "vote" && (
          <motion.div key="vote" className="stack" style={{ gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="hint">{lang === "zh" ? "大家指认，点一下票数最多的人。" : "Everyone points. Tap the one with the most fingers."}</p>
            <PlayerPicker players={alive.map((s) => s.player)} onPick={eliminate} />
            <button type="button" className="btn btn-ghost" onClick={() => setPhase("talk")}>
              {lang === "zh" ? "再聊一会儿" : "Talk a bit more"}
            </button>
          </motion.div>
        )}

        {phase === "reveal" && eliminated && (
          <motion.div key="reveal" className="stack" style={{ gap: 16, alignItems: "center" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain reveal-card">
              <p className="hint-ink">{lang === "zh" ? "出局" : "Out"}</p>
              <p className="turn-name ink" style={{ fontSize: 28 }}>
                {eliminated.player.name}
              </p>
              <p className={`reveal-role ${eliminated.role}`}>{roleName(eliminated.role)}</p>
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={afterReveal}>
              {winner ? (lang === "zh" ? "看结果" : "See the result") : lang === "zh" ? "下一轮" : "Next round"}
            </button>
          </motion.div>
        )}

        {phase === "end" && pair && (
          <motion.div key="end" className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="porcelain reveal-card">
              <p className={`turn-name ink ${lang === "zh" ? "zh-display" : "en-display"}`} style={{ fontSize: 26 }}>
                {winner === "civilians" ? (lang === "zh" ? "平民赢了" : "Civilians win") : lang === "zh" ? "卧底赢了" : "Undercovers win"}
              </p>
              <p className="hint-ink" style={{ marginTop: 8 }}>
                {lang === "zh" ? "平民" : "Civilians"}: <strong>{tr(pair.a)}</strong> · {lang === "zh" ? "卧底" : "Undercover"}: <strong>{tr(pair.b)}</strong>
              </p>
              <ul className="role-list">
                {seats.map((s) => (
                  <li key={s.player.id}>
                    <span>{s.player.name}</span>
                    <span className={`reveal-role small ${s.role}`}>{roleName(s.role)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setPhase("setup")}>
              {ui("restart")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
