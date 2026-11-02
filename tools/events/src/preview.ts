// The preview at changle.ca/go/preview: what the morning run published (KV "events:live"), day by
// day, in Chinese or English (?lang=en), with the API's filters (cat, area, tag) as links. Nothing
// links to it and it asks search engines to skip it: it's for checking what the run found while
// the page itself (task C7) is still to come. Plain HTML from the Worker, no script.
import { dayOf, filterEvents, readQuery } from "./query";
import { addDays, vanParts } from "./time";
import { AREAS, CATEGORIES, TAGS, type Area, type Category, type EventStatus, type PublicEvent, type Published, type Tag } from "./types";

type Lang = "zh" | "en";
type Pair = readonly [zh: string, en: string];

/** The names in CONTRACTS.md, "The 8 categories and the 7 areas". */
export const CATEGORY_LABEL: Record<Category, Pair> = {
  social: ["社交聚会", "Social & Meetups"],
  shows: ["演出音乐", "Concerts & Shows"],
  food: ["吃喝市集", "Food & Markets"],
  outdoors: ["户外运动", "Outdoors & Sports"],
  arts: ["文化展览", "Arts & Culture"],
  festivals: ["节日庆典", "Festivals & Holidays"],
  family: ["亲子家庭", "Family & Kids"],
  nightlife: ["夜生活派对", "Nightlife & Parties"],
};

export const AREA_LABEL: Record<Area, Pair> = {
  vancouver: ["温哥华市", "Vancouver"],
  richmond: ["列治文", "Richmond"],
  burnaby: ["本拿比", "Burnaby"],
  surrey: ["素里及白石", "Surrey & White Rock"],
  "north-shore": ["北岸", "North Shore"],
  "tri-cities": ["三联市及新西敏", "Tri-Cities & New West"],
  langley: ["兰里及菲沙河谷", "Langley & Fraser Valley"],
};

export const TAG_LABEL: Record<Tag, Pair> = {
  free: ["免费", "Free"],
  chinese: ["中文", "In Chinese"],
  students: ["学生", "Students"],
  newcomers: ["新移民", "Newcomers"],
  kids: ["带娃", "Kids"],
  indoor: ["室内", "Indoors"],
  outdoor: ["户外", "Outdoors"],
  tickets: ["要买票", "Tickets"],
  featured: ["本周推荐", "Featured"],
};

const STATUS_LABEL: Record<Exclude<EventStatus, "scheduled">, Pair> = {
  cancelled: ["已取消", "Cancelled"],
  postponed: ["延期", "Postponed"],
  rescheduled: ["改期", "Rescheduled"],
  soldout: ["售罄", "Sold out"],
};

