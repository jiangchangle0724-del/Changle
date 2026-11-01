import { Crown, Flame, MonitorSpeaker, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground } from "../../lib/music";
import { haptic } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { useRoom, useRoomEvent, useTicker } from "../../online/RoomContext";
import { SET_PHASES, type SetPhase } from "../../shared/dj/types";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { NowPlaying, phaseHint, phaseName, TIMES_MIN } from "./parts";
import "../../styles/dj.css";

/**
 * 打碟 · DJ Booth on a phone: no sound here (it all comes out of the big screen), one big 🔥 to
 * push the DJ, and for the host, the night's four stretches and the end of the set.
 */
export function NetDj({ v, onLeave }: { v: DjView; onLeave: () => void }) {
  // the speaker is the only music: the lounge loop stays off on this phone
  useEffect(() => holdBackground(), []);
  const { room, me, isHost, g, now, nameOf, code } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  useTicker(v.phase !== "wait" && v.phase !== "end", 5000);
  const mine = v.total[me] ?? 0;
  const heat = v.fires.filter((f) => now() - f.at < 60_000).length;
  const noSpeaker = (room?.screens ?? 0) === 0;

  // a burst on this phone for every press, and the latest names from everyone else
  const [pops, setPops] = useState<number[]>([]);
  const seq = useRef(0);
  const press = () => {
    g("fire");
    haptic(14);
    const id = ++seq.current;
    setPops((p) => [...p.slice(-5), id]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x !== id)), 900);
  };
  const [others, setOthers] = useState<{ id: number; name: string }[]>([]);
  useRoomEvent((e) => {
    if (e.k !== "fx" || e.fx !== "fire" || !e.pid || e.pid === me) return;
    const id = ++seq.current;
    setOthers((list) => [...list.slice(-3), { id, name: nameOf(e.pid) }]);
    window.setTimeout(() => setOthers((list) => list.filter((x) => x.id !== id)), 2200);
  });

  const rules = (
    <>
      <p>
        {zh
          ? "电视或电脑打开 changle.ca/dj 就是音箱：在那上面点「开始派对」放歌。手机不出声，按 🔥 给 DJ 加油，大屏上看得到是谁。"
          : "Open changle.ca/dj on a TV or computer and it's the speaker: press Start the party there. Phones stay quiet; press 🔥 to push the DJ, and the big screen shows who did."}
      </p>
      <p>
        {zh
          ? `一晚分四段：暖场 ${TIMES_MIN.warm} 分钟，推高 ${TIMES_MIN.build} 分钟，然后是顶点，主人决定什么时候收尾，收尾 ${TIMES_MIN.cool} 分钟后结束。主人随时可以把它拖到任何一段。每场最长 ${TIMES_MIN.cap} 小时。`
          : `A night in four stretches: ${TIMES_MIN.warm} minutes of warm-up, ${TIMES_MIN.build} of build, then the peak until the host winds it down, and ${TIMES_MIN.cool} minutes later it's over. The host can move it to any stretch at any time. A set runs ${TIMES_MIN.cap} hours at most.`}
      </p>
    </>
  );

  return (
    <NetFrame title={GAME_BY_ID.dj.name} rules={rules} onLeave={onLeave} dock={false}>
      <div className={`djp is-${v.phase}`}>
        <section className="djp-now">
          <span className="djp-phase">{phaseName(v.phase, zh)}</span>
          <span className="djp-hint">{phaseHint(v, now(), zh)}</span>
          {v.phase !== "wait" && v.phase !== "end" && <NowPlaying v={v} />}
        </section>

        {noSpeaker && (
          <p className="djp-warn" role="status">
            <MonitorSpeaker size={18} />
            {zh ? `没有音箱在线：在电视或电脑上打开 changle.ca/tv/${code}` : `No speaker on: open changle.ca/tv/${code} on a TV or computer`}
          </p>
        )}

        <div className="djp-fire-wrap">
          <button type="button" className="djp-fire" onClick={press} aria-label={zh ? "给 DJ 加油" : "Fire up the DJ"}>
            <Flame size={74} strokeWidth={2.2} />
            {pops.map((id) => (
              <span key={id} className="djp-pop" aria-hidden="true">
                🔥
              </span>
            ))}
          </button>
          <p className="djp-count tabular">{zh ? `你按了 ${mine} 次 · 这一分钟全场 ${heat} 次` : `You: ${mine} · everyone this minute: ${heat}`}</p>
          <p className="djp-others" aria-live="polite">
            {others.map((o) => (
              <span key={o.id}>🔥 {o.name}</span>
            ))}
          </p>
        </div>

        {isHost && (
          <section className="djp-host" aria-label={zh ? "主人" : "Host"}>
            <span className="djp-host-label">
              <Crown size={14} strokeWidth={2.4} />
              {zh ? "主人：把今晚拖到" : "Host: take the night to"}
            </span>
            <div className="seg djp-seg" role="group">
              {SET_PHASES.map((p: SetPhase) => (
                <button key={p} type="button" aria-pressed={v.phase === p} disabled={v.phase === "wait" || v.phase === "end"} onClick={() => g("phase", { phase: p })}>
                  {phaseName(p, zh)}
                </button>
              ))}
            </div>
            {v.phase === "end" ? (
              <button type="button" className="btn btn-primary btn-block" onClick={() => g("again")}>
                <Play size={17} />
                {zh ? "再来一场" : "Another set"}
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-block" disabled={v.phase === "wait"} onClick={() => g("phase", { phase: "end" })}>
                <Square size={15} />
                {zh ? "结束这一场" : "End this set"}
              </button>
            )}
          </section>
        )}
      </div>
    </NetFrame>
  );
}
