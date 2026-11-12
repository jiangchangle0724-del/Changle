// iCal (.ics) to NormalizedEvent[]: Luma's city feed now; organisers' and libraries' calendars later.
import ICAL from "ical.js";
import { addDays, fromVan, vanIso } from "../time";
import type { EventStatus, NormalizedEvent, Place } from "../types";

export interface IcalOptions {
  /** Source.id for the events. */
  source: string;
  /** Recurring events are expanded within this window (epoch ms); single ones all come back. */
  fromMs: number;
  toMs: number;
}

/** At most this many dates from one recurring event. */
const MAX_RECURRENCES = 60;
/** Leave room for unrelated series and the rest of the source step's CPU budget. */
const MAX_ITERATIONS = 400;
const MAX_SERIES_ITERATIONS = 200;
const DAY = 86_400_000;

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "'", "&lsquo;": "'", "&ndash;": "-", "&mdash;": "-" };

/** HTML and iCal escapes out, whitespace tidied, at most `max` characters. */
export function plainText(s: string | null | undefined, max = 600): string | null {
  if (!s) return null;
  // (only the start matters: what's kept is short, and a step's CPU is counted)
  const text = s
    .slice(0, max * 8)
    .replace(/<(br\s*\/?|\/(p|li|div|h\d))>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n[\s\n]*/g, "\n")
    .trim();
  return text ? text.slice(0, max) : null;
}

