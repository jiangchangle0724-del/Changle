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
  settle,
  translateStep,
  writeSome,
  type RunModel,
  type Translator,
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

  it("when the new answer can't be used, Chinese from older instructions goes too: the source's words show until a good one comes", async () => {
    await storeEvents(env.DB, RUN, [event(1, { source: "ticketmaster", title: "Saliah in Vancouver" })]);
    await env.DB.prepare("UPDATE events SET title_zh = 'Saliah 温哥华演出', summary_zh = '知名阿拉伯DJ带来电子音乐演出', summary_by = 'ai', ai_hash = text_hash || ':v2'").run();
    const { run } = model((items) => [{ n: items[0].n, t: "Saliah 温哥华演出", s: "知名阿拉伯DJ带来电子音乐演出", c: "nightlife" }]);
    expect(await writeSome(env.DB, run, RUN, NOW, W.toMs)).toMatchObject({ asked: 1, wrote: 0, failed: 1 });
    expect(await row("ticketmaster:e1")).toMatchObject({ title_zh: null, summary_zh: null, summary_by: null, ai_tries: 1 });
  });

  it("Chinese from older instructions is written again (a new AI_VERSION), and the source's labels go with the event", async () => {
    await storeEvents(env.DB, RUN, [event(1, { sourceCategories: ["Music", "Rock"] })]);
    await env.DB.prepare("UPDATE events SET title_zh = 'old', summary_zh = 'old', summary_by = 'ai', ai_hash = text_hash || ':v2'").run();
    const { run, asked } = model();
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).wrote).toBe(1);
    expect(asked[0][0]).toMatchObject({ title: "Event 1", labels: "Music, Rock" });
    expect(await row("vpl:e1")).toMatchObject({ title_zh: "中文名1" });
  });

  it("new instructions try again an event the old ones gave up on", async () => {
    await storeEvents(env.DB, RUN, [event(1)]);
    await env.DB.prepare("UPDATE events SET ai_hash = '!' || text_hash || ':v2', ai_tries = 3").run();
    const { run } = model();
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).wrote).toBe(1);
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

  it("the same text in a source (every date of a weekly event) is asked once, and all its dates get the same Chinese", async () => {
    const baby = (n: number) => event(n, { title: "Babytime", description: "Songs and rhymes for babies." });
    await storeEvents(env.DB, RUN, [baby(1), baby(2), baby(3), event(4)]);
    const { run, asked } = model();
    expect(await writeSome(env.DB, run, RUN, NOW, W.toMs)).toEqual({ asked: 2, wrote: 2, failed: 0, error: null });
    // the soonest date stands for them all
    expect(asked[0].map((i) => i.title)).toEqual(["Babytime", "Event 4"]);
    for (const id of ["vpl:e1", "vpl:e2", "vpl:e3"]) expect(await row(id)).toMatchObject({ title_zh: "中文名1", summary_by: "ai", category: "arts", ai_tries: 0 });
    const third = await row("vpl:e3");
    expect(third?.ai_hash).toBe(`${third?.text_hash}:${AI_VERSION}`);
    expect(await row("vpl:e4")).toMatchObject({ title_zh: "中文名2" });
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(0);
  });

  it("an answer it can't use counts a try for every date of it; after three, a new date isn't asked either", async () => {
    const baby = (n: number) => event(n, { title: "Babytime", description: "Songs and rhymes for babies." });
    await storeEvents(env.DB, RUN, [baby(1), baby(2)]);
    const { run, asked } = model((items) => items.map((i) => ({ n: i.n, t: "x", s: "no Chinese", c: null })));
    for (let i = 0; i < 3; i++) expect(await writeSome(env.DB, run, RUN, NOW, W.toMs)).toMatchObject({ asked: 1, wrote: 0, failed: 1 });
    expect(await row("vpl:e1")).toMatchObject({ title_zh: null, ai_tries: 3 });
    expect(await row("vpl:e2")).toMatchObject({ title_zh: null, ai_tries: 3 });
    await storeEvents(env.DB, RUN, [baby(1), baby(2), baby(3)]);
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(0);
    expect(asked).toHaveLength(3);
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

  it("only what the page shows, not over yet; a step takes the share it's given and is logged as the run's 'ai' step", async () => {
    await ensureSchema(env.DB);
    const many = Array.from({ length: AI_BATCH + 5 }, (_, i) => event(i + 1));
    // over by now (06:00 to 08:00 this morning), and after the window: never asked
    await storeEvents(env.DB, RUN, [...many, event(90, { start: "2026-11-19T06:00:00-07:00" }), event(91, { start: "2026-12-10T10:00:00-07:00" })]);
    const { run, asked } = model();
    const ai = { ...env, AI: { run } } as unknown as Env;
    const ids = (list: NormalizedEvent[]) => list.map((e) => `vpl:${e.sourceEventId}`);
    const second = await translateStep(ai, { runId: RUN, ids: [...ids(many.slice(AI_BATCH)), "vpl:e90", "vpl:e91"], part: 1 }, NOW);
    expect(second).toEqual({ asked: 5, wrote: 5, failed: 0, error: null });
    const first = await translateStep(ai, { runId: RUN, ids: ids(many.slice(0, AI_BATCH)), part: 0 }, NOW);
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

describe("what's written two ways", () => {
  const place = (name: string) => ({ name, address: "1 Main St.", city: "Vancouver" });
  const baby = (n: number, at = "Central Library") => event(n, { title: "Babytime", description: "Songs and rhymes for babies.", place: place(at) });
  /** As if written before twins were asked as one. */
  const written = (id: string, titleZh: string, summaryZh: string, version = AI_VERSION) =>
    env.DB.prepare("UPDATE events SET title_zh = ?2, summary_zh = ?3, summary_by = 'ai', ai_hash = text_hash || ':' || ?4 WHERE id = ?1").bind(id, titleZh, summaryZh, version).run();

  it("twins go the commonest way; then a name written two ways (two branches) goes the commonest way, but not Ticketmaster's", async () => {
    await storeEvents(env.DB, RUN, [baby(1), baby(2), baby(3), baby(4, "Kits Branch"), baby(5, "Firehall Branch"), event(6, { source: "ticketmaster", title: "Babytime" })]);
    await written("vpl:e1", "婴儿时光", "唱歌念童谣的婴儿活动。");
    await written("vpl:e2", "婴儿时光", "唱歌念童谣的婴儿活动。");
    await written("vpl:e3", "婴儿时间", "给婴儿的唱歌活动。");
    await written("vpl:e4", "婴儿时间", "给婴儿的唱歌活动。");
    await written("vpl:e5", "婴儿故事时间", "给婴儿的唱歌活动。");
    await written("ticketmaster:e6", "Babytime", "一场演出。");
    // e3 like its twins; then e4 and e5 named like the most
    expect(await settle(env.DB, NOW, W.toMs)).toBe(3);
    expect(await row("vpl:e3")).toMatchObject({ title_zh: "婴儿时光", summary_zh: "唱歌念童谣的婴儿活动。" });
    // the name goes the commonest way; the sentence is each text's own
    expect(await row("vpl:e4")).toMatchObject({ title_zh: "婴儿时光", summary_zh: "给婴儿的唱歌活动。" });
    expect(await row("vpl:e5")).toMatchObject({ title_zh: "婴儿时光" });
    expect(await row("ticketmaster:e6")).toMatchObject({ title_zh: "Babytime" });
    expect(await settle(env.DB, NOW, W.toMs)).toBe(0);
  });

  it("a new date of what's written gets its Chinese without asking; older instructions' answers don't count", async () => {
    await storeEvents(env.DB, RUN, [baby(1), baby(2, "Kits Branch")]);
    await written("vpl:e1", "婴儿时光", "唱歌念童谣的婴儿活动。");
    await written("vpl:e2", "宝宝时间", "给婴儿的唱歌活动。", "v2");
    await storeEvents(env.DB, RUN, [baby(1), baby(2, "Kits Branch"), baby(3)]);
    // e3 from its twin; e2's old answer takes the name of the one written for these instructions
    expect(await settle(env.DB, NOW, W.toMs)).toBe(2);
    const third = await row("vpl:e3");
    expect(third).toMatchObject({ title_zh: "婴儿时光", summary_zh: "唱歌念童谣的婴儿活动。", summary_by: "ai", ai_tries: 0 });
    expect(third?.ai_hash).toBe(`${third?.text_hash}:${AI_VERSION}`);
    expect(await row("vpl:e2")).toMatchObject({ title_zh: "婴儿时光" });
    const { run, asked } = model();
    // only e2 is left to write again, for these instructions
    expect((await writeSome(env.DB, run, RUN, NOW, W.toMs)).asked).toBe(1);
    expect(asked[0][0]).toMatchObject({ title: "Babytime" });
  });

  it("only the AI's words: Steve's stay, and so does a category the parsers gave; the AI's goes with the rest", async () => {
    await storeEvents(env.DB, RUN, [baby(1), baby(2), baby(3), baby(4)]);
    await written("vpl:e1", "婴儿时光", "唱歌念童谣的婴儿活动。");
    await env.DB.prepare("UPDATE events SET category = 'family', category_by = 'ai' WHERE id = 'vpl:e1'").run();
    await env.DB.prepare("UPDATE events SET title_zh = '宝宝时间', summary_zh = 'Steve 写的。', summary_by = 'steve' WHERE id = 'vpl:e2'").run();
    await env.DB.prepare("UPDATE events SET category = 'arts', category_by = 'rule' WHERE id = 'vpl:e3'").run();
    await written("vpl:e3", "宝宝时间", "给婴儿的唱歌活动。");
    // two answers once each: the first event's wins (e1); e3 and e4 take it
    expect(await settle(env.DB, NOW, W.toMs)).toBe(2);
    expect(await row("vpl:e2")).toMatchObject({ title_zh: "宝宝时间", summary_zh: "Steve 写的。", summary_by: "steve" });
    expect(await row("vpl:e3")).toMatchObject({ title_zh: "婴儿时光", summary_zh: "唱歌念童谣的婴儿活动。", category: "arts", category_by: "rule" });
    expect(await row("vpl:e4")).toMatchObject({ title_zh: "婴儿时光", category: "family", category_by: "ai" });
  });
});

describe("the hourly catch-up", () => {
  /** The steps as the Worker runs them, with a stand-in model; and what each step was given. */
  function steps(answer?: (items: { n: number; title: string }[]) => unknown) {
    const { run } = model(answer);
    const ai = { ...env, AI: { run } } as unknown as Env;
    const given: string[][] = [];
    const published: string[] = [];
    const t: Translator = {
      async translate(a) {
        given.push(a.ids);
        return translateStep(ai, a, NOW);
      },
      async publish({ runId }) {
        published.push(runId);
        return {};
      },
    };
    return { t, given, published };
  }

  it("three steps at a time, each with its own events, until a round finds fewer than it could take; then publishes again", async () => {
    await storeEvents(env.DB, RUN, Array.from({ length: 100 }, (_, i) => event(i + 1)));
    const { t, given, published } = steps();
    // 45, 45, then 10
    expect(await catchUp(t, env.DB, RUN, NOW)).toEqual({ wrote: 100, settled: 0, steps: 7, published: true });
    expect(given.map((ids) => ids.length)).toEqual([15, 15, 15, 15, 15, 15, 10]);
    // no event given to two steps
    expect(new Set(given.flat()).size).toBe(100);
    expect(published).toEqual([RUN]);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM events WHERE title_zh IS NOT NULL").first<{ n: number }>())?.n).toBe(100);
  });

  it("stops at a round that writes nothing (the AI can't be asked, or says nothing usable), and publishes nothing", async () => {
    await storeEvents(env.DB, RUN, Array.from({ length: 100 }, (_, i) => event(i + 1)));
    const { t, given, published } = steps(() => "I can't help with that.");
    expect(await catchUp(t, env.DB, RUN, NOW)).toEqual({ wrote: 0, settled: 0, steps: 3, published: false });
    expect(given).toHaveLength(3);
    expect(published).toEqual([]);
  });

  it("nothing waiting: no step, no publishing", async () => {
    const { t, given, published } = steps();
    expect(await catchUp(t, env.DB, RUN, NOW)).toEqual({ wrote: 0, settled: 0, steps: 0, published: false });
    expect(given).toEqual([]);
    expect(published).toEqual([]);
  });

  it("a new date of what's written: its Chinese from its twin, nothing asked, and the page again", async () => {
    const baby = (n: number) => event(n, { title: "Babytime", description: "Songs and rhymes for babies." });
    await storeEvents(env.DB, RUN, [baby(1), baby(2)]);
    const first = steps();
    expect(await catchUp(first.t, env.DB, RUN, NOW)).toEqual({ wrote: 1, settled: 0, steps: 1, published: true });
    await storeEvents(env.DB, RUN, [baby(1), baby(2), baby(3)]);
    const { t, given, published } = steps();
    expect(await catchUp(t, env.DB, RUN, NOW)).toEqual({ wrote: 0, settled: 1, steps: 0, published: true });
    expect(given).toEqual([]);
    expect(published).toEqual([RUN]);
    expect(await row("vpl:e3")).toMatchObject({ title_zh: "中文名1" });
  });

  it("leaves the publishing to this morning's run while it's under way; nothing without a published list", async () => {
    await storeEvents(env.DB, RUN, Array.from({ length: 5 }, (_, i) => event(i + 1)));
    await env.DB.prepare("INSERT INTO runs (run_id, next_source, next_part, started_at) VALUES (?1, 'vpl', 0, ?2)").bind(RUN, new Date(NOW).toISOString()).run();
    const { t, published } = steps();
    expect(await catchUp(t, env.DB, RUN, NOW)).toMatchObject({ wrote: 5, published: false });
    expect(published).toEqual([]);
    expect(await catchUp(steps().t, env.DB, null, NOW)).toEqual({ wrote: 0, settled: 0, steps: 0, published: false });
  });
});
