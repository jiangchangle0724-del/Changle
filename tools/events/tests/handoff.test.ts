// The libraries' hand-over (src/handoff.ts): the Worker's endpoint, and the GitHub job's side, which
// must ask the libraries exactly what the run's steps ask. In the Workers runtime (local KV and D1),
// the libraries answering with their saved pages. No network.
import { env } from "cloudflare:workers";
import vpl from "./fixtures/bibliocommons/vpl-2026-10-31-p1.json?raw";
import rpl from "./fixtures/bibliocommons/rpl-2026-11-01-p1.json?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPages, handOver, HANDOFF_MAX_BYTES, HANDOFF_SOURCES, handoffKey, takeHandoff, type Get, type Page } from "../src/handoff";
import { fetchStep } from "../src/run";
import { vanParts } from "../src/time";
import worker from "../src/worker";

/** A stand-in for the Worker's secret, in these tests only. */
const KEY = "test-only-stand-in-key";
const keyed: Env = { ...env, EVENTS_HANDOFF_KEY: KEY };
const ENDPOINT = "https://changle.ca/go/api/handoff";
const today = () => vanParts(Date.now()).date;
const call = (req: Request, e: Env = keyed) => worker.fetch(req as Request<unknown, IncomingRequestCfProperties>, e);
const post = (query: string, body: BodyInit, headers: Record<string, string> = { authorization: `Bearer ${KEY}` }, e: Env = keyed) =>
  call(new Request(`${ENDPOINT}?${query}`, { method: "POST", headers, body }), e);

/**
 * The libraries as they answered: the first page, then one with no events; anything else 404.
 * `endless`: every page is the first, so the listing never runs out (paging stops at the cap).
 */
function library(url: string, endless = false): Response {
  const page = url.includes("/libraries/vpl/") ? vpl : url.includes("/libraries/yourlibrary/") ? rpl : null;
  if (!page) return new Response("not found", { status: 404 });
  if (endless || url.endsWith("page=1")) return new Response(page, { headers: { "content-type": "application/json" } });
  const empty = JSON.parse(page);
  empty.events.results = [];
  return Response.json(empty);
}

/** What a request asks: its URL, method, headers and redirects. */
const asked = (url: string, init?: RequestInit) => ({
  url,
  method: init?.method ?? "GET",
  headers: Object.fromEntries(new Headers(init?.headers).entries()),
  redirect: init?.redirect,
});

beforeEach(async () => {
  for (const { name } of (await env.CACHE.list({ prefix: "handoff:" })).keys) await env.CACHE.delete(name);
});
afterEach(() => vi.restoreAllMocks());

