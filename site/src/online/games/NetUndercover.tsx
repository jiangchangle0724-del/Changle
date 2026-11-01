import { Check, Eye, EyeOff, Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Cloche } from "../../components/Cloche";
import { TimerArc } from "../../components/TimerArc";
import { UI } from "../../i18n";
import type { UcRole, UndercoverView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { useRoom } from "../RoomContext";
import { HostButton, HostRow, SeatPicker, useYourTurn, Waiting } from "./common";
import { Moment } from "../../components/Figure";

export function NetUndercover({ v, onLeave }: { v: UndercoverView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, offset } = useRoom();
  const { ui, tr, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const seats = room?.seats ?? [];
  const outSeat = v.phase === "reveal" && v.out ? seats.find((s) => s.id === v.out!.pid) : undefined;
  const inGame = v.inGame.includes(me);
  const alive = v.alive.includes(me);
  const speaker = v.order[v.speaker] ?? null;
  const speaking = v.phase === "talk" && speaker === me;
  useYourTurn(speaking);
  useYourTurn(v.phase === "vote" && alive);

  const roleName = (r: UcRole) => (r === "civ" ? (lang === "zh" ? "平民" : "Civilian") : r === "uc" ? (lang === "zh" ? "卧底" : "Undercover") : lang === "zh" ? "白板" : "Blank");
  const roleClass = (r: UcRole) => (r === "civ" ? "civilian" : r === "uc" ? "undercover" : "blank");
  const myWordText = v.isBlank ? (lang === "zh" ? "白板：你没有词，靠听" : "Blank: no word. Listen and bluff.") : v.myWord ? tr(v.myWord) : "";

  const [lid, setLid] = useState(false);
  const [peek, setPeek] = useState(false);
  const [desc, setDesc] = useState("");
  useEffect(() => {
    setLid(false);
    setPeek(false);
  }, [v.round, v.phase === "word"]);
  useEffect(() => setDesc(""), [v.speaker, v.round]);

  const rules = (
    <p>
      {lang === "zh"
        ? `每个人在自己的手机上点开看词，大多数人是同一个词，卧底拿到一个相近的词。按顺序每人用一句话描述自己的词，可以在手机上打出来。说完后每个人在手机上投票，票最多的出局。卧底全出局平民赢，卧底人数追平平民卧底赢，输的一方${custom ? "受罚" : "喝"}。`
        : `Everyone lifts the lid on their own phone. Most share one word; the undercover gets a similar one. In turn, describe your word in one line, typed on your phone if you like. Then everyone votes on their phone and the most votes is out. All undercovers out: civilians win. Undercovers match civilians: they win. The losing side ${custom ? "takes the penalty" : "drinks"}.`}
    </p>
  );

  const voteTally = v.votes
    ? Object.values(v.votes).reduce<Record<string, number>>((acc, t) => {
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <NetFrame title={UI.gameUndercover} rules={rules} onLeave={onLeave}>
      {inGame && v.phase !== "setup" && v.phase !== "word" && v.phase !== "end" && (
        <button type="button" className="my-word" onClick={() => setPeek((p) => !p)} aria-pressed={peek}>
          {peek ? <EyeOff size={16} /> : <Eye size={16} />}
          <span>{peek ? myWordText : lang === "zh" ? "看我的词" : "My word"}</span>
          {!alive && <span className="seat-tag seat-tag-away">{lang === "zh" ? "已出局" : "out"}</span>}
        </button>
      )}

      <AnimatePresence mode="wait">
        {v.phase === "setup" && (
          <motion.div key="setup" className="stack" style={{ gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain setup-card">
              <div className="settings-row ink">
                <span>{lang === "zh" ? "卧底人数" : "Undercovers"}</span>
                <div className="row" style={{ gap: 10 }}>
                  {isHost && (
                    <button type="button" className="icon-btn ink" onClick={() => g("config", { uc: v.uc - 1 })} disabled={v.uc <= 1} aria-label="-">
                      <Minus size={18} />
                    </button>
                  )}
                  <span className="tabular" style={{ minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 20 }}>
                    {v.uc}
                  </span>
                  {isHost && (
                    <button type="button" className="icon-btn ink" onClick={() => g("config", { uc: v.uc + 1 })} disabled={v.uc >= Math.min(3, v.maxSide)} aria-label="+">
                      <Plus size={18} />
                    </button>
                  )}
                </div>
              </div>
              <div className="settings-row ink">
                <span>{lang === "zh" ? "加一个白板" : "Add a blank"}</span>
                <button
                  type="button"
                  className={`btn btn-sm ${v.blank ? "btn-jade" : "btn-ghost ink"}`}
                  aria-pressed={v.blank}
                  disabled={!isHost || (!v.blank && v.uc + 1 > v.maxSide)}
                  onClick={() => g("config", { blank: !v.blank })}
                >
                  {v.blank ? (lang === "zh" ? "有" : "Yes") : lang === "zh" ? "无" : "No"}
                </button>
              </div>
              <p className="hint-ink" style={{ marginTop: 10 }}>
                {lang === "zh" ? `${seats.length} 人在座，至少 4 人。白板没有词，跟卧底一伙：白板也出局，平民才赢。` : `${seats.length} seated, 4 needed. A blank gets no word and plays on the undercover's side: civilians win only when the blank is out too.`}
                {!v.blank && v.uc + 1 > v.maxSide && (lang === "zh" ? `${v.uc} 个卧底时，${3 * (v.uc + 1) + 1} 人以上才能加白板。` : ` With ${v.uc} undercover${v.uc > 1 ? "s" : ""}, a blank needs ${3 * (v.uc + 1) + 1} or more players.`)}
              </p>
            </div>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("deal")} disabled={seats.length < 4}>
                {lang === "zh" ? "发词" : "Deal the words"}
              </button>
            ) : (
              <Waiting>{lang === "zh" ? `等主人 ${nameOf(room?.host)} 发词` : `Waiting for ${nameOf(room?.host)} to deal`}</Waiting>
            )}
          </motion.div>
        )}

        {v.phase === "word" && (
          <motion.div key={`word-${v.round}`} className="card-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {inGame ? (
              <>
                <p className="turn-line">
                  <span className="hint">{lang === "zh" ? "只有你能看" : "Only you can see this"}</span>
                </p>
                <Cloche open={lid} onOpen={() => setLid(true)}>
                  <div className="prompt-card">
                    <p className={`word-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{myWordText}</p>
                    {v.myWord && <p className="hint-ink">{lang === "zh" ? v.myWord.en : v.myWord.zh}</p>}
                  </div>
                </Cloche>
                {lid &&
                  (v.ready.includes(me) ? (
                    <Waiting>{ui("answeredN", { n: v.ready.length, m: v.alive.length })}</Waiting>
                  ) : (
                    <motion.button type="button" className="btn btn-primary btn-lg btn-block" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} onClick={() => g("ready")}>
                      {lang === "zh" ? "记住了" : "Got it"}
                    </motion.button>
                  ))}
              </>
            ) : (
              <Waiting>{lang === "zh" ? "这局发词时你还没入座，看他们玩，下一局带上你" : "You sat down after the deal. Watch this one; you're in next game."}</Waiting>
            )}
          </motion.div>
        )}

        {v.phase === "talk" && (
          <motion.div key={`talk-${v.round}`} className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="row draw-head">
              <TimerArc key={`${v.round}-${v.speaker}`} seconds={40} running endsAt={v.endsAt} offset={offset} size={64} />
              <div className="draw-word">
                <span className="hint">{ui("roundOf", { n: v.round })}</span>
                <span className="turn-name">{speaking ? ui("yourTurnNow") : nameOf(speaker)}</span>
              </div>
            </div>
            <ol className="talk-list">
              {v.order
                .filter((pid) => v.alive.includes(pid))
                .map((pid) => {
                  const idx = v.order.indexOf(pid);
                  const state = idx < v.speaker ? "done" : idx === v.speaker ? "now" : "next";
                  return (
                    <li key={pid} className={`talk-${state}`}>
                      <span className="talk-name">{pid === me ? ui("you") : nameOf(pid)}</span>
                      <span className="talk-desc">{v.desc[pid] ?? (state === "done" ? (lang === "zh" ? "（口头说了）" : "(said it aloud)") : "")}</span>
                    </li>
                  );
                })}
            </ol>
            {speaking ? (
              <form
                className="stack"
                style={{ gap: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (desc.trim()) g("desc", { text: desc.trim() });
                  g("done");
                }}
              >
                <label className="field">
                  <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={lang === "zh" ? "一句话描述你的词（可不写，直接说）" : "Describe your word in a line (or just say it)"} maxLength={30} enterKeyHint="done" />
                </label>
                <button type="submit" className="btn btn-primary btn-lg btn-block">
                  {lang === "zh" ? "说完了" : "Done"}
                </button>
              </form>
            ) : (
              <Waiting>{lang === "zh" ? `${nameOf(speaker)} 在描述` : `${nameOf(speaker)} is describing`}</Waiting>
            )}
          </motion.div>
        )}

        {v.phase === "vote" && (
          <motion.div key={`vote-${v.round}`} className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="row draw-head">
              <TimerArc key={`vote-${v.round}`} seconds={60} running endsAt={v.endsAt} offset={offset} size={64} />
              <div className="draw-word">
                <span className="turn-name">{lang === "zh" ? "投票" : "Vote"}</span>
                <span className="hint tabular">{ui("answeredN", { n: v.voted.length, m: v.alive.length })}</span>
              </div>
            </div>
            {alive ? (
              <>
                <p className="hint" style={{ textAlign: "center" }}>
                  {lang === "zh" ? "投你觉得是卧底的人，投完还能改" : "Vote for who you think is undercover. You can change it."}
                </p>
                <SeatPicker only={v.alive} exclude={[me]} selected={v.myVote ? [v.myVote] : []} onPick={(pid) => g("vote", { target: pid })} />
              </>
            ) : (
              <Waiting>{lang === "zh" ? "你已出局，看他们投" : "You're out. Watch the vote."}</Waiting>
            )}
          </motion.div>
        )}

        {v.phase === "reveal" && (
          <motion.div key={`reveal-${v.round}`} className="stack" style={{ gap: 14, alignItems: "center" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {v.out && outSeat && <Moment seat={outSeat} kind="out" tag={roleName(v.out.role)} tagTone={v.out.role === "civ" ? "neutral" : "bad"} caught={v.out.role !== "civ"} />}
            <div className="porcelain reveal-card" style={{ width: "100%" }}>
              {v.out ? (
                <>
                  <p className="hint-ink">{lang === "zh" ? "出局" : "Out"}</p>
                  <p className="turn-name ink" style={{ fontSize: 28 }}>
                    {v.out.pid === me ? ui("you") : nameOf(v.out.pid)}
                  </p>
                  <motion.p className={`reveal-role ${roleClass(v.out.role)}`} initial={{ scale: 2, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 22, delay: 1.1 }}>
                    {roleName(v.out.role)}
                  </motion.p>
                </>
              ) : (
                <p className="turn-name ink" style={{ fontSize: 22 }}>
                  {lang === "zh" ? "平票，没人出局" : "A tie. Nobody is out."}
                </p>
              )}
              {v.votes && (
                <ul className="role-list">
                  {Object.entries(voteTally)
                    .sort((a, b) => b[1] - a[1])
                    .map(([pid, n]) => (
                      <li key={pid}>
                        <span>{nameOf(pid)}</span>
                        <span className="tabular">{lang === "zh" ? `${n} 票` : `${n} vote${n > 1 ? "s" : ""}`}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                {v.winner ? (lang === "zh" ? "看结果" : "See the result") : lang === "zh" ? "下一轮" : "Next round"}
              </button>
            ) : (
              <Waiting>{lang === "zh" ? `等主人 ${nameOf(room?.host)}` : `Waiting for ${nameOf(room?.host)}`}</Waiting>
            )}
          </motion.div>
        )}

        {v.phase === "end" && (
          <motion.div key="end" className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="porcelain reveal-card">
              <p className={`turn-name ink ${lang === "zh" ? "zh-display" : "en-display"}`} style={{ fontSize: 26 }}>
                {v.winner === "civ" ? (lang === "zh" ? "平民赢了" : "Civilians win") : lang === "zh" ? "卧底赢了" : "Undercovers win"}
              </p>
              {v.pair && (
                <p className="hint-ink" style={{ marginTop: 8 }}>
                  {lang === "zh" ? "平民" : "Civilians"}: <strong>{tr(v.pair.civ)}</strong> · {lang === "zh" ? "卧底" : "Undercover"}: <strong>{tr(v.pair.uc)}</strong>
                </p>
              )}
              {v.roles && (
                <ul className="role-list">
                  {Object.entries(v.roles).map(([pid, r]) => (
                    <li key={pid}>
                      <span>
                        {nameOf(pid)}
                        {pid === me ? ` · ${ui("you")}` : ""}
                      </span>
                      <span className={`reveal-role small ${roleClass(r)}`}>{roleName(r)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("again")}>
                {ui("restart")}
              </button>
            ) : (
              <Waiting>{lang === "zh" ? `等主人 ${nameOf(room?.host)} 再开一局` : `Waiting for ${nameOf(room?.host)} to go again`}</Waiting>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <HostRow>
        {(v.phase === "word" || v.phase === "talk" || v.phase === "vote") && (
          <HostButton onClick={() => g("force")}>{v.phase === "talk" ? (lang === "zh" ? "直接投票" : "Go to the vote") : v.phase === "vote" ? (lang === "zh" ? "现在开票" : "Count now") : ui("goNow")}</HostButton>
        )}
        {v.phase === "talk" && !speaking && <HostButton onClick={() => g("done")}>{lang === "zh" ? "下一个说" : "Next speaker"}</HostButton>}
      </HostRow>
      {inGame && v.phase === "vote" && v.myVote && (
        <p className="hint" style={{ textAlign: "center" }}>
          <Check size={14} /> {lang === "zh" ? `你投了 ${nameOf(v.myVote)}` : `You voted ${nameOf(v.myVote)}`}
        </p>
      )}
    </NetFrame>
  );
}
