import { Check, Crown, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameShell, usePenalty } from "../../games/GameShell";
import { Resume, useKeepProgress } from "../../games/Resume";
import { GAME_BY_ID } from "../../games/registry";
import { pick, randInt } from "../../lib/random";
import { holdBackground, startGroove, type GrooveHandle, type GrooveId } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import { usePenaltyText, useStore } from "../../store";
import { NameFace } from "../common";
import { useWakeLock } from "../sensors";
import { DanceFloor, FreezeFlash, TRACKS } from "./parts";
import "../../styles/party.css";

type Phase = "setup" | "ready" | "dance" | "freeze" | "judge" | "end";
type Kept = { mode: "out" | "drink"; track: GrooveId | "mix"; phase: Phase; round: number; groove: GrooveId; alive: string[]; moved: string[]; repeat: boolean };

/** One phone plays DJ: the music cuts out at random, one person judges who moved. */
export function Freeze({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="freeze" version={1}>
      {(saved) => <FreezeGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function FreezeGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  // the dance floor has its own music: the lounge music waits
  useEffect(() => holdBackground(), []);
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const [mode, setMode] = useState<"out" | "drink">(saved?.mode ?? "out");
  const [track, setTrack] = useState<GrooveId | "mix">(saved?.track ?? "mix");
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "setup");
  const [round, setRound] = useState(saved?.round ?? 0);
  const [groove, setGroove] = useState<GrooveId>(saved?.groove ?? "disco");
  const [alive, setAlive] = useState<string[]>(saved?.alive ?? players.map((p) => p.id));
  const [moved, setMoved] = useState<string[]>(saved?.moved ?? []);
  const repeat = saved?.repeat ?? false;
  const handle = useRef<GrooveHandle | null>(null);
  const timer = useRef(0);
  const penalty = usePenalty();
  // the "drink" mode is the one where you take the penalty and keep dancing: named for the penalty in settings
  const custom = usePenaltyText().isCustom;
  // Mid-song: wait for the judge to start this round again. A counted stamp returns after it.
  const stamped = !!penalty.call;
  const keptPhase = stamped ? (mode === "out" && alive.length <= 1 ? "end" : "ready") : phase === "dance" ? "ready" : phase === "freeze" ? "judge" : phase;
  useKeepProgress<Kept>({ mode, track, phase: keptPhase, round: round + (stamped ? 1 : 0), groove, alive, moved: stamped ? [] : moved, repeat: !stamped && (phase === "dance" || (phase === "ready" && repeat)) }, keptPhase !== "setup" && keptPhase !== "end");
  const name = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  useWakeLock(phase === "dance" || phase === "freeze");

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      handle.current?.stop(0.05);
    },
    [],
  );

  const dance = (r: number, same = false) => {
    const g = same ? groove : track === "mix" ? (r % 3 === 1 || r === 1 ? pick(TRACKS).id : groove) : track;
    setGroove(g);
    setRound(r);
    setMoved([]);
    setPhase("dance");
    handle.current?.stop(0.05);
    handle.current = startGroove(g);
    const ms = r <= 2 ? randInt(9000, 18000) : randInt(6000, 15000);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      handle.current?.stop(0.02);
      sfx.scratch();
      haptic([60, 40, 60]);
      setPhase("freeze");
      timer.current = window.setTimeout(() => setPhase("judge"), 3200);
    }, ms);
  };

  const judge = () => {
    const caught = moved.filter((id) => alive.includes(id));
    // everyone still dancing moved: nobody goes out, they all drink and dance again
    const all = mode === "out" && caught.length > 0 && caught.length >= alive.length;
    const left = mode === "out" && !all ? alive.filter((id) => !caught.includes(id)) : alive;
    const after = () => {
      if (mode === "out" && left.length <= 1) {
        setPhase("end");
        sfx.win();
        return;
      }
      dance(round + 1);
    };
    setAlive(left);
    if (!caught.length) {
      sfx.correct();
      after();
      return;
    }
    // the music waits while they drink
    sfx.sadTrombone(0.7);
    setPhase("judge");
    penalty.show(
      {
        who: caught.map((id) => name[id]),
        kind: mode === "out" && !all ? "two" : "sip",
        note: all ? (zh ? "全都动了，再来一次" : "Everyone moved. Go again") : mode === "out" ? (zh ? "动了，出局" : "Moved: you're out") : zh ? "你动了" : "You moved",
      },
      after,
    );
  };

  const rules = (
    <p>
      {custom
        ? zh
          ? "手机放音乐，大家跳舞。音乐会在随机的时候突然停，所有人马上定住。拿手机的人当裁判，点一下谁动了。淘汰赛：动了就出局，最后站着的人赢。惩罚版：动了就受罚，接着跳。"
          : "The phone plays the music and everyone dances. It cuts out at a random moment and everyone freezes on the spot. Whoever holds the phone judges and taps anyone who moved. Knockout: move and you're out, last one standing wins. Penalty: move and take the penalty, then keep dancing."
        : zh
          ? "手机放音乐，大家跳舞。音乐会在随机的时候突然停，所有人马上定住。拿手机的人当裁判，点一下谁动了。淘汰赛：动了就出局，最后站着的人赢。喝酒版：动了喝一口，接着跳。"
          : "The phone plays the music and everyone dances. It cuts out at a random moment and everyone freezes on the spot. Whoever holds the phone judges and taps anyone who moved. Knockout: move and you're out, last one standing wins. Drinking: move and drink, then keep dancing."}
    </p>
  );

  const actions =
    phase === "setup" ? (
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => {
          setAlive(players.map((p) => p.id));
          dance(1);
        }}
      >
        <Play size={18} />
        {zh ? "放音乐" : "Start the music"}
      </button>
    ) : phase === "ready" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => dance(round, repeat)}>
        <Play size={18} /> {zh ? "放音乐" : "Start the music"}
      </button>
    ) : phase === "freeze" || phase === "judge" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={judge}>
        {moved.length ? (
          zh ? (
            `抓到 ${moved.length} 个，继续跳`
          ) : (
            `Caught ${moved.length}. Keep dancing`
          )
        ) : (
          <>
            <Check size={18} />
            {zh ? "没人动，继续跳" : "Nobody moved. Keep dancing"}
          </>
        )}
      </button>
    ) : phase === "end" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => setPhase("setup")}>
        {zh ? "再来一局" : "Play again"}
      </button>
    ) : undefined;

  return (
    <GameShell title={GAME_BY_ID.freeze.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} roster={{ out: phase === "setup" ? [] : players.filter((p) => !alive.includes(p.id)).map((p) => p.id) }} status={phase !== "setup" && round > 0 ? { kind: "round", current: round } : undefined} actions={actions}>
      <div className="fz">
        {phase === "setup" && (
          <>
            <div className="panel setup-panel">
              <span className="field-label">{zh ? "玩法" : "Mode"}</span>
              <div className="seg" role="group">
                <button type="button" aria-pressed={mode === "out"} onClick={() => setMode("out")}>
                  {zh ? "淘汰赛" : "Knockout"}
                </button>
                <button type="button" aria-pressed={mode === "drink"} onClick={() => setMode("drink")}>
                  {custom ? (zh ? "惩罚版" : "Penalty") : zh ? "喝酒版" : "Drinking"}
                </button>
              </div>
              <span className="field-label">{zh ? "音乐" : "Music"}</span>
              <div className="picker">
                <button type="button" className="chip" aria-pressed={track === "mix"} onClick={() => setTrack("mix")}>
                  {zh ? "随机换" : "Mix it up"}
                </button>
                {TRACKS.map((t) => (
                  <button key={t.id} type="button" className="chip" aria-pressed={track === t.id} onClick={() => setTrack(t.id)}>
                    {zh ? t.zh : t.en}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint" style={{ textAlign: "center" }}>
              {zh ? "把手机放在大家都听得到的地方，裁判看着大家。" : "Put the phone where everyone can hear it. The judge watches the floor."}
            </p>
          </>
        )}

        {(phase === "dance" || phase === "ready") && (
          <>
            <DanceFloor groove={groove}>
              <span className="fz-round tabular">{zh ? `第 ${round} 轮` : `Round ${round}`}</span>
            </DanceFloor>
            <div className="fz-alive">
              {players.map((p) =>
                alive.includes(p.id) ? (
                  <NameFace key={p.id} name={p.name} size={30} />
                ) : (
                  <span key={p.id} className="fz-out">
                    <NameFace name={p.name} size={30} />
                  </span>
                ),
              )}
            </div>
          </>
        )}

        {(phase === "freeze" || phase === "judge") && (
          <>
            <FreezeFlash />
            <p className="sup-ask">{phase === "freeze" ? (zh ? "别动……" : "Hold it…") : zh ? "谁动了？" : "Who moved?"}</p>
            <div className="fz-catch-row">
              {players
                .filter((p) => alive.includes(p.id))
                .map((p) => {
                  const on = moved.includes(p.id);
                  return (
                    <button key={p.id} type="button" className={`fz-catch-btn ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => setMoved((m) => (on ? m.filter((x) => x !== p.id) : [...m, p.id]))}>
                      <NameFace name={p.name} size={44} />
                      <span>{p.name}</span>
                    </button>
                  );
                })}
            </div>
          </>
        )}

        {phase === "end" && (
          <div className="fz-result">
            <p className="fz-result-title">{zh ? "最后的舞王" : "Last one dancing"}</p>
            {alive[0] && (
              <span className="fz-face is-winner">
                <NameFace name={name[alive[0]]} size={96} />
                <Crown size={22} className="fz-crown" />
                <strong>{name[alive[0]]}</strong>
              </span>
            )}
          </div>
        )}
      </div>
    </GameShell>
  );
}
