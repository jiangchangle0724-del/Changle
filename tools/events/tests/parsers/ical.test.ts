import { describe, expect, it } from "vitest";
import edge from "../fixtures/ical/edge-cases.ics?raw";
import expected from "../fixtures/ical/edge-cases.expected.json";
import ubc from "../fixtures/ical/ubc-2026-10-31.ics?raw";
import luma from "../fixtures/luma/vancouver-2026-10-31.ics?raw";
import { parseIcal } from "../../src/parsers/ical";
import { windowOf } from "../../src/time";

const opts = (date = "2026-10-31", days = 14) => ({ source: "test", ...windowOf(date, days) });
// Synthetic inputs stay here; the saved fixtures are read unchanged.
const calendar = (...components: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...components, "END:VCALENDAR"].join("\r\n");
const event = (...properties: string[]) => ["BEGIN:VEVENT", ...properties, "END:VEVENT"].join("\r\n");
const series = (uid: string, ...properties: string[]) => event(
  `UID:${uid}`, `SUMMARY:${uid}`, "DTSTART;TZID=America/Vancouver:20261101T190000",
  "DTEND;TZID=America/Vancouver:20261101T200000", "RRULE:FREQ=DAILY;COUNT=3", ...properties,
);

describe("iCal saved feeds", () => {
  it.each(Object.entries(expected.windows))("matches every listed field for %s, with no extra recurrences", (day, entries) => {
    const events = parseIcal(edge, opts(day));
    for (const entry of entries) {
      const matches = events.filter((e) => e.sourceEventId === entry.sourceEventId);
      expect(matches, entry.sourceEventId).toHaveLength(1);
      expect(matches[0]).toMatchObject(entry);
    }
    const recurrences = events.filter((e) => /@(2025|2026)-/.test(e.sourceEventId));
    expect(recurrences.map((e) => e.sourceEventId).sort()).toEqual(
      entries.filter((e) => /@(2025|2026)-/.test(e.sourceEventId)).map((e) => e.sourceEventId).sort(),
    );
    expect(events.filter((e) => !/@(2025|2026)-/.test(e.sourceEventId))).toHaveLength(7);
  });

  it("reads all 30 UBC events, preserves every VALUE=DATE start and uses runtime November offsets", () => {
    const events = parseIcal(ubc, opts());
    expect(events).toHaveLength(30);
    const allDay = events.filter((e) => e.allDay);
    // The card says six all-day events; the saved feed has three (six date properties).
    expect(ubc.match(/^DTSTART;VALUE=DATE:/gm)).toHaveLength(3);
    expect(allDay).toHaveLength(3);
    for (const e of allDay) expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(events.find((e) => e.title === "UBC Farm Workshops – Summer Series")).toMatchObject({
      start: "2026-07-19", end: "2026-12-08", allDay: true,
    });
    const november = events.filter((e) => !e.allDay && e.start.startsWith("2026-11"));
    expect(november.length).toBeGreaterThan(0);
    for (const e of november) {
      expect(e.start).toMatch(/-07:00$/);
      if (e.end) expect(e.end).toMatch(/-07:00$/);
    }
  });

  it("keeps the 15 Luma events, their URLs and GEO", () => {
    const events = parseIcal(luma, opts());
    expect(events).toHaveLength(15);
    expect(events.find((e) => e.title === "Ocean Theme Halloween!")).toMatchObject({
      url: "https://luma.com/event/evt-OH43dsNCPMqRXGZ", start: "2026-10-31T20:00:00-07:00", end: "2026-11-01T00:30:00-07:00", place: null,
    });
    const bios = events.find((e) => e.title.startsWith("BIOS SPHERE"))!;
    expect(bios.place?.lat).toBeCloseTo(49.273, 2);
    expect(bios.place?.lon).toBeCloseTo(-123.103, 2);
    for (const e of events) expect(e.description?.length ?? 0).toBeLessThanOrEqual(600);
  });
});

