import { Music2, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DjView } from "../../shared/protocol";

type YtPlayer = { playVideo(): void; destroy(): void };
type YtApi = {
  Player: new (
    el: HTMLElement,
    o: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: { onReady?: (e: { target: YtPlayer }) => void; onStateChange?: (e: { data: number }) => void; onError?: () => void };
    },
  ) => YtPlayer;
};

/** YouTube's IFrame API, loaded once. */
let api: Promise<YtApi> | null = null;
function loadApi(): Promise<YtApi> {
  const w = window as unknown as { YT?: YtApi & { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
  api ??= new Promise((ok) => {
    if (w.YT?.Player) return ok(w.YT);
    const before = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      before?.();
      ok(w.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return api;
}

/** YouTube's player state for "ended". */
const ENDED = 0;

/**
 * 真歌时间 on the big screen (Steve on Nov 2: whole real songs, his plan's 观众点歌): a song asked for
 * from YouTube plays in YouTube's own player (never downloaded, never mixed), big, once the DJ has
 * faded out after its drop. When it ends, or can't be played, the screen tells the room and the DJ
 * comes back; the player's phone or the host can skip it.
 */
export function TubePlayer({ v, zh, nameOf, now, done }: { v: DjView; zh: boolean; nameOf: (pid: string) => string; now: () => number; done: (id: string) => void }) {
  const song = v.deck?.song ?? null;
  const slot = useRef<HTMLDivElement>(null);
  const [due, setDue] = useState(false);
  const [stuck, setStuck] = useState(false);
  const player = useRef<YtPlayer | null>(null);
  const id = song?.id ?? "";

  // its moment: when the DJ has faded out
  useEffect(() => {
    setDue(false);
    setStuck(false);
    if (!song) return;
    const wait = Math.max(0, song.at - now());
    const t = window.setTimeout(() => setDue(true), wait);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!song || !due || !slot.current) return;
    let gone = false;
    let started = false;
    const el = document.createElement("div");
    slot.current.appendChild(el);
    void loadApi().then((YT) => {
      if (gone) return;
      player.current = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        videoId: song.yt,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            e.target.playVideo();
            // (a browser that won't start it by itself: a tap on the screen does)
            window.setTimeout(() => !gone && !started && setStuck(true), 4000);
          },
          onStateChange: (e) => {
            if (e.data === ENDED) done(song.id);
            else if (e.data === 1) {
              started = true;
              setStuck(false);
            }
          },
          // private, removed, or not allowed here: the DJ comes back
          onError: () => done(song.id),
        },
      });
    });
    return () => {
      gone = true;
      player.current?.destroy();
      player.current = null;
      el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, due]);

  if (!song) return null;
  const req = v.deck.now?.id === song.id ? v.deck.now : null;
  // the playlist's next, after the DJ's turn
  const next = v.deck.up;
  const title = req?.text ?? null;
  return (
    <section className={`dj-tube ${due ? "is-on" : ""}`} aria-label={zh ? "整首歌" : "The whole song"}>
      <header className="dj-tube-head">
        <Music2 size={26} aria-hidden="true" />
        <span>{title ? (zh ? `${nameOf(song.by)} 点的整首：${title}` : `${nameOf(song.by)}'s song, whole: ${title}`) : zh ? `${nameOf(song.by)} 点的整首歌` : `${nameOf(song.by)}'s song, whole`}</span>
      </header>
      <div className="dj-tube-slot" ref={slot}>
        {!due && <span className="dj-tube-wait">{zh ? "DJ 淡出，马上开始" : "The DJ fades out. Starting in a moment"}</span>}
      </div>
      <p className="dj-tube-note">
        <SkipForward size={16} aria-hidden="true" />
        {stuck
          ? zh
            ? "没自己开始的话，点一下视频"
            : "If it hasn't started, tap the video"
          : next
            ? zh
              ? `放完 DJ 接一段，再放 ${nameOf(next.by)} 点的歌。点歌的人和主人在手机上可以切歌`
              : `When it ends the DJ plays a while, then ${nameOf(next.by)}'s song. Whoever asked, or the host, can skip it from their phone`
            : zh
              ? "放完 DJ 就回来；点歌的人和主人在手机上可以切歌"
              : "The DJ comes back when it ends; whoever asked, or the host, can skip it from their phone"}
      </p>
    </section>
  );
}
