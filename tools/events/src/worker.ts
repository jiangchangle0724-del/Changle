// 玩什么 · What's On at changle.ca/go. Every morning at 06:00 Vancouver time the scheduled run
// gathers the next 14 days (src/run.ts) and publishes them to KV (src/publish.ts); the API reads
// that one file, so it answers at once. Every hour at :05 Workers AI writes the Chinese names and
// sentences the published page still lacks, and it's published again (src/ai.ts).
//   GET /go              the page: one day at a time, by category, area and price (src/page.ts)
//   GET /go/api/events   the events, filtered: from, to (YYYY-MM-DD), cat, area, tag (comma lists)
//   GET /go/api/events.ics  the same, as a calendar to subscribe to (src/ics.ts)
//   GET /go/api/status   the last run, step by step (the fetch log), what's published, how each source
//                        last went and what the last runs published (also on workers.dev, for GitHub)
//   GET /go/preview      what's published, day by day: unlisted and not indexed, to check the run
//   POST /go/api/handoff the libraries' pages, from the GitHub job (signed in by GitHub; src/handoff.ts): kept for
//                        the run, or read at once when the run has gone past the library (src/arrival.ts)
import { WorkerEntrypoint } from "cloudflare:workers";
import { AI_CRON, catchUp, translateStep } from "./ai";
import { useArrival } from "./arrival";
import { receiveHandoff } from "./handoff";
import { toIcs } from "./ics";
import { AREA_LABEL, CATEGORY_LABEL, TAG_LABEL } from "./labels";
import { renderAdmin, renderSubmit } from "./forms";
import { noticeOwner, ownerOf } from "./owner";
import { pickLang, renderPage } from "./page";
import { renderPreview } from "./preview";
import { LIVE_KEY, publish } from "./publish";
import { filterEvents, readQuery } from "./query";
import { fetchStep, runDay, type StepArgs, type StepRunner } from "./run";
import { ensureSchema } from "./schema";
import { SOURCE_BY_ID } from "./sources";
import { decide, listSubmissions, posterOf, receive } from "./submit";
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
  translate(args: { runId: string; ids: string[]; part?: number }) {
    return translateStep(this.env, args);
  }
}

/** The steps, each a request of its own (the loopback binding); called directly where there's none (tests). */
const stepsOf = (env: Env, ctx?: ExecutionContext): StepRunner =>
  (ctx?.exports?.Steps as StepRunner | undefined) ?? { fetchSource: (a) => fetchStep(env, a), publish: (a) => publish(env, a.runId, a.note ?? null) };

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "access-control-allow-origin": "*" } });

const published = (env: Env) => env.CACHE.get<Published>(LIVE_KEY, { type: "json", cacheTtl: 60 });

const html = (body: string, cache = "no-store") =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache, "x-robots-tag": "noindex" } });

/** The page again, after the owner let a submission in; not while this morning's run is under way (it publishes them itself). */
async function republish(env: Env, ctx?: ExecutionContext): Promise<void> {
  const pub = await published(env);
  if (!pub) return;
  const today = await env.DB.prepare("SELECT published_at FROM runs WHERE run_id = ?1").bind(vanParts(Date.now()).date).first<{ published_at: string | null }>();
  if (today && !today.published_at) return;
  await stepsOf(env, ctx).publish({ runId: pub.runId, note: "a submission let in" });
}

/** POST /go/api/submit: an event sent in (src/submit.ts); the owner is told by mail, after the answer. */
async function submitted(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > 2_500_000) return json({ error: "too big" }, 413);
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "json" }, 400);
  await ensureSchema(env.DB);
  const r = await receive(env, body, req.headers.get("cf-connecting-ip") ?? "unknown");
  if (!r.ok) return json({ error: r.error }, r.status);
  if (r.id) {
    const told = noticeOwner(env, { id: r.id, link: r.link, text: r.text, title: r.draft?.title ?? null, hasImage: r.hasImage }).catch(() => "");
    if (ctx) ctx.waitUntil(told);
    else await told;
  }
  return json({ ok: true, draft: r.draft ? { title: r.draft.title, start: r.draft.start } : null });
}

/** /go/api/admin/…: the owner's, signed in with changle.ca (src/owner.ts). */
async function admin(req: Request, env: Env, path: string, ctx?: ExecutionContext): Promise<Response> {
  const who = await ownerOf(req, env);
  if (!who.ok) return json({ error: who.status === 401 ? "signin" : who.status === 403 ? "owner only" : "down" }, who.status);
  await ensureSchema(env.DB);
  if (path === "/go/api/admin/submissions" && req.method === "GET") return json(await listSubmissions(env.DB));
  const poster = /^\/go\/api\/admin\/poster\/([a-z0-9]{6,16})$/.exec(path);
  if (poster && req.method === "GET") {
    const p = await posterOf(env, poster[1]);
    return p ? new Response(p.bytes, { headers: { "content-type": p.type, "cache-control": "private, no-store" } }) : json({ error: "not found" }, 404);
  }
  const one = /^\/go\/api\/admin\/submissions\/([a-z0-9]{6,16})$/.exec(path);
  if (one && req.method === "POST") {
    const body = await req.json().catch(() => null);
    const r = await decide(env, one[1], body, () => republish(env, ctx));
    return r.ok ? json(r) : json({ error: r.error }, r.status);
  }
  return json({ error: "not found" }, 404);
}

