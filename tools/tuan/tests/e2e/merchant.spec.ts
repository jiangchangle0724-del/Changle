// The merchant's pages on a phone, against the real Worker with a stand-in for the rooms server
// (tests/rooms): who gets in, asking to open a shop and the owner's answer, a merchant's home, a
// group buy's orders with the merchant's marks
// (confirmed, paid, handed over, weighed, cancelled), the two sheets adding up to a hand count,
// closing and opening a group buy, and the owner's panel that sets a shop up and starts a group
// buy by hand or from a file. A phone that is signed in has the session the site would have left
// in its storage.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { vancouverClock } from "../../src/engine/time.ts";
import { SESSION } from "../accounts.ts";
import { offerDoc } from "../sample.ts";
import { catchCopies, copied, DAY, fits, offerOf, order, phone, putAway, start, WECHAT, word } from "./help.ts";

test.afterEach(putAway);

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
  await expect(page.getByText("还没有店？登录以后就在这一页申请开店。")).toBeVisible();
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

  // an account that runs nothing: it may ask for a shop
  const visitor = await phone(browser, { session: SESSION.visitor });
  await visitor.goto("/tuan/my");
  await expect(visitor.getByRole("heading", { name: "申请开店" })).toBeVisible();
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

test("sending a group buy on: the 接龙 text for a group chat, and a poster with a code to scan", async ({ browser, request, baseURL }) => {
  const { id } = await start(request);
  await order(request, id, { name: "王小美", phone: "604 555 0101" }, [["五常大米 10kg", 2000], ["手切羊肉片", 1500]]);
  const page = await phone(browser, { session: SESSION.leader });
  await catchCopies(page);
  await page.goto(`/tuan/my/t/${id}`);
  await page.getByRole("button", { name: "复制接龙文案" }).click();
  const text = (await copied(page)) ?? "";
  expect(text.split("\n").slice(0, 3)).toEqual(["【大米团（测试）】本周大米团 · 周五到货", expect.stringMatching(/^截单：\d+月\d+日 周. \d\d:\d\d$/), `下单：${baseURL}/tuan/t/${id}`]);
  expect(text).toContain("· 手切羊肉片 $16.99/磅（1 磅起）");
  expect(text).toContain("接龙（1 单）\n1. 王小美 五常大米 10kg×2、手切羊肉片 1.5 磅");
  expect(text).not.toMatch(/604/);

  // the poster: drawn on the phone, as large as a phone screen's picture, and saved from a button outside WeChat
  await page.getByRole("button", { name: "生成海报" }).click();
  const sheet = page.getByRole("dialog", { name: "分享海报" });
  const poster = sheet.locator("img.poster-img");
  await expect(poster).toBeVisible({ timeout: 15_000 });
  expect(await poster.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1080, 1440]);
  await expect(sheet.getByRole("link", { name: "保存图片" })).toHaveAttribute("download", "本周大米团 · 周五到货 海报.png");
  await expect(sheet.getByText("在手机上长按图片")).toBeVisible();
  await fits(page, "the poster");
  await page.keyboard.press("Escape");
  await expect(page.locator(".sheet")).toHaveCount(0);

  // in WeChat: no button that can't work there, only the long press
  const wechat = await phone(browser, { session: SESSION.leader, userAgent: WECHAT });
  await wechat.goto(`/tuan/my/t/${id}`);
  await wechat.getByRole("button", { name: "生成海报" }).click();
  await expect(wechat.locator("img.poster-img")).toBeVisible({ timeout: 15_000 });
  await expect(wechat.getByRole("link", { name: "保存图片" })).toHaveCount(0);
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

test("the owner fills the forms from a file: a shop and its group buy in one go", async ({ browser }) => {
  const page = await phone(browser, { session: SESSION.owner });
  await page.goto("/tuan/my");
  const panel = page.locator(".panel", { hasText: "站长" });
  const pick = panel.locator('input[type="file"]');
  const both = panel.getByRole("button", { name: "建店并开团" });
  const slug = `file-${word()}`;
  const name = `文件小店 ${slug.slice(5)}`; // both engines use one database: each run's shop has a name of its own
  const shop = page.locator(".panel", { hasText: name }).first();
  const json = (data: unknown) => ({ name: "import.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  const read = (shopName: string, title: string) => `读到了：店铺「${shopName}」，团「${title}」，2 样商品，1 个自提点，0 个送货区。还没有提交，看一眼再点下面的按钮。`;

  // what isn't a document is said so, and fills nothing
  await pick.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not json at all") });
  await expect(panel.locator(".problem")).toHaveText("这不是合法的 JSON。");
  await pick.setInputFiles(json(["a", "list"]));
  await expect(panel.locator(".problem")).toHaveText("这不是合法的 JSON。");
  await pick.setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(400_001, 32) });
  await expect(panel.locator(".problem")).toHaveText("文件太大了。");
  await expect(both).toHaveCount(0);
  await expect(panel.locator('textarea[name="doc"]')).toHaveValue("");
  await expect(panel.locator('input[name="slug"]')).toHaveValue("");

  // a shop with its group buy: the forms are filled in, and nothing is sent yet
  const offer = {
    title: "文件里的团",
    roster: "names",
    items: [
      { section: "牛肉/Beef", name: "样例牛腩 ～3/LB", detail: "Sample brisket · 炖煮都行", price: 899, unit: "lb", step: 500, least: 1000, perBuyer: 20000 },
      { section: "火锅/HOTPOT", name: "样例肥牛卷 0.5/LB", price: 800, unit: "portion", perBuyer: 50000 },
    ],
    points: [{ name: "样例自提点", address: "下单后发地址", hours: "周五" }],
    rules: [],
  };
  const about = { slug, name, contact: "微信 file-shop", pay: "测试：不用付款" };
  const broken = { ...offer, items: [offer.items[0], { ...offer.items[1], price: undefined }] };
  await pick.setInputFiles(json({ shop: about, offer: broken }));
  await expect(panel.getByText(read(name, "文件里的团"))).toBeVisible();
  await expect(panel.locator('input[name="slug"]')).toHaveValue(slug);
  await expect(panel.locator('input[name="shopname"]')).toHaveValue(name);
  await expect(panel.locator('select[name="kind"]')).toHaveValue("leader");
  await expect(panel.locator('textarea[name="pay"]')).toHaveValue("测试：不用付款");
  await expect(panel.locator('textarea[name="members"]'), "run by the owner unless the file says who").toHaveValue("owner@example.com");
  await expect(page.locator(".panel-title", { hasText: name })).toHaveCount(0);

  // one button: the shop, then the group buy in it. What went in and what didn't is said where the button is, and the button stays
  await both.click();
  await expect(panel.getByText("店铺保存好了。")).toBeVisible();
  await expect(panel.locator(".problem")).toHaveText("没成：item #2");
  await expect(both).toBeEnabled();
  await expect(shop.getByText("还没有开过团。")).toBeVisible();

  // the file put right, and saying when it closes: the field says so too, and that's what is sent
  const closesAt = Math.floor((Date.now() + 3 * DAY) / 60_000) * 60_000;
  await pick.setInputFiles(json({ shop: { ...about, kind: "farm", members: ["owner@example.com", "leader@example.com"] }, offer: { ...offer, closesAt } }));
  await expect(panel.getByText(read(name, "文件里的团"))).toBeVisible();
  await expect(panel.locator(".problem")).toHaveCount(0);
  await expect(panel.locator('select[name="kind"]')).toHaveValue("farm");
  await expect(panel.locator('textarea[name="members"]')).toHaveValue("owner@example.com\nleader@example.com");
  await expect(panel.locator('input[name="closes"]')).toHaveValue(vancouverClock(closesAt).replace(" ", "T"));
  await both.click();
  await expect(panel.getByText("店铺保存好了。")).toBeVisible();
  await expect(panel.getByText("开好了。")).toBeVisible();
  await expect(both, "it went in: there is nothing left to press twice").toHaveCount(0);
  await expect(shop.locator(".mine li")).toHaveCount(1);
  await expect(shop.locator(".mine li")).toContainText("文件里的团");
  await expect(shop.locator(".mine li")).toContainText(vancouverClock(closesAt).slice(11));
  await panel.getByRole("link", { name: "看开团页" }).click();
  await expect(page.locator(".hero h1")).toHaveText("文件里的团");
  await expect(page.locator(".shop-name")).toHaveText(name);
  await expect(page.locator(".item")).toHaveCount(2);
  await expect(page.locator(".tab")).toHaveText(["牛肉/Beef", "火锅/HOTPOT"]);

  // a group buy alone fills only its document: the shop is chosen from the list
  await page.goto("/tuan/my");
  await pick.setInputFiles(json({ ...offer, title: "第二个团" }));
  await expect(panel.getByText(read("—", "第二个团"))).toBeVisible();
  await expect(both).toHaveCount(0);
  await expect(panel.locator('input[name="slug"]')).toHaveValue("");
  await panel.locator('select[name="shop"]').selectOption(slug);
  await panel.getByRole("button", { name: "开团", exact: true }).click();
  await expect(panel.getByText("开好了。")).toBeVisible();
  await expect(shop.locator(".mine li")).toHaveCount(2);
});

test("a shop's own page: the merchant says who they are, and buyers see it, with the group buys taking orders and the earlier ones", async ({ browser, request }) => {
  const { id, slug } = await start(request);
  const page = await phone(browser, { session: SESSION.leader });
  await page.goto("/tuan/my");
  const shop = page.locator(".panel", { hasText: "大米团（测试）" }).first();
  await shop.getByRole("link", { name: "店铺资料" }).click();
  await expect(page).toHaveURL(new RegExp(`/tuan/my/s/${slug}$`));
  await expect(page.locator('[name="shopname"]')).toHaveValue("大米团（测试）");
  await expect(page.locator('[name="contact"]')).toHaveValue("微信 rice-test");
  // a name is needed
  await page.locator('[name="shopname"]').fill(" ");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".problem")).toHaveText("这里要写。");
  await page.locator('[name="shopname"]').fill("大米团");
  await page.locator('[name="kind"]').selectOption("farm");
  await page.locator('[name="about"]').fill("每周一团，周五到货。\n米面粮油和冷冻肉。");
  await page.locator('[name="permit"]').fill("BC 农业部门许可 AG-2026-001");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("存好了。")).toBeVisible();
  await page.reload();
  await expect(page.locator('[name="shopname"]')).toHaveValue("大米团");
  await expect(page.locator('[name="kind"]')).toHaveValue("farm");

  // a later group buy, and the first one closed
  const later = await request.post(`/tuan/api/my/shops/${slug}/offers`, { headers: { authorization: `Bearer ${SESSION.leader}` }, data: { ...offerDoc(Date.now() + 3 * DAY), title: "下周的团" } });
  expect(later.status()).toBe(201);
  await request.post(`/tuan/api/my/offers/${id}`, { headers: { authorization: `Bearer ${SESSION.leader}` }, data: { do: "close" } });

  // a buyer, from the group buy's page: the shop's name leads to its own page
  const buyer = await phone(browser);
  await buyer.goto(`/tuan/t/${(await later.json()).id}`);
  await buyer.locator(".hero a.shop-name").click();
  await expect(buyer).toHaveURL(new RegExp(`/tuan/s/${slug}$`));
  await expect(buyer).toHaveTitle("大米团 · 跟一单");
  await expect(buyer.locator(".hero h1")).toHaveText("大米团");
  await expect(buyer.locator(".hero .shop-name")).toHaveText("农场");
  await expect(buyer.locator(".hero .lines")).toHaveText("每周一团，周五到货。\n米面粮油和冷冻肉。");
  // the permit is on the first screen
  await expect(buyer.getByText("BC 农业部门许可 AG-2026-001")).toBeInViewport();
  const taking = buyer.locator(".panel", { has: buyer.locator(".panel-title", { hasText: "正在接单" }) });
  await expect(taking.locator("li")).toHaveCount(1);
  await expect(taking.locator("li")).toContainText("下周的团");
  const earlier = buyer.locator(".panel", { has: buyer.locator(".panel-title", { hasText: "开过的团" }) });
  await expect(earlier.locator("li")).toHaveText([/本周大米团 · 周五到货\s*已截单/]);
  await taking.getByRole("link", { name: /下周的团/ }).click();
  await expect(buyer.locator(".hero h1")).toHaveText("下周的团");
  // and from the shop's panel at the foot of a group buy's page
  await buyer.getByRole("link", { name: "这家店的其他团" }).click();
  await expect(buyer).toHaveURL(new RegExp(`/tuan/s/${slug}$`));
  await buyer.goto("/tuan/s/no-such-shop");
  await expect(buyer.locator(".empty h1")).toHaveText("没有这家店");

  // only the shop's own people change it
  const other = await phone(browser, { session: SESSION.visitor });
  await other.goto(`/tuan/my/s/${slug}`);
  await expect(other.locator(".empty p")).toHaveText("这个账号没有这家店。");
  await expect(other.locator('[name="shopname"]')).toHaveCount(0);
});

