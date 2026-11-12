// Calendar subscriptions, read back by ical.js; the Worker uses local D1/KV and saved feeds only.
import { env } from "cloudflare:workers";
import ICAL from "ical.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toIcs } from "../src/ics";
import { LIVE_KEY, publish } from "../src/publish";
import { fetchStep, runDay, type StepRunner } from "../src/run";
import type { PublicEvent, Published } from "../src/types";
import worker from "../src/worker";
import sample from "./fixtures/ics/sample-events.json";
import luma from "./fixtures/luma/vancouver-2026-10-31.ics?raw";
import vpl from "./fixtures/bibliocommons/vpl-2026-10-31-p1.json?raw";
import rpl from "./fixtures/bibliocommons/rpl-2026-11-01-p1.json?raw";
import ubc from "./fixtures/ical/ubc-2026-10-31.ics?raw";
import bpl from "./fixtures/bpl/events-2026-11-01.json?raw";

const events = sample.events as PublicEvent[];
const opts = { name: "玩什么 · What's On", now: new Date("2026-11-01T13:00:00Z") };
const calendar = (value: string) => new ICAL.Component(ICAL.parse(value));
const entries = (value: string) => calendar(value).getAllSubcomponents("vevent").map((c) => new ICAL.Event(c));

function expectPhysicalLines(value: string) {
  expect(value.endsWith("\r\n")).toBe(true);
  expect(value.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  for (const line of value.split("\r\n")) {
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // An astral character must stay whole on its physical line, too.
    expect(line).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("the .ics calendar", () => {
  it("publishes the calendar metadata, refresh interval and an empty calendar", () => {
    const value = toIcs([], opts);
    expect(value).toBe([
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//changle.ca//What's On//ZH",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${opts.name}`,
      "X-WR-TIMEZONE:America/Vancouver", "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H", "END:VCALENDAR", "",
    ].join("\r\n"));
    expect(entries(value)).toEqual([]);
    expectPhysicalLines(value);
  });

  it("round-trips all ten saved events: identity, text, timestamps, UTC instants and inclusive all-day dates", () => {
    const before = JSON.stringify(events);
    const value = toIcs(events, opts);
    expectPhysicalLines(value);
    expect(value).not.toMatch(/VTIMEZONE|TZID=/);
    const read = entries(value);
    expect(read).toHaveLength(10);
    for (const [i, input] of events.entries()) {
      const output = read[i];
      expect(output.uid).toBe(`${input.id}@changle.ca`);
      expect(output.summary).toBe(input.title);
      expect(output.component.getFirstPropertyValue("url")).toBe(input.url);
      expect(output.location).toBe([input.venue, input.address].filter(Boolean).join(", "));
      expect(output.component.getFirstPropertyValue("categories")).toBe(input.category);
      const stamp = output.component.getFirstPropertyValue("dtstamp") as ICAL.Time;
      expect(stamp.toJSDate().getTime()).toBe(Math.floor(Date.parse(input.updatedAt) / 1000) * 1000);
      expect(stamp.zone.tzid).toBe("UTC");
      const description = [
        ...(input.timeTBD ? ["时间待定 · Time to be announced"] : []),
        ...[input.summaryZh, input.summaryEn, input.url].filter(Boolean),
        `来源 Source: ${input.sourceName}`,
      ].join("\n");
      expect(output.description).toBe(description);
      if (input.allDay) {
        expect(output.startDate.isDate).toBe(true);
        expect(output.endDate.isDate).toBe(true);
        expect(output.startDate.toString()).toBe(input.start);
        const last = new Date(`${input.end ?? input.start}T00:00:00Z`);
        last.setUTCDate(last.getUTCDate() + 1);
        expect(output.endDate.toString()).toBe(last.toISOString().slice(0, 10));
      } else {
        expect(output.startDate.isDate).toBe(false);
        expect(output.startDate.zone.tzid).toBe("UTC");
        expect(output.endDate.zone.tzid).toBe("UTC");
        expect(output.startDate.toJSDate().getTime()).toBe(Date.parse(input.start));
        expect(output.endDate.toJSDate().getTime()).toBe(Date.parse(input.end!));
      }
    }
    expect(read[0].startDate.toString()).toBe("2026-11-02T15:30:00Z");
    expect(read[6].endDate.toString()).toBe("2026-11-09");
    expect(read[9].startDate.toString()).toBe("2025-11-02T18:00:00Z");
    expect(JSON.stringify(events)).toBe(before);
    // Refetching the same events doesn't change their identity or DTSTAMP.
    expect(toIcs(events, { ...opts, now: new Date("2026-11-02T13:00:00Z") })).toBe(value);
  });

  it("defaults a timed event with no end to two hours, including across midnight", () => {
    const [read] = entries(toIcs([{ ...events[8], end: null }], opts));
    expect(read.startDate.toString()).toBe("2026-11-14T06:30:00Z");
    expect(read.endDate.toString()).toBe("2026-11-14T08:30:00Z");
  });

  it("advances all-day ends over month/year boundaries and leap days; time TBD is a date", () => {
    for (const [start, end, exclusive] of [
      ["2026-12-31", null, "2027-01-01"],
      ["2028-02-28", "2028-02-29", "2028-03-01"],
    ]) {
      const [read] = entries(toIcs([{ ...events[7], start: start!, end, allDay: false }], opts));
      expect(read.startDate.toString()).toBe(start);
      expect(read.startDate.isDate).toBe(true);
      expect(read.endDate.toString()).toBe(exclusive);
      expect(read.description.split("\n")[0]).toBe("时间待定 · Time to be announced");
    }
  });

  it("escapes TEXT and folds ASCII, Chinese and emoji without changing any value", () => {
    const title = '夜🌙,;"\\'.repeat(40) + "\r\n第二行\r第三行\n第四行";
    const normalizedTitle = title.replace(/\r\n|\r/g, "\n");
    const input = { ...events[0], title, venue: title, address: "地址,;\\", summaryZh: title, summaryEn: "English\nnext; line, \\" };
    const name = "订阅,;\\\nNext";
    const value = toIcs([input], { ...opts, name });
    expectPhysicalLines(value);
    expect(value).toContain("\\,\\;\"\\\\");
    expect(value).toContain("\r\n ");
    // ical.js leaves unknown X-properties as raw values; check its escaped TEXT explicitly.
    expect(calendar(value).getFirstPropertyValue("x-wr-calname")).toBe("订阅\\,\\;\\\\\\nNext");
    const [read] = entries(value);
    expect(read.summary).toBe(normalizedTitle);
    expect(read.location).toBe(`${normalizedTitle}, ${input.address}`);
    expect(read.description).toBe(`${normalizedTitle}\n${input.summaryEn}\n${input.url}\n来源 Source: ${input.sourceName}`);
    // Exact octet boundaries, including a 4-byte code point on either side of a fold.
    for (const title of ["a".repeat(67), "a".repeat(68), "a".repeat(64) + "🌙", "a".repeat(65) + "🌙", "中文🌙".repeat(80)]) {
      const value = toIcs([{ ...events[0], title }], opts);
      expectPhysicalLines(value);
      expect(entries(value)[0].summary).toBe(title);
    }
  });
});

describe("the calendar subscription through the Worker", () => {
  it("runs the saved feeds, then returns only family events, matching the JSON API", async () => {
    await env.CACHE.delete(LIVE_KEY);
    for (const { name } of (await env.CACHE.list({ prefix: "handoff:" })).keys) await env.CACHE.delete(name);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
    for (const table of ["events", "venues", "sources", "fetch_log", "review_queue", "runs"]) await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    await env.DB.prepare("DELETE FROM schema_migrations").run();

    const emptyAfter = (page: string): string => {
      const empty = JSON.parse(page);
      empty.events.results = [];
      return JSON.stringify(empty);
    };
    const unexpected: string[] = [];
    const fetched = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === "events.ubc.ca") return new Response(url.searchParams.get("tribe-bar-date") === "2026-10-31" ? ubc : "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n");
      if (url.hostname === "bpl.bc.ca") return new Response(bpl);
      if (url.hostname === "api.lu.ma") return new Response(luma);
      if (url.hostname === "gateway.bibliocommons.com") {
        const lib = /\/libraries\/(\w+)\/events/.exec(url.pathname)?.[1];
        const page = lib === "vpl" ? vpl : lib === "yourlibrary" ? rpl : null;
        if (page) return new Response(url.searchParams.get("page") === "1" ? page : emptyAfter(page));
      }
      unexpected.push(url.toString());
      throw new Error(`Unexpected fixture request: ${url.hostname}`);
    });
    const steps: StepRunner = { fetchSource: (a) => fetchStep(env, a), publish: (a) => publish(env, a.runId) };
    expect(await runDay(steps, env.DB, "2026-10-31")).toMatchObject({ done: true, published: true });
    expect(unexpected).toEqual([]);
    expect(fetched).toHaveBeenCalled();
    const published = (await env.CACHE.get<Published>(LIVE_KEY, "json"))!;
    expect(published.count).toBeGreaterThan(0);
    const request = (path: string) => worker.fetch(new Request(`https://changle.ca${path}`) as Request<unknown, IncomingRequestCfProperties>, env);
    for (const query of ["cat=family", "cat=family&area=vancouver&tag=kids&from=2026-11-01&to=2026-11-03"]) {
      const json = await request(`/go/api/events?${query}`);
      const expected = (await json.json() as Published).events;
      expect(expected.length).toBeGreaterThan(0);
      expect(expected.every((e) => e.category === "family")).toBe(true);
      const res = await request(`/go/api/events.ics?${query}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
      const value = await res.text();
      expectPhysicalLines(value);
      const read = entries(value);
      expect(read.map((e) => e.uid)).toEqual(expected.map((e) => `${e.id}@changle.ca`));
      expect(read.every((e) => e.component.getFirstPropertyValue("categories") === "family")).toBe(true);
      expect(calendar(value).getFirstPropertyValue("x-wr-calname")).toContain("family");
    }
    // A subscription is served from the published cache, without any more fetches.
    expect(fetched.mock.calls.length).toBe(8);
  });
});
