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
  titleZh: null,
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
  ev({ id: "tm:1", title: "Late Show", start: "2026-11-14T21:00:00-07:00", end: "2026-11-15T02:00:00-07:00", venue: "Commodore Ballroom", area: "vancouver", category: "shows", priceMin: 35.5, tags: ["tickets"] }),
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
  ev({ id: "rpl:8", title: "春节书法课", start: "2026-11-14T14:00:00-07:00", venue: "Brighouse", area: "richmond", category: "arts", lang: "zh", isFree: true, sourceName: "Richmond Public Library" }),
];
const pub: Published = { runId: "2026-11-14", generatedAt: "2026-11-14T13:01:36Z", from: "2026-11-14", to: "2026-11-27", count: events.length, events };
const NOW = Date.parse("2026-11-14T16:00:00Z"); // 09:00 on Saturday 14 November in Vancouver
const EVENING = Date.parse("2026-11-15T02:00:00Z"); // 19:00 the same day

const render = (query = "", lang: "zh" | "en" = "zh", p: Published | null = pub, now = NOW) => renderPage(p, new URLSearchParams(query), lang, now);
const titles = (html: string) => [...html.matchAll(/<h3 class="title"[^>]*>(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
/** The titles before the first fold, and those in each fold. */
const parts = (html: string) => html.split('<details class="more"').map(titles);
const count = (html: string) => (html.match(/<h2>.*?<\/h2><p>(\d+) (个活动|events?)/) ?? [])[1];
const chips = (html: string, row: string) =>
  [...(html.match(new RegExp(`<nav class="row" aria-label="${row}">(.*?)</nav>`))?.[1] ?? "").matchAll(/<a class="chip"[^>]*>(.*?)<\/a>/g)].map((m) =>
    m[1].replace(/<span class="n">(\d+)<span class="vh">[^<]*<\/span><\/span>/, " $1"),
  );

describe("the page", () => {
  it("opens on today, in time order, with the ones running since an earlier day folded below", () => {
    const html = render();
    expect(html).toContain('<html lang="zh-CN" data-lang="zh">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain("<h2>今天 11月14日 周六</h2>");
    // timed by time, then all day, then time to be announced; the night before ended at 2 am
    expect(parts(html)).toEqual([["Family Storytime", "春节书法课", "Late Show", "Craft Fair", "&#60;script&#62;alert(1)&#60;/script&#62;"], ["Lantern Walk"]]);
    expect(html).toContain("还有 1 个活动这几天一直在办");
    expect(html).not.toContain("Night Before");
    expect(count(html)).toBe("6");
  });

  it("in the evening, what's already over today is folded last", () => {
    const html = render("", "zh", pub, EVENING);
    // the storytime and the calligraphy class are over; the late show is still to come
    expect(parts(html)).toEqual([["Late Show", "Craft Fair", "&#60;script&#62;alert(1)&#60;/script&#62;"], ["Lantern Walk"], ["Family Storytime", "春节书法课"]]);
    expect(html).toContain("今天早些时候的 2 个（已经结束或开始很久了）");
    expect(count(html)).toBe("6");
    // only today: the same events on another day aren't folded as over
    expect(render("", "en", pub, EVENING)).toContain("2 earlier today");
  });

  it("shows what people need to decide, in the page's language", () => {
    const html = render();
    expect(html).toContain('<p class="when"><span>10:30</span><span>至 11:15</span></p>');
    // a night that ends by 5 am ends at a time, not on a day
    expect(html).toContain('<p class="when"><span>21:00</span><span>至 02:00</span></p>');
    // the street, not the city, province and postcode the area already says; it opens a map
    expect(html).toContain('<p class="place">Kensington Branch · 温哥华市<span class="addr"><a href="https://www.google.com/maps/search/?api=1&#38;query=');
    expect(html).toContain(`query=${encodeURIComponent("Kensington Branch, 1428 Cedar Cottage Mews, Vancouver, British Columbia, V5N 5Z6, Canada")}" target="_blank" rel="noopener noreferrer">1428 Cedar Cottage Mews<span class="vh">（地图）</span></a></span></p>`);
    expect(html).toContain("<span>免费</span><span>亲子家庭</span><span>温哥华公共图书馆</span>");
    expect(html).toContain("<span>$35.50 起</span><span>演出音乐</span><span>Ticketmaster</span>");
    expect(html).toContain('<p class="when"><span>进行中</span><span>至 11/30</span></p>');
    expect(html).toContain("<span>中英双语</span>");
    // an English title on the Chinese page is marked, so it's read in an English voice
    expect(html).toContain('<h3 class="title" lang="en"><a href="https://example.com/e" target="_blank" rel="noopener noreferrer">Late Show</a></h3>');
    expect(html).toContain('<h3 class="title"><a href="https://example.com/e" target="_blank" rel="noopener noreferrer">春节书法课</a></h3>');
    const en = render("lang=en", "en");
    expect(en).toContain('<html lang="en" data-lang="en">');
    expect(en).toContain("<h2>Today, Sat 14 Nov</h2>");
    expect(en).toContain('<p class="when"><span>10:30 am</span><span>to 11:15 am</span></p>');
    expect(en).toContain("<span>Free</span><span>Family &#38; Kids</span><span>Vancouver Public Library</span>");
    expect(en).toContain('<h3 class="title" lang="zh-CN">');
    expect(en).toContain("1 more running since an earlier day");
  });

  it("on the Chinese page: the name in Chinese, the source's own under it, and the sentence on what it is", () => {
    const zhOne = ev({
      id: "vpl:9",
      title: "PAWS 4 Stories",
      titleZh: "与狗狗共读故事",
      summaryZh: "孩子们和治疗犬一对一练习朗读，培养阅读的信心。",
      start: "2026-11-14T15:00:00-07:00",
      venue: "West Point Grey Branch",
      area: "vancouver",
    });
    const p = { ...pub, events: [...events, zhOne], count: events.length + 1 };
    const zh = render("", "zh", p);
    expect(zh).toContain('<h3 class="title"><a href="https://example.com/e" target="_blank" rel="noopener noreferrer">与狗狗共读故事</a></h3><p class="orig" lang="en">PAWS 4 Stories</p><p class="sum">孩子们和治疗犬一对一练习朗读，培养阅读的信心。</p>');
    // the English page: the source's own name only, and no Chinese sentence
    const en = render("", "en", p);
    expect(titles(en)).toContain("PAWS 4 Stories");
    expect(en).not.toContain("与狗狗共读故事");
    expect(en).not.toContain("孩子们和治疗犬");
    // no Chinese name yet: the source's, with no second line
    expect(zh).toContain('<h3 class="title" lang="en"><a href="https://example.com/e" target="_blank" rel="noopener noreferrer">Late Show</a></h3><p class="place">');
  });

  it("shows the source's picture over https, lazily and without saying where it's shown; none when there's none", () => {
    const withPic = [
      ev({ ...events[0], imageUrl: "http://s1.ticketm.net/dam/a/1/x_RETINA_PORTRAIT_16_9.jpg" }),
      ev({ ...events[1], imageUrl: "javascript:alert(1)" }),
      ev({ ...events[2], imageUrl: 'https://img.example/a"b.png' }),
    ];
    const html = render("", "zh", { ...pub, events: withPic, count: 3 });
    const pics = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]).sort();
    // (and none for the javascript: one)
    expect(pics).toEqual([
      '<img class="pic" src="https://img.example/a&#34;b.png" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">',
      '<img class="pic" src="https://s1.ticketm.net/dam/a/1/x_RETINA_PORTRAIT_16_9.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">',
    ]);
  });

  it("links only to web pages and escapes what the sources wrote", () => {
    const evil = ev({ id: "x:9", title: "A", venue: '<img src=x onerror="1">', address: "<b>1 Main</b>, X", summaryZh: "<i>hi</i>", sourceName: "<s>src</s>" });
    const html = render("", "zh", { ...pub, events: [evil] });
    expect(html).not.toMatch(/<img|<b>|<i>|<s>/);
    expect(html).toContain("&#60;img src=x onerror=&#34;1&#34;&#62;");
    expect(html).toContain('<p class="sum">&#60;i&#62;hi&#60;/i&#62;</p>');
    expect(render()).not.toContain("<script>alert(1)</script>");
    expect(render()).not.toContain("javascript:");
  });

  it("filters by day, category, area and price, with each choice's count", () => {
    const sat = render("day=2026-11-21");
    expect(sat).toContain("<h2>11月21日 周六</h2>");
    expect(parts(sat)).toEqual([["Saturday Match"], ["Lantern Walk"]]);
    expect(sat).toContain('href="/go/?lang=zh&#38;day=2026-11-21" aria-current="date"');

    expect(chips(render(), "分类")).toEqual(["全部分类", "演出音乐 1", "吃喝市集 1", "文化展览 1", "节日庆典 1", "亲子家庭 1"]);
    expect(chips(render(), "地区")).toEqual(["全部地区", "温哥华市 3", "列治文 2"]);
    expect(chips(render(), "价格")).toEqual(["价格不限", "免费 3", "$20 以内 4"]);
    expect(render("lang=en", "en")).toContain("$20 or less");

    expect(parts(render("cat=family"))).toEqual([["Family Storytime"]]);
    expect(parts(render("area=richmond"))).toEqual([["春节书法课", "Craft Fair"]]);
    expect(parts(render("price=free"))).toEqual([["Family Storytime", "春节书法课"], ["Lantern Walk"]]);
    expect(parts(render("price=20"))).toEqual([["Family Storytime", "春节书法课", "Craft Fair"], ["Lantern Walk"]]);
    expect(chips(render("area=richmond"), "价格")).toEqual(["价格不限", "免费 1", "$20 以内 2"]);
    expect(render("cat=family")).toContain("清除筛选");
    expect(render()).not.toContain("清除筛选");
  });

  it("every count is what its link shows", () => {
    for (const query of ["", "day=2026-11-21", "area=richmond", "cat=family&price=20", "price=free&area=vancouver"]) {
      const html = render(query);
      // (a chosen chip's link takes the choice off again, so only the others are checked)
      const links = [...html.matchAll(/<a class="(?:chip|dayc[^"]*)" href="([^"]+)">(?:(?!<\/a>).)*?<span class="n">(\d+)<span class="vh">/g)];
      expect(links.length, query).toBeGreaterThan(3);
      for (const [, link, n] of links) {
        const target = new URLSearchParams(link.replace(/&#38;/g, "&").replace(/^\/go\/\?/, ""));
        expect(count(renderPage(pub, target, "zh", NOW)), `${query} → ${link}`).toBe(n);
      }
    }
  });

  it("keeps to the published days and our own names, and says when nothing matches", () => {
    for (const q of ["day=2026-12-25", "day=2026-11-13", "day=2026-11-31", "day=2026-11-99", "day=tomorrow", "cat=gaming", "area=seattle", "price=10"]) {
      const html = render(q);
      expect(html, q).toContain("<h2>今天 11月14日 周六</h2>");
      expect(html, q).not.toContain("清除筛选");
    }
    const none = render("cat=nightlife&area=richmond");
    expect(none).toContain('<p class="empty">这天没有符合的活动。');
    expect(none).toContain('<a href="/go/?lang=zh">清除筛选</a>');
  });

  it("says so when the runs have stopped, rather than showing an old list as today's", () => {
    expect(render()).not.toContain('class="stale"');
    expect(render("", "zh", pub, Date.parse("2026-11-15T16:00:00Z"))).not.toContain('class="stale"');
    expect(render("", "zh", pub, Date.parse("2026-11-16T16:00:00Z"))).toContain("这几天没有更新，下面是 11月14日 抓到的");
    expect(render("", "en", pub, Date.parse("2026-11-29T16:00:00Z"))).toContain("No update for a few days");
  });

  it("carries the language in every link, and switches it keeping the view", () => {
    const html = render("day=2026-11-21&cat=outdoors");
    expect(html).toContain('<a class="lang" href="/go/?lang=en&#38;day=2026-11-21&#38;cat=outdoors" data-lang="en" lang="en">English</a>');
    for (const m of html.matchAll(/href="(\/go[^"]*)"/g)) expect(m[1]).toMatch(/^\/go\/(submit)?\?lang=(zh|en)/);
    // and the way to send an event in
    expect(html).toContain('<a href="/go/submit?lang=zh">知道一个活动清单上没有？投稿给我们</a>');
    expect(render("", "en")).toContain('<a class="lang" href="/go/?lang=zh" data-lang="zh" lang="zh-CN">中文</a>');
  });

  it("offers the calendar feed for the category and area shown, and says what it keeps", () => {
    const html = render("cat=family&area=vancouver&price=free&day=2026-11-21");
    expect(html).toContain("订阅到手机日历，每天自动更新（只含亲子家庭 · 温哥华市 · 免费）：");
    expect(html).toContain('href="webcal://changle.ca/go/api/events.ics?cat=family&#38;area=vancouver&#38;tag=free"');
    expect(html).toContain(`href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent("webcal://changle.ca/go/api/events.ics?cat=family&area=vancouver&tag=free")}"`);
    expect(render()).toContain('href="webcal://changle.ca/go/api/events.ics"');
    expect(render("", "en")).toContain("Subscribe in your calendar and it updates every day: ");
  });

  it("before the first run, or with nothing published, says so", () => {
    expect(render("", "zh", null)).toContain("第一轮还没跑完，过一会儿再来看");
    expect(render("", "en", null)).toContain("the first run isn't done yet");
    const empty = render("", "en", { ...pub, events: [], count: 0 });
    expect(empty).toContain("Nothing matches on this day.");
    expect(empty).not.toContain("From .");
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
    expect(siteTokens.length).toBeGreaterThan(1000);
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
    const res = await get("/go/?area=richmond", { "accept-language": "en-CA,en;q=0.9" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("vary")).toBe("Accept-Language");
    expect(await res.text()).toContain('<html lang="en" data-lang="en">');
    expect(await (await get("/go/?lang=zh", { "accept-language": "en-CA" })).text()).toContain('<html lang="zh-CN" data-lang="zh">');
  });

  it("before the first run: the page says so", async () => {
    const res = await get("/go");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("第一轮还没跑完");
  });
});
