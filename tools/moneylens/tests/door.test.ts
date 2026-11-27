/**
 * The door (src/app/door.ts): finishing a sign-in, where things stand, making a vault and opening
 * one, against the server's own code on Node's SQLite (account.ts, ways.ts), with real keys,
 * wrappers and proofs. And against a server that answers what it should not: every answer is
 * checked before it is used.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { base64url, newId } from "../src/core/ids";
import { ASK_MS, askOver, codeIn, draft, enter, keep, leave, lock, open, standing, type Ask } from "../src/app/door";
import { act, proofsIn, signIn } from "../src/server/account";
import { configOf } from "../src/server/gate";
import { hashOf, newToken } from "../src/server/sessions";
import { PBKDF2_FLOOR, openJson, sealJson, type Wrapper } from "../src/vault/crypto";
import { sqlite } from "./sqlremote";

const A = "uaaaaaa1";
const T0 = Date.UTC(2026, 10, 26, 21, 0, 0);
const cfg = configOf({ ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A })!;
const PASSPHRASE = "seven tidal marmots in a canoe";

/** One person's database, and devices that ask it the way a browser does: through JSON, with the proofs hashed first. */
function server() {
  const db = sqlite();
  let now = T0;
  const asked: string[] = [];
  const device = async (): Promise<Ask> => {
    const hash = (await hashOf(newToken()))!;
    assert.equal(signIn(db, { account: A, session: newId(), hash, label: "Chrome on Windows", owner: false }, now++, cfg.gate), "ok");
    return async (action, body = {}) => {
      asked.push(action);
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const proofs = await proofsIn(action, bytes);
      const answer = proofs ? act(db, { account: A, hash, action, body: bytes, proofs }, now++, cfg) : { status: 400, json: { ok: false, why: "bad-request" } };
      return { status: answer.status, json: JSON.parse(JSON.stringify(answer.json ?? {})) as Record<string, unknown> };
    };
  };
  const tries = (): number => (db.raw.prepare(`SELECT COUNT(*) AS n FROM tries`).all()[0] as { n: number }).n;
  return { db, device, asked, tries, later: (ms: number) => (now += ms) };
}
/** A server's answers with one of them changed on its way back. */
const twisted =
  (ask: Ask, action: string, twist: (answer: { status: number; json: Record<string, unknown> }) => { status: number; json: Record<string, unknown> } | null): Ask =>
  async (name, body) => {
    const answer = await ask(name, body);
    return answer && name === action ? twist(answer) : answer;
  };
const canned =
  (answers: Record<string, { status: number; json?: Record<string, unknown> } | null>): Ask =>
  async (action) => {
    const answer = answers[action];
    return answer === undefined ? { status: 404, json: { ok: false, why: "no-such-thing" } } : answer && { status: answer.status, json: answer.json ?? {} };
  };

test("the handoff code is read from the address's fragment, and only when that is all the fragment is", () => {
  const code = newToken();
  assert.equal(codeIn(`#h=${code}`), code);
  assert.equal(codeIn(`#h=${"a".repeat(20)}`), "a".repeat(20));
  assert.equal(codeIn(`#h=${"a".repeat(128)}`), "a".repeat(128));
  for (const fragment of ["", "#", "#h=", `#h=${"a".repeat(19)}`, `#h=${"a".repeat(129)}`, `#x=${code}`, `h=${code}`, `#h=${code}&next=/x`, `#h=${code} `, ` #h=${code}`, `#h=${code}\n`, `#h=${code.slice(0, 20)}/../x`, `#H=${code}`, `?h=${code}`, `#h=${code}#h=${code}`])
    assert.equal(codeIn(fragment), null, JSON.stringify(fragment));
});

