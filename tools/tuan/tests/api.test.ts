// The Worker itself, inside the Workers runtime with a local D1 (the tables are made by the Worker,
// from migrations/). The rooms server it asks about sign-ins is a stand-in (tests/rooms/worker.ts).
// Every test starts its own shop and group buy, and comes from a network of its own.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { TAIL_HEADER, type ApiError, type Made, type Moved, type MyHome, type MyOfferDoc, type MyOfferPage, type OfferPage, type OrderPage } from "../src/api";
import { makeCode } from "../src/engine/ids";
import { ORDERS_PER_PHONE } from "../src/engine/order";
import { vancouverDay } from "../src/engine/time";
import { networkOf, sha256 } from "../src/server/gate";
import type { Notice } from "../src/server/mail";
import { whoKey } from "../src/server/who";
import worker from "../src/server/worker";
import { SESSION } from "./accounts";
import { offerDoc } from "./sample";

let nth = 0;
let network = "";
beforeEach(() => {
  network = `203.0.113.${++nth}`;
});

interface Sent {
  session?: string;
  body?: unknown;
  /** the last four digits of the phone number, for a buyer's own order */
  tail?: string;
  from?: string;
  origin?: string;
  type?: string;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, sent: Sent = {}): Promise<{ status: number; data: T; headers: Headers }> {
  const headers = new Headers({ "cf-connecting-ip": sent.from ?? network });
  if (sent.session) headers.set("authorization", `Bearer ${sent.session}`);
  if (sent.tail) headers.set(TAIL_HEADER, sent.tail);
  if (sent.origin) headers.set("origin", sent.origin);
  if (sent.body !== undefined) headers.set("content-type", sent.type ?? "application/json");
  const body = sent.body === undefined ? undefined : typeof sent.body === "string" ? sent.body : JSON.stringify(sent.body);
  const res = await worker.fetch(new Request(`https://changle.ca/tuan/api${path}`, { method, headers, body }), env);
  return { status: res.status, data: (await res.json()) as T, headers: res.headers };
}
const get = <T>(path: string, sent?: Sent) => call<T>("GET", path, sent);
const post = <T>(path: string, body: unknown, sent: Sent = {}) => call<T>("POST", path, { ...sent, body });
/** The error an answer carries (with its status), or "ok". */
const said = (res: { status: number; data: unknown }) => (res.status < 400 ? "ok" : `${res.status} ${(res.data as ApiError).error}`);

const rand = () => Math.random();
const key = () => makeCode(rand, 24);
const DAY = 86_400_000;

/** A shop of its own and a group buy in it, open for a day. `item`, `point`, `rule`: their ids, by the start of their names. */
async function start(more: Record<string, unknown> = {}) {
  const slug = `rice-${makeCode(rand, 8, true)}`;
  const shop = await post<Made>("/admin/shops", { slug, name: "大米团（测试）", contact: "微信 rice-test", pay: "e-Transfer: pay@example.com\n备注订单号", members: ["leader@example.com"] }, { session: SESSION.owner });
  expect(said(shop)).toBe("ok");
  const made = await post<Made>(`/my/shops/${slug}/offers`, { ...offerDoc(Date.now() + DAY), ...more }, { session: SESSION.leader });
  expect(made.status).toBe(201);
  const id = made.data.id;
  const mine = (await get<MyOfferPage>(`/my/offers/${id}`, { session: SESSION.leader })).data;
  const by = <T extends { id: string }>(list: T[], name: (one: T) => string) => (starts: string) => {
    const one = list.find((x) => name(x).startsWith(starts));
    if (!one) throw new Error(`nothing called ${starts}`);
    return one.id;
  };
  return { slug, id, item: by(mine.items, (i) => i.name), point: by(mine.points, (p) => p.name), rule: by(mine.rules, (r) => r.label) };
}
type Started = Awaited<ReturnType<typeof start>>;

/** An order as a phone sends it: picked up in west Vancouver unless said otherwise. `lines`: [item's name, amount]. */
function order(at: Started, lines: [string, number][], more: Record<string, unknown> = {}) {
  return { key: key(), name: "王阿姨", phone: "604-555-0134", how: "pickup", pickupId: at.point("温哥华西区"), lines: lines.map(([name, qty]) => ({ itemId: at.item(name), qty })), ...more };
}
const place = (at: Started, lines: [string, number][], more: Record<string, unknown> = {}, sent: Sent = {}) => post<OrderPage>(`/offers/${at.id}/orders`, order(at, lines, more), sent);
const page = async (at: Started) => (await get<OfferPage>(`/offers/${at.id}`)).data;
const sheets = async (at: Started) => (await get<MyOfferPage>(`/my/offers/${at.id}`, { session: SESSION.leader })).data;
const leftOf = async (at: Started, name: string) => (await page(at)).items.find((i) => i.id === at.item(name))!.left;
const move = (code: string, body: unknown, session: string = SESSION.leader) => post<Moved>(`/my/orders/${code}`, body, { session });

/** What's on the shelf according to the stock column, and according to the orders themselves: the two must agree. */
async function stockAgrees(at: Started): Promise<void> {
  const rows = (
    await env.DB.prepare(
      `SELECT i.name, i.sold, COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.code = oi.order_code WHERE oi.item_id = i.id AND o.status != 'cancelled'), 0) AS held
       FROM items i WHERE i.offer_id = ?`,
    )
      .bind(at.id)
      .all<{ name: string; sold: number; held: number }>()
  ).results;
  for (const row of rows) expect(`${row.name} ${row.sold}`).toBe(`${row.name} ${row.held}`);
}

