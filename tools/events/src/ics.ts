// The calendar feed (task C6, docs/codex-tasks/C6-ics.md): published events as an iCalendar file
// that Apple and Google Calendar subscribe to, at /go/api/events.ics (same filters as the API).
import type { PublicEvent } from "./types";

export interface IcsOptions {
  /** The calendar's name, shown in people's calendar apps. */
  name: string;
  /** When the file is made; each event's DTSTAMP uses its own updatedAt. */
  now: Date;
}

/** Keep tab, encode logical newlines, and drop the remaining C0/C1 controls from TEXT. */
const textChars = /\r\n|[\\;,\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
function escapeChar(char: string): string {
  switch (char) {
    case "\\": return "\\\\";
    case ";": return "\\;";
    case ",": return "\\,";
    case "\r": case "\n": case "\r\n": return "\\n";
    default: return "";
  }
}
const text = (value: string): string => value.replace(textChars, escapeChar);
const two = Array.from({ length: 60 }, (_, n) => String(n).padStart(2, "0"));
const date = (d: Date): string => {
  const year = d.getUTCFullYear();
  return (year >= 1000 ? String(year) : String(year).padStart(4, "0")) + two[d.getUTCMonth() + 1] + two[d.getUTCDate()];
};
function utc(d: Date, cache: Map<number, string>): string {
  const ms = d.getTime();
  let value = cache.get(ms);
  if (value === undefined) {
    value = date(d) + "T" + two[d.getUTCHours()] + two[d.getUTCMinutes()] + two[d.getUTCSeconds()] + "Z";
    cache.set(ms, value);
  }
  return value;
}

/** Restrict output to RFC 5545's four-digit years, and reject invalid dates before formatting. */
function instant(value: string | number, cache?: Map<string, Date | null>): Date | null {
  if (typeof value === "string" && cache?.has(value)) return cache.get(value)!;
  const d = new Date(value);
  const year = d.getUTCFullYear(); // Invalid dates yield NaN and fail these comparisons.
  const valid = year >= 0 && year <= 9999 ? d : null;
  if (typeof value === "string") cache?.set(value, valid);
  return valid;
}

/** A whole day: `YYYY-MM-DD`, or a Vancouver ISO time, whose first 10 characters are its Vancouver date. */
function day(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const date = value.slice(0, 10);
  const d = instant(date);
  // Date accepts February 30 by rolling it into March; an all-day date must actually exist.
  return d && d.getUTCDate() === +date.slice(8, 10) ? d : null;
}

/** URL strips raw newlines itself, so reject controls before parsing, rather than sanitising them. */
function link(value: string): string | null {
  if (!value || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  try {
    const url = new URL(value);
    const protocol = url.protocol;
    return protocol === "http:" || protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Each physical line fits in 75 UTF-8 octets, including the continuation space. */
function fold(line: string): string {
  let i = 0;
  const limit = Math.min(75, line.length);
  while (i < limit && line.charCodeAt(i) < 0x80) i++;
  if (i === line.length) return line;
  const nonAscii = /[^\x00-\x7f]/g;
  let result = "";
  let start = 0;
  let octets = i;
  while (i < line.length) {
    const code = line.charCodeAt(i);
    if (code < 0x80) {
      // Count a whole ASCII span at once; long English summaries and URLs are common.
      nonAscii.lastIndex = i;
      const next = nonAscii.exec(line)?.index ?? line.length;
      while (octets + next - i > 75) {
        const cut = i + 75 - octets;
        result += line.slice(start, cut) + "\r\n ";
        start = cut;
        i = cut;
        octets = 1;
      }
      octets += next - i;
      i = next;
      continue;
    }
    const pair = code >= 0xd800 && code <= 0xdbff && line.charCodeAt(i + 1) >= 0xdc00 && line.charCodeAt(i + 1) <= 0xdfff;
    const size = code < 0x800 ? 2 : pair ? 4 : 3;
    if (octets + size > 75) {
      result += line.slice(start, i) + "\r\n ";
      start = i;
      octets = 1;
    }
    octets += size;
    i += pair ? 2 : 1;
  }
  return start ? result + line.slice(start) : line;
}

/** Published event instants are already offset-qualified; calendar clients get UTC only. */
export function toIcs(events: PublicEvent[], opts: IcsOptions): string {
  // Events share time slots and a source step's updatedAt. Both caches live only for this response.
  const instants = new Map<string, Date | null>();
  const formatted = new Map<number, string>();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//changle.ca//What's On//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${text(opts.name)}`),
    "X-WR-TIMEZONE:America/Vancouver",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const event of events) {
    const allDay = event.allDay || event.timeTBD;
    const start = allDay ? day(event.start) : instant(event.start, instants);
    const stamp = instant(event.updatedAt, instants);
    let end = event.end ? (allDay ? day(event.end) : instant(event.end, instants)) : null;
    if (!start || !stamp || (event.end && !end)) continue;
    if (allDay) {
      // PublicEvent.end is the inclusive last day; iCalendar's DTEND is exclusive.
      end = instant(Math.max(start.getTime(), end?.getTime() ?? start.getTime()) + 86_400_000);
    } else if (!end || end.getTime() <= start.getTime()) {
      end = instant(start.getTime() + 2 * 3600_000);
    }
    if (!end) continue;
    const postponed = event.status === "postponed";
    lines.push("BEGIN:VEVENT", fold(`UID:${text(event.id)}@changle.ca`), `DTSTAMP:${utc(stamp, formatted)}`, fold(`SUMMARY:${text(postponed ? `已延期 Postponed · ${event.title}` : event.title)}`));
    if (postponed) lines.push("STATUS:TENTATIVE");
    lines.push(allDay ? `DTSTART;VALUE=DATE:${date(start)}` : `DTSTART:${utc(start, formatted)}`, allDay ? `DTEND;VALUE=DATE:${date(end)}` : `DTEND:${utc(end, formatted)}`);
    const url = link(event.url);
    if (url) lines.push(fold(`URL:${url}`));
    const location = event.venue ? event.venue + (event.address ? `, ${event.address}` : "") : event.address ?? "";
    lines.push(fold(`LOCATION:${text(location)}`));
    if (event.category) lines.push(fold(`CATEGORIES:${text(event.category)}`));
    let description = postponed ? "已延期 · Postponed" : event.status === "rescheduled" ? "已改期 · Rescheduled" : event.status === "soldout" ? "已售罄 · Sold out" : "";
    if (event.timeTBD) description += (description ? "\n" : "") + "时间待定 · Time to be announced";
    if (event.summaryZh) description += (description ? "\n" : "") + event.summaryZh;
    if (event.summaryEn) description += (description ? "\n" : "") + event.summaryEn;
    if (url) description += (description ? "\n" : "") + url;
    if (event.sourceName) description += (description ? "\n" : "") + `来源 Source: ${event.sourceName}`;
    lines.push(fold(`DESCRIPTION:${text(description)}`), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // Constants and the validated DATE/DATE-TIME properties are short ASCII lines already.
  return lines.join("\r\n") + "\r\n";
}
