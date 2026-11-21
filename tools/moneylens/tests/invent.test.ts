/**
 * Invented text (src/fixture/invent.ts): the shape of what went in, and nothing else of it.
 * Every "real" text in here is made up for the test.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseDay } from "../src/core/dates";
import { inventAll, Inventor } from "../src/fixture/invent";
import { shapeOf } from "../src/fixture/summary";
import { seeded } from "./seeded";

test("letters become other letters and digits other digits, and the shape stays", () => {
  const texts = ["CAFE MAPLE #12", "North Shore Grocer, Unit 4-B", "e-transfer to j.sample@example.test", "4500 1234 5678 9012", "-1,234.56", "$82.17", "(4.50)", "Zoë's Crêperie"];
  for (const seed of [1, 2, 3]) {
    const out = inventAll(texts, seeded(seed));
    out.forEach((made, i) => assert.equal(shapeOf(made), shapeOf(texts[i]!.normalize("NFKD").replace(/\p{M}/gu, "")), texts[i]));
    // nothing of the words or the numbers is left
    const all = out.join("\n");
    for (const gone of ["CAFE", "MAPLE", "Shore", "Grocer", "sample", "example", "4500", "1234", "5678", "9012", "234.56", "82.17", "Zo", "perie"]) assert.ok(!all.includes(gone), `${gone} (seed ${seed})`);
  }
  // the same seed invents the same text, another seed another
  assert.deepEqual(inventAll(texts, seeded(7)), inventAll(texts, seeded(7)));
  assert.notDeepEqual(inventAll(texts, seeded(7)), inventAll(texts, seeded(8)));
});

test("the words statements are built from stay, in English, French and Chinese", () => {
  const kept = ["Opening balance", "Total withdrawals and deposits", "Statement period", "Solde d'ouverture", "Dépôts et retraits", "PAYMENT - THANK YOU", "期初余额", "交易日期", "Page 1 of 3".replace(/\d/g, "0")];
  assert.deepEqual(inventAll(kept, seeded(1)), kept);
  // a name beside them goes; they stay
  const [mixed, han] = inventAll(["Account holder: Avery Sample", "余额 张三超市"], seeded(2));
  assert.match(mixed!, /^Account [a-z]{6}: [A-Z][a-z]{4} [A-Z][a-z]{5}$/);
  assert.match(han!, /^余额 [甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]{4}$/);
});

test("zeros and years stay; every other number is invented digit by digit, a round one too", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const [zero, year, account, cents] = inventAll(["0.00", "2026", "0012345", "100.05"], seeded(seed));
    assert.equal(zero, "0.00");
    assert.equal(year, "2026");
    assert.match(account!, /^0\d{6}$/);
    assert.match(cents!, /^[1-9]\d\d\.\d\d$/);
  }
  // "1,000.00" is not kept round: over many inventions its cents and its thousands take every value
  const made = new Set(Array.from({ length: 40 }, (_, seed) => inventAll(["1,000.00"], seeded(seed + 1))[0]!));
  assert.ok(made.size >= 39 && !made.has("1,000.00") && [...made].every((text) => /^[1-9],\d{3}\.\d\d$/.test(text)), [...made].join(" "));
});

test("a month stays a month and a day a day, moved, with the lines in the order they were in", () => {
  const texts = ["Oct 02", "Oct 02", "Oct 15", "OCT 31", "Nov 03", "02 nov. 2026", "05-Nov-26", "October 9, 2026"];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const out = inventAll(texts, seeded(seed));
    const days = out.map((text) => parseDay(text.replace(/^(\w{3}) (\d\d)$/i, "$1 $2, 2026"), "DMY"));
    assert.ok(days.every((day) => day !== null), out.join(" | "));
    // the same day twice is still the same day, and October's lines still come before November's
    assert.equal(days[0], days[1]);
    assert.ok(days[0]! < days[2]! && days[2]! < days[3]! && days[3]! < days[4]!, out.join(" | "));
    // the forms stay: three letters and two digits, capitals, the full stop, the two-digit year
    assert.match(out[0]!, /^[A-Z][a-zéû]{2,3} \d\d$/);
    assert.match(out[3]!, /^[A-ZÉÛ]{3,4} \d\d$/);
    assert.match(out[5]!, /^\d\d [a-zéû]{3,4}\. 2026$/);
    assert.match(out[6]!, /^\d\d-[A-Z][a-zéû]{2,3}-26$/);
    assert.match(out[7]!, /^[A-Z][a-z]+ \d\d?, 2026$/);
    // a day up to the 12th stays one, a later day stays later, and none passes the 28th
    const number = (text: string): number => Number(/\d+/.exec(text)![0]);
    assert.ok(number(out[0]!) <= 12 && number(out[2]!) > 12 && number(out[3]!) > 12 && number(out[3]!) <= 28);
    assert.notEqual(out[0]!.slice(0, 3), "Oct");
  }
  // a statement that runs from December into January keeps its months: moved, one of them would land on the wrong side of the year
  assert.match(inventAll(["Dec 28", "Jan 03"], seeded(1)).join(" "), /^Dec \d\d Jan \d\d$/);
  // a month's name with no number beside it is a word like another
  assert.equal(inventAll(["MAY CONTAIN NUTS"], seeded(1))[0]!.length, 16);
  assert.ok(!inventAll(["MARCH HARE BOOKS"], seeded(1))[0]!.includes("HARE"));
});

test("dates in numbers stay real dates, read the same way round", () => {
  const read = (texts: readonly string[], style: "MDY" | "DMY" | "YMD", seed: number): string[] => inventAll(texts, seeded(seed)).map((text) => parseDay(text, style) ?? `not a day: ${text}`);
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    // the month first: the second number passes 12
    const monthFirst = read(["10/02/2026", "10/15/2026", "10/31/2026", "11/03/2026"], "MDY", seed);
    assert.ok(monthFirst.every((day) => /^2026-\d\d-\d\d$/.test(day)), monthFirst.join());
    assert.deepEqual([...monthFirst].sort(), monthFirst);
    // the day first
    const dayFirst = read(["02/10/2026", "15/10/2026", "31/10/2026", "03/11/2026"], "DMY", seed);
    assert.ok(dayFirst.every((day) => /^2026-\d\d-\d\d$/.test(day)), dayFirst.join());
    assert.deepEqual([...dayFirst].sort(), dayFirst);
    // the year first, with and without marks between; a clock after it
    for (const texts of [["2026-10-02", "2026-10-15"], ["2026/10/02", "2026/10/15"], ["20261002", "20261015"]]) {
      const made = read(texts, "YMD", seed);
      assert.ok(made.every((day) => /^2026-\d\d-\d\d$/.test(day)) && made[0]! < made[1]!, made.join());
    }
    // two numbers and a stroke, as statements print a day
    const short = inventAll(["10/02", "10/15", "10/31"], seeded(seed));
    assert.ok(short.every((text) => /^\d\d\/\d\d$/.test(text) && parseDay(`${text}/2026`, "MDY")), short.join());
  }
  // a file in which no day passes 12 stays one: which number is the day is as open as it was
  for (const seed of [1, 2, 3, 4]) assert.ok(inventAll(["10/01/2026", "10/02/2026", "10/05/2026", "10/07/2026"], seeded(seed)).every((text) => /^(0[1-9]|1[0-2])\/(0[1-9]|1[0-2])\/2026$/.test(text)));
  // an amount is not a date: its two numbers and a point are digits like any others
  assert.match(inventAll(["12.50", "1.05"], seeded(3)).join(" "), /^\d\d\.\d\d \d\.\d\d$/);
});

test("a text that wasn't learned first is still invented", () => {
  const inventor = new Inventor(seeded(5));
  assert.match(inventor.text("Oct 31 CAFE 4.50"), /^[A-Z][a-zéû]{2,3} 28 [A-Z]{4} \d\.\d\d$/);
});
