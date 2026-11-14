import { Music2, Pause, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DjView } from "../../shared/protocol";
import type { LocalSong } from "./local/LocalDj";
import type { Speaker } from "./speaker/speaker";

/** How fast the DJ lets go into the song, and how slowly it comes back after (as for a YouTube one). */
const LET_GO_S = 0.15;
const BACK_S = 3;
/** a song's sound fading in, and out when it's skipped or paused */
const FADE_S = 0.05;

type Playing = { key: string; src: AudioBufferSourceNode; gain: GainNode; stopped: boolean };

/** local runs: what the checks read (scripts/dj_mine_check.py): the song file playing, from where, and whether it still is */
function told(x: { id: string; local?: string; from: number; length: number } | null) {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __phoneSong?: { playing: boolean } };
  if (x) w.__phoneSong = { ...x, playing: true };
  else if (w.__phoneSong) w.__phoneSong = { ...w.__phoneSong, playing: false };
}

/**
 * 真歌时间 for a song file a player's phone sent (Steve on Nov 13: "要允许所有玩家都可以上传自己的歌上
 * 去，不仅是host"): it plays whole in this page's own sound (the music's on already: no tap), from the
 * room's moment for it; the DJ gives way while it plays and comes back after. The next one from a
 * phone is decoded while the one before plays, so it starts on time; one decoded late starts where
 * the room is in it. 暂停 stops it where it is; 播放 carries it on from there. A corner card says
 * whose it is and what it's called.
 */
export function PhoneSong({ v, crate, speaker, now, zh, nameOf, done }: { v: DjView; crate: LocalSong[]; speaker: Speaker | null; now: () => number; zh: boolean; nameOf: (pid: string) => string; done: (id: string) => void }) {
  const d = v.deck;
  const song = d.song?.local ? d.song : null;
  const file = song ? (crate.find((c) => c.id === song.local) ?? null) : null;
  const next = d.up?.local && !d.local ? (crate.find((c) => c.id === d.up!.local) ?? null) : null;
  const held = !!d.paused;
  const ctx = speaker?.ctx ?? null;
  // decoded songs: the one playing and the next (about 100 MB each for four minutes)
  const decoded = useRef(new Map<string, Promise<AudioBuffer | null>>());
  const playing = useRef<Playing | null>(null);
  const away = useRef(false);
  const latest = useRef({ done, now });
  latest.current = { done, now };
  const [missing, setMissing] = useState(false);

  const decode = (s: LocalSong): Promise<AudioBuffer | null> => {
    let p = decoded.current.get(s.id);
    if (!p && ctx) {
      p = s.file
        .arrayBuffer()
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null);
      decoded.current.set(s.id, p);
    }
    return p ?? Promise.resolve(null);
  };

  // ready ahead: the one playing and the next; any other let go
  const keepKey = `${file?.id ?? ""}|${next?.id ?? ""}`;
  useEffect(() => {
    for (const id of [...decoded.current.keys()]) if (id !== file?.id && id !== next?.id) decoded.current.delete(id);
    if (next) void decode(next);
    if (file) void decode(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepKey, ctx]);

  const stop = () => {
    const p = playing.current;
    if (!p) return;
    p.stopped = true;
    playing.current = null;
    told(null);
    try {
      const t = p.gain.context.currentTime;
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setTargetAtTime(0, t, FADE_S);
      p.src.stop(t + FADE_S * 5);
    } catch {
      /* already stopped */
    }
  };

  // its moment: play from where the room is in it; skipped, over or paused: stop
  const key = song && file ? `${song.id}@${song.at}` : "";
  useEffect(() => {
    setMissing(!!song && !file);
    if (song && !file) {
      // (this page doesn't have the file: opened again since it came. The next one comes on)
      latest.current.done(song.id);
      return;
    }
    if (!key || held || !ctx || !speaker || !file || !song) {
      stop();
      if (!song && away.current) {
        away.current = false;
        if (!held) speaker?.giveWay(false, BACK_S);
      }
      return;
    }
    if (playing.current?.key === key) return;
    stop();
    let gone = false;
    void decode(file).then((buf) => {
      if (gone) return;
      if (!buf) {
        latest.current.done(song.id);
        return;
      }
      const from = Math.max(0, (latest.current.now() - song.at) / 1000);
      if (from >= buf.duration - 0.5) {
        latest.current.done(song.id);
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.setTargetAtTime(1, t, FADE_S);
      src.connect(gain).connect(ctx.destination);
      const p: Playing = { key, src, gain, stopped: false };
      src.onended = () => {
        if (p.stopped) return;
        if (playing.current === p) playing.current = null;
        told(null);
        latest.current.done(song.id);
      };
      src.start(t, from);
      playing.current = p;
      away.current = true;
      speaker.giveWay(true, LET_GO_S);
      told({ id: song.id, local: song.local, from, length: buf.duration });
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, held, ctx, speaker, !!file]);

  // the page going: its song with it
  useEffect(
    () => () => {
      stop();
      if (away.current) speaker?.giveWay(false, 0.5);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!song || missing) return null;
  const req = d.now?.id === song.id ? d.now : (d.heard.at(-1)?.id === song.id ? d.heard.at(-1) : null) ?? null;
  // (the room's names for it: the worst words in a file's name starred)
  const title = req?.text ?? file?.title ?? "";
  const artist = req ? (req.artist ?? "") : (file?.artist ?? "");
  const after = d.up && d.up.id !== song.id ? d.up : null;
  return (
    <section className="dj-file" aria-label={zh ? "整首歌" : "The whole song"}>
      <span className="dj-file-head">
        <Music2 size={20} aria-hidden="true" />
        {zh ? `${nameOf(song.by)} 传的歌` : `${nameOf(song.by)}'s song, from their phone`}
      </span>
      <span className="dj-file-title">{title}</span>
      {artist && <span className="dj-file-artist">{artist}</span>}
      <span className="dj-file-note" role="status">
        {held ? (
          <>
            <Pause size={18} aria-hidden="true" />
            {zh ? "暂停了，手机上点「播放」接着放" : "Paused. Press Play on a phone to carry on"}
          </>
        ) : (
          <>
            <SkipForward size={16} aria-hidden="true" />
            {after
              ? zh
                ? `放完马上接 ${nameOf(after.by)} 点的歌。手机上可以暂停、切歌、上一曲`
                : `${nameOf(after.by)}'s song comes right after. Pause, skip or go back from any phone`
              : zh
                ? "放完 DJ 接着放。手机上可以暂停、切歌、上一曲"
                : "The DJ comes back when it ends. Pause, skip or go back from any phone"}
          </>
        )}
      </span>
    </section>
  );
}
