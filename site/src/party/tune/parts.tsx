import { ExternalLink, Lock, Music } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { clipOf, TUNES, type Tune } from "../../data/tunes";
import { gsap, reduced } from "../../lib/anim";
import { playMelody, type TuneHandle } from "../../lib/music";
import { loadPreview, playElement, playPreview, type PreviewHandle } from "../../lib/preview";
import { isSfxEnabled } from "../../lib/sfx";
import type { SongPool } from "../../shared/songs";
import { useStore } from "../../store";

/** A tune by its place in the list, or the notes themselves (online, the server sends only the notes). */
type Playable = number | Tune;
const asTune = (t: Playable): Tune | undefined => (typeof t === "number" ? TUNES[t] : t);

/** Seconds a clip lasts at its tempo. */
export function clipSeconds(tune: Playable, stage: number) {
  const t = asTune(tune);
  if (!t) return 0;
  return (clipOf(t, stage).reduce((a, [, b]) => a + b, 0) * 60) / t.bpm;
}

/** Play one clip of a tune, now or at a moment on this phone's performance clock. */
export function playClip(tune: Playable, stage: number, startPerf?: number): TuneHandle | null {
  const t = asTune(tune);
  if (!t) return null;
  return playMelody(clipOf(t, stage), { bpm: t.bpm, inst: "musicbox", startPerf, volume: 1.1 });
}

/** A record that spins while the music plays. */
export function Vinyl({ spinning, label }: { spinning: boolean; label?: ReactNode }) {
  return (
    <div className={`vinyl ${spinning ? "is-spinning" : ""}`} aria-hidden="true">
      <span className="vinyl-disc">
        <span className="vinyl-label">{label}</span>
      </span>
      <span className="eq">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} style={{ animationDelay: `${-i * 0.17}s` }} />
        ))}
      </span>
    </div>
  );
}

/** Three clips, three prices: the sooner you get it, the more it's worth. */
export function StageDots({ stage }: { stage: number }) {
  const { lang } = useStore();
  return (
    <div className="stages" role="status">
      {[3, 2, 1].map((pts, i) => (
        <span key={pts} className={`stage ${i === stage ? "is-now" : i < stage ? "is-past" : ""}`}>
          <strong className="tabular">{pts}</strong>
          {lang === "zh" ? "分" : pts === 1 ? "pt" : "pts"}
        </span>
      ))}
    </div>
  );
}

/** The big round button. First phone to hit it gets to answer. */
export function BuzzButton({ onBuzz, locked, disabled, label }: { onBuzz: () => void; locked?: boolean; disabled?: boolean; label?: string }) {
  const { lang } = useStore();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className={`buzz ${locked ? "is-locked" : ""}`}
      disabled={disabled || locked}
      onPointerDown={(e) => {
        // fire on touch-down, not release: a buzzer is a race
        e.preventDefault();
        if (disabled || locked) return;
        onBuzz();
        if (!reduced() && ref.current) gsap.fromTo(ref.current, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" });
      }}
      onClick={(e) => {
        // keyboard presses arrive as clicks with no pointer behind them
        if (e.detail === 0 && !disabled && !locked) onBuzz();
      }}
    >
      {locked ? <Lock size={34} /> : <span>{label ?? (lang === "zh" ? "抢！" : "Buzz!")}</span>}
    </button>
  );
}

/** Which stage of the clip is on now (by the server's clock). */
export function stageNow(stageAt: number[], now: number) {
  let s = 0;
  stageAt.forEach((at, i) => {
    if (at <= now) s = i;
  });
  return s;
}

/** Title reveal, with the other language underneath. */
export function TuneTitle({ tune }: { tune: number }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const t = TUNES[tune];
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { y: 16, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.8)", clearProps: "transform,opacity" });
  }, [tune]);
  if (!t) return null;
  return (
    <div className="tune-title" ref={ref}>
      <strong>{lang === "zh" ? t.title.zh : t.title.en}</strong>
      <small>{lang === "zh" ? t.title.en : t.title.zh}</small>
    </div>
  );
}

/* ---------- real songs ---------- */

export type SongAudio = { url: string | null; buf: AudioBuffer | null; status: "idle" | "loading" | "ready" | "failed" | "muted" };

/** Load a preview as soon as its URL is known; `status` says whether this phone can play it. */
export function useSongAudio(url: string | null): SongAudio {
  const { sound } = useStore();
  const [st, setSt] = useState<SongAudio>({ url: null, buf: null, status: "idle" });
  useEffect(() => {
    if (!url) {
      setSt({ url: null, buf: null, status: "idle" });
      return;
    }
    if (!sound) {
      setSt({ url, buf: null, status: "muted" });
      return;
    }
    let gone = false;
    setSt({ url, buf: null, status: "loading" });
    void loadPreview(url).then((buf) => {
      if (!gone) setSt({ url, buf, status: buf ? "ready" : "failed" });
    });
    return () => {
      gone = true;
    };
  }, [url, sound]);
  return st;
}

/** Start a loaded preview at `offset` seconds, now or at a moment on the performance clock. */
export function startSong(a: SongAudio, opts: { startPerf?: number; offset?: number; seconds?: number; fadeIn?: number }): PreviewHandle | null {
  if (!isSfxEnabled()) return null;
  if (a.buf) return playPreview(a.buf, opts);
  if (a.status === "failed" && a.url) {
    const delayMs = opts.startPerf !== undefined ? opts.startPerf - performance.now() : 0;
    return playElement(a.url, { offset: opts.offset, delayMs, seconds: opts.seconds });
  }
  return null;
}

/** Chinese, English or both. */
export function PoolPicker({ pool, onPick, disabled }: { pool: SongPool; onPick: (p: SongPool) => void; disabled?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const opts: [SongPool, string][] = [
    ["mix", zh ? "中英混合" : "Both"],
    ["zh", zh ? "华语" : "Chinese"],
    ["en", zh ? "英文" : "English"],
  ];
  return (
    <div className="seg seg-sm" role="group" aria-label={zh ? "歌单" : "Songs"} style={{ alignSelf: "center" }}>
      {opts.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={pool === id} disabled={disabled} onClick={() => onPick(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Cover art in the middle of the record. */
export function CoverLabel({ art }: { art: string }) {
  const [ok, setOk] = useState(true);
  if (!art || !ok) return <Music size={30} strokeWidth={2.4} />;
  return <img className="vinyl-art" src={art} alt="" onError={() => setOk(false)} />;
}

/** The song, once it's out: title, artist, and a way to hear the rest of it. */
export function SongReveal({ song }: { song: { t: string; a: string; ae: string; url: string } }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { y: 16, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.8)", clearProps: "transform,opacity" });
  }, [song.url]);
  return (
    <div className="tune-title song-title" ref={ref}>
      <strong>{song.t}</strong>
      <small>{zh ? song.a : song.ae}</small>
      <a className="song-link" href={song.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={14} />
        {zh ? "在 Apple Music 听完整版" : "Listen on Apple Music"}
      </a>
    </div>
  );
}

/** Where this phone is with the song: loading, or can't play it at all. */
export function SongStatus({ audio, playing }: { audio: SongAudio; playing: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  if (audio.status === "loading" && playing) return <p className="hint song-status">{zh ? "歌在路上，马上就响" : "The song is on its way"}</p>;
  if (audio.status === "muted") return <p className="hint song-status">{zh ? "这台手机的声音关着，打开声音才听得到歌" : "Sound is off on this phone. Turn it on to hear the song."}</p>;
  return null;
}
