import { Check, Crown, Mic, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { clearConfetti, confetti } from "../../../lib/confetti";
import { Flip, gsap, reduced } from "../../../lib/anim";
import { holdBackground, startGroove, type GrooveId } from "../../../lib/music";
import { sfx } from "../../../lib/sfx";
import type { T } from "../../../i18n";
import type { PunchAnswer, PunchMatch, PunchView } from "../../../shared/protocol";
import { answerAt, RESULT_BEATS } from "../../../shared/punchline";
import { usePenaltyText } from "../../../store";
import { perfAt } from "../../sensors";
import "../../../styles/show.css";

/**
 * Punchline as a show: a late-night comedy club. One component draws every moment of the game
 * (round titles, the writing board, each head-to-head, the final, the score race, the podium)
 * on a TV or on a phone. Every animation counts from the server's phase clock, so all screens
 * in the room land on the same beat, and a screen that joins halfway jumps to the right moment.
 */

export type Who = (pid: string) => { name: string; face: (size: number) => ReactNode };

export type StageProps = {
  v: PunchView;
  who: Who;
  /** server time now */
  now: () => number;
  mode: "tv" | "phone";
  /** this device plays the show's sounds and music */
  sound: boolean;
  lang: "zh" | "en";
  me?: string | null;
  /** a phone with no TV in the room: tap an answer to vote */
  onVote?: (slot: number) => void;
  /** one phone for the whole table: votes are a show of hands, counted on the phone */
  hands?: boolean;
};

const SIDE = ["#e765f0", "#31b9ff"];
const FINAL_COLORS = ["#e765f0", "#31b9ff", "#ffb82e", "#4be38f", "#ff6b5e", "#8c86ff", "#2ed3d9", "#f5df3b"];

type Tx = (zh: string, en: string) => string;
type Canvas = React.RefObject<HTMLCanvasElement | null>;
type SceneProps = StageProps & { tx: Tx };

export function Stage(p: StageProps) {
  const { v, mode, lang } = p;
  const tx: Tx = (zh, en) => (lang === "zh" ? zh : en);
  const canvas = useRef<HTMLCanvasElement>(null);
  useShowMusic(v, p.sound, p.now);
  // the show brings its own soundtrack: the lounge music waits outside
  useEffect(() => (p.sound ? holdBackground() : undefined), [p.sound]);
  useEffect(() => () => clearConfetti(canvas.current), []);
  const m = v.match;

  let scene: ReactNode = null;
  if (v.phase === "write") scene = <WriteScene key={`w${v.round}`} {...p} tx={tx} />;
  else if (m && (v.phase === "present" || v.phase === "vote" || v.phase === "result"))
    scene = m.final ? <FinalScene key={`f${v.round}`} {...p} m={m} tx={tx} canvas={canvas} /> : <MatchScene key={`m${v.round}-${m.k}`} {...p} m={m} tx={tx} canvas={canvas} />;
  else if (v.phase === "scores") scene = <ScoreScene key={`s${v.round}`} {...p} tx={tx} />;
  else if (v.phase === "end") scene = <EndScene key="end" {...p} tx={tx} canvas={canvas} />;

  return (
    <div className={`sh-stage is-${mode}`} data-phase={v.phase}>
      <Backdrop mode={mode} />
      <header className="sh-top">
        <NeonSign lang={lang} />
        <RoundTag v={v} tx={tx} now={p.now} />
      </header>
      <div className="sh-scene">{scene}</div>
      <canvas className="sh-confetti" ref={canvas} aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------ the room */

function Backdrop({ mode }: { mode: "tv" | "phone" }) {
  return (
    <div className="sh-room" aria-hidden="true">
      <div className="sh-bricks" />
      <div className="sh-beam sh-beam-l" />
      <div className="sh-beam sh-beam-r" />
      <div className="sh-pool" />
      {mode === "tv" && (
        <div className="sh-mic">
          <Mic size={150} strokeWidth={1.1} />
        </div>
      )}
      <div className="sh-floor" />
      {mode === "tv" && (
        <div className="sh-crowd">
          {CROWD.map(([x, s, h], i) => (
            <i key={i} style={{ left: `${x}%`, ["--s" as string]: s, ["--h" as string]: h }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The audience in the dark: [left %, size, head tilt]. */
const CROWD: [number, number, string][] = [
  [-2, 1.1, "-4deg"],
  [5, 0.92, "3deg"],
  [11.5, 1.04, "0deg"],
  [18, 0.88, "-6deg"],
  [24.5, 1.12, "2deg"],
  [31, 0.95, "-2deg"],
  [37.5, 1.06, "5deg"],
  [56, 1.02, "-3deg"],
  [62.5, 0.9, "4deg"],
  [69, 1.14, "0deg"],
  [75.5, 0.94, "-5deg"],
  [82, 1.05, "3deg"],
  [88.5, 0.9, "-1deg"],
  [95, 1.1, "4deg"],
];

/** The crowd jumps up when something lands. */
function cheerCrowd(from: Element | null | undefined) {
  const heads = from?.closest(".sh-stage")?.querySelectorAll(".sh-crowd i");
  if (!heads?.length || reduced()) return;
  gsap.fromTo(heads, { y: 0 }, { y: () => -14 - Math.random() * 26, duration: 0.22, ease: "power2.out", yoyo: true, repeat: 5, stagger: { each: 0.03, from: "random" } });
}

function NeonSign({ lang }: { lang: "zh" | "en" }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reduced() || !ref.current) return;
    // the tube warms up with a flicker
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { opacity: 0.15 }, { opacity: 1, duration: 0.06, repeat: 5, yoyo: true, ease: "steps(1)" }).to(ref.current, { opacity: 1, duration: 0.2 });
    return () => {
      tl.kill();
    };
  }, []);
  return (
    <div className="sh-neon" ref={ref}>
      <span className="sh-neon-main">{lang === "zh" ? "神回复" : "PUNCHLINE"}</span>
      <span className="sh-neon-sub">{lang === "zh" ? "PUNCHLINE" : "神回复"}</span>
    </div>
  );
}

function RoundTag({ v, tx, now }: { v: PunchView; tx: Tx; now: () => number }) {
  const timed = v.phase === "write" || v.phase === "vote";
  const left = useCountdown(timed ? v.endsAt : 0, now);
  const final = v.round >= v.rounds;
  const m = v.match;
  return (
    <div className="sh-round">
      <span className="sh-round-name">
        {final ? tx("最后一轮", "Final round") : tx(`第 ${v.round} 轮`, `Round ${v.round}`)}
        {m && !m.final && (v.phase === "present" || v.phase === "vote" || v.phase === "result") && <small className="tabular">{` · ${m.n}/${m.of}`}</small>}
      </span>
      {v.audience.length > 0 && (
        <span className="sh-audience">
          <Users size={16} />
          <span className="tabular">{v.audience.length}</span>
          {tx("位观众", " watching")}
        </span>
      )}
      {timed && left > 0 && (
        <span className={`sh-clock tabular ${left <= 5 ? "is-late" : ""}`} role="timer" aria-label={tx(`还剩 ${left} 秒`, `${left} seconds left`)}>
          {left}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ clocks and timelines */

function useCountdown(endsAt: number, now: () => number) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => bump((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now()) / 1000)) : 0;
}

/**
 * Build a timeline for this phase and start it where the server's clock says we are: a screen
 * that arrives late skips straight to the right moment (its sounds stay quiet). When the phase
 * moves on early (the host skipped ahead), the timeline jumps to its end state first.
 */
function usePhaseTimeline(build: (tl: gsap.core.Timeline, q: (sel: string) => Element[]) => void, root: React.RefObject<HTMLElement | null>, phaseAt: number, now: () => number, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const tl = gsap.timeline({ paused: true });
    build(tl, q);
    const at = () => Math.min(Math.max(0, (now() - phaseAt) / 1000), tl.duration());
    if (reduced()) {
      tl.progress(1, true);
      return () => tl.kill();
    }
    tl.time(at(), true);
    tl.play();
    // stay on the room's clock: a hidden tab or a slow frame lets the animation fall behind,
    // and every screen should land each beat together (skipped beats stay quiet)
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      const want = at();
      if (Math.abs(tl.time() - want) > 0.3) tl.time(want, true);
    };
    const id = window.setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      tl.progress(1, true);
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * True once the room's clock passes `at` (null: not yet asked). A timeline's own callbacks are
 * skipped when it jumps ahead (a late phone, reduced motion), so anything the layout depends on
 * also comes from the clock.
 */
function usePassed(at: number | null, now: () => number) {
  const [, bump] = useState(0);
  const passed = at !== null && now() >= at;
  useEffect(() => {
    if (at === null || passed) return;
    const id = window.setTimeout(() => bump((n) => n + 1), Math.max(0, at - now()) + 250);
    return () => window.clearTimeout(id);
  }, [at, passed, now]);
  return passed;
}

/** A sound at a moment in the timeline, only on the device that plays the show. */
function cue(tl: gsap.core.Timeline, on: boolean, at: number, fn: () => void) {
  if (on) tl.call(fn, [], at);
}

/** A number on screen counting up inside a timeline (also right when the timeline is seeked). */
function countUp(tl: gsap.core.Timeline, el: Element | null | undefined, from: number, to: number, at: number, duration: number) {
  if (!el) return;
  tl.fromTo(el, { textContent: from }, { textContent: to, snap: { textContent: 1 }, duration, ease: "power2.out" }, at);
}

/* ------------------------------------------------------------------ music */

function useShowMusic(v: PunchView, on: boolean, now: () => number) {
  const want: GrooveId | null = !on ? null : v.phase === "write" ? "lounge" : v.phase === "scores" ? "funk" : v.phase === "end" ? "disco" : null;
  const key = want ? `${want}:${v.round}:${v.phaseAt}` : "";
  useEffect(() => {
    if (!want) return;
    // every screen in the room starts on the same downbeat
    const h = startGroove(want, { startPerf: perfAt(v.phaseAt, now()), volume: want === "lounge" ? 0.65 : 0.8 });
    return () => h?.stop(0.8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/* ------------------------------------------------------------------ writing */

function WriteScene({ v, who, now, sound, tx, mode, me, hands }: SceneProps) {
  const root = useRef<HTMLDivElement>(null);
  const final = v.round >= v.rounds;
  usePhaseTimeline(
    (tl, q) => {
      // the round's title card, then the board
      tl.fromTo(q(".sh-title"), { autoAlpha: 1, y: 0 }, { autoAlpha: 1, y: 0, duration: 0.01 }, 0);
      tl.fromTo(q(".sh-title-big"), { scale: 2.6, opacity: 0, filter: "blur(14px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.55, ease: "back.out(1.4)" }, 0.15);
      tl.fromTo(q(".sh-title-sub"), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.65);
      cue(tl, sound, 0.1, () => sfx.showtime());
      tl.to(q(".sh-title"), { autoAlpha: 0, y: -40, duration: 0.45, ease: "power2.in" }, 2.9);
      tl.fromTo(q(".sh-board"), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, 3.0);
      tl.fromTo(q(".sh-writer"), { y: 30, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)", stagger: 0.06 }, 3.15);
    },
    root,
    v.phaseAt,
    now,
    [v.phaseAt],
  );
  const sub = final
    ? tx("所有人写同一题，然后每人选三个最好笑的", "One prompt for everyone. Then everyone picks three favorites.")
    : v.round === 1
      ? tx("每道题两个人写，其他人投票", "Two people answer each prompt. Everyone else votes.")
      : tx("这一轮分数翻倍", "Points double this round");
  return (
    <div className="sh-write" ref={root}>
      <div className="sh-title">
        <div className="sh-title-big">{final ? tx("最后一击", "The last word") : tx(`第 ${v.round} 轮`, `Round ${v.round}`)}</div>
        <div className="sh-title-sub">{sub}</div>
      </div>
      <div className="sh-board">
        <p className="sh-board-lead">
          {mode === "tv" ? tx("拿出手机，写下你的神回复", "Grab your phone and write something funny") : hands ? tx("手机传一圈，轮流偷偷写", "Pass the phone round. Write in secret.") : tx("在下面写答案", "Write your answers below")}
        </p>
        <p className="sh-board-count tabular">{tx(`${v.players.length - v.writing.length}/${v.players.length} 人写完了`, `${v.players.length - v.writing.length} of ${v.players.length} done`)}</p>
        {mode === "tv" && <Fuse endsAt={v.endsAt} phaseAt={v.phaseAt} now={now} />}
        <div className="sh-writers">
          {v.players.map((pid) => {
            const w = who(pid);
            return (
              <Writer key={pid} done={!v.writing.includes(pid)} mine={pid === me} sound={sound} face={w.face(mode === "tv" ? 112 : 40)} name={pid === me ? tx("你", "You") : w.name} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The time left to write, as a burning fuse. */
function Fuse({ endsAt, phaseAt, now }: { endsAt: number; phaseAt: number; now: () => number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const total = Math.max(1, endsAt - phaseAt);
    const left = Math.max(0, endsAt - now());
    const tw = gsap.fromTo(el, { scaleX: left / total }, { scaleX: 0, duration: left / 1000, ease: "none" });
    return () => {
      tw.kill();
    };
  }, [endsAt, phaseAt, now]);
  return (
    <span className="sh-fuse" aria-hidden="true">
      <i ref={ref} />
    </span>
  );
}

function Writer({ done, mine, sound, face, name }: { done: boolean; mine: boolean; sound: boolean; face: ReactNode; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef(done);
  useEffect(() => {
    if (done && !was.current && ref.current) {
      if (sound) sfx.pop();
      const badge = ref.current.querySelector(".sh-done");
      if (badge && !reduced()) gsap.fromTo(badge, { scale: 0, rotate: -40 }, { scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2.6)" });
    }
    was.current = done;
  }, [done, sound]);
  return (
    <div className={`sh-writer ${done ? "is-done" : ""} ${mine ? "is-me" : ""}`} ref={ref}>
      <span className="sh-writer-face">
        {face}
        {done ? (
          <span className="sh-done">
            <Check size={18} strokeWidth={3.2} />
          </span>
        ) : (
          <span className="sh-typing" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </span>
      <span className="sh-writer-name">{name}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ a head-to-head */

function MatchScene({ v, m, who, now, sound, tx, mode, me, lang, onVote, hands, canvas }: SceneProps & { m: PunchMatch; canvas: Canvas }) {
  const root = useRef<HTMLDivElement>(null);
  const shown = v.phase === "result";
  const counts = m.answers.map((a) => a.votes ?? 0);
  const top = Math.max(...counts);
  const winner = shown && top > 0 && counts.filter((c) => c === top).length === 1 ? counts.indexOf(top) : -1;

  usePhaseTimeline(
    (tl, q) => {
      if (v.phase === "present") {
        tl.fromTo(q(".sh-prompt"), { y: -260, rotate: -6, opacity: 0 }, { y: 0, rotate: -1.2, opacity: 1, duration: 0.6, ease: "back.out(1.5)" }, 0.1);
        cue(tl, sound, 0.32, () => sfx.slam(0.9));
        m.answers.forEach((a, i) => {
          const at = answerAt(i, false) / 1000;
          const card = q(`.sh-ans[data-slot="${i}"]`);
          if (mode === "tv") tl.fromTo(card, { x: i === 0 ? -900 : 900, rotate: i === 0 ? -9 : 9, opacity: 0 }, { x: 0, rotate: i === 0 ? -1.5 : 1.5, opacity: 1, duration: 0.5, ease: "power4.out" }, at);
          else tl.fromTo(card, { y: 60, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.6)" }, at);
          tl.fromTo(q(`.sh-ans[data-slot="${i}"] .sh-ans-text`), { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.55, ease: "steps(14)" }, at + 0.18);
          cue(tl, sound, at + 0.1, () => sfx.slam(0.6));
          cue(tl, sound, at + 0.2, () => sfx.type(Math.ceil(a.text.length / 4)));
        });
        const vsAt = answerAt(1, false) / 1000 + 0.55;
        tl.fromTo(q(".sh-vs"), { scale: 3.2, rotate: -30, opacity: 0 }, { scale: 1, rotate: -8, opacity: 1, duration: 0.42, ease: "back.out(2.2)" }, vsAt);
        cue(tl, sound, vsAt + 0.05, () => sfx.versus());
        tl.fromTo(q(".sh-stage-inner"), { x: -10 }, { x: 0, duration: 0.5, ease: "elastic.out(1.4, 0.2)" }, vsAt + 0.08);
      } else if (v.phase === "vote") {
        tl.fromTo(q(".sh-callout"), { scale: 0.4, opacity: 0, rotate: -6 }, { scale: 1, opacity: 1, rotate: -2, duration: 0.45, ease: "back.out(2.4)" }, 0.05);
        cue(tl, sound, 0.05, () => sfx.woodblock(1.3, 0.9));
      } else if (shown) {
        cue(tl, sound, 0, () => sfx.drumroll(RESULT_BEATS.votes / 1000));
        tl.to(q(".sh-ans"), { scale: 1.025, duration: 0.16, yoyo: true, repeat: 7, ease: "sine.inOut" }, 0);
        // votes drop in, alternating sides, each one ticking its card's count
        q(".sh-count").forEach((el) => tl.fromTo(el, { textContent: 0 }, { textContent: 0, duration: 0.001 }, 0));
        const drops: { slot: number; i: number }[] = [];
        const most = Math.max(0, ...m.answers.map((a) => a.voters?.length ?? 0));
        for (let i = 0; i < most; i++) m.answers.forEach((a, slot) => (a.voters?.length ?? 0) > i && drops.push({ slot, i }));
        const gap = Math.min(RESULT_BEATS.voteGap, 1700 / Math.max(1, drops.length)) / 1000;
        drops.forEach(({ slot, i }, n) => {
          const at = RESULT_BEATS.votes / 1000 + n * gap;
          tl.fromTo(q(`.sh-ans[data-slot="${slot}"] .sh-token[data-i="${i}"]`), { y: 140, opacity: 0, scale: 0.3 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, at);
          const count = q(`.sh-ans[data-slot="${slot}"] .sh-count`)[0];
          if (count) {
            tl.set(count, { textContent: i + 1 }, at + 0.15);
            tl.fromTo(count, { scale: 1.6 }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, at + 0.15);
          }
          cue(tl, sound, at + 0.1, () => sfx.vote(n % 6));
        });
        const names = RESULT_BEATS.names / 1000;
        tl.fromTo(q(".sh-by"), { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "back.out(1.8)", stagger: 0.12 }, names);
        cue(tl, sound, names, () => sfx.whoosh(0.3));
        const pts = RESULT_BEATS.points / 1000;
        tl.fromTo(q(".sh-pts"), { scale: 0.3, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: "back.out(2.4)" }, pts);
        q(".sh-pts-n").forEach((el) => countUp(tl, el, 0, Number((el as HTMLElement).dataset.n ?? 0), pts + 0.05, 0.8));
        if (winner >= 0) {
          tl.to(q(`.sh-ans[data-slot="${winner}"]`), { scale: 1.06, duration: 0.5, ease: "back.out(2)" }, pts);
          tl.to(q(`.sh-ans-wrap:not([data-slot="${winner}"])`), { opacity: 0.5, rotate: winner === 0 ? 3 : -3, y: 14, duration: 0.6, ease: "power2.out" }, pts);
        }
        if (m.sweep !== null) {
          const sw = RESULT_BEATS.sweep / 1000;
          tl.to(q(".sh-vs"), { scale: 0.4, opacity: 0, duration: 0.2, ease: "power2.in" }, sw - 0.05);
          tl.fromTo(q(".sh-sweep"), { scale: 3.4, rotate: -24, opacity: 0 }, { scale: 1, rotate: -9, opacity: 1, duration: 0.45, ease: "back.out(2.6)" }, sw);
          tl.fromTo(q(".sh-flash"), { opacity: 0.85 }, { opacity: 0, duration: 0.8, ease: "power2.out" }, sw + 0.05);
          tl.fromTo(q(".sh-stage-inner"), { x: -16 }, { x: 0, duration: 0.7, ease: "elastic.out(1.6, 0.15)" }, sw + 0.05);
          const side = m.sweep;
          tl.call(() => confetti(canvas.current, { x: mode === "tv" ? (side === 0 ? 0.28 : 0.72) : 0.5, y: 0.75, count: mode === "tv" ? 220 : 120, power: mode === "tv" ? 26 : 18 }), [], sw + 0.1);
          cue(tl, sound, sw, () => sfx.stamp(0.9));
          cue(tl, sound, sw + 0.25, () => sfx.cheer(2.4));
          tl.call(() => cheerCrowd(root.current), [], sw + 0.15);
        } else if (winner >= 0) cue(tl, sound, pts + 0.1, () => sfx.rimshot());
        else cue(tl, sound, pts + 0.1, () => sfx.sadTrombone(0.6));
      }
    },
    root,
    v.phaseAt,
    now,
    [v.phase, v.phaseAt],
  );

  const tappable = v.phase === "vote" && m.canVote && !!onVote;
  return (
    <div className="sh-match" ref={root}>
      <div className="sh-stage-inner">
        <Prompt t={m.prompt} lang={lang} />
        <div className="sh-pair">
          {m.answers.map((a, slot) => (
            <Answer
              key={slot}
              slot={slot}
              a={a}
              color={SIDE[slot]}
              mine={m.mine === slot}
              picked={m.myVotes.includes(slot)}
              shown={shown}
              win={winner === slot}
              who={who}
              me={me}
              tx={tx}
              mode={mode}
              onPick={tappable && m.mine !== slot && a.text ? () => onVote!(slot) : undefined}
            />
          ))}
          <div className="sh-mid">
            <div className="sh-vs" aria-hidden="true">
              VS
            </div>
            {shown && m.sweep !== null && <span className="sh-sweep">{tx("神回复！", "PUNCHLINE!")}</span>}
          </div>
        </div>
        {v.phase === "vote" && <VoteCallout m={m} v={v} who={who} tx={tx} mode={mode} sound={sound} hands={hands} />}
        {shown && m.forfeit && <p className="sh-note">{tx("有人交了白卷，另一位不战而胜", "Someone left it blank. The other one wins without a vote.")}</p>}
        {shown && winner < 0 && !m.forfeit && <p className="sh-note">{counts.every((c) => c === 0) ? tx("没人投票", "No votes") : tx("平局！", "A tie!")}</p>}
      </div>
      <div className="sh-flash" aria-hidden="true" />
    </div>
  );
}

function Prompt({ t, lang }: { t: T; lang: "zh" | "en" }) {
  const main = lang === "zh" ? t.zh : t.en;
  const other = lang === "zh" ? t.en : t.zh;
  return (
    <div className="sh-prompt">
      <span className="sh-prompt-main">{main}</span>
      {other !== main && <span className="sh-prompt-other">{other}</span>}
    </div>
  );
}

function Answer({
  slot,
  a,
  color,
  mine,
  picked,
  shown,
  win,
  who,
  me,
  tx,
  mode,
  onPick,
  compact,
}: {
  slot: number;
  a: PunchAnswer;
  color: string;
  mine: boolean;
  picked: boolean;
  shown: boolean;
  win: boolean;
  who: Who;
  me?: string | null;
  tx: Tx;
  mode: "tv" | "phone";
  onPick?: () => void;
  compact?: boolean;
}) {
  const faces = mode === "tv" ? (compact ? 34 : 46) : 24;
  const body = (
    <>
      <span className="sh-ans-letter" aria-hidden="true">
        {String.fromCharCode(65 + slot)}
      </span>
      <span className={`sh-ans-text ${a.text ? "" : "is-blank"}`}>{a.text || tx("（交了白卷）", "(left it blank)")}</span>
      {mine && !shown && <span className="sh-ans-mine">{tx("你写的", "Yours")}</span>}
      {picked && !shown && (
        <span className="sh-ans-picked">
          <Check size={mode === "tv" ? 22 : 14} strokeWidth={3} />
        </span>
      )}
      {shown && (
        <>
          <span className="sh-count tabular" aria-label={tx(`${a.votes ?? 0} 票`, `${a.votes ?? 0} votes`)}>
            {a.votes ?? 0}
          </span>
          <span className="sh-tokens">
            {(a.voters ?? []).map((pid, i) => (
              <span key={pid} className="sh-token" data-i={i}>
                {who(pid).face(faces)}
              </span>
            ))}
          </span>
        </>
      )}
    </>
  );
  const cls = `sh-ans ${picked ? "is-picked" : ""} ${win ? "is-win" : ""} ${mine ? "is-mine" : ""} ${onPick ? "is-tappable" : ""}`;
  const style = { ["--side" as string]: color } as React.CSSProperties;
  return (
    <div className="sh-ans-wrap" data-slot={slot}>
      {onPick ? (
        <button type="button" className={cls} data-slot={slot} style={style} onClick={onPick} aria-pressed={picked}>
          {body}
        </button>
      ) : (
        <div className={cls} data-slot={slot} style={style}>
          {body}
        </div>
      )}
      {shown && a.by && (
        <div className="sh-by" data-slot={slot}>
          {who(a.by).face(mode === "tv" ? (compact ? 40 : 56) : 28)}
          <span className="sh-by-name">{a.by === me ? tx("你", "You") : who(a.by).name}</span>
          {a.safety && <span className="sh-safety">{tx("求救答案 ×½", "Stock answer ×½")}</span>}
          <span className="sh-pts tabular">
            +<span className="sh-pts-n" data-n={a.points ?? 0}>{a.points ?? 0}</span>
          </span>
          {win && (
            <span className="sh-crown" aria-hidden="true">
              <Crown size={mode === "tv" ? 26 : 16} strokeWidth={2.4} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function VoteCallout({ m, v, who, tx, mode, sound, hands }: { m: PunchMatch; v: PunchView; who: Who; tx: Tx; mode: "tv" | "phone"; sound: boolean; hands?: boolean }) {
  if (hands)
    return (
      <div className="sh-callout-row">
        <span className="sh-callout">{m.final ? tx("举手，每人选三个！", "Hands up, three picks each!") : tx("举手投票！", "Hands up!")}</span>
      </div>
    );
  return (
    <div className="sh-callout-row">
      <span className="sh-callout">{m.final ? tx("选三个最好笑的！", "Pick your three favorites!") : tx("投票！", "Vote!")}</span>
      <span className="sh-voted">
        {m.voted.map((pid) => (
          <PopIn key={pid} sound={sound}>
            {who(pid).face(mode === "tv" ? 40 : 22)}
          </PopIn>
        ))}
        <span className="sh-voted-n tabular">
          {m.voted.length}/{m.voters}
        </span>
      </span>
      {mode === "tv" && v.audience.length > 0 && <span className="sh-hint">{tx("观众也在投票", "The audience votes too")}</span>}
    </div>
  );
}

function PopIn({ children, sound }: { children: ReactNode; sound: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (sound) sfx.tap();
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { scale: 0, y: 12 }, { scale: 1, y: 0, duration: 0.4, ease: "back.out(2.6)" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span className="sh-pop" ref={ref}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ the final */

const SORT_AT = 1.1; // seconds after the points land: the answers line up by votes

function FinalScene({ v, m, who, now, sound, tx, mode, me, lang, onVote, hands, canvas }: SceneProps & { m: PunchMatch; canvas: Canvas }) {
  const root = useRef<HTMLDivElement>(null);
  const shown = v.phase === "result";
  const counts = m.answers.map((a) => a.votes ?? 0);
  const top = Math.max(0, ...counts);
  const most = Math.max(0, ...counts);
  const start = RESULT_BEATS.votes / 1000;
  const names = start + most * 0.22 + 0.4;
  const sortAt = names + 0.5 + SORT_AT;
  // the timeline sorts with a Flip on the beat; the clock sorts anyway if that beat was skipped
  const [flipped, setFlipped] = useState(false);
  const sortPassed = usePassed(shown ? v.phaseAt + sortAt * 1000 : null, now);
  const sorted = shown && (flipped || sortPassed);
  const flip = useRef<ReturnType<typeof Flip.getState> | null>(null);

  usePhaseTimeline(
    (tl, q) => {
      if (v.phase === "present") {
        tl.fromTo(q(".sh-prompt"), { y: -220, rotate: -5, opacity: 0 }, { y: 0, rotate: -1, opacity: 1, duration: 0.6, ease: "back.out(1.5)" }, 0.1);
        cue(tl, sound, 0.32, () => sfx.slam(0.9));
        m.answers.forEach((a, i) => {
          const at = answerAt(i, true) / 1000;
          tl.fromTo(q(`.sh-ans[data-slot="${i}"]`), { y: 70, scale: 0.7, opacity: 0, rotate: i % 2 ? 6 : -6 }, { y: 0, scale: 1, opacity: 1, rotate: i % 2 ? 1.2 : -1.2, duration: 0.45, ease: "back.out(1.9)" }, at);
          cue(tl, sound, at + 0.05, () => sfx.type(Math.ceil(a.text.length / 4)));
        });
      } else if (v.phase === "vote") {
        tl.fromTo(q(".sh-callout"), { scale: 0.4, opacity: 0, rotate: -6 }, { scale: 1, opacity: 1, rotate: -2, duration: 0.45, ease: "back.out(2.4)" }, 0.05);
        cue(tl, sound, 0.05, () => sfx.woodblock(1.3, 0.9));
      } else if (shown) {
        cue(tl, sound, 0, () => sfx.drumroll(start));
        q(".sh-count").forEach((el) => tl.fromTo(el, { textContent: 0 }, { textContent: 0, duration: 0.001 }, 0));
        m.answers.forEach((a, slot) => {
          const count = q(`.sh-ans[data-slot="${slot}"] .sh-count`)[0];
          (a.voters ?? []).forEach((_, i) => {
            const at = start + i * 0.22 + slot * 0.03;
            tl.fromTo(q(`.sh-ans[data-slot="${slot}"] .sh-token[data-i="${i}"]`), { y: 80, opacity: 0, scale: 0.3 }, { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.2)" }, at);
            if (count) tl.set(count, { textContent: i + 1 }, at + 0.12);
          });
        });
        for (let i = 0; i < most; i++) cue(tl, sound, start + i * 0.22 + 0.08, () => sfx.vote(i % 6));
        tl.fromTo(q(".sh-by"), { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.8)", stagger: 0.08 }, names);
        tl.fromTo(q(".sh-pts"), { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.4)" }, names + 0.5);
        q(".sh-pts-n").forEach((el) => countUp(tl, el, 0, Number((el as HTMLElement).dataset.n ?? 0), names + 0.55, 0.9));
        tl.call(
          () => {
            if (root.current && !reduced()) flip.current = Flip.getState(root.current.querySelectorAll(".sh-ans-wrap"));
            setFlipped(true);
          },
          [],
          sortAt,
        );
        if (top > 0) {
          tl.call(() => confetti(canvas.current, { x: 0.5, y: 0.8, count: mode === "tv" ? 240 : 120, spread: 100 }), [], sortAt + 0.6);
          tl.call(() => cheerCrowd(root.current), [], sortAt + 0.6);
          cue(tl, sound, sortAt + 0.6, () => sfx.cheer(2.6));
        }
      }
    },
    root,
    v.phaseAt,
    now,
    [v.phase, v.phaseAt],
  );
  useLayoutEffect(() => {
    if (!flip.current || !root.current) return;
    Flip.from(flip.current, { duration: 0.8, ease: "power3.inOut", targets: root.current.querySelectorAll(".sh-ans-wrap") });
    flip.current = null;
  }, [sorted]);

  const order = m.answers.map((_, i) => i);
  if (sorted) order.sort((a, b) => (m.answers[b].votes ?? 0) - (m.answers[a].votes ?? 0));
  const tappable = v.phase === "vote" && m.canVote && !!onVote;
  return (
    <div className="sh-final" ref={root}>
      <div className="sh-stage-inner">
        <Prompt t={m.prompt} lang={lang} />
        <div className={`sh-grid n${m.answers.length}`}>
          {order.map((slot) => {
            const a = m.answers[slot];
            return (
              <Answer
                key={slot}
                slot={slot}
                a={a}
                color={FINAL_COLORS[slot % FINAL_COLORS.length]}
                mine={m.mine === slot}
                picked={m.myVotes.includes(slot)}
                shown={shown}
                win={shown && sorted && top > 0 && (a.votes ?? 0) === top}
                who={who}
                me={me}
                tx={tx}
                mode={mode}
                compact
                onPick={tappable && m.mine !== slot && a.text ? () => onVote!(slot) : undefined}
              />
            );
          })}
        </div>
        {v.phase === "vote" && <VoteCallout m={m} v={v} who={who} tx={tx} mode={mode} sound={sound} hands={hands} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the score race */

const REORDER_AT = 3.0;

function ScoreScene({ v, who, now, sound, tx, mode, me }: SceneProps) {
  const root = useRef<HTMLDivElement>(null);
  const before = v.players.slice().sort((a, b) => (v.before[b] ?? 0) - (v.before[a] ?? 0));
  const after = v.players.slice().sort((a, b) => (v.scores[b] ?? 0) - (v.scores[a] ?? 0));
  const [flipped, setFlipped] = useState(false);
  const reorderPassed = usePassed(v.phaseAt + REORDER_AT * 1000, now);
  const moved = reorderPassed || flipped;
  const max = Math.max(1, ...v.players.map((p) => v.scores[p] ?? 0));
  const flip = useRef<ReturnType<typeof Flip.getState> | null>(null);

  usePhaseTimeline(
    (tl, q) => {
      tl.fromTo(q(".sh-race-title"), { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.8)" }, 0.1);
      tl.fromTo(q(".sh-row"), { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out", stagger: 0.07 }, 0.3);
      q(".sh-row").forEach((row) => {
        const pid = (row as HTMLElement).dataset.pid!;
        const from = v.before[pid] ?? 0;
        const to = v.scores[pid] ?? 0;
        tl.fromTo(row.querySelector(".sh-bar i"), { scaleX: from / max }, { scaleX: to / max, duration: 1.8, ease: "power2.inOut" }, 1.0);
        countUp(tl, row.querySelector(".sh-row-n"), from, to, 1.0, 1.8);
      });
      for (let i = 0; i < 12; i++) cue(tl, sound, 1.0 + i * 0.15, () => sfx.count());
      // then everyone moves to their new place
      tl.call(
        () => {
          if (root.current && !reduced()) flip.current = Flip.getState(root.current.querySelectorAll(".sh-row"));
          setFlipped(true);
        },
        [],
        REORDER_AT,
      );
      cue(tl, sound, REORDER_AT, () => sfx.whoosh(0.4));
      cue(tl, sound, REORDER_AT + 0.6, () => sfx.crown());
      tl.fromTo(q(".sh-race-next"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, REORDER_AT + 1);
    },
    root,
    v.phaseAt,
    now,
    [v.phaseAt],
  );
  useLayoutEffect(() => {
    if (!flip.current || !root.current) return;
    Flip.from(flip.current, { duration: 0.8, ease: "power3.inOut", targets: root.current.querySelectorAll(".sh-row") });
    flip.current = null;
  }, [moved]);

  const order = moved ? after : before;
  const next = v.round + 1 >= v.rounds ? tx("接下来是最后一轮：所有人答同一题，每人选三个", "Next, the final: one prompt for everyone, three picks each") : tx("下一轮分数翻倍", "Points double next round");
  return (
    <div className="sh-race" ref={root}>
      <h2 className="sh-race-title">{tx(`第 ${v.round} 轮结束`, `End of round ${v.round}`)}</h2>
      <ol className="sh-rows">
        {order.map((pid) => {
          const w = who(pid);
          const lead = moved && pid === after[0] && (v.scores[pid] ?? 0) > 0;
          return (
            <li key={pid} className={`sh-row ${pid === me ? "is-me" : ""} ${lead ? "is-lead" : ""}`} data-pid={pid}>
              <span className="sh-row-face">
                {w.face(mode === "tv" ? 54 : 30)}
                {lead && (
                  <span className="sh-row-crown">
                    <Crown size={mode === "tv" ? 20 : 12} strokeWidth={2.6} />
                  </span>
                )}
              </span>
              <span className="sh-row-name">{pid === me ? tx("你", "You") : w.name}</span>
              <span className="sh-bar" aria-hidden="true">
                <i />
              </span>
              <span className="sh-row-n tabular">{v.scores[pid] ?? 0}</span>
            </li>
          );
        })}
      </ol>
      <p className="sh-race-next">{next}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ the podium */

function EndScene({ v, who, now, sound, tx, mode, me, canvas }: SceneProps & { canvas: Canvas }) {
  const root = useRef<HTMLDivElement>(null);
  const custom = usePenaltyText().isCustom;
  const ranked = v.players.slice().sort((a, b) => (v.scores[b] ?? 0) - (v.scores[a] ?? 0));
  const place = (pid: string) => 1 + ranked.filter((p) => (v.scores[p] ?? 0) > (v.scores[pid] ?? 0)).length;
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean) as string[];
  usePhaseTimeline(
    (tl, q) => {
      tl.fromTo(q(".sh-end-title"), { scale: 2.2, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.6, ease: "back.out(1.5)" }, 0.1);
      cue(tl, sound, 0.1, () => sfx.drumroll(1.8));
      tl.fromTo(q(".sh-step"), { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: "power3.out", stagger: 0.12, transformOrigin: "50% 100%" }, 0.5);
      const drops = [
        { sel: '[data-rank="2"] .sh-step-top', at: 1.2 },
        { sel: '[data-rank="1"] .sh-step-top', at: 1.9 },
        { sel: '[data-rank="3"] .sh-step-top', at: 1.5 },
      ];
      for (const d of drops) tl.fromTo(q(d.sel), { y: -380, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "bounce.out" }, d.at);
      tl.call(() => confetti(canvas.current, { x: 0.5, y: 0.6, count: mode === "tv" ? 320 : 160, spread: 120, power: mode === "tv" ? 30 : 20 }), [], 2.1);
      cue(tl, sound, 2.1, () => sfx.win());
      cue(tl, sound, 2.4, () => sfx.cheer(3));
      tl.call(() => cheerCrowd(root.current), [], 2.2);
      tl.fromTo(q(".sh-end-list li, .sh-end-last"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.06 }, 2.6);
    },
    root,
    v.phaseAt,
    now,
    [v.phaseAt],
  );
  return (
    <div className="sh-end" ref={root}>
      <h2 className="sh-end-title">{v.winners && v.winners.length > 1 ? tx("并列冠军！", "A tie at the top!") : tx("今晚的神回复之王", "Tonight's sharpest wit")}</h2>
      <div className="sh-podium">
        {podium.map((pid, i) => {
          const rank = [2, 1, 3][i];
          return (
            <div key={pid} className="sh-place" data-rank={rank}>
              <span className="sh-step-top">
                {place(pid) === 1 && (
                  <span className="sh-step-crown">
                    <Crown size={mode === "tv" ? 44 : 22} strokeWidth={2.2} />
                  </span>
                )}
                {who(pid).face(mode === "tv" ? (rank === 1 ? 128 : 96) : rank === 1 ? 64 : 48)}
                <span className="sh-step-name">{pid === me ? tx("你", "You") : who(pid).name}</span>
                <span className="sh-step-score tabular">{v.scores[pid] ?? 0}</span>
              </span>
              <span className="sh-step">
                <b>{place(pid)}</b>
              </span>
            </div>
          );
        })}
      </div>
      {ranked.length > 3 && (
        <ol className="sh-end-list">
          {ranked.slice(3).map((pid) => (
            <li key={pid} className={v.last?.includes(pid) ? "is-last" : ""}>
              <span className="sh-end-rank tabular">{place(pid)}</span>
              {who(pid).face(mode === "tv" ? 36 : 22)}
              <span className="sh-end-name">{pid === me ? tx("你", "You") : who(pid).name}</span>
              <span className="tabular">{v.scores[pid] ?? 0}</span>
            </li>
          ))}
        </ol>
      )}
      {!!v.last?.length && (
        <p className="sh-end-last">
          {custom
            ? tx(`最后一名：${v.last.map((p) => who(p).name).join("、")}，受罚`, `Last place: ${v.last.map((p) => who(p).name).join(", ")}. Penalty time.`)
            : tx(`最后一名：${v.last.map((p) => who(p).name).join("、")}，喝一杯`, `Last place: ${v.last.map((p) => who(p).name).join(", ")}. Drink up.`)}
        </p>
      )}
    </div>
  );
}
