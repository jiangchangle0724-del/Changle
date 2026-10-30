import { Check, Disc3, Eye, Music, Play, Radio, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TUNES } from "../../data/tunes";
import { GameShell, usePenalty } from "../../games/GameShell";
import { GAME_BY_ID } from "../../games/registry";
import { AV_COLORS, colorFor } from "../../account/Avatar";
import { holdBackground, type TuneHandle } from "../../lib/music";
import { heardSongs, loadPreview, rememberSong, type PreviewHandle } from "../../lib/preview";
import { shuffle } from "../../lib/random";
import { haptic, sfx } from "../../lib/sfx";
import { cardOf, pickSong, previewUrl, type Song, type SongPool } from "../../shared/songs";
import { useStore } from "../../store";
import { Leaderboard, NameFace } from "../common";
import { clipSeconds, CoverLabel, playClip, PoolPicker, SongReveal, SongStatus, StageDots, startSong, TuneTitle, useSongAudio, Vinyl } from "./parts";
import { loadSongbook } from "./songbook";
import "../../styles/party.css";

type Mode = "songs" | "melody" | "pads";

/**
 * One phone. Melody mode: it plays the tune a few notes at a time, the table shouts, you tap
 * who got it. Buzzer mode: lay the phone flat in the middle; everyone gets a pad, first touch wins,
 * and the DJ plays songs from their own music app.
 */
