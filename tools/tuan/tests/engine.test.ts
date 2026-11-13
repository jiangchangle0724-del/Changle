// The rules alone (src/engine): no database, no network.
import { describe, expect, it } from "vitest";
import { makeCode, OFFER_RE, ORDER_RE, SLUG_RE, tidyOrderCode } from "../src/engine/ids";
import { amountText, dollars, finalGoods, goodsOf, lineAmount, piecesOf } from "../src/engine/money";
import { readOffer } from "../src/engine/offer";
import { buyerMayChange, isOpen, leftOf, ORDERS_PER_PHONE, takeOrder, without, type Taken } from "../src/engine/order";
import { phoneDigits, phoneKey, tailOf } from "../src/engine/phone";
import { readShop } from "../src/engine/shop";
import { dueOf, summarize } from "../src/engine/summary";
import { cleanLine, cleanLines } from "../src/engine/text";
import { vancouverDay, vancouverTime } from "../src/engine/time";
import type { OfferBook, Order } from "../src/engine/types";
import { buyerOrder, offerPage, orderPage, stateOf } from "../src/engine/view";
import { offerDoc, sampleBook } from "./sample";

const NOW = vancouverTime("2026-11-13", 12);
const book = () => sampleBook(NOW);

/** An order as a phone sends it. */
const sent = (more: Record<string, unknown> = {}) => ({ name: "王阿姨", phone: "604-555-0134", how: "pickup", pickupId: "west", lines: [{ itemId: "rice", qty: 2000 }], ...more });
const taken = (input: unknown, b: OfferBook = book()): Taken => {
  const got = takeOrder(input, b, NOW);
  if (!got.ok) throw new Error(`refused: ${got.error}`);
  return got;
};
const refusal = (input: unknown, b: OfferBook = book(), now = NOW) => {
  const got = takeOrder(input, b, now);
  return got.ok ? "taken" : got.error;
};

/** A taken order as the server would keep it. */
function kept(t: Taken, seq: number, more: Partial<Order> = {}): Order {
  return {
    code: `ORD${seq}22`.slice(0, 6),
    offerId: "aaaa2222",
    seq,
    name: t.name,
    phone: t.phone,
    wechat: t.wechat,
    how: t.how,
    pickupId: t.pickupId,
    ruleId: t.ruleId,
    address: t.address,
    note: t.note,
    status: "new",
    paidAt: null,
    pickedAt: null,
    goods: t.goods,
    fee: t.fee,
    final: t.final,
    pieces: t.pieces,
    rev: 0,
    createdAt: NOW,
    updatedAt: NOW,
    lines: t.lines.map((line) => ({ ...line, actual: null })),
    ...more,
  };
}

describe("money and amounts", () => {
  it("prices a line in whole cents, a half cent rounding up", () => {
    expect(lineAmount(3800, 2000)).toBe(7600);
    expect(lineAmount(1699, 1500)).toBe(2549); // $16.99 × 1.5 lb = $25.485
    expect(lineAmount(1699, 500)).toBe(850); // $8.495
    expect(lineAmount(999, 250)).toBe(250); // $2.4975
    expect(lineAmount(0, 5000)).toBe(0);
  });

  it("adds an order up line by line", () => {
    expect(goodsOf([{ price: 3800, qty: 2000 }, { price: 1350, qty: 1000 }])).toBe(8950);
    expect(goodsOf([])).toBe(0);
  });

  it("knows what an order comes to only once everything weighed is weighed", () => {
    const rice = { itemId: "rice", name: "米", unit: "bag" as const, price: 3800, qty: 1000, actual: null };
    const lamb = { itemId: "lamb", name: "羊肉", unit: "lb" as const, price: 1699, qty: 1500, actual: null };
    expect(finalGoods([rice])).toBe(3800);
    expect(finalGoods([rice, lamb])).toBeNull();
    expect(finalGoods([rice, { ...lamb, actual: 1620 }])).toBe(3800 + 2752); // 1.62 lb: $27.5238
    expect(finalGoods([rice, { ...lamb, actual: 0 }])).toBe(3800); // it wasn't there after all
  });

  it("counts pieces for the public list: things as counted, anything weighed as one", () => {
    expect(piecesOf([{ unit: "bag", qty: 3000 }, { unit: "lb", qty: 2500 }, { unit: "box", qty: 1000 }])).toBe(5);
  });

  it("writes money and amounts out", () => {
    expect(dollars(8950)).toBe("$89.50");
    expect(dollars(5)).toBe("$0.05");
    expect(amountText(1500)).toBe("1.5");
    expect(amountText(2000)).toBe("2");
  });
});

