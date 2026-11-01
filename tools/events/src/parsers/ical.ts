// iCal (.ics) to NormalizedEvent[]: Luma's city feed now; organisers' and libraries' calendars later.
// A first version for the first runs. Task C1 (docs/codex-tasks/C1-ical-parser.md) hardens it:
// more fixtures, EXDATE and changed instances, every time-zone form, tests across 2026-11-01.
import ICAL from "ical.js";
import { fromVan, vanIso } from "../time";
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

/** An ICAL.Time as the contract's time: Vancouver ISO with the offset, or a date for all-day. */
function timeOf(t: ICAL.Time): { iso: string; ms: number; allDay: boolean } {
  if (t.isDate) {
    const date = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
    return { iso: date, ms: fromVan(date), allDay: true };
  }
  const tz = t.zone?.tzid;
  let ms: number;
  if (tz === "UTC" || tz === "Z") ms = t.toUnixTime() * 1000;
  else if (!tz || tz === "floating" || /Vancouver|Pacific/i.test(tz)) {
    // floating, or Vancouver's own zone without its definition in the file: Vancouver wall-clock time
    const wall = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}T${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:${String(t.second).padStart(2, "0")}`;
    ms = fromVan(wall);
  } else ms = t.toUnixTime() * 1000;
  return { iso: vanIso(ms), ms, allDay: false };
}

export function parseIcal(text: string, opts: IcalOptions): NormalizedEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const out: NormalizedEvent[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(vevent);
    if (!ev.startDate || !ev.summary) continue;
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
    const durationMs = ev.endDate ? ev.endDate.toUnixTime() * 1000 - ev.startDate.toUnixTime() * 1000 : 0;
    const one = (start: ICAL.Time, idSuffix: string) => {
      const s = timeOf(start);
      const end = durationMs > 0 && !s.allDay ? vanIso(s.ms + durationMs) : null;
      out.push({ ...base, sourceEventId: `${ev.uid}${idSuffix}`, start: s.iso, end, allDay: s.allDay });
    };
    if (ev.isRecurring()) {
      const it = ev.iterator();
      for (let n = 0, next = it.next(); next && n < MAX_RECURRENCES * 4; n++, next = it.next()) {
        const ms = timeOf(next).ms;
        if (ms >= opts.toMs) break;
        if (ms >= opts.fromMs) one(next, `@${timeOf(next).iso.slice(0, 10)}`);
        if (out.length > MAX_RECURRENCES * 50) break;
      }
    } else one(ev.startDate, "");
  }
  return out;
}
