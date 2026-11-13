// Storing what a step read: its places as venues, its events as rows (new, changed, or just seen
// again today). One statement each, whatever the count: the free plan allows 50 queries a step.
import { areaOf } from "./area";
import { fromVan } from "./time";
import type { NormalizedEvent, Place } from "./types";

/** A short, stable hash (FNV-1a, 52 bits) for ids and change detection. */
export function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)).slice(0, 12);
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** A place's id: its name with its postal code, or with its rounded coordinates, or its address. */
export function venueId(p: Place): string {
  const where = p.postalCode ? p.postalCode.replace(/\s+/g, "").toLowerCase() : p.lat != null && p.lon != null ? `${p.lat.toFixed(3)},${p.lon.toFixed(3)}` : norm(p.address);
  return `v-${hash(`${norm(p.name)}|${where}`)}`;
}

/** When an event starts (epoch ms); an all-day one at the start of its day in Vancouver. */
export const startMs = (ev: NormalizedEvent) => (ev.allDay ? fromVan(ev.start.slice(0, 10)) : Date.parse(ev.start));

/**
 * When the event is over (epoch ms). An all-day event ends after its last day; that end may also come as a
 * Vancouver ISO time, whose first 10 characters are the date. An end that can't be read counts as
 * none (to the end of the day, or two hours), so the event isn't dropped from the window for it.
 */
export function endMs(ev: NormalizedEvent): number {
  const end = !ev.end ? NaN : ev.allDay ? fromVan(ev.end.slice(0, 10)) + 86_400_000 : Date.parse(ev.end);
  if (Number.isFinite(end)) return end;
  return startMs(ev) + (ev.allDay ? 86_400_000 : 2 * 3600_000);
}

export async function storeEvents(db: D1Database, runId: string, events: NormalizedEvent[]): Promise<{ added: number; updated: number }> {
  if (!events.length) return { added: 0, updated: 0 };
  const now = new Date().toISOString();
  const venues = new Map<string, Record<string, unknown>>();
  const rows = new Map<string, Record<string, unknown>>();
  for (const ev of events) {
    let venue: string | null = null;
    if (ev.place?.name) {
      venue = venueId(ev.place);
      if (!venues.has(venue)) {
        const { area, check } = areaOf(ev.place);
        venues.set(venue, {
          id: venue,
          name: ev.place.name,
          address: ev.place.address ?? null,
          city: ev.place.city ?? null,
          postal_code: ev.place.postalCode ?? null,
          lat: ev.place.lat ?? null,
          lon: ev.place.lon ?? null,
          area,
          area_check: check ? 1 : 0,
          created_at: now,
        });
      }
    }
    const row = {
      id: `${ev.source}:${ev.sourceEventId}`,
      source: ev.source,
      source_event_id: ev.sourceEventId,
      url: ev.url,
      title: ev.title,
      description: ev.description ?? null,
      start_at: ev.start,
      end_at: ev.end ?? null,
      start_utc: startMs(ev),
      end_utc: endMs(ev),
      all_day: ev.allDay ? 1 : 0,
      time_tbd: ev.timeTBD ? 1 : 0,
      status: ev.status,
      venue_id: venue,
      online: ev.online ? 1 : 0,
      price_min: ev.priceMin ?? null,
      price_max: ev.priceMax ?? null,
      is_free: ev.isFree == null ? null : ev.isFree ? 1 : 0,
      category: ev.category ?? null,
      category_by: ev.category ? "rule" : null,
      source_categories: JSON.stringify(ev.sourceCategories ?? []),
      tags: JSON.stringify(ev.tags ?? []),
      lang: ev.lang ?? null,
      image_url: ev.imageUrl ?? null,
      organizer: ev.organizer ?? null,
      content_hash: "",
      first_seen: runId,
      last_seen: runId,
      updated_at: now,
    };
    const { first_seen: _f, last_seen: _l, updated_at: _u, content_hash: _c, ...facts } = row;
    row.content_hash = hash(JSON.stringify(facts));
    if (Number.isFinite(row.start_utc)) rows.set(row.id, row);
  }
  const list = [...rows.values()];
  const before = await db
    .prepare("SELECT id, content_hash FROM events WHERE id IN (SELECT value FROM json_each(?1))")
    .bind(JSON.stringify(list.map((r) => r.id)))
    .all<{ id: string; content_hash: string }>();
  const known = new Map(before.results.map((r) => [r.id, r.content_hash]));
  const added = list.filter((r) => !known.has(r.id as string)).length;
  const updated = list.filter((r) => known.has(r.id as string) && known.get(r.id as string) !== r.content_hash).length;

  const col = (names: string[]) => names.map((n) => `json_extract(j.value, '$.${n}')`).join(", ");
  const VENUE_COLS = ["id", "name", "address", "city", "postal_code", "lat", "lon", "area", "area_check", "created_at"];
  const EVENT_COLS = Object.keys(list[0]);
  // What the source owns is refreshed every time; what the AI or Steve decided is kept.
  const refresh = EVENT_COLS.filter((c) => !["id", "first_seen", "category", "category_by", "updated_at"].includes(c));
  const stmts: D1PreparedStatement[] = [];
  if (venues.size)
    stmts.push(
      db
        .prepare(
          `INSERT INTO venues (${VENUE_COLS.join(", ")}) SELECT ${col(VENUE_COLS)} FROM json_each(?1) j WHERE true
           ON CONFLICT(id) DO UPDATE SET lat = coalesce(venues.lat, excluded.lat), lon = coalesce(venues.lon, excluded.lon),
             address = coalesce(venues.address, excluded.address), postal_code = coalesce(venues.postal_code, excluded.postal_code)`,
        )
        .bind(JSON.stringify([...venues.values()])),
    );
  stmts.push(
    db
      .prepare(
        `INSERT INTO events (${EVENT_COLS.join(", ")}) SELECT ${col(EVENT_COLS)} FROM json_each(?1) j WHERE true
         ON CONFLICT(id) DO UPDATE SET ${refresh.map((c) => `${c} = excluded.${c}`).join(", ")},
           category = CASE WHEN events.category_by IN ('ai', 'steve') THEN events.category ELSE excluded.category END,
           category_by = CASE WHEN events.category_by IN ('ai', 'steve') THEN events.category_by ELSE excluded.category_by END,
           updated_at = CASE WHEN events.content_hash IS excluded.content_hash THEN events.updated_at ELSE excluded.updated_at END`,
      )
      .bind(JSON.stringify(list)),
  );
  await db.batch(stmts);
  return { added, updated };
}

/** A source said nothing changed (304): everything it listed is still there today. */
export async function seenAgain(db: D1Database, source: string, runId: string, fromMs: number): Promise<void> {
  await db.prepare("UPDATE events SET last_seen = ?1 WHERE source = ?2 AND end_utc >= ?3").bind(runId, source, fromMs).run();
}
