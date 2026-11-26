// Colleges round Vancouver whose calendars have no feed, read from their listing pages (HTML):
// Capilano University's Centre for Performing Arts, Langara (its Studio 58 theatre and its talks
// for the community) and Douglas College. Facts only: which to keep is the source's call
// (src/sources.ts). Each page is checked for its listing first: anything else that answers 200 (an
// error page, a redesign) is a failed step, not an empty fortnight.
import { fromVan, vanIso, vanParts } from "../time";
import type { NormalizedEvent, Place } from "../types";
import { plainText } from "./ical";
import { decodeEntities } from "./jsonld";

/** A few lines of HTML as plain text (a curly quote and the like read as what they are). */
const prose = (html: string | undefined) => plainText(decodeEntities((html ?? "").replace(/&(lt|gt|amp);/gi, "&amp;$1;")));
/** The words of a piece of HTML, on one line. */
const words = (html: string | undefined) => decodeEntities((html ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const two = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "Dec" or "December": 1 to 12 (0 when it isn't a month). */
const monthOf = (name: string) => MONTHS.indexOf(name.trim().slice(0, 3).toLowerCase()) + 1;

/** "7:30 PM", "4:30 pm", "9 a.m.": "19:30" (null when it isn't a time). */
export function clock(s: string | undefined): string | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\s*$/i.exec(s ?? "");
  if (!m || Number(m[1]) > 12) return null;
  const h = (Number(m[1]) % 12) + (m[3].toLowerCase() === "p" ? 12 : 0);
  return `${two(h)}:${m[2] ?? "00"}`;
}

/** A Vancouver date and wall-clock time, "2026-11-27" and "19:30", as an instant's ISO string. */
const at = (date: string, time: string) => vanIso(fromVan(`${date}T${time}`));

/** A listing's items: each `<tag class="name…">…</tag>` (none nest in these listings). */
function items(html: string, tag: "li" | "article", cls: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  return [...html.matchAll(re)].map((m) => m[1]);
}

const CAPU_SITE = "https://www.capilanou.ca";
/** Where the Centre for Performing Arts is: Capilano University's North Vancouver campus. */
const CAPU_CAMPUS = { address: "2055 Purcell Way, North Vancouver, BC V7J 3H5", city: "North Vancouver", postalCode: "V7J 3H5" };

/**
 * Capilano University's Centre for Performing Arts, its list of events from a date (TERMINALFOUR's
 * calendar, ten a page): concerts, theatre, talks. A card has its day and month (and its last
 * day's, for a run of days), the times, the venue and a picture, but no year: it's the year that
 * puts the date in the months from the one before `fromMs` on (the list starts there).
 */
export function parseCapu(html: string, opts: { source: string; fromMs: number }): NormalizedEvent[] {
  if (!html.includes('id="calendar_events"')) throw new Error("not Capilano's list of events");
  const from = vanParts(opts.fromMs).date;
  const [fromYear, fromMonth] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const dateOf = (monthName: string, day: string, after?: string): string | null => {
    const month = monthOf(monthName);
    if (!month || !/^\d{1,2}$/.test(day)) return null;
    let year = fromYear + (month < fromMonth - 1 ? 1 : 0);
    if (after && `${year}-${two(month)}-${two(Number(day))}` < after) year++;
    return `${year}-${two(month)}-${two(Number(day))}`;
  };
  const out: NormalizedEvent[] = [];
  for (const card of items(html, "li", "event-item")) {
    const href = /href="([^"]+\.php)"/.exec(card)?.[1];
    const stamps = [...card.matchAll(/<div class="date-stamp[^"]*">\s*<div class="month">([^<]+)<\/div>\s*<div class="day">([^<]+)<\/div>/g)];
    const title = words(/<p\b[^>]*class="title"[^>]*>([\s\S]*?)<\/p>/.exec(card)?.[1]);
    const first = stamps[0] ? dateOf(stamps[0][1], stamps[0][2].trim()) : null;
    if (!href || !title || !first) continue;
    const last = stamps[1] ? dateOf(stamps[1][1], stamps[1][2].trim(), first) : null;
    const [startTime, endTime] = [...card.matchAll(/<span\b[^>]*class="datelisting"[^>]*>([^<]+)<\/span>/g)].map((m) => clock(m[1]));
    const venue = words(/Venues>([^<]+)</.exec(card)?.[1]) || null;
    const image = /<img[^>]+src="([^"]+)"/.exec(card)?.[1];
    const onCampus = !venue || /\b(capu|capilano)\b/i.test(venue);
    const place: Place = onCampus ? { name: venue ?? "CapU Centre for Performing Arts", ...CAPU_CAMPUS } : { name: venue, address: null, city: null, postalCode: null };
    const endDay = last && last > first ? last : null;
    out.push({
      source: opts.source,
      sourceEventId: `${href.replace(/^.*\/|\.php$/g, "")}@${first}`,
      url: new URL(href, CAPU_SITE).href,
      title,
      description: null,
      start: startTime ? at(first, startTime) : first,
      end: startTime && endTime ? at(endDay ?? first, endTime) : !startTime && endDay ? endDay : null,
      allDay: !startTime,
      timeTBD: !startTime,
      status: /\b(cancell?ed|postponed)\b/i.test(title) ? (/postponed/i.test(title) ? "postponed" : "cancelled") : "scheduled",
      place,
      online: false,
      priceMin: null,
      priceMax: null,
      isFree: null,
      category: null,
      sourceCategories: [],
      tags: [],
      lang: "en",
      imageUrl: image ? new URL(image, CAPU_SITE).href : null,
      organizer: "Capilano University",
    });
  }
  return out;
}

