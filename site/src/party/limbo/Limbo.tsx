import { Check, Crown, Play, Smartphone, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameShell, usePenalty } from "../../games/GameShell";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground, startGroove, type GrooveHandle } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import { LIMBO_ANGLES } from "../../shared/engine/games/limbo";
import { useStore } from "../../store";
import { NameFace } from "../common";
import { enableSensors, useSensorStatus, useWakeLock } from "../sensors";
import { LeanGauge, LimboScene, useLean } from "./parts";
import "../../styles/party.css";

type Mode = "phone" | "bar";
type Phase = { k: "setup" } | { k: "ready"; i: number } | { k: "count"; i: number; n: number } | { k: "try"; i: number; ends: number } | { k: "verdict"; i: number; ok: boolean } | { k: "bar" } | { k: "end"; winner: string | null };

const TRY_MS = 15_000;

/** One phone: pass it round and let it measure each lean, or run a real bar with music and a scorecard. */
export function Limbo({ onBack }: { onBack: () => void }) {
  // the dance floor has its own music: the lounge music waits
  useEffect(() => holdBackground(), []);
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const people = useMemo(() => (players.length ? players : [{ id: "me", name: zh ? "你" : "You" }]), [players, zh]);
  const name = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const [mode, setMode] = useState<Mode>("phone");
  const [level, setLevel] = useState(0);
  const [alive, setAlive] = useState<string[]>(people.map((p) => p.id));
  const [passed, setPassed] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  /** how far each person leaned at the current bar (the tiebreak when nobody gets under it) */
  const [best, setBest] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<Phase>({ k: "setup" });
  const [left, setLeft] = useState(15);
  const sensors = useSensorStatus();
  const penalty = usePenalty();
  const music = useRef<GrooveHandle | null>(null);
  const angle = LIMBO_ANGLES[Math.min(level, LIMBO_ANGLES.length - 1)];
  useWakeLock(phase.k === "try" || phase.k === "count" || phase.k === "bar");

  useEffect(() => () => music.current?.stop(0.2), []);
  const playMusic = () => {
    if (!music.current) music.current = startGroove("calypso");
  };
  const stopMusic = () => {
    music.current?.stop(0.6);
    music.current = null;
  };

  // phone mode: whose turn is it at this bar
  const cur = phase.k === "ready" || phase.k === "count" || phase.k === "try" || phase.k === "verdict" ? people.find((p) => p.id === alive[phase.i]) ?? null : null;

  // 3, 2, 1
  useEffect(() => {
    if (phase.k !== "count") return;
    sfx.countdown(phase.n);
    const id = window.setTimeout(() => {
      if (phase.n > 1) setPhase({ k: "count", i: phase.i, n: phase.n - 1 });
      else {
        sfx.gong("small", 0.7);
        setPhase({ k: "try", i: phase.i, ends: performance.now() + TRY_MS });
      }
    }, 850);
    return () => window.clearTimeout(id);
  }, [phase]);

  // the clock for one attempt
  useEffect(() => {
    if (phase.k !== "try") return;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((phase.ends - performance.now()) / 1000));
      setLeft(s);
      if (s <= 0) verdict(phase.i, false);
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const measuring = phase.k === "try" && sensors === "on";
  const lean = useLean(measuring, angle, (deg) => {
    if (phase.k === "try") verdict(phase.i, true, deg);
  });
  // the attempt clock reads this when time runs out, long after it captured `verdict`
  const leanBest = useRef(0);
  leanBest.current = lean.best;

  const verdict = (i: number, ok: boolean, deg?: number) => {
    const id = alive[i];
    if (!id) return;
    if (ok) {
      setPassed((p) => [...p, id]);
      setBest((b) => ({ ...b, [id]: deg ?? angle }));
      sfx.correct();
      haptic([12, 30, 12]);
    } else {
      setFailed((f) => [...f, id]);
      setBest((b) => ({ ...b, [id]: Math.round(leanBest.current) }));
      sfx.sadTrombone(0.7);
    }
    setPhase({ k: "verdict", i, ok });
  };

  const nextTurn = () => {
    if (phase.k !== "verdict") return;
    const nextI = phase.i + 1;
    if (nextI < alive.length) {
      setPhase({ k: "ready", i: nextI });
      return;
    }
    settle(failed, passed);
  };

  const settle = (fails: string[], passes: string[]) => {
    const stay = alive.filter((id) => passes.includes(id));
    const losers = alive.filter((id) => fails.includes(id) || !passes.includes(id));
    const solo = people.length === 1;
    // nobody made it under: the deepest lean at this bar wins and everyone else drinks; with
    // no leans measured (a real bar, or no motion sensor) they all drink and try this bar again
    const top = Math.max(...alive.map((id) => best[id] ?? 0));
    const deepest = stay.length === 0 && top > 0 ? (alive.find((id) => (best[id] ?? 0) === top) ?? null) : null;
    const again = stay.length === 0 && !deepest && !solo;
    const drinkers = deepest ? alive.filter((id) => id !== deepest) : again ? alive : losers;
    const after = () => {
      if (solo) {
        if (stay.length) return nextLevel(stay);
        return finish(null);
      }
      if (again) return retryBar();
      if (stay.length === 0) return finish(deepest);
      if (stay.length === 1) return finish(stay[0]);
      nextLevel(stay);
    };
    if (drinkers.length && !solo)
      penalty.show({ who: drinkers.map((id) => name[id]), kind: "sip", note: again ? (zh ? `${angle}° 谁都没过，再来一次` : `Nobody made ${angle}°. Try it again`) : zh ? `${angle}° 没过去` : `Missed the ${angle}° bar` }, after);
    else after();
  };

  const retryBar = () => {
    setPassed([]);
    setFailed([]);
    setBest({});
    setPhase(mode === "phone" ? { k: "ready", i: 0 } : { k: "bar" });
  };

  const nextLevel = (stay: string[]) => {
    setAlive(stay);
    setPassed([]);
    setFailed([]);
    setBest({});
    setLevel((l) => l + 1);
    sfx.drum(0.8);
    setPhase(mode === "phone" ? { k: "ready", i: 0 } : { k: "bar" });
  };

  const finish = (winner: string | null) => {
    stopMusic();
    sfx.win();
    setPhase({ k: "end", winner });
  };

  const start = async () => {
    setAlive(people.map((p) => p.id));
    setPassed([]);
    setFailed([]);
    setBest({});
    setLevel(0);
    playMusic();
    if (mode === "phone") {
      if (sensors === "off") await enableSensors();
      setPhase({ k: "ready", i: 0 });
    } else setPhase({ k: "bar" });
  };

  const rules = (
    <p>
      {zh
        ? "手机测角度：手机竖着贴在胸口，屏幕朝自己，往后仰到横杆的角度并坚持一秒多就算过，手机传给下一个人。每一杆要仰得更多，没过的出局喝一口，最后剩下的人赢。真杆子：两个人拉一根杆子或绳子，手机放音乐、记分，裁判点谁过了谁没过。"
        : "Phone measures: hold the phone upright against your chest, screen facing you, lean back to the bar's angle and hold it for a second, then pass the phone on. Every bar needs a deeper lean. Miss and you're out (drink). Last one standing wins. Real bar: two people hold a stick or a rope, the phone plays the music and keeps score, and the judge taps who made it."}
    </p>
  );

  return (
    <GameShell title={GAME_BY_ID.limbo.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <div className="lb">
        {phase.k !== "end" && <LimboScene angle={angle} level={level} />}
        {phase.k !== "setup" && phase.k !== "end" && (
          <p className="lb-level">
            {mode === "phone" && <strong className="tabular">{angle}°</strong>}
            {zh ? ` 第 ${level + 1} 杆` : ` Bar ${level + 1}`}
          </p>
        )}

        {phase.k === "setup" && (
          <>
            <div className="seg" role="group">
              <button type="button" aria-pressed={mode === "phone"} onClick={() => setMode("phone")}>
                <Smartphone size={15} /> {zh ? "手机测角度" : "Phone measures"}
              </button>
              <button type="button" aria-pressed={mode === "bar"} onClick={() => setMode("bar")}>
                {zh ? "真杆子" : "Real bar"}
              </button>
            </div>
            <p className="hint" style={{ textAlign: "center" }}>
              {mode === "phone" ? (zh ? "手机贴在胸口往后仰，它来判你过没过。" : "Phone on your chest, lean back: it judges whether you made it.") : zh ? "拿根杆子或绳子，手机负责放音乐和记分。" : "Grab a stick or a rope. The phone does the music and the scorecard."}
            </p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void start()}>
              <Play size={18} />
              {zh ? "放音乐，开始" : "Music on, let's go"}
            </button>
          </>
        )}

        {phase.k === "ready" && cur && (
          <div className="pass-curtain">
            <NameFace name={cur.name} size={72} />
            <p className="pass-lead">{zh ? "轮到" : "Up next"}</p>
            <p className="pass-name">{cur.name}</p>
            <p className="hint">{zh ? `手机竖着贴在胸口，屏幕朝自己，往后仰到 ${angle}°` : `Phone upright on your chest, screen facing you. Lean back to ${angle}°.`}</p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setPhase({ k: "count", i: phase.i, n: 3 })}>
              {zh ? "准备好了" : "Ready"}
            </button>
          </div>
        )}

        {phase.k === "count" && <p className="lb-count tabular">{phase.n}</p>}

        {phase.k === "try" && (
          <>
            {sensors === "on" ? (
              <LeanGauge lean={lean.lean} target={angle} hold={lean.hold} />
            ) : (
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => verdict(phase.i, false)}>
                  <X size={18} />
                  {zh ? "没过" : "Missed"}
                </button>
                <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => verdict(phase.i, true)}>
                  <Check size={18} />
                  {zh ? "过了" : "Made it"}
                </button>
              </div>
            )}
            <p className="hint lb-time tabular">{zh ? `还剩 ${left} 秒` : `${left}s left`}</p>
          </>
        )}

        {phase.k === "verdict" && (
          <>
            <p className={`lb-verdict ${phase.ok ? "is-pass" : "is-fail"}`}>{phase.ok ? (zh ? "过了！" : "Under!") : zh ? "没过" : "Didn't make it"}</p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={nextTurn}>
              {phase.i + 1 < alive.length ? (zh ? `下一个：${name[alive[phase.i + 1]]}` : `Next: ${name[alive[phase.i + 1]]}`) : zh ? "这一杆结束" : "End of this bar"}
            </button>
          </>
        )}

        {phase.k === "bar" && (
          <>
            <p className="sup-ask">{zh ? "谁过了？点一下打勾，碰到杆子的打叉" : "Who made it? Tick or cross each one"}</p>
            <ul className="lb-people">
              {alive.map((id) => {
                const st = passed.includes(id) ? "pass" : failed.includes(id) ? "fail" : "try";
                return (
                  <li key={id} className={`lb-person is-${st}`}>
                    <NameFace name={name[id]} size={36} />
                    <span className="lb-person-name">{name[id]}</span>
                    <span className="lb-judge">
                      <button type="button" className={`icon-btn ${st === "fail" ? "is-on" : ""}`} aria-label={zh ? "没过" : "Missed"} onClick={() => (setFailed((f) => [...f.filter((x) => x !== id), id]), setPassed((p) => p.filter((x) => x !== id)))}>
                        <X size={18} />
                      </button>
                      <button type="button" className={`icon-btn ${st === "pass" ? "is-on" : ""}`} aria-label={zh ? "过了" : "Made it"} onClick={() => (setPassed((p) => [...p.filter((x) => x !== id), id]), setFailed((f) => f.filter((x) => x !== id)))}>
                        <Check size={18} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={alive.some((id) => !passed.includes(id) && !failed.includes(id))} onClick={() => settle(failed, passed)}>
              {zh ? "放低横杆" : "Lower the bar"}
            </button>
          </>
        )}

        {phase.k === "end" && (
          <div className="fz-result">
            <p className="fz-result-title">{people.length === 1 ? (zh ? `你过了 ${level} 杆` : `You cleared ${level} bars`) : zh ? "林波之王" : "Limbo champion"}</p>
            {phase.winner && (
              <span className="fz-face is-winner">
                <NameFace name={name[phase.winner]} size={96} />
                <Crown size={22} className="fz-crown" />
                <strong>{name[phase.winner]}</strong>
              </span>
            )}
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setPhase({ k: "setup" })}>
              {zh ? "再来一局" : "Play again"}
            </button>
          </div>
        )}

        {mode === "phone" && (phase.k === "ready" || phase.k === "count" || phase.k === "try" || phase.k === "verdict") && (
          <div className="fz-alive">
            {alive.map((id) => (
              <span key={id} className={failed.includes(id) ? "fz-out" : ""} style={{ display: "inline-grid" }}>
                <NameFace name={name[id]} size={28} />
              </span>
            ))}
          </div>
        )}
      </div>
    </GameShell>
  );
}
