// The Chinese page's words: for each event the page shows, its name in Chinese (title_zh), a sentence
// on what kind of event it is (summary_zh) and, where the parsers gave it no category, a category.
// Workers AI writes them, a dozen events a request, within the free daily allowance (10,000 neurons:
// the first pass over ~700 events takes about a quarter of it, a day's new events a few percent).
// Every hour the Worker asks which events the page shows still lack them (src/worker.ts); a new text
// from the source (text_hash) is written again. The source's own words stay what they are.
// The same text in a source (a weekly storytime's every date, a show's three nights: its "twins") is
// asked once and gets the same Chinese, and a name written two ways goes the commonest way (settle).
import { vanParts, windowOf } from "./time";
import { CATEGORIES, type Category } from "./types";

/**
 * The models asked, in order; the next only when one can't be asked at all (retired, not on the
 * plan, down), never because of what it answered. Gemma 4 26B A4B (Google; a mixture of experts,
 * 4B of its 26B at work a token): good Chinese at about the price of Qwen 3 30B A3B, which this used
 * until Cloudflare retired it on 20 November 2026 (410, error 5028). Qwen 3.8 27B: Cloudflare's
 * other small model, at about ten times the price, so the day's free allowance (10,000 neurons)
 * would run out after a few hundred events.
 */
export const AI_MODELS = ["@cf/google/gemma-4-26b-a4b-it", "@cf/qwen/qwen3.8-27b"] as const;
/** The model asked first. */
export const AI_MODEL = AI_MODELS[0];

/**
 * Asks the models in turn (AI_MODELS) until one answers with some text: that text, and which model
 * it was. Each is told not to think first (`enable_thinking: false` for the chat template, and
 * /no_think for Qwen's): a model that thinks spends the answer's tokens on it and says nothing
 * (Gemma 4's first answers, 26 November, were empty). An empty answer goes on to the next model, as
 * an error does; when none has any text, the error says what the last one sent, to see why.
 */
export async function ask(run: RunModel, input: { messages: { role: string; content: string }[]; max_tokens: number; temperature: number }): Promise<{ text: string; model: string }> {
  let failed: unknown = new Error("no model to ask");
  for (const model of AI_MODELS) {
    const messages = /\/qwen\//.test(model) ? input.messages.map((m, i, all) => (i === all.length - 1 && m.role === "user" ? { ...m, content: `${m.content}\n/no_think` } : m)) : input.messages;
    try {
      const out = await run(model, { ...input, messages, chat_template_kwargs: { enable_thinking: false } });
      const text = answerText(out);
      if (text.trim()) return { text, model };
      failed = new Error(`${model} answered no text: ${JSON.stringify(out ?? null).slice(0, 400)}`);
    } catch (e) {
      failed = e;
    }
  }
  throw failed;
}
/** Events a request: small enough that one bad answer costs little, big enough to share the instructions. */
export const AI_BATCH = 15;
/** The hourly schedule that catches up (wrangler.jsonc), told apart from the morning run's. */
export const AI_CRON = "5 * * * *";
/** After three answers it couldn't use, an event stays in English (until its text or the instructions change). */
export const AI_TRIES = 3;
/**
 * The instructions' version, kept with what they wrote (ai_hash = "<text_hash>:<version>"): a new
 * version writes every event again. v2 (19 November): the source's labels, and nothing guessed.
 * v3 (the same day): Ticketmaster's names kept as they are, and praise or origins nothing backs left out.
 * v4 (26 November): simplified characters only, Canada's hockey on ice, and no school's or junior
 * league's game called professional; and everything written again by Gemma 4 (Qwen 3 is gone),
 * so the names come from one model under one set of rules.
 */
export const AI_VERSION = "v4";

/** What the AI is given about an event. */
export interface ToWrite {
  id: string;
  /** Source.id: Ticketmaster's names stay as they are (KEEP_TITLE). */
  source?: string;
  title: string;
  description: string | null;
  venue: string | null;
  /** The source's own labels, as stored (a JSON array): "Music", "Rock"; "Storytimes", "Babies". */
  labels?: string | null;
  /** Its text (title, description, venue), hashed: what it shares with its twins in the source. */
  textHash?: string | null;
  /** Answers it couldn't use for this text and these instructions so far, its twins' included. */
  tries?: number;
}

