/**
 * 打碟 · DJ Booth: the booth's rules on the rooms server. A big screen opened at changle.ca/dj
 * opens the booth by itself; the music starts when that screen (the speaker) says it is playing;
 * then the night runs warm-up → build → peak → wind-down → end, moving on by itself on a clock the
 * host can override, and every set ends 4 hours after its music started.
 *
 * The room also takes and keeps what the table asks of the DJ: 🔥 and ❄️, everyone's style knobs,
 * drop requests and described songs. Turning those into the music is the DJ's (A4, A5), not this.
 * And it runs the beginner deck: the decks and the fader, the pads, the build-up and the drop, the
 * picks, and songs asked for by name, each loaded on the deck off the air for the next drop.
 */
import { SONG_ROWS } from "../../../data/songs";
import { ENERGY, FAKE_MIX, heatLean, LEAN_MS, mixFor, playing } from "../../dj/curve";
import { DANCE } from "../../dj/dance";
import { aim, beatAt, beatMsOf, chargeNow, cued, deckWeights, freshDeck, grade, hasB, leader, offAir, onAir, reaim, reqOrder, styleOn } from "../../dj/deck";
import { hintOf, styleForRequest, trackFor } from "../../dj/requests";
import {
  ASK_CHARS,
  ASKS_EACH,
  CHECKED,
  CRATE_MAX,
  DECK,
  DJ_TIMES,
  FIRE_TAKE_MS,
  KEEP_DONE,
  KNOB_STEP,
  MOVES,
  PAD_IDS,
  QUEUE_MAX,
  REQ_CHARS,
  SET_PHASES,
  SONG_SENT,
  STYLE_IDS,
  WAITING,
  MIX_FX,
  MIX_KNOBS,
  MIXER,
  freshMixer,
  type MixFx,
  type MixKnob,
  type CrateSong,
  type DjPhase,
  type PadId,
  type RoomState,
  type SetPhase,
  type SongReq,
  type StyleId,
  type Track,
} from "../../dj/types";
import type { DeckView, DjTrack, DjView, ReqView } from "../../protocol";
import { fromRow, previewOk, type Song } from "../../songs";
import { clean, num, type Api, type GameDef } from "../api";

/** 🔥 and ❄️ presses kept (each) */
const KEEP_REACTS = 40;
const KEEP_DROPS = 20;
/** The speaker reports at most this often (it sends once a minute; a screen can't be kicked). */
const STATS_GAP_MS = 30_000;

function fresh(set: number): RoomState {
  return {
    phase: "wait",
    liveAt: 0,
    phaseAt: 0,
    nextAt: 0,
    capAt: 0,
    mix: mixFor("wait", FAKE_MIX),
    source: "fake",
    fires: [],
    total: {},
    colds: [],
    knobs: {},
    drops: [],
    queue: [],
    speaker: { at: 0, stalls: 0, resets: 0, seconds: 0 },
    set,
    deck: freshDeck(),
    crate: [],
    crateV: 0,
    mine: false,
    voice: true,
    dance: {},
    danceBar: { bar: -1, n: 0, good: 0 },
    combo: 0,
  };
}

/** A booth saved before a field existed gets it empty (the state is stored whole). */
function norm(s: RoomState): RoomState {
  s.colds ??= [];
  s.knobs ??= {};
  s.drops ??= [];
  s.queue ??= [];
  s.crate ??= [];
  s.crateV ??= 0;
  s.mine ??= false;
  s.voice ??= true;
  s.dance ??= {};
  s.danceBar ??= { bar: -1, n: 0, good: 0 };
  s.combo ??= 0;
  // a deck saved before a field existed gets it fresh
  s.deck = { ...freshDeck(), ...s.deck };
  return s;
}

/* ------------------------------------------------------------------ the beginner deck */

/** What the speaker plays follows the decks: their styles, blended by the fader. */
function syncMix(s: RoomState) {
  s.mix = { ...s.mix, weights: deckWeights(s.deck) };
}

/** The floor's pick goes on the deck that's off the air (unless it's what's on the air already). */
function load(s: RoomState) {
  const d = s.deck;
  const next = leader(d.votes);
  // (a song asked for, up next, has that deck until its drop)
  if (next && !d.up && styleOn(d, onAir(d)) !== next) {
    if (offAir(d) === "b") d.b = next;
    else d.a = next;
  }
  syncMix(s);
}

/** The taps waiting, added to the build-up (no faster than DECK.maxRise a second); full arms the drop. */
function fold(s: RoomState, api: Api) {
  const d = s.deck;
  const now = api.now;
  const since = Math.min(1000, Math.max(0, now - d.chargeAt));
  const rise = Math.min(d.pending * DECK.tapStep, (DECK.maxRise * since) / 1000);
  d.charge = Math.min(1, chargeNow(d, now) + rise);
  d.chargeAt = now;
  d.pending = 0;
  if (d.charge >= 1) arm(s, api);
}

/** The build-up is full: the countdown to the next drop bar starts. */
function arm(s: RoomState, api: Api) {
  const d = s.deck;
  const t = aim(d.grid, api.now);
  // a swap when the floor's pick is cued on the deck off the air (and really plays there)
  d.drop = { ...t, misses: 0, auto: false, hits: [], to: cued(d, s.source === "lyria") ?? onAir(d) };
  d.charge = 1;
  api.timer("drop", t.at);
}

