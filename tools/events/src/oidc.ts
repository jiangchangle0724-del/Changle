// GitHub's sign-in token (OIDC), how the GitHub job proves who it is when it hands the libraries'
// pages over (src/handoff.ts). The job (.github/workflows/events-libraries.yml, which has
// `permissions: id-token: write`) asks GitHub for a token made out to this hand-over
// (HANDOFF_AUDIENCE). GitHub signs it with its own key and writes in it which repository, branch,
// workflow and event the job is running for. The Worker checks the signature against GitHub's public
// keys, then every claim that matters (HANDOFF_JOB), so only this repository's events-libraries job, on
// main, started by its schedule or by hand, gets through: not a fork, a pull request, another branch or
// workflow, a token GitHub made out to anyone else, or one that has run out. No secret on either side,
// so nothing for anyone to set or keep.
//
// Web Crypto only. RS256 (RSASSA-PKCS1-v1_5 with SHA-256) is the one algorithm GitHub signs with; a
// token saying any other `alg`, "none" and HS256 included, is refused before anything else. GitHub's
// keys (GITHUB_KEYS_URL) are kept an hour, in memory and in KV; a token signed with a key that isn't
// among them makes the Worker ask GitHub again, but not more than once a minute. Checking a token is
// one signature: about 0.4 ms of CPU (measured in Node, keys in hand), of the free plan's 10.
import { readCapped } from "./body";
import type { Get } from "./handoff";
import { USER_AGENT } from "./sources";

/** Who issues the tokens: GitHub Actions. */
export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
/** GitHub's public keys, which it signs the tokens with. */
export const GITHUB_KEYS_URL = `${GITHUB_ISSUER}/.well-known/jwks`;
/** Whom the job's token is made out to (its `aud`): this hand-over and nothing else. */
export const HANDOFF_AUDIENCE = "changle-events-handoff";

/**
 * The one job that may hand pages over, as its token names it. This repository
 * (jiangchangle0724-del/Changle) and its owner, by GitHub's numeric ids: they stay the same through
 * renames, and a fork has ids of its own. main, not another branch or a pull request. This workflow
 * file, as it is on main. Started by its schedule or by hand (Actions > Run workflow).
 */
export const HANDOFF_JOB = {
  repository_id: "1431750616",
  repository_owner_id: "332761129",
  ref: "refs/heads/main",
  /** How `workflow_ref` ends: "<owner>/<repository>/.github/workflows/events-libraries.yml@refs/heads/main". */
  workflowRefEnd: "/.github/workflows/events-libraries.yml@refs/heads/main",
  events: ["schedule", "workflow_dispatch"] as readonly string[],
};

/** Clocks differ: a token's times are taken a minute either way. */
export const CLOCK_SKEW_S = 60;
/** How long GitHub's keys are kept (GitHub's own cache-control says an hour). */
export const KEYS_FRESH_MS = 3_600_000;
/** On a key it doesn't know, the Worker asks GitHub again, but not more often than this. */
export const ASK_GITHUB_EVERY_MS = 60_000;
/** Where GitHub's keys are kept in KV. */
export const KEYS_KV_KEY = "github:jwks";
/** A longer token isn't GitHub's: theirs are about 2 KB. */
const MAX_TOKEN_CHARS = 16_384;
/** GitHub's list of keys is about 5 KB. */
const MAX_KEYS_BYTES = 100_000;

/** One of GitHub's keys: what checking a signature needs. */
interface GithubKey {
  kid: string;
  n: string;
  e: string;
}
/** GitHub's keys and when they were fetched (ms), as kept in memory and in KV. */
interface KeySet {
  at: number;
  keys: GithubKey[];
}

/** The verdict on a token: its claims when it passes; else a status and the reason, never anything from the token. */
export type Verdict = { ok: true; claims: Record<string, unknown> } | { ok: false; status: 401 | 503; error: string };

/**
 * GitHub's keys in this isolate's memory, shared by its requests: they're public and the same for
 * everyone, so nothing of one request is kept for another. `askedAt`: when GitHub was last asked;
 * `saved`: whether KV has them too.
 */
const memory: { keys: KeySet | null; askedAt: number; saved: boolean } = { keys: null, askedAt: -Infinity, saved: true };

/** Forget GitHub's keys in memory, and when it was asked (tests). */
export function forgetGithubKeys(): void {
  memory.keys = null;
  memory.askedAt = -Infinity;
  memory.saved = true;
}

/** A token: three base64url parts, header, claims and signature (empty for alg "none"). A key has no dots. */
const TOKEN_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]*$/;
/** Whether a credential has a token's shape, not a key's. */
export const looksLikeToken = (credential: string): boolean => TOKEN_SHAPE.test(credential);

