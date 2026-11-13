// Three phones decide where to eat: the host logs in and starts a table, two friends join by link
// without logging in, everyone fills a diet card, votes in both rounds, and one rates the meal.
// Everything is under /eat, as on changle.ca.
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
  await host.page.goto("/eat/");
  await expect(host.page.getByRole("link", { name: "用 Google 登录" })).toBeVisible();
  const login = await host.page.request.post("/eat/api/test/login", { data: { sub: "host-1", name: "小明" } });
  expect(login.ok()).toBeTruthy();
  await host.page.reload();
  await expect(host.page.getByText("你好，小明")).toBeVisible();
  await expect(host.page.locator(".demo")).toBeVisible();
  await host.page.locator("select").selectOption("Richmond Centre / Aberdeen");
  // What the meal is for: just a meal unless the host says otherwise.
  await expect(host.page.locator("[data-occasion=casual]")).toHaveAttribute("aria-pressed", "true");
  await host.page.locator("[data-occasion=friends]").click();
  await expect(host.page.locator("[data-occasion=friends]")).toHaveAttribute("aria-pressed", "true");
  await host.page.getByRole("button", { name: "开一桌" }).click();
  await expect(host.page).toHaveURL(/\/eat\/r\/\d{4}$/);
  const code = host.page.url().match(/(\d{4})$/)![1];

  // Host's diet card is saved to the account; friends fill theirs in the room.
  await dietCard(host.page);
  for (const p of [a, b]) await p.page.goto(`/eat/r/${code}`);
  await dietCard(a.page, "peanut");
  await dietCard(b.page, undefined, ["香菜", "蘑菇"]);
  await expect(host.page.locator(".people li")).toHaveCount(3);
  // The table's diet summary isn't shown live (a new line would give away whose card it is).
  await expect(host.page.locator(".tablelimits")).toHaveCount(0);
  await expect(a.page.getByText("等房主开始…")).toBeVisible();
  // Everyone sees what the table is for; only the host can change it.
  await expect(a.page.locator(".settings .whenrow span").first()).toHaveText("🍻 场景：朋友聚会");
  await expect(a.page.locator(".change-occasion")).toHaveCount(0);
  await expect(host.page.locator(".change-occasion")).toBeVisible();

  // Round 1 comes before any search: the whole menu, in three groups, all of them on screen.
  await host.page.getByRole("button", { name: "开始！" }).click();
  for (const p of [host, a, b]) await expect(p.page.locator(".menu").first()).toBeVisible();
  await expect(host.page.locator(".menu h3")).toHaveText(["中餐", "亚洲菜", "西餐和其他"]);
  await expect(host.page.locator(".mood")).toHaveCount(31);
  for (const c of ["sichuan", "cantonese", "hotpot", "thai", "vietnamese", "filipino", "mexican"]) await expect(host.page.locator(`[data-cuisine=${c}]`)).toBeVisible();
  await host.page.locator("[data-cuisine=ramen]").click(); // 👍
  await a.page.locator("[data-cuisine=ramen]").click();
  await b.page.locator("[data-cuisine=italian]").click();
  await b.page.locator("[data-cuisine=italian]").click(); // 🚫
  for (const p of [host, a, b]) await p.page.getByRole("button", { name: "好了" }).click();

  // Round 2: every place, ranked. The top six are full cards, then shorter ones that open.
  for (const p of [host, a, b]) await expect(p.page.locator(".place").first()).toBeVisible();
  await expect(host.page.locator(".place:not(.compact)")).toHaveCount(6);
  await expect(host.page.locator(".place .rank").first()).toHaveText("1");
  await expect(host.page.locator(".place .facts").first()).toContainText("🚗 约");
  // What two people liked comes first, however well rated the rest.
  await expect(host.page.locator(".place h3").first()).toHaveText("Demo · Ramen Hinoki");
  const total = Number((await host.page.getByText(/^共 \d+ 家，都在范围和预算以内$/).textContent())!.match(/\d+/)![0]);
  const more = host.page.getByRole("button", { name: /^再看 \d+ 家$/ });
  for (let i = 0; i < 5 && (await more.count()); i++) await more.click();
  await expect(host.page.locator(".place")).toHaveCount(total);
  // b said no to Italian: Nonna's is still there, further down, saying why.
  const nonna = host.page.locator(".place", { hasText: "Nonna's Pasta" });
  await expect(nonna).toHaveClass(/compact/);
  await expect(nonna.locator(".note")).toHaveText("有人第 1 轮不想吃这类，排在后面。");
  // a's severe peanut allergy: Thai is at the bottom with a warning, not gone.
  await expect(host.page.locator(".place", { hasText: "Bangkok Basil" }).locator(".note.severe")).toContainText("有人对花生严重过敏");
  await expect(host.page.locator(".place").last().locator(".note.severe")).toContainText("有人对花生严重过敏");
  // Friends: a hot pot place for groups, with beer, says it suits (even at the bottom, for the allergy).
  await expect(host.page.locator(".place", { hasText: "小肥羊火锅" }).locator(".reason", { hasText: "适合朋友聚" })).toBeVisible();
  // The short intro says what a place mainly serves when its name does.
  await expect(host.page.locator(".place", { hasText: "台北牛肉面" }).locator(".intro")).toContainText("主打牛肉面");
  // A shorter card opens for the rest: phone, map, ordering in.
  await nonna.getByRole("button", { name: /更多/ }).click();
  await expect(nonna.getByRole("link", { name: "📞 打电话" })).toBeVisible();
  // Ordering in: the fold opens the delivery apps, without our address as the referrer.
  const delivery = nonna.locator(".delivery");
  await delivery.getByText("🛵 点外卖").click();
  await expect(delivery.locator("[data-app=ubereats]")).toHaveAttribute("href", /^https:\/\/www\.ubereats\.com\/search\?q=.+/);
  await expect(delivery.locator("[data-app=doordash]")).toHaveAttribute("href", /^https:\/\/www\.doordash\.com\/en-CA\/search\/store\/.+/);
  await expect(delivery.locator("[data-app=fantuan]")).toHaveText("饭团");
  for (const app of ["ubereats", "doordash", "fantuan", "skip"]) await expect(delivery.locator(`[data-app=${app}]`)).toHaveAttribute("rel", "noopener noreferrer");
  const ramen = host.page.locator(".place", { hasText: "Ramen Hinoki" });
  await expect(ramen).toBeVisible();
  await expect(ramen.locator(".reason", { hasText: "2 人想吃这类" })).toBeVisible();
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
  await expect(host.page.locator(".tablelimits")).toHaveText("本桌 有人对花生严重过敏 · 有人不吃香菜 · 有人不吃蘑菇");

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
  await host.page.goto("/eat/");
  await expect(host.page.getByText("上次的「Demo · Ramen Hinoki」好吃吗？")).toBeVisible();
  // Read through the page, as the phone would.
  const me = (await host.page.evaluate(() => fetch("/eat/api/me").then((r) => r.json()))) as { card: unknown };
  expect(me.card).toEqual({ allergies: {}, custom: [], halal: false, vegetarian: false, budget: 0 });

  for (const p of [host, a, b]) expect(p.errors).toEqual([]);
});

