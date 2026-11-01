// 玩什么 · What's On: the contract every part works to (task A1). Parsers turn a source's raw
// response into NormalizedEvent[]; the run stores them (venues, events), logs every step
// (FetchLog) and publishes the next 14 days (PublicEvent[]). Fields follow schema.org/Event:
// startDate, endDate, eventStatus, location, offers, organizer. CONTRACTS.md says the rules.

/** The 8 categories. Each event is in exactly one. */
export const CATEGORIES = ["social", "shows", "food", "outdoors", "arts", "festivals", "family", "nightlife"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * The 7 areas of Greater Vancouver. vancouver: the City (West Side, East Side, Downtown);
 * surrey: with White Rock; north-shore: North and West Vancouver; tri-cities: Coquitlam, Port
 * Coquitlam, Port Moody and New Westminster; langley: Langley and the Fraser Valley.
 */
export const AREAS = ["vancouver", "richmond", "burnaby", "surrey", "north-shore", "tri-cities", "langley"] as const;
export type Area = (typeof AREAS)[number];

/** The 9 tags. The pipeline may set the first 8; "featured" (本周推荐) only Steve sets. */
export const TAGS = ["free", "chinese", "students", "newcomers", "kids", "indoor", "outdoor", "tickets", "featured"] as const;
export type Tag = (typeof TAGS)[number];

/** schema.org eventStatus, plus sold out (from the offers). Cancelled ones never show. */
export type EventStatus = "scheduled" | "cancelled" | "postponed" | "rescheduled" | "soldout";

/** The language an event is held in. */
export type Lang = "en" | "zh" | "both";

/** Where an event is, as its source says (schema.org location). Becomes a Venue when stored. */
export interface Place {
  name: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lon?: number | null;
}

/**
 * One event as a parser hands it over: facts from the source, nothing guessed. A recurring event
 * is one NormalizedEvent per date (RRULE expanded within the window).
 *
 * Times: `start` and `end` are Vancouver wall-clock time with the offset in force that day,
 * "2026-11-01T19:30:00-07:00" (src/time.ts makes them). An all-day event has a date only,
 * "2026-11-01", and `allDay: true`; one with no time yet has its date, `allDay: true` and
 * `timeTBD: true`.
 */
export interface NormalizedEvent {
  /** The source's id (Source.id). */
  source: string;
  /** The source's own id for it (Ticketmaster's id, the iCal UID; for a recurrence, UID@date). */
  sourceEventId: string;
  /** The organiser's page: where "去主办方页面" goes. */
  url: string;
  /** As the source has it, never translated or tidied. */
  title: string;
  /** Plain text (no HTML), at most 600 characters. Only for the AI's summary; never shown. */
  description?: string | null;
  start: string;
  end?: string | null;
  allDay?: boolean;
  timeTBD?: boolean;
  status: EventStatus;
  place: Place | null;
  online?: boolean;
  /** CAD. Unknown stays null: never guessed. */
  priceMin?: number | null;
  priceMax?: number | null;
  /** True only when the source says the price is 0. */
  isFree?: boolean | null;
  /** When the source's own labels map to one by rule (Ticketmaster's segment and genre); else left to the AI. */
  category?: Category | null;
  /** The source's labels as they are (Ticketmaster segment/genre, a library's audience and type). */
  sourceCategories?: string[];
  /** Tags the source makes certain (a library event: free; its audience: kids). */
  tags?: Tag[];
  lang?: Lang | null;
  imageUrl?: string | null;
  organizer?: string | null;
}

/** A place, looked up once and reused (venues table). */
export interface Venue {
  /** "v-" and a hash of the normalised name and the postal code (or the rounded coordinates). */
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lon: number | null;
  area: Area | null;
  /** Couldn't tell where it is: shown in Vancouver for now, flagged "待确认". */
  areaCheck: boolean;
}

/** Where events come from (src/sources/index.ts). */
export interface Source {
  id: string;
  /** Shown on each card as where it came from. */
  name: string;
  kind: "ical" | "ticketmaster" | "bibliocommons" | "jsonld" | "rss";
  /** What is fetched (without any key). */
  url: string;
  /** 1 official API or feed, 2 structured data on pages, 3 articles, 4 the Chinese community. */
  tier: 1 | 2 | 3 | 4;
  /** The secret it can't run without; skipped (and logged) until it's set. */
  needs?: "TICKETMASTER_KEY";
  /** The language its events are usually in. */
  lang?: Lang;
}

/** One step of a run: one source, one page or part (fetch_log table). */
export interface FetchLog {
  /** The run: its Vancouver date, "2026-11-01". */
  runId: string;
  source: string;
  part: number;
  /** ISO, UTC. */
  startedAt: string;
  /** Wall time of the step. */
  ms: number;
  httpStatus: number | null;
  /** The source said nothing changed (304). */
  notModified: boolean;
  bytes: number;
  /** Where the raw response is kept (KV, 30 days). */
  rawKey: string | null;
  /** Events the parser read, and how many of them fall in the next 14 days. */
  found: number;
  inWindow: number;
  added: number;
  updated: number;
  error: string | null;
}

/** What the page and the API get: the next 14 days, one entry per event (KV "events:live"). */
export interface PublicEvent {
  id: string;
  title: string;
  summaryZh: string | null;
  summaryEn: string | null;
  start: string;
  end: string | null;
  allDay: boolean;
  timeTBD: boolean;
  status: EventStatus;
  venue: string | null;
  address: string | null;
  area: Area | null;
  areaCheck: boolean;
  category: Category | null;
  tags: Tag[];
  priceMin: number | null;
  isFree: boolean | null;
  lang: Lang | null;
  url: string;
  imageUrl: string | null;
  sourceName: string;
  featured: boolean;
  updatedAt: string;
}

/** The published file: when it was made and what's in it. */
export interface Published {
  runId: string;
  generatedAt: string;
  from: string;
  to: string;
  count: number;
  events: PublicEvent[];
}
