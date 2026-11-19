import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_BATCH,
  AI_MODEL,
  AI_VERSION,
  INSTRUCTIONS,
  about,
  answerText,
  labelsOf,
  catchUp,
  grounded,
  messages,
  readAnswer,
  translateStep,
  writeSome,
  type RunModel,
  type Translator,
  type Wrote,
} from "../src/ai";
import { LIVE_KEY, publish } from "../src/publish";
import { ensureSchema } from "../src/schema";
import { storeEvents } from "../src/store";
import { windowOf } from "../src/time";
import type { NormalizedEvent, Published } from "../src/types";

/** (Each test starts from an empty database and cache.) */
beforeEach(async () => {
  await env.CACHE.delete(LIVE_KEY);
  await ensureSchema(env.DB);
  for (const t of ["events", "venues", "fetch_log", "runs"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
});

const RUN = "2026-11-19";
const W = windowOf(RUN);
// 09:00 in Vancouver on the run's day
const NOW = Date.parse("2026-11-19T16:00:00Z");

const event = (n: number, more: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  source: "vpl",
  sourceEventId: `e${n}`,
  url: `https://vpl.example/${n}`,
  title: `Event ${n}`,
  description: `About event ${n}.`,
  start: `2026-11-${String(20 + (n % 9)).padStart(2, "0")}T10:${String(n % 60).padStart(2, "0")}:00-07:00`,
  allDay: false,
  status: "scheduled",
  place: { name: "Central Library", address: "350 West Georgia St.", city: "Vancouver" },
  online: false,
  ...more,
});

/** A stand-in for the model: a name and a sentence for every event it's asked about, unless told otherwise. */
function model(answer?: (items: { n: number; title: string }[]) => unknown): { run: RunModel; asked: { n: number; title: string; about?: string }[][] } {
  const asked: { n: number; title: string; about?: string }[][] = [];
  const run: RunModel = async (name, input) => {
    expect(name).toBe(AI_MODEL);
    const user = (input.messages as { role: string; content: string }[])[1].content;
    const items = JSON.parse(user.replace(/\n\/no_think$/, "")) as { n: number; title: string; about?: string }[];
    asked.push(items);
    return { response: JSON.stringify(answer ? answer(items) : items.map((i) => ({ n: i.n, t: `中文名${i.n}`, s: "一句中文介绍，说说这是什么样的活动。", c: "arts" }))) };
  };
  return { run, asked };
}

const row = (id: string) =>
  env.DB.prepare("SELECT title_zh, summary_zh, summary_by, category, category_by, ai_tries, ai_hash, text_hash FROM events WHERE id = ?1").bind(id).first<Record<string, unknown>>();

describe("what the AI is asked", () => {
  it("the instructions, then the events numbered from 1: name, place, and what the source says, without the libraries' standing notes", () => {
    const [system, user] = messages([
      { id: "a", title: "Family Stay and Play", venue: "Firehall Branch", description: "Drop in to explore books and toys. Accessibility Information VPL is committed to making our programs accessible.", labels: '["Storytimes","Families"]' },
      { id: "b", title: "SYML: Beard Tour", venue: null, description: null, labels: '["Music","Rock"]' },
    ]);
    expect(system).toEqual({ role: "system", content: INSTRUCTIONS });
    expect(user.content.endsWith("\n/no_think")).toBe(true);
    expect(JSON.parse(user.content.replace(/\n\/no_think$/, ""))).toEqual([
      { n: 1, title: "Family Stay and Play", venue: "Firehall Branch", labels: "Storytimes, Families", about: "Drop in to explore books and toys." },
      { n: 2, title: "SYML: Beard Tour", labels: "Music, Rock" },
    ]);
    expect(about("x".repeat(900))).toHaveLength(400);
    expect(about("Meet new friends.\nVPL is committed to making our programs accessible for all.")).toBe("Meet new friends.");
    expect(labelsOf('["a","b","c","d","e","f","g"]')).toBe("a, b, c, d, e, f");
    expect(labelsOf("not json")).toBe("");
    expect(labelsOf(null)).toBe("");
  });

  it("the instructions keep names as they are, except the local teams Chinese readers know, and guess nothing", () => {
    expect(INSTRUCTIONS).toContain("Vancouver Canucks 温哥华加人队");
    expect(INSTRUCTIONS).toContain("保留英文原文");
    expect(INSTRUCTIONS).toContain("乐队 Pooh 不要译成小熊维尼");
    expect(INSTRUCTIONS).toContain("不用「知名」「著名」「世界级」");
  });
});

describe("reading the answer", () => {
  it("whatever shape Workers AI answers in", () => {
    expect(answerText({ response: "[]" })).toBe("[]");
    expect(answerText({ choices: [{ message: { content: "[1]" } }] })).toBe("[1]");
    expect(answerText({ response: [{ n: 1 }] })).toBe('[{"n":1}]');
    expect(answerText(null)).toBe("");
  });

  it("each event's name, sentence and category, by number; a thought, a fence or words around it set aside", () => {
    const text = `<think>
</think>
\`\`\`json
[{"n": 2, "t": "乐高积木派对", "s": "孩子们在图书馆一起搭乐高，认识新朋友。", "c": "family"},
 {"n": 1, "t": "温哥华加人队对阵卡尔加里火焰队", "s": "看一场职业冰球比赛，感受现场气氛。", "c": "outdoors"}]
\`\`\``;
    expect(readAnswer(text, 2)).toEqual([
      { titleZh: "温哥华加人队对阵卡尔加里火焰队", summaryZh: "看一场职业冰球比赛，感受现场气氛。", category: "outdoors" },
      { titleZh: "乐高积木派对", summaryZh: "孩子们在图书馆一起搭乐高，认识新朋友。", category: "family" },
    ]);
  });

  it("leaves out what it can't use: no Chinese, too long, an unknown category (kept without it), quotes around the whole name", () => {
    const answer = JSON.stringify([
      { n: 1, t: "名字", s: "Only English here, no Chinese at all.", c: "arts" },
      { n: 2, t: "很长".repeat(30), s: "一句中文介绍，说说这是什么样的活动。", c: "arts" },
      { n: 3, t: "「读书会」", s: "大家一起读一本书，聊聊各自的感受。", c: "books" },
      { n: 4, t: "名字", s: "短短", c: null },
      // a work's name in 《》 stays, at the start or inside; a short sentence is enough
      { n: 5, t: "《美女与野兽》巡演", s: "音乐剧演出", c: "shows" },
    ]);
    expect(readAnswer(answer, 5)).toEqual([
      null,
      null,
      { titleZh: "读书会", summaryZh: "大家一起读一本书，聊聊各自的感受。", category: null },
      null,
      { titleZh: "《美女与野兽》巡演", summaryZh: "音乐剧演出", category: "shows" },
    ]);
  });

  it("an answer cut off at its length loses only the event it was writing", () => {
    const cut = `[{"n":1,"t":"英语对话练习","s":"和其他英语学习者一起轻松练习口语。","c":"social"},{"n":2,"t":"婴儿社交","s":"带宝宝来认识`;
    expect(readAnswer(cut, 2)).toEqual([{ titleZh: "英语对话练习", summaryZh: "和其他英语学习者一起轻松练习口语。", category: "social" }, null]);
    expect(readAnswer("I can't help with that.", 2)).toEqual([null, null]);
  });
});

describe("what it may say", () => {
  const e = { id: "x", title: "Saliah in Vancouver", venue: "Celebrities Nightclub", description: null, labels: '["Music","Dance/Electronic"]' };
  const w = (summaryZh: string, titleZh = "Saliah 温哥华演出") => ({ titleZh, summaryZh, category: null });

  it("no praise the source doesn't give, and no people or country it doesn't name", () => {
    expect(grounded(w("电子舞曲现场演出"), e)).toBe(true);
    expect(grounded(w("知名阿拉伯DJ Saliah带来电子音乐演出"), e)).toBe(false);
    expect(grounded(w("阿拉伯DJ的电子音乐演出"), e)).toBe(false);
    expect(grounded(w("流行音乐演出", "叶耳 - 2026世界巡演"), { ...e, title: "Ele Yan - MOMENT 2026 World Tour" })).toBe(true);
    expect(grounded(w("中国新生代歌手的流行音乐演出"), { ...e, title: "Ele Yan - MOMENT 2026 World Tour" })).toBe(false);
  });

  it("but what the source says, it may say", () => {
    expect(grounded(w("用普通话和粤语进行的亲子活动"), { ...e, title: "Family Fun in Mandarin and Cantonese" })).toBe(true);
    expect(grounded(w("中国传统书法课"), { ...e, title: "春节书法课" })).toBe(true);
    expect(grounded(w("韩国流行音乐与电子舞曲派对"), { ...e, title: "SOJU RAVE", labels: '["Music","K-Pop"]' })).toBe(true);
  });
});

describe("writing and keeping it", () => {
  it("writes the soonest events first, keeps the name, the sentence and a category where the parsers gave none", async () => {
    await ensureSchema(env.DB);
    await storeEvents(env.DB, RUN, [event(1), event(2, { category: "family" }), event(3, { start: "2026-11-30T10:00:00-07:00" })]);
    const { run, asked } = model();
    const r = await writeSome(env.DB, run, RUN, NOW, W.toMs);
    expect(r).toEqual({ asked: 3, wrote: 3, failed: 0, error: null });
    expect(asked[0].map((i) => i.title)).toEqual(["Event 1", "Event 2", "Event 3"]);
    expect(await row("vpl:e1")).toMatchObject({ title_zh: "中文名1", summary_zh: "一句中文介绍，说说这是什么样的活动。", summary_by: "ai", category: "arts", category_by: "ai", ai_tries: 0 });
    // the parsers' category stays
    expect(await row("vpl:e2")).toMatchObject({ title_zh: "中文名2", category: "family", category_by: "rule" });
    const one = await row("vpl:e1");
    expect(one?.ai_hash).toBe(`${one?.text_hash}:${AI_VERSION}`);
    // nothing left to write: not asked again
    expect(await writeSome(env.DB, run, RUN, NOW, W.toMs)).toEqual({ asked: 0, wrote: 0, failed: 0, error: null });
    expect(asked).toHaveLength(1);
  });

  it("a new text from the source is written again; the same text again isn't", async () => {
    await ensureSchema(env.DB);
    await storeEvents(env.DB, RUN, [event(1)]);
    const { run, asked } = model();
    await writeSome(env.DB, run, RUN, NOW, W.toMs);
    await storeEvents(env.DB, RUN, [event(1)]);
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(0);
    await storeEvents(env.DB, RUN, [event(1, { description: "Now with a band." })]);
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(1);
    expect(asked[1][0].about).toBe("Now with a band.");
  });

  it("Chinese written before the text had a hash (from before migration 0004) isn't written again when it gets one", async () => {
    await storeEvents(env.DB, RUN, [event(1)]);
    await env.DB.prepare("UPDATE events SET text_hash = NULL").run();
    const { run, asked } = model();
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).wrote).toBe(1);
    expect(await row("vpl:e1")).toMatchObject({ ai_hash: `:${AI_VERSION}`, text_hash: null });
    // the next morning's run gives it a hash: the Chinese is for that text
    await storeEvents(env.DB, RUN, [event(1)]);
    const one = await row("vpl:e1");
    expect(one?.ai_hash).toBe(`${one?.text_hash}:${AI_VERSION}`);
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(0);
    expect(asked).toHaveLength(1);
  });

  it("Ticketmaster's names stay as the source wrote them; an answer with what the source doesn't say isn't kept", async () => {
    await storeEvents(env.DB, RUN, [
      event(1, { source: "ticketmaster", title: "Amanda Marshall - The Dirty 30 Tour" }),
      event(2, { source: "ticketmaster", title: "Saliah in Vancouver", sourceCategories: ["Music", "Dance/Electronic"] }),
    ]);
    const { run } = model((items) => [
      { n: items[0].n, t: "阿曼达·马歇尔：肮脏三十巡演", s: "摇滚音乐现场演出", c: "shows" },
      { n: items[1].n, t: "Saliah 温哥华演出", s: "知名阿拉伯DJ带来电子音乐演出", c: "nightlife" },
    ]);
    expect(await writeSome(env.DB, run, RUN, NOW, W.toMs)).toEqual({ asked: 2, wrote: 1, failed: 1, error: null });
    expect(await row("ticketmaster:e1")).toMatchObject({ title_zh: "Amanda Marshall - The Dirty 30 Tour", summary_zh: "摇滚音乐现场演出" });
    expect(await row("ticketmaster:e2")).toMatchObject({ title_zh: null, ai_tries: 1 });
  });

  it("Chinese from older instructions is written again (a new AI_VERSION), and the source's labels go with the event", async () => {
    await storeEvents(env.DB, RUN, [event(1, { sourceCategories: ["Music", "Rock"] })]);
    await env.DB.prepare("UPDATE events SET title_zh = 'old', summary_zh = 'old', summary_by = 'ai', ai_hash = text_hash || ':v2'").run();
    const { run, asked } = model();
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).wrote).toBe(1);
    expect(asked[0][0]).toMatchObject({ title: "Event 1", labels: "Music, Rock" });
    expect(await row("vpl:e1")).toMatchObject({ title_zh: "中文名1" });
  });

  it("an event it couldn't use counts a try; after three it stays in English, until its text changes", async () => {
    await ensureSchema(env.DB);
    await storeEvents(env.DB, RUN, [event(1), event(2)]);
    // the first comes back without Chinese, every time
    const { run } = model((items) => items.map((i) => ({ n: i.n, t: "x", s: i.title === "Event 1" ? "no Chinese" : "一句中文介绍，说说这是什么样的活动。", c: null })));
    expect(await writeSome(env.DB, run, RUN, NOW, W.toMs)).toEqual({ asked: 2, wrote: 1, failed: 1, error: null });
    await writeSome(env.DB, run, RUN, NOW, W.toMs);
    await writeSome(env.DB, run, RUN, NOW, W.toMs);
    expect(await row("vpl:e1")).toMatchObject({ title_zh: null, ai_tries: 3 });
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(0);
    await storeEvents(env.DB, RUN, [event(1, { description: "Rewritten." })]);
    expect(await row("vpl:e1")).toMatchObject({ ai_tries: 0 });
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(1);
  });

  it("when the AI can't be asked (the day's allowance used up), nothing counts against the events", async () => {
    await ensureSchema(env.DB);
    await storeEvents(env.DB, RUN, [event(1)]);
    const down: RunModel = async () => {
      throw new Error("3036: Account limited: you have used up your daily free allocation of 10,000 neurons");
    };
    const r = await writeSome(env.DB, down, RUN, NOW, W.toMs);
    expect(r).toMatchObject({ asked: 1, wrote: 0, failed: 0 });
    expect(r.error).toContain("10,000 neurons");
    expect(await row("vpl:e1")).toMatchObject({ ai_tries: 0, title_zh: null });
  });

  it("only what the page shows, not over yet; a step takes its own share and is logged as the run's 'ai' step", async () => {
    await ensureSchema(env.DB);
    const many = Array.from({ length: AI_BATCH + 5 }, (_, i) => event(i + 1));
    // over by now (06:00 to 08:00 this morning), and after the window: never asked
    await storeEvents(env.DB, RUN, [...many, event(90, { start: "2026-11-19T06:00:00-07:00" }), event(91, { start: "2026-12-10T10:00:00-07:00" })]);
    const { run, asked } = model();
    const ai = { ...env, AI: { run } } as unknown as Env;
    const second = await translateStep(ai, { runId: RUN, offset: AI_BATCH }, NOW);
    expect(second).toEqual({ asked: 5, wrote: 5, failed: 0, error: null });
    const first = await translateStep(ai, { runId: RUN, offset: 0 }, NOW);
    expect(first).toEqual({ asked: AI_BATCH, wrote: AI_BATCH, failed: 0, error: null });
    expect(asked.flat().some((i) => i.title === "Event 90" || i.title === "Event 91")).toBe(false);
    const log = (await env.DB.prepare("SELECT part, found, updated, error FROM fetch_log WHERE run_id = ?1 AND source = 'ai' ORDER BY id").bind(RUN).all()).results;
    expect(log).toEqual([
      { part: 1, found: 5, updated: 5, error: null },
      { part: 0, found: AI_BATCH, updated: AI_BATCH, error: null },
    ]);
  });

  it("the published list carries the Chinese name and sentence", async () => {
    await ensureSchema(env.DB);
    await storeEvents(env.DB, RUN, [event(1)]);
    await writeSome(env.DB, model().run, RUN, NOW, W.toMs);
    await publish(env, RUN);
    const pub = await env.CACHE.get<Published>(LIVE_KEY, "json");
    expect(pub?.events[0]).toMatchObject({ title: "Event 1", titleZh: "中文名1", summaryZh: "一句中文介绍，说说这是什么样的活动。", category: "arts" });
  });
});

