/**
 * The devices that are signed in and what has happened, as the app reads them (src/app/devices.ts):
 * first against the server's own code (account.ts, on Node's SQLite), so that what the one sends
 * is what the other takes; then against answers that are not what they should be, each of which
 * has to come out as trouble and never as a shorter list.
 *
 * The ways in here open nothing: the server does not look inside them (tests/ways.test.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { KINDS, deviceOf, endDevice, endOthers, listing, outcomeOf, partsOf, restOf, wrongOf, type Device, type Line, type Listing } from "../src/app/devices";
import type { Ask } from "../src/app/door";
import { newId } from "../src/core/ids";
import { act, proofsIn, signIn } from "../src/server/account";
import { configOf } from "../src/server/gate";
import { labelOf } from "../src/server/request";
import { hashOf, newToken } from "../src/server/sessions";
import { sqlite } from "./sqlremote";

const A = "uaaaaaa1";
const T0 = Date.UTC(2026, 10, 27, 22, 0, 0);
const cfg = configOf({ ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A })!;

/** One person's database, and devices that ask it the way a browser does: through JSON, with the proofs hashed first. */
function server() {
  const db = sqlite();
  let now = T0;
  const asked: [string, unknown][] = [];
  const device = async (label = "Chrome on Windows"): Promise<{ ask: Ask; id: string }> => {
    const hash = (await hashOf(newToken()))!;
    const id = newId();
    assert.equal(signIn(db, { account: A, session: id, hash, label, owner: false }, now++, cfg.gate), "ok");
    const ask: Ask = async (action, body = {}) => {
      asked.push([action, body]);
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const proofs = await proofsIn(action, bytes);
      const answer = proofs ? act(db, { account: A, hash, action, body: bytes, proofs }, now++, cfg) : { status: 400, json: { ok: false, why: "bad-request" } };
      return { status: answer.status, json: JSON.parse(JSON.stringify(answer.json ?? {})) as Record<string, unknown> };
    };
    return { ask, id };
  };
  return { db, device, asked, later: (ms: number) => (now += ms) };
}
const way = (vault: string, kind: string) => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA" }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: newToken() });

const canned =
  (answers: Record<string, { status: number; json?: Record<string, unknown> } | null>, asked: [string, unknown][] = []): Ask =>
  async (action, body = {}) => {
    asked.push([action, body]);
    const answer = answers[action];
    return answer === undefined ? { status: 404, json: { ok: false, why: "no-such-thing" } } : answer && { status: answer.status, json: answer.json ?? {} };
  };
const ID = [newId(), newId(), newId()] as const;
const device = (more: Partial<Record<keyof Device, unknown>> = {}): Record<string, unknown> => ({ id: ID[0], label: "Chrome on Windows", made: T0, seen: T0 + 5, here: true, unlocked: false, ...more });
const line = (more: Partial<Record<keyof Line, unknown>> = {}): Record<string, unknown> => ({ at: T0, kind: "sign-in", here: true, session: ID[0], ...more });
/** A server whose two answers are as they should be, but for what is named (named and undefined is "sent without it"). */
const good = (over: { sessions?: unknown; events?: unknown; wrong?: unknown } = {}): Ask =>
  canned({
    sessions: { status: 200, json: { ok: true, sessions: "sessions" in over ? over.sessions : [device()] } },
    events: { status: 200, json: { ok: true, events: "events" in over ? over.events : [line()], wrong: "wrong" in over ? over.wrong : 0 } },
  });

