#!/usr/bin/env node
// 手机局检查：一部手机开房自己也玩，两部手机扫码进来，每部手机都看得到画面、按得动，倒数、结算、再来一次都跟着走；
// 一部走直连、一部走绕路，快照的频率对；电视局的手柄不下载画面。
// npm run dev（或 wrangler dev）开着，然后 npm run phone-check。截图放在系统临时目录。
// 第一部手机真画画面，第二部不画；房主默认不画（CI 的机器没显卡，三部都画就慢得像卡死），RENDER=1 房主也画（看截图用）。
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname), 'Use the local npm run dev server.');
const RENDER = process.env.RENDER === '1';
const pw = await import(process.env.PLAYWRIGHT ?? 'playwright');
const { chromium } = pw.default ?? pw;
const out = await mkdtemp(join(tmpdir(), 'hang-on-phone-'));
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
const contexts = [];
const failures = [];
const errors = [];
let shot = 0;
let host;
// 手机的样子：横着的 844 × 390。像素密度默认 1：CI 的机器没显卡，画得太细手机 1 一秒只画两三帧，输入也跟着慢（看截图时 RENDER=1 用 2）
const PHONE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: RENDER ? 2 : 1, locale: 'zh-CN' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
  return ok;
}
async function screenshot(page, name) {
  await page.screenshot({ path: join(out, `${String(++shot).padStart(2, '0')}-${name}.png`) });
}
async function until(fn, timeout = 5000) {
  const at = performance.now();
  do {
    if (await fn()) return performance.now() - at;
    await sleep(50);
  } while (performance.now() - at < timeout);
  return -1;
}
async function phase(want, timeout = 8000) {
  return until(() => host.evaluate((want) => hangOn.phase === want, want), timeout);
}
async function context(options, name) {
  const ctx = await browser.newContext(options);
  contexts.push(ctx);
  const page = await ctx.newPage();
  const requests = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('request', (r) => requests.push(r.url()));
  return { ctx, page, requests };
}
const shown = (page, sel) => page.locator(sel).isVisible();

