// The Chinese page's words: for each event the page shows, its name in Chinese (title_zh), a sentence
// on what kind of event it is (summary_zh) and, where the parsers gave it no category, a category.
// Workers AI writes them, a dozen events a request, within the free daily allowance (10,000 neurons:
// the first pass over ~700 events takes about a quarter of it, a day's new events a few percent).
// Every hour the Worker asks which events the page shows still lack them (src/worker.ts); a new text
// from the source (text_hash) is written again. The source's own words stay what they are.
import { vanParts, windowOf } from "./time";
import { CATEGORIES, type Category } from "./types";

/** Qwen 3: good Chinese, and among the cheapest models on Workers AI. */
export const AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
/** Events a request: small enough that one bad answer costs little, big enough to share the instructions. */
export const AI_BATCH = 15;
/** The hourly schedule that catches up (wrangler.jsonc), told apart from the morning run's. */
export const AI_CRON = "5 * * * *";
/** After three answers it couldn't use, an event stays in English (until its text changes). */
export const AI_TRIES = 3;
/**
 * The instructions' version, kept with what they wrote (ai_hash = "<text_hash>:<version>"): a new
 * version writes every event again. v2 (19 November): the source's labels, and nothing guessed.
 */
export const AI_VERSION = "v2";

/** What the AI is given about an event. */
export interface ToWrite {
  id: string;
  title: string;
  description: string | null;
  venue: string | null;
  /** The source's own labels, as stored (a JSON array): "Music", "Rock"; "Storytimes", "Babies". */
  labels?: string | null;
}

/** What it wrote: the name and the sentence, and a category or none. */
export interface Written {
  titleZh: string;
  summaryZh: string;
  category: Category | null;
}

export const INSTRUCTIONS = `你是温哥华中文活动网站「玩什么」的编辑。输入是一组本地活动，信息多是英文：名字（title）、场地（venue）、来源给的分类标签（labels）和说明（about），有的没有说明。为每个活动写：
1. "t"：活动名的简体中文译名，简短自然，像中文海报上的活动名，最多 20 个字。艺人、乐队、DJ、球队、巡演、剧名、书名、品牌、场馆、俱乐部等名字保留英文原文，不要音译或意译，只翻译其余部分；名字看起来像普通词也一样，比如乐队 Pooh 不要译成小熊维尼。作品名有通行中文名的可以用中文加书名号，比如《美女与野兽》。下面这些本地球队例外，用通行的中文名：Vancouver Canucks 温哥华加人队，Abbotsford Canucks 阿伯茨福德加人队，Vancouver Whitecaps 温哥华白帽队，BC Lions 卑诗雄狮队，Vancouver Giants 温哥华巨人队，Vancouver Warriors 温哥华勇士队。
2. "s"：一句简体中文介绍，15 到 45 个字，说清楚这是什么样的活动、去了做什么、适合谁。只用给出的信息：没有说明的，只按名字和标签说是什么类型的活动（比如「电子音乐现场演出」「职业冰球比赛」），不介绍艺人的国籍、风格和来历，不用「知名」「著名」「世界级」这类词，拿不准适合谁就不写；不写日期、时间、地点和价格，页面上另有。
3. "c"：从这些分类代码里选一个：social（社交聚会：语言交换、聊天角、桌游、行业和技术聚会）、shows（演出音乐：音乐会、戏剧、音乐剧、喜剧、舞蹈、歌剧）、food（吃喝市集：夜市、美食节、农夫市集、品鉴）、outdoors（户外运动：徒步、滑雪、跑步、看球赛、运动）、arts（文化展览：博物馆、展览、讲座、作者活动、读书会、电影）、festivals（节日庆典：烟花、灯会、农历新年、圣诞市集）、family（亲子家庭：专为儿童、婴幼儿或家庭办的，比如故事时间、婴儿活动、儿童手工、儿童演出）、nightlife（夜生活派对：酒吧活动、夜店、DJ 之夜、派对）。专为儿童或婴幼儿的选 family；都不合适（比如报税、求职、电脑辅导、专业培训）填 null。
只输出一个 JSON 数组，每个活动一个对象 {"n": 序号, "t": "...", "s": "...", "c": "..."}，顺序和输入相同，不要输出任何别的文字。`;

const CJK = /[㐀-鿿]/;

