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
import { DANMU, DANMU_READY, maskDanmu } from "../../dj/danmu";
import { aim, beatAt, beatMsOf, chargeNow, cued, deckWeights, freshDeck, grade, hasB, leader, offAir, onAir, reaim, reqOrder, rested, styleOn } from "../../dj/deck";
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
  OVER_SONG,
  PAD_IDS,
  QUEUE_MAX,
  REQ_CHARS,
  SET_PHASES,
  SHARED_BY,
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
import { YT_ID } from "../../dj/youtube";
import { fromRow, type Song } from "../../songs";
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
    shuffle: false,
    // (点歌模式 always since Nov 12: the phones have the player, not the deck)
    juke: true,
    rev: 2,
    full: false,
    dance: {},
    danceBar: { bar: -1, n: 0, good: 0 },
    combo: 0,
    danmu: [],
    danmuN: 0,
    danmuOn: true,
    danmuAt: {},
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
  s.shuffle ??= false;
  // a booth saved before Nov 12 goes over to 点歌模式 once (the phones' deck is gone: Steve, "不需要drop了")
  if ((s.rev ?? 0) < 2) {
    s.juke = true;
    s.rev = 2;
  }
  s.full ??= false;
  s.dance ??= {};
  s.danceBar ??= { bar: -1, n: 0, good: 0 };
  s.combo ??= 0;
  s.danmu ??= [];
  s.danmuN ??= 0;
  s.danmuOn ??= true;
  s.danmuAt ??= {};
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
  d.last = { at: dr.at, bar: dr.bar, hits: dr.hits, auto: dr.hits.length === 0, to: dr.to, style: styleOn(d, dr.to) ?? d.a, ...(dr.quiet ? { quiet: true } : {}) };
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
  if (d.up) api.timer("req", api.now + (s.juke ? DECK.jukeWaitMs : DECK.reqWaitMs));
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
    // 真歌时间: a song from YouTube plays whole on the big screen, from the drop's bar (the screen
    // had it ready while it was up next; the DJ lets go with the drop's boom); so does a song file a
    // phone sent it (Nov 13), unless the night plays the host's songs on the decks
    const whole = d.up.yt ? { yt: d.up.yt } : d.up.local && !d.local ? { local: d.up.local } : null;
    if (whole) {
      d.song = { id: d.up.id, ...whole, by: d.up.by, at: api.now };
      // (a switch that landed while the room was paused: its time starts with 播放)
      if (!d.paused) api.timer("song", d.song.at + DECK.songMaxMs);
    }
    d.up = null;
    api.clear("req");
    api.timer("now", api.now + DECK.reqPlayMs);
  } else if (d.now) {
    d.now = null;
    api.clear("now");
  }
  air(s, api);
}

/**
 * 真歌时间 is over (the big screen says the song ended, someone skipped it, or the time ran out): the
 * DJ comes back, and plays a while before it drops into the next song asked for by itself (songs and
 * the DJ take turns); the table can build up and drop into it sooner. 点歌模式: the next song in a
 * few seconds, the DJ just between them; `soon` (切歌): the switch into it starts now.
 */
function songOver(s: RoomState, api: Api, soon = false) {
  const d = s.deck;
  d.song = null;
  d.tap = false;
  api.clear("song");
  if (!d.up) nextReq(s, api);
  if (!d.up || d.drop) return;
  if (soon) autoDrop(s, api, "req", DECK.ctlBeats);
  else api.timer("req", api.now + (s.juke ? DECK.jukeGapMs : DECK.songGapMs));
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
  const r = takeNext(s, api);
  if (r) putUp(s, r, api);
}

