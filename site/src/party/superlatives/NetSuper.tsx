import { Check, Shuffle, PenLine } from "lucide-react";
import { useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import { GAME_BY_ID } from "../../games/registry";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { SuperView } from "../../shared/protocol";
import { useStore } from "../../store";
import { AwardCard, AwardReveal, Ceremony } from "./parts";
import "../../styles/party.css";
import { Moment } from "../../components/Figure";

export function NetSuper({ v, onLeave }: { v: SuperView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, offset } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const seat = (id: string) => seats.find((s) => s.id === id);
  const face = (id: string) => (size: number) => <SeatFace seat={seat(id)} size={size} />;
  const [writing, setWriting] = useState(false);
  const [custom, setCustom] = useState("");
  useCue(v.phase === "vote", () => sfx.pop());

  const rules = (
    <p>
      {zh
        ? "每轮一个称号。每个人在自己手机上偷偷投给最配这个称号的人（不能投自己），全部投完或者时间到就揭晓。票最多的人拿奖，喝一口；平票一起喝。最后开颁奖典礼，看谁拿的奖最多。主人可以换题，也可以自己出称号。"
        : "One award a round. Everyone secretly votes on their own phone for whoever deserves it most (not yourself). When all votes are in, or time runs out, the winner is revealed and drinks; a tie means they all drink. At the end, an awards ceremony. The host can skip a title or write their own."}
    </p>
  );

  const voters = seats.length;
  return (
    <NetFrame title={GAME_BY_ID.superlatives.name} rules={rules} onLeave={onLeave}>
      <div className="sup">
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
                {seats.map((s) => (
                  <span key={s.id} className={v.voted.includes(s.id) ? "is-in" : ""}>
                    <SeatFace seat={s} size={22} />
                  </span>
                ))}
              </span>
            </div>
            <p className="sup-ask">{v.myVote ? (zh ? `投给了 ${nameOf(v.myVote)}，揭晓前还能改` : `You voted for ${nameOf(v.myVote)}. You can change it until the reveal.`) : zh ? "这个奖该给谁？" : "Who deserves it?"}</p>
            <div className="ballot">
              {seats.map((s) => {
                const self = s.id === me;
                const on = v.myVote === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`nominee ${on ? "is-on" : ""}`}
                    disabled={self}
                    aria-pressed={on}
                    onClick={() => {
                      g("vote", { target: s.id });
                      sfx.tap();
                      haptic(8);
                    }}
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
              winners={v.winners.map((id) => ({ id, name: nameOf(id), face: face(id), count: v.counts![id] ?? 0 }))}
              nominees={Object.keys(v.counts).map((id) => ({ id, name: nameOf(id), face: face(id), count: v.counts![id] }))}
            />
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                {v.round >= v.total ? (zh ? "开颁奖典礼" : "On to the awards") : zh ? "下一个奖" : "Next award"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人颁下一个奖" : "Waiting for the host"}</Waiting>
            )}
          </>
        )}

        {v.phase === "ceremony" && (
          <>
            <Ceremony shelves={seats.map((s) => ({ id: s.id, name: s.id === me ? (zh ? "你" : "You") : s.name, face: face(s.id), awards: v.awards[s.id] ?? [] }))} />
            {isHost && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("more")}>
                {zh ? "再来五个奖" : "Five more awards"}
              </button>
            )}
          </>
        )}
      </div>
    </NetFrame>
  );
}