/** What the AI reads of a description: without the libraries' standing notes, at most 400 characters. */
export function about(description: string | null): string {
  return (description ?? "")
    .replace(/\bAccessibility Information\b[\s\S]*$/i, "")
    .replace(/\b(VPL|RPL|BPL|The library) is committed to making[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

/** The source's labels, as the AI reads them: the first six, in a line ("Music, Rock"). */
export function labelsOf(stored: string | null | undefined): string {
  try {
    const list: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(list) ? list.filter((l): l is string => typeof l === "string" && !!l.trim()).slice(0, 6).join(", ") : "";
  } catch {
    return "";
  }
}

/** The request's messages: the instructions, then the events, numbered from 1. */
export function messages(events: ToWrite[]): { role: "system" | "user"; content: string }[] {
  const items = events.map((e, i) => ({
    n: i + 1,
    title: e.title,
    ...(e.venue ? { venue: e.venue } : {}),
    ...(labelsOf(e.labels) ? { labels: labelsOf(e.labels) } : {}),
    ...(about(e.description) ? { about: about(e.description) } : {}),
  }));
  // (/no_think: Qwen 3 answers at once, without writing out its reasoning first)
  return [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: `${JSON.stringify(items)}\n/no_think` },
  ];
}

/** The text of a Workers AI answer, whichever shape it comes in. */
export function answerText(out: unknown): string {
  const o = out as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
  if (typeof o?.response === "string") return o.response;
  if (o?.response && typeof o.response === "object") return JSON.stringify(o.response);
  const content = o?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/** A name wrapped whole in quotes, without them ("「读书会」"); 《》 around a work's name inside it stay. */
const unwrap = (t: string) => t.replace(/^(?:「(.*)」|『(.*)』|“(.*)”|"(.*)")$/s, (_, a, b, c, d) => a ?? b ?? c ?? d).trim();

/** One answer item, checked: a short name, a Chinese sentence, a known category or none. */
function checked(item: unknown): Written | null {
  const o = item as { t?: unknown; s?: unknown; c?: unknown } | null;
  const t = typeof o?.t === "string" ? unwrap(o.t.trim()) : "";
  const s = typeof o?.s === "string" ? o.s.trim() : "";
  // (a sentence can be short: "职业冰球比赛" is all an event with only a name and labels gets)
  if (!t || t.length > 40 || !s || !CJK.test(s) || s.length < 4 || s.length > 90) return null;
  const c = typeof o?.c === "string" && (CATEGORIES as readonly string[]).includes(o.c) ? (o.c as Category) : null;
  return { titleZh: t, summaryZh: s, category: c };
}

/**
 * What the answer says for each of the events, in their order: null for one it skipped or wrote
 * badly. A thought before it (<think>), words around the array, a fence: all set aside.
 */
export function readAnswer(text: string, count: number): (Written | null)[] {
  const out: (Written | null)[] = Array.from({ length: count }, () => null);
  const bare = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "");
  // each object on its own: an answer cut off at max_tokens loses only its last one
  const items: unknown[] = [];
  for (const m of bare.matchAll(/\{[^{}]*\}/g)) {
    try {
      items.push(JSON.parse(m[0]));
    } catch {
      items.push(null);
    }
  }
  items.forEach((item, i) => {
    const n = (item as { n?: unknown } | null)?.n;
    // by its number when it gives one, else by its place
    const at = typeof n === "number" && Number.isInteger(n) ? n - 1 : typeof n === "string" && /^\d+$/.test(n) ? Number(n) - 1 : i;
    if (at >= 0 && at < count && out[at] === null) out[at] = checked(item);
  });
  return out;
}

/** The events the page shows (the published run's window, not over yet) that still need their Chinese. */
export async function toWrite(db: D1Database, runId: string, fromMs: number, toMs: number, limit = AI_BATCH, offset = 0): Promise<ToWrite[]> {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.title, e.description, v.name AS venue, e.source_categories AS labels
         FROM events e
         LEFT JOIN venues v ON v.id = e.venue_id
         LEFT JOIN sources s ON s.id = e.source
        WHERE e.start_utc < ?2 AND e.end_utc >= ?1
          AND e.status != 'cancelled' AND e.visibility = 'live' AND e.duplicate_of IS NULL
          AND (e.last_seen = ?3 OR s.last_ok_run IS NOT ?3)
          AND (e.summary_by IS NULL OR e.summary_by = 'ai')
          AND (e.title_zh IS NULL OR e.ai_hash IS NOT coalesce(e.text_hash, '') || ':' || ?7)
          AND e.ai_tries < ?5
        ORDER BY e.start_utc, e.id
        LIMIT ?4 OFFSET ?6`,
    )
    .bind(fromMs, toMs, runId, limit, AI_TRIES, offset, AI_VERSION)
    .all<ToWrite>();
  return results;
}

/** Keeps what was written; counts a try against each event it couldn't use. A category only where the parsers gave none. */
export async function keepWritten(db: D1Database, events: ToWrite[], written: (Written | null)[]): Promise<{ wrote: number; failed: number }> {
  const stmts: D1PreparedStatement[] = [];
  const failed: string[] = [];
  events.forEach((e, i) => {
    const w = written[i];
    if (!w) return void failed.push(e.id);
    stmts.push(
      db
        .prepare(
          `UPDATE events SET title_zh = ?2, summary_zh = ?3, summary_by = 'ai', ai_hash = coalesce(text_hash, '') || ':' || ?5, ai_tries = 0,
             category = CASE WHEN ?4 IS NOT NULL AND (category IS NULL OR category_by = 'ai') THEN ?4 ELSE category END,
             category_by = CASE WHEN ?4 IS NOT NULL AND (category IS NULL OR category_by = 'ai') THEN 'ai' ELSE category_by END
           WHERE id = ?1`,
        )
        .bind(e.id, w.titleZh, w.summaryZh, w.category, AI_VERSION),
    );
  });
  if (failed.length) stmts.push(db.prepare("UPDATE events SET ai_tries = ai_tries + 1 WHERE id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(failed)));
  if (stmts.length) await db.batch(stmts);
  return { wrote: events.length - failed.length, failed: failed.length };
}

/** The model, as the Worker's AI binding offers it (and tests stand in for). */
export type RunModel = (model: string, input: Record<string, unknown>) => Promise<unknown>;

export interface Wrote {
  asked: number;
  wrote: number;
  failed: number;
  /** The AI couldn't be asked, or nothing it said could be used. */
  error: string | null;
}

/**
 * One request's worth: the next events that need their Chinese (from `offset`, so that a few
 * requests at a time take different ones), written and kept.
 */
export async function writeSome(db: D1Database, run: RunModel, runId: string, fromMs: number, toMs: number, offset = 0): Promise<Wrote> {
  const events = await toWrite(db, runId, fromMs, toMs, AI_BATCH, offset);
  if (!events.length) return { asked: 0, wrote: 0, failed: 0, error: null };
  let text: string;
  try {
    text = answerText(await run(AI_MODEL, { messages: messages(events), max_tokens: 3000, temperature: 0.3 }));
  } catch (e) {
    // the allowance used up, the model away: nothing is counted against the events
    return { asked: events.length, wrote: 0, failed: 0, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
  const { wrote, failed } = await keepWritten(db, events, readAnswer(text, events.length));
  return { asked: events.length, wrote, failed, error: wrote ? null : `no usable answer: ${text.slice(0, 200)}` };
}

/** One step of the catch-up, a request of its own (src/worker.ts), logged with the run's steps as "ai". */
export async function translateStep(env: Env, args: { runId: string; offset: number }, now = Date.now()): Promise<Wrote> {
  const started = Date.now();
  const w = windowOf(args.runId);
  const r = await writeSome(env.DB, (model, input) => env.AI.run(model as never, input as never), args.runId, Math.max(now, w.fromMs), w.toMs, args.offset);
  if (r.asked)
    await env.DB.prepare(
      `INSERT INTO fetch_log (run_id, source, part, started_at, ms, found, updated, error, note) VALUES (?1, 'ai', ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(args.runId, Math.floor(args.offset / AI_BATCH), new Date(started).toISOString(), Date.now() - started, r.asked, r.wrote, r.error, r.failed ? `${r.failed} not usable` : null)
      .run();
  return r;
}

export interface Translator {
  translate(args: { runId: string; offset: number }): Promise<Wrote>;
  publish(args: { runId: string; note?: string }): Promise<unknown>;
}

/**
 * Every hour: what the published page still lacks in Chinese, a few requests at a time (each a step
 * of its own), until none is left, a round writes nothing, or the time is up; then the page again,
 * unless this morning's run is under way (it publishes them itself).
 */
export async function catchUp(
  t: Translator,
  db: D1Database,
  runId: string | null,
  now = Date.now(),
  opts: { rounds?: number; parallel?: number; maxMs?: number } = {},
): Promise<{ wrote: number; steps: number; published: boolean }> {
  // at most 30 steps and the publish: Cloudflare allows 32 calls a request (CONTRACTS.md)
  const { rounds = 10, parallel = 3, maxMs = 12 * 60_000 } = opts;
  if (!runId) return { wrote: 0, steps: 0, published: false };
  const started = Date.now();
  let wrote = 0;
  let steps = 0;
  for (let round = 0; round < rounds && Date.now() - started < maxMs; round++) {
    const done = await Promise.all(Array.from({ length: parallel }, (_, k) => t.translate({ runId, offset: k * AI_BATCH })));
    steps += parallel;
    const wroteNow = done.reduce((n, r) => n + r.wrote, 0);
    wrote += wroteNow;
    // nothing more to ask for, or nothing usable came back (the allowance, the model: next hour)
    if (done.every((r) => r.asked < AI_BATCH) || wroteNow === 0) break;
  }
  const today = await db.prepare("SELECT published_at FROM runs WHERE run_id = ?1").bind(vanParts(now).date).first<{ published_at: string | null }>();
  if (!wrote || (today && !today.published_at)) return { wrote, steps, published: false };
  await t.publish({ runId, note: `Chinese for ${wrote} events` });
  return { wrote, steps, published: true };
}