test("an account without a shop asks for one; the owner sends it back with a word, then lets it in", async ({ browser, browserName }) => {
  // (both browsers share a database, and an account asks for one shop: each has an account of its own)
  const session = browserName === "webkit" ? SESSION.askerWebkit : SESSION.askerChromium;
  const email = browserName === "webkit" ? "askerwebkit@example.com" : "askerchromium@example.com";
  const slug = `ask-${word()}`;
  const name = `周三小厨房 ${slug.slice(4)}`;

  const asker = await phone(browser, { session });
  await asker.goto("/tuan/my");
  await expect(asker.getByRole("heading", { name: "申请开店" })).toBeVisible();
  await expect(asker.getByText("跟一单不抽成：买家下单以后，钱直接付给你。", { exact: false })).toBeVisible();
  const form = asker.locator("form.stack");
  await form.locator('[name="shopname"]').fill(name);
  await form.locator('[name="kind"]').selectOption("kitchen");
  // typed in capitals: the address is lower case
  await form.locator('[name="slug"]').fill(slug.toUpperCase());
  await expect(form.getByText(`买家打开的是 changle.ca/tuan/s/${slug}`)).toBeVisible();
  await form.locator('[name="about"]').fill("每周三开团，周五取。");
  await form.locator('[name="contact"]').fill("微信 kitchen-1");
  await form.locator('[name="pay"]').fill("e-Transfer: kitchen@example.com");
  await form.locator('[name="note"]').fill("在三个群里接龙");
  await fits(asker, "asking for a shop");
  await form.getByRole("button", { name: "提交申请" }).click();
  await expect(form.getByRole("alert")).toHaveText("请先勾选上面的确认。");
  // the whole row ticks the box
  await form.getByText("我确认：我有所卖食品需要的许可", { exact: false }).click();
  await expect(form.locator('[name="declared"]')).toBeChecked();
  await form.getByRole("button", { name: "提交申请" }).click();

  // waiting for the owner: no page yet
  const panel = asker.locator("section.panel", { has: asker.getByRole("heading", { name }) });
  await expect(panel.locator(".chip")).toHaveText("待审核");
  await expect(panel.getByText(`申请交上去了，等站长审核。结果会发邮件到 ${email}。`)).toBeVisible();
  await expect(panel.getByRole("link", { name: "看店铺主页" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "开一个团" })).toBeVisible();
  expect((await asker.goto(`/tuan/s/${slug}`))?.status()).toBe(404);
  await expect(asker.getByText("没有这家店")).toBeVisible();

  // the owner: the asking at the top of their home, and sent back with a word on what to change
  const owner = await phone(browser, { session: SESSION.owner });
  await owner.goto("/tuan/my");
  const asking = owner.locator("article", { has: owner.getByRole("heading", { name }) });
  await expect(asking).toContainText(email);
  await expect(asking).toContainText("在三个群里接龙");
  await fits(owner, "the owner's list of applications");
  await asking.getByRole("button", { name: "退回", exact: true }).click();
  await asking.getByRole("button", { name: "退回", exact: true }).click();
  await expect(asking.getByRole("alert")).toHaveText("退回要写一句要改什么。");
  await asking.locator('[name="reply"]').fill("请写上许可号和发证的卫生局。");
  await asking.getByRole("button", { name: "退回", exact: true }).click();
  await expect(asking.getByText("已退回，等对方修改")).toBeVisible();

  // the merchant: told what to change, in the form as it was sent, and sends it again
  await asker.goto("/tuan/my");
  await expect(panel.locator(".chip")).toHaveText("退回修改");
  await expect(panel.getByText("请写上许可号和发证的卫生局。")).toBeVisible();
  await expect(panel.locator('[name="shopname"]')).toHaveValue(name);
  await expect(panel.locator('[name="slug"]')).toHaveValue(slug);
  await panel.locator('[name="permit"]').fill("Vancouver Coastal Health FP-1234");
  await panel.getByText("我确认：我有所卖食品需要的许可", { exact: false }).click();
  await panel.getByRole("button", { name: "改好了，重新提交" }).click();
  await expect(panel.locator(".chip")).toHaveText("待审核");

  // let in
  await owner.reload();
  await asking.getByRole("button", { name: "通过", exact: true }).click();
  await expect(asking.getByText("通过以后这家店马上开通，会发邮件告诉申请人。")).toBeVisible();
  await asking.getByRole("button", { name: "开通这家店" }).click();
  await expect(asking).toHaveCount(0);

  // open: its page is there, and under it the way in for the next merchant
  await asker.reload();
  await expect(panel.locator(".chip")).toHaveCount(0);
  await panel.getByRole("link", { name: "看店铺主页" }).click();
  await expect(asker.locator(".hero h1")).toHaveText(name);
  await expect(asker.getByText("Vancouver Coastal Health FP-1234")).toBeVisible();
  await expect(asker.getByRole("link", { name: "想自己开团？用跟一单，不抽成" })).toHaveAttribute("href", "/tuan/my");
});

