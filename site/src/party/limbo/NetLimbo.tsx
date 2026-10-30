import { Check, Crown, Play, Smartphone, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { startGroove } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useReached, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { LimboView } from "../../shared/protocol";
import { useStore } from "../../store";
import { useSecondsLeft } from "../common";
import { enableSensors, perfAt, useSensorStatus, useWakeLock } from "../sensors";
import { LeanGauge, LimboScene, useLean } from "./parts";
import "../../styles/party.css";

export function NetLimbo({ v, onLeave }: { v: LimboView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, now } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const seat = (id: string) => seats.find((s) => s.id === id);
  const sensors = useSensorStatus();
  const alive = v.alive.includes(me);
  const passed = v.passed.includes(me);
  const failed = v.failed.includes(me);
  const open = useReached(v.phase === "go" ? v.startAt : null);
  const countdown = useSecondsLeft(v.phase === "go" && !open ? v.startAt : null, now);
  const timeLeft = useSecondsLeft(v.phase === "go" && open ? v.endsAt : null, now);
  useWakeLock(v.phase === "go");

  useEffect(() => {
    if (sensors === "on" && !v.sensors.includes(me)) g("sensor", { on: true });
  }, [sensors, v.sensors, me, g]);

  // the calypso keeps playing level after level, on the same beat on every phone
  const playing = v.musicAt > 0 && (v.phase === "go" || v.phase === "result");
  useEffect(() => {
    if (!playing) return;
    const h = startGroove("calypso", { startPerf: perfAt(v.musicAt, now()) });
    return () => h?.stop(0.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, v.musicAt]);

  // count in
  const lastCount = useRef(0);
  useEffect(() => {
    if (v.phase === "go" && !open && countdown > 0 && countdown !== lastCount.current) {
      lastCount.current = countdown;
      sfx.countdown(countdown);
    }
  }, [countdown, open, v.phase]);
  useCue(v.phase === "go" && open, () => {
    sfx.gong("small", 0.7);
    haptic(20);
  });
  useCue(passed, () => {
    sfx.correct();
    haptic([12, 30, 12]);
  });
  useCue(failed, () => sfx.sadTrombone(0.7));

  const measuring = v.phase === "go" && open && alive && !passed && !failed && sensors === "on";
  const lastSent = useRef(0);
  const { lean, best, hold } = useLean(measuring, v.angle, (deg) => g("pass", { deg }));
  // share how far you're getting, now and then
  useEffect(() => {
    if (!measuring) return;
    const t = performance.now();
    if (best >= (v.best[me] ?? 0) + 4 && t - lastSent.current > 700) {
      lastSent.current = t;
      g("best", { deg: Math.round(best) });
    }
  }, [best, measuring, v.best, me, g]);

  const rules = (
    <p>
      {zh
        ? "林波舞，手机当裁判。把手机竖着贴在胸口，屏幕对着自己，音乐响起后往后仰，仰到横杆的角度并坚持一秒多就算过。每一杆都更低（要仰得更多），没过的出局喝一口，最后剩下的人赢。没有动作感应的手机由主人判，或者自己说过没过。"
        : "Limbo, with the phone as judge. Hold it upright against your chest, screen facing you. When the music plays, lean back to the bar's angle and hold it for a second or so. Every bar is lower (lean further). Miss and you're out (drink). Last one standing wins. Phones without motion sensing are judged by the host, or by their owner's honesty."}
    </p>
  );

  const status = (id: string) => (v.passed.includes(id) ? "pass" : v.failed.includes(id) ? "fail" : v.alive.includes(id) ? "try" : "out");

  return (
    <NetFrame title={GAME_BY_ID.limbo.name} rules={rules} onLeave={onLeave}>
      <div className="lb">
        {v.phase !== "end" && <LimboScene angle={v.angle} level={v.level} />}
        {v.phase !== "end" && (
          <p className="lb-level">
            <strong className="tabular">{v.angle}°</strong>
            {zh ? ` 第 ${v.level + 1} 杆` : ` Bar ${v.level + 1}`}
          </p>
        )}

        {v.phase === "ready" && (
          <>
            <ol className="lb-steps">
              <li>{zh ? "手机竖着贴在胸口，屏幕朝自己" : "Phone upright against your chest, screen facing you"}</li>
              <li>{zh ? "音乐一响，往后仰到要求的角度" : "When the music starts, lean back to the angle"}</li>
              <li>{zh ? "坚持一秒多就算过，杆子会越来越低" : "Hold it for a second to pass. The bar keeps dropping."}</li>
            </ol>
            {sensors !== "on" ? (
              <button type="button" className="btn btn-ghost btn-block" disabled={sensors === "asking"} onClick={() => void enableSensors()}>
                <Smartphone size={17} />
                {sensors === "none" || sensors === "denied" ? (zh ? "这部手机测不了角度，由主人判" : "This phone can't measure. The host will judge you.") : zh ? "开启动作感应" : "Turn on motion sensing"}
              </button>
            ) : (
              <p className="fz-sensor-on">
                <Smartphone size={15} />
                {zh ? "动作感应开着" : "Motion sensing on"}
              </p>
            )}
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("go")}>
                <Play size={18} />
                {zh ? "开始" : "Start"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人开始" : "Waiting for the host"}</Waiting>
            )}
          </>
        )}

        {v.phase === "go" && !open && <p className="lb-count tabular">{countdown}</p>}

        {v.phase === "go" && open && alive && (
          <>
            {passed ? (
              <p className="lb-verdict is-pass">{zh ? "过了！" : "Under!"}</p>
            ) : failed ? (
              <p className="lb-verdict is-fail">{zh ? "没过" : "Didn't make it"}</p>
            ) : sensors === "on" ? (
              <LeanGauge lean={lean} target={v.angle} hold={hold} />
            ) : (
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => g("fail")}>
                  <X size={18} />
                  {zh ? "没过" : "Missed"}
                </button>
                <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("pass", { deg: v.angle })}>
                  <Check size={18} />
                  {zh ? "我过了" : "I made it"}
                </button>
              </div>
            )}
            <p className="hint lb-time tabular">{zh ? `还剩 ${timeLeft} 秒` : `${timeLeft}s left`}</p>
          </>
        )}
        {v.phase === "go" && open && !alive && <Waiting>{zh ? "你出局了，看大家仰" : "You're out. Watch the others lean."}</Waiting>}

        {(v.phase === "go" || v.phase === "result") && (
          <ul className="lb-people">
            {[...v.alive, ...v.out.filter((id) => !v.alive.includes(id))].map((id) => {
              const st = status(id);
              const judgeable = isHost && v.phase === "go" && open && v.alive.includes(id) && !v.sensors.includes(id);
              return (
                <li key={id} className={`lb-person is-${st}`}>
                  <SeatFace seat={seat(id)} size={36} />
                  <span className="lb-person-name">{id === me ? (zh ? "你" : "You") : nameOf(id)}</span>
                  <span className="lb-person-best tabular">{v.best[id] ? `${v.best[id]}°` : ""}</span>
                  {judgeable ? (
                    <span className="lb-judge">
                      <button type="button" className="icon-btn" aria-label={zh ? "没过" : "Missed"} onClick={() => g("judge", { pid: id, ok: false })}>
                        <X size={18} />
                      </button>
                      <button type="button" className="icon-btn" aria-label={zh ? "过了" : "Made it"} onClick={() => g("judge", { pid: id, ok: true })}>
                        <Check size={18} />
                      </button>
                    </span>
                  ) : (
                    <span className="lb-person-state">{st === "pass" ? (zh ? "过了" : "Under") : st === "fail" ? (zh ? "没过" : "Missed") : st === "out" ? (zh ? "出局" : "Out") : zh ? "在仰" : "Leaning"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {v.phase === "result" && <p className="hint" style={{ textAlign: "center" }}>{zh ? "杆子要降了……" : "Lowering the bar…"}</p>}

        {v.phase === "end" && (
          <div className="fz-result">
            <p className="fz-result-title">{zh ? "林波之王" : "Limbo champion"}</p>
            {v.winner && (
              <span className="fz-face is-winner">
                <SeatFace seat={seat(v.winner)} size={96} />
                <Crown size={22} className="fz-crown" />
                <strong>{v.winner === me ? (zh ? "你" : "You") : nameOf(v.winner)}</strong>
              </span>
            )}
            {v.winner && v.best[v.winner] ? <p className="hint">{zh ? `最深仰到 ${v.best[v.winner]}°` : `Leaned back ${v.best[v.winner]}°`}</p> : null}
            {isHost && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("again")}>
                {zh ? "再来一局" : "Play again"}
              </button>
            )}
          </div>
        )}

        {v.phase === "result" && isHost && (
          <HostRow>
            <HostButton onClick={() => g("go")}>{zh ? "马上下一杆" : "Next bar now"}</HostButton>
          </HostRow>
        )}
      </div>
    </NetFrame>
  );
}
