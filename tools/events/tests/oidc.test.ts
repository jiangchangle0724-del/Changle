// GitHub's sign-in token (src/oidc.ts) and the hand-over that takes it (src/handoff.ts). The tokens are
// made here and signed with RSA keys made here; GitHub's list of keys, and the runner that gives the
// job its token, are stand-ins. In the Workers runtime (local KV); no network.
import { env } from "cloudflare:workers";
import vpl from "./fixtures/bibliocommons/vpl-2026-10-31-p1.json?raw";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handOver, handoffCredential, signInWith, takeHandoff, type Get } from "../src/handoff";
import { ASK_GITHUB_EVERY_MS, forgetGithubKeys, GITHUB_KEYS_URL, githubToken, HANDOFF_AUDIENCE, KEYS_FRESH_MS, KEYS_KV_KEY, verifyGithubToken } from "../src/oidc";
import { vanParts } from "../src/time";
import worker from "../src/worker";

const ENDPOINT = "https://changle.ca/go/api/handoff";
const REPO = "jiangchangle0724-del/Changle";
const WORKFLOW_REF = `${REPO}/.github/workflows/events-libraries.yml@refs/heads/main`;
const today = () => vanParts(Date.now()).date;
const call = (req: Request, e: Env = env) => worker.fetch(req as Request<unknown, IncomingRequestCfProperties>, e);

const utf8 = (s: string) => new TextEncoder().encode(s);
const b64url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const part = (value: unknown) => b64url(utf8(JSON.stringify(value)));

/** A signing key made here, and its public half as GitHub lists its own. */
interface Signer {
  kid: string;
  privateKey: CryptoKey;
  listed: Record<string, unknown>;
}

async function signer(kid: string): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const { n, e } = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { kid, privateKey: pair.privateKey, listed: { kty: "RSA", alg: "RS256", use: "sig", kid, n, e, x5c: ["stand-in"], x5t: "stand-in" } };
}

/** The claims GitHub writes into the hand-over job's token: a run on its schedule, on main. */
function claims(now = Date.now()): Record<string, unknown> {
  const t = Math.floor(now / 1000);
  const sha = "5".repeat(40);
  return {
    jti: "stand-in",
    sub: `repo:${REPO}:ref:refs/heads/main`,
    aud: HANDOFF_AUDIENCE,
    ref: "refs/heads/main",
    sha,
    repository: REPO,
    repository_owner: "jiangchangle0724-del",
    actor_id: "332761129",
    repository_visibility: "public",
    repository_id: "1431750616",
    repository_owner_id: "332761129",
    run_id: "42058162903",
    run_number: "4",
    run_attempt: "1",
    runner_environment: "github-hosted",
    actor: "jiangchangle0724-del",
    workflow: "events-libraries",
    head_ref: "",
    base_ref: "",
    event_name: "schedule",
    ref_protected: "false",
    ref_type: "branch",
    workflow_ref: WORKFLOW_REF,
    workflow_sha: sha,
    job_workflow_ref: WORKFLOW_REF,
    job_workflow_sha: sha,
    iss: "https://token.actions.githubusercontent.com",
    nbf: t - 600,
    exp: t + 300,
    iat: t,
  };
}

let github: Signer; // the key GitHub signs with, in its list
let stranger: Signer; // a key GitHub doesn't list

/** A token with these claims, signed by GitHub's key unless another is given, its header changed by `header`. */
async function token(body: Record<string, unknown>, by?: Signer, header: Record<string, unknown> = {}): Promise<string> {
  const s = by ?? github;
  const signed = `${part({ typ: "JWT", alg: "RS256", x5t: "stand-in", kid: s.kid, ...header })}.${part(body)}`;
  return `${signed}.${b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", s.privateKey, utf8(signed))))}`;
}

/** GitHub's list of keys, as the stand-in answers it; what it answers; how many times it was asked. */
let listed: Signer[];
const keysFromGithub = () => Response.json({ keys: listed.map((s) => s.listed) });
let githubAnswers: () => Response;
let asked: number;

beforeAll(async () => {
  [github, stranger] = await Promise.all([signer("github-key-1"), signer("not-githubs")]);
});