describe("POST /go/api/handoff", () => {
  it("keeps a library's page for today's run; handing it over again replaces it", async () => {
    const d = today();
    const res = await post(`source=vpl&date=${d}&part=0`, vpl);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, source: "vpl", date: d, part: 0, bytes: vpl.length });
    const kept = await takeHandoff(env.CACHE, d, "vpl", 0);
    expect(kept?.raw).toBe(vpl);
    expect(kept?.at).toMatch(new RegExp(`^${d}T\\d{2}:\\d{2}:\\d{2}-0[78]:00$`));
    // kept two days, then gone by itself
    const [listed] = (await env.CACHE.list({ prefix: handoffKey(d, "vpl", 0) })).keys;
    expect(listed.expiration! - Date.now() / 1000).toBeGreaterThan(2 * 86_400 - 120);
    expect(listed.expiration! - Date.now() / 1000).toBeLessThanOrEqual(2 * 86_400 + 1);
    // the job run again the same day: its page replaces the first
    expect((await post(`source=vpl&date=${d}&part=0`, rpl)).status).toBe(200);
    expect((await takeHandoff(env.CACHE, d, "vpl", 0))?.raw).toBe(rpl);
    // another page and the other library, each under its own key
    expect((await post(`source=rpl&date=${d}&part=3`, rpl)).status).toBe(200);
    expect((await env.CACHE.list({ prefix: `handoff:${d}:` })).keys.map((k) => k.name).sort()).toEqual([handoffKey(d, "rpl", 3), handoffKey(d, "vpl", 0)]);
  });

  it("401 without the key or with a wrong one, and keeps nothing", async () => {
    const d = today();
    const tries: [Record<string, string>, string][] = [
      [{}, "no key"],
      [{ authorization: KEY }, "no key"], // not "Bearer <key>"
      [{ authorization: `Bearer ${KEY}-not` }, "wrong key"],
      [{ authorization: `Bearer ${KEY.slice(0, -1)}` }, "wrong key"],
      [{ authorization: "Bearer " }, "no key"],
    ];
    for (const [headers, error] of tries) {
      const res = await post(`source=rpl&date=${d}&part=0`, rpl, headers);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      expect(await res.json()).toEqual({ error });
    }
    expect(await takeHandoff(env.CACHE, d, "rpl", 0)).toBeNull();
  });

  it("503 while the Worker has no key of its own: nothing can be handed over", async () => {
    const res = await post(`source=vpl&date=${today()}&part=0`, vpl, { authorization: `Bearer ${KEY}` }, env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "EVENTS_HANDOFF_KEY is not set on the Worker" });
  });

  it("413 above the size limit, whether the body says its length or not", async () => {
    const d = today();
    const declared = await post(`source=vpl&date=${d}&part=0`, "{}", { authorization: `Bearer ${KEY}`, "content-length": String(HANDOFF_MAX_BYTES + 1) });
    expect(declared.status).toBe(413);
    const big = new TextEncoder().encode(`{"events":{},"entities":{},"padding":"${"x".repeat(HANDOFF_MAX_BYTES)}"}`);
    const streamed = new ReadableStream({
      start(c) {
        for (let at = 0; at < big.length; at += 65_536) c.enqueue(big.slice(at, at + 65_536));
        c.close();
      },
    });
    const res = await post(`source=vpl&date=${d}&part=0`, streamed);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: `body: over ${HANDOFF_MAX_BYTES} bytes` });
    expect(await takeHandoff(env.CACHE, d, "vpl", 0)).toBeNull();
  });

  it("400 for a body that isn't a library's events page, or a source, date or part that doesn't fit", async () => {
    const d = today();
    const bad: [query: string, body: string, error: string][] = [
      [`source=vpl&date=${d}&part=0`, "<html>Access denied</html>", "body: not JSON"],
      [`source=vpl&date=${d}&part=0`, "", "body: not JSON"],
      [`source=vpl&date=${d}&part=0`, JSON.stringify({ hello: "world" }), "body: not a BiblioCommons events page"],
      [`source=vpl&date=${d}&part=0`, JSON.stringify([vpl]), "body: not a BiblioCommons events page"],
      [`source=vpl&date=${d}&part=0`, JSON.stringify({ events: { results: ["1"] }, entities: {} }), "body: not a BiblioCommons events page"],
      [`source=vpl&date=${d}&part=0`, JSON.stringify({ events: { results: [1] }, entities: { events: {} } }), "body: not a BiblioCommons events page"],
      [`source=vpl&date=${d}&part=0`, JSON.stringify({ events: { pagination: { page: "1" } }, entities: {} }), "body: not a BiblioCommons events page"],
      [`source=luma-vancouver&date=${d}&part=0`, vpl, "source: one of vpl, rpl"],
      [`source=constructor&date=${d}&part=0`, vpl, "source: one of vpl, rpl"],
      [`date=${d}&part=0`, vpl, "source: one of vpl, rpl"],
      [`source=vpl&date=2026-10-31&part=0`, vpl, `date: today in Vancouver, ${d}`],
      [`source=vpl&part=0`, vpl, `date: today in Vancouver, ${d}`],
      [`source=vpl&date=${d}&part=24`, vpl, "part: 0 to 23"],
      [`source=vpl&date=${d}&part=-1`, vpl, "part: 0 to 23"],
      [`source=vpl&date=${d}&part=1.5`, vpl, "part: 0 to 23"],
      [`source=vpl&date=${d}`, vpl, "part: 0 to 23"],
    ];
    for (const [query, body, error] of bad) {
      const res = await post(query, body);
      expect(res.status, query).toBe(400);
      expect(await res.json(), query).toEqual({ error });
    }
    expect((await env.CACHE.list({ prefix: "handoff:" })).keys).toEqual([]);
  });

  it("answers POST only, with the key; the rest of the API is unchanged", async () => {
    const get = await call(new Request(ENDPOINT));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect((await call(new Request("https://changle.ca/go/api/status", { method: "POST", body: "{}" }))).status).toBe(405);
    expect((await call(new Request("https://changle.ca/go/api/handoff/vpl"))).status).toBe(404);
  });
});