async function listEvents(url: URL, env: Env, ics = false): Promise<Response> {
  const pub = await published(env);
  if (!pub) return json({ error: "not ready" }, 503);
  const q = readQuery(url.searchParams, pub);
  const { from, to } = q;
  const events = filterEvents(pub.events, q);
  if (ics) {
    // A filtered calendar is named by its filters, in Chinese and English: "玩什么 · What's On · 亲子家庭 Family & Kids".
    const label = ([zh, en]: readonly [string, string]) => `${zh} ${en}`;
    const name = ["玩什么 · What's On", ...q.cats.map((c) => label(CATEGORY_LABEL[c])), ...q.areas.map((a) => label(AREA_LABEL[a])), ...q.tags.map((t) => label(TAG_LABEL[t]))].join(" · ");
    const text = toIcs(events, { name, now: new Date() });
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
  // for the daily health check (src/health.ts): how each source in the code's list last went (one
  // taken off the list keeps its row), and what the last runs published
  const sources = (await env.DB.prepare("SELECT id, name, enabled, last_ok_run AS lastOkRun, last_error AS lastError FROM sources ORDER BY id").all<{ id: string }>()).results.filter(
    (s) => SOURCE_BY_ID[s.id],
  );
  const history = (
    await env.DB.prepare("SELECT run_id AS run, max(found) AS count FROM fetch_log WHERE source = 'publish' GROUP BY run_id ORDER BY run_id DESC LIMIT 8").all()
  ).results;
  return json({
    run: last?.run ?? null,
    progress,
    steps,
    published: pub ? { runId: pub.runId, generatedAt: pub.generatedAt, from: pub.from, to: pub.to, count: pub.count } : null,
    sources,
    history,
  });
}

export default {
  // (ctx is optional for the tests, which call fetch without one: the steps are then called directly)
  async fetch(req, env, ctx?: ExecutionContext) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/go/api/handoff") return receiveHandoff(req, env, Date.now(), (page) => useArrival(stepsOf(env, ctx), env.DB, page));
    // The Worker's own address (changle-events.<account>.workers.dev) is only the GitHub jobs' way in:
    // changle.ca's bot protection answers GitHub's machines with a challenge page (5 November 2026), so
    // the libraries' job hands its pages over here (wrangler.jsonc: workers_dev), and the daily health
    // check reads the status here (scripts/health.ts). Nothing else is served on it.
    if (url.hostname.endsWith(".workers.dev") && path !== "/go/api/status") return json({ error: "not found" }, 404);
    if (path === "/go/api/submit" && req.method === "POST") return submitted(req, env, ctx);
    if (path.startsWith("/go/api/admin/")) return admin(req, env, path, ctx);
    if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "method not allowed" }, 405);
    if (path === "/go/submit") return html(renderSubmit(pickLang(url.searchParams, req.headers.get("accept-language"))), "public, max-age=300");
    if (path === "/go/admin") return html(renderAdmin());
    const poster = /^\/go\/poster\/([a-z0-9]{6,16})$/.exec(path);
    if (poster) {
      // a poster is everyone's once its submission is let in: the event's picture
      await ensureSchema(env.DB);
      const row = await env.DB.prepare("SELECT status FROM submissions WHERE id = ?1").bind(poster[1]).first<{ status: string }>();
      const p = row?.status === "approved" ? await posterOf(env, poster[1]) : null;
      return p ? new Response(p.bytes, { headers: { "content-type": p.type, "cache-control": "public, max-age=86400" } }) : json({ error: "not found" }, 404);
    }
    if (path === "/go/api/events") return listEvents(url, env);
    if (path === "/go/api/events.ics") return listEvents(url, env, true);
    if (path === "/go/api/status") return status(env);
    if (path === "/go")
      // what's on, for everyone (src/page.ts); in the language asked for, else the browser's own
      return new Response(renderPage(await published(env), url.searchParams, pickLang(url.searchParams, req.headers.get("accept-language"))), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", vary: "Accept-Language" },
      });
    if (path === "/go/preview")
      return new Response(renderPreview(await published(env), url.searchParams), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
      });
    return json({ error: "not found" }, 404);
  },

  // At :00, :20 and :40 past 13:00 and 14:00 UTC: the ones at 06:xx in Vancouver run (13:xx while B.C.
  // keeps UTC-7). Each goes on with the morning's run where the last stopped; the 06:40 one publishes
  // whatever it has. (ALLOW_TEST: any hour, and never the last, so a local run goes on until done.)
  // At :05 every hour: the Chinese the published page still lacks (src/ai.ts), then the page again.
  async scheduled(controller, env, ctx) {
    if (controller.cron === AI_CRON) {
      // (the columns it writes may be newer than the last run: a deploy at night)
      await ensureSchema(env.DB);
      await catchUp(ctx.exports.Steps, env.DB, (await published(env))?.runId ?? null, controller.scheduledTime);
      return;
    }
    const local = vanParts(controller.scheduledTime);
    const test = env.ALLOW_TEST === "1";
    if (local.hour !== 6 && !test) return;
    await runDay(ctx.exports.Steps, env.DB, local.date, { final: local.minute >= 40 && !test });
  },
} satisfies ExportedHandler<Env>;
