// Re-run the step-3 report: npm run sim            (all 13 presets, 17,000 games)
//                         npm run sim -- 300     (only the first N games of each preset, quick look)
import { readFileSync } from "node:fs";
import { createRun, playMany, rotateStyles, sameStyle, summarize, type RunOptions } from "../src/engine/sim";
import { STYLES, defaultConfig } from "../src/engine";

const limit = Number(process.argv[2]) || Infinity;
const presets: (RunOptions & { minutes?: number; seat?: number[] })[] = JSON.parse(
  readFileSync(new URL("../tests/fixtures/report.json", import.meta.url), "utf8"),
);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
let total = 0;
const t0 = Date.now();
for (const p of presets) {
  const games = Math.min(p.games, limit);
  const run = createRun({ ...p, games });
  run.step(games);
  total += games;
  const r = run.summary();
  const styles = Object.entries(r.byStyle)
    .map(([k, v]) => `${k} ${pct(v.rate)}`)
    .join(", ");
  console.log(
    `${p.n} teams · ${p.mode === "target" ? "unlimited" : `${p.mode} min`} · ${p.styles} · ${games} games: ` +
      `${r.minutes.mean.toFixed(1)} min, seat 1 wins ${pct(r.seat[0])} (fair ${pct(1 / p.n)})` +
      (p.styles === "mixed" ? `; ${styles}` : ""),
  );
}
// City rules on vs off, as in the report's "城市规则和三种时长" section.
const games = Math.min(1000, limit);
const on = summarize(playMany(defaultConfig(4), 4, games, sameStyle(4, STYLES.balanced), 90000), 4);
const off = summarize(playMany({ ...defaultConfig(4), cityRules: false }, 4, games, sameStyle(4, STYLES.balanced), 90000), 4);
console.log(`city rules on: ${on.rounds.mean.toFixed(1)} rounds, ${on.minutes.mean.toFixed(1)} min; off: ${off.rounds.mean.toFixed(1)} rounds, ${off.minutes.mean.toFixed(1)} min`);
const rotated = summarize(playMany(defaultConfig(4), 4, games, rotateStyles(4), 50000), 4);
console.log(`rotating styles: ${Object.entries(rotated.byStyle).map(([k, v]) => `${k} ${pct(v.rate)}`).join(", ")}`);
console.log(`rule uses per game (4 teams): ${Object.entries(on.rulesPerGame).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}`);
console.log(`${total + games * 3} games in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
