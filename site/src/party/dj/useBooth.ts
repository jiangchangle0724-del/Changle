import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FAKE_MIX, mixFor, playing } from "../../shared/dj/curve";
import { offAir, onAir } from "../../shared/dj/deck";
import { fileNumber, type SongPiece } from "../../shared/dj/songwire";
import type { DeckSide, DjPhase, Mix, PadId, SongSent, Source, StyleId } from "../../shared/dj/types";
import type { DeckView } from "../../shared/protocol";
import { previewUrl } from "../../shared/songs";
import { loadClip, type Clip } from "./clip/clip";
import { DeckDriver, type Grid } from "./deck/driver";
import { FakeDj } from "./fake/FakeDj";
import { CRATE_MAX, readSong, songId, SONG_FILES, type NotAdded } from "./local/crate";
import { LocalDj, type LocalSong } from "./local/LocalDj";
import { FINAL, LyriaDj, type LyriaWhy } from "./lyria/LyriaDj";
import { Speaker } from "./speaker/speaker";

export type BoothStatus = "idle" | "starting" | "on" | "error";

/** How the playing has gone since the last report (sent to the room once a minute). */
export type BoothReport = { stalls: number; resets: number; seconds: number };

/** Whichever DJ is playing, as the screens read it: the beat, the stretch being heard. */
export type BoothDj = {
  /** the stand-in has music recorded (it always starts the night) */
  readonly ready: boolean;
  /** it plays two decks in step (the stand-in) or one (Lyria) */
  readonly decks: boolean;
  readonly bpm: number;
  /** changes whenever its bars start over (a new stream, the other DJ) */
  readonly epoch: number;
  beat(): number;
  /** the speaker's frame where beat `b` of the stream falls, or null while it doesn't know */
  beatFrame(b: number): number | null;
  heardSection(): { id: string; phase: DjPhase } | null;
  holdFor(ms: number): void;
  /** a drop on its way into deck `side` at the night's beat `beat` (the host's songs: its loud part
   *  lands there; a song asked for by name: its clip starts there) */
  cue(side: DeckSide, beat: number): void;
};

/** The host's songs being added: how far along, and the ones that couldn't be. */
export type Adding = { done: number; total: number; name: string };

/** A song file the host's phone is sending (songwire.ts): its pieces so far. */
type Incoming = { by: string; id: string; n: number; size: number; name: string; type: string; parts: (Uint8Array | null)[]; got: number; at: number };
/** Songs from the host's phone are kept in this computer's memory (not on its disk): this much at most. */
const PHONE_SONGS_BYTES = 400 * 1024 * 1024;
/** files coming in at once, and how long one may go quiet before it's given up on */
const INCOMING_MAX = 3;
const INCOMING_MS = 60_000;

/**
 * One booth per page: the speaker (with the tap that woke its sound), the stand-in DJ (with the
 * sections it has recorded) and, at one of the owner's tables, the Lyria DJ outlive the screen
 * that shows them. When the host closes the booth and opens it again, the music comes back
 * without anyone walking over to the TV to tap again.
 */