test("a sign-in ends one of eight ways, and only one of them is in", async () => {
  const sent: unknown[] = [];
  const answers: [{ status: number; json?: Record<string, unknown> } | null, string][] = [
    [{ status: 200, json: { ok: true } }, "ok"],
    [{ status: 200, json: {} }, "server"],
    [{ status: 401, json: { ok: false, why: "code" } }, "code"],
    [{ status: 400, json: { ok: false, why: "no-nonce" } }, "code"],
    [{ status: 403, json: { ok: false, why: "not-admitted" } }, "not-admitted"],
    [{ status: 403, json: { ok: false, why: "closed" } }, "closed"],
    [{ status: 403, json: { ok: false, why: "origin" } }, "server"],
    [{ status: 429, json: { ok: false, why: "too-many" } }, "too-many"],
    [{ status: 503, json: { ok: false, why: "try-again" } }, "try-again"],
    [{ status: 503, json: { ok: false, why: "not-set-up" } }, "server"],
    [{ status: 500, json: { ok: false, why: "unavailable" } }, "server"],
    [null, "offline"],
  ];
  for (const [answer, ended] of answers) {
    const ask: Ask = async (action, body) => (sent.push([action, body]), answer && { status: answer.status, json: answer.json ?? {} });
    assert.equal(await enter(ask, "the-code-as-it-came-in"), ended, JSON.stringify(answer));
  }
  assert.deepEqual(sent[0], ["session", { code: "the-code-as-it-came-in" }]);
});

test("where things stand: signed out, no vault yet, a vault and whether this session has opened it", async () => {
  const s = server();
  const phone = await s.device();
  assert.deepEqual(await standing(phone), { at: "no-vault" });
  for (const [answer, stands] of [
    [{ status: 401, json: { ok: false, why: "signed-out" } }, { at: "signed-out", why: "no-session" }],
    [{ status: 403, json: { ok: false, why: "not-admitted" } }, { at: "signed-out", why: "not-admitted" }],
    [{ status: 403, json: { ok: false, why: "closed" } }, { at: "signed-out", why: "closed" }],
    [{ status: 403, json: { ok: false, why: "origin" } }, { at: "trouble", why: "server" }],
    [{ status: 500, json: {} }, { at: "trouble", why: "server" }],
    [{ status: 200, json: { ok: false } }, { at: "trouble", why: "server" }],
    [{ status: 200, json: { ok: true, vault: 5, ways: [] } }, { at: "trouble", why: "server" }],
    [{ status: 200, json: { ok: true, vault: "v", ways: "none" } }, { at: "trouble", why: "server" }],
    [{ status: 200, json: { ok: true, vault: null } }, { at: "no-vault" }],
    [{ status: 200, json: { ok: true, vault: "v", ways: [{ id: "i", kind: "passphrase" }, { kind: 7 }, null, { id: "j", kind: "recovery" }], unlocked: "yes" } }, { at: "vault", vault: "v", kinds: ["passphrase", "recovery"], unlocked: false }],
    [null, { at: "trouble", why: "offline" }],
  ] as const)
    assert.deepEqual(await standing(canned({ vault: answer })), stands, JSON.stringify(answer));
});