/** What it wrote: the name and the sentence, and a category or none. */
export interface Written {
  titleZh: string;
  summaryZh: string;
  category: Category | null;
}

export const INSTRUCTIONS = `你是温哥华中文活动网站「玩什么」的编辑。输入是一组本地活动，信息多是英文：名字（title）、场地（venue）、来源给的分类标签（labels）和说明（about），有的没有说明。为每个活动写：
1. "t"：活动名的简体中文译名，简短自然，像中文海报上的活动名，最多 20 个字。艺人、乐队、DJ、球队、巡演、剧名、书名、品牌、场馆、俱乐部等名字保留英文原文，不要音译或意译，只翻译其余部分；名字看起来像普通词也一样，比如乐队 Pooh 不要译成小熊维尼。作品名有通行中文名的可以用中文加书名号，比如《美女与野兽》。下面这些本地球队例外，用通行的中文名：Vancouver Canucks 温哥华加人队，Abbotsford Canucks 阿伯茨福德加人队，Vancouver Whitecaps 温哥华白帽队，BC Lions 卑诗雄狮队，Vancouver Giants 温哥华巨人队，Vancouver Warriors 温哥华勇士队。
2. "s"：一句简体中文介绍，15 到 45 个字，说清楚这是什么样的活动、去了做什么、适合谁。只用给出的信息：没有说明的，只按名字和标签说是什么类型的活动（比如「电子音乐现场演出」「冰球比赛」），不介绍艺人的国籍、风格和来历，不用「知名」「著名」「世界级」这类词，拿不准适合谁就不写；不写日期、时间、地点和价格，页面上另有。大学、学院、中学、青少年和业余球队的比赛不是职业比赛，不要写「职业」。
3. "c"：从这些分类代码里选一个：social（社交聚会：语言交换、聊天角、桌游、行业和技术聚会）、shows（演出音乐：音乐会、戏剧、音乐剧、喜剧、舞蹈、歌剧）、food（吃喝市集：夜市、美食节、农夫市集、品鉴）、outdoors（户外运动：徒步、滑雪、跑步、看球赛、运动）、arts（文化展览：博物馆、展览、讲座、作者活动、读书会、电影）、festivals（节日庆典：烟花、灯会、农历新年、圣诞市集）、family（亲子家庭：专为儿童、婴幼儿或家庭办的，比如故事时间、婴儿活动、儿童手工、儿童演出）、nightlife（夜生活派对：酒吧活动、夜店、DJ 之夜、派对）。专为儿童或婴幼儿的选 family；都不合适（比如报税、求职、电脑辅导、专业培训）填 null。
只用简体字，不用繁体字。Hockey 在加拿大指冰球，Field Hockey 才是曲棍球。
只输出一个 JSON 数组，每个活动一个对象 {"n": 序号, "t": "...", "s": "...", "c": "..."}，顺序和输入相同，不要输出任何别的文字。`;

const CJK = /[㐀-鿿]/;

/**
 * Traditional characters a model slips into simplified Chinese (Gemma 4 wrote 「對陣」 on its first
 * day), and their simplified forms: only characters simplified Chinese never uses.
 */
