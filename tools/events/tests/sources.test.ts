import { describe, expect, it } from "vitest";
import ubcFeed from "./fixtures/ical/ubc-2026-10-31.ics?raw";
import sfuFirst from "./fixtures/livewhale/sfu-2026-11-19-p1.json?raw";
import sfuLast from "./fixtures/livewhale/sfu-2026-11-19-p4.json?raw";
import showpassDiscovery from "./fixtures/showpass/discovery-2026-11-26.json?raw";
import showpassEvents from "./fixtures/showpass/events-2026-11-26.json?raw";
import { sfuOpen, showpassOpen, SOURCE_BY_ID } from "../src/sources";
import type { NormalizedEvent } from "../src/types";
import { fromVan } from "../src/time";

describe("UBC: what anyone can walk into", () => {
  const ubc = SOURCE_BY_ID.ubc;
  const w = { runId: "2026-11-01", fromMs: fromVan("2026-11-01"), toMs: fromVan("2026-11-15") };

  it("reads the window two days at a time", () => {
    expect(ubc.request(0, {} as Env, w)).toBe("https://events.ubc.ca/events/list/?ical=1&tribe-bar-date=2026-11-01");
    expect(ubc.request(3, {} as Env, w)).toBe("https://events.ubc.ca/events/list/?ical=1&tribe-bar-date=2026-11-07");
  });

  it("keeps events open to all or the community, at a real place on campus", async () => {
    const first = await ubc.parse(ubcFeed, 0, w);
    expect(first.more).toBe(true);
    expect(first.events.map((e) => e.title).sort()).toEqual([
      "Arts Multilingual Week (Oct 26–Nov 19)",
      "Chung | Lind Gallery Weekly Drop-In Tour",
      "Pedagogies of Play",
      "UBC Farm Workshops – Summer Series",
      "UBC x Jade Music Fest 2026 | Panel Discussion: Who Gets Heard?",
      "Wednesday Noon Hours: La Modestine Ensemble",
    ]);
    // the 30 in the file also hold online courses for doctors (UBC CPD), staff training and student-only workshops
    const farm = first.events.find((e) => e.title.startsWith("UBC Farm"))!;
    expect(farm.place?.city).toBe("Vancouver");
    // an answer that runs past the window, or an empty one, ends the reading
    const late = { ...w, toMs: fromVan("2026-11-03") };
    expect((await ubc.parse(ubcFeed, 0, late)).more).toBe(false);
    expect((await ubc.parse("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n", 1, w)).more).toBe(false);
  });
});

describe("SFU: what anyone can walk into", () => {
  const sfu = SOURCE_BY_ID.sfu;
  const w = { runId: "2026-11-19", fromMs: fromVan("2026-11-19"), toMs: fromVan("2026-12-03") };
  const titles = (events: NormalizedEvent[]) => [...new Set(events.map((e) => e.title))].sort();

  it("asks for the window's days, 50 a page", () => {
    const base = "https://events.sfu.ca/live/json/v2/events/start_date/2026-11-19/end_date/2026-12-02/paginate/50/response_fields/event_types,location,summary,group_title,thumbnail";
    expect(sfu.request(0, {} as Env, w)).toBe(`${base}?page=1`);
    expect(sfu.request(3, {} as Env, w)).toBe(`${base}?page=4`);
  });

  it("keeps SFU's public events at a real place, and none of its defences, info sessions or student services", async () => {
    const first = await sfu.parse(sfuFirst, 0, w);
    expect(first.more).toBe(true);
    // of the page's 50: a food drive, two exhibitions, talks, a film and an art student's thesis show
    expect(titles(first.events)).toEqual([
      "611 Talk: Evan Lee",
      "AI: Energy, Environment & Community",
      "Caminando con Pehuén (Walking with Pehuén)",
      "DEFRAG: Archive of Synthetic Dreams",
      "Holiday Food Drive",
      "Six Turntables",
      "The sun melts turns of phrases",
      "Wetin You Dey Do For Here",
    ]);
    expect(first.events).toHaveLength(8);
    const last = await sfu.parse(sfuLast, 3, w);
    expect(last.more).toBe(false);
    expect(titles(last.events)).toEqual([
      "2026 Jack P. Blaney Award with Dr. Amal Elsana Alh’jooj",
      "GSWS Feminist Book Club - Kindred by Octavia Butler",
      "Holiday Food Drive",
      "Portuguese Diplomacy: Global Commitments, Local Partnerships",
      "Surrey Campus Dog Therapy",
      "Wetin You Dey Do For Here",
    ]);
    // left out: World AIDS Day (no place), the defences, the Zoom info sessions, staff-only workshops
    expect(last.events.some((e) => /thesis|info session|world aids/i.test(e.title))).toBe(false);
  });

  it("a place that names no city gets its campus's", async () => {
    const { events } = await sfu.parse(sfuFirst, 0, w);
    const at = (title: string) => events.find((e) => e.title === title)!.place!;
    expect(at("Holiday Food Drive")).toMatchObject({ name: "SFU Burnaby Campus", city: "Burnaby" });
    expect(at("611 Talk: Evan Lee").city).toBe("Vancouver");
    // off campus and at the Vancouver campus: Western Front, on East 8th
    expect(at("Six Turntables").city).toBe("Vancouver");
    const { events: later } = await sfu.parse(sfuLast, 3, w);
    expect(later.find((e) => e.title === "Surrey Campus Dog Therapy")!.place).toMatchObject({ city: "Surrey" });
  });

  it("leaves out what's away from Greater Vancouver, online or nowhere", () => {
    const one = (place: NormalizedEvent["place"], labels: string[], online = false): NormalizedEvent => ({
      source: "sfu", sourceEventId: "1@2026-11-19", url: "https://events.sfu.ca/event/1", title: "x", start: "2026-11-19", status: "scheduled", place, online, sourceCategories: labels,
    });
    const hotel = { name: "Delta Hotels Calgary Downtown 209 4 Ave SE", address: null, city: null };
    expect(sfuOpen([one(hotel, ["Conferences", "Public", "Off Campus"])])).toEqual([]);
    expect(sfuOpen([one({ name: "Room 1700", city: null }, ["Lectures", "Public", "SFU Vancouver Campus"], true)])).toEqual([]);
    expect(sfuOpen([one(null, ["Arts & Culture", "Public", "SFU Burnaby Campus"])])).toEqual([]);
    expect(sfuOpen([one({ name: "Room 1700", city: null }, ["Lectures", "All Students", "SFU Vancouver Campus"])])).toEqual([]);
    expect(sfuOpen([one({ name: "Room 1700", city: null }, ["Lectures", "Public", "SFU Vancouver Campus"])])[0].place?.city).toBe("Vancouver");
  });

  it("a page that isn't one is a failed step, not an empty day", () => {
    expect(() => sfu.parse('{"error":"Too many requests"}', 0, w)).toThrow("not a LiveWhale events page");
  });
});

