#!/usr/bin/env node
/**
 * 联机检查：一台主机页加两个手柄页在同一个 Chromium 里，对着本地的房间服务跑一遍。
 *   npm run dev（或 wrangler dev --port 8787）先起着，然后：
 *   BASE=http://127.0.0.1:8787 npm run link-check
 * 查：两个手柄都直连上、延迟表有数、输入到主机、角色动了；掐断一个手柄的连接 5 秒内回来、
 * 断的时候角色手不松；全部绕路（?relay=1）输入也能到。需要 playwright（PLAYWRIGHT 可指定路径）。
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const pw = await import(process.env.PLAYWRIGHT ?? 'playwright');
const { chromium } = pw.default ?? pw;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, every = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return Date.now() - t0;
    await sleep(every);
  }
  return -1;
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
async function session(relay) {
  const label = relay ? '绕路' : '直连';
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await hostCtx.newPage();
  const errors = [];
  host.on('pageerror', (e) => errors.push('host: ' + e.message));
  // render=0：只跑物理不画画面，CI 的机器没有显卡，Pixi 软件渲染会把主机页拖慢几百毫秒
  await host.goto(`${BASE}/hang-on/?render=0${relay ? '&relay=1' : ''}`);
  await host.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('code')?.textContent ?? ''), null, { timeout: 15000 });
  const code = await host.evaluate(() => document.getElementById('code').textContent);
  console.log(`\n== ${label}：房间 ${code}`);

  const pads = [];
  for (const name of ['阿一', '阿二']) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 380 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ` + e.message));
    await page.goto(`${BASE}/hang-on/pad/?code=${code}&auto=1&name=${encodeURIComponent(name)}`);
    pads.push({ name, ctx, page });
  }
  const peers = () => host.evaluate(() => hangOn.peers().map((p) => ({ name: p.name, connected: p.connected, direct: p.direct, relayed: p.relayed, rtt: p.rtt.median(), lastInputAt: p.lastInputAt })));

  // 两个手柄都进来，且（直连模式）通道开了 / （绕路模式）标成绕路
  const t1 = await until(async () => {
    const ps = await peers();
    return ps.length === 2 && ps.every((p) => p.connected && (relay ? p.relayed : p.direct));
  }, 12000);
  check(`${label}：两个手柄都接上`, t1 >= 0, t1 >= 0 ? `${t1} ms` : JSON.stringify(await peers()));

  // 延迟表有数
  const t2 = await until(async () => (await peers()).every((p) => p.rtt !== null), 5000);
  const ps2 = await peers();
  check(`${label}：延迟表有数`, t2 >= 0, ps2.map((p) => `${p.name} ${p.rtt?.toFixed(1)} ms`).join(', '));

  // 开始：倒数 3 秒进 playing
  await host.click('#startBtn');
  const t3 = await until(() => host.evaluate(() => hangOn.phase === 'playing'), 8000);
  check(`${label}：开始后进 playing`, t3 >= 0, `${t3} ms`);

  // 手柄 1 推右下 + 双手抓：主机上 P1 抓住了地面并动了
  const x0 = await host.evaluate(() => hangOn.sim.players[0].body.x);
  await pads[0].page.evaluate(() => hangOnPad.set({ ax: 1, ay: 0.4, gl: true, gr: true }));
  const t4 = await until(() => host.evaluate(() => hangOn.sim.players[0].arms.some((a) => a.grip)), 3000);
  check(`${label}：手柄的输入到了主机，P1 抓住了`, t4 >= 0, `${t4} ms`);
  await pads[0].page.evaluate(() => hangOnPad.set({ ax: 1, ay: 0.2, gl: false, gr: false }));
  await sleep(600);
  await pads[0].page.evaluate(() => hangOnPad.set({ gl: true, gr: true }));
  await sleep(800);
  const x1 = await host.evaluate(() => hangOn.sim.players[0].body.x);
  check(`${label}：P1 往前拽动了`, x1 > x0 + 10, `${(x1 - x0).toFixed(0)} px`);

  // 手柄 2 也在发：seq 在涨
  const seqA = await host.evaluate(() => hangOn.peers()[1].input?.seq ?? 0);
  await sleep(300);
  const seqB = await host.evaluate(() => hangOn.peers()[1].input?.seq ?? 0);
  check(`${label}：手柄 2 的输入在流`, seqB > seqA, `seq ${seqA} → ${seqB}`);

  // 手柄给自己的小包：颜色、手、延迟
  const st = await pads[0].page.evaluate(() => ({ path: document.getElementById('path').textContent, rtt: document.getElementById('rtt').textContent, handL: document.getElementById('handL').classList.contains('on') }));
  check(`${label}：手柄收到主机的小包`, st.rtt !== '—' && st.handL, JSON.stringify(st));

  if (!relay) {
    // 掐断手柄 1 的连接（房间 WebSocket 和直连），看多久回来；断着的时候 P1 手不松
    await pads[0].page.evaluate(() => hangOnPad.set({ ax: 0.5, ay: -0.5, gl: true, gr: true }));
    await sleep(300);
    const dropAt = Date.now();
    await pads[0].page.evaluate(() => hangOnPad.link.simulateDrop());
    await sleep(700);
    const during = await host.evaluate(() => ({ grip: hangOn.sim.players[0].arms.some((a) => a.grip), dead: hangOn.sim.players[0].dead }));
    check('掐线时 P1 还抓着、没死', during.grip && !during.dead, JSON.stringify(during));
    const back = await until(async () => {
      const p = (await peers())[0];
      return p.connected && p.direct && p.lastInputAt > 0 && Date.now() - dropAt > 0 && (await host.evaluate(() => performance.now() - hangOn.peers()[0].lastInputAt < 200));
    }, 8000);
    check('掐线后 5 秒内直连回来、输入恢复', back >= 0 && back + 700 <= 5000, `${back >= 0 ? back + 700 : '没回来'} ms`);

    // 断网 2 秒（浏览器级离线）再回来
    await pads[1].ctx.setOffline(true);
    await sleep(2000);
    const onAt = Date.now();
    await pads[1].ctx.setOffline(false);
    const back2 = await until(async () => {
      const p = (await peers())[1];
      return p.connected && (await host.evaluate(() => performance.now() - hangOn.peers()[1].lastInputAt < 200));
    }, 8000);
    check('断网 2 秒再开，5 秒内输入恢复', back2 >= 0 && back2 <= 5000, `${back2 >= 0 ? back2 : '没回来'} ms，直连 ${JSON.stringify((await peers())[1].direct)}`);
  }

  check(`${label}：页面没报错`, errors.length === 0, errors.join(' | '));
  for (const p of pads) await p.ctx.close();
  await hostCtx.close();
}

await session(false);
await session(true);
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} 项没过` : '\n联机检查全过');
process.exit(failed.length ? 1 : 0);