export function Tune({ onBack }: { onBack: () => void }) {
  const { players, lang } = useStore();
  const zh = lang === "zh";
  const people = useMemo(() => (players.length ? players : [{ id: "me", name: zh ? "你" : "You" }]), [players, zh]);
  const [mode, setMode] = useState<Mode>("songs");
  const [pool, setPool] = useState<SongPool>("mix");
  const [total, setTotal] = useState(8);
  const [phase, setPhase] = useState<"setup" | "play" | "end">("setup");
  const [scores, setScores] = useState<Record<string, number>>({});
  const penalty = usePenalty();

  // the buzzer board has room for eight
  const ranked = mode === "pads" ? people.slice(0, 8) : people;
  const finish = (final: Record<string, number>) => {
    setPhase("end");
    sfx.win();
    if (ranked.length < 2) return;
    const vals = ranked.map((p) => final[p.id] ?? 0);
    const lo = Math.min(...vals);
    if (lo < Math.max(...vals)) {
      const losers = ranked.filter((p) => (final[p.id] ?? 0) === lo).map((p) => p.name);
      window.setTimeout(() => penalty.show({ who: losers, kind: "two", note: zh ? "猜歌名：最后一名" : "Name That Tune: last place" }), 1200);
    }
  };

  const rules = (
    <p>
      {zh
        ? "真歌：手机放一首真歌的 30 秒试听（华语、英文或者混着来），大家抢着喊歌名，越早喊对分越高：前 8 秒 3 分，18 秒前 2 分，之后 1 分。揭晓以后点谁先喊对，还能去 Apple Music 听完整版。旋律：手机放经典旋律，先放几个音，没人猜到就多放，不用联网也能玩。抢答器：手机平放在桌子中间，每人一个按钮，有人用自己的音乐 App 当 DJ 放歌，谁先按谁回答，对了加一分，错了喝一口。最后得分最低的喝两口。"
        : "Real songs: the phone plays a 30-second preview of a real song (Chinese, English or both); everyone shouts the title. The sooner, the more it's worth: 3 points in the first 8 seconds, 2 before 18, then 1. After the reveal, tap who said it first, and open the full song on Apple Music. Melody: the phone plays a classic tune a few notes at a time, no internet needed. Buzzers: lay the phone flat in the middle, everyone gets a pad, someone plays DJ from their own music app. First touch answers: right is a point, wrong is a sip. Lowest score drinks two."}
    </p>
  );

  return (
    <GameShell title={GAME_BY_ID.tune.name} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <div className="tn">
        {phase === "setup" && (
          <>
            <Vinyl spinning={false} label={<Music size={30} strokeWidth={2.4} />} />
            <div className="seg" role="group">
              <button type="button" aria-pressed={mode === "songs"} onClick={() => setMode("songs")}>
                <Radio size={15} /> {zh ? "真歌" : "Real songs"}
              </button>
              <button type="button" aria-pressed={mode === "melody"} onClick={() => setMode("melody")}>
                <Music size={15} /> {zh ? "旋律" : "Melody"}
              </button>
              <button type="button" aria-pressed={mode === "pads"} onClick={() => setMode("pads")}>
                <Disc3 size={15} /> {zh ? "抢答器" : "Buzzers"}
              </button>
            </div>
            {mode === "songs" && <PoolPicker pool={pool} onPick={setPool} />}
            {mode !== "pads" ? (
              <div className="seg seg-sm" role="group" style={{ alignSelf: "center" }}>
                {[5, 8, 12, 20].map((n) => (
                  <button key={n} type="button" aria-pressed={total === n} onClick={() => setTotal(n)}>
                    {zh ? `${n} 首` : `${n} songs`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint" style={{ textAlign: "center" }}>
                {zh ? "把手机平放在桌子中间，DJ 用自己的音乐 App 放歌。" : "Lay the phone flat in the middle. The DJ plays songs from their own music app."}
                {people.length > 8 && (zh ? " 抢答器最多 8 个按钮，名单前 8 位参加。" : " The board has eight pads: the first eight names play.")}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={() => {
                setScores({});
                setPhase("play");
              }}
            >
              <Play size={18} />
              {zh ? "开始" : "Start"}
            </button>
          </>
        )}

        {phase === "play" && mode === "songs" && <SongRounds total={total} pool={pool} people={people} scores={scores} setScores={setScores} onEnd={finish} onOffline={() => setMode("melody")} />}
        {phase === "play" && mode === "melody" && <MelodyRounds total={total} people={people} scores={scores} setScores={setScores} onEnd={finish} />}
        {phase === "play" && mode === "pads" && <Pads people={people} scores={scores} setScores={setScores} onEnd={() => finish(scores)} onWrong={(name) => penalty.show({ who: [name], kind: "sip", note: zh ? "抢答错了" : "Wrong answer" })} />}

        {phase === "end" && (
          <>
            <h2 className="pl-board-title">{zh ? "最终得分" : "Final scores"}</h2>
            <Leaderboard rows={ranked.map((p) => ({ id: p.id, name: p.name, score: scores[p.id] ?? 0, face: <NameFace name={p.name} size={40} /> }))} />
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setPhase("setup")}>
              {zh ? "再来一局" : "Play again"}
            </button>
          </>
        )}
      </div>
    </GameShell>
  );
}

/** Real songs on one phone: the preview plays, the table shouts, you reveal and tap who got it. */
function SongRounds({
  total,
  pool,
  people,
  scores,
  setScores,
  onEnd,
  onOffline,
}: {
  total: number;
  pool: SongPool;
  people: { id: string; name: string }[];
  scores: Record<string, number>;
  setScores: (s: Record<string, number>) => void;
  onEnd: (final: Record<string, number>) => void;
  onOffline: () => void;
}) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [book, setBook] = useState<Song[] | null>(null);
  const [failed, setFailed] = useState(false);
  const played = useRef(new Set<number>());
  const avoid = useRef(new Set(heardSongs()));
  const [round, setRound] = useState(1);
  const [song, setSong] = useState<Song | null>(null);
  const [next, setNext] = useState<Song | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [revealedAt, setRevealedAt] = useState(0);
  const [stage, setStage] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const handle = useRef<PreviewHandle | null>(null);

  useEffect(() => holdBackground(), []);
  useEffect(() => {
    loadSongbook().then(setBook, () => setFailed(true));
  }, []);

  const pick = (list: Song[], also: number[] = []) => pickSong(list, pool, avoid.current, new Set([...played.current, ...also]), Math.random);

  // the first song (and the one after it, so it can load early) once the list is in
  useEffect(() => {
    if (!book || song) return;
    const first = pick(book);
    if (!first) return setFailed(true);
    played.current.add(first.id);
    setSong(first);
    setNext(pick(book, [first.id]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);
  useEffect(() => {
    if (next) void loadPreview(previewUrl(next.p));
  }, [next]);

  const audio = useSongAudio(song ? previewUrl(song.p) : null);
  const canPlay = audio.status === "ready" || audio.status === "failed";

  const play = (from: number) => {
    handle.current?.stop(0.1);
    handle.current = startSong(audio, { offset: from, fadeIn: from ? 0.2 : 0.05 });
  };
  // the song starts as soon as it has loaded; the points clock starts with it
  useEffect(() => {
    if (!canPlay || revealed) return;
    play(0);
    setStartedAt(performance.now());
    return () => handle.current?.stop(0.12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, audio.url]);
  useEffect(() => () => handle.current?.stop(0.1), []);
  useEffect(() => {
    if (startedAt === null || revealed) return;
    const tick = () => {
      const t = performance.now() - startedAt;
      setStage(t < 8000 ? 0 : t < 18_000 ? 1 : 2);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [startedAt, revealed]);

  if (failed)
    return (
      <>
        <p className="hint" style={{ textAlign: "center" }}>
          {zh ? "歌单没加载出来，可能没联网。可以先玩不用联网的旋律模式。" : "The song list didn't load; the phone may be offline. Melody mode works without internet."}
        </p>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onOffline}>
          <Music size={18} />
          {zh ? "换旋律模式" : "Switch to melody"}
        </button>
      </>
    );
  if (!song)
    return (
      <>
        <Vinyl spinning={false} label="?" />
        <p className="hint" style={{ textAlign: "center" }}>
          {zh ? "正在挑歌" : "Picking songs"}
        </p>
      </>
    );

  const award = (pid: string | null) => {
    const nextScores = { ...scores };
    if (pid) {
      nextScores[pid] = (nextScores[pid] ?? 0) + [3, 2, 1][revealedAt];
      sfx.correct();
      haptic([12, 30, 12]);
    }
    setScores(nextScores);
    rememberSong(song.id);
    if (round >= total) {
      handle.current?.stop(0.6);
      return onEnd(nextScores);
    }
    const now = next ?? (book ? pick(book) : null);
    if (!now) return onEnd(nextScores);
    handle.current?.stop(0.25);
    played.current.add(now.id);
    setRound((r) => r + 1);
    setRevealed(false);
    setStage(0);
    setStartedAt(null);
    setSong(now);
    setNext(book ? pick(book, [now.id]) : null);
  };

  const card = cardOf(song);
  return (
    <>
      <p className="tn-round tabular">{zh ? `第 ${round} 首，共 ${total} 首` : `Song ${round} of ${total}`}</p>
      <Vinyl spinning={startedAt !== null} label={revealed ? <CoverLabel art={card.art} /> : "?"} />
      <StageDots stage={revealed ? revealedAt : stage} />
      <SongStatus audio={audio} playing />
      {revealed ? (
        <>
          <SongReveal song={card} />
          <p className="sup-ask">{zh ? "谁先猜对的？" : "Who got it first?"}</p>
          <div className="picker" style={{ justifyContent: "center" }}>
            {people.map((p) => (
              <button key={p.id} type="button" className="chip" onClick={() => award(p.id)}>
                {p.name}
                <small className="muted tabular">+{[3, 2, 1][revealedAt]}</small>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => award(null)}>
            {zh ? "没人猜到" : "Nobody got it"}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-ghost btn-block" disabled={!canPlay} onClick={() => play(0)}>
            <RotateCcw size={16} />
            {zh ? "从头再放" : "From the top"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => {
              setRevealedAt(stage);
              setRevealed(true);
              sfx.reveal();
            }}
          >
            <Eye size={18} />
            {zh ? "揭晓歌名" : "Reveal the title"}
          </button>
        </>
      )}
    </>
  );
}

function MelodyRounds({
  total,
  people,
  scores,
  setScores,
  onEnd,
}: {
  total: number;
  people: { id: string; name: string }[];
  scores: Record<string, number>;
  setScores: (s: Record<string, number>) => void;
  onEnd: (final: Record<string, number>) => void;
}) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const deck = useRef<number[]>(shuffle(TUNES.map((_, i) => i)));
  const [round, setRound] = useState(1);
  const [tune, setTune] = useState(() => deck.current.pop()!);
  const [stage, setStage] = useState(0);
  const [revealed, setRevealed] = useState(false);
  /** how much had been played when the title came up: that sets the price */
  const [revealedAt, setRevealedAt] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const handle = useRef<TuneHandle | null>(null);
  const stopTimer = useRef(0);

  const play = (st: number) => {
    handle.current?.stop();
    handle.current = playClip(tune, st);
    setStage(st);
    setSpinning(true);
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => setSpinning(false), clipSeconds(tune, st) * 1000 + 200);
  };
  useEffect(
    () => () => {
      handle.current?.stop();
      window.clearTimeout(stopTimer.current);
    },
    [],
  );
  // the first clip plays as soon as the round starts
  useEffect(() => {
    const id = window.setTimeout(() => play(0), 500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tune]);

  const award = (pid: string | null) => {
    const next = { ...scores };
    if (pid) {
      next[pid] = (next[pid] ?? 0) + [3, 2, 1][revealedAt];
      sfx.correct();
      haptic([12, 30, 12]);
    }
    setScores(next);
    if (round >= total) return onEnd(next);
    if (!deck.current.length) deck.current = shuffle(TUNES.map((_, i) => i));
    setRound((r) => r + 1);
    setRevealed(false);
    setStage(0);
    setTune(deck.current.pop()!);
  };

  return (
    <>
      <p className="tn-round tabular">{zh ? `第 ${round} 首，共 ${total} 首` : `Song ${round} of ${total}`}</p>
      <Vinyl spinning={spinning} label={revealed ? "" : "?"} />
      <StageDots stage={revealed ? revealedAt : stage} />
      {revealed ? (
        <>
          <TuneTitle tune={tune} />
          <p className="sup-ask">{zh ? "谁先猜对的？" : "Who got it first?"}</p>
          <div className="picker" style={{ justifyContent: "center" }}>
            {people.map((p) => (
              <button key={p.id} type="button" className="chip" onClick={() => award(p.id)}>
                {p.name}
                <small className="muted tabular">+{[3, 2, 1][revealedAt]}</small>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => award(null)}>
            {zh ? "没人猜到" : "Nobody got it"}
          </button>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => play(stage)}>
              <RotateCcw size={16} />
              {zh ? "再放一遍" : "Play again"}
            </button>
            {stage < 2 && (
              <button type="button" className="btn btn-ghost btn-block" onClick={() => play(stage + 1)}>
                <Music size={16} />
                {zh ? "多放几个音" : "More notes"}
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => {
              setRevealedAt(stage);
              setRevealed(true);
              play(2);
              sfx.reveal();
            }}
          >
            <Eye size={18} />
            {zh ? "揭晓歌名" : "Reveal the title"}
          </button>
        </>
      )}
    </>
  );
}

function Pads({
  people,
  scores,
  setScores,
  onEnd,
  onWrong,
}: {
  people: { id: string; name: string }[];
  scores: Record<string, number>;
  setScores: (s: Record<string, number>) => void;
  onEnd: () => void;
  onWrong: (name: string) => void;
}) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [first, setFirst] = useState<string | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const buzz = (id: string, i: number) => {
    if (first || locked.includes(id)) return;
    setFirst(id);
    sfx.buzz(i);
    haptic(30);
  };
  const judge = (ok: boolean) => {
    if (!first) return;
    const p = people.find((x) => x.id === first)!;
    if (ok) {
      setScores({ ...scores, [first]: (scores[first] ?? 0) + 1 });
      sfx.correct();
      setLocked([]);
    } else {
      setLocked((l) => [...l, first]);
      sfx.wrong();
      onWrong(p.name);
    }
    setFirst(null);
  };
  return (
    <>
      <div className={`pads n${Math.min(people.length, 8)}`}>
        {people.slice(0, 8).map((p, i) => {
          const color = AV_COLORS[colorFor(p.name)];
          return (
            <button
              key={p.id}
              type="button"
              className={`pad ${first === p.id ? "is-first" : ""} ${first && first !== p.id ? "is-dim" : ""} ${locked.includes(p.id) ? "is-locked" : ""}`}
              style={{ ["--pad" as string]: color }}
              onPointerDown={(e) => {
                e.preventDefault();
                buzz(p.id, i);
              }}
              onClick={(e) => {
                // keyboard presses arrive as clicks with no pointer behind them
                if (e.detail === 0) buzz(p.id, i);
              }}
              aria-label={p.name}
            >
              <span className="pad-name">{p.name}</span>
              <span className="pad-score tabular">{scores[p.id] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {first ? (
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => judge(false)}>
            <X size={18} />
            {zh ? "不对" : "Wrong"}
          </button>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => judge(true)}>
            <Check size={18} />
            {zh ? "对了" : "Right"}
          </button>
        </div>
      ) : (
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setLocked([])}>
            {zh ? "下一首" : "Next song"}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={onEnd}>
            {zh ? "结束，看分数" : "Finish"}
          </button>
        </div>
      )}
    </>
  );
}
