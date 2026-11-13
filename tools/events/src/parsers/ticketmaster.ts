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
    end?: { localDate?: string; dateTime?: string };
    status?: { code?: string };
  };
  classifications?: { primary?: boolean; segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }[];
  priceRanges?: { type?: string; min?: number; max?: number; currency?: string }[];
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

/** A real calendar date, so all-day start/end values also work with store.endMs. */
function localDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? value : null;
}

function coordinate(value: unknown): number | null {
  if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function positivePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function parseTicketmaster(page: TmPage, source: string): { events: NormalizedEvent[]; more: boolean } {
  // An error response must fail the source, not mark it read with zero events.
  if (!page || (!page._embedded && !page.page)) throw new Error("Invalid Ticketmaster events page");
  const entries = page._embedded?.events ?? [];
  if (!Array.isArray(entries)) throw new Error("Invalid Ticketmaster events page");
  const events: NormalizedEvent[] = [];
  let unreadable = 0;
  for (const ev of entries) {
    try {
      if (typeof ev?.id !== "string" || !ev.id.trim() || typeof ev.name !== "string" || !ev.name.trim()) {
        unreadable++;
        continue;
      }
      const st = ev.dates?.start;
      // Missing dates are an intentional skip; a supplied but invalid date is unreadable.
      if (!st || st.localDate == null || st.localDate === "") continue;
      const day = localDate(st.localDate);
      if (!day) {
        unreadable++;
        continue;
      }
      const startAt = typeof st.dateTime === "string" ? Date.parse(st.dateTime) : NaN;
      const timeless = !Number.isFinite(startAt) || st.timeTBA || st.noSpecificTime || st.dateTBD || st.dateTBA;
      let end: string | null = null;
      if (timeless) {
        const endDay = localDate(ev.dates?.end?.localDate);
        if (endDay && endDay > day) end = endDay;
      } else {
        const endAt = Date.parse(ev.dates?.end?.dateTime ?? "");
        if (Number.isFinite(endAt) && endAt > startAt) end = vanIso(endAt);
      }
      const classifications = Array.isArray(ev.classifications) ? ev.classifications : [];
      const cls = classifications.find((c) => c?.primary) ?? classifications[0];
      const venue = ev._embedded?.venues?.[0];
      const prices = Array.isArray(ev.priceRanges) ? ev.priceRanges : [];
      const hasStandard = prices.some((p) => p?.currency === "CAD" && p.type === "standard" && (positivePrice(p.min) || positivePrice(p.max)));
      let priceMin: number | null = null;
      let priceMax: number | null = null;
      for (const p of prices) {
        if (!p || p.currency !== "CAD" || (hasStandard && p.type !== "standard")) continue;
        // Zero is Ticketmaster's unspecified bound, including one-sided zero ranges.
        if (positivePrice(p.min)) priceMin = Math.min(priceMin ?? Infinity, p.min);
        if (positivePrice(p.max)) priceMax = Math.max(priceMax ?? -Infinity, p.max);
      }
      let image: NonNullable<TmEvent["images"]>[number] | undefined;
      for (const candidate of Array.isArray(ev.images) ? ev.images : []) {
        if (candidate?.ratio === "16_9" && (!image || (candidate.width ?? 0) > (image.width ?? 0))) image = candidate;
      }
      const status = (ev.dates?.status?.code ?? "onsale").toLowerCase();
      events.push({
        source,
        sourceEventId: ev.id,
        url: ev.url ?? `https://www.ticketmaster.ca/event/${ev.id}`,
        title: ev.name,
        description: plainText([ev.info, ev.pleaseNote].filter(Boolean).join("\n")),
        start: timeless ? day : vanIso(startAt),
        end,
        allDay: !!timeless,
        timeTBD: !!timeless,
        status: Object.hasOwn(STATUS, status) ? STATUS[status] : "scheduled",
        place: venue
          ? {
              name: stringOrNull(venue.name),
              address: stringOrNull(venue.address?.line1),
              city: stringOrNull(venue.city?.name),
              postalCode: stringOrNull(venue.postalCode),
              lat: coordinate(venue.location?.latitude),
              lon: coordinate(venue.location?.longitude),
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
    } catch {
      unreadable++;
    }
  }
  // Fail the source on widespread bad data so yesterday's events are retained.
  if (unreadable > entries.length / 2) throw new Error("Invalid Ticketmaster events page");
  const p = page.page;
  return { events, more: !!p && p.number + 1 < p.totalPages };
}
