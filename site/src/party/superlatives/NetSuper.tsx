import { Check, Shuffle, PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import { GAME_BY_ID } from "../../games/registry";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { usePlayers, useWatching } from "../../online/players";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { SuperView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { useFreshTapGuard, useTopOfMoment } from "./moment";
import { AwardCard, AwardReveal, Ceremony } from "./parts";
import { useSeatMemory } from "./seats";
import "../../styles/party.css";
import { Moment } from "../../components/Figure";

export function NetSuper({ v, onLeave }: { v: SuperView; onLeave: () => void }) {
  const { me, isHost, g, offset, now } = useRoom();
  const { lang } = useStore();
  const ownPenalty = usePenaltyText().isCustom;
  const zh = lang === "zh";
  // who votes and who can win: the players (someone just watching does neither)
  const players = usePlayers();
  const watching = useWatching();
  // (a seat that left mid-award keeps its name and face: the room alone would say "?")
  const { seat, name, gone } = useSeatMemory();
  const face = (id: string) => (size: number) => <SeatFace seat={seat(id)} size={size} />;
  const [writing, setWriting] = useState(false);
  const [custom, setCustom] = useState("");
  useCue(v.phase === "vote", () => sfx.pop());
  const body = useRef<HTMLDivElement>(null);
  const moment = `${v.phase}:${v.ballot}`;
  useTopOfMoment(moment, body);
  // (the ballot's tiles take the place of the host's "next award" button: a quick second tap on it
  // must not cast a vote)
  const { fresh, guard } = useFreshTapGuard(moment);

  // The host moves on once the moment's stamp has landed (the winner's sip 2.6 s into the reveal,
  // the table's toast 3.2 s into the ceremony): the rooms server turns an earlier tap away, and the
  // button waits for it so the stamp never lands on the next award's ballot.
  const [stampDue, setStampDue] = useState(false);
  useEffect(() => {
    const left = v.stampAt ? v.stampAt - now() : 0;
    if (left <= 0) {
      setStampDue(false);
      return;
    }
    setStampDue(true);
    const timer = window.setTimeout(() => setStampDue(false), left + 150);
    return () => window.clearTimeout(timer);
  }, [v.stampAt, now]);

  const rules = (
    <p>
      {ownPenalty
        ? zh
          ? "每轮一个称号。每个人在自己手机上偷偷投给最配这个称号的人（不能投自己），全部投完或者时间到就揭晓。票最多的人拿奖，也要受罚；平票一起受罚。最后开颁奖典礼，看谁拿的奖最多。主人可以换题，也可以自己出称号。"
          : "One award a round. Everyone secretly votes on their own phone for whoever deserves it most (not yourself). When all votes are in, or time runs out, the winner is revealed and takes the penalty; a tie means they all do. At the end, an awards ceremony. The host can skip a title or write their own."
        : zh
          ? "每轮一个称号。每个人在自己手机上偷偷投给最配这个称号的人（不能投自己），全部投完或者时间到就揭晓。票最多的人拿奖，喝一口；平票一起喝。最后开颁奖典礼，看谁拿的奖最多。主人可以换题，也可以自己出称号。"
          : "One award a round. Everyone secretly votes on their own phone for whoever deserves it most (not yourself). When all votes are in, or time runs out, the winner is revealed and drinks; a tie means they all drink. At the end, an awards ceremony. The host can skip a title or write their own."}
    </p>
  );

  const voters = players.length;
  return (
    <NetFrame title={GAME_BY_ID.superlatives.name} rules={rules} onLeave={onLeave}>
      <div className="sup" ref={body}>
        {v.phase !== "ceremony" && <AwardCard title={v.title} round={v.round} total={v.total} custom={v.custom} />}

        {v.phase === "vote" && (
          <>
            <div className="sup-status">
              <TimerArc seconds={45} running endsAt={v.endsAt} offset={offset} size={56} resetKey={`${v.round}-${v.title.zh}`} />
              <span>
                <strong className="tabular">
                  {v.voted.length}/{voters}
                </strong>
                {zh ? " 人投了" : " voted"}
              </span>
              <span className="sup-voted" aria-hidden="true">
                {players.map((s) => (
                  <span key={s.id} className={v.voted.includes(s.id) ? "is-in" : ""}>
                    <SeatFace seat={s} size={22} />
                  </span>
                ))}
              </span>
            </div>
            <p className="sup-ask">{v.myVote ? (zh ? `投给了 ${name(v.myVote)}，揭晓前还能改` : `You voted for ${name(v.myVote)}. You can change it until the reveal.`) : zh ? "这个奖该给谁？" : "Who deserves it?"}</p>
            <div className="ballot">
              {players.map((s) => {
                const self = s.id === me;
                const on = v.myVote === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`nominee ${on ? "is-on" : ""}`}
                    disabled={self || watching}
                    aria-disabled={fresh}
                    aria-pressed={on}
                    onClick={guard(() => {
                      // (the ballot's number goes with it: a vote on an older ballot is dropped)
                      g("vote", { target: s.id, ballot: v.ballot });
                      sfx.tap();
                      haptic(8);
                    })}
                  >
                    <span className="nominee-face">
                      <SeatFace seat={s} size={58} />
                      {on && (
                        <span className="nominee-check" aria-hidden="true">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="nominee-name">{self ? (zh ? "你" : "You") : s.name}</span>
                  </button>
                );
              })}
            </div>
            {isHost && writing && (
              <form
                className="field sup-custom"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!custom.trim()) return;
                  g("custom", { text: custom.trim() });
                  setCustom("");
                  setWriting(false);
                }}
              >
                <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={30} placeholder={zh ? "比如：今晚最会点歌" : "e.g. Best playlist tonight"} autoFocus />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!custom.trim()}>
                  {zh ? "用这个" : "Use it"}
                </button>
              </form>
            )}
            <HostRow>
              <HostButton onClick={() => g("skip")}>
                <Shuffle size={14} />
                {zh ? "换一个" : "Another one"}
              </HostButton>
              <HostButton onClick={() => setWriting((w) => !w)}>
                <PenLine size={14} />
                {zh ? "自己出" : "Write one"}
              </HostButton>
              {v.voted.length > 0 && <HostButton onClick={() => g("reveal")}>{zh ? "现在揭晓" : "Reveal now"}</HostButton>}
            </HostRow>
          </>
        )}

        {v.phase === "reveal" && v.counts && (
          <>
            {v.winners.length > 0 && (
              <div className="moment-row">
                {v.winners.slice(0, 3).map((id) => {
                  const s = seat(id);
                  return s ? <Moment key={id} seat={s} kind="winner" /> : null;
                })}
              </div>
            )}
            <AwardReveal
              title={v.title}
              winners={v.winners.map((id) => ({ id, name: name(id), face: face(id), count: v.counts![id] ?? 0 }))}
              nominees={Object.keys(v.counts).map((id) => ({ id, name: name(id), face: face(id), count: v.counts![id] }))}
            />
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={stampDue} onClick={() => g("next")}>
                {v.round >= v.total ? (zh ? "开颁奖典礼" : "On to the awards") : zh ? "下一个奖" : "Next award"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人颁下一个奖" : "Waiting for the host"}</Waiting>
            )}
          </>
        )}

        {v.phase === "ceremony" && (
          <>
            {/* everyone at the table, and whoever left with a trophy */}
            <Ceremony
              shelves={[...players.map((s) => s.id), ...gone(Object.keys(v.awards).filter((id) => v.awards[id].length > 0))].map((id) => ({
                id,
                name: id === me ? (zh ? "你" : "You") : name(id),
                face: face(id),
                awards: v.awards[id] ?? [],
              }))}
            />
            {isHost && (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={stampDue} onClick={() => g("more")}>
                {zh ? "再来五个奖" : "Five more awards"}
              </button>
            )}
          </>
        )}
      </div>
    </NetFrame>
  );
}
