import { Clapperboard, Eye, Play, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Figure } from "../../components/Figure";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground } from "../../lib/music";
import { sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import { BRIEF_MS } from "../../shared/engine/games/drama";
import type { DramaView } from "../../shared/protocol";
import { perfAt } from "../sensors";
import { seedOf, startAmbience, type Scape } from "./ambience";
import { useStore } from "../../store";
import { Backdrop, BallotForm, Cast, Curtain, Finale, isKind, Marquee, Playbill, Reveal, RoleCard, Roster, Rules, SceneClock, SetupPanel, Slate, TwistBanner, type Actor, type Face } from "./parts";
import { dramaSfx } from "./sound";

export function NetDrama({ v, onLeave }: { v: DramaView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, now } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const seat = (id: string) => seats.find((s) => s.id === id);
  const mine = seat(me);
  const player = !!mine && !mine.watch;
  const players = seats.filter((s) => !s.watch);
  const acting = v.cast.some((c) => c.pid === me);
  const face: Face = (pid, size) => <SeatFace seat={seat(pid)} size={size} />;
  // on stage, everyone stands: their drawn figure, or their face on a little body
  const actors: Actor[] = useMemo(
    () =>
      v.cast.map((c) => {
        const s = seat(c.pid);
        return { pid: c.pid, role: c.role, name: nameOf(c.pid), face: (size: number) => face(c.pid, size), body: s ? <Figure seat={s} /> : face(c.pid, 56) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v.cast, seats],
  );
  const [slate, setSlate] = useState(false);
  const [peek, setPeek] = useState(false);

  // the scene has its own sound: the lounge music waits
  useEffect(() => holdBackground(), []);
  useCue(v.phase === "brief", () => {
    dramaSfx.chimes();
    dramaSfx.deal();
  });
  // the house before the curtain, then the set itself; every phone in step
  const scape: Scape | null = v.phase === "brief" ? "foyer" : v.phase === "act" ? (v.mode === "pk" ? "pk" : isKind(v.scene?.kind) ? v.scene!.kind : null) : null;
  useEffect(() => {
    if (!scape) return;
    const from = v.phase === "act" ? v.endsAt - v.actMs : v.endsAt - BRIEF_MS;
    const a = startAmbience(scape, { startPerf: perfAt(from, now()), seed: seedOf(`${v.round}|${v.scene?.id ?? v.pk?.line.en ?? ""}|${scape}`) });
    return () => a?.stop(0.8);
    // once per scene and phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scape, v.round]);
  useCue(v.phase === "act", () => {
    setSlate(true);
    setPeek(false);
  });
  useCue(v.phase === "vote", () => sfx.applause(1.8, 0.7));
  useCue(v.phase === "end", () => sfx.win());

  const audience = players.filter((s) => !v.cast.some((c) => c.pid === s.id)).length;
  const stage = (open: boolean, live: boolean, extra?: ReactNode) => (
    <div className="dm-stagebox">
      <Backdrop kind={v.scene?.kind} pk={v.mode === "pk"} live={live}>
        <Cast actors={actors} />
        <Curtain open={open} />
        {extra}
      </Backdrop>
    </div>
  );

  return (
    <NetFrame title={GAME_BY_ID.drama.name} rules={<Rules />} onLeave={onLeave}>
      <div className="dm">
        {v.phase === "setup" && (
          <>
            <div className="dm-stagebox">
              <Marquee />
            </div>
            <SetupPanel cfg={v} disabled={!isHost} onChange={(c) => g("config", c)} />
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={players.length < 3} onClick={() => g("start")}>
                <Play size={18} />
                {players.length < 3 ? (zh ? "至少三个人才能开演" : "Needs at least three") : zh ? "开演" : "Curtain up"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人选好剧本" : "Waiting for the host to pick the show"}</Waiting>
            )}
          </>
        )}

        {v.phase === "brief" && (
          <>
            {!acting && stage(false, false)}
            <Playbill v={v} />
            {acting && v.me ? (
              v.ready.includes(me) ? (
                <Waiting>{zh ? "其他演员还在看牌，准备好就开演" : "The others are still reading. Get into character."}</Waiting>
              ) : (
                <RoleCard
                  key={`${v.round}-${me}`}
                  role={v.cast.find((c) => c.pid === me)!.role}
                  brief={v.cast.find((c) => c.pid === me)!.brief}
                  card={v.me}
                  culprit={v.scene?.culprit ?? null}
                  pk={v.mode === "pk"}
                  onDone={() => g("ready")}
                  doneLabel={zh ? "记住了，准备开演" : "Got it. Ready"}
                />
              )
            ) : (
              <>
                <Roster v={v} nameOf={nameOf} face={face} />
                <Waiting>{zh ? `演员在偷偷看身份牌（${v.ready.length}/${v.cast.length}）` : `The actors are reading their cards (${v.ready.length}/${v.cast.length})`}</Waiting>
              </>
            )}
            <HostRow>
              <HostButton onClick={() => g("go")}>
                <Clapperboard size={14} />
                {zh ? "直接开演" : "Start now"}
              </HostButton>
              <HostButton onClick={() => g("skip")}>
                <SkipForward size={14} />
                {zh ? "换个剧本" : "Another scene"}
              </HostButton>
            </HostRow>
          </>
        )}

        {v.phase === "act" && (
          <>
            {stage(true, true, (
              <>
                <SceneClock endsAt={v.endsAt} total={v.actMs} now={now} />
                {slate && <Slate onDone={() => setSlate(false)} />}
              </>
            ))}
            <TwistBanner twist={v.twist} />
            <Playbill v={v} />
            {acting && v.me && (
              <>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setPeek((p) => !p)}>
                  <Eye size={16} />
                  {peek ? (zh ? "收起我的牌" : "Hide my card") : zh ? "再看一眼我的牌" : "Peek at my card"}
                </button>
                {peek && <RoleCard key={`peek-${v.round}`} role={v.cast.find((c) => c.pid === me)!.role} brief={v.cast.find((c) => c.pid === me)!.brief} card={v.me} culprit={v.scene?.culprit ?? null} pk={v.mode === "pk"} />}
              </>
            )}
            {(acting || isHost) && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("cut")}>
                {zh ? "演完了，开始投票" : "That's a wrap: vote"}
              </button>
            )}
            {!acting && !isHost && player && <p className="dm-wait-note">{zh ? "好好看，等会儿要投票：谁是坏人？谁演得最像？" : "Watch closely: you'll vote on the culprit and the acting."}</p>}
          </>
        )}

        {v.phase === "vote" && (
          <>
            {stage(false, false)}
            {player && !acting ? (
              <BallotForm key={`${v.round}`} v={v} actors={actors} submitted={v.myVote} onSubmit={(b) => g("vote", b)} />
            ) : (
              <Waiting>{zh ? `观众在投票（${v.voted.length}/${audience}）` : `The audience is voting (${v.voted.length}/${audience})`}</Waiting>
            )}
            {player && !acting && v.myVote && <p className="dm-wait-note">{zh ? `已交卷，等其他人（${v.voted.length}/${audience}）` : `Sent. Waiting for the rest (${v.voted.length}/${audience})`}</p>}
            <HostRow>
              {v.voted.length > 0 && <HostButton onClick={() => g("reveal")}>{zh ? "现在揭晓" : "Reveal now"}</HostButton>}
            </HostRow>
          </>
        )}

        {v.phase === "reveal" && v.result && (
          <>
            <Reveal v={v} actors={actors} me={me} face={face} />
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                {v.round >= v.total ? (zh ? "颁奖" : "On to the awards") : zh ? "下一幕" : "Next act"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人拉开下一幕" : "Waiting for the host"}</Waiting>
            )}
          </>
        )}

        {v.phase === "end" && (
          <>
            <Finale v={v} ids={players.map((s) => s.id)} nameOf={nameOf} face={face} me={me} />
            {isHost && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("more")}>
                {zh ? "再演三幕" : "Three more acts"}
              </button>
            )}
          </>
        )}
      </div>
    </NetFrame>
  );
}
