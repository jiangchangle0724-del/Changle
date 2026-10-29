// The brief's "联机稳定" acceptance row, run on every code change:
//   4 people play a whole game · a phone locked for 60 s comes back to its seat · two simultaneous bids don't break anything
import { expect, test } from "@playwright/test";
import { closeAll, createRoom, gate, joinWithTeam, newPhone, playUntil, watch, type Gate, type Phone } from "./phones";

test.describe.configure({ mode: "serial" });
test.afterEach(closeAll);

/** Phones at a table; pass `gates` to get a gate on each phone's connection (see `gate`), in order. */
async function table(browser: import("@playwright/test").Browser, contextOptions: object, code: string, names: string[], gates?: Gate[]) {
  const phones: Phone[] = [];
  for (const name of names) {
    const p = await newPhone(browser, name, contextOptions);
    if (gates) gates.push(await gate(p));
    await joinWithTeam(p, code);
    phones.push(p);
  }
  await expect(phones[0].page.locator(".teams li")).toHaveCount(names.length);
  return phones;
}

const errorsOf = (phones: Phone[]) => phones.flatMap((p) => p.errors);

test("4 人完整打完一局：15 分钟局（测试里时钟压缩到 1/10）", async ({ browser, request, contextOptions }) => {
  test.setTimeout(420_000);
  const code = await createRoom(request, { mode: 15, test: { speed: 0.1 } });
  const phones = await table(browser, contextOptions, code, ["甲", "乙", "丙", "丁"]);
  await phones[0].page.getByRole("button", { name: "开始", exact: true }).click();
  for (const p of phones) await expect(p.page.locator(".game")).toBeVisible();
  await playUntil(
    phones,
    async () => {
      for (const p of phones) if (!(await p.page.locator(".over").count())) return false;
      return true;
    },
    360_000,
  );
  for (const p of phones) {
    await expect(p.page.getByRole("heading", { name: "游戏结束" })).toBeVisible();
    // The finale reads out every team, the winners last, on a card of their own.
    await expect(p.page.locator(".results > li")).toHaveCount(4);
    await expect(p.page.locator(".results li.won")).toContainText("赢了");
    expect(p.taps, `${p.name} played`).toBeGreaterThan(5);
  }
  expect(errorsOf(phones)).toEqual([]);
});

test("手机锁屏 60 秒后回来，回到原来的座位", async ({ browser, request, contextOptions }) => {
  test.setTimeout(240_000);
  // A timed game: in the default race to the target line, the computer playing for the locked team
  // could win the game during the minute away.
  const code = await createRoom(request, { mode: 60, test: { speed: 0.5 } });
  const phones = await table(browser, contextOptions, code, ["小红", "小蓝", "小绿"]);
  await phones[0].page.getByRole("button", { name: "开始", exact: true }).click();
  const [a, locked, c] = phones;
  await expect(locked.page.locator(".game")).toBeVisible();
  const seat = (await locked.page.locator(".top .chip").textContent()) ?? "";
  // Lock the phone: the page (and its connection) goes away; storage stays, like a real phone.
  await locked.page.close();
  const start = Date.now();
  // The others see the computer step in for the locked team…
  const covering = a.page.locator(".p-play .standings .tag", { hasText: "电脑代打中" });
  await playUntil([a, c], async () => (await covering.count()) > 0, 30_000);
  // …and keep playing for the rest of the minute.
  await playUntil([a, c], async () => Date.now() - start >= 60_000, 90_000);
  // Unlock: open the same link again.
  locked.page = await locked.ctx.newPage();
  watch(locked, locked.page);
  await locked.page.goto(`/trip/r/${code}`);
  await expect(locked.page.locator(".game")).toBeVisible();
  await expect(locked.page.locator(".top .chip")).toHaveText(seat);
  await expect(locked.page.getByText("电脑在替你们玩")).toHaveCount(0);
  // …and plays on from that seat.
  const before = locked.taps;
  await playUntil(phones, async () => locked.taps > before, 120_000);
  expect(errorsOf(phones)).toEqual([]);
});

