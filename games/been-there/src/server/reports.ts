// Error reports from the game's pages, and what the server keeps of them. A phone or the big screen
// sends one when something goes wrong there (an error, a promise nobody caught, the page frozen for
// seconds, the server out of reach for long: src/client/report.ts), so a problem on real phones shows
// up without anyone having to describe it. Nothing personal is kept: no names, team names, room codes,
// addresses or the phone's own id; the browser only as its family and major version. Each kind of
// problem is one entry (how often, since when, on which screens and browsers, in which builds), and
// GET /trip/api/reports sums them up (`npm run reports` prints it).

export type ReportKind = "error" | "rejection" | "freeze" | "offline";
const KINDS: readonly ReportKind[] = ["error", "rejection", "freeze", "offline"];
export type ReportScreen = "phone" | "tv" | "demo" | "start";
const SCREENS: readonly ReportScreen[] = ["phone", "tv", "demo", "start"];
const PHASES = ["lobby", "playing", "over"] as const;

/** What a page sends (POST /trip/api/report, a JSON body). */
export interface ReportIn {
  kind: ReportKind;
  /** The error's message; for a freeze or an outage, what it was. */
  msg: string;
  /** The stack's lines that are the game's own (file:line:column), newest first. */
  stack?: string;
  /** How long a freeze or an outage lasted, ms. */
  ms?: number;
  screen: ReportScreen;
  phase?: "lobby" | "playing" | "over";
  /** The commit the page was built from (7 characters), or "dev". */
  build?: string;
  lang?: "zh" | "en";
}

/** One kind of problem, as the server keeps it. */
export interface ReportEntry {
  kind: ReportKind;
  msg: string;
  /** The top frame of the latest stack ("app.js:1:2345"). */
  where: string;
  stack: string;
  count: number;
  first: number;
  last: number;
  /** The longest freeze or outage, ms. */
  longest?: number;
  screens: Record<string, number>;
  browsers: Record<string, number>;
  builds: Record<string, number>;
  phases: Record<string, number>;
}

export interface ReportSummary {
  now: number;
  /** Reports kept, in all. */
  total: number;
  /** Reports a day, the last 30 days that had any. */
  days: { day: string; n: number }[];
  /** The latest 60 kinds of problem, the most recent first (stacks cut to 4 lines). */
  problems: ReportEntry[];
}

/** The storage a report box keeps its entries in (a Durable Object's, or a Map in the tests). */
export interface ReportStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(opts: { prefix: string }): Promise<Map<string, T>>;
}

/** At most this many kinds of problem are kept; the ones seen longest ago go first. */
export const MAX_ENTRIES = 200;
/** Each tally keeps its first 12 names; more count as "other". */
const MAX_NAMES = 12;
const DAYS_KEPT = 60;
const MSG_MAX = 300;
const STACK_MAX = 1200;

/**
 * What can't go into a report: a URL's query (a room's address carries the phone's id and key), an
 * address's host, a room's code in a path, anything after the first 300 characters, control
 * characters.
 */
export function scrub(text: string, max: number): string {
  return text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/(https?|wss?):\/\/[^\s/)]+/g, "")
    .replace(/\?[\w%.-]+=[^\s):]*/g, "")
    .replace(/\/(r|tv|rooms)\/\d{4}\b/g, "/$1/____")
    .trim()
    .slice(0, max);
}

/** A report as sent, checked: null if it isn't one. Only the fields above, each scrubbed and cut short. */
export function readReport(body: unknown): ReportIn | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const kind = KINDS.find((k) => k === b.kind);
  const screen = SCREENS.find((s) => s === b.screen);
  if (!kind || !screen || typeof b.msg !== "string") return null;
  const msg = scrub(b.msg, MSG_MAX);
  if (!msg) return null;
  const out: ReportIn = { kind, msg, screen };
  if (typeof b.stack === "string") {
    const stack = scrub(b.stack, STACK_MAX);
    if (stack) out.stack = stack;
  }
  if (typeof b.ms === "number" && Number.isFinite(b.ms) && b.ms > 0) out.ms = Math.min(3_600_000, Math.round(b.ms));
  const phase = PHASES.find((p) => p === b.phase);
  if (phase) out.phase = phase;
  if (typeof b.build === "string" && /^[\w.-]{1,40}$/.test(b.build)) out.build = b.build;
  if (b.lang === "zh" || b.lang === "en") out.lang = b.lang;
  return out;
}

const num = (re: RegExp, s: string) => re.exec(s)?.[1];

