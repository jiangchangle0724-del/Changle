/**
 * The verify page's engine: the same rules engine, computer players and simulation the step 3
 * report used, bundled for a browser by sim/web/build.mjs.
 */
import { defaultConfig, type Config } from "../../src/shared/trip/engine";
import { STYLES } from "../../src/shared/trip/bots";
import { mixed } from "../tune";
import { play, summarize, type Result } from "../trip_sim";

export type Job = { n: number; games: number; seed: number; mode: "target" | 15 | 60; styles: "balanced" | "mixed" };

/** Seconds per turn at each table size, from the report: a timed game is this many rounds. */
const SECONDS_PER_TURN: Record<number, number> = { 2: 32.49, 3: 30.61, 4: 29.32, 5: 28.5, 6: 27.87 };
export const roundsFor = (minutes: number, n: number) => Math.max(3, Math.round((minutes * 60) / (SECONDS_PER_TURN[n] * n)));

export function configFor(job: Job): Config {
  const cfg = defaultConfig(job.n);
  if (job.mode !== "target") {
    cfg.end = { kind: "rounds", rounds: roundsFor(job.mode, job.n) };
    cfg.dealCities = job.mode === 15 ? 2 : 0;
  }
  return cfg;
}

/** Play the games a few at a time, so the page can show progress between steps. */
export function createRun(job: Job) {
  const cfg = configFor(job);
  const pick = job.styles === "mixed" ? mixed(job.n) : () => Array.from({ length: job.n }, () => STYLES.balanced);
  const rs: Result[] = [];
  return {
    target: cfg.end,
    step(count: number) {
      const end = Math.min(job.games, rs.length + count);
      while (rs.length < end) rs.push(play(cfg, pick(rs.length), job.seed + rs.length));
      return rs.length;
    },
    summary() {
      const s = summarize(rs, job.n);
      return { games: rs.length, minutes: s.minutes, rounds: s.rounds, seat: s.seat, firstSeatEdge: s.firstSeatEdge, byStyle: s.byStyle, reasons: s.reasons };
    },
  };
}
