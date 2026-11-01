/**
 * 打碟 · DJ Booth: the booth's rules on the rooms server. A big screen opened at changle.ca/dj
 * opens the booth by itself; the music starts when that screen (the speaker) says it is playing;
 * then the night runs warm-up → build → peak → wind-down → end, moving on by itself on a clock the
 * host can override, and every set ends 4 hours after its music started.
 *
 * The room also takes and keeps what the table asks of the DJ: 🔥 and ❄️, everyone's style knobs,
 * drop requests and described songs. Turning those into the music is the DJ's (A4, A5), not this.
 */
import { ENERGY, FAKE_MIX, mixFor } from "../../dj/curve";
import {
  ASK_CHARS,
  ASKS_EACH,
  CHECKED,
  DJ_TIMES,
  DROP_GAP_MS,
  FIRE_TAKE_MS,
  KEEP_DONE,
  KNOB_STEP,
  QUEUE_MAX,
  SET_PHASES,
  STYLE_IDS,
  WAITING,
  type DjPhase,
  type RoomState,
  type SetPhase,
  type StyleId,
  type Track,
} from "../../dj/types";
import type { DjTrack, DjView } from "../../protocol";
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
  };
}

/** A booth saved before a field existed gets it empty (the state is stored whole). */
function norm(s: RoomState): RoomState {
  s.colds ??= [];
  s.knobs ??= {};
  s.drops ??= [];
  s.queue ??= [];
  return s;
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
        if (lastAt(s.fires, pid) > since || lastAt(s.colds, pid) > since) return;
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
        if (!STYLE_IDS.includes(style)) return;
        const v = num(g.value, -1, 1);
        if (v === null) return;
        // on the grid; `|| 0` keeps -0 out
        const value = Math.round(v / KNOB_STEP) * KNOB_STEP || 0;
        const mine = { ...s.knobs[pid] };
        if ((mine[style] ?? 0) === value) return;
        if (value) mine[style] = value;
        else delete mine[style];
        if (Object.keys(mine).length) s.knobs[pid] = mine;
        else delete s.knobs[pid];
        return;
      }
      case "ask": {
        const text = cleanAsk(g.text);
        if (Array.from(text).length < ASK_CHARS.min) return;
        const waiting = s.queue.filter((t) => WAITING.includes(t.status));
        if (waiting.length >= QUEUE_MAX) return;
        if (waiting.filter((t) => t.by === pid).length >= ASKS_EACH) return;
        const style = STYLE_IDS.includes(g.style as StyleId) ? (g.style as StyleId) : null;
        s.queue = trimDone([...s.queue, { id: trackId(s, api), by: pid, ask: text, style, status: "queued", at: api.now }]);
        api.fx("ask", pid);
        return;
      }
      case "unask": {
        const i = s.queue.findIndex((t) => t.id === g.id);
        if (i < 0) return;
        const t = s.queue[i];
        if (t.by !== pid && !host) return;
        // once it's being checked or made, it's the song pipeline's (A5)
        if (t.status !== "queued" && t.status !== "refused" && t.status !== "failed") return;
        s.queue.splice(i, 1);
        return;
      }
      case "drop": {
        api.light();
        // no music, nothing to drop
        if (s.phase === "wait" || s.phase === "end") return;
        if (lastAt(s.drops, pid) > api.now - DROP_GAP_MS) return;
        s.drops = keep([...s.drops, { pid, at: api.now }], KEEP_DROPS);
        api.fx("drop", pid);
        return;
      }
      case "phase": {
        if (!host || s.phase === "wait" || s.phase === "end") return;
        const to = g.phase as SetPhase | "end";
        if (to !== "end" && !SET_PHASES.includes(to as SetPhase)) return;
        if (to === s.phase) return;
        goTo(s, to, api);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return;
        const next = fresh(s.set + 1);
        // the night's 🔥 count, everyone's knobs, the songs asked for and the speaker's record
        // carry on into the next set (❄️ and drops are about the moment)
        next.total = s.total;
        next.knobs = s.knobs;
        next.queue = s.queue;
        next.speaker = s.speaker;
        Object.assign(s, next);
        api.clear("next");
        api.clear("wind");
        api.clear("cap");
        return;
      }
    }
  },

  screen(s, _sid, g, api) {
    norm(s);
    switch (g.x) {
      case "live": {
        if (s.phase !== "wait") return false;
        s.source = g.source === "lyria" ? "lyria" : "fake";
        begin(s, api);
        return true;
      }
      case "stats": {
        if (s.speaker.at && api.now - s.speaker.at < STATS_GAP_MS) return false;
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
    }
    return false;
  },

  timer(s, key, _data, api) {
    norm(s);
    if (s.phase === "wait" || s.phase === "end") return;
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
      set: s.set,
    };
  },
};
