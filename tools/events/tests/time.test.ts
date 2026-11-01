// Vancouver time. B.C. has kept daylight time all year since 8 March 2026 (UTC-7, "Pacific time"):
// the clocks did not go back on 1 November 2026. Times come from the time-zone database, never a
// fixed offset, so the last change (2 November 2025) still reads right too.
import { describe, expect, it } from "vitest";
import { addDays, fromVan, vanIso, vanParts, windowOf } from "../src/time";

describe("Vancouver time", () => {
  it("writes an instant with the offset in force that day", () => {
    expect(vanIso(Date.parse("2026-10-31T19:00:00Z"))).toBe("2026-10-31T12:00:00-07:00");
    expect(vanIso(Date.parse("2026-11-02T03:30:00Z"))).toBe("2026-11-01T20:30:00-07:00");
    expect(vanIso(Date.parse("2026-01-15T20:00:00Z"))).toBe("2026-01-15T12:00:00-08:00");
  });
  it("reads wall-clock time, before and after B.C. stopped changing the clocks", () => {
    expect(fromVan("2026-11-01T10:15")).toBe(Date.parse("2026-11-01T17:15:00Z"));
    expect(fromVan("2026-12-20T10:15")).toBe(Date.parse("2026-12-20T17:15:00Z"));
    expect(fromVan("2025-12-20T10:15")).toBe(Date.parse("2025-12-20T18:15:00Z"));
    // 01:30 happened twice on 2 November 2025: the first one (still summer time)
    expect(fromVan("2025-11-02T01:30")).toBe(Date.parse("2025-11-02T08:30:00Z"));
  });
  it("one of 13:00 and 14:00 UTC is 06:00 in Vancouver, whatever the rules", () => {
    for (const day of ["2025-07-01", "2025-12-01", "2026-11-02", "2027-01-15"]) {
      const hours = [13, 14].map((h) => vanParts(Date.parse(`${day}T${h}:00:00Z`)).hour);
      expect(hours.filter((h) => h === 6)).toHaveLength(1);
    }
  });
  it("a run's window is its day and the 13 after, in local time", () => {
    const w = windowOf("2026-10-31");
    expect(w.to).toBe("2026-11-13");
    expect(w.fromMs).toBe(Date.parse("2026-10-31T07:00:00Z"));
    expect(w.toMs).toBe(Date.parse("2026-11-14T07:00:00Z"));
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