test("against the server's own code: who is signed in, who holds the vault open, what happened, and a wrong try at the passphrase", async () => {
  const { device: signInOn, asked } = server();
  const mine = await signInOn("Safari on iPhone");
  const theirs = await signInOn("Chrome on Windows");
  // two devices, the one seen last first; neither holds anything open, for there is no vault
  const first = await listing(mine.ask);
  assert.ok(first.ok);
  assert.deepEqual(
    first.devices.map((one) => [one.id, one.label, one.here, one.unlocked]),
    [
      [theirs.id, "Chrome on Windows", false, false],
      [mine.id, "Safari on iPhone", true, false],
    ],
  );
  assert.deepEqual(first.lines.map((one) => [one.kind, one.here, one.session]), [["sign-in", false, theirs.id], ["sign-in", true, mine.id]]);
  assert.equal(first.wrong, 0);
  // (both were asked for, with nothing in the asking, and nothing else was)
  assert.deepEqual(asked.splice(0).sort(), [["events", {}], ["sessions", {}]]);

  // this device makes a vault: it holds it open, and the list says so
  const vault = newId();
  const [byPassphrase, byRecovery] = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await mine.ask("vault/start", { vault, ways: [byPassphrase, byRecovery] }))!.status, 200);
  // the other one guesses at the passphrase, and misses
  assert.equal((await theirs.ask("vault/unlock", { id: byPassphrase.wrapper.id, proof: newToken() }))!.status, 422);
  const second = await listing(mine.ask);
  assert.ok(second.ok);
  assert.deepEqual(Object.fromEntries(second.devices.map((one) => [one.id, one.unlocked])), { [mine.id]: true, [theirs.id]: false });
  assert.equal(second.wrong, 1);
  // the miss stands apart from everything else, and is known to be that device's
  assert.deepEqual(wrongOf(second.lines).map((one) => [one.kind, one.session]), [["unlock-failed", theirs.id]]);
  assert.deepEqual(restOf(second.lines).map((one) => one.kind), ["vault-started", "sign-in", "sign-in"]);
  assert.deepEqual(deviceOf(wrongOf(second.lines)[0]!, second.devices), { at: "listed", label: "Chrome on Windows" });
  assert.deepEqual(deviceOf(restOf(second.lines)[0]!, second.devices), { at: "here" });

  // that device is signed out from this one. Once more, and it is already gone, which is what was wanted.
  asked.length = 0;
  assert.equal(await endDevice(mine.ask, theirs.id), "ok");
  assert.deepEqual(asked, [["sessions/end", { id: theirs.id }]]);
  assert.equal(await endDevice(mine.ask, theirs.id), "gone");
  assert.equal(await endDevice(mine.ask, newId()), "gone");
  // it can ask nothing any more
  assert.deepEqual(await listing(theirs.ask), { ok: false, why: "signed-out" });
  assert.deepEqual(await endDevice(theirs.ask, mine.id), "signed-out");
  assert.deepEqual(await endOthers(theirs.ask), { ok: false, why: "signed-out" });
  const third = await listing(mine.ask);
  assert.ok(third.ok);
  assert.deepEqual(third.devices.map((one) => [one.id, one.here, one.unlocked]), [[mine.id, true, true]]);
  // its wrong try is still shown, now as a device that has since signed out
  assert.deepEqual(deviceOf(wrongOf(third.lines)[0]!, third.devices), { at: "gone" });
  assert.deepEqual(restOf(third.lines).slice(0, 2).map((one) => [one.kind, one.here]), [["session-ended", true], ["vault-started", true]]);

  // all the others at once: none, and then two
  asked.length = 0;
  assert.deepEqual(await endOthers(mine.ask), { ok: true, ended: 0 });
  assert.deepEqual(asked, [["sessions/end", { others: true }]]);
  await signInOn();
  await signInOn();
  assert.deepEqual(await endOthers(mine.ask), { ok: true, ended: 2 });
  const last = await listing(mine.ask);
  assert.ok(last.ok);
  assert.deepEqual(last.devices.map((one) => one.id), [mine.id]);
  // every kind of line the server writes is one this code knows
  const written = new Set((last.lines as Line[]).map((one) => one.kind));
  assert.ok(!written.has("other"));
  for (const kind of written) assert.ok((KINDS as readonly string[]).includes(kind), kind);
});

