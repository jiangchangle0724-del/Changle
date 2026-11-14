// The page at changle.ca/go: one day at a time, filtered by category, area and price, in Chinese or
// English, with everything from a source escaped. Hand-made events, no network.
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import siteTokens from "../../../site/src/styles/tokens.css?raw";
import { pickLang, renderPage, TOKENS } from "../src/page";
import { LIVE_KEY } from "../src/publish";
import worker from "../src/worker";
import type { PublicEvent, Published } from "../src/types";

const base: PublicEvent = {
  id: "x",
  title: "",
  summaryZh: null,
  summaryEn: null,
  start: "2026-11-14T10:00:00-07:00",
  end: null,
  allDay: false,
  timeTBD: false,
  status: "scheduled",
  venue: null,
  address: null,
  area: null,
  areaCheck: false,
  category: null,
  tags: [],
  priceMin: null,
  isFree: null,
  lang: "en",
  url: "https://example.com/e",
  imageUrl: null,
  sourceName: "Ticketmaster",
  featured: false,
  updatedAt: "2026-11-14T13:01:00Z",
};
const ev = (e: Partial<PublicEvent>): PublicEvent => ({ ...base, ...e });

const events: PublicEvent[] = [
  ev({ id: "tm:1", title: "Late Show", start: "2026-11-14T21:00:00-07:00", venue: "Commodore Ballroom", area: "vancouver", category: "shows", priceMin: 35.5, tags: ["tickets"] }),
  ev({
    id: "vpl:2",
    title: "Family Storytime",
    start: "2026-11-14T10:30:00-07:00",
    end: "2026-11-14T11:15:00-07:00",
    venue: "Kensington Branch",
    address: "1428 Cedar Cottage Mews, Vancouver, British Columbia, V5N 5Z6, Canada",
    area: "vancouver",
    category: "family",
    tags: ["free", "kids"],
    isFree: true,
    sourceName: "Vancouver Public Library",
  }),
  ev({ id: "rpl:3", title: "Craft Fair", start: "2026-11-14", allDay: true, venue: "Brighouse", area: "richmond", category: "food", priceMin: 12, sourceName: "Richmond Public Library" }),
  ev({ id: "luma:4", title: "<script>alert(1)</script>", start: "2026-11-14", allDay: true, timeTBD: true, url: "javascript:alert(1)", sourceName: "Luma" }),
  ev({ id: "ubc:5", title: "Lantern Walk", start: "2026-11-01", end: "2026-11-30", allDay: true, venue: "VanDusen Garden", area: "vancouver", category: "festivals", lang: "both", isFree: true }),
  ev({ id: "tm:6", title: "Night Before", start: "2026-11-13T22:00:00-07:00", end: "2026-11-14T02:00:00-07:00", venue: "Hollywood Theatre", area: "vancouver", category: "nightlife", status: "soldout" }),
  ev({ id: "tm:7", title: "Saturday Match", start: "2026-11-21T19:00:00-07:00", venue: "BC Place", area: "vancouver", category: "outdoors", priceMin: 25 }),
];
const pub: Published = { runId: "2026-11-14", generatedAt: "2026-11-14T13:01:36Z", from: "2026-11-14", to: "2026-11-27", count: events.length, events };
const NOW = Date.parse("2026-11-14T19:20:00Z"); // 12:20 on Saturday 14 November in Vancouver

