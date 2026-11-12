#!/usr/bin/env node
// npm run play in another terminal; npm run perf -- --cpu-throttle 4
// Headed, installed Chrome and hardware WebGL are required. No CI / software-renderer numbers.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let throttle = 1;
for (let i = 0; i < args.length; i++) {
  assert.equal(args[i], '--cpu-throttle', `Unknown argument: ${args[i]}`);
  throttle = Number(args[++i]);
  assert(Number.isFinite(throttle) && throttle >= 1, '--cpu-throttle requires a number >= 1');
}
assert(!process.env.CI, 'Run perf on a local GPU, outside CI.');
const BASE = process.env.PLAY_BASE ?? 'http://127.0.0.1:5173';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = await mkdtemp(join(tmpdir(), 'hang-on-perf-'));
const pw = await import(process.env.PLAYWRIGHT ?? 'playwright');
const { chromium } = pw.default ?? pw;
const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const rows = [];
let metadata;
console.log(`Artifacts: ${out}`);
try {
  const browserCDP = await browser.newBrowserCDPSession();
  const gpu = await browserCDP.send('SystemInfo.getInfo');
  metadata = { at: new Date().toISOString(), node: process.version, os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model, browser: browser.version(), cpuThrottle: throttle,
    viewport: '1280x720 @1x', gpu: gpu.gpu.devices, features: gpu.gpu.featureStatus,
    measurement: 'requestAnimationFrame(frame) synchronous work: input + simulation + events + camera + Pixi draw + HUD; excludes vsync wait and asynchronous GPU completion' };
  console.log(JSON.stringify(metadata, null, 2));
  for (let n = 1; n <= 12; n++) {
    const id = `${n <= 6 ? 'table' : 'van'}-${String(n).padStart(2, '0')}`;
    const replay = JSON.parse(await readFile(join(root, 'levels', 'replays', `${id}.json`), 'utf8'));
    assert.equal(replay.level, id);
    assert.equal(replay.players, 4);
    assert(replay.frames.length > 0 && replay.dt > 0);
    assert(replay.frames.every(f => f.length === 4));
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      // Gate the real page loop until textures are warm and the replay is installed. No page files change.
      await page.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => {
          const tick = now => {
            if (callback.name !== 'frame') { callback(now); return; }
            const p = window.__perf;
            if (!p?.active) { raf(tick); return; }
            if (p.done) return;
            // First callback consumes the warmup wall-clock gap with physics gated off.
            if (!p.primed) { callback(now); p.primed = true; return; }
            const start = performance.now();
            callback(now);
            const elapsed = performance.now() - start;
            p.samples.push(elapsed);
            if (window.hangOn.sim.won || p.steps * window.hangOn.CFG.step >= p.duration - 1e-8) p.done = true;
          };
          return raf(tick);
        };
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await page.goto(`${BASE}/hang-on/play.html?level=${id}&players=4`);
      await page.waitForFunction(() => window.hangOn?.sim && window.hangOn?.stage);
      const renderer = await page.evaluate(() => {
        const canvas = document.getElementById('stage');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return 'NO WEBGL';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      });
      assert(!/swiftshader|llvmpipe|software|basic render|NO WEBGL/i.test(renderer), `Hardware WebGL required: ${renderer}`);
      console.log(`${id}: renderer ${renderer}`);
      // Draw the pristine scene for shader/texture warmup without advancing the simulation.
      await page.evaluate(async () => {
        const h = window.hangOn;
        for (let i = 0; i < 90; i++) {
          h.stage.updateCamera(h.sim, 1 / 60);
          h.stage.draw(h.sim, 1 / 60);
          await new Promise(resolve => setTimeout(resolve, 16));
        }
        h.stage.reset();
      });
      await page.evaluate(replay => {
        const h = window.hangOn;
        const step = h.sim.step.bind(h.sim);
        const p = window.__perf = { active: true, primed: false, done: false, steps: 0, samples: [], duration: replay.frames.length * replay.dt };
        h.sim.step = dt => {
          if (!p.primed) return;
          const index = Math.floor((p.steps * h.CFG.step + 1e-8) / replay.dt);
          if (h.sim.won || index >= replay.frames.length) return;
          replay.frames[index].forEach((input, player) => h.sim.setInput(player, input));
          step(dt);
          p.steps++;
        };
      }, replay);
      await page.waitForFunction(() => window.__perf.done, null, { timeout: Math.max(60000, replay.frames.length * replay.dt * 5000), polling: 250 });
      const result = await page.evaluate(() => ({ samples: window.__perf.samples, won: hangOn.sim.won,
        seconds: hangOn.sim.time, deaths: hangOn.sim.players.map(p => p.deaths), steps: window.__perf.steps }));
      assert.deepEqual(errors, [], `${id}: page errors`);
      assert(result.won, `${id}: replay did not win at ${result.seconds}s`);
      assert(result.samples.length >= 60, `${id}: too few frames`);
      const sorted = [...result.samples].sort((a, b) => a - b);
      const percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
      const row = { id, frames: sorted.length, p50: percentile(0.5), p95: percentile(0.95), worst: sorted.at(-1),
        won: result.won, seconds: result.seconds, deaths: result.deaths, renderer };
      rows.push(row);
      await writeFile(join(out, `${id}.json`), JSON.stringify({ ...row, samples: result.samples }, null, 2));
      // Native canvas histogram: separate document, outside the measured callback.
      await page.goto('about:blank');
      await page.setContent('<canvas width="1000" height="560"></canvas>');
      await page.evaluate(({ row, samples, throttle }) => {
        const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
        ctx.fillStyle = '#101c30'; ctx.fillRect(0, 0, 1000, 560);
        ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif';
        ctx.fillText(`Hang On | ${row.id} | CPU ${throttle}x | ${row.frames} frames`, 45, 38);
        ctx.font = '17px sans-serif';
        ctx.fillText(`p50 ${row.p50.toFixed(2)} ms   p95 ${row.p95.toFixed(2)} ms   worst ${row.worst.toFixed(2)} ms`, 45, 70);
        const bins = Array(30).fill(0), max = Math.max(20, Math.ceil(row.worst));
        for (const x of samples) bins[Math.min(29, Math.floor(x / max * 30))]++;
        const peak = Math.max(...bins);
        for (let i = 0; i < 30; i++) {
          const height = bins[i] / peak * 340;
          ctx.fillStyle = '#8ec5e8'; ctx.fillRect(60 + i * 29, 440 - height, 26, height);
        }
        ctx.fillStyle = '#fff'; ctx.fillText(`Count (peak ${peak})`, 60, 94);
        for (let i = 0; i <= 5; i++) ctx.fillText((max * i / 5).toFixed(1), 60 + i * 174, 475);
        ctx.fillText('Synchronous frame work (ms), 30 equal-width bins', 240, 520);
      }, { row, samples: result.samples, throttle });
      await page.locator('canvas').screenshot({ path: join(out, `${id}.png`) });
      console.log(`| ${id} | ${row.frames} | ${row.p50.toFixed(2)} | ${row.p95.toFixed(2)} | ${row.worst.toFixed(2)} | ${row.seconds.toFixed(2)} | YES |`);
    } finally { await context.close(); }
  }
  const table = ['| Level | Frames | p50 ms | p95 ms | Worst ms | Replay seconds | Won |',
    '| --- | ---: | ---: | ---: | ---: | ---: | :---: |',
    ...rows.map(r => `| ${r.id} | ${r.frames} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.worst.toFixed(2)} | ${r.seconds.toFixed(2)} | YES |`) ].join('\n');
  await writeFile(join(out, 'summary.json'), JSON.stringify({ metadata, rows }, null, 2));
  await writeFile(join(out, 'summary.md'), table + '\n');
  console.log(`\n${table}\nperf: 12/12 replays won; histograms and raw samples: ${out}`);
} finally { await browser.close(); }
