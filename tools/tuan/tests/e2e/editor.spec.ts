// A merchant starts a group buy and changes one, on a phone, against the real Worker with a
// stand-in for the rooms server (tests/rooms): from nothing; from the last one; one that has
// orders; what the page says when something is wrong; a form half written and come back to; and
// a small phone.
import { expect, test, type Page } from "@playwright/test";
import { toField, vancouverClock } from "../../src/engine/time.ts";
import { SESSION } from "../accounts.ts";
import { DAY, fits, offerOf, order, phone, putAway, sheets, shopOnly, start } from "./help.ts";

const field = (page: Page, name: string) => page.locator(`[name="${name}"]`);
const done = (page: Page) => page.locator(".sheet").getByRole("button", { name: "确定" });
const row = (page: Page, text: string) => page.locator(".row-btn", { hasText: text });
const ID = /\/tuan\/my\/t\/([a-z0-9]{8})$/;

test.afterEach(putAway);

test("a merchant starts a group buy from nothing, and buyers see it as it was written", async ({ browser, request }) => {
  const { slug, name } = await shopOnly(request);
  const page = await phone(browser, { session: SESSION.leader });
  await page.goto("/tuan/my");
  const shop = page.locator(".panel", { hasText: name });
  await expect(shop.getByText("还没有开过团。")).toBeVisible();
  await shop.getByRole("link", { name: "开一个团" }).click();
  await expect(page).toHaveURL(new RegExp(`/tuan/my/new/${slug}$`));
  await expect(page.locator(".hero h1")).toHaveText("开一个团");
  await expect(page.locator(".shop-name")).toHaveText(name);
  await expect(page.getByText("还没有商品。")).toBeVisible();
  // nothing to start from: this shop has had no group buy
  await expect(page.getByRole("button", { name: /照上一团/ })).toHaveCount(0);

  // what's missing is said, one thing at a time
  const open = page.getByRole("button", { name: "开始接单" });
  await open.click();
  await expect(page.locator(".problem")).toHaveText("先写团名。");
  await field(page, "title").fill("本周大米团 · 周五到货");
  await field(page, "note").fill("周三晚上截单，周五送货或自提。");
  await open.click();
  await expect(page.locator(".problem")).toHaveText("至少要有一样商品。");

  // an item sold by the bag: a name and a price are needed, and the price has to be money
  await page.getByRole("button", { name: "加商品" }).click();
  await expect(page.locator(".sheet h2")).toHaveText("加商品");
  await expect(field(page, "item-name")).toBeFocused();
  await done(page).click();
  await expect(page.locator(".sheet .problem")).toHaveText(["这里要写。", "写成 12 或 12.50 这样。"]);
  await field(page, "item-name").fill("五常大米 10kg");
  await field(page, "item-price").fill("三十八");
  await expect(page.locator(".sheet .problem")).toHaveText("写成 12 或 12.50 这样。");
  await field(page, "item-price").fill("38");
  await field(page, "item-unit").selectOption("bag");
  await field(page, "item-section").fill("米面");
  await field(page, "item-detail").fill("当季新米");
  await field(page, "item-stock").fill("40");
  await field(page, "item-perbuyer").fill("2.5");
  await expect(page.locator(".sheet .problem")).toHaveText("要写整数。");
  await field(page, "item-perbuyer").fill("3");
  await field(page, "item-allergens").fill("无");
  await done(page).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(row(page, "五常大米 10kg")).toContainText("$38.00 / 袋 · 米面 · 共 40");

  // one sold by weight: by the half pound, no less than a pound; amounts go in its steps
  await page.getByRole("button", { name: "加商品" }).click();
  await expect(field(page, "item-section"), "the section last used is offered again").toHaveValue("米面");
  await field(page, "item-name").fill("手切羊肉片");
  await field(page, "item-price").fill("16.99");
  await expect(field(page, "item-least")).toHaveCount(0);
  await field(page, "item-unit").selectOption("lb");
  await expect(page.getByText("买家选重量，看到的是预估金额；称重以后在订单里填实际重量。")).toBeVisible();
  await expect(field(page, "item-step")).toHaveValue("500");
  await field(page, "item-least").fill("1");
  await field(page, "item-section").fill("蛋肉");
  await field(page, "item-stock").fill("1.3");
  await expect(page.locator(".sheet .problem")).toHaveText("要是 0.5 的整数倍。");
  await field(page, "item-stock").fill("");
  await done(page).click();
  await expect(row(page, "手切羊肉片")).toContainText("$16.99 / 磅 · 蛋肉");

  await open.click();
  await expect(page.locator(".problem")).toHaveText("至少要有一个自提点或者送货区。");
  await page.getByRole("button", { name: "加自提点" }).click();
  await field(page, "point-name").fill("温哥华西区");
  await field(page, "point-address").fill("下单后发具体门牌");
  await field(page, "point-hours").fill("周五 4–7pm");
  await done(page).click();
  await expect(row(page, "温哥华西区")).toContainText("周五 4–7pm · 下单后发具体门牌");
  // a delivery area: a fee, and free from so much
  await page.getByRole("button", { name: "加送货区" }).click();
  await expect(field(page, "rule-free"), "free delivery means something only where there's a fee").toHaveCount(0);
  await done(page).click();
  await expect(page.locator(".sheet .problem")).toHaveText("这里要写。");
  await field(page, "rule-label").fill("列治文");
  await field(page, "rule-fee").fill("5");
  await field(page, "rule-free").fill("68");
  await field(page, "rule-hours").fill("每天 6–9pm");
  await done(page).click();
  await expect(row(page, "列治文")).toContainText("运费 $5.00 · 满 $68.00 免运费 · 每天 6–9pm");
  await expect(page.getByText("商品 2 样 · 自提点 1 个 · 送货区 1 个")).toBeVisible();

  // a form this long isn't lost to a phone call: what was typed is still here after the page is opened again
  await page.reload();
  await expect(page.getByText("上次没填完的还在。")).toBeVisible();
  await expect(field(page, "title")).toHaveValue("本周大米团 · 周五到货");
  await expect(page.locator(".row-btn")).toHaveCount(4);

  // a closing time that has passed is no closing time; left alone it's a week from now, at eight in the evening in Vancouver
  const closes = await field(page, "closes").inputValue();
  expect(closes).toMatch(/T20:00$/);
  await field(page, "closes").fill(toField(Date.now() - DAY));
  await open.click();
  await expect(page.locator(".problem")).toHaveText("截单时间要在现在以后、90 天以内。");
  await field(page, "closes").fill(closes);
  await field(page, "roster").selectOption("anon");

  await open.click();
  await expect(page).toHaveURL(ID);
  const id = ID.exec(page.url())![1];
  await expect(page.locator(".hero h1")).toHaveText("本周大米团 · 周五到货");
  await expect(page.locator(".state")).toContainText("接单中");
  await expect(page.locator(".state")).toContainText("20:00");

  // as a buyer gets it
  const made = await offerOf(request, id);
  expect(made.offer).toMatchObject({ title: "本周大米团 · 周五到货", note: "周三晚上截单，周五送货或自提。", state: "open", roster: "anon" });
  expect(vancouverClock(made.offer.closesAt).replace(" ", "T")).toBe(closes);
  expect(made.items.map(({ id: _id, ...item }) => item)).toEqual([
    { section: "米面", name: "五常大米 10kg", detail: "当季新米", photo: null, price: 3800, unit: "bag", step: 1000, least: 1000, left: 40_000, perBuyer: 3000, allergens: "无" },
    { section: "蛋肉", name: "手切羊肉片", detail: "", photo: null, price: 1699, unit: "lb", step: 500, least: 1000, left: null, perBuyer: null, allergens: "" },
  ]);
  expect(made.points.map(({ id: _id, ...point }) => point)).toEqual([{ name: "温哥华西区", address: "下单后发具体门牌", hours: "周五 4–7pm" }]);
  expect(made.rules.map(({ id: _id, ...rule }) => rule)).toEqual([{ label: "列治文", min: 0, fee: 500, freeFrom: 6800, hours: "每天 6–9pm" }]);
  await page.goto(`/tuan/t/${id}`);
  await expect(page.locator(".item")).toHaveCount(2);
  await expect(page.locator(".tab")).toHaveText(["米面", "蛋肉"]);

  // it went: the form starts empty again, and now there is a last one to start from
  await page.goto(`/tuan/my/new/${slug}`);
  await expect(field(page, "title")).toHaveValue("");
  await expect(page.getByText("上次没填完的还在。")).toHaveCount(0);
  await page.getByRole("button", { name: "照上一团「本周大米团 · 周五到货」来" }).click();
  await expect(field(page, "title")).toHaveValue("本周大米团 · 周五到货");
  await expect(page.locator(".row-btn")).toHaveCount(4);
  // …and what was begun can be thrown away
  await page.reload();
  await page.getByRole("button", { name: "清空重来" }).click();
  await expect(field(page, "title")).toHaveValue("");
  await expect(page.locator(".row-btn")).toHaveCount(0);
});

