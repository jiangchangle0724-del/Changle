/**
 * The ways into a vault as the server keeps them (src/server/ways.ts), and the requests about
 * them (account.ts): a vault is started with its two ways in or not at all, a wrapper goes only
 * to a session that shows its proof, wrong proofs are counted for the account, and sync is for
 * sessions that have unlocked. On Node's SQLite; the same code runs on the platform in
 * tests/platform/server.test.ts.
 *
 * The wrappers and parameters here open nothing. The server does not look inside them, which is
 * part of what is tested; what a device makes of them is tests/proof.test.ts and vault.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { newId } from "../src/core/ids";
import { act, proofsIn, signEveryoneOut, signIn, type Answer } from "../src/server/account";
import type { Db } from "../src/server/chunks";
import { configOf, type Config } from "../src/server/gate";
import { hashOf, newToken } from "../src/server/sessions";
import { KINDS, PARAMS_MOST, TRIES_PER_DAY, TRIES_PER_HOUR, WRAPPER_MOST, isUnlocked, listWays, lock, paramsOf, startWays, tidyUnlocked, tryUnlock, unlockMaker, wayTables } from "../src/server/ways";
import { packPush, unpackPulled, unpackPushed } from "../src/server/wire";
import { sqlite } from "./sqlremote";

const A = "uaaaaaa1";
const T0 = Date.UTC(2026, 10, 26, 20, 0, 0);
const [MINUTE, HOUR, DAY] = [60_000, 3_600_000, 86_400_000];
const cfg: Config = configOf({ ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A })!;
const json = (value: unknown): Uint8Array => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const why = (answer: Answer): [number, unknown] => [answer.status, answer.json?.why];

type Way = { wrapper: Record<string, unknown>; params: Record<string, unknown>; proof: string };
const way = (vault: string, kind: string, more: Partial<Way["wrapper"]> = {}): Way => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA", ...more }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: newToken() });
const pair = (vault: string): [Way, Way] => [way(vault, "passphrase"), way(vault, "recovery")];
/** A way in as `startWays` takes it: with the proof's hash in the proof's place. */
const hashed = async (ways: Way[]): Promise<{ wrapper: unknown; params: unknown; verifier: string }[]> => Promise.all(ways.map(async (w) => ({ wrapper: w.wrapper, params: w.params, verifier: (await hashOf(w.proof))! })));

/** A database with one device signed in, as after the first sign-in. */
async function device(db: Db, now: number): Promise<{ hash: string; session: string }> {
  const hash = (await hashOf(newToken()))!;
  const session = newId();
  assert.equal(signIn(db, { account: A, session, hash, label: "Chrome on Windows", owner: false }, now, cfg.gate), "ok");
  return { hash, session };
}
/** A request, with the proofs in its body hashed first, as the object does it. */
async function ask(db: Db, hash: string, action: string, now: number, body: unknown = {}): Promise<Answer> {
  const bytes = body instanceof Uint8Array ? body : json(body);
  const proofs = await proofsIn(action, bytes);
  return proofs ? act(db, { account: A, hash, action, body: bytes, proofs }, now, cfg) : { status: 400, json: { ok: false, why: "bad-request" } };
}
const kinds = async (db: Db, hash: string, now: number): Promise<string[]> => ((await ask(db, hash, "events", now)).json!.events as { kind: string }[]).map((e) => e.kind);

