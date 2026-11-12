#!/usr/bin/env node
// C1 content checks and replays. The game's own simulation (src/physics) is bundled, never patched.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const levelsDir = join(root, 'levels');
const docsDir = resolve(root, '../../docs/levels');
const ids = Array.from({ length: 12 }, (_, i) => `${i < 6 ? 'table' : 'van'}-${String(i + 1).padStart(2, '0')}`);
const materials = new Set(['cloth', 'wood', 'ceramic', 'metal', 'noodle', 'ice']);
const temporary = await mkdtemp(join(tmpdir(), 'hang-on-levels-'));
const readJSON = async (path) => JSON.parse(await readFile(path, 'utf8'));
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const point = (p) => assert(p && finite(p.x) && finite(p.y), 'invalid point');
function rectangle(r) {
  point(r);
  assert(finite(r.w) && r.w > 0 && finite(r.h) && r.h > 0, 'invalid rectangle');
}
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function validate(level, replay, id) {
  assert.equal(level.id, id);
  assert.equal(level.world, id.startsWith('table') ? 'table' : 'van');
  assert(level.name?.zh && level.name.en && level.teaches, 'missing bilingual name / lesson');
  assert(finite(level.w) && level.w > 0 && finite(level.h) && level.h > 0);
  point(level.spawn);
  rectangle(level.goal);
  assert(finite(level.deathY) && level.deathY > level.spawn.y);
  assert(level.par.seconds >= 60 && level.par.seconds <= 180, 'par must be 1–3 minutes');
  assert(Number.isInteger(level.par.deathsPerPlayer) && level.par.deathsPerPlayer >= 0);
  assert.equal(level.replay, `replays/${id}.json`);
  // A3 implements cookie platforms (fading) and candle springs: allowed, but they must be well formed.
  for (const f of level.fading ?? []) {
    for (const k of ['on', 'off', 'phase']) assert(f[k] === undefined || (finite(f[k]) && f[k] >= 0), `${id}: fading ${k} must be a number of seconds`);
  }
  for (const sp of level.springs ?? []) assert(sp.power === undefined || (finite(sp.power) && sp.power > 0), `${id}: spring power must be positive`);
  assert(Array.isArray(level.rects) && level.rects.length > 0);
  // Cookies and candles have their own look; their material only sets friction, so it may be left out.
  const boxes = [...level.rects, ...(level.crates ?? []), ...[...(level.fading ?? []), ...(level.springs ?? [])].map((b) => ({ material: 'wood', ...b }))];
  for (const saw of level.seesaws ?? []) {
    point(saw.pivot);
    assert(materials.has(saw.material));
    boxes.push({ x: saw.pivot.x - saw.w / 2, y: saw.pivot.y - (saw.h ?? 14) / 2, w: saw.w, h: saw.h ?? 14, material: saw.material });
  }
  for (const box of boxes) {
    rectangle(box);
    assert(materials.has(box.material), `unknown material ${box.material}`);
  }
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    assert(!overlaps(boxes[a], boxes[b]), `${id}: platforms ${a} and ${b} overlap at spawn`);
  }
  for (const rope of level.ropes ?? []) {
    point(rope.anchor);
    assert(Number.isInteger(rope.segments) && rope.segments > 0 && finite(rope.segLen) && rope.segLen > 0);
  }
  for (const cp of level.checkpoints ?? []) point(cp);
  if (id === 'van-11') assert(level.rects.every((r) => r.material === 'ice'));
  assert.equal(replay.level, id);
  assert.equal(replay.players, 4, 'every replay must exercise all four players');
  assert.equal(replay.dt, 1 / 60);
  assert(Array.isArray(replay.frames) && replay.frames.length > 0);
  assert(replay.frames.length * replay.dt <= level.par.seconds * 2 + replay.dt);
  replay.frames.forEach((frame, f) => {
    assert.equal(frame.length, 4, `${id} frame ${f}: missing controller`);
    frame.forEach((input) => {
      assert.equal(input.seq, f);
      assert.equal(input.t, Math.round(f * 1000 / 60));
      assert(finite(input.ax) && Math.abs(input.ax) <= 1 && finite(input.ay) && Math.abs(input.ay) <= 1);
      assert.equal(typeof input.gl, 'boolean');
      assert.equal(typeof input.gr, 'boolean');
      assert(input.act === undefined || input.act === 'summon' || input.act === 'emote');
    });
  });
}