beforeEach(async () => {
  forgetGithubKeys();
  await env.CACHE.delete(KEYS_KV_KEY);
  for (const { name } of (await env.CACHE.list({ prefix: "handoff:" })).keys) await env.CACHE.delete(name);
  listed = [github];
  githubAnswers = keysFromGithub;
  asked = 0;
  // the only network there is: GitHub's list of keys
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== GITHUB_KEYS_URL) throw new Error(`no network in tests: ${url}`);
    asked++;
    return githubAnswers();
  });
});
afterEach(() => vi.restoreAllMocks());

const verify = (t: string, now?: number) => verifyGithubToken(t, env.CACHE, now);
const what = (change: Record<string, unknown>) => Object.entries(change).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");

describe("GitHub's sign-in token (src/oidc.ts)", () => {
  it("takes the hand-over job's token, run by its schedule or by hand", async () => {
    for (const event_name of ["schedule", "workflow_dispatch"]) {
      const v = await verify(await token({ ...claims(), event_name }));
      expect(v.ok, event_name).toBe(true);
      expect(v.ok && v.claims.run_id).toBe("42058162903");
    }
    // clocks differ: a minute either way
    const t = Math.floor(Date.now() / 1000);
    expect((await verify(await token({ ...claims(), exp: t - 30 }))).ok).toBe(true);
    expect((await verify(await token({ ...claims(), iat: t + 30, nbf: t + 30 }))).ok).toBe(true);
    // nbf is optional
    expect((await verify(await token({ ...claims(), nbf: undefined }))).ok).toBe(true);
  });

  it("refuses a token with any one claim wrong, and says which", async () => {
    const t = Math.floor(Date.now() / 1000);
    const wrong: [change: Record<string, unknown>, error: string][] = [
      [{ iss: "https://token.actions.githubusercontent.com/an-enterprise" }, "wrong iss"],
      [{ iss: "https://evil.example" }, "wrong iss"],
      [{ iss: undefined }, "wrong iss"],
      [{ aud: "https://github.com/jiangchangle0724-del" }, "wrong aud"], // GitHub's default audience
      [{ aud: "sts.amazonaws.com" }, "wrong aud"], // a token made out to someone else
      [{ aud: [HANDOFF_AUDIENCE, "sts.amazonaws.com"] }, "wrong aud"],
      [{ aud: undefined }, "wrong aud"],
      [{ exp: t - 61 }, "expired"],
      [{ exp: undefined }, "no exp or iat"],
      [{ exp: String(t + 300) }, "no exp or iat"],
      [{ iat: undefined }, "no exp or iat"],
      [{ iat: t + 61 }, "issued in the future"],
      [{ nbf: t + 61 }, "not valid yet"],
      [{ nbf: String(t - 600) }, "not valid yet"],
      [{ repository_id: "987654321" }, "wrong repository_id"], // a fork: a repository of its own
      [{ repository_id: 1431750616 }, "wrong repository_id"], // GitHub writes ids as strings
      [{ repository_id: undefined }, "wrong repository_id"],
      [{ repository_owner_id: "987654" }, "wrong repository_owner_id"],
      [{ repository_owner_id: undefined }, "wrong repository_owner_id"],
      [{ ref: "refs/heads/try-this" }, "wrong ref"],
      [{ ref: "refs/pull/7/merge" }, "wrong ref"], // a pull request
      [{ ref: "refs/tags/v1" }, "wrong ref"],
      [{ ref: undefined }, "wrong ref"],
      [{ workflow_ref: `${REPO}/.github/workflows/events.yml@refs/heads/main` }, "wrong workflow_ref"], // another workflow
      [{ workflow_ref: `${REPO}/.github/workflows/events-libraries.yml@refs/heads/try-this` }, "wrong workflow_ref"],
      [{ workflow_ref: undefined }, "wrong workflow_ref"],
      [{ event_name: "push" }, "wrong event_name"],
      [{ event_name: "pull_request" }, "wrong event_name"],
      [{ event_name: "pull_request_target" }, "wrong event_name"],
      [{ event_name: "workflow_run" }, "wrong event_name"],
      [{ event_name: "repository_dispatch" }, "wrong event_name"],
      [{ event_name: undefined }, "wrong event_name"],
    ];
    for (const [change, error] of wrong) {
      expect(await verify(await token({ ...claims(), ...change })), what(change)).toEqual({ ok: false, status: 401, error });
    }
  });

  it("refuses what anyone can get from GitHub for a public repository: a fork's job, a pull request, a branch's own workflow, another workflow, an old token", async () => {
    const t = Math.floor(Date.now() / 1000);
    const cases: [what: string, body: Record<string, unknown>, error: string][] = [
      [
        "a fork's own events-libraries job",
        {
          ...claims(),
          sub: "repo:someone/Changle:ref:refs/heads/main",
          repository: "someone/Changle",
          repository_owner: "someone",
          repository_id: "987654321",
          repository_owner_id: "55555",
          workflow_ref: "someone/Changle/.github/workflows/events-libraries.yml@refs/heads/main",
        },
        "wrong repository_id",
      ],
      [
        "a pull request's checks",
        { ...claims(), sub: `repo:${REPO}:pull_request`, event_name: "pull_request", ref: "refs/pull/7/merge", head_ref: "patch-1", base_ref: "main", workflow_ref: `${REPO}/.github/workflows/events.yml@refs/pull/7/merge` },
        "wrong ref",
      ],
      [
        "a branch whose copy of the workflow was changed, started by hand",
        { ...claims(), sub: `repo:${REPO}:ref:refs/heads/try-this`, event_name: "workflow_dispatch", ref: "refs/heads/try-this", workflow_ref: `${REPO}/.github/workflows/events-libraries.yml@refs/heads/try-this` },
        "wrong ref",
      ],
      ["another workflow on main", { ...claims(), event_name: "push", workflow_ref: `${REPO}/.github/workflows/events.yml@refs/heads/main` }, "wrong workflow_ref"],
      ["the job's token, made out to someone else", { ...claims(), aud: "sts.amazonaws.com" }, "wrong aud"],
      ["yesterday's token, sent again", { ...claims(), iat: t - 86_400, nbf: t - 87_000, exp: t - 86_100 }, "expired"],
    ];
    for (const [w, body, error] of cases) expect(await verify(await token(body)), w).toEqual({ ok: false, status: 401, error });
  });

  it("refuses a token GitHub didn't sign as it is: a changed signature or claim, another key under GitHub's name", async () => {
    const [h, p, s] = (await token(claims())).split(".");
    const flipped = fromB64url(s);
    flipped[17] ^= 1;
    const fork = (await token({ ...claims(), repository_id: "987654321" })).split(".");
    const bad: [what: string, token: string][] = [
      ["one bit of the signature changed", `${h}.${p}.${b64url(flipped)}`],
      ["the signature cut short", `${h}.${p}.${s.slice(0, -8)}`],
      ["a fork's signed token with the job's claims put in", `${fork[0]}.${p}.${fork[2]}`],
      ["the job's claims with another token's signature", `${h}.${p}.${(await token({ ...claims(), run_id: "1" })).split(".")[2]}`],
      ["signed by another key, under the id of GitHub's", await token(claims(), { ...stranger, kid: github.kid })],
    ];
    for (const [w, t] of bad) expect(await verify(t), w).toEqual({ ok: false, status: 401, error: "bad signature" });
  });

  it("refuses alg none, HS256 and any alg but RS256, before looking for a key", async () => {
    const body = part(claims());
    // HS256 with GitHub's public key for the shared secret: the classic mix-up
    const secret = await crypto.subtle.importKey("raw", utf8(JSON.stringify(github.listed)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hsSigned = `${part({ typ: "JWT", alg: "HS256", kid: github.kid })}.${body}`;
    const hs256 = `${hsSigned}.${b64url(new Uint8Array(await crypto.subtle.sign("HMAC", secret, utf8(hsSigned))))}`;
    const tokens = [
      `${part({ typ: "JWT", alg: "none" })}.${body}.`,
      `${part({ typ: "JWT", alg: "none", kid: github.kid })}.${body}.`,
      hs256,
      ...(await Promise.all(["RS512", "PS256", "ES256", "rs256", "RS256 ", null, undefined].map((alg) => token(claims(), github, { alg })))),
    ];
    for (const t of tokens) expect(await verify(t)).toEqual({ ok: false, status: 401, error: "alg must be RS256" });
    expect(asked).toBe(0); // GitHub's keys weren't even asked for
  });

  it("refuses what isn't a well-formed token", async () => {
    const [h, p, s] = (await token(claims())).split(".");
    const malformed: [what: string, token: string][] = [
      ["no JSON in it", "a.b.c"],
      ["four parts", `${h}.${p}.${s}.${s}`],
      ["a header that isn't an object", `${part(["RS256"])}.${p}.${s}`],
      ["no kid", `${part({ typ: "JWT", alg: "RS256" })}.${p}.${s}`],
      ["a crit header", `${part({ typ: "JWT", alg: "RS256", kid: github.kid, crit: ["exp"] })}.${p}.${s}`],
      ["claims that aren't an object", `${h}.${part([claims()])}.${s}`],
      ["claims that aren't JSON", `${h}.${b64url(utf8("repository_id=1431750616"))}.${s}`],
      ["no signature", `${h}.${p}.`],
      ["a signature that isn't base64url", `${h}.${p}.A`],
      ["far too long", `${h}.${p}.${s}${"A".repeat(16_384)}`],
    ];
    for (const [w, t] of malformed) expect(await verify(t), w).toEqual({ ok: false, status: 401, error: "malformed" });
    expect(asked).toBe(0);
  });

  it("asks GitHub for its keys once, then keeps them an hour: in memory, and in KV once a token has passed", async () => {
    // KV writes are counted: the free plan has a thousand a day
    const writes: string[] = [];
    const kv = {
      get: (key: string, type: "json") => env.CACHE.get(key, type),
      put: (key: string, value: string, options?: KVNamespacePutOptions) => (writes.push(key), env.CACHE.put(key, value, options)),
    } as unknown as KVNamespace;
    expect((await verifyGithubToken(await token(claims()), kv)).ok).toBe(true);
    expect(asked).toBe(1);
    expect((await verifyGithubToken(await token(claims()), kv)).ok).toBe(true);
    expect(asked).toBe(1); // from memory
    expect(await env.CACHE.get(KEYS_KV_KEY, "json")).toEqual({ at: expect.any(Number), keys: [{ kid: github.kid, n: github.listed.n, e: github.listed.e }] });
    const [kept] = (await env.CACHE.list({ prefix: KEYS_KV_KEY })).keys;
    expect(kept.expiration! - Date.now() / 1000).toBeGreaterThan(KEYS_FRESH_MS / 1000 - 120);
    expect(kept.expiration! - Date.now() / 1000).toBeLessThanOrEqual(KEYS_FRESH_MS / 1000 + 1);
    // another isolate, with nothing in memory: from KV, GitHub isn't asked
    forgetGithubKeys();
    expect((await verifyGithubToken(await token(claims()), kv)).ok).toBe(true);
    expect(asked).toBe(1);
    expect(writes).toEqual([KEYS_KV_KEY]); // written once
  });

  it("writes nothing to KV for a token that's refused, however it was made", async () => {
    expect((await verify(await token({ ...claims(), repository_id: "987654321" }))).ok).toBe(false); // GitHub's signature, a fork's job
    expect((await verify(await token(claims(), stranger))).ok).toBe(false); // a key GitHub doesn't list
    expect((await verify(await token(claims(), { ...stranger, kid: github.kid }))).ok).toBe(false); // a bad signature
    expect(asked).toBe(1);
    expect(await env.CACHE.get(KEYS_KV_KEY)).toBeNull();
  });

  it("a key it doesn't know: asks GitHub again, but not more than once a minute", async () => {
    const now = Date.now();
    expect((await verify(await token(claims(now)), now)).ok).toBe(true);
    expect(asked).toBe(1);
    const unknown = await token(claims(now), stranger);
    expect(await verify(unknown, now + 1_000)).toEqual({ ok: false, status: 401, error: "unknown signing key" });
    expect(asked).toBe(1); // GitHub was asked a second ago
    expect(await verify(unknown, now + ASK_GITHUB_EVERY_MS)).toEqual({ ok: false, status: 401, error: "unknown signing key" });
    expect(asked).toBe(2); // a minute on: GitHub may have a new key
    expect(await verify(unknown, now + ASK_GITHUB_EVERY_MS + 30_000)).toEqual({ ok: false, status: 401, error: "unknown signing key" });
    expect(asked).toBe(2);
    // GitHub starts signing with a new key: taken once GitHub lists it
    listed = [github, stranger];
    expect((await verify(unknown, now + 2 * ASK_GITHUB_EVERY_MS)).ok).toBe(true);
    expect(asked).toBe(3);
  });

  it("keys over an hour old are asked for again", async () => {
    const now = Date.now();
    expect((await verify(await token(claims(now)), now)).ok).toBe(true);
    const later = now + KEYS_FRESH_MS + 1_000;
    expect((await verify(await token(claims(later)), later)).ok).toBe(true);
    expect(asked).toBe(2);
  });

  it("503 when GitHub's keys can't be had, so a token can't be checked; the next token asks again", async () => {
    const warned: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void warned.push(args.map(String).join(" ")));
    const answers: (() => Response)[] = [
      () => new Response("unavailable", { status: 503 }),
      () => Response.json({ keys: [{ kty: "EC", crv: "P-256", kid: github.kid, x: "x", y: "y" }] }), // no RS256 key
      () => new Response("<html>"),
      () => {
        throw new TypeError("Network connection lost.");
      },
    ];
    for (const answer of answers) {
      githubAnswers = answer;
      expect(await verify(await token(claims()))).toEqual({ ok: false, status: 503, error: "GitHub's keys couldn't be fetched" });
    }
    expect(asked).toBe(answers.length);
    expect(warned.every((w) => w.includes("GitHub's keys couldn't be fetched"))).toBe(true);
    // with no keys in hand, there's no minute's wait
    githubAnswers = keysFromGithub;
    expect((await verify(await token(claims()))).ok).toBe(true);
  });
});

describe("POST /go/api/handoff, signed in by GitHub", () => {
  const post = (credential: string | null, e: Env = env) =>
    call(new Request(`${ENDPOINT}?source=vpl&date=${today()}&part=0`, { method: "POST", headers: credential === null ? {} : { authorization: `Bearer ${credential}` }, body: vpl }), e);

  it("keeps the page when the job's token checks out: the Worker needs no key", async () => {
    expect((env as Env).EVENTS_HANDOFF_KEY).toBeUndefined();
    const res = await post(await token(claims()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, source: "vpl", date: today(), part: 0, bytes: vpl.length, read: false });
    expect((await takeHandoff(env.CACHE, today(), "vpl", 0))?.raw).toBe(vpl);
  });

  it("401 for a token that doesn't pass, saying which check failed and nothing of the token; nothing is kept", async () => {
    const lines: string[] = [];
    for (const level of ["log", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
    const t = Math.floor(Date.now() / 1000);
    const refused: [token: string, error: string][] = [
      [await token({ ...claims(), repository_id: "987654321", repository_owner_id: "55555" }), "GitHub token: wrong repository_id"],
      [await token({ ...claims(), event_name: "pull_request", ref: "refs/pull/7/merge" }), "GitHub token: wrong ref"],
      [await token({ ...claims(), workflow_ref: `${REPO}/.github/workflows/events.yml@refs/heads/main` }), "GitHub token: wrong workflow_ref"],
      [await token({ ...claims(), aud: "sts.amazonaws.com" }), "GitHub token: wrong aud"],
      [await token({ ...claims(), iat: t - 900, exp: t - 600 }), "GitHub token: expired"],
      [await token(claims(), stranger), "GitHub token: unknown signing key"],
      [`${part({ typ: "JWT", alg: "none" })}.${part(claims())}.`, "GitHub token: alg must be RS256"],
    ];
    for (const [jwt, error] of refused) {
      const res = await post(jwt);
      expect(res.status, error).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error });
      for (const piece of jwt.split(".").filter(Boolean)) expect(text).not.toContain(piece);
    }
    expect(await takeHandoff(env.CACHE, today(), "vpl", 0)).toBeNull();
    // the Worker's log says why, each time, and nothing of any token either
    expect(lines.filter((l) => l.includes("handoff refused"))).toHaveLength(refused.length);
    const log = lines.join("\n");
    for (const [jwt] of refused) for (const piece of jwt.split(".").filter(Boolean)) expect(log).not.toContain(piece);
  });

  it("still takes the key when the Worker has one, and GitHub's token too", async () => {
    const keyed: Env = { ...env, EVENTS_HANDOFF_KEY: "test-only-stand-in-key" };
    expect((await post("test-only-stand-in-key", keyed)).status).toBe(200);
    expect((await post(await token(claims()), keyed)).status).toBe(200);
    const wrong = await post("not-the-key", keyed);
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "wrong key" });
    // a token that fails is refused as a token, key or no key
    expect(await (await post(await token(claims(), stranger), keyed)).json()).toEqual({ error: "GitHub token: unknown signing key" });
  });

  it("refuses a request with neither: nothing sent, or a key the Worker doesn't have", async () => {
    const none = await post(null);
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: "no key or GitHub token" });
    const key = await post("someone-elses-key");
    expect(key.status).toBe(401);
    expect(await key.json()).toEqual({ error: "EVENTS_HANDOFF_KEY is not set on the Worker" });
    expect(await takeHandoff(env.CACHE, today(), "vpl", 0)).toBeNull();
    expect(asked).toBe(0);
  });

  it("503 while GitHub's keys can't be had", async () => {
    githubAnswers = () => new Response("unavailable", { status: 503 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(await token(claims()));
    expect(res.status).toBe(503);
    expect(res.headers.get("www-authenticate")).toBeNull();
    expect(await res.json()).toEqual({ error: "GitHub token: GitHub's keys couldn't be fetched" });
    expect(await takeHandoff(env.CACHE, today(), "vpl", 0)).toBeNull();
  });
});

