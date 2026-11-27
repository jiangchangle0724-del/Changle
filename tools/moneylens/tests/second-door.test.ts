/**
 * C10 independent review (the door, at 342bbbb3): the reviewer's own tests, not the author's.
 *
 * Most of these go through the real Worker (src/server/worker.ts, bundled as it is) and the real
 * `VaultDO` and `Registry` classes on Node's SQLite, with the device's own code (src/app/door.ts)
 * asking over a stand-in `fetch` that carries the cookies a browser would. Only `cloudflare:workers`,
 * the transport between objects, the accounts service and the rate limiters are stand-ins. The
 * author's tests run the same rules as plain functions; these check that the pieces still hold
 * once they are put together.
 *
 * Tests marked `todo` show a finding of the review (docs/moneylens/reviews/door.md) and fail while
 * it stands. Every other test pins behaviour the review checked and found right, or found as the
 * documents say.
 *
 * Every account id, code, token, passphrase and blob here is invented.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { newId } from "../src/core/ids";
import { askOver, draft, keep, leave, open, standing, type Ask } from "../src/app/door";
import { act, proofsIn, signIn } from "../src/server/account";
import type { Db } from "../src/server/chunks";
import { configOf } from "../src/server/gate";
import { addressKey } from "../src/server/request";
import { hashOf, newToken } from "../src/server/sessions";
import { startWays, tryUnlock, wayTables } from "../src/server/ways";
import { packPush } from "../src/server/wire";
import { sqlite } from "./sqlremote";
import { workerModule } from "./workermod";

const ORIGIN = "https://money.changle.test";
const OWNER = "uinventedowner1";
const PASSPHRASE = "eleven quiet herons fold maps";
const FROM = "203.0.113.50";

type Storage = { sql: Db["sql"]; transactionSync: Db["atomically"]; deleteAll(): Promise<void> };
type Vault = { signIn(made: unknown): Promise<string>; signEveryoneOut(): void; erase(): Promise<void>; fetch(request: Request): Promise<Response> };
type Shell = {
  default: { fetch(request: Request, env: object): Promise<Response> };
  VaultDO: new (ctx: { storage: Storage }, env: object) => Vault;
  Registry: new (ctx: { storage: Storage }, env: object) => { note(id: string): boolean; forget(id: string): void; count(): number; stampNow(): string; newStamp(): void };
  Internal: new (ctx: object, env: object) => { accountGone(id: string): Promise<void>; accountChanged(id: string): Promise<void> };
};
const shell = workerModule() as Promise<Shell>;

function storageOf(db: ReturnType<typeof sqlite>): Storage {
  return {
    sql: db.sql,
    transactionSync: (work) => db.atomically(work),
    async deleteAll() {
      for (const row of db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) db.raw.exec(`DROP TABLE "${String((row as { name: string }).name)}"`);
    },
  };
}

/** The Worker, its objects and a stand-in accounts service; `browser()` is a browser with its own cookie jar. */
async function world(vars: Record<string, string> = {}) {
  const { default: worker, VaultDO, Registry, Internal } = await shell;
  const stores = new Map<string, ReturnType<typeof sqlite>>();
  const vaults = new Map<string, Vault>();
  const codes = new Map<string, { id: string; master: boolean; nonce: string }>();
  const keys: string[] = [];
  const limiter = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: true }) };
  const env: Record<string, unknown> = {
    ORIGIN,
    GATE: "owner",
    ALLOWED_ACCOUNTS: OWNER,
    ...vars,
    TRADES: limiter,
    ASKS: limiter,
    ASSETS: { fetch: async () => new Response("the page", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }) },
    ACCOUNTS: {
      async redeem(code: string) {
        const stood = codes.get(code) ?? null;
        codes.delete(code);
        return stood;
      },
      async exists(ids: string[]) {
        return ids;
      },
    },
  };
  const registryDb = sqlite();
  const registry = new Registry({ storage: storageOf(registryDb) }, env);
  const vault = (id: string): Vault => {
    if (!vaults.has(id)) {
      const db = sqlite();
      stores.set(id, db);
      vaults.set(id, new VaultDO({ storage: storageOf(db) }, env));
    }
    return vaults.get(id)!;
  };
  env.REGISTRY = {
    idFromName: (name: string) => name,
    get: () => ({
      note: async (id: string) => registry.note(id),
      forget: async (id: string) => registry.forget(id),
      count: async () => registry.count(),
      stampNow: async () => registry.stampNow(),
      newStamp: async () => registry.newStamp(),
    }),
  };
  env.VAULTS = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      signIn: (made: unknown) => vault(id).signIn(made),
      signEveryoneOut: async () => vault(id).signEveryoneOut(),
      erase: () => vault(id).erase(),
      fetch: (url: string, init: RequestInit) => vault(id).fetch(new Request(url, { ...init, duplex: "half" } as RequestInit)),
    }),
  };
  const internal = new Internal({}, env);
  /** A browser: a cookie jar, and requests to this origin as the app's page sends them. */
  function browser(from = FROM) {
    const jar = new Map<string, string>();
    const send = async (path: string, init: { method?: string; body?: string | Uint8Array; type?: string } = {}): Promise<Response> => {
      const body = init.body ?? (init.method === "GET" ? undefined : "{}");
      const headers: Record<string, string> = { Origin: ORIGIN, "CF-Connecting-IP": from };
      if (jar.size) headers.Cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      if (body !== undefined) {
        headers["Content-Type"] = init.type ?? "application/json";
        headers["Content-Length"] = String(typeof body === "string" ? new TextEncoder().encode(body).length : body.length);
      }
      const answer = await worker.fetch(new Request(`${ORIGIN}${path}`, { method: init.method ?? "POST", headers, body: body as BodyInit | undefined, redirect: "manual" }), env);
      for (const line of answer.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const at = pair!.indexOf("=");
        const [name, value] = [pair!.slice(0, at), pair!.slice(at + 1)];
        if (/Max-Age=0/.test(line)) jar.delete(name);
        else jar.set(name, value);
      }
      return answer;
    };
    /** The way in: /enter, then the main site's code for this account, then the trade. */
    const signInAs = async (id: string, master = true): Promise<number> => {
      await send("/enter", { method: "GET" });
      const nonce = jar.get("__Host-ml-n")!;
      const code = newToken();
      codes.set(code, { id, master, nonce });
      return (await send("/api/session", { body: JSON.stringify({ code }) })).status;
    };
    /** door.ts's own way of asking, over this browser. */
    const ask: Ask = askOver(async (input, init) => send(new URL(String(input), ORIGIN).pathname, { body: String(init?.body ?? "{}") }), "/api");
    return { jar, send, signInAs, ask };
  }
  const dump = (id: string): string => {
    const db = stores.get(id);
    if (!db) return "";
    const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    return tables.map(({ name }) => JSON.stringify(db.raw.prepare(`SELECT * FROM "${name}"`).all(), (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("base64") : v))).join("\n");
  };
  const table = (id: string, query: string) => stores.get(id)!.raw.prepare(query).all() as Record<string, unknown>[];
  return { env, browser, internal, keys, dump, table, restart: (id: string) => vaults.set(id, new VaultDO({ storage: storageOf(stores.get(id)!) }, env)) };
}

