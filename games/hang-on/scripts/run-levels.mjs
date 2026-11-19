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
// 新机关（A12）教的词，长关（A13）多半教这几个
const NEW_TEACHES = ['tide', 'crumble', 'pendulum', 'wind'];
// 第三轮的新场景（A10 起，Codex 的 C10…C13 做关），每个场景六关、写明难度（简单、中等、困难各两关）。可以分批交，在的每一关都要过这个场景的全部规则。
// need：这个场景的关得有它自己的机关；mix：六关到齐了才查的搭配（返回没过的那一条，或者 null）。
const SCENE_TEACHES = ['combine', 'spike', 'hot', 'zap', 'mover', 'spinner', 'gauntlet', ...NEW_TEACHES];
const SCENES = {
  // C10 中餐馆后厨：kitchen-25…30（CONTRACTS「后厨（A10，C10 做关）」）
  kitchen: {
    first: 25,
    teaches: new Set(['steam', 'tray', ...SCENE_TEACHES]),
    need: (l) => (l.vents?.length ?? 0) > 0 || (l.tray?.length ?? 0) > 0,
    needText: 'steamers or a tray',
    mix: (count) =>
      count((l) => l.vents?.length) < 4 ? 'at least four need steamers' : count((l) => l.tray?.length) < 3 ? 'at least three need a tray' : count((l) => l.vents?.length && l.tray?.length) < 2 ? 'at least two need both steamers and a tray' : null,
  },
  // C11 雪山缆车：snow-31…36（CONTRACTS「雪山（A10，C11 做关）」）
  snow: {
    first: 31,
    teaches: new Set(['lift', 'slip', ...SCENE_TEACHES]),
    need: (l) => (l.lifts?.length ?? 0) > 0 || l.rects.some((r) => r.slip !== undefined),
    needText: 'a lift or icy holds (slip)',
    mix: (count) =>
      count((l) => l.lifts?.length) < 4 ? 'at least four need a lift' : count((l) => l.rects.some((r) => r.slip !== undefined)) < 3 ? 'at least three need icy holds' : count((l) => l.lifts?.length && l.rects.some((r) => r.slip !== undefined)) < 2 ? 'at least two need both a lift and icy holds' : null,
  },
  // C12 老宅找钥匙：house-37…42（CONTRACTS「老宅（A10，C12 做关）」）
  house: {
    first: 37,
    teaches: new Set(['key', 'dark', ...SCENE_TEACHES]),
    need: (l) => (l.keys?.length ?? 0) > 0 || (l.dark?.length ?? 0) > 0,
    needText: 'keys or dark rooms',
    mix: (count) =>
      count((l) => l.keys?.length) < 4
        ? 'at least four need keys'
        : count((l) => l.dark?.length) < 3
          ? 'at least three need dark rooms'
          : count((l) => l.keys?.length && l.dark?.length) < 2
            ? 'at least two need both keys and dark rooms'
            : count((l) => l.lanterns?.length) < 2
              ? 'at least two need a lantern'
              : count((l) => (l.lamps ?? []).some((m) => m.off)) < 2
                ? 'at least two need a lamp to light'
                : null,
  },
  // C13 太空站：space-43…48（CONTRACTS「太空站（A10，C13 做关）」）
  space: {
    first: 43,
    teaches: new Set(['float', 'lever', ...SCENE_TEACHES]),
    need: (l) => (l.zerog?.length ?? 0) > 0 || (l.levers?.length ?? 0) > 0,
    needText: 'zero-gravity zones or levers',
    mix: (count) =>
      count((l) => l.zerog?.length) < 4
        ? 'at least four need zero gravity'
        : count((l) => l.levers?.length) < 3
          ? 'at least three need levers'
          : count((l) => l.zerog?.length && l.levers?.length) < 2
            ? 'at least two need both zero gravity and levers'
            : count((l) => (l.gates ?? []).some((g) => g.all && (l.levers ?? []).filter((v) => v.opens.split(/\s+/).includes(g.id)).length >= 2)) < 2
              ? 'at least two need a hatch that several levers open together (all)'
              : null,
  },
};
for (const [name, s] of Object.entries(SCENES)) s.ids = Array.from({ length: 6 }, (_, i) => `${name}-${s.first + i}`);
const sceneIds = Object.values(SCENES).flatMap((s) => s.ids);
/** 这一关是哪个新场景的（不是就 undefined）。 */
const sceneOf = (id) => Object.entries(SCENES).find(([, s]) => s.ids.includes(id))?.[0];
const isScene = (id) => sceneOf(id) !== undefined;
/** 关卡 id 前面那半截就是它在哪个世界（table-01 → table，kitchen-25 → kitchen）。 */
const worldOfId = (id) => id.slice(0, id.lastIndexOf('-'));
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
const materials = new Set(['cloth', 'wood', 'ceramic', 'metal', 'noodle', 'ice', 'bamboo', 'snow', 'brick', 'hull']);
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
const layoutLists = (level) => [level.rects, level.ropes, level.seesaws, level.crates, level.fading, level.springs, level.hazards, level.movers, level.spinners, level.plates, level.gates, level.vents, level.lifts, level.keys, level.lanterns, level.lamps, level.dark, level.zerog, level.levers];
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
 * 踩板门（11-13）：每块踏板开的门都有、每扇门都有踏板开（钥匙开的门除外，见 house）；踏板是矮的、底下垫着台子；门开着、关着都在关里，
 * 关着的时候真挡路（碰得到地形）；按人数摆的时候，踏板和它开的门同时在。
 */
function gates(level, id) {
  const gs = level.gates ?? [];
  const ps = level.plates ?? [];
  const keyed = new Set((level.keys ?? []).map((k) => k.opens));
  const ids = new Set();
  for (const g of gs) {
    rectangle(g);
    assert(typeof g.id === 'string' && g.id && !ids.has(g.id), `${id}: gate ids must be unique strings`);
    ids.add(g.id);
    point(g.move);
    assert(Math.hypot(g.move.x, g.move.y) >= Math.min(g.w, g.h), `${id}: gate ${g.id} must move at least its own thickness`);
    for (const f of [0, 1]) assert(inside(level, { x: g.x + g.move.x * f, y: g.y + g.move.y * f }) && inside(level, { x: g.x + g.w + g.move.x * f, y: g.y + g.h + g.move.y * f }), `${id}: gate ${g.id} leaves the level`);
    const mine = [...ps, ...(level.levers ?? [])].filter((p) => p.opens.split(/\s+/).includes(g.id));
    if (keyed.has(g.id)) {
      assert(!mine.length, `${id}: gate ${g.id} opens with a key; it can't also have plates or levers`);
      continue;
    }
    assert(mine.length, `${id}: gate ${g.id} has no plate or lever`);
    for (const p of mine) assert(together(p, g), `${id}: a plate or lever for gate ${g.id} is never there with it`);
  }
  for (const p of ps) {
    rectangle(p);
    assert(p.h >= 8 && p.h <= 20 && p.w >= 48 && p.w <= 200, `${id}: plates are 8–20 px high and 48–200 px wide`);
    for (const g of p.opens.split(/\s+/).filter(Boolean)) assert(ids.has(g), `${id}: plate opens unknown gate ${g}`);
    assert(level.rects.some((r) => together(r, p) && Math.abs(r.y - (p.y + p.h)) <= 2 && r.x <= p.x + 4 && r.x + r.w >= p.x + p.w - 4), `${id}: plate at (${p.x}, ${p.y}) must sit on a platform`);
  }
}

/**
 * 后厨（A10）：蒸笼喷汽和端托盘。蒸笼是实的台子（垫在别的台子上），汽柱在关里、下面六成没有台子挡着；
 * 托盘每个放的地方都在一块一直在的台子上、离要命的东西够远、不压在复活的人身上，最多一个开局加每个检查点一个。
 */
function kitchen(level, id) {
  for (const v of level.vents ?? []) {
    rectangle(v);
    const reach = v.reach ?? 300;
    assert(finite(reach) && reach >= 120 && reach <= 480, `${id}: vent reach must be 120–480`);
    assert(v.w >= 48 && v.w <= 200 && v.h >= 24 && v.h <= 120, `${id}: a steamer is 48–200 px wide and 24–120 px high`);
    for (const [k, lo, hi] of [['on', 0.4, 6], ['off', 0.4, 8], ['phase', 0, 30], ['power', 0.5, 1.6]]) assert(v[k] === undefined || (finite(v[k]) && v[k] >= lo && v[k] <= hi), `${id}: vent ${k} must be ${lo}–${hi}`);
    assert(v.material === undefined || materials.has(v.material), `unknown material ${v.material}`);
    assert(inside(level, { x: v.x, y: v.y - reach }) && inside(level, { x: v.x + v.w, y: v.y + v.h }), `${id}: a vent's steam column leaves the level`);
    assert(level.rects.some((r) => together(r, v) && Math.abs(r.y - (v.y + v.h)) <= 2 && r.x <= v.x + 4 && r.x + r.w >= v.x + v.w - 4), `${id}: vent at (${v.x}, ${v.y}) must sit on a platform`);
    const low = { x: v.x, y: v.y - reach * 0.6, w: v.w, h: reach * 0.6 };
    for (const r of [...level.rects, ...(level.fading ?? []), ...(level.springs ?? [])]) assert(!together(r, v) || !overlaps(r, low), `${id}: a platform blocks the steam above the vent at (${v.x}, ${v.y})`);
  }
  const spots = level.tray ?? [];
  if (!spots.length) return;
  assert(spots.length <= (level.checkpoints?.length ?? 0) + 1, `${id}: tray has one spot to start plus at most one per checkpoint`);
  const respawns = [{ ...level.spawn, dx: 44 }, ...(level.checkpoints ?? []).map((cp) => ({ ...cp, dx: 30 }))].flatMap((s) => [0, 1, 2, 3].map((k) => ({ x: s.x + k * s.dx, y: s.y })));
  for (const s of spots) {
    point(s);
    assert(inside(level, s), `${id}: tray spot outside the level`);
    const half = 46;
    assert(level.rects.some((r) => r.players === undefined && r.until === undefined && r.x <= s.x - half && r.x + r.w >= s.x + half && r.y - (s.y + 5) >= -1 && r.y - (s.y + 5) <= 12), `${id}: tray spot (${s.x}, ${s.y}) must rest on a platform that is always there (centre 5 px above its top)`);
    for (const h of level.hazards ?? []) assert(!circleHits(s, 84, h), `${id}: tray spot (${s.x}, ${s.y}) is within reach of a hazard`);
    for (const c of respawns) assert(Math.abs(c.x - s.x) > 70 || Math.abs(c.y - s.y) > 40, `${id}: tray spot (${s.x}, ${s.y}) sits where a player respawns`);
  }
}

/**
 * 雪山（A10）：缆车的两头在关里、速度和间隔合理、椅子一路上不撞台子（沿缆绳每 20 px 量一次座板和横杆 / 车顶）；
 * 冰溜子（slip）能抓 0.6 到 5 秒。椅子的几块和吊多低和 motion.ts 的 liftParts、CFG.liftDrop 一样。
 */
const LIFT_PARTS = { chair: [{ x: -36, y: -6, w: 72, h: 12 }, { x: -28, y: -50, w: 56, h: 8 }], cabin: [{ x: -60, y: -6, w: 120, h: 12 }, { x: -60, y: -96, w: 120, h: 12 }] };
const LIFT_DROP = 70;
function snow(level, id) {
  for (const l of level.lifts ?? []) {
    point(l.from);
    point(l.to);
    assert(inside(level, l.from) && inside(level, l.to), `${id}: a lift station is outside the level`);
    assert(finite(l.speed) && l.speed >= 20 && l.speed <= 240, `${id}: lift speed must be 20–240 px/s`);
    assert(finite(l.gap) && l.gap >= 150 && l.gap <= 800, `${id}: lift gap must be 150–800 px`);
    assert(l.drop === undefined || (finite(l.drop) && l.drop >= 40 && l.drop <= 200), `${id}: lift drop must be 40–200 px`);
    assert(l.kind === undefined || l.kind === 'chair' || l.kind === 'cabin', `${id}: lift kind is chair or cabin`);
    assert(l.phase === undefined || (finite(l.phase) && l.phase >= 0), `${id}: lift phase must be seconds`);
    const dx = l.to.x - l.from.x;
    const dy = l.to.y - l.from.y;
    const len = Math.hypot(dx, dy);
    assert(len >= 300, `${id}: a lift must be at least 300 px long`);
    const drop = l.drop ?? LIFT_DROP;
    for (let s = 0; s <= len; s += 20) {
      const cx = l.from.x + (dx * s) / len;
      const cy = l.from.y + (dy * s) / len + drop;
      for (const p of LIFT_PARTS[l.kind ?? 'chair']) {
        const box = { x: cx + p.x, y: cy + p.y, w: p.w, h: p.h };
        for (const r of level.rects) assert(!together(r, l) || !overlaps(r, box), `${id}: a chair of the lift from (${l.from.x}, ${l.from.y}) runs into a platform at (${Math.round(cx)}, ${Math.round(cy)})`);
      }
    }
  }
  for (const r of level.rects) if (r.slip !== undefined) assert(finite(r.slip) && r.slip >= 0.6 && r.slip <= 5, `${id}: slip must be 0.6–5 seconds`);
}