test("a vault's ways in are kept as they came, one by passphrase and one by recovery code, or not at all", async () => {
  const db = sqlite();
  wayTables(db);
  const vault = newId();
  const good = await hashed(pair(vault));
  const refused: [string, unknown][] = [
    ["no ways", []],
    ["one way", [good[0]]],
    ["three ways", [...good, ...(await hashed([way(vault, "passphrase")]))]],
    ["two by passphrase", await hashed([way(vault, "passphrase"), way(vault, "passphrase")])],
    ["two by recovery code", await hashed([way(vault, "recovery"), way(vault, "recovery")])],
    ["a kind there is none of yet", await hashed([way(vault, "passphrase"), way(vault, "passkey")])],
    ["a wrapper for another vault", await hashed([way(vault, "passphrase"), way(newId(), "recovery")])],
    ["a wrapper with no id", await hashed([way(vault, "passphrase"), way(vault, "recovery", { id: "short" })])],
    ["the same id twice", await hashed(((id) => [way(vault, "passphrase", { id }), way(vault, "recovery", { id })])(newId()))],
    ["parameters of another kind", [good[0], { ...good[1]!, params: { v: 1, kind: "passphrase", salt: "x" } }]],
    ["a wrapper that is no object", [good[0], { ...good[1]!, wrapper: "text" }]],
    ["a wrapper that is a list", [good[0], { ...good[1]!, wrapper: [1] }]],
    ["parameters that are none", [good[0], { ...good[1]!, params: null }]],
    ["a proof's hash that is none", [good[0], { ...good[1]!, verifier: "nope" }]],
    ["no proof's hash", [good[0], { wrapper: good[1]!.wrapper, params: good[1]!.params }]],
    ["a wrapper too long to be one", await hashed([way(vault, "passphrase"), way(vault, "recovery", { pad: "x".repeat(WRAPPER_MOST) })])],
    ["parameters too long to be any", [good[0], { ...good[1]!, params: { v: 1, kind: "recovery", pad: "x".repeat(PARAMS_MOST) } }]],
    ["ways that are no list", { 0: good[0], 1: good[1], length: 2 }],
    ["a way that is nothing", [good[0], null]],
  ];
  for (const [what, ways] of refused) {
    assert.equal(startWays(db, vault, ways, T0), false, what);
    assert.deepEqual(listWays(db), [], what);
  }
  assert.equal(startWays(db, "short", good, T0), false);
  for (const when of [-1, 1.5, NaN]) assert.equal(startWays(db, vault, good, when), false);
  assert.deepEqual(listWays(db), []);
  // as long as one may be, and no longer
  const longest = (kind: string): Way => {
    const w = way(vault, kind, { pad: "" });
    w.wrapper.pad = "x".repeat(WRAPPER_MOST - JSON.stringify(w.wrapper).length);
    return w;
  };
  assert.equal(JSON.stringify(longest("recovery").wrapper).length, WRAPPER_MOST);

  assert.equal(startWays(db, vault, good, T0), true);
  assert.deepEqual(
    listWays(db).map((w) => [w.kind, w.made]),
    [
      ["passphrase", T0],
      ["recovery", T0],
    ].sort((a, b) => (listWays(db)[0]!.kind === a[0] ? -1 : 1)),
  );
  assert.deepEqual(new Set(listWays(db).map((w) => w.id)), new Set(good.map((w) => (w.wrapper as { id: string }).id)));
  // a vault that has its ways in keeps them, whoever asks, and with whatever
  assert.equal(startWays(db, vault, await hashed(pair(vault)), T0 + 1), false);
  assert.equal(startWays(db, vault, good, T0 + 1), false);
  assert.equal(listWays(db).length, 2);
  // the two kinds are the two a vault is started with
  assert.deepEqual([...KINDS], ["passphrase", "recovery"]);
  // what was kept is what came, to the character
  const kept = db.raw.prepare(`SELECT id, wrapper, params, verifier FROM ways`).all() as { id: string; wrapper: string; params: string; verifier: string }[];
  for (const w of good) {
    const row = kept.find((k) => k.id === (w.wrapper as { id: string }).id)!;
    assert.deepEqual([JSON.parse(row.wrapper), JSON.parse(row.params), row.verifier], [w.wrapper, w.params, w.verifier]);
  }
  // and one as long as a wrapper may be is kept too
  const roomy = sqlite();
  wayTables(roomy);
  assert.equal(startWays(roomy, vault, await hashed([longest("passphrase"), longest("recovery")]), T0), true);
});

