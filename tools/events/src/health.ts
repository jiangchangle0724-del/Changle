// What's On's daily health check: did yesterday's run read every source and publish about as many
// events as usual? A GitHub job asks /go/api/status once a day (scripts/health.ts) and, when the
// answer is no, opens an issue on the repository that mentions Steve, so GitHub emails him. It
// comments only when the problems change, and closes the issue once a day goes well again.
// This file judges (checkHealth) and keeps the issue (sync); the script fetches and talks to GitHub.
import { SOURCE_ZH, shortDate } from "./labels";
import { addDays, vanParts } from "./time";

/** What /go/api/status says about the sources and the last runs (src/worker.ts). */
export interface StatusForHealth {
  /** The sources in the code's list, with how each last went. */
  sources: { id: string; name: string; enabled: number; lastOkRun: string | null; lastError: string | null }[];
  /** The newest runs first: how many events each run published in the end. */
  history: { run: string; count: number }[];
  /** The latest run's steps, the AI's ("ai") among them: what it was asked, wrote, and why not. */
  steps?: { source: string; found: number | null; updated: number | null; error: string | null }[];
}

export interface Problem {
  /** What went wrong, the same from day to day ("publish", "drop", "status", "source:vpl"): the issue says it again only when these change. */
  key: string;
  /** One line, in Chinese, for Steve. */
  text: string;
}

