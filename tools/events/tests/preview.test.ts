// The preview page (/go/preview): the published events day by day, in both languages, filtered by
// the same query as the API, with everything from a source escaped. Hand-made events, no network.
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { renderPreview } from "../src/preview";
import { LIVE_KEY } from "../src/publish";
import worker from "../src/worker";
import type { PublicEvent, Published } from "../src/types";

const base: PublicEvent = {
  id: "x",
  title: "",
  summaryZh: null,
  summaryEn: null,
  start: "2026-11-03T10:00:00-07:00",
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
  sourceName: "Vancouver Public Library",
  featured: false,
  updatedAt: "2026-11-02T13:40:00Z",
};
const ev = (e: Partial<PublicEvent>): PublicEvent => ({ ...base, ...e });

const events: PublicEvent[] = [
  ev({
    id: "vpl:1",
    title: "Family Storytime",
    start: "2026-11-03T10:30:00-07:00",
    end: "2026-11-03T11:15:00-07:00",
    venue: "Bob Prittie Metrotown",
    address: "6100 Willingdon Avenue",
    area: "burnaby",
    category: "family",
    tags: ["free", "kids", "indoor"],
    isFree: true,
    summaryZh: "给三到五岁孩子讲故事。",
    summaryEn: "Stories for three to five year olds.",
  }),
  ev({
    id: "tm:2",
    title: "Night Market <Opening> & \"Lanterns\"",
    start: "2026-11-03T18:00:00-07:00",
    venue: "Richmond Night Market",
    area: "richmond",
    category: "food",
    priceMin: 8,
    sourceName: "Ticketmaster",
    status: "rescheduled",
  }),
  ev({ id: "luma:3", title: "<script>alert(1)</script>", start: "2026-11-04", allDay: true, timeTBD: true, url: "javascript:alert(1)", sourceName: "Luma" }),
  ev({
    id: "ubc:4",
    title: "Lantern Festival",
    start: "2026-10-28",
    end: "2026-11-20",
    allDay: true,
    venue: "VanDusen Garden",
    area: "vancouver",
    areaCheck: true,
    category: "festivals",
    lang: "both",
    tags: ["chinese", "outdoor"],
    featured: true,
    sourceName: "UBC",
  }),
];
const pub: Published = { runId: "2026-11-02", generatedAt: "2026-11-02T13:41:00Z", from: "2026-11-02", to: "2026-11-15", count: events.length, events };
const NOW = Date.parse("2026-11-03T16:00:00Z"); // 09:00 on Tuesday 3 November in Vancouver