test("the orders download as a spreadsheet; in WeChat, which can't save files, the page says where to do it", async ({ browser, request }) => {
  const { id } = await start(request);
  await order(request, id, { name: "王阿姨", phone: "604-555-0134" }, [["五常大米", 2000], ["手切羊肉片", 1500]]);
  await order(request, id, { name: "=HYPERLINK(\"http://x\")", phone: "16045550177" }, [["土鸡蛋", 1000]], { note: "放门口, 谢谢" });
  const page = await phone(browser, { session: SESSION.leader });
  await page.goto(`/tuan/my/t/${id}`);
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "导出表格" }).click()]);
  // (some browsers save spaces in a file's name as underscores)
  expect(file.suggestedFilename()).toMatch(/^本周大米团[ _]·[ _]周五到货[ _]订单[ _]\d{4}-\d{2}-\d{2}\.csv$/);
  const bytes = await readFile(await file.path());
  expect([...bytes.subarray(0, 3)], "it starts with the mark that tells Excel it's UTF-8").toEqual([0xef, 0xbb, 0xbf]);
  const rows = bytes.toString("utf8").slice(1).split("\r\n");
  expect(rows.pop(), "every row ends with CRLF").toBe("");
  expect(rows[0]).toBe("序号,订单号,状态,称呼,电话,微信,取货方式,自提点或送货区,地址,备注,商品,单位,单价,数量,实际重量,金额,运费,应收,已收款,已取货,下单时间");
  expect(rows).toHaveLength(4);
  expect(rows[1]).toMatch(/^1,[2-9A-HJKMNP-Z]{6},待确认,王阿姨,604-555-0134,,自提,温哥华西区,,,五常大米 10kg,袋,38\.00,2,,76\.00,0\.00,101\.49,,,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  expect(rows[2]).toMatch(/^1,[2-9A-HJKMNP-Z]{6},待确认,王阿姨,,,,,,,手切羊肉片,磅,16\.99,1\.5,,25\.49,,,,,$/);
  // what a buyer typed never runs as a formula, and a comma stays inside its field
  expect(rows[3]).toMatch(/^2,[2-9A-HJKMNP-Z]{6},待确认,"'=HYPERLINK\(""http:\/\/x""\)",1-604-555-0177,,自提,温哥华西区,,"放门口, 谢谢",土鸡蛋 30 枚,盒,13\.50,1,,13\.50,0\.00,13\.50,,,/);

  // in English, the words are English
  await page.evaluate(() => localStorage.setItem("tuan.lang", "en"));
  await page.reload();
  const [english] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export to a spreadsheet" }).click()]);
  expect(english.suggestedFilename()).toMatch(/[ _]orders[ _]\d{4}-\d{2}-\d{2}\.csv$/);
  expect((await readFile(await english.path(), "utf8")).split("\r\n")[1]).toMatch(/^1,[2-9A-HJKMNP-Z]{6},To confirm,王阿姨,604-555-0134,,Pickup,温哥华西区,,,五常大米 10kg,bag,38\.00,/);

  // in WeChat: no file, but where to get it
  const wechat = await phone(browser, { session: SESSION.leader, userAgent: WECHAT });
  let saved = false;
  wechat.on("download", () => void (saved = true));
  await wechat.goto(`/tuan/my/t/${id}`);
  await wechat.getByRole("button", { name: "导出表格" }).click();
  await expect(wechat.locator(".sheet h2")).toHaveText("到浏览器里导出");
  await expect(wechat.locator(".sheet")).toContainText("点右上角的「…」，选「在浏览器打开」");
  expect(saved).toBe(false);
  await wechat.goBack();
  await expect(wechat.locator(".sheet")).toHaveCount(0);
});

