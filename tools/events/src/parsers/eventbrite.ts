// Eventbrite's API (v3), with Steve's own token: the public events of the organizations What's On
// follows (src/follows.ts), one organization's list at a time (/organizations/{id}/events/). Its
// public search was shut down in 2019, and its pages may not be read by a program: this is the way
// it allows. Facts only: what to keep is the source's call (src/sources.ts, eventbriteOpen).
import { vanIso } from "../time";
import type { Category, NormalizedEvent, Place, Tag } from "../types";
import { plainText } from "./ical";

interface EbTime {
  timezone?: string | null;
  local?: string | null;
  /** "2026-11-29T03:00:00Z" */
  utc?: string | null;
}

interface EbPrice {
  currency?: string | null;
  /** "29.54" */
  major_value?: string | null;
}

/** Only the fields read (with `expand=venue,ticket_availability,organizer`). */
export interface EbEvent {
  id: string;
  name?: { text?: string | null } | null;
  summary?: string | null;
  description?: { text?: string | null } | null;
  url?: string | null;
  start?: EbTime | null;
  end?: EbTime | null;
  /** "live", "started", "ended", "completed", "canceled", "draft" */
  status?: string | null;
  /** false: unlisted, for whoever has the link */
  listed?: boolean | null;
  online_event?: boolean | null;
  is_free?: boolean | null;
  /** the series itself; its dates come as events of their own */
  is_series_parent?: boolean | null;
  category_id?: string | null;
  organization_id?: string | null;
  logo?: { url?: string | null; original?: { url?: string | null } | null } | null;
  venue?: {
    name?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    address?: { address_1?: string | null; city?: string | null; postal_code?: string | null; latitude?: string | null; longitude?: string | null } | null;
  } | null;
  ticket_availability?: { is_sold_out?: boolean | null; minimum_ticket_price?: EbPrice | null; maximum_ticket_price?: EbPrice | null } | null;
  organizer?: { name?: string | null } | null;
}

export interface EbPage {
  pagination?: { has_more_items?: boolean | null; page_number?: number | null } | null;
  events: EbEvent[];
}

export function isEbPage(x: unknown): x is EbPage {
  const p = x as EbPage | null;
  return !!p && typeof p === "object" && Array.isArray(p.events);
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const web = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);

/** Eventbrite's categories (category_id), where they say it plainly; the rest is the AI's. */
const CATEGORY: Record<string, Category> = { "103": "shows", "105": "shows", "110": "food", "116": "festivals", "115": "family", "108": "outdoors", "109": "outdoors" };

function placeOf(ev: EbEvent): Place | null {
  const v = ev.venue;
  if (!v) return null;
  const a = v.address ?? {};
  const name = str(v.name);
  const address = str(a.address_1);
  if (!name && !address) return null;
  return { name: name ?? address, address, city: str(a.city), postalCode: str(a.postal_code), lat: num(a.latitude ?? v.latitude), lon: num(a.longitude ?? v.longitude) };
}

/** The lowest and highest ticket in dollars (Canadian only): free when Eventbrite says so. */
function pricesOf(ev: EbEvent): { priceMin: number | null; priceMax: number | null; isFree: boolean | null } {
  if (ev.is_free === true) return { priceMin: 0, priceMax: 0, isFree: true };
  const t = ev.ticket_availability;
  const dollars = (p: EbPrice | null | undefined) => (p && (p.currency ?? "CAD") === "CAD" ? num(p.major_value) : null);
  const min = dollars(t?.minimum_ticket_price);
  const max = dollars(t?.maximum_ticket_price);
  const paid = [min, max].filter((p): p is number => p != null && p > 0);
  return paid.length ? { priceMin: Math.min(...paid), priceMax: Math.max(...paid), isFree: false } : { priceMin: null, priceMax: null, isFree: null };
}

/**
 * Every event on a page that's public and has a date: not an unlisted one (for whoever has the
 * link), not a series itself (its dates are events of their own), not a draft. More than half of a
 * page that can't be read is an error (the step fails, and yesterday's stay up), not an empty page.
 */
export function parseEventbrite(page: EbPage, source: string): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  let unreadable = 0;
  for (const ev of page.events) {
    const title = str(ev?.name?.text);
    const startMs = ev?.start?.utc ? Date.parse(ev.start.utc) : NaN;
    if (!ev || !str(ev.id) || !title || !Number.isFinite(startMs)) {
      unreadable++;
      continue;
    }
    if (ev.listed === false || ev.is_series_parent || ev.status === "draft") continue;
    const endMs = ev.end?.utc ? Date.parse(ev.end.utc) : NaN;
    const price = pricesOf(ev);
    const tags: Tag[] = price.isFree ? ["free"] : price.priceMin != null ? ["tickets"] : [];
    out.push({
      source,
      sourceEventId: ev.id,
      url: web(ev.url) ?? `https://www.eventbrite.ca/e/${ev.id}`,
      title,
      description: plainText(ev.summary ?? ev.description?.text),
      start: vanIso(startMs),
      end: Number.isFinite(endMs) && endMs > startMs ? vanIso(endMs) : null,
      allDay: false,
      timeTBD: false,
      status: ev.status === "canceled" ? "cancelled" : ev.ticket_availability?.is_sold_out ? "soldout" : "scheduled",
      place: placeOf(ev),
      online: !!ev.online_event,
      ...price,
      category: (ev.category_id ? CATEGORY[ev.category_id] : null) ?? null,
      sourceCategories: [],
      tags,
      lang: null,
      imageUrl: web(ev.logo?.original?.url) ?? web(ev.logo?.url),
      organizer: str(ev.organizer?.name),
    });
  }
  if (unreadable > page.events.length / 2) throw new Error(`${unreadable} of ${page.events.length} events on the page can't be read`);
  return out;
}
