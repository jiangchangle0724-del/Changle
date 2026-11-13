// The merchant's pages on a phone, against the real Worker with a stand-in for the rooms server
// (tests/rooms): who gets in, a merchant's home, a group buy's orders with the merchant's marks
// (confirmed, paid, handed over, weighed, cancelled), the two sheets adding up to a hand count,
// closing and opening a group buy, and the owner's panel that sets a shop up and starts a group
// buy by hand. A phone that is signed in has the session the site would have left in its storage.
import { expect, test } from "@playwright/test";
import { SESSION } from "../accounts.ts";
import { catchCopies, copied, fits, offerOf, order, phone, start, word } from "./help.ts";

/** Three friends' orders, as in the plan's bar for this stage: counted goods, something by weight, pickup at two points and one delivery. */
async function threeOrders(request: Parameters<typeof start>[0], id: string) {
  const offer = await offerOf(request, id);
  const wang = await order(request, id, { name: "王阿姨", phone: "604-555-0134" }, [["五常大米", 2000], ["土鸡蛋", 1000]]);
  const leo = await order(request, id, { name: "Leo", phone: "778 555 0199" }, [["五常大米", 1000], ["东北珍珠米", 1000], ["黄小米", 2000]], { how: "delivery", pickupId: undefined, ruleId: offer.rules.find((rule) => rule.label === "列治文")!.id, address: "8888 No. 3 Rd, Richmond", note: "到了打电话" });
  const chen = await order(request, id, { name: "陈太", phone: "+1 (236) 555-0111" }, [["土鸡蛋", 2000], ["手切羊肉片", 1500]], { pickupId: offer.points[1].id });
  return { offer, wang, leo, chen };
}

test("who gets in: signed out, a sign-in that's no good, an account with no shop, and a merchant", async ({ browser, request }) => {
  const { id } = await start(request);
  await order(request, id, { name: "王阿姨", phone: "604-555-0134" }, [["五常大米", 1000]]);
  await order(request, id, { name: "Leo", phone: "778 555 0199" }, [["土鸡蛋", 2000]]);

  // nobody signed in on this phone: sent to the site to sign in
  const page = await phone(browser);
  const first = await page.goto("/tuan/my");
  expect(first?.status()).toBe(200);
  await expect(page).toHaveTitle("我的团 · 跟一单");
  await expect(page.locator(".panel-title")).toHaveText("商家请先登录");
  await expect(page.getByRole("link", { name: "去 changle.ca 登录" })).toHaveAttribute("href", "/login");
  await expect(page.locator(".mine")).toHaveCount(0);
  // the group buy's own orders page says the same, and nothing of the group buy
  await page.goto(`/tuan/my/t/${id}`);
  await expect(page.locator(".panel-title")).toHaveText("商家请先登录");
  await expect(page.getByText("本周大米团")).toHaveCount(0);

  // back from signing in at the site: the page looks again by itself
  await page.goto("/tuan/my");
  await page.evaluate((token) => {
    localStorage.setItem("changle.session", token);
    document.dispatchEvent(new Event("visibilitychange"));
  }, SESSION.leader);
  await expect(page.getByText("已登录：团长（leader@example.com）")).toBeVisible();
  const mine = page.locator(`a[href="/tuan/my/t/${id}"]`);
  await expect(mine).toContainText("本周大米团 · 周五到货");
  await expect(mine).toContainText("接单中");
  await expect(mine).toContainText("2 单 · $65.00 · 2 单待确认");
  await expect(page.locator("form.stack"), "the owner's panel is the owner's").toHaveCount(0);
  await mine.click();
  await expect(page.locator(".hero h1")).toHaveText("本周大米团 · 周五到货");
  await expect(page.locator(".order")).toHaveCount(2);

  // a sign-in the site no longer knows
  const stale = await phone(browser, { session: SESSION.nobody });
  await stale.goto("/tuan/my");
  await expect(stale.locator(".problem")).toHaveText("登录过期了，请重新登录。");
  await expect(stale.getByRole("link", { name: "去 changle.ca 登录" })).toBeVisible();

  // an account that runs nothing
  const visitor = await phone(browser, { session: SESSION.visitor });
  await visitor.goto("/tuan/my");
  await expect(visitor.getByText("这个账号（visitor@example.com）还没有店铺。想开团请联系站长。")).toBeVisible();
  await visitor.goto(`/tuan/my/t/${id}`);
  await expect(visitor.getByText("这个账号不管这个团。")).toBeVisible();
  await expect(visitor.locator(".order")).toHaveCount(0);
  await visitor.getByRole("link", { name: "我的团" }).click();
  await expect(visitor).toHaveURL(/\/tuan\/my$/);
  await visitor.goto("/tuan/my/t/zzzz9999");
  await expect(visitor.getByText("没有这个团。")).toBeVisible();

  // the account service can't answer: said so, with a way to try again
  const down = await phone(browser, { session: SESSION.down });
  await down.goto("/tuan/my");
  await expect(down.getByText("账号服务暂时连不上，稍后再试。")).toBeVisible();
  await expect(down.getByRole("button", { name: "再试一次" })).toBeVisible();
});

