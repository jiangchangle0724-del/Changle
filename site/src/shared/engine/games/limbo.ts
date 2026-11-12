import type { LimboBar, LimboKind, LimboView } from "../../protocol";
import { t, type Api, type GameDef } from "../api";

/**
 * Limbo, with the phone as the judge. Hold the phone upright against your chest and lean
 * back until you reach the bar's angle, then hold it there. Each level the bar drops (the
 * angle grows). Miss it in time and you're out. Phones without a motion sensor are judged
 * by the host, or by their owner's honesty.
 *
 * Blind lean (盲仰): each round shows a target angle but not your own lean. Lean back to what
 * feels like it and hold still; the phone locks your angle. Whoever ends up furthest from the
 * target is out and drinks. It needs every player's motion sensor (no one can judge degrees by
 * eye), so phones without one watch that game; and since targets stay moderate, a few drinks in
 * it stays safe.
 *
 * Three variants of a bar, each picked before the game like blind lean, and each judged by the
 * host or by honesty on a phone without a motion sensor, as in classic:
 * - Hold steady (稳住): reach the bar's angle, then hold perfectly still. Any wobble starts the
 *   hold again, and every bar needs a longer hold.
 * - Moving bar (跟着动的杆): the bar floats up and down and you follow it, leaning further and
 *   coming back up. Lose it for more than a second and you're out. Its path is worked out from
 *   the bar's start time, so every phone shows it in the same place.
 * - Tilt through (歪着过): lean back to the bar's angle and tilt left or right as well. The side
 *   is random each bar.
 * Party (派对) picks one of classic and those three for each bar, at random, never the same twice
 * running. Blind lean isn't in the draw: it ranks players instead of passing or failing them.
 */

export const LIMBO_ANGLES = [20, 30, 38, 45, 51, 56, 60, 64, 67, 70, 73, 76, 79, 82];
/** Blind lean targets: moderate on purpose, the skill is the feel, not the depth. */
export const BLIND_TARGETS = [25, 30, 35, 40, 45, 50, 55, 60];

export type LimboMode = LimboKind | "party" | "blind";
/** Every way to play, in the order the pickers show them. */
export const LIMBO_MODES: LimboMode[] = ["classic", "steady", "moving", "tilt", "party", "blind"];
/** What party mode draws from, a new one each bar. */
export const PARTY_KINDS: LimboKind[] = ["classic", "steady", "moving", "tilt"];

/** Hold steady: the first bar's hold; each bar after it is this much longer, up to the most. */
const STEADY_FIRST_MS = 2000;
const STEADY_STEP_MS = 500;
const STEADY_MOST_MS = 6000;
/** Tilt through: how far to tilt sideways, bar by bar (after the last, it stays there). */
export const TILT_SIDES = [15, 18, 20, 22, 25];
/** Moving bar: it waits at its top this long, then sways down to the bar's angle and back up, twice. */
export const MOVE_LEAD_MS = 1500;
const MOVE_SWING = 20;
/**
 * Moving bar: within this many degrees of it you're with it; away from it for longer than LOST_MS,
 * you're out. Two seconds, because the player hears the bar rather than seeing it (the phone is on
 * their chest) and needs time to move after the cue; one second lost people before they could react.
 */
export const FOLLOW_DEG = 12;
export const LOST_MS = 2000;
/** Moving bar: the grace clock only runs once you've caught the bar (been with it once), or from this long in if you never do. */
export const CATCH_MS = 4500;
/** Moving bar: once it stops, this long for the phones to say how it went and for the host to judge. */
const MOVE_TAIL_MS = 5000;

