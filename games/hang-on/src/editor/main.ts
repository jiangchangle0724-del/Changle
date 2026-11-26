/**
 * 关卡编辑器（11-26，14 样的第 14 样）：/hang-on/editor/。画关、试玩、分享。
 * 关在 `model.ts`（每一步改完收拾一遍，总是能玩）；这里画（2D 画布，网格对齐 20 像素）、点（鼠标、手指、两根手指缩放）、
 * 试玩（和游戏同一套物理、画面）、分享（整关压成一串码放进链接，不存服务器）、草稿和「我的关」（存在这台设备上）。
 */
import { applyStatic, getLang, langButton, onLang, tr } from '../i18n';
import { cleanCustom, CUSTOM_MATERIALS, CUSTOM_WORLDS, decodeLevel, encodeLevel, LIMITS, type CustomWorld } from '../custom';
import { MATERIALS, PALETTES, WORLD_MATERIAL, worldOf } from '../render/art';
import { boxOf, DRAG_TOOLS, GRID, History, hit, move, place, remove, resizable, resize, restyle, ropeEnd, SIZES, spawnHasFloor, starter, tidy, TOOLS, type HazardKind, type Material, type Ref, type Tool } from './model';
import type { Level, Pt, Rect } from '../physics/level';
import type { Sim, PadInput } from '../physics/world';
import type { Stage } from '../render/stage';

// 在哪儿连按两下都不放大；iPhone 只在有人听点击的地方附近看 touch-action
document.documentElement.addEventListener('click', () => {});

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};

applyStatic();
langButton($<HTMLButtonElement>('langBtn'));

// ---------------------------------------------------------------- 名字

const TOOL_TEXT: Record<Tool, { icon: string; zh: string; en: string; hintZh: string; hintEn: string }> = {
  select: { icon: '👆', zh: '选', en: 'Select', hintZh: '点一样东西选中，拖着挪；拉四个角改大小。拖空的地方挪画面，滚轮或两根手指放大缩小', hintEn: 'Tap a piece to select it and drag to move it; drag a corner to resize. Drag empty space to pan; scroll or pinch to zoom' },
  rect: { icon: '🟫', zh: '台子', en: 'Platform', hintZh: '按住拖出一块台子（点一下放一块小的）；下面选材料：冰滑，别的都抓得住', hintEn: 'Drag to draw a platform (tap for a small one); pick the material below. Ice is slippery' },
  peg: { icon: '🪝', zh: '把手', en: 'Handle', hintZh: '点一下放一个把手：小小一根，只能抓', hintEn: 'Tap to place a handle: a small bar you can only grab' },
  spawn: { icon: '🙂', zh: '出生点', en: 'Start', hintZh: '点一下，大家从这里出发（只有一个）', hintEn: 'Tap to set where everyone starts (just one)' },
  goal: { icon: '🏁', zh: '终点', en: 'Goal', hintZh: '点一下或者拖一个框，到这里就过关（只有一个）', hintEn: 'Tap or drag a box: reach it to win (just one)' },
  checkpoint: { icon: '🚩', zh: '检查点', en: 'Checkpoint', hintZh: '点一下放一面旗：摔下去从最近的旗子回来', hintEn: 'Tap to plant a flag: fall and you come back at the last flag' },
  rope: { icon: '🪢', zh: '绳子', en: 'Rope', hintZh: '点一下挂一根绳子；选中以后拖下面那头改长短', hintEn: 'Tap to hang a rope; select it and drag its end to change the length' },
  spring: { icon: '🕯️', zh: '弹簧', en: 'Spring', hintZh: '拖出一个弹簧：站上去会被弹起来', hintEn: 'Drag to draw a spring: step on it and it throws you up' },
  cookie: { icon: '🍪', zh: '饼干', en: 'Cookie', hintZh: '拖出一块饼干：一会儿有、一会儿没有', hintEn: 'Drag to draw a cookie: it comes and goes' },
  spike: { icon: '🔺', zh: '尖刺', en: 'Spikes', hintZh: '拖出一片要命的东西：碰到就摔；下面选尖刺、烫、电', hintEn: 'Drag to draw something deadly: touch it and you fall. Pick spikes, heat or shocks below' },
  crate: { icon: '📦', zh: '箱子', en: 'Crate', hintZh: '点一下放一个箱子：能推、能抓、能垫脚', hintEn: 'Tap to place a crate: push it, grab it, stand on it' },
  boulder: { icon: '🪨', zh: '大石头', en: 'Boulder', hintZh: '点一下放一块大石头：又圆又重，几个人一起推；选中以后拖边改大小', hintEn: 'Tap to place a boulder: round and heavy, push it together; select it and drag its edge to resize' },
  erase: { icon: '🧽', zh: '擦掉', en: 'Erase', hintZh: '点哪样擦哪样（出生点、终点擦不掉）', hintEn: 'Tap a piece to erase it (not the start or the goal)' },
};
const MAT_TEXT: Record<Material, { zh: string; en: string }> = {
  wood: { zh: '木头', en: 'Wood' },
  cloth: { zh: '布', en: 'Cloth' },
  ceramic: { zh: '瓷', en: 'China' },
  metal: { zh: '铁', en: 'Metal' },
  bamboo: { zh: '竹子', en: 'Bamboo' },
  brick: { zh: '砖', en: 'Brick' },
  snow: { zh: '雪', en: 'Snow' },
  ice: { zh: '冰（滑）', en: 'Ice (slippery)' },
  hull: { zh: '舱壁', en: 'Hull' },
  noodle: { zh: '面条', en: 'Noodle' },
};
const HAZ_TEXT: Record<HazardKind, { icon: string; zh: string; en: string; color: string }> = {
  spike: { icon: '🔺', zh: '尖刺', en: 'Spikes', color: '#c9ced8' },
  hot: { icon: '🔥', zh: '烫', en: 'Heat', color: '#ff7a3d' },
  zap: { icon: '⚡', zh: '电', en: 'Shock', color: '#ffe14d' },
};
const WORLD_TEXT: Record<CustomWorld, { zh: string; en: string }> = {
  table: { zh: '年夜饭桌', en: 'Dinner table' },
  van: { zh: '温哥华', en: 'Vancouver' },
  kitchen: { zh: '后厨', en: 'Kitchen' },
  snow: { zh: '雪山', en: 'Snowy peak' },
  house: { zh: '老宅', en: 'Old house' },
  space: { zh: '太空站', en: 'Space station' },
};
const LIST_TEXT: Record<Ref['list'], { zh: string; en: string }> = {
  rects: { zh: '台子', en: 'Platform' },
  springs: { zh: '弹簧', en: 'Spring' },
  fading: { zh: '饼干', en: 'Cookie' },
  hazards: { zh: '要命的', en: 'Deadly' },
  crates: { zh: '箱子', en: 'Crate' },
  boulders: { zh: '大石头', en: 'Boulder' },
  ropes: { zh: '绳子', en: 'Rope' },
  checkpoints: { zh: '检查点', en: 'Checkpoint' },
  spawn: { zh: '出生点', en: 'Start' },
  goal: { zh: '终点', en: 'Goal' },
};

