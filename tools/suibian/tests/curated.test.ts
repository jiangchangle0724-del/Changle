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
    { name: "Sea Harbour Seafood Restaurant", aliases: ["海港酒家"], address: "8888 River Rd", awards: [{ source: "michelin", label: { zh: "推荐", en: "Recommended" }, year: 2026, url: "https://guide.michelin.com/d" }] },
    { name: "iDen & QuanJuDe Beijing Duck House", aliases: ["全聚德"], address: "2808 Cambie St", awards: [{ source: "michelin", label: { zh: "米其林一星", en: "MICHELIN 1 Star" }, year: 2026, url: "https://guide.michelin.com/e" }] },
    { name: "Nook", address: "781 Denman St", awards: [{ source: "michelin", label: { zh: "推荐", en: "Recommended" }, year: 2026, url: "https://guide.michelin.com/f" }] },
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

test("matching: Google's two-language names and unit numbers still find the listed branch", () => {
  // Unit before the street number, English and Chinese names together, or just the Chinese one.
  assert.ok(curatedFor("Sea Harbour Seafood Restaurant 海港酒家", "150-8888 River Rd, Richmond", { lists, picks }).badges);
  assert.ok(curatedFor("海港酒家", "8888 River Rd #150, Richmond", { lists, picks }).badges);
  assert.ok(curatedFor("全聚德北京烤鸭店", "2808 Cambie St, Vancouver", { lists, picks }).badges);
  assert.ok(curatedFor("Nook Denman", "781 Denman St, Vancouver", { lists, picks }).badges);
  // The longer-name match needs the same street number, and never applies to entries without an address.
  assert.equal(curatedFor("Sea Harbour Seafood Restaurant 海港酒家", "4000 No. 3 Rd, Richmond", { lists, picks }).badges, undefined);
  assert.equal(curatedFor("Nook Pizza", undefined, { lists, picks }).badges, undefined);
  assert.equal(curatedFor("Kissa Tanto Bar", "263 E Pender St", { lists, picks }).badges, undefined);
  // Whole words only: "Nook" isn't inside "Nookie".
  assert.equal(curatedFor("Nookie Burger", "781 Denman St", { lists, picks }).badges, undefined);
});

test("badges: one from each list before a second from the same list, four at most", () => {
  const many: ListsFile = {
    updated: "2026-11-11",
    sources: Object.fromEntries(["a", "b", "c", "d", "e"].map((x) => [x, { zh: x, en: x, url: "https://example.com/" }])),
    places: [
      {
        name: "Busy Place",
        awards: [
          { source: "a", label: { zh: "a1", en: "a1" }, year: 2026, url: "https://example.com/a1" },
          { source: "a", label: { zh: "a2", en: "a2" }, year: 2026, url: "https://example.com/a2" },
          { source: "b", label: { zh: "b", en: "b" }, year: 2026, url: "https://example.com/b" },
          { source: "c", label: { zh: "c", en: "c" }, year: 2024, url: "https://example.com/c" },
          { source: "d", label: { zh: "d", en: "d" }, year: 2025, url: "https://example.com/d" },
          { source: "e", label: { zh: "e", en: "e" }, year: 2023, url: "https://example.com/e" },
        ],
      },
    ],
  };
  assert.deepEqual(curatedFor("Busy Place", undefined, { lists: many }).badges?.map((b) => b.label.en), ["a1", "b", "d", "c"]);
});

test("lists added 2026-11-11: OpenTable, enRoute, Yelp and the Chinese Restaurant Awards' Elite 30 Canada", () => {
  const en = (name: string, address?: string) => curatedFor(name, address).badges?.map((b) => b.label.en) ?? [];
  assert.ok(en("Dovetail", "1079 Mainland St, Vancouver").includes("OpenTable Top 100 Canada"));
  assert.ok(en("Sumibiyaki Arashi", "363 E Broadway, Vancouver").includes("OpenTable Top 100 Canada"), "on four lists: all four show");
  assert.ok(en("Nero Tondo", "1879 Powell St, Vancouver").includes("enRoute Best New Restaurants #6"));
  assert.ok(en("Manoush'eh", "620 Davie St, Vancouver").includes("Yelp Top 100 in Canada"));
  assert.ok(en("Golden Paramount Seafood Restaurant 金百樂海鮮酒家", "110-8111 Anderson Rd, Richmond").includes("Chinese Restaurant Awards Elite 30 Canada #16"));
  assert.ok(en("Long's Noodle House", "4731 Garden City Rd #140, Richmond").includes("Chinese Restaurant Awards Elite 30 Canada #21"));
  assert.ok(en("Bamboo Grove Restaurant", "6920 No. 3 Rd, Richmond").includes("Chinese Restaurant Awards Elite 30 Canada #6"));
  // Another place of the same name elsewhere isn't the listed one.
  assert.deepEqual(en("Bamboo Grove", "1234 Kingsway, Burnaby"), []);
  assert.deepEqual(en("Happy Noodle House", "8888 Main St, Vancouver"), []);
});

test("matching: every place in lists.json finds its own badges by its own name and address", () => {
  const missed = LISTS_FILE.places.filter((p) => !curatedFor(p.name, p.address).badges?.length).map((p) => p.name);
  assert.deepEqual(missed, []);
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
