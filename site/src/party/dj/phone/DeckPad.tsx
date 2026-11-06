import { ChevronsUp, ClipboardPaste, Disc3, ListMusic, ListOrdered, Maximize2, Minimize2, Search, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../../online/RoomContext";
import { heatLean } from "../../../shared/dj/curve";
import { chargeNow, COLD_LEAN, countdown, cued, grade, hasB, hintFor, loaded, offAir, onAir, pressBy, reqOrder, rested, tally } from "../../../shared/dj/deck";
import { DECK, MOVES, OVER_SONG, PAD_IDS, REQ_CHARS, STYLE_IDS, type DeckSide, type PadId, type StyleId } from "../../../shared/dj/types";
import type { DjView, ReqView } from "../../../shared/protocol";
import { haptic } from "../../../lib/sfx";
import { useStore } from "../../../store";
import { dataUrl } from "../../../online/config";
import type { CrateSong } from "../../../shared/dj/types";
import { DROP_WORDS, hintText, jukeText, localName, mixSaid, PADS, songName } from "../deck/words";
import { ytIdOf, type YtHit } from "../../../shared/dj/youtube";
import { ytInfo, ytSearch } from "./youtube";
import { EmptyState } from "../../../ui/EmptyState";
import { Skeleton } from "../../../ui/Skeleton";
import { MixerPad } from "./MixerPad";
import { Platter, type Move } from "./Platter";
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
  // (while a whole song plays on the TV, the deck waits, all but the pads that are a sound of their own)
  const playingNow = v.phase !== "wait" && v.phase !== "end";
  const live = playingNow && !d.song;
  const t = now();
  // smooth while something moves: the countdown, the build-up falling back
  useTicker(live && (!!d.drop || chargeNow(d, t) > 0), d.drop ? 50 : 200);
  useTicker(live, 4000);

  const lyria = v.source === "lyria";
  const hint = hintFor(d, t, live, lyria, heatLean(v.fires, v.colds, t) <= COLD_LEAN);
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

  // a hand on a record: a move of the music (scratch, rewind, brake), as its pad would play it
  const handAt = useRef(0);
  const hand = (m: Move) => {
    const tNow = performance.now();
    if (tNow - handAt.current < DECK.padGapMs) return;
    handAt.current = tNow;
    g("pad", { pad: m });
    haptic(m === "brake" ? 30 : 12);
  };

  // laid out like a DJ controller (Steve on Nov 2: the page should look like one): two
  // turntables, the mixer between them, the crossfader, the pads, the build-up and DROP
  return (
    <section className="djk" aria-label={zh ? "打碟台" : "The deck"}>
      <JukeSwitch v={v} g={g} zh={zh} />
      {d.song && <SongTime v={v} me={me} g={g} zh={zh} nameOf={nameOf} />}
      <p className="djk-hint" aria-live="polite">
        {v.juke && playingNow ? jukeText(!!d.song, !!d.up, zh) : hint ? hintText(hint, off, zh, d.local) : zh ? "音乐开始后就能打碟" : "The deck opens when the music starts"}
      </p>
      <div className="djk-console">
        <Decks v={v} on={on} zh={zh} lyria={lyria} live={live} hand={hand} />
        <p className="djk-vinyl-tip">{zh ? "唱盘来回搓是搓碟，往回转一大圈是倒带，按住不动是刹车" : "Rub a record to scratch, spin it back to rewind, hold it to brake"}</p>
        <MixerPad v={v} me={me} now={now} g={g} nameOf={nameOf} zh={zh} live={live} />
        <Fader v={v} me={me} now={now} g={g} nameOf={nameOf} zh={zh} live={live} />
        <div className="djk-pads">
          {PAD_IDS.map((p) => (
            <Pad key={p} pad={p} live={live || (playingNow && !!d.song && OVER_SONG.includes(p))} braking={MOVES.includes(p) && !!d.drop} g={g} zh={zh} />
          ))}
        </div>
        {/* (点歌模式: no build-up and no DROP) */}
        {!v.juke && <BuildDrop v={v} now={now} g={g} zh={zh} live={live} />}
      </div>
      <p className="djk-said" aria-live="polite">
        {said.map((s) => (
          <span key={s.id}>{s.text}</span>
        ))}
      </p>
      <Requests v={v} me={me} g={g} zh={zh} />
      <Playlist v={v} me={me} g={g} zh={zh} />
      {!v.juke && <Picks v={v} me={me} g={g} zh={zh} side={off} />}
    </section>
  );
}