describe("codes, phone numbers, text and time", () => {
  it("makes codes people can read out", () => {
    let n = 0;
    const rand = () => (n++ % 31) / 31;
    const order = makeCode(rand, 6);
    expect(order).toMatch(ORDER_RE);
    expect(order).not.toMatch(/[01ILO]/);
    expect(makeCode(rand, 8, true)).toMatch(OFFER_RE);
    expect(makeCode(() => 0.999999, 6)).toBe("ZZZZZZ");
    expect(tidyOrderCode(" k7m 2pq ")).toBe("K7M2PQ");
  });

  it("takes a shop's address as lower-case letters, digits and hyphens", () => {
    for (const ok of ["rice", "rice-test", "a1", "8"]) expect(ok).toMatch(SLUG_RE);
    for (const bad of ["", "-rice", "rice-", "Rice", "rice test", "a".repeat(41)]) expect(bad).not.toMatch(SLUG_RE);
  });

  it("reads a phone number however it was typed", () => {
    expect(phoneDigits("(604) 555-0134")).toBe("6045550134");
    expect(phoneDigits("+1 604 555 0134")).toBe("16045550134");
    expect(phoneDigits("138 0013 8000")).toBe("13800138000"); // a number from China
    expect(phoneDigits("555-0134")).toBeNull();
    expect(phoneDigits("1".repeat(16))).toBeNull();
    expect(phoneDigits(6045550134)).toBeNull();
    expect(phoneKey("16045550134")).toBe(phoneKey("6045550134"));
    expect(tailOf("16045550134")).toBe("0134");
  });

  it("tidies what people type", () => {
    expect(cleanLine("  王\t阿姨\n ", 30)).toBe("王 阿姨");
    expect(cleanLine("😀😀😀😀", 3)).toBe("😀😀😀"); // counted in whole characters, never half of one
    expect(cleanLine("   ", 30)).toBeNull();
    expect(cleanLine(42, 30)).toBeNull();
    expect(cleanLines(" 门口有狗 \r\n\r\n\r\n\r\n 按门铃  两次 ", 300)).toBe("门口有狗\n\n按门铃 两次");
    expect(cleanLines(undefined, 300)).toBe("");
  });

  it("keeps Vancouver on UTC-7 all year", () => {
    expect(vancouverTime("2026-11-13", 18)).toBe(Date.UTC(2026, 10, 14, 1));
    expect(vancouverDay(Date.UTC(2026, 10, 14, 6, 59))).toBe("2026-11-13");
    expect(vancouverDay(Date.UTC(2026, 10, 14, 7, 0))).toBe("2026-11-14");
    expect(vancouverDay(vancouverTime("2027-01-15", 0))).toBe("2027-01-15");
  });
});

