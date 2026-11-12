import { describe, expect, it, vi } from "vitest";
import ICAL from "ical.js";
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

describe("bounded recurrence expansion and isolated overrides", () => {
  const recurring = (uid: string, start: string, rule: string, ...fields: string[]) => event(
    `UID:${uid}`, `SUMMARY:${uid}`, `DTSTART:${start}`, `RRULE:${rule}`, ...fields,
  );

  it("fast-forwards a daily series from 2015 and keeps every window date and original ID", () => {
    const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
    try {
      const events = parseIcal(calendar(recurring("daily", "20150101T100000", "FREQ=DAILY", "DURATION:PT1H")), opts());
      const dates = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
        "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
      expect(events.map((e) => e.sourceEventId)).toEqual(dates.map((d) => `daily@${d}`));
      expect(events.map((e) => e.start)).toEqual(dates.map((d) => `${d}T10:00:00-07:00`));
      expect(next.mock.calls.length).toBeLessThan(20);
    } finally { next.mockRestore(); }
  });

  it.each([
    ["FREQ=WEEKLY", ["2026-11-02", "2026-11-09"]],
    ["FREQ=WEEKLY;INTERVAL=2", ["2026-11-02"]],
    ["FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH", ["2026-11-03", "2026-11-05"]],
  ])("preserves weekly weekday/INTERVAL phase from 2010: %s", (rule, dates) => {
    const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
    try {
      const events = parseIcal(calendar(recurring("weekly", "20100104T190000", rule as string)), opts());
      expect(events.map((e) => e.sourceEventId)).toEqual((dates as string[]).map((d) => `weekly@${d}`));
      expect(next.mock.calls.length).toBeLessThan(15);
    } finally { next.mockRestore(); }
  });

  it("retains daily INTERVAL phase, implicit month days and yearly months through fast-forwarding", () => {
    const events = parseIcal(calendar(
      recurring("three", "20150101T100000", "FREQ=DAILY;INTERVAL=3"),
      recurring("month-end", "20150131T100000", "FREQ=MONTHLY"),
      recurring("yearly", "20101102T100000", "FREQ=YEARLY;INTERVAL=2"),
    ), opts());
    expect(events.filter((e) => e.title === "three").map((e) => e.start.slice(0, 10))).toEqual(["2026-11-02", "2026-11-05", "2026-11-08", "2026-11-11"]);
    expect(events.find((e) => e.title === "month-end")?.start).toBe("2026-10-31T10:00:00-07:00");
    expect(events.find((e) => e.title === "yearly")?.start).toBe("2026-11-02T10:00:00-07:00");
  });

  it("preserves leap-day defaults when moving a yearly anchor", () => {
    const events = parseIcal(calendar(recurring("leap", "20120229T100000", "FREQ=YEARLY")), opts("2028-02-20", 20));
    expect(events.map((e) => e.sourceEventId)).toEqual(["leap@2028-02-29"]);
  });

  it("skips expired UNTIL rules without calling next, but still processes their overrides", () => {
    const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
    try {
      const events = parseIcal(calendar(
        recurring("expired", "20100104T190000", "FREQ=MINUTELY;UNTIL=20110104T190000"),
        event("UID:expired", "RECURRENCE-ID:20100105T190000", "DTSTART:20261102T180000", "SUMMARY:Moved from expired series"),
      ), opts());
      expect(events.map((e) => e.sourceEventId)).toEqual(["expired@2010-01-05"]);
      expect(next).not.toHaveBeenCalled();
    } finally { next.mockRestore(); }
  });

  it("retains an RDATE after an expired rule and an UNTIL occurrence that still overlaps the window", () => {
    const events = parseIcal(calendar(
      recurring("extra", "20150101T100000", "FREQ=DAILY;UNTIL=20150102T100000", "RDATE:20261102T100000"),
      recurring("last-overnight", "20261030T230000", "FREQ=DAILY;UNTIL=20261030T230000", "DURATION:PT2H"),
    ), opts("2026-10-31", 3));
    expect(events.map((e) => e.sourceEventId)).toEqual(["extra@2026-11-02", "last-overnight@2026-10-30"]);
  });

  it("fast-forwards MINUTELY across source dates and returns quickly", () => {
    const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
    try {
      const events = parseIcal(calendar(
        recurring("minute-a", "20150101T000000", "FREQ=MINUTELY"),
        recurring("minute-b", "20100101T000000", "FREQ=MINUTELY"),
        event("UID:single", "SUMMARY:Still parsed", "DTSTART:20261102T100000"),
      ), opts());
      const minuteA = events.filter((e) => e.title === "minute-a");
      expect(minuteA).toHaveLength(14);
      expect(minuteA[0].start).toBe("2026-10-31T00:00:00-07:00");
      expect(minuteA[13].start).toBe("2026-11-13T00:00:00-07:00");
      expect(events.find((e) => e.sourceEventId === "single")?.title).toBe("Still parsed");
      expect(next.mock.calls.length).toBeLessThan(100);
    } finally { next.mockRestore(); }
  }, 1000);

  it("does not fast-forward COUNT, calls no emit for old dates and stops at the shared budget", () => {
    const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
    const details = vi.spyOn(ICAL.Event.prototype, "getOccurrenceDetails");
    const intl = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    try {
      const events = parseIcal(calendar(
        recurring("counted", "20150101T100000", "FREQ=DAILY;COUNT=100000"),
        recurring("counted-too", "20100104T100000", "FREQ=WEEKLY;COUNT=100000"),
      ), opts());
      expect(events).toEqual([]);
      expect(next.mock.calls).toHaveLength(400);
      expect(details).not.toHaveBeenCalled();
      expect(intl.mock.calls.length).toBeLessThan(30);
    } finally { next.mockRestore(); details.mockRestore(); intl.mockRestore(); }
  });

  it("keeps the next eligible minute when the first minute of a date is excluded", () => {
    const events = parseIcal(calendar(recurring("minute", "20200101T000000", "FREQ=MINUTELY", "EXDATE:20261031T000000")), opts());
    expect(events).toHaveLength(14);
    expect(events[0]).toMatchObject({ sourceEventId: "minute@2026-10-31", start: "2026-10-31T00:01:00-07:00" });
  });

  it("processes overrides after exhausting a series' 200-next budget", () => {
    const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
    try {
      const events = parseIcal(calendar(
        recurring("counted", "20150101T100000", "FREQ=DAILY;COUNT=100000"),
        event("UID:counted", "RECURRENCE-ID:20150102T100000", "DTSTART:20261102T180000", "SUMMARY:Moved after cap"),
      ), opts());
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ sourceEventId: "counted@2015-01-02", title: "Moved after cap", start: "2026-11-02T18:00:00-07:00" });
      expect(next.mock.calls).toHaveLength(200);
    } finally { next.mockRestore(); }
  });

  it("ignores an override without DTSTART and leaves its original occurrence intact", () => {
    const events = parseIcal(calendar(series("a"), event("UID:a", "RECURRENCE-ID:20261102T190000", "SUMMARY:Broken override")), opts());
    expect(events).toHaveLength(3);
    expect(events.find((e) => e.sourceEventId === "a@2026-11-02")).toMatchObject({ title: "a", start: "2026-11-02T19:00:00-07:00" });
  });

  it.each(["FREQ=FOO", "FREQ=MONTHLY;BYYEARDAY=1"])("isolates a malformed series (%s) from healthy events", (rule) => {
    const events = parseIcal(calendar(
      event("UID:first", "SUMMARY:First", "DTSTART:20261101T100000"),
      recurring("bad", "20261101T100000", rule),
      series("good"),
    ), opts());
    expect(events.map((e) => e.sourceEventId)).toEqual(["first", "good@2026-11-01", "good@2026-11-02", "good@2026-11-03"]);
  });

  it("keeps orphan overrides by RECURRENCE-ID date and filters their actual overlap with the window", () => {
    const orphan = (uid: string, start: string, duration = "PT1H") => event(`UID:${uid}`, "RECURRENCE-ID:20260101T190000",
      `DTSTART:${start}`, `DURATION:${duration}`, "SUMMARY:Orphan");
    const events = parseIcal(calendar(
      orphan("inside", "20261102T190000"), orphan("overlap", "20261030T233000"),
      orphan("outside", "20261115T190000"), orphan("ended", "20261030T230000"),
      event("UID:no-start", "RECURRENCE-ID:20261102T190000", "SUMMARY:Missing start"),
    ), opts());
    expect(events.map((e) => e.sourceEventId)).toEqual(["inside@2026-01-01", "overlap@2026-01-01"]);
  });

  it("inherits missing override fields and duration from the master while keeping explicit replacements", () => {
    const events = parseIcal(calendar(
      series("a", "DESCRIPTION:Master description", "LOCATION:Master Hall, Vancouver, BC V6A 3V6", "GEO:49.25;-123.1", "STATUS:CANCELLED", "URL:https://example.org/master"),
      event("UID:a", "RECURRENCE-ID:20261102T190000", "DTSTART:20261102T210000"),
      event("UID:a", "RECURRENCE-ID:20261103T190000", "DTSTART:20261103T220000", "SUMMARY:Own title", "STATUS:CONFIRMED"),
    ), opts());
    expect(events).toHaveLength(3);
    expect(events[1]).toMatchObject({ sourceEventId: "a@2026-11-02", title: "a", description: "Master description",
      start: "2026-11-02T21:00:00-07:00", end: "2026-11-02T22:00:00-07:00", status: "cancelled",
      url: "https://example.org/master", place: { name: "Master Hall", lat: 49.25, lon: -123.1 } });
    expect(events[2]).toMatchObject({ title: "Own title", status: "scheduled", end: "2026-11-03T23:00:00-07:00" });
  });

  it("includes ongoing timed and all-day recurrences, excludes an end equal to fromMs", () => {
    const events = parseIcal(calendar(
      recurring("overnight", "20261030T230000", "FREQ=DAILY;COUNT=3", "DURATION:PT2H"),
      recurring("ends-at-boundary", "20261030T220000", "FREQ=DAILY;COUNT=3", "DURATION:PT2H"),
      event("UID:days", "SUMMARY:Days", "DTSTART;VALUE=DATE:20261025", "DURATION:P8D", "RRULE:FREQ=WEEKLY;COUNT=2"),
    ), opts("2026-10-31", 1));
    expect(events.map((e) => e.sourceEventId)).toEqual([
      "overnight@2026-10-30", "overnight@2026-10-31", "ends-at-boundary@2026-10-31", "days@2026-10-25",
    ]);
    expect(events[0].end).toBe("2026-10-31T01:00:00-07:00");
    expect(events[3]).toMatchObject({ start: "2026-10-25", end: "2026-11-01", allDay: true });
  });

  it("matches a UTC master's occurrence to a TZID recurrence ID by instant", () => {
    const events = parseIcal(calendar(
      recurring("utc-master", "20261102T020000Z", "FREQ=DAILY;COUNT=2", "DURATION:PT1H"),
      event("UID:utc-master", "RECURRENCE-ID;TZID=America/Vancouver:20261101T190000", "DTSTART:20261102T040000Z", "SUMMARY:TZID override"),
    ), opts());
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ sourceEventId: "utc-master@2026-11-02", title: "TZID override", start: "2026-11-01T21:00:00-07:00" });
  });

  it.each([
    ["FREQ=MONTHLY;BYDAY=2TU", ["2026-11-10"]],
    ["FREQ=MONTHLY;BYDAY=-1FR", []],
    ["FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", []],
  ])("normalizes the monthly seed from 2012 before constructing the iterator: %s", (rule, dates) => {
    const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
    const month = vi.spyOn(ICAL.RecurIterator.prototype, "increment_month");
    try {
      const events = parseIcal(calendar(recurring("monthly", "20120101T100000", rule as string)), opts());
      expect(events.map((e) => e.sourceEventId)).toEqual((dates as string[]).map((d) => `monthly@${d}`));
      expect(next.mock.calls.length).toBeLessThan(8);
      // next() itself can walk months internally; counting only its public calls misses this bug.
      expect(month.mock.calls.length).toBeLessThan(8);
    } finally { next.mockRestore(); month.mockRestore(); }
  });

  it("expands ordinary weekly series before costly COUNT series regardless of feed order", () => {
    const count = recurring("huge-count", "20200101T100000", "FREQ=DAILY;COUNT=3000");
    const weekly = recurring("ordinary", "20100104T190000", "FREQ=WEEKLY");
    for (const components of [[count, weekly], [weekly, count]]) {
      const next = vi.spyOn(ICAL.RecurIterator.prototype, "next");
      try {
        const events = parseIcal(calendar(...components), opts());
        expect(events.map((e) => e.sourceEventId)).toEqual(["ordinary@2026-11-02", "ordinary@2026-11-09"]);
        expect(next.mock.calls.length).toBeGreaterThanOrEqual(200);
        expect(next.mock.calls.length).toBeLessThan(210);
      } finally { next.mockRestore(); }
    }
  });

  it("caps each of three old COUNT series at 200 next calls and the feed at 400", () => {
    const perSeries = new Map<string, number>();
    const advance = ICAL.RecurIterator.prototype.next;
    // Count individual iterator anchors as well as the total; the third series gets no budget.
    const counted = vi.spyOn(ICAL.RecurIterator.prototype, "next").mockImplementation(function (this: ICAL.RecurIterator, again) {
      const key = this.dtstart.toString();
      perSeries.set(key, (perSeries.get(key) ?? 0) + 1);
      return advance.call(this, again);
    });
    try {
      const events = parseIcal(calendar(
        recurring("a", "20150101T100000", "FREQ=DAILY;COUNT=100000"),
        recurring("b", "20160101T100000", "FREQ=DAILY;COUNT=100000"),
        recurring("c", "20170101T100000", "FREQ=DAILY;COUNT=100000"),
      ), opts());
      expect(events).toEqual([]);
      expect(counted.mock.calls).toHaveLength(400);
      expect([...perSeries.values()]).toEqual([200, 200]);
    } finally { counted.mockRestore(); }
  });

  it.each([
    ["FREQ=HOURLY;BYHOUR=10,15", "20121001T100000", "10:00:00-07:00"],
    ["FREQ=MINUTELY;INTERVAL=30;BYHOUR=9", "20121001T090000", "09:00:00-07:00"],
    ["FREQ=HOURLY;BYHOUR=10,15", "20121001T100000Z", "03:00:00-07:00"],
  ])("keeps the first allowed time on every source date without restarting BY rules: %s %s", (rule, start, suffix) => {
    const events = parseIcal(calendar(recurring("hours", start, rule)), opts());
    expect(events).toHaveLength(14);
    expect(events[0].sourceEventId).toBe("hours@2026-10-31");
    expect(events[13].sourceEventId).toBe("hours@2026-11-13");
    for (const e of events) expect(e.start).toBe(`${e.sourceEventId.slice(-10)}T${suffix}`);
  });

  it("does not add DTSTART separately when it does not match an RRULE's BYDAY", () => {
    const events = parseIcal(calendar(recurring("wednesday", "20261103T100000", "FREQ=WEEKLY;BYDAY=WE")), opts());
    expect(events.map((e) => e.sourceEventId)).toEqual(["wednesday@2026-11-04", "wednesday@2026-11-11"]);
  });

  it("takes an override's LOCATION and GEO together rather than inheriting coordinates for a new place", () => {
    const master = series("places", "LOCATION:Central Library, 350 W Georgia St, Vancouver, BC V6B 6B1", "GEO:49.28;-123.12");
    const events = parseIcal(calendar(master,
      event("UID:places", "RECURRENCE-ID:20261102T190000", "DTSTART:20261102T200000", "LOCATION:Richmond Olympic Oval, 6111 River Rd, Richmond, BC V7C 0A2"),
      event("UID:places", "RECURRENCE-ID:20261103T190000", "DTSTART:20261103T200000"),
    ), opts());
    expect(events[1].place).toMatchObject({ name: "Richmond Olympic Oval", city: "Richmond" });
    expect(events[1].place).not.toHaveProperty("lat");
    expect(events[1].place).not.toHaveProperty("lon");
    expect(events[2].place).toMatchObject({ name: "Central Library", lat: 49.28, lon: -123.12 });
    const located = parseIcal(calendar(master,
      event("UID:places", "RECURRENCE-ID:20261102T190000", "DTSTART:20261102T200000", "LOCATION:Richmond Olympic Oval", "GEO:49.17;-123.15"),
    ), opts());
    expect(located[1].place).toMatchObject({ name: "Richmond Olympic Oval", lat: 49.17, lon: -123.15 });
  });

  it.each([
    ["RDATE;VALUE=PERIOD:20261103T180000Z/20261103T190000Z,20261105T180000Z/PT2H", "11:00:00-07:00"],
    ["RDATE;TZID=America/Vancouver;VALUE=PERIOD:20261103T100000/20261103T120000,20261105T100000/PT2H", "10:00:00-07:00"],
  ])("uses RDATE period starts while preserving the rest of the series: %s", (rdate, time) => {
    const events = parseIcal(calendar(event("UID:periods", "SUMMARY:Periods", "DTSTART:20261101T100000", "DURATION:PT1H", rdate)), opts());
    expect(events.map((e) => e.sourceEventId)).toEqual(["periods@2026-11-01", "periods@2026-11-03", "periods@2026-11-05"]);
    expect(events[1].start).toBe(`2026-11-03T${time}`);
    expect(events[2].start).toBe(`2026-11-05T${time}`);
  });

  it("combines RDATE period starts with RRULE dates without losing either", () => {
    const events = parseIcal(calendar(recurring("period-rule", "20261101T100000", "FREQ=WEEKLY;COUNT=2",
      "RDATE;VALUE=PERIOD:20261103T180000Z/PT2H")), opts());
    expect(events.map((e) => e.sourceEventId)).toEqual(["period-rule@2026-11-01", "period-rule@2026-11-03", "period-rule@2026-11-08"]);
    expect(events[1].start).toBe("2026-11-03T11:00:00-07:00");
  });
});