// Inspect real grips and release velocity while runReplay supplies the original inputs.
async function inspect(createSim, runReplay, level, replay) {
  const sim = await createSim(level, 4);
  const step = sim.step.bind(sim);
  const evidence = { chainSeconds: 0, throws: 0, ropeGrabs: 0, propGrabs: 0, maxTilt: 0 };
  sim.step = (dt) => {
    const before = sim.players.map((p) => p.arms.map((a) => a.grip && ({ kind: a.grip.kind, player: a.grip.player })));
    const velocities = sim.players.map((p) => ({ ...p.body }));
    step(dt);
    const chained = sim.players.some((p) => !p.dead && !p.ground && p.arms.some((a) => a.grip?.kind === 'player' &&
      !sim.players[a.grip.player].ground && sim.players[a.grip.player].arms.some((b) => b.grip?.kind === 'terrain' || b.grip?.kind === 'rope')));
    if (chained) evidence.chainSeconds += dt;
    sim.players.forEach((p, i) => p.arms.forEach((a, j) => {
      const old = before[i][j];
      if (old?.kind === 'player' && !a.grip) {
        const v = velocities[old.player];
        // A throw releases a teammate flying right and upward toward the pit.
        if (v.x > level.spawn.x + 50 && v.vx > 150 && v.vy < -100) evidence.throws++;
      }
    }));
    for (const e of sim.events) if (e.type === 'grab') {
      if (e.kind === 'rope') evidence.ropeGrabs++;
      if (e.kind === 'prop') evidence.propGrabs++;
    }
    for (const prop of sim.props) if (prop.kind === 'seesaw') evidence.maxTilt = Math.max(evidence.maxTilt, Math.abs(prop.angle));
    assert(sim.players.every((p) => Object.values(p.body).every(finite)), 'non-finite physics state');
  };
  try {
    return { result: await runReplay(level, replay, sim), evidence };
  } finally {
    sim.destroy();
  }
}

