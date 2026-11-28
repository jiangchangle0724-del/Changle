/**
 * C11 independent review (the devices' screen, at 8c4988d1): the reviewer's own tests, not the author's.
 *
 * The server's own code (account.ts, ways.ts) on Node's SQLite, and the page's reading of it (src/app/devices.ts,
 * src/app/door.ts), as tests/devices.test.ts does it, but asking what the author's tests do not: what a second tab of
 * one browser does to "holds the vault open", what the screen says after a race, what one session sees of another,
 * and whether an afternoon of noise can hide wrong tries from what is shown.
 *
 * Tests marked `todo` show a finding of docs/moneylens/reviews/devices.md and fail while it stands. The others pin
 * what the review checked and found right. Every id, label, passphrase and proof here is invented.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { listing, outcomeOf, wrongOf, type Listing } from "../src/app/devices";
import { draft, keep, lock, open, type Ask } from "../src/app/door";
import { newId } from "../src/core/ids";
import { act, proofsIn, signIn } from "../src/server/account";
import { configOf } from "../src/server/gate";
import { hashOf, newToken } from "../src/server/sessions";
import { sqlite } from "./sqlremote";

const OWNER = "uinventedowner2";
const OTHER = "uinventedother2";
const T0 = Date.UTC(2026, 10, 28, 9, 0, 0);
const MINUTE = 60_000;
const cfg = configOf({ ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: `${OWNER},${OTHER}` })!;
const PASSPHRASE = "nine patient otters weigh lanterns";

/** One account's database. `browser()` signs a browser in; `tab()` of a browser is another page with the same cookie. */
function server(account = OWNER) {
  const db = sqlite();
  let now = T0;
  const browser = async (label = "Firefox on Linux") => {
    const hash = (await hashOf(newToken()))!;
    const id = newId();
    assert.equal(signIn(db, { account, session: id, hash, label, owner: false }, now++, cfg.gate), "ok");
    const tab = (): Ask => async (action, body = {}) => {
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const proofs = await proofsIn(action, bytes);
      const answer = proofs ? act(db, { account, hash, action, body: bytes, proofs }, now++, cfg) : { status: 400, json: { ok: false, why: "bad-request" } };
      return { status: answer.status, json: JSON.parse(JSON.stringify(answer.json ?? {})) as Record<string, unknown> };
    };
    return { id, hash, tab, ask: tab() };
  };
  return { db, browser, later: (ms: number) => (now += ms), at: () => now };
}
const way = (vault: string, kind: string) => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA" }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: newToken() });

// ---------------------------------------------------------------------------------------------
// The obligations of reviews/door.md, as the page reads them
// ---------------------------------------------------------------------------------------------

test("wrong tries stay on the screen after an afternoon of noise, with their count, and are named by the device that made them", async () => {
  const s = server();
  const owner = await s.browser("Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", { vault, ways }))!.status, 200);
  // someone with the mailbox: three wrong tries, then sign-ins and sign-outs under the dozen an hour, for five hours
  const guesser = await s.browser("Chrome on Windows");
  for (let i = 0; i < 3; i++) assert.equal((await guesser.ask("vault/unlock", { id: ways[0]!.wrapper.id, proof: newToken() }))!.status, 422);
  for (let i = 0; i < 55; i++) {
    s.later(6 * MINUTE);
    const b = await s.browser("Chrome on Windows");
    await b.ask("session/end", {});
    // (the owner's and the guesser's sessions stay in use, so neither ends by itself under the thirty quiet minutes)
    await owner.ask("vault", {});
    await guesser.ask("vault", {});
  }
  const read = await listing(owner.ask);
  assert.ok(read.ok);
  assert.equal(read.wrong, 3);
  const wrong = wrongOf(read.lines);
  assert.equal(wrong.length, 3);
  // the guesser is still signed in: its tries are named by it, and it can be signed out from here
  assert.ok(wrong.every((line) => line.session === guesser.id));
  assert.ok(read.devices.some((d) => d.id === guesser.id && !d.here));
  // (and the lines are each there once)
  assert.equal(new Set(read.lines.map((l) => `${l.at}/${l.kind}`)).size, read.lines.length);
});

test("ending a device drops its unlocking in the same request, and the list says so at once", async () => {
  const s = server();
  const owner = await s.browser();
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  await owner.ask("vault/start", { vault, ways });
  const other = await s.browser("Edge on Windows");
  assert.equal((await other.ask("vault/unlock", { id: ways[0]!.wrapper.id, proof: ways[0]!.proof }))!.status, 200);
  const before = await listing(owner.ask);
  assert.ok(before.ok && before.devices.find((d) => d.id === other.id)!.unlocked);
  assert.equal((await owner.ask("sessions/end", { id: other.id }))!.status, 200);
  assert.equal((s.db.raw.prepare(`SELECT COUNT(*) AS n FROM unlocked WHERE session = ?`).all(other.id)[0] as { n: number }).n, 0);
  assert.equal((await other.ask("sync/pull", { vault, since: 0 }))!.status, 401);
});

test("one account's screen shows nothing of another account's", async () => {
  const mine = server(OWNER);
  const theirs = server(OTHER);
  const me = await mine.browser();
  const them = await theirs.browser("Opera on Android");
  await them.ask("vault/unlock", { id: newId(), proof: newToken() });
  const read = await listing(me.ask);
  assert.ok(read.ok);
  assert.deepEqual(read.devices.map((d) => d.id), [me.id]);
  assert.equal(read.lines.some((l) => l.session === them.id), false);
});

// ---------------------------------------------------------------------------------------------
// Findings (todo while each stands)
// ---------------------------------------------------------------------------------------------

