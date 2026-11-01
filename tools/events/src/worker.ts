// 玩什么 · What's On at changle.ca/go. Every morning at 06:00 Vancouver time the scheduled run
// gathers the next 14 days (src/run.ts) and publishes them to KV (src/publish.ts); the API reads
// that one file, so it answers at once. The page itself comes after gate A (docs/whats-on-v2.md).
//   GET /go/api/events   the events, filtered: from, to (YYYY-MM-DD), cat, area, tag (comma lists)
//   GET /go/api/status   the last run, step by step (the fetch log), and what's published
import { WorkerEntrypoint } from "cloudflare:workers";
import { LIVE_KEY, publish } from "./publish";
import { fetchStep, runDay, type StepArgs } from "./run";
import { ensureSchema } from "./schema";
import { vanParts } from "./time";
import { AREAS, CATEGORIES, TAGS, type PublicEvent, type Published } from "./types";

/** The run's steps, each called through the loopback binding as a request of its own. */
export class Steps extends WorkerEntrypoint<Env> {
  fetchSource(args: StepArgs) {
    return fetchStep(this.env, args);
  }
  publish(args: { runId: string }) {
    return publish(this.env, args.runId);
  }
}

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "access-control-allow-origin": "*" } });

/** A comma list from the query, keeping only the allowed values. */
function pick<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter((s): s is T => (allowed as readonly string[]).includes(s));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function listEvents(url: URL, env: Env): Promise<Response> {
  const pub = await env.CACHE.get<Published>(LIVE_KEY, { type: "json", cacheTtl: 60 });
  if (!pub) return json({ error: "not ready" }, 503);
  const q = url.searchParams;
  const from = DATE.test(q.get("from") ?? "") ? q.get("from")! : pub.from;
  const to = DATE.test(q.get("to") ?? "") ? q.get("to")! : pub.to;
  const cats = pick(q.get("cat"), CATEGORIES);
  const areas = pick(q.get("area"), AREAS);
  const tags = pick(q.get("tag"), TAGS);
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  const events = pub.events.filter(
    (e: PublicEvent) =>
      day(e.start)! <= to &&
      (day(e.end) ?? day(e.start)!) >= from &&
      (!cats.length || (e.category && cats.includes(e.category))) &&
      (!areas.length || (e.area && areas.includes(e.area))) &&
      tags.every((t) => (t === "featured" ? e.featured : t === "free" ? e.isFree === true || e.tags.includes("free") : e.tags.includes(t))),
  );
  return json({ runId: pub.runId, generatedAt: pub.generatedAt, from, to, count: events.length, events }, 200, "public, max-age=300, stale-while-revalidate=3600");
}

async function status(env: Env): Promise<Response> {
  await ensureSchema(env.DB);
  const last = await env.DB.prepare("SELECT max(run_id) AS run FROM fetch_log").first<{ run: string | null }>();
  const steps = last?.run
    ? (
        await env.DB.prepare(
          "SELECT source, part, started_at, ms, http_status, not_modified, bytes, found, in_window, added, updated, error FROM fetch_log WHERE run_id = ?1 ORDER BY id",
        )
          .bind(last.run)
          .all()
      ).results
    : [];
  const pub = await env.CACHE.get<Published>(LIVE_KEY, "json");
  return json({ run: last?.run ?? null, steps, published: pub ? { runId: pub.runId, generatedAt: pub.generatedAt, from: pub.from, to: pub.to, count: pub.count } : null });
}

const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>玩什么 · What's On</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0c22;color:#f5f4fd;font:16px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif;text-align:center;padding:24px}h1{font-size:1.6rem;margin:0 0 8px}p{color:#b6b4d0;margin:4px 0}a{color:#f5f4fd}</style></head>
<body><main><h1>玩什么 · What's On</h1><p>大温这两周去哪玩，正在准备中。</p><p>Greater Vancouver's next two weeks, coming soon.</p><p><a href="https://changle.ca">changle.ca</a></p></main></body></html>`;

export default {
  async fetch(req, env) {
    if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "method not allowed" }, 405);
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/go/api/events") return listEvents(url, env);
    if (path === "/go/api/status") return status(env);
    if (path === "/go") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
    return json({ error: "not found" }, 404);
  },

  // 13:00 and 14:00 UTC: one of them is 06:00 in Vancouver, summer or winter. That one runs.
  async scheduled(controller, env, ctx) {
    const local = vanParts(controller.scheduledTime);
    if (local.hour !== 6 && env.ALLOW_TEST !== "1") return;
    await runDay(ctx.exports.Steps, local.date);
  },
} satisfies ExportedHandler<Env>;