test("a group buy's orders: confirm, paid, weigh, cancel, and the sheets match a hand count", async ({ browser, request }) => {
  const { id } = await start(request);
  const { offer, leo } = await threeOrders(request, id);
  const page = await phone(browser, { session: SESSION.leader });
  await catchCopies(page);
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`/tuan/my/t/${id}`);
  await expect(page).toHaveTitle("本周大米团 · 周五到货 · 我的团 · 跟一单");
  const stats = page.locator(".stats dd");
  const due = page.locator(".stats + .hint");
  await expect(stats).toHaveText(["3", "3", "0/3", "0/3"]);
  // 89.50 + 78.10 + (27.00 + 1.5 lb of lamb at 16.99: 25.49)
  await expect(due).toHaveText("应收（预估） $220.09 · 已收款 $0.00 · 待称重 1");
  await expect(page.locator(".order .order-who strong")).toHaveText(["王阿姨", "Leo", "陈太"]);
  const card = (name: string) => page.locator(".order", { hasText: name });

  // everything about an order a merchant needs, the buyer's number and address included
  await expect(card("Leo").getByRole("link", { name: "打电话给 Leo" })).toHaveText("778-555-0199");
  await expect(card("Leo").getByRole("link", { name: "打电话给 Leo" })).toHaveAttribute("href", "tel:+17785550199");
  await expect(card("Leo").getByRole("heading", { name: "送货 · 列治文" })).toBeVisible();
  await expect(card("Leo").getByText("8888 No. 3 Rd, Richmond")).toBeVisible();
  await expect(card("Leo").getByText("备注：到了打电话")).toBeVisible();
  await card("Leo").getByRole("button", { name: "复制地址" }).click();
  expect(await copied(page)).toBe("8888 No. 3 Rd, Richmond");
  await expect(card("陈太").getByRole("link", { name: "打电话给 陈太" })).toHaveText("+1 236-555-0111");
  await expect(card("王阿姨").locator(".sums-total")).toHaveText("应收$89.50");
  await expect(card("陈太").locator(".sums-total")).toHaveText("应收（预估）$52.49");

  // confirm, and mark paid
  await expect(card("王阿姨").locator(".chip")).toHaveText("待确认");
  await card("王阿姨").getByRole("button", { name: "确认" }).click();
  await expect(card("王阿姨").locator(".chip")).toHaveText("已确认");
  await expect(card("王阿姨").getByRole("button", { name: "确认" })).toHaveCount(0);
  await card("王阿姨").getByRole("button", { name: "已收款" }).click();
  await expect(card("王阿姨").getByRole("button", { name: "已收款" })).toHaveAttribute("aria-pressed", "true");
  await expect(stats).toHaveText(["3", "2", "1/3", "0/3"]);
  await expect(due).toHaveText("应收（预估） $220.09 · 已收款 $89.50 · 待称重 1");

  // by what's still to do, and by where it goes
  await page.getByRole("button", { name: "待确认 2" }).click();
  await expect(page.locator(".order .order-who strong")).toHaveText(["Leo", "陈太"]);
  await page.getByRole("button", { name: "未收款 2" }).click();
  await expect(page.locator(".order")).toHaveCount(2);
  await page.getByRole("button", { name: "全部 3" }).click();
  await page.locator('select[name="place"]').selectOption(`delivery:${offer.rules.find((rule) => rule.label === "列治文")!.id}`);
  await expect(page.locator(".order .order-who strong")).toHaveText(["Leo"]);
  await page.getByRole("button", { name: "未取货 3" }).click();
  await expect(page.locator(".order")).toHaveCount(1);
  await page.locator('select[name="place"]').selectOption("");
  await page.getByRole("button", { name: "全部 3" }).click();
  await expect(page.locator(".order")).toHaveCount(3);

  // the scale: what isn't a weight is said so; what is, settles the order's amount
  await card("陈太").getByRole("button", { name: "称重" }).click();
  const scale = page.getByRole("dialog", { name: "称重：陈太" });
  await scale.locator("input").fill("两磅");
  await expect(scale.locator(".problem")).toHaveText("请填 0 到 999 之间的数字，最多三位小数。");
  await expect(scale.getByRole("button", { name: "保存" })).toBeDisabled();
  await scale.locator("input").fill("1.62");
  await expect(scale.getByText("$27.52")).toBeVisible();
  await scale.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(card("陈太").locator(".sum-lines li").last()).toHaveText(/手切羊肉片\s*× 1\.5 lb · 实称 1\.62 lb\s*\$27\.52/);
  await expect(card("陈太").locator(".sums-total")).toHaveText("应收$54.52");
  await expect(due).toHaveText("应收 $222.12 · 已收款 $89.50");

  // cancel: asked first; then it's out of the count and the sheets, and the buyer's page says so
  await card("Leo").getByRole("button", { name: "取消订单" }).click();
  const ask = page.getByRole("dialog", { name: "取消 Leo 的订单？" });
  await ask.getByRole("button", { name: "先不取消" }).click();
  await expect(page.locator(".order")).toHaveCount(3);
  await card("Leo").getByRole("button", { name: "取消订单" }).click();
  await ask.getByRole("button", { name: "取消订单" }).click();
  await expect(page.locator(".order .order-who strong")).toHaveText(["王阿姨", "陈太"]);
  await expect(stats).toHaveText(["2", "1", "1/2", "0/2"]);
  await expect(due).toHaveText("应收 $144.02 · 已收款 $89.50");
  await page.getByRole("button", { name: "已取消 1" }).click();
  await expect(card("Leo").locator(".chip")).toHaveText("已取消");
  await expect(card("Leo").getByRole("button")).toHaveCount(1); // only the address's copy button is left
  const theirs = await request.get(`/tuan/api/orders/${leo.order.code}`, { headers: { "x-tail": "0199" } });
  expect(((await theirs.json()) as typeof leo).order.status).toBe("cancelled");

  // what to get ready: every item added up, by hand: rice 2, eggs 1 + 2, lamb 1.5 lb
  await page.getByRole("button", { name: "备货单" }).click();
  await expect(page.locator(".sheet-table tbody tr")).toHaveText([/五常大米 10kg\s*2 袋\s*1\s*\$76\.00/, /土鸡蛋 30 枚\s*3 盒\s*2\s*\$40\.50/, /手切羊肉片\s*1\.5 lb\s*实称 1\.62 lb\s*1\s*\$25\.49/]);
  await expect(page.locator(".sheet-table + .sums div")).toHaveText(["商品（按下单量）$141.99", "应收$144.02"]);
  await page.getByRole("button", { name: "复制这张表" }).click();
  expect(await copied(page)).toBe(["本周大米团 · 周五到货", "备货单 · 2 单", "", "五常大米 10kg × 2 袋", "土鸡蛋 30 枚 × 3 盒", "手切羊肉片 × 1.5 lb（实称 1.62 lb）", "", "商品（按下单量） $141.99", "应收 $144.02"].join("\n"));

  // what goes where: each pickup point's own total, then who gets what
  await page.getByRole("button", { name: "分拣单" }).click();
  await expect(page.locator(".panel .panel-title")).toHaveText(["自提 · 温哥华西区", "自提 · 大学区"]);
  const west = page.locator(".panel", { hasText: "温哥华西区" });
  await expect(west.locator(".sum-lines li")).toHaveText(["五常大米 10kg2 袋", "土鸡蛋 30 枚1 盒"]);
  await expect(west.locator(".who li")).toHaveText([/1\s*王阿姨\s*···· 0134\s*五常大米 10kg × 2 袋、土鸡蛋 30 枚 × 1 盒/]);
  await expect(west.getByText("1 单 · $89.50")).toBeVisible();
  await page.getByRole("button", { name: "复制这张表" }).click();
  expect(await copied(page)).toBe(
    [
      "本周大米团 · 周五到货",
      "分拣单 · 2 单",
      "",
      "【自提 · 温哥华西区】1 单",
      "五常大米 10kg × 2 袋",
      "土鸡蛋 30 枚 × 1 盒",
      "",
      "1. 王阿姨 0134：五常大米 10kg × 2 袋、土鸡蛋 30 枚 × 1 盒",
      "",
      "【自提 · 大学区】1 单",
      "土鸡蛋 30 枚 × 2 盒",
      "手切羊肉片 × 1.5 lb（实称 1.62 lb）",
      "",
      "3. 陈太 0111：土鸡蛋 30 枚 × 2 盒、手切羊肉片 × 1.5 lb（实称 1.62 lb）",
    ].join("\n"),
  );

  // a reload shows the same: nothing was only on the screen
  await page.reload();
  await expect(stats).toHaveText(["2", "1", "1/2", "0/2"]);
  await expect(due).toHaveText("应收 $144.02 · 已收款 $89.50");
  expect(errors).toEqual([]);
});

