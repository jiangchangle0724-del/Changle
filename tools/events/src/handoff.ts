// The libraries' hand-over. Vancouver's and Richmond's public libraries are on BiblioCommons, whose
// load balancer (AWS, "awselb/2.0") has answered 403 to the Worker since the first live run
// (2 November 2026). It refuses requests made by the Workers runtime, not cloud addresses: from one
// and the same address, with the same URL and headers, workerd got 403 and Node 200 (2 November).
// So every morning at 05:50 Vancouver time a GitHub job (.github/workflows/events-libraries.yml,
// scripts/libraries.ts) reads their pages with exactly the requests the run's steps make
// (fetchPages; it asks again after a 5xx) and hands each page to the Worker (receiveHandoff), which
// keeps it in KV for the day. At 06:00 a step of such a source reads its page from there
// (takeHandoff) and parses it as if it had fetched it; only for a page nothing was handed over for
// does it ask the library itself, and the run log says so (src/run.ts).
//
//   POST /go/api/handoff?source=vpl&date=2026-11-03&part=0
//   Authorization: Bearer <GitHub's sign-in token for the job (src/oidc.ts)>
//   body: the page, as the library sent it
//
// The job signs in with GitHub's own token, which the Worker checks against GitHub's public keys: no
// secret to set anywhere. A key (EVENTS_HANDOFF_KEY) also works, when the Worker has one: for runs
// outside GitHub (`npm run dev`, or by hand).
//
// One page a request, as one page is one step of the run: a page is 120 to 420 KB, and reading it
// takes about 1 ms of the free plan's 10 (a whole library in one request would be several MB).
import { readCapped, TooLarge } from "./body";
import { canAskGithub, githubToken, looksLikeToken, verifyGithubToken, type SignInVars } from "./oidc";
import { isBcPage } from "./parsers/bibliocommons";
import { MAX_BYTES, nextPart, requestOf, SOURCE_BY_ID, SOURCES, type SourceDef, type Window } from "./sources";
import { endMs, startMs } from "./store";
import { vanIso, vanParts, windowOf } from "./time";

/** The sources whose pages are handed over: Vancouver's and Richmond's libraries. */
export const HANDOFF_SOURCES: SourceDef[] = SOURCES.filter((s) => s.handoff);
/** A page handed over is kept two days: the run reads it the same morning; yesterday's stays to look at. */
export const HANDOFF_TTL = 2 * 86_400;
/** A larger page is refused (413): the biggest seen is 420 KB, and reading 2 MB of JSON takes about 5 ms. */
export const HANDOFF_MAX_BYTES = 2_000_000;

/** Where a source's page is kept for a day's run (KV): `handoff:2026-11-03:vpl:0`. */
export const handoffKey = (date: string, source: string, part: number) => `handoff:${date}:${source}:${part}`;

interface Kept {
  /** When the Worker got it: Vancouver time, "2026-11-03T05:51:07-07:00". */
  at: string;
}

/** Keep a page for the day's run. Handing the same page over again the same day replaces it. */
export async function keepHandoff(kv: KVNamespace, date: string, source: string, part: number, raw: string, now = Date.now()): Promise<void> {
  const meta: Kept = { at: vanIso(now) };
  await kv.put(handoffKey(date, source, part), raw, { expirationTtl: HANDOFF_TTL, metadata: meta });
}

/** The page handed over for this day's run and part, or null when none was. */
export async function takeHandoff(kv: KVNamespace, date: string, source: string, part: number): Promise<{ raw: string; at: string | null } | null> {
  const { value, metadata } = await kv.getWithMetadata<Kept>(handoffKey(date, source, part), "text");
  return value === null ? null : { raw: value, at: metadata?.at ?? null };
}

// ---- The Worker's side: POST /go/api/handoff ----