const TRADITIONAL =
  "對对陣阵賽赛與与會会場场樂乐動动開开藝艺術术節节書书區区學学館馆華华時时間间們们這这個个來来為为說说讀读參参觀观戲戏劇剧電电團团隊队際际傳传統统豐丰體体驗验歡欢適适兒儿親亲飲饮嘗尝現现講讲覽览頒颁獎奖慶庆燈灯煙烟聖圣誕诞農农曆历運运籃篮網网遊游語语換换圖图嬰婴計计劃划稅税職职腦脑輔辅導导專专業业訓训線线實实歷历選选購购禮礼設设師师頭头髮发鐘钟點点價价錢钱門门費费優优經经舊旧鮮鲜溫温詩诗雜杂誌志漢汉粵粤國国臺台灣湾韓韩義义龍龙鳳凤馬马鳥鸟魚鱼車车風风飛飞雲云陽阳燒烧麵面湯汤雞鸡豬猪蝦虾餅饼壽寿誰谁讓让給给從从還还進进過过邊边裡里後后麼么樣样種种類类級级歲岁長长員员雙双單单號号關关係系環环錄录寫写畫画攝摄編编織织紙纸鋼钢聲声響响鬧闹熱热鬥斗獅狮輕轻鬆松簡简認认識识課课練练習习試试題题問问機机數数據据權权歸归屬属縣县鎮镇鄉乡莊庄園园廳厅樓楼層层處处辦办務务戶户發发報报廣广視视頻频絡络遠远東东寶宝貝贝媽妈爺爷孫孙婦妇愛爱戀恋憶忆夢梦樹树葉叶蘭兰衛卫護护醫医藥药療疗壓压減减靜静禪禅勝胜負负決决準准備备軍军盃杯盤盘圓圆鄰邻聯联誼谊競竞讚赞請请謝谢賀贺願愿飯饭廚厨麥麦釀酿賣卖買买攤摊販贩貨货幣币賞赏見见將将並并於于幾几條条張张";
const SIMPLIFIED = new Map<string, string>(Array.from({ length: TRADITIONAL.length / 2 }, (_, i) => [TRADITIONAL[2 * i], TRADITIONAL[2 * i + 1]]));
const TRADITIONAL_RE = new RegExp(`[${[...SIMPLIFIED.keys()].join("")}]`, "g");
/** The text with those characters simplified. */
export const simplified = (text: string) => text.replace(TRADITIONAL_RE, (c) => SIMPLIFIED.get(c) ?? c);

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
  return [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: JSON.stringify(items) },
  ];
}

/**
 * The text of a Workers AI answer, whichever shape it comes in: `response` (a string, or the JSON
 * itself), or OpenAI's `choices[0].message.content` (a string, or parts with text), or `choices[0].text`.
 */
export function answerText(out: unknown): string {
  const o = out as { response?: unknown; choices?: { text?: unknown; message?: { content?: unknown } }[] } | null;
  if (typeof o?.response === "string" && o.response.trim()) return o.response;
  if (o?.response && typeof o.response === "object") return JSON.stringify(o.response);
  const choice = o?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : typeof (p as { text?: unknown })?.text === "string" ? (p as { text: string }).text : "")).join("");
  return typeof choice?.text === "string" ? choice.text : "";
}

/** A name wrapped whole in quotes, without them ("「读书会」"); 《》 around a work's name inside it stay. */
const unwrap = (t: string) => t.replace(/^(?:「(.*)」|『(.*)』|“(.*)”|"(.*)")$/s, (_, a, b, c, d) => a ?? b ?? c ?? d).trim();

/**
 * The longest name kept, all of it (Ticketmaster's are the source's own, however long: KEEP_TITLE),
 * and the most Chinese characters in it: the instructions ask for 20 at most, and the names kept
 * in English (teams, artists, venues) can be long by themselves ("Coquitlam Express 对阵 Prince
 * George Spruce Kings" is 45 characters, 2 of them Chinese). Until 26 November a name had 40 in
 * all, and the colleges' games and Showpass's line-ups were turned down for it.
 */
export const TITLE_MAX = 70;
export const TITLE_ZH_MAX = 24;
/** A name too long to be one (a sentence, a translation that rambles). */
export const tooLong = (name: string) => name.length > TITLE_MAX || (name.match(/[㐀-鿿]/g)?.length ?? 0) > TITLE_ZH_MAX;

