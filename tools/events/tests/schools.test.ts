// The colleges' sources and their teams' (src/parsers/schools.ts, src/parsers/sidearm.ts), read
// from their real answers of 25 and 26 November 2026, for the run of 26 November (to 9 December).
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import capuPage from "./fixtures/schools/capu-2026-11-26-p1.html?raw";
import douglasFirst from "./fixtures/schools/douglas-2026-11-25-p0.html?raw";
import douglasSecond from "./fixtures/schools/douglas-2026-11-25-p1.html?raw";
import langaraCommunity from "./fixtures/schools/langara-community-2026-11-25.html?raw";
import langaraStudio58 from "./fixtures/schools/langara-studio58-2026-11-25.html?raw";
import sfuGames from "./fixtures/schools/sfu-red-leafs-2026-11-26.ics?raw";
import ubcGames from "./fixtures/schools/ubc-thunderbirds-2026-11-26.ics?raw";
import vccMarket from "./fixtures/schools/vcc-annual-holiday-market.html?raw";
import vccFlourish from "./fixtures/schools/vcc-flourish-2027.html?raw";
import vccPopUp from "./fixtures/schools/vcc-jewellery-holiday-pop-up-shop.html?raw";
import vccLeftOver from "./fixtures/schools/vcc-jewellery-student-annual-holiday-sale.html?raw";
import vccListPage from "./fixtures/schools/vcc-list-2026-11-25.html?raw";
import { clock, parseLangara, parseVcc, vccList } from "../src/parsers/schools";
import { inWindow, sidearmPlace, sidearmTitle } from "../src/parsers/sidearm";
import { douglasOpen, SOURCE_BY_ID, vccPages } from "../src/sources";
import { fromVan } from "../src/time";
import type { NormalizedEvent } from "../src/types";

const w = { runId: "2026-11-26", fromMs: fromVan("2026-11-26"), toMs: fromVan("2026-12-10") };
const brief = (e: NormalizedEvent) => ({ title: e.title, start: e.start, end: e.end ?? null, where: e.place?.name ?? null, city: e.place?.city ?? null });

afterEach(() => vi.restoreAllMocks());