const LANGARA_SITE = "https://langara.ca";
const LANGARA_CAMPUS = { address: "100 West 49th Avenue, Vancouver, BC V5Y 2Z6", city: "Vancouver", postalCode: "V5Y 2Z6" };

/**
 * Langara's events (Drupal), one filtered list: each card has its title, its times (a list of
 * them: a talk given three times is three events; a run of a play is one, from its first evening
 * to its last), where on campus, and a few lines. A card that names no place (a talk at a public
 * library) is kept placeless: the source leaves it out.
 */
export function parseLangara(html: string, opts: { source: string; label: string }): NormalizedEvent[] {
  if (!html.includes("views-exposed-form-events-block-all")) throw new Error("not Langara's list of events");
  const out: NormalizedEvent[] = [];
  for (const card of items(html, "article", "node node--type-event")) {
    const href = /href="([^"]+)"/.exec(card)?.[1];
    const title = words(/<h3\b[^>]*class="title"[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1]);
    if (!href || !title) continue;
    const where = words(/field--name-field-location[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1]) || null;
    const place: Place | null = where ? (/^langara\b/i.test(where) ? { name: where, ...LANGARA_CAMPUS } : { name: where, address: null, city: null, postalCode: null }) : null;
    const body = /field--name-body[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1];
    const slug = href.replace(/^.*\//, "");
    for (const li of card.match(/<li\b[^>]*class="list-group-item"[^>]*>[\s\S]*?<\/li>/g) ?? []) {
      const [start, end] = [...li.matchAll(/datetime="([^"]+)"/g)].map((m) => m[1]);
      if (!start) continue;
      const allDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
      const startMs = Date.parse(start);
      if (!allDay && !Number.isFinite(startMs)) continue;
      const endMs = end ? Date.parse(end) : NaN;
      const day = allDay ? start : vanParts(startMs).date;
      out.push({
        source: opts.source,
        sourceEventId: `${slug}@${day}`,
        url: new URL(href, LANGARA_SITE).href,
        title,
        description: prose(body),
        start: allDay ? start : vanIso(startMs),
        end: allDay ? (end && end > start ? end.slice(0, 10) : null) : Number.isFinite(endMs) && endMs > startMs ? vanIso(endMs) : null,
        allDay,
        timeTBD: false,
        status: /\b(cancell?ed)\b/i.test(title) ? "cancelled" : "scheduled",
        place,
        online: !!where && /^online\b/i.test(where),
        priceMin: null,
        priceMax: null,
        isFree: null,
        category: null,
        sourceCategories: [opts.label],
        tags: [],
        lang: "en",
        imageUrl: null,
        organizer: "Langara College",
      });
    }
  }
  return out;
}

const DOUGLAS_SITE = "https://www.douglascollege.ca";
const DOUGLAS_CAMPUS = {
  newWest: { address: "700 Royal Avenue, New Westminster, BC V3M 5Z5", city: "New Westminster", postalCode: "V3M 5Z5" },
  coquitlam: { address: "1250 Pinetree Way, Coquitlam, BC V3B 7X3", city: "Coquitlam", postalCode: "V3B 7X3" },
};

