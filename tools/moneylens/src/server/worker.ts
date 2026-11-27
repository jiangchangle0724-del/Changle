/**
 * MoneyLens's server: one Worker on money.changle.ca (D2), and nothing else on that origin.
 *
 * What is decided is not decided here. This file reads a request, refuses what may not come in
 * at all, and hands the rest to the plain functions that hold the rules: request.ts (cookies,
 * the Origin), gate.ts (who is let in, and the quotas), account.ts (one person's sessions, vault
 * and events), sessions.ts, chunks.ts, registry.ts. Those are tested on Node's SQLite; this file
 * is tested on Cloudflare's own runtime (tests/platform/server.test.ts).
 *
 * A request's way in:
 *
 * - `GET /enter` starts a sign-in: a nonce in a cookie only this origin can set, and on to the
 *   main site, which asks the accounts service for a handoff code bound to that nonce and sends
 *   the browser back with it (ARCH-3).
 * - Everything else is `POST /api/...`, and is refused unless its `Origin` is exactly the one
 *   this Worker is set to answer on (SEC-4; the expected origin is a setting, never read off the
 *   request), the gate is open (SEC-10), its body is of the stated kind and no longer than that
 *   kind may be (SEC-5).
 * - `POST /api/session` trades the code, here, server to server, and checks the nonce the code
 *   was bound to against the cookie. Then the account is noted in the registry, and a session is
 *   opened in that account's own Durable Object with a token made here (flows.ts has the steps
 *   and why they come in that order). The code, the nonce and the token are never logged.
 * - Any other request names its account in its cookie. That name is an address and nothing more
 *   (ISO-2): the request goes to that account's object, which checks the token. The body is
 *   handed on unread, as a stream: a Worker on the Free plan has ten milliseconds of processor
 *   time for a request (LIM-1), and a push can be eight megabytes.
 *
 * No answer may be kept by anything in between (`no-store`), framed by anyone, or read as
 * anything but what it says it is (SEC-1). No `Access-Control-*` header is ever sent.
 *
 * `Internal` is the other way in, for the accounts service alone, over a service binding: an
 * account deleted there is emptied here, and an account whose email changed is signed out
 * (flows.ts again).
 */
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { newId } from "../core/ids";
import { LIMITS } from "../vault/protocol";
import { ACTIONS, act, proofsIn, sessionFor, signEveryoneOut, signIn, type Answer, type SignIn } from "./account";
import type { Db } from "./chunks";
import { accountChanged, accountGone, signInHere, tradeCode, type Doors, type Entered } from "./flows";
import { configOf, type Config, type Settings } from "./gate";
import { countAccounts, forgetAccount, noteAccount, registryTables, setStamp, stampOf } from "./registry";
import { fromOurOrigin, isAccount, labelOf, noCookie, NONCE_COOKIE, nonceCookie, readNonce, readSession, SESSION_COOKIE, sessionCookie } from "./request";
import { hashOf, newToken } from "./sessions";
import { HEAD_MAX } from "./wire";

/** What the accounts service offers MoneyLens (site/worker, the `Handoff` entrypoint; docs/moneylens/accounts-requests.md). */
type Accounts = {
  redeem(code: string, aud: string): Promise<{ id: string; master: boolean; nonce: string } | null>;
  exists(ids: string[]): Promise<string[]>;
};

export interface Env extends Settings {
  VAULTS: DurableObjectNamespace<VaultDO>;
  REGISTRY: DurableObjectNamespace<Registry>;
  ACCOUNTS: Accounts;
}

