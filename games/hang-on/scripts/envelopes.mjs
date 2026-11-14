#!/usr/bin/env node
// 红包（A9b）：给每关挑 3 个藏红包的地方，写进 levels/<id>.json 的 envelopes。
//
// 从这关的四人回放里挑：跑一遍回放，每 0.1 秒记下每个活着的人两只手在哪（之后 1.5 秒内摔死的不算），
// 把回放按时间切成三段，每段挑一个「离脚下的台面最高」的手的位置（同样高的挑离大家远的）：
// 有人挂在边上、荡上去、伸手够到过的地方，够得着，但站在路上拿不到，得特意去够。
// 离出生点、检查点、终点、别的红包太近的不要，碰到台子的往外挪，挨着要命的东西的不要。
//
// 用法：npm run envelopes            挑所有闯关的关（levels/*.json），已经有的重挑
//       npm run envelopes -- table-02  只挑这几关
// 回放或关卡改了以后重跑一遍；`npm run levels` 会查每个红包回放里都有人拿到过。
import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const tmp = await mkdtemp(join(tmpdir(), 'hang-on-env-'));
const entry = join(tmp, 'physics.mjs');
await build({
  stdin: { contents: "export {createSim} from './src/physics/world'; export {CFG} from './src/physics/config';", resolveDir: root },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: entry,
  logLevel: 'silent',
});
const { createSim, CFG } = await import(pathToFileURL(entry).href);

/** 离这些地方太近的不要（一出生就拿到、复活就拿到，没意思）。 */
const AWAY = 160;
/** 三个红包彼此至少隔多远。 */
const APART = 360;

function inRect(p, r, pad) {
  return p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;
}

/** 碰到台子（含饼干、蜡烛）的往上挪到台面外面；挪不出去（台子很高）的不要。 */
function clear(level, p) {
  const boxes = [...level.rects, ...(level.fading ?? []), ...(level.springs ?? [])];
  const pad = CFG.envelopeR + 4;
  let q = { ...p };
  for (let k = 0; k < 6; k++) {
    const hit = boxes.find((r) => inRect(q, r, pad));
    if (!hit) return q;
    q = { x: q.x, y: hit.y - pad - 1 };
    if (Math.abs(q.y - p.y) > 40) return null;
  }
  return null;
}

/** p 正下方最近的台面（台子、饼干、蜡烛的顶）；底下没有就是死线。 */
function floorBelow(level, p) {
  let best = level.deathY;
  for (const r of [...level.rects, ...(level.fading ?? []), ...(level.springs ?? [])]) {
    if (p.x >= r.x && p.x <= r.x + r.w && r.y >= p.y && r.y < best) best = r.y;
  }
  return best;
}

function hazardNear(level, p) {
  const pad = CFG.envelopeR + 30;
  return (level.hazards ?? []).some((h) => inRect(p, h, pad));
}

async function pick(level, replay) {
  const sim = await createSim({ ...level, envelopes: undefined }, replay.players);
  const samples = [];
  const deaths = [];
  const every = Math.max(1, Math.round(0.1 / replay.dt));
  replay.frames.forEach((frame, f) => {
    if (sim.won) return;
    frame.forEach((input, i) => sim.setInput(i, input));
    sim.step(replay.dt);
    for (const ev of sim.events) if (ev.type === 'death') deaths.push({ player: ev.player, t: sim.time });
    if (f % every) return;
    const alive = sim.players.filter((p) => !p.dead && !p.done);
    if (alive.length < 2) return;
    const cx = alive.reduce((s, p) => s + p.body.x, 0) / alive.length;
    const cy = alive.reduce((s, p) => s + p.body.y, 0) / alive.length;
    for (const p of alive) for (const arm of p.arms) samples.push({ t: sim.time, player: p.id, x: arm.hand.x, y: arm.hand.y, cx, cy });
  });
  const T = sim.time;
  sim.destroy();
  const safe = samples.filter((s) => !deaths.some((d) => d.player === s.player && d.t >= s.t && d.t - s.t < 1.5));
  const marks = [level.spawn, ...(level.checkpoints ?? []), { x: level.goal.x + level.goal.w / 2, y: level.goal.y + level.goal.h / 2 }];
  const chosen = [];
  // 先只要站着够不到的（离台面 110 以上）；平地关挑不够三个的，再放宽到 60、30
  for (const minH of [110, 60, 30]) {
    for (let band = 0; band < 3 && chosen.length < 3; band++) {
      if (chosen.some((c) => c.band === band)) continue;
      const got = bestIn(band, minH);
      if (got) chosen.push(got);
    }
  }
  chosen.sort((a, b) => a.band - b.band);
  return chosen.map(({ x, y }) => ({ x, y }));

  function bestIn(band, minH) {
    let best = null;
    for (const s of safe) {
      if (s.t < (band * T) / 3 || s.t >= ((band + 1) * T) / 3) continue;
      const q = clear(level, s);
      if (!q || hazardNear(level, q)) continue;
      if (q.y > level.deathY - 120 || q.x < 40 || q.x > level.w - 40 || q.y < 40) continue;
      if (marks.some((m) => Math.hypot(m.x - q.x, m.y - q.y) < AWAY)) continue;
      if (chosen.some((c) => Math.hypot(c.x - q.x, c.y - q.y) < APART)) continue;
      // 离脚下的台面越高越好（站着伸手够不到的才算藏）；一样高的挑离大家远的；比大家低很多的不要（多半是往下掉）
      const h = floorBelow(level, q) - q.y;
      if (h < minH || q.y - s.cy > 80) continue;
      const score = Math.min(h, 360) + 0.3 * Math.hypot(q.x - s.cx, q.y - s.cy);
      if (!best || score > best.score) best = { ...q, score };
    }
    return best ? { x: Math.round(best.x), y: Math.round(best.y), band } : null;
  }
}

/** 按原来的键的顺序写回，envelopes 放在 checkpoints 后面（JSON 两格缩进，和原来一样）。 */
function withEnvelopes(level, envelopes) {
  const out = {};
  for (const [k, v] of Object.entries(level)) {
    if (k === 'envelopes') continue;
    out[k] = v;
    if (k === 'checkpoints') out.envelopes = envelopes;
  }
  if (!out.envelopes) out.envelopes = envelopes;
  return out;
}

const dir = join(root, 'levels');
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
let done = 0;
for (const f of files) {
  const id = f.replace(/\.json$/, '');
  if (only.length && !only.includes(id)) continue;
  const level = JSON.parse(await readFile(join(dir, f), 'utf8'));
  if (!level.replay) continue;
  const replay = JSON.parse(await readFile(join(dir, level.replay), 'utf8'));
  const envelopes = await pick(level, replay);
  if (envelopes.length < 3) console.warn(`${id}: 只挑到 ${envelopes.length} 个`);
  await writeFile(join(dir, f), `${JSON.stringify(withEnvelopes(level, envelopes), null, 2)}\n`);
  console.log(`${id}: ${envelopes.map((e) => `(${e.x}, ${e.y})`).join(' ')}`);
  done++;
}
await rm(tmp, { recursive: true, force: true });
console.log(`envelopes: ${done} 关`);