console.log(`Screenshots: ${out}`);
try {
  // ---------- 房主：手机上打开主机页，自动是手机局 ----------
  const h = await context(PHONE, 'host');
  host = h.page;
  await host.goto(`${BASE}/hang-on/?lang=zh&level=table-01${RENDER ? '' : '&render=0'}`);
  await host.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('code')?.textContent ?? ''));
  const code = await host.locator('#code').textContent();
  assert(check('手机上打开主机页自动是手机局', await host.evaluate(() => hangOn.phoneMode && document.body.classList.contains('phone')), code));
  check('大厅说的是手机局（不用电视），键盘加入和绕路键收起来', (await shown(host, '#lobby p.phone-only')) && !(await shown(host, '#lobby p.tv-only')) && !(await shown(host, '#kbBtn')) && !(await shown(host, '#relayBtn')));
  const mine = await host.locator('#seats .seat.me .nm').textContent();
  check('大厅里有房主自己的座位卡', mine === '房主', mine);
  check('房主是 0 号颜色（草莓粉）', (await host.evaluate(() => hangOn.sim.players[0]?.color)) === '#F28CA6');
  await screenshot(host, 'host-lobby');
  const lookBefore = await host.evaluate(() => document.querySelector('#seats .seat.me canvas')?.toDataURL());
  await host.locator('#seats .seat.me').tap();
  const lookAfter = await host.evaluate(() => document.querySelector('#seats .seat.me canvas')?.toDataURL());
  check('点自己的座位卡换个样子（真点击）', lookBefore !== lookAfter);

  // ---------- 两部手机扫码进来 ----------
  const pads = [];
  for (const [i, name] of ['阿一', '阿二'].entries()) {
    const render = i === 0;
    const pad = await context(PHONE, `pad${i + 1}`);
    // 第一部走二维码的链接（/r/房间码 跳到手柄页，码填好）；第二部直接开手柄页、不画画面
    await pad.page.goto(render ? `${BASE}/hang-on/r/${code}` : `${BASE}/hang-on/pad/?code=${code}&render=0`);
    check(`手机 ${i + 1} 的房间码填好了`, (await pad.page.locator('#code').inputValue()) === code);
    await pad.page.locator('#name').fill(name);
    await pad.page.locator('#joinForm button[type=submit]').tap();
    await pad.page.locator('#pad').waitFor({ state: 'visible' });
    pads.push(pad);
  }
  // 房主也画画面时（RENDER=1）这台机器忙，直连可能超时改走绕路：那时只要连上就行
  const ready = await until(() => host.evaluate((strict) => hangOn.peers().length === 2 && hangOn.peers().every((p) => p.connected && (p.direct || (!strict && p.relayed))), !RENDER), 15000);
  assert(check(RENDER ? '两部手机都连上' : '两部手机都连上、直连', ready >= 0, `${ready.toFixed(0)} ms`));
  check('进来的手机拿 1、2 号颜色（0 号是房主的）', JSON.stringify(await host.evaluate(() => hangOn.peers().map((p) => p.color).sort())) === '[1,2]');
  check('房主排在手柄后面', (await host.evaluate(() => [hangOn.sim.players.length, hangOn.localIndex])).join() === '3,2');
  for (const [i, pad] of pads.entries()) {
    const viewing = await until(() => pad.page.evaluate(() => document.body.classList.contains('viewing') && !!hangOnPad.view && hangOnPad.view.snaps > 3 && hangOnPad.view.me >= 0), 10000);
    assert(check(`手机 ${i + 1} 自己也有画面（快照在来）`, viewing >= 0, `${viewing.toFixed(0)} ms`));
    const me = await pad.page.evaluate(() => hangOnPad.view.me);
    const seat = await host.evaluate((i) => hangOn.seatOrder.indexOf(hangOn.peers()[i].seat), i);
    check(`手机 ${i + 1} 知道自己是第几个人`, me === seat, `${me}`);
    const names = await pad.page.evaluate(() => hangOnPad.view.sim.players.length);
    check(`手机 ${i + 1} 画面里有三个人`, names === 3, `${names}`);
    check(`手机 ${i + 1} 显示「等房主开始」`, await shown(pad.page, '#vWait'));
    check(`手机 ${i + 1} 没下载物理（Rapier）`, !pad.requests.some((u) => /\/world-[^/]*\.js/.test(u)));
    await screenshot(pad.page, `pad${i + 1}-lobby`);
  }
  // 位置对得上：手机上画的和房主算的差不到 30 像素（隔着一张快照）
  const gap = await (async () => {
    const real = await host.evaluate(() => hangOn.sim.players.map((p) => [p.body.x, p.body.y]));
    const seen = await pads[0].page.evaluate(() => hangOnPad.view.sim.players.map((p) => [p.body.x, p.body.y]));
    return Math.max(...real.map(([x, y], i) => Math.hypot(x - (seen[i]?.[0] ?? 1e9), y - (seen[i]?.[1] ?? 1e9))));
  })();
  check('手机上的人和房主那边的位置对得上', gap < 30, `${gap.toFixed(1)} px`);

  // 手柄上的按钮在真手机上点得动（以前整块手柄掐了 touchend，换样子、召唤都点不动）
  await pads[0].page.locator('#lookBtn2').tap();
  check('手柄上「样子」键真点得开', await until(() => pads[0].page.evaluate(() => document.getElementById('lookDlg').open), 2000) >= 0);
  await pads[0].page.locator('#lookDone').tap();
  await until(() => pads[0].page.evaluate(() => !document.getElementById('lookDlg').open), 2000);

  // ---------- 开始：倒数在每部手机上 ----------
  await host.locator('#startBtn').tap();
  assert(check('房主点开始进入倒数', (await phase('countdown')) >= 0));
  check('倒数时房主的摇杆和抓键出来了', await shown(host, '#touch'));
  for (const [i, pad] of pads.entries()) check(`手机 ${i + 1} 也在倒数`, (await until(() => shown(pad.page, '#vCount'), 2000)) >= 0);
  await screenshot(host, 'host-countdown');
  await screenshot(pads[0].page, 'pad1-countdown');
  assert(check('倒数完开始玩', (await phase('playing')) >= 0));
  for (const [i, pad] of pads.entries()) check(`手机 ${i + 1} 倒数收起来`, (await until(() => pad.page.evaluate(() => document.getElementById('vCount').hidden), 2500)) >= 0);

  // 房主的抓键：真按下去就是抓，松开就放
  const grabL = host.locator('#touch .grab:not(.r)');
  await grabL.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true, pointerType: 'touch' });
  check('房主按住左手键就是抓', await host.evaluate(() => hangOn.touch.grab.l && document.querySelector('#touch .grab:not(.r)').classList.contains('down')));
  await grabL.dispatchEvent('pointerup', { pointerId: 7, isPrimary: true, pointerType: 'touch' });
  check('松开就放', await host.evaluate(() => !hangOn.touch.grab.l));
  // 房主往右荡
  const hx = await host.evaluate(() => hangOn.sim.players[hangOn.localIndex].body.x);
  await host.evaluate(() => Object.assign(hangOn.touch.aim, { x: 1, y: 0.6 }));
  await sleep(400);
  await host.evaluate(() => {
    Object.assign(hangOn.touch.aim, { x: 1, y: 0.2 });
    Object.assign(hangOn.touch.grab, { l: true, r: true });
  });
  const hostMoved = await until(() => host.evaluate((x) => hangOn.sim.players[hangOn.localIndex].body.x > x + 10, hx), 4000);
  check('房主的触屏输入使身体前进', hostMoved >= 0, `${hostMoved.toFixed(0)} ms`);
  // 房主放手站好，别抓着别人
  await host.evaluate(() => {
    Object.assign(hangOn.touch.aim, { x: 0, y: 0 });
    Object.assign(hangOn.touch.grab, { l: false, r: false });
  });
  // 手机 1 推摇杆、按抓：一来一回（手机 → 房主跑物理 → 快照 → 手机自己的画面）看得到胳膊指过去、手抓上
  // （身体走不走看抓到了什么：三个人挤在起点，常常抓的是旁边的人，所以这里不量身体）
  const me1 = await pads[0].page.evaluate(() => hangOnPad.view.me);
  await pads[0].page.evaluate(() => hangOnPad.set({ ax: 1, ay: 0.2, gl: true, gr: true }));
  const seen = (me) => {
    const p = hangOnPad.view.sim.players[me];
    return { aim: p.aim.x, grips: p.arms.filter((a) => a.grip).length };
  };
  const aimed = await until(() => pads[0].page.evaluate((me) => hangOnPad.view.sim.players[me].aim.x > 0.9, me1), 6000);
  const fps = await pads[0].page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => (++n, performance.now() - t0 < 1000 ? requestAnimationFrame(f) : res(n)); requestAnimationFrame(f); }));
  check('手机 1 推摇杆，转一圈回到自己的画面上（胳膊指过去）', aimed >= 0, `${aimed.toFixed(0)} ms, ${JSON.stringify(await pads[0].page.evaluate(seen, me1))}, 手机 1 每秒 ${fps} 帧`);
  // 手抓没抓上看手边有什么；要的是两边一样：房主那边抓着几只，手机上就画几只
  const hostGrips = await host.evaluate((me) => hangOn.sim.players[me].arms.filter((a) => a.grip).length, me1);
  const sameGrips = await until(() => pads[0].page.evaluate(({ me, n }) => hangOnPad.view.sim.players[me].arms.filter((a) => a.grip).length === n, { me: me1, n: hostGrips }), 3000);
  check('手机 1 画的手和房主那边抓着的一样', sameGrips >= 0, `房主那边抓着 ${hostGrips} 只`);
  await pads[0].page.evaluate(() => hangOnPad.set({ ax: 0, ay: 0, gl: false, gr: false }));
  await screenshot(host, 'host-playing');
  await screenshot(pads[0].page, 'pad1-playing');

  // ---------- 快照频率：直连 20 张一秒，绕路 10 张一秒 ----------
  await host.evaluate(() => (hangOn.link.forceRelay = true));
  await pads[1].page.evaluate(() => hangOnPad.link.simulateDrop());
  const relayed = await until(() => host.evaluate(() => hangOn.peers()[1].connected && hangOn.peers()[1].relayed && !hangOn.peers()[1].direct), 8000);
  check('手机 2 改走绕路', relayed >= 0, `${relayed.toFixed(0)} ms`);
  await sleep(500);
  const rate = async (pad) => {
    const a = await pad.page.evaluate(() => hangOnPad.view.snaps);
    await sleep(2000);
    return ((await pad.page.evaluate(() => hangOnPad.view.snaps)) - a) / 2;
  };
  const [direct, relay] = await Promise.all([rate(pads[0]), rate(pads[1])]);
  if (await host.evaluate(() => hangOn.peers()[0].direct)) check('直连的手机一秒十几二十张快照', direct >= 12 && direct <= 24, `${direct}/s`);
  else check('手机 1 没直连（RENDER=1 时机器忙），跳过直连频率', RENDER, `${direct}/s`);
  check('绕路的手机一秒十张左右', relay >= 5 && relay <= 13, `${relay}/s`);
  const relayGap = await (async () => {
    const real = await host.evaluate(() => hangOn.sim.players.map((p) => [p.body.x, p.body.y]));
    const seen = await pads[1].page.evaluate(() => hangOnPad.view.sim.players.map((p) => [p.body.x, p.body.y]));
    return Math.max(...real.map(([x, y], i) => Math.hypot(x - (seen[i]?.[0] ?? 1e9), y - (seen[i]?.[1] ?? 1e9))));
  })();
  check('绕路的手机位置也对得上', relayGap < 60, `${relayGap.toFixed(1)} px`);
  await host.evaluate(() => (hangOn.link.forceRelay = false));

  // ---------- 到顶：每部手机都出结算 ----------
  await host.evaluate(() => {
    const g = hangOn.sim.level.goal;
    hangOn.sim.players.forEach((_, i) => hangOn.sim.teleport(i, g.x + g.w / 2 + (i - 1) * 40, g.y + g.h / 2));
  });
  assert(check('三个人到顶', (await until(() => host.evaluate(() => hangOn.sim.won))) >= 0));
  for (const [i, pad] of pads.entries()) {
    const win = await until(() => pad.page.evaluate(() => hangOnPad.view.wins > 0), 3000);
    const why = await pad.page.evaluate(() => `snaps ${hangOnPad.view.snaps} events ${hangOnPad.view.events} won ${hangOnPad.view.sim.won}`);
    const path = await host.evaluate((i) => (hangOn.peers()[i].direct ? 'direct' : 'relayed'), i);
    check(`手机 ${i + 1} 也收到「到顶了」（横幅、纸屑）`, win >= 0, `${why}, ${path}`);
  }
  assert(check('房主出结算页', (await phase('results')) >= 0));
  for (const [i, pad] of pads.entries()) {
    const res = await until(() => pad.page.evaluate(() => !document.getElementById('vResults').hidden && document.querySelectorAll('#vDeathList li').length === 3), 4000);
    check(`手机 ${i + 1} 也出结算，三个人都在`, res >= 0);
  }
  const rows = await pads[0].page.locator('#vDeathList .who').allTextContents();
  check('结算上有房主和两个人的名字', ['房主', '阿一', '阿二'].every((n) => rows.includes(n)), rows.join(', '));
  await screenshot(host, 'host-results');
  await screenshot(pads[0].page, 'pad1-results');
  await host.locator('#againBtn').tap();
  assert(check('再来一次：直接倒数', (await phase('countdown')) >= 0));
  for (const [i, pad] of pads.entries()) check(`手机 ${i + 1} 结算收起、跟着倒数`, (await until(() => pad.page.evaluate(() => document.getElementById('vResults').hidden && !document.getElementById('vCount').hidden), 3000)) >= 0);
  await host.locator('#lobbyBtn').tap();
  assert(check('回大厅', (await phase('lobby')) >= 0));
  for (const [i, pad] of pads.entries()) check(`手机 ${i + 1} 回到「等房主开始」`, (await until(() => shown(pad.page, '#vWait'), 3000)) >= 0);

  // ---------- 电视局的手柄不下载画面 ----------
  const tv = await context({ viewport: { width: 1280, height: 720 } }, 'tv');
  await tv.page.goto(`${BASE}/hang-on/?render=0&lang=zh&phone=0`);
  await tv.page.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('code')?.textContent ?? ''));
  const tvCode = await tv.page.locator('#code').textContent();
  check('电脑上打开还是电视局', await tv.page.evaluate(() => !hangOn.phoneMode));
  const tvPad = await context(PHONE, 'tvpad');
  await tvPad.page.goto(`${BASE}/hang-on/r/${tvCode}`);
  await tvPad.page.locator('#name').fill('阿三');
  await tvPad.page.locator('#joinForm button[type=submit]').tap();
  await tvPad.page.locator('#pad').waitFor({ state: 'visible' });
  await until(() => tv.page.evaluate(() => hangOn.peers().length === 1 && hangOn.peers()[0].direct), 10000);
  await sleep(800);
  check('电视局的手柄不变成画面', await tvPad.page.evaluate(() => !document.body.classList.contains('viewing') && document.getElementById('view').hidden));
  check('电视局的手柄不下载画面（Pixi）', !tvPad.requests.some((u) => /\/(view|stage)-[^/]*\.js/.test(u)), tvPad.requests.filter((u) => u.includes('/assets/')).map((u) => u.split('/').pop()).join(' '));
  await screenshot(tvPad.page, 'tv-pad');

  check('页面无脚本错误', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('手机局流程完成', false, error.stack ?? String(error));
  if (host) await screenshot(host, 'failure').catch(() => {});
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser.close();
}
console.log(`phone-check: ${failures.length ? `FAIL (${failures.length})` : 'PASS'}; screenshots: ${out}`);
process.exitCode = failures.length ? 1 : 0;
