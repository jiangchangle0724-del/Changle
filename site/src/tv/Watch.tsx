import { Eye, Luggage, MonitorSpeaker, Volume2, VolumeX, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GAME_BY_ID } from "../games/registry";
import { audioRunning } from "../lib/audio/engine";
import { holdBackground } from "../lib/music";
import { unlockAudio } from "../lib/sfx";
import { setSoundEnabled } from "../lib/sound";
import { useRoom } from "../online/RoomContext";
import { useWakeLock } from "../party/sensors";
import { markWent, tripUrl } from "../party/trip/link";
import type { GameView, TripView } from "../shared/protocol";
import { useStore } from "../store";
import { TvCorner, TvPenalties, TvReactions } from "./moments";
import { siteHost } from "./parts";
import { TvView } from "./views";
import "../styles/tv.css";
import "../styles/tv-show.css";

/**
 * A phone that only watches, during a game: the big screen's view of it, full screen, to mirror
 * to a TV. Held sideways it fills the screen; held upright it lies on its side, so turning the
 * phone reads it, rotation lock or not. The screen stays awake. The show's sounds play here when
 * no big screen is showing this table (this phone is likely the one on the TV), or when asked to.
 * A few buttons fade in at a tap: play (back to a seat in the game), sound, language.
 */
export default function Watch({ v }: { v: GameView }) {
  const { room, act, status, code } = useRoom();
  const { lang, setLang, sound, setSound } = useStore();
  const zh = lang === "zh";
  useWakeLock(true);
  useEffect(() => {
    document.documentElement.classList.add("watch-mode");
    return () => document.documentElement.classList.remove("watch-mode");
  }, []);

  // whether this phone plays the show: by itself, when there is no big screen; a tap decides otherwise
  const [pick, setPick] = useState<boolean | null>(null);
  const want = pick ?? (room?.screens ?? 0) === 0;
  const armed = useArmed();
  const showSound = want && sound && armed;
  // the show brings its own sound: the lounge music waits
  useEffect(() => (showSound ? holdBackground() : undefined), [showSound]);
  const toggleSound = () => {
    if (want && sound) return setPick(false);
    setPick(true);
    if (!sound) {
      setSound(true);
      setSoundEnabled(true);
    }
    unlockAudio();
  };

  const [idle, wake] = useIdle(5000);
  const box = useBox();
  // upright, the stage lies on its side
  const turned = box.h > box.w;
  const W = turned ? box.h : box.w;
  const H = turned ? box.w : box.h;
  const k = Math.min(W / 1600, H / 900);

  let body: ReactNode;
  if (v.id === "trip") body = <TripAway v={v} />;
  else if (v.id === "dj") body = <DjAway />;
  else body = <TvView v={v} sound={showSound} fallback={<Loading />} />;

  return createPortal(
    <div className="watch" onPointerDown={wake} onKeyDown={wake}>
      <div className={`watch-turn ${turned ? "is-turned" : ""}`} style={{ width: W, height: H }}>
        <div className="watch-canvas" style={{ transform: `translate(-50%, -50%) scale(${k})`, ["--gel" as string]: GAME_BY_ID[v.id].gel } as CSSProperties}>
          {body}
          {v.id !== "dj" && v.id !== "trip" && <TvCorner code={code} />}
          <TvReactions />
          {/* (this phone already stamps a penalty out loud, as every phone at the table does) */}
          {room && <TvPenalties room={room} sound={false} />}
        </div>

        <p className={`watch-note ${idle && status === "open" ? "is-idle" : ""}`} role="status">
          {status === "open" ? <Eye size={16} /> : <WifiOff size={16} />}
          <span>
            {status !== "open"
              ? zh
                ? "正在重新连接…"
                : "Reconnecting…"
              : zh
                ? "旁观中：这个画面可以投屏到电视"
                : "Watching: mirror this screen to a TV"}
          </span>
        </p>
        {want && sound && !armed && (
          <button type="button" className="watch-gate" onClick={() => unlockAudio()}>
            <Volume2 size={18} />
            {zh ? "点一下，打开声音" : "Tap for sound"}
          </button>
        )}
        <div className={`watch-bar ${idle ? "is-idle" : ""}`}>
          <button type="button" className="watch-btn is-icon" onClick={() => setLang(zh ? "en" : "zh")} aria-label={zh ? "Switch to English" : "切换到中文"}>
            {zh ? "EN" : "中"}
          </button>
          <button
            type="button"
            className="watch-btn is-icon"
            aria-pressed={want && sound}
            onClick={toggleSound}
            aria-label={want && sound ? (zh ? "这台手机不放大屏的声音" : "No show sound on this phone") : zh ? "这台手机放大屏的声音" : "Play the show's sound on this phone"}
          >
            {want && sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button type="button" className="watch-btn is-main" onClick={() => act({ a: "watch", on: false })}>
            {zh ? "上桌" : "Play"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ the phone's own state */

/** Whether this phone's sound can play yet: a phone needs a tap first (an iPhone always does). */
function useArmed() {
  const [armed, setArmed] = useState(() => audioRunning());
  useEffect(() => {
    if (armed) return;
    const arm = () => {
      unlockAudio();
      setArmed(true);
    };
    const events = ["pointerup", "click", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, arm));
    return () => events.forEach((e) => window.removeEventListener(e, arm));
  }, [armed]);
  return armed;
}

/** The buttons show at first and after any tap, then fade, so a mirrored TV shows only the game. */
function useIdle(ms: number): [boolean, () => void] {
  const [idle, setIdle] = useState(false);
  const timer = useRef(0);
  const wake = () => {
    setIdle(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), ms);
  };
  useEffect(() => {
    wake();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [idle, wake];
}

/** The screen's size, kept up to date (a phone turning round, Safari's bars coming and going). */
function useBox() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [box, setBox] = useState(read);
  useLayoutEffect(() => {
    const on = () => setBox(read());
    on();
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return box;
}

/* ------------------------------------------------------------------ games with big screens of their own */

function Away({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="watch-away">
      <span className="watch-away-icon">
        <Icon size={78} strokeWidth={1.8} />
      </span>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="watch-away">
      <span className="tv-spinner" aria-hidden="true" />
    </div>
  );
}

/** 到此一游 plays on a page of its own, with a big screen of its own: the way there. */
function TripAway({ v }: { v: TripView }) {
  const { code } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  if (!v.code) return <Away icon={Luggage} title={zh ? "到此一游：等主人在手机上开局" : "Been There, Bought That: the host opens the game on their phone"} />;
  return (
    <Away
      icon={Luggage}
      title={zh ? "到此一游有自己的大屏" : "Been There, Bought That has a big screen of its own"}
      text={zh ? "地图、城市和每一步都在那一页上。打开它，这台手机就是大屏，投到电视上大家一起看。" : "The map, the cities and every move are on that page. Open it and this phone is the big screen, to mirror to a TV."}
    >
      <button
        type="button"
        className="tv-btn tv-btn-main"
        onClick={() => {
          markWent(v.code!, true);
          window.location.assign(tripUrl(v.code!, code, true));
        }}
      >
        {zh ? "打开到此一游的大屏" : "Open its big screen"}
      </button>
    </Away>
  );
}

/** The DJ booth's big screen is its speaker: the music and the lights come out of it. */
function DjAway() {
  const { code, room } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const on = (room?.screens ?? 0) > 0;
  const where = `${siteHost()}/tv/${code}`;
  return (
    <Away
      icon={MonitorSpeaker}
      title={zh ? "打碟的大屏就是音箱" : "The DJ booth's big screen is its speaker"}
      text={
        on
          ? zh
            ? `已经有一台音箱在放了。想让这台手机也当大屏，打开 ${where}。`
            : `A speaker is already playing. To make this phone a big screen too, open ${where}.`
          : zh
            ? `音乐和灯光都从那一页出来：${where}。打开它，这台手机就是音箱，可以投到电视。`
            : `The music and the lights come from that page: ${where}. Open it and this phone is the speaker, to mirror to a TV.`
      }
    >
      <button type="button" className="tv-btn tv-btn-main" onClick={() => window.location.assign(`/tv/${code}`)}>
        {zh ? "打开音箱页" : "Open the speaker page"}
      </button>
    </Away>
  );
}
