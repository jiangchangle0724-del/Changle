import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pageRaw from "./fixtures/eventbrite/organization-events.json?raw";
import { EVENTBRITE_SEEDS, followEvent, followedOrganizations } from "../src/follows";
import { isEbPage, parseEventbrite, type EbPage } from "../src/parsers/eventbrite";
import { fetchStep } from "../src/run";
import { ensureSchema } from "../src/schema";
import { eventbriteOpen, SOURCE_BY_ID } from "../src/sources";

// An organization's public events as Eventbrite's API answers them (v3, its documented fields, with
// expand=venue,ticket_availability,organizer): written by hand, since the token is Steve's
const page = JSON.parse(pageRaw) as EbPage;
const RUN = "2026-11-26";
const withToken = { ...env, EVENTBRITE_TOKEN: "test-token" } as Env;

async function reset() {
  for (const t of ["events", "venues", "sources", "fetch_log", "review_queue", "runs", "submissions", "eventbrite_follows"]) await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  await env.DB.prepare("DELETE FROM schema_migrations").run();
  await ensureSchema(env.DB);
}
beforeEach(reset);
afterEach(() => vi.restoreAllMocks());

/** Eventbrite's API as the tests have it: each event's organization, and each organization's events. */
function eventbrite(orgOf: Record<string, string | 404>) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url.pathname);
    const event = /^\/v3\/events\/(\d+)\/$/.exec(url.pathname)?.[1];
    if (event) {
      const org = orgOf[event];
      if (!org || org === 404) return new Response('{"status_code":404,"error":"NOT_FOUND"}', { status: 404 });
      return Response.json({ id: event, organization_id: org, organizer: { name: `Org ${org}` } });
    }
    if (/^\/v3\/organizations\/\d+\/events\/$/.test(url.pathname)) return new Response(pageRaw, { headers: { "content-type": "application/json" } });
    return new Response("not found", { status: 404 });
  });
  return calls;
}

describe("Eventbrite: an organization's events", () => {
  it("reads each public, listed event with a date: times in Vancouver, the venue, prices in dollars", () => {
    expect(isEbPage(page)).toBe(true);
    const events = parseEventbrite(page, "eventbrite");
    // not the unlisted rehearsal, not the series itself (its dates are events of their own)
    expect(events.map((e) => e.title)).toEqual(["Chad VanGaalen", "Promoting Your Band Online", "Free Open Mic", "Cancelled Night", "Nearly Neil at the Squamish Legion", "Sold Out Show"]);
    expect(events[0]).toMatchObject({
      sourceEventId: "1993949843658",
      url: "https://www.eventbrite.ca/e/chad-vangaalen-tickets-1993949843658",
      start: "2026-11-28T20:30:00-07:00",
      end: "2026-11-29T00:00:00-07:00",
      description: "Calgary indie rocker Chad VanGaalen plays the Rickshaw.",
      place: { name: "Rickshaw Theatre", address: "254 E. Hastings Street", city: "Vancouver", postalCode: "V6A 1P1", lat: 49.2812, lon: -123.0977 },
      priceMin: 29.54,
      priceMax: 35.69,
      isFree: false,
      tags: ["tickets"],
      category: "shows",
      organizer: "Rickshaw Theatre",
      status: "scheduled",
    });
    expect(events[0].imageUrl).toMatch(/^https:\/\/img\.evbuc\.com\/.*original\.jpg$/);
    expect(events.find((e) => e.title === "Free Open Mic")).toMatchObject({ priceMin: 0, priceMax: 0, isFree: true, tags: ["free"] });
    expect(events.find((e) => e.title === "Cancelled Night")?.status).toBe("cancelled");
    expect(events.find((e) => e.title === "Sold Out Show")?.status).toBe("soldout");
  });

  it("keeps what's at a real place in Greater Vancouver: not online, not Squamish", () => {
    expect(eventbriteOpen(parseEventbrite(page, "eventbrite")).map((e) => e.title)).toEqual(["Chad VanGaalen", "Free Open Mic", "Cancelled Night", "Sold Out Show"]);
  });

  it("asks for an organization's live events, the soonest first, with the token (never logged)", () => {
    const src = SOURCE_BY_ID.eventbrite;
    expect(src.request(0, { EVENTBRITE_TOKEN: "abc" }, { runId: RUN, fromMs: 0, toMs: 0 }, "2685490551")).toBe(
      "https://www.eventbriteapi.com/v3/organizations/2685490551/events/?status=live&order_by=start_asc&time_filter=current_future&page_size=50&expand=venue,ticket_availability,organizer&token=abc",
    );
    expect(() => src.parse('{"status_code":401,"error":"INVALID_AUTH"}', 0, { runId: RUN, fromMs: 0, toMs: 0 })).toThrow("not an Eventbrite events page");
  });
});