const bodyOf = async (answer: Response): Promise<Record<string, unknown>> => (await answer.json()) as Record<string, unknown>;
const pushOne = (vault: string) => packPush(vault, [{ id: newId(), base: 0, blob: new Uint8Array(64).fill(9) }]);

// ---------------------------------------------------------------------------------------------
// The ways in, through the Worker and the objects, with real keys, wrappers and proofs
// ---------------------------------------------------------------------------------------------

test("the whole door through the Worker: a vault made on one browser, a second browser reads nothing until it shows a proof", async () => {
  const w = await world();
  const one = w.browser();
  assert.equal(await one.signInAs(OWNER), 200);
  assert.deepEqual(await standing(one.ask), { at: "no-vault" });
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  // (the body of a real vault/start, both ways in, fits the 4096 bytes a small request may have, with room)
  const startBytes = JSON.stringify({ vault: made.draft.vault.id, ways: made.draft.ways }).length;
  assert.ok(startBytes < 2500, `vault/start is ${startBytes} bytes`);
  assert.equal(await keep(one.ask, made.draft), "ok");
  assert.equal((await one.send("/api/sync/push", { body: pushOne(made.draft.vault.id), type: "application/octet-stream" })).status, 200);

  const two = w.browser("198.51.100.20");
  assert.equal(await two.signInAs(OWNER), 200);
  const stands = await standing(two.ask);
  assert.ok(stands.at === "vault" && stands.unlocked === false && stands.kinds.sort().join() === "passphrase,recovery");
  // nothing sealed, and no wrapper, for a session that has shown no proof
  for (const [path, body, type] of [
    ["/api/sync/pull", JSON.stringify({ vault: made.draft.vault.id, since: 0 }), "application/json"],
    ["/api/sync/push", pushOne(made.draft.vault.id), "application/octet-stream"],
  ] as const)
    assert.equal((await two.send(path, { body, type })).status, 423, path);
  const wrapped = made.draft.ways.map((way) => String((way.wrapper as unknown as { wrapped: string }).wrapped));
  for (const [path, body] of [
    ["/api/vault", "{}"],
    ["/api/vault/way", JSON.stringify({ kind: "passphrase" })],
    ["/api/vault/way", JSON.stringify({ kind: "recovery" })],
    ["/api/vault/way", JSON.stringify({ id: made.draft.ways[0]!.wrapper.id })],
    ["/api/events", "{}"],
    ["/api/sessions", "{}"],
    ["/api/vault/unlock", JSON.stringify({ id: made.draft.ways[0]!.wrapper.id, proof: newToken() })],
  ] as const) {
    const text = await (await two.send(path, { body })).text();
    for (const secret of wrapped) assert.equal(text.includes(secret), false, `${path} handed out a wrapper`);
  }
  // a wrong passphrase is one try; the right one opens and is never one
  assert.deepEqual(await open(two.ask, made.draft.vault.id, { kind: "passphrase", passphrase: "eleven quiet herons fold mapz" }), { ok: false, why: "wrong-secret", left: 8 });
  const opened = await open(two.ask, made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.ok(opened.ok && opened.vault.id === made.draft.vault.id);
  assert.equal((await two.send("/api/sync/pull", { body: JSON.stringify({ vault: made.draft.vault.id, since: 0 }) })).status, 200);
  const byCode = await open(two.ask, made.draft.vault.id, { kind: "recovery", code: made.draft.recoveryCode });
  assert.ok(byCode.ok);
  // (two wrong: the made-up proof sent above, and the wrong passphrase; the three right ones are not tries)
  assert.equal(w.table(OWNER, "SELECT COUNT(*) AS n FROM tries")[0]!.n, 2, "a right proof was counted");
  // what the server keeps of a proof is its hash: no proof, and no passphrase or code, is anywhere in the database
  const all = w.dump(OWNER);
  for (const way of made.draft.ways) assert.equal(all.includes(way.proof), false, "a proof is kept as it was shown");
  assert.equal(all.includes(PASSPHRASE) || all.includes(made.draft.recoveryCode), false);
  assert.match(JSON.stringify(w.table(OWNER, "SELECT kind FROM events ORDER BY n")), /vault-started.*unlock-failed.*unlocked.*unlocked/);
});

test("a session cannot unlock itself, or put its own ways in, by starting the vault it was told of, or another", async () => {
  const w = await world();
  const one = w.browser();
  await one.signInAs(OWNER);
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(one.ask, made.draft), "ok");
  const before = JSON.stringify(w.table(OWNER, "SELECT * FROM ways ORDER BY id"));
  const two = w.browser("198.51.100.21");
  await two.signInAs(OWNER);
  const theirs = await draft("a different long passphrase of mine");
  assert.ok(theirs.ok);
  // the same vault's id with ways of its own: the same answer as before, and nothing more
  const same = await two.send("/api/vault/start", { body: JSON.stringify({ vault: made.draft.vault.id, ways: theirs.draft.ways.map((way) => ({ ...way, wrapper: { ...way.wrapper, vault: made.draft.vault.id } })) }) });
  assert.equal(same.status, 200);
  assert.equal(JSON.stringify(w.table(OWNER, "SELECT * FROM ways ORDER BY id")), before);
  assert.equal((await two.send("/api/sync/pull", { body: JSON.stringify({ vault: made.draft.vault.id, since: 0 }) })).status, 423);
  assert.equal((await bodyOf(await two.send("/api/vault"))).unlocked, false);
  // its own vault: refused
  assert.equal(await keep(two.ask, theirs.draft), "another");
  assert.equal(JSON.stringify(w.table(OWNER, "SELECT * FROM ways ORDER BY id")), before);
  // and the maker asking again stays as it was: unlocked (finding 4: 1.10 says otherwise)
  assert.equal(await keep(one.ask, made.draft), "ok");
  assert.equal((await bodyOf(await one.send("/api/vault"))).unlocked, true);
});