test("no answer, not signed in, told to slow down, a server in trouble: each is said as what it is, whichever of the two requests it happened to", async () => {
  const ok = { sessions: { status: 200, json: { ok: true, sessions: [device()] } }, events: { status: 200, json: { ok: true, events: [line()], wrong: 0 } } };
  assert.deepEqual(await listing(canned(ok)), { ok: true, devices: [device()], lines: [line()], wrong: 0 });
  for (const which of ["sessions", "events"] as const) {
    for (const [answer, why] of [
      [null, "offline"],
      [{ status: 401, json: { ok: false, why: "signed-out" } }, "signed-out"],
      [{ status: 403, json: { ok: false, why: "not-admitted" } }, "signed-out"],
      [{ status: 403, json: { ok: false, why: "closed" } }, "signed-out"],
      [{ status: 429, json: { ok: false, why: "slow-down" } }, "busy"],
      [{ status: 500, json: {} }, "server"],
      [{ status: 404, json: { ok: false, why: "no-such-thing" } }, "server"],
      // (said to be fine, and not saying so)
      [{ status: 200, json: { ...ok[which].json, ok: false } }, "server"],
      [{ status: 200, json: {} }, "server"],
      [{ status: 201, json: ok[which].json }, "server"],
    ] as const)
      assert.deepEqual(await listing(canned({ ...ok, [which]: answer })), { ok: false, why }, `${which} ${JSON.stringify(answer)}`);
  }
});

test("a list this code only half understands is trouble, never a shorter list", async () => {
  const server = { ok: false, why: "server" };
  // the devices
  for (const sessions of [
    undefined,
    null,
    "none",
    {},
    [],
    [null],
    ["device"],
    [device({ id: undefined })],
    [device({ id: "short" })],
    [device({ id: 7 })],
    [device({ label: undefined })],
    [device({ label: 7 })],
    [device({ label: "x".repeat(121) })],
    [device({ made: "today" })],
    [device({ made: -1 })],
    [device({ made: 1.5 })],
    [device({ seen: null })],
    [device({ seen: Number.MAX_SAFE_INTEGER + 2 })],
    [device({ here: "yes" })],
    [device({ here: undefined })],
    [device({ unlocked: undefined })],
    [device({ unlocked: 1 })],
    // one good device and one that is not: not "one device"
    [device(), null],
    [device(), device({ id: ID[1], here: false, unlocked: "no" })],
    // this device is in its own list, once
    [device({ here: false })],
    [device(), device({ id: ID[1] })],
    // no device twice
    [device(), device({ here: false })],
    // more than the server ever keeps
    Array.from({ length: 17 }, (_, i) => device({ id: newId(), here: i === 0 })),
  ])
    assert.deepEqual(await listing(good({ sessions })), server, JSON.stringify(sessions)?.slice(0, 80));
  // (sixteen are taken: twice what the server keeps)
  assert.equal((await listing(good({ sessions: Array.from({ length: 16 }, (_, i) => device({ id: newId(), here: i === 0 })) }))).ok, true);
  // the lines
  for (const events of [
    undefined,
    null,
    {},
    "none",
    [null],
    [line({ at: undefined })],
    [line({ at: "now" })],
    [line({ at: -5 })],
    [line({ kind: undefined })],
    [line({ kind: 7 })],
    [line({ here: undefined })],
    [line({ here: 1 })],
    [line({ session: undefined })],
    [line({ session: "someone" })],
    [line({ session: 7 })],
    [line(), "line"],
    Array.from({ length: 201 }, () => line()),
  ])
    assert.deepEqual(await listing(good({ events })), server, JSON.stringify(events)?.slice(0, 80));
  assert.equal((await listing(good({ events: Array.from({ length: 200 }, () => line()) }))).ok, true);
  // no lines at all is a list with nothing in it
  assert.deepEqual(await listing(good({ events: [] })), { ok: true, devices: [device()], lines: [], wrong: 0 });
  // how many wrong tries there were
  for (const wrong of [undefined, null, "3", -1, 1.5, Number.NaN, true]) assert.deepEqual(await listing(good({ wrong })), server, String(wrong));
  assert.deepEqual(await listing(good({ wrong: 30 })), { ok: true, devices: [device()], lines: [line()], wrong: 30 });
});