const render = (query = "", p: Published | null = pub) => renderPreview(p, new URLSearchParams(query), NOW);
const titles = (html: string) => [...html.matchAll(/<h3 class="title">(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
const days = (html: string) => [...html.matchAll(/<h2 class="day"><span>(.*?)<\/span><span class="n">(.*?)<\/span>/g)].map((m) => `${m[1]} (${m[2]})`);

describe("the preview page", () => {
  it("lists the published events day by day, in Chinese by default", () => {
    const html = render();
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain("共 4 个活动，11月2日 至 11月15日，11月2日 06:41 更新。");
    // the festival started before the window: it's listed on the first day, as under way
    expect(days(html)).toEqual(["11月2日 周一 (1 个)", "今天 11月3日 周二 (2 个)", "明天 11月4日 周三 (1 个)"]);
    expect(titles(html)).toEqual(["Lantern Festival", "Family Storytime", 'Night Market &#60;Opening&#62; &#38; &#34;Lanterns&#34;', "&#60;script&#62;alert(1)&#60;/script&#62;"]);
    expect(html).toContain('<p class="when"><span>进行中</span><span>至 11月20日</span></p>');
    expect(html).toContain('<p class="when"><span>10:30</span><span>至 11:15</span></p>');
    expect(html).toContain('<p class="when"><span>时间待定</span></p>');
    expect(html).toContain("给三到五岁孩子讲故事。");
    expect(html).toContain('<span class="flag warn">改期</span>');
    expect(html).toContain('<span class="flag">本周推荐</span>');
    expect(html).toContain("<span>温哥华市（待确认）</span><span>节日庆典</span><span>中英双语</span><span>户外</span><span>UBC</span>");
    expect(html).toContain("<span>本拿比</span><span>亲子家庭</span><span>免费</span><span>带娃</span><span>室内</span>");
    expect(html).toContain("<span>$8 起</span>");
    expect(html).toContain("来源：Vancouver Public Library 1，Ticketmaster 1，Luma 1，UBC 1。");
  });

  it("escapes what the sources say and only links to web pages", () => {
    const html = render();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="https://example.com/e" target="_blank" rel="noopener noreferrer">Family Storytime</a>');
    expect(html).toContain('<h3 class="title">&#60;script&#62;alert(1)&#60;/script&#62;</h3>');
  });

  it("speaks English with ?lang=en", () => {
    const html = render("lang=en");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("4 events from 2 Nov to 15 Nov, updated 2 Nov 6:41 am.");
    expect(days(html)).toEqual(["Mon 2 Nov (1 event)", "Today, Tue 3 Nov (2 events)", "Tomorrow, Wed 4 Nov (1 event)"]);
    expect(html).toContain('<p class="when"><span>10:30 am</span><span>to 11:15 am</span></p>');
    expect(html).toContain('<p class="when"><span>On now</span><span>until 20 Nov</span></p>');
    expect(html).toContain('<p class="when"><span>Time TBA</span></p>');
    expect(html).toContain("<span>Burnaby</span><span>Family &#38; Kids</span><span>Free</span><span>Kids</span><span>Indoors</span>");
    expect(html).toContain("<span>From $8</span>");
    expect(html).toContain("Stories for three to five year olds.");
    expect(html).not.toContain("给三到五岁孩子讲故事。");
    // the switch back keeps the rest of the query
    expect(render("lang=en&area=burnaby")).toContain('<a class="lang" href="?area=burnaby" lang="zh-CN">中文</a>');
    expect(render("area=burnaby")).toContain('<a class="lang" href="?area=burnaby&#38;lang=en" lang="en">English</a>');
  });

  it("filters like the API, and every filter is a link that adds or takes it off", () => {
    const burnaby = render("area=burnaby");
    expect(titles(burnaby)).toEqual(["Family Storytime"]);
    expect(burnaby).toContain('筛选后剩 1 个，<a href="?">看全部</a>。');
    expect(burnaby).toContain('<a href="?" aria-current="true">本拿比<span class="n">1</span></a>');
    expect(burnaby).toContain('<a href="?area=richmond">列治文<span class="n">1</span></a>');
    // a category or an area with nothing in it isn't offered
    expect(burnaby).not.toContain("北岸");
    expect(titles(render("cat=food"))).toEqual(['Night Market &#60;Opening&#62; &#38; &#34;Lanterns&#34;']);
    // tags add up: free and kids
    const free = render("tag=free");
    expect(titles(free)).toEqual(["Family Storytime"]);
    expect(free).toContain('<a href="?tag=free%2Ckids">带娃<span class="n">1</span></a>');
    expect(titles(render("tag=free,kids"))).toEqual(["Family Storytime"]);
    expect(titles(render("tag=featured"))).toEqual(["Lantern Festival"]);
    expect(titles(render("from=2026-11-04&to=2026-11-04"))).toEqual(["Lantern Festival", "&#60;script&#62;alert(1)&#60;/script&#62;"]);
    expect(render("area=north-shore")).toContain('<p class="empty">没有符合的活动。</p>');
    // values that aren't ours are ignored
    expect(titles(render("area=seattle&cat=<b>"))).toHaveLength(4);
    expect(render("cat=family")).toContain("还有 1 个没分类。");
    expect(render()).toContain("其中 2 个地区待确认。");
  });

  it("says when nothing is published yet", () => {
    expect(render("", null)).toContain("还没有活动。每天早上 6 点（温哥华时间）抓一轮，抓完这里就有了。");
    expect(render("lang=en", null)).toContain("Nothing here yet.");
  });
});

describe("GET /go/preview", () => {
  const get = (path: string) => worker.fetch(new Request(`https://changle.ca${path}`) as Request<unknown, IncomingRequestCfProperties>, env);
  afterEach(async () => {
    await env.CACHE.delete(LIVE_KEY);
  });

  it("serves the page from what's published, asks not to be indexed or kept", async () => {
    await env.CACHE.put(LIVE_KEY, JSON.stringify(pub));
    const res = await get("/go/preview?area=burnaby");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(titles(await res.text())).toEqual(["Family Storytime"]);
    expect((await get("/go/preview/")).status).toBe(200);
  });

  it("before the first run: the page says so", async () => {
    const res = await get("/go/preview");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("还没有活动");
  });
});