test("两人同时出价不出错", async ({ browser, request, contextOptions }) => {
  test.setTimeout(240_000);
  const code = await createRoom(request, {});
  const gates: Gate[] = [];
  const phones = await table(browser, contextOptions, code, ["东", "南", "西"], gates);
  await phones[0].page.getByRole("button", { name: "开始", exact: true }).click();
  // Everyone passes on buying, so the next unowned city goes to auction.
  await playUntil(phones, async () => (await phones[0].page.locator(".decide.auction").count()) > 0, 180_000, { declineBuys: true, bid: 0 });
  const [x, y] = phones;
  const bid = (p: Phone) => p.page.locator(".decide.auction .btn.primary").first();
  await expect(bid(x)).toBeEnabled();
  await expect(bid(y)).toBeEnabled();
  // Both press "出 $10" in the same millisecond, before either screen can show the other's bid.
  // What the server says to the two phones waits until both have pressed: on a slow browser one
  // phone can otherwise start a moment late, find the other's bid already up, and press "出 $20".
  gates[0].hold();
  gates[1].hold();
  const at = Date.now() + 400;
  const press = (p: Phone) =>
    p.page.evaluate(
      (at) =>
        new Promise<string>((done) => {
          const go = () => {
            const b = document.querySelector<HTMLButtonElement>(".decide.auction .btn.primary");
            done(b?.textContent ?? "");
            b?.click();
          };
          const wait = () => (Date.now() >= at ? go() : setTimeout(wait, 0));
          wait();
        }),
      at,
    );
  const pressed = await Promise.all([press(x), press(y)]);
  gates[0].release();
  gates[1].release();
  expect(pressed).toEqual(["出 $10", "出 $10"]);
  // Exactly one leads at $10, every phone agrees, and the other is told it was a moment too late.
  // (Wait for the leader's line: the no-bids line says "最低 $10" too.)
  const leads = phones.map((p) => p.page.locator(".decide.auction .big"));
  await expect(leads[0]).toContainText("出价最高：$10");
  // (The toast is only up for 3.5 s, so it's looked at first.)
  const loser = (await leads[0].innerText()).includes("你们出价最高") ? y : x;
  await expect(loser.page.locator(".toasts")).toContainText("慢了一步");
  for (const l of leads) await expect(l).toContainText("出价最高：$10");
  // The first-arrival scene never covers an auction.
  for (const p of phones) expect(await p.page.locator(".touchdown").count()).toBe(0);
  const texts = await Promise.all(leads.map((l) => l.innerText()));
  expect(texts.filter((s) => s.includes("你们出价最高"))).toHaveLength(1);
  // The auction closes after the countdown and the city goes to the leader.
  await expect(x.page.locator(".decide.auction")).toHaveCount(0, { timeout: 20_000 });
  await x.page.getByRole("button", { name: "记录" }).click();
  await expect(x.page.locator(".p-log .feed")).toContainText("以 $10 拍得");
  expect(errorsOf(phones)).toEqual([]);
});

test("窄屏手机、英文界面、长队名：顶栏和页面都不超出屏幕", async ({ browser, request, playwright, contextOptions }) => {
  const { defaultBrowserType: _ignored, ...se } = playwright.devices["iPhone SE"];
  const code = await createRoom(request, {});
  const en = await newPhone(browser, "Alexandra the Great", { ...contextOptions, ...se, locale: "en-US" });
  await en.page.goto(`/trip/r/${code}`);
  await expect(en.page.locator(".lobby")).toBeVisible({ timeout: 20_000 });
  await en.page.locator(".lobby .field input").fill(en.name);
  await en.page.locator(".lobby .field input").blur();
  await en.page.getByRole("button", { name: "New team" }).click();
  const zh = await newPhone(browser, "小明同学好朋友", { ...contextOptions, ...se, locale: "zh-CN" });
  await joinWithTeam(zh, code);
  // The first phone in is the host. Its lobby, with a computer team's style and Remove, fits too.
  await en.page.getByRole("button", { name: "Add a computer team" }).click();
  await expect(en.page.locator(".teams li")).toHaveCount(3);
  const lobbyOver = await en.page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return Math.max(...[...document.querySelectorAll(".lobby *")].map((el) => el.getBoundingClientRect().right)) - vw;
  });
  expect(lobbyOver, "lobby wider than the screen").toBeLessThanOrEqual(1);
  await en.page.getByRole("button", { name: "Start", exact: true }).click();
  for (const p of [en, zh]) {
    await expect(p.page.locator(".game")).toBeVisible();
    const [page, top] = await p.page.evaluate(() => {
      const d = document.documentElement;
      const bar = document.querySelector(".top")!;
      return [d.scrollWidth - d.clientWidth, bar.scrollWidth - bar.clientWidth];
    });
    expect(page, `${p.name}: page wider than the screen`).toBeLessThanOrEqual(1);
    expect(top, `${p.name}: top bar wider than the screen`).toBeLessThanOrEqual(1);
    await expect(p.page.locator(".menu-btn")).toBeInViewport({ ratio: 1 });
  }
  expect(errorsOf([en, zh])).toEqual([]);
});

test("许可证全文：licences.txt 里有打包进游戏的程序库、地图数据和字体的许可", async ({ request }) => {
  const res = await request.get("/trip/licences.txt");
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const text = await res.text();
  for (const name of ["Preact", "three.js", "qrcode-generator", "world-atlas", "ZCOOL QingKe HuangYou", "Big Shoulders Display", "Space Mono"])
    expect(text).toContain(`=== ${name}`);
  expect(text).toContain("Permission is hereby granted");
  expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
  expect(text).toContain("Weather data by Open-Meteo.com, licensed under CC BY 4.0");
});
