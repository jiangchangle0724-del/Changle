import { Hand, Loader2, Music2, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { onAir } from "../../shared/dj/deck";
import type { DjView } from "../../shared/protocol";
import type { Speaker } from "./speaker/speaker";
import { loadYt, Tube, type TubeStatus } from "./tube";
import { EmptyState } from "../../ui/EmptyState";
import "./states.css";

/** How fast the DJ lets go on the drop's bar into a whole song (the boom rings on over its start), and how slowly it comes back after. */
const LET_GO_S = 0.12;
const HEARD_S = 0.3;
const BACK_S = 3;

/** The song playing or about to: its server time, and (a drop's) the bar it starts on. */
type Target = { id: string; yt: string; by: string; at: number; bar?: number; room: boolean };

/**
 * 真歌时间 on the big screen (Steve on Nov 2: whole real songs, his plan's 观众点歌): a song asked for
 * from YouTube plays in YouTube's own player (never downloaded, never mixed). While it's up next it
 * waits in a corner of the TV, loaded and ready (tube.ts); on its drop's bar it starts and comes to
 * the middle, the DJ letting go with the drop's boom (Steve on Nov 4: the drop and the song should
 * meet). When it ends, or can't be played, the screen tells the room and the DJ comes back; the
 * player's phone or the host can skip it.
 */
export function TubePlayer({
  v,
  zh,
  nameOf,
  now,
  speaker,
  barTime,
  done,
  nosong,
}: {
  v: DjView;
  zh: boolean;
  nameOf: (pid: string) => string;
  now: () => number;
  speaker: Speaker | null;
  /** the audio time the speaker plays bar `bar` of its stream at (null: it can't say) */
  barTime: (bar: number) => number | null;
  done: (id: string) => void;
  nosong: (id: string) => void;
}) {
  const d = v.deck;
  const slot = useRef<HTMLDivElement>(null);
  const tube = useRef<Tube | null>(null);
  const [{ status, armed }, setState] = useState<{ status: TubeStatus; armed: boolean }>({ status: "idle", armed: true });
  // the song playing (the room's), or the one the drop under way goes into: it plays from the drop's
  // bar once someone has pressed in time, or the DJ drops it itself
  const up = d.up?.yt ? d.up : null;
  const drop = d.drop;
  const coming: Target | null = !d.song && up && drop && (drop.hits.length > 0 || drop.auto) && drop.to !== onAir(d) ? { id: up.id, yt: up.yt!, by: up.by, at: drop.at, bar: drop.bar, room: false } : null;
  const target: Target | null = d.song ? { ...d.song, room: true } : coming;
  // the song up next, got ready while the DJ plays
  const next = !target && up ? up : null;
  const latest = useRef({ target, next, speaker, now, barTime, done, nosong });
  latest.current = { target, next, speaker, now, barTime, done, nosong };
  /** the song the DJ has given way to (or is set to, on its drop's bar) */
  const away = useRef<{ yt: string } | null>(null);
  /**
   * When something heard at server time `at` is heard, on this page's clock (performance.now()):
   * for a drop's bar, from the speaker's own beat, exactly as it will play it; else from the room's
   * clock (a page's estimate of it can be a little off).
   */
  const whenOf = (at: number, bar?: number) => {
    const L = latest.current;
    const sp = L.speaker;
    if (sp && bar !== undefined && bar >= 0) {
      const t = L.barTime(bar);
      if (t !== null) return performance.now() + (t - sp.heardTime()) * 1000;
    }
    return performance.now() + (at - L.now());
  };
  const back = (seconds: number) => {
    if (!away.current) return;
    away.current = null;
    latest.current.speaker?.giveWay(false, seconds);
  };

  useEffect(() => {
    const t = new Tube({
      now: () => latest.current.now(),
      status: (s, a) => { setState({ status: s, armed: a }); if (s === "offline") back(0.6); },
      // its start is set (ready, and allowed to start by itself): the DJ lets go on that moment, the
      // drop's bar, the boom ringing on over the song's start (said again if the moment moves)
      timed: (yt, when) => {
        const L = latest.current;
        const sp = L.speaker;
        if (!sp || L.target?.yt !== yt) return;
        away.current = { yt };
        sp.giveWay(true, LET_GO_S, sp.heardTime() + (when - performance.now()) / 1000);
      },
      playing: (yt) => {
        const L = latest.current;
        // heard: the DJ gives way now, if it wasn't already set to on the drop's bar
        if (L.target?.yt !== yt || away.current?.yt === yt) return;
        away.current = { yt };
        L.speaker?.giveWay(true, HEARD_S);
      },
      // it won't start by itself (the browser wants a tap on it): the DJ plays on till it's heard
      blocked: () => back(0.6),
      ended: (yt) => {
        const L = latest.current;
        if (L.target?.yt === yt && L.target.room) L.done(L.target.id);
      },
      bad: (yt) => {
        const L = latest.current;
        // YouTube won't play it here: the room takes the video off it (its remix plays), or ends it
        if (L.target?.yt === yt) {
          back(0.6);
          if (L.target.room) L.done(L.target.id);
          else L.nosong(L.target.id);
        } else if (L.next?.yt === yt) L.nosong(L.next.id);
      },
    });
    if (slot.current) t.attach(slot.current);
    tube.current = t;
    // local runs: what the checks read (scripts/dj_youtube_check.py)
    if (import.meta.env.DEV) (window as unknown as { __tube: Tube }).__tube = t;
    setState({ status: t.status, armed: t.armed });
    // (the speaker lives as long as the page: back from any song an earlier screen gave way to)
    if (!latest.current.target) latest.current.speaker?.giveWay(false, 0.3);
    return () => {
      t.dispose();
      tube.current = null;
      back(0.5);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // YouTube's player loads as soon as a song from YouTube is asked for, not on its drop
  const asked = !!up || !!d.song || d.reqs.some((r) => !!r.yt);
  useEffect(() => {
    if (asked) void loadYt().catch(() => {});
  }, [asked]);

  // the song up next, ready in its corner (and still, as its drop comes: the drop plays it from there)
  const ready = next?.yt ?? (target && !target.room ? target.yt : null);
  useEffect(() => {
    tube.current?.prepare(ready);
  }, [ready]);

  // a drop on its way into it, nobody in time yet: a ready video rolls muted from just before the
  // bar, so a press that reaches the TV late still starts it right on the bar (tube.ts `expect`)
  const maybe = !d.song && up && drop && !coming && drop.to !== onAir(d) ? `${up.yt}@${drop.at}` : "";
  useEffect(() => {
    if (maybe && up?.yt && drop) tube.current?.expect(up.yt, drop.at, whenOf(drop.at, drop.bar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maybe]);

  // its drop: it plays from the bar
  const key = target ? `${target.id}:${target.yt}` : "";
  useEffect(() => {
    const t = tube.current;
    if (!t) return;
    const L = latest.current;
    if (!target) {
      // over, skipped, or the drop isn't going into it after all: the DJ comes back
      t.stop();
      back(BACK_S);
      t.prepare(L.next?.yt ?? null);
      return;
    }
    if (t.isBad(target.yt)) {
      if (target.room) L.done(target.id);
      else L.nosong(target.id);
      return;
    }
    // (ready, and allowed to start by itself, it says when through `timed`: the DJ lets go then;
    // else the DJ gives way once the song is heard)
    t.play(target.yt, target.at, whenOf(target.at, target.bar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, target?.at]);

  // on the TV, in its corner: playing once it's heard (or the room says it plays, or it wants a
  // tap), ready while it's up next and as its drop comes; over the whole TV while it plays when
  // someone asks from their phone; out of sight between songs (paused, kept)
  const heard = status === "playing" || status === "tap" || (status === "ad" && !!target);
  const mode = d.song || (target && heard) ? "on" : next || target ? "next" : "off";
  const who = target?.by ?? next?.by ?? null;
  const req = target && v.deck.now?.id === target.id ? v.deck.now : null;
  const title = req?.text ?? null;
  const after = v.deck.up && v.deck.up.id !== target?.id ? v.deck.up : null;
  return (
    <section className={`dj-tube is-${mode}${mode === "on" && v.full ? " is-full" : ""}${status === "offline" ? " is-offline" : ""}`} aria-hidden={mode === "off" ? true : undefined} aria-label={zh ? "整首歌" : "The whole song"}>
      <header className="dj-tube-head">
        <Music2 size={20} aria-hidden="true" />
        <span>
          {mode === "next"
            ? zh
              ? `下一首 · ${who ? `${nameOf(who)} 点的` : ""} YouTube 整首`
              : `Up next · ${who ? `${nameOf(who)}'s song, ` : ""}whole, from YouTube`
            : title
              ? zh
                ? `${who ? nameOf(who) : ""} 点的整首：${title}`
                : `${who ? nameOf(who) : ""}'s song, whole: ${title}`
              : zh
                ? `${who ? nameOf(who) : ""} 点的整首歌`
                : `${who ? nameOf(who) : ""}'s song, whole`}
        </span>
      </header>
      {/* YouTube's player goes in here (tube.ts): nothing of React's inside it */}
      <div className="dj-tube-slot" ref={slot} />
      <div className={`dj-tube-note ${status === "tap" || (mode === "next" && status === "ready" && !armed) ? "is-ask" : ""}`} role="status">
        {status === "offline" ? <EmptyState tone="error" title={zh ? "没连上 YouTube，检查一下网络" : "Couldn't reach YouTube. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => tube.current?.retry() }} /> : mode === "next" ? <NextNote status={status} armed={armed} zh={zh} /> : <OnNote status={status} zh={zh} after={after ? nameOf(after.by) : null} />}
      </div>
    </section>
  );
}

/** Under the song up next: how ready it is. */
function NextNote({ status, armed, zh }: { status: TubeStatus; armed: boolean; zh: boolean }) {
  if (status === "bad") return <>{zh ? "YouTube 不让这首在这里放，Drop 进去放 DJ 的 Remix" : "YouTube won't play this one here. Its drop plays the DJ's remix"}</>;
  if (status === "ad")
    return (
      <>
        <Loader2 size={16} className="dj-spin" aria-hidden="true" />
        {zh ? "YouTube 先放广告（静音），放完就准备好" : "YouTube is playing an ad first (muted). Ready once it's over"}
      </>
    );
  if (status === "ready" && !armed)
    return (
      <>
        <Hand size={18} aria-hidden="true" />
        {zh ? "这个浏览器要先点一下视频（会响一下），Drop 的时候它才能自己开始" : "This browser needs one tap on the video (it plays a moment) to start it by itself on the drop"}
      </>
    );
  if (status === "ready") return <>{zh ? "准备好了，Drop 进去马上放" : "Ready. It starts the moment you drop into it"}</>;
  return (
    <>
      <Loader2 size={16} className="dj-spin" aria-hidden="true" />
      {zh ? "正在准备，Drop 进去马上放" : "Getting it ready. It starts on the drop"}
    </>
  );
}

/** Under the song playing: what's happening, and what comes after. */
function OnNote({ status, zh, after }: { status: TubeStatus; zh: boolean; after: string | null }) {
  if (status === "tap")
    return (
      <>
        <Hand size={18} aria-hidden="true" />
        {zh ? "点一下视频开始放（这个浏览器要点一下才出声），DJ 先接着放" : "Tap the video to start it (this browser needs a tap for sound). The DJ plays on till then"}
      </>
    );
  if (status === "ad")
    return (
      <>
        <Loader2 size={16} className="dj-spin" aria-hidden="true" />
        {zh ? "YouTube 先放广告，放完就开始，DJ 先接着放" : "YouTube plays an ad first. The song starts after it, the DJ plays on till then"}
      </>
    );
  if (status !== "playing")
    return (
      <>
        <Loader2 size={16} className="dj-spin" aria-hidden="true" />
        {zh ? "马上开始" : "Starting"}
      </>
    );
  return (
    <>
      <SkipForward size={16} aria-hidden="true" />
      {after
        ? zh
          ? `放完 DJ 接一段，再放 ${after} 点的歌。点歌的人和主人在手机上可以切歌`
          : `When it ends the DJ plays a while, then ${after}'s song. Whoever asked, or the host, can skip it from their phone`
        : zh
          ? "放完 DJ 就回来。点歌的人和主人在手机上可以切歌"
          : "The DJ comes back when it ends. Whoever asked, or the host, can skip it from their phone"}
    </>
  );
}