test("the merchant's pages come in a script of their own: a buyer never downloads it, and when it can't be fetched the page says so", async ({ browser, request }) => {
  const { url } = await start(request);
  const page = await phone(browser, { session: SESSION.leader });
  const scripts: string[] = [];
  page.on("request", (sent) => {
    if (sent.url().endsWith(".js")) scripts.push(new URL(sent.url()).pathname);
  });
  const theirs = (name: string) => scripts.some((path) => new RegExp(`/tuan/assets/${name}-[A-Z0-9]+\\.js$`).test(path));
  // a buyer's pages: the group buy, an order, home
  await page.goto(url);
  await expect(page.locator(".item").first()).toBeVisible();
  await page.goto("/tuan/");
  await expect(page.locator(".hero h1")).toBeVisible();
  expect(theirs("app")).toBe(true);
  expect(theirs("my"), "a buyer's page never downloads the merchant's").toBe(false);
  // a merchant's page fetches it
  await page.goto("/tuan/my");
  await expect(page.locator(".panel", { hasText: "大米团（测试）" }).first()).toBeVisible();
  expect(theirs("my")).toBe(true);
  // when it can't be fetched: said so, and trying again brings it
  await page.route(/\/tuan\/assets\/my-[A-Z0-9]+\.js$/, (route) => route.abort());
  await page.reload();
  await expect(page.locator(".empty p")).toHaveText("连不上，看看网络再试一次");
  await page.unroute(/\/tuan\/assets\/my-[A-Z0-9]+\.js$/);
  await page.getByRole("button", { name: "再试一次" }).click();
  await expect(page.locator(".panel", { hasText: "大米团（测试）" }).first()).toBeVisible();
});

