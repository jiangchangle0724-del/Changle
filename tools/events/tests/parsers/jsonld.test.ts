import { hrtime } from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseJsonLd } from "../../src/parsers/jsonld";
import expected from "../fixtures/jsonld/expected.json";
import commodore from "../fixtures/jsonld/commodore-home.html?raw";
import burnaby from "../fixtures/jsonld/eventbrite-ai-burnaby.html?raw";
import drag from "../fixtures/jsonld/eventbrite-drag-show.html?raw";
import gala from "../fixtures/jsonld/eventbrite-garden-gala.html?raw";
import jobs from "../fixtures/jsonld/eventbrite-job-fair.html?raw";
import listing from "../fixtures/jsonld/eventbrite-vancouver-listing.html?raw";
import mindset from "../fixtures/jsonld/meetup-mindset-workshop.html?raw";
import newcomers from "../fixtures/jsonld/meetup-new-in-vancouver.html?raw";
import group from "../fixtures/jsonld/meetup-vancouver-group.html?raw";
import ubc from "../fixtures/jsonld/ubc-event-graph.html?raw";

const pages: Record<string, string> = {
  "commodore-home.html": commodore,
  "eventbrite-ai-burnaby.html": burnaby,
  "eventbrite-drag-show.html": drag,
  "eventbrite-garden-gala.html": gala,
  "eventbrite-job-fair.html": jobs,
  "eventbrite-vancouver-listing.html": listing,
  "meetup-mindset-workshop.html": mindset,
  "meetup-new-in-vancouver.html": newcomers,
  "meetup-vancouver-group.html": group,
  "ubc-event-graph.html": ubc,
};
const opts = { source: "jsonld-test", pageUrl: "https://example.test/page?campaign=1" };
// Synthetic inputs live here; the ten saved pages and expected.json stay untouched.
const event = (changes: Record<string, unknown> = {}) => ({
  "@type": "Event", name: "An event", startDate: "2026-11-01T19:00:00", ...changes,
});
const script = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const parse = (changes: Record<string, unknown> = {}) => parseJsonLd(script(event(changes)), opts);
// Exactly 25 ASCII descriptions of 30,000 bytes, with entities but no unescaped '<'.
const longDescription = ("Kept: " + "&nbsp;".repeat(799) + "tail &amp; ".repeat(2520)).slice(0, 30_000);
const longPage = script(Array.from({ length: 25 }, (_, i) =>
  event({ url: `https://example.test/long/${i}`, description: longDescription })));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Parsers must never fetch"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("saved JSON-LD pages", () => {
  for (const [file, answer] of Object.entries(expected.pages)) {
    it(`matches the count and first event in ${file}`, async () => {
      const events = await parseJsonLd(pages[file], opts);
      expect(events).toHaveLength(answer.events);
      const first = events[0];
      const dateOnly = answer.first.startDate.length === 10;
      const series = file === "ubc-event-graph.html";
      expect(first).toMatchObject({
        source: opts.source,
        title: answer.first.name,
        start: series ? "2026-07-19" : dateOnly ? answer.first.startDate
          : answer.first.startDate.length === 19 ? `${answer.first.startDate}-07:00` : answer.first.startDate,
        end: series ? "2026-12-08" : answer.first.endDate,
        allDay: dateOnly || series,
        timeTBD: dateOnly,
        status: "scheduled",
        online: answer.first.locationType === "VirtualLocation",
        category: null,
      });
      if (answer.first.locationType === "VirtualLocation") expect(first.place).toBeNull();
      else expect(first.place?.name).toBe(answer.first.location);
      const offer = answer.first.offers;
      expect(first.priceMin).toBe(offer ? Number(offer.lowPrice) : null);
      expect(first.priceMax).toBe(offer ? Number(offer.highPrice) : null);
      expect(first.isFree).toBe(offer ? Number(offer.lowPrice) === 0 : null);
      expect(first.tags).toEqual(first.isFree ? ["free"] : []);
      for (const e of events) {
        expect(e.url).toMatch(/^https:\/\//);
        expect(e.sourceEventId).toBe(`${e.url.split("?")[0]}@${e.start.slice(0, 10)}`);
        expect(e.description?.length ?? 0).toBeLessThanOrEqual(600);
      }
      expect(fetch).not.toHaveBeenCalled();
    });
  }

  it("maps the saved postal address, image and organizer", async () => {
    const [e] = await parseJsonLd(burnaby, opts);
    expect(e.place).toEqual({
      name: "3993 Henning Dr", address: "3993 Henning Drive, Unit #215, Burnaby, BC V5C 6P7",
      city: "Burnaby", postalCode: null, lat: null, lon: null,
    });
    expect(e.organizer).toBe("Craftify AI");
    expect(e.imageUrl).toMatch(/^https:\/\/img.evbuc.com\//);
    expect((await parseJsonLd(mindset, opts))[0].imageUrl).toBe("https://secure-content.meetupstatic.com/images/classic-events/536876794/676x676.jpg");
  });

  it("keeps the listing's three repeated pairs with matching IDs in each pair", async () => {
    expect(expected.pages["eventbrite-vancouver-listing.html"].events).toBe(32);
    const events = await parseJsonLd(listing, opts);
    expect(events).toHaveLength(32);
    for (const name of [
      "AFTER PARTY: Parade of Lost Souls 2026",
      "COFFIN CLUB ~ Halloween @ The Red Room ~ TICKETS",
      "Keithmas XVII - A Food Bank Fundrager",
    ]) {
      expect(listing.split(JSON.stringify(name))).toHaveLength(3);
      const pair = events.filter((e) => e.title === name);
      expect(pair).toHaveLength(2);
      expect(pair[0].sourceEventId).toBe(pair[1].sourceEventId);
    }
  });
});

