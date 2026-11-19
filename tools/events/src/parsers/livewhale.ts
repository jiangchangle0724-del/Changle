// A LiveWhale calendar's events, from its JSON (version 2), one page at a time: SFU's
// (events.sfu.ca). Every occurrence comes as its own item, so the id is the item's with its date;
// but a multi-day all-day event (not a series) comes once a day with the same id, and is one event
// from its first day to its last. Facts only: what to keep is the source's call (src/sources.ts).
import { vanIso, vanParts } from "../time";
import type { Category, NormalizedEvent, Place, Tag } from "../types";
import { placeFromText, plainText } from "./ical";
import { decodeEntities } from "./jsonld";

/** Only the fields read. Flags are 1 or null; labels come HTML-escaped ("Arts &amp; Culture"). */
export interface LwEvent {
  id: number;
  title: string;
  url: string;
  /** "2026-11-26T19:30:00-07:00"; midnight for an all-day one */
  date_iso: string | null;
  date2_iso?: string | null;
  is_all_day?: number | boolean | null;
  is_canceled?: number | boolean | null;
  is_online?: number | boolean | null;
  /** "daily", "weekly", ...: a series, each occurrence an item with its own id; null for one event */
  repeats?: string | null;
  /** The whole event's first and last moments, in UTC ("2026-11-17 07:00:00") */
  repeats_start?: string | null;
  repeats_end?: string | null;
  location?: string | null;
  location_title?: string | null;
  location_latitude?: number | string | null;
  location_longitude?: number | string | null;
  /** "Free", a price in words, an HTML paragraph of prices, or a number */
  cost?: string | number | null;
  summary?: string | null;
  group_title?: string | null;
  /** The event's picture, cropped by LiveWhale ("…/live/image/gid/111/width/491/height/246/crop/1/…") */
  thumbnail?: string | null;
  event_types?: string[] | null;
  event_types_audience?: string[] | null;
  event_types_campus?: string[] | null;
}

export interface LwPage {
  meta: { page: number; total_pages: number; total_results?: number };
  data: LwEvent[];
}

export function isLwPage(x: unknown): x is LwPage {
  const p = x as LwPage | null;
  return !!p && typeof p === "object" && !!p.meta && typeof p.meta.page === "number" && typeof p.meta.total_pages === "number" && Array.isArray(p.data);
}

const text = (s: string | null | undefined) => (s ? decodeEntities(s.replace(/<[^<>]*>/g, " ")).replace(/\s+/g, " ").trim() : "");
const yes = (v: number | boolean | null | undefined) => v === 1 || v === true;
const num = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim()) ? (Number.isFinite(Number(v)) ? Number(v) : null) : null);
const DATE = /^\d{4}-\d{2}-\d{2}/;

/** The Vancouver date of one of LiveWhale's UTC times ("2026-11-17 07:00:00"). */
function vanDate(utc: string | null | undefined): string | null {
  const m = utc ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(utc.trim()) : null;
  const ms = m ? Date.parse(`${m[1]}T${m[2]}Z`) : NaN;
  return Number.isFinite(ms) ? vanParts(ms).date : null;
}

/** A way to watch, in a place's text ("Zoom", "SSB 7172 and Online"): the event is (also) online. */
const ONLINE = /\b(online|virtual|webinar|zoom|ms teams)\b/i;
/** What's left of a place once the ways to watch are out: nothing ("Online via Zoom", "Zoom/In-Person") is no place. */
const physical = (where: string) => where.replace(/\b(online|virtual|webinar|zoom|ms teams|teams|in[- ]person|hybrid|via|and|or)\b|[/&+,.()\-\s]/gi, "");

/**
 * The prices in a cost: "Free" is 0; dollar amounts give the lowest and highest ("from $10": the
 * lowest only); by donation or pay what you can, or anything else, is unknown.
 */
export function prices(cost: unknown): { priceMin: number | null; priceMax: number | null; isFree: boolean | null } {
  const none = { priceMin: null, priceMax: null, isFree: null };
  if (typeof cost === "number") return Number.isFinite(cost) && cost >= 0 ? { priceMin: cost, priceMax: cost, isFree: cost === 0 } : none;
  const t = typeof cost === "string" ? text(cost) : "";
  if (!t || /donation|pay what you|pwyc|by choice/i.test(t)) return none;
  const amounts = [...t.matchAll(/\$\s?(\d{1,4}(?:\.\d{1,2})?)\b/g)].map((m) => Number(m[1]));
  if (amounts.length) {
    const min = Math.min(...amounts);
    const from = amounts.length === 1 && /\b(from|starting|starts|and up|\+)/i.test(t);
    return { priceMin: min, priceMax: from ? null : Math.max(...amounts), isFree: !from && Math.max(...amounts) === 0 };
  }
  return /\bfree\b/i.test(t) ? { priceMin: 0, priceMax: 0, isFree: true } : none;
}

