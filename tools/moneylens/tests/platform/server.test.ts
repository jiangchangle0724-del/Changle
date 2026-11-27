// The server itself, on Cloudflare's own runtime on this machine (`wrangler dev`): the Worker, each
// person's Durable Object with its SQLite, the registry, and `Internal`, with a stand-in for the
// accounts service beside it (tests/accounts). `npm run test:server`. It is not part of `npm test`,
// which needs no runtime but Node's.
//
// The rules are tested where they are written, on Node (tests/shell.test.ts, sessions, chunks,
// request, wire). What is tested here is that the Worker applies them to real requests: T-1 and
// T-2 (two people), T-3 (sessions and handoff codes), T-6 (no marker in what the server stores),
// T-14 (quotas), T-22 (the Origin), T-23 (the gate), and what Node's SQLite cannot show: that a
// Durable Object's storage takes and gives what the code expects, and keeps it over a restart.
//
// Every request goes in through the stand-in, which passes it on untouched as if it had come to
// money.changle.test. The settings are wrangler.jsonc's own, with the gate and the origin of a test.
// The app's pages are built first (scripts/build-app.mjs), and handed out from where they were built.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { deviceOf, endDevice, endOthers, listing, restOf, wrongOf, type Listing } from "../../src/app/devices";
import type { Ask } from "../../src/app/door";
import { base64url, newId } from "../../src/core/ids";
import { HEAD_MAX, packPush, unpackPulled, unpackPushed } from "../../src/server/wire";
import { createVault, unlock, type Secret, type Wrapper } from "../../src/vault/crypto";
import { MemoryCache } from "../../src/vault/memory";
import { isProofParams, newProof, proofOf } from "../../src/vault/proof";
import { LIMITS, Store } from "../../src/vault/sync";
import { HttpRemote } from "../../src/web/remote";
import { testVault } from "../vaulthelp";
import { isAccount } from "../../src/server/request";
import { MAIN, ORIGIN, plainJson, start, type Server } from "./run";

/** Two people who are let in, and one who is not. */
const [A, B, C] = ["utestaaaa1", "utestbbbb2", "utestcccc3"];
const MARKER = "MARKER-CAFE-MAPLE-7731";

// ---------------------------------------------------------------------------------------------
// A browser, as far as these tests need one
// ---------------------------------------------------------------------------------------------

/** The cookies a browser would hold for this origin. */
type Jar = Map<string, string>;