test("a vault is made on the device, kept by the server with its two ways in, and opened on another device by passphrase or by recovery code", async () => {
  const s = server();
  const phone = await s.device();
  // a passphrase that is too weak makes nothing, and nothing is asked of the server
  for (const [weak, why] of [
    ["short", "too-short"],
    ["passwordpassword", "pattern"],
  ] as const) {
    const refused = await draft(weak);
    assert.ok(!refused.ok && refused.why === why, JSON.stringify(refused));
  }
  assert.deepEqual(s.asked, []);

  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  // nothing has been sent yet: the screen shows the recovery code first
  assert.deepEqual(s.asked, []);
  assert.match(made.draft.recoveryCode, /^[0-9A-Z]{4}(-[0-9A-Z]{2,4})+$/);
  assert.deepEqual(
    made.draft.ways.map((way) => [way.wrapper.kind, way.params.kind, way.wrapper.vault === made.draft.vault.id]),
    [
      ["passphrase", "passphrase", true],
      ["recovery", "recovery", true],
    ],
  );
  assert.equal(await keep(phone, made.draft), "ok");
  // sent again (the answer was lost): the same answer
  assert.equal(await keep(phone, made.draft), "ok");
  assert.deepEqual(await standing(phone), { at: "vault", vault: made.draft.vault.id, kinds: ["passphrase", "recovery"], unlocked: true });
  // something sealed on the phone, for the others to open
  const chunk = { id: newId(), type: "book" };
  const sealed = await sealJson(made.draft.vault, chunk, { note: "kept on the phone" });

  // a laptop: signed in, and the vault is there and shut
  const laptop = await s.device();
  const stands = await standing(laptop);
  assert.deepEqual(stands, { at: "vault", vault: made.draft.vault.id, kinds: ["passphrase", "recovery"], unlocked: false });
  const vault = made.draft.vault.id;
  // the wrong passphrase: the server says so, and says how many more
  assert.deepEqual(await open(laptop, vault, { kind: "passphrase", passphrase: "seven tidal marmots in a kayak" }), { ok: false, why: "wrong-secret", left: 9 });
  assert.equal(s.tries(), 1);
  // the right one, typed with other spacing: the same passphrase
  const opened = await open(laptop, vault, { kind: "passphrase", passphrase: `  ${PASSPHRASE.replace(/ /g, "  ")}` });
  assert.ok(opened.ok && opened.vault.id === vault);
  assert.deepEqual(await openJson(opened.vault, chunk, sealed), { value: { note: "kept on the phone" } });
  // the key that comes out cannot be exported, as on the device that made it (VAULT-3)
  assert.equal(opened.vault.key.extractable, false);
  assert.deepEqual(await standing(laptop), { at: "vault", vault, kinds: ["passphrase", "recovery"], unlocked: true });

  // a tablet, with the recovery code and nothing else
  const tablet = await s.device();
  // typed with a symbol missing: not a code, and the server is not asked to look at anything
  const before = [...s.asked];
  assert.deepEqual(await open(tablet, vault, { kind: "recovery", code: made.draft.recoveryCode.slice(0, -1) }), { ok: false, why: "no-secret" });
  assert.deepEqual(s.asked.slice(before.length), ["vault/way"]);
  assert.equal(s.tries(), 1);
  const byCode = await open(tablet, vault, { kind: "recovery", code: made.draft.recoveryCode.toLowerCase() });
  assert.ok(byCode.ok);
  assert.deepEqual(await openJson(byCode.vault, chunk, sealed), { value: { note: "kept on the phone" } });
  // a passkey is not a way in yet
  assert.deepEqual(await open(tablet, vault, { kind: "passkey", prf: new Uint8Array(32) }), { ok: false, why: "no-way" });

  // locking: the server no longer counts the session as unlocked
  await lock(laptop);
  assert.equal(((await standing(laptop)) as { unlocked: boolean }).unlocked, false);
  // another vault for the same account is not kept: the device is told there is one already
  const second = await draft(PASSPHRASE);
  assert.ok(second.ok);
  assert.equal(await keep(tablet, second.draft), "another");
  // signing out
  assert.equal(await leave(tablet), true);
  assert.deepEqual(await standing(tablet), { at: "signed-out", why: "no-session" });
  // (signed out already: the session is over, which is what was asked)
  assert.equal(await leave(tablet), true);
  // with no answer, or an answer that says nothing of the session, it is not said to be over
  assert.equal(await leave(async () => null), false);
  for (const status of [403, 404, 429, 500, 503]) assert.equal(await leave(async () => ({ status, json: {} })), false, String(status));
  // and what is asked is to end this session, as the page goes on (nothing here is a parting request)
  const asked: unknown[][] = [];
  const noting: Ask = async (...args) => (asked.push(args), { status: 200, json: {} });
  await leave(noting);
  assert.deepEqual(asked, [["session/end"]]);
  await lock(noting);
  await lock(noting, true);
  assert.deepEqual(asked.slice(1), [["vault/lock", {}, false], ["vault/lock", {}, true]]);
  assert.deepEqual(await open(tablet, vault, { kind: "passphrase", passphrase: PASSPHRASE }), { ok: false, why: "signed-out" });
});

