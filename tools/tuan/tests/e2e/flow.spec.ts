// The buyer's pages on a phone, against the real Worker: a merchant's group buy is there (made
// through the API, as the merchant's own pages will), a buyer picks counted goods and something
// sold by weight, checks out for pickup or delivery, has their order, changes it, cancels it; a
// second phone needs the phone number's last four digits; something sells out while it sits in a
// cart; and the pages keep to the site's rules for small screens. Each phone is its own browser
// context, so each has its own storage.
import { expect, test, type Page } from "@playwright/test";
import type { OfferPage } from "../../src/api";
import { SESSION } from "../accounts.ts";
import { offerDoc } from "../sample.ts";
import { as, catchCopies, copied, DAY, fits, ORDER_URL, phone, sheets, start, word } from "./help.ts";

const add = (page: Page, name: string) => page.getByRole("button", { name: `加一份 ${name}` }).click();
const more = (page: Page, name: string) => page.locator(".items").getByRole("button", { name: `增加 ${name}` }).click();
const less = (page: Page, name: string) => page.locator(".items").getByRole("button", { name: `减少 ${name}` }).click();
const row = (page: Page, name: string) => page.locator(".item", { hasText: name });
const dock = (page: Page) => page.locator(".dock");
const toCheckout = async (page: Page) => {
  await dock(page).getByRole("button", { name: "去结算" }).click();
  await expect(page.locator("form.page")).toBeVisible();
};
const choose = (page: Page, place: string) => page.locator(".choice", { hasText: place }).click();
const send = (page: Page) => page.locator('form.page button[type="submit"]').click();
const codeOf = async (page: Page) => (await page.locator("h1 .code").innerText()).trim();

/** One bag of rice, picked up in west Vancouver; ends on the order's page. Returns the order's code. */
async function orderRice(page: Page, url: string, who = { name: "小林", phone: "604 555 0188" }): Promise<string> {
  await page.goto(url);
  await add(page, "五常大米 10kg");
  await toCheckout(page);
  await choose(page, "温哥华西区");
  await page.fill('input[name="name"]', who.name);
  await page.fill('input[name="phone"]', who.phone);
  await send(page);
  await expect(page).toHaveURL(ORDER_URL);
  return codeOf(page);
}