/** The song asked for whose turn it is, taken off the 歌单 (null: none can play now). */
function takeNext(s: RoomState, api: Api): SongReq | null {
  const d = s.deck;
  // a night of the host's songs plays the ones asked for from them (the others wait for the stand-in)
  const ok = (r: SongReq) => !d.local || (!!r.local && s.crate.some((x) => x.id === r.local));
  // first come, first played, but one player's two songs 10 minutes apart: the others' go first
  // (alone, it plays: nobody's turn is taken); the host's 随机: any of the waiting ones (of the
  // rested players', while there are some)
  const line = reqOrder(d.reqs, d.reqOn, api.now).filter(ok);
  if (!line.length) return null;
  const fair = line.filter((r) => rested(d.reqOn, r.by, api.now));
  const from = fair.length ? fair : line;
  // (one 上一曲 put back comes first, 随机 or not)
  const first = line[0].back ? line[0] : s.shuffle ? from[api.int(from.length)] : line[0];
  return d.reqs.splice(d.reqs.indexOf(first), 1)[0];
}

/**
 * Another song goes in on the switch already on its way (点歌模式's quiet one: the speaker keeps its
 * bar), its style on that deck; none, the switch goes to the DJ.
 */
function retarget(s: RoomState, r: SongReq | null) {
  const d = s.deck;
  d.up = r;
  if (!r || !d.drop) return;
  if (d.local) d.songs[d.drop.to] = r.local!;
  else if (d.drop.to === "b") d.b = r.style;
  else d.a = r.style;
  syncMix(s);
}

/** `r` is up next: its style (or the host's song) on the deck off the air, the picks waiting for it. */
function putUp(s: RoomState, r: SongReq, api: Api) {
  const d = s.deck;
  d.up = r;
  if (d.local) d.songs[offAir(d)] = r.local!;
  else if (offAir(d) === "b") d.b = r.style;
  else d.a = r.style;
  d.votes = {};
  syncMix(s);
  api.timer("req", api.now + (s.juke ? DECK.jukeWaitMs : DECK.reqWaitMs));
}

/**
 * The DJ starts the countdown itself (an `auto` drop: anyone can still press for a grade) into the
 * deck off the air, once that deck really plays what it should; else it tries again in a moment.
 */
function autoDrop(s: RoomState, api: Api, key: "req" | "end", beats: number = DECK.jukeBeats) {
  const d = s.deck;
  if (d.drop) return;
  // a whole song plays: the DJ drops once it's over
  if (d.song) {
    api.timer(key, api.now + 5000);
    return;
  }
  // 点歌模式 doesn't wait for the DJ's deck to have a YouTube song's style: the song plays whole
  // (the DJ quiet under it), and that deck has its length to get there
  const juke = s.juke;
  const whole = !!d.up?.yt || (!!d.up?.local && !d.local);
  const side = juke && whole && key === "req" ? offAir(d) : cued(d, s.source === "lyria");
  if (!side) {
    api.timer(key, api.now + (key === "end" ? 3000 : 5000));
    return;
  }
  // (点歌模式: the switch, on a bar a few seconds on, no countdown and no boom)
  const t = juke ? aim(d.grid, api.now, beats, 1) : aim(d.grid, api.now);
  d.drop = { ...t, misses: 0, auto: true, hits: [], to: side, ...(juke ? { quiet: true } : {}) };
  d.charge = juke ? 0 : 1;
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
 * A song a phone found on YouTube (a link, or a search): [video id, its title, its channel], every
 * field checked, else null. It plays whole on the big screen, in YouTube's player.
 */
function fromYt(v: unknown): { id: string; t: string; a: string } | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [id, t, a] = v as unknown[];
  if (typeof id !== "string" || !YT_ID.test(id)) return null;
  const title = cleanAsk(t, REQ_CHARS.max);
  if (!title) return null;
  return { id, t: title, a: cleanAsk(a, 40) };
}

/**
 * A song asked for (`by`: a player, or the big screen's own 点歌, `SHARED_BY`): its remix goes on
 * the deck off the air, in its style; `each`, how many `by` can have in the 歌单 (the one up next
 * counted). False: not taken (too soon after their last, the list full, or nothing to play).
 * `gap`: one a second from a phone (a song file it sent, the moment the big screen has it: no).
 */
