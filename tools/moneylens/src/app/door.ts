/**
 * The door: everything between "a browser opens the app" and "the vault is open", as plain
 * functions over one way of asking the server (`Ask`). No screen is in here and no storage; the
 * screens (web/app) call these and say what came back.
 *
 * In order: finishing a sign-in (the handoff code in the address, traded for a session);
 * asking where things stand (signed out, no vault yet, a vault that is locked); making a vault
 * (here on the device, then kept on the server with its two ways in); opening one (the proof,
 * then the wrapper: assessment 1.9); locking.
 *
 * What comes from the server is checked before it is used, every time: a proof's parameters
 * before a proof is made from them (`isProofParams`: a server asking for a cheap proof is asking
 * for a cheap way to test guesses), and a wrapper before the secret is tried on it. A wrapper is
 * never kept: it is used once, here, and dropped.
 */
import { createVault, isWrapper, unlock, type OpenVault, type Secret, type Wrapper } from "../vault/crypto";
import type { Weak } from "../vault/passphrase";
import { isProofParams, newProof, proofOf, type ProofParams } from "../vault/proof";

/**
 * One request to the server's /api: what came back, or null when nothing did (no network, no answer in time, an
 * answer that was not one). `parting` is for a request made as the page goes away: the browser is asked to send it
 * even so, and nobody waits for the answer.
 */
export type Ask = (action: string, body?: unknown, parting?: boolean) => Promise<{ status: number; json: Record<string, unknown> } | null>;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** How long a request may take before it counts as no answer. Shorter than the store's own patience (README, "The store"). */
export const ASK_MS = 20_000;