/**
 * 老宅（A10）：每把钥匙开一扇在关里的门，一扇门最多一把钥匙；锁着的门关着的时候长的那一头两边都贴着台子（或关卡边），真挡路；
 * 钥匙和灯笼放在一块一直在的台子上、离要命的东西够远、不压在复活的人身上；墙上的灯在关里、照 120 到 480 像素；
 * 黑屋子在关里、最多 8 间，每间里至少有一盏墙灯，或者关里有灯笼。钥匙、灯笼的大小和 CFG 的 keyW / keyH、lanternW / lanternH 一样。
 */
const KEY = { w: 38, h: 14 };
const LANTERN = { w: 30, h: 40 };
function house(level, id) {
  const gs = level.gates ?? [];
  const respawns = [{ ...level.spawn, dx: 44 }, ...(level.checkpoints ?? []).map((cp) => ({ ...cp, dx: 30 }))].flatMap((s) => [0, 1, 2, 3].map((k) => ({ x: s.x + k * s.dx, y: s.y })));
  // 放在台子上：中心比台面高半个身子（差 1 到 12 px 都算），台子比它宽、一直在
  const rests = (s, size) => level.rects.some((r) => r.players === undefined && r.until === undefined && r.x <= s.x - size.w / 2 && r.x + r.w >= s.x + size.w / 2 && r.y - (s.y + size.h / 2) >= -1 && r.y - (s.y + size.h / 2) <= 12);
  const carried = (s, size, what) => {
    point(s);
    assert(inside(level, s), `${id}: ${what} outside the level`);
    assert(rests(s, size), `${id}: ${what} (${s.x}, ${s.y}) must rest on a platform that is always there (centre ${size.h / 2} px above its top)`);
    for (const h of level.hazards ?? []) assert(!circleHits(s, 84, h), `${id}: ${what} (${s.x}, ${s.y}) is within reach of a hazard`);
    for (const c of respawns) assert(Math.abs(c.x - s.x) > 50 || Math.abs(c.y - s.y) > 40, `${id}: ${what} (${s.x}, ${s.y}) sits where a player respawns`);
  };
  const keyed = new Set();
  for (const k of level.keys ?? []) {
    assert(typeof k.opens === 'string' && k.opens, `${id}: a key names the gate it opens`);
    const g = gs.find((gt) => gt.id === k.opens);
    assert(g, `${id}: key opens unknown gate ${k.opens}`);
    assert(!keyed.has(g.id), `${id}: gate ${g.id} has more than one key`);
    keyed.add(g.id);
    assert(together(k, g), `${id}: the key for gate ${g.id} is never there with it`);
    carried(k, KEY, 'key');
    const vertical = g.h >= g.w;
    const ends = vertical ? [{ x: g.x, y: g.y - 4, w: g.w, h: 4 }, { x: g.x, y: g.y + g.h, w: g.w, h: 4 }] : [{ x: g.x - 4, y: g.y, w: 4, h: g.h }, { x: g.x + g.w, y: g.y, w: 4, h: g.h }];
    const edge = (b) => b.y <= 0 || b.x <= 0 || b.x + b.w >= level.w || b.y + b.h >= level.h;
    for (const b of ends) assert(edge(b) || level.rects.some((r) => together(r, g) && r.until === undefined && overlaps(r, b)), `${id}: locked gate ${g.id} must touch a platform (or the level edge) at both ends so it really blocks the way`);
  }
  const lanterns = level.lanterns ?? [];
  assert(lanterns.length <= 2, `${id}: at most two lanterns`);
  for (const l of lanterns) carried(l, LANTERN, 'lantern');
  const lamps = level.lamps ?? [];
  assert(lamps.length <= 24, `${id}: at most 24 lamps`);
  for (const l of lamps) {
    point(l);
    assert(inside(level, l), `${id}: lamp outside the level`);
    assert(l.r === undefined || (finite(l.r) && l.r >= 120 && l.r <= 480), `${id}: lamp r must be 120–480`);
    assert(l.off === undefined || typeof l.off === 'boolean', `${id}: lamp off is true or false`);
  }
  const dark = level.dark ?? [];
  assert(dark.length <= 8, `${id}: at most eight dark rooms`);
  for (const d of dark) {
    rectangle(d);
    // 黑屋子可以连着地板一直框到摔死线
    assert(d.x >= 0 && d.y >= 0 && d.x + d.w <= level.w && d.y + d.h <= Math.max(level.h, level.deathY), `${id}: a dark room leaves the level`);
    assert(lanterns.length > 0 || lamps.some((l) => together(l, d) && contains(d, l)), `${id}: dark room at (${d.x}, ${d.y}) needs a lamp inside it, or a lantern somewhere in the level`);
  }
}

/**
 * 太空站（A10）：失重区在关里（可以框到摔死线）、至少 200 × 200、最多 6 块；拉杆在关里，开的门都有，把手不压在台子里；
 * 一扇写了 all 的门有几根拉杆，就得两两隔开 300 px 以上（一个人两只手够不着两根，得几个人一起拉）。
 * 拉杆的把手大小和 level.ts 的 leverRect 一样（默认 44 × 14）。
 */
const leverBox = (l) => ({ x: l.x - (l.w ?? 44) / 2, y: l.y - (l.h ?? 14) / 2, w: l.w ?? 44, h: l.h ?? 14 });
/**
 * 新机关（A12，Steve 11-18「机关太温和」）：涨潮、会塌的台子、摆锤、阵风的数在范围里、在关里。
 * 回放里还要真用上（inspect 里的 tideGap、crumbled、pendulumNear、windHit）。
 */
function newMechanics(level, id) {
  const range = (v, lo, hi, what) => assert(v === undefined || (finite(v) && v >= lo && v <= hi), `${id}: ${what} must be ${lo}–${hi}`);
  if (level.tide) {
    const t = level.tide;
    range(t.speed, 5, 45, 'tide speed');
    assert(finite(t.speed), `${id}: tide needs a speed`);
    range(t.delay, 2, 40, 'tide delay');
    range(t.from, level.goal.y, level.deathY, 'tide from');
    range(t.top, 0, level.deathY, 'tide top');
    assert(t.top === undefined || t.top >= level.goal.y + level.goal.h, `${id}: the tide must stop below the goal`);
  }
  for (const r of level.rects) {
    if (r.crumble === undefined) continue;
    range(r.crumble, 0.5, 4, 'crumble');
    range(r.regrow, 2, 12, 'regrow');
    assert(r.until === undefined, `${id}: a platform is either timed (until) or crumbles on touch, not both`);
    assert(r.w <= 400, `${id}: a crumbling platform is at most 400 px wide`);
  }
  for (const [k, p] of (level.pendulums ?? []).entries()) {
    assert(p.pivot && inside(level, p.pivot), `${id}: pendulum ${k} pivot outside the level`);
    range(p.len, 80, 600, 'pendulum len');
    range(p.amp, 0.15, 1.4, 'pendulum amp');
    range(p.period, 1.2, 6, 'pendulum period');
    range(p.r, 20, 60, 'pendulum r');
    range(p.phase, 0, 30, 'pendulum phase');
    for (const a of [-p.amp, p.amp]) assert(inside(level, { x: p.pivot.x + Math.sin(a) * p.len, y: p.pivot.y + Math.cos(a) * p.len }), `${id}: pendulum ${k} swings out of the level`);
  }
  for (const [k, w] of (level.winds ?? []).entries()) {
    rectangle(w);
    assert(['left', 'right', 'up', 'down'].includes(w.dir), `${id}: wind ${k} needs dir left / right / up / down`);
    assert(w.w >= 160 && w.h >= 160, `${id}: wind ${k} is at least 160 × 160`);
    range(w.force, 0.5, 2, 'wind force');
    range(w.on, 0.6, 4, 'wind on');
    range(w.off, 0.8, 6, 'wind off');
    range(w.phase, 0, 30, 'wind phase');
    assert(inside(level, w) && inside(level, { x: w.x + w.w, y: w.y + w.h }), `${id}: wind ${k} leaves the level`);
  }
}

/**
 * 长关（A13，Steve 11-18「关太短太直」，选了「新做一批长关替换最短的」）：写了 long: true 的关。
 * 路要绕（检查点不用一直往右）、长（出生点经过每个检查点到终点至少 LONG_ROUTE 像素）、分成至少 6 段；
 * 用上至少两样新机关；中等、困难按手酸录（stamina: true）；困难的会动、会转、会荡的东西至少 6 个，其中至少 2 个快的。
 * 主回放（多人关每份回放）至少 LONG_SECONDS 秒。
 */
const LONG_ROUTE = 6000;
const LONG_SECONDS = 150;
const LONG_CHECKPOINTS = 5;
function routeLength(level) {
  const pts = [level.spawn, ...(level.checkpoints ?? []), { x: level.goal.x + level.goal.w / 2, y: level.goal.y + level.goal.h / 2 }];
  return pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
}
const fastMachines = (level) =>
  (level.movers ?? []).filter((m) => m.speed >= 120).length +
  (level.spinners ?? []).filter((sp) => Math.abs(sp.spin) >= 1.5).length +
  (level.pendulums ?? []).filter((p) => p.period <= 2.4).length;
const machineCount = (level) => (level.movers?.length ?? 0) + (level.spinners?.length ?? 0) + (level.pendulums?.length ?? 0);
const newKinds = (level) => [level.tide, level.rects.some((r) => r.crumble !== undefined), level.pendulums?.length, level.winds?.length].filter(Boolean).length;
function longLevel(level, id, tier) {
  if (level.long === undefined) return;
  assert.equal(level.long, true, `${id}: long is true or left out`);
  const cps = level.checkpoints ?? [];
  assert(cps.length >= LONG_CHECKPOINTS, `${id}: a long level needs at least ${LONG_CHECKPOINTS} checkpoints (${LONG_CHECKPOINTS + 1} segments), has ${cps.length}`);
  const route = routeLength(level);
  assert(route >= LONG_ROUTE, `${id}: a long level's route (spawn → checkpoints → goal) must be at least ${LONG_ROUTE} px, is ${Math.round(route)}`);
  assert(newKinds(level) >= 2, `${id}: a long level uses at least two of the new machines (tide, crumbling platforms, pendulums, wind)`);
  // 简单的长关不追人：不涨潮，摆锤不烫
  if (tier === 0) assert(!level.tide && !(level.pendulums ?? []).some((p) => p.deadly), `${id}: an easy long level has no tide and no deadly pendulums`);
  if (tier >= 1) assert.equal(level.stamina, true, `${id}: a medium or hard long level is recorded with tired hands (stamina: true)`);
  if (tier >= 1) assert(machineCount(level) >= 3, `${id}: a medium long level needs at least three moving, spinning or swinging things`);
  if (tier === 2) {
    assert(machineCount(level) >= 6, `${id}: a hard long level needs at least six moving, spinning or swinging things, has ${machineCount(level)}`);
    assert(fastMachines(level) >= 2, `${id}: a hard long level needs at least two fast ones (mover ≥ 120 px/s, spinner ≥ 1.5 rad/s, pendulum period ≤ 2.4 s)`);
  }
}