/** The drop lands: the fader jumps to its deck, the build-up starts over. */
function land(s: RoomState, api: Api) {
  const d = s.deck;
  const dr = d.drop!;
  d.last = { at: dr.at, bar: dr.bar, hits: dr.hits, auto: dr.hits.length === 0, to: dr.to, style: styleOn(d, dr.to) ?? d.a };
  for (const h of dr.hits) if (h.grade === "perfect") d.perfects[h.pid] = (d.perfects[h.pid] ?? 0) + 1;
  const was = onAir(d);
  d.fader = dr.to === "b" ? 1 : 0;
  d.faderBy = null;
  d.drop = null;
  d.charge = 0;
  d.chargeAt = api.now;
  d.pending = 0;
  // the drop hits whole: the mixer's knobs go back to 0 on its bar (its effects stay on)
  d.mixer = { ...d.mixer, knobs: freshMixer().knobs, knobBy: {}, knobAt: {} };
  // the decks swapped: the picks were for this one, they start over; a song asked for plays now
  if (onAir(d) !== was) swapped(s, api);
  syncMix(s);
  // the drop didn't go into the song up next (its deck wasn't playing it yet): it waits again
  if (d.up) api.timer("req", api.now + DECK.reqWaitMs);
  else nextReq(s, api);
  refill(s, api);
  // a host's song still ending (the drop stayed on it): the DJ tries again in a moment
  if (d.ending) api.timer("end", api.now + 3000);
}

/**
 * The decks swapped (a drop, or the fader across the middle): the picks start over; a song asked
 * for, up next, is on the air now (its remix plays; the screens name it for a while), and one that
 * was playing went off the air.
 */
function swapped(s: RoomState, api: Api) {
  const d = s.deck;
  d.votes = {};
  d.ending = null;
  api.clear("end");
  if (d.up) {
    d.now = d.up;
    // its player's next song waits behind the others' for a while; the recap keeps it
    d.reqOn[d.up.by] = api.now;
    d.heard = keep([...d.heard, d.up], DECK.heardMax);
    d.up = null;
    api.clear("req");
    api.timer("now", api.now + DECK.reqPlayMs);
  } else if (d.now) {
    d.now = null;
    api.clear("now");
  }
  air(s, api);
}

/** The recap's record (今晚回顾): what's on the air, kept each time it changes. */
function air(s: RoomState, api: Api) {
  if (!playing(s.phase)) return;
  const d = s.deck;
  const style = d.local ? "mine" : (styleOn(d, onAir(d)) ?? d.a);
  if (d.aired.at(-1)?.style === style) return;
  d.aired = keep([...d.aired, { at: api.now, style }], DECK.airedMax);
}

/** How often the room reads the floor again while it reacts (on a fixed grid: presses in between
 *  don't move the timer). */
const READ_MS = 15_000;

/**
 * 读场 (the plan's reading of the room): the last minute's 🔥 and ❄️ lean the stretch's energy,
 * the density and brightness Lyria plays (`heatLean`); read again every 15 s while the floor
 * reacts, back to the stretch's own a minute after it stops.
 */
function readRoom(s: RoomState, api: Api) {
  if (!playing(s.phase)) return;
  const lean = heatLean(s.fires, s.colds, api.now);
  const m = mixFor(s.phase, s.mix, lean);
  if (m.density !== s.mix.density || m.brightness !== s.mix.brightness) s.mix = { ...s.mix, density: m.density, brightness: m.brightness };
  const last = Math.max(s.fires.at(-1)?.at ?? 0, s.colds.at(-1)?.at ?? 0);
  if (api.now - last < LEAN_MS || lean !== 0) api.timer("heat", Math.ceil((api.now + 1) / READ_MS) * READ_MS);
  else api.clear("heat");
}

/**
 * The next song asked for goes on the deck off the air (its style there; the picks wait for it),
 * once the music plays and no drop is on its way; if the table hasn't dropped into it in
 * DECK.reqWaitMs, the DJ does (timer "req").
 */
function nextReq(s: RoomState, api: Api) {
  const d = s.deck;
  if (d.up || d.drop || !playing(s.phase) || !d.reqs.length) return;
  // a night of the host's songs plays the ones asked for from them (the others wait for the stand-in)
  const ok = (r: SongReq) => !d.local || (!!r.local && s.crate.some((x) => x.id === r.local));
  // first come, first played, but one player's two songs 10 minutes apart: the others' go first
  // (alone, it plays: nobody's turn is taken)
  const first = reqOrder(d.reqs, d.reqOn, api.now).find(ok);
  if (!first) return;
  const i = d.reqs.indexOf(first);
  const r = d.reqs.splice(i, 1)[0];
  d.up = r;
  if (d.local) d.songs[offAir(d)] = r.local!;
  else if (offAir(d) === "b") d.b = r.style;
  else d.a = r.style;
  d.votes = {};
  syncMix(s);
  api.timer("req", api.now + DECK.reqWaitMs);
}

/**
 * The DJ starts the countdown itself (an `auto` drop: anyone can still press for a grade) into the
 * deck off the air, once that deck really plays what it should; else it tries again in a moment.
 */
function autoDrop(s: RoomState, api: Api, key: "req" | "end") {
  const d = s.deck;
  if (d.drop) return;
  const side = cued(d, s.source === "lyria");
  if (!side) {
    api.timer(key, api.now + (key === "end" ? 3000 : 5000));
    return;
  }
  const t = aim(d.grid, api.now);
  d.drop = { ...t, misses: 0, auto: true, hits: [], to: side };
  d.charge = 1;
  d.chargeAt = api.now;
  api.timer("drop", t.at);
}

/* ------------------------------------------------------------------ a night of the host's songs */

/**
 * The next of the host's songs: one not played tonight, other than `not` (the one on the other deck);
 * all played, they start over (so two songs take turns; one alone has nothing to follow it).
 */
function pickSong(s: RoomState, api: Api, not: string | null): string | null {
  const d = s.deck;
  let pool = s.crate.filter((x) => x.id !== not && !d.played.includes(x.id));
  if (!pool.length) {
    d.played = not ? [not] : [];
    pool = s.crate.filter((x) => x.id !== not);
  }
  return pool.length ? pool[api.int(pool.length)].id : null;
}

/**
 * On a night of the host's songs every deck has one: the deck on the air keeps its own (counted as
 * played), and the deck off the air the next (the one asked for, when one is up next; a fresh pick
 * when it still holds the one that just went off the air).
 */