test("finding 1 (resolved at 636efca8): a second tab that locks leaves its browser listed as having opened the vault, which the server knows whatever the browser says", async () => {
  const s = server();
  const owner = await s.browser("Chrome on Mac");
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(owner.ask, made.draft), "ok");
  // a second browser, with two tabs: both open the vault
  const laptop = await s.browser("Firefox on Windows");
  const [one, two] = [laptop.tab(), laptop.tab()];
  const inOne = await open(one, made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  const inTwo = await open(two, made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.ok(inOne.ok && inTwo.ok);
  // the second tab is closed, or its fifteen minutes run out: it tells the server, as App.tsx does
  await lock(two, true);
  // the first tab still holds the key in memory (`inOne.vault`), and the owner is told that browser's vault is locked
  const read = await listing(owner.ask);
  assert.ok(read.ok);
  const listed = read.devices.find((d) => d.id === laptop.id)!;
  // (its own word is that it locked; what the server knows is that it opened the vault, and that is what is listed)
  assert.deepEqual([listed.unlocked, listed.opened], [false, true]);
  // the same browser saying it locked again, or locking in every tab, does not take that away while it is signed in
  await lock(one, false);
  const again = await listing(owner.ask);
  assert.ok(again.ok && again.devices.find((d) => d.id === laptop.id)!.opened);
});

test("finding 2 (resolved at 636efca8): 'No other device is signed in' is not said above a list that shows another device", () => {
  // all the others were asked to sign out; there were none; by the time the list is read again, one has signed in
  const here = { id: newId(), label: "Safari on iPhone", made: T0, seen: T0, here: true, unlocked: true, opened: true };
  const newcomer = { id: newId(), label: "Chrome on Windows", made: T0 + 1, seen: T0 + 1, here: false, unlocked: false, opened: false };
  const now: Listing = { ok: true, devices: [here, newcomer], lines: [], wrong: 0 };
  assert.deepEqual(outcomeOf("others", { ended: 0 }, now), { said: "nothing" });
  assert.deepEqual(outcomeOf("others", { ended: 0 }, { ok: true, devices: [here], lines: [], wrong: 0 }), { said: "none" });
  // (and a failed asking over a list that still shows the other device says it was not done)
  assert.deepEqual(outcomeOf("others", "server", now), { said: "not-done", why: "server" });
  assert.deepEqual(outcomeOf(newcomer.id, "offline", now), { said: "not-done", why: "offline" });
  assert.deepEqual(outcomeOf(newcomer.id, "offline", { ok: true, devices: [here], lines: [], wrong: 0 }), { said: "one" });
});

// ---------------------------------------------------------------------------------------------
// Second look (636efca8)
// ---------------------------------------------------------------------------------------------

test("second look: the note of having opened is made on a database that was made before it, and is bounded by the sessions", async () => {
  const s = server();
  const owner = await s.browser();
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", { vault, ways }))!.status, 200);
  // a database from before the table: it is not there, and the maker is unlocked
  s.db.raw.exec("DROP TABLE opened");
  const first = await listing(owner.ask);
  assert.ok(first.ok && first.devices[0]!.opened && first.devices[0]!.unlocked);
  // twenty devices sign in, open the vault and are pushed out or sign out: what is noted never outgrows the sessions
  for (let i = 0; i < 20; i++) {
    s.later(6 * MINUTE);
    const b = await s.browser("Edge on Windows");
    assert.equal((await b.ask("vault/unlock", { id: ways[i % 2]!.wrapper.id, proof: ways[i % 2]!.proof }))!.status, 200);
    if (i % 2) await b.ask("session/end", {});
    await owner.ask("vault", {});
  }
  const noted = (s.db.raw.prepare("SELECT COUNT(*) AS n FROM opened").all()[0] as { n: number }).n;
  const live = (s.db.raw.prepare("SELECT COUNT(*) AS n FROM sessions").all()[0] as { n: number }).n;
  assert.ok(noted <= live + 1, `${noted} notes for ${live} sessions`);
  // nothing a session may do goes by the note: one that opened and locked reads nothing
  const b = await s.browser("Opera on Android");
  await b.ask("vault/unlock", { id: ways[0]!.wrapper.id, proof: ways[0]!.proof });
  await b.ask("vault/lock", {});
  assert.equal((await b.ask("sync/pull", { vault, since: 0 }))!.status, 423);
});

test("finding 3: a device that opened the vault and then signed out stays shown as such after an afternoon of signing in and out", { todo: "finding 3: 'unlocked' lines are among the newest 50 only, and 'opened' goes with the session, so an intruder who opened the vault can hide that in a few hours" }, async () => {
  const s = server();
  const owner = await s.browser("Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  await owner.ask("vault/start", { vault, ways });
  // someone who knows the passphrase opens the vault, signs out, then signs in and out under the dozen an hour
  const intruder = await s.browser("Chrome on Windows");
  assert.equal((await intruder.ask("vault/unlock", { id: ways[0]!.wrapper.id, proof: ways[0]!.proof }))!.status, 200);
  await intruder.ask("session/end", {});
  for (let i = 0; i < 55; i++) {
    s.later(6 * MINUTE);
    const b = await s.browser("Chrome on Windows");
    await b.ask("session/end", {});
    await owner.ask("vault", {});
  }
  const read = await listing(owner.ask);
  assert.ok(read.ok);
  const shown = read.devices.some((d) => !d.here && d.opened) || read.lines.some((l) => l.kind === "unlocked" && l.session === intruder.id);
  assert.ok(shown, "nothing on the screen says that another device opened the vault");
});