describe("taking an order", () => {
  it("prices a pickup order, listed in the group buy's own order", () => {
    const got = taken(sent({ name: " 王阿姨 ", wechat: " wang_ayi ", note: "下午来拿", lines: [{ itemId: "eggs", qty: 1000 }, { itemId: "rice", qty: 2000 }] }));
    expect(got).toMatchObject({ name: "王阿姨", phone: "6045550134", phoneKey: "6045550134", wechat: "wang_ayi", how: "pickup", pickupId: "west", ruleId: null, address: "", note: "下午来拿", goods: 8950, fee: 0, final: 8950, pieces: 3 });
    expect(got.lines).toEqual([
      { itemId: "rice", name: "五常大米 10kg", unit: "bag", price: 3800, qty: 2000 },
      { itemId: "eggs", name: "土鸡蛋 30 枚", unit: "box", price: 1350, qty: 1000 },
    ]);
  });

  it("adds up the same thing sent twice", () => {
    expect(taken(sent({ lines: [{ itemId: "rice", qty: 1000 }, { itemId: "rice", qty: 2000 }] })).lines).toEqual([{ itemId: "rice", name: "五常大米 10kg", unit: "bag", price: 3800, qty: 3000 }]);
  });

  it("leaves the final amount open while something waits for the scale", () => {
    const got = taken(sent({ lines: [{ itemId: "lamb", qty: 1500 }, { itemId: "eggs", qty: 2000 }] }));
    expect(got).toMatchObject({ goods: 2549 + 2700, final: null, pieces: 3 });
  });

  it("delivers where the goods reach that area's minimum", () => {
    const lines = [{ itemId: "rice", qty: 1000 }, { itemId: "pearl", qty: 1000 }, { itemId: "millet", qty: 2000 }]; // $78.10
    const richmond = taken(sent({ how: "delivery", ruleId: "rmd", address: " 8888 No. 3 Rd\n Richmond ", pickupId: "west", lines }));
    expect(richmond).toMatchObject({ how: "delivery", ruleId: "rmd", pickupId: null, address: "8888 No. 3 Rd\nRichmond", goods: 7810, fee: 0, final: 7810 });
    expect(takeOrder(sent({ how: "delivery", ruleId: "van", address: "2100 W 4th Ave", lines }), book(), NOW)).toEqual({ ok: false, error: "min", min: 9800 });
    expect(refusal(sent({ how: "delivery", ruleId: "rmd", address: "  ", lines }))).toBe("address");
    expect(refusal(sent({ how: "delivery", ruleId: "west", address: "x", lines }))).toBe("how");
  });

  it("charges the area's delivery fee, on top of the goods", () => {
    const b = book();
    b.rules[2].fee = 500;
    const got = taken(sent({ how: "delivery", ruleId: "rmd", address: "8888 No. 3 Rd", lines: [{ itemId: "rice", qty: 2000 }] }), b);
    expect(got).toMatchObject({ goods: 7600, fee: 500, final: 8100 });
  });

  it("refuses what isn't an order", () => {
    expect(refusal(null)).toBe("bad");
    expect(refusal([])).toBe("bad");
    expect(refusal(sent({ lines: "rice" }))).toBe("bad");
    expect(refusal(sent({ lines: [null] }))).toBe("bad");
    expect(refusal(sent({ lines: [{ itemId: 7, qty: 1000 }] }))).toBe("bad");
    expect(refusal(sent({ lines: Array.from({ length: 61 }, () => ({ itemId: "rice", qty: 1000 })) }))).toBe("bad");
    expect(refusal(sent({ name: "  " }))).toBe("name");
    expect(refusal(sent({ phone: "555-0134" }))).toBe("phone");
    expect(refusal(sent({ lines: [] }))).toBe("empty");
    expect(refusal(sent({ lines: [{ itemId: "caviar", qty: 1000 }] }))).toBe("item");
    expect(refusal(sent({ how: "pickup", pickupId: "moon" }))).toBe("how");
    expect(refusal(sent({ how: "teleport" }))).toBe("how");
  });

  it("refuses amounts that can't be ordered", () => {
    for (const qty of [0, -1000, 1500, 0.5, "2", 100_000]) expect(refusal(sent({ lines: [{ itemId: "rice", qty }] }))).toBe("qty");
    // weight comes by the half pound here
    expect(refusal(sent({ lines: [{ itemId: "lamb", qty: 250 }] }))).toBe("qty");
    expect(refusal(sent({ lines: [{ itemId: "lamb", qty: 500 }] }))).toBe("taken");
    // 99 of one thing at most, however it's split up
    expect(refusal(sent({ lines: [{ itemId: "pearl", qty: 99_000 }] }))).toBe("taken");
    expect(refusal(sent({ lines: [{ itemId: "pearl", qty: 98_000 }, { itemId: "pearl", qty: 2000 }] }))).toBe("qty");
  });

  it("refuses more than is left, and says how much is", () => {
    const b = book();
    b.items[3].sold = 9000; // 9 of 10 boxes of eggs gone
    expect(takeOrder(sent({ lines: [{ itemId: "eggs", qty: 2000 }, { itemId: "rice", qty: 1000 }] }), b, NOW)).toEqual({ ok: false, error: "soldout", items: [{ id: "eggs", left: 1000 }] });
    expect(refusal(sent({ lines: [{ itemId: "eggs", qty: 1000 }] }), b)).toBe("taken");
    expect(leftOf(b.items[3])).toBe(1000);
    expect(leftOf(b.items[1])).toBeNull();
  });

  it("holds one buyer to the limit, counting what their number already has", () => {
    expect(takeOrder(sent({ lines: [{ itemId: "millet", qty: 3000 }] }), book(), NOW)).toEqual({ ok: false, error: "perbuyer", items: [{ id: "millet", left: 2000 }] });
    const had = { orders: 1, items: new Map([["millet", 1000]]) };
    expect(takeOrder(sent({ lines: [{ itemId: "millet", qty: 2000 }] }), book(), NOW, had)).toEqual({ ok: false, error: "perbuyer", items: [{ id: "millet", left: 1000 }] });
    expect(takeOrder(sent({ lines: [{ itemId: "millet", qty: 1000 }] }), book(), NOW, had).ok).toBe(true);
    expect(takeOrder(sent(), book(), NOW, { orders: ORDERS_PER_PHONE, items: new Map() })).toEqual({ ok: false, error: "many" });
  });

  it("takes orders only while the group buy is open", () => {
    const b = book();
    expect(isOpen(b, NOW)).toBe(true);
    expect(refusal(sent(), b, b.offer.closesAt)).toBe("closed");
    expect(refusal(sent(), b, b.offer.closesAt - 1)).toBe("taken");
    expect(refusal(sent(), { ...b, offer: { ...b.offer, status: "closed" } })).toBe("closed");
    expect(refusal(sent(), { ...b, offer: { ...b.offer, status: "draft" } })).toBe("closed");
    expect(refusal(sent(), { ...b, shop: { ...b.shop, status: "paused" } })).toBe("closed");
  });

  it("lets a buyer change an order against the shelf as it would be without it", () => {
    const b = book();
    b.items[3].sold = 10_000; // every box of eggs is spoken for, two of them by this order
    const mine = kept(taken(sent({ lines: [{ itemId: "eggs", qty: 2000 }] }), book()), 1);
    expect(refusal(sent({ lines: [{ itemId: "eggs", qty: 2000 }] }), b)).toBe("soldout");
    const shelf = without(b, mine);
    expect(shelf.items[3].sold).toBe(8000);
    expect(refusal(sent({ lines: [{ itemId: "eggs", qty: 2000 }] }), shelf)).toBe("taken");
    expect(refusal(sent({ lines: [{ itemId: "eggs", qty: 3000 }] }), shelf)).toBe("soldout");
    // a cancelled order holds nothing
    expect(without(b, { ...mine, status: "cancelled" }).items[3].sold).toBe(10_000);
    expect(b.items[3].sold).toBe(10_000);
  });

  it("lets the buyer change it until the group buy closes, or it's paid for or handed over", () => {
    const b = book();
    const mine = kept(taken(sent()), 1);
    expect(buyerMayChange(b, mine, NOW)).toBe(true);
    expect(buyerMayChange(b, mine, b.offer.closesAt)).toBe(false);
    expect(buyerMayChange(b, { ...mine, paidAt: NOW }, NOW)).toBe(false);
    expect(buyerMayChange(b, { ...mine, pickedAt: NOW }, NOW)).toBe(false);
    expect(buyerMayChange(b, { ...mine, status: "cancelled" }, NOW)).toBe(false);
  });
});