function ask(s: RoomState, by: string, g: { [k: string]: unknown }, api: Api, each: number, gap = true): boolean {
  const d = s.deck;
  const now = api.now;
  if (s.phase === "end" || (gap && (d.reqAt[by] ?? -Infinity) > now - DECK.reqGapMs)) return false;
  const theirs = d.reqs.filter((r) => r.by === by).length + (d.up?.by === by ? 1 : 0);
  if (d.reqs.length >= DECK.reqMax || theirs >= each) return false;
  let r: SongReq;
  const c = typeof g.local === "string" ? s.crate.find((x) => x.id === g.local) : undefined;
  if (d.local || c) {
    // a song file on the big screen's computer (named for everyone): on a night of the host's
    // songs the only kind, on the decks; else one a phone sent, played whole like a YouTube one
    if (!c) return false;
    r = { id: trackId(s, api), by, text: c.t, ...(c.a ? { artist: c.a } : {}), local: c.id, style: styleForRequest(`${c.t} ${c.a}`), track: trackFor(c.t), at: now };
  } else {
    // picked from the song list: its title and artist, the list's (the whole table reads them);
    // with the phone's YouTube find for it, or one found on YouTube by itself (a link, a search):
    // the whole song plays on the big screen, the DJ's remix in its style after; or the name they
    // typed (the remix alone)
    const song = listed(g.song);
    const yt = fromYt(g.yt);
    const text = song ? song.t : yt ? yt.t : cleanAsk(g.text, REQ_CHARS.max);
    if (Array.from(text).length < REQ_CHARS.min) return false;
    const style = song ? styleForRequest(`${song.t} ${song.a} ${song.ae}`, hintOf(song)) : styleForRequest(yt ? `${yt.t} ${yt.a}` : text);
    const tube = yt ? { yt: yt.id, ytT: yt.t } : {};
    const what = song ? { artist: song.a, song: song.id, ...tube } : yt ? { ...(yt.a ? { artist: yt.a } : {}), ...tube } : {};
    r = { id: trackId(s, api), by, text, ...what, style, track: trackFor(text), at: now };
  }
  d.reqAt[by] = now;
  d.reqs.push(r);
  api.fx("req", by);
  nextReq(s, api);
  return true;
}

/** A song taken back off the 歌单, or from up next: `by`'s own, or any by the host. */
function unask(s: RoomState, id: unknown, by: string, host: boolean, api: Api): boolean {
  const d = s.deck;
  const i = d.reqs.findIndex((r) => r.id === id);
  if (i >= 0) {
    if (d.reqs[i].by !== by && !host) return false;
    d.reqs.splice(i, 1);
    return true;
  }
  // up next: its deck keeps the style, the picks are back (and the next one asked for comes up)
  if (!d.up || d.up.id !== id || (d.up.by !== by && !host)) return false;
  d.up = null;
  api.clear("req");
  nextReq(s, api);
  return true;
}

/** 点歌模式 on or off (no build-up, no DROP, no picks: the songs asked for one after another). */
function setJuke(s: RoomState, on: boolean, api: Api): boolean {
  if (s.juke === on) return false;
  s.juke = on;
  const d = s.deck;
  if (on) {
    d.charge = 0;
    d.pending = 0;
    d.chargeAt = api.now;
    d.votes = {};
  }
  // a song up next waits as long as the deck it's in now says (a song playing: it waits for that)
  if (d.up && !d.drop) api.timer("req", api.now + (on ? DECK.jukeWaitMs : DECK.reqWaitMs));
  return true;
}

/* ------------------------------------------------------------------ the phones' player */

/**
 * The player on every phone (Steve on Nov 12: "手机上点完歌后可以直接在玩家手机上一键播放，切歌，暂停，
 * 上一曲"), anyone at the table's or the shared phone's: 暂停 holds the room's music, 播放 carries it
 * on, 切歌 plays the next song now, 上一曲 the one before again. False: nothing to do (no music yet,
 * nothing to skip to, a switch already on its way, or another phone's 切歌 a moment ago).
 */
