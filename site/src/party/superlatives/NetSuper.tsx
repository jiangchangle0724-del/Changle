import { Check, Eye, EyeOff, ImageDown, Shuffle, PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import { GAME_BY_ID } from "../../games/registry";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { usePlayers, useWatching } from "../../online/players";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import { TOTALS } from "../../shared/engine/games/superlatives";
import type { SuperView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { flavorOf, mindReader } from "./flavor";
import { useFreshTapGuard, useTopOfMoment } from "./moment";
import { posterOf } from "./poster";
import { AV_COLORS, colorFor } from "../../account/Avatar";
import { PosterSheet } from "./PosterSheet";
import { AwardCard, AwardReveal, Ceremony, PackChips } from "./parts";
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
  const [poster, setPoster] = useState(false);
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
      {zh
        ? "偷偷问的玩法：每轮一个人自己看题，当众说一个名字；被点名的人喝一口才能看题，不看就一直猜。被点名的人问下一题。颁奖典礼揭晓所有的题。"
        : "Paranoia: one person reads the title alone and names someone out loud. The one named drinks to see what it was, or stays curious, and asks the next one. The ceremony shows every title."}
      <br />
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
        {v.phase === "setup" && (
          <>
            <div className="panel setup-panel">
              <span className="field-label">{zh ? "几个奖" : "How many awards"}</span>
              {isHost ? (
                <div className="seg" role="group">
                  {TOTALS.map((n) => (
                    <button key={n} type="button" aria-pressed={v.total === n} onClick={() => g("config", { total: n })}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="sup-pack-count">{zh ? `${v.total} 个奖` : `${v.total} awards`}</p>
              )}
              <span className="field-label">{zh ? "怎么玩" : "How it goes"}</span>
              {isHost ? (
                <div className="seg" role="group">
                  <button type="button" aria-pressed={v.mode === "vote"} onClick={() => g("config", { mode: "vote" })}>
                    {zh ? "投票" : "Vote"}
                  </button>
                  <button type="button" aria-pressed={v.mode === "whisper"} onClick={() => g("config", { mode: "whisper" })}>
                    {zh ? "偷偷问" : "Paranoia"}
                  </button>
                </div>
              ) : (
                <p className="sup-pack-count">{v.mode === "whisper" ? (zh ? "偷偷问" : "Paranoia") : zh ? "投票" : "Vote"}</p>
              )}
              <p className="sup-pack-count">
                {v.mode === "whisper"
                  ? zh
                    ? "一个人自己看题，当众点名；被点名的人喝一口才能看题"
                    : "One person reads the title alone and names someone; the one named drinks to see it"
                  : zh
                    ? "每个人在自己手机上偷偷投，票最多的人拿奖"
                    : "Everyone votes on their own phone; the most votes takes the award"}
              </p>
              <span className="field-label">{zh ? "题库" : "Title packs"}</span>
              <PackChips picked={v.packs} onChange={isHost ? (next) => g("config", { packs: next }) : undefined} />
            </div>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("start")}>
                {zh ? "开始颁奖" : "Start the awards"}
              </button>
            ) : (
              <Waiting>{zh ? "主人在选题库，马上开始" : "The host is picking the packs"}</Waiting>
            )}
          </>
        )}

        {v.phase !== "ceremony" && v.phase !== "setup" && <AwardCard title={v.title} round={v.round} total={v.total} custom={v.custom} />}

        {v.phase === "ask" && (
          <>
            {me === v.asker ? (
              <>
                <p className="sup-ask">{zh ? "只有你看得到这个称号。当众说出一个人的名字，再点TA" : "Only you can see this title. Say a name out loud, then tap them"}</p>
                <div className="ballot">
                  {players.map((s) => {
                    const self = s.id === me;
                    return (
                      <button key={s.id} type="button" className="nominee" disabled={self} aria-disabled={fresh} onClick={guard(() => g("name", { target: s.id }))}>
                        <span className="nominee-face">
                          <SeatFace seat={s} size={58} />
                        </span>
                        <span className="nominee-name">{self ? (zh ? "你" : "You") : s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="sup-status">
                  <TimerArc seconds={60} running endsAt={v.endsAt} offset={offset} size={56} resetKey={`${v.round}-${v.ballot}`} />
                  <span>{zh ? `${name(v.asker ?? "")} 在偷偷看题` : `${name(v.asker ?? "")} is reading the title`}</span>
                </div>
                <Waiting>{zh ? "等TA当众点一个人的名字" : "Waiting for them to name someone"}</Waiting>
              </>
            )}
            {(me === v.asker || isHost) && writing && (
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
                <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={30} aria-label={zh ? "自己出一个称号" : "Your own title"} placeholder={zh ? "比如：今晚最会点歌" : "e.g. Best playlist tonight"} autoFocus />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!custom.trim()}>
                  {zh ? "用这个" : "Use it"}
                </button>
              </form>
            )}
            {me === v.asker && (
              <HostRow>
                <HostButton onClick={() => g("skip")}>
                  <Shuffle size={14} />
                  {zh ? "换一个" : "Another one"}
                </HostButton>
                <HostButton onClick={() => setWriting((w) => !w)}>
                  <PenLine size={14} />
                  {zh ? "自己出" : "Write one"}
                </HostButton>
              </HostRow>
            )}
          </>
        )}

        {v.phase === "dare" && (
          <>
            <p className="sup-named">
              <span className="sup-named-who">{zh ? `${name(v.asker ?? "")} 说：` : `${name(v.asker ?? "")} says:`}</span>
              <strong>{v.named === me ? (zh ? "你！" : "You!") : `${name(v.named ?? "")}!`}</strong>
            </p>
            {v.named === me ? (
              <>
                <p className="sup-ask">{zh ? "喝一口就能看题。不看也行，那就一直猜吧" : "A sip and you can see the title. Or pass, and keep guessing"}</p>
                <button type="button" className="btn btn-primary btn-lg btn-block" aria-disabled={fresh} onClick={guard(() => g("peek", { yes: true }))}>
                  <Eye size={18} />
                  {zh ? "喝一口，看题" : "Drink and see it"}
                </button>
                <button type="button" className="btn btn-ghost btn-lg btn-block" aria-disabled={fresh} onClick={guard(() => g("peek", { yes: false }))}>
                  <EyeOff size={18} />
                  {zh ? "不看了" : "Pass"}
                </button>
              </>
            ) : (
              <>
                <div className="sup-status">
                  <TimerArc seconds={45} running endsAt={v.endsAt} offset={offset} size={56} resetKey={`${v.round}-dare`} />
                  <span>{zh ? `${name(v.named ?? "")} 要不要喝一口看题？` : `Will ${name(v.named ?? "")} drink to see it?`}</span>
                </div>
                {me === v.asker && <p className="hint">{zh ? "题只有你知道，先别说" : "Only you know the title. Keep it to yourself"}</p>}
              </>
            )}
          </>
        )}

        {v.phase === "peek" && (
          <>
            <p className="sup-named">
              <span className="sup-named-who">{zh ? `${name(v.asker ?? "")} 说：` : `${name(v.asker ?? "")} says:`}</span>
              <strong>{v.named === me ? (zh ? "你！" : "You!") : `${name(v.named ?? "")}!`}</strong>
            </p>
            <p className="sup-ask">
              {v.seen
                ? v.named === me
                  ? zh
                    ? "你喝了一口，题就在上面。念不念出来随你"
                    : "You drank: the title is up there. Read it out, or don't"
                  : me === v.asker
                    ? zh
                      ? `${name(v.named ?? "")} 喝了一口，看了题。你们俩知道就行`
                      : `${name(v.named ?? "")} drank and saw it. Now it's the two of you`
                    : zh
                      ? `${name(v.named ?? "")} 喝了一口，看了题。想知道？问TA`
                      : `${name(v.named ?? "")} drank and saw it. Want to know? Ask them`
                : v.named === me
                  ? zh
                    ? "你没看。这题到颁奖典礼才揭晓"
                    : "You passed. The title comes out at the ceremony"
                  : zh
                    ? `${name(v.named ?? "")} 不想知道。这题到颁奖典礼才揭晓`
                    : `${name(v.named ?? "")} would rather not know. The title comes out at the ceremony`}
            </p>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={stampDue} aria-disabled={fresh} onClick={guard(() => g("next"))}>
                {v.round >= v.total ? (zh ? "开颁奖典礼" : "On to the awards") : zh ? `下一题，${v.named === me ? (zh ? "你" : "you") : name(v.named ?? "")}来问` : `Next: ${v.named === me ? "you" : name(v.named ?? "")} asks`}
              </button>
            ) : (
              <Waiting>{zh ? "等主人翻到下一题" : "Waiting for the host"}</Waiting>
            )}
          </>
        )}

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
                <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={30} aria-label={zh ? "自己出一个称号" : "Your own title"} placeholder={zh ? "比如：今晚最会点歌" : "e.g. Best playlist tonight"} autoFocus />
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
              flavor={flavorOf({ winners: v.winners, counts: v.counts, voted: v.voted, streak: v.streak, name })}
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
              mind={(() => {
                const m = mindReader(v.hits, v.round);
                return m && { names: m.ids.map((id) => (id === me ? (zh ? "你" : "You") : name(id))), hits: m.hits, of: m.of };
              })()}
            />
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setPoster(true)}>
              <ImageDown size={16} />
              {zh ? "颁奖海报" : "The awards poster"}
            </button>
            <PosterSheet
              open={poster}
              onClose={() => setPoster(false)}
              poster={() => {
                const ids = [...players.map((s) => s.id), ...gone(Object.keys(v.awards).filter((id) => v.awards[id].length > 0))];
                // (the faces' colors, as the seats wear them: an account's own, or the one its seat was dealt)
                const colorOf = (id: string) => {
                  const s = seat(id);
                  return AV_COLORS[(s?.uid && s.ac !== undefined ? s.ac : colorFor(id)) % AV_COLORS.length];
                };
                return posterOf({ lang: zh ? "zh" : "en", people: ids.map((id) => ({ id, name: name(id), color: colorOf(id) })), awards: v.awards, hits: v.hits, round: v.round });
              }}
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