describe("the organizations followed (src/follows.ts)", () => {
  it("learns each seed's organization once; one Eventbrite doesn't know is set aside", async () => {
    eventbrite({ [EVENTBRITE_SEEDS[0].event]: "111", [EVENTBRITE_SEEDS[1].event]: 404 });
    expect(await followedOrganizations(withToken, true)).toEqual(["111"]);
    const rows = (await env.DB.prepare("SELECT event_id, organization_id, name, error FROM eventbrite_follows ORDER BY event_id").all()).results;
    expect(rows).toEqual(
      expect.arrayContaining([
        { event_id: EVENTBRITE_SEEDS[0].event, organization_id: "111", name: "Org 111", error: null },
        { event_id: EVENTBRITE_SEEDS[1].event, organization_id: null, name: null, error: "not found" },
      ]),
    );
    // asked again: nothing new to learn
    const calls = eventbrite({});
    expect(await followedOrganizations(withToken, true)).toEqual(["111"]);
    expect(calls).toEqual([]);
  });

  it("an event let in from a submission adds its organization; two events of one organization, one list", async () => {
    await followEvent(env.DB, "2000000000001", "submission");
    await followEvent(env.DB, "2000000000002", "submission");
    await followEvent(env.DB, "not-an-id", "submission");
    eventbrite({ [EVENTBRITE_SEEDS[0].event]: "111", "2000000000001": "222", "2000000000002": "222" });
    // (oldest first: the submissions came before the seeds were put in)
    expect(await followedOrganizations(withToken, true)).toEqual(["222", "111"]);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM eventbrite_follows").first<{ n: number }>())?.n).toBe(4);
  });
});

describe("the morning's Eventbrite steps", () => {
  it("one organization a part: learns first, reads each list, keeps what's in Greater Vancouver", async () => {
    await followEvent(env.DB, "2000000000001", "submission");
    const calls = eventbrite({ [EVENTBRITE_SEEDS[0].event]: "111", "2000000000001": "222" });
    const first = await fetchStep(withToken, { runId: RUN, source: "eventbrite", part: 0 });
    expect(first.next).toBe(1);
    expect(first.log).toMatchObject({ httpStatus: 200, found: 4, inWindow: 4, added: 4, error: null });
    expect(calls.filter((c) => c.startsWith("/v3/organizations/"))).toEqual(["/v3/organizations/222/events/"]);
    const second = await fetchStep(withToken, { runId: RUN, source: "eventbrite", part: 1 });
    expect(second.next).toBeNull();
    expect(calls.filter((c) => c.startsWith("/v3/organizations/"))).toEqual(["/v3/organizations/222/events/", "/v3/organizations/111/events/"]);
    const src = await env.DB.prepare("SELECT last_ok_run FROM sources WHERE id = 'eventbrite'").first<{ last_ok_run: string }>();
    expect(src?.last_ok_run).toBe(RUN);
  });

  it("nothing followed yet: nothing asked, and the source is done for the day", async () => {
    const calls = eventbrite({});
    const r = await fetchStep(withToken, { runId: RUN, source: "eventbrite", part: 0 });
    expect(r.next).toBeNull();
    expect(r.log).toMatchObject({ found: 0, error: null, note: "nothing followed yet" });
    expect(calls.filter((c) => c.startsWith("/v3/organizations/"))).toEqual([]);
    expect((await env.DB.prepare("SELECT last_ok_run FROM sources WHERE id = 'eventbrite'").first<{ last_ok_run: string }>())?.last_ok_run).toBe(RUN);
  });

  it("without the token: skipped, as Ticketmaster is", async () => {
    const r = await fetchStep(env, { runId: RUN, source: "eventbrite", part: 0 });
    expect(r.log.error).toBe("skipped: EVENTBRITE_TOKEN is not set");
  });
});
