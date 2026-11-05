import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HEADS_DECKS, type HeadsDeck } from "../../data/postit";
import { DeckPicker } from "./DeckPicker";
import { GameShell, usePenalty } from "../../games/GameShell";
import { GAME_BY_ID } from "../../games/registry";
import type { T } from "../../i18n";
import { shuffle } from "../../lib/random";
import { haptic, sfx } from "../../lib/sfx";
import { usePenaltyText, useStore } from "../../store";
import { Leaderboard, NameFace } from "../common";
import { enableSensors, upOf, useSensorStatus, useTilt, useWakeLock } from "../sensors";
import { HeadsStage } from "./HeadsStage";
import "../../styles/party.css";

type Turn = { word: T; ok: boolean }[];
type Phase = { k: "setup" } | { k: "ready"; i: number } | { k: "count"; i: number; n: number } | { k: "play"; i: number } | { k: "done"; i: number } | { k: "final" };

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
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const people = useMemo(() => (players.length ? players : [{ id: "me", name: zh ? "你" : "You" }]), [players, zh]);
  const [deck, setDeck] = useState<HeadsDeck>(HEADS_DECKS[0]);
  const [seconds, setSeconds] = useState(60);
  const [phase, setPhase] = useState<Phase>({ k: "setup" });
  const [turns, setTurns] = useState<Record<string, Turn>>({});
  const [word, setWord] = useState<T | null>(null);
  const [left, setLeft] = useState(seconds);
  const [flash, setFlash] = useState<"ok" | "pass" | null>(null);
  const pile = useRef<T[]>([]);
  const armed = useRef(false);
  /** a word is being scored: ignore taps and nods until the next one is up */
  const busy = useRef(false);
  const ends = useRef(0);
  const sensors = useSensorStatus();
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  const playing = phase.k === "play";
  // (from the countdown on: the stage turns with the phone while it is being raised)
  const tilt = useTilt((phase.k === "count" || playing) && sensors === "on");
  useWakeLock(phase.k === "count" || playing);

  const draw = () => {
    if (!pile.current.length) pile.current = shuffle(deck.words);
    setWord(pile.current.pop()!);
  };

  const begin = async (i: number) => {
    if (sensors === "off") await enableSensors();
    pile.current = shuffle(deck.words);
    setPhase({ k: "count", i, n: 3 });
  };

  // 3, 2, 1
  useEffect(() => {
    if (phase.k !== "count") return;
    sfx.countdown(phase.n);
    const id = window.setTimeout(() => {
      if (phase.n > 1) setPhase({ ...phase, n: phase.n - 1 });
      else {
        draw();
        // a nod only counts once the phone has been held level on the forehead
        armed.current = false;
        busy.current = false;
        ends.current = performance.now() + seconds * 1000;
        setLeft(seconds);
        setPhase({ k: "play", i: phase.i });
        sfx.gong("small", 0.8);
      }
    }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // the clock
  useEffect(() => {
    if (!playing) return;
    let last = -1;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((ends.current - performance.now()) / 1000));
      setLeft(s);
      if (s !== last && s <= 5 && s > 0) sfx.countdown(s);
      last = s;
      if (s <= 0) {
        window.clearInterval(id);
        sfx.timeUp();
        setPhase({ k: "done", i: phase.i });
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const answer = (ok: boolean) => {
    if (!playing || !word || busy.current) return;
    busy.current = true;
    const id = people[phase.i].id;
    setTurns((t) => ({ ...t, [id]: [...(t[id] ?? []), { word, ok }] }));
    setFlash(ok ? "ok" : "pass");
    if (ok) {
      sfx.correct();
      haptic([12, 30, 12]);
    } else {
      sfx.whoosh(0.3, false);
      haptic(20);
    }
    window.setTimeout(() => {
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
          <div className="pass-curtain">
            <NameFace name={cur.name} size={84} />
            <p className="pass-lead">{zh ? "轮到" : "Up next"}</p>
            <p className="pass-name">{cur.name}</p>
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
            <h2 className="pl-board-title">{zh ? `${cur.name} 猜对 ${myTurn.filter((x) => x.ok).length} 个` : `${cur.name}: ${myTurn.filter((x) => x.ok).length} right`}</h2>
            <ul className="heads-list">
              {myTurn.map((x, i) => (
                <li key={i} className={x.ok ? "is-ok" : ""}>
                  {x.ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}
                  {zh ? x.word.zh : x.word.en}
                  <small>{zh ? x.word.en : x.word.zh}</small>
                </li>
              ))}
            </ul>
          </>
        )}

        {phase.k === "final" && (
          <>
            <h2 className="pl-board-title">{zh ? "结果" : "Results"}</h2>
            <Leaderboard rows={people.map((p) => ({ id: p.id, name: p.name, score: (turns[p.id] ?? []).filter((x) => x.ok).length, face: <NameFace name={p.name} size={40} /> }))} unit={zh ? "个" : ""} />
          </>
        )}
      </div>
    </GameShell>
  );
}