test("a proof's parameters are for any session that asks; the wrapper is for the one that shows the proof", async () => {
  const db = sqlite();
  const maker = await device(db, T0);
  const vault = newId();
  const [byPassphrase, byRecovery] = pair(vault);
  assert.deepEqual(why(await ask(db, maker.hash, "vault/way", T0, { kind: "passphrase" })), [404, "no-way"]);
  assert.deepEqual(await ask(db, maker.hash, "vault/start", T0, { vault, ways: [byPassphrase, byRecovery] }), { status: 200, json: { ok: true, vault } });
  // the session that made the vault holds its key, and is unlocked; what it sees of the ways in opens nothing
  const seen = (await ask(db, maker.hash, "vault", T0 + 1)).json!;
  assert.equal(seen.unlocked, true);
  assert.deepEqual(
    new Set((seen.ways as { id: string; kind: string; made: number }[]).map((w) => `${w.id} ${w.kind} ${w.made}`)),
    new Set([`${byPassphrase.wrapper.id} passphrase ${T0}`, `${byRecovery.wrapper.id} recovery ${T0}`]),
  );
  assert.equal(JSON.stringify(seen).includes("d3JhcHBlZA"), false);

  // another device: signed in, and not unlocked
  const laptop = await device(db, T0 + MINUTE);
  const now = T0 + 2 * MINUTE;
  assert.equal((await ask(db, laptop.hash, "vault", now)).json!.unlocked, false);
  // the parameters, by kind or by id, and nothing of the wrapper or the proof with them
  for (const [asked, w] of [
    [{ kind: "passphrase" }, byPassphrase],
    [{ kind: "recovery" }, byRecovery],
    [{ id: byPassphrase.wrapper.id }, byPassphrase],
    [{ id: byRecovery.wrapper.id, kind: "passphrase" }, byRecovery],
  ] as const)
    assert.deepEqual(await ask(db, laptop.hash, "vault/way", now, asked), { status: 200, json: { ok: true, id: w.wrapper.id, kind: w.wrapper.kind, params: w.params } });
  for (const asked of [{}, { kind: "passkey" }, { id: newId() }, { id: 5 }, { kind: ["passphrase"] }]) assert.deepEqual(why(await ask(db, laptop.hash, "vault/way", now, asked)), [404, "no-way"], JSON.stringify(asked));
  assert.deepEqual(why(await ask(db, laptop.hash, "vault/way", now, "[]")), [404, "no-way"]);

  // a wrong proof: no wrapper, counted, noted, and still locked
  const wrong = await ask(db, laptop.hash, "vault/unlock", now, { id: byPassphrase.wrapper.id, proof: newToken() });
  assert.deepEqual(wrong, { status: 422, json: { ok: false, why: "wrong-secret", left: TRIES_PER_HOUR - 1 } });
  // the other way in's proof is not this one's
  assert.deepEqual(why(await ask(db, laptop.hash, "vault/unlock", now, { id: byPassphrase.wrapper.id, proof: byRecovery.proof })), [422, "wrong-secret"]);
  assert.equal((await ask(db, laptop.hash, "vault", now)).json!.unlocked, false);
  // what is no proof at all goes no further, and a way in that is not there is not a guess
  for (const body of [{ id: byPassphrase.wrapper.id }, { id: byPassphrase.wrapper.id, proof: "short" }, { id: byPassphrase.wrapper.id, proof: 5 }, "{}", "", "[]"]) assert.deepEqual(why(await ask(db, laptop.hash, "vault/unlock", now, body)), [400, "bad-request"], JSON.stringify(body));
  for (const id of [newId(), "short", 7, undefined]) assert.deepEqual(why(await ask(db, laptop.hash, "vault/unlock", now, { id, proof: byPassphrase.proof })), [404, "no-way"]);
  assert.deepEqual((await ask(db, laptop.hash, "vault/unlock", now, { id: byPassphrase.wrapper.id, proof: newToken() })).json, { ok: false, why: "wrong-secret", left: TRIES_PER_HOUR - 3 });

  // the right proof: the wrapper as it was handed over, and the session is unlocked
  const right = await ask(db, laptop.hash, "vault/unlock", now + 1, { id: byPassphrase.wrapper.id, proof: byPassphrase.proof });
  assert.deepEqual(right, { status: 200, json: { ok: true, wrapper: byPassphrase.wrapper } });
  assert.equal((await ask(db, laptop.hash, "vault", now + 2)).json!.unlocked, true);
  // by recovery code just the same, and its wrapper is its own
  const phone = await device(db, now + 3);
  assert.deepEqual(await ask(db, phone.hash, "vault/unlock", now + 4, { id: byRecovery.wrapper.id, proof: byRecovery.proof }), { status: 200, json: { ok: true, wrapper: byRecovery.wrapper } });
  // the log: each wrong proof and each unlocking, newest first; the vault's making; the sign-ins
  assert.deepEqual(await kinds(db, laptop.hash, now + 5), ["unlocked", "sign-in", "unlocked", "unlock-failed", "unlock-failed", "unlock-failed", "sign-in", "vault-started", "sign-in"]);
});