/** By the calendar's event types, where they say it: performances, then arts and talks, then sport. */
function categoryOf(types: string[]): Category | null {
  if (types.some((t) => /^(music|dance|theatre|theater|performances?|performing arts|concerts?)$/i.test(t))) return "shows";
  if (types.some((t) => /^(arts & culture|visual arts?|exhibits?|exhibitions?|multimedia|film|lectures?|lecture or discussion|readings?)$/i.test(t))) return "arts";
  if (types.some((t) => /^(athletics & recreation|athletics|recreation|sports?)$/i.test(t))) return "outdoors";
  return null;
}

function placeOf(where: string, ev: LwEvent): Place | null {
  if (!physical(where)) return null;
  const parsed = placeFromText(where);
  return {
    name: parsed?.name ?? where,
    address: parsed?.address ?? null,
    city: parsed?.city ?? null,
    postalCode: parsed?.postalCode ?? null,
    lat: num(ev.location_latitude),
    lon: num(ev.location_longitude),
  };
}

/**
 * Every occurrence on a page, as NormalizedEvent. `sourceCategories` holds the event's types, then
 * its audiences, then its campuses, as the calendar names them. More than half of a page that
 * can't be read is an error (the step fails, and yesterday's stay up), not an empty page.
 */
export function parseLiveWhale(page: LwPage, source: string): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const seen = new Set<string>();
  let unreadable = 0;
  for (const ev of page.data) {
    const title = text(ev?.title);
    const day = ev?.date_iso && DATE.test(ev.date_iso) ? ev.date_iso.slice(0, 10) : null;
    const startMs = ev?.date_iso ? Date.parse(ev.date_iso) : NaN;
    if (!ev || ev.id == null || !title || !day || !Number.isFinite(startMs) || typeof ev.url !== "string") {
      unreadable++;
      continue;
    }
    const allDay = yes(ev.is_all_day);
    const endMs = ev.date2_iso ? Date.parse(ev.date2_iso) : NaN;
    const endDay = ev.date2_iso && DATE.test(ev.date2_iso) ? ev.date2_iso.slice(0, 10) : null;
    // an exhibition, a food drive: one event over its days, whichever of them this page has
    const first = allDay && !ev.repeats ? vanDate(ev.repeats_start) : null;
    const last = first ? vanDate(ev.repeats_end) : null;
    const span = first && last && last > first ? { first, last } : null;
    const id = span ? String(ev.id) : `${ev.id}@${day}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const where = text(ev.location ?? ev.location_title);
    const types = (ev.event_types ?? []).map(text).filter(Boolean);
    const labels = [...types, ...(ev.event_types_audience ?? []), ...(ev.event_types_campus ?? [])].map(text).filter(Boolean);
    const price = prices(ev.cost);
    const tags: Tag[] = price.isFree ? ["free"] : [];
    out.push({
      source,
      sourceEventId: id,
      url: ev.url,
      title,
      description: plainText(ev.summary),
      start: span ? span.first : allDay ? day : vanIso(startMs),
      end: span ? span.last : allDay ? (endDay && endDay > day ? endDay : null) : Number.isFinite(endMs) && endMs > startMs ? vanIso(endMs) : null,
      allDay,
      timeTBD: false,
      status: yes(ev.is_canceled) ? "cancelled" : "scheduled",
      place: placeOf(where, ev),
      online: yes(ev.is_online) || ONLINE.test(where),
      ...price,
      category: categoryOf(types),
      sourceCategories: labels,
      tags,
      lang: null,
      imageUrl: typeof ev.thumbnail === "string" && /^https?:\/\//i.test(ev.thumbnail) ? ev.thumbnail : null,
      organizer: text(ev.group_title) || null,
    });
  }
  if (unreadable > page.data.length / 2) throw new Error(`${unreadable} of ${page.data.length} events on the page can't be read`);
  return out;
}