const WEEKDAY: Record<Lang, readonly string[]> = {
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Text and attribute values: everything from a source goes through this. */
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A link only to a web page (never javascript: or data:). */
const webUrl = (u: string): string | null => (/^https?:\/\/[^\s]+$/i.test(u) ? u : null);

const two = (n: number) => String(n).padStart(2, "0");

/** "11月3日" / "3 Nov" */
function shortDate(date: string, lang: Lang): string {
  const m = +date.slice(5, 7);
  const d = +date.slice(8, 10);
  return lang === "zh" ? `${m}月${d}日` : `${d} ${MONTH[m - 1]}`;
}

/** "11月3日 周二" / "Tue 3 Nov" */
function dayName(date: string, lang: Lang): string {
  const wd = WEEKDAY[lang][new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay()];
  return lang === "zh" ? `${shortDate(date, lang)} ${wd}` : `${wd} ${shortDate(date, lang)}`;
}

/** "17:30" / "5:30 pm", from a Vancouver wall-clock time ("2026-11-10T17:30:00-07:00"). */
function clock(iso: string, lang: Lang): string {
  const h = +iso.slice(11, 13);
  const m = iso.slice(14, 16);
  if (lang === "zh") return `${two(h)}:${m}`;
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "am" : "pm"}`;
}

/** The current query with one parameter set (or removed, with null): a link that keeps the rest. */
function withParam(params: URLSearchParams, key: string, value: string | null): string {
  const p = new URLSearchParams(params);
  if (value) p.set(key, value);
  else p.delete(key);
  const s = p.toString();
  return s ? `?${s}` : "?";
}

/** The day an event is listed under: the day it starts, or the first day shown if it started before. */
const listedOn = (e: PublicEvent, first: string) => (dayOf(e.start) < first ? first : dayOf(e.start));

/** Within a day: under way already, then all day, then by time, then time to be announced. */
const rank = (e: PublicEvent, day: string) => (dayOf(e.start) < day ? 0 : e.timeTBD ? 3 : e.allDay ? 1 : 2);

/** The time column: when it starts (and ends, the same day), and the last day if it runs on. */
function whenLines(e: PublicEvent, day: string, lang: Lang): string[] {
  const zh = lang === "zh";
  const start = dayOf(e.start);
  const end = e.end ? dayOf(e.end) : start;
  const lines: string[] = [];
  if (start < day) lines.push(zh ? "进行中" : "On now");
  else if (e.timeTBD) lines.push(zh ? "时间待定" : "Time TBA");
  else if (e.allDay) lines.push(zh ? "全天" : "All day");
  else {
    lines.push(clock(e.start, lang));
    if (e.end && e.end.length > 10 && end === start) lines.push(zh ? `至 ${clock(e.end, lang)}` : `to ${clock(e.end, lang)}`);
  }
  if (end > day) lines.push(zh ? `至 ${shortDate(end, lang)}` : `until ${shortDate(end, lang)}`);
  return lines;
}

function eventItem(e: PublicEvent, day: string, lang: Lang): string {
  const zh = lang === "zh";
  const L = (p: Pair) => (zh ? p[0] : p[1]);
  const url = webUrl(e.url);
  const title = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a>` : esc(e.title);
  const summary = zh ? e.summaryZh : e.summaryEn;
  const flags: string[] = [];
  if (e.status !== "scheduled") flags.push(`<span class="flag warn">${L(STATUS_LABEL[e.status])}</span>`);
  if (e.featured) flags.push(`<span class="flag">${L(TAG_LABEL.featured)}</span>`);
  const place = e.venue ? esc(e.venue) + (e.address ? `<span class="addr">${esc(e.address)}</span>` : "") : zh ? "没写地点" : "No place given";
  const facts: string[] = [];
  facts.push(e.area ? L(AREA_LABEL[e.area]) + (e.areaCheck ? (zh ? "（待确认）" : " (to check)") : "") : zh ? "没有地区" : "No area");
  facts.push(e.category ? L(CATEGORY_LABEL[e.category]) : zh ? "未分类" : "Uncategorised");
  if (e.isFree === true || e.tags.includes("free")) facts.push(L(TAG_LABEL.free));
  else if (e.priceMin !== null) facts.push(zh ? `$${e.priceMin} 起` : `From $${e.priceMin}`);
  if (e.lang === "zh") facts.push(zh ? "中文活动" : "Held in Chinese");
  else if (e.lang === "both") facts.push(zh ? "中英双语" : "Chinese and English");
  for (const t of e.tags) if (t !== "free" && t !== "featured" && !(t === "chinese" && (e.lang === "zh" || e.lang === "both"))) facts.push(L(TAG_LABEL[t]));
  facts.push(e.sourceName);
  return `<li class="ev"><p class="when">${whenLines(e, day, lang).map((l) => `<span>${esc(l)}</span>`).join("")}</p><div class="what">${flags.length ? `<p class="flags">${flags.join("")}</p>` : ""}<h3 class="title">${title}</h3>${summary ? `<p class="sum">${esc(summary)}</p>` : ""}<p class="place">${place}</p><div class="facts"><p>${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</p></div></div></li>`;
}

/** One row of filter links, each with how many of the published events it has. */
function chipRow<T extends string>(
  name: string,
  values: readonly T[],
  label: Record<T, Pair>,
  count: Map<string, number>,
  active: T[],
  key: string,
  params: URLSearchParams,
  lang: Lang,
  note: string,
): string {
  const zh = lang === "zh";
  const multi = key === "tag";
  const items = values
    .filter((v) => (count.get(v) ?? 0) > 0 || active.includes(v))
    .map((v) => {
      const on = active.includes(v);
      const next = multi ? (on ? active.filter((a) => a !== v) : [...active, v]).join(",") : on ? null : v;
      return `<li><a href="${esc(withParam(params, key, next))}"${on ? ' aria-current="true"' : ""}>${esc(zh ? label[v][0] : label[v][1])}<span class="n">${count.get(v) ?? 0}</span></a></li>`;
    });
  return `<div class="filters"><h2>${name}</h2><ul class="chips">${items.join("")}</ul>${note ? `<p class="note">${note}</p>` : ""}</div>`;
}

