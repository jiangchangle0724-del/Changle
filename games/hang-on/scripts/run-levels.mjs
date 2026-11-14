#!/usr/bin/env node
// C1/C7 content checks and replays. The game's own simulation (src/physics) is bundled, never patched.
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
const baseIds = Array.from({ length: 12 }, (_, i) => `${i < 6 ? 'table' : 'van'}-${String(i + 1).padStart(2, '0')}`);
// C8 的难关：table-13…18、van-19…24（CONTRACTS「关卡契约 · 难关」）。可以分批交，在的每一关都要过全部难关规则。
const hardIds = Array.from({ length: 12 }, (_, i) => `${i < 6 ? 'table' : 'van'}-${String(i + 13).padStart(2, '0')}`);
const isHard = (id) => hardIds.includes(id);
// 难关的 teaches（大厅里显示「难关：…」，中英文在 src/levels.ts）
const hardTeaches = new Set(['spike', 'hot', 'zap', 'mover', 'spinner', 'gauntlet']);
// 按人数摆的东西（players: [min, max]）现在能验到几个人；A7 把上限提到 6 以后改成 6
const TESTED_PLAYERS = 4;
// 每一关都在的；难关读完文件以后加进来
const ids = [...baseIds];
// C1 identities are player-facing content and must survive layout revisions unchanged.
const identities = {
  'table-01': {"name":{"zh":"茶布起步","en":"Tea Cloth Crawl"},"teaches":"crawl"},
  'table-02': {"name":{"zh":"碗沿小缝","en":"Between the Bowls"},"teaches":"gap"},
  'table-03': {"name":{"zh":"筷子桥","en":"Chopstick Bridge"},"teaches":"swing"},
  'table-04': {"name":{"zh":"蒸笼叠叠高","en":"Steamer Stack"},"teaches":"climb"},
  'table-05': {"name":{"zh":"面条过火锅","en":"Noodle over the Hotpot"},"teaches":"rope"},
  'table-06': {"name":{"zh":"一串汤圆过大锅","en":"Dumpling Chain"},"teaches":"chain"},
  'van-07': {"name":{"zh":"天车门把手","en":"SkyTrain Handles"},"teaches":"door"},
  'van-08': {"name":{"zh":"图腾向上","en":"Totem Ascent"},"teaches":"climb"},
  'van-09': {"name":{"zh":"摇摇浮筒","en":"Wobbling Pontoons"},"teaches":"balance"},
  'van-10': {"name":{"zh":"狮门抛接力","en":"Lions Gate Toss"},"teaches":"throw"},
  'van-11': {"name":{"zh":"雨中快抓","en":"Rain Grip"},"teaches":"ice"},
  'van-12': {"name":{"zh":"从夜市到海湾","en":"Night Market to Harbour"},"teaches":"combine"},
};
const contains = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const inside = (level, p) => p.x >= 0 && p.x <= level.w && p.y >= 0 && p.y <= level.h;
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
/** 圆碰矩形（要命的东西离复活点够不够远用）。 */
function circleHits(c, r, b) {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r;
}
/** 这件东西 n 个人时在不在（没写 players 就一直在）。 */
const present = (item, n) => item.players === undefined || (n >= item.players[0] && n <= item.players[1]);
/** 两件东西有没有同时在的人数（不同时在的可以摆在同一个地方，比如人少时的宽台子和人多时的窄台子）。 */
const together = (a, b) => {
  const [a0, a1] = a.players ?? [1, 6];
  const [b0, b1] = b.players ?? [1, 6];
  return a0 <= b1 && b0 <= a1;
};
const layoutLists = (level) => [level.rects, level.ropes, level.seesaws, level.crates, level.fading, level.springs, level.hazards, level.movers, level.spinners, level.plates, level.gates];
/**
 * 1 到 TESTED_PLAYERS 个人各摆出来什么样，一样的归一组。每组都要有一份回放证明能过：
 * 4 个人的是 replays/<id>.json，别的组是 replays/<id>.p<人数>.json。
 */
function layoutGroups(level) {
  const groups = new Map();
  for (let n = 1; n <= TESTED_PLAYERS; n++) {
    const sig = layoutLists(level).map((list) => (list ?? []).map((it) => (present(it, n) ? 1 : 0)).join('')).join('|');
    groups.set(sig, [...(groups.get(sig) ?? []), n]);
  }
  return [...groups.values()];
}
/** 要命的东西：不动的尖刺/烫/电，会动的要命的块，会转的要命的杆。 */
const dangersOf = (level) => [
  ...(level.hazards ?? []).map((h) => ({ kind: 'hazard', def: h })),
  ...(level.movers ?? []).filter((m) => m.deadly).map((m) => ({ kind: 'mover', def: m })),
  ...(level.spinners ?? []).filter((s) => s.deadly).map((s) => ({ kind: 'spinner', def: s })),
];
/**
 * 两关像不像：把每块台子（含饼干、蜡烛）的上沿按 40 px 一格记下来，比两关的格子重了多少（交集 / 并集）。
 * 整关比一次，开头那一屏（出生点附近 1280 × 720）再比一次。挪几个像素躲不过去。
 */