describe("a group buy from start to pickup", () => {
  it("takes three friends' orders, and the list, the shelf and the sheets match a hand count", async () => {
    const at = await start();

    const wang = await place(at, [["五常大米", 2000], ["土鸡蛋", 1000]], { wechat: "wang_ayi" });
    expect(wang.status).toBe(201);
    expect(wang.data.order).toMatchObject({ seq: 1, name: "王阿姨", tail: "0134", how: "pickup", status: "new", paid: false, goods: 8950, fee: 0, final: 8950 });
    expect(wang.data.order.code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    expect(wang.data.point).toMatchObject({ name: "温哥华西区", hours: "周五 4–7pm" });
    expect(wang.data.shop.pay).toBe("e-Transfer: pay@example.com\n备注订单号");
    expect(wang.data.mayChange).toBe(true);

    const leo = await place(at, [["五常大米", 1000], ["东北珍珠米", 1000], ["黄小米", 2000]], { name: "Leo", phone: "778 555 0199", how: "delivery", ruleId: at.rule("列治文"), address: "8888 No. 3 Rd, Richmond" });
    expect(leo.data.order).toMatchObject({ seq: 2, how: "delivery", address: "8888 No. 3 Rd, Richmond", goods: 7810, fee: 0 });
    expect(leo.data.rule).toMatchObject({ label: "列治文", fee: 500, freeFrom: 6800 });
    expect(leo.data.point).toBeNull();

    const chen = await place(at, [["手切羊肉片", 1500], ["土鸡蛋", 2000]], { name: "陈太", phone: "+1 (236) 555-0111", pickupId: at.point("大学区") });
    expect(chen.data.order).toMatchObject({ seq: 3, goods: 5249, final: null });

    // anyone with the link sees who's in, and what's left
    const open = await page(at);
    expect(open.offer.state).toBe("open");
    expect(open.roster).toEqual([
      { seq: 1, name: "王阿姨", pieces: 3 },
      { seq: 2, name: "Leo", pieces: 4 },
      { seq: 3, name: "陈太", pieces: 3 },
    ]);
    expect(open.orders).toBe(3);
    expect(open.items.map((i) => [i.name, i.left])).toEqual([["五常大米 10kg", 37_000], ["东北珍珠米 15lb", null], ["黄小米 2lb", null], ["土鸡蛋 30 枚", 7000], ["手切羊肉片", null]]);
    expect(JSON.stringify(open)).not.toMatch(/6045550134|7785550199|2365550111|No\. 3 Rd|wang_ayi/);

    // the merchant's sheets, against a hand count:
    //   rice 2 + 1 = 3 bags $114.00 · pearl rice 1 bag $22.50 · millet 2 packs $17.60 · eggs 1 + 2 = 3 boxes $40.50 · lamb 1.5 lb $25.49
    //   $89.50 + $78.10 + $52.49 = $220.09
    const mine = await sheets(at);
    expect(mine.orders.map((o) => [o.seq, o.name, o.phone, o.goods])).toEqual([[1, "王阿姨", "6045550134", 8950], [2, "Leo", "7785550199", 7810], [3, "陈太", "12365550111", 5249]]);
    expect(mine.summary.items.map((i) => [i.name, i.qty, i.orders, i.amount])).toEqual([
      ["五常大米 10kg", 3000, 2, 11400],
      ["东北珍珠米 15lb", 1000, 1, 2250],
      ["黄小米 2lb", 2000, 1, 1760],
      ["土鸡蛋 30 枚", 3000, 2, 4050],
      ["手切羊肉片", 1500, 1, 2549],
    ]);
    expect(mine.summary).toMatchObject({ orders: 3, cancelled: 0, pieces: 10, goods: 22009, fee: 0, total: 22009, paid: 0, picked: 0, unweighed: 1 });
    expect(mine.summary.places.map((p) => [p.how, p.name, p.orders, p.goods])).toEqual([["pickup", "温哥华西区", 1, 8950], ["pickup", "大学区", 1, 5249], ["delivery", "列治文", 1, 7810]]);
    expect(mine.summary.places[1].items.map((i) => [i.name, i.qty])).toEqual([["土鸡蛋 30 枚", 2000], ["手切羊肉片", 1500]]);
    await stockAgrees(at);

    // the lamb is weighed (1.62 lb, $27.52), money comes in, goods go out
    const weighed = await move(chen.data.order.code, { do: "weigh", lines: [{ itemId: at.item("手切羊肉片"), actual: 1620 }] });
    expect(weighed.data.order).toMatchObject({ goods: 5249, final: 2752 + 2700 });
    expect((await move(wang.data.order.code, { do: "confirm" })).data.order.status).toBe("confirmed");
    expect((await move(wang.data.order.code, { do: "paid", on: true })).data.order.paidAt).toBeTypeOf("number");
    expect((await move(chen.data.order.code, { do: "paid", on: true })).data.order.paidAt).toBeTypeOf("number");
    expect((await move(wang.data.order.code, { do: "picked", on: true })).data.order.pickedAt).toBeTypeOf("number");
    const after = (await sheets(at)).summary;
    expect(after).toMatchObject({ orders: 3, goods: 22009, paid: 2, paidTotal: 8950 + 5452, picked: 1, unweighed: 0 });
    expect(after.items.find((i) => i.name === "手切羊肉片")).toMatchObject({ qty: 1500, actual: 1620 });

    // the buyer sees the same on their own page
    const seen = await get<OrderPage>(`/orders/${chen.data.order.code}`, { tail: "0111" });
    expect(seen.data.order).toMatchObject({ paid: true, picked: false, final: 5452 });
    expect(seen.data.order.lines.find((l) => l.unit === "lb")).toMatchObject({ qty: 1500, actual: 1620, amount: 2549 });
    expect(seen.data.mayChange).toBe(false);
  });

  it("makes one order of the same order sent twice", async () => {
    const at = await start();
    const sent = order(at, [["土鸡蛋", 2000]]);
    const first = await post<OrderPage>(`/offers/${at.id}/orders`, sent);
    const again = await post<OrderPage>(`/offers/${at.id}/orders`, sent);
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.data.order.code).toBe(first.data.order.code);
    // even when both arrive at the same moment
    const twin = order(at, [["土鸡蛋", 1000]], { phone: "604-555-0177" });
    const both = await Promise.all([post<OrderPage>(`/offers/${at.id}/orders`, twin), post<OrderPage>(`/offers/${at.id}/orders`, twin)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(both[0].data.order.code).toBe(both[1].data.order.code);
    expect((await page(at)).orders).toBe(2);
    expect(await leftOf(at, "土鸡蛋")).toBe(7000);
    await stockAgrees(at);
  });
});

describe("what an order may hold", () => {
  it("never sells more than there is", async () => {
    const at = await start();
    expect(said(await place(at, [["土鸡蛋", 9000]]))).toBe("ok");
    const over = await place(at, [["土鸡蛋", 2000], ["五常大米", 1000]], { phone: "604-555-0177" });
    expect(over.status).toBe(409);
    expect(over.data).toEqual({ error: "soldout", items: [{ id: at.item("土鸡蛋"), left: 1000 }] });
    expect(await leftOf(at, "五常大米")).toBe(40_000); // nothing of a refused order is kept
    expect(said(await place(at, [["土鸡蛋", 1000]], { phone: "604-555-0177" }))).toBe("ok");
    expect(await leftOf(at, "土鸡蛋")).toBe(0);
    expect(said(await place(at, [["土鸡蛋", 1000]], { phone: "604-555-0188" }))).toBe("409 soldout");
    await stockAgrees(at);
  });

  it("gives the last one to one of two buyers who reach for it together", async () => {
    const at = await start();
    await place(at, [["土鸡蛋", 9000]]);
    const two = await Promise.all([place(at, [["土鸡蛋", 1000]], { phone: "604-555-0177" }), place(at, [["土鸡蛋", 1000]], { phone: "604-555-0188" })]);
    expect(two.map(said).sort()).toEqual(["409 soldout", "ok"]);
    expect(await leftOf(at, "土鸡蛋")).toBe(0);
    await stockAgrees(at);
  });

  it("holds one phone number to the limit across its orders, however the number is typed", async () => {
    const at = await start();
    expect(said(await place(at, [["黄小米", 1000]], { phone: "(604) 555-0134" }))).toBe("ok");
    const more = await place(at, [["黄小米", 2000]], { phone: "+1 604 555 0134" });
    expect(more.data).toEqual({ error: "perbuyer", items: [{ id: at.item("黄小米"), left: 1000 }] });
    expect(said(await place(at, [["黄小米", 1000]], { phone: "16045550134" }))).toBe("ok");
    expect(said(await place(at, [["黄小米", 1000]], { phone: "6045550134" }))).toBe("409 perbuyer");
    // another number has its own two
    expect(said(await place(at, [["黄小米", 2000]], { phone: "604-555-0177" }))).toBe("ok");
  });

  it("stops one phone number at five orders in a group buy", async () => {
    const at = await start();
    for (let n = 0; n < ORDERS_PER_PHONE; n++) expect(said(await place(at, [["东北珍珠米", 1000]]))).toBe("ok");
    expect(said(await place(at, [["东北珍珠米", 1000]]))).toBe("409 many");
    expect(said(await place(at, [["东北珍珠米", 1000]], { phone: "604-555-0177" }))).toBe("ok");
  });

  it("delivers only from the area's minimum up", async () => {
    const at = await start();
    const lines: [string, number][] = [["五常大米", 2000], ["土鸡蛋", 1000]]; // $89.50
    const vancouver = await place(at, lines, { how: "delivery", ruleId: at.rule("温哥华"), address: "2100 W 4th Ave" });
    expect(vancouver.status).toBe(400);
    expect(vancouver.data).toEqual({ error: "min", min: 9800 });
    // Richmond has no minimum: $5 under $68 of goods, free from there
    const richmond = await place(at, lines, { how: "delivery", ruleId: at.rule("列治文"), address: "8888 No. 3 Rd" });
    expect(richmond.data.order).toMatchObject({ goods: 8950, fee: 0, final: 8950 });
    const small = await place(at, [["五常大米", 1000]], { phone: "604-555-0177", how: "delivery", ruleId: at.rule("列治文"), address: "8888 No. 3 Rd" });
    expect(small.data.order).toMatchObject({ goods: 3800, fee: 500, final: 4300 });
    // a change is charged anew: two more bags take it past the mark
    const more = await post<OrderPage>(`/orders/${small.data.order.code}`, order(at, [["五常大米", 3000]], { how: "delivery", ruleId: at.rule("列治文"), address: "8888 No. 3 Rd" }), { tail: "0177" });
    expect(more.data.order).toMatchObject({ goods: 11400, fee: 0, final: 11400 });
    expect((await sheets(at)).summary).toMatchObject({ goods: 8950 + 11400, fee: 0 });
    expect(said(await place(at, lines, { how: "delivery", ruleId: at.rule("列治文") }))).toBe("400 address");
    expect(said(await place(at, lines, { how: "delivery", ruleId: at.point("本拿比"), address: "x" }))).toBe("400 how");
  });

  it("refuses what isn't an order", async () => {
    const at = await start();
    expect(said(await place(at, [["五常大米", 1000]], { key: "short" }))).toBe("400 bad");
    expect(said(await place(at, [["五常大米", 1000]], { name: "" }))).toBe("400 name");
    expect(said(await place(at, [["五常大米", 1000]], { phone: "555-0134" }))).toBe("400 phone");
    expect(said(await place(at, []))).toBe("400 empty");
    expect(said(await place(at, [["五常大米", 1500]]))).toBe("400 qty");
    expect(said(await place(at, [["手切羊肉片", 500]]))).toBe("400 qty"); // no less than a pound
    expect(said(await post(`/offers/${at.id}/orders`, { ...order(at, [["五常大米", 1000]]), lines: [{ itemId: "nothing", qty: 1000 }] }))).toBe("400 item");
    expect(said(await post(`/offers/${at.id}/orders`, "not json"))).toBe("400 bad");
    expect(said(await post(`/offers/${at.id}/orders`, JSON.stringify(order(at, [["五常大米", 1000]])), { type: "text/plain" }))).toBe("400 bad");
    expect(said(await post(`/offers/${at.id}/orders`, { ...order(at, [["五常大米", 1000]]), note: "x".repeat(20_000) }))).toBe("400 bad");
    expect(said(await post("/offers/zzzz9999/orders", order(at, [["五常大米", 1000]])))).toBe("404 notfound");
    expect((await page(at)).orders).toBe(0);
  });
});

describe("a buyer's own order", () => {
  it("opens with its code and the end of the phone number, and with nothing less", async () => {
    const at = await start();
    const placed = await place(at, [["五常大米", 1000]]);
    const code = placed.data.order.code;
    const mine = await get<OrderPage>(`/orders/${code}`, { tail: "0134" });
    expect(mine.status).toBe(200);
    expect(mine.data.order).toEqual(placed.data.order);
    expect(mine.data.offer).toMatchObject({ id: at.id, title: "本周大米团 · 周五到货", state: "open" });
    // as typed from a text message: lower case, a space in the middle
    expect(said(await get(`/orders/${code.slice(0, 3).toLowerCase()}%20${code.slice(3).toLowerCase()}`, { tail: "0134" }))).toBe("ok");
    // a wrong number and a code that was never given out get the same answer
    const wrong = await get<ApiError>(`/orders/${code}`, { tail: "9999" });
    const never = await get<ApiError>("/orders/ZZZZZZ", { tail: "0134" });
    expect([wrong.status, wrong.data]).toEqual([404, { error: "notfound" }]);
    expect([never.status, never.data]).toEqual([404, { error: "notfound" }]);
    expect(said(await get(`/orders/${code}`))).toBe("404 notfound");
    expect(said(await get(`/orders/${code}`, { tail: "134" }))).toBe("404 notfound");
    // a merchant's sign-in doesn't open it either: the merchant has their own view
    expect(said(await get(`/orders/${code}`, { session: SESSION.leader }))).toBe("404 notfound");
  });

  it("stops answering a network that keeps guessing", async () => {
    const at = await start();
    const code = (await place(at, [["五常大米", 1000]])).data.order.code;
    const guesser = "198.51.100.7";
    await env.DB.prepare("INSERT INTO gates (key, day, used) VALUES (?, ?, 29)")
      .bind(`find:${await networkOf(new Request("https://changle.ca/", { headers: { "cf-connecting-ip": guesser } }))}`, vancouverDay(Date.now()))
      .run();
    expect(said(await get(`/orders/${code}`, { tail: "0134", from: guesser }))).toBe("ok"); // 29 wrong tries so far
    expect(said(await get(`/orders/${code}`, { tail: "0000", from: guesser }))).toBe("404 notfound"); // the 30th
    expect(said(await get(`/orders/${code}`, { tail: "0134", from: guesser }))).toBe("429 limit");
    expect(said(await get(`/orders/${code}`, { tail: "0134" }))).toBe("ok"); // the buyer, at home
  });

  it("locks an order for the day after thirty wrong tries from anywhere", async () => {
    const at = await start();
    const code = (await place(at, [["五常大米", 1000]])).data.order.code;
    for (let n = 0; n < 30; n++) expect(said(await get(`/orders/${code}`, { tail: String(1000 + n), from: `198.51.100.${100 + n}` }))).toBe("404 notfound");
    expect(said(await get(`/orders/${code}`, { tail: "0134" }))).toBe("429 locked");
    expect(said(await post(`/orders/${code}/cancel`, {}, { tail: "0134" }))).toBe("429 locked");
    // the merchant still sees it
    expect((await sheets(at)).orders.map((o) => o.code)).toEqual([code]);
  });

  it("can be changed while the group buy is open, and the shelf follows", async () => {
    const at = await start();
    const placed = await place(at, [["土鸡蛋", 2000], ["五常大米", 1000]], { note: "下午来拿" });
    const code = placed.data.order.code;
    await move(code, { do: "confirm" });

    const changed = await post<OrderPage>(`/orders/${code}`, order(at, [["土鸡蛋", 3000], ["手切羊肉片", 1000]], { name: "王阿姨（改）", phone: "604-555-9999", pickupId: at.point("本拿比") }), { tail: "0134" });
    expect(changed.status).toBe(200);
    expect(changed.data.order).toMatchObject({ code, seq: 1, name: "王阿姨（改）", tail: "0134", note: "", status: "new", goods: 4050 + 1699, final: null });
    expect(changed.data.order.lines.map((l) => [l.name, l.qty])).toEqual([["土鸡蛋 30 枚", 3000], ["手切羊肉片", 1000]]);
    expect(changed.data.point).toMatchObject({ name: "本拿比" });
    expect(changed.data.order.updatedAt).toBeGreaterThanOrEqual(placed.data.order.updatedAt);
    expect(await leftOf(at, "土鸡蛋")).toBe(7000);
    expect(await leftOf(at, "五常大米")).toBe(40_000);
    expect((await page(at)).roster).toEqual([{ seq: 1, name: "王阿姨（改）", pieces: 4 }]);
    // the phone number it was placed with still opens it; the one typed into the change doesn't
    expect(said(await get(`/orders/${code}`, { tail: "9999" }))).toBe("404 notfound");
    await stockAgrees(at);
  });

  it("is changed against the shelf without itself, and within the limits", async () => {
    const at = await start();
    const code = (await place(at, [["土鸡蛋", 4000], ["黄小米", 2000]])).data.order.code;
    await place(at, [["土鸡蛋", 6000]], { phone: "604-555-0177" }); // the rest of the eggs
    // keeping its own four is fine; a fifth isn't there
    expect(said(await post(`/orders/${code}`, order(at, [["土鸡蛋", 4000], ["黄小米", 1000]]), { tail: "0134" }))).toBe("ok");
    const fifth = await post<ApiError>(`/orders/${code}`, order(at, [["土鸡蛋", 5000]]), { tail: "0134" });
    expect(fifth.data).toEqual({ error: "soldout", items: [{ id: at.item("土鸡蛋"), left: 4000 }] });
    // its own millet doesn't count against it twice
    expect(said(await post(`/orders/${code}`, order(at, [["黄小米", 2000]]), { tail: "0134" }))).toBe("ok");
    expect(said(await post(`/orders/${code}`, order(at, [["黄小米", 3000]]), { tail: "0134" }))).toBe("409 perbuyer");
    expect(said(await post(`/orders/${code}`, order(at, []), { tail: "0134" }))).toBe("400 empty");
    expect(await leftOf(at, "土鸡蛋")).toBe(4000);
    await stockAgrees(at);
  });

  it("can be cancelled, which puts everything back", async () => {
    const at = await start();
    const first = (await place(at, [["土鸡蛋", 2000]])).data.order.code;
    await place(at, [["土鸡蛋", 1000]], { name: "Leo", phone: "778-555-0199" });
    const gone = await post<OrderPage>(`/orders/${first}/cancel`, {}, { tail: "0134" });
    expect(gone.data.order.status).toBe("cancelled");
    expect(gone.data.mayChange).toBe(false);
    expect(await leftOf(at, "土鸡蛋")).toBe(9000);
    expect((await page(at)).roster).toEqual([{ seq: 2, name: "Leo", pieces: 1 }]);
    // cancelling twice changes nothing; a cancelled order isn't changed any more
    expect((await post<OrderPage>(`/orders/${first}/cancel`, {}, { tail: "0134" })).data.order.status).toBe("cancelled");
    expect(said(await post(`/orders/${first}`, order(at, [["土鸡蛋", 1000]]), { tail: "0134" }))).toBe("409 cancelled");
    expect(await leftOf(at, "土鸡蛋")).toBe(9000);
    // its place in the list isn't handed to the next order
    expect((await place(at, [["五常大米", 1000]], { name: "陈太", phone: "236-555-0111" })).data.order.seq).toBe(3);
    expect((await sheets(at)).summary).toMatchObject({ orders: 2, cancelled: 1 });
    await stockAgrees(at);
  });

  it("is the merchant's to change once it's paid for or handed over", async () => {
    const at = await start();
    const code = (await place(at, [["五常大米", 1000]])).data.order.code;
    await move(code, { do: "paid", on: true });
    expect(said(await post(`/orders/${code}`, order(at, [["五常大米", 2000]]), { tail: "0134" }))).toBe("409 paid");
    expect(said(await post(`/orders/${code}/cancel`, {}, { tail: "0134" }))).toBe("409 paid");
    await move(code, { do: "paid", on: false });
    expect(said(await post(`/orders/${code}`, order(at, [["五常大米", 2000]]), { tail: "0134" }))).toBe("ok");
    await move(code, { do: "picked", on: true });
    expect(said(await post(`/orders/${code}/cancel`, {}, { tail: "0134" }))).toBe("409 paid");
  });
});

describe("opening and closing", () => {
  it("takes no orders and no changes once the merchant closes it, until it's opened again", async () => {
    const at = await start();
    const code = (await place(at, [["五常大米", 1000]])).data.order.code;
    const closed = await post<MyOfferPage>(`/my/offers/${at.id}`, { do: "close" }, { session: SESSION.leader });
    expect(closed.data.offer.status).toBe("closed");
    expect((await page(at)).offer.state).toBe("closed");
    expect(said(await place(at, [["五常大米", 1000]], { phone: "604-555-0177" }))).toBe("409 closed");
    expect(said(await post(`/orders/${code}`, order(at, [["五常大米", 2000]]), { tail: "0134" }))).toBe("409 closed");
    expect(said(await post(`/orders/${code}/cancel`, {}, { tail: "0134" }))).toBe("409 closed");
    expect((await get<OrderPage>(`/orders/${code}`, { tail: "0134" })).data.mayChange).toBe(false);
    // the merchant can still cancel it for the buyer
    expect((await move(code, { do: "cancel" })).data.order.status).toBe("cancelled");
    await post(`/my/offers/${at.id}`, { do: "open" }, { session: SESSION.leader });
    expect(said(await place(at, [["五常大米", 1000]], { phone: "604-555-0177" }))).toBe("ok");
    expect(said(await post(`/my/offers/${at.id}`, { do: "delete" }, { session: SESSION.leader }))).toBe("400 bad");
  });

  it("closes by the clock", async () => {
    const at = await start();
    const code = (await place(at, [["五常大米", 1000]])).data.order.code;
    await env.DB.prepare("UPDATE offers SET closes_at = ? WHERE id = ?").bind(Date.now() - 1000, at.id).run();
    expect((await page(at)).offer.state).toBe("closed");
    expect(said(await place(at, [["五常大米", 1000]], { phone: "604-555-0177" }))).toBe("409 closed");
    expect(said(await post(`/orders/${code}/cancel`, {}, { tail: "0134" }))).toBe("409 closed");
    expect((await sheets(at)).summary.orders).toBe(1);
  });

  it("keeps a draft to its merchant until it's opened", async () => {
    const at = await start({ open: false });
    expect(said(await get(`/offers/${at.id}`))).toBe("404 notfound");
    expect(said(await place(at, [["五常大米", 1000]]))).toBe("404 notfound");
    expect((await sheets(at)).offer.status).toBe("draft");
    await post(`/my/offers/${at.id}`, { do: "open" }, { session: SESSION.leader });
    expect((await page(at)).offer.state).toBe("open");
    expect(said(await place(at, [["五常大米", 1000]]))).toBe("ok");
  });

  it("shows a shop that isn't taking orders as paused", async () => {
    const at = await start();
    await post("/admin/shops", { slug: at.slug, name: "大米团（测试）", status: "paused", members: ["leader@example.com"] }, { session: SESSION.owner });
    expect((await page(at)).offer.state).toBe("paused");
    expect(said(await place(at, [["五常大米", 1000]]))).toBe("409 closed");
  });

  it("stops at five hundred orders", async () => {
    const at = await start();
    await place(at, [["东北珍珠米", 1000]]);
    await env.DB.prepare("UPDATE orders SET seq = 500 WHERE offer_id = ?").bind(at.id).run();
    expect(said(await place(at, [["东北珍珠米", 1000]], { phone: "604-555-0177" }))).toBe("409 full");
  });

  it("refuses a group buy that can't be one", async () => {
    const at = await start();
    const send = (more: Record<string, unknown>) => post<ApiError>(`/my/shops/${at.slug}/offers`, { ...offerDoc(Date.now() + DAY), ...more }, { session: SESSION.leader });
    expect(said(await send({ title: "" }))).toBe("400 title");
    expect(said(await send({ closesAt: Date.now() - 1 }))).toBe("400 closes");
    expect((await send({ items: [{ name: "米", price: 100 }, { name: "肉", price: 1.5 }] })).data).toEqual({ error: "item", at: 1 });
    expect(said(await send({ points: [], rules: [] }))).toBe("400 places");
    expect(said(await post("/my/shops/no-such-shop/offers", offerDoc(Date.now() + DAY), { session: SESSION.leader }))).toBe("404 notfound");
  });
});

describe("changing a group buy", () => {
  const docOf = async (at: Started, session: string = SESSION.leader) => get<MyOfferDoc>(`/my/offers/${at.id}/doc`, { session });
  const save = (at: Started, doc: unknown, session: string = SESSION.leader) => post<MyOfferDoc & ApiError>(`/my/offers/${at.id}/doc`, doc, { session });
  /** The document as the editor sends it back: what it read, the group buy's own fields on top. */
  const asSent = ({ offer, items, points, rules }: MyOfferDoc) => ({ title: offer.title, note: offer.note, closesAt: offer.closesAt, roster: offer.roster, items, points, rules });

  it("gives the merchant its document, each part under its id, and says which parts orders name", async () => {
    const at = await start();
    await place(at, [["五常大米", 2000]]);
    await place(at, [["土鸡蛋", 1000]], { phone: "604-555-0177", how: "delivery", pickupId: undefined, ruleId: at.rule("列治文"), address: "8888 No. 3 Rd" });
    const doc = (await docOf(at)).data;
    expect(doc.shop).toEqual({ slug: at.slug, name: "大米团（测试）" });
    expect(doc.offer).toMatchObject({ id: at.id, status: "open", title: "本周大米团 · 周五到货", roster: "names" });
    expect(doc.items.map((i) => [i.name, i.used, i.sold])).toEqual([["五常大米 10kg", true, 2000], ["东北珍珠米 15lb", false, 0], ["黄小米 2lb", false, 0], ["土鸡蛋 30 枚", true, 1000], ["手切羊肉片", false, 0]]);
    expect(doc.items[0]).toMatchObject({ id: at.item("五常大米"), section: "米面", detail: "当季新米", price: 3800, unit: "bag", step: 1000, least: 1000, stock: 40_000, perBuyer: null });
    expect(doc.items[0]).not.toHaveProperty("photo");
    expect(doc.points.map((p) => [p.name, p.used])).toEqual([["温哥华西区", true], ["大学区", false], ["本拿比", false]]);
    expect(doc.rules.map((r) => [r.label, r.used])).toEqual([["温哥华（Downtown 除外）", false], ["本拿比", false], ["列治文", true]]);
    // reading it tells the merchant nothing about orders, so the mail still goes
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE offer_id = ? AND noticed = 0").bind(at.id).first<{ n: number }>())?.n).toBeGreaterThan(0);
  });

  it("changes a group buy that has orders where it stands: prices, limits, words, a new item, a new place", async () => {
    const at = await start();
    const first = (await place(at, [["五常大米", 2000], ["手切羊肉片", 1500]])).data.order;
    const doc = (await docOf(at)).data;
    const sent = asSent(doc);
    sent.title = "本周大米团 · 改到周六到货";
    sent.note = "周四晚上截单。";
    sent.closesAt = doc.offer.closesAt + DAY;
    sent.roster = "anon";
    sent.items = [
      { ...doc.items[4], price: 1799, detail: "按磅称重，肥瘦相间" }, // the lamb goes first, and costs more
      { ...doc.items[0], stock: 3000, perBuyer: 3000 }, // the rice: three bags left to sell in all
      doc.items[3],
      { section: "蛋肉", name: "走地鸡 一只", price: 2600, unit: "each", stock: 5000 } as never, // new
    ]; // …and the two nobody ordered are gone
    sent.points = [{ ...doc.points[0], hours: "周六 4–7pm" }, { name: "列治文", address: "时代坊附近", hours: "周六 2–4pm" } as never];
    sent.rules = [{ ...doc.rules[2], fee: 600, freeFrom: 8800 }];
    const saved = await save(at, sent);
    expect(said(saved)).toBe("ok");

    const now = await page(at);
    expect(now.offer).toMatchObject({ title: "本周大米团 · 改到周六到货", note: "周四晚上截单。", closesAt: doc.offer.closesAt + DAY, roster: "anon", state: "open" });
    expect(now.items.map((i) => [i.name, i.price, i.left])).toEqual([["手切羊肉片", 1799, null], ["五常大米 10kg", 3800, 1000], ["土鸡蛋 30 枚", 1350, 10_000], ["走地鸡 一只", 2600, 5000]]);
    // the parts that stayed are the same parts: the order still names them
    expect(now.items[0].id).toBe(at.item("手切羊肉片"));
    expect(now.items[1].id).toBe(at.item("五常大米"));
    expect(now.points.map((p) => [p.id === at.point("温哥华西区"), p.name, p.hours])).toEqual([[true, "温哥华西区", "周六 4–7pm"], [false, "列治文", "周六 2–4pm"]]);
    expect(now.rules).toEqual([{ id: at.rule("列治文"), label: "列治文", min: 0, fee: 600, freeFrom: 8800, hours: "每天 6–9pm" }]);
    expect(now.roster).toEqual([{ seq: 1, name: null, pieces: 3 }]);
    // the order keeps what it was placed at; the new price is for what comes next
    const mine = (await get<OrderPage>(`/orders/${first.code}`, { tail: "0134" })).data;
    expect(mine.order.lines.map((l) => [l.name, l.price, l.qty])).toEqual([["五常大米 10kg", 3800, 2000], ["手切羊肉片", 1699, 1500]]);
    expect(mine.point?.hours).toBe("周六 4–7pm");
    const next = await post<OrderPage>(`/offers/${at.id}/orders`, { key: key(), name: "Leo", phone: "604-555-0177", how: "pickup", pickupId: now.points[1].id, lines: [{ itemId: now.items[0].id, qty: 1000 }, { itemId: now.items[3].id, qty: 1000 }] });
    expect(next.data.order.goods).toBe(1799 + 2600);
    // the answer is the document as it now stands
    expect(saved.data.items.map((i) => [i.name, i.used])).toEqual([["手切羊肉片", true], ["五常大米 10kg", true], ["土鸡蛋 30 枚", false], ["走地鸡 一只", false]]);
    // and the sheets still add up
    const all = await sheets(at);
    expect(all.summary.items.map((i) => [i.name, i.qty])).toEqual([["手切羊肉片", 2500], ["五常大米 10kg", 2000], ["走地鸡 一只", 1000]]);
  });

  it("keeps what an order names: it can't go, its unit can't change, its limit can't drop below what's ordered", async () => {
    const at = await start();
    await place(at, [["五常大米", 2000]]);
    const doc = (await docOf(at)).data;
    const sent = () => asSent(doc);
    const without = (name: string) => doc.items.filter((i) => !i.name.startsWith(name));
    expect(said(await save(at, { ...sent(), items: without("五常大米") }))).toBe("409 inuse");
    expect(said(await save(at, { ...sent(), points: doc.points.slice(1) }))).toBe("409 inuse");
    expect((await save(at, { ...sent(), items: doc.items.map((i) => (i.used ? { ...i, unit: "box" } : i)) })).data).toEqual({ error: "item", at: 0 });
    expect((await save(at, { ...sent(), items: doc.items.map((i) => (i.used ? { ...i, stock: 1000 } : i)) })).data).toEqual({ error: "sold", at: 0 });
    // down to exactly what's ordered is fine: it's sold out from here on
    expect(said(await save(at, { ...sent(), items: doc.items.map((i) => (i.used ? { ...i, stock: 2000 } : i)) }))).toBe("ok");
    expect((await page(at)).items[0].left).toBe(0);
    expect(said(await place(at, [["五常大米", 1000]], { phone: "604-555-0177" }))).toBe("409 soldout");
    // what nobody ordered can go, and a cancelled order still holds on to what it held
    expect(said(await save(at, { ...sent(), items: without("东北珍珠米") }))).toBe("ok");
    const order = (await sheets(at)).orders[0];
    await post(`/my/orders/${order.code}`, { do: "cancel" }, { session: SESSION.leader });
    expect(said(await save(at, { ...sent(), items: without("东北珍珠米").filter((i) => !i.used) }))).toBe("409 inuse");
    // nothing of a refused change is kept
    expect((await page(at)).items.map((i) => i.name)).toEqual(["五常大米 10kg", "黄小米 2lb", "土鸡蛋 30 枚", "手切羊肉片"]);
  });

  it("refuses a document that is behind the group buy, or isn't one", async () => {
    const at = await start();
    const doc = (await docOf(at)).data;
    const sent = asSent(doc);
    // the same part twice, a part of another group buy, a part that has gone since it was read
    expect(said(await save(at, { ...sent, items: [...doc.items, doc.items[0]] }))).toBe("409 busy");
    const other = await start();
    const theirs = (await docOf(other)).data;
    expect(said(await save(at, { ...sent, items: [...doc.items, theirs.items[0]] }))).toBe("409 busy");
    expect((await page(other)).items).toHaveLength(5);
    expect(said(await save(at, { ...sent, items: doc.items.slice(1) }))).toBe("ok");
    expect(said(await save(at, sent))).toBe("409 busy");
    // the same checks as for a new one
    const now = asSent((await docOf(at)).data);
    expect(said(await save(at, { ...now, title: " " }))).toBe("400 title");
    expect(said(await save(at, { ...now, closesAt: Date.now() - 1 }))).toBe("400 closes");
    expect((await save(at, { ...now, items: [now.items[0], { name: "肉", price: -1 }] })).data).toEqual({ error: "item", at: 1 });
    expect(said(await save(at, { ...now, items: [] }))).toBe("400 items");
    expect(said(await save(at, { ...now, points: [], rules: [] }))).toBe("400 places");
    expect(said(await save(at, "not a document"))).toBe("400 bad");
    expect(said(await post(`/my/offers/zzzz9999/doc`, now, { session: SESSION.leader }))).toBe("404 notfound");
  });

  it("opens a draft with the change that says so, and not otherwise; a closing time left alone may have passed", async () => {
    const at = await start({ open: false });
    const doc = (await docOf(at)).data;
    expect(doc.offer.status).toBe("draft");
    // a draft is its merchant's to rewrite from top to bottom
    const sent = { ...asSent(doc), title: "草稿改了名", items: [{ section: "", name: "只卖这一样", price: 500, unit: "each" }], points: [{ name: "只在这里取" }], rules: [] };
    expect((await save(at, sent)).data.offer).toMatchObject({ status: "draft", title: "草稿改了名" });
    expect(said(await get(`/offers/${at.id}`))).toBe("404 notfound");
    const again = asSent((await docOf(at)).data);
    expect((await save(at, { ...again, open: false })).data.offer.status).toBe("draft");
    expect((await save(at, { ...again, open: true })).data.offer.status).toBe("open");
    expect((await page(at)).items.map((i) => i.name)).toEqual(["只卖这一样"]);
    // open stays open, and closed stays closed, whatever the document says
    expect((await save(at, { ...again, open: false })).data.offer.status).toBe("open");
    await post(`/my/offers/${at.id}`, { do: "close" }, { session: SESSION.leader });
    expect((await save(at, { ...again, open: true })).data.offer.status).toBe("closed");
    // past its time: the words can still be put right, and a new time has to be ahead
    await post(`/my/offers/${at.id}`, { do: "open" }, { session: SESSION.leader });
    const past = Date.now() - DAY;
    await env.DB.prepare("UPDATE offers SET closes_at = ? WHERE id = ?").bind(past, at.id).run();
    expect((await save(at, { ...again, closesAt: past, note: "下周再开。" })).data.offer).toMatchObject({ closesAt: past, note: "下周再开。" });
    expect((await page(at)).offer.state).toBe("closed");
    expect(said(await save(at, { ...again, closesAt: past + 1 }))).toBe("400 closes");
    expect(said(await save(at, { ...again, closesAt: Date.now() + DAY }))).toBe("ok");
    expect((await page(at)).offer.state).toBe("open");
  });

  it("is for those who run the shop, and the site's owner", async () => {
    const at = await start();
    const doc = (await docOf(at)).data;
    expect(said(await get(`/my/offers/${at.id}/doc`))).toBe("401 signin");
    expect(said(await docOf(at, SESSION.visitor))).toBe("403 forbidden");
    expect(said(await save(at, asSent(doc), SESSION.visitor))).toBe("403 forbidden");
    expect(said(await docOf(at, SESSION.owner))).toBe("ok");
    expect(said(await save(at, { ...asSent(doc), title: "站长改的" }, SESSION.owner))).toBe("ok");
    expect((await page(at)).offer.title).toBe("站长改的");
    // from another site's page, never
    expect(said(await post(`/my/offers/${at.id}/doc`, asSent(doc), { session: SESSION.leader, origin: "https://elsewhere.example" }))).toBe("403 forbidden");
  });

  it("gives way to an order that arrives while the change is on its way", async () => {
    const at = await start();
    const doc = (await docOf(at)).data;
    // read, then someone orders the eggs, then the change that drops the eggs arrives: as the tables see it
    const { saveEdit } = await import("../src/server/store");
    await place(at, [["土鸡蛋", 1000]]);
    const plan = { title: doc.offer.title, note: doc.offer.note, closesAt: doc.offer.closesAt, roster: doc.offer.roster, publish: false, items: [], points: [], rules: [], gone: { items: [at.item("土鸡蛋")], points: [], rules: [] } };
    expect(await saveEdit(env.DB, at.id, plan, () => makeCode(rand, 10, true))).toBe(false);
    expect((await page(at)).items).toHaveLength(5);
    // …and a limit set below what has just been ordered
    const eggs = doc.items.find((i) => i.name.startsWith("土鸡蛋"))!;
    const low = { ...plan, gone: { items: [], points: [], rules: [] }, items: [{ ...eggs, photo: null, stock: 0 }] };
    expect(await saveEdit(env.DB, at.id, low, () => makeCode(rand, 10, true))).toBe(false);
    expect((await page(at)).items.find((i) => i.name.startsWith("土鸡蛋"))?.left).toBe(9000);
  });
});

describe("who may do what", () => {
  it("shows a group buy's orders only to those who run its shop, and to the site's owner", async () => {
    const at = await start();
    await place(at, [["五常大米", 1000]]);
    expect(said(await get(`/my/offers/${at.id}`))).toBe("401 signin");
    expect(said(await get(`/my/offers/${at.id}`, { session: "not a session" }))).toBe("401 signin");
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.nobody }))).toBe("401 signin");
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.down }))).toBe("503 down");
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.visitor }))).toBe("403 forbidden");
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.leader }))).toBe("ok");
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.owner }))).toBe("ok");
    expect(said(await get("/my/offers/zzzz9999", { session: SESSION.leader }))).toBe("404 notfound");
  });

  it("lets only them start a group buy, open or close it, and mark its orders", async () => {
    const at = await start();
    const code = (await place(at, [["五常大米", 1000]])).data.order.code;
    expect(said(await post(`/my/shops/${at.slug}/offers`, offerDoc(Date.now() + DAY), { session: SESSION.visitor }))).toBe("403 forbidden");
    expect(said(await post(`/my/offers/${at.id}`, { do: "close" }, { session: SESSION.visitor }))).toBe("403 forbidden");
    // (an order that isn't theirs and one that doesn't exist look the same)
    expect(said(await move(code, { do: "paid", on: true }, SESSION.visitor))).toBe("404 notfound");
    expect(said(await post(`/my/orders/${code}`, { do: "paid", on: true }))).toBe("401 signin");
    expect(said(await move(code, { do: "paid", on: true }, SESSION.owner))).toBe("ok");
    expect((await sheets(at)).offer.status).toBe("open");
  });

  it("lets only the site's owner set shops up, and a change of hands takes the old hands off", async () => {
    const at = await start();
    const shop = { slug: at.slug, name: "大米团（换人）", members: ["visitor@example.com"] };
    expect(said(await post("/admin/shops", shop))).toBe("401 signin");
    expect(said(await post("/admin/shops", shop, { session: SESSION.leader }))).toBe("403 forbidden");
    expect(said(await post("/admin/shops", { ...shop, slug: "Not A Slug" }, { session: SESSION.owner }))).toBe("400 slug");
    expect(said(await post("/admin/shops", { ...shop, members: [] }, { session: SESSION.owner }))).toBe("400 members");
    expect(said(await post("/admin/shops", shop, { session: SESSION.owner }))).toBe("ok");
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.leader }))).toBe("403 forbidden");
    expect((await get<MyOfferPage>(`/my/offers/${at.id}`, { session: SESSION.visitor })).data.shop.name).toBe("大米团（换人）");
    expect(said(await get("/admin/shops", { session: SESSION.owner }))).toBe("404 notfound");
  });

  it("shows a merchant their shops and group buys, with what's come in", async () => {
    const at = await start();
    await place(at, [["五常大米", 2000]]);
    const code = (await place(at, [["土鸡蛋", 1000]], { phone: "604-555-0177" })).data.order.code;
    await place(at, [["土鸡蛋", 1000]], { phone: "604-555-0188" });
    await move(code, { do: "confirm" });
    await post(`/orders/${code}/cancel`, {}, { tail: "0177" });

    const home = (await get<MyHome>("/my", { session: SESSION.leader })).data;
    expect(home.me).toEqual({ name: "团长", email: "leader@example.com", owner: false });
    const shop = home.shops.find((s) => s.slug === at.slug)!;
    expect(shop).toMatchObject({ name: "大米团（测试）", kind: "leader", status: "live" });
    expect(shop.offers).toEqual([{ id: at.id, title: "本周大米团 · 周五到货", status: "open", closesAt: expect.any(Number), orders: 2, fresh: 2, total: 7600 + 1350 }]);

    // someone with an account and no shop here sees none of it
    expect((await get<MyHome>("/my", { session: SESSION.visitor })).data.shops.some((s) => s.slug === at.slug)).toBe(false);
    const owner = (await get<MyHome>("/my", { session: SESSION.owner })).data;
    expect(owner.me.owner).toBe(true);
    expect(owner.shops.some((s) => s.slug === at.slug)).toBe(true);
    expect(said(await get("/my"))).toBe("401 signin");
  });

  it("asks the rooms server once, and remembers the answer for five minutes under the session's fingerprint", async () => {
    await get("/my", { session: SESSION.leader });
    const kept = await caches.default.match(whoKey(await sha256(SESSION.leader)));
    expect(kept?.headers.get("cache-control")).toBe("max-age=300");
    expect(await kept?.json()).toEqual({ id: "uleader1", email: "leader@example.com", name: "团长", owner: false });
    // a session that is nobody's is never remembered
    await get("/my", { session: SESSION.nobody });
    expect(await caches.default.match(whoKey(await sha256(SESSION.nobody)))).toBeUndefined();
  });

  it("stops asking about sign-ins from a network that keeps sending made-up ones", async () => {
    const at = await start();
    const prober = "198.51.100.9";
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.leader, from: prober }))).toBe("ok");
    await env.DB.prepare("INSERT INTO gates (key, day, used) VALUES (?, ?, 59)")
      .bind(`signin:${await networkOf(new Request("https://changle.ca/", { headers: { "cf-connecting-ip": prober } }))}`, vancouverDay(Date.now()))
      .run();
    expect(said(await get("/my", { session: "made-up-session-0000000001", from: prober }))).toBe("401 signin"); // the 60th
    expect(said(await get("/my", { session: "made-up-session-0000000002", from: prober }))).toBe("429 limit");
    // someone already signed in on that network carries on
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.leader, from: prober }))).toBe("ok");
  });
});