test("pick counted goods and something by weight, check out for pickup, and have the order", async ({ browser, request }) => {
  const { id, url } = await start(request);
  const page = await phone(browser);
  await catchCopies(page);
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));

  const first = await page.goto(url);
  expect(first?.status()).toBe(200);
  await expect(page).toHaveTitle("本周大米团 · 周五到货 · 大米团（测试） · 跟一单");
  await expect(page.locator(".hero h1")).toHaveText("本周大米团 · 周五到货");
  await expect(page.locator(".shop-name")).toHaveText("大米团（测试）");
  await expect(page.locator(".state")).toContainText("截单");
  await expect(page.locator(".offer-note")).toHaveText("周三晚上截单，周五送货或自提。");
  await expect(page.locator(".item")).toHaveCount(5);
  await expect(page.locator(".roster")).toHaveCount(0);
  await expect(dock(page)).toHaveCount(0);

  // counted goods: a tap adds one, then less and more
  await add(page, "五常大米 10kg");
  await more(page, "五常大米 10kg");
  await more(page, "五常大米 10kg");
  await less(page, "五常大米 10kg");
  await expect(row(page, "五常大米 10kg").locator(".step-n")).toHaveText("2");
  await add(page, "土鸡蛋 30 枚");
  await expect(dock(page).locator(".dock-count")).toHaveText("3 件");
  await expect(dock(page).locator(".dock-total")).toHaveText("$89.50");

  // by weight: a sheet, from the least (1 lb) by the half pound; what it comes to is an estimate
  await page.getByRole("button", { name: "选重量：手切羊肉片" }).click();
  const picker = page.getByRole("dialog", { name: "手切羊肉片" });
  await expect(picker.locator(".step-n")).toHaveText("1 lb");
  await picker.getByRole("button", { name: "减少 手切羊肉片" }).click();
  await expect(picker.locator(".step-n"), "no less than the least").toHaveText("1 lb");
  await picker.getByRole("button", { name: "增加 手切羊肉片" }).click();
  await expect(picker.locator(".step-n")).toHaveText("1.5 lb");
  await picker.getByRole("button", { name: "加入 · 预估 $25.49" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "选重量：手切羊肉片" })).toHaveText("1.5 lb");
  await expect(dock(page).locator(".dock-count")).toHaveText("4 件");
  await expect(dock(page).locator(".dock-total")).toHaveText("预估 $114.99");

  // the cart stays on this phone
  await page.reload();
  await expect(dock(page).locator(".dock-total")).toHaveText("预估 $114.99");

  // the cart: change an amount there; the phone's back button closes it and stays on the page
  await dock(page).locator(".dock-cart").click();
  const cart = page.getByRole("dialog", { name: "购物车" });
  await expect(cart.locator(".cart-line")).toHaveCount(3);
  await cart.getByRole("button", { name: "增加 土鸡蛋 30 枚" }).click();
  await expect(cart.locator(".cart-line", { hasText: "土鸡蛋" }).locator(".cart-amount")).toHaveText("$27.00");
  await page.goBack();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${url}$`));
  await expect(dock(page).locator(".dock-total")).toHaveText("预估 $128.49");

  // from the cart to checkout; back from checkout shows the goods again, the cart shut
  await dock(page).locator(".dock-cart").click();
  await cart.getByRole("button", { name: "去结算 · 预估 $128.49" }).click();
  await expect(page.locator("form.page")).toBeVisible();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("form.page")).toHaveCount(0);
  await expect(page.locator(".item")).toHaveCount(5);
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${url}$`));

  // checkout: what's missing is said in words, and the first field to fix is ready to type in
  await toCheckout(page);
  await send(page);
  await expect(page.locator(".problem")).toHaveText(["请选一个自提点", "请填称呼", "请填能联系到你的电话，至少 10 位数字"]);
  await expect(page.locator('input[name="name"]')).toBeFocused();
  await choose(page, "大学区");
  await page.fill('input[name="name"]', "小林");
  await page.fill('input[name="phone"]', "12345");
  await send(page);
  await expect(page.locator(".problem")).toHaveText(["请填能联系到你的电话，至少 10 位数字"]);

  // back to the goods for one more thing: what was typed is still there on return
  await page.getByRole("button", { name: "返回" }).click();
  await add(page, "东北珍珠米 15lb");
  await less(page, "东北珍珠米 15lb");
  await toCheckout(page);
  await expect(page.locator('input[name="name"]')).toHaveValue("小林");
  await expect(page.locator(".choice", { hasText: "大学区" }).locator("input")).toBeChecked();

  await page.fill('input[name="phone"]', "604 555 0188");
  await page.fill('input[name="wechat"]', "xiaolin_88");
  await page.fill('textarea[name="note"]', "鸡蛋请放上面");
  await expect(page.locator(".sums-total dd")).toHaveText("$128.49");
  await page.getByRole("button", { name: "提交订单 · 预估 $128.49" }).click();

  // the order's own page; "just placed" is said once
  await expect(page).toHaveURL(ORDER_URL);
  const code = await codeOf(page);
  await expect(page).toHaveTitle(`订单 ${code} · 跟一单`);
  await expect(page.locator(".placed")).toHaveText("下单成功");
  await expect(page.locator(".chip")).toHaveText(["待商家确认", "第 1 位", "未付款"]);
  await expect(page.locator(".sums-total")).toHaveText("合计（预估）$128.49");
  await expect(page.getByText("有按磅的商品：等商家称重后告诉你实际金额再付。")).toBeVisible();
  await expect(page.locator(".pay-how .lines")).toHaveText("e-Transfer: pay@example.com\n备注里写订单号");
  await expect(page.getByRole("heading", { name: "自提 · 大学区" })).toBeVisible();
  await expect(page.locator(".sum-lines li")).toHaveText([/五常大米 10kg\s*× 2 袋\s*\$76\.00/, /土鸡蛋 30 枚\s*× 2 盒\s*\$27\.00/, /手切羊肉片\s*× 1\.5 lb\s*\$25\.49/]);
  // nothing on the page can be selected: what's needed in the bank's app has a button each
  await page.getByRole("button", { name: "复制订单号" }).click();
  expect(await copied(page)).toBe(code);
  await page.getByRole("button", { name: "复制收款邮箱" }).click();
  expect(await copied(page)).toBe("pay@example.com");
  await page.getByRole("button", { name: "复制联系方式" }).click();
  expect(await copied(page)).toBe("微信 rice-test");
  await page.reload();
  await expect(page.locator("h1 .code")).toHaveText(code);
  await expect(page.locator(".placed")).toHaveCount(0);

  // the merchant has exactly this order
  const mine = await sheets(request, id);
  expect(mine.orders).toHaveLength(1);
  expect(mine.orders[0]).toMatchObject({ code, seq: 1, name: "小林", phone: "6045550188", wechat: "xiaolin_88", how: "pickup", note: "鸡蛋请放上面", goods: 12849, fee: 0, status: "new" });
  expect(mine.orders[0].lines.map((line) => [line.name, line.qty])).toEqual([["五常大米 10kg", 2000], ["土鸡蛋 30 枚", 2000], ["手切羊肉片", 1500]]);

  // the group buy's page lists who's in, with an empty cart again; home lists this phone's orders
  await page.getByRole("link", { name: "回到这个团" }).click();
  await expect(page.locator(".roster li")).toHaveText([/1\s*小林\s*5 件/]);
  await expect(dock(page)).toHaveCount(0);
  await page.goto("/tuan/");
  await expect(page.locator(".mine li")).toHaveCount(1);
  await page.locator(".mine a").click();
  await expect(page.locator("h1 .code")).toHaveText(code);

  expect(errors, "nothing the page's own rules turn away, nothing broken").toEqual([]);
});