type S = {
  phase: "ready" | "go" | "result" | "end";
  mode: LimboMode;
  /** the bar now: its variant and what it asks for (blind: a classic one) */
  bar: LimboBar;
  /** blind lean: this round's target, and each player's locked angle */
  target: number;
  locks: Record<string, number>;
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

/** How far back to lean at this level (bar 1 is level 0). */
export const limboAngle = (level: number) => LIMBO_ANGLES[Math.min(level, LIMBO_ANGLES.length - 1)];

/** How far a blind lean ended from the target; no lock at all counts as the worst. */
export const blindError = (lock: number | undefined, target: number) => (lock === undefined ? 90 : Math.abs(lock - target));

/** A bar that asks for nothing but the lean. */
export const classicBar = (): LimboBar => ({ kind: "classic", hold: 0, side: 0, swing: 0, period: 0, moveMs: 0 });

/** Hold steady: how long this level's hold is. */
export const steadyMs = (level: number) => Math.min(STEADY_MOST_MS, STEADY_FIRST_MS + STEADY_STEP_MS * level);

/** A bar of this kind at this level; `int(n)` picks 0 to n-1 (which side a tilt goes). */
export function barFor(kind: LimboKind, level: number, int: (n: number) => number): LimboBar {
  const bar = { ...classicBar(), kind };
  if (kind === "steady") bar.hold = steadyMs(level);
  else if (kind === "tilt") bar.side = TILT_SIDES[Math.min(level, TILT_SIDES.length - 1)] * (int(2) ? 1 : -1);
  else if (kind === "moving") {
    // from a little way back (never upright) down to the level's angle; a bit quicker each bar
    bar.swing = Math.min(MOVE_SWING, limboAngle(level) - 8);
    bar.period = Math.max(3600, 6000 - 400 * level);
    bar.moveMs = MOVE_LEAD_MS + 2 * bar.period;
  }
  return bar;
}

/** The next bar's variant: the mode's own, or in party mode a random one, never the one just played. */
export function kindFor(mode: LimboMode, last: LimboKind | null, int: (n: number) => number): LimboKind {
  if (mode !== "party") return PARTY_KINDS.find((k) => k === mode) ?? "classic";
  const choices = PARTY_KINDS.filter((k) => k !== last);
  return choices[int(choices.length)];
}

/**
 * Moving bar: how far back the bar is `ms` after the start. It waits at its top (the bar's angle
 * less the swing), sways down to the bar's angle and back up once a period, and stops at the top.
 * Every phone works it out from the same start time, so they all show it in the same place.
 */
export function barAngleAt(angle: number, bar: LimboBar, ms: number) {
  if (bar.kind !== "moving" || bar.period <= 0) return angle;
  const t = Math.min(Math.max(0, ms - MOVE_LEAD_MS), bar.moveMs - MOVE_LEAD_MS);
  return angle - bar.swing + (bar.swing * (1 - Math.cos((2 * Math.PI * t) / bar.period))) / 2;
}

/** How long a bar stays open after the count-in: a longer hold gets longer; a moving bar, until it stops and the phones report. */
export function barWindowMs(bar: LimboBar) {
  return bar.kind === "moving" ? bar.moveMs + MOVE_TAIL_MS : WINDOW_MS + bar.hold;
}

/** The bar now (a table saved before there were variants has none: a classic one). */
const barOf = (s: S) => s.bar ?? classicBar();

/** From when a pass counts: nobody has kept up with a moving bar until it stops. */
function passFrom(s: S) {
  const bar = barOf(s);
  return bar.kind === "moving" ? s.startAt + bar.moveMs - 400 : s.startAt - 400;
}

function startLevel(s: S, api: Api) {
  if (!s.musicAt) s.musicAt = api.now + 600;
  if (s.mode === "blind") {
    // a fresh target each round, never the same twice in a row
    const choices = BLIND_TARGETS.filter((a) => a !== s.target);
    s.target = choices[api.int(choices.length)];
    s.locks = {};
    s.bar = classicBar();
  } else s.bar = barFor(kindFor(s.mode, s.phase === "ready" ? null : barOf(s).kind, api.int), s.level, api.int);
  s.phase = "go";
  s.startAt = api.now + COUNT_MS;
  s.endsAt = s.startAt + (s.mode === "blind" ? WINDOW_MS : barWindowMs(s.bar));
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
    if (top <= 0) {
      // and nobody leaned at all (no readings, nobody judged a pass): there's no furthest, so
      // everyone takes the penalty and tries the same bar again, as on one phone (the first seat
      // used to win the game for nothing)
      api.penalty(failed, "sip", t("林波舞：谁都没过，这一杆再来", "Limbo: nobody made it, same bar again"), { delay: 600 });
      api.timer("next", api.now + BETWEEN_MS);
      return;
    }
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

/** Blind lean: everyone's locked (or time is up). Furthest from the target is out and drinks. */
function settleBlind(s: S, api: Api) {
  api.clear("end");
  s.phase = "result";
  const err = (pid: string) => blindError(s.locks[pid], s.target);
  const worst = Math.max(...s.alive.map(err));
  const losers = s.alive.filter((pid) => err(pid) === worst);
  if (losers.length === s.alive.length) {
    // all exactly as far off: everyone drinks, and the same people go again at a new target
    api.penalty(losers, "sip", t(`盲仰：大家差得一样多（${worst}°）`, `Blind lean: all ${worst}° off`), { delay: 600 });
  } else {
    s.alive = s.alive.filter((pid) => !losers.includes(pid));
    s.out.push(...losers);
    api.fx("out", losers[0]);
    api.penalty(losers, "sip", t(`盲仰：差了 ${worst}°`, `Blind lean: ${worst}° off`), { delay: 600 });
  }
  if (s.alive.length <= 1) {
    s.phase = "end";
    s.winner = s.alive[0] ?? null;
    api.fx("win", s.winner ?? undefined);
    return;
  }
  s.level += 1;
  api.timer("next", api.now + BETWEEN_MS);
}

function check(s: S, api: Api) {
  if (s.phase !== "go") return;
  if (s.mode === "blind") {
    if (s.alive.every((pid) => s.locks[pid] !== undefined)) settleBlind(s, api);
  } else if (s.alive.every((pid) => s.passed.includes(pid) || s.failed.includes(pid))) settle(s, api);
}

export const limbo: GameDef<S> = {
  id: "limbo",
  min: 2,
  init(api) {
    return { phase: "ready", mode: "classic", bar: classicBar(), target: 0, locks: {}, level: 0, musicAt: 0, startAt: 0, endsAt: 0, alive: api.ids(), passed: [], failed: [], out: [], best: {}, sensors: [], winner: null };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    const deg = Math.round(Math.max(0, Math.min(90, Number(g.deg) || 0)));
    switch (g.x) {
      case "mode": {
        if (!host || (s.phase !== "ready" && s.phase !== "end")) return;
        s.mode = LIMBO_MODES.find((m) => m === g.mode) ?? "classic";
        return;
      }
      case "go": {
        if (!host || (s.phase !== "ready" && s.phase !== "result")) return;
        if (s.mode === "blind" && s.phase === "ready") {
          // only phones that can measure play; the others watch this game
          const players = s.alive.filter((pid) => s.sensors.includes(pid));
          if (players.length < 2) return;
          s.alive = players;
        }
        startLevel(s, api);
        return;
      }
      case "lock": {
        if (s.mode !== "blind" || s.phase !== "go" || !s.alive.includes(pid) || s.locks[pid] !== undefined || api.now < s.startAt - 400) return;
        s.locks[pid] = deg;
        check(s, api);
        return;
      }
      case "best": {
        if (s.phase !== "go" || !s.alive.includes(pid)) return;
        s.best[pid] = Math.max(s.best[pid] ?? 0, deg);
        return;
      }
      case "pass": {
        if (s.mode === "blind" || s.phase !== "go" || !s.alive.includes(pid) || s.passed.includes(pid) || s.failed.includes(pid) || api.now < passFrom(s)) return;
        s.passed.push(pid);
        s.best[pid] = Math.max(s.best[pid] ?? 0, deg || limboAngle(s.level));
        check(s, api);
        return;
      }
      case "fail": {
        if (s.mode === "blind" || s.phase !== "go" || !s.alive.includes(pid) || s.passed.includes(pid) || s.failed.includes(pid)) return;
        s.failed.push(pid);
        // a moving bar lost: how deep it went while they were with it (the tiebreak)
        if (deg) s.best[pid] = Math.max(s.best[pid] ?? 0, deg);
        check(s, api);
        return;
      }
      case "judge": {
        const target = String(g.pid ?? "");
        if (!host || s.mode === "blind" || s.phase !== "go" || !s.alive.includes(target)) return;
        if (g.ok && api.now < passFrom(s)) return;
        s.passed = s.passed.filter((p) => p !== target);
        s.failed = s.failed.filter((p) => p !== target);
        if (g.ok) {
          s.passed.push(target);
          s.best[target] = Math.max(s.best[target] ?? 0, limboAngle(s.level));
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
        Object.assign(s, { phase: "ready", bar: classicBar(), level: 0, musicAt: 0, target: 0, locks: {}, alive: api.ids(), passed: [], failed: [], out: [], best: {}, winner: null });
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "end" && s.phase === "go") (s.mode === "blind" ? settleBlind : settle)(s, api);
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
    const blind = s.mode === "blind";
    return {
      id: "limbo",
      phase: s.phase,
      mode: s.mode ?? "classic",
      bar: barOf(s),
      // locked angles stay hidden until the round is over
      locked: blind ? Object.keys(s.locks) : [],
      locks: blind && s.phase !== "go" ? s.locks : {},
      level: s.level,
      angle: blind ? s.target || BLIND_TARGETS[0] : limboAngle(s.level),
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
