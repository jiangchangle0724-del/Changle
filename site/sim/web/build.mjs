/**
 * Builds the step 3 verify page: one HTML file with the rules engine, computer players and the
 * simulation inside, plus the report's own numbers to compare against.
 *
 *   node sim/web/build.mjs [out.html]
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, "../out/verify.html");

const r = await build({
  entryPoints: [join(here, "entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "TripSim",
  platform: "browser",
  target: "es2019",
  minify: true,
  write: false,
  define: { "process.argv": "[]", "process.env": "{}" },
  plugins: [
    {
      // the simulation's command-line parts write files; a browser has none
      name: "no-node",
      setup(b) {
        b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const writeFileSync = () => {}; export const readFileSync = () => '';", loader: "js" }));
      },
    },
  ],
});
const engine = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// the report's runs, with the seeds that made them, so the page can say whether a rerun matches
const f = JSON.parse(readFileSync(join(here, "../out/final.json"), "utf8"));
const rates = (by) => Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.rate]));
const report = [
  { n: 4, mode: "target", styles: "balanced", games: 3000, seed: 10000, minutes: f.main.minutes.mean, p10: f.main.minutes.p10, p90: f.main.minutes.p90, rounds: f.main.rounds.mean, seat: f.main.seat },
  ...f.sizes
    .filter((s) => s.n !== 4)
    .map((s) => ({ n: s.n, mode: "target", styles: "balanced", games: 1000, seed: 30000 + s.n * 1000, minutes: s.minutes.mean, p10: s.minutes.p10, p90: s.minutes.p90, rounds: s.rounds.mean, seat: s.seat })),
  { n: 4, mode: "target", styles: "mixed", games: 3000, seed: 40000, styleRates: rates(f.styles4) },
  { n: 6, mode: "target", styles: "mixed", games: 1000, seed: 50000, styleRates: rates(f.styles6) },
  ...f.timed.map((t) => ({ n: t.n, mode: t.minutes, styles: "balanced", games: 1000, seed: 80000 + t.minutes * 100 + t.n, minutes: t.simMinutes, seat: t.seat })),
];

const page = readFileSync(join(here, "verify.html"), "utf8")
  .replace("/*__ENGINE__*/", () => engine)
  .replace("/*__REPORT__*/[]", () => JSON.stringify(report));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out}: ${(page.length / 1024).toFixed(0)} KB (engine ${(engine.length / 1024).toFixed(0)} KB, ${f.games} report games)`);
