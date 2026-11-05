import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { gsap, reduced } from "../lib/anim";
import { sfx } from "../lib/sfx";
import { useReactionLabel } from "../online/Overlays";
import { SeatFace } from "../online/People";
import { useRoom, useRoomEvent } from "../online/RoomContext";
import { timesOf, type PenaltyEvent, type Reaction, type RoomView, type SeatView } from "../shared/protocol";
import { useStore } from "../store";
import { joinLink, useQr } from "./parts";

/**
 * The room's moments on a big screen, over any game: reactions floating up, the penalty stamped
 * along the bottom, the table code in a corner. The TV shows them, and so does a phone that only
 * watches (the one that may be mirrored to a TV).
 */

type Float = { id: number; r: Reaction; name: string; x: number };

export function TvReactions() {
  const { nameOf } = useRoom();
  const { lang } = useStore();
  const label = useReactionLabel();
  const [items, setItems] = useState<Float[]>([]);
  const seq = useRef(0);
  useRoomEvent((e) => {
    if (e.k !== "react") return;
    const id = ++seq.current;
    const x = 8 + Math.random() * 84;
    setItems((list) => [...list.slice(-9), { id, r: e.r, name: nameOf(e.pid), x }]);
    window.setTimeout(() => setItems((list) => list.filter((f) => f.id !== id)), 3000);
  });
  return (
    <div className="tv-reacts" aria-hidden="true">
      {items.map((f) => (
        <span key={f.id} className={`tv-react tv-react-${f.r}`} style={{ left: `${f.x}%` }}>
          <span className={lang === "zh" ? "zh-display" : "en-display"}>{label(f.r)}</span>
          <small>{f.name}</small>
        </span>
      ))}
    </div>
  );
}

/** `sound`: this screen stamps it out loud (a watching phone already does, with every phone at the table). */
export function TvPenalties({ room, sound }: { room: RoomView; sound: boolean }) {
  const { ui, lang } = useStore();
  const [queue, setQueue] = useState<PenaltyEvent[]>([]);
  useRoomEvent((e) => {
    if (e.k === "penalty") setQueue((q) => [...q, e].slice(-4));
  });
  const cur = queue[0] ?? null;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!cur) return;
    if (sound && cur.kind !== "safe") sfx.stamp(0.7);
    const el = ref.current;
    if (el && !reduced()) gsap.fromTo(el, { scale: 2.2, rotate: -10, opacity: 0 }, { scale: 1, rotate: -3, opacity: 1, duration: 0.45, ease: "back.out(2.2)" });
    const id = window.setTimeout(() => setQueue((q) => q.slice(1)), cur.kind === "safe" ? 2600 : 4600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);
  if (!cur) return null;
  // a game's own forfeit (Drama's) comes first, as on the phones; then the host's own penalty
  const custom = cur.say ? t(lang, cur.say) : room.penalty;
  // done once, twice for two sips, or as many times as the game says (7-8-9's pot); a named forfeit once
  const n = timesOf(cur);
  const own = custom ? (n > 1 ? `${custom} ×${n}` : custom) : "";
  const what =
    cur.kind === "safe"
      ? ui("safe")
      : cur.kind === "full"
        ? own || ui("finish")
        : cur.kind === "everyone"
          ? own || ui("everyoneDrinks")
          : cur.kind === "two"
            ? own || ui("twoSips")
            : own || ui("sip");
  const seats = cur.kind === "everyone" ? [] : (cur.who.map((pid) => room.seats.find((s) => s.id === pid)).filter(Boolean) as SeatView[]);
  // the whole table: with drinking the line says so ("everyone drinks"); with the host's own penalty, name the table
  const who = cur.kind === "everyone" && custom ? ui("everyone") : seats.map((s) => s.name).join(lang === "zh" ? "、" : ", ");
  return (
    <div className={`tv-pen ${cur.kind === "safe" ? "is-safe" : ""}`} ref={ref} role="status">
      <span className="tv-pen-faces">
        {seats.map((s) => (
          <SeatFace key={s.id} seat={s} size={58} />
        ))}
      </span>
      <span className="tv-pen-text">
        <span className="tv-pen-who">{who}</span>
        <span className={`tv-pen-what ${lang === "zh" ? "zh-display" : "en-display"}`}>{what}</span>
      </span>
    </div>
  );
}

/** During a game: the code stays in a corner, so anyone arriving late can still sit down. */
export function TvCorner({ code }: { code: string }) {
  const { lang } = useStore();
  const qr = useQr(joinLink(code), "#0e0c22");
  return (
    <div className="tv-corner">
      <span className="tv-corner-qr">{qr && <span dangerouslySetInnerHTML={{ __html: qr }} />}</span>
      <span className="tv-corner-text">
        <span className="tv-corner-label">{lang === "zh" ? "扫码加入" : "Scan to join"}</span>
        <span className="tv-corner-code tabular">{code}</span>
      </span>
    </div>
  );
}

/**
 * The game's moments that every phone at the table sounds (a card dealt, a reveal, a right answer,
 * the win), sounded on the big screen too while it shows a game's own view. A phone that only
 * watches hears them already, as every phone does, so the views themselves never play these.
 */
export function useScreenFx(on: boolean) {
  useRoomEvent((e) => {
    if (!on || e.k !== "fx") return;
    switch (e.fx) {
      case "start":
        sfx.drum(0.8);
        window.setTimeout(() => sfx.gong("small", 0.9), 150);
        return;
      case "card":
        sfx.cardSlide();
        window.setTimeout(() => sfx.flip(), 160);
        return;
      case "reveal":
        sfx.reveal();
        return;
      case "correct":
        sfx.correct();
        return;
      case "wrong":
        sfx.wrong();
        return;
      case "crown":
        sfx.crown();
        return;
      case "win":
        sfx.win();
        return;
      // 流氓十三张's deck and powers, 七八九's dice (as every phone plays them: useTableSounds)
      case "shuffle":
        sfx.shuffle();
        return;
      case "camera":
        sfx.shutter();
        return;
      case "nose":
        sfx.honk();
        return;
      case "wc":
        sfx.woodblock(0.8, 0.8);
        window.setTimeout(() => sfx.safe(), 120);
        return;
      case "collide":
        sfx.clash();
        return;
      // 国王游戏: a number steps up for the order
      case "called":
        sfx.woodblock(1.2, 0.8);
        window.setTimeout(() => sfx.pop(), 90);
        return;
      case "grab":
        sfx.pluck(Math.min(10, Math.max(0, (e.data?.[0] ?? 2) - 2)), 0.9);
        return;
      case "dice": {
        sfx.dice(0.95, 0.9);
        const [a, b] = e.data ?? [0, 0];
        window.setTimeout(() => {
          if (a === 1 && b === 1) sfx.gong("small");
          else if (a + b === 7) sfx.pour(0.6);
          else if (a + b === 8 || a + b === 9) sfx.drum();
          else sfx.settle();
        }, 980);
        return;
      }
      // 林波舞: everyone got under the bar
      case "level":
        sfx.lift();
        return;
      // 尤克牌: a card lands on the table, then the trick is swept up
      case "play":
        sfx.cardSlide();
        window.setTimeout(() => sfx.flip(), 110);
        return;
      case "trick":
        sfx.whoosh(0.3, false);
        return;
      default:
        return;
    }
  });
}
