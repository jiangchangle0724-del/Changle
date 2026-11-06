import { Check, Disc3, Music, Radio, SkipForward, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import type { Tune } from "../../data/tunes";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground, type TuneHandle } from "../../lib/music";
import { forgetPreviews, heardSongs, loadPreview, rememberSong } from "../../lib/preview";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { usePlayers, useWatching } from "../../online/players";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { TuneView } from "../../shared/protocol";
import type { SongRow } from "../../shared/songs";
import { usePenaltyText, useStore } from "../../store";
import { Leaderboard } from "../common";
import { perfAt } from "../sensors";
import { chartsForRoom, loadCharts } from "./charts";
import { AnswerPicker, BuzzButton, clipSeconds, CoverLabel, hookOf, LevelPicker, playClip, playSnippets, PoolPicker, QuizChoices, SnapPicker, useSnippetOn, SongReveal, SongStatus, StageDots, stageNow, startSong, tuneChoice, TuneTitle, useSongAudio, Vinyl } from "./parts";
import { tuneCrew } from "./crew";
import { TuneStage, type StageCue, type StageTiming } from "./stage";
import { beatsFor } from "../../lib/beats";
import "../../styles/party.css";

export function NetTune({ v, onLeave }: { v: TuneView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, now, offset } = useRoom();
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const players = usePlayers();
  // (someone just watching listens along: no buzzer, no answers)
  const justWatching = useWatching();
  const seat = (id: string) => seats.find((s) => s.id === id);
  const songs = v.mode === "songs";
  const melody = v.mode === "melody";
  const djMode = v.mode === "dj";
  const dj = djMode ? room?.host : null;
  const iAmDj = djMode && isHost;
  const locked = v.locked.includes(me);
  const buzzerIsMe = v.buzzer === me;
  const quiz = v.quiz;

  // the game has its own soundtrack: the lounge music waits
  useEffect(() => holdBackground(), []);

  // the performers shrug when a buzz-in misses, and cheer (or shrug) when the answer is out
  const [missCue, setMissCue] = useState<StageCue | null>(null);
  const misses = v.locked.length;
  const lastMisses = useRef(misses);
  useEffect(() => {
    if (misses > lastMisses.current) setMissCue({ kind: "wrong", at: performance.now() });
    lastMisses.current = misses;
  }, [misses]);
  const someoneGotIt = quiz ? v.right.length > 0 : v.correct !== null;
  const revealCue = useMemo<StageCue>(() => ({ kind: someoneGotIt ? "right" : "wrong", at: v.round }), [someoneGotIt, v.round]);

  /* ---------- songs: every phone plays the same preview from the same second ---------- */

  // this phone's recent songs go to the table once, so tonight's list is new to everyone
  const sentHeard = useRef(false);
  useEffect(() => {
    if (sentHeard.current) return;
    sentHeard.current = true;
    const ids = heardSongs();
    if (ids.length) g("heard", { ids });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (v.song) rememberSong(v.song.id);
  }, [v.song?.id]);

  // the host's phone fetches today's charts from Apple (Apple turns servers away) and hands them in with the first song
  const charts = useRef<SongRow[]>([]);
  useEffect(() => {
    if (isHost && songs && v.phase === "ready") void loadCharts().then((rows) => (charts.current = rows));
  }, [isHost, songs, v.phase]);
  const goFirst = () => g("go", songs && charts.current.length ? { charts: chartsForRoom(charts.current) } : undefined);

  const audio = useSongAudio(songs ? v.audio : null);
  useEffect(() => {
    if (songs && v.pre) void loadPreview(v.pre);
  }, [songs, v.pre]);
  // decoded songs are big: none kept for melodies, after the last song, or once the game is left
  useEffect(() => {
    if (!songs || v.phase === "end") forgetPreviews();
  }, [songs, v.phase]);
  useEffect(() => () => forgetPreviews(), []);
  const canPlay = audio.status === "ready" || audio.status === "failed";
  // where the beats and the voice are in this preview, so the stage can follow it
  const beats = useMemo(() => (audio.url && audio.buf ? beatsFor(audio.url, audio.buf) : null), [audio.url, audio.buf]);
  const [timing, setTiming] = useState<StageTiming | null>(null);
  const snapKey = v.snap ? `${v.stageAt.join(",")}|${v.endsAt}|${v.hook}` : "";
  useEffect(() => {
    if (!songs || v.phase !== "listen" || !canPlay) return;
    if (v.snap) {
      // one second: the snippets, each from the hook, at their moments on the server's clock
      const hs = playSnippets(audio, v.stageAt, v.endsAt, v.hook, now());
      return () => hs.forEach((h) => h?.stop(0.08));
    }
    const startPerf = perfAt(v.startAt, now());
    const h = startSong(audio, { startPerf, offset: 0 });
    setTiming(h ? { startPerf, offset: 0 } : null);
    return () => h?.stop(0.12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, v.phase, canPlay, audio.url, v.startAt, snapKey]);
  // one second: the host's phone works out where each preview's snippets start, and tells the table
  const hooked = useRef(new Set<string>());
  useEffect(() => {
    if (!isHost || !songs || !v.snap) return;
    for (const url of [v.phase === "listen" ? v.audio : null, v.pre]) {
      if (!url || hooked.current.has(url)) continue;
      hooked.current.add(url);
      void loadPreview(url).then((buf) => {
        if (buf) g("hook", { p: url, at: hookOf(beatsFor(url, buf), buf.duration) });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, songs, v.snap, v.audio, v.pre, v.phase]);
  // at the reveal the song plays on from where it stopped
  useEffect(() => {
    if (!songs || v.phase !== "reveal" || !canPlay) return;
    const h = startSong(audio, { offset: v.revealPos / 1000, seconds: 9, fadeIn: 0.35 });
    setTiming(h ? { startPerf: performance.now(), offset: v.revealPos / 1000 } : null);
    return () => h?.stop(0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, v.phase, v.round, canPlay, audio.url]);
  useEffect(() => {
    if (v.phase === "ready" || v.phase === "end" || v.phase === "answer") setTiming(null);
  }, [v.phase]);

  /* ---------- melodies: the server sends the notes, not which tune they are ---------- */

  const clip = useMemo<Tune | null>(() => (v.clip ? { title: { zh: "", en: "" }, bpm: v.clip.bpm, notes: v.clip.notes, up: v.clip.up } : null), [v.clip?.bpm, v.clip?.notes, v.clip?.up]);
  const listening = melody && v.phase === "listen" && !!clip;
  const stageKey = v.stageAt.join(",");
  useEffect(() => {
    if (!listening || !clip) return;
    const handles: (TuneHandle | null)[] = [];
    const current = stageNow(v.stageAt, now());
    v.stageAt.forEach((at, i) => {
      const lead = at - now();
      if (lead > 0) handles.push(playClip(clip, i, perfAt(at, now())));
      else if (i === current && -lead < clipSeconds(clip, i) * 1000 + 4000) handles.push(playClip(clip, i));
    });
    return () => handles.forEach((h) => h?.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, clip, v.round, stageKey]);

  // the reveal plays the whole phrase once, as a little victory lap
  useEffect(() => {
    if (!melody || v.phase !== "reveal" || !clip) return;
    const h = playClip(clip, 2);
    return () => h?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [melody, v.phase, v.round]);

  // in melody mode the stage bops to the tune's own tempo from the first note
  const melodyTiming = useMemo<StageTiming | null>(() => (melody && v.stageAt.length ? { startPerf: perfAt(v.stageAt[0], now()), offset: 0 } : null), [melody, stageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // stage ticks over while listening
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (v.phase !== "listen") return;
    setStage(stageNow(v.stageAt, now()));
    const timers = v.stageAt.map((at, i) => window.setTimeout(() => setStage(i), Math.max(0, at - now())));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, stageKey]);

  // one second: the stage dances (and the record spins) while a snippet plays, from the hook on
  const snipOn = useSnippetOn(songs && v.snap && v.phase === "listen", v.stageAt, v.endsAt, now);
  const snapTiming = useMemo<StageTiming | null>(
    () => (songs && v.snap && v.stageAt.length ? { startPerf: perfAt(v.stageAt[Math.min(stage, v.stageAt.length - 1)], now()), offset: v.hook / 1000 } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, v.snap, stageKey, stage, v.hook],
  );

  // the song has started on the server's clock (before that, the record waits)
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (v.phase !== "listen" || djMode) return setStarted(v.phase === "answer");
    const at = v.stageAt[0] ?? 0;
    setStarted(now() >= at);
    const id = window.setTimeout(() => setStarted(true), Math.max(0, at - now()));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, stageKey, djMode]);

  useCue(v.phase === "answer", () => {
    // (each player's own buzzer sound, by their place among the players)
    sfx.buzz(Math.max(0, players.findIndex((s) => s.id === v.buzzer)));
    haptic(buzzerIsMe ? [30, 40, 30] : 15);
  });

  const rules = (
    <p>
      {zh
        ? `真歌模式：所有手机同时放同一首歌的 30 秒试听，可以选语言（华语、粤语、英文、韩语、日语、越南语、世界名曲、全球热曲）和类别（老歌、流行、摇滚、民谣、说唱、电子舞曲、R&B、影视金曲），越早听出来分越高：前 8 秒答对 3 分，18 秒前 2 分，之后 1 分。抢答：知道就抢，从四个歌名里选，答错${custom ? "受罚" : "喝一口"}，这首就不能再抢。选择题：四个歌名从一开始就在每个人手机上，各选各的，越早选对分越高，没选对的${custom ? "受罚" : "喝一口"}。选项可以选难：只写歌名，错的尽量是同一个歌手的歌。一秒猜歌：所有手机先一起放一秒，6 秒后放三秒，13 秒后一直放，都从同一处放，猜到的时候放到第几段就是几分（3、2、1 分）。台上两个小人：男歌手的歌他唱她跳，女歌手的歌她唱他跳。揭晓时可以去 Apple Music 听完整版。旋律模式：手机一起放经典旋律，不用联网也能玩。DJ 模式：主人用自己的音乐 App 放歌，其他人抢答，主人判对错，答对 1 分。最后得分最低的${custom ? "受罚" : "喝两口"}。`
        : `Real songs: every phone plays the same 30-second preview of a real song. Pick a language (Chinese, Cantonese, English, Korean, Japanese, Vietnamese, world classics, global hits) and a category (oldies, pop, rock, folk, hip-hop, dance, R&B, film & TV). The sooner you name it, the more it's worth: 3 points in the first 8 seconds, 2 before 18, then 1. Buzz in: know it? Buzz and pick the title from four; a wrong answer ${custom ? "takes the penalty" : "is a sip"} and locks you out of that song. Multiple choice: the four titles are on every phone from the start, everyone picks their own, the sooner the right one the more points, and whoever misses ${custom ? "takes the penalty" : "drinks"}. The titles can be hard: no singers, and the wrong ones by the same singer where possible. One second: every phone plays one second of the song, three seconds at 6 s, the rest from 13 s, always from the same spot; 3, 2 or 1 points by how much had played. The two performers on stage: a man's song, he sings and she dances; a woman's song, the other way round. The reveal links to the full song on Apple Music. Melody mode: every phone plays a classic tune on the synth, no internet needed. DJ mode: the host plays songs from their own music app, everyone else buzzes, the host says right or wrong (1 point). Lowest score ${custom ? "takes the penalty" : "drinks two"}.`}
    </p>
  );

  // everyone at the table, on the stage (the DJ plays the songs, so the DJ isn't up there)
  const crew = useMemo(
    () => tuneCrew(seats.filter((s) => !s.watch && (!djMode || s.id !== dj)), me, v),
    // (the view's pieces that move people about the stage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seats, me, djMode, dj, v.phase, v.buzzer, v.locked.join(), v.correct, v.quiz, v.right.join(), v.last?.pid, v.last?.ok, v.phase === "end" ? JSON.stringify(v.scores) : ""],
  );

  const scoreRows = seats
    .filter((s) => !s.watch && (!djMode || s.id !== dj))
    .map((s) => ({ id: s.id, name: s.id === me ? (zh ? "你" : "You") : s.name, score: v.scores[s.id] ?? 0, face: <SeatFace seat={s} size={36} /> }));

  const modeHint = songs
    ? zh
      ? "所有手机一起放同一首歌的 30 秒试听，抢答歌名"
      : "Every phone plays the same 30-second preview. Race to name the song."
    : melody
      ? zh
        ? "手机一起放经典旋律，不用联网也能玩"
        : "Every phone plays a classic tune. Works without internet."
      : zh
        ? "主人用自己的音乐 App 放歌，这里只管抢答和计分"
        : "The host plays songs from their own app; this is the buzzer and the scoreboard";

  const recordLabel = songs ? "?" : melody ? "?" : "DJ";
  const roundLine = <p className="tn-round tabular">{zh ? `第 ${v.round} 首，共 ${v.total} 首` : `Song ${v.round} of ${v.total}`}</p>;

  return (
    <NetFrame title={GAME_BY_ID.tune.name} rules={rules} onLeave={onLeave}>
      <div className="tn">
        {v.phase === "ready" && (
          <>
            <Vinyl spinning={false} label={<Music size={30} strokeWidth={2.4} />} />
            <div className="seg" role="group" aria-label={zh ? "玩法" : "Mode"}>
              <button type="button" aria-pressed={songs} disabled={!isHost} onClick={() => g("mode", { mode: "songs" })}>
                <Radio size={15} /> {zh ? "真歌" : "Real songs"}
              </button>
              <button type="button" aria-pressed={melody} disabled={!isHost} onClick={() => g("mode", { mode: "melody" })}>
                <Music size={15} /> {zh ? "旋律" : "Melody"}
              </button>
              <button type="button" aria-pressed={djMode} disabled={!isHost} onClick={() => g("mode", { mode: "dj" })}>
                <Disc3 size={15} /> DJ
              </button>
            </div>
            {songs && <PoolPicker pool={v.pool} disabled={!isHost} onPick={(pool) => g("pool", { pool })} />}
            {songs && v.noSongs && <p className="tn-miss">{zh ? "这个歌单还没有歌，换一个语言或类别" : "No songs in this pool yet. Pick another language or category."}</p>}
            {!djMode && <AnswerPicker quiz={quiz} disabled={!isHost} onPick={(on) => g("quiz", { on })} />}
            {songs && <LevelPicker hard={v.hard} disabled={!isHost} onPick={(on) => g("hard", { on })} />}
            {songs && <SnapPicker snap={v.snap} disabled={!isHost} onPick={(on) => g("snap", { on })} />}
            <p className="hint" style={{ textAlign: "center" }}>
              {modeHint}
            </p>
            <div className="seg seg-sm" role="group" aria-label={zh ? "几首" : "How many"} style={{ alignSelf: "center" }}>
              {[5, 8, 12, 20].map((n) => (
                <button key={n} type="button" aria-pressed={v.total === n} disabled={!isHost} onClick={() => g("total", { n })}>
                  {zh ? `${n} 首` : `${n} songs`}
                </button>
              ))}
            </div>
            {isHost ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={goFirst}>
                {djMode ? (zh ? "开始，我来放歌" : "Start. I'll play the songs") : zh ? "放第一首" : "Play the first one"}
              </button>
            ) : (
              <Waiting>{zh ? "等主人开始" : "Waiting for the host"}</Waiting>
            )}
            {songs && <p className="song-credit">{zh ? "歌曲试听由 Apple Music 提供" : "Song previews from Apple Music"}</p>}
          </>
        )}

        {(v.phase === "listen" || v.phase === "answer") && (
          <>
            {roundLine}
            {djMode ? (
              <Vinyl spinning={v.phase === "listen"} label={recordLabel} />
            ) : (
              <TuneStage
                singer={songs ? v.singer : 0}
                playing={v.phase === "listen" && (songs && v.snap ? snipOn : started)}
                beats={songs ? beats : null}
                timing={songs ? (v.snap ? snapTiming : timing) : melodyTiming}
                fallbackBpm={melody ? (v.clip?.bpm ?? 100) : 100}
                mood={songs ? v.mood : ""}
                songKey={songs ? (v.audio ?? "") : `r${v.round}`}
                cue={missCue}
                crew={crew}
              >
                <Vinyl spinning={v.phase === "listen" && (songs && v.snap ? snipOn : started)} label={recordLabel} />
              </TuneStage>
            )}
            {!djMode && <StageDots stage={stage} />}
            {songs && <SongStatus audio={audio} playing={started} />}

            {v.phase === "listen" && quiz && (songs ? v.choices : v.options) && (
              <>
                <QuizChoices
                  choices={songs ? v.choices! : v.options!.map((o) => tuneChoice(o, zh))}
                  mine={v.mine}
                  answer={null}
                  disabled={!started || justWatching}
                  onPick={(id) => {
                    g("answer", { choice: id });
                    haptic(20);
                  }}
                />
                <p className="tn-answered">
                  <span className="faces">
                    {v.answered.map((pid) => (
                      <SeatFace key={pid} seat={seat(pid)} size={26} />
                    ))}
                  </span>
                  {v.mine !== null ? (zh ? `${v.answered.length}/${scoreRows.length} 人已答，等其他人` : `${v.answered.length}/${scoreRows.length} answered. Waiting for the rest.`) : zh ? "越早选对分越高" : "The sooner the right one, the more points"}
                </p>
              </>
            )}

            {v.phase === "listen" &&
              !quiz &&
              (iAmDj ? (
                <p className="tn-dj-note">{zh ? "放你的歌，有人抢答会在这里显示" : "Play your song. Buzzes show up here."}</p>
              ) : justWatching ? null : (
                <>
                  <BuzzButton
                    locked={locked}
                    onBuzz={() => {
                      g("buzz");
                      haptic(25);
                    }}
                  />
                  <p className="hint" style={{ textAlign: "center" }}>
                    {locked
                      ? zh
                        ? "这首你答错了，等下一首"
                        : "You missed this one. Next song."
                      : songs && v.snap
                        ? zh
                          ? "听出来就抢，听不出来等下一段"
                          : "Know it? Buzz. If not, wait for the next bit."
                        : zh
                          ? "知道是什么歌就抢"
                          : "Know it? Buzz."}
                  </p>
                </>
              ))}

            {v.phase === "answer" && v.buzzer && (
              <div className="tn-answer">
                <div className="tn-buzzer">
                  <SeatFace seat={seat(v.buzzer)} size={40} />
                  <strong>{buzzerIsMe ? (zh ? "你抢到了" : "You buzzed") : zh ? `${nameOf(v.buzzer)} 抢到了` : `${nameOf(v.buzzer)} buzzed`}</strong>
                  <TimerArc seconds={djMode ? 30 : 10} running endsAt={v.answerEndsAt} offset={offset} size={48} resetKey={`${v.round}-${v.buzzer}-${v.answerEndsAt}`} />
                </div>
                {melody && v.options && (
                  <div className="tn-options">
                    {v.options.map((o) => tuneChoice(o, zh)).map((c) => (
                      <button key={c.id} type="button" className="tn-option" disabled={!buzzerIsMe} onClick={() => g("answer", { choice: c.id })}>
                        <strong>{c.t}</strong>
                        <small>{zh ? c.a : c.ae}</small>
                      </button>
                    ))}
                  </div>
                )}
                {songs && v.choices && (
                  <div className="tn-options">
                    {v.choices.map((c) => (
                      <button key={c.id} type="button" className="tn-option" disabled={!buzzerIsMe} onClick={() => g("answer", { choice: c.id })}>
                        <strong>{c.t}</strong>
                        {(zh ? c.a : c.ae) && <small>{zh ? c.a : c.ae}</small>}
                      </button>
                    ))}
                  </div>
                )}
                {djMode && iAmDj && (
                  <div className="row" style={{ gap: 10 }}>
                    <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => g("judge", { ok: false })}>
                      <X size={18} />
                      {zh ? "不对" : "Wrong"}
                    </button>
                    <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("judge", { ok: true })}>
                      <Check size={18} />
                      {zh ? "对了" : "Right"}
                    </button>
                  </div>
                )}
                {djMode && !iAmDj && <Waiting>{zh ? "说出歌名，等 DJ 判" : "Say the title. The DJ decides."}</Waiting>}
              </div>
            )}

            {v.last && !v.last.ok && v.phase === "listen" && (
              <p className="tn-miss">
                {v.last.pid === me
                  ? custom
                    ? zh
                      ? "答错了，受罚"
                      : "Wrong. Take the penalty."
                    : zh
                      ? "答错了，喝一口"
                      : "Wrong. Take a sip."
                  : zh
                    ? `${nameOf(v.last.pid)} 答错了`
                    : `${nameOf(v.last.pid)} got it wrong`}
              </p>
            )}

            <HostRow>
              {v.phase === "listen" && (
                <HostButton onClick={() => g("skip")}>
                  <SkipForward size={14} />
                  {zh ? "揭晓答案" : "Reveal"}
                </HostButton>
              )}
            </HostRow>
          </>
        )}

        {v.phase === "reveal" && (
          <>
            {roundLine}
            {songs && v.song ? (
              <>
                <TuneStage singer={v.singer} playing beats={beats} timing={timing} mood={v.mood} songKey={v.audio ?? v.song.id} cue={revealCue} crew={crew}>
                  <Vinyl spinning label={<CoverLabel art={v.song.art} />} />
                </TuneStage>
                <SongReveal song={v.song} />
              </>
            ) : melody ? (
              <>
                <TuneStage singer={0} playing={false} beats={null} timing={null} songKey={`r${v.round}`} cue={revealCue} crew={crew}>
                  <Vinyl spinning={false} label={<Music size={30} strokeWidth={2.4} />} />
                </TuneStage>
                <TuneTitle tune={v.tune} />
              </>
            ) : null}
            {quiz && (songs ? v.choices : v.options) && (
              <QuizChoices
                choices={songs ? v.choices! : v.options!.map((o) => tuneChoice(o, zh))}
                mine={v.mine}
                answer={songs ? (v.song?.id ?? null) : v.tune}
              />
            )}
            {quiz ? (
              <p className="tn-who tn-right">
                {v.right.length ? (
                  <>
                    <span>{zh ? "答对了：" : "Got it:"}</span>
                    {v.right.map((pid) => (
                      <span key={pid}>
                        <SeatFace seat={seat(pid)} size={28} />
                        {pid === me ? (zh ? "你" : "You") : nameOf(pid)}
                      </span>
                    ))}
                  </>
                ) : zh ? (
                  custom ? "这首没人答对，都受罚" : "这首没人答对，都喝一口"
                ) : custom ? (
                  "Nobody got this one. Everyone takes the penalty."
                ) : (
                  "Nobody got this one. Everyone drinks."
                )}
              </p>
            ) : (
              <p className="tn-who">
                {v.correct ? (
                  <>
                    <SeatFace seat={seat(v.correct)} size={36} />
                    {v.correct === me ? (zh ? "你答对了" : "You got it") : zh ? `${nameOf(v.correct)} 答对了` : `${nameOf(v.correct)} got it`}
                  </>
                ) : zh ? (
                  "这首没人答对"
                ) : (
                  "Nobody got this one"
                )}
              </p>
            )}
            <Leaderboard rows={scoreRows} />
            {songs && v.noSongs && (
              <>
                <p className="tn-miss">{zh ? "这个歌单的歌放完了，换一个语言或类别" : "This pool has run out of songs. Pick another language or category."}</p>
                <PoolPicker pool={v.pool} disabled={!isHost} onPick={(pool) => g("pool", { pool })} />
              </>
            )}
            {iAmDj || (!djMode && isHost) ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g(v.round >= v.total ? "end" : "go")}>
                {v.round >= v.total ? (zh ? "看结果" : "Final scores") : djMode ? (zh ? "放下一首" : "Next song") : zh ? "下一首" : "Next song"}
              </button>
            ) : (
              <Waiting>{djMode ? (zh ? "等 DJ 放下一首" : "Waiting for the DJ") : zh ? "下一首马上来" : "Next song coming up"}</Waiting>
            )}
          </>
        )}

        {v.phase === "end" && (
          <>
            {/* the top three on the podium, everyone else along the edge */}
            <TuneStage singer={0} playing={false} beats={null} timing={null} songKey="end" crew={crew}>
              <span />
            </TuneStage>
            <h2 className="pl-board-title">{zh ? "最终得分" : "Final scores"}</h2>
            <Leaderboard rows={scoreRows} />
            {isHost && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("again")}>
                {zh ? "再来一局" : "Play again"}
              </button>
            )}
          </>
        )}
      </div>
    </NetFrame>
  );
}
