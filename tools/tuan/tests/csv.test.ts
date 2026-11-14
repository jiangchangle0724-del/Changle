import { describe, expect, it } from "vitest";
import { ordersCsv, type CsvWords } from "../src/engine/csv";
import { finalGoods, goodsOf, piecesOf } from "../src/engine/money";
import { dueOf } from "../src/engine/summary";
import { vancouverTime } from "../src/engine/time";
import type { OfferBook, Order, OrderLine } from "../src/engine/types";
import { sampleBook } from "./sample";

const NOW = vancouverTime("2026-11-13", 15, 26);
const words: CsvWords = {
  headers: ["No.", "Code", "Status", "Name", "Phone", "WeChat", "How", "Place", "Address", "Note", "Item", "Unit", "Price", "Amount", "Weighed", "Comes to", "Delivery", "To collect", "Paid", "Handed over", "Ordered"],
  status: { new: "新订单", confirmed: "已确认", cancelled: "已取消" },
  how: { pickup: "自提", delivery: "送货" },
  unit: { each: "个", box: "盒", bag: "袋", pack: "包", portion: "份", lb: "磅" },
  yes: "是",
};

function line(book: OfferBook, itemId = "rice", qty = 1000, actual: number | null = null): OrderLine {
  const item = book.items.find((item) => item.id === itemId)!;
  return { itemId: item.id, name: item.name, unit: item.unit, price: item.price, qty, actual };
}

function order(book: OfferBook, seq: number, lines = [line(book)], more: Partial<Order> = {}): Order {
  const fee = more.fee ?? 0;
  const final = finalGoods(lines);
  return {
    code: `ABC${seq}22`, offerId: book.offer.id, seq, name: "王阿姨", phone: "6045550188", wechat: "rice-buyer",
    how: "pickup", pickupId: "west", ruleId: null, address: "", note: "门口见", status: "new",
    paidAt: null, pickedAt: null, goods: goodsOf(lines), fee, final: final === null ? null : final + fee,
    pieces: piecesOf(lines), rev: 0, createdAt: NOW, updatedAt: NOW, lines, ...more,
  };
}

/** Read quoted fields (including embedded newlines), checking every record's CRLF. */
function readCsv(csv: string): string[][] {
  expect(csv[0]).toBe("\uFEFF");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let at = 1; at < csv.length; at++) {
    const char = csv[at];
    if (char === '"') {
      if (quoted && csv[at + 1] === '"') { value += '"'; at++; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(value); value = "";
    } else if (!quoted && char === "\r") {
      expect(csv[++at]).toBe("\n");
      row.push(value); rows.push(row); row = []; value = "";
    } else {
      if (!quoted) expect(char).not.toBe("\n");
      value += char;
    }
  }
  expect(quoted).toBe(false);
  expect(row).toEqual([]);
  expect(value).toBe("");
  for (const record of rows) expect(record).toHaveLength(21);
  expect(csv.endsWith("\r\n")).toBe(true);
  return rows;
}

