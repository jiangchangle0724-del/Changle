// Things we add by hand: the lists a place is on, Steve's picks, and the checks on those files.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LISTS_FILE, PICKS_FILE, checkLists, checkPicks, curatedFor, normName, type ListsFile, type PicksFile } from "../src/server/curated";

test("data files: lists.json and picks.json pass their own checks (CI fails a bad edit)", () => {
  assert.deepEqual(checkLists(LISTS_FILE), []);
  assert.deepEqual(checkPicks(PICKS_FILE), []);
});

test("names: case, accents, branch suffixes and filler words don't stop a match", () => {
  assert.equal(normName("Kissa Tanto"), normName("KISSA TANTO Restaurant"));
  assert.equal(normName("Breka Bakery & Café - Davie"), normName("Breka Bakery and Cafe"));
  assert.equal(normName("St. Lawrence"), normName("St Lawrence Restaurant"));
  assert.equal(normName("Published on Main (Vancouver)"), normName("Published on Main"));
  assert.equal(normName("麒麟川菜 Kirin Sichuan"), normName("麒麟川菜 kirin sichuan"));
  assert.notEqual(normName("Anh and Chi"), normName("Chi"));
});

const lists: ListsFile = {
  updated: "2026-11-01",
  sources: { michelin: { zh: "米其林指南", en: "MICHELIN Guide", url: "https://guide.michelin.com/" } },
  places: [
    { name: "Kissa Tanto", awards: [{ source: "michelin", label: { zh: "米其林一星", en: "MICHELIN 1 Star" }, year: 2024, url: "https://guide.michelin.com/a" }, { source: "michelin", label: { zh: "米其林一星", en: "MICHELIN 1 Star" }, year: 2025, url: "https://guide.michelin.com/b" }] },
    { name: "Breka Bakery & Café", address: "855 Davie St", awards: [{ source: "michelin", label: { zh: "推荐", en: "Recommended" }, year: 2025, url: "https://guide.michelin.com/c" }] },
  ],
};
const picks: PicksFile = {
  updated: "2026-11-01",
  places: [{ name: "Kissa Tanto", aliases: ["喫茶丹頭"], note: { zh: "意日融合，约会首选", en: "Italian-Japanese, a date-night favourite" }, by: "Steve", links: [{ platform: "小红书", url: "https://www.xiaohongshu.com/x" }] }],
};

test("matching: a listed place gets its badges (newest first) and the pick, by name or alias", () => {
  const k = curatedFor("Kissa Tanto", "263 E Pender St", { lists, picks });
  assert.deepEqual(k.badges?.map((b) => b.year), [2025, 2024]);
  assert.equal(k.recommend?.by, "Steve");
  assert.equal(curatedFor("喫茶丹頭", undefined, { lists, picks }).recommend?.note.en, "Italian-Japanese, a date-night favourite");
  assert.deepEqual(curatedFor("Some Other Place", undefined, { lists, picks }), {});
});

test("matching: an entry with an address only matches the branch at that street number", () => {
  assert.ok(curatedFor("Breka Bakery & Café - Davie", "855 Davie St, Vancouver", { lists, picks }).badges);
  assert.equal(curatedFor("Breka Bakery & Café - Bute", "818 Bute St, Vancouver", { lists, picks }).badges, undefined);
  // Without an address from Google we can't tell branches apart, so the name decides.
  assert.ok(curatedFor("Breka Bakery & Café", undefined, { lists, picks }).badges);
});

test("checks: missing sources, years, links and notes are caught", () => {
  const bad = checkLists({
    updated: "soon",
    sources: { michelin: { zh: "米其林", en: "MICHELIN", url: "http://insecure" } },
    places: [
      { name: "", awards: [] },
      { name: "A", awards: [{ source: "nope", label: { zh: "", en: "x" }, year: 1890, url: "ftp://x" }] },
      { name: "A", awards: [{ source: "michelin", label: { zh: "一星", en: "1 Star" }, url: "https://x" }] },
    ],
  });
  for (const want of ["updated", "source michelin", "name is missing", "at least one award", "unknown source", "label", "year", "https page", "listed twice"]) {
    assert.ok(bad.some((p) => p.includes(want)), `catches: ${want}\n${bad.join("\n")}`);
  }
  const badPicks = checkPicks({ updated: "2026-11-01", places: [{ name: "B", note: { zh: "很长".repeat(40), en: "ok" }, links: [{ platform: "", url: "http://x" }] }] });
  for (const want of ["one line", "platform", "https url"]) assert.ok(badPicks.some((p) => p.includes(want)), `catches: ${want}\n${badPicks.join("\n")}`);
});