describe("starting a group buy", () => {
  const doc = (more: Record<string, unknown> = {}) => ({ ...offerDoc(NOW + 86_400_000), ...more });
  const error = (input: unknown) => {
    const got = readOffer(input, NOW);
    return got.ok ? "ok" : got.at === undefined ? got.error : `${got.error} ${got.at}`;
  };

  it("reads the sample group buy", () => {
    const got = readOffer(doc(), NOW);
    if (!got.ok) throw new Error(got.error);
    expect(got.offer).toMatchObject({ title: "本周大米团 · 周五到货", roster: "names", open: true, closesAt: NOW + 86_400_000 });
    expect(got.offer.items).toHaveLength(5);
    expect(got.offer.items[0]).toEqual({ section: "米面", name: "五常大米 10kg", detail: "当季新米", photo: null, price: 3800, unit: "bag", step: 1000, stock: 40_000, perBuyer: null, allergens: "" });
    // weight comes by the half pound unless the merchant says otherwise
    expect(got.offer.items[4]).toMatchObject({ unit: "lb", step: 500, stock: null });
    expect(got.offer.points.map((p) => p.name)).toEqual(["温哥华西区", "大学区", "本拿比"]);
    expect(got.offer.rules.map((r) => [r.label, r.min, r.fee])).toEqual([["温哥华（Downtown 除外）", 9800, 0], ["本拿比", 9800, 0], ["列治文", 6800, 0]]);
  });

  it("can be kept as a draft, and lists who's in by name unless told otherwise", () => {
    const got = readOffer(doc({ open: false, roster: "anon" }), NOW);
    expect(got.ok && got.offer.open).toBe(false);
    expect(got.ok && got.offer.roster).toBe("anon");
    expect(error(doc({ roster: "everyone" }))).toBe("bad");
  });

  it("refuses what can't be a group buy", () => {
    expect(error("rice")).toBe("bad");
    expect(error(doc({ title: " " }))).toBe("title");
    expect(error(doc({ closesAt: NOW }))).toBe("closes");
    expect(error(doc({ closesAt: NOW + 91 * 86_400_000 }))).toBe("closes");
    expect(error(doc({ closesAt: "tomorrow" }))).toBe("closes");
    expect(error(doc({ items: [] }))).toBe("items");
    expect(error(doc({ items: Array.from({ length: 81 }, () => ({ name: "米", price: 100 })) }))).toBe("items");
    expect(error(doc({ points: [], rules: [] }))).toBe("places");
    expect(error(doc({ points: undefined, rules: [{ label: "列治文" }] }))).toBe("ok");
    expect(error(doc({ points: [{ name: "" }] }))).toBe("place 0");
    expect(error(doc({ rules: [{ label: "列治文", min: -1 }] }))).toBe("place 3");
  });

  it("refuses goods that can't be sold as written", () => {
    const item = (more: Record<string, unknown>) => error(doc({ items: [{ name: "米", price: 100 }, { name: "肉", price: 1699, ...more }] }));
    expect(item({})).toBe("ok");
    expect(item({ name: " " })).toBe("item 1");
    expect(item({ price: 16.99 })).toBe("item 1");
    expect(item({ price: -1 })).toBe("item 1");
    expect(item({ unit: "kg" })).toBe("item 1");
    expect(item({ unit: "bag", step: 500 })).toBe("item 1"); // half a bag
    expect(item({ unit: "lb", step: 250 })).toBe("ok");
    expect(item({ unit: "lb", step: 100 })).toBe("item 1");
    expect(item({ unit: "lb", stock: 1250 })).toBe("item 1"); // not a whole number of half pounds
    expect(item({ unit: "lb", stock: 1500 })).toBe("ok");
    expect(item({ stock: 0 })).toBe("ok"); // listed, none to sell yet
    expect(item({ perBuyer: 0 })).toBe("item 1");
    expect(item({ perBuyer: 100_000 })).toBe("item 1");
  });
});