test("sync is for a session that has unlocked, and locking, signing out and being signed out all end that", async () => {
  const db = sqlite();
  const maker = await device(db, T0);
  const vault = newId();
  const [byPassphrase, byRecovery] = pair(vault);
  const push = (hash: string, now: number): Promise<Answer> => ask(db, hash, "sync/push", now, packPush(vault, [{ id: newId(), base: 0, blob: new Uint8Array(64).fill(7) }]));
  const pull = (hash: string, now: number): Promise<Answer> => ask(db, hash, "sync/pull", now, { vault, since: 0 });
  const locked = async (hash: string, now: number): Promise<void> => {
    assert.deepEqual(why(await push(hash, now)), [423, "locked"]);
    assert.deepEqual(why(await pull(hash, now)), [423, "locked"]);
  };
  const open = async (hash: string, now: number): Promise<void> => {
    assert.equal(unpackPushed((await push(hash, now)).bytes!)?.ok, true);
    assert.equal(unpackPulled((await pull(hash, now)).bytes!)?.ok, true);
  };
  // before there is a vault, nobody is unlocked; its maker is, from the moment it is made
  await locked(maker.hash, T0);
  assert.equal((await ask(db, maker.hash, "vault/start", T0, { vault, ways: [byPassphrase, byRecovery] })).status, 200);
  await open(maker.hash, T0 + 1);
  // another session is not, until it shows a proof; a body that is nonsense is "locked" to it all the same
  const laptop = await device(db, T0 + 2);
  await locked(laptop.hash, T0 + 3);
  assert.deepEqual(why(await ask(db, laptop.hash, "sync/pull", T0 + 3, "nonsense")), [423, "locked"]);
  assert.deepEqual(why(await ask(db, laptop.hash, "sync/push", T0 + 3, new Uint8Array(3))), [423, "locked"]);
  // asking to start the vault that is already there is answered as before, and unlocks nobody
  assert.deepEqual(await ask(db, laptop.hash, "vault/start", T0 + 3, { vault, ways: pair(vault) }), { status: 200, json: { ok: true, vault } });
  await locked(laptop.hash, T0 + 3);
  assert.deepEqual(why(await ask(db, laptop.hash, "vault/unlock", T0 + 3, { id: byPassphrase.wrapper.id, proof: pair(vault)[0].proof })), [422, "wrong-secret"]);
  assert.equal((await ask(db, laptop.hash, "vault/unlock", T0 + 4, { id: byPassphrase.wrapper.id, proof: byPassphrase.proof })).status, 200);
  await open(laptop.hash, T0 + 5);
  // unlocking is the session's own: the maker's did nothing for the laptop, and the laptop locking does nothing to the maker
  assert.deepEqual(await ask(db, laptop.hash, "vault/lock", T0 + 6), { status: 200, json: { ok: true } });
  await locked(laptop.hash, T0 + 7);
  await open(maker.hash, T0 + 7);
  assert.deepEqual(await ask(db, laptop.hash, "vault/lock", T0 + 7), { status: 200, json: { ok: true } });
  // unlocked again, then ended from the other device: a session that is gone is not unlocked, and its row goes with it
  assert.equal((await ask(db, laptop.hash, "vault/unlock", T0 + 8, { id: byRecovery.wrapper.id, proof: byRecovery.proof })).status, 200);
  assert.equal(isUnlocked(db, laptop.session), true);
  assert.equal((await ask(db, maker.hash, "sessions/end", T0 + 9, { id: laptop.session })).status, 200);
  assert.equal(isUnlocked(db, laptop.session), false);
  // signing out everywhere else, and signing out here
  const [phone, tablet] = [await device(db, T0 + 10), await device(db, T0 + 11)];
  for (const d of [phone, tablet]) assert.equal((await ask(db, d.hash, "vault/unlock", T0 + 12, { id: byPassphrase.wrapper.id, proof: byPassphrase.proof })).status, 200);
  assert.equal((await ask(db, phone.hash, "sessions/end", T0 + 13, { others: true })).json!.ended, 2);
  assert.deepEqual([isUnlocked(db, phone.session), isUnlocked(db, tablet.session), isUnlocked(db, maker.session)], [true, false, false]);
  assert.equal((await ask(db, phone.hash, "session/end", T0 + 14)).status, 200);
  assert.equal(isUnlocked(db, phone.session), false);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM unlocked`).all().length, 1);
  assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM unlocked`).all()[0] as { n: number }).n, 0);
  // the address changed: everyone signs in again, and unlocks again
  const [one, two] = [await device(db, T0 + 20), await device(db, T0 + 21)];
  for (const d of [one, two]) assert.equal((await ask(db, d.hash, "vault/unlock", T0 + 22, { id: byPassphrase.wrapper.id, proof: byPassphrase.proof })).status, 200);
  signEveryoneOut(db, T0 + 23);
  assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM unlocked`).all()[0] as { n: number }).n, 0);
  const back = await device(db, T0 + 24);
  await locked(back.hash, T0 + 25);
  // the ways in are still there, and the chunks: only the sessions went
  assert.equal(((await ask(db, back.hash, "vault", T0 + 25)).json!.ways as unknown[]).length, 2);
});

test("wrong proofs are counted for the account: ten in an hour, thirty in a day, and then the right one waits too", async () => {
  const db = sqlite();
  const maker = await device(db, T0);
  const vault = newId();
  const [byPassphrase, byRecovery] = pair(vault);
  assert.equal((await ask(db, maker.hash, "vault/start", T0, { vault, ways: [byPassphrase, byRecovery] })).status, 200);
  assert.deepEqual([TRIES_PER_HOUR, TRIES_PER_DAY], [10, 30]);
  // (a session lasts thirty quiet minutes, so over a day the guesses come from one device after another)
  let last: { hash: string; session: string; at: number } | null = null;
  const sessionAt = async (now: number): Promise<{ hash: string; session: string }> => {
    if (!last || now - last.at > 20 * MINUTE || now < last.at) last = { ...(await device(db, now - 1)), at: now - 1 };
    return last;
  };
  const guess = async (now: number, w: Way = byPassphrase, proof = newToken()): Promise<Answer> => ask(db, (await sessionAt(now)).hash, "vault/unlock", now, { id: w.wrapper.id, proof });

  // ten wrong, from two sessions and by both ways in: one count
  const [a, b] = [await device(db, T0 + 1), await device(db, T0 + 2)];
  const start = T0 + MINUTE;
  for (let i = 0; i < 10; i++) {
    const answer = await ask(db, i % 2 ? a.hash : b.hash, "vault/unlock", start + i * MINUTE, { id: (i % 3 ? byPassphrase : byRecovery).wrapper.id, proof: newToken() });
    assert.deepEqual(answer.json, { ok: false, why: "wrong-secret", left: 9 - i }, `guess ${i + 1}`);
  }
  // the eleventh is not looked at, right or wrong, and is told how long: until the first of the ten is an hour old
  const at = start + 9 * MINUTE + 5;
  const eleventh = (proof: string): Promise<Answer> => ask(db, a.hash, "vault/unlock", at, { id: byPassphrase.wrapper.id, proof });
  assert.deepEqual(await eleventh(newToken()), { status: 429, json: { ok: false, why: "too-many", again: start + HOUR - at } });
  assert.deepEqual(await eleventh(byPassphrase.proof), { status: 429, json: { ok: false, why: "too-many", again: start + HOUR - at } });
  assert.equal(isUnlocked(db, a.session), false);
  // a way in that is not there is still just not there, and what is turned away is neither counted nor noted
  assert.deepEqual(why(await ask(db, a.hash, "vault/unlock", at, { id: newId(), proof: newToken() })), [404, "no-way"]);
  assert.equal((await kinds(db, a.hash, at)).filter((k) => k === "unlock-failed").length, 10);
  assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM tries`).all()[0] as { n: number }).n, 10);
  // one millisecond before the hour is up, still; at the hour, one more may be shown, and the right one opens
  assert.equal((await guess(start + HOUR - 1, byPassphrase, byPassphrase.proof)).status, 429);
  assert.equal((await guess(start + HOUR, byPassphrase, byPassphrase.proof)).status, 200);
  assert.equal(isUnlocked(db, last!.session), true);
  // a right proof is not a try: it can be shown again and again
  for (let i = 0; i < 12; i++) assert.equal((await guess(start + HOUR + 1 + i, byRecovery, byRecovery.proof)).status, 200);

  // thirty in a day: ten more two hours on, ten more two hours after that, and then the day's count is full
  let n = 10;
  for (const hour of [2, 4]) {
    for (let i = 0; i < 10; i++) {
      const answer = await guess(start + hour * HOUR + i * MINUTE);
      n++;
      assert.deepEqual(answer.json, { ok: false, why: "wrong-secret", left: Math.min(9 - i, 30 - n) }, `guess ${n}`);
    }
  }
  // when both counts are full, the longer wait is the one told
  const full = start + 4 * HOUR + 9 * MINUTE + 1;
  assert.deepEqual((await guess(full)).json, { ok: false, why: "too-many", again: start + DAY - full });
  // and when the hour's has room again, the day's still has none
  const later = start + 6 * HOUR;
  assert.deepEqual(await guess(later, byPassphrase, byPassphrase.proof), { status: 429, json: { ok: false, why: "too-many", again: start + DAY - later } });
  // a day after the first wrong proof there is room for one, and after that one, none again until the second is a day old
  assert.equal((await guess(start + DAY - 1, byPassphrase, byPassphrase.proof)).status, 429);
  assert.deepEqual((await guess(start + DAY)).json, { ok: false, why: "wrong-secret", left: 0 });
  assert.deepEqual((await guess(start + DAY + 1)).json, { ok: false, why: "too-many", again: MINUTE - 1 });
  assert.equal((await guess(start + DAY + MINUTE, byPassphrase, byPassphrase.proof)).status, 200);
  // tries more than a day old are forgotten: the table does not grow without end
  assert.ok((db.raw.prepare(`SELECT COUNT(*) AS n FROM tries`).all()[0] as { n: number }).n <= TRIES_PER_DAY);

  // the hour is the last sixty minutes, whenever they began: nine of ten tries still count one hour after the first
  const edge = sqlite();
  const e = await device(edge, T0);
  const ev = newId();
  const [ep, er] = pair(ev);
  assert.equal((await ask(edge, e.hash, "vault/start", T0, { vault: ev, ways: [ep, er] })).status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await ask(edge, e.hash, "vault/unlock", T0 + i * MINUTE, { id: ep.wrapper.id, proof: newToken() })).status, 422);
  const e2 = await device(edge, T0 + HOUR - 1);
  assert.deepEqual((await ask(edge, e2.hash, "vault/unlock", T0 + HOUR, { id: ep.wrapper.id, proof: newToken() })).json, { ok: false, why: "wrong-secret", left: 0 });
  assert.deepEqual((await ask(edge, e2.hash, "vault/unlock", T0 + HOUR + 1, { id: ep.wrapper.id, proof: ep.proof })).json, { ok: false, why: "too-many", again: MINUTE - 1 });

  // a clock that goes back does not give the tries back
  const other = sqlite();
  const m = await device(other, T0);
  const v = newId();
  const [p, r] = pair(v);
  assert.equal((await ask(other, m.hash, "vault/start", T0, { vault: v, ways: [p, r] })).status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await ask(other, m.hash, "vault/unlock", T0 + 10 * MINUTE + i, { id: p.wrapper.id, proof: newToken() })).status, 422);
  const early = await device(other, T0 + 5 * MINUTE);
  assert.equal((await ask(other, early.hash, "vault/unlock", T0 + 6 * MINUTE, { id: p.wrapper.id, proof: p.proof })).status, 429);
});