test("on a small phone: the merchant's pages fit, and everything to tap is big enough", async ({ browser, request }) => {
  const { id, slug } = await start(request, { title: "本周大米团 · 周五到货 · 冷冻肉和米面粮油一起团" });
  await threeOrders(request, id);
  const page = await phone(browser, { viewport: { width: 320, height: 568 }, session: SESSION.owner });

  await page.goto("/tuan/my");
  await expect(page.locator("form.stack")).toHaveCount(2);
  await fits(page, "a merchant's home, with the owner's panel");
  const file = { shop: { slug: "a-shop-with-a-long-address", name: "名字很长很长的一家测试小店 A Shop With A Long Name" }, offer: { title: "本周大米团 · 周五到货 · 冷冻肉和米面粮油一起团", items: [], points: [], rules: [] } };
  await page.locator('.panel input[type="file"]').setInputFiles({ name: "import.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByRole("button", { name: "建店并开团" })).toBeVisible();
  await fits(page, "the owner's panel with a file read in");
  await page.goto(`/tuan/my/s/${slug}`);
  await expect(page.locator('[name="shopname"]')).toBeVisible();
  await fits(page, "what a shop says about itself");
  await page.goto(`/tuan/s/${slug}`);
  await expect(page.locator(".hero h1")).toBeVisible();
  await fits(page, "a shop's own page");
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
