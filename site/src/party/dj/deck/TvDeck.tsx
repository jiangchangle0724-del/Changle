import { Disc3, ListMusic, Music2, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../../online/RoomContext";
import { heatLean } from "../../../shared/dj/curve";
import { chargeNow, COLD_LEAN, countdown, cued, hintFor, loaded, offAir, onAir } from "../../../shared/dj/deck";
import { DECK, MIX_FX, MIX_KNOBS, PAD_IDS, type DeckSide, type MixerState, type PadId } from "../../../shared/dj/types";
import type { DjView } from "../../../shared/protocol";
import { confetti } from "../../../lib/confetti";
import { useStore } from "../../../store";
import { NowPlaying, STYLE_NAMES } from "../parts";
import { CLIP_CREDIT, hintText, jukeText, KNOBS, MIX_EFFECTS, mixSaid, nowLine, PADS, reqLine } from "./words";
// the design tokens (docs/DESIGN.md) aren't loaded site-wide yet: the deck brings them (same values as global.css)
import "../../../styles/tokens.css";
import "../../../styles/dj-deck.css";
import { useDjNames } from "../names";
import { SFX, type SfxCat } from "../../../shared/dj/sfx";
import { SFX_ICON } from "../sfx/look";

const L = (x: { zh: string; en: string }, zh: boolean) => (zh ? x.zh : x.en);

/**
 * 打碟 · DJ Booth: the beginner deck on the big screen. The two decks with their styles (the one
 * on the air turning), the songs asked for (the one playing, the one up next), the crossfader and
 * who has it, the build-up's meter, the countdown to the drop, who did what, and the next thing a
 * beginner could try.
 */
/** `clip`: the song asked for that's on the air is playing its clip here (not only its remix). */
export function DeckBoard({ v, clip = false }: { v: DjView; clip?: boolean }) {
  const { now } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const nameOf = useDjNames(zh);
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
    // (a night of the host's songs: the deck's song by name)
    const song = d.local ? v.onDecks[side] : null;
    const gain = side === "a" ? Math.cos((d.fader * Math.PI) / 2) : Math.sin((d.fader * Math.PI) / 2);
    return (
      <div className={`dk-deck ${on === side ? "is-on" : ""} ${cue === side ? "is-cued" : ""}`} style={{ ["--gain" as string]: gain } as CSSProperties}>
        <span className="dk-record" aria-hidden="true" />
        <span className="dk-style">
          <span className="dk-side">{side.toUpperCase()}</span> {d.local ? (song ? song.t : zh ? "准备中" : "Loading") : style ? L(STYLE_NAMES[style], zh) : zh ? "空着" : "Empty"}
        </span>
        {song?.a && <span className="dk-artist">{song.a}</span>}
        {cue === side && <span className="dk-cued">{zh ? "下一首" : "Up next"}</span>}
        {loading === side && <span className="dk-cued is-loading">{zh ? "准备中" : "Loading"}</span>}
      </div>
    );
  };
  return (
    <div className={`dk-board ${live ? "is-live" : ""}`}>
      {deck("a")}
      <div className="dk-mid">
        <NowPlaying v={v} song={d.local ? v.onDecks[on] : null} />
        {d.now && (
          <span className="dk-req is-now">
            <Music2 size={24} aria-hidden="true" />
            <span>
              {nowLine(d.now, nameOf(d.now.by), zh, clip || d.song?.id === d.now.id)}
              {clip && <small className="dk-req-credit">{L(CLIP_CREDIT, zh)}</small>}
            </span>
          </span>
        )}
        {d.up && (
          <span className="dk-req is-up">
            <ListMusic size={24} aria-hidden="true" />
            <span>
              {zh ? `下一首：${reqLine(d.up, nameOf(d.up.by), zh)}` : `Up next: ${reqLine(d.up, nameOf(d.up.by), zh)}`}
              {d.reqs.length > 0 && <small>{zh ? ` · 歌单里还有 ${d.reqs.length} 首${v.shuffle ? "，随机放" : ""}` : ` · ${d.reqs.length} more on the playlist${v.shuffle ? ", shuffled" : ""}`}</small>}
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
        {v.juke ? (
          // 点歌模式: no build-up to fill
          <div className="dk-meter is-juke">
            <ListMusic size={22} aria-hidden="true" />
            <span className="dk-meter-word">{zh ? "点歌模式 · 一首接一首" : "Jukebox · one after another"}</span>
          </div>
        ) : (
          <div className={`dk-meter ${d.drop ? "is-full" : ""}`} style={{ ["--level" as string]: level } as CSSProperties}>
            <span className="dk-meter-fill" />
            <span className="dk-meter-word">{zh ? "蓄力" : "Build-up"}</span>
            <span className="dk-meter-pct tabular">{Math.round(level * 100)}%</span>
          </div>
        )}
        {d.mixer && <MixStrip m={d.mixer} zh={zh} />}
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

/** The board shows the mixer (a line of its own) once anyone has touched it. */
export const mixerShows = (m: MixerState | undefined) => !!m && (MIX_KNOBS.some((k) => m.knobs[k] !== 0) || MIX_FX.some((f) => !!m.fx[f]));

/**
 * The mixer, when anyone has touched it (as the music plays it stays out of the way): each knob
 * turned, as a little bar from the middle, and each effect that's on, lit.
 */
function MixStrip({ m, zh }: { m: MixerState; zh: boolean }) {
  const knobs = MIX_KNOBS.filter((k) => m.knobs[k] !== 0);
  const fx = MIX_FX.filter((f) => !!m.fx[f]);
  if (!mixerShows(m)) return null;
  return (
    <div className="dk-mix" aria-label={zh ? "混音台" : "Mixer"}>
      {knobs.map((k) => (
        <span key={k} className="dk-mix-knob" style={{ ["--v" as string]: m.knobs[k] } as CSSProperties}>
          <span className="dk-mix-name">{L(KNOBS[k], zh)}</span>
          <span className="dk-mix-bar" aria-hidden="true">
            <span />
          </span>
        </span>
      ))}
      {fx.map((f) => {
        const Icon = MIX_EFFECTS[f].icon;
        return (
          <span key={f} className={`dk-mix-fx is-${f}`}>
            <Icon size={20} aria-hidden="true" />
            {L(MIX_EFFECTS[f].name, zh)}
          </span>
        );
      })}
    </div>
  );
}

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

/** `lines`: the songs-asked-for lines the board has now (each makes it taller: the chips sit below it). */
export function PadChips({ chips, lines = 0 }: { chips: Chip[]; lines?: number }) {
  return (
    <div className="dk-chips" aria-live="polite" style={{ ["--lines" as string]: lines } as CSSProperties}>
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
