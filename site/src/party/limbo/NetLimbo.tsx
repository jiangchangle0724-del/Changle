import { Check, Crown, Play, Smartphone, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground, startGroove, type GrooveHandle } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useReached, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import { useWatching } from "../../online/players";
import type { LimboKind, LimboView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { useSecondsLeft } from "../common";
import { enableSensors, perfAt, useSensorStatus, useWakeLock } from "../sensors";
import { LIMBO_MODES, blindError, classicBar } from "../../shared/engine/games/limbo";
import { QUIET, coaching, useCoach, type Grid } from "./coach";
import {
  BlindMeter,
  FollowMeter,
  HOLD_MS,
  LeanGauge,
  LimboScene,
  ModePicker,
  SteadyMeter,
  TiltMeter,
  barHow,
  barTag,
  blindLine,
  heardShort,
  modeName,
  useBlindLock,
  useFollow,
  useLean,
  usePose,
  variantSteps,
} from "./parts";
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
  // a seat that just watches (a host who watches keeps this screen for the host's buttons) has nothing to lean with
  const watching = useWatching();
  const blind = v.mode === "blind";
  // (a rooms server from before the variants sends no bar: a classic one)
  const bar = v.bar ?? classicBar();
  const kind: LimboKind = blind ? "classic" : bar.kind;
  const moving = kind === "moving";
  const alive = v.alive.includes(me);
  const passed = v.passed.includes(me);
  const failed = v.failed.includes(me);
  const locked = v.locked.includes(me);
  const open = useReached(v.phase === "go" ? v.startAt : null);
  // a moving bar stops before the round ends: then whoever kept up says so
  const moveEnd = v.startAt + bar.moveMs;
  const stopped = useReached(v.phase === "go" && moving ? moveEnd : null);
  const countdown = useSecondsLeft(v.phase === "go" && !open ? v.startAt : null, now);
  const timeLeft = useSecondsLeft(v.phase === "go" && open ? (moving && !stopped ? moveEnd : v.endsAt) : null, now);
  useWakeLock(v.phase === "go");

  useEffect(() => {
    if (!watching && sensors === "on" && !v.sensors.includes(me)) g("sensor", { on: true });
  }, [watching, sensors, v.sensors, me, g]);

  // the calypso keeps playing level after level, on the same beat on every phone
  const playing = v.musicAt > 0 && (v.phase === "go" || v.phase === "result");
  /** the music's grid, so the coach's cues land on it */
  const grid = useRef<Grid | null>(null);
  useEffect(() => {
    if (!playing) return;
    const h: GrooveHandle | null = startGroove("calypso", { startPerf: perfAt(v.musicAt, now()) });
    grid.current = h ? { originPerf: h.startedPerf, beatMs: h.beatMs } : null;
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

  // this phone measures its own player, whichever kind of bar it is
  const trying = !blind && v.phase === "go" && open && alive && !passed && !failed && sensors === "on";
  const pass = (deg: number) => g("pass", { deg });
  const classic = useLean(trying && kind === "classic", v.angle, pass);
  const pose = usePose(trying && (kind === "steady" || kind === "tilt"), { target: v.angle, side: kind === "tilt" ? bar.side : 0, holdMs: kind === "steady" ? bar.hold : HOLD_MS, still: kind === "steady" }, pass);
  const follow = useFollow(trying && moving, v.angle, bar, v.startAt, now, (kept, deg) => g(kept ? "pass" : "fail", { deg }));
  const best = kind === "classic" ? classic.best : moving ? follow.best : pose.best;
  // the phone is on their chest: it says what the gauge shows
  useCoach(
    trying,
    !trying
      ? QUIET
      : kind === "classic"
        ? coaching("classic", { lean: classic.lean, target: v.angle, hold: classic.hold })
        : moving
          ? coaching("moving", { lean: follow.lean, target: follow.at, lost: follow.lost })
          : coaching(kind, { lean: pose.lean, target: v.angle, hold: pose.hold, side: pose.side, want: kind === "tilt" ? bar.side : 0, wobbleAt: pose.wobbleAt }),
    grid,
  );
  const lastSent = useRef(0);

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
    if (!trying) return;
    const t = performance.now();
    if (best >= (v.best[me] ?? 0) + 4 && t - lastSent.current > 700) {
      lastSent.current = t;
      g("best", { deg: Math.round(best) });
    }
  }, [best, trying, v.best, me, g]);

  const drink = custom ? (zh ? "受罚" : "penalty") : zh ? "喝一口" : "drink";
  const rules = (
    <>
      <p>
        {zh
          ? `林波舞，手机当裁判。把手机竖着贴在胸前，屏幕朝外，背面贴着胸口，音乐响起后往后仰，仰到横杆的角度并坚持一秒多就算过。每一杆都更低（要仰得更多），没过的出局${drink}，最后剩下的人赢。没有动作感应的手机由主人判，或者自己说过没过。`
          : `Limbo, with the phone as judge. Hold it upright against your chest, screen facing out and its back against you. When the music plays, lean back to the bar's angle and hold it for a second or so. Every bar is lower (lean further). Miss and you're out (${drink}). Last one standing wins. Phones without motion sensing are judged by the host, or by their owner's honesty.`}
      </p>
      <p>
        {zh
          ? "手机在胸前看不见屏幕，靠听：两个音往下掉是再往后仰，往上走是回来一点，嗒嗒声是到位了（跟着动的杆：跟住了），连着三下短响是再往旁边歪，撑住的时候嗡声往上升，升到头就过，低低一响是晃了。你离横杆远的时候音乐也会变小。盲仰什么都不提示。"
          : "The phone is on your chest, so you play by ear: two notes falling mean lean back more, rising means come up a bit, a tick means you're there (with a moving bar: with it), three quick clicks mean tilt further, and while you hold, a hum climbs until you're through; a low buzz means you moved. The music drops while you're off the bar. Blind lean says nothing."}
      </p>
      <p>
        {zh
          ? "主人开始前还可以选别的玩法。稳住：仰到位以后要一动不动撑住，一晃就重来，每杆要撑的时间更长。跟着动的杆：横杆上下浮动，要跟着它仰下去又回来，跟丢超过 1 秒就出局，每部手机上的横杆都在同一个位置。歪着过：除了往后仰，还要往左或往右歪到指定角度，每杆方向随机。派对：每杆随机一种。这几种没有动作感应也能玩，由主人判，或者自己说。"
          : "The host can pick another way to play before the game. Hold steady: reach the bar, then hold dead still. Any wobble starts the hold again, and each bar is a longer hold. Moving bar: the bar floats up and down, in the same place on every phone; follow it down and back up, and lose it for over a second and you're out. Tilt through: lean back and also tilt left or right to the angle shown; the side is random each bar. Party: each bar is one of these or classic, at random. All of these work without motion sensing too, judged by the host or by honesty."}
      </p>
      <p>
        {zh
          ? `盲仰：每轮给一个目标角度，但看不到自己仰了多少。凭感觉仰到那个角度，停住不动一秒半，手机就锁定。离目标最远的出局${drink}，最后剩下的人赢。要用动作感应，测不了的手机这局当观众。`
          : `Blind lean: each round gives a target angle, but you can't see your own. Lean back to what feels like it and hold still for a second and a half; the phone locks it. Furthest from the target is out (${drink}). Last one standing wins. It needs motion sensing: phones that can't measure watch that game.`}
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
  const tag = blind ? "" : barTag(bar, zh, v.mode === "party");
  const passWord = moving ? (zh ? "跟住了" : "Kept up") : zh ? "过了" : "Under";
  const failWord = moving ? (zh ? "跟丢了" : "Lost it") : zh ? "没过" : "Missed";
  const showBar = v.phase === "go" || v.phase === "result";
  // between bars the scene already shows the next bar's angle, and its variant isn't drawn yet:
  // the slant, the sway and the variant's name are for the bar being played
  const live = v.phase === "go";

  return (
    <NetFrame title={GAME_BY_ID.limbo.name} rules={rules} onLeave={onLeave}>
      <div className="lb">
        {v.phase !== "end" && (
          <LimboScene angle={v.angle} level={v.level} side={live && kind === "tilt" ? bar.side : 0} sway={live && moving ? { bar, startAt: v.startAt, clock: now } : undefined}>
            {showBar && (
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
            {tag && live && <span className="lb-tag">{tag}</span>}
          </p>
        )}

        {v.phase === "ready" && (
          <>
            {isHost ? (
              <ModePicker modes={LIMBO_MODES} value={v.mode} onPick={(m) => g("mode", { mode: m })} />
            ) : (
              <p className="hint" style={{ textAlign: "center" }}>{zh ? `这局玩：${modeName(v.mode, zh)}` : `This game: ${modeName(v.mode, zh)}`}</p>
            )}
            {v.mode === "blind" ? (
              <ol className="lb-steps">
                <li>{zh ? "手机竖着贴在胸前，屏幕朝外，背面贴着胸口" : "Phone upright against your chest, screen facing out, its back against you"}</li>
                <li>{zh ? "每轮给一个目标角度，看不到自己仰了多少" : "Each round gives a target angle; you can't see your own"}</li>
                <li>{zh ? "凭感觉仰到位，停住不动一秒半就锁定" : "Lean to what feels right and hold still for a second and a half"}</li>
                <li>{zh ? `离目标最远的出局${custom ? "受罚" : "喝一口"}` : `Furthest from the target is out and ${custom ? "takes the penalty" : "drinks"}`}</li>
              </ol>
            ) : v.mode === "classic" ? (
              <ol className="lb-steps">
                <li>{zh ? "手机竖着贴在胸前，屏幕朝外，背面贴着胸口" : "Phone upright against your chest, screen facing out, its back against you"}</li>
                <li>{zh ? "音乐一响，往后仰到要求的角度" : "When the music starts, lean back to the angle"}</li>
                <li>{zh ? "坚持一秒多就算过，杆子会越来越低" : "Hold it for a second to pass. The bar keeps dropping."}</li>
                <li>{heardShort(zh)}</li>
              </ol>
            ) : (
              <ol className="lb-steps">
                <li>{zh ? "手机竖着贴在胸前，屏幕朝外，背面贴着胸口" : "Phone upright against your chest, screen facing out, its back against you"}</li>
                {variantSteps(v.mode, zh).map((s) => (
                  <li key={s}>{s}</li>
                ))}
                <li>{heardShort(zh)}</li>
              </ol>
            )}
            {watching ? null : sensors !== "on" ? (
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

        {v.phase === "go" && !open && (
          <>
            <p className="lb-count tabular">{countdown}</p>
            {/* what this bar asks, while there's a moment to read it */}
            {!blind && alive && kind !== "classic" && <p className="hint" style={{ textAlign: "center" }}>{barHow(bar, v.angle, zh, sensors === "on")}</p>}
          </>
        )}

        {v.phase === "go" && open && alive && (
          <>
            {blind ? (
              <BlindMeter target={v.angle} steady={blindLock.steady} locked={locked} />
            ) : passed ? (
              <p className="lb-verdict is-pass">{passWord}</p>
            ) : failed ? (
              <p className="lb-verdict is-fail">{failWord}</p>
            ) : sensors === "on" ? (
              kind === "steady" ? (
                <SteadyMeter target={v.angle} holdMs={bar.hold} pose={pose} />
              ) : kind === "tilt" ? (
                <TiltMeter target={v.angle} side={bar.side} pose={pose} />
              ) : moving ? (
                <FollowMeter follow={follow} />
              ) : (
                <LeanGauge lean={classic.lean} target={v.angle} hold={classic.hold} />
              )
            ) : (
              <>
                {kind !== "classic" && <p className="hint" style={{ textAlign: "center" }}>{barHow(bar, v.angle, zh, false)}</p>}
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => g("fail")}>
                    <X size={18} />
                    {moving ? (zh ? "跟丢了" : "Lost it") : zh ? "没过" : "Missed"}
                  </button>
                  <button type="button" className="btn btn-primary btn-lg btn-block" disabled={moving && !stopped} onClick={() => g("pass", { deg: v.angle })}>
                    <Check size={18} />
                    {moving ? (zh ? "我跟住了" : "I kept up") : zh ? "我过了" : "I made it"}
                  </button>
                </div>
              </>
            )}
            <p className="hint lb-time tabular">
              {moving && stopped ? (zh ? `横杆停了，还有 ${timeLeft} 秒说结果` : `The bar stopped. ${timeLeft}s to say how it went`) : zh ? `还剩 ${timeLeft} 秒` : `${timeLeft}s left`}
            </p>
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
                      <button type="button" className="icon-btn" aria-label={failWord} onClick={() => g("judge", { pid: id, ok: false })}>
                        <X size={18} />
                      </button>
                      {/* nobody has kept up with a moving bar until it stops */}
                      <button type="button" className="icon-btn" aria-label={passWord} disabled={moving && !stopped} onClick={() => g("judge", { pid: id, ok: true })}>
                        <Check size={18} />
                      </button>
                    </span>
                  ) : (
                    <span className="lb-person-state">
                      {blind
                        ? st === "locked" ? (zh ? "锁定了" : "Locked") : st === "out" ? (zh ? "出局" : "Out") : st === "pass" ? (zh ? "留下" : "Stays") : zh ? "在仰" : "Leaning"
                        : st === "pass" ? passWord : st === "fail" ? failWord : st === "out" ? (zh ? "出局" : "Out") : moving ? (zh ? "在跟" : "Following") : zh ? "在仰" : "Leaning"}
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
