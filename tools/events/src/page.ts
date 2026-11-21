// The page at changle.ca/go: 玩什么 · What's On, what's on around Greater Vancouver in the next two
// weeks, one day at a time, by category, area and price, in Chinese or English. Plain HTML from the
// Worker, built from what the morning run published (KV "events:live"). Every filter is a link, so
// the page works without script, opens fast on a phone and a filtered view can be shared. The few
// lines of script only keep the language in step with the rest of changle.ca.
import { AREA_LABEL, CATEGORY_LABEL, clock, esc, shortDate, SOURCE_ZH, STATUS_LABEL, TAG_LABEL, two, webUrl, weekday, WEEKDAY, type Lang, type Pair } from "./labels";
import { dayOf, filterEvents } from "./query";
import { addDays, vanParts } from "./time";
import { AREAS, CATEGORIES, type Area, type Category, type PublicEvent, type Published } from "./types";

/** The price filter: free only, or at most $20 (free counts). */
export type Price = "free" | "20";

/** What the page shows: one day, at most one category and one area, and a price. */
export interface View {
  lang: Lang;
  day: string;
  cat: Category | null;
  area: Area | null;
  price: Price | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The language: ?lang= if it's given, otherwise the first language the browser asks for, as the rest
 * of changle.ca decides on a first visit (Chinese if that's Chinese, English otherwise). The script
 * on the page then follows the language chosen on changle.ca, if it's another.
 */
export function pickLang(params: URLSearchParams, acceptLanguage: string | null): Lang {
  const asked = params.get("lang");
  if (asked === "zh" || asked === "en") return asked;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim();
  return first ? (/^zh\b/i.test(first) ? "zh" : "en") : "zh";
}

/** The view a query asks for, kept to the published days and to our own names. */
export function readView(params: URLSearchParams, pub: Pick<Published, "from" | "to">, lang: Lang, now: number): View {
  const today = vanParts(now).date;
  const first = today < pub.from ? pub.from : today > pub.to ? pub.to : today;
  const day = params.get("day") ?? "";
  const cat = params.get("cat");
  const area = params.get("area");
  const price = params.get("price");
  return {
    lang,
    // a day that exists (not 31 November) and is one of those published from the first shown on
    day: DATE.test(day) && addDays(day, 0) === day && day >= first && day <= pub.to ? day : first,
    cat: (CATEGORIES as readonly string[]).includes(cat ?? "") ? (cat as Category) : null,
    area: (AREAS as readonly string[]).includes(area ?? "") ? (area as Area) : null,
    price: price === "free" || price === "20" ? price : null,
  };
}

const isFree = (e: PublicEvent) => e.isFree === true || e.tags.includes("free");

const priceOk = (e: PublicEvent, price: Price | null) =>
  price === null || isFree(e) || (price === "20" && e.priceMin !== null && e.priceMin <= 20);

/** A night out that started the day before and ends in the small hours isn't on this day's list. */
const overBy5am = (e: PublicEvent, day: string) => dayOf(e.start) < day && e.end !== null && e.end.length > 10 && dayOf(e.end) === day && e.end.slice(11, 16) <= "05:00";

/** The events on a day that pass the filters, leaving out the ones named in `skip` (for a row's counts). */
function pick(events: PublicEvent[], v: View, day: string, skip: "cat" | "area" | "price" | null = null): PublicEvent[] {
  return filterEvents(events, {
    from: day,
    to: day,
    cats: v.cat && skip !== "cat" ? [v.cat] : [],
    areas: v.area && skip !== "area" ? [v.area] : [],
    tags: [],
  }).filter((e) => !overBy5am(e, day) && priceOk(e, skip === "price" ? null : v.price));
}

/** A source by the name people use in the page's language. */
const sourceName = (name: string, lang: Lang) => (lang === "zh" ? (SOURCE_ZH[name] ?? name) : name);

/**
 * A link to the page with the view changed. The language always goes in (otherwise the browser's own
 * would decide again); the day only when it isn't the first one shown, so a shared link stays current.
 * Always "/go/?…", with the slash: Cloudflare sends changle.ca/go to this Worker only without a query
 * string ("changle.ca/go" in wrangler.jsonc); "/go?lang=zh" would go to the site instead, while
 * "/go/?lang=zh" matches "changle.ca/go/*" (14 November 2026).
 */
function href(v: View, change: Partial<View>, first: string): string {
  const n = { ...v, ...change };
  const p = new URLSearchParams();
  p.set("lang", n.lang);
  if (n.day !== first) p.set("day", n.day);
  if (n.cat) p.set("cat", n.cat);
  if (n.area) p.set("area", n.area);
  if (n.price) p.set("price", n.price);
  return `/go/?${p}`;
}

/** "$15" or "$14.86" */
const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** "11/24" / "24 Nov": short enough for the time column. */
const until = (date: string, lang: Lang) => (lang === "zh" ? `至 ${+date.slice(5, 7)}/${+date.slice(8, 10)}` : `until ${shortDate(date, lang)}`);

/** The time column: when it starts (and ends, the same day), and the last day if it runs on. */
function whenLines(e: PublicEvent, day: string, lang: Lang): string[] {
  const zh = lang === "zh";
  const start = dayOf(e.start);
  const end = e.end ? dayOf(e.end) : start;
  // a night that ends by 05:00 the next day ends at a time, not on a day ("22:00 至 02:00")
  const overnight = start === day && e.end !== null && e.end.length > 10 && end === addDays(day, 1) && e.end.slice(11, 16) <= "05:00";
  const lines: string[] = [];
  if (start < day) lines.push(zh ? "进行中" : "On now");
  else if (e.timeTBD) lines.push(zh ? "时间待定" : "Time TBA");
  else if (e.allDay) lines.push(zh ? "全天" : "All day");
  else {
    lines.push(clock(e.start, lang));
    if (e.end && e.end.length > 10 && (end === start || overnight)) lines.push(zh ? `至 ${clock(e.end, lang)}` : `to ${clock(e.end, lang)}`);
  }
  if (end > day && !overnight) lines.push(until(end, lang));
  return lines;
}

/** Within a day: by time, then all day, then time to be announced. */
const order = (e: PublicEvent) => (e.timeTBD ? 2 : e.allDay ? 1 : 0);

/** Plain comparison: the same order as localeCompare for these ISO times, without building a collator. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A title's own language, so a screen reader reads an English title in an English voice on the Chinese page. */
const titleLang = (title: string): Lang => (/[\u3400-\u9fff]/.test(title) ? "zh" : "en");

/** Words only a screen reader hears ("43" on a chip is "43 events"). */
const hidden = (text: string) => `<span class="vh">${text}</span>`;

/** The source's picture of the event, over https; none when it has none. */
function picture(e: PublicEvent): string {
  const src = e.imageUrl ? webUrl(e.imageUrl.replace(/^http:\/\//i, "https://")) : null;
  // decorative (the name says what it is); lazy, and no address of this page sent with it
  return src ? `<img class="pic" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : "";
}

const langAttr = (text: string, lang: Lang) => {
  const own = titleLang(text);
  return own === lang ? "" : ` lang="${own === "zh" ? "zh-CN" : "en"}"`;
};

function eventItem(e: PublicEvent, day: string, lang: Lang): string {
  const zh = lang === "zh";
  const L = (p: Pair) => (zh ? p[0] : p[1]);
  const url = webUrl(e.url);
  // on the Chinese page the name in Chinese when it has one, and the source's own under it, small:
  // that's the name at the door and on the source's page
  const name = zh && e.titleZh ? e.titleZh : e.title;
  const original = name !== e.title ? e.title : null;
  const title = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>` : esc(name);
  const titleAttr = langAttr(name, lang);
  // the street is enough next to the area ("3461 Ross Drive", not the city, province and postcode);
  // it opens a map, since nothing on the page can be copied (the site's rule)
  const street = e.address ? e.address.split(",")[0].trim() : "";
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue, e.address].filter(Boolean).join(", "))}`;
  const summary = zh ? e.summaryZh : e.summaryEn;
  const flags: string[] = [];
  if (e.status !== "scheduled") flags.push(`<span class="flag warn">${L(STATUS_LABEL[e.status])}</span>`);
  if (e.featured) flags.push(`<span class="flag">${L(TAG_LABEL.featured)}</span>`);
  const where = [e.venue, e.area ? L(AREA_LABEL[e.area]) : null].filter((s): s is string => !!s);
  const facts: string[] = [];
  if (isFree(e)) facts.push(L(TAG_LABEL.free));
  else if (e.priceMin !== null) facts.push(zh ? `${dollars(e.priceMin)} 起` : `From ${dollars(e.priceMin)}`);
  if (e.category) facts.push(L(CATEGORY_LABEL[e.category]));
  if (e.lang === "zh") facts.push(zh ? "中文活动" : "In Chinese");
  else if (e.lang === "both") facts.push(zh ? "中英双语" : "Chinese and English");
  facts.push(sourceName(e.sourceName, lang));
  return (
    `<li class="ev"><p class="when">${whenLines(e, day, lang).map((l) => `<span>${esc(l)}</span>`).join("")}</p><div class="what">` +
    picture(e) +
    (flags.length ? `<p class="flags">${flags.join("")}</p>` : "") +
    `<h3 class="title"${titleAttr}>${title}</h3>` +
    (original ? `<p class="orig"${langAttr(original, lang)}>${esc(original)}</p>` : "") +
    (summary ? `<p class="sum">${esc(summary)}</p>` : "") +
    (where.length || street
      ? `<p class="place">${where.map(esc).join(" · ")}${street ? `<span class="addr"><a href="${esc(map)}" target="_blank" rel="noopener noreferrer">${esc(street)}${hidden(zh ? "（地图）" : " (map)")}</a></span>` : ""}</p>`
      : "") +
    `<p class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</p></div></li>`
  );
}

/** A row of choices: "all" first, then each value with how many events it would show. */
function chipRow<T extends string>(
  name: string,
  values: readonly T[],
  label: (v: T) => string,
  count: (v: T) => number,
  active: T | null,
  link: (v: T | null) => string,
  allLabel: string,
  unit: string,
): string {
  const chip = (text: string, to: string, on: boolean, n: number | null) =>
    `<li><a class="chip" href="${esc(to)}"${on ? ' aria-current="true"' : ""}>${esc(text)}${n === null ? "" : `<span class="n">${n}${hidden(unit)}</span>`}</a></li>`;
  const items = values.filter((v) => v === active || count(v) > 0).map((v) => chip(label(v), link(v === active ? null : v), v === active, count(v)));
  return `<nav class="row" aria-label="${esc(name)}"><ul class="chips">${chip(allLabel, link(null), active === null, null)}${items.join("")}</ul></nav>`;
}

/** The days to pick from: each published day from the first shown, with how many events it has. */
function dayStrip(pub: Published, v: View, first: string, today: string): string {
  const zh = v.lang === "zh";
  const days: string[] = [];
  for (let d = first; d <= pub.to; d = addDays(d, 1)) days.push(d);
  const items = days.map((d) => {
    const top = d === today ? (zh ? "今天" : "Today") : d === addDays(today, 1) ? (zh ? "明天" : "Tomorrow") : WEEKDAY[v.lang][weekday(d)];
    const date = zh ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : shortDate(d, "en");
    const weekend = weekday(d) === 0 || weekday(d) === 6;
    return `<li><a class="dayc${weekend ? " we" : ""}" href="${esc(href(v, { day: d }, first))}"${d === v.day ? ' aria-current="date"' : ""}><span>${esc(top)}</span><span class="d">${esc(date)}</span><span class="n">${pick(pub.events, v, d).length}${hidden(zh ? " 个活动" : " events")}</span></a></li>`;
  });
  return `<nav class="days" aria-label="${zh ? "日期" : "Day"}"><ul>${items.join("")}</ul></nav>`;
}

/** The calendar feed for the category and area shown (the day and the price aren't part of a feed). */
function feedLinks(v: View): string {
  const zh = v.lang === "zh";
  const L = (p: Pair) => (zh ? p[0] : p[1]);
  const scope = [v.cat && L(CATEGORY_LABEL[v.cat]), v.area && L(AREA_LABEL[v.area]), v.price === "free" && L(TAG_LABEL.free)].filter(Boolean).join(" · ");
  const p = new URLSearchParams();
  if (v.cat) p.set("cat", v.cat);
  if (v.area) p.set("area", v.area);
  if (v.price === "free") p.set("tag", "free");
  const query = p.toString();
  const path = `changle.ca/go/api/events.ics${query ? `?${query}` : ""}`;
  const apple = `webcal://${path}`;
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(apple)}`;
  return `<p>${zh ? "订阅到手机日历，每天自动更新" : "Subscribe in your calendar and it updates every day"}${scope ? (zh ? `（只含${esc(scope)}）` : ` (${esc(scope)} only)`) : ""}${zh ? "：" : ": "}<a href="${esc(apple)}">${zh ? "苹果日历" : "Apple Calendar"}</a> · <a href="${esc(google)}" target="_blank" rel="noopener noreferrer">${zh ? "Google 日历" : "Google Calendar"}</a></p>`;
}

/*
 * The colors, sizes and corners are changle.ca's own (site/src/styles/tokens.css), copied here because
 * this page comes from its own Worker; tests/page.test.ts checks each one still matches the site's.
 * Tools are amber, so amber is this page's light.
 */
export const TOKENS: Record<string, string> = {
  "--night": "#0e0c22",
  "--dusk": "#181633",
  "--dusk-2": "#221f44",
  "--line": "#35325a",
  "--line-soft": "rgba(181, 178, 220, 0.14)",
  "--moon": "#f5f4fd",
  "--haze": "#b6b4d0",
  "--fog": "#7f7c9d",
  "--gel-amber": "#ffb82e",
  "--font-zh": '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
  "--leading-zh": "1.65",
  "--leading-en": "1.5",
  "--leading-tight": "1.1",
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-md": "1rem",
  "--text-lg": "1.125rem",
  "--text-2xl": "clamp(1.75rem, 1.6203rem + 0.5607vw, 2.125rem)",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-6": "24px",
  "--space-8": "32px",
  "--space-12": "48px",
  "--r-small": "10px",
  "--r-field": "14px",
  "--r-pill": "999px",
  "--tap": "44px",
  "--tap-crowded": "48px",
  "--page-max": "560px",
};

const CSS = `:root{${Object.entries(TOKENS)
  .map(([k, v]) => `${k}:${v}`)
  .join(";")};--gel:var(--gel-amber);--on-gel:var(--night);--leading:var(--leading-zh);--font-text:-apple-system,var(--font-zh);color-scheme:dark}
:root:lang(en){--leading:var(--leading-en)}
*{box-sizing:border-box}
*,*::before,*::after{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
body{margin:0;background:var(--night);color:var(--moon);font:var(--text-md)/var(--leading) var(--font-text);-webkit-text-size-adjust:100%}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
main{max-width:var(--page-max);margin:0 auto;padding:var(--space-4) max(var(--space-4),env(safe-area-inset-right,0px)) var(--space-12) max(var(--space-4),env(safe-area-inset-left,0px))}
a{color:inherit}
a:focus-visible{outline:2px solid var(--gel);outline-offset:2px;border-radius:var(--r-small)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3)}
.bar a{display:inline-flex;align-items:center;min-height:var(--tap);padding:0 var(--space-3);border-radius:var(--r-pill);text-decoration:none;font-size:var(--text-sm);color:var(--haze)}
.bar .lang{border:1px solid var(--line);color:var(--moon)}
h1{font-size:var(--text-2xl);line-height:var(--leading-tight);margin:var(--space-3) 0 0;color:var(--gel)}
.lead{color:var(--haze);margin:var(--space-2) 0 0}
.days,.row{position:relative;margin:var(--space-4) calc(-1 * var(--space-4)) 0;overflow-x:auto;scrollbar-width:none}
.days::-webkit-scrollbar,.row::-webkit-scrollbar{display:none}
.days ul,.chips{display:flex;gap:var(--space-2);margin:0;padding:0 var(--space-4);list-style:none;width:max-content}
.dayc{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:3.75rem;min-height:4.5rem;padding:var(--space-1) var(--space-2);border-radius:var(--r-field);background:var(--dusk);border:1px solid var(--line);text-decoration:none;font-size:var(--text-sm);line-height:var(--leading-tight);gap:var(--space-1)}
.dayc .d{color:var(--haze);font-size:var(--text-xs)}
.dayc .n{color:var(--haze);font-size:var(--text-xs);font-variant-numeric:tabular-nums}
.dayc.we{border-color:var(--haze)}
.dayc[aria-current]{background:var(--gel);border-color:var(--gel);color:var(--on-gel);font-weight:600}
.dayc[aria-current] .d,.dayc[aria-current] .n{color:var(--on-gel)}
.chip{display:inline-flex;align-items:center;gap:var(--space-2);min-height:var(--tap-crowded);padding:0 var(--space-4);border-radius:var(--r-pill);background:var(--dusk);border:1px solid var(--line);text-decoration:none;font-size:var(--text-sm);white-space:nowrap}
.chip .n{color:var(--haze);font-size:var(--text-xs);font-variant-numeric:tabular-nums}
.chip[aria-current]{background:var(--gel);border-color:var(--gel);color:var(--on-gel);font-weight:600}
.chip[aria-current] .n{color:var(--on-gel)}
.head{display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3);margin:var(--space-6) 0 0;padding-bottom:var(--space-2);border-bottom:1px solid var(--line)}
.head h2{font-size:var(--text-lg);line-height:var(--leading-tight);margin:0}
.head p{margin:0;color:var(--haze);font-size:var(--text-sm);text-align:right}
.head a{color:var(--gel)}
.head a,.empty a,footer a{display:inline-flex;align-items:center;min-height:var(--tap)}
.events{list-style:none;margin:0;padding:0}
.ev{position:relative;display:grid;grid-template-columns:4.75rem minmax(0,1fr);gap:var(--space-3);padding:var(--space-4) 0;border-bottom:1px solid var(--line-soft)}
:root:lang(en) .ev{grid-template-columns:5.5rem minmax(0,1fr)}
.when{margin:0;color:var(--haze);font-size:var(--text-sm);font-variant-numeric:tabular-nums;padding-top:2px}
.when span{display:block}
.what{min-width:0;overflow-wrap:anywhere}
.what p{margin:var(--space-1) 0 0}
.title{font-size:var(--text-md);margin:0;font-weight:600;overflow-wrap:anywhere}
.title a{text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px}
.title a:hover{text-decoration-color:var(--gel)}
.title a::after{content:"";position:absolute;inset:0}
.pic{display:block;width:100%;max-width:22rem;aspect-ratio:3/1;object-fit:cover;object-position:50% 30%;border-radius:var(--r-small);background:var(--dusk);margin:0 0 var(--space-2)}
.orig{color:var(--haze);font-size:var(--text-xs);overflow-wrap:anywhere}
.sum{font-size:var(--text-sm)}
.place{color:var(--haze);font-size:var(--text-sm);overflow-wrap:anywhere}
.addr{display:block;color:var(--fog)}
.addr a{position:relative;z-index:1;display:inline-block;padding:var(--space-3) 0;margin:calc(-1 * var(--space-3)) 0;text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px}
.facts{display:flex;flex-wrap:wrap;column-gap:var(--space-3);color:var(--haze);font-size:var(--text-xs)}
.flags{display:flex;flex-wrap:wrap;gap:var(--space-2);margin:0 0 var(--space-1)!important}
.flag{font-size:var(--text-xs);padding:0 var(--space-2);border-radius:var(--r-pill);background:var(--dusk-2);color:var(--gel)}
.flag.warn{color:var(--moon)}
.more{margin-top:var(--space-4)}
.more summary{display:flex;align-items:center;gap:var(--space-2);min-height:var(--tap);color:var(--gel);cursor:pointer;font-size:var(--text-sm);list-style:none}
.more summary::-webkit-details-marker{display:none}
.more summary:focus-visible{outline:2px solid var(--gel);outline-offset:2px;border-radius:var(--r-small)}
.more summary::before{content:"+";font-weight:600}
.more[open] summary::before{content:"−"}
.empty,.stale{color:var(--haze);margin-top:var(--space-6)}
.stale{margin-top:var(--space-3);color:var(--moon)}
.empty a{color:var(--gel)}
footer{color:var(--haze);font-size:var(--text-sm);margin-top:var(--space-8);border-top:1px solid var(--line);padding-top:var(--space-4)}
footer p{margin:0 0 var(--space-3)}
footer a{color:var(--gel)}
@media (min-width:720px){.days,.row{margin-inline:0;overflow:visible}.days ul,.chips{flex-wrap:wrap;width:auto;padding:0}}`;

/*
 * Keeps the language in step with changle.ca, which saves the reader's choice in this browser
 * (site/src/store.tsx, "lazysusan.settings.v1"): with no ?lang in the address, open in that language
 * (at /go/, with the slash: see `href`); tapping 中文 / English here saves the choice for the site too.
 */
// (the first line: a double tap never zooms. iPhone Safari honours the touch-action in CSS only on a tap
// near something that listens for clicks, so the page itself listens)
const SCRIPT = `document.documentElement.addEventListener("click",function(){});(function(){var K="lazysusan.settings.v1";try{var u=new URL(location.href),s=JSON.parse(localStorage.getItem(K)||"{}"),l=document.documentElement.getAttribute("data-lang");if(!u.searchParams.has("lang")&&(s.lang==="zh"||s.lang==="en")&&s.lang!==l){u.searchParams.set("lang",s.lang);u.pathname="/go/";location.replace(u.href);return}document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[data-lang]");if(!a)return;try{var t=JSON.parse(localStorage.getItem(K)||"{}");t.lang=a.getAttribute("data-lang");localStorage.setItem(K,JSON.stringify(t))}catch(_){}})}catch(_){}})();`;

function shell(lang: Lang, langLink: string, body: string): string {
  const zh = lang === "zh";
  return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}" data-lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="${TOKENS["--night"]}"><title>${zh ? "玩什么 · 大温这两周去哪玩" : "What's On · Greater Vancouver"}</title><meta name="description" content="${zh ? "大温哥华未来两周的活动，每天早上更新。" : "What's on around Greater Vancouver in the next two weeks, updated every morning."}"><script>${SCRIPT}</script><style>${CSS}</style></head><body><main><div class="bar"><a href="/tools">‹ ${zh ? "工具" : "Tools"}</a><a class="lang" href="${esc(langLink)}" data-lang="${zh ? "en" : "zh"}" lang="${zh ? "en" : "zh-CN"}">${zh ? "English" : "中文"}</a></div><h1>${zh ? "玩什么" : "What's On"}</h1>${body}</main><script>try{var d=document.querySelector(".days [aria-current]"),s=d&&d.closest(".days");if(s&&s.scrollWidth>s.clientWidth)s.scrollLeft+=d.getBoundingClientRect().left-s.getBoundingClientRect().left-(s.clientWidth-d.offsetWidth)/2}catch(_){}</script></body></html>`;
}

/** The whole page for the published events (null before the first run), a query and a language. */
export function renderPage(pub: Published | null, params: URLSearchParams, lang: Lang, now = Date.now()): string {
  const zh = lang === "zh";
  if (!pub) {
    return shell(lang, `/go/?lang=${zh ? "en" : "zh"}`, `<p class="lead">${zh ? "大温这两周去哪玩。每天早上 6 点更新，第一轮还没跑完，过一会儿再来看。" : "What's on around Greater Vancouver in the next two weeks. It updates every morning at 6, and the first run isn't done yet: try again soon."}</p>`);
  }
  const today = vanParts(now).date;
  const v = readView(params, pub, lang, now);
  const first = readView(new URLSearchParams(), pub, lang, now).day;
  const L = (p: Pair) => (zh ? p[0] : p[1]);
  const g = vanParts(Date.parse(pub.generatedAt));
  const updated = `${shortDate(g.date, lang)} ${clock(`${g.date}T${two(g.hour)}:${two(g.minute)}`, lang)}`;
  const lead = zh ? `大温这两周去哪玩，每天早上 6 点更新（上次 ${updated}）。` : `What's on around Greater Vancouver in the next two weeks, updated every morning at 6 (last ${updated}).`;
  // the runs stopped: say so, rather than show an old list as today's
  const stale =
    pub.runId < addDays(today, -1)
      ? `<p class="stale">${zh ? `这几天没有更新，下面是 ${shortDate(pub.runId, lang)} 抓到的，有些活动可能变了。` : `No update for a few days: this is what was found on ${shortDate(pub.runId, lang)}, and some events may have changed.`}</p>`
      : "";
  const unit = zh ? " 个活动" : " events";

  const onDay = (skip: "cat" | "area" | "price") => pick(pub.events, v, v.day, skip);
  const forCat = onDay("cat");
  const forArea = onDay("area");
  const forPrice = onDay("price");
  const filters =
    chipRow(zh ? "分类" : "Category", CATEGORIES, (c) => L(CATEGORY_LABEL[c]), (c) => forCat.filter((e) => e.category === c).length, v.cat, (c) => href(v, { cat: c }, first), zh ? "全部分类" : "All kinds", unit) +
    chipRow(zh ? "地区" : "Area", AREAS, (a) => L(AREA_LABEL[a]), (a) => forArea.filter((e) => e.area === a).length, v.area, (a) => href(v, { area: a }, first), zh ? "全部地区" : "All areas", unit) +
    chipRow<Price>(
      zh ? "价格" : "Price",
      ["free", "20"],
      (p) => (p === "free" ? L(TAG_LABEL.free) : zh ? "$20 以内" : "$20 or less"),
      (p) => forPrice.filter((e) => priceOk(e, p)).length,
      v.price,
      (p) => href(v, { price: p }, first),
      zh ? "价格不限" : "Any price",
      unit,
    );

  const all = pick(pub.events, v, v.day);
  const byTime = (a: PublicEvent, b: PublicEvent) => order(a) - order(b) || cmp(a.start, b.start) || cmp(a.title, b.title);
  // Today, what has ended (or, with no end given, started three hours ago) goes last, folded: still
  // the day's, but not what someone looking in the evening wants first. All-day and to-be-announced stay.
  const at = vanParts(now);
  const nowAt = `${today}T${two(at.hour)}:${two(at.minute)}`;
  const isOver = (e: PublicEvent) =>
    v.day === today && !e.allDay && !e.timeTBD && (e.end !== null && e.end.length > 10 ? e.end.slice(0, 16) <= nowAt : Date.parse(e.start) + 3 * 3600_000 <= now);
  const ended = all.filter(isOver).sort(byTime);
  // events that started on an earlier day (exhibitions, series) would open every day's list: folded below it
  const starting = all.filter((e) => dayOf(e.start) >= v.day && !isOver(e)).sort(byTime);
  const running = all.filter((e) => dayOf(e.start) < v.day && !isOver(e)).sort((a, b) => cmp(a.end ?? a.start, b.end ?? b.start) || cmp(a.title, b.title));
  const list = [...starting, ...running, ...ended];
  const filtered = v.cat !== null || v.area !== null || v.price !== null;
  const dayLabel = `${v.day === today ? (zh ? "今天 " : "Today, ") : v.day === addDays(today, 1) ? (zh ? "明天 " : "Tomorrow, ") : ""}${zh ? `${shortDate(v.day, lang)} ${WEEKDAY.zh[weekday(v.day)]}` : `${WEEKDAY.en[weekday(v.day)]} ${shortDate(v.day, lang)}`}`;
  const clear = href(v, { cat: null, area: null, price: null }, first);
  const head = `<div class="head"><h2>${esc(dayLabel)}</h2><p>${zh ? `${list.length} 个活动` : `${list.length} ${list.length === 1 ? "event" : "events"}`}${filtered ? ` · <a href="${esc(clear)}">${zh ? "清除筛选" : "Clear filters"}</a>` : ""}</p></div>`;
  const folded = running.length
    ? `<details class="more"${starting.length ? "" : " open"}><summary>${zh ? `还有 ${running.length} 个活动这几天一直在办（展览、系列活动等）` : `${running.length} more running since an earlier day (exhibitions, series)`}</summary><ol class="events">${running.map((e) => eventItem(e, v.day, lang)).join("")}</ol></details>`
    : "";
  const done = ended.length
    ? `<details class="more"${starting.length || running.length ? "" : " open"}><summary>${zh ? `今天早些时候的 ${ended.length} 个（已经结束或开始很久了）` : `${ended.length} earlier today (over, or started hours ago)`}</summary><ol class="events">${ended.map((e) => eventItem(e, v.day, lang)).join("")}</ol></details>`
    : "";
  const body = list.length
    ? `${starting.length ? `<ol class="events">${starting.map((e) => eventItem(e, v.day, lang)).join("")}</ol>` : ""}${folded}${done}`
    : `<p class="empty">${zh ? "这天没有符合的活动。" : "Nothing matches on this day."}${filtered ? ` <a href="${esc(clear)}">${zh ? "清除筛选" : "Clear filters"}</a>` : ""}</p>`;

  const sources = [...new Set(pub.events.map((e) => sourceName(e.sourceName, lang)))];
  const from = sources.length ? (zh ? `活动来自 ${sources.map(esc).join("、")}。` : `From ${sources.map(esc).join(", ")}. `) : "";
  const footer = `<footer>${feedLinks(v)}<p>${from}${zh ? "时间、地点和票价以主办方的页面为准。" : "Check the organiser's page for the latest times, places and prices."}</p><p><a href="https://changle.ca">changle.ca</a></p></footer>`;
  return shell(lang, href(v, { lang: zh ? "en" : "zh" }, first), `<p class="lead">${lead}</p>${stale}${dayStrip(pub, v, first, today)}${filters}${head}${body}${footer}`);
}
