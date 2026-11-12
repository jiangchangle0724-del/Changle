import { Check, Crown, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameShell, usePenalty } from "../../games/GameShell";
import { Resume, useKeepProgress } from "../../games/Resume";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground, startGroove, type GrooveHandle } from "../../lib/music";
import { haptic, sfx } from "../../lib/sfx";
import { BLIND_TARGETS, barFor, barWindowMs, blindError, classicBar, kindFor, limboAngle } from "../../shared/engine/games/limbo";
import type { LimboBar, LimboKind } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { NameFace } from "../common";
import { enableSensors, sensorStatus, useSensorStatus, useWakeLock } from "../sensors";
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
  holdLine,
  phoneClock,
  useBlindLock,
  useFollow,
  useLean,
  usePose,
  variantLine,
  type LimboPick,
} from "./parts";
import "../../styles/party.css";

type Mode = LimboPick;
type Phase = { k: "setup" } | { k: "ready"; i: number } | { k: "count"; i: number; n: number } | { k: "try"; i: number; ends: number; t0: number } | { k: "verdict"; i: number; ok: boolean } | { k: "bar" } | { k: "end"; winner: string | null };
type Pending = { k: "blind" | "level"; stay: string[] } | { k: "retry" } | { k: "end"; winner: string | null };
type Kept = { mode: Mode; level: number; bar: LimboBar; alive: string[]; passed: string[]; failed: string[]; best: Record<string, number>; phase: Phase; target: number; locks: Record<string, number>; pending: Pending | null };

/** The picker's order: the phone-measured ways first, then blind lean, then a real bar. */
const MODES: Mode[] = ["classic", "steady", "moving", "tilt", "party", "blind", "bar"];
const pick = (n: number) => Math.floor(Math.random() * n);