test("someone who joins after the start fills in a diet card first, then joins the round", async ({ browser }) => {
  const host = await phone(browser, "host2");
  const late = await phone(browser, "late");
  expect((await host.page.request.post("/eat/api/test/login", { data: { sub: `late-host-${Date.now()}`, name: "阿明" } })).ok()).toBeTruthy();
  await host.page.goto("/eat/");
  await host.page.getByRole("button", { name: "开一桌" }).click();
  await expect(host.page).toHaveURL(/\/eat\/r\/\d{4}$/);
  const code = host.page.url().match(/(\d{4})$/)![1];
  await dietCard(host.page);
  // A signed-in host goes by their Google name instead of "朋友 1".
  await expect(host.page.locator(".people li.mine")).toContainText("阿明");
  await host.page.getByRole("button", { name: "开始！" }).click();
  await expect(host.page.locator(".menu").first()).toBeVisible();

  await late.page.goto(`/eat/r/${code}`);
  await expect(late.page.getByText("这一桌已经开始了，先填一下饮食卡，再一起选")).toBeVisible();
  await late.page.locator(".diet .btn.primary").click();
  await expect(late.page.locator(".menu").first()).toBeVisible();
  for (const p of [host, late]) expect(p.errors).toEqual([]);
});

test("guests can't start a table when login is on; picking alone is gone, its address goes home", async ({ request }) => {
  const res = await request.post("/eat/api/rooms", { data: { cid: "abcdef0123456789", center: { lat: 49.28, lng: -123.12 }, range: "walk10" } });
  expect(res.status()).toBe(401);
  const solo = await request.get("/eat/solo", { maxRedirects: 0 });
  expect(solo.status()).toBe(302);
  expect(solo.headers().location).toMatch(/\/eat\/$/);
});

test("rating with nothing picked says so", async ({ browser }) => {
  const me = await phone(browser, "nopick");
  expect((await me.page.request.post("/eat/api/test/login", { data: { sub: `nopick-${Date.now()}`, name: "阿杰" } })).ok()).toBeTruthy();
  await me.page.goto("/eat/rate");
  await expect(me.page.getByText("最近没有要评的餐厅")).toBeVisible();
  await expect(me.page.getByRole("button", { name: "提交" })).toHaveCount(0);
  expect(me.errors).toEqual([]);
});

