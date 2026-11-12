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

function applyRuntimeZones(components: ICAL.Component[]): void {
  // Per-calendar objects: a custom VTIMEZONE must never leak into another feed.
  const zones = new Map<string, RuntimeZone | null>();
  for (const component of components) {
    for (const prop of component.getAllProperties()) {
      if (prop.type !== "date-time") continue;
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
      for (const value of prop.getValues()) {
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

export function parseIcal(text: string, opts: IcalOptions): NormalizedEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  const components = root.getAllSubcomponents("vevent");
  applyRuntimeZones(components);
  const exceptions = new Map<string, ICAL.Component[]>();
  for (const component of components) {
    if (!component.hasProperty("recurrence-id")) continue;
    const uid = String(component.getFirstPropertyValue("uid"));
    const group = exceptions.get(uid) ?? [];
    group.push(component);
    exceptions.set(uid, group);
  }
  const out: NormalizedEvent[] = [];
  const one = (ev: ICAL.Event, start: ICAL.Time, endDate: ICAL.Time, sourceEventId: string) => {
    if (!start || !ev.summary) return;
    const vevent = ev.component;
    const geo = vevent.getFirstPropertyValue("geo") as number[] | null;
    const place = placeFromText(ev.location);
    if (place && Array.isArray(geo) && geo.length === 2) [place.lat, place.lon] = [Number(geo[0]), Number(geo[1])];
    const status = STATUS[String(vevent.getFirstPropertyValue("status") ?? "").toUpperCase()] ?? "scheduled";
    const url = String(vevent.getFirstPropertyValue("url") ?? "") || (/^https?:\/\//.test(ev.location ?? "") ? ev.location : "");
    const base = {
      source: opts.source,
      title: ev.summary.trim(),
      description: plainText(ev.description),
      url,
      status,
      place,
      organizer: null,
    };
    const s = timeOf(start);
    const endTime = s.allDay ? 0 : endMs(ev, start, s.ms);
    const end = s.allDay ? (dateOf(endDate) > addDays(s.iso, 1) ? addDays(dateOf(endDate), -1) : null)
      : endTime > s.ms ? vanIso(endTime) : null;
    out.push({ ...base, sourceEventId, start: s.iso, end, allDay: s.allDay });
  };
  for (const vevent of components) {
    if (vevent.hasProperty("recurrence-id")) continue;
    const ev = new ICAL.Event(vevent, { exceptions: exceptions.get(String(vevent.getFirstPropertyValue("uid"))) ?? [] });
    if (!ev.startDate || !ev.summary) continue;
    if (ev.isRecurring()) {
      // ical.js expands RDATE alone without the implicit DTSTART occurrence.
      if (!vevent.hasProperty("rrule")) vevent.addPropertyWithValue("rdate", ev.startDate.clone());
      const it = ev.iterator();
      const excluded = vevent.getAllProperties("exdate").flatMap((p) => p.getValues()) as ICAL.Time[];
      const seen = new Set<string>();
      const emit = (occurrence: ICAL.Time) => {
        if (seen.size >= MAX_RECURRENCES) return;
        if (excluded.some((t) => t.isDate ? dateOf(t) === dateOf(occurrence) : t.compare(occurrence) === 0)) return;
        const id = `${ev.uid}@${dateOf(occurrence)}`;
        if (seen.has(id)) return;
        const detail = ev.getOccurrenceDetails(occurrence);
        const ms = timeOf(detail.startDate).ms;
        if (ms >= opts.fromMs && ms < opts.toMs) {
          one(detail.item, detail.startDate, detail.endDate, id);
          seen.add(id);
        }
      };
      for (let next = it.next(); next && seen.size < MAX_RECURRENCES; next = it.next()) {
        if (timeOf(next).ms >= opts.toMs) break;
        emit(next);
      }
      // A moved instance may enter the window from a later original date.
      for (const exception of Object.values(ev.exceptions)) emit(exception.recurrenceId.convertToZone(ev.startDate.zone));
    } else one(ev, ev.startDate, ev.endDate, ev.uid);
  }
  return out;
}