describe("setting a shop up", () => {
  const shop = (more: Record<string, unknown> = {}) => ({ slug: "rice-test", name: "大米团（测试）", members: ["Leader@Example.com", " leader@example.com "], ...more });

  it("reads a shop, its accounts in lower case and once each", () => {
    expect(readShop(shop({ pay: " e-Transfer: pay@example.com \n 备注订单号 " }))).toEqual({
      ok: true,
      shop: { slug: "rice-test", name: "大米团（测试）", kind: "leader", about: "", contact: "", pay: "e-Transfer: pay@example.com\n备注订单号", permit: "", status: "live", members: ["leader@example.com"] },
    });
  });

  it("refuses a shop with no address, no name or nobody to run it", () => {
    const error = (input: unknown) => {
      const got = readShop(input);
      return got.ok ? "ok" : got.error;
    };
    expect(error(null)).toBe("bad");
    expect(error(shop({ slug: "Rice Test" }))).toBe("slug");
    expect(error(shop({ name: "" }))).toBe("name");
    expect(error(shop({ kind: "bank" }))).toBe("bad");
    expect(error(shop({ status: "gone" }))).toBe("bad");
    expect(error(shop({ members: [] }))).toBe("members");
    expect(error(shop({ members: ["not an email"] }))).toBe("members");
    expect(error(shop({ kind: "farm", status: "pending" }))).toBe("ok");
  });
});