test("too many wrong passphrases: the device is told how long to wait, and the right one waits too", async () => {
  const s = server();
  const phone = await s.device();
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(phone, made.draft), "ok");
  const laptop = await s.device();
  const vault = made.draft.vault.id;
  for (let i = 0; i < 10; i++) assert.deepEqual(await open(laptop, vault, { kind: "passphrase", passphrase: `not the passphrase at all ${i}` }), { ok: false, why: "wrong-secret", left: 9 - i });
  const waiting = await open(laptop, vault, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.ok(!waiting.ok && waiting.why === "too-many" && waiting.again > 59 * 60_000 && waiting.again <= 60 * 60_000, JSON.stringify(waiting));
  // an hour on, from a device that signed in then, it opens
  s.later(61 * 60_000);
  assert.ok((await open(await s.device(), vault, { kind: "passphrase", passphrase: PASSPHRASE })).ok);
});

test("what the server sends is checked before it is used: no proof for cheap parameters, and a wrapper that does not fit is not a wrong passphrase", async () => {
  const s = server();
  const phone = await s.device();
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(phone, made.draft), "ok");
  const vault = made.draft.vault.id;
  const secret = { kind: "passphrase", passphrase: PASSPHRASE } as const;
  const laptop = await s.device();
  const real = made.draft.ways[0]!;
  const other = await draft("another passphrase for another vault");
  assert.ok(other.ok);

  // Parameters that are not ones to make a proof from: nothing is shown to the server.
  const params = real.params as { iterations: number; salt: string };
  for (const twist of [
    { ...real.params, iterations: PBKDF2_FLOOR - 1 },
    { ...real.params, iterations: 1 },
    { ...real.params, iterations: 5_000_000 },
    { ...real.params, kdf: "hkdf-sha256" },
    { ...real.params, v: 2 },
    { ...real.params, salt: base64url(new Uint8Array(8)) },
    made.draft.ways[1]!.params,
    null,
    "params",
  ]) {
    const before = s.asked.length;
    assert.deepEqual(await open(twisted(laptop, "vault/way", (answer) => ({ ...answer, json: { ...answer.json, params: twist } })), vault, secret), { ok: false, why: "unsupported" }, JSON.stringify(twist));
    assert.deepEqual(s.asked.slice(before), ["vault/way"]);
  }
  assert.equal(s.tries(), 0);
  assert.ok(params.iterations >= PBKDF2_FLOOR);

  // A wrapper that came back for a right proof, and is not this vault's own passphrase wrapper as it was made.
  const swapped = (wrapper: unknown): Ask => twisted(laptop, "vault/unlock", (answer) => ({ ...answer, json: { ...answer.json, wrapper } }));
  const flipped: Wrapper = { ...real.wrapper, salt: base64url(new Uint8Array(32)) };
  for (const [wrapper, why] of [
    [other.draft.ways[0]!.wrapper, "changed"],
    [made.draft.ways[1]!.wrapper, "changed"],
    [flipped, "changed"],
    [{ ...real.wrapper, wrapped: other.draft.ways[0]!.wrapper.wrapped }, "changed"],
    [{ ...real.wrapper, vault: other.draft.vault.id }, "changed"],
    [{ ...real.wrapper, iterations: 1000 }, "unsupported"],
    [{ ...real.wrapper, v: 2 }, "unsupported"],
    [null, "unsupported"],
    ["wrapper", "unsupported"],
    [{}, "unsupported"],
  ] as const)
    assert.deepEqual(await open(swapped(wrapper), vault, secret), { ok: false, why }, JSON.stringify(wrapper));
  // none of that was a wrong passphrase, and none of it was counted as one
  assert.equal(s.tries(), 0);

  // No answer, or an answer that is no answer, at either step.
  for (const action of ["vault/way", "vault/unlock"]) {
    assert.deepEqual(await open(twisted(laptop, action, () => null), vault, secret), { ok: false, why: "offline" });
    assert.deepEqual(await open(twisted(laptop, action, () => ({ status: 500, json: {} })), vault, secret), { ok: false, why: "server" });
    assert.deepEqual(await open(twisted(laptop, action, () => ({ status: 401, json: {} })), vault, secret), { ok: false, why: "signed-out" });
    assert.deepEqual(await open(twisted(laptop, action, () => ({ status: 403, json: {} })), vault, secret), { ok: false, why: "signed-out" });
    assert.deepEqual(await open(twisted(laptop, action, () => ({ status: 404, json: {} })), vault, secret), { ok: false, why: "no-way" });
  }
  assert.deepEqual(await open(twisted(laptop, "vault/way", (answer) => ({ ...answer, json: { ...answer.json, id: 5 } })), vault, secret), { ok: false, why: "server" });
  // answers about tries that say nothing usable: still a wrong secret, still a wait
  assert.deepEqual(await open(twisted(laptop, "vault/unlock", () => ({ status: 422, json: {} })), vault, secret), { ok: false, why: "wrong-secret", left: null });
  assert.deepEqual(await open(twisted(laptop, "vault/unlock", () => ({ status: 429, json: { again: -5 } })), vault, secret), { ok: false, why: "too-many", again: 60_000 });
  assert.deepEqual(await open(twisted(laptop, "vault/unlock", () => ({ status: 429, json: { again: 1234 } })), vault, secret), { ok: false, why: "too-many", again: 1234 });
  // and after all of it, the real answers still open the vault
  assert.ok((await open(laptop, vault, secret)).ok);
});