describe("orders CSV", () => {
  it("writes the supplied header and standing orders by seq without changing its inputs", () => {
    const book = sampleBook(NOW);
    const orders = [order(book, 3, undefined, { status: "confirmed" }), order(book, 2, undefined, { status: "cancelled" }), order(book, 1)];
    const before = structuredClone({ book, orders, words });
    const rows = readCsv(ordersCsv(book, orders, words));
    expect(rows[0]).toEqual(words.headers);
    expect(rows.slice(1).map((row) => row.slice(0, 4))).toEqual([
      ["1", "ABC122", "新订单", "王阿姨"], ["3", "ABC322", "已确认", "王阿姨"],
    ]);
    expect({ book, orders, words }).toEqual(before);
  });

  it("fills order columns only on its first line while keeping identity on every line", () => {
    const book = sampleBook(NOW);
    const o = order(book, 1, [line(book, "eggs"), line(book, "rice", 2000), line(book, "millet")], { paidAt: 0, pickedAt: 0, address: "pickup must omit this" });
    const rows = readCsv(ordersCsv(book, [o], words)).slice(1);
    expect(rows[0]).toEqual([
      "1", "ABC122", "新订单", "王阿姨", "604-555-0188", "rice-buyer", "自提", "温哥华西区", "", "门口见",
      "土鸡蛋 30 枚", "盒", "13.50", "1", "", "13.50", "0.00", "98.30", "是", "是", "2026-11-13 15:26",
    ]);
    expect(rows.map((row) => row[10])).toEqual(["土鸡蛋 30 枚", "五常大米 10kg", "黄小米 2lb"]);
    expect(rows[1].slice(12, 16)).toEqual(["38.00", "2", "", "76.00"]);
    for (const row of rows.slice(1)) {
      expect(row.slice(0, 4)).toEqual(rows[0].slice(0, 4));
      expect(row.slice(4, 10)).toEqual(Array(6).fill(""));
      expect(row.slice(16)).toEqual(Array(5).fill(""));
    }
  });

  it.each([
    [null, "", "25.49", "25.49"], [1620, "1.62", "27.52", "27.52"], [0, "0", "0.00", "0.00"],
  ])("exports an estimated or weighed line (actual %s) in whole cents", (actual, weighed, comesTo, due) => {
    const book = sampleBook(NOW);
    const row = readCsv(ordersCsv(book, [order(book, 1, [line(book, "lamb", 1500, actual)])], words))[1];
    expect(row.slice(11, 16)).toEqual(["磅", "16.99", "1.5", weighed, comesTo]);
    expect(row[17]).toBe(due);
  });

  it("keeps the stored delivery fee, including free delivery above the area's threshold", () => {
    const book = sampleBook(NOW);
    const rule = book.rules.find((rule) => rule.id === "rmd")!;
    const delivery = { how: "delivery" as const, pickupId: null, ruleId: rule.id, address: "123 Test Street" };
    const charged = order(book, 1, [line(book)], { ...delivery, fee: rule.fee });
    const free = order(book, 2, [line(book, "rice", 2000)], delivery);
    expect(charged.goods).toBeLessThan(rule.freeFrom!);
    expect(free.goods).toBeGreaterThan(rule.freeFrom!);
    const rows = readCsv(ordersCsv(book, [charged, free], words)).slice(1);
    expect(rows.map((row) => row.slice(6, 9))).toEqual(Array(2).fill(["送货", "列治文", "123 Test Street"]));
    expect(rows.map((row) => row.slice(16, 20))).toEqual([["5.00", "43.00", "", ""], ["0.00", "76.00", "", ""]]);
    // Weighing changes the goods, never the fee settled when ordering.
    const weighed = order(book, 3, [line(book, "lamb", 1000, 5000)], { ...delivery, fee: 500 });
    expect(readCsv(ordersCsv(book, [weighed], words))[1].slice(16, 18)).toEqual(["5.00", "89.95"]);
  });

  it.each(["pickup", "delivery"] as const)("leaves a removed %s place empty", (how) => {
    const book = sampleBook(NOW);
    const o = order(book, 1, undefined, { how, pickupId: "gone", ruleId: "gone" });
    expect(readCsv(ordersCsv(book, [o], words))[1][7]).toBe("");
  });

  it("writes the exact CSV escaping and formula guards for hostile text", () => {
    const book = sampleBook(NOW);
    book.rules[2].label = "+Area";
    const o = order(book, 1, [{ ...line(book), name: "\tItem" }], {
      name: '=HYPERLINK("http://x","y")', wechat: "@abc", how: "delivery", pickupId: null, ruleId: "rmd",
      address: "-123 Test Street", note: 'Leave, "please"\nby the door',
    });
    const csv = ordersCsv(book, [o], words);
    const expected = [
      "1", "ABC122", "新订单", `"'=HYPERLINK(""http://x"",""y"")"`, "604-555-0188", "'@abc", "送货", "'+Area", "'-123 Test Street",
      '"Leave, ""please""\nby the door"', "'\tItem", "袋", "38.00", "1", "", "38.00", "0.00", "38.00", "", "", "2026-11-13 15:26",
    ].join(",");
    expect(csv).toBe("\uFEFF" + words.headers.join(",") + "\r\n" + expected + "\r\n");
    expect(readCsv(csv)[1].slice(3, 11)).toEqual([
      `'${o.name}`, "604-555-0188", "'@abc", "送货", "'+Area", "'-123 Test Street", o.note, "'\tItem",
    ]);
  });

  it.each(["=1", "+1", "-1", "@abc", "\ttext", "\rtext"])("guards every untrusted column starting with %j", (value) => {
    const book = sampleBook(NOW);
    book.points[0].name = value;
    book.rules[2].label = value;
    const pickup = order(book, 1, [{ ...line(book), name: value }], { name: value, wechat: value, note: value });
    const delivery = { ...pickup, seq: 2, how: "delivery" as const, pickupId: null, ruleId: "rmd", address: value };
    const rows = readCsv(ordersCsv(book, [pickup, delivery], words)).slice(1);
    for (const row of rows) for (const col of [3, 5, 7, 9, 10]) expect(row[col]).toBe(`'${value}`);
    expect(rows[1][8]).toBe(`'${value}`);
  });

  it.each([
    ["plain", "plain"], [" leading", '" leading"'], ["trailing ", '"trailing "'], [" ", '" "'],
    ["a,b", '"a,b"'], ['a"b', '"a""b"'], ["a\nb", '"a\nb"'], ["a\rb", '"a\rb"'], ["a\r\nb", '"a\r\nb"'], ["", ""],
  ])("escapes %j in headers and text fields", (value, escaped) => {
    const book = sampleBook(NOW);
    const translated = { ...words, headers: words.headers.map((header, at) => at === 0 ? value : header) };
    const csv = ordersCsv(book, [order(book, 1, undefined, { note: value })], translated);
    expect(csv.startsWith(`\uFEFF${escaped},Code,`)).toBe(true);
    expect(csv).toContain(`,${escaped},五常大米 10kg,`);
    expect(readCsv(csv)[1][9]).toBe(value);
  });

  it.each([
    ["6045550188", "604-555-0188"], ["16045550188", "1-604-555-0188"], ["8613800138000", "8613800138000"],
    ["(604) 555-0188", "604-555-0188"], ["+1 (604) 555-0188", "1-604-555-0188"], ["26045550188", "26045550188"],
  ])("formats only the digits of phone %s", (phone, formatted) => {
    const book = sampleBook(NOW);
    expect(readCsv(ordersCsv(book, [order(book, 1, undefined, { phone })], words))[1][4]).toBe(formatted);
  });

  it("writes only the BOM and header when no orders stand", () => {
    const book = sampleBook(NOW);
    const expected = "\uFEFF" + words.headers.join(",") + "\r\n";
    expect(ordersCsv(book, [], words)).toBe(expected);
    expect(ordersCsv(book, [order(book, 1, undefined, { status: "cancelled" })], words)).toBe(expected);
    expect(readCsv(expected)).toEqual([words.headers]);
  });

  it("lets the To collect column add up to the standing orders exactly once", () => {
    const book = sampleBook(NOW);
    const orders = [
      order(book, 3, [line(book, "rice", 2000), line(book, "eggs")]),
      order(book, 2, undefined, { status: "cancelled" }),
      order(book, 1, [line(book, "lamb", 1500, 1620), line(book, "millet")], { fee: 500, paidAt: NOW }),
      order(book, 4, [line(book, "lamb", 1500), line(book, "rice")]),
    ];
    const rows = readCsv(ordersCsv(book, orders, words)).slice(1);
    // Convert decimal text back to cents without floating-point dollar sums.
    const cents = (value: string) => value === "" ? 0 : Number(value.replace(".", ""));
    expect(rows.reduce((sum, row) => sum + cents(row[17]), 0)).toBe(
      orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + dueOf(o), 0),
    );
  });
});