describe("iCal recurrence identity and boundaries", () => {
  it("replaces exactly one occurrence with its own title, times, place, URL and cancelled status", () => {
    const moved = event("UID:a", "RECURRENCE-ID;TZID=America/Vancouver:20261102T190000",
      "DTSTART;TZID=America/Vancouver:20261104T183000", "DURATION:PT30M", "SUMMARY:Moved",
      "LOCATION:New Hall, 123 Main St, Vancouver, BC V6A 3V6, Canada", "STATUS:CANCELLED", "URL:https://example.org/moved");
    // Exception before master, plus another UID on the same date: never cross-link them.
    const events = parseIcal(calendar(moved, series("a"), series("b")), opts());
    expect(events).toHaveLength(6);
    expect(events.find((e) => e.sourceEventId === "a@2026-11-02")).toMatchObject({
      title: "Moved", start: "2026-11-04T18:30:00-07:00", end: "2026-11-04T19:00:00-07:00",
      status: "cancelled", url: "https://example.org/moved", place: { name: "New Hall" },
    });
    expect(events.find((e) => e.sourceEventId === "b@2026-11-02")).toMatchObject({
      title: "b", start: "2026-11-02T19:00:00-07:00", status: "scheduled",
    });
  });

  it("uses the original source date for IDs even when UTC is the next Vancouver date", () => {
    const events = parseIcal(calendar(event("UID:utc-series", "SUMMARY:UTC", "DTSTART:20261102T020000Z",
      "DURATION:PT1H", "RRULE:FREQ=DAILY;COUNT=2", "EXDATE:20261103T020000Z")), opts());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sourceEventId: "utc-series@2026-11-02", start: "2026-11-01T19:00:00-07:00" });
  });

  it("matches a UTC recurrence ID against a zoned master", () => {
    const events = parseIcal(calendar(series("a"), event("UID:a", "RECURRENCE-ID:20261103T020000Z",
      "DTSTART:20261103T030000Z", "SUMMARY:UTC override")), opts());
    expect(events).toHaveLength(3);
    expect(events.find((e) => e.sourceEventId === "a@2026-11-02")).toMatchObject({ title: "UTC override", start: "2026-11-02T20:00:00-07:00" });
  });

  it("filters by actual start, includes moved-in instances and excludes moved-out instances", () => {
    const events = parseIcal(calendar(series("a"),
      event("UID:a", "RECURRENCE-ID;TZID=America/Vancouver:20261103T190000", "DTSTART:20261101T180000", "SUMMARY:Moved in"),
      event("UID:a", "RECURRENCE-ID;TZID=America/Vancouver:20261101T190000", "DTSTART:20261104T180000", "SUMMARY:Moved out"),
    ), opts("2026-11-01", 1));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sourceEventId: "a@2026-11-03", title: "Moved in", start: "2026-11-01T18:00:00-07:00" });
  });

  it("includes fromMs, excludes toMs and handles RDATE with EXDATE", () => {
    const events = parseIcal(calendar(event("UID:dates", "SUMMARY:Dates", "DTSTART:20261031T000000",
      "RDATE:20261101T000000,20261102T000000", "EXDATE:20261101T000000")), opts("2026-10-31", 2));
    expect(events.map((e) => e.sourceEventId)).toEqual(["dates@2026-10-31"]);
  });

  it("does not resurrect an excluded original date when an override moves it into the window", () => {
    const events = parseIcal(calendar(series("a", "EXDATE;TZID=America/Vancouver:20261103T190000"),
      event("UID:a", "RECURRENCE-ID;TZID=America/Vancouver:20261103T190000", "DTSTART:20261101T180000", "SUMMARY:Excluded"),
    ), opts("2026-11-01", 1));
    expect(events.map((e) => e.sourceEventId)).toEqual(["a@2026-11-01"]);
  });

  it("uses an all-day override's inclusive last day while retaining the original occurrence ID", () => {
    const events = parseIcal(calendar(
      event("UID:days", "SUMMARY:Days", "DTSTART;VALUE=DATE:20261101", "RRULE:FREQ=DAILY;COUNT=2"),
      event("UID:days", "RECURRENCE-ID;VALUE=DATE:20261102", "DTSTART;VALUE=DATE:20261104",
        "DTEND;VALUE=DATE:20261107", "SUMMARY:Moved days"),
    ), opts());
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ sourceEventId: "days@2026-11-02", title: "Moved days", start: "2026-11-04", end: "2026-11-06", allDay: true });
  });

  it("finds an old series beyond the former 240-iteration cutoff and caps each series at 60", () => {
    const daily = (uid: string) => event(`UID:${uid}`, `SUMMARY:${uid}`, "DTSTART:20200101T100000", "RRULE:FREQ=DAILY");
    const events = parseIcal(calendar(daily("a"), daily("b")), opts("2026-10-31", 90));
    expect(events).toHaveLength(120);
    for (const uid of ["a", "b"]) {
      const dates = events.filter((e) => e.sourceEventId.startsWith(`${uid}@`));
      expect(dates).toHaveLength(60);
      expect(dates[0].start).toBe("2026-10-31T10:00:00-07:00");
      expect(new Set(dates.map((e) => e.sourceEventId)).size).toBe(60);
    }
  });
});

