/**
 * Tune 到此一游's numbers with the simulation:
 *  1. rents by group, so every group earns back about the same per dollar put in,
 *  2. the net worth target, so a no-limit game with four players runs about 40 minutes,
 *  3. then check the first player's edge and that no playing style wins far more than its share.
 *
 *   npx tsx sim/tune.ts [games per step] [out.json]
 */
import { writeFileSync } from "node:fs";
import { CITIES, GROUPS, rentTable } from "../src/shared/trip/data";
import { defaultConfig, type Config } from "../src/shared/trip/engine";
import { STYLES, type Style } from "../src/shared/trip/bots";
import { run, summarize } from "./trip_sim";

const GAMES = Number(process.argv[2] ?? 1200);
const OUT = process.argv[3];
const ALL = Object.values(STYLES);
const balanced = (n: number) => () => Array.from({ length: n }, () => STYLES.balanced);
/** A table of mixed styles: n different styles at random (with repeats only past five), seats shuffled. */
const mixed = (n: number) => (i: number) => {
  let x = (i * 2654435761) >>> 0;
  const rnd = () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...ALL];
  const out = [];
  for (let k = 0; k < n; k++) {
    if (!pool.length) pool.push(...ALL);
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  return out;
};

const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const r10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);

export type Mult = Record<string, number>;

/** average price per group (routes and services by their price) */
const AVG: Record<string, number> = Object.fromEntries([
  ...GROUPS.map((g) => {
    const cs = CITIES.filter((c) => c.group === g.id);
    return [String(g.id), cs.reduce((s, c) => s + c.price, 0) / cs.length];
  }),
  ["routes", 200],
  ["services", 150],
]);
const AVG_ALL = CITIES.reduce((s, c) => s + c.price, 0) / CITIES.length;
const SLOPE = Number(process.env.SLOPE ?? 0.3);

/** Step 2's numbers, where tuning starts: rents from the price formula, the original routes and services, a $7,000 target. */
export function startingConfig(): Config {
  const cfg = defaultConfig(4);
  for (const c of CITIES) {
    const r = rentTable(c.price);
    cfg.rents[c.id] = [r.base, r.set, ...r.houses, r.hotel];
  }
  cfg.routeRent = [25, 50, 100, 200];
  cfg.serviceTimes = [4, 10];
  cfg.end = { kind: "target", amount: 7000 };
  cfg.seatBonus = [];
  return cfg;
}

export function configWith(mult: Mult, target: number, base = startingConfig()): Config {
  const cfg: Config = JSON.parse(JSON.stringify(base));
  for (const c of CITIES) {
    const m = mult[c.group] ?? 1;
    const r = base.rents[c.id];
    const b = r5(r[0] * m);
    cfg.rents[c.id] = [b, b * 2, ...r.slice(2).map((x) => r10(x * m))];
  }
  // a pricier city never rents for less: each rent is at least the one on the next-cheaper city
  let prev: number[] | null = null;
  for (const c of [...CITIES].sort((x, y) => x.price - y.price)) {
    let r = cfg.rents[c.id];
    if (prev && r[6] < prev[6] * 1.04) {
      // and a step up in price is a step up in rent: lift the whole row a little above the last one
      const f = (prev[6] * 1.04) / r[6];
      r = [r5(r[0] * f), 0, ...r.slice(2).map((x) => r10(x * f))];
    }
    if (prev) for (let j = 0; j < r.length; j++) r[j] = Math.max(r[j], prev[j]);
    r[1] = r[0] * 2;
    // every building raises the rent, so the first house always beats the full-set rent
    for (let j = 2; j < r.length; j++) r[j] = Math.max(r[j], r[j - 1] + 5);
    cfg.rents[c.id] = r;
    prev = r;
  }
  cfg.routeRent = base.routeRent.map((x) => r5(x * (mult.routes ?? 1)));
  cfg.serviceTimes = base.serviceTimes.map((x) => Math.max(2, Math.round(x * (mult.services ?? 1))));
  cfg.end = { kind: "target", amount: target };
  return cfg;
}

if (process.argv[1]?.endsWith("tune.ts")) {
  const t0 = Date.now();
  const mult: Mult = Object.fromEntries([...GROUPS.map((g) => [String(g.id), 1]), ["routes", 1], ["services", 1]]);
  // rents are balanced at the length real games run (step 2's $7,000 games ran twice as long)
  let target = Number(process.env.TARGET0 ?? 3500);
  const history: unknown[] = [];

  // 1. rents: even out what each group earns per dollar
  for (let it = 0; it < 8; it++) {
    const s = summarize(run(configWith(mult, target), 4, GAMES, balanced(4), 1 + it * 100_000), 4);
    const rois = Object.values(s.groupRoi);
    const mid = [...rois].sort((a, b) => a - b)[Math.floor(rois.length / 2)];
    history.push({ step: `rents ${it}`, minutes: s.minutes.mean, roi: s.groupRoi, mult: { ...mult } });
    console.log(`rents ${it}: ${s.minutes.mean.toFixed(1)} min, roi`, Object.entries(s.groupRoi).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" "));
    const spread = Math.max(...rois) / Math.min(...rois);
    if (spread < 1.35) break;
    // pricier groups may earn a little less per dollar (they still bring in the biggest rents)
    for (const [k, roi] of Object.entries(s.groupRoi)) {
      const want = mid * Math.pow((AVG[k] ?? AVG_ALL) / AVG_ALL, -SLOPE);
      mult[k] = Math.min(Number(process.env.CAP ?? 2.2), Math.max(0.5, mult[k] * Math.min(1.5, Math.max(0.7, Math.pow(want / roi, 0.6)))));
    }
  }

  // 2. the target: about 40 minutes with four players
  for (let it = 0; it < 8; it++) {
    const s = summarize(run(configWith(mult, target), 4, GAMES, balanced(4), 7 + it * 77_777), 4);
    history.push({ step: `target ${it}`, target, minutes: s.minutes });
    console.log(`target $${target}: ${s.minutes.mean.toFixed(1)} min (p10 ${s.minutes.p10.toFixed(0)}, p90 ${s.minutes.p90.toFixed(0)}), ${s.rounds.mean.toFixed(1)} rounds`);
    if (Math.abs(s.minutes.mean - 40) < 2.5) break;
    target = Math.round((target * Math.pow(40 / s.minutes.mean, 0.9)) / 250) * 250;
  }

  const cfg = configWith(mult, target);
  console.log("mult", JSON.stringify(mult), "target", target, "ms", Date.now() - t0);
  if (OUT) writeFileSync(OUT, JSON.stringify({ mult, target, rents: cfg.rents, routeRent: cfg.routeRent, serviceTimes: cfg.serviceTimes, history }, null, 1));
}

export { balanced, mixed };
export type { Style };