/** The objects as flows.ts reaches them: the registry (one for all), the accounts service, and each account's own. */
function doorsOf(env: Env): Doors {
  const registry = () => env.REGISTRY.get(env.REGISTRY.idFromName("registry"));
  const vault = (account: string) => env.VAULTS.get(env.VAULTS.idFromName(account));
  return {
    stampNow: () => registry().stampNow(),
    newStamp: () => registry().newStamp(),
    note: (account) => registry().note(account),
    forget: (account) => registry().forget(account),
    redeem: (code) => env.ACCOUNTS.redeem(code, "moneylens"),
    exists: async (account) => (await env.ACCOUNTS.exists([account])).includes(account),
    signIn: (made, stamp) => vault(made.account).signIn({ ...made, stamp }),
    signEveryoneOut: (account) => vault(account).signEveryoneOut(),
    erase: (account) => vault(account).erase(),
  };
}

/** The longest body of a request that is not a push: a code, an id, a vault's name. */
const SMALL = 4096;
/** A push at its largest: its blobs and its head. */
const PUSH_MAX = LIMITS.batchBytes + HEAD_MAX;
const JSON_TYPE = "application/json";
const BYTES_TYPE = "application/octet-stream";

/** On every answer (SEC-1). The policy is that of an answer with nothing to load: the app's pages will bring their own. */
const HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function reply(status: number, body: BodyInit | null, type: string | null, cookies: readonly string[] = [], more: Readonly<Record<string, string>> = {}): Response {
  const headers = new Headers({ ...HEADERS, ...more });
  if (type) headers.set("Content-Type", type);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(body, { status, headers });
}
const json = (status: number, value: object, cookies: readonly string[] = []): Response => reply(status, JSON.stringify(value), `${JSON_TYPE}; charset=utf-8`, cookies);
const refuse = (status: number, why: string, cookies: readonly string[] = []): Response => json(status, { ok: false, why }, cookies);

/** The page for a gate that is shut: two lines of text, and nothing to load. */
const SHUT = `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>心里有数 · MoneyLens</title><p>心里有数还没有开放。</p><p lang="en">MoneyLens is not open yet.</p></html>`;

/** The body's stated length, as a count; null when it states none or states nonsense. */
function lengthOf(request: Request): number | null {
  const stated = request.headers.get("Content-Length");
  return stated !== null && /^\d{1,9}$/.test(stated) ? Number(stated) : null;
}
const typed = (request: Request, type: string): boolean => (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase() === type;

/** What is wrong with a body's kind and length, or null. */
function unfit(request: Request, type: string, most: number): Response | null {
  if (!typed(request, type)) return refuse(415, "content-type");
  const length = lengthOf(request);
  if (length === null) return refuse(411, "length");
  return length > most ? refuse(413, "too-big") : null;
}

async function route(request: Request, env: Env): Promise<Response> {
  const config = configOf(env);
  if (!config) return refuse(503, "not-set-up");
  const path = new URL(request.url).pathname;
  if (path === "/enter") return enter(request, config);
  if (!path.startsWith("/api/")) return refuse(404, "no-such-thing");
  if (request.method !== "POST") return reply(405, JSON.stringify({ ok: false, why: "post-only" }), `${JSON_TYPE}; charset=utf-8`, [], { Allow: "POST" });
  if (!fromOurOrigin(request.headers, config.origin)) return refuse(403, "origin");
  if (config.gate.mode === "closed") return refuse(403, "closed");
  const action = path.slice("/api/".length);
  if (action === "session") return trade(request, env, config);
  if (!ACTIONS.includes(action)) return refuse(404, "no-such-thing");
  const signedOut = [noCookie(SESSION_COOKIE)];
  const cookie = readSession(request.headers.get("Cookie"));
  if (!cookie) return refuse(401, "signed-out", signedOut);
  // (with a list, an account that is not on it reaches no database at all)
  if (config.gate.mode === "list" && !config.gate.accounts.has(cookie.account)) return refuse(403, "not-admitted", signedOut);
  const push = action === "sync/push";
  const wrong = unfit(request, push ? BYTES_TYPE : JSON_TYPE, push ? PUSH_MAX : SMALL);
  if (wrong) return wrong;
  const hash = await hashOf(cookie.token);
  if (!hash) return refuse(401, "signed-out", signedOut);
  // To that account's own database, and no other. The body goes on as it came, unread.
  const answer = await env.VAULTS.get(env.VAULTS.idFromName(cookie.account)).fetch(`https://vault.internal/${action}`, {
    method: "POST",
    headers: { "x-ml-account": cookie.account, "x-ml-hash": hash, "Content-Length": String(lengthOf(request)) },
    body: request.body,
  });
  return reply(answer.status, answer.body, answer.headers.get("Content-Type"), answer.headers.get("x-ml-signed-out") ? signedOut : []);
}

/** Starts a sign-in: the nonce goes into a cookie here and, with the browser, to the main site. */
function enter(request: Request, config: Config): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return reply(405, JSON.stringify({ ok: false, why: "get-only" }), `${JSON_TYPE}; charset=utf-8`, [], { Allow: "GET, HEAD" });
  if (config.gate.mode === "closed") return reply(403, SHUT, "text/html; charset=utf-8");
  const nonce = newToken();
  const cookie = nonceCookie(nonce);
  if (!cookie) return refuse(500, "unavailable");
  return reply(302, null, null, [cookie], { Location: `${config.home}/tools/finance?handoff=${nonce}` });
}

