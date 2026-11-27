import { Check, Eye, EyeOff, Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import "../../games/Undercover.css";
import { useEffect, useId, useState } from "react";
import { Cloche } from "../../components/Cloche";
import { TimerArc } from "../../components/TimerArc";
import { UI } from "../../i18n";
import { MAX_REDEALS, saidBefore, saysWord } from "../../shared/engine/games/undercover";
import type { UcRole, UndercoverView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { useRoom } from "../RoomContext";
import { usePlayers, useWatching } from "../players";
import { HostButton, HostRow, joinNames, SeatPicker, useYourTurn, Waiting } from "./common";
import { Moment } from "../../components/Figure";

export function NetUndercover({ v, onLeave }: { v: UndercoverView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, offset } = useRoom();
  const { ui, tr, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const seats = room?.seats ?? [];
  // who gets a word: the players (the server deals to them only; someone just watching sits it out)
  const players = usePlayers();
  const watching = useWatching();
  const outSeat = (v.phase === "reveal" || v.phase === "guess") && v.out ? seats.find((s) => s.id === v.out!.pid) : undefined;
  const inGame = v.inGame.includes(me);
  const alive = v.alive.includes(me);
  const speaker = v.order[v.speaker] ?? null;
  const speaking = v.phase === "talk" && speaker === me;
  // 平票加赛: the tied players describe again and everyone else votes between them
  const runoff = v.pk.length > 0;
  const voting = v.voters.includes(me);
  const guessing = v.phase === "guess" && v.out?.pid === me;
  useYourTurn(speaking);
  useYourTurn(v.phase === "vote" && voting);
  useYourTurn(guessing);
  const names = (ids: string[]) => joinNames(ids.map((x) => (x === me ? ui("you") : nameOf(x))), lang);

  const roleName = (r: UcRole) => (r === "civ" ? (lang === "zh" ? "平民" : "Civilian") : r === "uc" ? (lang === "zh" ? "卧底" : "Undercover") : lang === "zh" ? "白板" : "Blank");
  const roleClass = (r: UcRole) => (r === "civ" ? "civilian" : r === "uc" ? "undercover" : "blank");
  const myWordText = v.isBlank ? (lang === "zh" ? "白板：你没有词，靠听" : "Blank: no word. Listen and bluff.") : v.myWord ? tr(v.myWord) : "";

  const [lid, setLid] = useState(false);
  const [peek, setPeek] = useState(false);
  const [desc, setDesc] = useState("");
  const [guess, setGuess] = useState("");
  useEffect(() => {
    setLid(false);
    setPeek(false);
  }, [v.round, v.phase === "word", v.redeals]);
  useEffect(() => setDesc(""), [v.speaker, v.round, runoff]);
  // 忌爆字: a line with your own word in it gives the game away, so the phone won't send it; nor
  // one somebody already typed this game (忌跟描: say something of your own)
  const giveaway = saysWord(desc, v.myWord);
  const repeat = !giveaway && saidBefore(desc, [...v.said.flatMap((r) => Object.values(r.desc)), ...Object.entries(v.desc).filter(([id]) => id !== me).map(([, l]) => l)]);
  const badLine = giveaway || repeat;

  const rules = (
    <p>
      {lang === "zh"
        ? `每个人在自己的手机上点开看词，大多数人是同一个词，卧底拿到一个相近的词。按顺序每人用一句话描述自己的词，可以在手机上打出来，但不能说出词里的字。说完后每个人在手机上投票，票最多的出局；平票的几个人加赛再说一句，其他人只在他们中间投。白板被投出去时可以猜一次平民的词，猜中白板一个人赢。卧底全出局平民赢，卧底人数追平平民卧底赢，输的一方${custom ? "受罚" : "喝"}。`
        : `Everyone lifts the lid on their own phone. Most share one word; the undercover gets a similar one. In turn, describe your word in one line, typed on your phone if you like, without saying the word itself. Then everyone votes on their phone and the most votes is out. A tie: the tied players describe once more and the rest vote between them. A blank who is voted out gets one guess at the civilians' word, and wins alone if it's right. All undercovers out: civilians win. Undercovers match civilians: they win. The losing side ${custom ? "takes the penalty" : "drinks"}.`}
    </p>
  );

  // who voted for whom, out in the open once the votes are counted (as on the big screen)
  const voteTally: Record<string, string[]> = {};
  for (const [voter, target] of Object.entries(v.votes ?? {})) (voteTally[target] ??= []).push(voter);

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
                    <button type="button" className="icon-btn ink" onClick={() => g("config", { uc: v.uc - 1 })} disabled={v.uc <= 1} aria-label={lang === "zh" ? "少一个卧底" : "One undercover fewer"}>
                      <Minus size={18} />
                    </button>
                  )}
                  <span className="tabular" style={{ minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 20 }}>
                    {v.uc}
                  </span>
                  {isHost && (
                    <button type="button" className="icon-btn ink" onClick={() => g("config", { uc: v.uc + 1 })} disabled={v.uc >= Math.min(3, v.maxSide)} aria-label={lang === "zh" ? "多一个卧底" : "One undercover more"}>
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
              <div className="settings-row ink">
                <span>{lang === "zh" ? "成人档" : "Adults-only words"}</span>
                <button type="button" className={`btn btn-sm ${v.adult ? "btn-jade" : "btn-ghost ink"}`} aria-pressed={v.adult} disabled={!isHost} onClick={() => g("config", { adult: !v.adult })}>
                  {v.adult ? (lang === "zh" ? "开" : "On") : lang === "zh" ? "关" : "Off"}
                </button>
              </div>
              {v.adult && <p className="hint-ink" style={{ marginTop: "var(--space-3)" }}>{lang === "zh" ? "成人档：性、约会、夜生活和喝酒，尺度大，只给成年人玩。" : "Adults-only words: sex, dating, nights out and drinking. Strictly for grown-ups."}</p>}
              <p className="hint-ink" style={{ marginTop: 10 }}>
                {lang === "zh" ? `${players.length} 人在玩，至少 4 人。白板没有词，跟卧底一伙：白板也出局，平民才赢。白板被投出去时能猜一次平民的词，猜中就赢。` : `${players.length} playing, 4 needed. A blank gets no word and plays on the undercover's side: civilians win only when the blank is out too. A blank voted out gets one guess at the civilians' word and wins if it's right.`}
                {!v.blank && v.uc + 1 > v.maxSide && (lang === "zh" ? `${v.uc} 个卧底时，${3 * (v.uc + 1) + 1} 人以上才能加白板。` : ` With ${v.uc} undercover${v.uc > 1 ? "s" : ""}, a blank needs ${3 * (v.uc + 1) + 1} or more players.`)}
              </p>
            </div>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("deal")} disabled={players.length < 4}>
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
                  <span className="hint">
                    {v.redeals > 0 ? (lang === "zh" ? "换了一组新词，再看一次。只有你能看" : "A fresh pair. Look again; only you can see it") : lang === "zh" ? "只有你能看" : "Only you can see this"}
                  </span>
                </p>
                <Cloche key={v.redeals} open={lid} onOpen={() => setLid(true)}>
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
            ) : watching ? null : (
              <Waiting>{lang === "zh" ? "这局发词时你还没入座，看他们玩，下一局带上你" : "You sat down after the deal. Watch this one; you're in next game."}</Waiting>
            )}
          </motion.div>
        )}

        {v.phase === "talk" && (
          <motion.div key={`talk-${v.round}`} className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="row draw-head">
              <TimerArc key={`${v.round}-${v.speaker}`} seconds={40} running endsAt={v.endsAt} offset={offset} size={64} />
              <div className="draw-word">
                <span className="hint">{runoff ? (lang === "zh" ? `第 ${v.round} 轮 · 平票加赛` : `Round ${v.round} · tie run-off`) : ui("roundOf", { n: v.round })}</span>
                <span className="turn-name">{speaking ? ui("yourTurnNow") : nameOf(speaker)}</span>
              </div>
            </div>
            {runoff && <p className="hint" style={{ textAlign: "center" }}>{lang === "zh" ? `${names(v.pk)} 平票，再各说一句` : `${names(v.pk)} tied. One more line each.`}</p>}
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
                  if (badLine) return;
                  if (desc.trim()) g("desc", { text: desc.trim() });
                  // the tap names its speaker and round, so a double tap moves the table on once
                  g("done", { speaker: v.speaker, round: v.round });
                }}
              >
                <label className="field">
                  <input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder={lang === "zh" ? "一句话描述你的词（可不写，直接说）" : "Describe your word in a line (or just say it)"}
                    maxLength={30}
                    enterKeyHint="done"
                    aria-invalid={badLine}
                    aria-describedby={badLine ? "uc-bad-line" : undefined}
                  />
                </label>
                {badLine && (
                  <p id="uc-bad-line" className="uc-warn" role="alert">
                    {giveaway ? (lang === "zh" ? "这句里有你的词，换个说法" : "That line has your word in it. Say it another way.") : lang === "zh" ? "这句有人说过了，换一句自己的" : "Someone already said that. Try a line of your own."}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={badLine}>
                  {lang === "zh" ? "说完了" : "Done"}
                </button>
              </form>
            ) : (
              <Waiting>{lang === "zh" ? `${nameOf(speaker)} 在描述` : `${nameOf(speaker)} is describing`}</Waiting>
            )}
            <SaidLog said={v.said} label={(pid) => (pid === me ? ui("you") : nameOf(pid))} />
          </motion.div>
        )}

        {v.phase === "vote" && (
          <motion.div key={`vote-${v.round}`} className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="row draw-head">
              <TimerArc key={`vote-${v.round}`} seconds={60} running endsAt={v.endsAt} offset={offset} size={64} />
              <div className="draw-word">
                <span className="turn-name">{runoff ? (lang === "zh" ? "加赛投票" : "Run-off vote") : lang === "zh" ? "投票" : "Vote"}</span>
                <span className="hint tabular">{ui("answeredN", { n: v.voted.length, m: v.voters.length })}</span>
              </div>
            </div>
            {voting ? (
              <>
                <p className="hint" style={{ textAlign: "center" }}>
                  {runoff
                    ? lang === "zh"
                      ? `只在 ${names(v.pk)} 之间投，投完还能改`
                      : `Vote between ${names(v.pk)}. You can change it.`
                    : lang === "zh"
                      ? "投你觉得是卧底的人，投完还能改"
                      : "Vote for who you think is undercover. You can change it."}
                </p>
                <SeatPicker only={runoff ? v.pk : v.alive} exclude={[me]} selected={v.myVote ? [v.myVote] : []} onPick={(pid) => g("vote", { target: pid })} />
              </>
            ) : alive ? (
              <Waiting>{lang === "zh" ? "你在加赛里，等其他人投" : "You're in the run-off. The others are voting."}</Waiting>
            ) : watching ? null : (
              <Waiting>{lang === "zh" ? "你已出局，看他们投" : "You're out. Watch the vote."}</Waiting>
            )}
            <SaidLog said={v.said} label={(pid) => (pid === me ? ui("you") : nameOf(pid))} open />
          </motion.div>
        )}

        {v.phase === "guess" && v.out && (
          <motion.div key={`guess-${v.round}`} className="stack" style={{ gap: 14, alignItems: "center" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {outSeat && <Moment seat={outSeat} kind="out" tag={roleName("blank")} tagTone="bad" caught />}
            <div className="row draw-head">
              <TimerArc key={`guess-${v.round}`} seconds={45} running endsAt={v.endsAt} offset={offset} size={64} />
              <div className="draw-word">
                <span className="hint">{lang === "zh" ? "白板出局，最后一搏" : "The blank is out. One last shot"}</span>
                <span className="turn-name">{guessing ? (lang === "zh" ? "猜平民的词" : "Guess the civilians' word") : nameOf(v.out.pid)}</span>
              </div>
            </div>
            {guessing ? (
              <form
                className="stack"
                style={{ gap: 10, width: "100%" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (guess.trim()) g("guess", { text: guess.trim() });
                }}
              >
                <p className="hint" style={{ textAlign: "center" }}>
                  {lang === "zh" ? "猜中了你一个人赢，猜错了游戏接着玩。中文英文都行。" : "Right, and you win alone. Wrong, and the game goes on. Chinese or English."}
                </p>
                <label className="field">
                  <input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder={lang === "zh" ? "平民的词是……" : "The civilians' word is…"} maxLength={20} enterKeyHint="done" autoFocus />
                </label>
                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!guess.trim()}>
                  {lang === "zh" ? "就猜这个" : "That's my guess"}
                </button>
              </form>
            ) : (
              <Waiting>{lang === "zh" ? `${nameOf(v.out.pid)} 是白板，正在猜平民的词` : `${nameOf(v.out.pid)} was the blank and is guessing the civilians' word`}</Waiting>
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
              ) : runoff ? (
                <>
                  <p className="turn-name ink" style={{ fontSize: 22 }}>
                    {lang === "zh" ? "平票，加赛" : "A tie: run-off"}
                  </p>
                  <p className="hint-ink">{lang === "zh" ? `${names(v.pk)} 再各说一句，其他人只在他们中间投` : `${names(v.pk)} say one more line each, then the rest vote between them`}</p>
                </>
              ) : (
                <p className="turn-name ink" style={{ fontSize: 22 }}>
                  {lang === "zh" ? "平票，这轮没人出局" : "A tie. Nobody is out this round."}
                </p>
              )}
              {v.guess && (
                <p className={`uc-guess ${v.guess.right ? "is-right" : ""}`}>
                  {v.guess.text
                    ? lang === "zh"
                      ? `白板猜：${v.guess.text}，${v.guess.right ? "猜中了！白板赢" : "没猜中"}`
                      : `The blank guessed "${v.guess.text}": ${v.guess.right ? "right! The blank wins" : "wrong"}`
                    : lang === "zh"
                      ? "白板没猜，时间到了"
                      : "The blank ran out of time"}
                </p>
              )}
              {v.votes && (
                <ul className="role-list">
                  {Object.entries(voteTally)
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([pid, voters]) => (
                      <li key={pid} className="uc-tally-row">
                        <span className="uc-tally-who">
                          <span>{pid === me ? ui("you") : nameOf(pid)}</span>
                          <small className="hint-ink">{voters.map((x) => (x === me ? ui("you") : nameOf(x))).join(lang === "zh" ? "、" : ", ")}</small>
                        </span>
                        <span className="tabular">{lang === "zh" ? `${voters.length} 票` : `${voters.length} vote${voters.length > 1 ? "s" : ""}`}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {isHost && v.guess && v.guess.text && !v.guess.right && (
              // the phone takes only the exact word: the table can count a near miss (土豆 for 马铃薯)
              <button type="button" className="btn btn-ghost btn-block" onClick={() => g("guessOk")}>
                {lang === "zh" ? "意思对上了，算白板猜中" : "Close enough: count it for the blank"}
              </button>
            )}
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                {v.winner ? (lang === "zh" ? "看结果" : "See the result") : runoff ? (lang === "zh" ? "开始加赛" : "Start the run-off") : lang === "zh" ? "下一轮" : "Next round"}
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
                {v.winner === "civ" ? (lang === "zh" ? "平民赢了" : "Civilians win") : v.winner === "blank" ? (lang === "zh" ? "白板赢了" : "The blank wins") : lang === "zh" ? "卧底赢了" : "Undercovers win"}
              </p>
              {v.winner === "blank" && <p className="hint-ink">{lang === "zh" ? "白板猜中了平民的词，一个人赢" : "The blank guessed the civilians' word and wins alone"}</p>}
              {/* nobody was voted out this time: someone leaving the table decided it */}
              {!v.out && <p className="hint-ink">{lang === "zh" ? "有人离开了桌子，这局提前结束" : "Someone left the table, so this game ended early"}</p>}
              {v.pair && (
                <p className="hint-ink" style={{ marginTop: 8 }}>
                  {lang === "zh" ? "平民" : "Civilians"}: <strong>{tr(v.pair.civ)}</strong> · {lang === "zh" ? "卧底" : "Undercover"}: <strong>{tr(v.pair.uc)}</strong>
                </p>
              )}
              {v.roles && (
                <ul className="role-list">
                  {/* in seat order; a player who left the table mid-game has no name here any more */}
                  {seats
                    .filter((s) => v.roles![s.id])
                    .map((s) => (
                      <li key={s.id}>
                        <span>
                          {s.name}
                          {s.id === me ? ` · ${ui("you")}` : ""}
                        </span>
                        <span className={`reveal-role small ${roleClass(v.roles![s.id])}`}>{roleName(v.roles![s.id])}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {v.roles && <Recap said={v.said} roles={v.roles} label={(pid) => (pid === me ? ui("you") : nameOf(pid))} roleName={roleName} roleClass={roleClass} />}
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
        {/* each tap says which screen it was made on, so one arriving twice moves the table on once */}
        {(v.phase === "word" || v.phase === "talk" || v.phase === "vote" || v.phase === "guess") && (
          <HostButton onClick={() => g("force", { phase: v.phase })}>
            {v.phase === "talk" ? (lang === "zh" ? "直接投票" : "Go to the vote") : v.phase === "vote" ? (lang === "zh" ? "现在开票" : "Count now") : v.phase === "guess" ? (lang === "zh" ? "不等白板了" : "Stop the guess") : ui("goNow")}
          </HostButton>
        )}
        {/* 换一组词: someone doesn't know the word, or the table had it lately; the tap carries the count it saw */}
        {v.phase === "word" && v.redeals < MAX_REDEALS && (
          <HostButton onClick={() => g("redeal", { n: v.redeals })}>{lang === "zh" ? `换一组词（还能换 ${MAX_REDEALS - v.redeals} 次）` : `New pair (${MAX_REDEALS - v.redeals} left)`}</HostButton>
        )}
        {v.phase === "talk" && !speaking && <HostButton onClick={() => g("done", { speaker: v.speaker, round: v.round })}>{lang === "zh" ? "下一个说" : "Next speaker"}</HostButton>}
      </HostRow>
      {inGame && v.phase === "vote" && v.myVote && (
        <p className="hint" style={{ textAlign: "center" }}>
          <Check size={14} /> {lang === "zh" ? `你投了 ${nameOf(v.myVote)}` : `You voted ${nameOf(v.myVote)}`}
        </p>
      )}
    </NetFrame>
  );
}

/**
 * 前几轮说了什么: the typed lines of the rounds already voted on, newest first, so the table can
 * catch someone whose story changed. Open by default on the vote screen, folded while people talk.
 */
function SaidLog({ said, label, open: start = false }: { said: UndercoverView["said"]; label: (pid: string) => string; open?: boolean }) {
  const { lang } = useStore();
  const [open, setOpen] = useState(start);
  const id = useId();
  const rounds = said.filter((r) => Object.keys(r.desc).length > 0);
  if (!rounds.length) return null;
  return (
    <section className="uc-said">
      <button type="button" className="link-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {open ? (lang === "zh" ? "收起前几轮" : "Hide earlier rounds") : lang === "zh" ? "看前几轮说了什么" : "What people said before"}
      </button>
      {open && (
        <div id={id} className="stack" style={{ gap: "var(--space-3)" }}>
          {[...rounds].reverse().map((r) => (
            <div key={`${r.round}-${r.pk ? "pk" : ""}`}>
              <p className="hint">{r.pk ? (lang === "zh" ? `第 ${r.round} 轮 · 加赛` : `Round ${r.round} · run-off`) : lang === "zh" ? `第 ${r.round} 轮` : `Round ${r.round}`}</p>
              <ol className="talk-list">
                {Object.entries(r.desc).map(([pid, line]) => (
                  <li key={pid} className="talk-done">
                    <span className="talk-name">{label(pid)}</span>
                    <span className="talk-desc">{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * 复盘: once the roles are out, the whole game round by round, with everyone's role by their name:
 * what each said, who voted for whom, who went. The laughs come from what the undercover said.
 */
function Recap({
  said,
  roles,
  label,
  roleName,
  roleClass,
}: {
  said: UndercoverView["said"];
  roles: Record<string, UcRole>;
  label: (pid: string) => string;
  roleName: (r: UcRole) => string;
  roleClass: (r: UcRole) => string;
}) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [open, setOpen] = useState(false);
  const id = useId();
  const rounds = said.filter((r) => Object.keys(r.desc).length > 0 || (r.votes && Object.keys(r.votes).length > 0));
  if (!rounds.length) return null;
  const who = (pid: string) => (
    <>
      {label(pid)} {roles[pid] && <span className={`reveal-role small ${roleClass(roles[pid])}`}>{roleName(roles[pid])}</span>}
    </>
  );
  return (
    <section className="uc-said">
      <button type="button" className="link-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {open ? (zh ? "收起复盘" : "Hide the replay") : zh ? "复盘：每轮谁说了什么、谁投了谁" : "Replay: every round's lines and votes"}
      </button>
      {open && (
        <div id={id} className="stack" style={{ gap: "var(--space-4)" }}>
          {rounds.map((r) => {
            const votes: Record<string, string[]> = {};
            for (const [voter, target] of Object.entries(r.votes ?? {})) (votes[target] ??= []).push(voter);
            return (
              <div key={`${r.round}-${r.pk ? "pk" : ""}`} className="stack" style={{ gap: "var(--space-2)" }}>
                <p className="hint">{r.pk ? (zh ? `第 ${r.round} 轮 · 加赛` : `Round ${r.round} · run-off`) : zh ? `第 ${r.round} 轮` : `Round ${r.round}`}</p>
                {Object.keys(r.desc).length > 0 && (
                  <ol className="talk-list">
                    {Object.entries(r.desc).map(([pid, line]) => (
                      <li key={pid} className="talk-done">
                        <span className="talk-name">{label(pid)}</span>
                        <span className="talk-desc">
                          {line} {roles[pid] && roles[pid] !== "civ" && <span className={`reveal-role small ${roleClass(roles[pid])}`}>{roleName(roles[pid])}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {Object.keys(votes).length > 0 && (
                  <ul className="uc-recap-votes">
                    {Object.entries(votes)
                      .sort((a, b) => b[1].length - a[1].length)
                      .map(([target, voters]) => (
                        <li key={target}>
                          <span>{who(target)}</span>
                          <span className="hint">{zh ? `${voters.length} 票：${voters.map(label).join("、")}` : `${voters.length} vote${voters.length > 1 ? "s" : ""}: ${voters.map(label).join(", ")}`}</span>
                        </li>
                      ))}
                  </ul>
                )}
                {r.votes && <p className="hint">{r.out ? (zh ? `出局：${label(r.out)}` : `Out: ${label(r.out)}`) : zh ? "平票，没人出局" : "A tie, nobody out"}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