/** `Ask` over `fetch`, to this origin's own /api, with the session's cookie, which the browser sends and this code never sees. */
export function askOver(fetcher: typeof fetch = (input, init) => fetch(input, init), base = "/api", patience = ASK_MS): Ask {
  return async (action, body = {}, parting = false) => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), patience);
    try {
      const answer = await fetcher(`${base}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin", cache: "no-store", redirect: "error", keepalive: parting, signal: stop.signal });
      const json: unknown = await answer.json().catch(() => null);
      return { status: answer.status, json: isRecord(json) ? json : {} };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------------------------

/** The handoff code the main site sent the browser back with, in the address's fragment (`#h=<code>`), or null. */
export function codeIn(fragment: string): string | null {
  const found = /^#h=([A-Za-z0-9_-]{20,128})$/.exec(fragment);
  return found ? found[1]! : null;
}

/**
 * How a sign-in ended. "code": the code did not trade (used, out of time, or not this browser's: the sign-in starts
 * over). "try-again": the server turned it away for a reason that has passed (assessment 1.8). "offline": no answer.
 */
export type Entered = "ok" | "code" | "not-admitted" | "closed" | "too-many" | "slow-down" | "try-again" | "offline" | "server";

/** Trades the handoff code for a session. The session is a cookie this code never sees. */
export async function enter(ask: Ask, code: string): Promise<Entered> {
  const answer = await ask("session", { code });
  if (!answer) return "offline";
  if (answer.status === 200 && answer.json.ok === true) return "ok";
  if (answer.status === 401 || answer.status === 400) return "code";
  if (answer.status === 403) return answer.json.why === "not-admitted" ? "not-admitted" : answer.json.why === "closed" ? "closed" : "server";
  // ("slow-down": too many requests from this address in a minute; anything else: this account's dozen sign-ins an hour)
  if (answer.status === 429) return answer.json.why === "slow-down" ? "slow-down" : "too-many";
  if (answer.status === 503 && answer.json.why === "try-again") return "try-again";
  return "server";
}

// ---------------------------------------------------------------------------------------------
// Where things stand
// ---------------------------------------------------------------------------------------------

export type Standing =
  | { at: "signed-out"; why: "no-session" | "not-admitted" | "closed" }
  | { at: "no-vault" }
  | { at: "vault"; vault: string; kinds: string[]; unlocked: boolean }
  | { at: "trouble"; why: "offline" | "server" | "busy" };

/** Asks the server where this browser stands: signed in or not, and whether there is a vault. */
export async function standing(ask: Ask): Promise<Standing> {
  const answer = await ask("vault");
  if (!answer) return { at: "trouble", why: "offline" };
  if (answer.status === 401) return { at: "signed-out", why: "no-session" };
  if (answer.status === 403) return answer.json.why === "not-admitted" || answer.json.why === "closed" ? { at: "signed-out", why: answer.json.why } : { at: "trouble", why: "server" };
  // (too many requests from this address in a minute: nothing is wrong with the server, and in a minute it can be asked again)
  if (answer.status === 429) return { at: "trouble", why: "busy" };
  if (answer.status !== 200 || answer.json.ok !== true) return { at: "trouble", why: "server" };
  const { vault, ways, unlocked } = answer.json;
  if (vault === null) return { at: "no-vault" };
  if (typeof vault !== "string" || !Array.isArray(ways)) return { at: "trouble", why: "server" };
  const kinds = ways.map((way: unknown) => (isRecord(way) && typeof way.kind === "string" ? way.kind : "")).filter(Boolean);
  return { at: "vault", vault, kinds, unlocked: unlocked === true };
}

// ---------------------------------------------------------------------------------------------
// Making a vault
// ---------------------------------------------------------------------------------------------

/**
 * A vault that exists on this device only: its key, its two wrappers with a proof for each, and the recovery code.
 * The screen shows the code and has the person keep it before the vault is sent to the server (`keep`), so that a
 * vault the server holds is always one whose recovery code somebody was shown.
 */
export type Draft = {
  vault: OpenVault;
  recoveryCode: string;
  ways: { wrapper: Wrapper; params: ProofParams; proof: string }[];
};

/** Makes a vault here, from a passphrase. Nothing is sent. A passphrase that is too weak makes none (VAULT-7). */
export async function draft(passphrase: string): Promise<{ ok: true; draft: Draft } | { ok: false; why: Weak }> {
  const created = await createVault(passphrase);
  if (!created.ok) return created;
  const secrets: Secret[] = [
    { kind: "passphrase", passphrase },
    { kind: "recovery", code: created.recoveryCode },
  ];
  const ways: Draft["ways"] = [];
  for (const [i, wrapper] of created.wrappers.entries()) {
    const proved = await newProof(created.vault.id, secrets[i]!);
    if (!proved || wrapper.kind !== secrets[i]!.kind) throw new Error("door: a new vault's ways in could not be made");
    ways.push({ wrapper, ...proved });
  }
  return { ok: true, draft: { vault: created.vault, recoveryCode: created.recoveryCode, ways } };
}

/**
 * Has the server keep a drafted vault. Sending the same draft again is safe: the server answers a vault it already
 * holds as it answered the first time. "another": this account already has another vault (made on another device
 * since this page was opened): this draft is to be dropped, and that vault opened.
 */
export async function keep(ask: Ask, made: Draft): Promise<"ok" | "another" | "signed-out" | "busy" | "offline" | "server"> {
  const answer = await ask("vault/start", { vault: made.vault.id, ways: made.ways });
  if (!answer) return "offline";
  if (answer.status === 200 && answer.json.ok === true && answer.json.vault === made.vault.id) return "ok";
  if (answer.status === 409) return "another";
  if (answer.status === 401 || answer.status === 403) return "signed-out";
  // (too many requests from this address in a minute: nothing was kept, and nothing is wrong with the server)
  if (answer.status === 429) return "busy";
  return "server";
}

// ---------------------------------------------------------------------------------------------
// Opening a vault
// ---------------------------------------------------------------------------------------------

/**
 * How opening went. Opened, `calledOff`: an erasing was asked for, and showing the proof called it off (the server
 * does that, erase.ts); the person is to be told.
 *
 * - "wrong-secret": the server says the proof was wrong, so the passphrase or the code was. `left`: how many more
 *   may be wrong before a wait.
 * - "too-many": too many wrong ones for this account; `again` is how long to wait, in milliseconds.
 * - "no-secret": what was typed is not a secret of that kind at all (a recovery code with a symbol missing).
 * - "no-way": the vault has no way in of that kind.
 * - "unsupported": what the server sent is not something this version can use (a newer format, or parameters
 *   outside what is accepted). The secret may well be right. Nothing was shown to the server.
 * - "changed": the proof was right and the wrapper that came back does not open under the same secret, or is not
 *   this vault's. The ways in were altered where they are stored. Never to be shown as a wrong passphrase.
 * - "busy": too many requests from this address in a minute. Nothing was tried; in a minute it can be.
 */
export type Opened =
  | { ok: true; vault: OpenVault; calledOff?: true }
  | { ok: false; why: "wrong-secret"; left: number | null }
  | { ok: false; why: "too-many"; again: number }
  | { ok: false; why: "no-secret" | "no-way" | "unsupported" | "changed" | "busy" | "signed-out" | "offline" | "server" };

/** Opens the vault with one of its secrets: asks for the proof's parameters, shows the proof, and opens the wrapper that comes back. */
export async function open(ask: Ask, vault: string, secret: Secret): Promise<Opened> {
  if (secret.kind !== "passphrase" && secret.kind !== "recovery") return { ok: false, why: "no-way" };
  const way = await ask("vault/way", { kind: secret.kind });
  if (!way) return { ok: false, why: "offline" };
  if (way.status === 401 || way.status === 403) return { ok: false, why: "signed-out" };
  if (way.status === 404) return { ok: false, why: "no-way" };
  if (way.status === 429) return { ok: false, why: "busy" };
  if (way.status !== 200 || typeof way.json.id !== "string") return { ok: false, why: "server" };
  const params = way.json.params;
  if (!isProofParams(params) || params.kind !== secret.kind) return { ok: false, why: "unsupported" };
  const proof = await proofOf(vault, params, secret);
  if (proof === null) return { ok: false, why: "no-secret" };

  const shown = await ask("vault/unlock", { id: way.json.id, proof });
  if (!shown) return { ok: false, why: "offline" };
  if (shown.status === 401 || shown.status === 403) return { ok: false, why: "signed-out" };
  if (shown.status === 422) return { ok: false, why: "wrong-secret", left: typeof shown.json.left === "number" ? shown.json.left : null };
  // (too many requests from this address is not too many wrong tries: nothing was tried)
  if (shown.status === 429 && shown.json.why === "slow-down") return { ok: false, why: "busy" };
  if (shown.status === 429) return { ok: false, why: "too-many", again: typeof shown.json.again === "number" && shown.json.again > 0 ? shown.json.again : 60_000 };
  if (shown.status === 404) return { ok: false, why: "no-way" };
  if (shown.status !== 200) return { ok: false, why: "server" };
  const wrapper = shown.json.wrapper;
  if (!isWrapper(wrapper)) return { ok: false, why: "unsupported" };
  if (wrapper.kind !== secret.kind) return { ok: false, why: "changed" };
  const opened = await unlock(wrapper, secret, vault);
  if (opened.ok) return shown.json.erasing === "called-off" ? { ...opened, calledOff: true } : opened;
  return { ok: false, why: opened.why === "unsupported" ? "unsupported" : "changed" };
}

/** Tells the server this session has locked its vault. Best effort: the key is dropped here whatever the answer. */
export async function lock(ask: Ask, parting = false): Promise<void> {
  await ask("vault/lock", {}, parting);
}

/**
 * Signs this browser out. True when the server says the session is over for this browser: it ended it now, there was
 * none (401), or the account is no longer let in (403 "not-admitted", which takes the cookie away, or "closed").
 * False when nothing says so (no answer, or one that was not about that): the session may still be there, and the
 * screen must not say otherwise.
 */
export async function leave(ask: Ask): Promise<boolean> {
  const answer = await ask("session/end");
  if (answer === null) return false;
  if (answer.status === 200 || answer.status === 401) return true;
  return answer.status === 403 && (answer.json.why === "not-admitted" || answer.json.why === "closed");
}