type PageBooth = {
  fake: FakeDj;
  lyria: LyriaDj | null;
  /** the host's own songs (a night of them): the DJ that plays them, the songs on this computer, the
   *  ones being added and the ones that couldn't be, and whether the host wants them played */
  local: LocalDj;
  crate: LocalSong[];
  adding: Adding | null;
  failed: { name: string; why: NotAdded }[];
  queue: Promise<void>;
  /** song files the host's phone is sending, and the bytes of those already added */
  incoming: Map<string, Incoming>;
  fromPhone: number;
  /** which one the speaker is playing */
  using: Source;
  /** Lyria said no for good at this table (not the owner's, no key, the month's cap) */
  blocked: { key: string; why: LyriaWhy } | null;
  speaker: Speaker | null;
  starting: boolean;
  error: boolean;
  listeners: Set<() => void>;
  dj: BoothDj;
};
let page: PageBooth | null = null;
function pageBooth(): PageBooth {
  if (!page) {
    const b = {
      fake: new FakeDj(),
      lyria: null,
      local: new LocalDj(),
      crate: [],
      adding: null,
      failed: [],
      queue: Promise.resolve(),
      incoming: new Map(),
      fromPhone: 0,
      using: "fake",
      blocked: null,
      speaker: null,
      starting: false,
      error: false,
      listeners: new Set(),
    } as unknown as PageBooth;
    const now = () => (b.using === "lyria" && b.lyria ? b.lyria : b.using === "local" ? b.local : b.fake);
    b.dj = {
      get ready() {
        return b.fake.ready;
      },
      get decks() {
        return now().decks;
      },
      get bpm() {
        return now().bpm;
      },
      get epoch() {
        return (b.using === "lyria" ? 1_000_000 : b.using === "local" ? 2_000_000 : 0) + now().epoch;
      },
      beat: () => now().beat(),
      beatFrame: (n) => now().beatFrame(n),
      heardSection: () => now().heardSection(),
      holdFor: (ms) => now().holdFor(ms),
      cue: (side, beat) => {
        if (b.using === "local") b.local.cue(side, beat);
        else if (b.using === "fake") b.fake.cueClip(side, beat);
      },
    };
    page = b;
  }
  return page;
}
const statusOf = (b: PageBooth): BoothStatus => (b.speaker ? "on" : b.starting ? "starting" : b.error ? "error" : "idle");
const tell = (b: PageBooth) => b.listeners.forEach((fn) => fn());

/**
 * The host's song files, listened to one at a time (each is decoded and its beat found: a second
 * or two a song), added to the night's list as they're done; one already there isn't added again.
 * `told`: how each went (a song from the host's phone: the phone hears it).
 */
function addSongs(b: PageBooth, files: File[], told?: (f: File, r: SongSent) => void) {
  const todo = files.filter((f) => {
    const ok = SONG_FILES.test(f.name) || f.type.startsWith("audio/");
    if (!ok) told?.(f, "kind");
    return ok;
  });
  b.queue = b.queue.then(async () => {
    for (let i = 0; i < todo.length; i++) {
      const f = todo[i];
      if (b.crate.length >= CRATE_MAX) {
        todo.slice(i).forEach((x) => told?.(x, "full"));
        break;
      }
      const id = songId(f);
      if (b.crate.some((s) => s.id === id)) {
        told?.(f, "there");
        continue;
      }
      b.adding = { done: i, total: todo.length, name: f.name };
      tell(b);
      const r = await readSong(f, id);
      if (typeof r === "string") b.failed = [...b.failed, { name: f.name, why: r }].slice(-20);
      else {
        b.crate = [...b.crate, r];
        b.local.setCrate(b.crate);
      }
      told?.(f, typeof r === "string" ? r : "added");
      tell(b);
      // a breath for the page between songs
      await new Promise((ok) => window.setTimeout(ok, 30));
    }
    b.adding = null;
    tell(b);
  });
}

/**
 * A piece of a song file the host's phone sends (songwire.ts, passed on by the rooms server): kept
 * until the file is whole, then listened to like this computer's own; `told`: how it went, for
 * that phone. Files that go quiet for a minute are given up on.
 */
function takePiece(b: PageBooth, p: { h: SongPiece; bytes: Uint8Array }, told: (by: string, id: number, r: SongSent) => void) {
  const by = p.h.by;
  if (!by) return;
  const now = Date.now();
  for (const [k, f] of b.incoming) if (now - f.at > INCOMING_MS) b.incoming.delete(k);
  const key = `${by}:${p.h.id}`;
  let f = b.incoming.get(key);
  if (!f) {
    if (b.incoming.size >= INCOMING_MAX) return;
    f = { by, id: p.h.id, n: p.h.n, size: p.h.size, name: p.h.name, type: p.h.type, parts: new Array<Uint8Array | null>(p.h.n).fill(null), got: 0, at: now };
    b.incoming.set(key, f);
  }
  if (f.n !== p.h.n || f.size !== p.h.size || f.parts[p.h.i]) return;
  f.parts[p.h.i] = p.bytes;
  f.got += 1;
  f.at = now;
  if (f.got < f.n) return;
  b.incoming.delete(key);
  const num = fileNumber(f.id);
  if (b.fromPhone + f.size > PHONE_SONGS_BYTES) return told(by, num, "full");
  const size = f.size;
  // (the same file sent again has the same id: its name and size)
  const file = new File(f.parts as Uint8Array<ArrayBuffer>[], f.name, { type: f.type, lastModified: 0 });
  addSongs(b, [file], (_, r) => {
    if (r === "added") b.fromPhone += size;
    told(by, num, r);
  });
}

