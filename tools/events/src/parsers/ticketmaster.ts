// Ticketmaster's Discovery API: concerts, games and theatre at Rogers Arena, BC Place, the Orpheum,
// the Queen Elizabeth. Only its own segment/genre labels decide the category (task C3).
import { vanIso } from "../time";
import type { Category, EventStatus, NormalizedEvent } from "../types";
import { plainText } from "./ical";

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
  switch ((segment ?? "").toLowerCase()) {
    case "music":
      return "shows";
    case "sports":
      return "outdoors";
    case "arts & theatre":
      if (g === "children's theatre" || g === "family" || g === "circus & specialty acts") return "family";
      if (g === "fine art" || g === "film") return "arts";
      return "shows";
    case "film":
      return "arts";
    case "miscellaneous":
      if (g === "family") return "family";
      if (g === "fairs & festivals") return "festivals";
      if (g === "food & drink") return "food";
      return null;
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
    let priceMin: number | null = null;
    let priceMax: number | null = null;
    for (const p of ev.priceRanges ?? []) {
      // Ticketmaster uses 0–0 for an unspecified price, not a free ticket.
      if (p.currency !== "CAD" || (p.min === 0 && p.max === 0)) continue;
      if (typeof p.min === "number" && Number.isFinite(p.min)) priceMin = Math.min(priceMin ?? Infinity, p.min);
      if (typeof p.max === "number" && Number.isFinite(p.max)) priceMax = Math.max(priceMax ?? -Infinity, p.max);
    }
    let image: NonNullable<TmEvent["images"]>[number] | undefined;
    for (const candidate of ev.images ?? []) {
      if (candidate.ratio === "16_9" && (!image || (candidate.width ?? 0) > (image.width ?? 0))) image = candidate;
    }
    const status = (ev.dates?.status?.code ?? "onsale").toLowerCase();
    events.push({
      source,
      sourceEventId: ev.id,
      url: ev.url ?? `https://www.ticketmaster.ca/event/${ev.id}`,
      title: ev.name,
      description: plainText([ev.info, ev.pleaseNote].filter(Boolean).join("\n")),
      start: timeless ? st.localDate : vanIso(Date.parse(st.dateTime!)),
      end: ev.dates?.end?.dateTime ? vanIso(Date.parse(ev.dates.end.dateTime)) : null,
      allDay: !!timeless,
      timeTBD: !!timeless,
      status: Object.hasOwn(STATUS, status) ? STATUS[status] : "scheduled",
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
      priceMin,
      priceMax,
      isFree: null,
      category: tmCategory(cls?.segment?.name, cls?.genre?.name),
      sourceCategories: [cls?.segment?.name, cls?.genre?.name, cls?.subGenre?.name].filter((x): x is string => !!x && x !== "Undefined"),
      tags: ["tickets"],
      lang: "en",
      imageUrl: image?.url ?? null,
      organizer: null,
    });
  }
  const p = page.page;
  return { events, more: !!p && p.number + 1 < p.totalPages };
}