const CELL = 40;
function surfaceCells(level, window) {
  const cells = new Set();
  for (const r of [...level.rects, ...(level.fading ?? []), ...(level.springs ?? [])]) {
    const y = Math.floor(r.y / CELL);
    for (let cx = Math.floor(r.x / CELL); cx <= Math.floor((r.x + r.w - 1) / CELL); cx++) {
      if (window) {
        const px = cx * CELL + CELL / 2;
        const py = y * CELL + CELL / 2;
        if (px < window.x0 || px > window.x1 || py < window.y0 || py > window.y1) continue;
      }
      cells.add(`${cx},${y}`);
    }
  }
  return cells;
}
const firstScreen = (level) => surfaceCells(level, { x0: level.spawn.x - 200, x1: level.spawn.x + 1080, y0: level.spawn.y - 520, y1: level.spawn.y + 200 });
function jaccard(a, b) {
  let both = 0;
  for (const c of a) if (b.has(c)) both++;
  return both / Math.max(1, a.size + b.size - both);
}
/** 难关和别的关最多多像：整关（现有 12 关之间最多 0.55），开头那一屏（难关之间）。 */
const SAME_LEVEL = 0.6;
const SAME_START = 0.85;

/** 一件要命的东西碰得到的范围（会动的按整条路线算），给「每屏都有」用。 */
function dangerBox(d) {
  if (d.kind === 'hazard') return d.def;
  if (d.kind === 'spinner') return { x: d.def.pivot.x - d.def.len, y: d.def.pivot.y - d.def.len, w: d.def.len * 2, h: d.def.len * 2 };
  const pts = [d.def, ...d.def.path];
  const x0 = Math.min(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y));
  return { x: x0, y: y0, w: Math.max(...pts.map((p) => p.x)) - x0 + d.def.w, h: Math.max(...pts.map((p) => p.y)) - y0 + d.def.h };
}
/**
 * A6 的机关（CONTRACTS「关卡契约」）：要命的东西、会动的平台、会转的杆子、按人数的范围。
 * 哪一关用都按这个查，写错了马上报，不等回放跑出怪事。
 */
/**
 * 踩板门（11-13）：每块踏板开的门都有、每扇门都有踏板开；踏板是矮的、底下垫着台子；门开着、关着都在关里，
 * 关着的时候真挡路（碰得到地形）；按人数摆的时候，踏板和它开的门同时在。
 */
function gates(level, id) {
  const gs = level.gates ?? [];
  const ps = level.plates ?? [];
  const ids = new Set();
  for (const g of gs) {
    rectangle(g);
    assert(typeof g.id === 'string' && g.id && !ids.has(g.id), `${id}: gate ids must be unique strings`);
    ids.add(g.id);
    point(g.move);
    assert(Math.hypot(g.move.x, g.move.y) >= Math.min(g.w, g.h), `${id}: gate ${g.id} must move at least its own thickness`);
    for (const f of [0, 1]) assert(inside(level, { x: g.x + g.move.x * f, y: g.y + g.move.y * f }) && inside(level, { x: g.x + g.w + g.move.x * f, y: g.y + g.h + g.move.y * f }), `${id}: gate ${g.id} leaves the level`);
    const mine = ps.filter((p) => p.opens.split(/\s+/).includes(g.id));
    assert(mine.length, `${id}: gate ${g.id} has no plate`);
    for (const p of mine) assert(together(p, g), `${id}: plate for gate ${g.id} is never there with it`);
  }
  for (const p of ps) {
    rectangle(p);
    assert(p.h >= 8 && p.h <= 20 && p.w >= 48 && p.w <= 200, `${id}: plates are 8–20 px high and 48–200 px wide`);
    for (const g of p.opens.split(/\s+/).filter(Boolean)) assert(ids.has(g), `${id}: plate opens unknown gate ${g}`);
    assert(level.rects.some((r) => together(r, p) && Math.abs(r.y - (p.y + p.h)) <= 2 && r.x <= p.x + 4 && r.x + r.w >= p.x + p.w - 4), `${id}: plate at (${p.x}, ${p.y}) must sit on a platform`);
  }
}

