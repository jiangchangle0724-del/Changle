/**
 * 到此一游 · step 3 simulation: computer players play thousands of games with the real rules
 * engine, and we measure how long games run, who wins, where people land and which cities earn
 * their price back.
 *
 *   npx tsx sim/trip_sim.ts [games per experiment] [out.json]
 */
import { writeFileSync } from "node:fs";
import { BOARD, CITIES, GROUPS } from "../src/shared/trip/data";
import { BALLOTS, defaultConfig, GROUP_AT, houseCost, newGame, priceOf, worth, type Config, type Game, type Pending } from "../src/shared/trip/engine";
import { mind, playOut, STYLES, type Style } from "../src/shared/trip/bots";

/* ------------------------------------------------------------------ time: seconds each moment takes at a table with phones */

export const SECONDS: Partial<Record<Pending["k"], number>> = {
  roll: 14,
  permit: 4,
  buy: 6,
  auction: 25,
  debt: 15,
  "card-route": 5,
  "card-player": 4,
  "card-house": 5,
  koi: 4,
  water: 15,
  tango: 8,
  "tango-reply": 10,
  ban: 6,
  dance: 6,
  scores: 22,
  mumbai: 8,
  peek: 8,
  bet: 12,
  freeze: 15,
  jump: 5,
  quiz: 12,
  splash: 12,
  reverse: 5,
  coe: 18,
  barrier: 8,
  sales: 5,
  policy: 6,
  silence: 15,
};
const CARD_SECONDS = 7;
const TRADE_SECONDS = 35;
const BUILD_SECONDS = 2;

export type Result = {
  turns: number;
  rounds: number;
  seconds: number;
  winner: number | null;
  winnerStyle: string | null;
  reason: string;
  styles: string[];
  worths: number[];
  landings: number[];
  rentBySpace: number[];
  investBySpace: number[];
  ruleUses: Record<string, number>;
  trades: number;
  builds: number;
  auctions: number;
};

export function play(cfg: Config, styles: Style[], seed: number): Result {
  const n = styles.length;
  const g: Game = newGame(cfg, styles.map((s, i) => `${s.id}${i}`), seed);
  const minds = styles.map((s, i) => mind(s, seed * 7919 + i * 104729));
  let seconds = 0;
  let lastPending: Pending | null = null;
  let cards = 0;
  playOut(g, minds, (gg, _who, k) => {
    const pd = gg.pending;
    if (BALLOTS.has(k) && pd === lastPending) return; // a vote is one moment, not one per voter
    lastPending = pd;
    seconds += SECONDS[k] ?? 0;
  });
  // cards: the deck sizes left tell how many were drawn; simpler to count landings on card spaces
  BOARD.forEach((s, i) => {
    if (s.k === "journey" || s.k === "postcard") cards += g.stats.landings[i];
  });
  seconds += cards * CARD_SECONDS + g.stats.trades * TRADE_SECONDS + g.stats.builds * BUILD_SECONDS;
  const invest = BOARD.map((_, i) => (g.deeds[i] ? 0 : 0));
  g.deeds.forEach((d, i) => {
    if (d && d.owner >= 0) invest[i] = priceOf(g, i) + d.houses * houseCost(g, i);
  });
  const w = styles.map((_, i) => worth(g, i));
  return {
    turns: g.turns,
    rounds: g.turns / n,
    seconds,
    winner: g.winner,
    winnerStyle: g.winner === null ? null : styles[g.winner].id,
    reason: g.reason,
    styles: styles.map((s) => s.id),
    worths: w,
    landings: g.stats.landings,
    rentBySpace: g.stats.rentBySpace,
    investBySpace: invest,
    ruleUses: g.stats.ruleUses,
    trades: g.stats.trades,
    builds: g.stats.builds,
    auctions: g.stats.auctions,
  };
}