test("a line of a kind this version does not know is shown as something else, not dropped; and a line about no device says so", async () => {
  const got = await listing(good({ sessions: [device(), device({ id: ID[1], here: false, label: "Firefox on Linux" })], events: [line({ kind: "vault-erased", here: false, session: ID[1] }), line({ kind: "email-changed", here: false, session: null }), line({ kind: "unlock-failed", here: false, session: ID[2] }), line()], wrong: 1 }));
  assert.ok(got.ok);
  assert.deepEqual(got.lines.map((one) => one.kind), ["other", "email-changed", "unlock-failed", "sign-in"]);
  assert.deepEqual(got.lines.map((one) => deviceOf(one, got.devices)), [{ at: "listed", label: "Firefox on Linux" }, { at: "none" }, { at: "gone" }, { at: "here" }]);
  assert.deepEqual([wrongOf(got.lines).length, restOf(got.lines).length], [1, 3]);
  // ("this device" is what the server says of the line, whatever the list of devices looks like)
  assert.deepEqual(deviceOf({ at: T0, kind: "sign-in", here: true, session: null }, []), { at: "here" });
  assert.deepEqual(deviceOf({ at: T0, kind: "sign-in", here: false, session: ID[0] }, []), { at: "gone" });
});

test("signing another device out, and all the others: what each answer means", async () => {
  for (const [answer, said] of [
    [{ status: 200, json: { ok: true, ended: 1 } }, "ok"],
    [{ status: 404, json: { ok: false, why: "no-session" } }, "gone"],
    [{ status: 401, json: { ok: false, why: "signed-out" } }, "signed-out"],
    [{ status: 403, json: { ok: false, why: "not-admitted" } }, "signed-out"],
    [{ status: 429, json: { ok: false, why: "slow-down" } }, "busy"],
    [{ status: 500, json: {} }, "server"],
    [{ status: 200, json: { ok: false } }, "server"],
    [{ status: 200, json: {} }, "server"],
    [null, "offline"],
  ] as const) {
    const asked: [string, unknown][] = [];
    assert.equal(await endDevice(canned({ "sessions/end": answer }, asked), ID[1]), said, JSON.stringify(answer));
    assert.deepEqual(asked, [["sessions/end", { id: ID[1] }]]);
  }
  for (const [answer, said] of [
    [{ status: 200, json: { ok: true, ended: 0 } }, { ok: true, ended: 0 }],
    [{ status: 200, json: { ok: true, ended: 7 } }, { ok: true, ended: 7 }],
    // (said to be done, without saying how many: not taken as done)
    [{ status: 200, json: { ok: true } }, { ok: false, why: "server" }],
    [{ status: 200, json: { ok: true, ended: "all" } }, { ok: false, why: "server" }],
    [{ status: 200, json: { ok: false, ended: 2 } }, { ok: false, why: "server" }],
    [{ status: 404, json: { ok: false, why: "no-session" } }, { ok: false, why: "server" }],
    [{ status: 401, json: {} }, { ok: false, why: "signed-out" }],
    [{ status: 403, json: {} }, { ok: false, why: "signed-out" }],
    [{ status: 429, json: {} }, { ok: false, why: "busy" }],
    [{ status: 503, json: {} }, { ok: false, why: "server" }],
    [null, { ok: false, why: "offline" }],
  ] as const) {
    const asked: [string, unknown][] = [];
    assert.deepEqual(await endOthers(canned({ "sessions/end": answer }, asked)), said, JSON.stringify(answer));
    assert.deepEqual(asked, [["sessions/end", { others: true }]]);
  }
});