describe("the teams: UBC Thunderbirds and SFU Red Leafs (SIDEARM Sports)", () => {
  const ubc = SOURCE_BY_ID["ubc-thunderbirds"];
  const sfu = SOURCE_BY_ID["sfu-red-leafs"];

  it("reads each season in one answer", () => {
    expect(ubc.request(0, {} as Env, w)).toBe("https://gothunderbirds.ca/calendar.ashx/calendar.ics?sport_id=0");
    expect(sfu.request(0, {} as Env, w)).toBe("https://athletics.sfu.ca/calendar.ashx/calendar.ics?sport_id=0");
  });

  it("hands the iCal reader only the games starting in the window (the season is too much for a step)", () => {
    const count = (s: string) => s.split("BEGIN:VEVENT").length - 1;
    expect(count(ubcGames)).toBe(218);
    expect(count(inWindow(ubcGames, w.fromMs, w.toMs))).toBe(21);
    expect(inWindow(ubcGames, w.fromMs, w.toMs)).toMatch(/^BEGIN:VCALENDAR[\s\S]*END:VEVENT\r\nEND:VCALENDAR\r\n$/);
  });

  it("keeps the games in Greater Vancouver, home or away, at their venues", async () => {
    const { events, more } = await ubc.parse(ubcGames, 0, w);
    expect(more).toBe(false);
    expect(events).toHaveLength(16);
    expect(events.map(brief)).toContainEqual({ title: "UBC Men's Volleyball vs University of Alberta", start: "2026-11-27T17:30:00-07:00", end: "2026-11-27T19:30:00-07:00", where: "War Memorial Gymnasium", city: "Vancouver" });
    // UBC away at Trinity Western: in Langley, so anyone round here can go
    expect(events.map(brief)).toContainEqual({ title: "UBC Men's Hockey at Trinity Western University", start: "2026-11-27T19:00:00-07:00", end: "2026-11-27T22:00:00-07:00", where: "Langley Events Centre", city: "Langley" });
    // a swim meet over two days, all day
    expect(events.find((e) => e.title === "UBC Swimming vs VPSC Winter Invite")).toMatchObject({ start: "2026-12-04", allDay: true, place: { name: "UBC Aquatic Centre", city: "Vancouver" } });
    // not in Victoria or Winnipeg
    expect(events.filter((e) => /Victoria|Winnipeg/.test(`${e.place?.city}`))).toEqual([]);
    expect(new Set(events.map((e) => `${e.category} ${e.organizer} ${e.source}`))).toEqual(new Set(["outdoors UBC Thunderbirds ubc-thunderbirds"]));
  });

  it("keeps SFU's home games, named as people say them", async () => {
    const { events } = await sfu.parse(sfuGames, 0, w);
    expect(events.map(brief)).toEqual([
      { title: "SFU Men's Basketball vs Black Hills State (S.D.)", start: "2026-11-26T20:00:00-07:00", end: "2026-11-26T22:00:00-07:00", where: "West Gym", city: "Burnaby" },
      { title: "SFU Women's Basketball vs Alaska", start: "2026-12-03T20:00:00-07:00", end: "2026-12-03T22:00:00-07:00", where: "West Gym", city: "Burnaby" },
      { title: "SFU Women's Basketball vs Alaska Anchorage", start: "2026-12-05T18:15:00-07:00", end: "2026-12-05T20:15:00-07:00", where: "West Gym", city: "Burnaby" },
    ]);
  });

  it("reads a venue after its city, and SFU's titles the short way", () => {
    expect(sidearmPlace("Vancouver, B.C., War Memorial Gymnasium")).toEqual({ name: "War Memorial Gymnasium", address: "War Memorial Gymnasium, Vancouver, BC", city: "Vancouver", postalCode: null });
    expect(sidearmPlace("Victoria, B.C.")).toEqual({ name: "Victoria", address: "Victoria, BC", city: "Victoria", postalCode: null });
    expect(sidearmTitle("Simon Fraser University Wrestling - W at Saskatchewan Huskie Open")).toBe("SFU Women's Wrestling at Saskatchewan Huskie Open");
    expect(sidearmTitle("Simon Fraser University Golf Invitational")).toBe("SFU Golf Invitational");
    expect(sidearmTitle("UBC Women's Hockey vs University of Manitoba")).toBe("UBC Women's Hockey vs University of Manitoba");
  });
});

describe("Capilano University's Centre for Performing Arts", () => {
  const capu = SOURCE_BY_ID.capu;

  it("asks for its list (from today on), never with the search= its robots.txt asks robots to leave alone", () => {
    expect([0, 1].map((p) => capu.request(p, {} as Env, w))).toEqual([
      "https://www.capilanou.ca/student-services/community/centre-for-performing-arts/our-events/all-events/",
      "https://www.capilanou.ca/student-services/community/centre-for-performing-arts/our-events/all-events/?page=2",
    ]);
  });

  it("reads each card: its days (the year from where the list starts), hours, picture, on the North Vancouver campus", async () => {
    const { events, more } = await capu.parse(capuPage, 0, w);
    // the page runs to mid-February: no need for the next
    expect(more).toBe(false);
    expect(events).toHaveLength(10);
    expect(events[0]).toMatchObject({
      title: "Jon Faddis and CapU Jazz Ensembles",
      start: "2026-11-27T19:30:00-07:00",
      end: "2026-11-27T21:30:00-07:00",
      url: "https://www.capilanou.ca/student-services/community/centre-for-performing-arts/our-events/all-events/events/jon-faddis-and-capu-jazz-ensembles.php",
      imageUrl: "https://www.capilanou.ca/media/capilanouca/about-capu/get-to-know-us/events/the-blueshore-at-capu/800-Jon_Faddis_-.jpg",
      place: { name: "CapU Centre for Performing Arts", address: "2055 Purcell Way, North Vancouver, BC V7J 3H5", city: "North Vancouver", postalCode: "V7J 3H5" },
      organizer: "Capilano University",
    });
    // evenings from the 7th to the 17th; a day with no hours given; January is next year's
    expect(events.find((e) => e.title === "CapU Jazz Student Showcases")).toMatchObject({ start: "2026-12-07T19:30:00-07:00", end: "2026-12-17T21:00:00-07:00", allDay: false });
    expect(events.find((e) => e.title === "Winter Harp")).toMatchObject({ start: "2026-12-22", end: null, allDay: true, timeTBD: true });
    expect(events.find((e) => e.title === "Home")).toMatchObject({ start: "2027-01-16", end: "2027-01-17", allDay: true });
    expect(events.find((e) => e.title === "Donovan Woods")).toMatchObject({ start: "2027-02-16T19:30:00-07:00" });
  });

  it("refuses a page that isn't its list", () => {
    expect(() => capu.parse("<html><body>Sorry, we're down</body></html>", 0, w)).toThrow("not Capilano's list of events");
  });

  it("reads the times people write", () => {
    expect(["7:30 PM", "11:45 AM", "12:00 pm", "12 a.m.", "9 p.m.", "13:00", ""].map((s) => clock(s))).toEqual(["19:30", "11:45", "12:00", "00:00", "21:00", null, null]);
  });
});

