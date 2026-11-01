import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { TimerArc } from "../../components/TimerArc";
import { UI } from "../../i18n";
import { haptic } from "../../lib/sfx";
import type { PromptsView } from "../../shared/protocol";
import { useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { useCue, useRoom } from "../RoomContext";
import { HostButton, HostRow, joinNames, SeatPicker, TurnLine, useYourTurn, Waiting } from "./common";
import { sfx } from "../../lib/sfx";
import { Lineup, Moment } from "../../components/Figure";

export function NetPrompts({ v, onLeave }: { v: PromptsView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, offset } = useRoom();
  const { ui, tr, lang } = useStore();
  const seats = room?.seats ?? [];
  const reader = v.reader === me;
  const never = v.mode === "never";
  useYourTurn(v.phase === "draw" && reader);
  // a new card asks everyone at once
  useCue(v.phase === "answer", () => {
    sfx.pop();
    haptic(10);
  });

  const lead = never ? (lang === "zh" ? "我从来没有……" : "Never have I ever…") : lang === "zh" ? "在座谁最有可能……" : "Who's most likely to…";
  const other = (c: { zh: string; en: string }) =>
    never ? (lang === "zh" ? `Never have I ever ${c.en}` : `我从来没有${c.zh}`) : lang === "zh" ? `Who's most likely to ${c.en}` : `在座谁最有可能${c.zh}`;

  const rules = (
    <p>
      {lang === "zh"
        ? "我从来没有：念卡的人抽一张，每个人在自己手机上偷偷选做过还是没做过，最后一起亮出来，做过的都喝。谁最有可能：每个人在手机上投一个人，票最多的喝。三十秒没选完就直接亮。"
        : "Never Have I Ever: the reader draws a card; everyone secretly answers on their own phone, then all answers flip at once and everyone who has done it drinks. Most Likely To: everyone votes for someone on their phone; the most votes drinks. After thirty seconds the answers flip anyway."}
    </p>
  );

  const result = v.result;
  const seatOf = (pid: string) => room?.seats.find((s) => s.id === pid);
  const counts = result && result.counts ? Object.entries(result.counts).sort((a, b) => b[1] - a[1]) : [];

  return (
    <NetFrame title={UI.gamePrompts} rules={rules} onLeave={onLeave}>
      <div className="deck-stage">
        <div className="segmented-row" style={{ justifyContent: "center" }}>
          <div className="lang-tab heat-tab" role="group">
            <button aria-pressed={never} disabled={!isHost} onClick={() => g("mode", { mode: "never" })}>
              {lang === "zh" ? "我从来没有" : "Never have I ever"}
            </button>
            <button aria-pressed={!never} disabled={!isHost} onClick={() => g("mode", { mode: "likely" })}>
              {lang === "zh" ? "谁最有可能" : "Most likely to"}
            </button>
          </div>
        </div>
        <p className="deck-lead">{lead}</p>
        <div className="deck-stack">
          <div className="porcelain deck-ghost deck-ghost-2" aria-hidden="true" />
          <div className="porcelain deck-ghost" aria-hidden="true" />
          <AnimatePresence mode="popLayout" initial={false}>
            {v.card ? (
              <motion.div
                key={v.card.zh}
                className="porcelain deck-card"
                initial={{ y: 60, rotate: 4, opacity: 0 }}
                animate={{ y: 0, rotate: 0, opacity: 1 }}
                exit={{ x: -260, rotate: -10, opacity: 0, transition: { duration: 0.3 } }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              >
                <p className="deck-text">{tr(v.card)}</p>
                <p className="hint-ink prompt-other">{other(v.card)}</p>
              </motion.div>
            ) : (
              <motion.div key="empty" className="porcelain deck-card deck-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="hint-ink">{lang === "zh" ? "抽一张，念出来。" : "Draw a card and read it out."}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {v.phase === "draw" && (
            <motion.div key="draw" className="stack" style={{ gap: 8 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TurnLine pid={v.reader} lead={lang === "zh" ? "念卡" : "Reading"} />
              {reader || isHost ? (
                <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("draw")}>
                  {lang === "zh" ? "抽一张" : "Draw a card"}
                </button>
              ) : (
                <Waiting>{lang === "zh" ? `等 ${nameOf(v.reader)} 抽卡` : `Waiting for ${nameOf(v.reader)} to draw`}</Waiting>
              )}
              <p className="hint tabular" style={{ textAlign: "center" }}>
                {ui("remaining", { n: v.left })}
              </p>
            </motion.div>
          )}

          {v.phase === "answer" && (
            <motion.div key={`answer-${v.card?.zh}`} className="stack" style={{ gap: 12 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="row answer-head">
                <TimerArc seconds={30} running endsAt={v.endsAt} offset={offset} size={64} />
                <p className="hint tabular">{ui("answeredN", { n: v.answered.length, m: seats.length })}</p>
              </div>
              {never ? (
                <>
                  <p className="hint" style={{ textAlign: "center" }}>
                    {lang === "zh" ? "偷偷选，最后一起亮" : "Answer in secret. Everyone flips together."}
                  </p>
                  <div className="row" style={{ gap: 10 }}>
                    <button type="button" className={`btn btn-lg btn-block ${v.mine === true ? "btn-penalty" : "btn-ghost"}`} aria-pressed={v.mine === true} onClick={() => g("ans", { yes: true })}>
                      {v.mine === true && <Check size={18} strokeWidth={3} />}
                      {lang === "zh" ? "我做过" : "I have"}
                    </button>
                    <button type="button" className={`btn btn-lg btn-block ${v.mine === false ? "btn-porcelain" : "btn-ghost"}`} aria-pressed={v.mine === false} onClick={() => g("ans", { yes: false })}>
                      {v.mine === false && <Check size={18} strokeWidth={3} />}
                      {lang === "zh" ? "没做过" : "Never"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint" style={{ textAlign: "center" }}>
                    {lang === "zh" ? "投一个人，不能投自己" : "Vote for someone. Not yourself."}
                  </p>
                  <SeatPicker exclude={[me]} selected={typeof v.mine === "string" ? [v.mine] : []} onPick={(pid) => g("vote", { target: pid })} />
                </>
              )}
            </motion.div>
          )}

          {v.phase === "reveal" && result && (
            <motion.div key={`reveal-${v.card?.zh}`} className="stack" style={{ gap: 12, alignItems: "center" }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              {never ? (
                <Lineup items={(result.yes ?? []).filter((pid) => seatOf(pid)).map((pid) => ({ seat: seatOf(pid)!, pose: "cheers" as const }))} />
              ) : (
                result.top &&
                result.top.length > 0 && (
                  <div className="moment-row">
                    {result.top.slice(0, 3).map((pid) => {
                      const st = seatOf(pid);
                      return st ? <Moment key={pid} seat={st} kind="picked" small /> : null;
                    })}
                  </div>
                )
              )}
              {never ? (
                <p className="reveal-line">
                  {result.yes && result.yes.length
                    ? lang === "zh"
                      ? `做过的：${joinNames(result.yes.map(nameOf), "zh")}`
                      : `Done it: ${joinNames(result.yes.map(nameOf), "en")}`
                    : lang === "zh"
                      ? "没人做过，都不用喝"
                      : "Nobody has. Nobody drinks."}
                </p>
              ) : (
                <ul className="vote-list">
                  {counts.length === 0 && <li className="hint">{lang === "zh" ? "没人投票" : "No votes"}</li>}
                  {counts.map(([pid, n]) => (
                    <li key={pid} className={result.top?.includes(pid) ? "is-top" : ""}>
                      <span>{nameOf(pid)}</span>
                      <span className="vote-bar" style={{ width: `${(n / Math.max(1, counts[0][1])) * 100}%` }} aria-hidden="true" />
                      <span className="tabular">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
              {reader || isHost ? (
                <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                  {ui("next")}
                </button>
              ) : (
                <Waiting>{ui("waitingFor", { name: nameOf(v.reader) })}</Waiting>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <HostRow>{v.phase === "answer" && <HostButton onClick={() => g("force")}>{ui("goNow")}</HostButton>}</HostRow>
      </div>
    </NetFrame>
  );
}
