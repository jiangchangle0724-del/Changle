import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HEADS_DECKS, type HeadsDeck } from "../../data/postit";
import { DeckPicker } from "./DeckPicker";
import { GameShell, usePenalty } from "../../games/GameShell";
import { Resume, useKeepProgress } from "../../games/Resume";
import { GAME_BY_ID } from "../../games/registry";
import type { T } from "../../i18n";
import { shuffle } from "../../lib/random";
import { sfx } from "../../lib/sfx";
import { usePenaltyText, useStore } from "../../store";
import { Leaderboard, NameFace } from "../common";
import { enableSensors, upOf, useSensorStatus, useTilt, useWakeLock } from "../sensors";
import { ART } from "./art";
import { BUZZ, buzz, paper } from "./feel";
import { HeadsStage, type Flash } from "./HeadsStage";
import "./postit.css";
import "../../styles/party.css";

type Turn = { word: T; ok: boolean }[];
type Phase = { k: "setup" } | { k: "ready"; i: number } | { k: "count"; i: number; n: number } | { k: "play"; i: number } | { k: "done"; i: number } | { k: "final" };
type Run = { i: number; pile: T[]; word: T | null; left: number };
type Kept = { deck: string; seconds: number; phase: Phase; turns: Record<string, Turn>; run: Run | null };

/**
 * How far the screen faces the floor (a nod) or the ceiling (tipped back), and how close to upright
 * it has to come back between two: the component of "up" along the screen's own face, so the same
 * held upright or on its side. (Upright, these are the old angles: 50° forward, 55° back, 35°.)
 */
const NOD = 0.77;
const TIP = 0.82;
const LEVEL = 0.57;

/**
 * One phone: the forehead game as Heads Up. Hold the phone to your forehead, screen out, upright or
 * on its side. The table gives clues. Nod down when you get it, tip back to pass.
 */