function fromBase64url(part: string): Uint8Array {
  const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** A part of the token that should be a JSON object, or null. */
function objectOf(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(fromBase64url(part)));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Whether a token is GitHub's, made out to the hand-over, for the hand-over job (HANDOFF_JOB), and
 * valid now. When not, 401 and which check failed; 503 when GitHub's keys couldn't be had to tell.
 * Nothing is ever logged or answered from the token itself.
 */
export async function verifyGithubToken(token: string, kv: KVNamespace, now = Date.now(), get: Get = fetch): Promise<Verdict> {
  const no = (error: string, status: 401 | 503 = 401): Verdict => ({ ok: false, status, error });
  if (token.length > MAX_TOKEN_CHARS || !TOKEN_SHAPE.test(token)) return no("malformed");
  const [head, body, sig] = token.split(".");
  const header = objectOf(head);
  if (!header) return no("malformed");
  // RS256 only, the one GitHub signs with: never "none", never HS256 (which would take GitHub's public
  // key for a shared secret), never another.
  if (header.alg !== "RS256") return no("alg must be RS256");
  if (typeof header.kid !== "string" || header.kid === "" || "crit" in header) return no("malformed");
  const claims = objectOf(body);
  let signature: Uint8Array;
  try {
    signature = fromBase64url(sig);
  } catch {
    return no("malformed");
  }
  if (!claims || signature.length === 0) return no("malformed");

  const key = await githubKey(header.kid, kv, now, get);
  if (key === "unavailable") return no("GitHub's keys couldn't be fetched", 503);
  if (!key) return no("unknown signing key");
  if (!(await signedWith(key, `${head}.${body}`, signature))) return no("bad signature");
  const wrong = wrongClaim(claims, now);
  if (wrong) return no(wrong);
  await keepKeys(kv, now);
  return { ok: true, claims };
}

/** Why a (genuine) token's claims aren't the hand-over job's, now; null when they are. */
function wrongClaim(c: Record<string, unknown>, now: number): string | null {
  const t = now / 1000;
  if (c.iss !== GITHUB_ISSUER) return "wrong iss";
  if (c.aud !== HANDOFF_AUDIENCE) return "wrong aud";
  if (!isNumber(c.exp) || !isNumber(c.iat)) return "no exp or iat";
  if (t >= c.exp + CLOCK_SKEW_S) return "expired";
  if (c.iat > t + CLOCK_SKEW_S) return "issued in the future";
  if (c.nbf !== undefined && !(isNumber(c.nbf) && c.nbf <= t + CLOCK_SKEW_S)) return "not valid yet";
  if (c.repository_id !== HANDOFF_JOB.repository_id) return "wrong repository_id";
  if (c.repository_owner_id !== HANDOFF_JOB.repository_owner_id) return "wrong repository_owner_id";
  if (c.ref !== HANDOFF_JOB.ref) return "wrong ref";
  if (typeof c.workflow_ref !== "string" || !c.workflow_ref.endsWith(HANDOFF_JOB.workflowRefEnd)) return "wrong workflow_ref";
  if (typeof c.event_name !== "string" || !HANDOFF_JOB.events.includes(c.event_name)) return "wrong event_name";
  return null;
}

/** Whether `signature` is the RS256 signature of `signed` by this key of GitHub's. */
async function signedWith(key: GithubKey, signed: string, signature: Uint8Array): Promise<boolean> {
  try {
    const k = await crypto.subtle.importKey("jwk", { kty: "RSA", n: key.n, e: key.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", k, signature, new TextEncoder().encode(signed));
  } catch {
    return false;
  }
}

const fresh = (set: KeySet | null, now: number): KeySet | null => (set && now - set.at < KEYS_FRESH_MS ? set : null);

/**
 * GitHub's key with this id: from memory, else KV, else GitHub. GitHub is asked when no keys less than
 * an hour old are at hand, or when the id isn't among them (GitHub may have a new key), then not more
 * than once a minute, so made-up ids can't make the Worker ask over and over. Null: GitHub has no such
 * key. "unavailable": GitHub couldn't be asked, so it can't be told.
 */
async function githubKey(kid: string, kv: KVNamespace, now: number, get: Get): Promise<GithubKey | null | "unavailable"> {
  let set = fresh(memory.keys, now);
  if (!set) {
    set = fresh(keySetOf(await kv.get(KEYS_KV_KEY, "json").catch(() => null)), now);
    if (set) Object.assign(memory, { keys: set, saved: true });
  }
  const known = set?.keys.find((k) => k.kid === kid);
  if (known) return known;
  if (set && now - memory.askedAt < ASK_GITHUB_EVERY_MS) return null;
  memory.askedAt = now;
  const got = await fetchGithubKeys(get, now);
  if (!got) return "unavailable";
  Object.assign(memory, { keys: got, saved: false });
  return got.keys.find((k) => k.kid === kid) ?? null;
}

/** A key's fields as kept, or null. */
function keyOf(k: unknown): GithubKey | null {
  const { kid, n, e } = (k ?? {}) as Record<string, unknown>;
  return typeof kid === "string" && kid !== "" && typeof n === "string" && typeof e === "string" ? { kid, n, e } : null;
}

/** Keys as kept in KV, or null when that isn't what's there. */
function keySetOf(v: unknown): KeySet | null {
  const { at, keys } = (v ?? {}) as Record<string, unknown>;
  if (!isNumber(at) || !Array.isArray(keys)) return null;
  const kept = keys.map(keyOf);
  return kept.every((k) => k !== null) ? { at, keys: kept as GithubKey[] } : null;
}

/** GitHub's current keys (those it signs RS256 with), or null when they couldn't be had, which is logged. */
async function fetchGithubKeys(get: Get, now: number): Promise<KeySet | null> {
  try {
    const res = await get(GITHUB_KEYS_URL, { headers: { accept: "application/json", "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    const listed: unknown = (JSON.parse(await readCapped(res, MAX_KEYS_BYTES)) as { keys?: unknown } | null)?.keys;
    const keys: GithubKey[] = [];
    for (const k of Array.isArray(listed) ? listed : []) {
      const { kty, alg = "RS256", use = "sig" } = (k ?? {}) as Record<string, unknown>;
      const key = keyOf(k);
      if (kty === "RSA" && alg === "RS256" && use === "sig" && key) keys.push(key);
    }
    if (keys.length === 0) throw new Error("no RS256 keys in the answer");
    return { at: now, keys };
  } catch (e) {
    console.warn(JSON.stringify({ message: "GitHub's keys couldn't be fetched", error: e instanceof Error ? e.message : String(e) }));
    return null;
  }
}

/**
 * Once a token has passed: GitHub's keys go into KV, when they came from GitHub and KV hasn't got
 * them, for what's left of their hour. Only then, so no refused request ever costs a KV write.
 */
async function keepKeys(kv: KVNamespace, now: number): Promise<void> {
  const set = memory.keys;
  if (!set || memory.saved) return;
  memory.saved = true;
  const ttl = Math.floor((set.at + KEYS_FRESH_MS - now) / 1000);
  if (ttl < 60) return; // KV keeps nothing for less than a minute
  try {
    await kv.put(KEYS_KV_KEY, JSON.stringify(set), { expirationTtl: ttl });
  } catch (e) {
    console.warn(JSON.stringify({ message: "GitHub's keys not kept in KV", error: e instanceof Error ? e.message : String(e) }));
  }
}

// ---- The GitHub job's side (scripts/libraries.ts) ----

/** The variables the job signs in with. GitHub sets the first two in a job that has `id-token: write`. */
export interface SignInVars {
  ACTIONS_ID_TOKEN_REQUEST_URL?: string;
  ACTIONS_ID_TOKEN_REQUEST_TOKEN?: string;
  /** A key instead, for a run outside GitHub (src/handoff.ts). */
  EVENTS_HANDOFF_KEY?: string;
}

/** Whether GitHub gives this job sign-in tokens: on GitHub Actions, with `id-token: write`. */
export const canAskGithub = (vars: SignInVars): boolean => !!vars.ACTIONS_ID_TOKEN_REQUEST_URL && !!vars.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

/**
 * A sign-in token from GitHub, made out to the hand-over, asked of the runner as GitHub's own toolkit
 * does (getIDToken): its URL plus the audience, with its request token. Throws, saying why, when there's
 * none; the message never holds a token or the request token.
 */
export async function githubToken(vars: SignInVars, get: Get): Promise<string> {
  const url = vars.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = vars.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new Error("GitHub gives this job no sign-in token: it needs `permissions: id-token: write` (.github/workflows/events-libraries.yml)");
  const res = await get(`${url}${url.includes("?") ? "&" : "?"}audience=${encodeURIComponent(HANDOFF_AUDIENCE)}`, {
    headers: { authorization: `bearer ${bearer}`, accept: "application/json" },
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`GitHub's sign-in token: HTTP ${res.status}`);
  }
  const value = ((await res.json().catch(() => null)) as { value?: unknown } | null)?.value;
  if (typeof value !== "string" || !looksLikeToken(value)) throw new Error("GitHub's sign-in token: none in its answer");
  return value;
}