/** Trades a handoff code for a session (ARCH-3, T-3). */
async function trade(request: Request, env: Env, config: Config): Promise<Response> {
  const wrong = unfit(request, JSON_TYPE, SMALL);
  if (wrong) return wrong;
  // a sign-in starts at /enter: without the cookie from there, nothing is traded
  const nonce = readNonce(request.headers.get("Cookie"));
  if (!nonce) return refuse(400, "no-nonce");
  const over = [noCookie(NONCE_COOKIE)];
  let code: unknown;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    code = bytes.length <= SMALL ? (JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as { code?: unknown } | null)?.code : undefined;
  } catch {
    code = undefined;
  }
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(code)) return refuse(400, "bad-request", over);
  // The token is made here and its hash goes on; the token itself goes to the browser, and only if the trade says ok.
  const token = newToken();
  const hash = await hashOf(token);
  if (!hash) return refuse(500, "unavailable", over);
  const traded = await tradeCode(doorsOf(env), { code, nonce, gate: config.gate, session: newId(), hash, label: labelOf(request.headers.get("User-Agent")) });
  if (!traded.ok) return refuse(traded.status, traded.why, over);
  const cookie = sessionCookie(traded.account, token);
  return cookie ? json(200, { ok: true }, [cookie, ...over]) : refuse(500, "unavailable", over);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (e) {
      // (the kind of error only: a message can quote what was being handled, OBS-1)
      console.error("moneylens: request failed", e instanceof Error ? e.name : typeof e);
      return refuse(500, "unavailable");
    }
  },
} satisfies ExportedHandler<Env>;

const dbOf = (storage: DurableObjectStorage): Db => ({ sql: storage.sql as unknown as Db["sql"], atomically: (work) => storage.transactionSync(work) });

/** One person's MoneyLens: the object's own SQLite database, and the functions of account.ts on it (ISO-1). */
export class VaultDO extends DurableObject<Env> {
  /** How many times a notice has done its work here since this object was loaded (flows.ts, `signInHere`). */
  private noticed = 0;

  /**
   * From the Worker, once a handoff code has been traded for this account. `stamp` is the registry's stamp as the
   * Worker read it before it traded the code: the session is opened only if no notice came since (flows.ts).
   */
  async signIn(made: SignIn & { stamp: string }): Promise<Entered> {
    const config = configOf(this.env);
    if (!config) return "refused";
    return signInHere(
      {
        noticed: () => this.noticed,
        stampNow: () => this.env.REGISTRY.get(this.env.REGISTRY.idFromName("registry")).stampNow(),
        open: () => signIn(dbOf(this.ctx.storage), made, Date.now(), config.gate),
      },
      made?.stamp,
    );
  }

  /** From `Internal`: the account's email address changed. */
  signEveryoneOut(): void {
    this.noticed++;
    signEveryoneOut(dbOf(this.ctx.storage), Date.now());
  }