describe("the GitHub job's side: signing in (scripts/libraries.ts)", () => {
  /** What the runner sets in a job that has `id-token: write` (stand-ins). */
  const RUNNER = {
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://run-actions-1-azure-eastus.actions.githubusercontent.com/42//idtoken/abc/def?api-version=2.0",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "stand-in-request-token",
  };

  it("asks the runner for a token made out to the hand-over, and hands the pages over with it", async () => {
    const jobToken = await token(claims());
    const asks: { url: string; headers: Record<string, string> }[] = [];
    const runner: Get = async (url, init) => (asks.push({ url, headers: Object.fromEntries(new Headers(init.headers).entries()) }), Response.json({ count: 1999, value: jobToken }));
    expect(signInWith(RUNNER)).toBe("github");
    const credential = await handoffCredential(RUNNER, runner);
    expect(credential).toBe(jobToken);
    expect(asks).toEqual([
      { url: `${RUNNER.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=changle-events-handoff`, headers: { authorization: "bearer stand-in-request-token", accept: "application/json" } },
    ]);
    // handed over with it, the Worker (no key of its own) keeps the page
    const sent: (string | null)[] = [];
    const toWorker: Get = (url, init) => (sent.push(new Headers(init.headers).get("authorization")), call(new Request(url, init)));
    await handOver(toWorker, ENDPOINT, credential, "vpl", today(), { part: 0, raw: vpl, found: 0, inWindow: 0 });
    expect(sent).toEqual([`Bearer ${jobToken}`]);
    expect((await takeHandoff(env.CACHE, today(), "vpl", 0))?.raw).toBe(vpl);
    // a runner address without a query of its own gets one
    asks.length = 0;
    await githubToken({ ...RUNNER, ACTIONS_ID_TOKEN_REQUEST_URL: "https://runner.example/idtoken" }, runner);
    expect(asks[0].url).toBe("https://runner.example/idtoken?audience=changle-events-handoff");
  });

  it("EVENTS_HANDOFF_KEY still wins when it's set: GitHub isn't asked", async () => {
    let n = 0;
    const runner: Get = async () => (n++, Response.json({ value: await token(claims()) }));
    const vars = { ...RUNNER, EVENTS_HANDOFF_KEY: "a-local-key" };
    expect(signInWith(vars)).toBe("key");
    expect(await handoffCredential(vars, runner)).toBe("a-local-key");
    expect(signInWith({ EVENTS_HANDOFF_KEY: "a-local-key" })).toBe("key");
    expect(n).toBe(0);
  });

  it("says plainly when it can't sign in, never with the runner's request token in the message", async () => {
    expect(signInWith({})).toBeNull();
    expect(signInWith({ ACTIONS_ID_TOKEN_REQUEST_URL: RUNNER.ACTIONS_ID_TOKEN_REQUEST_URL })).toBeNull();
    const never: Get = async () => {
      throw new Error("not asked");
    };
    await expect(handoffCredential({}, never)).rejects.toThrow("needs `permissions: id-token: write`");
    const answers: [answer: () => Response, message: string][] = [
      [() => new Response("Forbidden", { status: 403 }), "GitHub's sign-in token: HTTP 403"],
      [() => Response.json({ count: 0 }), "GitHub's sign-in token: none in its answer"],
      [() => new Response("not json"), "GitHub's sign-in token: none in its answer"],
    ];
    for (const [answer, message] of answers) {
      const e = (await handoffCredential(RUNNER, async () => answer()).catch((err: unknown) => err)) as Error;
      expect(e.message).toBe(message);
      expect(e.message).not.toContain(RUNNER.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
    }
  });
});
