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

  // Round 1.
  await host.page.getByRole("button", { name: "开始！" }).click();
  for (const p of [host, a, b]) await expect(p.page.locator(".moods")).toBeVisible();
  // Severe peanut: the cuisines that use it a lot come after the others in round 1 (twelve fit), so no
  // Thai chip here; round 2 still lists the Thai place, at the bottom.
  await expect(host.page.locator(".mood")).toHaveCount(12);
  await expect(host.page.locator("[data-cuisine=thai]")).toHaveCount(0);
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
  // b said no to Italian: Nonna's is still there, further down, saying why.
  const nonna = host.page.locator(".place", { hasText: "Nonna's Pasta" });
  await expect(nonna).toHaveClass(/compact/);
  await expect(nonna.locator(".note")).toHaveText("有人第 1 轮不想吃这类，排在后面。");
  // a's severe peanut allergy: Thai is at the bottom with a warning, not gone.
  await host.page.getByRole("button", { name: /^再看 \d+ 家$/ }).click();
  await expect(host.page.locator(".place", { hasText: "Bangkok Basil" }).locator(".note.severe")).toContainText("有人对花生严重过敏");
  // A shorter card opens for the rest: phone, map, ordering in.
  await nonna.getByRole("button", { name: /更多/ }).click();
  await expect(nonna.getByRole("link", { name: "📞 打电话" })).toBeVisible();
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
  await expect(host.page.locator(".moods")).toBeVisible();

  await late.page.goto(`/eat/r/${code}`);
  await expect(late.page.getByText("这一桌已经开始了，先填一下饮食卡，再一起选")).toBeVisible();
  await late.page.locator(".diet .btn.primary").click();
  await expect(late.page.locator(".moods")).toBeVisible();
  for (const p of [host, late]) expect(p.errors).toEqual([]);
});

test("guests can't start a table, or pick alone, when login is on", async ({ request }) => {
  const res = await request.post("/eat/api/rooms", { data: { cid: "abcdef0123456789", center: { lat: 49.28, lng: -123.12 }, range: "walk10" } });
  expect(res.status()).toBe(401);
  const solo = await request.post("/eat/api/solo", { data: { center: { lat: 49.28, lng: -123.12 }, range: "any", answers: { mood: "warm", side: "chinese" } } });
  expect(solo.status()).toBe(401);
});

