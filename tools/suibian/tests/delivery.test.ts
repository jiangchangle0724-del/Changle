// Ordering in from a delivery app: which name each link searches for, and where it goes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DELIVERY_APPS, searchName } from "../src/client/delivery";

const app = (id: string) => DELIVERY_APPS.find((a) => a.id === id)!;

test("delivery: the English part of a two-language name, the name without its branch otherwise", () => {
  assert.equal(searchName("金閣海鮮酒家 Golden Paramount Seafood Restaurant"), "Golden Paramount Seafood Restaurant");
  assert.equal(searchName("Chef Hung 鴻師傅台灣牛肉麵"), "Chef Hung");
  assert.equal(searchName("Din Tai Fung 鼎泰豐 (Richmond)"), "Din Tai Fung");
  assert.equal(searchName("鼎泰豐 (Richmond)"), "鼎泰豐", "a branch in brackets is not the name");
  assert.equal(searchName("小肥羊火锅"), "小肥羊火锅");
  assert.equal(searchName("Phở 99"), "Phở 99");
  assert.equal(searchName("示例 · 金满楼点心"), "示例 · 金满楼点心");
  assert.equal(searchName("Kintaro Ramen"), "Kintaro Ramen");
});

test("delivery: Uber Eats and DoorDash search for the place; Skip and Fantuan copy the name and open their site", () => {
  const name = "Chef Hung 鴻師傅台灣牛肉麵";
  assert.equal(app("ubereats").href(name), "https://www.ubereats.com/search?q=Chef%20Hung");
  assert.equal(app("doordash").href(name), "https://www.doordash.com/en-CA/search/store/Chef%20Hung");
  assert.equal(app("doordash").href("Pizza / Pasta Bar"), "https://www.doordash.com/en-CA/search/store/Pizza%20Pasta%20Bar", "no extra path level");
  for (const id of ["fantuan", "skip"]) {
    assert.match(app(id).href(name), /^https:\/\/www\.(fantuanorder|skipthedishes)\.com\/$/);
    assert.equal(app(id).copy?.(name), "Chef Hung");
  }
  assert.equal(app("ubereats").copy, undefined);
  assert.deepEqual(
    DELIVERY_APPS.map((a) => a.label.zh),
    ["Uber Eats", "DoorDash", "饭团", "Skip"],
  );
  for (const a of DELIVERY_APPS) assert.ok(a.label.zh && a.label.en, `${a.id} has both languages`);
});
