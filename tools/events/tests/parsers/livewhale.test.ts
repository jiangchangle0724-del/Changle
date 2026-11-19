import { describe, expect, it } from "vitest";
import p1 from "../fixtures/livewhale/sfu-2026-11-19-p1.json?raw";
import p4 from "../fixtures/livewhale/sfu-2026-11-19-p4.json?raw";
import { isLwPage, parseLiveWhale, prices, type LwEvent, type LwPage } from "../../src/parsers/livewhale";

// SFU's calendar (events.sfu.ca), 19 November to 2 December 2026: the first and the last of its
// four pages (online links taken out of the saved copies)
const page = JSON.parse(p1) as LwPage;
const events = parseLiveWhale(page, "sfu");
const lastEvents = parseLiveWhale(JSON.parse(p4) as LwPage, "sfu");
const byId = (id: string) => [...events, ...lastEvents].find((e) => e.sourceEventId === id)!;

describe("LiveWhale (JSON v2)", () => {
  it("reads every item on a page, each occurrence with its own id: the item's and its date", () => {
    expect(isLwPage(page)).toBe(true);
    // 50 items: three multi-day events take 15 of them (below)
    expect(events).toHaveLength(38);
    expect(new Set(events.map((e) => e.sourceEventId)).size).toBe(38);
    // a weekly series: each week an item with its own id
    expect(byId("51177@2026-11-19")).toMatchObject({ title: "Tutorat/Tutoring Centre", start: "2026-11-19T10:00:00-07:00" });
  });

  it("a multi-day all-day event comes once a day with the same id: it's one event, its first day to its last", () => {
    // a food drive for three weeks, an exhibition since September
    expect(events.filter((e) => e.title === "Holiday Food Drive")).toMatchObject([{ sourceEventId: "51288", start: "2026-11-17", end: "2026-12-09", allDay: true }]);
    expect(byId("51235")).toMatchObject({ title: "Wetin You Dey Do For Here", start: "2026-09-18", end: "2027-01-08", allDay: true });
    // over two days, from the afternoon before the page's first day
    expect(byId("51276")).toMatchObject({ title: "DEFRAG: Archive of Synthetic Dreams", start: "2026-11-18", end: "2026-11-19", allDay: true, timeTBD: false });
  });

  it("an all-day one has its date; a timed one its times in Vancouver, and its end when it has one", () => {
    // (a yearly series: this year's day)
    expect(byId("11358@2026-12-01")).toMatchObject({ title: "World AIDS Day", start: "2026-12-01", end: null, allDay: true });
    expect(byId("50527@2026-11-19")).toMatchObject({ start: "2026-11-19T18:30:00-07:00", end: "2026-11-19T20:30:00-07:00", allDay: false });
    expect(byId("51365@2026-11-21")).toMatchObject({ title: "Six Turntables", start: "2026-11-21T14:00:00-07:00", end: null });
  });

  it("decodes the calendar's escapes, and keeps its labels and group", () => {
    const ai = byId("50527@2026-11-19");
    expect(ai.title).toBe("AI: Energy, Environment & Community");
    expect(ai.description).toBe("Join us the evening of November 19 for a panel event examining the buildout of and backlash to AI data centres in Canada.");
    expect(ai.organizer).toBe("Public Square");
    expect(ai.url).toBe("https://events.sfu.ca/live/events/50439-ai-energy-environment-community");
    // its types, then its audiences, then its campuses
    expect(byId("51276").sourceCategories).toEqual([
      "Arts & Culture", "Community Events", "Exhibits", "Multimedia", "Visual Art",
      "All Students", "Alumni", "Faculty", "Graduate Students", "Prospective Students", "Public", "Staff", "Undergraduate Students",
      "Off Campus",
    ]);
  });

  it("the place as written, with its coordinates when the calendar has them", () => {
    expect(byId("51365@2026-11-21").place).toEqual({
      name: "Grand Luxe Hall – Western Front",
      address: "303 E 8th Ave, Vancouver",
      city: null,
      postalCode: null,
      lat: 49.263822,
      lon: -123.098711,
    });
    expect(byId("50691@2026-11-19").place).toMatchObject({ name: "SFU Vancouver Wellness Studio", city: "Vancouver", postalCode: "V6B 5K3" });
  });

  it("online when it says so, or its place is a way to watch; such a place is none", () => {
    // online, and also in a room
    expect(byId("51164@2026-11-19")).toMatchObject({ online: true, place: { name: "Library Thesis Defence Room (2020) and Online" } });
    expect(byId("50568@2026-11-19")).toMatchObject({ online: true, place: null }); // "Online via Zoom"
    expect(byId("50795@2026-11-19")).toMatchObject({ online: true, place: null }); // "Zoom/In-Person"
    expect(byId("51276")).toMatchObject({ online: false });
  });

  it("a category only where its types say it", () => {
    expect(byId("51365@2026-11-21").category).toBe("shows"); // Music
    expect(byId("51276").category).toBe("arts"); // Exhibits
    expect(byId("50691@2026-11-19").category).toBe("outdoors"); // Athletics & Recreation
    expect(byId("51288").category).toBeNull(); // Campus Life, Community Events
  });

  it("prices: free, dollar amounts, from an amount; donations and words are unknown", () => {
    expect(prices("Free")).toEqual({ priceMin: 0, priceMax: 0, isFree: true });
    expect(prices("$0")).toEqual({ priceMin: 0, priceMax: 0, isFree: true });
    expect(prices(184)).toEqual({ priceMin: 184, priceMax: 184, isFree: false });
    expect(prices("<p>\n  $75 deposit\n</p>")).toEqual({ priceMin: 75, priceMax: 75, isFree: false });
    // "Indigenous, Student & Senior Ticket: $5.00 / General Admission: $10.00", in HTML
    expect(byId("50527@2026-11-19")).toMatchObject({ priceMin: 5, priceMax: 10, isFree: false });
    expect(prices("<h3>Tickets: SFU Students: $10 | Seniors (65+): $15 | SFU Staff/Faculty/Alumni: $15 | General: $20</h3>")).toEqual({ priceMin: 10, priceMax: 20, isFree: false });
    expect(prices("<p>\n  Ticketing starts from $10\n</p>")).toEqual({ priceMin: 10, priceMax: null, isFree: false });
    for (const unknown of ["<p><strong>Admission by donation (suggested $15 – $35)</strong></p>", "<h3>$15 / PWYC</h3>", "Regular Dining Commons door rates apply.", "", null, -1])
      expect(prices(unknown), String(unknown)).toEqual({ priceMin: null, priceMax: null, isFree: null });
    expect(byId("51288")).toMatchObject({ isFree: true, tags: ["free"] });
    expect(byId("51365@2026-11-21")).toMatchObject({ isFree: null, priceMin: null, tags: [] });
  });

  it("cancelled when the calendar says so", () => {
    const item: LwEvent = { ...page.data[0], is_canceled: 1 };
    expect(parseLiveWhale({ meta: { page: 1, total_pages: 1 }, data: [item] }, "sfu")[0].status).toBe("cancelled");
    expect(byId("51276").status).toBe("scheduled");
  });

  it("skips an item it can't read, and fails a page that's mostly such", () => {
    const broken = { ...page.data[0], date_iso: "soon" } as LwEvent;
    const some = { meta: { page: 1, total_pages: 1 }, data: [broken, page.data[1], page.data[2]] };
    expect(parseLiveWhale(some, "sfu")).toHaveLength(2);
    const most = { meta: { page: 1, total_pages: 1 }, data: [broken, broken, page.data[2]] };
    expect(() => parseLiveWhale(most, "sfu")).toThrow("2 of 3 events on the page can't be read");
    expect(isLwPage({ error: "not found" })).toBe(false);
    expect(isLwPage({ meta: { page: 1 }, data: [] })).toBe(false);
  });
});
