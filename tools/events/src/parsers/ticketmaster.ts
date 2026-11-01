// Ticketmaster's Discovery API: concerts, games and theatre at Rogers Arena, BC Place, the Orpheum,
// the Queen Elizabeth. A first version; task C3 hardens it (the full category table, every status,
// price ranges, a saved response as the fixture). Its own classification decides the category.
import { vanIso } from "../time";
import type { Category, EventStatus, NormalizedEvent } from "../types";

interface TmEvent {
  id: string;
  name: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string; dateTBD?: boolean; dateTBA?: boolean; timeTBA?: boolean; noSpecificTime?: boolean };
    end?: { dateTime?: string };
    status?: { code?: string };
  };
  classifications?: { segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  images?: { url: string; width?: number; ratio?: string }[];
  _embedded?: {
    venues?: { name?: string; address?: { line1?: string }; city?: { name?: string }; postalCode?: string; location?: { latitude?: string; longitude?: string } }[];
  };
}
export interface TmPage {
  _embedded?: { events?: TmEvent[] };
  page?: { number: number; totalPages: number };
}

const STATUS: Record<string, EventStatus> = { onsale: "scheduled", offsale: "soldout", canceled: "cancelled", cancelled: "cancelled", postponed: "postponed", rescheduled: "rescheduled" };

/** Ticketmaster's segment and genre to one of the 8 categories. */
export function tmCategory(segment?: string, genre?: string): Category | null {
  const g = (genre ?? "").toLowerCase();
  if (/festival/.test(g)) return "festivals";
  if (/comedy|theatre|musical|magic|dance/.test(g)) return "shows";
  if (/family|children/.test(g)) return "family";
  if (/fine art|museum|film/.test(g)) return "arts";
  switch ((segment ?? "").toLowerCase()) {
    case "music":
      return "shows";
    case "sports":
      return "outdoors";
    case "arts & theatre":
      return "shows";
    case "film":
      return "arts";
    default:
      return null;
  }
}

export function parseTicketmaster(page: TmPage, source: string): { events: NormalizedEvent[]; more: boolean } {
  const events: NormalizedEvent[] = [];
  for (const ev of page._embedded?.events ?? []) {
    const st = ev.dates?.start;
    if (!st?.localDate) continue;
    const timeless = !st.dateTime || st.timeTBA || st.noSpecificTime || st.dateTBD || st.dateTBA;
    const cls = ev.classifications?.[0];
    const venue = ev._embedded?.venues?.[0];
    const prices = (ev.priceRanges ?? []).filter((p) => !p.currency || p.currency === "CAD");
    const priceMin = prices.length ? Math.min(...prices.map((p) => p.min ?? Infinity)) : null;
    const priceMax = prices.length ? Math.max(...prices.map((p) => p.max ?? 0)) : null;
    const image = (ev.images ?? []).filter((i) => i.ratio === "16_9").sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    events.push({
      source,
      sourceEventId: ev.id,
      url: ev.url ?? `https://www.ticketmaster.ca/event/${ev.id}`,
      title: ev.name.trim(),
      description: [ev.info, ev.pleaseNote].filter(Boolean).join("\n").slice(0, 600) || null,
      start: timeless ? st.localDate : vanIso(Date.parse(st.dateTime!)),
      end: ev.dates?.end?.dateTime ? vanIso(Date.parse(ev.dates.end.dateTime)) : null,
      allDay: !!timeless,
      timeTBD: !!timeless,
      status: STATUS[(ev.dates?.status?.code ?? "onsale").toLowerCase()] ?? "scheduled",
      place: venue
        ? {
            name: venue.name ?? null,
            address: venue.address?.line1 ?? null,
            city: venue.city?.name ?? null,
            postalCode: venue.postalCode ?? null,
            lat: venue.location?.latitude ? Number(venue.location.latitude) : null,
            lon: venue.location?.longitude ? Number(venue.location.longitude) : null,
          }
        : null,
      priceMin: Number.isFinite(priceMin) ? priceMin : null,
      priceMax: Number.isFinite(priceMax) && priceMax ? priceMax : null,
      isFree: priceMax === 0 ? true : null,
      category: tmCategory(cls?.segment?.name, cls?.genre?.name),
      sourceCategories: [cls?.segment?.name, cls?.genre?.name, cls?.subGenre?.name].filter((x): x is string => !!x && x !== "Undefined"),
      tags: ["tickets", "indoor"].filter((t) => t !== "indoor" || !/park|stadium|field/i.test(venue?.name ?? "")) as NormalizedEvent["tags"],
      lang: "en",
      imageUrl: image?.url ?? null,
      organizer: null,
    });
  }
  const p = page.page;
  return { events, more: !!p && p.number + 1 < p.totalPages };
}