/** One phone: pass it round and let it measure each lean, or run a real bar with music and a scorecard. */
export function Limbo({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="limbo" version={1}>
      {(saved) => <LimboGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function LimboGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  // the dance floor has its own music: the lounge music waits
  useEffect(() => holdBackground(), []);
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const people = useMemo(() => (players.length ? players : [{ id: "me", name: zh ? "你" : "You" }]), [players, zh]);
  const name = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "classic");
  const [level, setLevel] = useState(saved?.level ?? 0);
  /** this bar: classic, or one of the variants (party mode draws a new one each bar) */
  const [bar, setBar] = useState<LimboBar>(() => saved?.bar ?? classicBar());
  const [alive, setAlive] = useState<string[]>(saved?.alive ?? people.map((p) => p.id));
  const [passed, setPassed] = useState<string[]>(saved?.passed ?? []);
  const [failed, setFailed] = useState<string[]>(saved?.failed ?? []);
  /** how far each person leaned at the current bar (the tiebreak when nobody gets under it) */
  const [best, setBest] = useState<Record<string, number>>(saved?.best ?? {});
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? { k: "setup" });
  const [left, setLeft] = useState(15);
  /** blind lean: this round's target and the angle each person locked */
  const [target, setTarget] = useState(saved?.target ?? BLIND_TARGETS[0]);
  const [locks, setLocks] = useState<Record<string, number>>(saved?.locks ?? {});
  const [pending, setPending] = useState<Pending | null>(saved?.pending ?? null);
  const [note, setNote] = useState("");
  const blind = mode === "blind";
  const realBar = mode === "bar";
  const kind: LimboKind = blind || realBar ? "classic" : bar.kind;
  const moving = kind === "moving";
  const sensors = useSensorStatus();
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  // No sensor reading or countdown survives: the same person gets ready for the same bar.
  useKeepProgress<Kept>({ mode, level, bar, alive, passed, failed, best, phase: phase.k === "count" || phase.k === "try" ? { k: "ready", i: phase.i } : phase, target, locks, pending }, phase.k !== "setup" && phase.k !== "end");
  const music = useRef<GrooveHandle | null>(null);
  const angle = blind ? target : limboAngle(level);
  const newTarget = () => {
    const choices = BLIND_TARGETS.filter((a) => a !== target);
    setTarget(choices[Math.floor(Math.random() * choices.length)]);
    setLocks({});
  };
  /** the bar at this level: the mode's variant, or in party mode a random one (never `last` again) */
  const makeBar = (lvl: number, last: LimboKind | null) => (mode === "bar" || mode === "blind" ? classicBar() : barFor(kindFor(mode, last, pick), lvl, pick));
  useWakeLock(phase.k === "try" || phase.k === "count" || phase.k === "bar");

  useEffect(() => () => music.current?.stop(0.2), []);
  /** the music's grid, so the coach's cues land on it */
  const grid = useRef<Grid | null>(null);
  const playMusic = () => {
    if (!music.current) music.current = startGroove("calypso");
    grid.current = music.current ? { originPerf: music.current.startedPerf, beatMs: music.current.beatMs } : null;
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
        // a moving bar's turn lasts until it stops; the others get the bar's time
        const ms = moving ? bar.moveMs : barWindowMs(bar);
        const t0 = performance.now();
        setLeft(Math.ceil(ms / 1000));
        setPhase({ k: "try", i: phase.i, ends: t0 + ms, t0 });
      }
    }, 850);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // the clock for one attempt
  useEffect(() => {
    if (phase.k !== "try") return;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((phase.ends - performance.now()) / 1000));
      setLeft(s);
      if (s <= 0) {
        if (blind) {
          // still not steady: lock where you are, or count as no lock at all
          if (!blindLockRef.current()) blindVerdict(phase.i, undefined);
          return;
        }
        // a moving bar ends when it stops: the phone says how it went, or without a sensor the table does
        if (!moving) verdict(phase.i, false);
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const trying = !blind && phase.k === "try" && sensors === "on";
  const onPass = (deg: number) => {
    if (phase.k === "try") verdict(phase.i, true, deg);
  };
  const lean = useLean(trying && kind === "classic", angle, onPass);
  const pose = usePose(trying && (kind === "steady" || kind === "tilt"), { target: angle, side: kind === "tilt" ? bar.side : 0, holdMs: kind === "steady" ? bar.hold : HOLD_MS, still: kind === "steady" }, onPass);
  const follow = useFollow(trying && moving, angle, bar, phase.k === "try" ? phase.t0 : 0, phoneClock, (kept, deg) => {
    if (phase.k === "try") verdict(phase.i, kept, deg);
  });
  // the attempt clock reads this when time runs out, long after it captured `verdict`
  const leanBest = useRef(0);
  leanBest.current = kind === "classic" ? lean.best : moving ? follow.best : pose.best;
  // the phone is on their chest: it says what the gauge shows
  useCoach(
    trying,
    !trying
      ? QUIET
      : kind === "classic"
        ? coaching("classic", { lean: lean.lean, target: angle, hold: lean.hold })
        : moving
          ? coaching("moving", { lean: follow.lean, target: follow.at, lost: follow.lost })
          : coaching(kind, { lean: pose.lean, target: angle, hold: pose.hold, side: pose.side, want: kind === "tilt" ? bar.side : 0, wobbleAt: pose.wobbleAt }),
    grid,
  );

  const leaningBlind = blind && phase.k === "try" && sensors === "on";
  const blindLock = useBlindLock(leaningBlind, (deg) => {
    if (phase.k === "try") blindVerdict(phase.i, deg);
  });
  const blindLockRef = useRef(blindLock.lockNow);
  blindLockRef.current = blindLock.lockNow;

  const blindVerdict = (i: number, deg: number | undefined) => {
    const id = alive[i];
    if (!id) return;
    if (deg !== undefined) setLocks((l) => ({ ...l, [id]: deg }));
    const off = blindError(deg, target);
    if (off <= 3) {
      sfx.correct();
      haptic([12, 30, 12]);
    } else if (off >= 12) sfx.sadTrombone(0.5);
    else sfx.drum(0.5);
    setPhase({ k: "verdict", i, ok: off <= 3 });
  };

  const verdict = (i: number, ok: boolean, deg?: number) => {
    const id = alive[i];
    if (!id) return;
    if (ok) {
      setPassed((p) => [...p, id]);
      setBest((b) => ({ ...b, [id]: deg || angle }));
      sfx.correct();
      haptic([12, 30, 12]);
    } else {
      setFailed((f) => [...f, id]);
      setBest((b) => ({ ...b, [id]: deg ?? Math.round(leanBest.current) }));
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
    if (blind) settleBlind();
    else settle(failed, passed);
  };

  /** Blind lean, everyone has gone: furthest from the target is out and drinks. */
  const settleBlind = () => {
    const off = (id: string) => blindError(locks[id], target);
    const worst = Math.max(...alive.map(off));
    const losers = alive.filter((id) => off(id) === worst);
    const tie = losers.length === alive.length;
    const stay = tie ? alive : alive.filter((id) => !losers.includes(id));
    const after = () => {
      if (stay.length <= 1) return finish(stay[0] ?? null);
      setAlive(stay);
      setLevel((l) => l + 1);
      newTarget();
      sfx.drum(0.8);
      setPhase({ k: "ready", i: 0 });
    };
    setPending(stay.length <= 1 ? { k: "end", winner: stay[0] ?? null } : { k: "blind", stay });
    penalty.show(
      {
        who: losers.map((id) => name[id]),
        kind: "sip",
        note: tie
          ? custom
            ? zh
              ? `大家差得一样多（${worst}°），一起受罚，再来一轮`
              : `All ${worst}° off: everyone takes the penalty, another round`
            : zh
              ? `大家差得一样多（${worst}°），一起喝，再来一轮`
              : `All ${worst}° off: everyone drinks, another round`
          : zh
            ? `盲仰差了 ${worst}°`
            : `Blind lean: ${worst}° off`,
      },
      () => { setPending(null); after(); },
    );
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
    if (drinkers.length && !solo) {
      setPending(again ? { k: "retry" } : stay.length <= 1 ? { k: "end", winner: stay[0] ?? deepest } : { k: "level", stay });
      penalty.show({ who: drinkers.map((id) => name[id]), kind: "sip", note: again ? (zh ? `${angle}° 谁都没过，再来一次` : `Nobody made ${angle}°. Try it again`) : zh ? `${angle}° 没过去` : `Missed the ${angle}° bar` }, () => { setPending(null); after(); });
    }
    else after();
  };

  const retryBar = () => {
    setPassed([]);
    setFailed([]);
    setBest({});
    setPhase(realBar ? { k: "bar" } : { k: "ready", i: 0 });
  };

  const nextLevel = (stay: string[]) => {
    setAlive(stay);
    setPassed([]);
    setFailed([]);
    setBest({});
    setLevel(level + 1);
    setBar(makeBar(level + 1, bar.kind));
    sfx.drum(0.8);
    setPhase(realBar ? { k: "bar" } : { k: "ready", i: 0 });
  };

  const finish = (winner: string | null) => {
    stopMusic();
    sfx.win();
    setPhase({ k: "end", winner });
  };

  const start = async () => {
    setNote("");
    if (blind) {
      // nobody can judge degrees by eye: blind lean needs this phone's motion sensor
      if (sensorStatus() !== "on" && !(await enableSensors())) {
        setNote(zh ? "这部手机测不了角度，玩不了盲仰。可以玩别的玩法，或者用真杆子。" : "This phone can't measure angles, so blind lean won't work. Try another way, or a real bar.");
        return;
      }
      newTarget();
    }
    setBar(makeBar(0, null));
    setAlive(people.map((p) => p.id));
    setPassed([]);
    setFailed([]);
    setBest({});
    setLevel(0);
    playMusic();
    if (!realBar) {
      if (sensors === "off") await enableSensors();
      setPhase({ k: "ready", i: 0 });
    } else setPhase({ k: "bar" });
  };

  // A stamp already counted its penalty. Finish only its pending transition on return.
  const continued = useRef(false);
  useEffect(() => {
    if (!saved?.pending || continued.current) return;
    continued.current = true;
    setPending(null);
    const p = saved.pending;
    if (p.k === "end") finish(p.winner);
    else if (p.k === "retry") retryBar();
    else if (p.k === "level") nextLevel(p.stay);
    else {
      setAlive(p.stay);
      setLevel((l) => l + 1);
      newTarget();
      setPhase({ k: "ready", i: 0 });
    }
    // The restored stamp is consumed once, including StrictMode's effect replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drink = custom ? (zh ? "受罚" : "penalty") : zh ? "喝一口" : "drink";
  const rules = (
    <>
      <p>
        {zh
          ? `经典：手机竖着贴在胸前，屏幕朝外，背面贴着胸口，往后仰到横杆的角度并坚持一秒多就算过，手机传给下一个人。每一杆要仰得更多，没过的出局${drink}，最后剩下的人赢。测不了角度的手机，大家看着判。`
          : `Classic: hold the phone upright against your chest, screen facing out and its back against you, lean back to the bar's angle and hold it for a second, then pass the phone on. Every bar needs a deeper lean. Miss and you're out (${drink}). Last one standing wins. If the phone can't measure, the table judges.`}
      </p>
      <p>
        {zh
          ? "手机在胸前看不见屏幕，靠听：两个音往下掉是再往后仰，往上走是回来一点，嗒嗒声是到位了（跟着动的杆：跟住了），连着三下短响是再往旁边歪，撑住的时候嗡声往上升，升到头就过，低低一响是晃了。你离横杆远的时候音乐也会变小。盲仰什么都不提示。"
          : "The phone is on your chest, so you play by ear: two notes falling mean lean back more, rising means come up a bit, a tick means you're there (with a moving bar: with it), three quick clicks mean tilt further, and while you hold, a hum climbs until you're through; a low buzz means you moved. The music drops while you're off the bar. Blind lean says nothing."}
      </p>
      <p>
        {zh
          ? "稳住：仰到位以后要一动不动撑住，一晃就重来，每杆要撑的时间更长。跟着动的杆：横杆上下浮动，要跟着它仰下去又回来，跟丢超过 1 秒就出局。歪着过：除了往后仰，还要往左或往右歪到指定角度，每杆方向随机。派对：每杆随机一种。测不了角度的手机，这几种也是大家看着判。"
          : "Hold steady: reach the bar, then hold dead still. Any wobble starts the hold again, and each bar is a longer hold. Moving bar: the bar floats up and down; follow it down and back up, and lose it for over a second and you're out. Tilt through: lean back and also tilt left or right to the angle shown; the side is random each bar. Party: each bar is one of these or classic, at random. If the phone can't measure, the table judges these too."}
      </p>
      <p>
        {zh
          ? `盲仰：每轮一个目标角度，看不到自己仰了多少，凭感觉仰到位，停住不动一秒半就锁定，轮流来，离目标最远的出局${drink}。要用这部手机的动作感应。`
          : `Blind lean: each round has a target angle and you can't see your own lean; lean to what feels right and hold still for a second and a half to lock it, taking turns. Furthest from the target is out (${drink}). It needs this phone's motion sensing.`}
      </p>
      <p>{zh ? "真杆子：两个人拉一根杆子或绳子，手机放音乐、记分，裁判点谁过了谁没过。" : "Real bar: two people hold a stick or a rope, the phone plays the music and keeps score, and the judge taps who made it."}</p>
    </>
  );

  const hint =
    mode === "classic"
      ? zh ? "手机贴在胸口往后仰，它来判你过没过。" : "Phone on your chest, lean back: it judges whether you made it."
      : blind
        ? zh ? `每轮一个目标角度，看不到自己仰了多少，凭感觉停住。离得最远的出局${custom ? "受罚" : "喝一口"}。` : `A target angle each round, and you can't see your own lean: stop where it feels right. Furthest off is out and ${custom ? "takes the penalty" : "drinks"}.`
        : realBar
          ? zh ? "拿根杆子或绳子，手机负责放音乐和记分。" : "Grab a stick or a rope. The phone does the music and the scorecard."
          : variantLine(mode, zh);
  const tag = blind || realBar ? "" : barTag(bar, zh, mode === "party");
  // a moving bar sways while someone follows it, and waits at its top otherwise
  const sway = moving ? { bar, startAt: phase.k === "try" ? phase.t0 : Number.MAX_SAFE_INTEGER, clock: phoneClock } : undefined;

  const actions =
    phase.k === "setup" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => void start()}>
        <Play size={18} />
        {zh ? "放音乐，开始" : "Music on, let's go"}
      </button>
    ) : phase.k === "ready" && cur ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => { playMusic(); setPhase({ k: "count", i: phase.i, n: 3 }); }}>
        {zh ? "准备好了" : "Ready"}
      </button>
    ) : phase.k === "try" && !blind && sensors !== "on" ? (
      <>
        <button type="button" className="btn btn-ghost btn-lg" onClick={() => verdict(phase.i, false)}>
          <X size={18} />
          {moving ? (zh ? "跟丢了" : "Lost it") : zh ? "没过" : "Missed"}
        </button>
        <button type="button" className="btn btn-primary btn-lg" disabled={moving && left > 0} onClick={() => verdict(phase.i, true)}>
          <Check size={18} />
          {moving ? (zh ? "跟住了" : "Kept up") : zh ? "过了" : "Made it"}
        </button>
      </>
    ) : phase.k === "verdict" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={nextTurn}>
        {phase.i + 1 < alive.length ? (zh ? `下一个：${name[alive[phase.i + 1]]}` : `Next: ${name[alive[phase.i + 1]]}`) : blind ? (zh ? "看看谁差得最远" : "Who was furthest off?") : zh ? "这一杆结束" : "End of this bar"}
      </button>
    ) : phase.k === "bar" ? (
      <button type="button" className="btn btn-primary btn-lg" disabled={alive.some((id) => !passed.includes(id) && !failed.includes(id))} onClick={() => settle(failed, passed)}>
        {zh ? "放低横杆" : "Lower the bar"}
      </button>
    ) : phase.k === "end" ? (
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => {
          setBar(classicBar());
          setLevel(0);
          setPhase({ k: "setup" });
        }}
      >
        {zh ? "再来一局" : "Play again"}
      </button>
    ) : undefined;

  return (
    <GameShell title={GAME_BY_ID.limbo.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} roster={{ turn: cur?.id, out: phase.k === "setup" ? [] : phase.k === "end" && phase.winner ? people.filter((p) => p.id !== phase.winner).map((p) => p.id) : people.filter((p) => !alive.includes(p.id) || (!blind && failed.includes(p.id))).map((p) => p.id) }} status={phase.k !== "setup" ? { kind: "round", current: level + 1 } : undefined} actions={actions}>
      <div className="lb">
        {phase.k !== "end" && <LimboScene angle={angle} level={level} side={kind === "tilt" ? bar.side : 0} sway={sway} />}
        {phase.k !== "setup" && phase.k !== "end" && (
          <p className="lb-level">
            {!blind && !realBar && <strong className="tabular">{angle}°</strong>}
            {blind ? (zh ? ` 盲仰第 ${level + 1} 轮` : ` Blind round ${level + 1}`) : zh ? ` 第 ${level + 1} 杆` : ` Bar ${level + 1}`}
            {tag && <span className="lb-tag">{tag}</span>}
          </p>
        )}

        {phase.k === "setup" && (
          <>
            <ModePicker modes={MODES} value={mode} off={people.length < 2 ? ["blind"] : []} onPick={setMode} />
            <p className="hint" style={{ textAlign: "center" }}>
              {hint}
            </p>
            {people.length < 2 && <p className="hint" style={{ textAlign: "center" }}>{zh ? "盲仰要两个人以上" : "Blind lean needs two or more players"}</p>}
            {note && <p className="hint" role="alert" style={{ textAlign: "center" }}>{note}</p>}
          </>
        )}

        {phase.k === "ready" && cur && (
          <div className="pass-curtain">
            <NameFace name={cur.name} size={72} />
            <p className="pass-lead">{zh ? "轮到" : "Up next"}</p>
            <p className="pass-name">{cur.name}</p>
            <p className="hint">
              {blind
                ? holdLine(zh) + (zh ? `凭感觉仰到 ${angle}°，停住不动就锁定。看不到自己的角度，也没有提示音。` : `Lean to what feels like ${angle}° and hold still to lock it. You won't see your angle, and the phone says nothing.`)
                : barHow(bar, angle, zh, sensors === "on")}
            </p>
          </div>
        )}

        {phase.k === "count" && <p className="lb-count tabular">{phase.n}</p>}

        {phase.k === "try" && (
          <>
            {blind ? (
              <BlindMeter target={angle} steady={blindLock.steady} locked={false} />
            ) : sensors === "on" ? (
              kind === "steady" ? (
                <SteadyMeter target={angle} holdMs={bar.hold} pose={pose} />
              ) : kind === "tilt" ? (
                <TiltMeter target={angle} side={bar.side} pose={pose} />
              ) : moving ? (
                <FollowMeter follow={follow} />
              ) : (
                <LeanGauge lean={lean.lean} target={angle} hold={lean.hold} />
              )
            ) : null}
            <p className="hint lb-time tabular">{moving && left <= 0 ? (zh ? "横杆停了，跟住了吗？" : "The bar stopped. Did they keep up?") : zh ? `还剩 ${left} 秒` : `${left}s left`}</p>
          </>
        )}

        {phase.k === "verdict" && (
          <>
            {blind ? (
              <>
                <p className={`lb-verdict ${phase.ok ? "is-pass" : "is-fail"}`}>{blindLine(zh, locks[alive[phase.i]], target)}</p>
                <p className="hint" style={{ textAlign: "center" }}>{zh ? `目标 ${target}°` : `Target ${target}°`}</p>
              </>
            ) : (
              <p className={`lb-verdict ${phase.ok ? "is-pass" : "is-fail"}`}>
                {moving ? (phase.ok ? (zh ? "跟住了" : "Kept up") : zh ? "跟丢了" : "Lost it") : phase.ok ? (zh ? "过了" : "Under") : zh ? "没过" : "Didn't make it"}
              </p>
            )}
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
          </>
        )}

        {phase.k === "end" && (
          <div className="fz-result">
            <p className="fz-result-title">{people.length === 1 ? (zh ? `你过了 ${level} 杆` : `You cleared ${level} bars`) : blind ? (zh ? "最有手感的人" : "The best feel for angles") : zh ? "林波之王" : "Limbo champion"}</p>
            {phase.winner && (
              <span className="fz-face is-winner">
                <NameFace name={name[phase.winner]} size={96} />
                <Crown size={22} className="fz-crown" />
                <strong>{name[phase.winner]}</strong>
              </span>
            )}
          </div>
        )}

        {!realBar && (phase.k === "ready" || phase.k === "count" || phase.k === "try" || phase.k === "verdict") && (
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
