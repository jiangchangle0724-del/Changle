/**
 * C9 independent review, second reviewer (tests of the reviewer, not of the author).
 *
 * Built on the tests the previous reviewer (OpenAI Codex) left for commit 189ad559. Its harness
 * is kept and given what the new head needs: the registry's `stampNow` and `newStamp`, the
 * accounts service's `exists`, and a promise from `VaultDO.signIn`. Its nine tests are here with
 * its two findings run as plain tests: they pass at this head, which is part of the evidence that
 * both are resolved. The tests after them are this reviewer's.
 *
 * The real worker.ts is bundled in memory; only Cloudflare's two base classes and the transport
 * between objects are replaced. Each call between objects can be held after it has had its
 * effect and before its answer comes back (`hold`), which is how the orderings are made. This
 * shows the application's ordering, not the platform's scheduling.
 *
 * No network, no Wrangler. Every account id, code, token, label and blob is invented here.
 *
 * Brought to the door's head (C10, 342bbbb3) by the reviewer of C10. Only what that branch's four
 * changes force was changed: the harness binds two limiters that always say yes (`TRADES`,
 * `ASKS`); `vault/start` is sent with its two ways in (`waysFor`, as tests/shell.test.ts makes
 * them); the push limit is four bytes longer; and the owner's gate now has its list, so the test
 * that pinned a made-up id reaching an object in owner mode now pins that it does not. The two
 * `todo` tests (findings 1 and 3) are plain tests: both findings are resolved at this head, and the
 * finding 3 test now goes through the Worker and the object instead of restating a constant.
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { newId } from "../src/core/ids";
import { signIn, type SignIn } from "../src/server/account";
import type { Db } from "../src/server/chunks";
import { configOf, type Settings } from "../src/server/gate";
import { hashOf, newToken } from "../src/server/sessions";
import { HEAD_MAX, frame, packPush, unframe, unpackPush, unpackPulled, unpackPushed } from "../src/server/wire";
import { HttpRemote, SignedOut } from "../src/web/remote";
import { LIMITS } from "../src/vault/protocol";

const ORIGIN = "https://money.changle.test";
const A = "uinvented01";
const B = "uinvented02";
const encode = (value: object) => new TextEncoder().encode(JSON.stringify(value));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function sqlite() {
  const raw = new DatabaseSync(":memory:");
  let depth = 0;
  const db: Db = {
    sql: {
      exec(query, ...args) {
        const rows = raw.prepare(query).all(...args.map((value) => (value instanceof ArrayBuffer ? new Uint8Array(value) : value)));
        return { toArray: () => rows.map((row) => Object.fromEntries(Object.entries(row).map(([name, value]) => [name, value instanceof Uint8Array ? new Uint8Array(value).buffer : value]))) };
      },
    },
    atomically<T>(work: () => T): T {
      const name = `review${depth++}`;
      raw.exec(`SAVEPOINT ${name}`);
      try {
        const result = work();
        raw.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
  };
  const tables = () => raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length;
  return { db, raw, tables, snapshot: () => JSON.stringify(raw.prepare("SELECT * FROM sessions ORDER BY id").all()) };
}
type Store = ReturnType<typeof sqlite>;
type Storage = { sql: Db["sql"]; transactionSync: Db["atomically"]; deleteAll(): Promise<void> };
type Vault = { signIn(made: SignIn & { stamp: string }): Promise<string>; signEveryoneOut(): void; erase(): Promise<void>; fetch(request: Request): Promise<Response> };
type Registry = { note(id: string): boolean; forget(id: string): void; count(): number; stampNow(): string; newStamp(): void };
type Internal = { accountGone(id: string): Promise<void>; accountChanged(id: string): Promise<void>; count(): Promise<number> };
type Shell = {
  default: { fetch(request: Request, env: object): Promise<Response> };
  VaultDO: new (ctx: { storage: Storage }, env: object) => Vault;
  Registry: new (ctx: { storage: Storage }, env: object) => Registry;
  Internal: new (ctx: object, env: object) => Internal;
};

const workerFile = fileURLToPath(new URL("../src/server/worker.ts", import.meta.url));
const output = buildSync({ entryPoints: [workerFile], bundle: true, platform: "node", format: "cjs", target: "es2022", write: false, external: ["cloudflare:workers"] }).outputFiles[0]!.text;
const loaded = { exports: {} };
class Base {
  constructor(
    readonly ctx: unknown,
    readonly env: unknown,
  ) {}
}
runInNewContext(output, {
  module: loaded,
  exports: loaded.exports,
  require(name: string) {
    assert.equal(name, "cloudflare:workers");
    return { DurableObject: Base, WorkerEntrypoint: Base };
  },
  Uint8Array,
  ArrayBuffer,
  DataView,
  TextEncoder,
  TextDecoder,
  Headers,
  Request,
  Response,
  URL,
  crypto,
  Date,
  // Test failures must never print request text, cookies, codes or tokens.
  console: { error() {} },
});
const shell = loaded.exports as Shell;

/** The calls between objects that a test can hold: after the call has had its effect, before its answer is back. */
type Kind = "stampNow" | "redeem" | "note" | "signIn" | "exists" | "erase" | "forget";

