import { describe, expect, it } from "vitest";
import csv from "../golden/golden.csv?raw";
import fixture from "./fixtures/eval/stored-handmade.json";
import { parseGolden, score, formatReport, readSources, type GoldenRow, type StoredEvent } from "../src/eval";
import { SOURCES } from "../src/sources";

const golden = parseGolden(csv);
const stored = fixture.results;
const six = ["ticketmaster", "luma", "vpl", "rpl", "rogersforum", "commodore"];
const row = (overrides: Partial<GoldenRow> = {}): GoldenRow => ({
  ...golden[0], id: "A", source: "test", url: "https://example.com/A", sameAs: "", ...overrides,
});
const event = (overrides: Partial<StoredEvent> = {}): StoredEvent => ({
  ...stored[0], id: "a", source: "test", url: "https://example.com/A", ...overrides,
});
const one = (r: Partial<GoldenRow> = {}, e: Partial<StoredEvent> = {}) => score([row(r)], [event(e)], ["test"]);
const pair = () => [row(), row({ id: "B", url: "https://example.com/B", sameAs: "A" })];
const pairEvents = () => [event(), event({ id: "b", url: "https://example.com/B", duplicate_of: "a" })];

describe("golden CSV and source names", () => {
  it("reads all 40 rows, quoted commas, doubled quotes, empty cells and same_as", () => {
    expect(golden).toHaveLength(40);
    expect(golden.map((r) => r.id)).toEqual(Array.from({ length: 40 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`));
    expect(golden[2].title).toBe("Zahra Ebrahim: Women, Walking");
    expect(golden[5].notes).toContain('"Free event - registration required"');
    expect(golden[5].sameAs).toBe("G05");
    expect(golden[0].price).toBe("");
    expect(parseGolden("\uFEFF" + csv.replace(/\r?\n/g, "\r\n"))).toEqual(golden);
    expect(parseGolden(csv.trimEnd())).toEqual(golden);
    expect(parseGolden("")).toEqual([]);
  });
  it("rejects broken CSV instead of silently shifting columns", () => {
    expect(() => parseGolden("id,source\nA,test")).toThrow("columns");
    const header = csv.split(/\r?\n/)[0];
    expect(() => parseGolden(header + '\n"unclosed')).toThrow("Unclosed");
    expect(() => parseGolden(header + '\n"a"x,b')).toThrow("quoting");
    expect(() => parseGolden(header + "\nA,test")).toThrow("row 2");
  });
  it("only maps luma-vancouver and preserves other source ids", () => {
    expect(readSources(["luma-vancouver", "vpl", "ubc", "new-source"])).toEqual(["luma", "vpl", "ubc", "new-source"]);
  });
});

describe("hand-made fixture acceptance", () => {
  it("scores the six sources and identifies every deliberate mistake", () => {
    const r = score(golden, stored, six);
    expect(r).toMatchObject({
      read: 21, matched: 20, notFound: ["G04"], unread: { ubc: 3, eventbrite: 15, evergreen: 1 },
      date: { right: 19, of: 20, pct: 95 }, venue: { right: 19, of: 20, pct: 95 },
      category: { right: 19, of: 20, pct: 95 }, area: { right: 19, of: 20, pct: 95 },
      falseMerges: { right: 2, of: 20, pct: 10 }, missedMerges: { right: 2, of: 6, pct: 33.3 },
      wrong: { date: ["G03"], venue: ["G15"], category: ["G17"], area: ["G20"], falseMerges: ["G13", "G14"], missedMerges: ["G23", "G24"] },
      gateA: false,
    });
  });
  it("reproduces the card's four-source baseline", () => {
    const r = score(golden, stored, readSources(["luma-vancouver", "vpl", "rpl", "ticketmaster"]));
    expect(r).toMatchObject({ read: 18, matched: 17, notFound: ["G04"], missedMerges: { right: 0, of: 0, pct: null }, gateA: false });
    for (const name of ["date", "venue", "category", "area"] as const) expect(r[name]).toEqual({ right: 16, of: 17, pct: 94.1 });
    expect(r.falseMerges).toEqual({ right: 2, of: 17, pct: 11.8 });
  });
  it("uses current SOURCES, which now includes UBC, without inventing stored rows", () => {
    const r = score(golden, stored, readSources(SOURCES.map((s) => s.id)));
    expect(r).toMatchObject({ read: 21, matched: 17, notFound: ["G04", "G05", "G07", "G08"], unread: { eventbrite: 15, commodore: 1, rogersforum: 2, evergreen: 1 }, gateA: false });
    expect(r.date).toEqual({ right: 16, of: 17, pct: 94.1 });
    expect(r.missedMerges.pct).toBeNull();
  });
  it("picks the right listing date even when another night comes first", () => {
    const r = score(golden, [...stored].reverse(), six);
    expect(r.wrong.date).toEqual(["G03"]);
    expect(r.notFound).toEqual(["G04"]);
  });
});

describe("matching and field rules", () => {
  it("normalizes host, Luma alias, query, fragment and trailing slash, preserving path case", () => {
    expect(one({ url: "https://LUMA.COM/Case/" }, { url: "https://lu.ma/Case?q=1#fragment" }).matched).toBe(1);
    expect(one({ url: "https://luma.com/Case" }, { url: "https://lu.ma/case" }).notFound).toEqual(["A"]);
    expect(one({ url: "https://example.com/a%2Fb" }, { url: "https://example.com/a/b" }).matched).toBe(0);
  });
  it("selects the first event on the row's day, or notFound when several have no matching day", () => {
    const r = row();
    const wrongDay = event({ start_at: "2026-11-11T17:30:00-07:00" });
    expect(score([r], [wrongDay, event(), event({ id: "third", category: "wrong" })], ["test"]).category.right).toBe(1);
    expect(score([r], [wrongDay, { ...wrongDay, id: "other" }], ["test"]).notFound).toEqual(["A"]);
    expect(score([r], [wrongDay], ["test"]).wrong.date).toEqual(["A"]);
  });
  it("only scores read sources, and keeps missing rows out of accuracy denominators", () => {
    const r = score([row(), row({ id: "missing", url: "https://example.com/missing" }), row({ source: "unread" })], [event()], ["test"]);
    expect(r).toMatchObject({ read: 2, matched: 1, notFound: ["missing"], unread: { unread: 1 }, date: { right: 1, of: 1, pct: 100 } });
  });
  it.each([
    [{ start: "2026-11-10" }, { start_at: "2026-11-10", all_day: 1 }, true],
    [{ start: "2026-11-10" }, { time_tbd: true }, true],
    [{ start: "2026-11-10" }, { all_day: true }, true],
    [{ start: "2026-11-10" }, {}, false],
    [{ start: "2026-11-10" }, { start_at: "2026-11-11", all_day: true }, false],
    [{}, { all_day: true }, false],
    [{}, { start_at: "2026-11-10T17:30:59-07:00" }, true],
    [{}, { start_at: "2026-11-10T17:31:00-07:00" }, false],
  ] as [Partial<GoldenRow>, Partial<StoredEvent>, boolean][])("compares date/minute and all-day/TBD flags: %j %j", (r, e, ok) => {
    expect(one(r, e).date.right).toBe(Number(ok));
  });
  it.each([
    ["336 E 1st Ave #108, Vancouver", "336 East 1st Avenue", true],
    ["100-7700 Minoru Gate, Richmond", "7700 Minoru Gate", true],
    ["12025 Nordel Way #201, Surrey", "12025 Nordel", true],
    ["10 W N S E Road", "10 West North South East Rd", true],
    ["10 King Boulevard", "11 King Blvd", false],
    ["10 King Street", "10 Queen St", false],
    ["King Street", "King St", false],
    ["10 King Street", null, false],
  ])("compares street keys: %s / %s", (address, venue_address, ok) => {
    expect(one({ address: address! }, { venue_address }).venue.right).toBe(Number(ok));
  });
  it("drops every listed street suffix", () => {
    for (const suffix of "street st avenue ave road rd boulevard blvd drive dr place pl way lane ln court ct crescent cres gate highway hwy mall".split(" ")) {
      expect(one({ address: `10 King ${suffix}` }, { venue_address: "10 King" }).venue.right).toBe(1);
    }
  });
  it("falls back to normalized venue names only without a golden address", () => {
    expect(one({ address: "", venue: "The HALL, #2!" }, { venue_name: "the hall 2" }).venue.right).toBe(1);
    expect(one({ address: "", venue: "图书馆 2" }, { venue_name: "图书馆 2" }).venue.right).toBe(1);
    expect(one({ address: "", venue: "Hall" }, { venue_name: null }).venue.right).toBe(0);
    expect(one({ address: "10 King", venue: "Hall" }, { venue_name: "Hall", venue_address: "11 King" }).venue.right).toBe(0);
  });
  it("compares area and category exactly, including nulls", () => {
    const r = one({}, { category: null, venue_area: "Vancouver" });
    expect(r.wrong.category).toEqual(["A"]);
    expect(r.wrong.area).toEqual(["A"]);
  });
});

describe("merges and Gate A", () => {
  it("recognizes same_as in both directions and passes a measured perfect report", () => {
    const r = score(pair(), pairEvents(), ["test"]);
    expect(r.falseMerges).toEqual({ right: 0, of: 2, pct: 0 });
    expect(r.missedMerges).toEqual({ right: 0, of: 2, pct: 0 });
    expect(r.gateA).toBe(true);
    expect(formatReport(r)).toContain("Gate A: passes");
  });
  it("follows chains through events outside the golden set", () => {
    const es = pairEvents();
    es[1].duplicate_of = "bridge";
    const r = score(pair(), [...es, event({ id: "bridge", url: "https://example.com/bridge", duplicate_of: "a" })], ["test"]);
    expect(r.gateA).toBe(true);
  });
  it("counts a missed pair twice, but only when both partners matched", () => {
    const es = pairEvents(); es[1].duplicate_of = null;
    expect(score(pair(), es, ["test"]).wrong.missedMerges).toEqual(["A", "B"]);
    expect(score(pair(), [es[0]], ["test"]).missedMerges).toEqual({ right: 0, of: 0, pct: null });
  });
  it("counts each row once for false merges even in a group containing its real partner", () => {
    const r = score([...pair(), row({ id: "C", url: "https://example.com/C" })], [...pairEvents(), event({ id: "c", url: "https://example.com/C", duplicate_of: "a" })], ["test"]);
    expect(r.wrong.falseMerges).toEqual(["A", "B", "C"]);
    expect(r.missedMerges.right).toBe(0);
  });
  it("terminates loops consistently regardless of starting event or stored order", () => {
    const es = pairEvents(); es[0].duplicate_of = "b";
    expect(score(pair(), es, ["test"]).gateA).toBe(true);
    expect(score(pair(), [...es].reverse(), ["test"]).gateA).toBe(true);
    expect(score(pair(), [event({ duplicate_of: "a" }), es[1]], ["test"]).gateA).toBe(true);
  });
  it("stops at the last existing event for dangling links", () => {
    const es = pairEvents(); es[0].duplicate_of = "missing";
    expect(score(pair(), es, ["test"]).gateA).toBe(true);
    es[1].duplicate_of = "missing";
    expect(score(pair(), es, ["test"]).wrong.missedMerges).toEqual(["A", "B"]);
  });
  it("reports n/a and fails the gate when a metric has no denominator", () => {
    const empty = score([], [], []);
    for (const key of ["date", "venue", "category", "area", "falseMerges", "missedMerges"] as const) expect(empty[key]).toEqual({ right: 0, of: 0, pct: null });
    expect(empty.gateA).toBe(false);
    expect(one().gateA).toBe(false);
    expect(formatReport(empty)).toContain("date 0/0 n/a  >= 95% not yet");
  });
  it("applies inclusive accuracy and strict fault thresholds before display rounding", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row({ id: `R${i}`, url: `https://example.com/${i}`, sameAs: i % 2 ? `R${i - 1}` : "" }));
    const events = rows.map((r, i) => event({ id: `e${i}`, url: r.url, duplicate_of: i % 2 ? `e${i - 1}` : null }));
    for (let i = 0; i < 10; i++) events[i].start_at = "wrong";
    for (let i = 0; i < 20; i++) events[i].category = "wrong";
    expect(score(rows, events, ["test"]).gateA).toBe(true);
    events[10].start_at = "wrong";
    expect(score(rows, events, ["test"]).gateA).toBe(false);
    events[10].start_at = stored[0].start_at;
    for (let i = 1; i < 9; i += 2) events[i].duplicate_of = null;
    expect(score(rows, events, ["test"]).gateA).toBe(true); // 8/200 = 4%
    events[9].duplicate_of = null;
    expect(score(rows, events, ["test"]).missedMerges.pct).toBe(5);
    expect(score(rows, events, ["test"]).gateA).toBe(false);
    const smallRows = rows.slice(0, 198), smallEvents = events.slice(0, 198).map((e, i) => ({ ...e, start_at: stored[0].start_at, category: stored[0].category, duplicate_of: i % 2 ? `e${i - 1}` : null }));
    smallEvents[2].duplicate_of = "e0";
    expect(score(smallRows, smallEvents, ["test"]).falseMerges.pct).toBe(2);
    const r = score(pair(), pairEvents(), ["test"]);
    r.falseMerges = { right: 2, of: 200, pct: 1 };
    expect(formatReport(r)).toContain("falseMerges 2/200 1.0%  < 1% not yet");
    r.date = { right: 1899, of: 2000, pct: 95 };
    expect(formatReport(r)).toContain("date 1899/2000 95.0%  >= 95% not yet");
  });
  it("formats all metrics, wrong rows, coverage and unread sources", () => {
    const output = formatReport(score(golden, stored, six));
    expect(output).toContain("date 19/20 95.0%  >= 95% ok");
    expect(output).toContain("falseMerges 2/20 10.0%  < 1% not yet");
    expect(output).toContain("missedMerges 2/6 33.3%  < 5% not yet");
    expect(output).toContain("notFound: G04");
    expect(output).toContain("wrong falseMerges: G13, G14");
    expect(output).toContain("unread: ubc 3, eventbrite 15, evergreen 1");
    expect(output).toContain("Gate A: not yet");
  });
});
