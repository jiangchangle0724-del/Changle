/**
 * What a stranger can make the server do, and what stops it before it is done (the review of
 * #814, finding 1): the Worker itself (src/server/worker.ts, loaded on Node as it is), with
 * stand-ins for everything behind it that note when they are asked. Two things are shown. An
 * account id that is not on the gate's list goes no further than the Worker. And what would ask
 * something of an object, the registry or the accounts service is counted first, by the address
 * it came from, and is turned away when that address is over its limit; what costs nothing is
 * not counted.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { HEAD_MAX } from "../src/server/wire";
import { LIMITS } from "../src/vault/protocol";
import { workerModule } from "./workermod";

type Worker = { default: { fetch(request: Request, env: object): Promise<Response> } };
const worker = workerModule() as Promise<Worker>;

const ORIGIN = "https://money.changle.test";
const [A, B] = ["uaaaaaa1", "ubbbbbb2"];
const FROM = "203.0.113.7";
const session = (account: string): string => `__Host-ml=${account}.${"t".repeat(43)}`;
const NONCE = "n".repeat(43);
const CODE = "c".repeat(43);

type Limit = "within" | "over" | "broken" | "missing" | "not-one";

/** The Worker with everything behind it stood in for: `asked` is what was asked, of whom, in order. */
async function served(vars: Record<string, string>, limits: { trades?: Limit; asks?: Limit } = {}) {
  const asked: string[] = [];
  const limiter = (name: string, how: Limit = "within"): unknown =>
    how === "missing"
      ? undefined
      : how === "not-one"
        ? { limit: "20 a minute" }
        : {
            limit: async (options: { key: string }) => {
              asked.push(`${name} ${JSON.stringify(options)}`);
              if (how === "broken") throw new Error(`the limiter is down, and this text names ${FROM}`);
              return { success: how === "within" };
            },
          };
  const registry = {
    stampNow: async () => (asked.push("registry stampNow"), "s".repeat(22)),
    newStamp: async () => void asked.push("registry newStamp"),
    note: async (account: string) => (asked.push(`registry note ${account}`), true),
    forget: async (account: string) => void asked.push(`registry forget ${account}`),
  };
  const vault = (account: string) => ({
    fetch: async (url: string) => (asked.push(`object ${account} ${new URL(url).pathname}`), new Response(JSON.stringify({ ok: true, sessions: [] }), { status: 200, headers: { "Content-Type": "application/json" } })),
    signIn: async () => (asked.push(`object ${account} signIn`), "ok"),
    signEveryoneOut: async () => void asked.push(`object ${account} signEveryoneOut`),
    erase: async () => void asked.push(`object ${account} erase`),
  });
  const env = {
    ORIGIN,
    ...vars,
    TRADES: limiter("TRADES", limits.trades),
    ASKS: limiter("ASKS", limits.asks),
    REGISTRY: { idFromName: (name: string) => name, get: () => registry },
    VAULTS: { idFromName: (name: string) => name, get: (name: string) => vault(name) },
    ACCOUNTS: { redeem: async (_code: string, aud: string) => (asked.push(`accounts redeem ${aud}`), { id: A, master: true, nonce: NONCE }), exists: async () => (asked.push("accounts exists"), [A]) },
    ASSETS: { fetch: async () => (asked.push("files"), new Response("the page", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } })) },
  };
  const { default: entry } = await worker;
  /** A POST as the app's page sends one, from `FROM` unless said otherwise. `headers` are added, and a null takes one away. */
  const post = async (path: string, headers: Record<string, string | null> = {}, body = "{}"): Promise<[number, string, string[]]> => {
    const all: Record<string, string | null> = { Origin: ORIGIN, "Content-Type": "application/json", "Content-Length": String(new TextEncoder().encode(body).length), "CF-Connecting-IP": FROM, ...headers };
    const answer = await entry.fetch(new Request(`${ORIGIN}${path}`, { method: "POST", headers: Object.fromEntries(Object.entries(all).filter((one): one is [string, string] => one[1] !== null)), body }), env);
    return [answer.status, ((await answer.json()) as { why?: string }).why ?? "", answer.headers.getSetCookie()];
  };
  const trade = (headers: Record<string, string | null> = {}, body = JSON.stringify({ code: CODE })) => post("/api/session", { Cookie: `__Host-ml-n=${NONCE}`, ...headers }, body);
  return { asked, env, post, trade, get: (path: string) => entry.fetch(new Request(`${ORIGIN}${path}`), env) };
}
const OPEN = { GATE: "list", ALLOWED_ACCOUNTS: A };

