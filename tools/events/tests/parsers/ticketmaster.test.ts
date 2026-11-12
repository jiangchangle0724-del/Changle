import { describe, expect, it } from "vitest";
import handmadeRaw from "../fixtures/ticketmaster/vancouver-handmade-p0.json?raw";
import docsRaw from "../fixtures/ticketmaster/docs-example.json?raw";
import { parseTicketmaster, tmCategory, type TmPage } from "../../src/parsers/ticketmaster";
import type { Category } from "../../src/types";

type TmEvent = NonNullable<NonNullable<TmPage["_embedded"]>["events"]>[number];
const handmade: TmPage = JSON.parse(handmadeRaw);
const docs: TmPage = JSON.parse(docsRaw);
const source = "ticketmaster";
const events = parseTicketmaster(handmade, source).events;
// Variants are copies of saved inputs; the fixtures on disk stay unchanged.
const variant = (changes: Partial<TmEvent>): TmPage => ({ _embedded: { events: [{ ...handmade._embedded!.events![0], ...changes }] } });
const parseVariant = (changes: Partial<TmEvent>) => parseTicketmaster(variant(changes), source).events[0];

describe("Ticketmaster saved pages", () => {
  it("matches all seven acceptance cases and keeps each source identity", () => {
    expect(events.map(({ sourceEventId, status, category, start, priceMin, priceMax, allDay, timeTBD }) =>
      [sourceEventId, status, category, start, priceMin, priceMax, allDay, timeTBD],
    )).toEqual([
      ["Z7r9jZ1A7aaa1", "scheduled", "outdoors", "2026-11-07T19:00:00-07:00", 89, 420, false, false],
      ["Z7r9jZ1A7aaa2", "soldout", "shows", "2026-11-05T19:00:00-07:00", 45.5, 45.5, false, false],
      ["Z7r9jZ1A7aaa3", "rescheduled", "shows", "2026-11-09T20:00:00-07:00", null, null, false, false],
      ["Z7r9jZ1A7aaa4", "cancelled", "family", "2026-11-08T11:00:00-07:00", 32, 120, false, false],
      ["Z7r9jZ1A7aaa5", "postponed", "shows", "2026-11-12", null, null, true, true],
      ["Z7r9jZ1A7aaa6", "scheduled", "shows", "2026-11-13T19:30:00-07:00", null, null, false, false],
      ["Z7r9jZ1A7aaa7", "scheduled", "outdoors", "2026-11-10T19:00:00-07:00", null, null, false, false],
    ]);
    for (const [i, event] of events.entries()) {
      const input = handmade._embedded!.events![i];
      expect(event).toMatchObject({ source, title: input.name, url: input.url, tags: ["tickets"], lang: "en", isFree: null });
    }
    expect(events[0].sourceCategories).toEqual(["Sports", "Hockey", "NHL"]);
    expect(events[5].imageUrl).toBeNull();
    expect(parseTicketmaster(handmade, source).more).toBe(true);
  });

  it("reads the documentation's sold-out golf event with an unknown time and the widest landscape image", () => {
    const result = parseTicketmaster(docs, source);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      sourceEventId: "vvG1VZKS5pr1qy", status: "soldout", category: "outdoors",
      start: "2016-03-06", allDay: true, timeTBD: true, priceMin: null, priceMax: null, isFree: null,
      imageUrl: "http://s1.ticketm.net/dam/a/196/6095e742-64d1-4b15-aeac-c9733c52d196_66341_TABLET_LANDSCAPE_LARGE_16_9.jpg",
    });
    expect(result.more).toBe(true);
  });

  it("uses the first venue's full address and numeric coordinates", () => {
    const venues = handmade._embedded!.events![0]._embedded!.venues!;
    expect(parseVariant({ _embedded: { venues: [...venues, { name: "Another venue" }] } }).place).toEqual({
      name: "Rogers Arena", address: "800 Griffiths Way", city: "Vancouver", postalCode: "V6B 6G1",
      lat: 49.277909, lon: -123.108942,
    });
    expect(parseVariant({ _embedded: undefined }).place).toBeNull();
    expect(parseVariant({ _embedded: { venues: [{}] } }).place).toEqual({
      name: null, address: null, city: null, postalCode: null, lat: null, lon: null,
    });
  });

  it("selects only 16_9 images by width without rearranging the input", () => {
    const images = [
      { ratio: "16_9", width: 100, url: "small" },
      { ratio: "3_2", width: 4000, url: "portrait" },
      { ratio: "16_9", width: 2000, url: "wide" },
      { ratio: "16_9", url: "unknown-width" },
    ];
    const before = structuredClone(images);
    expect(parseVariant({ images }).imageUrl).toBe("wide");
    expect(images).toEqual(before);
    expect(parseVariant({ images: [images[1]] }).imageUrl).toBeNull();
    expect(parseVariant({ images: [] }).imageUrl).toBeNull();
  });

  it("preserves the title and source, and makes descriptions plain text of at most 600 characters", () => {
    const page = variant({ name: "  Original title  ", url: undefined, info: "<p>Info &amp; details</p>", pleaseNote: "<b>Note</b>" });
    expect(parseTicketmaster(page, "tm-copy").events[0]).toMatchObject({
      source: "tm-copy", title: "  Original title  ", url: "https://www.ticketmaster.ca/event/Z7r9jZ1A7aaa1",
      description: "Info & details\nNote",
    });
    expect(parseVariant({ info: "x".repeat(700) }).description).toBe("x".repeat(600));
    expect(parseVariant({ info: undefined, pleaseNote: undefined }).description).toBeNull();
  });

  it.each([
    [undefined, false], [{ number: 0, totalPages: 0 }, false], [{ number: 0, totalPages: 1 }, false],
    [{ number: 0, totalPages: 2 }, true], [{ number: 1, totalPages: 2 }, false], [{ number: 1, totalPages: 3 }, true],
  ] as const)("reports pagination from %j", (page, more) => {
    expect(parseTicketmaster({ page }, source)).toEqual({ events: [], more });
  });
});