export function Postit({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="postit" version={1}>
      {(saved) => <PostitGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function PostitGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const people = useMemo(() => (players.length ? players : [{ id: "me", name: zh ? "你" : "You" }]), [players, zh]);
  const [deck, setDeck] = useState<HeadsDeck>(() => HEADS_DECKS.find((d) => d.id === saved?.deck) ?? HEADS_DECKS[0]);
  const [seconds, setSeconds] = useState(saved?.seconds ?? 60);
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? { k: "setup" });
  const [turns, setTurns] = useState<Record<string, Turn>>(saved?.turns ?? {});
  const [word, setWord] = useState<T | null>(null);
  const [left, setLeft] = useState(seconds);
  const [flash, setFlash] = useState<Flash | null>(null);
  const pile = useRef<T[]>(saved?.run?.pile ?? []);
  const resume = useRef<Run | null>(saved?.run ?? null);
  const armed = useRef(false);
  /** a word is being scored: ignore taps and nods until the next one is up */
  const busy = useRef(false);
  /** the next word, due once the scored one has left the pad (cancelled when time runs out first) */
  const next = useRef(0);
  const ends = useRef(0);
  const sensors = useSensorStatus();
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  const playing = phase.k === "play";
  // The forehead and countdown return behind the curtain, with answered words and time kept.
  // During the feedback flash the word was already scored: draw the next one on return. Once
  // time's up is stamped on, the turn is over: it returns at the wall of its notes.
  const over = playing && flash === "time";
  const run: Run | null = over
    ? null
    : playing || phase.k === "count"
      ? { i: phase.i, pile: pile.current, word: playing && !flash ? word : null, left: playing ? left : resume.current?.left ?? seconds }
      : phase.k === "ready" ? resume.current : null;
  const keptPhase: Phase = over ? { k: "done", i: phase.i } : playing || phase.k === "count" ? { k: "ready", i: phase.i } : phase;
  useKeepProgress<Kept>({ deck: deck.id, seconds, phase: keptPhase, turns, run }, phase.k !== "setup" && phase.k !== "final");
  // (from the countdown on: the stage turns with the phone while it is being raised)
  const tilt = useTilt((phase.k === "count" || playing) && sensors === "on");
  useWakeLock(phase.k === "count" || playing);
  // the pictures of the next screens, fetched ahead so they're there when the screen is
  useEffect(() => {
    for (const src of phase.k === "setup" ? [ART.curtain] : playing ? [ART.cheer] : []) new Image().src = src;
  }, [phase.k, playing]);

  const draw = () => {
    if (!pile.current.length) pile.current = shuffle(deck.words);
    setWord(pile.current.pop()!);
  };

  const begin = async (i: number) => {
    if (sensors === "off") await enableSensors();
    if (resume.current?.i !== i) {
      resume.current = null;
      pile.current = shuffle(deck.words);
    }
    setPhase({ k: "count", i, n: 3 });
  };

  // 3, 2, 1
  useEffect(() => {
    if (phase.k !== "count") return;
    sfx.countdown(phase.n);
    buzz(BUZZ.count);
    const id = window.setTimeout(() => {
      if (phase.n > 1) setPhase({ ...phase, n: phase.n - 1 });
      else {
        const kept = resume.current;
        if (kept?.word) setWord(kept.word);
        else draw();
        // a nod only counts once the phone has been held level on the forehead
        armed.current = false;
        busy.current = false;
        const remaining = kept?.left ?? seconds;
        ends.current = performance.now() + remaining * 1000;
        setLeft(remaining);
        resume.current = null;
        setPhase({ k: "play", i: phase.i });
        sfx.gong("small", 0.8);
        buzz(BUZZ.go);
      }
    }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // the clock
  useEffect(() => {
    if (!playing) return;
    let last = -1;
    let after = 0;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((ends.current - performance.now()) / 1000));
      setLeft(s);
      // the last ten seconds tick; the last five louder, and in the hand
      if (s !== last && s <= 10 && s > 0) {
        if (s <= 5) {
          sfx.countdown(s);
          buzz(BUZZ.last);
        } else sfx.clock(s % 2 === 1);
      }
      last = s;
      if (s <= 0) {
        window.clearInterval(id);
        sfx.timeUp();
        buzz(BUZZ.timeUp);
        // time's up is stamped on the note, then the turn's notes go up on the wall. A word scored
        // a moment before has gone from the pad already: no next one, the sheet under it stays blank
        if (busy.current) {
          window.clearTimeout(next.current);
          setWord(null);
        }
        busy.current = true;
        setFlash("time");
        after = window.setTimeout(() => {
          setFlash(null);
          busy.current = false;
          setPhase({ k: "done", i: phase.i });
        }, 900);
      }
    }, 200);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(after);
      window.clearTimeout(next.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const answer = (ok: boolean) => {
    if (!playing || !word || busy.current) return;
    busy.current = true;
    const id = people[phase.i].id;
    setTurns((t) => ({ ...t, [id]: [...(t[id] ?? []), { word, ok }] }));
    setFlash(ok ? "ok" : "pass");
    if (ok) {
      paper.peel();
      sfx.correct();
      buzz(BUZZ.ok);
    } else {
      paper.flick();
      buzz(BUZZ.pass);
    }
    next.current = window.setTimeout(() => {
      busy.current = false;
      setFlash(null);
      draw();
    }, 550);
  };

  // nod down = got it, tip back = pass; come back to upright before the next one counts. Read from
  // which way the screen faces, so it is the same with the phone upright or on its side
  useEffect(() => {
    if (!tilt || !playing || flash) return;
    const z = upOf(tilt.beta, tilt.gamma)[2];
    const down = z < -NOD;
    const back = z > TIP;
    const level = Math.abs(z) < LEVEL;
    if (armed.current && (down || back)) {
      armed.current = false;
      answer(down);
    } else if (!armed.current && level) armed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilt]);

  const finish = () => {
    setPhase({ k: "final" });
    sfx.win();
    buzz(BUZZ.ok);
    const scores = people.map((p) => (turns[p.id] ?? []).filter((x) => x.ok).length);
    const lo = Math.min(...scores);
    if (people.length > 1 && lo < Math.max(...scores)) {
      const losers = people.filter((_, i) => scores[i] === lo).map((p) => p.name);
      window.setTimeout(() => penalty.show({ who: losers, kind: "sip", note: zh ? "猜得最少" : "Fewest right" }), 1200);
    }
  };

  const rules = (
    <p>
      {zh
        ? `轮到的人把手机举到额头上，屏幕朝外，竖着横着都行，词会跟着转正。大家看着屏幕上的词给提示（可以说、可以比划，不能直接说出那个词）。猜对了就低头点一下手机，想跳过就仰头。没有动作感应的话，点屏幕下半边算猜对，上半边跳过。每人一轮，猜得最少的${custom ? "受罚" : "喝"}。`
        : `Whoever's up holds the phone to their forehead, screen facing out, upright or on its side: the word turns to read the right way up. Everyone else gives clues for the word on screen (talk, act it out, just don't say it). Got it? Nod the phone down. Pass? Tip it back. No motion sensor? Tap the lower half of the screen for got it, the upper half to pass. One round each; fewest right ${custom ? "takes the penalty" : "drinks"}.`}
    </p>
  );

  const cur = phase.k !== "setup" && phase.k !== "final" ? people[phase.i] : null;
  const myTurn = cur ? turns[cur.id] ?? [] : [];

  // the turn's notes landing on the wall: a step up the scale for each one got, a soft one for a pass
  const doneOf = phase.k === "done" ? phase.i : -1;
  useEffect(() => {
    if (doneOf < 0) return;
    let got = 0;
    const ids = myTurn.slice(0, 16).map((x, i) => window.setTimeout(() => (x.ok ? paper.land(got++) : paper.land(0, true)), 120 + i * 90));
    return () => ids.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneOf]);

  const actions =
    phase.k === "setup" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => setPhase({ k: "ready", i: 0 })}>
        {zh ? "开始" : "Start"}
      </button>
    ) : phase.k === "ready" && cur ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => void begin(phase.i)}>
        {sensors === "asking" ? (zh ? "正在开启动作感应" : "Turning on motion") : zh ? "举好了，开始" : "Ready, go"}
      </button>
    ) : phase.k === "done" && cur ? (
      phase.i + 1 < people.length ? (
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setPhase({ k: "ready", i: phase.i + 1 })}>
          {zh ? `下一位：${people[phase.i + 1].name}` : `Next: ${people[phase.i + 1].name}`}
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-lg" onClick={finish}>
          {zh ? "看谁猜得最多" : "See who got the most"}
        </button>
      )
    ) : phase.k === "final" ? (
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => {
          setTurns({});
          setPhase({ k: "setup" });
        }}
      >
        {zh ? "换一组词再来" : "Another deck"}
      </button>
    ) : undefined;

  return (
    <GameShell title={GAME_BY_ID.postit.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} roster={{ turn: cur?.id }} actions={actions}>
      <div className="pi">
        {phase.k === "setup" && (
          <>
            <p className="pi-lead">{zh ? "选一组词" : "Pick a deck"}</p>
            <DeckPicker value={deck.id} onPick={(id) => setDeck(HEADS_DECKS.find((d) => d.id === id) ?? HEADS_DECKS[0])} zh={zh} />
            <span className="field-label">{zh ? "每人多久" : "Time each"}</span>
            <div className="seg" role="group">
              {[45, 60, 90].map((s) => (
                <button key={s} type="button" aria-pressed={seconds === s} onClick={() => setSeconds(s)}>
                  {zh ? `${s} 秒` : `${s}s`}
                </button>
              ))}
            </div>
          </>
        )}

        {phase.k === "ready" && cur && (
          <div className="pi-curtain">
            <img className="pi-curtain-art" src={ART.curtain} alt="" width={960} height={640} decoding="async" />
            <p className="pi-curtain-lead">{zh ? "轮到" : "Up next"}</p>
            <p className="pi-curtain-name">{cur.name}</p>
            <div className="heads-how">
              <span className="is-ok">
                <ArrowDown size={16} strokeWidth={2.6} />
                {zh ? "低头：猜对" : "Nod down: got it"}
              </span>
              <span>
                <ArrowUp size={16} strokeWidth={2.6} />
                {zh ? "仰头：跳过" : "Tip back: pass"}
              </span>
            </div>
            <p className="hint">{zh ? "把手机举到额头上，屏幕朝外，竖着横着都行。别偷看。" : "Hold the phone to your forehead, screen out, upright or on its side. No peeking."}</p>
            {sensors === "none" || sensors === "denied" ? <p className="hint">{zh ? "这部手机没有动作感应：点屏幕下半边算猜对，上半边跳过。" : "No motion sensor here: tap the lower half for got it, the upper half to pass."}</p> : null}
          </div>
        )}

        {(phase.k === "count" || phase.k === "play") && (
          <HeadsStage count={phase.k === "count" ? phase.n : null} word={word} zh={zh} left={left} score={myTurn.filter((x) => x.ok).length} flash={flash} tilt={tilt} onAnswer={answer} />
        )}

        {phase.k === "done" && cur && (
          <>
            <h2 className="pi-wall-title">
              {zh ? (
                <>
                  {cur.name} 猜对 <b className="tabular">{myTurn.filter((x) => x.ok).length}</b> 个
                </>
              ) : (
                <>
                  {cur.name}: <b className="tabular">{myTurn.filter((x) => x.ok).length}</b> right
                </>
              )}
            </h2>
            {myTurn.length ? (
              <ul className="pi-wall">
                {myTurn.map((x, i) => (
                  <li key={i} className={`pi-wall-note note ${x.ok ? "is-ok" : "is-pass"}`} style={{ "--i": i } as React.CSSProperties}>
                    <span>{zh ? x.word.zh : x.word.en}</span>
                    {x.word.zh !== x.word.en && <small>{zh ? x.word.en : x.word.zh}</small>}
                    <span className="pi-wall-mark" aria-hidden="true">
                      {x.ok ? <Check size={15} strokeWidth={3.2} /> : <X size={15} strokeWidth={3.2} />}
                    </span>
                    <span className="heads-said">{x.ok ? (zh ? "猜对" : "got it") : zh ? "跳过" : "passed"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pi-wall-empty">{zh ? "这一轮一个都没猜到" : "None this time"}</p>
            )}
          </>
        )}

        {phase.k === "final" && (
          <>
            <img className="pi-cheer" src={ART.cheer} alt="" width={640} height={640} decoding="async" />
            <h2 className="pl-board-title">{zh ? "结果" : "Results"}</h2>
            <Leaderboard rows={people.map((p) => ({ id: p.id, name: p.name, score: (turns[p.id] ?? []).filter((x) => x.ok).length, face: <NameFace name={p.name} size={40} /> }))} unit={zh ? "个" : ""} />
          </>
        )}
      </div>
    </GameShell>
  );
}