function space(level, id) {
  const zones = level.zerog ?? [];
  assert(zones.length <= 6, `${id}: at most six zero-gravity zones`);
  for (const z of zones) {
    rectangle(z);
    assert(z.w >= 200 && z.h >= 200, `${id}: a zero-gravity zone is at least 200 × 200`);
    assert(z.x >= 0 && z.y >= 0 && z.x + z.w <= level.w && z.y + z.h <= Math.max(level.h, level.deathY), `${id}: a zero-gravity zone leaves the level`);
  }
  const levers = level.levers ?? [];
  const gateIds = new Set((level.gates ?? []).map((g) => g.id));
  for (const l of levers) {
    point(l);
    assert(typeof l.opens === 'string' && l.opens, `${id}: a lever names the gates it opens`);
    for (const g of l.opens.split(/\s+/).filter(Boolean)) assert(gateIds.has(g), `${id}: lever opens unknown gate ${g}`);
    assert(l.w === undefined || (finite(l.w) && l.w >= 24 && l.w <= 120), `${id}: lever w must be 24–120`);
    assert(l.h === undefined || (finite(l.h) && l.h >= 8 && l.h <= 40), `${id}: lever h must be 8–40`);
    const box = leverBox(l);
    assert(inside(level, box) && inside(level, { x: box.x + box.w, y: box.y + box.h }), `${id}: lever outside the level`);
    for (const r of level.rects) assert(!together(r, l) || !overlaps(r, box), `${id}: lever at (${l.x}, ${l.y}) sits inside a platform`);
  }
  for (const g of level.gates ?? []) {
    if (!g.all) continue;
    const mine = levers.filter((l) => l.opens.split(/\s+/).includes(g.id));
    for (let a = 0; a < mine.length; a++) for (let b = a + 1; b < mine.length; b++) {
      assert(Math.hypot(mine[a].x - mine[b].x, mine[a].y - mine[b].y) >= 300, `${id}: levers for gate ${g.id} (all) must be at least 300 px apart so one player can't hold two`);
    }
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
  assert.equal(level.world, worldOfId(id));
  assert(level.name?.zh && level.name.en && level.teaches, 'missing bilingual name / lesson');
  assert(finite(level.w) && level.w > 0 && finite(level.h) && level.h > 0);
  const scene = sceneOf(id);
  const cook = scene !== undefined;
  const long = level.long === true;
  assert(level.long === undefined || cook, `${id}: only levels of the new scenes (and multi levels) can be long`);
  // 新场景的关写明难度；困难那一档按难关的规矩查
  if (cook) assert([0, 1, 2].includes(level.tier), `${id}: a ${scene} level states its tier (0 easy, 1 medium, 2 hard)`);
  const hard = isHard(id) || (cook && level.tier === 2);
  if (cook) {
    const sc = SCENES[scene];
    assert(sc.teaches.has(level.teaches), `${id}: a ${scene} level teaches one of ${[...sc.teaches].join(' / ')}`);
    assert(sc.need(level), `${id}: a ${scene} level needs ${sc.needText}`);
  } else if (hard) assert(hardTeaches.has(level.teaches), `${id}: a hard level teaches one of ${[...hardTeaches].join(' / ')}`);
  else {
    assert.deepEqual(level.name, identities[id].name, id + ': C1 name changed');
    assert.equal(level.teaches, identities[id].teaches, id + ': C1 lesson changed');
  }
  // 难关按形状分：高过一屏的是攀爬关
  const vertical = hard || cook ? level.h > 720 : id === 'table-04' || id === 'van-08';
  if (vertical) {
    assert(level.h >= 1400 && level.h <= 2200, id + ': climb height must be 1400–2200');
    assert(level.spawn.y - (level.goal.y + level.goal.h) >= 720, id + ': climb route must rise at least one screen');
  } else assert(level.w >= 2400 && level.w <= 3600, id + ': width must be 2400–3600');
  assert(level.w <= 3600 && level.h <= 2200, id + ': at most three screens per axis');
  assert(level.goal.x >= level.w - 480 && level.goal.w <= 400 && level.goal.x + level.goal.w >= level.w - 160, id + ': goal must use the extended level');
  assert(level.spawn.x <= 600, id + ': spawn must retain the first-screen lesson');
  const chairs = (level.lifts ?? []).reduce((sum, l) => sum + Math.floor(Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y) / Math.max(40, l.gap)) + 1, 0);
  const carry = (level.keys?.length ?? 0) + (level.lanterns?.length ?? 0);
  const moving = (level.ropes ?? []).reduce((sum, r) => sum + r.segments, 0) + (level.seesaws?.length ?? 0) + (level.crates?.length ?? 0) + (level.movers?.length ?? 0) + (level.spinners?.length ?? 0) + (level.gates?.length ?? 0) + (level.pendulums?.length ?? 0) + chairs + carry;
  assert(moving <= 40, id + ': moving objects exceed 40 (rope links + seesaws + crates + movers + spinners + gates + lift chairs + keys and lanterns)');
  machines(level, id);
  gates(level, id);
  kitchen(level, id);
  snow(level, id);
  house(level, id);
  space(level, id);
  newMechanics(level, id);
  longLevel(level, id, tierOf(level));
  assert(level.rects.length + (level.fading?.length ?? 0) + (level.springs?.length ?? 0) <= 60, id + ': platforms exceed 60');
  point(level.spawn);
  assert(inside(level, level.spawn), id + ': spawn outside level');
  rectangle(level.goal);
  assert(finite(level.deathY) && level.deathY > level.spawn.y);
  if (long) {
    assert(level.par.seconds >= LONG_SECONDS && level.par.seconds <= 360, id + `: long par must be ${LONG_SECONDS}–360 s`);
    assert(Number.isInteger(level.par.deathsPerPlayer) && level.par.deathsPerPlayer >= (hard ? 2 : 0) && level.par.deathsPerPlayer <= 10, id + ': long par deaths must be 0–10 per player (hard 2–10)');
  } else if (hard) {
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
    // 长关的路会绕回来，检查点不用一直往右，只要按路上的顺序、隔得开
    if (index) assert((long || cp.x > cps[index - 1].x) && Math.hypot(cp.x - cps[index - 1].x, cp.y - cps[index - 1].y) >= 120, id + ': checkpoints must follow the route');
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
/** 关的难度：写了 tier 用它，没写按编号（1–6 简单、7–12 中等、13 往后困难），和游戏里 tierOfLevel 一样。 */
const tierOf = (level) => level.tier ?? (() => { const n = Number(/(\d+)$/.exec(level.id)?.[1] ?? 0); return n <= 6 ? 0 : n <= 12 ? 1 : 2; })();
/**
 * 手酸（A11）：写了 stamina: true 的中等、困难的关，和游戏里一样开着手酸跑回放（大关不分难度，没有手酸）。
 * 简单的关不许写；还没按手酸重录的中等、困难的关先不写，最后一行报还差几关。
 */
const staminaOn = (level) => level.stamina === true && !level.id.startsWith('team-') && tierOf(level) >= 1;
const staminaArgs = (level) => (staminaOn(level) ? [{ mode: 'climb', stamina: tierOf(level) === 2 ? 'hard' : 'medium' }] : []);
// Inspect real grips and release velocity while runReplay supplies the original inputs.
async function inspect(physics, level, replay) {
  const { createSim, runReplay, moverAt, spinnerAngle, spinnerArm, circleHitsRect, circleHitsBar, liftChairs, CFG } = physics;
  // 关卡按回放的人数摆（players 范围的东西照这个人数留或去）；下面的证据都按摆出来的这一版算
  const sim = await createSim(level, replay.players, ...staminaArgs(level));
  const laid = sim.level;
  const step = sim.step.bind(sim);
  const dangers = dangersOf(laid);
  // chainBySeg / throwsBySeg：每一段（出生到第一个检查点是第 0 段）里成串挂了几秒、丢了几次人
  const evidence = { chainSeconds: 0, throws: 0, chainBySeg: [], throwsBySeg: [], ropeGrabs: 0, propGrabs: 0, maxTilt: 0, checkpointTimes: [], cookieGrabs: (laid.fading ?? []).map(() => 0), springBounces: (laid.springs ?? []).map(() => 0), iceGrabs: 0,
    moverUse: (laid.movers ?? []).map(() => 0), spinnerUse: (laid.spinners ?? []).map(() => 0), near: dangers.map(() => false), gateOpen: (laid.gates ?? []).map(() => 0),
    ventRide: (laid.vents ?? []).map(() => 0), traySpills: 0, liftRide: (laid.lifts ?? []).map(() => 0), icyGrabs: laid.rects.map(() => 0),
    floatTime: (laid.zerog ?? []).map(() => 0), leverPulled: (laid.levers ?? []).map(() => false),
    // 新机关（A12）：涨潮离最低的活人最近多少、会塌的台子哪块塌过、摆锤有没有人靠近（锤心 1.5 个锤宽内）或被撞、阵风刮的时候有没有人在里面
    tideGap: Infinity, crumbled: laid.rects.map(() => false), pendulumNear: (laid.pendulums ?? []).map(() => false), windHit: (laid.winds ?? []).map(() => 0) };
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
    // 后厨：喷着的汽柱里有人正被往上托（往上走得比 100 px/s 快）
    sim.vents.forEach((v, k) => {
      if (!v.on) return;
      const reach = v.def.reach ?? CFG.ventReach;
      if (live.some((p) => p.body.vy < -100 && p.body.x >= v.def.x - 12 && p.body.x <= v.def.x + v.def.w + 12 && p.body.y >= v.def.y - reach && p.body.y <= v.def.y)) evidence.ventRide[k] += dt;
    });
    for (const e of sim.events) if (e.type === 'tray' && e.phase === 'spill') evidence.traySpills++;
    // 雪山：每根缆绳上有没有人站在座板上或抓着椅子；冰溜子有没有人抓过
    (laid.lifts ?? []).forEach((l, k) => {
      const parts = LIFT_PARTS[l.kind ?? 'chair'];
      const ridden = liftChairs(l, sim.time).some((c) => c.on && live.some((p) => {
        const seat = parts[0];
        const onSeat = Math.abs(p.body.x - c.x) <= seat.w / 2 + 6 && Math.abs(p.body.y - (c.y + seat.y - CFG.bodyR)) <= 10;
        return onSeat || p.arms.some((a) => a.grip && parts.some((q) => circleHitsRect(a.hand, CFG.handR + CFG.grabPad, { x: c.x + q.x, y: c.y + q.y, w: q.w, h: q.h })));
      }));
      if (ridden) evidence.liftRide[k] += dt;
    });
    for (const e of sim.events) if (e.type === 'grab' && e.kind === 'terrain') laid.rects.forEach((r, k) => { if (r.slip !== undefined && contains({ x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24 }, e)) evidence.icyGrabs[k]++; });
    // 太空站：每块失重区里有人飘过（身体在里面）、每根拉杆有人拉过
    (laid.zerog ?? []).forEach((z, k) => { if (live.some((p) => contains(z, p.body))) evidence.floatTime[k] += dt; });
    for (const e of sim.events) if (e.type === 'lever' && e.on) evidence.leverPulled[e.index] = true;
    // 新机关（A12）
    if (sim.tideY !== null && live.length) evidence.tideGap = Math.min(evidence.tideGap, sim.tideY - Math.max(...live.map((p) => p.body.y)));
    for (const e of sim.events) if (e.type === 'creak') laid.rects.forEach((r, k) => { if (r.x === e.x && r.y === e.y && r.w === e.w) evidence.crumbled[k] = true; });
    (laid.pendulums ?? []).forEach((pd, k) => {
      const at = physics.pendulumAt(pd, sim.time);
      if (live.some((p) => Math.hypot(p.body.x - at.x, p.body.y - at.y) <= (pd.r ?? 34) * 3 + CFG.bodyR)) evidence.pendulumNear[k] = true;
    });
    (laid.winds ?? []).forEach((w, k) => { if (physics.windState(w, sim.time).on && live.some((p) => contains(w, p.body))) evidence.windHit[k] += dt; });
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
    evidence.trayHome = sim.tray ? sim.tray.home : null;
    // 老宅：每把钥匙都开了它的门，每盏灭着的灯都点着了
    evidence.keysUsed = sim.keys.map((k) => k.used);
    evidence.lampsLit = sim.lamps.map((l) => l.on);
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
const lessons={crawl:'抓地爬行 / Crawl',gap:'过缝 / Cross a gap',swing:'荡过筷子 / Swing',climb:'攀爬 / Climb',rope:'面条绳索 / Rope swing',chain:'两人成链 / Form a chain',door:'夹门翻越 / Door handles',balance:'浮筒平衡 / Balance',throw:'丢队友 / Toss a teammate',ice:'雨天快抓 / Rain grips',combine:'连续机关 / Combined route',spike:'难关 · 尖刺 / Hard · Spikes',hot:'难关 · 烫手 / Hard · Hot stuff',zap:'难关 · 带电 / Hard · Live wires',mover:'难关 · 会动的台子 / Hard · Moving platforms',spinner:'难关 · 转杆 / Hard · Spinning bars',gauntlet:'难关 · 连环机关 / Hard · Gauntlet',steam:'后厨 · 蒸笼喷汽 / Kitchen · Ride the steam',tray:'后厨 · 端托盘 / Kitchen · Carry the tray',lift:'雪山 · 坐缆车 / Snow · Ride the lift',slip:'雪山 · 冰溜子 / Snow · Icy holds',key:'老宅 · 找钥匙开门 / Old house · Find the key',dark:'老宅 · 黑屋子 / Old house · In the dark',float:'太空站 · 失重 / Space · Zero gravity',lever:'太空站 · 一起拉杆 / Space · Pull the levers together',tide:'涨潮 / Rising tide',crumble:'会塌的台子 / Crumbling platforms',pendulum:'摆锤 / Pendulums',wind:'阵风 / Gusts'};
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

// C9 — isolated team-level rules. Base/C8 validation above is intentionally unchanged.
const teamIds = Array.from({ length: 6 }, (_, i) => `team-0${i + 1}`);
const teamDir = join(levelsDir, 'team');
const teamDocs = join(docsDir, 'team');
function teamLayoutGroups(level) {
  const groups = new Map();
  for (let n = 4; n <= 6; n++) {
    const sig = layoutLists(level)
      .map((list) => (list ?? []).map((it) => +present(it, n)).join(''))
      .join('|');
    groups.set(sig, [...(groups.get(sig) ?? []), n]);
  }
  return [...groups.values()];
}
function teamValidate(level, id, physics) {
  assert.equal(level.id, id);
  assert.equal(level.world, Number(id.slice(-2)) <= 3 ? 'table' : 'van');
  assert(
    typeof level.name?.zh === 'string' &&
      level.name.zh.trim() &&
      typeof level.name.en === 'string' &&
      level.name.en.trim(),
    `${id}: missing bilingual name`,
  );
  assert(
    ['longchain', 'counterweight', 'relay', 'combine'].includes(level.teaches),
    `${id}: invalid team lesson`,
  );
  if (['team-03', 'team-06'].includes(id))
    assert.equal(level.teaches, 'combine', `${id}: world finale must teach combine`);
  assert(
    finite(level.w) &&
      finite(level.h) &&
      level.w > 0 &&
      level.h > 0 &&
      level.w <= 3600 &&
      level.h <= 2200,
    `${id}: invalid size`,
  );
  point(level.spawn);
  rectangle(level.goal);
  assert(
    inside(level, level.spawn) &&
      inside(level, level.goal) &&
      inside(level, { x: level.goal.x + level.goal.w, y: level.goal.y + level.goal.h }),
    `${id}: spawn/goal outside level`,
  );
  if (level.h > 720) {
    assert(level.h >= 1400 && level.h <= 2200, `${id}: climb height must be 1400–2200`);
    assert(level.spawn.y - level.goal.y - level.goal.h >= 720, `${id}: climb must rise one screen`);
  } else assert(level.w >= 2400 && level.w <= 3600, `${id}: width must be 2400–3600`);
  assert(level.spawn.x <= 600, `${id}: spawn outside first screen`);
  assert(
    level.goal.x >= level.w - 480 &&
      level.goal.w <= 400 &&
      level.goal.x + level.goal.w >= level.w - 160,
    `${id}: goal must be at the route end`,
  );
  assert(finite(level.deathY) && level.deathY > level.spawn.y, `${id}: invalid deathY`);
  assert(
    finite(level.par?.seconds) && level.par.seconds >= 60 && level.par.seconds <= 240,
    `${id}: team par must be 60–240 seconds`,
  );
  assert(
    Number.isInteger(level.par.deathsPerPlayer) &&
      level.par.deathsPerPlayer >= 1 &&
      level.par.deathsPerPlayer <= 6,
    `${id}: team deaths must be 1–6 per player`,
  );
  assert.equal(level.replay, `replays/${id}.p4.json`);
  for (const item of layoutLists(level).flatMap((l) => l ?? []))
    if (item.players !== undefined) {
      const range = item.players;
      assert(
        Array.isArray(range) &&
          range.length === 2 &&
          range.every(Number.isInteger) &&
          range[0] >= 1 &&
          range[1] <= 6 &&
          range[0] <= range[1],
        `${id}: players must be [min, max] within 1–6`,
      );
    }
  const cps = level.checkpoints;
  assert(Array.isArray(cps) && cps.length, `${id}: missing checkpoints`);
  cps.forEach((cp, i) => {
    point(cp);
    assert(inside(level, cp), `${id}: checkpoint ${i} outside level`);
    if (i)
      assert(
        cp.x > cps[i - 1].x && Math.hypot(cp.x - cps[i - 1].x, cp.y - cps[i - 1].y) >= 120,
        `${id}: checkpoints must follow the route`,
      );
  });
  for (let x = 0; x < Math.ceil(level.w / 1280); x++)
    assert(
      cps.some((cp) => Math.floor(cp.x / 1280) === x),
      `${id}: horizontal screen ${x + 1} lacks checkpoint`,
    );
  if (level.h > 720)
    for (let y = 0; y < Math.ceil(level.h / 720); y++)
      assert(
        cps.some((cp) => Math.floor(cp.y / 720) === y),
        `${id}: vertical screen ${y + 1} lacks checkpoint`,
      );
  for (let n = 4; n <= 6; n++) {
    const laid = physics.forPlayers(level, n);
    // Reuse the exact A6 machine geometry checks on the selected layout. The team
    // range validation above allows 5/6-only objects without changing C8's limits.
    const unranged = { ...laid };
    for (const key of [
      'rects',
      'ropes',
      'seesaws',
      'crates',
      'fading',
      'springs',
      'hazards',
      'movers',
      'spinners',
    ])
      unranged[key] = (laid[key] ?? []).map(({ players, ...item }) => item);
    machines(unranged, id);
    assert(Array.isArray(laid.rects) && laid.rects.length, `${id}: missing platforms`);
    const moving =
      (laid.ropes ?? []).reduce((v, r) => v + r.segments, 0) +
      ['seesaws', 'crates', 'movers', 'spinners'].reduce((v, k) => v + (laid[k]?.length ?? 0), 0);
    assert(moving <= 40, `${id}: moving objects exceed 40`);
    assert(dangersOf(laid).length <= 40, `${id}: deadly things exceed 40`);
    const boxes = [
      ...laid.rects,
      ...(laid.crates ?? []),
      ...(laid.fading ?? []).map((r) => ({ material: 'wood', ...r })),
      ...(laid.springs ?? []).map((r) => ({ material: 'wood', ...r })),
    ];
    for (const saw of laid.seesaws ?? []) {
      point(saw.pivot);
      boxes.push({
        x: saw.pivot.x - saw.w / 2,
        y: saw.pivot.y - (saw.h ?? 14) / 2,
        w: saw.w,
        h: saw.h ?? 14,
        material: saw.material,
      });
    }
    assert(boxes.length <= 60, `${id}: platforms exceed 60`);
    boxes.forEach((r) => {
      rectangle(r);
      assert(materials.has(r.material), `${id}: unknown material ${r.material}`);
      assert(
        inside(level, r) && inside(level, { x: r.x + r.w, y: r.y + r.h }),
        `${id}: platform outside level`,
      );
    });
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++)
        assert(
          !overlaps(boxes[a], boxes[b]),
          `${id}: platforms ${a}/${b} overlap with ${n} players`,
        );
    for (const rope of laid.ropes ?? []) {
      point(rope.anchor);
      assert(
        inside(level, rope.anchor) &&
          Number.isInteger(rope.segments) &&
          rope.segments > 0 &&
          finite(rope.segLen) &&
          rope.segLen > 0,
        `${id}: invalid rope`,
      );
    }
    for (const r of laid.crates ?? [])
      assert(r.mass === undefined || (finite(r.mass) && r.mass > 0), id + ': invalid crate mass');
    for (const r of laid.fading ?? [])
      for (const k of ['on', 'off', 'phase'])
        assert(r[k] === undefined || (finite(r[k]) && r[k] >= 0), `${id}: invalid fading ${k}`);
    for (const r of laid.springs ?? [])
      assert(
        r.power === undefined || (finite(r.power) && r.power > 0),
        `${id}: invalid spring power`,
      );
    for (const [i, at] of [level.spawn, ...cps].entries())
      for (let player = 0; player < 6; player++) {
        const p = { x: at.x + player * (i === 0 ? 44 : 30), y: at.y };
        const label = i === 0 ? 'spawn' : `checkpoint ${i - 1}`;
        assert(
          laid.rects.some(
            (r) =>
              r.until === undefined &&
              p.x - 24 >= r.x &&
              p.x + 24 <= r.x + r.w &&
              r.y - p.y >= 24 &&
              r.y - p.y <= 80,
          ),
          `${id}: ${label} lacks permanent footing within 80px for P${player + 1} with ${n} players`,
        );
        assert(
          !(laid.crates ?? []).some((r) => physics.circleHitsRect(p, 24 - 1e-6, r)),
          id + ': ' + label + ' overlaps a crate for P' + (player + 1) + ' with ' + n + ' players',
        );
        assert(
          !(laid.hazards ?? []).some((h) => circleHits(p, 84, h)),
          `${id}: ${label} is too close to a hazard for P${player + 1}`,
        );
      }
  }
}
async function inspectTeam(physics, level, replay) {
  const sections = Array.from({ length: level.checkpoints.length + 1 }, () => ({
    chain: 0,
    weight: 0,
    push: 0,
    relays: 0,
    chainLongest: 0,
    weightLongest: 0,
    pushLongest: 0,
  }));
  let chainRun = 0,
    weightRun = 0,
    pushRun = 0,
    lastSegment = -1;
  let propUse = [],
    ropeUse = [],
    starts = [];
  const wrapped = {
    ...physics,
    createSim: async (...args) => {
      const sim = await physics.createSim(...args, { mode: 'team' });
      propUse = sim.props.map(() => 0);
      ropeUse = sim.ropes.map(() => 0);
      starts = sim.props.map((p) => ({ x: p.x, y: p.y }));
      const original = sim.step.bind(sim);
      sim.step = (dt) => {
        const segment = sim.checkpoint + 1,
          before = sim.players.map((p) =>
            p.arms.map((a) => a.grip && { kind: a.grip.kind, player: a.grip.player }),
          ),
          velocities = sim.players.map((p) => ({ ...p.body }));
        original(dt);
        const ev = sections[segment];
        if (segment !== lastSegment) {
          chainRun = weightRun = pushRun = 0;
          lastSegment = segment;
        }
        function depth(p, seen = new Set()) {
          if (!p || p.dead || p.ground || seen.has(p.id)) return 0;
          const path = new Set([...seen, p.id]);
          let n = p.arms.some((a) => ['terrain', 'rope'].includes(a.grip?.kind)) ? 1 : 0;
          for (const a of p.arms)
            if (a.grip?.kind === 'player') {
              const up = depth(sim.players[a.grip.player], path);
              if (up) n = Math.max(n, up + 1);
            }
          return n;
        }
        const chain = Math.max(0, ...sim.players.map((p) => depth(p))) >= 3;
        sim.ropes.forEach((_, i) => {
          if (
            sim.players.some(
              (p) => !p.dead && p.arms.some((a) => a.grip?.kind === 'rope' && a.grip.rope === i),
            )
          )
            ropeUse[i] += dt;
        });
        let weight = false,
          push = false;
        sim.props.forEach((prop, i) => {
          const c = Math.cos(prop.angle),
            ss = Math.sin(prop.angle);
          const users = sim.players.filter((p) => {
            if (p.dead) return false;
            if (p.arms.some((a) => a.grip?.kind === 'prop' && a.grip.prop === i)) return true;
            const dx = p.body.x - prop.x,
              dy = p.body.y - prop.y,
              x = dx * c + dy * ss,
              y = -dx * ss + dy * c;
            if (prop.kind === 'seesaw')
              return (
                p.ground &&
                Math.abs(x) <= prop.w / 2 + physics.CFG.bodyR &&
                Math.abs(y + prop.h / 2 + physics.CFG.bodyR) <= 12
              );
            return physics.circleHitsRect({ x, y }, physics.CFG.bodyR + 3, {
              x: -prop.w / 2,
              y: -prop.h / 2,
              w: prop.w,
              h: prop.h,
            });
          }).length;
          if (users) propUse[i] += dt;
          if (prop.kind === 'seesaw' && Math.abs(prop.angle) > 0.05 && users >= 3) weight = true;
          if (
            prop.kind === 'crate' &&
            users >= 3 &&
            prop.x - starts[i].x >= 40 &&
            prop.rb.linvel().x > 1
          )
            push = true;
        });
        if (chain) ev.chain += dt;
        if (weight) ev.weight += dt;
        if (push) ev.push += dt;
        chainRun = chain ? chainRun + dt : 0;
        weightRun = weight ? weightRun + dt : 0;
        pushRun = push ? pushRun + dt : 0;
        ev.chainLongest = Math.max(ev.chainLongest, chainRun);
        ev.weightLongest = Math.max(ev.weightLongest, weightRun);
        ev.pushLongest = Math.max(ev.pushLongest, pushRun);
        const released = new Set();
        sim.players.forEach((p, i) =>
          p.arms.forEach((a, j) => {
            const old = before[i][j];
            if (
              old?.kind === 'player' &&
              !a.grip &&
              !p.dead &&
              !sim.players[old.player].dead &&
              !p.grab[j]
            ) {
              const v = velocities[old.player];
              if (
                v.vx > 150 &&
                v.vy < -100 &&
                v.x > level.spawn.x + 50 &&
                !released.has(old.player)
              ) {
                released.add(old.player);
                ev.relays++;
              }
            }
          }),
        );
      };
      return sim;
    },
  };
  const inspected = await inspect(wrapped, level, replay);
  const kinds = (s) =>
    [
      s.chainLongest >= 0.25 ? 'chain' : null,
      s.weightLongest >= 0.25 ? 'counterweight' : null,
      s.pushLongest >= 0.25 ? 'push' : null,
      s.relays ? 'relay' : null,
    ].filter(Boolean);
  let idle = 0,
    longestIdle = 0;
  for (const frame of replay.frames) {
    const stopped = frame.every((p) => Math.hypot(p.ax, p.ay) < 0.12 && !p.gl && !p.gr);
    idle = stopped ? idle + replay.dt : 0;
    longestIdle = Math.max(longestIdle, idle);
  }
  return {
    ...inspected,
    team: {
      sections: sections.map((s) => ({ ...s, kinds: kinds(s) })),
      propUse,
      ropeUse,
      longestIdle,
    },
  };
}
async function checkTeams(physics, existing) {
  const files = await readdir(teamDir).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });
  const found = files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  found.forEach((id) =>
    assert(teamIds.includes(id), `unexpected team level ${id}: team-01…team-06 only`),
  );
  const replayFiles = await readdir(join(teamDir, 'replays')).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });
  const allowed = found.flatMap((id) => [4, 5, 6].map((n) => `${id}.p${n}.json`));
  replayFiles
    .filter((f) => f.endsWith('.json'))
    .forEach((f) => assert(allowed.includes(f), `unexpected team replay ${f}`));
  const entries = [];
  const readme = await readFile(join(teamDocs, 'README.md'), 'utf8');
  const manifest = readme.match(/<!-- C9_TEAM_SECTIONS (.+) -->/);
  assert(
    manifest,
    'team README: missing C9_TEAM_SECTIONS manifest (zero-based section indices from full probe)',
  );
  const hardSections = JSON.parse(manifest[1]);
  if (found.length) {
    console.log('\nTeam levels (4–6 players)');
    console.log(
      '| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | 3+ chain / weight+push (s) | Relays | Solo cleared |',
    );
    console.log('| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | ---: | --- |');
  }
  for (const id of teamIds.filter((id) => found.includes(id))) {
    const level = await readJSON(join(teamDir, `${id}.json`));
    teamValidate(level, id, physics);
    const hard = hardSections[id];
    assert(
      Array.isArray(hard) &&
        new Set(hard).size === hard.length &&
        hard.length >= 2 &&
        hard.every((k) => Number.isInteger(k) && k >= 0 && k <= level.checkpoints.length) &&
        hard.some((k) => k > 0),
      id + ': needs at least two distinct probe-blocked sections, including one after the opening',
    );
    const replays = [];
    for (const group of teamLayoutGroups(level))
      for (const n of group) {
        const filename = `${id}.p${n}.json`;
        assert(
          replayFiles.includes(filename),
          `${id}: missing ${n}-player team replay (levels/team/replays/${filename})`,
        );
        const replay = await readJSON(join(teamDir, 'replays', filename));
        assert.deepEqual(
          Object.keys(replay).sort(),
          ['dt', 'frames', 'level', 'players'],
          `${filename}: replay contains state overrides`,
        );
        replayShape(level, replay, id, n);
        const { result, evidence, laid, team } = await inspectTeam(physics, level, replay);
        const times = [0, ...evidence.checkpointTimes, result.seconds],
          segments = times.slice(1).map((v, i) => v - times[i]),
          ratio = result.seconds / level.par.seconds;
        assert(
          team.longestIdle <= 3 + 1e-6,
          id + ' (' + n + ' players): all-inputs idle exceeds 3s: ' + team.longestIdle.toFixed(2),
        );
        for (const k of hard)
          assert(
            team.sections[k].kinds.length,
            id +
              ' (' +
              n +
              ' players): probe-blocked section ' +
              k +
              ' has no actual 3+ rooted chain, 3+ weight/push, or relay',
          );
        assert(
          hard.some(
            (k) =>
              team.sections[k].chainLongest >= 0.25 ||
              team.sections[k].weightLongest >= 0.25 ||
              team.sections[k].pushLongest >= 0.25,
          ),
          id + ' (' + n + ' players): blocked sections need an actual 3+ chain or 3+ weight/push',
        );
        if (level.teaches === 'longchain')
          assert(
            hard.some((k) => team.sections[k].chainLongest >= 0.25),
            id + ': longchain lesson needs a 3+ rooted chain for 0.25s in a blocked section',
          );
        if (level.teaches === 'relay')
          assert(
            hard.reduce((v, k) => v + team.sections[k].relays, 0) >= 2,
            id + ': relay lesson needs at least two throws in blocked sections',
          );
        assert(
          result.won,
          `${id} (${n} players): replay did not reach the goal: ${JSON.stringify(result.final)}`,
        );
        assert.equal(
          evidence.checkpointTimes.length,
          level.checkpoints.length,
          `${id} (${n} players): missed checkpoint`,
        );
        assert(
          segments.every((t) => t >= 15 && t <= 60),
          `${id} (${n} players): checkpoint segment outside 15–60s: ${segments.map((t) => t.toFixed(2)).join('/')}`,
        );
        assert(ratio >= 0.5 && ratio <= 2, `${id} (${n} players): time outside par × [0.5, 2]`);
        assert(
          result.deaths.reduce((a, b) => a + b, 0) <= level.par.deathsPerPlayer * n,
          `${id} (${n} players): team deaths exceed budget`,
        );
        if (level.teaches === 'combine')
          assert(
            hard.some((a, i) =>
              hard
                .slice(i + 1)
                .some((b) =>
                  team.sections[a].kinds.some((ka) =>
                    team.sections[b].kinds.some((kb) => ka !== kb),
                  ),
                ),
            ),
            id +
              ' (' +
              n +
              ' players): combine needs two different mechanics in two distinct blocked sections',
          );
        team.propUse.forEach((v, i) => assert(v >= 0.25, `${id}: prop ${i} bypassed`));
        team.ropeUse.forEach((v, i) => assert(v >= 0.25, `${id}: rope ${i} bypassed`));
        evidence.cookieGrabs.forEach((v) => assert(v > 0, `${id}: cookie bypassed`));
        evidence.springBounces.forEach((v) => assert(v > 0, `${id}: candle bypassed`));
        if (laid.ropes?.length) assert(evidence.ropeGrabs > 0, `${id}: rope bypassed`);
        evidence.moverUse.forEach((v, i) =>
          assert(laid.movers[i].deadly || v >= 0.25, `${id}: moving platform ${i} bypassed`),
        );
        evidence.spinnerUse.forEach((v, i) =>
          assert(laid.spinners[i].deadly || v >= 0.25, `${id}: spinning bar ${i} bypassed`),
        );
        evidence.near.forEach((v, i) => assert(v, `${id}: deadly thing ${i} outside route`));
        // A solo control uses this team's selected geometry, with range tags removed
        // so runReplay's one-player setup cannot discard 4/5/6-only mechanisms.
        const soloLevel = { ...laid };
        for (const key of [
          'rects',
          'ropes',
          'seesaws',
          'crates',
          'fading',
          'springs',
          'hazards',
          'movers',
          'spinners',
        ])
          soloLevel[key] = (laid[key] ?? []).map(({ players, ...item }) => item);
        for (let p = 0; p < n; p++) {
          const solo = { ...replay, players: 1, frames: replay.frames.map((f) => [f[p]]) };
          assert.equal(
            (await physics.runReplay(level, solo)).won,
            false,
            `${id}.p${n}: P${p + 1} solo bypass (original layout selection)`,
          );
          assert.equal(
            (await physics.runReplay(soloLevel, solo)).won,
            false,
            `${id}.p${n}: P${p + 1} solo bypass`,
          );
        }
        console.log(
          `| ${id} | ${n} | ${result.seconds.toFixed(2)} | ${result.deaths.join(' / ')} | YES | ${ratio.toFixed(3)} | ${level.w}×${level.h} | ${segments.map((v) => v.toFixed(2)).join(' / ')} | ${team.sections.reduce((v, s) => v + s.chain, 0).toFixed(2)} / ${team.sections.reduce((v, s) => v + s.weight + s.push, 0).toFixed(2)} | ${team.sections.reduce((v, s) => v + s.relays, 0)} | 0/${n} |`,
        );
        console.log(id + '.p' + n + ' sections (zero-based):');
        console.log(
          '| Section | Needs crew (probe) | Replay mechanics | Longest chain / weight / push (s) | Relays |',
        );
        console.log('| ---: | :---: | --- | --- | ---: |');
        team.sections.forEach((s, k) =>
          console.log(
            '| ' +
              k +
              ' | ' +
              (hard.includes(k) ? 'YES' : 'no') +
              ' | ' +
              (s.kinds.join(', ') || '—') +
              ' | ' +
              [s.chainLongest, s.weightLongest, s.pushLongest]
                .map((v) => v.toFixed(2))
                .join(' / ') +
              ' | ' +
              s.relays +
              ' |',
          ),
        );
        replays.push({ replay, result, evidence, team, segments });
      }
    entries.push({
      level,
      hard,
      replay: replays.find((r) => r.replay.players === 6).replay,
      replays,
    });
    if (!process.argv.includes('--screenshots') && !process.argv.includes('--team-screenshots')) {
      const png = await readFile(join(teamDocs, `${id}.png`));
      assert(
        png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        `${id}: invalid PNG`,
      );
      assert.equal(png.readUInt32BE(16), 1280);
      assert.equal(png.readUInt32BE(20), 720);
    }
  }
  for (const a of entries)
    for (const b of [...existing, ...entries]) {
      if (a === b) continue;
      const whole = jaccard(surfaceCells(a.level), surfaceCells(b.level));
      assert(
        whole <= SAME_LEVEL,
        `${a.level.id} and ${b.level.id} share ${(whole * 100).toFixed(0)}% of platforms; team levels need their own layouts`,
      );
      if (entries.includes(b))
        assert(
          jaccard(firstScreen(a.level), firstScreen(b.level)) <= SAME_START,
          `${a.level.id}/${b.level.id}: repeated team opening`,
        );
    }
  if (entries.length === 6) {
    assert(
      entries.some(({ level }) => level.teaches === 'longchain'),
      'team levels: missing longchain lesson',
    );
    assert(
      entries.some(({ level }) => level.teaches === 'relay'),
      'team levels: missing relay lesson',
    );
    const scaled = entries.filter(({ level, hard }) => {
      const inHard = (item) => {
        const x = item.x ?? item.anchor?.x ?? item.pivot?.x;
        return hard.some(
          (k) =>
            x >= (k ? level.checkpoints[k - 1].x : level.spawn.x) &&
            x <= (level.checkpoints[k]?.x ?? level.goal.x + level.goal.w),
        );
      };
      const four = physics.forPlayers(level, 4);
      return [5, 6].some((n) => {
        const more = physics.forPlayers(level, n);
        const area = (l) => surfaceCells({ ...l, rects: (l.rects ?? []).filter(inHard) }).size;
        const ropes = (l) => (l.ropes ?? []).filter(inHard).reduce((v, r) => v + r.segments, 0);
        const danger = (l) => dangersOf(l).filter((d) => inHard(dangerBox(d))).length;
        const higher =
          (more.rects ?? [])
            .filter(inHard)
            .some(
              (r) =>
                r.kind === 'peg' &&
                !present(r, 4) &&
                (four.rects ?? [])
                  .filter(inHard)
                  .some(
                    (b) =>
                      b.kind === 'peg' &&
                      !present(b, n) &&
                      r.x < b.x + b.w &&
                      b.x < r.x + r.w &&
                      r.y < b.y,
                  ),
            ) ||
          (more.ropes ?? [])
            .filter(inHard)
            .some(
              (r) =>
                !present(r, 4) &&
                (four.ropes ?? [])
                  .filter(inHard)
                  .some(
                    (b) =>
                      !present(b, n) &&
                      r.anchor.x === b.anchor.x &&
                      r.anchor.y + r.segments * r.segLen < b.anchor.y + b.segments * b.segLen,
                  ),
            );
        return (
          area(more) < area(four) ||
          ropes(more) < ropes(four) ||
          danger(more) > danger(four) ||
          higher
        );
      });
    });
    assert(
      scaled.length >= 3,
      'team levels: at least three must get harder with 5/6 players inside probe-blocked sections',
    );
  }
  if (
    entries.length &&
    (process.argv.includes('--screenshots') ||
      process.argv.includes('--team-screenshots') ||
      process.argv.includes('--serve-team'))
  )
    await serveTeams(
      entries,
      process.argv.includes('--screenshots') || process.argv.includes('--team-screenshots'),
    );
  return entries;
}
async function serveTeams(entries, screenshot) {
  // C9 review uses the same Pixi review source and camera, with only the lessons,
  // selector and data endpoints adapted to team IDs. Six players are loaded.
  const source = browserSource
    .replace("||'table-01'", "||'team-01'")
    .replace(
      'lessons[level.teaches]',
      "({counterweight:'三人配重 / Counterweight crew',longchain:'三人成串 / Long chain',relay:'递送队友 / Relay',combine:'合力接力 / Combined teamwork'})[level.teaches]",
    );
  const bundle = await build({
    stdin: { contents: source, resolveDir: root },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const tokens = await readFile(resolve(root, '../../site/src/styles/tokens.css'));
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        reviewPage().replace(
          /<select aria-label="关卡 \/ Level">.*?<\/select>/,
          `<select aria-label="关卡 / Level">${entries.map((e) => `<option>${e.level.id}</option>`).join('')}</select>`,
        ),
      );
    } else if (path === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(bundle.outputFiles[0].contents);
    } else if (path === '/tokens.css') {
      res.setHeader('Content-Type', 'text/css');
      res.end(tokens);
    } else if (/^\/art\/(table|van)-far\.webp$/.test(path))
      readFile(resolve(root, path.slice(1))).then(
        (data) => {
          res.setHeader('Content-Type', 'image/webp');
          res.end(data);
        },
        () => {
          res.writeHead(404);
          res.end();
        },
      );
    else {
      const m = /^\/(levels|replays)\/(team-0[1-6])$/.exec(path),
        e = m && entries.find((e) => e.level.id === m[2]);
      if (!e) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(m[1] === 'levels' ? e.level : e.replay));
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    if (!screenshot) {
      console.log(`Team review: ${url}`);
      await new Promise((ok) => process.once('SIGINT', ok));
      return;
    }
    const playwright = createRequire(import.meta.url)(
      process.env.HANG_ON_PLAYWRIGHT || join(root, 'node_modules/playwright'),
    );
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: process.env.HANG_ON_CHROMIUM || undefined,
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    for (const { level } of entries) {
      await page.goto(`${url}/?id=${level.id}`);
      await page.waitForFunction(() => window.ready === true);
      assert.equal(await page.evaluate(() => window.levelReview.sim.players.length), 6);
      await page.screenshot({ path: join(teamDocs, `${level.id}.png`) });
      console.log(`Screenshot: docs/levels/team/${level.id}.png (1280×720, 6 players)`);
    }
  } finally {
    await browser?.close();
    await new Promise((ok) => server.close(ok));
  }
}
// C14 — only this section validates levels/multi. C1/C8/C9 checks remain unchanged.
const multiIds = Array.from({ length: 9 }, (_, i) => `multi-0${i + 1}`);
const multiDir = join(levelsDir, 'multi');
const multiDocs = join(docsDir, 'multi');
function multiLayouts(level, physics) {
  const groups = new Map();
  for (const n of [2, 3, 4]) {
    const laid = physics.forPlayers(level, n);
    const sig = JSON.stringify(layoutLists(laid));
    const group = groups.get(sig) ?? [];
    group.push(n);
    groups.set(sig, group);
  }
  return [...groups.values()];
}
function multiUnranged(level) {
  const out = { ...level };
  for (const key of ['rects', 'ropes', 'seesaws', 'crates', 'fading', 'springs', 'hazards', 'movers', 'spinners', 'plates', 'gates', 'vents', 'lifts', 'keys', 'lanterns', 'lamps', 'dark', 'zerog', 'levers', 'pendulums', 'winds'])
    if (out[key]) out[key] = out[key].map(({ players, ...item }) => item);
  return out;
}
function multiValidate(l, id, physics) {
  assert.equal(l.id, id);
  assert.equal(l.tier, Math.floor((Number(id.slice(-2)) - 1) / 3), `${id}: wrong tier`);
  // 长关（A13）可以用四个新场景的世界
  assert(['table', 'van', ...(l.long ? ['kitchen', 'snow', 'house', 'space'] : [])].includes(l.world), `${id}: world must be table or van${l.long ? ' or a new scene' : ' (a long level may use a new scene)'}`);
  assert(typeof l.name?.zh === 'string' && l.name.zh.trim() && typeof l.name?.en === 'string' && l.name.en.trim(), `${id}: missing bilingual name`);
  assert(['chain', 'throw', 'boost', 'hold', 'counterweight', 'relay', 'combine', ...NEW_TEACHES].includes(l.teaches), `${id}: invalid multi lesson`);
  if (Number(id.slice(-2)) % 3 === 0) assert.equal(l.teaches, 'combine', `${id}: tier finale must teach combine`);
  point(l.spawn); rectangle(l.goal);
  assert(finite(l.w) && finite(l.h) && l.w > 0 && l.h > 0 && l.w <= 3600 && l.h <= 2200, `${id}: invalid size`);
  assert(inside(l, l.spawn) && l.spawn.x <= 600 && inside(l, l.goal) && inside(l, { x: l.goal.x + l.goal.w, y: l.goal.y + l.goal.h }), `${id}: spawn/goal outside route`);
  if (l.h > 720) assert(l.h >= 1400 && l.spawn.y - l.goal.y - l.goal.h >= 720, `${id}: climb height must be 1400–2200 and rise a screen`);
  else assert(l.w >= 2400, `${id}: horizontal width must be 2400–3600`);
  assert(l.goal.x >= l.w - 480 && l.goal.w <= 400 && l.goal.x + l.goal.w >= l.w - 160, `${id}: goal must be at route end`);
  assert(finite(l.deathY) && l.deathY > l.spawn.y, `${id}: invalid deathY`);
  if (l.long) assert(finite(l.par?.seconds) && l.par.seconds >= LONG_SECONDS && l.par.seconds <= 360, `${id}: long par must be ${LONG_SECONDS}–360 s`);
  else assert(finite(l.par?.seconds) && l.par.seconds >= (l.tier === 2 ? 120 : 60) && l.par.seconds <= (l.tier === 0 ? 120 : 240), `${id}: par outside tier budget`);
  assert(Number.isInteger(l.par.deathsPerPlayer) && l.par.deathsPerPlayer >= 1 && l.par.deathsPerPlayer <= (l.long ? 10 : 6), `${id}: deaths budget must be 1–${l.long ? 10 : 6}`);
  newMechanics(l, id);
  longLevel(l, id, l.tier);
  assert.equal(l.replay, `replays/${id}.p4.json`);
  for (const it of layoutLists(l).flatMap(v => v ?? [])) if (it.players !== undefined)
    assert(Array.isArray(it.players) && it.players.length === 2 && it.players.every(Number.isInteger) && it.players[0] >= 1 && it.players[1] <= 6 && it.players[0] <= it.players[1], `${id}: invalid players range`);
  const cps = l.checkpoints;
  assert(Array.isArray(cps) && cps.length, `${id}: missing checkpoints`);
  cps.forEach((p, i) => { point(p); assert(inside(l, p), `${id}: checkpoint outside level`); if (i) assert((l.long || p.x > cps[i - 1].x) && Math.hypot(p.x - cps[i - 1].x, p.y - cps[i - 1].y) >= 120, `${id}: checkpoint order`); });
  for (let x = 0; x < Math.ceil(l.w / 1280); x++) assert(cps.some(p => Math.floor(p.x / 1280) === x), `${id}: horizontal screen ${x + 1} lacks checkpoint`);
  if (l.h > 720) for (let y = 0; y < Math.ceil(l.h / 720); y++) assert(cps.some(p => Math.floor(p.y / 720) === y), `${id}: vertical screen ${y + 1} lacks checkpoint`);
  for (const n of [2, 3, 4]) {
    const laid = multiUnranged(physics.forPlayers(l, n));
    machines(laid, id); gates(laid, id);
    // 长关可以用新场景的世界和它们的机关（A13）：照单人关的规矩查
    kitchen(laid, id); snow(laid, id); house(laid, id); space(laid, id);
    const chairs = (laid.lifts ?? []).reduce((sum, lf) => sum + Math.floor(Math.hypot(lf.to.x - lf.from.x, lf.to.y - lf.from.y) / Math.max(40, lf.gap)) + 1, 0);
    const moving = (laid.ropes ?? []).reduce((v, r) => v + r.segments, 0) + ['seesaws', 'crates', 'movers', 'spinners', 'gates', 'pendulums', 'keys', 'lanterns'].reduce((v, k) => v + (laid[k]?.length ?? 0), 0) + chairs;
    assert(moving <= 40, `${id}: moving objects exceed 40`);
    assert(dangersOf(laid).length <= 40, `${id}: deadly things exceed 40`);
    const boxes = [...laid.rects, ...(laid.fading ?? []), ...(laid.springs ?? []), ...(laid.crates ?? []), ...(laid.seesaws ?? []).map(s => ({ x: s.pivot.x - s.w / 2, y: s.pivot.y - (s.h ?? 14) / 2, w: s.w, h: s.h ?? 14, material: s.material }))];
    assert(boxes.length <= 60, `${id}: platforms exceed 60`);
    boxes.forEach(r => { rectangle(r); assert(materials.has(r.material ?? 'wood'), `${id}: unknown material`); assert(inside(l, r) && inside(l, { x: r.x + r.w, y: r.y + r.h }), `${id}: platform outside level`); });
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) assert(!overlaps(boxes[a], boxes[b]), `${id}: platforms ${a}/${b} overlap (${n} players)`);
    for (const rope of laid.ropes ?? []) { point(rope.anchor); assert(inside(l, rope.anchor) && Number.isInteger(rope.segments) && rope.segments > 0 && finite(rope.segLen) && rope.segLen > 0, `${id}: invalid rope`); }
    for (const [k, at] of [l.spawn, ...cps].entries()) for (let i = 0; i < 4; i++) {
      const p = { x: at.x + i * (k ? 30 : 44), y: at.y };
      assert(laid.rects.some(r => r.until === undefined && r.x <= p.x - 24 && r.x + r.w >= p.x + 24 && r.y - p.y >= 24 && r.y - p.y <= 80), `${id}: ${k ? 'checkpoint ' + k : 'spawn'} lacks permanent footing within 80px for P${i + 1} (${n} players)`);
      assert(!boxes.some(r => physics.circleHitsRect(p, 24 - 1e-6, r)), `${id}: respawn overlaps a platform`);
    }
    const danger = dangersOf(laid);
    if (l.tier === 0) assert(!danger.length && !laid.tide && !(laid.pendulums ?? []).some((p) => p.deadly), `${id}: easy level must have no deadly things (no tide, no deadly pendulums either)`);
    if (l.tier === 2) assert(danger.length && ((laid.movers?.length ?? 0) + (laid.spinners?.length ?? 0)) > 0, `${id}: hard level needs deadly things and moving machinery`);
  }
}
async function inspectMulti(physics, level, replay) {
  const sections = Array.from({ length: level.checkpoints.length + 1 }, () => ({ chain: 0, boost: 0, throws: 0, holds: 0 }));
  let chainRun = 0, boostRun = 0, priorSeg = -1;
  let idle = 0, longestIdle = 0;
  const wrapped = { ...physics, createSim: async (...args) => {
    const sim = await physics.createSim(...args);
    const original = sim.step.bind(sim);
    const plateRuns = sim.plates.map(() => sim.players.map(() => 0));
    sim.step = dt => {
      const seg = sim.checkpoint + 1, ev = sections[seg];
      const before = sim.players.map(p => ({ ...p.body, grips: p.arms.map(a => a.grip && { kind: a.grip.kind, player: a.grip.player }) }));
      original(dt);
      // Riding a moving lift is progress even with neutral sticks. Count a pause
      // only when every controller is idle and every live body is stationary.
      const paused = sim.players.every(p => p.dead || (Math.hypot(p.aim.x, p.aim.y) < .12 && !p.grab[0] && !p.grab[1] && Math.hypot(p.body.vx, p.body.vy) < 8));
      idle = paused ? idle + dt : 0;
      longestIdle = Math.max(longestIdle, idle);
      if (seg !== priorSeg) { chainRun = boostRun = 0; priorSeg = seg; }
      function rooted(p, seen = new Set()) {
        if (!p || p.dead || p.ground || seen.has(p.id)) return 0;
        const path = new Set([...seen, p.id]);
        let depth = p.arms.some(a => ['terrain', 'rope'].includes(a.grip?.kind)) ? 1 : 0;
        for (const a of p.arms) if (a.grip?.kind === 'player') { const up = rooted(sim.players[a.grip.player], path); if (up) depth = Math.max(depth, up + 1); }
        return depth;
      }
      const chain = sim.players.some(p => rooted(p) >= 2);
      const boost = sim.players.some(p => !p.dead && p.ground && sim.players.some(q => p !== q && !q.dead && Math.abs(p.body.x - q.body.x) < 42 && Math.abs(p.body.y + 48 - q.body.y) < 12));
      chainRun = chain ? chainRun + dt : 0; boostRun = boost ? boostRun + dt : 0;
      ev.chain = Math.max(ev.chain, chainRun); ev.boost = Math.max(ev.boost, boostRun);
      sim.players.forEach((p, i) => p.arms.forEach((a, k) => {
        const old = before[i].grips[k];
        if (old?.kind === 'player' && !a.grip && !p.grab[k] && !p.dead && !sim.players[old.player].dead) { const v = before[old.player]; if (v.vx > 150 && v.vy < -100) ev.throws++; }
      }));
      sim.plates.forEach((pl, k) => {
        sim.players.forEach((p, i) => {
          const on = !p.dead && physics.circleHitsRect(p.body, physics.CFG.bodyR, { x: pl.x, y: pl.y - physics.CFG.plateReach, w: pl.w, h: physics.CFG.plateReach });
          plateRuns[k][i] = on ? plateRuns[k][i] + dt : 0;
        });
        const gs = sim.gates.filter(g => pl.def.opens.split(/\s+/).includes(g.def.id));
        for (let holder = 0; holder < sim.players.length; holder++) {
          if (plateRuns[k][holder] < 1) continue;
          for (const g of gs) for (const [i, p] of sim.players.entries()) {
            if (i === holder || p.dead || g.open < .95) continue;
            const line = g.def.x + g.def.w;
            if (before[i].x < line && p.body.x >= line) ev.holds++;
          }
        }
      });
    };
    return sim;
  } };
  const inspected = await inspect(wrapped, level, replay);
  return { ...inspected, sections, longestIdle };
}
async function checkMulti(physics, existing) {
  const files = await readdir(multiDir).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  const found = files.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  found.forEach(id => assert(multiIds.includes(id), `unexpected multi level ${id}: multi-01…multi-09 only`));
  if (!found.length) return [];
  const readme = await readFile(join(multiDocs, 'README.md'), 'utf8');
  const manifest = readme.match(/<!-- C14_MULTI_SECTIONS (.+) -->/);
  assert(manifest, 'multi README: missing C14_MULTI_SECTIONS manifest (zero-based full-probe sections)');
  const hardSections = JSON.parse(manifest[1]);
  const replayFiles = await readdir(join(multiDir, 'replays'));
  const allowed = found.flatMap(id => [2, 3, 4].map(n => `${id}.p${n}.json`));
  replayFiles.filter(f => f.endsWith('.json')).forEach(f => assert(allowed.includes(f), `unexpected multi replay ${f}`));
  const entries = [];
  console.log('\nMulti levels (2–4 players)');
  console.log('| Level | Players | Seconds | Deaths (P1…) | All reached | Par ratio | Size | Checkpoint segments (s) | Cooperation per section (chain s / boost s / throws / plate crossings) | Solo cleared | Idle max (s) |');
  console.log('| --- | ---: | ---: | --- | :---: | ---: | --- | --- | --- | --- | ---: |');
  for (const id of multiIds.filter(id => found.includes(id))) {
    const level = await readJSON(join(multiDir, `${id}.json`));
    multiValidate(level, id, physics);
    const hard = hardSections[id], need = level.tier === 0 ? 1 : 2;
    assert(Array.isArray(hard) && new Set(hard).size === hard.length && hard.length >= need && hard.every(k => Number.isInteger(k) && k >= 0 && k <= level.checkpoints.length) && (!level.tier || hard.some(k => k > 0)), `${id}: invalid solo-blocked sections`);
    const replays = [];
    const crumbledAt = new Set();
    for (const group of multiLayouts(level, physics)) for (const n of group) {
      const filename = `${id}.p${n}.json`;
      assert(replayFiles.includes(filename), `${id}: missing ${n}-player multi replay (levels/multi/replays/${filename})`);
      const replay = await readJSON(join(multiDir, 'replays', filename));
      assert.deepEqual(Object.keys(replay).sort(), ['dt', 'frames', 'level', 'players'], `${filename}: replay contains state overrides`);
      replayShape(level, replay, id, n);
      for (const frame of replay.frames) for (const input of frame) assert(Object.keys(input).every(k => ['ax', 'ay', 'gl', 'gr', 'seq', 't'].includes(k)), `${filename}: inputs only; no actions/state overrides`);
      const { result, evidence, laid, sections, longestIdle } = await inspectMulti(physics, level, replay);
      const ts = [0, ...evidence.checkpointTimes, result.seconds], segments = ts.slice(1).map((t, i) => t - ts[i]), ratio = result.seconds / level.par.seconds;
      assert(result.won, `${id}.p${n}: replay did not reach goal: ${JSON.stringify(result.final)}`);
      assert.equal(evidence.checkpointTimes.length, level.checkpoints.length, `${id}.p${n}: missed checkpoint`);
      assert(segments.every(t => t >= 15 && t <= 60), `${id}.p${n}: checkpoint segment outside 15–60s: ${segments.map(t => t.toFixed(2)).join('/')}`);
      assert(ratio >= .5 && ratio <= 2, `${id}.p${n}: time outside par × [0.5, 2]`);
      if (level.long) assert(result.seconds >= LONG_SECONDS, `${id}.p${n}: a long level's replay takes at least ${LONG_SECONDS} s, took ${result.seconds.toFixed(1)}`);
      assert(result.deaths.reduce((a, b) => a + b, 0) <= level.par.deathsPerPlayer * n, `${id}.p${n}: deaths exceed budget`);
      assert(longestIdle <= 3 + 1e-6, `${id}.p${n}: all players idle for ${longestIdle.toFixed(2)}s`);
      const cooperated = s => s.chain >= .25 || s.boost >= .25 || s.throws > 0 || s.holds > 0;
      for (const k of hard) assert(cooperated(sections[k]), `${id}.p${n}: solo-blocked section ${k} has no actual chain, boost, throw, or 1s plate holder with another player crossing its gate`);
      assert(sections.filter(cooperated).length >= (level.tier === 2 ? 3 : level.tier === 1 ? 2 : 1), `${id}.p${n}: insufficient cooperation sections for tier`);
      evidence.gateOpen.forEach((o, i) => assert(o >= .99, `${id}.p${n}: gate ${laid.gates[i].id} never fully opened`));
      evidence.moverUse.forEach((t, i) => assert(laid.movers[i].deadly || t >= .25, `${id}.p${n}: moving platform ${i} bypassed`));
      evidence.spinnerUse.forEach((t, i) => assert(laid.spinners[i].deadly || t >= .25, `${id}.p${n}: spinning bar ${i} bypassed`));
      evidence.near.forEach((v, i) => assert(v, `${id}.p${n}: deadly thing ${i} outside route`));
      // 新机关（A12）：涨潮追得上人，摆锤旁边有人过，阵风刮到过人（每份回放）；会塌的台子下面按整关查
      if (laid.tide) assert(evidence.tideGap <= 400, `${id}.p${n}: the tide never gets within 400 px of the lowest player (closest ${Math.round(evidence.tideGap)})`);
      evidence.pendulumNear.forEach((near, k) => assert(near, `${id}.p${n}: nobody passes pendulum ${k}`));
      evidence.windHit.forEach((t, k) => assert(t >= 0.5, `${id}.p${n}: nobody is caught by wind ${k}`));
      laid.rects.forEach((r, k) => { if (r.crumble !== undefined && evidence.crumbled[k]) crumbledAt.add(`${r.x},${r.y},${r.w}`); });
      // 新场景的机关（长关能用）：蒸笼托过人、托盘端进终点、缆车有人坐、钥匙开了门、失重区有人飘、拉杆有人拉
      evidence.ventRide.forEach((t, k) => assert(t >= 0.25, `${id}.p${n}: steamer ${k} never lifted anyone`));
      if (laid.tray?.length) assert(evidence.trayHome === true, `${id}.p${n}: the tray did not end in the goal`);
      evidence.liftRide.forEach((t, k) => assert(t >= 1, `${id}.p${n}: nobody rode lift ${k}`));
      evidence.keysUsed.forEach((used, k) => assert(used, `${id}.p${n}: key ${k} never opened its gate`));
      evidence.floatTime.forEach((t, k) => assert(t >= 1, `${id}.p${n}: nobody floated through zero-gravity zone ${k}`));
      evidence.leverPulled.forEach((on, k) => assert(on, `${id}.p${n}: lever ${k} is never pulled`));
      for (let player = 0; player < n; player++) {
        const solo = { ...replay, players: 1, frames: replay.frames.map(f => [f[player]]) };
        assert.equal((await physics.runReplay(level, solo)).won, false, `${id}.p${n}: P${player + 1} solo bypass (original layout)`);
        assert.equal((await physics.runReplay(multiUnranged(laid), solo)).won, false, `${id}.p${n}: P${player + 1} solo bypass (selected layout)`);
      }
      console.log(`| ${id} | ${n} | ${result.seconds.toFixed(2)} | ${result.deaths.join(' / ')} | YES | ${ratio.toFixed(3)} | ${level.w}×${level.h} | ${segments.map(t => t.toFixed(2)).join(' / ')} | ${sections.map(s => `${s.chain.toFixed(2)}/${s.boost.toFixed(2)}/${s.throws}/${s.holds}`).join('; ')} | 0/${n} | ${longestIdle.toFixed(2)} |`);
      replays.push({ replay, result, evidence, sections });
    }
    // 每块会塌的台子至少在一份回放里有人碰塌过
    for (const r of level.rects) if (r.crumble !== undefined) assert(crumbledAt.has(`${r.x},${r.y},${r.w}`), `${id}: crumbling platform at (${r.x}, ${r.y}) is never touched in any replay`);
    if (!process.argv.includes('--multi-screenshots')) {
      const png = await readFile(join(multiDocs, `${id}.png`));
      assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${id}: invalid PNG`);
      assert.equal(png.readUInt32BE(16), 1280); assert.equal(png.readUInt32BE(20), 720);
    }
    entries.push({ level, replays });
  }
  for (const a of entries) for (const b of [...existing, ...entries]) if (a !== b) for (const na of [2, 3, 4]) for (const nb of [2, 3, 4]) {
    const whole = jaccard(surfaceCells(physics.forPlayers(a.level, na)), surfaceCells(physics.forPlayers(b.level, nb)));
    assert(whole <= SAME_LEVEL, `${a.level.id}/${b.level.id}: ${(whole * 100).toFixed(0)}% platform overlap (${na}/${nb} players), max 60%`);
  }
  if (entries.length === 9) for (const tier of [0, 1, 2]) {
    const mine = entries.filter(e => e.level.tier === tier);
    assert.equal(mine.length, 3, `multi: tier ${tier} needs three levels`);
    for (const world of ['table', 'van']) assert(mine.some(e => e.level.world === world), `multi: tier ${tier} missing ${world}`);
    for (const n of [2, 3, 4]) assert(mine.some(e => {
      const laid = physics.forPlayers(e.level, n);
      return laid.gates?.some(g => laid.plates?.some(p => p.opens.split(/\s+/).includes(g.id)));
    }), `multi: tier ${tier} missing plate gates (${n} players)`);
  }
  if (process.argv.includes('--multi-screenshots')) await screenshotMulti(entries);
  return entries;
}

/** C14 screenshots: only the multiplayer directory, two-player layout, original Pixi stage. */
async function screenshotMulti(entries) {
  const source = browserSource.replace("||'table-01'", "||'multi-01'").replace('lessons[level.teaches]', "({...lessons,boost:'踩着队友上去 / Boost a friend',hold:'一个按着，一个过去 / Hold it for a friend',counterweight:'几个人一起压 / Weigh it down together',relay:'一个个递上去 / Pass each other up',combine:'门与升降台接力 / Doors and lifts together'})[level.teaches]");
  const bundle = await build({ stdin: { contents: source, resolveDir: root }, bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
  const tokens = await readFile(resolve(root, '../../site/src/styles/tokens.css'));
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(reviewPage().replace(/<select aria-label="关卡 \/ Level">.*?<\/select>/, `<select aria-label="关卡 / Level">${entries.map(e => `<option>${e.level.id}</option>`).join('')}</select>`));
    } else if (path === '/tokens.css') { res.setHeader('Content-Type', 'text/css'); res.end(tokens); }
    else if (path === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (/^\/art\/(table|van)-far\.webp$/.test(path)) {
      readFile(resolve(root, path.slice(1))).then(data => { res.setHeader('Content-Type', 'image/webp'); res.end(data); }, () => { res.writeHead(404); res.end(); });
    } else {
      const m = /^\/(levels|replays)\/(multi-0[1-9])$/.exec(path), entry = m && entries.find(e => e.level.id === m[2]);
      if (!entry) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(m[1] === 'levels' ? entry.level : entry.replays.find(r => r.replay.players === 2).replay));
    }
  });
  let browser;
  try {
    await new Promise(ok => server.listen(0, '127.0.0.1', ok));
    const { chromium } = createRequire(import.meta.url)(join(root, 'node_modules/playwright'));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    for (const { level } of entries) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?id=${level.id}`);
      await page.waitForFunction(() => window.ready === true);
      await page.screenshot({ path: join(multiDocs, `${level.id}.png`) });
      console.log(`Screenshot: docs/levels/multi/${level.id}.png (1280×720, 2 players, full level)`);
    }
  } finally {
    await browser?.close();
    if (server.listening) await new Promise(ok => server.close(ok));
  }
}


