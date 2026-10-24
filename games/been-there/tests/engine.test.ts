// The recovered engine must reproduce the step-3 report to the last decimal place.
// tests/fixtures/report.json is the REPORT table embedded in the 模拟验证 page.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRun, type RunOptions } from "../src/engine/sim";

interface Preset extends RunOptions {
  minutes?: number;
  rounds?: number;
  seat?: number[];
  styleRates?: Record<string, number>;
}

const REPORT: Preset[] = JSON.parse(readFileSync(new URL("./fixtures/report.json", import.meta.url), "utf8"));

for (const p of REPORT) {
  test(`report preset: ${p.n} teams, ${p.mode}, ${p.styles}, ${p.games} games, seed ${p.seed}`, () => {
    const run = createRun(p);
    run.step(p.games);
    const res = run.summary();
    if (p.minutes !== undefined) assert.equal(res.minutes.mean, p.minutes, "average minutes");
    if (p.rounds !== undefined) assert.equal(res.rounds.mean, p.rounds, "average rounds");
    if (p.seat) assert.deepEqual(res.seat, p.seat, "win rate by seat");
    if (p.styleRates) for (const [style, rate] of Object.entries(p.styleRates)) assert.equal(res.byStyle[style].rate, rate, style);
  });
}