/**
 * 点歌模式, the host's switch (Steve on Nov 5: "关闭 drop ... 当成一个点歌器"): no build-up, no DROP and
 * no picks, the songs asked for one after another, the DJ between them. The others read it on the
 * line under it.
 */
function JukeSwitch({ v, g, zh }: { v: DjView; g: G; zh: boolean }) {
  const { isHost } = useRoom();
  if (!isHost || v.phase === "end") return null;
  return (
    <div className="seg djk-juke" role="group" aria-label={zh ? "歌怎么放" : "How the songs play"}>
      <button type="button" aria-pressed={!v.juke} onClick={() => g("juke", { on: false })}>
        <Disc3 size={16} aria-hidden="true" />
        {zh ? "蓄力 Drop" : "Build and drop"}
      </button>
      <button type="button" aria-pressed={!!v.juke} onClick={() => g("juke", { on: true })}>
        <ListMusic size={16} aria-hidden="true" />
        {zh ? "点歌模式" : "Jukebox"}
      </button>
    </div>
  );
}

type G = (x: string, data?: Record<string, unknown>) => void;

/** 真歌时间: a whole song from YouTube plays on the TV; the deck waits. Its player and the host can skip it. */
function SongTime({ v, me, g, zh, nameOf }: { v: DjView; me: string; g: G; zh: boolean; nameOf: (pid: string) => string }) {
  const { isHost } = useRoom();
  const s = v.deck.song!;
  const req = v.deck.now?.id === s.id ? v.deck.now : null;
  const name = req ? songName(req, zh) : null;
  const can = s.by === me || isHost;
  return (
    <div className="djk-song" role="status">
      <span className="djk-song-title">
        {s.by === me ? (zh ? `电视上在放你点的整首${name ? ` ${name}` : ""}` : `The TV plays yours, whole${name ? `: ${name}` : ""}`) : zh ? `电视上在放 ${nameOf(s.by)} 点的整首${name ? ` ${name}` : ""}` : `The TV plays ${nameOf(s.by)}'s song, whole${name ? `: ${name}` : ""}`}
      </span>
      <span className="djk-song-note">
        {v.juke
          ? zh
            ? "放完马上接歌单里的下一首，DJ 只垫几秒。气笛、警笛这些音效照样能按"
            : "The next song on the playlist follows right after, the DJ just for a few seconds. The air horn, the siren and the other sounds still play"
          : zh
            ? "放完 DJ 接一段，再放歌单里的下一首。气笛、警笛这些音效照样能按"
            : "The DJ plays a while when it ends, then the next song on the playlist. The air horn, the siren and the other sounds still play"}
      </span>
      {/* the video over the whole TV, or back in its corner (anyone at the table) */}
      <button type="button" className="btn btn-ghost btn-block" aria-pressed={!!v.full} onClick={() => g("full", { on: !v.full })}>
        {v.full ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        {v.full ? (zh ? "电视上回到小窗" : "Back to the corner on the TV") : zh ? "电视上全屏看视频" : "Video over the whole TV"}
      </button>
      {can && (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => g("songskip")}>
          {zh ? "切歌" : "Skip it"}
        </button>
      )}
    </div>
  );
}

