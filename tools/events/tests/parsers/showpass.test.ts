import { describe, expect, it } from "vitest";
import discoveryRaw from "../fixtures/showpass/discovery-2026-11-26.json?raw";
import eventsRaw from "../fixtures/showpass/events-2026-11-26.json?raw";
import { isSpPage, parseShowpass, spPrices, type SpPage } from "../../src/parsers/showpass";

// Showpass's public API, 26 November to 9 December 2026, 60 km round Surrey and Langley: from each
// answer, the items that show what it does (their fields as Showpass sent them, the ticket types
// cut to name, price and sold out)
const eventsPage = JSON.parse(eventsRaw) as SpPage;
const discoveryPage = JSON.parse(discoveryRaw) as SpPage;
const events = parseShowpass(eventsPage, "showpass", "events");
const seasons = parseShowpass(discoveryPage, "showpass-season", "discovery");
// (an item's id is the same in both answers: Showpass's)
const inEvents = (id: string) => events.find((e) => e.sourceEventId === id);
const inSeasons = (id: string) => seasons.find((e) => e.sourceEventId === id);

describe("Showpass: every date (events)", () => {
  it("reads every item that lasts less than a day, but no timed-entry slot or rink session", () => {
    expect(isSpPage(eventsPage)).toBe(true);
    expect(new Set(events.map((e) => e.title))).toEqual(new Set([
      "(Hot) Characters In Your Area",
      "Richmond Sockeyes v. Delta Ice Hawks",
      "Vancouver Giants vs. Regina Pats",
      "Free Cover at Mansion Nightclub! CityVibez Friday Party!",
      "THE STEADIES AT ROBERTS CREEK LEGION SATURDAY NOV.28",
      "Ontario Veterinary College Information Session",
      "Free ZeroZero Pickleball Event @Richmond FLAGSHIP Location",
      "Bloedel Conservatory - December 2026",
      "Dodgeball Faculty Face-Off",
      "Seymour Dance: The Nutcracker",
    ]));
    // the Christmas Market's and VanDusen's half hours (their seasons come from discovery), a rink's
    // drop-in hour, a dinner cruise run over two months (discovery too)
    for (const gone of ["1560743", "1564654", "1565685", "1557962", "1574382", "1578137"]) expect(inEvents(gone)).toBeUndefined();
  });

  it("an item's own id, its times in Vancouver, its place with coordinates, the page to buy on", () => {
    expect(inEvents("1575640")).toMatchObject({
      source: "showpass",
      title: "Seymour Dance: The Nutcracker",
      // (British Columbia stays on UTC-7 all year since 2026: src/time.ts)
      start: "2026-12-05T18:30:00-07:00",
      end: "2026-12-05T20:15:00-07:00",
      allDay: false,
      timeTBD: false,
      status: "scheduled",
      url: "https://www.showpass.com/seymour-dance-the-nutcracker-26-12-05-18-5674/",
      place: { name: "Centennial Theatre", address: "2300 Lonsdale Ave", city: "North Vancouver", postalCode: "V7M 3L1", lat: 49.33063139999999, lon: -123.0716548 },
      organizer: "Centennial Theatre",
      online: false,
    });
    expect(inEvents("1575640")?.description).toMatch(/^Seymour Dance Presents: The Nutcracker/);
    expect(inEvents("1575640")?.imageUrl).toMatch(/^https:\/\//);
  });

  it("prices: the lowest and highest paid ticket (a child's free one isn't the price); free when every ticket is", () => {
    expect(inEvents("1547392")).toMatchObject({ priceMin: 4, priceMax: 14, isFree: false, tags: ["tickets"] });
    expect(inEvents("1577160")).toMatchObject({ priceMin: 0, priceMax: 0, isFree: true, tags: ["free"] });
    expect(spPrices({ name: "x", starts_on: "2026-12-01T00:00:00Z", ticket_types: [] })).toEqual({ priceMin: null, priceMax: null, isFree: null });
    expect(spPrices({ name: "x", starts_on: "2026-12-01T00:00:00Z", sub_items: [{ price: null }, { price: "22.99" }, { price: "0.00" }] })).toEqual({ priceMin: 22.99, priceMax: 22.99, isFree: false });
  });

  it("a page that isn't Showpass's is an error; so is one it can't read", () => {
    expect(isSpPage({ detail: "Invalid page." })).toBe(false);
    expect(() => parseShowpass({ count: 2, next: null, results: [{ name: "", starts_on: "x" }, { name: "y", starts_on: "nope" }] }, "showpass", "events")).toThrow("2 of 2 events");
  });
});

describe("Showpass: what it sells (discovery)", () => {
  it("keeps what lasts more than a day: an attraction's season, a run of dinners, with Showpass's categories", () => {
    expect(new Set(seasons.map((e) => e.title))).toEqual(new Set([
      "Season Pass - Vancouver Christmas Market",
      "Undergraduate Research Opportunities 2026/27 Membership Sale",
      "Vancouver Christmas Market 2026",
      "VANDUSEN FESTIVAL OF LIGHTS",
      "Dinner with Santa – Christmas Dinner Cruise",
    ]));
    expect(inSeasons("1513143")).toMatchObject({
      source: "showpass-season",
      start: "2026-11-25T16:00:00-07:00",
      end: "2026-12-24T20:00:00-07:00",
      url: "https://tickets.vancouverchristmasmarket.com/",
      category: "festivals",
      sourceCategories: ["fairs_and_festivals", "food_and_beverage", "seasonal_and_holiday"],
      priceMin: 22.99,
    });
    expect(inSeasons("1566273")).toMatchObject({ start: "2026-11-27T16:00:00-07:00", end: "2027-01-03T21:00:00-07:00", category: "festivals", priceMin: null, isFree: null });
    // dates and times "to be determined": its first and last days, all day
    expect(inSeasons("1578137")).toMatchObject({ start: "2026-12-04", end: "2027-02-02", allDay: true, timeTBD: true, category: "food", priceMin: 99.99, priceMax: 125 });
  });

  it("leaves out a series (its dates come from events), a membership, and what lasts a day or less", () => {
    // the Giants' games, the Nutcracker's four shows, a month at VanDusen; the season-ticket holders' club; an improv night
    for (const gone of ["1530323", "1575639", "1483686", "2128", "1516368"]) expect(inSeasons(gone)).toBeUndefined();
  });
});