describe("JSON-LD structures and streaming", () => {
  it("walks arrays, @graph, ItemList items and subEvent in source order", async () => {
    const html = script({ "@graph": [
      { "@type": "Organization", name: "Ignore me" },
      { "@type": "ItemList", itemListElement: [{ "@type": "ListItem", item: event({ name: "Listed" }) }] },
      event({ name: "Parent", subEvent: [event({ name: "Child" }), event({ name: "Festival", "@type": "Festival" })] }),
    ] }) + script([event({ name: "Typed array", "@type": ["Thing", "SocialEvent"] })]);
    expect((await parseJsonLd(html, opts)).map((e) => e.title)).toEqual(["Listed", "Parent", "Child", "Festival", "Typed array"]);
  });

  it.each(["Event", "MusicEvent", "FoodEvent", "EducationEvent", "TheaterEvent", "Festival", "https://schema.org/Event"])("recognizes %s", async (type) => {
    expect(await parse({ "@type": type })).toHaveLength(1);
  });

  it("skips invalid scripts and non-events while retaining later valid scripts", async () => {
    const html = '<script type="application/ld+json">{broken}</script>'
      + script(null) + script([1, true, "text", { "@type": "WebPage" }])
      + `<script type="application/json">${JSON.stringify(event())}</script>`
      + script(event({ name: "Still here" }));
    expect((await parseJsonLd(html, opts)).map((e) => e.title)).toEqual(["Still here"]);
    expect(await parseJsonLd("<html>No scripts</html>", opts)).toEqual([]);
  });

  it("collects JSON text spanning many HTMLRewriter chunks and resets per script", async () => {
    const name = "Chunk boundary &amp; ".repeat(1500);
    const events = await parseJsonLd(script(event({ name })) + script(event({ name: "Second" })), opts);
    expect(events.map((e) => e.title)).toEqual(["Chunk boundary & ".repeat(1500), "Second"]);
  });

  it("does not leak text between concurrent calls", async () => {
    const results = await Promise.all([parse({ name: "A &amp; B" }), parse({ name: "C &amp; D" })]);
    expect(results.map((r) => r[0].title)).toEqual(["A & B", "C & D"]);
  });
});