describe("a merchant's marks", () => {
  it("confirms, marks paid and handed over, and takes each back", async () => {
    const at = await start();
    const code = (await place(at, [["五常大米", 1000]])).data.order.code;
    const confirmed = await move(code, { do: "confirm" });
    expect(confirmed.data.order).toMatchObject({ status: "confirmed", rev: 1 });
    expect((await move(code, { do: "confirm" })).data.order.rev).toBe(1); // already so: nothing changes
    const paid = (await move(code, { do: "paid", on: true })).data.order;
    expect(paid.paidAt).toBeTypeOf("number");
    expect((await move(code, { do: "paid", on: true })).data.order.paidAt).toBe(paid.paidAt);
    expect((await move(code, { do: "paid", on: false })).data.order.paidAt).toBeNull();
    expect((await move(code, { do: "picked", on: true })).data.order.pickedAt).toBeTypeOf("number");
    expect((await move(code, { do: "picked", on: false })).data.order).toMatchObject({ pickedAt: null, status: "confirmed" });
    expect(said(await move(code, { do: "paid" }))).toBe("400 bad");
    expect(said(await move(code, { do: "refund" }))).toBe("400 bad");
    expect(said(await move("ZZZZZZ", { do: "confirm" }))).toBe("404 notfound");
    expect(said(await move("nope", { do: "confirm" }))).toBe("404 notfound");
  });

  it("cancels an order for the buyer, and nothing more is done to it", async () => {
    const at = await start();
    const code = (await place(at, [["土鸡蛋", 3000]])).data.order.code;
    expect((await move(code, { do: "cancel" })).data.order.status).toBe("cancelled");
    expect((await move(code, { do: "cancel" })).data.order.status).toBe("cancelled");
    expect(await leftOf(at, "土鸡蛋")).toBe(10_000);
    expect(said(await move(code, { do: "confirm" }))).toBe("409 cancelled");
    expect(said(await move(code, { do: "paid", on: true }))).toBe("409 cancelled");
    expect((await get<OrderPage>(`/orders/${code}`, { tail: "0134" })).data.order.status).toBe("cancelled");
    await stockAgrees(at);
  });

  it("writes down what the scale said, and what the order comes to", async () => {
    const at = await start({ rules: [{ label: "列治文", min: 0, fee: 500 }] });
    const lamb = at.item("手切羊肉片");
    const code = (await place(at, [["手切羊肉片", 2000], ["五常大米", 1000]], { how: "delivery", ruleId: at.rule("列治文"), address: "8888 No. 3 Rd" })).data.order.code;
    const before = (await sheets(at)).orders[0];
    expect(before).toMatchObject({ goods: 3398 + 3800, fee: 500, final: null });

    const weighed = (await move(code, { do: "weigh", lines: [{ itemId: lamb, actual: 2130 }] })).data.order;
    // 2.13 lb × $16.99 = $36.1887, the rice, and delivery
    expect(weighed).toMatchObject({ goods: 3398 + 3800, final: 3619 + 3800 + 500 });
    expect(weighed.lines.map((l) => [l.name, l.qty, l.actual])).toEqual([["五常大米 10kg", 1000, null], ["手切羊肉片", 2000, 2130]]);
    // not weighed after all
    expect((await move(code, { do: "weigh", lines: [{ itemId: lamb, actual: null }] })).data.order.final).toBeNull();
    // only the weighed things in the order, each once, in whole thousandths
    expect(said(await move(code, { do: "weigh", lines: [{ itemId: at.item("五常大米"), actual: 1000 }] }))).toBe("400 bad");
    expect(said(await move(code, { do: "weigh", lines: [{ itemId: lamb, actual: 2000 }, { itemId: lamb, actual: 2100 }] }))).toBe("400 bad");
    expect(said(await move(code, { do: "weigh", lines: [{ itemId: lamb, actual: 2.13 }] }))).toBe("400 bad");
    expect(said(await move(code, { do: "weigh", lines: [{ itemId: lamb, actual: -1 }] }))).toBe("400 bad");
    expect(said(await move(code, { do: "weigh", lines: [] }))).toBe("400 bad");
    expect((await sheets(at)).summary.unweighed).toBe(1);
  });
});

