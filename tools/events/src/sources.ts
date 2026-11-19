// Where the events come from, and how each is fetched and read, part by part (a page of a listing).
// Adding a source: an entry here, a parser in src/parsers/, a saved response in tests/fixtures/.
import { parseBiblioCommons, lastStartMs, type BcPage } from "./parsers/bibliocommons";
import { parseBpl, type BplFeed } from "./parsers/bpl";
import { parseIcal } from "./parsers/ical";
import { isLwPage, parseLiveWhale } from "./parsers/livewhale";
import { parseTicketmaster, type TmPage } from "./parsers/ticketmaster";
import { fromVan, vanIso } from "./time";
import type { NormalizedEvent, Source } from "./types";

export interface Window {
  runId: string;
  fromMs: number;
  toMs: number;
}

export interface Parsed {
  events: NormalizedEvent[];
  more: boolean;
}

/** What a source's request needs from the Worker's settings: its key, if it has one. */
export type RequestEnv = Pick<Env, "TICKETMASTER_KEY">;

export interface SourceDef extends Source {
  /** The URL for part `part` (a page), with any key; never logged. */
  request(part: number, env: RequestEnv, w: Window): string;
  /** Read one part. `more`: there's a next part worth fetching. (May be async: HTMLRewriter is.) */
  parse(raw: string, part: number, w: Window): Parsed | Promise<Parsed>;
  /** At most this many parts in a run. */
  maxParts: number;
  /**
   * The site refuses the Worker's requests: each morning a GitHub job reads its parts before the
   * run, with the same requests, and hands them over (src/handoff.ts). The run reads those, and asks
   * the site itself only for a part nothing was handed over for. (BiblioCommons pages only, for now.)
   */
  handoff?: boolean;
}

/** Who's asking, for the sites we read (they can see it's us, and how to reach us). */
export const USER_AGENT = "changle.ca events (+https://changle.ca/go)";
/** Larger answers than this are refused, not read into memory. */
export const MAX_BYTES = 6_000_000;

/**
 * How a part is asked for: its URL and the headers every request sends. The run's steps ask with
 * it, and so does the GitHub job that reads the libraries for the run (src/handoff.ts).
 */
export function requestOf(src: SourceDef, part: number, env: RequestEnv, w: Window): { url: string; headers: Record<string, string> } {
  return { url: src.request(part, env, w), headers: { "user-agent": USER_AGENT, accept: "application/json, text/calendar, text/html;q=0.8, */*;q=0.5" } };
}

