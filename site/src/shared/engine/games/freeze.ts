import type { FreezeView } from "../../protocol";
import { t, type Api, type GameDef } from "../api";

/**
 * Freeze Dance. Every phone plays the same track and cuts out at the same moment. Freeze.
 * Phones held in hand feel the motion and report it; everyone else is judged by the host
 * (or owns up). Knockout mode: whoever moves is out, last dancer standing wins.
 * Drinking mode: whoever moves drinks, everyone keeps dancing.
 */

type S = {
  phase: "ready" | "dance" | "freeze" | "result" | "end";
  mode: "out" | "drink";
  round: number;
  groove: string;
  musicAt: number;
  stopAt: number;
  judgeAt: number;
  alive: string[];
  out: string[];
  moved: string[];
  sensors: string[];
  winner: string | null;
  auto: boolean;
};

const GROOVES = ["disco", "house", "funk", "electro", "hiphop"];
/** the music starts this long after the tap, so every phone can line up on the same beat */
const LEAD_MS = 1800;
const FREEZE_MS = 3800;
const BETWEEN_MS = 5500;

function startRound(s: S, api: Api) {
  s.round += 1;
  s.groove = s.round === 1 ? GROOVES[api.int(GROOVES.length)] : s.groove;
  // switch tracks every few rounds
  if (s.round > 1 && s.round % 3 === 1) s.groove = GROOVES[(GROOVES.indexOf(s.groove) + 1 + api.int(GROOVES.length - 1)) % GROOVES.length];
  s.musicAt = api.now + LEAD_MS;
  // shorter dances as the floor empties
  const lo = s.round <= 2 ? 9000 : 6000;
  const hi = s.round <= 2 ? 18000 : 15000;
  s.stopAt = s.musicAt + lo + api.int(hi - lo);
  s.judgeAt = s.stopAt + FREEZE_MS;
  s.moved = [];
  s.phase = "dance";
  api.timer("stop", s.stopAt);
  api.timer("judge", s.judgeAt);
  api.clear("auto");
}

function judge(s: S, api: Api) {
  const caught = s.moved.filter((pid) => s.alive.includes(pid));
  s.phase = "result";
  if (caught.length) {
    api.fx("out", caught[0]);
    if (s.mode === "out" && caught.length >= s.alive.length) {
      // everyone still dancing moved: nobody is out, they all drink and go again
      api.penalty(caught, "sip", t("木头人蹦迪：全都动了，再来一次", "Freeze Dance: everyone moved, go again"), { delay: 600 });
    } else if (s.mode === "out") {
      s.alive = s.alive.filter((pid) => !caught.includes(pid));
      s.out.push(...caught);
      api.penalty(caught, "two", t("木头人蹦迪：你动了，出局", "Freeze Dance: you moved, you're out"), { delay: 600 });
    } else {
      api.penalty(caught, "sip", t("木头人蹦迪：你动了", "Freeze Dance: you moved"), { delay: 600 });
    }
  } else api.fx("correct");
  if (s.mode === "out" && s.alive.length <= 1) {
    s.phase = "end";
    s.winner = s.alive[0] ?? null;
    api.fx("win", s.winner ?? undefined);
    return;
  }
  if (s.auto) api.timer("auto", api.now + BETWEEN_MS);
}

export const freeze: GameDef<S> = {
  id: "freeze",
  min: 2,
  init(api) {
    return { phase: "ready", mode: "out", round: 0, groove: "disco", musicAt: 0, stopAt: 0, judgeAt: 0, alive: api.ids(), out: [], moved: [], sensors: [], winner: null, auto: true };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "mode": {
        if (!host || s.phase !== "ready" || (g.mode !== "out" && g.mode !== "drink")) return;
        s.mode = g.mode;
        return;
      }
      case "go": {
        if (!host || (s.phase !== "ready" && s.phase !== "result")) return;
        startRound(s, api);
        return;
      }
      case "pause": {
        // stop after this round instead of rolling straight into the next
        if (!host) return;
        s.auto = !s.auto;
        if (!s.auto) api.clear("auto");
        else if (s.phase === "result") api.timer("auto", api.now + BETWEEN_MS);
        return;
      }
      case "moved": {
        // a phone felt itself move (or its owner owned up), after the music stopped
        if (s.phase !== "freeze" || !s.alive.includes(pid) || s.moved.includes(pid)) return;
        s.moved.push(pid);
        return;
      }
      case "catch": {
        const target = String(g.pid ?? "");
        if (!host || s.phase !== "freeze" || !s.alive.includes(target)) return;
        if (s.moved.includes(target)) s.moved = s.moved.filter((p) => p !== target);
        else s.moved.push(target);
        return;
      }
      case "sensor": {
        if (g.on) {
          if (!s.sensors.includes(pid)) s.sensors.push(pid);
        } else s.sensors = s.sensors.filter((p) => p !== pid);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return;
        Object.assign(s, { phase: "ready", round: 0, alive: api.ids(), out: [], moved: [], winner: null, auto: true });
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "stop" && s.phase === "dance") {
      s.phase = "freeze";
      api.fx("freeze");
    } else if (key === "judge" && s.phase === "freeze") judge(s, api);
    else if (key === "auto" && s.phase === "result" && s.auto) startRound(s, api);
  },

  join(s, pid) {
    // in drinking mode anyone can jump on the floor; knockout waits for the next game
    if (s.mode === "drink" || s.phase === "ready") if (!s.alive.includes(pid)) s.alive.push(pid);
  },

  leave(s, pid, api) {
    s.alive = s.alive.filter((p) => p !== pid);
    s.sensors = s.sensors.filter((p) => p !== pid);
    s.moved = s.moved.filter((p) => p !== pid);
    if (s.mode === "out" && s.phase !== "ready" && s.phase !== "end" && s.alive.length <= 1) {
      api.clear("stop");
      api.clear("judge");
      api.clear("auto");
      s.phase = "end";
      s.winner = s.alive[0] ?? null;
    }
  },

  view(s): FreezeView {
    return {
      id: "freeze",
      phase: s.phase,
      mode: s.mode,
      round: s.round,
      groove: s.groove,
      musicAt: s.musicAt,
      stopAt: s.stopAt,
      judgeAt: s.judgeAt,
      alive: s.alive,
      out: s.out,
      moved: s.phase === "dance" ? [] : s.moved,
      sensors: s.sensors,
      winner: s.winner,
      auto: s.auto,
    };
  },
};
