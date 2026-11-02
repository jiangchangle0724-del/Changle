import { describe, expect, it } from "vitest";
import { fingerprint, normalize, similarity } from "../src/dedupe";
import { hash } from "../src/store";
import { pairs } from "./fixtures/dedupe/pairs.json";

const date = "2026-11-01";
const venue = "v-orpheum";

describe("saved title pairs", () => {
  it.each(pairs)("$a / $b: $expect", (pair) => {
    const a = normalize(pair.a);
    const b = normalize(pair.b);
    expect(a).toBe(pair.normalizedA);
    expect(b).toBe(pair.normalizedB);
    const score = similarity(pair.a, pair.b);
    expect(Math.abs(score - pair.similarity)).toBeLessThanOrEqual(0.001);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(similarity(pair.b, pair.a)).toBe(score);
    expect(a === b ? "same" : score >= 0.85 ? "suspect" : "different").toBe(pair.expect);
    expect(fingerprint(pair.a, date, venue) === fingerprint(pair.b, date, venue)).toBe(pair.expect === "same");
  });
});

describe("normalize", () => {
  it.each([
    ["ＣＡＦÉ_Concert™ Café e\u1AB0", "cafe concerttm e"],
    ["tickets ticket Vancouver YVR the a an and at vs v with presents live in of", ""],
    ["2019 2020 2029 2030 2039 2040 x2026 2026x 12026", "12026 2019 2026x 2040 x2026"],
    ["Rock_&_Roll / Rock—Roll! 42", "42 rock roll"],
    ["中 文，读\t书\n会 温 哥 华", "中文读书会"],
    ["中文温哥华读书会温哥华", "中文读书会"],
    ["㐀 㐁 﨎 中文 English 中文", "english 㐀㐁﨎中文 中文"],
    ["𐐀 龿", "龿 𐐨"],
    ["  中文 English 123  ", "123 english 中文"],
    ["", ""],
    ["___ 🎉 \u0301", ""],
  ])("%j becomes %j", (title, expected) => {
    expect(normalize(title)).toBe(expected);
  });
});

describe("similarity", () => {
  it.each([["", ""], ["tickets 2026", "Jazz"], ["Jazz", "温哥华"], ["!!!", "???"]])(
    "returns zero when either title has no words: %j / %j", (a, b) => {
      expect(similarity(a, b)).toBe(0);
    },
  );

  it("recognizes subsets in either direction and ignores repeated words", () => {
    expect(similarity("Jazz Jazz", "Jazz Night")).toBe(1);
    expect(similarity("Jazz Night", "Jazz Jazz")).toBe(1);
  });

  it("compares characters even without shared tokens", () => {
    expect(similarity("abc", "adc")).toBeCloseTo(2 / 3, 12);
    expect(similarity("abc", "xyz")).toBe(0);
    expect(similarity("𐐨", "𐐩")).toBe(0);
  });

  it("uses the intersection ratios as well as the full title ratio", () => {
    expect(similarity("longshared x", "longshared yyyyyyyyyyyyyyyy")).toBeCloseTo(20 / 22, 12);
    expect(similarity("longshared yyyyyyyyyyyyyyyy", "longshared x")).toBeCloseTo(20 / 22, 12);
    expect(similarity("abc x", "abc y")).toBeCloseTo(0.8, 12);
  });
});

describe("fingerprint", () => {
  it("uses the store hash of normalized title, date and venue in the specified format", () => {
    expect(fingerprint("The Café Concert 2026", date, venue))
      .toBe(`fp-${hash("cafe concert|2026-11-01|v-orpheum")}`);
    expect(fingerprint("Concert Cafe", date, venue))
      .toBe(fingerprint("The Café Concert 2026", date, venue));
  });

  it("distinguishes dates, venues, and different titles even when similarity is one", () => {
    const original = fingerprint("Jazz", date, venue);
    expect(fingerprint("Jazz", "2026-11-02", venue)).not.toBe(original);
    expect(fingerprint("Jazz", date, "v-rogers")).not.toBe(original);
    expect(fingerprint("Jazz", date, null)).not.toBe(original);
    expect(fingerprint("Jazz Night", date, venue)).not.toBe(original);
  });

  it("represents a missing venue as the empty string", () => {
    expect(fingerprint("Jazz", date, null)).toBe(`fp-${hash("jazz|2026-11-01|")}`);
    expect(fingerprint("Jazz", date, null)).toBe(fingerprint("Jazz", date, ""));
  });
});
