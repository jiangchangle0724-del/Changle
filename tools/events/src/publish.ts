// Publish: the next 14 days, from the database to one JSON in KV that the page and the API read.
// Cancelled ones are left out, and so is anything its source stopped listing today. A source that
// failed today, or didn't get to its last page, keeps its events from before today (its
// sources.last_ok_run is today's run only once every page of it was read: src/run.ts). A run that
// comes out with less than half of yesterday's is not published: yesterday's stays up and the log
// says why. The page is never empty.
import { ensureSchema } from "./schema";
import { SOURCE_BY_ID } from "./sources";
import { windowOf } from "./time";
import type { Area, Category, EventStatus, Lang, PublicEvent, Published, Tag } from "./types";

export const LIVE_KEY = "events:live";
export const STATUS_KEY = "status";

interface Row {
  id: string;
  source: string;
  title: string;
  summary_zh: string | null;
  summary_en: string | null;
  start_at: string;
  end_at: string | null;
  all_day: number;
  time_tbd: number;
  status: EventStatus;
  venue_name: string | null;
  venue_address: string | null;
  venue_area: Area | null;
  venue_area_check: number | null;
  category: Category | null;
  tags: string;
  price_min: number | null;
  is_free: number | null;
  lang: Lang | null;
  url: string;
  image_url: string | null;
  featured: number;
  updated_at: string;
}

export interface PublishResult {
  runId: string;
  count: number;
  previous: number;
  kept: boolean;
}

export async function publish(env: Env, runId: string): Promise<PublishResult> {
  const started = Date.now();
  await ensureSchema(env.DB);
  const w = windowOf(runId);
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.source, e.title, e.summary_zh, e.summary_en, e.start_at, e.end_at, e.all_day, e.time_tbd, e.status,
            v.name AS venue_name, v.address AS venue_address, v.area AS venue_area, v.area_check AS venue_area_check,
            e.category, e.tags, e.price_min, e.is_free, e.lang, e.url, e.image_url, e.featured, e.updated_at
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       LEFT JOIN sources s ON s.id = e.source
      WHERE e.start_utc < ?2 AND e.end_utc >= ?1
        AND e.status != 'cancelled' AND e.visibility = 'live' AND e.duplicate_of IS NULL
        AND (e.last_seen = ?3 OR s.last_ok_run IS NOT ?3)
      ORDER BY e.featured DESC, e.start_utc, e.title`,
  )
    .bind(w.fromMs, w.toMs, runId)
    .all<Row>();
  const events: PublicEvent[] = results.map((r) => ({
    id: r.id,
    title: r.title,
    summaryZh: r.summary_zh,
    summaryEn: r.summary_en,
    start: r.start_at,
    end: r.end_at,
    allDay: !!r.all_day,
    timeTBD: !!r.time_tbd,
    status: r.status,
    venue: r.venue_name,
    address: r.venue_address,
    area: r.venue_area,
    areaCheck: !!r.venue_area_check,
    category: r.category,
    tags: JSON.parse(r.tags) as Tag[],
    priceMin: r.price_min,
    isFree: r.is_free == null ? null : !!r.is_free,
    lang: r.lang,
    url: r.url,
    imageUrl: r.image_url,
    sourceName: SOURCE_BY_ID[r.source]?.name ?? r.source,
    featured: !!r.featured,
    updatedAt: r.updated_at,
  }));
  const before = await env.CACHE.get<Published>(LIVE_KEY, "json");
  const previous = before?.count ?? 0;
  // Yesterday had a real list and today has under half of it: something broke. Keep yesterday's.
  const kept = previous >= 20 && events.length < previous / 2;
  if (!kept) {
    const out: Published = { runId, generatedAt: new Date().toISOString(), from: w.from, to: w.to, count: events.length, events };
    await env.CACHE.put(LIVE_KEY, JSON.stringify(out));
  }
  await env.DB.prepare(
    `INSERT INTO fetch_log (run_id, source, part, started_at, ms, found, in_window, error) VALUES (?1, 'publish', 0, ?2, ?3, ?4, ?4, ?5)`,
  )
    .bind(runId, new Date(started).toISOString(), Date.now() - started, events.length, kept ? `kept yesterday's ${previous}: today had only ${events.length}` : null)
    .run();
  return { runId, count: events.length, previous, kept };
}
