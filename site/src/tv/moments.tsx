import { Check } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Glass } from "../components/Glass";
import { playPower } from "../games/rogueSounds";
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
 * across the screen as on the phones, the table code in a corner. The TV shows them, and so does a phone that only
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

/**
 * The penalty as every phone at the table shows it (components/PenaltyStamp): the room flashes,
 * the names, one huge word slammed down, and the glass sliding in beside it with its level dropping;
 * the table's own penalty (or a game's forfeit) in words instead of the glass, 免罪 in green. Here
 * it goes by itself after a few seconds, and a tick comes up by each name as that one taps "I
 * drank" on their phone.
 * `sound`: this screen sounds it too (a watching phone already does, with every phone at the table).
 */
export function TvPenalties({ room, sound }: { room: RoomView; sound: boolean }) {
  const { ui, lang } = useStore();
  const { drank } = useRoom();
  const [queue, setQueue] = useState<PenaltyEvent[]>([]);
  useRoomEvent((e) => {
    if (e.k === "penalty") setQueue((q) => [...q, e].slice(-4));
  });
  const cur = queue[0] ?? null;
  const ref = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(1);
  // a game's own forfeit (Drama's) comes first, as on the phones; then the host's own penalty
  const custom = cur ? (cur.say ? t(lang, cur.say) : room.penalty.trim()) : "";
  const safe = cur?.kind === "safe";
  const glass = !!cur && !safe && !custom;
  useLayoutEffect(() => {
    if (!cur) return;
    setLevel(1);
    const kind = cur.kind;
    const timers: number[] = [];
    if (sound) {
      if (kind === "safe") timers.push(window.setTimeout(() => sfx.safe(), 120));
      else {
        timers.push(window.setTimeout(() => sfx.stamp(0.7), 90));
        if (kind === "everyone") timers.push(window.setTimeout(() => sfx.clink(0.6), 560));
        if (!custom) timers.push(window.setTimeout(() => sfx.pour(kind === "full" ? 1.2 : kind === "two" ? 0.8 : 0.55, 0.6), 760));
      }
    }
    timers.push(window.setTimeout(() => setLevel(kind === "safe" ? 1 : kind === "full" ? 0.02 : kind === "two" ? 0.5 : 0.72), 700));
    const el = ref.current;
    const still = reduced();
    const tl = gsap.timeline();
    if (el && !still) {
      const q = gsap.utils.selector(el);
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.18 })
        .fromTo(q(".tv-stamp-flash"), { opacity: safe ? 0.55 : 0.9 }, { opacity: 0, duration: 0.7, ease: "power2.out" }, 0.06)
        .fromTo(q(".tv-stamp-names"), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, 0.05)
        .fromTo(q(".tv-stamp-seal"), { scale: 2.6, rotate: -16, opacity: 0 }, { scale: 1, rotate: -5, opacity: 1, duration: 0.42, ease: "back.out(2.2)" }, 0.08)
        .to(q(".tv-stamp-seal"), { rotate: -3, duration: 0.6, ease: "elastic.out(1.2, 0.35)" }, ">")
        .fromTo(q(".tv-stamp-second"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, 0.36)
        .fromTo(q(".tv-stamp-glass"), { x: 260, rotate: 10, opacity: 0 }, { x: 0, rotate: 0, opacity: 1, duration: 0.7, ease: "back.out(1.3)" }, 0.32)
        .fromTo(q(".tv-stamp-note"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.5);
      if (!safe) tl.fromTo(q(".tv-stamp-row"), { x: -16 }, { x: 0, duration: 0.55, ease: "elastic.out(1.6, 0.18)" }, 0.14);
    }
    // it goes by itself, fading out, a little after the phones' own stamp of a watcher does
    const life = safe ? 2600 : 4600;
    const next = () => setQueue((q) => q.slice(1));
    timers.push(
      window.setTimeout(() => {
        if (el && !still) gsap.to(el, { opacity: 0, duration: 0.3, onComplete: next });
        else next();
      }, life - (still ? 0 : 300)),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);
  if (!cur) return null;
  const everyone = cur.kind === "everyone";
  // done once, twice for two sips, or as many times as the game says (7-8-9's pot); a named forfeit once
  const n = timesOf(cur);
  const big = safe ? ui("safe") : custom || (lang === "zh" ? "喝" : "Drink");
  const second = safe ? (lang === "zh" ? "Safe" : "免罪") : custom ? (n > 1 ? `×${n}` : "") : cur.kind === "full" ? ui("finish") : everyone ? ui("everyoneDrinks") : cur.kind === "two" ? ui("twoSips") : ui("sip");
  const seats = cur.who.map((pid) => room.seats.find((s) => s.id === pid)).filter(Boolean) as SeatView[];
  const done = drank[cur.id] ?? [];
  const mark = custom ? ui("doneMark") : ui("drankMark");
  return (
    <div className={`tv-stamp ${safe ? "is-safe" : ""} ${custom && !safe ? "is-custom" : ""}`} ref={ref} role="status">
      <i className="tv-stamp-flash" aria-hidden="true" />
      <div className="tv-stamp-names">
        {everyone ? (
          <span className="tv-stamp-name">
            {custom ? ui("everyone") : ui("everyoneDrinks")}
            {done.length > 0 && <span className="tv-stamp-count tabular">{`${done.length}/${cur.who.length} ${mark}`}</span>}
          </span>
        ) : (
          seats.map((s) => (
            <span key={s.id} className={`tv-stamp-name ${done.includes(s.id) ? "is-done" : ""}`}>
              <SeatFace seat={s} size={72} />
              {s.name}
              {done.includes(s.id) && <Check size={44} strokeWidth={3} aria-label={mark} />}
            </span>
          ))
        )}
      </div>
      <div className="tv-stamp-row">
        <div className="tv-stamp-seal">
          <span className={`tv-stamp-big ${lang === "zh" && !custom ? "zh-display" : "en-display"}`}>{big}</span>
          {second && <span className="tv-stamp-second">{second}</span>}
        </div>
        {glass && (
          <div className="tv-stamp-glass">
            <Glass level={level} size={180} />
          </div>
        )}
      </div>
      {/* what brought it on (the award, the slice of the wheel), as under the phones' stamp */}
      {cur.note && <p className="tv-stamp-note">{t(lang, cur.note)}</p>}
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
        playPower("camera");
        return;
      case "nose":
        playPower("nose");
        return;
      case "wc":
        playPower("wc");
        return;
      case "trouble":
        playPower("trouble");
        return;
      case "buddy":
        window.setTimeout(() => playPower("buddy"), 1400);
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
