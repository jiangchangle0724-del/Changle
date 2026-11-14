import { ClipboardPaste, ListMusic, ListOrdered, Search, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../../online/RoomContext";
import { reqOrder, rested } from "../../../shared/dj/deck";
import { DECK, MOVES, OVER_SONG, PAD_IDS, REQ_CHARS, type PadId } from "../../../shared/dj/types";
import type { DjView, ReqView } from "../../../shared/protocol";
import { haptic } from "../../../lib/sfx";
import { useStore } from "../../../store";
import { dataUrl } from "../../../online/config";
import type { CrateSong } from "../../../shared/dj/types";
import { PADS, songName } from "../deck/words";
import { ytIdOf, type YtHit } from "../../../shared/dj/youtube";
import { ytInfo, ytSearch } from "./youtube";
import { EmptyState } from "../../../ui/EmptyState";
import { Skeleton } from "../../../ui/Skeleton";
import { Player, type G } from "./Player";
import { SendSongs } from "./SendSongs";
// the design tokens (docs/DESIGN.md) aren't loaded site-wide yet: the deck brings them (same values as global.css)
import "../../../styles/tokens.css";
import "../../../styles/dj-deck.css";
import { useDjNames } from "../names";

export type { G } from "./Player";

const L = (x: { zh: string; en: string }, zh: boolean) => (zh ? x.zh : x.en);

/**
 * 打碟 · DJ Booth on a phone (Steve on Nov 12: the turntables, the mixer, the crossfader and the
 * build-up and DROP gone, "不需要drop了"): the player at the top (上一曲, 暂停 or 播放, 切歌, for
 * anyone at the table), the song box, the night's 歌单, and the sound pads, which the big screen
 * plays on the next beat. The room plays the songs asked for one after another (点歌模式).
 */
export function DeckPad({ v }: { v: DjView }) {
  const { g, me } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const nameOf = useDjNames(zh);
  const d = v.deck;
  const playingNow = v.phase !== "wait" && v.phase !== "end";
  // the pads that work the music wait while a whole song plays on the TV, or the room is paused
  // (the ones that are a sound of their own play over it)
  const live = playingNow && !d.song && !d.paused;
  // (the 歌单's order: one player's two songs 10 minutes apart)
  useTicker(playingNow, 4000);

  /* ---------------- someone else's pad, or song, for a moment */
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
    } else if (e.fx === "req") say(zh ? `${nameOf(e.pid)} 点了一首歌` : `${nameOf(e.pid)} asked for a song`);
  });

  return (
    <section className="djk" aria-label={zh ? "点歌" : "Songs"}>
      <Player v={v} me={me} g={g} zh={zh} nameOf={nameOf} />
      <Requests v={v} me={me} g={g} zh={zh} />
      {/* a song file from this phone onto the 歌单 (anyone, Steve on Nov 13) */}
      <SendSongs v={v} zh={zh} />
      <Playlist v={v} me={me} g={g} zh={zh} />
      <section className="djk-sounds" aria-label={zh ? "音效" : "Sounds"}>
        <span className="djk-sounds-title">{zh ? "音效：电视上下一拍响" : "Sounds: on the TV from the next beat"}</span>
        <div className="djk-pads">
          {PAD_IDS.map((p) => (
            <Pad key={p} pad={p} live={live || (playingNow && (!!d.song || !!d.paused) && OVER_SONG.includes(p))} braking={MOVES.includes(p) && !!d.drop} g={g} zh={zh} />
          ))}
        </div>
        <p className="djk-said" aria-live="polite">
          {said.map((x) => (
            <span key={x.id}>{x.text}</span>
          ))}
        </p>
      </section>
    </section>
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
export function Playlist({ v, me, g, zh, boss = false }: { v: DjView; me: string; g: G; zh: boolean; boss?: boolean }) {
  const d = v.deck;
  const { now, isHost: host } = useRoom();
  // (the shared phone switches 随机 too: the big screen itself, `boss`; it takes out only its own)
  const isHost = host || boss;
  const nameOf = useDjNames(zh);
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
                {(theirs || host) && (
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
export function Requests({ v, me, g, zh, each = DECK.reqEach }: { v: DjView; me: string; g: G; zh: boolean; each?: number }) {
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
  const enough = mineN >= each;
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
              ? `你在歌单里有 ${each} 首了，放掉一首再点`
              : `You have ${each} on the playlist. Ask again once one has played`
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
                    ? `搜电视上的这 ${v.crateN} 首歌，点中了下一首就放原曲`
                    : `Search the TV's ${v.crateN} songs. The one you pick plays next`
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
        <ul className="djk-req-hits" aria-label={d.local ? (zh ? "电视上的歌" : "The TV's songs") : zh ? "找到的歌" : "Songs found"}>
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