  /** From `Internal`: the account is gone, and so is everything here. */
  async erase(): Promise<void> {
    this.noticed++;
    await this.ctx.storage.deleteAll();
  }

  /** Every request that comes with a session. */
  async fetch(request: Request): Promise<Response> {
    let answer: Answer;
    try {
      const config = configOf(this.env);
      const [account, hash] = [request.headers.get("x-ml-account") ?? "", request.headers.get("x-ml-hash") ?? ""];
      const action = new URL(request.url).pathname.slice(1);
      const db = dbOf(this.ctx.storage);
      if (!config) answer = { status: 503, json: { ok: false, why: "not-set-up" } };
      else {
        // Before the body is read: whoever has no session here does not get megabytes held for them.
        const first = sessionFor(db, { account, hash }, Date.now(), config.gate);
        if ("status" in first) answer = first;
        else {
          const body = new Uint8Array(await request.arrayBuffer());
          const fits = body.length <= (action === "sync/push" ? PUSH_MAX : SMALL);
          // (a proof the body carries is hashed here, since hashing waits: `act` is given the hash)
          const proofs = fits ? await proofsIn(action, body) : [];
          // From here to the answer nothing waits: the session is checked again, and the thing is done.
          if (!fits) answer = { status: 413, json: { ok: false, why: "too-big" } };
          else if (!proofs) answer = { status: 400, json: { ok: false, why: "bad-request" } };
          else answer = act(db, { account, hash, action, body, proofs }, Date.now(), config);
        }
      }
    } catch (e) {
      // A database that cannot be read is an answer of "unavailable", and nothing done.
      console.error("moneylens: vault failed", e instanceof Error ? e.name : typeof e);
      answer = { status: 500, json: { ok: false, why: "unavailable" } };
    }
    const headers = new Headers({ "Content-Type": answer.bytes ? BYTES_TYPE : `${JSON_TYPE}; charset=utf-8` });
    if (answer.signedOut) headers.set("x-ml-signed-out", "1");
    return new Response(answer.bytes ?? JSON.stringify(answer.json ?? {}), { status: answer.status, headers });
  }
}

/** The accounts that have signed in (registry.ts). One object for all of them, named "registry". */
export class Registry extends DurableObject<Env> {
  private open(): Db {
    const db = dbOf(this.ctx.storage);
    registryTables(db);
    return db;
  }
  note(id: string): boolean {
    return noteAccount(this.open(), id, Date.now());
  }
  forget(id: string): void {
    forgetAccount(this.open(), id);
  }
  count(): number {
    return countAccounts(this.open());
  }
  /** The stamp as it stands, and a new one (registry.ts, flows.ts). */
  stampNow(): string {
    return stampOf(this.open());
  }
  newStamp(): void {
    setStamp(this.open(), newId());
  }
}

/**
 * For the accounts service alone (a service binding to this entrypoint; no address leads here). Both throw when the
 * work could not be done, so that the caller tries again, and both do nothing, without complaint, for an account
 * that was never here. Doing either twice is doing it once.
 */
export class Internal extends WorkerEntrypoint<Env> {
  /** The changle.ca account was deleted: everything MoneyLens holds of it goes (ARCH-10). */
  async accountGone(id: string): Promise<void> {
    if (!isAccount(id)) throw new Error("not an account");
    await accountGone(doorsOf(this.env), id);
  }

  /** The account's email address changed: everyone signs in again (ARCH-9). */
  async accountChanged(id: string): Promise<void> {
    if (!isAccount(id)) throw new Error("not an account");
    await accountChanged(doorsOf(this.env), id);
  }

  /** How many accounts have signed in to MoneyLens and are still noted: a number, and nothing about any of them (ADM-1). */
  async count(): Promise<number> {
    return this.env.REGISTRY.get(this.env.REGISTRY.idFromName("registry")).count();
  }
}
