import { ChevronsUp, Disc3 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../../online/RoomContext";
import { chargeNow, countdown, cued, grade, hintFor, loaded, offAir, onAir, pressBy, tally } from "../../../shared/dj/deck";
import { DECK, PAD_IDS, STYLE_IDS, type DeckSide, type PadId, type StyleId } from "../../../shared/dj/types";
import type { DjView } from "../../../shared/protocol";
import { haptic } from "../../../lib/sfx";
import { useStore } from "../../../store";
import { DROP_WORDS, hintText, PADS } from "../deck/words";
import { STYLE_NAMES } from "../parts";
// the design tokens (docs/DESIGN.md) aren't loaded site-wide yet: the deck brings them (same values as global.css)
import "../../../styles/tokens.css";
import "../../../styles/dj-deck.css";

const L = (x: { zh: string; en: string }, zh: boolean) => (zh ? x.zh : x.en);

/**
 * 打碟 · DJ Booth: the beginner deck on a phone. Everyone at the table has one and plays at once;
 * the room keeps it in order and the big screen plays it on the beat, so no press can trainwreck:
 * the crossfader between the two decks, four effect pads, the build-up everyone taps together, DROP
 * on the count, and the pick for what plays next.
 */
export function DeckPad({ v }: { v: DjView }) {
  const { g, me, now, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const d = v.deck;
  const live = v.phase !== "wait" && v.phase !== "end";
  const t = now();
  // smooth while something moves: the countdown, the build-up falling back
  useTicker(live && (!!d.drop || chargeNow(d, t) > 0), d.drop ? 50 : 200);
  useTicker(live, 4000);

  const lyria = v.source === "lyria";
  const hint = hintFor(d, t, live, lyria);
  const off = offAir(d);
  const on = onAir(d);

  /* ---------------- someone else's pad, for a moment */
  const [said, setSaid] = useState<{ id: number; text: string }[]>([]);
  const seq = useRef(0);
  const say = (text: string) => {
    const id = ++seq.current;
    setSaid((l) => [...l.slice(-2), { id, text }]);
    window.setTimeout(() => setSaid((l) => l.filter((x) => x.id !== id)), 2000);
  };
  useRoomEvent((e) => {
    if (e.k !== "fx" || !e.pid || e.pid === me) return;
    if (e.fx === "pad") {
      const pad = PAD_IDS[e.data?.[0] ?? -1];
      if (pad) say(`${nameOf(e.pid)} · ${L(PADS[pad].name, zh)}`);
    } else if (e.fx === "drop") say(`${nameOf(e.pid)} · DROP`);
  });

  return (
    <section className="djk" aria-label={zh ? "打碟台" : "The deck"}>
      <p className="djk-hint" aria-live="polite">
        {hint ? hintText(hint, off, zh) : zh ? "音乐开始后就能打碟" : "The deck opens when the music starts"}
      </p>
      <Decks v={v} on={on} zh={zh} lyria={lyria} />
      <Fader v={v} me={me} now={now} g={g} nameOf={nameOf} zh={zh} live={live} />
      <div className="djk-pads">
        {PAD_IDS.map((p) => (
          <Pad key={p} pad={p} live={live} braking={p === "brake" && !!d.drop} g={g} zh={zh} />
        ))}
      </div>
      <BuildDrop v={v} now={now} g={g} zh={zh} live={live} />
      <p className="djk-said" aria-live="polite">
        {said.map((s) => (
          <span key={s.id}>{s.text}</span>
        ))}
      </p>
      <Picks v={v} me={me} g={g} zh={zh} side={off} />
    </section>
  );
}

type G = (x: string, data?: Record<string, unknown>) => void;

/** The two decks: their styles, the one on the air lit. */
function Decks({ v, on, zh, lyria }: { v: DjView; on: DeckSide; zh: boolean; lyria: boolean }) {
  const d = v.deck;
  const next = cued(d, lyria);
  const loading = next ? null : loaded(d);
  const deck = (side: DeckSide) => {
    const style = side === "a" ? d.a : d.b;
    return (
      <div className={`djk-deck ${on === side ? "is-on" : ""} ${next === side ? "is-cued" : ""}`}>
        <span className="djk-deck-side">{side.toUpperCase()}</span>
        <Disc3 size={24} className="djk-deck-disc" aria-hidden="true" />
        <span className="djk-deck-style">{style ? L(STYLE_NAMES[style], zh) : zh ? "空着" : "Empty"}</span>
        {on === side && <span className="djk-deck-on">{zh ? "在放" : "On"}</span>}
        {next === side && <span className="djk-deck-on is-next">{zh ? "下一首" : "Next"}</span>}
        {loading === side && <span className="djk-deck-on is-loading">{zh ? "准备中" : "Loading"}</span>}
      </div>
    );
  };
  return (
    <div className="djk-decks">
      {deck("a")}
      {deck("b")}
    </div>
  );
}

/** The crossfader: whoever moves it holds it; the others see who, and wait. */
function Fader({ v, me, now, g, nameOf, zh, live }: { v: DjView; me: string; now: () => number; g: G; nameOf: (pid: string) => string; zh: boolean; live: boolean }) {
  const d = v.deck;
  const [mine, setMine] = useState<number | null>(null);
  const sentAt = useRef(0);
  const last = useRef<number | null>(null);
  const timer = useRef(0);
  const held = !!d.faderBy && d.faderBy !== me && now() - d.faderAt < DECK.faderHoldMs;
  useTicker(held, 300);
  const send = (x: number) => {
    sentAt.current = performance.now();
    g("fader", { value: x });
  };
  const move = (x: number) => {
    setMine(x);
    last.current = x;
    const wait = DECK.faderSendMs - (performance.now() - sentAt.current);
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
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const x = mine ?? d.fader;
  return (
    <div className="djk-fader">
      <span className="djk-fader-end">A</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(x * 100)}
        disabled={!live || held || !d.b}
        aria-label={zh ? "推子：A 到 B" : "Crossfader, A to B"}
        onChange={(e) => move(Number(e.target.value) / 100)}
        onPointerUp={end}
        onKeyUp={end}
        onTouchEnd={end}
        style={{ ["--x" as string]: x } as CSSProperties}
      />
      <span className="djk-fader-end">B</span>
      <span className="djk-fader-who">
        {held ? (zh ? `${nameOf(d.faderBy!)} 在推` : `${nameOf(d.faderBy!)} has it`) : !d.b ? (zh ? "先选下一首，B 碟有歌才能推" : "Pick the next one first: deck B needs a song") : zh ? "推子" : "Crossfader"}
      </span>
    </div>
  );
}

/** One effect pad: it plays on the big screen from the next beat. */
function Pad({ pad, live, braking, g, zh }: { pad: PadId; live: boolean; braking: boolean; g: G; zh: boolean }) {
  const p = PADS[pad];
  const Icon = p.icon;
  const at = useRef(0);
  const [hit, setHit] = useState(0);
  const press = () => {
    const tNow = performance.now();
    if (tNow - at.current < DECK.padGapMs) return;
    at.current = tNow;
    g("pad", { pad });
    haptic(12);
    setHit((n) => n + 1);
  };
  return (
    <button type="button" className={`djk-pad is-${pad}`} disabled={!live || braking} onClick={press} title={L(p.what, zh)}>
      <Icon size={24} key={hit} className={hit ? "is-hit" : ""} aria-hidden="true" />
      <span>{L(p.name, zh)}</span>
    </button>
  );
}

/** The build-up everyone taps together, then DROP on the count. */
function BuildDrop({ v, now, g, zh, live }: { v: DjView; now: () => number; g: G; zh: boolean; live: boolean }) {
  const d = v.deck;
  const t = now();
  const taps = useRef(0);
  const timer = useRef(0);
  const [result, setResult] = useState<{ text: string; good: boolean; n: number } | null>(null);
  const pressed = useRef("");
  useEffect(() => () => window.clearInterval(timer.current), []);
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => setResult(null), 1600);
    return () => window.clearTimeout(id);
  }, [result]);

  const flush = () => {
    if (taps.current > 0) g("charge", { n: Math.min(DECK.maxTaps, taps.current) });
    taps.current = 0;
  };
  const tap = () => {
    taps.current += 1;
    haptic(6);
    if (!timer.current)
      timer.current = window.setInterval(() => {
        if (!taps.current) {
          // the taps stopped: one last word, so the room adds what it's holding
          window.clearInterval(timer.current);
          timer.current = 0;
          g("charge", { n: 0 });
          return;
        }
        flush();
      }, DECK.chargeSendMs);
  };

  if (d.drop) {
    const c = countdown(d.drop, d.grid, t);
    const key = `${d.drop.bar}:${d.drop.at}`;
    const press = () => {
      if (pressed.current === key) return;
      const tNow = now();
      // judged here as the room will, with room for the trip there: a press shown as counting does
      const gr = grade(d.drop!, d.grid, tNow, tNow + DECK.pressTripMs);
      if (!gr) {
        // (before the countdown: not yet; after the cue: too late for this one)
        const early = tNow < d.drop!.cue;
        setResult((r) => ({ text: L(early ? DROP_WORDS.early : DROP_WORDS.late, zh), good: false, n: (r?.n ?? 0) + 1 }));
        return;
      }
      pressed.current = key;
      g("drop", { c: tNow });
      haptic(gr === "perfect" ? [20, 40, 60] : 25);
      setResult((r) => ({ text: L(DROP_WORDS[gr], zh), good: true, n: (r?.n ?? 0) + 1 }));
    };
    // "now" only while a press still counts (it has to reach the room before the bar)
    const open = c === "drop" && t <= pressBy(d.drop);
    return (
      <div className="djk-build is-armed">
        <button type="button" className={`djk-drop ${open ? "is-now" : ""}`} onPointerDown={press} disabled={!live} aria-label="DROP">
          <span className="djk-drop-word">DROP</span>
          <span className="djk-drop-count tabular" aria-live="assertive">
            {c === null ? (zh ? "等倒数" : "Wait for the count") : c === "drop" ? (open ? (zh ? "就是现在" : "Now") : "") : c}
          </span>
        </button>
        {result && (
          <span key={result.n} className={`djk-result ${result.good ? "is-good" : ""}`}>
            {result.text}
          </span>
        )}
      </div>
    );
  }

  const level = chargeNow({ ...d, drop: null }, t);
  return (
    <div className="djk-build">
      <button
        type="button"
        className="djk-charge"
        onPointerDown={tap}
        disabled={!live}
        style={{ ["--level" as string]: level } as CSSProperties}
        aria-label={zh ? `蓄力，现在 ${Math.round(level * 100)}%` : `Build up, ${Math.round(level * 100)}% now`}
      >
        <span className="djk-charge-fill" aria-hidden="true" />
        <ChevronsUp size={24} aria-hidden="true" />
        <span className="djk-charge-word">{zh ? "蓄力" : "Build up"}</span>
        <span className="djk-charge-pct tabular">{Math.round(level * 100)}%</span>
      </button>
      {/* a press just before the drop landed: its word stays up a moment, not gone with the countdown */}
      {result ? (
        <span key={result.n} className={`djk-result ${result.good ? "is-good" : ""}`}>
          {result.text}
        </span>
      ) : (
        <span className="djk-build-note">{zh ? "大家一起狂点，满了倒数 Drop" : "Everyone tap fast. Full starts the count to the drop"}</span>
      )}
    </div>
  );
}

/** What plays next: everyone picks, the most picked goes on the deck that's off the air. */
function Picks({ v, me, g, zh, side }: { v: DjView; me: string; g: G; zh: boolean; side: DeckSide }) {
  const d = v.deck;
  const n = tally(d.votes);
  const mine = d.votes[me];
  const onStyle = side === "a" ? d.b : d.a;
  // while a drop is on its way the picks wait (it lands on the deck the floor had cued)
  const wait = !!d.drop;
  return (
    <div className="djk-picks">
      <span className="djk-picks-title">{wait ? (zh ? "下一首（Drop 之后再选）" : "Next up (after the drop)") : zh ? `下一首（放到 ${side.toUpperCase()}）` : `Next up (on deck ${side.toUpperCase()})`}</span>
      <div className="djk-picks-grid">
        {STYLE_IDS.map((s: StyleId) => (
          <button key={s} type="button" className={`djk-pick ${mine === s ? "is-mine" : ""}`} aria-pressed={mine === s} disabled={v.phase === "end" || wait || s === onStyle} onClick={() => g("vote", { style: s })}>
            <span>{L(STYLE_NAMES[s], zh)}</span>
            {(n[s] ?? 0) > 0 && <span className="djk-pick-n tabular">{n[s]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