test("the link to share, closing a group buy and opening it again, and a draft", async ({ browser, request, baseURL }) => {
  const { id } = await start(request);
  const page = await phone(browser, { session: SESSION.leader });
  await catchCopies(page);
  await page.goto(`/tuan/my/t/${id}`);
  await expect(page.locator(".state")).toContainText("接单中");
  await expect(page.getByText("还没有订单。把开团链接发到群里。")).toBeVisible();
  await page.getByRole("button", { name: "复制开团链接" }).click();
  expect(await copied(page)).toBe(`${baseURL}/tuan/t/${id}`);

  await page.getByRole("button", { name: "现在截单" }).click();
  const ask = page.getByRole("dialog", { name: "现在截单？" });
  await ask.getByRole("button", { name: "先不截" }).click();
  await expect(page.locator(".state")).toContainText("接单中");
  await page.getByRole("button", { name: "现在截单" }).click();
  await ask.getByRole("button", { name: "截单", exact: true }).click();
  await expect(page.locator(".state")).toContainText("已截单");
  expect((await offerOf(request, id)).offer.state).toBe("closed");
  await page.getByRole("button", { name: "重新接单" }).click();
  await expect(page.locator(".state")).toContainText("接单中");
  expect((await offerOf(request, id)).offer.state).toBe("open");
  await page.getByRole("link", { name: "看开团页" }).click();
  await expect(page).toHaveURL(new RegExp(`/tuan/t/${id}$`));
  await expect(page.locator(".item")).toHaveCount(5);

  // a draft is the merchant's alone until it's opened
  const draft = await start(request, { open: false });
  await page.goto(`/tuan/my/t/${draft.id}`);
  await expect(page.locator(".state")).toContainText("草稿");
  await expect(page.getByRole("button", { name: "复制开团链接" })).toHaveCount(0);
  expect((await request.get(`/tuan/api/offers/${draft.id}`)).status()).toBe(404);
  await page.getByRole("button", { name: "开始接单" }).click();
  await expect(page.locator(".state")).toContainText("接单中");
  expect((await offerOf(request, draft.id)).offer.state).toBe("open");
});