describe("Ticketmaster classifications", () => {
  const cases: [string | undefined, string | undefined, Category | null][] = [
    ["Music", "Rock", "shows"], ["Music", "Festival", "shows"], ["Music", "Family", "shows"],
    ["Music", "Film", "shows"], ["Music", undefined, "shows"],
    ["Sports", "Hockey", "outdoors"], ["Sports", "Festival", "outdoors"], ["Sports", "Family", "outdoors"],
    ["Arts & Theatre", "Children's Theatre", "family"], ["Arts & Theatre", "Family", "family"],
    ["Arts & Theatre", "Circus & Specialty Acts", "family"],
    ["Arts & Theatre", "Fine Art", "arts"], ["Arts & Theatre", "Film", "arts"],
    ...["Comedy", "Theatre", "Musical", "Dance", "Opera", "Magic & Illusion", "Festival", "Undefined", undefined]
      .map((genre): [string, string | undefined, Category] => ["Arts & Theatre", genre, "shows"]),
    ["Film", "Family", "arts"], ["Film", undefined, "arts"],
    ["Miscellaneous", "Family", "family"], ["Miscellaneous", "Fairs & Festivals", "festivals"],
    ["Miscellaneous", "Food & Drink", "food"], ["Miscellaneous", "Festival", null],
    ["Miscellaneous", "Comedy", null], ["Miscellaneous", "Undefined", null], ["Miscellaneous", undefined, null],
    ["Undefined", "Family", null], ["Undefined", "Fine Art", null], ["Other", "Festival", null],
    [undefined, "Theatre", null], [undefined, undefined, null],
    ["arts & theatre", "CHILDREN'S THEATRE", "family"],
  ];
  it.each(cases)("maps %s / %s to %s using the segment first", (segment, genre, category) => {
    expect(tmCategory(segment, genre)).toBe(category);
    const classifications = [{ segment: { name: segment }, genre: { name: genre } }];
    expect(parseVariant({ classifications }).category).toBe(category);
  });
});

describe("Ticketmaster statuses and times", () => {
  it.each([
    ["onsale", "scheduled"], ["offsale", "soldout"], ["cancelled", "cancelled"], ["canceled", "cancelled"],
    ["postponed", "postponed"], ["rescheduled", "rescheduled"], ["OFFSALE", "soldout"],
    [undefined, "scheduled"], ["unknown", "scheduled"], ["constructor", "scheduled"],
  ])("maps status %s to %s", (code, status) => {
    expect(parseVariant({ dates: { ...handmade._embedded!.events![0].dates, status: { code } } }).status).toBe(status);
  });

  it.each(["dateTBA", "dateTBD", "timeTBA", "noSpecificTime"] as const)("ignores the supplied time when %s is true", (flag) => {
    const start = { ...handmade._embedded!.events![0].dates!.start, [flag]: true };
    expect(parseVariant({ dates: { start } })).toMatchObject({ start: "2026-11-07", allDay: true, timeTBD: true });
  });

  it("uses the local day when only localTime is present, and skips undated events", () => {
    expect(parseVariant({ dates: { start: { localDate: "2026-11-07", localTime: "19:00:00" } } }))
      .toMatchObject({ start: "2026-11-07", allDay: true, timeTBD: true });
    for (const dates of [undefined, {}, { start: {} }]) {
      const page = variant({ dates });
      page._embedded!.events!.push(handmade._embedded!.events![0]);
      expect(parseTicketmaster(page, source).events).toEqual([events[0]]);
    }
  });

  it.each([
    ["2025-11-08T03:00:00Z", "2025-11-07T19:00:00-08:00"],
    ["2026-11-08T02:00:00Z", "2026-11-07T19:00:00-07:00"],
  ])("converts UTC start and end with the date's Vancouver offset: %s", (dateTime, start) => {
    expect(parseVariant({ dates: { start: { localDate: start.slice(0, 10), dateTime }, end: { dateTime } } }))
      .toMatchObject({ start, end: start, allDay: false, timeTBD: false });
  });
});

describe("Ticketmaster CAD prices", () => {
  it.each([
    { ranges: undefined, min: null, max: null },
    { ranges: [], min: null, max: null },
    { ranges: [{ currency: "CAD", min: 0, max: 0 }], min: null, max: null },
    { ranges: [{ currency: "USD", min: 10, max: 100 }], min: null, max: null },
    { ranges: [{ min: 10, max: 100 }], min: null, max: null },
    { ranges: [{ currency: "CAD" }], min: null, max: null },
    { ranges: [{ currency: "CAD", min: 12 }], min: 12, max: null },
    { ranges: [{ currency: "CAD", max: 24 }], min: null, max: 24 },
    { ranges: [{ currency: "CAD", min: 0, max: 24 }], min: 0, max: 24 },
    { ranges: [{ currency: "CAD", min: 45.5, max: 45.5 }], min: 45.5, max: 45.5 },
    { ranges: [
      { currency: "USD", min: 1, max: 999 }, { currency: "CAD", min: 40, max: 80 },
      { currency: "CAD", min: 20, max: 60 }, { currency: "CAD", min: 0, max: 0 },
      { min: 2, max: 900 },
    ], min: 20, max: 80 },
  ])("keeps only known CAD bounds: $ranges", ({ ranges, min, max }) => {
    expect(parseVariant({ priceRanges: ranges })).toMatchObject({ priceMin: min, priceMax: max, isFree: null, tags: ["tickets"] });
  });
});
