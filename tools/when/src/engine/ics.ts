// One settled gathering, for Apple Calendar or Google Calendar (task C2).
import { PART_HOURS } from "./slots";
import { addDays, instant } from "./time";
import type { Day, Part } from "./types";

/** What was set. */
export type CalendarEntry = {
  /** The gathering's 8-character public code. */
  code: string;
  /** Its name, as the host typed it, up to 40 characters. */
  title: string;
  day: Day;
  part: Part;
  /** When it was set, in milliseconds. */
  setAt: number;
  /** The minutes of the day it runs, when the time was set to the minute (a gathering asked by the period). */
  from?: number;
  to?: number;
};

const address = (entry: CalendarEntry): string => `https://changle.ca/when/${entry.code}`;
const description = (entry: CalendarEntry): string => `约时间定的 · Set with When Works\n${address(entry)}`;
const date = (day: Day): string => day.replace(/-/g, "");
const utc = (ms: number): string => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, "");

function range(entry: CalendarEntry): { start: string; end: string; allDay: boolean } {
  if (entry.part === "day") {
    return { start: date(entry.day), end: date(addDays(entry.day, 1)), allDay: true };
  }
  if (entry.from !== undefined && entry.to !== undefined) {
    return { start: utc(instant(entry.day, 0, entry.from)), end: utc(instant(entry.day, 0, entry.to)), allDay: false };
  }
  const hours = PART_HOURS[entry.part];
  return {
    start: utc(instant(entry.day, ...hours.start)),
    end: utc(instant(entry.day, ...hours.end)),
    allDay: false,
  };
}

/** RFC 5545 TEXT: escape backslashes first, and treat CRLF as one logical newline. */
const text = (value: string): string => value
  .replace(/\\/g, "\\\\")
  .replace(/;/g, "\\;")
  .replace(/,/g, "\\,")
  .replace(/\r\n|\r|\n/g, "\\n");

/** Count UTF-8 octets, including the continuation space, without splitting a code point. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > 75) {
      result += "\r\n ";
      octets = 1;
    }
    result += char;
    octets += size;
  }
  return result;
}

/** The whole .ics file, with UTC times or an exclusive all-day end date. */
export function toIcs(entry: CalendarEntry): string {
  const { start, end, allDay } = range(entry);
  const value = allDay ? ";VALUE=DATE" : "";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//changle.ca//When Works//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${entry.code}@when.changle.ca`,
    `DTSTAMP:${utc(entry.setAt)}`,
    `SUMMARY:${text(entry.title)}`,
    `DTSTART${value}:${start}`,
    `DTEND${value}:${end}`,
    `URL:${address(entry)}`,
    `DESCRIPTION:${text(description(entry))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}

/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarUrl(entry: CalendarEntry): string {
  const { start, end } = range(entry);
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    dates: `${start}/${end}`,
    details: description(entry),
  });
  return `https://calendar.google.com/calendar/render?${query}`;
}