test("the functions themselves: who is unlocked, and what is no session or no time", async () => {
  const db = sqlite();
  const d = await device(db, T0);
  const vault = newId();
  const ways = pair(vault);
  assert.equal(startWays(db, vault, await hashed(ways), T0), true);
  const verifier = (await hashOf(ways[0].proof))!;
  const id = ways[0].wrapper.id;
  assert.equal(isUnlocked(db, d.session), false);
  assert.deepEqual(tryUnlock(db, id, verifier, d.session, T0), { ok: true, wrapper: ways[0].wrapper });
  assert.equal(isUnlocked(db, d.session), true);
  // again: still one row
  assert.equal(tryUnlock(db, id, verifier, d.session, T0 + 1).ok, true);
  assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM unlocked`).all()[0] as { n: number }).n, 1);
  // a hash that is none is a wrong proof, and counted as one
  for (const odd of ["", "nope", 5, null, undefined, `${verifier}x`]) assert.equal((tryUnlock(db, id, odd, d.session, T0 + 2) as { why: string }).why, "wrong-secret");
  assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM tries`).all()[0] as { n: number }).n, 6);
  // one character off is wrong
  const off = verifier.slice(0, -1) + (verifier.endsWith("A") ? "B" : "A");
  assert.deepEqual(tryUnlock(db, id, off, d.session, T0 + 3), { ok: false, why: "wrong-secret", left: 3 });
  // what is no session, or no time, is an error and not an answer
  for (const session of ["", "short", 5 as unknown as string]) assert.throws(() => tryUnlock(db, id, verifier, session, T0), /unlock/);
  for (const when of [-1, 1.5, NaN]) assert.throws(() => tryUnlock(db, id, verifier, d.session, when), /unlock/);
  assert.throws(() => unlockMaker(db, "short", T0), /unlock/);
  assert.throws(() => unlockMaker(db, d.session, -1), /unlock/);
  // locking, and tidying after sessions that are gone
  lock(db, d.session);
  lock(db, 5);
  assert.equal(isUnlocked(db, d.session), false);
  const gone = newId();
  unlockMaker(db, gone, T0);
  unlockMaker(db, d.session, T0);
  tidyUnlocked(db);
  assert.deepEqual([isUnlocked(db, gone), isUnlocked(db, d.session)], [false, true]);
  // parameters by kind give the one of that kind, and what is stored as nonsense is an error
  assert.equal(paramsOf(db, { kind: "recovery" })?.id, ways[1].wrapper.id);
  assert.equal(paramsOf(db, null as never), null);
  db.raw.prepare(`UPDATE ways SET params = 'not json' WHERE kind = 'recovery'`).all();
  assert.throws(() => paramsOf(db, { kind: "recovery" }));
  db.raw.prepare(`UPDATE ways SET verifier = 'x' WHERE id = ?`).all(String(id));
  assert.deepEqual(tryUnlock(db, id, verifier, d.session, T0 + 4), { ok: false, why: "no-way" });
});