function machines(level, id) {
  const hazardKinds = new Set(['spike', 'hot', 'zap']);
  const dirs = new Set(['up', 'down', 'left', 'right']);
  const all = layoutLists(level).flatMap((l) => l ?? []);
  // A7 的定时塌（until）：几秒后塌，不再回来
  for (const item of all) assert(item.until === undefined || (finite(item.until) && item.until > 0), `${id}: until must be a positive number of seconds`);
  for (const item of all) {
    if (item.players === undefined) continue;
    const [a, b] = item.players;
    assert(Array.isArray(item.players) && item.players.length === 2 && Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= b && b <= 6, `${id}: players must be [min, max] within 1–6`);
    // 只有 5、6 个人才有的东西现在还验不了（A7 之后放开）
    assert(a <= TESTED_PLAYERS, `${id}: players ranges must start at ${TESTED_PLAYERS} or fewer until the six-player update`);
  }
  assert((level.hazards?.length ?? 0) <= 40, `${id}: hazards exceed 40`);
  for (const h of level.hazards ?? []) {
    rectangle(h);
    assert(h.kind === undefined || hazardKinds.has(h.kind), `${id}: hazard kind must be spike / hot / zap`);
    assert(h.dir === undefined || dirs.has(h.dir), `${id}: hazard dir must be up / down / left / right`);
    assert(inside(level, h) && inside(level, { x: h.x + h.w, y: h.y + h.h }), `${id}: hazard outside level`);
  }
  for (const m of level.movers ?? []) {
    rectangle(m);
    assert(Array.isArray(m.path) && m.path.length > 0, `${id}: mover needs at least one path point`);
    for (const p of m.path) {
      point(p);
      assert(inside(level, p) && inside(level, { x: p.x + m.w, y: p.y + m.h }), `${id}: mover path leaves the level`);
    }
    assert(finite(m.speed) && m.speed > 0 && m.speed <= 600, `${id}: mover speed must be 0–600 px/s`);
    for (const k of ['wait', 'phase']) assert(m[k] === undefined || (finite(m[k]) && m[k] >= 0), `${id}: mover ${k} must be seconds`);
    assert(m.loop === undefined || typeof m.loop === 'boolean');
    assert(m.deadly === undefined || typeof m.deadly === 'boolean');
    assert(m.hazard === undefined || hazardKinds.has(m.hazard), `${id}: mover hazard must be spike / hot / zap`);
    assert(m.deadly || m.material === undefined || materials.has(m.material), `unknown material ${m.material}`);
    // 走到头停下的地方不能插进别的台子里（中途穿过墙洞可以）
    for (const p of [m, ...m.path]) for (const r of level.rects) {
      assert(!together(m, r) || !overlaps({ x: p.x, y: p.y, w: m.w, h: m.h }, r), `${id}: a mover stops inside a platform at (${p.x}, ${p.y})`);
    }
  }
  for (const sp of level.spinners ?? []) {
    point(sp.pivot);
    assert(inside(level, sp.pivot), `${id}: spinner pivot outside level`);
    assert(Number.isInteger(sp.arms) && sp.arms >= 1 && sp.arms <= 6, `${id}: spinner arms must be 1–6`);
    assert(finite(sp.len) && sp.len >= 40 && sp.len <= 400, `${id}: spinner len must be 40–400`);
    assert(sp.h === undefined || (finite(sp.h) && sp.h >= 8 && sp.h <= 40), `${id}: spinner h must be 8–40`);
    assert(finite(sp.spin) && Math.abs(sp.spin) <= 4, `${id}: spinner spin must be within ±4 rad/s`);
    assert(sp.phase === undefined || finite(sp.phase));
    assert(sp.deadly === undefined || typeof sp.deadly === 'boolean');
    assert(sp.deadly || sp.material === undefined || materials.has(sp.material), `unknown material ${sp.material}`);
  }
  // 复活的地方（起点、每个检查点，四个人错开站）离要命的东西要有一臂远，不然复活就死、死了又复活
  const spots = [{ ...level.spawn, dx: 44 }, ...(level.checkpoints ?? []).map((cp) => ({ ...cp, dx: 30 }))];
  for (const s of spots) {
    for (let player = 0; player < 4; player++) {
      const c = { x: s.x + player * s.dx, y: s.y };
      for (const h of level.hazards ?? []) assert(!circleHits(c, 24 + 60, h), `${id}: a respawn spot (${Math.round(c.x)}, ${Math.round(c.y)}) is within reach of a hazard`);
    }
  }
}
function validate(level, replay, id) {
  assert.equal(level.id, id);
  assert.equal(level.world, id.startsWith('table') ? 'table' : 'van');
  assert(level.name?.zh && level.name.en && level.teaches, 'missing bilingual name / lesson');
  assert(finite(level.w) && level.w > 0 && finite(level.h) && level.h > 0);
  const hard = isHard(id);
  if (hard) assert(hardTeaches.has(level.teaches), `${id}: a hard level teaches one of ${[...hardTeaches].join(' / ')}`);
  else {
    assert.deepEqual(level.name, identities[id].name, id + ': C1 name changed');
    assert.equal(level.teaches, identities[id].teaches, id + ': C1 lesson changed');
  }
  // 难关按形状分：高过一屏的是攀爬关
  const vertical = hard ? level.h > 720 : id === 'table-04' || id === 'van-08';
  if (vertical) {
    assert(level.h >= 1400 && level.h <= 2200, id + ': climb height must be 1400–2200');
    assert(level.spawn.y - (level.goal.y + level.goal.h) >= 720, id + ': climb route must rise at least one screen');
  } else assert(level.w >= 2400 && level.w <= 3600, id + ': width must be 2400–3600');
  assert(level.w <= 3600 && level.h <= 2200, id + ': at most three screens per axis');
  assert(level.goal.x >= level.w - 480 && level.goal.w <= 400 && level.goal.x + level.goal.w >= level.w - 160, id + ': goal must use the extended level');
  assert(level.spawn.x <= 600, id + ': spawn must retain the first-screen lesson');
  const moving = (level.ropes ?? []).reduce((sum, r) => sum + r.segments, 0) + (level.seesaws?.length ?? 0) + (level.crates?.length ?? 0) + (level.movers?.length ?? 0) + (level.spinners?.length ?? 0) + (level.gates?.length ?? 0);
  assert(moving <= 40, id + ': moving objects exceed 40 (rope links + seesaws + crates + movers + spinners + gates)');
  machines(level, id);
  gates(level, id);
  assert(level.rects.length + (level.fading?.length ?? 0) + (level.springs?.length ?? 0) <= 60, id + ': platforms exceed 60');
  point(level.spawn);
  assert(inside(level, level.spawn), id + ': spawn outside level');
  rectangle(level.goal);
  assert(finite(level.deathY) && level.deathY > level.spawn.y);
  if (hard) {
    assert(level.par.seconds >= 60 && level.par.seconds <= 240, id + ': hard par must be 1–4 minutes');
    assert(Number.isInteger(level.par.deathsPerPlayer) && level.par.deathsPerPlayer >= 2 && level.par.deathsPerPlayer <= 8, id + ': hard par deaths must be 2–8 per player');
  } else {
    assert(level.par.seconds >= 60 && level.par.seconds <= 180, 'par must be 1–3 minutes');
    assert(Number.isInteger(level.par.deathsPerPlayer) && level.par.deathsPerPlayer >= 0);
  }
  assert.equal(level.replay, `replays/${id}.json`);
  // 红包（A9b）：每关 3 个，在关里，不碰台子（npm run envelopes 挑的）
  assert.equal(level.envelopes?.length, 3, id + ': needs three red envelopes (npm run envelopes)');
  for (const e of level.envelopes) {
    point(e);
    assert(inside(level, e), id + ': red envelope outside level');
    assert(!level.rects.some((r) => e.x > r.x - 14 && e.x < r.x + r.w + 14 && e.y > r.y - 14 && e.y < r.y + r.h + 14), id + `: red envelope (${e.x}, ${e.y}) touches a platform`);
  }
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
    boxes.push({ x: saw.pivot.x - saw.w / 2, y: saw.pivot.y - (saw.h ?? 14) / 2, w: saw.w, h: saw.h ?? 14, material: saw.material, players: saw.players });
  }
  assert(boxes.length <= 60, id + ': platforms exceed 60 including crates and seesaws');
  for (const box of boxes) {
    rectangle(box);
    assert(materials.has(box.material), `unknown material ${box.material}`);
  }
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    assert(!together(boxes[a], boxes[b]) || !overlaps(boxes[a], boxes[b]), `${id}: platforms ${a} and ${b} overlap at spawn`);
  }
  for (const rope of level.ropes ?? []) {
    point(rope.anchor);
    assert(Number.isInteger(rope.segments) && rope.segments > 0 && finite(rope.segLen) && rope.segLen > 0);
  }
  const cps = level.checkpoints ?? [];
  assert(cps.length > 0, id + ': missing checkpoints');
  for (const [index, cp] of cps.entries()) {
    point(cp);
    assert(inside(level, cp), id + ': checkpoint outside level');
    // Respawns use cp.x + player * 30. All four bodies (radius 24) need permanent footing,
    // at every team size (a platform that is only there for some sizes counts only for those).
    for (let n = 1; n <= TESTED_PLAYERS; n++) for (let player = 0; player < Math.min(n, 4); player++) assert(level.rects.some(r => present(r, n) && r.until === undefined &&
      cp.x + player * 30 - 24 >= r.x && cp.x + player * 30 + 24 <= r.x + r.w &&
      r.y - cp.y >= 24 && r.y - cp.y <= 80 && r.w >= 48), id + ': checkpoint ' + index + ' lacks permanent footing within 80px for P' + (player + 1) + (n < 4 ? ` with ${n} players` : ''));
    if (index) assert(cp.x > cps[index - 1].x && Math.hypot(cp.x - cps[index - 1].x, cp.y - cps[index - 1].y) >= 120, id + ': checkpoints must follow the route');
  }
  // These routes go right, including the two stair routes that turn upward. Each occupied
  // horizontal screen needs a flag; climbing levels also need at least one flag per vertical view.
  for (let screen = 0; screen < Math.ceil(level.w / 1280); screen++) assert(cps.some(cp => Math.floor(cp.x / 1280) === screen), id + ': screen ' + (screen + 1) + ' lacks checkpoint');
  if (vertical) for (let screen = 0; screen < Math.ceil(level.h / 720); screen++) assert(cps.some(cp => Math.floor(cp.y / 720) === screen), id + ': vertical screen ' + (screen + 1) + ' lacks checkpoint');
  if (id === 'van-11') assert(level.rects.every((r) => r.material === 'ice'));
  if (hard) {
    // 难：要命的东西至少 4 处，每一屏（攀爬关每一层）都有；至少一个会动或会转的
    const dangers = dangersOf(level);
    assert(dangers.length >= 4, `${id}: a hard level needs at least four deadly things (spikes, heat, shocks, deadly machines)`);
    assert((level.movers?.length ?? 0) + (level.spinners?.length ?? 0) >= 1, `${id}: a hard level needs a moving platform or a spinning bar`);
    const boxesOfDanger = dangers.map(dangerBox);
    for (let screen = 0; screen < Math.ceil(level.w / 1280); screen++) assert(boxesOfDanger.some((b) => b.x < (screen + 1) * 1280 && b.x + b.w > screen * 1280), `${id}: screen ${screen + 1} has nothing deadly`);
    if (vertical) for (let screen = 0; screen < Math.ceil(level.h / 720); screen++) assert(boxesOfDanger.some((b) => b.y < (screen + 1) * 720 && b.y + b.h > screen * 720), `${id}: vertical screen ${screen + 1} has nothing deadly`);
  }
  replayShape(level, replay, id, 4);
}