try {
  const files = (await readdir(levelsDir)).filter((f) => f.endsWith('.json')).sort();
  const found = files.map((f) => f.slice(0, -'.json'.length));
  for (const id of baseIds) assert(found.includes(id), `missing contracted level ${id}`);
  for (const id of found) assert(baseIds.includes(id) || isHard(id) || isScene(id), `unexpected level ${id}: the twelve contracted levels plus hard levels table-13…18 / van-19…24 and the new scenes (${Object.values(SCENES).map((s) => `${s.ids[0]}…${s.ids[5]}`).join(', ')}) only`);
  ids.push(...hardIds.filter((id) => found.includes(id)));
  ids.push(...sceneIds.filter((id) => found.includes(id)));
  const replayFiles = (await readdir(join(levelsDir, 'replays'))).filter((f) => f.endsWith('.json')).sort();
  for (const id of ids) assert(replayFiles.includes(`${id}.json`), `${id}: needs its own replay`);
  // 别的人数的回放：replays/<id>.p<人数>.json，只给按人数摆的关、每种摆法一份
  const extraReplays = replayFiles.filter((f) => !files.includes(f)).map((f) => {
    const m = /^((?:table|van|kitchen|snow|house|space)-\d{2})\.p([1-6])\.json$/.exec(f);
    assert(m && ids.includes(m[1]), `unexpected replay ${f} (extra replays are <level>.p<players>.json)`);
    return { file: f, id: m[1], players: Number(m[2]) };
  });
  const entry = join(temporary, 'physics.mjs');
  await build({ stdin: { contents: "export {createSim} from './src/physics/world'; export {runReplay} from './src/physics/replay'; export * from './src/physics/motion'; export {CFG} from './src/physics/config'; export {forPlayers} from './src/physics/level';", resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile: entry, logLevel: 'silent' });
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
    if (main && level.long) assert(result.seconds >= LONG_SECONDS, `${id}: a long level's main replay takes at least ${LONG_SECONDS} s, took ${result.seconds.toFixed(1)}`);
    else assert(ratio <= 2, `${id} (${replay.players} players): time over par × 2`);
    assert(result.deaths.every((d) => d <= level.par.deathsPerPlayer * 4), `${id}: too many deaths`);
    assert(result.deaths.reduce((sum, d) => sum + d, 0) <= level.par.deathsPerPlayer * 4, `${id}: team deaths exceed budget`);
    // 会动的台子、会转的杆子每一个都要真的用上（站上去或抓着至少 0.25 秒），要命的东西每一处都要在路上
    evidence.moverUse.forEach((t, i) => assert(laid.movers[i].deadly || t >= 0.25, `${id} (${replay.players} players): moving platform ${i} was bypassed`));
    evidence.spinnerUse.forEach((t, i) => assert(laid.spinners[i].deadly || t >= 0.25, `${id} (${replay.players} players): spinning bar ${i} was bypassed`));
    evidence.near.forEach((n, k) => assert(n, `${id}: deadly thing ${k} is never within ${NEAR}px of the route`));
    // 踩板门：每扇门回放里都真开过（全开）
    evidence.gateOpen.forEach((o, k) => assert(o >= 0.99, `${id} (${replay.players} players): gate ${laid.gates[k].id} never opened`));
    // 后厨：每摞蒸笼都真把人托上去过（0.25 秒），有托盘的关托盘端进了终点
    evidence.ventRide.forEach((t, k) => assert(t >= 0.25, `${id} (${replay.players} players): steamer ${k} never lifted anyone`));
    if (laid.tray?.length) assert(evidence.trayHome === true, `${id} (${replay.players} players): the tray did not end in the goal`);
    // 雪山：每根缆绳都真有人坐过（站在座板上或抓着椅子 1 秒），每块冰溜子都有人抓过（主回放）
    evidence.liftRide.forEach((t, k) => assert(t >= 1, `${id} (${replay.players} players): nobody rode lift ${k}`));
    if (main) laid.rects.forEach((r, k) => assert(r.slip === undefined || evidence.icyGrabs[k] > 0, `${id}: icy hold ${k} at (${r.x}, ${r.y}) is never grabbed`));
    // 老宅：每把钥匙都开了门；主回放里每盏灭着的灯都有人点着
    evidence.keysUsed.forEach((used, k) => assert(used, `${id} (${replay.players} players): key ${k} never opened its gate`));
    if (main) evidence.lampsLit.forEach((on, k) => assert(on, `${id}: lamp ${k} at (${laid.lamps[k].x}, ${laid.lamps[k].y}) is never lit`));
    // 太空站：每块失重区都有人飘过 1 秒、每根拉杆都有人拉过（每份回放）
    evidence.floatTime.forEach((t, k) => assert(t >= 1, `${id} (${replay.players} players): nobody floated through zero-gravity zone ${k}`));
    evidence.leverPulled.forEach((on, k) => assert(on, `${id} (${replay.players} players): lever ${k} is never pulled`));
    // 新机关（A12）：涨潮要追得上人（最近离最低的活人不到 400 像素）；每块会塌的台子主回放里都有人碰塌过；
    // 每个摆锤都有人从旁边过；每块阵风都有人被刮过 0.5 秒
    if (laid.tide) assert(evidence.tideGap <= 400, `${id} (${replay.players} players): the tide never gets within 400 px of the lowest player (closest ${Math.round(evidence.tideGap)})`);
    if (main) laid.rects.forEach((r, k) => assert(r.crumble === undefined || evidence.crumbled[k], `${id}: crumbling platform ${k} at (${r.x}, ${r.y}) is never touched`));
    evidence.pendulumNear.forEach((near, k) => assert(near, `${id} (${replay.players} players): nobody passes pendulum ${k}`));
    evidence.windHit.forEach((t, k) => assert(t >= 0.5, `${id} (${replay.players} players): nobody is caught by wind ${k}`));
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
    // 难关得靠大家：回放里真的有人连成串挂着，或者把队友丢过去（后厨困难那一档也一样）
    if (isHard(id) || (isScene(id) && level.tier === 2)) {
      assert(evidence.chainSeconds >= 0.25 || evidence.throws >= 1, `${id}: a hard level's replay must use teamwork (hang as a chain for 0.25 s or throw a teammate)`);
      // 不能只在开头连一下：至少两段里都要靠大家（成串挂着 0.25 秒，或者丢一次人）
      const segs = Math.max(evidence.chainBySeg.length, evidence.throwsBySeg.length);
      const teamSegs = Array.from({ length: segs }, (_, k) => (evidence.chainBySeg[k] ?? 0) >= 0.25 || (evidence.throwsBySeg[k] ?? 0) >= 1).filter(Boolean).length;
      assert(teamSegs >= 2, `${id}: teamwork in only ${teamSegs} checkpoint segment(s); a hard level needs it in at least two`);
    }
    // 按人数摆的关：每一种摆法都要有一份回放（4 个人那种就是上面这份）
    const mine = extraReplays.filter((r) => r.id === id);
    // 新场景简单、中等的关一个人也要过得去（单人模式也玩这些关）：要一份 1 个人的回放（后厨一个人端着托盘、坐着汽到顶）
    const soloKitchen = isScene(id) && level.tier < 2;
    if (soloKitchen) assert(mine.some((r) => r.players === 1), `${id}: an easy or medium ${sceneOf(id)} level needs a one-player replay (replays/${id}.p1.json); solo mode plays it too`);
    for (const group of layoutGroups(level)) {
      if (group.includes(4)) {
        assert(!mine.some((r) => group.includes(r.players) && !(soloKitchen && r.players === 1)), `${id}: ${group.join('/')} players share the four-player layout; replays/${id}.json already covers them`);
        if (soloKitchen && group.includes(1)) {
          const solo = mine.find((r) => r.players === 1);
          const extra = await readJSON(join(levelsDir, 'replays', solo.file));
          replayShape(level, extra, id, 1);
          await check(level, extra, id, false);
        }
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
  for (const { level, replay, evidence } of entries.filter((e) => ['table-06', 'van-10'].includes(e.level.id) || isHard(e.level.id) || (isScene(e.level.id) && e.level.tier === 2))) {
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
  // 新场景（C10 起）：每关都是自己的关；一个场景六关到齐了才查的搭配
  const sceneEntries = entries.filter((e) => isScene(e.level.id));
  for (const a of sceneEntries) {
    for (const b of entries) {
      if (b === a || (isScene(b.level.id) && b.level.id < a.level.id)) continue;
      const whole = jaccard(surfaceCells(a.level), surfaceCells(b.level));
      assert(whole <= SAME_LEVEL, `${a.level.id} and ${b.level.id} share ${(whole * 100).toFixed(0)}% of their platforms; every level of a new scene needs its own layout (at most ${SAME_LEVEL * 100}%)`);
      if (sceneOf(b.level.id) !== sceneOf(a.level.id)) continue;
      const start = jaccard(firstScreen(a.level), firstScreen(b.level));
      assert(start <= SAME_START, `${a.level.id} and ${b.level.id} open with the same first screen (${(start * 100).toFixed(0)}% alike)`);
    }
  }
  const sceneCounts = [];
  for (const [name, sc] of Object.entries(SCENES)) {
    const mine = sceneEntries.filter((e) => sceneOf(e.level.id) === name);
    sceneCounts.push(`${mine.length}/${sc.ids.length} ${name}`);
    if (mine.length < sc.ids.length) continue;
    const count = (pred) => mine.filter((e) => pred(e.level)).length;
    for (const tier of [0, 1, 2]) assert.equal(count((l) => l.tier === tier), 2, `${name} levels: two per tier (tier ${tier})`);
    const miss = sc.mix(count);
    assert(!miss, `${name} levels: ${miss}`);
    for (const kind of ['spike', 'hot', 'zap']) assert(count((l) => (l.hazards ?? []).some((h) => (h.kind ?? 'spike') === kind)) >= 2, `${name} levels: at least two need ${kind}`);
  }
  if (process.argv.includes('--screenshots') || process.argv.includes('--serve')) await serve(entries, process.argv.includes('--screenshots'));
  const teamEntries = await checkTeams(physics, entries);
  const multiEntries = await checkMulti(physics, [...entries, ...teamEntries]);
  // 手酸（A11）：简单的关不许写 stamina；中等、困难的闯关和多人关里按手酸录过回放的有几关
  const climbing = [...entries, ...multiEntries];
  for (const e of climbing) assert(!(e.level.stamina && tierOf(e.level) < 1), `${e.level.id}: stamina is only for medium and hard levels`);
  const hardish = new Set(climbing.filter((e) => tierOf(e.level) >= 1).map((e) => e.level.id));
  const tired = new Set(climbing.filter((e) => staminaOn(e.level)).map((e) => e.level.id));
  console.log(`stamina: ${tired.size}/${hardish.size} medium and hard levels replayed with tired hands`);
  // 长关（A13）：有几关、各多长
  const longs = climbing.filter((e) => e.level.long);
  console.log(`long: ${longs.length} long levels${longs.length ? ` (${longs.map((e) => `${e.level.id} ${Math.round(routeLength(e.level))} px`).join(', ')})` : ''}`);
  console.log(`levels: ${baseIds.length}/${baseIds.length} base + ${hardEntries.length}/${hardIds.length} hard + ${teamEntries.length}/6 team + ${sceneCounts.join(' + ')} + ${multiEntries.length}/9 multi PASS; geometry, materials, pads/frame, par, deaths, mechanics, machines, hazards on the route, layouts per team size, sizes, checkpoint segments, cookies/candles, red envelopes, object budgets and solo controls PASS`);
} catch (error) {
  console.error(`levels: FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  assert.equal(dirname(temporary), resolve(tmpdir()));
  assert(basename(temporary).startsWith('hang-on-levels-'));
  await rm(temporary, { recursive: true, force: true });
}
