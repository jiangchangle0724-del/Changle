import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTicker } from "../../../online/RoomContext";
import { MIX_FX, MIX_KNOBS, MIXER, type MixFx, type MixKnob } from "../../../shared/dj/types";
import type { DjView } from "../../../shared/protocol";
import { haptic } from "../../../lib/sfx";
import { FILTER_ENDS, KNOBS, MIX_EFFECTS } from "../deck/words";

const L = (x: { zh: string; en: string }, zh: boolean) => (zh ? x.zh : x.en);
type G = (x: string, data?: Record<string, unknown>) => void;

/** A knob's slider snaps to 0 this close to the middle (back to as the music plays, easily). */
const SNAP = 0.08;

/**
 * 打碟 · DJ Booth: the mixer (混音台) on every phone (Steve on Nov 2: pro mixing, more electronic,
 * knobs). The EQ's three bands and the filter as sliders (0 in the middle: as the music plays), the
 * four effects as switches; the big screen plays them, the knobs at once, the effects from the next
 * beat. Whoever turns a knob holds it a moment, like the crossfader.
 */
export function MixerPad({ v, me, now, g, nameOf, zh, live }: { v: DjView; me: string; now: () => number; g: G; nameOf: (pid: string) => string; zh: boolean; live: boolean }) {
  const m = v.deck.mixer;
  const busy = !!m && (MIX_KNOBS.some((k) => m.knobs[k] !== 0) || MIX_FX.some((f) => !!m.fx[f]));
  const at = useRef(0);
  if (!m) return null;
  const flip = (fx: MixFx) => {
    const t = performance.now();
    if (t - at.current < MIXER.fxGapMs) return;
    at.current = t;
    g("mixfx", { fx, on: !m.fx[fx] });
    haptic(10);
  };
  const reset = () => {
    const t = performance.now();
    if (t - at.current < MIXER.fxGapMs) return;
    at.current = t;
    g("mixoff");
    haptic(10);
  };
  return (
    <section className="djk-mix" aria-label={zh ? "混音台" : "Mixer"}>
      <div className="djk-mix-head">
        <span className="djk-mix-title">
          <SlidersHorizontal size={24} aria-hidden="true" />
          {zh ? "混音台" : "Mixer"}
        </span>
        <button type="button" className="djk-mix-reset" disabled={!live || !busy} onClick={reset}>
          <RotateCcw size={18} aria-hidden="true" />
          {zh ? "复位" : "Reset"}
        </button>
      </div>
      {MIX_KNOBS.map((k) => (
        <Knob key={k} knob={k} v={v} me={me} now={now} g={g} nameOf={nameOf} zh={zh} live={live} />
      ))}
      <div className="djk-mix-fx">
        {MIX_FX.map((f) => {
          const e = MIX_EFFECTS[f];
          const Icon = e.icon;
          const on = !!m.fx[f];
          return (
            <button key={f} type="button" className={`djk-mix-btn is-${f} ${on ? "is-on" : ""}`} aria-pressed={on} disabled={!live} title={L(e.what, zh)} onClick={() => flip(f)}>
              <Icon size={22} aria-hidden="true" />
              <span>{L(e.name, zh)}</span>
            </button>
          );
        })}
      </div>
      <p className="djk-mix-note">{zh ? "旋钮马上生效，效果从下一拍开始，开一分钟后自动关。Drop 的时候旋钮回到正常。" : "Knobs act at once. Effects start on the next beat and switch off after a minute. A drop puts the knobs back."}</p>
    </section>
  );
}

/** One knob, as a slider: whoever moves it holds it; the others see who, and wait. */
function Knob({ knob, v, me, now, g, nameOf, zh, live }: { knob: MixKnob; v: DjView; me: string; now: () => number; g: G; nameOf: (pid: string) => string; zh: boolean; live: boolean }) {
  const m = v.deck.mixer;
  const [mine, setMine] = useState<number | null>(null);
  const sentAt = useRef(0);
  const last = useRef<number | null>(null);
  const timer = useRef(0);
  const by = m.knobBy[knob];
  const held = !!by && by !== me && now() - (m.knobAt[knob] ?? 0) < MIXER.holdMs;
  useTicker(held, 300);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const send = (x: number) => {
    sentAt.current = performance.now();
    g("mix", { knob, value: x });
  };
  const move = (raw: number) => {
    const x = Math.abs(raw) < SNAP ? 0 : raw;
    setMine(x);
    last.current = x;
    const wait = MIXER.sendMs - (performance.now() - sentAt.current);
    if (wait <= 0) send(x);
    else if (!timer.current)
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        if (last.current !== null) send(last.current);
      }, wait);
  };
  const end = () => {
    if (last.current !== null) send(last.current);
    last.current = null;
    // the room's value takes over once it has caught up
    window.setTimeout(() => setMine(null), 400);
  };
  const x = mine ?? m.knobs[knob];
  const filter = knob === "filter";
  return (
    <div className={`djk-knob ${x !== 0 ? "is-turned" : ""}`}>
      <span className="djk-knob-name">{L(KNOBS[knob], zh)}</span>
      {filter && <span className="djk-knob-end">{L(FILTER_ENDS.dark, zh)}</span>}
      <input
        type="range"
        min={-100}
        max={100}
        step={5}
        value={Math.round(x * 100)}
        disabled={!live || held}
        aria-label={filter ? (zh ? "滤波：往左闷，往右薄" : "Filter: left darker, right thinner") : zh ? `${L(KNOBS[knob], zh)}：往左切掉，往右加强` : `${L(KNOBS[knob], zh)}: left cuts it, right lifts it`}
        onChange={(e) => move(Number(e.target.value) / 100)}
        onPointerUp={end}
        onKeyUp={end}
        onTouchEnd={end}
        style={{ ["--x" as string]: (x + 1) / 2 } as CSSProperties}
      />
      {filter && <span className="djk-knob-end">{L(FILTER_ENDS.thin, zh)}</span>}
      {held && <span className="djk-knob-who">{zh ? `${nameOf(by!)} 在调` : `${nameOf(by!)} has it`}</span>}
    </div>
  );
}
