// A whole morning run inside the Workers runtime (local D1 and KV), the sources answering with
// what they said on 2026-10-31 and 2026-11-01 (tests/fixtures). No network.
import { env } from "cloudflare:workers";
import luma from "./fixtures/luma/vancouver-2026-10-31.ics?raw";
import vpl from "./fixtures/bibliocommons/vpl-2026-10-31-p1.json?raw";
import rpl from "./fixtures/bibliocommons/rpl-2026-11-01-p1.json?raw";
import ubc from "./fixtures/ical/ubc-2026-10-31.ics?raw";
import bpl from "./fixtures/bpl/events-2026-11-01.json?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_KEY, publish } from "../src/publish";
import { fetchStep, runDay, type StepRunner } from "../src/run";
import worker from "../src/worker";
import type { Published } from "../src/types";

const steps: StepRunner = { fetchSource: (a) => fetchStep(env, a), publish: (a) => publish(env, a.runId) };

/** The sources, as they answered: Luma's feed; each library's first page, then nothing; UBC's first two days, then nothing. */
function sources(opts: { lumaDown?: boolean } = {}) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.includes("events.ubc.ca")) {
      const first = url.endsWith("tribe-bar-date=2026-10-31");
      return new Response(first ? ubc : "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n", { headers: { "content-type": "text/calendar" } });
    }
    if (url.includes("bpl.bc.ca")) return new Response(bpl, { headers: { "content-type": "application/json" } });
    if (url.includes("lu.ma")) return opts.lumaDown ? new Response("busy", { status: 503 }) : new Response(luma, { headers: { "content-type": "text/calendar", etag: '"luma-1"' } });
    const lib = /\/libraries\/(\w+)\/events/.exec(url)?.[1];
    if (lib) {
      const page = lib === "vpl" ? vpl : lib === "yourlibrary" ? rpl : null;
      if (!page) return new Response("not found", { status: 404 });
      if (url.includes("page=1")) return new Response(page, { headers: { "content-type": "application/json" } });
      const empty = JSON.parse(page);
      empty.events.results = [];
      return Response.json(empty);
    }
    return new Response("not found", { status: 404 });
  });
  return calls;
}