/** A vault with ways in whose proofs are random tokens (the server does not look inside a wrapper), made by the first browser. */
async function fakeVault(w: Awaited<ReturnType<typeof world>>) {
  const maker = w.browser();
  await maker.signInAs(OWNER);
  const vault = newId();
  const ways = (["passphrase", "recovery"] as const).map((kind) => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA" }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: newToken() }));
  assert.equal((await maker.send("/api/vault/start", { body: JSON.stringify({ vault, ways }) })).status, 200);
  const unlock = (b: ReturnType<typeof w.browser>, at: 0 | 1, proof = ways[at]!.proof) => b.send("/api/vault/unlock", { body: JSON.stringify({ id: ways[at]!.wrapper.id, proof }) });
  return { maker, vault, ways, unlock };
}

test("the count of wrong proofs is the account's: not dodged by many sessions, both ways in, requests side by side, or a restart", async () => {
  const w = await world();
  const v = await fakeVault(w);
  const browsers = [w.browser("198.51.100.30"), w.browser("198.51.100.31"), w.browser("198.51.100.32")];
  for (const b of browsers) await b.signInAs(OWNER);
  // ten wrong, side by side, from three sessions and both ways in
  const answers = await Promise.all(Array.from({ length: 10 }, (_, i) => v.unlock(browsers[i % 3]!, (i % 2) as 0 | 1, newToken())));
  assert.deepEqual(answers.map((a) => a.status), Array(10).fill(422));
  // and then even the right proof waits, from a session that never guessed, after the object was loaded again
  w.restart(OWNER);
  const fresh = w.browser("198.51.100.33");
  await fresh.signInAs(OWNER);
  const right = await v.unlock(fresh, 0);
  assert.equal(right.status, 429);
  assert.equal((await bodyOf(right)).why, "too-many");
  assert.equal(w.table(OWNER, "SELECT COUNT(*) AS n FROM tries")[0]!.n, 10);
  // (the maker's own session, unlocked by making the vault, still syncs: the count keeps no one out who is in)
  assert.equal((await v.maker.send("/api/sync/pull", { body: JSON.stringify({ vault: v.vault, since: 0 }) })).status, 200);
});

test("a right proof is never a try, however often it is shown", async () => {
  const w = await world();
  const v = await fakeVault(w);
  const b = w.browser("198.51.100.40");
  await b.signInAs(OWNER);
  for (let i = 0; i < 25; i++) assert.equal((await v.unlock(b, i % 2 ? 1 : 0)).status, 200);
  assert.equal(w.table(OWNER, "SELECT COUNT(*) AS n FROM tries")[0]!.n, 0);
});

test("what ends 'unlocked': vault/lock, signing out, being signed out from another session, everyone signed out, the account gone", async () => {
  const w = await world();
  const v = await fakeVault(w);
  const pull = (b: ReturnType<typeof w.browser>) => b.send("/api/sync/pull", { body: JSON.stringify({ vault: v.vault, since: 0 }) }).then((a) => a.status);
  const b = w.browser("198.51.100.50");
  await b.signInAs(OWNER);
  assert.equal((await v.unlock(b, 0)).status, 200);
  assert.equal(await pull(b), 200);
  assert.equal((await b.send("/api/vault/lock")).status, 200);
  assert.equal(await pull(b), 423);
  assert.equal((await v.unlock(b, 0)).status, 200);
  // another session ends this one: its unlocking goes with it
  const id = String(w.table(OWNER, "SELECT session FROM unlocked ORDER BY at DESC LIMIT 1")[0]!.session);
  assert.equal((await v.maker.send("/api/sessions/end", { body: JSON.stringify({ id }) })).status, 200);
  assert.equal(w.table(OWNER, `SELECT COUNT(*) AS n FROM unlocked WHERE session = '${id}'`)[0]!.n, 0);
  // everyone signed out
  const c = w.browser("198.51.100.51");
  await c.signInAs(OWNER);
  assert.equal((await v.unlock(c, 1)).status, 200);
  await w.internal.accountChanged(OWNER);
  assert.equal(w.table(OWNER, "SELECT COUNT(*) AS n FROM unlocked")[0]!.n, 0);
  assert.equal(await pull(c), 401);
  // signing out
  const d = w.browser("198.51.100.52");
  await d.signInAs(OWNER);
  assert.equal((await v.unlock(d, 0)).status, 200);
  assert.equal(await leave(d.ask), true);
  assert.equal(w.table(OWNER, "SELECT COUNT(*) AS n FROM unlocked")[0]!.n, 0);
  // the account gone: nothing is left to be unlocked
  const e = w.browser("198.51.100.53");
  await e.signInAs(OWNER);
  assert.equal((await v.unlock(e, 0)).status, 200);
  await w.internal.accountGone(OWNER);
  assert.equal(w.dump(OWNER), "");
  assert.equal(await pull(e), 401);
});

test("the gate open to the owner: an account the accounts service does not call the owner's is not let in, even on the list", async () => {
  const w = await world();
  const b = w.browser();
  assert.equal(await b.signInAs(OWNER, false), 403);
  assert.equal(b.jar.has("__Host-ml"), false);
  assert.equal(w.dump(OWNER), "");
});

test("whoever holds a session can keep the owner from opening the vault for as long as they keep at it, at thirty wrong proofs a day (1.9, pinned)", () => {
  const db = sqlite();
  wayTables(db);
  const vault = newId();
  const proof = "p".repeat(43);
  const ways = (["passphrase", "recovery"] as const).map((kind) => ({ wrapper: { v: 1, id: newId(), vault, kind }, params: { v: 1, kind }, verifier: kind === "passphrase" ? proof : "q".repeat(43) }));
  const T0 = Date.UTC(2026, 10, 27, 0, 0, 0);
  assert.equal(startWays(db, vault, ways, T0), true);
  const [attacker, owner] = [newId(), newId()];
  const minute = 60_000;
  let wrong = 0;
  const ownerIn: number[] = [];
  const perDay = new Map<number, number>();
  for (let t = T0; t < T0 + 5 * 24 * 60 * minute; t += minute) {
    // the attacker tries the moment a try is allowed; the owner half a minute later, every few minutes
    const tried = tryUnlock(db, ways[0]!.wrapper.id, "w".repeat(43), attacker, t);
    if (!tried.ok && tried.why === "wrong-secret") {
      wrong++;
      const day = Math.floor((t - T0) / (24 * 60 * minute));
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    if ((t - T0) % (7 * minute) === 0 && tryUnlock(db, ways[0]!.wrapper.id, proof, owner, t + 30_000).ok) ownerIn.push((t - T0) / minute);
  }
  // (the owner gets in only in the first ten minutes, before the attacker has used the hour's ten: never again in five days)
  assert.deepEqual(ownerIn, [0, 7]);
  assert.ok([...perDay.values()].every((n) => n <= 30), JSON.stringify([...perDay]));
  assert.ok(wrong <= 5 * 30);
});

// ---------------------------------------------------------------------------------------------
// The Worker's page and its headers
// ---------------------------------------------------------------------------------------------

test("the page: what is asked of the file store, and what goes out", async () => {
  const w = await world();
  const seen: Request[] = [];
  w.env.ASSETS = {
    fetch: async (request: Request) => (seen.push(request), new Response("file", { status: 200, headers: { "Content-Type": "text/javascript", "Set-Cookie": "planted=1", "Access-Control-Allow-Origin": "*", "Content-Security-Policy": "script-src *" } })),
  };
  const { default: worker } = await shell;
  const get = (path: string, headers: Record<string, string> = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, { headers }), w.env);
  for (const path of ["/index.html", "/assets/a/b/app.js", "/assets/app.js.map/x", "/assets/.hidden", "/assets/app-X.JS", "/licences.txt/", "/enter/", "/wrangler.jsonc", "/assets/app..js"]) {
    assert.equal((await get(path)).status, 404, path);
  }
  assert.equal(seen.length, 0);
  const page = await get("/?x=1#y", { Cookie: "__Host-ml=uinventedowner1." + "t".repeat(43), Range: "bytes=0-1", "If-None-Match": '"x"', Authorization: "Basic eA==" });
  assert.equal(page.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(new URL(seen[0]!.url).pathname + new URL(seen[0]!.url).search, "/");
  assert.deepEqual([...seen[0]!.headers], []);
  assert.equal(page.headers.get("Set-Cookie"), null);
  assert.equal(page.headers.get("Access-Control-Allow-Origin"), null);
  assert.match(page.headers.get("Content-Security-Policy")!, /^default-src 'none'; script-src 'self'; /);
  assert.equal(page.headers.get("Cache-Control"), "no-store");
  const asset = await get("/assets/app-ABCD1234.js");
  assert.equal(asset.headers.get("Content-Security-Policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  assert.equal(asset.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

// ---------------------------------------------------------------------------------------------
// Findings (todo: each fails while its finding stands)
// ---------------------------------------------------------------------------------------------

test("finding 1 (fixed at c601285d): one machine's IPv6 addresses share one count", async () => {
  const w = await world();
  for (const from of ["2001:db8:5:6::1", "2001:db8:5:6::2", "2001:db8:5:6:aaaa:bbbb:cccc:dddd"]) {
    const b = w.browser(from);
    await b.send("/enter", { method: "GET" });
    await b.send("/api/session", { body: JSON.stringify({ code: newToken() }) });
  }
  assert.ok(w.keys.length >= 3);
  assert.equal(new Set(w.keys).size, 1, `counted under ${new Set(w.keys).size} keys: ${[...new Set(w.keys)].join(", ")}`);
});

test("finding 2: after thirty wrong proofs and an afternoon of signing in and out, the owner is still shown that wrong proofs were made", { todo: "finding 2: the 50 events shown can still be filled by whoever holds a session (kept apart since c601285d, not yet shown apart)" }, async () => {
  const db = sqlite();
  const cfg = configOf({ ORIGIN, GATE: "owner", ALLOWED_ACCOUNTS: OWNER })!;
  const T0 = Date.UTC(2026, 10, 27, 9, 0, 0);
  const minute = 60_000;
  let now = T0;
  const session = async () => {
    const hash = (await hashOf(newToken()))!;
    assert.equal(signIn(db, { account: OWNER, session: newId(), hash, label: "Firefox on Linux", owner: true }, now, cfg.gate), "ok");
    return hash;
  };
  const ask = async (hash: string, action: string, body: object) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    return act(db, { account: OWNER, hash, action, body: bytes, proofs: (await proofsIn(action, bytes))! }, now, cfg);
  };
  const maker = await session();
  const vault = newId();
  const ways = (["passphrase", "recovery"] as const).map((kind) => ({ wrapper: { v: 1, id: newId(), vault, kind }, params: { v: 1, kind }, proof: newToken() }));
  assert.equal((await ask(maker, "vault/start", { vault, ways })).status, 200);
  // someone with the mailbox: thirty wrong proofs over three hours
  for (let i = 0; i < 30; i++) {
    now += 7 * minute;
    const s = await session();
    assert.equal((await ask(s, "vault/unlock", { id: ways[0]!.wrapper.id, proof: newToken() })).status, 422);
    await ask(s, "session/end", {});
  }
  // then signs in and out, ten times an hour (under the dozen sign-ins an hour), for three hours
  for (let i = 0; i < 30; i++) {
    now += 6 * minute;
    await ask(await session(), "session/end", {});
  }
  now += minute;
  const events = (await ask(await session(), "events", {})).json!.events as { kind: string }[];
  assert.ok(
    events.some((e) => e.kind === "unlock-failed"),
    `shown: ${[...new Set(events.map((e) => e.kind))].join(", ")}`,
  );
});

test("finding 3 (fixed at c601285d): signing out when the account is no longer let in: the cookie is gone, and the screen does not say the person is still signed in", async () => {
  const w = await world();
  const b = w.browser();
  await b.signInAs(OWNER);
  w.env.ALLOWED_ACCOUNTS = "";
  const over = await leave(b.ask);
  assert.equal(b.jar.has("__Host-ml"), false, "(the Worker took the cookie away)");
  assert.equal(over, true);
});

test("finding 5 (fixed at c601285d): a request told to slow down is not said to be the server's fault", async () => {
  const slow: Ask = async () => ({ status: 429, json: { ok: false, why: "slow-down" } });
  assert.deepEqual(await standing(slow), { at: "trouble", why: "busy" });
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(slow, made.draft), "busy");
});

// ---------------------------------------------------------------------------------------------
// Second look (c601285d): what the fixes might have broken
// ---------------------------------------------------------------------------------------------

test("second look: the address key: one machine one key, two machines two keys, whatever the spelling", () => {
  // one /64, however written, and an IPv4 address however it comes
  const same = [
    ["2001:db8:5:6::1", "2001:DB8:5:6:ffff:ffff:ffff:ffff", "2001:0db8:0005:0006:0:0:0:1", "2001:db8:5:6:1:2:3.4.5.6"],
    ["192.0.2.7", "::ffff:192.0.2.7", "::FFFF:c000:207", "0:0:0:0:0:ffff:192.0.2.7"],
  ];
  for (const spellings of same) assert.equal(new Set(spellings.map(addressKey)).size, 1, spellings.join(" "));
  // neighbours are apart: the next /64, the next IPv4 address, and a mapped address from its IPv6 neighbour
  const apart = ["2001:db8:5:6::1", "2001:db8:5:7::1", "192.0.2.7", "192.0.2.8", "::fffe:192.0.2.7", "64:ff9b::192.0.2.7"];
  assert.equal(new Set(apart.map(addressKey)).size, apart.length, apart.map(addressKey).join(" | "));
  // (a /56 is 256 keys: 1.8 says so)
  assert.notEqual(addressKey("2001:db8:5:600::1"), addressKey("2001:db8:5:6ff::1"));
  // what is not an address is the one key, and is never somebody's address
  for (const bad of ["", "nowhere", "1.2.3", "1.2.3.256", "2001:db8::1::2", "1:2:3:4:5:6:7:8:9", "fe80::1%eth0", "::ffff:1.2.3.4.5", "1.2.3.4:5", " 1.2.3.4", null, 7]) assert.equal(addressKey(bad), "nowhere", String(bad));
});

test("second look: /enter begins a sign-in only from this origin's own page, or a browser that does not say", async () => {
  const { default: worker } = await shell;
  const w = await world();
  const enter = (site: string | null) => worker.fetch(new Request(`${ORIGIN}/enter`, { headers: site === null ? {} : { "Sec-Fetch-Site": site }, redirect: "manual" }), w.env);
  for (const site of ["cross-site", "same-site", "none", "Same-Origin", "same-origin, cross-site", ""]) {
    const answer = await enter(site);
    assert.equal(answer.status, 302, site);
    assert.equal(answer.headers.get("Location"), `${ORIGIN}/`, site);
    assert.deepEqual(answer.headers.getSetCookie(), [], site);
  }
  for (const site of ["same-origin", null]) {
    const answer = await enter(site);
    assert.equal(answer.status, 302);
    assert.match(answer.headers.get("Location")!, /^https:\/\/changle\.ca\/tools\/finance\?handoff=/);
    assert.ok(answer.headers.getSetCookie().some((c) => c.startsWith("__Host-ml-n=")));
  }
});

test("second look: the events log keeps wrong proofs and everything else apart, 500 of each, and neither pushes the other out", async () => {
  const db = sqlite();
  const cfg = configOf({ ORIGIN, GATE: "owner", ALLOWED_ACCOUNTS: OWNER })!;
  let now = Date.UTC(2026, 10, 27, 9, 0, 0);
  const minute = 60_000;
  const session = async () => {
    const hash = (await hashOf(newToken()))!;
    assert.equal(signIn(db, { account: OWNER, session: newId(), hash, label: "Firefox on Linux", owner: true }, now, cfg.gate), "ok");
    return hash;
  };
  const ask = async (hash: string, action: string, body: object) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    return act(db, { account: OWNER, hash, action, body: bytes, proofs: (await proofsIn(action, bytes))! }, now, cfg);
  };
  const count = (where: string) => Number((db.raw.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${where}`).all()[0] as { n: number }).n);
  const maker = await session();
  const vault = newId();
  const ways = (["passphrase", "recovery"] as const).map((kind) => ({ wrapper: { v: 1, id: newId(), vault, kind }, params: { v: 1, kind }, proof: newToken() }));
  assert.equal((await ask(maker, "vault/start", { vault, ways })).status, 200);
  // 520 wrong proofs, one every 50 minutes (under ten an hour and thirty a day), each from a new session: the oldest twenty go, and nothing else does
  for (let i = 0; i < 520; i++) {
    now += 50 * minute;
    const s = await session();
    assert.equal((await ask(s, "vault/unlock", { id: ways[0]!.wrapper.id, proof: newToken() })).status, 422);
  }
  // (the 521 sign-ins are the other sort: held to their own 500, the vault's start among the oldest that went)
  assert.equal(count("kind = 'unlock-failed'"), 500);
  assert.equal(count("kind != 'unlock-failed'"), 500);
  const oldestWrong = Number((db.raw.prepare(`SELECT MIN(n) AS n FROM events WHERE kind = 'unlock-failed'`).all()[0] as { n: number }).n);
  // then 600 right proofs: the other sort stays at 500, and not one wrong proof goes
  const opener = await session();
  for (let i = 0; i < 600; i++) assert.equal((await ask(opener, "vault/unlock", { id: ways[0]!.wrapper.id, proof: ways[0]!.proof })).status, 200);
  assert.equal(Number((db.raw.prepare(`SELECT MIN(n) AS n FROM events WHERE kind = 'unlock-failed'`).all()[0] as { n: number }).n), oldestWrong);
  assert.equal(count("kind != 'unlock-failed'"), 500);
  assert.equal(count("kind = 'unlock-failed'"), 500);
  // and the twelve months still hold for both
  now += 367 * 24 * 60 * minute;
  await session();
  assert.equal(count("kind = 'unlock-failed'"), 0);
  assert.equal(count("1 = 1"), 1);
});