test("delivery: an area's least, its fee, free delivery, and the address", async ({ browser, request }) => {
  const { id, url } = await start(request);
  const page = await phone(browser);
  await page.goto(url);
  await add(page, "五常大米 10kg");
  await expect(dock(page).locator(".dock-total"), "nothing by weight: not an estimate").toHaveText("$38.00");
  await toCheckout(page);
  await page.getByRole("button", { name: "送货" }).click();
  await page.fill('input[name="name"]', "Leo");
  await page.fill('input[name="phone"]', "778-555-0199");

  // Vancouver delivers from $98 of goods: said at once, and the order doesn't go
  await choose(page, "温哥华（Downtown 除外）");
  await expect(page.locator(".problem")).toHaveText(["还差 $60.00 起送"]);
  await page.fill('textarea[name="address"]', "1234 W 41st Ave, Vancouver");
  await send(page);
  await expect(page.locator(".problem")).toHaveText(["还差 $60.00 起送"]);
  await expect(page.locator("form.page")).toBeVisible();

  // Richmond: $5, free from $68
  await choose(page, "列治文");
  await expect(page.locator(".problem")).toHaveCount(0);
  await expect(page.getByText("再买 $30.00 免运费")).toBeVisible();
  await expect(page.locator(".sums div")).toHaveText(["商品$38.00", "运费$5.00", "合计$43.00"]);
  await page.fill('textarea[name="address"]', "  ");
  await send(page);
  await expect(page.locator(".problem")).toHaveText(["请填送货地址"]);
  await expect(page.locator('textarea[name="address"]')).toBeFocused();
  await page.fill('textarea[name="address"]', "8888 No. 3 Rd, Richmond");
  await page.getByRole("button", { name: "提交订单 · $43.00" }).click();

  await expect(page).toHaveURL(ORDER_URL);
  await expect(page.getByRole("heading", { name: "送货 · 列治文" })).toBeVisible();
  await expect(page.getByText("8888 No. 3 Rd, Richmond")).toBeVisible();
  await expect(page.locator(".sums-total")).toHaveText("合计$43.00");
  const mine = await sheets(request, id);
  expect(mine.orders[0]).toMatchObject({ how: "delivery", address: "8888 No. 3 Rd, Richmond", goods: 3800, fee: 500, final: 4300 });

  // enough for free delivery; and this phone remembers who and where for next time
  await page.goto(url);
  await add(page, "五常大米 10kg");
  await more(page, "五常大米 10kg");
  await toCheckout(page);
  await expect(page.getByRole("button", { name: "送货" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('input[name="name"]')).toHaveValue("Leo");
  await expect(page.locator('input[name="phone"]')).toHaveValue("778-555-0199");
  await expect(page.locator('textarea[name="address"]')).toHaveValue("8888 No. 3 Rd, Richmond");
  await choose(page, "列治文");
  await expect(page.locator(".sums div")).toHaveText(["商品$76.00", "运费免费", "合计$76.00"]);
});

test("change an order, open it from another phone with the last four digits, cancel it", async ({ browser, request }) => {
  const { id, url } = await start(request);
  const page = await phone(browser);
  const code = await orderRice(page, url);
  await expect(page.locator(".sums-total")).toHaveText("合计$38.00");

  // change it: the goods page again, holding what the order holds
  await page.getByRole("link", { name: "改订单" }).click();
  await expect(page.locator(".hero h1")).toHaveText(`改订单 ${code}`);
  await expect(row(page, "五常大米 10kg").locator(".step-n")).toHaveText("1");
  // (thinking better of it leads back to the order, nothing changed)
  await page.getByRole("link", { name: "不改了，回到订单" }).click();
  await expect(page.locator(".sums-total")).toHaveText("合计$38.00");
  await page.getByRole("link", { name: "改订单" }).click();
  await more(page, "五常大米 10kg");
  await add(page, "黄小米 2lb");
  await toCheckout(page);
  await expect(page.locator('input[name="phone"]')).toHaveValue("···· 0188");
  await expect(page.locator('input[name="phone"]')).not.toBeEditable();
  await expect(page.locator(".choice", { hasText: "温哥华西区" }).locator("input")).toBeChecked();
  await page.getByRole("button", { name: "保存修改 · $84.80" }).click();
  await expect(page).toHaveURL(ORDER_URL);
  await expect(page.locator("h1 .code")).toHaveText(code);
  await expect(page.locator(".placed")).toHaveCount(0);
  await expect(page.locator(".sums-total")).toHaveText("合计$84.80");
  expect((await sheets(request, id)).orders.map((order) => [order.code, order.goods])).toEqual([[code, 8480]]);

  // another phone: the code alone opens nothing
  const other = await phone(browser);
  await other.goto(`/tuan/o/${code.toLowerCase()}`);
  await expect(other.locator("h1")).toHaveText(`打开订单 ${code}`);
  await expect(other.getByRole("button", { name: "打开" })).toBeDisabled();
  await other.fill('input[name="tail"]', "0000");
  await other.getByRole("button", { name: "打开" }).click();
  await expect(other.locator(".problem")).toHaveText("订单号或电话后四位不对。");
  await expect(other.locator(".sums-total")).toHaveCount(0);
  await other.fill('input[name="tail"]', "0188");
  await other.getByRole("button", { name: "打开" }).click();
  await expect(other.locator("h1 .code")).toHaveText(code);
  await expect(other.locator(".sums-total")).toHaveText("合计$84.80");
  // …and by its code from home, typed loosely
  await other.goto("/tuan/");
  await expect(other.locator(".mine li")).toHaveCount(1);
  await other.fill('input[name="code"]', ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `);
  await other.getByRole("button", { name: "打开" }).click();
  await expect(other.locator("h1 .code")).toHaveText(code);

  // cancel: asked first; "keep it" keeps it
  await page.getByRole("button", { name: "取消订单" }).click();
  const ask = page.getByRole("dialog", { name: "取消这一单？" });
  await ask.getByRole("button", { name: "先不取消" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.locator(".chip").first()).toHaveText("待商家确认");
  await page.getByRole("button", { name: "取消订单" }).click();
  await ask.getByRole("button", { name: "取消订单" }).click();
  await expect(page.locator(".chip")).toHaveText(["已取消"]);
  await expect(page.locator(".toast")).toHaveText("取消了");
  await expect(page.getByRole("link", { name: "改订单" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消订单" })).toHaveCount(0);

  // it's off the list, and what it held is back on the shelf
  const offer = (await (await request.get(`/tuan/api/offers/${id}`)).json()) as OfferPage;
  expect(offer.roster).toEqual([]);
  expect(offer.items.find((item) => item.name === "五常大米 10kg")?.left).toBe(40_000);
  await page.getByRole("link", { name: "回到这个团" }).click();
  await expect(page.getByText("还没有人下单，你来第一单。")).toBeVisible();
});

test("something sells out while it's in the cart", async ({ browser, request }) => {
  const doc = offerDoc(Date.now() + DAY);
  const { id, url } = await start(request, { items: doc.items.map((item) => (item.name.startsWith("土鸡蛋") ? { ...item, stock: 1000 } : item)) });
  const page = await phone(browser);
  await page.goto(url);
  await expect(row(page, "土鸡蛋 30 枚").locator(".item-tag-warn")).toHaveText("还剩 1");
  await add(page, "土鸡蛋 30 枚");
  await expect(row(page, "土鸡蛋 30 枚").getByRole("button", { name: "增加 土鸡蛋 30 枚" }), "no more than is left").toBeDisabled();
  await add(page, "五常大米 10kg");
  await toCheckout(page);
  await choose(page, "本拿比");
  await page.fill('input[name="name"]', "陈太");
  await page.fill('input[name="phone"]', "236 555 0111");
  await page.fill('textarea[name="note"]', "下午来取");

  // someone else takes the last box first
  const offer = (await (await request.get(`/tuan/api/offers/${id}`)).json()) as OfferPage;
  const eggs = offer.items.find((item) => item.name.startsWith("土鸡蛋"))!;
  const theirs = await request.post(`/tuan/api/offers/${id}/orders`, { data: { key: `${word()}${word()}${word()}`, name: "王阿姨", phone: "604-555-0134", how: "pickup", pickupId: offer.points[0].id, lines: [{ itemId: eggs.id, qty: 1000 }] } });
  expect(theirs.status(), await theirs.text()).toBe(201);

  // this buyer is shown the goods again, the cart put right, and told why
  await send(page);
  await expect(page.locator(".toast")).toHaveText("有东西不够了，已经按剩下的改好，请再看一眼。");
  await expect(page.locator("form.page")).toHaveCount(0);
  await expect(row(page, "土鸡蛋 30 枚").locator(".item-tag-warn")).toHaveText("卖完了");
  await expect(row(page, "土鸡蛋 30 枚").getByRole("button")).toHaveCount(0);
  await expect(dock(page).locator(".dock-count")).toHaveText("1 件");
  await expect(dock(page).locator(".dock-total")).toHaveText("$38.00");

  // nothing typed was lost; the rest of the order goes through
  await toCheckout(page);
  await expect(page.locator('input[name="name"]')).toHaveValue("陈太");
  await expect(page.locator('textarea[name="note"]')).toHaveValue("下午来取");
  await expect(page.locator(".choice", { hasText: "本拿比" }).locator("input")).toBeChecked();
  await send(page);
  await expect(page).toHaveURL(ORDER_URL);
  await expect(page.locator(".sum-lines li")).toHaveCount(1);
  expect((await sheets(request, id)).orders.map((order) => [order.name, order.goods])).toEqual([["王阿姨", 1350], ["陈太", 3800]]);
});

test("in English, and the choice stays", async ({ browser, request }) => {
  const { url } = await start(request);
  const page = await phone(browser);
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".bar-brand")).toHaveText("Count Me In");
  // what the merchant wrote stays as written
  await expect(page.locator(".hero h1")).toHaveText("本周大米团 · 周五到货");
  await expect(page.locator(".state")).toContainText("Closes");
  await expect(page.locator(".how-chip")).toHaveText("3 pickup points · 3 delivery areas");
  await page.getByRole("button", { name: "Add one 五常大米 10kg" }).click();
  await expect(dock(page).locator(".dock-count")).toHaveText("1 item");
  await page.getByRole("button", { name: "More 五常大米 10kg" }).click();
  await expect(dock(page).locator(".dock-count")).toHaveText("2 items");
  await page.reload();
  await expect(page.locator(".bar-brand")).toHaveText("Count Me In");
  await dock(page).getByRole("button", { name: "Check out" }).click();
  await page.locator('form.page button[type="submit"]').click();
  await expect(page.locator(".problem")).toHaveText(["Choose a pickup point", "Add a name", "Add a phone number we can reach, at least 10 digits"]);
  await choose(page, "温哥华西区");
  await page.fill('input[name="name"]', "Sam");
  await page.fill('input[name="phone"]', "6045550123");
  await page.getByRole("button", { name: "Place order · $76.00" }).click();
  await expect(page).toHaveURL(ORDER_URL);
  await expect(page.locator(".placed")).toHaveText("Order placed");
  await expect(page.locator(".chip")).toHaveText(["Waiting for the merchant", "No. 1", "Not paid yet"]);
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator(".chip")).toHaveText(["待商家确认", "第 1 位", "未付款"]);
});

test("a group buy that has closed, one that isn't public yet, and addresses that are nothing", async ({ browser, request }) => {
  const { id, url } = await start(request);
  const page = await phone(browser);
  const code = await orderRice(page, url);

  const closed = await request.post(`/tuan/api/my/offers/${id}`, { headers: as(SESSION.leader), data: { do: "close" } });
  expect(closed.status()).toBe(200);
  await page.goto(url);
  await expect(page.locator(".state")).toHaveText("已截单");
  await expect(page.getByText("这个团已经截单，不再接新订单。")).toBeVisible();
  await expect(page.locator(".item")).toHaveCount(5);
  await expect(page.locator(".item button")).toHaveCount(0);
  await expect(dock(page)).toHaveCount(0);
  // the order can still be read, not changed
  await page.goto(`/tuan/o/${code}`);
  await expect(page.locator("h1 .code")).toHaveText(code);
  await expect(page.getByText("团已截单，或者这一单已经付款：要改请联系商家。")).toBeVisible();
  await expect(page.getByRole("link", { name: "改订单" })).toHaveCount(0);
  // …and its link to change it leads back to the order
  await page.goto(`${url}?change=${code}`);
  await expect(page).toHaveURL(ORDER_URL);

  const draft = await start(request, { open: false });
  for (const [path, title] of [[draft.url, "找不到这个团"], ["/tuan/t/zzzz9999", "找不到这个团"], ["/tuan/nothing", "没有这一页"], ["/tuan/o/nope", "没有这一页"]] as const) {
    const res = await page.goto(path);
    expect([path, res?.status()]).toEqual([path, 404]);
    await expect(page.locator(".empty h1")).toHaveText(title);
  }

  // the preview is home, saying it's a preview
  const res = await page.goto("/tuan/preview");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByText("预览版：还在试用，先不对外。")).toBeVisible();
  await page.goto("/tuan/");
  await expect(page.locator(".hero h1")).toHaveText("跟一单");
  await expect(page.getByText("预览版：还在试用，先不对外。")).toHaveCount(0);
});

test("on a small phone: nothing runs off the side, and everything to tap is big enough", async ({ browser, request }) => {
  const { url } = await start(request, { title: "本周大米团 · 周五到货 · 冷冻肉和米面粮油一起团", items: [...offerDoc(0).items, { section: "蛋肉", name: "手工挂面 Hand-pulled dried noodles 1kg 超长名字的商品", detail: "鸡蛋面，含麸质，名字和说明都很长的时候", price: 699, unit: "pack", stock: 3000, allergens: "小麦、蛋" }] });
  const page = await phone(browser, { viewport: { width: 320, height: 568 } });

  await page.goto("/tuan/");
  await fits(page, "home");
  await page.goto(url);
  await expect(page.locator(".item")).toHaveCount(6);
  await add(page, "五常大米 10kg");
  await add(page, "手工挂面 Hand-pulled dried noodles 1kg 超长名字的商品");
  await page.getByRole("button", { name: "选重量：手切羊肉片" }).click();
  await fits(page, "the weight picker");
  await page.getByRole("button", { name: /^加入/ }).click();
  await fits(page, "a group buy");
  await dock(page).locator(".dock-cart").click();
  await expect(page.locator(".cart-line")).toHaveCount(3);
  await fits(page, "the cart");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.locator(".how-chip").click();
  await fits(page, "pickup and delivery");
  await page.getByRole("button", { name: "关闭" }).click();
  await toCheckout(page);
  await page.getByRole("button", { name: "送货" }).click();
  await fits(page, "checkout");
  await page.getByRole("button", { name: "自提" }).click();
  await choose(page, "温哥华西区");
  await page.fill('input[name="name"]', "一个名字特别特别长的买家");
  await page.fill('input[name="phone"]', "604 555 0188");
  await send(page);
  await expect(page).toHaveURL(ORDER_URL);
  await fits(page, "an order");
  await page.getByRole("button", { name: "取消订单" }).click();
  await fits(page, "the cancel sheet");
});
