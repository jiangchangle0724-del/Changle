import { Crown } from "lucide-react";
import { useEffect } from "react";
import { Lineup } from "../../components/Figure";
import { startGroove, type GrooveId } from "../../lib/music";
import { sfx } from "../../lib/sfx";
import { useCue, useReached, useRoom } from "../../online/RoomContext";
import type { FreezeView } from "../../shared/protocol";
import { Bi, joinNames, RoundTag, TvClock, TvLineup, TvShow, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { perfAt } from "../sensors";
import { DanceFloor } from "./parts";
import "../../styles/party.css";
import "../../styles/tv-freeze.css";

/** how long everyone holds still before the phones judge (the server's FREEZE_MS) */
const FREEZE_MS = 3800;

/**
 * 木头人蹦迪 on the big screen: the dance floor and everyone dancing while the track plays, then
 * "不许动！" the instant it cuts, as on every phone. When it cuts is a surprise, so nothing here
 * counts down to it. Who moved shows as the phones catch them, then who's out, and the last one
 * standing.
 */
export default function TvFreeze({ v, sound }: TvViewProps<FreezeView>) {
  const { zh, tx } = useLang();
  const { seat, name, players } = useSeats();
  const { now } = useRoom();
  const cut = useReached(v.phase === "dance" ? v.stopAt : null);
  const frozen = v.phase === "freeze" || (v.phase === "dance" && cut);

  // the same track as every phone, cut at the same instant (on the screen that plays the show)
  useEffect(() => {
    if (!sound || v.phase !== "dance") return;
    const h = startGroove(v.groove as GrooveId, { startPerf: perfAt(v.musicAt, now()) });
    h?.stopAt(perfAt(v.stopAt, now()));
    const scratch = window.setTimeout(() => sfx.scratch(), Math.max(0, v.stopAt - now()));
    return () => {
      window.clearTimeout(scratch);
      h?.stop(0.05);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound, v.phase, v.round, v.musicAt, v.stopAt]);
  useCue(v.phase === "result" && v.moved.length > 0, () => {
    if (sound) sfx.sadTrombone(0.7);
  });

  const mode = <RoundTag>{v.round ? tx(`第 ${v.round} 轮 · ${v.mode === "out" ? "淘汰" : "受罚"}`, `Round ${v.round} · ${v.mode === "out" ? "knockout" : "penalty"}`) : v.mode === "out" ? tx("淘汰赛", "Knockout") : tx("受罚版", "Penalty")}</RoundTag>;

  if (v.phase === "ready" || v.phase === "end") {
    const winner = seat(v.winner);
    return (
      <TvShow game="freeze" className={`tvfz is-${v.phase}`} phase={v.phase} round={mode}>
        <div className="tvfz-top">
          {v.phase === "end" && winner ? (
            <>
              <Crown className="tvfz-crown" size={110} strokeWidth={1.8} aria-hidden="true" />
              <h1 className="tvfz-big">{tx(`${winner.name} 是最后的木头人！`, `${winner.name} is the last one standing!`)}</h1>
            </>
          ) : (
            <>
              <h1 className="tvfz-head">
                <Bi t={v.phase === "end" ? { zh: "这局结束了", en: "That's the game" } : { zh: "准备跳舞", en: "Get ready to dance" }} />
              </h1>
              <p className="tvfz-line">{tx("主人放音乐，大家拿着手机跳；音乐一停，马上不许动", "The host starts the music and everyone dances, phone in hand; when it stops, freeze")}</p>
            </>
          )}
        </div>
        <TvLineup people={(winner ? [winner] : players).map((s) => ({ seat: s, state: winner ? ("win" as const) : ("idle" as const) }))} big={winner ? 240 : 250} className="tvfz-row" />
      </TvShow>
    );
  }

  const shown = [...v.alive, ...(v.phase === "result" ? v.moved.filter((id) => !v.alive.includes(id)) : [])].map((id) => seat(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const items = shown.map((s) => ({ seat: s, pose: !frozen && v.phase === "dance" ? ("dance" as const) : v.moved.includes(s.id) ? ("caught" as const) : ("frozen" as const) }));
  const caught = v.moved.filter((id) => seat(id));

  return (
    <TvShow game="freeze" className={`tvfz is-${frozen ? "freeze" : v.phase}`} phase={v.phase} round={mode} clock={v.phase === "freeze" ? <TvClock endsAt={v.judgeAt} total={FREEZE_MS} sound={false} /> : undefined}>
      {!frozen && v.phase === "dance" && (
        <div className="tvfz-floor">
          <DanceFloor groove={v.groove} />
        </div>
      )}
      <div className="tvfz-top">
        {v.phase === "result" ? (
          <h1 className={`tvfz-big ${caught.length ? "is-caught" : "is-still"}`}>
            {caught.length
              ? v.mode === "out"
                ? tx(`${joinNames(caught.map((id) => name(id)), zh)} 动了，出局`, `${joinNames(caught.map((id) => name(id)), zh)} moved: out`)
                : tx(`${joinNames(caught.map((id) => name(id)), zh)} 动了`, `${joinNames(caught.map((id) => name(id)), zh)} moved`)
              : tx("全都定住了！", "Nobody moved!")}
          </h1>
        ) : frozen ? (
          <h1 className="tvfz-stop">
            <Bi t={{ zh: "不许动！", en: "Freeze!" }} />
          </h1>
        ) : (
          <p className="tvfz-dance">{tx("跳起来！音乐一停就别动", "Dance! When the music stops, don't move")}</p>
        )}
        {v.phase === "result" && v.mode === "out" && <p className="tvfz-line tabular">{tx(`还剩 ${v.alive.length} 人`, `${v.alive.length} still dancing`)}</p>}
      </div>
      <div className="tvfz-dancers">
        <Lineup items={items} />
      </div>
    </TvShow>
  );
}
