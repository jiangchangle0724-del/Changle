// The parsers on saved feeds (tests/fixtures): what a source said on 2026-10-31.
import luma from "./fixtures/luma/vancouver-2026-10-31.ics?raw";
import vpl from "./fixtures/bibliocommons/vpl-2026-10-31-p1.json?raw";
import rpl from "./fixtures/bibliocommons/rpl-2026-11-01-p1.json?raw";
import { describe, expect, it } from "vitest";
import { areaOf } from "../src/area";
import { parseTicketmaster, tmCategory } from "../src/parsers/ticketmaster";
import { SOURCE_BY_ID, type Parsed } from "../src/sources";
import { endMs, startMs, venueId } from "../src/store";
import { fromVan, windowOf } from "../src/time";
import type { NormalizedEvent } from "../src/types";

const w = { runId: "2026-10-31", ...windowOf("2026-10-31") };

describe("Luma (iCal)", () => {
  const { events } = SOURCE_BY_ID["luma-vancouver"].parse(luma, 0, w) as Parsed;
  it("reads every event, with the page to send people to", () => {
    expect(events).toHaveLength(15);
    const halloween = events.find((e) => e.title === "Ocean Theme Halloween!")!;
    expect(halloween.url).toBe("https://luma.com/aw0ess5m");
    expect(halloween.start).toBe("2026-10-31T20:00:00-07:00");
    expect(halloween.end).toBe("2026-11-01T00:30:00-07:00");
    expect(halloween.place).toBeNull();
    expect(halloween.description?.startsWith("Get up-to-date")).toBe(false);
  });
  it("splits the address, keeps the coordinates, and finds the area", () => {
    const bios = events.find((e) => e.title.startsWith("BIOS SPHERE"))!;
    expect(bios.place).toMatchObject({ name: "Science World", city: "Vancouver", postalCode: "V6A 3Z7" });
    expect(bios.place?.lat).toBeCloseTo(49.273, 2);
    expect(areaOf(bios.place)).toEqual({ area: "vancouver", check: false });
    expect(bios.start).toBe("2026-11-02T08:30:00-07:00");
    const sfu = events.find((e) => e.title === "Patch the System!!!")!;
    expect(areaOf(sfu.place).area).toBe("burnaby");
  });
});

describe("Vancouver Public Library (BiblioCommons)", () => {
  const { events, more } = SOURCE_BY_ID.vpl.parse(vpl, 0, w) as Parsed;
  it("reads the page oldest first and asks for the next while still inside the window", () => {
    expect(events).toHaveLength(40);
    expect(more).toBe(true);
    expect(events[0].start).toBe("2026-11-01T10:15:00-07:00");
  });
  it("labels by the library's own audiences, types and languages", () => {
    const story = events.find((e) => e.title === "Family Storytime")!;
    expect(story.category).toBe("family");
    expect(story.tags).toEqual(expect.arrayContaining(["free", "kids", "indoor"]));
    expect(story.isFree).toBe(true);
    expect(story.url).toMatch(/^https:\/\/vpl\.bibliocommons\.com\/events\/[0-9a-f]{24}$/);
    expect(story.place?.postalCode).toMatch(/^V\d[A-Z] \d[A-Z]\d$/);
    for (const e of events) expect(e.description?.length ?? 0).toBeLessThanOrEqual(600);
  });
});

describe("Richmond Public Library (BiblioCommons, as yourlibrary)", () => {
  const { events, more } = SOURCE_BY_ID.rpl.parse(rpl, 0, w) as Parsed;
  it("reads its page, with Richmond's links and branches", () => {
    expect(events).toHaveLength(25);
    expect(more).toBe(true);
    const chess = events.find((e) => e.title === "Chess for Fun (All Ages)")!;
    expect(chess.url).toMatch(/^https:\/\/yourlibrary\.bibliocommons\.com\/events\/[0-9a-f]{24}$/);
    expect(chess.start).toBe("2026-11-01T14:00:00-07:00");
    expect(chess.place).toMatchObject({ name: "Brighouse", address: "100-7700 Minoru Gate", city: "Richmond", postalCode: "V6Y 1R8" });
    expect(areaOf(chess.place).area).toBe("richmond");
  });
  it("an event given by dates alone is all-day, to the end of its last day", () => {
    const hunt = events.find((e) => e.title === "Cambie Scavenger Hunt")!;
    expect(hunt).toMatchObject({ start: "2026-10-28", end: "2026-11-03", allDay: true });
    expect(startMs(hunt)).toBe(fromVan("2026-10-28"));
    expect(endMs(hunt)).toBe(fromVan("2026-11-04"));
  });
  it("an all-day end given as a time counts by its date; an end that can't be read counts as none", () => {
    const base: NormalizedEvent = { source: "x", sourceEventId: "a", url: "", title: "A", status: "scheduled", place: null, start: "2026-11-20" };
    // A Ticketmaster event with no start time can still carry an end time (dates.end.dateTime).
    expect(endMs({ ...base, allDay: true, end: "2026-11-22T20:00:00-07:00" })).toBe(fromVan("2026-11-23"));
    expect(endMs({ ...base, allDay: true, end: "not a date" })).toBe(fromVan("2026-11-21"));
    expect(endMs({ ...base, start: "2026-11-20T19:00:00-07:00", end: "not a date" })).toBe(Date.parse("2026-11-20T21:00:00-07:00"));
  });
});

describe("Ticketmaster", () => {
  it("maps its classification, statuses, prices and dates without a time", () => {
    expect(tmCategory("Music", "Rock")).toBe("shows");
    expect(tmCategory("Sports", "Hockey")).toBe("outdoors");
    expect(tmCategory("Arts & Theatre", "Comedy")).toBe("shows");
    const { events, more } = parseTicketmaster(
      {
        _embedded: {
          events: [
            {
              id: "G5v",
              name: "Canucks vs. Flames",
              url: "https://www.ticketmaster.ca/event/G5v",
              dates: { start: { localDate: "2026-11-07", localTime: "19:00:00", dateTime: "2026-11-08T02:00:00Z" }, status: { code: "offsale" } },
              classifications: [{ segment: { name: "Sports" }, genre: { name: "Hockey" } }],
              priceRanges: [{ min: 89, max: 420, currency: "CAD" }],
              _embedded: { venues: [{ name: "Rogers Arena", address: { line1: "800 Griffiths Way" }, city: { name: "Vancouver" }, postalCode: "V6B 6G1" }] },
            },
            { id: "TBA1", name: "Winter Lights", dates: { start: { localDate: "2026-11-12", dateTBA: true }, status: { code: "onsale" } } },
          ],
        },
        page: { number: 0, totalPages: 2 },
      },
      "ticketmaster",
    );
    expect(more).toBe(true);
    expect(events[0]).toMatchObject({ category: "outdoors", status: "soldout", priceMin: 89, start: "2026-11-07T19:00:00-07:00" });
    expect(events[1]).toMatchObject({ start: "2026-11-12", allDay: true, timeTBD: true });
  });
});

describe("venues", () => {
  it("the same place from two sources is one venue", () => {
    expect(venueId({ name: "Science World", postalCode: "V6A 3Z7" })).toBe(venueId({ name: "science world", postalCode: "v6a3z7" }));
  });
});
