#!/usr/bin/env node
// 乱按探路：一段一段地让 1 个人、2 个人乱按，看到不到得了下一个检查点。
//
//   npm run probe                   查所有大关（levels/team）：每关至少两段 1 个人和 2 个人乱按都过不去，而且不能只有第一段
//   npm run probe -- table-06 ...   只报告，不查规则（闯关、难关、大关的 id 都行）
//   --quick                         CI 用，少按几次：1 个人 60 次、2 个人 30 次（平时 200 次、100 次）
//   --tries N  --pairs N  --seconds S  --threads T
//   --trio N                        做关时参考：1、2 个人都过不去的段再让 3 个人乱按 N 次（不算规则，乱按不会配合，过不去也不说明什么）
//
// 一段：出生点到第一个检查点、一个检查点到下一个、最后一个检查点到终点。从这一段的起点出发（出生点每人错开 44 px，
// 检查点错开 30 px，和复活一样；摔了就在这一段的起点复活），乱按 S 秒（默认 60，一段最长也是 60 秒）：有一个人到了后面任何一个检查点
// （60 px 内）或者进了终点，这一段就算过得去。乱按是一串随手的动作：往右爬、往右上爬墙、往右扑、往左、随便按，
// 每个动作的时长和方向都抖一抖。过不去的段报乱按最远到了哪（x），看得出卡在哪。
//
// 乱按过不去不等于一定过不去，但乱按过得去的地方一定不是「要大家」的地方。量过的：第一版大关每一段一个人乱按
// 头几次就过去了（跷跷板旁边的墙一个人就爬得上去）；现有 12 关每一段一个人乱按都过得去（table-06 的高筷子第 59 次）；
// 墙面带电的墙 300 px 高两个人乱按过得去，400 px 高 1 个人、2 个人都过不去。
// 大关按 4、5、6 个人各自的摆法查（只是只放 1 个、2 个人进去）；别的关按放进去的人数摆。
// 种子固定：换机器、换几个线程，过得去还是过不去都一样。
import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const LISTS = ['rects', 'ropes', 'seesaws', 'crates', 'fading', 'springs', 'hazards', 'movers', 'spinners'];

// 一个 32 位的种子：每一次乱按只看「哪一关、哪一段、几个人、哪种摆法、第几次」，和线程怎么分无关
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [权重, 动作]：动作是几步 [帧数, 摇杆 x, 摇杆 y, 左手, 右手]
const MACROS = [
  [3, () => [[25, 0.6, 0.7, 0, 0], [45, 0.6, 0.15, 0, 1]]], // 往右爬：手伸到前下方，抓住往前拽
  [3, () => [[20, 0.6, -0.8, 0, 1], [30, 0.2, -1, 0, 1], [20, 0.6, -0.8, 1, 1], [10, 0.2, -1, 1, 0]]], // 往右上爬墙，两只手倒着抓
  [2, () => [[20, 0.6, 0.7, 1, 1], [25, 1, -0.4, 1, 1], [10, 1, -0.8, 0, 0]]], // 往右扑：抓着地往右上一甩就松手
  [1, () => [[25, -0.6, 0.7, 0, 0], [45, -0.6, 0.15, 1, 0]]], // 往左爬
  [1, () => [[20, -0.6, -0.8, 1, 0], [30, -0.2, -1, 1, 0], [20, -0.6, -0.8, 1, 1], [10, -0.2, -1, 0, 1]]], // 往左上爬
  [3, (r) => [[15 + Math.floor(r() * 30), r() * 2 - 1, r() * 2 - 1, r() < 0.5, r() < 0.5]]], // 随便按
];
const WEIGHT = MACROS.reduce((v, [w]) => v + w, 0);
const clamp1 = (v) => Math.max(-1, Math.min(1, v));
function macro(r) {
  let pick = r() * WEIGHT;
  const [, make] = MACROS.find(([w]) => (pick -= w) < 0) ?? MACROS[0];
  const steps = make(r);
  const reps = 1 + Math.floor(r() * 3);
  const frames = [];
  for (let k = 0; k < reps; k++)
    for (const [n, ax, ay, gl, gr] of steps) {
      const input = { ax: clamp1(ax + (r() - 0.5) * 0.4), ay: clamp1(ay + (r() - 0.5) * 0.4), gl: !!gl, gr: !!gr };
      const len = Math.max(3, Math.round(n * (0.7 + r() * 0.6)));
      for (let f = 0; f < len; f++) frames.push(input);
    }
  return frames;
}

