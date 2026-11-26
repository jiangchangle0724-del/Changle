// 投稿 · Send us an event (Steve's call, 25 November 2026): anyone may send a link, a few words or a
// poster. The Worker reads what it can into a draft: an Eventbrite event through its API (Steve's
// token), a page's own schema.org Event, else the words (the link's page, or what was typed) by the
// AI. Nothing is published until the site's owner lets it in at /go/admin, signed in with changle.ca
// (the rooms server says who a session is, as for 跟一单); then it's an event of the source
// "submitted", the poster its picture, and an Eventbrite event's organization is followed from then on.
import { AI_MODEL } from "./ai";
import { readCapped } from "./body";
import { followEvent } from "./follows";
import { parseEventbrite, type EbEvent } from "./parsers/eventbrite";
import { storeEvents } from "./store";
import { fromVan, vanIso, vanParts } from "./time";
import type { NormalizedEvent, Tag } from "./types";

export const LIMITS = { link: 600, text: 3000, contact: 120, image: 1_500_000, perNetwork: 10, perDay: 100 } as const;

/** What was read from a submission, and what the owner corrects before letting it in. Times are Vancouver's: "2026-12-05T19:00", or a date. */
export interface Draft {
  title: string | null;
  start: string | null;
  end: string | null;
  place: string | null;
  address: string | null;
  city: string | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
  url: string | null;
  description: string | null;
  /** an Eventbrite event's id: its organization is followed when it's let in */
  eventbriteId?: string | null;
}

export interface Submission {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  lang: "zh" | "en";
  link: string | null;
  text: string | null;
  has_image: number;
  contact: string | null;
  read_from: string | null;
  draft: string | null;
  read_error: string | null;
  event_id: string | null;
}

type SubmitEnv = Pick<Env, "DB" | "CACHE" | "AI" | "EVENTBRITE_TOKEN">;

const imageKey = (id: string) => `submission:image:${id}`;
const IMAGE_DAYS = 60;
const USER_AGENT = "changle.ca events (+https://changle.ca/go)";
/** Pages that don't let a program read them (they answer with a sign-in or a challenge): only the words sent with the link are read. */
const UNREADABLE = /(^|\.)(xiaohongshu\.com|xhslink\.com|douyin\.com|instagram\.com|facebook\.com|fb\.me|eventbrite\.[a-z.]+)$/i;
const EVENTBRITE = /^https?:\/\/(?:www\.)?eventbrite\.[a-z.]+\/e\/(?:[^/?#]*-)?(\d{9,20})(?:[/?#]|$)/i;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) || null : null);
const dollars = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100_000 ? Math.round(v * 100) / 100 : null);
const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A draft as sent back by the owner's page or the AI: every field checked, anything else dropped. */
export function cleanDraft(raw: unknown): Draft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const when = (v: unknown) => {
    const s = typeof v === "string" ? v.trim().replace(" ", "T").slice(0, 16) : "";
    return WHEN.test(s) && Number.isFinite(fromVan(s)) ? s : null;
  };
  const url = clean(r.url, LIMITS.link);
  const eb = typeof r.eventbriteId === "string" && /^\d{9,20}$/.test(r.eventbriteId) ? r.eventbriteId : null;
  return {
    title: clean(r.title, 200),
    start: when(r.start),
    end: when(r.end),
    place: clean(r.place, 200),
    address: clean(r.address, 200),
    city: clean(r.city, 80),
    priceMin: dollars(r.priceMin),
    priceMax: dollars(r.priceMax),
    isFree: typeof r.isFree === "boolean" ? r.isFree : null,
    url: url && /^https?:\/\//i.test(url) ? url : null,
    description: clean(r.description, 1200),
    ...(eb ? { eventbriteId: eb } : {}),
  };
}

/** What a stored event says, as a draft (local times without their offset). */
function draftOf(e: NormalizedEvent, extra: Partial<Draft> = {}): Draft {
  return cleanDraft({
    title: e.title,
    start: e.allDay ? e.start.slice(0, 10) : e.start.slice(0, 16),
    end: e.end ? (e.end.length > 10 ? e.end.slice(0, 16) : e.end) : null,
    place: e.place?.name ?? null,
    address: e.place?.address ?? null,
    city: e.place?.city ?? null,
    priceMin: e.priceMin ?? null,
    priceMax: e.priceMax ?? null,
    isFree: e.isFree ?? null,
    url: e.url,
    description: e.description ?? null,
    ...extra,
  });
}