/** The two decks as turntables: their records, the one on the air spinning; a hand on either is a move of the music. */
function Decks({ v, on, zh, lyria, live, hand }: { v: DjView; on: DeckSide; zh: boolean; lyria: boolean; live: boolean; hand: (m: Move) => void }) {
  const d = v.deck;
  const next = cued(d, lyria);
  const loading = next ? null : loaded(d);
  const deck = (side: DeckSide) => {
    const style = side === "a" ? d.a : d.b;
    // (a night of the host's songs: the deck's song by name)
    const song = d.local ? v.onDecks[side] : null;
    const name = d.local ? (song ? song.t : zh ? "准备中" : "Loading") : style ? L(STYLE_NAMES[style], zh) : zh ? "空着" : "Empty";
    const status = on === side ? (zh ? "在放" : "On") : next === side ? (zh ? "下一首" : "Next") : loading === side ? (zh ? "准备中" : "Loading") : null;
    // (the moves wait while a drop is on its way, like their pads)
    return <Platter key={side} side={side} name={name} status={status} on={on === side} cued={next === side} live={live && !d.drop} zh={zh} onMove={hand} />;
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
        <span className="djk-build-note">
          {d.song ? (zh ? "整首歌放完，DJ 回来再蓄力" : "Build up again once the song ends and the DJ is back") : zh ? "大家一起狂点，满了倒数 Drop" : "Everyone tap fast. Full starts the count to the drop"}
        </span>
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

/** A song on the site's list (or one of the host's: `local`; or a video found on YouTube: `yt`), ready to search: its title and the whole line folded the same way. */
type Entry = { id: number; t: string; a: string; c: number; tk: string; key: string; local?: string; yt?: YtHit };
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

/** A YouTube video as the room takes it: [video id, title, channel]. */
const ytReq = (h: YtHit) => [h.id, h.t, h.a];

/**
 * The night's 歌单 (Steve on Nov 2: "很多人点歌要把它们放到一个playlist，可选择随机排序或按顺序"):
 * the song up next, then the waiting ones in the order they'll come up (the host's 随机: any of them
 * next). Songs and the DJ take turns: a song, the DJ a while, the next. Whoever asked for one, and
 * the host, can take it out; the host switches 按顺序 and 随机.
 */
function Playlist({ v, me, g, zh }: { v: DjView; me: string; g: G; zh: boolean }) {
  const d = v.deck;
  const { isHost, nameOf, now } = useRoom();
  const waiting = v.shuffle ? d.reqs : reqOrder(d.reqs, d.reqOn ?? {}, now());
  const rows = [...(d.up ? [{ r: d.up, up: true }] : []), ...waiting.map((r) => ({ r, up: false }))];
  if (!rows.length && !isHost) return null;
  return (
    <section className="djk-list" aria-label={zh ? "歌单" : "Playlist"}>
      <div className="djk-list-head">
        <span className="djk-list-title">
          <ListOrdered size={22} aria-hidden="true" />
          {zh ? `歌单 ${rows.length} 首` : `Playlist: ${rows.length}`}
        </span>
        {isHost ? (
          <div className="seg djk-list-seg" role="group" aria-label={zh ? "歌单怎么放" : "How the playlist plays"}>
            <button type="button" aria-pressed={!v.shuffle} onClick={() => g("shuffle", { on: false })}>
              {zh ? "按顺序" : "In order"}
            </button>
            <button type="button" aria-pressed={!!v.shuffle} onClick={() => g("shuffle", { on: true })}>
              <Shuffle size={15} aria-hidden="true" />
              {zh ? "随机" : "Shuffle"}
            </button>
          </div>
        ) : (
          v.shuffle && (
            <span className="djk-list-mode">
              <Shuffle size={15} aria-hidden="true" />
              {zh ? "随机放" : "Shuffled"}
            </span>
          )
        )}
      </div>
      {rows.length ? (
        <ol className="djk-list-rows">
          {rows.map(({ r, up }, i) => {
            const theirs = r.by === me;
            const name = songName(r, zh);
            return (
              <li key={r.id} className={`djk-list-row ${up ? "is-up" : ""} ${theirs ? "is-mine" : ""}`}>
                <span className="djk-list-n tabular">{up ? (zh ? "下一首" : "Next") : v.shuffle ? "·" : i + 1}</span>
                <span className="djk-list-song">
                  <span className="djk-list-t">{name ?? (r.yt ? (zh ? "一首 YouTube 上的歌" : "A song from YouTube") : zh ? "一首歌" : "A song")}</span>
                  <span className="djk-list-by">{theirs ? (zh ? "你点的" : "Yours") : zh ? `${nameOf(r.by)} 点的` : `${nameOf(r.by)}'s`}</span>
                </span>
                {(theirs || isHost) && (
                  <button type="button" className="djk-list-out" aria-label={zh ? "从歌单拿掉" : "Take it off the playlist"} onClick={() => g("unreq", { id: r.id })}>
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="djk-list-empty">{v.juke ? (zh ? "还没人点歌。点的歌一首接一首放" : "Nobody has asked for a song yet. They play one after another") : zh ? "还没人点歌。点的歌和 DJ 轮流放" : "Nobody has asked for a song yet. The songs and the DJ take turns"}</p>
      )}
    </section>
  );
}

/** Why a song has no video from YouTube yet: the search isn't on (the owner's key), today's searches are used up, or it found none. */
type NoTube = "nokey" | "quota" | "none" | "network";
/** A song waiting for its YouTube link (the search couldn't give one): from the song list (`song`), or a name typed in. */
type Need = { song?: number; text: string; artist?: string; why: NoTube };

/**
 * Ask for a song: the whole song on YouTube plays on the big screen from its drop (Steve on Nov 2:
 * a link, or a search once the owner has set YouTube's key), then the DJ's remix in its style.
 * Suggestions come from the site's song list (a song picked there shows by name to everyone) and,
 * when the list has nothing for what's typed, from YouTube (each search costs the key's daily
 * allowance: none while the list has the song); a few each, waiting or up next. A song with no video
 * found asks for its link before it goes in (Steve on Nov 4: a song picked from the list played as
 * the remix, not the song): a button opens YouTube's own search for it, the link copied there is
 * pasted back, or it goes in as the DJ's remix alone. On a night of the host's songs: those, whole.
 */
function Requests({ v, me, g, zh }: { v: DjView; me: string; g: G; zh: boolean }) {
  const d = v.deck;
  const { code, now } = useRoom();
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
  // YouTube, a moment after the typing stops: a pasted link's video (free), or a search when the
  // song list has nothing for it (only once the owner has set YouTube's key; till then, links)
  const typed = q.trim();
  const link = ytIdOf(typed);
  const [found, setFound] = useState<{ q: string; hits: YtHit[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [noTube, setNoTube] = useState<"nokey" | "quota" | null>(null);
  const [need, setNeed] = useState<Need | null>(null);
  useEffect(() => {
    setSearchFailed(false);
    setFound(null);
    if (d.local || pick || need || (!link && (Array.from(typed).length < 3 || hits.length > 0 || noTube))) {
      setSearching(false);
      return;
    }
    setSearching(true);
    let gone = false;
    const id = window.setTimeout(
      () => {
        const ask = link ? ytInfo(link).then((h) => (h ? [h] : [])) : ytSearch(typed);
        void ask.then((list) => {
          if (gone) return;
          if (list === "nokey" || list === "quota") setNoTube(list);
          else setFound({ q: typed, hits: list });
        }).catch(() => { if (!gone) setSearchFailed(true); }).finally(() => { if (!gone) setSearching(false); });
      },
      link ? 50 : 900,
    );
    return () => {
      gone = true;
      window.clearTimeout(id);
    };
  }, [d.local, pick, need, typed, link, noTube, hits.length, searchAttempt]);
  const fold = b?.fold ?? ((x: string) => x.toLowerCase());
  const onTube: Entry[] = useMemo(() => {
    if (d.local || pick || !found || found.q !== typed) return [];
    return found.hits.slice(0, hits.length ? 3 : 6).map((h, i) => ({ id: -1 - i, t: h.t, a: h.a, c: 0, tk: fold(h.t), key: fold(`${h.t} ${h.a}`), yt: h }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.local, pick, found, typed, hits, b]);
  // where this player's songs stand, in the order the room plays them (one player's two songs 10
  // minutes apart: theirs waits behind the others' for a while; the host's 随机: any of them next)
  const order = reqOrder(d.reqs, d.reqOn ?? {}, now());
  const waitAt = order.findIndex((r) => r.by === me);
  const resting = waitAt >= 0 && !rested(d.reqOn ?? {}, me, now()) && waitAt > 0;
  const mineN = d.reqs.filter((r) => r.by === me).length + (d.up?.by === me ? 1 : 0);
  // (the one up next or waiting first; one of theirs can be on the air while the next waits)
  const mine: { r: ReqView; at: "now" | "up" | "wait"; ahead: number } | null =
    d.up?.by === me ? { r: d.up, at: "up", ahead: 0 } : waitAt >= 0 ? { r: order[waitAt], at: "wait", ahead: waitAt + (d.up ? 1 : 0) } : d.now?.by === me ? { r: d.now, at: "now", ahead: 0 } : null;
  const enough = mineN >= DECK.reqEach;
  const full = d.reqs.length >= DECK.reqMax;
  const ended = v.phase === "end";

  // the link pasted for a song that needs one, looked up as it's pasted
  const [pasted, setPasted] = useState("");
  const [pastedHit, setPastedHit] = useState<YtHit | "none" | "finding" | "offline" | null>(null);
  const [pasteAttempt, setPasteAttempt] = useState(0);
  useEffect(() => {
    const id = ytIdOf(pasted);
    if (!id) {
      setPastedHit(pasted.trim() ? "none" : null);
      return;
    }
    let gone = false;
    setPastedHit("finding");
    void ytInfo(id).then((h) => !gone && setPastedHit(h ?? "none"), () => !gone && setPastedHit("offline"));
    return () => {
      gone = true;
    };
  }, [pasted, pasteAttempt]);

  const [finding, setFinding] = useState(false);
  const sent = () => {
    haptic(15);
    setQ("");
    setPick(null);
    setNeed(null);
    setPasted("");
  };
  /** A song in: with its video (the whole song plays on the TV), or the DJ's remix alone. */
  const ask = (s: { song?: number; text: string }, yt?: YtHit) => {
    if (s.song !== undefined) g("req", { song: s.song, text: s.text, ...(yt ? { yt: ytReq(yt) } : {}) });
    else g("req", yt ? { yt: ytReq(yt) } : { text: s.text });
    sent();
  };
  /** YouTube's video for some words (a link: its own), within 3 seconds; or why there's none. */
  const lookup = async (words: string): Promise<{ hit?: YtHit; why?: NoTube }> => {
    if (found && found.q === words && found.hits.length) return { hit: found.hits[0] };
    const id = ytIdOf(words);
    if (!id && noTube) return { why: noTube };
    const late = new Promise<"late">((ok) => window.setTimeout(() => ok("late"), 3000));
    let r: Awaited<ReturnType<typeof ytSearch>> | "late";
    try {
      r = await Promise.race([id ? ytInfo(id).then((h) => (h ? [h] : [])) : ytSearch(words), late]);
    } catch {
      return { why: "network" };
    }
    if (r === "late") return { why: "network" };
    if (r === "nokey" || r === "quota") {
      setNoTube(r);
      return { why: r };
    }
    return r.length ? { hit: r[0] } : { why: "none" };
  };
  /** A song that wants its video: found, it goes in with it; not found, the phone asks for its link. */
  const withTube = (s: { song?: number; text: string; artist?: string }) => {
    if (finding) return;
    setFinding(true);
    void lookup(s.artist ? `${s.text} ${s.artist}` : s.text).then((r) => {
      setFinding(false);
      if (r.hit) return ask(s, r.hit);
      setNeed({ ...s, why: r.why ?? "none" });
      setPick(null);
      setQ("");
    });
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (ended || full || enough || finding) return;
    if (d.local) {
      // one of the host's songs: picked, or typed out exactly (else it isn't one of them)
      const k = using ? using.fold(q.trim()) : "";
      const hit = pick ?? using?.list.find((x) => x.tk === k || x.key === k);
      if (!hit) return;
      g("req", { local: hit.local });
      return sent();
    }
    if (need) {
      // the link pasted for it (its own buttons send the remix alone, or take it back)
      if (pastedHit && typeof pastedHit === "object") ask(need, pastedHit);
      return;
    }
    if (pick?.yt) {
      g("req", { yt: ytReq(pick.yt) });
      return sent();
    }
    // one from the song list: its video on YouTube too
    if (pick) return withTube({ song: pick.id, text: pick.t, artist: pick.a });
    const text = q.trim();
    if (!text) return;
    // typed out a song on the list exactly: that one (so it shows by name)
    const k = b ? b.fold(text) : "";
    const same = b?.list.filter((x) => x.tk === k || x.key === k) ?? [];
    const hit = same.find((x) => x.c) ?? same[0];
    if (hit) return withTube({ song: hit.id, text: hit.t, artist: hit.a });
    // else YouTube's best match for it (a link: that video)
    return withTube({ text });
  };

  // where theirs stands, over the box
  const standing =
    mine && mine.at !== "now"
      ? mine.at === "up"
        ? v.juke
          ? zh
            ? `下一首就是你点的 ${songName(mine.r, zh) ?? ""}，前一首放完就开始${mine.r.ytNo ? "。YouTube 不让这首在别的网站放，放 DJ 的 Remix" : ""}`
            : `Yours is up next: ${songName(mine.r, zh) ?? ""}. It starts when the one before ends${mine.r.ytNo ? ". YouTube won't play it outside YouTube, so the DJ plays its remix" : ""}`
          : zh
            ? `下一首就是你点的 ${songName(mine.r, zh) ?? ""}，大家蓄力 Drop 进去${mine.r.ytNo ? "。YouTube 不让这首在别的网站放，Drop 进去放 DJ 的 Remix" : ""}`
            : `Yours is up next: ${songName(mine.r, zh) ?? ""}. Build up and drop into it${mine.r.ytNo ? ". YouTube won't play it outside YouTube, so its drop plays the DJ's remix" : ""}`
        : v.shuffle
          ? zh
            ? `你点的歌在歌单里，随机放`
            : `Yours is on the playlist, played in a random order`
          : zh
            ? `你点的 ${songName(mine.r, zh) ?? ""} 在排队，前面还有 ${mine.ahead} 首${resting ? "。你刚放过一首，10 分钟内别人的先放" : ""}`
            : `Yours is in line: ${songName(mine.r, zh) ?? ""}, ${mine.ahead} ahead${resting ? ". You just had one, so for 10 minutes the others go first" : ""}`
      : null;

  return (
    <form className="djk-req" onSubmit={send}>
      <span className="djk-req-title">
        <ListMusic size={24} aria-hidden="true" />
        {zh ? "点歌" : "Ask for a song"}
      </span>
      {standing && (
        <span className="djk-req-mine" aria-live="polite">
          {standing}
        </span>
      )}
      {!need && (
        <span className="djk-req-note">
          {enough
            ? zh
              ? `你在歌单里有 ${DECK.reqEach} 首了，放掉一首再点`
              : `You have ${DECK.reqEach} on the playlist. Ask again once one has played`
            : mine?.at === "now"
              ? mine.r.local || mine.r.yt
                ? zh
                  ? `正在放你点的 ${songName(mine.r, zh) ?? ""}，还可以再点`
                  : `Yours is on: ${songName(mine.r, zh) ?? ""}. You can ask for more`
                : zh
                  ? `正在放 DJ 按 ${songName(mine.r, zh) ?? ""} 做的 Remix${mine.r.ytNo ? "（YouTube 不让这首在别的网站放）" : ""}，还可以再点`
                  : `On now: the DJ's remix for ${songName(mine.r, zh) ?? ""}${mine.r.ytNo ? " (YouTube won't play the song outside YouTube)" : ""}. You can ask for more`
              : full
                ? zh
                  ? `点歌排满了（${DECK.reqMax} 首），放掉几首再点`
                  : `The line is full (${DECK.reqMax} songs). Try again in a bit`
                : d.local
                  ? zh
                    ? `搜主人的这 ${v.crateN} 首歌，点中了下一首就放原曲`
                    : `Search the host's ${v.crateN} songs. The one you pick plays next`
                  : noTube === "nokey"
                    ? zh
                      ? "输入歌名或歌手，或者贴一个 YouTube 链接。自动搜 YouTube 还没开通：要在电视上放整首，就贴这首歌的链接"
                      : "Type a song or an artist, or paste a YouTube link. The YouTube search isn't on yet: to play a song whole on the TV, paste its link"
                    : noTube === "quota"
                      ? zh
                        ? "输入歌名或歌手，或者贴一个 YouTube 链接。今天的 YouTube 自动搜索用完了，贴链接照样放整首"
                        : "Type a song or an artist, or paste a YouTube link. Today's YouTube searches are used up: a link still plays it whole"
                      : v.juke
                        ? zh
                          ? "输入歌名或歌手，或者贴 YouTube 链接。点的歌按顺序在电视上放 YouTube 上的整首"
                          : "Type a song or an artist, or paste a YouTube link. The TV plays them whole from YouTube, in turn"
                        : zh
                          ? "输入歌名或歌手，或者贴 YouTube 链接。Drop 进去之后电视上放 YouTube 上的整首，再接 DJ 按它的风格做的 Remix"
                          : "Type a song or an artist, or paste a YouTube link. After its drop the TV plays the whole song from YouTube, then the DJ's remix in its style"}
        </span>
      )}
      {need ? (
        <NeedLink need={need} zh={zh} pasted={pasted} hit={pastedHit} setPasted={setPasted} retry={() => withTube(need)} retryPaste={() => setPasteAttempt((n) => n + 1)} remix={() => ask(need)} drop={() => setNeed(null)} />
      ) : pick ? (
        <span className="djk-req-pick">
          <span>{pick.yt ? `${pick.t} · YouTube` : zh ? `${pick.a}《${pick.t}》` : `${pick.t} (${pick.a})`}</span>
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
          disabled={ended || enough}
        />
      )}
      {!need && hits.length + onTube.length > 0 && (
        <ul className="djk-req-hits" aria-label={d.local ? (zh ? "主人的歌" : "The host's songs") : zh ? "找到的歌" : "Songs found"}>
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="djk-req-hit" onClick={() => setPick(h)}>
                <span className="djk-req-hit-t">{zh ? `《${h.t}》` : h.t}</span>
                <span className="djk-req-hit-a">{h.a}</span>
              </button>
            </li>
          ))}
          {onTube.map((h) => (
            <li key={`yt-${h.yt!.id}`}>
              <button type="button" className="djk-req-hit is-yt" onClick={() => setPick(h)}>
                <span className="djk-req-hit-t">{h.t}</span>
                <span className="djk-req-hit-a">{h.a}</span>
                <span className="djk-req-hit-from">{zh ? "YouTube 整首" : "YouTube, whole song"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(searching || finding) && <Skeleton lang={zh ? "zh" : "en"} lines={3} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />}
      {!need && searchFailed && <EmptyState tone="error" title={zh ? "没搜成，检查一下网络" : "The search didn't go through. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: () => setSearchAttempt((n) => n + 1) }} />}
      {!need && !searching && !searchFailed && found?.q === typed && !hits.length && !found.hits.length && <EmptyState title={zh ? "没搜到这首，换个说法试试" : "Nothing came up. Try other words"} />}
      {failed && !using && <span className="djk-req-note">{d.local ? (zh ? "歌单没加载出来，等一下再点" : "The song list didn't load. Try again in a moment") : zh ? "曲库没加载出来，直接输入歌名也行" : "The song list didn't load. Typing the name works too"}</span>}
      {!need && (
        <button type="submit" className="djk-req-send" disabled={ended || full || enough || finding || (!pick && !q.trim())}>
          {finding ? (zh ? "在 YouTube 上找这首…" : "Finding it on YouTube…") : zh ? "点这首" : "Ask for it"}
        </button>
      )}
    </form>
  );
}

/**
 * A song the search couldn't give a video for: the TV plays it whole only from YouTube, so the phone
 * asks for its link. A button opens YouTube's own search for it (its app, on a phone that has it);
 * the link copied there is pasted back (a button reads it off the clipboard where the browser
 * lets it). Or it goes in as the DJ's remix alone, or is taken back.
 */
function NeedLink({ need, zh, pasted, hit, setPasted, retry, retryPaste, remix, drop }: { need: Need; zh: boolean; pasted: string; hit: YtHit | "none" | "finding" | "offline" | null; setPasted: (s: string) => void; retry: () => void; retryPaste: () => void; remix: () => void; drop: () => void }) {
  const words = need.artist ? `${need.artist} ${need.text}` : need.text;
  const name = need.artist ? (zh ? `${need.artist}《${need.text}》` : `${need.text} (${need.artist})`) : zh ? `《${need.text}》` : `"${need.text}"`;
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
  const paste = () => {
    navigator.clipboard
      .readText()
      .then((t) => t && setPasted(t.trim()))
      .catch(() => {});
  };
  const why =
    need.why === "nokey"
      ? zh
        ? "电视放整首要这首歌的 YouTube 链接（自动搜 YouTube 还没开通）。去 YouTube 找到它，分享里复制链接，贴回这里"
        : "The TV plays it whole from its YouTube link (the YouTube search isn't on yet). Find it on YouTube, copy its link from Share, and paste it here"
      : need.why === "quota"
        ? zh
          ? "今天的 YouTube 自动搜索用完了。去 YouTube 找到它，复制链接贴回这里，照样放整首"
          : "Today's YouTube searches are used up. Find it on YouTube, copy its link and paste it here: it still plays whole"
        : zh
          ? "YouTube 上没搜到这首。去 YouTube 找找，复制链接贴回这里"
          : "No video came up for it. Look on YouTube, copy the link and paste it here";
  const ok = hit && typeof hit === "object" ? hit : null;
  return (
    <div className="djk-need" role="group" aria-label={zh ? "这首歌的 YouTube 链接" : "This song's YouTube link"}>
      <span className="djk-need-song">
        <span>{name}</span>
        <button type="button" aria-label={zh ? "不点这首了" : "Don't ask for it"} onClick={drop}>
          <X size={20} aria-hidden="true" />
        </button>
      </span>
      {need.why === "network" ? <EmptyState tone="error" title={zh ? "没连上 YouTube，检查一下网络" : "Couldn't reach YouTube. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: retry }} /> : <span className="djk-req-note">{why}</span>}
      <a className="djk-need-find" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(words)}`} target="_blank" rel="noopener noreferrer">
        <Search size={18} aria-hidden="true" />
        {zh ? "去 YouTube 找这首" : "Find it on YouTube"}
      </a>
      <span className="djk-need-paste">
        <input
          className="djk-req-input"
          type="url"
          inputMode="url"
          value={pasted}
          placeholder={zh ? "贴 YouTube 链接" : "Paste the YouTube link"}
          aria-label={zh ? "这首歌的 YouTube 链接" : "The song's YouTube link"}
          autoComplete="off"
          onChange={(e) => setPasted(e.target.value)}
        />
        {canPaste && (
          <button type="button" className="djk-req-cancel" onClick={paste}>
            <ClipboardPaste size={18} aria-hidden="true" />
            {zh ? "粘贴" : "Paste"}
          </button>
        )}
      </span>
      {hit === "offline" ? <EmptyState tone="error" title={zh ? "没连上 YouTube，检查一下网络" : "Couldn't reach YouTube. Check your connection"} action={{ label: zh ? "再试一次" : "Try again", onClick: retryPaste }} /> : hit && (
        <span className={`djk-need-hit ${ok ? "is-ok" : ""}`} aria-live="polite">
          {hit === "finding" ? (zh ? "在看这个链接…" : "Checking the link…") : hit === "none" ? (zh ? "这不是能放的 YouTube 链接" : "That isn't a YouTube link that can play here") : zh ? `找到了：${ok!.t}` : `Found: ${ok!.t}`}
        </span>
      )}
      <button type="submit" className="djk-req-send" disabled={!ok}>
        {zh ? "点这首（电视放整首）" : "Ask for it (the TV plays it whole)"}
      </button>
      <button type="button" className="djk-req-cancel djk-need-remix" onClick={remix}>
        {zh ? "不用链接，只放 DJ 的 Remix" : "No link: the DJ's remix alone"}
      </button>
    </div>
  );
}