describe("normalization", () => {
  it.each([
    ["2026-11-01T02:00:00Z", "2026-10-31T19:00:00-07:00"],
    ["2026-11-01T19:00:00-08:00", "2026-11-01T20:00:00-07:00"],
    ["2026-12-01T19:00", "2026-12-01T19:00:00-07:00"],
    ["2025-12-01T19:00:00", "2025-12-01T19:00:00-08:00"],
    ["2026-11-01T19:00:00.123", "2026-11-01T19:00:00-07:00"],
  ])("converts %s with the time-zone database", async (startDate, start) => {
    expect((await parse({ startDate }))[0]).toMatchObject({ start, allDay: false, timeTBD: false });
  });

  it.each(["23:59", "23:59:59"])("keeps whole-day ranges ending at %s inclusive", async (endTime) => {
    expect((await parse({ startDate: "2026-11-01T00:00", endDate: `2026-11-03T${endTime}` }))[0])
      .toMatchObject({ start: "2026-11-01", end: "2026-11-03", allDay: true, timeTBD: false });
  });

  it("keeps date-only ranges as time TBD, and midnight timed events timed", async () => {
    expect((await parse({ startDate: "2026-11-01", endDate: "2026-11-03" }))[0])
      .toMatchObject({ start: "2026-11-01", end: "2026-11-03", allDay: true, timeTBD: true });
    expect((await parse({ startDate: "2026-11-01T00:00", endDate: "2026-11-01T01:00" }))[0].allDay).toBe(false);
  });

  it.each([null, "nonsense", "2026-02-30", "2026-11-01T25:00", "2026-11-01T10:99"])("skips unusable start %s without failing the page", async (startDate) => {
    expect(await parse({ startDate })).toEqual([]);
  });

  it("requires a title and treats a malformed optional end as unknown", async () => {
    expect(await parse({ name: null })).toEqual([]);
    expect((await parse({ endDate: "bad" }))[0].end).toBeNull();
  });

  it.each([
    ["EventScheduled", "scheduled"], ["EventCancelled", "cancelled"],
    ["EventPostponed", "postponed"], ["EventRescheduled", "rescheduled"],
  ])("maps bare and qualified %s", async (status, normalized) => {
    for (const prefix of ["", "https://schema.org/"]) {
      expect((await parse({ eventStatus: prefix + status }))[0].status).toBe(normalized);
    }
  });

  it("reads SoldOut in object/array offers without hiding cancellation", async () => {
    for (const availability of ["SoldOut", "https://schema.org/SoldOut"]) {
      const offer = { availability };
      expect((await parse({ offers: offer }))[0].status).toBe("soldout");
      expect((await parse({ offers: [{ availability: "InStock" }, offer] }))[0].status).toBe("scheduled");
      expect((await parse({ eventStatus: "EventCancelled", offers: offer }))[0].status).toBe("cancelled");
    }
  });

  it("combines numeric CAD prices and ranges, ignoring other currencies and blanks", async () => {
    expect((await parse({ offers: [
      { price: "10.50", priceCurrency: "CAD" }, { lowPrice: 15, highPrice: "40", priceCurrency: "CAD" },
      { price: 0, priceCurrency: "USD" }, { price: "", priceCurrency: "CAD" },
    ] }))[0]).toMatchObject({ priceMin: 10.5, priceMax: 40, isFree: false, tags: [] });
    expect((await parse({ offers: { price: "0", priceCurrency: "CAD" } }))[0])
      .toMatchObject({ priceMin: 0, priceMax: 0, isFree: true, tags: ["free"] });
  });

  it.each([
    { price: "0", priceCurrency: "USD" }, { price: 0 }, { price: "", priceCurrency: "CAD" },
    { price: "free", priceCurrency: "CAD" }, { price: -1, priceCurrency: "CAD" }, { price: false, priceCurrency: "CAD" },
  ])("leaves unsupported prices unknown: %j", async (offers) => {
    expect((await parse({ offers }))[0]).toMatchObject({ priceMin: null, priceMax: null, isFree: null, tags: [] });
  });

  it("maps place fields and numeric coordinates without inferring categories", async () => {
    expect((await parse({ location: { "@type": "Place", name: "Hall", address: {
      "@type": "PostalAddress", streetAddress: "123 Main St", addressLocality: "Burnaby", postalCode: "V5C 1A1",
    }, geo: { latitude: "49.2", longitude: -123.1 } }, category: "Music", keywords: "kids" }))[0])
      .toMatchObject({ place: { name: "Hall", address: "123 Main St", city: "Burnaby", postalCode: "V5C 1A1", lat: 49.2, lon: -123.1 }, category: null, tags: [] });
  });

  it("marks online attendance with no physical place even when an old venue is supplied", async () => {
    expect((await parse({ location: { "@type": ["Thing", "VirtualLocation"] } }))[0]).toMatchObject({ online: true, place: null });
    expect((await parse({ eventAttendanceMode: "OnlineEventAttendanceMode", location: { "@type": "Place", name: "Old hall" } }))[0])
      .toMatchObject({ online: true, place: null, tags: [] });
    expect((await parse())[0]).toMatchObject({ place: null, online: false });
  });

  it("dates every ID, adds a title hash for the page fallback, and removes just the URL query", async () => {
    const [fallback] = await parse();
    expect(fallback.url).toBe(opts.pageUrl);
    expect(fallback.sourceEventId).toMatch(/^https:\/\/example\.test\/page@2026-11-01~[0-9a-f]{8}$/);
    expect((await parse({ url: "https://example.test/event?utm_source=list#details" }))[0])
      .toMatchObject({ url: "https://example.test/event?utm_source=list#details", sourceEventId: "https://example.test/event#details@2026-11-01" });
  });

  it.each(["https://example.test/a.jpg", ["https://example.test/a.jpg", "second"], { "@type": "ImageObject", url: "https://example.test/a.jpg" }, [{ url: "https://example.test/a.jpg" }]])("takes the first image: %j", async (image) => {
    expect((await parse({ image, organizer: { name: "The organizer" } }))[0]).toMatchObject({ imageUrl: "https://example.test/a.jpg", organizer: "The organizer" });
  });

  it("decodes named, decimal and hex entities, preserves title punctuation and strips description HTML", async () => {
    const [e] = await parse({
      name: '  Rock &amp; Roll &copy; &#39; &#x1F3B5; &eacute; "<title>"  ',
      description: "&lt;p&gt;A &amp; B &copy; &#233; &hellip;&lt;/p&gt;<p>Next<br>line</p>",
    });
    expect(e.title).toBe('  Rock & Roll © \' 🎵 é "<title>"  ');
    expect(e.description).toBe("A & B © é …\nNext\nline");
    expect((await parse({ description: "x".repeat(1000) }))[0].description).toHaveLength(600);
  });

  it("decodes multi-codepoint HTML entities and keeps unknown entity names literal", async () => {
    expect((await parse({ name: "&NotEqualTilde; &constructor; &unknown; &#0; &#x110000; &#128;" }))[0].title)
      .toBe("\u2242\u0338 &constructor; &unknown; \ufffd \ufffd \u20ac");
  });
});