// 一次乱按：过得去 ok 是 true；far 是这一次最远到的 x
async function attempt({ createSim, CFG }, job, k) {
  const r = mulberry32(hash(`${job.key}|${k}`));
  const sim = await createSim(job.level, job.players, { mode: 'team' });
  try {
    for (let i = 0; i < job.players; i++) sim.teleport(i, job.start.x + job.spread * i, job.start.y);
    sim.checkpoint = job.section - 1; // 摔了在这一段的起点复活
    const queues = Array.from({ length: job.players }, () => []);
    const g = job.goal;
    let far = -Infinity;
    for (let f = 0; f < 60 * job.seconds; f++) {
      for (let i = 0; i < job.players; i++) {
        if (!queues[i].length) queues[i] = macro(r);
        sim.setInput(i, queues[i].shift());
      }
      sim.step(1 / 60);
      for (const p of sim.players) {
        if (p.dead) continue;
        const { x, y } = p.body;
        far = Math.max(far, x);
        if (x > g.x && x < g.x + g.w && y > g.y && y < g.y + g.h) return { ok: true, far };
        if (job.targets.some((t) => Math.hypot(x - t.x, y - t.y) < CFG.checkpointR)) return { ok: true, far };
      }
    }
    return { ok: false, far };
  } finally {
    sim.destroy();
  }
}

if (!isMainThread) {
  const physics = await import(workerData.bundle);
  parentPort.on('message', async (job) => {
    let far = -Infinity;
    for (let k = job.from; k < job.to; k++) {
      const one = await attempt(physics, job, k);
      far = Math.max(far, one.far);
      if (one.ok) {
        parentPort.postMessage({ first: k, far });
        return;
      }
    }
    parentPort.postMessage({ first: -1, far });
  });
}

function pool(size, bundle) {
  const idle = [];
  const waiting = [];
  const workers = Array.from({ length: size }, () => new Worker(fileURLToPath(import.meta.url), { workerData: { bundle } }));
  idle.push(...workers);
  const acquire = () => (idle.length ? Promise.resolve(idle.pop()) : new Promise((ok) => waiting.push(ok)));
  const free = (w) => {
    const next = waiting.shift();
    if (next) next(w);
    else idle.push(w);
  };
  return {
    size,
    async run(job) {
      const w = await acquire();
      try {
        return await new Promise((ok, fail) => {
          const done = (m) => {
            w.off('error', broke);
            ok(m);
          };
          const broke = (e) => {
            w.off('message', done);
            fail(e);
          };
          w.once('message', done);
          w.once('error', broke);
          w.postMessage(job);
        });
      } finally {
        free(w);
      }
    },
    close: () => Promise.all(workers.map((w) => w.terminate())),
  };
}

// 分成小份给各个线程，谁先过得去就不再发新的。first 是过得去的那一次（-1 = 一次都过不去），far 是最远到的 x
async function probe(threads, task) {
  const chunk = 10;
  let next = 0;
  let first = -1;
  let far = -Infinity;
  await Promise.all(
    Array.from({ length: threads.size }, async () => {
      while (first < 0 && next < task.tries) {
        const from = next;
        next = Math.min(task.tries, next + chunk);
        const got = await threads.run({ ...task, from, to: next });
        far = Math.max(far, got.far);
        if (got.first >= 0 && (first < 0 || got.first < first)) first = got.first;
      }
    }),
  );
  return { first, far };
}