test("a device's label is taken apart into the words the server made it of, so that a page can say it in its own language; anything else is left as it came", () => {
  // every label the server can make (request.ts, `labelOf`), from what a browser says of itself
  const browsers = { Edge: "Edg/131.0", Opera: "OPR/115.0", Firefox: "Firefox/133.0", Chrome: "Chrome/131.0", Safari: "Safari/605.1" };
  const systems = { iPhone: "iPhone", iPad: "iPad", Android: "Android 15", Windows: "Windows NT 10.0", ChromeOS: "X11; CrOS x86_64", Mac: "Macintosh", Linux: "X11; Linux x86_64" };
  for (const [browser, says] of Object.entries(browsers)) {
    for (const [system, on] of Object.entries(systems)) {
      const label = labelOf(`Mozilla/5.0 (${on}) ${says}`);
      assert.equal(label, `${browser} on ${system}`);
      assert.deepEqual(partsOf(label), { browser, system });
    }
    assert.deepEqual(partsOf(labelOf(`Mozilla/5.0 ${says}`)), { browser, system: null });
  }
  for (const [system, on] of Object.entries(systems)) assert.deepEqual(partsOf(labelOf(`Mozilla/5.0 (${on})`)), { browser: null, system });
  for (const nothing of ["curl/8.5.0", "", undefined, null, 7]) {
    assert.equal(labelOf(nothing), "Browser");
    assert.deepEqual(partsOf(labelOf(nothing)), { browser: null, system: null });
  }
  // a label of any other shape is not guessed at
  for (const label of ["", " ", "Brave on Windows", "Chrome on Plan 9", "chrome on windows", "Chrome on Windows on Mac", "Windows on Chrome", "Chrome  on Windows", "Chrome on  Windows", " on ", "Chrome on ", " on Windows", "Browser on Windows", "Chrome on Browser", "Chrome on Windows ", "Chrome\ton Windows", "browser", "x".repeat(60)])
    assert.equal(partsOf(label), null, JSON.stringify(label));
});

test("what is said after a device was asked to be signed out goes by the list read afterwards where the answer does not", () => {
  const other = (id: string): Device => ({ id, label: "Chrome on Windows", made: T0, seen: T0, here: false, unlocked: false });
  /** The list as read afterwards: this device, and the others named. */
  const list = (...others: string[]): Listing => ({ ok: true, devices: [{ id: ID[0], label: "Safari on iPhone", made: T0, seen: T0, here: true, unlocked: true }, ...others.map(other)], lines: [], wrong: 0 });
  const unread: Listing = { ok: false, why: "offline" };

  // one device. The server said it is signed out (or was already): that is what is said, whatever was read afterwards.
  for (const result of ["ok", "gone"] as const) for (const now of [list(), list(ID[2]), list(ID[1]), unread]) assert.deepEqual(outcomeOf(ID[1], result, now), { said: "one" });
  for (const why of ["offline", "busy", "server"] as const) {
    // no answer, or not a good one. The list no longer has it: it was done, and that is said.
    assert.deepEqual(outcomeOf(ID[1], why, list()), { said: "one" });
    assert.deepEqual(outcomeOf(ID[1], why, list(ID[2])), { said: "one" });
    // the list still has it: it was not done
    assert.deepEqual(outcomeOf(ID[1], why, list(ID[1])), { said: "not-done", why });
    assert.deepEqual(outcomeOf(ID[1], why, list(ID[2], ID[1])), { said: "not-done", why });
    // the list could not be read either: nothing is known, and nothing is claimed
    assert.deepEqual(outcomeOf(ID[1], why, unread), { said: "nothing" });
    // all the others, the same way
    assert.deepEqual(outcomeOf("others", why, list()), { said: "none" });
    assert.deepEqual(outcomeOf("others", why, list(ID[1])), { said: "not-done", why });
    assert.deepEqual(outcomeOf("others", why, list(ID[1], ID[2])), { said: "not-done", why });
    assert.deepEqual(outcomeOf("others", why, unread), { said: "nothing" });
  }
  // all the others, by the server's own count
  for (const now of [list(), list(ID[1]), unread]) {
    assert.deepEqual(outcomeOf("others", { ended: 3 }, now), { said: "others", ended: 3 });
    assert.deepEqual(outcomeOf("others", { ended: 1 }, now), { said: "others", ended: 1 });
    assert.deepEqual(outcomeOf("others", { ended: 0 }, now), { said: "none" });
  }
  // (this device is never one of the others: a list that has it alone has none, and asking after its id finds nothing to keep)
  assert.deepEqual(outcomeOf(ID[0], "offline", list(ID[1])), { said: "one" });
});