function refill(s: RoomState, api: Api) {
  const d = s.deck;
  if (!d.local) return;
  const has = (id: string | null): id is string => !!id && s.crate.some((x) => x.id === id);
  const on = onAir(d);
  const off = offAir(d);
  if (!has(d.songs[on])) d.songs[on] = pickSong(s, api, d.songs[off]);
  const playingNow = d.songs[on];
  if (playingNow && !d.played.includes(playingNow)) d.played = [...d.played, playingNow].slice(-CRATE_MAX);
  if (d.up?.local) return;
  const next = d.songs[off];
  if (!has(next) || d.played.includes(next)) d.songs[off] = pickSong(s, api, d.songs[on]);
}

/** The music now comes from the host's songs, or no longer does. */
function setLocal(s: RoomState, on: boolean, api: Api) {
  const d = s.deck;
  if (d.local === on) return;
  d.local = on;
  d.ending = null;
  api.clear("end");
  // what's up next was for the other kind of night: back to the front of the line
  if (d.up && !!d.up.local !== on && on) {
    d.reqs.unshift(d.up);
    d.up = null;
    api.clear("req");
  }
  d.votes = {};
  refill(s, api);
  nextReq(s, api);
  air(s, api);
}

/** The host's songs a view shows: the two on the decks, by name. */
const crateSong = (s: RoomState, id: string | null): CrateSong | null => (id ? (s.crate.find((x) => x.id === id) ?? null) : null);

/** The song list by id (made the first time a song is asked for from it). */
let LIBRARY: Map<number, (typeof SONG_ROWS)[number]> | null = null;
function listed(id: unknown): Song | null {
  if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
  LIBRARY ??= new Map(SONG_ROWS.map((r) => [r[0], r]));
  const r = LIBRARY.get(id);
  return r ? fromRow(r) : null;
}

/**
 * A song a phone found on Apple: [track id, title, artist, preview, storefront], every field
 * checked (the preview can only be on Apple's preview server), else null.
 */
function fromApple(v: unknown): { id: number; t: string; a: string; p: string; st: string } | null {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [id, t, a, p, st] = v as unknown[];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || !previewOk(p)) return null;
  const title = cleanAsk(t, REQ_CHARS.max);
  if (!title) return null;
  return { id, t: title, a: cleanAsk(a, 40), p, st: typeof st === "string" && /^[a-z]{2}$/.test(st) ? st : "us" };
}

/**
 * A song asked for, as `pid` sees it: a name the player typed, or found on Apple, shows only to
 * them and the host (its clip still plays for everyone).
 */
function reqFor(r: SongReq, pid: string, host: boolean): ReqView {
  if (r.song !== undefined || r.local !== undefined || r.by === pid || host) return r;
  const { artist: _artist, ...rest } = r;
  return { ...rest, text: null };
}

/** No music: nothing building, nothing on its way (a song up next waits, first in line). */
function calm(s: RoomState, api: Api) {
  const d = s.deck;
  d.drop = null;
  d.charge = 0;
  d.pending = 0;
  if (d.up) d.reqs.unshift(d.up);
  d.up = null;
  d.now = null;
  d.ending = null;
  // and the mixer as the music plays; the recap notes the music stopped
  d.mixer = freshMixer();
  if (d.aired.length && d.aired.at(-1)!.style !== "off") d.aired = keep([...d.aired, { at: api.now, style: "off" }], DECK.airedMax);
  api.clear("drop");
  api.clear("req");
  api.clear("now");
  api.clear("end");
  api.clear("mix");
  api.clear("heat");
}

/** The mixer's effects go off by themselves MIXER.fxMs after they went on: the first of them due. */
function mixTimer(s: RoomState, api: Api) {
  const ats = Object.values(s.deck.mixer.fx).map((x) => x!.at + MIXER.fxMs);
  if (ats.length) api.timer("mix", Math.min(...ats));
  else api.clear("mix");
}

/** Move the night to `phase` now, and set when it moves on by itself. */
function goTo(s: RoomState, phase: DjPhase, api: Api) {
  const now = api.now;
  s.phase = phase;
  s.phaseAt = now;
  s.mix = mixFor(phase, s.mix, heatLean(s.fires, s.colds, now));
  let next = 0;
  if (phase === "warm") next = now + DJ_TIMES.warm;
  else if (phase === "build") next = now + DJ_TIMES.build;
  else if (phase === "cool") next = now + DJ_TIMES.cool;
  // nothing runs past the cap
  if (next && s.capAt) next = Math.min(next, s.capAt);
  s.nextAt = next;
  if (next) api.timer("next", next);
  else api.clear("next");
  if (phase === "end") {
    api.clear("wind");
    api.clear("cap");
  }
  if (!playing(phase)) calm(s, api);
}

/** The music started on the speaker: the set begins, with its cap. */
function begin(s: RoomState, api: Api) {
  s.liveAt = api.now;
  s.capAt = api.now + DJ_TIMES.cap;
  api.timer("wind", s.capAt - DJ_TIMES.cool);
  api.timer("cap", s.capAt);
  goTo(s, "warm", api);
  // a night of the host's songs: the decks take them
  setLocal(s, s.source === "local", api);
  // a song asked for before the music started goes on first
  nextReq(s, api);
  air(s, api);
}

/** When `pid` last pressed in `list` (-Infinity: never). */
function lastAt(list: { pid: string; at: number }[], pid: string) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].pid === pid) return list[i].at;
  return -Infinity;
}

const keep = <X>(list: X[], n: number) => (list.length > n ? list.slice(-n) : list);

/**
 * The screen that is the speaker: the one giving the bars (any screen until one has, or once it has
 * said nothing at all for DECK.speakerQuietMs: it says the bars every 10 s while it plays). Another
 * screen with the table's code can't speak for it. Whatever the speaker says, taken or not, shows
 * it's still there (kept in memory only: nothing to store for it).
 */
function fromSpeaker(s: RoomState, sid: string, api: Api) {
  const d = s.deck;
  if (d.gridFrom === sid) d.speakerAt = api.now;
  return !d.gridFrom || d.gridFrom === sid || api.now - d.speakerAt >= DECK.speakerQuietMs;
}

