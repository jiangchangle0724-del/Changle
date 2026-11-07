// Tells the game's server when something goes wrong on this page: an error in the game's own code, a
// promise nobody caught, the page frozen for several seconds, or the server out of reach for long while
// the page was in front of someone. So a problem on real phones shows up without anyone having to
// describe it. Nothing personal goes (src/server/reports.ts says what the server keeps): the message,
// the game's own lines of the stack, which screen and phase, the build. At most 8 reports a page, each
// problem once. Only on the game's own pages (not a page opened from a file or inside an artifact).
import type { ReportIn, ReportKind, ReportScreen } from "../server/reports";
import { BASE } from "./base";

declare const __BUILD__: string;

/** What the page is doing right now, read when a report goes. */
export interface ReportContext {
  screen: ReportScreen;
  phase?: "lobby" | "playing" | "over";
  lang?: "zh" | "en";
  /** Whether the page is talking to its room (the demo always is). */
  online: boolean;
}

const MAX_REPORTS = 8;
/** A beat that comes this late (ms) while the page is in front of someone: frozen. */
export const FREEZE_MS = 6_000;
/** Longer than this is a computer asleep with its lid shut, not a freeze. */
const ASLEEP_MS = 60_000;
/** The room out of reach this long (ms, while the page is seen and the phone online): an outage. */
export const OFFLINE_MS = 30_000;

let installed = false;
let context: () => ReportContext = () => ({ screen: "start", online: true });
let sent = 0;
const sentOnce = new Set<string>();

/** Where this page's files are, so another script's errors (an extension, the browser's own) are left out. */
const ours = (file: string) => !!file && file.startsWith(`${location.origin}${BASE}`);

/** The stack's lines from the game's own files, without the address's host or query, newest first. */
export function ownStack(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    // (a frame: "at f (…)" in Chrome, "f@…" in Safari and Firefox; not the message's own line)
    .filter((line) => /^\s*at\s|@/.test(line) && line.includes(`${BASE}/`))
    .map((line) => line.trim().replace(/(https?):\/\/[^/\s)]+/g, "").replace(/\?[^\s):]*/g, ""))
    .slice(0, 6)
    .join("\n");
}

/** Whether this page reports at all: the game's own page, over the web. */
export function reportable(): boolean {
  return (
    typeof location !== "undefined" &&
    /^https?:$/.test(location.protocol) &&
    location.pathname.startsWith(`${BASE}/`) &&
    typeof navigator !== "undefined"
  );
}

function send(kind: ReportKind, msg: string, stack: string, ms?: number) {
  if (sent >= MAX_REPORTS) return;
  const once = `${kind}|${msg.slice(0, 120)}|${stack.split("\n")[0] ?? ""}`;
  if (sentOnce.has(once)) return;
  sentOnce.add(once);
  sent += 1;
  let c: ReportContext;
  try {
    c = context();
  } catch {
    c = { screen: "start", online: true };
  }
  const body: ReportIn = {
    kind,
    msg: msg.slice(0, 300) || kind,
    stack: stack.slice(0, 1200) || undefined,
    ms,
    screen: c.screen,
    phase: c.phase,
    build: typeof __BUILD__ === "string" ? __BUILD__ : "dev",
    lang: c.lang,
  };
  const text = JSON.stringify(body);
  const url = `${BASE}/api/report`;
  try {
    // (As text: a simple request, text/plain, which a page about to close still sends. Not a Blob: in
    // the WebKit tests a Blob's beacon sent just after the page froze reached the server unreadable.)
    if (navigator.sendBeacon?.(url, text)) return;
  } catch {
    // fall through to fetch
  }
  fetch(url, { method: "POST", body: text, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
}

/** Start listening. `ctx` says what the page is doing when a report goes. */
export function installReports(ctx: () => ReportContext) {
  context = ctx;
  if (installed || !reportable()) return;
  installed = true;

  window.addEventListener("error", (e) => {
    if (!ours(e.filename)) return;
    // (the browser's note that a layout settled a frame late: harmless)
    if (/ResizeObserver loop/.test(e.message)) return;
    const err = e.error as { stack?: string } | undefined;
    send("error", e.message || String(e.error), ownStack(err?.stack) || `${e.filename.replace(/^.*\//, "")}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as unknown;
    const err = r instanceof Error ? r : null;
    const stack = ownStack(err?.stack);
    // An Error from somebody else's code (no line of the game's in it) is theirs to report.
    if (err && !stack && !(typeof DOMException !== "undefined" && r instanceof DOMException)) return;
    const msg = err ? `${err.name}: ${err.message}` : typeof r === "string" ? r : "unhandled rejection";
    send("rejection", msg, stack);
  });

  // The beat: once a second. One that comes over 6 s late, with the page in front of someone all the
  // while, is a page that froze. Hidden pages don't count (a locked phone, another app), nor waking up.
  // Nor a page that lost focus to something over it (an iPhone's Control Center holds a page's timers).
  let last = performance.now();
  let offline = 0;
  let away = false;
  const reset = () => {
    last = performance.now();
  };
  document.addEventListener("visibilitychange", reset);
  window.addEventListener("pageshow", reset);
  document.addEventListener("resume", reset);
  window.addEventListener("blur", () => {
    away = true;
  });
  window.addEventListener("focus", () => {
    away = false;
    reset();
  });
  setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    if (document.visibilityState !== "visible" || away) return;
    if (gap > FREEZE_MS && gap < ASLEEP_MS) send("freeze", `frozen ${Math.round(gap / 1000)} s`, "", Math.round(gap));
    let c: ReportContext | null = null;
    try {
      c = context();
    } catch {
      // no context: nothing to say about the connection
    }
    if (!c) return;
    if (!c.online && navigator.onLine !== false) offline += Math.min(gap, 2_000);
    else if (c.online) {
      // Back in touch after a long time out of it: say how long.
      if (offline >= OFFLINE_MS) send("offline", `offline ${Math.round(offline / 1000)} s`, "", Math.round(offline));
      offline = 0;
    }
  }, 1_000);
}