test("the next one starts from the last: a week on, a few words changed, kept as a draft, then opened", async ({ browser, request }) => {
  const { id, slug } = await start(request);
  const before = await offerOf(request, id);
  const page = await phone(browser, { session: SESSION.leader });
  await page.goto(`/tuan/my/t/${id}`);
  await page.getByRole("link", { name: "再开一团" }).click();
  await expect(page).toHaveURL(new RegExp(`/tuan/my/new/${slug}\\?from=${id}$`));
  await expect(field(page, "title")).toHaveValue("本周大米团 · 周五到货");
  await expect(page.getByText("商品 5 样 · 自提点 3 个 · 送货区 3 个")).toBeVisible();
  // the same day of the week and time of day, the first that is ahead
  await expect(field(page, "closes")).toHaveValue(toField(before.offer.closesAt + 7 * DAY));

  await field(page, "title").fill("下周大米团 · 周五到货");
  // a price goes up, one thing isn't sold this time, and the lamb moves to the top
  await row(page, "五常大米 10kg").click();
  await expect(page.locator(".sheet h2")).toHaveText("改商品");
  await expect(field(page, "item-price")).toHaveValue("38");
  await expect(field(page, "item-stock")).toHaveValue("40");
  await field(page, "item-price").fill("39.5");
  await done(page).click();
  await row(page, "东北珍珠米").click();
  await page.locator(".sheet").getByRole("button", { name: "删掉" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(row(page, "东北珍珠米")).toHaveCount(0);
  await row(page, "手切羊肉片").click();
  await expect(field(page, "item-unit")).toHaveValue("lb");
  await expect(field(page, "item-least"), "no less than a pound, as it was").toHaveValue("1");
  await expect(page.locator(".sheet").getByRole("button", { name: "下移" })).toBeDisabled();
  for (let n = 0; n < 3; n++) await page.locator(".sheet").getByRole("button", { name: "上移" }).click();
  await expect(page.locator(".sheet").getByRole("button", { name: "上移" })).toBeDisabled();
  await done(page).click();
  await expect(page.locator(".row-btn strong").first()).toHaveText("手切羊肉片");
  // delivery to Burnaby stops
  await page.locator(".row-btn", { hasText: "本拿比" }).last().click();
  await expect(page.locator(".sheet h2")).toHaveText("改送货区");
  await expect(field(page, "rule-min")).toHaveValue("98");
  await page.locator(".sheet").getByRole("button", { name: "删掉" }).click();
  await expect(page.getByText("商品 4 样 · 自提点 3 个 · 送货区 2 个")).toBeVisible();

  // kept as a draft: its merchant's alone
  await page.getByRole("button", { name: "存成草稿，先不接单" }).click();
  await expect(page).toHaveURL(ID);
  const next = ID.exec(page.url())![1];
  expect(next).not.toBe(id);
  await expect(page.locator(".state")).toContainText("草稿");
  expect((await request.get(`/tuan/api/offers/${next}`)).status()).toBe(404);

  // changed once more, and opened from the same page
  await page.getByRole("link", { name: "改这个团" }).click();
  await expect(page).toHaveURL(new RegExp(`/tuan/my/t/${next}/edit$`));
  await expect(page.locator(".hero h1")).toHaveText("改这个团");
  await expect(field(page, "title")).toHaveValue("下周大米团 · 周五到货");
  await field(page, "note").fill("下周三晚上截单。");
  await page.getByRole("button", { name: "开始接单" }).click();
  await expect(page).toHaveURL(new RegExp(`/tuan/my/t/${next}$`));
  await expect(page.locator(".state")).toContainText("接单中");
  const made = await offerOf(request, next);
  expect(made.offer).toMatchObject({ title: "下周大米团 · 周五到货", note: "下周三晚上截单。", state: "open" });
  expect(made.offer.closesAt).toBe(Math.floor((before.offer.closesAt + 7 * DAY) / 60_000) * 60_000);
  expect(made.items.map((item) => [item.name, item.price, item.unit, item.least])).toEqual([["手切羊肉片", 1699, "lb", 1000], ["五常大米 10kg", 3950, "bag", 1000], ["黄小米 2lb", 880, "pack", 1000], ["土鸡蛋 30 枚", 1350, "box", 1000]]);
  expect(made.items.find((item) => item.name.startsWith("黄小米"))?.perBuyer).toBe(2000);
  expect(made.rules.map((rule) => rule.label)).toEqual(["温哥华（Downtown 除外）", "列治文"]);
  // the one it came from is as it was
  expect((await offerOf(request, id)).items.map((item) => item.name)).toEqual(before.items.map((item) => item.name));
});

test("changing one that has orders: what an order names can change but not go, and a page that's behind says so", async ({ browser, request }) => {
  const { id } = await start(request);
  const placed = await order(request, id, { name: "王阿姨", phone: "604-555-0134" }, [["五常大米", 2000]]);
  const page = await phone(browser, { session: SESSION.leader });
  const behind = await phone(browser, { session: SESSION.leader });
  await behind.goto(`/tuan/my/t/${id}/edit`);
  await expect(field(behind, "title")).toHaveValue("本周大米团 · 周五到货");

  await page.goto(`/tuan/my/t/${id}/edit`);
  await expect(page.locator(".hero h1")).toHaveText("改这个团");
  await expect(page.getByRole("button", { name: "开始接单" })).toHaveCount(0);
  // the rice is in an order: it stays, sold the way it was; its limit can't go below what's ordered
  await row(page, "五常大米 10kg").click();
  await expect(page.getByText("已经有人下单了：不能删，「怎么卖」也不能改。不想再卖，就把「一共有多少」改成 2。")).toBeVisible();
  await expect(field(page, "item-unit")).toBeDisabled();
  await expect(page.locator(".sheet").getByRole("button", { name: "删掉" })).toHaveCount(0);
  await field(page, "item-stock").fill("1");
  await expect(page.locator(".sheet .problem")).toHaveText("已经卖出 2，不能比这个少。");
  await done(page).click();
  await expect(page.locator(".sheet"), "it isn't kept while something is wrong").toHaveCount(1);
  await field(page, "item-stock").fill("2");
  await field(page, "item-price").fill("39.99");
  await done(page).click();
  // what nobody ordered can go; so can a pickup point no order names, but not the one that order goes to
  await row(page, "东北珍珠米").click();
  await page.locator(".sheet").getByRole("button", { name: "删掉" }).click();
  await row(page, "温哥华西区").click();
  await expect(page.getByText("已经有订单用到这里：不能删，字可以改。")).toBeVisible();
  await expect(page.locator(".sheet").getByRole("button", { name: "删掉" })).toHaveCount(0);
  await field(page, "point-hours").fill("周六 4–7pm");
  await done(page).click();
  await row(page, "大学区").click();
  await page.locator(".sheet").getByRole("button", { name: "删掉" }).click();
  await page.getByRole("button", { name: "加商品" }).click();
  await field(page, "item-name").fill("走地鸡 一只");
  await field(page, "item-price").fill("26");
  await field(page, "item-section").fill("蛋肉");
  await done(page).click();
  await field(page, "title").fill("本周大米团 · 改到周六到货");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/tuan/my/t/${id}$`));
  await expect(page.locator(".hero h1")).toHaveText("本周大米团 · 改到周六到货");

  const now = await offerOf(request, id);
  expect(now.offer.title).toBe("本周大米团 · 改到周六到货");
  expect(now.items.map((item) => [item.name, item.price, item.left])).toEqual([["五常大米 10kg", 3999, 0], ["黄小米 2lb", 880, null], ["土鸡蛋 30 枚", 1350, 10_000], ["手切羊肉片", 1699, null], ["走地鸡 一只", 2600, null]]);
  expect(now.points.map((point) => [point.name, point.hours])).toEqual([["温哥华西区", "周六 4–7pm"], ["本拿比", "周六 11am–1pm"]]);
  // the order is as it was placed: the price then, and still at its pickup point
  const mine = await sheets(request, id);
  expect(mine.orders.map((one) => [one.code, one.goods, one.lines[0].price, one.pickupId === now.points[0].id])).toEqual([[placed.order.code, 7600, 3800, true]]);
  await page.goto(`/tuan/t/${id}`);
  await expect(page.locator(".item", { hasText: "五常大米 10kg" })).toContainText("卖完了");

  // the page opened before all that is behind: it says so, and nothing of it is kept
  await field(behind, "note").fill("我这边还是老样子");
  await behind.getByRole("button", { name: "保存" }).click();
  await expect(behind.locator(".problem")).toHaveText("这个团刚刚有变化（有人下单，或者别处改过）。重新打开这一页再改。");
  expect((await offerOf(request, id)).offer.note).toBe(now.offer.note);

  // someone who doesn't run the shop is told so, here as on every merchant's page
  const other = await phone(browser, { session: SESSION.visitor });
  await other.goto(`/tuan/my/t/${id}/edit`);
  await expect(other.locator(".empty p")).toHaveText("这个账号不管这个团。");
  await other.goto("/tuan/my/new/no-such-shop");
  await expect(other.locator(".empty p")).toHaveText("这个账号没有这家店。");
  await expect(other.locator('[name="title"]')).toHaveCount(0);
  const out = await phone(browser);
  await out.goto(`/tuan/my/t/${id}/edit`);
  await expect(out.locator(".panel-title")).toHaveText("商家请先登录");
});

test("on a small phone, and in English: the editor fits, and everything to tap is big enough", async ({ browser, request }) => {
  const { id, slug } = await start(request, { title: "本周大米团 · 周五到货 · 冷冻肉和米面粮油一起团" });
  const page = await phone(browser, { viewport: { width: 320, height: 568 }, session: SESSION.leader });
  await page.goto(`/tuan/my/new/${slug}`);
  await expect(page.getByRole("button", { name: /照上一团/ })).toBeVisible();
  await fits(page, "an empty group buy, with the last one to start from");
  await page.goto(`/tuan/my/t/${id}/edit`);
  await expect(page.locator(".row-btn")).toHaveCount(11);
  await fits(page, "a group buy being changed");
  await row(page, "手切羊肉片").click();
  await expect(page.locator(".sheet")).toBeVisible();
  await fits(page, "an item sold by weight");
  await page.getByRole("button", { name: "关闭" }).click();
  await row(page, "温哥华西区").click();
  await fits(page, "a pickup point");
  await page.getByRole("button", { name: "关闭" }).click();
  await row(page, "列治文").click();
  await fits(page, "a delivery area");
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);

  // the phone's back button closes a sheet, and leaves the page where it was
  await row(page, "列治文").click();
  await expect(page.locator(".sheet")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/tuan/my/t/${id}/edit$`));

  // in English
  await page.evaluate(() => localStorage.setItem("tuan.lang", "en"));
  await page.reload();
  await expect(page.locator(".hero h1")).toHaveText("Change this group buy");
  await expect(page.getByText("Goods: 5 · Pickup points: 3 · Delivery areas: 3")).toBeVisible();
  await expect(row(page, "列治文")).toContainText("$5.00 delivery · free from $68.00 · 每天 6–9pm");
  await expect(row(page, "温哥华（Downtown 除外）")).toContainText("from $98.00 · free delivery · 周五 6–9pm");
  await fits(page, "a group buy being changed, in English");
  await row(page, "手切羊肉片").click();
  await expect(page.locator(".sheet h2")).toHaveText("Change the item");
  await expect(field(page, "item-unit").locator("option:checked")).toHaveText("By the pound (weighed)");
  await expect(page.getByText("Least per order, in lb")).toBeVisible();
  await fits(page, "an item sold by weight, in English");
});
