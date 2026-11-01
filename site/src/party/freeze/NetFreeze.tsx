import { Crown, Hand, Pause, Play, Smartphone } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground, startGroove, type GrooveId } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { FreezeView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { useSecondsLeft } from "../common";
import { enableSensors, perfAt, useMotionWatch, useSensorStatus, useStillness, useWakeLock } from "../sensors";
import { DanceFloor, FreezeFlash, StillMeter } from "./parts";
import "../../styles/party.css";
import { Lineup, Moment } from "../../components/Figure";

const GRACE_MS = 700;

export function NetFreeze({ v, onLeave }: { v: FreezeView; onLeave: () => void }) {
  // the dance floor has its own music: the lounge music waits
  useEffect(() => holdBackground(), []);
  const { room, me, isHost, g, nameOf, now } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const custom = usePenaltyText().isCustom;
  const seats = room?.seats ?? [];
  const seat = (id: string) => seats.find((s) => s.id === id);
  const sensors = useSensorStatus();
  const alive = v.alive.includes(me);
  const caught = v.moved.includes(me);
  const knockout = v.mode === "out";
  useWakeLock(v.phase === "dance" || v.phase === "freeze");

  // tell the table this phone can feel itself move
  useEffect(() => {
    if (sensors === "on" && !v.sensors.includes(me)) g("sensor", { on: true });
  }, [sensors, v.sensors, me, g]);

  // every phone plays the same track and cuts at the same instant
  useEffect(() => {
    if (v.phase !== "dance") return;
    const h = startGroove(v.groove as GrooveId, { startPerf: perfAt(v.musicAt, now()) });
    h?.stopAt(perfAt(v.stopAt, now()));
    const cut = window.setTimeout(
      () => {
        sfx.scratch();
        haptic([60, 40, 60]);
      },
      Math.max(0, v.stopAt - now()),
    );
    return () => {
      window.clearTimeout(cut);
      h?.stop(0.05);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, v.round, v.musicAt, v.stopAt]);

  // the freeze: after a moment to stop, a held phone that moves gives its owner away
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (v.phase !== "freeze") {
      setListening(false);
      return;
    }
    const a = window.setTimeout(() => setListening(true), Math.max(0, v.stopAt + GRACE_MS - now()));
    const b = window.setTimeout(() => setListening(false), Math.max(0, v.judgeAt - 250 - now()));
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, v.round]);
  const watching = listening && alive && sensors === "on" && !caught;
  // one report per freeze: the motion keeps firing until the server marks you caught
  const reported = useRef(-1);
  useMotionWatch(watching, () => {
    if (reported.current === v.round) return;
    reported.current = v.round;
    g("moved");
    sfx.wrong();
    haptic(300);
  });
  const still = useStillness(watching);
  useCue(v.phase === "result" && v.moved.length > 0, () => sfx.sadTrombone(0.7));
  const nextIn = useSecondsLeft(v.phase === "result" && v.auto ? v.judgeAt + 5500 : null, now);

  const rules = (
    <p>
      {custom
        ? zh
          ? "所有手机同时放同一首歌。音乐响就跳，音乐一停所有人定住。把手机拿在手里跳，手机会自己感觉你有没有动；没开动作感应的，主人当裁判抓人，自己动了也可以自首。淘汰赛：动了就出局，最后站着的人赢。惩罚版：动了就受罚，继续跳。"
          : "Every phone plays the same track. Dance while it plays; when it cuts out, freeze. Hold your phone while you dance and it can feel whether you moved. Without motion sensing, the host judges (or own up). Knockout: move and you're out, last one standing wins. Penalty: move and take the penalty, then keep dancing."
        : zh
          ? "所有手机同时放同一首歌。音乐响就跳，音乐一停所有人定住。把手机拿在手里跳，手机会自己感觉你有没有动；没开动作感应的，主人当裁判抓人，自己动了也可以自首。淘汰赛：动了就出局，最后站着的人赢。喝酒版：动了喝一口，继续跳。"
          : "Every phone plays the same track. Dance while it plays; when it cuts out, freeze. Hold your phone while you dance and it can feel whether you moved. Without motion sensing, the host judges (or own up). Knockout: move and you're out, last one standing wins. Drinking: move and drink, then keep dancing."}
    </p>
  );

  const sensorButton =
    sensors !== "on" ? (
      <button type="button" className="btn btn-ghost btn-block" onClick={() => void enableSensors()} disabled={sensors === "asking"}>
        <Smartphone size={17} />
        {sensors === "none" || sensors === "denied" ? (zh ? "这部手机感应不到动作，靠主人裁判" : "No motion sensing here. The host will judge you.") : zh ? "开启动作感应（手机拿在手里跳）" : "Turn on motion sensing (dance holding your phone)"}
      </button>
    ) : (
      <p className="fz-sensor-on">
        <Smartphone size={15} />
        {zh ? "动作感应开着：音乐停了就拿稳手机" : "Motion sensing on: hold the phone still when the music stops"}
      </p>
    );

  return (
    <NetFrame title={GAME_BY_ID.freeze.name} rules={rules} onLeave={onLeave}>
      <div className="fz">
        {v.phase === "ready" && (
          <>
            <div className="seg" role="group" aria-label={zh ? "玩法" : "Mode"}>
              <button type="button" aria-pressed={knockout} disabled={!isHost} onClick={() => g("mode", { mode: "out" })}>
                {zh ? "淘汰赛" : "Knockout"}
              </button>
              <button type="button" aria-pressed={!knockout} disabled={!isHost} onClick={() => g("mode", { mode: "drink" })}>
                {custom ? (zh ? "惩罚版" : "Penalty") : zh ? "喝酒版" : "Drinking"}
              </button>
            </div>
            <p className="hint fz-mode-note">
              {knockout
                ? zh
                  ? "动了就出局，最后站着的人赢"
                  : "Move and you're out. Last one standing wins."
                : custom
                  ? zh
                    ? "动了就受罚，然后接着跳"
                    : "Move and take the penalty, then keep dancing"
                  : zh
                    ? "动了喝一口，然后接着跳"
                    : "Move and you drink, then keep dancing"}
            </p>
            {sensorButton}
            <ul className="fz-roster">
              {seats.map((s) => (
                <li key={s.id}>
                  <SeatFace seat={s} size={40} />
                  <span>{s.id === me ? (zh ? "你" : "You") : s.name}</span>
                  {v.sensors.includes(s.id) && <Smartphone size={14} className="fz-has-sensor" aria-label={zh ? "开了感应" : "Sensing"} />}
                </li>
              ))}
            </ul>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("go")}>
                <Play size={18} />
                {zh ? "放音乐" : "Start the music"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人放音乐" : "Waiting for the host to start the music"}</Waiting>
            )}
          </>
        )}

        {(v.phase === "dance" || v.phase === "freeze" || v.phase === "result") && (
          <Lineup
            items={[...v.alive, ...(v.phase === "result" ? v.moved.filter((id) => !v.alive.includes(id)) : [])]
              .filter((id) => seat(id))
              .map((id) => ({ seat: seat(id)!, pose: v.phase === "dance" ? "dance" : v.moved.includes(id) ? "caught" : "frozen" }))}
          />
        )}

        {v.phase === "dance" && (
          <>
            <DanceFloor groove={v.groove}>
              <span className="fz-round tabular">{zh ? `第 ${v.round} 轮` : `Round ${v.round}`}</span>
            </DanceFloor>
            {!alive && <p className="hint" style={{ textAlign: "center" }}>{zh ? "你出局了，看大家跳" : "You're out. Enjoy the show."}</p>}
            {alive && sensors === "on" && <p className="fz-sensor-on">{zh ? "手机拿在手里跳，音乐一停就拿稳" : "Dance with the phone in hand. When it stops, hold still."}</p>}
          </>
        )}

        {v.phase === "freeze" && (
          <FreezeFlash caught={caught}>
            {alive && !caught && sensors === "on" && <StillMeter still={still} />}
            {alive && !caught && sensors !== "on" && (
              <button type="button" className="btn btn-ghost fz-own" onClick={() => g("moved")}>
                <Hand size={16} />
                {zh ? "我动了" : "I moved"}
              </button>
            )}
          </FreezeFlash>
        )}

        {v.phase === "freeze" && isHost && (
          <div className="fz-catch">
            <span className="hint">{zh ? "看到谁动了？点一下" : "Saw someone move? Tap them"}</span>
            <div className="fz-catch-row">
              {v.alive.map((id) => (
                <button key={id} type="button" className={`fz-catch-btn ${v.moved.includes(id) ? "is-on" : ""}`} aria-pressed={v.moved.includes(id)} onClick={() => g("catch", { pid: id })}>
                  <SeatFace seat={seat(id)} size={44} />
                  <span>{id === me ? (zh ? "你" : "You") : nameOf(id)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {v.phase === "result" && (
          <div className="fz-result">
            {v.moved.length ? (
              <>
                <p className="fz-result-title">
                  {knockout && v.moved.every((id) => v.alive.includes(id))
                    ? custom
                      ? zh
                        ? "全都动了，受罚再来"
                        : "Everyone moved. Penalty, then go again"
                      : zh
                        ? "全都动了，喝一口再来"
                        : "Everyone moved. Drink and go again"
                    : knockout
                      ? zh
                        ? "出局"
                        : "Out"
                      : custom
                        ? zh
                          ? "动了，受罚"
                          : "Moved: penalty"
                        : zh
                          ? "动了，喝"
                          : "Moved: drink"}
                </p>
                <div className="fz-faces">
                  {v.moved.map((id) => (
                    <span key={id} className="fz-face is-caught">
                      <SeatFace seat={seat(id)} size={56} />
                      <strong>{id === me ? (zh ? "你" : "You") : nameOf(id)}</strong>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="fz-result-title">{zh ? "全员定住，厉害" : "Everyone froze. Nice."}</p>
            )}
            {knockout && (
              <p className="hint">
                {zh ? `还剩 ${v.alive.length} 人` : `${v.alive.length} still dancing`}
                {nextIn > 0 && (zh ? `，${nextIn} 秒后下一轮` : `. Next round in ${nextIn}s`)}
              </p>
            )}
            {!knockout && nextIn > 0 && <p className="hint">{zh ? `${nextIn} 秒后下一轮` : `Next round in ${nextIn}s`}</p>}
          </div>
        )}

        {v.phase === "end" && (
          <div className="fz-result">
            <p className="fz-result-title">{zh ? "最后的舞王" : "Last one dancing"}</p>
            {v.winner && seat(v.winner) && <Moment seat={seat(v.winner)!} kind="winner" />}
            {v.winner && (
              <span className="fz-face is-winner">
                <Crown size={22} className="fz-crown" />
                <strong>{v.winner === me ? (zh ? "你" : "You") : nameOf(v.winner)}</strong>
              </span>
            )}
          </div>
        )}

        {(v.phase === "dance" || v.phase === "result") && (
          <div className="fz-alive">
            {v.alive.map((id) => (
              <SeatFace key={id} seat={seat(id)} size={30} />
            ))}
            {v.out.map((id) => (
              <span key={id} className="fz-out">
                <SeatFace seat={seat(id)} size={30} />
              </span>
            ))}
          </div>
        )}

        <HostRow>
          {v.phase === "result" && (
            <>
              <HostButton onClick={() => g("go")}>
                <Play size={14} />
                {zh ? "马上下一轮" : "Next round now"}
              </HostButton>
              <HostButton onClick={() => g("pause")}>
                <Pause size={14} />
                {zh ? "暂停 / 继续自动" : "Pause or resume"}
              </HostButton>
            </>
          )}
          {v.phase === "end" && <HostButton onClick={() => g("again")}>{zh ? "再来一局" : "Play again"}</HostButton>}
        </HostRow>
      </div>
    </NetFrame>
  );
}
