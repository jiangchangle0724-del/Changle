import { ListMusic, Smartphone } from "lucide-react";
import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GAMES } from "../../games/registry";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";

// the song box and the rest come with the phone's deck: loaded the first time the sheet opens
const SharedSongs = lazy(() => import("./SharedSongs"));

const GEL = GAMES.find((g) => g.id === "dj")?.gel;

/**
 * The shared phone (Steve on Nov 11: "公用手机（投屏电视）……这个手机是可以在YouTube上点歌的"): the
 * speaker page on one phone everyone shares, its screen mirrored to the TV, and the big screen's
 * own controls on any speaker. A 点歌 button over the stage, in the page's own pixels (a phone's
 * stage is drawn at under half size), opens the phones' player (暂停, 播放, 切歌, 上一曲, the video over
 * the whole TV), the song box and the playlist, all as the table's (the room takes them from the
 * speaker only). Held upright, a phone is asked to turn sideways: the TV shows the phone as it's
 * held, and a page can't turn an iPhone (an Android phone turned when the game's card opened this).
 */
export function SharedPhone({ v }: { v: DjView }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [open, setOpen] = useState(false);
  const d = v.deck;
  const waiting = d.reqs.length + (d.up ? 1 : 0);
  // its own YouTube player wants a tap on the video (an iPhone's, the night's first song): the sheet
  // gets out of the way, so the tap lands on the video
  const tap = !!d.tap;
  useEffect(() => {
    if (tap) setOpen(false);
  }, [tap]);
  return createPortal(
    <>
      {v.phase !== "end" && (
        <>
          <button type="button" className="dj-share-btn" style={{ ["--gel" as string]: GEL } as CSSProperties} onClick={() => setOpen(true)} aria-haspopup="dialog">
            <ListMusic size={26} aria-hidden="true" />
            <span>{zh ? "点歌" : "Songs"}</span>
            {waiting > 0 && (
              <span className="dj-share-n tabular" aria-label={zh ? `歌单 ${waiting} 首` : `${waiting} on the playlist`}>
                {waiting}
              </span>
            )}
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} lang={lang} title={zh ? "点歌" : "Ask for a song"} gel={GEL}>
            {open && (
              <Suspense fallback={<Skeleton lang={lang} lines={4} />}>
                <SharedSongs v={v} />
              </Suspense>
            )}
          </Sheet>
        </>
      )}
      <TurnSideways zh={zh} />
    </>,
    document.body,
  );
}

const UPRIGHT = "(orientation: portrait) and (pointer: coarse)";
const subscribe = (fn: () => void) => {
  const m = window.matchMedia(UPRIGHT);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};

/** A phone held upright, asked to turn sideways (once waved off, not again on this page). */
function TurnSideways({ zh }: { zh: boolean }) {
  const upright = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(UPRIGHT).matches,
    () => false,
  );
  const [kept, setKept] = useState(false);
  if (!upright || kept) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    <div className="dj-turn" role="dialog" aria-modal="true" aria-labelledby="dj-turn-title" style={{ ["--gel" as string]: GEL } as CSSProperties}>
      <Smartphone className="dj-turn-phone" size={76} strokeWidth={1.6} aria-hidden="true" />
      <p id="dj-turn-title" className="dj-turn-title">
        {zh ? "把手机横过来" : "Turn the phone sideways"}
      </p>
      <p className="dj-turn-text">
        {zh ? "投到电视上就是满屏。" : "On the TV it fills the screen. "}
        {ios
          ? zh
            ? "转不过来的话，打开控制中心，点掉竖排方向锁定（带锁的那个圆圈）。"
            : "If it won't turn, open Control Center and turn off Portrait Orientation Lock (the lock in a circle)."
          : zh
            ? "转不过来的话，从顶上往下滑，打开自动旋转。"
            : "If it won't turn, swipe down from the top and turn on Auto-rotate."}
      </p>
      <button type="button" className="btn btn-ghost" onClick={() => setKept(true)}>
        {zh ? "就竖着用" : "Keep it upright"}
      </button>
    </div>
  );
}