// ---------------------------------------------------------------- 状态

const DRAFT = 'hang-on:editor:draft';
const MINE = 'hang-on:editor:mine';
interface Mine {
  code: string;
  name: string;
  at: number;
}
const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // 存不下就算了
    }
  },
};

const fresh = (): Level => {
  const l = starter();
  const name = tr('我的关', 'My level');
  return { ...l, name: { zh: name, en: name } };
};

/** 开页面：链接里带码就开那一关，没有就接着上次的草稿，再没有就新的。 */
async function firstLevel(): Promise<Level> {
  const code = location.hash.slice(1);
  if (code) {
    const l = await decodeLevel(code);
    if (l) return tidy({ ...l, id: 'custom-draft' });
  }
  const draft = cleanCustom(store.get<unknown>(DRAFT), 'custom-draft');
  return draft ?? fresh();
}

let hist = new History(await firstLevel());
let tool: Tool = 'select';
let material: Material = (WORLD_MATERIAL[worldOf(hist.level.world)] as Material | undefined) ?? 'wood';
let hazard: HazardKind = 'spike';
let sel: Ref | null = null;
/** 正在拖的时候的样子（松手才进撤销）。 */
let preview: Level | null = null;
const level = (): Level => preview ?? hist.level;

function commit(next: Level, ref: Ref | null = sel): void {
  hist.push(next);
  sel = ref && boxOf(hist.level, ref) ? ref : null;
  store.set(DRAFT, hist.level);
  renderUi();
  redraw();
}

// ---------------------------------------------------------------- 上面一排、工具、材料

const nameIn = $<HTMLInputElement>('name');
const worldSel = $<HTMLSelectElement>('world');
const sizeSel = $<HTMLSelectElement>('size');

function renderTop(): void {
  const l = hist.level;
  if (document.activeElement !== nameIn) nameIn.value = l.name?.zh ?? '';
  worldSel.replaceChildren(
    ...CUSTOM_WORLDS.map((w) => {
      const o = document.createElement('option');
      o.value = w;
      o.textContent = getLang() === 'zh' ? WORLD_TEXT[w].zh : WORLD_TEXT[w].en;
      o.selected = l.world === w;
      return o;
    }),
  );
  const sizes = [...SIZES];
  if (!sizes.some((s) => s.w === l.w && s.h === l.h)) sizes.push({ w: l.w, h: l.h, zh: '现在的', en: 'Current' });
  sizeSel.replaceChildren(
    ...sizes.map((s) => {
      const o = document.createElement('option');
      o.value = `${s.w}x${s.h}`;
      o.textContent = `${tr(s.zh, s.en)} ${s.w} × ${s.h}`;
      o.selected = s.w === l.w && s.h === l.h;
      return o;
    }),
  );
}
nameIn.addEventListener('change', () => {
  const n = nameIn.value.trim() || tr('我的关', 'My level');
  commit(tidy({ ...hist.level, name: { zh: n, en: n } }));
});
worldSel.addEventListener('change', () => {
  const w = worldSel.value as CustomWorld;
  material = (WORLD_MATERIAL[worldOf(w)] as Material | undefined) ?? material;
  commit(tidy({ ...hist.level, world: w }));
});
sizeSel.addEventListener('change', () => {
  const [w, h] = sizeSel.value.split('x').map(Number) as [number, number];
  commit(tidy({ ...hist.level, w, h }));
  fit();
});

function renderTools(): void {
  const box = $('tools');
  box.replaceChildren(
    ...TOOLS.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t === tool));
      const i = document.createElement('span');
      i.textContent = TOOL_TEXT[t].icon;
      i.setAttribute('aria-hidden', 'true');
      b.append(i, document.createTextNode(tr(TOOL_TEXT[t].zh, TOOL_TEXT[t].en)));
      b.addEventListener('click', () => {
        tool = t;
        if (t !== 'select') sel = null;
        renderUi();
        redraw();
      });
      return b;
    }),
  );
  $('ed').classList.toggle('select', tool === 'select');
}

