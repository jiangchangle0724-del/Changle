// The calendar feed (task C6, docs/codex-tasks/C6-ics.md): published events as an iCalendar file
// that Apple and Google Calendar subscribe to, at /go/api/events.ics (same filters as the API).
import type { PublicEvent } from "./types";
import { addDays } from "./time";

export interface IcsOptions {
  /** The calendar's name, shown in people's calendar apps. */
  name: string;
  /** When the file is made; each event's DTSTAMP uses its own updatedAt. */
  now: Date;
}

/** RFC 5545 TEXT: escape backslashes first, and keep newlines inside the value. */
const text = (value: string): string => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const utc = (value: string | number): string => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const date = (value: string): string => value.slice(0, 10).replace(/-/g, "");
const encoder = new TextEncoder();

/** Each physical line fits in 75 UTF-8 octets, including the continuation space. */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let part = "";
  let octets = 0;
  for (const char of line) {
    const point = char.codePointAt(0)!;
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (octets + size > 75) {
      parts.push(part);
      part = " ";
      octets = 1;
    }
    part += char;
    octets += size;
  }
  parts.push(part);
  return parts.join("\r\n");
}

/** Published event instants are already offset-qualified; calendar clients get UTC only. */
export function toIcs(events: PublicEvent[], opts: IcsOptions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//changle.ca//What's On//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(opts.name)}`,
    "X-WR-TIMEZONE:America/Vancouver",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${text(event.id)}@changle.ca`, `DTSTAMP:${utc(event.updatedAt)}`, `SUMMARY:${text(event.title)}`);
    if (event.allDay || event.timeTBD) {
      // PublicEvent.end is the inclusive last day; iCalendar's DTEND is exclusive.
      lines.push(`DTSTART;VALUE=DATE:${date(event.start)}`, `DTEND;VALUE=DATE:${date(addDays((event.end ?? event.start).slice(0, 10), 1))}`);
    } else {
      lines.push(`DTSTART:${utc(event.start)}`, `DTEND:${utc(event.end ?? (Date.parse(event.start) + 2 * 3600_000))}`);
    }
    lines.push(`URL:${event.url}`, `LOCATION:${text([event.venue, event.address].filter(Boolean).join(", "))}`);
    if (event.category) lines.push(`CATEGORIES:${text(event.category)}`);
    const description = [
      event.timeTBD ? "时间待定 · Time to be announced" : null,
      event.summaryZh,
      event.summaryEn,
      event.url,
      event.sourceName ? `来源 Source: ${event.sourceName}` : null,
    ].filter(Boolean).join("\n");
    lines.push(`DESCRIPTION:${text(description)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
