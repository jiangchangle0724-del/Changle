import { Check, Disc3, Music, Radio, SkipForward, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import { TUNES, type Tune } from "../../data/tunes";
import { GAME_BY_ID } from "../../games/registry";
import { holdBackground, type TuneHandle } from "../../lib/music";
import { heardSongs, loadPreview, rememberSong } from "../../lib/preview";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { HostButton, HostRow, Waiting } from "../../online/games/common";
import type { TuneView } from "../../shared/protocol";
import type { SongRow } from "../../shared/songs";
import { useStore } from "../../store";
import { Leaderboard } from "../common";
import { perfAt } from "../sensors";
import { chartsForRoom, loadCharts } from "./charts";
import { BuzzButton, clipSeconds, CoverLabel, playClip, PoolPicker, SongReveal, SongStatus, StageDots, stageNow, startSong, TuneTitle, useSongAudio, Vinyl } from "./parts";
import "../../styles/party.css";

export function NetTune({ v, onLeave }: { v: TuneView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf, now, offset } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const seat = (id: string) => seats.find((s) => s.id === id);
  const songs = v.mode === "songs";
  const melody = v.mode === "melody";
  const djMode = v.mode === "dj";
  const dj = djMode ? room?.host : null;
  const iAmDj = djMode && isHost;
  const locked = v.locked.includes(me);
  const buzzerIsMe = v.buzzer === me;

  // the game has its own soundtrack: the lounge music waits
  useEffect(() => holdBackground(), []);

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
  const canPlay = audio.status === "ready" || audio.status === "failed";
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

  // stage ticks over while listening
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (v.phase !== "listen") return;
    setStage(stageNow(v.stageAt, now()));
    const timers = v.stageAt.map((at, i) => window.setTimeout(() => setStage(i), Math.max(0, at - now())));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, stageKey]);

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
    sfx.buzz(Math.max(0, seats.findIndex((s) => s.id === v.buzzer)));
    haptic(buzzerIsMe ? [30, 40, 30] : 15);
  });

  const rules = (
    <p>
      {zh
        ? "真歌模式：所有手机同时放同一首歌的 30 秒试听，华语、英文或者混着来，越早听出来分越高：前 8 秒答对 3 分，18 秒前 2 分，之后 1 分。知道就抢答，从四个歌名里选。答错喝一口，这首就不能再抢。揭晓时可以去 Apple Music 听完整版。旋律模式：手机一起放经典旋律，不用联网也能玩。DJ 模式：主人用自己的音乐 App 放歌，其他人抢答，主人判对错，答对 1 分。最后得分最低的喝两口。"
        : "Real songs: every phone plays the same 30-second preview of a real song, Chinese, English or both. The sooner you name it, the more it's worth: 3 points in the first 8 seconds, 2 before 18, then 1. Know it? Buzz and pick the title from four. A wrong answer is a sip and locks you out of that song. The reveal links to the full song on Apple Music. Melody mode: every phone plays a classic tune on the synth, no internet needed. DJ mode: the host plays songs from their own music app, everyone else buzzes, the host says right or wrong (1 point). Lowest score drinks two."}
    </p>
  );

  const scoreRows = seats
    .filter((s) => !djMode || s.id !== dj)
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
            <Vinyl spinning={v.phase === "listen" && (djMode || started)} label={recordLabel} />
            {!djMode && <StageDots stage={stage} />}
            {songs && <SongStatus audio={audio} playing={started} />}

            {v.phase === "listen" &&
              (iAmDj ? (
                <p className="tn-dj-note">{zh ? "放你的歌，有人抢答会在这里显示" : "Play your song. Buzzes show up here."}</p>
              ) : (
                <>
                  <BuzzButton
                    locked={locked}
                    onBuzz={() => {
                      g("buzz");
                      haptic(25);
                    }}
                  />
                  <p className="hint" style={{ textAlign: "center" }}>
                    {locked ? (zh ? "这首你答错了，等下一首" : "You missed this one. Next song.") : zh ? "知道是什么歌就抢" : "Know it? Buzz."}
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
                    {v.options.map((o) => (
                      <button key={o} type="button" className="tn-option" disabled={!buzzerIsMe} onClick={() => g("answer", { choice: o })}>
                        <strong>{zh ? TUNES[o].title.zh : TUNES[o].title.en}</strong>
                        <small>{zh ? TUNES[o].title.en : TUNES[o].title.zh}</small>
                      </button>
                    ))}
                  </div>
                )}
                {songs && v.choices && (
                  <div className="tn-options">
                    {v.choices.map((c) => (
                      <button key={c.id} type="button" className="tn-option" disabled={!buzzerIsMe} onClick={() => g("answer", { choice: c.id })}>
                        <strong>{c.t}</strong>
                        <small>{zh ? c.a : c.ae}</small>
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
                {v.last.pid === me ? (zh ? "答错了，喝一口" : "Wrong. Take a sip.") : zh ? `${nameOf(v.last.pid)} 答错了` : `${nameOf(v.last.pid)} got it wrong`}
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
                <Vinyl spinning label={<CoverLabel art={v.song.art} />} />
                <SongReveal song={v.song} />
              </>
            ) : melody ? (
              <TuneTitle tune={v.tune} />
            ) : null}
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
            <Leaderboard rows={scoreRows} />
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
