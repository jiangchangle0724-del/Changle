import { Crown } from "lucide-react";
import { useEffect, useRef } from "react";
import { Lineup, type Pose } from "../../components/Figure";
import { startGroove } from "../../lib/music";
import { sfx } from "../../lib/sfx";
import { useCue, useReached, useRoom } from "../../online/RoomContext";
import { SeatFace } from "../../online/People";
import { blindError } from "../../shared/engine/games/limbo";
import type { LimboView } from "../../shared/protocol";
import { Bi, joinNames, RoundTag, TvClock, TvLineup, TvShow, useArrivals, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { useSecondsLeft } from "../common";
import { perfAt } from "../sensors";
import { blindLine, LimboScene } from "./parts";
import "../../styles/party.css";
import "../../styles/tv-limbo.css";

/**
 * 林波舞 on the big screen: the bar and how far back it asks, everyone going under it while the
 * calypso plays, who made it and who didn't, and the result as the phones get it: the bar comes
 * down, or (nobody made it, nobody leaned) the same bar again. In the blind round nobody's angle
 * shows until the round is over. The last one under is crowned. On the screen that plays the show
 * it sounds like the phones: the count in, the calypso, a chime for each one under, a groan for
 * each one who isn't.
 */
export default function TvLimbo({ v, sound }: TvViewProps<LimboView>) {
  const { zh, tx } = useLang();
  const { players, seat, name } = useSeats();
  const { now } = useRoom();
  const blind = v.mode === "blind";
  const open = useReached(v.phase === "go" ? v.startAt : null);
  const count = useSecondsLeft(v.phase === "go" && !open ? v.startAt : null, now);
  // who went under the bar this round, so a blind round can name who's out even if they never locked
  const inRound = useRef<string[]>([]);
  useEffect(() => {
    if (v.phase === "go") inRound.current = v.alive;
  }, [v.phase, v.alive]);

  // the calypso, level after level, on the same beat as the phones (on the screen that plays the show)
  const playing = sound && v.musicAt > 0 && (v.phase === "go" || v.phase === "result");
  useEffect(() => {
    if (!playing) return;
    const h = startGroove("calypso", { startPerf: perfAt(v.musicAt, now()) });
    return () => h?.stop(0.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, v.musicAt]);
  const lastCount = useRef(0);
  useEffect(() => {
    if (sound && v.phase === "go" && !open && count > 0 && count !== lastCount.current) sfx.countdown(count);
    lastCount.current = count;
  }, [sound, count, open, v.phase]);
  useCue(v.phase === "go" && open, () => {
    if (sound) sfx.gong("small", 0.7);
  });
  useArrivals(v.passed, sound, () => sfx.correct());
  useArrivals(v.failed, sound, () => sfx.sadTrombone(0.7));
  useArrivals(v.locked, sound);
  useArrivals(blind ? v.out : [], sound, () => sfx.sadTrombone(0.7));

  const tag = <RoundTag>{v.phase === "ready" || v.phase === "end" ? (blind ? tx("盲仰", "Blind lean") : tx("经典", "Classic")) : blind ? tx(`盲仰第 ${v.level + 1} 轮`, `Blind round ${v.level + 1}`) : tx(`第 ${v.level + 1} 杆`, `Bar ${v.level + 1}`)}</RoundTag>;

  if (v.phase === "ready" || v.phase === "end") {
    const winner = v.phase === "end" ? seat(v.winner) : undefined;
    const how = !winner ? "" : blind ? (v.locks[winner.id] !== undefined ? tx(`最后一轮目标 ${v.angle}°，仰了 ${blindLine(true, v.locks[winner.id], v.angle)}`, `Last target ${v.angle}°: ${blindLine(false, v.locks[winner.id], v.angle)}`) : "") : v.best[winner.id] ? tx(`最深仰到 ${v.best[winner.id]}°`, `Leaned back ${v.best[winner.id]}°`) : "";
    return (
      <TvShow game="limbo" className={`tvlb is-${v.phase}`} phase={v.phase} round={tag}>
        <div className="tvlb-top">
          {winner ? (
            <>
              <Crown className="tvlb-crown" size={110} strokeWidth={1.8} aria-hidden="true" />
              <h1 className="tvlb-big">{blind ? tx(`${winner.name} 最有手感！`, `${winner.name} has the best feel for angles!`) : tx(`${winner.name} 是林波之王！`, `${winner.name} is the limbo champion!`)}</h1>
              {how && <p className="tvlb-line tabular">{how}</p>}
            </>
          ) : (
            <>
              <h1 className="tvlb-head">
                <Bi t={v.phase === "end" ? { zh: "这局结束了", en: "That's the game" } : blind ? { zh: "准备盲仰", en: "Get ready to lean blind" } : { zh: "准备过杆", en: "Get ready to limbo" }} />
              </h1>
              <p className="tvlb-line">{blind ? tx("盲仰：看不到自己的角度，凭感觉仰到目标，离得最远的出局", "Blind lean: lean to the target without seeing your angle; furthest off is out") : tx("手机举在胸前往后仰，仰过横杆就过；杆子一杆比一杆低", "Hold the phone to your chest and lean back past the bar; every bar is lower")}</p>
            </>
          )}
        </div>
        <TvLineup people={(winner ? [winner] : players).map((s) => ({ seat: s, state: winner ? ("win" as const) : ("idle" as const) }))} big={winner ? 240 : 250} className="tvlb-row" />
      </TvShow>
    );
  }

  const status = (id: string): Pose => {
    if (blind) return v.phase === "result" ? (v.out.includes(id) ? "fail" : "pass") : open ? "lean" : "idle";
    return v.passed.includes(id) ? "pass" : v.failed.includes(id) ? "fail" : open ? "lean" : "idle";
  };
  // who didn't make it this round: classic, the phones' "missed"; blind, whoever the round put out
  const lost = v.phase !== "result" ? [] : blind ? (inRound.current.length ? inRound.current.filter((id) => !v.alive.includes(id)) : v.out.filter((id) => v.locks[id] !== undefined)) : v.failed;
  const shown = v.phase === "result" ? [...v.alive, ...lost.filter((id) => !v.alive.includes(id))] : v.alive;
  const items = shown.map((id) => seat(id)).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ seat: s, pose: blind && v.phase === "result" ? (lost.includes(s.id) ? ("fail" as const) : ("pass" as const)) : status(s.id) }));

  // what the phones say once the round is settled (#141: nobody made it and nobody leaned, same bar)
  const again = !blind && v.alive.length > 0 && v.alive.every((id) => v.failed.includes(id));
  const names = joinNames(lost.map((id) => name(id)), zh);

  return (
    <TvShow game="limbo" className={`tvlb is-${v.phase}`} phase={v.phase} round={tag} clock={v.phase === "go" && open ? <TvClock endsAt={v.endsAt} total={Math.max(1, v.endsAt - v.startAt)} sound={sound} /> : undefined}>
      <div className="tvlb-top">
        {v.phase === "go" ? (
          <h1 className="tvlb-ask">
            {!open ? (
              <>
                {tx("准备", "Get ready")} <b className="tvlb-count tabular">{count || ""}</b>
              </>
            ) : blind
                ? tx(`凭感觉往后仰 ${v.angle}°，停住锁定`, `Lean back ${v.angle}° by feel, and hold still`)
                : tx(`往后仰 ${v.angle}°，仰过横杆`, `Lean back ${v.angle}°, under the bar`)}
          </h1>
        ) : (
          <h1 className={`tvlb-big ${lost.length || again ? "is-out" : "is-in"}`}>
            {again
              ? tx("谁都没过，这一杆再来", "Nobody made it. Same bar again")
              : blind
                ? lost.length
                  ? tx(`${names} 离目标最远，出局`, `${names}: furthest off, out`)
                  : tx("大家差得一样多，再来一轮", "All just as far off: another round")
                : lost.length
                  ? tx(`${names} 没过`, `${names} didn't make it`)
                  : tx("全都过了！", "Everyone made it!")}
          </h1>
        )}
        {v.phase === "result" && !again && <p className="tvlb-line">{blind ? tx("下一轮换个角度……", "A new angle next round…") : tx("杆子要降了……", "Lowering the bar…")}</p>}
        {blind && v.phase === "go" && open && (
          <p className="tvlb-locked">
            {v.locked.map((id) => (
              <SeatFace key={id} seat={seat(id)} size={48} />
            ))}
            <span className="tabular">{tx(`${v.locked.length}/${v.alive.length} 锁定了`, `${v.locked.length} of ${v.alive.length} locked`)}</span>
          </p>
        )}
        {blind && v.phase === "result" && (
          <ol className="tvlb-locks">
            {[...shown]
              .sort((a, b) => blindError(v.locks[a], v.angle) - blindError(v.locks[b], v.angle))
              .map((id) => (
                <li key={id} className={lost.includes(id) ? "is-out" : ""}>
                  <SeatFace seat={seat(id)} size={44} />
                  <b className="tabular">{v.locks[id] !== undefined ? `${v.locks[id]}°` : tx("没锁定", "No lock")}</b>
                </li>
              ))}
            <li className="is-target">
              {tx("目标", "Target")} <b className="tabular">{v.angle}°</b>
            </li>
          </ol>
        )}
      </div>
      <div className="tvlb-scene">
        <LimboScene angle={v.angle} level={v.level}>
          <Lineup lean={v.angle} items={items} />
        </LimboScene>
      </div>
    </TvShow>
  );
}