/** A number inside the range, or null (outside it is nonsense, not something to clamp). */
function within(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

/** What a player wrote, cleaned: one line, no invisible characters, `max` characters at most. */
function cleanAsk(text: unknown, max: number = ASK_CHARS.max) {
  const raw = typeof text === "string" ? text.replace(/[\r\n\t]+/g, " ") : "";
  const line = clean(raw, max * 4).replace(/[​-‏‪-‮⁠-⁩﻿]/g, "");
  return Array.from(line).slice(0, max).join("").trim();
}

function trackId(s: RoomState, api: Api) {
  for (;;) {
    const id = `t${api.now.toString(36)}${api.int(36 ** 4).toString(36)}`;
    const d = s.deck;
    if (!s.queue.some((t) => t.id === id) && !d.reqs.some((r) => r.id === id) && d.up?.id !== id && d.now?.id !== id) return id;
  }
}

/** Keep the waiting songs and the one playing, and the latest KEEP_DONE of the rest. */
function trimDone(queue: Track[]): Track[] {
  const done = queue.filter((t) => !WAITING.includes(t.status) && t.status !== "playing");
  if (done.length <= KEEP_DONE) return queue;
  const old = new Set(done.slice(0, done.length - KEEP_DONE).map((t) => t.id));
  return queue.filter((t) => !old.has(t.id));
}

export const dj: GameDef<RoomState> = {
  id: "dj",
  min: 1,
  auto: true,

  init() {
    return fresh(1);
  },

  act(s, pid, g, api) {
    norm(s);
    const host = api.isHost(pid);
    switch (g.x) {
      case "fire":
      case "cold": {
        // a tap many times a minute: sent at once, saved with the next save
        api.light();
        // one 🔥 or ❄️ per FIRE_TAKE_MS a phone: a held thumb can't flood the room
        const since = api.now - FIRE_TAKE_MS;
        if (lastAt(s.fires, pid) > since || lastAt(s.colds, pid) > since) return api.quiet();
        if (g.x === "fire") {
          s.fires = keep([...s.fires, { pid, at: api.now }], KEEP_REACTS);
          s.total[pid] = (s.total[pid] ?? 0) + 1;
          api.fx("fire", pid);
        } else {
          s.colds = keep([...s.colds, { pid, at: api.now }], KEEP_REACTS);
          api.fx("cold", pid);
        }
        readRoom(s, api);
        return;
      }
      case "knob": {
        // a knob can be turned a lot: light, like 🔥
        api.light();
        const style = g.style as StyleId;
        if (!STYLE_IDS.includes(style)) return api.quiet();
        const v = num(g.value, -1, 1);
        if (v === null) return api.quiet();
        // on the grid; `|| 0` keeps -0 out
        const value = Math.round(v / KNOB_STEP) * KNOB_STEP || 0;
        const mine = { ...s.knobs[pid] };
        if ((mine[style] ?? 0) === value) return api.quiet();
        if (value) mine[style] = value;
        else delete mine[style];
        if (Object.keys(mine).length) s.knobs[pid] = mine;
        else delete s.knobs[pid];
        return;
      }
      case "ask": {
        // (turned away: nothing to send or store)
        const text = cleanAsk(g.text);
        if (Array.from(text).length < ASK_CHARS.min) return api.quiet();
        const waiting = s.queue.filter((t) => WAITING.includes(t.status));
        if (waiting.length >= QUEUE_MAX) return api.quiet();
        if (waiting.filter((t) => t.by === pid).length >= ASKS_EACH) return api.quiet();
        const style = STYLE_IDS.includes(g.style as StyleId) ? (g.style as StyleId) : null;
        s.queue = trimDone([...s.queue, { id: trackId(s, api), by: pid, ask: text, style, status: "queued", at: api.now }]);
        api.fx("ask", pid);
        return;
      }
      case "unask": {
        const i = s.queue.findIndex((t) => t.id === g.id);
        if (i < 0) return api.quiet();
        const t = s.queue[i];
        if (t.by !== pid && !host) return api.quiet();
        // once it's being checked or made, it's the song pipeline's (A5)
        if (t.status !== "queued" && t.status !== "refused" && t.status !== "failed") return api.quiet();
        s.queue.splice(i, 1);
        return;
      }
      case "req": {
        // a song asked for by name: its remix goes on the deck off the air, in its style
        const d = s.deck;
        const now = api.now;
        if (s.phase === "end" || (d.reqAt[pid] ?? -Infinity) > now - DECK.reqGapMs) return api.quiet();
        if (d.reqs.length >= DECK.reqMax || d.up?.by === pid || d.reqs.some((r) => r.by === pid)) return api.quiet();
        let r: SongReq;
        if (d.local) {
          // a night of the host's songs: one of them (named for everyone: they're the host's)
          const c = typeof g.local === "string" ? s.crate.find((x) => x.id === g.local) : undefined;
          if (!c) return api.quiet();
          r = { id: trackId(s, api), by: pid, text: c.t, ...(c.a ? { artist: c.a } : {}), local: c.id, style: styleForRequest(`${c.t} ${c.a}`), track: trackFor(c.t), at: now };
        } else {
          // picked from the song list: its title and artist, the list's (the whole table reads
          // them), and its clip; one the phone found on Apple: Apple's name for it (only they and
          // the host read it) and its clip; or the name they typed (no clip: the remix alone)
          const song = listed(g.song);
          const found = song ? null : fromApple(g.apple);
          const text = song ? song.t : found ? found.t : cleanAsk(g.text, REQ_CHARS.max);
          if (Array.from(text).length < REQ_CHARS.min) return api.quiet();
          const style = song ? styleForRequest(`${song.t} ${song.a} ${song.ae}`, hintOf(song)) : styleForRequest(found ? `${found.t} ${found.a}` : text);
          const what = song ? { artist: song.a, song: song.id, p: song.p, st: song.s } : found ? { ...(found.a ? { artist: found.a } : {}), apple: found.id, p: found.p, st: found.st } : {};
          r = { id: trackId(s, api), by: pid, text, ...what, style, track: trackFor(text), at: now };
        }
        d.reqAt[pid] = now;
        d.reqs.push(r);
        api.fx("req", pid);
        nextReq(s, api);
        return;
      }
      case "unreq": {
        const d = s.deck;
        const i = d.reqs.findIndex((r) => r.id === g.id);
        if (i >= 0) {
          if (d.reqs[i].by !== pid && !host) return api.quiet();
          d.reqs.splice(i, 1);
          return;
        }
        // up next: its deck keeps the style, the picks are back (and the next one asked for comes up)
        if (!d.up || d.up.id !== g.id || (d.up.by !== pid && !host)) return api.quiet();
        d.up = null;
        api.clear("req");
        nextReq(s, api);
        return;
      }
      case "drop": {
        // DROP counts in the countdown only, once a phone
        const d = s.deck;
        if (!playing(s.phase) || !d.drop || d.drop.hits.some((h) => h.pid === pid)) return api.quiet();
        // when it was pressed, by the phone's clock (never later than now, nor much earlier)
        const c = typeof g.c === "number" && Number.isFinite(g.c) ? Math.min(api.now, Math.max(api.now - 1000, g.c)) : api.now;
        const gr = grade(d.drop, d.grid, c, api.now);
        if (!gr) return api.quiet();
        api.light();
        d.drop.hits.push({ pid, grade: gr });
        s.drops = keep([...s.drops, { pid, at: api.now }], KEEP_DROPS);
        api.fx("drop", pid, [gr === "perfect" ? 1 : 0]);
        return;
      }
      case "pad": {
        const d = s.deck;
        const pad = g.pad as PadId;
        if (!playing(s.phase) || !PAD_IDS.includes(pad)) return api.quiet();
        const now = api.now;
        // a phone's per padTakeMs, and the same pad once for the whole room per roomPadGapMs (two
        // people on the horn at the same moment is one horn): a table mashing can't pile them up
        if ((d.padAt[pid] ?? -Infinity) > now - DECK.padTakeMs) return api.quiet();
        if (d.pads.some((p) => p.pad === pad && p.at > now - DECK.roomPadGapMs)) return api.quiet();
        // a move (the brake, a scratch, a rewind) takes the music itself: one at a time for the
        // room, not while a drop is on its way, and not often
        if (MOVES.includes(pad) && (d.drop || d.brakeAt > now - DECK.brakeGapMs)) return api.quiet();
        api.light();
        d.padAt[pid] = now;
        if (MOVES.includes(pad)) d.brakeAt = now;
        d.pads = keep([...d.pads, { pid, pad, at: now }], DECK.keepPads);
        api.fx("pad", pid, [PAD_IDS.indexOf(pad)]);
        return;
      }
      case "charge": {
        const d = s.deck;
        const n = num(g.n, 0, DECK.maxTaps);
        if (!playing(s.phase) || d.drop || n === null) return api.quiet();
        d.pending += Math.round(n);
        // the taps are added a few times a second, and only then does the table hear about it (a
        // phone says 0 once its taps stop, so the last ones are never left waiting)
        if (!d.pending || api.now - d.chargeAt < DECK.foldMs) return api.quiet();
        fold(s, api);
        // full arms the drop and sets its timer: a real change; filling is light
        if (!d.drop) api.light();
        return;
      }
      case "vote": {
        const style = g.style as StyleId;
        const d = s.deck;
        // (while a drop is on its way the picks wait: it lands on the deck the floor had cued; and
        // while a song asked for is up next: the deck off the air is its)
        if (s.phase === "end" || d.drop || d.up || d.local || !STYLE_IDS.includes(style) || (d.voteAt[pid] ?? -Infinity) > api.now - DECK.voteGapMs) return api.quiet();
        d.voteAt[pid] = api.now;
        const mine = d.votes[pid];
        delete d.votes[pid];
        // the same one again takes it back; a new one counts as the latest
        if (mine !== style) d.votes[pid] = style;
        load(s);
        return;
      }
      case "fader": {
        const d = s.deck;
        const v = num(g.value, 0, 1);
        // nothing to blend into while deck B is empty
        if (!playing(s.phase) || v === null || !hasB(d)) return api.quiet();
        const now = api.now;
        // the fader is whoever's moving it: the others wait for them to let go
        if (d.faderBy && d.faderBy !== pid && now - d.faderAt < DECK.faderHoldMs) return api.quiet();
        const value = Math.round(v * 100) / 100;
        if (value === d.fader && d.faderBy === pid) {
          d.faderAt = now;
          return api.quiet();
        }
        const was = onAir(d);
        d.fader = value;
        d.faderBy = pid;
        d.faderAt = now;
        // the decks swapped: the picks were for the other one, they start over (and a song asked
        // for, up next, plays now: a real change, stored)
        if (onAir(d) !== was) {
          swapped(s, api);
          nextReq(s, api);
          refill(s, api);
        } else api.light();
        syncMix(s);
        return;
      }
      case "phase": {
        // (anything turned away costs nothing: Api.quiet)
        if (!host || s.phase === "wait" || s.phase === "end") return api.quiet();
        const to = g.phase as SetPhase | "end";
        if (to !== "end" && !SET_PHASES.includes(to as SetPhase)) return api.quiet();
        if (to === s.phase) return api.quiet();
        goTo(s, to, api);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return api.quiet();
        const next = fresh(s.set + 1);
        // the night's 🔥 count, everyone's knobs, the songs asked for and the speaker's record
        // carry on into the next set (❄️ and drops are about the moment)
        next.total = s.total;
        next.knobs = s.knobs;
        next.queue = s.queue;
        next.speaker = s.speaker;
        // the decks as the floor left them, and the night's perfect drops
        const k = s.deck;
        next.deck = { ...freshDeck(), a: k.a, b: k.b, fader: k.fader, votes: k.votes, grid: k.grid, perfects: k.perfects, sounding: k.sounding, gridFrom: k.gridFrom, gridSetAt: k.gridSetAt, speakerAt: k.speakerAt, reqs: k.reqs, songs: k.songs, played: k.played, reqOn: k.reqOn, aired: k.aired, heard: k.heard };
        // the host's songs stay on the speaker's computer: the next set can play them again
        next.crate = s.crate;
        next.crateV = s.crateV;
        next.mine = s.mine;
        next.voice = s.voice;
        // the night's dancing, like its 🔥
        next.dance = s.dance;
        Object.assign(s, next);
        syncMix(s);
        api.clear("next");
        api.clear("wind");
        api.clear("cap");
        api.clear("drop");
        api.clear("req");
        api.clear("now");
        api.clear("end");
        return;
      }
      case "mix": {
        // a mixer knob: anyone, while the music plays; whoever moved it holds it a moment (like
        // the crossfader). Light: a finger turning one sends it ten times a second
        const d = s.deck;
        const knob = MIX_KNOBS.includes(g.knob as MixKnob) ? (g.knob as MixKnob) : null;
        const v = typeof g.value === "number" && Number.isFinite(g.value) ? Math.max(-1, Math.min(1, g.value)) : null;
        if (!playing(s.phase) || !knob || v === null) return api.quiet();
        const m = d.mixer;
        const now = api.now;
        const by = m.knobBy[knob];
        if (by && by !== pid && now - (m.knobAt[knob] ?? 0) < MIXER.holdMs) return api.quiet();
        const value = Math.round(Math.round(v / MIXER.step) * MIXER.step * 100) / 100 || 0;
        m.knobBy[knob] = pid;
        m.knobAt[knob] = now;
        if (value === m.knobs[knob]) return api.quiet();
        m.knobs[knob] = value;
        api.light();
        return;
      }
      case "mixfx": {
        // a mixer effect on or off: anyone, while the music plays, a switch a phone per MIXER.fxGapMs
        const d = s.deck;
        const fx = MIX_FX.includes(g.fx as MixFx) ? (g.fx as MixFx) : null;
        const on = g.on === true;
        if (!playing(s.phase) || !fx || (d.mixAt[pid] ?? -Infinity) > api.now - MIXER.fxGapMs) return api.quiet();
        const m = d.mixer;
        if (!!m.fx[fx] === on) return api.quiet();
        d.mixAt[pid] = api.now;
        if (on) m.fx = { ...m.fx, [fx]: { at: api.now, by: pid } };
        else {
          const { [fx]: _gone, ...rest } = m.fx;
          m.fx = rest;
        }
        api.fx("mix", pid, [MIX_FX.indexOf(fx), on ? 1 : 0]);
        mixTimer(s, api);
        return;
      }
      case "mixoff": {
        // the whole mixer back to as the music plays
        const d = s.deck;
        const m = d.mixer;
        const busy = Object.values(m.knobs).some((v) => v !== 0) || Object.keys(m.fx).length > 0;
        if (!playing(s.phase) || !busy || (d.mixAt[pid] ?? -Infinity) > api.now - MIXER.fxGapMs) return api.quiet();
        d.mixAt[pid] = api.now;
        d.mixer = freshMixer();
        api.fx("mix", pid, [-1, 0]);
        mixTimer(s, api);
        return;
      }
      case "mine": {
        // the host, from their phone: the night on their songs (the speaker switches once it has
        // some and the song on the air is ready), or back to the stand-in
        const on = g.on === true;
        if (!host || s.mine === on) return api.quiet();
        s.mine = on;
        return;
      }
      case "dance": {
        // 跟着跳: a phone's count of the beats its player danced in one bar (shared/dj/dance.ts).
        // Light: every dancer sends one a bar
        const d = s.deck;
        const grid = d.grid;
        const bar = typeof g.bar === "number" && Number.isSafeInteger(g.bar) ? g.bar : null;
        const of = typeof g.of === "number" && Number.isInteger(g.of) && g.of >= 1 && g.of <= 4 ? g.of : null;
        const n = typeof g.n === "number" && Number.isInteger(g.n) && of !== null && g.n >= 0 && g.n <= of ? g.n : null;
        if (!playing(s.phase) || !grid || bar === null || of === null || n === null) return api.quiet();
        // a bar that's over (as the room counts the speaker's bars), not long ago, and not sent before
        const now = grid.bar + Math.floor((api.now - grid.at) / (240_000 / grid.bpm));
        const me = s.dance[pid];
        if (bar > now || bar < now - DANCE.lateBars || (me && bar <= me.bar)) return api.quiet();
        const good = n / of >= 0.75;
        s.dance[pid] = { hits: (me?.hits ?? 0) + n, of: (me?.of ?? 0) + of, bars: (me?.bars ?? 0) + 1, bar, streak: good ? (me?.streak ?? 0) + 1 : 0 };
        // the floor's combo: a bar settles when the first count for a later one arrives
        const f = s.danceBar;
        if (bar > f.bar) {
          if (f.bar >= 0 && f.n > 0) {
            s.combo = f.good / f.n >= DANCE.goodShare ? Math.min(1, s.combo + DANCE.comboUp) : Math.max(0, s.combo - DANCE.comboDown);
            if (s.combo >= 1) {
              // the whole floor danced it: fireworks on the big screen, and the combo starts again
              api.fx("dance", pid, [f.bar]);
              s.combo = 0;
            }
          }
          s.danceBar = { bar, n: 0, good: 0 };
        }
        if (bar === s.danceBar.bar) s.danceBar = { bar, n: s.danceBar.n + 1, good: s.danceBar.good + (good ? 1 : 0) };
        api.light();
        return;
      }
      case "voice": {
        // the host, from their phone: 报幕 on the big screen, on or off
        const on = g.on === true;
        if (!host || s.voice === on) return api.quiet();
        s.voice = on;
        return;
      }
      default:
        // a command the booth doesn't know: nothing to send or store
        return api.quiet();
    }
  },

  screen(s, sid, g, api) {
    norm(s);
    switch (g.x) {
      case "live": {
        if (s.phase !== "wait") return false;
        // (a night of the host's songs needs some)
        s.source = g.source === "lyria" ? "lyria" : g.source === "local" && s.crate.length ? "local" : "fake";
        begin(s, api);
        return true;
      }
      case "src": {
        // the speaker switched where its music comes from mid-set (Lyria came in, or fell back to
        // the stand-in): only while music plays, only a real change, only from the speaker, at most
        // once a second (it says it again until the room has it)
        if (!fromSpeaker(s, sid, api) || s.phase === "wait" || s.phase === "end") return false;
        const source = g.source === "lyria" ? "lyria" : g.source === "fake" ? "fake" : g.source === "local" && s.crate.length ? "local" : null;
        if (!source || source === s.source || api.now - s.deck.srcAt < DECK.gridGapMs) return false;
        s.source = source;
        s.deck.srcAt = api.now;
        setLocal(s, source === "local", api);
        return true;
      }
      case "stats": {
        if (!fromSpeaker(s, sid, api) || (s.speaker.at && api.now - s.speaker.at < STATS_GAP_MS)) return false;
        // a minute's worth at most (a report covers the minute since the last one)
        const stalls = num(g.stalls, 0, 600);
        const resets = num(g.resets, 0, 60);
        const seconds = num(g.seconds, 0, 120);
        if (stalls === null || resets === null || seconds === null) return false;
        s.speaker = {
          at: api.now,
          stalls: s.speaker.stalls + Math.round(stalls),
          resets: s.speaker.resets + Math.round(resets),
          seconds: s.speaker.seconds + Math.round(seconds),
        };
        return true;
      }
      case "grid": {
        // where the speaker's bars fall (a new stream, Lyria came in, or its clock drifted)
        const at = within(g.at, api.now - 60_000, api.now + 60_000);
        const bar = within(g.bar, 0, 1e7);
        const bpm = within(g.bpm, 60, 200);
        if (at === null || bar === null || bpm === null) return false;
        const d = s.deck;
        // one screen gives the bars (another can take over once it's gone quiet), not too often
        if (!fromSpeaker(s, sid, api)) return false;
        if (d.gridFrom === sid && api.now - d.gridSetAt < DECK.gridGapMs) return false;
        const next = { at: Math.round(at), bar: Math.round(bar), bpm: Math.round(bpm * 100) / 100 };
        const was = d.grid;
        // the same bars, near enough (a twentieth of a beat): nothing to tell (the speaker saying
        // so every 10 s just shows it's still there)
        if (was && was.bpm === next.bpm && Math.abs(beatAt(was, next.at) - next.bar * 4) < 0.05) return false;
        d.grid = next;
        d.gridFrom = sid;
        d.gridSetAt = api.now;
        d.speakerAt = api.now;
        const dr = d.drop;
        if (dr) {
          // the same stream a little off (a drift, a stall): the same bar at its corrected time,
          // every press kept; moments before it lands, it stays where it is (the speaker lands it
          // on its own bar anyway)
          const drift = was && was.bpm === next.bpm && Math.abs(beatAt(was, next.at) - next.bar * 4) < 1;
          const atNow = dr.bar >= 0 ? next.at + (dr.bar - next.bar) * 4 * beatMsOf(next) : dr.at;
          if (drift && dr.bar >= 0) {
            if (atNow - api.now >= DECK.leadMs && dr.at - api.now >= DECK.leadMs) {
              d.drop = { ...dr, at: atNow, cue: atNow - beatMsOf(next) };
              api.timer("drop", atNow);
            }
          } else {
            // new bars (a new stream): the countdown starts over on them
            const t = aim(d.grid, api.now);
            d.drop = { ...dr, ...t, hits: [] };
            api.timer("drop", t.at);
          }
        }
        return true;
      }
      case "decks": {
        // the styles the speaker's two decks really sound now (at most once a second: it says it
        // again until the room has it)
        if (!fromSpeaker(s, sid, api)) return false;
        const a = g.a as StyleId;
        const b = g.b === null ? null : (g.b as StyleId);
        if (!STYLE_IDS.includes(a) || (b !== null && !STYLE_IDS.includes(b))) return false;
        const d = s.deck;
        // (on a night of the host's songs: which of them each deck really has)
        const song = (v: unknown) => (typeof v === "string" && SONG_ID.test(v) ? v : null);
        const next = g.sa !== undefined || g.sb !== undefined ? { a, b, sa: song(g.sa), sb: song(g.sb) } : { a, b };
        if (JSON.stringify(d.sounding) === JSON.stringify(next) || api.now - d.decksAt < DECK.gridGapMs) return false;
        d.sounding = next;
        d.decksAt = api.now;
        return true;
      }
      case "crate": {
        // the host's songs on the speaker's computer (their names; the files stay there), at most
        // once a second from the speaker
        const d = s.deck;
        if (!fromSpeaker(s, sid, api) || api.now - d.crateAt < DECK.gridGapMs || !Array.isArray(g.songs)) return false;
        const seen = new Set<string>();
        const crate: CrateSong[] = [];
        for (const row of (g.songs as unknown[]).slice(0, CRATE_MAX)) {
          if (!Array.isArray(row)) continue;
          const [id, t, a, bpm, sec] = row as unknown[];
          if (typeof id !== "string" || !SONG_ID.test(id) || seen.has(id)) continue;
          const title = cleanAsk(t, 40);
          const b = within(bpm, 40, 250);
          const len = within(sec, 20, 1800);
          if (!title || b === null || len === null) continue;
          seen.add(id);
          crate.push({ id, t: title, a: cleanAsk(a, 30), bpm: Math.round(b * 10) / 10, s: Math.round(len) });
        }
        if (JSON.stringify(crate) === JSON.stringify(s.crate)) return false;
        s.crate = crate;
        s.crateV += 1;
        d.crateAt = api.now;
        // songs no longer there leave the line and the decks
        const has = new Set(crate.map((x) => x.id));
        d.reqs = d.reqs.filter((r) => !r.local || has.has(r.local));
        if (d.up?.local && !has.has(d.up.local)) {
          d.up = null;
          api.clear("req");
        }
        for (const side of ["a", "b"] as const) if (d.songs[side] && !has.has(d.songs[side]!)) d.songs[side] = null;
        d.played = d.played.filter((id) => has.has(id));
        refill(s, api);
        nextReq(s, api);
        return true;
      }
      case "mine": {
        // the big screen's own 我的歌 switch (the host at the speaker)
        const on = g.on === true;
        if (!fromSpeaker(s, sid, api) || s.mine === on) return false;
        s.mine = on;
        return true;
      }
      case "song": {
        // how a song file sent from the host's phone went: told to that phone
        const code = typeof g.code === "number" && Number.isInteger(g.code) && g.code >= 0 && g.code < SONG_SENT.length ? g.code : -1;
        const id = typeof g.id === "number" && Number.isSafeInteger(g.id) && g.id >= 0 ? g.id : -1;
        if (!fromSpeaker(s, sid, api) || typeof g.by !== "string" || !api.has(g.by) || code < 0 || id < 0) return false;
        api.fx("song", g.by, [code, id]);
        return true;
      }
      case "ending": {
        // the host's song on the air is nearly over: the DJ drops into the next
        const d = s.deck;
        if (!fromSpeaker(s, sid, api) || !d.local || !playing(s.phase)) return false;
        const id = typeof g.id === "string" ? g.id : "";
        if (!id || id !== d.songs[onAir(d)] || d.ending === id) return false;
        d.ending = id;
        autoDrop(s, api, "end");
        return true;
      }
    }
    return false;
  },

  timer(s, key, _data, api) {
    norm(s);
    if (s.phase === "wait" || s.phase === "end") return;
    if (key === "drop") {
      const d = s.deck;
      if (!d.drop) return;
      if (d.drop.hits.length || d.drop.auto) land(s, api);
      else {
        // nobody pressed: another whole countdown, and after DECK.maxMisses the DJ drops it
        const misses = d.drop.misses + 1;
        const t = reaim(d.drop, d.grid);
        d.drop = { ...d.drop, ...t, misses, auto: misses >= DECK.maxMisses, hits: [] };
        api.timer("drop", t.at);
      }
      return;
    }
    if (key === "req") {
      // the song up next has waited: the DJ starts the countdown into it (anyone can still press
      // DROP for a grade; nobody pressing, it drops anyway), once its deck really plays it
      const d = s.deck;
      if (!d.up || d.drop) return;
      autoDrop(s, api, "req");
      return;
    }
    if (key === "end") {
      const d = s.deck;
      if (!d.ending || d.ending !== d.songs[onAir(d)] || d.drop) return;
      autoDrop(s, api, "end");
      return;
    }
    if (key === "now") {
      s.deck.now = null;
      return;
    }
    if (key === "heat") {
      readRoom(s, api);
      return;
    }
    if (key === "mix") {
      // effects whose time is up go off
      const m = s.deck.mixer;
      const due = (Object.keys(m.fx) as MixFx[]).filter((f) => m.fx[f]!.at + MIXER.fxMs <= api.now);
      if (!due.length) return mixTimer(s, api);
      const fx = { ...m.fx };
      for (const f of due) delete fx[f];
      m.fx = fx;
      mixTimer(s, api);
      return;
    }
    if (key === "next") {
      if (s.phase === "warm") goTo(s, "build", api);
      else if (s.phase === "build") goTo(s, "peak", api);
      else if (s.phase === "cool") goTo(s, "end", api);
      return;
    }
    if (key === "wind") {
      if (s.phase !== "cool") goTo(s, "cool", api);
      return;
    }
    if (key === "cap") goTo(s, "end", api);
  },

  view(s, pid, api): DjView {
    norm(s);
    // nothing a player types reaches anyone else unchecked: before the text check only they and
    // the host read it (a big screen is nobody: it sees what the table sees)
    const host = api.isHost(pid);
    const queue: DjTrack[] = [];
    for (const t of s.queue) {
      const theirs = t.by === pid || host;
      if (theirs || CHECKED.includes(t.status)) queue.push(t);
      else if (t.status !== "refused") queue.push({ ...t, ask: null });
    }
    return {
      id: "dj",
      phase: s.phase,
      liveAt: s.liveAt,
      phaseAt: s.phaseAt,
      nextAt: s.nextAt,
      capAt: s.capAt,
      mix: s.mix,
      energy: ENERGY[s.phase].density,
      source: s.source,
      fires: s.fires,
      total: s.total,
      colds: s.colds,
      knobs: s.knobs,
      drops: s.drops,
      queue,
      // the private Lyria test: one of the site owner's accounts has a seat at the table (a phone
      // that locks keeps its seat, and the music)
      lab: api.ids().some((p) => api.isOwner(p)),
      set: s.set,
      deck: deckView(s, pid, host),
      crateN: s.crate.length,
      crateV: s.crateV,
      mine: s.mine,
      voice: s.voice,
      dance: s.dance,
      combo: s.combo,
      onDecks: { a: crateSong(s, s.deck.songs.a), b: crateSong(s, s.deck.songs.b) },
      speaker: { stalls: s.speaker.stalls, resets: s.speaker.resets, seconds: s.speaker.seconds },
    };
  },

  // the host's song list is big and rarely changes: phones fetch it (GET /room/CODE/data) when they
  // need it, instead of it coming with every view
  data(s) {
    norm(s);
    return { v: s.crateV, crate: s.crate };
  },
};

/** A host's song's id, as the speaker names it. */
const SONG_ID = /^[a-z0-9]{1,12}$/i;

/**
 * The deck as `pid` reads it: the taps the room is about to add stay in the room, and so does its
 * bookkeeping; a song's name a player typed shows only to them and the host.
 */
function deckView(s: RoomState, pid: string, host: boolean): DeckView {
  const { pending: _pending, padAt: _padAt, voteAt: _voteAt, reqAt: _reqAt, mixAt: _mixAt, gridFrom: _gridFrom, speakerAt: _speakerAt, decksAt: _decksAt, srcAt: _srcAt, crateAt: _crateAt, ...rest } = s.deck;
  const see = (r: SongReq | null) => (r ? reqFor(r, pid, host) : null);
  return { ...rest, reqs: rest.reqs.map((r) => reqFor(r, pid, host)), up: see(rest.up), now: see(rest.now), heard: rest.heard.map((r) => reqFor(r, pid, host)) };
}
