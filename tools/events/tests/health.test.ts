import { describe, expect, it } from "vitest";
import { BOT, checkHealth, report, sync, unreadable, type GitHub, type StatusForHealth } from "../src/health";

// The check runs in the night: 02:23 on 19 November in Vancouver. It judges the 18th.
const NOW = Date.parse("2026-11-19T09:23:00Z");
const DAY = "2026-11-18";

const fine = (): StatusForHealth => ({
  sources: [
    { id: "luma-vancouver", name: "Luma Vancouver", enabled: 1, lastOkRun: DAY, lastError: null },
    { id: "vpl", name: "Vancouver Public Library", enabled: 1, lastOkRun: DAY, lastError: null },
    { id: "ticketmaster", name: "Ticketmaster", enabled: 1, lastOkRun: DAY, lastError: null },
  ],
  history: [
    { run: "2026-11-18", count: 644 },
    { run: "2026-11-17", count: 650 },
    { run: "2026-11-16", count: 630 },
    { run: "2026-11-15", count: 664 },
    { run: "2026-11-14", count: 664 },
  ],
});

describe("the daily check", () => {
  it("passes when every source was read to the end and the run published as usual", () => {
    expect(checkHealth(fine(), NOW)).toEqual({ day: DAY, ok: true, problems: [] });
  });

  it("judges yesterday in Vancouver, however late in the day GitHub starts it", () => {
    // 23:50 on the 19th in Vancouver (06:50 UTC on the 20th): the 19th isn't over, so it's the 18th
    expect(checkHealth(fine(), Date.parse("2026-11-20T06:50:00Z")).day).toBe(DAY);
    // and once today's run has read a source, a failure of the day before is over
    const s = fine();
    s.sources[1] = { ...s.sources[1], lastOkRun: "2026-11-19" };
    expect(checkHealth(s, NOW).ok).toBe(true);
  });

  it("says when the run published nothing that day", () => {
    const s = fine();
    s.history.shift();
    const h = checkHealth(s, NOW);
    expect(h.ok).toBe(false);
    expect(h.problems).toEqual([{ key: "publish", text: "11月18日那一轮没有发布新清单，页面上还是之前的活动。" }]);
  });

  it("names a source that wasn't read to the end, in Chinese where it has a name, with when it last was and its error", () => {
    const s = fine();
    s.sources[1] = { ...s.sources[1], lastOkRun: "2026-11-16", lastError: "HTTP 403" };
    expect(checkHealth(s, NOW).problems).toEqual([{ key: "source:vpl", text: "温哥华公共图书馆（vpl）11月18日没读完，上次读完是11月16日，最后的错误是 HTTP 403。" }]);
    s.sources[2] = { ...s.sources[2], lastOkRun: null, lastError: null };
    expect(checkHealth(s, NOW).problems[1]).toEqual({ key: "source:ticketmaster", text: "Ticketmaster（ticketmaster）11月18日没读完，还从来没读完过。" });
  });

  it("a source waiting for its key (Eventbrite until Steve adds the token) isn't a problem", () => {
    const s = fine();
    s.sources.push({ id: "eventbrite", name: "Eventbrite", enabled: 1, lastOkRun: null, lastError: "skipped: EVENTBRITE_TOKEN is not set" });
    expect(checkHealth(s, NOW).ok).toBe(true);
  });

  it("says when the AI asked all day and wrote no Chinese at all (as when Qwen 3 was retired), not when some of it failed", () => {
    const gone = "5028: @cf/qwen/qwen3-30b-a3b-fp8 was deprecated on 2026-11-20. See the model catalog for alternatives.";
    const s = fine();
    s.steps = [
      { source: "vpl", found: 30, updated: 2, error: null },
      { source: "ai", found: 15, updated: 0, error: gone },
      { source: "ai", found: 15, updated: 0, error: gone },
      { source: "ai", found: 15, updated: 0, error: gone },
    ];
    expect(checkHealth(s, NOW).problems).toEqual([{ key: "ai", text: `中文名和介绍最近一个也没写成（AI 试了 3 次，45 个活动），最后的错误是 ${gone}。` }]);
    s.steps[2] = { source: "ai", found: 15, updated: 15, error: null };
    expect(checkHealth(s, NOW).ok).toBe(true);
    // nothing to write all day: nothing asked, nothing wrong
    s.steps = [{ source: "vpl", found: 30, updated: 2, error: null }];
    expect(checkHealth(s, NOW).ok).toBe(true);
  });

  it("never puts a key or token from an error into the issue", () => {
    const s = fine();
    s.sources[2] = { ...s.sources[2], lastOkRun: "2026-11-17", lastError: "Invalid URL: https://app.ticketmaster.com/discovery/v2/events.json?apikey=abc123SECRET&size=200" };
    const text = checkHealth(s, NOW).problems[0].text;
    expect(text).not.toContain("abc123SECRET");
    expect(text).toContain("apikey=…&size=200");
    expect(unreadable("token=zzz9 refused", NOW).problems[0].text).not.toContain("zzz9");
  });

  it("leaves out a source that is switched off", () => {
    const s = fine();
    s.sources[2] = { ...s.sources[2], enabled: 0, lastOkRun: null };
    expect(checkHealth(s, NOW).ok).toBe(true);
  });

  it("says when the run published far fewer events than the runs before it usually did", () => {
    const s = fine();
    s.history[0] = { run: DAY, count: 200 };
    expect(checkHealth(s, NOW).problems).toEqual([{ key: "drop", text: "11月18日只读到 200 个活动，前几天一般有 657 个。" }]);
    // a little fewer is fine
    s.history[0] = { run: DAY, count: 400 };
    expect(checkHealth(s, NOW).ok).toBe(true);
  });

  it("doesn't judge the count before there are three runs to compare with", () => {
    const s = fine();
    s.history = [
      { run: DAY, count: 10 },
      { run: "2026-11-17", count: 650 },
      { run: "2026-11-16", count: 630 },
    ];
    expect(checkHealth(s, NOW).ok).toBe(true);
  });

  it("when the status can't be read, that is the problem", () => {
    expect(unreadable("HTTP 522", NOW)).toEqual({ day: DAY, ok: false, problems: [{ key: "status", text: "状态页打不开（HTTP 522），没法检查11月18日那一轮。" }] });
  });
});

