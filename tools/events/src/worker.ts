// 玩什么 · What's On at changle.ca/go. Every morning at 06:00 Vancouver time the scheduled run
// gathers the next 14 days (src/run.ts) and publishes them to KV (src/publish.ts); the API reads
// that one file, so it answers at once. The page itself comes after gate A (docs/whats-on-v2.md).
//   GET /go/api/events   the events, filtered: from, to (YYYY-MM-DD), cat, area, tag (comma lists)
//   GET /go/api/events.ics  the same, as a calendar to subscribe to (task C6)
//   GET /go/api/status   the last run, step by step (the fetch log), and what's published
//   GET /go/preview      what's published, day by day: unlisted and not indexed, to check the run
//   POST /go/api/handoff the libraries' pages, from the GitHub job (signed in by GitHub; src/handoff.ts): kept for
//                        the run, or read at once when the run has gone past the library (src/arrival.ts)
import { WorkerEntrypoint } from "cloudflare:workers";
import { useArrival } from "./arrival";
import { receiveHandoff } from "./handoff";
import { toIcs } from "./ics";
import { renderPreview } from "./preview";
import { LIVE_KEY, publish } from "./publish";
import { filterEvents, readQuery } from "./query";
import { fetchStep, runDay, type StepArgs, type StepRunner } from "./run";
import { ensureSchema } from "./schema";
import { vanParts } from "./time";
import type { Published } from "./types";

/** The run's steps, each called through the loopback binding as a request of its own. */
export class Steps extends WorkerEntrypoint<Env> {
  fetchSource(args: StepArgs) {
    return fetchStep(this.env, args);
  }
  publish(args: { runId: string; note?: string }) {
    return publish(this.env, args.runId, args.note ?? null);
  }
}

/** The steps, each a request of its own (the loopback binding); called directly where there's none (tests). */
const stepsOf = (env: Env, ctx?: ExecutionContext): StepRunner =>
  (ctx?.exports?.Steps as StepRunner | undefined) ?? { fetchSource: (a) => fetchStep(env, a), publish: (a) => publish(env, a.runId, a.note ?? null) };

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "access-control-allow-origin": "*" } });

const published = (env: Env) => env.CACHE.get<Published>(LIVE_KEY, { type: "json", cacheTtl: 60 });

async function listEvents(url: URL, env: Env, ics = false): Promise<Response> {
  const pub = await published(env);
  if (!pub) return json({ error: "not ready" }, 503);
  const q = readQuery(url.searchParams, pub);
  const { from, to } = q;
  const events = filterEvents(pub.events, q);
  if (ics) {
    const name = ["玩什么 · What's On", ...q.cats, ...q.areas, ...q.tags].join(" · ");
    const text = toIcs(events, { name, now: new Date() });
    if (text === null) return json({ error: "not built yet" }, 501);
    return new Response(text, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=1800", "access-control-allow-origin": "*" } });
  }
  return json({ runId: pub.runId, generatedAt: pub.generatedAt, from, to, count: events.length, events }, 200, "public, max-age=300, stale-while-revalidate=3600");
}

async function status(env: Env): Promise<Response> {
  await ensureSchema(env.DB);
  const last = await env.DB.prepare("SELECT max(run_id) AS run FROM fetch_log").first<{ run: string | null }>();
  // how far the run has got: the step it goes on with (null once every source is done), the triggers so far
  const progress = last?.run
    ? await env.DB.prepare("SELECT next_source AS nextSource, next_part AS nextPart, steps, triggers, started_at AS startedAt, published_at AS publishedAt FROM runs WHERE run_id = ?1").bind(last.run).first()
    : null;
  const steps = last?.run
    ? (
        await env.DB.prepare(
          "SELECT source, part, via, started_at, ms, http_status, not_modified, bytes, found, in_window, added, updated, error, note FROM fetch_log WHERE run_id = ?1 ORDER BY id",
        )
          .bind(last.run)
          .all()
      ).results
    : [];
  const pub = await env.CACHE.get<Published>(LIVE_KEY, "json");
  return json({ run: last?.run ?? null, progress, steps, published: pub ? { runId: pub.runId, generatedAt: pub.generatedAt, from: pub.from, to: pub.to, count: pub.count } : null });
}

const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>玩什么 · What's On</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0c22;color:#f5f4fd;font:16px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif;text-align:center;padding:24px}h1{font-size:1.6rem;margin:0 0 8px}p{color:#b6b4d0;margin:4px 0}a{color:#f5f4fd}</style></head>
<body><main><h1>玩什么 · What's On</h1><p>大温这两周去哪玩，正在准备中。</p><p>Greater Vancouver's next two weeks, coming soon.</p><p><a href="https://changle.ca">changle.ca</a></p></main></body></html>`;

export default {
  // (ctx is optional for the tests, which call fetch without one: the steps are then called directly)
  async fetch(req, env, ctx?: ExecutionContext) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/go/api/handoff") return receiveHandoff(req, env, Date.now(), (page) => useArrival(stepsOf(env, ctx), env.DB, page));
    // The Worker's own address (changle-events.<account>.workers.dev) is only the GitHub job's way in:
    // changle.ca's bot protection answers GitHub's machines with a challenge page (5 November 2026), so
    // the job hands its pages over here (wrangler.jsonc: workers_dev). Nothing else is served on it.
    if (url.hostname.endsWith(".workers.dev")) return json({ error: "not found" }, 404);
    if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "method not allowed" }, 405);
    if (path === "/go/api/events") return listEvents(url, env);
    if (path === "/go/api/events.ics") return listEvents(url, env, true);
    if (path === "/go/api/status") return status(env);
    if (path === "/go") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
    if (path === "/go/preview")
      return new Response(renderPreview(await published(env), url.searchParams), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
      });
    return json({ error: "not found" }, 404);
  },

  // At :00, :20 and :40 past 13:00 and 14:00 UTC: the ones at 06:xx in Vancouver run (13:xx while B.C.
  // keeps UTC-7). Each goes on with the morning's run where the last stopped; the 06:40 one publishes
  // whatever it has. (ALLOW_TEST: any hour, and never the last, so a local run goes on until done.)
  async scheduled(controller, env, ctx) {
    const local = vanParts(controller.scheduledTime);
    const test = env.ALLOW_TEST === "1";
    if (local.hour !== 6 && !test) return;
    await runDay(ctx.exports.Steps, env.DB, local.date, { final: local.minute >= 40 && !test });
  },
} satisfies ExportedHandler<Env>;