/** "Name, 123 Street, City, BC V6A 3Z7, Canada" into its parts (as far as it goes). */
export function placeFromText(text: string | null | undefined): Place | null {
  const t = text?.trim();
  if (!t || /^https?:\/\//.test(t)) return null;
  const postal = /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/i.exec(t);
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  const bcAt = parts.findIndex((p) => /^BC\b/i.test(p) || /\bBC\s+[A-Z]\d[A-Z]/i.test(p));
  const city = bcAt > 0 ? parts[bcAt - 1] : null;
  // A leading part with no digits is the place's name ("Science World, 1455 Quebec St, ...").
  const named = parts.length > 1 && !/\d/.test(parts[0]);
  return {
    name: named ? parts[0] : parts[0] ?? null,
    address: named ? parts.slice(1).join(", ") : t,
    city,
    postalCode: postal ? `${postal[1]} ${postal[2]}`.toUpperCase() : null,
  };
}

const STATUS: Record<string, EventStatus> = { CANCELLED: "cancelled", CONFIRMED: "scheduled", TENTATIVE: "scheduled" };

const wallMs = (t: ICAL.Time) => Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
const dateOf = (t: ICAL.Time) => t.toString().slice(0, 10);

/** Give ical.js runtime rules too, so duration and exception comparisons use the same zone. */
class RuntimeZone extends ICAL.Timezone {
  constructor(tzid: string, private readonly fmt: Intl.DateTimeFormat) {
    super({ tzid });
  }

  wallAt(ms: number): number {
    const p = Object.fromEntries(this.fmt.formatToParts(ms).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  }

  utcOffset(t: ICAL.Time): number {
    const wall = wallMs(t);
    if (this.tzid === "America/Vancouver") return (wall - fromVan(t.toString().slice(0, 19))) / 1000;
    const offsetAt = (ms: number) => {
      const p = Object.fromEntries(this.fmt.formatToParts(ms).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
    };
    // As in fromVan: first occurrence of an ambiguous time; gaps advance with the clock.
    for (const probe of [wall - 12 * 3600_000, wall + 12 * 3600_000]) {
      const offset = offsetAt(probe);
      if (offsetAt(wall - offset) === offset) return offset / 1000;
    }
    return offsetAt(wall) / 1000;
  }
}

function applyRuntimeZones(components: ICAL.Component[], zones = new Map<string, RuntimeZone | null>()): void {
  // Per-calendar objects: a custom VTIMEZONE must never leak into another feed.
  for (const component of components) {
    for (const prop of component.getAllProperties()) {
      if (prop.type !== "date-time" && prop.type !== "period") continue;
      const tzid = String(prop.getParameter("tzid") || "America/Vancouver");
      if (!zones.has(tzid)) {
        try {
          const fmt = new Intl.DateTimeFormat("en-CA", {
            timeZone: tzid, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          });
          zones.set(tzid, new RuntimeZone(tzid, fmt));
        } catch {
          zones.set(tzid, null); // Unknown to Intl: retain this calendar's VTIMEZONE.
        }
      }
      const zone = zones.get(tzid);
      const times = prop.getValues().flatMap((value) => value instanceof ICAL.Period ? [value.start, value.end] : [value]);
      for (const value of times) {
        if (value instanceof ICAL.Time && value.zone !== ICAL.Timezone.utcTimezone && zone) value.zone = zone;
      }
    }
  }
}

/** An ICAL.Time as the contract's time: Vancouver ISO with the offset, or a date for all-day. */
function timeOf(t: ICAL.Time): { iso: string; ms: number; allDay: boolean } {
  if (t.isDate) {
    const date = dateOf(t);
    return { iso: date, ms: fromVan(date), allDay: true };
  }
  const ms = t.zone.tzid === "floating" ? fromVan(t.toString()) : t.toUnixTime() * 1000;
  return { iso: vanIso(ms), ms, allDay: false };
}

function endMs(ev: ICAL.Event, start: ICAL.Time, startMs: number): number {
  const duration = ev.component.getFirstPropertyValue("duration") as ICAL.Duration | null;
  if (!duration) {
    // DTEND defines an exact elapsed duration, including a clock change on the first date.
    return startMs + timeOf(ev.endDate).ms - timeOf(ev.startDate).ms;
  }
  // DURATION's weeks/days are nominal calendar days; its hours/minutes/seconds are elapsed.
  const dayEnd = start.clone();
  const sign = duration.isNegative ? -1 : 1;
  dayEnd.adjust(sign * (duration.weeks * 7 + duration.days), 0, 0, 0);
  return timeOf(dayEnd).ms + sign * (duration.hours * 3600 + duration.minutes * 60 + duration.seconds) * 1000;
}

/** Express a boundary/RECURRENCE-ID in the master's wall clock, once rather than per old date. */
function inZone(t: ICAL.Time, model: ICAL.Time): ICAL.Time {
  if (t.isDate || t.zone.tzid === model.zone.tzid) return t;
  const ms = timeOf(t).ms;
  if (!(model.zone instanceof RuntimeZone)) return t.convertToZone(model.zone);
  const local = ICAL.Time.fromJSDate(new Date(model.zone.wallAt(ms)), true);
  local.zone = model.zone;
  return local;
}

function boundary(ms: number, model: ICAL.Time): number {
  const utc = ICAL.Time.fromJSDate(new Date(ms), true);
  return wallMs(inZone(utc, model));
}

/** Keep DTSTART defaults explicit before moving the anchor by whole INTERVAL periods. */
function fastForward(rule: ICAL.Recur, start: ICAL.Time, lower: number): ICAL.Time {
  if (rule.count || lower <= wallMs(start)) return start;
  const p = rule.parts;
  if (rule.freq === "WEEKLY" && !p.BYDAY) p.BYDAY = [ICAL.Recur.numericDayToIcalDay(start.dayOfWeek())];
  if ((rule.freq === "MONTHLY" || rule.freq === "YEARLY") && !p.BYDAY && !p.BYMONTHDAY && !p.BYYEARDAY && !p.BYWEEKNO) {
    p.BYMONTHDAY = [start.day];
  }
  if (rule.freq === "YEARLY" && !p.BYMONTH && !p.BYDAY && !p.BYYEARDAY && !p.BYWEEKNO) p.BYMONTH = [start.month];
  const seed = start.clone();
  const interval = rule.interval;
  const units: Partial<Record<ICAL.Recur["freq"], number>> = {
    SECONDLY: 1000, MINUTELY: 60_000, HOURLY: 3600_000, DAILY: DAY, WEEKLY: 7 * DAY,
  };
  const unit = units[rule.freq];
  if (unit) {
    const cycles = Math.max(0, Math.floor((lower - wallMs(start)) / (unit * interval)) - 1);
    seed.fromUnixTime((wallMs(start) + cycles * interval * unit) / 1000);
    seed.zone = start.zone;
  } else {
    const target = new Date(lower);
    const periods = rule.freq === "MONTHLY" ? (target.getUTCFullYear() - start.year) * 12 + target.getUTCMonth() + 1 - start.month
      : target.getUTCFullYear() - start.year;
    const cycles = Math.max(0, Math.floor(periods / interval) - 1);
    if (cycles) {
      // Day 1 avoids normalizing Jan 31 into March or Feb 29 into a different year.
      seed.day = 1;
      if (rule.freq === "MONTHLY") {
        // The iterator reads raw fields; normalize before construction, not on first access.
        const months = seed.year * 12 + seed.month - 1 + cycles * interval;
        seed.year = Math.floor(months / 12);
        seed.month = (months % 12) + 1;
      } else { seed.month = 1; seed.year += cycles * interval; }
    }
  }
  return seed;
}

function calendarOf(text: string): { root: ICAL.Component; invalid: Set<string> } {
  const invalid = new Set<string>();
  try {
    return { root: new ICAL.Component(ICAL.parse(text)), invalid };
  } catch {
    // ICAL.parse validates RRULE eagerly. Retry individual VEVENTs so FREQ=FOO cannot lose a feed.
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    const pattern = /^BEGIN:VEVENT\r?\n[\s\S]*?^END:VEVENT[^\S\r\n]*(?:\r?\n|$)/gm;
    const blocks = [...unfolded.matchAll(pattern)].map((m) => m[0]);
    const root = new ICAL.Component(ICAL.parse(unfolded.replace(pattern, "")));
    for (const block of blocks) {
      try { root.addSubcomponent(new ICAL.Component(ICAL.parse(block))); }
      catch {
        if (!/^RECURRENCE-ID[;:]/m.test(block)) {
          const uid = /^UID:(.*)$/m.exec(block)?.[1].trim();
          if (uid) invalid.add(uid);
        }
      }
    }
    return { root, invalid };
  }
}

export function parseIcal(text: string, opts: IcalOptions): NormalizedEvent[] {
  const { root, invalid } = calendarOf(text);
  const components = root.getAllSubcomponents("vevent");
  const masters = new Set(components.filter((c) => !c.hasProperty("recurrence-id")).map((c) => String(c.getFirstPropertyValue("uid"))));
  const zones = new Map<string, RuntimeZone | null>();
  const exceptions = new Map<string, ICAL.Component[]>();
  for (const component of components) {
    const uid = String(component.getFirstPropertyValue("uid"));
    try {
      applyRuntimeZones([component], zones);
      if (!component.hasProperty("recurrence-id") || !component.hasProperty("dtstart")) continue;
      const exception = new ICAL.Event(component, { exceptions: [] });
      if (!exception.startDate || !exception.recurrenceId) continue;
      const group = exceptions.get(uid) ?? [];
      group.push(component);
      exceptions.set(uid, group);
    } catch {
      if (!component.hasProperty("recurrence-id")) invalid.add(uid);
    }
  }
  const out: NormalizedEvent[] = [];
  let iterations = 0;
  const one = (ev: ICAL.Event, start: ICAL.Time, sourceEventId: string, master?: ICAL.Event): boolean => {
    if (!start) return false;
    const vevent = ev.component;
    const value = (name: string) => (vevent.hasProperty(name) ? vevent : master?.component)?.getFirstPropertyValue(name);
    const title = String(value("summary") ?? "").trim();
    if (!title) return false;
    const locationOwner = vevent.hasProperty("location") || vevent.hasProperty("geo") ? vevent : master?.component ?? vevent;
    const geo = locationOwner.getFirstPropertyValue("geo") as number[] | null;
    const location = String(locationOwner.getFirstPropertyValue("location") ?? "");
    const place = placeFromText(location);
    if (place && Array.isArray(geo) && geo.length === 2) [place.lat, place.lon] = [Number(geo[0]), Number(geo[1])];
    const status = STATUS[String(value("status") ?? "").toUpperCase()] ?? "scheduled";
    const url = String(value("url") ?? "") || (/^https?:\/\//.test(location) ? location : "");
    const base = {
      source: opts.source,
      title,
      description: plainText(value("description") as string | null),
      url,
      status,
      place,
      organizer: null,
    };
    const s = timeOf(start);
    const timing = vevent.hasProperty("dtend") || vevent.hasProperty("duration") ? ev : master ?? ev;
    const days = s.allDay ? Math.max(1, Math.round((wallMs(timing.endDate) - wallMs(timing.startDate)) / DAY)) : 0;
    const endTime = s.allDay ? fromVan(addDays(s.iso, days)) : endMs(timing, start, s.ms);
    if (master && !(s.ms < opts.toMs && (endTime > opts.fromMs || endTime === s.ms && s.ms >= opts.fromMs))) return false;
    const end = s.allDay ? (days > 1 ? addDays(s.iso, days - 1) : null)
      : endTime > s.ms ? vanIso(endTime) : null;
    out.push({ ...base, sourceEventId, start: s.iso, end, allDay: s.allDay });
    return true;
  };
  const hasCount = (component: ICAL.Component) => component.getAllProperties("rrule").some((p) => (p.getFirstValue() as ICAL.Recur).count);
  const ordered = components.filter((c) => !c.hasProperty("recurrence-id"))
    .sort((a, b) => Number(hasCount(a)) - Number(hasCount(b)));
  for (const vevent of ordered) {
    const uid = String(vevent.getFirstPropertyValue("uid"));
    if (invalid.has(uid)) continue;
    const before = out.length;
    let seriesIterations = 0;
    try {
      const ev = new ICAL.Event(vevent, { exceptions: exceptions.get(uid) ?? [] });
      if (!ev.startDate || !ev.summary) continue;
      if (ev.isRecurring()) {
        const from = boundary(opts.fromMs, ev.startDate);
        const to = boundary(opts.toMs, ev.startDate);
        const duration = Math.max(0, wallMs(ev.endDate) - wallMs(ev.startDate), ev.duration.toSeconds() * 1000);
        const lower = from - duration - (duration >= DAY ? DAY : 0);
        const excluded = (vevent.getAllProperties("exdate").flatMap((p) => p.getValues()) as ICAL.Time[]).map((t) => inZone(t, ev.startDate));
        const overrides = Object.values(ev.exceptions);
        const byInstant = new Map(overrides.map((e) => [timeOf(e.recurrenceId).ms, e]));
        const seen = new Set<string>();
        const isExcluded = (occurrence: ICAL.Time) => excluded.some((t) => t.isDate ? dateOf(t) === dateOf(occurrence) : wallMs(t) === wallMs(occurrence));
        const emit = (occurrence: ICAL.Time) => {
          if (seen.size >= MAX_RECURRENCES) return;
          if (isExcluded(occurrence)) return;
          const id = `${ev.uid}@${dateOf(occurrence)}`;
          if (seen.has(id)) return;
          const detail = ev.getOccurrenceDetails(occurrence);
          // ical.js checks local/UTC string keys, but not a TZID key against a UTC master.
          const matched = detail.item === ev ? byInstant.get(timeOf(occurrence).ms) : undefined;
          if (one(matched ?? detail.item, matched?.startDate ?? detail.startDate, id, ev)) seen.add(id);
        };
        const rdates = vevent.getAllProperties("rdate").flatMap((p) => p.getValues()) as (ICAL.Time | ICAL.Period)[];
        const dates = [...(vevent.hasProperty("rrule") ? [] : [ev.startDate]), ...rdates.map((t) => inZone(t instanceof ICAL.Period ? t.start : t, ev.startDate))];
        const rules = vevent.getAllProperties("rrule").sort((a, b) => Number(!!(a.getFirstValue() as ICAL.Recur).count) - Number(!!(b.getFirstValue() as ICAL.Recur).count));
        for (const prop of rules) {
          const rule = (prop.getFirstValue() as ICAL.Recur).clone();
          if (rule.until) {
            const until = rule.until.clone();
            if (until.zone.tzid === "floating") until.zone = ev.startDate.zone;
            const localUntil = inZone(until, ev.startDate).clone();
            if (wallMs(localUntil) < lower) continue;
            localUntil.zone = ICAL.Timezone.localTimezone;
            rule.until = localUntil;
          }
          if (iterations >= MAX_ITERATIONS || seriesIterations >= MAX_SERIES_ITERATIONS) break;
          const wallStart = ev.startDate.clone();
          wallStart.zone = ICAL.Timezone.localTimezone;
          const subdaily = rule.freq === "MINUTELY" || rule.freq === "SECONDLY" || rule.freq === "HOURLY";
          const hasBy = Object.keys(rule.parts).length > 0;
          // ical.js itself compares dates inside next(); floating iteration keeps those calls off Intl.
          const iterator = (floor: number) => {
            // BYHOUR is an ordered iterator list. Let its initial partial day settle before the window.
            const it = rule.iterator(fastForward(rule, wallStart, floor - (subdaily && hasBy ? DAY : 0)));
            const advance = it.next.bind(it);
            // The package's declaration omits next()'s normal null-at-end result.
            const bounded: { next(again?: boolean): ICAL.Time | null } = it;
            bounded.next = (again = false) => {
              if (iterations >= MAX_ITERATIONS || seriesIterations >= MAX_SERIES_ITERATIONS) return null;
              iterations++;
              seriesIterations++;
              return advance(again);
            };
            return bounded;
          };
          let floor = lower;
          let bounded = iterator(floor);
          while (iterations < MAX_ITERATIONS && seriesIterations < MAX_SERIES_ITERATIONS) {
            const next = bounded.next();
            if (!next || wallMs(next) >= to) break;
            // No emit, Intl or Unix conversion for historical occurrences outside the overlap range.
            if (wallMs(next) < floor) continue;
            const actual = next.clone();
            actual.zone = ev.startDate.zone;
            if (isExcluded(actual)) continue;
            dates.push(actual);
            if (!rule.count && !hasBy && subdaily) {
              // IDs retain one occurrence per source date. Seek the next date by whole periods.
              floor = Date.UTC(next.year, next.month - 1, next.day + 1);
              if (floor >= to) break;
              bounded = iterator(floor);
            }
          }
        }
        dates.sort((a, b) => wallMs(a) - wallMs(b));
        for (const date of dates) if (wallMs(date) >= lower && wallMs(date) < to) emit(date);
        // Overrides survive expired rules, a spent iteration budget, and moves across window edges.
        for (const exception of overrides) emit(inZone(exception.recurrenceId, ev.startDate));
      } else one(ev, ev.startDate, ev.uid);
    } catch {
      out.length = before; // A malformed series loses only its own results.
    }
  }
  for (const [uid, group] of exceptions) {
    if (masters.has(uid) || invalid.has(uid)) continue;
    for (const component of group) {
      try {
        const ev = new ICAL.Event(component, { exceptions: [] });
        one(ev, ev.startDate, `${uid}@${dateOf(ev.recurrenceId)}`, ev);
      } catch { /* A malformed orphan must not discard the remaining feed. */ }
    }
  }
  return out;
}
