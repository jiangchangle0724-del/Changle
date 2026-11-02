import { Disc3, ListMusic, Music2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../../online/RoomContext";
import { chargeNow, countdown, cued, hintFor, loaded, offAir, onAir } from "../../../shared/dj/deck";
import { DECK, PAD_IDS, type DeckSide, type PadId } from "../../../shared/dj/types";
import type { DjView } from "../../../shared/protocol";
import { confetti } from "../../../lib/confetti";
import { useStore } from "../../../store";
import { NowPlaying, STYLE_NAMES } from "../parts";
import { hintText, nowLine, PADS, reqLine } from "./words";
// the design tokens (docs/DESIGN.md) aren't loaded site-wide yet: the deck brings them (same values as global.css)
import "../../../styles/tokens.css";
import "../../../styles/dj-deck.css";

const L = (x: { zh: string; en: string }, zh: boolean) => (zh ? x.zh : x.en);

/**
 * 打碟 · DJ Booth: the beginner deck on the big screen. The two decks with their styles (the one
 * on the air turning), the songs asked for (the one playing, the one up next), the crossfader and
 * who has it, the build-up's meter, the countdown to the drop, who did what, and the next thing a
 * beginner could try.
 */
export function DeckBoard({ v }: { v: DjView }) {
  const { now, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const d = v.deck;
  const live = v.phase !== "wait" && v.phase !== "end";
  const t = now();
  useTicker(live && (chargeNow(d, t) > 0 || !!d.drop || (!!d.faderBy && t - d.faderAt < DECK.faderHoldMs)), 100);
  const on = onAir(d);
  const level = chargeNow(d, t);
  const held = !!d.faderBy && t - d.faderAt < DECK.faderHoldMs;
  const cue = cued(d, v.source === "lyria");
  const loading = cue ? null : loaded(d);
  const deck = (side: DeckSide) => {
    const style = side === "a" ? d.a : d.b;
    const gain = side === "a" ? Math.cos((d.fader * Math.PI) / 2) : Math.sin((d.fader * Math.PI) / 2);
    return (
      <div className={`dk-deck ${on === side ? "is-on" : ""} ${cue === side ? "is-cued" : ""}`} style={{ ["--gain" as string]: gain } as CSSProperties}>
        <span className="dk-record" aria-hidden="true" />
        <span className="dk-style">
          <span className="dk-side">{side.toUpperCase()}</span> {style ? L(STYLE_NAMES[style], zh) : zh ? "空着" : "Empty"}
        </span>
        {cue === side && <span className="dk-cued">{zh ? "下一首" : "Up next"}</span>}
        {loading === side && <span className="dk-cued is-loading">{zh ? "准备中" : "Loading"}</span>}
      </div>
    );
  };
  return (
    <div className={`dk-board ${live ? "is-live" : ""}`}>
      {deck("a")}
      <div className="dk-mid">
        <NowPlaying v={v} />
        {d.now && (
          <span className="dk-req is-now">
            <Music2 size={24} aria-hidden="true" />
            <span>{nowLine(d.now, nameOf(d.now.by), zh)}</span>
          </span>
        )}
        {d.up && (
          <span className="dk-req is-up">
            <ListMusic size={24} aria-hidden="true" />
            <span>
              {zh ? `下一首：${reqLine(d.up, nameOf(d.up.by), zh)}` : `Up next: ${reqLine(d.up, nameOf(d.up.by), zh)}`}
              {d.reqs.length > 0 && <small>{zh ? ` · 后面还有 ${d.reqs.length} 首` : ` · ${d.reqs.length} more waiting`}</small>}
            </span>
          </span>
        )}
        <div className="dk-fader" aria-hidden="true">
          <span className="dk-fader-end">A</span>
          <span className="dk-fader-track">
            <span className="dk-fader-knob" style={{ ["--x" as string]: d.fader } as CSSProperties} />
          </span>
          <span className="dk-fader-end">B</span>
        </div>
        <span className="dk-fader-who">{held ? (zh ? `${nameOf(d.faderBy!)} 在推推子` : `${nameOf(d.faderBy!)} on the crossfader`) : " "}</span>
        <div className={`dk-meter ${d.drop ? "is-full" : ""}`} style={{ ["--level" as string]: level } as CSSProperties}>
          <span className="dk-meter-fill" />
          <span className="dk-meter-word">{zh ? "蓄力" : "Build-up"}</span>
          <span className="dk-meter-pct tabular">{Math.round(level * 100)}%</span>
        </div>
      </div>
      {deck("b")}
    </div>
  );
}

/** The countdown to the drop, big, on the beat. */
export function Countdown({ v }: { v: DjView }) {
  const { now } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const d = v.deck;
  useTicker(!!d.drop, 40);
  const c = countdown(d.drop, d.grid, now());
  if (!d.drop || !c) return null;
  return (
    <div className={`dk-count is-${c}`} role="status" aria-live="assertive">
      <span key={c} className="dk-count-n">
        {c === "drop" ? "DROP" : c}
      </span>
      <span className="dk-count-line">{c === "drop" ? (zh ? "现在按" : "Press it now") : zh ? "手机上准备按 DROP" : "Get ready to press DROP"}</span>
    </div>
  );
}

/** A drop landed: who pressed, and a perfect one gets the confetti. */
export function DropParty({ v }: { v: DjView }) {
  const { nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const last = v.deck.last;
  const seen = useRef(last?.at ?? 0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState<typeof last>(null);
  useEffect(() => {
    if (!last || last.at === seen.current) return;
    seen.current = last.at;
    setShow(last);
    const id = window.setTimeout(() => setShow(null), 3200);
    return () => window.clearTimeout(id);
  }, [last]);
  useEffect(() => {
    // from both sides of the floor, clear of the names
    if (show?.hits.some((h) => h.grade === "perfect")) {
      confetti(canvas.current, { x: 0.12, y: 0.62, count: 140, angle: -60, spread: 40, power: 18 });
      confetti(canvas.current, { x: 0.88, y: 0.62, count: 140, angle: -120, spread: 40, power: 18 });
    }
  }, [show]);
  if (!show) return <canvas ref={canvas} className="dk-confetti" aria-hidden="true" />;
  const perfect = show.hits.filter((h) => h.grade === "perfect").map((h) => nameOf(h.pid));
  const all = show.hits.map((h) => nameOf(h.pid));
  return (
    <div className={`dk-dropped ${perfect.length ? "is-perfect" : ""}`} role="status">
      <canvas ref={canvas} className="dk-confetti" aria-hidden="true" />
      <span className="dk-dropped-word">{perfect.length ? (zh ? "完美 Drop" : "Perfect drop") : "DROP"}</span>
      <span className="dk-dropped-who">
        {show.auto ? (zh ? "DJ 帮大家按了" : "The DJ pressed it for you") : (perfect.length ? perfect : all).slice(0, 5).join(zh ? "、" : ", ")}
        <span className="dk-dropped-style"> · {L(STYLE_NAMES[show.style], zh)}</span>
      </span>
    </div>
  );
}

type Chip = { id: number; text: string; kind: PadId | "req"; icon: LucideIcon };

/** Who pressed which pad (the pad itself played on the speaker) or asked for a song, for a moment. */
export function usePadEvents(play: (pad: PadId) => void) {
  const { nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const [chips, setChips] = useState<Chip[]>([]);
  const seq = useRef(0);
  useRoomEvent((e) => {
    if (e.k !== "fx" || !e.pid || (e.fx !== "pad" && e.fx !== "req")) return;
    let chip: Omit<Chip, "id">;
    if (e.fx === "req") chip = { text: zh ? `${nameOf(e.pid)} 点了一首歌` : `${nameOf(e.pid)} asked for a song`, kind: "req", icon: ListMusic };
    else {
      const pad = PAD_IDS[e.data?.[0] ?? -1];
      if (!pad) return;
      play(pad);
      chip = { text: `${nameOf(e.pid)} · ${L(PADS[pad].name, zh)}`, kind: pad, icon: PADS[pad].icon };
    }
    const id = ++seq.current;
    setChips((l) => [...l.slice(-3), { id, ...chip }]);
    window.setTimeout(() => setChips((l) => l.filter((c) => c.id !== id)), chip.kind === "req" ? 3200 : 2200);
  });
  return chips;
}

export function PadChips({ chips }: { chips: Chip[] }) {
  return (
    <div className="dk-chips" aria-live="polite">
      {chips.map((c) => {
        const Icon = c.icon;
        return (
          <span key={c.id} className={`dk-chip is-${c.kind}`}>
            <Icon size={24} aria-hidden="true" />
            {c.text}
          </span>
        );
      })}
    </div>
  );
}

/** The next thing a beginner could try, under the floor. */
export function HintLine({ v }: { v: DjView }) {
  const { now } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const live = v.phase !== "wait" && v.phase !== "end";
  useTicker(live, 3000);
  const d = v.deck;
  const h = hintFor(d, now(), live, v.source === "lyria");
  if (!h || h === "countdown") return null;
  return (
    <p className="dk-hint">
      <Disc3 size={24} aria-hidden="true" />
      {hintText(h, offAir(d), zh)}
    </p>
  );
}
