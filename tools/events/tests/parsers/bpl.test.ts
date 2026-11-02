import { describe, expect, it } from "vitest";
import raw from "../fixtures/bpl/events-2026-11-01.json?raw";
import { parseBpl, type BplFeed } from "../../src/parsers/bpl";

type Program = BplFeed["data"][number];
const feed: { data: (Program & { startDisplayTime: string })[] } = JSON.parse(raw);
const upcoming = feed.data.filter((e) => e.group !== "past");
const events = parseBpl(feed, "burnaby");

// Synthetic variants stay in this test; the saved real response is never modified.
const variant = (changes: Partial<Program>): BplFeed => ({ data: [{ ...upcoming[0], ...changes }] });

describe("Burnaby Public Library's own feed", () => {
  it("keeps exactly the 113 upcoming programs and no past programs", () => {
    expect(feed.data).toHaveLength(253);
    expect(feed.data.filter((e) => e.group === "past")).toHaveLength(140);
    expect(events).toHaveLength(113);
    expect(events.map((e) => e.url)).toEqual(upcoming.map((e) => e.url));
    const pastUrls = new Set(feed.data.filter((e) => e.group === "past").map((e) => e.url));
    expect(events.every((e) => !pastUrls.has(e.url))).toBe(true);
    expect(parseBpl({ data: [] }, "burnaby")).toEqual([]);
  });

  it("matches every display time on the occurrence's day with Vancouver's -07:00 offset", () => {
    for (const [i, program] of upcoming.entries()) {
      const display = /^(\d{1,2}):(\d{2})(am|pm)$/.exec(program.startDisplayTime)!;
      expect(display, program.url).not.toBeNull();
      const hour = +display[1] % 12 + (display[3] === "pm" ? 12 : 0);
      const expected = `${program.startDate!.date!.slice(0, 10)}T${String(hour).padStart(2, "0")}:${display[2]}:00-07:00`;
      expect(events[i].start, program.url).toBe(expected);
    }
  });

  it.each([undefined, null, {}, { date: null }, { date: "" }])("skips a program with no day (%j) and continues parsing", (startDate) => {
    const input = variant({ startDate });
    input.data.push(upcoming[0]);
    expect(parseBpl(input, "burnaby")).toEqual([events[0]]);
  });

  it.each([undefined, null, {}, { date: null }, { date: "" }])("emits a date-only time-TBD program when the time is missing (%j)", (startTime) => {
    const input = variant({ startTime });
    input.data.push(upcoming[0]);
    const parsed = parseBpl(input, "burnaby");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ ...events[0], start: "2026-11-03", allDay: true, timeTBD: true });
    expect(parsed[1]).toEqual(events[0]);
  });

  it.each([
    "https://bpl.bc.ca/events/program/",
    "https://bpl.bc.ca/events/program///",
    "https://bpl.bc.ca/events/program?view=details",
    "https://bpl.bc.ca/events/program#details",
    "https://bpl.bc.ca/events/program/?view=details#details",
  ])("extracts the last non-empty pathname segment from %s", (url) => {
    const [event] = parseBpl(variant({ url }), "burnaby");
    expect(event.sourceEventId).toBe("program");
    expect(event.url).toBe(url);
  });

  it.each([
    "https://bpl.bc.ca",
    "https://bpl.bc.ca/",
    "https://bpl.bc.ca///?program=123#details",
    "not a URL",
    "",
  ])("skips an unidentifiable URL (%s) and continues parsing", (url) => {
    const input = variant({ url });
    input.data.push(upcoming[0]);
    expect(parseBpl(input, "burnaby")).toEqual([events[0]]);
  });

  it.each([
    ["CANCELLED", "cancelled"],
    ["canceled", "cancelled"],
    ["CaNcElEd", "cancelled"],
    ["postponed", "postponed"],
    ["POSTPONED", "postponed"],
    ["ReScHeDuLeD", "rescheduled"],
    ["SCHEDULED", "scheduled"],
    ["unknown", "scheduled"],
  ])("normalizes eventStatus %s to %s", (eventStatus, status) => {
    expect(parseBpl(variant({ eventStatus }), "burnaby")[0].status).toBe(status);
  });

  it("reads Smartphone Tips and Tricks with all normalized fields", () => {
    expect(events.find((e) => e.sourceEventId === "smartphone-tips-and-tricks-november-3")).toEqual({
      source: "burnaby",
      sourceEventId: "smartphone-tips-and-tricks-november-3",
      url: "https://bpl.bc.ca/events/smartphone-tips-and-tricks-november-3",
      title: "Smartphone Tips and Tricks",
      description: null,
      start: "2026-11-03T11:00:00-07:00",
      end: null,
      allDay: false,
      timeTBD: false,
      status: "scheduled",
      place: { name: "Bob Prittie Metrotown", address: "6100 Willingdon Avenue", city: "Burnaby", postalCode: "V5H 4N5", lat: null, lon: null },
      online: false,
      priceMin: 0,
      priceMax: 0,
      isFree: true,
      category: null,
      sourceCategories: ["Technology Class", "Adults"],
      tags: ["free", "indoor"],
      lang: "en",
      imageUrl: null,
      organizer: "Bob Prittie Metrotown",
    });
  });

  it.each([
    ["bob-prittie-metrotown", "Bob Prittie Metrotown", "6100 Willingdon Avenue", "V5H 4N5"],
    ["tommy-douglas", "Tommy Douglas", "7311 Kingsway", "V5E 1G8"],
    ["mcgill", "McGill", "4595 Albert Street", "V5C 2G6"],
    ["cameron", "Temporary Cameron", "110 - 9855 Austin Avenue", "V3J 1N4"],
  ])("maps the %s branch for every occurrence", (slug, name, address, postalCode) => {
    const programs = upcoming.filter((e) => e.location?.[0]?.slug === slug);
    expect(programs.length).toBeGreaterThan(0);
    for (const program of programs) {
      const event = events.find((e) => e.url === program.url)!;
      expect(event.place).toEqual({ name, address, city: "Burnaby", postalCode, lat: null, lon: null });
      expect(event.organizer).toBe(name);
    }
  });

  it("uses the shared category rule and keeps types before audiences", () => {
    const family = events.find((e) => e.title === "Family Storytime" && e.start.startsWith("2026-11-03") && e.place?.name === "Temporary Cameron")!;
    expect(family.category).toBe("family");
    expect(family.tags).toEqual(["free", "kids", "indoor"]);
    for (const [i, program] of upcoming.entries()) {
      expect(events[i].sourceCategories).toEqual([...(program.type ?? []), ...(program.audience ?? [])].map((x) => x.title));
    }
    const [talk] = parseBpl(variant({ type: [{ title: "Author Talks" }], audience: [{ title: "Adults" }] }), "test-source");
    expect(talk.category).toBe("arts");
    expect(talk.source).toBe("test-source");
  });

  it("labels Cantonese and Mandarin programs as Chinese, including the toddler storytime", () => {
    const chinese = events.filter((e) => e.tags?.includes("chinese"));
    expect(chinese).toHaveLength(5);
    expect(chinese.every((e) => e.lang === "zh")).toBe(true);
    const story = events.find((e) => e.title === "廣東話故事時間 | Cantonese Storytime for Toddlers")!;
    expect(story.lang).toBe("zh");
    expect(story.category).toBe("family");
    expect(story.tags).toEqual(["free", "kids", "chinese", "indoor"]);
  });

  it.each(["Cantonese", "Mandarin", "Chinese"])("supports %s with English and alone", (title) => {
    const [bilingual] = parseBpl(variant({ language: [{ title }, { title: "English" }] }), "burnaby");
    expect(bilingual.lang).toBe("both");
    expect(bilingual.tags).toContain("chinese");
    const [monolingual] = parseBpl(variant({ language: [{ title }] }), "burnaby");
    expect(monolingual.lang).toBe("zh");
  });

  it("defaults missing language to English and missing labels to empty categories", () => {
    const [event] = parseBpl(variant({ language: undefined, type: undefined, audience: undefined }), "burnaby");
    expect(event.lang).toBe("en");
    expect(event.category).toBeNull();
    expect(event.sourceCategories).toEqual([]);
    expect(event.tags).toEqual(["free", "indoor"]);
  });

  it("keeps both cancelled programs at McGill on 19 December", () => {
    const cancelled = events.filter((e) => e.status === "cancelled");
    expect(cancelled).toHaveLength(2);
    expect(cancelled.map((e) => e.title).sort()).toEqual(["English Reading Circle", "Newcomer Drop-In"]);
    for (const event of cancelled) {
      expect(event.start).toMatch(/^2026-12-19T/);
      expect(event.place?.name).toBe("McGill");
    }
    for (const [i, program] of upcoming.entries()) {
      expect(events[i].status).toBe(program.eventStatus || "scheduled");
    }
    expect(parseBpl(variant({ eventStatus: "rescheduled" }), "burnaby")[0].status).toBe("rescheduled");
  });

  it("keeps the two online programs without a place, organizer or indoor tag", () => {
    const online = events.filter((e) => e.online);
    expect(online).toHaveLength(2);
    for (const event of online) {
      expect(event.place).toBeNull();
      expect(event.organizer).toBeNull();
      expect(event.tags).not.toContain("indoor");
      expect(event.tags).toContain("free");
    }
  });

  it("keeps an unknown location's title with unknown address fields and reads only the first location", () => {
    const [event] = parseBpl(variant({ title: "  New program  ", location: [{ slug: "new-branch", title: "New Branch" }, { slug: "online", title: "Online" }] }), "burnaby");
    expect(event.title).toBe("New program");
    expect(event.place).toEqual({ name: "New Branch", address: null, city: null, postalCode: null, lat: null, lon: null });
    expect(event.organizer).toBe("New Branch");
    expect(event.online).toBe(false);
    expect(parseBpl(variant({ location: [] }), "burnaby")[0].place).toBeNull();
  });

  it("always reports free programs with no end, description, image or all-day flags", () => {
    for (const event of events) {
      expect(event).toMatchObject({ priceMin: 0, priceMax: 0, isFree: true, end: null, description: null, imageUrl: null, allDay: false, timeTBD: false });
      expect(event.tags).toContain("free");
      expect(event.sourceEventId).toBe(event.url.split("/").at(-1));
    }
  });

  it("is repeatable without changing the input or sharing mutable branch objects", () => {
    const before = JSON.stringify(feed);
    const parsed = parseBpl(feed, "burnaby");
    expect(parsed).toEqual(events);
    parsed[0].place!.name = "Changed by caller";
    expect(parseBpl(feed, "burnaby")).toEqual(events);
    expect(JSON.stringify(feed)).toBe(before);
  });
});