test("one person picks alone: five questions, every place ranked with reasons, choose one", async ({ browser }) => {
  const me = await phone(browser, "solo");
  const page = me.page;
  await page.goto("/eat/");
  await expect(page.getByText("一个人，不知道吃什么？")).toBeVisible();
  // A new account each run (a local server keeps accounts between runs).
  expect((await page.request.post("/eat/api/test/login", { data: { sub: `solo-${Date.now()}`, name: "小雨" } })).ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "帮我挑" }).click();
  await expect(page).toHaveURL(/\/eat\/solo$/);

  await expect(page.getByRole("heading", { name: "现在想吃点什么感觉的？" })).toBeVisible();
  await page.getByRole("button", { name: /热乎乎的/ }).click();
  await expect(page.getByRole("heading", { name: "想吃哪边的？" })).toBeVisible();
  await page.getByRole("button", { name: /^中餐/ }).click();
  await page.getByRole("button", { name: "$35 以内" }).click();

  // Where and how far: the tabs switch the minutes; "any" covers Greater Vancouver.
  await expect(page.getByRole("heading", { name: "在哪儿，多远？" })).toBeVisible();
  await page.locator("select").selectOption("Richmond Centre / Aberdeen");
  await page.getByRole("button", { name: "🌏 不限" }).click();
  await expect(page.getByText("整个大温都算")).toBeVisible();
  await page.getByRole("button", { name: "🚗 开车" }).click();
  await page.getByRole("button", { name: "开车 25 分钟" }).click();
  await expect(page.getByRole("button", { name: "开车 25 分钟" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步" }).click();

  await expect(page.getByRole("heading", { name: "有什么不吃的吗？" })).toBeVisible();
  await page.locator(".diet .btn.primary").click();

  await expect(page.getByRole("heading", { name: "按你的口味排好了" })).toBeVisible();
  const cards = page.locator(".place");
  // Three full cards, then ten shorter ones; the rest behind "show more". Over the $35 budget, two are left out.
  await expect(page.locator(".place:not(.compact)")).toHaveCount(3);
  await expect(cards).toHaveCount(13);
  await expect(page.getByText("共 16 家，都在范围和预算以内")).toBeVisible();
  await expect(page.locator(".reason").first()).toBeVisible();
  // Chinese first (the side asked for), every card with its rank, distance, walk and drive.
  await expect(cards.first().locator(".intro")).toContainText("粤菜 · 点心");
  await expect(cards.first().locator(".facts")).toContainText("📍");
  await expect(cards.first().locator(".facts")).toContainText("🚶");
  // The made-up pick and description show in demo mode, so every part of a card is exercised.
  await expect(page.getByText("示例推荐：虾饺皮薄，周末早点去")).toBeVisible();
  await expect(page.getByText("示例：推车点心，周末一早就满座")).toBeVisible();
  await page.getByRole("button", { name: "再看 3 家" }).click();
  await expect(cards).toHaveCount(16);
  // The short intro says what a place mainly serves when its name does.
  await expect(page.locator(".place", { hasText: "台北牛肉面" }).locator(".intro")).toContainText("主打牛肉面");
  await expect(page.getByText("附近就这些了")).toBeVisible();
  const shownIds = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!));

  const chosen = (await cards.first().locator("h3").textContent())!;
  await cards.first().getByRole("button", { name: "就它了" }).click();
  await expect(page.getByRole("heading", { name: "就吃这家！" })).toBeVisible();
  await expect(page.getByRole("button", { name: "发给朋友" })).toBeVisible();
  // Or order it in: the fold on the card opens the delivery apps, without our address as the referrer.
  const delivery = page.locator(".delivery");
  await delivery.getByText("🛵 点外卖").click();
  await expect(delivery.locator("[data-app=ubereats]")).toHaveAttribute("href", /^https:\/\/www\.ubereats\.com\/search\?q=.+/);
  await expect(delivery.locator("[data-app=doordash]")).toHaveAttribute("href", /^https:\/\/www\.doordash\.com\/en-CA\/search\/store\/.+/);
  await expect(delivery.locator("[data-app=fantuan]")).toHaveText("饭团");
  for (const app of ["ubereats", "doordash", "fantuan", "skip"]) await expect(delivery.locator(`[data-app=${app}]`)).toHaveAttribute("rel", "noopener noreferrer");
  // The pick is saved in the background: wait until the account has it. The diet card is saved for
  // next time, but not this search's budget.
  const account = () => page.evaluate(() => fetch("/eat/api/me").then((r) => r.json() as Promise<{ card: { budget: number }; last: { place: string } | null }>));
  await expect.poll(async () => (await account()).last?.place ?? null).not.toBeNull();
  const saved = (await account()) as { card: { budget: number }; last: { place: string } };
  expect(saved.card.budget).toBe(0);

  // Only your own last pick can be rated: any other place is refused.
  const rate = (id: string) =>
    page.evaluate((id) => fetch(`/eat/api/places/${id}/rate`, { method: "POST", body: JSON.stringify({ overall: "up", liked: true, wait: 0 }) }).then((r) => r.status), id);
  const other = saved.last.place === "demo-1" ? "demo-2" : "demo-1";
  expect(await rate(other)).toBe(403);

  // Back home, it asks how the pick was; three taps rate it, once.
  await page.goto("/eat/");
  await page.getByText(`上次的「${chosen}」好吃吗？`).click();
  await expect(page).toHaveURL(/\/eat\/rate$/);
  await expect(page.getByText(`「${chosen}」怎么样？`)).toBeVisible();
  await page.getByRole("button", { name: "👍" }).click();
  await page.getByRole("button", { name: "是" }).click();
  await page.getByRole("button", { name: "15 分钟" }).click();
  await page.getByRole("button", { name: "提交" }).click();
  await expect(page.getByText("谢谢！")).toBeVisible();
  expect(await rate(saved.last.place)).toBe(403);
  // Choosing another place from the same search doesn't open a second rating.
  const another = shownIds.find((id) => id !== saved.last.place)!;
  const chose = await page.evaluate((id) => fetch("/eat/api/me/last", { method: "POST", body: JSON.stringify({ place: id, name: "x" }) }).then((r) => r.status), another);
  expect(chose).toBe(200);
  expect(await rate(another)).toBe(403);
  // A place the search never showed can't become the pick.
  const stranger = await page.evaluate(() => fetch("/eat/api/me/last", { method: "POST", body: JSON.stringify({ place: "demo-999", name: "x" }) }).then((r) => r.status));
  expect(stranger).toBe(403);
  await page.goto("/eat/");
  await expect(page.getByText("一个人，不知道吃什么？")).toBeVisible();
  await expect(page.getByText(`上次的「${chosen}」好吃吗？`)).toHaveCount(0);
  expect(me.errors).toEqual([]);
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
