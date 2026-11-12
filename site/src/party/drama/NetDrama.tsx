import { Clapperboard, Eye, Play, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Figure } from "../../components/Figure";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground } from "../../lib/music";
import { sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { DramaView } from "../../shared/protocol";
import { useWakeLock } from "../sensors";
import { useDramaMusic, useHeld } from "./score";
import { loadLibrary, SceneWriter, TableScenes } from "./writer";
import { useStore } from "../../store";
import { readKind } from "../../data/dramaReadings";
import { Backdrop, BallotForm, Cast, Curtain, Finale, FirstTimeTips, Marquee, Playbill, ReadingCard, ReadingHead, ReadingText, Reveal, RoleCard, Roster, Rules, SceneClock, SetupPanel, Slate, stageOf, TwistBanner, type Actor, type Face } from "./parts";
import { useSettle } from "./ShellActions";
import { StageCall } from "./StageCall";
import { dramaSfx } from "./sound";

export function NetDrama({ v, onLeave }: { v: DramaView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, now } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const [writing, setWriting] = useState(false);
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
  const credit = v.credit ? (v.credit.pid ? nameOf(v.credit.pid) : v.credit.name) : null;

  // the host's phone brings a dozen scenes from the public library, once
  const libAsked = useRef(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  useEffect(() => {
    if (!isHost || v.lib > 0 || libAsked.current) return;
    libAsked.current = true;
    const ctl = new AbortController();
    let settled = false;
    setLibraryLoading(true);
    setLibraryFailed(false);
    void loadLibrary(zh ? "zh" : "en", seats, ctl.signal).then(
      (chunks) => { if (!ctl.signal.aborted) chunks.forEach((scenes) => g("lib", { scenes })); },
      () => { if (!ctl.signal.aborted) setLibraryFailed(true); },
    ).finally(() => { settled = true; if (!ctl.signal.aborted) setLibraryLoading(false); });
    return () => { ctl.abort(); if (!settled) libAsked.current = false; setLibraryLoading(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, v.lib, libraryAttempt]);
  // who's on stage next: each player says for themselves
  const stageCall = player && <StageCall v={v} ids={players.map((s) => s.id)} nameOf={nameOf} face={face} me={me} onWant={(want) => g("want", { want })} />;
  const blocked = v.next ? !v.next.ok : false;
  const tableScenes = player && <TableScenes v={v} me={me} isHost={isHost} nameOf={nameOf} onWrite={() => setWriting(true)} onRemove={(id) => g("unwrite", { id })} library={{ loading: libraryLoading, failed: libraryFailed, retry: () => { libAsked.current = false; setLibraryAttempt((n) => n + 1); } }} />;

  // the scene has its own sound: the lounge music waits
  useEffect(() => holdBackground(), []);
  // phones that sleep through the scene make the vote wait for them: the screens stay on
  useWakeLock(v.phase !== "setup" && v.phase !== "end");
  // a button that comes into view is brought up to where the finger is: a double tap's second tap
  // would press it (交卷, then 现在揭晓 before the others have voted)
  const settle = useSettle(`${v.round}|${v.phase}|${v.voted.length > 0}|${!!v.myVote}|${v.ready.includes(me)}|${v.cast.map((c) => c.pid).join(",")}`);
  useCue(v.phase === "brief", () => {
    dramaSfx.chimes();
    dramaSfx.deal();
  });
  // the game's theme off stage, the scene's own music on it, every phone on the same beat; with a
  // big screen at the table, the music plays there instead
  const screen = useHeld((room?.screens ?? 0) > 0, 5000);
  useDramaMusic(v, sound && !screen, now);
  useCue(v.phase === "act", () => {
    setSlate(true);
    setPeek(false);
  });
  useCue(v.phase === "vote", () => sfx.applause(1.8, 0.7));
  useCue(v.phase === "end", () => sfx.win());

  const audience = players.filter((s) => !v.cast.some((c) => c.pid === s.id)).length;
  // the audience votes; with nobody watching, the actors do, on each other
  const voter = player && (v.peer ? acting : !acting);
  const voters = v.peer ? v.cast.length : audience;
  const stage = (open: boolean, live: boolean, extra?: ReactNode) => (
    <div className="dm-stagebox">
      <Backdrop {...stageOf(v)} live={live}>
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
            {stageCall}
            {tableScenes}
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={players.length < 3 || blocked} onClick={settle(() => g("start"))}>
                <Play size={18} />
                {players.length < 3 ? (zh ? "至少三个人才能开演" : "Needs at least three") : blocked ? (zh ? "还没人上台" : "Nobody's on stage yet") : zh ? "开演" : "Curtain up"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人选好剧本" : "Waiting for the host to pick the show"}</Waiting>
            )}
          </>
        )}

        {v.phase === "brief" && v.mode === "read" && v.read && (
          <>
            {!acting && stage(false, false)}
            {acting ? (
              v.ready.includes(me) ? (
                <Waiting>{zh ? "马上开始，先酝酿一下情绪" : "Starting any second. Get into the mood."}</Waiting>
              ) : (
                <ReadingCard key={`${v.round}-${me}`} r={v.read} onDone={() => g("ready")} doneLabel={zh ? "准备好了，开始读" : "Ready to read"} />
              )
            ) : (
              <>
                <Playbill v={v} credit={null} />
                <Roster v={v} nameOf={nameOf} face={face} />
                <Waiting>{zh ? `${nameOf(v.cast[0]?.pid ?? "")} 在默读，准备好就开始` : `${nameOf(v.cast[0]?.pid ?? "")} is reading it over, and starts when ready`}</Waiting>
              </>
            )}
            <FirstTimeTips read />
            <HostRow>
              <HostButton onClick={settle(() => g("go"))}>
                <Clapperboard size={14} />
                {zh ? "直接开始" : "Start now"}
              </HostButton>
              <HostButton onClick={settle(() => g("skip"))}>
                <SkipForward size={14} />
                {zh ? "换一段" : "Another piece"}
              </HostButton>
            </HostRow>
          </>
        )}

        {v.phase === "brief" && v.mode !== "read" && (
          <>
            {!acting && stage(false, false)}
            <Playbill v={v} credit={credit} />
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
                  line={v.pk?.line}
                  sceneId={v.scene?.id}
                  first={v.cast.find((c) => c.pid === me)!.first ?? null}
                  see={v.classic ?? null}
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
            {v.mode !== "pk" && <FirstTimeTips classic={v.mode === "classic"} />}
            <HostRow>
              <HostButton onClick={settle(() => g("go"))}>
                <Clapperboard size={14} />
                {zh ? "直接开演" : "Start now"}
              </HostButton>
              <HostButton onClick={settle(() => g("skip"))}>
                <SkipForward size={14} />
                {zh ? "换个剧本" : "Another scene"}
              </HostButton>
            </HostRow>
          </>
        )}

        {v.phase === "act" && v.mode === "read" && v.read && (
          <>
            {acting ? (
              <>
                <ReadingHead r={v.read} clock={<SceneClock endsAt={v.endsAt} total={v.actMs} now={now} />} />
                <ReadingText r={v.read} big />
              </>
            ) : (
              <>
                {stage(true, true, <SceneClock endsAt={v.endsAt} total={v.actMs} now={now} />)}
                <ReadingHead r={v.read} />
                <ReadingText r={v.read} />
              </>
            )}
            {(acting || isHost) && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={settle(() => g("cut"))}>
                {acting ? (zh ? "读完了，开始打星" : "Done: on to the stars") : zh ? "读完了，开始打星" : "They're done: on to the stars"}
              </button>
            )}
            {!acting && player && (
              <p className="dm-wait-note">
                {zh ? `跟着看，等会儿打星：${readKind(v.read.kind)?.ask.zh ?? "读得怎么样？"}` : `Follow along. Then the stars: ${readKind(v.read.kind)?.ask.en ?? "How was that?"}`}
              </p>
            )}
          </>
        )}

        {v.phase === "act" && v.mode !== "read" && (
          <>
            {stage(true, true, (
              <>
                <SceneClock endsAt={v.endsAt} total={v.actMs} now={now} />
                {slate && <Slate onDone={() => setSlate(false)} />}
              </>
            ))}
            <TwistBanner twist={v.twist} />
            <Playbill v={v} credit={credit} />
            {acting && v.me && (
              <>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setPeek((p) => !p)}>
                  <Eye size={16} />
                  {peek ? (zh ? "收起我的牌" : "Hide my card") : zh ? "再看一眼我的牌" : "Peek at my card"}
                </button>
                {peek && <RoleCard key={`peek-${v.round}`} role={v.cast.find((c) => c.pid === me)!.role} brief={v.cast.find((c) => c.pid === me)!.brief} card={v.me} culprit={v.scene?.culprit ?? null} pk={v.mode === "pk"} line={v.pk?.line} sceneId={v.scene?.id} first={v.cast.find((c) => c.pid === me)!.first ?? null} see={v.classic ?? null} />}
              </>
            )}
            {(acting || isHost) && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={settle(() => g("cut"))}>
                {zh ? "演完了，开始投票" : "That's a wrap: vote"}
              </button>
            )}
            {!acting && !isHost && player && (
              <p className="dm-wait-note">
                {v.mode === "classic"
                  ? zh
                    ? "好好看，等会儿给每个演员打星：谁最像原片？"
                    : "Watch closely: you'll give each actor stars for how close they got to the original."
                  : v.mode === "pk"
                    ? zh
                      ? "好好看，等会儿给两个人打星：谁演得更像？"
                      : "Watch closely: you'll give both of them stars."
                    : v.options
                      ? zh
                        ? "好好看，等会儿要猜：台上的人藏着哪个秘密？"
                        : "Watch closely: you'll guess which secret they're hiding."
                      : zh
                        ? "好好看，等会儿要投票：谁是坏人？谁演得最像？"
                        : "Watch closely: you'll vote on the culprit and the acting."}
              </p>
            )}
          </>
        )}

        {v.phase === "vote" && (
          <>
            {stage(false, false)}
            {voter ? (
              <BallotForm key={`${v.round}`} v={v} actors={actors} submitted={v.myVote} onSubmit={(b) => g("vote", b)} me={v.peer ? me : undefined} />
            ) : v.peer ? (
              <Waiting>{zh ? `演员在互相打分（${v.voted.length}/${voters}）` : `The actors are rating each other (${v.voted.length}/${voters})`}</Waiting>
            ) : (
              <Waiting>{zh ? `观众在投票（${v.voted.length}/${voters}）` : `The audience is voting (${v.voted.length}/${voters})`}</Waiting>
            )}
            {voter && v.myVote && <p className="dm-wait-note">{zh ? `已交卷，等其他人（${v.voted.length}/${voters}）` : `Sent. Waiting for the rest (${v.voted.length}/${voters})`}</p>}
            <HostRow>
              {v.voted.length > 0 && <HostButton onClick={settle(() => g("reveal"))}>{zh ? "现在揭晓" : "Reveal now"}</HostButton>}
            </HostRow>
          </>
        )}

        {v.phase === "reveal" && v.result && (
          <>
            <Reveal v={v} actors={actors} me={me} face={face} />
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={v.round < v.total && blocked} onClick={settle(() => g("next"))}>
                {v.round >= v.total ? (zh ? "颁奖" : "On to the awards") : blocked ? (zh ? "还没人上台" : "Nobody's on stage yet") : zh ? "下一幕" : "Next act"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人拉开下一幕" : "Waiting for the host"}</Waiting>
            )}
            {v.round < v.total && stageCall}
            {tableScenes}
          </>
        )}

        {v.phase === "end" && (
          <>
            <Finale v={v} ids={players.map((s) => s.id)} nameOf={nameOf} face={face} me={me} />
            {stageCall}
            {isHost && (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={blocked} onClick={settle(() => g("more"))}>
                {blocked ? (zh ? "还没人上台" : "Nobody's on stage yet") : zh ? "再演三幕" : "Three more acts"}
              </button>
            )}
          </>
        )}
      </div>
      <SceneWriter open={writing} onClose={() => setWriting(false)} level={v.level} onAdd={(scene) => g("write", { scene })} />
    </NetFrame>
  );
}