/** One answer item, checked: a name, a Chinese sentence, a known category or none. */
function checked(item: unknown): Written | null {
  const o = item as { t?: unknown; s?: unknown; c?: unknown } | null;
  const t = typeof o?.t === "string" ? simplified(unwrap(o.t.trim())) : "";
  const s = typeof o?.s === "string" ? simplified(o.s.trim()) : "";
  // (a sentence can be short: "职业冰球比赛" is all an event with only a name and labels gets)
  if (!t || !s || !CJK.test(s) || s.length < 4 || s.length > 90) return null;
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
/**
 * What the Chinese is for: the text as it is now, and these instructions ("<text_hash>:v3"). Kept in
 * ai_hash when written; "!" before it when the answer for it couldn't be used (ai_tries counts those).
 */
const TARGET = "coalesce(e.text_hash, '') || ':' || ?7";
/** The tries so far: the most any of its twins has had (they're asked as one), or its own without a hash. */
const TRIES = `CASE WHEN e.text_hash IS NULL THEN (CASE WHEN e.ai_hash IS '!' || ${TARGET} THEN e.ai_tries ELSE 0 END)
  ELSE coalesce((SELECT max(g.ai_tries) FROM events g WHERE g.source = e.source AND g.text_hash = e.text_hash AND g.ai_hash = '!' || e.text_hash || ':' || ?7), 0) END`;

/**
 * Only these events (ids), when given: the catch-up hands each step its own. Of twins, only the
 * soonest: what it's given is kept for all of them (keepWritten).
 */
export async function toWrite(db: D1Database, runId: string, fromMs: number, toMs: number, limit = AI_BATCH, ids: string[] | null = null): Promise<ToWrite[]> {
  const { results } = await db
    .prepare(
      `SELECT id, source, title, description, venue, labels, textHash, tries FROM (
         SELECT e.id, e.source, e.title, e.description, v.name AS venue, e.source_categories AS labels,
                e.text_hash AS textHash, ${TRIES} AS tries, e.start_utc,
                row_number() OVER (PARTITION BY e.source, coalesce(e.text_hash, e.id) ORDER BY e.start_utc, e.id) AS twin
           FROM events e
           LEFT JOIN venues v ON v.id = e.venue_id
           LEFT JOIN sources s ON s.id = e.source
          WHERE e.start_utc < ?2 AND e.end_utc >= ?1
            AND e.status != 'cancelled' AND e.visibility = 'live' AND e.duplicate_of IS NULL
            AND (e.last_seen = ?3 OR s.last_ok_run IS NOT ?3)
            AND (e.summary_by IS NULL OR e.summary_by = 'ai')
            AND (e.title_zh IS NULL OR e.ai_hash IS NOT ${TARGET})
            AND (?6 IS NULL OR e.id IN (SELECT value FROM json_each(?6))))
        WHERE twin = 1 AND tries < ?5
        ORDER BY start_utc, id
        LIMIT ?4`,
    )
    .bind(fromMs, toMs, runId, limit, AI_TRIES, ids ? JSON.stringify(ids) : null, AI_VERSION)
    .all<ToWrite>();
  return results;
}

/** An event (?id), and its twins (?hash, ?source) that the AI may write for (not Steve's words): the rows a write goes to. */
const twinsOf = (id: number, hash: number, source: number) =>
  `(id = ?${id} OR (?${hash} IS NOT NULL AND source = ?${source} AND text_hash = ?${hash} AND (summary_by IS NULL OR summary_by = 'ai')))`;

/**
 * Keeps what was written, for the event and its twins; counts a try against each it couldn't use
 * (and its twins: they're asked as one). A category only where the parsers gave none.
 */
export async function keepWritten(db: D1Database, events: ToWrite[], written: (Written | null)[]): Promise<{ wrote: number; failed: number; why: Record<string, number> }> {
  const stmts: D1PreparedStatement[] = [];
  let failed = 0;
  // why each answer turned down was: unreadable (none for it), a long name, praise, an origin
  const why: Record<string, number> = {};
  events.forEach((e, i) => {
    const got = written[i];
    const twins = [e.textHash ?? null, e.source ?? null] as const;
    // a long name is a bad one, unless it's the source's (the AI keeps "2Dead Boyz x The
    // Underachievers - NO1LIVESFOREVER Tour" whole, as told, and the sentence was turned down with it)
    const keep = KEEP_TITLE.has(e.source ?? "");
    const w = got && corrected(keep ? { ...got, titleZh: e.title } : got, e);
    const no = !w ? "unreadable" : !keep && tooLong(w.titleZh) ? "long name" : ungrounded(w, e);
    if (!w || no) {
      failed++;
      why[no ?? "unreadable"] = (why[no ?? "unreadable"] ?? 0) + 1;
      // an event is asked because its Chinese is missing or out of date (older instructions, a changed
      // text): when the answer can't be used, the old Chinese goes too, and the page shows the source's
      // words until a good one comes (v2's "知名阿拉伯DJ" stayed up after v3 turned the new one down)
      return void stmts.push(
        db
          .prepare(
            `UPDATE events SET title_zh = NULL, summary_zh = NULL, summary_by = NULL,
               ai_tries = ?3, ai_hash = '!' || coalesce(text_hash, '') || ':' || ?2
             WHERE ${twinsOf(1, 4, 5)}`,
          )
          .bind(e.id, AI_VERSION, (e.tries ?? 0) + 1, ...twins),
      );
    }
    stmts.push(
      db
        .prepare(
          `UPDATE events SET title_zh = ?2, summary_zh = ?3, summary_by = 'ai', ai_hash = coalesce(text_hash, '') || ':' || ?5, ai_tries = 0,
             category = CASE WHEN ?4 IS NOT NULL AND (category IS NULL OR category_by = 'ai') THEN ?4 ELSE category END,
             category_by = CASE WHEN ?4 IS NOT NULL AND (category IS NULL OR category_by = 'ai') THEN 'ai' ELSE category_by END
           WHERE ${twinsOf(1, 6, 7)}`,
        )
        .bind(e.id, w.titleZh, w.summaryZh, w.category, AI_VERSION, ...twins),
    );
  });
  if (stmts.length) await db.batch(stmts);
  return { wrote: events.length - failed, failed, why };
}

/**
 * Twins that say it otherwise (written before they were asked as one) or not yet (a new date of a
 * weekly event) get the commonest answer among them; then a name the AI wrote two ways, at two
 * branches or in two texts ("婴儿时光", "婴儿时间"), goes the commonest way, a translation before the
 * English kept. Only answers for these instructions count; Ticketmaster's names stay as they are.
 * Only what the page shows, not over yet. Returns how many events it changed.
 */
export async function settle(db: D1Database, fromMs: number, toMs: number): Promise<number> {
  const [twins, names] = await db.batch([
    db
      .prepare(
        `WITH done AS MATERIALIZED (
           SELECT source, text_hash, count(*) AS n, min(id) AS first FROM events
            WHERE text_hash IS NOT NULL AND summary_by = 'ai' AND title_zh IS NOT NULL AND ai_hash = text_hash || ':' || ?3
              AND start_utc < ?2 AND end_utc >= ?1
            GROUP BY source, text_hash, title_zh, summary_zh
         ), best AS MATERIALIZED (
           SELECT d.source, d.text_hash, c.title_zh, c.summary_zh, c.category, c.category_by
             FROM (SELECT *, row_number() OVER (PARTITION BY source, text_hash ORDER BY n DESC, first) AS r FROM done) d
             JOIN events c ON c.id = d.first
            WHERE d.r = 1
         )
         UPDATE events SET title_zh = best.title_zh, summary_zh = best.summary_zh, summary_by = 'ai',
                ai_hash = events.text_hash || ':' || ?3, ai_tries = 0,
                category = CASE WHEN best.category_by = 'ai' AND (events.category IS NULL OR events.category_by = 'ai') THEN best.category ELSE events.category END,
                category_by = CASE WHEN best.category_by = 'ai' AND (events.category IS NULL OR events.category_by = 'ai') THEN 'ai' ELSE events.category_by END
           FROM best
          WHERE events.source = best.source AND events.text_hash = best.text_hash
            AND events.start_utc < ?2 AND events.end_utc >= ?1
            AND (events.summary_by IS NULL OR events.summary_by = 'ai')
            AND (events.title_zh IS NOT best.title_zh OR events.summary_zh IS NOT best.summary_zh
                 OR events.ai_hash IS NOT events.text_hash || ':' || ?3
                 OR (best.category_by = 'ai' AND (events.category IS NULL OR events.category_by = 'ai') AND events.category IS NOT best.category))`,
      )
      .bind(fromMs, toMs, AI_VERSION),
    db
      .prepare(
        `WITH named AS MATERIALIZED (
           SELECT title, title_zh, count(*) AS n FROM events
            WHERE summary_by = 'ai' AND title_zh IS NOT NULL AND ai_hash = coalesce(text_hash, '') || ':' || ?3
              AND source NOT IN (SELECT value FROM json_each(?4))
              AND start_utc < ?2 AND end_utc >= ?1
            GROUP BY title, title_zh
         ), best AS MATERIALIZED (
           SELECT title, title_zh FROM (
             SELECT title, title_zh, row_number() OVER (PARTITION BY title ORDER BY title_zh = title, n DESC, title_zh) AS r FROM named)
            WHERE r = 1
         )
         UPDATE events SET title_zh = best.title_zh
           FROM best
          WHERE events.title = best.title AND events.title_zh IS NOT NULL AND events.title_zh != best.title_zh
            AND events.summary_by = 'ai' AND events.source NOT IN (SELECT value FROM json_each(?4))
            AND events.start_utc < ?2 AND events.end_utc >= ?1`,
      )
      .bind(fromMs, toMs, AI_VERSION, JSON.stringify([...KEEP_TITLE])),
  ]);
  return (twins.meta.changes ?? 0) + (names.meta.changes ?? 0);
}

/**
 * Sources whose names are names: an artist, a tour, two teams. The AI turned "Amanda Marshall - The
 * Dirty 30 Tour" into a transliteration and "Tucson Roadrunners" into hares; these keep the source's
 * name, and the Chinese sentence says what the event is.
 */
export const KEEP_TITLE: ReadonlySet<string> = new Set(["ticketmaster"]);

/** Words that praise, which nothing a source says backs (知名 and the like). */
const PRAISE = /知名|著名|闻名|世界级|顶级|传奇|殿堂级|超人气|人气|巨星|天后|天王|当红|新生代/;
/** A people or a country, and what in the source would back saying it. */
const ORIGINS: [RegExp, RegExp][] = [
  [/中国|华人|华语|华裔|国语|内地/, /chin|mandarin|cantonese|taiwan|hong kong|c-?pop|[\u3400-\u9fff]/i],
  [/阿拉伯/, /arab/i],
  [/韩国|韩流|韩裔/, /korea|k-?pop/i],
  [/日本|日裔/, /japan|j-?pop|anime/i],
  [/美国/, /americ|\busa?\b/i],
  [/英国/, /brit|\buk\b|england|london|scot/i],
  [/法国|法裔/, /fren|france/i],
  [/意大利/, /ital/i],
  [/印度|宝莱坞/, /india|bollywood|desi|hindi|punjabi|bhangra/i],
  [/墨西哥/, /mexic/i],
  [/拉丁/, /latin|salsa|reggaeton|bachata/i],
  [/非洲/, /afric|afro|amapiano/i],
  [/菲律宾/, /filipin|philippin|pinoy/i],
  [/越南/, /vietnam/i],
  [/伊朗|波斯/, /iran|persian/i],
  [/德国/, /german/i],
  [/俄罗斯/, /russia/i],
  [/澳大利亚|澳洲/, /australia/i],
  [/爱尔兰/, /irish|ireland/i],
  [/牙买加/, /jamaica/i],
];

/**
 * Whether what it wrote stays within what the source said: no praise and no people or country that
 * nothing backs ("中国新生代歌手", "知名阿拉伯 DJ" came from a name alone).
 */
export function grounded(w: Written, e: ToWrite): boolean {
  return ungrounded(w, e) === null;
}

/** What in it nothing in the source backs: "praise", "origin", or null. */
export function ungrounded(w: Written, e: ToWrite): "praise" | "origin" | null {
  const said = [e.title, e.venue, e.description, labelsOf(e.labels)].filter(Boolean).join(" ");
  const wrote = `${w.titleZh} ${w.summaryZh}`;
  if (PRAISE.test(wrote) && !PRAISE.test(said)) return "praise";
  return ORIGINS.every(([zh, cue]) => !zh.test(wrote) || cue.test(said)) ? null : "origin";
}

/** A sport, a game or a player after 职业: where 职业 says "professional" (职业顾问, a careers adviser, stays). */
const PRO_GAME = /职业(?=(冰球|篮球|足球|排球|棒球|垒球|橄榄球|曲棍球|长曲棍球|网球|拳击|搏击|格斗|摔跤|比赛|联赛|球赛|赛事|球队|运动员|选手))/g;

/**
 * Two words the model gets wrong that can be put right rather than asked again: a university's or a
 * junior league's game called professional (职业冰球比赛, when nothing in the source says pro: the
 * first answers on 26 November said it of UBC's hockey and the Langley Trappers'), and Canada's
 * hockey called field hockey (曲棍球 for "Hockey").
 */
export function corrected(w: Written, e: ToWrite): Written {
  const said = [e.title, e.venue, e.description, labelsOf(e.labels)].filter(Boolean).join(" ");
  const fix = (text: string) => {
    let out = PRO.test(said) ? text : text.replace(PRO_GAME, "");
    if (/\bhockey\b/i.test(said) && !/\bfield hockey\b/i.test(said)) out = out.replace(/(?<!长)曲棍球/g, "冰球");
    return out;
  };
  const [titleZh, summaryZh] = [fix(w.titleZh), fix(w.summaryZh)];
  return titleZh === w.titleZh && summaryZh === w.summaryZh ? w : { ...w, titleZh, summaryZh };
}

/** What in a source would back calling a game, or a player, professional. */
const PRO = /\b(pro|professional|NHL|AHL|ECHL|PWHL|NBA|WNBA|MLB|MLS|NWSL|CFL|NFL|NLL|Canucks|Whitecaps|Lions|Warriors|Seawolves|UFC)\b|职业/i;

/** The model, as the Worker's AI binding offers it (and tests stand in for). */
export type RunModel = (model: string, input: Record<string, unknown>) => Promise<unknown>;

export interface Wrote {
  asked: number;
  wrote: number;
  failed: number;
  /** The AI couldn't be asked, or nothing it said could be used. */
  error: string | null;
  /** Which model answered (AI_MODELS), when one did. */
  model?: string;
  /** Why the answers not used weren't, when some weren't: { "long name": 2, praise: 1 }. */
  why?: Record<string, number>;
}

/**
 * One request's worth: the next events that need their Chinese (of `ids`, when given: a step's own
 * share, so that steps side by side never take the same ones), written and kept.
 */
export async function writeSome(db: D1Database, run: RunModel, runId: string, fromMs: number, toMs: number, ids: string[] | null = null): Promise<Wrote> {
  const events = await toWrite(db, runId, fromMs, toMs, AI_BATCH, ids);
  if (!events.length) return { asked: 0, wrote: 0, failed: 0, error: null };
  let answer: { text: string; model: string };
  try {
    answer = await ask(run, { messages: messages(events), max_tokens: 3000, temperature: 0.3 });
  } catch (e) {
    // the allowance used up, every model away: nothing is counted against the events
    return { asked: events.length, wrote: 0, failed: 0, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
  const { wrote, failed, why } = await keepWritten(db, events, readAnswer(answer.text, events.length));
  return { asked: events.length, wrote, failed, error: wrote ? null : `no usable answer: ${answer.text.slice(0, 200)}`, model: answer.model, ...(failed ? { why } : {}) };
}

/** One step of the catch-up, a request of its own (src/worker.ts), logged with the run's steps as "ai". */
export async function translateStep(env: Env, args: { runId: string; ids: string[]; part?: number }, now = Date.now()): Promise<Wrote> {
  const started = Date.now();
  const w = windowOf(args.runId);
  const r = await writeSome(env.DB, (model, input) => env.AI.run(model as never, input as never), args.runId, Math.max(now, w.fromMs), w.toMs, args.ids);
  if (r.asked)
    await env.DB.prepare(
      `INSERT INTO fetch_log (run_id, source, part, started_at, ms, found, updated, error, note) VALUES (?1, 'ai', ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(args.runId, args.part ?? 0, new Date(started).toISOString(), Date.now() - started, r.asked, r.wrote, r.error, aiNote(r))
      .run();
  return r;
}

/** The log's note on an AI step: what wasn't usable, and the model when it wasn't the first. */
export function aiNote(r: Wrote): string | null {
  const why = Object.entries(r.why ?? {}).map(([reason, n]) => `${reason} ${n}`).join(", ");
  const notes = [r.failed ? `${r.failed} not usable${why ? ` (${why})` : ""}` : "", r.model && r.model !== AI_MODEL ? `by ${r.model}` : ""].filter(Boolean);
  return notes.length ? notes.join("; ") : null;
}

export interface Translator {
  translate(args: { runId: string; ids: string[]; part?: number }): Promise<Wrote>;
  publish(args: { runId: string; note?: string }): Promise<unknown>;
}

/**
 * Every hour: the twins first (settle), then what the published page still lacks in Chinese, a few
 * requests at a time (each a step of its own), until none is left, a round writes nothing, or the
 * time is up; then the page again, unless this morning's run is under way (it publishes them itself).
 */
export async function catchUp(
  t: Translator,
  db: D1Database,
  runId: string | null,
  now = Date.now(),
  opts: { rounds?: number; parallel?: number; maxMs?: number } = {},
): Promise<{ wrote: number; settled: number; steps: number; published: boolean }> {
  // at most 30 steps and the publish: Cloudflare allows 32 calls a request (CONTRACTS.md)
  const { rounds = 10, parallel = 3, maxMs = 12 * 60_000 } = opts;
  if (!runId) return { wrote: 0, settled: 0, steps: 0, published: false };
  const w = windowOf(runId);
  const from = Math.max(now, w.fromMs);
  const started = Date.now();
  // the new dates of what's written already, before anything is asked
  let settled = await settle(db, from, w.toMs);
  let wrote = 0;
  let steps = 0;
  for (let round = 0; round < rounds && Date.now() - started < maxMs; round++) {
    // the round's events, then each step its own share of them (side by side, they'd take the same
    // ones otherwise: one step's writes shift what the next one's "next 15" are)
    const ids = (await toWrite(db, runId, from, w.toMs, AI_BATCH * parallel)).map((e) => e.id);
    if (!ids.length) break;
    const shares = Array.from({ length: Math.ceil(ids.length / AI_BATCH) }, (_, k) => ids.slice(k * AI_BATCH, (k + 1) * AI_BATCH));
    const done = await Promise.all(shares.map((share, k) => t.translate({ runId, ids: share, part: round * parallel + k })));
    steps += shares.length;
    const wroteNow = done.reduce((n, r) => n + r.wrote, 0);
    wrote += wroteNow;
    // that was the last of them, or nothing usable came back (the allowance, the model: next hour)
    if (ids.length < AI_BATCH * parallel || wroteNow === 0) break;
  }
  // the names just written, the commonest way
  if (wrote) settled += await settle(db, from, w.toMs);
  const today = await db.prepare("SELECT published_at FROM runs WHERE run_id = ?1").bind(vanParts(now).date).first<{ published_at: string | null }>();
  if (!(wrote || settled) || (today && !today.published_at)) return { wrote, settled, steps, published: false };
  await t.publish({ runId, note: `Chinese for ${wrote} events` + (settled ? `, ${settled} made like their twins or names` : "") });
  return { wrote, settled, steps, published: true };
}