test("a trade is counted by the address it came from before anyone is asked, and over the limit nobody is", async () => {
  const within = await served(OPEN);
  const [status, , cookies] = await within.trade();
  assert.equal(status, 200);
  assert.ok(cookies.some((cookie) => cookie.startsWith("__Host-ml=")));
  assert.deepEqual(within.asked, [`TRADES {"key":"${FROM}"}`, "registry stampNow", "accounts redeem moneylens", `registry note ${A}`, `object ${A} signIn`]);

  const over = await served(OPEN, { trades: "over" });
  // (nothing was traded: the nonce's cookie is left as it is, and no cookie is set)
  assert.deepEqual(await over.trade(), [429, "slow-down", []]);
  assert.deepEqual(over.asked, [`TRADES {"key":"${FROM}"}`]);
  // the other count has no say in a trade
  assert.equal((await (await served(OPEN, { asks: "over" })).trade())[0], 200);
  // counted by the address alone: nothing a caller can set moves it to another count
  const other = await served(OPEN);
  await other.trade({ "CF-Connecting-IP": "198.51.100.9", "X-Forwarded-For": "192.0.2.1", "X-Real-IP": "192.0.2.2", Forwarded: "for=192.0.2.3" });
  await other.trade({ "CF-Connecting-IP": null, "X-Forwarded-For": "192.0.2.1" });
  assert.deepEqual(other.asked.filter((line) => line.startsWith("TRADES")), ['TRADES {"key":"198.51.100.9"}', 'TRADES {"key":"nowhere"}']);
  // one machine's IPv6 addresses are one count, for trades and for everything else (request.ts, `addressKey`)
  const six = await served(OPEN);
  for (const from of ["2001:db8:1:2::1", "2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:DB8:1:2:0:0:0:9"]) {
    await six.trade({ "CF-Connecting-IP": from });
    await six.post("/api/sessions", { Cookie: session(A), "CF-Connecting-IP": from });
  }
  await six.trade({ "CF-Connecting-IP": "2001:db8:1:3::1" });
  assert.deepEqual(six.asked.filter((line) => /^(TRADES|ASKS)/.test(line)), [...Array.from({ length: 3 }, () => ['TRADES {"key":"2001:db8:1:2::/64"}', 'ASKS {"key":"2001:db8:1:2::/64"}']).flat(), 'TRADES {"key":"2001:db8:1:3::/64"}']);
});

test("a sign-in starts at this origin's own page: a browser sent to /enter from anywhere else is shown the page, and nothing is begun (the review of the door, finding 6)", async () => {
  const { asked, get } = await served(OPEN);
  const { default: entry } = await worker;
  const env = (await served(OPEN)).env;
  const enter = async (headers: Record<string, string>): Promise<[number, string | null, string[]]> => {
    const answer = await entry.fetch(new Request(`${ORIGIN}/enter`, { headers, redirect: "manual" }), env);
    return [answer.status, answer.headers.get("Location"), answer.headers.getSetCookie()];
  };
  // from the app's own page, and from a browser that does not say: on to the main site, with a nonce in a cookie
  for (const headers of [{ "Sec-Fetch-Site": "same-origin" }, {}] as Record<string, string>[]) {
    const [status, to, cookies] = await enter(headers);
    assert.equal(status, 302);
    assert.match(to ?? "", /^https:\/\/changle\.ca\/tools\/finance\?handoff=[A-Za-z0-9_-]{43}$/);
    assert.equal(cookies.length, 1);
    assert.match(cookies[0]!, /^__Host-ml-n=[A-Za-z0-9_-]{43}; /);
  }
  // from another site, from the main site, from a link in a message or a typed address: the page, and no nonce
  for (const from of ["cross-site", "same-site", "none", "", "SAME-ORIGIN", "same-origin, cross-site"]) assert.deepEqual(await enter({ "Sec-Fetch-Site": from, Referer: `${ORIGIN}/`, Origin: ORIGIN }), [302, `${ORIGIN}/`, []], from);
  assert.deepEqual(asked, []);
  assert.equal((await get("/")).status, 200);
});