describe("the merchant's sheets", () => {
  // three friends, one order each
  const orders = () => {
    const wang = kept(taken(sent({ lines: [{ itemId: "rice", qty: 2000 }, { itemId: "eggs", qty: 1000 }] })), 1);
    const leo = kept(taken(sent({ name: "Leo", phone: "778-555-0199", how: "delivery", ruleId: "rmd", address: "8888 No. 3 Rd", lines: [{ itemId: "rice", qty: 1000 }, { itemId: "pearl", qty: 1000 }, { itemId: "millet", qty: 2000 }] })), 2);
    const chen = kept(taken(sent({ name: "陈太", phone: "236-555-0111", pickupId: "campus", lines: [{ itemId: "lamb", qty: 1500 }, { itemId: "eggs", qty: 2000 }] })), 3);
    return [wang, leo, chen];
  };

  it("adds up to what a hand count gives", () => {
    const sum = summarize(book(), orders());
    // by hand: rice 3 bags $114.00, pearl rice 1 bag $22.50, millet 2 packs $17.60, eggs 3 boxes $40.50, lamb 1.5 lb $25.49
    expect(sum.items.map((i) => [i.name, i.qty, i.orders, i.amount])).toEqual([
      ["五常大米 10kg", 3000, 2, 11400],
      ["东北珍珠米 15lb", 1000, 1, 2250],
      ["黄小米 2lb", 2000, 1, 1760],
      ["土鸡蛋 30 枚", 3000, 2, 4050],
      ["手切羊肉片", 1500, 1, 2549],
    ]);
    expect(sum).toMatchObject({ orders: 3, cancelled: 0, pieces: 10, goods: 22009, fee: 0, total: 22009, paid: 0, paidTotal: 0, picked: 0, unweighed: 1 });
    // $89.50 + $78.10 + $52.49
    expect(sum.goods).toBe(8950 + 7810 + 5249);
    expect(sum.items.reduce((all, i) => all + i.amount, 0)).toBe(sum.goods);
  });

  it("sorts the same goods by where they go", () => {
    const sum = summarize(book(), orders());
    expect(sum.places.map((p) => [p.how, p.name, p.orders, p.goods])).toEqual([
      ["pickup", "温哥华西区", 1, 8950],
      ["pickup", "大学区", 1, 5249],
      ["delivery", "列治文", 1, 7810],
    ]);
    expect(sum.places[1].items.map((i) => [i.name, i.qty])).toEqual([["土鸡蛋 30 枚", 2000], ["手切羊肉片", 1500]]);
    expect(sum.places.reduce((all, p) => all + p.goods, 0)).toBe(sum.goods);
  });

  it("leaves cancelled orders out, and counts what's paid at its weighed amount", () => {
    const [wang, leo, chen] = orders();
    const weighedChen: Order = { ...chen, paidAt: NOW, final: 2752 + 2700, lines: chen.lines.map((line) => (line.itemId === "lamb" ? { ...line, actual: 1620 } : line)) };
    const sum = summarize(book(), [wang, { ...leo, status: "cancelled" }, weighedChen]);
    expect(sum).toMatchObject({ orders: 2, cancelled: 1, goods: 8950 + 5249, paid: 1, paidTotal: 5452, unweighed: 0 });
    expect(sum.items.find((i) => i.itemId === "lamb")).toMatchObject({ qty: 1500, actual: 1620 });
    expect(sum.items.find((i) => i.itemId === "rice")).toMatchObject({ qty: 2000, actual: null, orders: 1 });
    expect(sum.items.some((i) => i.itemId === "millet")).toBe(false);
    expect(sum.places.map((p) => p.name)).toEqual(["温哥华西区", "大学区"]);
    expect(dueOf(wang)).toBe(8950);
    expect(dueOf(weighedChen)).toBe(5452);
  });

  it("doesn't give a weighed total until every share of it is weighed", () => {
    const [wang, , chen] = orders();
    const more = kept(taken(sent({ name: "小林", phone: "604-555-0177", lines: [{ itemId: "lamb", qty: 1000 }] })), 4);
    const one = { ...chen, lines: chen.lines.map((line) => (line.itemId === "lamb" ? { ...line, actual: 1620 } : line)) };
    expect(summarize(book(), [wang, one, more]).items.find((i) => i.itemId === "lamb")).toMatchObject({ qty: 2500, actual: null, orders: 2 });
  });
});

