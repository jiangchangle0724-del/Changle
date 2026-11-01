// Where the events come from, and how each is fetched and read, part by part (a page of a listing).
// Adding a source: an entry here, a parser in src/parsers/, a saved response in tests/fixtures/.
import { parseBiblioCommons, lastStartMs, type BcPage } from "./parsers/bibliocommons";
import { parseIcal } from "./parsers/ical";
import { parseTicketmaster, type TmPage } from "./parsers/ticketmaster";
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

export interface SourceDef extends Source {
  /** The URL for part `part` (a page), with any key; never logged. */
  request(part: number, env: Env, w: Window): string;
  /** Read one part. `more`: there's a next part worth fetching. (May be async: HTMLRewriter is.) */
  parse(raw: string, part: number, w: Window): Parsed | Promise<Parsed>;
  /** At most this many parts in a run. */
  maxParts: number;
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * A public library's events on BiblioCommons (`lib`: its name there). 25 a page keeps a step well
 * inside its 10 ms of CPU (a page is 250 to 420 KB of JSON); two weeks is 7 to 12 pages. (It serves
 * at most 50 a page whatever the limit: never ask for more.)
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
    id: "ticketmaster",
    name: "Ticketmaster",
    kind: "ticketmaster",
    tier: 1,
    lang: "en",
    needs: "TICKETMASTER_KEY",
    // Greater Vancouver: 40 km round the city centre
    url: "https://app.ticketmaster.com/discovery/v2/events.json?latlong=49.2609,-123.1139&radius=40&unit=km&sort=date,asc&locale=*&size=200",
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