/** "Oct 22, 2026": "2026-10-22" (null when it isn't one). */
function douglasDate(s: string | undefined): string | null {
  const m = /^\s*([A-Za-z]{3,9})\.? (\d{1,2}), (\d{4})\s*$/.exec(s ?? "");
  return m && monthOf(m[1]) ? `${m[3]}-${two(monthOf(m[1]))}-${two(Number(m[2]))}` : null;
}

/**
 * Douglas College's news and events (Drupal), eight a page by date: each card has its first day,
 * who it's for (its tags: All, Community, Current Students…), its times ("12:00 pm - 2:00 pm", or
 * a run: "Oct 22, 2026 4:30 pm - Jan 06, 2027 7:30 pm") and where. Rooms are on the New
 * Westminster campus unless the place says Coquitlam (or an A or B building).
 */
export function parseDouglas(html: string, opts: { source: string }): NormalizedEvent[] {
  if (!html.includes("views-exposed-form-events-page-1")) throw new Error("not Douglas College's list of events");
  const out: NormalizedEvent[] = [];
  for (const card of items(html, "article", "node node--type-event")) {
    const href = /<a href="([^"]+)"/.exec(card)?.[1];
    const title = words(/field--name-title[^>]*>([\s\S]*?)<\/span>/.exec(card)?.[1]);
    const day = douglasDate(words(/<div\b[^>]*class="start-date"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1]));
    if (!href || !title || !day) continue;
    const tags = [...card.matchAll(/<li class="[^"]*">([\s\S]*?)<\/li>/g)].map((m) => words(m[1])).filter(Boolean);
    const time = words(/<div\b[^>]*class="time"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1]);
    // "Oct 22, 2026 4:30 pm - Jan 06, 2027 7:30 pm", "12:00 pm - 2:00 pm", "2:00 pm" or nothing
    const run = /^([A-Za-z]{3,9}\.? \d{1,2}, \d{4}) (\d{1,2}:\d{2} [ap]m) - ([A-Za-z]{3,9}\.? \d{1,2}, \d{4}) (\d{1,2}:\d{2} [ap]m)$/i.exec(time);
    const hours = /^(\d{1,2}:\d{2} [ap]m)(?: - (\d{1,2}:\d{2} [ap]m))?$/i.exec(time);
    const where = words(/field--name-field-location[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1]) || null;
    const campus = where && (/coquitlam/i.test(where) || /^(room )?[AB]\d{4}\b|\bA\/B\b|\([AB]\d{4}\)/i.test(where)) ? DOUGLAS_CAMPUS.coquitlam : DOUGLAS_CAMPUS.newWest;
    const online = !!where && /^(online|zoom|virtual)\b/i.test(where);
    let start: string;
    let end: string | null = null;
    let allDay = false;
    if (run) {
      const [first, last] = [douglasDate(run[1]), douglasDate(run[3])];
      const [t1, t2] = [clock(run[2]), clock(run[4])];
      if (!first || !last || !t1 || !t2) continue;
      start = at(first, t1);
      end = at(last, t2);
    } else if (hours) {
      const [t1, t2] = [clock(hours[1]), clock(hours[2])];
      if (!t1) continue;
      start = at(day, t1);
      end = t2 && t2 > t1 ? at(day, t2) : null;
    } else {
      start = day;
      allDay = true;
    }
    out.push({
      source: opts.source,
      sourceEventId: `${href.replace(/^.*\//, "")}@${day}`,
      url: new URL(href, DOUGLAS_SITE).href,
      title,
      description: null,
      start,
      end,
      allDay,
      timeTBD: false,
      status: /\b(cancell?ed)\b/i.test(title) ? "cancelled" : "scheduled",
      place: online ? null : { name: where ?? "Douglas College", ...campus },
      online,
      priceMin: null,
      priceMax: null,
      isFree: null,
      category: null,
      sourceCategories: tags,
      tags: [],
      lang: "en",
      imageUrl: null,
      organizer: "Douglas College",
    });
  }
  return out;
}

const VCC_CAMPUS = {
  downtown: { address: "250 West Pender Street, Vancouver, BC V6B 1S9", city: "Vancouver", postalCode: "V6B 1S9" },
  broadway: { address: "1155 East Broadway, Vancouver, BC V5T 4V5", city: "Vancouver", postalCode: "V5T 4V5" },
};

