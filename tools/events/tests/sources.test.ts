import { describe, expect, it } from "vitest";
import ubcFeed from "./fixtures/ical/ubc-2026-10-31.ics?raw";
import { SOURCE_BY_ID } from "../src/sources";
import { fromVan } from "../src/time";

describe("UBC: what anyone can walk into", () => {
  const ubc = SOURCE_BY_ID.ubc;
  const w = { runId: "2026-11-01", fromMs: fromVan("2026-11-01"), toMs: fromVan("2026-11-15") };

  it("reads the window two days at a time", () => {
    expect(ubc.request(0, {} as Env, w)).toBe("https://events.ubc.ca/events/list/?ical=1&tribe-bar-date=2026-11-01");
    expect(ubc.request(3, {} as Env, w)).toBe("https://events.ubc.ca/events/list/?ical=1&tribe-bar-date=2026-11-07");
  });

  it("keeps events open to all or the community, at a real place on campus", async () => {
    const first = await ubc.parse(ubcFeed, 0, w);
    expect(first.more).toBe(true);
    expect(first.events.map((e) => e.title).sort()).toEqual([
      "Arts Multilingual Week (Oct 26–Nov 19)",
      "Chung | Lind Gallery Weekly Drop-In Tour",
      "Pedagogies of Play",
      "UBC Farm Workshops – Summer Series",
      "UBC x Jade Music Fest 2026 | Panel Discussion: Who Gets Heard?",
      "Wednesday Noon Hours: La Modestine Ensemble",
    ]);
    // the 30 in the file also hold online courses for doctors (UBC CPD), staff training and student-only workshops
    const farm = first.events.find((e) => e.title.startsWith("UBC Farm"))!;
    expect(farm.place?.city).toBe("Vancouver");
    // an answer that runs past the window, or an empty one, ends the reading
    const late = { ...w, toMs: fromVan("2026-11-03") };
    expect((await ubc.parse(ubcFeed, 0, late)).more).toBe(false);
    expect((await ubc.parse("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n", 1, w)).more).toBe(false);
  });
});