describe("the shelf under a crowd", () => {
  it("still agrees with the orders after a run of orders, changes and cancellations", async () => {
    const at = await start();
    const phones = ["604-555-0101", "604-555-0102", "604-555-0103", "604-555-0104", "604-555-0105", "604-555-0106"];
    const placed = await Promise.all(phones.map((phone, n) => place(at, [["土鸡蛋", 1000 + (n % 2) * 1000], ["五常大米", 1000], ["手切羊肉片", 1000 + 500 * n]], { phone, name: `买家${n + 1}` })));
    expect(placed.map(said)).toEqual(phones.map(() => "ok"));
    const codes = placed.map((p) => p.data.order.code);
    expect(placed.map((p) => p.data.order.seq).sort()).toEqual([1, 2, 3, 4, 5, 6]);

    // a buyer changing an order while the merchant marks it, another cancelling while theirs is confirmed, two cancels of the same order
    const mixed = await Promise.all([
      post(`/orders/${codes[0]}`, order(at, [["土鸡蛋", 3000]]), { tail: "0101" }),
      move(codes[0], { do: "confirm" }),
      post(`/orders/${codes[1]}/cancel`, {}, { tail: "0102" }),
      move(codes[1], { do: "confirm" }),
      post(`/orders/${codes[2]}/cancel`, {}, { tail: "0103" }),
      move(codes[2], { do: "cancel" }),
      post(`/orders/${codes[3]}`, order(at, [["五常大米", 5000], ["黄小米", 2000]]), { tail: "0104" }),
      post(`/orders/${codes[3]}`, order(at, [["五常大米", 2000]]), { tail: "0104" }),
      place(at, [["土鸡蛋", 2000]], { phone: "604-555-0107" }),
    ]);
    for (const res of mixed) expect(["ok", "409 busy", "409 cancelled", "409 soldout"]).toContain(said(res));
    await stockAgrees(at);

    const mine = await sheets(at);
    const standing = mine.orders.filter((o) => o.status !== "cancelled");
    expect(mine.summary.orders).toBe(standing.length);
    expect(mine.summary.goods).toBe(standing.reduce((sum, o) => sum + o.goods, 0));
    expect(mine.summary.items.reduce((sum, i) => sum + i.amount, 0)).toBe(mine.summary.goods);
    // every order still says what its own lines add up to
    for (const o of mine.orders) expect(o.goods).toBe(o.lines.reduce((sum, l) => sum + Math.round((l.price * l.qty) / 1000), 0));
    const eggs = mine.items.find((i) => i.name.startsWith("土鸡蛋"))!;
    expect(eggs.sold).toBeLessThanOrEqual(eggs.stock!);
    expect((await page(at)).roster.map((r) => r.seq)).toEqual(standing.map((o) => o.seq));
  });
});