describe("iCal time zones and field normalization", () => {
  const customZone = (offset: string) => ["BEGIN:VTIMEZONE", "TZID:Custom/Pacific", "BEGIN:STANDARD",
    "DTSTART:19700101T000000", `TZOFFSETFROM:${offset}`, `TZOFFSETTO:${offset}`, "END:STANDARD", "END:VTIMEZONE"].join("\r\n");

  it("uses unknown TZIDs' own VTIMEZONE and keeps calendar definitions isolated", () => {
    const custom = event("UID:custom", "SUMMARY:Custom", "DTSTART;TZID=Custom/Pacific:20261107T190000", "DURATION:PT1H");
    for (const [offset, start] of [["-0500", "2026-11-07T17:00:00-07:00"], ["-0800", "2026-11-07T20:00:00-07:00"], ["-0500", "2026-11-07T17:00:00-07:00"]]) {
      expect(parseIcal(calendar(customZone(offset), custom), opts())[0].start).toBe(start);
    }
  });

  it("uses Intl for a known non-Vancouver TZID even without a VTIMEZONE", () => {
    const events = parseIcal(calendar(event("UID:ny", "SUMMARY:New York", "DTSTART;TZID=America/New_York:20261107T190000", "DURATION:PT1H30M")), opts());
    expect(events[0]).toMatchObject({ start: "2026-11-07T17:00:00-07:00", end: "2026-11-07T18:30:00-07:00" });
  });

  it("calculates explicit ends and recurrence durations across the historical clock change", () => {
    const events = parseIcal(calendar(event("UID:overnight", "SUMMARY:Overnight", "DTSTART;TZID=America/Vancouver:20251101T230000",
      "DTEND;TZID=America/Vancouver:20251102T030000", "RRULE:FREQ=DAILY;COUNT=2")), opts("2025-11-01"));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ start: "2025-11-01T23:00:00-07:00", end: "2025-11-02T03:00:00-08:00" });
    expect(events[1]).toMatchObject({ start: "2025-11-02T23:00:00-08:00", end: "2025-11-03T04:00:00-08:00" });
  });

  it("distinguishes a nominal day from 24 elapsed hours across the historical clock change", () => {
    const durationEvent = (uid: string, duration: string) => event(`UID:${uid}`, `SUMMARY:${uid}`,
      "DTSTART;TZID=America/Vancouver:20251101T120000", `DURATION:${duration}`);
    const events = parseIcal(calendar(durationEvent("day", "P1D"), durationEvent("hours", "PT24H")), opts("2025-11-01"));
    expect(events[0].end).toBe("2025-11-02T12:00:00-08:00");
    expect(events[1].end).toBe("2025-11-02T11:00:00-08:00");
  });

  it("handles all-day default ends, exclusive multi-day ends and duration for recurrences", () => {
    const events = parseIcal(calendar(
      event("UID:one", "SUMMARY:One", "DTSTART;VALUE=DATE:20261101"),
      event("UID:explicit", "SUMMARY:Explicit", "DTSTART;VALUE=DATE:20261101", "DTEND;VALUE=DATE:20261102"),
      event("UID:multi", "SUMMARY:Multi", "DTSTART;VALUE=DATE:20261101", "DURATION:P3D", "RRULE:FREQ=WEEKLY;COUNT=2"),
    ), opts());
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ start: "2026-11-01", end: null, allDay: true });
    expect(events[1].end).toBeNull();
    expect(events[2]).toMatchObject({ sourceEventId: "multi@2026-11-01", start: "2026-11-01", end: "2026-11-03", allDay: true });
    expect(events[3]).toMatchObject({ sourceEventId: "multi@2026-11-08", end: "2026-11-10" });
  });

  it("keeps a URL location out of place and limits plain descriptions", () => {
    const events = parseIcal(calendar(event("UID:fields", "SUMMARY:Fields", "DTSTART:20261101T190000",
      "LOCATION:https://example.org/online", "GEO:49.25;-123.1", `DESCRIPTION:<p>${"a".repeat(700)}</p>`)), opts());
    expect(events[0]).toMatchObject({ url: "https://example.org/online", place: null });
    expect(events[0].description).toBe("a".repeat(600));
    expect(events[0].end).toBeNull();
  });
});