test("the owner sets a shop up and starts a group buy by hand", async ({ browser }) => {
  const page = await phone(browser, { session: SESSION.owner });
  await page.goto("/tuan/my");
  await expect(page.getByText("已登录：Steve（owner@example.com）")).toBeVisible();
  const panel = page.locator(".panel", { hasText: "站长" });
  const slug = `demo-${word()}`;

  // a shop
  await expect(panel.getByRole("button", { name: "保存店铺" })).toBeDisabled();
  await panel.locator('input[name="slug"]').fill("Not A Slug");
  await panel.locator('input[name="shopname"]').fill("演示小店");
  await panel.getByRole("button", { name: "保存店铺" }).click();
  await expect(panel.locator(".problem")).toHaveText("没成：slug");
  await panel.locator('input[name="slug"]').fill(slug);
  await panel.locator('textarea[name="contact"]').fill("微信 demo-shop");
  await panel.locator('textarea[name="pay"]').fill("e-Transfer: demo@example.com");
  await expect(panel.locator('textarea[name="members"]')).toHaveValue("owner@example.com");
  await panel.getByRole("button", { name: "保存店铺" }).click();
  await expect(panel.getByText("店铺保存好了。")).toBeVisible();
  const shop = page.locator(".panel", { hasText: "演示小店" }).first();
  await expect(shop.getByText("还没有开过团。")).toBeVisible();
  await expect(panel.locator('select[name="shop"]')).toHaveValue(slug);

  // a group buy: what isn't one is said so, in the server's own word
  await expect(panel.getByRole("button", { name: "开团" })).toBeDisabled();
  await panel.locator('textarea[name="doc"]').fill("{ not json");
  await panel.getByRole("button", { name: "开团" }).click();
  await expect(panel.locator(".problem")).toHaveText("这不是合法的 JSON。");
  await panel.getByRole("button", { name: "填入样例" }).click();
  const sample = JSON.parse(await panel.locator('textarea[name="doc"]').inputValue()) as { items: Record<string, unknown>[] };
  delete sample.items[1].price;
  await panel.locator('textarea[name="doc"]').fill(JSON.stringify(sample));
  await panel.getByRole("button", { name: "开团" }).click();
  await expect(panel.locator(".problem")).toHaveText("没成：item #2");

  // the sample as it is: it closes at eight in the evening, Vancouver time, a week from now
  await panel.getByRole("button", { name: "填入样例" }).click();
  await panel.getByRole("button", { name: "开团" }).click();
  await expect(panel.getByText("开好了。")).toBeVisible();
  await expect(shop.locator(".mine li")).toHaveCount(1);
  await expect(shop.locator(".mine li")).toContainText("测试团 · 样例");
  await expect(shop.locator(".mine li")).toContainText("20:00");
  await panel.getByRole("link", { name: "看开团页" }).click();
  await expect(page.locator(".hero h1")).toHaveText("测试团 · 样例");
  await expect(page.locator(".shop-name")).toHaveText("演示小店");
  await expect(page.locator(".item")).toHaveCount(4);
  await expect(page.locator(".state")).toContainText("20:00");
});