test("a trade that asks nobody is not counted", async () => {
  const { asked, trade, post } = await served(OPEN);
  assert.deepEqual((await post("/api/session", {}, JSON.stringify({ code: CODE }))).slice(0, 2), [400, "no-nonce"]);
  assert.deepEqual((await trade({}, JSON.stringify({ code: "short" }))).slice(0, 2), [400, "bad-request"]);
  assert.deepEqual((await trade({}, "not json")).slice(0, 2), [400, "bad-request"]);
  assert.deepEqual((await trade({ "Content-Type": "text/plain" })).slice(0, 2), [415, "content-type"]);
  assert.deepEqual((await trade({ Origin: "https://elsewhere.example" })).slice(0, 2), [403, "origin"]);
  assert.deepEqual((await trade({ Origin: null })).slice(0, 2), [403, "origin"]);
  assert.deepEqual(asked, []);
});

test("a request with a session is counted before it reaches the object, and over the limit it does not", async () => {
  const within = await served(OPEN);
  assert.deepEqual((await within.post("/api/sessions", { Cookie: session(A) })).slice(0, 2), [200, ""]);
  assert.deepEqual(within.asked, [`ASKS {"key":"${FROM}"}`, `object ${A} /sessions`]);

  const over = await served(OPEN, { asks: "over" });
  for (const action of ["sessions", "vault", "vault/unlock", "sync/pull", "events", "session/end"]) assert.deepEqual(await over.post(`/api/${action}`, { Cookie: session(A) }), [429, "slow-down", []], action);
  assert.deepEqual(over.asked, Array.from({ length: 6 }, () => `ASKS {"key":"${FROM}"}`));
  // (told to slow down, the session's cookie is not taken away: the session is as good as it was)
  // the other count has no say here
  assert.equal((await (await served(OPEN, { trades: "over" })).post("/api/sessions", { Cookie: session(A) }))[0], 200);
});

test("what costs nothing is not counted: no session, an id not on the list, a request that is not one", async () => {
  const { asked, post } = await served(OPEN, { asks: "over", trades: "over" });
  assert.deepEqual((await post("/api/sessions")).slice(0, 2), [401, "signed-out"]);
  assert.deepEqual((await post("/api/sessions", { Cookie: "__Host-ml=nonsense" })).slice(0, 2), [401, "signed-out"]);
  assert.deepEqual((await post("/api/sessions", { Cookie: session(B) })).slice(0, 2), [403, "not-admitted"]);
  assert.deepEqual((await post("/api/nothing", { Cookie: session(A) })).slice(0, 2), [404, "no-such-thing"]);
  assert.deepEqual((await post("/api/sessions", { Cookie: session(A), "Content-Type": "text/plain" })).slice(0, 2), [415, "content-type"]);
  assert.deepEqual((await post("/api/sessions", { Cookie: session(A), "Content-Length": "5000" })).slice(0, 2), [413, "too-big"]);
  assert.deepEqual((await post("/api/sessions", { Cookie: session(A), Origin: "https://elsewhere.example" })).slice(0, 2), [403, "origin"]);
  assert.deepEqual(asked, []);
});