/** The part to read after this one: when the parser says there's more and the source allows another. */
export function nextPart(src: SourceDef, part: number, more: boolean): number | null {
  return more && part + 1 < src.maxParts ? part + 1 : null;
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const DAY = 86_400_000;
/** "2026-11-01": a Vancouver date, for the sources that take one. */
const vanDay = (ms: number) => vanIso(ms).slice(0, 10);

/**
 * A public library's events on BiblioCommons (`lib`: its name there). 25 a page keeps a step well
 * inside its 10 ms of CPU (a page is 250 to 420 KB of JSON); two weeks is 7 to 12 pages. (It serves
 * at most 50 a page whatever the limit: never ask for more.) BiblioCommons has answered 403 to the
 * Worker since its first live run (2 November 2026), and 200 to the same request from anywhere else:
 * a GitHub job reads these pages at 05:50 and hands them over (src/handoff.ts).
 */
function library(id: string, name: string, lib: string): SourceDef {
  return {
    id,
    name,
    kind: "bibliocommons",
    tier: 1,
    lang: "en",
    url: `https://gateway.bibliocommons.com/v2/libraries/${lib}/events/search`,
    maxParts: 24,
    handoff: true,
    request(part) {
      return `${this.url}?limit=25&page=${part + 1}`;
    },
    parse(raw, _part, w) {
      const page = JSON.parse(raw) as BcPage;
      const events = parseBiblioCommons(page, { source: this.id, library: lib });
      const p = page.events.pagination;
      const more = !!p && p.page < p.pages && lastStartMs(page) < w.toMs;
      return { events, more };
    },
  };
}

export const SOURCES: SourceDef[] = [
  {
    id: "luma-vancouver",
    name: "Luma",
    kind: "ical",
    tier: 1,
    lang: "en",
    url: "https://api.lu.ma/ics/get?entity=discover&id=discplace-4fa7ldlAkBTTivm",
    maxParts: 1,
    request() {
      return this.url;
    },
    parse(raw, _part, w) {
      const events = parseIcal(raw, { source: this.id, fromMs: w.fromMs, toMs: w.toMs }).map(luma);
      return { events, more: false };
    },
  },
  library("vpl", "Vancouver Public Library", "vpl"),
  library("rpl", "Richmond Public Library", "yourlibrary"),
  {
    // Burnaby's library has its own feed (on BiblioCommons, "bpl" is Boston's): the season's
    // programs in one answer, 220 KB on 1 November, read in about 2 ms (task C12)
    id: "bpl",
    name: "Burnaby Public Library",
    kind: "json",
    tier: 1,
    lang: "en",
    url: "https://bpl.bc.ca/events.json",
    maxParts: 1,
    request() {
      return this.url;
    },
    parse(raw) {
      return { events: parseBpl(JSON.parse(raw) as BplFeed, this.id), more: false };
    },
  },
  {
    id: "ubc",
    name: "UBC",
    kind: "ical",
    tier: 1,
    lang: "en",
    url: "https://events.ubc.ca/events/list/?ical=1",
    // its export lists about 30 events from a date on: two days of the window at a time, until an
    // answer reaches past the window (or is empty)
    maxParts: 7,
    request(part, _env, w) {
      return `${this.url}&tribe-bar-date=${vanDay(w.fromMs + part * UBC_DAYS * DAY)}`;
    },
    parse(raw, _part, w) {
      const all = parseIcal(raw, { source: this.id, fromMs: w.fromMs, toMs: w.toMs });
      const last = Math.max(...all.map((e) => (e.allDay ? fromVan(e.start) : Date.parse(e.start))));
      return { events: ubcOpen(raw, all), more: all.length > 0 && last < w.toMs };
    },
  },
  {
    // SFU's calendar (LiveWhale): its three campuses and its arts school downtown. Kept, as for UBC,
    // only what anyone can walk into (sfuOpen). About 180 events in two weeks, 50 a page: 4 pages.
    id: "sfu",
    name: "SFU",
    kind: "json",
    tier: 1,
    lang: "en",
    url: "https://events.sfu.ca/live/json/v2/events",
    maxParts: 8,
    request(part, _env, w) {
      return `${this.url}/start_date/${vanDay(w.fromMs)}/end_date/${vanDay(w.toMs - 1)}/paginate/50/response_fields/event_types,location,summary,group_title?page=${part + 1}`;
    },
    parse(raw) {
      const page = JSON.parse(raw) as unknown;
      // anything else that answers 200 (an error, a sign-in page) is a failed step, not an empty day
      if (!isLwPage(page)) throw new Error("not a LiveWhale events page");
      return { events: sfuOpen(parseLiveWhale(page, this.id)), more: page.meta.page < page.meta.total_pages };
    },
  },
  {
    id: "ticketmaster",
    name: "Ticketmaster",
    kind: "ticketmaster",
    tier: 1,
    lang: "en",
    needs: "TICKETMASTER_KEY",
    // The 7 areas, Abbotsford, Mission and Chilliwack included: 60 km round a point between Surrey
    // and Langley, in Canada only (no Blaine, Point Roberts or Bellingham). It reaches Bowen Island
    // and Lions Bay but not Squamish, the Sunshine Coast or Nanaimo. (40 km round downtown missed
    // Abbotsford's arenas, 62 km out, and took in Gibsons.)
    url: "https://app.ticketmaster.com/discovery/v2/events.json?latlong=49.15,-122.75&radius=60&unit=km&countryCode=CA&sort=date,asc&locale=*&size=200",
    // (Ticketmaster serves at most 1,000 results per search: five pages of 200)
    maxParts: 5,
    request(part, env, w) {
      return `${this.url}&startDateTime=${iso(w.fromMs)}&endDateTime=${iso(w.toMs)}&page=${part}&apikey=${encodeURIComponent(env.TICKETMASTER_KEY ?? "")}`;
    },
    parse(raw) {
      const { events, more } = parseTicketmaster(JSON.parse(raw) as TmPage, this.id);
      return { events, more };
    },
  },
];

export const SOURCE_BY_ID: Record<string, SourceDef> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

/**
 * Luma's feed: the page to send people to is the first line of the description ("Get up-to-date
 * information at: https://luma.com/..."), then "Address:" and the place; the rest is the host's.
 */
function luma(ev: NormalizedEvent): NormalizedEvent {
  const d = ev.description ?? "";
  const link = /Get up-to-date information at:\s*(https?:\/\/\S+)/.exec(d)?.[1];
  const description = d
    .replace(/^Get up-to-date information at:\s*\S+\s*/, "")
    .replace(/^Address:\s*\n[^\n]*\n?/, "")
    .trim();
  return { ...ev, url: link ?? ev.url, description: description || null, tags: ev.tags ?? [], lang: ev.lang ?? null };
}

const UBC_DAYS = 2;

/**
 * UBC's calendar has everything from thesis defences to staff training. What's On keeps what anyone
 * can walk into (Steve, 1 November 2026): an audience of "All" or "Community" (UBC tags each event),
 * at a real place on the Vancouver campus, not online, hybrid, "See Description" or in the
 * Okanagan. That also leaves out the courses for doctors and nurses (UBC CPD), which name no
 * audience. The audiences aren't in the parsed events, so they're read from the file by UID.
 */
export function ubcOpen(raw: string, events: NormalizedEvent[]): NormalizedEvent[] {
  const open = new Set<string>();
  for (const block of raw.replace(/\r?\n[ \t]/g, "").split(/^BEGIN:VEVENT\s*$/m).slice(1)) {
    const uid = /^UID:(.+)$/m.exec(block)?.[1]?.trim();
    const categories = [...block.matchAll(/^CATEGORIES[^:]*:(.+)$/gm)].flatMap((m) => m[1].split(/(?<!\\),/));
    const everyone = categories.some((c) => /^audience\s*[-\u2013\u2014]\s*(all|community)$/i.test(c.trim()));
    if (uid && everyone) open.add(uid);
  }
  return events
    .filter((e) => open.has(e.sourceEventId.replace(/@\d{4}-\d{2}-\d{2}$/, "")))
    .filter((e) => {
      const where = [e.place?.name, e.place?.address].filter(Boolean).join(", ");
      return !!e.place && !/^(online|hybrid|see description)/i.test(e.place.name ?? "") && !/kelowna|okanagan/i.test(where);
    })
    .map((e) => (e.place && !e.place.city && /\bvancouver\b/i.test(e.place.address ?? "") ? { ...e, place: { ...e.place, city: "Vancouver" } } : e));
}

const SFU_CAMPUS: Record<string, string> = { "SFU Burnaby Campus": "Burnaby", "SFU Vancouver Campus": "Vancouver", "SFU Surrey Campus": "Surrey" };
/** Not something to walk into, whoever SFU says may come. */
const SFU_CLOSED = /^(info sessions?|dates & deadlines|services for students)$/i;
/** A thesis defence is closed too, unless it's an artist's: a screening, a show, an exhibition. */
const SFU_ARTS = /^(arts & culture|visual arts?|exhibits?|film|music|dance|theatre|multimedia)$/i;
/** Off campus, but not in Greater Vancouver ("Access MBA Calgary"). */
const SFU_AWAY = /\b(calgary|edmonton|toronto|montr[eé]al|ottawa|victoria|kelowna|nanaimo|kamloops|seattle)\b/i;

/**
 * SFU's calendar has everything from thesis defences to student services. What's On keeps, as it
 * does UBC's, what anyone can walk into: SFU's own audience "Public", at a real place (not online or
 * hybrid) in Greater Vancouver, and none of its info sessions, deadlines, student services or
 * thesis defences (but an art student's thesis show or screening is open). A place that names no
 * city gets its campus's ("SFU Burnaby Campus": Burnaby).
 */
export function sfuOpen(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.flatMap((e) => {
    const labels = e.sourceCategories ?? [];
    if (!labels.includes("Public") || labels.some((l) => SFU_CLOSED.test(l))) return [];
    if (labels.some((l) => /^thesis defences?$/i.test(l)) && !labels.some((l) => SFU_ARTS.test(l))) return [];
    if (e.online || !e.place?.name) return [];
    const where = [e.place.name, e.place.address].filter(Boolean).join(", ");
    if (SFU_AWAY.test(where)) return [];
    const campuses = labels.filter((l) => Object.hasOwn(SFU_CAMPUS, l));
    const named = /\b(Burnaby|Surrey|Vancouver)\b/.exec(where)?.[1] ?? null;
    const city = e.place.city ?? (campuses.length === 1 ? SFU_CAMPUS[campuses[0]] : named);
    return [{ ...e, place: { ...e.place, city } }];
  });
}