test("the privacy and terms pages are public and linked from the home page", async ({ page, request }) => {
  // Google needs both pages to publish the sign-in screen; they work without JavaScript.
  for (const [path, zh, en] of [
    ["/eat/privacy", "隐私政策", "Privacy"],
    ["/eat/terms", "使用条款", "Terms"],
  ] as const) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<h1>${zh}</h1>`);
    expect(html).toContain(`<h1>${en}</h1>`);
  }
  await page.goto("/eat/");
  await page.getByRole("link", { name: "隐私政策" }).click();
  await expect(page).toHaveURL(/\/eat\/privacy$/);
  await expect(page.getByRole("heading", { name: "隐私政策" })).toBeVisible();
  await page.getByRole("link", { name: "使用条款 · Terms" }).click();
  await expect(page).toHaveURL(/\/eat\/terms$/);
  await page.getByRole("link", { name: /随便 · Whatever's Fine/ }).click();
  await expect(page).toHaveURL(/\/eat\/$/);
});

test("planning ahead, and what it's for: chosen on the home page, changed in the lobby, used by the list", async ({ browser }) => {
  const me = await phone(browser, "plan");
  const page = me.page;
  expect((await page.request.post("/eat/api/test/login", { data: { sub: `plan-${Date.now()}`, name: "小周" } })).ok()).toBeTruthy();
  await page.goto("/eat/");
  // Picking alone is now "一个人" here, not a page of its own.
  await expect(page.getByText("一个人，不知道吃什么？")).toHaveCount(0);
  await page.locator("[data-occasion=colleagues]").click();
  await page.getByRole("button", { name: "明天午饭" }).click();
  await page.locator("select").selectOption("Richmond Centre / Aberdeen");
  await page.getByRole("button", { name: "开一桌" }).click();
  await expect(page).toHaveURL(/\/eat\/r\/\d{4}$/);
  await page.locator(".diet .btn.primary").click();
  const rows = page.locator(".settings .whenrow span");
  await expect(rows).toHaveText(["💼 场景：同事聚餐", "🕒 什么时候吃：明天 12:00"]);
  await page.getByRole("button", { name: "改场景" }).click();
  await page.locator("[data-occasion=date]").click();
  await page.getByRole("button", { name: "好了" }).click();
  await page.getByRole("button", { name: "改时间" }).click();
  await page.getByRole("button", { name: "明天晚饭" }).click();
  await page.getByRole("button", { name: "好了" }).click();
  await expect(rows).toHaveText(["💕 场景：约会", "🕒 什么时候吃：明天 18:30"]);

  // One person: round 1 done, the list for tomorrow's dinner.
  await page.getByRole("button", { name: "开始！" }).click();
  await page.getByRole("button", { name: "好了" }).click();
  await expect(page.locator(".planned")).toHaveText("🕒 明天 18:30，按那时的营业时间排");
  // Each full card says until when it's open then (demo hours: most close at 22:00).
  await expect(page.locator(".place").first()).toContainText("那时营业到");
  // A date: places booked ahead with wine and cocktails say they suit it.
  await expect(page.locator(".reason", { hasText: "适合约会" }).first()).toBeVisible();
  await page.locator(".place").first().locator(".approve").click();
  await page.getByRole("button", { name: "好了" }).click();
  await expect(page.getByRole("heading", { name: /^明天 18:30，就吃这家！$/ })).toBeVisible();
  expect(me.errors).toEqual([]);
});

test("a business dinner: a budget too low for it is pointed out; places plainly not for it go last saying why (Steve, 2026-11-11)", async ({ browser }) => {
  const me = await phone(browser, "biz");
  const page = me.page;
  expect((await page.request.post("/eat/api/test/login", { data: { sub: `biz-${Date.now()}`, name: "小李" } })).ok()).toBeTruthy();
  await page.goto("/eat/");
  await page.locator("[data-occasion=business]").click();
  await page.getByRole("button", { name: "明天晚饭" }).click();
  await page.locator("select").selectOption("Richmond Centre / Aberdeen");
  await page.getByRole("button", { name: "开一桌" }).click();
  await expect(page).toHaveURL(/\/eat\/r\/\d{4}$/);
  // A $35 budget on my own diet card: most places for a business dinner cost more.
  await page.locator(".diet").getByRole("button", { name: "$35" }).click();
  await page.locator(".diet .btn.primary").click();
  const hint = page.locator(".budget-low");
  await expect(hint).toContainText("你的饮食卡预算是人均 $35 以内。商务宴请合适的店大多更贵，会被去掉。");
  await hint.getByRole("button", { name: "改预算" }).click();
  await page.locator(".diet").getByRole("button", { name: "不限" }).click();
  await page.locator(".diet .btn.primary").click();
  await expect(hint).toHaveCount(0);

  await page.getByRole("button", { name: "开始！" }).click();
  await page.getByRole("button", { name: "好了" }).click();
  await expect(page.locator(".place").first()).toBeVisible();
  // The top says why it suits; the dessert café, the brunch place and the burger place are last, saying why.
  await expect(page.locator(".place").first().locator(".reason", { hasText: "适合商务宴请" })).toBeVisible();
  const more = page.getByRole("button", { name: /^再看 \d+ 家$/ });
  for (let i = 0; i < 5 && (await more.count()); i++) await more.click();
  const last3 = await page.locator(".place h3").evaluateAll((hs) => hs.slice(-3).map((h) => h.textContent));
  expect(last3.sort()).toEqual(["Demo · Burger Lab", "Demo · Moonlight Dessert Café", "Demo · Sunrise Brunch Co."]);
  await expect(page.locator(".place", { hasText: "Moonlight Dessert Café" }).locator(".note")).toHaveText("不太适合商务宴请：这是甜品面包店，排在后面。");
  expect(me.errors).toEqual([]);
});