/* ------------------------------------------------------------------ summaries */

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
function pct(a: number[], q: number) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function summarize(rs: Result[], n: number) {
  const minutes = rs.map((r) => r.seconds / 60);
  const seat = Array.from({ length: n }, (_, i) => rs.filter((r) => r.winner === i).length / rs.length);
  const styles = [...new Set(rs.flatMap((r) => r.styles))];
  const byStyle = Object.fromEntries(
    styles.map((s) => {
      const seats = rs.reduce((c, r) => c + r.styles.filter((x) => x === s).length, 0);
      const wins = rs.filter((r) => r.winnerStyle === s).length;
      return [s, { seats, wins, rate: wins / Math.max(1, seats), share: wins / rs.length }];
    }),
  );
  const reasons: Record<string, number> = {};
  for (const r of rs) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  // rent earned per dollar invested, by group (cities), routes and services
  const groupRoi: Record<string, number> = {};
  for (const gr of GROUPS) {
    const idx = GROUP_AT[gr.id];
    const rent = mean(rs.map((r) => idx.reduce((s, i) => s + r.rentBySpace[i], 0)));
    const inv = mean(rs.map((r) => idx.reduce((s, i) => s + r.investBySpace[i], 0)));
    groupRoi[gr.id] = rent / Math.max(1, inv);
  }
  const kinds: [string, string][] = [
    ["route", "routes"],
    ["service", "services"],
  ];
  for (const [k, name] of kinds) {
    const idx = BOARD.map((s, i) => (s.k === k ? i : -1)).filter((i) => i >= 0);
    const rent = mean(rs.map((r) => idx.reduce((s, i) => s + r.rentBySpace[i], 0)));
    const inv = mean(rs.map((r) => idx.reduce((s, i) => s + r.investBySpace[i], 0)));
    groupRoi[name] = rent / Math.max(1, inv);
  }
  const land = BOARD.map((_, i) => rs.reduce((s, r) => s + r.landings[i], 0));
  const totalLand = land.reduce((s, x) => s + x, 0);
  const uses: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.ruleUses)) uses[k] = (uses[k] ?? 0) + v;
  return {
    games: rs.length,
    players: n,
    minutes: { mean: mean(minutes), p10: pct(minutes, 0.1), p50: pct(minutes, 0.5), p90: pct(minutes, 0.9) },
    rounds: { mean: mean(rs.map((r) => r.rounds)), p10: pct(rs.map((r) => r.rounds), 0.1), p90: pct(rs.map((r) => r.rounds), 0.9) },
    secondsPerTurn: mean(rs.map((r) => r.seconds / Math.max(1, r.turns))),
    seat,
    firstSeatEdge: seat[0] - 1 / n,
    byStyle,
    reasons,
    groupRoi,
    landing: land.map((x) => x / Math.max(1, totalLand)),
    rulesPerGame: Object.fromEntries(Object.entries(uses).map(([k, v]) => [k, v / rs.length])),
    trades: mean(rs.map((r) => r.trades)),
    builds: mean(rs.map((r) => r.builds)),
    auctions: mean(rs.map((r) => r.auctions)),
  };
}

export function run(cfg: Config, n: number, games: number, pick: (i: number) => Style[], seed0 = 1): Result[] {
  const out: Result[] = [];
  for (let i = 0; i < games; i++) out.push(play(cfg, pick(i), seed0 + i));
  return out;
}

/* ------------------------------------------------------------------ main */

const ALL = Object.values(STYLES);

function seats(n: number, style: Style) {
  return () => Array.from({ length: n }, () => style);
}

/** A table of mixed styles: every style shows up equally often, in every seat. */
function mixed(n: number) {
  return (i: number) => Array.from({ length: n }, (_, k) => ALL[(i + k * 2) % ALL.length]);
}

if (process.argv[1]?.endsWith("trip_sim.ts")) {
  const games = Number(process.argv[2] ?? 1000);
  const outFile = process.argv[3];
  const cfg = defaultConfig();
  const t0 = Date.now();
  const base = summarize(run(cfg, 4, games, seats(4, STYLES.balanced)), 4);
  console.log("4 players, balanced:", JSON.stringify({ minutes: base.minutes, rounds: base.rounds, spt: base.secondsPerTurn.toFixed(1), seat: base.seat.map((x) => x.toFixed(3)), reasons: base.reasons }));
  console.log("group ROI:", Object.entries(base.groupRoi).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" "));
  const mix = summarize(run(cfg, 4, games, mixed(4), 50_000), 4);
  console.log("4 players, mixed styles:", JSON.stringify(Object.fromEntries(Object.entries(mix.byStyle).map(([k, v]) => [k, v.rate.toFixed(3)]))), "seat", mix.seat.map((x) => x.toFixed(3)).join(" "));
  const off = summarize(run({ ...cfg, cityRules: false }, 4, games, seats(4, STYLES.balanced), 90_000), 4);
  console.log("rules off:", JSON.stringify({ minutes: off.minutes, rounds: off.rounds }));
  console.log("rule uses per game:", JSON.stringify(base.rulesPerGame));
  console.log("ms", Date.now() - t0);
  if (outFile) writeFileSync(outFile, JSON.stringify({ base, mix, off, cities: CITIES.map((c) => c.id) }, null, 1));
}