test("on a small phone: the merchant's pages fit, and everything to tap is big enough", async ({ browser, request }) => {
  const { id } = await start(request, { title: "本周大米团 · 周五到货 · 冷冻肉和米面粮油一起团" });
  await threeOrders(request, id);
  const page = await phone(browser, { viewport: { width: 320, height: 568 }, session: SESSION.owner });

  await page.goto("/tuan/my");
  await expect(page.locator("form.stack")).toHaveCount(2);
  await fits(page, "a merchant's home, with the owner's panel");
  await page.goto(`/tuan/my/t/${id}`);
  await expect(page.locator(".order")).toHaveCount(3);
  await fits(page, "a group buy's orders");
  await page.locator(".order", { hasText: "陈太" }).getByRole("button", { name: "称重" }).click();
  await fits(page, "the scale");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: "备货单" }).click();
  await expect(page.locator(".sheet-table")).toBeVisible();
  await fits(page, "what to get ready");
  await page.getByRole("button", { name: "分拣单" }).click();
  await expect(page.locator(".who").first()).toBeVisible();
  await fits(page, "what goes where");

  const out = await phone(browser, { viewport: { width: 320, height: 568 } });
  await out.goto("/tuan/my");
  await expect(out.locator(".panel-title")).toHaveText("商家请先登录");
  await fits(out, "the sign-in prompt");
});