describe("PR #303 review regressions", () => {
  it("gives repeated show URLs Vancouver date IDs and retains duplicate records with the same ID", async () => {
    const first = event({ url: "https://example.test/show?campaign=1", startDate: "2026-11-06T02:00:00Z" });
    const second = event({ url: "https://example.test/show?campaign=1", startDate: "2026-11-07T02:00:00Z" });
    const html = script([first, second]) + script(first);
    const events = await parseJsonLd(html, opts);
    expect(events.map((e) => e.sourceEventId)).toEqual([
      "https://example.test/show@2026-11-05", "https://example.test/show@2026-11-06",
      "https://example.test/show@2026-11-05",
    ]);
    expect(events.map((e) => e.start)).toEqual(["2026-11-05T19:00:00-07:00", "2026-11-06T19:00:00-07:00", "2026-11-05T19:00:00-07:00"]);
    const pair = await parseJsonLd(script(first) + script(first), opts);
    expect(pair).toHaveLength(2);
    expect(pair[0].sourceEventId).toBe(pair[1].sourceEventId);
    expect((await parseJsonLd(script(first), opts))[0].sourceEventId).toBe("https://example.test/show@2026-11-05");
  });

  it("gives URL-less events distinct dates under the page ID without renumbering on reorder", async () => {
    const first = event({ name: "First", startDate: "2026-11-05" });
    const second = event({ name: "Second", startDate: "2026-11-06" });
    const events = await parseJsonLd(script([first, second, second]), opts);
    expect(events).toHaveLength(3);
    expect(events[0].sourceEventId).toMatch(/^https:\/\/example\.test\/page@2026-11-05~[0-9a-f]{8}$/);
    expect(events[1].sourceEventId).toMatch(/^https:\/\/example\.test\/page@2026-11-06~[0-9a-f]{8}$/);
    expect(events[2].sourceEventId).toBe(events[1].sourceEventId);
    expect(await parseJsonLd(script([second, first]), opts)).toEqual([events[1], events[0]]);
  });

  it("adds Vancouver wall-clock seconds only on days with multiple start times under one base ID", async () => {
    const shows = [
      event({ url: "https://example.test/show", startDate: "2026-11-06T02:00:00Z" }),
      event({ url: "https://example.test/show", startDate: "2026-11-06T05:30:00Z" }),
      event({ url: "https://example.test/show", startDate: "2026-11-07T02:00:00Z" }),
    ];
    const events = await parseJsonLd(script([...shows, shows[0]]), opts);
    expect(events.map((e) => e.sourceEventId)).toEqual([
      "https://example.test/show@2026-11-05T19:00:00",
      "https://example.test/show@2026-11-05T22:30:00",
      "https://example.test/show@2026-11-06",
      "https://example.test/show@2026-11-05T19:00:00",
    ]);
    expect(new Set(events.map((e) => e.sourceEventId)).size).toBe(3);
  });

  it("reduces a timed end to its Vancouver date when the start has no time", async () => {
    expect((await parse({ startDate: "2026-11-05", endDate: "2026-11-07T02:00:00Z" }))[0])
      .toMatchObject({ start: "2026-11-05", end: "2026-11-06", allDay: true, timeTBD: true });
  });

  it("leaves a date-only end unknown when the start has a time", async () => {
    expect((await parse({ startDate: "2026-11-05T19:00:00", endDate: "2026-11-06" }))[0])
      .toMatchObject({ start: "2026-11-05T19:00:00-07:00", end: null, allDay: false, timeTBD: false });
  });

  it("caps each of 25 long descriptions before decoding entities", async () => {
    expect(new TextEncoder().encode(longDescription).length).toBe(30_000);
    const events = await parseJsonLd(longPage, opts);
    expect(events).toHaveLength(25);
    expect(events.every((e) => e.description === "Kept:")).toBe(true);
  });

  it("does not label a mix of free and paid tickets as free", async () => {
    for (const offers of [
      [{ price: 0, priceCurrency: "CAD" }, { price: 25, priceCurrency: "CAD" }],
      { lowPrice: "0", highPrice: "25", priceCurrency: "CAD" },
    ]) expect((await parse({ offers }))[0]).toMatchObject({ priceMin: 0, priceMax: 25, isFree: false, tags: [] });
    expect((await parse({ offers: [{ price: 0, priceCurrency: "CAD" }, { price: "0", priceCurrency: "CAD" }] }))[0])
      .toMatchObject({ isFree: true, tags: ["free"] });
  });

  it("requires every offer to be sold out, including ordinary tickets and unknown availability", async () => {
    const sold = { availability: "schema:SoldOut" };
    expect((await parse({ offers: [sold, { availability: { "@id": "https://schema.org/SoldOut/" } }] }))[0].status).toBe("soldout");
    expect((await parse({ offers: [sold, { availability: "InStock" }] }))[0].status).toBe("scheduled");
    expect((await parse({ offers: [sold, {}] }))[0].status).toBe("scheduled");
    expect((await parse({ offers: [] }))[0].status).toBe("scheduled");
    expect((await parse({ eventStatus: "EventPostponed", offers: [sold, sold] }))[0].status).toBe("postponed");
  });

  it("keeps the physical venue for hybrid events in either location order", async () => {
    const physical = { "@type": "Place", name: "Hall", address: { streetAddress: "123 Main St" } };
    const virtual = { "@type": "VirtualLocation", url: "https://example.test/online" };
    for (const location of [[physical, virtual], [virtual, physical]]) {
      expect((await parse({ location }))[0]).toMatchObject({ online: true, place: { name: "Hall", address: "123 Main St" } });
    }
    expect((await parse({ location: [virtual] }))[0]).toMatchObject({ online: true, place: null });
  });

  it("parses text locations and text addresses with placeFromText", async () => {
    const address = "Science World, 1455 Quebec St, Vancouver, BC V6A 3Z7, Canada";
    expect((await parse({ location: address }))[0].place).toEqual({
      name: "Science World", address: "1455 Quebec St, Vancouver, BC V6A 3Z7, Canada", city: "Vancouver", postalCode: "V6A 3Z7",
    });
    expect((await parse({ location: { "@type": "Place", name: "Hall", address, geo: { latitude: 49.27, longitude: -123.1 } } }))[0].place)
      .toEqual({ name: "Hall", address: "1455 Quebec St, Vancouver, BC V6A 3Z7, Canada", city: "Vancouver", postalCode: "V6A 3Z7", lat: 49.27, lon: -123.1 });
    expect((await parse({ location: { "@type": "Place", address } }))[0].place?.name).toBe("Science World");
  });

  it("decodes venue and organizer names, including names in text locations", async () => {
    expect((await parse({ location: { name: "Donnellan&#8217;s &amp; Friends" }, organizer: { name: "Artists&#8217; &amp; Co" } }))[0])
      .toMatchObject({ place: { name: "Donnellan’s & Friends" }, organizer: "Artists’ & Co" });
    expect((await parse({ location: "Donnellan&#8217;s &amp; Friends, 123 Main St, Vancouver, BC V6A 1A1" }))[0].place?.name)
      .toBe("Donnellan’s & Friends");
  });

  it.each([
    "schema:EventCancelled", { "@id": "https://schema.org/EventCancelled" },
    "https://schema.org/EventCancelled/", { "@id": "schema:EventCancelled/" },
  ])("preserves cancellation for abbreviated/object/trailing-slash status %j", async (eventStatus) => {
    expect((await parse({ eventStatus, offers: { availability: "InStock" } }))[0].status).toBe("cancelled");
  });

  it("also normalizes abbreviated postponed/rescheduled statuses", async () => {
    expect((await parse({ eventStatus: "schema:EventPostponed" }))[0].status).toBe("postponed");
    expect((await parse({ eventStatus: { "@id": "https://schema.org/EventRescheduled/" } }))[0].status).toBe("rescheduled");
  });

  it.each([
    ["/events/show?campaign=1", "https://example.test/events/show?campaign=1"],
    ["next", "https://example.test/next"],
    ["//tickets.example.test/show", "https://tickets.example.test/show"],
  ])("resolves event URL %s against pageUrl", async (url, resolved) => {
    expect((await parse({ url }))[0]).toMatchObject({ url: resolved, sourceEventId: `${resolved.split("?")[0]}@2026-11-01` });
  });

  it("trims BOM and whitespace before parsing each script", async () => {
    const html = `<script type="application/ld+json">\ufeff \n${JSON.stringify(event())}\n </script>`;
    expect(await parseJsonLd(html, opts)).toHaveLength(1);
  });

  it.each(["mainEntity", "event", "events"])("walks single events and event lists under %s", async (field) => {
    const html = script({ "@type": "WebPage", [field]: event({ name: "Single" }) })
      + script({ [field]: [event({ name: "Listed first" }), { "@graph": [event({ name: "Nested" })] }] });
    expect((await parseJsonLd(html, opts)).map((e) => e.title)).toEqual(["Single", "Listed first", "Nested"]);
  });
});