describe("the pages", () => {
  /** A page as a phone asks for it: its status, its text, its headers. */
  async function open(path: string, method = "GET") {
    const res = await worker.fetch(new Request(`https://changle.ca${path}`, { method, headers: { "cf-connecting-ip": network } }), env);
    return { status: res.status, html: await res.text(), headers: res.headers };
  }
  const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const cardOf = (html: string) => /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1];

  it("is one file for home, a group buy and an order: never kept, nothing foreign runs on it, no search engine lists it", async () => {
    const at = await start();
    for (const path of ["/tuan", "/tuan/", "/tuan/preview", `/tuan/t/${at.id}`, "/tuan/o/K7M2PQ", "/tuan/o/k7m2pq", "/tuan/my", "/tuan/my/", `/tuan/my/t/${at.id}`]) {
      const res = await open(path);
      expect([path, res.status]).toEqual([path, 200]);
      expect(res.headers.get("content-type")).toMatch(/^text\/html/);
      expect(res.html).toContain('<div id="app"></div>');
      expect(res.html).toMatch(/<script src="\/tuan\/assets\/app-[A-Z0-9]+\.js" defer><\/script>/);
      expect(res.html).toMatch(/<link rel="stylesheet" href="\/tuan\/assets\/app-[A-Z0-9]+\.css" \/>/);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(res.headers.get("referrer-policy")).toBe("same-origin");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("unsafe");
    }
    // a page is only ever read
    expect((await open("/tuan/", "POST")).status).toBe(405);
    expect((await open(`/tuan/t/${at.id}`, "DELETE")).status).toBe(405);
  });

  it("names a group buy's page for the group buy and its shop, as text", async () => {
    const at = await start();
    const res = await open(`/tuan/t/${at.id}`);
    expect(titleOf(res.html)).toBe("本周大米团 · 周五到货 · 大米团（测试） · 跟一单 Count Me In");
    expect(cardOf(res.html)).toBe("本周大米团 · 周五到货 · 大米团（测试） · 跟一单 Count Me In");
    // home keeps its own name
    expect(titleOf((await open("/tuan/")).html)).toBe("跟一单 · Count Me In");

    // whatever a merchant types is text on the page, never markup
    const odd = await start({ title: `<script>alert(1)</script> "米" & 面` });
    const page = await open(`/tuan/t/${odd.id}`);
    expect(page.html).not.toContain("<script>alert(1)</script>");
    expect(titleOf(page.html)).toBe("&lt;script&gt;alert(1)&lt;/script&gt; \"米\" &amp; 面 · 大米团（测试） · 跟一单 Count Me In");
    expect(cardOf(page.html)).toBe("&lt;script&gt;alert(1)&lt;/script&gt; &quot;米&quot; &amp; 面 · 大米团（测试） · 跟一单 Count Me In");
  });

  it("says 404, with the page that says so, for a group buy that isn't there or isn't public yet", async () => {
    const draft = await start({ open: false });
    for (const path of ["/tuan/t/zzzz9999", `/tuan/t/${draft.id}`, "/tuan/t/short", "/tuan/nothing", "/tuan/o/bad", "/tuan/t", "/tuan/my/t", "/tuan/my/t/short", "/tuan/my/shops", `/tuan/my/t/${draft.id}/more`]) {
      const res = await open(path);
      expect([path, res.status]).toEqual([path, 404]);
      expect(res.html).toContain('<div id="app"></div>');
      expect(titleOf(res.html)).toBe("跟一单 · Count Me In");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    // once it's open, it has its page
    await post(`/my/offers/${draft.id}`, { do: "open" }, { session: SESSION.leader });
    expect((await open(`/tuan/t/${draft.id}`)).status).toBe(200);
  });

  it("opens an order's page the same way whether or not there is such an order", async () => {
    const at = await start();
    const mine = (await place(at, [["五常大米", 1000]])).data.order;
    const real = await open(`/tuan/o/${mine.code}`);
    const none = await open("/tuan/o/ZZZZZZ");
    expect([real.status, none.status]).toEqual([200, 200]);
    expect(real.html).toBe(none.html);
    expect(real.html).not.toContain(mine.code);
  });

  it("gives a merchant's pages to anyone, saying nothing: what they show comes from the API, signed in", async () => {
    const at = await start();
    const mine = (await place(at, [["五常大米", 1000]])).data.order;
    const real = await open(`/tuan/my/t/${at.id}`);
    const none = await open("/tuan/my/t/zzzz9999");
    expect([real.status, none.status]).toEqual([200, 200]);
    expect(real.html).toBe(none.html);
    expect(real.html).not.toContain("本周大米团");
    expect(real.html).not.toContain(mine.code);
    expect(titleOf(real.html)).toBe("跟一单 · Count Me In");
    // changing a group buy and starting one are the same page again
    for (const path of [`/tuan/my/t/${at.id}/edit`, "/tuan/my/t/zzzz9999/edit", `/tuan/my/new/${at.slug}`, "/tuan/my/new/no-such-shop"]) {
      const res = await open(path);
      expect([path, res.status, res.html === real.html]).toEqual([path, 200, true]);
    }
    for (const path of [`/tuan/my/t/${at.id}/orders`, "/tuan/my/new", "/tuan/my/new/Not%20A%20Shop", `/tuan/my/new/${at.slug}/more`]) expect([path, (await open(path)).status]).toEqual([path, 404]);
    // …and the API still wants the sign-in
    expect(said(await get(`/my/offers/${at.id}`))).toBe("401 signin");
    expect(said(await get(`/my/offers/${at.id}`, { session: SESSION.visitor }))).toBe("403 forbidden");
  });

  it("has no page where a script, a style or a font is missing", async () => {
    const res = await open("/tuan/assets/app-NOTHING.js");
    expect([res.status, res.html]).toEqual([404, "not found"]);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
  });
});

