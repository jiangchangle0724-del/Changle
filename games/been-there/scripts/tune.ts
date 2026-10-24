// The step-3 rent tuner, recovered. Starting from step 2's formula rents, it scales each group's
// rents until every group earns back a similar amount per dollar invested, then moves the
// unlimited-game target until 4 teams average about 40 minutes.
//
//   npx tsx scripts/tune.ts [gamesPerRound=1200] [out.json]
//   env: TARGET0 (first target to try, default 3500), SLOPE (0.3), CAP (2.2)
//
// It prints suggested rents; copy the ones you want into src/engine/config.ts (RENTS etc.).
import { writeFileSync } from "node:fs";
import { CITIES, GROUPS, defaultConfig, step2Rent, STYLES, type GameConfig } from "../src/engine";
import { playMany, sameStyle, summarize } from "../src/engine/sim";

const gamesPerRound = Number(process.argv[2] ?? 1200);
const out = process.argv[3];
const to5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const to10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);
const groupPrice: Record<string, number> = Object.fromEntries([
  ...GROUPS.map((g) => {
    const cities = CITIES.filter((c) => c.group === g.id);
    return [String(g.id), cities.reduce((sum, c) => sum + c.price, 0) / cities.length];
  }),
  ["routes", 200],
  ["services", 150],
]);
const avgPrice = CITIES.reduce((sum, c) => sum + c.price, 0) / CITIES.length;
const slope = Number(process.env.SLOPE ?? 0.3);

/** Step 2's rents: the starting point. */
function step2Config(): GameConfig {
  const cfg = defaultConfig(4);
  for (const c of CITIES) {
    const r = step2Rent(c.price);
    cfg.rents[c.id] = [r.base, r.set, ...r.houses, r.hotel];
  }
  cfg.routeRent = [25, 50, 100, 200];
  cfg.serviceTimes = [4, 10];
  cfg.end = { kind: "target", amount: 7000 };
  cfg.seatBonus = [];
  return cfg;
}

/** Scale rents per group, then keep them sensible: dearer cities earn more, every house adds rent, all in $5s. */
export function scaledConfig(mult: Record<string, number>, target: number, base = step2Config()): GameConfig {
  const cfg: GameConfig = JSON.parse(JSON.stringify(base));
  for (const c of CITIES) {
    const m = mult[c.group] ?? 1;
    const old = base.rents[c.id];
    const empty = to5(old[0] * m);
    cfg.rents[c.id] = [empty, empty * 2, ...old.slice(2).map((x) => to10(x * m))];
  }
  let prev: number[] | null = null;
  for (const c of [...CITIES].sort((a, b) => a.price - b.price)) {
    let r = cfg.rents[c.id];
    if (prev && r[6] < prev[6] * 1.04) {
      const k = (prev[6] * 1.04) / r[6];
      r = [to5(r[0] * k), 0, ...r.slice(2).map((x) => to10(x * k))];
    }
    if (prev) for (let i = 0; i < r.length; i++) r[i] = Math.max(r[i], prev[i]);
    r[1] = r[0] * 2;
    for (let i = 2; i < r.length; i++) r[i] = Math.max(r[i], r[i - 1] + 5);
    cfg.rents[c.id] = r;
    prev = r;
  }
  cfg.routeRent = base.routeRent.map((x) => to5(x * (mult.routes ?? 1)));
  cfg.serviceTimes = base.serviceTimes.map((x) => Math.max(2, Math.round(x * (mult.services ?? 1))));
  cfg.end = { kind: "target", amount: target };
  return cfg;
}

const t0 = Date.now();
const mult: Record<string, number> = Object.fromEntries([...GROUPS.map((g) => [String(g.id), 1]), ["routes", 1], ["services", 1]]);
let target = Number(process.env.TARGET0 ?? 3500);
const history: unknown[] = [];
const balanced = sameStyle(4, STYLES.balanced);

for (let round = 0; round < 8; round++) {
  const r = summarize(playMany(scaledConfig(mult, target), 4, gamesPerRound, balanced, 1 + round * 1e5), 4);
  const roi = Object.values(r.groupRoi);
  const median = [...roi].sort((a, b) => a - b)[Math.floor(roi.length / 2)];
  history.push({ step: `rents ${round}`, minutes: r.minutes.mean, roi: r.groupRoi, mult: { ...mult } });
  console.log(`rents ${round}: ${r.minutes.mean.toFixed(1)} min, roi`, Object.entries(r.groupRoi).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" "));
  if (Math.max(...roi) / Math.min(...roi) < 1.35) break;
  for (const [k, v] of Object.entries(r.groupRoi)) {
    // Dearer groups may earn back a little slower (they bankrupt people in one hit).
    const want = median * Math.pow((groupPrice[k] ?? avgPrice) / avgPrice, -slope);
    mult[k] = Math.min(Number(process.env.CAP ?? 2.2), Math.max(0.5, mult[k] * Math.min(1.5, Math.max(0.7, Math.pow(want / v, 0.6)))));
  }
}
for (let round = 0; round < 8; round++) {
  const r = summarize(playMany(scaledConfig(mult, target), 4, gamesPerRound, balanced, 7 + round * 77777), 4);
  history.push({ step: `target ${round}`, target, minutes: r.minutes });
  console.log(`target $${target}: ${r.minutes.mean.toFixed(1)} min (p10 ${r.minutes.p10.toFixed(0)}, p90 ${r.minutes.p90.toFixed(0)}), ${r.rounds.mean.toFixed(1)} rounds`);
  if (Math.abs(r.minutes.mean - 40) < 2.5) break;
  target = Math.round((target * Math.pow(40 / r.minutes.mean, 0.9)) / 250) * 250;
}
const final = scaledConfig(mult, target);
console.log("mult", JSON.stringify(mult), "target", target, "ms", Date.now() - t0);
if (out)
  writeFileSync(
    out,
    JSON.stringify({ mult, target, rents: final.rents, routeRent: final.routeRent, serviceTimes: final.serviceTimes, history }, null, 1),
  );