describe("PR #303 second review regressions", () => {
  it("keeps the last show's ID unchanged when earlier dates disappear from the page", async () => {
    const shows = [18, 19, 20].map((day) => event({
      name: "The Nutcracker", url: "https://example.test/nutcracker?campaign=1", startDate: `2026-12-${day}T19:00:00`,
    }));
    const all = await parseJsonLd(script(shows), opts);
    expect(all.map((e) => e.sourceEventId)).toEqual([
      "https://example.test/nutcracker@2026-12-18",
      "https://example.test/nutcracker@2026-12-19",
      "https://example.test/nutcracker@2026-12-20",
    ]);
    const [last] = await parseJsonLd(script(shows[2]), opts);
    expect(last.sourceEventId).toBe(all[2].sourceEventId);
  });

  it("dates a single activity and preserves its date-only ID when identical records are repeated", async () => {
    const first = event({ url: "https://example.test/single", startDate: "2026-11-05T19:00:00" });
    const [single] = await parseJsonLd(script(first), opts);
    expect(single.sourceEventId).toBe("https://example.test/single@2026-11-05");
    expect((await parseJsonLd(script([first, first]), opts)).map((e) => e.sourceEventId))
      .toEqual([single.sourceEventId, single.sourceEventId]);
  });

  it("keeps all-day IDs date-only alongside different timed starts sharing the same URL", async () => {
    const shows = ["2026-11-05", "2026-11-05T19:00:00", "2026-11-05T21:00:00"].map((startDate) =>
      event({ url: "https://example.test/show", startDate }));
    expect((await parseJsonLd(script(shows), opts)).map((e) => e.sourceEventId)).toEqual([
      "https://example.test/show@2026-11-05",
      "https://example.test/show@2026-11-05T19:00:00",
      "https://example.test/show@2026-11-05T21:00:00",
    ]);
  });

  it("distinguishes URL-less stages at the same time by a stable short title hash", async () => {
    const a = event({ name: "Stage A", startDate: "2026-11-05T19:00:00" });
    const b = event({ name: "Stage B", startDate: "2026-11-05T19:00:00" });
    const events = await parseJsonLd(script([a, b, a]), opts);
    expect(events).toHaveLength(3);
    for (const e of events) expect(e.sourceEventId).toMatch(/^https:\/\/example\.test\/page@2026-11-05~[0-9a-f]{8}$/);
    expect(events[0].sourceEventId).not.toBe(events[1].sourceEventId);
    expect(events[2].sourceEventId).toBe(events[0].sourceEventId);
    expect((await parseJsonLd(script([b, a]), opts)).map((e) => e.sourceEventId))
      .toEqual([events[1].sourceEventId, events[0].sourceEventId]);
    expect((await parseJsonLd(script(b), opts))[0].sourceEventId).toBe(events[1].sourceEventId);
  });

  it("hashes explicitly supplied page URLs too, ignoring tracking queries and entity spelling", async () => {
    const [implicit] = await parse({ name: "Stage & A" });
    const [explicit] = await parse({ name: "Stage &amp; A", url: "/page?other=2" });
    expect(explicit.sourceEventId).toBe(implicit.sourceEventId);
    const [differentTitle] = await parse({ name: "Stage B", url: opts.pageUrl });
    expect(differentTitle.sourceEventId).not.toBe(explicit.sourceEventId);
  });

  it.each(["Online", "OnlineEventAttendanceMode", "https://schema.org/OnlineEventAttendanceMode"])("clears stale physical locations for %s attendance", async (eventAttendanceMode) => {
    const oldPlace = { "@type": "Place", name: "Old hall", address: { addressLocality: "Burnaby" } };
    for (const location of [oldPlace, [oldPlace, { "@type": "VirtualLocation" }]]) {
      expect((await parse({ eventAttendanceMode, location }))[0]).toMatchObject({ online: true, place: null });
    }
  });

  it.each(["Mixed", "MixedEventAttendanceMode", "schema:MixedEventAttendanceMode"])("retains the physical place for %s attendance without needing VirtualLocation", async (eventAttendanceMode) => {
    expect((await parse({ eventAttendanceMode, location: { "@type": "Place", name: "Hall" } }))[0])
      .toMatchObject({ online: true, place: { name: "Hall" } });
  });

  it.each(["Online", "Zoom", "Virtual event", "webinar", "Join our ONLINE workshop"])("recognizes textual online location %s without inventing a place", async (location) => {
    expect((await parse({ location }))[0]).toMatchObject({ online: true, place: null });
  });

  it.each(["TBA", "See description", "Some hall"])("leaves non-address location text %s without a place", async (location) => {
    expect((await parse({ location }))[0]).toMatchObject({ online: false, place: null });
  });

  it("still parses text locations with a street number or comma", async () => {
    expect((await parse({ location: "123 Main St" }))[0].place?.address).toBe("123 Main St");
    expect((await parse({ location: "Hall, Vancouver, BC" }))[0].place)
      .toMatchObject({ name: "Hall", city: "Vancouver" });
  });

  it.each([
    { "@type": "Place" }, { "@id": "https://example.test/hall" },
    { "@type": "Place", name: " " }, { "@type": "Place", name: "&nbsp;" },
  ])("skips empty or unnamed Place %j instead of hiding a later named venue", async (emptyPlace) => {
    expect((await parse({ location: emptyPlace }))[0].place).toBeNull();
    expect((await parse({ location: [emptyPlace, { "@type": "VirtualLocation" }, { "@type": "Place", name: "Real hall" }] }))[0])
      .toMatchObject({ online: true, place: { name: "Real hall" } });
  });
});