/** Where the speaker may stream Lyria from (the table's relay), when the table may (`v.lab`). */
export type LyriaAt = { url: string; key: string };

/**
 * The speaker's side of the booth: the sound chain, the DJ following the night's phase, and the
 * clocks the dancers and lights read. `start()` must run inside a tap. The stand-in always starts
 * the music; at one of the owner's tables Lyria takes over once it has a few seconds in hand, and
 * if it stops for good the stand-in comes back.
 */
export function useBooth({
  phase,
  mix,
  muted,
  onReport,
  lyria,
  deck,
  now,
  onGrid,
  onDecks,
  roomSource,
  onEnding,
}: {
  phase: DjPhase;
  mix?: Mix;
  muted: boolean;
  onReport?: (r: BoothReport) => void;
  lyria?: LyriaAt | null;
  /** the beginner deck, as the room has it (the speaker plays it) */
  deck?: DeckView;
  /** the server's clock (ms), and where to tell the room the speaker's bars fall */
  now?: () => number;
  onGrid?: (g: Grid) => void;
  /** tells the room the styles the decks really sound (a drop only swaps to a deck that plays its pick),
   *  and on a night of the host's songs which songs they have */
  onDecks?: (d: { a: StyleId; b: StyleId | null; sa?: string | null; sb?: string | null }) => void;
  /** where the room says the music comes from: `local`, the host's songs, takes the speaker once the
   *  song on the air is ready */
  roomSource?: Source;
  /** the host's song on the air is nearly over (the room drops into the next) */
  onEnding?: (id: string) => void;
}) {
  const booth = pageBooth();
  const { fake } = booth;
  const [status, setStatus] = useState<BoothStatus>(() => statusOf(booth));
  const [source, setSource] = useState<Source>(booth.using);
  const [prepared, setPrepared] = useState(fake.ready);
  // the host's songs change as they're added (the page's booth keeps them)
  const [, setTick] = useState(0);
  const speaker = status === "on" ? booth.speaker : null;
  const report = useRef(onReport);
  report.current = onReport;
  const theMix = mix ?? mixFor(phase, FAKE_MIX);

  useEffect(() => {
    const sync = () => {
      setStatus(statusOf(booth));
      setSource(booth.using);
      setTick((n) => n + 1);
    };
    booth.listeners.add(sync);
    sync();
    return () => {
      booth.listeners.delete(sync);
    };
  }, [booth]);

  // record the sections straight away: no tap needed, and the music can start the moment it's asked for
  useEffect(() => {
    fake.onReady = () => setPrepared(true);
    if (fake.ready) setPrepared(true);
    fake.prepare(phase);
    return () => {
      fake.onReady = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fake]);

  const start = useCallback(() => {
    if (booth.speaker || booth.starting) return;
    let sp: Speaker;
    try {
      // made and woken inside the tap
      sp = new Speaker();
    } catch {
      booth.error = true;
      tell(booth);
      return;
    }
    booth.starting = true;
    booth.error = false;
    tell(booth);
    sp.ready()
      .then(() => {
        booth.speaker = sp;
        fake.attach(sp);
      })
      .catch(() => {
        sp.close();
        booth.error = true;
      })
      .finally(() => {
        booth.starting = false;
        tell(booth);
      });
  }, [booth, fake]);

  // the music follows the night while this screen is up; when it goes (the booth closed), quiet
  const mixKey = JSON.stringify(theMix);
  useEffect(() => {
    fake.setPhase(phase);
    booth.lyria?.setPhase(phase, theMix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fake, booth, phase, mixKey]);
  useEffect(() => () => fake.setPhase("wait"), [fake]);
  useEffect(() => speaker?.setVolume(muted ? 0 : 1), [speaker, muted]);
  // the stand-in's recordings are dry: the speaker's room is theirs (Lyria brings its own)
  useEffect(() => speaker?.setRoom(source === "fake"), [speaker, source]);

  // Lyria, at one of the owner's tables, while music plays: the stand-in starts the night and
  // hands over once Lyria has a few seconds in hand; back to the stand-in if Lyria stops for good
  const lyriaKey = lyria?.key ?? "";
  useEffect(() => {
    // the table stopped being one of the owner's: a later return may try Lyria again
    if (!lyria) booth.blocked = null;
    const blocked = !!booth.blocked && booth.blocked.key === lyriaKey;
    // (never on a night of the host's songs)
    const want = !!speaker && !!lyria && playing(phase) && !blocked && roomSource !== "local";
    if (want && lyria && !booth.lyria) {
      const l = new LyriaDj(lyria.url);
      booth.lyria = l;
      l.onReady = () => {
        if (booth.lyria !== l || !booth.speaker) return;
        fake.detach();
        l.go(booth.speaker);
        booth.using = "lyria";
        tell(booth);
      };
      l.onFail = (why) => {
        if (booth.lyria !== l) return;
        booth.lyria = null;
        if (FINAL.includes(why)) booth.blocked = { key: lyriaKey, why };
        if (booth.using === "lyria" && booth.speaker) {
          booth.using = "fake";
          fake.attach(booth.speaker);
        }
        tell(booth);
      };
      l.onFiltered = (text, why) => console.warn("Lyria turned down a prompt", text, why);
      l.begin(phase, theMix);
    } else if (!want && booth.lyria) {
      const l = booth.lyria;
      booth.lyria = null;
      l.stop();
      if (booth.using === "lyria") {
        booth.using = "fake";
        const sp = booth.speaker;
        if (sp) {
          // the set ended on Lyria: fade it as the stand-in's end fades, and leave the stand-in
          // ready for the next set
          if (!playing(phase)) {
            sp.fadeOut(3);
            window.setTimeout(() => {
              if (booth.using === "fake" && !playing(phase)) sp.flush();
            }, 3500);
          }
          fake.attach(sp);
        }
      }
      tell(booth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth, fake, speaker, phase, lyriaKey, roomSource]);

  // the screen goes (the booth closed, another table): Lyria goes with it, the stand-in stays
  // quiet until a booth is up again
  useEffect(
    () => () => {
      booth.blocked = null;
      const l = booth.lyria;
      if (!l) return;
      booth.lyria = null;
      l.stop();
      if (booth.using === "lyria") {
        booth.using = "fake";
        fake.setPhase("wait");
        if (booth.speaker) {
          booth.speaker.fadeOut(1);
          fake.attach(booth.speaker);
        }
      }
      tell(booth);
    },
    [booth, fake],
  );

  // the beginner deck: the decks' styles to the stand-in (Lyria follows the mix), the rest to the
  // driver, which plays it on the beat
  const deckA = deck?.a ?? "house";
  const deckB = deck?.b ?? null;
  useEffect(() => fake.setDecks(deckA, deckB), [fake, deckA, deckB]);
  // a song asked for by name went on the air: the stand-in's next song is its remix (the same name,
  // the same remix), from its next section (Lyria plays its style: the decks above)
  const reqId = deck?.now?.id ?? "";
  const reqTrack = deck?.now?.track ?? 0;
  useEffect(() => {
    if (reqId && reqTrack) fake.playTrack(reqTrack);
  }, [fake, reqId, reqTrack]);
  // ...and its clip (clip/clip.ts: Apple's 30 seconds of it), fetched once it's up next: the deck it
  // was asked onto plays it from the drop's bar (or the next bar line, the fader having taken it
  // there), the remix carrying on after; on Lyria it plays over the stream once it's on the air
  const upUrl = deck?.up?.p ? previewUrl(deck.up.p) : null;
  const nowUrl = deck?.now?.p ? previewUrl(deck.now.p) : null;
  const [clips, setClips] = useState<Record<string, Clip | null>>({});
  useEffect(() => {
    let gone = false;
    const want = [upUrl, nowUrl].filter((u): u is string => !!u);
    for (const url of want)
      void loadClip(url).then((c) => {
        if (!gone) setClips((m) => (m[url] === c ? m : Object.fromEntries([...want.filter((u) => u in m && u !== url).map((u) => [u, m[u]]), [url, c]])));
      });
    return () => {
      gone = true;
    };
  }, [upUrl, nowUrl]);
  const clipUp = upUrl ? (clips[upUrl] ?? null) : null;
  const clipNow = nowUrl ? (clips[nowUrl] ?? null) : null;
  const clipSide = deck ? onAir(deck) : "a";
  const clipNext = deck ? offAir(deck) : "b";
  useEffect(() => {
    fake.setClip(clipSide, clipNow);
    fake.setClip(clipNext, clipUp);
    if (clipNow) fake.startClip(clipSide);
    booth.lyria?.setClip(clipNow);
  }, [fake, booth, clipSide, clipNext, clipUp, clipNow, source, status]);
  // the host's songs: the room's decks to the local DJ (it decodes a song as soon as it's on a deck);
  // once the room plays them and the song on the air is ready, the local DJ takes the speaker (and
  // gives it back to the stand-in when the room no longer does)
  const local = booth.local;
  const songA = deck?.songs?.a ?? null;
  const songB = deck?.songs?.b ?? null;
  const air = deck ? onAir(deck) : "a";
  const fader = deck?.fader ?? 0;
  useEffect(() => local.setDecks(songA, songB, air, fader), [local, songA, songB, air, fader]);
  useEffect(() => local.setPhase(phase), [local, phase]);
  const [localTick, setLocalTick] = useState(0);
  const ending = useRef(onEnding);
  ending.current = onEnding;
  useEffect(() => {
    local.onChange = () => setLocalTick((n) => n + 1);
    local.onEnding = (id) => ending.current?.(id);
    return () => {
      local.onChange = null;
      local.onEnding = null;
    };
  }, [local]);
  useEffect(() => {
    const sp = booth.speaker;
    if (!sp || !speaker) return;
    const wantLocal = roomSource === "local";
    if (wantLocal && booth.using !== "local" && local.ready) {
      if (booth.lyria) {
        const l = booth.lyria;
        booth.lyria = null;
        l.stop();
      }
      fake.detach();
      local.attach(sp);
      booth.using = "local";
      tell(booth);
    } else if (!wantLocal && booth.using === "local") {
      local.detach();
      booth.using = "fake";
      fake.attach(sp);
      tell(booth);
    }
  }, [booth, fake, local, speaker, roomSource, localTick]);

  const clock = useRef(now);
  clock.current = now;
  const grid = useRef(onGrid);
  grid.current = onGrid;
  const driver = useMemo(() => (speaker ? new DeckDriver(speaker, booth.dj, () => (clock.current ? clock.current() : Date.now()), (g) => grid.current?.(g)) : null), [speaker, booth]);
  useEffect(() => () => driver?.stop(), [driver]);
  useEffect(() => {
    if (driver && deck) driver.update(deck, playing(phase));
  }, [driver, deck, phase]);
  const pad = useCallback((p: PadId) => driver?.pad(p), [driver]);
  // what the stand-in's decks sound now, told to the room whenever the room has it otherwise (said
  // again every 1.5 s until it has: a word can be lost, or turned away)
  const decksTo = useRef(onDecks);
  decksTo.current = onDecks;
  const roomHas = useRef(deck?.sounding ?? null);
  roomHas.current = deck?.sounding ?? null;
  // (a night of the host's songs: the decks' styles as the room has them, and the songs the local DJ has)
  const srcNow = useRef(roomSource);
  srcNow.current = roomSource;
  const styles = useRef({ a: deckA, b: deckB });
  styles.current = { a: deckA, b: deckB };
  useEffect(() => {
    if (!speaker) return;
    let saidAt = -Infinity;
    const id = window.setInterval(() => {
      let hd: { a: StyleId; b: StyleId | null; sa?: string | null; sb?: string | null } | null = null;
      if (srcNow.current === "local") {
        const s = local.sounding();
        hd = { ...styles.current, sa: s.a, sb: s.b };
      } else if (booth.using === "fake") hd = fake.heardDecks();
      const has = roomHas.current;
      if (!hd || (has && has.a === hd.a && has.b === hd.b && (has.sa ?? null) === (hd.sa ?? null) && (has.sb ?? null) === (hd.sb ?? null))) return;
      if (performance.now() - saidAt < 1500) return;
      saidAt = performance.now();
      decksTo.current?.(hd);
    }, 500);
    return () => window.clearInterval(id);
  }, [speaker, booth, fake, local]);

  // the phone or tablet stopped the sound (the screen locked, a call): it takes a tap to wake it
  const [stopped, setStopped] = useState(false);
  const wakes = useRef(0);
  useEffect(() => {
    if (!speaker) return;
    // (also stopped: a sound that says it's running while its clock stands still, as a tablet's
    // can after the screen went dark: nudged once by itself, then the tap wakes it)
    let last = speaker.ctx.currentTime;
    let still = 0;
    const id = window.setInterval(() => {
      const t = speaker.ctx.currentTime;
      still = speaker.running && document.visibilityState === "visible" && t === last ? still + 1 : 0;
      last = t;
      if (still === 3) speaker.nudge();
      setStopped(!speaker.running || still >= 5);
    }, 1000);
    return () => window.clearInterval(id);
  }, [speaker]);
  const wake = useCallback(() => {
    speaker?.resume();
    wakes.current += 1;
    setStopped(false);
  }, [speaker]);

  // once a minute: stalls since the last report, times the sound had to be woken, seconds played
  useEffect(() => {
    if (!speaker) return;
    let stalls = speaker.stats().stalls;
    let woke = wakes.current;
    let played = 0;
    let lastAt = performance.now();
    const sample = window.setInterval(() => {
      const now = performance.now();
      if (speaker.stats().state === "playing") played += (now - lastAt) / 1000;
      lastAt = now;
    }, 1000);
    const send = window.setInterval(() => {
      const st = speaker.stats().stalls;
      const r = { stalls: Math.max(0, st - stalls), resets: wakes.current - woke, seconds: Math.round(played) };
      stalls = st;
      woke = wakes.current;
      played = 0;
      if (r.seconds > 0 || r.stalls > 0 || r.resets > 0) report.current?.(r);
    }, 60_000);
    return () => {
      window.clearInterval(sample);
      window.clearInterval(send);
    };
  }, [speaker]);

  const addFiles = useCallback((files: File[]) => addSongs(booth, files), [booth]);
  const takeSongPiece = useCallback((p: { h: SongPiece; bytes: Uint8Array }, told: (by: string, id: number, r: SongSent) => void) => takePiece(booth, p, told), [booth]);
  const clearSongs = useCallback(() => {
    booth.crate = [];
    booth.failed = [];
    booth.fromPhone = 0;
    booth.local.setCrate([]);
    tell(booth);
  }, [booth]);
  return {
    start,
    status,
    prepared,
    speaker,
    dj: booth.dj,
    source,
    stopped,
    wake,
    pad,
    driver,
    /** the song asked for that's on the air brought its clip, and this booth has it */
    clipOn: !!clipNow,
    crate: booth.crate,
    adding: booth.adding,
    failed: booth.failed,
    addFiles,
    takeSongPiece,
    clearSongs,
  };
}