describe("the GitHub job (scripts/libraries.ts)", () => {
  /** What the run's steps ask the libraries for a day's run, with nothing handed over. */
  async function runAsks(runId: string, endless: boolean, sources = HANDOFF_SOURCES) {
    const asks: ReturnType<typeof asked>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      asks.push(asked(url, init));
      return library(url, endless);
    });
    for (const src of sources) {
      for (let part: number | null = 0; part !== null; ) part = (await fetchStep(env, { runId, source: src.id, part })).next;
    }
    vi.restoreAllMocks();
    const logged = (await env.DB.prepare("SELECT found, in_window FROM fetch_log WHERE run_id = ?1 AND source IN ('vpl', 'rpl') ORDER BY id").bind(runId).all()).results;
    return { asks, logged };
  }
  /** What the job asks them for the same day's run, and what it counts. */
  async function jobAsks(runId: string, endless: boolean, sources = HANDOFF_SOURCES) {
    const asks: ReturnType<typeof asked>[] = [];
    const get: Get = async (url, init) => {
      asks.push(asked(url, init));
      return library(url, endless);
    };
    const pages: Page[] = [];
    for (const src of sources) {
      const read = await fetchPages(src, runId, get, async () => {});
      expect(read.error).toBeNull();
      pages.push(...read.pages);
    }
    return { asks, counted: pages.map((p) => ({ found: p.found, in_window: p.inWindow })) };
  }

  it("asks the libraries exactly what the run's steps ask, page for page", async () => {
    const run = await runAsks("2026-10-31", false);
    const job = await jobAsks("2026-10-31", false);
    // each library's first page, and the one after it (no events: the end)
    expect(job.asks.map((r) => r.url)).toEqual([
      "https://gateway.bibliocommons.com/v2/libraries/vpl/events/search?limit=25&page=1",
      "https://gateway.bibliocommons.com/v2/libraries/vpl/events/search?limit=25&page=2",
      "https://gateway.bibliocommons.com/v2/libraries/yourlibrary/events/search?limit=25&page=1",
      "https://gateway.bibliocommons.com/v2/libraries/yourlibrary/events/search?limit=25&page=2",
    ]);
    expect(job.asks).toEqual(run.asks);
    expect(job.asks[0]).toEqual({
      url: "https://gateway.bibliocommons.com/v2/libraries/vpl/events/search?limit=25&page=1",
      method: "GET",
      headers: { "user-agent": "changle.ca events (+https://changle.ca/go)", accept: "application/json, text/calendar, text/html;q=0.8, */*;q=0.5" },
      redirect: "follow",
    });
    // and it counts what the run's log counts for the same pages
    expect(job.counted).toEqual(run.logged);
  });

  it("stops where the run stops when a listing never runs out: at the source's last part", { timeout: 30_000 }, async () => {
    const vancouver = HANDOFF_SOURCES.filter((s) => s.id === "vpl");
    const run = await runAsks("2026-11-01", true, vancouver);
    const job = await jobAsks("2026-11-01", true, vancouver);
    expect(job.asks).toHaveLength(24);
    expect(job.asks.at(-1)?.url).toBe("https://gateway.bibliocommons.com/v2/libraries/vpl/events/search?limit=25&page=24");
    expect(job.asks).toEqual(run.asks);
    expect(job.counted).toEqual(run.logged);
  });

  it("hands each page to the Worker, which keeps it for the run; a refusal fails loudly", async () => {
    const d = today();
    const toWorker: Get = (url, init) => call(new Request(url, init));
    for (const src of HANDOFF_SOURCES) {
      const { pages } = await fetchPages(src, d, async (url) => library(url), async () => {});
      for (const p of pages) await handOver(toWorker, ENDPOINT, KEY, src.id, d, p);
    }
    expect((await takeHandoff(env.CACHE, d, "vpl", 0))?.raw).toBe(vpl);
    expect((await takeHandoff(env.CACHE, d, "rpl", 0))?.raw).toBe(rpl);
    const page = { part: 0, raw: vpl, found: 40, inWindow: 40 };
    await expect(handOver(toWorker, ENDPOINT, "not-the-key", "vpl", d, page)).rejects.toThrow('vpl part 0: the Worker said 401 {"error":"wrong key"}');
  });

  it("a library that refuses the job too: asked once, it fails, naming the page and the answer", async () => {
    let asks = 0;
    const refuses: Get = async () => (asks++, new Response("Forbidden", { status: 403 }));
    expect(await fetchPages(HANDOFF_SOURCES[0], "2026-10-31", refuses, async () => {})).toEqual({ pages: [], error: "vpl part 0: HTTP 403 from gateway.bibliocommons.com" });
    expect(asks).toBe(1);
  });

  it("asks again, 5 and 10 seconds later, for a page that fails for now (500, 429, no answer)", async () => {
    const waits: number[] = [];
    const pause = async (ms: number) => void waits.push(ms);
    // a 500, then the page
    const flaky: string[] = [];
    const once: Get = async (url) => (flaky.push(url), flaky.length === 1 ? new Response("oops", { status: 500 }) : library(url));
    const read = await fetchPages(HANDOFF_SOURCES[0], "2026-10-31", once, pause);
    expect(read.error).toBeNull();
    expect(read.pages.map((p) => p.part)).toEqual([0, 1]);
    expect(flaky.slice(0, 2)).toEqual([flaky[0], flaky[0]]);
    expect(waits).toEqual([1000, 5000, 1000]);
    // busy, no answer, busy: three tries, then it gives up on that page
    let n = 0;
    const down: Get = async () => {
      n++;
      if (n === 2) throw new Error("socket hang up");
      return new Response("slow down", { status: 429 });
    };
    expect(await fetchPages(HANDOFF_SOURCES[0], "2026-10-31", down, async () => {})).toEqual({ pages: [], error: "vpl part 0: HTTP 429 from gateway.bibliocommons.com (3 tries)" });
    expect(n).toBe(3);
  });

  it("a library that fails part-way: the pages before it are kept to hand over, and the failure is named", async () => {
    let n = 0;
    const get: Get = async (url) => (++n === 1 ? library(url, true) : new Response("oops", { status: 503 }));
    const { pages, error } = await fetchPages(HANDOFF_SOURCES[0], "2026-10-31", get, async () => {});
    expect(pages.map((p) => p.part)).toEqual([0]);
    expect(pages[0].raw).toBe(vpl);
    expect(error).toBe("vpl part 1: HTTP 503 from gateway.bibliocommons.com (3 tries)");
  });
});