function control(s: RoomState, what: unknown, api: Api): boolean {
  if (!playing(s.phase)) return false;
  const d = s.deck;
  if (what === "pause") return hold(s, api);
  if (what === "play") return carryOn(s, api);
  if (what !== "next" && what !== "prev") return false;
  // (a switch on its way with a countdown can't be taken back; a quiet one (点歌模式) takes
  // another song on its bar; and two phones pressing at once skip one song, not two)
  if ((d.drop && !d.drop.quiet) || api.now - d.ctlAt < DECK.ctlGapMs) return false;
  if (!(what === "next" ? skip(s, api) : stepBack(s, api))) return false;
  d.ctlAt = api.now;
  return true;
}

/** 暂停: the song's video stops where it is, the DJ goes quiet, and nothing comes up next. */
function hold(s: RoomState, api: Api): boolean {
  const d = s.deck;
  if (d.paused) return false;
  d.paused = api.now;
  api.clear("song");
  api.clear("req");
  return true;
}

/** 播放 after 暂停: the song carries on from where it stopped (else the DJ), and what's up next comes up again. */
function carryOn(s: RoomState, api: Api): boolean {
  const d = s.deck;
  if (!d.paused) return false;
  const held = api.now - d.paused;
  d.paused = 0;
  if (d.song) {
    d.song = { ...d.song, at: d.song.at + held };
    api.timer("song", d.song.at + DECK.songMaxMs);
  } else if (d.up && !d.drop) api.timer("req", api.now + (s.juke ? DECK.jukeGapMs : DECK.reqWaitMs));
  return true;
}

/**
 * 切歌: the song playing ends now, the next straight on (the DJ for a bar or so between); none
 * playing, the one up next now; on its way in already, that one's skipped too and the one after it
 * goes in on the same bar (none after it: the DJ plays on).
 */
function skip(s: RoomState, api: Api): boolean {
  const d = s.deck;
  if (d.drop) {
    if (!d.up) return false;
    d.paused = 0;
    retarget(s, takeNext(s, api));
    return true;
  }
  if (!d.song && !d.up) return false;
  d.paused = 0;
  if (d.song) songOver(s, api, true);
  else autoDrop(s, api, "req", DECK.ctlBeats);
  return true;
}

/**
 * 上一曲: the song before the one playing (none playing: the last one) plays again now. The one that
 * was playing and the one that was up next (or on its way in) go back on the 歌单, first in line, so
 * they come after it as they did; the night's list of songs played steps back with them (each is
 * on it once).
 */
function stepBack(s: RoomState, api: Api): boolean {
  const d = s.deck;
  const list = d.heard;
  const cur = d.song && list.at(-1)?.id === d.song.id ? list.at(-1)! : null;
  const i = list.length - (cur ? 2 : 1);
  const back = list[i];
  // (a night of the host's songs plays theirs alone, while they're on the speaker's computer)
  if (!back || (d.local && !(back.local && s.crate.some((x) => x.id === back.local)))) return false;
  d.paused = 0;
  d.heard = list.slice(0, i);
  if (d.up) d.reqs.unshift({ ...d.up, back: true });
  if (cur) d.reqs.unshift({ ...cur, id: trackId(s, api), back: true });
  const { back: _back, ...again } = back;
  // (a switch into the next one on its way already: it goes in on that bar instead)
  if (d.drop) {
    retarget(s, { ...again, id: trackId(s, api) });
    return true;
  }
  putUp(s, { ...again, id: trackId(s, api) }, api);
  if (d.song) songOver(s, api, true);
  else autoDrop(s, api, "req", DECK.ctlBeats);
  return true;
}