/** Vancouver Community College's list of its community events (WordPress): each page and its first day. */
export function vccList(html: string): { url: string; day: string }[] {
  if (!/<body[^>]*\bterm-community-event\b/.test(html)) throw new Error("not VCC's list of community events");
  const out: { url: string; day: string }[] = [];
  for (const card of items(html, "article", "search-item")) {
    const url = /<a href="(https:\/\/www\.vcc\.ca\/[^"]+)"/.exec(card)?.[1];
    const day = douglasDate(words(/search-item__date[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1]));
    if (url && day) out.push({ url, day });
  }
  return out;
}

/** "6:30 - 8:30 p.m.", "9:30 a.m. - 1:30 p.m.", "6 p.m. - 9 p.m.": the start and end (the start's a.m. or p.m. as the end's when it has none). */
function hoursOf(s: string): [string, string] | null {
  const m = /^(\d{1,2}(?::\d{2})?)\s*([ap]\.?\s?m\.?)?\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?)\s*([ap]\.?\s?m\.?)$/i.exec(s.trim());
  if (!m) return null;
  const [start, end] = [clock(`${m[1]} ${m[2] ?? m[4]}`), clock(`${m[3]} ${m[4]}`)];
  return start && end && end > start ? [start, end] : null;
}

/** "12/08/2026": "2026-12-08". */
function mdy(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/**
 * One of VCC's event pages: its add-to-calendar button has the first and last days, the title and
 * the place; the lines under it the hours. One line of hours: the event has them; one a day
 * (11 to 4 on Tuesday, 11 to 6 on Wednesday…) or none: it's shown as its days. A page whose last
 * day comes before its first (a page left over from last year) is read as nothing.
 */
export function parseVcc(html: string, opts: { source: string }): NormalizedEvent[] {
  const button = /<button\b[^>]*class="addeventatc"[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1];
  if (!button) throw new Error("not a VCC event page");
  const span = (cls: string) => words(new RegExp(`<span class="${cls}">([\\s\\S]*?)</span>`).exec(button)?.[1]);
  const first = mdy(span("start"));
  const last = span("end") ? mdy(span("end")) : null;
  const url = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const title = span("title");
  if (!first || !url || !title || (last && last < first)) return [];
  const hours = [...html.matchAll(/fa-clock"><\/span>\s*<span class="sr-only">[^<]*<\/span>\s*<span class="meta-label">([^<]*)<\/span>/g)].map((m) => decodeEntities(m[1]).trim());
  const times = hours.length === 1 ? hoursOf(hours[0]) : null;
  // "Atrium, Downtown campus", "VCC Broadway Campus | 1120 E. 7th Ave, Vancouver", "JJ's Restaurant"
  const where = span("location") || null;
  const [label, street] = (where ?? "").split("|").map((p) => p.trim());
  const campus = /downtown|pender/i.test(label) ? VCC_CAMPUS.downtown : /broadway/i.test(label) ? VCC_CAMPUS.broadway : null;
  const place: Place =
    street && /\d/.test(street)
      ? { name: label || "Vancouver Community College", address: street, city: "Vancouver", postalCode: null }
      : campus
        ? { name: label, ...campus }
        : { name: label ? `${label}, Vancouver Community College` : "Vancouver Community College", address: null, city: "Vancouver", postalCode: null };
  const endDay = last && last > first ? last : null;
  const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  return [
    {
      source: opts.source,
      sourceEventId: `${url.replace(/\/$/, "").replace(/^.*\//, "")}@${first}`,
      url,
      title,
      description: prose(/<div class="entry-content">([\s\S]*?)<\/div>/.exec(html)?.[1]),
      start: times ? at(first, times[0]) : first,
      end: times ? at(endDay ?? first, times[1]) : endDay,
      allDay: !times,
      timeTBD: false,
      status: /\b(cancell?ed)\b/i.test(title) ? "cancelled" : "scheduled",
      place,
      online: false,
      priceMin: null,
      priceMax: null,
      isFree: null,
      category: null,
      sourceCategories: ["Community Event"],
      tags: [],
      lang: "en",
      imageUrl: image && !/logo/i.test(image) ? image : null,
      organizer: "Vancouver Community College",
    },
  ];
}