const render = (query = "", lang: "zh" | "en" = "zh", p: Published | null = pub) => renderPage(p, new URLSearchParams(query), lang, NOW);
const titles = (html: string) => [...html.matchAll(/<h3 class="title">(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
/** The titles before the fold, and the ones folded under it. */
const parts = (html: string) => {
  const at = html.indexOf('<details class="more"');
  return at < 0 ? [titles(html), []] : [titles(html.slice(0, at)), titles(html.slice(at))];
};
const chips = (html: string, row: string) =>
  [...(html.match(new RegExp(`<nav class="row" aria-label="${row}">(.*?)</nav>`))?.[1] ?? "").matchAll(/<a class="chip"[^>]*>(.*?)<\/a>/g)].map((m) => m[1].replace(/<span class="n">(\d+)<\/span>/, " $1"));

describe("the page", () => {
  it("opens on today, in time order, with the ones running since an earlier day folded below", () => {
    const html = render();
    expect(html).toContain('<html lang="zh-CN" data-lang="zh">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain("<h2>今天 11月14日 周六</h2>");
    const [open, folded] = parts(html);
    // timed by time, then all day, then time to be announced; the night before ended at 2 am
    expect(open).toEqual(["Family Storytime", "Late Show", "Craft Fair", "&#60;script&#62;alert(1)&#60;/script&#62;"]);
    expect(folded).toEqual(["Lantern Walk"]);
    expect(html).toContain("还有 1 个活动这几天一直在办");
    expect(html).not.toContain("Night Before");
    expect(html).toContain("<p>5 个活动</p>");
  });

  it("shows what people need to decide, in the page's language", () => {
    const html = render();
    expect(html).toContain('<p class="when"><span>10:30</span><span>至 11:15</span></p>');
    // the street, not the city, province and postcode the area already says
    expect(html).toContain('<p class="place">Kensington Branch · 温哥华市<span class="addr">1428 Cedar Cottage Mews</span></p>');
    expect(html).toContain("<span>免费</span><span>亲子家庭</span><span>温哥华公共图书馆</span>");
    expect(html).toContain("<span>$35.50 起</span><span>演出音乐</span><span>Ticketmaster</span>");
    expect(html).toContain('<p class="when"><span>进行中</span><span>至 11/30</span></p>');
    expect(html).toContain("<span>中英双语</span>");
    const en = render("lang=en", "en");
    expect(en).toContain('<html lang="en" data-lang="en">');
    expect(en).toContain("<h2>Today, Sat 14 Nov</h2>");
    expect(en).toContain('<p class="when"><span>10:30 am</span><span>to 11:15 am</span></p>');
    expect(en).toContain("<span>Free</span><span>Family &#38; Kids</span><span>Vancouver Public Library</span>");
    expect(en).toContain("1 more running since an earlier day");
  });

  it("links only to web pages and escapes what the sources wrote", () => {
    const html = render();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<h3 class="title"><a href="https://example.com/e" target="_blank" rel="noopener noreferrer">Late Show</a></h3>');
  });

  it("filters by day, category, area and price, with each choice's count", () => {
    const sat = render("day=2026-11-21");
    expect(sat).toContain("<h2>11月21日 周六</h2>");
    expect(parts(sat)).toEqual([["Saturday Match"], ["Lantern Walk"]]);
    expect(sat).toContain('href="/go?lang=zh&#38;day=2026-11-21" aria-current="date"');

    expect(chips(render(), "分类")).toEqual(["全部分类", "演出音乐 1", "吃喝市集 1", "节日庆典 1", "亲子家庭 1"]);
    expect(chips(render(), "地区")).toEqual(["全部地区", "温哥华市 3", "列治文 1"]);
    expect(chips(render(), "价格")).toEqual(["价格不限", "免费 2", "$20 以内 3"]);

    expect(parts(render("cat=family"))).toEqual([["Family Storytime"], []]);
    expect(parts(render("area=richmond"))).toEqual([["Craft Fair"], []]);
    expect(parts(render("price=free"))).toEqual([["Family Storytime"], ["Lantern Walk"]]);
    expect(parts(render("price=20"))).toEqual([["Family Storytime", "Craft Fair"], ["Lantern Walk"]]);
    // a count shows what the choice would give with the other filters as they are
    expect(chips(render("area=richmond"), "价格")).toEqual(["价格不限", "$20 以内 1"]);
    expect(render("cat=family")).toContain("清除筛选");
    expect(render()).not.toContain("清除筛选");
  });

  it("keeps to the published days and our own names, and says when nothing matches", () => {
    for (const q of ["day=2026-12-25", "day=2026-11-13", "day=tomorrow", "cat=gaming", "area=seattle", "price=10"]) {
      const html = render(q);
      expect(html, q).toContain("<h2>今天 11月14日 周六</h2>");
      expect(html, q).not.toContain("清除筛选");
    }
    const none = render("cat=nightlife&area=richmond");
    expect(none).toContain('<p class="empty">这天没有符合的活动。');
    expect(none).toContain('<a href="/go?lang=zh">清除筛选</a>');
  });

  it("carries the language in every link, and switches it keeping the view", () => {
    const html = render("day=2026-11-21&cat=outdoors");
    expect(html).toContain('<a class="lang" href="/go?lang=en&#38;day=2026-11-21&#38;cat=outdoors" data-lang="en" lang="en">English</a>');
    for (const m of html.matchAll(/href="(\/go[^"]*)"/g)) expect(m[1]).toMatch(/^\/go\?lang=(zh|en)/);
    expect(render("", "en")).toContain('<a class="lang" href="/go?lang=zh" data-lang="zh" lang="zh-CN">中文</a>');
  });

  it("offers the calendar feed for the category and area shown", () => {
    const html = render("cat=family&area=vancouver&price=free&day=2026-11-21");
    expect(html).toContain('href="webcal://changle.ca/go/api/events.ics?cat=family&#38;area=vancouver&#38;tag=free"');
    expect(html).toContain(`href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent("webcal://changle.ca/go/api/events.ics?cat=family&area=vancouver&tag=free")}"`);
    expect(render()).toContain('href="webcal://changle.ca/go/api/events.ics"');
  });

  it("before the first run, says so", () => {
    expect(render("", "zh", null)).toContain("第一轮还没跑完，过一会儿再来看");
    expect(render("", "en", null)).toContain("the first run isn't done yet");
  });

  it("picks the language as changle.ca does on a first visit", () => {
    const p = (q: string) => new URLSearchParams(q);
    expect(pickLang(p(""), null)).toBe("zh");
    expect(pickLang(p(""), "zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(pickLang(p(""), "zh-Hant-TW")).toBe("zh");
    expect(pickLang(p(""), "en-CA,en;q=0.9,zh;q=0.8")).toBe("en");
    expect(pickLang(p(""), "fr-CA")).toBe("en");
    expect(pickLang(p("lang=zh"), "en-CA")).toBe("zh");
    expect(pickLang(p("lang=en"), "zh-CN")).toBe("en");
    expect(pickLang(p("lang=fr"), "zh-CN")).toBe("zh");
  });

  it("uses changle.ca's own colors and sizes (site/src/styles/tokens.css)", () => {
    for (const [name, value] of Object.entries(TOKENS)) {
      const m = siteTokens.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`));
      expect(m?.[1].trim(), name).toBe(value);
    }
  });
});

describe("GET /go", () => {
  const get = (path: string, headers: Record<string, string> = {}) =>
    worker.fetch(new Request(`https://changle.ca${path}`, { headers }) as Request<unknown, IncomingRequestCfProperties>, env);
  afterEach(async () => {
    await env.CACHE.delete(LIVE_KEY);
  });

  it("serves the page from what's published, in the language asked for or the browser's own", async () => {
    await env.CACHE.put(LIVE_KEY, JSON.stringify(pub));
    const res = await get("/go?area=richmond", { "accept-language": "en-CA,en;q=0.9" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("vary")).toBe("Accept-Language");
    const html = await res.text();
    expect(html).toContain('<html lang="en" data-lang="en">');
    expect(titles(html)).toContain("Craft Fair");
    expect(await (await get("/go/?lang=zh", { "accept-language": "en-CA" })).text()).toContain('<html lang="zh-CN" data-lang="zh">');
  });

  it("before the first run: the page says so", async () => {
    const res = await get("/go");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("第一轮还没跑完");
  });
});
