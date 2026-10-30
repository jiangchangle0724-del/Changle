import type { LimboView } from "../../protocol";
import { t, type Api, type GameDef } from "../api";

/**
 * Limbo, with the phone as the judge. Hold the phone upright against your chest and lean
 * back until you reach the bar's angle, then hold it there. Each level the bar drops (the
 * angle grows). Miss it in time and you're out. Phones without a motion sensor are judged
 * by the host, or by their owner's honesty.
 */

export const LIMBO_ANGLES = [20, 30, 38, 45, 51, 56, 60, 64, 67, 70, 73, 76, 79, 82];

type S = {
  phase: "ready" | "go" | "result" | "end";
  level: number;
  musicAt: number;
  startAt: number;
  endsAt: number;
  alive: string[];
  passed: string[];
  failed: string[];
  out: string[];
  best: Record<string, number>;
  sensors: string[];
  winner: string | null;
};

const COUNT_MS = 3500;
const WINDOW_MS = 15_000;
const BETWEEN_MS = 7000;

const angleOf = (level: number) => LIMBO_ANGLES[Math.min(level, LIMBO_ANGLES.length - 1)];

function startLevel(s: S, api: Api) {
  if (!s.musicAt) s.musicAt = api.now + 600;
  s.phase = "go";
  s.startAt = api.now + COUNT_MS;
  s.endsAt = s.startAt + WINDOW_MS;
  s.passed = [];
  s.failed = [];
  s.best = {};
  api.clear("next");
  api.timer("end", s.endsAt);
}

function settle(s: S, api: Api) {
  api.clear("end");
  const failed = s.alive.filter((pid) => !s.passed.includes(pid));
  s.failed = failed;
  s.phase = "result";
  if (failed.length && failed.length === s.alive.length) {
    // nobody made it: whoever leaned furthest wins
    const top = Math.max(...failed.map((pid) => s.best[pid] ?? 0));
    const winners = failed.filter((pid) => (s.best[pid] ?? 0) === top);
    s.out.push(...failed.filter((pid) => !winners.includes(pid)));
    s.alive = winners;
    s.phase = "end";
    s.winner = winners[0] ?? null;
    const losers = failed.filter((pid) => !winners.includes(pid));
    if (losers.length) api.penalty(losers, "sip", t("林波舞：没过去", "Limbo: didn't make it under"), { delay: 600 });
    api.fx("win", s.winner ?? undefined);
    return;
  }
  if (failed.length) {
    s.alive = s.alive.filter((pid) => !failed.includes(pid));
    s.out.push(...failed);
    api.fx("out", failed[0]);
    api.penalty(failed, "sip", t("林波舞：没过去", "Limbo: didn't make it under"), { delay: 600 });
  } else api.fx("level");
  if (s.alive.length <= 1 && s.out.length) {
    s.phase = "end";
    s.winner = s.alive[0] ?? null;
    api.fx("win", s.winner ?? undefined);
    return;
  }
  s.level += 1;
  api.timer("next", api.now + BETWEEN_MS);
}

function check(s: S, api: Api) {
  if (s.phase === "go" && s.alive.every((pid) => s.passed.includes(pid) || s.failed.includes(pid))) settle(s, api);
}

export const limbo: GameDef<S> = {
  id: "limbo",
  min: 2,
  init(api) {
    return { phase: "ready", level: 0, musicAt: 0, startAt: 0, endsAt: 0, alive: api.ids(), passed: [], failed: [], out: [], best: {}, sensors: [], winner: null };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    const deg = Math.round(Math.max(0, Math.min(90, Number(g.deg) || 0)));
    switch (g.x) {
      case "go": {
        if (!host || (s.phase !== "ready" && s.phase !== "result")) return;
        startLevel(s, api);
        return;
      }
      case "best": {
        if (s.phase !== "go" || !s.alive.includes(pid)) return;
        s.best[pid] = Math.max(s.best[pid] ?? 0, deg);
        return;
      }
      case "pass": {
        if (s.phase !== "go" || !s.alive.includes(pid) || s.passed.includes(pid) || s.failed.includes(pid) || api.now < s.startAt - 400) return;
        s.passed.push(pid);
        s.best[pid] = Math.max(s.best[pid] ?? 0, deg || angleOf(s.level));
        check(s, api);
        return;
      }
      case "fail": {
        if (s.phase !== "go" || !s.alive.includes(pid) || s.passed.includes(pid) || s.failed.includes(pid)) return;
        s.failed.push(pid);
        check(s, api);
        return;
      }
      case "judge": {
        const target = String(g.pid ?? "");
        if (!host || s.phase !== "go" || !s.alive.includes(target)) return;
        s.passed = s.passed.filter((p) => p !== target);
        s.failed = s.failed.filter((p) => p !== target);
        if (g.ok) {
          s.passed.push(target);
          s.best[target] = Math.max(s.best[target] ?? 0, angleOf(s.level));
        } else s.failed.push(target);
        check(s, api);
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
        Object.assign(s, { phase: "ready", level: 0, musicAt: 0, alive: api.ids(), passed: [], failed: [], out: [], best: {}, winner: null });
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "end" && s.phase === "go") settle(s, api);
    else if (key === "next" && s.phase === "result") startLevel(s, api);
  },

  join(s, pid) {
    if (s.phase === "ready" && !s.alive.includes(pid)) s.alive.push(pid);
  },

  leave(s, pid, api) {
    s.alive = s.alive.filter((p) => p !== pid);
    s.sensors = s.sensors.filter((p) => p !== pid);
    s.passed = s.passed.filter((p) => p !== pid);
    s.failed = s.failed.filter((p) => p !== pid);
    if (s.phase !== "ready" && s.phase !== "end" && s.alive.length <= 1 && s.out.length) {
      api.clear("end");
      api.clear("next");
      s.phase = "end";
      s.winner = s.alive[0] ?? null;
      return;
    }
    check(s, api);
  },

  view(s): LimboView {
    return {
      id: "limbo",
      phase: s.phase,
      level: s.level,
      angle: angleOf(s.level),
      musicAt: s.musicAt,
      startAt: s.startAt,
      endsAt: s.endsAt,
      alive: s.alive,
      passed: s.passed,
      failed: s.failed,
      out: s.out,
      best: s.best,
      sensors: s.sensors,
      winner: s.winner,
    };
  },
};
