import { Disc3, ListMusic, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../../online/RoomContext";
import { heatLean } from "../../../shared/dj/curve";
import { COLD_LEAN, countdown, hintFor, offAir } from "../../../shared/dj/deck";
import { MIX_FX, PAD_IDS, type PadId } from "../../../shared/dj/types";
import type { DjView } from "../../../shared/protocol";
import { confetti } from "../../../lib/confetti";
import { useStore } from "../../../store";
import { STYLE_NAMES } from "../parts";
import { CLIP_CREDIT, hintText, jukeText, MIX_EFFECTS, mixSaid, PADS, reqLine } from "./words";
// the design tokens (docs/DESIGN.md) aren't loaded site-wide yet: the deck brings them (same values as global.css)
import "../../../styles/tokens.css";
import "../../../styles/dj-deck.css";
import { useDjNames } from "../names";
import { SFX, type SfxCat } from "../../../shared/dj/sfx";
import { SFX_ICON } from "../sfx/look";

const L = (x: { zh: string; en: string }, zh: boolean) => (zh ? x.zh : x.en);

/**
 * 打碟 · DJ Booth on the big screen, up top: the song asked for that's up next (Steve on Nov 14: "这大个
 * 部分可以删了，只保留我圈出来的部分": the decks, the crossfader, the song on the air and the mixer that
 * were round it are gone; the song playing says itself on its video). `clip`: the song on the air is
 * playing its clip here (Apple Music's preview, then the DJ's remix): Apple's credit, under it.
 */
export function UpNext({ v, clip = false }: { v: DjView; clip?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const nameOf = useDjNames(zh);
  const d = v.deck;
  if (!d.up && !clip) return null;
  return (
    <div className="dk-up">
      {d.up && (
        <span className="dk-req is-up">
          <ListMusic size={26} aria-hidden="true" />
          <span>
            {zh ? `下一首：${reqLine(d.up, nameOf(d.up.by), zh)}` : `Up next: ${reqLine(d.up, nameOf(d.up.by), zh)}`}
            {d.reqs.length > 0 && <small>{zh ? ` · 歌单里还有 ${d.reqs.length} 首${v.shuffle ? "，随机放" : ""}` : ` · ${d.reqs.length} more on the playlist${v.shuffle ? ", shuffled" : ""}`}</small>}
          </span>
        </span>
      )}
      {clip && <small className="dk-up-credit">{L(CLIP_CREDIT, zh)}</small>}
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
  // (点歌模式's switch into the next song: nothing to count down to, nothing to press)
  if (!d.drop || d.drop.quiet || !c) return null;
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
  // (on the drop's time, not the view's object: every view brings a new one, and the moment's
  // timer must outlive them, or the celebration stays up until the next drop)
  const at = last?.at ?? 0;
  useEffect(() => {
    if (!last || at === seen.current) return;
    seen.current = at;
    // (点歌模式's switch into the next song: no party)
    if (last.quiet) return;
    setShow(last);
    const id = window.setTimeout(() => setShow(null), 3200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
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
  // a drop into a whole song from YouTube: up top, clear of the song's player (which starts on it),
  // and no style named (the song plays, not the deck)
  const song = !!v.deck.song;
  return (
    <div className={`dk-dropped ${perfect.length ? "is-perfect" : ""} ${song ? "is-song" : ""}`} role="status">
      <canvas ref={canvas} className="dk-confetti" aria-hidden="true" />
      <span className="dk-dropped-word">{perfect.length ? (zh ? "完美 Drop" : "Perfect drop") : "DROP"}</span>
      <span className="dk-dropped-who">
        {show.auto ? (zh ? "DJ 帮大家按了" : "The DJ pressed it for you") : (perfect.length ? perfect : all).slice(0, 5).join(zh ? "、" : ", ")}
        {!song && <span className="dk-dropped-style"> · {L(STYLE_NAMES[show.style], zh)}</span>}
      </span>
    </div>
  );
}

type Chip = { id: number; text: string; kind: PadId | "req" | "mix" | `sfx-${SfxCat}`; icon: LucideIcon };

/** Who pressed which pad or sound (played on the speaker, `play` and `playSfx`) or asked for a song, for a moment. */
export function usePadEvents(play: (pad: PadId) => void, playSfx?: (i: number) => void) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const nameOf = useDjNames(zh);
  const [chips, setChips] = useState<Chip[]>([]);
  const seq = useRef(0);
  useRoomEvent((e) => {
    if (e.k !== "fx" || !e.pid || (e.fx !== "pad" && e.fx !== "req" && e.fx !== "mix" && e.fx !== "sfx")) return;
    let chip: Omit<Chip, "id">;
    if (e.fx === "req") chip = { text: zh ? `${nameOf(e.pid)} 点了一首歌` : `${nameOf(e.pid)} asked for a song`, kind: "req", icon: ListMusic };
    else if (e.fx === "sfx") {
      // the sound board (Steve's own sounds, Nov 13)
      const i = e.data?.[0] ?? -1;
      const x = SFX[i];
      if (!x) return;
      playSfx?.(i);
      chip = { text: `${nameOf(e.pid)} · ${L(x, zh)}`, kind: `sfx-${x.cat}`, icon: SFX_ICON[x.cat] };
    }
    else if (e.fx === "mix") {
      const f = MIX_FX[e.data?.[0] ?? -1];
      chip = { text: mixSaid(nameOf(e.pid), e.data, zh), kind: "mix", icon: f ? MIX_EFFECTS[f].icon : SlidersHorizontal };
    } else {
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

/** Who did what, for a moment, under the song up next. */
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
  if (v.juke && live) {
    // (读场: a floor that's dragging between songs is told to ask for one everyone loves)
    const cold = !d.song && !d.paused && heatLean(v.fires, v.colds, now()) <= COLD_LEAN;
    return (
      <p className={`dk-hint ${cold ? "is-cold" : ""}`}>
        <ListMusic size={24} aria-hidden="true" />
        {cold ? hintText("cold", offAir(d), zh, true) : jukeText(!!d.song, !!d.up, zh, !!d.paused)}
      </p>
    );
  }
  const h = hintFor(d, now(), live, v.source === "lyria", heatLean(v.fires, v.colds, now()) <= COLD_LEAN);
  if (!h || h === "countdown") return null;
  return (
    <p className={`dk-hint ${h === "cold" ? "is-cold" : ""}`}>
      <Disc3 size={24} aria-hidden="true" />
      {hintText(h, offAir(d), zh, d.local)}
    </p>
  );
}