/** 下面一排：材料（台子、把手、饼干、箱子）或者要命的种类（尖刺）；选中了一样就改那一样。 */
function renderPicks(): void {
  const box = $('picks');
  const selList = sel?.list;
  const wantsMat = ['rect', 'peg', 'cookie', 'crate'].includes(tool) || selList === 'rects' || selList === 'fading' || selList === 'crates';
  const wantsHaz = tool === 'spike' || selList === 'hazards';
  const chip = (label: string, color: string, on: boolean, click: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(on));
    const dot = document.createElement('i');
    dot.style.background = color;
    b.append(dot, document.createTextNode(label));
    b.addEventListener('click', click);
    return b;
  };
  const kids: HTMLElement[] = [];
  const lab = (t: string): HTMLElement => {
    const s = document.createElement('span');
    s.className = 'lab';
    s.textContent = t;
    return s;
  };
  if (wantsMat) {
    const current = sel && selList !== 'hazards' ? (selMaterial() ?? material) : material;
    kids.push(lab(tr('材料', 'Material')));
    for (const m of CUSTOM_MATERIALS)
      kids.push(
        chip(tr(MAT_TEXT[m].zh, MAT_TEXT[m].en), MATERIALS[m]?.base ?? '#999', m === current, () => {
          material = m;
          if (sel) commit(restyle(hist.level, sel, { material: m }));
          else renderUi();
        }),
      );
  }
  if (wantsHaz) {
    const current = sel?.list === 'hazards' ? (hist.level.hazards?.[sel.i]?.kind ?? hazard) : hazard;
    kids.push(lab(tr('种类', 'Kind')));
    for (const k of ['spike', 'hot', 'zap'] as const)
      kids.push(
        chip(`${HAZ_TEXT[k].icon} ${tr(HAZ_TEXT[k].zh, HAZ_TEXT[k].en)}`, HAZ_TEXT[k].color, k === current, () => {
          hazard = k;
          if (sel) commit(restyle(hist.level, sel, { hazard: k }));
          else renderUi();
        }),
      );
  }
  box.replaceChildren(...kids);
  box.hidden = !kids.length;
}
function selMaterial(): Material | null {
  if (!sel || (sel.list !== 'rects' && sel.list !== 'fading' && sel.list !== 'crates')) return null;
  return ((hist.level[sel.list]?.[sel.i] as { material?: string } | undefined)?.material as Material | undefined) ?? null;
}

function renderBottom(): void {
  $<HTMLButtonElement>('undoBtn').disabled = !hist.canUndo;
  $<HTMLButtonElement>('redoBtn').disabled = !hist.canRedo;
  $<HTMLButtonElement>('delBtn').disabled = !sel || sel.list === 'spawn' || sel.list === 'goal';
  const l = hist.level;
  const counts = `${tr('台子', 'Platforms')} ${l.rects.length}/${LIMITS.rects}`;
  $('sel').textContent = sel ? `${tr('选中：', 'Selected: ')}${tr(LIST_TEXT[sel.list].zh, LIST_TEXT[sel.list].en)} · ${counts}` : counts;
  $('hint').textContent = tr(TOOL_TEXT[tool].hintZh, TOOL_TEXT[tool].hintEn);
  const warn = $('warn');
  warn.hidden = spawnHasFloor(l);
  warn.textContent = tr('出生点底下没有台子：一开局就会掉下去', 'Nothing under the start: everyone falls right away');
}
function renderUi(): void {
  renderTop();
  renderTools();
  renderPicks();
  renderBottom();
}
onLang(() => {
  applyStatic();
  renderUi();
  redraw();
});

$('undoBtn').addEventListener('click', () => {
  if (hist.undo()) after();
});
$('redoBtn').addEventListener('click', () => {
  if (hist.redo()) after();
});
$('delBtn').addEventListener('click', delSel);
$('fitBtn').addEventListener('click', () => {
  fit();
  redraw();
});
$('newBtn').addEventListener('click', () => {
  commit(fresh(), null);
  fit();
});
function after(): void {
  sel = sel && boxOf(hist.level, sel) ? sel : null;
  store.set(DRAFT, hist.level);
  renderUi();
  redraw();
}
function delSel(): void {
  if (!sel || sel.list === 'spawn' || sel.list === 'goal') return;
  commit(remove(hist.level, sel), null);
}

// ---------------------------------------------------------------- 画

const canvas = $<HTMLCanvasElement>('ed');
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const view = { cx: 1280, cy: 360, z: 0.4 };
let W = 1;
let H = 1;
let dpr = 1;
const touchy = matchMedia('(hover: none), (pointer: coarse)').matches;

function sizeCanvas(): void {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(2, devicePixelRatio || 1);
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
function fit(): void {
  sizeCanvas();
  const l = hist.level;
  view.z = Math.min((W - 40) / l.w, (H - 60) / (l.h + 90));
  view.cx = l.w / 2;
  view.cy = (l.h + 70) / 2;
}
const toWorld = (sx: number, sy: number): Pt => ({ x: (sx - W / 2) / view.z + view.cx, y: (sy - H / 2) / view.z + view.cy });
const toScreen = (p: Pt): Pt => ({ x: (p.x - view.cx) * view.z + W / 2, y: (p.y - view.cy) * view.z + H / 2 });

let drawQueued = false;
function redraw(): void {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    draw();
  });
}