/** 一份回放的格式：几个人、每帧每人一条输入、不比 par 的两倍长。 */
function replayShape(level, replay, id, players) {
  assert.equal(replay.level, id);
  assert.equal(replay.players, players, players === 4 ? 'every main replay must exercise all four players' : `${id}: this replay must have ${players} players`);
  assert.equal(replay.dt, 1 / 60);
  assert(Array.isArray(replay.frames) && replay.frames.length > 0);
  assert(replay.frames.length * replay.dt <= level.par.seconds * 2 + replay.dt);
  replay.frames.forEach((frame, f) => {
    assert.equal(frame.length, players, `${id} frame ${f}: missing controller`);
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

// 「碰到过」要命的东西的距离：身体中心离它这么近过，说明它在路上，不是摆着好看
const NEAR = 240;
// Inspect real grips and release velocity while runReplay supplies the original inputs.
async function inspect(physics, level, replay) {
  const { createSim, runReplay, moverAt, spinnerAngle, spinnerArm, circleHitsRect, circleHitsBar, CFG } = physics;
  // 关卡按回放的人数摆（players 范围的东西照这个人数留或去）；下面的证据都按摆出来的这一版算
  const sim = await createSim(level, replay.players);
  const laid = sim.level;
  const step = sim.step.bind(sim);
  const dangers = dangersOf(laid);
  // chainBySeg / throwsBySeg：每一段（出生到第一个检查点是第 0 段）里成串挂了几秒、丢了几次人
  const evidence = { chainSeconds: 0, throws: 0, chainBySeg: [], throwsBySeg: [], ropeGrabs: 0, propGrabs: 0, maxTilt: 0, checkpointTimes: [], cookieGrabs: (laid.fading ?? []).map(() => 0), springBounces: (laid.springs ?? []).map(() => 0), iceGrabs: 0,
    moverUse: (laid.movers ?? []).map(() => 0), spinnerUse: (laid.spinners ?? []).map(() => 0), near: dangers.map(() => false), gateOpen: (laid.gates ?? []).map(() => 0) };
  const bars = (s) => { const angle = spinnerAngle(s, sim.time); return Array.from({ length: s.arms }, (_, j) => spinnerArm(s, j, angle)); };
  const holding = (p, hit) => p.arms.some((a) => a.grip?.kind === 'terrain' && hit(a.hand, CFG.handR + CFG.grabPad));
  sim.step = (dt) => {
    const before = sim.players.map((p) => p.arms.map((a) => a.grip && ({ kind: a.grip.kind, player: a.grip.player })));
    const velocities = sim.players.map((p) => ({ ...p.body }));
    step(dt);
    const chained = sim.players.some((p) => !p.dead && !p.ground && p.arms.some((a) => a.grip?.kind === 'player' &&
      !sim.players[a.grip.player].ground && sim.players[a.grip.player].arms.some((b) => b.grip?.kind === 'terrain' || b.grip?.kind === 'rope')));
    const seg = evidence.checkpointTimes.length;
    if (chained) {
      evidence.chainSeconds += dt;
      evidence.chainBySeg[seg] = (evidence.chainBySeg[seg] ?? 0) + dt;
    }
    sim.players.forEach((p, i) => p.arms.forEach((a, j) => {
      const old = before[i][j];
      if (old?.kind === 'player' && !a.grip) {
        const v = velocities[old.player];
        // A throw releases a teammate flying right and upward toward the pit.
        if (v.x > level.spawn.x + 50 && v.vx > 150 && v.vy < -100) {
          evidence.throws++;
          evidence.throwsBySeg[seg] = (evidence.throwsBySeg[seg] ?? 0) + 1;
        }
      }
    }));
    for (const e of sim.events) {
      if (e.type === 'checkpoint') {
        assert.equal(e.index, evidence.checkpointTimes.length, level.id + ': skipped or reordered checkpoint');
        evidence.checkpointTimes.push(sim.time);
      }
      if (e.type === 'bounce') evidence.springBounces[e.spring]++;
      if (e.type !== 'grab') continue;
      (laid.fading ?? []).forEach((r, i) => { if (e.kind === 'terrain' && contains(r, e)) evidence.cookieGrabs[i]++; });
      if (e.kind === 'terrain' && laid.rects.some(r => r.material === 'ice' && contains(r, e))) evidence.iceGrabs++;
      if (e.kind === 'rope') evidence.ropeGrabs++;
      if (e.kind === 'prop') evidence.propGrabs++;
    }
    for (const prop of sim.props) if (prop.kind === 'seesaw') evidence.maxTilt = Math.max(evidence.maxTilt, Math.abs(prop.angle));
    assert(sim.players.every((p) => Object.values(p.body).every(finite)), 'non-finite physics state');
    // 会动的台子、会转的杆子有没有人站上去或者抓着（要命的不算）；要命的东西有没有人到过跟前
    const live = sim.players.filter((p) => !p.dead);
    (laid.movers ?? []).forEach((m, i) => {
      if (m.deadly) return;
      const at = moverAt(m, sim.time);
      const r = { x: at.x, y: at.y, w: m.w, h: m.h };
      const hit = (c, rr) => circleHitsRect(c, rr, r);
      if (live.some((p) => hit(p.body, CFG.bodyR + 3) || holding(p, hit))) evidence.moverUse[i] += dt;
    });
    (laid.spinners ?? []).forEach((s, i) => {
      if (s.deadly) return;
      const arms = bars(s);
      const hit = (c, rr) => arms.some((b) => circleHitsBar(c, rr, b));
      if (live.some((p) => hit(p.body, CFG.bodyR + 3) || holding(p, hit))) evidence.spinnerUse[i] += dt;
    });
    sim.gates.forEach((g, k) => (evidence.gateOpen[k] = Math.max(evidence.gateOpen[k], g.open)));
    dangers.forEach((d, k) => {
      if (evidence.near[k]) return;
      let hit;
      if (d.kind === 'hazard') hit = (c) => circleHitsRect(c, NEAR, d.def);
      else if (d.kind === 'mover') {
        const at = moverAt(d.def, sim.time);
        hit = (c) => circleHitsRect(c, NEAR, { x: at.x, y: at.y, w: d.def.w, h: d.def.h });
      } else {
        const arms = bars(d.def);
        hit = (c) => arms.some((b) => circleHitsBar(c, NEAR, b));
      }
      if (live.some((p) => hit(p.body))) evidence.near[k] = true;
    });
  };
  try {
    const result = await runReplay(level, replay, sim);
    // 红包（A9b）：回放里每个都有人拿到过（够得着）
    evidence.envelopes = sim.envelopes.map((e) => e.got);
    return { result, evidence, laid };
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
const sim=await createSim(level,replay.players||4), canvas=document.querySelector('canvas');
const stage=await Stage.create(canvas,{plates:{table:'/art/table-far.webp',van:'/art/van-far.webp'}});
stage.setLevel(sim.level);stage.syncPlayers(sim);
const lessons={crawl:'抓地爬行 / Crawl',gap:'过缝 / Cross a gap',swing:'荡过筷子 / Swing',climb:'攀爬 / Climb',rope:'面条绳索 / Rope swing',chain:'两人成链 / Form a chain',door:'夹门翻越 / Door handles',balance:'浮筒平衡 / Balance',throw:'丢队友 / Toss a teammate',ice:'雨天快抓 / Rain grips',combine:'连续机关 / Combined route',spike:'难关 · 尖刺 / Hard · Spikes',hot:'难关 · 烫手 / Hard · Hot stuff',zap:'难关 · 带电 / Hard · Live wires',mover:'难关 · 会动的台子 / Hard · Moving platforms',spinner:'难关 · 转杆 / Hard · Spinning bars',gauntlet:'难关 · 连环机关 / Hard · Gauntlet'};
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
const reviewPage = () => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Hang On · Level Review</title><link rel="stylesheet" href="/tokens.css">
<style>*{box-sizing:border-box}html,body{height:100%}body{margin:0;overflow:hidden;background:var(--color-bg);color:var(--color-text);font-family:var(--font-text);font-size:var(--text-sm);line-height:var(--leading)}canvas{position:fixed;inset:0;width:100vw;height:100vh;display:block}#marks{position:fixed;inset:0;pointer-events:none}.mark{position:absolute;border:2px dashed var(--color-warning);color:var(--color-text);display:grid;place-items:start center;padding-top:var(--space-2);text-align:center;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.6)}header{position:fixed;top:var(--space-4);left:var(--space-8);right:var(--space-8);display:flex;align-items:center;justify-content:space-between;text-shadow:0 1px 3px rgba(0,0,0,.6)}h1{font-size:var(--text-xl);line-height:var(--leading-tight);margin:0 0 var(--space-2)}p{margin:0;color:var(--color-text-2)}footer{position:fixed;bottom:var(--space-6);left:var(--space-8);right:var(--space-8);display:flex;justify-content:space-between;text-shadow:0 1px 3px rgba(0,0,0,.6)}button,select{min-height:var(--tap-crowded);background:var(--color-sheet);color:var(--color-text);border:1px solid var(--color-line);border-radius:var(--r-small);padding:var(--space-2);font:inherit}#status{max-width:720px;font-variant-numeric:tabular-nums}nav{display:flex;gap:var(--space-2)}</style>
<canvas></canvas><div id="marks"></div><header><div><h1></h1><p id="lesson"></p></div><nav><select aria-label="关卡 / Level">${ids.map((id) => `<option>${id}</option>`).join('')}</select><button id="play">回放 / Play</button><button id="reset">重置 / Reset</button></nav></header><footer><span id="status"></span><span>左手蓝 / Left blue · 右手橙 / Right orange</span></footer><script type="module" src="/app.js"></script></html>`;

async function serve(entries, screenshot) {
  const bundle = await build({ stdin: { contents: browserSource, resolveDir: root }, bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
  const tokens = await readFile(resolve(root, '../../site/src/styles/tokens.css'));
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(reviewPage()); }
    else if (path === '/tokens.css') { res.setHeader('Content-Type', 'text/css'); res.end(tokens); }
    else if (path === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (/^\/art\/(table|van)-far\.webp$/.test(path)) {
      readFile(resolve(root, path.slice(1))).then((data) => { res.setHeader('Content-Type', 'image/webp'); res.end(data); }, () => { res.writeHead(404); res.end(); });
    }
    else {
      const match = /^\/(levels|replays)\/((?:table|van)-\d{2})$/.exec(path);
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
  const found = files.map((f) => f.slice(0, -'.json'.length));
  for (const id of baseIds) assert(found.includes(id), `missing contracted level ${id}`);
  for (const id of found) assert(baseIds.includes(id) || isHard(id), `unexpected level ${id}: the twelve contracted levels plus hard levels table-13…18 / van-19…24 only`);
  ids.push(...hardIds.filter((id) => found.includes(id)));
  const replayFiles = (await readdir(join(levelsDir, 'replays'))).filter((f) => f.endsWith('.json')).sort();
  for (const id of ids) assert(replayFiles.includes(`${id}.json`), `${id}: needs its own replay`);
  // 别的人数的回放：replays/<id>.p<人数>.json，只给按人数摆的关、每种摆法一份
  const extraReplays = replayFiles.filter((f) => !files.includes(f)).map((f) => {
    const m = /^((?:table|van)-\d{2})\.p([1-6])\.json$/.exec(f);
    assert(m && ids.includes(m[1]), `unexpected replay ${f} (extra replays are <level>.p<players>.json)`);
    return { file: f, id: m[1], players: Number(m[2]) };
  });
  const entry = join(temporary, 'physics.mjs');
  await build({ stdin: { contents: "export {createSim} from './src/physics/world'; export {runReplay} from './src/physics/replay'; export * from './src/physics/motion'; export {CFG} from './src/physics/config';", resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile: entry, logLevel: 'silent' });
  const physics = await import(pathToFileURL(entry).href);
  const { runReplay } = physics;
  const entries = [];
  console.log('| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | Cookie grabs / Candle bounces | Machines used (s) |');
  console.log('| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | --- |');
  /** 跑一份回放，查过关、时间、检查点、死的次数、每样机关都用上了、要命的东西都在路上。 */
  async function check(level, replay, id, main) {
    const { result, evidence, laid } = await inspect(physics, level, replay);
    const ratio = result.seconds / level.par.seconds;
    const times = [0, ...evidence.checkpointTimes, result.seconds];
    const segments = times.slice(1).map((t, i) => t - times[i]);
    const used = [...evidence.moverUse, ...evidence.spinnerUse];
    console.log(`| ${id} | ${replay.players} | ${result.seconds.toFixed(2)} | ${result.deaths.join(' / ')} | ${result.won ? 'YES' : 'NO'} | ${ratio.toFixed(3)} | ${level.w}×${level.h} | ${segments.map(t => t.toFixed(2)).join(' / ')} | ${evidence.cookieGrabs.join(',') || '—'} / ${evidence.springBounces.join(',') || '—'} | ${used.map((t) => t.toFixed(1)).join(',') || '—'} |`);
    assert(evidence.cookieGrabs.every(n => n > 0), id + ': cookie was bypassed (needs terrain grab point inside every cookie)');
    assert(evidence.springBounces.every(n => n > 0), id + ': candle was bypassed (needs bounce from every candle)');
    assert.equal(evidence.checkpointTimes.length, level.checkpoints.length, id + ': replay missed checkpoint');
    if (main) evidence.envelopes.forEach((got, k) => assert(got, `${id}: red envelope ${k} is never reached in the replay (rerun npm run envelopes)`));
    if (main) assert(segments.every(t => t >= 15 && t <= 60), id + ': checkpoint segment outside 15–60s: ' + segments.map(t => t.toFixed(2)).join('/'));
    assert(result.won, `${id} (${replay.players} players): replay did not reach the goal: ${JSON.stringify(result.final)}`);
    if (main) assert(ratio >= 0.5 && ratio <= 2, `${id}: time outside par × [0.5, 2]`);
    else assert(ratio <= 2, `${id} (${replay.players} players): time over par × 2`);
    assert(result.deaths.every((d) => d <= level.par.deathsPerPlayer * 4), `${id}: too many deaths`);
    assert(result.deaths.reduce((sum, d) => sum + d, 0) <= level.par.deathsPerPlayer * 4, `${id}: team deaths exceed budget`);
    // 会动的台子、会转的杆子每一个都要真的用上（站上去或抓着至少 0.25 秒），要命的东西每一处都要在路上
    evidence.moverUse.forEach((t, i) => assert(laid.movers[i].deadly || t >= 0.25, `${id} (${replay.players} players): moving platform ${i} was bypassed`));
    evidence.spinnerUse.forEach((t, i) => assert(laid.spinners[i].deadly || t >= 0.25, `${id} (${replay.players} players): spinning bar ${i} was bypassed`));
    evidence.near.forEach((n, k) => assert(n, `${id}: deadly thing ${k} is never within ${NEAR}px of the route`));
    // 踩板门：每扇门回放里都真开过（全开）
    evidence.gateOpen.forEach((o, k) => assert(o >= 0.99, `${id} (${replay.players} players): gate ${laid.gates[k].id} never opened`));
    return { result, evidence };
  }
  for (const id of ids) {
    const level = await readJSON(join(levelsDir, `${id}.json`));
    const replay = await readJSON(join(levelsDir, 'replays', `${id}.json`));
    validate(level, replay, id);
    const { result, evidence } = await check(level, replay, id, true);
    if (id === 'van-12') assert([evidence.ropeGrabs > 0, evidence.propGrabs > 0 && evidence.maxTilt > 0.05, evidence.iceGrabs > 0, evidence.cookieGrabs.length > 0 && evidence.cookieGrabs.every(n => n > 0), evidence.springBounces.length > 0 && evidence.springBounces.every(n => n > 0)].filter(Boolean).length >= 4, id + ': use at least four recap mechanics');
    if (id === 'table-06') assert(evidence.chainSeconds >= 0.25, 'level 6 must actually hang as a chain');
    if (id === 'van-10') assert(evidence.throws >= 2, 'level 10 must release flying teammates');
    if (id === 'table-05' || id === 'van-12') assert(evidence.ropeGrabs > 0, `${id}: rope was bypassed`);
    if (id === 'van-09' || id === 'van-12') assert(evidence.propGrabs > 0 && evidence.maxTilt > 0.05, `${id}: seesaw was bypassed`);
    // 难关得靠大家：回放里真的有人连成串挂着，或者把队友丢过去
    if (isHard(id)) {
      assert(evidence.chainSeconds >= 0.25 || evidence.throws >= 1, `${id}: a hard level's replay must use teamwork (hang as a chain for 0.25 s or throw a teammate)`);
      // 不能只在开头连一下：至少两段里都要靠大家（成串挂着 0.25 秒，或者丢一次人）
      const segs = Math.max(evidence.chainBySeg.length, evidence.throwsBySeg.length);
      const teamSegs = Array.from({ length: segs }, (_, k) => (evidence.chainBySeg[k] ?? 0) >= 0.25 || (evidence.throwsBySeg[k] ?? 0) >= 1).filter(Boolean).length;
      assert(teamSegs >= 2, `${id}: teamwork in only ${teamSegs} checkpoint segment(s); a hard level needs it in at least two`);
    }
    // 按人数摆的关：每一种摆法都要有一份回放（4 个人那种就是上面这份）
    const mine = extraReplays.filter((r) => r.id === id);
    for (const group of layoutGroups(level)) {
      if (group.includes(4)) {
        assert(!mine.some((r) => group.includes(r.players)), `${id}: ${group.join('/')} players share the four-player layout; replays/${id}.json already covers them`);
        continue;
      }
      const cover = mine.filter((r) => group.includes(r.players));
      assert.equal(cover.length, 1, `${id}: with ${group.join(' or ')} players the level is laid out differently; add exactly one replay for it (replays/${id}.p${group[group.length - 1]}.json)`);
      const extra = await readJSON(join(levelsDir, 'replays', cover[0].file));
      replayShape(level, extra, id, cover[0].players);
      await check(level, extra, id, false);
    }
    for (const r of mine) assert(r.players <= TESTED_PLAYERS && layoutGroups(level).some((g) => g.includes(r.players)), `${r.file}: no layout for ${r.players} players to cover`);
    entries.push({ level, replay, result, evidence, extras: mine.length });
  }
  assert(entries.filter(e => e.level.fading?.length).length >= 4, 'at least four levels need cookies');
  assert(entries.filter(e => e.level.springs?.length).length >= 4, 'at least four levels need candles');
  assert(entries.filter(e => e.level.fading?.length && e.level.springs?.length).length >= 2, 'at least two levels need both cookies and candles');
  // 难关全到齐了才查的整体搭配（分批交的时候先不查）
  const hardEntries = entries.filter((e) => isHard(e.level.id));
  // 每个难关都要是自己的关：整关不能和别的关（现有 12 关、别的难关）像，开头那一屏不能和别的难关一样，也不能把一个世界的关换个样子搬到另一个世界
  for (const a of hardEntries) {
    for (const b of entries) {
      if (b === a || (isHard(b.level.id) && b.level.id < a.level.id)) continue;
      const whole = jaccard(surfaceCells(a.level), surfaceCells(b.level));
      assert(whole <= SAME_LEVEL, `${a.level.id} and ${b.level.id} share ${(whole * 100).toFixed(0)}% of their platforms; every hard level needs its own layout (at most ${SAME_LEVEL * 100}%)`);
      if (!isHard(b.level.id)) continue;
      const start = jaccard(firstScreen(a.level), firstScreen(b.level));
      assert(start <= SAME_START, `${a.level.id} and ${b.level.id} open with the same first screen (${(start * 100).toFixed(0)}% alike); every hard level needs its own start (at most ${SAME_START * 100}%)`);
    }
  }
  if (hardEntries.length === hardIds.length) {
    const count = (pred) => hardEntries.filter((e) => pred(e.level)).length;
    assert(count((l) => l.movers?.some((m) => !m.deadly)) >= 3, 'hard levels: at least three need a moving platform to ride or hold');
    assert(count((l) => l.spinners?.some((s) => !s.deadly)) >= 3, 'hard levels: at least three need a spinning bar to hold');
    assert(count((l) => l.movers?.some((m) => m.deadly)) >= 2, 'hard levels: at least two need a deadly moving block');
    assert(count((l) => l.spinners?.some((s) => s.deadly)) >= 2, 'hard levels: at least two need a deadly spinning bar');
    for (const kind of ['spike', 'hot', 'zap']) assert(count((l) => (l.hazards ?? []).some((h) => (h.kind ?? 'spike') === kind) || (l.movers ?? []).some((m) => m.deadly && (m.hazard ?? 'zap') === kind) || (l.spinners ?? []).some((s) => s.deadly && kind === 'spike')) >= 3, `hard levels: at least three need ${kind}`);
    assert(count((l) => layoutLists(l).some((list) => (list ?? []).some((it) => it.players))) >= 4, 'hard levels: at least four change with the number of players');
    for (const world of ['table', 'van']) assert(count((l) => l.world === world && l.h > 720) >= 1, `hard levels: ${world} needs at least one climb`);
    for (const id of ['table-18', 'van-24']) {
      const l = hardEntries.find((e) => e.level.id === id).level;
      assert.equal(l.teaches, 'gauntlet', `${id}: the last hard level of a world is the gauntlet`);
      const kinds = [l.hazards?.length, l.movers?.some((m) => !m.deadly), l.movers?.some((m) => m.deadly), l.spinners?.some((s) => !s.deadly), l.spinners?.some((s) => s.deadly), l.ropes?.length, l.seesaws?.length, l.fading?.length, l.springs?.length, l.rects.some((r) => r.material === 'ice')];
      assert(kinds.filter(Boolean).length >= 4, `${id}: the gauntlet needs at least four kinds of machines`);
    }
  }
  // 两人成链、丢队友，和每一个难关：录好的每个手柄单独跑都过不去（这关得靠大家）
  for (const { level, replay, evidence } of entries.filter((e) => ['table-06', 'van-10'].includes(e.level.id) || isHard(e.level.id))) {
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
  console.log(`levels: ${baseIds.length}/${baseIds.length} base + ${hardEntries.length}/${hardIds.length} hard PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, red envelopes, object budgets and solo controls PASS`);
} catch (error) {
  console.error(`levels: FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  assert.equal(dirname(temporary), resolve(tmpdir()));
  assert(basename(temporary).startsWith('hang-on-levels-'));
  await rm(temporary, { recursive: true, force: true });
}