test("the proofs in a body are hashed before anything is asked of the database, and only for the two requests that carry any", async () => {
  const proof = newToken();
  assert.deepEqual(await proofsIn("vault/unlock", json({ id: newId(), proof })), [(await hashOf(proof))!]);
  const two = [newToken(), newToken()];
  assert.deepEqual(await proofsIn("vault/start", json({ vault: newId(), ways: two.map((p) => ({ proof: p })) })), [(await hashOf(two[0]))!, (await hashOf(two[1]))!]);
  // none, or one that is none: nothing to go by
  for (const body of [{}, { proof: "short" }, { proof: 5 }, { proof: null }, "", "nope", "[]"]) assert.equal(await proofsIn("vault/unlock", json(body)), null, JSON.stringify(body));
  for (const body of [{}, { ways: "x" }, { ways: [{ proof: two[0] }, {}] }, { ways: [{ proof: two[0] }, null] }, { ways: Array.from({ length: 9 }, () => ({ proof })) }]) assert.equal(await proofsIn("vault/start", json(body)), null, JSON.stringify(body));
  assert.deepEqual(await proofsIn("vault/start", json({ ways: [] })), []);
  // every other request carries none, whatever its body says
  for (const action of ["vault", "vault/way", "vault/lock", "sync/pull", "sync/push", "sessions", "events", "session/end", "nothing"]) assert.deepEqual(await proofsIn(action, json({ proof })), []);
});