/**
 * A song asked for, as `pid` sees it: a name the player typed, or found on YouTube, shows only to
 * them and the host (a YouTube one still plays for everyone: its player shows what it is).
 */
function reqFor(r: SongReq, pid: string, host: boolean): ReqView {
  // (one picked on the big screen itself was typed on the screen everyone watches)
  if ((r.song !== undefined && !r.ytT) || r.local !== undefined || r.by === pid || r.by === SHARED_BY || host) return r;
  const { artist: _artist, ytT: _ytT, ...rest } = r;
  return { ...rest, text: r.song !== undefined ? r.text : null };
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
  // and the mixer as the music plays; the recap notes the music stopped; no whole song
  d.mixer = freshMixer();
  d.song = null;
  d.paused = 0;
  d.tap = false;
  api.clear("song");
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
        if (!ask(s, pid, g, api, DECK.reqEach)) return api.quiet();
        return;
      }
      case "unreq": {
        if (!unask(s, g.id, pid, host, api)) return api.quiet();
        return;
      }
      case "drop": {
        // DROP counts in the countdown only, once a phone
        const d = s.deck;
        if (!playing(s.phase) || !d.drop || d.drop.quiet || d.drop.hits.some((h) => h.pid === pid)) return api.quiet();
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
        // (over a whole song from YouTube: the pads that are a sound of their own)
        if (!playing(s.phase) || !PAD_IDS.includes(pad) || ((d.song || d.paused) && !OVER_SONG.includes(pad))) return api.quiet();
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
        // (while a whole song plays, the deck waits; 点歌模式 has no build-up)
        if (!playing(s.phase) || d.drop || d.song || s.juke || n === null) return api.quiet();
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
        if (s.phase === "end" || s.juke || d.drop || d.up || d.local || !STYLE_IDS.includes(style) || (d.voteAt[pid] ?? -Infinity) > api.now - DECK.voteGapMs) return api.quiet();
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
        if (!playing(s.phase) || v === null || !hasB(d) || d.song) return api.quiet();
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
        next.shuffle = s.shuffle;
        next.juke = s.juke;
        // the night's dancing, like its 🔥; 弹幕's switch and its count (a screen shows each line once)
        next.dance = s.dance;
        next.danmuOn = s.danmuOn;
        next.danmuN = s.danmuN;
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
      case "play":
      case "pause":
      case "next":
      case "prev":
      case "songskip": {
        // the player, anyone at the table (an older page's 切歌: songskip)
        if (!control(s, g.x === "songskip" ? "next" : g.x, api)) return api.quiet();
        return;
      }
      case "voice": {
        // the host, from their phone: 报幕 on the big screen, on or off
        const on = g.on === true;
        if (!host || s.voice === on) return api.quiet();
        s.voice = on;
        return;
      }
      case "shuffle": {
        // the host, from their phone: the 歌单 in a random order, or first come, first played
        const on = g.on === true;
        if (!host || s.shuffle === on) return api.quiet();
        s.shuffle = on;
        return;
      }
      case "full": {
        // anyone at the table: the song's video over the whole TV, or back in its corner
        const on = g.on === true;
        if (s.full === on) return api.quiet();
        s.full = on;
        return;
      }
      case "say": {
        // 弹幕 (Steve on Nov 13): a ready line (`p`) or one's own words (`t`, the worst masked), across
        // the big screen; one per DANMU.gapMs a phone, while the host has them on. Light: a party
        // sends lots (sent now, stored with the next save)
        if (!s.danmuOn || (s.danmuAt[pid] ?? -Infinity) > api.now - DANMU.gapMs) return api.quiet();
        const p = typeof g.p === "number" && Number.isInteger(g.p) && g.p >= 0 && g.p < DANMU_READY.length ? g.p : null;
        const t = p === null ? maskDanmu(cleanAsk(g.t, DANMU.chars)) : "";
        if (p === null && !t) return api.quiet();
        s.danmuAt[pid] = api.now;
        s.danmuN += 1;
        s.danmu = keep([...s.danmu, { n: s.danmuN, pid, at: api.now, ...(p !== null ? { p } : { t }) }], DANMU.keep);
        api.light();
        return;
      }
      case "danmu": {
        // the host, from their phone: 弹幕 on or off (off: the lines on their way go too)
        const on = g.on === true;
        if (!host || s.danmuOn === on) return api.quiet();
        s.danmuOn = on;
        if (!on) s.danmu = [];
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
        // (a quiet switch, 点歌模式's, keeps its moment: no countdown to start over, and bars that
        // kept moving, as a speaker's whose sound had stopped, put it off for good; the speaker
        // lands it on its own next bar)
        if (dr && !dr.quiet) {
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
          const [id, t, a, bpm, sec, from] = row as unknown[];
          if (typeof id !== "string" || !SONG_ID.test(id) || seen.has(id)) continue;
          // (a name from a file anyone at the table may have sent: the worst words starred, as in 弹幕)
          const title = maskDanmu(cleanAsk(t, 40));
          const b = within(bpm, 40, 250);
          const len = within(sec, 20, 1800);
          if (!title || b === null || len === null) continue;
          seen.add(id);
          // (sent from a phone: whose, while they're at the table)
          const by = typeof from === "string" && from && api.has(from) ? from : null;
          crate.push({ id, t: title, a: maskDanmu(cleanAsk(a, 30)), bpm: Math.round(b * 10) / 10, s: Math.round(len), ...(by ? { by } : {}) });
        }
        if (JSON.stringify(crate) === JSON.stringify(s.crate)) return false;
        const before = new Set(s.crate.map((x) => x.id));
        s.crate = crate;
        s.crateV += 1;
        d.crateAt = api.now;
        // a song file a phone sent (Steve on Nov 13: everyone's, not only the host's): on the 歌单
        // the moment the big screen has it, theirs, played whole when its turn comes
        for (const c of crate) if (c.by && !before.has(c.id)) ask(s, c.by, { local: c.id }, api, DECK.reqEach, false);
        // songs no longer there leave the line and the decks
        const has = new Set(crate.map((x) => x.id));
        d.reqs = d.reqs.filter((r) => !r.local || has.has(r.local));
        if (d.up?.local && !has.has(d.up.local)) {
          d.up = null;
          api.clear("req");
        }
        for (const side of ["a", "b"] as const) if (d.songs[side] && !has.has(d.songs[side]!)) d.songs[side] = null;
        d.played = d.played.filter((id) => has.has(id));
        // (one playing whole that's gone: the big screen can't play it, the next comes on)
        if (d.song?.local && !has.has(d.song.local)) songOver(s, api);
        refill(s, api);
        nextReq(s, api);
        return true;
      }
      // the big screen's own 点歌 (a shared phone everyone uses, its screen on the TV; Steve on
      // Nov 11): songs as the table's (SHARED_BY, the table's limit only), its own taken back, the
      // player (暂停, 播放, 切歌, 上一曲), 随机, the video over the whole TV. Only from the speaker
      // (another screen with the code can't)
      case "req":
        return fromSpeaker(s, sid, api) && ask(s, SHARED_BY, g, api, DECK.reqMax);
      case "unreq":
        return fromSpeaker(s, sid, api) && unask(s, g.id, SHARED_BY, false, api);
      case "play":
      case "pause":
      case "next":
      case "prev":
      case "songskip":
        return fromSpeaker(s, sid, api) && control(s, g.x === "songskip" ? "next" : g.x, api);
      case "tap": {
        // its YouTube player wants a tap on the video (an iPhone's, the night's first song): the phones say so
        const on = g.on === true;
        if (!fromSpeaker(s, sid, api) || s.deck.tap === on) return false;
        s.deck.tap = on;
        return true;
      }
      // (the build-up and DROP back on: no page asks for it now; the engine's tests do)
      case "juke":
        return fromSpeaker(s, sid, api) && setJuke(s, g.on === true, api);
      case "shuffle": {
        const on = g.on === true;
        if (!fromSpeaker(s, sid, api) || s.shuffle === on) return false;
        s.shuffle = on;
        return true;
      }
      case "full": {
        const on = g.on === true;
        if (!fromSpeaker(s, sid, api) || s.full === on) return false;
        s.full = on;
        return true;
      }
      case "mine": {
        // the big screen's own 我的歌 switch (the host at the speaker)
        const on = g.on === true;
        if (!fromSpeaker(s, sid, api) || s.mine === on) return false;
        s.mine = on;
        return true;
      }
      case "songdone": {
        // the whole song from YouTube ended on the big screen (or couldn't play): the DJ comes back
        if (!fromSpeaker(s, sid, api) || !s.deck.song || s.deck.song.id !== g.id) return false;
        songOver(s, api);
        return true;
      }
      case "nosong": {
        // the big screen, getting the song up next ready, heard from YouTube that its video won't
        // play here (removed, private, or not allowed outside YouTube): the video comes off it, so
        // its drop plays the DJ's remix alone, and its player's phone says why
        const d = s.deck;
        if (!fromSpeaker(s, sid, api) || !d.up || d.up.id !== g.id || !d.up.yt) return false;
        const { yt: _yt, ytT: _ytT, ...rest } = d.up;
        d.up = { ...rest, ytNo: true };
        return true;
      }
      case "song": {
        // how a song file sent from a player's phone went: told to that phone
        const code = typeof g.code === "number" && Number.isInteger(g.code) && g.code >= 0 && g.code < SONG_SENT.length ? g.code : -1;
        const id = typeof g.id === "number" && Number.isSafeInteger(g.id) && g.id >= 0 ? g.id : -1;
        // (to a phone still at the table, a host who just watches too)
        if (!fromSpeaker(s, sid, api) || typeof g.by !== "string" || !api.online(g.by) || code < 0 || id < 0) return false;
        api.fx("song", g.by, [code, id]);
        // the same song file as one the big screen has already (`local`): on the 歌单 as theirs too
        if (SONG_SENT[code] === "there" && typeof g.local === "string") ask(s, g.by, { local: g.local }, api, DECK.reqEach, false);
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
      // (暂停: nothing comes up until 播放)
      if (!d.up || d.drop || d.paused) return;
      autoDrop(s, api, "req");
      return;
    }
    if (key === "end") {
      const d = s.deck;
      if (!d.ending || d.ending !== d.songs[onAir(d)] || d.drop) return;
      autoDrop(s, api, "end");
      return;
    }
    if (key === "song") {
      songOver(s, api);
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
      shuffle: s.shuffle,
      juke: s.juke,
      full: s.full,
      dance: s.dance,
      combo: s.combo,
      onDecks: { a: crateSong(s, s.deck.songs.a), b: crateSong(s, s.deck.songs.b) },
      speaker: { stalls: s.speaker.stalls, resets: s.speaker.resets, seconds: s.speaker.seconds },
      // (the lines still flying: a screen opened later doesn't get the night's old ones)
      danmu: s.danmu.filter((l) => api.now - l.at < DANMU.freshMs),
      danmuOn: s.danmuOn,
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
  const { pending: _pending, padAt: _padAt, voteAt: _voteAt, reqAt: _reqAt, mixAt: _mixAt, gridFrom: _gridFrom, speakerAt: _speakerAt, decksAt: _decksAt, srcAt: _srcAt, crateAt: _crateAt, ctlAt: _ctlAt, ...rest } = s.deck;
  const see = (r: SongReq | null) => (r ? reqFor(r, pid, host) : null);
  return { ...rest, reqs: rest.reqs.map((r) => reqFor(r, pid, host)), up: see(rest.up), now: see(rest.now), heard: rest.heard.map((r) => reqFor(r, pid, host)) };
}