test("keeping a vault: what each answer means", async () => {
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  const id = made.draft.vault.id;
  const sent: unknown[] = [];
  for (const [answer, said] of [
    [{ status: 200, json: { ok: true, vault: id } }, "ok"],
    [{ status: 200, json: { ok: true, vault: newId() } }, "server"],
    [{ status: 200, json: { ok: false, vault: id } }, "server"],
    [{ status: 409, json: { ok: false, why: "another-vault" } }, "another"],
    [{ status: 401, json: {} }, "signed-out"],
    [{ status: 403, json: {} }, "signed-out"],
    [{ status: 400, json: {} }, "server"],
    [{ status: 500, json: {} }, "server"],
    [null, "offline"],
  ] as const) {
    const ask: Ask = async (action, body) => (sent.push([action, body]), answer && { status: answer.status, json: answer.json });
    assert.equal(await keep(ask, made.draft), said, JSON.stringify(answer));
  }
  // what is sent: the vault's id and its two ways in, each with its wrapper, its parameters and its proof; never the key or the code
  const [action, body] = sent[0] as [string, { vault: string; ways: { wrapper: unknown; params: unknown; proof: string }[] }];
  assert.equal(action, "vault/start");
  assert.deepEqual([body.vault, body.ways.length, Object.keys(body.ways[0]!).sort()], [id, 2, ["params", "proof", "wrapper"]]);
  const text = JSON.stringify(sent);
  assert.equal(text.includes(made.draft.recoveryCode), false);
  assert.equal(text.includes(PASSPHRASE), false);
});

test("asking over the network: a POST of JSON to this origin, and no answer is null", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const ask = askOver(async (input, init) => {
    seen.push({ url: String(input), init: init! });
    return new Response(JSON.stringify({ ok: true, vault: null }), { status: 200 });
  });
  assert.deepEqual(await ask("vault"), { status: 200, json: { ok: true, vault: null } });
  assert.deepEqual(await ask("vault/way", { kind: "passphrase" }), { status: 200, json: { ok: true, vault: null } });
  const { url, init } = seen[1]!;
  assert.equal(url, "/api/vault/way");
  assert.deepEqual([init.method, init.credentials, init.cache, init.redirect, init.body], ["POST", "same-origin", "no-store", "error", `{"kind":"passphrase"}`]);
  assert.deepEqual(init.headers, { "Content-Type": "application/json" });
  assert.equal(seen[0]!.init.body, "{}");
  // an answer that is not JSON, or is JSON and no object, is an answer with nothing in it
  for (const body of ["<html>", "[1,2]", "5", "null", ""]) assert.deepEqual(await askOver(async () => new Response(body, { status: 502 }))("vault"), { status: 502, json: {} });
  // a request that fails, and one that takes too long, are no answer
  assert.equal(await askOver(async () => Promise.reject(new TypeError("network")))("vault"), null);
  const slow = askOver((_input, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))), "/api", 30);
  const began = Date.now();
  assert.equal(await slow("vault"), null);
  assert.ok(Date.now() - began < 2000);
  assert.equal(ASK_MS, 20_000);
});