describe("the way in", () => {
  it("answers its own pages and nobody else's", async () => {
    const at = await start();
    const sent = order(at, [["五常大米", 1000]]);
    expect(said(await post(`/offers/${at.id}/orders`, sent, { origin: "https://evil.example" }))).toBe("403 forbidden");
    expect(said(await post(`/offers/${at.id}/orders`, sent, { origin: "null" }))).toBe("403 forbidden");
    expect(said(await post(`/offers/${at.id}/orders`, sent, { origin: "https://changle.ca" }))).toBe("ok");
    expect((await page(at)).orders).toBe(1);
  });

  it("never lets an answer be kept or listed by a search engine", async () => {
    const at = await start();
    for (const res of [await get(`/offers/${at.id}`), await get("/offers/zzzz9999"), await get("/my")]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    }
  });

  it("answers nothing else", async () => {
    expect(said(await get("/"))).toBe("404 notfound");
    expect(said(await get("/offers"))).toBe("404 notfound");
    expect(said(await get("/offers/NOT-AN-ID"))).toBe("404 notfound");
    expect(said(await call("PUT", "/offers/aaaa2222", { body: {} }))).toBe("404 notfound");
    expect(said(await get("/my/nothing", { session: SESSION.leader }))).toBe("404 notfound");
    for (const path of ["/tuanx/api/my", "/tuanx", "/"]) {
      const res = await worker.fetch(new Request(`https://changle.ca${path}`), env);
      expect([path, res.status, await res.text()]).toEqual([path, 404, "not found"]);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });

  it("says so, as JSON, when something breaks", async () => {
    const at = await start();
    const broken = { ...env, DB: { prepare: () => { throw new Error("the database is away"); }, batch: () => { throw new Error("the database is away"); } } } as unknown as Env;
    const res = await worker.fetch(new Request(`https://changle.ca/tuan/api/offers/${at.id}`), broken);
    expect([res.status, await res.json()]).toEqual([500, { error: "failed" }]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("limits how many orders one network sends in a day", async () => {
    const at = await start();
    const crowd = "198.51.100.11";
    await env.DB.prepare("INSERT INTO gates (key, day, used) VALUES (?, ?, 299)")
      .bind(`order:${await networkOf(new Request("https://changle.ca/", { headers: { "cf-connecting-ip": crowd } }))}`, vancouverDay(Date.now()))
      .run();
    expect(said(await place(at, [["五常大米", 1000]], {}, { from: crowd }))).toBe("ok"); // the 300th
    expect(said(await place(at, [["五常大米", 1000]], { phone: "604-555-0177" }, { from: crowd }))).toBe("429 limit");
    expect(said(await place(at, [["五常大米", 1000]], { phone: "604-555-0177" }))).toBe("ok");
  });
});

describe("telling the merchant by mail", () => {
  const rooms = async <T>(path: string): Promise<T> => (await env.ROOMS.fetch(`https://rooms.test${path}`)).json();
  /** What the mail door sent since last asked. */
  const mails = () => rooms<Notice[]>("/test/mails");
  const door = (is: "open" | "full" | "down") => rooms(`/test/door?is=${is}`);
  /** As if the last mail for this group buy went out this long ago. */
  const ago = (at: Started, ms: number) => env.DB.prepare("UPDATE offers SET mailed_at = ? WHERE id = ?").bind(Date.now() - ms, at.id).run();
  const timer = () => worker.scheduled({} as ScheduledController, env);
  const HALF_HOUR = 30 * 60_000;

  it("mails the first order at once, in both languages, with no phone number in it", async () => {
    const at = await start();
    await mails();
    const placed = await place(at, [["五常大米", 2000], ["土鸡蛋", 1000]], { wechat: "wang_ayi", note: "下午来拿" });
    expect(placed.status).toBe(201);
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ app: "tuan", to: "leader@example.com", lang: "zh", link: `https://changle.ca/tuan/my/t/${at.id}` });
    expect(sent[0].subject).toBe("跟一单 新订单 1 张 · 1 new order · 本周大米团 · 周五到货");
    expect(sent[0].text).toContain("「本周大米团 · 周五到货」新来了 1 张订单，现在一共 1 张。");
    expect(sent[0].text).toContain("第 1 位 王阿姨：五常大米 10kg ×2、土鸡蛋 30 枚 ×1，$89.50，自提 温哥华西区");
    expect(sent[0].text).toContain('1 new order for "本周大米团 · 周五到货", 1 in all.');
    expect(sent[0].text).toContain("No. 1 王阿姨: 五常大米 10kg ×2, 土鸡蛋 30 枚 ×1, $89.50, pickup at 温哥华西区");
    expect(sent[0].text).not.toMatch(/6045550134|0134|wang_ayi|下午来拿/);
    expect(sent[0].subject.length).toBeLessThanOrEqual(120);
    expect(sent[0].text.length).toBeLessThanOrEqual(2000);
  });

  it("then waits half an hour, and mails everything since in one", async () => {
    const at = await start();
    await place(at, [["五常大米", 1000]]);
    await mails();
    await place(at, [["手切羊肉片", 1500], ["土鸡蛋", 2000]], { name: "陈太", phone: "236-555-0111", pickupId: at.point("大学区") });
    await place(at, [["五常大米", 1000]], { name: "Leo", phone: "778-555-0199", how: "delivery", ruleId: at.rule("列治文"), address: "8888 No. 3 Rd" });
    expect(await mails()).toEqual([]);

    await ago(at, HALF_HOUR + 1000);
    await place(at, [["土鸡蛋", 1000]], { name: "小林", phone: "604-555-0177" });
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("新订单 3 张 · 3 new orders");
    expect(sent[0].text).toContain("新来了 3 张订单，现在一共 4 张。");
    expect(sent[0].text).toContain("第 2 位 陈太：土鸡蛋 30 枚 ×2、手切羊肉片 1.5 lb，预估 $52.49，自提 大学区");
    expect(sent[0].text).toContain("第 3 位 Leo：五常大米 10kg ×1，$43.00，送货 列治文"); // $38 and $5 delivery
    expect(sent[0].text).toContain("No. 3 Leo: 五常大米 10kg ×1, $43.00, delivery to 列治文");
    expect(sent[0].text).toContain("第 4 位 小林");
    expect(sent[0].text).not.toContain("第 1 位");
    expect(sent[0].text).not.toMatch(/No\. 3 Rd|2365550111/);
  });

  it("sends what's waiting when the timer comes round, once", async () => {
    const at = await start();
    await place(at, [["五常大米", 1000]]);
    await place(at, [["五常大米", 1000]], { name: "Leo", phone: "778-555-0199" });
    await mails();
    await timer();
    expect(await mails()).toEqual([]); // the half hour isn't up
    await ago(at, HALF_HOUR);
    await timer();
    const sent = await mails();
    expect(sent.map((m) => m.to)).toEqual(["leader@example.com"]);
    expect(sent[0].text).toContain("新来了 1 张订单，现在一共 2 张。");
    await ago(at, HALF_HOUR);
    await timer();
    expect(await mails()).toEqual([]); // nothing new
  });

  it("doesn't mail orders the merchant has seen on their page, or ones cancelled since", async () => {
    const at = await start();
    await place(at, [["五常大米", 1000]]);
    await place(at, [["五常大米", 1000]], { name: "Leo", phone: "778-555-0199" });
    await sheets(at); // the merchant looks
    const gone = (await place(at, [["五常大米", 1000]], { name: "陈太", phone: "236-555-0111" })).data.order.code;
    await post(`/orders/${gone}/cancel`, {}, { tail: "0111" });
    await mails();
    await ago(at, HALF_HOUR);
    await timer();
    expect(await mails()).toEqual([]);
  });

  it("mails the first two accounts that run the shop", async () => {
    const at = await start();
    await post("/admin/shops", { slug: at.slug, name: "大米团（测试）", members: ["visitor@example.com", "leader@example.com", "owner@example.com"] }, { session: SESSION.owner });
    await mails();
    await place(at, [["五常大米", 1000]]);
    expect((await mails()).map((m) => m.to)).toEqual(["visitor@example.com", "leader@example.com"]);
  });

  it("takes the order all the same when the mail can't go out, and tries again later", async () => {
    const at = await start();
    await mails();
    await door("down");
    try {
      expect((await place(at, [["五常大米", 1000]])).status).toBe(201);
      expect(await mails()).toEqual([]);
    } finally {
      await door("open");
    }
    // the half hour wasn't spent on a mail that didn't go
    await timer();
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("第 1 位 王阿姨");
  });

  it("stops asking for the day once the allowance is used up", async () => {
    const at = await start();
    const other = await start();
    await mails();
    await door("full");
    try {
      expect((await place(at, [["五常大米", 1000]])).status).toBe(201);
      await door("open");
      // the door would take it now, but it said it was full for today
      expect((await place(other, [["五常大米", 1000]])).status).toBe(201);
      await timer();
      expect(await mails()).toEqual([]);
      // tomorrow (the door's day) they go out
      await env.DB.prepare("DELETE FROM gates WHERE key LIKE 'mailfull:%'").run();
      await timer();
      expect((await mails()).map((m) => m.link).sort()).toEqual([at.id, other.id].map((id) => `https://changle.ca/tuan/my/t/${id}`).sort());
    } finally {
      await door("open");
      await env.DB.prepare("DELETE FROM gates WHERE key LIKE 'mailfull:%'").run();
    }
  });

  it("doesn't keep trying a shop whose accounts the door doesn't mail", async () => {
    const at = await start();
    await post("/admin/shops", { slug: at.slug, name: "大米团（测试）", members: ["someone-else@example.com"] }, { session: SESSION.owner });
    await mails();
    await place(at, [["五常大米", 1000]]);
    expect(await mails()).toEqual([]);
    const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE offer_id = ? AND noticed = 0").bind(at.id).first<{ n: number }>();
    expect(waiting?.n).toBe(0);
  });
});

describe("the daily counts", () => {
  it("forget days nobody needs any more", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO gates (key, day, used) VALUES ('order:old', ?, 7), ('order:yesterday', ?, 7)").bind(vancouverDay(now - 3 * DAY), vancouverDay(now - DAY)).run();
    const at = await start();
    await place(at, [["五常大米", 1000]]); // this network's first order today sweeps
    const left = (await env.DB.prepare("SELECT key FROM gates WHERE key IN ('order:old', 'order:yesterday')").all<{ key: string }>()).results.map((r) => r.key);
    expect(left).toEqual(["order:yesterday"]);
  });
});