function fixedLayout(forPlayers, level, n) {
  const laid = forPlayers(level, n);
  const out = { ...laid };
  for (const key of LISTS) if (laid[key]) out[key] = laid[key].map(({ players, ...item }) => item);
  return out;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 给验收器用：探一组关，每关每段过不过得去。
 * entries: [{ level, team }]，team 为真按 4、5、6 个人的摆法查。
 * 返回 [{ id, team, sections: [{ index, from, to, team, layouts: [{ counts, one, two, three }] }], teamSections }]，
 * teamSections 是 1 个人、2 个人在每种摆法里都过不去的段（从 0 数，0 是出生点那段）。
 */
export async function probeLevels(entries, { solo = 200, pairs = 100, seconds = 60, trio = 0, threads: size = Math.max(1, Math.min(8, availableParallelism())), log = () => {} } = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'hang-on-probe-'));
  const bundle = join(temporary, 'physics.mjs');
  await build({
    stdin: {
      contents: "export {createSim} from './src/physics/world'; export {CFG} from './src/physics/config'; export {forPlayers} from './src/physics/level';",
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'silent',
  });
  const { forPlayers } = await import(pathToFileURL(bundle).href);
  const threads = pool(size, pathToFileURL(bundle).href);
  const said = (r, n) => (r === null ? '—' : r.first >= 0 ? `过得去（第 ${r.first + 1} 次）` : `0/${n}，最远 x=${Math.round(r.far)}`);
  log(`乱按探路：1 个人 ${solo} 次、2 个人 ${pairs} 次，每次 ${seconds} 秒，${size} 个线程`);
  log(`| Level | 摆法 | 段 | 从 → 到 | 1 个人 | 2 个人 | 要大家 |${trio ? ' 3 个人（参考） |' : ''}`);
  log(`| --- | --- | --- | --- | --- | --- | :---: |${trio ? ' --- |' : ''}`);
  const results = [];
  try {
    for (const { level, team } of entries) {
      // 大关按 4、5、6 个人各自的摆法；一样的摆法只查一次
      const layouts = [];
      if (team) {
        for (let n = 4; n <= 6; n++) {
          const laid = fixedLayout(forPlayers, level, n);
          const sig = JSON.stringify(LISTS.map((k) => laid[k] ?? []));
          const same = layouts.find((l) => l.sig === sig);
          if (same) same.counts.push(n);
          else layouts.push({ sig, laid, counts: [n] });
        }
      } else layouts.push({ laid: level, counts: [] });
      const cps = level.checkpoints ?? [];
      const starts = [{ ...level.spawn, spread: 44, name: '出生点' }, ...cps.map((c, i) => ({ ...c, spread: 30, name: `检查点 ${i + 1}` }))];
      const sections = starts.map((start, s) => ({
        index: s,
        from: { x: start.x, y: start.y },
        to: s < cps.length ? { x: cps[s].x, y: cps[s].y } : { x: level.goal.x + level.goal.w / 2, y: level.goal.y + level.goal.h / 2 },
        team: true,
        layouts: [],
      }));
      for (const { laid, counts } of layouts) {
        const layoutName = counts.length ? `${counts[0]}${counts.length > 1 ? `–${counts[counts.length - 1]}` : ''} 人` : '—';
        for (const section of sections) {
          const s = section.index;
          const start = starts[s];
          const task = { level: laid, section: s, start, spread: start.spread, targets: cps.slice(s), goal: level.goal, seconds };
          const one = await probe(threads, { ...task, players: 1, tries: solo, key: `${level.id}|${s}|1|${counts.join('')}` });
          const two = one.first >= 0 ? null : await probe(threads, { ...task, players: 2, tries: pairs, key: `${level.id}|${s}|2|${counts.join('')}` });
          const hard = one.first < 0 && two.first < 0;
          const three = hard && trio ? await probe(threads, { ...task, players: 3, tries: trio, key: `${level.id}|${s}|3|${counts.join('')}` }) : null;
          if (!hard) section.team = false;
          section.layouts.push({ counts, one, two, three });
          const toName = s < cps.length ? `检查点 ${s + 1}` : '终点';
          log(
            `| ${level.id} | ${layoutName} | ${s + 1} | ${start.name} (${Math.round(section.from.x)},${Math.round(section.from.y)}) → ${toName} (${Math.round(section.to.x)},${Math.round(section.to.y)}) | ${said(one, solo)} | ${said(two, pairs)} | ${hard ? '是' : '否'} |${trio ? ` ${said(three, trio)} |` : ''}`,
          );
        }
      }
      results.push({ id: level.id, team, sections, teamSections: sections.filter((x) => x.team).map((x) => x.index) });
    }
  } finally {
    await threads.close();
    await rm(temporary, { recursive: true, force: true });
  }
  return results;
}

/** 大关的规则：至少两段 1 个人、2 个人都过不去，而且不能只有第一段。返回说不过去的话，过了是 null。 */
export function teamProbeFailure({ id, teamSections }) {
  if (teamSections.length >= 2 && teamSections.some((s) => s > 0)) return null;
  const which = teamSections.length ? `（第 ${teamSections.map((s) => s + 1).join('、')} 段）` : '';
  return `${id}: 1 个人和 2 个人乱按都过不去的段只有 ${teamSections.length} 段${which}；大关要至少两段，而且不能只有第一段`;
}

async function main() {
  const levelsDir = join(root, 'levels');
  const teamDir = join(levelsDir, 'team');
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  const quick = args.includes('--quick');
  const options = {
    solo: flag('--tries', quick ? 60 : 200),
    pairs: flag('--pairs', quick ? 30 : 100),
    seconds: flag('--seconds', 60),
    trio: flag('--trio', 0),
    threads: flag('--threads', Math.max(1, Math.min(8, availableParallelism()))),
    log: (line) => console.log(line),
  };
  const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--quick'));
  const entries = [];
  if (ids.length) {
    for (const id of ids) {
      const team = await readFile(join(teamDir, `${id}.json`), 'utf8').catch(() => null);
      const text = team ?? (await readFile(join(levelsDir, `${id}.json`), 'utf8').catch(() => null));
      if (!text) throw new Error(`没有这一关：${id}`);
      entries.push({ level: JSON.parse(text), team: !!team });
    }
  } else {
    const files = (await readdir(teamDir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) entries.push({ level: JSON.parse(await readFile(join(teamDir, f), 'utf8')), team: true });
    if (!entries.length) {
      console.log('probe: 还没有大关（levels/team），没东西可查');
      return;
    }
  }
  const started = Date.now();
  const results = await probeLevels(entries, options);
  const took = `${((Date.now() - started) / 1000).toFixed(0)} 秒`;
  // 不点名的时候查大关的规则；点了名只报告
  const failures = ids.length ? [] : results.map(teamProbeFailure).filter(Boolean);
  if (failures.length) {
    for (const f of failures) console.error(`probe: FAIL — ${f}`);
    console.error(`probe: FAIL（${failures.length}）；${took}`);
    process.exitCode = 1;
  } else console.log(`probe: ${ids.length ? '只报告' : `${results.length} 个大关每关至少两段 1 个人和 2 个人乱按都过不去 PASS`}；${took}`);
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