describe("who is shown what", () => {
  const b = book();
  const mine = kept(taken(sent({ wechat: "wang_ayi", note: "下午来拿" })), 7);

  it("shows the public the goods, what's left and who's in, never a phone number", () => {
    b.items[0].sold = 38_000;
    const page = offerPage(b, [{ seq: 7, name: "王阿姨", pieces: 2 }], NOW);
    expect(page.offer).toEqual({ id: "aaaa2222", title: "本周大米团 · 周五到货", note: "", closesAt: NOW + 86_400_000, state: "open", roster: "names" });
    expect(page.items[0]).toEqual({ id: "rice", section: "米面", name: "五常大米 10kg", detail: "当季新米", photo: null, price: 3800, unit: "bag", step: 1000, left: 2000, perBuyer: null, allergens: "" });
    expect(page.items[1].left).toBeNull();
    expect(page.roster).toEqual([{ seq: 7, name: "王阿姨", pieces: 2 }]);
    expect(page.orders).toBe(1);
    expect(JSON.stringify(page)).not.toContain("6045550134");
    expect(Object.keys(page.items[0])).not.toContain("sold");
  });

  it("lists who's in without names, or not at all, as the merchant chose", () => {
    const anon = offerPage({ ...b, offer: { ...b.offer, roster: "anon" } }, [{ seq: 7, name: "王阿姨", pieces: 2 }], NOW);
    expect(anon.roster).toEqual([{ seq: 7, name: null, pieces: 2 }]);
    const off = offerPage({ ...b, offer: { ...b.offer, roster: "off" } }, [{ seq: 7, name: "王阿姨", pieces: 2 }], NOW);
    expect(off.roster).toEqual([]);
    expect(off.orders).toBe(1);
  });

  it("says whether a group buy is open, closed, or its shop isn't taking orders", () => {
    expect(stateOf(b, NOW)).toBe("open");
    expect(stateOf(b, b.offer.closesAt)).toBe("closed");
    expect(stateOf({ ...b, offer: { ...b.offer, status: "closed" } }, NOW)).toBe("closed");
    expect(stateOf({ ...b, shop: { ...b.shop, status: "paused" } }, NOW)).toBe("paused");
  });

  it("shows a buyer their own order, with only the end of their number", () => {
    const view = buyerOrder(mine);
    expect(view).toMatchObject({ seq: 7, name: "王阿姨", tail: "0134", wechat: "wang_ayi", note: "下午来拿", status: "new", paid: false, picked: false, goods: 7600, fee: 0, final: 7600 });
    expect(view.lines).toEqual([{ itemId: "rice", name: "五常大米 10kg", unit: "bag", price: 3800, qty: 2000, actual: null, amount: 7600 }]);
    expect(JSON.stringify(view)).not.toContain("6045550134");
    const page = orderPage(b, mine, NOW);
    expect(page.point).toMatchObject({ id: "west", name: "温哥华西区" });
    expect(page.rule).toBeNull();
    expect(page.shop).toEqual({ slug: "rice-test", name: "大米团（测试）", contact: "微信 rice-test", pay: "e-Transfer: pay@example.com" });
    expect(page.mayChange).toBe(true);
    expect(orderPage(b, { ...mine, paidAt: NOW }, NOW).mayChange).toBe(false);
  });
});
