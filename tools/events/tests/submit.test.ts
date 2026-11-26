import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker";
import { LIVE_KEY } from "../src/publish";
import { ensureSchema } from "../src/schema";
import { cleanDraft, decide, draftFromPage, draftFromWords, eventOf, receive } from "../src/submit";
import type { Published } from "../src/types";

// 投稿: what anyone sends (src/submit.ts), the owner's page and API (src/owner.ts, the rooms server's
// stand-in in tests/rooms/worker.ts knows the sessions below)
const OWNER = "test-session-owner-0000000";
const VISITOR = "test-session-visitor-00000";
const NOW = Date.parse("2026-11-26T20:00:00Z");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Workers AI as the tests have it: it answers what it's given. */
const ai = (answer: unknown) => ({ run: vi.fn(async () => ({ response: typeof answer === "string" ? answer : JSON.stringify(answer) })) });
const call = async (path: string, init: RequestInit = {}) => {
  const res = await worker.fetch(new Request(`https://changle.ca${path}`, init) as Request<unknown, IncomingRequestCfProperties>, env);
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, type, body: type.includes("json") ? ((await res.json()) as Record<string, unknown>) : await res.text() };
};
const post = (path: string, body: unknown, token?: string) =>
  call(path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const asOwner = (path: string) => call(path, { headers: { authorization: `Bearer ${OWNER}` } });
const rows = async () => (await env.DB.prepare("SELECT * FROM submissions ORDER BY created_at").all<Record<string, unknown>>()).results;

async function reset() {
  for (const t of ["events", "venues", "sources", "fetch_log", "review_queue", "runs", "submissions", "eventbrite_follows"]) await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  await env.DB.prepare("DELETE FROM schema_migrations").run();
  await ensureSchema(env.DB);
  for (const { name } of (await env.CACHE.list()).keys) await env.CACHE.delete(name);
}
beforeEach(reset);
afterEach(() => vi.restoreAllMocks());

describe("reading what's sent", () => {
  it("a page's own schema.org Event: its name, times in Vancouver, place and price", () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},{"@type":"MusicEvent","name":"Winter Concert","startDate":"2026-12-05T19:30:00-08:00","endDate":"2026-12-05T21:00:00-08:00","location":{"@type":"Place","name":"St. Andrew's-Wesley","address":{"streetAddress":"1022 Nelson St","addressLocality":"Vancouver"}},"offers":{"price":"25","priceCurrency":"CAD"}}]}</script></head></html>`;
    expect(draftFromPage(html, "https://example.org/concert")).toMatchObject({
      title: "Winter Concert",
      start: "2026-12-05T20:30",
      end: "2026-12-05T22:00",
      place: "St. Andrew's-Wesley",
      address: "1022 Nelson St",
      city: "Vancouver",
      priceMin: 25,
      isFree: false,
      url: "https://example.org/concert",
    });
    expect(draftFromPage("<html><body>no data</body></html>", "https://example.org")).toBeNull();
  });

  it("words (a 小红书 post) through the AI: only what it says, nothing without a name and a date", async () => {
    const good = ai({ title: "圣诞手作市集", start: "2026-12-06T11:00", end: "2026-12-06 17:00", place: "Aberdeen Centre", address: null, city: "Richmond", price_min: null, price_max: null, free: true, description: "手作摊位和小吃。" });
    expect(await draftFromWords(good, "12月6日 11点到5点 Aberdeen 圣诞手作市集 免费入场", NOW)).toMatchObject({ title: "圣诞手作市集", start: "2026-12-06T11:00", end: "2026-12-06T17:00", city: "Richmond", isFree: true });
    // the prompt has today's date, for "this Saturday"
    expect(JSON.stringify(good.run.mock.calls[0])).toContain("2026-11-26");
    expect(await draftFromWords(ai({ title: "Something", start: null }), "words", NOW)).toBeNull();
    expect(await draftFromWords(ai("I can't tell."), "words", NOW)).toBeNull();
  });

  it("a draft is checked field by field: a bad date, a script for a link, a negative price are dropped", () => {
    expect(cleanDraft({ title: "  A  ", start: "Saturday", url: "javascript:alert(1)", priceMin: -3, isFree: "yes", eventbriteId: "12" })).toEqual({
      title: "A", start: null, end: null, place: null, address: null, city: null, priceMin: null, priceMax: null, isFree: null, url: null, description: null,
    });
  });
});

describe("POST /go/api/submit", () => {
  it("keeps the words, the poster and the draft; reads 小红书's words but never asks 小红书", async () => {
    const fetched = vi.spyOn(globalThis, "fetch");
    const e = { ...env, AI: ai({ title: "冬日音乐会", start: "2026-12-12T19:00", city: "Burnaby", free: false, price_min: 20 }) } as unknown as Env;
    const r = await receive(e, { link: "https://www.xiaohongshu.com/explore/abc", text: "12月12日晚7点 本拿比 冬日音乐会 票价20", image: PNG, contact: "wechat: me", lang: "zh" }, "203.0.113.7", NOW);
    expect(r).toMatchObject({ ok: true, draft: { title: "冬日音乐会", start: "2026-12-12T19:00", priceMin: 20, url: "https://www.xiaohongshu.com/explore/abc" } });
    expect(fetched).not.toHaveBeenCalled();
    expect(await rows()).toMatchObject([{ status: "pending", lang: "zh", has_image: 1, contact: "wechat: me", read_from: "text", read_error: null }]);
  });

  it("an Eventbrite link is read through its API with Steve's token, and remembers the event", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      expect(url).toMatch(/^https:\/\/www\.eventbriteapi\.com\/v3\/events\/1993949843658\/\?expand=venue,ticket_availability,organizer&token=t$/);
      return Response.json({ id: "1993949843658", name: { text: "Chad VanGaalen" }, url: "https://www.eventbrite.ca/e/chad-vangaalen-tickets-1993949843658", start: { utc: "2026-11-29T03:30:00Z" }, end: { utc: "2026-11-29T07:00:00Z" }, status: "live", listed: true, venue: { name: "Rickshaw Theatre", address: { address_1: "254 E. Hastings Street", city: "Vancouver" } }, ticket_availability: { minimum_ticket_price: { currency: "CAD", major_value: "29.54" } } });
    });
    const r = await receive({ ...env, EVENTBRITE_TOKEN: "t" } as Env, { link: "https://www.eventbrite.ca/e/chad-vangaalen-tickets-1993949843658?aff=x" }, "net", NOW);
    expect(r).toMatchObject({ ok: true, draft: { title: "Chad VanGaalen", start: "2026-11-28T20:30", place: "Rickshaw Theatre", priceMin: 29.54, eventbriteId: "1993949843658" } });
    expect((await rows())[0]).toMatchObject({ read_from: "eventbrite" });
  });

  it("says no to nothing at all, a link that isn't one, too much; thanks a program that fills the hidden field, and keeps nothing", async () => {
    expect(await post("/go/api/submit", {})).toMatchObject({ status: 400, body: { error: "empty" } });
    expect(await post("/go/api/submit", { link: "not a link" })).toMatchObject({ status: 400, body: { error: "link" } });
    expect(await post("/go/api/submit", { text: "x".repeat(3001) })).toMatchObject({ status: 400, body: { error: "too long" } });
    expect(await post("/go/api/submit", { text: "buy now", website: "spam.example" })).toMatchObject({ status: 200, body: { ok: true } });
    expect(await rows()).toEqual([]);
  });

  it("ten a day from one network", async () => {
    const e = { ...env, AI: ai("nothing") } as unknown as Env;
    for (let i = 0; i < 10; i++) expect(await receive(e, { text: `event ${i}` }, "203.0.113.9", NOW)).toMatchObject({ ok: true });
    expect(await receive(e, { text: "one more" }, "203.0.113.9", NOW)).toMatchObject({ ok: false, status: 429 });
    expect(await receive(e, { text: "another network" }, "198.51.100.1", NOW)).toMatchObject({ ok: true });
  });
});

describe("the owner's page (/go/admin)", () => {
  it("the pages: the form in Chinese or English, the owner's page never kept by a cache", async () => {
    expect(await call("/go/submit?lang=zh")).toMatchObject({ status: 200, body: expect.stringContaining("投稿一个活动") });
    expect(await call("/go/submit?lang=en")).toMatchObject({ status: 200, body: expect.stringContaining("Send us an event") });
    const page = await worker.fetch(new Request("https://changle.ca/go/admin") as Request<unknown, IncomingRequestCfProperties>, env);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).toContain('localStorage.getItem("changle.session")');
  });

  it("only the owner: not signed in 401, someone else 403", async () => {
    expect((await call("/go/api/admin/submissions")).status).toBe(401);
    expect((await call("/go/api/admin/submissions", { headers: { authorization: `Bearer ${VISITOR}` } })).status).toBe(403);
    expect((await asOwner("/go/api/admin/submissions")).body).toEqual({ pending: [], decided: [] });
  });

  it("let in: stored as an event of the source \"submitted\", on the page at once, the poster its picture, the Eventbrite organization followed", async () => {
    const e = { ...env, AI: ai("nothing") } as unknown as Env;
    const sent = await receive(e, { text: "a poster", image: PNG }, "net", NOW);
    if (!sent.ok) throw new Error("not received");
    // before it's let in, the poster is the owner's only
    expect((await call(`/go/poster/${sent.id}`)).status).toBe(404);
    expect((await asOwner(`/go/api/admin/poster/${sent.id}`)).status).toBe(200);
    const pub: Published = { runId: "2026-11-26", generatedAt: "2026-11-26T13:30:00Z", from: "2026-11-26", to: "2026-12-09", count: 0, events: [] };
    await env.CACHE.put(LIVE_KEY, JSON.stringify(pub));
    const draft = { title: "Winter Market", start: "2026-12-05T10:00", end: "2026-12-05T16:00", place: "Hall", address: "1 Main St", city: "Vancouver", priceMin: null, priceMax: null, isFree: true, url: "https://example.org/m", description: "Stalls.", eventbriteId: "1993949843658" };
    const ok = await post(`/go/api/admin/submissions/${sent.id}`, { action: "approve", draft }, OWNER);
    expect(ok).toMatchObject({ status: 200, body: { ok: true, status: "approved", eventId: `submitted:${sent.id}` } });
    const live = (await env.CACHE.get<Published>(LIVE_KEY, "json"))!;
    expect(live.events.find((x) => x.title === "Winter Market")).toMatchObject({ start: "2026-12-05T10:00:00-07:00", isFree: true, imageUrl: `https://changle.ca/go/poster/${sent.id}` });
    expect((await call(`/go/poster/${sent.id}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT event_id, added_by FROM eventbrite_follows").first()).toEqual({ event_id: "1993949843658", added_by: "submission" });
    expect((await asOwner("/go/api/admin/submissions")).body).toMatchObject({ pending: [], decided: [{ id: sent.id, status: "approved" }] });
  });

  it("an answer needs a name and a date to let in; turned down, it's only marked", async () => {
    const e = { ...env, AI: ai("nothing") } as unknown as Env;
    const sent = await receive(e, { text: "something" }, "net", NOW);
    if (!sent.ok) throw new Error("not received");
    const republish = vi.fn(async () => {});
    expect(await decide(env, sent.id, { action: "approve", draft: { title: "No date" } }, republish, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(await decide(env, sent.id, { action: "reject" }, republish, NOW)).toEqual({ ok: true, status: "rejected" });
    expect(republish).not.toHaveBeenCalled();
    expect(await decide(env, "nosuchid00", { action: "reject" }, republish, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(eventOf("x", cleanDraft({ title: "All day", start: "2026-12-07" }), false)).toMatchObject({ start: "2026-12-07", allDay: true, end: null, place: null });
  });

  it("once the owner has opened the page, a new submission is mailed to them", async () => {
    await asOwner("/go/api/admin/submissions");
    expect(await post("/go/api/submit", { link: "https://www.xiaohongshu.com/explore/x" })).toMatchObject({ status: 200 });
    const mails = (await (await env.ROOMS.fetch("https://rooms.changle.ca/test/mails")).json()) as { app: string; to: string; subject: string; link: string }[];
    expect(mails).toMatchObject([{ app: "events", to: "owner@example.com", subject: "玩什么有新投稿", link: "https://changle.ca/go/admin" }]);
  });
});
