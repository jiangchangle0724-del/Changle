import { Check, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import { UI } from "../../i18n";
import type { DrawView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { NetPlate } from "../NetPlate";
import { useRoom } from "../RoomContext";
import { usePlayers, useWatching } from "../players";
import { HostButton, HostRow, TurnLine, useYourTurn, Waiting } from "./common";

const ROUND_S = 80;

export function NetDraw({ v, onLeave }: { v: DrawView; onLeave: () => void }) {
  const { me, isHost, g, nameOf, offset } = useRoom();
  const { ui, tr, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const drawer = v.drawer === me;
  const solved = v.solved.includes(me);
  const players = usePlayers();
  const watching = useWatching();
  useYourTurn(drawer && v.phase === "pick");

  const ranked = useMemo(
    () => players.map((s) => ({ id: s.id, name: s.name, pts: v.scores[s.id] ?? 0 })).sort((a, b) => b.pts - a.pts),
    [players, v.scores],
  );
  const diffLabel = (d: 1 | 2 | 3) => (d === 1 ? (lang === "zh" ? "简单" : "Easy") : d === 2 ? (lang === "zh" ? "中等" : "Medium") : lang === "zh" ? "困难" : "Hard");

  const [guess, setGuess] = useState("");
  const feed = useRef<HTMLUListElement>(null);
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [v.guesses.length]);
  useEffect(() => setGuess(""), [v.round]);

  const hint = v.hint ? (lang === "zh" ? `${v.hint.zh} 个字` : v.hint.en.split("").join(" ")) : "";

  const rules = (
    <p>
      {lang === "zh"
        ? `轮到的人选难度，只有他的手机能看到词，然后在画板上画，八十秒。他画的每一笔都实时出现在大家的手机上。其他人在自己手机上打字猜，第一个猜中的得分最多，画的人也得分。没人猜中，画的人${custom ? "受罚" : "喝"}。`
        : `The drawer picks a difficulty; only their phone shows the word. They draw on the board for eighty seconds and every stroke appears live on every phone. Everyone else types guesses on their own phone. The first right guess scores most, and the drawer scores too. Nobody gets it? The drawer ${custom ? "takes the penalty" : "drinks"}.`}
    </p>
  );

  return (
    <NetFrame title={UI.gameDraw} rules={rules} onLeave={onLeave} dock={!(drawer && v.phase === "draw")}>
      <AnimatePresence mode="wait">
        {v.phase === "pick" && (
          <motion.div key={`pick-${v.round}`} className="stack" style={{ gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TurnLine pid={v.drawer} lead={lang === "zh" ? "这轮画画的是" : "Drawing this round"} />
            {drawer || isHost ? (
              <div className="porcelain setup-card">
                <p className="hint-ink" style={{ margin: "10px 0 12px" }}>
                  {drawer ? (lang === "zh" ? "选个难度，分数不一样。词只有你能看到。" : "Pick a difficulty. Harder words score more. Only you will see the word.") : lang === "zh" ? `替 ${nameOf(v.drawer)} 选难度` : `Pick for ${nameOf(v.drawer)}`}
                </p>
                <div className="stack" style={{ gap: 10 }}>
                  {([1, 2, 3] as const).map((d) => (
                    <button key={d} type="button" className={`btn btn-block ${d === 1 ? "btn-jade" : d === 2 ? "btn-gold" : "btn-porcelain"}`} onClick={() => g("pick", { d })}>
                      {diffLabel(d)} · {d} {ui("score")}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Waiting>{lang === "zh" ? `${nameOf(v.drawer)} 在选词` : `${nameOf(v.drawer)} is choosing a word`}</Waiting>
            )}
            {ranked.some((p) => p.pts > 0) && <Scores ranked={ranked} />}
          </motion.div>
        )}

        {v.phase === "draw" && (
          <motion.div key={`draw-${v.round}`} className="stack" style={{ gap: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="row draw-head">
              <TimerArc seconds={ROUND_S} running endsAt={v.endsAt} offset={offset} size={64} />
              {drawer && v.word ? (
                <div className="draw-word">
                  <span className={`draw-word-main ${lang === "zh" ? "zh-display" : "en-display"}`}>{tr(v.word)}</span>
                  <span className="hint">
                    {lang === "zh" ? v.word.en : v.word.zh} · {diffLabel(v.d)}
                  </span>
                </div>
              ) : (
                <div className="draw-word">
                  <span className="draw-hint tabular">{hint}</span>
                  <span className="hint">
                    {nameOf(v.drawer)} · {diffLabel(v.d)} · {v.d} {ui("score")}
                  </span>
                </div>
              )}
            </div>

            <NetPlate canDraw={drawer} />

            {drawer ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="hint" style={{ textAlign: "center" }}>
                  {v.solved.length
                    ? lang === "zh"
                      ? `${v.solved.length} 人猜中了`
                      : `${v.solved.length} got it`
                    : lang === "zh"
                      ? "不能写字，不能说话"
                      : "No letters, no talking"}
                </p>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "center" }} onClick={() => g("giveup")}>
                  {lang === "zh" ? "画不下去了，结束这轮" : "End this round"}
                </button>
              </div>
            ) : solved ? (
              <p className="solved-line">
                <Check size={18} strokeWidth={3} />
                {lang === "zh" ? "你猜中了，等其他人" : "You got it. Waiting for the others."}
              </p>
            ) : watching ? null : (
              <form
                className="field guess-field"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = guess.trim();
                  if (!t) return;
                  g("guess", { text: t });
                  setGuess("");
                }}
              >
                <input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder={lang === "zh" ? "猜是什么" : "Your guess"} maxLength={24} enterKeyHint="send" autoComplete="off" aria-label={lang === "zh" ? "猜是什么" : "Your guess"} />
                <button type="submit" className="btn btn-gold btn-sm" disabled={!guess.trim()}>
                  <Send size={15} />
                  {lang === "zh" ? "猜" : "Guess"}
                </button>
              </form>
            )}

            {v.guesses.length > 0 && (
              <ul className="guess-list" ref={feed} aria-live="polite">
                {v.guesses.map((x, i) => (
                  <li key={i} className={x.ok ? "is-ok" : ""}>
                    <span className="guess-who">{x.pid === me ? ui("you") : nameOf(x.pid)}</span>
                    <span>{x.ok ? (lang === "zh" ? "猜中了" : "got it") : x.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}

        {v.phase === "result" && (
          <motion.div key={`result-${v.round}`} className="stack" style={{ gap: 14 }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain reveal-card">
              <p className="hint-ink">{lang === "zh" ? "答案" : "The word was"}</p>
              {v.word && <p className={`word-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{tr(v.word)}</p>}
              {v.word && <p className="hint-ink">{lang === "zh" ? v.word.en : v.word.zh}</p>}
              <p className="hint-ink" style={{ marginTop: 6 }}>
                {v.solved.length
                  ? lang === "zh"
                    ? `猜中：${v.solved.map(nameOf).join("、")}`
                    : `Got it: ${v.solved.map(nameOf).join(", ")}`
                  : lang === "zh"
                    ? `没人猜中，${nameOf(v.drawer)} ${custom ? "受罚" : "喝"}`
                    : `Nobody got it. ${nameOf(v.drawer)} ${custom ? "takes the penalty" : "drinks"}.`}
              </p>
            </div>
            <NetPlate canDraw={false} />
            <Scores ranked={ranked} />
            {drawer || isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                {lang === "zh" ? "下一位画" : "Next drawer"}
              </button>
            ) : (
              <Waiting>{ui("waitingFor", { name: nameOf(v.drawer) })}</Waiting>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <HostRow>{v.phase === "draw" && !drawer && <HostButton onClick={() => g("giveup")}>{lang === "zh" ? "结束这轮" : "End round"}</HostButton>}</HostRow>
    </NetFrame>
  );
}

function Scores({ ranked }: { ranked: { id: string; name: string; pts: number }[] }) {
  const { me } = useRoom();
  const { ui } = useStore();
  return (
    <ul className="score-list">
      {ranked.map((p) => (
        <li key={p.id} className={p.id === me ? "is-me" : ""}>
          <span>
            {p.name}
            {p.id === me ? ` · ${ui("you")}` : ""}
          </span>
          <span className="tabular">{p.pts}</span>
        </li>
      ))}
    </ul>
  );
}