// A browser view for reviewing the exact JSON with the game's own Pixi stage (A3), painted backgrounds included.
const browserSource = `
import {createSim} from './src/physics/world';
import {Stage} from './src/render/stage';
const id=new URL(location.href).searchParams.get('id')||'table-01';
const level=await (await fetch('/levels/'+id)).json();
const replay=await (await fetch('/replays/'+id)).json();
const sim=await createSim(level,4), canvas=document.querySelector('canvas');
const stage=await Stage.create(canvas,{plates:{table:'/art/table-far.webp',van:'/art/van-far.webp'}});
stage.setLevel(level);stage.syncPlayers(sim);
const lessons={crawl:'抓地爬行 / Crawl',gap:'过缝 / Cross a gap',swing:'荡过筷子 / Swing',climb:'攀爬 / Climb',rope:'面条绳索 / Rope swing',chain:'两人成链 / Form a chain',door:'夹门翻越 / Door handles',balance:'浮筒平衡 / Balance',throw:'丢队友 / Toss a teammate',ice:'雨天快抓 / Rain grips',combine:'连续机关 / Combined route'};
document.querySelector('h1').textContent=id+' · '+level.name.zh+' · '+level.name.en;
document.querySelector('#lesson').textContent=lessons[level.teaches];
const marks=document.querySelector('#marks');
let frame=0,playing=false,last=performance.now();
function draw(dt){
 stage.cam.z=Math.min((innerWidth-80)/level.w,(innerHeight-160)/level.h);
 stage.cam.x=level.w/2;stage.cam.y=level.h/2-20/stage.cam.z;stage.cam.shake=0;
 stage.draw(sim,dt);
 marks.replaceChildren(...level.rects.filter(r=>r.grab===false).map(r=>{
  const p=stage.toScreen(r),z=stage.cam.z,el=document.createElement('div');
  el.className='mark';el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.width=r.w*z+'px';el.style.height=r.h*z+'px';
  el.textContent='只能站 · 不能抓 / Stand only';return el;
 }));
 document.querySelector('#status').textContent=frame===0?'出生位置 · 全关视图 / Spawn · full level':sim.time.toFixed(2)+' s · '+sim.players.map(p=>'P'+(p.id+1)+': '+p.deaths).join(' / ')+' · '+(sim.won?'全员到达 / All reached':'回放 / Replay');
}
document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'暂停 / Pause':'回放 / Play';};
document.querySelector('#reset').onclick=()=>location.reload();
document.querySelector('select').value=id;
document.querySelector('select').onchange=e=>location.search='?id='+e.target.value;
addEventListener('resize',()=>stage.resize());
let drawn=0;const t0=performance.now();
function tick(now){
 const dt=Math.min(0.05,(now-last)/1000);last=now;
 if(playing&&frame<replay.frames.length&&!sim.won){replay.frames[frame++].forEach((v,i)=>sim.setInput(i,v));sim.step(replay.dt);stage.handleEvents(sim,sim.events);}
 draw(dt);
 // 远景画加载后要半秒才显出来：画够 40 帧、过了 1.5 秒才算准备好（截图用）
 if(++drawn>=40&&now-t0>1500)window.ready=true;
 requestAnimationFrame(tick);
}
window.levelReview={sim,replay,stage};requestAnimationFrame(tick);
`;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Hang On · Level Review</title><link rel="stylesheet" href="/tokens.css">
<style>*{box-sizing:border-box}html,body{height:100%}body{margin:0;overflow:hidden;background:var(--color-bg);color:var(--color-text);font-family:var(--font-text);font-size:var(--text-sm);line-height:var(--leading)}canvas{position:fixed;inset:0;width:100vw;height:100vh;display:block}#marks{position:fixed;inset:0;pointer-events:none}.mark{position:absolute;border:2px dashed var(--color-warning);color:var(--color-text);display:grid;place-items:start center;padding-top:var(--space-2);text-align:center;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.6)}header{position:fixed;top:var(--space-4);left:var(--space-8);right:var(--space-8);display:flex;align-items:center;justify-content:space-between;text-shadow:0 1px 3px rgba(0,0,0,.6)}h1{font-size:var(--text-xl);line-height:var(--leading-tight);margin:0 0 var(--space-2)}p{margin:0;color:var(--color-text-2)}footer{position:fixed;bottom:var(--space-6);left:var(--space-8);right:var(--space-8);display:flex;justify-content:space-between;text-shadow:0 1px 3px rgba(0,0,0,.6)}button,select{min-height:var(--tap-crowded);background:var(--color-sheet);color:var(--color-text);border:1px solid var(--color-line);border-radius:var(--r-small);padding:var(--space-2);font:inherit}#status{max-width:720px;font-variant-numeric:tabular-nums}nav{display:flex;gap:var(--space-2)}</style>
<canvas></canvas><div id="marks"></div><header><div><h1></h1><p id="lesson"></p></div><nav><select aria-label="关卡 / Level">${ids.map((id) => `<option>${id}</option>`).join('')}</select><button id="play">回放 / Play</button><button id="reset">重置 / Reset</button></nav></header><footer><span id="status"></span><span>左手蓝 / Left blue · 右手橙 / Right orange</span></footer><script type="module" src="/app.js"></script></html>`;

async function serve(entries, screenshot) {
  const bundle = await build({ stdin: { contents: browserSource, resolveDir: root }, bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
  const tokens = await readFile(resolve(root, '../../site/src/styles/tokens.css'));
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
    else if (path === '/tokens.css') { res.setHeader('Content-Type', 'text/css'); res.end(tokens); }
    else if (path === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (/^\/art\/(table|van)-far\.webp$/.test(path)) {
      readFile(resolve(root, path.slice(1))).then((data) => { res.setHeader('Content-Type', 'image/webp'); res.end(data); }, () => { res.writeHead(404); res.end(); });
    }
    else {
      const match = /^\/(levels|replays)\/(table-0[1-6]|van-(?:0[7-9]|1[0-2]))$/.exec(path);
      const entry = match && entries.find((e) => e.level.id === match[2]);
      if (!entry) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(match[1] === 'levels' ? entry.level : entry.replay));
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  if (!screenshot) {
    console.log(`Review: ${url} (Ctrl+C to stop)`);
    await new Promise((ok) => process.once('SIGINT', ok));
    server.close();
    return;
  }
  let browser;
  try {
    let playwright;
    const candidates = [process.env.HANG_ON_PLAYWRIGHT, ...process.env.PATH.split(delimiter).filter((p) => /[\\/]\.bin$/.test(p)).map((p) => join(p, '../playwright'))].filter(Boolean);
    for (const candidate of candidates) {
      try { playwright = createRequire(import.meta.url)(candidate); break; } catch { /* try next npm-exec path */ }
    }
    assert(playwright, 'Use npm exec --yes --package=playwright -- node scripts/run-levels.mjs --screenshots (and install Chromium), or set HANG_ON_PLAYWRIGHT to its module path.');
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    for (const { level } of entries) {
      await page.goto(`${url}/?id=${level.id}`);
      await page.waitForFunction(() => window.ready === true);
      await page.screenshot({ path: join(docsDir, `${level.id}.png`) });
      console.log(`Screenshot: docs/levels/${level.id}.png (1280×720, spawn)`);
    }
  } finally {
    await browser?.close();
    await new Promise((ok) => server.close(ok));
  }
}

try {
  const files = (await readdir(levelsDir)).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(files, ids.map((id) => `${id}.json`).sort(), 'expected exactly the twelve contracted levels');
  const replayFiles = (await readdir(join(levelsDir, 'replays'))).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(replayFiles, files, 'each level needs its own replay');
  const entry = join(temporary, 'physics.mjs');
  await build({ stdin: { contents: "export {createSim} from './src/physics/world'; export {runReplay} from './src/physics/replay';", resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile: entry, logLevel: 'silent' });
  const { createSim, runReplay } = await import(pathToFileURL(entry).href);
  const entries = [];
  console.log('| Level | Seconds | P1 deaths | P2 deaths | P3 deaths | P4 deaths | All reached | Par ratio |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | :---: | ---: |');
  for (const id of ids) {
    const level = await readJSON(join(levelsDir, `${id}.json`));
    const replay = await readJSON(join(levelsDir, 'replays', `${id}.json`));
    validate(level, replay, id);
    const { result, evidence } = await inspect(createSim, runReplay, level, replay);
    const ratio = result.seconds / level.par.seconds;
    console.log(`| ${id} | ${result.seconds.toFixed(2)} | ${result.deaths.join(' | ')} | ${result.won ? 'YES' : 'NO'} | ${ratio.toFixed(3)} |`);
    assert(result.won, `${id}: replay did not reach the goal: ${JSON.stringify(result.final)}`);
    assert(ratio >= 0.5 && ratio <= 2, `${id}: time outside par × [0.5, 2]`);
    assert(result.deaths.every((d) => d <= level.par.deathsPerPlayer * 4), `${id}: too many deaths`);
    if (id === 'table-06') assert(evidence.chainSeconds >= 0.25, 'level 6 must actually hang as a chain');
    if (id === 'van-10') assert(evidence.throws >= 2, 'level 10 must release flying teammates');
    if (id === 'table-05' || id === 'van-12') assert(evidence.ropeGrabs > 0, `${id}: rope was bypassed`);
    if (id === 'van-09' || id === 'van-12') assert(evidence.propGrabs > 0 && evidence.maxTilt > 0.05, `${id}: seesaw was bypassed`);
    entries.push({ level, replay, result, evidence });
  }
  for (const { level, replay, evidence } of entries.filter((e) => ['table-06', 'van-10'].includes(e.level.id))) {
    // Replay each recorded controller alone, without moving spawn or injecting state.
    for (let player = 0; player < 4; player++) {
      const solo = { ...replay, players: 1, frames: replay.frames.map((f) => [f[player]]) };
      assert.equal((await runReplay(level, solo)).won, false, `${level.id}: P${player + 1} solo bypass`);
    }
    console.log(`${level.id}: solo projections 0/4 cleared; chain=${evidence.chainSeconds.toFixed(2)}s, throws=${evidence.throws}`);
  }
  // PNG dimensions are checked without a new dependency; screenshots are part of the deliverable.
  if (!process.argv.includes('--screenshots')) for (const id of ids) {
    const png = await readFile(join(docsDir, `${id}.png`));
    assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 720);
  }
  if (process.argv.includes('--screenshots') || process.argv.includes('--serve')) await serve(entries, process.argv.includes('--screenshots'));
  console.log('levels: 12/12 PASS; geometry, materials, four pads/frame, par, deaths, mechanics and solo controls PASS');
} catch (error) {
  console.error(`levels: FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  assert.equal(dirname(temporary), resolve(tmpdir()));
  assert(basename(temporary).startsWith('hang-on-levels-'));
  await rm(temporary, { recursive: true, force: true });
}
