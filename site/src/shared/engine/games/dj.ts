/**
 * 打碟 · DJ Booth: the booth's rules on the rooms server. A big screen opened at changle.ca/dj
 * opens the booth by itself; the music starts when that screen (the speaker) says it is playing;
 * then the night runs warm-up → build → peak → wind-down → end, moving on by itself on a clock the
 * host can override, and every set ends 4 hours after its music started.
 *
 * The room also takes and keeps what the table asks of the DJ: 🔥 and ❄️, everyone's style knobs,
 * drop requests and described songs. Turning those into the music is the DJ's (A4, A5), not this.
 */
import { ENERGY, FAKE_MIX, mixFor, playing } from "../../dj/curve";
import { aim, beatAt, beatMsOf, chargeNow, cued, deckWeights, freshDeck, grade, leader, offAir, onAir, reaim, styleOn } from "../../dj/deck";
import {
  ASK_CHARS,
  ASKS_EACH,
  CHECKED,
  DECK,
  DJ_TIMES,
  FIRE_TAKE_MS,
  KEEP_DONE,
  KNOB_STEP,
  MOVES,
  PAD_IDS,
  QUEUE_MAX,
  SET_PHASES,
  STYLE_IDS,
  WAITING,
  type DjPhase,
  type PadId,
  type RoomState,
  type SetPhase,
  type StyleId,
  type Track,
} from "../../dj/types";
import type { DeckView, DjTrack, DjView } from "../../protocol";
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
  };
}

/** A booth saved before a field existed gets it empty (the state is stored whole). */
function norm(s: RoomState): RoomState {
  s.colds ??= [];
  s.knobs ??= {};
  s.drops ??= [];
  s.queue ??= [];
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
  if (next && styleOn(d, onAir(d)) !== next) {
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
  // the decks swapped: the picks were for this one, they start over
  if (onAir(d) !== was) d.votes = {};
  d.drop = null;
  d.charge = 0;
  d.chargeAt = api.now;
  d.pending = 0;
  syncMix(s);
}

/** No music: nothing building, nothing on its way. */
function calm(s: RoomState, api: Api) {
  const d = s.deck;
  d.drop = null;
  d.charge = 0;
  d.pending = 0;
  api.clear("drop");
}

/** Move the night to `phase` now, and set when it moves on by itself. */
function goTo(s: RoomState, phase: DjPhase, api: Api) {
  const now = api.now;
  s.phase = phase;
  s.phaseAt = now;
  s.mix = mixFor(phase, s.mix);
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

/** What a player wrote, cleaned: one line, no invisible characters, 120 characters at most. */
function cleanAsk(text: unknown) {
  const raw = typeof text === "string" ? text.replace(/[\r\n\t]+/g, " ") : "";
  const line = clean(raw, ASK_CHARS.max * 4).replace(/[​-‏‪-‮⁠-⁩﻿]/g, "");
  return Array.from(line).slice(0, ASK_CHARS.max).join("").trim();
}

function trackId(s: RoomState, api: Api) {
  for (;;) {
    const id = `t${api.now.toString(36)}${api.int(36 ** 4).toString(36)}`;
    if (!s.queue.some((t) => t.id === id)) return id;
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
        // (while a drop is on its way the picks wait: it lands on the deck the floor had cued)
        if (s.phase === "end" || d.drop || !STYLE_IDS.includes(style) || (d.voteAt[pid] ?? -Infinity) > api.now - DECK.voteGapMs) return api.quiet();
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
        if (!playing(s.phase) || v === null || !d.b) return api.quiet();
        const now = api.now;
        // the fader is whoever's moving it: the others wait for them to let go
        if (d.faderBy && d.faderBy !== pid && now - d.faderAt < DECK.faderHoldMs) return api.quiet();
        const value = Math.round(v * 100) / 100;
        if (value === d.fader && d.faderBy === pid) {
          d.faderAt = now;
          return api.quiet();
        }
        api.light();
        const was = onAir(d);
        d.fader = value;
        d.faderBy = pid;
        d.faderAt = now;
        // the decks swapped: the picks were for the other one, they start over
        if (onAir(d) !== was) d.votes = {};
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
        next.deck = { ...freshDeck(), a: k.a, b: k.b, fader: k.fader, votes: k.votes, grid: k.grid, perfects: k.perfects, sounding: k.sounding, gridFrom: k.gridFrom, gridSetAt: k.gridSetAt, speakerAt: k.speakerAt };
        Object.assign(s, next);
        syncMix(s);
        api.clear("next");
        api.clear("wind");
        api.clear("cap");
        api.clear("drop");
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
        s.source = g.source === "lyria" ? "lyria" : "fake";
        begin(s, api);
        return true;
      }
      case "src": {
        // the speaker switched where its music comes from mid-set (Lyria came in, or fell back to
        // the stand-in): only while music plays, only a real change, only from the speaker, at most
        // once a second (it says it again until the room has it)
        if (!fromSpeaker(s, sid, api) || s.phase === "wait" || s.phase === "end") return false;
        const source = g.source === "lyria" ? "lyria" : g.source === "fake" ? "fake" : null;
        if (!source || source === s.source || api.now - s.deck.srcAt < DECK.gridGapMs) return false;
        s.source = source;
        s.deck.srcAt = api.now;
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
        if ((d.sounding?.a === a && d.sounding?.b === b) || api.now - d.decksAt < DECK.gridGapMs) return false;
        d.sounding = { a, b };
        d.decksAt = api.now;
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
      deck: deckView(s),
    };
  },
};

/** The deck as the screens read it (the taps the room is about to add stay in the room). */
function deckView(s: RoomState): DeckView {
  const { pending: _pending, padAt: _padAt, voteAt: _voteAt, gridFrom: _gridFrom, speakerAt: _speakerAt, decksAt: _decksAt, srcAt: _srcAt, ...rest } = s.deck;
  return rest;
}
