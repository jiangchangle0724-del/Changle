// The day's run, on the free plan: each source's each part (a page) is one step, and each step is a
// request of its own (10 ms of CPU each; waiting on the network doesn't count). One run makes at
// most 31 of them (Cloudflare allows 32 Worker invocations per request): the steps, then publish.
import { ensureSchema } from "./schema";
import { SOURCE_BY_ID, SOURCES, type Window } from "./sources";
import { endMs, seenAgain, startMs, storeEvents } from "./store";
import { windowOf } from "./time";
import type { FetchLog } from "./types";

/** Who's asking, for the sites we read (they can see it's us, and how to reach us). */
export const USER_AGENT = "changle.ca events (+https://changle.ca/go)";
/** Raw responses are kept this long (KV), to rerun a parser without fetching again. */
export const RAW_TTL = 30 * 86_400;
/** Larger answers than this are refused, not read into memory. */
const MAX_BYTES = 6_000_000;
/** Steps in one run, leaving room for publish under Cloudflare's 32. */
export const MAX_STEPS = 30;

export interface StepArgs {
  runId: string;
  source: string;
  part: number;
}
export interface StepResult {
  /** The next part to fetch, or null. */
  next: number | null;
  log: FetchLog;
}

/** Read a response body, refusing one larger than `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) throw new Error(`too large: ${declared} bytes`);
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error(`too large: over ${max} bytes`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function writeLog(db: D1Database, l: FetchLog): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fetch_log (run_id, source, part, started_at, ms, http_status, not_modified, bytes, raw_key, found, in_window, added, updated, error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    )
    .bind(l.runId, l.source, l.part, l.startedAt, l.ms, l.httpStatus, l.notModified ? 1 : 0, l.bytes, l.rawKey, l.found, l.inWindow, l.added, l.updated, l.error)
    .run();
}

/** One step: fetch a part of a source, keep the raw answer, read it, store what's in the window. */
export async function fetchStep(env: Env, args: StepArgs): Promise<StepResult> {
  const started = Date.now();
  const log: FetchLog = { runId: args.runId, source: args.source, part: args.part, startedAt: new Date(started).toISOString(), ms: 0, httpStatus: null, notModified: false, bytes: 0, rawKey: null, found: 0, inWindow: 0, added: 0, updated: 0, error: null };
  let next: number | null = null;
  await ensureSchema(env.DB);
  const src = SOURCE_BY_ID[args.source];
  try {
    if (!src) throw new Error("unknown source");
    await env.DB.prepare("INSERT INTO sources (id, name, kind, url, tier) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, url = excluded.url, tier = excluded.tier")
      .bind(src.id, src.name, src.kind, src.url, src.tier)
      .run();
    if (src.needs && !env[src.needs]) {
      log.error = `skipped: ${src.needs} is not set`;
      return { next: null, log };
    }
    const w = windowOf(args.runId);
    const win: Window = { runId: args.runId, fromMs: w.fromMs, toMs: w.toMs };
    // A single-part source answers "not changed" when it hasn't (ETag / Last-Modified).
    const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "application/json, text/calendar, text/html;q=0.8, */*;q=0.5" };
    const single = src.maxParts === 1;
    if (single) {
      const prev = await env.DB.prepare("SELECT etag, last_modified, last_ok_run FROM sources WHERE id = ?1").bind(src.id).first<{ etag: string | null; last_modified: string | null; last_ok_run: string | null }>();
      if (prev?.etag) headers["if-none-match"] = prev.etag;
      if (prev?.last_modified) headers["if-modified-since"] = prev.last_modified;
    }
    const res = await fetch(src.request(args.part, env, win), { headers, redirect: "follow" });
    log.httpStatus = res.status;
    if (res.status === 304) {
      log.notModified = true;
      await seenAgain(env.DB, src.id, args.runId, win.fromMs);
    } else {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await readCapped(res, MAX_BYTES);
      log.bytes = raw.length;
      log.rawKey = `raw:${args.runId}:${src.id}:${args.part}`;
      await env.CACHE.put(log.rawKey, raw, { expirationTtl: RAW_TTL });
      const { events, more } = await src.parse(raw, args.part, win);
      log.found = events.length;
      const inWindow = events.filter((e) => startMs(e) < win.toMs && endMs(e) >= win.fromMs);
      log.inWindow = inWindow.length;
      const stored = await storeEvents(env.DB, args.runId, inWindow);
      log.added = stored.added;
      log.updated = stored.updated;
      if (more && args.part + 1 < src.maxParts) next = args.part + 1;
    }
    await env.DB.prepare("UPDATE sources SET last_ok_run = ?2, last_error = NULL, etag = coalesce(?3, etag), last_modified = coalesce(?4, last_modified) WHERE id = ?1")
      .bind(src.id, args.runId, single ? res.headers.get("etag") : null, single ? res.headers.get("last-modified") : null)
      .run();
  } catch (e) {
    log.error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    if (src) await env.DB.prepare("UPDATE sources SET last_error = ?2 WHERE id = ?1").bind(src.id, log.error).run();
  } finally {
    log.ms = Date.now() - started;
    await writeLog(env.DB, log);
  }
  return { next, log };
}

/** What a run calls for each step: the loopback binding in production, the functions in tests. */
export interface StepRunner {
  fetchSource(args: StepArgs): Promise<StepResult>;
  publish(args: { runId: string }): Promise<unknown>;
}

/** The whole run: every source, part after part, then publish. A step that fails is logged and skipped. */
export async function runDay(steps: StepRunner, runId: string): Promise<{ steps: number }> {
  let n = 0;
  for (const src of SOURCES) {
    let part: number | null = 0;
    while (part !== null && n < MAX_STEPS) {
      n++;
      try {
        part = (await steps.fetchSource({ runId, source: src.id, part })).next;
      } catch {
        // (the step logs its own failures; one that couldn't even start ends this source for today)
        part = null;
      }
    }
  }
  await steps.publish({ runId });
  return { steps: n };
}