test("the largest push is a frame's four bytes of length, the largest head, and a batch of blobs: a byte more is refused unread (the review of #814, finding 3)", async () => {
  const { asked, post } = await served(OPEN);
  const largest = 4 + HEAD_MAX + LIMITS.batchBytes;
  const push = (length: number) => post("/api/sync/push", { Cookie: session(A), "Content-Type": "application/octet-stream", "Content-Length": String(length) });
  // (what is looked at is the length the request states; the object reads the body, and it is the stand-in here)
  assert.equal((await push(largest))[0], 200);
  assert.deepEqual((await push(largest + 1)).slice(0, 2), [413, "too-big"]);
  assert.deepEqual(asked, [`ASKS {"key":"${FROM}"}`, `object ${A} /sync/push`]);
  // every other request is small
  assert.deepEqual((await post("/api/sync/pull", { Cookie: session(A), "Content-Length": "4097" })).slice(0, 2), [413, "too-big"]);
  assert.equal((await post("/api/sync/pull", { Cookie: session(A), "Content-Length": "4096" }))[0], 200);
});

test("an account id that is not on the list goes no further than the Worker, with the gate open either way", async () => {
  for (const vars of [
    { GATE: "owner", ALLOWED_ACCOUNTS: A },
    { GATE: "list", ALLOWED_ACCOUNTS: A },
    { GATE: "owner", ALLOWED_ACCOUNTS: "" },
    { GATE: "owner" },
    { GATE: "list" },
  ] as Record<string, string>[]) {
    const { asked, post } = await served(vars);
    for (const made of [B, "umadeup0001", "umadeup0002", "uzzzzzzzzzzzz"]) {
      for (const action of ["sessions", "vault", "sync/pull", "vault/unlock"]) {
        const [status, why, cookies] = await post(`/api/${action}`, { Cookie: session(made) });
        assert.deepEqual([status, why], [403, "not-admitted"], `${JSON.stringify(vars)} ${made} ${action}`);
        // (and the cookie it came with is taken away)
        assert.ok(cookies.some((cookie) => /^__Host-ml=; Max-Age=0;/.test(cookie)));
      }
    }
    assert.deepEqual(asked, [], JSON.stringify(vars));
    // the id that is on it reaches its own object, and no other
    if (vars.ALLOWED_ACCOUNTS === A) {
      await post("/api/sessions", { Cookie: session(A) });
      assert.deepEqual(asked, [`ASKS {"key":"${FROM}"}`, `object ${A} /sessions`], JSON.stringify(vars));
    }
  }
});

test("with the gate open and nothing to count by, nothing is answered; shut, nothing is counted", async () => {
  for (const limits of [{ trades: "missing" }, { asks: "missing" }, { trades: "not-one" }, { asks: "not-one" }, { trades: "missing", asks: "missing" }] as { trades?: Limit; asks?: Limit }[]) {
    const { asked, post, trade, get } = await served(OPEN, limits);
    for (const answer of [await trade(), await post("/api/sessions", { Cookie: session(A) }), await post("/api/sessions"), await post("/api/nothing")]) assert.deepEqual(answer, [503, "not-set-up", []], JSON.stringify(limits));
    assert.deepEqual(asked, [], JSON.stringify(limits));
    // (the page is still the page: it asks nothing of anyone but the file store)
    assert.equal((await get("/")).status, 200);
  }
  const shut = await served({ GATE: "closed" }, { trades: "missing", asks: "missing" });
  assert.deepEqual((await shut.trade()).slice(0, 2), [403, "closed"]);
  assert.deepEqual((await shut.post("/api/sessions", { Cookie: session(A) })).slice(0, 2), [403, "closed"]);
  assert.deepEqual(shut.asked, []);
});

test("a limiter that fails lets the request through, and what is logged of it is its kind alone", async () => {
  const logged: unknown[][] = [];
  const keep = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const { asked, trade, post } = await served(OPEN, { trades: "broken", asks: "broken" });
    assert.equal((await trade())[0], 200);
    assert.equal((await post("/api/sessions", { Cookie: session(A) }))[0], 200);
    assert.deepEqual(asked.filter((line) => line.startsWith("object")), [`object ${A} signIn`, `object ${A} /sessions`]);
  } finally {
    console.error = keep;
  }
  assert.deepEqual(logged, [
    ["moneylens: the limiter failed", "Error"],
    ["moneylens: the limiter failed", "Error"],
  ]);
});
