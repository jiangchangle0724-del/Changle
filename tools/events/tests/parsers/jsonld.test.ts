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
        expect(e.sourceEventId).toBe(e.url.split("?")[0]);
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
      expect((await parse({ offers: [{ availability: "InStock" }, offer] }))[0].status).toBe("soldout");
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

  it("marks VirtualLocation or online attendance as online with no physical place", async () => {
    expect((await parse({ location: { "@type": ["Thing", "VirtualLocation"] } }))[0]).toMatchObject({ online: true, place: null });
    expect((await parse({ eventAttendanceMode: "OnlineEventAttendanceMode", location: { "@type": "Place", name: "Old hall" } }))[0])
      .toMatchObject({ online: true, place: null, tags: [] });
    expect((await parse())[0]).toMatchObject({ place: null, online: false });
  });

  it("uses the event URL or page fallback and removes just the query from the ID", async () => {
    expect((await parse())[0]).toMatchObject({ url: opts.pageUrl, sourceEventId: "https://example.test/page" });
    expect((await parse({ url: "https://example.test/event?utm_source=list#details" }))[0])
      .toMatchObject({ url: "https://example.test/event?utm_source=list#details", sourceEventId: "https://example.test/event#details" });
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

describe("warm parsing budget", () => {
  for (const [name, html, count] of [
    ["commodore-home.html", commodore, 25],
    ["eventbrite-vancouver-listing.html (largest fixture)", listing, 32],
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
    expect(ms).toBeLessThan(5);
  });
});
