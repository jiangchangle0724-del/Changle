// Showpass (www.showpass.com), the ticket seller much of Vancouver uses: comedy, nightlife, theatre,
// junior hockey, markets, light shows. Its public API answers two ways, and each is a source:
//  - "events" (/api/public/events/): every date of every event, one item each, with its prices and
//    words. A timed-entry attraction comes as half-hour slots (the Christmas Market, VanDusen's
//    lights: 330 of 613 items in two weeks): those aren't read here, but from:
//  - "discovery" (/api/public/discovery/): what Showpass lists for sale, one item a product: the
//    attraction's whole season, a series as its first date to its last.
// So "events" keeps what lasts less than a day and "discovery" what lasts longer, and nothing comes
// twice. Facts only: what anyone can go to is the source's call (src/sources.ts, showpassOpen).
import { vanIso } from "../time";
import type { Category, NormalizedEvent, Place, Tag } from "../types";
import { plainText } from "./ical";

/** Only the fields read, from either answer (prices are ticket types in one, sub-items in the other). */
export interface SpItem {
  id?: number;
  /** discovery's id for it */
  item_id?: number;
  /** discovery: "event", or "membership" (a season-ticket holders' club) */
  type?: string;
  name: string;
  slug?: string | null;
  starts_on: string;
  ends_on?: string | null;
  /** events: the date or slot this item is one of */
  parent_event?: number | string | null;
  /** discovery: a series, its dates read from "events" */
  is_recurring_parent?: boolean | null;
  /** a rink's or pool's drop-in session */
  is_attraction_child?: boolean | null;
  is_password_protected?: boolean | null;
  status?: string | null;
  sold_out?: boolean | null;
  inventory_sold_out?: boolean | null;
  virtual_event_type?: string | null;
  time_to_be_determined?: boolean | null;
  date_time_to_be_determined?: boolean | null;
  frontend_details_url?: string | null;
  external_link?: string | null;
  description_without_html?: string | null;
  image?: string | null;
  image_banner?: string | null;
  categories?: string[] | null;
  location?: { name?: string | null; street_name?: string | null; city?: string | null; postal_code?: string | null; position?: string | null } | null;
  venue?: { name?: string | null } | null;
  ticket_types?: { price?: string | number | null }[] | null;
  sub_items?: { price?: string | number | null }[] | null;
}

export interface SpPage {
  count: number;
  next: string | null;
  results: SpItem[];
}

export function isSpPage(x: unknown): x is SpPage {
  const p = x as SpPage | null;
  return !!p && typeof p === "object" && typeof p.count === "number" && Array.isArray(p.results) && (p.next === null || typeof p.next === "string");
}

const HOUR = 3_600_000;
/** A slot of a timed-entry attraction: a date's half hour (an hour at most). */
const SLOT = HOUR;
/** Up to a day: "events" has it; longer: "discovery". */
const DAY = 24 * HOUR;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const web = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);

/** The prices of its tickets: the lowest and highest paid one; free only when every ticket is (a child's free ticket isn't the price). */
export function spPrices(item: SpItem): { priceMin: number | null; priceMax: number | null; isFree: boolean | null } {
  const all = [...(item.ticket_types ?? []), ...(item.sub_items ?? [])]
    .map((t) => (t?.price == null || t.price === "" ? NaN : Number(t.price)))
    .filter((p) => Number.isFinite(p) && p >= 0);
  const paid = all.filter((p) => p > 0);
  if (paid.length) return { priceMin: Math.min(...paid), priceMax: Math.max(...paid), isFree: false };
  return all.length ? { priceMin: 0, priceMax: 0, isFree: true } : { priceMin: null, priceMax: null, isFree: null };
}

/** By Showpass's own categories (discovery has them), where they say it plainly; the rest is the AI's. */
function categoryOf(cats: string[]): Category | null {
  if (cats.some((c) => /^(comedy|music|arts_and_theatres)$/.test(c))) return "shows";
  if (cats.some((c) => /^(seasonal_and_holiday|fairs_and_festivals)$/.test(c))) return "festivals";
  if (cats.includes("food_and_beverage")) return "food";
  if (cats.includes("family_friendly")) return "family";
  if (cats.some((c) => /^(sports|travel_and_outdoor)$/.test(c))) return "outdoors";
  return null;
}

function placeOf(item: SpItem): Place | null {
  const l = item.location;
  if (!l) return null;
  const [lat, lon] = (l.position ?? "").split(",").map((n) => (n.trim() ? Number(n) : NaN));
  const name = str(l.name) ?? str(item.venue?.name);
  if (!name && !str(l.street_name)) return null;
  return {
    name,
    address: str(l.street_name),
    city: str(l.city),
    postalCode: str(l.postal_code),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

/**
 * Every event on a page that this answer is the one for (`from`): "events" what lasts less than a
 * day, not a timed-entry slot or a rink's session; "discovery" what lasts longer, not a series (its
 * dates come from "events") or a membership. Not one behind a password. More than half of a page that can't be read is an error (the step fails, and
 * yesterday's stay up), not an empty page.
 */
export function parseShowpass(page: SpPage, source: string, from: "events" | "discovery"): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  let unreadable = 0;
  for (const item of page.results) {
    const id = item?.id ?? item?.item_id;
    const title = str(item?.name);
    const startMs = item?.starts_on ? Date.parse(item.starts_on) : NaN;
    if (!item || id == null || !title || !Number.isFinite(startMs)) {
      unreadable++;
      continue;
    }
    const endMs = item.ends_on ? Date.parse(item.ends_on) : NaN;
    const lasts = Number.isFinite(endMs) ? endMs - startMs : 0;
    // (not "show_on_calendar": Showpass sets it off for public games and parties too)
    if (item.is_password_protected || (item.type && item.type !== "event")) continue;
    if (from === "events" && (lasts >= DAY || item.is_attraction_child || (item.parent_event != null && lasts <= SLOT))) continue;
    if (from === "discovery" && (lasts < DAY || item.is_recurring_parent)) continue;
    // (a date and time "to be determined" still has its first and last days: a run of dinner cruises)
    const tbd = !!(item.time_to_be_determined || item.date_time_to_be_determined);
    const start = vanIso(startMs);
    const lastDay = lasts > 0 ? vanIso(endMs).slice(0, 10) : null;
    const cats = (item.categories ?? []).filter((c): c is string => typeof c === "string");
    const price = spPrices(item);
    const tags: Tag[] = price.isFree ? ["free"] : price.priceMin != null ? ["tickets"] : [];
    out.push({
      source,
      sourceEventId: String(id),
      url: web(item.frontend_details_url) ?? web(item.external_link) ?? `https://www.showpass.com/${item.slug ?? ""}/`,
      title,
      description: plainText(item.description_without_html),
      start: tbd ? start.slice(0, 10) : start,
      end: tbd ? (lastDay && lastDay > start.slice(0, 10) ? lastDay : null) : lasts > 0 ? vanIso(endMs) : null,
      allDay: tbd,
      timeTBD: tbd,
      status: /cancel/i.test(item.status ?? "") ? "cancelled" : item.sold_out || item.inventory_sold_out ? "soldout" : "scheduled",
      place: placeOf(item),
      online: !!item.virtual_event_type,
      ...price,
      category: categoryOf(cats),
      sourceCategories: cats,
      tags,
      lang: null,
      imageUrl: web(item.image_banner) ?? web(item.image),
      organizer: str(item.venue?.name),
    });
  }
  if (unreadable > page.results.length / 2) throw new Error(`${unreadable} of ${page.results.length} events on the page can't be read`);
  return out;
}