describe("Langara: Studio 58 and its talks for the community", () => {
  const langara = SOURCE_BY_ID.langara;

  it("reads two lists, one after the other", () => {
    expect([0, 1].map((p) => langara.request(p, {} as Env, w))).toEqual(["https://langara.ca/news-events/events?type=60", "https://langara.ca/news-events/events?topics=153"]);
  });

  it("keeps Studio 58's plays, each run from its first evening to its last", async () => {
    const { events, more } = await langara.parse(langaraStudio58, 0, w);
    expect(more).toBe(true);
    expect(events.map((e) => e.title)).toEqual(["Studio 58 | Twelfth Night", "Studio 58 | Chaos", "Studio 58 | Risky Nights (Spring Edition)", "Studio 58 | Amélie"]);
    expect(events[0]).toMatchObject({
      start: "2026-11-26T20:30:00-07:00",
      end: "2026-12-06T17:00:00-07:00",
      category: "shows",
      url: "https://langara.ca/news-events/events/studio-58-twelfth-night",
      place: { name: "Langara Main Campus - Studio 58 (A Building)", address: "100 West 49th Avenue, Vancouver, BC V5Y 2Z6", city: "Vancouver", postalCode: "V5Y 2Z6" },
      sourceCategories: ["Studio 58"],
    });
    expect(events[0].description).toMatch(/^Live at Studio 58 November 26-December 6, 2026/);
  });

  it("reads a talk given three times as three events, and leaves out the ones that name no place", async () => {
    const all = parseLangara(langaraCommunity, { source: "langara", label: "Community" });
    expect(all.filter((e) => e.title === "Langara Lectures: Unprecedented").map((e) => [e.start, e.place])).toEqual([
      ["2026-12-03T18:00:00-07:00", null],
      ["2027-02-04T18:00:00-07:00", null],
      ["2027-03-04T18:00:00-07:00", null],
    ]);
    const { events, more } = await langara.parse(langaraCommunity, 1, w);
    expect(more).toBe(false);
    expect(events.map((e) => [e.title, e.place?.name, e.category])).toEqual([["ARC Seminar Series, Spring 2027 | “False Creek”: Community Connected by Water", "Langara Main Campus - T Building Gallery", null]]);
  });
});