function draw(): void {
  const l = level();
  const pal = PALETTES[worldOf(l.world)];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const z = view.z;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - view.cx * z), dpr * (H / 2 - view.cy * z));
  const px = 1 / z;
  // 关卡范围、网格、每一屏的边
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, l.w, l.h);
  const step = z * 40 >= 8 ? 40 : 200;
  ctx.beginPath();
  for (let x = 0; x <= l.w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, l.h);
  }
  for (let y = 0; y <= l.h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(l.w, y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = px;
  ctx.stroke();
  ctx.setLineDash([10 * px, 8 * px]);
  ctx.beginPath();
  for (let x = 1280; x < l.w; x += 1280) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, l.h);
  }
  for (let y = 720; y < l.h; y += 720) {
    ctx.moveTo(0, y);
    ctx.lineTo(l.w, y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();
  // 掉下去的线
  ctx.beginPath();
  ctx.moveTo(0, l.deathY);
  ctx.lineTo(l.w, l.deathY);
  ctx.strokeStyle = 'rgba(239,90,90,0.8)';
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2 * px;
  ctx.strokeRect(0, 0, l.w, l.h);
  label(tr('掉到这里算摔', 'Falling past here is a fall'), 8, l.deathY - 6 * px, 'rgba(255,160,160,0.9)', 'left');

  for (const r of l.rects) (r.kind === 'peg' ? drawPeg : drawPlatform)(r);
  for (const f of l.fading ?? []) drawCookie(f);
  for (const s of l.springs ?? []) drawSpring(s);
  for (const z2 of l.hazards ?? []) drawHazard(z2);
  for (const c of l.crates ?? []) drawCrate(c);
  (l.ropes ?? []).forEach((_, i) => drawRope(l, i));
  for (const b of l.boulders ?? []) drawBoulder(b.x, b.y, b.r ?? 56);
  drawGoal(l.goal);
  for (const c of l.checkpoints ?? []) drawFlag(c);
  drawSpawn(l.spawn);
  // 正在画的框
  if (action?.kind === 'draw') {
    const r = dragBox(action.start, action.now, action.tool);
    ctx.fillStyle = 'rgba(246,196,83,0.25)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#f6c453';
    ctx.lineWidth = 2 * px;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    label(`${r.w} × ${r.h}`, r.x + r.w / 2, r.y - 8 * px, '#f6c453', 'center');
  }
  drawSelection(l);
}

function label(text: string, x: number, y: number, color: string, align: CanvasTextAlign): void {
  const px = 1 / view.z;
  ctx.font = `700 ${13 * px}px "Noto Sans SC", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(text, x + px, y + px);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
const matOf = (m: string | undefined): { base: string; dark: string; light: string } => MATERIALS[m ?? 'wood'] ?? (MATERIALS.wood as { base: string; dark: string; light: string });
function drawPlatform(r: Rect): void {
  const m = matOf(r.material);
  ctx.fillStyle = m.base;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = m.light;
  ctx.fillRect(r.x, r.y, r.w, Math.min(6, r.h / 3));
  ctx.strokeStyle = m.dark;
  ctx.lineWidth = 2 / view.z;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}
function drawPeg(r: Rect): void {
  const m = matOf(r.material);
  ctx.fillStyle = m.base;
  ctx.strokeStyle = m.dark;
  ctx.lineWidth = 2 / view.z;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fill();
  ctx.stroke();
}
function drawCookie(f: Rect): void {
  ctx.fillStyle = '#e0b26b';
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.fillStyle = '#7a4a1f';
  for (let x = f.x + 12; x < f.x + f.w - 6; x += 26) ctx.fillRect(x, f.y + f.h / 2 - 3, 6, 6);
  ctx.setLineDash([8 / view.z, 6 / view.z]);
  ctx.strokeStyle = '#7a4a1f';
  ctx.lineWidth = 2 / view.z;
  ctx.strokeRect(f.x, f.y, f.w, f.h);
  ctx.setLineDash([]);
}
function drawSpring(s: Rect): void {
  ctx.fillStyle = '#fff3d6';
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = '#c8a46a';
  ctx.lineWidth = 2 / view.z;
  ctx.strokeRect(s.x, s.y, s.w, s.h);
  // 上面一道红（弹的那一面）和一个往上的箭头
  ctx.fillStyle = '#e8413c';
  ctx.fillRect(s.x, s.y, s.w, Math.min(10, s.h / 4));
  ctx.beginPath();
  ctx.moveTo(s.x + s.w / 2, s.y - 26);
  ctx.lineTo(s.x + s.w / 2 - 12, s.y - 8);
  ctx.lineTo(s.x + s.w / 2 + 12, s.y - 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,243,214,0.8)';
  ctx.fill();
}
function drawHazard(z: Rect & { kind?: string }): void {
  const k = (z.kind ?? 'spike') as HazardKind;
  ctx.fillStyle = k === 'hot' ? '#c43b1c' : k === 'zap' ? '#3a3f8a' : '#5a6070';
  ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.fillStyle = HAZ_TEXT[k].color;
  const n = Math.max(1, Math.round(z.w / 24));
  const tw = z.w / n;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    ctx.moveTo(z.x + i * tw, z.y + Math.min(z.h, 20));
    ctx.lineTo(z.x + i * tw + tw / 2, z.y);
    ctx.lineTo(z.x + (i + 1) * tw, z.y + Math.min(z.h, 20));
  }
  ctx.fill();
}
function drawCrate(c: Rect): void {
  ctx.fillStyle = '#b07a3e';
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 3 / view.z;
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x + c.w, c.y + c.h);
  ctx.moveTo(c.x + c.w, c.y);
  ctx.lineTo(c.x, c.y + c.h);
  ctx.stroke();
}
function drawRope(l: Level, i: number): void {
  const r = l.ropes?.[i];
  if (!r) return;
  const end = ropeEnd(l, i);
  ctx.strokeStyle = '#e9d6a8';
  ctx.lineWidth = 6 / view.z;
  ctx.beginPath();
  ctx.moveTo(r.anchor.x, r.anchor.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.fillStyle = '#8a6a3a';
  for (let k = 1; k < r.segments; k++) ctx.fillRect(r.anchor.x - 4, r.anchor.y + k * r.segLen - 2, 8, 4);
  ctx.beginPath();
  ctx.arc(r.anchor.x, r.anchor.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#5a5f6e';
  ctx.fill();
}
function drawBoulder(x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#8b7d6b';
  ctx.fill();
  ctx.strokeStyle = '#4e463c';
  ctx.lineWidth = 3 / view.z;
  ctx.stroke();
  ctx.fillStyle = '#6f6455';
  for (const [dx, dy, rr] of [
    [-0.35, -0.2, 0.18],
    [0.25, 0.15, 0.22],
    [0.05, -0.45, 0.12],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawGoal(g: Rect): void {
  ctx.fillStyle = 'rgba(155,207,131,0.3)';
  ctx.fillRect(g.x, g.y, g.w, g.h);
  ctx.strokeStyle = '#9BCF83';
  ctx.lineWidth = 3 / view.z;
  ctx.strokeRect(g.x, g.y, g.w, g.h);
  label(`🏁 ${tr('终点', 'Goal')}`, g.x + g.w / 2, g.y - 8 / view.z, '#d7f2c8', 'center');
}
function drawFlag(c: Pt): void {
  ctx.strokeStyle = '#fff6e9';
  ctx.lineWidth = 3 / view.z;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 24);
  ctx.lineTo(c.x, c.y - 56);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 56);
  ctx.lineTo(c.x + 30, c.y - 46);
  ctx.lineTo(c.x, c.y - 36);
  ctx.closePath();
  ctx.fillStyle = '#f6c453';
  ctx.fill();
}
function drawSpawn(p: Pt): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd6de';
  ctx.fill();
  ctx.strokeStyle = '#2a1f3a';
  ctx.lineWidth = 3 / view.z;
  ctx.stroke();
  ctx.fillStyle = '#2a1f3a';
  for (const dx of [-8, 8]) {
    ctx.beginPath();
    ctx.arc(p.x + dx, p.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  label(tr('出生点', 'Start'), p.x, p.y - 32 / view.z, '#ffd6de', 'center');
}
/** 选中的那样：金色虚线框，能改大小的四个角各一个小方块；绳子底下一个圆、大石头右边一个圆。 */
function handles(l: Level, ref: Ref): Pt[] {
  if (ref.list === 'ropes') return [ropeEnd(l, ref.i)];
  if (ref.list === 'boulders') {
    const b = l.boulders?.[ref.i];
    return b ? [{ x: b.x + (b.r ?? 56), y: b.y }] : [];
  }
  if (!resizable(ref)) return [];
  const r = boxOf(l, ref);
  return r
    ? [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ]
    : [];
}
function drawSelection(l: Level): void {
  if (!sel) return;
  const r = boxOf(l, sel);
  if (!r) return;
  const px = 1 / view.z;
  ctx.setLineDash([8 * px, 6 * px]);
  ctx.strokeStyle = '#f6c453';
  ctx.lineWidth = 2 * px;
  ctx.strokeRect(r.x - 4 * px, r.y - 4 * px, r.w + 8 * px, r.h + 8 * px);
  ctx.setLineDash([]);
  const s = (touchy ? 14 : 10) * px;
  for (const h of handles(l, sel)) {
    ctx.fillStyle = '#f6c453';
    ctx.strokeStyle = '#2a1f3a';
    ctx.lineWidth = 2 * px;
    ctx.fillRect(h.x - s / 2, h.y - s / 2, s, s);
    ctx.strokeRect(h.x - s / 2, h.y - s / 2, s, s);
  }
}

// ---------------------------------------------------------------- 点

type Action =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'move'; ref: Ref; start: Pt; base: Level; moved: boolean }
  | { kind: 'resize'; ref: Ref; corner: number; base: Level }
  | { kind: 'draw'; tool: Tool; start: Pt; now: Pt; sx: number; sy: number }
  | { kind: 'tap'; tool: Tool; now: Pt }
  | { kind: 'pinch'; d0: number; z0: number; w0: Pt };
let action: Action | null = null;
const pointers = new Map<number, { x: number; y: number }>();
let spaceDown = false;

const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
/** 拖出来的框；点一下（几乎没拖）给一块默认大小的。 */
function dragBox(a: Pt, b: Pt, t: Tool): Rect {
  const tiny = Math.hypot(b.x - a.x, b.y - a.y) * view.z < 10;
  if (tiny) {
    const size = t === 'rect' ? { w: 240, h: 40 } : t === 'spring' ? { w: 90, h: 120 } : t === 'cookie' ? { w: 140, h: 24 } : t === 'spike' ? { w: 120, h: 24 } : { w: 120, h: 160 };
    const x = Math.round((a.x - size.w / 2) / GRID) * GRID;
    const y = Math.round((a.y - size.h / 2) / GRID) * GRID;
    return { x, y, w: size.w, h: size.h };
  }
  const x0 = Math.round(Math.min(a.x, b.x) / GRID) * GRID;
  const y0 = Math.round(Math.min(a.y, b.y) / GRID) * GRID;
  const x1 = Math.max(x0 + GRID, Math.round(Math.max(a.x, b.x) / GRID) * GRID);
  const y1 = Math.max(y0 + GRID, Math.round(Math.max(a.y, b.y) / GRID) * GRID);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function handleAt(sx: number, sy: number): number {
  if (!sel || tool !== 'select') return -1;
  const reach = touchy ? 22 : 12;
  return handles(hist.level, sel).findIndex((h) => {
    const s = toScreen(h);
    return Math.abs(s.x - sx) <= reach && Math.abs(s.y - sy) <= reach;
  });
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = local(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    // 两根手指：缩放、挪画面，正在做的不算
    preview = null;
    const [a, b] = [...pointers.values()] as [Pt, Pt];
    action = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, w0: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
    redraw();
    return;
  }
  if (pointers.size > 2) return;
  if (spaceDown || e.button === 1) {
    action = { kind: 'pan', sx: p.x, sy: p.y, cx: view.cx, cy: view.cy };
    return;
  }
  if (e.button === 2) return;
  const w = toWorld(p.x, p.y);
  const pad = (touchy ? 14 : 6) / view.z;
  if (tool === 'select') {
    const corner = handleAt(p.x, p.y);
    if (corner >= 0 && sel) {
      action = { kind: 'resize', ref: sel, corner, base: hist.level };
      return;
    }
    const h = hit(hist.level, w, pad);
    if (h) {
      sel = h;
      action = { kind: 'move', ref: h, start: w, base: hist.level, moved: false };
      renderUi();
      redraw();
      return;
    }
    sel = null;
    renderUi();
    action = { kind: 'pan', sx: p.x, sy: p.y, cx: view.cx, cy: view.cy };
    redraw();
    return;
  }
  if (tool === 'erase') {
    const h = hit(hist.level, w, pad);
    if (h) commit(remove(hist.level, h), null);
    return;
  }
  if (DRAG_TOOLS.includes(tool)) action = { kind: 'draw', tool, start: w, now: w, sx: p.x, sy: p.y };
  else action = { kind: 'tap', tool, now: w };
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const p = local(e);
  pointers.set(e.pointerId, p);
  if (!action) return;
  if (action.kind === 'pinch') {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()] as [Pt, Pt];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    view.z = Math.min(3, Math.max(0.08, (action.z0 * d) / action.d0));
    // 两根手指中间那一点一直对着原来那个地方
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    view.cx = action.w0.x - (mid.x - W / 2) / view.z;
    view.cy = action.w0.y - (mid.y - H / 2) / view.z;
  } else if (action.kind === 'pan') {
    view.cx = action.cx - (p.x - action.sx) / view.z;
    view.cy = action.cy - (p.y - action.sy) / view.z;
  } else if (action.kind === 'move') {
    const w = toWorld(p.x, p.y);
    const dx = w.x - action.start.x;
    const dy = w.y - action.start.y;
    if (Math.hypot(dx, dy) * view.z >= 4) action.moved = true;
    if (action.moved) preview = move(action.base, action.ref, dx, dy);
  } else if (action.kind === 'resize') {
    preview = resize(action.base, action.ref, action.corner, toWorld(p.x, p.y));
  } else {
    action.now = toWorld(p.x, p.y);
  }
  redraw();
});

function endPointer(e: PointerEvent, cancel: boolean): void {
  if (!pointers.delete(e.pointerId)) return;
  const a = action;
  if (!a) return;
  if (a.kind === 'pinch') {
    if (pointers.size < 2) action = null;
    return;
  }
  action = null;
  if (cancel) {
    preview = null;
    redraw();
    return;
  }
  if (a.kind === 'move' || a.kind === 'resize') {
    const next = preview;
    preview = null;
    if (next) commit(next, a.ref);
    else redraw();
  } else if (a.kind === 'draw') {
    const r = dragBox(a.start, a.now, a.tool);
    const res = place(hist.level, a.tool, { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { material, hazard });
    if (res.ref) commit(res.level, res.ref);
    else full(a.tool);
  } else if (a.kind === 'tap') {
    const res = place(hist.level, a.tool, a.now, a.now, { material, hazard });
    if (res.ref) commit(res.level, res.ref);
    else full(a.tool);
  } else redraw();
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = local(e);
    const before = toWorld(p.x, p.y);
    view.z = Math.min(3, Math.max(0.08, view.z * Math.exp(-e.deltaY * 0.0015)));
    view.cx = before.x - (p.x - W / 2) / view.z;
    view.cy = before.y - (p.y - H / 2) / view.z;
    redraw();
  },
  { passive: false },
);
/** 这样放满了。 */
function full(t: Tool): void {
  const warn = $('warn');
  warn.hidden = false;
  warn.textContent = tr(`${TOOL_TEXT[t].zh}放满了`, `No room for another ${TOOL_TEXT[t].en.toLowerCase()}`);
  setTimeout(renderBottom, 2000);
}

addEventListener('keydown', (e) => {
  if (!$('play').hidden) return;
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  if (typing) return;
  const mod = e.metaKey || e.ctrlKey;
  if (e.code === 'Space') {
    spaceDown = true;
    e.preventDefault();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
    e.preventDefault();
    delSel();
  } else if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey ? hist.redo() : hist.undo()) after();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    if (hist.redo()) after();
  } else if (e.key === 'Escape') {
    sel = null;
    renderUi();
    redraw();
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') spaceDown = false;
});
addEventListener('resize', () => {
  sizeCanvas();
  redraw();
});

// ---------------------------------------------------------------- 分享、我的关

const shareDlg = $<HTMLDialogElement>('shareDlg');
const mineDlg = $<HTMLDialogElement>('mineDlg');
let urls = { play: '', edit: '' };

async function share(): Promise<void> {
  const l = hist.level;
  const code = await encodeLevel(l);
  if (!code) return;
  urls = { play: `${location.origin}/hang-on/?custom=${code}`, edit: `${location.origin}/hang-on/editor/#${code}` };
  history.replaceState(null, '', `#${code}`);
  $<HTMLInputElement>('playUrl').value = urls.play;
  $<HTMLInputElement>('editUrl').value = urls.edit;
  $<HTMLAnchorElement>('openPlay').href = urls.play;
  const mine = (store.get<Mine[]>(MINE) ?? []).filter((m) => m.code !== code);
  mine.unshift({ code, name: l.name?.zh ?? '', at: Date.now() });
  store.set(MINE, mine.slice(0, 30));
  if (!shareDlg.open) shareDlg.showModal();
}
/** 复制链接；浏览器不让的话把框里的字选上（框是文字框，能长按复制）。 */
async function copy(field: HTMLInputElement, btn: HTMLButtonElement): Promise<void> {
  let ok = false;
  try {
    await navigator.clipboard.writeText(field.value);
    ok = true;
  } catch {
    field.focus();
    field.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
  }
  const was = btn.textContent;
  btn.textContent = ok ? tr('复制好了 ✓', 'Copied ✓') : tr('复制不了：链接选上了，长按复制', 'Could not copy: the link is selected, long-press to copy');
  setTimeout(() => (btn.textContent = was), 1800);
}
$('shareBtn').addEventListener('click', () => void share());
$('copyPlay').addEventListener('click', (e) => void copy($<HTMLInputElement>('playUrl'), e.currentTarget as HTMLButtonElement));
$('copyEdit').addEventListener('click', (e) => void copy($<HTMLInputElement>('editUrl'), e.currentTarget as HTMLButtonElement));
$('shareDone').addEventListener('click', () => shareDlg.close());

function renderMine(): void {
  const list = store.get<Mine[]>(MINE) ?? [];
  $('mineNone').hidden = list.length > 0;
  $('mineList').replaceChildren(
    ...list.map((m) => {
      const li = document.createElement('li');
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = m.name || tr('没起名字', 'Untitled');
      const at = document.createElement('small');
      const d = new Date(m.at);
      at.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn main';
      open.textContent = tr('打开', 'Open');
      open.addEventListener('click', async () => {
        const l = await decodeLevel(m.code);
        if (!l) return;
        hist = new History(tidy({ ...l, id: 'custom-draft' }));
        sel = null;
        history.replaceState(null, '', `#${m.code}`);
        store.set(DRAFT, hist.level);
        mineDlg.close();
        fit();
        renderUi();
        redraw();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn';
      del.textContent = tr('删掉', 'Delete');
      del.setAttribute('aria-label', tr(`删掉「${m.name}」`, `Delete "${m.name}"`));
      del.addEventListener('click', () => {
        store.set(
          MINE,
          (store.get<Mine[]>(MINE) ?? []).filter((x) => x.code !== m.code),
        );
        renderMine();
      });
      li.append(nm, at, open, del);
      return li;
    }),
  );
}
$('mineBtn').addEventListener('click', () => {
  renderMine();
  mineDlg.showModal();
});
$('mineDone').addEventListener('click', () => mineDlg.close());

// ---------------------------------------------------------------- 试玩（和游戏同一套物理、画面）

let stage: Stage | null = null;
let sim: Sim | null = null;
let raf = 0;
let playLevel: Level | null = null;
const keys = new Set<string>();
const mouse = { x: 0, y: 0, active: false, L: false, R: false };
const stickIn = { ax: 0, ay: 0, L: false, R: false, id: null as number | null, sx: 0, sy: 0 };
const playCanvas = $<HTMLCanvasElement>('stage');
let engine: Promise<{ Stage: typeof import('../render/stage').Stage; createSim: typeof import('../physics/world').createSim; CFG: typeof import('../physics/config').CFG; sfx: typeof import('../audio/sfx').sfx; PLATES: typeof import('../render/plates').PLATES }> | null = null;
/** 试玩的东西（画面、物理、声音）第一次点「试玩」才下载。 */
const loadEngine = () =>
  (engine ??= Promise.all([import('../render/stage'), import('../physics/world'), import('../physics/config'), import('../audio/sfx'), import('../render/plates')]).then(([s, w, c, a, p]) => ({ Stage: s.Stage, createSim: w.createSim, CFG: c.CFG, sfx: a.sfx, PLATES: p.PLATES })));

async function startPlay(): Promise<void> {
  playLevel = { ...hist.level, id: 'custom-test' };
  $('play').hidden = false;
  $('won').hidden = true;
  $('touch').hidden = !touchy;
  $('keys').hidden = touchy;
  const e = await loadEngine();
  stage ??= await e.Stage.create(playCanvas, { plates: e.PLATES, compact: touchy });
  stage.resize();
  e.sfx.attach(document);
  sfxNow = e.sfx;
  stepDt = e.CFG.step;
  await restartPlay();
  cancelAnimationFrame(raf);
  last = performance.now();
  acc = 0;
  raf = requestAnimationFrame(frame);
}
async function restartPlay(): Promise<void> {
  if (!playLevel || !stage) return;
  const e = await loadEngine();
  sim?.destroy();
  sim = await e.createSim(playLevel, 1, { mode: 'climb' });
  stage.setLevel(sim.level);
  stage.reset();
  stage.syncPlayers(sim);
  stage.intro(1.6);
  $('won').hidden = true;
}
function stopPlay(): void {
  cancelAnimationFrame(raf);
  sim?.destroy();
  sim = null;
  keys.clear();
  $('play').hidden = true;
  sizeCanvas();
  redraw();
}
let last = 0;
let acc = 0;
function readInput(): PadInput {
  let ax = 0;
  let ay = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
  if (!ax && !ay && stickIn.id !== null) {
    ax = stickIn.ax;
    ay = stickIn.ay;
  }
  const p1 = sim?.players[0];
  if (!ax && !ay && mouse.active && !touchy && p1 && stage) {
    const s = stage.toScreen(p1.body);
    const dx = mouse.x - s.x;
    const dy = mouse.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d > 24) {
      ax = dx / Math.max(d, 90);
      ay = dy / Math.max(d, 90);
    }
  }
  return { ax, ay, gl: keys.has('KeyQ') || keys.has('ShiftLeft') || mouse.L || stickIn.L, gr: keys.has('KeyE') || keys.has('ShiftRight') || mouse.R || stickIn.R };
}
function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  if (!sim || !stage) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const step = stepDt;
  acc += dt * stage.timeScale;
  sim.setInput(0, readInput());
  while (acc >= step) {
    sim.step(step);
    stage.handleEvents(sim, sim.events);
    sfxNow?.handleEvents(sim, sim.events);
    for (const ev of sim.events) if (ev.type === 'win') showWon();
    acc -= step;
  }
  stage.updateCamera(sim, dt);
  stage.draw(sim, dt);
  $('clock').textContent = sim.time.toFixed(1);
  $('falls').textContent = String(sim.players.reduce((s, p) => s + p.deaths, 0));
}
let sfxNow: { handleEvents(sim: Sim, ev: Sim['events']): void } | null = null;
let stepDt = 1 / 60;
function showWon(): void {
  if (!sim) return;
  const falls = sim.players.reduce((s, p) => s + p.deaths, 0);
  $('wonLine').textContent = tr(`${sim.time.toFixed(1)} 秒，摔了 ${falls} 次。好玩的话就分享出去！`, `${sim.time.toFixed(1)} s, ${falls} ${falls === 1 ? 'fall' : 'falls'}. If it's fun, share it!`);
  $('won').hidden = false;
}
$('testBtn').addEventListener('click', () => void startPlay());
$('backBtn').addEventListener('click', stopPlay);
$('back2Btn').addEventListener('click', stopPlay);
$('restartBtn').addEventListener('click', () => void restartPlay());
$('againBtn').addEventListener('click', () => void restartPlay());
addEventListener('keydown', (e) => {
  if ($('play').hidden) return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.key === 'Escape') stopPlay();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
playCanvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.active = true;
});
playCanvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (e.button === 0) mouse.L = true;
  if (e.button === 2) mouse.R = true;
});
addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (e.button === 0) mouse.L = false;
  if (e.button === 2) mouse.R = false;
});
playCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
const hold = (el: HTMLElement, key: 'L' | 'R'): void => {
  const on = (e: PointerEvent): void => {
    e.preventDefault();
    stickIn[key] = true;
    el.classList.add('down');
    el.setPointerCapture?.(e.pointerId);
  };
  const off = (e: PointerEvent): void => {
    e.preventDefault();
    stickIn[key] = false;
    el.classList.remove('down');
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
};
hold($('padL'), 'L');
hold($('padR'), 'R');
const stickEl = $('stick');
const knob = $('knob');
const moveStick = (e: PointerEvent): void => {
  let dx = e.clientX - stickIn.sx;
  let dy = e.clientY - stickIn.sy;
  const d = Math.hypot(dx, dy) || 1;
  if (d > 44) {
    dx = (dx / d) * 44;
    dy = (dy / d) * 44;
  }
  stickIn.ax = dx / 44;
  stickIn.ay = dy / 44;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
};
stickEl.addEventListener('pointerdown', (e) => {
  stickIn.id = e.pointerId;
  const r = stickEl.getBoundingClientRect();
  stickIn.sx = r.left + r.width / 2;
  stickIn.sy = r.top + r.height / 2;
  stickEl.setPointerCapture(e.pointerId);
  moveStick(e);
});
stickEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickIn.id) moveStick(e);
});
const endStick = (e: PointerEvent): void => {
  if (e.pointerId !== stickIn.id) return;
  stickIn.id = null;
  stickIn.ax = 0;
  stickIn.ay = 0;
  knob.style.transform = '';
};
stickEl.addEventListener('pointerup', endStick);
stickEl.addEventListener('pointercancel', endStick);
addEventListener('resize', () => stage?.resize());

// ---------------------------------------------------------------- 开始

fit();
renderUi();
redraw();
// 检查脚本用：现在的关、选的工具
(window as unknown as { editor: unknown }).editor = {
  get level() {
    return hist.level;
  },
  get tool() {
    return tool;
  },
  get sim() {
    return sim;
  },
  view,
  toScreen,
};
