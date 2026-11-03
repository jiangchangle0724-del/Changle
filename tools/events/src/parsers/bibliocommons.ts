// Public libraries on BiblioCommons: their own events listing, as JSON, oldest first (what's on
// now first, then what starts next). In Greater Vancouver only Vancouver's (vpl) and Richmond's
// (yourlibrary) publish events there; Burnaby, Surrey, the North Shore's and the Tri-Cities' don't
// (and "bpl" is Boston's). Library programs are free. The library's own labels decide the category
// and the tags by rule: who it's for, what kind, which language. An event given by dates alone (an
// exhibition, a scavenger hunt over a week) is all-day.
import { fromVan, vanIso } from "../time";
import type { Category, Lang, NormalizedEvent, Tag } from "../types";
import { plainText } from "./ical";

interface BcEvent {
  id: string;
  definition: {
    start: string;
    end?: string | null;
    title: string;
    description?: string | null;
    branchLocationId?: string | null;
    audienceIds?: string[];
    typeIds?: string[];
    languageIds?: string[];
    featuredImageId?: string | null;
    isCancelled?: boolean | null;
  };
}
interface BcLocation {
  id: string;
  name: string;
  address?: { number?: string; street?: string; city?: string; zip?: string } | null;
  mapLocation?: { centrePoint?: { lat?: number; lng?: number } | null } | null;
}
export interface BcPage {
  events: { results?: string[]; items?: string[]; pagination?: { page: number; pages: number } };
  entities: {
    events: Record<string, BcEvent>;
    locations?: Record<string, BcLocation>;
    eventAudiences?: Record<string, { name: string }>;
    eventTypes?: Record<string, { name: string }>;
    eventLanguages?: Record<string, { name: string }>;
    images?: Record<string, { url?: string }>;
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const KIDS = /baby|babies|toddler|preschool|school age|tween|family|children|kids/i;
const NEWCOMERS = /newcomer|esl/i;

/** The library's types and audiences to one of the 8 categories, or null (left to the AI). */
export function categoryOf(types: string[], audiences: string[]): Category | null {
  if (types.some((t) => /storytime/i.test(t)) || (audiences.length > 0 && audiences.every((a) => KIDS.test(a)))) return "family";
  if (types.some((t) => /performing arts/i.test(t))) return "shows";
  if (types.some((t) => /film|author|talks|arts & culture|indigenous|book club|writing/i.test(t))) return "arts";
  if (types.some((t) => /meetup|games/i.test(t))) return "social";
  return null;
}

export interface BcOptions {
  source: string;
  /** "vpl": the library's BiblioCommons name, for the event links. */
  library: string;
}

export function parseBiblioCommons(page: BcPage, opts: BcOptions): NormalizedEvent[] {
  const e = page.entities;
  const ids = page.events.results ?? page.events.items ?? [];
  const out: NormalizedEvent[] = [];
  for (const id of ids) {
    const ev = e.events[id];
    if (!ev) continue;
    const d = ev.definition;
    const startMs = fromVan(d.start);
    if (!Number.isFinite(startMs)) continue;
    const endMs = d.end ? fromVan(d.end) : NaN;
    // dates only ("2026-10-28" to "2026-11-03"): all-day, the end its last day
    const datesOnly = DATE_ONLY.test(d.start.trim());
    const names = (ids: string[] | undefined, table: Record<string, { name: string }> | undefined) => (ids ?? []).map((x) => table?.[x]?.name).filter((x): x is string => !!x);
    const audiences = names(d.audienceIds, e.eventAudiences);
    const types = names(d.typeIds, e.eventTypes);
    const languages = names(d.languageIds, e.eventLanguages);
    const loc = d.branchLocationId ? e.locations?.[d.branchLocationId] : undefined;
    const online = d.branchLocationId === "BC_VIRTUAL";
    const chinese = languages.some((l) => /chinese|mandarin|cantonese/i.test(l));
    const english = languages.length === 0 || languages.some((l) => /english/i.test(l));
    const lang: Lang = chinese ? (english && languages.length > 1 ? "both" : "zh") : "en";
    const tags: Tag[] = ["free"];
    if (audiences.some((a) => KIDS.test(a))) tags.push("kids");
    if (audiences.some((a) => NEWCOMERS.test(a))) tags.push("newcomers");
    if (chinese) tags.push("chinese");
    if (!online) tags.push("indoor");
    const a = loc?.address;
    out.push({
      source: opts.source,
      sourceEventId: ev.id,
      url: `https://${opts.library}.bibliocommons.com/events/${ev.id}`,
      title: d.title.trim(),
      description: plainText(d.description),
      start: datesOnly ? d.start.trim() : vanIso(startMs),
      end: datesOnly ? (d.end && DATE_ONLY.test(d.end.trim()) ? d.end.trim() : null) : Number.isFinite(endMs) ? vanIso(endMs) : null,
      allDay: datesOnly,
      status: d.isCancelled ? "cancelled" : "scheduled",
      place: online || !loc
        ? null
        : {
            name: loc.name,
            address: a ? [a.number, a.street].filter(Boolean).join(" ") || null : null,
            city: a?.city ?? null,
            postalCode: a?.zip ?? null,
            lat: loc.mapLocation?.centrePoint?.lat ?? null,
            lon: loc.mapLocation?.centrePoint?.lng ?? null,
          },
      online,
      priceMin: 0,
      priceMax: 0,
      isFree: true,
      category: categoryOf(types, audiences),
      sourceCategories: [...types, ...audiences],
      tags,
      lang,
      imageUrl: d.featuredImageId ? (e.images?.[d.featuredImageId]?.url ?? null) : null,
      organizer: loc?.name ?? null,
    });
  }
  return out;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Is this (parsed JSON) an events page the parser can read: the listing (ids, paging) and, when it
 * lists any, the events by id? For a page handed over from outside (src/handoff.ts).
 */
export function isBcPage(x: unknown): x is BcPage {
  if (!isObject(x) || !isObject(x.events) || !isObject(x.entities)) return false;
  const ids = x.events.results ?? x.events.items;
  if (ids !== undefined && !(Array.isArray(ids) && ids.every((id) => typeof id === "string"))) return false;
  if (Array.isArray(ids) && ids.length > 0 && !isObject(x.entities.events)) return false;
  const p = x.events.pagination;
  return p === undefined || (isObject(p) && typeof p.page === "number" && typeof p.pages === "number");
}

/** The last event's start on a page (the listing is oldest first): past the window, stop paging. */
export function lastStartMs(page: BcPage): number {
  const ids = page.events.results ?? page.events.items ?? [];
  const last = ids.length ? page.entities.events[ids[ids.length - 1]] : undefined;
  return last ? fromVan(last.definition.start) : NaN;
}