/** The first schema.org Event in a page's JSON-LD, as a draft; null when there's none. */
export function draftFromPage(html: string, pageUrl: string): Draft | null {
  for (const m of html.slice(0, 1_000_000).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const all: Record<string, unknown>[] = [];
    const walk = (x: unknown) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        all.push(o);
        if (o["@graph"]) walk(o["@graph"]);
      }
    };
    walk(data);
    const ev = all.find((o) => [o["@type"]].flat().some((t) => typeof t === "string" && /Event$/.test(t)));
    if (!ev) continue;
    const loc = (Array.isArray(ev.location) ? ev.location[0] : ev.location) as Record<string, unknown> | undefined;
    const addr = (loc?.address ?? {}) as Record<string, unknown> | string;
    const offer = (Array.isArray(ev.offers) ? ev.offers[0] : ev.offers) as Record<string, unknown> | undefined;
    const price = offer?.price != null && offer.price !== "" ? Number(offer.price) : NaN;
    const local = (v: unknown) => {
      const ms = typeof v === "string" ? Date.parse(v) : NaN;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      return Number.isFinite(ms) ? (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v as string) ? vanIso(ms).slice(0, 16) : (v as string).slice(0, 16)) : null;
    };
    return cleanDraft({
      title: ev.name,
      start: local(ev.startDate),
      end: local(ev.endDate),
      place: loc?.name,
      address: typeof addr === "string" ? addr : addr.streetAddress,
      city: typeof addr === "string" ? null : addr.addressLocality,
      priceMin: Number.isFinite(price) ? price : null,
      priceMax: Number.isFinite(price) ? price : null,
      isFree: Number.isFinite(price) ? price === 0 : null,
      url: typeof ev.url === "string" ? ev.url : pageUrl,
      description: typeof ev.description === "string" ? ev.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") : null,
    });
  }
  return null;
}

/** A page's words, for the AI: its title, its description, then its text (scripts and styles out). */
export function pageWords(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? "";
  const body = html
    .slice(0, 400_000)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return [title, desc, body].map((s) => s.trim()).filter(Boolean).join("\n").slice(0, 5000);
}

const PROMPT = (today: string) =>
  `你是温哥华活动网站「玩什么」的编辑。下面是网友投稿的一段文字（可能是中文或英文，可能来自小红书、微信或网页），讲的是大温哥华的一个活动。只根据这段文字，找出活动的信息，输出一个 JSON 对象，不要输出别的：
{"title": 活动名（照原文）, "start": 开始时间, "end": 结束时间, "place": 场地名, "address": 地址, "city": 城市（英文，如 Vancouver、Richmond、Burnaby）, "price_min": 最低票价（加元数字）, "price_max": 最高票价, "free": 是否免费（true/false）, "description": 一两句话说明这是什么活动（用原文的语言）}
今天是 ${today}（温哥华）。时间写成 YYYY-MM-DDTHH:MM（24 小时制，温哥华时间）；只知道日期就写 YYYY-MM-DD；「这周六」之类按今天推算。文字里没有的一律填 null，不要猜，不要编。`;