export interface Health {
  /** The day judged: yesterday in Vancouver, whose run (and the libraries' late pages) are over. */
  day: string;
  ok: boolean;
  problems: Problem[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** "11月18日" */
const md = (date: string) => shortDate(date, "zh");

/** An error as it may go into an issue: a key or token in a URL never does. */
const scrub = (text: string) => text.replace(/((?:api[_-]?)?key|token|secret|sig(?:nature)?|password)=[^&\s"']+/gi, "$1=…");

const yesterday = (now: number) => addDays(vanParts(now).date, -1);

/**
 * Judges yesterday (in Vancouver) from wherever today has got to: a source is fine if it was read to
 * the end yesterday or since (the libraries' pages come in the afternoon); the run is fine if it
 * published, and at least half as many events as the runs before it usually did.
 */
export function checkHealth(status: StatusForHealth, now = Date.now()): Health {
  const day = yesterday(now);
  const problems: Problem[] = [];
  const run = status.history.find((h) => h.run === day);
  if (!run) problems.push({ key: "publish", text: `${md(day)}那一轮没有发布新清单，页面上还是之前的活动。` });
  for (const s of status.sources) {
    // (one waiting for its key, "skipped: EVENTBRITE_TOKEN is not set", is waiting for Steve: not broken)
    if (!s.enabled || (s.lastOkRun !== null && s.lastOkRun >= day) || /^skipped:/.test(s.lastError ?? "")) continue;
    const since = s.lastOkRun ? `上次读完是${md(s.lastOkRun)}` : "还从来没读完过";
    const error = s.lastError ? `，最后的错误是 ${scrub(s.lastError)}` : "";
    problems.push({ key: `source:${s.id}`, text: `${SOURCE_ZH[s.name] ?? s.name}（${s.id}）${md(day)}没读完，${since}${error}。` });
  }
  const before = status.history.filter((h) => h.run < day).slice(0, 7).map((h) => h.count);
  const usual = median(before);
  if (run && before.length >= 3 && run.count < usual / 2) problems.push({ key: "drop", text: `${md(day)}只读到 ${run.count} 个活动，前几天一般有 ${Math.round(usual)} 个。` });
  // The AI asked all day and wrote nothing: the model gone (as Qwen 3 on 20 November), the
  // allowance used up every hour. A day when some of it failed and some was written is fine.
  const ai = (status.steps ?? []).filter((s) => s.source === "ai");
  const aiError = ai.find((s) => s.error)?.error;
  if (ai.length && aiError && ai.every((s) => !s.updated))
    problems.push({ key: "ai", text: `中文名和介绍最近一个也没写成（AI 试了 ${ai.length} 次，${ai.reduce((n, s) => n + (s.found ?? 0), 0)} 个活动），最后的错误是 ${scrub(aiError).slice(0, 200)}。` });
  return { day, ok: problems.length === 0, problems };
}

/** The status couldn't be read (the Worker down, or answering something else): that is the problem. */
export function unreadable(reason: string, now = Date.now()): Health {
  const day = yesterday(now);
  return { day, ok: false, problems: [{ key: "status", text: `状态页打不开（${scrub(reason)}），没法检查${md(day)}那一轮。` }] };
}

/** The issue's title, and the text of a report: the problems, where to look, and what to do. */
export function report(h: Health, owner: string): { title: string; body: string } {
  const statusDown = h.problems.some((p) => p.key === "status");
  return {
    title: `玩什么：${md(h.day)}的检查没过`,
    body: [
      `@${owner} 玩什么${md(h.day)}的检查没过：`,
      "",
      ...h.problems.map((p) => `- ${p.text}`),
      "",
      statusDown
        ? "状态页是 https://changle-events.jiangchangle0724.workers.dev/go/api/status 。"
        : "每一步的记录在 https://changle.ca/go/api/status （只有最近一轮）。页面上照样有能读到的活动，读不到的来源保留它之前的活动。",
      "把这个问题的链接发给管玩什么的对话，它来修。不用回复，也不用关：哪天检查又过了，这个问题会自己关掉。",
    ].join("\n"),
  };
}

/** GitHub's REST API for this repository: a path under /repos/<owner>/<repo>, the method and the JSON body. */
export type GitHub = (path: string, init?: { method: string; body: unknown }) => Promise<unknown>;

interface Issue {
  number: number;
  body: string | null;
  pull_request?: unknown;
}

/** The account GitHub's own token (GITHUB_TOKEN) writes as. */
export const BOT = "github-actions[bot]";
/** Marks this check's issue and reports, with the problems they reported. */
const MARK = "<!-- whats-on-health";
const keysOf = (h: Health) => h.problems.map((p) => p.key).sort().join(",");
const keysIn = (text: string | null | undefined) => (text ?? "").match(/<!-- whats-on-health (\S*) -->/)?.[1] ?? null;

/**
 * Brings the repository's issues in line with a check: opens one when something is wrong and none is
 * open; comments on the open one when the problems changed (the same ones again stay quiet: no email
 * a day for one broken source); closes it once a day is fine. Says what it did.
 */
export async function sync(h: Health, gh: GitHub, owner: string): Promise<string> {
  const issues = (await gh(`/issues?state=open&creator=${encodeURIComponent(BOT)}&per_page=100`)) as Issue[];
  const open = issues.find((i) => !i.pull_request && i.body?.includes(MARK));
  if (h.ok) {
    if (!open) return "nothing to do";
    await gh(`/issues/${open.number}/comments`, { method: "POST", body: { body: `${md(h.day)}的检查过了：每个来源都读完了，发布的数目也正常。这个问题先关掉。` } });
    await gh(`/issues/${open.number}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } });
    return `closed #${open.number}`;
  }
  const { title, body } = report(h, owner);
  const text = `${body}\n\n${MARK} ${keysOf(h)} -->`;
  if (!open) {
    const made = (await gh("/issues", { method: "POST", body: { title, body: text } })) as Issue;
    return `opened #${made.number}`;
  }
  const comments = (await gh(`/issues/${open.number}/comments?per_page=100`)) as { body: string | null; user: { login: string } | null }[];
  const last = [...comments].reverse().filter((c) => c.user?.login === BOT).map((c) => keysIn(c.body)).find((k) => k !== null) ?? keysIn(open.body);
  if (last === keysOf(h)) return `#${open.number} already says this`;
  await gh(`/issues/${open.number}/comments`, { method: "POST", body: { body: text } });
  return `commented on #${open.number}`;
}
