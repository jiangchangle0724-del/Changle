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

  it.each([
    [500, false, "0ca676669a3665875d4b082f9412b0ceebb75e5d1751df6c70152bed9595e23e"],
    [500, true, "8ab46044041f09e7d91a1e5756627a61f39bb2b907aca2530108a71baf755765"],
    [1000, false, "9f1a18428cf0c722e7eae150b7c424fa7e7d0c7d16ff2860c51ab5d731e76cb8"],
    [1000, true, "56690da983089924ae46875c91f99cfff68aacf5f85ca36e02675c495cbedc75"],
  ] as const)("preserves the pre-review bytes for %i events (bilingual=%s)", async (count, bilingual, hash) => {
    // SHA-256 of the unmodified 195f34e generator, including CRLF and physical fold positions.
    const summaryZh = "一起探索温哥华的文化与生活，认识新朋友。活动提供适合家庭的体验，请提前查看主办方网页了解报名、交通和无障碍设施的信息。";
    const summaryEn = "Explore Vancouver's culture and community, meet new friends, and enjoy an activity for families. Check the organiser's page for registration, transport and accessibility details.";
    const input = Array.from({ length: count }, (_, i) => ({
      ...events[i % 10], id: `${events[i % 10].id}:${i}`, ...(bilingual ? { summaryZh, summaryEn } : {}),
    }));
    const value = toIcs(input, opts);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")).toBe(hash);
  });

  it("generates without TextEncoder or toISOString on the serialization path", () => {
    const encode = vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(() => { throw new Error("Unexpected encoding allocation"); });
    const iso = vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => { throw new Error("Unexpected ISO string formatting"); });
    expect(toIcs(events, opts)).toContain("DTSTART:20261102T153000Z\r\n");
    expect(encode).not.toHaveBeenCalled();
    expect(iso).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTPS://EXAMPLE.ORG:443/a/../event?q=hello world", "https://example.org/event?q=hello%20world"],
    ["http://EXAMPLE.ORG:80", "http://example.org/"],
  ])("normalizes an HTTP(S) link in both properties: %s", (url, expected) => {
    const [read] = entries(toIcs([{ ...events[0], url }], opts));
    expect(read.component.getFirstPropertyValue("url")).toBe(expected);
    expect(read.description).toBe(`${expected}\n来源 Source: Luma`);
  });

  it.each([
    "", " ", "not a URL", "http://", "//example.org/event", "ftp://example.org/event",
    "javascript:alert(1)", "data:text/plain,event", "mailto:events@example.org", "file:///event",
    "https://example.org/\r\nATTENDEE:injected", "https://example.org/\nSUMMARY:injected",
    "https://example.org/\rEND:VEVENT\rBEGIN:VEVENT\rUID:injected",
    "https://example.org/\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:injected",
    "https://example.org/\tbad", "https://example.org/\u0000bad",
  ])("omits an unsafe or invalid URL everywhere: %j", (url) => {
    const value = toIcs([{ ...events[0], url }], opts);
    const read = entries(value);
    expect(read).toHaveLength(1);
    expect(read[0].component.getFirstPropertyValue("url")).toBeNull();
    expect(read[0].description).toBe("来源 Source: Luma");
    expect(value.replace(/\r\n /g, "")).not.toContain("URL:");
    expect(value).not.toContain("injected");
  });

  it.each([
    ["postponed", "已延期 · Postponed", "已延期 Postponed · ", "TENTATIVE"],
    ["rescheduled", "已改期 · Rescheduled", "", null],
    ["soldout", "已售罄 · Sold out", "", null],
  ] as const)("makes %s visible before other description lines", (status, notice, prefix, icalStatus) => {
    const [read] = entries(toIcs([{ ...events[7], status, summaryZh: "中文简介", summaryEn: "English summary" }], opts));
    expect(read.summary).toBe(prefix + events[7].title);
    expect(read.component.getFirstPropertyValue("status")).toBe(icalStatus);
    expect(read.description.split("\n")).toEqual([
      notice, "时间待定 · Time to be announced", "中文简介", "English summary",
      events[7].url, "来源 Source: (hand-made)",
    ]);
  });

  it.each([null, "", events[8].start, "2026-11-13T22:30:00-07:00"])("uses two hours for an absent/non-increasing timed end: %s", (end) => {
    const [read] = entries(toIcs([{ ...events[8], end }], opts));
    expect(read.endDate.toJSDate().getTime() - read.startDate.toJSDate().getTime()).toBe(2 * 3600_000);
  });

  it.each([null, "", "2026-11-06", "2026-11-05"])("uses the next day for an absent/non-increasing all-day end: %s", (end) => {
    const [read] = entries(toIcs([{ ...events[6], end }], opts));
    expect(read.startDate.toString()).toBe("2026-11-06");
    expect(read.endDate.toString()).toBe("2026-11-07");
  });

  it.each([
    { start: "bad start" }, { start: "" }, { start: "2026-13-01T10:00:00Z" },
    { end: "bad end" }, { updatedAt: "bad timestamp" },
    { allDay: true, start: "2026-02-30", end: null },
    { allDay: true, start: "2026-11-02", end: "2026-02-30" },
    { start: "+010000-01-01T00:00:00Z" },
    { start: "9999-12-31T23:30:00Z", end: null },
    { allDay: true, start: "9999-12-31", end: null },
  ])("skips an unrepresentable event without losing its neighbours: %j", (change) => {
    const read = entries(toIcs([events[0], { ...events[0], id: "bad", ...change }, events[8]], opts));
    expect(read.map((e) => e.uid)).toEqual([`${events[0].id}@changle.ca`, `${events[8].id}@changle.ca`]);
  });

  it("removes C0/C1 controls from every TEXT field, keeps tab and escapes logical newlines", () => {
    const controls = Array.from({ length: 160 }, (_, i) => i)
      .filter((i) => (i < 32 && ![9, 10, 13].includes(i)) || i >= 127)
      .map((i) => String.fromCharCode(i)).join("");
    const dirty = `one${controls}\ttwo\r\nthree\rfour\nfive`;
    const clean = "one\ttwo\nthree\nfour\nfive";
    const input = { ...events[0], id: dirty, title: dirty, venue: dirty, address: dirty, sourceName: dirty, summaryZh: dirty, summaryEn: dirty };
    const value = toIcs([input], { ...opts, name: dirty });
    expectPhysicalLines(value);
    expect(value).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/);
    const [read] = entries(value);
    expect(read.uid).toBe(`${clean}@changle.ca`);
    expect(read.summary).toBe(clean);
    expect(read.location).toBe(`${clean}, ${clean}`);
    expect(read.description).toBe(`${clean}\n${clean}\n${input.url}\n来源 Source: ${clean}`);
    expect(calendar(value).getFirstPropertyValue("x-wr-calname")).toBe("one\ttwo\\nthree\\nfour\\nfive");
  });
});

describe("the calendar subscription through the Worker", () => {
  it("answers 200 for a published calendar with invalid timestamps and an injected URL", async () => {
    const fetched = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network in calendar tests"));
    const published: Published = {
      runId: "2026-11-01", generatedAt: opts.now.toISOString(), from: "2026-11-01", to: "2026-11-14", count: 3,
      events: [
        { ...events[0], url: "https://example.org/\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:injected" },
        { ...events[0], id: "invalid-stamp", updatedAt: "not a timestamp" },
        { ...events[0], id: "invalid-end", end: "not a timestamp" },
      ],
    };
    await env.CACHE.put(LIVE_KEY, JSON.stringify(published));
    const res = await worker.fetch(new Request("https://changle.ca/go/api/events.ics") as Request<unknown, IncomingRequestCfProperties>, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const read = entries(await res.text());
    expect(read).toHaveLength(1);
    expect(read[0].uid).toBe(`${events[0].id}@changle.ca`);
    expect(read[0].component.getFirstPropertyValue("url")).toBeNull();
    expect(fetched).not.toHaveBeenCalled();
  });

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