/** What every answer carries (SEC-1), and what none does. */
function checked(answer: Response): Response {
  assert.equal(answer.headers.get("Cache-Control"), "no-store");
  assert.equal(answer.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(answer.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(answer.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assert.equal(answer.headers.get("X-Frame-Options"), "DENY");
  assert.match(answer.headers.get("Content-Security-Policy") ?? "", /default-src 'none'; frame-ancestors 'none'/);
  for (const [name] of answer.headers) assert.ok(!/^access-control-|^x-ml-/i.test(name), `an answer carries ${name}`);
  return answer;
}

function took(jar: Jar, answer: Response): void {
  for (const set of answer.headers.getSetCookie()) {
    const [, name, value] = /^([^=]+)=([^;]*)/.exec(set)!;
    // every cookie is host-only, for this origin's own requests, and out of scripts' reach (ARCH-4)
    assert.match(set, /^__Host-ml(-n)?=[^;]*; Max-Age=\d+; Path=\/; Secure; HttpOnly; SameSite=Strict$/, set);
    if (/Max-Age=0;/.test(set)) jar.delete(name!);
    else jar.set(name!, value!);
  }
}

type Sent = { headers?: Record<string, string>; origin?: string | null; method?: string };

async function send(server: Server, path: string, body: string | Uint8Array | null, jar: Jar, { headers = {}, origin = ORIGIN, method = "POST" }: Sent = {}): Promise<Response> {
  const answer = checked(
    await fetch(`${server.base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(origin === null ? {} : { Origin: origin }),
        ...(body === null ? {} : { "Content-Type": typeof body === "string" ? "application/json" : "application/octet-stream" }),
        ...(jar.size ? { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
        ...headers,
      },
      ...(body === null ? {} : { body: body as BodyInit }),
    }),
  );
  took(jar, answer);
  return answer;
}
const said = async (answer: Response): Promise<[number, unknown]> => [answer.status, ((await answer.json()) as { why?: unknown }).why];

/** A handoff code, made by the stand-in for the accounts service as the main site would have one made for whoever is signed in there. */
async function codeFor(server: Server, id: string, nonce: string, more: { master?: boolean; aud?: string; during?: Notice } = {}): Promise<string> {
  const made = await fetch(`${server.base}/test/mint`, { method: "POST", body: JSON.stringify({ id, nonce, master: more.master ?? false, aud: more.aud ?? "moneylens", during: more.during }) });
  return ((await made.json()) as { code: string }).code;
}
/** A notice from the accounts service that is sent, and heard, while a code is being traded: after the trade, before its answer (tests/accounts/worker.ts). */
type Notice = { what: "gone" | "changed"; id: string };

/** Signs in as an account, the whole way round: /enter, the nonce to the main site, a code back, the trade. */
async function signInAs(server: Server, account: string, more: { master?: boolean; during?: Notice } = {}): Promise<{ jar: Jar; answer: Response }> {
  const jar: Jar = new Map();
  const entered = await send(server, "/enter", null, jar, { method: "GET", origin: null });
  assert.equal(entered.status, 302);
  const nonce = new URL(entered.headers.get("Location")!).searchParams.get("handoff")!;
  const answer = await send(server, "/api/session", JSON.stringify({ code: await codeFor(server, account, nonce, more) }), jar);
  return { jar, answer };
}

/** A way in to show a proof for: its id, and the proof. */
type Key = { id: string; proof: string };
/** The ways in of the vaults these tests started, by vault, for the tests that come back to one with another session. */
const KEYS = new Map<string, { passphrase: Key; recovery: Key }>();
const token = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));

/**
 * Starts a vault with two ways in, as a device does. What is inside a wrapper and a proof's parameters is the
 * device's business and is not looked at by the server (tests/ways.test.ts); the last test of this section does it
 * with real ones.
 */
async function beginVault(server: Server, jar: Jar, vault: string): Promise<Response> {
  const one = (kind: "passphrase" | "recovery") => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA" }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: token() });
  const [passphrase, recovery] = [one("passphrase"), one("recovery")];
  const answer = await send(server, "/api/vault/start", JSON.stringify({ vault, ways: [passphrase, recovery] }), jar);
  if (answer.status === 200 && !KEYS.has(vault)) KEYS.set(vault, { passphrase: { id: passphrase.wrapper.id, proof: passphrase.proof }, recovery: { id: recovery.wrapper.id, proof: recovery.proof } });
  return answer;
}
/** Shows a vault's passphrase proof for this session, as a device that was not the one to make the vault does. */
const unlockAs = (server: Server, jar: Jar, vault: string): Promise<Response> => send(server, "/api/vault/unlock", JSON.stringify(KEYS.get(vault)!.passphrase), jar);

/** The device's own way to the server (web/remote.ts), with this jar's cookies. */
const remoteFor = (server: Server, jar: Jar): HttpRemote =>
  new HttpRemote(async (input, init) => {
    const { headers, body } = init as { headers: Record<string, string>; body: string | Uint8Array };
    return send(server, new URL(String(input), "https://x").pathname, body, jar, { headers });
  });

// ---------------------------------------------------------------------------------------------
// The gate open to a list
// ---------------------------------------------------------------------------------------------

let server: Server;
before(async () => {
  execFileSync("node", ["scripts/build-app.mjs"], { stdio: "ignore" });
  server = await start(8795, { GATE: "list", ALLOWED_ACCOUNTS: `${A},${B}`, QUOTA_WRITES_PER_DAY: "10" });
});
after(async () => {
  await server.stop();
  rmSync(server.kept, { recursive: true, force: true });
});

test("only the app's page, /enter and POST /api answer, with the same headers on everything", async () => {
  const none: Jar = new Map();
  for (const path of ["/index.html", "/index", "/api", "/enterprise", "/enter/", "/.well-known/security.txt", "/API/sessions", "/assets", "/assets/", "/assets/nothing.js", "/assets/fonts", "/assets/..%2findex.html", "/assets/..%2flicences.txt", "/assets//icon.svg", "/assets/icon.svg/", "/licences", "/Licences.txt", "//"])
    assert.deepEqual(await said(await send(server, path, null, none, { method: "GET", origin: null })), [404, "no-such-thing"], path);
  assert.deepEqual(await said(await send(server, "/api/nothing", "{}", none)), [404, "no-such-thing"]);
  // /api is POST only, whatever is asked for
  for (const method of ["GET", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
    const answer = await send(server, "/api/sessions", null, none, { method });
    assert.deepEqual([answer.status, answer.headers.get("Allow")], [405, "POST"], method);
  }
  assert.equal((await send(server, "/enter", "{}", none)).status, 405);
  // /enter: a nonce in a cookie, and the same nonce on its way to the main site
  const jar: Jar = new Map();
  const entered = await send(server, "/enter", null, jar, { method: "GET", origin: null });
  const to = new URL(entered.headers.get("Location")!);
  assert.deepEqual([entered.status, to.origin, to.pathname, [...to.searchParams.keys()]], [302, MAIN, "/tools/finance", ["handoff"]]);
  assert.match(to.searchParams.get("handoff")!, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual([...jar], [["__Host-ml-n", to.searchParams.get("handoff")]]);
  // (each one is new)
  const again: Jar = new Map();
  await send(server, "/enter", null, again, { method: "GET", origin: null });
  assert.notEqual(again.get("__Host-ml-n"), jar.get("__Host-ml-n"));
  // only from this origin's own page (or a browser that does not say where from): sent to /enter from anywhere else, a browser is shown the page and no sign-in is begun
  for (const from of ["cross-site", "same-site", "none"]) {
    const sent: Jar = new Map();
    const shown = await send(server, "/enter", null, sent, { method: "GET", origin: null, headers: { "Sec-Fetch-Site": from } });
    assert.deepEqual([shown.status, shown.headers.get("Location"), [...sent]], [302, `${ORIGIN}/`, []], from);
  }
  const own: Jar = new Map();
  assert.equal(new URL((await send(server, "/enter", null, own, { method: "GET", origin: null, headers: { "Sec-Fetch-Site": "same-origin" } })).headers.get("Location")!).origin, MAIN);
  assert.equal(own.size, 1);
});

test("a request whose Origin is not this origin gets nothing, sync included (T-22)", async () => {
  const { jar } = await signInAs(server, A);
  const paths = ["session", "session/end", "sessions", "sessions/end", "vault", "vault/start", "sync/pull", "sync/push", "events", "nothing"];
  for (const path of paths) {
    const body = path === "sync/push" ? new Uint8Array(8) : "{}";
    for (const origin of [null, "https://changle.ca", "https://evil.example", "http://money.changle.test", "https://money.changle.test.evil.example", "https://MONEY.changle.test", "null", `${ORIGIN}/`])
      assert.deepEqual(await said(await send(server, `/api/${path}`, body, new Map(jar), { origin })), [403, "origin"], `${path} from ${origin}`);
    // the right Origin on a request the browser says came from another site, or from a page of the main site
    for (const site of ["cross-site", "same-site", "none"]) assert.deepEqual(await said(await send(server, `/api/${path}`, body, new Map(jar), { headers: { "Sec-Fetch-Site": site } })), [403, "origin"], `${path} ${site}`);
  }
  // and with it, from this origin's own page, the same request is answered
  assert.equal((await send(server, "/api/sessions", "{}", jar, { headers: { "Sec-Fetch-Site": "same-origin" } })).status, 200);
  // nothing above signed anyone out
  assert.equal((await send(server, "/api/sessions", "{}", jar)).status, 200);
});

test("a handoff code works once, for its audience and its browser, and a session is what gets in (T-3)", async () => {
  const fresh = async (): Promise<{ jar: Jar; nonce: string }> => {
    const jar: Jar = new Map();
    const entered = await send(server, "/enter", null, jar, { method: "GET", origin: null });
    return { jar, nonce: new URL(entered.headers.get("Location")!).searchParams.get("handoff")! };
  };
  // the trade: a session cookie, and the nonce's cookie is gone
  const one = await fresh();
  const code = await codeFor(server, A, one.nonce);
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  const traded = await send(server, "/api/session", JSON.stringify({ code }), one.jar);
  assert.deepEqual([traded.status, await traded.json()], [200, { ok: true }]);
  assert.deepEqual([...one.jar.keys()], ["__Host-ml"]);
  assert.match(one.jar.get("__Host-ml")!, new RegExp(`^${A}\\.[A-Za-z0-9_-]{43}$`));
  assert.equal((await send(server, "/api/sessions", "{}", one.jar)).status, 200);
  // the same code again, from the same browser state: nothing
  const replay: Jar = new Map([["__Host-ml-n", one.nonce]]);
  assert.deepEqual(await said(await send(server, "/api/session", JSON.stringify({ code }), replay)), [401, "code"]);
  assert.deepEqual([...replay], []);
  // a code made for another audience; one bound to another browser's nonce; one for an id that is no account
  for (const make of [(nonce: string) => codeFor(server, A, nonce, { aud: "split" }), () => codeFor(server, A, newId() + newId()), (nonce: string) => codeFor(server, "not an account", nonce), async () => base64url(crypto.getRandomValues(new Uint8Array(32)))]) {
    const next = await fresh();
    assert.deepEqual(await said(await send(server, "/api/session", JSON.stringify({ code: await make(next.nonce) }), next.jar)), [401, "code"]);
    assert.deepEqual([...next.jar], []);
  }
  // without the cookie from /enter nothing is traded, and the code is not spent on it
  const lost = await fresh();
  const kept = await codeFor(server, A, lost.nonce);
  assert.deepEqual(await said(await send(server, "/api/session", JSON.stringify({ code: kept }), new Map())), [400, "no-nonce"]);
  assert.equal((await send(server, "/api/session", JSON.stringify({ code: kept }), lost.jar)).status, 200);
  // what is no code at all
  for (const body of ["{}", "[]", "nope", JSON.stringify({ code: 5 }), JSON.stringify({ code: "short" }), JSON.stringify({ code: "has spaces in it, and is long enough" })]) {
    const next = await fresh();
    assert.deepEqual(await said(await send(server, "/api/session", body, next.jar)), [400, "bad-request"], body);
  }
  // no session, a made-up one, another site's token, two cookies of the name: nothing, and the cookie is cleared
  for (const cookie of [null, `${A}.${"x".repeat(43)}`, "eyJhbGciOiJIUzI1NiJ9.e30.abc", `${A}.short`, "garbage"]) {
    const jar: Jar = new Map(cookie === null ? [] : [["__Host-ml", cookie]]);
    assert.deepEqual(await said(await send(server, "/api/sessions", "{}", jar)), [401, "signed-out"], String(cookie));
    assert.deepEqual([...jar], []);
  }
  const doubled = await send(server, "/api/sessions", "{}", new Map(), { headers: { Cookie: `__Host-ml=${one.jar.get("__Host-ml")}; __Host-ml=${one.jar.get("__Host-ml")}` } });
  assert.equal(doubled.status, 401);
  // signing out ends it here and now, and clears the cookie
  const out = await send(server, "/api/session/end", "{}", one.jar);
  assert.deepEqual([out.status, [...one.jar]], [200, []]);
});

test("the gate: an account that is not on the list gets nothing from any route (T-23)", async () => {
  const refused = await signInAs(server, C);
  assert.deepEqual(await said(refused.answer), [403, "not-admitted"]);
  assert.deepEqual([...refused.jar], []);
  // the owner is not on the list either
  assert.deepEqual(await said((await signInAs(server, C, { master: true })).answer), [403, "not-admitted"]);
  // a cookie that names such an account, with any token, and with the token of someone who is let in
  const { jar } = await signInAs(server, A);
  const token = jar.get("__Host-ml")!.split(".")[1]!;
  for (const path of ["session/end", "sessions", "sessions/end", "vault", "vault/start", "sync/pull", "events"]) {
    for (const cookie of [`${C}.${"y".repeat(43)}`, `${C}.${token}`]) {
      const forged: Jar = new Map([["__Host-ml", cookie]]);
      assert.deepEqual(await said(await send(server, `/api/${path}`, "{}", forged)), [403, "not-admitted"], path);
      assert.deepEqual([...forged], []);
    }
  }
  assert.deepEqual(await said(await send(server, "/api/sync/push", new Uint8Array(8), new Map([["__Host-ml", `${C}.${token}`]]))), [403, "not-admitted"]);
});

test("two people: each gets their own, through every route, and neither the other's (T-1, T-2)", async () => {
  const [a, b] = [await signInAs(server, A), await signInAs(server, B)];
  const [vaultA, vaultB] = [newId(), newId()];
  assert.equal((await beginVault(server, a.jar, vaultA)).status, 200);
  assert.equal((await beginVault(server, b.jar, vaultB)).status, 200);
  // A shows B's proof for B's way in: A's own database is asked, which has no such way in
  assert.deepEqual(await said(await send(server, "/api/vault/unlock", JSON.stringify(KEYS.get(vaultB)!.passphrase), a.jar)), [404, "no-way"]);
  assert.deepEqual(await said(await send(server, "/api/vault/way", JSON.stringify({ id: KEYS.get(vaultB)!.passphrase.id }), a.jar)), [404, "no-way"]);
  const blob = (fill: number): Uint8Array => new Uint8Array(100).fill(fill);
  const [chunkA, chunkB] = [newId(), newId()];
  const push = async (jar: Jar, vault: string, id: string, fill: number): Promise<unknown> => unpackPushed(new Uint8Array(await (await send(server, "/api/sync/push", packPush(vault, [{ id, base: 0, blob: blob(fill) }]), jar)).arrayBuffer()));
  const pull = async (jar: Jar, vault: string): Promise<unknown> => unpackPulled(new Uint8Array(await (await send(server, "/api/sync/pull", JSON.stringify({ vault, since: 0 }), jar)).arrayBuffer()));
  assert.deepEqual(await push(a.jar, vaultA, chunkA, 1), { ok: true, versions: [{ id: chunkA, version: 1 }] });
  assert.deepEqual(await push(b.jar, vaultB, chunkB, 2), { ok: true, versions: [{ id: chunkB, version: 1 }] });
  // each pulls what is theirs
  const mine = (await pull(a.jar, vaultA)) as { ok: true; chunks: { id: string; blob: Uint8Array }[] };
  assert.deepEqual(mine.chunks, [{ id: chunkA, version: 1, blob: blob(1) }]);
  // A names B's vault, and B's chunk: A's own database is asked, which holds neither
  assert.deepEqual(await pull(a.jar, vaultB), { ok: false, why: "wrong-vault" });
  assert.deepEqual(await push(a.jar, vaultB, chunkB, 9), { ok: false, why: "wrong-vault" });
  assert.deepEqual(await push(a.jar, vaultA, chunkB, 9), { ok: true, versions: [{ id: chunkB, version: 2 }] });
  assert.deepEqual(((await pull(b.jar, vaultB)) as typeof mine).chunks, [{ id: chunkB, version: 1, blob: blob(2) }]);
  // A's token under B's name is asked for in B's database, which does not know it; and is not signed in as A either way
  const tokenA = a.jar.get("__Host-ml")!.split(".")[1]!;
  for (const path of ["sessions", "vault", "events", "sync/pull", "session/end", "sessions/end", "vault/start"]) assert.deepEqual(await said(await send(server, `/api/${path}`, "{}", new Map([["__Host-ml", `${B}.${tokenA}`]]))), [401, "signed-out"], path);
  // the lists are each person's own, and one cannot end the other's session by its id
  const sessionsOf = async (jar: Jar): Promise<{ id: string; here: boolean }[]> => ((await (await send(server, "/api/sessions", "{}", jar)).json()) as { sessions: { id: string; here: boolean }[] }).sessions;
  const [listA, listB] = [await sessionsOf(a.jar), await sessionsOf(b.jar)];
  assert.ok(listA.every((one) => !listB.some((other) => other.id === one.id)));
  const hers = listB.find((one) => one.here)!.id;
  assert.deepEqual(await said(await send(server, "/api/sessions/end", JSON.stringify({ id: hers }), a.jar)), [404, "no-session"]);
  assert.equal((await send(server, "/api/sessions", "{}", b.jar)).status, 200);
  assert.equal(((await (await send(server, "/api/vault", "{}", b.jar)).json()) as { vault: string }).vault, vaultB);
  // signing out everywhere else is everywhere else of one's own
  assert.equal((await send(server, "/api/sessions/end", JSON.stringify({ others: true }), a.jar)).status, 200);
  assert.equal((await send(server, "/api/sessions", "{}", b.jar)).status, 200);
});

test("devices sync through it, and what it stores holds none of what they wrote (T-6)", async () => {
  const account = "utestsync4";
  const listed = await start(8796, { GATE: "list", ALLOWED_ACCOUNTS: account });
  try {
    const vault = await testVault();
    const [phone, laptop] = [await signInAs(listed, account), await signInAs(listed, account)];
    assert.equal((await beginVault(listed, phone.jar, vault.id)).status, 200);
    const [one, two] = [await Store.open(vault, new MemoryCache()), await Store.open(vault, new MemoryCache())];
    // The laptop is signed in and has not unlocked: its sync reports no answer, and its way to the server says why.
    const early = remoteFor(listed, laptop.jar);
    const shut = await two.sync(early);
    assert.deepEqual([shut.ok, !shut.ok && shut.why, early.locked, early.signedOut], [false, "offline", true, null]);
    assert.equal((await unlockAs(listed, laptop.jar, vault.id)).status, 200);
    // (and once it has unlocked, the same way to the server says so no longer)
    assert.ok((await two.sync(early)).ok);
    assert.equal(early.locked, false);
    const ids = Array.from({ length: 40 }, () => newId());
    ids.forEach((id, i) => assert.deepEqual(one.add("txn", "t/2026-10", { id, description: `${MARKER} ${i}`, amount: -450 - i, posted: "2026-10-02" }), { ok: true }));
    const first = await one.sync(remoteFor(listed, phone.jar));
    assert.ok(first.ok && first.sent > 0, JSON.stringify(first));
    const second = await two.sync(remoteFor(listed, laptop.jar));
    assert.ok(second.ok && second.received > 0, JSON.stringify(second));
    assert.equal(two.list("txn").length, 40);
    // each changes something else, and they come to the same
    assert.deepEqual(one.change(ids[0]!, { note: `${MARKER} from the phone` }), { ok: true });
    assert.deepEqual(two.change(ids[1]!, { note: `${MARKER} from the laptop` }), { ok: true });
    for (const [store, jar] of [[one, phone.jar], [two, laptop.jar], [one, phone.jar]] as const) assert.ok((await store.sync(remoteFor(listed, jar))).ok);
    const sorted = (store: Store): string => JSON.stringify(store.list("txn").map((value) => JSON.stringify(value)).sort());
    assert.equal(sorted(one), sorted(two));
    assert.ok(sorted(one).includes(`${MARKER} from the laptop`) && sorted(two).includes(`${MARKER} from the phone`));
    // a device that is signed out: its sync reports no answer, and its way to the server says why
    const way = remoteFor(listed, laptop.jar);
    assert.ok((await two.sync(way)).ok);
    assert.equal(way.signedOut, null);
    await send(listed, "/api/session/end", "{}", laptop.jar);
    const cut = await two.sync(way);
    assert.deepEqual([cut.ok, !cut.ok && cut.why, way.signedOut], [false, "offline", 401]);
    // Stopped, so that everything is on disk; then every file the runtime kept is searched for the marker, as text and
    // as the UTF-16 some stores use. (That there is something to search is checked too.)
    await listed.stop();
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(join(listed.kept, "state"));
    let bytes = 0;
    for (const file of files) {
      const held = readFileSync(file);
      bytes += held.length;
      for (const needle of [Buffer.from(MARKER, "utf8"), Buffer.from(MARKER, "utf16le"), Buffer.from("from the phone", "utf8")]) assert.equal(held.indexOf(needle), -1, `${file} holds what a device wrote`);
    }
    assert.ok(bytes > 10_000, `only ${bytes} bytes were kept`);
  } finally {
    await listed.stop();
    rmSync(listed.kept, { recursive: true, force: true });
  }
});

test("a second device opens the vault: the parameters, its proof, the wrapper, the key (VAULT-7, threat 1)", async () => {
  const account = "utestdoor9";
  const open = await start(8793, { GATE: "list", ALLOWED_ACCOUNTS: account });
  try {
    const passphrase = "seven tidal marmots in a canoe";
    const [phone, laptop] = [await signInAs(open, account), await signInAs(open, account)];
    // The phone makes the vault: a key, its two wrappers, a proof for each, and the recovery code, which only the person keeps.
    const created = await createVault(passphrase);
    assert.ok(created.ok);
    const secrets: Secret[] = [
      { kind: "passphrase", passphrase },
      { kind: "recovery", code: created.recoveryCode },
    ];
    const ways = await Promise.all(created.wrappers.map(async (wrapper, i) => ({ wrapper, ...(await newProof(created.vault.id, secrets[i]!))! })));
    assert.equal((await send(open, "/api/vault/start", JSON.stringify({ vault: created.vault.id, ways }), phone.jar)).status, 200);
    const store = await Store.open(created.vault, new MemoryCache());
    assert.deepEqual(store.add("txn", "t/2026-11", { id: newId(), description: `${MARKER} kept`, amount: -1250, posted: "2026-11-20" }), { ok: true });
    assert.ok((await store.sync(remoteFor(open, phone.jar))).ok);

    // The laptop knows the passphrase and nothing else. What it is given before it proves that: which vault, which ways in, and a salt.
    const seen = (await (await send(open, "/api/vault", "{}", laptop.jar)).json()) as { vault: string; unlocked: boolean; ways: { id: string; kind: string }[] };
    assert.deepEqual([seen.vault, seen.unlocked, seen.ways.map((w) => w.kind).sort()], [created.vault.id, false, ["passphrase", "recovery"]]);
    const asked = (await (await send(open, "/api/vault/way", JSON.stringify({ kind: "passphrase" }), laptop.jar)).json()) as { id: string; params: unknown };
    assert.ok(isProofParams(asked.params));
    assert.equal(JSON.stringify([seen, asked]).includes(created.wrappers[0].wrapped), false);
    // what is no proof at all goes no further, and is not counted as a guess
    assert.deepEqual(await said(await send(open, "/api/vault/unlock", JSON.stringify({ id: asked.id, proof: "short" }), laptop.jar)), [400, "bad-request"]);
    assert.deepEqual(await said(await send(open, "/api/vault/unlock", JSON.stringify({ id: asked.id }), laptop.jar)), [400, "bad-request"]);
    // a wrong passphrase makes a proof like any other, and the server says no; nothing is handed over
    const wrong = await send(open, "/api/vault/unlock", JSON.stringify({ id: asked.id, proof: await proofOf(seen.vault, asked.params, { kind: "passphrase", passphrase: "seven tidal marmots in a kayak" }) }), laptop.jar);
    assert.deepEqual([wrong.status, await wrong.json()], [422, { ok: false, why: "wrong-secret", left: 9 }]);
    // the right one: the wrapper comes back as the phone made it, and it opens under the passphrase
    const right = await send(open, "/api/vault/unlock", JSON.stringify({ id: asked.id, proof: await proofOf(seen.vault, asked.params, secrets[0]!) }), laptop.jar);
    assert.equal(right.status, 200);
    const { wrapper } = (await right.json()) as { wrapper: Wrapper };
    assert.deepEqual(wrapper, created.wrappers[0]);
    const opened = await unlock(wrapper, secrets[0]!, seen.vault);
    assert.ok(opened.ok);
    const mirror = await Store.open(opened.vault, new MemoryCache());
    assert.ok((await mirror.sync(remoteFor(open, laptop.jar))).ok);
    assert.deepEqual(mirror.list("txn").map((t) => (t as unknown as { description: string }).description), [`${MARKER} kept`]);

    // A third device has only the recovery code: the same steps, by the other way in.
    const tablet = await signInAs(open, account);
    const other = (await (await send(open, "/api/vault/way", JSON.stringify({ kind: "recovery" }), tablet.jar)).json()) as { id: string; params: unknown };
    assert.ok(isProofParams(other.params));
    const byCode = await send(open, "/api/vault/unlock", JSON.stringify({ id: other.id, proof: await proofOf(seen.vault, other.params, secrets[1]!) }), tablet.jar);
    assert.equal(byCode.status, 200);
    assert.ok((await unlock(((await byCode.json()) as { wrapper: Wrapper }).wrapper, secrets[1]!, seen.vault)).ok);
    // the log has all of it, newest first, and no word of what was shown
    const events = ((await (await send(open, "/api/events", "{}", tablet.jar)).json()) as { events: { kind: string }[] }).events.map((e) => e.kind);
    assert.deepEqual(events, ["unlocked", "sign-in", "unlocked", "unlock-failed", "vault-started", "sign-in", "sign-in"]);

    // What their owner is shown of all this, read the way the page reads it (src/app/devices.ts): three devices,
    // each holding the vault open; and the wrong passphrase, apart from the rest and known to be the laptop's.
    const askAs =
      (jar: Jar): Ask =>
      async (action, body = {}) => {
        const answer = await send(open, `/api/${action}`, JSON.stringify(body), jar);
        return { status: answer.status, json: (await answer.json().catch(() => ({}))) as Record<string, unknown> };
      };
    const shown = await listing(askAs(tablet.jar));
    assert.ok(shown.ok);
    assert.deepEqual(shown.devices.map((one) => [one.here, one.unlocked]).sort(), [[false, true], [false, true], [true, true]]);
    assert.equal(shown.wrong, 1);
    const [missed] = wrongOf(shown.lines);
    const laptopHere = (await listing(askAs(laptop.jar))) as Extract<Listing, { ok: true }>;
    const laptopId = laptopHere.devices.find((one) => one.here)!.id;
    assert.deepEqual([wrongOf(shown.lines).length, missed!.session, missed!.here], [1, laptopId, false]);
    assert.deepEqual(deviceOf(missed!, shown.devices), { at: "listed", label: "Browser" });
    assert.deepEqual(wrongOf(laptopHere.lines).map((one) => one.here), [true]);
    // the laptop locks: it is signed in still, and holds nothing open
    assert.equal((await send(open, "/api/vault/lock", "{}", laptop.jar)).status, 200);
    const locked = (await listing(askAs(tablet.jar))) as Extract<Listing, { ok: true }>;
    assert.deepEqual(Object.fromEntries(locked.devices.map((one) => [one.id, one.unlocked]))[laptopId], false);
    assert.equal(locked.devices.filter((one) => one.unlocked).length, 2);
    // the tablet signs the laptop out: it is in no list any more, its wrong try is still shown, and it can ask nothing
    assert.equal(await endDevice(askAs(tablet.jar), laptopId), "ok");
    assert.equal(await endDevice(askAs(tablet.jar), laptopId), "gone");
    const after = (await listing(askAs(tablet.jar))) as Extract<Listing, { ok: true }>;
    assert.deepEqual([after.devices.length, after.devices.some((one) => one.id === laptopId), after.wrong], [2, false, 1]);
    assert.deepEqual(deviceOf(wrongOf(after.lines)[0]!, after.devices), { at: "gone" });
    assert.deepEqual(await listing(askAs(new Map(laptop.jar))), { ok: false, why: "signed-out" });
    // and all the others at once: the phone goes, the tablet stays
    assert.deepEqual(await endOthers(askAs(tablet.jar)), { ok: true, ended: 1 });
    assert.deepEqual(await endOthers(askAs(tablet.jar)), { ok: true, ended: 0 });
    assert.deepEqual(await listing(askAs(new Map(phone.jar))), { ok: false, why: "signed-out" });
    const alone = (await listing(askAs(tablet.jar))) as Extract<Listing, { ok: true }>;
    assert.deepEqual(alone.devices.map((one) => [one.here, one.unlocked]), [[true, true]]);
    assert.deepEqual(restOf(alone.lines).slice(0, 2).map((one) => [one.kind, one.here]), [["sessions-ended", true], ["session-ended", true]]);
  } finally {
    await open.stop();
    rmSync(open.kept, { recursive: true, force: true });
  }
});

test("bodies: of the stated kind, with a stated length, and no longer than the kind may be (SEC-5)", async () => {
  const { jar } = await signInAs(server, A);
  // the wrong kind for the route, or none
  assert.deepEqual(await said(await send(server, "/api/sessions", "{}", jar, { headers: { "Content-Type": "text/plain" } })), [415, "content-type"]);
  assert.deepEqual(await said(await send(server, "/api/sessions", "{}", jar, { headers: { "Content-Type": "application/x-www-form-urlencoded" } })), [415, "content-type"]);
  assert.deepEqual(await said(await send(server, "/api/sync/push", "{}", jar)), [415, "content-type"]);
  assert.deepEqual(await said(await send(server, "/api/sync/pull", new Uint8Array(4), jar)), [415, "content-type"]);
  assert.equal((await send(server, "/api/sessions", "{}", jar, { headers: { "Content-Type": "application/json; charset=utf-8" } })).status, 200);
  // too long for what it is
  assert.deepEqual(await said(await send(server, "/api/sessions", JSON.stringify({ pad: "x".repeat(5000) }), jar)), [413, "too-big"]);
  assert.deepEqual(await said(await send(server, "/api/session", JSON.stringify({ code: "x".repeat(5000) }), new Map([["__Host-ml-n", newId() + newId()]]))), [413, "too-big"]);
  // (the largest push is a frame's four bytes of length, the largest head, and a batch of blobs: one byte more is too long)
  assert.deepEqual(await said(await send(server, "/api/sync/push", new Uint8Array(4 + HEAD_MAX + LIMITS.batchBytes + 1), jar)), [413, "too-big"]);
  // (a session that has not unlocked its vault is told so, whatever it pushes; this one unlocks, and then its push is looked at)
  assert.deepEqual(await said(await send(server, "/api/sync/push", new Uint8Array(64), jar)), [423, "locked"]);
  const held = ((await (await send(server, "/api/vault", "{}", jar)).json()) as { vault: string | null }).vault;
  assert.equal((held === null ? await beginVault(server, jar, newId()) : await unlockAs(server, jar, held)).status, 200);
  // as long as a push may be, and no frame: read, and refused for what it is
  assert.deepEqual(await said(await send(server, "/api/sync/push", new Uint8Array(4 + HEAD_MAX + LIMITS.batchBytes), jar)), [400, "bad-request"]);
  // a body sent in pieces, with no length stated
  const status = await new Promise<number>((done, failed) => {
    const request = http.request(`${server.base}/api/sessions`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: `__Host-ml=${jar.get("__Host-ml")}`, "Transfer-Encoding": "chunked" } }, (answer) => {
      answer.resume();
      done(answer.statusCode ?? 0);
    });
    request.on("error", failed);
    request.write("{");
    request.end("}");
  });
  assert.equal(status, 411);
  assert.equal((await send(server, "/api/sessions", "{}", jar)).status, 200);
});

test("the day's writes are counted, and the count holds (T-14)", async () => {
  const { jar } = await signInAs(server, B);
  const held = ((await (await send(server, "/api/vault", "{}", jar)).json()) as { vault: string | null; limits: { writesPerDay: number } });
  assert.equal(held.limits.writesPerDay, 10);
  const vault = held.vault ?? newId();
  if (held.vault === null) assert.equal((await beginVault(server, jar, vault)).status, 200);
  else assert.equal((await unlockAs(server, jar, vault)).status, 200);
  const push = async (count: number): Promise<{ ok: boolean; why?: string }> => unpackPushed(new Uint8Array(await (await send(server, "/api/sync/push", packPush(vault, Array.from({ length: count }, () => ({ id: newId(), base: 0, blob: new Uint8Array(64).fill(7) }))), jar)).arrayBuffer())) as { ok: boolean; why?: string };
  // (whatever this account wrote in the tests before this one counts too: fill the day, then one more)
  let room = 10;
  while (room > 0 && !(await push(room)).ok) room--;
  assert.deepEqual(await push(1), { ok: false, why: "quota-writes" });
  assert.deepEqual(await push(1), { ok: false, why: "quota-writes" });
  // reading is not writing
  assert.equal((await send(server, "/api/sync/pull", JSON.stringify({ vault, since: 0 }), jar)).status, 200);
});

test("the accounts service says an email changed, or an account is gone (ARCH-9, ARCH-10)", async () => {
  const account = "utestgone5";
  const open = await start(8797, { GATE: "list", ALLOWED_ACCOUNTS: `${account},${A}` });
  try {
    const tell = async (what: "gone" | "changed", id: string): Promise<number> => (await fetch(`${open.base}/test/${what}?id=${encodeURIComponent(id)}`)).status;
    const noted = async (): Promise<number> => ((await (await fetch(`${open.base}/test/count`)).json()) as { accounts: number }).accounts;
    // The registry: an account is noted the first time it signs in, and once. One that is not let in is not noted.
    assert.equal(await noted(), 0);
    assert.equal((await signInAs(open, C)).answer.status, 403);
    assert.equal(await noted(), 0);
    const [phone, laptop, bystander] = [await signInAs(open, account), await signInAs(open, account), await signInAs(open, A)];
    assert.equal(await noted(), 2);
    const vault = newId();
    assert.equal((await beginVault(open, phone.jar, vault)).status, 200);
    const chunk = newId();
    assert.equal((await send(open, "/api/sync/push", packPush(vault, [{ id: chunk, base: 0, blob: new Uint8Array(64).fill(3) }]), phone.jar)).status, 200);
    // the email changed: every device signs in again, and what is kept stays
    assert.equal(await tell("changed", account), 200);
    for (const jar of [phone.jar, laptop.jar]) assert.deepEqual(await said(await send(open, "/api/sessions", "{}", new Map(jar))), [401, "signed-out"]);
    const back = await signInAs(open, account);
    assert.equal(((await (await send(open, "/api/vault", "{}", back.jar)).json()) as { vault: string }).vault, vault);
    const events = ((await (await send(open, "/api/events", "{}", back.jar)).json()) as { events: { kind: string }[] }).events.map((e) => e.kind);
    assert.deepEqual(events.slice(0, 2), ["sign-in", "email-changed"]);
    // the account is gone: nothing of it is left, and saying so twice is saying it once
    assert.equal(await tell("gone", account), 200);
    assert.equal(await noted(), 1);
    assert.equal(await tell("gone", account), 200);
    assert.equal(await noted(), 1);
    assert.deepEqual(await said(await send(open, "/api/sessions", "{}", new Map(back.jar))), [401, "signed-out"]);
    // (were the account to exist again, it would start from nothing: no vault, no chunk, no event before this sign-in)
    const reborn = await signInAs(open, account);
    assert.equal(((await (await send(open, "/api/vault", "{}", reborn.jar)).json()) as { vault: null }).vault, null);
    assert.deepEqual(((await (await send(open, "/api/events", "{}", reborn.jar)).json()) as { events: { kind: string }[] }).events.map((e) => e.kind), ["sign-in"]);
    // an account that was never here, either way: done, without complaint. What is no account: an error, for the caller to see.
    assert.deepEqual([await tell("gone", "utestnever6"), await tell("changed", "utestnever6")], [200, 200]);
    assert.deepEqual([await tell("gone", "not an account"), await tell("changed", "")], [500, 500]);
    // nobody else was touched
    assert.equal((await send(open, "/api/sessions", "{}", bystander.jar)).status, 200);
  } finally {
    await open.stop();
    rmSync(open.kept, { recursive: true, force: true });
  }
});

test("a notice that comes while a code is being traded turns the sign-in away, and nothing is opened (the review of #814, finding 1)", async () => {
  const [account, late] = ["utestrace7", "utestlate8"];
  const open = await start(8794, { GATE: "list", ALLOWED_ACCOUNTS: `${account},${late},${A}` });
  try {
    const noted = async (): Promise<number> => ((await (await fetch(`${open.base}/test/count`)).json()) as { accounts: number }).accounts;
    const kinds = async (jar: Jar): Promise<string[]> => ((await (await send(open, "/api/events", "{}", jar)).json()) as { events: { kind: string }[] }).events.map((e) => e.kind);
    const devices = async (jar: Jar): Promise<number> => ((await (await send(open, "/api/sessions", "{}", jar)).json()) as { sessions: unknown[] }).sessions.length;
    const [phone, bystander] = [await signInAs(open, account), await signInAs(open, A)];
    assert.deepEqual([phone.answer.status, bystander.answer.status, await noted()], [200, 200, 2]);

    // The address changes while a laptop's code is being traded: no session for the laptop, no cookie, and the nonce is spent.
    const laptop = await signInAs(open, account, { during: { what: "changed", id: account } });
    assert.deepEqual(await said(laptop.answer), [503, "try-again"]);
    assert.deepEqual([...laptop.jar.keys()], []);
    // the phone was signed out by the notice, as everyone is
    assert.deepEqual(await said(await send(open, "/api/sessions", "{}", new Map(phone.jar))), [401, "signed-out"]);
    // trying again works, and the sign-in that was turned away left no trace: one device, and no line of its own in the log
    const again = await signInAs(open, account);
    assert.equal(again.answer.status, 200);
    assert.equal(await devices(again.jar), 1);
    assert.deepEqual(await kinds(again.jar), ["sign-in", "email-changed", "sign-in"]);

    // Someone else's notice while this account signs in: turned away too, and nothing else happens to it.
    const second = await signInAs(open, account, { during: { what: "changed", id: A } });
    assert.deepEqual(await said(second.answer), [503, "try-again"]);
    assert.equal(await devices(again.jar), 1);
    assert.deepEqual(await said(await send(open, "/api/sessions", "{}", new Map(bystander.jar))), [401, "signed-out"]);
    assert.equal((await signInAs(open, account)).answer.status, 200);
    assert.equal(await devices(again.jar), 2);

    // A first sign-in that is turned away: the account is on the registry (it still exists), and has nothing here.
    const first = await signInAs(open, late, { during: { what: "changed", id: A } });
    assert.deepEqual(await said(first.answer), [503, "try-again"]);
    assert.equal(await noted(), 3);
    const then = await signInAs(open, late);
    assert.equal(then.answer.status, 200);
    assert.deepEqual([await devices(then.jar), await kinds(then.jar)], [1, ["sign-in"]]);

    // The account is deleted while one of its codes is being traded: nothing is opened, nothing of it is left, and it is off the registry.
    const vault = newId();
    assert.equal((await beginVault(open, again.jar, vault)).status, 200);
    const last = await signInAs(open, account, { during: { what: "gone", id: account } });
    assert.deepEqual(await said(last.answer), [503, "try-again"]);
    assert.deepEqual([...last.jar.keys()], []);
    assert.equal(await noted(), 2);
    assert.deepEqual(await said(await send(open, "/api/sessions", "{}", new Map(again.jar))), [401, "signed-out"]);
    // (were the account to exist again, it would start from nothing)
    const reborn = await signInAs(open, account);
    assert.equal(((await (await send(open, "/api/vault", "{}", reborn.jar)).json()) as { vault: null }).vault, null);
    assert.deepEqual(await kinds(reborn.jar), ["sign-in"]);
    // and the other account that was here all along still is
    assert.equal(await devices(then.jar), 1);
  } finally {
    await open.stop();
    rmSync(open.kept, { recursive: true, force: true });
  }
});

test("a transaction inside a transaction, on this platform, is what signing in takes it to be", async () => {
  // (asked of a Durable Object of the tests' own: tests/accounts/worker.ts, `Probe`)
  const seen = (await (await fetch(`${server.base}/test/nested`)).json()) as { same: boolean; tables: number; rows: number[] };
  // the outer one failing takes the inner one's writes with it, what was thrown comes out as itself, and an inner one failing alone takes only its own
  assert.deepEqual(seen, { same: true, tables: 0, rows: [3, 5] });
});

test("what is kept is still there after the server stops and starts", async () => {
  const account = "utestkeep7";
  let run = await start(8798, { GATE: "list", ALLOWED_ACCOUNTS: account });
  try {
    const { jar } = await signInAs(run, account);
    const vault = newId();
    assert.equal((await beginVault(run, jar, vault)).status, 200);
    const blob = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 31) % 251);
    const chunk = newId();
    assert.equal((await send(run, "/api/sync/push", packPush(vault, [{ id: chunk, base: 0, blob }]), jar)).status, 200);
    await run.stop();
    run = await start(8798, { GATE: "list", ALLOWED_ACCOUNTS: account }, run.kept);
    // the same cookie, the same vault, the same bytes
    const pulled = unpackPulled(new Uint8Array(await (await send(run, "/api/sync/pull", JSON.stringify({ vault, since: 0 }), jar)).arrayBuffer())) as { ok: true; chunks: { id: string; version: number; blob: Uint8Array }[] };
    assert.deepEqual([pulled.chunks.length, pulled.chunks[0]!.id, pulled.chunks[0]!.version], [1, chunk, 1]);
    assert.deepEqual(pulled.chunks[0]!.blob, blob);
    // and with the gate shut on the same storage, the same cookie gets nothing
    await run.stop();
    run = await start(8798, { GATE: "closed" }, run.kept);
    assert.deepEqual(await said(await send(run, "/api/sessions", "{}", new Map(jar))), [403, "closed"]);
  } finally {
    await run.stop();
    rmSync(run.kept, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// The app's pages
// ---------------------------------------------------------------------------------------------

const PAGE_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const NOTHING_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** A page or a file of the app, asked for as a browser asks. What every answer carries (SEC-1) is checked; what differs between them is given back. */
async function got(from: Server, path: string, method = "GET"): Promise<{ status: number; type: string | null; kept: string | null; policy: string | null; body: Uint8Array }> {
  const answer = await fetch(`${from.base}${path}`, { method, redirect: "manual", headers: { Cookie: `__Host-ml=${A}.${"x".repeat(43)}` } });
  assert.equal(answer.headers.get("X-Content-Type-Options"), "nosniff", path);
  assert.equal(answer.headers.get("Referrer-Policy"), "no-referrer", path);
  assert.equal(answer.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains", path);
  assert.equal(answer.headers.get("X-Frame-Options"), "DENY", path);
  assert.equal(answer.headers.get("Cross-Origin-Resource-Policy"), "same-origin", path);
  assert.deepEqual(answer.headers.getSetCookie(), [], `${path} sets a cookie`);
  for (const [name] of answer.headers) assert.ok(!/^access-control-|^x-ml-|^etag$|^last-modified$/i.test(name), `${path} carries ${name}`);
  return { status: answer.status, type: answer.headers.get("Content-Type"), kept: answer.headers.get("Cache-Control"), policy: answer.headers.get("Content-Security-Policy"), body: new Uint8Array(await answer.arrayBuffer()) };
}
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

test("the app's page: one page that may load its own files and talk to its own /api, and nothing else (SEC-2, T-8)", async () => {
  const page = await got(server, "/");
  assert.deepEqual([page.status, page.type, page.kept, page.policy], [200, "text/html; charset=utf-8", "no-store", PAGE_POLICY]);
  const html = text(page.body);
  assert.equal(html, readFileSync("dist/app/index.html", "utf8"));
  // nothing written into the page to run or to style, and nothing from anywhere else
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>|<style|\son[a-z]+=|style=|javascript:/i.test(html), "the page carries script or style of its own");
  const loads = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
  assert.equal(loads.length, 3);
  for (const load of loads) assert.match(load, /^\/assets\/(icon\.svg|app-[0-9A-Z]{8}\.(js|css))$/, load);
  // the same page whoever asks, and with whatever before or after the address
  assert.equal(text((await got(server, "/?x=1")).body), html);
  const head = await got(server, "/", "HEAD");
  assert.deepEqual([head.status, head.type, head.policy, head.body.length], [200, "text/html; charset=utf-8", PAGE_POLICY, 0]);

  // what it loads: kept for a year under a name that says what is in it, and each of the kind it says it is
  const kinds: Record<string, RegExp> = { js: /^text\/javascript\b/, css: /^text\/css\b/, svg: /^image\/svg\+xml\b/, woff2: /^font\/woff2$/ };
  const css = loads.find((load) => load.endsWith(".css"))!;
  const fonts = [...text((await got(server, css)).body).matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!.replace(/["']/g, ""));
  assert.deepEqual(fonts.sort(), ["/assets/fonts/figtree.woff2", "/assets/fonts/unbounded.woff2"], "the styles load the two fonts, from here");
  for (const path of [...loads, ...fonts]) {
    const file = await got(server, path);
    assert.deepEqual([file.status, file.kept, file.policy], [200, "public, max-age=31536000, immutable", NOTHING_POLICY], path);
    assert.match(file.type ?? "", kinds[path.split(".").pop()!]!, path);
    assert.deepEqual(file.body, new Uint8Array(readFileSync(`dist/app${path}`)), path);
  }
  // the licences of the fonts and the code in it: a page of text, not kept
  const licences = await got(server, "/licences.txt");
  assert.deepEqual([licences.status, licences.kept, licences.policy], [200, "no-store", NOTHING_POLICY]);
  assert.match(licences.type ?? "", /^text\/plain\b/);
  assert.match(text(licences.body), /SIL Open Font License[\s\S]*MIT License/);

  // nothing of the request goes to where the files are kept: whatever a browser adds to its question, the answer is the whole file
  for (const path of ["/", css]) {
    const asked = await fetch(`${server.base}${path}`, { headers: { Range: "bytes=0-9", "If-None-Match": "*", "If-Modified-Since": "Fri, 01 Jan 2100 00:00:00 GMT", "Accept-Encoding": "identity" } });
    assert.deepEqual([asked.status, new Uint8Array(await asked.arrayBuffer())], [200, new Uint8Array(readFileSync(`dist/app${path === "/" ? "/index.html" : path}`))], path);
  }
  // what is not the page or one of its files is not there, whatever is asked of it (the files are asked only for those)
  for (const path of ["/index.html", "/nothing", "/assets"]) assert.deepEqual(await said(await send(server, path, "{}", new Map())), [404, "no-such-thing"], `POST ${path}`);

  // only to be read: anything else is turned away before the files are asked
  for (const path of ["/", css, "/licences.txt"]) {
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const answer = await send(server, path, method === "OPTIONS" ? null : "{}", new Map(), { method });
      assert.deepEqual([answer.status, answer.headers.get("Allow"), ((await answer.json()) as { why: string }).why], [405, "GET, HEAD", "get-only"], `${method} ${path}`);
    }
  }
});

// The gate shut, the gate open to the owner, and no origin set
// ---------------------------------------------------------------------------------------------

test("the gate shut: to everyone, on every route (SEC-10)", async () => {
  const shut = await start(8799, { GATE: "closed" });
  try {
    const entered = await send(shut, "/enter", null, new Map(), { method: "GET", origin: null });
    const page = await entered.text();
    assert.deepEqual([entered.status, entered.headers.get("Location"), entered.headers.getSetCookie()], [403, null, []]);
    // in both languages, and with nothing in it to load or run
    assert.ok(page.includes("心里有数还没有开放。") && page.includes("MoneyLens is not open yet."));
    assert.ok(!/<script|<link|<img|<style|href=|src=/i.test(page));
    // the app's own address says the same, and hands out nothing: no script, no styles, no licences
    const front = await got(shut, "/");
    assert.deepEqual([front.status, front.type, front.kept, front.policy, text(front.body)], [403, "text/html; charset=utf-8", "no-store", NOTHING_POLICY, page]);
    for (const path of [...[...readFileSync("dist/app/index.html", "utf8").matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!), "/assets/fonts/figtree.woff2", "/licences.txt"]) {
      const file = await got(shut, path);
      assert.deepEqual([file.status, file.kept, text(file.body)], [404, "no-store", '{"ok":false,"why":"no-such-thing"}'], path);
    }
    for (const path of ["session", "session/end", "sessions", "sessions/end", "vault", "vault/start", "sync/pull", "events", "nothing"]) assert.deepEqual(await said(await send(shut, `/api/${path}`, "{}", new Map([["__Host-ml", `${A}.${"x".repeat(43)}`], ["__Host-ml-n", newId() + newId()]]))), [403, "closed"], path);
    // the Origin is asked before the gate says anything
    assert.deepEqual(await said(await send(shut, "/api/sessions", "{}", new Map(), { origin: "https://changle.ca" })), [403, "origin"]);
  } finally {
    await shut.stop();
    rmSync(shut.kept, { recursive: true, force: true });
  }
});

test("the gate as the repository sets it: open to the one account written down, when the accounts service calls it the owner's, and to nobody else (SEC-10)", async () => {
  // (no setting changed: this is wrangler.jsonc's own gate, and the one account is read from it)
  const set = (JSON.parse(plainJson(readFileSync("wrangler.jsonc", "utf8"))) as { vars: Record<string, string> }).vars;
  assert.equal(set.GATE, "owner");
  const written = (set.ALLOWED_ACCOUNTS ?? "").split(/[\s,]+/).filter(Boolean);
  assert.equal(written.length, 1, "the repository lets in more than one account, or none");
  const owner = written[0]!;
  assert.ok(isAccount(owner) && ![A, B, C].includes(owner));
  const repo = await start(8803, {});
  try {
    // the app's page is handed out
    assert.equal((await got(repo, "/")).status, 200);
    // anyone else is not let in, the owner of the site or not, and with a cookie of their own making reaches no database
    for (const [account, master] of [[A, false], [A, true], [B, true]] as const) assert.deepEqual(await said((await signInAs(repo, account, { master })).answer), [403, "not-admitted"], `${account} ${master}`);
    for (const made of [A, "umadeup0001"]) assert.deepEqual(await said(await send(repo, "/api/vault", "{}", new Map([["__Host-ml", `${made}.${"x".repeat(43)}`]]))), [403, "not-admitted"], made);
    // the account written down is not let in either while the accounts service does not call it the owner's
    assert.deepEqual(await said((await signInAs(repo, owner)).answer), [403, "not-admitted"]);
    // and is when it does: signed in, with no vault yet
    const signedIn = await signInAs(repo, owner, { master: true });
    assert.equal(signedIn.answer.status, 200);
    const stands = (await (await send(repo, "/api/vault", "{}", signedIn.jar)).json()) as { ok: boolean; vault: string | null };
    assert.deepEqual([stands.ok, stands.vault], [true, null]);
  } finally {
    await repo.stop();
    rmSync(repo.kept, { recursive: true, force: true });
  }
});

test("the gate open to the owner: the account written down, when the accounts service calls it the owner's, and no other", async () => {
  const owners = await start(8800, { GATE: "owner", ALLOWED_ACCOUNTS: `${A},${B}` });
  try {
    // on the list and not the owner's; the owner's and not on the list: neither is let in
    assert.deepEqual(await said((await signInAs(owners, B)).answer), [403, "not-admitted"]);
    assert.deepEqual(await said((await signInAs(owners, C, { master: true })).answer), [403, "not-admitted"]);
    const owner = await signInAs(owners, A, { master: true });
    assert.equal(owner.answer.status, 200);
    assert.equal((await send(owners, "/api/sessions", "{}", owner.jar)).status, 200);
    assert.deepEqual(await said((await signInAs(owners, A)).answer), [403, "not-admitted"]);
    // An id that is not written down goes no further than the Worker, whatever its cookie says. (An object that was
    // reached would say "signed out", having no session for it; that no object is asked is shown in tests/limits.test.ts.)
    for (const made of [C, "umadeup0001", "umadeup0002"]) assert.deepEqual(await said(await send(owners, "/api/sessions", "{}", new Map([["__Host-ml", `${made}.${"x".repeat(43)}`]]))), [403, "not-admitted"], made);
    // a dozen sign-ins an hour, and no more (the one above counts; the two that were not let in do not)
    for (let i = 0; i < 11; i++) assert.equal((await signInAs(owners, A, { master: true })).answer.status, 200, `sign-in ${i}`);
    assert.deepEqual(await said((await signInAs(owners, A, { master: true })).answer), [429, "too-many"]);
  } finally {
    await owners.stop();
    rmSync(owners.kept, { recursive: true, force: true });
  }
});

test("one address is told to slow down past its limits, on this platform's own count, and nobody else is asked for it (the review of #814, finding 1)", async () => {
  // (the limits as wrangler.jsonc sets them: twenty trades and three hundred other requests a minute from one address)
  const counted = await start(8792, { GATE: "list", ALLOWED_ACCOUNTS: A }, undefined, false, "own");
  // (the local runtime counts by the minute on the clock: each count below is begun with enough of its minute left to finish in)
  const roomFor = async (ms: number): Promise<void> => {
    const left = 60_000 - (Date.now() % 60_000);
    if (left < ms) await new Promise((r) => setTimeout(r, left + 250));
  };
  try {
    await roomFor(20_000);
    const person = await signInAs(counted, A);
    assert.equal(person.answer.status, 200);
    // trades: the one above, nineteen more with codes nobody made, and then no more
    const bad = async (): Promise<[number, unknown]> => {
      const jar: Jar = new Map();
      await send(counted, "/enter", null, jar, { method: "GET", origin: null });
      return said(await send(counted, "/api/session", JSON.stringify({ code: base64url(crypto.getRandomValues(new Uint8Array(32))) }), jar));
    };
    for (let i = 0; i < 19; i++) assert.deepEqual(await bad(), [401, "code"], `trade ${i + 2}`);
    for (let i = 0; i < 3; i++) assert.deepEqual(await bad(), [429, "slow-down"], `trade ${i + 21}`);
    // (a real code is turned away too, and is not spent: nobody was asked about it)
    const late: Jar = new Map();
    const entered = await send(counted, "/enter", null, late, { method: "GET", origin: null });
    const code = await codeFor(counted, A, new URL(entered.headers.get("Location")!).searchParams.get("handoff")!);
    const refused = await send(counted, "/api/session", JSON.stringify({ code }), late);
    assert.deepEqual([await said(refused), refused.headers.getSetCookie()], [[429, "slow-down"], []]);
    // other requests have their own count: the session opened above goes on working, three hundred times
    await roomFor(40_000);
    let ok = 0;
    for (let i = 0; i < 300; i++) ok += (await send(counted, "/api/sessions", "{}", person.jar)).status === 200 ? 1 : 0;
    assert.equal(ok, 300);
    const stopped = await send(counted, "/api/sessions", "{}", person.jar);
    assert.deepEqual([await said(stopped), stopped.headers.getSetCookie()], [[429, "slow-down"], []]);
    // what costs nothing is still answered as what it is
    assert.deepEqual(await said(await send(counted, "/api/sessions", "{}", new Map())), [401, "signed-out"]);
    assert.deepEqual(await said(await send(counted, "/api/sessions", "{}", new Map([["__Host-ml", `${C}.${"x".repeat(43)}`]]))), [403, "not-admitted"]);
    assert.equal((await got(counted, "/")).status, 200);
  } finally {
    await counted.stop();
    rmSync(counted.kept, { recursive: true, force: true });
  }
});

test("with no origin set, nothing is answered at all", async () => {
  const unset = await start(8801, { ORIGIN: undefined, GATE: "owner" });
  try {
    for (const [path, method] of [["/enter", "GET"], ["/api/sessions", "POST"], ["/", "GET"]] as const) assert.deepEqual(await said(await send(unset, path, method === "POST" ? "{}" : null, new Map(), { method })), [503, "not-set-up"], path);
  } finally {
    await unset.stop();
    rmSync(unset.kept, { recursive: true, force: true });
  }
});
