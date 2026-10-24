// Three phones decide where to eat: the host logs in and starts a table, two friends join by link
// without logging in, everyone fills a diet card, votes in both rounds, and one rates the meal.
import { expect, test, type Browser, type Page } from "@playwright/test";

async function phone(browser: Browser, name: string) {
  const ctx = await browser.newContext({ ...test.info().project.use, baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  return { name, ctx, page, errors };
}

async function dietCard(page: Page, allergen?: string, typed: string[] = []) {
  await expect(page.locator(".diet")).toBeVisible();
  if (allergen) {
    // Twice: "don't eat" → "severe allergy".
    await page.locator(`[data-allergen=${allergen}]`).click();
    await page.locator(`[data-allergen=${allergen}]`).click();
  }
  for (const item of typed) {
    // A suggestion chip if there is one, otherwise type it in.
    const chip = page.locator(".chip.suggest", { hasText: item });
    if (await chip.count()) await chip.click();
    else {
      await page.getByPlaceholder("比如：香菜、猪肉").fill(item);
      await page.getByRole("button", { name: "加上" }).click();
    }
    await expect(page.locator(`[data-custom="${item}"]`)).toBeVisible();
  }
  await page.locator(".diet .btn.primary").click();
  await expect(page.locator(".people")).toBeVisible();
}

test("three phones pick a restaurant", async ({ browser }) => {
  const host = await phone(browser, "host");
  const a = await phone(browser, "a");
  const b = await phone(browser, "b");

  // Starting a table needs Google login; joining doesn't.
  await host.page.goto("/");
  await expect(host.page.getByRole("link", { name: "用 Google 登录" })).toBeVisible();
  const login = await host.page.request.post("/api/test/login", { data: { sub: "host-1", name: "小明" } });
  expect(login.ok()).toBeTruthy();
  await host.page.reload();
  await expect(host.page.getByText("你好，小明")).toBeVisible();
  await expect(host.page.locator(".demo")).toBeVisible();
  await host.page.locator("select").selectOption("Richmond Centre / Aberdeen");
  await host.page.getByRole("button", { name: "开一桌" }).click();
  await expect(host.page).toHaveURL(/\/r\/\d{4}$/);
  const code = host.page.url().match(/(\d{4})$/)![1];

  // Host's diet card is saved to the account; friends fill theirs in the room.
  await dietCard(host.page);
  for (const p of [a, b]) await p.page.goto(`/r/${code}`);
  await dietCard(a.page, "peanut");
  await dietCard(b.page, undefined, ["香菜", "蘑菇"]);
  await expect(host.page.locator(".people li")).toHaveCount(3);
  await expect(host.page.locator(".tablelimits")).toHaveText("本桌 有人对花生严重过敏 · 有人不吃香菜 · 有人不吃蘑菇");
  await expect(a.page.getByText("等房主开始…")).toBeVisible();

  // Round 1.
  await host.page.getByRole("button", { name: "开始！" }).click();
  for (const p of [host, a, b]) await expect(p.page.locator(".moods")).toBeVisible();
  // Severe peanut: no Thai chip for anyone.
  await expect(host.page.locator("[data-cuisine=thai]")).toHaveCount(0);
  await host.page.locator("[data-cuisine=ramen]").click(); // 👍
  await a.page.locator("[data-cuisine=ramen]").click();
  await b.page.locator("[data-cuisine=italian]").click();
  await b.page.locator("[data-cuisine=italian]").click(); // 🚫
  for (const p of [host, a, b]) await p.page.getByRole("button", { name: "好了" }).click();

  // Round 2.
  for (const p of [host, a, b]) await expect(p.page.locator(".place").first()).toBeVisible();
  await expect(host.page.getByText("Nonna's Pasta")).toHaveCount(0);
  const ramen = host.page.locator(".place", { hasText: "Ramen Hinoki" });
  await expect(ramen).toBeVisible();
  for (const p of [host, a, b]) await p.page.locator(".place", { hasText: "Ramen Hinoki" }).locator(".approve").click();
  // b vetoes another card; the veto button on the others then says it's used.
  await b.page.locator(".place").filter({ hasNotText: "Ramen Hinoki" }).first().locator(".veto").click();
  await expect(b.page.locator(".place").filter({ hasNotText: "Ramen Hinoki" }).nth(1).locator(".veto")).toBeDisabled();
  for (const p of [host, a, b]) await p.page.getByRole("button", { name: "好了" }).click();

  // Result.
  for (const p of [host, a, b]) {
    await expect(p.page.getByText("今天就吃这家！")).toBeVisible();
    await expect(p.page.locator(".place h3")).toHaveText("Demo · Ramen Hinoki");
  }
  await expect(a.page.getByText("点菜时记得把过敏和忌口告诉店员。")).toBeVisible();

  // a rates it; the table score shows up for the host.
  await a.page.getByRole("link", { name: "吃完回来评分 ⭐" }).click();
  await expect(a.page.getByText("「Demo · Ramen Hinoki」怎么样？")).toBeVisible();
  await a.page.getByRole("button", { name: "👍" }).click();
  await a.page.getByRole("button", { name: "是" }).click();
  await a.page.getByRole("button", { name: "15 分钟" }).click();
  await a.page.getByRole("button", { name: "提交" }).click();
  await expect(a.page.getByText("谢谢！")).toBeVisible();
  await expect(host.page.getByText("本桌满意度：1/1 人吃到了喜欢的")).toBeVisible();

  // Next visit, the host is asked how it was, and the diet card was remembered.
  await host.page.goto("/");
  await expect(host.page.getByText("上次的「Demo · Ramen Hinoki」好吃吗？")).toBeVisible();
  // Read through the page, as the phone would.
  const me = (await host.page.evaluate(() => fetch("/api/me").then((r) => r.json()))) as { card: unknown };
  expect(me.card).toEqual({ allergies: {}, custom: [], halal: false, vegetarian: false, budget: 0 });

  for (const p of [host, a, b]) expect(p.errors).toEqual([]);
});

test("guests can't start a table when login is on", async ({ request }) => {
  const res = await request.post("/api/rooms", { data: { cid: "abcdef0123456789", center: { lat: 49.28, lng: -123.12 }, range: "walk10" } });
  expect(res.status()).toBe(401);
});