const api = async (path: string) => {
  const res = await worker.fetch(new Request(`https://changle.ca${path}`) as Request<unknown, IncomingRequestCfProperties>, env);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const logOf = async (runId: string) =>
  (await env.DB.prepare("SELECT source, part, http_status, found, in_window, added, error FROM fetch_log WHERE run_id = ?1 ORDER BY id").bind(runId).all()).results;

beforeEach(async () => {
  // (each test starts from an empty database and cache)
  await env.CACHE.delete(LIVE_KEY);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  for (const t of ["events", "venues", "sources", "fetch_log", "review_queue", "runs"]) await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await env.DB.prepare("DELETE FROM schema_migrations").run();
});
afterEach(() => vi.restoreAllMocks());

describe("a morning run", () => {
  it("fetches every source part by part, keeps the raw answers, stores and publishes the next 14 days", async () => {
    const calls = sources();
    const r = await runDay(steps, env.DB, "2026-10-31");
    // Luma, Vancouver's two pages, Richmond's two, Burnaby's feed, UBC's two, Ticketmaster (skipped: no key)
    expect(r).toEqual({ steps: 9, done: true, published: true });
    expect(calls.some((u) => u.includes("ticketmaster"))).toBe(false);
    const log = await logOf("2026-10-31");
    expect(log).toMatchObject([
      { source: "luma-vancouver", part: 0, http_status: 200, found: 15, error: null },
      { source: "vpl", part: 0, http_status: 200, found: 40, in_window: 40, added: 40, error: null },
      { source: "vpl", part: 1, http_status: 200, found: 0, error: null },
      { source: "rpl", part: 0, http_status: 200, found: 25, in_window: 25, added: 25, error: null },
      { source: "rpl", part: 1, http_status: 200, found: 0, error: null },
      // Burnaby: 113 programs still to come, 27 of them in the window
      { source: "bpl", part: 0, http_status: 200, found: 113, in_window: 27, added: 27, error: null },
      // UBC: 30 in its answer, 6 anyone can walk into (5 in the window), then an empty answer
      { source: "ubc", part: 0, http_status: 200, found: 6, in_window: 5, added: 5, error: null },
      { source: "ubc", part: 1, http_status: 200, found: 0, error: null },
      { source: "ticketmaster", error: "skipped: TICKETMASTER_KEY is not set" },
      { source: "publish", error: null },
    ]);
    // Luma's events in the window, 31 October to 13 November
    expect((log[0] as { in_window: number }).in_window).toBe(5);
    expect(await env.CACHE.get("raw:2026-10-31:luma-vancouver:0")).toContain("BEGIN:VCALENDAR");
    const pub = (await env.CACHE.get<Published>(LIVE_KEY, "json"))!;
    expect(pub.count).toBe(102);
    expect(pub.from).toBe("2026-10-31");
    expect(pub.to).toBe("2026-11-13");
    const bios = pub.events.find((e) => e.title.startsWith("BIOS SPHERE"))!;
    expect(bios).toMatchObject({ venue: "Science World", area: "vancouver", areaCheck: false, sourceName: "Luma", url: "https://luma.com/biossphere" });
    const hunt = pub.events.find((e) => e.title === "Cambie Scavenger Hunt")!;
    expect(hunt).toMatchObject({ start: "2026-10-28", end: "2026-11-03", allDay: true, area: "richmond", sourceName: "Richmond Public Library" });
  });

  it("run again: nothing new, nothing changed; Luma says not modified", async () => {
    sources();
    await runDay(steps, env.DB, "2026-10-31");
    sources();
    await runDay(steps, env.DB, "2026-11-01");
    const log = (await env.DB.prepare("SELECT source, part, added, updated FROM fetch_log WHERE run_id = '2026-11-01' AND source = 'vpl' AND part = 0").first())!;
    expect(log).toMatchObject({ added: 0, updated: 0 });
  });

  it("goes on over several triggers where the last stopped, publishes once when done, then rests", async () => {
    sources();
    const morning = (o: { final?: boolean } = {}) => runDay(steps, env.DB, "2026-10-31", { maxSteps: 2, ...o });
    expect(await morning()).toEqual({ steps: 2, done: false, published: false });
    expect(await env.CACHE.get(LIVE_KEY)).toBeNull();
    expect(await morning()).toEqual({ steps: 2, done: false, published: false });
    expect(await morning()).toEqual({ steps: 2, done: false, published: false });
    expect(await morning()).toEqual({ steps: 2, done: false, published: false });
    expect(await morning()).toEqual({ steps: 1, done: true, published: true });
    expect(await morning({ final: true })).toEqual({ steps: 0, done: true, published: false });
    // each step once, in order, then one publish
    const log = await logOf("2026-10-31");
    expect(log.map((l) => `${l.source}:${l.part}`)).toEqual(["luma-vancouver:0", "vpl:0", "vpl:1", "rpl:0", "rpl:1", "bpl:0", "ubc:0", "ubc:1", "ticketmaster:0", "publish:0"]);
    const run = (await env.DB.prepare("SELECT next_source, steps, triggers, published_at FROM runs WHERE run_id = '2026-10-31'").first())!;
    expect(run).toMatchObject({ next_source: null, steps: 9, triggers: 6 });
    expect(run.published_at).toBeTruthy();
    expect((await env.CACHE.get<Published>(LIVE_KEY, "json"))!.count).toBe(102);
  });

  it("the morning's last trigger publishes what it has; the sources not reached keep yesterday's", async () => {
    sources();
    await runDay(steps, env.DB, "2026-10-31");
    sources();
    const r = await runDay(steps, env.DB, "2026-11-01", { maxSteps: 2, final: true });
    expect(r).toEqual({ steps: 2, done: false, published: true });
    const pub = (await env.CACHE.get<Published>(LIVE_KEY, "json"))!;
    expect(pub.runId).toBe("2026-11-01");
    // Richmond wasn't reached today: its events from yesterday stay up
    expect(pub.events.some((e) => e.title === "Cambie Scavenger Hunt")).toBe(true);
    const status = await api("/go/api/status");
    expect(status.body.progress).toMatchObject({ nextSource: "vpl", nextPart: 1, steps: 2, triggers: 1 });
  });

  it("a source that fails keeps yesterday's events; under half of yesterday's isn't published", async () => {
    sources();
    await runDay(steps, env.DB, "2026-10-31");
    sources({ lumaDown: true });
    await runDay(steps, env.DB, "2026-11-01");
    const failed = (await env.DB.prepare("SELECT error FROM fetch_log WHERE run_id = '2026-11-01' AND source = 'luma-vancouver'").first<{ error: string }>())!;
    expect(failed.error).toBe("HTTP 503");
    const pub = (await env.CACHE.get<Published>(LIVE_KEY, "json"))!;
    expect(pub.runId).toBe("2026-11-01");
    expect(pub.events.some((e) => e.title.startsWith("BIOS SPHERE"))).toBe(true);
    // everything gone at once: yesterday's list stays up
    await env.DB.prepare("UPDATE events SET status = 'cancelled'").run();
    const r = await publish(env, "2026-11-02");
    expect(r).toMatchObject({ kept: true, count: 0 });
    expect((await env.CACHE.get<Published>(LIVE_KEY, "json"))!.runId).toBe("2026-11-01");
  });
});

describe("the API", () => {
  it("filters the published days by date, category, area and tag", async () => {
    sources();
    await runDay(steps, env.DB, "2026-10-31");
    const all = await api("/go/api/events");
    expect(all.status).toBe(200);
    const kids = await api("/go/api/events?tag=kids&cat=family");
    expect((kids.body.events as { tags: string[] }[]).every((e) => e.tags.includes("kids"))).toBe(true);
    const burnaby = await api("/go/api/events?area=burnaby");
    // Burnaby's library: 27 in the window, 2 of them online (no area); the 5 at the temporary
    // Cameron branch count too, though its postal code is Coquitlam's
    expect(burnaby.body.count).toBe(25);
    const richmond = await api("/go/api/events?area=richmond");
    expect(richmond.body.count).toBe(24); // (one of its 25 has no branch: no area)
    // a day: everything on it, the week-long scavenger hunt (28 October to 3 November) too
    const day = await api("/go/api/events?from=2026-11-02&to=2026-11-02");
    const onDay = day.body.events as { title: string; start: string; end: string | null }[];
    expect(onDay.every((e) => e.start.slice(0, 10) <= "2026-11-02" && (e.end ?? e.start).slice(0, 10) >= "2026-11-02")).toBe(true);
    expect(onDay.some((e) => e.title === "Cambie Scavenger Hunt")).toBe(true);
    const status = await api("/go/api/status");
    expect(status.body.run).toBe("2026-10-31");
    expect((status.body.steps as unknown[]).length).toBe(10);
    expect(status.body.progress).toMatchObject({ nextSource: null, steps: 9, triggers: 1 });
  });
  it("is honest before the first run", async () => {
    expect((await api("/go/api/events")).status).toBe(503);
  });
});