function tally(events: PublicEvent[], of: (e: PublicEvent) => readonly (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) for (const k of of(e)) if (k !== null) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

const CSS = `:root{color-scheme:dark;--night:#0e0c22;--dusk:#181633;--dusk-2:#221f44;--line:#35325a;--line-soft:rgba(181,178,220,.14);--moon:#f5f4fd;--haze:#b6b4d0;--fog:#7f7c9d;--gel:#2ed3d9;--warn:#ffcf6b}
*{box-sizing:border-box}
body{margin:0;background:var(--night);color:var(--moon);font:16px/1.6 -apple-system,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:46rem;margin:0 auto;padding-block:24px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
a{color:inherit}
a:focus-visible{outline:2px solid var(--gel);outline-offset:2px;border-radius:4px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
h1{font-size:1.5rem;line-height:1.3;margin:0;text-wrap:balance}
.badge{display:inline-block;font-size:.75rem;line-height:1.5;font-weight:600;padding:2px 10px;border-radius:999px;border:1px solid var(--gel);color:var(--gel);vertical-align:.2em;margin-left:6px}
.lang{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--line);text-decoration:none;font-size:.875rem}
.lead{color:var(--haze);margin:12px 0 0;max-width:38em}
.lead a{color:var(--gel)}
.filters{margin-top:20px}
.filters h2{font-size:.875rem;font-weight:600;color:var(--haze);margin:0 0 8px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.chips a{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:999px;background:var(--dusk);border:1px solid var(--line);text-decoration:none;font-size:.875rem}
.chips a[aria-current]{background:var(--gel);border-color:var(--gel);color:var(--night);font-weight:600}
.chips .n{color:var(--fog);font-variant-numeric:tabular-nums}
.chips a[aria-current] .n{color:inherit}
.note{color:var(--fog);font-size:.8125rem;margin:6px 0 0}
.day{position:sticky;top:env(safe-area-inset-top,0px);z-index:1;background:var(--night);font-size:1.125rem;line-height:1.4;margin:28px 0 0;padding:10px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px}
.day .n{color:var(--fog);font-size:.875rem;font-weight:400;align-self:center}
.events{list-style:none;margin:0;padding:0}
.ev{display:grid;grid-template-columns:5.5rem minmax(0,1fr);gap:12px;padding:14px 0;border-bottom:1px solid var(--line-soft)}
.when{margin:0;color:var(--haze);font-size:.875rem;font-variant-numeric:tabular-nums;line-height:1.5;padding-top:2px}
.when span{display:block}
.what{min-width:0}
.what p{margin:4px 0 0}
.title{font-size:1rem;line-height:1.5;margin:0;font-weight:600;overflow-wrap:anywhere}
.title a{text-decoration:none}
.title a:hover{text-decoration:underline}
.sum{color:var(--moon)}
.place{color:var(--haze);font-size:.875rem;overflow-wrap:anywhere}
.addr{display:block;color:var(--fog)}
/* the dot before each fact; the one starting a line falls outside .facts and is clipped */
.facts{overflow:hidden;margin:4px 0 0}
.what .facts p{display:flex;flex-wrap:wrap;margin:0 0 0 -14px;color:var(--haze);font-size:.8125rem}
.facts span{position:relative;margin-left:14px}
.facts span::before{content:"·";position:absolute;left:-9px;color:var(--fog)}
.flags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 4px!important}
.flag{font-size:.75rem;line-height:1.6;padding:0 8px;border-radius:999px;background:var(--dusk-2);color:var(--gel)}
.flag.warn{color:var(--warn)}
.empty{color:var(--haze);margin-top:28px}
footer{color:var(--fog);font-size:.8125rem;margin-top:36px;max-width:38em}`;

function page(lang: Lang, params: URLSearchParams, head: string, body: string): string {
  const zh = lang === "zh";
  return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${zh ? "玩什么 · 预览" : "What's On · Preview"}</title><style>${CSS}</style></head><body><main><header><div class="top"><h1>玩什么 · What's On<span class="badge">${zh ? "预览" : "Preview"}</span></h1><a class="lang" href="${esc(withParam(params, "lang", zh ? "en" : null))}" lang="${zh ? "en" : "zh-CN"}">${zh ? "English" : "中文"}</a></div>${head}</header>${body}<footer>${
    zh
      ? "这是预览页：哪里都没有链接到这里，也请搜索引擎不要收录。正式页面还在做。"
      : "This is a preview: nothing links here, and search engines are asked to leave it out. The real page is still to come."
  }</footer></main></body></html>`;
}

/** The whole preview page for the published events (null before the first run) and a query string. */
export function renderPreview(pub: Published | null, params: URLSearchParams, now = Date.now()): string {
  const lang: Lang = params.get("lang") === "en" ? "en" : "zh";
  const zh = lang === "zh";
  if (!pub) {
    return page(lang, params, `<p class="lead">${zh ? "还没有活动。每天早上 6 点（温哥华时间）抓一轮，抓完这里就有了。" : "Nothing here yet. The run is every morning at 6:00 Vancouver time, and this fills in once it's done."}</p>`, "");
  }
  const q = readQuery(params, pub);
  const events = filterEvents(pub.events, q);
  const g = vanParts(Date.parse(pub.generatedAt));
  const updated = `${shortDate(g.date, lang)} ${clock(`${g.date}T${two(g.hour)}:${two(g.minute)}`, lang)}`;
  const filtered = q.cats.length > 0 || q.areas.length > 0 || q.tags.length > 0 || q.from !== pub.from || q.to !== pub.to;
  const clear = zh ? "?" : "?lang=en";
  const lead = zh
    ? `共 ${pub.count} 个活动，${shortDate(pub.from, lang)} 至 ${shortDate(pub.to, lang)}，${updated} 更新。${filtered ? `筛选后剩 ${events.length} 个，<a href="${esc(clear)}">看全部</a>。` : ""}`
    : `${pub.count} events from ${shortDate(pub.from, lang)} to ${shortDate(pub.to, lang)}, updated ${updated}.${filtered ? ` ${events.length} match the filters: <a href="${esc(clear)}">show them all</a>.` : ""}`;

  const all = pub.events;
  const uncategorised = all.filter((e) => !e.category).length;
  const toCheck = all.filter((e) => e.areaCheck || !e.area).length;
  const sources = [...tally(events, (e) => [e.sourceName])].sort((a, b) => b[1] - a[1]);
  const filters =
    chipRow(zh ? "分类" : "Category", CATEGORIES, CATEGORY_LABEL, tally(all, (e) => [e.category]), q.cats, "cat", params, lang, uncategorised ? (zh ? `还有 ${uncategorised} 个没分类。` : `${uncategorised} not in a category yet.`) : "") +
    chipRow(zh ? "地区" : "Area", AREAS, AREA_LABEL, tally(all, (e) => [e.area]), q.areas, "area", params, lang, toCheck ? (zh ? `其中 ${toCheck} 个地区待确认。` : `${toCheck} still need their area checked.`) : "") +
    chipRow(zh ? "标签" : "Tags", TAGS, TAG_LABEL, tally(all, (e) => [...new Set([...e.tags, ...(e.isFree ? ["free" as const] : []), ...(e.featured ? ["featured" as const] : [])])]), q.tags, "tag", params, lang, "");
  const from = `<p class="note">${zh ? "来源：" : "Sources: "}${sources.map(([name, n]) => `${esc(name)} ${n}`).join(zh ? "，" : ", ")}${zh ? "。" : "."}</p>`;

  const days = new Map<string, PublicEvent[]>();
  for (const e of events) {
    const day = listedOn(e, q.from);
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  const today = vanParts(now).date;
  const named = (day: string) => {
    const rel = day === today ? (zh ? "今天" : "Today") : day === addDays(today, 1) ? (zh ? "明天" : "Tomorrow") : "";
    return rel ? `${rel}${zh ? " " : ", "}${dayName(day, lang)}` : dayName(day, lang);
  };
  const list = [...days.keys()]
    .sort()
    .map((day) => {
      const list = days.get(day)!.sort((a, b) => rank(a, day) - rank(b, day) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
      return `<section><h2 class="day"><span>${named(day)}</span><span class="n">${zh ? `${list.length} 个` : `${list.length} ${list.length === 1 ? "event" : "events"}`}</span></h2><ol class="events">${list.map((e) => eventItem(e, day, lang)).join("")}</ol></section>`;
    })
    .join("");
  return page(lang, params, `<p class="lead">${lead}</p>${filters}${from}`, list || `<p class="empty">${zh ? "没有符合的活动。" : "No events match."}</p>`);
}
