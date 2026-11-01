// A whole morning run inside the Workers runtime (local D1 and KV), the sources answering with
// what they said on 2026-10-31 (tests/fixtures). No network.
import { env } from "cloudflare:workers";
import luma from "./fixtures/luma/vancouver-2026-10-31.ics?raw";
import vpl from "./fixtures/bibliocommons/vpl-2026-10-31-p1.json?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_KEY, publish } from "../src/publish";
import { fetchStep, runDay, type StepRunner } from "../src/run";
import worker from "../src/worker";
import type { Published } from "../src/types";

const steps: StepRunner = { fetchSource: (a) => fetchStep(env, a), publish: (a) => publish(env, a.runId) };

/** The sources, as they answered that day: Luma's feed, the library's first page then nothing. */
function sources(opts: { lumaDown?: boolean } = {}) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.includes("lu.ma")) return opts.lumaDown ? new Response("busy", { status: 503 }) : new Response(luma, { headers: { "content-type": "text/calendar", etag: '"luma-1"' } });
    if (url.includes("bibliocommons") && url.includes("page=1")) return new Response(vpl, { headers: { "content-type": "application/json" } });
    if (url.includes("bibliocommons")) {
      const empty = JSON.parse(vpl);
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

beforeEach(async () => {
  // (each test starts from an empty database and cache)
  await env.CACHE.delete(LIVE_KEY);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  for (const t of ["events", "venues", "sources", "fetch_log", "review_queue"]) await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await env.DB.prepare("DELETE FROM schema_migrations").run();
});
afterEach(() => vi.restoreAllMocks());

describe("a morning run", () => {
  it("fetches every source part by part, keeps the raw answers, stores and publishes the next 14 days", async () => {
    const calls = sources();
    const { steps: n } = await runDay(steps, "2026-10-31");
    expect(n).toBe(4); // Luma, two library pages, Ticketmaster (skipped: no key)
    expect(calls.some((u) => u.includes("ticketmaster"))).toBe(false);
    const log = (await env.DB.prepare("SELECT source, part, http_status, found, in_window, added, error FROM fetch_log WHERE run_id = '2026-10-31' ORDER BY id").all()).results;
    expect(log).toMatchObject([
      { source: "luma-vancouver", part: 0, http_status: 200, found: 15, error: null },
      { source: "vpl", part: 0, http_status: 200, found: 40, in_window: 40, added: 40, error: null },
      { source: "vpl", part: 1, http_status: 200, found: 0, error: null },
      { source: "ticketmaster", error: "skipped: TICKETMASTER_KEY is not set" },
      { source: "publish", error: null },
    ]);
    // Luma's events in the window, 31 October to 13 November
    expect((log[0] as { in_window: number }).in_window).toBe(5);
    expect(await env.CACHE.get("raw:2026-10-31:luma-vancouver:0")).toContain("BEGIN:VCALENDAR");
    const pub = (await env.CACHE.get<Published>(LIVE_KEY, "json"))!;
    expect(pub.count).toBe(45);
    expect(pub.from).toBe("2026-10-31");
    expect(pub.to).toBe("2026-11-13");
    const bios = pub.events.find((e) => e.title.startsWith("BIOS SPHERE"))!;
    expect(bios).toMatchObject({ venue: "Science World", area: "vancouver", areaCheck: false, sourceName: "Luma", url: "https://luma.com/biossphere" });
  });

  it("run again: nothing new, nothing changed; Luma says not modified", async () => {
    sources();
    await runDay(steps, "2026-10-31");
    sources();
    await runDay(steps, "2026-11-01");
    const log = (await env.DB.prepare("SELECT source, part, added, updated FROM fetch_log WHERE run_id = '2026-11-01' AND source = 'vpl' AND part = 0").first())!;
    expect(log).toMatchObject({ added: 0, updated: 0 });
  });

  it("a source that fails keeps yesterday's events; under half of yesterday's isn't published", async () => {
    sources();
    await runDay(steps, "2026-10-31");
    sources({ lumaDown: true });
    await runDay(steps, "2026-11-01");
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
    await runDay(steps, "2026-10-31");
    const all = await api("/go/api/events");
    expect(all.status).toBe(200);
    const kids = await api("/go/api/events?tag=kids&cat=family");
    expect((kids.body.events as { tags: string[] }[]).every((e) => e.tags.includes("kids"))).toBe(true);
    const burnaby = await api("/go/api/events?area=burnaby");
    expect(burnaby.body.count).toBe(0); // (Patch the System is on the 21st: past the window)
    const day = await api("/go/api/events?from=2026-11-02&to=2026-11-02");
    expect((day.body.events as { start: string }[]).every((e) => e.start.startsWith("2026-11-02"))).toBe(true);
    const status = await api("/go/api/status");
    expect(status.body.run).toBe("2026-10-31");
    expect((status.body.steps as unknown[]).length).toBe(5);
  });
  it("is honest before the first run", async () => {
    expect((await api("/go/api/events")).status).toBe(503);
  });
});