describe("Douglas College", () => {
  const douglas = SOURCE_BY_ID.douglas;

  it("reads its list page by page", () => {
    expect([0, 1].map((p) => douglas.request(p, {} as Env, w))).toEqual(["https://www.douglascollege.ca/about-douglas/news-and-events", "https://www.douglascollege.ca/about-douglas/news-and-events?page=1"]);
  });

  it("keeps what's in its gallery, not the students' meditations, orientations or online sessions", async () => {
    const { events, more } = await douglas.parse(douglasFirst, 0, w);
    // the page's last event is on 10 December, past the window
    expect(more).toBe(false);
    expect(events).toEqual([
      expect.objectContaining({
        title: "kʷәcstәxʷ - A Celebration of Indigenous Artistry",
        start: "2026-10-22T16:30:00-07:00",
        end: "2027-01-06T19:30:00-07:00",
        category: "arts",
        url: "https://www.douglascollege.ca/about-douglas/news-and-events/2026/oct/kwcstxw-celebration-indigenous-artistry",
        place: { name: "Amelia Douglas Gallery, Fourth Floor North, Douglas College, 700 Royal Ave., New Westminster", address: "700 Royal Avenue, New Westminster, BC V3M 5Z5", city: "New Westminster", postalCode: "V3M 5Z5" },
        sourceCategories: ["All"],
      }),
    ]);
    expect((await douglas.parse(douglasSecond, 1, w)).events).toEqual([]);
  });

  it("keeps a play on its stage whoever it's said to be for, and what's for the community; never a ceremony", () => {
    const at = (title: string, where: string, labels: string[]): NormalizedEvent => ({
      source: "douglas", sourceEventId: title, url: "https://www.douglascollege.ca/x", title, start: "2026-12-01T19:30:00-08:00", status: "scheduled",
      place: { name: where, address: null, city: "New Westminster", postalCode: null }, sourceCategories: labels,
    });
    const kept = douglasOpen([
      at("Eurydice by Sarah Ruhl", "Douglas College Theatre, (N4100)", ["Current Students"]),
      at("Urban Challenges Forum", "Room 2201", ["Community"]),
      at("Graduation Ceremony G", "Douglas College Theatre", ["All"]),
      at("Game Night in the Library", "N2100B", ["Current Students"]),
    ]);
    expect(kept.map((e) => [e.title, e.category])).toEqual([["Eurydice by Sarah Ruhl", "shows"], ["Urban Challenges Forum", null]]);
  });
});

describe("Vancouver Community College's community events", () => {
  const vcc = SOURCE_BY_ID.vcc;

  it("lists each event's page and first day", () => {
    expect(vccList(vccListPage)).toHaveLength(8);
    expect(vccList(vccListPage)[2]).toEqual({ url: "https://www.vcc.ca/about/news-and-events/events/annual-holiday-market/", day: "2026-12-10" });
    expect(() => vccList("<html><body class='home'></body></html>")).toThrow("not VCC's list of community events");
  });

  it("reads the list once a day (part 0), the pages of what's coming up, and keeps them for the other parts", async () => {
    const fetched = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(vccListPage));
    // the run of 27 November: its window ends on 10 December (the market's day)
    const now = fromVan("2026-11-27T06:00");
    const pages = await vccPages(env, 0, now);
    expect(pages).toEqual([
      "https://www.vcc.ca/about/news-and-events/events/jewellery-holiday-pop-up-shop/",
      "https://www.vcc.ca/about/news-and-events/events/annual-holiday-market/",
      "https://www.vcc.ca/about/news-and-events/events/celebrate-diwali-and-bandi-chhor-divas-with-us/",
      "https://www.vcc.ca/about/news-and-events/events/jewellery-student-annual-holiday-sale/",
    ]);
    expect(await vccPages(env, 1, now)).toEqual(pages);
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(vcc.request(1, {} as Env, w, pages[1])).toBe(pages[1]);
  });

  it("reads an event page: its days, its hours when there's one line of them, its campus", async () => {
    expect((await vcc.parse(vccMarket, 0, w)).events.map((e) => [e.title, e.start, e.end, e.allDay, e.place])).toEqual([
      ["Annual holiday market", "2026-12-10T09:30:00-07:00", "2026-12-10T13:30:00-07:00", false, { name: "Atrium, Downtown campus", address: "250 West Pender Street, Vancouver, BC V6B 1S9", city: "Vancouver", postalCode: "V6B 1S9" }],
    ]);
    // other hours each day: shown as its days
    expect((await vcc.parse(vccPopUp, 0, w)).events.map((e) => [e.start, e.end, e.allDay, e.imageUrl])).toEqual([["2026-12-08", "2026-12-10", true, null]]);
    // its own street, when it gives one
    expect(parseVcc(vccFlourish, { source: "vcc" })[0]).toMatchObject({ start: "2027-03-11T18:00:00-07:00", end: "2027-03-11T21:00:00-07:00", place: { name: "VCC Broadway Campus", address: "1120 E. 7th Ave, Vancouver", city: "Vancouver" } });
    // last year's page, ending before it begins: nothing
    expect(parseVcc(vccLeftOver, { source: "vcc" })).toEqual([]);
    expect(parseVcc(vccMarket, { source: "vcc" })[0].description).toMatch(/^Join us at VCC’s annual holiday market/);
    expect(() => vcc.parse("<html></html>", 0, w)).toThrow("not a VCC event page");
  });
});
