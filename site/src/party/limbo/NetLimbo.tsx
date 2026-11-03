import { Check, Crown, Play, Smartphone, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground, startGroove } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useReached, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { LimboView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { useSecondsLeft } from "../common";
import { enableSensors, perfAt, useSensorStatus, useWakeLock } from "../sensors";
import { blindError } from "../../shared/engine/games/limbo";
import { BlindMeter, LeanGauge, LimboScene, blindLine, useBlindLock, useLean } from "./parts";
import "../../styles/party.css";
import { Lineup } from "../../components/Figure";

export function NetLimbo({ v, onLeave }: { v: LimboView; onLeave: () => void }) {
  // the dance floor has its own music: the lounge music waits
  useEffect(() => holdBackground(), []);
  const { room, me, isHost, g, nameOf, now } = useRoom();
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const seat = (id: string) => seats.find((s) => s.id === id);
  const sensors = useSensorStatus();
  const blind = v.mode === "blind";
  const alive = v.alive.includes(me);
  const passed = v.passed.includes(me);
  const failed = v.failed.includes(me);
  const locked = v.locked.includes(me);
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

  const measuring = !blind && v.phase === "go" && open && alive && !passed && !failed && sensors === "on";
  const lastSent = useRef(0);
  const { lean, best, hold } = useLean(measuring, v.angle, (deg) => g("pass", { deg }));

  // blind lean: the phone locks the angle once you hold still, and never shows it before the round ends
  const leaningBlind = blind && v.phase === "go" && open && alive && !locked && sensors === "on";
  const blindLock = useBlindLock(leaningBlind, (deg) => {
    g("lock", { deg });
    haptic([12, 30, 12]);
    sfx.correct();
  });
  // time nearly up and still not steady: lock where you are rather than not at all
  useEffect(() => {
    if (leaningBlind && timeLeft <= 1) blindLock.lockNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaningBlind, timeLeft]);
  const players = v.alive.filter((id) => v.sensors.includes(id)).length;
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
    <>
      <p>
        {zh
          ? `林波舞，手机当裁判。把手机竖着贴在胸口，屏幕对着自己，音乐响起后往后仰，仰到横杆的角度并坚持一秒多就算过。每一杆都更低（要仰得更多），没过的出局${custom ? "受罚" : "喝一口"}，最后剩下的人赢。没有动作感应的手机由主人判，或者自己说过没过。`
          : `Limbo, with the phone as judge. Hold it upright against your chest, screen facing you. When the music plays, lean back to the bar's angle and hold it for a second or so. Every bar is lower (lean further). Miss and you're out (${custom ? "penalty" : "drink"}). Last one standing wins. Phones without motion sensing are judged by the host, or by their owner's honesty.`}
      </p>
      <p>
        {zh
          ? `盲仰：每轮给一个目标角度，但看不到自己仰了多少。凭感觉仰到那个角度，停住不动一秒半，手机就锁定。离目标最远的出局${custom ? "受罚" : "喝一口"}，最后剩下的人赢。要用动作感应，测不了的手机这局当观众。`
          : `Blind lean: each round gives a target angle, but you can't see your own. Lean back to what feels like it and hold still for a second and a half; the phone locks it. Furthest from the target is out (${custom ? "penalty" : "drink"}). Last one standing wins. It needs motion sensing: phones that can't measure watch that game.`}
      </p>
    </>
  );

  const status = (id: string) =>
    blind
      ? v.phase === "result" || v.phase === "end"
        ? v.out.includes(id) ? "out" : "pass"
        : v.alive.includes(id) ? (v.locked.includes(id) ? "locked" : "try") : "out"
      : v.passed.includes(id) ? "pass" : v.failed.includes(id) ? "fail" : v.alive.includes(id) ? "try" : "out";
  // blind result: closest first
  const order = (ids: string[]) => (blind && v.phase !== "go" ? [...ids].sort((a, b) => blindError(v.locks[a], v.angle) - blindError(v.locks[b], v.angle)) : ids);

  return (
    <NetFrame title={GAME_BY_ID.limbo.name} rules={rules} onLeave={onLeave}>
      <div className="lb">
        {v.phase !== "end" && (
          <LimboScene angle={v.angle} level={v.level}>
            {(v.phase === "go" || v.phase === "result") && (
              <Lineup
                lean={v.angle}
                items={v.alive.filter((id) => seat(id)).map((id) => {
                  const st = status(id);
                  return { seat: seat(id)!, pose: st === "pass" ? "pass" : st === "fail" || st === "out" ? "fail" : v.phase === "go" && open ? "lean" : "idle" };
                })}
              />
            )}
          </LimboScene>
        )}
        {v.phase !== "end" && (v.phase !== "ready" || !blind) && (
          <p className="lb-level">
            {(!blind || v.phase === "result") && <strong className="tabular">{v.angle}°</strong>}
            {blind ? (zh ? ` 盲仰第 ${v.level + 1} 轮` : ` Blind round ${v.level + 1}`) : zh ? ` 第 ${v.level + 1} 杆` : ` Bar ${v.level + 1}`}
          </p>
        )}

        {v.phase === "ready" && (
          <>
            {isHost ? (
              <div className="seg" role="group" aria-label={zh ? "玩法" : "Mode"}>
                <button type="button" aria-pressed={!blind} onClick={() => g("mode", { mode: "classic" })}>
                  {zh ? "经典：过杆" : "Classic: under the bar"}
                </button>
                <button type="button" aria-pressed={blind} onClick={() => g("mode", { mode: "blind" })}>
                  {zh ? "盲仰" : "Blind lean"}
                </button>
              </div>
            ) : (
              <p className="hint" style={{ textAlign: "center" }}>{blind ? (zh ? "这局玩盲仰" : "This game: blind lean") : zh ? "这局玩经典过杆" : "This game: classic, under the bar"}</p>
            )}
            {blind ? (
              <ol className="lb-steps">
                <li>{zh ? "手机竖着贴在胸口，屏幕朝自己" : "Phone upright against your chest, screen facing you"}</li>
                <li>{zh ? "每轮给一个目标角度，看不到自己仰了多少" : "Each round gives a target angle; you can't see your own"}</li>
                <li>{zh ? "凭感觉仰到位，停住不动一秒半就锁定" : "Lean to what feels right and hold still for a second and a half"}</li>
                <li>{zh ? `离目标最远的出局${custom ? "受罚" : "喝一口"}` : `Furthest from the target is out and ${custom ? "takes the penalty" : "drinks"}`}</li>
              </ol>
            ) : (
              <ol className="lb-steps">
                <li>{zh ? "手机竖着贴在胸口，屏幕朝自己" : "Phone upright against your chest, screen facing you"}</li>
                <li>{zh ? "音乐一响，往后仰到要求的角度" : "When the music starts, lean back to the angle"}</li>
                <li>{zh ? "坚持一秒多就算过，杆子会越来越低" : "Hold it for a second to pass. The bar keeps dropping."}</li>
              </ol>
            )}
            {sensors !== "on" ? (
              <button type="button" className="btn btn-ghost btn-block" disabled={sensors === "asking"} onClick={() => void enableSensors()}>
                <Smartphone size={17} />
                {sensors === "none" || sensors === "denied"
                  ? blind
                    ? zh ? "这部手机测不了角度，盲仰这局你当观众" : "This phone can't measure: you watch this blind game"
                    : zh ? "这部手机测不了角度，由主人判" : "This phone can't measure. The host will judge you."
                  : zh ? "开启动作感应" : "Turn on motion sensing"}
              </button>
            ) : (
              <p className="fz-sensor-on">
                <Smartphone size={15} />
                {zh ? "动作感应开着" : "Motion sensing on"}
              </p>
            )}
            {isHost && blind && players < 2 && <p className="hint" style={{ textAlign: "center" }}>{zh ? "盲仰要至少两部开了动作感应的手机" : "Blind lean needs at least two phones with motion sensing on"}</p>}
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={blind && players < 2} onClick={() => g("go")}>
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
            {blind ? (
              <BlindMeter target={v.angle} steady={blindLock.steady} locked={locked} />
            ) : passed ? (
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
        {v.phase === "go" && open && !alive && (
          <Waiting>{v.out.includes(me) ? (zh ? "你出局了，看大家仰" : "You're out. Watch the others lean.") : zh ? "这局你当观众，看大家仰" : "You're watching this game. See how they lean."}</Waiting>
        )}

        {(v.phase === "go" || v.phase === "result") && (
          <ul className="lb-people">
            {order([...v.alive, ...v.out.filter((id) => !v.alive.includes(id))]).map((id) => {
              const st = status(id);
              const judgeable = !blind && isHost && v.phase === "go" && open && v.alive.includes(id) && !v.sensors.includes(id);
              const shown = blind && v.phase === "result" && (v.alive.includes(id) || v.locks[id] !== undefined);
              return (
                <li key={id} className={`lb-person is-${st}`}>
                  <SeatFace seat={seat(id)} size={36} />
                  <span className="lb-person-name">{id === me ? (zh ? "你" : "You") : nameOf(id)}</span>
                  <span className="lb-person-best tabular">{blind ? (shown ? blindLine(zh, v.locks[id], v.angle) : "") : v.best[id] ? `${v.best[id]}°` : ""}</span>
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
                    <span className="lb-person-state">
                      {blind
                        ? st === "locked" ? (zh ? "锁定了" : "Locked") : st === "out" ? (zh ? "出局" : "Out") : st === "pass" ? (zh ? "留下" : "Stays") : zh ? "在仰" : "Leaning"
                        : st === "pass" ? (zh ? "过了" : "Under") : st === "fail" ? (zh ? "没过" : "Missed") : st === "out" ? (zh ? "出局" : "Out") : zh ? "在仰" : "Leaning"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {v.phase === "result" && (
          <p className="hint" style={{ textAlign: "center" }}>
            {blind
              ? zh ? "下一轮换个角度……" : "A new angle next round…"
              : // everyone still in missed it and nobody leaned at all: the same bar again
                v.alive.length > 0 && v.alive.every((id) => v.failed.includes(id))
                ? zh ? "谁都没过，这一杆再来……" : "Nobody made it. Same bar again…"
                : zh ? "杆子要降了……" : "Lowering the bar…"}
          </p>
        )}

        {v.phase === "end" && (
          <div className="fz-result">
            <p className="fz-result-title">{blind ? (zh ? "最有手感的人" : "The best feel for angles") : zh ? "林波之王" : "Limbo champion"}</p>
            {v.winner && (
              <span className="fz-face is-winner">
                <SeatFace seat={seat(v.winner)} size={96} />
                <Crown size={22} className="fz-crown" />
                <strong>{v.winner === me ? (zh ? "你" : "You") : nameOf(v.winner)}</strong>
              </span>
            )}
            {!blind && v.winner && v.best[v.winner] ? <p className="hint">{zh ? `最深仰到 ${v.best[v.winner]}°` : `Leaned back ${v.best[v.winner]}°`}</p> : null}
            {blind && v.winner && v.locks[v.winner] !== undefined ? <p className="hint">{zh ? `最后一轮目标 ${v.angle}°，仰了 ${blindLine(zh, v.locks[v.winner], v.angle)}` : `Last target ${v.angle}°: ${blindLine(zh, v.locks[v.winner], v.angle)}`}</p> : null}
            {isHost && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("again")}>
                {zh ? "再来一局" : "Play again"}
              </button>
            )}
          </div>
        )}

        {v.phase === "result" && isHost && (
          <HostRow>
            <HostButton onClick={() => g("go")}>{blind ? (zh ? "马上下一轮" : "Next round now") : zh ? "马上下一杆" : "Next bar now"}</HostButton>
          </HostRow>
        )}
      </div>
    </NetFrame>
  );
}
