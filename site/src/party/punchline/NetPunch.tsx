import { Check, Crown, Pencil, Tv } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { useCue, useReached, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { PunchMatch, PunchView } from "../../shared/protocol";
import { RESULT_BEATS } from "../../shared/punchline";
import { useStore } from "../../store";
import { useWakeLock } from "../sensors";
import { PromptCard } from "./parts";
import { Stage, type Who } from "./show/Stage";
import { useWho } from "./show/who";
import "../../styles/party.css";

const SIDE = ["#e765f0", "#31b9ff"];
const FINAL_COLORS = ["#e765f0", "#31b9ff", "#ffb82e", "#4be38f", "#ff6b5e", "#8c86ff", "#2ed3d9", "#f5df3b"];

/**
 * Punchline at an online table. With no big screen in the room, every phone plays the whole
 * show (and you vote by tapping the answers on it). With a TV or computer showing the table,
 * the phones turn into controllers: write, vote, and see how you did once the TV has said it.
 */
export function NetPunch({ v, onLeave }: { v: PunchView; onLeave: () => void }) {
  const { room, me, g, now } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  // a TV that blinks off (a reload, a Wi-Fi hiccup) doesn't flip every phone into the show and back
  const tv = useLagOff((room?.screens ?? 0) > 0, 5000);
  const who = useWho(room?.seats ?? []);
  const m = v.match;
  // the phones stay awake through the reveals (and while waiting to vote)
  useWakeLock(true);
  useCue(tv && v.phase === "vote" && !!m?.canVote, () => haptic(10));
  useCue(tv && v.phase === "present" && m?.mine !== null && m?.mine !== undefined, () => haptic([20, 40, 20]));
  const vote = useCallback(
    (slot: number) => {
      g("vote", { slot });
      sfx.tap();
      haptic(8);
    },
    [g],
  );

  const rules = (
    <p>
      {zh
        ? "前两轮：每道题两个人写，每人写两道。答案一题一题亮出来，不显示是谁写的，其他人投票。每道题按票数比例分 1000 分，赢的多拿 100；一个人拿走所有票就是神回复，再加 250。第二轮分数翻倍。输的人喝一口，被神回复的喝两口。最后一轮所有人写同一道题，每人选三个最好笑的，按票数分 4000 分，总分最低的喝一杯。超过 8 个人时，多出来的人当观众，一起投票。有电视或电脑当大屏幕时，手机就是遥控器。"
        : "Rounds one and two: every prompt goes to two players, and everyone writes two. The answers go up one prompt at a time, without names, and everyone else votes. Each prompt splits 1,000 points by votes, plus 100 for the winner; take every vote and it's a Punchline, 250 more. Round two doubles everything. The loser drinks a sip, two if they got swept. The last round: everyone answers the same prompt and picks three favorites, 4,000 points split by votes, and the lowest total drinks a full glass. Past eight players, the rest are the audience and vote too. With a TV or computer as the big screen, the phones are the controllers."}
    </p>
  );

  // Every piece keeps its place in this list whether or not a TV is on, so a TV coming or going
  // never wipes an answer someone is halfway through typing.
  return (
    <NetFrame title={GAME_BY_ID.punchline.name} rules={rules} onLeave={onLeave}>
      <div className={`pl ${tv ? "pc" : ""}`}>
        {tv ? <TvChip v={v} /> : <Stage v={v} who={who} now={now} mode="phone" sound={sound} lang={lang} me={me} onVote={vote} />}
        {v.phase === "write" && <WritePanel v={v} />}
        {tv && v.phase === "write" && <WritingFaces v={v} who={who} />}
        {tv ? <Pads v={v} who={who} onVote={vote} /> : v.phase === "vote" && m ? <p className="hint pl-progress">{voteHint(m, zh)}</p> : null}
        <HostControls v={v} />
      </div>
    </NetFrame>
  );
}

/** True right away; false only after it has stayed false for `ms`. */
function useLagOff(on: boolean, ms: number) {
  const [held, setHeld] = useState(on);
  useEffect(() => {
    if (on) {
      setHeld(true);
      return;
    }
    const id = window.setTimeout(() => setHeld(false), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  return on || held;
}

function voteHint(m: PunchMatch, zh: boolean) {
  if (m.canVote) {
    if (m.final) return zh ? `点答案选你最喜欢的，最多 ${m.maxVotes} 个，已选 ${m.myVotes.length} 个` : `Tap your favorites, up to ${m.maxVotes}. ${m.myVotes.length} picked.`;
    return m.myVotes.length ? (zh ? "投好了，揭晓前还能改" : "Voted. You can change it until the reveal.") : zh ? "点一个答案投票" : "Tap an answer to vote";
  }
  return m.mine !== null ? (zh ? "你的答案在上面，等大家投票" : "Your answer is up there. Waiting for the votes.") : zh ? "大家在投票" : "Everyone's voting";
}

/* ------------------------------------------------------------------ with a TV: the phone is the controller */

function Pads({ v, who, onVote }: { v: PunchView; who: Who; onVote: (slot: number) => void }) {
  const m = v.match;
  if (v.phase === "present" && m) return <PresentPad m={m} />;
  if (v.phase === "vote" && m) return <VotePad m={m} onVote={onVote} />;
  if (v.phase === "result" && m) return <ResultPad v={v} m={m} />;
  if (v.phase === "scores") return <StandingPad v={v} who={who} />;
  if (v.phase === "end") return <StandingPad v={v} who={who} end />;
  return null;
}

function TvChip({ v }: { v: PunchView }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const m = v.match;
  const final = v.round >= v.rounds;
  const where = final ? (zh ? "最后一轮" : "Final round") : zh ? `第 ${v.round} 轮` : `Round ${v.round}`;
  const sub = m && !m.final && (v.phase === "present" || v.phase === "vote" || v.phase === "result") ? (zh ? `第 ${m.n}/${m.of} 题` : `Prompt ${m.n} of ${m.of}`) : "";
  return (
    <div className="pc-chip">
      <span className="pc-chip-tv">
        <Tv size={16} strokeWidth={2.2} />
        {zh ? "看大屏幕" : "Watch the big screen"}
      </span>
      <span className="pc-chip-where tabular">
        {where}
        {sub && ` · ${sub}`}
      </span>
    </div>
  );
}

function WritingFaces({ v, who }: { v: PunchView; who: Who }) {
  const { lang } = useStore();
  if (!v.writing.length) return null;
  return (
    <div className="pl-writing">
      <span className="hint">{lang === "zh" ? "还在写" : "Still writing"}</span>
      {v.writing.map((id) => (
        <span key={id}>{who(id).face(26)}</span>
      ))}
    </div>
  );
}

function PresentPad({ m }: { m: PunchMatch }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="pc-pad">
      <PromptCard prompt={m.prompt} kicker={zh ? "大屏幕上正在亮答案" : "The answers are going up on the big screen"} />
      {m.mine !== null ? (
        <p className="pc-big pc-mine">{zh ? "这道题有你的答案，别出声" : "One of these is yours. Poker face."}</p>
      ) : (
        <Waiting>{zh ? "马上开始投票" : "The vote opens in a moment"}</Waiting>
      )}
    </div>
  );
}

function VotePad({ m, onVote }: { m: PunchMatch; onVote: (slot: number) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  if (!m.canVote)
    return (
      <div className="pc-pad">
        <p className="pc-big">{m.mine !== null ? (zh ? "你的答案在大屏幕上，大家在投票" : "Your answer is on the big screen. Everyone's voting.") : zh ? "大家在投票" : "Everyone's voting"}</p>
        <p className="hint pc-count tabular">{zh ? `${m.voted.length}/${m.voters} 人投了` : `${m.voted.length} of ${m.voters} voted`}</p>
      </div>
    );
  const colors = m.final ? FINAL_COLORS : SIDE;
  return (
    <div className="pc-pad">
      <p className="pc-ask">{m.final ? (zh ? `选你最喜欢的，最多 ${m.maxVotes} 个` : `Pick your favorites, up to ${m.maxVotes}`) : zh ? "哪个更好笑？" : "Which is funnier?"}</p>
      <div className={`pc-votes ${m.final ? "is-many" : ""}`}>
        {m.answers.map((a, slot) => {
          const mine = m.mine === slot;
          const picked = m.myVotes.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              className={`pc-vote ${picked ? "is-picked" : ""} ${mine ? "is-mine" : ""}`}
              style={{ ["--side" as string]: colors[slot % colors.length] } as React.CSSProperties}
              disabled={mine || !a.text}
              aria-pressed={picked}
              onClick={() => onVote(slot)}
            >
              <span className="pc-vote-letter" aria-hidden="true">
                {String.fromCharCode(65 + slot)}
              </span>
              <span className="pc-vote-text">{a.text || (zh ? "（交了白卷）" : "(left it blank)")}</span>
              {mine && <span className="pc-vote-tag">{zh ? "你写的" : "Yours"}</span>}
              {picked && (
                <span className="pc-vote-check">
                  <Check size={18} strokeWidth={3.2} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="hint pc-count tabular">
        {m.myVotes.length ? (m.final ? (zh ? `已选 ${m.myVotes.length} 个，揭晓前还能改` : `${m.myVotes.length} picked. You can change until the reveal.`) : zh ? "投好了，揭晓前还能改" : "Voted. You can change it until the reveal.") : ""}
        {m.myVotes.length ? "  " : ""}
        {zh ? `${m.voted.length}/${m.voters} 人投了` : `${m.voted.length} of ${m.voters} voted`}
      </p>
    </div>
  );
}

/** Your result, only once the TV has revealed it: the phone never spoils the show. */
function ResultPad({ v, m }: { v: PunchView; m: PunchMatch }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const most = Math.max(0, ...m.answers.map((a) => a.votes ?? 0));
  const mine = m.mine !== null ? m.answers[m.mine] : null;
  const swept = m.sweep !== null && m.sweep === m.mine;
  // the moment the TV says it: the points land, or the PUNCHLINE stamp on a sweep
  const revealAt = v.phaseAt + (m.final ? RESULT_BEATS.votes + most * 220 + 900 : m.sweep !== null ? RESULT_BEATS.sweep : RESULT_BEATS.points);
  const out = useReached(revealAt);
  useCue(out && swept, () => haptic([30, 60, 30, 60, 60]));

  if (!out)
    return (
      <div className="pc-pad">
        <p className="pc-big pc-drum">{zh ? "揭晓中，看大屏幕" : "The reveal is on the big screen"}</p>
      </div>
    );

  let line: string;
  if (mine) {
    const n = mine.votes ?? 0;
    line = swept ? (zh ? "神回复！所有票都是你的" : "Punchline! Every vote was yours") : zh ? `你的答案得了 ${n} 票` : `Your answer got ${n} ${n === 1 ? "vote" : "votes"}`;
  } else if (!m.final && m.myVotes.length) {
    const picked = m.myVotes[0];
    const counts = m.answers.map((a) => a.votes ?? 0);
    const top = Math.max(...counts);
    const tie = counts.filter((c) => c === top).length > 1;
    line = tie ? (zh ? "平局" : "A tie") : counts[picked] === top ? (zh ? `你投的 ${String.fromCharCode(65 + picked)} 赢了` : `Your pick, ${String.fromCharCode(65 + picked)}, won`) : zh ? `你投的 ${String.fromCharCode(65 + picked)} 输了` : `Your pick, ${String.fromCharCode(65 + picked)}, lost`;
  } else line = zh ? "结果在大屏幕上" : "The results are on the big screen";
  return (
    <div className="pc-pad">
      <p className={`pc-big ${swept ? "pc-swept" : ""}`}>{line}</p>
      {mine && !!mine.points && <p className="pc-points tabular">+{mine.points}</p>}
      {mine?.safety && <p className="hint">{zh ? "用了求救答案，分数减半" : "Stock answer: half points"}</p>}
    </div>
  );
}

const STANDINGS_AT = 3000; // the TV's score race reorders at 3 seconds

function StandingPad({ v, who, end = false }: { v: PunchView; who: Who; end?: boolean }) {
  const { me } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const out = useReached(v.phaseAt + (end ? 2200 : STANDINGS_AT));
  const ranked = v.players.slice().sort((a, b) => (v.scores[b] ?? 0) - (v.scores[a] ?? 0));
  const place = (pid: string) => 1 + ranked.filter((p) => (v.scores[p] ?? 0) > (v.scores[pid] ?? 0)).length;
  const playing = v.players.includes(me);
  if (!out)
    return (
      <div className="pc-pad">
        <p className="pc-big pc-drum">{end ? (zh ? "冠军马上揭晓" : "The winner is coming up") : zh ? "看大屏幕上的排名" : "Standings on the big screen"}</p>
      </div>
    );
  const leader = ranked[0];
  return (
    <div className="pc-pad">
      {playing ? (
        <>
          <p className="pc-place tabular">
            {place(me) === 1 && <Crown size={30} strokeWidth={2.4} />}
            {zh ? `第 ${place(me)} 名` : `#${place(me)}`}
          </p>
          <p className="pc-big tabular">{zh ? `${v.scores[me] ?? 0} 分` : `${v.scores[me] ?? 0} points`}</p>
        </>
      ) : (
        leader && (
          <p className="pc-big pc-leader">
            {who(leader).face(34)}
            {end ? (zh ? `${who(leader).name} 赢了` : `${who(leader).name} wins`) : zh ? `${who(leader).name} 领先` : `${who(leader).name} leads`}
          </p>
        )
      )}
      {end && !!v.last?.length && v.last.includes(me) && <p className="hint">{zh ? "最后一名喝一杯" : "Last place drinks a full glass"}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

function WritePanel({ v }: { v: PunchView }) {
  const { g, me } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  if (!v.mine.length)
    return <Waiting>{v.audience.includes(me) ? (zh ? "人多，这局你是观众：不用写，等着投票" : "Full house: you're in the audience. No writing, just voting.") : zh ? "这一轮你负责投票，等大家写完" : "You're voting this round. Waiting for the writers."}</Waiting>;
  return (
    <div className="pl-writes">
      {v.mine.map((p, i) => (
        <WriteCard
          key={`${v.round}-${p.k}`}
          k={p.k}
          prompt={p.prompt}
          done={p.done}
          sentText={p.text}
          n={i + 1}
          of={v.mine.length}
          onSend={(text) => g("answer", { k: p.k, text })}
          onSafety={() => g("answer", { k: p.k, safety: true, lang })}
        />
      ))}
    </div>
  );
}

function HostControls({ v }: { v: PunchView }) {
  const { g, isHost } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const m = v.match;
  if (v.phase === "scores" || v.phase === "end") {
    if (isHost)
      return (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g(v.phase === "end" ? "again" : "next", { step: v.step })}>
          {v.phase === "end" ? (zh ? "再来一局" : "Play again") : zh ? "下一轮" : "Next round"}
        </button>
      );
    return <Waiting>{v.phase === "end" ? (zh ? "等主持人决定再来一局" : "Waiting for the host") : zh ? "马上进入下一轮" : "The next round starts in a moment"}</Waiting>;
  }
  const label =
    v.phase === "write"
      ? zh
        ? "不等了，开始亮答案"
        : "Stop writing, show the answers"
      : v.phase === "present"
        ? zh
          ? "开始投票"
          : "Open the vote"
        : v.phase === "vote"
          ? zh
            ? "现在揭晓"
            : "Reveal now"
          : m?.final
            ? zh
              ? "看最终名次"
              : "See who won"
            : m && m.n >= m.of
              ? zh
                ? "看分数"
                : "See the scores"
              : zh
                ? "下一题"
                : "Next prompt";
  return (
    <HostRow>
      <HostButton onClick={() => g("next", { step: v.step })}>{label}</HostButton>
    </HostRow>
  );
}

function WriteCard({
  k,
  prompt,
  done,
  sentText,
  n,
  of,
  onSend,
  onSafety,
}: {
  k: number;
  prompt: PunchView["mine"][number]["prompt"];
  done: boolean;
  sentText: string;
  n: number;
  of: number;
  onSend: (text: string) => void;
  onSafety: () => void;
}) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(!done);
  const [sent, setSent] = useState("");
  useEffect(() => {
    if (!done) setEditing(true);
  }, [done, k]);
  return (
    <div className={`pl-write ${done && !editing ? "is-done" : ""}`}>
      <PromptCard prompt={prompt} kicker={of > 1 ? (zh ? `第 ${n} 题，共 ${of} 题` : `Prompt ${n} of ${of}`) : zh ? "所有人写同一题" : "Everyone answers this one"} />
      {done && !editing ? (
        <div className="pl-sent">
          <Check size={18} strokeWidth={3} />
          <span>{sentText || sent || (zh ? "交了" : "Sent")}</span>
          <button type="button" className="link-btn" onClick={() => setEditing(true)}>
            <Pencil size={13} /> {zh ? "改" : "Edit"}
          </button>
        </div>
      ) : (
        <form
          className="pl-form"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (!t) return;
            onSend(t);
            setSent(t);
            setEditing(false);
            sfx.pop();
            haptic(8);
          }}
        >
          <div className="field">
            <textarea rows={2} value={text} maxLength={80} onChange={(e) => setText(e.target.value)} placeholder={zh ? "写一个让大家笑出声的答案" : "Write something that gets a laugh"} aria-label={zh ? "你的答案" : "Your answer"} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={!text.trim()}>
            {zh ? "交" : "Send"}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              onSafety();
              setEditing(false);
              sfx.pop();
            }}
          >
            {zh ? "想不出来？给我一个（分数减半）" : "Stuck? Give me one (half points)"}
          </button>
        </form>
      )}
    </div>
  );
}