describe("the hourly catch-up", () => {
  /**
   * A stand-in for the steps: `left` events wait; in a round (offsets 0, 15, 30, called at once) each
   * step takes up to a request's worth from its offset in the list as the round found it.
   */
  function queue(left: number, opts: { fail?: boolean } = {}) {
    const offsets: number[] = [];
    const published: string[] = [];
    let atStart = left;
    const t: Translator = {
      async translate({ offset }) {
        if (offset === 0) atStart = left;
        offsets.push(offset);
        const asked = Math.max(0, Math.min(AI_BATCH, atStart - offset));
        const wrote = opts.fail ? 0 : asked;
        left -= wrote;
        return { asked, wrote, failed: 0, error: opts.fail ? "3036: Account limited" : null } satisfies Wrote;
      },
      async publish({ runId }) {
        published.push(runId);
        return {};
      },
    };
    return { t, offsets, published };
  }

  it("asks three requests at a time until a round finds less than it could take, then publishes again", async () => {
    await ensureSchema(env.DB);
    const { t, offsets, published } = queue(100);
    // 45, 45, then 10 (fewer than a round could take): done
    expect(await catchUp(t, env.DB, RUN, NOW)).toEqual({ wrote: 100, steps: 9, published: true });
    expect(offsets).toEqual([0, AI_BATCH, 2 * AI_BATCH, 0, AI_BATCH, 2 * AI_BATCH, 0, AI_BATCH, 2 * AI_BATCH]);
    expect(published).toEqual([RUN]);
  });

  it("stops at a round that writes nothing (the AI can't be asked), and publishes nothing", async () => {
    await ensureSchema(env.DB);
    const { t, offsets, published } = queue(100, { fail: true });
    expect(await catchUp(t, env.DB, RUN, NOW)).toEqual({ wrote: 0, steps: 3, published: false });
    expect(offsets).toHaveLength(3);
    expect(published).toEqual([]);
  });

  it("nothing waiting: one round, no publishing", async () => {
    await ensureSchema(env.DB);
    const { t, published } = queue(0);
    expect(await catchUp(t, env.DB, RUN, NOW)).toEqual({ wrote: 0, steps: 3, published: false });
    expect(published).toEqual([]);
  });

  it("leaves the publishing to this morning's run while it's under way; nothing without a published list", async () => {
    await ensureSchema(env.DB);
    await env.DB.prepare("INSERT INTO runs (run_id, next_source, next_part, started_at) VALUES (?1, 'vpl', 0, ?2)").bind(RUN, new Date(NOW).toISOString()).run();
    const { t, published } = queue(5);
    expect(await catchUp(t, env.DB, "2026-11-18", NOW)).toMatchObject({ wrote: 5, published: false });
    expect(published).toEqual([]);
    expect(await catchUp(queue(5).t, env.DB, null, NOW)).toEqual({ wrote: 0, steps: 0, published: false });
  });
});