/** Asks the AI for a draft from words. Null when it can't tell (no title or no date). */
export async function draftFromWords(ai: { run: (model: never, input: never) => Promise<unknown> }, words: string, now: number): Promise<Draft | null> {
  const out = (await ai.run(AI_MODEL as never, {
    messages: [
      { role: "system", content: PROMPT(vanParts(now).date) },
      { role: "user", content: `${words.slice(0, 5000)}\n/no_think` },
    ],
    max_tokens: 800,
    temperature: 0.1,
  } as never)) as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
  const text = typeof out?.response === "string" ? out.response : typeof out?.choices?.[0]?.message?.content === "string" ? (out.choices[0].message!.content as string) : JSON.stringify(out?.response ?? "");
  const found = /\{[\s\S]*\}/.exec(text.replace(/<think>[\s\S]*?(<\/think>|$)/g, ""));
  if (!found) return null;
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(found[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const draft = cleanDraft({ ...r, priceMin: r.price_min, priceMax: r.price_max, isFree: r.free });
  return draft.title && draft.start ? draft : null;
}

/** An Eventbrite event read through its API, as a draft (with Steve's token). */
async function draftFromEventbrite(id: string, token: string): Promise<Draft | null> {
  const res = await fetch(`https://www.eventbriteapi.com/v3/events/${id}/?expand=venue,ticket_availability,organizer&token=${encodeURIComponent(token)}`, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const ev = (await res.json().catch(() => null)) as EbEvent | null;
  const [e] = ev ? parseEventbrite({ events: [ev] }, "submitted") : [];
  return e ? draftOf(e, { eventbriteId: id }) : null;
}

/** Reads what it can from a submission: where the draft came from, the draft, and why there's none. */
export async function readSubmission(env: SubmitEnv, s: { link: string | null; text: string | null }, now = Date.now()): Promise<{ from: string | null; draft: Draft | null; error: string | null }> {
  let words = s.text ?? "";
  try {
    const eb = s.link ? EVENTBRITE.exec(s.link)?.[1] : undefined;
    if (eb && env.EVENTBRITE_TOKEN) {
      const draft = await draftFromEventbrite(eb, env.EVENTBRITE_TOKEN);
      if (draft) return { from: "eventbrite", draft, error: null };
    }
    const host = s.link ? new URL(s.link).hostname : "";
    if (s.link && !UNREADABLE.test(host)) {
      try {
        const res = await fetch(s.link, { headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
        if (res.ok && /html/i.test(res.headers.get("content-type") ?? "")) {
          // (a page larger than 1 MB is not read: only the words sent are)
          const html = await readCapped(res, 1_000_000).catch(() => "");
          const draft = draftFromPage(html, s.link);
          if (draft?.title && draft.start) return { from: "page", draft, error: null };
          words = [words, pageWords(html)].filter(Boolean).join("\n\n");
        }
      } catch {
        // the page can't be read (down, too slow): the words sent still are
      }
    }
    if (words.trim()) {
      const draft = await draftFromWords(env.AI, words, now);
      if (draft) return { from: s.text ? "text" : "page", draft: { ...draft, url: draft.url ?? s.link, ...(eb ? { eventbriteId: eb } : {}) }, error: null };
      return { from: null, draft: s.link || eb ? cleanDraft({ url: s.link, eventbriteId: eb }) : null, error: "no event found in the words" };
    }
    return { from: null, draft: s.link ? cleanDraft({ url: s.link, eventbriteId: eb }) : null, error: s.link ? "the link can't be read, and no words came with it" : null };
  } catch (e) {
    return { from: null, draft: s.link ? cleanDraft({ url: s.link }) : null, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

export type Received = { ok: true; id: string; draft: Draft | null; link: string | null; text: string | null; hasImage: boolean } | { ok: false; status: number; error: string };

/**
 * A submission as the form sends it (JSON): checked, counted against the day's allowance (per network
 * and in all), kept with its poster, and read. The honeypot field `website` is for programs that
 * fill every field in: they're thanked and nothing is kept.
 */
export async function receive(env: SubmitEnv, body: unknown, network: string, now = Date.now()): Promise<Received> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return { ok: true, id: "", draft: null, link: null, text: null, hasImage: false };
  const lang = b.lang === "en" ? "en" : "zh";
  const linkRaw = clean(b.link, LIMITS.link + 1);
  const text = clean(b.text, LIMITS.text + 1);
  const contact = clean(b.contact, LIMITS.contact + 1);
  if ((linkRaw?.length ?? 0) > LIMITS.link || (text?.length ?? 0) > LIMITS.text || (contact?.length ?? 0) > LIMITS.contact) return { ok: false, status: 400, error: "too long" };
  const link = linkRaw && /^https?:\/\/[^\s]+$/i.test(linkRaw) ? linkRaw : null;
  if (linkRaw && !link) return { ok: false, status: 400, error: "link" };
  const image = typeof b.image === "string" ? /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
  if (typeof b.image === "string" && b.image && !image) return { ok: false, status: 400, error: "image" };
  if (image && image[2].length * 0.75 > LIMITS.image) return { ok: false, status: 413, error: "image too big" };
  if (!link && !text && !image) return { ok: false, status: 400, error: "empty" };

  const day = vanParts(now).date;
  const net = (await sha256(`events:${network}`)).slice(0, 16);
  const [mine, all] = await Promise.all([env.CACHE.get(`submit:${day}:${net}`), env.CACHE.get(`submit:${day}`)]);
  if (Number(mine ?? 0) >= LIMITS.perNetwork || Number(all ?? 0) >= LIMITS.perDay) return { ok: false, status: 429, error: "limit" };
  await Promise.all([
    env.CACHE.put(`submit:${day}:${net}`, String(Number(mine ?? 0) + 1), { expirationTtl: 2 * 86_400 }),
    env.CACHE.put(`submit:${day}`, String(Number(all ?? 0) + 1), { expirationTtl: 2 * 86_400 }),
  ]);

  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, 12);
  if (image) {
    const bytes = Uint8Array.from(atob(image[2]), (c) => c.charCodeAt(0));
    await env.CACHE.put(imageKey(id), bytes, { expirationTtl: IMAGE_DAYS * 86_400, metadata: { type: `image/${image[1]}` } });
  }
  const read = await readSubmission(env, { link, text }, now);
  await env.DB.prepare(
    `INSERT INTO submissions (id, created_at, lang, link, text, has_image, contact, network, read_from, draft, read_error)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(id, new Date(now).toISOString(), lang, link, text, image ? 1 : 0, contact, net, read.from, read.draft ? JSON.stringify(read.draft) : null, read.error)
    .run();
  return { ok: true, id, draft: read.draft, link, text, hasImage: !!image };
}

/** The poster of a submission: for the owner always, for everyone once it's let in. */
export async function posterOf(env: Pick<Env, "CACHE">, id: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const got = await env.CACHE.getWithMetadata<{ type?: string }>(imageKey(id), "arrayBuffer");
  return got.value ? { bytes: got.value, type: got.metadata?.type ?? "image/jpeg" } : null;
}

/** What's waiting for the owner, then the last answered. */
export async function listSubmissions(db: D1Database): Promise<{ pending: Submission[]; decided: Submission[] }> {
  const cols = "id, created_at, status, lang, link, text, has_image, contact, read_from, draft, read_error, event_id";
  const [pending, decided] = await db.batch([
    db.prepare(`SELECT ${cols} FROM submissions WHERE status = 'pending' ORDER BY created_at LIMIT 50`),
    db.prepare(`SELECT ${cols} FROM submissions WHERE status != 'pending' ORDER BY decided_at DESC LIMIT 20`),
  ]);
  return { pending: pending.results as unknown as Submission[], decided: decided.results as unknown as Submission[] };
}

/** The event a draft makes, for the store: the source "submitted", the submission's id; its poster its picture. */
export function eventOf(id: string, d: Draft, hasImage: boolean): NormalizedEvent | null {
  if (!d.title || !d.start) return null;
  const allDay = d.start.length === 10;
  const startMs = fromVan(d.start);
  const endMs = d.end ? fromVan(d.end) : NaN;
  const tags: Tag[] = d.isFree ? ["free"] : [];
  return {
    source: "submitted",
    sourceEventId: id,
    url: d.url ?? "https://changle.ca/go",
    title: d.title,
    description: d.description,
    start: allDay ? d.start : vanIso(startMs),
    end: d.end && endMs > startMs ? (d.end.length === 10 ? d.end : vanIso(endMs)) : null,
    allDay,
    timeTBD: false,
    status: "scheduled",
    place: d.place || d.address ? { name: d.place ?? d.address, address: d.address, city: d.city } : null,
    online: false,
    priceMin: d.isFree ? 0 : d.priceMin,
    priceMax: d.isFree ? 0 : (d.priceMax ?? d.priceMin),
    isFree: d.isFree,
    category: null,
    sourceCategories: [],
    tags,
    lang: null,
    imageUrl: hasImage ? `https://changle.ca/go/poster/${id}` : null,
    organizer: null,
  };
}

/**
 * The owner's answer: "approve" (with the draft as corrected) stores the event, follows an Eventbrite
 * event's organization, and publishes the page again; "reject" only marks it.
 */
export async function decide(
  env: Pick<Env, "DB">,
  id: string,
  body: unknown,
  republish: () => Promise<unknown>,
  now = Date.now(),
): Promise<{ ok: true; status: string; eventId?: string } | { ok: false; status: number; error: string }> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const row = await env.DB.prepare("SELECT id, status, has_image FROM submissions WHERE id = ?1").bind(id).first<{ id: string; status: string; has_image: number }>();
  if (!row) return { ok: false, status: 404, error: "no such submission" };
  const at = new Date(now).toISOString();
  if (b.action === "reject") {
    await env.DB.prepare("UPDATE submissions SET status = 'rejected', decided_at = ?2 WHERE id = ?1").bind(id, at).run();
    return { ok: true, status: "rejected" };
  }
  if (b.action !== "approve") return { ok: false, status: 400, error: "action" };
  const draft = cleanDraft(b.draft);
  const ev = eventOf(id, draft, row.has_image === 1);
  if (!ev) return { ok: false, status: 400, error: "a name and a date are needed" };
  await storeEvents(env.DB, vanParts(now).date, [ev]);
  const eventId = `submitted:${id}`;
  await env.DB.prepare("UPDATE submissions SET status = 'approved', decided_at = ?2, draft = ?3, event_id = ?4 WHERE id = ?1").bind(id, at, JSON.stringify(draft), eventId).run();
  if (draft.eventbriteId) await followEvent(env.DB, draft.eventbriteId, "submission", now);
  await republish();
  return { ok: true, status: "approved", eventId };
}
