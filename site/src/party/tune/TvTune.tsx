import { Disc3, Lock, Music, Radio, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Tune } from "../../data/tunes";
import { beatsFor } from "../../lib/beats";
import { holdBackground, type TuneHandle } from "../../lib/music";
import { forgetPreviews, loadPreview } from "../../lib/preview";
import { sfx } from "../../lib/sfx";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import type { SeatView, TuneView } from "../../shared/protocol";
import { CATS, parsePool, SOURCES } from "../../shared/songs";
import { Bi, FacesIn, RoundTag, TvBoard, TvClock, TvPodium, TvShow, useArrivals, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { perfAt } from "../sensors";
import { tuneCrew, type Mate, type MateState } from "./crew";
import { clipSeconds, CoverLabel, playClip, stageNow, startSong, tuneChoice, useSongAudio, Vinyl, type QuizChoice } from "./parts";
import { TuneStage, type StageCue, type StageTiming } from "./stage";
import "../../styles/party.css";
import "../../styles/tv-tune.css";

const ANSWER_MS = 10_000;
const DJ_ANSWER_MS = 30_000;

/**
 * 猜歌名 on the big screen: the music show. The two performers either side of the record sing and
 * dance to the song, everyone at the table on the front of the stage; whoever buzzes in steps into
 * the spotlight with the four titles up beside them; the reveal puts the cover on the record and
 * the title up in lights; the podium at the end. On the screen that plays the show, the song plays
 * from the same second as every phone.
 */
export default function TvTune({ v, sound }: TvViewProps<TuneView>) {
  const { now, room } = useRoom();
  const { zh } = useLang();
  const { players } = useSeats();
  const songs = v.mode === "songs";
  const melody = v.mode === "melody";
  const djMode = v.mode === "dj";
  const dj = djMode ? (room?.host ?? null) : null;
  const quiz = v.quiz;

  // the game has its own soundtrack: the lounge music waits
  useEffect(() => (sound ? holdBackground() : undefined), [sound]);

  /* ---------- songs: the same preview from the same second as every phone ---------- */

  const audio = useSongAudio(songs && sound ? v.audio : null);
  useEffect(() => {
    if (songs && sound && v.pre) void loadPreview(v.pre);
  }, [songs, sound, v.pre]);
  // decoded songs are big: none kept after the last song, or once the game is gone
  useEffect(() => {
    if (!songs || v.phase === "end") forgetPreviews();
  }, [songs, v.phase]);
  useEffect(() => () => forgetPreviews(), []);
  const canPlay = audio.status === "ready" || audio.status === "failed";
  const beats = useMemo(() => (audio.url && audio.buf ? beatsFor(audio.url, audio.buf) : null), [audio.url, audio.buf]);
  useEffect(() => {
    if (!songs || v.phase !== "listen" || !canPlay) return;
    const h = startSong(audio, { startPerf: perfAt(v.startAt, now()), offset: 0 });
    return () => h?.stop(0.12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, v.phase, canPlay, audio.url, v.startAt]);
  // at the reveal the song plays on from where it stopped
  useEffect(() => {
    if (!songs || v.phase !== "reveal" || !canPlay) return;
    const h = startSong(audio, { offset: v.revealPos / 1000, seconds: 9, fadeIn: 0.35 });
    return () => h?.stop(0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, v.phase, v.round, canPlay, audio.url]);
  // the dance keeps the song's time whether or not this screen plays it
  const revealAt = useMemo(() => performance.now(), [v.phase === "reveal", v.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const songTiming = useMemo<StageTiming | null>(
    () => (!songs ? null : v.phase === "listen" ? { startPerf: perfAt(v.startAt, now()), offset: 0 } : v.phase === "reveal" ? { startPerf: revealAt, offset: v.revealPos / 1000 } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, v.phase, v.startAt, revealAt],
  );

  /* ---------- melodies: the notes, played on the server's clock ---------- */

  const clip = useMemo<Tune | null>(() => (v.clip ? { title: { zh: "", en: "" }, bpm: v.clip.bpm, notes: v.clip.notes, up: v.clip.up } : null), [v.clip?.bpm, v.clip?.notes, v.clip?.up]);
  const stageKey = v.stageAt.join(",");
  const listening = melody && v.phase === "listen" && !!clip;
  useEffect(() => {
    if (!sound || !listening || !clip) return;
    const handles: (TuneHandle | null)[] = [];
    const current = stageNow(v.stageAt, now());
    v.stageAt.forEach((at, i) => {
      const lead = at - now();
      if (lead > 0) handles.push(playClip(clip, i, perfAt(at, now())));
      else if (i === current && -lead < clipSeconds(clip, i) * 1000 + 4000) handles.push(playClip(clip, i));
    });
    return () => handles.forEach((h) => h?.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound, listening, clip, v.round, stageKey]);
  useEffect(() => {
    if (!sound || !melody || v.phase !== "reveal" || !clip) return;
    const h = playClip(clip, 2);
    return () => h?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound, melody, v.phase, v.round]);
  const melodyTiming = useMemo<StageTiming | null>(() => (melody && v.stageAt.length ? { startPerf: perfAt(v.stageAt[0], now()), offset: 0 } : null), [melody, stageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the clock of the song: which clip, whether it has started ---------- */

  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (v.phase !== "listen") return;
    setStage(stageNow(v.stageAt, now()));
    const timers = v.stageAt.map((at, i) => window.setTimeout(() => setStage(i), Math.max(0, at - now())));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, stageKey]);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (v.phase !== "listen" || djMode) return setStarted(v.phase === "answer");
    const at = v.stageAt[0] ?? 0;
    setStarted(now() >= at);
    const id = window.setTimeout(() => setStarted(true), Math.max(0, at - now()));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, stageKey, djMode]);

  /* ---------- the stage's moments ---------- */

  const seats = room?.seats ?? [];
  // someone buzzes in: their buzzer sounds here
  useCue(v.phase === "answer", () => {
    if (sound) sfx.buzz(Math.max(0, seats.findIndex((s) => s.id === v.buzzer)));
  });
  useArrivals(v.answered, sound);
  const [missCue, setMissCue] = useState<StageCue | null>(null);
  const misses = v.locked.length;
  const lastMisses = useRef(misses);
  useEffect(() => {
    if (misses > lastMisses.current) setMissCue({ kind: "wrong", at: performance.now() });
    lastMisses.current = misses;
  }, [misses]);
  const someoneGotIt = quiz ? v.right.length > 0 : v.correct !== null;
  const revealCue = useMemo<StageCue>(() => ({ kind: someoneGotIt ? "right" : "wrong", at: v.round }), [someoneGotIt, v.round]);
  // everyone at the table on the stage (the DJ plays the songs, so the DJ isn't up there)
  const onStage = players.filter((s) => !djMode || s.id !== dj);
  const crew = useMemo(
    () => tuneCrew(onStage, "", v),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onStage.map((s) => `${s.id}:${s.on}:${s.fg ?? 0}`).join(), v.phase, v.buzzer, v.locked.join(), v.correct, v.quiz, v.right.join(), v.last?.pid, v.last?.ok, v.phase === "end" ? JSON.stringify(v.scores) : ""],
  );
  const scores = onStage.map((s) => ({ seat: s, score: v.scores[s.id] ?? 0, hot: v.phase === "reveal" && (quiz ? v.right.includes(s.id) : v.correct === s.id) }));

  const tag =
    v.phase === "ready" ? null : v.phase === "end" ? (
      <RoundTag>{zh ? `${v.round} 首` : `${v.round} songs`}</RoundTag>
    ) : (
      <RoundTag>
        {zh ? `第 ${v.round} 首` : `Song ${v.round}`}
        <small>{zh ? ` / 共 ${v.total} 首` : ` of ${v.total}`}</small>
      </RoundTag>
    );
  const clock =
    v.phase === "listen" && !djMode ? (
      <TvClock key={`l${v.round}`} endsAt={v.endsAt} total={Math.max(1, v.endsAt - (songs ? v.startAt : (v.stageAt[0] ?? v.endsAt)))} sound={sound} paused={v.pausedAt} />
    ) : v.phase === "answer" ? (
      <TvClock key={`a${v.round}-${v.buzzer}`} endsAt={v.answerEndsAt} total={djMode ? DJ_ANSWER_MS : ANSWER_MS} sound={sound} />
    ) : null;

  const record = (
    <Vinyl
      spinning={(v.phase === "listen" && started) || (v.phase === "reveal" && songs)}
      label={v.phase === "reveal" && songs && v.song ? <CoverLabel art={v.song.art} /> : v.phase === "ready" || v.phase === "end" ? <Music size={54} strokeWidth={2.2} /> : djMode ? "DJ" : "?"}
    />
  );
  const timing = songs ? songTiming : melodyTiming;
  const playing = (v.phase === "listen" && started) || (v.phase === "reveal" && songs && !!v.song);

  if (v.phase === "end")
    return (
      <TvShow game="tune" className="tvt is-end" phase={v.phase} round={tag}>
        <h1 className="tvt-end-title">
          <Bi t={{ zh: "最终得分", en: "Final scores" }} />
        </h1>
        <TvPodium rows={scores} unit={zh ? "分" : "pts"} sound={sound} className="tvt-podium" />
      </TvShow>
    );

  return (
    <TvShow game="tune" className={`tvt is-${v.phase}`} phase={v.phase} round={tag} clock={clock}>
      <div className="tvt-stage">
        <Names crew={crew} />
        <TuneStage
          singer={songs ? v.singer : 0}
          playing={playing}
          beats={songs ? beats : null}
          timing={playing ? timing : null}
          fallbackBpm={melody ? (v.clip?.bpm ?? 100) : 100}
          mood={songs ? v.mood : ""}
          songKey={songs ? (v.audio ?? (v.song ? v.song.id : "")) : `r${v.round}`}
          cue={v.phase === "reveal" ? revealCue : missCue}
          crew={crew}
        >
          {record}
        </TuneStage>
      </div>
      <aside className="tvt-side">
        {v.phase === "ready" && <Ready v={v} />}
        {v.phase === "listen" && <Listen v={v} stage={stage} started={started} dj={dj} />}
        {v.phase === "answer" && <Answer v={v} />}
        {v.phase === "reveal" && <Reveal v={v} scores={scores} />}
      </aside>
    </TvShow>
  );
}

/**
 * Everyone's name under their feet on the front of the stage, for the room to read (the stage
 * itself names only whoever is up). Where each stands is where the stage puts them (crew.tsx).
 */
function Names({ crew }: { crew: Mate[] }) {
  const row = crew.filter((m) => !RAISED.includes(m.state));
  return (
    <div className="tvt-names" aria-hidden="true">
      {row.map((m, k) => (
        <span key={m.seat.id} data-state={m.state} style={{ left: `calc(2% + ${0.96 * (row.length === 1 ? 50 : 10 + (80 * k) / (row.length - 1))}%)` }}>
          {m.seat.name}
        </span>
      ))}
    </div>
  );
}
const RAISED: MateState[] = ["spot", "win", "first", "second", "third"];

/* ------------------------------------------------------------------ before the first song */

function Ready({ v }: { v: TuneView }) {
  const { zh } = useLang();
  const pool = parsePool(v.pool);
  const langs = pool ? SOURCES.filter((x) => pool.srcs.includes(x.key)).map((x) => (zh ? x.zh : x.en)) : [];
  const cats = pool ? CATS.filter((c) => pool.cats.includes(c.key)).map((c) => (zh ? c.zh : c.en)) : [];
  const Icon = v.mode === "songs" ? Radio : v.mode === "melody" ? Music : Disc3;
  return (
    <div className="tvt-ready">
      <Bi t={{ zh: "主人选好了就放第一首", en: "The host plays the first one when ready" }} />
      <ul className="tvt-chips">
        <li className="is-mode">
          <Icon size={28} strokeWidth={2.4} />
          {v.mode === "songs" ? (zh ? "真歌" : "Real songs") : v.mode === "melody" ? (zh ? "旋律" : "Melodies") : "DJ"}
        </li>
        {v.mode === "songs" && langs.length > 0 && <li>{langs.join(zh ? "、" : ", ")}</li>}
        {v.mode === "songs" && <li>{cats.length ? cats.join(zh ? "、" : ", ") : zh ? "所有类别" : "Every kind"}</li>}
        {v.mode !== "dj" && <li>{v.quiz ? (zh ? "选择题" : "Multiple choice") : zh ? "抢答" : "Buzz in"}</li>}
        {v.mode === "songs" && v.hard && <li>{zh ? "难：只写歌名" : "Hard: titles only"}</li>}
        <li className="tabular">{zh ? `${v.total} 首` : `${v.total} songs`}</li>
      </ul>
      <p className="tvt-note">
        {v.mode === "songs"
          ? zh
            ? "每部手机和这块屏幕同时放同一首歌，越早猜出来分越高"
            : "Every phone and this screen play the same song. The sooner you name it, the more it's worth."
          : v.mode === "melody"
            ? zh
              ? "经典旋律，越早猜出来分越高"
              : "Classic tunes. The sooner you name it, the more it's worth."
            : zh
              ? "主人用自己的音乐 App 放歌，大家抢答"
              : "The host plays songs from their own app; everyone buzzes in"}
      </p>
      {v.noSongs && <p className="tvt-miss">{zh ? "这个歌单还没有歌，主人换一个" : "No songs in this pool yet: the host picks another"}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ the song is on */

/** Three clips, three prices: the sooner you get it, the more it's worth. */
function Ladder({ stage }: { stage: number }) {
  const { zh } = useLang();
  return (
    <ol className="tvt-ladder">
      {[3, 2, 1].map((pts, i) => (
        <li key={pts} className={i === stage ? "is-now" : i < stage ? "is-past" : ""}>
          <b className="tabular">{pts}</b>
          {zh ? "分" : pts === 1 ? "pt" : "pts"}
        </li>
      ))}
    </ol>
  );
}

function Listen({ v, stage, started, dj }: { v: TuneView; stage: number; started: boolean; dj: string | null }) {
  const { zh } = useLang();
  const { seat, players } = useSeats();
  const locked = v.locked.map((pid) => seat(pid)).filter((s): s is SeatView => !!s);
  if (v.mode === "dj")
    return (
      <div className="tvt-listen">
        <Bi t={{ zh: "知道是什么歌就抢！", en: "Know it? Buzz in!" }} />
        <p className="tvt-note">{zh ? `${seat(dj)?.name ?? "主人"} 在放歌` : `${seat(dj)?.name ?? "The host"} is playing the songs`}</p>
        {locked.length > 0 && <Locked seats={locked} />}
      </div>
    );
  const choices: QuizChoice[] | null = v.quiz ? (v.mode === "songs" ? v.choices : v.options ? v.options.map((o) => tuneChoice(o, zh)) : null) : null;
  return (
    <div className="tvt-listen">
      <Ladder stage={stage} />
      {choices ? (
        <>
          <Titles choices={choices} answer={null} />
          <p className="tvt-answered">
            <FacesIn seats={v.answered.map((pid) => seat(pid))} size={46} />
            <span className="tabular">{zh ? `${v.answered.length}/${players.length} 人选了` : `${v.answered.length} of ${players.length} picked`}</span>
          </p>
        </>
      ) : (
        <>
          <p className="tvt-buzz">
            <Zap size={60} strokeWidth={2.4} />
            <Bi t={{ zh: "知道是什么歌就抢！", en: "Know it? Buzz in!" }} />
          </p>
          <p className="tvt-note">{started ? (zh ? "在手机上按「抢」，再从四个歌名里选" : "Hit Buzz on your phone, then pick the title from four") : zh ? "歌马上来……" : "Here it comes…"}</p>
          {locked.length > 0 && <Locked seats={locked} />}
        </>
      )}
      {v.last && !v.last.ok && <p className="tvt-miss">{zh ? `${seat(v.last.pid)?.name ?? "?"} 答错了` : `${seat(v.last.pid)?.name ?? "?"} got it wrong`}</p>}
    </div>
  );
}

function Locked({ seats }: { seats: SeatView[] }) {
  const { zh } = useLang();
  return (
    <p className="tvt-locked">
      <Lock size={26} strokeWidth={2.6} />
      <span>{zh ? "这首答错了" : "Locked out"}</span>
      <FacesIn seats={seats} size={42} />
    </p>
  );
}

/** The four titles, A to D; at the reveal the right one lights up. */
function Titles({ choices, answer }: { choices: QuizChoice[]; answer: number | null }) {
  const { zh } = useLang();
  return (
    <ol className="tvt-titles">
      {choices.map((c, i) => (
        <li key={c.id} className={answer !== null ? (c.id === answer ? "is-right" : "is-off") : ""}>
          <span className="tvt-letter" aria-hidden="true">
            {String.fromCharCode(65 + i)}
          </span>
          <span className="tvt-title-text">
            <strong>{c.t}</strong>
            {(zh ? c.a : c.ae) && <small>{zh ? c.a : c.ae}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ someone buzzed in */

function Answer({ v }: { v: TuneView }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const who = seat(v.buzzer);
  const choices: QuizChoice[] | null = v.mode === "songs" ? v.choices : v.mode === "melody" && v.options ? v.options.map((o) => tuneChoice(o, zh)) : null;
  return (
    <div className="tvt-answer">
      <p className="tvt-buzzer">
        {who && <SeatFace seat={who} size={76} />}
        <span>{zh ? `${who?.name ?? "?"} 抢到了！` : `${who?.name ?? "?"} buzzed!`}</span>
      </p>
      {choices ? <Titles choices={choices} answer={null} /> : <p className="tvt-note">{zh ? "说出歌名，DJ 来判" : "Say the title. The DJ decides."}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ the answer */

function Reveal({ v, scores }: { v: TuneView; scores: { seat: SeatView; score: number; hot: boolean }[] }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const choices: QuizChoice[] | null = v.quiz ? (v.mode === "songs" ? v.choices : v.options ? v.options.map((o) => tuneChoice(o, zh)) : null) : null;
  const winners = v.quiz ? v.right : v.correct ? [v.correct] : [];
  let title: ReactNode = null;
  if (choices && v.mode === "melody") title = null;
  else if (v.mode === "songs" && v.song)
    title = (
      <div className="tvt-song">
        <strong>{v.song.t}</strong>
        <small>{zh ? v.song.a : v.song.ae}</small>
        <span className="tvt-credit">{zh ? "歌曲试听由 Apple Music 提供" : "Song previews from Apple Music"}</span>
      </div>
    );
  else if (v.mode === "melody" && v.tune >= 0) {
    const c = tuneChoice(v.tune, zh);
    title = (
      <div className="tvt-song">
        <strong>{c.t}</strong>
        <small>{c.a}</small>
      </div>
    );
  }
  return (
    <div className="tvt-reveal">
      {title}
      {choices && <Titles choices={choices} answer={v.mode === "songs" ? (v.song?.id ?? null) : v.tune} />}
      <p className={`tvt-got ${winners.length ? "is-yes" : ""}`}>
        {winners.length ? (
          <>
            <FacesIn seats={winners.map((pid) => seat(pid))} size={52} />
            <span>{zh ? `${winners.map((pid) => seat(pid)?.name ?? "?").join("、")} 答对了` : `${winners.map((pid) => seat(pid)?.name ?? "?").join(", ")} got it`}</span>
          </>
        ) : (
          <span>{zh ? "这首没人答对" : "Nobody got this one"}</span>
        )}
      </p>
      {!choices && <TvBoard rows={scores} unit={zh ? "分" : "pts"} max={5} className="tvt-board is-small" />}
    </div>
  );
}