const reply = (body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

/** A refusal: the answer says why (never anything of the key or token itself), and so does the Worker's log. */
function refuse(status: number, error: string, headers: Record<string, string> = {}): Response {
  console.warn(JSON.stringify({ message: "handoff refused", status, error }));
  return reply({ error }, status, headers);
}

/** The request's key against the Worker's, in constant time: both are hashed first, so not even the length shows. */
async function keyMatches(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Who signed in: the GitHub job (and its run, for the log), or someone with the Worker's key; or why no one did. */
type SignedIn = { by: "github"; run: string | null } | { by: "key" } | { status: 401 | 503; error: string };

/**
 * Who hands a page over: GitHub's events-libraries job, by GitHub's sign-in token (src/oidc.ts), or
 * anyone with the Worker's key, when it has one. A credential with a token's shape that isn't the key
 * is checked as a token; any other is a key.
 */
async function signIn(given: string | undefined, env: Env, now: number): Promise<SignedIn> {
  if (!given) return { status: 401, error: "no key or GitHub token" };
  if (env.EVENTS_HANDOFF_KEY && (await keyMatches(given, env.EVENTS_HANDOFF_KEY))) return { by: "key" };
  if (looksLikeToken(given)) {
    const verdict = await verifyGithubToken(given, env.CACHE, now);
    if (!verdict.ok) return { status: verdict.status, error: `GitHub token: ${verdict.error}` };
    return { by: "github", run: typeof verdict.claims.run_id === "string" ? verdict.claims.run_id : null };
  }
  return { status: 401, error: env.EVENTS_HANDOFF_KEY ? "wrong key" : "EVENTS_HANDOFF_KEY is not set on the Worker" };
}

/** Why a body can't be a page the run reads, or null when it can. */
function notAPage(raw: string): string | null {
  let page: unknown;
  try {
    page = JSON.parse(raw);
  } catch {
    return "body: not JSON";
  }
  return isBcPage(page) ? null : "body: not a BiblioCommons events page";
}

/**
 * A page from the GitHub job. 401 without GitHub's sign-in token for the job, or the Worker's key
 * (when it has one), saying which check failed; 503 while GitHub's keys can't be had to check a token;
 * 400 for a source that isn't handed over, a date that isn't today in Vancouver, a part out of range,
 * or a body that isn't a library's events page; 413 above HANDOFF_MAX_BYTES. Otherwise it's kept for
 * the day's run (200).
 */
export async function receiveHandoff(req: Request, env: Env, now = Date.now()): Promise<Response> {
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405, { allow: "POST" });
  const given = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const who = await signIn(given, env, now);
  if ("error" in who) return refuse(who.status, who.error, who.status === 401 ? { "www-authenticate": "Bearer" } : {});

  const q = new URL(req.url).searchParams;
  const src = SOURCE_BY_ID[q.get("source") ?? ""];
  if (!src?.handoff) return refuse(400, `source: one of ${HANDOFF_SOURCES.map((s) => s.id).join(", ")}`);
  const date = vanParts(now).date;
  if (q.get("date") !== date) return refuse(400, `date: today in Vancouver, ${date}`);
  const partText = q.get("part") ?? "";
  const part = Number(partText);
  if (!/^\d{1,3}$/.test(partText) || part >= src.maxParts) return refuse(400, `part: 0 to ${src.maxParts - 1}`);

  let raw: string;
  try {
    raw = await readCapped(req, HANDOFF_MAX_BYTES);
  } catch (e) {
    return e instanceof TooLarge ? refuse(413, `body: over ${HANDOFF_MAX_BYTES} bytes`) : refuse(400, "body: couldn't be read");
  }
  const why = notAPage(raw);
  if (why) return refuse(400, why);
  try {
    await keepHandoff(env.CACHE, date, src.id, part, raw, now);
  } catch (e) {
    return refuse(503, `couldn't keep it: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
  }
  console.log(JSON.stringify({ message: "handoff kept", source: src.id, date, part, bytes: raw.length, by: who.by, ...("run" in who ? { run: who.run } : {}) }));
  return reply({ ok: true, source: src.id, date, part, bytes: raw.length }, 200);
}

// ---- The GitHub job's side (scripts/libraries.ts) ----

/** How the job reaches a site: fetch, or a test's stand-in. */
export type Get = (url: string, init: RequestInit) => Promise<Response>;

export interface Page {
  part: number;
  /** The page as the library sent it. */
  raw: string;
  /** Events on it, and how many of them the run would store (in its 14 days), as its log counts them. */
  found: number;
  inWindow: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Tries for a page that fails for now (HTTP 5xx or 429, or no answer), 5 and then 10 seconds
 * apart: the library answers 500 now and then (Vancouver's page 12, on 2 November). A refusal
 * (403 and other 4xx) isn't asked again.
 */
export const TRIES = 3;

/**
 * A source's pages for the run of `date`, read exactly as the run's steps read them: the same
 * requests (requestOf), page after page while the parser says there's more (nextPart), the same size
 * limit. One request a second. On a page that fails (after TRIES), it stops: the pages before it,
 * and why. Those are still worth handing over: the run reads them, then asks for the rest itself,
 * just as it would have had it met the same failure.
 */
export async function fetchPages(src: SourceDef, date: string, get: Get, pause: (ms: number) => Promise<void> = wait): Promise<{ pages: Page[]; error: string | null }> {
  const w = windowOf(date);
  const win: Window = { runId: date, fromMs: w.fromMs, toMs: w.toMs };
  const pages: Page[] = [];
  for (let part: number | null = 0; part !== null; ) {
    const { url, headers } = requestOf(src, part, {}, win);
    let raw: string | null = null;
    let why = "";
    let tries = 0;
    while (raw === null && tries < TRIES) {
      await pause(tries === 0 ? 1000 : 5000 * tries);
      tries++;
      try {
        const res = await get(url, { headers, redirect: "follow" });
        if (res.ok) {
          raw = await readCapped(res, MAX_BYTES);
        } else {
          why = `HTTP ${res.status} from ${new URL(url).host}`;
          await res.body?.cancel();
          if (res.status < 500 && res.status !== 429) break;
        }
      } catch (e) {
        why = message(e);
        if (e instanceof TooLarge) break;
      }
    }
    if (raw === null) return { pages, error: `${src.id} part ${part}: ${why}${tries > 1 ? ` (${tries} tries)` : ""}` };
    try {
      const { events, more } = await src.parse(raw, part, win);
      const inWindow = events.filter((e) => startMs(e) < win.toMs && endMs(e) >= win.fromMs).length;
      pages.push({ part, raw, found: events.length, inWindow });
      part = nextPart(src, part, more);
    } catch (e) {
      return { pages, error: `${src.id} part ${part}: ${message(e)}` };
    }
  }
  return { pages, error: null };
}

/** The address a page is handed over to: the endpoint, with the source, the run's date and the part. */
export function handoffUrl(endpoint: string, source: string, date: string, part: number): string {
  const u = new URL(endpoint);
  u.searchParams.set("source", source);
  u.searchParams.set("date", date);
  u.searchParams.set("part", String(part));
  return u.toString();
}

/**
 * How the job signs in to the Worker: with the key, when one is set (a run outside GitHub); else with
 * GitHub's sign-in token, on GitHub; null when it can't.
 */
export function signInWith(vars: SignInVars): "key" | "github" | null {
  return vars.EVENTS_HANDOFF_KEY ? "key" : canAskGithub(vars) ? "github" : null;
}

/**
 * What the job hands pages over with: the key when one is set, else a token GitHub gives it now (a
 * token lasts minutes: the job asks for one for each library, just before handing its pages over).
 */
export async function handoffCredential(vars: SignInVars, get: Get): Promise<string> {
  return vars.EVENTS_HANDOFF_KEY || githubToken(vars, get);
}

/** Hand a page to the Worker, signed in with `credential`. Throws, with the Worker's answer, when it's refused. */
export async function handOver(post: Get, endpoint: string, credential: string, source: string, date: string, page: Page): Promise<void> {
  const res = await post(handoffUrl(endpoint, source, date, page.part), {
    method: "POST",
    headers: { authorization: `Bearer ${credential}`, "content-type": "application/json; charset=utf-8" },
    body: page.raw,
  });
  const answer = await res.text();
  if (!res.ok) throw new Error(`${source} part ${page.part}: the Worker said ${res.status} ${answer.slice(0, 300)}`);
}
