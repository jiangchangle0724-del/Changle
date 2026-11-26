// Where the events come from, and how each is fetched and read, part by part (a page of a listing).
// Adding a source: an entry here, a parser in src/parsers/, a saved response in tests/fixtures/.
import { parseBiblioCommons, lastStartMs, type BcPage } from "./parsers/bibliocommons";
import { parseBpl, type BplFeed } from "./parsers/bpl";
import { parseIcal } from "./parsers/ical";
import { isLwPage, parseLiveWhale } from "./parsers/livewhale";
import { isSpPage, parseShowpass } from "./parsers/showpass";
import { isEbPage, parseEventbrite } from "./parsers/eventbrite";
import { parseCapu, parseDouglas, parseLangara, parseVcc, vccList } from "./parsers/schools";
import { readCapped } from "./body";
import { parseSidearm } from "./parsers/sidearm";
import { followedOrganizations } from "./follows";
import { parseTicketmaster, type TmPage } from "./parsers/ticketmaster";
import { resolveArea } from "./area";
import { addDays, fromVan, vanIso, vanParts } from "./time";
import type { Category, NormalizedEvent, Source } from "./types";

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
export type RequestEnv = Pick<Env, "TICKETMASTER_KEY" | "EVENTBRITE_TOKEN">;

export interface SourceDef extends Source {
  /** The URL for part `part` (a page, or the `key`'s list), with any key; never logged. */
  request(part: number, env: RequestEnv, w: Window, key?: string): string;
  /**
   * A source read one list at a time (each organization followed on Eventbrite): what each part
   * reads, asked for at every step; part 0 may first learn what's new. Its parts are these and no more.
   */
  keys?(env: Env, part: number): Promise<string[]>;
  /** What the day's log says when `keys` has nothing to read (default "nothing to read"). */
  noKeys?: string;
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
export function requestOf(src: SourceDef, part: number, env: RequestEnv, w: Window, key?: string): { url: string; headers: Record<string, string> } {
  return { url: src.request(part, env, w, key), headers: { "user-agent": USER_AGENT, accept: "application/json, text/calendar, text/html;q=0.8, */*;q=0.5" } };
}

/** The part to read after this one: when the parser says there's more and the source allows another. */
export function nextPart(src: SourceDef, part: number, more: boolean): number | null {
  return more && part + 1 < src.maxParts ? part + 1 : null;
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
/** Ticketmaster's circle (below), kilometres: Greater Vancouver to Chilliwack, not Squamish or the Sunshine Coast. */
const SHOWPASS_CIRCLE = "49.15,-122.75,60";
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

/**
 * A university's teams on SIDEARM Sports (src/parsers/sidearm.ts): the season in one answer, 100
 * to 150 KB. Kept: what's played in Greater Vancouver, home or away (UBC at Trinity Western is in
 * Langley): anyone can buy a ticket or walk in.
 */
function athletics(id: string, name: string, site: string): SourceDef {
  return {
    id,
    name,
    kind: "ical",
    tier: 1,
    lang: "en",
    url: `${site}/calendar.ashx/calendar.ics?sport_id=0`,
    maxParts: 1,
    request() {
      return this.url;
    },
    parse(raw, _part, w) {
      return { events: here(parseSidearm(raw, { source: this.id, fromMs: w.fromMs, toMs: w.toMs, organizer: name })), more: false };
    },
  };
}

const VCC_LIST = "https://www.vcc.ca/events-category/community-event/";

/**
 * VCC's community events coming up, their pages: read from its list at part 0 (one that began up
 * to 60 days ago may still be on), and kept in KV for the day's other parts.
 */
export async function vccPages(env: Pick<Env, "CACHE">, part: number, now = Date.now()): Promise<string[]> {
  const day = vanParts(now).date;
  const kept = `vcc:pages:${day}`;
  if (part > 0) return (await env.CACHE.get<string[]>(kept, "json")) ?? [];
  const res = await fetch(VCC_LIST, { headers: { "user-agent": USER_AGENT, accept: "text/html" } });
  if (!res.ok) throw new Error(`VCC's list of community events answered ${res.status}`);
  const [from, to] = [addDays(day, -60), addDays(day, 14)];
  const pages = vccList(await readCapped(res, MAX_BYTES))
    .filter((p) => p.day >= from && p.day < to)
    .map((p) => p.url);
  await env.CACHE.put(kept, JSON.stringify(pages), { expirationTtl: 2 * 86_400 });
  return pages;
}

/** Langara's lists that What's On reads: the query, the label each event gets, its category. */
const LANGARA_LISTS: { query: string; label: string; category: Category | null }[] = [
  { query: "type=60", label: "Studio 58", category: "shows" },
  { query: "topics=153", label: "Community", category: null },
];

/** The latest start in a list (an all-day event's by its day), to tell whether the next page is worth it. */
const lastStart = (events: NormalizedEvent[]) => Math.max(...events.map((e) => (e.allDay ? fromVan(e.start) : Date.parse(e.start))));

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
      return `${this.url}/start_date/${vanDay(w.fromMs)}/end_date/${vanDay(w.toMs - 1)}/paginate/50/response_fields/event_types,location,summary,group_title,thumbnail?page=${part + 1}`;
    },
    parse(raw) {
      const page = JSON.parse(raw) as unknown;
      // anything else that answers 200 (an error, a sign-in page) is a failed step, not an empty day
      if (!isLwPage(page)) throw new Error("not a LiveWhale events page");
      return { events: sfuOpen(parseLiveWhale(page, this.id)), more: page.meta.page < page.meta.total_pages };
    },
  },
  athletics("ubc-thunderbirds", "UBC Thunderbirds", "https://gothunderbirds.ca"),
  athletics("sfu-red-leafs", "SFU Red Leafs", "https://athletics.sfu.ca"),
  {
    // Capilano University's Centre for Performing Arts (src/parsers/schools.ts): concerts, plays and
    // talks, ten a page from today on; a second page only if the first ends inside the window (one
    // page has run to mid-February). (Its robots.txt asks robots not to send "search=": never sent.)
    id: "capu",
    name: "Capilano University",
    kind: "html",
    tier: 1,
    lang: "en",
    url: "https://www.capilanou.ca/student-services/community/centre-for-performing-arts/our-events/all-events/",
    maxParts: 3,
    request(part) {
      return part ? `${this.url}?page=${part + 1}` : this.url;
    },
    parse(raw, _part, w) {
      const events = parseCapu(raw, { source: this.id, fromMs: w.fromMs });
      return { events: here(events), more: events.length >= 10 && lastStart(events) < w.toMs };
    },
  },
  {
    // Langara (src/parsers/schools.ts): two of its lists, a page each: Studio 58's plays (its
    // theatre school's, for anyone with a ticket) and what it puts on for the community (talks).
    id: "langara",
    name: "Langara College",
    kind: "html",
    tier: 1,
    lang: "en",
    url: "https://langara.ca/news-events/events",
    maxParts: LANGARA_LISTS.length,
    request(part) {
      return `${this.url}?${LANGARA_LISTS[part].query}`;
    },
    parse(raw, part) {
      const list = LANGARA_LISTS[part];
      const events = parseLangara(raw, { source: this.id, label: list.label }).map((e) => ({ ...e, category: list.category }));
      return { events: here(events), more: part + 1 < LANGARA_LISTS.length };
    },
  },
  {
    // Douglas College (src/parsers/schools.ts): its news and events by date, eight a page (two
    // weeks are a page or two). Kept (douglasOpen): its plays, concerts and gallery shows, and what
    // it says is for the community.
    id: "douglas",
    name: "Douglas College",
    kind: "html",
    tier: 1,
    lang: "en",
    url: "https://www.douglascollege.ca/about-douglas/news-and-events",
    maxParts: 4,
    request(part) {
      return part ? `${this.url}?page=${part}` : this.url;
    },
    parse(raw, _part, w) {
      const all = parseDouglas(raw, { source: this.id });
      return { events: here(douglasOpen(all)), more: all.length > 0 && lastStart(all) < w.toMs };
    },
  },
  {
    // Vancouver Community College's community events (src/parsers/schools.ts: its holiday market,
    // its students' sales, its gala): its list of them has each one's first day, and the event's
    // own page the hours and the place, one page a step (vccPages: a handful).
    id: "vcc",
    name: "Vancouver Community College",
    kind: "html",
    tier: 1,
    lang: "en",
    url: VCC_LIST,
    maxParts: 12,
    keys: (env, part) => vccPages(env, part),
    noKeys: "nothing coming up",
    request(_part, _env, _w, key) {
      return key ?? this.url;
    },
    parse(raw) {
      return { events: here(parseVcc(raw, { source: this.id })), more: true };
    },
  },
  {
    // Showpass's every date (src/parsers/showpass.ts): about 600 items in two weeks round Greater
    // Vancouver, half of them the Christmas Market's and VanDusen's half-hour slots (left out: their
    // seasons come from "showpass-season"). 20 a page, about 250 KB: a step's 10 ms of CPU.
    id: "showpass",
    name: "Showpass",
    kind: "json",
    tier: 1,
    lang: "en",
    url: `https://www.showpass.com/api/public/events/?location__point_location=${SHOWPASS_CIRCLE}`,
    maxParts: 40,
    request(part, _env, w) {
      return `${this.url}&starts_on__gte=${iso(w.fromMs)}&starts_on__lt=${iso(w.toMs)}&ordering=starts_on,id&page_size=20&page=${part + 1}`;
    },
    parse(raw) {
      const page = JSON.parse(raw) as unknown;
      if (!isSpPage(page)) throw new Error("not a Showpass page");
      return { events: showpassOpen(parseShowpass(page, this.id, "events")), more: page.next !== null };
    },
  },
  {
    // What Showpass sells for more than a day: a market's or a light show's season, a run of
    // dinners. About 350 products in two weeks, 100 a page (2 KB each); most last a day or less and
    // come from "showpass" with their dates.
    id: "showpass-season",
    name: "Showpass",
    kind: "json",
    tier: 1,
    lang: "en",
    url: `https://www.showpass.com/api/public/discovery/?location__point_location=${SHOWPASS_CIRCLE}`,
    maxParts: 6,
    request(part, _env, w) {
      return `${this.url}&ends_on__gte=${iso(w.fromMs)}&starts_on__lt=${iso(w.toMs)}&ordering=starts_on&page_size=100&page=${part + 1}`;
    },
    parse(raw) {
      const page = JSON.parse(raw) as unknown;
      if (!isSpPage(page)) throw new Error("not a Showpass page");
      return { events: showpassOpen(parseShowpass(page, this.id, "discovery")), more: page.next !== null };
    },
  },
  {
    // Eventbrite, with Steve's own token (src/follows.ts): each organization followed, one a part,
    // its public events still to come (50 a page: the soonest, more than two weeks of them)
    id: "eventbrite",
    name: "Eventbrite",
    kind: "json",
    tier: 1,
    lang: "en",
    needs: "EVENTBRITE_TOKEN",
    url: "https://www.eventbriteapi.com/v3/organizations/",
    maxParts: 60,
    keys: (env, part) => followedOrganizations(env, part === 0),
    noKeys: "nothing followed yet",
    request(_part, env, _w, key) {
      return `${this.url}${encodeURIComponent(key ?? "")}/events/?status=live&order_by=start_asc&time_filter=current_future&page_size=50&expand=venue,ticket_availability,organizer&token=${encodeURIComponent(env.EVENTBRITE_TOKEN ?? "")}`;
    },
    parse(raw) {
      const page = JSON.parse(raw) as unknown;
      if (!isEbPage(page)) throw new Error("not an Eventbrite events page");
      return { events: eventbriteOpen(parseEventbrite(page, this.id)), more: false };
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

/**
 * At a real place in Greater Vancouver: not online, and not somewhere the area can't be told (a
 * game in Victoria, a talk with no place). The colleges' sources and their teams keep only these.
 */
export function here(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.filter((e) => {
    if (e.online || !e.place) return false;
    const where = resolveArea(e.place);
    return !!where.area && !where.check && !where.outside;
  });
}

/** Not something to walk into: a ceremony, an info session, a recruiter's table, a meeting. */
const DOUGLAS_CLOSED = /\b(graduation|convocation|ceremon(y|ies)|orientation|info(rmation)? (session|fair)|tabling|meeting|workshop|study abroad)\b/i;
/** Its stages and its gallery. */
const DOUGLAS_STAGES = /\b(theatre|theater|gallery|concert hall|performing arts)\b/i;

/**
 * Douglas College tags each event with who it's for, and its theatre productions as often "Current
 * Students" as "Community". What's On keeps what's on its stages and in its gallery, and what it
 * tags "Community"; never a ceremony, an info session or a meeting, wherever it is.
 */
export function douglasOpen(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.flatMap((e) => {
    if (DOUGLAS_CLOSED.test(e.title)) return [];
    const stage = DOUGLAS_STAGES.test(e.place?.name ?? "");
    if (!stage && !(e.sourceCategories ?? []).includes("Community")) return [];
    const category: Category | null = /\bgallery\b/i.test(e.place?.name ?? "") ? "arts" : stage ? "shows" : null;
    return [{ ...e, category }];
  });
}

/** A student club's or society's: for its members, mostly (UBC's and SFU's calendars have what's open to all). */
const SP_STUDENTS = /\b(UBC|AMS|SFU|SFSS|GSS|GSA|undergraduate|graduate students?|students?'? (society|association|union|council))\b/i;
/** On UBC's or SFU's Burnaby campus: the same. */
const SP_CAMPUS = /^(V6T|V5A ?1S6)/i;
/** Sold on Showpass, but not an event: a membership, a pass, a month's admission to a garden. */
const SP_NOT_EVENTS =
  /\b(memberships?|season pass(es)?|season tickets?|gift cards?|subscriptions?|meal subsidy|annual general meeting|AGM|see you next season)\b|\badmission$|\s-\s(January|February|March|April|May|June|July|August|September|October|November|December)\s\d{4}$/i;

/**
 * Showpass sells for anyone who has an account, students' clubs included. What's On keeps, as for
 * UBC and SFU, what anyone can go to: at a real place in Greater Vancouver (not online, nothing past
 * Chilliwack or on the Sunshine Coast), not a student club's or on a campus, and not a membership,
 * a pass or a month's admission ("VanDusen Botanical Garden - December 2026").
 */
export function showpassOpen(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.filter((e) => {
    if (e.online || !e.place || SP_NOT_EVENTS.test(e.title)) return false;
    if (SP_STUDENTS.test(e.organizer ?? "") || SP_CAMPUS.test(e.place.postalCode ?? "")) return false;
    const where = resolveArea(e.place);
    return !!where.area && !where.check && !where.outside;
  });
}

/** An organization's events on Eventbrite, as What's On keeps them: at a real place in Greater Vancouver (not online). */
export function eventbriteOpen(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.filter((e) => {
    if (e.online || !e.place) return false;
    const where = resolveArea(e.place);
    return !!where.area && !where.check && !where.outside;
  });
}