describe("Showpass: what anyone can go to", () => {
  const dates = SOURCE_BY_ID.showpass;
  const seasons = SOURCE_BY_ID["showpass-season"];
  // (fromVan: 07:00 UTC, British Columbia's midnight all year since 2026)
  const w = { runId: "2026-11-26", fromMs: fromVan("2026-11-26"), toMs: fromVan("2026-12-10") };
  const titles = (events: NormalizedEvent[]) => events.map((e) => e.title).sort();

  it("asks for the window's dates 20 a page, and for what's on sale in it 100 a page, round Ticketmaster's circle", () => {
    const circle = "location__point_location=49.15,-122.75,60";
    expect(dates.request(0, {} as Env, w)).toBe(
      `https://www.showpass.com/api/public/events/?${circle}&starts_on__gte=2026-11-26T07:00:00Z&starts_on__lt=2026-12-10T07:00:00Z&ordering=starts_on,id&page_size=20&page=1`,
    );
    expect(dates.request(4, {} as Env, w)).toMatch(/&page=5$/);
    expect(seasons.request(1, {} as Env, w)).toBe(
      `https://www.showpass.com/api/public/discovery/?${circle}&ends_on__gte=2026-11-26T07:00:00Z&starts_on__lt=2026-12-10T07:00:00Z&ordering=starts_on&page_size=100&page=2`,
    );
  });

  it("keeps shows, games and parties in Greater Vancouver; no student club's, nothing on a campus or the Sunshine Coast, no month's admission", async () => {
    const { events, more } = await dates.parse(showpassEvents, 0, w);
    expect(more).toBe(true);
    expect(titles(events)).toEqual([
      "(Hot) Characters In Your Area",
      "Free Cover at Mansion Nightclub! CityVibez Friday Party!",
      "Richmond Sockeyes v. Delta Ice Hawks",
      "Seymour Dance: The Nutcracker",
      "Vancouver Giants vs. Regina Pats",
    ]);
  });

  it("keeps the seasons: the Christmas Market, VanDusen's lights; not a season pass or a club's membership", async () => {
    const { events, more } = await seasons.parse(showpassDiscovery, 0, w);
    expect(more).toBe(true);
    expect(titles(events)).toEqual(["Dinner with Santa – Christmas Dinner Cruise", "VANDUSEN FESTIVAL OF LIGHTS", "Vancouver Christmas Market 2026"]);
    expect((await seasons.parse('{"count":0,"next":null,"previous":null,"results":[]}', 0, w)).more).toBe(false);
    expect(() => seasons.parse('{"detail":"Invalid page."}', 9, w)).toThrow("not a Showpass page");
  });

  it("online, nowhere, or past Greater Vancouver: left out", () => {
    const one = (place: NormalizedEvent["place"], online = false): NormalizedEvent => ({ source: "showpass", sourceEventId: "1", url: "https://www.showpass.com/x/", title: "x", start: "2026-11-26", status: "scheduled", place, online });
    expect(showpassOpen([one({ name: "Squamish Legion", city: "Squamish", lat: 49.7, lon: -123.15 })])).toEqual([]);
    expect(showpassOpen([one(null)])).toEqual([]);
    expect(showpassOpen([one({ name: "The Roxy", city: "Vancouver", lat: 49.2786, lon: -123.1236 }, true)])).toEqual([]);
    expect(showpassOpen([one({ name: "The Roxy", city: "Vancouver", lat: 49.2786, lon: -123.1236 })])).toHaveLength(1);
  });
});