/** A browser's family and major version from its user agent ("iOS 18 Safari 18", "Android 14 Chrome 130", "iOS 17 WeChat 8"). */
export function browserOf(ua: string): string {
  const ios = /iPhone|iPad|iPod/.test(ua);
  const os = ios
    ? `iOS ${num(/OS (\d+)[_.]/, ua) ?? "?"}`
    : /Android/.test(ua)
      ? `Android ${num(/Android (\d+)/, ua) ?? "?"}`
      : /CrOS/.test(ua)
        ? "ChromeOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "?";
  const apps: [string, RegExp][] = [
    ["WeChat", /MicroMessenger\/(\d+)/],
    ["Edge", /Edg(?:A|iOS)?\/(\d+)/],
    ["Samsung", /SamsungBrowser\/(\d+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
    ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
    ["Safari", /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/],
  ];
  for (const [name, re] of apps) {
    const v = num(re, ua);
    if (v) return `${os} ${name} ${v}`;
  }
  return `${os} ?`;
}

/** The stack's first line, without its folders ("app.js:1:2345"). */
export const topFrame = (stack: string | undefined) =>
  (stack?.split("\n")[0] ?? "")
    .replace(/^.*\//, "")
    .replace(/\)$/, "")
    .slice(0, 120);

/**
 * Which kind of problem a report is: the same message from the same file is one problem (a build's
 * columns move, so they don't count; numbers in a message don't either). A freeze is one per screen and
 * phase, an outage one per screen.
 */
export function signature(r: ReportIn): string {
  if (r.kind === "freeze") return `freeze|${r.screen}|${r.phase ?? "-"}`;
  if (r.kind === "offline") return `offline|${r.screen}`;
  const file = topFrame(r.stack).replace(/:\d+(:\d+)?$/, "");
  return `${r.kind}|${r.msg.replace(/\d+/g, "#").slice(0, 160)}|${file}`;
}

/** A short key for a signature (FNV-1a, 32 bits). */
export function keyOf(sig: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `sig:${h.toString(16).padStart(8, "0")}`;
}

function tally(names: Record<string, number>, name: string) {
  const k = name in names || Object.keys(names).length < MAX_NAMES ? name : "other";
  names[k] = (names[k] ?? 0) + 1;
}

/** Keep one report. */
export async function keepReport(store: ReportStore, r: ReportIn, browser: string, now: number): Promise<void> {
  const key = keyOf(signature(r));
  const old = await store.get<ReportEntry>(key);
  const e: ReportEntry = old ?? {
    kind: r.kind,
    msg: r.msg,
    where: "",
    stack: "",
    count: 0,
    first: now,
    last: now,
    screens: {},
    browsers: {},
    builds: {},
    phases: {},
  };
  e.count += 1;
  e.last = now;
  e.msg = r.msg;
  if (r.stack) {
    e.stack = r.stack;
    e.where = topFrame(r.stack);
  }
  if (r.ms) e.longest = Math.max(e.longest ?? 0, r.ms);
  tally(e.screens, r.screen);
  tally(e.browsers, browser);
  tally(e.builds, r.build ?? "?");
  tally(e.phases, r.phase ?? "-");
  await store.put(key, e);
  const day = `day:${new Date(now).toISOString().slice(0, 10)}`;
  await store.put(day, ((await store.get<number>(day)) ?? 0) + 1);
  if (!old) await prune(store);
}

async function prune(store: ReportStore) {
  const entries = [...(await store.list<ReportEntry>({ prefix: "sig:" })).entries()];
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => a[1].last - b[1].last);
    for (const [key] of entries.slice(0, entries.length - MAX_ENTRIES)) await store.delete(key);
  }
  const days = [...(await store.list<number>({ prefix: "day:" })).keys()].sort();
  for (const key of days.slice(0, Math.max(0, days.length - DAYS_KEPT))) await store.delete(key);
}

/** What GET /trip/api/reports answers. */
export async function reportSummary(store: ReportStore, now: number): Promise<ReportSummary> {
  const entries = [...(await store.list<ReportEntry>({ prefix: "sig:" })).values()].sort((a, b) => b.last - a.last);
  const days = [...(await store.list<number>({ prefix: "day:" })).entries()]
    .map(([key, n]) => ({ day: key.slice(4), n }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-30);
  return {
    now,
    total: entries.reduce((sum, e) => sum + e.count, 0),
    days,
    problems: entries.slice(0, 60).map((e) => ({ ...e, stack: e.stack.split("\n").slice(0, 4).join("\n") })),
  };
}

/**
 * Reports from one address, at most 30 in 10 minutes (kept in this copy of the worker's memory
 * only, never stored), so a page stuck in a loop or someone sending junk can't fill the box.
 */
export function makeLimiter(max = 30, windowMs = 10 * 60_000) {
  const seen = new Map<string, { n: number; until: number }>();
  return (who: string, now: number): boolean => {
    if (seen.size > 5000) seen.clear();
    const s = seen.get(who);
    if (!s || now > s.until) {
      seen.set(who, { n: 1, until: now + windowMs });
      return true;
    }
    s.n += 1;
    return s.n <= max;
  };
}
