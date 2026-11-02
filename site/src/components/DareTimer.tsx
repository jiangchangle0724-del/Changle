import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
import { durationLabel } from "../lib/duration";
import { haptic } from "../lib/sfx";
import { useWakeLock } from "../party/sensors";
import { TimerArc } from "./TimerArc";

type State = "ready" | "running" | "paused" | "done";

/**
 * A countdown under a dare or a king's command that names a time ("对视 20 秒", src/lib/duration.ts).
 * It waits for Start, so the players can get into position first; it can be paused and started
 * over, and the screen stays on while it runs. The last ten seconds tick and time's up buzzes when
 * sound is on. It counts on this phone only: at an online table each phone keeps its own.
 */
export function DareTimer({ seconds, lang, resetKey }: { seconds: number; lang: Lang; resetKey?: string | number }) {
  const [state, setState] = useState<State>("ready");
  const [round, setRound] = useState(0);
  const zh = lang === "zh";

  // a new card starts a new countdown
  useEffect(() => {
    setState("ready");
    setRound((r) => r + 1);
  }, [seconds, resetKey]);
  useWakeLock(state === "running");

  const again = () => {
    setState("ready");
    setRound((r) => r + 1);
  };

  const status =
    state === "running"
      ? zh
        ? "计时中"
        : "Counting down"
      : state === "paused"
        ? zh
          ? "已暂停"
          : "Paused"
        : state === "done"
          ? zh
            ? "时间到！"
            : "Time's up!"
          : zh
            ? `倒计时 ${durationLabel(seconds, "zh")}`
            : `${durationLabel(seconds, "en")} countdown`;

  return (
    <div className={`dare-timer is-${state}`} role="group" aria-label={zh ? "倒计时" : "Countdown"}>
      <TimerArc
        seconds={seconds}
        running={state === "running"}
        resetKey={`${resetKey ?? ""}:${round}`}
        size={88}
        clock
        onEnd={() => {
          setState("done");
          haptic([40, 60, 40]);
        }}
      />
      <div className="dare-timer-side">
        <p className="dare-timer-status" aria-live="polite">
          {status}
        </p>
        <div className="dare-timer-actions">
          {state === "done" ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={again}>
              <RotateCcw size={18} aria-hidden="true" />
              {zh ? "再来一次" : "Again"}
            </button>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setState(state === "running" ? "paused" : "running")}>
              {state === "running" ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {state === "running" ? (zh ? "暂停" : "Pause") : state === "paused" ? (zh ? "继续" : "Resume") : zh ? "开始" : "Start"}
            </button>
          )}
          {(state === "running" || state === "paused") && (
            <button type="button" className="icon-btn" aria-label={zh ? "重新计时" : "Start over"} title={zh ? "重新计时" : "Start over"} onClick={again}>
              <RotateCcw size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