function harness(settings: Settings = {}) {
  const stores = new Map<string, Store>();
  const vaults = new Map<string, Vault>();
  const registryStore = sqlite();
  const passed = new Map<Kind, number>();
  const holds = new Map<string, { reached: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }>();
  let afterNote: ((id: string) => Promise<void>) | undefined;
  let vaultCalls = 0;
  let redeems = 0;
  let existsAsked = 0;
  let existsFails = false;
  const gone = new Set<string>();
  const codes = new Map<string, { id: string; master: boolean; nonce: string }>();
  /** Counts the call, and waits there when a test holds this one. */
  async function pass(kind: Kind): Promise<void> {
    const n = (passed.get(kind) ?? 0) + 1;
    passed.set(kind, n);
    const held = holds.get(`${kind}#${n}`);
    if (held) {
      held.reached.resolve();
      await held.release.promise;
    }
  }
  const env = {
    ORIGIN,
    GATE: "list",
    ALLOWED_ACCOUNTS: `${A},${B}`,
    ...settings,
    // (C10: the gate open needs two limiters; these always let the request through)
    TRADES: { limit: async () => ({ success: true }) },
    ASKS: { limit: async () => ({ success: true }) },
    ACCOUNTS: {
      async redeem(code: string, audience: string) {
        redeems++;
        assert.equal(audience, "moneylens");
        const stood = codes.get(code) ?? null;
        codes.delete(code);
        // (as the real service: a deleted account's code no longer trades)
        const out = stood && !gone.has(stood.id) ? stood : null;
        await pass("redeem");
        return out;
      },
      async exists(ids: string[]) {
        existsAsked++;
        await pass("exists");
        if (existsFails) throw new Error("accounts service unavailable");
        return ids.filter((id) => !gone.has(id));
      },
    },
    REGISTRY: {
      idFromName: (id: string) => id,
      get: (name: string) => {
        assert.equal(name, "registry");
        return {
          async note(id: string) {
            const result = registry.note(id);
            await afterNote?.(id);
            await pass("note");
            return result;
          },
          async forget(id: string) {
            registry.forget(id);
            await pass("forget");
          },
          async count() {
            return registry.count();
          },
          async stampNow() {
            const read = registry.stampNow();
            await pass("stampNow");
            return read;
          },
          async newStamp() {
            registry.newStamp();
          },
        };
      },
    },
    VAULTS: {
      idFromName: (id: string) => id,
      get: (id: string) => ({
        async signIn(made: SignIn & { stamp: string }) {
          vaultCalls++;
          const out = await vault(id).signIn(made);
          await pass("signIn");
          return out;
        },
        async signEveryoneOut() {
          vaultCalls++;
          vault(id).signEveryoneOut();
        },
        async erase() {
          vaultCalls++;
          await vault(id).erase();
          await pass("erase");
        },
        async fetch(url: string, init: RequestInit) {
          vaultCalls++;
          return vault(id).fetch(new Request(url, { ...init, duplex: "half" } as RequestInit));
        },
      }),
    },
  };
  function storage(store: Store): Storage {
    return {
      sql: store.db.sql,
      transactionSync: (work) => store.db.atomically(work),
      async deleteAll() {
        for (const row of store.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
          store.raw.exec(`DROP TABLE "${String(row.name).replace(/"/g, '""')}"`);
        }
      },
    };
  }
  const registry = new shell.Registry({ storage: storage(registryStore) }, env);
  function vault(id: string) {
    if (!vaults.has(id)) {
      const store = sqlite();
      stores.set(id, store);
      vaults.set(id, new shell.VaultDO({ storage: storage(store) }, env));
    }
    return vaults.get(id)!;
  }
  const internal = new shell.Internal({}, env);
  const request = (path: string, cookie = "", body: string | Uint8Array = "{}", extra: Record<string, string> = {}) =>
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: cookie, "Content-Type": typeof body === "string" ? "application/json" : "application/octet-stream", "Content-Length": String(typeof body === "string" ? new TextEncoder().encode(body).length : body.length), ...extra },
      body: body as BodyInit,
    });
  const send = (path: string, cookie = "", body: string | Uint8Array = "{}", extra: Record<string, string> = {}) => shell.default.fetch(request(path, cookie, body, extra), env);
  const makeLogin = (id: string, master = false) => {
    const nonce = newToken();
    const code = newToken();
    codes.set(code, { id, master, nonce });
    // (what a caller may add to the body, an account, a session, a hash, a token, must be ignored)
    return request("/api/session", `__Host-ml-n=${nonce}`, JSON.stringify({ code, account: B, session: newId(), hash: newToken(), token: newToken() }));
  };
  const cookieOf = (response: Response) => response.headers.getSetCookie().find((x) => x.startsWith("__Host-ml="))?.split(";")[0] ?? "";
  return {
    env,
    stores,
    registry,
    internal,
    send,
    request,
    makeLogin,
    cookieOf,
    fetch: (request: Request) => shell.default.fetch(request, env),
    pauseNote(hook: typeof afterNote) {
      afterNote = hook;
    },
    /** Holds the nth call of this kind, counted from now on: `reached` once it has had its effect, and it answers on `release`. */
    hold(kind: Kind, nth: number) {
      const at = (passed.get(kind) ?? 0) + nth;
      const held = { reached: deferred(), release: deferred() };
      holds.set(`${kind}#${at}`, held);
      return { reached: held.reached.promise, release: () => held.release.resolve() };
    },
    /** What the accounts service does when it deletes an account, before it tells the apps: its codes no longer trade. */
    deleteAccount(id: string) {
      gone.add(id);
    },
    failExists() {
      existsFails = true;
    },
    registered: (id: string) => registryStore.raw.prepare("SELECT 1 FROM accounts WHERE id = ?").all(id).length === 1,
    tablesOf: (id: string) => stores.get(id)?.tables() ?? 0,
    sessionsOf: (id: string) => (stores.get(id) && stores.get(id)!.tables() ? Number(stores.get(id)!.raw.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n) : 0),
    stamp: () => registry.stampNow(),
    counts: () => ({ vaultCalls, redeems, existsAsked }),
    async login(id: string, master = false) {
      const response = await shell.default.fetch(makeLogin(id, master), env);
      assert.equal(response.status, 200);
      return cookieOf(response);
    },
    close() {
      for (const held of holds.values()) held.release.resolve();
      registryStore.raw.close();
      for (const store of stores.values()) store.raw.close();
    },
  };
}
type Harness = ReturnType<typeof harness>;
const statusOf = async (h: Harness, cookie: string) => (cookie ? (await h.send("/api/vault", cookie)).status : 0);
/** C10: a `vault/start` body, with the vault's two ways in as a device hands them over (the server does not look inside them). */
const startBody = (vault: string) =>
  JSON.stringify({
    vault,
    ways: (["passphrase", "recovery"] as const).map((kind) => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA" }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: newToken() })),
  });

// =============================================================================================
// The previous reviewer's tests (Codex, for 189ad559), with the stand-ins the new head needs
// =============================================================================================

test("C9: shell ignores forged routing headers/body accounts and isolates every data route", async () => {
  const h = harness();
  try {
    const a = await h.login(A);
    const b = await h.login(B);
    const vaultA = newId();
    const vaultB = newId();
    assert.equal((await h.send("/api/vault/start", a, startBody(vaultA))).status, 200);
    assert.equal((await h.send("/api/vault/start", b, startBody(vaultB))).status, 200);
    const chunk = newId();
    const blob = new Uint8Array(64).fill(17);
    assert.equal(unpackPushed(new Uint8Array(await (await h.send("/api/sync/push", b, packPush(vaultB, [{ id: chunk, base: 0, blob }]))).arrayBuffer()))?.ok, true);
    const bSession = h.stores.get(B)!.raw.prepare("SELECT id FROM sessions").get()!.id;
    const forged = { "x-ml-account": B, "x-ml-hash": String(h.stores.get(B)!.raw.prepare("SELECT hash FROM sessions").get()!.hash) };
    const own = await h.send("/api/vault", a, JSON.stringify({ account: B, vault: vaultB }), forged);
    assert.equal(((await own.json()) as { vault: string }).vault, vaultA);
    const pull = await h.send("/api/sync/pull", a, JSON.stringify({ vault: vaultB, since: 0 }), forged);
    assert.deepEqual(unpackPulled(new Uint8Array(await pull.arrayBuffer())), { ok: false, why: "wrong-vault" });
    assert.equal((await h.send("/api/sessions/end", a, JSON.stringify({ id: bSession }), forged)).status, 404);
    assert.equal((await h.send("/api/session/end", a, "{}", forged)).status, 200);
    assert.equal((await h.send("/api/sessions", a)).status, 401);
    assert.equal((await h.send("/api/sessions", b)).status, 200);
    for (const path of ["/Internal/accountGone", "/api/accountGone", "/api/registry", "/api/signIn", "/api/stampNow", "/api/erase"]) assert.equal((await h.send(path, b)).status, 404);
  } finally {
    h.close();
  }
});

test("C9: closed/unconfigured/removed gates and bad origins stop before objects or redemption", async () => {
  for (const GATE of ["closed", "misspelt", "owner"]) {
    const h = harness({ GATE });
    try {
      const response = await h.fetch(h.makeLogin(B));
      assert.equal(response.status, 403);
      assert.equal(h.counts().vaultCalls, 0);
      assert.equal(h.registry.count(), 0);
    } finally {
      h.close();
    }
  }
  const h = harness();
  try {
    const cookie = await h.login(A);
    const before = h.counts();
    for (const path of ["/api/session", "/api/vault", "/api/sync/push", "/api/sessions/end"]) {
      assert.equal((await h.send(path, cookie, "{}", { Origin: "https://changle.test" })).status, 403);
    }
    assert.deepEqual(h.counts(), before);
    h.env.ALLOWED_ACCOUNTS = B;
    assert.equal((await h.send("/api/sessions", cookie)).status, 403);
    assert.deepEqual(h.counts(), before);
    h.env.ORIGIN = undefined as unknown as string;
    assert.equal((await h.send("/api/sessions", cookie)).status, 503);
    assert.deepEqual(h.counts(), before);
  } finally {
    h.close();
  }
});

test("C9: revocation while a body is pending is enforced by the second session check", async () => {
  const h = harness();
  const checked = deferred();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  try {
    const cookie = await h.login(A);
    const store = h.stores.get(A)!;
    const exec = store.db.sql.exec;
    store.db.sql.exec = (query, ...args) => {
      const out = exec(query, ...args);
      if (query.startsWith("SELECT id, hash")) checked.resolve();
      return out;
    };
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    // (C10: a whole vault/start body, so that the request reaches the second check and is not refused for its form first)
    const sent = new TextEncoder().encode(startBody(newId()));
    const pending = h.fetch(new Request(`${ORIGIN}/api/vault/start`, { method: "POST", headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json", "Content-Length": String(sent.length) }, body, duplex: "half" } as RequestInit));
    await checked.promise;
    await h.internal.accountChanged(A);
    controller.enqueue(sent);
    controller.close();
    assert.equal((await pending).status, 401);
    assert.equal(store.raw.prepare("SELECT count(*) AS n FROM vault").get()!.n, 0);
  } finally {
    h.close();
  }
});

test("C9: nonce mismatch/replay and failed registry issue no session; response policies apply", async () => {
  const h = harness();
  try {
    const original = h.makeLogin(A);
    const codeBody = await original.clone().text();
    const wrong = h.request("/api/session", `__Host-ml-n=${newToken()}`, codeBody);
    const failed = await h.fetch(wrong);
    assert.equal(failed.status, 401);
    assert.equal(h.registry.count(), 0);
    assert.equal(h.counts().vaultCalls, 0);
    assert.equal((await h.fetch(original)).status, 401);
    h.pauseNote(async () => {
      throw new Error("injected registry failure");
    });
    const unavailable = await h.fetch(h.makeLogin(A));
    assert.equal(unavailable.status, 500);
    assert.equal(h.cookieOf(unavailable), "");
    assert.equal(h.counts().vaultCalls, 0);
    for (const response of [failed, unavailable, await h.send("/no-such-route")]) {
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
      assert.match(response.headers.get("Content-Security-Policy")!, /frame-ancestors 'none'/);
      assert.equal([...response.headers].some(([key]) => /^(access-control-|x-ml-)/.test(key)), false);
    }
  } finally {
    h.close();
  }
});

test("C9: frame view bounds, size counts and malformed lengths fail without reading adjacent bytes", () => {
  const blob = new Uint8Array([201, 202, 1, 2, 3, 203]).subarray(2, 5);
  const good = packPush(newId(), [{ id: newId(), base: 0, blob }]);
  const outer = new Uint8Array(good.length + 20).fill(255);
  outer.set(good, 7);
  assert.deepEqual([...unpackPush(outer.subarray(7, 7 + good.length))!.writes[0]!.blob], [1, 2, 3]);
  for (let length = 0; length < good.length; length++) assert.equal(unpackPush(good.subarray(0, length)), null);
  for (const count of [-1, 0.5, "3", null, true, Number.MAX_SAFE_INTEGER, 2 ** 53]) {
    assert.equal(unpackPush(frame({ vault: "invented", writes: [{ id: "invented", base: 0, bytes: count }] }, [blob])), null);
  }
  assert.equal(unframe(frame({ pad: "x".repeat(HEAD_MAX) })), null);
  assert.equal(unpackPush(frame({ writes: [{ bytes: 4 }, { bytes: 0 }] }, [blob])), null);
  assert.equal(unpackPush(frame({ writes: [{ bytes: 0 }, { bytes: 3 }] }, [blob]))!.writes.length, 2);
});

test("C9: HttpRemote pins same-origin POST, rejects redirects/errors and distinguishes sign-out", async () => {
  const sent: RequestInit[] = [];
  let answer = new Response(new Uint8Array(frame({ ok: false, why: "wrong-vault" })).buffer);
  const remote = new HttpRemote(async (_input, init) => {
    sent.push(init!);
    return answer;
  });
  assert.deepEqual(await remote.pull(newId(), 0), { ok: false, why: "wrong-vault" });
  assert.deepEqual([sent[0]!.method, sent[0]!.credentials, sent[0]!.cache, sent[0]!.redirect], ["POST", "same-origin", "no-store", "error"]);
  for (const status of [401, 403]) {
    answer = new Response(null, { status });
    await assert.rejects(remote.pull(newId(), 0), (error) => error instanceof SignedOut && error.status === status);
    assert.equal(remote.signedOut, status);
  }
  answer = new Response("not a frame", { status: 500 });
  await assert.rejects(remote.pull(newId(), 0));
  answer = new Response(new Uint8Array(frame({ ok: false, why: "wrong-vault" })).buffer);
  await remote.pull(newId(), 0);
  assert.equal(remote.signedOut, null);
});

// The previous reviewer's two findings, unskipped: both pass at this head.
for (const notice of ["accountChanged", "accountGone"] as const) {
  test(`C9 previous finding 1 (resolved): ${notice} fences a redeemed sign-in paused at another object`, async () => {
    const h = harness();
    const parked = deferred();
    const resume = deferred();
    try {
      await h.login(A);
      h.pauseNote(async () => {
        parked.resolve();
        await resume.promise;
      });
      const pending = h.fetch(h.makeLogin(A));
      await parked.promise; // redemption succeeded and registry.note completed its write
      if (notice === "accountGone") h.deleteAccount(A); // (the accounts service's own part comes first)
      await h.internal[notice](A); // the whole notice runs before the pending sign-in resumes
      resume.resolve();
      const response = await pending;
      const cookie = h.cookieOf(response);
      const authenticated = cookie ? (await h.send("/api/vault", cookie)).status === 200 : false;
      const actual = { issued: response.status === 200, authenticated, registered: h.registry.count() };
      assert.deepEqual(actual, { issued: false, authenticated: false, registered: notice === "accountGone" ? 0 : 1 });
      assert.equal(response.status, 503);
      if (notice === "accountGone") assert.equal(h.tablesOf(A), 0);
    } finally {
      resume.resolve();
      h.close();
    }
  });
}

test("C9 previous finding 2 (resolved): failed sign-in logging preserves all existing sessions", async () => {
  const store = sqlite();
  const now = Date.now();
  const cfg = configOf({ ORIGIN, GATE: "list", ALLOWED_ACCOUNTS: A })!;
  try {
    for (let i = 0; i < 8; i++) {
      const hash = (await hashOf(newToken()))!;
      assert.equal(signIn(store.db, { account: A, session: newId(), hash, owner: false, label: "Invented device" }, now + i, cfg.gate), "ok");
    }
    const before = store.snapshot();
    store.raw.exec("CREATE TRIGGER reject_signin BEFORE INSERT ON events WHEN NEW.kind = 'sign-in' BEGIN SELECT RAISE(ABORT, 'injected event failure'); END");
    const hash = (await hashOf(newToken()))!;
    assert.throws(() => signIn(store.db, { account: A, session: newId(), hash, owner: false, label: "Invented ninth device" }, now + 20, cfg.gate), /injected event failure/);
    assert.equal(store.snapshot() === before, true, "failed login must not evict an existing device or leave an unissued session");
  } finally {
    store.raw.close();
  }
});

// =============================================================================================
// This reviewer's tests
// =============================================================================================

test("second: a first sign-in into a database that fails at the event line leaves no tables and no session", async () => {
  const store = sqlite();
  const gate = configOf({ ORIGIN, GATE: "list", ALLOWED_ACCOUNTS: A })!.gate;
  try {
    // Fail the first event insert by making `events` unwritable the moment it is created.
    const exec = store.db.sql.exec;
    store.db.sql.exec = (query, ...args) => {
      if (query.startsWith("INSERT INTO events")) throw new Error("injected");
      return exec(query, ...args);
    };
    const hash = (await hashOf(newToken()))!;
    assert.throws(() => signIn(store.db, { account: A, session: newId(), hash, owner: false, label: "Invented device" }, Date.now(), gate), /injected/);
    assert.equal(store.tables(), 0);
  } finally {
    store.raw.close();
  }
});

// --- each step of a sign-in held, and a notice let through it -------------------------------

/** The four points at which a sign-in waits on another object, as held answers: the Worker's stamp, the code, the note, the object's own stamp. */
const POINTS: { name: string; kind: Kind; nth: number }[] = [
  { name: "after the Worker read the stamp", kind: "stampNow", nth: 1 },
  { name: "after the code was redeemed", kind: "redeem", nth: 1 },
  { name: "after the account was noted", kind: "note", nth: 1 },
  { name: "while the object waits for its own stamp", kind: "stampNow", nth: 2 },
];

for (const point of POINTS) {
  for (const before of [false, true]) {
    test(`second: deletion ${point.name} (${before ? "returning" : "first"} sign-in): no session, no tables, not on the registry`, async () => {
      const h = harness();
      try {
        if (before) await h.login(A);
        const held = h.hold(point.kind, point.nth);
        const pending = h.fetch(h.makeLogin(A));
        await held.reached;
        h.deleteAccount(A);
        await h.internal.accountGone(A);
        held.release();
        const response = await pending;
        assert.equal(h.cookieOf(response), "");
        // turned away: 401 when the code was not yet traded (the accounts service no longer trades it), 503 after
        assert.equal(response.status, point.kind === "stampNow" && point.nth === 1 ? 401 : 503);
        assert.equal(h.tablesOf(A), 0, "a deleted account's database came back");
        assert.equal(h.registered(A), false, "a deleted account is on the registry");
      } finally {
        h.close();
      }
    });

    test(`second: change of address ${point.name} (${before ? "returning" : "first"} sign-in): no session from a code traded before the change`, async () => {
      const h = harness();
      try {
        const old = before ? await h.login(A) : "";
        const held = h.hold(point.kind, point.nth);
        const pending = h.fetch(h.makeLogin(A));
        await held.reached;
        // (this code survives the change, as the code of the device that asked for it does: the stamp alone must stop it)
        await h.internal.accountChanged(A);
        held.release();
        const response = await pending;
        const cookie = h.cookieOf(response);
        // the stamp moved after this sign-in first read it: whichever step it was held at, nothing is opened
        assert.equal(cookie, "", "a code traded before the change gave a session");
        assert.equal(response.status, 503);
        if (before) assert.equal(await statusOf(h, old), 401, "a session from before the change still works");
        assert.equal(h.registered(A), true);
      } finally {
        h.close();
      }
    });
  }
}

test("second: a change of address that is over before the sign-in starts (case 1): a code that survives it signs in", async () => {
  const h = harness();
  try {
    const old = await h.login(A);
    const login = h.makeLogin(A); // asked for before the change, by the device the change leaves signed in
    await h.internal.accountChanged(A);
    const response = await h.fetch(login);
    assert.equal(response.status, 200);
    assert.equal(await statusOf(h, h.cookieOf(response)), 200);
    assert.equal(await statusOf(h, old), 401);
  } finally {
    h.close();
  }
});

test("second: deletion after the object answered: the session it opened is emptied with the database", async () => {
  const h = harness();
  try {
    const held = h.hold("signIn", 1);
    const pending = h.fetch(h.makeLogin(A));
    await held.reached; // the object has written the session; its answer is not back at the Worker
    h.deleteAccount(A);
    await h.internal.accountGone(A);
    held.release();
    const response = await pending;
    // the browser is given a cookie (the Worker heard "ok"), and it opens nothing
    assert.equal(response.status, 200);
    assert.equal(await statusOf(h, h.cookieOf(response)), 401);
    assert.equal(h.tablesOf(A), 0);
    assert.equal(h.registered(A), false);
  } finally {
    h.close();
  }
});

test("second: two sign-ins of one account and a deletion between them: nothing is left, whichever ends first", async () => {
  const h = harness();
  try {
    await h.login(A);
    const first = h.hold("note", 1);
    const second = h.hold("stampNow", 3); // from here: 1 the first's Worker, 2 the second's Worker, 3 the second's object
    const one = h.fetch(h.makeLogin(A));
    await first.reached;
    const two = h.fetch(h.makeLogin(A));
    // let the first reach its note and hold; let the second run up to its object's question
    await second.reached;
    h.deleteAccount(A);
    await h.internal.accountGone(A);
    second.release();
    const answerTwo = await two;
    first.release();
    const answerOne = await one;
    assert.deepEqual([answerOne.status, answerTwo.status], [503, 503]);
    assert.equal(h.tablesOf(A), 0);
    assert.equal(h.registered(A), false);
  } finally {
    h.close();
  }
});

test("second: a deletion that the accounts service cannot confirm during the clean-up is left on the registry, never off it with a database", async () => {
  const h = harness();
  try {
    const held = h.hold("redeem", 1);
    const pending = h.fetch(h.makeLogin(A));
    await held.reached;
    h.deleteAccount(A);
    await h.internal.accountGone(A);
    h.failExists();
    held.release();
    const response = await pending;
    assert.equal(response.status, 503);
    // the sign-in noted A again after the notice took it off; with no answer from the accounts service it stays, for the sweep
    assert.equal(h.registered(A), true);
    assert.equal(h.tablesOf(A), 0);
  } finally {
    h.close();
  }
});

test("second: someone else's notice turns a sign-in away and costs one question to the accounts service; nothing of either account is lost", async () => {
  const h = harness();
  try {
    const a = await h.login(A);
    const b = await h.login(B);
    const held = h.hold("note", 1);
    const pending = h.fetch(h.makeLogin(A));
    await held.reached;
    await h.internal.accountChanged(B);
    held.release();
    const response = await pending;
    assert.equal(response.status, 503);
    assert.equal(h.counts().existsAsked, 1);
    assert.equal(await statusOf(h, a), 200);
    assert.equal(await statusOf(h, b), 401);
    assert.equal(h.registered(A), true);
    assert.equal(h.sessionsOf(A), 1);
  } finally {
    h.close();
  }
});

test("second: a deletion while a body is on its way: the request is refused and no table comes back", async () => {
  const h = harness();
  const checked = deferred();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  try {
    const cookie = await h.login(A);
    const store = h.stores.get(A)!;
    const exec = store.db.sql.exec;
    store.db.sql.exec = (query, ...args) => {
      const out = exec(query, ...args);
      if (query.startsWith("SELECT id, hash")) checked.resolve();
      return out;
    };
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    // (C10: a whole vault/start body, so that the request reaches the second check and is not refused for its form first)
    const sent = new TextEncoder().encode(startBody(newId()));
    const pending = h.fetch(new Request(`${ORIGIN}/api/vault/start`, { method: "POST", headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json", "Content-Length": String(sent.length) }, body, duplex: "half" } as RequestInit));
    await checked.promise;
    h.deleteAccount(A);
    await h.internal.accountGone(A);
    controller.enqueue(sent);
    controller.close();
    const response = await pending;
    assert.equal(response.status, 401);
    assert.equal(h.cookieOf(response), "__Host-ml=");
    assert.equal(store.tables(), 0);
  } finally {
    h.close();
  }
});

// --- the gate -------------------------------------------------------------------------------

test("second: an account not on the list trades its code and leaves nothing at MoneyLens", async () => {
  const h = harness({ ALLOWED_ACCOUNTS: A });
  try {
    const response = await h.fetch(h.makeLogin(B));
    assert.equal(response.status, 403);
    assert.equal(h.cookieOf(response), "");
    assert.match(response.headers.getSetCookie().join("\n"), /__Host-ml-n=; Max-Age=0/);
    assert.equal(h.counts().redeems, 1);
    assert.equal(h.counts().vaultCalls, 0);
    assert.equal(h.registry.count(), 0);
  } finally {
    h.close();
  }
});

test("second: owner gate: the owner's account is let in, another account is not, and the mark is the latest sign-in's", async () => {
  const h = harness({ GATE: "owner" });
  try {
    const owner = await h.login(A, true);
    assert.equal(await statusOf(h, owner), 200);
    assert.equal((await h.fetch(h.makeLogin(B, false))).status, 403);
    assert.equal(h.registered(B), false);
  } finally {
    h.close();
  }
});

test("second: taking an account off the list stops it at once; putting it back brings its open sessions back (documented, pinned)", async () => {
  const h = harness();
  try {
    const cookie = await h.login(A);
    h.env.ALLOWED_ACCOUNTS = B;
    const off = await h.send("/api/vault", cookie);
    assert.equal(off.status, 403);
    h.env.ALLOWED_ACCOUNTS = `${A},${B}`;
    // (the session was not ended in its database: within its 30 minutes and 12 hours it works again)
    assert.equal(await statusOf(h, cookie), 200);
  } finally {
    h.close();
  }
});

test("second: owner gate: a made-up account in a cookie reaches no object and writes nothing (C10: the owner's gate has its list)", async () => {
  const h = harness({ GATE: "owner" });
  try {
    const before = h.counts().vaultCalls;
    const response = await h.send("/api/vault", `__Host-ml=uinvented99.${newToken()}`);
    assert.equal(response.status, 403);
    assert.equal(h.counts().vaultCalls, before);
    assert.equal(h.tablesOf("uinvented99"), 0);
  } finally {
    h.close();
  }
});

test("second: finding 1 (resolved at C10), owner gate: an account id that cannot be the owner's reaches no Durable Object", async () => {
  const h = harness({ GATE: "owner" });
  try {
    for (let i = 0; i < 20; i++) await h.send("/api/vault", `__Host-ml=uinvented${String(i).padStart(3, "0")}.${newToken()}`);
    assert.equal(h.counts().vaultCalls, 0, "with the gate open to the owner alone, made-up ids should be stopped in the Worker, as with a list");
  } finally {
    h.close();
  }
});

// --- trading the code -----------------------------------------------------------------------

test("second: every kind of bad code gets the same answer, and the nonce cookie is cleared each time", async () => {
  const h = harness();
  try {
    const answers: string[] = [];
    // unknown code
    answers.push(await (await h.fetch(h.request("/api/session", `__Host-ml-n=${newToken()}`, JSON.stringify({ code: newToken() })))).text());
    // used code
    const once = h.makeLogin(A);
    const again = once.clone();
    assert.equal((await h.fetch(once)).status, 200);
    const replay = await h.fetch(again);
    assert.equal(replay.status, 401);
    answers.push(await replay.text());
    // a code bound to another browser's nonce
    const theirs = await h.makeLogin(A).text();
    const crossed = await h.fetch(h.request("/api/session", `__Host-ml-n=${newToken()}`, theirs));
    answers.push(await crossed.text());
    // a deleted account's code
    const late = h.makeLogin(B);
    h.deleteAccount(B);
    answers.push(await (await h.fetch(late)).text());
    assert.equal(new Set(answers).size, 1, answers.join(" | "));
    assert.equal(replay.headers.getSetCookie().some((c) => c.startsWith("__Host-ml-n=; Max-Age=0")), true);
    assert.equal(h.registered(B), false);
  } finally {
    h.close();
  }
});

test("second: no nonce cookie, a doubled one, or a code that does not look like one: nothing is asked of anyone", async () => {
  const h = harness();
  try {
    const code = newToken();
    const cases = [
      h.request("/api/session", "", JSON.stringify({ code })),
      h.request("/api/session", `__Host-ml-n=${newToken()}; __Host-ml-n=${newToken()}`, JSON.stringify({ code })),
      h.request("/api/session", `__Host-ml-n=${newToken()}`, JSON.stringify({ code: "short" })),
      h.request("/api/session", `__Host-ml-n=${newToken()}`, JSON.stringify({ code: 12345678901234567890 })),
      h.request("/api/session", `__Host-ml-n=${newToken()}`, "[]"),
    ];
    for (const one of cases) assert.equal((await h.fetch(one)).status, 400);
    assert.deepEqual(h.counts(), { vaultCalls: 0, redeems: 0, existsAsked: 0 });
    assert.equal(h.stamp(), "");
  } finally {
    h.close();
  }
});

test("second: Internal refuses what is not an account id before it sets a stamp or touches anything", async () => {
  const h = harness();
  try {
    await h.login(A);
    const stamp = h.stamp();
    for (const bad of ["", "UINVENTED01", "u1", "uinvented01; drop", A + "x".repeat(30)]) {
      await assert.rejects(h.internal.accountGone(bad));
      await assert.rejects(h.internal.accountChanged(bad));
    }
    assert.equal(h.stamp(), stamp);
    assert.equal(h.registered(A), true);
    assert.equal(h.sessionsOf(A), 1);
    // and twice is once, for an account that was never here too
    await h.internal.accountGone("uneverhere1");
    await h.internal.accountGone("uneverhere1");
    await h.internal.accountChanged("uneverhere2");
    assert.equal(h.registered("uneverhere1"), false);
    assert.equal(await h.internal.count(), 1);
  } finally {
    h.close();
  }
});

// --- frames and sizes -----------------------------------------------------------------------

test("second: a blob taken out of a push is a view of its own bytes only, and a stored blob is a copy", async () => {
  const h = harness();
  try {
    const cookie = await h.login(A);
    const vault = newId();
    assert.equal((await h.send("/api/vault/start", cookie, startBody(vault))).status, 200);
    const blobs = [new Uint8Array(40).fill(1), new Uint8Array(41).fill(2)];
    const ids = [newId(), newId()];
    const push = packPush(
      vault,
      ids.map((id, i) => ({ id, base: 0, blob: blobs[i]! })),
    );
    assert.equal(unpackPushed(new Uint8Array(await (await h.send("/api/sync/push", cookie, push)).arrayBuffer()))?.ok, true);
    const pulled = unpackPulled(new Uint8Array(await (await h.send("/api/sync/pull", cookie, JSON.stringify({ vault, since: 0 }))).arrayBuffer()));
    assert.ok(pulled && pulled.ok);
    assert.deepEqual(
      pulled.chunks.map((c) => [c.id, c.blob.length, c.blob[0]]),
      [
        [ids[0], 40, 1],
        [ids[1], 41, 2],
      ],
    );
    const stored = h.stores.get(A)!.raw.prepare("SELECT length(blob) AS n FROM chunks ORDER BY version").all().map((r) => Number(r.n));
    assert.deepEqual(stored, [40, 41]);
  } finally {
    h.close();
  }
});

test("second: a push body larger than its stated length, or with no length, is not read", async () => {
  const h = harness();
  try {
    const cookie = await h.login(A);
    const noLength = new Request(`${ORIGIN}/api/sync/push`, { method: "POST", headers: { Origin: ORIGIN, Cookie: cookie, "Content-Type": "application/octet-stream" }, body: new Uint8Array(8) });
    noLength.headers.delete("Content-Length");
    assert.equal((await h.fetch(noLength)).status, 411);
    assert.equal((await h.send("/api/sync/push", cookie, new Uint8Array(8), { "Content-Length": String(4 + LIMITS.batchBytes + HEAD_MAX + 1) })).status, 413);
    assert.equal((await h.send("/api/vault", cookie, "{}", { "Content-Length": "4097" })).status, 413);
    assert.equal((await h.send("/api/vault", cookie, "{}", { "Content-Type": "text/plain" })).status, 415);
  } finally {
    h.close();
  }
});

test("second: finding 3 (resolved at C10): the largest frame `unframe` and `pushChunks` accept passes the Worker and the object; a byte more does not", async () => {
  const h = harness();
  try {
    const cookie = await h.login(A);
    assert.equal((await h.send("/api/vault/start", cookie, startBody(newId()))).status, 200);
    const largest = 4 + HEAD_MAX + LIMITS.batchBytes;
    // (bytes that are not a frame: past both size checks, the object reads them and says it is no request)
    const at = await h.send("/api/sync/push", cookie, new Uint8Array(largest));
    assert.equal(at.status, 400);
    assert.equal(((await at.json()) as { why: string }).why, "bad-request");
    assert.equal((await h.send("/api/sync/push", cookie, new Uint8Array(largest + 1))).status, 413);
  } finally {
    h.close();
  }
});
