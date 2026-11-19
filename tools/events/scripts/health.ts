// What's On: the daily health check (src/health.ts). GitHub runs this once a day
// (.github/workflows/events-health.yml): it reads /go/api/status and judges yesterday's run. When a
// source wasn't read to the end, the run didn't publish, it published far fewer events than usual,
// or the status can't be read, it opens an issue on the repository that mentions Steve (GitHub
// emails him), or comments on the open one if the problems changed. Once a day passes, it closes it.
//   npm run health -- --dry-run   judge and print: nothing is opened or closed, nothing is needed
//   npm run health                also open, update or close the issue: needs GITHUB_TOKEN and
//                                 GITHUB_REPOSITORY (the job has both, with `issues: write`)
import { checkHealth, sync, unreadable, type GitHub, type Health, type StatusForHealth } from "../src/health";

const dry = process.argv.includes("--dry-run");
/** The Worker's own address: changle.ca's bot protection answers GitHub's machines with a challenge page. */
const STATUS = process.env.EVENTS_STATUS_URL ?? "https://changle-events.jiangchangle0724.workers.dev/go/api/status";
/** Who the issue mentions, so that GitHub emails him. */
const OWNER = "jiangchangle0724-del";

/** The status, or why it couldn't be read. Three tries, half a minute apart: one blip is not a problem. */
async function readStatus(): Promise<StatusForHealth | string> {
  let why = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 30_000));
    try {
      const res = await fetch(STATUS, { headers: { "user-agent": "changle.ca events health check (+https://changle.ca/go)" }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        why = `HTTP ${res.status}`;
        continue;
      }
      const status = (await res.json()) as Partial<StatusForHealth>;
      if (Array.isArray(status.sources) && Array.isArray(status.history)) return status as StatusForHealth;
      why = "它没有说各个来源和最近几轮的情况";
    } catch (e) {
      why = e instanceof Error ? e.message : String(e);
    }
  }
  return why;
}

const github: GitHub = async (path, init) => {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    method: init?.method ?? "GET",
    body: init ? JSON.stringify(init.body) : undefined,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "changle-events-health",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init?.method ?? "GET"} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

async function main(): Promise<void> {
  const status = await readStatus();
  const health: Health = typeof status === "string" ? unreadable(status) : checkHealth(status);
  console.log(health.ok ? `${health.day}: every source was read, and the run published as usual.` : `${health.day}:\n${health.problems.map((p) => `  [${p.key}] ${p.text}`).join("\n")}`);
  if (dry) return;
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are needed for the issue (or run with --dry-run)");
  console.log(await sync(health, github, OWNER));
}

main().catch((e) => {
  console.error(process.env.GITHUB_ACTIONS === "true" ? `::error title=What's On health check::${e instanceof Error ? e.message : e}` : e);
  process.exitCode = 1;
});
