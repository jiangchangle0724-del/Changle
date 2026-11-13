#!/usr/bin/env node
// npm run dev in another terminal, then npm run lobby-check. Screenshots stay in the system temp directory.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname), 'Use the local npm run dev server.');
const pw = await import(process.env.PLAYWRIGHT ?? 'playwright');
const { chromium } = pw.default ?? pw;
const out = await mkdtemp(join(tmpdir(), 'hang-on-lobby-'));
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
const contexts = [];
const failures = [];
const errors = [];
let shot = 0;
let host;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
  return until(() => host.evaluate(want => hangOn.phase === want, want), timeout);
}
async function context(options) {
  const ctx = await browser.newContext(options);
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  return { ctx, page };
}
console.log(`Screenshots: ${out}`);
try {
  ({ page: host } = await context({ viewport: { width: 1280, height: 720 } }));
  // Same render=0 escape hatch as link-check: CI tests the real DOM and physics without GPU work.
  await host.goto(`${BASE}/hang-on/?render=0&lang=zh&level=table-01`);
  await host.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('code')?.textContent ?? ''));
  const code = await host.locator('#code').textContent();
  check('主机开房并显示大厅', await host.locator('#lobby').isVisible(), code);
  await screenshot(host, 'lobby');
  const pads = [];
  for (const name of ['阿一', '阿二']) {
    const pad = await context({ viewport: { width: 800, height: 380 }, isMobile: true, hasTouch: true });
    await pad.page.goto(`${BASE}/hang-on/pad/?lang=zh`);
    await pad.page.locator('#code').fill(code);
    await pad.page.locator('#name').fill(name);
    await screenshot(pad.page, `join-form-${pads.length + 1}`);
    await pad.page.locator('#joinForm button[type=submit]').click();
    await pad.page.locator('#pad').waitFor({ state: 'visible' });
    await screenshot(pad.page, `joined-${pads.length + 1}`);
    pads.push(pad);
  }
  const peersReady = await until(() => host.evaluate(() => hangOn.peers().length === 2 && hangOn.peers().every(p => p.connected && p.direct)), 15000);
  assert(check('两个手柄直连', peersReady >= 0, `${peersReady.toFixed(0)} ms`));
  const names = await host.locator('#seats .seat:not(.empty) .nm').allTextContents();
  check('两张座位卡显示填写的名字', JSON.stringify(names) === JSON.stringify(['阿一', '阿二']), names.join(', '));
  await screenshot(host, 'seats');

  const chinese = await host.locator('#levelName').textContent();
  await host.locator('#langBtn').click();
  const english = await host.locator('#levelName').textContent();
  check('大厅语言键真点击，关卡名切换语言', english !== chinese && /[A-Za-z]/.test(english), `${chinese} → ${english}`);
  await screenshot(host, 'english');
  await host.locator('#langBtn').click();
  check('再次点击切回原关卡名', await host.locator('#levelName').textContent() === chinese);
  await screenshot(host, 'chinese');

  await host.locator('#startBtn').click();
  assert(check('开始后进入倒数', await phase('countdown') >= 0));
  await screenshot(host, 'countdown');
  assert(check('倒数后进入 playing', await phase('playing') >= 0));
  await screenshot(host, 'playing');
  for (let i = 0; i < 2; i++) {
    const x = await host.evaluate(i => hangOn.sim.players[i].body.x, i);
    await pads[i].page.evaluate(() => hangOnPad.set({ ax: 1, ay: 0.6, gl: false, gr: false }));
    await sleep(400);
    await pads[i].page.evaluate(() => hangOnPad.set({ ax: 1, ay: 0.2, gl: true, gr: true }));
    const moved = await until(() => host.evaluate(({ i, x }) => hangOn.sim.players[i].body.x > x + 10, { i, x }), 4000);
    check(`手柄 ${i + 1} 输入使身体前进`, moved >= 0, `${moved.toFixed(0)} ms`);
    await pads[i].page.evaluate(() => hangOnPad.set({ ax: 0, ay: 0, gl: true, gr: true }));
    await screenshot(host, `input-${i + 1}`);
  }

  // Closing BOTH channels is essential: browser offline alone leaves an existing WebRTC channel alive.
  const beforeSeq = await host.evaluate(() => hangOn.peers()[0].input.seq);
  await pads[0].ctx.setOffline(true);
  const droppedAt = performance.now();
  await pads[0].page.evaluate(() => hangOnPad.link.simulateDrop());
  await sleep(1000);
  await screenshot(pads[0].page, 'offline-pad');
  await screenshot(host, 'offline-host');
  await sleep(Math.max(0, 4000 - (performance.now() - droppedAt)));
  const stale = await host.evaluate(() => performance.now() - hangOn.peers()[0].lastInputAt);
  check('手柄真实停止输入满 4 秒', stale >= 3800, `last input ${stale.toFixed(0)} ms ago`);
  const restoredAt = performance.now();
  await pads[0].ctx.setOffline(false);
  const back = await until(() => host.evaluate(seq => {
    const p = hangOn.peers()[0];
    return p.connected && p.direct && p.input.seq > seq && performance.now() - p.lastInputAt < 200;
  }, beforeSeq), 5000);
  const recovery = performance.now() - restoredAt;
  check('断线 4 秒后 5 秒内直连和新输入恢复', back >= 0 && recovery <= 5000, `${recovery.toFixed(0)} ms after network restored`);
  await screenshot(host, 'reconnected');
  for (const pad of pads) await pad.page.evaluate(() => hangOnPad.set({ ax: 0, ay: 0, gl: false, gr: false }));

  await host.evaluate(() => {
    const g = hangOn.sim.level.goal;
    hangOn.sim.players.forEach((_, i) => hangOn.sim.teleport(i, g.x + g.w / 2 + (i - 0.5) * 50, g.y + g.h / 2));
  });
  const won = await until(() => host.evaluate(() => hangOn.sim.won));
  assert(check('两人到终点触发胜利', won >= 0));
  const celebrationAt = performance.now();
  check('胜利后先庆祝，结算页尚未盖上', await host.evaluate(() => hangOn.phase === 'playing' && document.getElementById('results').hidden));
  await screenshot(host, 'celebration');
  await sleep(1000);
  check('庆祝至少持续一秒', await host.evaluate(() => hangOn.phase === 'playing'));
  assert(check('庆祝之后出现结算页', await phase('results') >= 0, `${(performance.now() - celebrationAt).toFixed(0)} ms`));
  check('结算列出两个玩家', await host.locator('#deathList li').count() === 2);
  await screenshot(host, 'results');

  await host.locator('#nextBtn').click();
  const nextCountdown = await phase('countdown', 4500);
  check('下一关按钮直接进入倒数', nextCountdown >= 0,
    await host.evaluate(() => `phase=${hangOn.phase}, level=${hangOn.level.id}`));
  await screenshot(host, 'next-click');
  // On failure, keep checking the remainder through another REAL click; the script still exits nonzero.
  if (nextCountdown < 0 && await host.evaluate(() => hangOn.phase === 'lobby')) {
    console.log('diagnostic continuation: clicking Start after the unexpected lobby');
    await host.locator('#startBtn').click();
    assert(await phase('countdown') >= 0);
    await screenshot(host, 'next-countdown-after-start');
  }
  const nextTitle = await host.locator('#countLevel').textContent();
  check('倒数的关卡名是第 2 关', await host.evaluate(() => hangOn.level.id === 'table-02') && /^2\s*[·.]/.test(nextTitle), nextTitle);
  await host.locator('#lobbyBtn').click();
  check('回大厅按钮在倒数遮罩上可点击并回到大厅', await phase('lobby') >= 0 && await host.locator('#lobby').isVisible());
  await screenshot(host, 'back-to-lobby');
  // 手机投屏到电视时用电视局：横着的手机只有 393 高，开始键不用滚就看得见、点得到，底下的键盘说明不出来
  const tvPhone = await context({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
  await tvPhone.page.goto(`${BASE}/hang-on/?render=0&lang=zh&phone=0`);
  await tvPhone.page.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('code')?.textContent ?? ''));
  const startSpot = await tvPhone.page.evaluate(() => {
    const r = document.getElementById('startBtn').getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { short: document.body.classList.contains('short'), bottom: Math.round(r.bottom), height: innerHeight, hit: hit?.id ?? '', note: getComputedStyle(document.getElementById('note')).display };
  });
  check('手机当电视（电视局）：开始键在屏幕里、没被挡住，键盘说明不出', startSpot.short && startSpot.bottom <= startSpot.height && startSpot.hit === 'startBtn' && startSpot.note === 'none', JSON.stringify(startSpot));
  await screenshot(tvPhone.page, 'phone-as-tv-lobby');
  check('页面无脚本错误', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('大厅流程完成', false, error.stack ?? String(error));
  if (host) await screenshot(host, 'failure').catch(() => {});
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser.close();
}
console.log(`lobby-check: ${failures.length ? `FAIL (${failures.length})` : 'PASS'}; screenshots: ${out}`);
process.exitCode = failures.length ? 1 : 0;