describe("the report", () => {
  it("mentions Steve, lists the problems and says what to do", () => {
    const s = fine();
    s.history.shift();
    s.sources[1] = { ...s.sources[1], lastOkRun: "2026-11-16", lastError: "HTTP 403" };
    const { title, body } = report(checkHealth(s, NOW), "steve");
    expect(title).toBe("玩什么：11月18日的检查没过");
    const lines = body.split("\n");
    expect(lines[0]).toBe("@steve 玩什么11月18日的检查没过：");
    expect(lines).toContain("- 11月18日那一轮没有发布新清单，页面上还是之前的活动。");
    expect(lines).toContain("- 温哥华公共图书馆（vpl）11月18日没读完，上次读完是11月16日，最后的错误是 HTTP 403。");
    expect(body).toContain("https://changle.ca/go/api/status");
    expect(body).toContain("会自己关掉");
  });

  it("when the status can't be read, doesn't say the page is fine", () => {
    const { body } = report(unreadable("HTTP 522", NOW), "steve");
    expect(body).not.toContain("页面上照样");
    expect(body).toContain("workers.dev/go/api/status");
  });
});

/** A stand-in for GitHub: answers from `answers` by method and path, and keeps every call. */
function fakeGitHub(answers: Record<string, unknown>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const gh: GitHub = async (path, init) => {
    const method = init?.method ?? "GET";
    calls.push({ method, path, ...(init ? { body: init.body } : {}) });
    const key = `${method} ${path.split("?")[0]}`;
    if (!(key in answers)) throw new Error(`unexpected ${key}`);
    return answers[key];
  };
  return { gh, calls, writes: () => calls.filter((c) => c.method !== "GET") };
}

const broken = () => {
  const s = fine();
  s.sources[1] = { ...s.sources[1], lastOkRun: "2026-11-16", lastError: "HTTP 403" };
  return checkHealth(s, NOW);
};
const mark = (keys: string) => `<!-- whats-on-health ${keys} -->`;

describe("the issue", () => {
  it("is opened when something is wrong and none is open, asking only for the check's own issues", async () => {
    const { gh, calls, writes } = fakeGitHub({ "GET /issues": [], "POST /issues": { number: 7, body: "" } });
    expect(await sync(broken(), gh, "steve")).toBe("opened #7");
    expect(calls[0].path).toBe(`/issues?state=open&creator=${encodeURIComponent(BOT)}&per_page=100`);
    const [made] = writes();
    expect(made.body).toMatchObject({ title: "玩什么：11月18日的检查没过" });
    const body = (made.body as { body: string }).body;
    expect(body.startsWith("@steve ")).toBe(true);
    expect(body.endsWith(mark("source:vpl"))).toBe(true);
  });

  it("stays quiet when the open issue already reports the same problems", async () => {
    const issue = { number: 7, body: `report\n\n${mark("source:vpl")}` };
    const { gh, writes } = fakeGitHub({ "GET /issues": [issue], "GET /issues/7/comments": [] });
    expect(await sync(broken(), gh, "steve")).toBe("#7 already says this");
    expect(writes()).toEqual([]);
  });

  it("comments when the problems changed, and goes by its own latest report", async () => {
    const issue = { number: 7, body: `report\n\n${mark("source:vpl")}` };
    const comments = [
      { body: `later report\n\n${mark("publish,source:vpl")}`, user: { login: BOT } },
      { body: `someone quoting it: ${mark("source:vpl")}`, user: { login: "steve" } },
    ];
    // the latest report said two problems; today one is left: a comment
    const { gh, writes } = fakeGitHub({ "GET /issues": [issue], "GET /issues/7/comments": comments, "POST /issues/7/comments": {} });
    expect(await sync(broken(), gh, "steve")).toBe("commented on #7");
    expect(((writes()[0].body as { body: string }).body).endsWith(mark("source:vpl"))).toBe(true);
  });

  it("is closed, with a word, once a day is fine; and nothing happens when none is open", async () => {
    const issue = { number: 7, body: `report\n\n${mark("source:vpl")}` };
    const { gh, writes } = fakeGitHub({ "GET /issues": [issue], "POST /issues/7/comments": {}, "PATCH /issues/7": {} });
    expect(await sync(checkHealth(fine(), NOW), gh, "steve")).toBe("closed #7");
    expect(writes().map((w) => `${w.method} ${w.path}`)).toEqual(["POST /issues/7/comments", "PATCH /issues/7"]);
    expect(writes()[1].body).toEqual({ state: "closed", state_reason: "completed" });
    const none = fakeGitHub({ "GET /issues": [] });
    expect(await sync(checkHealth(fine(), NOW), none.gh, "steve")).toBe("nothing to do");
    expect(none.writes()).toEqual([]);
  });

  it("isn't fooled by a pull request that quotes its mark", async () => {
    const pr = { number: 9, body: `about the check: ${mark("source:vpl")}`, pull_request: {} };
    const { gh } = fakeGitHub({ "GET /issues": [pr], "POST /issues": { number: 10, body: "" } });
    expect(await sync(broken(), gh, "steve")).toBe("opened #10");
  });
});