describe("warm parsing budget", () => {
  for (const [name, html, count, budget] of [
    ["commodore-home.html", commodore, 25, 5],
    ["eventbrite-vancouver-listing.html (largest fixture)", listing, 32, 5],
    ["synthetic page (25 x 30,000-byte descriptions)", longPage, 25, null],
  ] as const) it(`measures ${name} over 100 warm parses`, async ({ annotate }) => {
    // workerd's performance.now() is request-frozen; the Node compatibility monotonic clock
    // measures real elapsed time, including the asynchronous HTMLRewriter transform.
    for (let i = 0; i < 20; i++) await parseJsonLd(html, opts);
    const start = hrtime.bigint();
    let total = 0;
    for (let i = 0; i < 100; i++) total += (await parseJsonLd(html, opts)).length;
    const ms = Number(hrtime.bigint() - start) / 1e6 / 100;
    await annotate(`JSON-LD warm: ${name}; ${new TextEncoder().encode(html).length} bytes; 20 warmups; 100 parses; ${ms.toFixed(3)} ms/parse`, "benchmark");
    expect(total).toBe(count * 100);
    expect(ms).toBeGreaterThan(0);
    // The card's 5 ms budget applies to its saved fixtures; the synthetic stress page is measured.
    if (budget !== null) expect(ms).toBeLessThan(budget);
  });
});
