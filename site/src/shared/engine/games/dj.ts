/**
 * 打碟 · DJ Booth: the booth's rules on the rooms server. A big screen opened at changle.ca/dj
 * opens the booth by itself; the music starts when that screen (the speaker) says it is playing;
 * then the night runs warm-up → build → peak → wind-down → end, moving on by itself on a clock the
 * host can override, and every set ends 4 hours after its music started.
 */
import { ENERGY, FAKE_MIX, mixFor } from "../../dj/curve";
import { DJ_TIMES, FIRE_GAP_MS, SET_PHASES, type DjPhase, type RoomState, type SetPhase } from "../../dj/types";
import type { DjView } from "../../protocol";
import { num, type Api, type GameDef } from "../api";

const KEEP_FIRES = 40;

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
    queue: [],
    speaker: { at: 0, stalls: 0, resets: 0, seconds: 0 },
    set,
  };
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
  api.fx("start");
}

export const dj: GameDef<RoomState> = {
  id: "dj",
  min: 1,
  auto: true,

  init() {
    return fresh(1);
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "fire": {
        // one 🔥 per FIRE_GAP_MS a phone: a held thumb can't flood the room
        const last = [...s.fires].reverse().find((f) => f.pid === pid);
        if (last && api.now - last.at < FIRE_GAP_MS) return;
        s.fires.push({ pid, at: api.now });
        if (s.fires.length > KEEP_FIRES) s.fires = s.fires.slice(-KEEP_FIRES);
        s.total[pid] = (s.total[pid] ?? 0) + 1;
        api.fx("fire", pid);
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
        // the night's 🔥 count carries on into the next set
        next.total = s.total;
        Object.assign(s, next);
        api.clear("next");
        api.clear("wind");
        api.clear("cap");
        return;
      }
    }
  },

  screen(s, _sid, g, api) {
    switch (g.x) {
      case "live": {
        if (s.phase !== "wait") return;
        s.source = g.source === "lyria" ? "lyria" : "fake";
        begin(s, api);
        return;
      }
      case "stats": {
        const stalls = num(g.stalls, 0, 10_000);
        const resets = num(g.resets, 0, 10_000);
        const seconds = num(g.seconds, 0, 6 * 3600);
        if (stalls === null || resets === null || seconds === null) return;
        s.speaker = {
          at: api.now,
          stalls: s.speaker.stalls + Math.round(stalls),
          resets: s.speaker.resets + Math.round(resets),
          seconds: s.speaker.seconds + Math.round(seconds),
        };
        return;
      }
    }
  },

  timer(s, key, _data, api) {
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

  view(s): DjView {
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
      set: s.set,
    };
  },
};
