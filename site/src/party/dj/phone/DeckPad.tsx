import { ChevronsUp, Disc3, ListMusic, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../../online/RoomContext";
import { chargeNow, countdown, cued, grade, hasB, hintFor, loaded, offAir, onAir, pressBy, tally } from "../../../shared/dj/deck";
import { DECK, MOVES, PAD_IDS, REQ_CHARS, STYLE_IDS, type DeckSide, type PadId, type StyleId } from "../../../shared/dj/types";
import type { DjView, ReqView } from "../../../shared/protocol";
import { haptic } from "../../../lib/sfx";
import { useStore } from "../../../store";
import { dataUrl } from "../../../online/config";
import type { CrateSong } from "../../../shared/dj/types";
import { appleMusicUrl } from "../../../shared/songs";
import { DROP_WORDS, hintText, localName, mixSaid, PADS, songName } from "../deck/words";
import { searchApple, type AppleHit } from "./apple";
import { MixerPad } from "./MixerPad";
import { STYLE_NAMES } from "../parts";
// the design tokens (docs/DESIGN.md) aren't loaded site-wide yet: the deck brings them (same values as global.css)
import "../../../styles/tokens.css";
import "../../../styles/dj-deck.css";

const L = (x: { zh: string; en: string }, zh: boolean) => (zh ? x.zh : x.en);

/**
 * 打碟 · DJ Booth: the beginner deck on a phone. Everyone at the table has one and plays at once;
 * the room keeps it in order and the big screen plays it on the beat, so no press can trainwreck:
 * the crossfader between the two decks, eight effect pads, the build-up everyone taps together, DROP
 * on the count, a song to ask for by name, and the pick for what plays next.
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
    else if (e.fx === "req") say(zh ? `${nameOf(e.pid)} 点了一首歌` : `${nameOf(e.pid)} asked for a song`);
    else if (e.fx === "mix") say(mixSaid(nameOf(e.pid), e.data, zh));
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
          <Pad key={p} pad={p} live={live} braking={MOVES.includes(p) && !!d.drop} g={g} zh={zh} />
        ))}
      </div>
      <BuildDrop v={v} now={now} g={g} zh={zh} live={live} />
      <p className="djk-said" aria-live="polite">
        {said.map((s) => (
          <span key={s.id}>{s.text}</span>
        ))}
      </p>
      <MixerPad v={v} me={me} now={now} g={g} nameOf={nameOf} zh={zh} live={live} />
      <Requests v={v} me={me} g={g} zh={zh} />
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
    // (a night of the host's songs: the deck's song by name)
    const song = d.local ? v.onDecks[side] : null;
    return (
      <div className={`djk-deck ${on === side ? "is-on" : ""} ${next === side ? "is-cued" : ""}`}>
        <span className="djk-deck-side">{side.toUpperCase()}</span>
        <Disc3 size={24} className="djk-deck-disc" aria-hidden="true" />
        <span className="djk-deck-style">{d.local ? (song ? song.t : zh ? "准备中" : "Loading") : style ? L(STYLE_NAMES[style], zh) : zh ? "空着" : "Empty"}</span>
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
        disabled={!live || held || !hasB(d)}
        aria-label={zh ? "推子：A 到 B" : "Crossfader, A to B"}
        onChange={(e) => move(Number(e.target.value) / 100)}
        onPointerUp={end}
        onKeyUp={end}
        onTouchEnd={end}
        style={{ ["--x" as string]: x } as CSSProperties}
      />
      <span className="djk-fader-end">B</span>
      <span className="djk-fader-who">
        {held ? (zh ? `${nameOf(d.faderBy!)} 在推` : `${nameOf(d.faderBy!)} has it`) : !hasB(d) ? (zh ? "先选下一首，B 碟有歌才能推" : "Pick the next one first: deck B needs a song") : zh ? "推子" : "Crossfader"}
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
  if (d.local) {
    // a night of the host's songs: the next one is on the deck off the air (asked for, or the DJ's pick)
    const song = v.onDecks[side];
    return (
      <div className="djk-picks">
        <span className="djk-picks-title">{zh ? `下一首（放到 ${side.toUpperCase()}）` : `Next up (on deck ${side.toUpperCase()})`}</span>
        <span className="djk-next">{song ? localName(song, zh) : zh ? "准备中" : "Getting it ready"}</span>
      </div>
    );
  }
  const n = tally(d.votes);
  const mine = d.votes[me];
  const onStyle = side === "a" ? d.b : d.a;
  // while a drop is on its way the picks wait (it lands on the deck the floor had cued), and while
  // a song asked for is up next (the deck off the air is its)
  const wait = !!d.drop || !!d.up;
  const title = d.up
    ? zh
      ? "下一首是点的歌，Drop 之后再选"
      : "A song asked for is up next. Pick after its drop"
    : d.drop
      ? zh
        ? "下一首（Drop 之后再选）"
        : "Next up (after the drop)"
      : zh
        ? `下一首（放到 ${side.toUpperCase()}）`
        : `Next up (on deck ${side.toUpperCase()})`;
  return (
    <div className="djk-picks">
      <span className="djk-picks-title">{title}</span>
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

/* ------------------------------------------------------------------ songs asked for by name */

/** A song on the site's list (or one of the host's: `local`; or one found on Apple: `apple`), ready to search: its title and the whole line folded the same way. */
type Entry = { id: number; t: string; a: string; c: number; tk: string; key: string; local?: string; apple?: AppleHit };
type Book = { list: Entry[]; fold: (x: string) => string; simplify: (x: string) => string };
let book: Promise<Book> | null = null;

/** The song list (loaded the first time someone types a song: it's big), folded for searching. */
function loadBook(): Promise<Book> {
  book ??= (async () => {
    const [{ SONG_ROWS }, { toSimplified }] = await Promise.all([import("../../../data/songs"), import("../../../data/t2s")]);
    const fold = (x: string) => toSimplified(x.toLowerCase()).replace(/[\s'"’.,!?·・\-_/()（）《》「」【】]+/g, "");
    const list = SONG_ROWS.map((r) => ({ id: r[0], t: r[1], a: r[2], c: r[9], tk: fold(r[1]), key: fold(`${r[1]} ${r[2]} ${r[3] || ""}`) }));
    return { list, fold, simplify: toSimplified };
  })().catch((e) => {
    book = null;
    throw e;
  });
  return book;
}

/** The host's songs (a night of them), from the room, folded for searching like the song list. */
async function loadCrate(code: string, ver: number): Promise<{ v: number; book: Book }> {
  const [res, { toSimplified }] = await Promise.all([fetch(dataUrl(code), { cache: "no-store" }), import("../../../data/t2s")]);
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { v?: number; crate?: CrateSong[] } | null;
  const fold = (x: string) => toSimplified(x.toLowerCase()).replace(/[\s'"’.,!?·・\-_/()（）《》「」【】]+/g, "");
  const list = (data?.crate ?? []).map((s, i) => ({ id: i, t: s.t, a: s.a, c: 1, tk: fold(s.t), key: fold(`${s.t} ${s.a}`), local: s.id }));
  return { v: data?.v ?? ver, book: { list, fold, simplify: toSimplified } };
}

/** The songs a few typed letters could mean: the title itself first, then titles that start so, then the rest; chart songs first. */
function search(b: Book, q: string): Entry[] {
  const k = b.fold(q);
  if (!k) return [];
  const hits: [number, Entry][] = [];
  for (const e of b.list) {
    const rank = e.tk === k ? 0 : e.tk.startsWith(k) ? 1 : e.tk.includes(k) ? 2 : e.key.includes(k) ? 3 : -1;
    if (rank >= 0) hits.push([rank * 2 + (e.c ? 0 : 1), e]);
  }
  hits.sort((x, y) => x[0] - y[0]);
  return hits.slice(0, 6).map((h) => h[1]);
}

/** An Apple song as the room takes it: [track id, title, artist, preview, storefront]. */
const appleReq = (h: AppleHit) => [h.id, h.t, h.a, h.p, h.st];

/**
 * Ask for a song by name: the DJ plays 30 seconds of the song itself (Apple's preview) over its
 * drums on the next drop, then its remix in the song's style, named for whoever asked on the big
 * screen. Suggestions come from the site's song list (a song picked there shows by name to
 * everyone), and from Apple for a name that isn't on it; one song each, waiting or up next. On a
 * night of the host's songs: those, the whole song.
 */
function Requests({ v, me, g, zh }: { v: DjView; me: string; g: G; zh: boolean }) {
  const d = v.deck;
  const { code } = useRoom();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Entry | null>(null);
  const [b, setB] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);
  // a night of the host's songs: those, fetched from the room (again when they change)
  const [crate, setCrate] = useState<{ v: number; book: Book } | null>(null);
  const open = () => {
    if (d.local) {
      if (!crate || crate.v !== v.crateV) loadCrate(code, v.crateV).then(setCrate, () => setFailed(true));
    } else if (!b) loadBook().then(setB, () => setFailed(true));
  };
  const using = d.local ? (crate?.book ?? null) : b;
  const hits = useMemo(() => (using && !pick && q.trim() ? search(using, q) : []), [using, q, pick]);
  // the same name on Apple, a moment after the typing stops (for songs not on the list)
  const typed = q.trim();
  const [found, setFound] = useState<{ q: string; hits: AppleHit[] } | null>(null);
  useEffect(() => {
    if (d.local || pick || Array.from(typed).length < 2) return;
    let gone = false;
    const id = window.setTimeout(() => {
      void searchApple(typed, b?.simplify).then((list) => {
        if (!gone) setFound({ q: typed, hits: list });
      });
    }, 450);
    return () => {
      gone = true;
      window.clearTimeout(id);
    };
  }, [d.local, pick, typed, b]);
  const fold = b?.fold ?? ((x: string) => x.toLowerCase());
  const onApple: Entry[] = useMemo(() => {
    if (d.local || pick || !found || found.q !== typed) return [];
    const listed = new Set(hits.map((h) => fold(`${h.t}${h.a}`)));
    return found.hits
      .filter((h) => !listed.has(fold(`${h.t}${h.a}`)))
      .slice(0, hits.length ? 3 : 6)
      .map((h) => ({ id: h.id, t: h.t, a: h.a, c: 0, tk: fold(h.t), key: fold(`${h.t} ${h.a}`), apple: h }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.local, pick, found, typed, hits, b]);
  const waitAt = d.reqs.findIndex((r) => r.by === me);
  const mine: { r: ReqView; at: "now" | "up" | "wait"; ahead: number } | null =
    d.now?.by === me ? { r: d.now, at: "now", ahead: 0 } : d.up?.by === me ? { r: d.up, at: "up", ahead: 0 } : waitAt >= 0 ? { r: d.reqs[waitAt], at: "wait", ahead: waitAt + (d.up ? 1 : 0) } : null;
  const full = d.reqs.length >= DECK.reqMax;
  const ended = v.phase === "end";

  const [finding, setFinding] = useState(false);
  const sent = () => {
    haptic(15);
    setQ("");
    setPick(null);
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (ended || full || finding) return;
    if (d.local) {
      // one of the host's songs: picked, or typed out exactly (else it isn't one of them)
      const k = using ? using.fold(q.trim()) : "";
      const hit = pick ?? using?.list.find((x) => x.tk === k || x.key === k);
      if (!hit) return;
      g("req", { local: hit.local });
      return sent();
    }
    if (pick?.apple) {
      g("req", { apple: appleReq(pick.apple) });
      return sent();
    }
    if (pick) {
      g("req", { song: pick.id, text: pick.t });
      return sent();
    }
    const text = q.trim();
    if (!text) return;
    // typed out a song on the list exactly: that one (so it shows by name)
    const k = b ? b.fold(text) : "";
    const same = b?.list.filter((x) => x.tk === k || x.key === k) ?? [];
    const hit = same.find((x) => x.c) ?? same[0];
    if (hit) {
      g("req", { song: hit.id, text: hit.t });
      return sent();
    }
    // else Apple's best match for it (so its clip plays: asked now if the typing was quicker than
    // the search, a few seconds at most); else the name alone (the remix alone)
    const ask = (top: AppleHit | undefined) => {
      g("req", top ? { apple: appleReq(top) } : { text });
      sent();
    };
    if (found && found.q === text) return ask(found.hits[0]);
    setFinding(true);
    const late = new Promise<AppleHit[]>((ok) => window.setTimeout(() => ok([]), 3000));
    void Promise.race([searchApple(text, b?.simplify), late]).then((list) => {
      setFinding(false);
      ask(list[0]);
    });
  };

  if (mine && mine.at !== "now") {
    const song = songName(mine.r, zh) ?? "";
    return (
      <div className="djk-req">
        <span className="djk-req-title">
          <ListMusic size={24} aria-hidden="true" />
          {zh ? "点歌" : "Ask for a song"}
        </span>
        <div className="djk-req-mine" aria-live="polite">
          <span>
            {mine.at === "up"
              ? zh
                ? `下一首就是你点的 ${song}，大家蓄力 Drop 进去`
                : `Yours is up next: ${song}. Build up and drop into it`
              : zh
                ? `你点的 ${song} 在排队，前面还有 ${mine.ahead} 首`
                : `Yours is in line: ${song}, ${mine.ahead} ahead`}
          </span>
          <button type="button" className="djk-req-cancel" onClick={() => g("unreq", { id: mine.r.id })}>
            {zh ? "不点了" : "Take it back"}
          </button>
        </div>
      </div>
    );
  }

  // the whole song, for whoever asked while its clip plays
  const whole = mine?.at === "now" && mine.r.p ? (mine.r.song ?? mine.r.apple) : undefined;
  return (
    <form className="djk-req" onSubmit={send}>
      <span className="djk-req-title">
        <ListMusic size={24} aria-hidden="true" />
        {zh ? "点歌" : "Ask for a song"}
      </span>
      <span className="djk-req-note">
        {mine?.at === "now"
          ? mine.r.local || mine.r.p
            ? zh
              ? `正在放你点的 ${songName(mine.r, zh) ?? ""}，还可以再点一首`
              : `Yours is on: ${songName(mine.r, zh) ?? ""}. You can ask for another`
            : zh
              ? `正在放 DJ 按 ${songName(mine.r, zh) ?? ""} 做的 Remix（没找到这首歌的原曲），还可以再点一首`
              : `On now: the DJ's remix for ${songName(mine.r, zh) ?? ""} (no clip of the song found). You can ask for another`
          : full
            ? zh
              ? `点歌排满了（${DECK.reqMax} 首），放掉几首再点`
              : `The line is full (${DECK.reqMax} songs). Try again in a bit`
            : d.local
              ? zh
                ? `搜主人的这 ${v.crateN} 首歌，点中了下一首就放原曲`
                : `Search the host's ${v.crateN} songs. The one you pick plays next`
              : zh
                ? "输入歌名或歌手。下一首先放这首歌的 30 秒原曲，再接 DJ 按它的风格做的 Remix"
                : "Type a song or an artist. Up next: 30 seconds of the song itself, then the DJ's remix in its style"}
      </span>
      {whole !== undefined && (
        <a className="djk-req-whole" href={appleMusicUrl(whole, mine?.r.st ?? "us")} target="_blank" rel="noreferrer">
          {zh ? "在 Apple Music 听完整首" : "The whole song on Apple Music"}
        </a>
      )}
      {pick ? (
        <span className="djk-req-pick">
          <span>{zh ? `${pick.a}《${pick.t}》` : `${pick.t} (${pick.a})`}</span>
          <button type="button" aria-label={zh ? "换一首" : "Choose another"} onClick={() => setPick(null)}>
            <X size={20} aria-hidden="true" />
          </button>
        </span>
      ) : (
        <input
          className="djk-req-input"
          type="text"
          value={q}
          maxLength={REQ_CHARS.max * 2}
          placeholder={zh ? "歌名或歌手" : "Song or artist"}
          aria-label={zh ? "点歌：歌名或歌手" : "Ask for a song: a song or an artist"}
          enterKeyHint="send"
          autoComplete="off"
          onFocus={open}
          onChange={(e) => {
            open();
            setQ(e.target.value);
          }}
          disabled={ended}
        />
      )}
      {hits.length + onApple.length > 0 && (
        <ul className="djk-req-hits" aria-label={d.local ? (zh ? "主人的歌" : "The host's songs") : zh ? "找到的歌" : "Songs found"}>
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="djk-req-hit" onClick={() => setPick(h)}>
                <span className="djk-req-hit-t">{zh ? `《${h.t}》` : h.t}</span>
                <span className="djk-req-hit-a">{h.a}</span>
              </button>
            </li>
          ))}
          {onApple.map((h) => (
            <li key={`apple-${h.id}`}>
              <button type="button" className="djk-req-hit is-apple" onClick={() => setPick(h)}>
                <span className="djk-req-hit-t">{zh ? `《${h.t}》` : h.t}</span>
                <span className="djk-req-hit-a">{h.a}</span>
                <span className="djk-req-hit-from">Apple Music</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && !using && <span className="djk-req-note">{d.local ? (zh ? "歌单没加载出来，等一下再点" : "The song list didn't load. Try again in a moment") : zh ? "曲库没加载出来，直接输入歌名也行" : "The song list didn't load. Typing the name works too"}</span>}
      <button type="submit" className="djk-req-send" disabled={ended || full || finding || (!pick && !q.trim())}>
        {finding ? (zh ? "在找这首歌…" : "Finding it…") : zh ? "点这首" : "Ask for it"}
      </button>
    </form>
  );
}
