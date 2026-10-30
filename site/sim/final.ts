/**
 * The step 3 report numbers: the tuned config checked with well over 10,000 games.
 *
 *   npx tsx sim/final.ts sim/out/tune4.json sim/out/final.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BOARD, CITIES, GROUPS } from "../src/shared/trip/data";
import { defaultConfig, type Config } from "../src/shared/trip/engine";
void defaultConfig;
import { STYLES } from "../src/shared/trip/bots";
import { configWith, mixed, startingConfig } from "./tune";
import { run, summarize, type Result } from "./trip_sim";

const tuned = JSON.parse(readFileSync(process.argv[2] ?? "sim/out/tune4.json", "utf8"));
const OUT = process.argv[3] ?? "sim/out/final.json";
const SEAT = 25;
const bal = (n: number) => () => Array.from({ length: n }, () => STYLES.balanced);
let total = 0;
const t0 = Date.now();

function cfgFor(n: number, target?: number): Config {
  const c = configWith(tuned.mult, target ?? (n === 2 ? TWO : tuned.target));
  c.seatBonus = Array.from({ length: n }, (_, k) => k * SEAT);
  return c;
}
function go(cfg: Config, n: number, games: number, pick: (i: number) => (typeof STYLES)[keyof typeof STYLES][], seed: number): Result[] {
  total += games;
  return run(cfg, n, games, pick, seed);
}

// two players: a higher target, so their game runs about as long as everyone else's
let TWO = 4500;
for (const t of [4500, 5000, 5500]) {
  const s = summarize(go(configWith(tuned.mult, t), 2, 600, bal(2), 1000 + t), 2);
  console.log(`2p target $${t}: ${s.minutes.mean.toFixed(1)} min`);
  TWO = t;
  if (s.minutes.mean >= 30) break;
}

// the main table: four players
const main = go(cfgFor(4), 4, 3000, bal(4), 10_000);
const s4 = summarize(main, 4);
const hist = Array.from({ length: 14 }, (_, k) => ({ from: k * 5, n: main.filter((r) => r.seconds / 60 >= k * 5 && r.seconds / 60 < k * 5 + 5).length }));
const noBonus = summarize(go({ ...cfgFor(4), seatBonus: [] }, 4, 2000, bal(4), 20_000), 4);
console.log(`4p: ${s4.minutes.mean.toFixed(1)} min (p10 ${s4.minutes.p10.toFixed(0)}, p90 ${s4.minutes.p90.toFixed(0)}), seat ${s4.seat.map((x) => (x * 100).toFixed(1)).join("/")}; without the seat bonus ${noBonus.seat.map((x) => (x * 100).toFixed(1)).join("/")}`);

// every table size
const sizes = [2, 3, 4, 5, 6].map((n) => {
  const s = n === 4 ? s4 : summarize(go(cfgFor(n), n, 1000, bal(n), 30_000 + n * 1000), n);
  console.log(`${n}p: ${s.minutes.mean.toFixed(1)} min, ${s.rounds.mean.toFixed(1)} rounds, first seat ${(s.firstSeatEdge * 100).toFixed(1)}pp`);
  return { n, target: n === 2 ? TWO : tuned.target, minutes: s.minutes, rounds: s.rounds, seat: s.seat, firstSeatEdge: s.firstSeatEdge, secondsPerTurn: s.secondsPerTurn, reasons: s.reasons };
});

// playing styles: random mixed tables
const mix4 = summarize(go(cfgFor(4), 4, 3000, mixed(4), 40_000), 4);
const mix6 = summarize(go(cfgFor(6), 6, 1000, mixed(6), 50_000), 6);
console.log("styles 4p:", Object.entries(mix4.byStyle).map(([k, v]) => `${k} ${(v.rate * 100).toFixed(1)}%`).join(", "));
console.log("styles 6p:", Object.entries(mix6.byStyle).map(([k, v]) => `${k} ${(v.rate * 100).toFixed(1)}%`).join(", "));

// before tuning, for comparison (the step 2 numbers)
const before = summarize(go(startingConfig(), 4, 1000, bal(4), 60_000), 4);

// city rules off: same rents, every city plain
const off = summarize(go({ ...cfgFor(4), cityRules: false }, 4, 1000, bal(4), 70_000), 4);
console.log(`rules off: ${off.minutes.mean.toFixed(1)} min, ${off.rounds.mean.toFixed(1)} rounds (rules on ${s4.rounds.mean.toFixed(1)})`);

// the timed games: rounds that fit, and how fair they end
const timed = [15, 60].flatMap((minutes) =>
  [2, 4, 6].map((n) => {
    const spt = sizes.find((x) => x.n === n)!.secondsPerTurn;
    const rounds = Math.max(3, Math.round((minutes * 60) / (spt * n)));
    const cfg = { ...cfgFor(n), end: { kind: "rounds" as const, rounds }, dealCities: minutes === 15 ? 2 : 0 };
    const s = summarize(go(cfg, n, 1000, bal(n), 80_000 + minutes * 100 + n), n);
    console.log(`${minutes} min, ${n}p: ${rounds} rounds, ${s.minutes.mean.toFixed(1)} min, first seat ${(s.firstSeatEdge * 100).toFixed(1)}pp, ends ${JSON.stringify(s.reasons)}`);
    return { minutes, n, rounds, simMinutes: s.minutes.mean, seat: s.seat, firstSeatEdge: s.firstSeatEdge, reasons: s.reasons };
  }),
);

// what each group earns back per dollar, before and after, measured over the same length of game (an hour, 31 rounds)
const hourOf = (c: Config): Config => ({ ...c, end: { kind: "rounds", rounds: 31 }, seatBonus: [] });
const roiBefore = summarize(go(hourOf(startingConfig()), 4, 1500, bal(4), 95_000), 4).groupRoi;
const roiAfter = summarize(go(hourOf(cfgFor(4)), 4, 1500, bal(4), 96_000), 4).groupRoi;
const groups = GROUPS.map((g) => ({ id: g.id, name: g.name, before: roiBefore[g.id], after: roiAfter[g.id] }));
groups.push({ id: 9 as never, name: { zh: "航线", en: "Routes" }, before: roiBefore.routes, after: roiAfter.routes });
groups.push({ id: 10 as never, name: { zh: "服务", en: "Services" }, before: roiBefore.services, after: roiAfter.services });
console.log("roi before", Object.entries(roiBefore).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" "));
console.log("roi after ", Object.entries(roiAfter).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" "));

const report = {
  games: total,
  seconds: Math.round((Date.now() - t0) / 1000),
  target: tuned.target,
  targetTwo: TWO,
  seatBonus: SEAT,
  rents: configWith(tuned.mult, tuned.target).rents,
  rentsBefore: startingConfig().rents,
  routeRent: configWith(tuned.mult, tuned.target).routeRent,
  serviceTimes: configWith(tuned.mult, tuned.target).serviceTimes,
  prices: Object.fromEntries(CITIES.map((c) => [c.id, c.price])),
  landing: BOARD.map((sp, i) => ({ i, k: sp.k, id: sp.k === "city" || sp.k === "route" || sp.k === "service" ? sp.id : "", p: s4.landing[i] })),
  main: { minutes: s4.minutes, rounds: s4.rounds, seat: s4.seat, seatNoBonus: noBonus.seat, secondsPerTurn: s4.secondsPerTurn, hist, reasons: s4.reasons, builds: s4.builds, trades: s4.trades, auctions: s4.auctions },
  before: { minutes: before.minutes, rounds: before.rounds, seat: before.seat },
  sizes,
  styles4: mix4.byStyle,
  styles6: mix6.byStyle,
  rulesOff: { minutes: off.minutes, rounds: off.rounds },
  rulesPerGame: s4.rulesPerGame,
  timed,
  groups,
};
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(`games ${total}, ${report.seconds}s`);
